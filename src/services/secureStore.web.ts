/**
 * Browser version of `secureStore`: expo-secure-store has no web implementation, so values are
 * kept in `localStorage`, which is readable by anything running on the page. Only the web
 * preview uses this; iPhone and Android keep values in the keychain/keystore.
 */

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export async function getItemAsync(key: string): Promise<string | null> {
  return storage()?.getItem(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  storage()?.setItem(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  storage()?.removeItem(key);
}
