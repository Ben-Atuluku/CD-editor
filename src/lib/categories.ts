/**
 * Semantic grouping of .CD references.
 *
 * The container tree tells you where bytes live, but modders think in asset
 * families: textures, animations, sounds, and so on. Flux presents the file
 * that way. The OLST "type" ids that presumably drive that grouping are not
 * documented for either the NXG or DX11 generation, so this file classifies by
 * the strongest evidence available in the reference text itself (path segment
 * and extension), and falls back to the dominant category of the surrounding
 * container.
 *
 * When real NXG and DX11 samples are available, type-id mappings can be added
 * to TYPE_HINTS without changing the UI.
 */

import type { CdDocument, ContainerNode, StringSlot } from "./cd";

export type CategoryId =
  | "textures"
  | "animations"
  | "sounds"
  | "abilities"
  | "attachments"
  | "models"
  | "materials"
  | "skeletons"
  | "hats"
  | "effects"
  | "data"
  | "other";

export interface CategoryInfo {
  label: string;
  hint: string;
  color: string;
}

export const CATEGORY_ORDER: CategoryId[] = [
  "textures",
  "animations",
  "sounds",
  "abilities",
  "attachments",
  "models",
  "materials",
  "skeletons",
  "hats",
  "effects",
  "data",
  "other",
];

export const CATEGORY_INFO: Record<CategoryId, CategoryInfo> = {
  textures: {
    label: "Textures",
    hint: "TEX / DDS / TSH image references",
    color: "#ffcf4d",
  },
  animations: {
    label: "Animations",
    hint: "Animation sets and clips",
    color: "#63a6ff",
  },
  sounds: {
    label: "Sound effects",
    hint: "CBX / WAV / OGG audio references",
    color: "#57d091",
  },
  abilities: {
    label: "Abilities",
    hint: "Ability definitions and combat moves",
    color: "#f2a65a",
  },
  attachments: {
    label: "Attachments",
    hint: "Hair, face, cape and character parts",
    color: "#ff8fb1",
  },
  models: {
    label: "Models",
    hint: "GHG / GSC geometry references",
    color: "#c58cff",
  },
  materials: {
    label: "Materials",
    hint: "Material and shader remaps",
    color: "#ff9f6b",
  },
  skeletons: {
    label: "Skeletons",
    hint: "Skeleton and character project references",
    color: "#6bd6d0",
  },
  hats: {
    label: "Hats & extras",
    hint: "Hat, hair and attachment slots",
    color: "#ff8fb1",
  },
  effects: {
    label: "Effects",
    hint: "Particle and effect references",
    color: "#d8e05a",
  },
  data: {
    label: "Data files",
    hint: "Text, XML and configuration references",
    color: "#9aa9bd",
  },
  other: {
    label: "Unclassified",
    hint: "References with no recognisable asset family",
    color: "#8492a7",
  },
};

/**
 * OLST "type" ids agree across the LMSH1 (NXG) and LMA (DX11) character files:
 * 3 abilities, 5 textures, 6 attachments, 9 voice and sound effects. Type 0 is
 * the character root. Unknown ids fall back to the names the group holds.
 */
export const TYPE_HINTS: Record<number, CategoryId> = {
  3: "abilities",
  5: "textures",
  6: "attachments",
  9: "sounds",
};

/**
 * Ordered on purpose: a path segment like HATS\ wins over a .GHG extension,
 * and a .CBX extension wins over a name that looks like an animation.
 */
const RULES: Array<[CategoryId, RegExp]> = [
  ["sounds", /^vo_/i],
  ["sounds", /^(act|wpn|expl|phy|water|fs|foly|skydive)_/i],
  ["sounds", /\.(cbx|wav|ogg|mp3|adp|aif|aiff)$/i],
  ["sounds", /(^|[\\/])sounds?([\\/]|$)/i],
  ["abilities", /^ability_/i],
  ["hats", /(^|[\\/])hats?([\\/]|$)/i],
  ["textures", /\.(tex|dds|tsh|png|tga|bmp)$/i],
  ["textures", /(^|[\\/])textures?([\\/]|$)/i],
  ["textures", /psp2_s3tc_tex|_texture[\\/]/i],
  ["attachments", /charattachment|(^|[\\/])(hair|face|cape)([\\/]|_)/i],
  ["animations", /\.(an[0-9]|as)$/i],
  ["animations", /(^|[\\/])anims?([\\/]|$)/i],
  ["animations", /_(default|idle|run|walk|sprint|attack|jump|fall|land|hit|die|celebrate)$/i],
  ["models", /\.(ghg|gsc|cmo|nup|mesh)$/i],
  ["materials", /\.(mtl|mat|material)$/i],
  ["skeletons", /\.(cpi|csk|cpd|cpj)$/i],
  ["skeletons", /(^|[\\/])skel/i],
  ["effects", /\.(par|ptl|fx)$/i],
  ["data", /\.(txt|xml|csv|cfg|binary|scp|scn)$/i],
];

