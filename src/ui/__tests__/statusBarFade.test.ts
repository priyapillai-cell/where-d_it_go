import { STATUS_BAR_FADE_GAP, statusBarFadeGap } from '../statusBarFade';

describe('statusBarFadeGap', () => {
  it('adds the gap in an iPhone or iPad Home Screen web app', () => {
    expect(statusBarFadeGap('web', { standalone: true, iosWebKit: true })).toBe(
      STATUS_BAR_FADE_GAP,
    );
  });

  it('adds nothing in a Safari tab', () => {
    expect(statusBarFadeGap('web', { standalone: false, iosWebKit: true })).toBe(0);
  });

  it('adds nothing for installed web apps outside iOS', () => {
    expect(statusBarFadeGap('web', { standalone: true, iosWebKit: false })).toBe(0);
  });

  it('adds nothing in the native apps', () => {
    expect(statusBarFadeGap('ios', { standalone: true, iosWebKit: true })).toBe(0);
    expect(statusBarFadeGap('android', null)).toBe(0);
  });

  it('adds nothing when the browser cannot be read', () => {
    expect(statusBarFadeGap('web', null)).toBe(0);
  });
});
