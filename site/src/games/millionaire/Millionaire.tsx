import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLesson } from "@/hooks/useLesson";
import { useDifficulty } from "@/hooks/useDifficulty";
import { playCorrect, playWrong, playCelebration } from "@/lib/sounds";
import { Celebration } from "@/components/shared/Celebration";
import { VerseDisplay } from "@/components/shared/VerseDisplay";
import { Timer } from "@/components/shared/Timer";
import type { Question } from "@/types/lesson";
import {
  createLadder,
  applyAnswer,
  walkAway,
  use5050,
  canUsePeek,
  useSwitchQuestion,
  usePeek,
  calculateStars,
  getTemplePiece,
  getMilestones,
  isMilestone,
  type MillionaireState,
} from "./logic/millionaire-logic";
import "./Millionaire.css";

type GameState =
  | "intro"
  | "playing"
  | "feedback"
  | "decision"
  | "walkaway"
  | "complete";

const ANSWER_LABELS = ["A", "B", "C", "D"];

// Map temple piece names to CSS classes
function getPieceClass(pieceName: string): string {
  const lower = pieceName.toLowerCase();
  if (lower.includes("cross")) return "millionaire-piece-cross";
  if (lower.includes("foundation")) return "millionaire-piece-foundation";
  if (lower.includes("ground")) return "millionaire-piece-ground";
  if (lower.includes("wall")) return "millionaire-piece-wall";
  if (lower.includes("arch")) return "millionaire-piece-arch";
  if (lower.includes("pillar")) return "millionaire-piece-pillar";
  if (lower.includes("roof") || lower.includes("beam"))
    return "millionaire-piece-roof";
  if (lower.includes("steeple")) return "millionaire-piece-steeple";
  if (lower.includes("door") || lower.includes("window") || lower.includes("bell"))
    return "millionaire-piece-detail";
  if (lower.includes("decoration")) return "millionaire-piece-detail";
  return "millionaire-piece-wall";
}

// ---------------------------------------------------------------------------
// Temple visual component
// ---------------------------------------------------------------------------

