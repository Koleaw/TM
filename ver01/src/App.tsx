import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import TodayPage from "./pages/TodayPage";
import WeekPage from "./pages/WeekPage";
import TaskPage from "./pages/TaskPage";
import TimePage from "./pages/TimePage";
import AnalyticsPage from "./pages/AnalyticsPage";
import ReviewPage from "./pages/ReviewPage";
import BackupPage from "./pages/BackupPage";
import ManagePage from "./pages/ManagePage";
import SettingsPage from "./pages/SettingsPage";

function NavLink({ to, label }: { to: string; label: string }) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link
      to={to}
      className={
        "rounded-lg px-3 py-2 text-sm border " +
        (active
          ? "bg-slate-50 text-slate-950 border-slate-50"
          : "bg-slate-900 text-slate-200 border-slate-800 hover:bg-slate-800")
      }
    >
      {label}
    </Link>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl p-3">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="text-lg font-semibold">TM Archangel</div>
          <div className="flex flex-wrap gap-2">
            <NavLink to="/today" label="Today" />
            <NavLink to="/week" label="Планы" />
            <NavLink to="/time" label="Time" />
            <NavLink to="/analytics" label="Analytics" />
            <NavLink to="/review" label="Review" />
            <NavLink to="/manage" label="Manage" />
            <NavLink to="/backup" label="Backup" />
            <NavLink to="/settings" label="Settings" />
          </div>
        </div>

        <div className="mt-3">
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<TodayPage />} />
            <Route path="/week" element={<WeekPage />} />
            <Route path="/task/:id" element={<TaskPage />} />
            <Route path="/time" element={<TimePage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/manage" element={<ManagePage />} />
            <Route path="/backup" element={<BackupPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
