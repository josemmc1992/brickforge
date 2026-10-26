import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {createVariantProver, ProofError, PROOF_VERSION, SURFACE_PROOF_VERSION, EXACT_PROOF_VERSION} from './lib/variant-proof.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const outputPath = path.join(root, 'lib/assembly-variants.json');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'lib/catalog-data.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(root, 'lib/geometry-index.json'), 'utf8'));
// These bases have reviewed connection profiles and deliberately exposed planar
// painting surfaces. Adding a new base requires reviewing its physical profile.
const reviewed = ['2431', '2465', '3001', '3002', '3003', '3004', '3005', '3007', '3008', '3009', '3010', '3024', '3037', '3039', '3460', '3622', '3623', '3666', '3710', '4162', '6636', '26603', '3023b', '3068a', '3068b', '3069b', '3070b', '48288', '63864', '69729', '87079'].sort();
// These explicit cores retain the reviewed studs/sockets and body. The replaced
// surfaces are the DAT's own disc, cylinder or conical facets. 98138s02 exposes
// the whole top; its parent 98138s01 also includes the unprinted outer rim.
const surfaceCores = {
  '98138': ['s/98138s01.dat', 's/98138s02.dat'],
  '3062b': ['s/3062bs01.dat'], '3941': ['s/3941s01.dat'], '98100': ['s/98100s01.dat'],
};
const packs = new Map();
const repository = {
  resolve(name) { return [`parts/${name}`, `p/${name}`, `models/${name}`, name].find(key => Object.hasOwn(index, key)); },
  read(key) {
    const packId = index[key];
    if (!Number.isInteger(packId)) throw new ProofError('missing_geometry', `Unindexed geometry: ${key}`);
    if (!packs.has(packId)) {
      const bytes = fs.readFileSync(path.join(root, `public/catalog/geometry/${packId}.bin`));
      packs.set(packId, JSON.parse(gunzipSync(bytes, {maxOutputLength: 64 * 1024 * 1024})));
      if (packs.size > 12) packs.delete(packs.keys().next().value);
    }
    const pack = packs.get(packId);
    packs.delete(packId); packs.set(packId, pack);
    if (!Object.hasOwn(pack, key) || typeof pack[key] !== 'string') throw new ProofError('missing_geometry', `Geometry absent from its archive: ${key}`);
    return pack[key];
  },
};

