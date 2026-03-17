import { useState, useMemo, useCallback } from "react";
import { useLesson } from "@/hooks/useLesson";
import { useDifficulty } from "@/hooks/useDifficulty";
import { playCorrect, playWrong, playCelebration } from "@/lib/sounds";
import { VerseDisplay } from "@/components/shared/VerseDisplay";
import type { Question } from "@/types/lesson";

interface JeopardyCell {
  categoryIndex: number;
  value: number;
  question: Question;
  answered: boolean;
  isDailyDouble: boolean;
}

type GameState = "intro" | "board" | "question" | "feedback" | "complete";

const VALUES = [100, 200, 300, 400, 500];
const ANSWER_LABELS = ["A", "B", "C", "D"];

/**
 * Builds 5 category columns from the available questions.
 * Each column gets 5 questions mapped to the 5 value tiers.
 *
 * Strategy:
 * 1. Sort questions by difficulty (easy first, then medium, then hard).
 * 2. Spread them across 5 columns round-robin.
 * 3. Within each column, sort by difficulty and assign values accordingly.
 * 4. If we don't have 25 questions, cycle/repeat to fill the board.
 */
function buildBoard(
  questions: Question[],
  theme: string,
): { categories: string[]; cells: JeopardyCell[] } {
  // Define 5 named categories based on question categories + theme
  const categoryNames = [
    "Recall",
    "Understanding",
    "Application",
    // Use first phrase of theme (before dash/colon) to keep header short
    theme.split(/\s*[—–:\-]\s*/)[0].trim().charAt(0).toUpperCase() +
      theme.split(/\s*[—–:\-]\s*/)[0].trim().slice(1),
    "Challenge",
  ];

  // Sort questions so easy come first, then medium, then hard
  const difficultyOrder: Record<string, number> = {
    easy: 0,
    medium: 1,
    hard: 2,
  };
  const sorted = [...questions].sort(
    (a, b) => difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty],
  );

  // We need exactly 25 questions. If not enough, cycle.
  const needed = 25;
  const expanded: Question[] = [];
  for (let i = 0; i < needed; i++) {
    expanded.push(sorted[i % sorted.length]);
  }

  // Distribute into 5 columns (round-robin)
  const columns: Question[][] = [[], [], [], [], []];
  for (let i = 0; i < expanded.length; i++) {
    columns[i % 5].push(expanded[i]);
  }

  // Within each column, sort by difficulty so easier = lower value
  for (const col of columns) {
    col.sort(
      (a, b) => difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty],
    );
  }

  // Pick a random daily double cell
  const dailyDoubleCol = Math.floor(Math.random() * 5);
  const dailyDoubleRow = Math.floor(Math.random() * 5);

  // Build the flat cell array (row-major: row0col0, row0col1, ..., row4col4)
  const cells: JeopardyCell[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      cells.push({
        categoryIndex: col,
        value: VALUES[row],
        question: columns[col][row],
        answered: false,
        isDailyDouble: col === dailyDoubleCol && row === dailyDoubleRow,
      });
    }
  }

  return { categories: categoryNames, cells };
}