function TempleVisual({
  level,
  totalLevels,
  difficulty,
  glow,
}: {
  level: number;
  totalLevels: number;
  difficulty: "little-kids" | "big-kids";
  glow?: boolean;
}) {
  const milestones = getMilestones(difficulty);

  return (
    <div
      className={`millionaire-temple ${glow ? "millionaire-temple-glow" : ""}`}
    >
      <span className="millionaire-temple-title">Temple</span>
      {Array.from({ length: Math.min(level, totalLevels) }, (_, i) => {
        const pieceLevel = i + 1;
        const pieceName = getTemplePiece(pieceLevel, difficulty);
        const isMilestoneLevel = milestones.includes(pieceLevel);
        return (
          <div
            key={pieceLevel}
            className={`millionaire-temple-piece ${getPieceClass(pieceName)} ${isMilestoneLevel ? "millionaire-piece-milestone" : ""}`}
            style={{ animationDelay: `${i * 0.05}s` }}
            title={pieceName}
          >
            {pieceName}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function Millionaire() {
  const { lesson, loading, error } = useLesson();
  const { difficulty } = useDifficulty();

  const [gameState, setGameState] = useState<GameState>("intro");
  const [state, setState] = useState<MillionaireState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [timerPaused, setTimerPaused] = useState(false);
  // Track the question index we're showing (for little-kids, they may skip ahead on wrong answer)
  const [questionIndex, setQuestionIndex] = useState(0);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Current question being displayed
  const currentQuestion: Question | null = useMemo(() => {
    if (!state) return null;
    if (questionIndex >= state.questions.length) return null;
    return state.questions[questionIndex];
  }, [state, questionIndex]);

  // -----------------------------------------------------------------------
  // Start game
  // -----------------------------------------------------------------------
  function handleStart() {
    if (!lesson) return;
    const newState = createLadder(lesson.questions, difficulty);
    if (!newState) return;
    setState(newState);
    setQuestionIndex(0);
    setSelectedIndex(null);
    setShowHint(false);
    setShowCelebration(false);
    setTimerKey((k) => k + 1);
    setTimerPaused(false);
    setGameState("playing");
  }

  // -----------------------------------------------------------------------
  // Handle answer selection
  // -----------------------------------------------------------------------
  const handleAnswer = useCallback(
    (index: number) => {
      if (
        gameState !== "playing" ||
        selectedIndex !== null ||
        !state ||
        !currentQuestion
      )
        return;

      setSelectedIndex(index);
      setTimerPaused(true);

      const correct = index === currentQuestion.correctIndex;
      setWasCorrect(correct);

      if (correct) {
        playCorrect();
      } else {
        playWrong();
      }

      // Show selected state briefly, then reveal
      feedbackTimeoutRef.current = setTimeout(() => {
        const newState = applyAnswer(state, correct);
        setState(newState);

        if (correct) {
          if (newState.gameOver) {
            // Completed all levels!
            playCelebration();
            setShowCelebration(true);
            setGameState("complete");
          } else {
            // Show decision: keep building or walk away
            setGameState("decision");
          }
        } else {
          // Wrong answer
          setGameState("feedback");
        }
      }, 1000);
    },
    [gameState, selectedIndex, state, currentQuestion],
  );

  // -----------------------------------------------------------------------
  // Handle feedback next (after wrong answer)
  // -----------------------------------------------------------------------
  const handleFeedbackNext = useCallback(() => {
    if (!state) return;

    if (state.gameOver) {
      // Big kids: game over at milestone
      setGameState("complete");
      return;
    }

    // Little kids: continue to next question (skip past the one they got wrong)
    const nextIdx = questionIndex + 1;
    if (nextIdx >= state.questions.length) {
      // No more questions available
      setState((prev) => (prev ? { ...prev, gameOver: true } : prev));
      setGameState("complete");
      return;
    }

    setQuestionIndex(nextIdx);
    setSelectedIndex(null);
    setShowHint(false);
    setTimerKey((k) => k + 1);
    setTimerPaused(false);
    setGameState("playing");
  }, [state, questionIndex]);

  // -----------------------------------------------------------------------
  // Keep building (continue after correct answer)
  // -----------------------------------------------------------------------
  const handleKeepBuilding = useCallback(() => {
    const nextIdx = questionIndex + 1;
    if (!state || nextIdx >= state.questions.length) {
      // No more questions
      setState((prev) => (prev ? { ...prev, gameOver: true } : prev));
      setGameState("complete");
      return;
    }

    setQuestionIndex(nextIdx);
    setSelectedIndex(null);
    setShowHint(false);
    setTimerKey((k) => k + 1);
    setTimerPaused(false);
    setGameState("playing");
  }, [state, questionIndex]);

  // -----------------------------------------------------------------------
  // Walk away
  // -----------------------------------------------------------------------
  const handleWalkAway = useCallback(() => {
    if (!state) return;
    const newState = walkAway(state);
    setState(newState);
    setGameState("walkaway");
  }, [state]);

  // -----------------------------------------------------------------------
  // Lifeline: 50:50
  // -----------------------------------------------------------------------
  const handle5050 = useCallback(() => {
    if (!state || !currentQuestion || gameState !== "playing") return;
    const { state: newState } = use5050(state, currentQuestion);
    setState(newState);
  }, [state, currentQuestion, gameState]);

  // -----------------------------------------------------------------------
  // Lifeline: Peek at Scroll
  // -----------------------------------------------------------------------
  const handlePeek = useCallback(() => {
    if (!state || !currentQuestion || gameState !== "playing") return;
    if (!canUsePeek(currentQuestion) || !state.lifelines.peek) return;
    setState(usePeek(state));
    setShowHint(true);
  }, [state, currentQuestion, gameState]);

  // -----------------------------------------------------------------------
  // Lifeline: Switch Question
  // -----------------------------------------------------------------------
  const handleSwitch = useCallback(() => {
    if (!state || gameState !== "playing") return;
    const { state: newState, newQuestion } = useSwitchQuestion(state);
    if (newQuestion) {
      setState(newState);
      setShowHint(false);
      setSelectedIndex(null);
      setTimerKey((k) => k + 1);
    }
  }, [state, gameState]);

  // -----------------------------------------------------------------------
  // Timer timeout (big kids only)
  // -----------------------------------------------------------------------
  const handleTimerComplete = useCallback(() => {
    if (gameState !== "playing" || selectedIndex !== null || !state) return;
    setTimerPaused(true);
    setWasCorrect(false);
    playWrong();

    const newState = applyAnswer(state, false);
    setState(newState);
    setGameState("feedback");
  }, [gameState, selectedIndex, state]);

  // -----------------------------------------------------------------------
  // Play again
  // -----------------------------------------------------------------------
  function handlePlayAgain() {
    setGameState("intro");
    setState(null);
    setSelectedIndex(null);
    setShowHint(false);
    setShowCelebration(false);
  }

  // -----------------------------------------------------------------------
  // Keyboard support
  // -----------------------------------------------------------------------
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (gameState === "playing" && selectedIndex === null) {
        // 1-4 for answers
        if (e.key >= "1" && e.key <= "4") {
          const index = parseInt(e.key) - 1;
          if (
            currentQuestion &&
            index < currentQuestion.options.length &&
            (!state || !state.removedOptions.includes(index))
          ) {
            handleAnswer(index);
          }
        }
        // L for lifeline menu (not implemented as menu, but good for accessibility)
        // W for walk away
        if (e.key === "w" || e.key === "W") {
          // Only if at least 1 question answered
          if (state && state.currentLevel > 0) {
            handleWalkAway();
          }
        }
      }

      if (gameState === "decision") {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleKeepBuilding();
        }
        if (e.key === "w" || e.key === "W") {
          handleWalkAway();
        }
      }

      if (gameState === "feedback") {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleFeedbackNext();
        }
      }

      if (gameState === "walkaway") {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setGameState("complete");
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    gameState,
    selectedIndex,
    currentQuestion,
    state,
    handleAnswer,
    handleKeepBuilding,
    handleWalkAway,
    handleFeedbackNext,
  ]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    };
  }, []);

  // -----------------------------------------------------------------------
  // Check if we have enough questions
  // -----------------------------------------------------------------------
  const notEnoughQuestions = useMemo(() => {
    if (!lesson) return false;
    const testState = createLadder(lesson.questions, difficulty);
    return testState === null;
  }, [lesson, difficulty]);

  // -----------------------------------------------------------------------
  // Render: Loading
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div className="millionaire-container">
        <div className="loading">Loading lesson...</div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: Error
  // -----------------------------------------------------------------------
  if (error || !lesson) {
    return (
      <div className="millionaire-container">
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

  // -----------------------------------------------------------------------
  // Render: Intro
  // -----------------------------------------------------------------------
  if (gameState === "intro") {
    return (
      <div className="millionaire-container">
        <div className="millionaire-intro">
          <a href="#/" className="quiz-back-link">
            &larr; Back
          </a>
          <h1 className="millionaire-intro-title">Bible Millionaire</h1>
          <h2 className="millionaire-intro-lesson">{lesson.meta.title}</h2>
          <VerseDisplay
            reference={lesson.meta.verseReference}
            text={lesson.meta.verseText}
          />
          {notEnoughQuestions ? (
            <p className="millionaire-error">
              Not enough questions for this game!
            </p>
          ) : (
            <>
              <p className="millionaire-intro-info">
                Answer questions to build a temple! Choose wisely - you can walk
                away or risk it all.
                {difficulty === "big-kids" ? " 30s per question." : ""}
              </p>
              <button
                className="btn btn-primary btn-large"
                onClick={handleStart}
              >
                Start Building
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: Walk-away celebration
  // -----------------------------------------------------------------------
  if (gameState === "walkaway" && state) {
    const stars = calculateStars(state);
    return (
      <div className="millionaire-container">
        <div className="millionaire-complete">
          <h1 className="millionaire-complete-title">Well Done!</h1>
          <p className="millionaire-complete-subtitle">
            You walked away with{" "}
            {state.currentLevel} temple piece{state.currentLevel !== 1 ? "s" : ""}
          </p>
          <div className="millionaire-complete-temple-label">Your Temple</div>
          <div className="millionaire-complete-temple">
            <TempleVisual
              level={state.currentLevel}
              totalLevels={state.totalLevels}
              difficulty={state.difficulty}
              glow
            />
          </div>
          <div
            className="millionaire-complete-stars"
            aria-label={`${stars} stars`}
          >
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                className={`millionaire-star ${s <= stars ? "millionaire-star-earned" : "millionaire-star-empty"}`}
                style={
                  s <= stars ? { animationDelay: `${0.2 + s * 0.2}s` } : undefined
                }
              >
                &#9733;
              </span>
            ))}
          </div>
          <VerseDisplay
            reference={lesson.meta.verseReference}
            text={lesson.meta.verseText}
          />
          <div className="millionaire-complete-actions">
            <button
              className="btn btn-primary btn-large"
              onClick={() => setGameState("complete")}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: Complete
  // -----------------------------------------------------------------------
  if (gameState === "complete" && state) {
    const stars = calculateStars(state);
    const completedAll = state.currentLevel >= state.totalLevels;
    const title = completedAll
      ? "Temple Complete!"
      : state.walkedAway
        ? "Well Done!"
        : "Good Try!";

    return (
      <div className="millionaire-container">
        <Celebration
          show={showCelebration}
          text="Temple Complete!"
          stars={stars}
          onDismiss={() => setShowCelebration(false)}
        />
        <div className="millionaire-complete">
          <h1 className="millionaire-complete-title">{title}</h1>
          <p className="millionaire-complete-subtitle">
            {completedAll
              ? "You answered every question and built the whole temple!"
              : `You built ${state.currentLevel} of ${state.totalLevels} temple pieces`}
          </p>
          <div className="millionaire-complete-temple-label">Your Temple</div>
          <div className="millionaire-complete-temple">
            <TempleVisual
              level={state.currentLevel}
              totalLevels={state.totalLevels}
              difficulty={state.difficulty}
              glow={completedAll}
            />
          </div>
          <div
            className="millionaire-complete-stars"
            aria-label={`${stars} stars`}
          >
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                className={`millionaire-star ${s <= stars ? "millionaire-star-earned" : "millionaire-star-empty"}`}
                style={
                  s <= stars ? { animationDelay: `${0.2 + s * 0.2}s` } : undefined
                }
              >
                &#9733;
              </span>
            ))}
          </div>
          <VerseDisplay
            reference={lesson.meta.verseReference}
            text={lesson.meta.verseText}
          />
          <div className="millionaire-complete-actions">
            <button
              className="btn btn-primary btn-large"
              onClick={handlePlayAgain}
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

  // -----------------------------------------------------------------------
  // Render: Playing / Feedback / Decision
  // -----------------------------------------------------------------------
  if (!state || !currentQuestion) {
    return (
      <div className="millionaire-container">
        <div className="quiz-error">
          <h2>Something went wrong</h2>
          <a href="#/" className="btn btn-primary">
            Back to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="millionaire-container">
      <a href="#/" className="quiz-back-link">
        &larr; Back
      </a>

      {/* HUD */}
      <div className="millionaire-hud">
        <div className="millionaire-lifelines">
          <button
            className="millionaire-lifeline-btn"
            onClick={handle5050}
            disabled={
              !state.lifelines.fiftyFifty ||
              gameState !== "playing" ||
              selectedIndex !== null
            }
            aria-label="50:50 - Remove two wrong answers"
            title="50:50"
          >
            <span aria-hidden="true">&#189;</span>
            <span className="millionaire-lifeline-tooltip">50:50</span>
          </button>
          <button
            className="millionaire-lifeline-btn"
            onClick={handlePeek}
            disabled={
              !state.lifelines.peek ||
              !canUsePeek(currentQuestion) ||
              gameState !== "playing" ||
              selectedIndex !== null
            }
            aria-label="Peek at Scroll - Show hint"
            title="Peek at Scroll"
          >
            <span aria-hidden="true">&#128220;</span>
            <span className="millionaire-lifeline-tooltip">Scroll</span>
          </button>
          <button
            className="millionaire-lifeline-btn"
            onClick={handleSwitch}
            disabled={
              !state.lifelines.switch ||
              state.reserveQuestions.length === 0 ||
              gameState !== "playing" ||
              selectedIndex !== null
            }
            aria-label="Switch Question - Replace with different question"
            title="Switch Question"
          >
            <span aria-hidden="true">&#8644;</span>
            <span className="millionaire-lifeline-tooltip">Switch</span>
          </button>
        </div>

        <span className="millionaire-level-label">
          Level{" "}
          <span className="millionaire-level-number">
            {state.currentLevel + 1}
          </span>{" "}
          / {state.totalLevels}
        </span>

        {difficulty === "big-kids" && gameState === "playing" && (
          <div className="millionaire-timer-wrapper">
            <Timer
              key={timerKey}
              seconds={30}
              onComplete={handleTimerComplete}
              paused={timerPaused}
            />
          </div>
        )}
      </div>

      {/* Game area */}
      <div className="millionaire-game">
        {/* Main content */}
        <div className="millionaire-main">
          {/* Feedback after wrong answer */}
          {gameState === "feedback" ? (
            <div
              className="millionaire-wrong-feedback"
              onClick={handleFeedbackNext}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleFeedbackNext();
                }
              }}
            >
              <div className="millionaire-wrong-icon" aria-hidden="true">
                &#10007;
              </div>
              <h2 className="millionaire-wrong-text">
                {difficulty === "big-kids" ? "Wrong Answer!" : "Not quite!"}
              </h2>
              <p className="millionaire-wrong-explanation">
                {currentQuestion.explanation}
              </p>
              {difficulty === "little-kids" && (
                <p className="millionaire-wrong-dropped">
                  {state.currentLevel > 0
                    ? `Dropped back to level ${state.currentLevel}. Keep going!`
                    : "Don't worry - try the next one!"}
                </p>
              )}
              {difficulty === "big-kids" && (
                <p className="millionaire-wrong-dropped">
                  Game over at level {state.currentLevel}.
                </p>
              )}
              <p className="answer-feedback-hint">Tap to continue</p>
            </div>
          ) : gameState === "decision" ? (
            /* Decision: keep building or walk away */
            <div className="millionaire-decision">
              <h2 className="millionaire-decision-title">
                Continue Building?
              </h2>
              <p className="millionaire-decision-piece">
                You just added the{" "}
                <strong>
                  {getTemplePiece(state.currentLevel, state.difficulty)}
                </strong>
                !
              </p>
              <p className="millionaire-decision-piece">
                {isMilestone(state.currentLevel, state.difficulty)
                  ? "You reached a milestone! Your progress is safe."
                  : "A wrong answer could cost you progress..."}
              </p>
              <div className="millionaire-decision-buttons">
                <button
                  className="btn btn-primary btn-large"
                  onClick={handleKeepBuilding}
                >
                  Keep Building
                </button>
                <button
                  className="btn btn-secondary btn-large"
                  onClick={handleWalkAway}
                >
                  Walk Away
                </button>
              </div>
            </div>
          ) : (
            /* Question display */
            <div className="millionaire-question-area">
              <h2 className="millionaire-question-text">
                {currentQuestion.text}
              </h2>

              {/* Hint bubble */}
              {showHint && currentQuestion.hint && (
                <div className="millionaire-hint-bubble">
                  <span className="millionaire-hint-icon" aria-hidden="true">
                    &#128220;
                  </span>
                  {currentQuestion.hint}
                </div>
              )}

              {/* Answer buttons */}
              <div className="millionaire-answers">
                {currentQuestion.options.map((option, idx) => {
                  const isRemoved = state.removedOptions.includes(idx);
                  let btnClass = "millionaire-answer-btn";

                  if (isRemoved) {
                    btnClass += " millionaire-answer-removed";
                  } else if (selectedIndex !== null) {
                    if (idx === selectedIndex) {
                      btnClass += " millionaire-answer-selected";
                    }
                    // After reveal delay the correct/wrong classes are applied
                    // by the applyAnswer timeout, but we show selected immediately
                  }

                  return (
                    <button
                      key={idx}
                      className={btnClass}
                      onClick={() => handleAnswer(idx)}
                      disabled={
                        selectedIndex !== null || isRemoved
                      }
                    >
                      <span className="millionaire-answer-label">
                        {ANSWER_LABELS[idx]}
                      </span>
                      <span className="millionaire-answer-text">{option}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar with temple */}
        <div className="millionaire-sidebar">
          <TempleVisual
            level={state.currentLevel}
            totalLevels={state.totalLevels}
            difficulty={state.difficulty}
          />
        </div>
      </div>
    </div>
  );
}
