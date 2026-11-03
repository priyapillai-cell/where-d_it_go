type IdGenerator = () => string;

function fallbackUuid(): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
    else if (i === 14) out += '4';
    else if (i === 19) out += hex[8 + Math.floor(Math.random() * 4)];
    else out += hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

let generator: IdGenerator = () => {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return cryptoApi?.randomUUID ? cryptoApi.randomUUID() : fallbackUuid();
};

/** Swap in a platform CSPRNG-backed generator (expo-crypto) at app start, or a stub in tests. */
export function setIdGenerator(next: IdGenerator): void {
  generator = next;
}

export function newId(): string {
  return generator();
}
