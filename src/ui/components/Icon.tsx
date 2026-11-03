import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

export type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

type IconColor = ComponentProps<typeof MaterialCommunityIcons>['color'];

const FALLBACK: IconName = 'shape-outline';

export function isIconName(name: string): name is IconName {
  return Object.prototype.hasOwnProperty.call(MaterialCommunityIcons.glyphMap, name);
}

/** Renders any stored icon name safely; unknown names (e.g. from imports) fall back. */
export function Icon({
  name,
  size = 24,
  color,
}: {
  name: string;
  size?: number;
  color: IconColor;
}) {
  return (
    <MaterialCommunityIcons
      name={isIconName(name) ? name : FALLBACK}
      size={size}
      color={color}
      aria-hidden
    />
  );
}
