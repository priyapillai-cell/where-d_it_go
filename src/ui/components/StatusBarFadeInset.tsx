import { type ReactNode, useMemo } from 'react';
import { Platform } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { readWebEnvironment, statusBarFadeGap } from '@/ui/statusBarFade';

const gap = statusBarFadeGap(Platform.OS, Platform.OS === 'web' ? readWebEnvironment() : null);

export function StatusBarFadeInset({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const value = useMemo(() => ({ ...insets, top: insets.top + gap }), [insets]);
  if (gap === 0) return children;
  return <SafeAreaInsetsContext.Provider value={value}>{children}</SafeAreaInsetsContext.Provider>;
}
