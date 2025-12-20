import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./styles.css";

// Если где-то в рендере/хуках произойдёт ошибка, вместо "пустого экрана" покажем
// понятное сообщение + кнопку сброса данных (часто помогает при поломанном localStorage).
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("Render error:", error, info);
  }

  private reset = () => {
    try {
      // ключ хранилища из db.ts
      localStorage.removeItem("tm.archangel.v1");
    } catch {
      // ignore
    }
    try {
      location.reload();
    } catch {
      // ignore
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    const err = this.state.error;
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
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            Произошла ошибка в приложении
          </h1>
          <p style={{ opacity: 0.9, marginBottom: 12 }}>
            Обычно это лечится сбросом локальных данных приложения (если после
            обновлений в кэше/хранилище осталась несовместимая версия).
          </p>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              onClick={this.reset}
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
              Сбросить данные и перезагрузить
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
              {err.name}: {err.message}
            </div>
            <pre style={{ whiteSpace: "pre-wrap", opacity: 0.9, margin: 0 }}>
              {err.stack ?? ""}
            </pre>
          </div>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
