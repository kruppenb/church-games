import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLesson } from "@/hooks/useLesson";
import { useDifficulty } from "@/hooks/useDifficulty";
import { QuestionPool } from "@/lib/question-pool";
import { playCorrect, playWrong, playCelebration } from "@/lib/sounds";
import { saveScore } from "@/lib/score-store";
import { AnswerFeedback } from "@/components/shared/AnswerFeedback";
import { Celebration } from "@/components/shared/Celebration";
import { VerseDisplay } from "@/components/shared/VerseDisplay";
import type { Question } from "@/types/lesson";
import {
  generateCards,
  dealHands,
  mulligan,
  createBattleState,
  resolveClash,
  applyClashResult,
  aiSelectCard,
  isGameOver,
  calculateStars,
  getAbilityEmoji,
  getAbilityName,
  getAbilityDescription,
  getDifficultyBorder,
  getDifficultyLabel,
  getAiPowerRange,
  loadCollection,
  addToCollection,
} from "./logic/card-logic";
import type { Card, BattleState, ClashResult } from "./logic/card-logic";
import "./CardBattler.css";

const ANSWER_LABELS = ["A", "B", "C", "D"];

// Bonus questions trigger after turns 2 and 4 (0-indexed: after turn indices 1 and 3)
const BONUS_AFTER_TURNS = [2, 4];

type GameState =
  | "intro"
  | "mulligan"
  | "select-card"
  | "ai-reveal"
  | "question"
  | "feedback"
  | "clash"
  | "clash-result"
  | "bonus-question"
  | "bonus-feedback"
  | "complete";

// --- Card Visual Component ---

function CardVisual({
  card,
  onClick,
  selectable = false,
  selected = false,
  mulliganSelected = false,
  className = "",
}: {
  card: Card;
  onClick?: () => void;
  selectable?: boolean;
  selected?: boolean;
  mulliganSelected?: boolean;
  className?: string;
}) {
  const borderClass = `card-item--${getDifficultyBorder(card.difficulty)}`;
  const selectableClass = selectable ? "card-item--selectable" : "";
  const selectedClass = selected ? "card-item--selected" : "";
  const mulliganClass = mulliganSelected ? "card-item--mulligan-selected" : "";

  return (
    <div
      className={`card-item ${borderClass} ${selectableClass} ${selectedClass} ${mulliganClass} ${className}`}
      onClick={selectable ? onClick : undefined}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={
        selectable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick?.();
            }
          : undefined
      }
    >
      <div className="card-rarity-badge" data-rarity={getDifficultyBorder(card.difficulty)}>
        {getDifficultyLabel(card.difficulty)}
      </div>
      <div className="card-name">{card.name}</div>
      <div className="card-description">{card.description}</div>
      <div className="card-stats">
        <span className="card-power">{"\u2694\uFE0F"} {card.power}</span>
        <span className="card-ability" title={getAbilityDescription(card.ability)}>
          {getAbilityEmoji(card.ability)} {getAbilityName(card.ability)}
        </span>
      </div>
    </div>
  );
}

function CardBack() {
  return (
    <div className="card-back">
      <span className="card-back-pattern">{"\u2728"}</span>
    </div>
  );
}

// --- Enemy Intent Component ---

function EnemyIntentCard({ aiHand }: { aiHand: Card[] }) {
  const range = getAiPowerRange(aiHand);
  const rangeText =
    range.min === range.max ? `${range.min}` : `${range.min}-${range.max}`;

  return (
    <div className="card-enemy-intent">
      <div className="card-enemy-intent-card">
        <span className="card-enemy-intent-question">?</span>
        <span className="card-enemy-intent-hint">
          Power: {rangeText}
        </span>
      </div>
      <span className="card-enemy-intent-label">Next play</span>
    </div>
  );
}

// --- Particle Burst Component ---

