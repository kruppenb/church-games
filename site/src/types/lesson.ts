export interface LessonConfig {
  meta: {
    week: string;
    title: string;
    verseReference: string;
    verseText: string;
    theme: string;
    spotlightGame: string;
    generatedAt: string;
    jeopardyCategories?: string[];
  };
  questions: Question[];
  termPairs: TermPair[];
  keyWords: KeyWord[];
  story: {
    summary: string;
    scenes: StoryScene[];
  };
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  difficulty: "easy" | "medium" | "hard";
  hint?: string;
  explanation: string;
  format: "multiple-choice" | "true-false" | "fill-blank";
  category: "recall" | "understanding" | "application";
}

export interface TermPair {
  term: string;
  definition: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface KeyWord {
  word: string;
  hint: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface StoryScene {
  title: string;
  description: string;
  questionIds: string[];
}
