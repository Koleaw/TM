import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  createTask,
  deleteTask,
  getWeekStart,
  moveTask,
  startTimer,
  stopTimer,
  todayYMD,
  updateTask,
  useAppState,
  weekDays,
  ymdAddDays,
  type ID,
  type Task,
} from "../data/db";
import {
  TaskEditPanel,
  TaskRow,
  parseDeadlineInput,
  parseEstimate,
} from "./TodayPage";

const MONTH_NAMES = [
  "Янв",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Июн",
  "Июл",
  "Авг",
  "Сен",
  "Окт",
  "Ноя",
  "Дек",
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymdFromDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthKey(year: number, monthIndex: number) {
  return `${year}-${pad2(monthIndex + 1)}`;
}

type PlanTabKey = "year" | "month" | "week";

function SectionTabs({ value, onChange }: { value: PlanTabKey; onChange: (v: PlanTabKey) => void }) {
  const tabOptions: { key: PlanTabKey; label: string }[] = [
    { key: "year", label: "Год" },
    { key: "month", label: "Месяц" },
    { key: "week", label: "Неделя" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-2">
      {tabOptions.map((t) => (
        <button
          key={t.key}
          className={`rounded-lg px-3 py-2 text-sm font-semibold ${
            value === t.key
              ? "bg-slate-50 text-slate-950"
              : "border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
          }`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

type TaskType = "hard" | "flex";

function TaskCreateForm({
  defaultDate,
  onCreate,
}: {
  defaultDate: string;
  onCreate: (payload: {
    title: string;
    notes: string;
    plannedDate: string;
    plannedStart: string | null;
    priority: 1 | 2 | 3;
    estimateMin: number | null;
    deadlineAt: number | null;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("flex");
  const [plannedDate, setPlannedDate] = useState(defaultDate);
  const [plannedStart, setPlannedStart] = useState("");
  const [priority, setPriority] = useState<"1" | "2" | "3">("2");
  const [estimate, setEstimate] = useState("");
  const [deadlineInput, setDeadlineInput] = useState("");

  useEffect(() => {
    setPlannedDate(defaultDate);
  }, [defaultDate]);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;

    const parsedEstimate = parseEstimate(estimate);
    const plannedStartValue = taskType === "hard" ? plannedStart.trim() || null : null;
    onCreate({
      title: trimmed,
      notes: notes.trim(),
      plannedDate: plannedDate || defaultDate,
      plannedStart: plannedStartValue,
      priority: Number(priority) as 1 | 2 | 3,
      estimateMin: parsedEstimate,
      deadlineAt: parseDeadlineInput(deadlineInput),
    });

    setTitle("");
    setNotes("");
    setTaskType("flex");
    setPlannedDate(defaultDate);
    setPlannedStart("");
    setPriority("2");
    setEstimate("");
    setDeadlineInput("");
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-3">
      <div className="text-sm font-semibold text-slate-100">Новая задача</div>
      <div className="grid gap-2 md:grid-cols-2">
        <input
          className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название"
        />
        <select
          className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
          value={taskType}
          onChange={(e) => setTaskType(e.target.value as TaskType)}
        >
          <option value="hard">Жёсткая</option>
          <option value="flex">Гибкая</option>
        </select>
      </div>

      <textarea
        className="min-h-[80px] w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-slate-600"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Заметка/описание"
      />

      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-xs text-slate-300">
          Дата
          <input
            type="date"
            className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
            value={plannedDate}
            onChange={(e) => setPlannedDate(e.target.value)}
          />
        </label>
        <label className="text-xs text-slate-300">
          Время (жёсткая)
          <input
            type="time"
            className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
            value={plannedStart}
            onChange={(e) => setPlannedStart(e.target.value)}
            disabled={taskType !== "hard"}
          />
        </label>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <label className="text-xs text-slate-300">
          Приоритет
          <select
            className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
            value={priority}
            onChange={(e) => setPriority(e.target.value as "1" | "2" | "3")}
          >
            <option value="1">Высокий</option>
            <option value="2">Средний</option>
            <option value="3">Низкий</option>
          </select>
        </label>

        <label className="text-xs text-slate-300">
          Оценка, мин
          <input
            type="number"
            min={0}
            className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
            placeholder="0"
          />
        </label>

        <label className="text-xs text-slate-300">
          Дедлайн
          <input
            type="datetime-local"
            className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
            value={deadlineInput}
            onChange={(e) => setDeadlineInput(e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded-lg bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-950"
          onClick={submit}
          disabled={!title.trim()}
        >
          Добавить
        </button>
        <div className="text-xs text-slate-500">Поддерживает жёсткие/гибкие задачи, приоритет, дедлайн, заметки</div>
      </div>
    </div>
  );
}

export default function PlansPage() {
  const s = useAppState();
  const today = todayYMD();
  const [tab, setTab] = useState<PlanTabKey>("week");
  const [weekStart, setWeekStart] = useState(() => getWeekStart(today, s.settings.weekStartsOn));
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), monthIndex: d.getMonth() };
  });

  const tasksRoot = useMemo(
    () => s.tasks.filter((t) => t.parentId == null && !t.isProject),
    [s.tasks]
  );
  const childrenByParentId = useMemo(() => {
    const m: Record<string, Task[]> = {};
    for (const t of s.tasks) {
      if (!t.parentId) continue;
      const key = String(t.parentId);
      if (!m[key]) m[key] = [];
      m[key].push(t);
    }
    return m;
  }, [s.tasks]);

  const active = s.activeTimer;

  const weekDayList = useMemo(() => weekDays(weekStart), [weekStart]);
  const tasksByDay = useMemo(() => {
    const bucket: Record<string, Task[]> = {};
    for (const d of weekDayList) bucket[d] = [];
    for (const t of tasksRoot) {
      if (t.plannedDate && bucket[t.plannedDate]) {
        bucket[t.plannedDate].push(t);
      }
    }
    for (const d of Object.keys(bucket)) {
      bucket[d].sort((a, b) => {
        const aHard = !!a.plannedStart;
        const bHard = !!b.plannedStart;
        if (aHard !== bHard) return aHard ? -1 : 1;
        if (a.plannedStart && b.plannedStart) return a.plannedStart.localeCompare(b.plannedStart);
        return (a.priority ?? 2) - (b.priority ?? 2) || b.updatedAt - a.updatedAt;
      });
    }
    return bucket;
  }, [tasksRoot, weekDayList]);

  const tasksByMonth = useMemo(() => {
    const m: Record<string, Task[]> = {};
    for (const t of tasksRoot) {
      if (!t.plannedDate) continue;
      const [y, mo] = t.plannedDate.split("-");
      const key = `${y}-${mo}`;
      if (!m[key]) m[key] = [];
      m[key].push(t);
    }
    return m;
  }, [tasksRoot]);

  const tasksByYear = useMemo(() => {
    const m: Record<string, Task[]> = {};
    for (const t of tasksRoot) {
      if (!t.plannedDate) continue;
      const key = t.plannedDate.slice(0, 4);
      if (!m[key]) m[key] = [];
      m[key].push(t);
    }
    return m;
  }, [tasksRoot]);

  const yearList = useMemo(() => {
    const set = new Set<string>();
    set.add(today.slice(0, 4));
    Object.keys(tasksByYear).forEach((y) => set.add(y));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [tasksByYear, today]);

  const [editingTaskId, setEditingTaskId] = useState<ID | null>(null);
  const editingTask = useMemo(() => s.tasks.find((t) => t.id === editingTaskId) ?? null, [s.tasks, editingTaskId]);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPlannedDate, setEditPlannedDate] = useState("");
  const [editPlannedStart, setEditPlannedStart] = useState("");
  const [editEstimate, setEditEstimate] = useState("");
  const [editPriority, setEditPriority] = useState("2");
  const [editDeadline, setEditDeadline] = useState("");

  useEffect(() => {
    if (!editingTask) return;
    setEditTitle(editingTask.title);
    setEditNotes(editingTask.notes ?? "");
    setEditPlannedDate(editingTask.plannedDate ?? "");
    setEditPlannedStart(editingTask.plannedStart ?? "");
    setEditEstimate((editingTask.estimateMin ?? "").toString());
    setEditPriority(String(editingTask.priority ?? 2));
    setEditDeadline(editingTask.deadlineAt ? new Date(editingTask.deadlineAt).toISOString().slice(0, 16) : "");
  }, [editingTask]);

  function startOrSwitchToTask(taskId: ID) {
    if (active?.taskId === taskId) {
      stopTimer();
      return;
    }
    startTimer(taskId, active?.timeTypeId ?? null, active?.kind ?? "useful", active?.sinkId ?? null);
  }

  function saveTaskEdit() {
    if (!editingTask) return;
    updateTask(editingTask.id, {
      title: editTitle.trim() || "Без названия",
      notes: editNotes,
      plannedDate: editPlannedDate || null,
      plannedStart: editPlannedStart || null,
      estimateMin: parseEstimate(editEstimate),
      priority: Number(editPriority) as 1 | 2 | 3,
      deadlineAt: parseDeadlineInput(editDeadline),
    });
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
      onCancel={() => setEditingTaskId(null)}
    />
  ) : null;

  function createForDate(date: string, payload: Parameters<TaskCreateForm["onCreate"]>[0]) {
    const plannedDate = payload.plannedDate || date;
    createTask(payload.title, {
      notes: payload.notes,
      plannedDate,
      plannedStart: payload.plannedStart,
      priority: payload.priority,
      estimateMin: payload.estimateMin,
      deadlineAt: payload.deadlineAt,
    });
  }

  function renderTaskList(tasks: Task[]) {
    return (
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <div className="text-sm text-slate-500">Пока пусто</div>
        ) : (
          tasks.map((t) => (
            <TaskRow
              key={t.id}
              t={t}
              isActive={!!active && active.taskId === t.id}
              activeExists={!!active}
              activeTaskId={active?.taskId ?? null}
              onStartOrSwitch={startOrSwitchToTask}
              onToggleDone={(id) => {
                const current = s.tasks.find((x) => x.id === id);
                if (!current) return;
                updateTask(id, { status: current.status === "done" ? "todo" : "done" });
              }}
              onBeginEdit={(id) => setEditingTaskId(id)}
              onDelete={(id) => deleteTask(id)}
              onMove={(id, pd, ps = null) => moveTask(id, pd, ps ?? null)}
              yesterday={ymdAddDays(t.plannedDate ?? today, -1)}
              tomorrow={ymdAddDays(t.plannedDate ?? today, 1)}
              isEditing={editingTaskId === t.id}
              editingTaskId={editingTaskId}
              editPanel={editPanelNode}
              subtasks={childrenByParentId[t.id] ?? []}
              childrenByParentId={childrenByParentId}
            />
          ))
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-lg font-semibold text-slate-100">Планы</div>
          <div className="text-sm text-slate-400">Единое хранилище задач: Сегодня и Планы синхронизированы</div>
        </div>
        <Link to="/today" className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm hover:bg-slate-800">
          ← В Сегодня
        </Link>
      </div>

      <SectionTabs value={tab} onChange={setTab} />

      {tab === "week" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm hover:bg-slate-800"
              onClick={() => setWeekStart(ymdAddDays(weekStart, -7))}
            >
              ← Неделю назад
            </button>
            <div className="text-sm text-slate-300">{weekDayList[0]} — {weekDayList[6]}</div>
            <button
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm hover:bg-slate-800"
              onClick={() => setWeekStart(ymdAddDays(weekStart, 7))}
            >
              Вперёд →
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {weekDayList.map((day) => (
              <div key={day} className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-100">{day}</div>
                  {day === today ? <span className="text-xs text-emerald-300">Сегодня</span> : null}
                </div>
                <TaskCreateForm
                  defaultDate={day}
                  onCreate={(payload) => createForDate(day, payload)}
                />
                {renderTaskList(tasksByDay[day] ?? [])}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "month" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm hover:bg-slate-800"
              onClick={() =>
                setMonthCursor(({ year, monthIndex }) => {
                  const prev = new Date(year, monthIndex - 1, 1);
                  return { year: prev.getFullYear(), monthIndex: prev.getMonth() };
                })
              }
            >
              ←
            </button>
            <div className="text-sm text-slate-200">
              {MONTH_NAMES[monthCursor.monthIndex]} {monthCursor.year}
            </div>
            <button
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm hover:bg-slate-800"
              onClick={() =>
                setMonthCursor(({ year, monthIndex }) => {
                  const next = new Date(year, monthIndex + 1, 1);
                  return { year: next.getFullYear(), monthIndex: next.getMonth() };
                })
              }
            >
              →
            </button>
          </div>

          {(() => {
            const start = new Date(monthCursor.year, monthCursor.monthIndex, 1);
            const end = new Date(monthCursor.year, monthCursor.monthIndex + 1, 0);
            const days: string[] = [];
            for (let i = 1; i <= end.getDate(); i++) {
              days.push(ymdFromDate(new Date(monthCursor.year, monthCursor.monthIndex, i)));
            }
            const key = monthKey(monthCursor.year, monthCursor.monthIndex);
            const tasks = (tasksByMonth[key] ?? []).sort(
              (a, b) => (a.plannedDate ?? "").localeCompare(b.plannedDate ?? "") || (a.priority ?? 2) - (b.priority ?? 2)
            );
            return (
              <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950 p-3">
                <div className="text-sm font-semibold text-slate-100">Задачи месяца</div>
                <TaskCreateForm
                  defaultDate={ymdFromDate(start)}
                  onCreate={(payload) => createForDate(payload.plannedDate || ymdFromDate(start), payload)}
                />
                <div className="text-xs text-slate-500">Дни: {days[0]} — {days[days.length - 1]}</div>
                {renderTaskList(tasks)}
              </div>
            );
          })()}
        </div>
      ) : null}

      {tab === "year" ? (
        <div className="space-y-3">
          {yearList.map((year) => {
            const tasks = (tasksByYear[year] ?? []).slice().sort(
              (a, b) => (a.plannedDate ?? "").localeCompare(b.plannedDate ?? "") || (a.priority ?? 2) - (b.priority ?? 2)
            );
            return (
              <div key={year} className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-100">{year}</div>
                  <TaskCreateForm
                    defaultDate={`${year}-01-01`}
                    onCreate={(payload) => createForDate(payload.plannedDate || `${year}-01-01`, payload)}
                  />
                </div>
                {renderTaskList(tasks)}
              </div>
            );
          })}

          {yearList.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
              Пока нет задач с датой. Добавьте через любую форму выше, и они появятся одновременно в Сегодня и Планах.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
