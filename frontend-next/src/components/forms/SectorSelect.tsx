"use client";

import { useSectors } from '@/api/shareholding';

interface SectorSelectProps {
  value: string | null;
  onSelect: (sector: string | null) => void;
}

export function SectorSelect({ value, onSelect }: SectorSelectProps) {
  const { data: sectors, isLoading } = useSectors();

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onSelect(e.target.value || null)}
      disabled={isLoading}
      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors
        focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500
        disabled:cursor-not-allowed disabled:opacity-50
        dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-400"
    >
      <option value="">
        {isLoading ? 'Loading sectors…' : 'Select a sector'}
      </option>
      {sectors?.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
