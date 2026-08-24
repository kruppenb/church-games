/**
 * All leaderboard business logic, expressed against the `TableStore` interface
 * so it is fully unit-testable with `MemoryTableStore`.
 *
 * Invariants (shared with the device-local store in `site/`):
 * - top 10 per (week, game), ties broken by earlier timestamp;
 * - equal-to-10th on a full board does NOT qualify;
 * - the newest 6 weeks are retained, older ones are pruned (and hidden on read).
 */

import {
  decodeRowKey,
  encodePartitionKey,
  encodeRowKey,
  weekKeyFromPartitionKey,
  weekPartitionFilter,
} from './row-key';
import {
  MAX_ENTRIES,
  WEEKS_TO_KEEP,
  type Difficulty,
  type Submission,
  isDifficulty,
} from './validation';
import { statusCodeOf, type StoredEntity, type TableStore } from './table-store';
import { DEFAULT_TIME_ZONE, getWeekKey } from './week-key';

export interface Entry {
  initials: string;
  score: number;
  difficulty: Difficulty;
  ts: number;
  rowKey: string;
}

export interface WeekBoards {
  weekKey: string;
  boards: Record<string, Entry[]>;
}

export interface SubmitResult {
  rank: number;
  weekKey: string;
  board: Entry[];
}

export interface LeaderboardServiceOptions {
  store: TableStore;
  /** Injectable clock — tests pin it, production leaves it. */
  now?: () => Date;
  timeZone?: string;
}

/** Decode one stored entity; `ts` always comes from the rowKey. */
function toEntry(entity: StoredEntity): Entry | null {
  const decoded = decodeRowKey(entity.rowKey);
  if (!decoded) return null;
  if (typeof entity.initials !== 'string' || !/^[A-Z]{3}$/.test(entity.initials)) {
    return null;
  }
  const score =
    typeof entity.score === 'number' && Number.isFinite(entity.score)
      ? entity.score
      : decoded.score;
  return {
    initials: entity.initials,
    score,
    difficulty: isDifficulty(entity.difficulty)
      ? entity.difficulty
      : 'little-kids',
    ts: decoded.ts,
    rowKey: entity.rowKey,
  };
}

export class LeaderboardService {
  private readonly store: TableStore;
  private readonly now: () => Date;
  private readonly timeZone: string;

  constructor(options: LeaderboardServiceOptions) {
    this.store = options.store;
    this.now = options.now ?? (() => new Date());
    this.timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  }

  /** Server-computed current Sunday in the configured timezone. */
  currentWeekKey(): string {
    return getWeekKey(this.now(), this.timeZone);
  }

  /** `"current"` resolves to the server's week; anything else passes through. */
  resolveWeekKey(input: string): string {
    return input === 'current' ? this.currentWeekKey() : input;
  }

  /** Every distinct stored week, newest first. */
  async listStoredWeeks(): Promise<string[]> {
    const rows = await this.store.list({ select: ['PartitionKey'] });
    const weeks = new Set<string>();
    for (const row of rows) {
      const weekKey = weekKeyFromPartitionKey(row.partitionKey);
      if (weekKey) weeks.add(weekKey);
    }
    return [...weeks].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }

  /** The newest `WEEKS_TO_KEEP` stored weeks — what the API exposes. */
  async listRetainedWeeks(): Promise<string[]> {
    return (await this.listStoredWeeks()).slice(0, WEEKS_TO_KEEP);
  }

  /**
   * All boards for one week. Weeks outside the retained set read as empty —
   * the lazy backstop for the retention timer.
   */
  async getWeekBoards(weekKeyInput: string): Promise<WeekBoards> {
    const weekKey = this.resolveWeekKey(weekKeyInput);
    const retained = await this.listRetainedWeeks();
    if (!retained.includes(weekKey)) return { weekKey, boards: {} };

    const rows = await this.store.list({ filter: weekPartitionFilter(weekKey) });
    const boards: Record<string, Entry[]> = {};
    for (const row of rows) {
      const gameId = row.partitionKey.slice(weekKey.length + 1);
      if (!gameId) continue;
      const entry = toEntry(row);
      if (!entry) continue;
      const board = boards[gameId] ?? (boards[gameId] = []);
      if (board.length < MAX_ENTRIES) board.push(entry);
    }
    return { weekKey, boards };
  }

