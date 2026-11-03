import { Drawer } from 'expo-router/drawer';

import { t, type TranslationKey } from '@/i18n';
import { Icon } from '@/ui/components/Icon';
import { useTheme } from '@/ui/theme/ThemeProvider';

const SCREENS: readonly {
  name: string;
  title: TranslationKey;
  icon: string;
  headerShown?: boolean;
}[] = [
  { name: 'index', title: 'nav.home', icon: 'chart-donut', headerShown: false },
  { name: 'transactions', title: 'nav.transactions', icon: 'format-list-bulleted' },
  { name: 'accounts', title: 'nav.accounts', icon: 'wallet-outline' },
  { name: 'categories', title: 'nav.categories', icon: 'shape-outline' },
  { name: 'budgets', title: 'nav.budgets', icon: 'target' },
  { name: 'recurring', title: 'nav.recurring', icon: 'calendar-sync' },
  { name: 'reports', title: 'nav.reports', icon: 'chart-box-outline' },
];

export default function DrawerLayout() {
  const { colors } = useTheme();
  return (
    <Drawer
      screenOptions={{
        headerTintColor: colors.text,
        headerStyle: { backgroundColor: colors.surface },
        drawerStyle: { backgroundColor: colors.surface },
        drawerActiveTintColor: colors.primary,
        drawerActiveBackgroundColor: colors.primaryContainer,
        drawerInactiveTintColor: colors.text,
        drawerLabelStyle: { fontSize: 16 },
        drawerItemStyle: { minHeight: 48 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {SCREENS.map((screen) => (
        <Drawer.Screen
          key={screen.name}
          name={screen.name}
          options={{
            title: t(screen.title),
            headerShown: screen.headerShown ?? true,
            drawerIcon: ({ color, size }) => (
              <Icon
                name={screen.icon}
                size={size}
                color={typeof color === 'string' ? color : colors.text}
              />
            ),
          }}
        />
      ))}
    </Drawer>
  );
}
