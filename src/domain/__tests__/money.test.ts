import {
  convertAmount,
  currencyFractionDigits,
  formatMoney,
  isValidCurrencyCode,
  parseAmount,
  toMajorString,
} from '../money';

describe('currencyFractionDigits', () => {
  it.each([
    ['USD', 2],
    ['EUR', 2],
    ['JPY', 0],
    ['KWD', 3],
  ])('%s has %i digits', (code, digits) => {
    expect(currencyFractionDigits(code)).toBe(digits);
  });
});

describe('formatMoney', () => {
  it('formats minor units with the currency symbol', () => {
    expect(formatMoney(123456, 'USD', { locale: 'en-US' })).toBe('$1,234.56');
    expect(formatMoney(1500, 'JPY', { locale: 'en-US' })).toBe('¥1,500');
  });

  it('respects sign display', () => {
    expect(formatMoney(-500, 'USD', { locale: 'en-US' })).toBe('-$5.00');
    expect(formatMoney(500, 'USD', { locale: 'en-US', signDisplay: 'always' })).toBe('+$5.00');
  });

  it('uses locale grouping', () => {
    expect(formatMoney(12345678, 'INR', { locale: 'en-IN' })).toBe('₹1,23,456.78');
  });
});

describe('toMajorString', () => {
  it('produces plain decimals without floats', () => {
    expect(toMajorString(5, 'USD')).toBe('0.05');
    expect(toMajorString(-123456, 'USD')).toBe('-1234.56');
    expect(toMajorString(1500, 'JPY')).toBe('1500');
    expect(toMajorString(1, 'KWD')).toBe('0.001');
  });
});

describe('parseAmount', () => {
  it('parses common formats', () => {
    expect(parseAmount('12.34', 'USD')).toBe(1234);
    expect(parseAmount('1,234.56', 'USD')).toBe(123456);
    expect(parseAmount('1.234,56', 'EUR', { decimalSeparator: ',' })).toBe(123456);
    expect(parseAmount('-12', 'USD')).toBe(-1200);
    expect(parseAmount('(9.99)', 'USD')).toBe(-999);
    expect(parseAmount('$ 9.99', 'USD')).toBe(999);
    expect(parseAmount('0.1', 'USD')).toBe(10);
  });

  it('rounds extra precision half away from zero', () => {
    expect(parseAmount('0.005', 'USD')).toBe(1);
    expect(parseAmount('0.004', 'USD')).toBe(0);
    expect(parseAmount('1.5', 'JPY')).toBe(2);
  });

  it('rejects malformed input', () => {
    for (const bad of ['', 'abc', '1.2.3', '.', '--5', '1e5', '12abc34']) {
      expect(parseAmount(bad, 'USD')).toBeNull();
    }
    expect(parseAmount('-5', 'USD', { allowNegative: false })).toBeNull();
    expect(parseAmount('99999999999999999999', 'USD')).toBeNull();
  });
});

describe('convertAmount', () => {
  it('applies a manual rate across differing minor units', () => {
    expect(convertAmount(10000, 'USD', 'EUR', '0.92')).toBe(9200);
    expect(convertAmount(10000, 'USD', 'JPY', '151.234')).toBe(15123);
    expect(convertAmount(1500, 'JPY', 'USD', '0.0066')).toBe(990);
  });

  it('rejects invalid rates', () => {
    expect(convertAmount(100, 'USD', 'EUR', '0')).toBeNull();
    expect(convertAmount(100, 'USD', 'EUR', 'abc')).toBeNull();
    expect(convertAmount(100, 'USD', 'EUR', '-1')).toBeNull();
  });
});

it('validates ISO codes', () => {
  expect(isValidCurrencyCode('USD')).toBe(true);
  expect(isValidCurrencyCode('usd')).toBe(false);
  expect(isValidCurrencyCode('US')).toBe(false);
});
