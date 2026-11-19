# CD Editor

A browser-based editor for the `.CD` character-definition files used by TT Games' LEGO games
(LEGO Marvel Super Heroes, LEGO Marvel Avengers and their relatives). It parses the container
structure instead of treating the file as anonymous bytes, so you can find a character's OLST
groups, inspect every MOBJ entry, and edit names, materials and character parameters in place.

## Run it offline

Two ways, neither of which needs a network connection at run time.

**1. The single file (easiest).** Download `CD-editor.html` from this repository and open it in
Chrome, Edge or Firefox. Everything — markup, styles, icons and the parser — is inlined, so the
app works straight from disk with no server and no install.

**2. From source.**

```bash
npm install
npm run dev      # http://localhost:3000
```

To produce a fresh single-file copy after changing the code:

```bash
npm run build:offline   # writes CD-editor.html and dist/CD-editor.html
```

`npm run build` alone type-checks and writes a normal static bundle to `dist/`, which you can
serve from any static file host (`npx vite preview`, GitHub Pages, a folder on disk via
`python -m http.server`). Use `npm run build:offline` for the double-clickable file.

## Using the editor

1. **Open a `.CD`.** Drop a file on the window or use the folder button. Files never leave the
   page: parsing, editing and exporting all happen locally in the browser.
2. **Find the block.** The left panel has four views:
   - **Tree** — the persistent block list. OLST groups expand into their MOBJ entries, with body
     part names, sizes and inline name editing.
   - **Web** — the same structure drawn as a spider web: every OLST is a hub, its MOBJ entries are
     the dots around it, and lines show the connections. Click any node to inspect it.
   - **Categories** — references grouped by asset family, useful for finding a character's parts.
   - **References** — a flat, filterable list of every name slot in the file.
3. **Edit.** Double-click a name in the tree, or use the inspector on the right. Edits are
   length-checked against the slot's capacity before anything is written.
4. **Save a copy.** The save button (or Ctrl+S) downloads `<name>_edited.cd`. Working state can
   be reverted, and every edit is undoable.

### Inspector

The right-hand panel adapts to the selection:

- **String slots** — the reference name, its capacity and its surrounding context.
- **Texture entries** — Flux's *Material* number (with the body-part name it maps to, e.g. `3 ·
  Body front`), the texture slot, the texture file, and a beta *reassign textures* block that
  renames a texture group (`BODY_SENTRY_FRONT` → `BODY_OURCHOICE_FRONT`) across every fitting
  reference.
- **Character definitions** (DX11 files) — model type, skeleton, default action, motion blur,
  interpolate, chase-cam joint, tint, alpha, lighting joint, shadow flag and blob size/centre,
  laid out like the Flux character-definition form.
- **Bytes** — a single byte with a writable hex value.

### Hex panel

The hex strip sits under the tree and inspector. It shows offsets, bytes, ASCII, the byte depth of
each container and any byte you have changed. It can be collapsed, resized by dragging its top
border, or hidden entirely from Settings. The tree panel is independent and always stays put.

### Compare

The **Compare** mode loads two files side by side and reports structural differences between
generations (NXG and DX11) without modifying either.

## Settings

Open the cog in the tree toolbar:

- **Theme** — light or dark.
- **Accent** — blue, green, violet, orange, rose, red or yellow, with an on/off switch. The accent
  only touches focus rings, selection, links and primary buttons; with it off the interface is
  strictly monochrome.
- **Panels** — show or hide the hexadecimal window.
- **Tree** — colour the OLST and MOBJ tags (blue and amber) so block types separate at a glance.
- **Icons** — round or sharp. Sharp squares every button corner and draws icon strokes with mitred
  joins.

All settings are remembered between sessions.

## Editing model

- Every write happens in place inside the byte buffer. Slots never grow, and no header table is
  rebuilt.
- An edit is offered only where the decoded layout validates against the file. The NXG character
  struct is not decoded yet, so the character form appears for DX11 files only.
- Export always produces a copy; the original on disk is untouched.
- Adding a MOBJ appends a block; DX11 header tables are not rebuilt, so verify additions in game.

## File formats

| Generation | Game | How the file is read |
| --- | --- | --- |
| NXG | LEGO Marvel Super Heroes (and earlier) | StreamInfo schema header, then OLST groups with inline length-prefixed MOBJ names. |
| DX11 | LEGO Marvel Avengers | Header string pool followed by OLST groups and their MOBJ entries; block sizes come from the block headers. |

The variant is detected from the file itself, not the extension.

## Project layout

```
src/App.tsx                 shell, workspace layout, edits and undo/redo
src/components/TreeView.tsx block tree with inline editing and add-MOBJ
src/components/GraphView.tsx web view of OLST hubs and MOBJ entries
src/components/Inspector.tsx string, container, texture and byte forms
src/components/CharacterParams.tsx  character definition form
src/components/HexView.tsx  virtualised hex editor
src/components/SettingsPanel.tsx    theme, accent, panels, icons
src/lib/cd.ts               format detection, parsing, replacement, add-MOBJ
src/lib/character.ts        character struct decoder/encoder (DX11)
src/lib/texture.ts          material and texture-slot fields
src/lib/reassign.ts         texture-group rename planner
scripts/build-offline.mjs   inlines the build into CD-editor.html
```

## Known limitations

- NXG character parameters are not exposed yet — the field offsets differ from DX11 and have not
  been validated.
- Renaming a reference never resizes its slot. Names that no longer fit are refused (rename) or
  skipped (reassign).
- The app reads and writes the buffered file only. It does not understand texture archives or the
  game's package formats.

## Sample files

`samples/` holds a pair of reference files used during development (`LMA_SENTRY.CD` for DX11 and
`LMSH1 SENTRY.cd` for NXG). They are local test data and are not required by the app.
