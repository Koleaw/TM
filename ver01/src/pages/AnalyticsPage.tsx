import { useMemo, useState } from "react";
import {
  getWeekStart,
  todayYMD,
  useAppState,
  weekDays,
  ymdAddDays,
} from "../data/db";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseYMD(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function diffDays(aYmd: string, bYmd: string) {
  const a = parseYMD(aYmd).getTime();
  const b = parseYMD(bYmd).getTime();
  return Math.round((b - a) / 86400000);
}

function fmtYMDru(ymd: string) {
  const dt = parseYMD(ymd);
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

function minutesElapsedInTodayWindow(now: Date, dayYmd: string, startHour: number, endHour: number) {
  const dayStart = parseYMD(dayYmd);
  const startTs = new Date(dayStart);
  startTs.setHours(startHour, 0, 0, 0);

  const endTs = new Date(dayStart);
  endTs.setHours(endHour, 0, 0, 0);
  if (endHour <= startHour) endTs.setDate(endTs.getDate() + 1);

  const nowTs = now.getTime();
  const a = startTs.getTime();
  const b = endTs.getTime();
  const len = Math.max(1, b - a);

  if (nowTs <= a) return 0;
  if (nowTs >= b) return Math.round(len / 60000);
  return Math.round((nowTs - a) / 60000);
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
  const weekEnd = useMemo(() => ymdAddDays(weekStart, 6), [weekStart]);
  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const dayWindowMin = useMemo(() => {
    const start = s.settings.dayStartHour ?? 8;
    const end = s.settings.dayEndHour ?? 21;
    const hours = end >= start ? (end - start) : (24 - start + end);
    return Math.max(1, hours * 60);
  }, [s.settings.dayStartHour, s.settings.dayEndHour]);

  const weekWindowMin = dayWindowMin * 7;

  const now = new Date();
  const nowYmd = todayYMD();

  const elapsedWeekWindowMin = useMemo(() => {
    const startHour = s.settings.dayStartHour ?? 8;
    const endHour = s.settings.dayEndHour ?? 21;

    if (nowYmd < weekStart) return 0;
    if (nowYmd > weekEnd) return weekWindowMin;

    const idx = Math.max(0, Math.min(6, diffDays(weekStart, nowYmd)));
    const todayPart = minutesElapsedInTodayWindow(now, nowYmd, startHour, endHour);
    return idx * dayWindowMin + Math.min(dayWindowMin, Math.max(0, todayPart));
  }, [nowYmd, weekStart, weekEnd, weekWindowMin, dayWindowMin, s.settings.dayStartHour, s.settings.dayEndHour, now]);

  const tasksById = useMemo(() => {
    const map = new Map<string, { title: string; tags: string[] }>();
    for (const t of s.tasks) map.set(t.id, { title: t.title, tags: t.tags ?? [] });
    return map;
  }, [s.tasks]);

  const timeTypesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of (s.lists.timeTypes ?? [])) map.set(it.id, it.name);
    return map;
  }, [s.lists.timeTypes]);

  const sinksById = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of (s.lists.sinks ?? [])) map.set(it.id, it.name);
    return map;
  }, [s.lists.sinks]);

  const weekLogs = useMemo(() => {
    const start = parseYMD(weekStart).getTime();
    const end = parseYMD(ymdAddDays(weekStart, 7)).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    return s.timeLogs.filter((l) => Number.isFinite(l.startedAt) && l.startedAt >= start && l.startedAt < end);
  }, [s.timeLogs, weekStart]);

  const totalTrackedMin = useMemo(
    () => weekLogs.reduce((sum, l) => sum + (l.minutes ?? 0), 0),
    [weekLogs]
  );

  const untrackedMin = useMemo(
    () => Math.max(0, elapsedWeekWindowMin - totalTrackedMin),
    [elapsedWeekWindowMin, totalTrackedMin]
  );

  const kpdApprox = useMemo(() => {
    if (elapsedWeekWindowMin <= 0) return 0;
    return totalTrackedMin / elapsedWeekWindowMin;
  }, [totalTrackedMin, elapsedWeekWindowMin]);

  // ====== НОВОЕ: разрез по "классу" (kind) ======
  const kindTotals = useMemo(() => {
    let useful = 0;
    let rest = 0;
    let sink = 0;

    for (const l of weekLogs) {
      const k = (l.kind ?? "useful") as "useful" | "rest" | "sink";
      const m = l.minutes ?? 0;
      if (k === "rest") rest += m;
      else if (k === "sink") sink += m;
      else useful += m;
    }

    return { useful, rest, sink };
  }, [weekLogs]);

  const windowDenom = useMemo(() => {
    // для текущей недели считаем "до текущего момента", иначе — полное окно недели
    return (nowYmd >= weekStart && nowYmd <= weekEnd) ? elapsedWeekWindowMin : weekWindowMin;
  }, [nowYmd, weekStart, weekEnd, elapsedWeekWindowMin, weekWindowMin]);

  const topSinks = useMemo(() => {
    const acc = new Map<string, number>();

    for (const l of weekLogs) {
      const k = (l.kind ?? "useful") as "useful" | "rest" | "sink";
      if (k !== "sink") continue;

      const id = l.sinkId ?? "__none__";
      acc.set(id, (acc.get(id) ?? 0) + (l.minutes ?? 0));
    }

    return Array.from(acc.entries())
      .map(([sinkId, minutes]) => {
        const title =
          sinkId === "__none__"
            ? "(не указан)"
            : (sinksById.get(sinkId) ?? "(поглотитель удалён)");
        return { sinkId, title, minutes };
      })
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 12);
  }, [weekLogs, sinksById]);

  const byDay: RowDay[] = useMemo(() => {
    const map = new Map<string, RowDay>();
    for (const ymd of days) map.set(ymd, { ymd, minutes: 0, logs: 0 });

    for (const l of weekLogs) {
      if (!Number.isFinite(l.startedAt)) continue;
      const dt = new Date(l.startedAt);
      const ymd = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
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
    return Array.from(acc.entries())
      .map(([taskId, minutes]) => {
        const meta = tasksById.get(taskId);
        const title = taskId === "__none__" ? "(без привязки)" : meta?.title ?? "(задача удалена)";
        return { taskId, title, minutes };
      })
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 12);
  }, [weekLogs, tasksById]);

  const topTags = useMemo(() => {
    const acc = new Map<string, number>();
    for (const l of weekLogs) {
      if (!l.taskId) continue;
      const meta = tasksById.get(l.taskId);
      const tags = meta?.tags ?? [];
      for (const tg of tags) acc.set(tg, (acc.get(tg) ?? 0) + (l.minutes ?? 0));
    }
    return Array.from(acc.entries())
      .map(([tag, minutes]) => ({ tag, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 12);
  }, [weekLogs, tasksById]);

  const topTimeTypes = useMemo(() => {
    const acc = new Map<string, number>();
    for (const l of weekLogs) {
      const id = l.timeTypeId ?? "__none__";
      acc.set(id, (acc.get(id) ?? 0) + (l.minutes ?? 0));
    }
    return Array.from(acc.entries())
      .map(([timeTypeId, minutes]) => {
        const title =
          timeTypeId === "__none__" ? "(не выбран)" : (timeTypesById.get(timeTypeId) ?? "(тип удалён)");
        return { timeTypeId, title, minutes };
      })
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 12);
  }, [weekLogs, timeTypesById]);

  const maxDayMin = useMemo(() => Math.max(1, ...byDay.map((r) => r.minutes)), [byDay]);

  const isCurrentWeek = nowYmd >= weekStart && nowYmd <= weekEnd;
  const isFutureWeek = nowYmd < weekStart;

  return (
    <div className="grid gap-3">
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-lg font-semibold">Аналитика</div>
            <div className="text-sm text-slate-400">
              Неделя: {fmtYMDru(weekStart)} — {fmtYMDru(weekEnd)}
              {isCurrentWeek ? " (до текущего момента)" : isFutureWeek ? " (будущая)" : ""}
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
            <div className="text-xs text-slate-500">по таймшиту</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">Окно (брутто)</div>
            <div className="mt-1 text-xl font-semibold">
              {fmtMinutes(isCurrentWeek ? elapsedWeekWindowMin : weekWindowMin)}
            </div>
            <div className="text-xs text-slate-500">
              {s.settings.dayStartHour}:00 — {s.settings.dayEndHour}:00
              {isCurrentWeek ? ` • полная неделя: ${fmtMinutes(weekWindowMin)}` : ""}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">Неучтённое</div>
            <div className="mt-1 text-xl font-semibold">{fmtMinutes(untrackedMin)}</div>
            <div className="text-xs text-slate-500">
              {isCurrentWeek ? "в пределах прошедшего окна" : "в пределах окна недели"}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">КПД (прибл.)</div>
            <div className="mt-1 text-xl font-semibold">{percent(kpdApprox)}</div>
            <div className="text-xs text-slate-500">учтённое / прошедшее окно</div>
          </div>
        </div>

        {/* НОВОЕ: разрез по классу */}
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">Полезное</div>
            <div className="mt-1 text-xl font-semibold">{fmtMinutes(kindTotals.useful)}</div>
            <div className="text-xs text-slate-500">
              {percent(totalTrackedMin > 0 ? kindTotals.useful / totalTrackedMin : 0)} от учтённого •{" "}
              {percent(windowDenom > 0 ? kindTotals.useful / windowDenom : 0)} от окна
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">Отдых</div>
            <div className="mt-1 text-xl font-semibold">{fmtMinutes(kindTotals.rest)}</div>
            <div className="text-xs text-slate-500">
              {percent(totalTrackedMin > 0 ? kindTotals.rest / totalTrackedMin : 0)} от учтённого •{" "}
              {percent(windowDenom > 0 ? kindTotals.rest / windowDenom : 0)} от окна
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">Поглотители</div>
            <div className="mt-1 text-xl font-semibold">{fmtMinutes(kindTotals.sink)}</div>
            <div className="text-xs text-slate-500">
              {percent(totalTrackedMin > 0 ? kindTotals.sink / totalTrackedMin : 0)} от учтённого •{" "}
              {percent(windowDenom > 0 ? kindTotals.sink / windowDenom : 0)} от окна
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
                <div key={r.ymd} className="rounded-lg border border-slate-800 bg-slate-900 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm">
                      <span className="text-slate-300">{fmtYMDru(r.ymd)}</span>
                      <span className="ml-2 text-xs text-slate-500">({r.logs} записей)</span>
                    </div>
                    <div className="text-sm font-semibold">{fmtMinutes(r.minutes)}</div>
                  </div>
                  <div className="mt-2 h-2 w-full rounded bg-slate-950">
                    <div className="h-2 rounded bg-slate-700" style={{ width: `${Math.round(clamp01(ratio) * 100)}%` }} />
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
                Пока пусто. Теги считаются по задачам, привязанным к таймшиту.
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

          <div className="mt-4 font-semibold">ТОП типов времени</div>
          <div className="mt-2 grid gap-2">
            {topTimeTypes.length === 0 ? (
              <div className="text-sm text-slate-400">Нет данных за эту неделю</div>
            ) : (
              topTimeTypes.map((x) => (
                <div
                  key={x.timeTypeId}
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

          {/* НОВОЕ: ТОП поглотителей */}
          <div className="mt-4 font-semibold">ТОП поглотителей</div>
          <div className="mt-2 grid gap-2">
            {topSinks.length === 0 ? (
              <div className="text-sm text-slate-400">Пока нет записей с классом “Поглотитель”</div>
            ) : (
              topSinks.map((x) => (
                <div
                  key={x.sinkId}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-slate-200">{x.title}</div>
                    <div className="text-xs text-slate-500">
                      {percent(kindTotals.sink > 0 ? x.minutes / kindTotals.sink : 0)} от всех поглотителей
                    </div>
                  </div>
                  <div className="text-sm font-semibold">{fmtMinutes(x.minutes)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
