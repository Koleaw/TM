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

export function ymdAddDays(ymd: string, delta:
