import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { AddFromMessageScreen } from '@/ui/screens/editor/AddFromMessageScreen';

export default function FromMessageRoute() {
  return (
    <ErrorBoundary>
      <AddFromMessageScreen />
    </ErrorBoundary>
  );
}
