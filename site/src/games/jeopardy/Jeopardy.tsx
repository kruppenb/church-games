import { useState, useMemo, useCallback, useRef } from "react";
import { useLesson } from "@/hooks/useLesson";
import { useDifficulty } from "@/hooks/useDifficulty";
import { playCorrect, playWrong, playCelebration } from "@/lib/sounds";
import { saveScore } from "@/lib/score-store";
import { useComboStreak } from "@/hooks/useComboStreak";
import { ComboEffects } from "@/components/shared/ComboEffects";
import { VerseDisplay } from "@/components/shared/VerseDisplay";
import type { Question } from "@/types/lesson";

interface JeopardyCell {
  categoryIndex: number;
  value: number;
  question: Question;
  answered: boolean;
  isDailyDouble: boolean;
}

type GameState =
  | "intro"
  | "board"
  | "daily-double"
  | "question"
  | "feedback"
  | "final-wager"
  | "final-question"
  | "final-feedback"
  | "complete";
type PlayerCount = 1 | 2;

const VALUES = [100, 200, 300, 400, 500];
const ANSWER_LABELS = ["A", "B", "C", "D"];

/** Wager preset options for Final Jeopardy */
const WAGER_PRESETS = [
  { label: "25%", fraction: 0.25 },
  { label: "50%", fraction: 0.5 },
  { label: "ALL IN!", fraction: 1.0 },
] as const;

/**
 * Builds 5 category columns from the available questions.
 * Each column gets 5 questions mapped to the 5 value tiers.
 * Reserves one extra question for Final Jeopardy if available.
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
): { categories: string[]; cells: JeopardyCell[]; finalQuestion: Question } {
  // Define 5 named categories based on question categories + theme
  const categoryNames = [
    "Recall",
    "Understanding",
    "Application",
    // Use first phrase of theme (before dash/colon) to keep header short
    theme.split(/\s*[---:\-]\s*/)[0].trim().charAt(0).toUpperCase() +
      theme.split(/\s*[---:\-]\s*/)[0].trim().slice(1),
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

  // Reserve the hardest question for Final Jeopardy (last in sorted = hardest)
  // Use the last unique question for the final round
  const finalQuestion = sorted[sorted.length - 1];

  // We need exactly 25 questions for the board. If not enough, cycle.
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

  return { categories: categoryNames, cells, finalQuestion };
}

