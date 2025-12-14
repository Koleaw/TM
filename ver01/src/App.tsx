import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import TodayPage from "./pages/TodayPage";
import WeekPage from "./pages/WeekPage";
import ReviewPage from "./pages/ReviewPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import BackupPage from "./pages/BackupPage";
import SettingsPage from "./pages/SettingsPage";

const tabs = [
  { to: "/today", label: "Today" },
  { to: "/week", label: "Week" },
  { to: "/review", label: "Review" },
  { to: "/analytics", label: "Analytics" },
  { to: "/backup", label: "Backup" },
  { to: "/settings", label: "Settings" }
];

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-4 py-3 border-b border-slate-800 sticky top-0 bg-slate-950/90 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="font-semibold tracking-tight">TM Archangel</div>
          <div className="hidden md:flex gap-2">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) =>
                  [
                    "px-3 py-1.5 rounded-lg text-sm",
                    isActive
                      ? "bg-slate-800 text-slate-50"
                      : "text-slate-300 hover:bg-slate-900 hover:text-slate-50"
                  ].join(" ")
                }
              >
                {t.label}
              </NavLink>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-4">
        <div className="max-w-6xl mx-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<TodayPage />} />
            <Route path="/week" element={<WeekPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/backup" element={<BackupPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<div>Not found</div>} />
          </Routes>
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden border-t border-slate-800 bg-slate-950 sticky bottom-0">
        <div className="grid grid-cols-6 text-xs">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                [
                  "py-2 px-1 text-center",
                  isActive ? "text-slate-50" : "text-slate-400"
                ].join(" ")
              }
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
