import { useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  addPlanTask,
  addPlanWeekTask,
  deletePlanTask,
  getWeekStart,
  movePlanTaskToMonth,
  movePlanTaskToToday,
  movePlanTaskToWeek,
  movePlanTaskToYear,
  movePlanTaskWithinWeek,
  PlanLocation,
  PlanTask,
  todayYMD,
  updatePlanTask,
  useAppState,
  weekDays,
  ymdAddDays,
} from "../data/db";

function SectionTabs({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: "weeks" | "thisWeek" | "month" | "year") => void;
}) {
  const tabs: { key: "weeks" | "thisWeek" | "month" | "year"; label: string }[] = [
    { key: "year", label: "Year" },
    { key: "month", label: "Month" },
    { key: "weeks", label: "Weeks" },
    { key: "thisWeek", label: "This week" },
  ];
  return (
    <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950 p-1 text-sm">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={
            "px-3 py-1 rounded-lg transition " +
            (value === t.key
              ? "bg-emerald-500 text-slate-950"
              : "text-slate-200 hover:bg-slate-900")
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 flex flex-col gap-1">
      <div className="text-lg font-semibold">{title}</div>
      {subtitle ? <div className="text-sm text-slate-400">{subtitle}</div> : null}
    </div>
  );
}

function ActionButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={
        "rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs hover:bg-slate-800 disabled:opacity-60 " +
        (props.className ?? "")
      }
    >
      {children}
    </button>
  );
}

function PlansInputRow({
  onSubmit,
  placeholder,
  actionLabel,
  extra,
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  actionLabel: string;
  extra?: ReactNode;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full md:w-auto flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
      />
      {extra}
      <ActionButton onClick={onSubmit}>{actionLabel}</ActionButton>
    </div>
  );
}

