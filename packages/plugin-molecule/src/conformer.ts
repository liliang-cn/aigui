/**
 * 3D coordinates for a structure that arrived without any.
 *
 * A model writes SMILES fluently and Molfiles with real z coordinates almost never, so "3D needs
 * a Molfile" meant 3D was never used. OpenChemLib's conformer generator fills the gap: it adds
 * the hydrogens, picks the most likely torsions from the COD tables and returns a collision-free
 * geometry. The seed is fixed so the same SMILES always draws the same picture.
 */

export interface ConformerMolecule {
  getAllAtoms(): number
  getAtomX(atom: number): number
  getAtomY(atom: number): number
  getAtomZ(atom: number): number
  setAtomX(atom: number, x: number): void
  setAtomY(atom: number, y: number): void
  setAtomZ(atom: number, z: number): void
  toMolfile(): string
}

export interface ConformerCapableModule {
  Resources: {
    register(data: string | Record<string, string>): void
    registerFromNodejs?(path?: string): void
  }
  ConformerGenerator: new (seed: number) => {
    getOneConformerAsMolecule<M extends ConformerMolecule>(molecule: M): M | null
  }
  ForceFieldMMFF94: new (molecule: ConformerMolecule, tablename: "MMFF94" | "MMFF94s" | "MMFF94s+") => {
    getTotalEnergy(): number
    minimise(options?: { maxIts?: number; gradTol?: number; funcTol?: number }): number
  }
}

const SEED = 42
/** Enough for a drug-sized molecule to settle; each iteration is a gradient step, not a search. */
const MINIMISE_ITERATIONS = 400

let registration: Promise<void> | null = null

/**
 * Register the torsion tables the generator reads, once.
 *
 * Under Node they come straight from the installed package. In a browser they come from the
 * module vendored at build time — never from the network, which is what OpenChemLib's own
 * `registerFromUrl` would do and what this plugin promises not to.
 */
export function ensureConformerResources(OCL: ConformerCapableModule): Promise<void> {
  return (registration ??= (async () => {
    const isNode = typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node === "string"
    if (isNode && typeof OCL.Resources.registerFromNodejs === "function") {
      OCL.Resources.registerFromNodejs()
      return
    }
    const { default: resources } = await import("./generated/conformer-resources.js")
    OCL.Resources.register(resources)
  })().catch((error: unknown) => {
    // A failed registration must not poison every later attempt.
    registration = null
    throw error
  }))
}

/**
 * Give `molecule` 3D coordinates in place, or return null when no geometry could be found.
 *
 * Two steps. The torsion library produces a collision-free arrangement whose bond lengths and
 * angles are only approximately right — a space-filling picture of it looks crowded, and a
 * chemist can tell. An MMFF94s minimisation then relaxes it; on a drug-sized molecule that takes
 * tens of milliseconds and roughly halves the strain energy. If the force field cannot be set up
 * (an element it has no parameters for, say), the unrelaxed geometry is still a valid picture and
 * is kept.
 */
export function generateConformer<M extends ConformerMolecule>(OCL: ConformerCapableModule, molecule: M): M | null {
  const conformer = new OCL.ConformerGenerator(SEED).getOneConformerAsMolecule(molecule)
  if (!conformer) return null
  try {
    new OCL.ForceFieldMMFF94(conformer, "MMFF94s").minimise({ maxIts: MINIMISE_ITERATIONS })
  } catch {
    // Unrelaxed is still drawable.
  }
  orientForViewing(conformer)
  return conformer
}

type Vec3 = [number, number, number]
type Mat3 = [Vec3, Vec3, Vec3]

/**
 * Turn the molecule so its flattest face looks at the reader.
 *
 * The generator's coordinate frame is arbitrary, and the viewer's opening shot is whatever that
 * frame happens to be — an aromatic ring seen edge-on as often as not. Aligning the principal
 * axes with the screen puts the longest extent across, the next down, and the thinnest along
 * the line of sight, which is the view a textbook draws. The rotation is a proper one: a
 * reflection would draw the enantiomer, and a picture that quietly flips a stereocentre is worse
 * than no picture.
 */
export function orientForViewing(molecule: ConformerMolecule): void {
  const count = molecule.getAllAtoms()
  if (count < 2) return
  const points: Vec3[] = []
  const centre: Vec3 = [0, 0, 0]
  for (let atom = 0; atom < count; atom++) {
    const p: Vec3 = [molecule.getAtomX(atom), molecule.getAtomY(atom), molecule.getAtomZ(atom)]
    points.push(p)
    for (let i = 0; i < 3; i++) centre[i] += p[i] / count
  }
  const covariance: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (const p of points) {
    const d = [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]]
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) covariance[i][j] += d[i] * d[j]
  }
  const { values, vectors } = jacobiEigen(covariance)
  // Columns ordered by variance, largest first: screen x, screen y, line of sight.
  const order = [0, 1, 2].sort((a, b) => values[b] - values[a])
  const axes: Mat3 = order.map((k) => [vectors[0][k], vectors[1][k], vectors[2][k]] as Vec3) as Mat3
  const det =
    axes[0][0] * (axes[1][1] * axes[2][2] - axes[1][2] * axes[2][1]) -
    axes[0][1] * (axes[1][0] * axes[2][2] - axes[1][2] * axes[2][0]) +
    axes[0][2] * (axes[1][0] * axes[2][1] - axes[1][1] * axes[2][0])
  if (det < 0) axes[2] = [-axes[2][0], -axes[2][1], -axes[2][2]]
  for (let atom = 0; atom < count; atom++) {
    const d = [points[atom][0] - centre[0], points[atom][1] - centre[1], points[atom][2] - centre[2]]
    const rotated = axes.map((axis) => axis[0] * d[0] + axis[1] * d[1] + axis[2] * d[2])
    molecule.setAtomX(atom, rotated[0])
    molecule.setAtomY(atom, rotated[1])
    molecule.setAtomZ(atom, rotated[2])
  }
}

/** Eigen-decomposition of a symmetric 3×3 matrix by Jacobi rotation; small, exact enough, no dependency. */
function jacobiEigen(input: Mat3): { values: Vec3; vectors: Mat3 } {
  const a: Mat3 = input.map((row) => [...row] as Vec3) as Mat3
  const v: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] * a[p][q]
    if (off < 1e-18) break
    for (let p = 0; p < 3; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-30) continue
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < 3; k++) {
          const akp = a[k][p]
          const akq = a[k][q]
          a[k][p] = c * akp - s * akq
          a[k][q] = s * akp + c * akq
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p][k]
          const aqk = a[q][k]
          a[p][k] = c * apk - s * aqk
          a[q][k] = s * apk + c * aqk
        }
        for (let k = 0; k < 3; k++) {
          const vkp = v[k][p]
          const vkq = v[k][q]
          v[k][p] = c * vkp - s * vkq
          v[k][q] = s * vkp + c * vkq
        }
      }
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], vectors: v }
}
