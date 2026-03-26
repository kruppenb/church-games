import { HashRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import { DifficultyProvider } from "./hooks/useDifficulty";
import { Landing } from "./components/Landing";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TeacherMode } from "./components/TeacherMode";
import { MuteButton } from "./components/shared/MuteButton";
import { ParticleBackground } from "./components/shared/ParticleBackground";

const QuizShowdown = lazy(() => import("./games/quiz-showdown"));
const WordScramble = lazy(() => import("./games/word-scramble"));
const FaithFortress = lazy(() => import("./games/tower-defense"));
const PromisedLand = lazy(() => import("./games/party-rpg"));
const Millionaire = lazy(() => import("./games/millionaire"));
const Survivors = lazy(() => import("./games/survivors"));
const Jeopardy = lazy(() => import("./games/jeopardy"));
const ScriptureCards = lazy(() => import("./games/card-battler"));
const KingdomMatch = lazy(() => import("./games/kingdom-match"));

export function App() {
  return (
    <>
      <ParticleBackground />
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
              path="/games/fortress"
              element={
                <ErrorBoundary>
                  <FaithFortress />
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
                  <Millionaire />
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
            <Route
              path="/games/cards"
              element={
                <ErrorBoundary>
                  <ScriptureCards />
                </ErrorBoundary>
              }
            />
            <Route
              path="/games/match"
              element={
                <ErrorBoundary>
                  <KingdomMatch />
                </ErrorBoundary>
              }
            />
          </Routes>
        </Suspense>
        <MuteButton />
      </HashRouter>
    </DifficultyProvider>
    </>
  );
}
