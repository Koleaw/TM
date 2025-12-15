import { Link } from "react-router-dom";
import {
  createTask,
  moveTask,
  startTimer,
  stopTimer,
  toggleDone,
  todayYMD,
  updateTask,
  useAppState
} from "../data/db";

function TaskRow({
  id,
  title,
  status,
  plannedStart
}: {
  id: string;
  title: string;
  status: "todo" | "done";
  plannedStart: string | null;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", id)}
      className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2"
    >
      <button
        className={
          "h-5 w-5 rounded border " +
          (status === "done" ? "bg-emerald-400 border-emerald-400" : "border-slate-600")
        }
        onClick={() => toggleDone(id)}
        title="Done/Undone"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {plannedStart ? (
            <div className="text-xs rounded bg-slate-800 px-2 py-1">{plannedStart}</div>
          ) : null}
          <Link to={`/task/${id}`} className="truncate hover:underline">
            {title}
          </Link>
        </div>
      </div>
      <button
        className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-800"
        onClick={() => startTimer(id)}
        title="Start timer"
      >
        ▶
      </button>
      <button
        className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-800"
        onClick={() => moveTask(id, null, null)}
        title="Unplan"
      >
        ⟲
      </button>
    </div>
  );
}

export default function TodayPage() {
  const s = useAppState();
  const day = todayYMD();

  const tasks = s.tasks.filter((t) => t.plannedDate === day);
  const hard = tasks
    .filter((t) => !!t.plannedStart)
    .sort((a, b) => String(a.plannedStart).localeCompare(String(b.plannedStart)));
  const flex = tasks.filter((t) => !t.plannedStart);

  const active = s.activeTimer;

  function addHard(time: string) {
    const id = createTask("Новая жесткая задача", { plannedDate: day, plannedStart: time });
    updateTask(id, { title: "Новая жесткая задача" });
  }

  function addFlex() {
    createTask("Новая гибкая задача", { plannedDate: day, plannedStart: null });
  }

  return (
    <div className="grid gap-3">
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-lg font-semibold">Today</div>
            <div className="text-sm text-slate-400">{day}</div>
          </div>

          <div className="flex items-center gap-2">
            {active ? (
              <button
                className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950"
                onClick={() => stopTimer("")}
              >
                Stop timer
              </button>
            ) : (
              <div className="text-sm text-slate-400">Timer: idle</div>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm hover:bg-slate-800"
            onClick={() => addHard("09:00")}
          >
            + Hard 09:00
          </button>
          <button
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm hover:bg-slate-800"
            onClick={() => addHard("10:00")}
          >
            + Hard 10:00
          </button>
          <button
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm hover:bg-slate-800"
            onClick={addFlex}
          >
            + Flexible
          </button>
          <Link
            to="/week"
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:bg-slate-800"
          >
            Open Week →
          </Link>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="font-semibold">Hard tasks</div>
          <div className="mt-2 grid gap-2">
            {hard.length === 0 ? (
              <div className="text-sm text-slate-400">Нет задач со временем</div>
            ) : (
              hard.map((t) => (
                <TaskRow
                  key={t.id}
                  id={t.id}
                  title={t.title}
                  status={t.status}
                  plannedStart={t.plannedStart}
                />
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="font-semibold">Flexible tasks</div>
          <div className="mt-2 grid gap-2">
            {flex.length === 0 ? (
              <div className="text-sm text-slate-400">Нет гибких задач</div>
            ) : (
              flex.map((t) => (
                <TaskRow
                  key={t.id}
                  id={t.id}
                  title={t.title}
                  status={t.status}
                  plannedStart={t.plannedStart}
                />
              ))
            )}
          </div>
          <div className="mt-3 text-xs text-slate-500">
            Drag&Drop: можешь перетащить задачу на день в Week.
          </div>
        </div>
      </div>
    </div>
  );
}
