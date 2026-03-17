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
    spotlightGame: "quiz-showdown",
    generatedAt: "2026-03-15T00:00:00Z",
  },
  questions: [
    {
      id: "q1",
      text: "Who is the good shepherd?",
      options: ["Jesus", "Moses", "David", "Abraham"],
      correctIndex: 0,
      difficulty: "easy",
      explanation: "Jesus calls himself the good shepherd in John 10:11.",
      format: "multiple-choice",
      category: "recall",
    },
    {
      id: "q2",
      text: "What does the shepherd do for the sheep?",
      options: ["Ignores them", "Lays down his life", "Sells them", "Hides"],
      correctIndex: 1,
      difficulty: "easy",
      explanation: "The good shepherd lays down his life for the sheep.",
      format: "multiple-choice",
      category: "understanding",
    },
    {
      id: "q3",
      text: "In which book is the good shepherd passage?",
      options: ["Matthew", "Mark", "Luke", "John"],
      correctIndex: 3,
      difficulty: "easy",
      explanation: "The good shepherd passage is in the Gospel of John.",
      format: "multiple-choice",
      category: "recall",
    },
  ],
  termPairs: [],
  keyWords: [],
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

// Mock sound functions
vi.mock("@/lib/sounds", () => ({
  playCorrect: vi.fn(),
  playWrong: vi.fn(),
  playCelebration: vi.fn(),
}));

// Import the component after mocks are set up
import { QuizShowdown } from "./QuizShowdown";

// Map from question text to { correctOption, wrongOption }
const questionMap: Record<string, { correct: string; wrong: string }> = {
  "Who is the good shepherd?": { correct: "Jesus", wrong: "Moses" },
  "What does the shepherd do for the sheep?": {
    correct: "Lays down his life",
    wrong: "Ignores them",
  },
  "In which book is the good shepherd passage?": {
    correct: "John",
    wrong: "Matthew",
  },
};

/** Find the currently displayed question text and return its correct/wrong option. */
function identifyCurrentQuestion(): {
  correct: string;
  wrong: string;
} {
  for (const [qText, answers] of Object.entries(questionMap)) {
    if (screen.queryByText(qText)) {
      return answers;
    }
  }
  throw new Error("Could not find any known question on screen");
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("QuizShowdown", () => {
  it("renders the intro screen with lesson title", () => {
    render(<QuizShowdown />);

    expect(screen.getByText("Quiz Showdown")).toBeDefined();
    expect(screen.getByText("The Good Shepherd")).toBeDefined();
    expect(screen.getByText(/Ready\? Let's Go!/)).toBeDefined();
  });

  it('clicking "Start" transitions to the playing state', () => {
    render(<QuizShowdown />);

    const startButton = screen.getByText(/Ready\? Let's Go!/);
    fireEvent.click(startButton);

    // In playing state, we should see 4 answer option buttons
    const answerButtons = screen.getAllByRole("button");
    expect(answerButtons.length).toBe(4);

    // The intro heading should be gone
    expect(screen.queryByText("Quiz Showdown")).toBeNull();
  });

  it("displays a question with 4 answer options", () => {
    render(<QuizShowdown />);
    fireEvent.click(screen.getByText(/Ready\? Let's Go!/));

    // Should show 4 answer buttons
    const answerButtons = screen.getAllByRole("button");
    expect(answerButtons).toHaveLength(4);

    // Check that answer labels A, B, C, D are present
    expect(screen.getByText("A")).toBeDefined();
    expect(screen.getByText("B")).toBeDefined();
    expect(screen.getByText("C")).toBeDefined();
    expect(screen.getByText("D")).toBeDefined();
  });

  it('clicking the correct answer shows "Correct!" feedback and increases score', () => {
    render(<QuizShowdown />);
    fireEvent.click(screen.getByText(/Ready\? Let's Go!/));

    const { correct } = identifyCurrentQuestion();
    fireEvent.click(screen.getByText(correct));

    // Should show "Correct!" feedback
    expect(screen.getByText("Correct!")).toBeDefined();
  });

  it('clicking a wrong answer shows "Not quite!" feedback', () => {
    render(<QuizShowdown />);
    fireEvent.click(screen.getByText(/Ready\? Let's Go!/));

    const { wrong } = identifyCurrentQuestion();
    fireEvent.click(screen.getByText(wrong));

    // Should show "Not quite!" feedback
    expect(screen.getByText("Not quite!")).toBeDefined();
  });
});
