import { useEffect, useMemo, useState } from "react";
import {
  db,
  ensureDefaultSettings,
  logEvent,
  type Tag,
  type Sink,
  type Task,
  type TimeLog,
  type Settings
} from "../data/db";

type Tab = "tags" | "sinks" | "lists";

type ListKey = "contexts" | "projects" | "goals" | "motivationModes" | "roles";

type ListItem = { id: string; name: string };

type SettingsExt = Settings & {
  lists?: Record<ListKey, ListItem[]>;
};

function uuid() {
  return (globalThis.crypto?.randomUUID?.() ??
    `id_${Date.now()}_${Math.random().toString(16).slice(2)}`) as string;
}

function norm(s: string) {
  return s.trim().toLowerCase();
}

function downloadText(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCSV(rows: Record<string, any>[]) {
  if (!rows.length) return "";
  const headers = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );
  const esc = (v: any) => {
    const s = v === null || v === undefined ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(","));
  return lines.join("\n");
}

async function getSettingsExt(): Promise<SettingsExt> {
  await ensureDefaultSettings();
  const s = (await db.settings.get("singleton")) as SettingsExt | undefined;
  if (!s) throw new Error("Settings not found");

  if (!s.lists) s.lists = {};
  const keys: ListKey[] = ["contexts", "projects", "goals", "motivationModes", "roles"];
  for (const k of keys) if (!s.lists[k]) s.lists[k] = [];
  return s;
}

async function putSettingsExt(s: SettingsExt) {
  await db.settings.put(s);
}

