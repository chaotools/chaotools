import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Tool } from '@chaotools/types';

const RECENT_KEY = 'chaotools-recent-tools';
const RECENT_EVENT = 'chaotools:recent-tools-changed';
const MAX_RECENT = 6;

export function readRecentToolIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string').slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

export function rememberRecentTool(toolId: string): void {
  try {
    const next = [toolId, ...readRecentToolIds().filter((id) => id !== toolId)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(RECENT_EVENT));
  } catch {
    // Ignore storage quota and privacy-mode errors.
  }
}

export function useRecentTools(tools: Tool[]): { recentTools: Tool[]; clearRecent: () => void } {
  const [ids, setIds] = useState<string[]>(readRecentToolIds);

  useEffect(() => {
    const refresh = () => setIds(readRecentToolIds());
    window.addEventListener(RECENT_EVENT, refresh);
    return () => window.removeEventListener(RECENT_EVENT, refresh);
  }, []);

  const clearRecent = useCallback(() => {
    try {
      localStorage.removeItem(RECENT_KEY);
      setIds([]);
      window.dispatchEvent(new CustomEvent(RECENT_EVENT));
    } catch {
      // Ignore storage errors.
    }
  }, []);

  const recentTools = useMemo(
    () => ids.map((id) => tools.find((tool) => tool.id === id)).filter((tool): tool is Tool => Boolean(tool)),
    [ids, tools]
  );

  return { recentTools, clearRecent };
}
