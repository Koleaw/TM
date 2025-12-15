import { useState } from "react";
import {
  addListItem,
  addTagToLibrary,
  removeListItem,
  renameListItem,
  useAppState
} from "../data/db";

type Key = "goals" | "projects" | "contexts" | "roles" | "motivationModes" | "sinks";

function Section({ title, k }: { title: string; k: Key }) {
  const s = useAppState();
  const [name, setName] = useState("");

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
      <div className="font-semibold">{title}</div>

      <div className="mt-2 flex gap-2">
        <input
          className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название…"
        />
        <button
          className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-950"
          onClick={() => {
            addListItem(k, name);
            setName("");
          }}
        >
          Add
        </button>
      </div>

      <div className="mt-3 grid gap-2">
        {(s.lists[k] ?? []).map((it) => (
          <div key={it.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2">
            <input
              className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              value={it.name}
              onChange={(e) => renameListItem(k, it.id, e.target.value)}
            />
            <button
              className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs hover:bg-slate-800"
              onClick={() => removeListItem(k, it.id)}
            >
              Delete
            </button>
          </div>
        ))}
        {(s.lists[k] ?? []).length === 0 ? (
          <div className="text-sm text-slate-400">Пока пусто</div>
        ) : null}
      </div>
    </div>
  );
}

export default function ManagePage() {
  const s = useAppState();
  const [tag, setTag] = useState("");

  return (
    <div className="grid gap-3">
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="text-lg font-semibold">Manage</div>
        <div className="text-sm text-slate-400 mt-1">Цели/проекты/контексты/поглотители/режимы</div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="font-semibold">Tag library</div>
        <div className="mt-2 flex gap-2">
          <input
            className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="#карьера"
          />
          <button
            className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-950"
            onClick={() => {
              addTagToLibrary(tag);
              setTag("");
            }}
          >
            Add
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-400">
          {s.settings.tagLibrary.join(" ")}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="Goals" k="goals" />
        <Section title="Projects" k="projects" />
        <Section title="Contexts" k="contexts" />
        <Section title="Roles" k="roles" />
        <Section title="Motivation modes" k="motivationModes" />
        <Section title="Sinks (поглотители)" k="sinks" />
      </div>
    </div>
  );
}
