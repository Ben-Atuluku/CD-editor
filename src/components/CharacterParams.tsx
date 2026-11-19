import { useEffect, useState } from "react";
import type { CdDocument, ContainerNode, StringSlot } from "../lib/cd";
import { readCharacterParams, type CharacterField } from "../lib/character";

interface Props {
  doc: CdDocument;
  node: ContainerNode;
  onEditParam: (field: CharacterField, value: number[]) => void;
  onEditString: (slot: StringSlot, text: string) => void;
}

function toHex(value: number[]): string {
  return `#${value
    .slice(0, 3)
    .map((channel) =>
      Math.round(Math.max(0, Math.min(1, channel)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function fromHex(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    Number.parseInt(clean.slice(0, 2), 16) / 255,
    Number.parseInt(clean.slice(2, 4), 16) / 255,
    Number.parseInt(clean.slice(4, 6), 16) / 255,
  ];
}

/** Number input that only writes when the typed value is valid and different. */
function NumberInput({
  value,
  integer,
  onCommit,
  title,
}: {
  value: number;
  integer: boolean;
  onCommit: (next: number) => void;
  title?: string;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const next = Number(draft);
    const valid =
      draft.trim() !== "" &&
      Number.isFinite(next) &&
      (!integer || Math.round(next) === next);
    if (!valid) {
      setDraft(String(value));
      return;
    }
    if (next !== value) onCommit(next);
  };

  return (
    <input
      className="param-input"
      value={draft}
      inputMode={integer ? "numeric" : "decimal"}
      spellCheck={false}
      title={title}
      onChange={(event) => {
        const next = event.target.value;
        if (/^-?[0-9]*\.?[0-9]*$/.test(next)) setDraft(next);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") setDraft(String(value));
      }}
    />
  );
}

function StringParam({
  doc,
  field,
  onEditString,
}: {
  doc: CdDocument;
  field: CharacterField;
  onEditString: (slot: StringSlot, text: string) => void;
}) {
  const slot = doc.strings.find((candidate) => candidate.offset === field.offset);
  const [draft, setDraft] = useState(slot?.text ?? "");

  useEffect(() => {
    setDraft(slot?.text ?? "");
  }, [slot?.text]);

  if (!slot) return <span className="param-missing">not in this file</span>;

  const commit = () => {
    if (draft === slot.text) return;
    onEditString(slot, draft);
  };

  return (
    <input
      className="text-input"
      value={draft}
      spellCheck={false}
      maxLength={slot.capacity}
      title={`${slot.capacity} characters max — slots never grow`}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") setDraft(slot.text);
      }}
    />
  );
}

/**
 * Flux's "Character Definition" form: the struct at the head of a character
 * root MOBJ. Only shown when the decoder recognised the layout.
 */
export function CharacterParams({ doc, node, onEditParam, onEditString }: Props) {
  const params = readCharacterParams(doc.bytes, node, doc.variant);

  if (!params) return null;

  return (
    <section className="params">
      <div className="params-head">
        <span>Character definition</span>
        <span className="params-count">{params.fields.length} fields</span>
      </div>

      {params.fields.map((field) => {
        if (field.kind === "string") {
          return (
            <div className="param-row" key={field.key}>
              <label className="param-label">{field.label}</label>
              <div className="param-control">
                <StringParam doc={doc} field={field} onEditString={onEditString} />
              </div>
            </div>
          );
        }

        if (field.kind === "byte") {
          return (
            <div className="param-row" key={field.key}>
              <label className="param-label">{field.label}</label>
              <div className="param-control">
                <NumberInput
                  value={field.value[0]}
                  integer
                  onCommit={(next) => onEditParam(field, [next])}
                  title="Stored as one byte (0–255)"
                />
              </div>
            </div>
          );
        }

        if (field.kind === "colour") {
          const hex = toHex(field.value);
          return (
            <div className="param-row" key={field.key}>
              <label className="param-label">{field.label}</label>
              <div className="param-control param-colour">
                <input
                  type="color"
                  className="colour-input"
                  value={hex}
                  onChange={(event) => {
                    const [r, g, b] = fromHex(event.target.value);
                    onEditParam(field, [r, g, b, field.value[3]]);
                  }}
                />
                <span className="param-hex mono">{hex.toUpperCase()}</span>
              </div>
            </div>
          );
        }

        return (
          <div className="param-row" key={field.key}>
            <label className="param-label">{field.label}</label>
            <div className="param-control param-vector">
              {field.value.map((component, index) => (
                <NumberInput
                  key={index}
                  value={component}
                  integer={false}
                  title={`Component ${index}`}
                  onCommit={(next) => {
                    const value = [...field.value];
                    value[index] = next;
                    onEditParam(field, value);
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}

      <p className="hint">
        Written straight into the block header in place. Model type and flags are single bytes; the
        tint and blob-shadow values are four little-endian floats.
      </p>
    </section>
  );
}
