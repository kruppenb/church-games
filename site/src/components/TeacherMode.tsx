import { useParams } from "react-router-dom";
import { useLesson } from "@/hooks/useLesson";
import { useCallback } from "react";

const GAME_LINKS: { id: string; name: string; route: string }[] = [
  { id: "quiz-showdown", name: "Quiz Showdown", route: "/games/quiz" },
  { id: "memory-match", name: "Memory Match", route: "/games/memory" },
  { id: "word-scramble", name: "Word Scramble", route: "/games/words" },
  { id: "adventure", name: "Adventure", route: "/games/adventure" },
  { id: "party-rpg", name: "Party RPG", route: "/games/rpg" },
  { id: "maze-runner", name: "Maze Runner", route: "/games/maze" },
];

export function TeacherMode() {
  const { token } = useParams<{ token: string }>();
  const expectedToken = import.meta.env.VITE_TEACHER_TOKEN;
  const { lesson, loading, error } = useLesson();

  const handleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  if (!expectedToken || token !== expectedToken) {
    return (
      <div className="teacher-denied">
        <h1>Access Denied</h1>
        <p>Invalid teacher token. Please check the URL and try again.</p>
        <a href="#/" className="btn btn-secondary">
          Back to Home
        </a>
      </div>
    );
  }

  if (loading) {
    return <div className="loading">Loading lesson data...</div>;
  }

  if (error || !lesson) {
    return (
      <div className="teacher-denied">
        <h1>Error</h1>
        <p>Could not load lesson data: {error ?? "Unknown error"}</p>
        <a href="#/" className="btn btn-secondary">
          Back to Home
        </a>
      </div>
    );
  }

  return (
    <div className="teacher-dashboard">
      <header className="teacher-header">
        <h1 className="teacher-title">Teacher Dashboard</h1>
        <button className="btn btn-secondary" onClick={handleFullscreen}>
          Presentation Mode
        </button>
      </header>

      {/* Lesson Info */}
      <section className="teacher-section">
        <h2 className="teacher-section-title">Lesson Info</h2>
        <table className="teacher-table">
          <tbody>
            <tr>
              <th>Title</th>
              <td>{lesson.meta.title}</td>
            </tr>
            <tr>
              <th>Week</th>
              <td>{lesson.meta.week}</td>
            </tr>
            <tr>
              <th>Verse</th>
              <td>
                <strong>{lesson.meta.verseReference}</strong> &mdash;{" "}
                {lesson.meta.verseText}
              </td>
            </tr>
            <tr>
              <th>Theme</th>
              <td>{lesson.meta.theme}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Answer Key */}
      <section className="teacher-section">
        <h2 className="teacher-section-title">
          Answer Key ({lesson.questions.length} questions)
        </h2>
        <table className="teacher-table teacher-table-striped">
          <thead>
            <tr>
              <th>#</th>
              <th>Question</th>
              <th>Correct Answer</th>
              <th>Difficulty</th>
            </tr>
          </thead>
          <tbody>
            {lesson.questions.map((q, i) => (
              <tr key={q.id}>
                <td>{i + 1}</td>
                <td>{q.text}</td>
                <td className="teacher-correct-answer">
                  {q.options[q.correctIndex]}
                </td>
                <td>{q.difficulty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Term Pairs */}
      {lesson.termPairs.length > 0 && (
        <section className="teacher-section">
          <h2 className="teacher-section-title">
            Term Pairs ({lesson.termPairs.length})
          </h2>
          <table className="teacher-table teacher-table-striped">
            <thead>
              <tr>
                <th>Term</th>
                <th>Definition</th>
                <th>Difficulty</th>
              </tr>
            </thead>
            <tbody>
              {lesson.termPairs.map((tp, i) => (
                <tr key={i}>
                  <td>
                    <strong>{tp.term}</strong>
                  </td>
                  <td>{tp.definition}</td>
                  <td>{tp.difficulty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Key Words */}
      {lesson.keyWords.length > 0 && (
        <section className="teacher-section">
          <h2 className="teacher-section-title">
            Key Words ({lesson.keyWords.length})
          </h2>
          <table className="teacher-table teacher-table-striped">
            <thead>
              <tr>
                <th>Word</th>
                <th>Hint</th>
                <th>Difficulty</th>
              </tr>
            </thead>
            <tbody>
              {lesson.keyWords.map((kw, i) => (
                <tr key={i}>
                  <td>
                    <strong>{kw.word}</strong>
                  </td>
                  <td>{kw.hint}</td>
                  <td>{kw.difficulty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Story Scenes */}
      {lesson.story.scenes.length > 0 && (
        <section className="teacher-section">
          <h2 className="teacher-section-title">Story Scenes</h2>
          {lesson.story.summary && (
            <p className="teacher-story-summary">{lesson.story.summary}</p>
          )}
          <ol className="teacher-scene-list">
            {lesson.story.scenes.map((scene, i) => (
              <li key={i} className="teacher-scene-item">
                <strong>{scene.title}</strong>
                <p>{scene.description}</p>
                {scene.questionIds.length > 0 && (
                  <span className="teacher-scene-questions">
                    Questions: {scene.questionIds.join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Quick Launch */}
      <section className="teacher-section">
        <h2 className="teacher-section-title">Launch Games (Group Mode)</h2>
        <div className="teacher-game-links">
          {GAME_LINKS.map((game) => (
            <a
              key={game.id}
              href={`#${game.route}`}
              className="btn btn-primary"
            >
              {game.name}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
