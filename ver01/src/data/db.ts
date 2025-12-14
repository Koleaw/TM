import Dexie, { Table } from "dexie";

/**
 * ВАЖНО:
 * - IndexedDB = локальная база на устройстве.
 * - Версионирование через Dexie.version(n).stores(...)
 * - Потом добавим migrations.ts, когда начнём менять схему.
 */

export type ID = string;

export type TaskStatus = "active" | "done" | "archived";
export type AbcClass = "A" | "B" | "C" | "D";

export interface Task {
  id: ID;
  title: string;
  description?: string;

  // Контексты/теги (контекстное планирование)
  tagIds: ID[];
  contextIds: ID[];

  // Для целей/проектов (стратегия → тактика → операционка)
  goalId?: ID;
  projectId?: ID;

  // Приоритеты (Эйзенхауэр/фильтры)
  importance?: 0 | 1 | 2; // 0=низкая, 1=средняя, 2=высокая
  urgency?: 0 | 1 | 2;

  // Оценка длительности (в минутах)
  estimateMin?: number;

  // Недельный горизонт: “назначено на день”, даже если без времени
  plannedDate?: string; // YYYY-MM-DD

  // Дедлайн (если есть)
  dueDate?: string; // YYYY-MM-DD

  status: TaskStatus;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
  doneAt?: number; // epoch ms
}

export interface ScheduleBlock {
  id: ID;
  taskId: ID;
  date: string; // YYYY-MM-DD
  startMin: number; // минут от начала суток
  endMin: number; // минут от начала суток
  locked?: boolean;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TimeLog {
  id: ID;
  taskId?: ID; // undefined => “поглотитель” или “прочее”
  sinkId?: ID; // если это поглотитель

  date: string; // YYYY-MM-DD
  startTs: number; // epoch ms
  endTs: number; // epoch ms
  durationMin: number;

  abc?: AbcClass; // A/B/C/D для “карточки эффективности”
  note?: string;
  createdAt: number;
}

export type EventType =
  | "task_created"
  | "task_updated"
  | "task_done"
  | "task_archived"
  | "task_planned_date_set"
  | "block_created"
  | "block_moved"
  | "block_deleted"
  | "timelog_created"
  | "timelog_updated"
  | "backup_exported";

export interface EventLog {
  id: ID;
  ts: number; // epoch ms
  type: EventType;
  taskId?: ID;
  payload?: Record<string, unknown>;
}

export interface Tag {
  id: ID;
  name: string;
  color?: string; // пока строка, позже можно нормализовать
  createdAt: number;
}

export interface Context {
  id: ID;
  name: string;
  color?: string;
  createdAt: number;
}

/** Поглотители времени (как отдельный справочник) */
export interface Sink {
  id: ID;
  name: string;
  color?: string;
  createdAt: number;
}

export interface Goal {
  id: ID;
  title: string;
  horizon?: "month" | "quarter" | "year" | "multi-year";
  metric?: string; // как измеряем (текстом)
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: ID;
  title: string;
  goalId?: ID;
  deadline?: string; // YYYY-MM-DD
  note?: string;
  status: "active" | "paused" | "done" | "archived";
  createdAt: number;
  updatedAt: number;
}

/** Настройки приложения */
export interface Settings {
  id: "singleton";

  // Рабочие часы для сетки
  dayStartMin: number; // напр. 8:00 => 480
  dayEndMin: number; // напр. 21:00 => 1260
  gridStepMin: number; // шаг сетки (напр. 15)

  // 60/40 — сколько резервируем (в процентах)
  reservePercent: number; // напр. 40

  // Бэкап-напоминание
  backupRemindDays: number; // напр. 7
  lastBackupAt?: number; // epoch ms
}

/**
 * Dexie DB
 */
export class TMDatabase extends Dexie {
  tasks!: Table<Task, ID>;
  scheduleBlocks!: Table<ScheduleBlock, ID>;
  timeLogs!: Table<TimeLog, ID>;
  eventLogs!: Table<EventLog, ID>;

  tags!: Table<Tag, ID>;
  contexts!: Table<Context, ID>;
  sinks!: Table<Sink, ID>;

  goals!: Table<Goal, ID>;
  projects!: Table<Project, ID>;

  settings!: Table<Settings, "singleton">;

  constructor() {
    super("tm_archangel_pwa");

    // Version 1 schema
    this.version(1).stores({
      tasks:
        "id, status, plannedDate, dueDate, projectId, goalId, createdAt, updatedAt",
      scheduleBlocks: "id, date, taskId, startMin, endMin, updatedAt",
      timeLogs: "id, date, taskId, sinkId, startTs, endTs, createdAt",
      eventLogs: "id, ts, type, taskId",

      tags: "id, name, createdAt",
      contexts: "id, name, createdAt",
      sinks: "id, name, createdAt",

      goals: "id, horizon, createdAt, updatedAt",
      projects: "id, status, goalId, deadline, createdAt, updatedAt",

      settings: "id"
    });

    // Таблицы
    this.tasks = this.table("tasks");
    this.scheduleBlocks = this.table("scheduleBlocks");
    this.timeLogs = this.table("timeLogs");
    this.eventLogs = this.table("eventLogs");

    this.tags = this.table("tags");
    this.contexts = this.table("contexts");
    this.sinks = this.table("sinks");

    this.goals = this.table("goals");
    this.projects = this.table("projects");

    this.settings = this.table("settings");
  }
}

export const db = new TMDatabase();

/**
 * Инициализация дефолтных настроек (один раз).
 * Вызывай при старте приложения.
 */
export async function ensureDefaultSettings(): Promise<void> {
  const existing = await db.settings.get("singleton");
  if (existing) return;

  const now = Date.now();
  await db.settings.put({
    id: "singleton",
    dayStartMin: 8 * 60,
    dayEndMin: 21 * 60,
    gridStepMin: 15,
    reservePercent: 40,
    backupRemindDays: 7,
    lastBackupAt: undefined
  });

  // Можно сразу добавить пару дефолтных контекстов/поглотителей (по желанию).
  // Пока не добавляю, чтобы не навязывать.
}

/**
 * Небольшой helper для фиксации событий (EventLog).
 * В дальнейшем вынесем в отдельный repo.
 */
export async function logEvent(e: Omit<EventLog, "id" | "ts"> & { id?: ID; ts?: number }) {
  const id = e.id ?? crypto.randomUUID();
  const ts = e.ts ?? Date.now();
  await db.eventLogs.put({
    id,
    ts,
    type: e.type,
    taskId: e.taskId,
    payload: e.payload
  });
}
