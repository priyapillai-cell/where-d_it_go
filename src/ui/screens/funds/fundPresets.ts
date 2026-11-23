import { t } from '@/i18n';

export type FundPreset =
  | 'gifts'
  | 'vacation'
  | 'wedding'
  | 'festivals'
  | 'car'
  | 'home'
  | 'medical'
  | 'education'
  | 'gadgets'
  | 'emergency';

export const FUND_PRESETS: readonly { id: FundPreset; icon: string; color: string }[] = [
  { id: 'gifts', icon: 'gift-outline', color: '#D81B60' },
  { id: 'vacation', icon: 'beach', color: '#1E88E5' },
  { id: 'wedding', icon: 'ring', color: '#8E24AA' },
  { id: 'festivals', icon: 'party-popper', color: '#FB8C00' },
  { id: 'car', icon: 'car-wrench', color: '#546E7A' },
  { id: 'home', icon: 'hammer-wrench', color: '#6D4C41' },
  { id: 'medical', icon: 'medical-bag', color: '#E53935' },
  { id: 'education', icon: 'school-outline', color: '#3949AB' },
  { id: 'gadgets', icon: 'cellphone', color: '#00897B' },
  { id: 'emergency', icon: 'lifebuoy', color: '#F4511E' },
];

export function presetName(id: FundPreset): string {
  return t(`funds.presets.${id}`);
}

export function findPreset(id: string | undefined) {
  return FUND_PRESETS.find((p) => p.id === id) ?? null;
}
