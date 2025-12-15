import { useMemo, useState } from "react";
import {
  getWeekStart,
  todayYMD,
  useAppState,
  weekDays,
  ymdAddDays
} from "../data/db";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtYMDru(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("ru-RU", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function fmtMinutes(min: number) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h <= 0) return `${r} мин`;
  if (r === 0) return `${h} ч`;
  return `${h} ч ${r} мин`;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function percent(x: number) {
  return `${Math.round(clamp01(x) * 100)}%`;
}

type RowDay = {
  ymd: string;
  minutes: number;
  logs: number;
};

export default function AnalyticsPage() {
  const s = useAppState();

  const [anchorYmd, setAnchorYmd] = useState<string>(() => todayYMD());

  const weekStart = useMemo(
    () => getWeekStart(anchorYmd, s.settings.weekStartsOn),
    [anchorYmd, s.settings.weekStartsOn]
  );
  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const dayWindowMin = useMemo(() => {
    const start = s.settings.dayStartHour ?? 8;
    const end = s.settings.dayEndHour ?? 21;
    const hours = end >= start ? (end - start) : (24 - start + end);
    return Math.max(1, hours * 60);
  }, [s.settings.dayStartHour, s.settings.dayEndHour]);

  const weekWindowMin = dayWindowMin * 7;

  const tasksById = useMemo(() => {
    const map = new Map<string, { title: string; tags: string[] }>();
    for (const t of s.tasks) map.set(t.id, { title: t.title, tags: t.tags ?? [] });
    return map;
  }, [s.tasks]);

  const weekLogs = useMemo(() => {
    const start = new Date(`${weekStart}T00:00:00`).getTime();
    const end = new Date(`${ymdAddDays(weekStart, 7)}T00:00:00`).getTime();
    return s.timeLogs.filter((l) => l.startedAt >= start && l.startedAt < end);
  }, [s.timeLogs, weekStart]);

  const totalTrackedMin = useMemo(
    () => weekLogs.reduce((sum, l) => sum + (l.minutes ?? 0), 0),
    [weekLogs]
  );

  const untrackedMin = useMemo(() => Math.max(0, weekWindowMin - totalTrackedMin), [
    weekWindowMin,
    totalTrackedMin
  ]);

  const kpdApprox = useMemo(() => {
    // Пока нет разделения "полезное/поглотители/отдых" — считаем всё учтённое как полезное.
    return weekWindowMin > 0 ? totalTrackedMin / weekWindowMin : 0;
  }, [totalTrackedMin, weekWindowMin]);

  const byDay: RowDay[] = useMemo(() => {
    const map = new Map<string, RowDay>();
    for (const ymd of days) map.set(ymd, { ymd, minutes: 0, logs: 0 });

    for (const l of weekLogs) {
      const dt = new Date(l.startedAt);
      const ymd =
        `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
      const row = map.get(ymd);
      if (!row) continue;
      row.minutes += l.minutes ?? 0;
      row.logs += 1;
    }

    return days.map((d) => map.get(d)!).sort((a, b) => a.ymd.localeCompare(b.ymd));
  }, [weekLogs, days]);

  const topTasks = useMemo(() => {
    const acc = new Map<string, number>();
    for (const l of weekLogs) {
      const id = l.taskId ?? "__none__";
      acc.set(id, (acc.get(id) ?? 0) + (l.minutes ?? 0));
    }
    const rows = Array.from(acc.entries())
      .map(([taskId, minutes]) => {
        const meta = tasksById.get(taskId);
        const title =
          taskId === "__none__"
            ? "(без привязки)"
            : (meta?.title ?? "(задача удалена)");
        return { taskId, title, minutes };
      })
      .sort((a, b) => b.minutes - a.minutes);
    return rows.slice(0, 12);
  }, [weekLogs, tasksById]);

  const topTags = useMemo(() => {
    const acc = new Map<string, number>();
    for (const l of weekLogs) {
      if (!l.taskId) continue;
      const meta = tasksById.get(l.taskId);
      const tags = meta?.tags ?? [];
      for (const tg of tags) {
        acc.set(tg, (acc.get(tg) ?? 0) + (l.minutes ?? 0));
      }
    }
    return Array.from(acc.entries())
      .map(([tag, minutes]) => ({ tag, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 12);
  }, [weekLogs, tasksById]);

  const maxDayMin = useMemo(() => Math.max(1, ...byDay.map((r) => r.minutes)), [byDay]);

  return (
    <div className="grid gap-3">
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-lg font-semibold">Аналитика</div>
            <div className="text-sm text-slate-400">
              Неделя: {fmtYMDru(weekStart)} — {fmtYMDru(ymdAddDays(weekStart, 6))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:bg-slate-800"
              onClick={() => setAnchorYmd(ymdAddDays(anchorYmd, -7))}
              title="Предыдущая неделя"
            >
              ← Неделя
            </button>
            <button
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:bg-slate-800"
              onClick={() => setAnchorYmd(todayYMD())}
              title="Текущая неделя"
            >
              Сегодня
            </button>
            <button
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:bg-slate-800"
              onClick={() => setAnchorYmd(ymdAddDays(anchorYmd, 7))}
              title="Следующая неделя"
            >
              Неделя →
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">Учтённое время</div>
            <div className="mt-1 text-xl font-semibold">{fmtMinutes(totalTrackedMin)}</div>
            <div className="text-xs text-slate-500">по таймшиту за неделю</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">Окно дня (брутто)</div>
            <div className="mt-1 text-xl font-semibold">{fmtMinutes(weekWindowMin)}</div>
            <div className="text-xs text-slate-500">
              из Settings: {s.settings.dayStartHour}:00 — {s.settings.dayEndHour}:00
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">Неучтённое</div>
            <div className="mt-1 text-xl font-semibold">{fmtMinutes(untrackedMin)}</div>
            <div className="text-xs text-slate-500">
              то, что не попало в таймшит
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">КПД (прибл.)</div>
            <div className="mt-1 text-xl font-semibold">{percent(kpdApprox)}</div>
            <div className="text-xs text-slate-500">
              сейчас считаем всё учтённое как «полезное»
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="font-semibold">По дням недели</div>
          <div className="mt-2 grid gap-2">
            {byDay.map((r) => {
              const ratio = r.minutes / maxDayMin;
              return (
                <div
                  key={r.ymd}
                  className="rounded-lg border border-slate-800 bg-slate-900 p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm">
                      <span className="text-slate-300">{fmtYMDru(r.ymd)}</span>
                      <span className="ml-2 text-xs text-slate-500">({r.logs} записей)</span>
                    </div>
                    <div className="text-sm font-semibold">{fmtMinutes(r.minutes)}</div>
                  </div>
                  <div className="mt-2 h-2 w-full rounded bg-slate-950">
                    <div
                      className="h-2 rounded bg-slate-700"
                      style={{ width: `${Math.round(clamp01(ratio) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Доля от дневного «окна»: {percent((r.minutes / dayWindowMin) || 0)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="font-semibold">ТОП задач по времени</div>
          <div className="mt-2 grid gap-2">
            {topTasks.length === 0 ? (
              <div className="text-sm text-slate-400">Нет данных за эту неделю</div>
            ) : (
              topTasks.map((x) => (
                <div
                  key={x.taskId}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-slate-200">{x.title}</div>
                    <div className="text-xs text-slate-500">
                      {percent(totalTrackedMin > 0 ? x.minutes / totalTrackedMin : 0)} от учтённого
                    </div>
                  </div>
                  <div className="text-sm font-semibold">{fmtMinutes(x.minutes)}</div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 font-semibold">ТОП тегов</div>
          <div className="mt-2 grid gap-2">
            {topTags.length === 0 ? (
              <div className="text-sm text-slate-400">
                Пока пусто. Теги учитываются по задачам, привязанным к таймшиту.
              </div>
            ) : (
              topTags.map((x) => (
                <div
                  key={x.tag}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2"
                >
                  <div className="truncate text-sm text-slate-200">{x.tag}</div>
                  <div className="text-sm font-semibold">{fmtMinutes(x.minutes)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="font-semibold">Что это даёт (и что улучшим дальше)</div>
        <div className="mt-2 text-sm text-slate-400 leading-relaxed">
          Сейчас аналитика показывает «куда ушло учтённое время» и приблизительный КПД.
          Следующий шаг — добавить в таймшит <span className="text-slate-200">тип записи</span>:
          <span className="text-slate-200"> полезное / поглотитель / отдых</span>.
          Тогда появятся честные метрики Архангельского: нетто, поглотители, отколы и КПД без самообмана.
        </div>
      </div>
    </div>
  );
}
