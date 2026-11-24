import { makeAccount, makeCategory } from '@/test/factories';

import { bankMessageDraft, parseBankMessage } from '../bankMessage';

const NOW = new Date(2026, 10, 24, 18, 30);

describe('parseBankMessage', () => {
  it('reads a card purchase', () => {
    const parsed = parseBankMessage(
      'INR 450.00 spent on HDFC Bank Card XX1234 at SWIGGY on 2026-11-24:13:05:11. Avl Lmt: INR 85,000.00',
      'INR',
    );
    expect(parsed).toEqual({
      type: 'expense',
      amount: 45000,
      currency: 'INR',
      merchant: 'SWIGGY',
      day: new Date(2026, 10, 24),
      accountDigits: '1234',
      categoryKey: 'eatingOut',
    });
  });

  it('reads a UPI debit without a currency and takes the name before the @', () => {
    const parsed = parseBankMessage(
      'Dear UPI user A/C X5678 debited by 120.0 on date 23Nov26 trf to uber.india@axis Refno 412345678901',
      'INR',
    );
    expect(parsed).toMatchObject({
      type: 'expense',
      amount: 12000,
      currency: 'INR',
      merchant: 'uber.india',
      day: new Date(2026, 10, 23),
      accountDigits: '5678',
      categoryKey: 'transport',
    });
  });

  it('reads "Rs." amounts and a merchant named before "credited"', () => {
    const parsed = parseBankMessage(
      'ICICI Bank Acct XX901 debited for Rs 1,299.00 on 22-Nov-26; ZEPTO credited. UPI:432100001111.',
      'INR',
    );
    expect(parsed).toMatchObject({
      type: 'expense',
      amount: 129900,
      merchant: 'ZEPTO',
      day: new Date(2026, 10, 22),
      categoryKey: 'food',
    });
  });

  it('reads a salary credit and ignores the balance amount', () => {
    const parsed = parseBankMessage(
      'Your A/c XX4321 is credited with Rs.85,000.00 on 01/11/2026 by SALARY ACME LTD. Avl Bal Rs.1,02,500.00',
      'INR',
    );
    expect(parsed).toMatchObject({
      type: 'income',
      amount: 8500000,
      merchant: 'SALARY ACME LTD',
      day: new Date(2026, 10, 1),
      categoryKey: 'salary',
    });
  });

  it('reads a "Sent" UPI message', () => {
    const parsed = parseBankMessage(
      'Sent Rs.250.00 from Kotak Bank AC X1111 to zomato@hdfcbank on 24-11-26. UPI Ref 431234567890',
      'INR',
    );
    expect(parsed).toMatchObject({ type: 'expense', amount: 25000, merchant: 'zomato' });
  });

  it('skips the balance when it comes first', () => {
    const parsed = parseBankMessage(
      'Avl Bal INR 9,000.00. INR 300.00 debited from A/c XX22',
      'INR',
    );
    expect(parsed?.amount).toBe(30000);
  });

  it('reads amounts with the currency after the number and other currencies', () => {
    expect(
      parseBankMessage('Card ending 9876 charged 12.50 USD at STARBUCKS', 'INR'),
    ).toMatchObject({
      amount: 1250,
      currency: 'USD',
      merchant: 'STARBUCKS',
    });
    expect(parseBankMessage('€40.00 paid to Netflix', 'INR')).toMatchObject({
      currency: 'EUR',
      categoryKey: 'entertainment',
    });
  });

  it('does not read "credit card" as income', () => {
    expect(
      parseBankMessage('Rs 999 spent on your SBI Credit Card ending 4455 at MYNTRA', 'INR'),
    ).toMatchObject({ type: 'expense', categoryKey: 'clothes' });
  });

  it('rejects messages that are not a finished transaction', () => {
    for (const text of [
      '123456 is your OTP for a transaction of INR 500.00 at AMAZON',
      'Rs 1,500 will be debited from your account on 01-12-26 for LIC',
      'Your bill of Rs 799 is due on 28-11-26',
      'Abc has requested Rs 200 from you on UPI',
      'Transaction of Rs 300 at FLIPKART declined',
      'Happy Diwali from your bank!',
      'Rs 500 to be paid',
    ]) {
      expect(parseBankMessage(text, 'INR')).toBeNull();
    }
  });

  it('leaves out what the message does not say', () => {
    expect(parseBankMessage('Rs 75 debited from your account', 'INR')).toMatchObject({
      merchant: null,
      day: null,
      categoryKey: null,
    });
  });

  it('ignores impossible dates', () => {
    expect(parseBankMessage('Rs 75 debited on 31-02-26', 'INR')?.day).toBeNull();
  });
});

describe('bankMessageDraft', () => {
  const cash = makeAccount({ id: 'cash', name: 'Cash', currency: 'INR' });
  const hdfc = makeAccount({ id: 'hdfc', name: 'HDFC 1234', currency: 'INR' });
  const usd = makeAccount({ id: 'usd', name: 'Travel card', currency: 'USD' });
  const eatingOut = makeCategory({ id: 'seed:eatingOut', type: 'expense' });
  const options = {
    accounts: [cash, hdfc, usd],
    categories: [eatingOut],
    seedCategoryId: (key: string) => `seed:${key}`,
    now: NOW,
  };
  const message = {
    type: 'expense' as const,
    amount: 45000,
    currency: 'INR',
    merchant: 'SWIGGY',
    day: new Date(2026, 10, 24),
    accountDigits: '1234',
    categoryKey: 'eatingOut',
  };

  it('picks the account named with the same digits and the suggested category', () => {
    expect(bankMessageDraft(message, options)).toEqual({
      type: 'expense',
      amount: 45000,
      accountId: 'hdfc',
      categoryId: 'seed:eatingOut',
      date: NOW.toISOString(),
      note: 'SWIGGY',
      currencyMismatch: false,
    });
  });

  it('falls back to the first account in the same currency', () => {
    const draft = bankMessageDraft({ ...message, accountDigits: '0000' }, options);
    expect(draft.accountId).toBe('cash');
  });

  it('uses another currency only when no account matches, and says so', () => {
    const draft = bankMessageDraft(
      { ...message, currency: 'EUR' },
      { ...options, accounts: [usd] },
    );
    expect(draft).toMatchObject({ accountId: 'usd', currencyMismatch: true });
  });

  it('dates earlier messages at noon on their day and never in the future', () => {
    expect(bankMessageDraft({ ...message, day: new Date(2026, 10, 20) }, options).date).toBe(
      new Date(2026, 10, 20, 12).toISOString(),
    );
    expect(bankMessageDraft({ ...message, day: new Date(2026, 11, 5) }, options).date).toBe(
      NOW.toISOString(),
    );
    expect(bankMessageDraft({ ...message, day: null }, options).date).toBe(NOW.toISOString());
  });

  it('skips archived or mismatched suggested categories', () => {
    const archived = { ...eatingOut, isArchived: true };
    expect(bankMessageDraft(message, { ...options, categories: [archived] }).categoryId).toBeNull();
    expect(bankMessageDraft({ ...message, type: 'income' }, options).categoryId).toBeNull();
  });
});
