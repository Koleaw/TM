import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addPlanMonthTask,
  addPlanWeekTask,
  addPlanYearTask,
  deletePlanTask,
  getWeekStart,
  movePlanTaskToMonth,
  movePlanTaskToToday,
  movePlanTaskToWeek,
  PlanLocation,
  PlanTask,
  todayYMD,
  updatePlanTask,
  useAppState,
  weekDays,
  ymdAddDays,
} from "../data/db";

const MONTH_NAMES = [
  "Янв",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Июн",
  "Июл",
  "Авг",
  "Сен",
  "Окт",
  "Ноя",
  "Дек",
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymdFromDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthKey(year: number, monthIndex: number) {
  return `${year}-${pad2(monthIndex + 1)}`;
}

function priorityBadge(priority: 1 | 2 | 3) {
  if (priority === 1) return "bg-emerald-600 text-emerald-50";
  if (priority === 3) return "bg-pink-500 text-pink-50";
  return "bg-amber-500 text-amber-950";
}

function PlanTaskCard({
  task,
  loc,
  onMoveToToday,
  moveTargets,
  onMove,
}: {
  task: PlanTask;
  loc: PlanLocation;
  onMoveToToday: () => void;
  moveTargets?: { months?: string[]; weeks?: string[] };
  onMove?: (payload: { month?: string; weekStart?: string; day?: string }) => void;
}) {
  const [selectedMonth, setSelectedMonth] = useState(moveTargets?.months?.[0] ?? "");
  const [selectedWeek, setSelectedWeek] = useState(moveTargets?.weeks?.[0] ?? "");
  const [selectedDay, setSelectedDay] = useState(selectedWeek ? weekDays(selectedWeek)[0] : todayYMD());

  const dayOptions = selectedWeek ? weekDays(selectedWeek) : [];

  useEffect(() => {
    if (moveTargets?.weeks?.length) {
      const nextWeek = moveTargets.weeks[0];
      setSelectedWeek(nextWeek);
      setSelectedDay(weekDays(nextWeek)[0]);
    }
  }, [moveTargets?.weeks]);

  useEffect(() => {
    if (selectedWeek) {
      setSelectedDay((d) => (weekDays(selectedWeek).includes(d) ? d : weekDays(selectedWeek)[0]));
    }
  }, [selectedWeek]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 grid gap-3 min-w-0">
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${priorityBadge(task.priority)}`}
              >
                P{task.priority}
              </span>
              <div className="text-sm font-semibold break-words">{task.title || "Без названия"}</div>
            </div>
            {task.note ? <div className="text-xs text-slate-400 whitespace-pre-wrap">{task.note}</div> : null}
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              {task.estimateMin ? <span>Оценка: {task.estimateMin} мин</span> : null}
              {task.deadlineDate ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-0.5 text-rose-200">
                  ⏰ дедлайн {task.deadlineDate}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              onClick={() => {
                const nextTitle = prompt("Редактировать название", task.title);
                if (nextTitle !== null) updatePlanTask(loc, { title: nextTitle });
                const nextNote = prompt("Редактировать заметку", task.note ?? "");
                if (nextNote !== null) updatePlanTask(loc, { note: nextNote });
              }}
              className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs hover:bg-slate-800"
            >
              Редактировать
            </button>
            <select
              value={task.priority}
              onChange={(e) => updatePlanTask(loc, { priority: Number(e.target.value) as 1 | 2 | 3 })}
              className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs"
            >
              <option value={1}>Высокий</option>
              <option value={2}>Средний</option>
              <option value={3}>Низкий</option>
            </select>
            <input
              value={task.estimateMin ?? ""}
              onChange={(e) => updatePlanTask(loc, { estimateMin: e.target.value ? Number(e.target.value) : null })}
              inputMode="numeric"
              className="w-20 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs"
              placeholder="Мин"
            />
            <input
              type="date"
              value={task.deadlineDate ?? ""}
              onChange={(e) => updatePlanTask(loc, { deadlineDate: e.target.value || null })}
              className="w-32 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs"
            />
            <button
              onClick={onMoveToToday}
              className="rounded-lg border border-emerald-500 bg-emerald-600/10 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-600/20"
            >
              В Сегодня
            </button>
            <button
              onClick={() => deletePlanTask(loc)}
              className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs hover:bg-slate-800"
            >
              Удалить
            </button>
          </div>
        </div>
      </div>

      {onMove ? (
        <div className="flex flex-wrap gap-2 text-xs items-center">
          {moveTargets?.months?.length ? (
            <>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1"
              >
                {moveTargets.months.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <button
                onClick={() => onMove({ month: selectedMonth })}
                className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 hover:bg-slate-900"
              >
                В месяц
              </button>
            </>
          ) : null}

          {moveTargets?.weeks?.length ? (
            <>
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1"
              >
                {moveTargets.weeks.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
              <select
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1"
              >
                {dayOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <button
                onClick={() => onMove({ weekStart: selectedWeek, day: selectedDay })}
                className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 hover:bg-slate-900"
              >
                В неделю
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PlanTaskForm({
  onSubmit,
  placeholder,
}: {
  placeholder: string;
  onSubmit: (payload: {
    title: string;
    note: string;
    priority: 1 | 2 | 3;
    estimateMin: number | null;
    deadlineDate: string | null;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const [estimate, setEstimate] = useState("");
  const [deadline, setDeadline] = useState("");

  return (
    <div className="grid gap-2 min-w-0">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm min-w-0"
      />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Заметка (опционально)"
        className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm min-w-0"
      />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[auto_auto_auto_1fr] md:items-center">
        <select
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value) as 1 | 2 | 3)}
          className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-sm"
        >
          <option value={1}>Высокий</option>
          <option value={2}>Средний</option>
          <option value={3}>Низкий</option>
        </select>
        <input
          value={estimate}
          onChange={(e) => setEstimate(e.target.value)}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="Оценка (мин)"
          className="w-28 rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-sm"
        />
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-sm"
        />
        <button
          onClick={() => {
            const trimmed = title.trim();
            if (!trimmed) return;
            onSubmit({
              title: trimmed,
              note: note.trim(),
              priority,
              estimateMin: estimate ? Number(estimate) : null,
              deadlineDate: deadline || null,
            });
            setTitle("");
            setNote("");
            setEstimate("");
            setPriority(2);
            setDeadline("");
          }}
          className="rounded-lg border border-emerald-500 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-600/20"
        >
          Добавить
        </button>
      </div>
    </div>
  );
}

function YearView({ year }: { year: number }) {
  const s = useAppState();
  const yearKey = String(year);
  const yearList = s.plans.year[yearKey] ?? [];
  const monthKeys = useMemo(() => MONTH_NAMES.map((_, idx) => monthKey(year, idx)), [year]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
        <div className="text-lg font-semibold">Фокус года</div>
        <PlanTaskForm
          placeholder="Добавить задачу года"
          onSubmit={({ title, note, priority, estimateMin, deadlineDate }) =>
            addPlanYearTask(yearKey, { title, note, priority, estimateMin, deadlineDate })
          }
        />
        <div className="grid gap-2">
          {yearList.length === 0 ? (
            <div className="text-sm text-slate-500">Пока нет задач на год</div>
          ) : (
            yearList.map((task) => (
              <PlanTaskCard
                key={task.id}
                task={task}
                loc={{ level: "year", year: yearKey, id: task.id }}
                onMoveToToday={() =>
                  movePlanTaskToToday({ level: "year", year: yearKey, id: task.id })
                }
                moveTargets={{ months: monthKeys }}
                onMove={({ month }) =>
                  month && movePlanTaskToMonth({ level: "year", year: yearKey, id: task.id }, month)
                }
              />
            ))
          )}
        </div>
      </div>

      <div className="grid gap-3">
        <div className="text-lg font-semibold">Месяцы {year}</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {MONTH_NAMES.map((name, idx) => {
            const mKey = monthKey(year, idx);
            const monthList = s.plans.month[mKey] ?? [];
            return (
              <div key={mKey} className="rounded-xl border border-slate-800 bg-slate-950 p-3 grid gap-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{name} {year}</div>
                  <Link
                    to="/today"
                    className="text-[11px] text-emerald-300 hover:text-emerald-200"
                  >
                    Перенести через Сегодня
                  </Link>
                </div>
                <PlanTaskForm
                  placeholder={`Добавить задачу на ${name}`}
                  onSubmit={({ title, note, priority, estimateMin, deadlineDate }) =>
                    addPlanMonthTask(mKey, { title, note, priority, estimateMin, deadlineDate })
                  }
                />
                <div className="grid gap-2">
                  {monthList.length === 0 ? (
                    <div className="text-xs text-slate-500">Задач нет</div>
                  ) : (
                    monthList.map((task) => (
                      <PlanTaskCard
                        key={task.id}
                        task={task}
                        loc={{ level: "month", month: mKey, id: task.id }}
                        onMoveToToday={() =>
                          movePlanTaskToToday({ level: "month", month: mKey, id: task.id })
                        }
                        moveTargets={{ weeks: [] }}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function buildMonthWeeks(year: number, monthIndex: number, weekStartsOn: 0 | 1) {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  const start = getWeekStart(ymdFromDate(first), weekStartsOn);
  const weeks: string[] = [];
  let cursor = start;
  while (true) {
    weeks.push(cursor);
    const [y, m, d] = cursor.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + 7);
    const next = ymdFromDate(dt);
    if (dt > last && dt.getMonth() !== monthIndex) break;
    cursor = next;
    if (weeks.length > 6) break;
  }
  return weeks;
}

function MonthView({ year, monthIndex }: { year: number; monthIndex: number }) {
  const s = useAppState();
  const monthLabel = `${MONTH_NAMES[monthIndex]} ${year}`;
  const monthKeyValue = monthKey(year, monthIndex);
  const monthList = s.plans.month[monthKeyValue] ?? [];
  const weekStarts = useMemo(
    () => buildMonthWeeks(year, monthIndex, s.settings.weekStartsOn),
    [monthIndex, s.settings.weekStartsOn, year]
  );

  return (
    <div className="grid gap-6">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 grid gap-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-lg font-semibold">Фокус месяца {monthLabel}</div>
            <div className="text-xs text-slate-400">Месяц → недели → Сегодня</div>
        </div>
        <PlanTaskForm
          placeholder={`Добавить задачу в месяц (${monthLabel})`}
          onSubmit={({ title, note, priority, estimateMin, deadlineDate }) =>
            addPlanMonthTask(monthKeyValue, { title, note, priority, estimateMin, deadlineDate })
          }
        />
        <div className="grid gap-2">
          {monthList.length === 0 ? (
            <div className="text-sm text-slate-500">Задач на месяц пока нет</div>
          ) : (
            monthList.map((task) => (
              <PlanTaskCard
                key={task.id}
                task={task}
                loc={{ level: "month", month: monthKeyValue, id: task.id }}
                onMoveToToday={() =>
                  movePlanTaskToToday({ level: "month", month: monthKeyValue, id: task.id })
                }
                moveTargets={{ weeks: weekStarts }}
                onMove={({ weekStart, day }) => {
                  if (weekStart && day) {
                    movePlanTaskToWeek(
                      { level: "month", month: monthKeyValue, id: task.id },
                      weekStart,
                      day
                    );
                  }
                }}
              />
            ))
          )}
        </div>
      </div>

      <div className="grid gap-3">
        <div className="text-lg font-semibold">Недели внутри {monthLabel}</div>
        <div className="grid gap-3">
          {weekStarts.map((ws) => {
            const days = weekDays(ws);
            return (
            <div key={ws} className="rounded-xl border border-slate-800 bg-slate-950 p-3 grid gap-2 min-w-0">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Неделя от {ws}</div>
                <button
                    onClick={() =>
                      addPlanWeekTask(ws, days[0], {
                        title: "Быстрая задача",
                        priority: 2,
                        estimateMin: null,
                        deadlineDate: null,
                      })
                    }
                    className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs hover:bg-slate-800"
                  >
                    Быстро добавить
                  </button>
                </div>
                <div className="overflow-x-auto pb-1">
                  <div className="grid grid-flow-row grid-cols-4 xl:grid-cols-7 gap-3 min-w-max">
                    {days.map((day) => {
                      const week = s.plans.weeks[ws];
                      const list = week?.days?.[day] ?? [];
                      return (
                        <div
                          key={day}
                          className="rounded-lg border border-slate-900 bg-slate-900/60 p-2 flex flex-col gap-2 min-w-[240px]"
                        >
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span>{day}</span>
                            <button
                              onClick={() =>
                                addPlanWeekTask(ws, day, {
                                  title: "Быстрая задача",
                                  priority: 2,
                                  estimateMin: null,
                                  deadlineDate: null,
                                })
                              }
                              className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 hover:bg-slate-900"
                            >
                              +
                            </button>
                          </div>
                          <PlanTaskForm
                            placeholder="Добавить задачу"
                            onSubmit={({ title, note, priority, estimateMin, deadlineDate }) =>
                              addPlanWeekTask(ws, day, { title, note, priority, estimateMin, deadlineDate })
                            }
                          />
                          {list.length === 0 ? (
                            <div className="text-[11px] text-slate-500">Нет задач</div>
                          ) : (
                            <div className="grid gap-2">
                              {list.map((task) => (
                                <PlanTaskCard
                                  key={task.id}
                                  task={task}
                                  loc={{ level: "week", weekStart: ws, day, id: task.id }}
                                  onMoveToToday={() =>
                                    movePlanTaskToToday({ level: "week", weekStart: ws, day, id: task.id }, day)
                                  }
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeekView({ start }: { start: string }) {
  const s = useAppState();
  const days = weekDays(start);
  const week = s.plans.weeks[start];
  const months = Array.from(new Set(days.map((d) => d.slice(0, 7))));
  const nearbyWeeks = Array.from(new Set([ymdAddDays(start, -7), start, ymdAddDays(start, 7)]));

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Неделя от {start}</div>
        <Link
          to="/today"
          className="rounded-lg border border-emerald-500 bg-emerald-600/10 px-3 py-1 text-sm text-emerald-100 hover:bg-emerald-600/20"
        >
          В Сегодня →
        </Link>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="grid grid-flow-row grid-cols-4 xl:grid-cols-7 gap-4 min-w-max">
          {days.map((day) => {
            const list = week?.days?.[day] ?? [];
            return (
              <div
                key={day}
                className="rounded-xl border border-slate-800 bg-slate-950 p-3 grid gap-2 min-w-[240px]"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{day}</div>
                  <button
                    onClick={() =>
                      addPlanWeekTask(start, day, {
                        title: "Быстрая задача",
                        priority: 2,
                        estimateMin: null,
                        deadlineDate: null,
                      })
                    }
                    className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-xs hover:bg-slate-800"
                  >
                    +
                  </button>
                </div>
                <PlanTaskForm
                  placeholder="Добавить задачу"
                  onSubmit={({ title, note, priority, estimateMin, deadlineDate }) =>
                    addPlanWeekTask(start, day, { title, note, priority, estimateMin, deadlineDate })
                  }
                />
                {list.length === 0 ? (
                  <div className="text-xs text-slate-500">Нет задач</div>
                ) : (
                  <div className="grid gap-2">
                    {list.map((task) => (
                      <PlanTaskCard
                        key={task.id}
                        task={task}
                        loc={{ level: "week", weekStart: start, day, id: task.id }}
                        onMoveToToday={() =>
                          movePlanTaskToToday({ level: "week", weekStart: start, day, id: task.id }, day)
                        }
                        moveTargets={{ weeks: nearbyWeeks, months }}
                        onMove={({ day: nextDay, weekStart: targetWeek, month }) => {
                          if (month) {
                            movePlanTaskToMonth({ level: "week", weekStart: start, day, id: task.id }, month);
                            return;
                          }
                          if (targetWeek && nextDay) {
                            movePlanTaskToWeek(
                              { level: "week", weekStart: start, day, id: task.id },
                              targetWeek,
                              nextDay
                            );
                          }
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type PlanTabKey = "year" | "month" | "week";

function SectionTabs({ value, onChange }: { value: PlanTabKey; onChange: (v: PlanTabKey) => void }) {
  const tabOptions: { key: PlanTabKey; label: string }[] = [
    { key: "year", label: "Год" },
    { key: "month", label: "Месяц" },
    { key: "week", label: "Неделя" },
  ];
  return (
    <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950 p-1 text-sm">
      {tabOptions.map((option) => (
        <button
          key={option.key}
          onClick={() => onChange(option.key)}
          className={`px-3 py-1 rounded-lg transition ${
            value === option.key ? "bg-emerald-500 text-slate-950" : "text-slate-200 hover:bg-slate-900"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function PlansPage() {
  const s = useAppState();
  const today = todayYMD();
  const [tab, setTab] = useState<PlanTabKey>("week");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const baseWeek = getWeekStart(today, s.settings.weekStartsOn);
  const [weekStart, setWeekStart] = useState(baseWeek);

  useEffect(() => {
    setWeekStart(getWeekStart(today, s.settings.weekStartsOn));
  }, [today, s.settings.weekStartsOn]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xl font-semibold">Планы</div>
          <div className="text-sm text-slate-400">Горизонты: год → месяц → неделя → сегодня</div>
        </div>
        <SectionTabs value={tab} onChange={setTab} />
      </div>

      {tab === "year" ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedYear((y) => y - 1)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:bg-slate-900"
            >
              ← {selectedYear - 1}
            </button>
            <div className="text-lg font-semibold">{selectedYear}</div>
            <button
              onClick={() => setSelectedYear((y) => y + 1)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:bg-slate-900"
            >
              {selectedYear + 1} →
            </button>
          </div>
          <YearView year={selectedYear} />
        </div>
      ) : null}

      {tab === "month" ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedMonth((m) => (m === 0 ? 11 : m - 1))}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:bg-slate-900"
            >
              ← {MONTH_NAMES[selectedMonth === 0 ? 11 : selectedMonth - 1]}
            </button>
            <div className="text-lg font-semibold">
              {MONTH_NAMES[selectedMonth]} {selectedYear}
            </div>
            <button
              onClick={() => setSelectedMonth((m) => (m === 11 ? 0 : m + 1))}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:bg-slate-900"
            >
              {MONTH_NAMES[selectedMonth === 11 ? 0 : selectedMonth + 1]} →
            </button>
            <button
              onClick={() => {
                const now = new Date();
                setSelectedYear(now.getFullYear());
                setSelectedMonth(now.getMonth());
              }}
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm hover:bg-slate-800"
            >
              Текущий месяц
            </button>
          </div>
          <MonthView year={selectedYear} monthIndex={selectedMonth} />
        </div>
      ) : null}

      {tab === "week" ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setWeekStart((w) => ymdAddDays(w, -7))}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:bg-slate-900"
            >
              ← Предыдущая неделя
            </button>
            <div className="text-lg font-semibold">{weekStart}</div>
            <button
              onClick={() => setWeekStart((w) => ymdAddDays(w, 7))}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:bg-slate-900"
            >
              Следующая неделя →
            </button>
            <button
              onClick={() => setWeekStart(baseWeek)}
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm hover:bg-slate-800"
            >
              Текущая неделя
            </button>
          </div>
          <WeekView start={weekStart} />
        </div>
      ) : null}
    </div>
  );
}
