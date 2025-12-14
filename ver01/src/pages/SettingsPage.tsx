import { useEffect, useMemo, useState } from "react";
import { db, ensureDefaultSettings, type Settings } from "../data/db";

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function minToHHMM(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function hhmmToMin(s: string) {
  // "08:30"
  const [h, m] = s.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [savedHint, setSavedHint] = useState<string>("");

  async function reload() {
    await ensureDefaultSettings();
    const s = await db.settings.get("singleton");
    if (s) setSettings(s);
  }

  useEffect(() => {
    void reload();

    const handler = () => void reload();
    db.on("changes", handler);
    return () => {
      db.on("changes").unsubscribe(handler);
    };
  }, []);

  const dayLen = useMemo(() => {
    if (!settings) return 0;
    return Math.max(0, settings.dayEndMin - settings.dayStartMin);
  }, [settings]);

  async function update(partial: Partial<Settings>) {
    if (!settings) return;
    const next: Settings = { ...settings, ...partial };

    // валидация/нормализация базовая
    next.dayStartMin = clamp(next.dayStartMin, 0, 23 * 60 + 59);
    next.dayEndMin = clamp(next.dayEndMin, 0, 23 * 60 + 59);

    // если пользователь поставил end <= start — расширим на минимум 1 час
    if (next.dayEndMin <= next.dayStartMin) {
      next.dayEndMin = clamp(next.dayStartMin + 60, 0, 23 * 60 + 59);
    }

    next.gridStepMin = clamp(next.gridStepMin, 5, 60);
    // шаг должен делить 60 “красиво” (иначе сетка неудобная)
    const niceSteps = [5, 10, 15, 20, 30, 60];
    if (!niceSteps.includes(next.gridStepMin)) {
      // выбираем ближайший
      let best = niceSteps[0];
      let bestDiff = Math.abs(best - next.gridStepMin);
      for (const s of niceSteps) {
        const diff = Math.abs(s - next.gridStepMin);
        if (diff < bestDiff) {
          best = s;
          bestDiff = diff;
        }
      }
      next.gridStepMin = best;
    }

    next.reservePercent = clamp(next.reservePercent, 0, 80); // 80% резерва — уже странно, но пусть
    next.backupRemindDays = clamp(next.backupRemindDays, 1, 60);

    await db.settings.put(next);
    setSavedHint("Сохранено");
    window.setTimeout(() => setSavedHint(""), 1200);
  }

  if (!settings) {
    return (
      <div className="p-3 rounded-xl border border-slate-800 bg-slate-950">
        <div className="text-slate-300">Загрузка настроек…</div>
      </div>
    );
  }

  const planPct = clamp(100 - settings.reservePercent, 0, 100);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <div className="text-slate-300 text-sm">
            Эти настройки напрямую влияют на удобство ежедневного планирования и правило 60/40.
          </div>
        </div>
        {savedHint && <div className="text-sm text-emerald-300">{savedHint}</div>}
      </div>

      {/* Workday range */}
      <section className="p-3 rounded-xl border border-slate-800 bg-slate-950 space-y-3">
        <h2 className="font-semibold">Рабочий диапазон дня</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-slate-300">Начало</div>
            <input
              type="time"
              value={minToHHMM(settings.dayStartMin)}
              onChange={(e) => void update({ dayStartMin: hhmmToMin(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <div className="text-sm text-slate-300">Конец</div>
            <input
              type="time"
              value={minToHHMM(settings.dayEndMin)}
              onChange={(e) => void update({ dayEndMin: hhmmToMin(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            />
          </label>

          <div className="space-y-1">
            <div className="text-sm text-slate-300">Длительность</div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200">
              {Math.floor(dayLen / 60)}ч {dayLen % 60}м
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-400">
          Совет: ставь диапазон так, чтобы в него реально попадали твои “плановые” блоки. Остальное — гибко/вне плана.
        </div>
      </section>

      {/* Grid step */}
      <section className="p-3 rounded-xl border border-slate-800 bg-slate-950 space-y-3">
        <h2 className="font-semibold">Сетка времени</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-slate-300">Шаг сетки (мин)</div>
            <select
              value={settings.gridStepMin}
              onChange={(e) => void update({ gridStepMin: parseInt(e.target.value, 10) })}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </label>

          <div className="space-y-1">
            <div className="text-sm text-slate-300">Подсказка</div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200">
              15–30 мин обычно самый удобный шаг
            </div>
          </div>
        </div>
      </section>

      {/* 60/40 rule */}
      <section className="p-3 rounded-xl border border-slate-800 bg-slate-950 space-y-3">
        <h2 className="font-semibold">Правило 60/40</h2>

        <div className="text-sm text-slate-300">
          Резерв: <span className="font-semibold text-slate-50">{settings.reservePercent}%</span>{" "}
          <span className="text-slate-400">(планируешь жёстко примерно {planPct}%)</span>
        </div>

        <input
          type="range"
          min={0}
          max={60}
          value={settings.reservePercent}
          onChange={(e) => void update({ reservePercent: parseInt(e.target.value, 10) })}
          className="w-full"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <div className="text-slate-300">Рекомендованный лимит жёстких блоков</div>
            <div className="mt-1 text-slate-50 font-semibold">
              {Math.round((dayLen * planPct) / 100)} мин
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <div className="text-slate-300">Резерв (на непредвиденное)</div>
            <div className="mt-1 text-slate-50 font-semibold">
              {Math.round((dayLen * settings.reservePercent) / 100)} мин
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-400">
          Если регулярно “не успеваешь”, чаще всего проблема не в дисциплине, а в том, что резерв слишком маленький.
        </div>
      </section>

      {/* Backup reminder */}
      <section className="p-3 rounded-xl border border-slate-800 bg-slate-950 space-y-3">
        <h2 className="font-semibold">Бэкап и сохранность</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-slate-300">Напоминать о бэкапе каждые (дни)</div>
            <input
              type="number"
              min={1}
              max={60}
              value={settings.backupRemindDays}
              onChange={(e) => void update({ backupRemindDays: parseInt(e.target.value || "7", 10) })}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            />
          </label>

          <div className="space-y-1">
            <div className="text-sm text-slate-300">Последний бэкап</div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200">
              {settings.lastBackupAt ? format(new Date(settings.lastBackupAt), "dd.MM.yyyy HH:mm") : "—"}
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-400">
          Рекомендация: делай JSON+Excel минимум раз в неделю или перед крупными изменениями/обновлениями.
        </div>
      </section>

      <div className="text-xs text-slate-500">
        Следующий шаг: ReviewPage (утро/вечер/weekly review) — чтобы ритуалы были “по шагам” и реально выполнялись.
      </div>
    </div>
  );
}
