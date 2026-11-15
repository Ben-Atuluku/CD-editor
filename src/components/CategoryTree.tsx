import { useState } from "react";
import { formatOffset, type CdDocument, type StringSlot } from "../lib/cd";
import { groupReferences, type CategoryBlock, type CategoryGroup } from "../lib/categories";
import type { Selection } from "../lib/selection";

interface Props {
  doc: CdDocument;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
}

function SlotRow({
  slot,
  selection,
  onSelect,
}: {
  slot: StringSlot;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
}) {
  const active = selection?.kind === "string" && selection.offset === slot.offset;
  return (
    <button
      className={`cat-slot ${active ? "active" : ""}`}
      onClick={() => onSelect({ kind: "string", offset: slot.offset, length: slot.byteLength })}
      title={`${formatOffset(slot.offset)} · ${slot.byteLength} bytes · max ${slot.capacity} characters`}
    >
      <span className="cat-slot-text">{slot.text}</span>
      <span className="cat-slot-offset">{formatOffset(slot.offset)}</span>
    </button>
  );
}

function Block({
  block,
  selection,
  onSelect,
  collapsed,
  onToggle,
}: {
  block: CategoryBlock;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="cat-block">
      <button className="cat-block-head" onClick={onToggle}>
        <span className={`cat-caret ${collapsed ? "closed" : ""}`}>▾</span>
        <span className="cat-block-name">{block.name}</span>
        <span className="cat-block-count">{block.slots.length}</span>
      </button>
      {!collapsed && (
        <div className="cat-slots">
          {block.slots.map((slot) => (
            <SlotRow key={slot.id} slot={slot} selection={selection} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function Group({
  group,
  selection,
  onSelect,
  collapsedGroups,
  collapsedBlocks,
  toggleGroup,
  toggleBlock,
}: {
  group: CategoryGroup;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  collapsedGroups: Set<string>;
  collapsedBlocks: Set<string>;
  toggleGroup: (id: string) => void;
  toggleBlock: (id: string) => void;
}) {
  const open = !collapsedGroups.has(group.id);

  return (
    <section className="cat-group">
      <button className="cat-head" onClick={() => toggleGroup(group.id)}>
        <span className={`cat-caret ${open ? "" : "closed"}`}>▾</span>
        <span className="cat-dot" />
        <span className="cat-label">{group.info.label}</span>
        <span className="cat-hint">{group.info.hint}</span>
        <span className="cat-count">{group.count}</span>
      </button>

      {open && (
        <div className="cat-body">
          {group.blocks.map((block) => {
            const key = `${group.id}:${block.container?.id ?? "streaminfo"}`;
            return (
              <Block
                key={key}
                block={block}
                selection={selection}
                onSelect={onSelect}
                collapsed={collapsedBlocks.has(key)}
                onToggle={() => toggleBlock(key)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export function CategoryTree({ doc, selection, onSelect }: Props) {
  const groups = groupReferences(doc);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());

  const toggle = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  ) => (id: string) => {
    setter((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (groups.length === 0) {
    return (
      <div className="tree-empty">
        No references were found in this file. Open the Raw blocks tab or the hex view to inspect it
        directly.
      </div>
    );
  }

  return (
    <div className="categories">
      {groups.map((group) => (
        <Group
          key={group.id}
          group={group}
          selection={selection}
          onSelect={onSelect}
          collapsedGroups={collapsedGroups}
          collapsedBlocks={collapsedBlocks}
          toggleGroup={toggle(setCollapsedGroups)}
          toggleBlock={toggle(setCollapsedBlocks)}
        />
      ))}
      <p className="cat-note">
        Grouping is inferred from reference paths and extensions; StreamInfo header strings are left
        to the All refs tab. Once real NXG and DX11 files are analysed, OLST type ids can be pinned to
        these headings.
      </p>
    </div>
  );
}
