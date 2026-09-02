---
"@ai-gui/plugin-molecule": minor
---

`view: "3d"` now works from SMILES. The 3D coordinates are generated with OpenChemLib's conformer generator and relaxed with an MMFF94s minimisation (hydrogens added, fixed seed, so the same SMILES always draws the same structure), which is what makes 3D reachable for a model at all — it writes SMILES fluently and a Molfile with real z coordinates almost never. A Molfile in 3D still needs genuine spatial coordinates. New option `maxConformerAtoms` (default 64 heavy atoms) bounds the search, which runs on the main thread. The tables both steps read are vendored at build time and loaded lazily; nothing is fetched at runtime.

Highlights in the space-filling style now show: the marked atoms are recoloured, where before a smaller amber sphere was drawn inside the atom's own and never seen.
