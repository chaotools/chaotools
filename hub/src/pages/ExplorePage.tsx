import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTools } from '@/hooks/useTools';
import { useDebounce } from '@/hooks/useDebounce';
import { useFavorites } from '@/hooks/useFavorites';
import { ToolGrid } from '@/components/ToolGrid';
import { ServiceRow } from '@/components/ServiceRow';
import { SearchBar } from '@/components/SearchBar';
import { CategoryFilter } from '@/components/CategoryFilter';

export function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { tools, loading, error, categories } = useTools();
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const debouncedSearch = useDebounce(search, 250);
  const { savedIds, toggleSave } = useFavorites();
  const activeCategory = searchParams.get('category');

  useEffect(() => {
    const current = searchParams.get('q') || '';
    const nextQuery = search.trim() ? debouncedSearch.trim() : '';
    if (current !== nextQuery) {
      const next = new URLSearchParams(searchParams);
      if (nextQuery) next.set('q', nextQuery); else next.delete('q');
      setSearchParams(next, { replace: true });
    }
  }, [search, debouncedSearch, searchParams, setSearchParams]);

  const setCategory = useCallback((categoryId: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (categoryId) next.set('category', categoryId); else next.delete('category');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const filteredTools = useMemo(() => {
    let result = activeCategory ? tools.filter((tool) => tool.categories.includes(activeCategory)) : [...tools];
    const query = debouncedSearch.trim().toLowerCase();
    if (query) result = result.filter((tool) => tool.name.toLowerCase().includes(query) || tool.description.toLowerCase().includes(query) || tool.tags.some((tag) => tag.toLowerCase().includes(query)));
    return result;
  }, [tools, activeCategory, debouncedSearch]);

  const regularTools = filteredTools.filter((tool) => !tool.categories.includes('ai'));
  const aiTools = filteredTools.filter((tool) => tool.categories.includes('ai'));
  const activeCat = categories.find((category) => category.id === activeCategory);
  const hasResults = filteredTools.length > 0;

  const clearFilters = () => {
    setSearch('');
    setSearchParams({});
  };

  return (
    <div className="explore-page">
      <div className="container section">
        <div className="explore-page__header">
          <p className="eyebrow">LIBRARY / {activeCat?.name || 'ALL TOOLS'}</p>
          <h1>探索工具</h1>
          <p className="text-muted">搜索一个功能，马上开始。</p>
        </div>
        <div className="explore-page__controls">
          <SearchBar value={search} onChange={setSearch} autoFocus={Boolean(searchParams.get('focus'))} placeholder="搜索工具名称、功能或标签" />
          <CategoryFilter categories={categories} activeCategory={activeCategory} onChange={setCategory} />
        </div>
        {!loading && <p className="explore-page__count text-muted">共找到 <strong>{filteredTools.length}</strong> 个工具</p>}
        {loading || error || !hasResults ? (
          <ToolGrid tools={filteredTools} loading={loading} error={error} savedTools={savedIds} onToggleSave={toggleSave} emptyMessage={debouncedSearch ? `没有找到匹配“${debouncedSearch}”的工具` : '该分类下暂无工具'} />
        ) : (
          <>
            {regularTools.length > 0 && <div className="explore-page__grid"><ToolGrid tools={regularTools} savedTools={savedIds} onToggleSave={toggleSave} /></div>}
            {aiTools.length > 0 && (
              <section className="explore-services">
                <div className="home-section__header"><div><p className="eyebrow">SERVICES</p><h2>AI 服务</h2></div></div>
                <div className="service-list">{aiTools.map((tool) => <ServiceRow key={tool.id} tool={tool} isSaved={savedIds.includes(tool.id)} onToggleSave={toggleSave} />)}</div>
              </section>
            )}
          </>
        )}
        {!loading && !error && !hasResults && <button className="btn btn-secondary explore-clear" onClick={clearFilters}>清除搜索和筛选</button>}
      </div>
    </div>
  );
}
