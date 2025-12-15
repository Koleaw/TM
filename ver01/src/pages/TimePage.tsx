import { useMemo, useState } from "react";
import {
  deleteTimeLog,
  startTimer,
  stopTimer,
  useAppState
} from "../data/db";

export default function TimePage() {
  const s = useAppState();
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");

  const active = s.activeTimer;

  const tasks = useMemo(
    () => [...s.tasks].sort((a, b) => b.updatedAt - a.updatedAt),
    [s.tasks]
  );

  return (
    <div className="grid gap-3">
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="text-lg font-semibold">Time</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={selectedTaskId}
            onChange={(e) => setSelectedTaskId(e.target.value)}
          >
            <option value="">(без привязки к задаче)</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>

          {!active ? (
            <button
              className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950"
              onClick={() => startTimer(selectedTaskId || null)}
            >
              Start
            </button>
          ) : (
            <button
              className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950"
              onClick={() => stopTimer("")}
            >
              Stop
            </button>
          )}

          <div className="text-sm text-slate-400">
            {active ? "running…" : "idle"}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="font-semibold">Logs</div>
        <div className="mt-2 grid gap-2">
          {s.timeLogs.length === 0 ? (
            <div className="text-sm text-slate-400">Пока нет логов</div>
          ) : (
            s.timeLogs.slice(0, 200).map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2"
              >
                <div className="min-w-0">
                  <div className="text-sm">
                    {l.minutes} мин{" "}
                    <span className="text-xs text-slate-500">
                      {new Date(l.startedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    taskId: {l.taskId ?? "(none)"} {l.note ? `— ${l.note}` : ""}
                  </div>
                </div>
                <button
                  className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-800"
                  onClick={() => deleteTimeLog(l.id)}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
