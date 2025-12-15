import { useRef, useState } from "react";
import {
  downloadText,
  exportBackupJson,
  importBackupJson,
  tasksToCsv,
  timeLogsToCsv,
  useAppState
} from "../data/db";

export default function BackupPage() {
  const s = useAppState();
  const [paste, setPaste] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  function downloadBackup() {
    downloadText(`tm-backup-${Date.now()}.json`, exportBackupJson(), "application/json");
  }

  function exportTasksCsv() {
    downloadText(`tm-tasks-${Date.now()}.csv`, tasksToCsv(s.tasks), "text/csv");
  }

  function exportLogsCsv() {
    downloadText(`tm-timelogs-${Date.now()}.csv`, timeLogsToCsv(s.timeLogs), "text/csv");
  }

  async function importFromFile(file: File) {
    const text = await file.text();
    importBackupJson(text);
    alert("Backup imported");
  }

  function importFromPaste() {
    importBackupJson(paste);
    alert("Backup imported");
    setPaste("");
  }

  return (
    <div className="grid gap-3">
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="text-lg font-semibold">Backup</div>
        <div className="text-sm text-slate-400 mt-1">
          Export/Import JSON + CSV для Excel
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-950"
            onClick={downloadBackup}
          >
            Download JSON backup
          </button>
          <button
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm hover:bg-slate-800"
            onClick={exportTasksCsv}
          >
            Export Tasks CSV
          </button>
          <button
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm hover:bg-slate-800"
            onClick={exportLogsCsv}
          >
            Export TimeLogs CSV
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFromFile(f);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <button
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:bg-slate-800"
            onClick={() => fileRef.current?.click()}
          >
            Import JSON file…
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="font-semibold">Import from paste</div>
        <textarea
          className="mt-2 min-h-[160px] w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="Вставь сюда JSON бэкап и нажми Import"
        />
        <button
          className="mt-2 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950"
          onClick={importFromPaste}
          disabled={!paste.trim()}
        >
          Import
        </button>
      </div>
    </div>
  );
}
