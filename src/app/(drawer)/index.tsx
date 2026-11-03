import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { HomeScreen } from '@/ui/screens/home/HomeScreen';

export default function HomeRoute() {
  return (
    <ErrorBoundary>
      <HomeScreen />
    </ErrorBoundary>
  );
}
