import { useState, useEffect, useCallback, useMemo } from "react";
import { useLesson } from "@/hooks/useLesson";
import { useDifficulty } from "@/hooks/useDifficulty";
import { filterByDifficulty } from "@/lib/difficulty";
import { playCorrect, playWrong, playCelebration } from "@/lib/sounds";
import { VerseDisplay } from "@/components/shared/VerseDisplay";
import type { KeyWord } from "@/types/lesson";

type GameState = "intro" | "playing" | "celebration" | "complete";

interface LetterTile {
  letter: string;
  originalIndex: number;
  used: boolean;
}

interface AnswerSlot {
  letter: string | null;
  /** Index into the scrambled tiles array */
  tileIndex: number | null;
}

/**
 * Fisher-Yates shuffle. Returns a new array.
 * If the result equals the original (and length > 1), re-shuffles until different.
 */
function shuffleLetters(word: string): string[] {
  const letters = word.toUpperCase().split("");
  if (letters.length <= 1) return letters;

  const shuffle = (arr: string[]): string[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  let result = shuffle(letters);
  // Keep shuffling until we get a different order
  let attempts = 0;
  while (result.join("") === letters.join("") && attempts < 100) {
    result = shuffle(letters);
    attempts++;
  }
  return result;
}

export function WordScramble() {
  const { lesson, loading, error } = useLesson();
  const { difficulty } = useDifficulty();

  const [gameState, setGameState] = useState<GameState>("intro");
  const [score, setScore] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [tiles, setTiles] = useState<LetterTile[]>([]);
  const [answerSlots, setAnswerSlots] = useState<AnswerSlot[]>([]);
  const [hintUsed, setHintUsed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [firstAttempt, setFirstAttempt] = useState(true);
  const [wrongShake, setWrongShake] = useState(false);
  const [correctFlash, setCorrectFlash] = useState(false);
  const [wordsWithoutHint, setWordsWithoutHint] = useState(0);
  const [wordsFirstAttempt, setWordsFirstAttempt] = useState(0);

  // Filter keywords by difficulty
  const words: KeyWord[] = useMemo(() => {
    if (!lesson) return [];
    return filterByDifficulty(lesson.keyWords, difficulty);
  }, [lesson, difficulty]);

  const currentWord = words[currentWordIndex] ?? null;

  const setupWord = useCallback(
    (wordIndex: number) => {
      const kw = words[wordIndex];
      if (!kw) return;

      const scrambled = shuffleLetters(kw.word);
      const newTiles: LetterTile[] = scrambled.map((letter, i) => ({
        letter,
        originalIndex: i,
        used: false,
      }));
      const newSlots: AnswerSlot[] = Array.from(
        { length: kw.word.length },
        () => ({
          letter: null,
          tileIndex: null,
        }),
      );

      setTiles(newTiles);
      setAnswerSlots(newSlots);
      setHintUsed(false);
      setShowHint(false);
      setFirstAttempt(true);
      setWrongShake(false);
      setCorrectFlash(false);
    },
    [words],
  );

  function handleStart() {
    setScore(0);
    setCurrentWordIndex(0);
    setWordsWithoutHint(0);
    setWordsFirstAttempt(0);
    setupWord(0);
    setGameState("playing");
  }

  function handlePlayAgain() {
    setGameState("intro");
    setScore(0);
    setCurrentWordIndex(0);
    setWordsWithoutHint(0);
    setWordsFirstAttempt(0);
  }

  // Place a letter tile into the next empty answer slot
  function handleTileTap(tileIndex: number) {
    if (gameState !== "playing") return;
    if (tiles[tileIndex].used) return;

    // Find first empty slot
    const emptySlotIndex = answerSlots.findIndex((s) => s.letter === null);
    if (emptySlotIndex === -1) return;

    setTiles((prev) =>
      prev.map((t, i) => (i === tileIndex ? { ...t, used: true } : t)),
    );
    setAnswerSlots((prev) =>
      prev.map((s, i) =>
        i === emptySlotIndex
          ? { letter: tiles[tileIndex].letter, tileIndex }
          : s,
      ),
    );
  }

  // Remove a letter from the answer slot and return it to the tiles
  function handleSlotTap(slotIndex: number) {
    if (gameState !== "playing") return;
    const slot = answerSlots[slotIndex];
    if (slot.letter === null || slot.tileIndex === null) return;

    const returnTileIndex = slot.tileIndex;
    setTiles((prev) =>
      prev.map((t, i) =>
        i === returnTileIndex ? { ...t, used: false } : t,
      ),
    );
    setAnswerSlots((prev) =>
      prev.map((s, i) =>
        i === slotIndex ? { letter: null, tileIndex: null } : s,
      ),
    );
  }

  // Check the answer when all slots are filled
  useEffect(() => {
    if (gameState !== "playing" || !currentWord) return;

    const allFilled = answerSlots.every((s) => s.letter !== null);
    if (!allFilled) return;

    const attempt = answerSlots.map((s) => s.letter).join("");
    const target = currentWord.word.toUpperCase();

    if (attempt === target) {
      // Correct!
      playCorrect();
      setCorrectFlash(true);

      let wordScore = 100;
      if (!hintUsed) {
        wordScore += 50;
        setWordsWithoutHint((prev) => prev + 1);
      }
      if (firstAttempt) {
        wordScore += 25;
        setWordsFirstAttempt((prev) => prev + 1);
      }
      setScore((prev) => prev + wordScore);

      setGameState("celebration");

      // Move to next word after 1.5s
      setTimeout(() => {
        const nextIndex = currentWordIndex + 1;
        if (nextIndex >= words.length) {
          setGameState("complete");
          playCelebration();
        } else {
          setCurrentWordIndex(nextIndex);
          setupWord(nextIndex);
          setGameState("playing");
        }
      }, 1500);
    } else {
      // Wrong!
      playWrong();
      setFirstAttempt(false);
      setWrongShake(true);

      // Reset after shake animation
      setTimeout(() => {
        setWrongShake(false);
        // Return all letters to tiles
        setTiles((prev) => prev.map((t) => ({ ...t, used: false })));
        setAnswerSlots((prev) =>
          prev.map(() => ({ letter: null, tileIndex: null })),
        );
      }, 600);
    }
  }, [
    answerSlots,
    gameState,
    currentWord,
    hintUsed,
    firstAttempt,
    currentWordIndex,
    words.length,
    setupWord,
  ]);

  // Keyboard support
  useEffect(() => {
    if (gameState !== "playing") return;

    function handleKeyDown(e: KeyboardEvent) {
      const key = e.key.toUpperCase();
      // Find the first unused tile that matches the typed letter
      const tileIndex = tiles.findIndex(
        (t) => !t.used && t.letter === key,
      );
      if (tileIndex !== -1) {
        handleTileTap(tileIndex);
      }
      // Backspace removes the last placed letter
      if (e.key === "Backspace") {
        // Find last filled slot
        for (let i = answerSlots.length - 1; i >= 0; i--) {
          if (answerSlots[i].letter !== null) {
            handleSlotTap(i);
            break;
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, tiles, answerSlots]);

  // --- Loading / Error states ---
  if (loading) {
    return (
      <div className="scramble-container">
        <div className="loading">Loading lesson...</div>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="scramble-container">
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

  if (words.length === 0) {
    return (
      <div className="scramble-container">
        <div className="quiz-error">
          <h2>No words available</h2>
          <p>There are no key words for this difficulty level.</p>
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
      <div className={"scramble-container"}>
        <div className="quiz-intro">
          <a href="#/" className="quiz-back-link">
            &larr; Back
          </a>
          <h1 className="quiz-intro-title">Word Scramble</h1>
          <h2 className="quiz-intro-lesson">{lesson.meta.title}</h2>
          <VerseDisplay
            reference={lesson.meta.verseReference}
            text={lesson.meta.verseText}
          />
          <p className="quiz-intro-info">
            {words.length} word{words.length !== 1 ? "s" : ""} to unscramble
          </p>
          <button className="btn btn-primary btn-large" onClick={handleStart}>
            Start
          </button>
        </div>
      </div>
    );
  }

  // --- Complete screen ---
  if (gameState === "complete") {
    const totalWords = words.length;
    const percentage =
      totalWords > 0
        ? Math.round((wordsFirstAttempt / totalWords) * 100)
        : 0;
    const stars = percentage >= 90 ? 3 : percentage >= 60 ? 2 : 1;

    return (
      <div className={"scramble-container"}>
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
            <span className="quiz-complete-score-value">{score}</span>
          </div>
          <p className="quiz-complete-stats">
            {wordsWithoutHint} of {totalWords} solved without hints &middot;{" "}
            {wordsFirstAttempt} on first attempt
          </p>
          <VerseDisplay
            reference={lesson.meta.verseReference}
            text={lesson.meta.verseText}
          />
          <div className="quiz-complete-actions">
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

  // --- Playing / Celebration ---
  return (
    <div className={"scramble-container"}>
      <div className="scramble-hud">
        <div className="scramble-score">
          <span className="scoreboard-label">Score</span>
          <span className="scoreboard-value">{score}</span>
        </div>
        <div className="word-progress">
          Word {currentWordIndex + 1} of {words.length}
        </div>
      </div>

      <div className="scramble-play-area">
        <div className="letter-tiles" data-testid="letter-tiles">
          {tiles.map((tile, i) => (
            <button
              key={`tile-${i}`}
              className={`letter-tile ${tile.used ? "used" : ""}`}
              onClick={() => handleTileTap(i)}
              disabled={tile.used || gameState !== "playing"}
              aria-label={`Letter ${tile.letter}`}
            >
              {tile.letter}
            </button>
          ))}
        </div>

        <div
          className={`answer-slots ${wrongShake ? "wrong" : ""} ${correctFlash ? "correct" : ""}`}
          data-testid="answer-slots"
        >
          {answerSlots.map((slot, i) => (
            <button
              key={`slot-${i}`}
              className={`answer-slot ${slot.letter ? "filled" : ""} ${correctFlash && slot.letter ? "correct" : ""} ${wrongShake && slot.letter ? "wrong" : ""}`}
              onClick={() => handleSlotTap(i)}
              disabled={!slot.letter || gameState !== "playing"}
              aria-label={
                slot.letter ? `Placed letter ${slot.letter}` : `Empty slot ${i + 1}`
              }
            >
              {slot.letter ?? ""}
            </button>
          ))}
        </div>

        <div className="scramble-actions">
          <button
            className="btn btn-secondary scramble-hint-btn"
            onClick={() => {
              setHintUsed(true);
              setShowHint(true);
            }}
            disabled={gameState !== "playing"}
            aria-label="Show hint"
          >
            <span aria-hidden="true">&#128161;</span> Hint
          </button>
        </div>

        {showHint && currentWord && (
          <div className="hint-bubble" data-testid="hint-bubble">
            {currentWord.hint}
          </div>
        )}
      </div>
    </div>
  );
}
