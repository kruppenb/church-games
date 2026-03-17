import { HashRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import { DifficultyProvider } from "./hooks/useDifficulty";
import { Landing } from "./components/Landing";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TeacherMode } from "./components/TeacherMode";
import { MuteButton } from "./components/shared/MuteButton";

const QuizShowdown = lazy(() => import("./games/quiz-showdown"));
const WordScramble = lazy(() => import("./games/word-scramble"));
const BibleBrawler = lazy(() => import("./games/adventure"));
const PromisedLand = lazy(() => import("./games/party-rpg"));
const EscapeRoom = lazy(() => import("./games/maze-runner"));
const Survivors = lazy(() => import("./games/survivors"));
const Jeopardy = lazy(() => import("./games/jeopardy"));

export function App() {
  return (
    <DifficultyProvider>
      <HashRouter>
        <Suspense fallback={<div className="loading">Loading...</div>}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/teacher/:token" element={<TeacherMode />} />
            <Route
              path="/games/quiz"
              element={
                <ErrorBoundary>
                  <QuizShowdown />
                </ErrorBoundary>
              }
            />
            <Route
              path="/games/words"
              element={
                <ErrorBoundary>
                  <WordScramble />
                </ErrorBoundary>
              }
            />
            <Route
              path="/games/brawler"
              element={
                <ErrorBoundary>
                  <BibleBrawler />
                </ErrorBoundary>
              }
            />
            <Route
              path="/games/rpg"
              element={
                <ErrorBoundary>
                  <PromisedLand />
                </ErrorBoundary>
              }
            />
            <Route
              path="/games/escape"
              element={
                <ErrorBoundary>
                  <EscapeRoom />
                </ErrorBoundary>
              }
            />
            <Route
              path="/games/survivors"
              element={
                <ErrorBoundary>
                  <Survivors />
                </ErrorBoundary>
              }
            />
            <Route
              path="/games/jeopardy"
              element={
                <ErrorBoundary>
                  <Jeopardy />
                </ErrorBoundary>
              }
            />
          </Routes>
        </Suspense>
        <MuteButton />
      </HashRouter>
    </DifficultyProvider>
  );
}
