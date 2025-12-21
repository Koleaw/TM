import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.tsx";
import "./styles.css";

// Меняй при каждом деплое.
// Нужен, чтобы при проблемах с PWA/Service Worker можно было принудительно
// сбросить кэш (частая причина: браузер держит старый бандл и игнорит новые файлы).
const BUILD_ID = "tm-build-fix12-2025-12-20";
const BUILD_KEY = "tm.archangel.build";
const STORAGE_KEY = "tm.archangel.v1";

async function purgeCachesAndSW() {
  // Cache Storage (PWA)
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // ignore
  }

  // Service Worker registrations
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    // ignore
  }
}

async function ensureFreshClient() {
  // 1) Ручной параметр на случай, если вообще ничего не кликается.
  // Открываешь URL вида: .../TM/?hardreset=1
  // Он сотрёт localStorage + кэши + SW, потом перезагрузит без параметра.
  try {
    const u = new URL(location.href);
    if (u.searchParams.has("hardreset")) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      await purgeCachesAndSW();
      u.searchParams.delete("hardreset");
      location.replace(u.toString());
      return;
    }
  } catch {
    // ignore
  }

  // 2) При смене BUILD_ID один раз чистим кэши и регистрации SW.
  // Это помогает, когда на части устройств застревает старый бандл.
  try {
    const prev = localStorage.getItem(BUILD_KEY);
    if (prev !== BUILD_ID) {
      localStorage.setItem(BUILD_KEY, BUILD_ID);
      await purgeCachesAndSW();
    }
  } catch {
    // ignore
  }
}

function normalizeThrown(err: unknown): Error {
  if (err instanceof Error) return err;
  try {
    return new Error(typeof err === "string" ? err : JSON.stringify(err));
  } catch {
    return new Error(String(err));
  }
}

// Если где-то в рендере/хуках произойдёт ошибка, вместо "пустого экрана" покажем
// понятное сообщение + кнопку сброса данных (часто помогает при поломанном localStorage / кэше PWA).
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; info?: React.ErrorInfo }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown) {
    return { error: normalizeThrown(error) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    const e = normalizeThrown(error);
    // eslint-disable-next-line no-console
    console.error("Render error:", e, info);

    // Сохраняем диагностический хвост, чтобы даже в прод-сборке было что смотреть
    try {
      const payload = {
        name: e.name,
        message: e.message,
        stack: e.stack ?? "",
        at: new Date().toISOString(),
        href: location.href,
        ua: navigator.userAgent,
        swControlled: "serviceWorker" in navigator ? !!navigator.serviceWorker.controller : false,
        lastAction: localStorage.getItem("tm.lastAction") ?? null,
      };
      localStorage.setItem("tm.lastError", JSON.stringify(payload));
    } catch {
      // ignore
    }

    this.setState({ info });
  }

  private hardReset = async () => {
    // 1) localStorage — удаляем все данные приложения (включая возможные бэкапы/ошибки)
    try {
      localStorage.clear();
    } catch {
      // ignore
    }

    // 2) SW + CacheStorage
    await purgeCachesAndSW();

    // 3) Жёсткая перезагрузка страницы
    try {
      location.replace(location.href);
    } catch {
      try {
        location.reload();
      } catch {
        // ignore
      }
    }
  };

  private readLastError(): string {
    try {
      return localStorage.getItem("tm.lastError") ?? "";
    } catch {
      return "";
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    const err = this.state.error;
    const last = this.readLastError();
    const componentStack = this.state.info?.componentStack;

    return (
      <div
        style={{
          minHeight: "100vh",
          padding: 16,
          background: "#0b1220",
          color: "#e5e7eb",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, Noto Sans, sans-serif",
        }}
      >
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            Произошла ошибка в приложении
          </h1>
          <p style={{ opacity: 0.9, marginBottom: 12 }}>
            Чаще всего это лечится сбросом локальных данных и PWA-кэша.
          </p>

          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <button
              onClick={this.hardReset}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,.35)",
                background: "rgba(15,23,42,.65)",
                color: "#e5e7eb",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Жёсткий сброс (данные + кэш)
            </button>
            <button
              onClick={() => location.reload()}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,.35)",
                background: "transparent",
                color: "#e5e7eb",
                cursor: "pointer",
              }}
            >
              Просто перезагрузить
            </button>
            <a
              href={(() => {
                try {
                  const u = new URL(location.href);
                  u.searchParams.set("hardreset", "1");
                  return u.toString();
                } catch {
                  return "?hardreset=1";
                }
              })()}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,.35)",
                background: "transparent",
                color: "#e5e7eb",
                textDecoration: "none",
              }}
            >
              Открыть hardreset-ссылку
            </a>
          </div>

          <div
            style={{
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,.25)",
              background: "rgba(15,23,42,.35)",
              padding: 12,
              overflowX: "auto",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              {err.name}: {err.message || "(без текста)"}
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
              BUILD_ID: {BUILD_ID}
              <br />
              SW контролирует страницу: {"serviceWorker" in navigator && navigator.serviceWorker.controller ? "да" : "нет"}
            </div>
            <pre style={{ whiteSpace: "pre-wrap", opacity: 0.9, margin: 0 }}>
              {(err.stack && err.stack.trim()) || `${err}`}
            </pre>

            {componentStack ? (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                  React component stack
                </summary>
                <pre style={{ whiteSpace: "pre-wrap", opacity: 0.9, margin: 0 }}>
                  {componentStack}
                </pre>
              </details>
            ) : null}

            {last ? (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                  Диагностика (tm.lastError)
                </summary>
                <pre style={{ whiteSpace: "pre-wrap", opacity: 0.9, margin: 0 }}>
                  {last}
                </pre>
              </details>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
}

async function mount() {
  await ensureFreshClient();

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <HashRouter>
          <App />
        </HashRouter>
      </RootErrorBoundary>
    </React.StrictMode>
  );
}

// Плюс ловим ошибки вне React (промисы, обработчики и т. п.)
try {
  window.addEventListener("unhandledrejection", (ev) => {
    // eslint-disable-next-line no-console
    console.error("Unhandled rejection:", ev.reason);
  });
  window.addEventListener("error", (ev) => {
    // eslint-disable-next-line no-console
    console.error("Window error:", ev.error ?? ev.message);
  });
} catch {
  // ignore
}

void mount();
