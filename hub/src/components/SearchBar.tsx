import { memo, useCallback, useRef, useEffect } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export const SearchBar = memo<SearchBarProps>(function SearchBar({
  value,
  onChange,
  placeholder = '搜索工具...',
  autoFocus = false,
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    onChange('');
    inputRef.current?.focus();
  }, [onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClear();
      }
    },
    [handleClear]
  );

  return (
    <div className="search-bar" role="search">
      <span className="search-bar__icon" aria-hidden="true">
        🔍
      </span>
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
        <button
          className="search-bar__clear"
          onClick={handleClear}
          aria-label="清除搜索"
          title="清除"
        >
          ✕
        </button>
      )}
    </div>
  );
});
