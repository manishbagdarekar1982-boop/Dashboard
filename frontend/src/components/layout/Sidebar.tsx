import { NavLink } from 'react-router-dom';
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
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';

const NAV_ITEMS = [
  { to: '/',            icon: LayoutDashboard, label: 'Dashboard'   },
  { to: '/stock',       icon: LineChart,        label: 'Stock Detail' },
  { to: '/screener',    icon: ScanSearch,       label: 'Screener'     },
  { to: '/portfolio',   icon: Briefcase,        label: 'Portfolio'    },
  { to: '/watchlist',   icon: Star,             label: 'Watchlist'    },
  { to: '/news',        icon: Newspaper,        label: 'News'         },
  { to: '/compare',     icon: GitCompare,       label: 'Compare'      },
  { to: '/alerts',      icon: Bell,             label: 'Alerts'       },
  { to: '/market-map',  icon: Map,              label: 'Market Map'   },
  { to: '/heatmap',     icon: BarChart2,        label: 'Heatmap'      },
  { to: '/settings',    icon: Settings,         label: 'Settings'     },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`relative flex h-screen flex-col border-r border-slate-800 bg-slate-900 transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-slate-800 px-4">
        <BarChart2 className="h-6 w-6 shrink-0 text-blue-500" />
        {!collapsed && (
          <span className="text-lg font-bold text-white tracking-tight">StockAsk</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400 font-medium'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-16 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-400 hover:text-white"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>
    </aside>
  );
}
