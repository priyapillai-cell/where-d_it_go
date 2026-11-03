import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { BudgetEditScreen } from '@/ui/screens/budgets/BudgetEditScreen';

export default function BudgetEditRoute() {
  return (
    <ErrorBoundary>
      <BudgetEditScreen />
    </ErrorBoundary>
  );
}
