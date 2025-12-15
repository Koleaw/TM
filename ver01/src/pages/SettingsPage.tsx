import { useMemo, useState } from "react";
import { setState, useAppState } from "../data/db";

export default function SettingsPage() {
  const s = useAppState();

  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(s.settings.weekStartsOn);
  const [dayStartHour, setDayStartHour] = useState<number>(s.settings.dayStartHour);
  const [dayEndHour, setDayEndHour] = useState<number>(s.settings.dayEndHour);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  function save() {
    setState((st) => ({
      ...st,
      settings: {
        ...st.settings,
        weekStartsOn,
        dayStartHour,
        dayEndHour
      }
    }));
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
      <div className="text-lg font-semibold">Settings</div>
      <div className="text-sm text-slate-400 mt-1">Базовые настройки планирования</div>

      <div className="mt-4 grid gap-3 max-w-lg">
        <label className="grid gap-1">
          <span className="text-sm text-slate-300">Начало недели</span>
          <select
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={weekStartsOn}
            onChange={(e) => setWeekStartsOn(Number(e.target.value) as 0 | 1)}
          >
            <option value={1}>Понедельник</option>
            <option value={0}>Воскресенье</option>
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-slate-300">Начало дня</span>
          <select
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={dayStartHour}
            onChange={(e) => setDayStartHour(Number(e.target.value))}
          >
            {hours.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-slate-300">Конец дня</span>
          <select
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={dayEndHour}
            onChange={(e) => setDayEndHour(Number(e.target.value))}
          >
            {hours.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={save}
          className="mt-2 inline-flex items-center justify-center rounded-lg bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-950"
        >
          Save
        </button>
      </div>
    </div>
  );
}
