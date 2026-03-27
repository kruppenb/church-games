import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLesson } from "@/hooks/useLesson";
import { useDifficulty } from "@/hooks/useDifficulty";
import { QuestionPool } from "@/lib/question-pool";
import { playCorrect, playWrong, playCelebration } from "@/lib/sounds";
import { saveScore } from "@/lib/score-store";
import { useComboStreak } from "@/hooks/useComboStreak";
import { Timer } from "@/components/shared/Timer";
import { Scoreboard } from "@/components/shared/Scoreboard";
import { AnswerFeedback } from "@/components/shared/AnswerFeedback";
import { ComboEffects } from "@/components/shared/ComboEffects";
import { VerseDisplay } from "@/components/shared/VerseDisplay";
import type { Question } from "@/types/lesson";

type GameState = "intro" | "playing" | "feedback" | "complete";

function SpeedBadge({ secondsLeft, timerDuration }: { secondsLeft: number; timerDuration: number }) {
  const ratio = secondsLeft / timerDuration;
  if (ratio >= 0.8) return <div className="quiz-speed-badge quiz-speed-lightning" key={secondsLeft}>LIGHTNING!</div>;
  if (ratio >= 0.5) return <div className="quiz-speed-badge quiz-speed-fast" key={secondsLeft}>FAST!</div>;
  return null;
}

