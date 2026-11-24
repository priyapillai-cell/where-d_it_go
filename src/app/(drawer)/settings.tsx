import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { SettingsScreen } from '@/ui/screens/settings/SettingsScreen';

export default function SettingsRoute() {
  return (
    <ErrorBoundary>
      <SettingsScreen />
    </ErrorBoundary>
  );
}
