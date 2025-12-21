import { useEffect, useMemo, useState } from "react";
import {
  ChecklistItem,
  Task,
  createProject as createProjectFn,
  createTask,
  deleteProject,
  deleteTask,
  moveTask,
  startTimer,
  todayYMD,
  toggleDone,
  updateProject,
  updateTask,
  useAppState,
} from "../data/db";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toInputValue(deadlineAt: number | null) {
  if (!deadlineAt) return "";
  const dt = new Date(deadlineAt);
  const y = dt.getFullYear();
  const m = pad2(dt.getMonth() + 1);
  const d = pad2(dt.getDate());
  const hh = pad2(dt.getHours());
  const mm = pad2(dt.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function parseDeadline(input: string): number | null {
  if (!input) return null;
  const dt = new Date(input);
  const ts = dt.getTime();
  return Number.isFinite(ts) ? ts : null;
}

function formatDeadline(deadlineAt: number | null) {
  if (!deadlineAt) return "Без дедлайна";
  const dt = new Date(deadlineAt);
  return `Дедлайн ${pad2(dt.getDate())}.${pad2(dt.getMonth() + 1)}.${dt.getFullYear()} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

function priorityLabel(priority: 1 | 2 | 3) {
  if (priority === 1) return "Высокий";
  if (priority === 3) return "Низкий";
  return "Средний";
}

function ChecklistEditor({
  items,
  onChange,
}: {
  items: ChecklistItem[];
  onChange: (next: ChecklistItem[]) => void;
}) {
  const [text, setText] = useState("");

  function addItem() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const id = (globalThis.crypto?.randomUUID?.() ?? `chk_${Date.now()}`) as string;
    onChange([...items, { id, text: trimmed, done: false }]);
    setText("");
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          placeholder="Новый пункт чеклиста"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addItem();
          }}
        />
        <button
          className="rounded-md bg-slate-800 px-3 py-2 text-sm text-slate-100 hover:bg-slate-700"
          onClick={addItem}
        >
          Добавить
        </button>
      </div>
      <div className="space-y-1">
        {items.length === 0 ? (
          <div className="text-sm text-slate-400">Пока нет пунктов</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-md bg-slate-900 px-2 py-1">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() =>
                  onChange(
                    items.map((it) =>
                      it.id === item.id ? { ...it, done: !it.done } : it
                    )
                  )
                }
              />
              <input
                className="flex-1 bg-transparent text-sm text-slate-100 outline-none"
                value={item.text}
                onChange={(e) =>
                  onChange(
                    items.map((it) => (it.id === item.id ? { ...it, text: e.target.value } : it))
                  )
                }
              />
              <button
                className="text-xs text-slate-400 hover:text-red-300"
                onClick={() => onChange(items.filter((it) => it.id !== item.id))}
              >
                Удалить
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TaskNode({
  task,
  childrenMap,
  projectId,
}: {
  task: Task;
  childrenMap: Record<string, Task[]>;
  projectId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [subTitle, setSubTitle] = useState("");
  const children = childrenMap[task.id] ?? [];

  function addSubtask() {
    const trimmed = subTitle.trim();
    if (!trimmed) return;
    createTask(trimmed, { parentId: task.id, projectId });
    setSubTitle("");
    setExpanded(true);
  }

  const checklist = task.checklist ?? [];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          className="text-slate-400"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Свернуть" : "Раскрыть"}
        >
          {expanded ? "▾" : "▸"}
        </button>
        <input
          type="checkbox"
          checked={task.status === "done"}
          onChange={() => toggleDone(task.id)}
          className="accent-emerald-500"
        />
        <input
          className="flex-1 rounded-md bg-slate-800 px-2 py-1 text-sm text-slate-100 outline-none"
          value={task.title}
          autoFocus={task.title.trim() === ""}
          placeholder="Название задачи…"
          onChange={(e) => updateTask(task.id, { title: e.target.value })}
        />
        <span
          className={
            "rounded-md px-2 py-1 text-xs " +
            (task.priority === 1
              ? "bg-red-900 text-red-200"
              : task.priority === 3
              ? "bg-slate-800 text-slate-200"
              : "bg-amber-900 text-amber-100")
          }
        >
          {priorityLabel(task.priority)}
        </span>
        {task.deadlineAt && (
          <span className="text-xs text-slate-300">{formatDeadline(task.deadlineAt)}</span>
        )}
        {task.estimateMin !== null && (
          <span className="text-xs text-slate-300">Оценка: {task.estimateMin}м</span>
        )}
        <div className="flex items-center gap-2">
          <button
            className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-100 hover:bg-slate-700"
            onClick={() => moveTask(task.id, todayYMD())}
          >
            В сегодня
          </button>
          <button
            className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-100 hover:bg-slate-700"
            onClick={() => startTimer(task.id)}
          >
            Таймер
          </button>
          <button
            className="rounded-md bg-red-900 px-2 py-1 text-xs text-red-100 hover:bg-red-800"
            onClick={() => deleteTask(task.id)}
          >
            Удалить
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-slate-800 bg-slate-950 px-4 py-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Приоритет</label>
              <select
                className="w-full rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                value={task.priority}
                onChange={(e) =>
                  updateTask(task.id, { priority: Number(e.target.value) as 1 | 2 | 3 })
                }
              >
                <option value={1}>Высокий</option>
                <option value={2}>Средний</option>
                <option value={3}>Низкий</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Дедлайн</label>
              <input
                type="datetime-local"
                className="w-full rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                value={toInputValue(task.deadlineAt)}
                onChange={(e) => updateTask(task.id, { deadlineAt: parseDeadline(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Оценка (мин)</label>
              <input
                type="number"
                min={0}
                className="w-full rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                value={task.estimateMin ?? ""}
                onChange={(e) =>
                  updateTask(task.id, {
                    estimateMin: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400">Описание</label>
            <textarea
              className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              rows={3}
              value={task.notes}
              onChange={(e) => updateTask(task.id, { notes: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-100">Чеклист</div>
            <ChecklistEditor
              items={checklist}
              onChange={(next) => updateTask(task.id, { checklist: next })}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-100">Подзадачи</div>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                placeholder="Новая подзадача"
                value={subTitle}
                onChange={(e) => setSubTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addSubtask();
                }}
              />
              <button
                className="rounded-md bg-emerald-800 px-3 py-2 text-sm text-emerald-50 hover:bg-emerald-700"
                onClick={addSubtask}
              >
                Добавить
              </button>
            </div>

            {children.length > 0 && (
              <div className="space-y-2 border-l border-slate-800 pl-4">
                {children.map((child) => (
                  <TaskNode
                    key={child.id}
                    task={child}
                    childrenMap={childrenMap}
                    projectId={projectId}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectsPage() {
  const { tasks } = useAppState();
  const projects = useMemo(
    () => tasks.filter((t) => t.isProject),
    [tasks]
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projects[0]?.id ?? null
  );

  useEffect(() => {
    if (selectedProjectId && projects.some((p) => p.id === selectedProjectId)) return;
    setSelectedProjectId(projects[0]?.id ?? null);
  }, [projects, selectedProjectId]);

  function createProject() {
    const id = createProjectFn("Новый проект");
    setSelectedProjectId(id);
  }

  const currentProject = tasks.find((t) => t.id === selectedProjectId && t.isProject) ?? null;
  const projectTasks = useMemo(
    () => tasks.filter((t) => !t.isProject && t.projectId === selectedProjectId),
    [tasks, selectedProjectId]
  );
  const childrenMap = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of projectTasks) {
      const key = t.parentId ?? "";
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [projectTasks]);
  const rootTasks = childrenMap[""] ?? [];

  const doneCount = projectTasks.filter((t) => t.status === "done").length;
  const totalCount = projectTasks.length;

  return (
    <div className="grid gap-4 md:grid-cols-[280px,1fr]">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-100">Проекты</div>
          <button
            className="rounded-md bg-emerald-800 px-2 py-1 text-xs text-emerald-50 hover:bg-emerald-700"
            onClick={createProject}
          >
            Новый проект
          </button>
        </div>
        <div className="space-y-2">
          {projects.length === 0 ? (
            <div className="text-sm text-slate-400">Добавьте свой первый проект</div>
          ) : (
            projects.map((p) => (
              <button
                key={p.id}
                className={
                  "w-full rounded-md border px-3 py-2 text-left text-sm " +
                  (p.id === selectedProjectId
                    ? "border-emerald-500 bg-emerald-950 text-emerald-50"
                    : "border-slate-800 bg-slate-950 text-slate-100 hover:border-slate-700")
                }
                onClick={() => setSelectedProjectId(p.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{p.title}</div>
                  {p.deadlineAt && (
                    <span className="text-xs text-slate-300">
                      {new Date(p.deadlineAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400">
                  {p.notes ? p.notes.slice(0, 80) : "Без описания"}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="space-y-4">
        {!currentProject ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
            Выберите проект слева или создайте новый.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <input
                  className="flex-1 rounded-md bg-slate-800 px-3 py-2 text-lg font-semibold text-slate-100"
                  value={currentProject.title}
                  onChange={(e) => updateProject(currentProject.id, { title: e.target.value })}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-sm text-slate-300">
                    Прогресс: {doneCount}/{totalCount}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400">Дедлайн</label>
                    <input
                      type="datetime-local"
                      className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                      value={toInputValue(currentProject.deadlineAt)}
                      onChange={(e) =>
                        updateProject(currentProject.id, { deadlineAt: parseDeadline(e.target.value) })
                      }
                    />
                  </div>
                  <button
                    className="rounded-md bg-red-900 px-3 py-2 text-sm text-red-100 hover:bg-red-800"
                    onClick={() => {
                      if (!confirm("Удалить проект и все его задачи?")) return;
                      deleteProject(currentProject.id);
                    }}
                  >
                    Удалить проект
                  </button>
                </div>
              </div>
              <div className="mt-3">
                <label className="text-xs text-slate-400">Описание</label>
                <textarea
                  className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  rows={3}
                  value={currentProject.notes}
                  onChange={(e) => updateProject(currentProject.id, { notes: e.target.value })}
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-100">Задачи проекта</div>
                <button
                  className="rounded-md bg-emerald-800 px-3 py-2 text-sm text-emerald-50 hover:bg-emerald-700"
                  onClick={() => createTask("", { projectId: currentProject.id })}
                >
                  Добавить задачу
                </button>
              </div>

              {rootTasks.length === 0 ? (
                <div className="text-sm text-slate-400">Добавьте первую задачу проекта</div>
              ) : (
                <div className="space-y-3">
                  {rootTasks.map((task) => (
                    <TaskNode
                      key={task.id}
                      task={task}
                      childrenMap={childrenMap}
                      projectId={currentProject.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
