import { Alert, type AlertButton, Platform } from 'react-native';

export interface BrowserDialogs {
  alert(message: string): void;
  confirm(message: string): boolean;
}

/**
 * Browser version of `Alert.alert`, which does nothing on react-native-web. A cancel button
 * plus one action becomes `confirm()`; extra actions are offered one by one.
 */
export function browserAlert(
  dialogs: BrowserDialogs,
  title: string,
  message?: string,
  buttons: readonly AlertButton[] = [],
): void {
  const text = message ? `${title}\n\n${message}` : title;
  const cancel = buttons.find((b) => b.style === 'cancel');
  const actions = buttons.filter((b) => b.style !== 'cancel');
  if (actions.length === 0) {
    dialogs.alert(text);
    cancel?.onPress?.();
    return;
  }
  if (!cancel && actions.length === 1) {
    dialogs.alert(text);
    actions[0]?.onPress?.();
    return;
  }
  const chosen =
    actions.length === 1
      ? dialogs.confirm(text)
        ? actions[0]
        : undefined
      : actions.find((a) => dialogs.confirm(`${text}\n\n${a.text ?? ''}?`));
  if (chosen) chosen.onPress?.();
  else cancel?.onPress?.();
}

/** Drop-in for `Alert.alert` that also works in the web build. */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    browserAlert(
      { alert: (m) => window.alert(m), confirm: (m) => window.confirm(m) },
      title,
      message,
      buttons,
    );
    return;
  }
  Alert.alert(title, message, buttons);
}
