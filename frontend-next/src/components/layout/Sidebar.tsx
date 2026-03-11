"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  LineChart,
  ScanSearch,
  Briefcase,
  Star,
  Newspaper,
  GitCompare,
  Bell,
  BarChart2,
  Map,
  PieChart,
  Settings,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Landmark,
  Activity,
  TrendingUp,
  Globe,
} from 'lucide-react';
import { useState } from 'react';

const NAV_ITEMS = [
  { to: '/',            icon: LayoutDashboard, label: 'Dashboard'   },
  { to: '/market-overview', icon: LayoutGrid,   label: 'Market Overview' },
  { to: '/earnings',   icon: TrendingUp,       label: 'Earnings Analysis' },
  { to: '/stock',       icon: LineChart,        label: 'Stock Detail' },
  { to: '/screener',    icon: ScanSearch,       label: 'Screener'     },
  { to: '/portfolio',   icon: Briefcase,        label: 'Portfolio'    },
  { to: '/watchlist',   icon: Star,             label: 'Watchlist'    },
  { to: '/news',        icon: Newspaper,        label: 'News'         },
  { to: '/compare',     icon: GitCompare,       label: 'Compare'      },
  { to: '/alerts',      icon: Bell,             label: 'Alerts'       },
  { to: '/market-map',  icon: Map,              label: 'Market Map'   },
  { to: '/mutual-funds',        icon: Landmark, label: 'Mutual Funds'  },
  { to: '/capital-composition', icon: PieChart, label: 'Capital Composition' },
  { to: '/market-breadth', icon: Activity, label: 'Market Breadth' },
  { to: '/universe',    icon: Globe,            label: 'Universe'     },
  { to: '/heatmap',     icon: BarChart2,        label: 'Heatmap'      },
  { to: '/settings',    icon: Settings,         label: 'Settings'     },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      className={`relative flex h-screen flex-col border-r border-gray-200 bg-white transition-all duration-200 dark:border-slate-800 dark:bg-slate-900 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-gray-200 px-4 dark:border-slate-800">
        <BarChart2 className="h-6 w-6 shrink-0 text-blue-600 dark:text-blue-500" />
        {!collapsed && (
          <span className="text-lg font-bold text-gray-900 tracking-tight dark:text-white">StockAsk</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
          const isActive = to === '/' ? pathname === '/' : pathname.startsWith(to);
          return (
            <Link
              key={to}
              href={to}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-600 font-medium dark:bg-blue-600/20 dark:text-blue-400'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-white'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-16 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-400 shadow-sm hover:text-gray-700 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-500 dark:hover:text-white"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>
    </aside>
  );
}
