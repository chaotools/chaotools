import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Tool } from '@chaotools/types';

interface ToolCardProps {
  tool: Tool;
  isSaved?: boolean;
  onToggleSave?: (toolId: string) => void;
  index?: number;
}

export const ToolCard = memo<ToolCardProps>(function ToolCard({
  tool,
  isSaved = false,
  onToggleSave,
  index = 0,
}) {
  const navigate = useNavigate();
  // Determine if we have an image icon (PNG/thumbnail path) or emoji
  const iconSrc = tool.thumbnail || tool.icon;
  const isEmoji = iconSrc ? /^\p{Emoji}/u.test(iconSrc) : true;

  const primaryCat = tool.categories[0];
  const catModifier = ['dev', 'ai', 'fun'].includes(primaryCat)
    ? `tool-card--${primaryCat}`
    : '';

  const handleClick = useCallback(() => {
    navigate(`/tool/${tool.id}`);
  }, [navigate, tool.id]);

  const handleSaveClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onToggleSave?.(tool.id);
    },
    [onToggleSave, tool.id]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick]
  );

  return (
    <article
      className={`tool-card card card-interactive animate-fade-in-up ${catModifier}`}
      style={{ animationDelay: `${Math.min(index, 9) * 80}ms` }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`打开 ${tool.name}`}
    >
      {/* Icon */}
      <div className={`tool-card__icon ${isEmoji ? 'tool-card__icon--emoji' : ''}`}>
        {isEmoji ? (
          <span className="tool-card__emoji">{tool.icon}</span>
        ) : (
          <img
            src={iconSrc}
            alt={`${tool.name} 图标`}
            className="tool-card__img"
            loading="lazy"
            width={48}
            height={48}
          />
        )}
      </div>

      {/* Content */}
      <div className="tool-card__body">
        <h3 className="tool-card__name">{tool.name}</h3>
        <p className="tool-card__desc">{tool.description}</p>

        {/* Tags */}
        <div className="tool-card__tags">
          {tool.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="badge badge-grad">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Save Button */}
      {onToggleSave && (
        <button
          className={`tool-card__save ${isSaved ? 'tool-card__save--active animate-pop' : ''}`}
          onClick={handleSaveClick}
          aria-label={isSaved ? `取消收藏 ${tool.name}` : `收藏 ${tool.name}`}
          title={isSaved ? '取消收藏' : '收藏'}
        >
          {isSaved ? '⭐' : '☆'}
        </button>
      )}
    </article>
  );
});