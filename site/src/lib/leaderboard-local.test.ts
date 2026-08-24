import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  MAX_ENTRIES,
  WEEKS_TO_KEEP,
  clearLeaderboard,
  formatWeekLabel,
  getBoard,
  getLastInitials,
  getWeekBoards,
  getWeekKey,
  isAllowedInitials,
  listWeeks,
  normalizeEntry,
  qualifies,
  qualifiesAgainst,
  rememberInitials,
  sanitizeInitials,
  submitScore,
  type LeaderboardEntry,
} from "@/lib/leaderboard-local";

const STORAGE_KEY = "church-games:leaderboard";
const LAST_INITIALS_KEY = "church-games:last-initials";

interface SeedShape {
  version: 1;
  weeks: Record<string, Record<string, LeaderboardEntry[]>>;
}

function seed(weeks: SeedShape["weeks"]): void {
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

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getWeekKey", () => {
  it("maps a Sunday to itself", () => {
    // 2026-08-23 is a Sunday
    expect(getWeekKey(new Date(2026, 7, 23))).toBe("2026-08-23");
  });

  it("maps a Saturday back 6 days to the preceding Sunday", () => {
    // 2026-08-29 is a Saturday
    expect(getWeekKey(new Date(2026, 7, 29))).toBe("2026-08-23");
  });

  it("maps every weekday of a week onto the same Sunday key", () => {
    const keys = [23, 24, 25, 26, 27, 28, 29].map((day) =>
      getWeekKey(new Date(2026, 7, day)),
    );
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("2026-08-23");
  });

  it("ignores time of day (local midnight and 23:59 agree)", () => {
    expect(getWeekKey(new Date(2026, 7, 26, 0, 0, 0))).toBe("2026-08-23");
    expect(getWeekKey(new Date(2026, 7, 26, 23, 59, 59))).toBe("2026-08-23");
  });

  it("crosses a month boundary backwards", () => {
    // Tue 2026-09-01 -> Sun 2026-08-30
    expect(getWeekKey(new Date(2026, 8, 1))).toBe("2026-08-30");
  });

  it("crosses a year boundary backwards", () => {
    // Fri 2027-01-01 -> Sun 2026-12-27
    expect(getWeekKey(new Date(2027, 0, 1))).toBe("2026-12-27");
    // Sat 2026-01-03 -> Sun 2025-12-28 (also checks zero padding)
    expect(getWeekKey(new Date(2026, 0, 3))).toBe("2025-12-28");
  });

  it("zero-pads single-digit months and days", () => {
    // Sun 2026-03-01
    expect(getWeekKey(new Date(2026, 2, 1))).toBe("2026-03-01");
  });

  it("handles a leap-day week", () => {
    // Sun 2028-02-27 covers Tue 2028-02-29
    expect(getWeekKey(new Date(2028, 1, 29))).toBe("2028-02-27");
  });

  it("defaults to today and always returns a Sunday", () => {
    const key = getWeekKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const [y, m, d] = key.split("-").map(Number);
    expect(new Date(y, m - 1, d).getDay()).toBe(0);
  });
});

describe("formatWeekLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 23, 12, 0, 0));
  });

  it("omits the year for the current year", () => {
    expect(formatWeekLabel("2026-08-23")).toBe("Week of Aug 23");
  });

  it("includes the year for other years", () => {
    expect(formatWeekLabel("2025-12-28")).toBe("Week of Dec 28, 2025");
    expect(formatWeekLabel("2027-01-03")).toBe("Week of Jan 3, 2027");
  });

  it("parses the key as a LOCAL date (no UTC off-by-one)", () => {
    // new Date("2026-03-01") is UTC midnight and renders as Feb 28 in any
    // negative-offset timezone. Local component parsing must say Mar 1.
    expect(formatWeekLabel("2026-03-01")).toBe("Week of Mar 1");
    expect(formatWeekLabel("2026-01-01")).toBe("Week of Jan 1");
    expect(formatWeekLabel("2026-12-31")).toBe("Week of Dec 31");
  });

  it("strips leading zeros from the day", () => {
    expect(formatWeekLabel("2026-08-02")).toBe("Week of Aug 2");
  });

  it("returns the raw key when it is not a valid week key", () => {
    expect(formatWeekLabel("nonsense")).toBe("nonsense");
    expect(formatWeekLabel("2026-13-01")).toBe("2026-13-01");
  });
});

