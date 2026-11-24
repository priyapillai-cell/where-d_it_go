import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { CategoryEditScreen } from '@/ui/screens/categories/CategoryEditScreen';

export default function CategoryEditRoute() {
  return (
    <ErrorBoundary>
      <CategoryEditScreen />
    </ErrorBoundary>
  );
}
