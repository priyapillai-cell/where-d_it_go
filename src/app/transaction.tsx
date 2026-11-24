import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { TransactionEditorScreen } from '@/ui/screens/editor/TransactionEditorScreen';

export default function TransactionRoute() {
  return (
    <ErrorBoundary>
      <TransactionEditorScreen />
    </ErrorBoundary>
  );
}
