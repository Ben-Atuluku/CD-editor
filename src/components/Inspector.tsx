import { useEffect, useState } from "react";
import {
  containerPath,
  formatOffset,
  type CdDocument,
  type ContainerNode,
  type StringSlot,
} from "../lib/cd";
import type { Selection } from "../lib/selection";
import { BODY_PARTS, describeMaterial } from "../lib/bodyParts";
import { textureFields } from "../lib/texture";
import type { CharacterField } from "../lib/character";
import { parseTextureName, planReassign, type ReassignCandidate } from "../lib/reassign";
import { CharacterParams } from "./CharacterParams";

type TextureEdit = (node: ContainerNode, field: "material" | "slot", value: number) => void;

interface Props {
  doc: CdDocument;
  selection: Selection | null;
  onEditString: (slot: StringSlot, text: string) => void;
  onEditByte: (offset: number, value: number) => void;
  onEditTexture: TextureEdit;
  onEditParam: (field: CharacterField, value: number[]) => void;
  onReassign: (candidates: ReassignCandidate[]) => void;
  onSelect: (selection: Selection) => void;
}

/**
 * Flux shows a character texture as three fields: Material, Texture Slot and
 * Texture File. The first two are u32s in the MOBJ header, so they can be
 * written in place; the file is the reference slot below this form.
 */
function TextureForm({
  node,
  doc,
  onEditTexture,
  onReassign,
}: {
  node: ContainerNode;
  doc: CdDocument;
  onEditTexture: TextureEdit;
  onReassign: (candidates: ReassignCandidate[]) => void;
}) {
  const fields = textureFields(node, doc.bytes);
  const [slotDraft, setSlotDraft] = useState(fields ? String(fields.slot) : "");
  const currentToken = node.strings[0] ? parseTextureName(node.strings[0].text)?.token ?? "" : "";
  const [token, setToken] = useState(currentToken);

  useEffect(() => {
    setSlotDraft(fields ? String(fields.slot) : "");
  }, [node.id, fields?.slot]);

  useEffect(() => {
    setToken(currentToken);
  }, [node.id, currentToken]);

  const parent = node.parentId
    ? doc.containers.find((candidate) => candidate.id === node.parentId) ?? null
    : null;
  const groupSlots = (parent?.children ?? [])
    .filter((child) => child.fourcc === "MOBJ")
    .map((child) => child.strings[0])
    .filter((slot): slot is StringSlot => Boolean(slot));
  const candidates = planReassign(groupSlots, token);
  const fitting = candidates.filter((candidate) => candidate.fits).length;

  if (!fields) return null;

  const mapped = describeMaterial(fields.material);

  const commitSlot = () => {
    const value = Number.parseInt(slotDraft, 10);
    if (!Number.isFinite(value) || value < 0 || value > 0xffff) {
      setSlotDraft(String(fields.slot));
      return;
    }
    if (value !== fields.slot) onEditTexture(node, "slot", value);
  };

  return (
    <div className="texture-form">
      <div className="texture-row">
        <label className="field-label" htmlFor="texture-material">
          Material
        </label>
        <div className="texture-control">
          <select
            id="texture-material"
            className="select-input"
            value={fields.material}
            onChange={(event) => onEditTexture(node, "material", Number(event.target.value))}
          >
            {!mapped && <option value={fields.material}>{fields.material} — unmapped</option>}
            {BODY_PARTS.map((part) => (
              <option key={`${part.value}-${part.label}`} value={part.value}>
                {part.value} — {part.label}
              </option>
            ))}
          </select>
          <span className="texture-part">{mapped ?? "Not a known body part"}</span>
        </div>
      </div>

      <div className="texture-row">
        <label className="field-label" htmlFor="texture-slot">
          Texture slot
        </label>
        <div className="texture-control">
          <input
            id="texture-slot"
            className="text-input"
            inputMode="numeric"
            value={slotDraft}
            spellCheck={false}
            onChange={(event) => {
              if (/^[0-9]{0,3}$/.test(event.target.value)) setSlotDraft(event.target.value);
            }}
            onBlur={commitSlot}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitSlot();
              if (event.key === "Escape") setSlotDraft(String(fields.slot));
            }}
          />
        </div>
      </div>

      <details className="part-map">
        <summary>Body part numbers</summary>
        <ul>
          {BODY_PARTS.map((part) => (
            <li key={`${part.value}-${part.label}`}>
              <span className="part-number">{part.value}</span>
              {part.label}
            </li>
          ))}
        </ul>
      </details>

      {groupSlots.length > 1 && (
        <details className="reassign">
          <summary>
            Reassign textures <span className="beta-tag">beta</span>
          </summary>
          <p className="hint">
            Renames the character token across every texture in this group. Slots never grow, so a
            longer name only applies to references with room for it.
          </p>
          <input
            className="text-input"
            value={token}
            spellCheck={false}
            placeholder="OURCHOICE"
            onChange={(event) => setToken(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Escape") setToken(currentToken);
            }}
          />
          <ul className="reassign-list">
            {candidates.slice(0, 12).map((candidate) => (
              <li key={candidate.slot.id} className={candidate.fits ? "" : "bad"}>
                <span>{candidate.slot.text.split(/[\\/]/).pop()}</span>
                <span className="reassign-arrow">→</span>
                <span>{candidate.next.split(/[\\/]/).pop()}</span>
                {!candidate.fits && <span className="reassign-over">too long</span>}
              </li>
            ))}
            {candidates.length === 0 && (
              <li className="reassign-empty">Nothing to rename with that token.</li>
            )}
          </ul>
          <button className="btn" disabled={fitting === 0} onClick={() => onReassign(candidates)}>
            Apply {fitting} rename{fitting === 1 ? "" : "s"}
          </button>
        </details>
      )}
    </div>
  );
}

