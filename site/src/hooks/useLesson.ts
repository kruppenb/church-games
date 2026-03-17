import { useState, useEffect } from "react";
import type { LessonConfig } from "@/types/lesson";

type LessonSource = "current" | "fallback" | "draft";

interface UseLessonResult {
  lesson: LessonConfig | null;
  loading: boolean;
  error: string | null;
  source: LessonSource;
}

export function useLesson(): UseLessonResult {
  const [lesson, setLesson] = useState<LessonConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<LessonSource>("current");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const isDraft = import.meta.env.VITE_LESSON_SOURCE === "draft";

      try {
        let data: LessonConfig;

        if (isDraft) {
          data = await fetchDraft();
          if (!cancelled) {
            setLesson(data);
            setSource("draft");
            setLoading(false);
          }
          return;
        }

        try {
          const resp = await fetch(withBase("/lessons/current.json"));
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          data = (await resp.json()) as LessonConfig;
          if (!cancelled) {
            setLesson(data);
            setSource("current");
          }
        } catch {
          // Fall back to fallback.json
          const fallbackResp = await fetch(
            withBase("/lessons/fallback.json"),
          );
          if (!fallbackResp.ok)
            throw new Error(`Fallback HTTP ${fallbackResp.status}`);
          data = (await fallbackResp.json()) as LessonConfig;
          if (!cancelled) {
            setLesson(data);
            setSource("fallback");
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load lesson",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { lesson, loading, error, source };
}

/**
 * Fetches the latest draft lesson from the /drafts/ directory.
 * Tries to load an index or falls back to a known filename pattern.
 */
async function fetchDraft(): Promise<LessonConfig> {
  // Try fetching a drafts index listing
  try {
    const indexResp = await fetch(withBase("/drafts/index.json"));
    if (indexResp.ok) {
      const index = (await indexResp.json()) as { files: string[] };
      if (index.files && index.files.length > 0) {
        // Sort descending to get the latest file
        const sorted = [...index.files].sort().reverse();
        const resp = await fetch(withBase(`/drafts/${sorted[0]}`));
        if (resp.ok) return (await resp.json()) as LessonConfig;
      }
    }
  } catch {
    // index not available, try direct fetch
  }

  // Fall back to drafts/current.json
  const resp = await fetch(withBase("/drafts/current.json"));
  if (!resp.ok) throw new Error(`Draft fetch failed: HTTP ${resp.status}`);
  return (await resp.json()) as LessonConfig;
}

/** Prepends the Vite base URL so assets resolve correctly on GitHub Pages. */
function withBase(path: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  // Avoid double slashes
  if (base.endsWith("/") && path.startsWith("/")) {
    return base + path.slice(1);
  }
  return base + path;
}
