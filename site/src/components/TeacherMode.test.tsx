import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";
import type { LessonConfig } from "@/types/lesson";
import { TEACHER_KEY_STORAGE, saveTeacherKey } from "@/lib/teacher-session";

const BASE = "https://lb.test/api";
/** Obviously fake — the real passphrase never appears in a fixture. */
const KEY = "s3cret-key";

const WRONG_MESSAGE = "Wrong passphrase — try again.";
const THROTTLED_MESSAGE = "Too many tries — wait a few minutes and try again.";
const ROTATED_MESSAGE = "The passphrase has changed — enter the new one.";
const SERVER_MESSAGE =
  "Can't reach the leaderboard server — check the connection.";

const testLesson: LessonConfig = {
  meta: {
    week: "2026-W34",
    title: "The Good Shepherd",
    verseReference: "John 10:11",
    verseText: "I am the good shepherd.",
    theme: "care",
    spotlightGame: "survivors",
    generatedAt: "2026-08-23T00:00:00Z",
  },
  questions: [],
  termPairs: [],
  keyWords: [],
  story: { summary: "", scenes: [] },
};

vi.mock("@/hooks/useLesson", () => ({
  useLesson: vi.fn(() => ({
    lesson: testLesson,
    loading: false,
    error: null,
    source: "current" as const,
  })),
}));

// The real moderation section fetches boards; here it only needs to be able to
// report the 401 that hands control back to the gate.
vi.mock("@/components/HighScoreModeration", () => ({
  HighScoreModeration: ({ onLocked }: { onLocked: () => void }) => (
    <button type="button" className="stub-locked" onClick={onLocked}>
      Simulate a 401
    </button>
  ),
}));

import { TeacherMode } from "@/components/TeacherMode";

/** 204 / 4xx with no body — `json()` throws so a stray read is caught. */
function noBodyResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new Error("json() must not be called on a body-less response");
    },
  } as unknown as Response;
}

interface Server {
  /** The passphrase this fake API accepts. */
  key: string;
  /** Status for a header that does not match `key` (401, 429, 500…). */
  wrongStatus: number;
  /** When true every request rejects the way an unreachable API does. */
  down: boolean;
}

/** Point the gate at a fake `GET /moderation/check`. */
function configureShared() {
  const state: Server = { key: KEY, wrongStatus: 401, down: false };
  vi.stubEnv("VITE_LEADERBOARD_API", BASE);

  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    if (method === "GET" && url === `${BASE}/moderation/check`) {
      if (state.down) throw new TypeError("Failed to fetch");
      const headers = (init.headers ?? {}) as Record<string, string>;
      return noBodyResponse(
        headers["x-moderation-key"] === state.key ? 204 : state.wrongStatus,
      );
    }
    throw new TypeError(`Unrouted request: ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { state, fetchMock };
}

function el<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Expected ${selector} to be in the document`);
  return found;
}

function input(): HTMLInputElement {
  return el<HTMLInputElement>(".teacher-gate-input");
}

/** Type a passphrase and submit the gate form, settling the awaited check. */
async function unlockWith(value: string): Promise<void> {
  fireEvent.change(input(), { target: { value } });
  await act(async () => {
    fireEvent.submit(el(".teacher-gate-form"));
  });
}

/** Click and let the handler's awaited work settle. */
async function clickAsync(selector: string): Promise<void> {
  await act(async () => {
    fireEvent.click(el(selector));
  });
}

function checkKeys(fetchMock: ReturnType<typeof vi.fn>): (string | undefined)[] {
  return fetchMock.mock.calls
    .map((call) => call as [string, RequestInit])
    .filter(([url]) => url === `${BASE}/moderation/check`)
    .map(([, init]) => (init.headers as Record<string, string>)["x-moderation-key"]);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
  sessionStorage.clear();
});

