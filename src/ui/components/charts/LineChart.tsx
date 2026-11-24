import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from '../AppText';

const PAD_Y = 8;

/** Single-series line with a soft area fill; revealed left-to-right when the data changes. */
export function LineChart({
  values,
  width,
  height = 180,
  minLabel,
  maxLabel,
  startLabel,
  endLabel,
  accessibilityLabel,
}: {
  values: readonly number[];
  width: number;
  height?: number;
  minLabel: string;
  maxLabel: string;
  startLabel: string;
  endLabel: string;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const reveal = useSharedValue(0);
  const signature = values.join('|');

  useEffect(() => {
    reveal.value = 0;
    reveal.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [signature, reveal]);

  const revealStyle = useAnimatedStyle(() => ({ width: reveal.value * width }));

  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const range = max - min || 1;
  const innerHeight = height - PAD_Y * 2;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const y = (v: number) => PAD_Y + innerHeight - ((v - min) / range) * innerHeight;
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`);
  const line =
    values.length === 1
      ? `M0,${y(values[0] ?? 0)} L${width},${y(values[0] ?? 0)}`
      : `M${points.join(' L')}`;
  const area = `${line} L${values.length === 1 ? width : (values.length - 1) * step},${height} L0,${height} Z`;
  const zeroY = y(0);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={{ height }}>
        <Animated.View style={[styles.reveal, { height }, revealStyle]}>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.primary} stopOpacity={0.28} />
                <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {min < 0 ? (
              <Line
                x1={0}
                x2={width}
                y1={zeroY}
                y2={zeroY}
                stroke={colors.border}
                strokeDasharray="4 4"
              />
            ) : null}
            <Path d={area} fill="url(#area)" />
            <Path d={line} stroke={colors.primary} strokeWidth={2.5} fill="none" />
          </Svg>
        </Animated.View>
        <AppText variant="caption" color="textSecondary" style={styles.maxLabel}>
          {maxLabel}
        </AppText>
        <AppText variant="caption" color="textSecondary" style={styles.minLabel}>
          {minLabel}
        </AppText>
      </View>
      <View style={styles.axis}>
        <AppText variant="caption" color="textSecondary">
          {startLabel}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {endLabel}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  reveal: { overflow: 'hidden' },
  maxLabel: { position: 'absolute', top: 0, left: 4 },
  minLabel: { position: 'absolute', bottom: 0, left: 4 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
});
