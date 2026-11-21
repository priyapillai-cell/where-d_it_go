import type { ExcelExportLabels } from '@/domain/excelExport';

import { t } from './index';

export function excelLabels(): ExcelExportLabels {
  return {
    sheets: {
      transactions: t('excel.sheetTransactions'),
      monthly: t('excel.sheetMonthly'),
      categories: t('excel.sheetCategories'),
      accounts: t('excel.sheetAccounts'),
    },
    columns: {
      date: t('excel.date'),
      type: t('excel.type'),
      category: t('excel.category'),
      amount: t('excel.amount'),
      currency: t('excel.currency'),
      account: t('excel.account'),
      note: t('excel.note'),
      toAccount: t('excel.toAccount'),
      toAmount: t('excel.toAmount'),
      toCurrency: t('excel.toCurrency'),
      month: t('excel.month'),
      income: t('excel.income'),
      expenses: t('excel.expenses'),
      net: t('excel.net'),
      count: t('excel.count'),
      total: t('excel.total'),
      openingBalance: t('excel.openingBalance'),
      balance: t('excel.balance'),
      archived: t('excel.archived'),
    },
    types: {
      expense: t('types.expense'),
      income: t('types.income'),
      transfer: t('types.transfer'),
    },
    yes: t('common.yes'),
    no: t('common.no'),
    uncategorized: t('transactions.uncategorized'),
  };
}
