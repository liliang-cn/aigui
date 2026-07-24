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

SMILES is supported for 2D structures only:

    ```molecule
    {"version":1,"format":"smiles","source":"CCO","view":"2d","atomLabels":"standard","highlight":{"atoms":[2]}}
    ```

Molfile supports 2D and 3D. A 3D structure must contain finite, genuinely non-flat z coordinates:

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
- `maxAtoms?: number`: 1 to 1024, default `256`.
- `maxBonds?: number`: 0 to 2048, default `512`.
- `maxSourceBytes?: number`: 1 to 256 KiB, default 64 KiB.

Both OpenChemLib and 3Dmol are loaded dynamically. Importing this package in Node does not load browser chemistry libraries. 3D rendering passes only validated local Molfile text to `addModel`; it never calls remote loading, download, fetch, get, or autoload APIs.
