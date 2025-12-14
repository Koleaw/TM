import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  db,
  ensureDefaultSettings,
  logEvent,
  type Task,
  type Tag,
  type TimeLog,
  type ScheduleBlock
} from "../data/db";

type ABC = "A" | "B" | "C" | "—";

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function uuid() {
  return (globalThis.crypto?.randomUUID?.() ??
    `id_${Date.now()}_${Math.random().toString(16).slice(2)}`) as string;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function TaskPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<Task | null>(null);

  const [tags, setTags] = useState<Tag[]>([]);
  const [tagById, setTagById] = useState<Record<string, Tag>>({});

  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);

  const [newTagName, setNewTagName] = useState("");

  const taskId = id ?? "";

  async function reload() {
    if (!taskId) return;
    setLoading(true);
    await ensureDefaultSettings();

    const [t, allTags, logs, bl] = await Promise.all([
      db.tasks.get(taskId),
      db.tags.toArray(),
      db.timeLogs.where("taskId").equals(taskId).toArray(),
      db.scheduleBlocks.where("taskId").equals(taskId).toArray()
    ]);

    setTask((t as any) ?? null);

    setTags(allTags);
    const map: Record<string, Tag> = {};
    for (const tg of allTags) map[tg.id] = tg;
    setTagById(map);

    // сортировка логов и блоков
    logs.sort((a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    bl.sort((a: any, b: any) => (a.date === b.date ? (a.startMin ?? 0) - (b.startMin ?? 0) : a.date.localeCompare(b.date)));

    setTimeLogs(logs);
    setBlocks(bl);

    setLoading(false);
  }

  useEffect(() => {
    void reload();

    const handler = () => void reload();
    // если Dexie Observable подключён — будет жить; если нет, просто убери эти 3 строки
    db.on("changes", handler);
    return () => {
      db.on("changes").unsubscribe(handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const tagIds: string[] = useMemo(() => {
    return ((task as any)?.tagIds as string[]) ?? [];
  }, [task]);

  const totalMin = useMemo(() => {
    return timeLogs.reduce((a: number, l: any) => a + (l.durationMin || 0), 0);
  }, [timeLogs]);

  const last7DaysMin = useMemo(() => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    const startISO = ymd(start);
    const endISO = ymd(today);

    return timeLogs.reduce((a: number, l: any) => {
      if (!l?.date) return a;
      if (l.date >= startISO && l.date <= endISO) return a + (l.durationMin || 0);
      return a;
    }, 0);
  }, [timeLogs]);

  const abcValue: ABC = useMemo(() => {
    return (((task as any)?.abc as ABC) ?? "—") as ABC;
  }, [task]);

  async function patch(partial: Partial<Task>, eventType?: string, payload?: any) {
    if (!taskId) return;
    const now = Date.now();
    await db.tasks.update(taskId, { ...partial, updatedAt: now } as any);
    if (eventType) {
      await logEvent({ type: eventType, taskId, payload });
    }
  }

  async function setPlannedDate(next?: string) {
    const prev = (task as any)?.plannedDate ?? null;
    await patch({ plannedDate: next } as any, "task_planned_date_set", { from: prev, to: next ?? null });
  }

  async function toggleDone(done: boolean) {
    if (!task) return;
    const now = Date.now();
    if (done) {
      await db.tasks.update(taskId, { заметка_чтобы_TS_не_ругался: undefined } as any);
      await db.tasks.update(taskId, { status: "done", doneAt: now, updatedAt: now } as any);
      await logEvent({ type: "task_done", taskId });
    } else {
      await db.tasks.update(taskId, { status: "active", doneAt: undefined, updatedAt: now } as any);
      await logEvent({ type: "task_reopened", taskId });
    }
  }

  async function setTagOnTask(tid: string, on: boolean) {
    const cur = new Set(tagIds);
    if (on) cur.add(tid);
    else cur.delete(tid);

    await patch({ tagIds: Array.from(cur) } as any, "task_tags_updated", { tagIds: Array.from(cur) });
  }

  async function createTagAndAttach() {
    const name = newTagName.trim();
    if (!name) return;

    // если тег уже есть (по имени) — просто прикрепляем
    const existing = tags.find((t) => t.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      await setTagOnTask(existing.id, true);
      setNewTagName("");
      return;
    }

    const id = uuid();
    const row: Tag = { id, name } as any;
    await db.tags.put(row);
    await logEvent({ type: "tag_created", payload: { id, name } });

    setNewTagName("");
    await setTagOnTask(id, true);
  }

  async function deleteTask() {
    if (!task) return;
    const ok = confirm(
      "Удалить задачу?\n\nРекомендация: обычно лучше не удалять историю. Но если нужно — удалим задачу, снимем блоки расписания и отвяжем таймлоги (чтобы аналитика не ломалась)."
    );
    if (!ok) return;

    // удалить блоки в расписании
    const bs = await db.scheduleBlocks.where("taskId").equals(taskId).toArray();
    if (bs.length) await db.scheduleBlocks.bulkDelete(bs.map((b: any) => b.id));

    // отвязать логи (оставляем факт времени)
    await db.timeLogs.where("taskId").equals(taskId).modify((l: any) => {
      l.taskId = undefined;
    });

    await db.tasks.delete(taskId);
    await logEvent({ type: "task_deleted", payload: { id: taskId } });

    nav(-1);
  }

  if (loading) {
    return (
      <div className="p-3 rounded-xl border border-slate-800 bg-slate-950">
        <div className="text-slate-300">Загрузка…</div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="space-y-3">
        <div className="p-3 rounded-xl border border-slate-800 bg-slate-950">
          <div className="text-slate-200 font-semibold">Задача не найдена</div>
          <div className="text-sm text-slate-400 mt-1">Возможно, она была удалена или id неверный.</div>
        </div>
        <button
          onClick={() => nav(-1)}
          className="px-4 py-2 rounded-lg bg-slate-50 text-slate-950 text-sm font-semibold"
        >
          Назад
        </button>
      </div>
    );
  }

  const plannedDate = ((task as any).plannedDate as string | undefined) ?? "";
  const dueDate = ((task as any).dueDate as string | undefined) ?? "";
  const estimateMin = ((task as any).estimateMin as number | undefined) ?? 0;
  const description = ((task as any).description as string | undefined) ?? "";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <button
            onClick={() => nav(-1)}
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm"
          >
            ←
          </button>

          <div>
            <div className="text-xs text-slate-400">Task</div>
            <h1 className="text-xl font-semibold leading-tight">{task.title}</h1>
            <div className="text-xs text-slate-400 mt-1">
              ID: <span className="text-slate-300">{task.id}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {(task as any).status !== "done" ? (
            <button
              onClick={() => void toggleDone(true)}
              className="px-4 py-2 rounded-lg bg-emerald-200 text-emerald-950 text-sm font-semibold"
            >
              Done
            </button>
          ) : (
            <button
              onClick={() => void toggleDone(false)}
              className="px-4 py-2 rounded-lg bg-slate-50 text-slate-950 text-sm font-semibold"
            >
              Reopen
            </button>
          )}
          <button
            onClick={() => void deleteTask()}
            className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm text-slate-100"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <section className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="text-xs text-slate-400">Время всего</div>
          <div className="text-lg font-semibold">{totalMin} мин</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="text-xs text-slate-400">За 7 дней</div>
          <div className="text-lg font-semibold">{last7DaysMin} мин</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="text-xs text-slate-400">Оценка</div>
          <div className="text-lg font-semibold">{estimateMin ? `${estimateMin} мин` : "—"}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="text-xs text-slate-400">ABC</div>
          <div className="text-lg font-semibold">{abcValue}</div>
        </div>
      </section>

      {/* Main form */}
      <section className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-slate-300">Название</div>
            <input
              value={task.title}
              onChange={(e) => setTask((t) => (t ? ({ ...t, title: e.target.value } as any) : t))}
              onBlur={(e) => void patch({ title: e.target.value } as any, "task_updated", { field: "title" })}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1">
              <div className="text-sm text-slate-300">Плановая дата</div>
              <input
                type="date"
                value={plannedDate}
                onChange={(e) => {
                  const v = e.target.value || undefined;
                  setTask((t) => (t ? ({ ...(t as any), plannedDate: v } as any) : t));
                  void setPlannedDate(v);
                }}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1">
              <div className="text-sm text-slate-300">Дедлайн</div>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => {
                  const v = e.target.value || undefined;
                  setTask((t) => (t ? ({ ...(t as any), dueDate: v } as any) : t));
                  void patch({ dueDate: v } as any, "task_updated", { field: "dueDate" });
                }}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1">
              <div className="text-sm text-slate-300">Оценка (мин)</div>
              <input
                type="number"
                min={0}
                max={1440}
                value={estimateMin}
                onChange={(e) => {
                  const v = clamp(parseInt(e.target.value || "0", 10), 0, 1440);
                  setTask((t) => (t ? ({ ...(t as any), estimateMin: v } as any) : t));
                }}
                onBlur={(e) => {
                  const v = clamp(parseInt(e.target.value || "0", 10), 0, 1440);
                  void patch({ estimateMin: v } as any, "task_updated", { field: "estimateMin" });
                }}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
              />
            </label>
          </div>
        </div>

        <label className="space-y-1">
          <div className="text-sm text-slate-300">Описание</div>
          <textarea
            value={description}
            onChange={(e) => setTask((t) => (t ? ({ ...(t as any), description: e.target.value } as any) : t))}
            onBlur={(e) => void patch({ description: e.target.value } as any, "task_updated", { field: "description" })}
            className="w-full min-h-28 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            placeholder="Зачем это? что считается done? какие шаги? какие риски?"
          />
        </label>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-slate-300">ABC (важность)</div>
            <select
              value={abcValue}
              onChange={(e) => {
                const v = e.target.value as ABC;
                setTask((t) => (t ? ({ ...(t as any), abc: v } as any) : t));
                void patch({ abc: v } as any, "task_updated", { field: "abc" });
              }}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            >
              <option value="A">A — ключевое</option>
              <option value="B">B — важное</option>
              <option value="C">C — рутина</option>
              <option value="—">—</option>
            </select>
          </label>

          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-sm font-semibold">Теги</div>

            <div className="mt-2 flex flex-wrap gap-2">
              {tagIds.length === 0 ? (
                <div className="text-sm text-slate-400">Тегов нет</div>
              ) : (
                tagIds.map((tid) => (
                  <button
                    key={tid}
                    onClick={() => void setTagOnTask(tid, false)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-sm"
                    title="Клик — снять тег"
                  >
                    {tagById[tid]?.name ?? `Tag ${tid}`} <span className="text-slate-500">×</span>
                  </button>
                ))
              )}
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  void setTagOnTask(v, true);
                  e.currentTarget.value = "";
                }}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">+ Добавить тег</option>
                {tags
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .filter((t) => !tagIds.includes(t.id))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>

              <div className="flex gap-2">
                <input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                  placeholder="Новый тег…"
                />
                <button
                  onClick={() => void createTagAndAttach()}
                  className="px-3 py-2 rounded-lg bg-slate-50 text-slate-950 text-sm font-semibold"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-500 mt-2">
              Совет: теги = разрезы для аналитики. Чем стабильнее теги, тем лучше data-driven выводы.
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-sm font-semibold">Быстрые действия</div>
            <div className="mt-2 grid grid-cols-1 gap-2">
              <button
                onClick={() => void setPlannedDate(ymd(new Date()))}
                className="px-4 py-2 rounded-lg bg-slate-50 text-slate-950 text-sm font-semibold"
              >
                Запланировать на сегодня
              </button>
              <button
                onClick={() => void setPlannedDate(undefined)}
                className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm"
              >
                Снять плановую дату (в inbox)
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Schedule blocks */}
      <section className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-semibold">Блоки в расписании</h2>
          <div className="text-xs text-slate-400">{blocks.length} блок(ов)</div>
        </div>

        {blocks.length === 0 ? (
          <div className="mt-2 text-sm text-slate-400">Эта задача пока не стоит блоками в расписании.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {blocks.slice(0, 30).map((b: any) => (
              <div key={b.id} className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
                <div className="text-sm font-semibold">
                  {b.date} · {String(Math.floor((b.startMin ?? 0) / 60)).padStart(2, "0")}:
                  {String((b.startMin ?? 0) % 60).padStart(2, "0")}–
                  {String(Math.floor((b.endMin ?? 0) / 60)).padStart(2, "0")}:
                  {String((b.endMin ?? 0) % 60).padStart(2, "0")}
                </div>
                {b.title ? <div className="text-xs text-slate-400 mt-1">{b.title}</div> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Time logs */}
      <section className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-semibold">Таймлоги по задаче</h2>
          <div className="text-xs text-slate-400">{timeLogs.length} записей</div>
        </div>

        {timeLogs.length === 0 ? (
          <div className="mt-2 text-sm text-slate-400">Пока нет таймлогов по этой задаче.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {timeLogs
              .slice()
              .reverse()
              .slice(0, 20)
              .map((l: any) => (
                <div key={l.id} className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">
                      {l.date} · {l.durationMin ?? 0}м · ABC: {l.abc ?? "—"}
                    </div>
                    <div className="text-xs text-slate-400">
                      {l.startTs && l.endTs ? (
                        <>
                          {format(new Date(l.startTs), "HH:mm")}–{format(new Date(l.endTs), "HH:mm")}
                        </>
                      ) : (
                        "manual"
                      )}
                    </div>
                  </div>
                  {l.note ? <div className="text-sm text-slate-200 mt-2">{l.note}</div> : null}
                </div>
              ))}
          </div>
        )}
      </section>

      <div className="text-xs text-slate-500">
        Следующий файл: <span className="text-slate-300">ManagePage</span> — управление тегами/поглотителями/контекстами/целями/проектами (CRUD).
        Потом — правка <span className="text-slate-300">App.tsx</span> для роутов/навигации (чтобы Task и Time были доступны из UI).
      </div>
    </div>
  );
}
