import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  db,
  ensureDefaultSettings,
  logEvent,
  type Settings,
  type Task,
  type ScheduleBlock
} from "../data/db";

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function minToHHMM(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function uuid() {
  // Modern browsers support crypto.randomUUID; fallback is ok for local-only
  return (globalThis.crypto?.randomUUID?.() ??
    `id_${Date.now()}_${Math.random().toString(16).slice(2)}`) as string;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function TodayPage() {
  const [date, setDate] = useState<string>(() => ymd(new Date()));
  const [settings, setSettings] = useState<Settings | null>(null);

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [taskMap, setTaskMap] = useState<Record<string, Task>>({});

  const [plannedFlexible, setPlannedFlexible] = useState<Task[]>([]);
  const [inbox, setInbox] = useState<Task[]>([]);

  const [quickTitle, setQuickTitle] = useState("");
  const [quickEstimate, setQuickEstimate] = useState<number>(30);

  const dayCapacityMin = useMemo(() => {
    if (!settings) return 0;
    return Math.max(0, settings.dayEndMin - settings.dayStartMin);
  }, [settings]);

  const plannedHardMin = useMemo(() => {
    return blocks.reduce((acc, b) => acc + Math.max(0, b.endMin - b.startMin), 0);
  }, [blocks]);

  const plannedHardPct = useMemo(() => {
    if (!dayCapacityMin) return 0;
    return clamp(Math.round((plannedHardMin / dayCapacityMin) * 100), 0, 999);
  }, [plannedHardMin, dayCapacityMin]);

  const allowedHardMin = useMemo(() => {
    if (!settings) return 0;
    // правило 60/40: планируем ~60% оставляя reservePercent как резерв
    const planPct = clamp(100 - settings.reservePercent, 0, 100);
    return Math.round((dayCapacityMin * planPct) / 100);
  }, [settings, dayCapacityMin]);

  async function reload(forDate: string) {
    await ensureDefaultSettings();
    const s = await db.settings.get("singleton");
    if (!s) return; // не должно случиться
    setSettings(s);

    const dayBlocks = await db.scheduleBlocks.where("date").equals(forDate).sortBy("startMin");
    setBlocks(dayBlocks);

    const blockTaskIds = Array.from(new Set(dayBlocks.map((b) => b.taskId)));
    const blockTasks = (await db.tasks.bulkGet(blockTaskIds)).filter(Boolean) as Task[];

    // задачи, назначенные на этот день (гибкие), плюс задачи без plannedDate (инбокс)
    const activePlanned = await db.tasks
      .where("status")
      .equals("active")
      .and((t) => t.plannedDate === forDate)
      .toArray();

    const activeInbox = await db.tasks
      .where("status")
      .equals("active")
      .and((t) => !t.plannedDate)
      .reverse()
      .sortBy("createdAt");

    // гибкие задачи дня = activePlanned минус те, что уже в жёстких блоках
    const scheduledIds = new Set(blockTaskIds);
    const flexible = activePlanned.filter((t) => !scheduledIds.has(t.id));

    // собрать map id->task (чтобы в блоках показывать названия)
    const map: Record<string, Task> = {};
    for (const t of [...blockTasks, ...activePlanned, ...activeInbox]) map[t.id] = t;

    setTaskMap(map);
    setPlannedFlexible(flexible);
    setInbox(activeInbox.slice(-30).reverse()); // показываем последние 30 (сверху новые)
  }

  useEffect(() => {
    let alive = true;

    const init = async () => {
      await reload(date);
      if (!alive) return;
    };

    void init();

    // минимальная “реактивность”: слушаем изменения в Dexie и перезагружаем
    const handler = () => {
      void reload(date);
    };

    db.on("changes", handler);

    return () => {
      alive = false;
      db.on("changes").unsubscribe(handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function addTask() {
    const title = quickTitle.trim();
    if (!title) return;

    const now = Date.now();
    const id = uuid();

    const task: Task = {
      id,
      title,
      description: "",
      tagIds: [],
      contextIds: [],
      estimateMin: clamp(Number.isFinite(quickEstimate) ? quickEstimate : 30, 5, 24 * 60),
      plannedDate: date, // по умолчанию кидаем в текущий день как гибкую
      status: "active",
      createdAt: now,
      updatedAt: now
    };

    await db.tasks.put(task);
    await logEvent({ type: "task_created", taskId: id, payload: { plannedDate: date } });

    setQuickTitle("");
  }

  async function markDone(taskId: string) {
    const t = await db.tasks.get(taskId);
    if (!t) return;

    const now = Date.now();
    await db.tasks.update(taskId, {
      status: "done",
      updatedAt: now,
      doneAt: now
    });

    // удалить блоки этого дня, если были (чтобы “очистилось расписание”)
    const bs = await db.scheduleBlocks.where({ date, taskId }).toArray();
    if (bs.length) {
      await db.scheduleBlocks.bulkDelete(bs.map((b)
