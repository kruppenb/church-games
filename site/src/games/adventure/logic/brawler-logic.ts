/**
 * Pure game logic for the Bible Brawler beat-em-up.
 * Extracted from the Phaser scene for testability.
 */

export interface BrawlerState {
  playerHp: number;
  maxHp: number;
  score: number;
  streak: number;
  bestStreak: number;
  currentWave: number;
  totalWaves: number;
  wavesCleared: boolean[];
  isBossWave: boolean;
  powerUpLevel: number; // 0=none, 1=fire(3-streak), 2=lightning(5-streak)
}

/**
 * Creates the initial state for a new brawler game.
 */
export function createInitialState(totalWaves: number): BrawlerState {
  return {
    playerHp: 100,
    maxHp: 100,
    score: 0,
    streak: 0,
    bestStreak: 0,
    currentWave: 0,
    totalWaves,
    wavesCleared: new Array(totalWaves).fill(false),
    isBossWave: false,
    powerUpLevel: 0,
  };
}

/**
 * Processes an answer to a wave question.
 * - Correct: +150 base + streak*50 bonus, streak++, mark wave cleared, advance wave.
 * - Wrong: lose 20 HP (30 on boss wave), streak resets to 0.
 * Power-up level: 0 if streak<3, 1 if 3-4, 2 if 5+.
 */
export function answerQuestion(
  state: BrawlerState,
  correct: boolean,
): BrawlerState {
  if (correct) {
    const bonus = 150 + state.streak * 50;
    const newStreak = state.streak + 1;
    const newBestStreak = Math.max(state.bestStreak, newStreak);
    const newWavesCleared = [...state.wavesCleared];
    newWavesCleared[state.currentWave] = true;
    const nextWave = Math.min(state.currentWave + 1, state.totalWaves - 1);
    const nextIsBoss = nextWave === state.totalWaves - 1;

    return {
      ...state,
      score: state.score + bonus,
      streak: newStreak,
      bestStreak: newBestStreak,
      wavesCleared: newWavesCleared,
      currentWave: nextWave,
      isBossWave: nextIsBoss,
      powerUpLevel: getPowerUpLevel(newStreak),
    };
  }

  // Wrong answer
  const damage = state.isBossWave ? 30 : 20;
  return {
    ...state,
    playerHp: Math.max(0, state.playerHp - damage),
    streak: 0,
    powerUpLevel: 0,
  };
}

/**
 * Returns the power-up level for a given streak count.
 */
function getPowerUpLevel(streak: number): number {
  if (streak >= 5) return 2;
  if (streak >= 3) return 1;
  return 0;
}

/**
 * Calculates star rating based on best streak.
 * - 3 stars: bestStreak >= 5
 * - 2 stars: bestStreak >= 3
 * - 1 star:  otherwise
 */
export function calculateStars(state: BrawlerState): number {
  if (state.bestStreak >= 5) return 3;
  if (state.bestStreak >= 3) return 2;
  return 1;
}

/**
 * Returns true when all waves have been cleared.
 */
export function isGameComplete(state: BrawlerState): boolean {
  return state.wavesCleared.every((w) => w === true);
}

/**
 * Returns true when the player's HP has dropped to zero.
 */
export function isGameOver(state: BrawlerState): boolean {
  return state.playerHp <= 0;
}
