import { browserAlert, type BrowserDialogs } from '../dialogs';

function dialogs(answers: boolean[] = []) {
  const shown: string[] = [];
  const browser: BrowserDialogs = {
    alert: (m) => {
      shown.push(`alert:${m}`);
    },
    confirm: (m) => {
      shown.push(`confirm:${m}`);
      return answers.shift() ?? false;
    },
  };
  return { browser, shown };
}

it('shows a plain message as an alert', () => {
  const { browser, shown } = dialogs();
  browserAlert(browser, 'Title', 'Body');
  expect(shown).toEqual(['alert:Title\n\nBody']);
});

it('runs the action only when the user confirms', () => {
  const onDelete = jest.fn();
  const onCancel = jest.fn();
  const buttons = [
    { text: 'Cancel', style: 'cancel' as const, onPress: onCancel },
    { text: 'Delete', style: 'destructive' as const, onPress: onDelete },
  ];

  const declined = dialogs([false]);
  browserAlert(declined.browser, 'Delete?', undefined, buttons);
  expect(declined.shown).toEqual(['confirm:Delete?']);
  expect(onDelete).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledTimes(1);

  browserAlert(dialogs([true]).browser, 'Delete?', undefined, buttons);
  expect(onDelete).toHaveBeenCalledTimes(1);
});

it('runs a lone acknowledgement button after the alert', () => {
  const onOk = jest.fn();
  const { browser, shown } = dialogs();
  browserAlert(browser, 'Done', undefined, [{ text: 'OK', onPress: onOk }]);
  expect(shown).toEqual(['alert:Done']);
  expect(onOk).toHaveBeenCalled();
});

it('offers several actions one at a time', () => {
  const first = jest.fn();
  const second = jest.fn();
  const { browser, shown } = dialogs([false, true]);
  browserAlert(browser, 'Pick', undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'One', onPress: first },
    { text: 'Two', onPress: second },
  ]);
  expect(shown).toEqual(['confirm:Pick\n\nOne?', 'confirm:Pick\n\nTwo?']);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalled();
});
