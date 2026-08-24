import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  MAX_ENTRIES,
  WEEKS_TO_KEEP,
  clearLeaderboard,
  formatWeekLabel,
  getLastInitials,
  getWeekBoards,
  getWeekKey,
  isAllowedInitials,
  isSharedLeaderboardConfigured,
  listWeeks,
  qualifies,
  sanitizeInitials,
  submitScore,
} from "@/lib/leaderboard-store";
import {
  getBoard as localGetBoard,
  type LeaderboardEntry,
} from "@/lib/leaderboard-local";

const STORAGE_KEY = "church-games:leaderboard";
const BASE = "https://example.test/api";
const WEEK = "2026-08-23";

function seed(weeks: Record<string, Record<string, LeaderboardEntry[]>>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, weeks }));
}

function entry(
  initials: string,
  score: number,
  ts: number,
  difficulty: LeaderboardEntry["difficulty"] = "big-kids",
): LeaderboardEntry {
  return { initials, score, difficulty, ts };
}

/** A full 10-entry board with scores 1000, 900, ... 100. */
function fullBoard(): LeaderboardEntry[] {
  return Array.from({ length: MAX_ENTRIES }, (_, i) =>
    entry("AAA", 1000 - i * 100, 1000 + i),
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Route the mocked fetch by URL; unmatched routes 404. */
function routeFetch(
  routes: (url: string, init: RequestInit) => Response | undefined,
) {
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const res = routes(url, init);
    if (!res) throw new Error(`Unrouted request: ${url}`);
    return res;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function configure(): void {
  vi.stubEnv("VITE_LEADERBOARD_API", BASE);
}

function postBodies(fn: ReturnType<typeof vi.fn>): unknown[] {
  return fn.mock.calls
    .filter((c) => (c[1] as RequestInit | undefined)?.method === "POST")
    .map((c) => JSON.parse(String((c[1] as RequestInit).body)));
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 26, 10, 0, 0)); // week 2026-08-23
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("re-exports", () => {
  it("keeps the synchronous helpers available from the facade", () => {
    expect(MAX_ENTRIES).toBe(10);
    expect(WEEKS_TO_KEEP).toBe(6);
    expect(getWeekKey()).toBe(WEEK);
    expect(formatWeekLabel(WEEK)).toBe("Week of Aug 23");
    expect(sanitizeInitials("b0b")).toBe("BBA");
    expect(isAllowedInitials("ASS")).toBe(false);
    expect(getLastInitials()).toBeNull();
    expect(() => clearLeaderboard()).not.toThrow();
  });
});

describe("pure-local mode (VITE_LEADERBOARD_API unset)", () => {
  it("reports the shared leaderboard as not configured", () => {
    expect(isSharedLeaderboardConfigured()).toBe(false);
  });

  it("qualifies against the local board without fetching", async () => {
    const fetchMock = routeFetch(() => jsonResponse({}));
    seed({ [WEEK]: { survivors: fullBoard() } });
    await expect(qualifies("survivors", 101)).resolves.toBe(true);
    await expect(qualifies("survivors", 100)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits to local storage with source 'local'", async () => {
    const fetchMock = routeFetch(() => jsonResponse({}));
    const result = await submitScore("survivors", {
      initials: "amy",
      score: 500,
      difficulty: "big-kids",
    });
    expect(result).toEqual({
      rank: 1,
      weekKey: WEEK,
      board: [
        {
          initials: "AMY",
          score: 500,
          difficulty: "big-kids",
          ts: new Date(2026, 7, 26, 10, 0, 0).getTime(),
        },
      ],
      source: "local",
    });
    expect(localGetBoard(WEEK, "survivors")).toHaveLength(1);
    expect(getLastInitials()).toBe("AMY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns -1 and the unchanged board when the score does not make it", async () => {
    seed({ [WEEK]: { survivors: fullBoard() } });
    const result = await submitScore("survivors", {
      initials: "LOW",
      score: 5,
      difficulty: "little-kids",
    });
    expect(result.rank).toBe(-1);
    expect(result.source).toBe("local");
    expect(result.board).toHaveLength(MAX_ENTRIES);
    expect(result.board.some((e) => e.initials === "LOW")).toBe(false);
  });

  it("reads local week boards with source 'local'", async () => {
    seed({
      [WEEK]: { survivors: [entry("AMY", 500, 1)] },
      "2026-08-16": { jeopardy: [entry("OLD", 5, 1)] },
    });
    await expect(getWeekBoards("current")).resolves.toEqual({
      weekKey: WEEK,
      boards: { survivors: [entry("AMY", 500, 1)] },
      source: "local",
    });
    await expect(getWeekBoards("2026-08-16")).resolves.toMatchObject({
      weekKey: "2026-08-16",
      source: "local",
    });
  });

  it("lists local weeks with source 'local'", async () => {
    seed({ [WEEK]: {}, "2026-08-16": {} });
    await expect(listWeeks()).resolves.toEqual({
      weeks: [WEEK, "2026-08-16"],
      currentWeekKey: WEEK,
      source: "local",
    });
  });
});

describe("shared mode — API healthy", () => {
  beforeEach(configure);

  it("reports the shared leaderboard as configured", () => {
    expect(isSharedLeaderboardConfigured()).toBe(true);
  });

  it("qualifies against the SERVER board, not the local one", async () => {
    // Local storage is empty (would qualify anything); the server board is full.
    const fetchMock = routeFetch((url) =>
      url.endsWith("/board/current")
        ? jsonResponse({ weekKey: WEEK, boards: { survivors: fullBoard() } })
        : undefined,
    );
    await expect(qualifies("survivors", 101)).resolves.toBe(true);
    await expect(qualifies("survivors", 100)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("qualifies on an empty server board even when the local board is full", async () => {
    seed({ [WEEK]: { survivors: fullBoard() } });
    routeFetch((url) =>
      url.endsWith("/board/current")
        ? jsonResponse({ weekKey: WEEK, boards: {} })
        : undefined,
    );
    await expect(qualifies("survivors", 1)).resolves.toBe(true);
  });

  it("short-circuits non-positive scores without fetching", async () => {
    const fetchMock = routeFetch(() => jsonResponse({}));
    await expect(qualifies("survivors", 0)).resolves.toBe(false);
    await expect(qualifies("survivors", -10)).resolves.toBe(false);
    await expect(qualifies("survivors", Number.NaN)).resolves.toBe(false);
    await expect(qualifies("survivors", Number.POSITIVE_INFINITY)).resolves.toBe(
      false,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the score and returns the server board with source 'shared'", async () => {
    const serverBoard = [entry("AMY", 500, 12345), entry("BEN", 100, 12300)];
    const fetchMock = routeFetch((url, init) =>
      url.endsWith("/score/survivors") && init.method === "POST"
        ? jsonResponse({ rank: 1, weekKey: WEEK, board: serverBoard })
        : undefined,
    );

    const result = await submitScore("survivors", {
      initials: "amy",
      score: 500,
      difficulty: "big-kids",
    });

    expect(result).toEqual({
      rank: 1,
      weekKey: WEEK,
      board: serverBoard,
      source: "shared",
    });
    expect(postBodies(fetchMock)).toEqual([
      { initials: "AMY", score: 500, difficulty: "big-kids" },
    ]);
    // Nothing written to the local board in shared mode…
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localGetBoard(WEEK, "survivors")).toEqual([]);
    // …but the initials are still remembered for the next prefill.
    expect(getLastInitials()).toBe("AMY");
  });

  it("uses the server's week key even when it differs from the device's", async () => {
    routeFetch((url, init) =>
      init.method === "POST"
        ? jsonResponse({ rank: 2, weekKey: "2026-08-16", board: [] })
        : undefined,
    );
    const result = await submitScore("survivors", {
      initials: "AMY",
      score: 5,
      difficulty: "big-kids",
    });
    expect(result.weekKey).toBe("2026-08-16");
    expect(result.rank).toBe(2);
  });

  it("reads a week's boards from the server with source 'shared'", async () => {
    routeFetch((url) =>
      url.endsWith("/board/2026-08-16")
        ? jsonResponse({
            weekKey: "2026-08-16",
            boards: { jeopardy: [entry("SRV", 700, 5)] },
          })
        : undefined,
    );
    await expect(getWeekBoards("2026-08-16")).resolves.toEqual({
      weekKey: "2026-08-16",
      boards: { jeopardy: [entry("SRV", 700, 5)] },
      source: "shared",
    });
  });

  it("lists weeks from the server with source 'shared'", async () => {
    seed({ "2020-01-05": {} }); // local junk must not leak through
    routeFetch((url) =>
      url.endsWith("/weeks")
        ? jsonResponse({ weeks: [WEEK, "2026-08-16"], currentWeekKey: WEEK })
        : undefined,
    );
    await expect(listWeeks()).resolves.toEqual({
      weeks: [WEEK, "2026-08-16"],
      currentWeekKey: WEEK,
      source: "shared",
    });
  });
});

describe("shared mode — API unreachable", () => {
  beforeEach(() => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
  });

  it("falls back to the local qualify rule", async () => {
    seed({ [WEEK]: { survivors: fullBoard() } });
    await expect(qualifies("survivors", 100)).resolves.toBe(false);
    await expect(qualifies("survivors", 101)).resolves.toBe(true);
  });

  it("writes locally with source 'offline'", async () => {
    const result = await submitScore("survivors", {
      initials: "amy",
      score: 500,
      difficulty: "big-kids",
    });
    expect(result.rank).toBe(1);
    expect(result.weekKey).toBe(WEEK);
    expect(result.source).toBe("offline");
    expect(result.board.map((e) => e.initials)).toEqual(["AMY"]);
    expect(localGetBoard(WEEK, "survivors").map((e) => e.initials)).toEqual([
      "AMY",
    ]);
    expect(getLastInitials()).toBe("AMY");
  });

  it("reads local week boards with source 'offline'", async () => {
    seed({ [WEEK]: { survivors: [entry("AMY", 500, 1)] } });
    await expect(getWeekBoards("current")).resolves.toEqual({
      weekKey: WEEK,
      boards: { survivors: [entry("AMY", 500, 1)] },
      source: "offline",
    });
  });

  it("lists local weeks with source 'offline'", async () => {
    seed({ [WEEK]: {}, "2026-08-09": {} });
    await expect(listWeeks()).resolves.toEqual({
      weeks: [WEEK, "2026-08-09"],
      currentWeekKey: WEEK,
      source: "offline",
    });
  });

  it("never throws, even when the server answers with garbage", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse("<html>oops</html>")));
    await expect(qualifies("survivors", 5)).resolves.toBe(true);
    await expect(listWeeks()).resolves.toMatchObject({ source: "offline" });
    await expect(getWeekBoards("current")).resolves.toMatchObject({
      source: "offline",
    });
    await expect(
      submitScore("survivors", { initials: "AMY", score: 5, difficulty: "big-kids" }),
    ).resolves.toMatchObject({ source: "offline" });
  });

  it("falls back to local on a 5xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "boom" }, 500)));
    const result = await submitScore("survivors", {
      initials: "AMY",
      score: 5,
      difficulty: "big-kids",
    });
    expect(result.source).toBe("offline");
    expect(localGetBoard(WEEK, "survivors")).toHaveLength(1);
  });
});

describe("shared mode — server rejects the score (4xx)", () => {
  beforeEach(configure);

  it("returns rank -1 with the real board and does not write locally", async () => {
    const serverBoard = [entry("SRV", 900, 5)];
    const fetchMock = routeFetch((url, init) => {
      if (init.method === "POST") return jsonResponse({ error: "nope" }, 400);
      if (url.endsWith("/board/current")) {
        return jsonResponse({
          weekKey: WEEK,
          boards: { survivors: serverBoard },
        });
      }
      return undefined;
    });

    const result = await submitScore("survivors", {
      initials: "ASS",
      score: 5,
      difficulty: "big-kids",
    });

    expect(result).toEqual({
      rank: -1,
      weekKey: WEEK,
      board: serverBoard,
      source: "shared",
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localGetBoard(WEEK, "survivors")).toEqual([]);
    expect(getLastInitials()).toBe("ASS"); // prefill is local-only, still saved
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a 429 (throttled) as offline: saves on this device", async () => {
    // A classroom shares one wifi IP, so a throttled kid must not be told
    // they missed the board — the score is kept locally instead.
    const fetchMock = routeFetch((_url, init) => {
      if (init.method === "POST") return jsonResponse({ error: "slow" }, 429);
      return undefined;
    });
    const result = await submitScore("survivors", {
      initials: "AMY",
      score: 5,
      difficulty: "big-kids",
    });
    expect(result).toMatchObject({ rank: 1, weekKey: WEEK, source: "offline" });
    expect(result.board.map((e) => e.initials)).toEqual(["AMY"]);
    expect(localGetBoard(WEEK, "survivors").map((e) => e.initials)).toEqual([
      "AMY",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no follow-up board read
  });

  it("falls back to an empty board when the follow-up read also fails", async () => {
    routeFetch((url, init) =>
      init.method === "POST" ? jsonResponse({ error: "nope" }, 400) : undefined,
    );
    const result = await submitScore("survivors", {
      initials: "AMY",
      score: 5,
      difficulty: "big-kids",
    });
    expect(result).toEqual({
      rank: -1,
      weekKey: WEEK,
      board: [],
      source: "shared",
    });
    expect(localGetBoard(WEEK, "survivors")).toEqual([]);
  });
});
