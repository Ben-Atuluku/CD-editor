export type IconName =
  | "open"
  | "undo"
  | "redo"
  | "revert"
  | "save"
  | "sun"
  | "moon"
  | "tree"
  | "web"
  | "grid"
  | "list"
  | "cog"
  | "collapse"
  | "expand";

const PATHS: Record<IconName, React.ReactNode> = {
  open: (
    <>
      <path d="M3 6.5h5.5L11 9h10v9.5H3z" />
      <path d="M3 9h18" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h9a5.5 5.5 0 0 1 0 11h-2" />
    </>
  ),
  redo: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9h-9a5.5 5.5 0 0 0 0 11h2" />
    </>
  ),
  revert: (
    <>
      <path d="M4 4v6h6" />
      <path d="M4.6 10a8 8 0 1 1 2.1 6.2" />
    </>
  ),
  save: (
    <>
      <path d="M5 3.5h9.5L20 9v11.5H5z" />
      <path d="M8.5 3.5v5.5h6.5V3.5" />
      <path d="M8.5 20v-6h7v6" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z" />,
  tree: (
    <>
      <path d="M21 12h-8M21 6h-8M21 18h-8" />
      <path d="M3 6v4c0 1.1.9 2 2 2h3" />
      <path d="M3 10v6c0 1.1.9 2 2 2h3" />
    </>
  ),
  web: (
    <>
      <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="12" cy="12" r="8.2" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.4M3 12h.4M3 18h.4" />,
  cog: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.1 14.3a1.5 1.5 0 0 0 .3 1.7l.1.1a1.9 1.9 0 0 1-2.7 2.7l-.1-.1a1.5 1.5 0 0 0-1.7-.3 1.5 1.5 0 0 0-.9 1.4V20a1.9 1.9 0 0 1-3.8 0v-.2a1.5 1.5 0 0 0-.9-1.4 1.5 1.5 0 0 0-1.7.3l-.1.1a1.9 1.9 0 0 1-2.7-2.7l.1-.1a1.5 1.5 0 0 0 .3-1.7 1.5 1.5 0 0 0-1.4-.9H4a1.9 1.9 0 0 1 0-3.8h.2a1.5 1.5 0 0 0 1.4-.9 1.5 1.5 0 0 0-.3-1.7l-.1-.1a1.9 1.9 0 0 1 2.7-2.7l.1.1a1.5 1.5 0 0 0 1.7.3h.1a1.5 1.5 0 0 0 .9-1.4V4a1.9 1.9 0 0 1 3.8 0v.2a1.5 1.5 0 0 0 .9 1.4 1.5 1.5 0 0 0 1.7-.3l.1-.1a1.9 1.9 0 0 1 2.7 2.7l-.1.1a1.5 1.5 0 0 0-.3 1.7v.1a1.5 1.5 0 0 0 1.4.9H20a1.9 1.9 0 0 1 0 3.8h-.2a1.5 1.5 0 0 0-1.4.9z" />
    </>
  ),
  collapse: <path d="m6 9 6 6 6-6" />,
  expand: <path d="m6 15 6-6 6 6" />,
};

export function Icon({ name, size = 15 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