export function Jeopardy() {
  const { lesson, loading, error } = useLesson();
  const { difficulty } = useDifficulty();

  const [gameState, setGameState] = useState<GameState>("intro");
  const [score, setScore] = useState(0);
  const [cells, setCells] = useState<JeopardyCell[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [feedbackCorrect, setFeedbackCorrect] = useState(false);
  const [feedbackPoints, setFeedbackPoints] = useState(0);

  // Filter questions based on difficulty setting
  const filteredQuestions = useMemo(() => {
    if (!lesson) return [];
    if (difficulty === "little-kids") {
      // For little kids, use easy questions; fall back to all if too few
      const easy = lesson.questions.filter((q) => q.difficulty === "easy");
      return easy.length >= 5 ? easy : lesson.questions;
    }
    // For big kids, prefer medium+hard; fall back to all if too few
    const harder = lesson.questions.filter(
      (q) => q.difficulty === "medium" || q.difficulty === "hard",
    );
    return harder.length >= 5 ? harder : lesson.questions;
  }, [lesson, difficulty]);

  function handleStart() {
    if (!lesson) return;
    const { categories: cats, cells: newCells } = buildBoard(
      filteredQuestions,
      lesson.meta.theme,
    );
    setCategories(cats);
    setCells(newCells);
    setScore(0);
    setActiveCell(null);
    setSelectedIndex(null);
    setGameState("board");
  }

  function handleCellClick(index: number) {
    if (cells[index].answered) return;
    setActiveCell(index);
    setSelectedIndex(null);
    setGameState("question");
  }

  const handleAnswer = useCallback(
    (optionIndex: number) => {
      if (activeCell === null || selectedIndex !== null) return;
      const cell = cells[activeCell];
      setSelectedIndex(optionIndex);

      const correct = optionIndex === cell.question.correctIndex;
      const points = cell.isDailyDouble ? cell.value * 2 : cell.value;

      if (correct) {
        playCorrect();
        setScore((prev) => prev + points);
        setFeedbackCorrect(true);
        setFeedbackPoints(points);
      } else {
        playWrong();
        setFeedbackCorrect(false);
        setFeedbackPoints(0);
      }

      // Mark cell as answered
      setCells((prev) => {
        const updated = [...prev];
        updated[activeCell] = { ...updated[activeCell], answered: true };
        return updated;
      });

      // Show feedback overlay after a brief highlight of correct/wrong answer
      setTimeout(() => {
        setGameState("feedback");
      }, 800);
    },
    [activeCell, selectedIndex, cells],
  );

  const handleFeedbackDismiss = useCallback(() => {
    const allAnswered = cells.every((c) => c.answered);
    if (allAnswered) {
      playCelebration();
      setGameState("complete");
    } else {
      setActiveCell(null);
      setSelectedIndex(null);
      setGameState("board");
    }
  }, [cells]);

  // --- Loading / Error states ---
  if (loading) {
    return (
      <div className="jeopardy-container">
        <div className="loading">Loading lesson...</div>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="jeopardy-container">
        <div className="quiz-error">
          <h2>Could not load lesson</h2>
          <p>{error ?? "No lesson data available."}</p>
          <a href="#/" className="btn btn-primary">
            Back to Home
          </a>
        </div>
      </div>
    );
  }

  // --- Intro screen ---
  if (gameState === "intro") {
    return (
      <div className="jeopardy-container">
        <div className="quiz-intro">
          <a href="#/" className="quiz-back-link">
            &larr; Back
          </a>
          <h1 className="quiz-intro-title">Jeopardy</h1>
          <h2 className="quiz-intro-lesson">{lesson.meta.title}</h2>
          <VerseDisplay
            reference={lesson.meta.verseReference}
            text={lesson.meta.verseText}
          />
          <button className="btn btn-primary btn-large" onClick={handleStart}>
            Start
          </button>
        </div>
      </div>
    );
  }

  // --- Complete screen ---
  if (gameState === "complete") {
    const stars = score >= 3000 ? 3 : score >= 2000 ? 2 : 1;

    return (
      <div className="jeopardy-container">
        <div className="quiz-complete">
          <h1 className="quiz-complete-title">Great Job!</h1>
          <div className="quiz-complete-stars" aria-label={`${stars} stars`}>
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                className={`quiz-star ${s <= stars ? "quiz-star-earned" : "quiz-star-empty"}`}
              >
                &#9733;
              </span>
            ))}
          </div>
          <div className="quiz-complete-score">
            <span className="quiz-complete-score-label">Final Score</span>
            <span className="quiz-complete-score-value">${score}</span>
          </div>
          <VerseDisplay
            reference={lesson.meta.verseReference}
            text={lesson.meta.verseText}
          />
          <div className="quiz-complete-actions">
            <button
              className="btn btn-primary btn-large"
              onClick={() => {
                setGameState("intro");
                setScore(0);
              }}
            >
              Play Again
            </button>
            <a href="#/" className="btn btn-secondary">
              Back to Games
            </a>
          </div>
        </div>
      </div>
    );
  }

  // --- Board + Question overlay ---
  const activeCellData = activeCell !== null ? cells[activeCell] : null;

  return (
    <div className="jeopardy-container">
      <a href="#/" className="quiz-back-link">
        &larr; Back
      </a>
      <div className="jeopardy-score">
        <span>Score:</span>
        <span className="jeopardy-score-value">${score}</span>
      </div>

      <div
        className="jeopardy-board"
        style={{
          gridTemplateColumns: "repeat(5, 1fr)",
          gridTemplateRows: "auto repeat(5, 1fr)",
        }}
      >
        {/* Header row */}
        {categories.map((cat, i) => (
          <div key={`header-${i}`} className="jeopardy-header-cell">
            {cat}
          </div>
        ))}

        {/* Value cells: 5 rows x 5 columns */}
        {cells.map((cell, index) => (
          <button
            key={`cell-${index}`}
            className={`jeopardy-cell ${cell.answered ? "jeopardy-cell-answered" : ""}`}
            onClick={() => handleCellClick(index)}
            disabled={cell.answered}
            aria-label={`${categories[cell.categoryIndex]} for $${cell.value}`}
          >
            {cell.answered ? "" : `$${cell.value}`}
          </button>
        ))}
      </div>

      {/* Question overlay */}
      {gameState === "question" && activeCellData && (
        <div className="jeopardy-question-overlay">
          <div className="jeopardy-question-panel">
            <div className="jeopardy-question-value">
              ${activeCellData.value}
            </div>
            {activeCellData.isDailyDouble && (
              <div className="jeopardy-daily-double">DAILY DOUBLE!</div>
            )}
            <div className="jeopardy-question-text">
              {activeCellData.question.text}
            </div>
            <div className="quiz-answers">
              {activeCellData.question.options.map((option, idx) => {
                let btnClass = "quiz-answer-btn";
                if (selectedIndex !== null) {
                  if (idx === activeCellData.question.correctIndex) {
                    btnClass += " quiz-answer-correct";
                  } else if (idx === selectedIndex && idx !== activeCellData.question.correctIndex) {
                    btnClass += " quiz-answer-wrong";
                  }
                }
                return (
                  <button
                    key={idx}
                    className={btnClass}
                    onClick={() => handleAnswer(idx)}
                    disabled={selectedIndex !== null}
                  >
                    <span className="quiz-answer-label">
                      {ANSWER_LABELS[idx]}
                    </span>
                    <span className="quiz-answer-text">{option}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Feedback overlay — shows after answering */}
      {gameState === "feedback" && (
        <div
          className="jeopardy-question-overlay"
          onClick={handleFeedbackDismiss}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleFeedbackDismiss();
          }}
        >
          <div className="jeopardy-feedback-panel">
            {feedbackCorrect ? (
              <>
                <div className="jeopardy-feedback-icon jeopardy-feedback-correct">&#10003;</div>
                <div className="jeopardy-feedback-title jeopardy-feedback-correct">Correct!</div>
                <div className="jeopardy-feedback-points">+${feedbackPoints}</div>
              </>
            ) : (
              <>
                <div className="jeopardy-feedback-icon jeopardy-feedback-wrong">&#10007;</div>
                <div className="jeopardy-feedback-title jeopardy-feedback-wrong">Wrong!</div>
                <div className="jeopardy-feedback-subtitle">
                  The answer was: {activeCellData?.question.options[activeCellData.question.correctIndex]}
                </div>
              </>
            )}
            <div className="jeopardy-feedback-hint">Tap to continue</div>
          </div>
        </div>
      )}
    </div>
  );
}