async function reviewedProfiles() {
  const entry = path.join(root, 'lib/base-profiles.ts');
  if (!fs.existsSync(entry)) throw new Error('lib/base-profiles.ts must export baseProfile and basePartIds before compiling variants.');
  // Keep this deterministic in restricted desktop workspaces: the only input
  // dependency is the bundled catalog, not ancestor tsconfigs or node_modules.
  const result = await build({
    stdin: {contents: fs.readFileSync(entry, 'utf8'), sourcefile: 'base-profiles.ts', loader: 'ts'},
    bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22', tsconfigRaw: {},
    plugins: [{name: 'reviewed-catalog', setup(builder) {
      builder.onResolve({filter: /^\.\/catalog-data\.json$/}, () => ({path: 'catalog-data.json', namespace: 'reviewed'}));
      builder.onLoad({filter: /.*/, namespace: 'reviewed'}, () => ({contents: JSON.stringify(catalog), loader: 'json'}));
    }}],
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  if (typeof module.baseProfile !== 'function' || !Array.isArray(module.basePartIds)) throw new Error('Expected baseProfile() and basePartIds exports.');
  return new Map([...module.basePartIds].sort().map(id => {
    const profile = module.baseProfile(id);
    if (!module.basePartIds.includes(id) || !profile) throw new Error(`Reviewed physical profile absent: ${id}`);
    return [id, createHash('sha256').update(JSON.stringify(profile)).digest('hex')];
  }));
}

const profiles = await reviewedProfiles(), prover = createVariantProver(repository);
const bases = new Map(), surfaceBases = new Map(), exactBases = new Map(), exactBySignature = new Map(), baseProofRejections = {};
const rootReferences = text => text.split(/\r?\n/).filter(line => /^\s*1\s/.test(line)).map(line => line.trim().split(/\s+/).slice(14).join(' ').replaceAll('\\', '/').toLowerCase());
const geometryAnchors = new Set([...profiles.keys()].map(id => `${id}.dat`));
for (const [id, profile] of profiles) {
  for (const reference of rootReferences(repository.read(repository.resolve(`${id}.dat`)))) {
    if (reference.startsWith('s/')) geometryAnchors.add(reference);
  }
  try { bases.set(id, prover.prepareBase(id, profile)); }
  catch (error) {
    if (!(error instanceof ProofError) || reviewed.includes(id)) throw error;
  }
  for (const core of surfaceCores[id] || []) {
    try {
      const base = prover.prepareSurfaceBase(id, core, profile);
      if (!surfaceBases.has(id)) surfaceBases.set(id, []);
      surfaceBases.get(id).push(base);
    } catch (error) {
      if (!(error instanceof ProofError)) throw error;
      baseProofRejections[`${id}:${core}`] = error.code;
    }
  }
  const exact = prover.prepareExactBase(id, profile);
  exactBases.set(id, exact);
  if (!exactBySignature.has(exact.signature)) exactBySignature.set(exact.signature, []);
  exactBySignature.get(exact.signature).push(exact);
}
const aliases = {}, rejectedByReason = {}, variantsByBase = {}, proofCounts = {};
let candidateCount = 0, decoratedCandidateCount = 0, exactCandidateCount = 0;
for (const part of [...catalog].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
  if (profiles.has(part.id)) continue;
  candidateCount++;
  const matches = [...profiles.keys()].filter(id => part.id.startsWith(`${id}p`));
  let failure = 'no_profiled_equivalent', proof;
  if (matches.length === 1) {
    decoratedCandidateCount++;
    const id = matches[0], attempts = [];
    if (bases.has(id)) attempts.push([PROOF_VERSION, () => prover.proveVariant(part.id, bases.get(id))]);
    for (const base of surfaceBases.get(id) || []) attempts.push([SURFACE_PROOF_VERSION, () => prover.proveSurfaceVariant(part.id, base)]);
    attempts.push([EXACT_PROOF_VERSION, () => prover.proveExactVariant(part.id, exactBases.get(id))]);
    for (const [kind, run] of attempts) {
      try { aliases[part.id] = run(); proof = kind; break; }
      catch (error) {
        if (!(error instanceof ProofError)) throw error;
        if (error.code !== 'geometry_mismatch') failure = error.code;
      }
    }
  }
  // A complete DAG hash is expensive for giant unrelated models. A matching
  // root subfile/part reference only selects candidates; it never proves them.
  // Exact comparison still checks every transitive surface and transformation.
  const exactCandidate = matches.length === 1 || (!proof && rootReferences(repository.read(repository.resolve(`${part.id}.dat`))).some(reference => geometryAnchors.has(reference)));
  if (!proof && exactCandidate) {
    exactCandidateCount++;
    try {
      const partGeometry = prover.prepareExactBase(part.id), equivalents = exactBySignature.get(partGeometry.signature) || [];
      // If two reviewed profiles disagree, geometry alone cannot choose their
      // semantics. A filename is never used to bypass a geometric mismatch.
      if (equivalents.length && new Set(equivalents.map(b => b.profileEvidence)).size === 1) {
        aliases[part.id] = prover.proveExactVariant(part.id, equivalents[0]); proof = EXACT_PROOF_VERSION;
      } else if (equivalents.length) failure = 'ambiguous_profile';
    } catch (error) {
      if (!(error instanceof ProofError)) throw error;
      failure = error.code;
    }
  }
  if (proof) {
    const id = aliases[part.id].base;
    variantsByBase[id] = (variantsByBase[id] || 0) + 1;
    proofCounts[proof] = (proofCounts[proof] || 0) + 1;
  } else {
    rejectedByReason[failure] = (rejectedByReason[failure] || 0) + 1;
  }
}
const ordered = object => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
const result = {
  version: 1, aliases,
  summary: {
    proof: 'ldraw-verified-equivalence-v2', variantCount: Object.keys(aliases).length,
    basePartCount: Object.keys(variantsByBase).length, reviewedBaseCount: profiles.size,
    planarBaseCount: bases.size, facetedBaseCount: surfaceBases.size,
    candidateCount, decoratedCandidateCount, exactCandidateCount, rejectedCount: candidateCount - Object.keys(aliases).length,
    variantsByBase: ordered(variantsByBase), proofCounts: ordered(proofCounts),
    rejectedByReason: ordered(rejectedByReason), baseProofRejections: ordered(baseProofRejections),
  },
};
const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8').replaceAll('\r\n', '\n') !== serialized) {
    console.error('Assembly variant proofs are stale. Run npm run catalog:generate and review the generated changes.');
    process.exitCode = 1;
  } else console.log(`Assembly proofs verified: ${result.summary.variantCount} variants / ${result.summary.basePartCount} bases.`);
} else {
  fs.writeFileSync(outputPath, serialized);
  console.log(JSON.stringify(result.summary, null, 2));
}
