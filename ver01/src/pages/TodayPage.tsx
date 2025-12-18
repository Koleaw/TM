import { useEffect, useMemo, useState } from "react";
import {
  createTask,
  deleteTask,
  moveTask,
  startTimer,
  stopTimer,
  toggleDone,
  todayYMD,
  updateTask,
  updateTimeLog,
  useAppState,
  ymdAddDays,
  type Task,
  type TimeLogKind,
} from "../data/db";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtDuration(mins: number) {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h <= 0) return `${r} мин`;
  if (r === 0) return `${h} ч`;
  return `${h} ч ${r} мин`;
}

function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${pad2(m)}:${pad2(r)}`;
  return `${m}:${pad2(r)}`;
}

function prioLabel(p?: number | null) {
  if (p === 1) return "Высокий";
  if (p === 2) return "Средний";
  return "Низкий";
}

function parseDeadlineInput(v: string) {
  // ожидаем "YYYY-MM-DDTHH:MM" (datetime-local) или пусто
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

function toLocalDateTimeInput(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

function fmtCountdown(ms: number) {
  const sign = ms < 0 ? -1 : 1;
  const a = Math.abs(ms);
  const totalMin = Math.floor(a / 60000);
  const d = Math.floor(totalMin / (60 * 24));
  const h = Math.floor((totalMin % (60 * 24)) / 60);
  const m = totalMin % 60;

  const parts: string[] = [];
  if (d) parts.push(`${d}д`);
  if (h) parts.push(`${h}ч`);
  if (!d && !h) parts.push(`${m}м`);
  const body = parts.join(" ");

  return sign < 0 ? `просрочено на ${body}` : `через ${body}`;
}

export default function TodayPage() {
  const s = useAppState();

  const today = useMemo(() => todayYMD(), []);
  const tomorrow = useMemo(() => ymdAddDays(today, 1), [today]);
  const yesterday = useMemo(() => ymdAddDays(today, -1), [today]);

  const timeTypes = useMemo(() => s.lists.timeTypes ?? [], [s.lists.timeTypes]);
  const sinks = useMemo(() => s.lists.sinks ?? [], [s.lists.sinks]);

  const tasksToday = useMemo(
    () => s.tasks.filter((t) => t.plannedDate === today && t.status !== "done"),
    [s.tasks, today]
  );

  const hardToday = useMemo(
    () => tasksToday.filter((t) => !!t.plannedStart).sort((a, b) => (a.plannedStart ?? "").localeCompare(b.plannedStart ?? "")),
    [tasksToday]
  );

  const flexToday = useMemo(
    () =>
      tasksToday
        .filter((t) => !t.plannedStart)
        .sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2) || b.updatedAt - a.updatedAt),
    [tasksToday]
  );

  const doneToday = useMemo(
    () => s.tasks.filter((t) => t.plannedDate === today && t.status === "done"),
    [s.tasks, today]
  );

  const deadlineTasks = useMemo(() => {
    return s.tasks
      .filter((t) => t.status !== "done" && typeof t.deadlineAt === "number")
      .sort((a, b) => (a.deadlineAt ?? 0) - (b.deadlineAt ?? 0));
  }, [s.tasks]);

  // ---------------- Timer ----------------
  const active = s.activeTimer;

  const [tickMs, setTickMs] = useState(0);
  useEffect(() => {
    if (!active) return;
    setTickMs(Date.now());
    const id = setInterval(() => setTickMs(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);

  const elapsedMs = useMemo(() => {
    if (!active) return 0;
    const now = tickMs || Date.now();
    return Math.max(0, now - active.startedAt);
  }, [active, tickMs]);

  const elapsedLabel = useMemo(() => fmtElapsed(elapsedMs), [elapsedMs]);

  const activeTaskTitle = useMemo(() => {
    if (!active) return "";
    if (!active.taskId) return "(без задачи)";
    const t = s.tasks.find((x) => x.id === active.taskId);
    return t?.title ?? "(задача удалена)";
  }, [active, s.tasks]);

  const timerStatus = active ? `идёт… (${elapsedLabel})` : "простой";

  const [timerTimeTypeId, setTimerTimeTypeId] = useState<string>("");
  const [activeNote, setActiveNote] = useState<string>("");

  // Пауза (как отдельный лог)
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseKind, setPauseKind] = useState<TimeLogKind>("useful");
  const [pauseTimeTypeId, setPauseTimeTypeId] = useState<string>("");
  const [pauseSinkId, setPauseSinkId] = useState<string>("");

  useEffect(() => {
    // дефолт паузы: тип "Поглотитель" если есть
    if (!pauseTimeTypeId) {
      const sinkTT = timeTypes.find((x) => x.name.toLowerCase().includes("поглот"));
      if (sinkTT) setPauseTimeTypeId(sinkTT.id);
    }
  }, [pauseTimeTypeId, timeTypes]);

  function stopCurrent() {
    if (!active) return;
    stopTimer(activeNote);
    setActiveNote("");
  }

  function stopCurrentWithExactEnd(endedAtMs: number) {
    // stopTimer пишет endedAt=now(); потом мы уточняем endedAt, чтобы переключение было «ровным»
    stopTimer(activeNote);
    setActiveNote("");

    const newLogId = s.timeLogs[0]?.id; // НЕ НАДЁЖНО при очень быстрой гонке, но в локальном single-user ок
    if (newLogId) updateTimeLog(newLogId, { endedAt: endedAtMs });
  }

  function switchToTask(nextTaskId: string | null, nextTimeTypeId: string | null) {
    const endedAtMs = Date.now();
    if (active) stopCurrentWithExactEnd(endedAtMs);
    startTimer(nextTaskId, nextTimeTypeId ?? null, "useful", null);
  }

  function startNoTask() {
    // старт без задачи: "Дорога", "Быт", "Коммуникации" и т.п.
    if (active) return;
    startTimer(null, timerTimeTypeId || null, "useful", null);
  }

  function startPause() {
    if (!active) return;
    const endedAtMs = Date.now();
    stopCurrentWithExactEnd(endedAtMs);

    startTimer(
      null,
      pauseTimeTypeId || null,
      pauseKind,
      pauseKind === "sink" ? (pauseSinkId || null) : null
    );

    setPauseOpen(false);
  }

  // ---------------- Create new tasks ----------------
  const [newHardTitle, setNewHardTitle] = useState("");
  const [newHardStart, setNewHardStart] = useState("11:00");
  const [newHardEstimate, setNewHardEstimate] = useState("60"); // строка => можно очистить
  const [newHardPriority, setNewHardPriority] = useState<1 | 2 | 3>(2);
  const [newHardDeadline, setNewHardDeadline] = useState<string>("");

  const [newFlexTitle, setNewFlexTitle] = useState("");
  const [newFlexEstimate, setNewFlexEstimate] = useState("60");
  const [newFlexPriority, setNewFlexPriority] = useState<1 | 2 | 3>(2);
  const [newFlexDeadline, setNewFlexDeadline] = useState<string>("");

  function parseEstimate(v: string) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n);
  }

  function addHardTask() {
    const title = newHardTitle.trim();
    if (!title) return;

    createTask(title, {
      plannedDate: today,
      plannedStart: newHardStart || "11:00",
      estimateMin: parseEstimate(newHardEstimate),
      priority: newHardPriority,
      deadlineAt: parseDeadlineInput(newHardDeadline),
    });

    setNewHardTitle("");
    setNewHardDeadline("");
  }

  function addFlexTask() {
    const title = newFlexTitle.trim();
    if (!title) return;

    createTask(title, {
      plannedDate: today,
      plannedStart: null,
      estimateMin: parseEstimate(newFlexEstimate),
      priority: newFlexPriority,
      deadlineAt: parseDeadlineInput(newFlexDeadline),
    });

    setNewFlexTitle("");
    setNewFlexDeadline("");
  }

  // ---------------- Edit panel ----------------
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const editingTask = useMemo(
    () => (editingTaskId ? s.tasks.find((t) => t.id === editingTaskId) ?? null : null),
    [editingTaskId, s.tasks]
  );

  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPlannedDate, setEditPlannedDate] = useState<string | null>(null);
  const [editPlannedStart, setEditPlannedStart] = useState<string | null>(null);
  const [editEstimate, setEditEstimate] = useState<string>("");
  const [editPriority, setEditPriority] = useState<1 | 2 | 3>(2);
  const [editDeadline, setEditDeadline] = useState<string>("");

  useEffect(() => {
    if (!editingTask) return;
    setEditTitle(editingTask.title ?? "");
    setEditNotes(editingTask.notes ?? "");
    setEditPlannedDate(editingTask.plannedDate ?? null);
    setEditPlannedStart(editingTask.plannedStart ?? null);
    setEditEstimate(
      typeof editingTask.estimateMin === "number" ? String(editingTask.estimateMin) : ""
    );
    setEditPriority((editingTask.priority as any) ?? 2);
    setEditDeadline(
      typeof editingTask.deadlineAt === "number" ? toLocalDateTimeInput(editingTask.deadlineAt) : ""
    );
  }, [editingTask]);

  function beginTaskEdit(id: string) {
    setEditingTaskId(id);
  }

  function saveTaskEdit() {
    if (!editingTaskId) return;

    updateTask(editingTaskId, {
      title: editTitle.trim() || "Без названия",
      notes: editNotes ?? "",
      plannedDate: editPlannedDate ?? null,
      plannedStart: editPlannedStart ? editPlannedStart : null,
      estimateMin: parseEstimate(editEstimate),
      priority: editPriority,
      deadlineAt: parseDeadlineInput(editDeadline),
    });

    setEditingTaskId(null);
  }

  function TaskEditPanel() {
    if (!editingTask) return null;

    return (
      <div className="mt-2 grid gap-2 rounded-lg border border-slate-800 bg-slate-950 p-2">
        <div className="text-xs text-slate-500">Правка задачи</div>

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
            <span className="text-xs text-slate-400">Дата (план)</span>
            <input
              type="date"
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={editPlannedDate ?? ""}
              onChange={(e) => setEditPlannedDate(e.target.value ? e.target.value : null)}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-slate-400">Время (если нужно “жёстко”)</span>
            <input
              type="time"
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={editPlannedStart ?? ""}
              onChange={(e) => setEditPlannedStart(e.target.value ? e.target.value : null)}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-slate-400">Оценка (план, мин)</span>
            <input
              type="number"
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={editEstimate}
              onChange={(e) => setEditEstimate(e.target.value)}
              placeholder="например 60"
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
        </div>

        <label className="grid gap-1">
          <span className="text-xs text-slate-400">Заметки</span>
          <textarea
            className="min-h-[80px] rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder="Контекст, что сделать, критерии готовности…"
          />
        </label>

        <div className="flex items-center gap-2">
          <button
            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-950"
            onClick={saveTaskEdit}
          >
            Сохранить
          </button>
          <button
            className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-2 text-sm hover:bg-slate-800"
            onClick={() => setEditingTaskId(null)}
          >
            Отмена
          </button>
        </div>
      </div>
    );
  }

  function TaskRow({ t }: { t: Task }) {
    const isActive = active?.taskId === t.id;

    const metaParts: string[] = [];
    if (t.plannedStart) metaParts.push(t.plannedStart);
    metaParts.push(`приоритет: ${prioLabel(t.priority)}`);
    if (typeof t.estimateMin === "number") metaParts.push(`оценка ${fmtDuration(t.estimateMin)}`);
    if (typeof t.deadlineAt === "number") metaParts.push(`дедлайн ${fmtCountdown(t.deadlineAt - Date.now())}`);
    if (isActive) metaParts.push(`идёт ${elapsedLabel}`);

    const meta = metaParts.join(" • ");

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
                onClick={() => switchToTask(t.id, timerTimeTypeId || null)}
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
              title="Перенести на вчера"
              onClick={() => moveTask(t.id, yesterday, t.plannedStart ?? null)}
            >
              ⇠
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

  function DeadlineRow({ t }: { t: Task }) {
    const left = typeof t.deadlineAt === "number" ? (t.deadlineAt - Date.now()) : 0;

    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm text-slate-200">{t.title}</div>
            <div className="text-xs text-slate-500">
              дедлайн {fmtCountdown(left)}
              {t.plannedDate ? ` • в плане: ${t.plannedDate}${t.plannedStart ? ` ${t.plannedStart}` : ""}` : " • не запланировано"}
              {` • приоритет: ${prioLabel(t.priority)}`}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {t.plannedDate !== today ? (
              <button
                className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs hover:bg-slate-800"
                onClick={() => moveTask(t.id, today, t.plannedStart ?? null)}
                title="Добавить в план на сегодня"
              >
                В сегодня
              </button>
            ) : null}

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
            {active
              ? "Чтобы переключиться — нажми стрелку у нужной задачи ниже"
              : "Таймер не запущен — стартуй задачу ниже или запусти «без задачи»"}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="grid gap-1 flex-1 min-w-[240px]">
            <div className="text-xs text-slate-400">Тип времени (для старта)</div>
            <select
              className="h-10 rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm"
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
            <button
              className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-4 text-sm hover:bg-slate-800"
              onClick={startNoTask}
              title="Например: Дорога / Быт / Коммуникации — без привязки к задаче"
            >
              Старт без задачи
            </button>
          ) : (
            <>
              <button
                className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-4 text-sm hover:bg-slate-800"
                onClick={() => setPauseOpen((x) => !x)}
                title="Пауза = отдельный лог в таймшите"
              >
                ⏸︎ Пауза
              </button>
              <button
                className="h-10 rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-slate-950"
                onClick={stopCurrent}
              >
                Стоп
              </button>
            </>
          )}
        </div>

        {active ? (
          <div className="mt-3 grid gap-1">
            <div className="text-xs text-slate-400">
              Комментарий к текущей записи (добавится при “Стоп” или переключении)
            </div>
            <input
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={activeNote}
              onChange={(e) => setActiveNote(e.target.value)}
              placeholder="Например: созвон, правки, дорога, бытовуха…"
            />
          </div>
        ) : null}

        {active && pauseOpen ? (
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 p-2">
            <div className="text-xs text-slate-400 mb-2">Пауза: что это было?</div>

            <div className="grid gap-2 md:grid-cols-3">
              <label className="grid gap-1">
                <span className="text-xs text-slate-400">Тип времени</span>
                <select
                  className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm"
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
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-slate-400">Класс</span>
                <select
                  className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm"
                  value={pauseKind}
                  onChange={(e) => setPauseKind(e.target.value as TimeLogKind)}
                >
                  <option value="useful">Полезное</option>
                  <option value="sink">Поглотитель</option>
                  <option value="rest">Отдых</option>
                </select>
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-slate-400">Поглотитель (если выбран)</span>
                <select
                  className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm"
                  value={pauseSinkId}
                  onChange={(e) => setPauseSinkId(e.target.value)}
                  disabled={pauseKind !== "sink"}
                >
                  <option value="">(не выбран)</option>
                  {sinks.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <button
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-950"
                onClick={startPause}
              >
                Начать паузу
              </button>
              <button
                className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-2 text-sm hover:bg-slate-800"
                onClick={() => setPauseOpen(false)}
              >
                Отмена
              </button>
              <div className="text-xs text-slate-500">
                Пауза остановит текущую запись и запустит новую “без задачи”.
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Deadlines */}
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-lg font-semibold">Дедлайны</div>
          <div className="text-xs text-slate-500">показываются пока задача не закрыта</div>
        </div>

        {deadlineTasks.length === 0 ? (
          <div className="mt-2 text-sm text-slate-400">
            Пока пусто. Дедлайн можно добавить в правке задачи.
          </div>
        ) : (
          <div className="mt-3 grid gap-2">
            {deadlineTasks.slice(0, 12).map((t) => (
              <DeadlineRow key={t.id} t={t} />
            ))}
          </div>
        )}
      </div>

      {/* Today lists */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Hard */}
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Жёсткие задачи</div>
            <div className="text-xs text-slate-500">plannedStart ≠ null</div>
          </div>

          <div className="mt-2 flex flex-wrap items-end gap-2">
            <input
              className="h-10 flex-1 min-w-[220px] rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm"
              value={newHardTitle}
              onChange={(e) => setNewHardTitle(e.target.value)}
              placeholder="Новая жёсткая задача…"
              onKeyDown={(e) => {
                if (e.key === "Enter") addHardTask();
              }}
            />

            <input
              type="time"
              className="h-10 w-[110px] rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm"
              value={newHardStart}
              onChange={(e) => setNewHardStart(e.target.value)}
            />

            <input
              type="number"
              className="h-10 w-[110px] rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm"
              value={newHardEstimate}
              onChange={(e) => setNewHardEstimate(e.target.value)}
              title="Оценка (план): сколько минут примерно займёт. Нужна для планирования и ощущения объёма дня."
            />

            <select
              className="h-10 w-[150px] rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm"
              value={newHardPriority}
              onChange={(e) => setNewHardPriority(Number(e.target.value) as any)}
            >
              <option value={1}>Высокий</option>
              <option value={2}>Средний</option>
              <option value={3}>Низкий</option>
            </select>

            <button
              className="h-10 rounded-lg bg-slate-200 px-4 text-sm font-semibold text-slate-950 disabled:opacity-40"
              disabled={!newHardTitle.trim()}
              onClick={addHardTask}
            >
              Добавить
            </button>
          </div>

          <div className="mt-2 grid gap-1">
            <div className="text-xs text-slate-400">Дедлайн (опционально)</div>
            <input
              type="datetime-local"
              className="h-10 rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm"
              value={newHardDeadline}
              onChange={(e) => setNewHardDeadline(e.target.value)}
            />
          </div>

          <div className="mt-3 grid gap-2">
            {hardToday.length === 0 ? (
              <div className="text-sm text-slate-400">Пока пусто</div>
            ) : (
              hardToday.map((t) => <TaskRow key={t.id} t={t} />)
            )}
          </div>
        </div>

        {/* Flex */}
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Гибкие задачи</div>
            <div className="text-xs text-slate-500">plannedStart = null</div>
          </div>

          <div className="mt-2 flex flex-wrap items-end gap-2">
            <input
              className="h-10 flex-1 min-w-[220px] rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm"
              value={newFlexTitle}
              onChange={(e) => setNewFlexTitle(e.target.value)}
              placeholder="Новая гибкая задача…"
              onKeyDown={(e) => {
                if (e.key === "Enter") addFlexTask();
              }}
            />

            <input
              type="number"
              className="h-10 w-[110px] rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm"
              value={newFlexEstimate}
              onChange={(e) => setNewFlexEstimate(e.target.value)}
              title="Оценка (план): сколько минут примерно займёт"
            />

            <select
              className="h-10 w-[150px] rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm"
              value={newFlexPriority}
              onChange={(e) => setNewFlexPriority(Number(e.target.value) as any)}
            >
              <option value={1}>Высокий</option>
              <option value={2}>Средний</option>
              <option value={3}>Низкий</option>
            </select>

            <button
              className="h-10 rounded-lg bg-slate-200 px-4 text-sm font-semibold text-slate-950 disabled:opacity-40"
              disabled={!newFlexTitle.trim()}
              onClick={addFlexTask}
            >
              Добавить
            </button>
          </div>

          <div className="mt-2 grid gap-1">
            <div className="text-xs text-slate-400">Дедлайн (опционально)</div>
            <input
              type="datetime-local"
              className="h-10 rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm"
              value={newFlexDeadline}
              onChange={(e) => setNewFlexDeadline(e.target.value)}
            />
          </div>

          <div className="mt-3 grid gap-2">
            {flexToday.length === 0 ? (
              <div className="text-sm text-slate-400">Пока пусто</div>
            ) : (
              flexToday.map((t) => <TaskRow key={t.id} t={t} />)
            )}
          </div>
        </div>
      </div>

      {/* Done today */}
      <details className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <summary className="cursor-pointer font-semibold text-slate-200">
          Выполнено сегодня <span className="text-slate-500">({doneToday.length})</span>
        </summary>
        <div className="mt-3 grid gap-2">
          {doneToday.length === 0 ? (
            <div className="text-sm text-slate-400">Пока пусто</div>
          ) : (
            doneToday.map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-800 bg-slate-900 p-2">
                <div className="text-sm text-slate-200">{t.title}</div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs hover:bg-slate-800"
                    onClick={() => toggleDone(t.id)}
                  >
                    Вернуть в todo
                  </button>
                  <button
                    className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs hover:bg-slate-800"
                    onClick={() => beginTaskEdit(t.id)}
                  >
                    Правка
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
