/**
 * Builds a synthetic .CD file so the editor can be explored without game
 * assets. It follows the NXG layout measured on real files (OLST 19-byte
 * headers, MOBJ 16-byte headers, u32 length-prefixed inline names), but it is
 * NOT extracted from a retail game.
 */

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff,
  ]);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function codes(value: string): number[] {
  return Array.from(value, (char) => char.charCodeAt(0) & 0xff);
}

function fourcc(name: string): Uint8Array {
  const out = new Uint8Array(5);
  out.set(codes(name), 0);
  return out;
}

/** NXG inline string: u32 byte count including the NUL, then the text. */
function inline(value: string): Uint8Array {
  const chars = codes(value);
  const out = new Uint8Array(4 + chars.length + 1);
  out.set(u32(chars.length + 1), 0);
  out.set(chars, 4);
  return out;
}

function mobj(name: string, payload: Uint8Array = new Uint8Array()): Uint8Array {
  const body = concat(inline(name), payload);
  return concat(u32(16 + body.length), u32(5), fourcc("MOBJ"), new Uint8Array(3), body);
}

function olst(type: number, children: Uint8Array[]): Uint8Array {
  const body = concat(...children);
  return concat(
    u32(19 + body.length),
    u32(5),
    fourcc("OLST"),
    u16(type),
    u32(children.length),
    body,
  );
}

/** A named StreamInfo block: u32 size, u32 name length, name, payload. */
function namedBlock(name: string, payload: Uint8Array): Uint8Array {
  const nameBytes = new Uint8Array(codes(name).concat([0]));
  return concat(u32(8 + nameBytes.length + payload.length), u32(nameBytes.length), nameBytes, payload);
}

function streamInfo(): Uint8Array {
  const schema = concat(
    u32(0),
    inline("Type"),
    inline("Character Definition"),
    inline("Char SFX Name"),
    inline("Character Layer Special"),
    inline("Layer Id"),
    new Uint8Array(96),
  );
  return namedBlock("StreamInfo", schema);
}

export function buildSampleCd(): { name: string; bytes: Uint8Array } {
  const abilities = olst(3, [
    mobj("Ability_Fly"),
    mobj("Ability_Fight"),
    mobj("Ability_SuperStrength"),
  ]);

  const textures = olst(5, [
    mobj("Minifigs\\Super_Characters\\LEGO_Colours\\LEGO_BLACK"),
    mobj("Minifigs\\Super_Characters\\BODY\\BODY_BATMAN_FRONT"),
    mobj("Minifigs\\Super_Characters\\CAPE\\CAPE_BLACK"),
  ]);

  const attachments = olst(6, [
    mobj("Chars\\Minifigs\\Super_Characters\\HAIR\\HAIR_COWL", inline("Hair_Cowl")),
    mobj("Chars\\Minifigs\\Super_Characters\\FACE\\FACE_BATMAN", inline("Face_Batman")),
  ]);

  const sounds = olst(9, [
    mobj("CHARSFX 0", inline("VO_Batman_Jump")),
    mobj("CHARSFX 1", inline("VO_Batman_Pain")),
  ]);

  const character = olst(0, [
    mobj(
      "BATMAN",
      concat(
        inline("None"),
        inline("Character Definition Game Data"),
        abilities,
        textures,
        attachments,
        sounds,
      ),
    ),
  ]);

  const bytes = concat(streamInfo(), character);
  return { name: "batman_sample.cd", bytes };
}
