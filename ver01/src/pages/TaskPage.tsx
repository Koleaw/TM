import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteTask, updateTask, useAppState } from "../data/db";

export default function TaskPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const s = useAppState();

  const task = useMemo(() => s.tasks.find((t) => t.id === id), [s.tasks, id]);

  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [tags, setTags] = useState((task?.tags ?? []).join(" "));
  const [plannedDate, setPlannedDate] = useState(task?.plannedDate ?? "");
  const [plannedStart, setPlannedStart] = useState(task?.plannedStart ?? "");
  const [estimateMin, setEstimateMin] = useState(task?.estimateMin ?? 60);

  if (!task) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="text-sm text-slate-400">Task not found.</div>
        <Link to="/today" className="underline">
          Back
        </Link>
      </div>
    );
  }

  function save() {
    const tgs = tags
      .split(" ")
      .map((x) => x.trim())
      .filter(Boolean);
    updateTask(task.id, {
      title: title.trim() || "Без названия",
      notes,
      tags: tgs,
      plannedDate: plannedDate.trim() ? plannedDate.trim() : null,
      plannedStart: plannedStart.trim() ? plannedStart.trim() : null,
      estimateMin: Number.isFinite(estimateMin) ? estimateMin : null
    });
  }

  function del() {
    if (!confirm("Удалить задачу?")) return;
    deleteTask(task.id);
    nav("/today");
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-lg font-semibold">Task</div>
          <div className="text-xs text-slate-500">{task.id}</div>
        </div>
        <div className="flex gap-2">
          <Link
            to="/today"
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:bg-slate-800"
          >
            ← Back
          </Link>
          <button
            onClick={save}
            className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-950"
          >
            Save
          </button>
          <button
            onClick={del}
            className="rounded-lg border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-200 hover:bg-red-900"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 max-w-2xl">
        <label className="grid gap-1">
          <span className="text-sm text-slate-300">Title</span>
          <input
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-slate-300">Tags (space separated)</span>
          <input
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="#учеба #карьера"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-slate-300">Notes</span>
          <textarea
            className="min-h-[120px] rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1">
            <span className="text-sm text-slate-300">Planned date</span>
            <input
              type="date"
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={plannedDate || ""}
              onChange={(e) => setPlannedDate(e.target.value)}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-slate-300">Start time</span>
            <input
              type="time"
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={plannedStart || ""}
              onChange={(e) => setPlannedStart(e.target.value)}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-slate-300">Estimate (min)</span>
            <input
              type="number"
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={estimateMin}
              onChange={(e) => setEstimateMin(Number(e.target.value))}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
