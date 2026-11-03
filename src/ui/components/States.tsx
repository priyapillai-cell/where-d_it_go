import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { t } from '@/i18n';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';

export function EmptyState({
  icon,
  title,
  hint,
  actionLabel,
  onAction,
}: {
  icon: string;
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.empty}
      accessible
      accessibilityLabel={[title, hint].filter(Boolean).join('. ')}
    >
      <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceVariant }]}>
        <Icon name={icon} size={36} color={colors.textSecondary} />
      </View>
      <AppText variant="subtitle" align="center">
        {title}
      </AppText>
      {hint ? (
        <AppText variant="body" color="textSecondary" align="center">
          {hint}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="tonal" style={styles.emptyAction} />
      ) : null}
    </View>
  );
}

/** Pulsing placeholder block shown while data loads. */
export function Skeleton({
  width,
  height,
  radius = 8,
  style,
}: {
  width: ViewStyle['width'];
  height: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radius, backgroundColor: colors.skeleton },
        animated,
        style,
      ]}
    />
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View
      style={styles.skeletonList}
      accessibilityLabel={t('app.loading')}
      accessibilityRole="progressbar"
    >
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton width={40} height={40} radius={20} />
          <View style={styles.skeletonText}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="35%" height={12} />
          </View>
          <Skeleton width={64} height={14} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyAction: { marginTop: 12 },
  skeletonList: { padding: 16, gap: 16 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skeletonText: { flex: 1, gap: 6 },
});
