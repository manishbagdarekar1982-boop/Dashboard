import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { Building2, TrendingUp, Calendar } from 'lucide-react';
import { useMarketStats } from '../hooks/useMarketStats';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

// ── Colour per bucket (nano → large cap) ─────────────────────────────────
const BUCKET_COLORS = ['#64748B', '#3B82F6', '#22C55E', '#F59E0B', '#8B5CF6'];

// ── Number formatters ─────────────────────────────────────────────────────
function fmtCr(cr: number): string {
  if (cr >= 1_00_000) return `₹${(cr / 1_00_000).toFixed(2)} L Cr`;
  if (cr >= 1_000)    return `₹${(cr / 1_000).toFixed(2)} K Cr`;
  return `₹${cr.toFixed(2)} Cr`;
}

// ── Tooltip dark theme styling ────────────────────────────────────────────
const tooltipStyle = {
  contentStyle: {
    backgroundColor: '#1E293B',
    border: '1px solid #475569',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#F1F5F9',
  },
  itemStyle: { color: '#94A3B8' },
  labelStyle: { color: '#F1F5F9', fontWeight: 600, marginBottom: 4 },
};

// ── Stat card ─────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'text-white',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-slate-700 bg-slate-800/50 p-5">
      <div className="rounded-lg bg-slate-700/60 p-2.5">
        <Icon className="h-5 w-5 text-slate-300" />
      </div>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className={`mt-0.5 text-2xl font-bold ${color}`}>{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

// ── Pie label renderer (simple, safe for Recharts v3) ─────────────────────
const RADIAN = Math.PI / 180;

interface PieLabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
}

function renderPieLabel({ cx, cy, midAngle, outerRadius, percent }: PieLabelProps) {
  if (percent < 0.02) return null;
  const radius = outerRadius + 16;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#CBD5E1"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize={11}
      fontWeight={600}
    >
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  );
}

// ── Custom bar tooltip formatter ──────────────────────────────────────────
function barTooltipFormatter(value: number, _name: string) {
  return [`${value.toLocaleString('en-IN')} companies`, 'Count'];
}

function pieTooltipFormatter(value: number) {
  return [fmtCr(value), 'Market Cap'];
}

// ── Main page ─────────────────────────────────────────────────────────────
export function MarketMap() {
  const { data, isLoading, error } = useMarketStats();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" label="Loading market statistics…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <div className="rounded-xl border border-red-900 bg-red-900/20 px-6 py-4 text-sm text-red-400">
          {error?.message ?? 'Failed to load market statistics.'}
        </div>
      </div>
    );
  }

  const buckets = data.buckets;
  const totalCap = data.total_market_cap_cr;

  // Add color to each bucket for the pie chart legend
  const coloredBuckets = buckets.map((b, i) => ({
    ...b,
    fill: BUCKET_COLORS[i % BUCKET_COLORS.length],
  }));

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* ── Page heading ── */}
      <div>
        <h1 className="text-2xl font-bold text-white">Market Map</h1>
        <p className="mt-1 text-sm text-slate-400">
          Market capitalisation breakdown across all listed companies
        </p>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={Building2}
          label="Total Listed Companies"
          value={data.total_symbols.toLocaleString('en-IN')}
          sub="distinct symbols in database"
          color="text-blue-400"
        />
        <StatCard
          icon={TrendingUp}
          label="Total Market Capitalisation"
          value={fmtCr(totalCap)}
          sub="sum of latest market cap per symbol"
          color="text-green-400"
        />
        <StatCard
          icon={Calendar}
          label="Data as of"
          value={data.latest_date ?? '—'}
          sub="most recent date in dataset"
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">

        {/* Bar chart — companies count per bucket (3/5 width) */}
        <div className="lg:col-span-3 rounded-xl border border-slate-700 bg-slate-800/40 p-5">
          <h2 className="mb-1 text-sm font-semibold text-white">
            No. of Companies by Market Cap
          </h2>
          <p className="mb-4 text-xs text-slate-500">Count of listed companies per market cap range</p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={coloredBuckets} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fill: '#94A3B8', fontSize: 11 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#94A3B8', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v.toLocaleString('en-IN')}
              />
              <Tooltip
                formatter={barTooltipFormatter}
                {...tooltipStyle}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={60}>
                {coloredBuckets.map((b, i) => (
                  <Cell key={b.label} fill={BUCKET_COLORS[i % BUCKET_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Legend row */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {buckets.map((b, i) => (
              <span key={b.label} className="flex items-center gap-1.5 text-xs text-slate-400">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: BUCKET_COLORS[i % BUCKET_COLORS.length] }}
                />
                {b.category}: <span className="font-medium text-white">{b.count.toLocaleString('en-IN')}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Donut chart — market cap distribution (2/5 width) */}
        <div className="lg:col-span-2 rounded-xl border border-slate-700 bg-slate-800/40 p-5">
          <h2 className="mb-1 text-sm font-semibold text-white">
            Market Cap Distribution
          </h2>
          <p className="mb-4 text-xs text-slate-500">Share of total market cap by segment</p>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={coloredBuckets}
                dataKey="total_cap_cr"
                nameKey="category"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
                label={renderPieLabel}
                labelLine={false}
              >
                {coloredBuckets.map((b, i) => (
                  <Cell key={b.label} fill={BUCKET_COLORS[i % BUCKET_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={pieTooltipFormatter}
                {...tooltipStyle}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: '#94A3B8' }}
                iconType="square"
                iconSize={10}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Summary table ── */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/40 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-white">Segment Summary</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs text-slate-400">
                <th className="px-5 py-2.5 text-left font-medium">Segment</th>
                <th className="px-5 py-2.5 text-left font-medium">Range (Cr)</th>
                <th className="px-5 py-2.5 text-right font-medium">Companies</th>
                <th className="px-5 py-2.5 text-right font-medium">% of Total</th>
                <th className="px-5 py-2.5 text-right font-medium">Market Cap</th>
                <th className="px-5 py-2.5 text-right font-medium">Cap %</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b, i) => (
                <tr key={b.label} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-3 w-3 rounded-sm shrink-0"
                        style={{ backgroundColor: BUCKET_COLORS[i % BUCKET_COLORS.length] }}
                      />
                      <span className="font-medium text-white">{b.category}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-400">{b.label}</td>
                  <td className="px-5 py-3 text-right font-medium text-white">
                    {b.count.toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-400">
                    {data.total_symbols > 0
                      ? `${((b.count / data.total_symbols) * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-green-400">
                    {fmtCr(b.total_cap_cr)}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-400">
                    {totalCap > 0
                      ? `${((b.total_cap_cr / totalCap) * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-800/60 text-xs font-semibold">
                <td className="px-5 py-3 text-slate-300" colSpan={2}>Total</td>
                <td className="px-5 py-3 text-right text-white">
                  {data.total_symbols.toLocaleString('en-IN')}
                </td>
                <td className="px-5 py-3 text-right text-slate-400">100%</td>
                <td className="px-5 py-3 text-right text-green-400">{fmtCr(totalCap)}</td>
                <td className="px-5 py-3 text-right text-slate-400">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
