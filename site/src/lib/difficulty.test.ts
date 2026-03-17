import { describe, it, expect } from "vitest";
import { filterByDifficulty } from "@/lib/difficulty";

interface TestItem {
  name: string;
  difficulty: string;
}

const items: TestItem[] = [
  { name: "easy-1", difficulty: "easy" },
  { name: "easy-2", difficulty: "easy" },
  { name: "medium-1", difficulty: "medium" },
  { name: "medium-2", difficulty: "medium" },
  { name: "hard-1", difficulty: "hard" },
  { name: "hard-2", difficulty: "hard" },
];

describe("filterByDifficulty", () => {
  it('little-kids mode returns only "easy" items', () => {
    const result = filterByDifficulty(items, "little-kids");
    expect(result).toHaveLength(2);
    expect(result.every((item) => item.difficulty === "easy")).toBe(true);
    expect(result.map((i) => i.name)).toEqual(["easy-1", "easy-2"]);
  });

  it('big-kids mode returns only "medium" and "hard" items', () => {
    const result = filterByDifficulty(items, "big-kids");
    expect(result).toHaveLength(4);
    expect(
      result.every(
        (item) => item.difficulty === "medium" || item.difficulty === "hard",
      ),
    ).toBe(true);
    expect(result.map((i) => i.name)).toEqual([
      "medium-1",
      "medium-2",
      "hard-1",
      "hard-2",
    ]);
  });

  it("empty input returns empty output", () => {
    expect(filterByDifficulty([], "little-kids")).toEqual([]);
    expect(filterByDifficulty([], "big-kids")).toEqual([]);
  });

  it("all items of one difficulty returns correct subset", () => {
    const allEasy: TestItem[] = [
      { name: "a", difficulty: "easy" },
      { name: "b", difficulty: "easy" },
      { name: "c", difficulty: "easy" },
    ];
    // little-kids: all of them
    expect(filterByDifficulty(allEasy, "little-kids")).toHaveLength(3);
    // big-kids: none of them
    expect(filterByDifficulty(allEasy, "big-kids")).toHaveLength(0);

    const allHard: TestItem[] = [
      { name: "x", difficulty: "hard" },
      { name: "y", difficulty: "hard" },
    ];
    // little-kids: none
    expect(filterByDifficulty(allHard, "little-kids")).toHaveLength(0);
    // big-kids: all
    expect(filterByDifficulty(allHard, "big-kids")).toHaveLength(2);
  });
});
