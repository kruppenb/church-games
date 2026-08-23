import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ReactNode } from "react";
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";
import { HighScoreFlow } from "@/components/shared/HighScoreFlow";
import { LeaderboardTable } from "@/components/shared/LeaderboardTable";
import { DifficultyProvider } from "@/hooks/useDifficulty";
import { getBoard, getWeekKey, submitScore } from "@/lib/leaderboard-store";

function renderFlow(ui: ReactNode) {
  return render(<DifficultyProvider>{ui}</DifficultyProvider>);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("HighScoreFlow", () => {
  it("renders nothing and calls onDone for a non-qualifying score", () => {
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
    expect(container.querySelector(".lb-overlay")).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("shows the picker for a qualifying score", () => {
    renderFlow(
      <HighScoreFlow
        gameId="survivors"
        gameName="Survivors"
        score={1500}
        show
        onDone={() => {}}
      />,
    );
    expect(screen.getByText("HIGH SCORE!")).toBeTruthy();
    expect(screen.getByText("Survivors")).toBeTruthy();
    expect(screen.getByText("1,500")).toBeTruthy();
  });

  it("types initials from the keyboard and submits on Enter", () => {
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

    act(() => {
      fireEvent.keyDown(window, { key: "b" });
      fireEvent.keyDown(window, { key: "o" });
      fireEvent.keyDown(window, { key: "b" });
    });
    expect(screen.getByLabelText("Slot 1, letter B")).toBeTruthy();
    expect(screen.getByLabelText("Slot 2, letter O")).toBeTruthy();
    expect(screen.getByLabelText("Slot 3, letter B")).toBeTruthy();

    act(() => {
      fireEvent.keyDown(window, { key: "Enter" });
    });

    expect(screen.getByText("RANK #1")).toBeTruthy();
    expect(getBoard(getWeekKey(), "survivors")[0].initials).toBe("BOB");
    expect(document.querySelector(".lb-row-new")).toBeTruthy();

    fireEvent.click(screen.getByText("Awesome!"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("moves back a slot on Backspace", () => {
    renderFlow(
      <HighScoreFlow
        gameId="survivors"
        gameName="Survivors"
        score={500}
        show
        onDone={() => {}}
      />,
    );
    act(() => {
      fireEvent.keyDown(window, { key: "x" });
      fireEvent.keyDown(window, { key: "Backspace" });
      fireEvent.keyDown(window, { key: "y" });
    });
    expect(screen.getByLabelText("Slot 1, letter Y")).toBeTruthy();
  });

  it("shakes and does not submit blocked initials", () => {
    renderFlow(
      <HighScoreFlow
        gameId="survivors"
        gameName="Survivors"
        score={500}
        show
        onDone={() => {}}
      />,
    );
    act(() => {
      fireEvent.keyDown(window, { key: "a" });
      fireEvent.keyDown(window, { key: "s" });
      fireEvent.keyDown(window, { key: "s" });
      fireEvent.keyDown(window, { key: "Enter" });
    });
    expect(document.querySelector(".lb-shake")).toBeTruthy();
    expect(screen.queryByText(/RANK/)).toBeNull();
    expect(getBoard(getWeekKey(), "survivors")).toHaveLength(0);
  });

  it("cycles letters with the arrow buttons and wraps Z to A", () => {
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
    expect(screen.getByLabelText("Slot 1, letter Z")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Next letter, slot 1"));
    expect(screen.getByLabelText("Slot 1, letter A")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Previous letter, slot 1"));
    expect(screen.getByLabelText("Slot 1, letter Z")).toBeTruthy();
  });

  it("closes without calling onDone when the parent hides it", () => {
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
    expect(screen.getByText("HIGH SCORE!")).toBeTruthy();

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
});

describe("LeaderboardTable", () => {
  it("renders the empty state", () => {
    const { container } = render(
      <LeaderboardTable gameId="survivors" weekKey={getWeekKey()} />,
    );
    expect(container.querySelector(".lb-empty")).toBeTruthy();
    expect(screen.getByText("No scores yet — be the first!")).toBeTruthy();
  });

  it("renders ranked rows with medals, difficulty and formatted scores", () => {
    submitScore("survivors", {
      initials: "AMY",
      score: 1200,
      difficulty: "little-kids",
    });
    submitScore("survivors", {
      initials: "BEN",
      score: 25000,
      difficulty: "big-kids",
    });
    const { container } = render(
      <LeaderboardTable gameId="survivors" weekKey={getWeekKey()} />,
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
    submitScore("survivors", {
      initials: "AMY",
      score: 100,
      difficulty: "big-kids",
    });
    const ts = getBoard(getWeekKey(), "survivors")[0].ts;
    const { container } = render(
      <LeaderboardTable
        gameId="survivors"
        weekKey={getWeekKey()}
        highlightTs={ts}
      />,
    );
    expect(container.querySelectorAll(".lb-row-new")).toHaveLength(1);
  });
});
