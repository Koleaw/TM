import { useMemo } from "react";
import { todayYMD, useAppState, ymdAddDays } from "../data/db";

export default function AnalyticsPage() {
  const s = useAppState();
  const today = todayYMD();

  const last7 = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => ymdAddDays(today, -6 + i));
    const totals: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
    for (const l of s.timeLogs) {
      const d = new Date(l.startedAt);
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (totals[ymd] !== undefined) totals[ymd] += l.minutes;
    }
    return { days, totals };
  }, [s.timeLogs, today]);

  const byTag = useMemo(() => {
    const taskById = new Map(s.tasks.map((t) => [t.id, t]));
    const totals: Record<string, number> = {};
    for (const l of s.timeLogs) {
      const t = l.taskId ? taskById.get(l.taskId) : null;
      const tags = t?.tags?.length ? t.tags : ["(no-tag)"];
      for (const tag of tags) totals[tag] = (totals[tag] ?? 0) + l.minutes;
    }
    const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    return rows.slice(0, 20);
  }, [s.timeLogs, s.tasks]);

  const doneCount = s.tasks.filter((t) => t.status === "done").length;

  return (
    <div className="grid gap-3">
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="text-lg font-semibold">Analytics</div>
        <div className="mt-1 text-sm text-slate-400">
          Tasks: {s.tasks.length} • Done: {doneCount} • Logs: {s.timeLogs.length}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="font-semibold">Last 7 days (minutes)</div>
          <div className="mt-2 grid gap-2">
            {last7.days.map((d) => (
              <div
                key={d}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              >
                <div className="text-slate-300">{d}</div>
                <div className="font-semibold">{last7.totals[d]}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="font-semibold">Top tags</div>
          <div className="mt-2 grid gap-2">
            {byTag.length === 0 ? (
              <div className="text-sm text-slate-400">Нет данных</div>
            ) : (
              byTag.map(([tag, min]) => (
                <div
                  key={tag}
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
                >
                  <div className="truncate">{tag}</div>
                  <div className="font-semibold">{min}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