function PodiumScreen({
  score,
  totalCorrect,
  questionsAnswered,
  stars,
  lesson,
  onPlayAgain,
}: {
  score: number;
  totalCorrect: number;
  questionsAnswered: number;
  stars: number;
  lesson: { meta: { verseReference: string; verseText: string } };
  onPlayAgain: () => void;
}) {
  const [displayScore, setDisplayScore] = useState(0);
  const [showStars, setShowStars] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (score === 0) {
      setDisplayScore(0);
      setShowStars(true);
      setShowStats(true);
      return;
    }
    const steps = 30;
    const increment = Math.ceil(score / steps);
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= score) {
        current = score;
        clearInterval(timer);
        setTimeout(() => setShowStars(true), 200);
        setTimeout(() => { setShowStats(true); setShowConfetti(true); }, 600);
      }
      setDisplayScore(current);
    }, 40);
    return () => clearInterval(timer);
  }, [score]);

  const percentage = questionsAnswered > 0
    ? Math.round((totalCorrect / questionsAnswered) * 100)
    : 0;
  const rank = stars === 3 ? "Champion" : stars === 2 ? "Great Job" : "Good Try";

  return (
    <div className="quiz-container">
      <div className="quiz-complete quiz-podium">
        {showConfetti && (
          <div className="quiz-confetti" aria-hidden="true">
            {Array.from({ length: 20 }, (_, i) => (
              <span
                key={i}
                className="quiz-confetti-piece"
                style={{
                  "--confetti-x": `${Math.random() * 100}%`,
                  "--confetti-delay": `${Math.random() * 0.5}s`,
                  "--confetti-color": ["#ff3b5c", "#ffd700", "#00d4ff", "#00ff88", "#a855f7"][i % 5],
                } as React.CSSProperties}
              />
            ))}
          </div>
        )}
        <h1 className="quiz-podium-rank">{rank}!</h1>
        <div className="quiz-podium-trophy">
          {stars === 3 ? "🏆" : stars === 2 ? "🥈" : "🥉"}
        </div>
        <div className="quiz-complete-score">
          <span className="quiz-complete-score-label">Final Score</span>
          <span className="quiz-complete-score-value quiz-score-counting">{displayScore}</span>
        </div>
        <div className={`quiz-complete-stars ${showStars ? "quiz-stars-visible" : "quiz-stars-hidden"}`} aria-label={`${stars} stars`}>
          {[1, 2, 3].map((s) => (
            <span
              key={s}
              className={`quiz-star ${s <= stars ? "quiz-star-earned" : "quiz-star-empty"}`}
              style={{ "--star-delay": `${s * 0.15}s` } as React.CSSProperties}
            >
              &#9733;
            </span>
          ))}
        </div>
        <p className={`quiz-complete-stats ${showStats ? "quiz-stats-visible" : "quiz-stats-hidden"}`}>
          {totalCorrect} of {questionsAnswered} correct ({percentage}%)
        </p>
        <div className={`quiz-podium-bottom ${showStats ? "quiz-stats-visible" : "quiz-stats-hidden"}`}>
          <VerseDisplay
            reference={lesson.meta.verseReference}
            text={lesson.meta.verseText}
          />
          <div className="quiz-complete-actions">
            <button className="btn btn-primary btn-large" onClick={onPlayAgain}>
              Play Again
            </button>
            <a href="#/" className="btn btn-secondary">
              Back to Games
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

const ANSWER_LABELS = ["A", "B", "C", "D"];

export function QuizShowdown() {
  const { lesson, loading, error } = useLesson();
  const { difficulty } = useDifficulty();

  const [gameState, setGameState] = useState<GameState>("intro");
  const [score, setScore] = useState(0);
  const { streak, streakJustBroke, recordAnswer, reset: resetStreak } = useComboStreak();
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(
    null,
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [timerPaused, setTimerPaused] = useState(false);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState(0);

  const poolRef = useRef<QuestionPool | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const timerDuration = difficulty === "little-kids" ? 30 : 15;

  // Create question pool when lesson or difficulty changes
  const pool = useMemo(() => {
    if (!lesson) return null;
    const p = new QuestionPool(lesson.questions, difficulty);
    poolRef.current = p;
    return p;
  }, [lesson, difficulty]);

  // Start the custom timer tracking for score bonus
  const startTimerTracking = useCallback(() => {
    setTimerSecondsLeft(timerDuration);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setTimerSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timerIntervalRef.current)
            clearInterval(timerIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [timerDuration]);

  const stopTimerTracking = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopTimerTracking();
  }, [stopTimerTracking]);

  function nextQuestion() {
    if (!pool || !pool.hasMore()) {
      setGameState("complete");
      playCelebration();
      return;
    }
    const q = pool.next();
    setCurrentQuestion(q);
    setSelectedIndex(null);
    setWasCorrect(false);
    setTimerPaused(false);
    setTimerKey((prev) => prev + 1);
    setGameState("playing");
    startTimerTracking();
  }

  function handleStart() {
    setScore(0);
    resetStreak();
    setQuestionsAnswered(0);
    setTotalCorrect(0);
    if (pool) pool.reset();
    nextQuestion();
  }

  function handlePlayAgain() {
    setGameState("intro");
    setScore(0);
    resetStreak();
    setQuestionsAnswered(0);
    setTotalCorrect(0);
  }

  const handleAnswer = useCallback(
    (index: number) => {
      if (gameState !== "playing" || selectedIndex !== null || !currentQuestion)
        return;

      setSelectedIndex(index);
      setTimerPaused(true);
      stopTimerTracking();

      const correct = index === currentQuestion.correctIndex;
      setWasCorrect(correct);
      setQuestionsAnswered((prev) => prev + 1);

      const { newStreak } = recordAnswer(correct);

      if (correct) {
        // When streak >= 2, the hook already played the streak tone
        if (newStreak < 2) {
          playCorrect();
        }
        setTotalCorrect((prev) => prev + 1);

        // Scoring: 100 base + time bonus + streak bonus
        const timeBonus = timerSecondsLeft * 10;
        const streakBonus = newStreak > 1 ? newStreak * 50 : 0;
        setScore((prev) => prev + 100 + timeBonus + streakBonus);
      } else {
        playWrong();
      }

      setGameState("feedback");
    },
    [
      gameState,
      selectedIndex,
      currentQuestion,
      timerSecondsLeft,
      stopTimerTracking,
      recordAnswer,
    ],
  );

  const handleNext = useCallback(() => {
    nextQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);

  function handleTimerComplete() {
    if (gameState !== "playing" || selectedIndex !== null) return;
    // Time's up — treat as wrong answer
    setSelectedIndex(-1);
    setTimerPaused(true);
    stopTimerTracking();
    setWasCorrect(false);
    recordAnswer(false);
    setQuestionsAnswered((prev) => prev + 1);
    playWrong();
    setGameState("feedback");
  }

  // Keyboard support (1-4 to select answer)
  useEffect(() => {
    if (gameState !== "playing") return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key >= "1" && e.key <= "4") {
        const index = parseInt(e.key) - 1;
        if (currentQuestion && index < currentQuestion.options.length) {
          handleAnswer(index);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState, currentQuestion, handleAnswer]);

  // Space/Enter to advance from feedback
  useEffect(() => {
    if (gameState !== "feedback") return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        handleNext();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState, handleNext]);

  // --- Loading / Error states ---
  if (loading) {
    return (
      <div className="quiz-container">
        <div className="loading">Loading lesson...</div>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="quiz-container">
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
      <div className={"quiz-container"}>
        <div className="quiz-intro">
          <a href="#/" className="quiz-back-link">
            &larr; Back
          </a>
          <h1 className="quiz-intro-title">Quiz Showdown</h1>
          <h2 className="quiz-intro-lesson">{lesson.meta.title}</h2>
          <VerseDisplay
            reference={lesson.meta.verseReference}
            text={lesson.meta.verseText}
          />
          <p className="quiz-intro-info">
            {pool?.total ?? 0} questions &middot;{" "}
            {difficulty === "little-kids" ? "30" : "15"}s per question
          </p>
          <button className="btn btn-primary btn-large" onClick={handleStart}>
            Ready? Let&apos;s Go!
          </button>
        </div>
      </div>
    );
  }

  // --- Complete screen ---
  if (gameState === "complete") {
    const percentage =
      questionsAnswered > 0
        ? Math.round((totalCorrect / questionsAnswered) * 100)
        : 0;
    const stars = percentage >= 90 ? 3 : percentage >= 60 ? 2 : 1;
    saveScore("quiz-showdown", stars);

    return (
      <PodiumScreen
        score={score}
        totalCorrect={totalCorrect}
        questionsAnswered={questionsAnswered}
        stars={stars}
        lesson={lesson}
        onPlayAgain={handlePlayAgain}
      />
    );
  }

  // --- Playing / Feedback ---
  return (
    <div className={"quiz-container"}>
      <div className="quiz-hud">
        <Scoreboard score={score} streak={streak} />
        <div className="quiz-progress">
          {pool ? `${pool.consumed} / ${pool.total}` : ""}
        </div>
        <Timer
          key={timerKey}
          seconds={timerDuration}
          onComplete={handleTimerComplete}
          paused={timerPaused}
        />
      </div>

      {gameState === "feedback" && currentQuestion ? (
        <>
          {wasCorrect && <SpeedBadge secondsLeft={timerSecondsLeft} timerDuration={timerDuration} />}
          <AnswerFeedback
            correct={wasCorrect}
            explanation={currentQuestion.explanation}
            onNext={handleNext}
          />
        </>
      ) : (
        currentQuestion && (
          <div className="quiz-question-area">
            <h2 className="quiz-question-text">{currentQuestion.text}</h2>
            {currentQuestion.hint && difficulty === "little-kids" && (
              <p className="quiz-hint">Hint: {currentQuestion.hint}</p>
            )}
            <div className="quiz-answers">
              {currentQuestion.options.map((option, idx) => (
                <button
                  key={idx}
                  className={`quiz-answer-btn ${
                    selectedIndex === idx ? "quiz-answer-selected" : ""
                  }`}
                  onClick={() => handleAnswer(idx)}
                  disabled={selectedIndex !== null}
                >
                  <span className="quiz-answer-label">
                    {ANSWER_LABELS[idx]}
                  </span>
                  <span className="quiz-answer-text">{option}</span>
                </button>
              ))}
            </div>
          </div>
        )
      )}

      <ComboEffects streak={streak} streakJustBroke={streakJustBroke} />
    </div>
  );
}
