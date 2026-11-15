import type { CdDocument, ContainerNode } from "./cd";
import { CATEGORY_INFO, CATEGORY_ORDER, groupReferences, type CategoryId } from "./categories";

export interface OutlineEntry {
  fourcc: string;
  meta: string;
  depth: number;
  size: number;
}

export interface Signature {
  doc: CdDocument;
  outline: OutlineEntry[];
  olstCount: number;
  mobjCount: number;
  olstTypes: string;
  categoryCounts: Record<CategoryId, number>;
  referenceTexts: Set<string>;
}

function outlineMeta(node: ContainerNode): string {
  if (node.fourcc === "OLST") return `type ${node.type ?? "?"} · ${node.count ?? 0} items`;
  if (node.fourcc === "MOBJ") return `id ${node.ids?.[0] ?? "?"}/${node.ids?.[1] ?? "?"}`;
  return `${node.size} B`;
}

export function buildSignature(doc: CdDocument): Signature {
  const outline = [...doc.containers]
    .sort((a, b) => a.offset - b.offset)
    .map((node) => ({
      fourcc: node.fourcc,
      meta: outlineMeta(node),
      depth: node.depth,
      size: node.size,
    }));

  const types = new Map<string, number>();
  for (const node of doc.containers) {
    if (node.fourcc !== "OLST") continue;
    const key = String(node.type ?? "?");
    types.set(key, (types.get(key) ?? 0) + 1);
  }
  const olstTypes =
    [...types.entries()]
      .map(([type, count]) => `type ${type} ×${count}`)
      .join(" · ") || "—";

  const categoryCounts = Object.fromEntries(
    CATEGORY_ORDER.map((id) => [id, 0]),
  ) as Record<CategoryId, number>;
  for (const group of groupReferences(doc)) {
    categoryCounts[group.id] = group.count;
  }

  return {
    doc,
    outline,
    olstCount: doc.containers.filter((node) => node.fourcc === "OLST").length,
    mobjCount: doc.containers.filter((node) => node.fourcc === "MOBJ").length,
    olstTypes,
    categoryCounts,
    referenceTexts: new Set(doc.strings.map((slot) => slot.text)),
  };
}

export interface MetricRow {
  label: string;
  a: string;
  b: string;
  differs: boolean;
}

function bytes(value: number): string {
  return `${value.toLocaleString()} B`;
}

function headerWidths(variant: string): string {
  if (variant === "DX11") return "OLST 19 / MOBJ 17 B";
  if (variant === "NXG") return "OLST 19 / MOBJ 16 B + inline payload";
  return "unknown";
}

function olstTypeCounts(doc: CdDocument): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of doc.containers) {
    if (node.fourcc !== "OLST") continue;
    const key = String(node.type ?? "?");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function metricRows(a: Signature, b: Signature): MetricRow[] {
  const pairs: Array<[string, string, string]> = [
    ["Layout", a.doc.variant, b.doc.variant],
    ["Header widths", headerWidths(a.doc.variant), headerWidths(b.doc.variant)],
    ["File size", bytes(a.doc.size), bytes(b.doc.size)],
    ["Header region", bytes(a.doc.profile.streamInfoSize), bytes(b.doc.profile.streamInfoSize)],
    [
      "String pool",
      a.doc.stringPool ? `${a.doc.stringPool.count} names` : "none",
      b.doc.stringPool ? `${b.doc.stringPool.count} names` : "none",
    ],
    ["Blocks", String(a.doc.containers.length), String(b.doc.containers.length)],
    ["Top-level blocks", String(a.doc.roots.length), String(b.doc.roots.length)],
    [
      "Nesting depth",
      `${a.doc.profile.maxDepth} levels`,
      `${b.doc.profile.maxDepth} levels`,
    ],
    ["OLST / MOBJ", `${a.olstCount} / ${a.mobjCount}`, `${b.olstCount} / ${b.mobjCount}`],
    ["References", String(a.doc.strings.length), String(b.doc.strings.length)],
    [
      "ASCII / UTF-16",
      `${a.doc.profile.asciiStrings} / ${a.doc.profile.utf16Strings}`,
      `${b.doc.profile.asciiStrings} / ${b.doc.profile.utf16Strings}`,
    ],
    ["OLST type ids", a.olstTypes, b.olstTypes],
    [
      "Format signals",
      a.doc.profile.signals.join(" · ") || "—",
      b.doc.profile.signals.join(" · ") || "—",
    ],
  ];

  const rows: MetricRow[] = pairs.map(([label, left, right]) => ({
    label,
    a: left,
    b: right,
    differs: left !== right,
  }));

  const typesA = olstTypeCounts(a.doc);
  const typesB = olstTypeCounts(b.doc);
  const allTypes = [...new Set([...typesA.keys(), ...typesB.keys()])].sort((left, right) =>
    Number(left) - Number(right),
  );
  for (const type of allTypes) {
    const left = String(typesA.get(type) ?? 0);
    const right = String(typesB.get(type) ?? 0);
    rows.push({
      label: `OLST type ${type}`,
      a: left,
      b: right,
      differs: left !== right,
    });
  }

  const hasCategory = (id: CategoryId) => a.categoryCounts[id] > 0 || b.categoryCounts[id] > 0;
  for (const id of CATEGORY_ORDER) {
    if (!hasCategory(id)) continue;
    const left = String(a.categoryCounts[id]);
    const right = String(b.categoryCounts[id]);
    rows.push({
      label: CATEGORY_INFO[id].label,
      a: left,
      b: right,
      differs: left !== right,
    });
  }

  return rows;
}

export interface OutlineRow {
  a: OutlineEntry | null;
  b: OutlineEntry | null;
  differs: boolean;
}

export function outlineRows(a: Signature, b: Signature, limit = 500): OutlineRow[] {
  const total = Math.max(a.outline.length, b.outline.length);
  const rows: OutlineRow[] = [];
  for (let index = 0; index < Math.min(total, limit); index++) {
    const left = a.outline[index] ?? null;
    const right = b.outline[index] ?? null;
    rows.push({
      a: left,
      b: right,
      differs:
        !left ||
        !right ||
        left.fourcc !== right.fourcc ||
        left.meta !== right.meta ||
        left.depth !== right.depth,
    });
  }
  return rows;
}

export interface ReferenceDiff {
  shared: number;
  onlyA: string[];
  onlyB: string[];
}

export function referenceDiff(a: Signature, b: Signature): ReferenceDiff {
  const onlyA: string[] = [];
  const onlyB: string[] = [];
  let shared = 0;

  for (const text of a.referenceTexts) {
    if (b.referenceTexts.has(text)) shared++;
    else onlyA.push(text);
  }
  for (const text of b.referenceTexts) {
    if (!a.referenceTexts.has(text)) onlyB.push(text);
  }

  return { shared, onlyA: onlyA.sort(), onlyB: onlyB.sort() };
}
