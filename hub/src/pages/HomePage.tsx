import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTools } from '@/hooks/useTools';
import { useFavorites } from '@/hooks/useFavorites';
import { useRecentTools } from '@/hooks/useRecentTools';
import { ToolCard } from '@/components/ToolCard';
import { ServiceRow } from '@/components/ServiceRow';
import { SearchBar } from '@/components/SearchBar';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { api, type PopularTool } from '@/api/client';

export function HomePage() {
  const navigate = useNavigate();
  const { tools, loading, categories, getToolsByCategory } = useTools();
  const { savedIds, toggleSave } = useFavorites();
  const { recentTools } = useRecentTools(tools);
  const [search, setSearch] = useState('');
  const [popularItems, setPopularItems] = useState<PopularTool[]>([]);

  useEffect(() => {
    api.getPopularTools(6).then(setPopularItems).catch(() => {});
  }, []);

  const popularTools = useMemo(() => {
    const ranked = popularItems.map((item) => tools.find((tool) => tool.id === item.id)).filter(Boolean);
    return (ranked.length ? ranked : tools).slice(0, 6) as typeof tools;
  }, [popularItems, tools]);
  const featuredIds = useMemo(() => new Set(popularTools.map((tool) => tool.id)), [popularTools]);
  const savedTools = useMemo(() => tools.filter((tool) => savedIds.includes(tool.id)).slice(0, 6), [savedIds, tools]);
  const aiTools = useMemo(() => getToolsByCategory('ai'), [getToolsByCategory]);
  const visibleCategories = useMemo(() => categories.filter((category) => category.id !== 'ai'), [categories]);

  const submitSearch = () => {
    const query = search.trim();
    navigate(query ? `/explore?q=${encodeURIComponent(query)}` : '/explore');
  };

  return (
    <div className="home-page">
      <section className="home-intro">
        <div className="container home-intro__inner">
          <p className="eyebrow">CHAOTOOLS / 工具工作台</p>
          <h1>找到工具，马上开始。</h1>
          <p className="home-intro__subtitle">开发、字幕、媒体和日常小工具，打开即用。</p>
          <SearchBar value={search} onChange={setSearch} onSubmit={submitSearch} placeholder="搜索工具名称、功能或标签" />
          <div className="home-category-nav" aria-label="工具分类">
            <button onClick={() => navigate('/explore')}>全部工具</button>
            {visibleCategories.map((category) => (
              <button key={category.id} onClick={() => navigate(`/explore?category=${category.id}`)}>{category.name}</button>
            ))}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="container home-loading"><LoadingSpinner size="lg" /></div>
      ) : (
        <>
          {recentTools.length > 0 && (
            <section className="home-section">
              <div className="container">
                <div className="home-section__header"><div><p className="eyebrow">RECENT</p><h2>最近使用</h2></div></div>
                <div className="grid grid-cols-3">{recentTools.map((tool) => <ToolCard key={tool.id} tool={tool} />)}</div>
              </div>
            </section>
          )}

          {savedTools.length > 0 && (
            <section className="home-section home-section--quiet">
              <div className="container">
                <div className="home-section__header"><div><p className="eyebrow">SAVED</p><h2>收藏工具</h2></div><button className="text-link" onClick={() => navigate('/my-tools')}>查看全部</button></div>
                <div className="grid grid-cols-3">{savedTools.map((tool) => <ToolCard key={tool.id} tool={tool} isSaved onToggleSave={toggleSave} />)}</div>
              </div>
            </section>
          )}

          <section className="home-section">
            <div className="container">
              <div className="home-section__header"><div><p className="eyebrow">SELECTED</p><h2>常用工具</h2></div><button className="text-link" onClick={() => navigate('/explore')}>浏览全部</button></div>
              <div className="grid grid-cols-3">{popularTools.map((tool) => <ToolCard key={tool.id} tool={tool} isSaved={savedIds.includes(tool.id)} onToggleSave={toggleSave} />)}</div>
            </div>
          </section>

          {visibleCategories.map((category) => {
            const sectionTools = getToolsByCategory(category.id).filter((tool) => !featuredIds.has(tool.id)).slice(0, 6);
            if (!sectionTools.length) return null;
            return (
              <section className="home-section home-section--quiet" key={category.id}>
                <div className="container">
                  <div className="home-section__header"><div><p className="eyebrow">CATEGORY</p><h2>{category.name}</h2></div><button className="text-link" onClick={() => navigate(`/explore?category=${category.id}`)}>查看全部</button></div>
                  <div className="grid grid-cols-3">{sectionTools.map((tool) => <ToolCard key={tool.id} tool={tool} isSaved={savedIds.includes(tool.id)} onToggleSave={toggleSave} />)}</div>
                </div>
              </section>
            );
          })}

          {aiTools.length > 0 && (
            <section className="home-section">
              <div className="container">
                <div className="home-section__header"><div><p className="eyebrow">SERVICES</p><h2>AI 服务</h2></div><button className="text-link" onClick={() => navigate('/explore?category=ai')}>查看全部</button></div>
                <div className="service-list">{aiTools.slice(0, 8).map((tool) => <ServiceRow key={tool.id} tool={tool} isSaved={savedIds.includes(tool.id)} onToggleSave={toggleSave} />)}</div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
