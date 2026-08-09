import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTools } from '@/hooks/useTools';
import { ToolCard } from '@/components/ToolCard';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { api, type PopularTool } from '@/api/client';

function AnimatedNumber({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - start) / duration, 1);
      setN(Math.round(p * value));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{n}</>;
}

export function HomePage() {
  const navigate = useNavigate();
  const { tools, loading, categories, getToolsByCategory } = useTools();
  const [popularItems, setPopularItems] = useState<PopularTool[]>([]);

  const devTools = getToolsByCategory('dev').slice(0, 9);
  const aiTools = getToolsByCategory('ai');
  const funTools = getToolsByCategory('fun');

  useEffect(() => {
    api.getPopularTools(6)
      .then(setPopularItems)
      .catch(() => {});
  }, []);

  // Cross-reference popular IDs with actual tools
  const popularTools = popularItems
    .map(p => tools.find(t => t.id === p.id))
    .filter(Boolean)
    .slice(0, 6);

  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero__blob hero__blob--1 animate-blob" aria-hidden="true" />
        <div className="hero__blob hero__blob--2 animate-blob" aria-hidden="true" />
        <div className="container hero__inner">
          <div className="hero__badge animate-fade-in-down">
            🛠️ 持续更新 · 越用越强
          </div>
          <h1 className="hero__title animate-fade-in-up stagger-1">
            你的工具，
            <span className="hero__highlight">你做主</span>
          </h1>
          <p className="hero__subtitle animate-fade-in-up stagger-2">
            一站式在线工具箱，集成开发工具、AI 大模型导航与趣味工具，
            <br />
            让每一次开发都更高效。
          </p>
          <div className="hero__actions animate-fade-in-up stagger-3">
            <button
              className="btn btn-primary btn-lg"
              onClick={() => navigate('/explore')}
            >
              🔍 探索全部工具
            </button>
            <button
              className="btn btn-secondary btn-lg"
              onClick={() => navigate('/my-tools')}
            >
              ⭐ 我的收藏
            </button>
          </div>

          {/* Stats */}
          <div className="hero__stats animate-fade-in-up stagger-4">
            <div className="hero__stat">
              <span className="hero__stat-value"><AnimatedNumber value={tools.length} />+</span>
              <span className="hero__stat-label">在线工具</span>
            </div>
            <div className="hero__stat">
              <span className="hero__stat-value"><AnimatedNumber value={categories.length} /></span>
              <span className="hero__stat-label">工具分类</span>
            </div>
            <div className="hero__stat">
              <span className="hero__stat-value">100%</span>
              <span className="hero__stat-label">免费使用</span>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Tools */}
      {popularTools.length >= 3 && (
        <section className="section">
          <div className="container">
            <div className="section-header">
              <h2 className="section-title">🔥 热门工具</h2>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                根据使用次数排行
              </span>
            </div>
            <div className="grid grid-cols-3">
              {popularTools.map((tool, i) => {
                const stat = popularItems.find(p => p.id === tool!.id);
                return (
                  <div key={tool!.id} style={{ position: 'relative' }}>
                    <ToolCard tool={tool!} index={i} />
                    {stat && (
                      <span className="tool-card__rank">
                        {stat.total >= 1000 ? (stat.total / 1000).toFixed(1) + 'k' : stat.total} 次
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Development Tools */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">💻 开发工具</h2>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate('/explore?category=dev')}
            >
              查看全部 →
            </button>
          </div>
          {loading ? (
            <div className="tool-grid__loading">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <div className="grid grid-cols-3">
              {devTools.map((tool, i) => (
                <ToolCard key={tool.id} tool={tool} index={i} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* AI Models */}
      <section className="section ai-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">🤖 AI 大模型导航</h2>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate('/explore?category=ai')}
            >
              查看全部 →
            </button>
          </div>
          {loading ? (
            <div className="tool-grid__loading">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <div className="grid grid-cols-3">
              {aiTools.map((tool, i) => (
                <ToolCard key={tool.id} tool={tool} index={i} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Fun Tools */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">🎮 趣味工具</h2>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate('/explore?category=fun')}
            >
              查看全部 →
            </button>
          </div>
          {loading ? (
            <div className="tool-grid__loading">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <div className="grid grid-cols-3">
              {funTools.map((tool, i) => (
                <ToolCard key={tool.id} tool={tool} index={i} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
