import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { G, Line, Rect } from 'react-native-svg';

import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from '../AppText';

export interface BarGroup {
  key: string;
  label: string;
  income: number;
  expense: number;
}

const MIN_GROUP_WIDTH = 28;
const LABEL_HEIGHT = 20;

/**
 * Grouped income/expense bars. Decorative for screen readers: the caller provides a summary
 * label. Bars grow in on the UI thread whenever the data changes.
 */
export function BarChart({
  groups,
  width,
  height = 180,
  accessibilityLabel,
}: {
  groups: readonly BarGroup[];
  width: number;
  height?: number;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const grow = useSharedValue(0);
  const signature = groups.map((g) => `${g.income}:${g.expense}`).join('|');

  useEffect(() => {
    grow.value = 0;
    grow.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) });
  }, [signature, grow]);

  const growStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: grow.value }] }));

  const groupWidth = Math.max(MIN_GROUP_WIDTH, groups.length > 0 ? width / groups.length : width);
  const contentWidth = Math.max(width, groupWidth * groups.length);
  const chartHeight = height - LABEL_HEIGHT;
  const max = Math.max(1, ...groups.map((g) => Math.max(g.income, g.expense)));
  const barWidth = Math.max(4, Math.min(16, (groupWidth - 8) / 2));
  const labelEvery = Math.max(1, Math.ceil(56 / groupWidth));

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={contentWidth > width}
      >
        <View style={{ width: contentWidth }}>
          <Animated.View style={[{ height: chartHeight, transformOrigin: 'bottom' }, growStyle]}>
            <Svg width={contentWidth} height={chartHeight}>
              <Line
                x1={0}
                x2={contentWidth}
                y1={chartHeight - 0.5}
                y2={chartHeight - 0.5}
                stroke={colors.border}
              />
              {groups.map((g, i) => {
                const x = i * groupWidth + (groupWidth - barWidth * 2 - 2) / 2;
                const incomeHeight = (g.income / max) * (chartHeight - 4);
                const expenseHeight = (g.expense / max) * (chartHeight - 4);
                return (
                  <G key={g.key}>
                    <Rect
                      x={x}
                      y={chartHeight - incomeHeight}
                      width={barWidth}
                      height={incomeHeight}
                      rx={2}
                      fill={colors.income}
                    />
                    <Rect
                      x={x + barWidth + 2}
                      y={chartHeight - expenseHeight}
                      width={barWidth}
                      height={expenseHeight}
                      rx={2}
                      fill={colors.expense}
                    />
                  </G>
                );
              })}
            </Svg>
          </Animated.View>
          <View style={[styles.labels, { height: LABEL_HEIGHT }]}>
            {groups.map((g, i) => (
              <AppText
                key={g.key}
                variant="caption"
                color="textSecondary"
                numberOfLines={1}
                align="center"
                style={{ width: groupWidth, fontSize: 11 }}
              >
                {i % labelEvery === 0 ? g.label : ''}
              </AppText>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', alignItems: 'center' },
});
