import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { ImportCsvScreen } from '@/ui/screens/settings/ImportCsvScreen';

export default function ImportCsvRoute() {
  return (
    <ErrorBoundary>
      <ImportCsvScreen />
    </ErrorBoundary>
  );
}
