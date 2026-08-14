import { memo, useCallback } from 'react';
import type { Category } from '@chaotools/types';

interface CategoryFilterProps {
  categories: Category[];
  activeCategory: string | null;
  onChange: (categoryId: string | null) => void;
}

export const CategoryFilter = memo<CategoryFilterProps>(function CategoryFilter({
  categories,
  activeCategory,
  onChange,
}) {
  const handleClick = useCallback((categoryId: string | null) => onChange(categoryId), [onChange]);

  return (
    <div className="category-filter" role="radiogroup" aria-label="工具分类筛选">
      <button
        className={`category-filter__btn ${activeCategory === null ? 'category-filter__btn--active' : ''}`}
        onClick={() => handleClick(null)}
        role="radio"
        aria-checked={activeCategory === null}
      >
        全部
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          className={`category-filter__btn ${activeCategory === category.id ? 'category-filter__btn--active' : ''}`}
          data-cat={category.id}
          onClick={() => handleClick(category.id)}
          role="radio"
          aria-checked={activeCategory === category.id}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
});
