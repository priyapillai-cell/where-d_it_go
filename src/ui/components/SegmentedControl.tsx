import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

export interface Segment<V extends string> {
  value: V;
  label: string;
}

export function SegmentedControl<V extends string>({
  segments,
  value,
  onChange,
  accessibilityLabel,
}: {
  segments: readonly Segment<V>[];
  value: V;
  onChange: (value: V) => void;
  accessibilityLabel?: string;
}) {
  const { colors, radius } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.container,
        { backgroundColor: colors.surfaceVariant, borderRadius: radius.md },
      ]}
    >
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={segment.label}
            onPress={() => onChange(segment.value)}
            style={[
              styles.segment,
              { borderRadius: radius.sm },
              selected && {
                backgroundColor: colors.surface,
                borderColor: colors.primary,
                borderWidth: 1.5,
              },
            ]}
          >
            <AppText
              variant="label"
              color={selected ? 'primary' : 'textSecondary'}
              numberOfLines={1}
            >
              {segment.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', padding: 4, gap: 4 },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
});
