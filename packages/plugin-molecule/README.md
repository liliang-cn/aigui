# @ai-gui/plugin-molecule

Safe molecular structure rendering for [AIGUI](../../README.md). The plugin claims one complete-gated `molecule` fence and renders validated SMILES or Molfile source as responsive 2D SVG or an interactive 3D viewer.

## Install

```sh
pnpm add @ai-gui/plugin-molecule
```

## Usage

```tsx
import { molecule, moleculeCss } from "@ai-gui/plugin-molecule"
import { AIRenderer } from "@ai-gui/react"

<style>{moleculeCss}</style>
<AIRenderer plugins={[molecule({ enable3D: true })]} />
```

SMILES draws in 2D, and in 3D:

    ```molecule
    {"version":1,"format":"smiles","source":"CCO","view":"2d","atomLabels":"standard","highlight":{"atoms":[2]}}
    ```

    ```molecule
    {"version":1,"format":"smiles","source":"Cn1cnc2c1c(=O)n(C)c(=O)n2C","view":"3d","style":"ball-and-stick"}
    ```

A SMILES string carries no coordinates, so for `"view":"3d"` they are generated: OpenChemLib's
conformer generator adds the hydrogens and finds a collision-free geometry from its torsion
tables, and an MMFF94s minimisation then relaxes it to proper bond lengths and angles — tens of
milliseconds on a drug-sized molecule, and the difference between a space-filling picture that
looks like the molecule and one that looks like a pile of spheres. The seed is fixed, so the same
SMILES always draws the same structure. This is what makes
3D reachable for a model at all — it writes SMILES fluently and a Molfile with real z coordinates
almost never, and the prompt spec tells it so. Highlight indexes refer to the atoms and bonds as
written; the added hydrogens go after them.

Molfile supports 2D and 3D. A 3D Molfile must contain finite, genuinely non-flat z coordinates —
its coordinates are the author's claim, and a flat one is a drawing dressed up as 3D:

In 3D a highlight is drawn in the vocabulary of the style it sits in: among balls and sticks the
marked atoms get a larger amber sphere and the marked bonds a thicker amber stick; in space-filling,
where either would be buried inside the atoms' own spheres, the marked atoms turn amber instead.

    ```molecule
    {"version":1,"format":"molfile","source":"...local Molfile text...","view":"3d","style":"ball-and-stick"}
    ```

The protocol accepts only `version`, `format`, `source`, `view`, optional `style`, optional `atomLabels`, and optional `highlight`. Unknown fields, URLs, class instances, cycles, sparse arrays, duplicate indexes, unsafe integers, nonfinite values, malformed chemistry, and oversized structures are rejected with a generic non-reflective error.

## API

- `molecule(options?)` creates the AIGUI plugin.
- `moleculePromptSpec(options?)` returns the model-facing protocol description.
- `parseMoleculeDefinition(source, options?)` strictly parses and validates JSON and chemistry.
- `validateMoleculeDefinition(value, options?)` validates an existing value and its chemistry.
- `moleculeCss` contains optional package styling.

## Options

- `width?: number`: 160 to 1200, default `600`.
- `height?: number`: 160 to 900, default `400`.
- `enable3D?: boolean`: default `true`.
- `maxConformerAtoms?: number`: 1 to 1024, default `64`. The largest SMILES structure, in heavy
  atoms, that is given generated 3D coordinates. The search runs on the page's main thread and
  grows with the number of rotatable bonds — caffeine takes milliseconds, a steroid seconds — so
  anything larger is refused in 3D and can still be drawn in 2D.
- `maxAtoms?: number`: 1 to 1024, default `256`.
- `maxBonds?: number`: 0 to 2048, default `512`.
- `maxSourceBytes?: number`: 1 to 256 KiB, default 64 KiB.

Both OpenChemLib and 3Dmol are loaded dynamically. Importing this package in Node does not load browser chemistry libraries. 3D rendering passes only validated local Molfile text to `addModel` — the file as written, or the one generated from SMILES; it never calls remote loading, download, fetch, get, or autoload APIs.

The torsion and bond-length tables the conformer generator reads and the MMFF94 tables the minimisation reads (~940 KB of OpenChemLib's BSD-3-Clause `resources.json`) are copied out of the pinned dependency at build time and loaded as a lazy chunk the first time a SMILES structure is drawn in 3D. OpenChemLib's own `Resources.registerFromUrl()` would fetch them at runtime; this plugin does not.
