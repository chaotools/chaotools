import { useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTools } from '@/hooks/useTools';
import { useFavorites } from '@/hooks/useFavorites';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { rememberRecentTool } from '@/hooks/useRecentTools';

export function ToolDetailPage() {
  const { toolId } = useParams<{ toolId: string }>();
  const navigate = useNavigate();
  const { getToolById, loading, error, categories } = useTools();
  const { savedIds, toggleSave } = useFavorites();

  const tool = useMemo(() => (toolId ? getToolById(toolId) : undefined), [toolId, getToolById]);
  const isSaved = useMemo(() => savedIds.includes(toolId ?? ''), [savedIds, toolId]);

  const categoryName = useCallback(
    (catId: string) => categories.find((category) => category.id === catId)?.name ?? catId,
    [categories]
  );

  const handleToggleSave = useCallback(() => {
    if (toolId) void toggleSave(toolId);
  }, [toolId, toggleSave]);

  const handleOpen = useCallback(() => {
    if (!tool?.tech.entry) return;
    rememberRecentTool(tool.id);
    window.open(tool.tech.entry, '_blank', 'noopener,noreferrer');
  }, [tool]);

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

  if (error) {
    return (
      <div className="tool-detail-page">
        <div className="container section text-center">
          <div className="card p-8 narrow-card">
            <div className="tool-detail__status-mark" aria-hidden="true">!</div>
            <h2>加载失败</h2>
            <p className="text-muted">{error}</p>
            <button className="btn btn-primary mt-4" onClick={() => navigate(-1)}>返回</button>
          </div>
        </div>
      </div>
    );
  }

  if (!tool) {
    return (
      <div className="tool-detail-page">
        <div className="container section text-center">
          <div className="card p-8 narrow-card">
            <div className="tool-detail__status-mark" aria-hidden="true">?</div>
            <h2>工具未找到</h2>
            <p className="text-muted">该工具可能已被移除或链接无效。</p>
            <Link to="/explore" className="btn btn-primary mt-4">浏览其他工具</Link>
          </div>
        </div>
      </div>
    );
  }

  const iconSrc = tool.thumbnail || tool.icon;
  const isEmoji = iconSrc ? /^\p{Emoji}/u.test(iconSrc) : true;
  const isExternal = /^https?:\/\//i.test(tool.tech.entry || '');
  const primaryCat = tool.categories[0];
  const catModifier = ['dev', 'ai', 'fun'].includes(primaryCat) ? 'tool-detail__hero--' + primaryCat : '';

  return (
    <div className="tool-detail-page">
      <div className="container section">
        <nav className="breadcrumb" aria-label="面包屑导航">
          <Link to="/">首页</Link>
          <span aria-hidden="true">/</span>
          <Link to="/explore">探索</Link>
          <span aria-hidden="true">/</span>
          <span className="breadcrumb__current">{tool.name}</span>
        </nav>

        <article className={'tool-detail__hero card ' + catModifier}>
          <div className="tool-detail__hero-content">
            <div className={'tool-detail__icon ' + (isEmoji ? 'tool-detail__icon--emoji' : '')}>
              {isEmoji ? (
                <span className="tool-detail__emoji" aria-hidden="true">{iconSrc || 'CT'}</span>
              ) : (
                <img src={iconSrc} alt="" className="tool-detail__img" width={72} height={72} />
              )}
            </div>

            <div className="tool-detail__info">
              <p className="tool-detail__eyebrow">{isExternal ? '外部服务' : '在线工具'}</p>
              <h1 className="tool-detail__name">{tool.name}</h1>
              <p className="tool-detail__desc">{tool.description}</p>

              <div className="tool-detail__categories" aria-label="工具分类">
                {tool.categories.map((catId) => (
                  <Link key={catId} to={'/explore?category=' + catId} className="badge">
                    {categoryName(catId)}
                  </Link>
                ))}
              </div>

              <div className="tool-detail__tags" aria-label="工具标签">
                {tool.tags.map((tag) => <span key={tag} className="badge">{tag}</span>)}
              </div>

              <div className="tool-detail__meta">
                <span>{isExternal ? '第三方网站' : 'Chaotools 工具'}</span>
                {tool.tech.version && <span>版本 {tool.tech.version}</span>}
              </div>
            </div>

            <div className="tool-detail__actions">
              <button className="btn btn-primary btn-lg" onClick={handleOpen}>打开工具</button>
              <button
                className={'btn btn-lg ' + (isSaved ? 'btn-secondary' : 'btn-ghost')}
                onClick={handleToggleSave}
                aria-pressed={isSaved}
              >
                {isSaved ? '已收藏' : '收藏工具'}
              </button>
            </div>
          </div>
        </article>

        <section className="tool-detail__tips card mt-8" aria-labelledby="tool-usage-title">
          <h2 id="tool-usage-title">使用说明</h2>
          <ul>
            <li>点击“打开工具”将在新标签页中访问该工具。</li>
            <li>收藏后可在“我的工具”页面快速访问。</li>
            <li>{isExternal ? '该服务由第三方提供，请遵守对应服务条款。' : '工具在浏览器中运行，请根据页面提示处理输入内容。'}</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

