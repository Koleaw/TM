import { useEffect, useMemo, useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { db, logEvent, type Task } from "../data/db";

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function weekStartISO(date: Date) {
  // Неделя начинается с понедельника (как обычно в РФ/Европе)
  return startOfWeek(date, { weekStartsOn: 1 });
}

function uuid() {
  return (globalThis.crypto?.randomUUID?.() ??
    `id_${Date.now()}_${Math.random().toString(16).slice(2)}`) as string;
}

const weekDayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export default function WeekPage() {
  const [anchorDate, setAnchorDate] = useState<string>(() => ymd(new Date()));

  const [weekTasksByDate, setWeekTasksByDate] = useState<Record<string, Task[]>>({});
  const [inbox, setInbox] = useState<Task[]>([]);

  const [quickTitle, setQuickTitle] = useState("");
  const [quickEstimate, setQuickEstimate] = useState<number>(30);
  const [quickTarget, setQuickTarget] = useState<string>("inbox"); // "inbox" | YYYY-MM-DD

  const weekDates = useMemo(() => {
    const ws = weekStartISO(new Date(anchorDate + "T00:00:00"));
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, [anchorDate]);

  const dateKeys = useMemo(() => weekDates.map((d) => ymd(d)), [weekDates]);

  async function reload() {
    // Инбокс
    const activeInbox = await db.tasks
      .where("status")
      .equals("active")
      .and((t) => !t.plannedDate)
      .reverse()
      .sortBy("createdAt");
    setInbox(activeInbox.slice(-50).reverse());

    // Задачи недели (plannedDate in dateKeys)
    const allPlanned = await db.tasks
      .where("status")
      .equals("active")
      .and((t) => t.plannedDate !== undefined && dateKeys.includes(t.plannedDate))
      .toArray();

    const map: Record<string, Task[]> = {};
    for (const k of dateKeys) map[k] = [];
    for (const t of allPlanned) {
      if (!t.plannedDate) continue;
      map[t.plannedDate] ??= [];
      map[t.plannedDate].push(t);
    }

    // Сортировка: по createdAt (потом сделаем ручной order/приоритет)
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
    }

    setWeekTasksByDate(map);
  }

  useEffect(() => {
    void reload();

    const handler = () => void reload();
    db.on("changes", handler);

    return () => {
      db.on("changes").unsubscribe(handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorDate, dateKeys.join(",")]);

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
      estimateMin: Math.max(5, Math.min(24 * 60, Number.isFinite(quickEstimate) ? quickEstimate : 30)),
      plannedDate: quickTarget === "inbox" ? undefined : quickTarget,
      status: "active",
      createdAt: now,
      updatedAt: now
    };

    await db.tasks.put(task);
    await logEvent({
      type: "task_created",
      taskId: id,
      payload: { plannedDate: task.plannedDate ?? null }
    });

    setQuickTitle("");
    setQuickTarget("inbox");
  }

  async function setPlannedDate(taskId: string, plannedDate?: string) {
    const now = Date.now();
    await db.tasks.update(taskId, { plannedDate, updatedAt: now });
    await logEvent({
      type: "task_planned_date_set",
      taskId,
      payload: { plannedDate: plannedDate ?? null }
    });
  }

  async function moveDay(task: Task, delta: -1 | 1) {
    if (!task.plannedDate) return;
    const idx = dateKeys.indexOf(task.plannedDate);
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx > 6) return;
    await setPlannedDate(task.id, dateKeys[nextIdx]);
  }

  async function markDone(taskId: string) {
    const t = await db.tasks.get(taskId);
    if (!t) return;
    const now = Date.now();
    await db.tasks.update(taskId, { status: "done", updatedAt: now, doneAt: now });

    // если вдруг были блоки расписания — очистим их для этой задачи
    const bs = await db.scheduleBlocks.where("taskId").equals(taskId).toArray();
    if (bs.length) await db.scheduleBlocks.bulkDelete(bs.map((b) => b.id));

    await logEvent({ type: "task_done", taskId });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Week</h1>
          <div className="text-slate-300 text-sm">
            Планирование недели: распределяем задачи по дням (без минут), потом детализируем в Today.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            title="Выбери дату — неделя будет построена вокруг неё (начало с Пн)"
          />
        </div>
      </div>

      {/* Quick add */}
      <div className="p-3 rounded-xl border border-slate-800 bg-slate-950">
        <div className="flex flex-col lg:flex-row gap-2">
          <input
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder="Быстро добавить задачу…"
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
          <select
            value={quickTarget}
            onChange={(e) => setQuickTarget(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            title="Куда добавить задачу: в инбокс или на день недели"
          >
            <option value="inbox">Inbox</option>
            {weekDates.map((d, i) => {
              const k = ymd(d);
              return (
                <option key={k} value={k}>
                  {weekDayLabels[i]} {format(d, "dd.MM")}
                </option>
              );
            })}
          </select>
          <button
            onClick={() => void addTask()}
            className="px-4 py-2 rounded-lg bg-slate-50 text-slate-950 text-sm font-semibold hover:bg-white"
          >
            Добавить
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-400">
          Здесь мы распределяем задачи по дням. Детальное расписание по минутам — в Today.
        </div>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-3">
        {weekDates.map((d, i) => {
          const k = ymd(d);
          const tasks = weekTasksByDate[k] ?? [];
          const dayLabel = `${weekDayLabels[i]} ${format(d, "dd.MM")}`;

          return (
            <section key={k} className="p-3 rounded-xl border border-slate-800 bg-slate-950">
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-semibold">{dayLabel}</div>
                <div className="text-xs text-slate-400">{tasks.length}</div>
              </div>

              {tasks.length === 0 ? (
                <div className="mt-2 text-sm text-slate-400">Пусто</div>
              ) : (
                <div className="mt-2 space-y-2">
                  {tasks.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">{t.title}</div>
                          <div className="text-xs text-slate-400">
                            {t.estimateMin ? `${t.estimateMin} мин` : "без оценки"}
                          </div>
                        </div>

                        <div className="flex gap-1">
                          <button
                            onClick={() => void moveDay(t, -1)}
                            className="px-2 py-1 rounded bg-slate-800 text-slate-100 text-xs disabled:opacity-40"
                            disabled={i === 0}
                            title="На предыдущий день"
                          >
                            ←
                          </button>
                          <button
                            onClick={() => void moveDay(t, 1)}
                            className="px-2 py-1 rounded bg-slate-800 text-slate-100 text-xs disabled:opacity-40"
                            disabled={i === 6}
                            title="На следующий день"
                          >
                            →
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          onClick={() => void markDone(t.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-200 text-emerald-950 text-xs font-semibold"
                        >
                          Done
                        </button>
                        <button
                          onClick={() => void setPlannedDate(t.id, undefined)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-100 text-xs"
                        >
                          В inbox
                        </button>
                        <button
                          onClick={() => {
                            // Удобный “переход в Today” через смену URL
                            // (позже сделаем: клик по дню открывает Today с нужной датой)
                            window.location.href = `${window.location.origin}${window.location.pathname}#/today`;
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-50 text-slate-950 text-xs font-semibold"
                          title="Детализировать день в Today"
                        >
                          Today
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick assign from inbox (показываем 3-5 последних как “быстрые кандидаты”) */}
              <div className="mt-3 pt-3 border-t border-slate-800">
                <div className="text-xs text-slate-400 mb-2">Быстро назначить из inbox</div>
                {inbox.slice(0, 4).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => void setPlannedDate(t.id, k)}
                    className="w-full text-left mb-2 last:mb-0 px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800 hover:bg-slate-900 text-sm"
                    title="Назначить на этот день"
                  >
                    <div className="font-semibold">{t.title}</div>
                    <div className="text-xs text-slate-400">
                      {t.estimateMin ? `${t.estimateMin} мин` : "без оценки"}
                    </div>
                  </button>
                ))}
                {inbox.length === 0 && (
                  <div className="text-sm text-slate-400">Инбокс пуст</div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Inbox full */}
      <section className="p-3 rounded-xl border border-slate-800 bg-slate-950">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Inbox</h2>
          <div className="text-xs text-slate-400">{inbox.length}</div>
        </div>

        {inbox.length === 0 ? (
          <div className="mt-2 text-sm text-slate-400">Инбокс пуст — отлично.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {inbox.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-2 flex items-start justify-between gap-3"
              >
                <div>
                  <div className="text-sm font-semibold">{t.title}</div>
                  <div className="text-xs text-slate-400">
                    {t.estimateMin ? `${t.estimateMin} мин` : "без оценки"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => void markDone(t.id)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-200 text-emerald-950 text-xs font-semibold"
                  >
                    Done
                  </button>
                  <button
                    onClick={() => void setPlannedDate(t.id, dateKeys[0])}
                    className="px-3 py-1.5 rounded-lg bg-slate-50 text-slate-950 text-xs font-semibold"
                    title="Назначить на Пн текущей недели"
                  >
                    На Пн
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="text-xs text-slate-500">
        Следующий шаг: добавим drag&drop между днями, и нормальный переход “открыть Today на выбранной дате”.
      </div>
    </div>
  );
}
