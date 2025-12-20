
import { useEffect, useState } from "react";

export const STORAGE_KEY = "tm.archangel.v1";
const LAST_ACTION_KEY = "tm.lastAction";

export function setLastAction(action: string) {
  try {
    localStorage.setItem(
      LAST_ACTION_KEY,
      JSON.stringify({ action, at: new Date().toISOString() })
    );
  } catch {
    // ignore
  }
}

export type ID = string;

export type TaskStatus = "todo" | "done";

export type Task = {
  id: ID;
  title: string;
  notes: string;
  tags: string[];
  status: TaskStatus;

  // планирование
  plannedDate: string | null; // YYYY-MM-DD
  plannedStart: string | null; // HH:MM (если есть — считаем "жесткой")
  estimateMin: number | null;

  // приоритет: 1=высокий, 2=средний, 3=низкий
  priority: 1 | 2 | 3;

  // дедлайн (если есть). epoch ms
  deadlineAt: number | null;

  createdAt: number;
  updatedAt: number;
};

export type TimeLogKind = "useful" | "sink" | "rest";

export type TimeLog = {
  id: ID;
  taskId: ID | null;

  // тип времени (Фокус / Дорога / Сон / Поглотитель и т.п.)
  timeTypeId: ID | null;

  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
  minutes: number;

  note: string;

  // optional (на будущее для честной аналитики)
  kind?: TimeLogKind;
  sinkId?: ID | null;
};

export type ListKey =
  | "goals"
  | "projects"
  | "contexts"
  | "roles"
  | "motivationModes"
  | "sinks"
  | "timeTypes";

export type ListItem = { id: ID; name: string };

export type ListsState = Record<ListKey, ListItem[]>;

export type ReviewEntry = {
  id: ID;
  weekStart: string; // YYYY-MM-DD (понедельник по умолчанию)
  wins: string;
  lessons: string;
  focus: string;
  next: string;
  createdAt: number;
  updatedAt: number;
};

export type Settings = {
  weekStartsOn: 1 | 0; // 1=Mon, 0=Sun
  dayStartHour: number; // 0-23
  dayEndHour: number; // 0-23
  tagLibrary: string[];
};

export type PlanTask = {
  id: ID;
  title: string;
  note: string;
  createdAt: number;
  updatedAt: number;
};

export type PlanWeek = {
  weekStart: string; // YYYY-MM-DD Monday by default
  days: Record<string, PlanTask[]>;
};

export type PlansState = {
  year: PlanTask[];
  month: PlanTask[];
  weeks: Record<string, PlanWeek>;
};

export type PlanLocation =
  | { level: "year"; id: ID }
  | { level: "month"; id: ID }
  | { level: "week"; weekStart: string; day: string; id: ID };

export type AppState = {
  version: 1;
  tasks: Task[];
  timeLogs: TimeLog[];
  lists: ListsState;
  reviews: ReviewEntry[];
  settings: Settings;
  plans: PlansState;
  activeTimer:
    | {
        taskId: ID | null;
        timeTypeId: ID | null;
        startedAt: number;
        kind?: TimeLogKind;
        sinkId?: ID | null;
      }
    | null;
};

function uid(): ID {
  // @ts-ignore
  return (
    globalThis.crypto?.randomUUID?.() ??
    `id_${Math.random().toString(16).slice(2)}_${Date.now()}`
  );
}

function now() {
  return Date.now();
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function ymdAddDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function getWeekStart(ymd: string, weekStartsOn: 1 | 0): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay(); // 0 Sun..6 Sat
  const diff =
    weekStartsOn === 1 ? (day === 0 ? -6 : 1 - day) : -day; // to Monday / to Sunday
  dt.setDate(dt.getDate() + diff);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => ymdAddDays(weekStart, i));
}

// --------- helpers (kind/sink invariants) ---------

function isKind(x: any): x is TimeLogKind {
  return x === "useful" || x === "sink" || x === "rest";
}

