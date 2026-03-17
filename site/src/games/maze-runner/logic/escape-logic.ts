/**
 * Pure TypeScript logic for the Escape Room game.
 * No Phaser or DOM dependencies — fully testable.
 */

export const ROOM_TYPES = [
  "decode",
  "timeline",
  "search",
  "code",
  "final",
] as const;

export type RoomType = (typeof ROOM_TYPES)[number];

export interface RoomState {
  roomIndex: number;
  roomType: RoomType;
  questionsAnswered: number;
  questionsNeeded: number;
  cleared: boolean;
}

export interface EscapeState {
  rooms: RoomState[];
  currentRoom: number;
  totalRooms: number;
  score: number;
  wrongAnswers: number;
  timeRemaining: number; // seconds
  completed: boolean;
  failed: boolean;
}

/**
 * Creates the initial state for a new escape room game.
 * @param totalRooms Number of rooms (typically 4-5)
 * @param timeLimit Countdown timer in seconds
 */
export function createInitialState(
  totalRooms: number,
  timeLimit: number,
): EscapeState {
  const rooms: RoomState[] = [];
  for (let i = 0; i < totalRooms; i++) {
    rooms.push({
      roomIndex: i,
      roomType: ROOM_TYPES[i % ROOM_TYPES.length],
      questionsAnswered: 0,
      questionsNeeded: 1,
      cleared: false,
    });
  }

  return {
    rooms,
    currentRoom: 0,
    totalRooms,
    score: 0,
    wrongAnswers: 0,
    timeRemaining: timeLimit,
    completed: false,
    failed: false,
  };
}

/**
 * Processes an answer to a question in the current room.
 * - Correct: score += 100 + timeBonus (1 point per remaining second),
 *   advance room progress, mark room cleared if enough answers.
 * - Wrong: wrongAnswers++, lose 10 seconds from timeRemaining.
 */
export function answerQuestion(
  state: EscapeState,
  correct: boolean,
): EscapeState {
  if (state.completed || state.failed) return state;

  const rooms = state.rooms.map((r) => ({ ...r }));
  const room = rooms[state.currentRoom];

  if (correct) {
    room.questionsAnswered++;
    if (room.questionsAnswered >= room.questionsNeeded) {
      room.cleared = true;
    }

    const timeBonus = Math.floor(state.timeRemaining);
    const nextRoom = room.cleared
      ? Math.min(state.currentRoom + 1, state.totalRooms - 1)
      : state.currentRoom;

    const allCleared = rooms.every((r) => r.cleared);

    return {
      ...state,
      rooms,
      currentRoom: nextRoom,
      score: state.score + 100 + timeBonus,
      completed: allCleared,
    };
  }

  // Wrong answer: penalty
  const newTime = state.timeRemaining - 10;
  return {
    ...state,
    rooms,
    wrongAnswers: state.wrongAnswers + 1,
    timeRemaining: Math.max(newTime, 0),
    failed: newTime <= 0,
  };
}

/**
 * Reduces timeRemaining by the given number of seconds.
 * Sets failed = true if time runs out.
 */
export function tickTimer(state: EscapeState, seconds: number): EscapeState {
  if (state.completed || state.failed) return state;

  const newTime = state.timeRemaining - seconds;
  return {
    ...state,
    timeRemaining: Math.max(newTime, 0),
    failed: newTime <= 0,
  };
}

/**
 * Returns true if the current room has been cleared.
 */
export function isRoomCleared(state: EscapeState): boolean {
  return state.rooms[state.currentRoom].cleared;
}

/**
 * Returns true when all rooms are cleared (game won).
 */
export function isEscapeComplete(state: EscapeState): boolean {
  return state.rooms.every((r) => r.cleared);
}

/**
 * Calculates star rating based on wrong answers.
 * - 3 stars: 0-1 wrong answers
 * - 2 stars: 2-3 wrong answers
 * - 1 star:  4+ wrong answers
 */
export function calculateStars(state: EscapeState): number {
  if (state.wrongAnswers <= 1) return 3;
  if (state.wrongAnswers <= 3) return 2;
  return 1;
}
