import { useEffect, useMemo, useState } from "react";
import {
  Task,
  TimeLogKind,
  createTask,
  deleteTask,
  moveTask,
  startTimer,
  stopTimer,
  todayYMD,
  toggleDone,
  updateTask,
  useAppState,
  ymdAddDays,
} from "../data/db";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalDateTimeInput(ms: number) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function parseLocalDateTimeInput(v: string) {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function fmtDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

function parseHHMMToMinutes(v: string | null) {
  if (!v) return Number.POSITIVE_INFINITY;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v);
  if (!m) return Number.POSITIVE_INFINITY;
  return Number(m[1]) * 60 + Number(m[2]);
}

function prioLabel(p: 1 | 2 | 3) {
  if (p === 1) return "Высокий";
  if (p === 2) return "Средний";
  return "Низкий";
}

function fmtDeadlineCountdown(deadlineAt: number, nowMs: number) {
  const diff = deadlineAt - nowMs;
  const sign = diff < 0 ? -1 : 1;
  const abs = Math.abs(diff);

  const totalMin = Math.round(abs / 60000);
  const d = Math.floor(totalMin / (60 * 24));
  const h = Math.floor((totalMin - d * 60 * 24) / 60);
  const m = totalMin - d * 60 * 24 - h * 60;

  const parts: string[] = [];
  if (d > 0) parts.push(`${d} д`);
  if (h > 0) parts.push(`${h} ч`);
  if (d === 0 && h === 0) parts.push(`${m} мин`);

  const s = parts.join(" ");
  return sign < 0 ? `просрочено на ${s}` : `осталось ${s}`;
}

