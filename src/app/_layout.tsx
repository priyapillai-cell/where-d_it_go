import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { bootstrapApp } from '@/services/bootstrapService';
import { useAppStore } from '@/state/appStore';
import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { StartupGate } from '@/ui/components/StartupGate';
import { ToastHost } from '@/ui/components/ToastHost';
import { useForegroundRefresh } from '@/ui/hooks/useForegroundRefresh';
import { AppThemeProvider, useTheme } from '@/ui/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function NavigationTheme({ children }: { children: ReactNode }) {
  const { dark, colors } = useTheme();
  const navTheme = useMemo(() => {
    const base = dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
      },
    };
  }, [dark, colors]);
  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {children}
    </ThemeProvider>
  );
}

function AppNavigator() {
  const { colors } = useTheme();
  const modal = {
    presentation: 'modal',
    headerShown: false,
    contentStyle: { backgroundColor: colors.background },
  } as const;
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
      <Stack.Screen name="transaction" options={modal} />
      <Stack.Screen name="transaction-filters" options={modal} />
      <Stack.Screen name="transfer" options={modal} />
      <Stack.Screen name="account-edit" options={modal} />
      <Stack.Screen name="category-edit" options={modal} />
    </Stack>
  );
}

export default function RootLayout() {
  const status = useAppStore((s) => s.status);
  const themePreference = useAppStore((s) => s.settings.theme);
  const language = useAppStore((s) => s.settings.language);

  useEffect(() => {
    void bootstrapApp();
  }, []);

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync().catch(() => undefined);
  }, [status]);

  useForegroundRefresh();

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <AppThemeProvider preference={themePreference}>
          <NavigationTheme>
            <ErrorBoundary>
              <AppNavigator key={language} />
              <StartupGate />
              <ToastHost />
            </ErrorBoundary>
          </NavigationTheme>
        </AppThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
