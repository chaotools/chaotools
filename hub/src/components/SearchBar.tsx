import { memo, useCallback, useEffect, useRef } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
}

export const SearchBar = memo<SearchBarProps>(function SearchBar({
  value,
  onChange,
  placeholder = '搜索工具...',
  autoFocus = false,
  onSubmit,
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  }, [onChange]);

  const handleClear = useCallback(() => {
    onChange('');
    inputRef.current?.focus();
  }, [onChange]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') handleClear();
    if (event.key === 'Enter') onSubmit?.();
  }, [handleClear, onSubmit]);

  return (
    <div className="search-bar" role="search">
      <span className="search-bar__icon" aria-hidden="true">⌕</span>
      <input
        ref={inputRef}
        type="search"
        className="search-bar__input"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        aria-label="搜索工具"
        autoComplete="off"
      />
      {value && (
        <button className="search-bar__clear" onClick={handleClear} aria-label="清除搜索" title="清除">
          ×
        </button>
      )}
    </div>
  );
});