export function classifyReference(text: string): CategoryId | null {
  for (const [category, pattern] of RULES) {
    if (pattern.test(text)) return category;
  }
  return null;
}

export interface CategoryBlock {
  container: ContainerNode | null;
  name: string;
  slots: StringSlot[];
}

export interface CategoryGroup {
  id: CategoryId;
  info: CategoryInfo;
  blocks: CategoryBlock[];
  count: number;
}

function blockName(node: ContainerNode | null): string {
  if (!node) return "Asset name pool";
  if (node.fourcc === "OLST") return `OLST · type ${node.type ?? "?"}`;
  if (node.fourcc === "MOBJ") {
    if (node.ids) return `MOBJ · id ${node.ids[0]}/${node.ids[1]}`;
    return node.label ? `MOBJ · ${node.label}` : "MOBJ";
  }
  return node.fourcc;
}

/**
 * A container inherits the majority category of the references beneath it, so
 * a texture list whose paths lack extensions still lands in Textures.
 */
function inheritedCategories(doc: CdDocument): Map<string, CategoryId> {
  const result = new Map<string, CategoryId>();
  const deepestFirst = [...doc.containers].sort((a, b) => b.depth - a.depth);

  for (const node of deepestFirst) {
    const hint = node.fourcc === "OLST" && node.type != null ? TYPE_HINTS[node.type] : undefined;
    if (hint) {
      result.set(node.id, hint);
      continue;
    }

    const counts = new Map<CategoryId, number>();
    let classified = 0;

    const walk = (current: ContainerNode) => {
      for (const slot of current.strings) {
        const category = classifyReference(slot.text);
        if (!category) continue;
        classified++;
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }
      current.children.forEach(walk);
    };
    walk(node);

    if (classified < 2) continue;
    let best: CategoryId | null = null;
    let bestCount = 0;
    for (const [category, count] of counts) {
      if (count > bestCount) {
        best = category;
        bestCount = count;
      }
    }
    if (best && bestCount / classified >= 0.6) result.set(node.id, best);
  }

  return result;
}

export function groupReferences(doc: CdDocument): CategoryGroup[] {
  const inherited = inheritedCategories(doc);
  const containerById = new Map(doc.containers.map((node) => [node.id, node]));

  /** Climb the block tree: a MOBJ inside an animation OLST inherits "animations". */
  const inheritedFor = (containerId: string | null): CategoryId | null => {
    let current = containerId;
    while (current) {
      const found = inherited.get(current);
      if (found) return found;
      current = containerById.get(current)?.parentId ?? null;
    }
    return null;
  };

  const byCategory = new Map<CategoryId, Map<string, StringSlot[]>>();

  for (const slot of doc.strings) {
    // StreamInfo strings are header labels, not asset references.
    if (slot.readOnly) continue;
    const explicit = classifyReference(slot.text);
    const fallback = inheritedFor(slot.containerId);
    const category = explicit ?? fallback ?? "other";
    const key = slot.containerId ?? "streaminfo";
    if (!byCategory.has(category)) byCategory.set(category, new Map());
    const blocks = byCategory.get(category)!;
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key)!.push(slot);
  }

  const groups: CategoryGroup[] = [];

  for (const id of CATEGORY_ORDER) {
    const blocks = byCategory.get(id);
    if (!blocks || blocks.size === 0) continue;

    const orderedBlocks: CategoryBlock[] = [...blocks.entries()]
      .map(([key, slots]) => {
        const container = key === "streaminfo" ? null : containerById.get(key) ?? null;
        return { container, name: blockName(container), slots };
      })
      .sort((a, b) => (a.slots[0]?.offset ?? 0) - (b.slots[0]?.offset ?? 0));

    groups.push({
      id,
      info: CATEGORY_INFO[id],
      blocks: orderedBlocks,
      count: orderedBlocks.reduce((sum, block) => sum + block.slots.length, 0),
    });
  }

  return groups;
}
