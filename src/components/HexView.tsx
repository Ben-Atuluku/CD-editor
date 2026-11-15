import { useEffect, useMemo, useRef, useState } from "react";
import { formatOffset } from "../lib/cd";

const BYTES_PER_ROW = 16;
const ROW_HEIGHT = 22;

interface Props {
  bytes: Uint8Array;
  changed: Set<number>;
  depth: Uint8Array;
  cursor: number;
  selection: { offset: number; length: number } | null;
  onCursor: (offset: number) => void;
}

function safeChar(byte: number): string {
  return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ".";
}

export function HexView({ bytes, changed, depth, cursor, selection, onCursor }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(560);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewport(element.clientHeight));
    observer.observe(element);
    setViewport(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const row = Math.floor(cursor / BYTES_PER_ROW);
    const top = row * ROW_HEIGHT;
    const visibleTop = element.scrollTop;
    const visibleBottom = visibleTop + element.clientHeight;
    if (top < visibleTop + ROW_HEIGHT || top + ROW_HEIGHT > visibleBottom - ROW_HEIGHT) {
      element.scrollTop = Math.max(0, top - element.clientHeight / 2);
    }
  }, [cursor]);

  const totalRows = Math.ceil(bytes.length / BYTES_PER_ROW);
  const firstRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 3);
  const lastRow = Math.min(totalRows, firstRow + Math.ceil(viewport / ROW_HEIGHT) + 8);

  const rows = useMemo(() => {
    const out: number[] = [];
    for (let row = firstRow; row < lastRow; row++) out.push(row);
    return out;
  }, [firstRow, lastRow]);

  const selectionStart = selection ? selection.offset : -1;
  const selectionEnd = selection ? selection.offset + selection.length : -1;

  return (
    <div className="hex-wrap">
      <div className="hex-head">
        <span className="hex-head-offset">OFFSET</span>
        <span className="hex-head-bytes">00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F</span>
        <span className="hex-head-ascii">ASCII</span>
      </div>
      <div
        className="hex-scroll"
        ref={scrollerRef}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div className="hex-grid" style={{ height: totalRows * ROW_HEIGHT }}>
          {rows.map((row) => {
            const start = row * BYTES_PER_ROW;
            const cells = [];
            const ascii = [];
            for (let index = 0; index < BYTES_PER_ROW; index++) {
              const offset = start + index;
              if (offset >= bytes.length) {
                cells.push(
                  <span className="hex-cell empty" key={`e${index}`}>
                    {"  "}
                  </span>,
                );
                ascii.push(
                  <span className="hex-char empty" key={`ea${index}`}>
                    {" "}
                  </span>,
                );
                continue;
              }
              const byte = bytes[offset];
              const classes = ["hex-cell"];
              if (offset === cursor) classes.push("cursor");
              if (offset >= selectionStart && offset < selectionEnd) classes.push("selected");
              if (changed.has(offset)) classes.push("changed");
              const level = depth[offset];
              if (level) classes.push(`d${Math.min(level, 5)}`);
              cells.push(
                <span
                  className={classes.join(" ")}
                  key={offset}
                  onMouseDown={() => onCursor(offset)}
                >
                  {byte.toString(16).toUpperCase().padStart(2, "0")}
                </span>,
              );
              ascii.push(
                <span
                  className={`hex-char ${offset === cursor ? "cursor" : ""} ${
                    offset >= selectionStart && offset < selectionEnd ? "selected" : ""
                  }`}
                  key={`a${offset}`}
                  onMouseDown={() => onCursor(offset)}
                >
                  {safeChar(byte)}
                </span>,
              );
            }

            return (
              <div className="hex-row" style={{ top: row * ROW_HEIGHT }} key={row}>
                <span className="hex-offset">{formatOffset(start).slice(2)}</span>
                <span className="hex-bytes">{cells}</span>
                <span className="hex-ascii">{ascii}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="hex-legend">
        <span>
          <i className="swatch d1" /> OLST
        </span>
        <span>
          <i className="swatch d2" /> nested
        </span>
        <span>
          <i className="swatch changed" /> edited
        </span>
        <span className="hex-legend-hint">Click a byte to inspect it.</span>
      </div>
    </div>
  );
}
