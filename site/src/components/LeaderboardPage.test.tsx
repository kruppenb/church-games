import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import LeaderboardPage from "@/components/LeaderboardPage";
import {
  formatWeekLabel,
  getWeekKey,
  type LeaderboardEntry,
} from "@/lib/leaderboard-local";

const BASE = "https://lb.test/api";
const STORAGE_KEY = "church-games:leaderboard";
const PREV_WEEK = "2026-08-16";
const EMPTY_STATE = "No high scores this week yet. Go play something!";

function entry(
  initials: string,
  score: number,
  ts: number,
  difficulty: LeaderboardEntry["difficulty"] = "big-kids",
): LeaderboardEntry {
  return { initials, score, difficulty, ts };
}

function seed(weeks: Record<string, Record<string, LeaderboardEntry[]>>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, weeks }));
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

interface ServerState {
  weeks: string[];
  currentWeekKey: string;
  boards: Record<string, Record<string, LeaderboardEntry[]>>;
}

/** Point the app at a fake API that serves `state`. Returns the fetch spy. */
function configureShared(state: ServerState) {
  vi.stubEnv("VITE_LEADERBOARD_API", BASE);
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/weeks")) {
      return jsonResponse({
        weeks: state.weeks,
        currentWeekKey: state.currentWeekKey,
      });
    }
    const match = /\/board\/([^/?]+)$/.exec(url);
    if (match) {
      const key = match[1] === "current" ? state.currentWeekKey : match[1];
      return jsonResponse({ weekKey: key, boards: state.boards[key] ?? {} });
    }
    throw new Error(`Unrouted request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function boardUrls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.includes("/board/"));
}

function cardNames(): string[] {
  return Array.from(document.querySelectorAll(".lbp-card-name")).map(
    (el) => el.textContent ?? "",
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("LeaderboardPage — pure-local mode", () => {
  it("shows the loading state, then the empty state", async () => {
    render(<LeaderboardPage />);
    expect(screen.getByText("Loading scores…")).toBeTruthy();
    expect(document.querySelector(".lbp-loading")).toBeTruthy();

    expect(await screen.findByText(EMPTY_STATE)).toBeTruthy();
    expect(document.querySelector(".lbp-loading")).toBeNull();
    // Device-local by design — no API configured, so no offline note.
    expect(document.querySelector(".lbp-offline")).toBeNull();
    expect(screen.getByText("This Week")).toBeTruthy();
  });

  it("renders a card per game with device-local scores", async () => {
    const week = getWeekKey();
    seed({
      [week]: {
        survivors: [entry("AMY", 1200, 10), entry("BEN", 300, 20)],
        jeopardy: [entry("CAT", 500, 30, "little-kids")],
      },
    });

    render(<LeaderboardPage />);
    await screen.findByText("Survivors");

    expect(cardNames()).toEqual(["Survivors", "Jeopardy"]);
    const rows = document.querySelectorAll(".lbp-card .lb-row");
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("AMY");
    expect(rows[0].textContent).toContain("1,200");
    expect(document.querySelector(".lbp-offline")).toBeNull();
  });
});

describe("LeaderboardPage — shared mode", () => {
  it("renders server weeks as pills and server boards as cards", async () => {
    const current = getWeekKey();
    const fetchMock = configureShared({
      weeks: [current, PREV_WEEK, "2026-08-09"],
      currentWeekKey: current,
      boards: {
        [current]: { survivors: [entry("SRV", 900, 111)] },
        [PREV_WEEK]: { jeopardy: [entry("OLD", 400, 222)] },
      },
    });

    render(<LeaderboardPage />);
    await screen.findByText("Survivors");

    const pills = Array.from(document.querySelectorAll(".lbp-week-pill")).map(
      (el) => el.textContent,
    );
    expect(pills[0]).toBe("This Week");
    expect(pills).toContain(formatWeekLabel(PREV_WEEK));
    expect(cardNames()).toEqual(["Survivors"]);
    expect(document.querySelector(".lb-row")?.textContent).toContain("SRV");
    expect(document.querySelector(".lbp-offline")).toBeNull();
    expect(boardUrls(fetchMock)).toEqual([`${BASE}/board/${current}`]);
  });

  it("fetches the picked week when a past pill is clicked", async () => {
    const current = getWeekKey();
    const fetchMock = configureShared({
      weeks: [current, PREV_WEEK],
      currentWeekKey: current,
      boards: {
        [current]: { survivors: [entry("SRV", 900, 111)] },
        [PREV_WEEK]: { jeopardy: [entry("OLD", 400, 222)] },
      },
    });

    render(<LeaderboardPage />);
    await screen.findByText("Survivors");

    fireEvent.click(screen.getByText(formatWeekLabel(PREV_WEEK)));

    await screen.findByText("Jeopardy");
    expect(cardNames()).toEqual(["Jeopardy"]);
    expect(boardUrls(fetchMock)).toEqual([
      `${BASE}/board/${current}`,
      `${BASE}/board/${PREV_WEEK}`,
    ]);
    expect(screen.getByText("This Week").getAttribute("aria-selected")).toBe(
      "false",
    );
  });

  it("keeps the previous week's cards visible (dimmed) while a newly picked week is still loading", async () => {
    const current = getWeekKey();
    const state: ServerState = {
      weeks: [current, PREV_WEEK],
      currentWeekKey: current,
      boards: {
        [current]: { survivors: [entry("SRV", 900, 111)] },
        [PREV_WEEK]: { jeopardy: [entry("OLD", 400, 222)] },
      },
    };
    let resolvePrevWeek: ((res: Response) => void) | undefined;
    vi.stubEnv("VITE_LEADERBOARD_API", BASE);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/weeks")) {
        return jsonResponse({
          weeks: state.weeks,
          currentWeekKey: state.currentWeekKey,
        });
      }
      const match = /\/board\/([^/?]+)$/.exec(url);
      if (match) {
        const key = match[1] === "current" ? state.currentWeekKey : match[1];
        if (key === PREV_WEEK) {
          return new Promise<Response>((resolve) => {
            resolvePrevWeek = resolve;
          });
        }
        return jsonResponse({ weekKey: key, boards: state.boards[key] ?? {} });
      }
      throw new Error(`Unrouted request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LeaderboardPage />);
    await screen.findByText("Survivors");

    fireEvent.click(screen.getByText(formatWeekLabel(PREV_WEEK)));

    await waitFor(() =>
      expect(document.querySelector(".lbp-boards-loading")).toBeTruthy(),
    );
    expect(screen.getByText("Survivors")).toBeTruthy();
    expect(
      document.querySelector(".lbp-boards")?.getAttribute("aria-busy"),
    ).toBe("true");
    expect(screen.queryByText("Loading scores…")).toBeNull();

    await act(async () => {
      resolvePrevWeek?.(
        jsonResponse({ weekKey: PREV_WEEK, boards: state.boards[PREV_WEEK] }),
      );
    });

    await screen.findByText("Jeopardy");
    expect(document.querySelector(".lbp-boards-loading")).toBeNull();
    expect(
      document.querySelector(".lbp-boards")?.getAttribute("aria-busy"),
    ).toBe("false");
  });

  it("adopts the server's current week when it differs from the device's guess", async () => {
    const serverCurrent = "2030-01-06";
    const fetchMock = configureShared({
      weeks: [serverCurrent],
      currentWeekKey: serverCurrent,
      boards: { [serverCurrent]: { survivors: [entry("SRV", 42, 1)] } },
    });

    render(<LeaderboardPage />);
    await screen.findByText("Survivors");

    expect(screen.getByText(formatWeekLabel(serverCurrent))).toBeTruthy();
    expect(boardUrls(fetchMock)).toContain(`${BASE}/board/${serverCurrent}`);
    expect(document.querySelectorAll(".lbp-week-pill")).toHaveLength(1);
  });

  it("shows the offline note and device-local scores when the API is down", async () => {
    const week = getWeekKey();
    seed({ [week]: { survivors: [entry("AMY", 1200, 10)] } });
    vi.stubEnv("VITE_LEADERBOARD_API", BASE);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    render(<LeaderboardPage />);
    await screen.findByText("Survivors");

    await waitFor(() =>
      expect(document.querySelector(".lbp-offline")?.textContent).toBe(
        "Offline — showing scores saved on this device",
      ),
    );
    expect(cardNames()).toEqual(["Survivors"]);
    expect(document.querySelector(".lb-row")?.textContent).toContain("AMY");
  });
});