function ymdFromMs(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function hhmmFromMs(ms: number) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export default function TodayPage() {
  const s = useAppState();
  const today = todayYMD();
  const tomorrow = ymdAddDays(today, 1);

  // ---------- Таймер ----------
  const active = s.activeTimer;

  // тикер, чтобы счётчик минут обновлялся (иначе он "замрёт" на 0)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((x) => x + 1), 5000);
    return () => window.clearInterval(id);
  }, [active?.startedAt]);

  const elapsedMin = useMemo(() => {
    if (!active) return 0;
    const diff = Date.now() - active.startedAt;
    return Math.max(0, Math.floor(diff / 60000));
  }, [active, tick]);

  const timeTypes = useMemo(() => s.lists.timeTypes ?? [], [s.lists.timeTypes]);

  const [timerTimeTypeId, setTimerTimeTypeId] = useState<string>("");
  const [timerNote, setTimerNote] = useState<string>("");

  // пауза
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseTimeTypeId, setPauseTimeTypeId] = useState<string>("");
  const [pauseKind, setPauseKind] = useState<TimeLogKind>("rest");
  const [pauseSinkId, setPauseSinkId] = useState<string>("");

  // ---------- Задачи ----------
  const tasksTodayAll = useMemo(
    () => s.tasks.filter((t) => t.plannedDate === today),
    [s.tasks, today]
  );

  const hardTasks = useMemo(
    () =>
      tasksTodayAll
        .filter((t) => t.status === "todo" && t.plannedStart)
        .sort((a, b) => {
          const ta = parseHHMMToMinutes(a.plannedStart);
          const tb = parseHHMMToMinutes(b.plannedStart);
          if (ta !== tb) return ta - tb;
          if (a.priority !== b.priority) return a.priority - b.priority;
          return b.updatedAt - a.updatedAt;
        }),
    [tasksTodayAll]
  );

  const flexTasks = useMemo(
    () =>
      tasksTodayAll
        .filter((t) => t.status === "todo" && !t.plannedStart)
        .sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return b.updatedAt - a.updatedAt;
        }),
    [tasksTodayAll]
  );

  const doneToday = useMemo(
    () => tasksTodayAll.filter((t) => t.status === "done").sort((a, b) => b.updatedAt - a.updatedAt),
    [tasksTodayAll]
  );

  const nowMs = Date.now();
  const deadlineTasks = useMemo(() => {
    return [...s.tasks]
      .filter((t) => t.status === "todo" && t.deadlineAt !== null)
      .sort((a, b) => (a.deadlineAt ?? 0) - (b.deadlineAt ?? 0))
      .slice(0, 12);
  }, [s.tasks]);

  // ---------- Добавление ----------
  const [hardTitle, setHardTitle] = useState("");
  const [hardTime, setHardTime] = useState("11:00");
  const [hardEstimate, setHardEstimate] = useState(60);
  const [hardPriority, setHardPriority] = useState<1 | 2 | 3>(2);
  const [hardDeadline, setHardDeadline] = useState<string>("");

  const [flexTitle, setFlexTitle] = useState("");
  const [flexEstimate, setFlexEstimate] = useState(60);
  const [flexPriority, setFlexPriority] = useState<1 | 2 | 3>(2);
  const [flexDeadline, setFlexDeadline] = useState<string>("");

  function createHardTask() {
    const title = hardTitle.trim();
    if (!title) return;

    const deadlineAt = hardDeadline.trim() ? parseLocalDateTimeInput(hardDeadline.trim()) : NaN;

    createTask(title, {
      plannedDate: today,
      plannedStart: hardTime,
      estimateMin: hardEstimate,
      priority: hardPriority,
      deadlineAt: Number.isFinite(deadlineAt) ? deadlineAt : null,
    });

    setHardTitle("");
    setHardDeadline("");
  }

  function createFlexTask() {
    const title = flexTitle.trim();
    if (!title) return;

    const deadlineAt = flexDeadline.trim() ? parseLocalDateTimeInput(flexDeadline.trim()) : NaN;

    createTask(title, {
      plannedDate: today,
      plannedStart: null,
      estimateMin: flexEstimate,
      priority: flexPriority,
      deadlineAt: Number.isFinite(deadlineAt) ? deadlineAt : null,
    });

    setFlexTitle("");
    setFlexDeadline("");
  }

  // ---------- Редактирование ----------
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPlannedDate, setEditPlannedDate] = useState<string>(today);
  const [editPlannedStart, setEditPlannedStart] = useState<string>("");
  const [editEstimate, setEditEstimate] = useState<number>(60);
  const [editPriority, setEditPriority] = useState<1 | 2 | 3>(2);
  const [editDeadline, setEditDeadline] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");

  function beginTaskEdit(taskId: string) {
    const t = s.tasks.find((x) => x.id === taskId);
    if (!t) return;

    setEditingTaskId(t.id);
    setEditTitle(t.title ?? "");
    setEditPlannedDate(t.plannedDate ?? today);
    setEditPlannedStart(t.plannedStart ?? "");
    setEditEstimate(typeof t.estimateMin === "number" ? t.estimateMin : 60);
    setEditPriority(t.priority ?? 2);

    setEditDeadline(t.deadlineAt ? toLocalDateTimeInput(t.deadlineAt) : "");
    setEditNotes(t.notes ?? "");
  }

  function saveTaskEdit() {
    if (!editingTaskId) return;

    const dl = editDeadline.trim() ? parseLocalDateTimeInput(editDeadline.trim()) : NaN;

    updateTask(editingTaskId, {
      title: editTitle.trim() || "Без названия",
      plannedDate: editPlannedDate ? editPlannedDate : null,
      plannedStart: editPlannedStart.trim() ? editPlannedStart.trim() : null,
      estimateMin: Number.isFinite(editEstimate) ? editEstimate : null,
      priority: editPriority,
      deadlineAt: Number.isFinite(dl) ? dl : null,
      notes: editNotes ?? "",
    });

    setEditingTaskId(null);
  }

  // ---------- Действия таймера ----------
  function stopCurrent() {
    if (!active) return;
    stopTimer(timerNote);
    setTimerNote("");
  }

  // Переключение на другую задачу (стрелка)
  function switchToTask(taskId: string | null) {
    if (!active) {
      startTimer(taskId, timerTimeTypeId || null, "useful", null);
      return;
    }
    if (active.taskId === taskId) return;

    stopTimer(timerNote);
    setTimerNote("");

    startTimer(taskId, active.timeTypeId ?? null, active.kind ?? "useful", active.sinkId ?? null);
  }

  // Пауза = отдельный лог без привязки к задаче
  function pauseCurrent() {
    if (!active) return;

    stopTimer(timerNote);
    setTimerNote("");

    startTimer(null, pauseTimeTypeId || null, pauseKind, pauseKind === "sink" ? (pauseSinkId || null) : null);
    setPauseOpen(false);
  }

  const activeTaskTitle = useMemo(() => {
    if (!active?.taskId) return "без привязки";
    const t = s.tasks.find((x) => x.id === active.taskId);
    return t?.title ?? "(задача удалена)";
  }, [active?.taskId, s.tasks]);

  const timerStatus = active ? `идёт… (${elapsedMin} мин)` : "простой";

  const TaskEditPanel = () => (
    <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950 p-2">
      <div className="grid gap-2 md:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-xs text-slate-400">Название</span>
          <input
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-slate-400">Приоритет</span>
          <select
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={editPriority}
            onChange={(e) => setEditPriority(Number(e.target.value) as any)}
          >
            <option value={1}>Высокий</option>
            <option value={2}>Средний</option>
            <option value={3}>Низкий</option>
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-slate-400">Дата (в плане)</span>
          <input
            type="date"
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={editPlannedDate ?? ""}
            onChange={(e) => setEditPlannedDate(e.target.value)}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-slate-400">Время (если жёсткая) HH:MM</span>
          <input
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={editPlannedStart}
            onChange={(e) => setEditPlannedStart(e.target.value)}
            placeholder="например 16:00"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-slate-400">Оценка (мин)</span>
          <input
            type="number"
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={editEstimate}
            onChange={(e) => setEditEstimate(Number(e.target.value))}
            min={0}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-slate-400">Дедлайн</span>
          <input
            type="datetime-local"
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={editDeadline}
            onChange={(e) => setEditDeadline(e.target.value)}
          />
        </label>

        <label className="grid gap-1 md:col-span-2">
          <span className="text-xs text-slate-400">Заметки</span>
          <textarea
            className="min-h-[70px] rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:bg-slate-800"
          onClick={() => setEditingTaskId(null)}
        >
          Отмена
        </button>
        <button
          className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-950"
          onClick={saveTaskEdit}
        >
          Сохранить
        </button>
      </div>
    </div>
  );

  function TaskRow({ t }: { t: Task }) {
    const isActive = active?.taskId === t.id;

    const meta = [
      t.plannedStart ? t.plannedStart : null,
      typeof t.estimateMin === "number" ? `оценка ${fmtDuration(t.estimateMin)}` : "без оценки",
      `приоритет: ${prioLabel(t.priority)}`,
      t.deadlineAt ? `дедлайн: ${ymdFromMs(t.deadlineAt)} ${hhmmFromMs(t.deadlineAt)}` : null,
    ]
      .filter(Boolean)
      .join(" • ");

    return (
      <div className={`rounded-lg border border-slate-800 bg-slate-900 p-2 ${isActive ? "ring-1 ring-emerald-400" : ""}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm text-slate-200">{t.title}</div>
            <div className="text-xs text-slate-500">{meta}</div>
          </div>

          <div className="flex items-center gap-2">
            {!active ? (
              <button
                className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950"
                onClick={() => startTimer(t.id, timerTimeTypeId || null, "useful", null)}
              >
                Старт
              </button>
            ) : isActive ? (
              <button
                className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950"
                onClick={stopCurrent}
                title="Стоп текущей задачи"
              >
                Стоп
              </button>
            ) : (
              <button
                className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950"
                onClick={() => switchToTask(t.id)}
                title="Переключиться (стрелка)"
              >
                →
              </button>
            )}

            <button
              className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
              title="Правка"
              onClick={() => beginTaskEdit(t.id)}
            >
              ✎
            </button>
            <button
              className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
              title="Готово"
              onClick={() => toggleDone(t.id)}
            >
              ✓
            </button>
            <button
              className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
              title="Перенести на завтра"
              onClick={() => moveTask(t.id, tomorrow, t.plannedStart ?? null)}
            >
              ⇢
            </button>
            <button
              className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
              title="Удалить"
              onClick={() => deleteTask(t.id)}
            >
              🗑
            </button>
          </div>
        </div>

        {editingTaskId === t.id ? <TaskEditPanel /> : null}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {/* Header + timer */}
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xl font-semibold">Сегодня</div>
            <div className="text-sm text-slate-400">
              Таймер: <span className="text-slate-200">{timerStatus}</span>
              {active ? <span className="ml-2 text-slate-500">• {activeTaskTitle}</span> : null}
            </div>
          </div>

          <div className="text-sm text-slate-400">
            {active ? "Чтобы переключиться — нажми стрелку у нужной задачи ниже" : "Таймер не запущен — стартуй задачу ниже"}
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-[1fr,auto,auto] md:items-end">
          <div className="grid gap-1">
            <div className="text-xs text-slate-400">Тип времени (для старта)</div>
            <select
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={timerTimeTypeId}
              onChange={(e) => setTimerTimeTypeId(e.target.value)}
              disabled={!!active}
            >
              <option value="">(не выбран)</option>
              {timeTypes.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </select>
          </div>

          {!active ? (
            <div className="text-sm text-slate-500 md:text-right">Запусти задачу кнопкой “Старт” ниже</div>
          ) : (
            <>
              <button
                className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-2 text-sm hover:bg-slate-800"
                onClick={() => setPauseOpen((x) => !x)}
                title="Пауза = отдельный лог в таймшите"
              >
                ⏸︎ Пауза
              </button>
              <button className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950" onClick={stopCurrent}>
                Стоп
              </button>
            </>
          )}
        </div>

        {active && (
          <div className="mt-3 grid gap-1">
            <div className="text-xs text-slate-400">Комментарий к текущей записи (добавится при “Стоп” или переключении)</div>
            <input
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={timerNote}
              onChange={(e) => setTimerNote(e.target.value)}
              placeholder="Например: правки по чертежу, созвон, дорога…"
            />
          </div>
        )}

        {active && pauseOpen && (
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 p-3">
            <div className="text-sm font-semibold">Пауза</div>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <div className="grid gap-1">
                <div className="text-xs text-slate-400">Класс</div>
                <select
                  className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
                  value={pauseKind}
                  onChange={(e) => setPauseKind(e.target.value as any)}
                >
                  <option value="useful">Полезное</option>
                  <option value="rest">Отдых</option>
                  <option value="sink">Поглотитель</option>
                </select>
              </div>

              <div className="grid gap-1">
                <div className="text-xs text-slate-400">Тип времени</div>
                <select
                  className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
                  value={pauseTimeTypeId}
                  onChange={(e) => setPauseTimeTypeId(e.target.value)}
                >
                  <option value="">(не выбран)</option>
                  {timeTypes.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-1">
                <div className="text-xs text-slate-400">Поглотитель (если выбран)</div>
                <select
                  className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
                  value={pauseSinkId}
                  onChange={(e) => setPauseSinkId(e.target.value)}
                  disabled={pauseKind !== "sink"}
                >
                  <option value="">(не выбран)</option>
                  {(s.lists.sinks ?? []).map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:bg-slate-800"
                onClick={() => setPauseOpen(false)}
              >
                Отмена
              </button>
              <button className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-950" onClick={pauseCurrent}>
                Поставить паузу
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Deadlines */}
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-lg font-semibold">Дедлайны</div>
          <div className="text-xs text-slate-500">показываются пока задача не закрыта</div>
        </div>

        {deadlineTasks.length === 0 ? (
          <div className="mt-2 text-sm text-slate-400">Пока пусто. Дедлайн можно добавить в правке задачи.</div>
        ) : (
          <div className="mt-3 grid gap-2">
            {deadlineTasks.map((t) => {
              const dl = t.deadlineAt!;
              const ymd = ymdFromMs(dl);
              const hhmm = hhmmFromMs(dl);

              return (
                <div key={t.id} className="rounded-lg border border-slate-800 bg-slate-900 p-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-slate-200">{t.title}</div>
                      <div className="text-xs text-slate-500">
                        {ymd} {hhmm} • {fmtDeadlineCountdown(dl, nowMs)}
                        {t.plannedDate ? ` • в плане: ${t.plannedDate}${t.plannedStart ? " " + t.plannedStart : ""}` : ""}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-800"
                        title="Запланировать на сегодня (без времени)"
                        onClick={() => updateTask(t.id, { plannedDate: today, plannedStart: null })}
                      >
                        На сегодня
                      </button>
                      <button
                        className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-800"
                        title="Сделать жёсткой на время дедлайна"
                        onClick={() => updateTask(t.id, { plannedDate: ymd, plannedStart: hhmm })}
                      >
                        Жёстк.
                      </button>
                      <button
                        className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-800"
                        title="Правка"
                        onClick={() => beginTaskEdit(t.id)}
                      >
                        ✎
                      </button>
                      <button
                        className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-800"
                        title="Готово"
                        onClick={() => toggleDone(t.id)}
                      >
                        ✓
                      </button>
                      <button
                        className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-800"
                        title="Удалить"
                        onClick={() => deleteTask(t.id)}
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  {editingTaskId === t.id ? <TaskEditPanel /> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hard & Flex */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-lg font-semibold">Жёсткие задачи</div>
            <div className="text-xs text-slate-500">plannedStart ≠ null</div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[1fr,110px,110px,150px,auto] md:items-end">
            <input
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              placeholder="Новая жёсткая задача..."
              value={hardTitle}
              onChange={(e) => setHardTitle(e.target.value)}
            />

            <input
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={hardTime}
              onChange={(e) => setHardTime(e.target.value)}
              placeholder="11:00"
            />

            <input
              type="number"
              min={0}
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={hardEstimate}
              onChange={(e) => setHardEstimate(Number(e.target.value))}
              title="оценка (мин)"
            />

            <select
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={hardPriority}
              onChange={(e) => setHardPriority(Number(e.target.value) as any)}
              title="приоритет"
            >
              <option value={1}>Высокий</option>
              <option value={2}>Средний</option>
              <option value={3}>Низкий</option>
            </select>

            <button className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-950" onClick={createHardTask}>
              Добавить
            </button>
          </div>

          <div className="mt-2 grid gap-1">
            <div className="text-xs text-slate-400">Дедлайн (опционально)</div>
            <input
              type="datetime-local"
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={hardDeadline}
              onChange={(e) => setHardDeadline(e.target.value)}
            />
          </div>

          <div className="mt-3 grid gap-2">
            {hardTasks.length === 0 ? <div className="text-sm text-slate-400">Пока пусто</div> : hardTasks.map((t) => <TaskRow key={t.id} t={t} />)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-lg font-semibold">Гибкие задачи</div>
            <div className="text-xs text-slate-500">plannedStart = null</div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[1fr,110px,150px,auto] md:items-end">
            <input
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              placeholder="Новая гибкая задача..."
              value={flexTitle}
              onChange={(e) => setFlexTitle(e.target.value)}
            />

            <input
              type="number"
              min={0}
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={flexEstimate}
              onChange={(e) => setFlexEstimate(Number(e.target.value))}
              title="оценка (мин)"
            />

            <select
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={flexPriority}
              onChange={(e) => setFlexPriority(Number(e.target.value) as any)}
              title="приоритет"
            >
              <option value={1}>Высокий</option>
              <option value={2}>Средний</option>
              <option value={3}>Низкий</option>
            </select>

            <button className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-950" onClick={createFlexTask}>
              Добавить
            </button>
          </div>

          <div className="mt-2 grid gap-1">
            <div className="text-xs text-slate-400">Дедлайн (опционально)</div>
            <input
              type="datetime-local"
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={flexDeadline}
              onChange={(e) => setFlexDeadline(e.target.value)}
            />
          </div>

          <div className="mt-3 grid gap-2">
            {flexTasks.length === 0 ? <div className="text-sm text-slate-400">Пока пусто</div> : flexTasks.map((t) => <TaskRow key={t.id} t={t} />)}
          </div>
        </div>
      </div>

      {/* Done */}
      <details className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <summary className="cursor-pointer text-lg font-semibold text-slate-200">
          Выполнено сегодня <span className="text-sm font-normal text-slate-500">({doneToday.length})</span>
        </summary>

        <div className="mt-3 grid gap-2">
          {doneToday.length === 0 ? (
            <div className="text-sm text-slate-400">Пока нет</div>
          ) : (
            doneToday.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2">
                <div className="min-w-0">
                  <div className="truncate text-sm text-slate-200">{t.title}</div>
                  <div className="text-xs text-slate-500">
                    {t.plannedStart ? `время ${t.plannedStart} • ` : ""}
                    приоритет: {prioLabel(t.priority)}
                    {t.deadlineAt ? ` • дедлайн: ${ymdFromMs(t.deadlineAt)} ${hhmmFromMs(t.deadlineAt)}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-800"
                    title="Вернуть в TODO"
                    onClick={() => toggleDone(t.id)}
                  >
                    ↩︎
                  </button>
                  <button
                    className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-800"
                    title="Правка"
                    onClick={() => beginTaskEdit(t.id)}
                  >
                    ✎
                  </button>
                </div>

                {editingTaskId === t.id ? <TaskEditPanel /> : null}
              </div>
            ))
          )}
        </div>
      </details>
    </div>
  );
}
