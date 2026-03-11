import { BarChart2 } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
}

export function EmptyState({
  title = 'No data available',
  description = 'Select a symbol and date range to view chart data.',
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <BarChart2 className="h-16 w-16 text-slate-600" />
      <div>
        <p className="text-lg font-semibold text-slate-300">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}
