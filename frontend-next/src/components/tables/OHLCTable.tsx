"use client";

import { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import type { OHLCPoint } from '@/types/ohlc';
import { useStockStore } from '@/store/stockStore';

interface OHLCTableProps {
  data: OHLCPoint[];
}

function fmt(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtVol(n: number) {
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} K`;
  return n.toLocaleString('en-IN');
}

export function OHLCTable({ data }: OHLCTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const { selectedSymbol } = useStockStore();

  const enriched = useMemo(() => {
    return data.map((row, i) => {
      const prev = data[i + 1];
      const change = prev ? row.close - prev.close : 0;
      const changePct = prev ? (change / prev.close) * 100 : 0;
      return { ...row, change, changePct };
    });
  }, [data]);

  const columns = useMemo<ColumnDef<(typeof enriched)[0]>[]>(
    () => [
      { accessorKey: 'date',      header: 'Date',     size: 110 },
      {
        accessorKey: 'open',
        header: 'Open',
        cell: (i) => fmt(i.getValue<number>()),
      },
      {
        accessorKey: 'high',
        header: 'High',
        cell: (i) => <span className="text-green-600 dark:text-green-400">{fmt(i.getValue<number>())}</span>,
      },
      {
        accessorKey: 'low',
        header: 'Low',
        cell: (i) => <span className="text-red-600 dark:text-red-400">{fmt(i.getValue<number>())}</span>,
      },
      {
        accessorKey: 'close',
        header: 'Close',
        cell: (i) => <span className="font-semibold">{fmt(i.getValue<number>())}</span>,
      },
      {
        accessorKey: 'volume',
        header: 'Volume',
        cell: (i) => fmtVol(i.getValue<number>()),
      },
      {
        accessorKey: 'change',
        header: 'Change',
        cell: (i) => {
          const v = i.getValue<number>();
          return (
            <span className={v >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
              {v >= 0 ? '+' : ''}{fmt(v)}
            </span>
          );
        },
      },
      {
        accessorKey: 'changePct',
        header: 'Change %',
        cell: (i) => {
          const v = i.getValue<number>();
          return (
            <span className={v >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
              {v >= 0 ? '+' : ''}{v.toFixed(2)}%
            </span>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: enriched,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  });

  async function exportToExcel() {
    const XLSX = await import('xlsx');
    const rows = enriched.map((r) => ({
      Date: r.date,
      Open: r.open,
      High: r.high,
      Low: r.low,
      Close: r.close,
      Volume: r.volume,
      Change: r.change,
      'Change %': Number(r.changePct.toFixed(2)),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'OHLC');
    const fileName = `${selectedSymbol || 'OHLC'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-gray-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="cursor-pointer select-none px-4 py-3 text-left font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === 'asc'  && <ChevronUp   className="h-3.5 w-3.5" />}
                      {h.column.getIsSorted() === 'desc' && <ChevronDown  className="h-3.5 w-3.5" />}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, idx) => (
              <tr
                key={row.id}
                className={`border-b border-gray-100 transition-colors hover:bg-blue-50/50 dark:border-slate-800 dark:hover:bg-blue-900/30 ${
                  idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-gray-50/50 dark:bg-slate-800/50'
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-2.5 text-gray-700 dark:text-gray-300">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination + Export */}
      <div className="flex shrink-0 items-center justify-between text-sm text-gray-500 dark:text-gray-400">
        <span>
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} &nbsp;·&nbsp;{' '}
          {enriched.length.toLocaleString()} rows
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={exportToExcel}
            title="Export to Excel"
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-slate-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-slate-700"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
