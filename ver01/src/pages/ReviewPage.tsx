import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  format,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
  parseISO
} from "date-fns";
import {
  db,
  ensureDefaultSettings,
  logEvent,
  type Settings,
  type Task,
  type ScheduleBlock,
  type TimeLog
} from "../data/db";

type Tab = "morning" | "evening" | "weekly";

/** Расширяем Settings “мягко” (Dexie позволяет хранить доп. поля) */
type RitualSettings = Settings & {
  ritual?: {
    frogByDate?: Record<string, string[]>; // YYYY-MM-DD -> taskIds
    dailyNoteByDate?: Record<string, string>; // YYYY-MM-DD -> note
    weeklyReviewDone?: Record<string, boolean>; // weekStart YYYY-MM-DD -> true
  };
};

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}
function minToHHMM(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function weekStart(dateISO: string) {
  const d = new Date(dateISO + "T00:00:00");
  return startOfWeek(d, { weekStartsOn: 1 });
}
function weekRangeISO(anchorISO: string) {
  const ws = weekStart(anchorISO);
  const we = endOfWeek(ws, { weekStartsOn: 1 });
  return { ws, we, wsISO: ymd(ws), weISO: ymd(we) };
}

async function getRitualSettings(): Promise<RitualSettings> {
  await ensureDefaultSettings();
  const s = (await db.settings.get("singleton")) as RitualSettings | undefined;
  if (!s) throw new Error("Settings not found");
  if (!s.ritual) s.ritual = {};
  if (!s.ritual.frogByDate) s.ritual.frogByDate = {};
  if (!s.ritual.dailyNoteByDate) s.ritual.dailyNoteByDate = {};
  if (!s.ritual.weeklyReviewDone) s.ritual.weeklyReviewDone = {};
  return s;
}

async function putRitualSettings(next: RitualSettings) {
  await db.settings.put(next);
}

export default function ReviewPage() {
  const [tab, setTab] = useState<Tab>("morning");

  const [dayISO, setDayISO] = useState<string>(() => ymd(new Date()));
  const [weekAnchorISO, setWeekAnchorISO] = useState<string>(() => ymd(new Date()));

  const [settings, setSettings] = useState<RitualSettings | null>(null);

  // day data
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [plannedTasks, setPlannedTasks] = useState<Task[]>([]);
  const [inbox, setInbox] = useState<Task[]>([]);
  const [taskMap, setTaskMap] = useState<Record<string, Task>>({});

  // ritual state
  const frogIds = useMemo(() => {
    return settings?.ritual?.frogByDate?.[dayISO] ?? [];
  }, [settings, dayISO]);

  const dayNote = useMemo(() => {
    return settings?.ritual?.dailyNoteByDate?.[dayISO] ?? "";
  }, [settings, dayISO]);

  // weekly data
  const [weekStats, setWeekStats] = useState<{
    wsISO: string;
    weISO: string;
    hardPlannedMin: number;
    factMin: number;
    doneCount: number;
    rolloverCount: number;
    topSinks: { name: string; min: number }[];
  } | null>(null);

  const dayCapacityMin = useMemo(() => {
    if (!settings) return 0;
    return Math.max(0, settings.dayEndMin - settings.dayStartMin);
  }, [settings]);

  const hardPlannedMin = useMemo(() => {
    return blocks.reduce((acc, b) => acc + Math.max(0, b.endMin - b.startMin), 0);
  }, [blocks]);

  const allowedHardMin = useMemo(() => {
    if (!settings) return 0;
    const planPct = clamp(100 - settings.reservePercent, 0, 100);
    return Math.round((dayCapacityMin * planPct) / 100);
  }, [settings, dayCapacityMin]);

  async function reloadAll() {
    const s = await getRitualSettings();
    setSettings(s);
    await reloadDay(dayISO);
    await reloadWeek(weekAnchorISO);
  }

  async function reloadDay(dateISO: string) {
    const s = await getRitualSettings();
    setSettings(s);

    const dayBlocks = await db.scheduleBlocks.where("date").equals(dateISO).sortBy("startMin");
    setBlocks(dayBlocks);

    const activePlanned = await db.tasks
      .where("status")
      .equals("active")
      .and((t) => t.plannedDate === dateISO)
      .toArray();

    const activeInbox = await db.tasks
      .where("status")
      .equals("active")
      .and((t) => !t.plannedDate)
      .reverse()
      .sortBy("createdAt");

    const blockTaskIds = Array.from(new Set(dayBlocks.map((b) => b.taskId)));
    const blockTasks = (await db.tasks.bulkGet(blockTaskIds)).filter(Boolean) as Task[];

    const map: Record<string, Task> = {};
    for (const t of [...blockTasks, ...activePlanned, ...activeInbox]) map[t.id] = t;

    setTaskMap(map);
    setPlannedTasks(activePlanned);
    setInbox(activeInbox.slice(-50).reverse());
  }

  async function reloadWeek(anchorISO: string) {
    const { ws, we, wsISO, weISO } = weekRangeISO(anchorISO);

    // hard planned = sum schedule blocks in week
    const blocksAll = await db.scheduleBlocks.toArray();
    const weekBlocks = blocksAll.filter((b) => {
      const d = parseISO(b.date);
      return isWithinInterval(d, { start: ws, end: we });
    });

    const hardMin = weekBlocks.reduce((acc, b) => acc + Math.max(0, b.endMin - b.startMin), 0);

    // fact = sum timelogs in week
    const logsAll = await db.timeLogs.toArray();
    const weekLogs = logsAll.filter((l) => {
      const d = parseISO(l.date);
      return isWithinInterval(d, { start: ws, end: we });
    });
    const factMin = weekLogs.reduce((acc, l) => acc + (l.durationMin || 0), 0);

    // done tasks in week (по doneAt)
    const tasksAll = await db.tasks.toArray();
    const doneCount = tasksAll.filter((t) => {
      if (t.status !== "done" || !t.doneAt) return false;
      const dt = new Date(t.doneAt);
      return isWithinInterval(dt, { start: ws, end: we });
    }).length;

    // rollover count: сколько раз меняли plannedDate (по EventLog type task_planned_date_set) внутри недели
    const eventsAll = await db.eventLogs
      .where("type")
      .equals("task_planned_date_set")
      .toArray();

    const rolloverCount = eventsAll.filter((e) => {
      const dt = new Date(e.ts);
      return isWithinInterval(dt, { start: ws, end: we });
    }).length;

    // top sinks (если есть sinkId)
    const sinks = await db.sinks.toArray();
    const sinkName: Record<string, string> = {};
    for (const s of sinks) sinkName[s.id] = s.name;

    const sinkAgg: Record<string, number> = {};
    for (const l of weekLogs) {
      const sid = l.sinkId ?? "none";
      sinkAgg[sid] = (sinkAgg[sid] ?? 0) + (l.durationMin || 0);
    }

    const topSinks = Object.entries(sinkAgg)
      .map(([id, min]) => ({
        name: id === "none" ? "Без категории (не задан sinkId)" : sinkName[id] ?? `Sink ${id}`,
        min
      }))
      .sort((a, b) => b.min - a.min)
      .slice(0, 6);

    setWeekStats({
      wsISO,
      weISO,
      hardPlannedMin: hardMin,
      factMin,
      doneCount,
      rolloverCount,
      topSinks
    });
  }

  useEffect(() => {
    void reloadAll();

    const handler = () => void reloadAll();
    db.on("changes", handler);

    return () => {
      db.on("changes").unsubscribe(handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Actions ---
  async function setFrog(taskId: string, on: boolean) {
    const s = await getRitualSettings();
    const frogByDate = s.ritual!.frogByDate!;
    const cur = new Set(frogByDate[dayISO] ?? []);

    if (on) {
      if (cur.size >= 2 && !cur.has(taskId)) {
        alert("Лягушек максимум 2. Идея: 1–2 ключевые задачи дня.");
        return;
      }
      cur.add(taskId);
    } else {
      cur.delete(taskId);
    }

    frogByDate[dayISO] = Array.from(cur);
    await putRitualSettings(s);
    setSettings(s);
  }

  async function setDayNote(note: string) {
    const s = await getRitualSettings();
    s.ritual!.dailyNoteByDate![dayISO] = note;
    await putRitualSettings(s);
    setSettings(s);
  }

  async function markDone(taskId: string) {
    const t = await db.tasks.get(taskId);
    if (!t) return;

    const now = Date.now();
    await db.tasks.update(taskId, { status: "done", updatedAt: now, doneAt: now });

    // чистим блоки расписания для этой задачи на этот день (чтобы не висели)
    const bs = await db.scheduleBlocks.where({ date: dayISO, taskId }).toArray();
    if (bs.length) await db.scheduleBlocks.bulkDelete(bs.map((b) => b.id));

    await logEvent({ type: "task_done", taskId });
  }

  async function moveTo(taskId: string, plannedDate?: string, reason?: string) {
    const now = Date.now();
    await db.tasks.update(taskId, { plannedDate, updatedAt: now });

    // Если переносим/снимаем — чистим блоки на текущий день
    const bs = await db.scheduleBlocks.where({ date: dayISO, taskId }).toArray();
    if (bs.length) await db.scheduleBlocks.bulkDelete(bs.map((b) => b.id));

    await logEvent({
      type: "task_planned_date_set",
      taskId,
      payload: { from: dayISO, to: plannedDate ?? null, reason: reason ?? null }
    });
  }

  async function assignFromInbox(taskId: string) {
    await moveTo(taskId, dayISO, "Назначено на день из inbox");
  }

  async function weeklyMarkDone(done: boolean) {
    const s = await getRitualSettings();
    const { wsISO } = weekRangeISO(weekAnchorISO);
    s.ritual!.weeklyReviewDone![wsISO] = done;
    await putRitualSettings(s);
    setSettings(s);
  }

  const tomorrowISO = useMemo(() => {
    const d = addDays(new Date(dayISO + "T00:00:00"), 1);
    return ymd(d);
  }, [dayISO]);

  const weeklyDone = useMemo(() => {
    if (!settings) return false;
    const { wsISO } = weekRangeISO(weekAnchorISO);
    return settings.ritual?.weeklyReviewDone?.[wsISO] ?? false;
  }, [settings, weekAnchorISO]);

  // --- UI helpers ---
  const dayScheduledTaskIds = useMemo(() => {
    return new Set(blocks.map((b) => b.taskId));
  }, [blocks]);

  const dayTasksSorted = useMemo(() => {
    const list = [...plannedTasks];
    // вверху лягушки, затем те что уже в расписании, затем прочие
    const frogSet = new Set(frogIds);
    list.sort((a, b) => {
      const af = frogSet.has(a.id) ? 1 : 0;
      const bf = frogSet.has(b.id) ? 1 : 0;
      if (af !== bf) return bf - af;

      const as = dayScheduledTaskIds.has(a.id) ? 1 : 0;
      const bs = dayScheduledTaskIds.has(b.id) ? 1 : 0;
      if (as !== bs) return bs - as;

      return (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt);
    });
    return list;
  }, [plannedTasks, frogIds, dayScheduledTaskIds]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Review</h1>
          <div className="text-slate-300 text-sm">
            Ритуалы = то, что превращает планирование в систему (день ↔ неделя ↔ корректировки).
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setTab("morning")}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              tab === "morning" ? "bg-slate-50 text-slate-950 font-semibold" : "bg-slate-900 text-slate-200"
            }`}
          >
            Morning
          </button>
          <button
            onClick={() => setTab("evening")}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              tab === "evening" ? "bg-slate-50 text-slate-950 font-semibold" : "bg-slate-900 text-slate-200"
            }`}
          >
            Evening
          </button>
          <button
            onClick={() => setTab("weekly")}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              tab === "weekly" ? "bg-slate-50 text-slate-950 font-semibold" : "bg-slate-900 text-slate-200"
            }`}
          >
            Weekly
          </button>
        </div>
      </div>

      {/* --- MORNING --- */}
      {tab === "morning" && (
        <div className="space-y-4">
          <section className="p-3 rounded-xl border border-slate-800 bg-slate-950">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-semibold">Утренний ритуал</h2>
              <input
                type="date"
                value={dayISO}
                onChange={(e) => {
                  setDayISO(e.target.value);
                  void reloadDay(e.target.value);
                }}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {settings && (
              <div className="mt-3 text-sm text-slate-300">
                Окно дня:{" "}
                <span className="font-semibold text-slate-50">
                  {minToHHMM(settings.dayStartMin)}–{minToHHMM(settings.dayEndMin)}
                </span>{" "}
                · Жёстко: <span className="font-semibold text-slate-50">{hardPlannedMin} мин</span> ·
                Лимит 60/40: <span className="font-semibold text-slate-50">{allowedHardMin} мин</span>
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                <div className="font-semibold">Шаг 1 — Лягушка дня (1–2 задачи)</div>
                <div className="text-xs text-slate-400 mt-1">
                  Выбери самое важное. Это снижает риск “эффективно делать не то”.
                </div>

                {dayTasksSorted.length === 0 ? (
                  <div className="mt-3 text-sm text-slate-400">На этот день пока нет задач. Назначь из Inbox ниже.</div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {dayTasksSorted.slice(0, 10).map((t) => {
                      const isFrog = frogIds.includes(t.id);
                      return (
                        <div
                          key={t.id}
                          className={`rounded-lg border px-3 py-2 flex items-start justify-between gap-3 ${
                            isFrog
                              ? "border-emerald-300 bg-emerald-950/20"
                              : "border-slate-800 bg-slate-900/40"
                          }`}
                        >
                          <div>
                            <div className="text-sm font-semibold">{t.title}</div>
                            <div className="text-xs text-slate-400">
                              {t.estimateMin ? `${t.estimateMin} мин` : "без оценки"}
                              {dayScheduledTaskIds.has(t.id) ? " · в расписании" : ""}
                            </div>
                          </div>
                          <button
                            onClick={() => void setFrog(t.id, !isFrog)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                              isFrog ? "bg-emerald-200 text-emerald-950" : "bg-slate-50 text-slate-950"
                            }`}
                          >
                            {isFrog ? "Выбрано" : "Лягушка"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                <div className="font-semibold">Шаг 2 — Быстро назначить из Inbox</div>
                <div className="text-xs text-slate-400 mt-1">
                  Чтобы инбокс не разрастался, часть задач превращаем в план на конкретный день.
                </div>

                {inbox.length === 0 ? (
                  <div className="mt-3 text-sm text-slate-400">Inbox пуст — отлично.</div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {inbox.slice(0, 8).map((t) => (
                      <div
                        key={t.id}
                        className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 flex items-start justify-between gap-3"
                      >
                        <div>
                          <div className="text-sm font-semibold">{t.title}</div>
                          <div className="text-xs text-slate-400">
                            {t.estimateMin ? `${t.estimateMin} мин` : "без оценки"}
                          </div>
                        </div>
                        <button
                          onClick={() => void assignFromInbox(t.id)}
                          className="px-3 py-1.5 rounded-lg bg-slate-50 text-slate-950 text-xs font-semibold"
                        >
                          На день
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-slate-800">
                  <div className="font-semibold">Шаг 3 — 60/40 чек</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Если жёстких блоков слишком много — почти гарантированно сорвёшь план.
                  </div>
                  {hardPlannedMin > allowedHardMin ? (
                    <div className="mt-2 text-sm text-amber-300">
                      Переплан: жёстких блоков больше лимита. Освободи часть времени или расширь диапазон дня.
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-slate-300">Ок: запас под непредвиденное есть.</div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="p-3 rounded-xl border border-slate-800 bg-slate-950">
            <div className="font-semibold">Заметка на день</div>
            <div className="text-xs text-slate-400 mt-1">
              Коротко: на чём фокус, какие ограничения, что важно не забыть.
            </div>
            <textarea
              value={dayNote}
              onChange={(e) => void setDayNote(e.target.value)}
              className="mt-2 w-full min-h-24 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
              placeholder="Напр.: Лягушка — закончить раздел отчёта. Не залипать в чаты до обеда. Резерв оставить."
            />
          </section>
        </div>
      )}

      {/* --- EVENING --- */}
      {tab === "evening" && (
        <div className="space-y-4">
          <section className="p-3 rounded-xl border border-slate-800 bg-slate-950">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-semibold">Вечернее закрытие</h2>
              <input
                type="date"
                value={dayISO}
                onChange={(e) => {
                  setDayISO(e.target.value);
                  void reloadDay(e.target.value);
                }}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div className="mt-2 text-sm text-slate-300">
              Цель: закрыть хвосты, осознанно перенести то, что не сделал, и зафиксировать причину.
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                <div className="font-semibold">Задачи дня</div>
                <div className="text-xs text-slate-400 mt-1">
                  Done / перенести на завтра / вернуть в inbox. Причина — чтобы weekly review был умным.
                </div>

                {dayTasksSorted.length === 0 ? (
                  <div className="mt-3 text-sm text-slate-400">На этот день задач нет.</div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {dayTasksSorted.map((t) => {
                      const isFrog = frogIds.includes(t.id);
                      const isScheduled = dayScheduledTaskIds.has(t.id);
                      return (
                        <div
                          key={t.id}
                          className={`rounded-lg border px-3 py-2 ${
                            isFrog ? "border-emerald-300 bg-emerald-950/20" : "border-slate-800 bg-slate-900/40"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold">
                                {t.title}{" "}
                                {isFrog && <span className="text-xs text-emerald-300">· лягушка</span>}
                              </div>
                              <div className="text-xs text-slate-400">
                                {t.estimateMin ? `${t.estimateMin} мин` : "без оценки"}
                                {isScheduled ? " · было в расписании" : ""}
                              </div>
                            </div>
                            <button
                              onClick={() => void markDone(t.id)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-200 text-emerald-950 text-xs font-semibold"
                            >
                              Done
                            </button>
                          </div>

                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <button
                              onClick={() => void moveTo(t.id, tomorrowISO, "Не успел: перенёс на завтра")}
                              className="px-3 py-1.5 rounded-lg bg-slate-50 text-slate-950 text-xs font-semibold"
                            >
                              На завтра
                            </button>
                            <button
                              onClick={() => void moveTo(t.id, undefined, "Вернул в inbox")}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-100 text-xs"
                            >
                              В inbox
                            </button>
                            <button
                              onClick={() => {
                                const reason = prompt("Коротко причина переноса (например: недооценил, отвлекли, нет энергии, ждал ответа)?");
                                void moveTo(t.id, tomorrowISO, reason ?? "Перенос без причины");
                              }}
                              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-xs"
                            >
                              Причина…
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                <div className="font-semibold">Заметка дня (итог)</div>
                <div className="text-xs text-slate-400 mt-1">
                  2–3 строки: что получилось, что нет, что улучшить завтра.
                </div>
                <textarea
                  value={dayNote}
                  onChange={(e) => void setDayNote(e.target.value)}
                  className="mt-2 w-full min-h-32 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                  placeholder="Напр.: Лягушка не сделана — недооценил объём, завтра дроблю. Слишком много созвонов."
                />
              </div>
            </div>
          </section>
        </div>
      )}

      {/* --- WEEKLY --- */}
      {tab === "weekly" && (
        <div className="space-y-4">
          <section className="p-3 rounded-xl border border-slate-800 bg-slate-950">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-semibold">Weekly review</h2>
              <input
                type="date"
                value={weekAnchorISO}
                onChange={(e) => {
                  setWeekAnchorISO(e.target.value);
                  void reloadWeek(e.target.value);
                }}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                title="Выбери дату — неделя будет построена вокруг неё (Пн–Вс)"
              />
            </div>

            {weekStats ? (
              <>
                <div className="mt-2 text-sm text-slate-300">
                  Неделя: <span className="font-semibold">{weekStats.wsISO}</span> —{" "}
                  <span className="font-semibold">{weekStats.weISO}</span>
                </div>

                <div className="mt-3 grid grid-cols-1 lg:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                    <div className="text-xs text-slate-400">Жёстко запланировано</div>
                    <div className="text-lg font-semibold">{weekStats.hardPlannedMin} мин</div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                    <div className="text-xs text-slate-400">Факт (таймлоги)</div>
                    <div className="text-lg font-semibold">{weekStats.factMin} мин</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Если пока не ведёшь таймлоги — будет ноль (мы добавим экран таймера позже).
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                    <div className="text-xs text-slate-400">Сделано задач</div>
                    <div className="text-lg font-semibold">{weekStats.doneCount}</div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                    <div className="text-xs text-slate-400">Переносов (plannedDate set)</div>
                    <div className="text-lg font-semibold">{weekStats.rolloverCount}</div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                    <div className="font-semibold">Топ “поглотителей” (если логи уже есть)</div>
                    {weekStats.topSinks.length === 0 ? (
                      <div className="mt-2 text-sm text-slate-400">Пока нечего показать.</div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {weekStats.topSinks.map((s) => (
                          <div
                            key={s.name}
                            className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2"
                          >
                            <div className="text-sm font-semibold">{s.name}</div>
                            <div className="text-sm text-slate-200">{s.min} мин</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                    <div className="font-semibold">Чеклист weekly review</div>
                    <div className="text-xs text-slate-400 mt-1">
                      Десять минут “думать” экономят десятки часов “делать не то”.
                    </div>

                    <div className="mt-3 space-y-2 text-sm text-slate-300">
                      <div>1) Что было самым ценным результатом недели?</div>
                      <div>2) Какие 1–2 причины срыва плана повторяются?</div>
                      <div>3) Какие поглотители забрали больше всего времени?</div>
                      <div>4) Что убрать/упростить на следующей неделе?</div>
                      <div>5) Три ключевые задачи следующей недели (A)?</div>
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <button
                        onClick={() => void weeklyMarkDone(true)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                          weeklyDone ? "bg-emerald-200 text-emerald-950" : "bg-slate-50 text-slate-950"
                        }`}
                      >
                        {weeklyDone ? "Отмечено выполненным" : "Отметить выполненным"}
                      </button>
                      {weeklyDone && (
                        <button
                          onClick={() => void weeklyMarkDone(false)}
                          className="px-4 py-2 rounded-lg bg-slate-800 text-slate-100 text-sm"
                        >
                          Снять отметку
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-3 text-sm text-slate-400">Загрузка статистики недели…</div>
            )}
          </section>
        </div>
      )}

      <div className="text-xs text-slate-500">
        Следующий шаг: AnalyticsPage (графики) и затем TimePage/таймер (чтобы fact/поглотители стали точными).
      </div>
    </div>
  );
}
