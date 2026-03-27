import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { LessonConfig } from "@/types/lesson";

// --- Test lesson fixture ---
const testLesson: LessonConfig = {
  meta: {
    week: "2026-W11",
    title: "The Good Shepherd",
    verseReference: "John 10:11",
    verseText:
      "I am the good shepherd. The good shepherd lays down his life for the sheep.",
    theme: "care",
    spotlightGame: "word-scramble",
    generatedAt: "2026-03-15T00:00:00Z",
  },
  questions: [],
  termPairs: [],
  keyWords: [
    { word: "SHEPHERD", hint: "One who watches over sheep", difficulty: "easy" },
    { word: "FLOCK", hint: "A group of sheep", difficulty: "easy" },
    { word: "PASTURE", hint: "Where sheep graze", difficulty: "medium" },
  ],
  story: { summary: "", scenes: [] },
};

// --- Mock hooks ---
vi.mock("@/hooks/useLesson", () => ({
  useLesson: vi.fn(() => ({
    lesson: testLesson,
    loading: false,
    error: null,
    source: "current" as const,
  })),
}));

vi.mock("@/hooks/useDifficulty", () => ({
  useDifficulty: vi.fn(() => ({
    difficulty: "little-kids" as const,
    setDifficulty: vi.fn(),
  })),
}));

vi.mock("@/hooks/useGameMode", () => ({
  useGameMode: vi.fn(() => ({
    mode: "individual" as const,
    setMode: vi.fn(),
  })),
}));

// Mock sound functions
vi.mock("@/lib/sounds", () => ({
  playCorrect: vi.fn(),
  playWrong: vi.fn(),
  playCelebration: vi.fn(),
}));

