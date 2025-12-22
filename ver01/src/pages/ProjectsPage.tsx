import { useEffect, useMemo, useState } from "react";
import {
  createProject as createProjectFn,
  createTask,
  deleteProject,
  deleteTask,
  moveTask,
  startTimer,
  stopTimer,
  todayYMD,
  updateProject,
  updateTask,
  useAppState,
  ymdAddDays,
  type ID,
  type Task,
} from "../data/db";
import { TaskEditPanel, TaskRow, parseDeadlineInput, parseEstimate } from "./TodayPage";

export default function ProjectsPage() {
  const s = useAppState();
  const { tasks, activeTimer: active } = s;

  const projects = useMemo(() => tasks.filter((t) => t.isProject), [tasks]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projects[0]?.id ?? null);

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

  const childrenByParentId = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of projectTasks) {
      const key = t.parentId ?? "";
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [projectTasks]);

  const rootTasks = childrenByParentId[""] ?? [];
  const today = todayYMD();

  const [editingTaskId, setEditingTaskId] = useState<ID | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPlannedDate, setEditPlannedDate] = useState("");
  const [editPlannedStart, setEditPlannedStart] = useState("");
  const [editEstimate, setEditEstimate] = useState<string>("");
  const [editPriority, setEditPriority] = useState<"1" | "2" | "3">("2");
  const [editDeadline, setEditDeadline] = useState<string>("");

  useEffect(() => {
    if (!editingTaskId) return;
    const t = tasks.find((x) => x.id === editingTaskId);
    if (!t) return;

    setEditTitle(t.title);
    setEditNotes(t.notes ?? "");
    setEditPlannedDate(t.plannedDate ?? "");
    setEditPlannedStart(t.plannedStart ?? "");
    setEditEstimate(t.estimateMin != null ? String(t.estimateMin) : "");
    setEditPriority(String(t.priority ?? 2) as "1" | "2" | "3");
    setEditDeadline(t.deadlineAt ? new Date(t.deadlineAt).toISOString().slice(0, 16) : "");
  }, [editingTaskId, tasks]);

  function saveTaskEdit() {
    if (!editingTaskId) return;

    updateTask(editingTaskId, {
      title: editTitle.trim() || "Без названия",
      notes: editNotes,
      plannedDate: editPlannedDate.trim() ? editPlannedDate : null,
      plannedStart: editPlannedStart.trim() ? editPlannedStart : null,
      estimateMin: parseEstimate(editEstimate),
      priority: Number(editPriority) as 1 | 2 | 3,
      deadlineAt: parseDeadlineInput(editDeadline),
    });

    setEditingTaskId(null);
  }

  const editPanelNode = editingTaskId ? (
    <TaskEditPanel
      task={tasks.find((t) => t.id === editingTaskId)!}
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

  function startOrSwitchToTask(taskId: ID) {
    if (active?.taskId === taskId) {
      stopTimer();
      return;
    }
    startTimer(taskId, active?.timeTypeId ?? null, active?.kind ?? "useful", active?.sinkId ?? null);
  }

  function renderTaskList(list: Task[]) {
    return (
      <div className="space-y-2">
        {list.length === 0 ? (
          <div className="text-sm text-slate-400">Добавьте первую задачу проекта</div>
        ) : (
          list.map((t) => (
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
                className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                  p.id === selectedProjectId
                    ? "border-emerald-500 bg-emerald-950 text-emerald-50"
                    : "border-slate-800 bg-slate-950 text-slate-100 hover:border-slate-700"
                }`}
                onClick={() => setSelectedProjectId(p.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{p.title}</div>
                  {p.deadlineAt && (
                    <span className="text-xs text-slate-300">{new Date(p.deadlineAt).toLocaleDateString()}</span>
                  )}
                </div>
                <div className="text-xs text-slate-400">{p.notes ? p.notes.slice(0, 80) : "Без описания"}</div>
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
                  <div className="text-sm text-slate-300">Прогресс: {doneCount}/{totalCount}</div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400">Дедлайн</label>
                    <input
                      type="datetime-local"
                      className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                      value={currentProject.deadlineAt ? new Date(currentProject.deadlineAt).toISOString().slice(0, 16) : ""}
                      onChange={(e) => updateProject(currentProject.id, { deadlineAt: parseDeadlineInput(e.target.value) })}
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

              {renderTaskList(rootTasks)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