function StringInspector({
  slot,
  doc,
  onEditString,
  onEditTexture,
  onEditParam,
  onReassign,
}: {
  slot: StringSlot;
  doc: CdDocument;
  onEditString: (slot: StringSlot, text: string) => void;
  onEditTexture: TextureEdit;
  onEditParam: (field: CharacterField, value: number[]) => void;
  onReassign: (candidates: ReassignCandidate[]) => void;
}) {
  const [draft, setDraft] = useState(slot.text);

  useEffect(() => {
    setDraft(slot.text);
  }, [slot.id, slot.text]);

  const path = containerPath(doc, slot.containerId);
  const dirty = draft !== slot.text;
  const node = slot.containerId
    ? doc.containers.find((candidate) => candidate.id === slot.containerId) ?? null
    : null;
  const texture = textureFields(node, doc.bytes);

  const commit = () => {
    if (!dirty || slot.readOnly) return;
    onEditString(slot, draft);
  };

  return (
    <div className="inspector-body">
      <div className="kind-tag">
        {slot.readOnly ? "STREAMINFO STRING" : "ASSET REFERENCE"}
      </div>
      <div className="breadcrumb">
        {slot.readOnly ? (
          <span>StreamInfo header</span>
        ) : slot.origin === "pool" ? (
          <span>Asset name pool</span>
        ) : path.length ? (
          path.map((node, index) => (
            <span key={node.id}>
              {index > 0 && <span className="crumb-sep">/</span>}
              <span className="crumb">{node.fourcc}</span>
            </span>
          ))
        ) : (
          <span>Loose block</span>
        )}
      </div>

      {node && (
        <CharacterParams
          doc={doc}
          node={node}
          onEditParam={onEditParam}
          onEditString={onEditString}
        />
      )}

      {texture && node && (
        <TextureForm
          node={node}
          doc={doc}
          onEditTexture={onEditTexture}
          onReassign={onReassign}
        />
      )}

      <label className="field-label" htmlFor="reference-value">
        {texture ? "Texture file" : "Value"}
      </label>
      <input
        id="reference-value"
        className="text-input"
        value={draft}
        spellCheck={false}
        readOnly={slot.readOnly}
        maxLength={slot.capacity}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setDraft(slot.text);
        }}
      />

      <div className="counter-row">
        <span className={draft.length === slot.capacity ? "counter over" : "counter"}>
          {draft.length} / {slot.capacity} chars
        </span>
        <span className="dim">{slot.byteLength} B slot</span>
      </div>

      <div className="button-row">
        <button
          className="btn primary"
          onClick={commit}
          disabled={!dirty || slot.readOnly}
        >
          Apply in place
        </button>
        <button className="btn" onClick={() => setDraft(slot.text)} disabled={!dirty}>
          Reset
        </button>
      </div>

      {slot.readOnly ? (
        <p className="hint">
          This string sits in the StreamInfo header. Repointing it would break the file, so it is
          shown for inspection only — use byte editing if you are sure.
        </p>
      ) : (
        <p className="hint">
          Slots never grow. Shorter names are zero-filled across the remaining{" "}
          {slot.byteLength - draft.length} bytes, which the game reads as an empty tail.
        </p>
      )}

      <dl className="kv">
        <div>
          <dt>Offset</dt>
          <dd>{formatOffset(slot.offset)}</dd>
        </div>
        <div>
          <dt>Encoding</dt>
          <dd>{slot.encoding === "ascii" ? "ASCII / Latin-1" : "UTF-16 LE"}</dd>
        </div>
        <div>
          <dt>Raw length</dt>
          <dd>{slot.byteLength} bytes</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{slot.readOnly ? "StreamInfo" : path[path.length - 1]?.fourcc ?? "—"}</dd>
        </div>
      </dl>
    </div>
  );
}

