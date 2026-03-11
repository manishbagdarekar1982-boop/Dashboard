"use client";

import { useRef, useState, useEffect, useMemo, type KeyboardEvent } from 'react';
import { Search, Clock, X, Loader2 } from 'lucide-react';
import { useAllSymbols } from '@/hooks/useCompanies';
import { useStockStore } from '@/store/stockStore';

const MAX_RESULTS = 12;

export function StockSearch() {
  const { selectedSymbol, setSymbol, recentSymbols } = useStockStore();
  const { data: allSymbols = [], isLoading } = useAllSymbols();

  const [query, setQuery]            = useState('');
  const [open, setOpen]              = useState(false);
  const [highlightIdx, setHighlight] = useState(0);
  const inputRef  = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const upperQuery = query.trim().toUpperCase();

  const filtered: string[] = useMemo(
    () => upperQuery.length === 0
      ? []
      : allSymbols.filter((s) => s.includes(upperQuery)).slice(0, MAX_RESULTS),
    [upperQuery, allSymbols],
  );

  const showRecent  = query.length === 0 && recentSymbols.length > 0;
  const displayList = showRecent ? recentSymbols : filtered;

  function select(symbol: string) {
    setSymbol(symbol);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((i) => Math.min(i + 1, displayList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && displayList[highlightIdx]) {
      select(displayList[highlightIdx]);
    } else if (e.key === 'Escape') {
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  useEffect(() => setHighlight(0), [displayList.length]);

  return (
    <div ref={wrapperRef} className="relative w-72">
      <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 dark:border-slate-600 dark:bg-slate-800">
        {isLoading
          ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
          : <Search className="h-4 w-4 shrink-0 text-gray-400" />
        }
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none dark:text-white dark:placeholder-gray-500"
          placeholder={selectedSymbol || 'Search symbol…'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
        />
        {query && (
          <button
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setQuery(''); setOpen(true); inputRef.current?.focus(); }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && displayList.length > 0 && (
        <div className="absolute top-full z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {showRecent && (
            <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
              <Clock className="h-3 w-3" /> Recent
            </div>
          )}
          {displayList.map((symbol, i) => (
            <button
              key={symbol}
              className={`flex w-full items-center px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                i === highlightIdx ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-slate-700'
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(symbol)}
              onMouseEnter={() => setHighlight(i)}
            >
              {symbol}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
