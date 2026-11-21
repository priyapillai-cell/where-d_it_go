import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { DriveScreen } from '@/ui/screens/settings/DriveScreen';

export default function DriveRoute() {
  return (
    <ErrorBoundary>
      <DriveScreen />
    </ErrorBoundary>
  );
}
