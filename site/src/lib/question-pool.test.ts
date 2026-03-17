import { describe, it, expect } from "vitest";
import { QuestionPool } from "@/lib/question-pool";
import type { Question } from "@/types/lesson";

/** Helper to create a minimal Question fixture. */
function makeQuestion(
  id: string,
  difficulty: "easy" | "medium" | "hard",
): Question {
  return {
    id,
    text: `Question ${id}`,
    options: ["A", "B", "C", "D"],
    correctIndex: 0,
    difficulty,
    explanation: `Explanation for ${id}`,
    format: "multiple-choice",
    category: "recall",
  };
}

const allQuestions: Question[] = [
  makeQuestion("e1", "easy"),
  makeQuestion("e2", "easy"),
  makeQuestion("e3", "easy"),
  makeQuestion("m1", "medium"),
  makeQuestion("m2", "medium"),
  makeQuestion("h1", "hard"),
  makeQuestion("h2", "hard"),
];

describe("QuestionPool", () => {
  it('filters to only easy questions for "little-kids"', () => {
    const pool = new QuestionPool(allQuestions, "little-kids");
    expect(pool.total).toBe(3);

    const ids: string[] = [];
    while (pool.hasMore()) {
      const q = pool.next()!;
      ids.push(q.id);
      expect(q.difficulty).toBe("easy");
    }
    expect(ids).toHaveLength(3);
  });

  it('filters to medium and hard questions for "big-kids"', () => {
    const pool = new QuestionPool(allQuestions, "big-kids");
    expect(pool.total).toBe(4);

    const ids: string[] = [];
    while (pool.hasMore()) {
      const q = pool.next()!;
      ids.push(q.id);
      expect(["medium", "hard"]).toContain(q.difficulty);
    }
    expect(ids).toHaveLength(4);
  });

  it("next() returns a question and marks it consumed", () => {
    const pool = new QuestionPool(allQuestions, "little-kids");
    expect(pool.consumed).toBe(0);

    const q = pool.next();
    expect(q).not.toBeNull();
    expect(q!.difficulty).toBe("easy");
    expect(pool.consumed).toBe(1);
  });

  it("next() returns null when pool exhausted", () => {
    const pool = new QuestionPool(allQuestions, "little-kids");
    // Drain all 3 easy questions
    pool.next();
    pool.next();
    pool.next();
    expect(pool.next()).toBeNull();
  });

  it("hasMore() returns true when questions remain, false when exhausted", () => {
    const pool = new QuestionPool(allQuestions, "little-kids");
    expect(pool.hasMore()).toBe(true);

    pool.next();
    pool.next();
    expect(pool.hasMore()).toBe(true);

    pool.next();
    expect(pool.hasMore()).toBe(false);
  });

  it("reset() makes all questions available again", () => {
    const pool = new QuestionPool(allQuestions, "little-kids");
    pool.next();
    pool.next();
    pool.next();
    expect(pool.hasMore()).toBe(false);
    expect(pool.consumed).toBe(3);

    pool.reset();
    expect(pool.hasMore()).toBe(true);
    expect(pool.consumed).toBe(0);
    expect(pool.total).toBe(3);

    // Should be able to get all 3 again
    const q1 = pool.next();
    const q2 = pool.next();
    const q3 = pool.next();
    expect(q1).not.toBeNull();
    expect(q2).not.toBeNull();
    expect(q3).not.toBeNull();
    expect(pool.hasMore()).toBe(false);
  });

  it("consumed and total properties are correct", () => {
    const pool = new QuestionPool(allQuestions, "big-kids");
    expect(pool.total).toBe(4);
    expect(pool.consumed).toBe(0);

    pool.next();
    expect(pool.consumed).toBe(1);

    pool.next();
    expect(pool.consumed).toBe(2);

    pool.next();
    pool.next();
    expect(pool.consumed).toBe(4);
    expect(pool.total).toBe(4);
  });

  it("no repeated questions until pool is exhausted", () => {
    const pool = new QuestionPool(allQuestions, "big-kids");
    const ids = new Set<string>();

    while (pool.hasMore()) {
      const q = pool.next()!;
      expect(ids.has(q.id)).toBe(false);
      ids.add(q.id);
    }

    expect(ids.size).toBe(pool.total);
  });

  it("questions are shuffled (order is not always the same)", () => {
    // Use a larger set for a more reliable probabilistic test
    const manyQuestions: Question[] = Array.from({ length: 20 }, (_, i) =>
      makeQuestion(`e${i}`, "easy"),
    );

    const orders: string[] = [];
    for (let trial = 0; trial < 10; trial++) {
      const pool = new QuestionPool(manyQuestions, "little-kids");
      const ids: string[] = [];
      while (pool.hasMore()) {
        ids.push(pool.next()!.id);
      }
      orders.push(ids.join(","));
    }

    // With 20 items and 10 trials, the probability of all orders being
    // identical is astronomically small (1/20!^9).
    const uniqueOrders = new Set(orders);
    expect(uniqueOrders.size).toBeGreaterThan(1);
  });
});
