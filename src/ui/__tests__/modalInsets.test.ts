import { modalTopInset } from '../modalInsets';

describe('modalTopInset', () => {
  it('adds nothing for iOS page sheets', () => {
    expect(modalTopInset('ios', 59)).toBe(0);
  });

  it('keeps full-screen modals clear of the status bar on web and Android', () => {
    expect(modalTopInset('web', 83)).toBe(83);
    expect(modalTopInset('android', 24)).toBe(24);
  });
});
