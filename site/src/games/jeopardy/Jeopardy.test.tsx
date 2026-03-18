import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import type { LessonConfig } from "@/types/lesson";

// --- Test lesson fixture (25 questions about "The Good Shepherd") ---
const testLesson: LessonConfig = {
  meta: {
    week: "2026-W11",
    title: "The Good Shepherd",
    verseReference: "John 10:11",
    verseText:
      "I am the good shepherd. The good shepherd lays down his life for the sheep.",
    theme: "care",
    spotlightGame: "jeopardy",
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
      text: "What does the good shepherd do for his sheep?",
      options: ["Ignores them", "Lays down his life", "Sells them", "Hides from them"],
      correctIndex: 1,
      difficulty: "easy",
      explanation: "The good shepherd lays down his life for the sheep.",
      format: "multiple-choice",
      category: "understanding",
    },
    {
      id: "q3",
      text: "In which book of the Bible is the good shepherd passage?",
      options: ["Matthew", "Mark", "Luke", "John"],
      correctIndex: 3,
      difficulty: "easy",
      explanation: "The good shepherd passage is in the Gospel of John.",
      format: "multiple-choice",
      category: "recall",
    },
    {
      id: "q4",
      text: "What chapter in John talks about the good shepherd?",
      options: ["Chapter 3", "Chapter 7", "Chapter 10", "Chapter 15"],
      correctIndex: 2,
      difficulty: "easy",
      explanation: "John chapter 10 contains the good shepherd discourse.",
      format: "multiple-choice",
      category: "recall",
    },
    {
      id: "q5",
      text: "What animal does Jesus compare his followers to?",
      options: ["Lions", "Sheep", "Eagles", "Horses"],
      correctIndex: 1,
      difficulty: "easy",
      explanation: "Jesus calls his followers sheep and himself the shepherd.",
      format: "multiple-choice",
      category: "recall",
    },
    {
      id: "q6",
      text: "What does a shepherd use to protect his sheep?",
      options: ["A sword", "A staff", "A shield", "A bow"],
      correctIndex: 1,
      difficulty: "easy",
      explanation: "Shepherds traditionally use a staff to guide and protect sheep.",
      format: "multiple-choice",
      category: "recall",
    },
    {
      id: "q7",
      text: "What does the hired hand do when the wolf comes?",
      options: ["Fights the wolf", "Runs away", "Calls for help", "Hides the sheep"],
      correctIndex: 1,
      difficulty: "easy",
      explanation: "The hired hand abandons the sheep and runs away (John 10:12).",
      format: "multiple-choice",
      category: "understanding",
    },
    {
      id: "q8",
      text: "How does the good shepherd feel about each sheep?",
      options: ["Indifferent", "He knows each one by name", "Annoyed", "He only cares about the group"],
      correctIndex: 1,
      difficulty: "easy",
      explanation: "The good shepherd knows his sheep individually by name.",
      format: "multiple-choice",
      category: "understanding",
    },
    {
      id: "q9",
      text: "Why does the good shepherd lay down his life?",
      options: ["Because he is forced to", "Because he loves the sheep", "Because he is tricked", "Because he is careless"],
      correctIndex: 1,
      difficulty: "medium",
      explanation: "The shepherd lays down his life out of love for his sheep.",
      format: "multiple-choice",
      category: "understanding",
    },
    {
      id: "q10",
      text: "What is the 'gate' that Jesus mentions in John 10?",
      options: ["A garden gate", "Jesus himself", "The temple door", "Peter"],
      correctIndex: 1,
      difficulty: "medium",
      explanation: "Jesus says 'I am the gate for the sheep' (John 10:7).",
      format: "multiple-choice",
      category: "recall",
    },
    {
      id: "q11",
      text: "What does it mean that Jesus knows his sheep?",
      options: ["He has a list", "He has a personal relationship with each one", "He counts them", "He brands them"],
      correctIndex: 1,
      difficulty: "medium",
      explanation: "Knowing his sheep means having a personal, loving relationship.",
      format: "multiple-choice",
      category: "understanding",
    },
    {
      id: "q12",
      text: "Who are the 'other sheep' Jesus mentions?",
      options: ["Wild animals", "Goats", "People from other nations", "Angels"],
      correctIndex: 2,
      difficulty: "medium",
      explanation: "The other sheep refers to Gentiles who would also follow Jesus.",
      format: "multiple-choice",
      category: "understanding",
    },
    {
      id: "q13",
      text: "What is a thief's purpose when entering the sheep pen?",
      options: ["To help", "To steal, kill, and destroy", "To count sheep", "To feed them"],
      correctIndex: 1,
      difficulty: "medium",
      explanation: "Jesus says the thief comes to steal, kill, and destroy (John 10:10).",
      format: "multiple-choice",
      category: "recall",
    },
    {
      id: "q14",
      text: "What did Jesus come to give his sheep?",
      options: ["Money", "Life to the full", "Fame", "Land"],
      correctIndex: 1,
      difficulty: "medium",
      explanation: "Jesus says 'I have come that they may have life, and have it to the full.'",
      format: "multiple-choice",
      category: "recall",
    },
    {
      id: "q15",
      text: "How can we be like a good shepherd to others?",
      options: ["By ignoring them", "By caring for and protecting them", "By competing with them", "By avoiding them"],
      correctIndex: 1,
      difficulty: "medium",
      explanation: "We follow Jesus' example by caring for and protecting others.",
      format: "multiple-choice",
      category: "application",
    },
    {
      id: "q16",
      text: "Which Old Testament figure was also a shepherd?",
      options: ["Solomon", "David", "Elijah", "Daniel"],
      correctIndex: 1,
      difficulty: "easy",
      explanation: "David was a shepherd before becoming king of Israel.",
      format: "multiple-choice",
      category: "recall",
    },
    {
      id: "q17",
      text: "What Psalm talks about the Lord being our shepherd?",
      options: ["Psalm 1", "Psalm 23", "Psalm 51", "Psalm 100"],
      correctIndex: 1,
      difficulty: "easy",
      explanation: "Psalm 23 begins with 'The Lord is my shepherd.'",
      format: "multiple-choice",
      category: "recall",
    },
    {
      id: "q18",
      text: "If a friend is being bullied, what would the Good Shepherd want you to do?",
      options: ["Walk away", "Join in", "Stand up and help your friend", "Laugh"],
      correctIndex: 2,
      difficulty: "hard",
      explanation: "The Good Shepherd protects; we should stand up for those in need.",
      format: "multiple-choice",
      category: "application",
    },
    {
      id: "q19",
      text: "How does knowing Jesus is our shepherd help when we are scared?",
      options: ["It doesn't help", "We know he is always watching over us", "We should be more scared", "We have to figure it out alone"],
      correctIndex: 1,
      difficulty: "hard",
      explanation: "Knowing Jesus is our shepherd gives us comfort and security.",
      format: "multiple-choice",
      category: "application",
    },
    {
      id: "q20",
      text: "What does 'laying down his life' ultimately refer to?",
      options: ["Taking a nap", "Jesus dying on the cross", "Getting tired", "Sleeping in a field"],
      correctIndex: 1,
      difficulty: "hard",
      explanation: "Laying down his life refers to Jesus' sacrificial death on the cross.",
      format: "multiple-choice",
      category: "understanding",
    },
    {
      id: "q21",
      text: "Why is a shepherd a good image for a leader?",
      options: ["Shepherds are rich", "Shepherds guide, protect, and know their flock", "Shepherds are famous", "Shepherds work alone"],
      correctIndex: 1,
      difficulty: "hard",
      explanation: "A shepherd guides, protects, and personally knows the flock.",
      format: "multiple-choice",
      category: "understanding",
    },
    {
      id: "q22",
      text: "What should you do when you feel lost, like a sheep without a shepherd?",
      options: ["Panic", "Pray and trust God to guide you", "Give up", "Blame others"],
      correctIndex: 1,
      difficulty: "hard",
      explanation: "When we feel lost, we can pray and trust God to guide us back.",
      format: "multiple-choice",
      category: "application",
    },
    {
      id: "q23",
      text: "How do sheep recognize their shepherd?",
      options: ["By his clothes", "By his voice", "By his hat", "They don't"],
      correctIndex: 1,
      difficulty: "medium",
      explanation: "Jesus says his sheep listen to his voice and follow him (John 10:27).",
      format: "multiple-choice",
      category: "recall",
    },
    {
      id: "q24",
      text: "What is one way we can 'hear' Jesus' voice today?",
      options: ["Through a phone call", "By reading the Bible and praying", "On the radio", "We can't"],
      correctIndex: 1,
      difficulty: "hard",
      explanation: "We hear Jesus' voice through Scripture, prayer, and the Holy Spirit.",
      format: "multiple-choice",
      category: "application",
    },
    {
      id: "q25",
      text: "What promise does Jesus make about his sheep in John 10:28?",
      options: ["They will be rich", "No one can snatch them from his hand", "They will never be sad", "They will never get sick"],
      correctIndex: 1,
      difficulty: "hard",
      explanation: "Jesus promises that no one can snatch his sheep from his hand.",
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
import { Jeopardy } from "./Jeopardy";
import { playCorrect, playWrong } from "@/lib/sounds";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Jeopardy", () => {
  it("renders intro screen with Jeopardy title and player select", () => {
    render(<Jeopardy />);

    expect(screen.getByText("Jeopardy")).toBeDefined();
    expect(screen.getByText("The Good Shepherd")).toBeDefined();
    expect(screen.getByText("1 Player")).toBeDefined();
    expect(screen.getByText("2 Players")).toBeDefined();
    expect(screen.getByText("Start")).toBeDefined();
  });

  it("clicking Start shows the board with 5 category headers", () => {
    render(<Jeopardy />);

    fireEvent.click(screen.getByText("Start"));

    // Should have 5 header cells
    const headerCells = document.querySelectorAll(".jeopardy-header-cell");
    expect(headerCells.length).toBe(5);

    // Should have 25 value cells
    const valueCells = document.querySelectorAll(".jeopardy-cell");
    expect(valueCells.length).toBe(25);

    // Intro title should be gone
    expect(screen.queryByText("Jeopardy")).toBeNull();
  });

  it("clicking a cell shows the question overlay", () => {
    render(<Jeopardy />);
    fireEvent.click(screen.getByText("Start"));

    // Click the first $100 cell
    const firstCell = screen.getAllByText("$100")[0];
    fireEvent.click(firstCell);

    // Question overlay should appear
    const overlay = document.querySelector(".jeopardy-question-overlay");
    expect(overlay).not.toBeNull();

    // Should show answer buttons
    const answerButtons = document.querySelectorAll(".quiz-answer-btn");
    expect(answerButtons.length).toBeGreaterThanOrEqual(2);
  });

  it("clicking correct answer increases score by cell value", () => {
    render(<Jeopardy />);
    fireEvent.click(screen.getByText("Start"));

    // Score should start at 0
    expect(screen.getByText("$0")).toBeDefined();

    // Click a $100 cell
    const cell = screen.getAllByText("$100")[0];
    fireEvent.click(cell);

    // Find the correct answer for the displayed question
    const overlay = document.querySelector(".jeopardy-question-panel");
    expect(overlay).not.toBeNull();

    // Get the question being displayed and find its correct answer
    const questionText = document.querySelector(".jeopardy-question-text")?.textContent;
    const question = testLesson.questions.find((q) => q.text === questionText);
    expect(question).toBeDefined();

    // Click the correct answer
    const answerBtns = document.querySelectorAll(".quiz-answer-btn");
    fireEvent.click(answerBtns[question!.correctIndex]);

    expect(playCorrect).toHaveBeenCalled();

    // Advance timers to let the setTimeout complete
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Score should have increased (at least $100)
    expect(screen.queryByText("$0")).toBeNull();
  });

  it("clicking wrong answer doesn't change score", () => {
    render(<Jeopardy />);
    fireEvent.click(screen.getByText("Start"));

    // Score should start at 0
    expect(screen.getByText("$0")).toBeDefined();

    // Click a $100 cell
    const cell = screen.getAllByText("$100")[0];
    fireEvent.click(cell);

    // Get the question being displayed and find a wrong answer
    const questionText = document.querySelector(".jeopardy-question-text")?.textContent;
    const question = testLesson.questions.find((q) => q.text === questionText);
    expect(question).toBeDefined();

    // Click a wrong answer (pick index that's not correctIndex)
    const wrongIndex = question!.correctIndex === 0 ? 1 : 0;
    const answerBtns = document.querySelectorAll(".quiz-answer-btn");
    fireEvent.click(answerBtns[wrongIndex]);

    expect(playWrong).toHaveBeenCalled();

    // Advance timers
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Score should still be $0
    expect(screen.getByText("$0")).toBeDefined();
  });

  it("answered cells become non-clickable", () => {
    render(<Jeopardy />);
    fireEvent.click(screen.getByText("Start"));

    // Click a $100 cell
    const cell = screen.getAllByText("$100")[0];
    fireEvent.click(cell);

    // Answer the question (click any answer)
    const answerBtns = document.querySelectorAll(".quiz-answer-btn");
    fireEvent.click(answerBtns[0]);

    // Advance timers so we return to board
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // The answered cell should now have the answered class
    const answeredCells = document.querySelectorAll(".jeopardy-cell-answered");
    expect(answeredCells.length).toBe(1);

    // The answered cell should be disabled
    const disabledCells = document.querySelectorAll(".jeopardy-cell[disabled]");
    expect(disabledCells.length).toBe(1);
  });

  it("2-player mode shows both scores and alternates turns", () => {
    render(<Jeopardy />);

    // Select 2 players
    fireEvent.click(screen.getByText("2 Players"));
    fireEvent.click(screen.getByText("Start"));

    // Should show P1 and P2 labels
    expect(screen.getByText("P1")).toBeDefined();
    expect(screen.getByText("P2")).toBeDefined();

    // P1 should be active initially
    const p1Score = screen.getByText("P1").closest(".jeopardy-player-score");
    expect(p1Score?.classList.contains("jeopardy-player-active")).toBe(true);

    // Click a $100 cell and answer
    const cell = screen.getAllByText("$100")[0];
    fireEvent.click(cell);
    const answerBtns = document.querySelectorAll(".quiz-answer-btn");
    fireEvent.click(answerBtns[0]);

    // Advance timers to feedback, then dismiss
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Dismiss feedback
    const feedbackPanel = document.querySelector(".jeopardy-feedback-panel");
    fireEvent.click(feedbackPanel!.parentElement!);

    // Now P2 should be active
    const p2Score = screen.getByText("P2").closest(".jeopardy-player-score");
    expect(p2Score?.classList.contains("jeopardy-player-active")).toBe(true);
  });
});
