import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeProvider';

/** `ratio` may exceed 1; the bar is clamped while the caller shows the real percentage. */
export function ProgressBar({ ratio, color }: { ratio: number; color: string }) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);
  const clamped = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : 1;

  useEffect(() => {
    progress.value = withTiming(clamped, { duration: 450 });
  }, [clamped, progress]);

  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View
      style={[styles.track, { backgroundColor: colors.chartTrack }]}
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.fill, { backgroundColor: color }, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
});
