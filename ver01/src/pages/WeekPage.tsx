import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  movePlanTaskToYear,
  PlanLocation,
  PlanTask,
  todayYMD,
  updatePlanTask,
  useAppState,
  weekDays,
  ymdAddDays,
} from "../data/db";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function ymdFromDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKey(year: number, monthIndex: number) {
  const m = String(monthIndex + 1).padStart(2, "0");
  return `${year}-${m}`;
}

function classNames(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

function priorityBadge(priority: 1 | 2 | 3) {
  if (priority === 1) return "bg-emerald-600 text-emerald-50";
  if (priority === 3) return "bg-pink-500 text-pink-50";
  return "bg-amber-500 text-amber-950";
}

type PlanMoveTarget = { weekStart?: string; day?: string; month?: string; year?: string };
type PlanMoveOptions = { weeks?: string[]; months?: string[] };
type PlanAddPayload = { title: string; priority: 1 | 2 | 3; estimateMin: number | null };

function PlanTaskRow({
  task,
  loc,
  onMoveToToday,
  moveTargets,
  onMove,
  extraActions,
}: {
  task: PlanTask;
  loc: PlanLocation;
  onMoveToToday: () => void;
  moveTargets?: PlanMoveOptions;
  onMove?: (target: PlanMoveTarget) => void;
  extraActions?: ReactNode;
}) {
  const [draftDay, setDraftDay] = useState(
    loc.level === "week" ? loc.day : moveTargets?.weeks?.[0] ? weekDays(moveTargets.weeks[0])[0] : todayYMD()
  );
  const [draftWeek, setDraftWeek] = useState(moveTargets?.weeks?.[0] ?? (loc.level === "week" ? loc.weekStart : ""));
  const [draftMonth, setDraftMonth] = useState(moveTargets?.months?.[0] ?? "");

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 grid gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              className={classNames(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                priorityBadge(task.priority)
              )}
            >
              P{task.priority}
            </span>
            <div className="text-sm font-semibold break-words">{task.title || "Без названия"}</div>
          </div>
          {task.note ? <div className="text-xs text-slate-400 whitespace-pre-wrap">{task.note}</div> : null}
          {task.estimateMin ? (
            <div className="text-[11px] text-slate-400">{task.estimateMin} мин</div>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const updated = prompt("Edit title", task.title);
              if (updated !== null) {
                updatePlanTask(loc, { title: updated });
              }
            }}
            className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-900"
          >
            Edit
          </button>
          <button
            onClick={onMoveToToday}
            className="rounded-lg border border-emerald-500 text-emerald-100 bg-emerald-600/10 px-2 py-1 text-xs hover:bg-emerald-600/20"
          >
            To Today
          </button>
          <button
            onClick={() => deletePlanTask(loc)}
            className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-900"
          >
            Delete
          </button>
          {extraActions}
        </div>
      </div>

      {onMove ? (
        <div className="flex flex-wrap gap-2 text-xs items-center">
          {moveTargets?.weeks?.length ? (
            <>
              <select
                value={draftWeek}
                onChange={(e) => {
                  const nextWeek = e.target.value;
                  setDraftWeek(nextWeek);
                  const days = nextWeek ? weekDays(nextWeek) : [];
                  setDraftDay(days[0] ?? "");
                }}
                className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1"
              >
                {moveTargets.weeks.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
              <select
                value={draftDay}
                onChange={(e) => setDraftDay(e.target.value)}
                className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1"
              >
                {(draftWeek ? weekDays(draftWeek) : []).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <button
                onClick={() => onMove({ weekStart: draftWeek, day: draftDay })}
                className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 hover:bg-slate-900"
              >
                Move to week
              </button>
            </>
          ) : null}
          {moveTargets?.months?.length ? (
            <>
              <select
                value={draftMonth}
                onChange={(e) => setDraftMonth(e.target.value)}
                className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1"
              >
                {moveTargets.months.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <button
                onClick={() => onMove({ month: draftMonth })}
                className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 hover:bg-slate-900"
              >
                Move to month
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AddPlanForm({ placeholder, onSubmit }: { placeholder: string; onSubmit: (payload: PlanAddPayload) => void }) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const [estimate, setEstimate] = useState("");

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-[200px] rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
      />
      <select
        value={priority}
        onChange={(e) => setPriority(Number(e.target.value) as 1 | 2 | 3)}
        className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-sm"
      >
        <option value={1}>Priority 1</option>
        <option value={2}>Priority 2</option>
        <option value={3}>Priority 3</option>
      </select>
      <input
        value={estimate}
        onChange={(e) => setEstimate(e.target.value)}
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="Est (min)"
        className="w-24 rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-sm"
      />
      <button
        onClick={() => {
          if (!title.trim()) return;
          const trimmedEstimate = estimate.trim();
          onSubmit({
            title: title.trim(),
            priority,
            estimateMin: trimmedEstimate ? Number(trimmedEstimate) : null,
          });
          setTitle("");
          setEstimate("");
        }}
        className="rounded-lg border border-emerald-500 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-600/20"
      >
        Add
      </button>
    </div>
  );
}

function YearView({ year, weeks }: { year: number; weeks: string[] }) {
  const s = useAppState();
  const yearKey = String(year);
  const yearList = s.plans.year[yearKey] ?? [];
  const monthKeys = useMemo(() => MONTH_NAMES.map((_, idx) => monthKey(year, idx)), [year]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <div className="text-lg font-semibold">Year focus</div>
        <AddPlanForm
          placeholder="Add yearly focus"
          onSubmit={({ title, priority, estimateMin }) =>
            addPlanYearTask(yearKey, { title, priority, estimateMin })
          }
        />
        <div className="grid gap-2">
          {yearList.length === 0 ? (
            <div className="text-sm text-slate-500">No year items yet</div>
          ) : (
            yearList.map((task) => (
              <PlanTaskRow
                key={task.id}
                task={task}
                loc={{ level: "year", year: yearKey, id: task.id }}
                onMoveToToday={() => movePlanTaskToToday({ level: "year", year: yearKey, id: task.id })}
                moveTargets={{ months: monthKeys }}
                onMove={({ month }) => month && movePlanTaskToMonth({ level: "year", year: yearKey, id: task.id }, month)}
              />
            ))
          )}
        </div>
      </div>

      <div className="grid gap-3">
        <div className="text-lg font-semibold">Months</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {MONTH_NAMES.map((name, idx) => {
            const mKey = monthKey(year, idx);
            const monthList = s.plans.month[mKey] ?? [];
            return (
              <div key={mKey} className="rounded-xl border border-slate-800 bg-slate-950 p-3 grid gap-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">
                    {name} {year}
                  </div>
                  <button
                    onClick={() =>
                      addPlanMonthTask(mKey, { title: "New item", priority: 2, estimateMin: null })
                    }
                    className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs hover:bg-slate-800"
                  >
                    Quick add
                  </button>
                </div>
                <AddPlanForm
                  placeholder={`Add to ${name}`}
                  onSubmit={({ title, priority, estimateMin }) =>
                    addPlanMonthTask(mKey, { title, priority, estimateMin })
                  }
                />
                <div className="grid gap-2">
                  {monthList.length === 0 ? (
                    <div className="text-xs text-slate-500">No items</div>
                  ) : (
                    monthList.map((task) => (
                      <PlanTaskRow
                        key={task.id}
                        task={task}
                        loc={{ level: "month", month: mKey, id: task.id }}
                        onMoveToToday={() =>
                          movePlanTaskToToday({ level: "month", month: mKey, id: task.id })
                        }
                        moveTargets={{ weeks, months: monthKeys }}
                        onMove={(target) => {
                          if (target.weekStart && target.day)
                            movePlanTaskToWeek({ level: "month", month: mKey, id: task.id }, target.weekStart, target.day);
                          if (target.month)
                            movePlanTaskToMonth({ level: "month", month: mKey, id: task.id }, target.month);
                        }}
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

function weekStartsForMonth(year: number, monthIndex: number, weekStartsOn: 0 | 1) {
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const firstWeekStart = new Date(getWeekStart(ymdFromDate(firstDay), weekStartsOn));
  const starts: string[] = [];

  let cursor = firstWeekStart;
  while (cursor <= lastDay || cursor.getMonth() === monthIndex) {
    starts.push(ymdFromDate(cursor));
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
    if (starts.length > 7) break;
  }

  return starts;
}

function MonthView({ year, monthIndex }: { year: number; monthIndex: number }) {
  const s = useAppState();
  const settings = s.settings;
  const mKey = monthKey(year, monthIndex);
  const yearKey = String(year);
  const monthList = s.plans.month[mKey] ?? [];
  const weekStarts = weekStartsForMonth(year, monthIndex, settings.weekStartsOn);
  const monthLabel = `${MONTH_NAMES[monthIndex]} ${year}`;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">{monthLabel}</div>
        <Link
          to="/today"
          className="rounded-lg border border-emerald-500 bg-emerald-600/10 px-3 py-1 text-sm text-emerald-100 hover:bg-emerald-600/20"
        >
          Go to Today →
        </Link>
      </div>

      <div className="grid gap-3">
        <AddPlanForm
          placeholder={`Add month focus for ${monthLabel}`}
          onSubmit={({ title, priority, estimateMin }) =>
            addPlanMonthTask(mKey, { title, priority, estimateMin })
          }
        />
        <div className="grid gap-2">
          {monthList.length === 0 ? (
            <div className="text-sm text-slate-500">No month items yet</div>
          ) : (
            monthList.map((task) => (
              <PlanTaskRow
                key={task.id}
                task={task}
                loc={{ level: "month", month: mKey, id: task.id }}
                onMoveToToday={() => movePlanTaskToToday({ level: "month", month: mKey, id: task.id })}
                moveTargets={{ weeks: weekStarts }}
                onMove={(target) => {
                  if (target.weekStart && target.day)
                    movePlanTaskToWeek({ level: "month", month: mKey, id: task.id }, target.weekStart, target.day);
                }}
                extraActions={
                  <button
                    onClick={() => movePlanTaskToYear({ level: "month", month: mKey, id: task.id }, yearKey)}
                    className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-900"
                  >
                    To Year
                  </button>
                }
              />
            ))
          )}
        </div>
      </div>

      <div className="grid gap-3">
        <div className="text-lg font-semibold">Weeks inside {monthLabel}</div>
        <div className="grid gap-3 lg:grid-cols-2">
          {weekStarts.map((ws) => {
            const days = weekDays(ws);
            return (
              <div key={ws} className="rounded-xl border border-slate-800 bg-slate-950 p-3 grid gap-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Week of {ws}</div>
                  <button
                    onClick={() => addPlanWeekTask(ws, days[0], { title: "New task", priority: 2, estimateMin: null })}
                    className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs hover:bg-slate-800"
                  >
                    Quick add
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {days.map((day) => {
                    const week = s.plans.weeks[ws];
                    const list = week?.days?.[day] ?? [];
                    return (
                      <div key={day} className="rounded-lg border border-slate-900 bg-slate-900/60 p-2 grid gap-2">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span>{day}</span>
                          <button
                            onClick={() =>
                              addPlanWeekTask(ws, day, { title: "Quick task", priority: 2, estimateMin: null })
                            }
                            className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 hover:bg-slate-900"
                          >
                            +
                          </button>
                        </div>
                        {list.length === 0 ? (
                          <div className="text-[11px] text-slate-500">No tasks</div>
                        ) : (
                          <div className="grid gap-2">
                            {list.map((task) => (
                              <PlanTaskRow
                                key={task.id}
                                task={task}
                                loc={{ level: "week", weekStart: ws, day, id: task.id }}
                                onMoveToToday={() =>
                                  movePlanTaskToToday({ level: "week", weekStart: ws, day, id: task.id }, day)
                                }
                                moveTargets={{ weeks: weekStarts }}
                                onMove={(target) => {
                                  if (target.weekStart && target.day) {
                                    movePlanTaskToWeek(
                                      { level: "week", weekStart: ws, day, id: task.id },
                                      target.weekStart,
                                      target.day
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
        <div className="text-lg font-semibold">Week of {start}</div>
        <Link
          to="/today"
          className="rounded-lg border border-emerald-500 bg-emerald-600/10 px-3 py-1 text-sm text-emerald-100 hover:bg-emerald-600/20"
        >
          Go to Today →
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-7 gap-3">
        {days.map((day) => {
          const list = week?.days?.[day] ?? [];
          return (
            <div key={day} className="rounded-xl border border-slate-800 bg-slate-950 p-3 grid gap-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{day}</div>
                <button
                  onClick={() => addPlanWeekTask(start, day, { title: "New task", priority: 2, estimateMin: null })}
                  className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-xs hover:bg-slate-800"
                >
                  +
                </button>
              </div>
              <AddPlanForm
                placeholder="Add task"
                onSubmit={({ title, priority, estimateMin }) =>
                  addPlanWeekTask(start, day, { title, priority, estimateMin })
                }
              />
              {list.length === 0 ? (
                <div className="text-xs text-slate-500">No tasks</div>
              ) : (
                <div className="grid gap-2">
                  {list.map((task) => (
                    <PlanTaskRow
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
                        if (targetWeek && nextDay)
                          movePlanTaskToWeek(
                            { level: "week", weekStart: start, day, id: task.id },
                            targetWeek,
                            nextDay
                          );
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
  );
}

type PlanTabKey = "year" | "month" | "week";

function SectionTabs({ value, onChange }: { value: PlanTabKey; onChange: (v: PlanTabKey) => void }) {
  const tabOptions: { key: PlanTabKey; label: string }[] = [
    { key: "year", label: "Year" },
    { key: "month", label: "Month" },
    { key: "week", label: "Week" },
  ];
  return (
    <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950 p-1 text-sm">
      {tabOptions.map((option) => (
        <button
          key={option.key}
          onClick={() => onChange(option.key)}
          className={
            "px-3 py-1 rounded-lg transition " +
            (value === option.key ? "bg-emerald-500 text-slate-950" : "text-slate-200 hover:bg-slate-900")
          }
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

  const horizonWeeks = useMemo(
    () => Array.from({ length: 6 }, (_, i) => ymdAddDays(baseWeek, i * 7)),
    [baseWeek]
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xl font-semibold">Plans</div>
          <div className="text-sm text-slate-400">MSA horizons: Year → Month → Week → Today</div>
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
          <YearView year={selectedYear} weeks={horizonWeeks} />
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
              Today month
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
              ← Prev week
            </button>
            <div className="text-lg font-semibold">{weekStart}</div>
            <button
              onClick={() => setWeekStart((w) => ymdAddDays(w, 7))}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm hover:bg-slate-900"
            >
              Next week →
            </button>
            <button
              onClick={() => setWeekStart(baseWeek)}
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm hover:bg-slate-800"
            >
              This week
            </button>
          </div>
          <WeekView start={weekStart} />
        </div>
      ) : null}
    </div>
  );
}
