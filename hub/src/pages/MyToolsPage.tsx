import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTools } from '@/hooks/useTools';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { ToolGrid } from '@/components/ToolGrid';
import type { SavedTool } from '@chaotools/types';

export function MyToolsPage() {
  const navigate = useNavigate();
  const { tools, loading, error } = useTools();
  const [savedTools, setSavedTools] = useLocalStorage<SavedTool[]>('chaotools-saved', []);

  const savedIds = useMemo(() => savedTools.map((s) => s.toolId), [savedTools]);

  const myTools = useMemo(() => {
    return savedTools
      .map((s) => tools.find((t) => t.id === s.toolId))
      .filter((t): t is NonNullable<typeof t> => t !== undefined);
  }, [tools, savedTools]);

  const handleToggleSave = useCallback(
    (toolId: string) => {
      setSavedTools((prev) => prev.filter((s) => s.toolId !== toolId));
    },
    [setSavedTools]
  );

  const handleClearAll = useCallback(() => {
    setSavedTools([]);
  }, [setSavedTools]);

  return (
    <div className="my-tools-page">
      <div className="container section">
        {/* Header */}
        <div className="my-tools-page__header animate-fade-in-up">
          <div>
            <h1>⭐ 我的工具</h1>
            <p className="text-muted">
              你收藏的工具会在这里显示，方便快速访问
            </p>
          </div>
          {myTools.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={handleClearAll}>
              清空全部
            </button>
          )}
        </div>

        {/* Empty State */}
        {!loading && myTools.length === 0 && (
          <div className="my-tools-page__empty card text-center animate-fade-in-up">
            <div className="empty-state__icon">📌</div>
            <h2>还没有收藏工具</h2>
            <p className="text-muted">
              去探索页面发现你需要的工具，点击 ☆ 即可收藏
            </p>
            <button
              className="btn btn-primary mt-4"
              onClick={() => navigate('/explore')}
            >
              🔍 去探索工具
            </button>
          </div>
        )}

        {/* Tool Grid */}
        {myTools.length > 0 && (
          <>
            <p className="my-tools-page__count text-muted animate-fade-in-up stagger-1">
              共收藏 <strong>{myTools.length}</strong> 个工具
            </p>
            <div className="animate-fade-in-up stagger-2">
              <ToolGrid
                tools={myTools}
                loading={loading}
                error={error}
                savedTools={savedIds}
                onToggleSave={handleToggleSave}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
