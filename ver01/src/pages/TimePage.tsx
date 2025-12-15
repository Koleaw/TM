import { useMemo, useState } from "react";
import {
  addTimeLogManual,
  deleteTimeLog,
  startTimer,
  stopTimer,
  updateTimeLog,
  useAppState,
  addListItem,
  renameListItem,
  removeListItem,
} from "../data/db";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalDateTimeInput(ms: number) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function parseLocalDateTimeInput(v: string) {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function fmtDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

export default function TimePage() {
  const s = useAppState();

  const tasks = useMemo(
    () => [...s.tasks].sort((a, b) => b.updatedAt - a.updatedAt),
    [s.tasks]
  );

  const taskTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of s.tasks) map.set(t.id, t.title);
    return map;
  }, [s.tasks]);

  const timeTypes = useMemo(() => s.lists.timeTypes ?? [], [s.lists.timeTypes]);

  const timeTypeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of timeTypes) map.set(it.id, it.name);
    return map;
  }, [timeTypes]);

  // ---- справочник типов времени (CRUD) ----
  const [newTimeTypeName, setNewTimeTypeName] = useState<string>("");

  function addTimeType() {
    const name = newTimeTypeName.trim();
    if (!name) return;

    const exists = timeTypes.some((x) => x.name.trim().toLowerCase() === name.toLowerCase());
    if (exists) {
      setNewTimeTypeName("");
      return;
    }

    addListItem("timeTypes", name);
    setNewTimeTypeName("");
  }

  // ---- таймер ----
  const active = s.activeTimer;
  const [timerTaskId, setTimerTaskId] = useState<string>("");
  const [timerTimeTypeId, setTimerTimeTypeId] = useState<string>("");
  const [timerNote, setTimerNote] = useState<string>("");

  const elapsedMin = useMemo(() => {
    if (!active) return 0;
    const diff = Date.now() - active.startedAt;
    return Math.max(0, Math.floor(diff / 60000));
  }, [active]);

  // ---- ручное добавление ----
  const nowMs = Date.now();
  const defaultStart = useMemo(() => toLocalDateTimeInput(nowMs - 30 * 60000), [nowMs]);
  const defaultEnd = useMemo(() => toLocalDateTimeInput(nowMs), [nowMs]);

  const [manualTaskId, setManualTaskId] = useState<string>("");
  const [manualTimeTypeId, setManualTimeTypeId] = useState<string>("");
  const [manualStart, setManualStart] = useState<string>(defaultStart);
  const [manualEnd, setManualEnd] = useState<string>(defaultEnd);
  const [manualNote, setManualNote] = useState<string>("");

  const manualStartMs = useMemo(() => parseLocalDateTimeInput(manualStart), [manualStart]);
  const manualEndMs = useMemo(() => parseLocalDateTimeInput(manualEnd), [manualEnd]);

  const manualValid =
    Number.isFinite(manualStartMs) && Number.isFinite(manualEndMs) && manualEndMs > manualStartMs;

  const manualMinutes = manualValid
    ? Math.max(1, Math.ceil((manualEndMs - manualStartMs) / 60000))
    : 0;

  // ---- редактирование записи ----
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTaskId, setEditTaskId] = useState<string>("");
  const [editTimeTypeId, setEditTimeTypeId] = useState<string>("");
  const [editStart, setEditStart] = useState<string>("");
  const [editEnd, setEditEnd] = useState<string>("");
  const [editNote, setEditNote] = useState<string>("");

  function beginEdit(logId: string) {
    const l = s.timeLogs.find((x) => x.id === logId);
    if (!l) return;
    setEditingId(l.id);
    setEditTaskId(l.taskId ?? "");
    setEditTimeTypeId(l.timeTypeId ?? "");
    setEditStart(toLocalDateTimeInput(l.startedAt));
    setEditEnd(toLocalDateTimeInput(l.endedAt));
    setEditNote(l.note ?? "");
  }

  function saveEdit() {
    if (!editingId) return;
    const startedAt = parseLocalDateTimeInput(editStart);
    const endedAt = parseLocalDateTimeInput(editEnd);
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) return;

    updateTimeLog(editingId, {
      taskId: editTaskId ? editTaskId : null,
      timeTypeId: editTimeTypeId ? editTimeTypeId : null,
      startedAt,
      endedAt,
      note: editNote ?? "",
    });

    setEditingId(null);
  }

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof s.timeLogs>();
    for (const l of s.timeLogs) {
      const key = new Date(l.startedAt).toLocaleDateString("ru-RU");
      const arr = groups.get(key) ?? [];
      arr.push(l);
      groups.set(key, arr);
    }
    const entries = Array.from(groups.entries()).sort((a, b) => {
      const a0 = a[1][0]?.startedAt ?? 0;
      const b0 = b[1][0]?.startedAt ?? 0;
      return b0 - a0;
    });
    return entries;
  }, [s.timeLogs]);

  return (
    <div className="grid gap-3">
      {/* Справочник типов времени */}
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="text-lg font-semibold">Типы времени</div>
        <div className="mt-1 text-sm text-slate-400">
          Здесь можно добавлять свои (например: “Работа”, “Саморазвитие”, “Спорт”).
          Удаление не трогает старые логи — у них просто будет “тип удалён” в аналитике.
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="min-w-[260px] flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={newTimeTypeName}
            onChange={(e) => setNewTimeTypeName(e.target.value)}
            placeholder='Новый тип, например "Работа"'
            onKeyDown={(e) => {
              if (e.key === "Enter") addTimeType();
            }}
          />
          <button
            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
            disabled={!newTimeTypeName.trim()}
            onClick={addTimeType}
          >
            Добавить
          </button>
        </div>

        <div className="mt-3 grid gap-2">
          {timeTypes.length === 0 ? (
            <div className="text-sm text-slate-400">Пока пусто</div>
          ) : (
            timeTypes.map((it) => (
              <div
                key={it.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2"
              >
                <input
                  className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                  defaultValue={it.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (!v) return;
                    if (v !== it.name) renameListItem("timeTypes", it.id, v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
                <button
                  className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:bg-slate-800"
                  onClick={() => removeListItem("timeTypes", it.id)}
                  title="Удалить тип"
                >
                  Удалить
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Таймер */}
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="text-lg font-semibold">Таймер</div>

        <div className="mt-3 grid gap-2 md:grid-cols-[1fr,1fr,auto,auto] md:items-end">
          <div className="grid gap-1">
            <div className="text-xs text-slate-400">Привязка к задаче</div>
            <select
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={timerTaskId}
              onChange={(e) => setTimerTaskId(e.target.value)}
              disabled={!!active}
            >
              <option value="">(без привязки)</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1">
            <div className="text-xs text-slate-400">Тип времени</div>
            <select
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={timerTimeTypeId}
              onChange={(e) => setTimerTimeTypeId(e.target.value)}
              disabled={!!active}
            >
              <option value="">(не выбран)</option>
              {timeTypes.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </select>
          </div>

          {!active ? (
            <button
              className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950"
              onClick={() => startTimer(timerTaskId || null, timerTimeTypeId || null)}
            >
              Старт
            </button>
          ) : (
            <button
              className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950"
              onClick={() => {
                stopTimer(timerNote);
                setTimerNote("");
              }}
            >
              Стоп
            </button>
          )}

          <div className="text-sm text-slate-400 md:text-right">
            {active ? `идёт… (${elapsedMin} мин)` : "простой"}
          </div>
        </div>

        {active && (
          <div className="mt-3 grid gap-1">
            <div className="text-xs text-slate-400">Комментарий к записи (добавится при “Стоп”)</div>
            <input
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={timerNote}
              onChange={(e) => setTimerNote(e.target.value)}
              placeholder="Например: правки по чертежу, созвон, дорога…"
            />
          </div>
        )}
      </div>

      {/* Ручное добавление */}
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="text-lg font-semibold">Добавить запись в таймшит</div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="grid gap-1">
            <div className="text-xs text-slate-400">Задача</div>
            <select
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={manualTaskId}
              onChange={(e) => setManualTaskId(e.target.value)}
            >
              <option value="">(без привязки)</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1">
            <div className="text-xs text-slate-400">Тип времени</div>
            <select
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={manualTimeTypeId}
              onChange={(e) => setManualTimeTypeId(e.target.value)}
            >
              <option value="">(не выбран)</option>
              {timeTypes.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1">
            <div className="text-xs text-slate-400">Комментарий</div>
            <input
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={manualNote}
              onChange={(e) => setManualNote(e.target.value)}
              placeholder="Что делал / контекст / результат"
            />
          </div>

          <div className="grid gap-1">
            <div className="text-xs text-slate-400">Начало</div>
            <input
              type="datetime-local"
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={manualStart}
              onChange={(e) => setManualStart(e.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <div className="text-xs text-slate-400">Окончание</div>
            <input
              type="datetime-local"
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={manualEnd}
              onChange={(e) => setManualEnd(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-slate-400">
            {manualValid ? (
              <>
                Длительность: <span className="text-slate-200">{fmtDuration(manualMinutes)}</span>
              </>
            ) : (
              "Укажи корректные начало и окончание (окончание позже начала)."
            )}
          </div>

          <button
            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
            disabled={!manualValid}
            onClick={() => {
              addTimeLogManual({
                taskId: manualTaskId ? manualTaskId : null,
                timeTypeId: manualTimeTypeId ? manualTimeTypeId : null,
                startedAt: manualStartMs,
                endedAt: manualEndMs,
                note: manualNote ?? "",
              });
              setManualNote("");
            }}
          >
            Добавить
          </button>
        </div>
      </div>

      {/* Таблица таймшита */}
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="text-lg font-semibold">Таймшит</div>

        {s.timeLogs.length === 0 ? (
          <div className="mt-2 text-sm text-slate-400">Пока нет записей</div>
        ) : (
          <div className="mt-3 grid gap-4">
            {grouped.map(([day, logs]) => (
              <div key={day} className="grid gap-2">
                <div className="text-sm font-semibold text-slate-200">{day}</div>

                <div className="overflow-x-auto rounded-lg border border-slate-800">
                  <table className="min-w-[900px] w-full text-sm">
                    <thead className="bg-slate-950">
                      <tr className="text-left text-slate-400">
                        <th className="p-2">Начало</th>
                        <th className="p-2">Окончание</th>
                        <th className="p-2">Интервал</th>
                        <th className="p-2">Тип</th>
                        <th className="p-2">Задача</th>
                        <th className="p-2">Комментарий</th>
                        <th className="p-2 w-[170px]">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((l) => {
                        const start = new Date(l.startedAt);
                        const end = new Date(l.endedAt);
                        const taskTitle = l.taskId ? taskTitleById.get(l.taskId) ?? "—" : "—";
                        const typeTitle = l.timeTypeId ? (timeTypeNameById.get(l.timeTypeId) ?? "тип удалён") : "—";
                        const isEditing = editingId === l.id;

                        return (
                          <tr key={l.id} className="border-t border-slate-800">
                            {!isEditing ? (
                              <>
                                <td className="p-2 text-slate-200">
                                  {start.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                                </td>
                                <td className="p-2 text-slate-200">
                                  {end.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                                </td>
                                <td className="p-2 text-slate-200">{fmtDuration(l.minutes)}</td>
                                <td className="p-2 text-slate-200">{typeTitle}</td>
                                <td className="p-2 text-slate-200">{taskTitle}</td>
                                <td className="p-2 text-slate-200">{l.note || ""}</td>
                                <td className="p-2">
                                  <div className="flex items-center gap-2">
                                    <button
                                      className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-800"
                                      onClick={() => beginEdit(l.id)}
                                    >
                                      Правка
                                    </button>
                                    <button
                                      className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-800"
                                      onClick={() => deleteTimeLog(l.id)}
                                    >
                                      Удалить
                                    </button>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="p-2">
                                  <input
                                    type="datetime-local"
                                    className="w-full rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs"
                                    value={editStart}
                                    onChange={(e) => setEditStart(e.target.value)}
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    type="datetime-local"
                                    className="w-full rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs"
                                    value={editEnd}
                                    onChange={(e) => setEditEnd(e.target.value)}
                                  />
                                </td>
                                <td className="p-2 text-slate-200">
                                  {(() => {
                                    const a = parseLocalDateTimeInput(editStart);
                                    const b = parseLocalDateTimeInput(editEnd);
                                    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return "—";
                                    const mins = Math.max(1, Math.ceil((b - a) / 60000));
                                    return fmtDuration(mins);
                                  })()}
                                </td>

                                <td className="p-2">
                                  <select
                                    className="w-full rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs"
                                    value={editTimeTypeId}
                                    onChange={(e) => setEditTimeTypeId(e.target.value)}
                                  >
                                    <option value="">(не выбран)</option>
                                    {timeTypes.map((it) => (
                                      <option key={it.id} value={it.id}>
                                        {it.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>

                                <td className="p-2">
                                  <select
                                    className="w-full rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs"
                                    value={editTaskId}
                                    onChange={(e) => setEditTaskId(e.target.value)}
                                  >
                                    <option value="">(без привязки)</option>
                                    {tasks.map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.title}
                                      </option>
                                    ))}
                                  </select>
                                </td>

                                <td className="p-2">
                                  <input
                                    className="w-full rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs"
                                    value={editNote}
                                    onChange={(e) => setEditNote(e.target.value)}
                                    placeholder="Комментарий"
                                  />
                                </td>

                                <td className="p-2">
                                  <div className="flex items-center gap-2">
                                    <button
                                      className="rounded-lg bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-950"
                                      onClick={saveEdit}
                                    >
                                      Сохранить
                                    </button>
                                    <button
                                      className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-800"
                                      onClick={() => setEditingId(null)}
                                    >
                                      Отмена
                                    </button>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
