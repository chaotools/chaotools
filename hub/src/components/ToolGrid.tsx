import { memo } from 'react';
import { ToolCard } from './ToolCard';
import type { Tool } from '@chaotools/types';

interface ToolGridProps {
  tools: Tool[];
  loading?: boolean;
  error?: string | null;
  savedTools?: string[];
  onToggleSave?: (toolId: string) => void;
  emptyMessage?: string;
}

export const ToolGrid = memo<ToolGridProps>(function ToolGrid({
  tools,
  loading = false,
  error = null,
  savedTools = [],
  onToggleSave,
  emptyMessage = '没有找到匹配的工具',
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-3" aria-busy="true" aria-label="加载中">
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="skeleton-card skeleton" key={i}>
            <div className="sk-icon skeleton" />
            <div className="sk-line sk-line--w60 skeleton" />
            <div className="sk-line sk-line--w40 skeleton" />
            <div className="sk-line skeleton" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="tool-grid__error card text-center">
        <div className="empty-state__icon">⚠️</div>
        <h3>加载失败</h3>
        <p className="text-muted">{error}</p>
      </div>
    );
  }

  if (!loading && tools.length === 0) {
    return (
      <div className="tool-grid__empty card text-center">
        <div className="empty-state__icon">📭</div>
        <h3>{emptyMessage}</h3>
        <p className="text-muted">尝试调整搜索条件或浏览其他分类</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3">
      {tools.map((tool, index) => (
        <ToolCard
          key={tool.id}
          tool={tool}
          index={index}
          isSaved={savedTools.includes(tool.id)}
          onToggleSave={onToggleSave}
        />
      ))}
    </div>
  );
});
