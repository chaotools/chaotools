import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTools } from '@/hooks/useTools';
import { useDebounce } from '@/hooks/useDebounce';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { ToolGrid } from '@/components/ToolGrid';
import { SearchBar } from '@/components/SearchBar';
import { CategoryFilter } from '@/components/CategoryFilter';
import type { SavedTool } from '@chaotools/types';

export function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { tools, loading, error, categories } = useTools();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [savedTools, setSavedTools] = useLocalStorage<SavedTool[]>('chaotools-saved', []);

  const activeCategory = searchParams.get('category');

  const setCategory = useCallback(
    (categoryId: string | null) => {
      setSearchParams(categoryId ? { category: categoryId } : {});
    },
    [setSearchParams]
  );

  const savedIds = useMemo(() => savedTools.map((s) => s.toolId), [savedTools]);

  const filteredTools = useMemo(() => {
    let result = activeCategory
      ? tools.filter((t) => t.categories.includes(activeCategory))
      : [...tools];

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }

    return result;
  }, [tools, activeCategory, debouncedSearch]);

  const handleToggleSave = useCallback(
    (toolId: string) => {
      setSavedTools((prev) => {
        const exists = prev.find((s) => s.toolId === toolId);
        if (exists) {
          return prev.filter((s) => s.toolId !== toolId);
        }
        return [...prev, { toolId, savedAt: Date.now() }];
      });
    },
    [setSavedTools]
  );

  const activeCat = categories.find((c) => c.id === activeCategory);

  return (
    <div className="explore-page">
      <div className="container section">
        {/* Page Header */}
        <div className="explore-page__header animate-fade-in-up">
          <h1>🔍 探索工具</h1>
          <p className="text-muted">
            {activeCat
              ? `${activeCat.icon} ${activeCat.name} - ${activeCat.description}`
              : '浏览全部在线工具，找到你需要的那一个'}
          </p>
        </div>

        {/* Search & Filter */}
        <div className="explore-page__controls animate-fade-in-up stagger-1">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="搜索工具名称、描述或标签..."
          />
          <CategoryFilter
            categories={categories}
            activeCategory={activeCategory}
            onChange={setCategory}
          />
        </div>

        {/* Results count */}
        {!loading && (
          <p className="explore-page__count text-muted animate-fade-in-up stagger-2">
            共找到 <strong>{filteredTools.length}</strong> 个工具
            {debouncedSearch && ` 匹配 "${debouncedSearch}"`}
            {activeCategory && ` 在 "${activeCat?.name}" 分类中`}
          </p>
        )}

        {/* Tool Grid */}
        <div className="explore-page__grid animate-fade-in-up stagger-3">
          <ToolGrid
            tools={filteredTools}
            loading={loading}
            error={error}
            savedTools={savedIds}
            onToggleSave={handleToggleSave}
            emptyMessage={
              debouncedSearch
                ? `没有找到匹配 "${debouncedSearch}" 的工具`
                : '该分类下暂无工具'
            }
          />
        </div>
      </div>
    </div>
  );
}