  /** Top `limit` entries of one (week, game) partition, best first. */
  async getBoard(
    weekKey: string,
    gameId: string,
    limit: number = MAX_ENTRIES,
  ): Promise<Entry[]> {
    const partitionKey = encodePartitionKey(weekKey, gameId);
    // Safe to interpolate: weekKey matched WEEK_KEY_RE, gameId is enum-checked.
    const rows = await this.store.list({
      filter: partitionFilter(partitionKey),
      top: limit,
    });
    const entries: Entry[] = [];
    for (const row of rows) {
      const entry = toEntry(row);
      if (entry) entries.push(entry);
    }
    return entries;
  }

  /**
   * Insert into the CURRENT week and return the refreshed top 10.
   * Non-qualifying scores are a normal 200 with `rank: -1` and no write.
   */
  async submitScore(
    gameId: string,
    submission: Submission,
  ): Promise<SubmitResult> {
    const weekKey = this.currentWeekKey();
    const partitionKey = encodePartitionKey(weekKey, gameId);

    const existing = await this.getBoard(weekKey, gameId, MAX_ENTRIES);
    if (
      existing.length >= MAX_ENTRIES &&
      submission.score <= existing[MAX_ENTRIES - 1].score
    ) {
      return { rank: -1, weekKey, board: existing };
    }

    const rowKey = await this.insert(partitionKey, submission);

    // Re-read 11 so a full board reveals exactly one entry to trim.
    const after = await this.getBoard(weekKey, gameId, MAX_ENTRIES + 1);
    if (after.length > MAX_ENTRIES) {
      const overflow = after[MAX_ENTRIES];
      try {
        await this.store.remove(partitionKey, overflow.rowKey);
      } catch {
        // Best effort: a concurrent submit may already have trimmed it.
      }
    }

    const board = after.slice(0, MAX_ENTRIES);
    const index = board.findIndex((entry) => entry.rowKey === rowKey);
    return { rank: index === -1 ? -1 : index + 1, weekKey, board };
  }

  /** Write the entity; on a same-score/same-millisecond clash retry at ts + 1. */
  private async insert(
    partitionKey: string,
    submission: Submission,
  ): Promise<string> {
    const ts = this.now().getTime();
    for (const candidateTs of [ts, ts + 1]) {
      const rowKey = encodeRowKey(submission.score, candidateTs);
      try {
        await this.store.create({
          partitionKey,
          rowKey,
          initials: submission.initials,
          score: submission.score,
          difficulty: submission.difficulty,
          ts: String(candidateTs),
        });
        return rowKey;
      } catch (error) {
        if (statusCodeOf(error) !== 409 || candidateTs !== ts) throw error;
      }
    }
    throw new Error('unreachable');
  }

  /** `true` when an entity was deleted, `false` when it did not exist. */
  async deleteEntry(
    weekKey: string,
    gameId: string,
    rowKey: string,
  ): Promise<boolean> {
    try {
      await this.store.remove(encodePartitionKey(weekKey, gameId), rowKey);
      return true;
    } catch (error) {
      if (statusCodeOf(error) === 404) return false;
      throw error;
    }
  }

  /** Delete every entity outside the newest `WEEKS_TO_KEEP` weeks. */
  async pruneOldWeeks(): Promise<number> {
    const rows = await this.store.list({ select: ['PartitionKey', 'RowKey'] });
    const weeks = new Set<string>();
    for (const row of rows) {
      const weekKey = weekKeyFromPartitionKey(row.partitionKey);
      if (weekKey) weeks.add(weekKey);
    }
    const kept = new Set(
      [...weeks]
        .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
        .slice(0, WEEKS_TO_KEEP),
    );

    let deleted = 0;
    for (const row of rows) {
      const weekKey = weekKeyFromPartitionKey(row.partitionKey);
      if (weekKey && kept.has(weekKey)) continue;
      try {
        await this.store.remove(row.partitionKey, row.rowKey);
        deleted += 1;
      } catch (error) {
        if (statusCodeOf(error) !== 404) throw error;
      }
    }
    return deleted;
  }
}

/** Exact-partition OData filter. */
function partitionFilter(partitionKey: string): string {
  return `PartitionKey eq '${partitionKey}'`;
}
