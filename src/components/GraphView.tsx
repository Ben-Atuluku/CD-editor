import { useEffect, useMemo, useRef, useState } from "react";
import { formatOffset, type CdDocument, type ContainerNode } from "../lib/cd";
import { shortReferenceName } from "../lib/categories";
import type { Selection } from "../lib/selection";

interface Props {
  doc: CdDocument;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
}

interface WebNode {
  node: ContainerNode;
  x: number;
  y: number;
  r: number;
  kind: "olst" | "mobj";
  label: string;
  angle: number;
}

interface WebEdge {
  from: string;
  to: string;
}

const truncate = (text: string, limit: number) =>
  text.length > limit ? `${text.slice(0, limit - 1)}\u2026` : text;

function nodeLabel(node: ContainerNode): string {
  if (node.label) return truncate(shortReferenceName(node.label), 18);
  const tag = `${node.fourcc} ${formatOffset(node.offset).slice(-4)}`;
  return truncate(tag, 18);
}

/** Radius of the ring that holds a given depth; zero is the hub at the centre. */
const ringFor = (depth: number) => (depth === 0 ? 0 : 118 + (depth - 1) * 132);

export function GraphView({ doc, selection, onSelect }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);

  const { width, height, nodes, edges, maxDepth } = useMemo(() => {
    const byDepth: ContainerNode[][] = [];
    const parentOf = new Map<string, string>();

    const visit = (node: ContainerNode, depth: number, parent: ContainerNode | null) => {
      (byDepth[depth] ??= []).push(node);
      if (parent) parentOf.set(node.id, parent.id);
      node.children.forEach((child) => visit(child, depth + 1, node));
    };
    doc.roots.forEach((root) => visit(root, 0, null));

    const maxDepth = byDepth.length - 1;
    const extent = ringFor(maxDepth) + 190;
    const size = extent * 2;
    const cx = extent;
    const cy = extent;

    const placed: WebNode[] = [];
    for (let depth = 0; depth < byDepth.length; depth++) {
      const ring = byDepth[depth];
      const radius = ringFor(depth);
      ring.forEach((node, index) => {
        const angle = depth === 0 ? 0 : -Math.PI / 2 + (index / ring.length) * Math.PI * 2;
        placed.push({
          node,
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          r: node.fourcc === "OLST" ? 17 : 8,
          kind: node.fourcc === "OLST" ? "olst" : "mobj",
          label: nodeLabel(node),
          angle,
        });
      });
    }

    const ids = new Set(placed.map((entry) => entry.node.id));
    const links: WebEdge[] = [];
    for (const [from, to] of parentOf) {
      if (ids.has(from) && ids.has(to)) links.push({ from, to });
    }

    return { width: size, height: size, nodes: placed, edges: links, maxDepth };
  }, [doc]);

  // Start centred on the root hub rather than at the top-left corner.
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const target = `${doc.containers.length}:${nodes.length}`;
    if (scrollTarget === target) return;
    element.scrollLeft = Math.max(0, (width - element.clientWidth) / 2);
    element.scrollTop = Math.max(0, (height - element.clientHeight) / 2);
    setScrollTarget(target);
  }, [doc.containers.length, nodes.length, width, height, scrollTarget]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, WebNode>();
    for (const entry of nodes) map.set(entry.node.id, entry);
    return map;
  }, [nodes]);

  const activeNodeId = useMemo(() => {
    if (!selection) return null;
    const match = nodes.find(
      (entry) =>
        (selection.kind === "container" && selection.offset === entry.node.offset) ||
        (selection.kind === "string" &&
          entry.node.strings.some((slot) => slot.offset === selection.offset)),
    );
    return match?.node.id ?? null;
  }, [nodes, selection]);

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

  if (doc.roots.length === 0) {
    return <div className="tree-empty">No OLST/MOBJ blocks were detected in this file.</div>;
  }

  const hotId = hovered ?? activeNodeId;

  return (
    <div className="web">
      <div className="web-head">
        <span className="web-title">Structure web</span>
        <span className="web-legend">
          <i className="web-key olst" /> OLST
          <i className="web-key mobj" /> MOBJ
        </span>
      </div>
      <div className="web-canvas" ref={canvasRef}>
        <svg
          className="web-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Web view of the file's OLST groups and MOBJ entries"
        >
          {Array.from({ length: maxDepth }, (_value, index) => (
            <circle
              key={`orbit-${index}`}
              className="web-orbit"
              cx={width / 2}
              cy={height / 2}
              r={ringFor(index + 1)}
            />
          ))}

          {edges.map((edge) => {
            const from = nodeMap.get(edge.from);
            const to = nodeMap.get(edge.to);
            if (!from || !to) return null;
            const hot = hotId !== null && (edge.from === hotId || edge.to === hotId);
            return (
              <line
                key={`${edge.from}-${edge.to}`}
                className={`web-edge ${hot ? "hot" : ""}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
              />
            );
          })}

          {nodes.map((entry, index) => {
            const active = entry.node.id === activeNodeId;
            // OLST labels sit clear below their ring; leaf labels fan outward with
            // alternating gaps so neighbours do not overlap.
            const labelDistance = entry.r + (index % 2 === 0 ? 11 : 24);
            const labelX =
              entry.kind === "olst" ? entry.x : entry.x + Math.cos(entry.angle) * labelDistance;
            const labelY =
              entry.kind === "olst" ? entry.y + entry.r + 13 : entry.y + Math.sin(entry.angle) * labelDistance;
            return (
              <g
                key={entry.node.id}
                className={`web-node ${entry.kind} ${active ? "active" : ""}`}
                onMouseEnter={() => setHovered(entry.node.id)}
                onMouseLeave={() =>
                  setHovered((current) => (current === entry.node.id ? null : current))
                }
                onClick={() => selectNode(entry.node)}
              >
                <title>
                  {`${entry.node.fourcc} · ${formatOffset(entry.node.offset)} · ${entry.node.size} B`}
                  {entry.node.label ? `\n${entry.node.label}` : ""}
                </title>
                <circle className="node-dot" cx={entry.x} cy={entry.y} r={entry.r} />
                {entry.kind === "olst" && (
                  <text className="node-tag" x={entry.x} y={entry.y + 3} textAnchor="middle">
                    OLST
                  </text>
                )}
                <text
                  className="node-label"
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {entry.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="web-note">
        The centre is the file's root OLST; each ring is one level deeper, so hubs join to the MOBJ
        entries they contain. Click a node to inspect it and switch to the tree to edit.
      </p>
    </div>
  );
}