function inferKindFromTimeTypeId(timeTypeId: ID | null): TimeLogKind {
  if (!timeTypeId) return "useful";
  if (timeTypeId === "tt_sink") return "sink";
  if (timeTypeId === "tt_rest" || timeTypeId === "tt_sleep") return "rest";
  return "useful";
}

function normalizeKind(kind: any, timeTypeId: ID | null): TimeLogKind {
  return isKind(kind) ? kind : inferKindFromTimeTypeId(timeTypeId);
}

function normalizeSinkId(kind: TimeLogKind, sinkId: any): ID | null {
  if (kind !== "sink") return null;
  return sinkId === null || typeof sinkId === "string" ? sinkId : null;
}

function normalizePlanTask(t: any): PlanTask {
  return {
    id: String(t?.id ?? uid()),
    title: String(t?.title ?? ""),
    note: String(t?.note ?? ""),
    createdAt: toFiniteNumber(t?.createdAt) ?? now(),
    updatedAt: toFiniteNumber(t?.updatedAt) ?? now(),
  };
}

function emptyWeek(weekStart: string): PlanWeek {
  const days: Record<string, PlanTask[]> = {};
  for (const day of weekDays(weekStart)) {
    days[day] = [];
  }
  return { weekStart, days };
}

function normalizePlanWeek(w: any): PlanWeek {
  const rawWeekStart = typeof w?.weekStart === "string" ? w.weekStart : todayYMD();
  const base = emptyWeek(rawWeekStart);
  const incomingDays: Record<string, any[]> =
    w && typeof w === "object" && w.days && typeof w.days === "object"
      ? (w.days as Record<string, any[]>)
      : {};

  for (const day of Object.keys(incomingDays)) {
    if (!base.days[day]) base.days[day] = [];
  }

  const filled: Record<string, PlanTask[]> = {};
  for (const day of Object.keys(base.days)) {
    const list = Array.isArray(incomingDays[day]) ? incomingDays[day] : [];
    filled[day] = list.map(normalizePlanTask);
  }

  return { weekStart: base.weekStart, days: filled };
}

function normalizePlans(p: any): PlansState {
  const safeWeeks: Record<string, PlanWeek> = {};
  if (p && typeof p === "object" && p.weeks && typeof p.weeks === "object") {
    for (const [k, v] of Object.entries(p.weeks as Record<string, any>)) {
      if (typeof k === "string") {
        const normalized = normalizePlanWeek(v);
        safeWeeks[k] = normalized;
      }
    }
  }

  return {
    year: Array.isArray(p?.year) ? p.year.map(normalizePlanTask) : [],
    month: Array.isArray(p?.month) ? p.month.map(normalizePlanTask) : [],
    weeks: safeWeeks,
  };
}

// ---------------- Plans ----------------

function ensureWeekDays(plans: PlansState, weekStart: string): PlansState {
  const existing = plans.weeks[weekStart];
  const normalized = normalizePlanWeek(existing ?? { weekStart, days: {} });
  return { ...plans, weeks: { ...plans.weeks, [weekStart]: normalized } };
}

function takePlanTask(plans: PlansState, loc: PlanLocation): { task: PlanTask | null; plans: PlansState } {
  if (loc.level === "year") {
    const nextYear = plans.year.filter((t) => t.id !== loc.id);
    const task = plans.year.find((t) => t.id === loc.id) ?? null;
    return { task, plans: { ...plans, year: nextYear } };
  }

  if (loc.level === "month") {
    const nextMonth = plans.month.filter((t) => t.id !== loc.id);
    const task = plans.month.find((t) => t.id === loc.id) ?? null;
    return { task, plans: { ...plans, month: nextMonth } };
  }

  const safePlans = ensureWeekDays(plans, loc.weekStart);
  const week = safePlans.weeks[loc.weekStart];
  const bucket = week.days[loc.day] ?? [];
  const nextBucket = bucket.filter((t) => t.id !== loc.id);
  const task = bucket.find((t) => t.id === loc.id) ?? null;
  const updatedWeek: PlanWeek = {
    ...week,
    days: { ...week.days, [loc.day]: nextBucket },
  };
  return {
    task,
    plans: { ...safePlans, weeks: { ...safePlans.weeks, [loc.weekStart]: updatedWeek } },
  };
}

