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
      <BarChart2 className="h-16 w-16 text-gray-300 dark:text-gray-600" />
      <div>
        <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">{title}</p>
        <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">{description}</p>
      </div>
    </div>
  );
}
