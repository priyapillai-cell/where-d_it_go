import { COMMON_CURRENCIES, currencyChoices, isPrimaryCurrency } from '../currencies';

it('offers rupee, dollar and euro first, without duplicates', () => {
  const choices = currencyChoices();
  expect(choices.slice(0, 3)).toEqual(['INR', 'USD', 'EUR']);
  expect(new Set(choices).size).toBe(choices.length);
  expect(choices).toHaveLength(COMMON_CURRENCIES.length);
});

it('keeps an unlisted current currency selectable', () => {
  expect(currencyChoices('XOF')[0]).toBe('XOF');
  expect(currencyChoices('GBP')).toEqual(currencyChoices());
});

it('recognises the primary currencies', () => {
  expect(isPrimaryCurrency('INR')).toBe(true);
  expect(isPrimaryCurrency('GBP')).toBe(false);
});
