import { useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTools } from '@/hooks/useTools';
import { useFavorites } from '@/hooks/useFavorites';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export function ToolDetailPage() {
  const { toolId } = useParams<{ toolId: string }>();
  const navigate = useNavigate();
  const { getToolById, loading, error, categories } = useTools();
  const { savedIds, toggleSave } = useFavorites();

  const tool = useMemo(() => {
    if (!toolId) return undefined;
    return getToolById(toolId);
  }, [toolId, getToolById]);

  // 分类显示名由 manifest 数据驱动，未知分类回退显示原始 id
  const categoryName = useCallback(
    (catId: string): string => {
      const cat = categories.find((c) => c.id === catId);
      return cat ? `${cat.icon} ${cat.name}` : catId;
    },
    [categories]
  );

  const isSaved = useMemo(
    () => savedIds.includes(toolId ?? ''),
    [savedIds, toolId]
  );

  const handleToggleSave = useCallback(() => {
    if (!toolId) return;
    void toggleSave(toolId);
  }, [toolId, toggleSave]);

  const handleOpen = useCallback(() => {
    if (tool?.tech.entry) {
      window.open(tool.tech.entry, '_blank', 'noopener,noreferrer');
    }
  }, [tool]);

  // Loading state
  if (loading) {
    return (
      <div className="tool-detail-page">
        <div className="container section text-center">
          <LoadingSpinner size="lg" />
          <p className="text-muted mt-4">加载工具详情...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="tool-detail-page">
        <div className="container section text-center">
          <div className="card p-8 narrow-card">
            <div className="empty-state__icon">⚠️</div>
            <h2>加载失败</h2>
            <p className="text-muted">{error}</p>
            <button className="btn btn-primary mt-4" onClick={() => navigate(-1)}>
              返回
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Not found
  if (!tool) {
    return (
      <div className="tool-detail-page">
        <div className="container section text-center">
          <div className="card p-8 narrow-card">
            <div className="empty-state__icon">🔍</div>
            <h2>工具未找到</h2>
            <p className="text-muted">
              该工具可能已被移除或链接无效
            </p>
            <Link to="/explore" className="btn btn-primary mt-4" style={{ display: 'inline-flex' }}>
              浏览其他工具
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const iconSrc = tool.thumbnail || tool.icon;
  const isEmoji = iconSrc ? /^\p{Emoji}/u.test(iconSrc) : true;
  const primaryCat = tool.categories[0];
  const catModifier = ['dev', 'ai', 'fun'].includes(primaryCat)
    ? `tool-detail__hero--${primaryCat}`
    : '';

  return (
    <div className="tool-detail-page">
      <div className="container section">
        {/* Breadcrumb */}
        <nav className="breadcrumb animate-fade-in-up" aria-label="面包屑导航">
          <Link to="/">首页</Link>
          <span>/</span>
          <Link to="/explore">探索</Link>
          <span>/</span>
          <span className="breadcrumb__current">{tool.name}</span>
        </nav>

        {/* Hero */}
        <div className={`tool-detail__hero card animate-fade-in-up stagger-1 ${catModifier}`}>
          <div className="tool-detail__hero-content">
            {/* Icon */}
            <div className={`tool-detail__icon ${isEmoji ? 'tool-detail__icon--emoji' : ''}`}>
              {isEmoji ? (
                <span className="tool-detail__emoji">{iconSrc}</span>
              ) : (
                <img
                  src={iconSrc}
                  alt={tool.name}
                  className="tool-detail__img"
                  width={80}
                  height={80}
                />
              )}
            </div>

            {/* Info */}
            <div className="tool-detail__info">
              <h1 className="tool-detail__name">{tool.name}</h1>
              <p className="tool-detail__desc">{tool.description}</p>

              {/* Categories */}
              <div className="tool-detail__categories">
                {tool.categories.map((catId) => (
                  <Link
                    key={catId}
                    to={`/explore?category=${catId}`}
                    className={`badge tool-detail__cat tool-detail__cat--${catId}`}
                  >
                    {categoryName(catId)}
                  </Link>
                ))}
              </div>

              {/* Tags */}
              <div className="tool-detail__tags">
                {tool.tags.map((tag) => (
                  <span key={tag} className="badge badge-grad">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="tool-detail__actions">
              <button className="btn btn-primary btn-lg" onClick={handleOpen}>
                🚀 打开工具
              </button>
              <button
                className={`btn btn-lg ${isSaved ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={handleToggleSave}
              >
                {isSaved ? '⭐ 已收藏' : '☆ 收藏'}
              </button>
            </div>
          </div>
        </div>

        {/* Usage Info */}
        <div className="tool-detail__tips card animate-fade-in-up stagger-2 mt-8">
          <h3>💡 使用提示</h3>
          <ul>
            <li>点击「打开工具」按钮在新标签页中访问该工具</li>
            <li>收藏工具后可在「我的工具」页面快速访问</li>
            <li>该工具由第三方提供，使用时请遵守相关服务条款</li>
          </ul>
        </div>
      </div>
    </div>
  );
}