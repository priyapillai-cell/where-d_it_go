/** Modal routes are page sheets on iOS but cover the whole screen, status bar included, elsewhere. */
export function modalTopInset(os: string, safeAreaTop: number): number {
  return os === 'ios' ? 0 : safeAreaTop;
}
