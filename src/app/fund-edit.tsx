import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { FundEditScreen } from '@/ui/screens/funds/FundEditScreen';

export default function FundEditRoute() {
  return (
    <ErrorBoundary>
      <FundEditScreen />
    </ErrorBoundary>
  );
}
