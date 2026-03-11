"use client";

import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useFundamentalStore } from '@/store/fundamentalStore';
import { useFundamentalCatalog, useFundamentalTimeseries } from '@/hooks/useFundamentals';
import { FundamentalSubChart } from './FundamentalSubChart';

export function FundamentalSubChartPanel() {
  const selectedMetrics = useFundamentalStore((s) => s.selectedMetrics);
  const removeMetric = useFundamentalStore((s) => s.removeMetric);
  const { data: catalog } = useFundamentalCatalog();
  const { data: tsData, isLoading, error } = useFundamentalTimeseries();

  const catalogByKey = useMemo(() => {
    if (!catalog) return {};
    const map: Record<string, typeof catalog.metrics[number]> = {};
    for (const m of catalog.metrics) {
      map[m.key] = m;
    }
    return map;
  }, [catalog]);

  if (selectedMetrics.length === 0) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading fundamentals...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-3 text-xs text-red-500 dark:text-red-400">
        {error.message || 'Failed to load fundamental data'}
      </div>
    );
  }

  return (
    <div>
      {selectedMetrics.map((key, idx) => {
        const meta = catalogByKey[key];
        if (!meta) return null;
        const points = tsData?.metrics?.[key] ?? [];

        return (
          <FundamentalSubChart
            key={key}
            metricKey={key}
            label={meta.label}
            unit={meta.unit}
            chartType={meta.chart_type}
            data={points}
            colorIndex={idx}
            onRemove={() => removeMetric(key)}
          />
        );
      })}
    </div>
  );
}
