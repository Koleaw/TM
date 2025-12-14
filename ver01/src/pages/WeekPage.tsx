import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { useNavigate } from "react-router-dom";
import { db, ensureDefaultSettings, logEvent, type Task } from "../data/db";

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function hhmm(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type DragState = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  overDate?: string; // YYYY-MM-DD or "inbox"
};

export default function WeekPage() {
  const nav = useNavigate();

  const [anchorISO, setAnchorISO] = useState(() => ymd(new Date()));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);

  const [quickTitle, setQuickTitle] = useState("");
  const [quickTarget, setQuickTarget] = useState<"inbox" | "today">("today");

  const containerRef = useRef<HTMLDivElement | null>(null);

  const weekStart = useMemo(() => {
    const d = new Date(anchorISO + "T00:00:00");
    return startOfWeek(d, { weekStartsOn: 1 }); // Monday
  }, [anchorISO]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const weekDates = useMemo(() => days.map((d) => ymd(d)), [days]);
  const weekStartISO = weekDates[0];
  const weekEndISO = weekDates[6];

  async function reload() {
    await ensureDefaultSettings();
    const all = await db.tasks.toArray();
    // показываем активные + done за эту неделю (чтобы видеть хвост)
    const filtered = all.filter((t: any) => {
      if (t.status === "active") return true;
      if (t.status === "done" && t.doneAt) {
        const d = ymd(new Date(t.doneAt));
        return d >= weekStartISO && d <= weekEndISO;
      }
      return false;
    });

    // сортировка: сначала активные, потом done; внутри по plannedDate, затем createdAt
    filtered.sort((a: any, b: any) => {
      const sa = a.status === "done" ? 1 : 0;
      const sb = b.status === "done" ? 1 : 0;
      if (sa !== sb) return sa - sb;

      const pa = (a.plannedDate ?? "9999-99-99") as string;
      const pb = (b.plannedDate ?? "9999-99-99") as string;
      if (pa !== pb) return pa.localeCompare(pb);

      return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    });

    setTasks(filtered);
  }

  useEffect(() => {
    void reload();
    const handler = () => void reload();
    db.on("changes", handler);
    return () => {
      db.on("changes").unsubscribe(handler);
    };
  }, [weekStartISO, weekEndISO]);

  const inbox = useMemo(() => {
    return tasks.filter((t: any) => t.status === "active" && !t.plannedDate);
  }, [tasks]);

  const byDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const d of weekDates) map[d] = [];
    for (const t of tasks) {
      const pd = (t as any).plannedDate as string | undefined;
      if ((t as any).status !== "active") continue;
      if (!pd) continue;
      if (pd >= weekStartISO && pd <= weekEndISO) map[pd].push(t);
    }
    return map;
  }, [tasks, weekDates, weekStartISO, weekEndISO]);

  const doneThisWeek = useMemo(() => {
    return tasks.filter((t: any) => {
      if (t.status !== "done" || !t.doneAt) return false;
      const d = ymd(new Date(t.doneAt));
      return d >= weekStartISO && d <= weekEndISO;
    });
  }, [tasks, weekStartISO, weekEndISO]);

  async function moveTask(taskId: string, to: string | undefined) {
    const t = await db.tasks.get(taskId);
    if (!t) return;

    const from = (t as any).plannedDate ?? null;
    const next = to || undefined;

    await db.tasks.update(taskId, { plannedDate: next, updatedAt: Date.now() } as any);
    await logEvent({ type: "task_planned_date_set", taskId, payload: { from, to: next ?? null } });
  }

  async function markDone(taskId: string) {
    const now = Date.now();
    await db.tasks.update(taskId, { status: "done", doneAt: now, updatedAt: now } as any);
    await logEvent({ type: "task_done", taskId });
  }

  // ---------- Desktop HTML5 drag ----------
  function onDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  }

  async function onDropTo(e: React.DragEvent, target: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;

    if (target === "inbox") await moveTask(id, undefined);
    else if (target === "done") await markDone(id);
    else await moveTask(id, target);
  }

  // ---------- Mobile pointer drag (works on touch) ----------
  function pointerStart(e: React.PointerEvent, id: string) {
    // left click / touch only
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    setDrag({
      id,
      pointerId: e.pointerId,
      startX: startX - rect.left,
      startY: startY - rect.top,
      x: e.clientX,
      y: e.clientY
    });
  }

  function pointerMove(e: React.PointerEvent) {
    if (!drag) return;
    if (e.pointerId !== drag.pointerId) return;

    const x = e.clientX;
    const y = e.clientY;

    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const drop = el?.closest?.("[data-drop]") as HTMLElement | null;
    const over = drop?.getAttribute("data-drop") ?? undefined;

    setDrag((d) => (d ? { ...d, x, y, overDate: over } : d));
  }

  async function pointerEnd(e: React.PointerEvent) {
    if (!drag) return;
    if (e.pointerId !== drag.pointerId) return;

    const target = drag.overDate;
    const id = drag.id;

    setDrag(null);

    if (!target) return;

    if (target === "inbox") await moveTask(id, undefined);
    else if (target === "done") await markDone(id);
    else await moveTask(id, target);
  }

  // ---------- Quick add ----------
  async function addQuick() {
    const title = quickTitle.trim();
    if (!title) return;

    const id = (globalThis.crypto?.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(16).slice(2)}`) as string;
    const plannedDate = quickTarget === "today" ? ymd(new Date()) : undefined;

    await db.tasks.put({
      id,
      title,
      status: "active",
      plannedDate,
      createdAt: Date.now(),
      updatedAt: Date.now()
    } as any);

    await logEvent({ type: "task_created", taskId: id, payload: { plannedDate: plannedDate ?? null } });
    setQuickTitle("");
  }

  return (
    <div className="space-y-4" ref={containerRef}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Week</h1>
          <div className="text-slate-300 text-sm">
            План на неделю. Перетаскивай задачи между днями. Клик по задаче — провалиться внутрь.
          </div>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={() => setAnchorISO(ymd(addDays(new Date(anchorISO + "T00:00:00"), -7)))}
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm"
          >
            ←
          </button>
          <input
            type="date"
            value={anchorISO}
            onChange={(e) => setAnchorISO(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={() => setAnchorISO(ymd(addDays(new Date(anchorISO + "T00:00:00"), 7)))}
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm"
          >
            →
          </button>
        </div>
      </div>

      {/* Quick add */}
      <section className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-3">
        <div className="font-semibold">Быстро добавить</div>
        <div className="flex flex-col md:flex-row gap-2">
          <input
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            placeholder="Новая задача…"
            onKeyDown={(e) => {
              if (e.key === "Enter") void addQuick();
            }}
          />
          <select
            value={quickTarget}
            onChange={(e) => setQuickTarget(e.target.value as any)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
          >
            <option value="today">На сегодня</option>
            <option value="inbox">В inbox</option>
          </select>
          <button
            onClick={() => void addQuick()}
            className="px-4 py-2 rounded-lg bg-slate-50 text-slate-950 text-sm font-semibold hover:bg-white"
          >
            Add
          </button>
        </div>
      </section>

      {/* Board */}
      <section className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* Inbox */}
        <div
          data-drop="inbox"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => void onDropTo(e, "inbox")}
          className={cx(
            "rounded-xl border bg-slate-950 p-3 space-y-2",
            drag?.overDate === "inbox" ? "border-slate-50" : "border-slate-800"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="font-semibold">Inbox</div>
            <div className="text-xs text-slate-400">{inbox.length}</div>
          </div>

          {inbox.length === 0 ? (
            <div className="text-sm text-slate-400">Пусто.</div>
          ) : (
            <div className="space-y-2">
              {inbox.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  onOpen={() => nav(`/task/${t.id}`)}
                  onDragStart={onDragStart}
                  onPointerStart={pointerStart}
                  onPointerMove={pointerMove}
                  onPointerEnd={pointerEnd}
                />
              ))}
            </div>
          )}
        </div>

        {/* Days */}
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {days.map((d) => {
            const date = ymd(d);
            const list = byDate[date] ?? [];
            const isToday = date === ymd(new Date());
            return (
              <div
                key={date}
                data-drop={date}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => void onDropTo(e, date)}
                className={cx(
                  "rounded-xl border bg-slate-950 p-3 space-y-2",
                  drag?.overDate === date ? "border-slate-50" : "border-slate-800"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className={cx("font-semibold truncate", isToday && "text-emerald-200")}>
                      {format(d, "EEE dd.MM")}
                    </div>
                    <div className="text-xs text-slate-500">{date}</div>
                  </div>
                  <div className="text-xs text-slate-400">{list.length}</div>
                </div>

                {list.length === 0 ? (
                  <div className="text-sm text-slate-400">Перетащи сюда задачу.</div>
                ) : (
                  <div className="space-y-2">
                    {list.map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        onOpen={() => nav(`/task/${t.id}`)}
                        onDragStart={onDragStart}
                        onPointerStart={pointerStart}
                        onPointerMove={pointerMove}
                        onPointerEnd={pointerEnd}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Done lane */}
          <div
            data-drop="done"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => void onDropTo(e, "done")}
            className={cx(
              "rounded-xl border bg-slate-950 p-3 space-y-2 md:col-span-2 xl:col-span-3",
              drag?.overDate === "done" ? "border-emerald-200" : "border-slate-800"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold">Done (this week)</div>
              <div className="text-xs text-slate-400">{doneThisWeek.length}</div>
            </div>

            {doneThisWeek.length === 0 ? (
              <div className="text-sm text-slate-400">Пока ничего.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {doneThisWeek.slice().reverse().map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 cursor-pointer"
                    onClick={() => nav(`/task/${t.id}`)}
                  >
                    <div className="text-sm font-semibold">{t.title}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      done: {t.doneAt ? format(new Date(t.doneAt as any), "dd.MM HH:mm") : "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="text-xs text-slate-500">
              Можно перетаскивать активные задачи сюда — они будут отмечены как Done.
            </div>
          </div>
        </div>
      </section>

      {/* Drag ghost (mobile) */}
      {drag && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: drag.x - drag.startX,
            top: drag.y - drag.startY,
            width: 280,
            transform: "scale(1.02)"
          }}
        >
          <div className="rounded-xl border border-slate-50 bg-slate-900 p-3 shadow-xl">
            <div className="text-sm font-semibold">
              {tasks.find((t) => t.id === drag.id)?.title ?? "…"}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              drop: {drag.overDate ?? "—"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  onOpen,
  onDragStart,
  onPointerStart,
  onPointerMove,
  onPointerEnd
}: {
  task: Task;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onPointerStart: (e: React.PointerEvent, id: string) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerEnd: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      className="rounded-xl border border-slate-800 bg-slate-900/30 p-3"
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 cursor-pointer" onClick={onOpen}>
          <div className="text-sm font-semibold leading-snug break-words">{task.title}</div>
          <div className="text-xs text-slate-400 mt-1">
            id: {task.id}
            {(task as any).estimateMin ? ` · est ${(task as any).estimateMin}m` : ""}
          </div>
        </div>

        {/* Drag handle for mobile (pointer-based drag) */}
        <button
          className="shrink-0 px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-xs"
          title="Drag"
          onPointerDown={(e) => onPointerStart(e, task.id)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          ⠿
        </button>
      </div>
    </div>
  );
}
