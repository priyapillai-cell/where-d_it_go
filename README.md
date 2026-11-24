# Where'd It Go?

A fast, offline-first personal expense tracker inspired by Monefy. Everything is stored on the
device in SQLite: no sign-up, no backend server, no ads and no analytics. Optionally, the app
syncs with the user's own Google Drive.

- Home donut chart by category with a period selector (day, week, month, year, all, custom)
- Quick add in three taps or fewer, with a calculator keypad and Undo
- Transactions list for 10k+ rows (FlashList) with search, filters and swipe-to-delete
- Accounts with multiple currencies, transfers between them (with a manual exchange rate),
  archive and reorder
- Categories with icon and colour pickers, reorder and archive (history is kept)
- Monthly budgets (overall and per category) with progress bars and local alerts at 80% and 100%
- Recurring income and expenses, generated on app open and by a background task, with reminders
- A sinking fund for occasional big expenses, with its own required monthly budget and
  categories (gifts, vacation, wedding and more) that each take expenses and added funds, have
  an optional target and show six-month graphs. Settings choose where leftovers go: the main
  budget's to next month or into the sinking fund, the sinking fund budget's to next month or
  kept saved. An optional Overview card shows the whole fund as one graph.
- Google Drive (iOS): two-way sync between devices, daily backups kept for 30 days, and an
  always up-to-date `Where'd It Go.xlsx` spreadsheet in a "Where'd It Go" folder
- Reports: spending by category, income vs expenses, balance over time, this month vs last month
- Settings: currency, theme, language, first day of week/month, passcode and biometric lock,
  CSV and Excel export, CSV import with column mapping, JSON backup/restore and the share sheet, delete all data

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

### Web preview

For a quick check without Xcode or Android Studio, run the app in a browser:

```bash
npm run web        # opens http://localhost:8081
```

On web, data is stored in the browser, and notifications, background tasks, biometrics and the
secure passcode store are unavailable or limited. Use a device build to validate those.

## Google Drive setup

Drive sync signs in with Google directly from the app (OAuth with PKCE, no client secret and no
server). It needs a Google Cloud OAuth client tied to your bundle id, and a development or
production build: **Google sign-in does not work in Expo Go**. It is available on iPhone and
iPad; Android and web show it as unavailable.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. **APIs & Services → Library**: enable the **Google Drive API**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform): choose **External**, fill in
   the app name and support email, and add the scopes `.../auth/drive.appdata` and
   `.../auth/drive.file`. While the app is in **Testing**, add each Google account that will
   sign in under **Test users** (up to 100).
4. **Credentials → Create credentials → OAuth client ID → iOS**: enter your bundle id (for
   example `com.yourname.pocketledger`). Copy the client ID.
5. Create `.env.local` from `.env.example`:

   ```bash
   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
   APP_BUNDLE_ID=com.yourname.pocketledger
   ```

6. Rebuild the native app (the client ID is also registered as a URL scheme):

   ```bash
   npx expo prebuild --clean --platform ios
   npx expo run:ios --device   # pick your iPhone (connected by cable, Developer Mode on)
   ```

   Xcode needs a signing team: open `ios/*.xcworkspace`, select the target, **Signing &
   Capabilities → Team** (a free Apple ID works for your own devices).

Then open **Settings → Google Drive → Connect Google account**. The app only requests access to
its own hidden app folder (sync file and backups) and to files it creates (the spreadsheet); it
cannot read anything else in the user's Drive.

How it behaves:

- **Sync** runs on app open, when the app returns to the foreground, about 15 seconds after an
  edit, from the background task, and with **Sync now**. Each record carries a change time; the
  most recent edit wins, and deletions travel as tombstones.
- **First connection**: with an empty Drive, this device's data is uploaded. If Drive already has
  data and this device has none of its own, the Drive data is downloaded. If both have data, the
  app asks whether to **combine both** or **use the Drive data**.
- **Backups**: one JSON backup per day in the hidden app folder, the newest 30 are kept, and any
  of them can be restored from the Google Drive screen. A restore propagates to other devices.
- **Spreadsheet**: refreshed after each sync that changed something, in the same format as the
  Excel export. Edits made to that file in Drive are not read back.
- **Disconnect** or **Delete all data** stop sync on this device and revoke the app's access; the
  copy in Drive is kept.

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

