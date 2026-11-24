import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { FundDetailScreen } from '@/ui/screens/funds/FundDetailScreen';

export default function FundDetailRoute() {
  return (
    <ErrorBoundary>
      <FundDetailScreen />
    </ErrorBoundary>
  );
}
