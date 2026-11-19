export type Theme = "light" | "dark";
export type CornerStyle = "round" | "sharp";

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
  { id: "red", label: "Red", dark: "#ef4444", light: "#dc2626", inkDark: "#ffffff", inkLight: "#ffffff" },
  { id: "yellow", label: "Yellow", dark: "#eab308", light: "#a16207", inkDark: "#1a1402", inkLight: "#ffffff" },
];

interface Props {
  theme: Theme;
  onTheme: (theme: Theme) => void;
  accentId: string;
  onAccent: (id: string) => void;
  accentEnabled: boolean;
  onAccentEnabled: (enabled: boolean) => void;
  hexEnabled: boolean;
  onHexEnabled: (enabled: boolean) => void;
  corners: CornerStyle;
  onCorners: (style: CornerStyle) => void;
  tagColors: boolean;
  onTagColors: (enabled: boolean) => void;
}

function Toggle({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      className={`switch ${on ? "on" : ""}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={on ? `Turn ${label.toLowerCase()} off` : `Turn ${label.toLowerCase()} on`}
      onClick={() => onChange(!on)}
    >
      <span className="switch-knob" />
    </button>
  );
}

export function SettingsPanel({
  theme,
  onTheme,
  accentId,
  onAccent,
  accentEnabled,
  onAccentEnabled,
  hexEnabled,
  onHexEnabled,
  corners,
  onCorners,
  tagColors,
  onTagColors,
}: Props) {
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
        <div className="settings-head">
          <h3>Accent</h3>
          <Toggle on={accentEnabled} label="Accent" onChange={onAccentEnabled} />
        </div>
        <div className={`swatch-list ${accentEnabled ? "" : "off"}`}>
          {ACCENTS.map((accent) => (
            <button
              key={accent.id}
              className={`swatch-btn ${accentId === accent.id ? "active" : ""}`}
              onClick={() => onAccent(accent.id)}
              disabled={!accentEnabled}
              title={accentEnabled ? accent.label : "Accent is off"}
            >
              <span
                className="swatch-dot"
                style={{ background: theme === "dark" ? accent.dark : accent.light }}
              />
              {accent.label}
            </button>
          ))}
        </div>
        <p className="hint">
          Off leaves focus, selection and links monochrome — the interface is black, white and grey
          only.
        </p>
      </section>

      <section className="settings-group">
        <h3>Panels</h3>
        <div className="setting-row">
          <span>Hexadecimal window</span>
          <Toggle on={hexEnabled} label="Hexadecimal window" onChange={onHexEnabled} />
        </div>
        <p className="hint">
          The tree panel stays put whether the hex strip is shown or hidden.
        </p>
      </section>

      <section className="settings-group">
        <h3>Tree</h3>
        <div className="setting-row">
          <span>Colour OLST and MOBJ tags</span>
          <Toggle on={tagColors} label="Tag colours" onChange={onTagColors} />
        </div>
        <p className="hint">
          OLST tags turn blue and MOBJ tags amber so block types separate at a glance.
        </p>
      </section>

      <section className="settings-group">
        <h3>Icons</h3>
        <div className="segmented">
          <button
            className={`seg ${corners === "round" ? "active" : ""}`}
            onClick={() => onCorners("round")}
          >
            Round
          </button>
          <button
            className={`seg ${corners === "sharp" ? "active" : ""}`}
            onClick={() => onCorners("sharp")}
          >
            Sharp
          </button>
        </div>
        <p className="hint">
          Sharp squares every button corner and draws icon strokes with mitred joins.
        </p>
      </section>
    </div>
  );
}
