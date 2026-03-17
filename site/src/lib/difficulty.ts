/**
 * Filters an array of items by difficulty based on the current difficulty mode.
 *
 * - "little-kids" keeps only "easy" items
 * - "big-kids" keeps "medium" and "hard" items
 */
export function filterByDifficulty<T extends { difficulty: string }>(
  items: T[],
  mode: "little-kids" | "big-kids",
): T[] {
  if (mode === "little-kids") {
    return items.filter((item) => item.difficulty === "easy");
  }
  return items.filter(
    (item) => item.difficulty === "medium" || item.difficulty === "hard",
  );
}