describe("getBoard", () => {
  it("returns an empty array for missing storage", () => {
    expect(getBoard("2026-08-23", "survivors")).toEqual([]);
  });

  it("returns an empty array for an unknown week or game", () => {
    seed({ "2026-08-23": { survivors: [entry("BOB", 100, 1)] } });
    expect(getBoard("2026-08-16", "survivors")).toEqual([]);
    expect(getBoard("2026-08-23", "jeopardy")).toEqual([]);
  });

  it("sorts by score descending", () => {
    seed({
      "2026-08-23": {
        survivors: [
          entry("LOW", 10, 1),
          entry("TOP", 900, 2),
          entry("MID", 400, 3),
        ],
      },
    });
    expect(getBoard("2026-08-23", "survivors").map((e) => e.initials)).toEqual([
      "TOP",
      "MID",
      "LOW",
    ]);
  });

  it("breaks ties with the earlier ts first", () => {
    seed({
      "2026-08-23": {
        survivors: [
          entry("LTR", 500, 9000),
          entry("ERL", 500, 1000),
          entry("MID", 500, 5000),
        ],
      },
    });
    expect(getBoard("2026-08-23", "survivors").map((e) => e.initials)).toEqual([
      "ERL",
      "MID",
      "LTR",
    ]);
  });

  it("caps the returned board at MAX_ENTRIES", () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      entry("AAA", 100 + i, 1000 + i),
    );
    seed({ "2026-08-23": { survivors: many } });
    expect(getBoard("2026-08-23", "survivors")).toHaveLength(MAX_ENTRIES);
  });

  it("drops malformed entries but keeps the good ones", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        weeks: {
          "2026-08-23": {
            survivors: [
              entry("GUD", 300, 1),
              { initials: "BAD" },
              { score: 999, difficulty: "big-kids", ts: 2 },
              { initials: "NAN", score: "lots", difficulty: "big-kids", ts: 3 },
              { initials: "DIF", score: 500, difficulty: "grown-ups", ts: 4 },
              null,
              "junk",
            ],
          },
        },
      }),
    );
    expect(getBoard("2026-08-23", "survivors").map((e) => e.initials)).toEqual([
      "GUD",
    ]);
  });
});

describe("corrupt storage recovery", () => {
  it("recovers from unparseable JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json at all");
    expect(listWeeks()).toEqual([]);
    expect(getBoard("2026-08-23", "survivors")).toEqual([]);
    expect(qualifies("survivors", 100)).toBe(true);
  });

  it("recovers from a wrong top-level shape", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));
    expect(listWeeks()).toEqual([]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, weeks: 7 }));
    expect(listWeeks()).toEqual([]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify("hello"));
    expect(getBoard("2026-08-23", "survivors")).toEqual([]);
  });

  it("ignores week keys that are not YYYY-MM-DD", () => {
    seed({
      "not-a-week": { survivors: [entry("BOB", 100, 1)] },
      "2026-08-23": { survivors: [entry("AMY", 200, 2)] },
    });
    expect(listWeeks()).toEqual(["2026-08-23"]);
  });

  it("ignores boards that are not arrays", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        weeks: { "2026-08-23": { survivors: "oops", jeopardy: [entry("AMY", 5, 1)] } },
      }),
    );
    expect(getBoard("2026-08-23", "survivors")).toEqual([]);
    expect(getBoard("2026-08-23", "jeopardy")).toHaveLength(1);
  });

  it("overwrites corrupt storage on the next submit", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 26, 10, 0, 0));
    localStorage.setItem(STORAGE_KEY, "<<<garbage>>>");
    expect(submitScore("survivors", {
      initials: "NEW",
      score: 500,
      difficulty: "big-kids",
    })).toBe(1);
    expect(getBoard("2026-08-23", "survivors").map((e) => e.initials)).toEqual([
      "NEW",
    ]);
  });
});

