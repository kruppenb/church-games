import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { HighScoreModeration } from "@/components/HighScoreModeration";
import {
  TEACHER_KEY_STORAGE,
  saveTeacherKey,
} from "@/lib/teacher-session";
import {
  formatWeekLabel,
  getWeekKey,
  type LeaderboardEntry,
} from "@/lib/leaderboard-local";

const BASE = "https://lb.test/api";
const KEY = "s3cret-key";
const WEEK = getWeekKey();
const UNAVAILABLE = "Shared leaderboard unavailable — nothing to moderate.";

type Boards = Record<string, LeaderboardEntry[]>;

function entry(
  initials: string,
  score: number,
  ts: number,
  rowKey: string = `row-${initials}`,
  difficulty: LeaderboardEntry["difficulty"] = "big-kids",
): LeaderboardEntry {
  return { initials, score, difficulty, ts, rowKey };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

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
  boards: Boards;
  key: string;
  /** When true the DELETE route rejects like an unreachable network would. */
  deleteFails: boolean;
}

/**
 * Point the app at a fake shared API serving `GET /board/:weekKey` and
 * `DELETE /entry/:weekKey/:gameId/:rowKey` out of a mutable in-test state.
 */
function configureShared(boards: Boards, key = KEY) {
  const state: Server = { boards, key, deleteFails: false };
  vi.stubEnv("VITE_LEADERBOARD_API", BASE);

  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";

    if (method === "GET" && /\/board\/[^/]+$/.test(url)) {
      return jsonResponse({ weekKey: WEEK, boards: state.boards });
    }

    const del = /\/entry\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(url);
    if (method === "DELETE" && del) {
      if (state.deleteFails) throw new TypeError("Failed to fetch");
      const headers = (init.headers ?? {}) as Record<string, string>;
      if (headers["x-moderation-key"] !== state.key) return noBodyResponse(401);

      const gameId = decodeURIComponent(del[2]);
      const rowKey = decodeURIComponent(del[3]);
      const board = state.boards[gameId] ?? [];
      const index = board.findIndex((e) => e.rowKey === rowKey);
      if (index === -1) return noBodyResponse(404);

      const next = board.filter((_, i) => i !== index);
      if (next.length === 0) delete state.boards[gameId];
      else state.boards[gameId] = next;
      return noBodyResponse(204);
    }

    throw new TypeError(`Unrouted request: ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { state, fetchMock };
}

function deleteCalls(
  fetchMock: ReturnType<typeof vi.fn>,
): [string, RequestInit][] {
  return fetchMock.mock.calls
    .map((call) => call as [string, RequestInit])
    .filter(([, init]) => (init?.method ?? "GET") === "DELETE");
}

function rowInitials(): string[] {
  return Array.from(document.querySelectorAll(".tm-initials")).map(
    (el) => el.textContent ?? "",
  );
}

function gameNames(): string[] {
  return Array.from(document.querySelectorAll(".tm-game-name")).map(
    (el) => el.textContent ?? "",
  );
}

function el<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Expected ${selector} to be in the document`);
  return found;
}

/** Click and let the handler's awaited work settle. */
async function clickAsync(selector: string): Promise<void> {
  await act(async () => {
    fireEvent.click(el(selector));
  });
}

/** The gate's "the stored passphrase stopped working" callback. */
let onLocked = vi.fn();

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  onLocked = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("HighScoreModeration — nothing to moderate", () => {
  it("shows the unavailable note when the shared API is not configured", async () => {
    vi.stubEnv("VITE_LEADERBOARD_API", undefined);

    render(<HighScoreModeration onLocked={onLocked} />);

    expect(await screen.findByText(UNAVAILABLE)).toBeTruthy();
    expect(document.querySelectorAll(".tm-remove")).toHaveLength(0);
    expect(document.querySelectorAll(".tm-row")).toHaveLength(0);
    expect(el(".tm-refresh").textContent).toBe("Retry");
  });

  it("shows the unavailable note when the API is unreachable (offline)", async () => {
    vi.stubEnv("VITE_LEADERBOARD_API", BASE);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    render(<HighScoreModeration onLocked={onLocked} />);

    expect(await screen.findByText(UNAVAILABLE)).toBeTruthy();
    expect(document.querySelectorAll(".tm-remove")).toHaveLength(0);
  });

  it("shows an empty note when the shared week has no scores", async () => {
    configureShared({});

    render(<HighScoreModeration onLocked={onLocked} />);

    expect(await screen.findByText("No scores this week yet.")).toBeTruthy();
    expect(document.querySelectorAll(".tm-remove")).toHaveLength(0);
  });
});