function placeTaskInWeek(plans: PlansState, weekStart: string, day: string, task: PlanTask): PlansState {
  const normalized = ensureWeekDays(plans, weekStart);
  const safeWeek = normalized.weeks[weekStart];
  const safeDay = safeWeek.days[day] ? day : weekDays(weekStart)[0];
  const updatedWeek: PlanWeek = {
    ...safeWeek,
    days: {
      ...safeWeek.days,
      [safeDay]: [{ ...task, updatedAt: now() }, ...(safeWeek.days[safeDay] ?? [])],
    },
  };

  return { ...normalized, weeks: { ...normalized.weeks, [weekStart]: updatedWeek } };
}

function placeTaskInMonth(plans: PlansState, task: PlanTask): PlansState {
  return { ...plans, month: [{ ...task, updatedAt: now() }, ...plans.month] };
}

function placeTaskInYear(plans: PlansState, task: PlanTask): PlansState {
  return { ...plans, year: [{ ...task, updatedAt: now() }, ...plans.year] };
}

export function addPlanTask(level: "year" | "month", title: string, note: string = ""): ID {
  const trimmed = title.trim();
  if (!trimmed) return uid();
  const task: PlanTask = { id: uid(), title: trimmed, note, createdAt: now(), updatedAt: now() };

  setState((s) => {
    const plans = level === "year" ? placeTaskInYear(s.plans, task) : placeTaskInMonth(s.plans, task);
    return { ...s, plans };
  });

  setLastAction(`plan.add.${level}`);
  return task.id;
}

export function addPlanWeekTask(weekStart: string, day: string, title: string, note: string = ""): ID {
  const trimmed = title.trim();
  if (!trimmed) return uid();
  const task: PlanTask = { id: uid(), title: trimmed, note, createdAt: now(), updatedAt: now() };
  setState((s) => ({ ...s, plans: placeTaskInWeek(s.plans, weekStart, day, task) }));
  setLastAction("plan.add.week");
  return task.id;
}

export function movePlanTaskToWeek(loc: PlanLocation, weekStart: string, day: string) {
  setState((s) => {
    const taken = takePlanTask(s.plans, loc);
    if (!taken.task) return s;
    const plans = placeTaskInWeek(taken.plans, weekStart, day, taken.task);
    return { ...s, plans };
  });
  setLastAction("plan.move.toWeek");
}

export function movePlanTaskToMonth(loc: PlanLocation) {
  setState((s) => {
    const taken = takePlanTask(s.plans, loc);
    if (!taken.task) return s;
    const plans = placeTaskInMonth(taken.plans, taken.task);
    return { ...s, plans };
  });
  setLastAction("plan.move.toMonth");
}

export function movePlanTaskToYear(loc: PlanLocation) {
  setState((s) => {
    const taken = takePlanTask(s.plans, loc);
    if (!taken.task) return s;
    const plans = placeTaskInYear(taken.plans, taken.task);
    return { ...s, plans };
  });
  setLastAction("plan.move.toYear");
}

export function movePlanTaskWithinWeek(loc: Extract<PlanLocation, { level: "week" }>, day: string) {
  movePlanTaskToWeek(loc, loc.weekStart, day);
}

export function updatePlanTask(loc: PlanLocation, patch: Partial<Pick<PlanTask, "title" | "note">>) {
  setState((s) => {
    const taken = takePlanTask(s.plans, loc);
    if (!taken.task) return s;
    const nextTask: PlanTask = {
      ...taken.task,
      ...patch,
      title: patch.title?.trim() ?? taken.task.title,
      updatedAt: now(),
    };

    if (loc.level === "year") return { ...s, plans: placeTaskInYear(taken.plans, nextTask) };
    if (loc.level === "month") return { ...s, plans: placeTaskInMonth(taken.plans, nextTask) };
    return { ...s, plans: placeTaskInWeek(taken.plans, loc.weekStart, loc.day, nextTask) };
  });
  setLastAction("plan.update");
}

