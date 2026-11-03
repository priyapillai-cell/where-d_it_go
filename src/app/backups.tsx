import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { BackupsScreen } from '@/ui/screens/settings/BackupsScreen';

export default function BackupsRoute() {
  return (
    <ErrorBoundary>
      <BackupsScreen />
    </ErrorBoundary>
  );
}