describe("HighScoreModeration — shared rows", () => {
  it("renders every game with entries in catalog order, each row removable", async () => {
    configureShared({
      survivors: [entry("AAA", 12_300, 1), entry("BBB", 400, 2)],
      "quiz-showdown": [entry("CCC", 900, 3)],
    });

    render(<HighScoreModeration onLocked={onLocked} />);
    await screen.findByText("💥 Survivors");

    // Catalog order (games-catalog.ts), not board/object key order.
    expect(gameNames()).toEqual(["🎯 Quiz Showdown", "💥 Survivors"]);
    expect(rowInitials()).toEqual(["CCC", "AAA", "BBB"]);
    expect(document.querySelectorAll(".tm-remove")).toHaveLength(3);
    expect(el(".tm-week").textContent).toBe(formatWeekLabel(WEEK));
    expect(el(".tm-refresh").textContent).toBe("Refresh");
    expect(el('.tm-row[data-row-key="row-AAA"]').textContent).toContain(
      "12,300",
    );
  });

  it("opens an inline confirm on Remove and closes it on Keep", async () => {
    configureShared({ survivors: [entry("AAA", 12_300, 1)] });

    render(<HighScoreModeration onLocked={onLocked} />);
    await screen.findByText("💥 Survivors");

    fireEvent.click(screen.getByLabelText("Remove AAA 12300"));
    expect(document.querySelector(".tm-confirm")).toBeTruthy();
    expect(screen.getByText("Remove AAA · 12,300?")).toBeTruthy();
    expect(document.querySelector(".tm-remove")).toBeNull();

    fireEvent.click(el(".tm-confirm-keep"));
    expect(document.querySelector(".tm-confirm")).toBeNull();
    expect(document.querySelector(".tm-remove")).toBeTruthy();
  });

  it("keeps only one confirm open at a time", async () => {
    configureShared({ survivors: [entry("AAA", 500, 1), entry("BBB", 400, 2)] });

    render(<HighScoreModeration onLocked={onLocked} />);
    await screen.findByText("💥 Survivors");

    fireEvent.click(screen.getByLabelText("Remove AAA 500"));
    fireEvent.click(screen.getByLabelText("Remove BBB 400"));

    expect(document.querySelectorAll(".tm-confirm")).toHaveLength(1);
    expect(screen.getByText("Remove BBB · 400?")).toBeTruthy();
  });
});

describe("HighScoreModeration — delete outcomes", () => {
  it("treats 404 as already-removed: row drops, no error notice", async () => {
    saveTeacherKey(KEY, false);
    const { state } = configureShared({
      survivors: [entry("AAA", 500, 1), entry("BBB", 400, 2)],
    });

    render(<HighScoreModeration onLocked={onLocked} />);
    await screen.findByText("💥 Survivors");

    // Someone else removed it between the page load and the click.
    state.boards.survivors = state.boards.survivors.filter(
      (e) => e.initials !== "AAA",
    );

    fireEvent.click(screen.getByLabelText("Remove AAA 500"));
    await clickAsync(".tm-confirm-yes");

    await waitFor(() => expect(rowInitials()).toEqual(["BBB"]));
    expect(document.querySelector(".tm-notice")).toBeNull();
    expect(document.querySelector(".tm-confirm")).toBeNull();
  });

  it("keeps the row and shows an error notice when the DELETE fails", async () => {
    saveTeacherKey(KEY, false);
    const { state } = configureShared({
      survivors: [entry("AAA", 500, 1)],
    });
    state.deleteFails = true;

    render(<HighScoreModeration onLocked={onLocked} />);
    await screen.findByText("💥 Survivors");

    fireEvent.click(screen.getByLabelText("Remove AAA 500"));
    await clickAsync(".tm-confirm-yes");

    await waitFor(() =>
      expect(el(".tm-notice").textContent).toBe(
        "Couldn't remove — check the connection and try again.",
      ),
    );
    expect(document.querySelector(".tm-notice-ok")).toBeNull();
    expect(rowInitials()).toEqual(["AAA"]);
    // Still pending, so a retry is one click away.
    expect(document.querySelector(".tm-confirm")).toBeTruthy();
    // The passphrase survives a transport failure — only a 401 clears it.
    expect(sessionStorage.getItem(TEACHER_KEY_STORAGE)).toBe(KEY);
    expect(onLocked).not.toHaveBeenCalled();
  });

  it("clears the passphrase and calls onLocked when the DELETE is a 401", async () => {
    // The server rotated the phrase since this device unlocked.
    saveTeacherKey("wrong-phrase", false);
    const { fetchMock } = configureShared({
      survivors: [entry("AAA", 500, 1)],
    });

    render(<HighScoreModeration onLocked={onLocked} />);
    await screen.findByText("💥 Survivors");

    fireEvent.click(screen.getByLabelText("Remove AAA 500"));
    await clickAsync(".tm-confirm-yes");

    await waitFor(() => expect(onLocked).toHaveBeenCalledTimes(1));
    expect(deleteCalls(fetchMock)).toHaveLength(1);
    expect(sessionStorage.getItem(TEACHER_KEY_STORAGE)).toBeNull();
    expect(localStorage.getItem(TEACHER_KEY_STORAGE)).toBeNull();
    // The gate owns the "passphrase has changed" message, not this section.
    expect(document.querySelector(".tm-notice")).toBeNull();
  });

  it("calls onLocked without sending a DELETE when nothing is stored", async () => {
    const { fetchMock } = configureShared({
      survivors: [entry("AAA", 500, 1)],
    });

    render(<HighScoreModeration onLocked={onLocked} />);
    await screen.findByText("💥 Survivors");

    fireEvent.click(screen.getByLabelText("Remove AAA 500"));
    await clickAsync(".tm-confirm-yes");

    expect(onLocked).toHaveBeenCalledTimes(1);
    expect(deleteCalls(fetchMock)).toHaveLength(0);
    expect(rowInitials()).toEqual(["AAA"]);
  });

  it("renders a dash instead of Remove for an entry with no rowKey", async () => {
    const board: LeaderboardEntry[] = [
      { initials: "AAA", score: 500, difficulty: "big-kids", ts: 1 },
    ];
    configureShared({ survivors: board });

    render(<HighScoreModeration onLocked={onLocked} />);
    await screen.findByText("💥 Survivors");

    expect(document.querySelectorAll(".tm-remove")).toHaveLength(0);
    expect(el(".tm-nokey").textContent).toBe("—");
  });
});