Set `APP_BUNDLE_ID` (see `.env.example`), or `ios.bundleIdentifier` and `android.package` in
`app.json` (currently `com.example.pocketledger`), to your own identifier first. For Drive sync
in production builds, set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` as an EAS environment variable and
publish the OAuth consent screen so accounts other than the test users can sign in.

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
  services/google/          Google sign-in, Drive REST client, sync file, backups, spreadsheet
  test/                     Test database, factories and a fake Drive API
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
| `SinkingFund`   | savings goal with currency, optional target amount, target date and monthly plan; archived, sort order. Not part of account balances.         |
| `FundEntry`     | deposit into or spend from a fund, with amount, note and date.                                                                                |
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
- **Sync needs no code in repositories.** SQLite triggers record every insert, update and delete
  of synced tables in a change log (`sync_changes`). Seed rows and recurring occurrences get
  deterministic ids, so two devices never create duplicates of the same default category or
  scheduled payment. Remote changes that would break a reference (for example a category
  deleted on one phone while another phone used it) are rejected locally and the surviving row
  is pushed back, so all devices converge.
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
- **Excel export** (`.xlsx`, Office Open XML) opens in Excel 2007 and later, Excel for Mac and
  mobile, Google Sheets, Apple Numbers and LibreOffice. It has four sheets: Transactions (real
  date cells and numeric amounts, signed so a column sum is the net change), Monthly summary,
  By category and Accounts. Totals are grouped per currency, and every cell is a literal value,
  never a formula.
- **CSV import** auto-detects `,`, `;` or tab delimiters and guesses the column mapping and date
  format, then shows a review with per-row errors before importing. Rows with a negative amount
  and no type column become expenses. Unknown categories are created; up to 50,000 rows and
  10 MB per file.
- **Excel export** has a **Sinking fund transactions** sheet right after Transactions and a **Sinking fund** summary sheet at the end when the sinking fund has categories. The **CSV export** lists sinking fund entries alongside transactions with the type `fund_add` or `fund_spend` and the sinking fund category in the category column; **Import from CSV** reads them back into the sinking fund, creating missing categories.
- **JSON backups** contain all data and are validated with a schema (including referential
  integrity) before anything is replaced.

## Bank messages

iOS does not let apps read text messages, so transactions come in two ways:

- **Paste:** the message icon on the Overview (and on Transactions) opens "Add from bank message".
  `src/domain/bankMessage.ts` reads the amount and currency (`INR`, `Rs.`, `₹`, `$`, `€`, …,
  skipping balances and limits), debit or credit, the merchant (a UPI ID is cut at the `@`), a
  day-first date and the account or card digits, and suggests a default category from the
  merchant (Swiggy → Eating out, Uber → Transport, …). OTPs, reminders, requests and declined
  payments are ignored. "Check and save" opens the normal editor, filled in; nothing is saved
  until you tap Save. Messages are read on the device only.
- **iPhone Shortcuts:** a personal automation ("When I get a message containing debited", Run
  Immediately) can URL-encode the message and open
  `whereditgo://from-message?text=<encoded message>`, which goes straight to the filled-in editor.
  The steps are listed on the "Add from bank message" screen. The `whereditgo` scheme is new, so
  it needs a fresh development build; `pocketledger://` keeps working.

## Known limitations

- Only English strings ship today, although all text goes through `src/i18n` and formatting
  follows the device locale.
- No automatic exchange rates: cross-currency transfers use the rate you enter, and totals are
  per currency.
- Background generation relies on the OS scheduler (`expo-background-task`), which may run
  rarely or not at all on some devices; due payments are always caught up on the next app open.
- Budgets are monthly only and count expenses in accounts matching the budget's currency.
- Local backups are files on the device; use Google Drive or the share sheet to keep a copy
  elsewhere.
- Google Drive sync is iOS only for now. Android needs its own OAuth client (package name and
  SHA-1) and the web build has no secure place for a refresh token.
- Sync resolves conflicts per record by change time, so a device with a badly wrong clock can
  win or lose edits unexpectedly. Deletions are remembered for 180 days; a device offline for
  longer can bring deleted records back.
- Settings (currency, theme, lock) are per device and are not synced.
- Reorder uses up/down buttons rather than drag and drop.
- Recurring rules support expenses and income; recurring transfers are modelled but not exposed
  in the UI.

## Next features

- Additional languages and right-to-left layout checks
- Optional exchange-rate table to show a combined net worth
- Drag-and-drop reordering and home-screen widgets
- Weekly and yearly budgets, budget rollover
- Attachments (receipt photos) and tags
- Encrypted backup files
- Google Drive sync on Android