describe("listWeeks", () => {
  it("returns week keys sorted descending", () => {
    seed({
      "2026-07-05": {},
      "2026-08-23": {},
      "2026-08-02": {},
    });
    expect(listWeeks()).toEqual(["2026-08-23", "2026-08-02", "2026-07-05"]);
  });

  it("returns an empty array with no storage", () => {
    expect(listWeeks()).toEqual([]);
  });
});

describe("qualifies", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 26, 10, 0, 0)); // week 2026-08-23
  });

  it("rejects zero, negative and non-finite scores", () => {
    expect(qualifies("survivors", 0)).toBe(false);
    expect(qualifies("survivors", -50)).toBe(false);
    expect(qualifies("survivors", Number.NaN)).toBe(false);
    expect(qualifies("survivors", Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("accepts any positive score on an empty board", () => {
    expect(qualifies("survivors", 1)).toBe(true);
  });

  it("accepts any positive score while the board is not full", () => {
    seed({
      "2026-08-23": { survivors: fullBoard().slice(0, MAX_ENTRIES - 1) },
    });
    expect(qualifies("survivors", 1)).toBe(true);
  });

  it("rejects a score equal to 10th place on a full board", () => {
    seed({ "2026-08-23": { survivors: fullBoard() } });
    expect(qualifies("survivors", 100)).toBe(false);
  });

  it("rejects a score below 10th place on a full board", () => {
    seed({ "2026-08-23": { survivors: fullBoard() } });
    expect(qualifies("survivors", 99)).toBe(false);
  });

  it("accepts a score that beats 10th place on a full board", () => {
    seed({ "2026-08-23": { survivors: fullBoard() } });
    expect(qualifies("survivors", 101)).toBe(true);
  });

  it("only looks at the current week", () => {
    seed({ "2026-08-16": { survivors: fullBoard() } });
    expect(qualifies("survivors", 1)).toBe(true);
  });

  it("only looks at the requested game", () => {
    seed({ "2026-08-23": { jeopardy: fullBoard() } });
    expect(qualifies("survivors", 1)).toBe(true);
  });
});

describe("sanitizeInitials", () => {
  it("uppercases", () => {
    expect(sanitizeInitials("bob")).toBe("BOB");
  });

  it("strips non A–Z characters", () => {
    expect(sanitizeInitials("b0b!")).toBe("BBA");
    expect(sanitizeInitials("j. t.")).toBe("JTA");
  });

  it("pads short input with A", () => {
    expect(sanitizeInitials("")).toBe("AAA");
    expect(sanitizeInitials("K")).toBe("KAA");
    expect(sanitizeInitials("KR")).toBe("KRA");
  });

  it("trims long input to 3 characters", () => {
    expect(sanitizeInitials("abcdef")).toBe("ABC");
  });

  it("always returns exactly 3 A–Z characters", () => {
    for (const raw of ["", "!!!", "1234", "zzzzzzzz", "  a  "]) {
      expect(sanitizeInitials(raw)).toMatch(/^[A-Z]{3}$/);
    }
  });
});

describe("isAllowedInitials", () => {
  it("allows ordinary initials", () => {
    expect(isAllowedInitials("AAA")).toBe(true);
    expect(isAllowedInitials("BOB")).toBe(true);
    expect(isAllowedInitials("KID")).toBe(true);
  });

  it("blocks the blocklist regardless of case", () => {
    const blocked = [
      "ASS", "SEX", "FUK", "FUC", "FCK", "FUX", "DIK", "DIC", "DCK",
      "CUM", "TIT", "FAG", "NIG", "KKK", "POO", "PEE", "BUT", "HEL",
      "DAM", "DMN", "VAG", "PNS", "WTF", "STD", "XXX",
    ];
    for (const combo of blocked) {
      expect(isAllowedInitials(combo)).toBe(false);
      expect(isAllowedInitials(combo.toLowerCase())).toBe(false);
      expect(isAllowedInitials(`${combo[0]}${combo[1].toLowerCase()}${combo[2]}`)).toBe(false);
    }
  });

  it("does not block near-misses", () => {
    expect(isAllowedInitials("ASH")).toBe(true);
    expect(isAllowedInitials("KKA")).toBe(true);
  });
});

describe("getLastInitials", () => {
  it("returns null when nothing is stored", () => {
    expect(getLastInitials()).toBeNull();
  });

  it("returns null for empty or letterless stored values", () => {
    localStorage.setItem(LAST_INITIALS_KEY, "");
    expect(getLastInitials()).toBeNull();
    localStorage.setItem(LAST_INITIALS_KEY, "!!!");
    expect(getLastInitials()).toBeNull();
  });

  it("sanitizes what it returns", () => {
    localStorage.setItem(LAST_INITIALS_KEY, "zq");
    expect(getLastInitials()).toBe("ZQA");
  });

  it("is written by submitScore", () => {
    submitScore("survivors", {
      initials: "kr8",
      score: 10,
      difficulty: "little-kids",
    });
    expect(getLastInitials()).toBe("KRA");
  });
});

describe("submitScore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 26, 10, 0, 0)); // week 2026-08-23
  });

  it("writes into the current week's board and returns rank 1", () => {
    const rank = submitScore("survivors", {
      initials: "AMY",
      score: 500,
      difficulty: "big-kids",
    });
    expect(rank).toBe(1);
    const board = getBoard("2026-08-23", "survivors");
    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({
      initials: "AMY",
      score: 500,
      difficulty: "big-kids",
    });
    expect(board[0].ts).toBe(new Date(2026, 7, 26, 10, 0, 0).getTime());
  });

  it("returns the correct 1-based rank for a mid-board insert", () => {
    seed({
      "2026-08-23": {
        survivors: [entry("AAA", 900, 1), entry("BBB", 500, 2), entry("CCC", 100, 3)],
      },
    });
    expect(
      submitScore("survivors", { initials: "NEW", score: 700, difficulty: "big-kids" }),
    ).toBe(2);
    expect(getBoard("2026-08-23", "survivors").map((e) => e.initials)).toEqual([
      "AAA",
      "NEW",
      "BBB",
      "CCC",
    ]);
  });

  it("ranks a tie below the entry that got there first", () => {
    seed({ "2026-08-23": { survivors: [entry("OLD", 500, 1)] } });
    expect(
      submitScore("survivors", { initials: "NEW", score: 500, difficulty: "big-kids" }),
    ).toBe(2);
    expect(getBoard("2026-08-23", "survivors").map((e) => e.initials)).toEqual([
      "OLD",
      "NEW",
    ]);
  });

  it("trims the board to MAX_ENTRIES", () => {
    seed({ "2026-08-23": { survivors: fullBoard() } });
    submitScore("survivors", {
      initials: "TOP",
      score: 5000,
      difficulty: "big-kids",
    });
    const board = getBoard("2026-08-23", "survivors");
    expect(board).toHaveLength(MAX_ENTRIES);
    expect(board[0].initials).toBe("TOP");
    // The old 10th place (score 100) was pushed off
    expect(board.some((e) => e.score === 100)).toBe(false);
  });

  it("returns -1 when the entry falls off a full board", () => {
    seed({ "2026-08-23": { survivors: fullBoard() } });
    expect(
      submitScore("survivors", { initials: "LOW", score: 5, difficulty: "little-kids" }),
    ).toBe(-1);
    const board = getBoard("2026-08-23", "survivors");
    expect(board).toHaveLength(MAX_ENTRIES);
    expect(board.some((e) => e.initials === "LOW")).toBe(false);
  });

  it("sanitizes the initials it stores", () => {
    submitScore("survivors", { initials: "j.", score: 42, difficulty: "big-kids" });
    expect(getBoard("2026-08-23", "survivors")[0].initials).toBe("JAA");
  });

  it("floors and clamps the stored score", () => {
    submitScore("survivors", { initials: "AAA", score: 12.9, difficulty: "big-kids" });
    submitScore("jeopardy", { initials: "AAA", score: -5, difficulty: "big-kids" });
    expect(getBoard("2026-08-23", "survivors")[0].score).toBe(12);
    expect(getBoard("2026-08-23", "jeopardy")[0].score).toBe(0);
  });

  it("keeps other games' boards untouched", () => {
    seed({ "2026-08-23": { jeopardy: [entry("JEO", 800, 1)] } });
    submitScore("survivors", { initials: "SUR", score: 100, difficulty: "big-kids" });
    expect(getBoard("2026-08-23", "jeopardy").map((e) => e.initials)).toEqual(["JEO"]);
    expect(getBoard("2026-08-23", "survivors").map((e) => e.initials)).toEqual(["SUR"]);
  });

  it("keeps previous weeks untouched", () => {
    seed({ "2026-08-16": { survivors: [entry("OLD", 800, 1)] } });
    submitScore("survivors", { initials: "NOW", score: 100, difficulty: "big-kids" });
    expect(getBoard("2026-08-16", "survivors").map((e) => e.initials)).toEqual(["OLD"]);
    expect(getBoard("2026-08-23", "survivors").map((e) => e.initials)).toEqual(["NOW"]);
  });

  it("prunes storage to the newest WEEKS_TO_KEEP weeks", () => {
    // 7 stored past weeks + the current one written by submitScore
    seed({
      "2026-07-05": { survivors: [entry("AAA", 1, 1)] },
      "2026-07-12": { survivors: [entry("BBB", 1, 1)] },
      "2026-07-19": { survivors: [entry("CCC", 1, 1)] },
      "2026-07-26": { survivors: [entry("DDD", 1, 1)] },
      "2026-08-02": { survivors: [entry("EEE", 1, 1)] },
      "2026-08-09": { survivors: [entry("FFF", 1, 1)] },
      "2026-08-16": { survivors: [entry("GGG", 1, 1)] },
    });
    submitScore("survivors", { initials: "NOW", score: 100, difficulty: "big-kids" });

    const weeks = listWeeks();
    expect(weeks).toHaveLength(WEEKS_TO_KEEP);
    expect(weeks).toEqual([
      "2026-08-23",
      "2026-08-16",
      "2026-08-09",
      "2026-08-02",
      "2026-07-26",
      "2026-07-19",
    ]);
    expect(weeks).not.toContain("2026-07-12");
    expect(weeks).not.toContain("2026-07-05");
  });

  it("always keeps the current week even when future weeks are stored", () => {
    // Clock-skew defence: 6 future weeks already stored
    seed({
      "2026-08-30": {},
      "2026-09-06": {},
      "2026-09-13": {},
      "2026-09-20": {},
      "2026-09-27": {},
      "2026-10-04": {},
    });
    submitScore("survivors", { initials: "NOW", score: 100, difficulty: "big-kids" });
    const weeks = listWeeks();
    expect(weeks).toHaveLength(WEEKS_TO_KEEP);
    expect(weeks).toContain("2026-08-23");
    expect(getBoard("2026-08-23", "survivors")).toHaveLength(1);
  });

  it("persists across separate reads (hard-reload equivalent)", () => {
    submitScore("survivors", { initials: "AMY", score: 500, difficulty: "big-kids" });
    vi.setSystemTime(new Date(2026, 7, 27, 9, 0, 0)); // still week 2026-08-23
    submitScore("survivors", { initials: "BEN", score: 900, difficulty: "big-kids" });
    expect(getBoard("2026-08-23", "survivors").map((e) => e.initials)).toEqual([
      "BEN",
      "AMY",
    ]);
  });

  it("starts a fresh board when the week rolls over", () => {
    submitScore("survivors", { initials: "AMY", score: 500, difficulty: "big-kids" });
    vi.setSystemTime(new Date(2026, 7, 30, 9, 0, 0)); // next week: 2026-08-30
    expect(getBoard(getWeekKey(), "survivors")).toEqual([]);
    expect(qualifies("survivors", 1)).toBe(true);
    submitScore("survivors", { initials: "NEW", score: 1, difficulty: "big-kids" });
    expect(getBoard("2026-08-30", "survivors").map((e) => e.initials)).toEqual(["NEW"]);
    expect(getBoard("2026-08-23", "survivors").map((e) => e.initials)).toEqual(["AMY"]);
  });
});

