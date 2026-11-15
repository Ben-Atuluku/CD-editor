/**
 * Texture entries are the one MOBJ shape with named header fields: a texture
 * MOBJ starts with two little-endian u32 values that Flux presents as
 * "Material" and "Texture Slot", then the length-prefixed texture path.
 *
 * Both generations lay them out the same way, only the MOBJ header differs
 * (17 bytes for DX11, 16 for NXG), so the fields sit at block.offset +
 * headerLength. Requiring the block's first string to start exactly 12 bytes
 * after that keeps ordinary MOBJs, whose payload begins with the string length,
 * out of this view.
 */
import { readU32, type ContainerNode } from "./cd";

export interface TextureFields {
  material: number;
  slot: number;
  materialOffset: number;
  slotOffset: number;
}

export function textureFields(
  node: ContainerNode | null | undefined,
  bytes: Uint8Array,
): TextureFields | null {
  if (!node || node.fourcc !== "MOBJ") return null;

  const base = node.offset + node.headerLength;
  if (base + 12 > node.end || base + 12 > bytes.length) return null;

  const first = node.strings[0];
  if (!first || first.offset !== base + 12) return null;

  const material = readU32(bytes, base);
  const slot = readU32(bytes, base + 4);
  if (material > 0xffff || slot > 0xffff) return null;

  return { material, slot, materialOffset: base, slotOffset: base + 4 };
}
