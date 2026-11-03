import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';

export function Screen({
  children,
  edges = ['bottom'],
  style,
}: {
  children: ReactNode;
  edges?: Edge[];
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  return (
    <SafeAreaView
      edges={edges}
      style={[styles.flex, { backgroundColor: colors.background }, style]}
    >
      <View style={styles.flex}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
