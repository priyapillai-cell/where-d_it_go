import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { TransferEditorScreen } from '@/ui/screens/transfer/TransferEditorScreen';

export default function TransferRoute() {
  return (
    <ErrorBoundary>
      <TransferEditorScreen />
    </ErrorBoundary>
  );
}
