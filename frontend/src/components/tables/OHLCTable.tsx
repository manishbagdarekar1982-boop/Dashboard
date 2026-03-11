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
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { OHLCPoint } from '../../types/ohlc';

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
        cell: (i) => <span className="text-green-400">{fmt(i.getValue<number>())}</span>,
      },
      {
        accessorKey: 'low',
        header: 'Low',
        cell: (i) => <span className="text-red-400">{fmt(i.getValue<number>())}</span>,
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
            <span className={v >= 0 ? 'text-green-400' : 'text-red-400'}>
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
            <span className={v >= 0 ? 'text-green-400' : 'text-red-400'}>
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

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-700 bg-slate-800">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="cursor-pointer select-none px-4 py-3 text-left font-medium text-slate-400 hover:text-white"
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
                className={`border-b border-slate-800 transition-colors hover:bg-slate-800/50 ${
                  idx % 2 === 0 ? 'bg-slate-900' : 'bg-slate-900/50'
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-2.5 text-slate-300">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} &nbsp;·&nbsp;{' '}
          {enriched.length.toLocaleString()} rows
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="rounded p-1.5 hover:bg-slate-700 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="rounded p-1.5 hover:bg-slate-700 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
