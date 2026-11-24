import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { RecurringScreen } from '@/ui/screens/recurring/RecurringScreen';

export default function RecurringRoute() {
  return (
    <ErrorBoundary>
      <RecurringScreen />
    </ErrorBoundary>
  );
}
