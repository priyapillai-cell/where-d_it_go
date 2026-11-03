import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { AccountsScreen } from '@/ui/screens/accounts/AccountsScreen';

export default function AccountsRoute() {
  return (
    <ErrorBoundary>
      <AccountsScreen />
    </ErrorBoundary>
  );
}
