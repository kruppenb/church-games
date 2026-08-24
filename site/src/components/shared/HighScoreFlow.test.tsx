import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ReactNode } from "react";
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { CHECKING_DELAY_MS, HighScoreFlow } from "@/components/shared/HighScoreFlow";
import { LeaderboardTable } from "@/components/shared/LeaderboardTable";
import { DifficultyProvider } from "@/hooks/useDifficulty";
import {
  getBoard,
  getWeekKey,
  submitScore,
  type LeaderboardEntry,
} from "@/lib/leaderboard-local";

const BASE = "https://lb.test/api";

function renderFlow(ui: ReactNode) {
  return render(<DifficultyProvider>{ui}</DifficultyProvider>);
}

function entry(
  initials: string,
  score: number,
  ts: number,
  difficulty: LeaderboardEntry["difficulty"] = "big-kids",
): LeaderboardEntry {
  return { initials, score, difficulty, ts };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** A full 10-entry board with scores 1000, 900, … 100. */
function fullBoard(): LeaderboardEntry[] {
  return Array.from({ length: 10 }, (_, i) => entry("AAA", 1000 - i * 100, 1000 + i));
}

/** Turn on shared mode; every request is answered by `routes`. */
function configureShared(
  routes: (url: string, init: RequestInit) => Response | Promise<Response> | undefined,
) {
  vi.stubEnv("VITE_LEADERBOARD_API", BASE);
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const res = routes(url, init);
    if (!res) throw new Error(`Unrouted request: ${url}`);
    return res;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function typeInitials(keys: string[]) {
  await act(async () => {
    for (const key of keys) fireEvent.keyDown(window, { key });
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("HighScoreFlow", () => {
  it("renders nothing and calls onDone for a non-qualifying score", async () => {
    const onDone = vi.fn();
    const { container } = renderFlow(
      <HighScoreFlow
        gameId="survivors"
        gameName="Survivors"
        score={0}
        show
        onDone={onDone}
      />,
    );
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(container.querySelector(".lb-overlay")).toBeNull();
  });

  it("shows the picker for a qualifying score", async () => {
    renderFlow(
      <HighScoreFlow
        gameId="survivors"
        gameName="Survivors"
        score={1500}
        show
        onDone={() => {}}
      />,
    );
    expect(await screen.findByText("HIGH SCORE!")).toBeTruthy();
    expect(screen.getByText("Survivors")).toBeTruthy();
    expect(screen.getByText("1,500")).toBeTruthy();
  });

  it("types initials from the keyboard and submits on Enter", async () => {
    const onDone = vi.fn();
    renderFlow(
      <HighScoreFlow
        gameId="survivors"
        gameName="Survivors"
        score={500}
        show
        onDone={onDone}
      />,
    );
    await screen.findByText("HIGH SCORE!");

    await typeInitials(["b", "o", "b"]);
    expect(screen.getByLabelText("Slot 1, letter B")).toBeTruthy();
    expect(screen.getByLabelText("Slot 2, letter O")).toBeTruthy();
    expect(screen.getByLabelText("Slot 3, letter B")).toBeTruthy();

    await typeInitials(["Enter"]);

    expect(await screen.findByText("RANK #1")).toBeTruthy();
    expect(getBoard(getWeekKey(), "survivors")[0].initials).toBe("BOB");
    expect(document.querySelector(".lb-row-new")).toBeTruthy();

    fireEvent.click(screen.getByText("Awesome!"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("moves back a slot on Backspace", async () => {
    renderFlow(
      <HighScoreFlow
        gameId="survivors"
        gameName="Survivors"
        score={500}
        show
        onDone={() => {}}
      />,
    );
    await screen.findByText("HIGH SCORE!");
    await typeInitials(["x", "Backspace", "y"]);
    expect(screen.getByLabelText("Slot 1, letter Y")).toBeTruthy();
  });

  it("shakes and does not submit blocked initials", async () => {
    renderFlow(
      <HighScoreFlow
        gameId="survivors"
        gameName="Survivors"
        score={500}
        show
        onDone={() => {}}
      />,
    );
    await screen.findByText("HIGH SCORE!");
    await typeInitials(["a", "s", "s", "Enter"]);
    expect(document.querySelector(".lb-shake")).toBeTruthy();
    expect(screen.queryByText(/RANK/)).toBeNull();
    expect(getBoard(getWeekKey(), "survivors")).toHaveLength(0);
  });

  it("cycles letters with the arrow buttons and wraps Z to A", async () => {
    submitScore("jeopardy", {
      initials: "ZZZ",
      score: 10,
      difficulty: "big-kids",
    });
    renderFlow(
      <HighScoreFlow
        gameId="survivors"
        gameName="Survivors"
        score={5}
        show
        onDone={() => {}}
      />,
    );
    // Prefilled from the last initials used on this device
    expect(await screen.findByLabelText("Slot 1, letter Z")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Next letter, slot 1"));
    expect(screen.getByLabelText("Slot 1, letter A")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Previous letter, slot 1"));
    expect(screen.getByLabelText("Slot 1, letter Z")).toBeTruthy();
  });

  it("closes without calling onDone when the parent hides it", async () => {
    const onDone = vi.fn();
    const { rerender } = renderFlow(
      <HighScoreFlow
        gameId="survivors"
        gameName="Survivors"
        score={500}
        show
        onDone={onDone}
      />,
    );
    expect(await screen.findByText("HIGH SCORE!")).toBeTruthy();

    rerender(
      <DifficultyProvider>
        <HighScoreFlow
          gameId="survivors"
          gameName="Survivors"
          score={500}
          show={false}
          onDone={onDone}
        />
      </DifficultyProvider>,
    );
    expect(screen.queryByText("HIGH SCORE!")).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("ignores a qualify result that lands after the parent hid the flow", async () => {
    const onDone = vi.fn();
    const { rerender } = renderFlow(
      <HighScoreFlow
        gameId="survivors"
        gameName="Survivors"
        score={0}
        show
        onDone={onDone}
      />,
    );
    // Hide before the (async) non-qualifying answer comes back.
    rerender(
      <DifficultyProvider>
        <HighScoreFlow
          gameId="survivors"
          gameName="Survivors"
          score={0}
          show={false}
          onDone={onDone}
        />
      </DifficultyProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("HighScoreFlow — shared mode", () => {
  it("checks the server board, shows Saving… during the POST, then the server board", async () => {
    let resolvePost: ((res: Response) => void) | undefined;
    const serverBoard = [entry("ZZT", 900, 555000), entry("OLD", 400, 111000)];
    const fetchMock = configureShared((url, init) => {
      if (init.method === "POST" && url.endsWith("/score/survivors")) {
        return new Promise<Response>((resolve) => {
          resolvePost = resolve;
        });
      }
      if (url.endsWith("/board/current")) {
        return jsonResponse({ weekKey: "2026-08-23", boards: {} });
      }
      return undefined;
    });

    renderFlow(
      <HighScoreFlow
        gameId="survivors"
        gameName="Survivors"
        score={900}
        show
        onDone={() => {}}
      />,
    );

    await screen.findByText("HIGH SCORE!");
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith("/board/current")),
    ).toBe(true);

    await typeInitials(["z", "z", "t", "Enter"]);

    // The POST is still in flight: the OK button says Saving… and is disabled.
    const ok = await screen.findByText("Saving…");
    expect((ok as HTMLButtonElement).disabled).toBe(true);
    expect(ok.getAttribute("aria-busy")).toBe("true");
    expect(
      (screen.getByLabelText("Next letter, slot 1") as HTMLButtonElement).disabled,
    ).toBe(true);

    await act(async () => {
      resolvePost?.(
        jsonResponse({ rank: 1, weekKey: "2026-08-23", board: serverBoard }),
      );
    });

    expect(await screen.findByText("RANK #1")).toBeTruthy();
    const rows = document.querySelectorAll(".lb-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("ZZT");
    expect(rows[0].className).toContain("lb-row-new");
    expect(rows[1].className).not.toContain("lb-row-new");
    // Shared mode never writes the board to this device.
    expect(getBoard(getWeekKey(), "survivors")).toEqual([]);
    expect(document.querySelector(".lb-offline")).toBeNull();

    const posted = fetchMock.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(posted).toEqual([
      { initials: "ZZT", score: 900, difficulty: "little-kids" },
    ]);
  });

  it("closes without an overlay when the server board says the score does not qualify", async () => {
    const onDone = vi.fn();
    configureShared((url) =>
      url.endsWith("/board/current")
        ? jsonResponse({
            weekKey: "2026-08-23",
            boards: { survivors: fullBoard() },
          })
        : undefined,
    );

    const { container } = renderFlow(
      <HighScoreFlow
        gameId="survivors"
        gameName="Survivors"
        score={50}
        show
        onDone={onDone}
      />,
    );

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(container.querySelector(".lb-overlay")).toBeNull();
  });

  it("shows the offline note and keeps the score on this device when the API is down", async () => {
    vi.stubEnv("VITE_LEADERBOARD_API", BASE);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    renderFlow(
      <HighScoreFlow
        gameId="survivors"
        gameName="Survivors"
        score={750}
        show
        onDone={() => {}}
      />,
    );

    await screen.findByText("HIGH SCORE!");
    await typeInitials(["a", "m", "y", "Enter"]);

    expect(await screen.findByText("RANK #1")).toBeTruthy();
    const note = document.querySelector(".lb-offline");
    expect(note).toBeTruthy();
    expect(note?.textContent).toBe("Offline — score saved on this device");
    expect(getBoard(getWeekKey(), "survivors")[0]).toMatchObject({
      initials: "AMY",
      score: 750,
    });
  });

  it("shows a checking shell after a delay, then the high-score picker once the slow server answers", async () => {
    vi.useFakeTimers();
    let resolveBoard: ((res: Response) => void) | undefined;
    configureShared((url) => {
      if (url.endsWith("/board/current")) {
        return new Promise<Response>((resolve) => {
          resolveBoard = resolve;
        });
      }
      return undefined;
    });

    const { container } = renderFlow(
      <HighScoreFlow
        gameId="survivors"
        gameName="Survivors"
        score={1500}
        show
        onDone={() => {}}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHECKING_DELAY_MS - 1);
    });
    expect(container.querySelector(".lb-overlay")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText("Checking scores…")).toBeTruthy();
    expect(screen.getByText("1,500")).toBeTruthy();

    // findByText's own polling relies on real timers, so flush the resolved
    // fetch (and any timer-scheduled React work) with the fake clock before
    // asserting synchronously.
    await act(async () => {
      resolveBoard?.(jsonResponse({ weekKey: "2026-08-23", boards: {} }));
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText("HIGH SCORE!")).toBeTruthy();
    expect(document.querySelector(".lb-checking")).toBeNull();
  });

  it("never shows the checking shell on the fast pure-local path", async () => {
    renderFlow(
      <HighScoreFlow
        gameId="survivors"
        gameName="Survivors"
        score={1500}
        show
        onDone={() => {}}
      />,
    );

    await screen.findByText("HIGH SCORE!");
    expect(document.querySelector(".lb-checking")).toBeNull();

    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(document.querySelector(".lb-checking")).toBeNull();
  });

  it("closes after a delayed checking shell when the slow server board says the score does not qualify", async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    let resolveBoard: ((res: Response) => void) | undefined;
    configureShared((url) => {
      if (url.endsWith("/board/current")) {
        return new Promise<Response>((resolve) => {
          resolveBoard = resolve;
        });
      }
      return undefined;
    });

    const { container } = renderFlow(
      <HighScoreFlow
        gameId="survivors"
        gameName="Survivors"
        score={50}
        show
        onDone={onDone}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHECKING_DELAY_MS);
    });
    expect(screen.getByText("Checking scores…")).toBeTruthy();

    await act(async () => {
      resolveBoard?.(
        jsonResponse({ weekKey: "2026-08-23", boards: { survivors: fullBoard() } }),
      );
      await vi.runAllTimersAsync();
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".lb-overlay")).toBeNull();
  });
});

describe("LeaderboardTable", () => {
  it("renders the empty state", () => {
    const { container } = render(<LeaderboardTable entries={[]} />);
    expect(container.querySelector(".lb-empty")).toBeTruthy();
    expect(screen.getByText("No scores yet — be the first!")).toBeTruthy();
  });

  it("renders ranked rows with medals, difficulty and formatted scores", () => {
    const { container } = render(
      <LeaderboardTable
        entries={[
          entry("BEN", 25000, 200, "big-kids"),
          entry("AMY", 1200, 100, "little-kids"),
        ]}
      />,
    );
    const rows = container.querySelectorAll(".lb-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("BEN");
    expect(rows[0].textContent).toContain("\u{1F947}");
    expect(rows[0].textContent).toContain("Big");
    expect(rows[0].textContent).toContain("25,000");
    expect(rows[1].textContent).toContain("AMY");
    expect(rows[1].textContent).toContain("\u{1F948}");
    expect(rows[1].textContent).toContain("Little");
  });

  it("highlights the row matching highlightTs", () => {
    const { container } = render(
      <LeaderboardTable
        entries={[entry("AMY", 100, 4242), entry("BEN", 50, 4243)]}
        highlightTs={4242}
      />,
    );
    const highlighted = container.querySelectorAll(".lb-row-new");
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].textContent).toContain("AMY");
  });
});
