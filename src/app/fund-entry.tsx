import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { FundEntryScreen } from '@/ui/screens/funds/FundEntryScreen';

export default function FundEntryRoute() {
  return (
    <ErrorBoundary>
      <FundEntryScreen />
    </ErrorBoundary>
  );
}
