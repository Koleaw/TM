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

  createdAt: number;
  updatedAt: number;
};

export type TimeLog = {
  id: ID;
  taskId: ID | null;
  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
  minutes: number; // вычисляемое поле (поддерживаем консистентность при правках)
  note: string; // комментарий/описание
};

export type ListKey =
  | "goals"
  | "projects"
  | "contexts"
  | "roles"
  | "motivationModes"
  | "sinks";
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
  activeTimer: { taskId: ID | null; startedAt: number } | null;
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
    weekStartsOn === 1
      ? day === 0
        ? -6
        : 1 - day // to Monday
      : -day; // to Sunday
  dt.setDate(dt.getDate() + diff);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => ymdAddDays(weekStart, i));
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

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    // мягкий merge
    return {
      ...DEFAULT_STATE,
      ...parsed,
      lists: { ...DEFAULT_STATE.lists, ...(parsed.lists ?? {}) },
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(s: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
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

function calcMinutes(startedAt: number, endedAt: number): number {
  const diff = endedAt - startedAt;
  // для таймшита и таймера логичнее "округлять вверх" (часть минуты тоже считается)
  return Math.max(1, Math.ceil(diff / 60000));
}

export function startTimer(taskId: ID | null) {
  setState((s) => ({
    ...s,
    activeTimer: { taskId, startedAt: now() },
  }));
}

export function stopTimer(note: string = "") {
  const active = STATE.activeTimer;
  if (!active) return;

  const endedAt = now();
  const minutes = calcMinutes(active.startedAt, endedAt);

  const log: TimeLog = {
    id: uid(),
    taskId: active.taskId,
    startedAt: active.startedAt,
    endedAt,
    minutes,
    note,
  };

  setState((s) => ({
    ...s,
    activeTimer: null,
    timeLogs: [log, ...s.timeLogs],
  }));
}

// ручное добавление записи (старт/финиш)
export function addTimeLogManual(params: {
  taskId: ID | null;
  startedAt: number;
  endedAt: number;
  note: string;
}) {
  const { taskId, startedAt, endedAt, note } = params;

  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return;
  if (endedAt <= startedAt) return;

  const log: TimeLog = {
    id: uid(),
    taskId,
    startedAt,
    endedAt,
    minutes: calcMinutes(startedAt, endedAt),
    note: note ?? "",
  };

  setState((s) => ({
    ...s,
    timeLogs: [log, ...s.timeLogs],
  }));
}

// редактирование записи (с пересчётом minutes)
export function updateTimeLog(id: ID, patch: Partial<Omit<TimeLog, "id" | "minutes">>) {
  setState((s) => ({
    ...s,
    timeLogs: s.timeLogs.map((l) => {
      if (l.id !== id) return l;
      const next = { ...l, ...patch };
      if (next.endedAt <= next.startedAt) return l; // защита от некорректной правки
      return { ...next, minutes: calcMinutes(next.startedAt, next.endedAt) };
    }),
  }));
}

export function deleteTimeLog(id: ID) {
  setState((s) => ({ ...s, timeLogs: s.timeLogs.filter((l) => l.id !== id) }));
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
  // минимальная защита
  if (!parsed || parsed.version !== 1) throw new Error("Bad backup format");
  STATE = {
    ...DEFAULT_STATE,
    ...parsed,
    lists: { ...DEFAULT_STATE.lists, ...(parsed.lists ?? {}) },
    settings: { ...DEFAULT_STATE.settings, ...(parsed.settings ?? {}) },
  };
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
  const header = [
    "id",
    "title",
    "status",
    "plannedDate",
    "plannedStart",
    "estimateMin",
    "tags",
    "notes",
    "createdAt",
    "updatedAt",
  ];
  const rows = tasks.map((t) => [
    t.id,
    t.title,
    t.status,
    t.plannedDate ?? "",
    t.plannedStart ?? "",
    t.estimateMin ?? "",
    t.tags.join(" "),
    t.notes,
    new Date(t.createdAt).toISOString(),
    new Date(t.updatedAt).toISOString(),
  ]);
  return [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
}

export function timeLogsToCsv(logs: TimeLog[]) {
  const header = ["id", "taskId", "minutes", "startedAt", "endedAt", "note"];
  const rows = logs.map((l) => [
    l.id,
    l.taskId ?? "",
    l.minutes,
    new Date(l.startedAt).toISOString(),
    new Date(l.endedAt).toISOString(),
    l.note,
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