// Import the component after mocks are set up
import { WordScramble } from "./WordScramble";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("WordScramble", () => {
  it("renders the intro screen with lesson title", () => {
    render(<WordScramble />);

    expect(screen.getByText("Word Scramble")).toBeDefined();
    expect(screen.getByText("The Good Shepherd")).toBeDefined();
    expect(screen.getByText("Start")).toBeDefined();
  });

  it("clicking Start shows scrambled letters", () => {
    render(<WordScramble />);

    fireEvent.click(screen.getByText("Start"));

    // Should no longer see the intro title
    expect(screen.queryByText("Word Scramble")).toBeNull();

    // Should see letter tiles (the scrambled word)
    const tileContainer = screen.getByTestId("letter-tiles");
    expect(tileContainer).toBeDefined();
    const letterButtons = tileContainer.querySelectorAll(".letter-tile");
    expect(letterButtons.length).toBeGreaterThan(0);
  });

  it("scrambled letters contain all original letters (no missing/extra)", () => {
    render(<WordScramble />);

    fireEvent.click(screen.getByText("Start"));

    // The first easy word is "SHEPHERD" (8 letters)
    // Collect all letters from tiles
    const tileContainer = screen.getByTestId("letter-tiles");
    const letterButtons = tileContainer.querySelectorAll(".letter-tile");
    const scrambledLetters = Array.from(letterButtons)
      .map((btn) => btn.textContent ?? "")
      .sort()
      .join("");

    // Should contain exactly the same letters as the first easy word
    const firstEasyWord = testLesson.keyWords
      .filter((kw) => kw.difficulty === "easy")[0]
      .word.toUpperCase();
    const originalLetters = firstEasyWord.split("").sort().join("");

    expect(scrambledLetters).toBe(originalLetters);
  });

  it("correct number of answer slots matches word length", () => {
    render(<WordScramble />);

    fireEvent.click(screen.getByText("Start"));

    const slotsContainer = screen.getByTestId("answer-slots");
    const slots = slotsContainer.querySelectorAll(".answer-slot");

    const firstEasyWord = testLesson.keyWords.filter(
      (kw) => kw.difficulty === "easy",
    )[0].word;
    expect(slots.length).toBe(firstEasyWord.length);
  });

  it("hint button reveals a letter in the correct position (progressive hint)", () => {
    render(<WordScramble />);

    fireEvent.click(screen.getByText("Start"));

    const hintBtn = screen.getByTestId("hint-button");

    // Click hint once — should reveal the first letter
    fireEvent.click(hintBtn);

    // The first answer slot should now be filled and hinted
    const slotsContainer = screen.getByTestId("answer-slots");
    const firstSlot = slotsContainer.querySelector(".answer-slot");
    expect(firstSlot?.classList.contains("hinted")).toBe(true);
    expect(firstSlot?.textContent).not.toBe("");

    // The correct letter for position 0 of "SHEPHERD" is "S"
    const firstEasyWord = testLesson.keyWords.filter(
      (kw) => kw.difficulty === "easy",
    )[0].word.toUpperCase();
    expect(firstSlot?.textContent).toBe(firstEasyWord[0]);
  });

  it("hint button shows hint text bubble", () => {
    render(<WordScramble />);

    fireEvent.click(screen.getByText("Start"));

    // Click the hint button
    fireEvent.click(screen.getByLabelText("Show hint"));

    // Should show the hint text for the first easy word
    const firstEasyWord = testLesson.keyWords.filter(
      (kw) => kw.difficulty === "easy",
    )[0];
    expect(screen.getByText(firstEasyWord.hint)).toBeDefined();
  });

  it("hint button shows count (used/max)", () => {
    render(<WordScramble />);

    fireEvent.click(screen.getByText("Start"));

    // SHEPHERD has 8 letters, so max hints = 7
    const hintBtn = screen.getByTestId("hint-button");
    expect(hintBtn.textContent).toContain("(0/7)");

    // After one hint
    fireEvent.click(hintBtn);
    expect(hintBtn.textContent).toContain("(1/7)");
  });

  it("hinted slots cannot be removed by tapping", () => {
    render(<WordScramble />);

    fireEvent.click(screen.getByText("Start"));

    // Use a hint to lock in the first letter
    fireEvent.click(screen.getByTestId("hint-button"));

    const slotsContainer = screen.getByTestId("answer-slots");
    const hintedSlot = slotsContainer.querySelector(
      ".answer-slot.hinted",
    ) as HTMLElement;

    // Hinted slot should be disabled (cannot remove)
    expect(hintedSlot.hasAttribute("disabled")).toBe(true);
  });

  it("shuffle button rearranges available tiles", () => {
    render(<WordScramble />);

    fireEvent.click(screen.getByText("Start"));

    const shuffleBtn = screen.getByTestId("shuffle-button");
    expect(shuffleBtn).toBeDefined();

    // Capture the letters before shuffle
    const tileContainer = screen.getByTestId("letter-tiles");
    const beforeLetters = Array.from(
      tileContainer.querySelectorAll(".letter-tile"),
    ).map((btn) => btn.textContent ?? "");

    // Click shuffle multiple times to increase chance of different order
    for (let i = 0; i < 5; i++) {
      fireEvent.click(shuffleBtn);
    }

    const afterLetters = Array.from(
      tileContainer.querySelectorAll(".letter-tile"),
    ).map((btn) => btn.textContent ?? "");

    // Same letters should still be present (sorted comparison)
    expect([...afterLetters].sort().join("")).toBe(
      [...beforeLetters].sort().join(""),
    );
  });

  it("tapping a letter tile moves it to the answer slot", () => {
    render(<WordScramble />);

    fireEvent.click(screen.getByText("Start"));

    const tileContainer = screen.getByTestId("letter-tiles");
    const firstTile = tileContainer.querySelector(
      ".letter-tile:not(.used)",
    ) as HTMLElement;
    const letter = firstTile.textContent ?? "";

    fireEvent.click(firstTile);

    // The tile should now be marked as used
    expect(firstTile.classList.contains("used")).toBe(true);

    // The first answer slot should contain the letter
    const slotsContainer = screen.getByTestId("answer-slots");
    const firstSlot = slotsContainer.querySelector(".answer-slot.filled");
    expect(firstSlot).not.toBeNull();
    expect(firstSlot?.textContent).toBe(letter);
  });
});
