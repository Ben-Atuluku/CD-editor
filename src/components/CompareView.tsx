import { useEffect, useMemo, useRef, useState } from "react";
import { parseCd, type CdDocument } from "../lib/cd";
import {
  buildSignature,
  metricRows,
  outlineRows,
  referenceDiff,
  type OutlineEntry,
} from "../lib/compare";

interface Props {
  current: CdDocument | null;
}

function Slot({
  label,
  doc,
  accent,
  onFile,
  onUseCurrent,
  hasCurrent,
}: {
  label: string;
  doc: CdDocument | null;
  accent: string;
  onFile: (file: File) => void;
  onUseCurrent: () => void;
  hasCurrent: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`diff-slot ${doc ? "filled" : ""}`} style={{ borderTopColor: accent }}>
      <input
        ref={inputRef}
        type="file"
        accept=".cd,.CD,application/octet-stream"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
      <div className="diff-slot-head">
        <span className="diff-slot-label" style={{ background: accent }}>
          {label}
        </span>
        {doc ? (
          <span className="diff-slot-name" title={doc.fileName}>
            {doc.fileName}
          </span>
        ) : (
          <span className="diff-slot-name empty">No file loaded</span>
        )}
        <button className="btn small" onClick={() => inputRef.current?.click()}>
          {doc ? "Replace" : "Choose file"}
        </button>
      </div>
      {doc ? (
        <div className="diff-slot-meta">
          <span className="variant-chip">{doc.variant}</span>
          <span>{doc.size.toLocaleString()} B</span>
          <span>{doc.containers.length} blocks</span>
          <span>{doc.strings.length} refs</span>
          {doc.stringPool && <span>pool {doc.stringPool.count}</span>}
        </div>
      ) : (
        <div className="diff-slot-meta">
          <span>Load one generation per side to compare.</span>
          {hasCurrent && (
            <button className="link" onClick={onUseCurrent}>
              Use the open file
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function OutlineCell({ entry, accent }: { entry: OutlineEntry | null; accent: string }) {
  if (!entry) return <div className="diff-cell empty">—</div>;
  return (
    <div className="diff-cell">
      <span
        className="diff-badge"
        style={{ color: accent, borderColor: `${accent}55`, background: `${accent}14` }}
      >
        {entry.fourcc}
      </span>
      <span className="diff-meta" style={{ paddingLeft: Math.min(entry.depth, 6) * 9 }}>
        {entry.meta}
      </span>
      <span className="diff-size">{entry.size} B</span>
    </div>
  );
}

export function CompareView({ current }: Props) {
  const [a, setA] = useState<CdDocument | null>(null);
  const [b, setB] = useState<CdDocument | null>(null);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (!seeded && current) {
      setA(current);
      setSeeded(true);
    }
  }, [current, seeded]);

  const load = async (file: File, setter: (doc: CdDocument) => void) => {
    const buffer = await file.arrayBuffer();
    setter(parseCd(new Uint8Array(buffer), file.name));
  };

  const signatureA = useMemo(() => (a ? buildSignature(a) : null), [a]);
  const signatureB = useMemo(() => (b ? buildSignature(b) : null), [b]);

  const metrics = useMemo(
    () => (signatureA && signatureB ? metricRows(signatureA, signatureB) : []),
    [signatureA, signatureB],
  );
  const outline = useMemo(
    () => (signatureA && signatureB ? outlineRows(signatureA, signatureB) : []),
    [signatureA, signatureB],
  );
  const references = useMemo(
    () => (signatureA && signatureB ? referenceDiff(signatureA, signatureB) : null),
    [signatureA, signatureB],
  );

  const totalOutline = Math.max(a?.containers.length ?? 0, b?.containers.length ?? 0);

  return (
    <main className="compare">
      <div className="diff-slots">
        <Slot
          label="A"
          doc={a}
          accent="#ffcf4d"
          onFile={(file) => void load(file, setA)}
          onUseCurrent={() => current && setA(current)}
          hasCurrent={Boolean(current)}
        />
        <Slot
          label="B"
          doc={b}
          accent="#63a6ff"
          onFile={(file) => void load(file, setB)}
          onUseCurrent={() => current && setB(current)}
          hasCurrent={Boolean(current)}
        />
      </div>

      {!signatureA || !signatureB ? (
        <div className="diff-placeholder">
          <h2>Load two character definitions</h2>
          <p>
            Put the NXG build on one side and the DX11 build on the other. The comparison reads
            StreamInfo size, block composition, OLST type ids, reference encodings and asset
            families — the parts of the layout that differ between engine generations.
          </p>
          <p className="dim">
            Nothing is uploaded. Both files are parsed in this page and discarded when you close
            the tab.
          </p>
        </div>
      ) : (
        <div className="diff-body">
          <section className="diff-section">
            <div className="diff-section-head">
              <h2>Format</h2>
              <span className="dim">Rows highlighted in amber differ between the two files.</span>
            </div>
            <div className="metric-table">
              <div className="metric-head">
                <span />
                <span className="metric-col-a">A · {a?.fileName}</span>
                <span className="metric-col-b">B · {b?.fileName}</span>
              </div>
              {metrics.map((row) => (
                <div className={`metric-row ${row.differs ? "differs" : ""}`} key={row.label}>
                  <span className="metric-label">{row.label}</span>
                  <span className="metric-value">{row.a}</span>
                  <span className="metric-value">{row.b}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="diff-section">
            <div className="diff-section-head">
              <h2>Block outline</h2>
              <span className="dim">
                {totalOutline} block{totalOutline === 1 ? "" : "s"} aligned by position
                {totalOutline > outline.length ? ` · showing first ${outline.length}` : ""}
              </span>
            </div>
            <div className="outline-head">
              <span>A</span>
              <span>B</span>
            </div>
            <div className="outline-scroll">
              {outline.map((row, index) => (
                <div className={`outline-row ${row.differs ? "differs" : ""}`} key={index}>
                  <OutlineCell entry={row.a} accent="#ffcf4d" />
                  <OutlineCell entry={row.b} accent="#63a6ff" />
                </div>
              ))}
            </div>
          </section>

          {references && (
            <section className="diff-section">
              <div className="diff-section-head">
                <h2>References</h2>
                <span className="dim">
                  {references.shared} shared · {references.onlyA.length} only in A ·{" "}
                  {references.onlyB.length} only in B
                </span>
              </div>
              <div className="ref-diff-grid">
                <div className="ref-diff-col">
                  <h3>Only in A</h3>
                  <div className="ref-diff-list">
                    {references.onlyA.length === 0 && <p className="dim">None.</p>}
                    {references.onlyA.map((text) => (
                      <span className="ref-diff-item" key={text}>
                        {text}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="ref-diff-col">
                  <h3>Only in B</h3>
                  <div className="ref-diff-list">
                    {references.onlyB.length === 0 && <p className="dim">None.</p>}
                    {references.onlyB.map((text) => (
                      <span className="ref-diff-item" key={text}>
                        {text}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          <p className="diff-note">
            Block headers are located by validating the size / name-length / FourCC triplet, so the
            outline reflects real structure. Reference grouping is inferred from paths and
            extensions until OLST type ids are pinned from analysed samples.
          </p>
        </div>
      )}
    </main>
  );
}

