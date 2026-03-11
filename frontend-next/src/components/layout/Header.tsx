"use client";

import { Sun, Moon } from 'lucide-react';
import { StockSearch } from '@/components/forms/StockSearch';
import { useStockStore } from '@/store/stockStore';
import { useThemeStore } from '@/store/themeStore';

export function Header() {
  const { selectedSymbol } = useStockStore();
  const { theme, toggleTheme } = useThemeStore();

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-gray-900 dark:text-white">
          {selectedSymbol || 'Select a symbol'}
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <StockSearch />
        <div className="h-6 w-px bg-gray-200 dark:bg-slate-700" />
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-xs text-gray-500 dark:text-gray-400">Live</span>
        </div>
      </div>
    </header>
  );
}