export function deletePlanTask(loc: PlanLocation) {
  setState((s) => {
    const taken = takePlanTask(s.plans, loc);
    if (!taken.task) return s;
    return { ...s, plans: taken.plans };
  });
  setLastAction("plan.delete");
}

export function movePlanTaskToToday(loc: PlanLocation, plannedDate?: string) {
  setState((s) => {
    const taken = takePlanTask(s.plans, loc);
    if (!taken.task) return s;
    const date = plannedDate ?? (loc.level === "week" ? loc.day : todayYMD());
    const newTask: Task = {
      id: uid(),
      title: taken.task.title || "Без названия",
      notes: taken.task.note ?? "",
      tags: [],
      status: "todo",
      plannedDate: date,
      plannedStart: null,
      estimateMin: null,
      priority: 2,
      deadlineAt: null,
      createdAt: now(),
      updatedAt: now(),
    };

    return { ...s, tasks: [newTask, ...s.tasks], plans: taken.plans };
  });

  setLastAction("plan.move.today");
}

const DEFAULT_STATE: AppState = {
  version: 1,
  tasks: [],
  timeLogs: [],
  lists: {
    goals: [],
    projects: [],
    contexts: [],
    roles: [],
    motivationModes: [],
    sinks: [],
    timeTypes: [
      { id: "tt_focus", name: "Фокус" },
      { id: "tt_routine", name: "Рутина/админка" },
      { id: "tt_comm", name: "Коммуникации" },
      { id: "tt_road", name: "Дорога" },
      { id: "tt_life", name: "Быт" },
      { id: "tt_rest", name: "Восстановление/отдых" },
      { id: "tt_sleep", name: "Сон" },
      { id: "tt_sink", name: "Поглотитель" },
    ],
  },
  reviews: [],
  plans: { year: [], month: [], weeks: {} },
  settings: {
    weekStartsOn: 1,
    dayStartHour: 8,
    dayEndHour: 21,
    tagLibrary: ["#карьера", "#учеба", "#здоровье", "#дом", "#рутина"],
  },
  activeTimer: null,
};

function normalizeActiveTimer(a: any): AppState["activeTimer"] {
  if (!a) return null;
  const taskId = a.taskId === null || typeof a.taskId === "string" ? a.taskId : null;
  const timeTypeId = a.timeTypeId === null || typeof a.timeTypeId === "string" ? a.timeTypeId : null;
  const startedAt = toFiniteNumber(a.startedAt) ?? now();

  const kind = normalizeKind(a.kind, timeTypeId);
  const sinkId = normalizeSinkId(kind, a.sinkId);

  return { taskId, timeTypeId, startedAt, kind, sinkId };
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_STATE;

    const merged: AppState = {
      ...DEFAULT_STATE,
      ...parsed,
      lists: { ...DEFAULT_STATE.lists, ...(parsed.lists ?? {}) },
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings ?? {}) },
      plans: normalizePlans((parsed as any).plans ?? {}),
      tasks: Array.isArray((parsed as any).tasks)
        ? (parsed as any).tasks.map(normalizeTask)
        : DEFAULT_STATE.tasks,
      timeLogs: Array.isArray((parsed as any).timeLogs)
        ? (parsed as any).timeLogs.map(normalizeTimeLog)
        : DEFAULT_STATE.timeLogs,
      reviews: Array.isArray((parsed as any).reviews)
        ? ((parsed as any).reviews as any)
        : DEFAULT_STATE.reviews,
      activeTimer: normalizeActiveTimer((parsed as any).activeTimer),
    };

    return merged;
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(s: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch (e) {
    // В некоторых браузерах (особенно iOS Safari / приватный режим / отключённые cookies)
    // localStorage может бросать исключение на setItem. Не падаем — просто не сохраняем.
    // eslint-disable-next-line no-console
    console.warn("saveState failed:", e);
  }
}

