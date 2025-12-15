import { Link } from "react-router-dom";
import {
  createTask,
  getWeekStart,
  moveTask,
  todayYMD,
  useAppState,
  weekDays,
  ymdAddDays
} from "../data/db";

function dayLabel(ymd: string) {
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}`;
}

export default function WeekPage() {
  const s = useAppState();
  const today = todayYMD();
  const [weekStart, setWeekStart] = (function init() {
    const ws = getWeekStart(today, s.settings.weekStartsOn);
    return [ws, (v: string) => v] as const;
  })();

  // из-за простоты состояния в этом варианте — пересчитываем от today
  const ws = getWeekStart(today, s.settings.weekStartsOn);
  const days = weekDays(ws);

  function onDrop(day: string, e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    moveTask(id, day, null);
  }

  function addToDay(day: string) {
    createTask("Новая задача", { plannedDate: day, plannedStart: null });
  }

  return (
    <div className="grid gap-3">
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-lg font-semibold">Week</div>
          <div className="text-sm text-slate-400">Неделя от {ws}</div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/today"
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:bg-slate-800"
          >
            ← Today
          </Link>
          <button
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm hover:bg-slate-800"
            onClick={() => {
              // визуально “предыдущая/следующая” пока упрощены (в этом каркасе неделя от today),
              // но drag&drop и планирование работают; расширим дальше.
              alert("Переход по неделям добавим следующим шагом.");
            }}
          >
            ◀ / ▶
          </button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-7">
        {days.map((day) => {
          const tasks = s.tasks
            .filter((t) => t.plannedDate === day)
            .sort((a, b) => String(a.plannedStart ?? "99:99").localeCompare(String(b.plannedStart ?? "99:99")));

          return (
            <div
              key={day}
              className="rounded-xl border border-slate-800 bg-slate-950 p-2 min-h-[240px]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(day, e)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">
                  {dayLabel(day)}{" "}
                  {day === today ? <span className="text-emerald-400">• today</span> : null}
                </div>
                <button
                  className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs hover:bg-slate-800"
                  onClick={() => addToDay(day)}
                >
                  +
                </button>
              </div>

              <div className="mt-2 grid gap-2">
                {tasks.length === 0 ? (
                  <div className="text-xs text-slate-500">drop tasks here</div>
                ) : (
                  tasks.map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                      className="rounded-lg border border-slate-800 bg-slate-900 p-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs text-slate-400">
                            {t.plannedStart ? `🕒 ${t.plannedStart}` : "flex"}
                          </div>
                          <Link to={`/task/${t.id}`} className="text-sm truncate hover:underline">
                            {t.title}
                          </Link>
                        </div>
                        <button
                          className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-800"
                          onClick={() => moveTask(t.id, ymdAddDays(day, 1), null)}
                          title="Move to next day"
                        >
                          →
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-xs text-slate-500">
        Drag&Drop: перетаскивай задачи между днями. Время внутри дня добавим следующим шагом.
      </div>
    </div>
  );
}
