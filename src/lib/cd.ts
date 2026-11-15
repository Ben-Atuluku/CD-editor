/**
 * Parser for TT Games ".CD" (Character Definition) files.
 *
 * Two layouts are supported, because the engine generations differ:
 *
 * DX11 (LEGO Marvel Avengers and later)
 *   [ big-endian RESH resource header ]
 *   [ string pool: NUL-terminated asset names, starting at 0x28 ]
 *   [ OLST / MOBJ blocks, little-endian sizes ]
 *     OLST header 19 B: u32 size, u32 nameLen(5), "OLST\0", u16 type, u32 count
 *     MOBJ header 17 B: u32 size, u32 nameLen(5), "MOBJ\0", u32 flags
 *   Container sizes include the 8-byte size+nameLen prefix, and children tile
 *   the parent's payload exactly.
 *
 * NXG (LEGO Indiana Jones 2 through LEGO Marvel Super Heroes 1)
 *   [ StreamInfo blob: schema/type table and header names ]
 *   [ OLST / MOBJ blocks ]
 *     OLST header 19 B: u32 size, u32 nameLen(5), "OLST\0", u16 type, u32 count
 *     MOBJ header 16 B: u32 size, u32 nameLen(5), "MOBJ\0", 3 pad bytes
 *     MOBJ payload strings are u32 byte-length (including the NUL) + ASCII text,
 *     which is what distinguishes a real name from printable-looking bytes.
 *
 * Asset references are inline text in fixed-width byte slots. A slot can be
 * rewritten with same-or-shorter text; the unused tail is zero-filled, which is
 * what the game expects. Slots never grow, because that would move every
 * following field.
 */

export type Encoding = "ascii" | "utf16le";
export type FormatVariant = "DX11" | "NXG" | "UNKNOWN";
export type StringOrigin = "pool" | "container" | "header";

export interface StringSlot {
  id: string;
  offset: number;
  /** Bytes occupied by the slot, including the NUL terminator when present. */
  byteLength: number;
  /** Maximum characters writable without resizing the file. */
  capacity: number;
  encoding: Encoding;
  text: string;
  containerId: string | null;
  readOnly: boolean;
  origin: StringOrigin;
}

export interface ContainerNode {
  id: string;
  fourcc: string;
  offset: number;
  end: number;
  size: number;
  headerLength: number;
  type: number | null;
  count: number | null;
  ids: [number, number] | null;
  parentId: string | null;
  children: ContainerNode[];
  strings: StringSlot[];
  depth: number;
  /** First readable string inside the block, used as its display name. */
  label: string | null;
}

export interface CdDocument {
  fileName: string;
  variant: FormatVariant;
  bytes: Uint8Array;
  size: number;
  containers: ContainerNode[];
  roots: ContainerNode[];
  strings: StringSlot[];
  stringPool: { start: number; end: number; count: number } | null;
  streamInfo: { start: number; end: number; strings: StringSlot[] } | null;
  depthMap: Uint8Array;
  warnings: string[];
  profile: FileProfile;
}

export interface FileProfile {
  streamInfoSize: number;
  fourccCounts: Record<string, number>;
  asciiStrings: number;
  utf16Strings: number;
  maxDepth: number;
  signals: string[];
}

export function readU16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8)) & 0xffff;
}

export function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

export function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function isTextByte(byte: number): boolean {
  return byte >= 0x20 && byte <= 0x7e;
}

function decodeAscii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i]);
  return out;
}

function decodeUtf16le(bytes: Uint8Array, offset: number, chars: number): string {
  let out = "";
  for (let i = 0; i < chars; i++) {
    out += String.fromCharCode(bytes[offset + i * 2] | (bytes[offset + i * 2 + 1] << 8));
  }
  return out;
}

const FOURCC = /^[A-Z0-9]{4}$/;

