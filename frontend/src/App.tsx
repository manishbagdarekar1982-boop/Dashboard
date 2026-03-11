import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Dashboard } from './pages/Dashboard';
import { MarketMap } from './pages/MarketMap';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center p-10">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">{title}</h2>
        <p className="mt-2 text-slate-400">Coming in the next phase.</p>
      </div>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-white">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/"           element={<Dashboard />} />
            <Route path="/stock"      element={<PlaceholderPage title="Stock Detail" />} />
            <Route path="/screener"   element={<PlaceholderPage title="Stock Screener" />} />
            <Route path="/portfolio"  element={<PlaceholderPage title="Portfolio" />} />
            <Route path="/watchlist"  element={<PlaceholderPage title="Watchlist" />} />
            <Route path="/news"       element={<PlaceholderPage title="News Feed" />} />
            <Route path="/compare"    element={<PlaceholderPage title="Compare Stocks" />} />
            <Route path="/alerts"     element={<PlaceholderPage title="Alerts" />} />
            <Route path="/heatmap"    element={<PlaceholderPage title="Market Heatmap" />} />
            <Route path="/market-map" element={<MarketMap />} />
            <Route path="/settings"   element={<PlaceholderPage title="Settings" />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
