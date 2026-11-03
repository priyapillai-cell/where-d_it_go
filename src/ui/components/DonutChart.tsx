import { type ReactNode, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';

export interface DonutSegment {
  key: string;
  value: number;
  color: string;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const TIMING = { duration: 450, easing: Easing.out(Easing.cubic) };
const GAP = 2;

function Segment({
  radius,
  stroke,
  color,
  start,
  length,
  center,
}: {
  radius: number;
  stroke: number;
  color: string;
  start: number;
  length: number;
  center: number;
}) {
  const circumference = 2 * Math.PI * radius;
  const startValue = useSharedValue(start);
  const lengthValue = useSharedValue(0);

  useEffect(() => {
    startValue.value = withTiming(start, TIMING);
    lengthValue.value = withTiming(length, TIMING);
  }, [start, length, startValue, lengthValue]);

  const animatedProps = useAnimatedProps(() => {
    const visible = Math.max(0, lengthValue.value * circumference);
    return {
      strokeDasharray: [visible, circumference],
      strokeDashoffset: -startValue.value * circumference,
    };
  });

  return (
    <AnimatedCircle
      cx={center}
      cy={center}
      r={radius}
      stroke={color}
      strokeWidth={stroke}
      fill="none"
      animatedProps={animatedProps}
    />
  );
}

/**
 * Donut chart whose segments animate (UI thread, Reanimated) when values change.
 * Decorative for screen readers: callers expose the data via the centre label and lists.
 */
export function DonutChart({
  segments,
  size,
  thickness = 22,
  children,
}: {
  segments: readonly DonutSegment[];
  size: number;
  thickness?: number;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const center = size / 2;
  const radius = center - thickness / 2;
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const gapFraction = segments.length > 1 ? GAP / (2 * Math.PI * radius) : 0;

  const arcs: (DonutSegment & { start: number; length: number; fraction: number })[] = [];
  for (const s of segments) {
    const previous = arcs[arcs.length - 1];
    const start = previous ? previous.start + previous.fraction : 0;
    const fraction = total > 0 ? Math.max(0, s.value) / total : 0;
    arcs.push({ ...s, start, fraction, length: Math.max(0, fraction - gapFraction) });
  }

  return (
    <View style={{ width: size, height: size }}>
      <View aria-hidden>
        <Svg width={size} height={size}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={colors.chartTrack}
            strokeWidth={thickness}
            fill="none"
          />
          <G transform={`rotate(-90 ${center} ${center})`}>
            {arcs.map((arc) => (
              <Segment
                key={arc.key}
                radius={radius}
                stroke={thickness}
                color={arc.color}
                start={arc.start}
                length={arc.length}
                center={center}
              />
            ))}
          </G>
        </Svg>
      </View>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
