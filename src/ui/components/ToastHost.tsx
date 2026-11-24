import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToastStore } from '@/state/toastStore';
import { logger } from '@/utils/logger';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

/** Snackbar-style confirmation with an optional action (e.g. Undo). */
export function ToastHost() {
  const toast = useToastStore((s) => s.toast);
  const hide = useToastStore((s) => s.hide);
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    AccessibilityInfo.announceForAccessibility(toast.message);
    const timer = setTimeout(() => hide(toast.id), toast.durationMs);
    return () => clearTimeout(timer);
  }, [toast, hide]);

  if (!toast) return null;

  return (
    <View pointerEvents="box-none" style={[styles.container, { bottom: insets.bottom + 96 }]}>
      <Animated.View
        key={toast.id}
        entering={FadeInDown.duration(180)}
        exiting={FadeOutDown.duration(150)}
        accessibilityLiveRegion="polite"
        style={[styles.toast, { backgroundColor: colors.text, borderRadius: radius.md }]}
      >
        <AppText variant="body" style={[styles.message, { color: colors.background }]}>
          {toast.message}
        </AppText>
        {toast.actionLabel && toast.onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toast.actionLabel}
            onPress={() => {
              const action = toast.onAction;
              hide(toast.id);
              Promise.resolve(action?.()).catch((error: unknown) =>
                logger.error('Toast action failed', error),
              );
            }}
            style={styles.action}
            hitSlop={8}
          >
            <AppText variant="label" style={{ color: colors.primaryContainer }}>
              {toast.actionLabel.toUpperCase()}
            </AppText>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingLeft: 16,
    paddingRight: 8,
    width: '100%',
    maxWidth: 560,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  message: { flex: 1, paddingVertical: 12 },
  action: {
    minHeight: 44,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
});