function ContainerInspector({
  node,
  doc,
  onSelect,
  onEditTexture,
  onEditParam,
  onEditString,
  onReassign,
}: {
  node: ContainerNode;
  doc: CdDocument;
  onSelect: (selection: Selection) => void;
  onEditTexture: TextureEdit;
  onEditParam: (field: CharacterField, value: number[]) => void;
  onEditString: (slot: StringSlot, text: string) => void;
  onReassign: (candidates: ReassignCandidate[]) => void;
}) {
  const path = containerPath(doc, node.id);
  const parent = node.parentId
    ? doc.containers.find((candidate) => candidate.id === node.parentId) ?? null
    : null;

  return (
    <div className="inspector-body">
      <div className="kind-tag">CONTAINER</div>
      <div className="breadcrumb">
        {path.map((item, index) => (
          <span key={item.id}>
            {index > 0 && <span className="crumb-sep">/</span>}
            <span className="crumb">{item.fourcc}</span>
          </span>
        ))}
      </div>

      <CharacterParams
        doc={doc}
        node={node}
        onEditParam={onEditParam}
        onEditString={onEditString}
      />

      {node.fourcc === "MOBJ" && (
        <TextureForm
          node={node}
          doc={doc}
          onEditTexture={onEditTexture}
          onReassign={onReassign}
        />
      )}

      <dl className="kv">
        <div>
          <dt>FourCC</dt>
          <dd>{node.fourcc}</dd>
        </div>
        <div>
          <dt>Offset</dt>
          <dd>{formatOffset(node.offset)}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{node.size} bytes</dd>
        </div>
        <div>
          <dt>Header</dt>
          <dd>{node.headerLength} bytes</dd>
        </div>
        {node.fourcc === "OLST" && (
          <>
            <div>
              <dt>OLST type</dt>
              <dd>{node.type ?? "—"}</dd>
            </div>
            <div>
              <dt>Declared items</dt>
              <dd>{node.count ?? "—"}</dd>
            </div>
          </>
        )}
        {node.fourcc === "MOBJ" && (
          <div>
            <dt>MOBJ ids</dt>
            <dd>
              {node.ids?.[0] ?? "—"} / {node.ids?.[1] ?? "—"}
            </dd>
          </div>
        )}
        <div>
          <dt>Child blocks</dt>
          <dd>{node.children.length}</dd>
        </div>
        <div>
          <dt>References</dt>
          <dd>{node.strings.length}</dd>
        </div>
      </dl>

      <div className="button-row">
        <button
          className="btn"
          disabled={!node.strings[0]}
          onClick={() =>
            node.strings[0] &&
            onSelect({
              kind: "string",
              offset: node.strings[0].offset,
              length: node.strings[0].byteLength,
            })
          }
        >
          First reference
        </button>
        <button
          className="btn"
          disabled={!parent}
          onClick={() =>
            parent &&
            onSelect({ kind: "container", offset: parent.offset, length: parent.size })
          }
        >
          Parent block
        </button>
      </div>
      <p className="hint">
        Container sizes and headers are structural. Editing them here is not offered — the hex
        view still lets you patch any byte deliberately.
      </p>
    </div>
  );
}

