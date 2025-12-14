import { useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { db, ensureDefaultSettings, type Task, type TimeLog, type ScheduleBlock, type Tag, type Sink } from "../data/db";

type RangePreset = 7 | 14 | 30 | 90;

type DailyRow = {
  date: string; // YYYY-MM-DD
  plannedHardMin: number;
  actualMin: number;
  doneCount: number;
  rolloverCount: number;
};

type AggRow = { name: string; min: number; pct: number };

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function sum(nums: number[]) {
  return nums.reduce((a, b) => a + b, 0);
}

function downloadText(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCSV(rows: Record<string, any>[]) {
  if (!rows.length) return "";
  const headers = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );
  const esc = (v: any) => {
    const s = v === null || v === undefined ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(","));
  return lines.join("\n");
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function BarRow({
  label,
  leftMin,
  rightMin,
  maxMin,
  leftLabel = "Plan",
  rightLabel = "Fact"
}: {
  label: string;
  leftMin: number;
  rightMin: number;
  maxMin: number;
  leftLabel?: string;
  rightLabel?: string;
}) {
  const leftW = maxMin ? clamp(Math.round((leftMin / maxMin) * 100), 0, 100) : 0;
  const rightW = maxMin ? clamp(Math.round((rightMin / maxMin) * 100), 0, 100) : 0;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-slate-400">
          {leftLabel}: {leftMin}м · {rightLabel}: {rightMin}м
        </div>
      </div>

      <div className="mt-2 space-y-2">
        <div className="h-2 rounded bg-slate-900 overflow-hidden">
          <div className="h-2 bg-slate-200" style={{ width: `${leftW}%` }} />
        </div>
        <div className="h-2 rounded bg-slate-900 overflow-hidden">
          <div className="h-2 bg-emerald-200" style={{ width: `${rightW}%` }} />
        </div>
      </div>
    </div>
  );
}

function ProgressList({ title, rows }: { title: string; rows: AggRow[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <div className="text-xs text-slate-400">{rows.length ? "top" : "—"}</div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-2 text-sm text-slate-400">Пока нет данных.</div>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.name} className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">{r.name}</div>
                <div className="text-xs text-slate-300">
                  {r.min}м · {r.pct}%
                </div>
              </div>
              <div className="mt-2 h-2 rounded bg-slate-900 overflow-hidden">
                <div className="h-2 bg-slate-200" style={{ width: `${clamp(r.pct, 0, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const [preset, setPreset] = useState<RangePreset>(14);
  const [endISO, setEndISO] = useState<string>(() => ymd(new Date()));
  const [startISO, setStartISO] = useState<string>(() => ymd(addDays(new Date(), -13)));

  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [topSinks, setTopSinks] = useState<AggRow[]>([]);
  const [topTags, setTopTags] = useState<AggRow[]>([]);
  const [abc, setAbc] = useState<AggRow[]>([]);
  const [topTasks, setTopTasks] = useState<{ title: string; min: number; pct: number }[]>([]);

  const [quality, setQuality] = useState<{
    totalLogs: number;
    logsWithoutTask: number;
    logsWithoutSink: number;
    tasksDoneNoEstimate: number;
  }>({ totalLogs: 0, logsWithoutTask: 0, logsWithoutSink: 0, tasksDoneNoEstimate: 0 });

  const [insights, setInsights] = useState<string[]>([]);

  const dateKeys = useMemo(() => {
    const start = new Date(startISO + "T00:00:00");
    const end = new Date(endISO + "T00:00:00");
    const keys: string[] = [];
    // inclusive
    for (let d = start; d <= end; d = addDays(d, 1)) keys.push(ymd(d));
    return keys;
  }, [startISO, endISO]);

  useEffect(() => {
    // preset -> startISO
    const end = new Date(endISO + "T00:00:00");
    const s = addDays(end, -(preset - 1));
    setStartISO(ymd(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, endISO]);

  async function reload() {
    await ensureDefaultSettings();

    // pull base tables
    const [blocks, logs, tasks, tags, sinks, events] = await Promise.all([
      db.scheduleBlocks.toArray(),
      db.timeLogs.toArray(),
      db.tasks.toArray(),
      db.tags.toArray(),
      db.sinks.toArray(),
      db.eventLogs.toArray()
    ]);

    const inRange = (dateISO: string) => dateISO >= startISO && dateISO <= endISO;

    // --- daily aggregates ---
    const plannedByDate: Record<string, number> = {};
    const actualByDate: Record<string, number> = {};
    const doneByDate: Record<string, number> = {};
    const rolloverByDate: Record<string, number> = {};

    for (const k of dateKeys) {
      plannedByDate[k] = 0;
      actualByDate[k] = 0;
      doneByDate[k] = 0;
      rolloverByDate[k] = 0;
    }

    for (const b of blocks) {
      if (!inRange(b.date)) continue;
      plannedByDate[b.date] = (plannedByDate[b.date] ?? 0) + Math.max(0, b.endMin - b.startMin);
    }

    for (const l of logs) {
      if (!inRange(l.date)) continue;
      actualByDate[l.date] = (actualByDate[l.date] ?? 0) + (l.durationMin || 0);
    }

    for (const t of tasks) {
      if (t.status !== "done" || !t.doneAt) continue;
      const d = ymd(new Date(t.doneAt));
      if (!inRange(d)) continue;
      doneByDate[d] = (doneByDate[d] ?? 0) + 1;
    }

    for (const e of events) {
      if (e.type !== "task_planned_date_set") continue;
      const d = ymd(new Date(e.ts));
      if (!inRange(d)) continue;
      rolloverByDate[d] = (rolloverByDate[d] ?? 0) + 1;
    }

    const dailyRows: DailyRow[] = dateKeys.map((k) => ({
      date: k,
      plannedHardMin: plannedByDate[k] ?? 0,
      actualMin: actualByDate[k] ?? 0,
      doneCount: doneByDate[k] ?? 0,
      rolloverCount: rolloverByDate[k] ?? 0
    }));

    setDaily(dailyRows);

    // --- sinks breakdown ---
    const sinkName: Record<string, string> = {};
    for (const s of sinks) sinkName[s.id] = s.name;

    const sinkAgg: Record<string, number> = {};
    for (const l of logs) {
      if (!inRange(l.date)) continue;
      const sid = l.sinkId ?? "none";
      sinkAgg[sid] = (sinkAgg[sid] ?? 0) + (l.durationMin || 0);
    }
    const totalFact = sum(Object.values(sinkAgg));
    const sinkRows: AggRow[] = Object.entries(sinkAgg)
      .map(([id, min]) => ({
        name: id === "none" ? "Без поглотителя (sinkId не задан)" : sinkName[id] ?? `Sink ${id}`,
        min,
        pct: pct(min, totalFact)
      }))
      .sort((a, b) => b.min - a.min)
      .slice(0, 8);
    setTopSinks(sinkRows);

    // --- ABC breakdown ---
    const abcAgg: Record<string, number> = {};
    for (const l of logs) {
      if (!inRange(l.date)) continue;
      const k = l.abc ?? "—";
      abcAgg[k] = (abcAgg[k] ?? 0) + (l.durationMin || 0);
    }
    const abcTotal = sum(Object.values(abcAgg));
    const abcRows: AggRow[] = Object.entries(abcAgg)
      .map(([k, min]) => ({ name: k, min, pct: pct(min, abcTotal) }))
      .sort((a, b) => b.min - a.min);
    setAbc(abcRows);

    // --- tags breakdown (timeLogs -> task -> tags) ---
    const tagName: Record<string, string> = {};
    for (const t of tags) tagName[t.id] = t.name;

    const taskById: Record<string, Task> = {};
    for (const t of tasks) taskById[t.id] = t;

    const tagAgg: Record<string, number> = {};
    for (const l of logs) {
      if (!inRange(l.date)) continue;
      if (!l.taskId) {
        tagAgg["— (без задачи)"] = (tagAgg["— (без задачи)"] ?? 0) + (l.durationMin || 0);
        continue;
      }
      const task = taskById[l.taskId];
      const tagsList = task?.tagIds?.length ? task.tagIds : [];
      if (!tagsList.length) {
        tagAgg["— (без тегов)"] = (tagAgg["— (без тегов)"] ?? 0) + (l.durationMin || 0);
        continue;
      }
      // делим время поровну между тегами (чтобы не было двойного счёта)
      const share = (l.durationMin || 0) / tagsList.length;
      for (const tid of tagsList) {
        const name = tagName[tid] ?? `Tag ${tid}`;
        tagAgg[name] = (tagAgg[name] ?? 0) + share;
      }
    }
    const tagTotal = sum(Object.values(tagAgg));
    const tagRows: AggRow[] = Object.entries(tagAgg)
      .map(([name, min]) => ({ name, min: Math.round(min), pct: pct(min, tagTotal) }))
      .sort((a, b) => b.min - a.min)
      .slice(0, 8);
    setTopTags(tagRows);

    // --- top tasks by time ---
    const taskTime: Record<string, number> = {};
    for (const l of logs) {
      if (!inRange(l.date)) continue;
      if (!l.taskId) continue;
      taskTime[l.taskId] = (taskTime[l.taskId] ?? 0) + (l.durationMin || 0);
    }
    const taskTimeTotal = sum(Object.values(taskTime));
    const topTaskRows = Object.entries(taskTime)
      .map(([id, min]) => ({
        title: taskById[id]?.title ?? `Task ${id}`,
        min,
        pct: pct(min, taskTimeTotal)
      }))
      .sort((a, b) => b.min - a.min)
      .slice(0, 10);
    setTopTasks(topTaskRows);

    // --- data quality ---
    const logsInRange = logs.filter((l) => inRange(l.date));
    const totalLogs = logsInRange.length;
    const logsWithoutTask = logsInRange.filter((l) => !l.taskId).length;
    const logsWithoutSink = logsInRange.filter((l) => !l.sinkId).length;

    const doneInRange = tasks.filter((t) => {
      if (t.status !== "done" || !t.doneAt) return false;
      const d = ymd(new Date(t.doneAt));
      return inRange(d);
    });
    const tasksDoneNoEstimate = doneInRange.filter((t) => !t.estimateMin).length;

    setQuality({ totalLogs, logsWithoutTask, logsWithoutSink, tasksDoneNoEstimate });

    // --- insights (жёстко data-driven, без фантазий) ---
    const totalPlanned = sum(dailyRows.map((r) => r.plannedHardMin));
    const totalActual = sum(dailyRows.map((r) => r.actualMin));
    const totalRollovers = sum(dailyRows.map((r) => r.rolloverCount));
    const totalDone = sum(dailyRows.map((r) => r.doneCount));

    const insights: string[] = [];

    if (totalActual === 0) {
      insights.push("Факт по времени = 0: пока нет таймлогов. Добавим таймер — и аналитика станет по-настоящему мощной.");
    } else {
      const topSink = sinkRows[0];
      if (topSink && topSink.pct >= 25) {
        insights.push(`Поглотитель “${topSink.name}” съел ${topSink.pct}% времени. Это главный кандидат на ограничение/правила.`);
      }
      const aRow = abcRows.find((r) => r.name === "A");
      if (aRow && aRow.pct < 35) {
        insights.push(`Доля “A” по времени всего ${aRow.pct}%. Если хочешь сильный прогресс — подними долю “A” (ключевые задачи/цели).`);
      }
    }

    if (totalPlanned > 0 && totalActual > 0) {
      const ratio = Math.round((totalActual / totalPlanned) * 100);
      if (ratio > 140) insights.push(`Факт сильно выше жёсткого плана (${ratio}%): либо планируешь мало, либо много “вне расписания”.`);
      if (ratio < 70) insights.push(`Факт заметно ниже жёсткого плана (${ratio}%): возможно, план слишком оптимистичен или нет трекинга времени.`);
    }

    if (totalRollovers >= Math.max(5, dateKeys.length)) {
      insights.push(`Переносов много (${totalRollovers}). Частая причина — перегруз и недооценка задач. Включим анализ причин переносов на Weekly.`);
    }

    if (totalDone === 0 && tasks.length) {
      insights.push("За период нет завершённых задач (done). Проверь, ставишь ли ты статус done — иначе статистика не будет отражать реальность.");
    }

    if (tasksDoneNoEstimate > 0) {
      insights.push(`Завершено задач без оценок: ${tasksDoneNoEstimate}. Оценки нужны для реалистичного плана и 60/40.`);
    }

    if (totalLogs > 0) {
      const pNoTask = pct(logsWithoutTask, totalLogs);
      const pNoSink = pct(logsWithoutSink, totalLogs);
      if (pNoTask >= 30) insights.push(`В ${pNoTask}% таймлогов не указана задача. Для data-driven решений лучше логировать к задачам.`);
      if (pNoSink >= 30) insights.push(`В ${pNoSink}% таймлогов не указан поглотитель. Тогда “поглотители” будут недооценены.`);
    }

    setInsights(insights);
  }

  useEffect(() => {
    void reload();
    const handler = () => void reload();
    db.on("changes", handler);
    return () => {
      db.on("changes").unsubscribe(handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startISO, endISO]);

  const maxBar = useMemo(() => {
    return Math.max(1, ...daily.map((r) => Math.max(r.plannedHardMin, r.actualMin)));
  }, [daily]);

  const totals = useMemo(() => {
    const planned = sum(daily.map((r) => r.plannedHardMin));
    const actual = sum(daily.map((r) => r.actualMin));
    const done = sum(daily.map((r) => r.doneCount));
    const roll = sum(daily.map((r) => r.rolloverCount));
    return { planned, actual, done, roll };
  }, [daily]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Analytics</h1>
          <div className="text-slate-300 text-sm">
            План/факт, переносы, поглотители, ABC и качество данных — чтобы принимать решения по своей жизни на цифрах.
          </div>
        </div>
      </div>

      {/* Range */}
      <section className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="font-semibold">Период</div>
          <div className="flex gap-2 flex-wrap">
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setPreset(d as RangePreset)}
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  preset === d ? "bg-slate-50 text-slate-950 font-semibold" : "bg-slate-900 text-slate-200"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-slate-300">Start</div>
            <input
              type="date"
              value={startISO}
              onChange={(e) => setStartISO(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1">
            <div className="text-sm text-slate-300">End</div>
            <input
              type="date"
              value={endISO}
              onChange={(e) => setEndISO(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            />
          </label>

          <div className="space-y-1">
            <div className="text-sm text-slate-300">Экспорт</div>
            <button
              onClick={() => {
                const rows = daily.map((r) => ({
                  date: r.date,
                  plannedHardMin: r.plannedHardMin,
                  actualMin: r.actualMin,
                  doneCount: r.doneCount,
                  rolloverCount: r.rolloverCount
                }));
                const csv = toCSV(rows);
                downloadText(`tm_daily_${startISO}_${endISO}.csv`, csv, "text/csv");
              }}
              className="w-full px-4 py-2 rounded-lg bg-slate-50 text-slate-950 text-sm font-semibold hover:bg-white"
            >
              Download daily CSV
            </button>
          </div>
        </div>
      </section>

      {/* Summary cards */}
      <section className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="text-xs text-slate-400">Жёсткий план (мин)</div>
          <div className="text-lg font-semibold">{totals.planned}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="text-xs text-slate-400">Факт (мин)</div>
          <div className="text-lg font-semibold">{totals.actual}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="text-xs text-slate-400">Завершено задач</div>
          <div className="text-lg font-semibold">{totals.done}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="text-xs text-slate-400">Переносов</div>
          <div className="text-lg font-semibold">{totals.roll}</div>
        </div>
      </section>

      {/* Daily chart */}
      <section className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-semibold">План vs Факт по дням</h2>
          <div className="text-xs text-slate-400">
            верхняя полоска — план (жёсткие блоки), нижняя — факт (таймлоги)
          </div>
        </div>

        {daily.length === 0 ? (
          <div className="mt-3 text-sm text-slate-400">Нет данных.</div>
        ) : (
          <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-3">
            {daily.map((r) => (
              <div key={r.date} className="space-y-2">
                <BarRow
                  label={`${format(parseISO(r.date), "dd.MM")} · done ${r.doneCount} · roll ${r.rolloverCount}`}
                  leftMin={r.plannedHardMin}
                  rightMin={r.actualMin}
                  maxMin={maxBar}
                  leftLabel="Plan"
                  rightLabel="Fact"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Breakdowns */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ProgressList title="Поглотители (по sinkId)" rows={topSinks} />
        <ProgressList title="ABC по времени" rows={abc} />
        <ProgressList title="Теги (по задачам в таймлогах)" rows={topTags} />
      </section>

      {/* Top tasks */}
      <section className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-semibold">Топ задач по времени</h2>
          <div className="text-xs text-slate-400">только логи с taskId</div>
        </div>

        {topTasks.length === 0 ? (
          <div className="mt-2 text-sm text-slate-400">
            Пока нет данных по задачам. Когда добавим таймер/логирование — тут будет реальный “80/20” по твоей жизни.
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {topTasks.map((t) => (
              <div key={t.title} className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{t.title}</div>
                  <div className="text-xs text-slate-300">
                    {t.min}м · {t.pct}%
                  </div>
                </div>
                <div className="mt-2 h-2 rounded bg-slate-900 overflow-hidden">
                  <div className="h-2 bg-slate-200" style={{ width: `${clamp(t.pct, 0, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Data quality */}
      <section className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <h2 className="font-semibold">Качество данных</h2>
        <div className="mt-2 grid grid-cols-1 lg:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Таймлогов</div>
            <div className="font-semibold">{quality.totalLogs}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Без taskId</div>
            <div className="font-semibold">
              {quality.logsWithoutTask}{" "}
              <span className="text-slate-400">({pct(quality.logsWithoutTask, quality.totalLogs)}%)</span>
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Без sinkId</div>
            <div className="font-semibold">
              {quality.logsWithoutSink}{" "}
              <span className="text-slate-400">({pct(quality.logsWithoutSink, quality.totalLogs)}%)</span>
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-xs text-slate-400">Done без оценок</div>
            <div className="font-semibold">{quality.tasksDoneNoEstimate}</div>
          </div>
        </div>
      </section>

      {/* Insights */}
      <section className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <h2 className="font-semibold">Выводы (только из данных)</h2>
        {insights.length === 0 ? (
          <div className="mt-2 text-sm text-slate-400">Пока выводов нет.</div>
        ) : (
          <ul className="mt-2 space-y-2 text-sm text-slate-200 list-disc pl-5">
            {insights.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
        <div className="mt-3 text-xs text-slate-500">
          Следующий критический шаг для “data-driven жизни”: добавить Таймер/логирование времени (taskId + sinkId + ABC).
        </div>
      </section>
    </div>
  );
}