let STATE: AppState = loadState();
const listeners = new Set<(s: AppState) => void>();

function emit() {
  for (const fn of listeners) fn(STATE);
}

export function getState(): AppState {
  return STATE;
}

export function subscribe(fn: (s: AppState) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setState(updater: (s: AppState) => AppState) {
  STATE = updater(STATE);
  saveState(STATE);
  emit();
}

export function useAppState(): AppState {
  const [s, setS] = useState<AppState>(() => getState());
  useEffect(() => subscribe(setS), []);
  return s;
}

// ---------------- Normalizers ----------------

function normalizeTask(t: any): Task {
  return {
    id: String(t.id ?? uid()),
    title: String(t.title ?? "Без названия"),
    notes: String(t.notes ?? ""),
    tags: Array.isArray(t.tags) ? t.tags.map(String) : [],
    status: t.status === "done" ? "done" : "todo",
    plannedDate: typeof t.plannedDate === "string" ? t.plannedDate : null,
    plannedStart: typeof t.plannedStart === "string" ? t.plannedStart : null,
    estimateMin: toFiniteNumber(t.estimateMin),
    priority: (t.priority === 1 || t.priority === 2 || t.priority === 3) ? t.priority : 2,
    deadlineAt: toFiniteNumber(t.deadlineAt),
    createdAt: toFiniteNumber(t.createdAt) ?? now(),
    updatedAt: toFiniteNumber(t.updatedAt) ?? now(),
  };
}

function normalizeTimeLog(l: any): TimeLog {
  const startedAt = toFiniteNumber(l.startedAt) ?? now();
  const endedAt = toFiniteNumber(l.endedAt) ?? startedAt;
  const minutes =
    toFiniteNumber(l.minutes) ?? Math.max(1, Math.round((endedAt - startedAt) / 60000));

  const taskId = l.taskId === null || typeof l.taskId === "string" ? l.taskId : null;
  const timeTypeId = l.timeTypeId ? String(l.timeTypeId) : null;

  const kind = normalizeKind(l.kind, timeTypeId);
  const sinkId = normalizeSinkId(kind, l.sinkId);

  return {
    id: String(l.id ?? uid()),
    taskId,
    timeTypeId,
    startedAt,
    endedAt,
    minutes,
    note: String(l.note ?? ""),
    kind,
    sinkId,
  };
}

// ---------------- Tasks ----------------

export function createTask(
  title: string,
  opts?: Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>
): ID {
  const t: Task = {
    id: uid(),
    title: title.trim() || "Без названия",
    notes: "",
    tags: [],
    status: "todo",
    plannedDate: null,
    plannedStart: null,
    estimateMin: null,
    priority: 2,
    deadlineAt: null,
    createdAt: now(),
    updatedAt: now(),
    ...(opts ?? {}),
  };

  setState((s) => ({
    ...s,
    tasks: [t, ...s.tasks],
  }));

  return t.id;
}

export function updateTask(id: ID, patch: Partial<Task>) {
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: now() } : t)),
  }));
}

export function toggleDone(id: ID) {
  const t = STATE.tasks.find((x) => x.id === id);
  if (!t) return;
  updateTask(id, { status: t.status === "done" ? "todo" : "done" });
}

export function moveTask(id: ID, plannedDate: string | null, plannedStart: string | null = null) {
  updateTask(id, { plannedDate, plannedStart });
}

export function deleteTask(id: ID) {
  setState((s) => ({
    ...s,
    tasks: s.tasks.filter((t) => t.id !== id),
    timeLogs: s.timeLogs.filter((l) => l.taskId !== id),
  }));
}

// ---------------- Timer / logs ----------------

export function startTimer(
  taskId: ID | null,
  timeTypeId: ID | null = null,
  kind: TimeLogKind = "useful",
  sinkId: ID | null = null
) {
  const k = normalizeKind(kind, timeTypeId);
  const sid = normalizeSinkId(k, sinkId);

  setState((s) => ({
    ...s,
    activeTimer: { taskId, timeTypeId, startedAt: now(), kind: k, sinkId: sid },
  }));
}

