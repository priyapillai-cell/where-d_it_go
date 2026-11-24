import { deleteItemAsync, getItemAsync, setItemAsync } from '../secureStore.web';

function fakeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else delete (globalThis as { localStorage?: Storage }).localStorage;
});

function useStorage(value: Storage | undefined): void {
  Object.defineProperty(globalThis, 'localStorage', { value, configurable: true, writable: true });
}

it('stores, reads and deletes values in localStorage', async () => {
  useStorage(fakeStorage());
  expect(await getItemAsync('k')).toBeNull();
  await setItemAsync('k', 'v');
  expect(await getItemAsync('k')).toBe('v');
  await deleteItemAsync('k');
  expect(await getItemAsync('k')).toBeNull();
});

it('deleting a missing key succeeds', async () => {
  useStorage(fakeStorage());
  await expect(deleteItemAsync('missing')).resolves.toBeUndefined();
});

it('does nothing without localStorage instead of throwing', async () => {
  useStorage(undefined);
  await expect(setItemAsync('k', 'v')).resolves.toBeUndefined();
  await expect(getItemAsync('k')).resolves.toBeNull();
  await expect(deleteItemAsync('k')).resolves.toBeUndefined();
});
