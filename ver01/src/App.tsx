import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import TodayPage from "./pages/TodayPage";
import WeekPage from "./pages/WeekPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import TimePage from "./pages/TimePage";
import ManagePage from "./pages/ManagePage";
import TaskPage from "./pages/TaskPage";

type Tab = {
  to: string;
  label: string;
  short: string;
  icon: JSX.Element;
};

function IconToday() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16" />
      <path d="M7 3v4" />
      <path d="M17 3v4" />
      <path d="M6 11h4" />
      <path d="M6 15h8" />
      <path d="M6 19h6" />
      <path d="M5 5h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
    </svg>
  );
}
function IconWeek() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16" />
      <path d="M4 10h16" />
      <path d="M4 14h16" />
      <path d="M4 18h16" />
      <path d="M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    </svg>
  );
}
function IconAnalytics() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 17v-6" />
      <path d="M12 17V7" />
      <path d="M16 17v-3" />
    </svg>
  );
}
function IconTime() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 8v5l3 2" />
      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </svg>
  );
}
function IconManage() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 1v2" />
      <path d="M12 21v2" />
      <path d="M4.2 4.2l1.4 1.4" />
      <path d="M18.4 18.4l1.4 1.4" />
      <path d="M1 12h2" />
      <path d="M21 12h2" />
      <path d="M4.2 19.8l1.4-1.4" />
      <path d="M18.4 5.6l1.4-1.4" />
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
    </svg>
  );
}

const TABS: Tab[] = [
  { to: "/today", label: "Today", short: "Today", icon: <IconToday /> },
  { to: "/week", label: "Week", short: "Week", icon: <IconWeek /> },
  { to: "/analytics", label: "Analytics", short: "Stats", icon: <IconAnalytics /> },
  { to: "/time", label: "Time", short: "Time", icon: <IconTime /> },
  { to: "/manage", label: "Manage", short: "Manage", icon: <IconManage /> }
];

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function usePageTitle() {
  const { pathname } = useLocation();

  if (pathname.startsWith("/task/")) return "Task";
  const found = TABS.find((t) => pathname === t.to || pathname.startsWith(t.to + "/"));
  return found?.label ?? "TM";
}

function Shell() {
  const title = usePageTitle();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-3 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-slate-400">Time Management</div>
            <div className="text-base font-semibold truncate">{title}</div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) =>
                  cx(
                    "px-3 py-2 rounded-lg text-sm border",
                    isActive
                      ? "bg-slate-50 text-slate-950 border-slate-50 font-semibold"
                      : "bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-900/70"
                  )
                }
              >
                <span className="inline-flex items-center gap-2">
                  <span className="text-slate-500">{t.icon}</span>
                  {t.label}
                </span>
              </NavLink>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-3 py-4 pb-24 md:pb-6">
        <Outlet />
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-800 bg-slate-950/90 backdrop-blur md:hidden">
        <div className="mx-auto max-w-6xl px-2 py-2 grid grid-cols-5 gap-1">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                cx(
                  "rounded-xl px-2 py-2 text-center text-xs border",
                  isActive ? "bg-slate-50 text-slate-950 border-slate-50 font-semibold" : "bg-slate-900 border-slate-800 text-slate-200"
                )
              }
            >
              <div className="flex flex-col items-center gap-1">
                {t.icon}
                <div className="leading-none">{t.short}</div>
              </div>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function NotFound() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
      <div className="text-lg font-semibold">404</div>
      <div className="text-sm text-slate-400 mt-1">Страница не найдена.</div>
      <div className="mt-3">
        <NavLink
          to="/today"
          className="inline-flex px-4 py-2 rounded-lg bg-slate-50 text-slate-950 text-sm font-semibold"
        >
          На Today
        </NavLink>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Navigate to="/today" replace />} />

        <Route path="/today" element={<TodayPage />} />
        <Route path="/week" element={<WeekPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/time" element={<TimePage />} />
        <Route path="/manage" element={<ManagePage />} />

        <Route path="/task/:id" element={<TaskPage />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
