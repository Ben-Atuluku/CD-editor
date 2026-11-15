export type Theme = "light" | "dark";

export interface AccentOption {
  id: string;
  label: string;
  value: string;
  ink: string;
}

export const ACCENTS: AccentOption[] = [
  { id: "mono", label: "Mono", value: "", ink: "" },
  { id: "amber", label: "Amber", value: "#e5a100", ink: "#140f02" },
  { id: "blue", label: "Blue", value: "#2f6fed", ink: "#ffffff" },
  { id: "green", label: "Green", value: "#1f9d63", ink: "#ffffff" },
  { id: "rose", label: "Rose", value: "#d94f74", ink: "#ffffff" },
];

interface Props {
  theme: Theme;
  onTheme: (theme: Theme) => void;
  accentId: string;
  onAccent: (id: string) => void;
}

export function SettingsPanel({ theme, onTheme, accentId, onAccent }: Props) {
  return (
    <div className="settings">
      <section className="settings-group">
        <h3>Theme</h3>
        <div className="segmented">
          <button
            className={`seg ${theme === "light" ? "active" : ""}`}
            onClick={() => onTheme("light")}
          >
            Light
          </button>
          <button
            className={`seg ${theme === "dark" ? "active" : ""}`}
            onClick={() => onTheme("dark")}
          >
            Dark
          </button>
        </div>
      </section>

      <section className="settings-group">
        <h3>Accent</h3>
        <div className="swatch-list">
          {ACCENTS.map((accent) => (
            <button
              key={accent.id}
              className={`swatch-btn ${accentId === accent.id ? "active" : ""}`}
              onClick={() => onAccent(accent.id)}
            >
              <span
                className={`swatch-dot ${accent.value ? "" : "mono"}`}
                style={accent.value ? { background: accent.value } : undefined}
              />
              {accent.label}
            </button>
          ))}
        </div>
        <p className="hint">
          Mono keeps the interface black and white. Any other choice colours the primary action and
          the active selection only.
        </p>
      </section>

      <section className="settings-group">
        <h3>About</h3>
        <p className="hint">
          Everything is parsed and edited in this page. Exported files keep every byte you did not
          touch.
        </p>
      </section>
    </div>
  );
}
