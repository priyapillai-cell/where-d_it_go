import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { TransactionFiltersScreen } from '@/ui/screens/transactions/TransactionFiltersScreen';

export default function TransactionFiltersRoute() {
  return (
    <ErrorBoundary>
      <TransactionFiltersScreen />
    </ErrorBoundary>
  );
}
