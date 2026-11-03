import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { ReportsScreen } from '@/ui/screens/reports/ReportsScreen';

export default function ReportsRoute() {
  return (
    <ErrorBoundary>
      <ReportsScreen />
    </ErrorBoundary>
  );
}
