import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { AccountEditScreen } from '@/ui/screens/accounts/AccountEditScreen';

export default function AccountEditRoute() {
  return (
    <ErrorBoundary>
      <AccountEditScreen />
    </ErrorBoundary>
  );
}
