import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  db,
  ensureDefaultSettings,
  logEvent,
  type Task,
  type TimeLog,
  type Sink,
  type Settings
} from "../data/db";

type ABC = "A" | "B" | "C" | "—";

type TimerState = {
  running: boolean;
  startTs?: number;
  taskId?: string;
  sinkId?: string;
  abc?: ABC;
  note?: string;
};

type SettingsExt = Settings & {
  timer?: TimerState;
};

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function mmss(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

function uuid() {
  return (globalThis.crypto?.randomUUID?.() ??
    `id_${Date.now()}_${Math.random().toString(16).slice(2)}`) as string;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function TimePage() {
  const [dayISO, setDayISO] = useState(() => ymd(new Date()));

  const [settings, setSettings] = useState<SettingsExt | null>(null);
  const [timer, setTimer] = useState<TimerState>({ running: false });

  const [activeTasks, setActiveTasks] = useState<Task[]>([]);
  const [inboxTasks, setInboxTasks] = useState<Task[]>([]);
  const [taskById, setTaskById] = useState<Record<string, Task>>({});

  const [sinks, setSinks] = useState<Sink[]>([]);
  const [sinkById, setSinkById] = useState<Record<string, Sink>>({});

  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [tick, setTick] = useState(0);

  // manual log
  const [manualMin, setManualMin] = useState(30);
  const [manualTaskId, setManualTaskId] = useState<string>("");
  const [manualSinkId, setManualSinkId] = useState<string>("");
  const [manualABC, setManualABC] = useState<ABC>("—");
  const [manualNote, setManualNote] = useState("");

  const runningSec = useMemo(() => {
    if (!timer.running || !timer.startTs) return 0;
    return Math.max(0, Math.floor((Date.now() - timer.startTs) / 1000));
  }, [timer.running, timer.startTs, tick]);

  const todayTotalMin = useMemo(() => {
    return logs.reduce((a, l) => a + (l.durationMin || 0), 0);
  }, [logs]);

  const topSinksToday = useMemo(() => {
    const agg: Record<string, number> = {};
    for (const l of logs) {
      const sid = l.sinkId ?? "none";
      agg[sid] = (agg[sid] ?? 0) + (l.durationMin || 0);
    }
    return Object.entries(agg)
      .map(([id, min]) => ({
        id,
        name: id === "none" ? "Без поглотителя" : sinkById[id]?.name ?? `Sink ${id}`,
        min
      }))
      .sort((a, b) => b.min - a.min)
      .slice(0, 6);
  }, [logs, sinkById]);

  async function reloadAll() {
    await ensureDefaultSettings();

    const s = (await db.settings.get("singleton")) as SettingsExt | undefined;
    if (s) {
      setSettings(s);
      const t = s.timer ?? { running: false };
      setTimer(t);
    }

    const [planned, inbox, allTasks, allSinks] = await Promise.all([
      db.tasks.where("status").equals("active").and((t) => t.plannedDate === dayISO).toArray(),
      db.tasks.where("status").equals("active").and((t) => !t.plannedDate).reverse().sortBy("createdAt"),
      db.tasks.toArray(),
      db.sinks.toArray()
    ]);

    const tb: Record<string, Task> = {};
    for (const t of allTasks) tb[t.id] = t;
    setTaskById(tb);

    setActiveTasks(planned);
    setInboxTasks(inbox.slice(-80).reverse());

    const sb: Record<string, Sink> = {};
    for (const s of allSinks) sb[s.id] = s;
    setSinks(allSinks);
    setSinkById(sb);

    const dayLogs = await db.timeLogs.where("date").equals(dayISO).reverse().sortBy("createdAt");
    setLogs(dayLogs.slice(-200).reverse());
  }

  useEffect(() => {
    void reloadAll();
    const handler = () => void reloadAll();
    db.on("changes", handler);
    return () => {
      db.on("changes").unsubscribe(handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayISO]);

  // ticking only when running
  useEffect(() => {
    if (!timer.running) return;
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [timer.running]);

  async function saveTimer(next: TimerState) {
    const s = (await db.settings.get("singleton")) as SettingsExt | undefined;
    if (!s) return;
    s.timer = next;
    await db.settings.put(s);
    setSettings(s);
    setTimer(next);
  }

  async function startTimer() {
    const next: TimerState = {
      running: true,
      startTs: Date.now(),
      taskId: timer.taskId || manualTaskId || undefined,
      sinkId: timer.sinkId || manualSinkId || undefined,
      abc: (timer.abc ?? manualABC) || "—",
      note: timer.note ?? ""
    };
    await saveTimer(next);
    await logEvent({
      type: "timer_started",
      taskId: next.taskId,
      payload: { sinkId: next.sinkId ?? null, abc: next.abc ?? "—", date: dayISO }
    });
  }

  async function stopTimer() {
    if (!timer.running || !timer.startTs) return;

    const endTs = Date.now();
    const min = clamp(Math.round((endTs - timer.startTs) / 60000), 1, 24 * 60);

    const id = uuid();
    const row: TimeLog = {
      id,
      date: dayISO,
      taskId: timer.taskId,
      sinkId: timer.sinkId,
      abc: (timer.abc ?? "—") as any,
      startTs: timer.startTs,
      endTs,
      durationMin: min,
      note: timer.note ?? "",
      createdAt: Date.now()
    } as any;

    await db.timeLogs.put(row);

    await logEvent({
      type: "timelog_created",
      taskId: timer.taskId,
      payload: { sinkId: timer.sinkId ?? null, abc: timer.abc ?? "—", durationMin: min, date: dayISO }
    });

    await saveTimer({ running: false });
  }

  async function addManualLog() {
    const min = clamp(Number.isFinite(manualMin) ? manualMin : 30, 1, 24 * 60);
    const id = uuid();

    const row: TimeLog = {
      id,
      date: dayISO,
      taskId: manualTaskId || undefined,
      sinkId: manualSinkId || undefined,
      abc: (manualABC ?? "—") as any,
      durationMin: min,
      note: manualNote.trim(),
      createdAt: Date.now()
    } as any;

    await db.timeLogs.put(row);
    await logEvent({
      type: "timelog_created",
      taskId: row.taskId,
      payload: { sinkId: row.sinkId ?? null, abc: row.abc ?? "—", durationMin: min, date: dayISO, manual: true }
    });

    setManualNote("");
  }

  async function deleteLog(id: string) {
    const ok = confirm("Удалить таймлог? Это действие нельзя отменить.");
    if (!ok) return;
    await db.timeLogs.delete(id);
    await logEvent({ type: "timelog_deleted", payload: { id, date: dayISO } });
  }

  const taskOptions = useMemo(() => {
    const planned = activeTasks;
    const inbox = inboxTasks;
    const uniq: Task[] = [];
    const seen = new Set<string>();
    for (const t of [...planned, ...inbox]) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      uniq.push(t);
    }
    // fallback: если совсем пусто, покажем последние активные
    return uniq;
  }, [activeTasks, inboxTasks]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Time</h1>
          <div className="text-slate-300 text-sm">
            Таймер + таймлоги = основа для реальной аналитики (поглотители, ABC, план/факт).
          </div>
        </div>
        <input
          type="date"
          value={dayISO}
          onChange={(e) => setDayISO(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* Timer */}
      <section className="p-3 rounded-xl border border-slate-800 bg-slate-950 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="font-semibold">Таймер</div>
          <div className="text-xs text-slate-400">
            Сегодня залогировано: <span className="text-slate-50 font-semibold">{todayTotalMin} мин</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-slate-300">Задача</div>
            <select
              value={timer.taskId ?? manualTaskId}
              onChange={(e) => setTimer((t) => ({ ...t, taskId: e.target.value || undefined }))}
              disabled={timer.running}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">— (без задачи)</option>
              {taskOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <div className="text-sm text-slate-300">Поглотитель (sink)</div>
            <select
              value={timer.sinkId ?? manualSinkId}
              onChange={(e) => setTimer((t) => ({ ...t, sinkId: e.target.value || undefined }))}
              disabled={timer.running}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">— (не задан)</option>
              {sinks.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <div className="text-sm text-slate-300">ABC</div>
            <select
              value={timer.abc ?? "—"}
              onChange={(e) => setTimer((t) => ({ ...t, abc: e.target.value as ABC }))}
              disabled={timer.running}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            >
              <option value="A">A (ключевое)</option>
              <option value="B">B (важное)</option>
              <option value="C">C (рутина)</option>
              <option value="—">—</option>
            </select>
          </label>

          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">Идёт</div>
              <div className="text-lg font-semibold">{timer.running ? mmss(runningSec) : "00:00"}</div>
            </div>
            <div className="flex gap-2">
              {!timer.running ? (
                <button
                  onClick={() => void startTimer()}
                  className="px-4 py-2 rounded-lg bg-slate-50 text-slate-950 text-sm font-semibold hover:bg-white"
                >
                  Start
                </button>
              ) : (
                <button
                  onClick={() => void stopTimer()}
                  className="px-4 py-2 rounded-lg bg-emerald-200 text-emerald-950 text-sm font-semibold"
                >
                  Stop
                </button>
              )}
            </div>
          </div>
        </div>

        <label className="space-y-1 block">
          <div className="text-sm text-slate-300">Заметка (опционально)</div>
          <input
            value={timer.note ?? ""}
            onChange={(e) => setTimer((t) => ({ ...t, note: e.target.value }))}
            disabled={timer.running}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            placeholder="Напр.: созвон с Мишей, сделал 70%, ждём ответ"
          />
        </label>

        {topSinksToday.length > 0 && (
          <div className="pt-3 border-t border-slate-800">
            <div className="text-xs text-slate-400 mb-2">Сегодняшние топ-поглотители</div>
            <div className="flex flex-wrap gap-2">
              {topSinksToday.map((s) => (
                <div key={s.id} className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-sm">
                  <span className="font-semibold">{s.name}</span>{" "}
                  <span className="text-slate-400">{s.min}м</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Manual log */}
      <section className="p-3 rounded-xl border border-slate-800 bg-slate-950 space-y-3">
        <div className="font-semibold">Быстрый ручной таймлог</div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-slate-300">Минуты</div>
            <input
              type="number"
              min={1}
              max={1440}
              value={manualMin}
              onChange={(e) => setManualMin(parseInt(e.target.value || "30", 10))}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <div className="text-sm text-slate-300">Задача</div>
            <select
              value={manualTaskId}
              onChange={(e) => setManualTaskId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">— (без задачи)</option>
              {taskOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <div className="text-sm text-slate-300">Поглотитель</div>
            <select
              value={manualSinkId}
              onChange={(e) => setManualSinkId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {sinks.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <div className="text-sm text-slate-300">ABC</div>
            <select
              value={manualABC}
              onChange={(e) => setManualABC(e.target.value as ABC)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="—">—</option>
            </select>
          </label>

          <div className="flex items-end">
            <button
              onClick={() => void addManualLog()}
              className="w-full px-4 py-2 rounded-lg bg-slate-50 text-slate-950 text-sm font-semibold hover:bg-white"
            >
              Добавить
            </button>
          </div>
        </div>

        <label className="space-y-1 block">
          <div className="text-sm text-slate-300">Заметка</div>
          <input
            value={manualNote}
            onChange={(e) => setManualNote(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            placeholder="Опционально"
          />
        </label>
      </section>

      {/* Logs list */}
      <section className="p-3 rounded-xl border border-slate-800 bg-slate-950 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="font-semibold">Таймлоги дня</div>
          <div className="text-xs text-slate-400">{logs.length} записей</div>
        </div>

        {logs.length === 0 ? (
          <div className="text-sm text-slate-400">
            Пока нет таймлогов. Запусти таймер или добавь ручной лог — и Analytics начнёт реально работать.
          </div>
        ) : (
          <div className="space-y-2">
            {logs
              .slice()
              .reverse()
              .map((l) => {
                const t = l.taskId ? taskById[l.taskId] : undefined;
                const s = l.sinkId ? sinkById[l.sinkId] : undefined;
                return (
                  <div key={l.id} className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">
                          {t?.title ?? "— без задачи"}{" "}
                          <span className="text-xs text-slate-400">· {l.durationMin ?? 0}м</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Sink: {s?.name ?? "—"} · ABC: {(l.abc as any) ?? "—"}
                          {l.startTs && l.endTs ? (
                            <span className="text-slate-500">
                              {" "}
                              · {format(new Date(l.startTs), "HH:mm")}–{format(new Date(l.endTs), "HH:mm")}
                            </span>
                          ) : null}
                        </div>
                        {l.note ? <div className="text-sm text-slate-200 mt-2">{l.note}</div> : null}
                      </div>

                      <button
                        onClick={() => void deleteLog(l.id)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-100 text-xs"
                        title="Удалить"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      <div className="text-xs text-slate-500">
        Следующий шаг: страница задачи (TaskDetails) + управление тегами/поглотителями (Manage).
        Потом — drag&drop в Week и PWA (установка на телефон как приложение).
      </div>
    </div>
  );
}
