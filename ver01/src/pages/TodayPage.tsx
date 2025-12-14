import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  db,
  ensureDefaultSettings,
  logEvent,
  type Settings,
  type Task,
  type ScheduleBlock
} from "../data/db";

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function minToHHMM(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function uuid() {
  // Modern browsers support crypto.randomUUID; fallback is ok for local-only
  return (globalThis.crypto?.randomUUID?.() ??
    `id_${Date.now()}_${Math.random().toString(16).slice(2)}`) as string;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function TodayPage() {
  const [date, setDate] = useState<string>(() => ymd(new Date()));
  const [settings, setSettings] = useState<Settings | null>(null);

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [taskMap, setTaskMap] = useState<Record<string, Task>>({});

  const [plannedFlexible, setPlannedFlexible] = useState<Task[]>([]);
  const [inbox, setInbox] = useState<Task[]>([]);

  const [quickTitle, setQuickTitle] = useState("");
  const [quickEstimate, setQuickEstimate] = useState<number>(30);

  const dayCapacityMin = useMemo(() => {
    if (!settings) return 0;
    return Math.max(0, settings.dayEndMin - settings.dayStartMin);
  }, [settings]);

  const plannedHardMin = useMemo(() => {
    return blocks.reduce((acc, b) => acc + Math.max(0, b.endMin - b.startMin), 0);
  }, [blocks]);

  const plannedHardPct = useMemo(() => {
    if (!dayCapacityMin) return 0;
    return clamp(Math.round((plannedHardMin / dayCapacityMin) * 100), 0, 999);
  }, [plannedHardMin, dayCapacityMin]);

  const allowedHardMin = useMemo(() => {
    if (!settings) return 0;
    // правило 60/40: планируем ~60% оставляя reservePercent как резерв
    const planPct = clamp(100 - settings.reservePercent, 0, 100);
    return Math.round((dayCapacityMin * planPct) / 100);
  }, [settings, dayCapacityMin]);

  async function reload(forDate: string) {
    await ensureDefaultSettings();
    const s = await db.settings.get("singleton");
    if (!s) return; // не должно случиться
    setSettings(s);

    const dayBlocks = await db.scheduleBlocks.where("date").equals(forDate).sortBy("startMin");
    setBlocks(dayBlocks);

    const blockTaskIds = Array.from(new Set(dayBlocks.map((b) => b.taskId)));
    const blockTasks = (await db.tasks.bulkGet(blockTaskIds)).filter(Boolean) as Task[];

    // задачи, назначенные на этот день (гибкие), плюс задачи без plannedDate (инбокс)
    const activePlanned = await db.tasks
      .where("status")
      .equals("active")
      .and((t) => t.plannedDate === forDate)
      .toArray();

    const activeInbox = await db.tasks
      .where("status")
      .equals("active")
      .and((t) => !t.plannedDate)
      .reverse()
      .sortBy("createdAt");

    // гибкие задачи дня = activePlanned минус те, что уже в жёстких блоках
    const scheduledIds = new Set(blockTaskIds);
    const flexible = activePlanned.filter((t) => !scheduledIds.has(t.id));

    // собрать map id->task (чтобы в блоках показывать названия)
    const map: Record<string, Task> = {};
    for (const t of [...blockTasks, ...activePlanned, ...activeInbox]) map[t.id] = t;

    setTaskMap(map);
    setPlannedFlexible(flexible);
    setInbox(activeInbox.slice(-30).reverse()); // показываем последние 30 (сверху новые)
  }

  useEffect(() => {
    let alive = true;

    const init = async () => {
      await reload(date);
      if (!alive) return;
    };

    void init();

    // минимальная “реактивность”: слушаем изменения в Dexie и перезагружаем
    const handler = () => {
      void reload(date);
    };

    db.on("changes", handler);

    return () => {
      alive = false;
      db.on("changes").unsubscribe(handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function addTask() {
    const title = quickTitle.trim();
    if (!title) return;

    const now = Date.now();
    const id = uuid();

    const task: Task = {
      id,
      title,
      description: "",
      tagIds: [],
      contextIds: [],
      estimateMin: clamp(Number.isFinite(quickEstimate) ? quickEstimate : 30, 5, 24 * 60),
      plannedDate: date, // по умолчанию кидаем в текущий день как гибкую
      status: "active",
      createdAt: now,
      updatedAt: now
    };

    await db.tasks.put(task);
    await logEvent({ type: "task_created", taskId: id, payload: { plannedDate: date } });

    setQuickTitle("");
  }

  async function markDone(taskId: string) {
    const t = await db.tasks.get(taskId);
    if (!t) return;

    const now = Date.now();
    await db.tasks.update(taskId, {
      status: "done",
      updatedAt: now,
      doneAt: now
    });

    // удалить блоки этого дня, если были (чтобы “очистилось расписание”)
    const bs = await db.scheduleBlocks.where({ date, taskId }).toArray();
    if (bs.length) {
      await db.scheduleBlocks.bulkDelete(bs.map((b) => b.id));
    }

    await logEvent({ type: "task_done", taskId });
  }

  function findNextSlot(s: Settings, dayBlocks: ScheduleBlock[], durMin: number) {
    const start = s.dayStartMin;
    const end = s.dayEndMin;

    const sorted = [...dayBlocks].sort((a, b) => a.startMin - b.startMin);

    // если нет блоков — ставим с начала дня
    if (sorted.length === 0) {
      return { startMin: start, endMin: clamp(start + durMin, start, end) };
    }

    // окно до первого блока
    if (start + durMin <= sorted[0].startMin) {
      return { startMin: start, endMin: start + durMin };
    }

    // окна между блоками
    for (let i = 0; i < sorted.length - 1; i++) {
      const gapStart = sorted[i].endMin;
      const gapEnd = sorted[i + 1].startMin;
      if (gapStart + durMin <= gapEnd) {
        return { startMin: gapStart, endMin: gapStart + durMin };
      }
    }

    // после последнего блока
    const lastEnd = sorted[sorted.length - 1].endMin;
    if (lastEnd + durMin <= end) {
      return { startMin: lastEnd, endMin: lastEnd + durMin };
    }

    return null;
  }

  async function quickSchedule(taskId: string) {
    if (!settings) return;

    const t = await db.tasks.get(taskId);
    if (!t) return;

    const dur = clamp(t.estimateMin ?? 30, 10, settings.dayEndMin - settings.dayStartMin);
    const slot = findNextSlot(settings, blocks, dur);

    if (!slot) {
      alert("Нет свободного окна в рабочем диапазоне. Либо уменьшай длительность, либо расширь часы в Settings.");
      return;
    }

    const now = Date.now();
    const blockId = uuid();

    const b: ScheduleBlock = {
      id: blockId,
      taskId,
      date,
      startMin: slot.startMin,
      endMin: slot.endMin,
      locked: false,
      createdAt: now,
      updatedAt: now
    };

    await db.scheduleBlocks.put(b);
    await logEvent({
      type: "block_created",
      taskId,
      payload: { date, startMin: b.startMin, endMin: b.endMin }
    });
  }

  async function unschedule(taskId: string) {
    const bs = await db.scheduleBlocks.where({ date, taskId }).toArray();
    if (!bs.length) return;
    await db.scheduleBlocks.bulkDelete(bs.map((b) => b.id));
    await logEvent({ type: "block_deleted", taskId, payload: { date } });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Today</h1>
          <div className="text-slate-300 text-sm">
            Жёсткое/гибкое планирование + 60/40 + быстрые действия
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* 60/40 indicator */}
      {settings && (
        <div className="p-3 rounded-xl border border-slate-800 bg-slate-950">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-200">
              Жёстко запланировано: <span className="font-semibold">{plannedHardMin} мин</span>{" "}
              <span className="text-slate-400">({plannedHardPct}%)</span>
            </div>
            <div className="text-sm text-slate-400">
              Лимит по 60/40: <span className="text-slate-200 font-semibold">{allowedHardMin} мин</span>
            </div>
          </div>
          <div className="mt-2 h-2 rounded bg-slate-900 overflow-hidden">
            <div
              className="h-2 bg-slate-200"
              style={{ width: `${clamp(Math.round((plannedHardMin / Math.max(1, dayCapacityMin)) * 100), 0, 100)}%` }}
            />
          </div>
          {plannedHardMin > allowedHardMin && (
            <div className="mt-2 text-xs text-amber-300">
              Переплан: жёстких блоков больше, чем рекомендовано. По правилу 60/40 лучше освободить часть времени под
              непредвиденное.
            </div>
          )}
        </div>
      )}

      {/* Quick add */}
      <div className="p-3 rounded-xl border border-slate-800 bg-slate-950">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder="Быстро добавить задачу (по умолчанию в гибкие на этот день)…"
            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={5}
            max={1440}
            value={quickEstimate}
            onChange={(e) => setQuickEstimate(parseInt(e.target.value || "30", 10))}
            className="w-28 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            title="Оценка в минутах"
          />
          <button
            onClick={() => void addTask()}
            className="px-4 py-2 rounded-lg bg-slate-50 text-slate-950 text-sm font-semibold hover:bg-white"
          >
            Добавить
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-400">
          Совет: оценка нужна для реалистичности и 60/40. Позже добавим “быстрый парсер” (#теги, 60м, !важно).
        </div>
      </div>

      {/* Layout: schedule + flexible list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hard schedule */}
        <section className="p-3 rounded-xl border border-slate-800 bg-slate-950">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Жёсткие блоки</h2>
            {settings && (
              <div className="text-xs text-slate-400">
                {minToHHMM(settings.dayStartMin)}–{minToHHMM(settings.dayEndMin)}
              </div>
            )}
          </div>

          {blocks.length === 0 ? (
            <div className="mt-3 text-sm text-slate-400">Пока нет жёстких блоков на этот день.</div>
          ) : (
            <div className="mt-3 space-y-2">
              {blocks.map((b) => {
                const t = taskMap[b.taskId];
                return (
                  <div
                    key={b.id}
                    className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 flex items-start justify-between gap-3"
                  >
                    <div>
                      <div className="text-xs text-slate-400">
                        {minToHHMM(b.startMin)}–{minToHHMM(b.endMin)}
                      </div>
                      <div className="text-sm font-semibold">{t?.title ?? "Задача"}</div>
                      {t?.estimateMin ? (
                        <div className="text-xs text-slate-400">Оценка: {t.estimateMin} мин</div>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void markDone(b.taskId)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-200 text-emerald-950 text-xs font-semibold"
                      >
                        Done
                      </button>
                      <button
                        onClick={() => void unschedule(b.taskId)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-100 text-xs"
                      >
                        Снять
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Flexible tasks */}
        <section className="p-3 rounded-xl border border-slate-800 bg-slate-950">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Гибкие задачи дня</h2>
            <div className="text-xs text-slate-400">Перетаскивание добавим следующим шагом</div>
          </div>

          {plannedFlexible.length === 0 ? (
            <div className="mt-3 text-sm text-slate-400">
              Нет гибких задач на этот день. Добавь задачу или назначь её на дату.
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {plannedFlexible.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 flex items-start justify-between gap-3"
                >
                  <div>
                    <div className="text-sm font-semibold">{t.title}</div>
                    <div className="text-xs text-slate-400">
                      {t.estimateMin ? `Оценка: ${t.estimateMin} мин` : "Без оценки"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void quickSchedule(t.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-50 text-slate-950 text-xs font-semibold"
                    >
                      В сетку
                    </button>
                    <button
                      onClick={() => void markDone(t.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-200 text-emerald-950 text-xs font-semibold"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Inbox (не назначены на дату)</h3>
              <div className="text-xs text-slate-400">последние {inbox.length}</div>
            </div>

            {inbox.length === 0 ? (
              <div className="mt-2 text-sm text-slate-400">
                Инбокс пуст — это хорошо. Если ты добавляешь задачи “на потом”, они появятся тут.
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {inbox.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-2 flex items-start justify-between gap-3"
                  >
                    <div>
                      <div className="text-sm font-semibold">{t.title}</div>
                      <div className="text-xs text-slate-400">
                        {t.estimateMin ? `Оценка: ${t.estimateMin} мин` : "Без оценки"}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          const now = Date.now();
                          await db.tasks.update(t.id, { plannedDate: date, updatedAt: now });
                          await logEvent({ type: "task_planned_date_set", taskId: t.id, payload: { plannedDate: date } });
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-100 text-xs"
                      >
                        На день
                      </button>
                      <button
                        onClick={() => void markDone(t.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-200 text-emerald-950 text-xs font-semibold"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
