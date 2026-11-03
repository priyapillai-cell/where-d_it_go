export interface ThemeColors {
  background: string;
  surface: string;
  surfaceVariant: string;
  text: string;
  textSecondary: string;
  border: string;
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  expense: string;
  income: string;
  transfer: string;
  success: string;
  warning: string;
  danger: string;
  onDanger: string;
  scrim: string;
  skeleton: string;
  chartTrack: string;
}

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
  spacing: (n: number) => number;
  radius: { sm: number; md: number; lg: number; pill: number };
  /** Minimum touch target in dp (WCAG 2.5.5 / Material guidance). */
  touchTarget: number;
}

/** Text/background pairs below meet WCAG AA (4.5:1) for body text. */
const light: ThemeColors = {
  background: '#F5F6F8',
  surface: '#FFFFFF',
  surfaceVariant: '#ECEFF2',
  text: '#1B1F24',
  textSecondary: '#545D68',
  border: '#D5DAE0',
  primary: '#00796B',
  onPrimary: '#FFFFFF',
  primaryContainer: '#C8EDE8',
  onPrimaryContainer: '#00332D',
  expense: '#C62828',
  income: '#2E7D32',
  transfer: '#1565C0',
  success: '#2E7D32',
  warning: '#A15C00',
  danger: '#C62828',
  onDanger: '#FFFFFF',
  scrim: 'rgba(0,0,0,0.4)',
  skeleton: '#E2E6EA',
  chartTrack: '#E6E9ED',
};

const dark: ThemeColors = {
  background: '#0F1215',
  surface: '#181C20',
  surfaceVariant: '#232930',
  text: '#E8EAED',
  textSecondary: '#A4ADB7',
  border: '#343B43',
  primary: '#4DB6AC',
  onPrimary: '#00201C',
  primaryContainer: '#00504A',
  onPrimaryContainer: '#C8EDE8',
  expense: '#EF7373',
  income: '#72C677',
  transfer: '#7DB3F5',
  success: '#72C677',
  warning: '#FFB74D',
  danger: '#EF7373',
  onDanger: '#2B0000',
  scrim: 'rgba(0,0,0,0.6)',
  skeleton: '#262C33',
  chartTrack: '#262C33',
};

const base = {
  spacing: (n: number) => n * 4,
  radius: { sm: 8, md: 12, lg: 20, pill: 999 },
  touchTarget: 48,
};

export const lightTheme: Theme = { dark: false, colors: light, ...base };
export const darkTheme: Theme = { dark: true, colors: dark, ...base };

/** Category/account palette; every swatch is distinct in both themes. */
export const PALETTE: readonly string[] = [
  '#E53935',
  '#D81B60',
  '#8E24AA',
  '#5E35B1',
  '#3949AB',
  '#1E88E5',
  '#039BE5',
  '#00ACC1',
  '#00897B',
  '#43A047',
  '#7CB342',
  '#C0CA33',
  '#F9A825',
  '#FB8C00',
  '#F4511E',
  '#6D4C41',
  '#757575',
  '#546E7A',
];

/** Icons offered by the icon picker (MaterialCommunityIcons names). */
export const ICON_CHOICES: readonly string[] = [
  'cart',
  'silverware-fork-knife',
  'coffee',
  'food-apple',
  'receipt',
  'home',
  'lightning-bolt',
  'water',
  'wifi',
  'cellphone',
  'bus',
  'car',
  'gas-station',
  'taxi',
  'train',
  'airplane',
  'bike',
  'tshirt-crew',
  'shoe-sneaker',
  'hospital-box',
  'pill',
  'tooth',
  'movie-open',
  'gamepad-variant',
  'music',
  'book-open-variant',
  'school',
  'gift',
  'gift-outline',
  'basketball',
  'dumbbell',
  'paw',
  'baby-carriage',
  'lotion-outline',
  'hair-dryer',
  'tools',
  'shield-check',
  'bank',
  'briefcase',
  'piggy-bank',
  'cash',
  'credit-card',
  'wallet',
  'chart-line',
  'hand-heart',
  'beach',
  'party-popper',
  'cigar',
  'glass-cocktail',
  'dots-horizontal',
];
