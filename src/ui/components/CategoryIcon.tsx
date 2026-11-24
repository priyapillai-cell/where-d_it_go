import { StyleSheet, View } from 'react-native';

import { Icon } from './Icon';

export function CategoryIcon({
  icon,
  color,
  size = 44,
}: {
  icon: string;
  color: string;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.55)} color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
});
