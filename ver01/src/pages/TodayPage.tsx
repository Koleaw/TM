import { useEffect, useMemo, useRef, useState } from "react";
import {
  createTask,
  startTimer,
  stopTimer,
  todayYMD,
  updateTask,
  useAppState,
  type ID,
  type TimeLogKind,
} from "../data/db";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtHM(ms: number) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtDuration(mins: number) {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h <= 0) return `${r} мин`;
  if (r === 0) return `${h} ч`;
  return `${h} ч ${r} мин`;
}

function kindLabel(k?: TimeLogKind) {
  if (k === "sink") return "Поглотитель";
  if (k === "rest") return "Восстановление";
  return "Полезное";
}

const LS_LAST_TASK = "tm.lastTaskId";
const LS_LAST_PAUSE_KIND = "tm.lastPauseKind";
const LS_LAST_SINK_ID = "tm.lastSinkId";

function readLS(key: string) {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeLS(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export default function TodayPage() {
  const s = useAppState();
  const today = todayYMD();

  const active = s.activeTimer;

  const [note, setNote] = useState("");
  const [pauseOpen, setPauseOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [sinkPickOpen, setSinkPickOpen] = useState(false);

  const pauseRef = useRef<HTMLDivElement | null>(null);
  const switchRef = useRef<HTMLDivElement | null>(null);

  // outside click close
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (pauseRef.current && !pauseRef.current.contains(t)) {
        setPauseOpen(false);
        setSinkPickOpen(false);
      }
      if (switchRef.current && !switchRef.current.contains(t)) setSwitchOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const elapsedMin = useMemo(() => {
    if (!active) return 0;
    const diff = Date.now() - active.startedAt;
    return Math.max(0, Math.floor(diff / 60000));
  }, [active]);

  const tasksToday = useMemo(() => {
    return [...s.tasks]
      .filter((t) => t.plannedDate === today && t.status !== "done")
      .sort((a, b) => (b.updatedAt - a.updatedAt));
  }, [s.tasks, today]);

  const hardToday = useMemo(() => {
    return tasksToday
      .filter((t) => !!t.plannedStart)
      .sort((a, b) => String(a.plannedStart).localeCompare(String(b.plannedStart)));
  }, [tasksToday]);

  const flexToday = useMemo(() => {
    return tasksToday
      .filter((t) => !t.plannedStart)
      .sort((a, b) => (b.updatedAt - a.updatedAt));
  }, [tasksToday]);

  const taskTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of s.tasks) map.set(t.id, t.title);
    return map;
  }, [s.tasks]);

  const sinks = useMemo(() => s.lists.sinks ?? [], [s.lists.sinks]);

  function safeStop() {
    stopTimer(note);
    setNote("");
  }

  function switchToTask(taskId: ID | null) {
    // if there's an active timer, we close it into a log first
    if (active) {
      // remember last real task to enable "resume"
      if (active.taskId) writeLS(LS_LAST_TASK, active.taskId);
      stopTimer(note);
      setNote("");
    }
    // start new
    startTimer(taskId, null, "useful", null);
    setSwitchOpen(false);
  }

  function doPause(kind: TimeLogKind, sinkId: ID | null = null) {
    // remember previous task for resume
    if (active?.taskId) writeLS(LS_LAST_TASK, active.taskId);

    // persist last choices (so main pause click doesn't require thinking)
    writeLS(LS_LAST_PAUSE_KIND, kind);
    if (sinkId) writeLS(LS_LAST_SINK_ID, sinkId);

    if (active) {
      stopTimer(note);
      setNote("");
    }
    startTimer(null, null, kind, sinkId);
    setPauseOpen(false);
    setSinkPickOpen(false);
    setSwitchOpen(false);
  }

  function quickPause() {
    const k = (readLS(LS_LAST_PAUSE_KIND) as TimeLogKind) || "rest";
    if (k === "sink") {
      const sid = readLS(LS_LAST_SINK_ID);
      doPause("sink", sid ? (sid as ID) : null);
      return;
    }
    doPause(k);
  }

  function resumeLast() {
    const last = readLS(LS_LAST_TASK);
    if (!last) return;
    switchToTask(last as ID);
  }

  // quick add (optional but handy)
  const [newFlex, setNewFlex] = useState("");
  const [newHard, setNewHard] = useState("");
  const [newHardTime, setNewHardTime] = useState("11:00");

  function addFlex() {
    const title = newFlex.trim();
    if (!title) return;
    createTask(title, { plannedDate: today, plannedStart: null });
    setNewFlex("");
  }

  function addHard() {
    const title = newHard.trim();
    if (!title) return;
    const id = createTask(title, { plannedDate: today, plannedStart: newHardTime });
    // по умолчанию можно сразу считать "жесткой" (plannedStart уже есть)
    updateTask(id, { plannedStart: newHardTime });
    setNewHard("");
  }

  const activeTitle = useMemo(() => {
    if (!active) return "простой";
    if (active.taskId) return taskTitleById.get(active.taskId) ?? "задача удалена";
    return `Пауза • ${kindLabel(active.kind)}`;
  }, [active, taskTitleById]);

  const isPaused = !!active && !active.taskId;

  return (
    <div className="grid gap-3">
      {/* TIMER (top, main interaction) */}
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-lg font-semibold">Сегодня</div>
            <div className="text-sm text-slate-400">
              Таймер: <span className="text-slate-200">{activeTitle}</span>
              {active ? (
                <span className="ml-2 text-slate-500">
                  с {fmtHM(active.startedAt)} • {fmtDuration(elapsedMin)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {active ? (
              <>
                {/* STOP */}
                <button
                  className="h-10 rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-slate-950"
                  onClick={safeStop}
                >
                  Стоп
                </button>

                {/* PAUSE split */}
                <div className="relative" ref={pauseRef}>
                  <div className="inline-flex overflow-hidden rounded-lg border border-slate-800">
                    <button
                      className="h-10 bg-slate-950 px-4 text-sm font-semibold text-slate-200 hover:bg-slate-900"
                      onClick={quickPause}
                      title="Пауза последним выбранным классом"
                    >
                      Пауза
                    </button>
                    <button
                      className="h-10 bg-slate-950 px-3 text-sm text-slate-200 hover:bg-slate-900"
                      onClick={() => setPauseOpen((v) => !v)}
                      title="Выбрать класс паузы"
                    >
                      ▾
                    </button>
                  </div>

                  {pauseOpen ? (
                    <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-slate-800 bg-slate-950 p-2 shadow">
                      <button
                        className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-900"
                        onClick={() => doPause("useful")}
                      >
                        Полезное (меня дернули)
                      </button>
                      <button
                        className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-900"
                        onClick={() => doPause("rest")}
                      >
                        Восстановление (перерыв)
                      </button>
                      <button
                        className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-900"
                        onClick={() => {
                          if (sinks.length > 0) setSinkPickOpen((v) => !v);
                          else doPause("sink", null);
                        }}
                      >
                        Поглотитель {sinks.length > 0 ? " (выбрать…)" : ""}
                      </button>

                      {sinkPickOpen && sinks.length > 0 ? (
                        <div className="mt-2 rounded-md border border-slate-800 bg-slate-900 p-2">
                          <div className="mb-2 text-xs text-slate-400">Какой именно?</div>
                          <div className="grid gap-1">
                            {sinks.map((it) => (
                              <button
                                key={it.id}
                                className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-800"
                                onClick={() => doPause("sink", it.id)}
                              >
                                {it.name}
                              </button>
                            ))}
                            <button
                              className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-800"
                              onClick={() => doPause("sink", null)}
                              title="Если не хочешь уточнять"
                            >
                              (без уточнения)
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {/* SWITCH */}
                <div className="relative" ref={switchRef}>
                  <button
                    className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm hover:bg-slate-900"
                    onClick={() => setSwitchOpen((v) => !v)}
                    title="Быстро переключиться на другую задачу"
                  >
                    ⇄
                  </button>

                  {switchOpen ? (
                    <div className="absolute right-0 z-20 mt-2 w-[320px] rounded-lg border border-slate-800 bg-slate-950 p-2 shadow">
                      <div className="px-2 pb-2 text-xs text-slate-400">Переключиться на:</div>

                      <button
                        className="mb-1 w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-900"
                        onClick={() => switchToTask(null)}
                      >
                        (без привязки)
                      </button>

                      <div className="grid max-h-[320px] gap-1 overflow-auto pr-1">
                        {tasksToday.map((t) => (
                          <button
                            key={t.id}
                            className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-900"
                            onClick={() => switchToTask(t.id)}
                          >
                            {t.title}
                            {t.plannedStart ? (
                              <span className="ml-2 text-xs text-slate-500">• {t.plannedStart}</span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-400">Таймер не запущен — стартуй задачу ниже</div>
            )}
          </div>
        </div>

        {active ? (
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr,auto] md:items-end">
            <div className="grid gap-1">
              <div className="text-xs text-slate-400">
                Комментарий (добавится при Стоп; можно оставить пустым)
              </div>
              <input
                className="h-10 rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Что делал / контекст / результат"
              />
            </div>

            {isPaused ? (
              <button
                className="h-10 rounded-lg bg-slate-200 px-4 text-sm font-semibold text-slate-950 disabled:opacity-40"
                onClick={resumeLast}
                disabled={!readLS(LS_LAST_TASK)}
                title="Остановит паузу и запустит прошлую задачу"
              >
                Продолжить прошлую
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* PLAN */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* HARD */}
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold">Жёсткие задачи</div>
            <div className="text-xs text-slate-500">plannedStart ≠ null</div>
          </div>

          <div className="mt-3 flex gap-2">
            <input
              className="h-10 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm"
              value={newHard}
              onChange={(e) => setNewHard(e.target.value)}
              placeholder="Новая жёсткая задача…"
              onKeyDown={(e) => {
                if (e.key === "Enter") addHard();
              }}
            />
            <input
              className="h-10 w-[110px] rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm"
              value={newHardTime}
              onChange={(e) => setNewHardTime(e.target.value)}
              placeholder="11:00"
            />
            <button
              className="h-10 rounded-lg bg-slate-200 px-4 text-sm font-semibold text-slate-950"
              onClick={addHard}
            >
              Добавить
            </button>
          </div>

          <div className="mt-3 grid gap-2">
            {hardToday.length === 0 ? (
              <div className="text-sm text-slate-400">Пока пусто</div>
            ) : (
              hardToday.map((t) => {
                const isActive = !!active && active.taskId === t.id;
                return (
                  <div
                    key={t.id}
                    className="rounded-lg border border-slate-800 bg-slate-900 p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-slate-200">
                          {t.title}
                        </div>
                        <div className="text-xs text-slate-500">
                          {t.plannedStart} • {t.estimateMin ? fmtDuration(t.estimateMin) : "без оценки"}
                        </div>
                      </div>

                      <button
                        className={`h-9 rounded-lg px-3 text-sm font-semibold ${
                          isActive
                            ? "bg-emerald-400 text-slate-950"
                            : "border border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-800"
                        }`}
                        onClick={() => switchToTask(t.id)}
                        title="Переключиться на задачу (остановит текущий таймер и запустит этот)"
                      >
                        {isActive ? "Идёт" : "Старт"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* FLEX */}
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold">Гибкие задачи</div>
            <div className="text-xs text-slate-500">plannedStart = null</div>
          </div>

          <div className="mt-3 flex gap-2">
            <input
              className="h-10 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm"
              value={newFlex}
              onChange={(e) => setNewFlex(e.target.value)}
              placeholder="Новая гибкая задача…"
              onKeyDown={(e) => {
                if (e.key === "Enter") addFlex();
              }}
            />
            <button
              className="h-10 rounded-lg bg-slate-200 px-4 text-sm font-semibold text-slate-950"
              onClick={addFlex}
            >
              Добавить
            </button>
          </div>

          <div className="mt-3 grid gap-2">
            {flexToday.length === 0 ? (
              <div className="text-sm text-slate-400">Пока пусто</div>
            ) : (
              flexToday.map((t) => {
                const isActive = !!active && active.taskId === t.id;
                return (
                  <div
                    key={t.id}
                    className="rounded-lg border border-slate-800 bg-slate-900 p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-slate-200">
                          {t.title}
                        </div>
                        <div className="text-xs text-slate-500">
                          {t.estimateMin ? fmtDuration(t.estimateMin) : "без оценки"}
                        </div>
                      </div>

                      <button
                        className={`h-9 rounded-lg px-3 text-sm font-semibold ${
                          isActive
                            ? "bg-emerald-400 text-slate-950"
                            : "border border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-800"
                        }`}
                        onClick={() => switchToTask(t.id)}
                        title="Переключиться на задачу (остановит текущий таймер и запустит этот)"
                      >
                        {isActive ? "Идёт" : "Старт"}
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-800"
                        onClick={() => updateTask(t.id, { plannedStart: "12:00" })}
                        title="Сделать жёсткой (поставить время; потом поправишь)"
                      >
                        Сделать жёсткой
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