describe("clearLeaderboard", () => {
  it("removes every stored week", () => {
    seed({ "2026-08-23": { survivors: [entry("AMY", 500, 1)] } });
    clearLeaderboard();
    expect(listWeeks()).toEqual([]);
    expect(getBoard("2026-08-23", "survivors")).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("is safe to call with nothing stored", () => {
    expect(() => clearLeaderboard()).not.toThrow();
  });
});

describe("qualifiesAgainst", () => {
  it("rejects zero, negative and non-finite scores", () => {
    expect(qualifiesAgainst([], 0)).toBe(false);
    expect(qualifiesAgainst([], -1)).toBe(false);
    expect(qualifiesAgainst([], Number.NaN)).toBe(false);
    expect(qualifiesAgainst([], Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("accepts any positive score on an empty board", () => {
    expect(qualifiesAgainst([], 1)).toBe(true);
  });

  it("accepts any positive score while the board is not full", () => {
    expect(qualifiesAgainst(fullBoard().slice(0, MAX_ENTRIES - 1), 1)).toBe(true);
  });

  it("rejects a score equal to 10th place on a full board", () => {
    expect(qualifiesAgainst(fullBoard(), 100)).toBe(false);
  });

  it("rejects a score below 10th place on a full board", () => {
    expect(qualifiesAgainst(fullBoard(), 99)).toBe(false);
  });

  it("accepts a score that beats 10th place on a full board", () => {
    expect(qualifiesAgainst(fullBoard(), 101)).toBe(true);
  });

  it("does not read storage", () => {
    seed({ "2026-08-23": { survivors: fullBoard() } });
    // Board argument wins over anything stored.
    expect(qualifiesAgainst([], 1)).toBe(true);
  });

  it("tolerates a non-array board", () => {
    expect(qualifiesAgainst(undefined as unknown as LeaderboardEntry[], 5)).toBe(
      true,
    );
  });
});

describe("getWeekBoards", () => {
  it("returns {} with nothing stored", () => {
    expect(getWeekBoards("2026-08-23")).toEqual({});
  });

  it("returns {} for an unknown or invalid week key", () => {
    seed({ "2026-08-23": { survivors: [entry("BOB", 100, 1)] } });
    expect(getWeekBoards("2026-08-16")).toEqual({});
    expect(getWeekBoards("nonsense")).toEqual({});
    expect(getWeekBoards(undefined as unknown as string)).toEqual({});
  });

  it("returns every game's board for that week, sorted and trimmed", () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      entry("AAA", 100 + i, 1000 + i),
    );
    seed({
      "2026-08-23": {
        survivors: [entry("LOW", 10, 1), entry("TOP", 900, 2)],
        jeopardy: many,
      },
      "2026-08-16": { survivors: [entry("OLD", 5, 1)] },
    });
    const boards = getWeekBoards("2026-08-23");
    expect(Object.keys(boards).sort()).toEqual(["jeopardy", "survivors"]);
    expect(boards.survivors.map((e) => e.initials)).toEqual(["TOP", "LOW"]);
    expect(boards.jeopardy).toHaveLength(MAX_ENTRIES);
  });

  it("drops malformed entries like getBoard does", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        weeks: {
          "2026-08-23": {
            survivors: [entry("GUD", 300, 1), { initials: "BAD" }, null],
          },
        },
      }),
    );
    expect(getWeekBoards("2026-08-23").survivors.map((e) => e.initials)).toEqual(
      ["GUD"],
    );
  });

  it("returns {} when storage is corrupt", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(getWeekBoards("2026-08-23")).toEqual({});
  });
});

