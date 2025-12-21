import React, { useEffect, useMemo, useState } from "react";
import {
  createTask,
  deleteTask,
  getState,
  moveTask,
  setLastAction,
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
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && isFinite(v as number);

function localId(): string {
  // lightweight uid for checklist items / subtasks
  // @ts-ignore
  return (
    globalThis.crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2)}_${Date.now()}`
  );
}

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
  if (!isFiniteNumber(min) || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}

function fmtCountdown(deadlineAt: number) {
  if (!isFiniteNumber(deadlineAt)) return "—";
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

function prioBarClass(p: number) {
  if (p === 1) return "bg-rose-500/80";
  if (p === 2) return "bg-amber-400/80";
  return "bg-emerald-500/70";
}


function ChecklistEditor({ task }: { task: Task }) {
  const checklist = task.checklist ?? [];
  const [newItem, setNewItem] = useState("");

  function addItem() {
    const text = newItem.trim();
    if (!text) return;
    const updated = [...checklist, { id: localId(), text, done: false }];
    updateTask(task.id, { checklist: updated });
    setNewItem("");
  }

  function toggleItem(id: ID) {
    const updated = checklist.map((it) => (it.id === id ? { ...it, done: !it.done } : it));
    updateTask(task.id, { checklist: updated });
  }

  function editItem(id: ID, text: string) {
    const updated = checklist.map((it) => (it.id === id ? { ...it, text } : it));
    updateTask(task.id, { checklist: updated });
  }

  function deleteItem(id: ID) {
    const updated = checklist.filter((it) => it.id !== id);
    updateTask(task.id, { checklist: updated });
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-800/70 bg-slate-900/60 p-3">
      <div className="text-xs font-semibold text-slate-200">Чеклист</div>
      {checklist.length === 0 ? (
        <div className="text-xs text-slate-500">Пока пусто</div>
      ) : (
        <div className="space-y-2">
          {checklist.map((it) => (
            <div key={it.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-emerald-400"
                checked={!!it.done}
                onChange={() => toggleItem(it.id)}
              />
              <input
                className="h-9 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-slate-600"
                value={it.text}
                onChange={(e) => editItem(it.id, e.target.value)}
              />
              <button
                className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                onClick={() => deleteItem(it.id)}
                title="Удалить пункт"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="h-9 min-w-[220px] flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-slate-600"
          placeholder="Новый пункт чеклиста"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addItem();
          }}
        />
        <button
          className="h-9 rounded-lg border border-slate-800 bg-slate-950 px-3 text-xs font-semibold text-slate-100 hover:bg-slate-800"
          onClick={addItem}
        >
          Добавить
        </button>
      </div>
    </div>
  );
}

function SubtaskRow(props: {
  task: Task;
  subtasks: Task[];
  childrenByParentId: Record<string, Task[]>;
  isActive: boolean;
  activeExists: boolean;
  activeTaskId: ID | null;
  onStartOrSwitch: (taskId: ID) => void;
  onToggleDone: (taskId: ID) => void;
  onBeginEdit: (taskId: ID) => void;
  onDelete: (taskId: ID) => void;
  editingTaskId: ID | null;
  editPanel: React.ReactNode;
}) {
  const {
    task,
    subtasks,
    childrenByParentId,
    isActive,
    activeExists,
    activeTaskId,
    onStartOrSwitch,
    onToggleDone,
    onBeginEdit,
    onDelete,
    editingTaskId,
    editPanel,
  } = props;

  const [open, setOpen] = useState(false);

  const metaParts: string[] = [];
  metaParts.push(`приоритет: ${prioLabel(task.priority ?? 2)}`);
  if (typeof task.estimateMin === "number" && task.estimateMin > 0) metaParts.push(`оценка ${fmtDuration(task.estimateMin)}`);
  if (task.deadlineAt) metaParts.push(`дедлайн ${fmtCountdown(task.deadlineAt)}`);

  return (
    <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
              onClick={() => setOpen((v) => !v)}
              title={open ? "Свернуть детали" : "Детали подзадачи"}
            >
              {open ? "▾" : "▸"}
            </button>
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-emerald-400"
              checked={task.status === "done"}
              onChange={() => onToggleDone(task.id)}
            />
            <div className={`truncate text-sm font-medium ${isActive ? "text-emerald-300" : "text-slate-100"}`}>
              {task.title}
            </div>
            {isActive ? (
              <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
                active
              </span>
            ) : null}
          </div>
          <div className="text-xs text-slate-400">{metaParts.join(" • ") || ""}</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950"
            onClick={() => onStartOrSwitch(task.id)}
            title={activeExists ? "Переключиться" : "Старт"}
          >
            {activeExists ? "→" : "Старт"}
          </button>

          <button
            className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
            onClick={() => onBeginEdit(task.id)}
            title="Редактировать"
          >
            ✎
          </button>

          <button
            className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
            onClick={() => onDelete(task.id)}
            title="Удалить подзадачу"
          >
            🗑
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-3">
          <TaskDetails
            task={task}
            subtasks={subtasks}
            childrenByParentId={childrenByParentId}
            allowSubtasks
            activeTaskId={activeTaskId}
            activeExists={activeExists}
            onStartOrSwitch={onStartOrSwitch}
            onToggleDone={onToggleDone}
            onBeginEdit={onBeginEdit}
            onDelete={onDelete}
            editingTaskId={editingTaskId}
            editPanel={editPanel}
          />
        </div>
      ) : editingTaskId === task.id ? (
        <div className="mt-3">{editPanel}</div>
      ) : null}
    </div>
  );
}

function TaskDetails(props: {
  task: Task;
  subtasks: Task[];
  childrenByParentId: Record<string, Task[]>;
  allowSubtasks: boolean;
  activeTaskId: ID | null;
  activeExists: boolean;
  onStartOrSwitch: (taskId: ID) => void;
  onToggleDone: (taskId: ID) => void;
  onBeginEdit: (taskId: ID) => void;
  onDelete: (taskId: ID) => void;
  editingTaskId: ID | null;
  editPanel: React.ReactNode;
}) {
  const {
    task,
    subtasks,
    childrenByParentId,
    allowSubtasks,
    activeTaskId,
    activeExists,
    onStartOrSwitch,
    onToggleDone,
    onBeginEdit,
    onDelete,
    editingTaskId,
    editPanel,
  } = props;
  const [newSubtask, setNewSubtask] = useState("");

  function addSubtask() {
    if (!allowSubtasks) return;
    const title = newSubtask.trim();
    if (!title) return;
    createTask(title, {
      parentId: task.id,
      plannedDate: task.plannedDate ?? null,
      plannedStart: null,
      priority: task.priority,
      deadlineAt: task.deadlineAt,
      estimateMin: null,
    });
    setNewSubtask("");
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
      <ChecklistEditor task={task} />

      {allowSubtasks ? (
        <div className="space-y-3 rounded-lg border border-slate-800/70 bg-slate-950/40 p-3">
          <div className="text-xs font-semibold text-slate-200">Подзадачи</div>
          {subtasks.length === 0 ? (
            <div className="text-xs text-slate-500">Подзадач пока нет</div>
          ) : (
            <div className="space-y-2">
              {subtasks.map((st) => (
                <SubtaskRow
                  key={st.id}
                  task={st}
                  subtasks={childrenByParentId[st.id] ?? []}
                  childrenByParentId={childrenByParentId}
                  isActive={activeTaskId === st.id}
                  activeExists={activeExists}
                  activeTaskId={activeTaskId}
                  onStartOrSwitch={onStartOrSwitch}
                  onToggleDone={onToggleDone}
                  onBeginEdit={onBeginEdit}
                  onDelete={onDelete}
                  editingTaskId={editingTaskId}
                  editPanel={editPanel}
                />
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input
              className="h-9 min-w-[220px] flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-slate-600"
              placeholder="Новая подзадача"
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addSubtask();
              }}
            />
            <button
              className="h-9 rounded-lg border border-slate-800 bg-slate-950 px-3 text-xs font-semibold text-slate-100 hover:bg-slate-800"
              onClick={addSubtask}
            >
              Добавить подзадачу
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}


function toLocalDateTimeInput(ms: number) {
  const t = Number(ms);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const y = d.getFullYear();
  const mo = pad2(d.getMonth() + 1);
  const da = pad2(d.getDate());
  const h = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  return `${y}-${mo}-${da}T${h}:${mi}`;
}

function parseDeadlineInput(v: string): number | null {
  const s = (v ?? "").trim();
  if (!s) return null;

  // input[type=datetime-local] обычно даёт:
  //   YYYY-MM-DDTHH:MM
  // иногда (в зависимости от браузера) может прийти:
  //   YYYY-MM-DD HH:MM
  // или просто YYYY-MM-DD (если тип/ввод отличается)
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const hour = m[4] != null ? Number(m[4]) : 0;
  const minute = m[5] != null ? Number(m[5]) : 0;
  const second = m[6] != null ? Number(m[6]) : 0;

  const dt = new Date(year, month, day, hour, minute, second, 0);
  const ts = dt.getTime();
  if (!isFiniteNumber(ts)) return null;
  return ts;
}


function parseEstimate(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  if (!isFiniteNumber(n) || n < 0) return null;
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
  activeTaskId: ID | null;
  onStartOrSwitch: (taskId: ID) => void;
  onToggleDone: (taskId: ID) => void;
  onBeginEdit: (taskId: ID) => void;
  onDelete: (taskId: ID) => void;
  onMove: (taskId: ID, plannedDate: string | null, plannedStart?: string | null) => void;
  yesterday: string;
  tomorrow: string;
  isEditing: boolean;
  editingTaskId: ID | null;
  editPanel: React.ReactNode;
  subtasks: Task[];
  childrenByParentId: Record<string, Task[]>;
}) {
  const {
    t,
    isActive,
    activeExists,
    activeTaskId,
    onStartOrSwitch,
    onToggleDone,
    onBeginEdit,
    onDelete,
    onMove,
    yesterday,
    tomorrow,
    isEditing,
    editingTaskId,
    editPanel,
    subtasks,
    childrenByParentId,
  } = props;

  const [openDetails, setOpenDetails] = useState(false);

  const metaParts: string[] = [];
  metaParts.push(`приоритет: ${prioLabel(t.priority ?? 2)}`);
  if (typeof t.estimateMin === "number" && t.estimateMin > 0) metaParts.push(`оценка ${fmtDuration(t.estimateMin)}`);
  if (t.deadlineAt) metaParts.push(`дедлайн ${fmtCountdown(t.deadlineAt)}`);
  if (t.plannedStart) metaParts.push(t.plannedStart);

  return (
    <div className="relative rounded-xl border border-slate-800 bg-slate-950 p-3 pl-4">
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${prioBarClass(t.priority)}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
              onClick={() => setOpenDetails((v) => !v)}
              title={openDetails ? "Свернуть детали" : "Детали задачи"}
            >
              {openDetails ? "▾" : "▸"}
            </button>
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

      {openDetails ? (
        <TaskDetails
          task={t}
          subtasks={subtasks}
          childrenByParentId={childrenByParentId}
          allowSubtasks={!t.parentId}
          activeTaskId={activeTaskId}
          activeExists={activeExists}
          onStartOrSwitch={onStartOrSwitch}
          onToggleDone={onToggleDone}
          onBeginEdit={onBeginEdit}
          onDelete={onDelete}
          editingTaskId={editingTaskId}
          editPanel={editPanel}
        />
      ) : null}

      {isEditing ? editPanel : null}
    </div>
  );
}

function DeadlineRow(props: {
  t: Task;
  children: Task[];
  minutesByTaskId: Record<string, number>;
  today: string;
  editingTaskId: ID | null;
  editPanelNode: React.ReactNode;
  onStartOrSwitch: (taskId: ID) => void;
  onBeginEdit: (taskId: ID) => void;
  onToggleDone: (taskId: ID) => void;
  onDelete: (taskId: ID) => void;
}) {
  const {
    t,
    children,
    minutesByTaskId,
    today,
    editingTaskId,
    editPanelNode,
    onStartOrSwitch,
    onBeginEdit,
    onToggleDone,
    onDelete,
  } = props;

  const [open, setOpen] = useState(false);
  const [newSteakTitle, setNewSteakTitle] = useState("");
  const [newSteakEstimate, setNewSteakEstimate] = useState("0");
  const [childDetailsOpen, setChildDetailsOpen] = useState<Record<string, boolean>>({});

  const dueAt = isFiniteNumber(t.deadlineAt) ? t.deadlineAt : null;

  const totalEst =
    children.length > 0
      ? children.reduce((sum, c) => sum + (c.estimateMin ?? 0), 0)
      : (t.estimateMin ?? 0);

  const spentMin = children.reduce((sum, c) => sum + (minutesByTaskId[c.id] ?? 0), 0);
  const remainingMin = totalEst > 0 ? Math.max(0, totalEst - spentMin) : null;

  const daysLeft =
    dueAt == null ? null : Math.max(0, Math.ceil((dueAt - Date.now()) / (24 * 60 * 60 * 1000)));

  const bufferDays = 2;
  const workDays = daysLeft == null ? null : Math.max(1, daysLeft - bufferDays);
  const recPerDay =
    remainingMin != null && workDays != null ? Math.ceil(remainingMin / workDays) : null;

  function addSteak(plannedToday: boolean) {
    const title = newSteakTitle.trim();
    if (!title) return;

    createTask(title, {
      parentId: t.id,
      plannedDate: plannedToday ? today : null,
      plannedStart: null,
      estimateMin: parseEstimate(newSteakEstimate) ?? 0,
      priority: t.priority,
      deadlineAt: null,
    });

    setNewSteakTitle("");
    setNewSteakEstimate("0");
    setOpen(true);
  }

  function addOneShotSteakToday() {
    // Для маленьких дедлайнов: один бифштекс на сегодня.
    createTask(t.title, {
      parentId: t.id,
      plannedDate: today,
      plannedStart: null,
      estimateMin: t.estimateMin ?? 0,
      priority: t.priority,
      deadlineAt: null,
    });
    setOpen(true);
  }

  function moveSteakToToday(id: ID) {
    moveTask(id, today, null);
  }

  function moveSteakToPool(id: ID) {
    moveTask(id, null, null);
  }

  function reorderSteak(id: ID, dir: -1 | 1) {
    const idx = children.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= children.length) return;

    const a = children[idx];
    const b = children[j];

    const ao = (a as any).sortOrder ?? idx;
    const bo = (b as any).sortOrder ?? j;

    updateTask(a.id, { sortOrder: bo as any });
    updateTask(b.id, { sortOrder: ao as any });
  }

  return (
    <div className="relative rounded-xl border border-slate-800 bg-slate-950 p-3 pl-4">
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${prioBarClass(t.priority)}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-800"
              onClick={() => setOpen((v) => !v)}
              title={open ? "Свернуть" : "Раскрыть"}
            >
              {open ? "▾" : "▸"}
            </button>
            <div className="truncate text-sm font-medium text-slate-100">{t.title}</div>
          </div>

          <div className="mt-0.5 text-xs text-slate-400">
            дедлайн {dueAt ? fmtCountdown(dueAt) : "—"}
            {` • приоритет: ${prioLabel(t.priority)}`}
            {totalEst > 0 ? ` • оценка: ${fmtDuration(totalEst)}` : ""}
            {spentMin > 0 ? ` • потрачено: ${fmtDuration(spentMin)}` : ""}
            {remainingMin != null ? ` • осталось: ${fmtDuration(remainingMin)}` : ""}
            {recPerDay != null ? ` • рекоменд.: ${fmtDuration(recPerDay)} / день` : ""}
            {daysLeft != null ? ` • дней до дедлайна: ${daysLeft}` : ""}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {children.length === 0 ? (
            <button
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs hover:bg-slate-800"
              onClick={addOneShotSteakToday}
              title="Быстро: один бифштекс на сегодня"
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
            title="Закрыть/открыть проект"
          >
            ✓
          </button>

          <button
            className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
            onClick={() => onDelete(t.id)}
            title="Удалить проект"
          >
            🗑
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 p-2">
            <input
              className="h-10 min-w-[220px] flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm outline-none focus:border-slate-600"
              placeholder="Новый бифштекс…"
              value={newSteakTitle}
              onChange={(e) => setNewSteakTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addSteak(false);
              }}
            />
            <input
              className="h-10 w-[120px] rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm outline-none focus:border-slate-600"
              placeholder="оценка"
              value={newSteakEstimate}
              onChange={(e) => setNewSteakEstimate(e.target.value)}
            />
            <button
              className="h-10 rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-950 hover:bg-white"
              onClick={() => addSteak(false)}
              title="Добавить бифштекс (в пул дедлайна)"
            >
              Добавить
            </button>
            <button
              className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm font-semibold text-slate-100 hover:bg-slate-800"
              onClick={() => addSteak(true)}
              title="Добавить бифштекс и сразу в сегодня"
            >
              + в сегодня
            </button>
          </div>

          <ChecklistEditor task={t} />

          {children.length === 0 ? (
            <div className="text-sm text-slate-500">Пока нет бифштексов</div>
          ) : (
            children.map((c) => {
              const inToday = c.plannedDate === today;
              const spent = minutesByTaskId[c.id] ?? 0;
              const est = c.estimateMin ?? 0;

              return (
                <div
                  key={c.id}
                  className="relative rounded-xl border border-slate-800 bg-slate-950 p-3 pl-4"
                >
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${prioBarClass(
                      c.priority
                    )}`}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                          onClick={() =>
                            setChildDetailsOpen((prev) => ({ ...prev, [c.id]: !prev[c.id] }))
                          }
                          title={childDetailsOpen[c.id] ? "Свернуть детали" : "Детали подзадачи"}
                        >
                          {childDetailsOpen[c.id] ? "▾" : "▸"}
                        </button>
                        <div className="truncate text-sm font-medium text-slate-100">
                          {c.title}
                          {inToday ? (
                            <span className="ml-2 text-xs text-emerald-300">• в плане</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        {`приоритет: ${prioLabel(c.priority)}`}
                        {est > 0 ? ` • оценка: ${fmtDuration(est)}` : ""}
                        {spent > 0 ? ` • потрачено: ${fmtDuration(spent)}` : ""}
                        {c.status === "done" ? " • закрыто" : ""}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950"
                        onClick={() => onStartOrSwitch(c.id)}
                        title="Старт / переключиться"
                      >
                        Старт
                      </button>

                      {!inToday ? (
                        <button
                          className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs hover:bg-slate-800"
                          onClick={() => moveSteakToToday(c.id)}
                          title="Добавить в план на сегодня"
                        >
                          В сегодня
                        </button>
                      ) : (
                        <button
                          className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs hover:bg-slate-800"
                          onClick={() => moveSteakToPool(c.id)}
                          title="Убрать из плана (вернуть в пул дедлайна)"
                        >
                          Убрать
                        </button>
                      )}

                      <button
                        className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
                        onClick={() => reorderSteak(c.id, -1)}
                        title="Выше"
                      >
                        ↑
                      </button>
                      <button
                        className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
                        onClick={() => reorderSteak(c.id, 1)}
                        title="Ниже"
                      >
                        ↓
                      </button>

                      <button
                        className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
                        onClick={() => onBeginEdit(c.id)}
                        title="Редактировать"
                      >
                        ✎
                      </button>

                      <button
                        className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
                        onClick={() => onToggleDone(c.id)}
                        title="Закрыть/открыть"
                      >
                        ✓
                      </button>

                      <button
                        className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs hover:bg-slate-800"
                        onClick={() => onDelete(c.id)}
                        title="Удалить"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                  {childDetailsOpen[c.id] ? (
                    <div className="mt-2">
                      <ChecklistEditor task={c} />
                    </div>
                  ) : null}
                  {editingTaskId === c.id ? editPanelNode : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {editingTaskId === t.id ? editPanelNode : null}
    </div>
  );
}


function BacklogRow(props: {
  t: Task;
  isEditing: boolean;
  editPanel: React.ReactNode;
  editingTaskId: ID | null;
  childrenByParentId: Record<string, Task[]>;
  activeTaskId: ID | null;
  activeExists: boolean;
  onStartOrSwitch: (taskId: ID) => void;
  onBeginEdit: (taskId: ID) => void;
  onToggleDone: (taskId: ID) => void;
  onDelete: (taskId: ID) => void;
  onMoveToToday: (taskId: ID) => void;
  subtasks: Task[];
}) {
  const {
    t,
    isEditing,
    editPanel,
    editingTaskId,
    childrenByParentId,
    activeTaskId,
    activeExists,
    onStartOrSwitch,
  onBeginEdit,
  onToggleDone,
  onDelete,
  onMoveToToday,
    subtasks,
  } = props;

  const [openDetails, setOpenDetails] = useState(false);

  const metaParts: string[] = [];
  metaParts.push(`приоритет: ${prioLabel(t.priority ?? 2)}`);
  if (typeof t.estimateMin === "number" && t.estimateMin > 0) metaParts.push(`оценка ${fmtDuration(t.estimateMin)}`);
  if (t.doneAt) metaParts.push("закрыто");

  return (
    <div className="relative rounded-xl border border-slate-800 bg-slate-950 p-3 pl-4">
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${prioBarClass(t.priority)}`} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
              onClick={() => setOpenDetails((v) => !v)}
              title={openDetails ? "Свернуть детали" : "Детали задачи"}
            >
              {openDetails ? "▾" : "▸"}
            </button>
            <div className="truncate text-sm font-medium text-slate-100">{t.title}</div>
          </div>
          <div className="mt-0.5 text-xs text-slate-400">{metaParts.join(" • ")}</div>
        </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <button
          className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs hover:bg-slate-800"
            onClick={() => onMoveToToday(t.id)}
            title="Добавить в план на сегодня"
          >
            В сегодня
          </button>
          <button
            className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950"
            onClick={() => onStartOrSwitch(t.id)}
            title="Старт / переключиться"
          >
            Старт
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
            onClick={() => onDelete(t.id)}
            title="Удалить"
          >
            🗑
          </button>
        </div>
      </div>

      {openDetails ? (
        <TaskDetails
          task={t}
          subtasks={subtasks}
          childrenByParentId={childrenByParentId}
          allowSubtasks={!t.parentId}
          activeTaskId={activeTaskId}
          activeExists={activeExists}
          onStartOrSwitch={onStartOrSwitch}
          onToggleDone={onToggleDone}
          onBeginEdit={onBeginEdit}
          onDelete={onDelete}
          editingTaskId={editingTaskId}
          editPanel={editPanel}
        />
      ) : null}

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
    setLastAction("startTimer");
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
  const [newBacklogTitle, setNewBacklogTitle] = useState("");
  const [newBacklogEstimate, setNewBacklogEstimate] = useState("0");
  const [newBacklogPriority, setNewBacklogPriority] = useState("2");

  function addHardTask() {
    if (!newHardTitle.trim()) return;
    setLastAction("addHard");
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

    setLastAction("addFlex");

    const dl = parseDeadlineInput(newFlexDeadline);

    // Если указан дедлайн — создаём "проект" в блоке дедлайнов (НЕ в плане дня).
    if (isFiniteNumber(dl)) {
      createTask(newFlexTitle, {
        plannedDate: null,
        plannedStart: null,
        estimateMin: parseEstimate(newFlexEstimate) ?? 0,
        priority: Number(newFlexPriority) as any,
        deadlineAt: dl,
      });
    } else {
      // Обычная гибкая задача — сразу в план на сегодня.
      createTask(newFlexTitle, {
        plannedDate: today,
        plannedStart: null,
        estimateMin: parseEstimate(newFlexEstimate) ?? 0,
        priority: Number(newFlexPriority) as any,
        deadlineAt: null,
      });
    }

    setNewFlexTitle("");
    setNewFlexEstimate("0");
    setNewFlexPriority("2");
    setNewFlexDeadline("");
  }


  function addBacklogTask() {
    if (!newBacklogTitle.trim()) return;
    setLastAction("addBacklog");
    createTask(newBacklogTitle, {
      plannedDate: null,
      plannedStart: null,
      estimateMin: parseEstimate(newBacklogEstimate) ?? 0,
      priority: Number(newBacklogPriority) as any,
      deadlineAt: null,
    });
    setNewBacklogTitle("");
    setNewBacklogEstimate("0");
    setNewBacklogPriority("2");
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
  const tasksToday = useMemo(
    () => s.tasks.filter((t) => t.parentId == null && t.plannedDate === today && t.status !== "done"),
    [s.tasks, today]
  );
  const doneToday = useMemo(
    () => s.tasks.filter((t) => t.parentId == null && t.plannedDate === today && t.status === "done"),
    [s.tasks, today]
  );

  const deadlines = useMemo(
    () =>
      s.tasks
        .filter(
          (t) =>
            t.status !== "done" &&
            isFiniteNumber(t.deadlineAt) &&
            t.parentId == null &&
            t.plannedDate == null
        )
        .sort((a, b) => (a.deadlineAt ?? 0) - (b.deadlineAt ?? 0)),
    [s.tasks]
  );

  const childrenByParentId = useMemo(() => {
    const m: Record<string, Task[]> = {};
    for (const t of s.tasks) {
      const pid = t.parentId;
      if (!pid) continue;
      const key = String(pid);
      if (!m[key]) m[key] = [];
      m[key].push(t);
    }
    for (const pid of Object.keys(m)) {
      m[pid].sort(
        (a, b) =>
          ((a as any).sortOrder ?? 1e9) - ((b as any).sortOrder ?? 1e9) ||
          a.createdAt - b.createdAt
      );
    }
    return m;
  }, [s.tasks]);

  const minutesByTaskId = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of s.timeLogs) {
      if (!l.taskId) continue;
      m[l.taskId] = (m[l.taskId] ?? 0) + (l.minutes ?? 0);
    }
    return m;
  }, [s.timeLogs]);

  const backlog = useMemo(
    () =>
      s.tasks
        .filter(
          (t) =>
            t.status !== "done" &&
            t.plannedDate == null &&
            t.deadlineAt == null &&
            t.parentId == null
        )
        .sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2) || b.updatedAt - a.updatedAt),
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
                children={childrenByParentId[t.id] ?? []}
                minutesByTaskId={minutesByTaskId}
                today={today}
                onMoveToToday={(id) => moveTask(id, today, null)}
                editingTaskId={editingTaskId}
                editPanelNode={editPanelNode}
                onStartOrSwitch={startOrSwitchToTask}
                onBeginEdit={(id) => setEditingTaskId(id)}
                onToggleDone={(id) => toggleDone(id)}
                onDelete={(id) => {
                  if (!window.confirm("Удалить задачу?")) return;
                  deleteTask(id);
                  if (editingTaskId === id) setEditingTaskId(null);
                }}
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
                  activeTaskId={active?.taskId ?? null}
                  onStartOrSwitch={startOrSwitchToTask}
                  onToggleDone={(id) => toggleDone(id)}
                  onBeginEdit={(id) => setEditingTaskId(id)}
                    onDelete={(id) => deleteTask(id)}
                    onMove={(id, pd, ps = null) => moveTask(id, pd, ps)}
                    yesterday={yesterday}
                    tomorrow={tomorrow}
                    isEditing={editingTaskId === t.id}
                    editingTaskId={editingTaskId}
                    editPanel={editPanelNode}
                    subtasks={childrenByParentId[t.id] ?? []}
                    childrenByParentId={childrenByParentId}
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
                  activeTaskId={active?.taskId ?? null}
                  onStartOrSwitch={startOrSwitchToTask}
                  onToggleDone={(id) => toggleDone(id)}
                  onBeginEdit={(id) => setEditingTaskId(id)}
                    onDelete={(id) => deleteTask(id)}
                    onMove={(id, pd, ps = null) => moveTask(id, pd, ps)}
                    yesterday={yesterday}
                    tomorrow={tomorrow}
                    isEditing={editingTaskId === t.id}
                    editingTaskId={editingTaskId}
                    editPanel={editPanelNode}
                    subtasks={childrenByParentId[t.id] ?? []}
                    childrenByParentId={childrenByParentId}
                  />
                ))
              )}
          </div>
        </div>
      </div>

      
      {/* BACKLOG */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <div className="flex items-baseline justify-between">
          <div className="text-lg font-semibold text-slate-100">Беклог</div>
          <div className="text-xs text-slate-500">без даты и без дедлайна — просто список</div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3">
          <input
            className="h-10 min-w-[240px] flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
            placeholder="Новая задача в беклог…"
            value={newBacklogTitle}
            onChange={(e) => setNewBacklogTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addBacklogTask();
            }}
          />
          <input
            type="number"
            min={0}
            className="h-10 w-[110px] rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
            placeholder="оценка"
            value={newBacklogEstimate}
            onChange={(e) => setNewBacklogEstimate(e.target.value)}
          />

          <select
            className="h-10 w-[150px] rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-slate-600"
            value={newBacklogPriority}
            onChange={(e) => setNewBacklogPriority(e.target.value)}
            title="Приоритет"
          >
            <option value="1">Высокий</option>
            <option value="2">Средний</option>
            <option value="3">Низкий</option>
          </select>

          <button
            className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-4 text-sm hover:bg-slate-800"
            onClick={addBacklogTask}
          >
            Добавить
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {backlog.length === 0 ? (
            <div className="text-sm text-slate-500">Пока пусто</div>
          ) : (
            backlog.slice(0, 50).map((t) => (
              <BacklogRow
                key={t.id}
                t={t}
                onMoveToToday={(id) => moveTask(id, today, null)}
                isEditing={editingTaskId === t.id}
                onStartOrSwitch={startOrSwitchToTask}
                activeTaskId={active?.taskId ?? null}
                activeExists={!!active}
                onBeginEdit={(id) => setEditingTaskId((prev) => (prev === id ? null : id))}
                onToggleDone={(id) => toggleDone(id)}
                onDelete={(id) => {
                  if (!window.confirm("Удалить задачу?")) return;
                  deleteTask(id);
                  if (editingTaskId === id) setEditingTaskId(null);
                }}
                editingTaskId={editingTaskId}
                editPanel={editPanelNode}
                childrenByParentId={childrenByParentId}
                subtasks={childrenByParentId[t.id] ?? []}
              />
            ))
          )}
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

// re-export shared building blocks for planner views
export {
  TaskRow,
  TaskEditPanel,
  ChecklistEditor,
  SubtaskRow,
  parseDeadlineInput,
  parseEstimate,
};
