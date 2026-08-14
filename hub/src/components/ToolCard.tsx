import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Tool } from '@chaotools/types';
import { rememberRecentTool } from '@/hooks/useRecentTools';

interface ToolCardProps {
  tool: Tool;
  isSaved?: boolean;
  onToggleSave?: (toolId: string) => void;
  index?: number;
}

export const ToolCard = memo<ToolCardProps>(function ToolCard({ tool, isSaved = false, onToggleSave }) {
  const navigate = useNavigate();
  const iconSrc = tool.thumbnail || tool.icon || '•';
  const isEmoji = /^\p{Emoji}/u.test(iconSrc);

  const handleClick = useCallback(() => {
    rememberRecentTool(tool.id);
    navigate(`/tool/${tool.id}`);
  }, [navigate, tool.id]);

  const handleSaveClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    onToggleSave?.(tool.id);
  }, [onToggleSave, tool.id]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  }, [handleClick]);

  return (
    <article
      className="tool-card card-interactive"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`打开 ${tool.name}`}
    >
      <div className="tool-card__topline">
        <span className="tool-card__category">{tool.categories[0] || '工具'}</span>
        {onToggleSave && (
          <button
            className={`tool-card__save ${isSaved ? 'tool-card__save--active' : ''}`}
            onClick={handleSaveClick}
            aria-label={isSaved ? `取消收藏 ${tool.name}` : `收藏 ${tool.name}`}
            title={isSaved ? '取消收藏' : '收藏'}
          >
            {isSaved ? '已收藏' : '收藏'}
          </button>
        )}
      </div>
      <div className="tool-card__icon" aria-hidden={isEmoji ? 'true' : undefined}>
        {isEmoji ? <span className="tool-card__emoji">{iconSrc}</span> : <img src={iconSrc} alt="" loading="lazy" width={40} height={40} />}
      </div>
      <div className="tool-card__body">
        <h3 className="tool-card__name">{tool.name}</h3>
        <p className="tool-card__desc">{tool.description}</p>
        <div className="tool-card__footer">
          <div className="tool-card__tags">
            {tool.tags.slice(0, 2).map((tag) => <span key={tag} className="badge">{tag}</span>)}
          </div>
          <span className="tool-card__open">打开</span>
        </div>
      </div>
    </article>
  );
});