export function Jeopardy() {
  const { lesson, loading, error } = useLesson();
  const { difficulty } = useDifficulty();

  const [gameState, setGameState] = useState<GameState>("intro");
  const [playerCount, setPlayerCount] = useState<PlayerCount>(1);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [currentPlayer, setCurrentPlayer] = useState<0 | 1>(0);
  const [cells, setCells] = useState<JeopardyCell[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [feedbackCorrect, setFeedbackCorrect] = useState(false);
  const [feedbackPoints, setFeedbackPoints] = useState(0);
  const { streak, streakJustBroke, recordAnswer, reset: resetStreak } = useComboStreak();

  // Board-to-question zoom: track clicked cell position
  const [zoomOrigin, setZoomOrigin] = useState<{ x: number; y: number } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // Final Jeopardy state
  const [finalQuestion, setFinalQuestion] = useState<Question | null>(null);
  const [finalWagers, setFinalWagers] = useState<[number, number]>([0, 0]);
  const [finalWagerPlayer, setFinalWagerPlayer] = useState<0 | 1>(0);
  const [finalSelectedIndex, setFinalSelectedIndex] = useState<number | null>(null);

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
    const { categories: cats, cells: newCells, finalQuestion: fq } = buildBoard(
      filteredQuestions,
      lesson.meta.theme,
    );
    setCategories(cats);
    setCells(newCells);
    setFinalQuestion(fq);
    setScores([0, 0]);
    setCurrentPlayer(0);
    setActiveCell(null);
    setSelectedIndex(null);
    setZoomOrigin(null);
    setFinalWagers([0, 0]);
    setFinalWagerPlayer(0);
    setFinalSelectedIndex(null);
    resetStreak();
    setGameState("board");
  }

  function handleCellClick(index: number, event: React.MouseEvent<HTMLButtonElement>) {
    if (cells[index].answered) return;

    // Capture the clicked cell's position for zoom animation
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    // Convert to viewport percentage for transform-origin
    const originX = (centerX / window.innerWidth) * 100;
    const originY = (centerY / window.innerHeight) * 100;
    setZoomOrigin({ x: originX, y: originY });

    setActiveCell(index);
    setSelectedIndex(null);

    // If Daily Double, show the dramatic banner first
    if (cells[index].isDailyDouble) {
      setGameState("daily-double");
      // Auto-advance to question after the dramatic reveal
      setTimeout(() => {
        setGameState("question");
      }, 1500);
    } else {
      setGameState("question");
    }
  }

  const handleAnswer = useCallback(
    (optionIndex: number) => {
      if (activeCell === null || selectedIndex !== null) return;
      const cell = cells[activeCell];
      setSelectedIndex(optionIndex);

      const correct = optionIndex === cell.question.correctIndex;
      const points = cell.isDailyDouble ? cell.value * 2 : cell.value;

      const { newStreak } = recordAnswer(correct);

      if (correct) {
        // When streak >= 2, the hook already played the streak tone
        if (newStreak < 2) {
          playCorrect();
        }
        setScores((prev) => {
          const updated: [number, number] = [...prev];
          updated[currentPlayer] += points;
          return updated;
        });
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
    [activeCell, selectedIndex, cells, currentPlayer, recordAnswer],
  );

  const handleFeedbackDismiss = useCallback(() => {
    const allAnswered = cells.every((c) => c.answered);
    if (allAnswered) {
      // Board cleared -- transition to Final Jeopardy!
      if (finalQuestion) {
        setFinalWagerPlayer(0);
        setFinalWagers([0, 0]);
        setFinalSelectedIndex(null);
        setGameState("final-wager");
      } else {
        playCelebration();
        setGameState("complete");
      }
    } else {
      setActiveCell(null);
      setSelectedIndex(null);
      setZoomOrigin(null);
      if (playerCount === 2) {
        setCurrentPlayer((prev) => (prev === 0 ? 1 : 0));
        resetStreak();
      }
      setGameState("board");
    }
  }, [cells, playerCount, resetStreak, finalQuestion]);

  // Final Jeopardy: handle wager selection
  function handleFinalWager(fraction: number) {
    const playerScore = scores[finalWagerPlayer];
    const wager = Math.max(Math.round(playerScore * fraction), 0);
    const updated: [number, number] = [...finalWagers];
    updated[finalWagerPlayer] = wager;
    setFinalWagers(updated);

    if (playerCount === 2 && finalWagerPlayer === 0) {
      // Player 1 wagered, now Player 2 wagers
      setFinalWagerPlayer(1);
    } else {
      // All wagers placed, show the question
      // In 1-player mode, Player 1 answers
      // In 2-player mode, both see the question and Player 1 answers first
      setCurrentPlayer(0);
      setGameState("final-question");
    }
  }

  // Final Jeopardy: handle answer
  const handleFinalAnswer = useCallback(
    (optionIndex: number) => {
      if (!finalQuestion || finalSelectedIndex !== null) return;
      setFinalSelectedIndex(optionIndex);

      const correct = optionIndex === finalQuestion.correctIndex;

      if (playerCount === 1) {
        // Single player: apply wager
        if (correct) {
          playCorrect();
          setScores((prev) => [prev[0] + finalWagers[0], prev[1]]);
          setFeedbackCorrect(true);
          setFeedbackPoints(finalWagers[0]);
        } else {
          playWrong();
          setScores((prev) => [Math.max(prev[0] - finalWagers[0], 0), prev[1]]);
          setFeedbackCorrect(false);
          setFeedbackPoints(finalWagers[0]);
        }
      } else {
        // 2-player: both wager on the same question, same answer
        const newScores: [number, number] = [...scores];
        if (correct) {
          playCorrect();
          newScores[0] += finalWagers[0];
          newScores[1] += finalWagers[1];
        } else {
          playWrong();
          newScores[0] = Math.max(newScores[0] - finalWagers[0], 0);
          newScores[1] = Math.max(newScores[1] - finalWagers[1], 0);
        }
        setScores(newScores);
        setFeedbackCorrect(correct);
        setFeedbackPoints(correct ? finalWagers[0] + finalWagers[1] : finalWagers[0] + finalWagers[1]);
      }

      setTimeout(() => {
        setGameState("final-feedback");
      }, 800);
    },
    [finalQuestion, finalSelectedIndex, finalWagers, scores, playerCount],
  );

  const handleFinalFeedbackDismiss = useCallback(() => {
    playCelebration();
    setGameState("complete");
  }, []);

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
          <div className="jeopardy-player-select">
            <span className="jeopardy-player-select-label">Players</span>
            <div className="jeopardy-player-select-buttons">
              <button
                className={`btn ${playerCount === 1 ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setPlayerCount(1)}
              >
                1 Player
              </button>
              <button
                className={`btn ${playerCount === 2 ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setPlayerCount(2)}
              >
                2 Players
              </button>
            </div>
          </div>
          <button className="btn btn-primary btn-large" onClick={handleStart}>
            Start
          </button>
        </div>
      </div>
    );
  }

  // --- Complete screen ---
  if (gameState === "complete") {
    const totalScore = scores[0] + scores[1];
    const stars = totalScore >= 3000 ? 3 : totalScore >= 2000 ? 2 : 1;
    saveScore("jeopardy", stars);
    const winner =
      playerCount === 2
        ? scores[0] > scores[1]
          ? "Player 1 Wins!"
          : scores[1] > scores[0]
            ? "Player 2 Wins!"
            : "It's a Tie!"
        : null;

    return (
      <div className="jeopardy-container">
        <div className="quiz-complete">
          <h1 className="quiz-complete-title">
            {winner ?? "Great Job!"}
          </h1>
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
          {playerCount === 2 ? (
            <div className="jeopardy-final-scores">
              <div className={`jeopardy-final-score-card ${scores[0] >= scores[1] ? "jeopardy-final-score-winner" : ""}`}>
                <span className="jeopardy-final-score-label">Player 1</span>
                <span className="jeopardy-final-score-value">${scores[0]}</span>
              </div>
              <div className={`jeopardy-final-score-card ${scores[1] >= scores[0] ? "jeopardy-final-score-winner" : ""}`}>
                <span className="jeopardy-final-score-label">Player 2</span>
                <span className="jeopardy-final-score-value">${scores[1]}</span>
              </div>
            </div>
          ) : (
            <div className="quiz-complete-score">
              <span className="quiz-complete-score-label">Final Score</span>
              <span className="quiz-complete-score-value">${scores[0]}</span>
            </div>
          )}
          <VerseDisplay
            reference={lesson.meta.verseReference}
            text={lesson.meta.verseText}
          />
          <div className="quiz-complete-actions">
            <button
              className="btn btn-primary btn-large"
              onClick={() => {
                setGameState("intro");
                setScores([0, 0]);
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

  // Zoom animation style: transform-origin from clicked cell position
  const zoomStyle = zoomOrigin
    ? { transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%` } as React.CSSProperties
    : undefined;

  return (
    <div className="jeopardy-container">
      <a href="#/" className="quiz-back-link">
        &larr; Back
      </a>
      {playerCount === 2 ? (
        <div className="jeopardy-scoreboard">
          <div className={`jeopardy-player-score ${currentPlayer === 0 ? "jeopardy-player-active" : ""}`}>
            <span className="jeopardy-player-name">P1</span>
            <span className="jeopardy-score-value">${scores[0]}</span>
          </div>
          <div className={`jeopardy-player-score ${currentPlayer === 1 ? "jeopardy-player-active" : ""}`}>
            <span className="jeopardy-player-name">P2</span>
            <span className="jeopardy-score-value">${scores[1]}</span>
          </div>
        </div>
      ) : (
        <div className="jeopardy-score">
          <span>Score:</span>
          <span className="jeopardy-score-value">${scores[0]}</span>
        </div>
      )}

      <div
        ref={boardRef}
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
            onClick={(e) => handleCellClick(index, e)}
            disabled={cell.answered}
            aria-label={`${categories[cell.categoryIndex]} for $${cell.value}`}
          >
            {cell.answered ? "" : `$${cell.value}`}
          </button>
        ))}
      </div>

      {/* Daily Double dramatic reveal */}
      {gameState === "daily-double" && (
        <div className="jeopardy-question-overlay jeopardy-dd-overlay" style={zoomStyle}>
          <div className="jeopardy-dd-banner">
            <div className="jeopardy-dd-flash" />
            <div className="jeopardy-dd-text">DAILY DOUBLE!</div>
            <div className="jeopardy-dd-subtitle">Worth double points!</div>
          </div>
        </div>
      )}

      {/* Question overlay with zoom animation */}
      {gameState === "question" && activeCellData && (
        <div className="jeopardy-question-overlay jeopardy-zoom-in" style={zoomStyle}>
          <div className="jeopardy-question-panel">
            <div className="jeopardy-question-value">
              ${activeCellData.value}
              {activeCellData.isDailyDouble && (
                <span className="jeopardy-question-dd-badge">x2</span>
              )}
            </div>
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

      {/* Feedback overlay -- shows after answering */}
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
                <div className="jeopardy-feedback-title jeopardy-feedback-correct">
                  {playerCount === 2 ? `Player ${currentPlayer + 1} — Correct!` : "Correct!"}
                </div>
                <div className="jeopardy-feedback-points">+${feedbackPoints}</div>
              </>
            ) : (
              <>
                <div className="jeopardy-feedback-icon jeopardy-feedback-wrong">&#10007;</div>
                <div className="jeopardy-feedback-title jeopardy-feedback-wrong">
                  {playerCount === 2 ? `Player ${currentPlayer + 1} — Wrong!` : "Wrong!"}
                </div>
                <div className="jeopardy-feedback-subtitle">
                  The answer was: {activeCellData?.question.options[activeCellData.question.correctIndex]}
                </div>
              </>
            )}
            <div className="jeopardy-feedback-hint">Tap to continue</div>
          </div>
        </div>
      )}

      {/* Final Jeopardy: Wager screen */}
      {gameState === "final-wager" && finalQuestion && (
        <div className="jeopardy-question-overlay jeopardy-final-overlay">
          <div className="jeopardy-final-panel">
            <div className="jeopardy-final-banner">FINAL JEOPARDY!</div>
            <div className="jeopardy-final-category">
              {lesson.meta.title}
            </div>
            {playerCount === 2 && (
              <div className="jeopardy-final-wager-player">
                Player {finalWagerPlayer + 1} — Place Your Wager
              </div>
            )}
            <div className="jeopardy-final-current-score">
              Your Score: ${scores[finalWagerPlayer]}
            </div>
            <div className="jeopardy-wager-options">
              {WAGER_PRESETS.map((preset) => {
                const wagerAmount = Math.max(Math.round(scores[finalWagerPlayer] * preset.fraction), 0);
                return (
                  <button
                    key={preset.label}
                    className="btn jeopardy-wager-btn"
                    onClick={() => handleFinalWager(preset.fraction)}
                  >
                    <span className="jeopardy-wager-label">{preset.label}</span>
                    <span className="jeopardy-wager-amount">${wagerAmount}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Final Jeopardy: Question */}
      {gameState === "final-question" && finalQuestion && (
        <div className="jeopardy-question-overlay jeopardy-final-overlay">
          <div className="jeopardy-question-panel jeopardy-final-question-panel">
            <div className="jeopardy-final-badge">FINAL JEOPARDY</div>
            <div className="jeopardy-question-text">
              {finalQuestion.text}
            </div>
            <div className="quiz-answers">
              {finalQuestion.options.map((option, idx) => {
                let btnClass = "quiz-answer-btn";
                if (finalSelectedIndex !== null) {
                  if (idx === finalQuestion.correctIndex) {
                    btnClass += " quiz-answer-correct";
                  } else if (idx === finalSelectedIndex && idx !== finalQuestion.correctIndex) {
                    btnClass += " quiz-answer-wrong";
                  }
                }
                return (
                  <button
                    key={idx}
                    className={btnClass}
                    onClick={() => handleFinalAnswer(idx)}
                    disabled={finalSelectedIndex !== null}
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

      {/* Final Jeopardy: Feedback */}
      {gameState === "final-feedback" && (
        <div
          className="jeopardy-question-overlay"
          onClick={handleFinalFeedbackDismiss}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleFinalFeedbackDismiss();
          }}
        >
          <div className="jeopardy-feedback-panel">
            {feedbackCorrect ? (
              <>
                <div className="jeopardy-feedback-icon jeopardy-feedback-correct">&#10003;</div>
                <div className="jeopardy-feedback-title jeopardy-feedback-correct">
                  {playerCount === 2 ? "Both Players Win!" : "Correct!"}
                </div>
                <div className="jeopardy-feedback-points">
                  {playerCount === 2
                    ? `P1: +$${finalWagers[0]} / P2: +$${finalWagers[1]}`
                    : `+$${finalWagers[0]}`}
                </div>
              </>
            ) : (
              <>
                <div className="jeopardy-feedback-icon jeopardy-feedback-wrong">&#10007;</div>
                <div className="jeopardy-feedback-title jeopardy-feedback-wrong">
                  {playerCount === 2 ? "Both Players Lose!" : "Wrong!"}
                </div>
                <div className="jeopardy-feedback-subtitle">
                  The answer was: {finalQuestion?.options[finalQuestion.correctIndex]}
                </div>
                <div className="jeopardy-feedback-subtitle">
                  {playerCount === 2
                    ? `P1: -$${finalWagers[0]} / P2: -$${finalWagers[1]}`
                    : `-$${finalWagers[0]}`}
                </div>
              </>
            )}
            <div className="jeopardy-feedback-hint">Tap to see final results</div>
          </div>
        </div>
      )}

      <ComboEffects streak={streak} streakJustBroke={streakJustBroke} />
    </div>
  );
}