function InlineEditRow({
  title,
  subtitle,
  onRename,
  onDelete
}: {
  title: string;
  subtitle?: string;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(title);

  useEffect(() => setVal(title), [title]);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        {!editing ? (
          <>
            <div className="text-sm font-semibold truncate">{title}</div>
            {subtitle ? <div className="text-xs text-slate-400 mt-1">{subtitle}</div> : null}
          </>
        ) : (
          <div className="flex gap-2">
            <input
              value={val}
              onChange={(e) => setVal(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              autoFocus
            />
            <button
              onClick={() => {
                setEditing(false);
                void onRename(val.trim());
              }}
              className="px-3 py-2 rounded-lg bg-slate-50 text-slate-950 text-sm font-semibold"
            >
              Save
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setVal(title);
              }}
              className="px-3 py-2 rounded-lg bg-slate-800 text-slate-100 text-sm"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {!editing && (
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs"
          >
            Rename
          </button>
          <button
            onClick={() => void onDelete()}
            className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-100 text-xs"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default function ManagePage() {
  const [tab, setTab] = useState<Tab>("tags");

  const [tags, setTags] = useState<Tag[]>([]);
  const [sinks, setSinks] = useState<Sink[]>([]);
  const [settings, setSettings] = useState<SettingsExt | null>(null);

  const [tagQuery, setTagQuery] = useState("");
  const [sinkQuery, setSinkQuery] = useState("");

  const [newTag, setNewTag] = useState("");
  const [newSink, setNewSink] = useState("");

  const [listKey, setListKey] = useState<ListKey>("contexts");
  const [listNewName, setListNewName] = useState("");
  const [listQuery, setListQuery] = useState("");

  async function reload() {
    const [t, s, st] = await Promise.all([db.tags.toArray(), db.sinks.toArray(), getSettingsExt()]);
    t.sort((a, b) => a.name.localeCompare(b.name));
    s.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    setTags(t);
    setSinks(s);
    setSettings(st);
  }

  useEffect(() => {
    void reload();
    const handler = () => void reload();
    db.on("changes", handler);
    return () => {
      db.on("changes").unsubscribe(handler);
    };
  }, []);

  // ---------- TAGS ----------
  const tagsFiltered = useMemo(() => {
    const q = norm(tagQuery);
    if (!q) return tags;
    return tags.filter((t) => norm(t.name).includes(q));
  }, [tags, tagQuery]);

  async function createTag() {
    const name = newTag.trim();
    if (!name) return;

    if (tags.some((t) => norm(t.name) === norm(name))) {
      alert("Такой тег уже есть.");
      return;
    }

    const id = uuid();
    await db.tags.put({ id, name } as any);
    await logEvent({ type: "tag_created", payload: { id, name } });
    setNewTag("");
  }

  async function renameTag(id: string, name: string) {
    const next = name.trim();
    if (!next) return;

    const exists = tags.some((t) => t.id !== id && norm(t.name) === norm(next));
    if (exists) {
      alert("Тег с таким именем уже существует.");
      return;
    }

    await db.tags.update(id, { name: next } as any);
    await logEvent({ type: "tag_renamed", payload: { id, name: next } });
  }

  async function deleteTag(id: string) {
    const ok = confirm(
      "Удалить тег?\n\nЭто безопасно: мы снимем этот тег со всех задач, чтобы история и аналитика не поломались."
    );
    if (!ok) return;

    // снять тег со всех задач
    const tasks = await db.tasks.toArray();
    for (const t of tasks) {
      const tagIds = ((t as any).tagIds as string[]) ?? [];
      if (!tagIds.includes(id)) continue;
      const next = tagIds.filter((x) => x !== id);
      await db.tasks.update(t.id, { tagIds: next, updatedAt: Date.now() } as any);
    }

    await db.tags.delete(id);
    await logEvent({ type: "tag_deleted", payload: { id } });
  }

  // ---------- SINKS ----------
  const sinksFiltered = useMemo(() => {
    const q = norm(sinkQuery);
    if (!q) return sinks;
    return sinks.filter((s) => norm(s.name ?? "").includes(q));
  }, [sinks, sinkQuery]);

  async function createSink() {
    const name = newSink.trim();
    if (!name) return;

    if (sinks.some((s) => norm(s.name ?? "") === norm(name))) {
      alert("Такой поглотитель уже есть.");
      return;
    }

    const id = uuid();
    await db.sinks.put({ id, name } as any);
    await logEvent({ type: "sink_created", payload: { id, name } });
    setNewSink("");
  }

  async function renameSink(id: string, name: string) {
    const next = name.trim();
    if (!next) return;

    const exists = sinks.some((s) => s.id !== id && norm(s.name ?? "") === norm(next));
    if (exists) {
      alert("Поглотитель с таким именем уже существует.");
      return;
    }

    await db.sinks.update(id, { name: next } as any);
    await logEvent({ type: "sink_renamed", payload: { id, name: next } });
  }

  async function deleteSink(id: string) {
    const ok = confirm(
      "Удалить поглотитель?\n\nВажно: чтобы аналитика не ломалась, мы уберём sinkId из всех таймлогов, где он использовался (время останется)."
    );
    if (!ok) return;

    // убрать sinkId из логов
    await db.timeLogs.where("sinkId").equals(id).modify((l: TimeLog) => {
      (l as any).sinkId = undefined;
    });

    await db.sinks.delete(id);
    await logEvent({ type: "sink_deleted", payload: { id } });
  }

  // ---------- LISTS (stored in Settings) ----------
  const listItems = useMemo(() => {
    const arr = settings?.lists?.[listKey] ?? [];
    const q = norm(listQuery);
    if (!q) return arr;
    return arr.filter((x) => norm(x.name).includes(q));
  }, [settings, listKey, listQuery]);

  async function addListItem() {
    const name = listNewName.trim();
    if (!name) return;

    const s = await getSettingsExt();
    const arr = s.lists![listKey] ?? [];

    if (arr.some((x) => norm(x.name) === norm(name))) {
      alert("Уже есть такой элемент.");
      return;
    }

    const item: ListItem = { id: uuid(), name };
    s.lists![listKey] = [...arr, item].sort((a, b) => a.name.localeCompare(b.name));

    await putSettingsExt(s);
    await logEvent({ type: "list_item_created", payload: { listKey, item } });

    setSettings(s);
    setListNewName("");
  }

  async function renameListItem(itemId: string, name: string) {
    const next = name.trim();
    if (!next) return;

    const s = await getSettingsExt();
    const arr = s.lists![listKey] ?? [];

    if (arr.some((x) => x.id !== itemId && norm(x.name) === norm(next))) {
      alert("Элемент с таким именем уже существует.");
      return;
    }

    s.lists![listKey] = arr
      .map((x) => (x.id === itemId ? { ...x, name: next } : x))
      .sort((a, b) => a.name.localeCompare(b.name));

    await putSettingsExt(s);
    await logEvent({ type: "list_item_renamed", payload: { listKey, itemId, name: next } });

    setSettings(s);
  }

  async function deleteListItem(itemId: string) {
    const ok = confirm("Удалить элемент списка?");
    if (!ok) return;

    const s = await getSettingsExt();
    const arr = s.lists![listKey] ?? [];
    s.lists![listKey] = arr.filter((x) => x.id !== itemId);

    await putSettingsExt(s);
    await logEvent({ type: "list_item_deleted", payload: { listKey, itemId } });

    setSettings(s);
  }

  function exportTagsCSV() {
    const rows = tags.map((t) => ({ id: t.id, name: t.name }));
    downloadText("tags.csv", toCSV(rows), "text/csv");
  }

  function exportSinksCSV() {
    const rows = sinks.map((s) => ({ id: s.id, name: s.name }));
    downloadText("sinks.csv", toCSV(rows), "text/csv");
  }

  function exportListsJSON() {
    const payload = settings?.lists ?? {};
    downloadText("lists.json", JSON.stringify(payload, null, 2), "application/json");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Manage</h1>
          <div className="text-slate-300 text-sm">
            Настройки системы: теги, поглотители, справочники (контексты/проекты/цели/режимы).
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setTab("tags")}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              tab === "tags" ? "bg-slate-50 text-slate-950 font-semibold" : "bg-slate-900 text-slate-200"
            }`}
          >
            Tags
          </button>
          <button
            onClick={() => setTab("sinks")}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              tab === "sinks" ? "bg-slate-50 text-slate-950 font-semibold" : "bg-slate-900 text-slate-200"
            }`}
          >
            Sinks
          </button>
          <button
            onClick={() => setTab("lists")}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              tab === "lists" ? "bg-slate-50 text-slate-950 font-semibold" : "bg-slate-900 text-slate-200"
            }`}
          >
            Lists
          </button>
        </div>
      </div>

      {/* TAGS */}
      {tab === "tags" && (
        <div className="space-y-3">
          <section className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="font-semibold">Теги</div>
              <button
                onClick={exportTagsCSV}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs"
              >
                Export CSV
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <label className="space-y-1">
                <div className="text-sm text-slate-300">Поиск</div>
                <input
                  value={tagQuery}
                  onChange={(e) => setTagQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                  placeholder="например: учеба, здоровье…"
                />
              </label>

              <label className="space-y-1 lg:col-span-2">
                <div className="text-sm text-slate-300">Новый тег</div>
                <div className="flex gap-2">
                  <input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                    placeholder="например: Deep Work, Дом, Учёба…"
                  />
                  <button
                    onClick={() => void createTag()}
                    className="px-4 py-2 rounded-lg bg-slate-50 text-slate-950 text-sm font-semibold"
                  >
                    Add
                  </button>
                </div>
              </label>
            </div>

            <div className="text-xs text-slate-500">
              Теги — ключевой “разрез” для аналитики. Лучше иметь 15–40 стабильных тегов, чем 200 случайных.
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-xs text-slate-400 mb-2">Всего: {tagsFiltered.length}</div>
            <div className="space-y-2">
              {tagsFiltered.map((t) => (
                <InlineEditRow
                  key={t.id}
                  title={t.name}
                  subtitle={`id: ${t.id}`}
                  onRename={(name) => renameTag(t.id, name)}
                  onDelete={() => deleteTag(t.id)}
                />
              ))}
              {tagsFiltered.length === 0 && <div className="text-sm text-slate-400">Ничего не найдено.</div>}
            </div>
          </section>
        </div>
      )}

      {/* SINKS */}
      {tab === "sinks" && (
        <div className="space-y-3">
          <section className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="font-semibold">Поглотители (Sinks)</div>
              <button
                onClick={exportSinksCSV}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs"
              >
                Export CSV
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <label className="space-y-1">
                <div className="text-sm text-slate-300">Поиск</div>
                <input
                  value={sinkQuery}
                  onChange={(e) => setSinkQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                  placeholder="например: соцсети, чаты, прокрастинация…"
                />
              </label>

              <label className="space-y-1 lg:col-span-2">
                <div className="text-sm text-slate-300">Новый поглотитель</div>
                <div className="flex gap-2">
                  <input
                    value={newSink}
                    onChange={(e) => setNewSink(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                    placeholder="например: Telegram, YouTube, Бесконечные созвоны…"
                  />
                  <button
                    onClick={() => void createSink()}
                    className="px-4 py-2 rounded-lg bg-slate-50 text-slate-950 text-sm font-semibold"
                  >
                    Add
                  </button>
                </div>
              </label>
            </div>

            <div className="text-xs text-slate-500">
              Поглотители нужны не “для стыда”, а чтобы ставить правила: лимиты, окна, блокировки, замены.
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-xs text-slate-400 mb-2">Всего: {sinksFiltered.length}</div>
            <div className="space-y-2">
              {sinksFiltered.map((s) => (
                <InlineEditRow
                  key={s.id}
                  title={s.name}
                  subtitle={`id: ${s.id}`}
                  onRename={(name) => renameSink(s.id, name)}
                  onDelete={() => deleteSink(s.id)}
                />
              ))}
              {sinksFiltered.length === 0 && <div className="text-sm text-slate-400">Ничего не найдено.</div>}
            </div>
          </section>
        </div>
      )}

      {/* LISTS */}
      {tab === "lists" && (
        <div className="space-y-3">
          <section className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="font-semibold">Справочники (хранятся в Settings)</div>
              <button
                onClick={exportListsJSON}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs"
              >
                Export JSON
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <label className="space-y-1">
                <div className="text-sm text-slate-300">Раздел</div>
                <select
                  value={listKey}
                  onChange={(e) => setListKey(e.target.value as ListKey)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="contexts">Contexts (контексты)</option>
                  <option value="projects">Projects (проекты)</option>
                  <option value="goals">Goals (цели)</option>
                  <option value="motivationModes">Motivation modes (мотивационные режимы)</option>
                  <option value="roles">Roles (роли)</option>
                </select>
              </label>

              <label className="space-y-1">
                <div className="text-sm text-slate-300">Поиск</div>
                <input
                  value={listQuery}
                  onChange={(e) => setListQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                  placeholder="поиск…"
                />
              </label>

              <label className="space-y-1">
                <div className="text-sm text-slate-300">Новый элемент</div>
                <div className="flex gap-2">
                  <input
                    value={listNewName}
                    onChange={(e) => setListNewName(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                    placeholder="название…"
                  />
                  <button
                    onClick={() => void addListItem()}
                    className="px-4 py-2 rounded-lg bg-slate-50 text-slate-950 text-sm font-semibold"
                  >
                    Add
                  </button>
                </div>
              </label>
            </div>

            <div className="text-xs text-slate-500">
              Сейчас эти списки — “справочники”. Следующий шаг — привязать их к задачам (projectId/contextId/goalId) и
              добавить аналитику по ним.
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-xs text-slate-400 mb-2">Элементов: {listItems.length}</div>
            <div className="space-y-2">
              {listItems.map((x) => (
                <InlineEditRow
                  key={x.id}
                  title={x.name}
                  subtitle={`id: ${x.id}`}
                  onRename={(name) => renameListItem(x.id, name)}
                  onDelete={() => deleteListItem(x.id)}
                />
              ))}
              {listItems.length === 0 && <div className="text-sm text-slate-400">Пусто.</div>}
            </div>
          </section>
        </div>
      )}

      <div className="text-xs text-slate-500">
        Следующий файл/правка: <span className="text-slate-300">App.tsx</span> — добавить роуты и навигацию (Time,
        Manage, Task/:id), чтобы всё это стало доступно из интерфейса без ручных URL.
      </div>
    </div>
  );
}
