import { useMemo } from "react";
import { formatOffset, type CdDocument } from "../lib/cd";
import type { Selection } from "../lib/selection";

interface Props {
  doc: CdDocument;
  filter: string;
  onFilter: (value: string) => void;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
}

export function References({ doc, filter, onFilter, selection, onSelect }: Props) {
  const containerById = useMemo(
    () => new Map(doc.containers.map((node) => [node.id, node])),
    [doc],
  );

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return doc.strings;
    return doc.strings.filter(
      (slot) =>
        slot.text.toLowerCase().includes(needle) ||
        formatOffset(slot.offset).toLowerCase().includes(needle),
    );
  }, [doc.strings, filter]);

  return (
    <div className="references">
      <div className="filter-row">
        <input
          className="filter-input"
          placeholder="Filter references…"
          value={filter}
          onChange={(event) => onFilter(event.target.value)}
          spellCheck={false}
        />
        <span className="filter-count">
          {visible.length}/{doc.strings.length}
        </span>
      </div>

      <div className="ref-list">
        {visible.length === 0 && <div className="ref-empty">No references match “{filter}”.</div>}
        {visible.map((slot) => {
          const active = selection?.kind === "string" && selection.offset === slot.offset;
          const owner = slot.containerId ? containerById.get(slot.containerId) : null;
          return (
            <button
              className={`ref-row ${active ? "active" : ""} ${slot.readOnly ? "readonly" : ""}`}
              key={slot.id}
              onClick={() =>
                onSelect({ kind: "string", offset: slot.offset, length: slot.byteLength })
              }
              title={`${formatOffset(slot.offset)} · ${slot.byteLength} bytes · max ${slot.capacity} characters`}
            >
              <span className="ref-text">{slot.text}</span>
              <span className="ref-meta">
                <span
                  className={`ref-owner ${
                    slot.readOnly ? "stream" : slot.origin === "pool" ? "pool" : ""
                  }`}
                >
                  {slot.readOnly ? "SINF" : slot.origin === "pool" ? "POOL" : owner?.fourcc ?? "—"}
                </span>
                {formatOffset(slot.offset)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
