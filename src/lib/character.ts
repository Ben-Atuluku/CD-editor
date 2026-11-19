/**
 * The character-definition struct that Flux presents as a form.
 *
 * A character root MOBJ (the MOBJ inside the OLST type-0 group) starts with a
 * fixed struct before its child blocks begin:
 *
 *   DX11                              NXG
 *   u8   modelType                    (no model type field)
 *   5 x  string (override/scene)      4 x  string
 *   string skeletonName               string skeletonName
 *   string defaultAction              string defaultAction
 *   u8   motionBlur                   ...
 *   u8   interpolateAnimations
 *   string chaseCamSettingsName
 *   f32  tintR, tintG, tintB, tintA   (white = 1,1,1,1)
 *   u8   defaultAlpha
 *   string lightingJoint
 *   u8   defaultDisableShadow
 *   f32  blobShadowSize[4]
 *   f32  blobShadowCentre[4]
 *
 * Strings are a little-endian u32 byte length (including the NUL) followed by
 * the text; length 1 therefore means "empty". Decoding is validated: the
 * skeleton string must equal the block's own label, flags must be 0/1 and the
 * floats must be finite and small. A file that does not fit yields null so the
 * UI shows nothing instead of an editable lie.
 */
import { readU32, type ContainerNode } from "./cd";

export type ParamKind = "byte" | "vector" | "colour" | "string";

export interface CharacterField {
  key: string;
  label: string;
  /** Absolute byte offset of the field. */
  offset: number;
  kind: ParamKind;
  /** byte: [value]; vector/colour: four components; string: []. */
  value: number[];
}

export interface CharacterParams {
  fields: CharacterField[];
  variant: "DX11" | "NXG";
}

class Mismatch extends Error {}

function decode(bytes: Uint8Array, node: ContainerNode, variant: "DX11" | "NXG") {
  const base = node.offset + node.headerLength;
  const limit = node.end;
  let cursor = base;

  const need = (count: number) => {
    if (cursor + count > limit) throw new Mismatch("out of range");
  };
  const u8 = () => {
    need(1);
    return bytes[cursor++];
  };
  const u32 = () => {
    need(4);
    const value = readU32(bytes, cursor);
    cursor += 4;
    return value;
  };
  const f32 = () => {
    need(4);
    const value = new DataView(bytes.buffer, bytes.byteOffset + cursor, 4).getFloat32(0, true);
    cursor += 4;
    return value;
  };
  /** Returns the text and the absolute offset of its first character. */
  const text = () => {
    const length = u32();
    if (length > 2048) throw new Mismatch("string length");
    need(length);
    const start = cursor;
    let end = start;
    while (end < start + length && bytes[end] !== 0x00) end++;
    const value = String.fromCharCode(...bytes.subarray(start, end));
    cursor += length;
    return { value, offset: start, capacity: Math.max(0, length - 1) };
  };

  let modelType: CharacterField | null = null;
  if (variant === "DX11") {
    const offset = cursor;
    modelType = {
      key: "modelType",
      label: "Model type",
      offset,
      kind: "byte",
      value: [u8()],
    };
  }

  for (let index = 0; index < (variant === "DX11" ? 5 : 4); index++) text();

  const skeleton = text();
  if (!skeleton.value || skeleton.value !== node.strings[0]?.text) {
    throw new Mismatch("skeleton name");
  }

  const action = text();

  const motionOffset = cursor;
  const motion = u8();
  const interpOffset = cursor;
  const interp = u8();
  const chase = text();

  const tintOffset = cursor;
  const tint = [f32(), f32(), f32(), f32()];

  const alphaOffset = cursor;
  const alpha = u8();

  const lighting = text();

  const disableOffset = cursor;
  const disable = u8();

  const sizeOffset = cursor;
  const size = [f32(), f32(), f32(), f32()];
  const centreOffset = cursor;
  const centre = [f32(), f32(), f32(), f32()];

  if (motion > 1 || interp > 1 || disable > 1) throw new Mismatch("flags");
  for (const value of [...tint, ...size, ...centre]) {
    if (!Number.isFinite(value) || Math.abs(value) > 1000) throw new Mismatch("float range");
  }

  const fields: CharacterField[] = [];
  if (modelType) fields.push(modelType);
  fields.push({ key: "skeleton", label: "Skeleton name", offset: skeleton.offset, kind: "string", value: [] });
  if (action.capacity > 0) {
    fields.push({ key: "defaultAction", label: "Default action", offset: action.offset, kind: "string", value: [] });
  }
  fields.push(
    { key: "motionBlur", label: "Motion blur", offset: motionOffset, kind: "byte", value: [motion] },
    { key: "interpolate", label: "Interpolate animations", offset: interpOffset, kind: "byte", value: [interp] },
  );
  if (chase.capacity > 0) {
    fields.push({ key: "chaseCam", label: "Chase cam settings", offset: chase.offset, kind: "string", value: [] });
  }
  fields.push(
    { key: "tint", label: "Default tint colour", offset: tintOffset, kind: "colour", value: tint },
    { key: "alpha", label: "Default alpha", offset: alphaOffset, kind: "byte", value: [alpha] },
  );
  if (lighting.capacity > 0) {
    fields.push({ key: "lightingJoint", label: "Lighting joint", offset: lighting.offset, kind: "string", value: [] });
  }
  fields.push(
    { key: "disableShadow", label: "Default disable shadow", offset: disableOffset, kind: "byte", value: [disable] },
    { key: "blobSize", label: "Root blob shadow size", offset: sizeOffset, kind: "vector", value: size },
    { key: "blobCentre", label: "Root blob shadow centre", offset: centreOffset, kind: "vector", value: centre },
  );

  return { fields, variant };
}

export function readCharacterParams(
  bytes: Uint8Array,
  node: ContainerNode | null | undefined,
  variant: "DX11" | "NXG" | "UNKNOWN",
): CharacterParams | null {
  if (!node || node.fourcc !== "MOBJ" || variant === "UNKNOWN") return null;
  try {
    return decode(bytes, node, variant);
  } catch {
    return null;
  }
}

/** Replacement bytes for one edition of a numeric field. */
export function encodeField(field: CharacterField, value: number[]): Uint8Array | null {
  if (field.kind === "byte") {
    const byte = value[0];
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) return null;
    return Uint8Array.of(byte);
  }
  if (value.length !== 4) return null;
  const out = new Uint8Array(16);
  const view = new DataView(out.buffer);
  for (let index = 0; index < 4; index++) {
    if (!Number.isFinite(value[index])) return null;
    view.setFloat32(index * 4, value[index], true);
  }
  return out;
}
