import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { PasscodeScreen } from '@/ui/screens/settings/PasscodeScreen';

export default function PasscodeRoute() {
  return (
    <ErrorBoundary>
      <PasscodeScreen />
    </ErrorBoundary>
  );
}
