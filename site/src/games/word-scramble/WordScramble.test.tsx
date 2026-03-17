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

  it("hint button shows hint text", () => {
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
