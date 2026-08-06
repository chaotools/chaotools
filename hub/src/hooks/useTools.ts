import { useState, useEffect, useCallback, useMemo } from 'react';
import Fuse from 'fuse.js';
import type { Manifest, Tool } from '@chaotools/types';

interface UseToolsReturn {
  tools: Tool[];
  loading: boolean;
  error: string | null;
  categories: Manifest['categories'];
  getToolsByCategory: (categoryId: string) => Tool[];
  getToolById: (id: string) => Tool | undefined;
  searchTools: (query: string) => Tool[];
  refresh: () => void;
}

export function useTools(): UseToolsReturn {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchManifest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/manifest.json', {
        cache: 'no-cache',
      });
      if (!response.ok) {
        throw new Error(`Failed to load manifest: ${response.status}`);
      }
      const data: Manifest = await response.json();
      setManifest(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load tools';
      setError(message);
      console.error('[useTools]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchManifest();
  }, [fetchManifest]);

  const tools = manifest?.tools ?? [];
  const categories = manifest?.categories ?? [];

  // Fuse.js 模糊搜索实例（tools 变化时重建）
  const fuse = useMemo(() => {
    return new Fuse(tools, {
      keys: [
        { name: 'name', weight: 0.5 },
        { name: 'description', weight: 0.3 },
        { name: 'tags', weight: 0.2 },
      ],
      threshold: 0.4,
      includeScore: true,
      minMatchCharLength: 1,
    });
  }, [tools]);

  const getToolsByCategory = useCallback(
    (categoryId: string): Tool[] => {
      return tools.filter((tool) => tool.categories.includes(categoryId));
    },
    [tools]
  );

  const getToolById = useCallback(
    (id: string): Tool | undefined => {
      return tools.find((tool) => tool.id === id);
    },
    [tools]
  );

  const searchTools = useCallback(
    (query: string): Tool[] => {
      if (!query.trim()) return tools;
      const results = fuse.search(query);
      return results.map((r) => r.item);
    },
    [fuse, tools]
  );

  return {
    tools,
    loading,
    error,
    categories,
    getToolsByCategory,
    getToolById,
    searchTools,
    refresh: fetchManifest,
  };
}
