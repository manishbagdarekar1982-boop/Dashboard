import { StockSearch } from '../forms/StockSearch';
import { useStockStore } from '../../store/stockStore';

export function Header() {
  const { selectedSymbol } = useStockStore();

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-800 bg-slate-900 px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-white">
          {selectedSymbol || 'Select a symbol'}
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <StockSearch />
        <div className="h-6 w-px bg-slate-700" />
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-xs text-slate-400">Live</span>
        </div>
      </div>
    </header>
  );
}
