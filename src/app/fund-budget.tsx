import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { FundBudgetScreen } from '@/ui/screens/funds/FundBudgetScreen';

export default function FundBudgetRoute() {
  return (
    <ErrorBoundary>
      <FundBudgetScreen />
    </ErrorBoundary>
  );
}
