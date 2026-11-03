import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { BudgetsScreen } from '@/ui/screens/budgets/BudgetsScreen';

export default function BudgetsRoute() {
  return (
    <ErrorBoundary>
      <BudgetsScreen />
    </ErrorBoundary>
  );
}