describe("normalizeEntry", () => {
  it("returns null for non-objects", () => {
    expect(normalizeEntry(null)).toBeNull();
    expect(normalizeEntry(undefined)).toBeNull();
    expect(normalizeEntry("junk")).toBeNull();
    expect(normalizeEntry(42)).toBeNull();
  });

  it("returns null when a required field is missing or wrong-typed", () => {
    expect(normalizeEntry({ score: 5, difficulty: "big-kids", ts: 1 })).toBeNull();
    expect(
      normalizeEntry({ initials: "BOB", difficulty: "big-kids", ts: 1 }),
    ).toBeNull();
    expect(
      normalizeEntry({ initials: "BOB", score: "lots", difficulty: "big-kids" }),
    ).toBeNull();
    expect(
      normalizeEntry({ initials: "BOB", score: Number.NaN, difficulty: "big-kids" }),
    ).toBeNull();
    expect(
      normalizeEntry({ initials: "BOB", score: 5, difficulty: "grown-ups" }),
    ).toBeNull();
  });

  it("sanitizes initials and floors/clamps the score", () => {
    expect(
      normalizeEntry({ initials: "b0b", score: 12.9, difficulty: "big-kids", ts: 7 }),
    ).toEqual({ initials: "BBA", score: 12, difficulty: "big-kids", ts: 7 });
    expect(
      normalizeEntry({ initials: "AAA", score: -5, difficulty: "little-kids", ts: 1 }),
    ).toEqual({ initials: "AAA", score: 0, difficulty: "little-kids", ts: 1 });
  });

  it("defaults a missing or non-finite ts to 0", () => {
    expect(
      normalizeEntry({ initials: "AAA", score: 1, difficulty: "big-kids" })?.ts,
    ).toBe(0);
    expect(
      normalizeEntry({
        initials: "AAA",
        score: 1,
        difficulty: "big-kids",
        ts: Number.NaN,
      })?.ts,
    ).toBe(0);
  });

  it("carries a string rowKey through and omits anything else", () => {
    expect(
      normalizeEntry({
        initials: "AAA",
        score: 1,
        difficulty: "big-kids",
        ts: 2,
        rowKey: "9999998_0000000000002",
      }),
    ).toEqual({
      initials: "AAA",
      score: 1,
      difficulty: "big-kids",
      ts: 2,
      rowKey: "9999998_0000000000002",
    });
    const noKey = normalizeEntry({
      initials: "AAA",
      score: 1,
      difficulty: "big-kids",
      ts: 2,
      rowKey: 17,
    });
    expect(noKey).not.toBeNull();
    expect("rowKey" in (noKey as object)).toBe(false);
  });
});

describe("rememberInitials", () => {
  it("is readable back through getLastInitials", () => {
    rememberInitials("KRA");
    expect(localStorage.getItem(LAST_INITIALS_KEY)).toBe("KRA");
    expect(getLastInitials()).toBe("KRA");
  });

  it("overwrites the previous value", () => {
    rememberInitials("AAA");
    rememberInitials("ZZZ");
    expect(getLastInitials()).toBe("ZZZ");
  });

  it("does not throw when storage is unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("nope");
    });
    expect(() => rememberInitials("BOB")).not.toThrow();
    spy.mockRestore();
  });
});
