import React, { useEffect, useMemo, useState } from "react";
import {
  createTask,
  deleteTask,
  getState,
  moveTask,
  startTimer,
  stopTimer,
  toggleDone,
  todayYMD,
  updateTask,
  updateTimeLog,
  useAppState,
  ymdAddDays,
  type ID,
  type Task,
  type TimeLogKind,
} from "../data/db";

// ------------------------------
// helpers
function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtElapsed(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${pad2(m)}:${pad2(s)}`;
}

function fmtDuration(min: number) {
  if (!Number.isFinite(min) || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}

function fmtCountdown(deadlineAt: number) {
  const diff = deadlineAt - Date.now();
  const sign = diff < 0 ? "-" : "";
  const abs = Math.abs(diff);
  const totalMin = Math.floor(abs / 60000);
  const d = Math.floor(totalMin / (60 * 24));
  const h = Math.floor((totalMin % (60 * 24)) / 60);
  const m = totalMin % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}д`);
  if (h) parts.push(`${h}ч`);
  if (m || parts.length === 0) parts.push(`${m}м`);
  return `${sign}${parts.join(" ")}`;
}

function prioLabel(p: number) {
  if (p <= 1) return "Высокий";
  if (p === 2) return "Средний";
  return "Низкий";
}

function toLocalDateTimeInput(ms: number) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const mo = pad2(d.getMonth() + 1);
  const da = pad2(d.getDate());
  const h = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  return `${y}-${mo}-${da}T${h}:${mi}`;
}

function parseDeadlineInput(v: string): number | null {
  const ts = Date.parse(v);
  if (!Number.isFinite(ts)) return null;
  return ts;
}

