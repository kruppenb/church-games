import { useDifficulty, type Difficulty } from "@/hooks/useDifficulty";

export function DifficultyPicker() {
  const { difficulty, setDifficulty } = useDifficulty();

  function handleClick(d: Difficulty) {
    setDifficulty(d);
  }

  return (
    <div className="picker difficulty-picker">
      <button
        className={`picker-btn ${difficulty === "little-kids" ? "picker-btn-active" : ""}`}
        onClick={() => handleClick("little-kids")}
        aria-pressed={difficulty === "little-kids"}
      >
        <span className="picker-icon" aria-hidden="true">
          &#9733;
        </span>
        Little Kids
      </button>
      <button
        className={`picker-btn ${difficulty === "big-kids" ? "picker-btn-active" : ""}`}
        onClick={() => handleClick("big-kids")}
        aria-pressed={difficulty === "big-kids"}
      >
        <span className="picker-icon" aria-hidden="true">
          &#9889;
        </span>
        Big Kids
      </button>
    </div>
  );
}