/** Header byte counts per profile. */
const HEADERS: Record<FormatVariant, { olst: number; mobj: number }> = {
  DX11: { olst: 19, mobj: 17 },
  NXG: { olst: 19, mobj: 16 },
  UNKNOWN: { olst: 19, mobj: 17 },
};

interface Candidate {
  offset: number;
  end: number;
  size: number;
  fourcc: string;
  headerLength: number;
  type: number | null;
  count: number | null;
  ids: [number, number] | null;
}

function hasBlockTags(bytes: Uint8Array): boolean {
  for (let offset = 8; offset + 5 <= bytes.length; offset++) {
    if (bytes[offset + 4] !== 0x00) continue;
    const fourcc = decodeAscii(bytes, offset, 4);
    if (fourcc !== "OLST" && fourcc !== "MOBJ") continue;
    if (readU32(bytes, offset - 4) === 5) return true;
  }
  return false;
}

export function detectVariant(bytes: Uint8Array): FormatVariant {
  // DX11 files open with a big-endian RESH resource header; the 8-byte marker
  // reads ".CC4HSER" in file order.
  if (bytes.length > 16) {
    const marker = decodeAscii(bytes, 4, 8);
    const tag = decodeAscii(bytes, 12, 4);
    if (marker === ".CC4HSER" || tag === "HSER") return "DX11";
  }
  // NXG files open with a "StreamInfo" block, then the OLST/MOBJ tree.
  if (
    bytes.length >= 19 &&
    readU32(bytes, 4) === 11 &&
    decodeAscii(bytes, 8, 10) === "StreamInfo"
  ) {
    return "NXG";
  }
  return hasBlockTags(bytes) ? "NXG" : "UNKNOWN";
}

function pickSize(bytes: Uint8Array, offset: number, headerLength: number): number | null {
  const little = readU32(bytes, offset);
  if (little >= headerLength && offset + little <= bytes.length) return little;
  const big = readU32BE(bytes, offset);
  if (big >= headerLength && offset + big <= bytes.length) return big;
  return null;
}

function findCandidates(bytes: Uint8Array, variant: FormatVariant): Candidate[] {
  const headers = HEADERS[variant];
  const found: Candidate[] = [];

  for (let tagOffset = 8; tagOffset + 5 <= bytes.length; tagOffset++) {
    const fourcc = decodeAscii(bytes, tagOffset, 4);
    if (!FOURCC.test(fourcc)) continue;
    if (bytes[tagOffset + 4] !== 0x00) continue;

    const nameLength = readU32(bytes, tagOffset - 4);
    if (nameLength !== 5) continue;

    const start = tagOffset - 8;
    const headerLength = fourcc === "OLST" ? headers.olst : headers.mobj;
    const size = pickSize(bytes, start, headerLength);
    if (size === null || size < headerLength) continue;

    let type: number | null = null;
    let count: number | null = null;

    if (fourcc === "OLST") {
      // Both generations store the child count as a u32 after the type id.
      type = readU16(bytes, tagOffset + 5);
      count = readU32(bytes, tagOffset + 7);
    }

    found.push({
      offset: start,
      end: start + size,
      size,
      fourcc,
      headerLength,
      type,
      count,
      ids: null,
    });
    tagOffset += 3;
  }

  found.sort((a, b) => a.offset - b.offset || b.size - a.size);
  return found;
}

interface Segment {
  start: number;
  end: number;
}

