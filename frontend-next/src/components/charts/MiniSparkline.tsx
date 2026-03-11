"use client";

import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface MiniSparklineProps {
  data: { value: number }[];
  color: string;
  width?: number;
  height?: number;
}

export function MiniSparkline({ data, color, width = 80, height = 28 }: MiniSparklineProps) {
  if (data.length < 2) return null;

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
