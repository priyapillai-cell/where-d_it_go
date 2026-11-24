import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { CategoriesScreen } from '@/ui/screens/categories/CategoriesScreen';

export default function CategoriesRoute() {
  return (
    <ErrorBoundary>
      <CategoriesScreen />
    </ErrorBoundary>
  );
}
