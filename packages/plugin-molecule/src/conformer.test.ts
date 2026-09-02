// @vitest-environment node
import { describe, expect, it } from "vitest"
import { ensureConformerResources, generateConformer, orientForViewing, type ConformerCapableModule } from "./conformer"

interface Mol {
  getAllAtoms(): number
  getAtomX(atom: number): number
  getAtomY(atom: number): number
  getAtomZ(atom: number): number
  setAtomX(atom: number, x: number): void
  setAtomY(atom: number, y: number): void
  setAtomZ(atom: number, z: number): void
  getConnAtom(atom: number, index: number): number
  ensureHelperArrays(mask: number): void
  toMolfile(): string
}
type Ocl = ConformerCapableModule & { Molecule: { fromSmiles(source: string): Mol } }

const load = async (): Promise<Ocl> => {
  const OCL = (await import("openchemlib")) as unknown as Ocl
  await ensureConformerResources(OCL)
  return OCL
}
const distance = (mol: Mol, a: number, b: number) =>
  Math.hypot(mol.getAtomX(a) - mol.getAtomX(b), mol.getAtomY(a) - mol.getAtomY(b), mol.getAtomZ(a) - mol.getAtomZ(b))

describe("generateConformer", () => {
  it("adds hydrogens after the atoms as written and gives every atom finite coordinates", async () => {
    const OCL = await load()
    const mol = OCL.Molecule.fromSmiles("CCO")
    expect(generateConformer(OCL, mol)).toBe(mol)
    expect(mol.getAllAtoms()).toBe(9)
    for (let atom = 0; atom < 9; atom++) {
      expect(Number.isFinite(mol.getAtomX(atom) + mol.getAtomY(atom) + mol.getAtomZ(atom))).toBe(true)
    }
  })
  it("relaxes the geometry to textbook bond lengths", async () => {
    // Aspirin, CC(=O)Oc1ccccc1C(=O)O: a carbonyl C=O is 1.20–1.23 Å, an aromatic C–C 1.39–1.40 Å.
    // The torsion library alone gets these only roughly; the force field is what makes a
    // space-filling picture look like the molecule rather than a pile of spheres.
    const OCL = await load()
    const mol = generateConformer(OCL, OCL.Molecule.fromSmiles("CC(=O)Oc1ccccc1C(=O)O"))!
    expect(distance(mol, 1, 2)).toBeGreaterThan(1.18)
    expect(distance(mol, 1, 2)).toBeLessThan(1.26)
    expect(distance(mol, 10, 11)).toBeLessThan(1.26)
    expect(distance(mol, 4, 5)).toBeGreaterThan(1.36)
    expect(distance(mol, 4, 5)).toBeLessThan(1.43)
  })
  it("draws the same SMILES the same way every time", async () => {
    const OCL = await load()
    const a = generateConformer(OCL, OCL.Molecule.fromSmiles("CC(C)Cc1ccc(cc1)C(C)C(=O)O"))!.toMolfile()
    const b = generateConformer(OCL, OCL.Molecule.fromSmiles("CC(C)Cc1ccc(cc1)C(C)C(=O)O"))!.toMolfile()
    expect(a).toBe(b)
  })
  it("turns the flattest face of the molecule towards the reader", async () => {
    // Benzene is a disc: after orientation all of its spread is in x and y, none along the
    // line of sight — which is the difference between a ring and a line on the opening shot.
    const OCL = await load()
    const mol = generateConformer(OCL, OCL.Molecule.fromSmiles("c1ccccc1"))!
    const spread = (axis: (atom: number) => number) => {
      let low = Infinity
      let high = -Infinity
      for (let atom = 0; atom < 6; atom++) {
        low = Math.min(low, axis(atom))
        high = Math.max(high, axis(atom))
      }
      return high - low
    }
    expect(spread((a) => mol.getAtomZ(a))).toBeLessThan(0.05)
    expect(spread((a) => mol.getAtomX(a))).toBeGreaterThan(2)
    expect(spread((a) => mol.getAtomY(a))).toBeGreaterThan(2)
  })
  it("orients with a rotation, never a reflection, so a stereocentre keeps its hand", async () => {
    // L-alanine, N[C@@H](C)C(=O)O. The signed volume of the four substituents around the
    // stereocentre is the handedness; a reflection would flip its sign and draw D-alanine.
    const OCL = await load()
    const mol = generateConformer(OCL, OCL.Molecule.fromSmiles("N[C@@H](C)C(=O)O"))!
    const signedVolume = () => {
      const p = (atom: number) => [mol.getAtomX(atom), mol.getAtomY(atom), mol.getAtomZ(atom)]
      const [n, c, me, cooh] = [p(0), p(1), p(2), p(3)]
      const a = [n[0] - c[0], n[1] - c[1], n[2] - c[2]]
      const b = [me[0] - c[0], me[1] - c[1], me[2] - c[2]]
      const d = [cooh[0] - c[0], cooh[1] - c[1], cooh[2] - c[2]]
      return a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0])
    }
    const before = signedVolume()
    // Scramble the frame and orient again: the same hand must come back.
    for (let atom = 0; atom < mol.getAllAtoms(); atom++) {
      const [x, y, z] = [mol.getAtomX(atom), mol.getAtomY(atom), mol.getAtomZ(atom)]
      mol.setAtomX(atom, 0.36 * x - 0.48 * y + 0.8 * z)
      mol.setAtomY(atom, 0.8 * x + 0.6 * y)
      mol.setAtomZ(atom, -0.48 * x + 0.64 * y + 0.6 * z)
    }
    orientForViewing(mol)
    const after = signedVolume()
    expect(Math.abs(before)).toBeGreaterThan(0.5)
    expect(Math.sign(after)).toBe(Math.sign(before))
    expect(Math.abs(after)).toBeCloseTo(Math.abs(before), 3)
  })
  it("keeps the torsion-library geometry when the force field cannot be built", async () => {
    const OCL = await load()
    const broken: Ocl = {
      ...OCL,
      ForceFieldMMFF94: class {
        constructor() {
          throw new Error("no parameters")
        }
        getTotalEnergy() { return 0 }
        minimise() { return 1 }
      },
    }
    const mol = generateConformer(broken, OCL.Molecule.fromSmiles("CCO"))
    expect(mol?.getAllAtoms()).toBe(9)
  })
})
