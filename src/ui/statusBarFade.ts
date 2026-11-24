/**
 * iOS 26.1 and later draw a dark fade under the status bar of Home Screen web apps, and a page
 * cannot turn it off. Adding this much to the top safe-area inset keeps headers below the fade.
 */
export const STATUS_BAR_FADE_GAP = 24;

export interface WebEnvironment {
  standalone: boolean;
  iosWebKit: boolean;
}

export function statusBarFadeGap(os: string, web: WebEnvironment | null): number {
  if (os !== 'web' || web === null) return 0;
  return web.standalone && web.iosWebKit ? STATUS_BAR_FADE_GAP : 0;
}

export function readWebEnvironment(): WebEnvironment | null {
  if (typeof window === 'undefined') return null;
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  // Only WebKit on iPhone and iPad supports -webkit-touch-callout; iPadOS reports a Mac user agent.
  const iosWebKit = window.CSS?.supports?.('-webkit-touch-callout', 'none') === true;
  return { standalone, iosWebKit };
}
