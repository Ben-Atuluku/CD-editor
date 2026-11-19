/**
 * Beta: rename the character token inside a texture group's file names.
 *
 * Flux names textures <PART>_<CHARACTER>[_FRONT|_BACK], e.g.
 * "Body\BODY_SENTRY_FRONT" or "Arm\ARM_SENTRY". Replacing the middle token
 * across every texture in the group re-skins a character onto a new name
 * without touching anything else in the path.
 *
 * Slots never grow, so a longer token can only be written into references whose
 * original name was long enough; each candidate reports whether it fits.
 */
import type { StringSlot } from "./cd";

const PART = /^(BODY|ARM|LEGS|LEG|HEAD|HAND|HIP|TORSO)_/i;
const SIDE = /_(FRONT|BACK)$/i;

export interface TextureName {
  dir: string;
  prefix: string;
  token: string;
  suffix: string;
}

export function parseTextureName(text: string): TextureName | null {
  const trimmed = text.trim();
  const cut = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  const dir = cut >= 0 ? trimmed.slice(0, cut + 1) : "";
  const base = cut >= 0 ? trimmed.slice(cut + 1) : trimmed;

  const part = base.match(PART);
  if (!part) return null;

  const prefix = `${part[1].toUpperCase()}_`;
  let rest = base.slice(prefix.length);
  let suffix = "";
  const side = rest.match(SIDE);
  if (side) {
    suffix = side[0].toUpperCase();
    rest = rest.slice(0, side.index);
  }
  if (!rest) return null;
  return { dir, prefix, token: rest, suffix };
}

export function renameTexture(text: string, token: string): string | null {
  const parts = parseTextureName(text);
  if (!parts) return null;
  return `${parts.dir}${parts.prefix}${token.trim().toUpperCase()}${parts.suffix}`;
}

export interface ReassignCandidate {
  slot: StringSlot;
  next: string;
  fits: boolean;
}

/** Every texture reference in the group that a rename would actually change. */
export function planReassign(slots: StringSlot[], token: string): ReassignCandidate[] {
  const clean = token.trim().toUpperCase();
  if (!clean) return [];
  return slots
    .filter((slot) => !slot.readOnly && parseTextureName(slot.text))
    .map((slot) => {
      const next = renameTexture(slot.text, clean) as string;
      return { slot, next, fits: next.length <= slot.capacity };
    })
    .filter((candidate) => candidate.next !== candidate.slot.text);
}