describe("TeacherMode — the gate without a shared API", () => {
  it("shows the dev hint and no form when VITE_LEADERBOARD_API is unset", async () => {
    vi.stubEnv("VITE_LEADERBOARD_API", undefined);
    const fetchMock = vi.fn(async () => noBodyResponse(204));
    vi.stubGlobal("fetch", fetchMock);
    saveTeacherKey(KEY, false);

    render(<TeacherMode />);

    expect(el(".teacher-gate-hint").textContent).toContain(
      "Teacher mode needs the shared leaderboard API",
    );
    expect(el(".teacher-gate-hint code").textContent).toBe("npm run dev:shared");
    expect(document.querySelector(".teacher-gate-form")).toBeNull();
    expect(document.querySelector(".teacher-dashboard")).toBeNull();
    // Not even a storage read is worth a request we cannot make.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("TeacherMode — locked", () => {
  it("shows the passphrase form with focus and Remember unchecked, sending nothing", () => {
    const { fetchMock } = configureShared();

    render(<TeacherMode />);

    expect(el(".teacher-gate-title").textContent).toBe("Teacher Dashboard");
    expect(el(".teacher-gate-label").textContent).toBe("Teacher passphrase");
    expect(input().type).toBe("password");
    expect(input().autocomplete).toBe("current-password");
    expect(document.activeElement).toBe(input());
    expect(el<HTMLInputElement>(".teacher-gate-remember-box").checked).toBe(false);
    expect(el(".teacher-gate-submit").textContent).toBe("Unlock");
    expect(document.querySelector(".teacher-gate-alert")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores an empty (or blank) submit without asking the server", async () => {
    const { fetchMock } = configureShared();

    render(<TeacherMode />);
    await unlockWith("   ");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelector(".teacher-gate-alert")).toBeNull();
    expect(document.querySelector(".teacher-gate-form")).toBeTruthy();
  });

  it("shows the wrong-passphrase alert, clears the field and stores nothing", async () => {
    const { fetchMock } = configureShared();

    render(<TeacherMode />);
    await unlockWith("wrong-phrase");

    const alert = el(".teacher-gate-alert");
    expect(alert.textContent).toBe(WRONG_MESSAGE);
    expect(alert.getAttribute("role")).toBe("alert");
    expect(input().value).toBe("");
    expect(document.activeElement).toBe(input());
    expect(sessionStorage.getItem(TEACHER_KEY_STORAGE)).toBeNull();
    expect(localStorage.getItem(TEACHER_KEY_STORAGE)).toBeNull();
    expect(checkKeys(fetchMock)).toEqual(["wrong-phrase"]);
    expect(document.querySelector(".teacher-dashboard")).toBeNull();
  });

  it("shows the throttled message on a 429", async () => {
    const { state } = configureShared();
    state.wrongStatus = 429;

    render(<TeacherMode />);
    await unlockWith("wrong-phrase");

    expect(el(".teacher-gate-alert").textContent).toBe(THROTTLED_MESSAGE);
    expect(input().value).toBe("");
    expect(sessionStorage.getItem(TEACHER_KEY_STORAGE)).toBeNull();
  });

  it("shows the server-error view (not a wrong-passphrase alert) when the API fails", async () => {
    const { state } = configureShared();
    state.down = true;

    render(<TeacherMode />);
    await unlockWith(KEY);

    expect(el(".teacher-gate-alert").textContent).toBe(SERVER_MESSAGE);
    expect(el(".teacher-gate-retry").textContent).toBe("Retry");
    expect(document.querySelector(".teacher-gate-form")).toBeNull();
  });

  it("unlocks and remembers the passphrase in sessionStorage by default", async () => {
    const { fetchMock } = configureShared();

    render(<TeacherMode />);
    await unlockWith(` ${KEY} `);

    await waitFor(() => expect(document.querySelector(".teacher-dashboard")).toBeTruthy());
    // Trimmed, and sent exactly once.
    expect(checkKeys(fetchMock)).toEqual([KEY]);
    expect(sessionStorage.getItem(TEACHER_KEY_STORAGE)).toBe(KEY);
    expect(localStorage.getItem(TEACHER_KEY_STORAGE)).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(el(".teacher-lock").textContent).toBe("Lock");
  });

  it("unlocks into localStorage when Remember on this device is ticked", async () => {
    configureShared();

    render(<TeacherMode />);
    fireEvent.click(el(".teacher-gate-remember-box"));
    await unlockWith(KEY);

    await waitFor(() => expect(document.querySelector(".teacher-dashboard")).toBeTruthy());
    expect(localStorage.getItem(TEACHER_KEY_STORAGE)).toBe(KEY);
    expect(sessionStorage.getItem(TEACHER_KEY_STORAGE)).toBeNull();
  });
});

describe("TeacherMode — a stored passphrase", () => {
  it("re-checks it on mount and opens the dashboard on 204", async () => {
    saveTeacherKey(KEY, false);
    const { fetchMock } = configureShared();

    render(<TeacherMode />);

    await waitFor(() => expect(document.querySelector(".teacher-dashboard")).toBeTruthy());
    expect(checkKeys(fetchMock)).toEqual([KEY]);
    expect(document.querySelector(".teacher-gate-form")).toBeNull();
  });

  it("falls back to the form with the rotated message on a 401, wiping both storages", async () => {
    saveTeacherKey("old-phrase", true);
    configureShared();

    render(<TeacherMode />);

    await waitFor(() =>
      expect(el(".teacher-gate-alert").textContent).toBe(ROTATED_MESSAGE),
    );
    expect(document.querySelector(".teacher-gate-form")).toBeTruthy();
    expect(localStorage.getItem(TEACHER_KEY_STORAGE)).toBeNull();
    expect(sessionStorage.getItem(TEACHER_KEY_STORAGE)).toBeNull();
  });

  it("keeps the stored key on a 429 and says to wait", async () => {
    saveTeacherKey(KEY, false);
    const { state } = configureShared();
    state.wrongStatus = 429;
    state.key = "rotated-phrase";

    render(<TeacherMode />);

    await waitFor(() =>
      expect(el(".teacher-gate-alert").textContent).toBe(THROTTLED_MESSAGE),
    );
    expect(sessionStorage.getItem(TEACHER_KEY_STORAGE)).toBe(KEY);
  });

  it("shows Retry when the server is unreachable, and unlocks once it recovers", async () => {
    saveTeacherKey(KEY, false);
    const { state } = configureShared();
    state.down = true;

    render(<TeacherMode />);

    await waitFor(() =>
      expect(el(".teacher-gate-alert").textContent).toBe(SERVER_MESSAGE),
    );
    expect(sessionStorage.getItem(TEACHER_KEY_STORAGE)).toBe(KEY);

    state.down = false;
    await clickAsync(".teacher-gate-retry");

    await waitFor(() => expect(document.querySelector(".teacher-dashboard")).toBeTruthy());
  });
});

describe("TeacherMode — leaving the dashboard", () => {
  it("Lock forgets the passphrase and shows the form again", async () => {
    saveTeacherKey(KEY, true);
    configureShared();

    render(<TeacherMode />);
    await waitFor(() => expect(document.querySelector(".teacher-dashboard")).toBeTruthy());

    await clickAsync(".teacher-lock");

    expect(document.querySelector(".teacher-gate-form")).toBeTruthy();
    expect(document.querySelector(".teacher-dashboard")).toBeNull();
    expect(document.querySelector(".teacher-gate-alert")).toBeNull();
    expect(el<HTMLInputElement>(".teacher-gate-remember-box").checked).toBe(false);
    expect(localStorage.getItem(TEACHER_KEY_STORAGE)).toBeNull();
    expect(sessionStorage.getItem(TEACHER_KEY_STORAGE)).toBeNull();
  });

  it("a 401 from the moderation section re-locks with the rotated message", async () => {
    saveTeacherKey(KEY, false);
    configureShared();

    render(<TeacherMode />);
    await waitFor(() => expect(document.querySelector(".stub-locked")).toBeTruthy());

    await clickAsync(".stub-locked");

    expect(el(".teacher-gate-alert").textContent).toBe(ROTATED_MESSAGE);
    expect(document.querySelector(".teacher-gate-form")).toBeTruthy();
    expect(sessionStorage.getItem(TEACHER_KEY_STORAGE)).toBeNull();
    expect(localStorage.getItem(TEACHER_KEY_STORAGE)).toBeNull();
  });

  it("never puts the passphrase in the DOM as plain text", async () => {
    configureShared();

    render(<TeacherMode />);
    await unlockWith(KEY);

    await waitFor(() => expect(document.querySelector(".teacher-dashboard")).toBeTruthy());
    expect(document.body.textContent ?? "").not.toContain(KEY);
    expect(screen.queryByText(KEY)).toBeNull();
  });
});
