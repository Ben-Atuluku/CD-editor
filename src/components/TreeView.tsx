import { useState } from "react";
import { formatOffset, type CdDocument, type ContainerNode, type StringSlot } from "../lib/cd";
import {
  CATEGORY_INFO,
  TYPE_HINTS,
  classifyReference,
  shortReferenceName,
  type CategoryId,
} from "../lib/categories";
import type { Selection } from "../lib/selection";
import { describeMaterial } from "../lib/bodyParts";
import { textureFields } from "../lib/texture";

interface Props {
  doc: CdDocument;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  onEditString: (slot: StringSlot, text: string) => void;
  onAddMobj: (olstId: string, name: string) => void;
  tagColors: boolean;
}

function InlineEditor({
  value,
  maxLength,
  placeholder,
  onCommit,
  onCancel,
}: {
  value: string;
  maxLength?: number;
  placeholder?: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <input
      className="tree-input"
      autoFocus
      spellCheck={false}
      placeholder={placeholder}
      value={draft}
      maxLength={maxLength}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(draft);
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => onCommit(draft)}
    />
  );
}

function dominantCategory(node: ContainerNode): CategoryId | null {
  const counts = new Map<CategoryId, number>();
  let classified = 0;

  const walk = (current: ContainerNode) => {
    for (const slot of current.strings) {
      const category = classifyReference(slot.text);
      if (!category) continue;
      classified++;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    current.children.forEach(walk);
  };
  walk(node);

  let best: CategoryId | null = null;
  let bestCount = 0;
  for (const [category, count] of counts) {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }
  return best && classified >= 2 && bestCount / classified >= 0.5 ? best : null;
}

function blockTitle(node: ContainerNode): string {
  if (node.fourcc !== "OLST") return node.label ? shortReferenceName(node.label) : "(empty block)";
  if (node.type === 0) return "Character";
  const hinted = node.type != null ? TYPE_HINTS[node.type] : undefined;
  if (hinted) return CATEGORY_INFO[hinted].label;
  const category = dominantCategory(node);
  if (category) return CATEGORY_INFO[category].label;
  return `OLST type ${node.type ?? "?"}`;
}

function blockMeta(node: ContainerNode): string {
  if (node.fourcc === "OLST") {
    return `type ${node.type ?? "?"} · ${node.children.length} block${
      node.children.length === 1 ? "" : "s"
    }`;
  }
  if (node.strings.length > 1) return `${node.strings.length} strings`;
  return node.strings.length === 0 ? "empty" : "";
}

export function TreeView({ doc, selection, onSelect, onEditString, onAddMobj, tagColors }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  // MOBJ leaves collapse by default; OLST groups open.
  const isCollapsed = (node: ContainerNode) =>
    collapsed.has(node.id) || (node.fourcc !== "OLST" && !collapsed.has(`open:${node.id}`));

  const toggle = (node: ContainerNode) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      const openKey = `open:${node.id}`;
      const defaultOpen = node.fourcc === "OLST";
      const currentlyOpen = defaultOpen ? !next.has(node.id) : next.has(openKey);
      if (currentlyOpen) {
        if (defaultOpen) next.add(node.id);
        else next.delete(openKey);
      } else if (defaultOpen) {
        next.delete(node.id);
      } else {
        next.add(openKey);
      }
      return next;
    });
  };

  const selectNode = (node: ContainerNode) => {
    if (node.strings[0]) {
      onSelect({
        kind: "string",
        offset: node.strings[0].offset,
        length: node.strings[0].byteLength,
      });
      return;
    }
    onSelect({ kind: "container", offset: node.offset, length: node.size });
  };

  const startEdit = (slot: StringSlot) => {
    if (slot.readOnly) return;
    onSelect({ kind: "string", offset: slot.offset, length: slot.byteLength });
    setEditingId(slot.id);
  };

  const commitEdit = (slot: StringSlot, next: string) => {
    if (editingId !== slot.id) return;
    setEditingId(null);
    if (next !== slot.text) onEditString(slot, next);
  };

  const commitAdd = (node: ContainerNode, name: string) => {
    if (addingId !== node.id) return;
    setAddingId(null);
    const clean = name.trim();
    if (clean.length > 0) onAddMobj(node.id, clean);
  };

  const renderNode = (node: ContainerNode) => {
    const open = !isCollapsed(node);
    const active =
      (selection?.kind === "container" && selection.offset === node.offset) ||
      (selection?.kind === "string" && node.strings.some((slot) => slot.offset === selection.offset));
    const expandable = node.children.length > 0 || node.strings.length > 1;
    const primary = node.strings[0];
    // Texture entries carry Flux's material number, which names the body part.
    const texture = textureFields(node, doc.bytes);
    const part = texture ? describeMaterial(texture.material) : null;
    const editingPrimary = Boolean(primary && editingId === primary.id);

    return (
      <div key={node.id}>
        <div
          className={`tree-row ${active ? "active" : ""}`}
          style={{ paddingLeft: 8 + node.depth * 14 }}
          onClick={() => selectNode(node)}
          onDoubleClick={() => primary && startEdit(primary)}
        >
          <button
            className="tree-chevron"
            aria-label={open ? "Collapse" : "Expand"}
            onClick={(event) => {
              event.stopPropagation();
              if (expandable) toggle(node);
            }}
            disabled={!expandable}
          >
            {expandable && <span className="tree-chevron-glyph">{open ? "\u25be" : "\u25b8"}</span>}
          </button>
          <span className={`badge ${node.fourcc === "OLST" ? "olst" : "mobj"}`}>{node.fourcc}</span>

          {primary && editingPrimary ? (
            <InlineEditor
              value={primary.text}
              maxLength={primary.capacity}
              onCommit={(next) => commitEdit(primary, next)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <span className="tree-title" title={node.label ?? blockTitle(node)}>
              {blockTitle(node)}
            </span>
          )}

          {primary && !primary.readOnly && !editingPrimary && (
            <button
              className="row-action"
              title="Edit this reference in place"
              onClick={(event) => {
                event.stopPropagation();
                startEdit(primary);
              }}
            >
              edit
            </button>
          )}

          {part ? (
            <span
              className="tree-part"
              title={`Flux material ${texture?.material} · texture slot ${texture?.slot}`}
            >
              {part}
            </span>
          ) : (
            <>
              {blockMeta(node) && <span className="tree-meta">{blockMeta(node)}</span>}
              <span className="tree-size">{node.size} B</span>
            </>
          )}
        </div>

        {open && node.children.length > 0 && (
          <div>{node.children.map((child) => renderNode(child))}</div>
        )}

        {open && node.fourcc === "OLST" && (
          <div className="tree-add-row" style={{ paddingLeft: 34 + node.depth * 14 }}>
            {addingId === node.id ? (
              <>
                <InlineEditor
                  value=""
                  placeholder="New MOBJ name"
                  onCommit={(next) => commitAdd(node, next)}
                  onCancel={() => setAddingId(null)}
                />
                <button
                  className="row-action strong"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commitAdd(node, "")}
                >
                  cancel
                </button>
              </>
            ) : (
              <button
                className="tree-add"
                onClick={(event) => {
                  event.stopPropagation();
                  setAddingId(node.id);
                }}
              >
                + add MOBJ
              </button>
            )}
          </div>
        )}

        {open && node.strings.length > (node.fourcc === "OLST" ? 0 : 1) && (
          <div className="tree-refs" style={{ paddingLeft: 34 + node.depth * 14 }}>
            {(node.fourcc === "OLST" ? node.strings : node.strings.slice(1)).map((slot) =>
              editingId === slot.id ? (
                <div className="tree-ref-line" key={slot.id}>
                  <InlineEditor
                    value={slot.text}
                    maxLength={slot.capacity}
                    onCommit={(next) => commitEdit(slot, next)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <div className="tree-ref-line" key={slot.id}>
                  <button
                    className={`tree-ref ${
                      selection?.kind === "string" && selection.offset === slot.offset ? "active" : ""
                    }`}
                    title={`${formatOffset(slot.offset)} — ${slot.capacity} characters max`}
                    onClick={() =>
                      onSelect({ kind: "string", offset: slot.offset, length: slot.byteLength })
                    }
                    onDoubleClick={() => startEdit(slot)}
                  >
                    {slot.text}
                  </button>
                  {!slot.readOnly && (
                    <button
                      className="row-action"
                      title="Edit in place"
                      onClick={() => startEdit(slot)}
                    >
                      edit
                    </button>
                  )}
                </div>
              ),
            )}
          </div>
        )}
      </div>
    );
  };

  if (doc.containers.length === 0) {
    return (
      <div className="tree-empty">
        No OLST/MOBJ blocks were detected. Use the hex view to inspect this file as raw bytes.
      </div>
    );
  }

  return (
    <div className={`tree ${tagColors ? "tag-colors" : ""}`}>
      {doc.stringPool && (
        <div className="tree-pool">
          <span className="badge pool">POOL</span>
          <span className="tree-meta">{doc.stringPool.count} asset names</span>
          <button
            className="link"
            onClick={() => onSelect({ kind: "byte", offset: doc.stringPool?.start ?? 0, length: 1 })}
          >
            inspect
          </button>
        </div>
      )}
      {doc.variant === "NXG" && doc.streamInfo && doc.streamInfo.strings.length > 0 && (
        <div className="tree-pool">
          <span className="badge pool">HEADER</span>
          <span className="tree-meta">
            {doc.streamInfo.strings.length} schema names · {doc.profile.streamInfoSize.toLocaleString()} B
          </span>
          <button className="link" onClick={() => onSelect({ kind: "byte", offset: 0, length: 1 })}>
            inspect
          </button>
        </div>
      )}
      {doc.roots.map((node) => renderNode(node))}
      <p className="cat-note">
        {doc.stringPool
          ? "DX11 layout: asset names live in the header pool; OLST groups and their MOBJ entries follow."
          : doc.variant === "NXG"
            ? "NXG layout: a StreamInfo schema block comes first, then OLST groups whose MOBJ entries hold length-prefixed inline names."
            : "OLST groups contain MOBJ entries. Group headings are inferred from the names they hold."}
      </p>
    </div>
  );
}
