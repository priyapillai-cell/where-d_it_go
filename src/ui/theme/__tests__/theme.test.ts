import glyphMap from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json';

import { DEFAULT_CATEGORIES } from '@/db/seed';

import { darkTheme, ICON_CHOICES, lightTheme, PALETTE } from '../theme';

it('only offers icons that exist in the icon font', () => {
  const missing = [...ICON_CHOICES, ...DEFAULT_CATEGORIES.map((c) => c.icon)].filter(
    (name) => !(name in glyphMap),
  );
  expect(missing).toEqual([]);
});

it('uses unique, well-formed palette colours', () => {
  expect(new Set(PALETTE).size).toBe(PALETTE.length);
  expect(PALETTE.every((c) => /^#[0-9A-F]{6}$/i.test(c))).toBe(true);
});

it('defines the same colour roles for light and dark themes', () => {
  expect(Object.keys(darkTheme.colors).sort()).toEqual(Object.keys(lightTheme.colors).sort());
});
