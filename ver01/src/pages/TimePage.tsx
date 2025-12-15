import { useMemo, useState } from "react";
import {
  addTimeLogManual,
  deleteTimeLog,
  startTimer,
  stopTimer,
  updateTimeLog,
  useAppState,
} from "../data/db";
import type { TimeLogKind } from "../data/db";

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

function kindLabel(k?: TimeLogKind) {
  const kk: TimeLogKind = k === "sink" || k === "rest" ? k : "useful";
  if (kk === "useful") return "Полезное";
  if (kk === "rest") return "Отдых";
  return "Поглотитель";
}

function inferKindFromTimeTypeId(timeTypeId: string | null): TimeLogKind {
  if (!timeTypeId) return "useful";
  if (timeTypeId === "tt_sink") return "sink";
  if (timeTypeId === "tt_rest" || timeTypeId === "tt_sleep") return "rest";
  return "useful";
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
  const sinks = useMemo(() => s.lists.sinks ?? [], [s.lists.sinks]);

  const timeTypeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of timeTypes) map.set(it.id, it.name);
    return map;
  }, [timeTypes]);

  const sinkNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of sinks) map.set(it.id, it.name);
    return map;
  }, [sinks]);

  // ---- таймер ----
  const active = s.activeTimer;
  const [timerTaskId, setTimerTaskId] = useState<string>("");
  const [timerTimeTypeId, setTimerTimeTypeId] = useState<string>("");

  const [timerKind, setTimerKind] = useState<TimeLogKind>("useful");
  const [timerSinkId, setTimerSinkId] = useState<string>("");

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

  const [manualKind, setManualKind] = useState<TimeLogKind>("useful");
  const [manualSinkId, setManualSinkId] = useState<string>("");

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

  const [editKind, setEditKind] = useState<TimeLogKind>("useful");
  const [editSinkId, setEditSinkId] = useState<string>("");

  const [editStart, setEditStart] = useState<string>("");
  const [editEnd, setEditEnd] = useState<string>("");
  const [editNote, setEditNote] = useState<string>("");

  function beginEdit(logId: string) {
    const l = s.timeLogs.find((x) => x.id === logId);
    if (!l) return;

    setEditingId(l.id);
    setEditTaskId(l.taskId ?? "");
    setEditTimeTypeId(l.timeTypeId ?? "");

    const k: TimeLogKind =
      l.kind === "sink" || l.kind === "rest" || l.kind === "useful"
        ? l.kind
        : inferKindFromTimeTypeId(l.timeTypeId ?? null);

    setEditKind(k);
    setEditSinkId(l.sinkId ?? "");

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
      kind: editKind,
      sinkId: editKind === "sink" ? (editSinkId ? editSinkId : null) : null,
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

    for (const [, arr] of groups) {
      arr.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
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

          <div className="grid gap-2">
            <div className="grid gap-1">
              <div className="text-xs text-slate-400">Тип времени</div>
              <select
                className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
                value={timerTimeTypeId}
                onChange={(e) => {
                  const next = e.target.value;
                  setTimerTimeTypeId(next);

                  const inferred = inferKindFromTimeTypeId(next || null);
                  setTimerKind(inferred);
                  if (inferred !== "sink") setTimerSinkId("");
                }}
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

            <div className="grid gap-1">
              <div className="text-xs text-slate-400">Класс (для честной аналитики)</div>
              <select
                className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
                value={timerKind}
                onChange={(e) => {
                  const k = e.target.value as TimeLogKind;
                  setTimerKind(k);
                  if (k !== "sink") setTimerSinkId("");
                }}
                disabled={!!active}
              >
                <option value="useful">Полезное</option>
                <option value="rest">Отдых</option>
                <option value="sink">Поглотитель</option>
              </select>
            </div>

            {timerKind === "sink" ? (
              <div className="grid gap-1">
                <div className="text-xs text-slate-400">Какой поглотитель</div>
                <select
                  className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
                  value={timerSinkId}
                  onChange={(e) => setTimerSinkId(e.target.value)}
                  disabled={!!active}
                >
                  <option value="">(не выбран)</option>
                  {sinks.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
                {sinks.length === 0 ? (
                  <div className="text-xs text-slate-500">
                    Список пуст — добавь “Поглотители” в Manage.
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {!active ? (
            <button
              className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950"
              onClick={() =>
                startTimer(
                  timerTaskId || null,
                  timerTimeTypeId || null,
                  timerKind,
                  timerKind === "sink" ? (timerSinkId || null) : null
                )
              }
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
              onChange={(e) => {
                const next = e.target.value;
                setManualTimeTypeId(next);

                const inferred = inferKindFromTimeTypeId(next || null);
                setManualKind(inferred);
                if (inferred !== "sink") setManualSinkId("");
              }}
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
            <div className="text-xs text-slate-400">Класс</div>
            <select
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
              value={manualKind}
              onChange={(e) => {
                const k = e.target.value as TimeLogKind;
                setManualKind(k);
                if (k !== "sink") setManualSinkId("");
              }}
            >
              <option value="useful">Полезное</option>
              <option value="rest">Отдых</option>
              <option value="sink">Поглотитель</option>
            </select>
          </div>

          {manualKind === "sink" ? (
            <div className="grid gap-1">
              <div className="text-xs text-slate-400">Поглотитель</div>
              <select
                className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
                value={manualSinkId}
                onChange={(e) => setManualSinkId(e.target.value)}
              >
                <option value="">(не выбран)</option>
                {sinks.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name}
                  </option>
                ))}
              </select>
              {sinks.length === 0 ? (
                <div className="text-xs text-slate-500">
                  Список пуст — добавь “Поглотители” в Manage.
                </div>
              ) : null}
            </div>
          ) : null}

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
                kind: manualKind,
                sinkId: manualKind === "sink" ? (manualSinkId ? manualSinkId : null) : null,
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
                  <table className="min-w-[1180px] w-full text-sm">
                    <thead className="bg-slate-950">
                      <tr className="text-left text-slate-400">
                        <th className="p-2">Начало</th>
                        <th className="p-2">Окончание</th>
                        <th className="p-2">Интервал</th>
                        <th className="p-2">Тип</th>
                        <th className="p-2">Класс</th>
                        <th className="p-2">Поглотитель</th>
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
                        const typeTitle = l.timeTypeId
                          ? timeTypeNameById.get(l.timeTypeId) ?? "тип удалён"
                          : "—";

                        const kk: TimeLogKind =
                          l.kind === "sink" || l.kind === "rest" || l.kind === "useful"
                            ? l.kind
                            : inferKindFromTimeTypeId(l.timeTypeId ?? null);

                        const sinkTitle =
                          kk === "sink"
                            ? (l.sinkId ? (sinkNameById.get(l.sinkId) ?? "поглотитель удалён") : "(не выбран)")
                            : "—";

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
                                <td className="p-2 text-slate-200">{kindLabel(kk)}</td>
                                <td className="p-2 text-slate-200">{sinkTitle}</td>
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
                                    onChange={(e) => {
                                      const next = e.target.value;
                                      setEditTimeTypeId(next);

                                      const inferred = inferKindFromTimeTypeId(next || null);
                                      setEditKind(inferred);
                                      if (inferred !== "sink") setEditSinkId("");
                                    }}
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
                                    value={editKind}
                                    onChange={(e) => {
                                      const k = e.target.value as TimeLogKind;
                                      setEditKind(k);
                                      if (k !== "sink") setEditSinkId("");
                                    }}
                                  >
                                    <option value="useful">Полезное</option>
                                    <option value="rest">Отдых</option>
                                    <option value="sink">Поглотитель</option>
                                  </select>
                                </td>

                                <td className="p-2">
                                  {editKind === "sink" ? (
                                    <select
                                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs"
                                      value={editSinkId}
                                      onChange={(e) => setEditSinkId(e.target.value)}
                                    >
                                      <option value="">(не выбран)</option>
                                      {sinks.map((it) => (
                                        <option key={it.id} value={it.id}>
                                          {it.name}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <div className="text-xs text-slate-500">—</div>
                                  )}
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
