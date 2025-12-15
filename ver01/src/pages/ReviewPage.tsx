import { useMemo } from "react";
import {
  getWeekStart,
  todayYMD,
  upsertReview,
  useAppState
} from "../data/db";

export default function ReviewPage() {
  const s = useAppState();
  const ws = getWeekStart(todayYMD(), s.settings.weekStartsOn);

  const entry = useMemo(() => s.reviews.find((r) => r.weekStart === ws), [s.reviews, ws]);

  const wins = entry?.wins ?? "";
  const lessons = entry?.lessons ?? "";
  const focus = entry?.focus ?? "";
  const next = entry?.next ?? "";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
      <div className="text-lg font-semibold">Weekly Review</div>
      <div className="text-sm text-slate-400 mt-1">Week start: {ws}</div>

      <div className="mt-4 grid gap-3 max-w-3xl">
        <label className="grid gap-1">
          <span className="text-sm text-slate-300">Wins</span>
          <textarea
            className="min-h-[90px] rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={wins}
            onChange={(e) => upsertReview(ws, { wins: e.target.value })}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-slate-300">Lessons</span>
          <textarea
            className="min-h-[90px] rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={lessons}
            onChange={(e) => upsertReview(ws, { lessons: e.target.value })}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-slate-300">Focus (top 3)</span>
          <textarea
            className="min-h-[70px] rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={focus}
            onChange={(e) => upsertReview(ws, { focus: e.target.value })}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-slate-300">Next week plan</span>
          <textarea
            className="min-h-[90px] rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={next}
            onChange={(e) => upsertReview(ws, { next: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
