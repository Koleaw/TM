import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { db, ensureDefaultSettings, logEvent, type Settings } from "../data/db";

type BackupMode = "replace" | "merge";

type BackupMeta = {
  schemaVersion: number;
  exportedAt: number;
  appName: string;
  appVersion: string;
};

type BackupTables = {
  tasks: unknown[];
  scheduleBlocks: unknown[];
  timeLogs: unknown[];
  eventLogs: unknown[];
  tags: unknown[];
  contexts: unknown[];
  sinks: unknown[];
  goals: unknown[];
  projects: unknown[];
  settings: unknown[]; // массив, но внутри ожидаем singleton
};

type BackupPayload = {
  meta: BackupMeta;
  tables: BackupTables;
};

function niceTs(ts?: number) {
  if (!ts) return "—";
  return format(new Date(ts), "dd.MM.yyyy HH:mm");
}

function fileStamp(ts: number) {
  return format(new Date(ts), "yyyyMMdd_HHmm");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function basicValidateBackup(x: unknown): x is BackupPayload {
  if (!isObject(x)) return false;
  const meta = (x as any).meta;
  const tables = (x as any).tables;
  if (!isObject(meta) || !isObject(tables)) return false;

  const okMeta =
    typeof meta.schemaVersion === "number" &&
    typeof meta.exportedAt === "number" &&
    typeof meta.appName === "string" &&
    typeof meta.appVersion === "string";

  if (!okMeta) return false;

  const keys: (keyof BackupTables)[] = [
    "tasks",
    "scheduleBlocks",
    "timeLogs",
    "eventLogs",
    "tags",
    "contexts",
    "sinks",
    "goals",
    "projects",
    "settings"
  ];

  for (const k of keys) {
    if (!Array.isArray((tables as any)[k])) return false;
  }
  return true;
}

async function buildBackupPayload(): Promise<BackupPayload> {
  const schemaVersion = 1;
  const exportedAt = Date.now();

  const [
    tasks,
    scheduleBlocks,
    timeLogs,
    eventLogs,
    tags,
    contexts,
    sinks,
    goals,
    projects,
    settings
  ] = await Promise.all([
    db.tasks.toArray(),
    db.scheduleBlocks.toArray(),
    db.timeLogs.toArray(),
    db.eventLogs.toArray(),
    db.tags.toArray(),
    db.contexts.toArray(),
    db.sinks.toArray(),
    db.goals.toArray(),
    db.projects.toArray(),
    db.settings.toArray()
  ]);

  return {
    meta: {
      schemaVersion,
      exportedAt,
      appName: "TM Archangel PWA",
      appVersion: "0.0.1"
    },
    tables: {
      tasks,
      scheduleBlocks,
      timeLogs,
      eventLogs,
      tags,
      contexts,
      sinks,
      goals,
      projects,
      settings
    }
  };
}

export default function BackupPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [importMode, setImportMode] = useState<BackupMode>("replace");
  const [importInfo, setImportInfo] = useState<string>("");

  const lastBackupAt = settings?.lastBackupAt;

  const backupHealth = useMemo(() => {
    if (!settings) return { ok: true, msg: "—" };
    const remindDays = settings.backupRemindDays ?? 7;
    if (!settings.lastBackupAt) {
      return { ok: false, msg: "Бэкап ещё ни разу не делался. Очень рекомендую сделать JSON + Excel." };
    }
    const days = Math.floor((Date.now() - settings.lastBackupAt) / (1000 * 60 * 60 * 24));
    if (days >= remindDays) {
      return { ok: false, msg: `Последний бэкап был ${days} дн. назад — пора обновить.` };
    }
    return { ok: true, msg: `Последний бэкап ${days} дн. назад — нормально.` };
  }, [settings]);

  async function reloadSettings() {
    await ensureDefaultSettings();
    const s = await db.settings.get("singleton");
    if (s) setSettings(s);
  }

  useEffect(() => {
    void reloadSettings();

    const handler = () => void reloadSettings();
    db.on("changes", handler);
    return () => {
      db.on("changes").unsubscribe(handler);
    };
  }, []);

  async function markBackupExported(exportedAt: number) {
    await db.settings.update("singleton", { lastBackupAt: exportedAt });
    await logEvent({ type: "backup_exported", payload: { exportedAt } });
  }

  async function exportJson() {
    setBusy(true);
    setImportInfo("");
    try {
      const payload = await buildBackupPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      downloadBlob(blob, `tm_backup_${fileStamp(payload.meta.exportedAt)}.json`);
      await markBackupExported(payload.meta.exportedAt);
    } finally {
      setBusy(false);
    }
  }

  async function exportXlsx() {
    setBusy(true);
    setImportInfo("");
    try {
      const payload = await buildBackupPayload();

      // Динамический импорт, чтобы не грузить xlsx в initial bundle лишний раз
      const XLSX = await import("xlsx");

      const wb = XLSX.utils.book_new();

      const addSheet = (name: string, rows: any[]) => {
        // Делать лист даже пустым — чтобы структура была стабильной
        const ws = XLSX.utils.json_to_sheet(rows ?? []);
        XLSX.utils.book_append_sheet(wb, ws, name);
      };

      addSheet("Tasks", payload.tables.tasks as any[]);
      addSheet("ScheduleBlocks", payload.tables.scheduleBlocks as any[]);
      addSheet("TimeLogs", payload.tables.timeLogs as any[]);
      addSheet("EventLogs", payload.tables.eventLogs as any[]);
      addSheet("Tags", payload.tables.tags as any[]);
      addSheet("Contexts", payload.tables.contexts as any[]);
      addSheet("Sinks", payload.tables.sinks as any[]);
      addSheet("Goals", payload.tables.goals as any[]);
      addSheet("Projects", payload.tables.projects as any[]);
      addSheet("Settings", payload.tables.settings as any[]);

      // метаданные — отдельным листом
      addSheet("Meta", [payload.meta]);

      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([out], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });

      downloadBlob(blob, `tm_export_${fileStamp(payload.meta.exportedAt)}.xlsx`);
      await markBackupExported(payload.meta.exportedAt);
    } finally {
      setBusy(false);
    }
  }

  async function importJsonFile(file: File) {
    setBusy(true);
    setImportInfo("");
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setImportInfo("Ошибка: файл не является корректным JSON.");
        return;
      }

      if (!basicValidateBackup(parsed)) {
        setImportInfo("Ошибка: структура бэкапа не распознана (не похоже на наш формат).");
        return;
      }

      const payload = parsed;

      // Предупреждение
      if (importMode === "replace") {
        const ok = confirm(
          "Импорт в режиме REPLACE удалит текущие данные в приложении и заменит их содержимым бэкапа.\n\n" +
            "Рекомендация: сначала сделай Export JSON текущего состояния.\n\n" +
            "Продолжить?"
        );
        if (!ok) return;
      }

      // Транзакция на все таблицы
      await db.transaction(
        "rw",
        db.tasks,
        db.scheduleBlocks,
        db.timeLogs,
        db.eventLogs,
        db.tags,
        db.contexts,
        db.sinks,
        db.goals,
        db.projects,
        db.settings,
        async () => {
          if (importMode === "replace") {
            await Promise.all([
              db.tasks.clear(),
              db.scheduleBlocks.clear(),
              db.timeLogs.clear(),
              db.eventLogs.clear(),
              db.tags.clear(),
              db.contexts.clear(),
              db.sinks.clear(),
              db.goals.clear(),
              db.projects.clear(),
              db.settings.clear()
            ]);
          }

          // bulkPut = merge по ключу id (обновляет/добавляет)
          await db.tasks.bulkPut(payload.tables.tasks as any[]);
          await db.scheduleBlocks.bulkPut(payload.tables.scheduleBlocks as any[]);
          await db.timeLogs.bulkPut(payload.tables.timeLogs as any[]);
          await db.eventLogs.bulkPut(payload.tables.eventLogs as any[]);
          await db.tags.bulkPut(payload.tables.tags as any[]);
          await db.contexts.bulkPut(payload.tables.contexts as any[]);
          await db.sinks.bulkPut(payload.tables.sinks as any[]);
          await db.goals.bulkPut(payload.tables.goals as any[]);
          await db.projects.bulkPut(payload.tables.projects as any[]);
          await db.settings.bulkPut(payload.tables.settings as any[]);

          // Если после импорта settings по какой-то причине нет — создадим дефолтные
          const s = await db.settings.get("singleton");
          if (!s) {
            await ensureDefaultSettings();
          }
        }
      );

      setImportInfo(
        `Импорт завершён (${importMode.toUpperCase()}). Файл: ${file.name}. Экспортирован: ${niceTs(
          (payload as any).meta.exportedAt
        )}`
      );
    } catch (e: any) {
      setImportInfo(`Ошибка импорта: ${e?.message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Backup</h1>
          <div className="text-slate-300 text-sm">
            Без облака твоя надёжность = локальная БД + регулярные бэкапы (JSON) + выгрузка для анализа (Excel).
          </div>
        </div>
      </div>

      {/* Health */}
      <div className="p-3 rounded-xl border border-slate-800 bg-slate-950">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm">
            Последний бэкап: <span className="font-semibold">{niceTs(lastBackupAt)}</span>
          </div>
          {settings && (
            <div className="text-xs text-slate-400">
              Напоминать каждые {settings.backupRemindDays} дн.
            </div>
          )}
        </div>

        <div className={`mt-2 text-sm ${backupHealth.ok ? "text-slate-300" : "text-amber-300"}`}>
          {backupHealth.msg}
        </div>
      </div>

      {/* Export */}
      <div className="p-3 rounded-xl border border-slate-800 bg-slate-950">
        <h2 className="font-semibold">Экспорт</h2>
        <div className="mt-2 flex flex-col sm:flex-row gap-2">
          <button
            disabled={busy}
            onClick={() => void exportJson()}
            className="px-4 py-2 rounded-lg bg-slate-50 text-slate-950 text-sm font-semibold hover:bg-white disabled:opacity-50"
          >
            Export JSON (бэкап)
          </button>
          <button
            disabled={busy}
            onClick={() => void exportXlsx()}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-100 text-sm font-semibold hover:bg-slate-700 disabled:opacity-50"
          >
            Export Excel (.xlsx)
          </button>
        </div>

        <div className="mt-2 text-xs text-slate-400">
          JSON нужен для восстановления “как было”. Excel — для анализа в таблицах (сводные, Power Query, BI).
        </div>
      </div>

      {/* Import */}
      <div className="p-3 rounded-xl border border-slate-800 bg-slate-950">
        <h2 className="font-semibold">Импорт</h2>

        <div className="mt-2 flex flex-col sm:flex-row gap-2 sm:items-center">
          <label className="text-sm text-slate-300">Режим:</label>
          <select
            value={importMode}
            onChange={(e) => setImportMode(e.target.value as BackupMode)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            disabled={busy}
          >
            <option value="replace">REPLACE (полное восстановление)</option>
            <option value="merge">MERGE (объединить с текущими)</option>
          </select>

          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              void importJsonFile(f);
              // allow re-select same file
              e.currentTarget.value = "";
            }}
            className="text-sm"
          />
        </div>

        <div className="mt-2 text-xs text-slate-400">
          REPLACE — если переносишься на новый телефон/после сброса. MERGE — если хочешь “слить” две базы.
        </div>

        {importInfo && (
          <div className="mt-3 p-3 rounded-lg border border-slate-800 bg-slate-900/40 text-sm text-slate-200">
            {importInfo}
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500">
        Следующий шаг: страница Settings (рабочие часы/шаг сетки/60-40/напоминания) и далее — Review/Analytics.
      </div>
    </div>
  );
}
