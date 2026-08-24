/**
 * The teacher passphrase, remembered on this device.
 *
 * One secret unlocks the teacher dashboard (`#/teacher`) AND authorises
 * `DELETE /entry/...` — it is the API's `MODERATION_KEY`, checked server-side
 * (`GET /moderation/check`, see `checkTeacherKey` in `leaderboard-api.ts`).
 * It is never in the URL, never in the Vite build, never logged: it only
 * exists here after a teacher typed it into the gate.
 *
 * `sessionStorage` is the default, so the shared church laptop forgets the
 * phrase when the tab closes. `localStorage` is opt-in ("Remember on this
 * device") — acceptable now because the phrase is trivial to rotate
 * (`MODERATION_KEY='…' ./provision.sh`), and rotating it re-prompts every
 * device on its next check. No TTL: **Lock** and a `401` are the expiry.
 *
 * Every storage touch has its own try/catch — private mode or a blocked
 * storage partition must behave exactly like "no key", never throw.
 */

/** Where the passphrase lives (sessionStorage by default, localStorage when remembered). */
export const TEACHER_KEY_STORAGE = "church-games:teacher-key";

function readFrom(storage: Storage): string | null {
  try {
    const raw = storage.getItem(TEACHER_KEY_STORAGE);
    return raw !== null && raw.trim() !== "" ? raw : null;
  } catch {
    return null;
  }
}

function removeFrom(storage: Storage): void {
  try {
    storage.removeItem(TEACHER_KEY_STORAGE);
  } catch {
    // Nothing to do — there is nothing we could have removed.
  }
}

/** The stored passphrase: localStorage (remembered) first, then sessionStorage. */
export function readTeacherKey(): string | null {
  let local: string | null = null;
  try {
    local = readFrom(localStorage);
  } catch {
    local = null;
  }
  if (local !== null) return local;
  try {
    return readFrom(sessionStorage);
  } catch {
    return null;
  }
}

/**
 * Store the passphrase in exactly one place: localStorage when the teacher
 * ticked "Remember on this device", otherwise sessionStorage. The other
 * storage is always cleared so the two can never disagree.
 */
export function saveTeacherKey(key: string, remember: boolean): void {
  try {
    if (remember) {
      localStorage.setItem(TEACHER_KEY_STORAGE, key);
    } else {
      sessionStorage.setItem(TEACHER_KEY_STORAGE, key);
    }
  } catch {
    // Non-fatal: the teacher just has to type it again next time.
  }
  try {
    removeFrom(remember ? sessionStorage : localStorage);
  } catch {
    // Nothing to do.
  }
}

/** Forget the passphrase everywhere (Lock, or a 401 after a rotation). */
export function clearTeacherKey(): void {
  try {
    removeFrom(localStorage);
  } catch {
    // Nothing to do.
  }
  try {
    removeFrom(sessionStorage);
  } catch {
    // Nothing to do.
  }
}
