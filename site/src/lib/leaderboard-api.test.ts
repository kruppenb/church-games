import { describe, it, expect, afterEach, vi } from "vitest";
import {
  API_TIMEOUT_MS,
  LeaderboardApiError,
  fetchWeekBoards,
  fetchWeeks,
  getApiBaseUrl,
  isSharedLeaderboardConfigured,
  postScore,
} from "@/lib/leaderboard-api";

const BASE = "https://example.test/api";

/** Minimal Response stand-in — the client only uses ok/status/json(). */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function badJsonResponse(status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON");
    },
  } as unknown as Response;
}

function mockFetch(...responses: Response[]) {
  const fn = vi.fn(async () => responses.shift() ?? jsonResponse({}));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function configure(value = BASE) {
  vi.stubEnv("VITE_LEADERBOARD_API", value);
}

/** Last fetch call as [url, init]. */
function lastCall(fn: ReturnType<typeof vi.fn>): [string, RequestInit] {
  const call = fn.mock.calls[fn.mock.calls.length - 1] as [string, RequestInit];
  return call;
}

const entry = (initials: string, score: number, ts: number) => ({
  initials,
  score,
  difficulty: "big-kids" as const,
  ts,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("getApiBaseUrl / isSharedLeaderboardConfigured", () => {
  it("is null when the env var is unset", () => {
    vi.stubEnv("VITE_LEADERBOARD_API", undefined);
    expect(getApiBaseUrl()).toBeNull();
    expect(isSharedLeaderboardConfigured()).toBe(false);
  });

  it("is null for an empty or whitespace-only value", () => {
    configure("");
    expect(getApiBaseUrl()).toBeNull();
    configure("   ");
    expect(getApiBaseUrl()).toBeNull();
    expect(isSharedLeaderboardConfigured()).toBe(false);
  });

  it("trims surrounding whitespace", () => {
    configure(`  ${BASE}  `);
    expect(getApiBaseUrl()).toBe(BASE);
  });

  it("strips trailing slashes", () => {
    configure(`${BASE}/`);
    expect(getApiBaseUrl()).toBe(BASE);
    configure(`${BASE}///`);
    expect(getApiBaseUrl()).toBe(BASE);
  });

  it("keeps a relative same-origin base (e2e mock)", () => {
    configure("/__lb-api");
    expect(getApiBaseUrl()).toBe("/__lb-api");
    expect(isSharedLeaderboardConfigured()).toBe(true);
  });

  it("is read lazily, so a later env change is picked up", () => {
    vi.stubEnv("VITE_LEADERBOARD_API", undefined);
    expect(isSharedLeaderboardConfigured()).toBe(false);
    configure();
    expect(isSharedLeaderboardConfigured()).toBe(true);
  });
});

describe("unconfigured", () => {
  it("rejects every call with kind 'unconfigured' and never fetches", async () => {
    vi.stubEnv("VITE_LEADERBOARD_API", undefined);
    const fetchMock = mockFetch();

    for (const call of [
      () => fetchWeeks(),
      () => fetchWeekBoards("current"),
      () => postScore("survivors", {
        initials: "AMY",
        score: 10,
        difficulty: "big-kids",
      }),
    ]) {
      await expect(call()).rejects.toBeInstanceOf(LeaderboardApiError);
      await expect(call()).rejects.toMatchObject({ kind: "unconfigured" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchWeeks", () => {
  it("GETs {base}/weeks with an Accept header", async () => {
    configure();
    const fetchMock = mockFetch(
      jsonResponse({ weeks: ["2026-08-23"], currentWeekKey: "2026-08-23" }),
    );
    await fetchWeeks();
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe(`${BASE}/weeks`);
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({ Accept: "application/json" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns weeks and the current week key", async () => {
    configure();
    mockFetch(
      jsonResponse({
        weeks: ["2026-08-23", "2026-08-16"],
        currentWeekKey: "2026-08-23",
      }),
    );
    await expect(fetchWeeks()).resolves.toEqual({
      weeks: ["2026-08-23", "2026-08-16"],
      currentWeekKey: "2026-08-23",
    });
  });

  it("filters out week keys that are not YYYY-MM-DD", async () => {
    configure();
    mockFetch(
      jsonResponse({
        weeks: ["2026-08-23", "nonsense", 7, null, "2026-8-2", "2026-08-16"],
        currentWeekKey: "2026-08-23",
      }),
    );
    const res = await fetchWeeks();
    expect(res.weeks).toEqual(["2026-08-23", "2026-08-16"]);
  });

  it("is a parse error when currentWeekKey is missing or malformed", async () => {
    configure();
    mockFetch(jsonResponse({ weeks: [] }));
    await expect(fetchWeeks()).rejects.toMatchObject({ kind: "parse" });
    mockFetch(jsonResponse({ weeks: [], currentWeekKey: "later" }));
    await expect(fetchWeeks()).rejects.toMatchObject({ kind: "parse" });
  });

  it("is a parse error when weeks is not an array", async () => {
    configure();
    mockFetch(jsonResponse({ weeks: "nope", currentWeekKey: "2026-08-23" }));
    await expect(fetchWeeks()).rejects.toMatchObject({ kind: "parse" });
  });
});

describe("fetchWeekBoards", () => {
  it("GETs {base}/board/{weekKey}", async () => {
    configure();
    const fetchMock = mockFetch(
      jsonResponse({ weekKey: "2026-08-16", boards: {} }),
    );
    await fetchWeekBoards("2026-08-16");
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe(`${BASE}/board/2026-08-16`);
    expect(init.method).toBe("GET");
  });

  it("passes 'current' straight through", async () => {
    configure();
    const fetchMock = mockFetch(
      jsonResponse({ weekKey: "2026-08-23", boards: {} }),
    );
    const res = await fetchWeekBoards("current");
    expect(lastCall(fetchMock)[0]).toBe(`${BASE}/board/current`);
    expect(res.weekKey).toBe("2026-08-23");
  });

  it("normalizes boards and drops invalid entries", async () => {
    configure();
    mockFetch(
      jsonResponse({
        weekKey: "2026-08-23",
        boards: {
          survivors: [
            entry("AMY", 500, 10),
            { initials: "BAD" },
            { initials: "NAN", score: "lots", difficulty: "big-kids", ts: 2 },
            { initials: "DIF", score: 5, difficulty: "grown-ups", ts: 3 },
            null,
            "junk",
          ],
          jeopardy: "not-an-array",
        },
      }),
    );
    const res = await fetchWeekBoards("current");
    expect(Object.keys(res.boards)).toEqual(["survivors"]);
    expect(res.boards.survivors).toEqual([
      { initials: "AMY", score: 500, difficulty: "big-kids", ts: 10 },
    ]);
  });

  it("carries rowKey through when it is a string", async () => {
    configure();
    mockFetch(
      jsonResponse({
        weekKey: "2026-08-23",
        boards: {
          survivors: [
            { ...entry("AMY", 500, 10), rowKey: "9499999_0000000000010" },
            { ...entry("BEN", 400, 11), rowKey: 42 },
          ],
        },
      }),
    );
    const res = await fetchWeekBoards("current");
    expect(res.boards.survivors[0].rowKey).toBe("9499999_0000000000010");
    expect(res.boards.survivors[1].rowKey).toBeUndefined();
  });

  it("is a parse error for a bad weekKey or a non-object boards", async () => {
    configure();
    mockFetch(jsonResponse({ weekKey: "current", boards: {} }));
    await expect(fetchWeekBoards("current")).rejects.toMatchObject({
      kind: "parse",
    });
    mockFetch(jsonResponse({ weekKey: "2026-08-23", boards: [] }));
    await expect(fetchWeekBoards("current")).rejects.toMatchObject({
      kind: "parse",
    });
    mockFetch(jsonResponse({ weekKey: "2026-08-23" }));
    await expect(fetchWeekBoards("current")).rejects.toMatchObject({
      kind: "parse",
    });
  });

  it("is a parse error when the body is not JSON", async () => {
    configure();
    mockFetch(badJsonResponse());
    await expect(fetchWeekBoards("current")).rejects.toMatchObject({
      kind: "parse",
    });
  });

  it("is a parse error when the body is not an object", async () => {
    configure();
    mockFetch(jsonResponse("hello"));
    await expect(fetchWeekBoards("current")).rejects.toMatchObject({
      kind: "parse",
    });
  });
});

describe("postScore", () => {
  it("POSTs {base}/score/{gameId} with a JSON body", async () => {
    configure();
    const fetchMock = mockFetch(
      jsonResponse({ rank: 1, weekKey: "2026-08-23", board: [entry("AMY", 500, 10)] }),
    );
    const res = await postScore("quiz-showdown", {
      initials: "AMY",
      score: 500,
      difficulty: "little-kids",
    });
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe(`${BASE}/score/quiz-showdown`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      initials: "AMY",
      score: 500,
      difficulty: "little-kids",
    });
    expect(res).toEqual({
      rank: 1,
      weekKey: "2026-08-23",
      board: [{ initials: "AMY", score: 500, difficulty: "big-kids", ts: 10 }],
    });
  });

  it("accepts rank -1 (did not make the board)", async () => {
    configure();
    mockFetch(jsonResponse({ rank: -1, weekKey: "2026-08-23", board: [] }));
    await expect(
      postScore("survivors", { initials: "LOW", score: 1, difficulty: "big-kids" }),
    ).resolves.toMatchObject({ rank: -1, board: [] });
  });

  it("is a parse error when rank is missing or not finite", async () => {
    configure();
    mockFetch(jsonResponse({ weekKey: "2026-08-23", board: [] }));
    await expect(
      postScore("survivors", { initials: "AMY", score: 5, difficulty: "big-kids" }),
    ).rejects.toMatchObject({ kind: "parse" });
    mockFetch(jsonResponse({ rank: "1", weekKey: "2026-08-23", board: [] }));
    await expect(
      postScore("survivors", { initials: "AMY", score: 5, difficulty: "big-kids" }),
    ).rejects.toMatchObject({ kind: "parse" });
  });

  it("is a parse error when board is not an array", async () => {
    configure();
    mockFetch(jsonResponse({ rank: 1, weekKey: "2026-08-23", board: {} }));
    await expect(
      postScore("survivors", { initials: "AMY", score: 5, difficulty: "big-kids" }),
    ).rejects.toMatchObject({ kind: "parse" });
  });
});

describe("failure mapping", () => {
  it("maps a rejected fetch to 'network'", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const err = await fetchWeeks().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LeaderboardApiError);
    expect((err as LeaderboardApiError).kind).toBe("network");
    expect((err as LeaderboardApiError).status).toBeUndefined();
  });

  it("maps a non-2xx response to 'http' with the status", async () => {
    configure();
    mockFetch(jsonResponse({ error: "bad initials" }, 400));
    const err = await postScore("survivors", {
      initials: "ASS",
      score: 5,
      difficulty: "big-kids",
    }).catch((e: unknown) => e);
    expect((err as LeaderboardApiError).kind).toBe("http");
    expect((err as LeaderboardApiError).status).toBe(400);

    mockFetch(jsonResponse({ error: "boom" }, 500));
    await expect(fetchWeeks()).rejects.toMatchObject({
      kind: "http",
      status: 500,
    });

    mockFetch(jsonResponse({ error: "slow down" }, 429));
    await expect(
      postScore("survivors", { initials: "AMY", score: 5, difficulty: "big-kids" }),
    ).rejects.toMatchObject({ kind: "http", status: 429 });
  });

  it("aborts after API_TIMEOUT_MS and maps it to 'timeout'", async () => {
    configure();
    vi.useFakeTimers();
    let aborted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              aborted = true;
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      ),
    );

    const pending = fetchWeeks();
    const assertion = expect(pending).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS + 1);
    await assertion;
    expect(aborted).toBe(true);
  });

  it("does not abort a request that finishes in time", async () => {
    configure();
    vi.useFakeTimers();
    let aborted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((resolve) => {
            init.signal?.addEventListener("abort", () => {
              aborted = true;
            });
            setTimeout(
              () => resolve(jsonResponse({ weeks: [], currentWeekKey: "2026-08-23" })),
              10,
            );
          }),
      ),
    );

    const pending = fetchWeeks();
    await vi.advanceTimersByTimeAsync(20);
    await expect(pending).resolves.toMatchObject({ currentWeekKey: "2026-08-23" });
    // The timer was cleared in `finally`, so a later tick must not abort.
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS * 2);
    expect(aborted).toBe(false);
  });
});