export function stopTimer(note: string = "") {
  const active = STATE.activeTimer;
  if (!active) return;

  const endedAt = now();
  const minutes = Math.max(1, Math.round((endedAt - active.startedAt) / 60000));

  const k = normalizeKind(active.kind, active.timeTypeId ?? null);
  const sid = normalizeSinkId(k, active.sinkId);

  const log: TimeLog = {
    id: uid(),
    taskId: active.taskId,
    timeTypeId: active.timeTypeId ?? null,
    startedAt: active.startedAt,
    endedAt,
    minutes,
    note: String(note ?? ""),
    kind: k,
    sinkId: sid,
  };

  setState((s) => ({
    ...s,
    activeTimer: null,
    timeLogs: [log, ...s.timeLogs],
  }));
}

export type AddTimeLogInput = {
  taskId: ID | null;
  timeTypeId?: ID | null;
  startedAt: number;
  endedAt: number;
  note?: string;
  kind?: TimeLogKind;
  sinkId?: ID | null;
};

// ВАЖНО: делаем именно объектный ввод (как у тебя в TimePage)
export function addTimeLogManual(input: AddTimeLogInput): ID {
  const safeStart = typeof input.startedAt === "number" ? input.startedAt : now();
  const safeEnd = typeof input.endedAt === "number" ? input.endedAt : safeStart;
  const minutes = Math.max(1, Math.round((safeEnd - safeStart) / 60000));

  const timeTypeId = input.timeTypeId ?? null;
  const k = normalizeKind(input.kind, timeTypeId);
  const sid = normalizeSinkId(k, input.sinkId);

  const log: TimeLog = {
    id: uid(),
    taskId: input.taskId ?? null,
    timeTypeId,
    startedAt: safeStart,
    endedAt: safeEnd,
    minutes,
    note: String(input.note ?? ""),
    kind: k,
    sinkId: sid,
  };

  setState((s) => ({
    ...s,
    timeLogs: [log, ...s.timeLogs],
  }));

  return log.id;
}

export function deleteTimeLog(id: ID) {
  setState((s) => ({ ...s, timeLogs: s.timeLogs.filter((l) => l.id !== id) }));
}

export function updateTimeLog(
  id: ID,
  patch: Partial<
    Pick<TimeLog, "taskId" | "timeTypeId" | "startedAt" | "endedAt" | "note" | "kind" | "sinkId">
  >
) {
  setState((s) => ({
    ...s,
    timeLogs: s.timeLogs.map((l) => {
      if (l.id !== id) return l;

      const startedAt = typeof patch.startedAt === "number" ? patch.startedAt : l.startedAt;
      const endedAt = typeof patch.endedAt === "number" ? patch.endedAt : l.endedAt;
      const minutes = Math.max(1, Math.round((endedAt - startedAt) / 60000));

      const nextTimeTypeId =
        patch.timeTypeId === undefined ? l.timeTypeId : (patch.timeTypeId ?? null);

      const nextKind = normalizeKind(
        patch.kind === undefined ? l.kind : patch.kind,
        nextTimeTypeId
      );

      // sinkId: если patch не прислали — сохраняем старое; если прислали null — обнуляем; и всегда null если kind != sink
      const prevSink = l.sinkId ?? null;
      const rawSink =
        patch.sinkId === undefined ? prevSink : (patch.sinkId ?? null);

      const nextSinkId = normalizeSinkId(nextKind, rawSink);

      return {
        ...l,
        ...patch,
        timeTypeId: nextTimeTypeId,
        startedAt,
        endedAt,
        minutes,
        kind: nextKind,
        sinkId: nextSinkId,
      };
    }),
  }));
}

// ---------------- Lists ----------------

export function addListItem(key: ListKey, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const item: ListItem = { id: uid(), name: trimmed };
  setState((s) => ({
    ...s,
    lists: { ...s.lists, [key]: [item, ...(s.lists[key] ?? [])] },
  }));
}