function ParticleBurst({ winner }: { winner: "player" | "ai" }) {
  const cls = winner === "player" ? "card-particle--win" : "card-particle--lose";
  return (
    <div className="card-particles">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className={`card-particle ${cls}`} />
      ))}
    </div>
  );
}

// --- Card Gallery Component ---

function CardGallery({
  allCards,
  onClose,
}: {
  allCards: Card[];
  onClose: () => void;
}) {
  const collection = loadCollection();

  // Deduplicate cards by name for the gallery
  const uniqueCards = useMemo(() => {
    const seen = new Set<string>();
    return allCards.filter((card) => {
      if (seen.has(card.name)) return false;
      seen.add(card.name);
      return true;
    });
  }, [allCards]);

  const discoveredCount = uniqueCards.filter((c) =>
    collection.has(c.name),
  ).length;
  const totalCount = uniqueCards.length;
  const pct = totalCount > 0 ? (discoveredCount / totalCount) * 100 : 0;

  return (
    <div className="card-gallery-overlay" onClick={onClose}>
      <div
        className="card-gallery-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-gallery-header">
          <h2 className="card-gallery-title">Card Book</h2>
          <button className="card-gallery-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="card-gallery-progress">
          <span className="card-gallery-progress-text">
            {discoveredCount}/{totalCount} cards discovered
          </span>
          <div className="card-gallery-progress-bar">
            <div
              className="card-gallery-progress-fill"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="card-gallery-grid">
          {uniqueCards.map((card) => {
            const discovered = collection.has(card.name);
            return (
              <div
                key={card.id}
                className={`card-gallery-item ${
                  !discovered ? "card-gallery-item--undiscovered" : ""
                }`}
              >
                <CardVisual card={card} />
                {!discovered && (
                  <div className="card-undiscovered-overlay">?</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- HP Bar Component ---

function HpBar({
  current,
  max,
  label,
  side,
}: {
  current: number;
  max: number;
  label: string;
  side: "player" | "ai";
}) {
  const pct = Math.max(0, (current / max) * 100);

  return (
    <div className={`card-hp-row card-hp-row--${side}`}>
      <span className="card-hp-label">{label}</span>
      <div className="card-hp-bar-track">
        <div
          className={`card-hp-bar-fill card-hp-bar-fill--${side}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="card-hp-value">
        {current}/{max}
      </span>
    </div>
  );
}

// --- Main Component ---

export function CardBattler() {
  const { lesson, loading, error } = useLesson();
  const { difficulty } = useDifficulty();

  // Game state machine
  const [gameState, setGameState] = useState<GameState>("intro");
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [questionPool, setQuestionPool] = useState<QuestionPool | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerCorrect, setAnswerCorrect] = useState<boolean>(false);
  const [clashResult, setClashResult] = useState<ClashResult | null>(null);
  const [mulliganIndices, setMulliganIndices] = useState<number[]>([]);
  const [remainingPool, setRemainingPool] = useState<Card[]>([]);
  const [showCelebration, setShowCelebration] = useState(false);
  const [stars, setStars] = useState(0);

  // Track whether current question is a bonus question
  const [isBonusQuestion, setIsBonusQuestion] = useState(false);

  // Card gallery state
  const [showGallery, setShowGallery] = useState(false);

  // Clash animation state: tracks who won the clash for projectile direction
  const [clashWinner, setClashWinner] = useState<"player" | "ai" | "tie" | null>(null);

  // Timer ref for auto-advancing states
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Generate cards from all termPairs
  const allCards = useMemo(() => {
    if (!lesson?.termPairs?.length) return [];
    return generateCards(lesson.termPairs);
  }, [lesson]);

  // --- Start Game ---

  const handleStart = useCallback(() => {
    if (!lesson || allCards.length === 0) return;

    const pool = new QuestionPool(lesson.questions, difficulty);
    setQuestionPool(pool);

    const { playerHand, aiHand, remainingPool: rp } = dealHands(allCards);
    setRemainingPool(rp);

    // Save dealt player cards to collection (player can see them)
    addToCollection(playerHand);

    if (difficulty === "big-kids") {
      // Big kids get mulligan
      const state = createBattleState(playerHand, aiHand);
      setBattleState(state);
      setGameState("mulligan");
    } else {
      // Little kids skip mulligan
      const state = createBattleState(playerHand, aiHand);
      setBattleState(state);
      setGameState("select-card");
    }
  }, [lesson, allCards, difficulty]);

  // --- Mulligan ---

  const handleMulliganToggle = useCallback(
    (index: number) => {
      setMulliganIndices((prev) => {
        if (prev.includes(index)) {
          return prev.filter((i) => i !== index);
        }
        if (prev.length >= 2) return prev; // max 2
        return [...prev, index];
      });
    },
    [],
  );

  const handleMulliganConfirm = useCallback(() => {
    if (!battleState) return;

    if (mulliganIndices.length > 0) {
      const newHand = mulligan(
        battleState.playerHand,
        remainingPool,
        mulliganIndices,
      );
      setBattleState((prev) =>
        prev ? { ...prev, playerHand: newHand } : prev,
      );
    }

    setMulliganIndices([]);
    setGameState("select-card");
  }, [battleState, mulliganIndices, remainingPool]);

  // --- Card Selection ---

  const handleCardSelect = useCallback(
    (card: Card) => {
      if (!battleState || gameState !== "select-card") return;

      // Player plays card
      const aiCard = aiSelectCard(
        battleState.aiHand,
        battleState.lastPlayerPower,
      );

      setBattleState((prev) =>
        prev
          ? { ...prev, playerPlayedCard: card, aiPlayedCard: aiCard }
          : prev,
      );

      // Reveal AI card
      setGameState("ai-reveal");

      timerRef.current = setTimeout(() => {
        // Show question
        if (questionPool?.hasMore()) {
          setCurrentQuestion(questionPool.next());
          setIsBonusQuestion(false);
          setSelectedAnswer(null);
          setGameState("question");
        } else {
          // No more questions: resolve with "wrong" by default
          handleClash(card, aiCard, false);
        }
      }, 800);
    },
    [battleState, gameState, questionPool],
  );

  // --- Answer Question ---

  const handleAnswer = useCallback(
    (optionIndex: number) => {
      if (selectedAnswer !== null || !currentQuestion) return;

      const correct = optionIndex === currentQuestion.correctIndex;
      setSelectedAnswer(optionIndex);
      setAnswerCorrect(correct);

      if (correct) {
        playCorrect();
      } else {
        playWrong();
      }

      // Show feedback
      timerRef.current = setTimeout(() => {
        setGameState("feedback");
      }, 600);
    },
    [selectedAnswer, currentQuestion],
  );

  // --- Clash Resolution ---

  const handleClash = useCallback(
    (playerCard: Card, aiCard: Card, correct: boolean) => {
      const result = resolveClash(playerCard, aiCard, correct);
      setClashResult(result);
      setGameState("clash");

      // Determine clash winner for projectile animation
      if (result.aiDamage > result.playerDamage) {
        setClashWinner("player");
      } else if (result.playerDamage > result.aiDamage) {
        setClashWinner("ai");
      } else {
        setClashWinner("tie");
      }

      // Save both cards to collection
      addToCollection([playerCard, aiCard]);

      // Show clash animation then result
      timerRef.current = setTimeout(() => {
        setGameState("clash-result");

        // After showing result, apply it
        timerRef.current = setTimeout(() => {
          setBattleState((prev) => {
            if (!prev) return prev;
            const newState = applyClashResult(prev, result);

            if (newState.gameOver) {
              // Delay to show final HP change
              setTimeout(() => {
                const s = calculateStars(newState);
                setStars(s);
                if (newState.winner === "player") {
                  playCelebration();
                  setShowCelebration(true);
                }
                setGameState("complete");
              }, 500);
            } else {
              // Check if bonus question should trigger
              const turnJustCompleted = newState.turn;
              if (BONUS_AFTER_TURNS.includes(turnJustCompleted)) {
                setTimeout(() => {
                  if (questionPool?.hasMore()) {
                    setCurrentQuestion(questionPool.next());
                    setIsBonusQuestion(true);
                    setSelectedAnswer(null);
                    setGameState("bonus-question");
                  } else {
                    setGameState("select-card");
                  }
                }, 400);
              } else {
                setTimeout(() => {
                  setGameState("select-card");
                }, 400);
              }
            }

            return newState;
          });
        }, 1200);
      }, 600);
    },
    [questionPool],
  );

  // Handle transition from feedback to clash
  const handleFeedbackDone = useCallback(() => {
    if (!battleState?.playerPlayedCard || !battleState?.aiPlayedCard) return;
    handleClash(
      battleState.playerPlayedCard,
      battleState.aiPlayedCard,
      answerCorrect,
    );
  }, [battleState, answerCorrect, handleClash]);

  // --- Bonus Question Answer ---

  const handleBonusAnswer = useCallback(
    (optionIndex: number) => {
      if (selectedAnswer !== null || !currentQuestion) return;

      const correct = optionIndex === currentQuestion.correctIndex;
      setSelectedAnswer(optionIndex);
      setAnswerCorrect(correct);

      if (correct) {
        playCorrect();
        // Heal +1 HP
        setBattleState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            playerHp: Math.min(prev.maxHp, prev.playerHp + 1),
          };
        });
      } else {
        playWrong();
      }

      timerRef.current = setTimeout(() => {
        setGameState("bonus-feedback");
      }, 600);
    },
    [selectedAnswer, currentQuestion],
  );

  const handleBonusFeedbackDone = useCallback(() => {
    setGameState("select-card");
  }, []);

  // --- Restart ---

  const handleRestart = useCallback(() => {
    setGameState("intro");
    setBattleState(null);
    setQuestionPool(null);
    setCurrentQuestion(null);
    setSelectedAnswer(null);
    setAnswerCorrect(false);
    setClashResult(null);
    setMulliganIndices([]);
    setRemainingPool([]);
    setShowCelebration(false);
    setStars(0);
    setIsBonusQuestion(false);
    setClashWinner(null);
  }, []);

  // --- Loading / Error ---

  if (loading) {
    return (
      <div className="card-container">
        <div className="loading">Loading lesson...</div>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="card-container">
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

  if (allCards.length === 0) {
    return (
      <div className="card-container">
        <div className="quiz-error">
          <h2>Not enough content</h2>
          <p>This lesson needs term pairs to play Scripture Cards.</p>
          <a href="#/" className="btn btn-primary">
            Back to Home
          </a>
        </div>
      </div>
    );
  }

  // --- Intro Screen ---

  if (gameState === "intro") {
    return (
      <div className="card-container">
        {showGallery && (
          <CardGallery
            allCards={allCards}
            onClose={() => setShowGallery(false)}
          />
        )}
        <div className="card-intro">
          <a href="#/" className="quiz-back-link">
            &larr; Back
          </a>
          <h1 className="card-intro-title">Scripture Cards</h1>
          <h2 className="card-intro-lesson">{lesson.meta.title}</h2>
          <VerseDisplay
            reference={lesson.meta.verseReference}
            text={lesson.meta.verseText}
          />
          <p style={{ color: "var(--color-text-dim)", textAlign: "center", fontSize: "0.9rem" }}>
            Battle the AI with cards powered by today's lesson!
            Answer questions to boost your cards' power.
          </p>
          <button className="btn btn-primary btn-large" onClick={handleStart}>
            Start Battle
          </button>
          <button
            className="btn-card-book"
            onClick={() => setShowGallery(true)}
          >
            {"\uD83D\uDCD6"} Card Book
          </button>
        </div>
      </div>
    );
  }

  // --- Mulligan Screen ---

  if (gameState === "mulligan" && battleState) {
    return (
      <div className="card-container">
        <div className="card-mulligan">
          <h2 className="card-mulligan-title">Your Cards</h2>
          <p className="card-mulligan-hint">
            Tap up to 2 cards to swap them for new ones, or keep your hand.
          </p>
          <div className="card-mulligan-hand">
            {battleState.playerHand.map((card, i) => (
              <CardVisual
                key={card.id}
                card={card}
                selectable
                mulliganSelected={mulliganIndices.includes(i)}
                onClick={() => handleMulliganToggle(i)}
              />
            ))}
          </div>
          <div className="card-mulligan-actions">
            <button
              className="btn btn-secondary"
              onClick={handleMulliganConfirm}
            >
              Keep Hand
            </button>
            {mulliganIndices.length > 0 && (
              <button
                className="btn btn-primary"
                onClick={handleMulliganConfirm}
              >
                Swap {mulliganIndices.length} Card
                {mulliganIndices.length > 1 ? "s" : ""}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Complete Screen ---

  if (gameState === "complete" && battleState) {
    saveScore("scripture-cards", stars);
    const winnerText =
      battleState.winner === "player"
        ? "Your faith is strong!"
        : battleState.winner === "ai"
          ? "Great battle! Try again?"
          : "It's a draw!";

    const titleClass =
      battleState.winner === "player"
        ? "card-complete-title--win"
        : battleState.winner === "ai"
          ? "card-complete-title--lose"
          : "card-complete-title--draw";

    return (
      <div className="card-container">
        <Celebration
          show={showCelebration}
          text="Victory!"
          stars={stars}
          onDismiss={() => setShowCelebration(false)}
        />
        <div className="card-complete">
          <h1 className={`card-complete-title ${titleClass}`}>{winnerText}</h1>
          <div className="card-stars" aria-label={`${stars} stars`}>
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                className={`card-star ${s <= stars ? "card-star--earned" : "card-star--empty"}`}
                style={
                  s <= stars ? { animationDelay: `${0.2 + s * 0.2}s` } : undefined
                }
              >
                &#9733;
              </span>
            ))}
          </div>
          <div className="card-complete-stats">
            <div className="card-complete-stat">
              <span className="card-complete-stat-label">Your HP</span>
              <span
                className="card-complete-stat-value"
                style={{ color: "var(--color-success)" }}
              >
                {battleState.playerHp}
              </span>
            </div>
            <div className="card-complete-stat">
              <span className="card-complete-stat-label">AI HP</span>
              <span
                className="card-complete-stat-value"
                style={{ color: "var(--color-error)" }}
              >
                {battleState.aiHp}
              </span>
            </div>
          </div>
          <VerseDisplay
            reference={lesson.meta.verseReference}
            text={lesson.meta.verseText}
          />
          <div className="card-complete-actions">
            <button
              className="btn btn-primary btn-large"
              onClick={handleRestart}
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

  // --- Battle Screen ---

  if (!battleState) return null;

  return (
    <div className="card-container">
      <a href="#/" className="quiz-back-link">
        &larr; Back
      </a>

      <div className="card-battlefield">
        {/* Status bar */}
        <div className="card-status-bar">
          <span className="card-turn-indicator">
            Turn {battleState.turn + 1}/{battleState.maxTurns}
          </span>
          <span>Cards: {battleState.playerHand.length}</span>
        </div>

        {/* AI HP */}
        <HpBar
          current={battleState.aiHp}
          max={battleState.maxHp}
          label="AI"
          side="ai"
        />

        {/* AI Hand (card backs) + Enemy Intent */}
        <div className="card-hand-row">
          {battleState.aiHand.map((_, i) => (
            <CardBack key={i} />
          ))}
          {gameState === "select-card" && battleState.aiHand.length > 0 && (
            <EnemyIntentCard aiHand={battleState.aiHand} />
          )}
        </div>

        {/* Peek card from Draw ability */}
        {battleState.peekAiCard && gameState === "select-card" && (
          <div className="card-peek">
            {"\u{1F441}\uFE0F"} AI's next card: {battleState.peekAiCard.name} (Power{" "}
            {battleState.peekAiCard.power})
          </div>
        )}

        {/* Arena (played cards) */}
        <div className={`card-arena ${gameState === "clash" ? "card-arena--clash-active" : ""}`}>
          {/* AI played card */}
          <div className="card-arena-slot">
            {battleState.aiPlayedCard &&
            (gameState === "ai-reveal" ||
              gameState === "question" ||
              gameState === "feedback" ||
              gameState === "clash" ||
              gameState === "clash-result") ? (
              <CardVisual
                card={battleState.aiPlayedCard}
                className={`${
                  gameState === "ai-reveal"
                    ? "card-ai-reveal"
                    : gameState === "clash"
                      ? "card-clash-shake"
                      : ""
                } ${
                  gameState === "clash" && clashWinner === "player"
                    ? "card-item--hit-recoil"
                    : ""
                }`}
              />
            ) : null}
          </div>

          {/* Divider */}
          {battleState.playerPlayedCard && battleState.aiPlayedCard && (
            <div className="card-arena-divider">{"\u2694\uFE0F"}</div>
          )}

          {/* Attack projectile */}
          {gameState === "clash" && clashWinner && clashWinner !== "tie" && (
            <div
              className={`card-projectile ${
                clashWinner === "player"
                  ? "card-projectile--player-wins"
                  : "card-projectile--ai-wins"
              }`}
            />
          )}

          {/* Particle burst on impact */}
          {gameState === "clash" && clashWinner && clashWinner !== "tie" && (
            <ParticleBurst winner={clashWinner} />
          )}

          {/* Impact flash */}
          {gameState === "clash" && clashWinner && clashWinner !== "tie" && (
            <div
              className={`card-impact-flash ${
                clashWinner === "player"
                  ? "card-impact-flash--player-wins"
                  : "card-impact-flash--ai-wins"
              }`}
            />
          )}

          {/* Clash result overlay */}
          {gameState === "clash-result" && clashResult && (
            <div
              className={`card-clash-result ${
                clashResult.aiDamage > clashResult.playerDamage
                  ? "card-clash-result--win"
                  : clashResult.playerDamage > clashResult.aiDamage
                    ? "card-clash-result--lose"
                    : "card-clash-result--tie"
              }`}
            >
              {clashResult.aiDamage > clashResult.playerDamage
                ? "You Win!"
                : clashResult.playerDamage > clashResult.aiDamage
                  ? "AI Wins!"
                  : "Tie!"}
              <div className="card-clash-damage">
                {clashResult.playerEffectivePower} vs{" "}
                {clashResult.aiEffectivePower}
              </div>
              <div className="card-clash-detail">
                {clashResult.aiDamage > 0 && (
                  <span className="clash-detail-win">
                    {"\u2694\uFE0F"} You dealt {clashResult.aiDamage} damage!
                  </span>
                )}
                {clashResult.playerDamage > 0 && (
                  <span className="clash-detail-lose">
                    {"\u{1F4A5}"} You took {clashResult.playerDamage} damage!
                  </span>
                )}
              </div>
              {clashResult.abilityText && (
                <div className="card-ability-text">
                  {clashResult.abilityText}
                </div>
              )}
            </div>
          )}

          {/* Player played card */}
          <div className="card-arena-slot">
            {battleState.playerPlayedCard &&
            (gameState === "ai-reveal" ||
              gameState === "question" ||
              gameState === "feedback" ||
              gameState === "clash" ||
              gameState === "clash-result") ? (
              <CardVisual
                card={battleState.playerPlayedCard}
                className={`card-played ${
                  gameState === "clash"
                    ? "card-clash-shake"
                    : clashResult?.abilityTriggered
                      ? "card-ability-glow"
                      : ""
                } ${
                  gameState === "clash" && clashWinner === "ai"
                    ? "card-item--hit-recoil"
                    : ""
                }`}
              />
            ) : null}
          </div>
        </div>

        {/* Player HP */}
        <HpBar
          current={battleState.playerHp}
          max={battleState.maxHp}
          label="You"
          side="player"
        />

        {/* Instruction text */}
        {gameState === "select-card" && (
          <div className="card-instruction">Choose a card to play!</div>
        )}

        {/* Player Hand */}
        {gameState === "select-card" && (
          <div className="card-hand-row">
            {battleState.playerHand.map((card) => (
              <CardVisual
                key={card.id}
                card={card}
                selectable
                onClick={() => handleCardSelect(card)}
              />
            ))}
          </div>
        )}

        {/* Also show hand during other states (non-interactive) */}
        {gameState !== "select-card" && (
            <div className="card-hand-row">
              {battleState.playerHand
                .filter((c) => c.id !== battleState.playerPlayedCard?.id)
                .map((card) => (
                  <CardVisual key={card.id} card={card} />
                ))}
            </div>
          )}
      </div>

      {/* Question Overlay */}
      {gameState === "question" && currentQuestion && (
        <div className="card-question-overlay">
          <div className="card-question-panel">
            <div className="card-question-label">Answer to power up!</div>
            <div className="card-question-text">{currentQuestion.text}</div>
            <div className="quiz-answers">
              {currentQuestion.options.map((option, idx) => {
                let btnClass = "quiz-answer-btn";
                if (selectedAnswer !== null) {
                  if (idx === currentQuestion.correctIndex) {
                    btnClass += " quiz-answer-correct";
                  } else if (
                    idx === selectedAnswer &&
                    idx !== currentQuestion.correctIndex
                  ) {
                    btnClass += " quiz-answer-wrong";
                  }
                }
                return (
                  <button
                    key={idx}
                    className={btnClass}
                    onClick={() => handleAnswer(idx)}
                    disabled={selectedAnswer !== null}
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

      {/* Feedback Overlay */}
      {gameState === "feedback" && currentQuestion && (
        <div className="card-question-overlay">
          <AnswerFeedback
            correct={answerCorrect}
            explanation={currentQuestion.explanation}
            onNext={handleFeedbackDone}
          />
        </div>
      )}

      {/* Bonus Question Overlay */}
      {gameState === "bonus-question" && currentQuestion && (
        <div className="card-question-overlay">
          <div className="card-question-panel">
            <div className="card-bonus-banner">
              {"\u2B50"} Bonus Question! Correct = +1 HP
            </div>
            <div className="card-question-text">{currentQuestion.text}</div>
            <div className="quiz-answers">
              {currentQuestion.options.map((option, idx) => {
                let btnClass = "quiz-answer-btn";
                if (selectedAnswer !== null) {
                  if (idx === currentQuestion.correctIndex) {
                    btnClass += " quiz-answer-correct";
                  } else if (
                    idx === selectedAnswer &&
                    idx !== currentQuestion.correctIndex
                  ) {
                    btnClass += " quiz-answer-wrong";
                  }
                }
                return (
                  <button
                    key={idx}
                    className={btnClass}
                    onClick={() => handleBonusAnswer(idx)}
                    disabled={selectedAnswer !== null}
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

      {/* Bonus Feedback Overlay */}
      {gameState === "bonus-feedback" && currentQuestion && (
        <div className="card-question-overlay">
          <AnswerFeedback
            correct={answerCorrect}
            explanation={currentQuestion.explanation}
            onNext={handleBonusFeedbackDone}
          />
        </div>
      )}
    </div>
  );
}
