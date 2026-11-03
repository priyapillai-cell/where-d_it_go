import {
  applyKey,
  evaluateExpression,
  expressionFromMinor,
  hasOperator,
  type KeypadKey,
} from '../calculator';

function press(keys: readonly KeypadKey[], digits = 2): string {
  return keys.reduce((expr, key) => applyKey(expr, key, digits), '');
}

const ok = (value: number) => ({ ok: true, value });

describe('applyKey', () => {
  it('builds numbers and operators', () => {
    expect(press(['1', '2', '.', '5', '+', '3'])).toBe('12.5+3');
  });

  it('ignores a leading operator and replaces consecutive operators', () => {
    expect(press(['+', '5'])).toBe('5');
    expect(press(['5', '+', '×', '2'])).toBe('5×2');
  });

  it('allows one decimal point per operand and limits fraction digits', () => {
    expect(press(['1', '.', '.', '2', '3', '4'])).toBe('1.23');
    expect(press(['1', '.', '5', '+', '.', '5'])).toBe('1.5+0.5');
    expect(press(['1', '.', '5'], 0)).toBe('15');
  });

  it('avoids leading zeros', () => {
    expect(press(['0', '0', '7'])).toBe('7');
  });

  it('supports backspace and clear', () => {
    expect(press(['1', '2', 'backspace'])).toBe('1');
    expect(press(['1', '+', '2', 'clear'])).toBe('');
  });
});

describe('evaluateExpression', () => {
  it('evaluates plain amounts into minor units', () => {
    expect(evaluateExpression('12.5', 2)).toEqual(ok(1250));
    expect(evaluateExpression('1500', 0)).toEqual(ok(1500));
  });

  it('respects operator precedence', () => {
    expect(evaluateExpression('2+3×4', 2)).toEqual(ok(1400));
    expect(evaluateExpression('10-4÷2', 2)).toEqual(ok(800));
    expect(evaluateExpression('2×3+4×5', 2)).toEqual(ok(2600));
  });

  it('uses exact arithmetic (no float drift)', () => {
    expect(evaluateExpression('0.1+0.2', 2)).toEqual(ok(30));
    expect(evaluateExpression('10÷3', 2)).toEqual(ok(333));
    expect(evaluateExpression('20÷3', 2)).toEqual(ok(667));
    expect(evaluateExpression('1.15×3', 2)).toEqual(ok(345));
  });

  it('ignores a trailing operator', () => {
    expect(evaluateExpression('12+', 2)).toEqual(ok(1200));
  });

  it('reports errors instead of throwing', () => {
    expect(evaluateExpression('', 2)).toEqual({ ok: false, error: 'empty' });
    expect(evaluateExpression('5÷0', 2)).toEqual({ ok: false, error: 'divisionByZero' });
    expect(evaluateExpression('5+abc', 2)).toEqual({ ok: false, error: 'invalid' });
    expect(evaluateExpression('++', 2)).toEqual({ ok: false, error: 'invalid' });
  });

  it('can produce non-positive results for the caller to reject', () => {
    expect(evaluateExpression('5-8', 2)).toEqual(ok(-300));
  });
});

describe('helpers', () => {
  it('detects operators after the first character', () => {
    expect(hasOperator('12')).toBe(false);
    expect(hasOperator('12+3')).toBe(true);
  });

  it('round-trips stored amounts into editable expressions', () => {
    expect(expressionFromMinor(1250, 2)).toBe('12.5');
    expect(expressionFromMinor(1200, 2)).toBe('12');
    expect(expressionFromMinor(5, 2)).toBe('0.05');
    expect(expressionFromMinor(1500, 0)).toBe('1500');
    expect(expressionFromMinor(0, 2)).toBe('');
  });
});
