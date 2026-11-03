# Pocket Ledger

A fast, offline-first personal expense tracker inspired by Monefy. Everything is stored on the
device in SQLite: no accounts, no cloud backend, no ads and no analytics.

- Home donut chart by category with a period selector (day, week, month, year, all, custom)
- Quick add in three taps or fewer, with a calculator keypad and Undo
- Transactions list for 10k+ rows (FlashList) with search, filters and swipe-to-delete
- Accounts with multiple currencies, transfers between them (with a manual exchange rate),
  archive and reorder
- Categories with icon and colour pickers, reorder and archive (history is kept)
- Monthly budgets (overall and per category) with progress bars and local alerts at 80% and 100%
- Recurring income and expenses, generated on app open and by a background task, with reminders
- Reports: spending by category, income vs expenses, balance over time, this month vs last month
- Settings: currency, theme, language, first day of week/month, passcode and biometric lock,
  CSV export/import with column mapping, JSON backup/restore and the share sheet, delete all data

## Requirements

- Node.js 20 or newer and npm
- For iOS: macOS with Xcode 26+ and CocoaPods, or an EAS account for cloud builds
- For Android: Android Studio with an SDK and an emulator or a device, or an EAS account

The app uses native modules that are not all included in Expo Go (background tasks, secure
store, notifications), so it runs in a **development build**.

## Setup

```bash
npm install
```

## Run

```bash
# Build and launch a development build (generates ios/ and android/ via prebuild)
npm run ios        # npx expo run:ios
npm run android    # npx expo run:android

# Afterwards, start just the dev server for the installed dev build
npm start
```

Without local toolchains, build a development client in the cloud:

```bash
npx eas-cli@latest build --profile development --platform ios|android
```

## Test and lint

```bash
npm test            # Jest unit tests (domain, repositories and services against in-memory SQLite)
npm run typecheck   # tsc --noEmit (strict, no `any`)
npm run lint        # ESLint (expo config + React Compiler rules + Prettier compatibility)
npm run format      # Prettier
npm run verify      # all of the above
npm run doctor      # expo-doctor dependency/config checks
```

Repository and service tests run against real SQLite through `better-sqlite3` behind the same
driver interface the app uses, so SQL, constraints and transactions are exercised without a
device.

## Production builds

```bash
npx eas-cli@latest build --profile production --platform all
```

Set `ios.bundleIdentifier` and `android.package` in `app.json` (currently
`com.example.pocketledger`) to your own identifiers first.

## Project structure

```
index.ts                    Entry: registers the background task, then expo-router
src/
  app/                      Routes only (expo-router)
    _layout.tsx             Providers, root stack, startup gate, toasts, lock screen
    (drawer)/               Overview, Transactions, Accounts, Categories, Budgets,
                            Recurring, Reports, Settings
    transaction.tsx …       Modal routes: quick add/edit, transfer, filters, editors,
                            passcode, CSV import, backups
  domain/                   Pure TypeScript: types, money, calculator, periods, aggregation,
                            balances, budgets, recurrence, CSV, backup schema, validation
  db/                       SQLite driver, migrations, seed data, repositories (SQL only)
  services/                 Use cases: saving, recurring generation, budgets/alerts,
                            reminders, import/export, backups, security, notifications
  state/                    Zustand stores (cached settings/accounts/categories, UI state)
  i18n/                     English strings and locale-aware money/date formatting
  ui/                       Theme, reusable components, charts, hooks and screens
  test/                     Test database and factories
```

Dependencies point one way: `ui → state/services → db → domain`. The domain layer has no
React Native imports and is fully unit-tested.

## Data model

All amounts are **integers in minor units** of the account currency (cents, yen, fils…); the
calculator and CSV parser use exact rational arithmetic, so there is no floating-point drift.
Dates are ISO-8601 UTC strings and are bucketed in the device's local time zone.

| Entity          | Notes                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Account`       | name, ISO currency, initial balance, colour, icon, include in total, archived, sort order. Balance = initial + income − expenses ± transfers. |
| `Category`      | name, expense/income, icon, colour, sort order, archived (archived categories keep their history).                                            |
| `Transaction`   | expense/income/transfer, amount, account, destination account and received amount for transfers, category, note, date, recurring rule link.   |
| `RecurringRule` | transaction template plus frequency, interval, start/end date, generation watermark, reminder days, active flag.                              |
| `Budget`        | monthly limit for all expenses (`categoryId = null`) or one category, in one currency.                                                        |
| `Settings`      | default currency, first day of week/month, theme, language, passcode and biometrics flags.                                                    |

Indexes cover transaction date, account, destination account and category. Every multi-step
write (transfers, reorders, imports, restores, recurring generation) runs in one database
transaction.

Design decisions worth knowing:

- **Transfers are one row** with `amount` (sent) and `toAmount` (received), so a transfer can
  never be half-written. Cross-currency transfers store both amounts; the exchange rate is
  only an input aid.
- **Currencies are never summed together.** "All accounts" covers accounts in the default
  currency; totals elsewhere are shown per currency.
- **Recurring generation is idempotent**: a unique `(rule, occurrence)` index plus a per-rule
  watermark updated in the same transaction. Running it twice, concurrently, or after an edit
  never duplicates a payment, and a deleted generated payment is not recreated.
- **The passcode hash never touches SQLite or backups.** A salted SHA-256 is stored in the OS
  keychain/keystore with attempt throttling; restoring a backup never changes lock settings.

## Seed data

On first launch the app creates a **Cash** account in the device's currency and default
categories:

- Expense: Food, Eating out, Bills, House, Transport, Car, Clothes, Health, Entertainment,
  Communications, Gifts, Pets, Toiletry, Sports
- Income: Salary, Deposits, Savings, Other income

## Import and export formats

- **CSV export** uses a stable header: `date,type,amount,currency,account,category,note,to_account,to_amount,to_currency`.
  Cells that a spreadsheet could interpret as formulas are neutralised.
- **CSV import** auto-detects `,`, `;` or tab delimiters and guesses the column mapping and date
  format, then shows a review with per-row errors before importing. Rows with a negative amount
  and no type column become expenses. Unknown categories are created; up to 50,000 rows and
  10 MB per file.
- **JSON backups** contain all data and are validated with a schema (including referential
  integrity) before anything is replaced.

## Known limitations

- Only English strings ship today, although all text goes through `src/i18n` and formatting
  follows the device locale.
- No automatic exchange rates: cross-currency transfers use the rate you enter, and totals are
  per currency.
- Background generation relies on the OS scheduler (`expo-background-task`), which may run
  rarely or not at all on some devices; due payments are always caught up on the next app open.
- Budgets are monthly only and count expenses in accounts matching the budget's currency.
- Backups are local files; keeping a copy elsewhere is manual through the share sheet.
- Reorder uses up/down buttons rather than drag and drop.
- Recurring rules support expenses and income; recurring transfers are modelled but not exposed
  in the UI.

## Next features

- Additional languages and right-to-left layout checks
- Optional exchange-rate table to show a combined net worth
- Drag-and-drop reordering and home-screen widgets
- Weekly and yearly budgets, budget rollover
- Attachments (receipt photos) and tags
- Encrypted backup files and scheduled automatic backups
