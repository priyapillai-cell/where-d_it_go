import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { RecurringEditScreen } from '@/ui/screens/recurring/RecurringEditScreen';

export default function RecurringEditRoute() {
  return (
    <ErrorBoundary>
      <RecurringEditScreen />
    </ErrorBoundary>
  );
}