function parseEstimate(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

type ActiveSnapshot = {
  taskId: ID | null;
  timeTypeId: ID | null;
  kind: TimeLogKind;
  sinkId: ID | null;
};

// ------------------------------
// stable components (IMPORTANT: do not declare inside TodayPage, otherwise inputs lose focus)
function TaskEditPanel(props: {
  task: Task;
  editTitle: string;
  setEditTitle: (v: string) => void;
  editNotes: string;
  setEditNotes: (v: string) => void;
  editPlannedDate: string;
  setEditPlannedDate: (v: string) => void;
  editPlannedStart: string;
  setEditPlannedStart: (v: string) => void;
  editEstimate: string;
  setEditEstimate: (v: string) => void;
  editPriority: string;
  setEditPriority: (v: string) => void;
  editDeadline: string;
  setEditDeadline: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const {
    task,
    editTitle,
    setEditTitle,
    editNotes,
    setEditNotes,
    editPlannedDate,
    setEditPlannedDate,
    editPlannedStart,
    setEditPlannedStart,
    editEstimate,
    setEditEstimate,
    editPriority,
    setEditPriority,
    editDeadline,
    setEditDeadline,
    onSave,
    onCancel,
  } = props;

  return (
    <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <label className="text-xs text-slate-300">
          Название
          <input
            className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
        </label>

        <label className="text-xs text-slate-300">
          Приоритет
          <select
            className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
            value={editPriority}
            onChange={(e) => setEditPriority(e.target.value)}
          >
            <option value="1">Высокий</option>
            <option value="2">Средний</option>
            <option value="3">Низкий</option>
          </select>
        </label>

        <label className="text-xs text-slate-300">
          План (дата)
          <input
            type="date"
            className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
            value={editPlannedDate}
            onChange={(e) => setEditPlannedDate(e.target.value)}
          />
        </label>

        <label className="text-xs text-slate-300">
          Старт (для жёстких задач)
          <input
            type="time"
            className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
            value={editPlannedStart}
            onChange={(e) => setEditPlannedStart(e.target.value)}
          />
        </label>

        <label className="text-xs text-slate-300">
          Оценка (мин)
          <input
            type="number"
            min={0}
            className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
            value={editEstimate}
            onChange={(e) => setEditEstimate(e.target.value)}
            placeholder="0"
          />
        </label>

        <label className="text-xs text-slate-300">
          Дедлайн (опционально)
          <input
            type="datetime-local"
            className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
            value={editDeadline}
            onChange={(e) => setEditDeadline(e.target.value)}
          />
        </label>
      </div>

      <label className="mt-2 block text-xs text-slate-300">
        Заметки
        <textarea
          className="mt-1 min-h-[88px] w-full rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm outline-none focus:border-slate-600"
          value={editNotes}
          onChange={(e) => setEditNotes(e.target.value)}
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950"
          onClick={onSave}
        >
          Сохранить
        </button>
        <button
          className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:bg-slate-800"
          onClick={onCancel}
        >
          Отмена
        </button>
        <div className="ml-auto text-xs text-slate-500">
          id: <span className="font-mono">{task.id}</span>
        </div>
      </div>
    </div>
  );
}

function TaskRow(props: {
  t: Task;
  isActive: boolean;
  activeExists: boolean;
  onStartOrSwitch: (taskId: ID) => void;
  onToggleDone: (taskId: ID) => void;
  onBeginEdit: (taskId: ID) => void;
  onDelete: (taskId: ID) => void;
  onMove: (taskId: ID, plannedDate: string | null, plannedStart?: string | null) => void;
  yesterday: string;
  tomorrow: string;
  isEditing: boolean;
  editPanel: React.ReactNode;
}) {
  const {
    t,
    isActive,
    activeExists,
    onStartOrSwitch,
    onToggleDone,
    onBeginEdit,
    onDelete,
    onMove,
    yesterday,
    tomorrow,
    isEditing,
    editPanel,
  } = props;

  const metaParts: string[] = [];
  metaParts.push(`приоритет: ${prioLabel(t.priority ?? 2)}`);
  if (typeof t.estimateMin === "number" && t.estimateMin > 0) metaParts.push(`оценка ${fmtDuration(t.estimateMin)}`);
  if (t.deadlineAt) metaParts.push(`дедлайн ${fmtCountdown(t.deadlineAt)}`);
  if (t.plannedStart) metaParts.push(t.plannedStart);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className={`truncate text-sm font-medium ${isActive ? "text-emerald-300" : "text-slate-100"}`}>
              {t.title}
            </div>
            {isActive ? (
              <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
                active
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">{metaParts.join(" • ")}</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950"
            onClick={() => onStartOrSwitch(t.id)}
            title={activeExists ? "Переключиться" : "Старт"}
          >
            {activeExists ? "→" : "Старт"}
          </button>

          <button
            className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
            onClick={() => onBeginEdit(t.id)}
            title="Редактировать"
          >
            ✎
          </button>

          <button
            className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
            onClick={() => onToggleDone(t.id)}
            title="Закрыть/открыть"
          >
            ✓
          </button>

          <button
            className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
            onClick={() => onMove(t.id, yesterday, t.plannedStart ?? null)}
            title="Вчера"
          >
            ←
          </button>

          <button
            className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
            onClick={() => onMove(t.id, tomorrow, t.plannedStart ?? null)}
            title="Завтра"
          >
            →
          </button>

          <button
            className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
            onClick={() => onDelete(t.id)}
            title="Удалить"
          >
            🗑
          </button>
        </div>
      </div>

      {isEditing ? editPanel : null}
    </div>
  );
}

function DeadlineRow(props: {
  t: Task;
  today: string;
  isEditing: boolean;
  onBeginEdit: (taskId: ID) => void;
  onToggleDone: (taskId: ID) => void;
  onDelete: (taskId: ID) => void;
  editPanel: React.ReactNode;
}) {
  const { t, today, isEditing, onBeginEdit, onToggleDone, onDelete, editPanel } = props;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-100">{t.title}</div>
          <div className="mt-0.5 text-xs text-slate-400">
            дедлайн {t.deadlineAt ? fmtCountdown(t.deadlineAt) : "—"}
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
            onClick={() => onBeginEdit(t.id)}
            title="Редактировать"
          >
            ✎
          </button>

          <button
            className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
            onClick={() => onToggleDone(t.id)}
            title="Закрыть/открыть"
          >
            ✓
          </button>

          <button
            className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
            onClick={() => onDelete(t.id)}
            title="Удалить"
          >
            🗑
          </button>
        </div>
      </div>

      {isEditing ? editPanel : null}
    </div>
  );
}

// ------------------------------
// page
export default function TodayPage() {
  const s = useAppState();

  const today = todayYMD();
  const yesterday = ymdAddDays(today, -1);
  const tomorrow = ymdAddDays(today, 1);

  // timer ticking (for live elapsed time label)
  const [tickMs, setTickMs] = useState(0);
  useEffect(() => {
    setTickMs(Date.now());
    const id = window.setInterval(() => setTickMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const timeTypes = s.lists.timeTypes ?? [];
  const pauseTT = useMemo(() => {
    return (
      timeTypes.find((x) => x.id === "tt_pause") ??
      timeTypes.find((x) => x.name?.toLowerCase?.() === "пауза") ??
      null
    );
  }, [timeTypes]);
  const pauseTimeTypeId = pauseTT?.id ?? "tt_pause"; // best-effort fallback

  const active = s.activeTimer;

  const [timerTimeTypeId, setTimerTimeTypeId] = useState<ID | "">("");
  const [activeNote, setActiveNote] = useState("");

  const [pauseMenuOpen, setPauseMenuOpen] = useState(false);
  const [resumeTarget, setResumeTarget] = useState<ActiveSnapshot | null>(null);

  const isPaused = !!active && active.timeTypeId === pauseTimeTypeId;

  const activeTaskTitle = useMemo(() => {
    if (!active) return "";
    if (active.timeTypeId === pauseTimeTypeId) return "(пауза)";
    if (!active.taskId) return "(без задачи)";
    const t = s.tasks.find((x) => x.id === active.taskId);
    return t ? t.title : "(задача не найдена)";
  }, [active, pauseTimeTypeId, s.tasks]);

  const elapsedMs = useMemo(() => {
    if (!active) return 0;
    const now = tickMs || Date.now();
    return Math.max(0, now - active.startedAt);
  }, [active, tickMs]);

  const elapsedLabel = useMemo(() => fmtElapsed(elapsedMs), [elapsedMs]);

  const timerStatus = active ? `идёт… (${elapsedLabel})` : "простой";

  function stopCurrent() {
    if (!active) return;
    stopTimer(activeNote);
    setActiveNote("");
    setPauseMenuOpen(false);
    setResumeTarget(null);
  }

  function stopCurrentWithExactEnd(endedAt: number) {
    if (!active) return;
    stopTimer(activeNote);
    const newLogId = getState().timeLogs[0]?.id;
    if (newLogId) updateTimeLog(newLogId, { endedAt });
    setActiveNote("");
  }

  function startNoTask() {
    startTimer(null, timerTimeTypeId || null, "useful", null);
    setResumeTarget(null);
  }

  function startPause(kind: TimeLogKind) {
    if (!active) return;

    // remember what to resume to (only when pausing a non-pause timer)
    if (!isPaused) {
      setResumeTarget({
        taskId: active.taskId,
        timeTypeId: active.timeTypeId,
        kind: active.kind,
        sinkId: active.sinkId ?? null,
      });
    }

    stopCurrentWithExactEnd(Date.now());
    startTimer(null, pauseTimeTypeId, kind, null);
    setPauseMenuOpen(false);
  }

  function resume() {
    if (!active || !isPaused || !resumeTarget) return;
    stopCurrentWithExactEnd(Date.now());
    startTimer(resumeTarget.taskId, resumeTarget.timeTypeId, resumeTarget.kind, resumeTarget.sinkId);
    setResumeTarget(null);
  }

  function startOrSwitchToTask(taskId: ID) {
    // switching while paused clears resume target — user intentionally switched context
    if (isPaused) setResumeTarget(null);

    if (!active) {
      startTimer(taskId, timerTimeTypeId || null, "useful", null);
      return;
    }

    if (active.taskId === taskId) {
      stopCurrent();
      return;
    }

    stopCurrentWithExactEnd(Date.now());
    startTimer(taskId, timerTimeTypeId || null, "useful", null);
  }

  // ---------------- Create new tasks (defaults)
  const [newHardTitle, setNewHardTitle] = useState("");
  const [newHardStart, setNewHardStart] = useState("11:00");
  const [newHardEstimate, setNewHardEstimate] = useState("0");
  const [newHardPriority, setNewHardPriority] = useState("2");

  const [newFlexTitle, setNewFlexTitle] = useState("");
  const [newFlexEstimate, setNewFlexEstimate] = useState("0");
  const [newFlexPriority, setNewFlexPriority] = useState("2");
  const [newFlexDeadline, setNewFlexDeadline] = useState("");

  function addHardTask() {
    if (!newHardTitle.trim()) return;
    createTask(newHardTitle, {
      plannedDate: today,
      plannedStart: newHardStart || null,
      estimateMin: parseEstimate(newHardEstimate) ?? 0,
      priority: Number(newHardPriority) as any,
      deadlineAt: null,
    });
    setNewHardTitle("");
    setNewHardStart("11:00");
    setNewHardEstimate("0");
    setNewHardPriority("2");
  }

  function addFlexTask() {
    if (!newFlexTitle.trim()) return;
    createTask(newFlexTitle, {
      plannedDate: today,
      plannedStart: null,
      estimateMin: parseEstimate(newFlexEstimate) ?? 0,
      priority: Number(newFlexPriority) as any,
      deadlineAt: parseDeadlineInput(newFlexDeadline),
    });
    setNewFlexTitle("");
    setNewFlexEstimate("0");
    setNewFlexPriority("2");
    setNewFlexDeadline("");
  }

  // ---------------- Editing
  const [editingTaskId, setEditingTaskId] = useState<ID | null>(null);
  const editingTask = useMemo(() => (editingTaskId ? s.tasks.find((t) => t.id === editingTaskId) ?? null : null), [editingTaskId, s.tasks]);

  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPlannedDate, setEditPlannedDate] = useState("");
  const [editPlannedStart, setEditPlannedStart] = useState("");
  const [editEstimate, setEditEstimate] = useState("");
  const [editPriority, setEditPriority] = useState("2");
  const [editDeadline, setEditDeadline] = useState("");

  useEffect(() => {
    if (!editingTask) return;
    setEditTitle(editingTask.title ?? "");
    setEditNotes(editingTask.notes ?? "");
    setEditPlannedDate(editingTask.plannedDate ?? "");
    setEditPlannedStart(editingTask.plannedStart ?? "");
    setEditEstimate(typeof editingTask.estimateMin === "number" ? String(editingTask.estimateMin) : "");
    setEditPriority(String(editingTask.priority ?? 2));
    setEditDeadline(editingTask.deadlineAt ? toLocalDateTimeInput(editingTask.deadlineAt) : "");
  }, [editingTaskId]); // intentionally only when switching task to edit

  function saveTaskEdit() {
    if (!editingTaskId) return;
    updateTask(editingTaskId, {
      title: editTitle.trim() || "Без названия",
      notes: editNotes,
      plannedDate: editPlannedDate || null,
      plannedStart: editPlannedStart || null,
      estimateMin: parseEstimate(editEstimate),
      priority: Number(editPriority) as any,
      deadlineAt: parseDeadlineInput(editDeadline),
    });
    setEditingTaskId(null);
  }

  function cancelTaskEdit() {
    setEditingTaskId(null);
  }

  const editPanelNode = editingTask ? (
    <TaskEditPanel
      task={editingTask}
      editTitle={editTitle}
      setEditTitle={setEditTitle}
      editNotes={editNotes}
      setEditNotes={setEditNotes}
      editPlannedDate={editPlannedDate}
      setEditPlannedDate={setEditPlannedDate}
      editPlannedStart={editPlannedStart}
      setEditPlannedStart={setEditPlannedStart}
      editEstimate={editEstimate}
      setEditEstimate={setEditEstimate}
      editPriority={editPriority}
      setEditPriority={setEditPriority}
      editDeadline={editDeadline}
      setEditDeadline={setEditDeadline}
      onSave={saveTaskEdit}
      onCancel={cancelTaskEdit}
    />
  ) : null;

  // ---------------- Data slices
  const tasksToday = useMemo(() => s.tasks.filter((t) => t.plannedDate === today && t.status !== "done"), [s.tasks, today]);
  const doneToday = useMemo(() => s.tasks.filter((t) => t.plannedDate === today && t.status === "done"), [s.tasks, today]);

  const deadlines = useMemo(
    () =>
      s.tasks
        .filter((t) => t.status !== "done" && typeof t.deadlineAt === "number")
        .sort((a, b) => (a.deadlineAt ?? 0) - (b.deadlineAt ?? 0)),
    [s.tasks]
  );

  const hardToday = useMemo(
    () =>
      tasksToday
        .filter((t) => !!t.plannedStart)
        .sort((a, b) => (a.plannedStart ?? "").localeCompare(b.plannedStart ?? "")),
    [tasksToday]
  );

  const flexToday = useMemo(
    () =>
      tasksToday
        .filter((t) => !t.plannedStart)
        .sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2) || b.updatedAt - a.updatedAt),
    [tasksToday]
  );

  // ---------------- UI
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      {/* TIMER */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-100">Сегодня</div>
            <div className="mt-1 text-sm text-slate-400">
              Таймер: <span className="text-slate-200">{timerStatus}</span>
              {active ? <span className="text-slate-400"> — {activeTaskTitle}</span> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-10 min-w-[260px] rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600 disabled:opacity-60"
              value={timerTimeTypeId}
              onChange={(e) => setTimerTimeTypeId(e.target.value as any)}
              disabled={!!active}
            >
              <option value="">(не выбран)</option>
              {timeTypes.map((tt) => (
                <option key={tt.id} value={tt.id}>
                  {tt.name}
                </option>
              ))}
            </select>

            {!active ? (
              <button className="h-10 rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-slate-950" onClick={startNoTask}>
                Старт без задачи
              </button>
            ) : null}

            {active && !isPaused ? (
              <div className="relative inline-flex">
                <button
                  className="h-10 rounded-l-lg border border-slate-800 bg-slate-950 px-4 text-sm hover:bg-slate-800"
                  onClick={() => startPause("useful")}
                  title="Пауза"
                >
                  ⏸ Пауза
                </button>
                <button
                  className="h-10 rounded-r-lg border border-l-0 border-slate-800 bg-slate-950 px-3 text-sm hover:bg-slate-800"
                  onClick={() => setPauseMenuOpen((v) => !v)}
                  title="Пауза: варианты"
                >
                  ▾
                </button>

                {pauseMenuOpen ? (
                  <div className="absolute right-0 top-11 z-20 w-56 rounded-xl border border-slate-800 bg-slate-950 p-2 shadow-lg">
                    <button
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-800"
                      onClick={() => startPause("useful")}
                    >
                      Отвлекли
                      <div className="text-xs text-slate-400">временная полезная пауза</div>
                    </button>
                    <button
                      className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-800"
                      onClick={() => startPause("rest")}
                    >
                      Перерыв
                      <div className="text-xs text-slate-400">восстановление</div>
                    </button>
                    <button
                      className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-800"
                      onClick={() => startPause("sink")}
                    >
                      Залип
                      <div className="text-xs text-slate-400">поглотитель / залипание</div>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {active && isPaused ? (
              <button
                className="h-10 rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-slate-950"
                onClick={resume}
                disabled={!resumeTarget}
                title={resumeTarget ? "Возобновить предыдущую задачу" : "Нет данных для возобновления"}
              >
                ▶ Возобновить
              </button>
            ) : null}

            {active ? (
              <button className="h-10 rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-slate-950" onClick={stopCurrent}>
                Стоп
              </button>
            ) : null}
          </div>
        </div>

        {active ? (
          <div className="mt-3">
            <div className="text-xs text-slate-400">Комментарий к текущей записи (добавится при «Стоп» или переключении)</div>
            <input
              className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
              value={activeNote}
              onChange={(e) => setActiveNote(e.target.value)}
              placeholder="Например: созвон, правки, дорога, бытовуха…"
            />
          </div>
        ) : null}
      </div>

      {/* DEADLINES */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <div className="flex items-baseline justify-between">
          <div className="text-lg font-semibold text-slate-100">Дедлайны</div>
          <div className="text-xs text-slate-500">показываются пока задача не закрыта</div>
        </div>

        <div className="mt-3 space-y-2">
          {deadlines.length === 0 ? (
            <div className="text-sm text-slate-500">Пока пусто</div>
          ) : (
            deadlines.slice(0, 12).map((t) => (
              <DeadlineRow
                key={t.id}
                t={t}
                today={today}
                isEditing={editingTaskId === t.id}
                onBeginEdit={(id) => setEditingTaskId(id)}
                onToggleDone={(id) => toggleDone(id)}
                onDelete={(id) => {
                  if (!window.confirm("Удалить задачу?")) return;
                  deleteTask(id);
                  if (editingTaskId === id) setEditingTaskId(null);
                }}
                editPanel={editingTaskId === t.id ? editPanelNode : null}
              />
            ))
          )}
        </div>
      </div>

      {/* TASKS */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* HARD */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex items-baseline justify-between">
            <div className="text-lg font-semibold text-slate-100">Жёсткие задачи</div>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <input
              className="h-10 flex-1 min-w-[220px] rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm outline-none focus:border-slate-600"
              value={newHardTitle}
              onChange={(e) => setNewHardTitle(e.target.value)}
              placeholder="Новая жёсткая задача…"
              onKeyDown={(e) => {
                if (e.key === "Enter") addHardTask();
              }}
            />

            <input
              type="time"
              className="h-10 w-[110px] rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm outline-none focus:border-slate-600"
              value={newHardStart}
              onChange={(e) => setNewHardStart(e.target.value)}
            />

            <input
              className="h-10 w-[110px] rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm outline-none focus:border-slate-600"
              value={newHardEstimate}
              onChange={(e) => setNewHardEstimate(e.target.value)}
              placeholder="0"
              inputMode="numeric"
            />

            <select
              className="h-10 w-[150px] rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm outline-none focus:border-slate-600"
              value={newHardPriority}
              onChange={(e) => setNewHardPriority(e.target.value)}
            >
              <option value="1">Высокий</option>
              <option value="2">Средний</option>
              <option value="3">Низкий</option>
            </select>

            <button
              className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-4 text-sm hover:bg-slate-800 disabled:opacity-40"
              onClick={addHardTask}
              disabled={!newHardTitle.trim()}
            >
              Добавить
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {hardToday.length === 0 ? (
              <div className="text-sm text-slate-500">Пока пусто</div>
            ) : (
              hardToday.map((t) => (
                <TaskRow
                  key={t.id}
                  t={t}
                  isActive={!!active && active.taskId === t.id}
                  activeExists={!!active}
                  onStartOrSwitch={startOrSwitchToTask}
                  onToggleDone={(id) => toggleDone(id)}
                  onBeginEdit={(id) => setEditingTaskId(id)}
                  onDelete={(id) => deleteTask(id)}
                  onMove={(id, pd, ps = null) => moveTask(id, pd, ps)}
                  yesterday={yesterday}
                  tomorrow={tomorrow}
                  isEditing={editingTaskId === t.id}
                  editPanel={editingTaskId === t.id ? editPanelNode : null}
                />
              ))
            )}
          </div>
        </div>

        {/* FLEX */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex items-baseline justify-between">
            <div className="text-lg font-semibold text-slate-100">Гибкие задачи</div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_96px_auto] md:items-center">
            <input
              className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
              value={newFlexTitle}
              onChange={(e) => setNewFlexTitle(e.target.value)}
              placeholder="Новая гибкая задача…"
            />
            <input
              type="number"
              min={0}
              className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
              value={newFlexEstimate}
              onChange={(e) => setNewFlexEstimate(e.target.value)}
              placeholder="0"
            />
            <div className="flex items-center gap-2">
              <select
                className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
                value={newFlexPriority}
                onChange={(e) => setNewFlexPriority(e.target.value)}
              >
                <option value="1">Высокий</option>
                <option value="2">Средний</option>
                <option value="3">Низкий</option>
              </select>
              <button className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-4 text-sm hover:bg-slate-800" onClick={addFlexTask}>
                Добавить
              </button>
            </div>
          </div>

          <div className="mt-2">
            <label className="text-xs text-slate-400">Дедлайн (опционально)</label>
            <input
              type="datetime-local"
              className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
              value={newFlexDeadline}
              onChange={(e) => setNewFlexDeadline(e.target.value)}
            />
          </div>

          <div className="mt-3 space-y-2">
            {flexToday.length === 0 ? (
              <div className="text-sm text-slate-500">Пока пусто</div>
            ) : (
              flexToday.map((t) => (
                <TaskRow
                  key={t.id}
                  t={t}
                  isActive={!!active && active.taskId === t.id}
                  activeExists={!!active}
                  onStartOrSwitch={startOrSwitchToTask}
                  onToggleDone={(id) => toggleDone(id)}
                  onBeginEdit={(id) => setEditingTaskId(id)}
                  onDelete={(id) => deleteTask(id)}
                  onMove={(id, pd, ps = null) => moveTask(id, pd, ps)}
                  yesterday={yesterday}
                  tomorrow={tomorrow}
                  isEditing={editingTaskId === t.id}
                  editPanel={editingTaskId === t.id ? editPanelNode : null}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* DONE */}
      <details className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <summary className="cursor-pointer select-none text-sm font-semibold text-slate-100">
          Выполнено сегодня ({doneToday.length})
        </summary>
        <div className="mt-3 space-y-2">
          {doneToday.length === 0 ? (
            <div className="text-sm text-slate-500">Пока пусто</div>
          ) : (
            doneToday.map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-300 line-through">{t.title}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      приоритет: {prioLabel(t.priority ?? 2)}
                      {typeof t.estimateMin === "number" && t.estimateMin > 0 ? ` • оценка ${fmtDuration(t.estimateMin)}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
                      onClick={() => toggleDone(t.id)}
                      title="Вернуть в работу"
                    >
                      ↩
                    </button>
                    <button
                      className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
                      onClick={() => deleteTask(t.id)}
                      title="Удалить"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </details>
    </div>
  );
}
