import { useEffect, useMemo, useState } from "react";
import { db, ensureDefaultSettings, logEvent } from "../data/db";

type BackupPayload = {
  app: string;
  version: number;
  createdAt: number;

  // tables
  tasks?: any[];
  timeLogs?: any[];
  scheduleBlocks?: any[];
  tags?: any[];
  sinks?: any[];
  settings?: any[];
  events?: any[];
};

function downloadText(filename: string, content: string, mime = "application/json") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCSV(rows: Record<string, any>[]) {
  if (!rows.length) return "";
  const headers = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );

  const esc = (v: any) => {
    const s = v === null || v === undefined ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };

  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(","));
  return lines.join("\n");
}

function safeParseJSON(text: string): { ok: true; value: any } | { ok: false; error: string } {
  try {
    const v = JSON.parse(text);
    return { ok: true, value: v };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "JSON parse error" };
  }
}

function validateBackup(v: any): { ok: true; value: BackupPayload } | { ok: false; error: string } {
  if (!v || typeof v !== "object") return { ok: false, error: "Файл не похож на backup (не объект)." };
  if (v.app !== "tm-local-first") return { ok: false, error: "Это не backup от этого приложения (app mismatch)." };
  if (typeof v.version !== "number") return { ok: false, error: "Некорректный version." };
  if (typeof v.createdAt !== "number") return { ok: false, error: "Некорректный createdAt." };

  // tables are optional, but if present must be arrays
  const arrKeys = ["tasks", "timeLogs", "scheduleBlocks", "tags", "sinks", "settings", "events"];
  for (const k of arrKeys) {
    if (k in v && !Array.isArray(v[k])) return { ok: false, error: `Поле ${k} должно быть массивом.` };
  }

  return { ok: true, value: v as BackupPayload };
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function BackupPage() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const [fileInfo, setFileInfo] = useState<string>("");
  const [pending, setPending] = useState<BackupPayload | null>(null);
  const [restoreMode, setRestoreMode] = useState<"merge" | "overwrite">("overwrite");
  const [restoreLog, setRestoreLog] = useState<string>("");

  async function reloadStats() {
    await ensureDefaultSettings();

    // Some tables might not exist in your db.ts (events for example) — check safely.
    const counts: Record<string, number> = {};

    counts.tasks = (await db.tasks.count()) as any;
    counts.timeLogs = (await db.timeLogs.count()) as any;
    counts.scheduleBlocks = (await db.scheduleBlocks.count()) as any;
    counts.tags = (await db.tags.count()) as any;
    counts.sinks = (await db.sinks.count()) as any;

    // settings is usually one row, but count anyway
    if ((db as any).settings?.count) counts.settings = await (db as any).settings.count();

    if ((db as any).events?.count) counts.events = await (db as any).events.count();

    setStats(counts);
  }

  useEffect(() => {
    void reloadStats();
    const handler = () => void reloadStats();
    db.on("changes", handler);
    return () => {
      db.on("changes").unsubscribe(handler);
    };
  }, []);

  const pendingSummary = useMemo(() => {
    if (!pending) return null;
    const c = (arr?: any[]) => (Array.isArray(arr) ? arr.length : 0);
    return {
      createdAt: new Date(pending.createdAt).toLocaleString(),
      tasks: c(pending.tasks),
      timeLogs: c(pending.timeLogs),
      scheduleBlocks: c(pending.scheduleBlocks),
      tags: c(pending.tags),
      sinks: c(pending.sinks),
      settings: c(pending.settings),
      events: c(pending.events)
    };
  }, [pending]);

  async function makeBackup() {
    setBusy(true);
    setRestoreLog("");
    try {
      await ensureDefaultSettings();

      const payload: BackupPayload = {
        app: "tm-local-first",
        version: 1,
        createdAt: Date.now(),

        tasks: await db.tasks.toArray(),
        timeLogs: await db.timeLogs.toArray(),
        scheduleBlocks: await db.scheduleBlocks.toArray(),
        tags: await db.tags.toArray(),
        sinks: await db.sinks.toArray()
      };

      if ((db as any).settings?.toArray) payload.settings = await (db as any).settings.toArray();
      if ((db as any).events?.toArray) payload.events = await (db as any).events.toArray();

      const name = `tm-backup_${new Date(payload.createdAt).toISOString().slice(0, 19).replaceAll(":", "-")}.json`;
      downloadText(name, JSON.stringify(payload, null, 2), "application/json");

      await logEvent({ type: "backup_exported", payload: { name, createdAt: payload.createdAt } });
    } finally {
      setBusy(false);
    }
  }

  async function exportTimeLogsCSV() {
    setBusy(true);
    setRestoreLog("");
    try {
      const rows = await db.timeLogs.toArray();
      // flatten basic fields to keep Excel-friendly
      const flat = rows.map((l: any) => ({
        id: l.id,
        date: l.date,
        taskId: l.taskId ?? "",
        sinkId: l.sinkId ?? "",
        abc: l.abc ?? "",
        durationMin: l.durationMin ?? "",
        startTs: l.startTs ?? "",
        endTs: l.endTs ?? "",
        note: l.note ?? "",
        createdAt: l.createdAt ?? ""
      }));
      downloadText(`timeLogs.csv`, toCSV(flat), "text/csv");
      await logEvent({ type: "export_csv", payload: { table: "timeLogs" } });
    } finally {
      setBusy(false);
    }
  }

  async function exportTasksCSV() {
    setBusy(true);
    setRestoreLog("");
    try {
      const rows = await db.tasks.toArray();
      const flat = rows.map((t: any) => ({
        id: t.id,
        title: t.title,
        status: t.status ?? "",
        plannedDate: t.plannedDate ?? "",
        dueDate: t.dueDate ?? "",
        abc: t.abc ?? "",
        estimateMin: t.estimateMin ?? "",
        tagIds: Array.isArray(t.tagIds) ? t.tagIds.join("|") : "",
        description: t.description ?? "",
        createdAt: t.createdAt ?? "",
        updatedAt: t.updatedAt ?? "",
        doneAt: t.doneAt ?? ""
      }));
      downloadText(`tasks.csv`, toCSV(flat), "text/csv");
      await logEvent({ type: "export_csv", payload: { table: "tasks" } });
    } finally {
      setBusy(false);
    }
  }

  async function onPickFile(file: File | null) {
    setPending(null);
    setFileInfo("");
    setRestoreLog("");

    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      setFileInfo("Файл должен быть .json");
      return;
    }

    const text = await file.text();
    const parsed = safeParseJSON(text);
    if (!parsed.ok) {
      setFileInfo(`Ошибка JSON: ${parsed.error}`);
      return;
    }

    const valid = validateBackup(parsed.value);
    if (!valid.ok) {
      setFileInfo(`Неверный backup: ${valid.error}`);
      return;
    }

    setPending(valid.value);
    setFileInfo(`Готов к восстановлению: ${file.name}`);
  }

  async function restore() {
    if (!pending) return;

    const ok = confirm(
      restoreMode === "overwrite"
        ? "Восстановить в режиме OVERWRITE?\n\nЭто очистит текущие данные в приложении и заменит их данными из файла."
        : "Восстановить в режиме MERGE?\n\nЭто добавит/обновит записи (upsert), не удаляя текущие."
    );
    if (!ok) return;

    setBusy(true);
    setRestoreLog("");
    try {
      const b = pending;

      const hasEvents = Boolean((db as any).events);
      const hasSettings = Boolean((db as any).settings);

      // Dexie transaction: include only existing tables
      const tables: any[] = [db.tasks, db.timeLogs, db.scheduleBlocks, db.tags, db.sinks];
      if (hasSettings) tables.push((db as any).settings);
      if (hasEvents) tables.push((db as any).events);

      await (db as any).transaction("rw", ...tables, async () => {
        if (restoreMode === "overwrite") {
          // clear first
          await db.tasks.clear();
          await db.timeLogs.clear();
          await db.scheduleBlocks.clear();
          await db.tags.clear();
          await db.sinks.clear();
          if (hasSettings) await (db as any).settings.clear();
          if (hasEvents) await (db as any).events.clear();
        }

        // upsert
        if (Array.isArray(b.tags) && b.tags.length) await db.tags.bulkPut(b.tags as any);
        if (Array.isArray(b.sinks) && b.sinks.length) await db.sinks.bulkPut(b.sinks as any);
        if (Array.isArray(b.tasks) && b.tasks.length) await db.tasks.bulkPut(b.tasks as any);
        if (Array.isArray(b.timeLogs) && b.timeLogs.length) await db.timeLogs.bulkPut(b.timeLogs as any);
        if (Array.isArray(b.scheduleBlocks) && b.scheduleBlocks.length) await db.scheduleBlocks.bulkPut(b.scheduleBlocks as any);

        if (hasSettings && Array.isArray(b.settings) && b.settings.length) await (db as any).settings.bulkPut(b.settings);
        if (hasEvents && Array.isArray(b.events) && b.events.length) await (db as any).events.bulkPut(b.events);
      });

      await logEvent({
        type: "backup_restored",
        payload: {
          mode: restoreMode,
          createdAt: b.createdAt,
          counts: {
            tasks: b.tasks?.length ?? 0,
            timeLogs: b.timeLogs?.length ?? 0,
            scheduleBlocks: b.scheduleBlocks?.length ?? 0,
            tags: b.tags?.length ?? 0,
            sinks: b.sinks?.length ?? 0
          }
        }
      });

      setRestoreLog("Восстановление выполнено. Проверь Today/Week/Time/Analytics.");
      setPending(null);
      setFileInfo("");
      await reloadStats();
    } catch (e: any) {
      setRestoreLog(`Ошибка восстановления: ${e?.message ?? String(e)}`);
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
            Данные хранятся локально (IndexedDB). Если чистить данные браузера/переустанавливать — можно потерять.
            Поэтому: делай backup раз в неделю/перед важными изменениями.
          </div>
        </div>
      </div>

      {/* Current stats */}
      <section className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Сейчас в базе</div>
          <button
            onClick={() => void reloadStats()}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs"
          >
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          {Object.entries(stats).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
              <div className="text-xs text-slate-400">{k}</div>
              <div className="text-lg font-semibold">{v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Export */}
      <section className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-3">
        <div className="font-semibold">Экспорт</div>

        <div className="flex flex-col md:flex-row gap-2">
          <button
            disabled={busy}
            onClick={() => void makeBackup()}
            className={cx(
              "px-4 py-2 rounded-lg text-sm font-semibold",
              busy ? "bg-slate-800 text-slate-400" : "bg-slate-50 text-slate-950 hover:bg-white"
            )}
          >
            Download backup JSON
          </button>

          <button
            disabled={busy}
            onClick={() => void exportTasksCSV()}
            className={cx(
              "px-4 py-2 rounded-lg text-sm font-semibold",
              busy ? "bg-slate-800 text-slate-400" : "bg-slate-900 border border-slate-800 text-slate-100"
            )}
          >
            Tasks CSV (Excel)
          </button>

          <button
            disabled={busy}
            onClick={() => void exportTimeLogsCSV()}
            className={cx(
              "px-4 py-2 rounded-lg text-sm font-semibold",
              busy ? "bg-slate-800 text-slate-400" : "bg-slate-900 border border-slate-800 text-slate-100"
            )}
          >
            TimeLogs CSV (Excel)
          </button>
        </div>

        <div className="text-xs text-slate-500">
          JSON = полный слепок для восстановления. CSV = для анализа в Excel/PowerBI.
        </div>
      </section>

      {/* Restore */}
      <section className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-3">
        <div className="font-semibold">Восстановление</div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label className="space-y-1">
            <div className="text-sm text-slate-300">Файл backup (.json)</div>
            <input
              type="file"
              accept="application/json,.json"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
              onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
          </label>

          <label className="space-y-1">
            <div className="text-sm text-slate-300">Режим</div>
            <select
              value={restoreMode}
              onChange={(e) => setRestoreMode(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
              disabled={busy}
            >
              <option value="overwrite">OVERWRITE (заменить всё)</option>
              <option value="merge">MERGE (объединить/upsert)</option>
            </select>
          </label>

          <button
            disabled={busy || !pending}
            onClick={() => void restore()}
            className={cx(
              "px-4 py-2 rounded-lg text-sm font-semibold",
              busy || !pending ? "bg-slate-800 text-slate-400" : "bg-emerald-200 text-emerald-950"
            )}
          >
            Restore
          </button>
        </div>

        <div className="text-sm text-slate-300">{fileInfo || "Выбери файл, чтобы увидеть предпросмотр."}</div>

        {pendingSummary && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <div className="text-sm font-semibold">Предпросмотр</div>
            <div className="text-xs text-slate-400 mt-1">backup создан: {pendingSummary.createdAt}</div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-sm">
              {Object.entries(pendingSummary)
                .filter(([k]) => k !== "createdAt")
                .map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <div className="text-xs text-slate-400">{k}</div>
                    <div className="text-lg font-semibold">{v as any}</div>
                  </div>
                ))}
            </div>

            <div className="text-xs text-slate-500 mt-2">
              OVERWRITE полезен, если хочешь “точно как в backup”. MERGE полезен, если хочешь объединить несколько устройств.
            </div>
          </div>
        )}

        {restoreLog ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-sm">{restoreLog}</div>
        ) : null}
      </section>

      <div className="text-xs text-slate-500">
        Чтобы эта страница появилась в меню, нужно добавить роут <span className="text-slate-300">/backup</span> в App.tsx.
        Следующим файлом дам правку App.tsx (и кнопку в навигации).
      </div>
    </div>
  );
}
