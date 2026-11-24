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

/** 53-bit string hash (cyrb53); deterministic across platforms. */
function cyrb53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Deterministic id for records that several devices may create independently (seed data,
 * recurring occurrences), so synced copies collapse into one row instead of duplicating.
 */
export function stableId(prefix: string, ...parts: readonly string[]): string {
  const text = parts.join('\u0000');
  const hash =
    cyrb53(text, 1).toString(16).padStart(14, '0') + cyrb53(text, 2).toString(16).padStart(14, '0');
  return `${prefix}-${hash}`;
}
