/**
 * Flux calls this field "Material". In the .CD it is the u32 that sits directly
 * before the texture path inside a texture MOBJ, and it decides which body part
 * the texture is painted onto. The numbering is shared by the NXG and DX11
 * generations (it is far more useful in DX11, where a character carries one
 * texture per part).
 *
 * Verified against real files: BODY_SENTRY_FRONT carries 3, BODY_SENTRY_BACK 4,
 * ARM_SENTRY 5 and 24, LEG_SENTRY 8 and 25.
 */
export interface BodyPart {
  value: number;
  label: string;
}

/** Ordered by material number so the picker reads like the game's slot table. */
export const BODY_PARTS: BodyPart[] = [
  { value: 1, label: "Head front" },
  { value: 2, label: "Head back" },
  { value: 3, label: "Body front" },
  { value: 4, label: "Body back" },
  { value: 5, label: "Arm" },
  { value: 6, label: "Hand" },
  { value: 7, label: "Hip" },
  { value: 8, label: "Leg right" },
  { value: 24, label: "Arm left" },
  { value: 25, label: "Leg left" },
  { value: 26, label: "Hand" },
];

const BY_VALUE = new Map(BODY_PARTS.map((part) => [part.value, part]));

export function bodyPartLabel(value: number): string | null {
  return BY_VALUE.get(value)?.label ?? null;
}

/** "5 · Arm" for mapped numbers, null when the file holds an unmapped value. */
export function describeMaterial(value: number): string | null {
  const label = bodyPartLabel(value);
  return label ? `${value} · ${label}` : null;
}
