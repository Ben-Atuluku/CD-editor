import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  addMobj,
  encodeReplacement,
  formatOffset,
  parseCd,
  type CdDocument,
  type ContainerNode,
  type StringSlot,
} from "./lib/cd";
import { textureFields } from "./lib/texture";
import { describeMaterial } from "./lib/bodyParts";
import { encodeField, type CharacterField } from "./lib/character";
import type { ReassignCandidate } from "./lib/reassign";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const storedNumber = (key: string, fallback: number) => {
  const stored = Number(localStorage.getItem(key));
  return Number.isFinite(stored) && stored > 0 ? stored : fallback;
};
import { ACCENTS, SettingsPanel, type Theme } from "./components/SettingsPanel";
import type { Selection } from "./lib/selection";
import { Icon } from "./components/Icon";
import { HexView } from "./components/HexView";
import { Inspector } from "./components/Inspector";
import { CategoryTree } from "./components/CategoryTree";
import { CompareView } from "./components/CompareView";
import { References } from "./components/References";
import { TreeView } from "./components/TreeView";

interface Hunk {
  offset: number;
  before: Uint8Array;
  after: Uint8Array;
}

interface Edit {
  before: Uint8Array;
  after: Uint8Array;
  label: string;
}

export default function App() {
  const [fileName, setFileName] = useState("untitled.cd");
  const [original, setOriginal] = useState<Uint8Array | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [doc, setDoc] = useState<CdDocument | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [cursor, setCursor] = useState(0);
  const [undoStack, setUndoStack] = useState<Edit[]>([]);
  const [redoStack, setRedoStack] = useState<Edit[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [tab, setTab] = useState<"categories" | "blocks" | "references" | "settings">("blocks");
  const [mode, setMode] = useState<"editor" | "compare">("editor");
  const [filter, setFilter] = useState("");
  const [warningsOpen, setWarningsOpen] = useState(true);
  const [theme, setTheme] = useState<Theme>(() =>
    localStorage.getItem("cd:theme") === "light" ? "light" : "dark",
  );
  const [accentId, setAccentId] = useState<string>(() => {
    const stored = localStorage.getItem("cd:accent");
    return ACCENTS.some((entry) => entry.id === stored) ? (stored as string) : "blue";
  });
  const [accentEnabled, setAccentEnabled] = useState<boolean>(
    () => localStorage.getItem("cd:accent-on") !== "no",
  );
  const [hexOpen, setHexOpen] = useState(true);
  const [hexHeight, setHexHeight] = useState(() => clamp(storedNumber("cd:hex-h", 250), 120, 900));
  const [inspectorWidth, setInspectorWidth] = useState(() =>
    clamp(storedNumber("cd:inspector-w", 390), 300, 760),
  );
  const dragRef = useRef<{ kind: "inspector" | "hex"; x: number; y: number; value: number } | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback((name: string, data: Uint8Array) => {
    const copy = Uint8Array.from(data);
    const parsed = parseCd(copy, name);
    setFileName(name);
    setOriginal(Uint8Array.from(copy));
    setBytes(copy);
    setDoc(parsed);
    setUndoStack([]);
    setRedoStack([]);
    setFilter("");
    setWarningsOpen(true);
    setTab(parsed.containers.length > 0 ? "blocks" : "categories");
    const first = parsed.strings.find((slot) => !slot.readOnly) ?? parsed.strings[0];
    if (first) {
      setSelection({ kind: "string", offset: first.offset, length: first.byteLength });
      setCursor(first.offset);
    } else if (parsed.containers[0]) {
      setSelection({
        kind: "container",
        offset: parsed.containers[0].offset,
        length: parsed.containers[0].size,
      });
      setCursor(parsed.containers[0].offset);
    } else {
      setSelection(null);
      setCursor(0);
    }
    setNotice(
      parsed.containers.length > 0
        ? `Loaded ${name} — ${parsed.containers.length} containers, ${parsed.strings.length} references.`
        : `Loaded ${name} — no OLST/MOBJ containers were detected.`,
    );
  }, []);

  const openFile = useCallback(
    async (file: File) => {
      try {
        const buffer = await file.arrayBuffer();
        load(file.name, new Uint8Array(buffer));
      } catch {
        setNotice(`Could not read ${file.name}.`);
      }
    },
    [load],
  );

  const sendToInbox = useCallback(async () => {
    if (!bytes) return;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    try {
      const response = await fetch(`/api/samples?name=${encodeURIComponent(fileName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: copy,
      });
      const data = (await response.json()) as { ok?: boolean; path?: string; error?: string };
      if (data.ok && data.path) {
        setNotice(`Saved to ${data.path}. Ask Buffy to analyse it.`);
      } else {
        setNotice(`Inbox rejected the file: ${data.error ?? response.statusText}`);
      }
    } catch {
      setNotice("Analysis inbox needs the running preview — it is not available in a static build.");
    }
  }, [bytes, fileName]);

  const applyEdit = useCallback(
    (next: Uint8Array, label: string) => {
      if (!bytes) return;
      const before = Uint8Array.from(bytes);
      setBytes(next);
      setDoc(parseCd(next, fileName));
      setUndoStack((stack) => [...stack, { before, after: Uint8Array.from(next), label }]);
      setRedoStack([]);
    },
    [bytes, fileName],
  );

  const applyHunks = useCallback(
    (hunks: Hunk[], label: string) => {
      if (!bytes) return;
      const next = Uint8Array.from(bytes);
      for (const hunk of hunks) next.set(hunk.after, hunk.offset);
      applyEdit(next, label);
    },
    [bytes, applyEdit],
  );

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const edit = undoStack[undoStack.length - 1];
    const next = Uint8Array.from(edit.before);
    setBytes(next);
    setDoc(parseCd(next, fileName));
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, edit]);
    setNotice(`Undid: ${edit.label}`);
  }, [undoStack, fileName]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const edit = redoStack[redoStack.length - 1];
    const next = Uint8Array.from(edit.after);
    setBytes(next);
    setDoc(parseCd(next, fileName));
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, edit]);
    setNotice(`Redid: ${edit.label}`);
  }, [redoStack, fileName]);

  const exportFile = useCallback(() => {
    if (!bytes) return;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileName.replace(/\.cd$/i, "")}_edited.cd`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(`Exported ${anchor.download}.`);
  }, [bytes, fileName]);

  const revert = useCallback(() => {
    if (!original) return;
    const next = Uint8Array.from(original);
    setBytes(next);
    setDoc(parseCd(next, fileName));
    setUndoStack([]);
    setRedoStack([]);
    setNotice("Reverted to the file as it was loaded.");
  }, [original, fileName]);

  const editString = useCallback(
    (slot: StringSlot, text: string) => {
      if (!bytes) return;
      const result = encodeReplacement(slot, text);
      if (!result.ok) {
        setNotice(result.error);
        return;
      }
      if (text === slot.text) return;
      applyHunks(
        [
          {
            offset: slot.offset,
            before: bytes.slice(slot.offset, slot.offset + slot.byteLength),
            after: result.bytes,
          },
        ],
        `reference "${slot.text}" → "${text}"`,
      );
      setSelection({ kind: "string", offset: slot.offset, length: slot.byteLength });
      setCursor(slot.offset);
      setNotice(`Repointed reference at ${formatOffset(slot.offset)}.`);
    },
    [bytes, applyHunks],
  );

  const addMobjToGroup = useCallback(
    (olstId: string, name: string) => {
      if (!bytes || !doc) return;
      const result = addMobj(doc, olstId, name);
      if (!result.ok || !result.bytes) {
        setNotice(result.error ?? "Could not add that MOBJ.");
        return;
      }
      const next = result.bytes;
      const parsed = parseCd(next, fileName);
      applyEdit(next, `added MOBJ \"${name}\"`);
      const added = parsed.containers.find((node) => node.offset === result.offset);
      if (added) {
        setSelection({ kind: "container", offset: added.offset, length: added.size });
        setCursor(added.offset);
      }
      const warn =
        doc.variant === "DX11" ? " DX11 header tables are not rebuilt — verify in game." : "";
      setNotice(`Added \"${name}\" (${result.note}).${warn}`);
    },
    [bytes, doc, fileName, applyEdit],
  );

  /** Writes the Flux "Material" or "Texture Slot" u32 of a texture MOBJ in place. */
  const editTextureField = useCallback(
    (node: ContainerNode, field: "material" | "slot", value: number) => {
      if (!bytes || !doc) return;
      if (!Number.isInteger(value) || value < 0 || value > 0xffff) return;
      const fields = textureFields(node, bytes);
      if (!fields) {
        setNotice("That block does not look like a texture entry.");
        return;
      }
      const offset = field === "material" ? fields.materialOffset : fields.slotOffset;
      const current = field === "material" ? fields.material : fields.slot;
      if (current === value) return;
      applyHunks(
        [
          {
            offset,
            before: bytes.slice(offset, offset + 4),
            after: Uint8Array.of(
              value & 0xff,
              (value >>> 8) & 0xff,
              (value >>> 16) & 0xff,
              (value >>> 24) & 0xff,
            ),
          },
        ],
        `${field} ${current} → ${value}`,
      );
      setSelection({ kind: "container", offset: node.offset, length: node.size });
      setCursor(offset);
      setNotice(
        field === "material"
          ? `Material set to ${value}${describeMaterial(value) ? ` (${describeMaterial(value)})` : ""}.`
          : `Texture slot set to ${value}.`,
      );
    },
    [bytes, doc, applyHunks],
  );

  const editParam = useCallback(
    (field: CharacterField, value: number[]) => {
      if (!bytes) return;
      const next = encodeField(field, value);
      if (!next) return;
      applyHunks(
        [
          {
            offset: field.offset,
            before: bytes.slice(field.offset, field.offset + next.length),
            after: next,
          },
        ],
        `${field.label} → ${value.join(", ")}`,
      );
      setNotice(`${field.label} written.`);
    },
    [bytes, applyHunks],
  );

  const reassignTextures = useCallback(
    (candidates: ReassignCandidate[]) => {
      if (!bytes) return;
      const hunks: Hunk[] = [];
      for (const candidate of candidates) {
        if (!candidate.fits) continue;
        const result = encodeReplacement(candidate.slot, candidate.next);
        if (!result.ok) continue;
        hunks.push({
          offset: candidate.slot.offset,
          before: bytes.slice(
            candidate.slot.offset,
            candidate.slot.offset + candidate.slot.byteLength,
          ),
          after: result.bytes,
        });
      }
      if (hunks.length === 0) {
        setNotice("No texture reference had room for that name.");
        return;
      }
      applyHunks(hunks, `reassigned ${hunks.length} texture name${hunks.length === 1 ? "" : "s"}`);
      setNotice(
        `Renamed ${hunks.length} texture reference${hunks.length === 1 ? "" : "s"}. ${
          candidates.length - hunks.length
        } skipped — slot too small.`,
      );
    },
    [bytes, applyHunks],
  );

  const startDrag = (kind: "inspector" | "hex") => (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind,
      x: event.clientX,
      y: event.clientY,
      value: kind === "inspector" ? inspectorWidth : hexHeight,
    };
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "inspector") {
      setInspectorWidth(clamp(drag.value - (event.clientX - drag.x), 300, 760));
    } else {
      setHexHeight(clamp(drag.value - (event.clientY - drag.y), 120, window.innerHeight - 240));
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const nudge = (kind: "inspector" | "hex", delta: number) => {
    if (kind === "inspector") setInspectorWidth((width) => clamp(width + delta, 300, 760));
    else setHexHeight((height) => clamp(height + delta, 120, window.innerHeight - 240));
  };

  const editByte = useCallback(
    (offset: number, value: number) => {
      if (!bytes) return;
      applyHunks(
        [{ offset, before: bytes.slice(offset, offset + 1), after: Uint8Array.of(value) }],
        `byte at ${formatOffset(offset)}`,
      );
      setCursor(offset);
      setSelection({ kind: "byte", offset, length: 1 });
      setNotice(`${formatOffset(offset)} set to 0x${value.toString(16).toUpperCase().padStart(2, "0")}.`);
    },
    [bytes, applyHunks],
  );

  const changed = useMemo(() => {
    const set = new Set<number>();
    if (!original || !bytes) return set;
    const limit = Math.min(original.length, bytes.length);
    for (let index = 0; index < limit; index++) {
      if (original[index] !== bytes[index]) set.add(index);
    }
    return set;
  }, [original, bytes]);

  const dirty = changed.size > 0;

  const highlight = selection
    ? { offset: selection.offset, length: Math.max(1, selection.length) }
    : null;

  const select = useCallback((next: Selection) => {
    setSelection(next);
    setCursor(next.offset);
  }, []);

  const moveCursor = useCallback((offset: number) => {
    setCursor(offset);
    setSelection({ kind: "byte", offset, length: 1 });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        exportFile();
      } else if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exportFile, undo, redo]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    try {
      localStorage.setItem("cd:inspector-w", String(inspectorWidth));
      localStorage.setItem("cd:hex-h", String(hexHeight));
    } catch {
      // Private-mode storage failures are harmless.
    }
  }, [inspectorWidth, hexHeight]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("cd:theme", theme);
    } catch {
      // Private-mode storage failures are harmless.
    }
  }, [theme]);

  useEffect(() => {
    const accent = ACCENTS.find((entry) => entry.id === accentId) ?? ACCENTS[0];
    const root = document.documentElement;
    if (accentEnabled) {
      // Each accent has a dark-interface and a light-interface shade so contrast
      // holds on both backgrounds.
      root.style.setProperty("--accent", theme === "dark" ? accent.dark : accent.light);
      root.style.setProperty("--accent-ink", theme === "dark" ? accent.inkDark : accent.inkLight);
    } else {
      // A disabled accent falls back to the interface ink, so focus, selection
      // and links read as black/white only.
      root.style.setProperty("--accent", "var(--fg)");
      root.style.setProperty("--accent-ink", "var(--bg)");
    }
    try {
      localStorage.setItem("cd:accent", accent.id);
      localStorage.setItem("cd:accent-on", accentEnabled ? "yes" : "no");
    } catch {
      // Private-mode storage failures are harmless.
    }
  }, [accentId, theme, accentEnabled]);

  const fileSize = bytes?.length ?? 0;

  return (
    <div
      className="app"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) void openFile(file);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".cd,.CD,application/octet-stream"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void openFile(file);
          event.target.value = "";
        }}
      />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">CD</span>
          <div className="brand-text">
            <h1>Character Definition Editor</h1>
          </div>
        </div>

        <div className="mode-switch">
          <button
            className={mode === "editor" ? "mode active" : "mode"}
            onClick={() => setMode("editor")}
          >
            Editor
          </button>
          <button
            className={mode === "compare" ? "mode active" : "mode"}
            onClick={() => setMode("compare")}
          >
            Compare
          </button>
        </div>

        <button
          className="theme-toggle"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          <Icon name={theme === "dark" ? "moon" : "sun"} size={16} />
        </button>

        {mode === "editor" && doc && (
          <div className="file-chip">
            <span className={`dot ${dirty ? "dirty" : ""}`} />
            <span className="file-name">{fileName}</span>
            <span className="dim mono">
              {fileSize.toLocaleString()} B · {doc.containers.length} blocks
            </span>
          </div>
        )}

        {mode === "editor" ? (
          <div className="actions">
            <button
              className="icon-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Open .CD file"
              aria-label="Open .CD file"
            >
              <Icon name="open" />
            </button>
            <button
              className="icon-btn"
              onClick={undo}
              disabled={undoStack.length === 0}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <Icon name="undo" />
            </button>
            <button
              className="icon-btn"
              onClick={redo}
              disabled={redoStack.length === 0}
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
            >
              <Icon name="redo" />
            </button>
            <button
              className="icon-btn"
              onClick={revert}
              disabled={!dirty}
              title="Revert to the loaded file"
              aria-label="Revert"
            >
              <Icon name="revert" />
            </button>
            <button
              className="icon-btn"
              onClick={sendToInbox}
              disabled={!bytes}
              title="Send for analysis (writes to samples/)"
              aria-label="Send for analysis"
            >
              <Icon name="upload" />
            </button>
            <button
              className="icon-btn primary"
              onClick={exportFile}
              disabled={!bytes}
              title="Export .CD (Ctrl+S)"
              aria-label="Export .CD"
            >
              <Icon name="download" />
            </button>
          </div>
        ) : (
          <div className="actions" />
        )}
      </header>

      {mode === "editor" && doc && doc.warnings.length > 0 && warningsOpen && (
        <div className="warnings">
          <span className="warnings-title">{doc.warnings.length} structural note{doc.warnings.length === 1 ? "" : "s"}</span>
          <span className="warnings-text">{doc.warnings[0]}</span>
          <button className="link" onClick={() => setWarningsOpen(false)}>
            Dismiss
          </button>
        </div>
      )}

      {mode === "compare" ? (
        <CompareView current={doc} />
      ) : !doc || !bytes ? (
        <main className="empty">
          <div
            className={`dropzone ${dragging ? "over" : ""}`}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="dropzone-icon" aria-hidden="true">
              <span className="brick" />
              <span className="brick offset" />
              <span className="brick" />
            </div>
            <h2>Drop a .CD file here</h2>
            <div className="dropzone-actions">
              <button
                className="btn primary"
                onClick={(event) => {
                  event.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                Choose file
              </button>
            </div>
          </div>
        </main>
      ) : (
        <main
          className={`workspace ${hexOpen ? "" : "hex-collapsed"}`}
          style={
            {
              "--inspector-w": `${inspectorWidth}px`,
              "--hex-h": hexOpen ? `${hexHeight}px` : "auto",
            } as CSSProperties
          }
        >
          <aside className="panel left">
            <div className="panel-tools">
              <div className="tool-group">
                <button
                  className={tab === "blocks" ? "tool-btn active" : "tool-btn"}
                  onClick={() => setTab("blocks")}
                  title={`Tree — ${doc.containers.length} blocks`}
                  aria-label="Tree"
                  aria-pressed={tab === "blocks"}
                >
                  <Icon name="tree" />
                </button>
                <button
                  className={tab === "categories" ? "tool-btn active" : "tool-btn"}
                  onClick={() => setTab("categories")}
                  title="Categories — references grouped by asset family"
                  aria-label="Categories"
                  aria-pressed={tab === "categories"}
                >
                  <Icon name="grid" />
                </button>
                <button
                  className={tab === "references" ? "tool-btn active" : "tool-btn"}
                  onClick={() => setTab("references")}
                  title={`All refs — ${doc.strings.length} references`}
                  aria-label="All refs"
                  aria-pressed={tab === "references"}
                >
                  <Icon name="list" />
                </button>
              </div>
              <button
                className={tab === "settings" ? "tool-btn corner active" : "tool-btn corner"}
                onClick={() => setTab("settings")}
                title="Settings"
                aria-label="Settings"
                aria-pressed={tab === "settings"}
              >
                <Icon name="cog" />
              </button>
            </div>
            {tab === "settings" ? (
              <SettingsPanel
                theme={theme}
                onTheme={setTheme}
                accentId={accentId}
                onAccent={setAccentId}
                accentEnabled={accentEnabled}
                onAccentEnabled={setAccentEnabled}
              />
            ) : tab === "categories" ? (
              <CategoryTree doc={doc} selection={selection} onSelect={select} />
            ) : tab === "blocks" ? (
              <TreeView
                doc={doc}
                selection={selection}
                onSelect={select}
                onEditString={editString}
                onAddMobj={addMobjToGroup}
              />
            ) : (
              <References
                doc={doc}
                filter={filter}
                onFilter={setFilter}
                selection={selection}
                onSelect={select}
              />
            )}
          </aside>

          <section className={`panel center ${hexOpen ? "" : "collapsed"}`}>
            {hexOpen && (
              <div
                className="gutter gutter-h"
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize the hex panel"
                title="Drag to resize the hex panel"
                tabIndex={0}
                onPointerDown={startDrag("hex")}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp") nudge("hex", 16);
                  if (event.key === "ArrowDown") nudge("hex", -16);
                }}
              />
            )}
            <div className="panel-head">
              <button
                className="panel-toggle"
                onClick={() => setHexOpen(!hexOpen)}
                title={hexOpen ? "Collapse the hex panel" : "Expand the hex panel"}
                aria-label={hexOpen ? "Collapse the hex panel" : "Expand the hex panel"}
                aria-expanded={hexOpen}
              >
                <Icon name={hexOpen ? "collapse" : "expand"} size={13} />
                <span>Hex</span>
              </button>
              <span className="dim mono">
                {formatOffset(cursor)} · {bytes.length.toLocaleString()} bytes
              </span>
            </div>
            {hexOpen && (
              <HexView
                bytes={bytes}
                changed={changed}
                depth={doc.depthMap}
                cursor={cursor}
                selection={highlight}
                onCursor={moveCursor}
              />
            )}
          </section>

          <aside className="panel right">
            <div
              className="gutter gutter-v"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize the inspector"
              title="Drag to resize the inspector"
              tabIndex={0}
              onPointerDown={startDrag("inspector")}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") nudge("inspector", 16);
                if (event.key === "ArrowRight") nudge("inspector", -16);
              }}
            />
            <Inspector
              doc={doc}
              selection={selection}
              onEditString={editString}
              onEditByte={editByte}
              onEditTexture={editTextureField}
              onEditParam={editParam}
              onReassign={reassignTextures}
              onSelect={select}
            />
          </aside>
        </main>
      )}

      <footer className="statusbar">
        {mode === "compare" ? (
          <>
            <span className="dim">
              Structural comparison · load one generation per side · files stay in this page
            </span>
            <span className="status-spacer" />
            <button className="link" onClick={() => setMode("editor")}>
              Back to editor
            </button>
          </>
        ) : (
          <>
            <span className="mono">{formatOffset(cursor)}</span>
            <span className="status-sep" />
            <span>{fileSize.toLocaleString()} bytes</span>
            <span className="status-sep" />
            <span>{doc?.containers.length ?? 0} containers</span>
            <span className="status-sep" />
            <span>{doc?.strings.length ?? 0} references</span>
            <span className="status-sep" />
            <span className="dim">SINF {doc?.profile.streamInfoSize ?? 0} B</span>
            <span className="status-sep" />
            <span className={dirty ? "status-dirty" : "dim"}>
              {dirty ? `${changed.size} byte${changed.size === 1 ? "" : "s"} changed` : "unmodified"}
            </span>
            <span className="status-spacer" />
            <span className="dim">Ctrl+S export · Ctrl+Z undo</span>
          </>
        )}
      </footer>

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}
