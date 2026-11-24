import { add, div, mul, parseDecimal, type Rational, sub, toMinorUnits } from './rational';
import { err, ok, type MinorUnits, type Result } from './types';

export type Operator = '+' | '-' | '×' | '÷';
export type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type KeypadKey = Digit | '.' | Operator | 'backspace' | 'clear';

export const OPERATORS: readonly Operator[] = ['+', '-', '×', '÷'];
const MAX_EXPRESSION_LENGTH = 32;
const MAX_INTEGER_DIGITS = 12;

export function isOperator(char: string | undefined): char is Operator {
  return char === '+' || char === '-' || char === '×' || char === '÷';
}

function currentOperand(expression: string): string {
  let i = expression.length - 1;
  while (i >= 0 && !isOperator(expression[i])) i -= 1;
  return expression.slice(i + 1);
}

/**
 * Applies one keypad press to the expression and returns the new expression.
 * Invalid presses (second decimal point, too many fraction digits, leading operator)
 * are ignored rather than producing an invalid state.
 */
export function applyKey(expression: string, key: KeypadKey, fractionDigits: number): string {
  if (key === 'clear') return '';
  if (key === 'backspace') return expression.slice(0, -1);

  const operand = currentOperand(expression);
  const last = expression[expression.length - 1];

  if (isOperator(key)) {
    if (expression === '') return expression;
    if (isOperator(last)) return expression.slice(0, -1) + key;
    return expression.length >= MAX_EXPRESSION_LENGTH ? expression : expression + key;
  }

  if (expression.length >= MAX_EXPRESSION_LENGTH) return expression;

  if (key === '.') {
    if (fractionDigits === 0 || operand.includes('.')) return expression;
    return expression + (operand === '' ? '0.' : '.');
  }

  const [intPart = '', fracPart] = operand.split('.');
  if (fracPart !== undefined) {
    return fracPart.length >= fractionDigits ? expression : expression + key;
  }
  if (intPart === '0') return expression.slice(0, -1) + key;
  if (intPart.length >= MAX_INTEGER_DIGITS) return expression;
  return expression + key;
}

export function hasOperator(expression: string): boolean {
  return [...expression.slice(1)].some((c) => isOperator(c));
}

export type CalculatorError = 'empty' | 'invalid' | 'divisionByZero' | 'outOfRange';

type Token = { kind: 'number'; value: Rational } | { kind: 'op'; op: Operator };

function tokenize(expression: string): Token[] | null {
  const tokens: Token[] = [];
  let buffer = '';
  for (const char of expression) {
    if (isOperator(char)) {
      if (buffer === '') return null;
      const value = parseDecimal(buffer);
      if (!value) return null;
      tokens.push({ kind: 'number', value }, { kind: 'op', op: char });
      buffer = '';
    } else if (/[\d.]/.test(char)) {
      buffer += char;
    } else {
      return null;
    }
  }
  if (buffer !== '') {
    const value = parseDecimal(buffer);
    if (!value) return null;
    tokens.push({ kind: 'number', value });
  } else if (tokens.length > 0) {
    tokens.pop();
  }
  return tokens;
}

function applyOp(a: Rational, op: Operator, b: Rational): Rational {
  switch (op) {
    case '+':
      return add(a, b);
    case '-':
      return sub(a, b);
    case '×':
      return mul(a, b);
    case '÷':
      return div(a, b);
    default: {
      const unreachable: never = op;
      throw new Error(`Unknown operator ${String(unreachable)}`);
    }
  }
}

/**
 * Evaluates a keypad expression with standard precedence (× ÷ before + −) using exact
 * rational arithmetic, then rounds once to the currency's minor unit. A trailing operator
 * is ignored so "12+" evaluates to 12.
 */
export function evaluateExpression(
  expression: string,
  fractionDigits: number,
): Result<MinorUnits, CalculatorError> {
  if (expression.trim() === '') return err('empty');
  const tokens = tokenize(expression);
  if (!tokens || tokens.length === 0) return err('invalid');

  try {
    const terms: Rational[] = [];
    const additive: Operator[] = [];
    let current: Rational | null = null;
    let pending: Operator | null = null;
    for (const token of tokens) {
      if (token.kind === 'number') {
        current = current && pending ? applyOp(current, pending, token.value) : token.value;
        pending = null;
      } else if (token.op === '×' || token.op === '÷') {
        pending = token.op;
      } else {
        if (!current) return err('invalid');
        terms.push(current);
        additive.push(token.op);
        current = null;
      }
    }
    if (!current) return err('invalid');
    terms.push(current);

    let total = terms[0] as Rational;
    additive.forEach((op, i) => {
      total = applyOp(total, op, terms[i + 1] as Rational);
    });
    const minor = Number(toMinorUnits(total, fractionDigits));
    if (!Number.isSafeInteger(minor)) return err('outOfRange');
    return ok(minor);
  } catch (e) {
    if (e instanceof RangeError) return err('divisionByZero');
    return err('invalid');
  }
}

/** Builds an editable expression from a stored amount, e.g. 1250 (USD) -> "12.5". */
export function expressionFromMinor(amount: MinorUnits, fractionDigits: number): string {
  if (!Number.isSafeInteger(amount) || amount <= 0) return '';
  if (fractionDigits === 0) return String(amount);
  const padded = String(amount).padStart(fractionDigits + 1, '0');
  const intPart = padded.slice(0, -fractionDigits);
  const fracPart = padded.slice(-fractionDigits).replace(/0+$/, '');
  return fracPart === '' ? intPart : `${intPart}.${fracPart}`;
}