function ByteInspector({
  doc,
  offset,
  onEditByte,
}: {
  doc: CdDocument;
  offset: number;
  onEditByte: (offset: number, value: number) => void;
}) {
  const byte = doc.bytes[offset] ?? 0;
  const [draft, setDraft] = useState(byte.toString(16).toUpperCase().padStart(2, "0"));

  useEffect(() => {
    setDraft(byte.toString(16).toUpperCase().padStart(2, "0"));
  }, [offset, byte]);

  const view = new DataView(doc.bytes.buffer, doc.bytes.byteOffset, doc.bytes.byteLength);
  const has = (count: number) => offset + count <= doc.bytes.length;

  const commit = () => {
    const value = Number.parseInt(draft, 16);
    if (Number.isNaN(value) || value < 0 || value > 255) return;
    onEditByte(offset, value);
    setDraft(value.toString(16).toUpperCase().padStart(2, "0"));
  };

  return (
    <div className="inspector-body">
      <div className="kind-tag">BYTE</div>
      <div className="breadcrumb">
        <span className="crumb">{formatOffset(offset)}</span>
      </div>

      <label className="field-label" htmlFor="byte-value">
        Patch byte (hex)
      </label>
      <div className="byte-edit-row">
        <input
          id="byte-value"
          className="text-input mono"
          value={draft}
          maxLength={2}
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value.toUpperCase();
            if (/^[0-9A-F]{0,2}$/.test(next)) setDraft(next);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
          }}
        />
        <button className="btn primary" onClick={commit} disabled={draft.length !== 2}>
          Write
        </button>
      </div>

      <dl className="kv">
        <div>
          <dt>Hex</dt>
          <dd>{byte.toString(16).toUpperCase().padStart(2, "0")}</dd>
        </div>
        <div>
          <dt>Unsigned</dt>
          <dd>{byte}</dd>
        </div>
        <div>
          <dt>Signed</dt>
          <dd>{byte > 127 ? byte - 256 : byte}</dd>
        </div>
        <div>
          <dt>Character</dt>
          <dd>{byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : "·"}</dd>
        </div>
        {has(2) && (
          <div>
            <dt>u16 LE</dt>
            <dd>{view.getUint16(offset, true)}</dd>
          </div>
        )}
        {has(4) && (
          <div>
            <dt>u32 LE</dt>
            <dd>{view.getUint32(offset, true)}</dd>
          </div>
        )}
        {has(4) && (
          <div>
            <dt>float32</dt>
            <dd>{view.getFloat32(offset, true).toPrecision(6)}</dd>
          </div>
        )}
      </dl>
      <p className="hint">
        Arrow keys move the cursor in the hex view. Changes are held in memory until you export a
        copy.
      </p>
    </div>
  );
}

export function Inspector({
  doc,
  selection,
  onEditString,
  onEditByte,
  onEditTexture,
  onEditParam,
  onReassign,
  onSelect,
}: Props) {
  if (!selection) {
    return (
      <div className="inspector">
        <div className="panel-head compact">
          <span>Inspector</span>
        </div>
        <div className="inspector-empty">
          Select a reference, container, or byte to inspect it.
        </div>
      </div>
    );
  }

  let body = null;
  if (selection.kind === "string") {
    const slot = doc.strings.find((candidate) => candidate.offset === selection.offset);
    body = slot ? (
      <StringInspector
        slot={slot}
        doc={doc}
        onEditString={onEditString}
        onEditTexture={onEditTexture}
        onEditParam={onEditParam}
        onReassign={onReassign}
      />
    ) : (
      <div className="inspector-empty">That reference is no longer present.</div>
    );
  } else if (selection.kind === "container") {
    const node = doc.containers.find((candidate) => candidate.offset === selection.offset);
    body = node ? (
      <ContainerInspector
        node={node}
        doc={doc}
        onSelect={onSelect}
        onEditTexture={onEditTexture}
        onEditParam={onEditParam}
        onEditString={onEditString}
        onReassign={onReassign}
      />
    ) : (
      <div className="inspector-empty">That container is no longer present.</div>
    );
  } else {
    body = <ByteInspector doc={doc} offset={selection.offset} onEditByte={onEditByte} />;
  }

  return (
    <div className="inspector">
      <div className="panel-head compact">
        <span>Inspector</span>
        <span className="dim mono">{formatOffset(selection.offset)}</span>
      </div>
      {body}
    </div>
  );
}
