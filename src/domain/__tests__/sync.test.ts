import {
  compareRecords,
  emptyTables,
  mergeTable,
  parseSnapshot,
  pruneTombstones,
  serializeSnapshot,
  SYNC_FORMAT,
  type SyncRecord,
  type SyncSnapshot,
} from '../sync';

const row = (
  id: string,
  changedAt: string,
  data: Record<string, string | number> = {},
): SyncRecord => ({
  id,
  changedAt,
  deleted: false,
  data: { id, ...data },
});
const tomb = (id: string, changedAt: string): SyncRecord => ({
  id,
  changedAt,
  deleted: true,
  data: null,
});

const T1 = '2026-01-01T00:00:00.000Z';
const T2 = '2026-01-02T00:00:00.000Z';

describe('compareRecords', () => {
  it('orders by change time first', () => {
    expect(compareRecords(row('a', T1), row('a', T2))).toBe(-1);
    expect(compareRecords(row('a', T2), row('a', T1))).toBe(1);
  });

  it('breaks ties the same way on every device', () => {
    expect(compareRecords(tomb('a', T1), row('a', T1))).toBe(1);
    const x = row('a', T1, { name: 'x' });
    const y = row('a', T1, { name: 'y' });
    expect(compareRecords(x, y)).toBe(-compareRecords(y, x));
    expect(compareRecords(x, row('a', T1, { name: 'x' }))).toBe(0);
  });
});

describe('mergeTable', () => {
  it('applies newer and unknown remote records and flags local-only ones', () => {
    const local = [row('a', T1), row('b', T2), row('c', T1)];
    const remote = [row('a', T2, { v: 1 }), row('b', T1), tomb('d', T1)];
    const merge = mergeTable(local, remote);
    expect(merge.toApply.map((r) => r.id)).toEqual(['a', 'd']);
    expect(merge.remoteBehind).toBe(true);
  });

  it('reports nothing to do for identical sides', () => {
    const records = [row('a', T1), tomb('b', T2)];
    expect(mergeTable(records, records)).toEqual({ toApply: [], remoteBehind: false });
  });
});

describe('parseSnapshot', () => {
  const snapshot: SyncSnapshot = {
    format: SYNC_FORMAT,
    version: 1,
    schemaVersion: 3,
    deviceId: 'dev',
    updatedAt: T1,
    tables: { ...emptyTables(), accounts: [row('a', T1), tomb('b', T2)] },
  };

  it('round-trips a serialized snapshot', () => {
    const parsed = parseSnapshot(serializeSnapshot(snapshot), 3);
    expect(parsed.ok && parsed.value.tables.accounts).toEqual(snapshot.tables.accounts);
  });

  it('skips malformed, duplicate and mismatched rows', () => {
    const text = JSON.stringify({
      ...snapshot,
      tables: {
        accounts: [
          { id: 'a', changedAt: T1, data: { id: 'a' } },
          { id: 'a', changedAt: T2, data: { id: 'a' } },
          { id: 'x', changedAt: 'yesterday', data: { id: 'x' } },
          { id: 'y', changedAt: T1, data: { id: 'z' } },
          { id: 'w', changedAt: T1 },
        ],
      },
    });
    const parsed = parseSnapshot(text, 3);
    expect(parsed.ok && parsed.value.tables.accounts.map((r) => r.id)).toEqual(['a']);
  });

  it('rejects non-JSON, foreign files and newer versions', () => {
    expect(parseSnapshot('{', 3)).toMatchObject({ ok: false, error: { kind: 'notJson' } });
    expect(parseSnapshot('{"format":"other"}', 3)).toMatchObject({
      ok: false,
      error: { kind: 'invalid' },
    });
    expect(parseSnapshot(serializeSnapshot({ ...snapshot, version: 2 }), 3)).toMatchObject({
      ok: false,
      error: { kind: 'newerFormat' },
    });
    expect(parseSnapshot(serializeSnapshot(snapshot), 2)).toMatchObject({
      ok: false,
      error: { kind: 'newerSchema', schemaVersion: 3 },
    });
  });
});

it('prunes only tombstones older than the retention window', () => {
  const now = new Date('2026-12-31T00:00:00.000Z');
  const records = [
    row('a', T1),
    tomb('old', '2026-01-01T00:00:00.000Z'),
    tomb('new', T2.replace('01-02', '12-01')),
  ];
  expect(pruneTombstones(records, now).map((r) => r.id)).toEqual(['a', 'new']);
});
