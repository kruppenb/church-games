import { describe, expect, it } from 'vitest';
import { weekPartitionFilter } from './row-key';
import {
  MemoryTableStore,
  TableStoreError,
  statusCodeOf,
} from './table-store';

const entity = (partitionKey: string, rowKey: string, initials = 'ABC') => ({
  partitionKey,
  rowKey,
  initials,
  score: 100,
  difficulty: 'big-kids',
  ts: '1756000000000',
});

describe('statusCodeOf', () => {
  it('reads statusCode from the SDK and fake error shapes', () => {
    expect(statusCodeOf(new TableStoreError(409, 'dup'))).toBe(409);
    expect(statusCodeOf({ statusCode: 404 })).toBe(404);
    expect(statusCodeOf({ status: 404 })).toBe(404);
    expect(statusCodeOf(new Error('boom'))).toBeUndefined();
    expect(statusCodeOf(null)).toBeUndefined();
  });
});

describe('MemoryTableStore', () => {
  it('returns entities sorted by partitionKey then rowKey', async () => {
    const store = new MemoryTableStore([
      entity('2026-08-23_survivors', '9999000_1756000000002'),
      entity('2026-08-23_quiz-showdown', '9999500_1756000000000'),
      entity('2026-08-23_survivors', '9998000_1756000000001'),
    ]);
    const rows = await store.list();
    expect(rows.map((r) => `${r.partitionKey}/${r.rowKey}`)).toEqual([
      '2026-08-23_quiz-showdown/9999500_1756000000000',
      '2026-08-23_survivors/9998000_1756000000001',
      '2026-08-23_survivors/9999000_1756000000002',
    ]);
  });

  it('supports the week partition-range filter', async () => {
    const store = new MemoryTableStore([
      entity('2026-08-16_survivors', '9999000_1756000000000'),
      entity('2026-08-23_survivors', '9999000_1756000000001'),
      entity('2026-08-23_quiz-showdown', '9999000_1756000000002'),
      entity('2026-08-30_survivors', '9999000_1756000000003'),
    ]);
    const rows = await store.list({ filter: weekPartitionFilter('2026-08-23') });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.partitionKey.startsWith('2026-08-23_'))).toBe(
      true,
    );
  });

  it('supports the exact-partition filter', async () => {
    const store = new MemoryTableStore([
      entity('2026-08-23_survivors', '9999000_1756000000000'),
      entity('2026-08-23_quiz-showdown', '9999000_1756000000001'),
    ]);
    const rows = await store.list({
      filter: "PartitionKey eq '2026-08-23_survivors'",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].partitionKey).toBe('2026-08-23_survivors');
  });

  it('throws on a filter form the service never issues', async () => {
    const store = new MemoryTableStore();
    await expect(store.list({ filter: "initials eq 'ABC'" })).rejects.toThrow(
      /unsupported filter/,
    );
  });

  it('honours top', async () => {
    const store = new MemoryTableStore(
      Array.from({ length: 5 }, (_, i) =>
        entity('2026-08-23_survivors', `999900${i}_175600000000${i}`),
      ),
    );
    expect(await store.list({ top: 2 })).toHaveLength(2);
    expect(await store.list({ top: 0 })).toHaveLength(0);
    expect(await store.list()).toHaveLength(5);
  });

  it('projects select, always keeping the keys', async () => {
    const store = new MemoryTableStore([
      entity('2026-08-23_survivors', '9999000_1756000000000'),
    ]);
    const [row] = await store.list({ select: ['PartitionKey'] });
    expect(row).toEqual({
      partitionKey: '2026-08-23_survivors',
      rowKey: '9999000_1756000000000',
    });

    const [full] = await store.list({ select: ['PartitionKey', 'initials'] });
    expect(full.initials).toBe('ABC');
    expect(full.score).toBeUndefined();
  });

  it('rejects a duplicate (partitionKey, rowKey) with 409', async () => {
    const store = new MemoryTableStore();
    const row = entity('2026-08-23_survivors', '9999000_1756000000000');
    await store.create(row);
    await expect(store.create(row)).rejects.toMatchObject({ statusCode: 409 });
    expect(store.size).toBe(1);
    expect(store.createCount).toBe(1);
  });

  it('rejects deleting a missing entity with 404', async () => {
    const store = new MemoryTableStore([
      entity('2026-08-23_survivors', '9999000_1756000000000'),
    ]);
    await expect(
      store.remove('2026-08-23_survivors', '0000000_0000000000000'),
    ).rejects.toMatchObject({ statusCode: 404 });
    await store.remove('2026-08-23_survivors', '9999000_1756000000000');
    expect(store.size).toBe(0);
    expect(store.removeCount).toBe(1);
  });

  it('does not hand out references into its own storage', async () => {
    const store = new MemoryTableStore([
      entity('2026-08-23_survivors', '9999000_1756000000000'),
    ]);
    const [row] = await store.list();
    row.initials = 'ZZZ';
    const [again] = await store.list();
    expect(again.initials).toBe('ABC');
  });
});
