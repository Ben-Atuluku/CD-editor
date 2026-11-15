export type Theme = "light" | "dark";

export interface AccentOption {
  id: string;
  label: string;
  /** Shade used on the dark interface. */
  dark: string;
  /** Darker shade used on the light interface so contrast stays legible. */
  light: string;
  inkDark: string;
  inkLight: string;
}

export const ACCENTS: AccentOption[] = [
  { id: "blue", label: "Blue", dark: "#3b82f6", light: "#2563eb", inkDark: "#ffffff", inkLight: "#ffffff" },
  { id: "green", label: "Green", dark: "#22c55e", light: "#15803d", inkDark: "#06210f", inkLight: "#ffffff" },
  { id: "violet", label: "Violet", dark: "#8b5cf6", light: "#6d28d9", inkDark: "#ffffff", inkLight: "#ffffff" },
  { id: "orange", label: "Orange", dark: "#f97316", light: "#c2410c", inkDark: "#1a0c02", inkLight: "#ffffff" },
  { id: "rose", label: "Rose", dark: "#f43f5e", light: "#be123c", inkDark: "#ffffff", inkLight: "#ffffff" },
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
              title={accent.label}
            >
              <span
                className="swatch-dot"
                style={{ background: theme === "dark" ? accent.dark : accent.light }}
              />
              {accent.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