function extractStrings(
  bytes: Uint8Array,
  segments: Segment[],
  containerId: string | null,
  readOnly: boolean,
  origin: StringOrigin,
  sink: StringSlot[],
  minLength = 3,
): void {
  for (const segment of segments) {
    let i = segment.start;

    while (i < segment.end) {
      if (
        isTextByte(bytes[i]) &&
        i + 3 < segment.end &&
        bytes[i + 1] === 0x00 &&
        isTextByte(bytes[i + 2]) &&
        bytes[i + 3] === 0x00
      ) {
        const start = i;
        let chars = 0;
        while (i + 1 < segment.end && isTextByte(bytes[i]) && bytes[i + 1] === 0x00) {
          chars++;
          i += 2;
        }
        const terminated = i + 1 < segment.end && bytes[i] === 0x00 && bytes[i + 1] === 0x00;
        if (chars >= minLength) {
          sink.push({
            id: `s${start}`,
            offset: start,
            byteLength: chars * 2 + (terminated ? 2 : 0),
            capacity: terminated ? chars : Math.max(1, chars - 1),
            encoding: "utf16le",
            text: decodeUtf16le(bytes, start, chars),
            containerId,
            readOnly,
            origin,
          });
        }
        if (terminated) i += 2;
        continue;
      }

      if (isTextByte(bytes[i])) {
        const start = i;
        while (i < segment.end && isTextByte(bytes[i])) i++;
        const runLength = i - start;
        const terminated = i < segment.end && bytes[i] === 0x00;
        if (runLength >= minLength) {
          sink.push({
            id: `s${start}`,
            offset: start,
            byteLength: terminated ? runLength + 1 : runLength,
            capacity: terminated ? runLength : Math.max(1, runLength - 1),
            encoding: "ascii",
            text: decodeAscii(bytes, start, runLength),
            containerId,
            readOnly,
            origin,
          });
        }
        continue;
      }

      i++;
    }
  }
}

/**
 * NXG stores inline strings as a little-endian u32 byte count (including the
 * NUL) followed by the text. Validating that prefix is what separates real
 * names from bytes that merely happen to be printable.
 */
function extractPrefixedStrings(
  bytes: Uint8Array,
  segments: Segment[],
  containerId: string | null,
  readOnly: boolean,
  origin: StringOrigin,
  sink: StringSlot[],
): void {
  for (const segment of segments) {
    let cursor = segment.start;

    while (cursor + 5 <= segment.end) {
      const length = readU32(bytes, cursor);
      const textStart = cursor + 4;
      const fits =
        length >= 2 && length <= 1024 && textStart + length <= segment.end;

      if (!fits) {
        cursor++;
        continue;
      }

      // The declared length is the slot size, not the current string length: a
      // shortened name keeps the old prefix and is zero-filled, so read up to
      // the first NUL inside the slot.
      const limit = textStart + length;
      let end = textStart;
      while (end < limit && isTextByte(bytes[end])) end++;
      if (end === textStart || end >= limit || bytes[end] !== 0x00) {
        cursor++;
        continue;
      }

      // Slack after the terminator must be the zero fill an in-place edit
      // leaves behind; anything else means this was not really a string.
      let zeroTail = true;
      for (let index = end + 1; index < limit; index++) {
        if (bytes[index] !== 0x00) {
          zeroTail = false;
          break;
        }
      }
      if (!zeroTail) {
        cursor++;
        continue;
      }

      sink.push({
        id: `s${textStart}`,
        offset: textStart,
        byteLength: length,
        capacity: length - 1,
        encoding: "ascii",
        text: decodeAscii(bytes, textStart, end - textStart),
        containerId,
        readOnly,
        origin,
      });
      cursor = textStart + length;
    }
  }
}

function payloadSegments(node: Candidate, children: ContainerNode[]): Segment[] {
  const segments: Segment[] = [];
  let cursor = node.offset + node.headerLength;
  for (const child of children) {
    if (child.offset > cursor) segments.push({ start: cursor, end: child.offset });
    cursor = Math.max(cursor, child.end);
  }
  if (cursor < node.end) segments.push({ start: cursor, end: node.end });
  return segments;
}

/**
 * DX11 files keep every asset name in one pool at the front. The pool is
 * length-delimited by the header's string count, not by scanning the whole
 * StreamInfo, because hash tables follow it.
 */
