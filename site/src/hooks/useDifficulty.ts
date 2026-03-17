import React, { createContext, useContext, useState } from "react";

export type Difficulty = "little-kids" | "big-kids";

interface DifficultyContextValue {
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
}

const DifficultyContext = createContext<DifficultyContextValue | null>(null);

export function DifficultyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [difficulty, setDifficulty] = useState<Difficulty>("little-kids");

  return React.createElement(
    DifficultyContext.Provider,
    { value: { difficulty, setDifficulty } },
    children,
  );
}

export function useDifficulty(): DifficultyContextValue {
  const ctx = useContext(DifficultyContext);
  if (!ctx) {
    throw new Error("useDifficulty must be used within a DifficultyProvider");
  }
  return ctx;
}
