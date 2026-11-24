import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { TransactionsScreen } from '@/ui/screens/transactions/TransactionsScreen';

export default function TransactionsRoute() {
  return (
    <ErrorBoundary>
      <TransactionsScreen />
    </ErrorBoundary>
  );
}