function PlanTaskRow({
  task,
  loc,
  weeks,
  onEdit,
}: {
  task: PlanTask;
  loc: PlanLocation;
  weeks: string[];
  onEdit: (nextTitle: string) => void;
}) {
  const initialWeek = loc.level === "week" ? loc.weekStart : weeks[0] ?? "";
  const [targetWeek, setTargetWeek] = useState(initialWeek);
  const targetDays = targetWeek ? weekDays(targetWeek) : [];
  const [targetDay, setTargetDay] = useState(targetDays[0] ?? "");

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold break-words">{task.title || "Без названия"}</div>
        <div className="flex gap-2">
          <ActionButton onClick={() => onEdit(task.title)}>Edit</ActionButton>
          <ActionButton onClick={() => movePlanTaskToToday(loc, loc.level === "week" ? loc.day : undefined)}>
            Today
          </ActionButton>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {loc.level === "week" ? (
          <>
            <select
              value={targetDay}
              onChange={(e) => setTargetDay(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs"
            >
              {weekDays(loc.weekStart).map((d) => (
                <option key={d} value={d}>
                  Move to {d}
                </option>
              ))}
            </select>
            <ActionButton onClick={() => movePlanTaskWithinWeek(loc as Extract<PlanLocation, { level: "week" }>, targetDay)}>
              Move day
            </ActionButton>
          </>
        ) : null}

        <div className="flex items-center gap-1">
          <select
            value={targetWeek}
            onChange={(e) => {
              const wk = e.target.value;
              setTargetWeek(wk);
              const availableDays = wk ? weekDays(wk) : [];
              setTargetDay(availableDays[0] ?? "");
            }}
            className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs"
          >
            {weeks.map((wk) => (
              <option key={wk} value={wk}>
                {wk}
              </option>
            ))}
          </select>
          <select
            value={targetDay}
            onChange={(e) => setTargetDay(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs"
          >
            {targetDays.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <ActionButton
            onClick={() =>
              movePlanTaskToWeek(
                loc,
                targetWeek || weeks[0] || initialWeek,
                targetDay || targetDays[0] || todayYMD()
              )
            }
            disabled={!targetWeek}
          >
            To week
          </ActionButton>
        </div>

        <ActionButton onClick={() => movePlanTaskToMonth(loc)}>To month</ActionButton>
        <ActionButton onClick={() => movePlanTaskToYear(loc)}>To year</ActionButton>
        <ActionButton onClick={() => deletePlanTask(loc)}>Delete</ActionButton>
      </div>
    </div>
  );
}

function WeekCard({ weekStart, weeks }: { weekStart: string; weeks: string[] }) {
  const s = useAppState();
  const week = s.plans.weeks[weekStart];
  const days = weekDays(weekStart);
  const [draft, setDraft] = useState("");
  const [day, setDay] = useState(days[0] ?? weekStart);

  const tasksByDay = days.map((d) => ({ day: d, tasks: week?.days?.[d] ?? [] }));

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm text-slate-400">Week starting</div>
          <div className="text-lg font-semibold">{weekStart}</div>
        </div>
        <Link
          to="/today"
          className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1 text-xs hover:bg-slate-800"
        >
          Today →
        </Link>
      </div>

      <PlansInputRow
        value={draft}
        onChange={setDraft}
        placeholder="Add a task to this week"
        actionLabel="Add"
        extra={
          <select
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-2 text-sm"
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        }
        onSubmit={() => {
          if (!draft.trim()) return;
          addPlanWeekTask(weekStart, day, draft.trim());
          setDraft("");
        }}
      />

      <div className="grid gap-3">
        {tasksByDay.map((entry) => (
          <div key={entry.day} className="rounded-xl border border-slate-900 bg-slate-900/60 p-3 grid gap-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{entry.day}</div>
              <ActionButton onClick={() => addPlanWeekTask(weekStart, entry.day, "New task")}>+ Quick add</ActionButton>
            </div>
            {entry.tasks.length === 0 ? (
              <div className="text-xs text-slate-500">No tasks yet</div>
            ) : (
              <div className="grid gap-2">
                {entry.tasks.map((task) => (
                  <PlanTaskRow
                    key={task.id}
                    task={task}
                    loc={{ level: "week", weekStart, day: entry.day, id: task.id }}
                    weeks={weeks}
                    onEdit={(nextTitle) => {
                      const updated = prompt("Edit task", nextTitle);
                      if (updated !== null) {
                        updatePlanTask({ level: "week", weekStart, day: entry.day, id: task.id }, { title: updated });
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeeksGrid({ baseWeek }: { baseWeek: string }) {
  const weekList = useMemo(() => Array.from({ length: 5 }, (_, i) => ymdAddDays(baseWeek, i * 7)), [baseWeek]);

  return (
    <div className="grid gap-3">
      <Heading title="Plans" subtitle="MSA horizons: weeks focus" />
      <div className="grid gap-3 lg:grid-cols-2">
        {weekList.map((wk) => (
          <WeekCard key={wk} weekStart={wk} weeks={weekList} />
        ))}
      </div>
    </div>
  );
}

function MonthView({ weeks }: { weeks: string[] }) {
  const s = useAppState();
  const [draft, setDraft] = useState("");

  return (
    <div className="grid gap-3">
      <Heading title="Month" subtitle="Focus list for the next 30 days" />
      <PlansInputRow
        value={draft}
        onChange={setDraft}
        placeholder="Add monthly focus"
        actionLabel="Add"
        onSubmit={() => {
          if (!draft.trim()) return;
          addPlanTask("month", draft.trim());
          setDraft("");
        }}
      />
      <div className="grid gap-2">
        {s.plans.month.length === 0 ? (
          <div className="text-sm text-slate-500">No month items yet</div>
        ) : (
          s.plans.month.map((task) => (
            <PlanTaskRow
              key={task.id}
              task={task}
              loc={{ level: "month", id: task.id }}
              weeks={weeks}
              onEdit={(nextTitle) => {
                const updated = prompt("Edit item", nextTitle);
                if (updated !== null) updatePlanTask({ level: "month", id: task.id }, { title: updated });
              }}
            />
          ))
        )}
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

function YearView({ weeks }: { weeks: string[] }) {
  const s = useAppState();
  const [draft, setDraft] = useState("");

  return (
    <div className="grid gap-3">
      <Heading title="Year" subtitle="Major goals / Year horizon" />
      <PlansInputRow
        value={draft}
        onChange={setDraft}
        placeholder="Add yearly goal"
        actionLabel="Add"
        onSubmit={() => {
          if (!draft.trim()) return;
          addPlanTask("year", draft.trim());
          setDraft("");
        }}
      />
      <div className="grid gap-2">
        {s.plans.year.length === 0 ? (
          <div className="text-sm text-slate-500">No year items yet</div>
        ) : (
          s.plans.year.map((task) => (
            <PlanTaskRow
              key={task.id}
              task={task}
              loc={{ level: "year", id: task.id }}
              weeks={weeks}
              onEdit={(nextTitle) => {
                const updated = prompt("Edit goal", nextTitle);
                if (updated !== null) updatePlanTask({ level: "year", id: task.id }, { title: updated });
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ThisWeekView({ weekStart }: { weekStart: string }) {
  return (
    <div className="grid gap-3">
      <Heading title="This week" subtitle="Pull into Today or adjust days" />
      <WeekCard weekStart={weekStart} weeks={[weekStart]} />
    </div>
  );
}

export default function PlansPage() {
  const s = useAppState();
  const today = todayYMD();
  const baseWeek = getWeekStart(today, s.settings.weekStartsOn);
  const [tab, setTab] = useState<"weeks" | "thisWeek" | "month" | "year">("weeks");
  const weeks = useMemo(() => Array.from({ length: 5 }, (_, i) => ymdAddDays(baseWeek, i * 7)), [baseWeek]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xl font-semibold">Plans</div>
          <div className="text-sm text-slate-400">MSA horizons: Year → Month → Weeks → Today</div>
        </div>
        <SectionTabs value={tab} onChange={setTab} />
      </div>

      {tab === "weeks" && <WeeksGrid baseWeek={baseWeek} />}
      {tab === "thisWeek" && <ThisWeekView weekStart={baseWeek} />}
      {tab === "month" && <MonthView weeks={weeks} />}
      {tab === "year" && <YearView weeks={weeks} />}
    </div>
  );
}
