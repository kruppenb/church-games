import type { Question } from "@/types/lesson";
import { filterByDifficulty } from "@/lib/difficulty";

/**
 * Manages a shuffled pool of questions, filtered by difficulty.
 * Guarantees no repeats until the pool is exhausted.
 */
export class QuestionPool {
  private pool: Question[];
  private index: number;

  /** Total number of questions available after filtering. */
  readonly total: number;

  constructor(
    questions: Question[],
    difficulty: "little-kids" | "big-kids",
  ) {
    this.pool = shuffle(filterByDifficulty(questions, difficulty));
    this.total = this.pool.length;
    this.index = 0;
  }

  /** Number of questions consumed so far. */
  get consumed(): number {
    return this.index;
  }

  /** Returns the next unused question, or null if exhausted. */
  next(): Question | null {
    if (!this.hasMore()) return null;
    return this.pool[this.index++];
  }

  /** Whether there are more questions remaining. */
  hasMore(): boolean {
    return this.index < this.pool.length;
  }

  /** Resets the pool, re-shuffles, and starts over. */
  reset(): void {
    this.pool = shuffle([...this.pool]);
    this.index = 0;
  }
}

/** Fisher-Yates shuffle — returns a new array. */
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
