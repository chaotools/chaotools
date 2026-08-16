import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Tool } from '@chaotools/types';
import { rememberRecentTool } from '@/hooks/useRecentTools';

interface ServiceRowProps {
  tool: Tool;
  isSaved?: boolean;
  onToggleSave?: (toolId: string) => void;
}

export const ServiceRow = memo<ServiceRowProps>(function ServiceRow({ tool, isSaved = false, onToggleSave }) {
  const navigate = useNavigate();
  const iconSrc = tool.thumbnail || tool.icon || '•';
  const isEmoji = /^\p{Emoji}/u.test(iconSrc);
  const open = useCallback(() => {
    rememberRecentTool(tool.id);
    navigate(`/tool/${tool.id}`);
  }, [navigate, tool.id]);
  return (
    <article className="service-row">
      <button className="service-row__main" onClick={open} aria-label={`打开 ${tool.name}`}>
        <span className="service-row__icon" aria-hidden={isEmoji ? 'true' : undefined}>
          {isEmoji ? iconSrc : <img src={iconSrc} alt="" width={34} height={34} />}
        </span>
        <span className="service-row__copy">
          <strong>{tool.name}</strong>
          <small>{tool.description}</small>
        </span>
      </button>
      <span className="service-row__provider">{tool.tags.find((tag) => tag !== 'AI') || '外部服务'}</span>
      {onToggleSave && (
        <button className={`service-row__save ${isSaved ? 'is-active' : ''}`} onClick={() => onToggleSave(tool.id)}>
          {isSaved ? '已收藏' : '收藏'}
        </button>
      )}
      <button className="service-row__open" onClick={open}>打开</button>
    </article>
  );
});