function readStringPool(
  bytes: Uint8Array,
  end: number,
): { start: number; end: number; count: number; strings: StringSlot[] } {
  const strings: StringSlot[] = [];
  let offset = 0x28;
  const declared = bytes.length >= 0x24 ? readU32BE(bytes, 0x20) : 0;
  const limit = declared > 0 && declared < 100000 ? declared : 100000;

  while (offset < end && strings.length < limit) {
    const start = offset;
    while (offset < end && isTextByte(bytes[offset])) offset++;
    const runLength = offset - start;
    if (runLength < 3) break;
    strings.push({
      id: `s${start}`,
      offset: start,
      byteLength: runLength + 1,
      capacity: runLength,
      encoding: "ascii",
      text: decodeAscii(bytes, start, runLength),
      containerId: null,
      readOnly: false,
      origin: "pool",
    });
    while (offset < end && bytes[offset] === 0x00) offset++;
  }

  return { start: 0x28, end: offset, count: strings.length, strings };
}

export function parseCd(input: Uint8Array, fileName: string): CdDocument {
  const bytes = input;
  const variant = detectVariant(bytes);
  const warnings: string[] = [];
  const candidates = findCandidates(bytes, variant);
  const containers: ContainerNode[] = [];
  const roots: ContainerNode[] = [];
  const stack: ContainerNode[] = [];

  for (const candidate of candidates) {
    while (stack.length && candidate.offset >= stack[stack.length - 1].end) stack.pop();
    const parent = stack.length ? stack[stack.length - 1] : null;

    const node: ContainerNode = {
      id: `c${candidate.offset}`,
      fourcc: candidate.fourcc,
      offset: candidate.offset,
      end: candidate.end,
      size: candidate.size,
      headerLength: candidate.headerLength,
      type: candidate.type,
      count: candidate.count,
      ids: candidate.ids,
      parentId: null,
      children: [],
      strings: [],
      depth: 0,
      label: null,
    };

    if (parent && candidate.end <= parent.end) {
      node.parentId = parent.id;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      if (parent) {
        warnings.push(
          `${candidate.fourcc} at 0x${candidate.offset.toString(16)} crosses its parent boundary; treated as a root block.`,
        );
      }
      roots.push(node);
    }
    containers.push(node);
    stack.push(node);
  }

  const extract = variant === "NXG" ? extractPrefixedStrings : extractStrings;

  for (const node of containers) {
    const payload = payloadSegments(
      {
        offset: node.offset,
        end: node.end,
        size: node.size,
        fourcc: node.fourcc,
        headerLength: node.headerLength,
        type: node.type,
        count: node.count,
        ids: node.ids,
      },
      node.children,
    );
    extract(bytes, payload, node.id, false, "container", node.strings);

    const first = node.strings.find((slot) => slot.text.length >= 3);
    node.label = first ? first.text : null;
  }

  const firstRoot = roots.length ? Math.min(...roots.map((node) => node.offset)) : bytes.length;

  let stringPool: CdDocument["stringPool"] = null;
  const poolStrings: StringSlot[] = [];

  if (variant === "DX11" && firstRoot > 0x28) {
    const pool = readStringPool(bytes, firstRoot);
    stringPool = { start: pool.start, end: pool.end, count: pool.count };
    poolStrings.push(...pool.strings);
    if (pool.count > 0) {
      warnings.push(`DX11 layout: ${pool.count} pooled asset names before the block tree.`);
    }
  }

  const headerStrings: StringSlot[] = [];
  if (variant === "NXG" && firstRoot > 0) {
    extractPrefixedStrings(
      bytes,
      [{ start: 0, end: firstRoot }],
      null,
      true,
      "header",
      headerStrings,
    );
    if (headerStrings.length > 0) {
      warnings.push(
        `NXG layout: ${headerStrings.length} schema names sit in the ${firstRoot.toLocaleString()} B StreamInfo header, ahead of the block tree.`,
      );
    }
  }

  // Header names describe the schema, not assets, so they stay out of the
  // reference list and the category groups.
  const strings = [...poolStrings, ...containers.flatMap((node) => node.strings)];
  strings.sort((a, b) => a.offset - b.offset);
  dedupeStrings(strings);

  const depthMap = new Uint8Array(bytes.length);
  for (const node of containers) {
    depthMap.fill(Math.min(255, node.depth + 1), node.offset, node.end);
  }

  if (containers.length === 0) {
    warnings.push("No OLST/MOBJ blocks were found. The file is shown as raw bytes.");
  }

  const fourccCounts: Record<string, number> = {};
  for (const node of containers) {
    fourccCounts[node.fourcc] = (fourccCounts[node.fourcc] ?? 0) + 1;
  }

  const signals: string[] = [];
  if (variant === "DX11") signals.push("DX11 resource header (RESH, big-endian)");
  if (variant === "NXG") signals.push("NXG StreamInfo header (length-prefixed names)");
  if (variant === "UNKNOWN") signals.push("no recognised header signature");
  if (stringPool) signals.push(`${stringPool.count} pooled names`);
  if (strings.some((slot) => /\.TEX$/i.test(slot.text))) signals.push(".TEX textures");
  if (strings.some((slot) => /_dx11\./i.test(slot.text))) signals.push("DX11 asset variants");
  if (strings.some((slot) => /_nxg\./i.test(slot.text))) signals.push("NXG asset variants");

  const profile: FileProfile = {
    streamInfoSize: firstRoot,
    fourccCounts,
    asciiStrings: strings.filter((slot) => slot.encoding === "ascii").length,
    utf16Strings: strings.filter((slot) => slot.encoding === "utf16le").length,
    maxDepth: containers.reduce((max, node) => Math.max(max, node.depth), 0),
    signals,
  };

  return {
    fileName,
    variant,
    bytes,
    size: bytes.length,
    containers,
    roots,
    strings,
    stringPool,
    streamInfo: firstRoot > 0 ? { start: 0, end: firstRoot, strings: headerStrings } : null,
    depthMap,
    warnings,
    profile,
  };
}

