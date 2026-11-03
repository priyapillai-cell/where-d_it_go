import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import type { ThemePreference } from '@/domain/types';

import { darkTheme, lightTheme, type Theme } from './theme';

const ThemeContext = createContext<Theme>(lightTheme);

export function AppThemeProvider({
  preference,
  children,
}: {
  preference: ThemePreference;
  children: ReactNode;
}) {
  const scheme = useColorScheme();
  const theme = useMemo(() => {
    const dark = preference === 'dark' || (preference === 'system' && scheme === 'dark');
    return dark ? darkTheme : lightTheme;
  }, [preference, scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
