export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  at: string;
}

const MAX_ENTRIES = 200;
const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const buffer: LogEntry[] = [];
const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
let minLevel: LogLevel = isDev ? 'debug' : 'info';

function describe(detail: unknown): string | undefined {
  if (detail === undefined) return undefined;
  if (detail instanceof Error) return `${detail.name}: ${detail.message}`;
  try {
    return typeof detail === 'string' ? detail : JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

function write(level: LogLevel, message: string, detail?: unknown): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  const entry: LogEntry = {
    level,
    message,
    context: describe(detail),
    at: new Date().toISOString(),
  };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  if (!isDev || process.env.JEST_WORKER_ID !== undefined) return;
  const line = `[${level}] ${message}`;
  if (level === 'error') console.error(line, detail ?? '');
  else console.warn(line, detail ?? '');
}

/**
 * Minimal local logger. Entries stay in an in-memory ring buffer (no network, no analytics)
 * and are mirrored to the console in development builds only.
 */
export const logger = {
  debug: (message: string, detail?: unknown) => write('debug', message, detail),
  info: (message: string, detail?: unknown) => write('info', message, detail),
  warn: (message: string, detail?: unknown) => write('warn', message, detail),
  error: (message: string, detail?: unknown) => write('error', message, detail),
  entries: (): readonly LogEntry[] => [...buffer],
  setLevel: (level: LogLevel) => {
    minLevel = level;
  },
};