/** Overlapping runs happen on odd byte patterns; keep the longest slot. */
function dedupeStrings(strings: StringSlot[]): void {
  const kept: StringSlot[] = [];
  for (const slot of strings) {
    const conflict = kept.find(
      (other) =>
        slot.offset < other.offset + other.byteLength &&
        other.offset < slot.offset + slot.byteLength,
    );
    if (!conflict) kept.push(slot);
    else if (slot.byteLength > conflict.byteLength) {
      kept[kept.indexOf(conflict)] = slot;
    }
  }
  strings.length = 0;
  strings.push(...kept.sort((a, b) => a.offset - b.offset));
}

export function containerPath(doc: CdDocument, containerId: string | null): ContainerNode[] {
  if (!containerId) return [];
  const map = new Map(doc.containers.map((node) => [node.id, node]));
  const path: ContainerNode[] = [];
  let current = map.get(containerId) ?? null;
  while (current) {
    path.unshift(current);
    current = current.parentId ? map.get(current.parentId) ?? null : null;
  }
  return path;
}

export function encodeReplacement(
  slot: StringSlot,
  text: string,
): { ok: true; bytes: Uint8Array } | { ok: false; error: string } {
  if (text.length > slot.capacity) {
    return {
      ok: false,
      error: `"${text}" needs ${text.length} characters but this slot holds ${slot.capacity}.`,
    };
  }
  if (text.includes("\u0000")) {
    return { ok: false, error: "References cannot contain NUL characters." };
  }
  const out = new Uint8Array(slot.byteLength);
  if (slot.encoding === "ascii") {
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code > 0xff) {
        return { ok: false, error: "Only Latin-1 characters fit in this ASCII slot." };
      }
      out[i] = code;
    }
  } else {
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      out[i * 2] = code & 0xff;
      out[i * 2 + 1] = code >> 8;
    }
  }
  return { ok: true, bytes: out };
}

export function formatOffset(offset: number): string {
  return `0x${offset.toString(16).toUpperCase().padStart(6, "0")}`;
}