export function renameListItem(key: ListKey, id: ID, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  setState((s) => ({
    ...s,
    lists: {
      ...s.lists,
      [key]: (s.lists[key] ?? []).map((it) => (it.id === id ? { ...it, name: trimmed } : it)),
    },
  }));
}

export function removeListItem(key: ListKey, id: ID) {
  setState((s) => ({
    ...s,
    lists: { ...s.lists, [key]: (s.lists[key] ?? []).filter((it) => it.id !== id) },
  }));
}

export function addTagToLibrary(tag: string) {
  const t = tag.trim();
  if (!t) return;
  setState((s) => ({
    ...s,
    settings: {
      ...s.settings,
      tagLibrary: Array.from(new Set([t, ...s.settings.tagLibrary])),
    },
  }));
}

// ---------------- Review ----------------

export function upsertReview(weekStart: string, patch: Partial<ReviewEntry>) {
  setState((s) => {
    const existing = s.reviews.find((r) => r.weekStart === weekStart);
    if (!existing) {
      const r: ReviewEntry = {
        id: uid(),
        weekStart,
        wins: "",
        lessons: "",
        focus: "",
        next: "",
        createdAt: now(),
        updatedAt: now(),
        ...patch,
      };
      return { ...s, reviews: [r, ...s.reviews] };
    }
    return {
      ...s,
      reviews: s.reviews.map((r) => (r.weekStart === weekStart ? { ...r, ...patch, updatedAt: now() } : r)),
    };
  });
}

// ---------------- Backup / Export ----------------

export function exportBackupJson(): string {
  return JSON.stringify(getState(), null, 2);
}

export function importBackupJson(jsonText: string) {
  const parsed = JSON.parse(jsonText) as AppState;
  if (!parsed || parsed.version !== 1) throw new Error("Bad backup format");

  const normalized: AppState = {
    ...DEFAULT_STATE,
    ...parsed,
    lists: { ...DEFAULT_STATE.lists, ...(parsed.lists ?? {}) },
    plans: normalizePlans((parsed as any).plans ?? {}),
    settings: { ...DEFAULT_STATE.settings, ...(parsed.settings ?? {}) },
    tasks: Array.isArray((parsed as any).tasks) ? (parsed as any).tasks.map(normalizeTask) : [],
    timeLogs: Array.isArray((parsed as any).timeLogs) ? (parsed as any).timeLogs.map(normalizeTimeLog) : [],
    reviews: Array.isArray((parsed as any).reviews) ? (parsed as any).reviews : [],
    activeTimer: normalizeActiveTimer((parsed as any).activeTimer),
  };

  STATE = normalized;
  saveState(STATE);
  emit();
}

function csvEscape(v: any) {
  const s = String(v ?? "");
  const needs = /[",\n]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needs ? `"${escaped}"` : escaped;
}

export function tasksToCsv(tasks: Task[]) {
  const header = ["id", "title", "status", "plannedDate", "plannedStart", "estimateMin", "priority", "deadlineAt", "tags", "notes", "createdAt", "updatedAt"];
  const rows = tasks.map((t) => [
    t.id,
    t.title,
    t.status,
    t.plannedDate ?? "",
    t.plannedStart ?? "",
    t.estimateMin ?? "",
    t.priority ?? 2,
    t.deadlineAt ?? "",
    t.tags.join(" "),
    t.notes,
    new Date(t.createdAt).toISOString(),
    new Date(t.updatedAt).toISOString(),
  ]);
  return [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
}

export function timeLogsToCsv(logs: TimeLog[]) {
  const header = ["id", "taskId", "timeTypeId", "minutes", "startedAt", "endedAt", "kind", "sinkId", "note"];
  const rows = logs.map((l) => [
    l.id,
    l.taskId ?? "",
    l.timeTypeId ?? "",
    l.minutes,
    new Date(l.startedAt).toISOString(),
    new Date(l.endedAt).toISOString(),
    l.kind ?? "",
    l.sinkId ?? "",
    l.note ?? "",
  ]);
  return [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
}

export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
