
import { useEffect, useState } from "react";

const STORAGE_KEY = "tm.archangel.v1";

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

  // связь "проект (дедлайн) → бифштексы"
  parentId: ID | null;
  sortOrder: number | null; // порядок внутри родителя

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

export type AppState = {
  version: 1;
  tasks: Task[];
  timeLogs: TimeLog[];
  lists: ListsState;
  reviews: ReviewEntry[];
  settings: Settings;
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
  const startedAt = typeof a.startedAt === "number" ? a.startedAt : now();

  const kind = normalizeKind(a.kind, timeTypeId);
  const sinkId = normalizeSinkId(kind, a.sinkId);

  return { taskId, timeTypeId, startedAt, kind, sinkId };
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<AppState>;

    const merged: AppState = {
      ...DEFAULT_STATE,
      ...parsed,
      lists: { ...DEFAULT_STATE.lists, ...(parsed.lists ?? {}) },
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings ?? {}) },
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
  } catch (err) {
    // В некоторых браузерах/режимах (например, Safari Private) setItem может падать.
    // Храни состояние в памяти и не роняй приложение.
    // eslint-disable-next-line no-console
    console.warn("Failed to persist state", err);
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
    plannedDate: t.plannedDate ?? null,
    plannedStart: t.plannedStart ?? null,
    estimateMin: typeof t.estimateMin === "number" ? t.estimateMin : null,
    priority: (t.priority === 1 || t.priority === 2 || t.priority === 3) ? t.priority : 2,
    deadlineAt: typeof t.deadlineAt === "number" ? t.deadlineAt : null,
    parentId: t.parentId == null ? null : String(t.parentId),
    sortOrder: typeof t.sortOrder === "number" ? t.sortOrder : null,
    createdAt: typeof t.createdAt === "number" ? t.createdAt : now(),
    updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : now(),
  };
}

function normalizeTimeLog(l: any): TimeLog {
  const startedAt = typeof l.startedAt === "number" ? l.startedAt : now();
  const endedAt = typeof l.endedAt === "number" ? l.endedAt : startedAt;
  const minutes =
    typeof l.minutes === "number"
      ? l.minutes
      : Math.max(1, Math.round((endedAt - startedAt) / 60000));

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
  const id = uid();
  const trimmed = title.trim() || "Без названия";

  setState((s) => {
    const pid = (opts as any)?.parentId ?? null;

    // Если это "бифштекс", то ставим ему порядок автоматически (в конец списка) — если не задан явно.
    let sortOrder: number | null =
      typeof (opts as any)?.sortOrder === "number" ? (opts as any).sortOrder : null;

    if (pid && sortOrder == null) {
      const siblings = s.tasks.filter((t) => (t as any).parentId === pid);
      const max = Math.max(
        -1,
        ...siblings.map((t) => (typeof (t as any).sortOrder === "number" ? (t as any).sortOrder : -1))
      );
      sortOrder = max + 1;
    }

    const t: Task = {
      id,
      title: trimmed,
      notes: "",
      tags: [],
      status: "todo",
      plannedDate: null,
      plannedStart: null,
      estimateMin: 0,
      priority: 2,
      deadlineAt: null,
      parentId: pid ? String(pid) : null,
      sortOrder,
      createdAt: now(),
      updatedAt: now(),
      ...(opts ?? {}),
      // нормализуем на всякий
      parentId: pid ? String(pid) : null,
      sortOrder,
    };

    return {
      ...s,
      tasks: [t, ...s.tasks],
    };
  });

  return id;
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

  const nextStatus: TaskStatus = t.status === "done" ? "todo" : "done";
  updateTask(id, { status: nextStatus });

  // Если это "бифштекс" — поддерживаем родителя: когда все бифштексы закрыты, проект закрывается сам.
  const pid = (t as any).parentId ?? null;
  if (!pid) return;

  const parent = STATE.tasks.find((x) => x.id === pid);
  if (!parent) return;

  const children = STATE.tasks.filter((x) => (x as any).parentId === pid);
  if (children.length === 0) return;

  const allDone = children.every((c) => (c.id === id ? nextStatus : c.status) === "done");
  const anyTodo = children.some((c) => (c.id === id ? nextStatus : c.status) !== "done");

  if (allDone && parent.status !== "done") updateTask(parent.id, { status: "done" });
  if (anyTodo && parent.status === "done") updateTask(parent.id, { status: "todo" });
}

export function moveTask(id: ID, plannedDate: string | null, plannedStart: string | null = null) {
  updateTask(id, { plannedDate, plannedStart });
}

export function deleteTask(id: ID) {
  setState((s) => {
    const toDelete = new Set<ID>();
    const stack: ID[] = [id];

    while (stack.length) {
      const cur = stack.pop()!;
      if (toDelete.has(cur)) continue;
      toDelete.add(cur);

      for (const t of s.tasks) {
        if ((t as any).parentId === cur) stack.push(t.id);
      }
    }

    return {
      ...s,
      tasks: s.tasks.filter((t) => !toDelete.has(t.id)),
      timeLogs: s.timeLogs.filter((l) => l.taskId == null || !toDelete.has(l.taskId)),
      activeTimer:
        s.activeTimer && s.activeTimer.taskId && toDelete.has(s.activeTimer.taskId)
          ? null
          : s.activeTimer,
    };
  });
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
