import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { FundsScreen } from '@/ui/screens/funds/FundsScreen';

export default function FundsRoute() {
  return (
    <ErrorBoundary>
      <FundsScreen />
    </ErrorBoundary>
  );
}
