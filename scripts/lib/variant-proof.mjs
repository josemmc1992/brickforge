// A decoration can inherit a reviewed assembly profile only if its physical core
// is unchanged and every added visible primitive stays on a reviewed outer face.
// Names merely select candidates; they never constitute the proof.
import {createHash} from 'node:crypto';

export const PROOF_VERSION = 'ldraw-planar-decoration-v1';
export const SURFACE_PROOF_VERSION = 'ldraw-faceted-decoration-v1';
export const EXACT_PROOF_VERSION = 'ldraw-exact-geometry-v1';
export const TOLERANCE = 0.01; // LDraw units, not studs.
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const ORIGIN = [0, 0, 0];
const LIMITS = {depth: 48, records: 250_000, files: 2_000, coordinate: 10_000_000};
const hash = value => createHash('sha256').update(value).digest('hex');
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
export class ProofError extends Error {
  constructor(code, message) { super(message); this.name = 'ProofError'; this.code = code; }
}
function reject(code, message) { throw new ProofError(code, message); }

export function normalizeReference(name) {
  const normalized = name.replaceAll('\\', '/').toLowerCase();
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some(p => !p || p === '.' || p === '..') || /[:\x00-\x1f]/.test(normalized)) {
    reject('invalid_reference', 'Unsafe or malformed LDraw reference.');
  }
  return normalized;
}

export function parseLDraw(text, key = 'fixture.dat') {
  if (typeof text !== 'string' || text.length > 8_000_000) reject('file_limit', `Invalid or oversized geometry: ${key}`);
  const records = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const fields = line.split(/\s+/), type = Number(fields[0]);
    if (!/^[0-5]$/.test(fields[0])) reject('unsupported_record', `Unsupported LDraw record in ${key}`);
    if (type === 0) {
      // TEXMAP fallback and embedded MPD files have different interpretation
      // rules. This deliberately narrow proof does not attempt to interpret them.
      if (/^0\s+(?:!TEXMAP\b|!:|FILE\b|NOFILE\b)/i.test(line)) reject('unsupported_meta', `Unsupported geometry directive in ${key}`);
      continue;
    }
    if (!/^(?:\d+|0x[23][0-9a-f]{6})$/i.test(fields[1] || '')) reject('invalid_record', `Invalid colour in ${key}`);
    const count = type === 1 ? 12 : type === 2 ? 6 : type === 3 ? 9 : 12;
    if ((type === 1 ? fields.length < 15 : fields.length !== count + 2)) reject('invalid_record', `Malformed geometry in ${key}`);
    const numericFields = fields.slice(2, 2 + count);
    if (numericFields.some(v => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(v))) reject('invalid_number', `Nondecimal geometry coordinate in ${key}`);
    const values = numericFields.map(Number);
    if (values.some(v => !Number.isFinite(v) || Math.abs(v) > LIMITS.coordinate)) reject('invalid_number', `Invalid geometry coordinate in ${key}`);
    if (type === 1) {
      records.push({type, offset: values.slice(0, 3), matrix: values.slice(3), reference: normalizeReference(fields.slice(14).join(' '))});
    } else {
      const vertices = [];
      // Conditional-line control points select visibility; they are not physical
      // endpoints. They must still parse as finite numbers above.
      for (let i = 0; i < (type === 5 ? 6 : count); i += 3) vertices.push(values.slice(i, i + 3));
      records.push({type, vertices});
    }
    if (records.length > LIMITS.records) reject('complexity_limit', `Too many records in ${key}`);
  }
  return records;
}

function transform(point, matrix, offset) {
  const result = [0, 1, 2].map(i => dot(matrix.slice(i * 3, i * 3 + 3), point) + offset[i]);
  if (result.some(v => !Number.isFinite(v) || Math.abs(v) > LIMITS.coordinate)) reject('invalid_transform', 'Transformation exceeds the safe coordinate limit.');
  return result;
}
function compose(parent, child) {
  const matrix = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    matrix.push([0, 1, 2].reduce((sum, k) => sum + parent.matrix[row * 3 + k] * child.matrix[k * 3 + col], 0));
  }
  if (matrix.some(v => !Number.isFinite(v) || Math.abs(v) > LIMITS.coordinate)) reject('invalid_transform', 'Transformation exceeds the safe matrix limit.');
  return {matrix, offset: transform(child.offset, parent.matrix, parent.offset)};
}
function convexFace(vertices) {
  if (vertices.length !== 4) reject('invalid_base', 'The reviewed surface must be a quad.');
  const normal = cross(sub(vertices[1], vertices[0]), sub(vertices[2], vertices[0]));
  const length = Math.hypot(...normal);
  if (length < TOLERANCE) reject('invalid_base', 'Degenerate reviewed surface.');
  const n = normal.map(v => v / length);
  for (let i = 0; i < vertices.length; i++) {
    if (Math.abs(dot(n, sub(vertices[i], vertices[0]))) > TOLERANCE) reject('invalid_base', 'Nonplanar reviewed surface.');
    const a = sub(vertices[(i + 1) % 4], vertices[i]);
    const b = sub(vertices[(i + 2) % 4], vertices[(i + 1) % 4]);
    if (dot(cross(a, b), n) <= TOLERANCE) reject('invalid_base', 'Nonconvex reviewed surface.');
  }
  return {vertices, normal: n};
}
function insideFace(point, face) {
  if (Math.abs(dot(face.normal, sub(point, face.vertices[0]))) > TOLERANCE) return false;
  return face.vertices.every((a, i) => {
    const edge = sub(face.vertices[(i + 1) % face.vertices.length], a);
    return dot(cross(edge, sub(point, a)), face.normal) >= -TOLERANCE * Math.hypot(...edge);
  });
}

// Coplanar tessellation is not a licence to fill its convex hull. Prove that
// convex polygons cover that hull, using their union rather than an area sum
// where overlaps could conceal holes. Curves remain their original planar facets.
const AREA_EPSILON = 1e-7;
const AREA_ABSOLUTE_CAP = 1e-5;
const area2 = points => points.reduce((sum, p, i) => {
  const q = points[(i + 1) % points.length];
  return sum + p[0] * q[1] - p[1] * q[0];
}, 0);
const turn2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function convexHull(points) {
  const sorted = [...new Map(points.map(p => [JSON.stringify(p.slice(0, 2)), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = input => {
    const result = [];
    for (const p of input) {
      while (result.length > 1 && turn2(result.at(-2), result.at(-1), p) <= 1e-9) result.pop();
      result.push(p);
    }
    return result.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}
function intersectionArea(subject, clip) {
  let points = subject;
  for (let i = 0; i < clip.length && points.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length], next = [];
    for (let j = 0; j < points.length; j++) {
      const p = points[j], q = points[(j + 1) % points.length], dp = turn2(a, b, p), dq = turn2(a, b, q);
      if (dp >= 0) next.push(p);
      if ((dp < 0) !== (dq < 0)) {
        const t = dp / (dp - dq);
        next.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    points = next;
  }
  return points.length < 3 ? 0 : Math.abs(area2(points)) / 2;
}
function unionArea(polygons) {
  // Between consecutive vertex/edge-intersection X values, every boundary is
  // linear and its vertical ordering is fixed. The union of vertical intervals
  // therefore has linear length, and midpoint integration gives its exact area
  // (up to floating-point roundoff). Overlaps cannot compensate for a hole.
  const edges = polygons.flatMap(polygon => polygon.map((a, i) => [a, polygon[(i + 1) % polygon.length]]));
  const cuts = new Set(edges.flatMap(([a, b]) => [a[0], b[0]]));
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const [a, b] = edges[i], [c, d] = edges[j];
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = d[0] - c[0], vy = d[1] - c[1], determinant = ux * vy - uy * vx;
    if (Math.abs(determinant) < 1e-12) continue;
    const dx = c[0] - a[0], dy = c[1] - a[1];
    const t = (dx * vy - dy * vx) / determinant, s = (dx * uy - dy * ux) / determinant;
    if (t > 0 && t < 1 && s > 0 && s < 1) cuts.add(a[0] + t * ux);
    if (cuts.size > 50_000) reject('complexity_limit', 'Surface union arrangement is too complex.');
  }
  const xs = [...cuts].sort((a, b) => a - b);
  if (xs.length * polygons.length > 500_000) reject('complexity_limit', 'Surface union sweep is too complex.');
  let area = 0;
  for (let i = 1; i < xs.length; i++) {
    const width = xs[i] - xs[i - 1];
    if (width <= 1e-12) continue;
    const x = (xs[i] + xs[i - 1]) / 2, intervals = [];
    for (const polygon of polygons) {
      const ys = [];
      for (let j = 0; j < polygon.length; j++) {
        const a = polygon[j], b = polygon[(j + 1) % polygon.length];
        if (x > Math.min(a[0], b[0]) && x < Math.max(a[0], b[0])) ys.push(a[1] + (x - a[0]) * (b[1] - a[1]) / (b[0] - a[0]));
      }
      if (ys.length > 1) intervals.push([Math.min(...ys), Math.max(...ys)]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    let covered = 0, start, end;
    for (const [lo, hi] of intervals) {
      if (start === undefined) { start = lo; end = hi; }
      else if (lo <= end) end = Math.max(end, hi);
      else { covered += end - start; start = lo; end = hi; }
    }
    if (start !== undefined) covered += end - start;
    area += width * covered;
  }
  return area;
}
function surfaceFaces(mesh) {
  const planes = [];
  for (const {vertices, type} of mesh) {
    if (type !== 3 && type !== 4) continue;
    const raw = cross(sub(vertices[1], vertices[0]), sub(vertices[2], vertices[0])), length = Math.hypot(...raw);
    if (length < 1e-8) reject('invalid_surface', 'Degenerate base surface polygon.');
    const normal = raw.map(v => v / length);
    if (vertices.some(v => Math.abs(dot(normal, sub(v, vertices[0]))) > 0.001)) reject('invalid_surface', 'Nonplanar base surface polygon.');
    for (let i = 0; i < vertices.length; i++) {
      if (dot(cross(sub(vertices[(i + 1) % vertices.length], vertices[i]), sub(vertices[(i + 2) % vertices.length], vertices[(i + 1) % vertices.length])), normal) <= 1e-8) reject('invalid_surface', 'Nonconvex base surface polygon.');
    }
    let plane = planes.find(p => Math.abs(dot(p.normal, normal)) > 1 - 1e-8 && vertices.every(v => Math.abs(dot(p.normal, sub(v, p.origin))) < 0.001));
    if (!plane) {
      const edge = sub(vertices[1], vertices[0]), edgeLength = Math.hypot(...edge), u = edge.map(v => v / edgeLength);
      plane = {origin: vertices[0], normal, u, v: cross(normal, u), polygons: []};
      planes.push(plane);
      if (planes.length > 1_024) reject('complexity_limit', 'Too many base surface planes.');
    }
    const polygon = vertices.map(point => {
      const delta = sub(point, plane.origin);
      return [dot(delta, plane.u), dot(delta, plane.v), point];
    });
    if (area2(polygon) < 0) polygon.reverse();
    plane.polygons.push(polygon);
    if (plane.polygons.length > 512) reject('complexity_limit', 'Too many polygons in one surface plane.');
  }
  if (!planes.length) reject('invalid_surface', 'No base surface polygons.');
  return planes.map(plane => {
    const hull = convexHull(plane.polygons.flat()), hullArea = Math.abs(area2(hull)) / 2;
    // Never let a large part turn a relative rounding allowance into a visible
    // hole. The absolute area cap is below the positional tolerance squared.
    const epsilon = Math.min(AREA_ABSOLUTE_CAP, AREA_EPSILON * Math.max(1, hullArea));
    const coveredArea = unionArea(plane.polygons);
    if (Math.abs(coveredArea - hullArea) > epsilon) {
      const overlaps = plane.polygons.some((polygon, i) => plane.polygons.slice(i + 1).some(other => intersectionArea(polygon, other) > epsilon));
      reject(overlaps ? 'surface_overlap' : 'surface_hole', `The surface union leaves ${hullArea - coveredArea} square LDU uncovered (numeric tolerance ${epsilon}); overlaps cannot hide gaps.`);
    }
    return {normal: plane.normal, vertices: hull.map(p => p[2])};
  });
}

// Repository access is injected so adversarial fixtures exercise exactly the
// same parser, recursion and geometry proof as the real compressed library.
// resolve(name) -> canonical key; read(key) -> UTF-8 text; both are synchronous.
export function createVariantProver(repository, options = {}) {
  const parsed = new Map();
  const recordCache = new Map();
  const signatures = new Map();
  const limits = {...LIMITS, ...options.limits};
  function read(key, state) {
    if (!recordCache.has(key)) {
      const content = repository.read(key);
      if (typeof content !== 'string') reject('missing_geometry', `Missing geometry: ${key}`);
      const digest = hash(content);
      if (parsed.has(key) && parsed.get(key).hash !== digest) reject('geometry_changed', 'Geometry changed while proofs were being compiled.');
      recordCache.set(key, parseLDraw(content, key));
      parsed.set(key, {hash: digest});
      if (recordCache.size > 512) recordCache.delete(recordCache.keys().next().value);
    }
    const records = recordCache.get(key);
    recordCache.delete(key); recordCache.set(key, records);
    state.files.add(key);
    if (state.files.size > limits.files) reject('complexity_limit', 'Too many referenced geometry files.');
    return records;
  }
  function resolve(name) {
    const key = repository.resolve(normalizeReference(name));
    if (typeof key !== 'string') reject('missing_geometry', `Unknown geometry reference: ${name}`);
    return key;
  }
  function state() { return {files: new Set(), records: 0}; }
  function walk(key, placement, visit, current, stack = [], forbidden) {
    if (stack.includes(key)) reject('reference_cycle', `Cyclic geometry reference: ${key}`);
    if (stack.length >= limits.depth) reject('complexity_limit', 'Geometry reference depth exceeded.');
    if (key === forbidden) reject('duplicate_core', 'Decoration references the structural core again.');
    const next = [...stack, key];
    for (const record of read(key, current)) {
      if (++current.records > limits.records) reject('complexity_limit', 'Geometry record limit exceeded.');
      if (record.type === 1) walk(resolve(record.reference), compose(placement, record), visit, current, next, forbidden);
      else visit(record.vertices.map(v => transform(v, placement.matrix, placement.offset)), record.type);
    }
  }
  const identity = {matrix: IDENTITY, offset: ORIGIN};
  function prepareBase(id, profileEvidence = null) {
    const key = resolve(`${id}.dat`), current = state(), records = read(key, current);
    const refs = records.filter(r => r.type === 1), surfaceRecords = records.filter(r => r.type !== 1);
    if (refs.length !== 1 || !/^s\//.test(refs[0].reference) || !equal(refs[0].matrix, IDENTITY) || !equal(refs[0].offset, ORIGIN) || surfaceRecords.length < 1 || surfaceRecords.length > 2 || surfaceRecords.some(r => r.type !== 4)) {
      reject('invalid_base', `Base ${id} is not one identity structural core plus one or two quads.`);
    }
    const core = {key: resolve(refs[0].reference), matrix: refs[0].matrix, offset: refs[0].offset};
    const faces = surfaceRecords.map(r => convexFace(r.vertices));
    const signs = faces.map(() => new Set());
    walk(core.key, identity, vertices => {
      for (const point of vertices) for (let i = 0; i < faces.length; i++) {
        const distance = dot(faces[i].normal, sub(point, faces[i].vertices[0]));
        if (Math.abs(distance) > TOLERANCE) signs[i].add(Math.sign(distance));
      }
    }, current, [key]);
    if (signs.some(s => s.size !== 1)) reject('invalid_base', `Base ${id} has a surface that is not exterior to its core.`);
    return {id, key, core, faces, files: current.files, profileEvidence};
  }
  function proveVariant(id, base) {
    const key = resolve(`${id}.dat`), current = state();
    for (const file of base.files) read(file, current);
    const records = read(key, current);
    const coreMatches = records.filter(r => r.type === 1 && resolve(r.reference) === base.core.key);
    if (coreMatches.length !== 1) reject('core_mismatch', 'A variant must reference its reviewed core exactly once at the root.');
    const reference = coreMatches[0];
    if (!equal(reference.offset, base.core.offset) || !equal(reference.matrix, base.core.matrix)) reject('core_transform', 'The structural core transformation differs from the base.');
    let primitives = 0;
    const visit = vertices => {
      primitives++;
      if (!base.faces.some(face => vertices.every(v => insideFace(v, face)))) reject('off_surface', 'Decorative geometry leaves a reviewed convex exterior surface.');
    };
    for (const record of records) {
      if (++current.records > limits.records) reject('complexity_limit', 'Geometry record limit exceeded.');
      if (record === reference) continue;
      if (record.type === 1) walk(resolve(record.reference), record, visit, current, [key], base.core.key);
      else visit(record.vertices);
    }
    if (primitives === 0) reject('empty_decoration', 'The variant contains no exterior surface geometry.');
    const evidence = {
      proof: PROOF_VERSION, tolerance: TOLERANCE,
      base: {id: base.id, key: base.key, core: base.core, faces: base.faces.map(f => f.vertices), profile: base.profileEvidence},
      variant: {id, key},
      files: [...current.files].sort().map(file => ({key: file, sha256: parsed.get(file).hash})),
    };
    return {base: base.id, evidence: hash(JSON.stringify(evidence))};
  }

  function splitCore(key, coreKey, current, placement = identity, stack = [], output = {cores: [], mesh: []}) {
    if (stack.includes(key)) reject('reference_cycle', `Cyclic geometry reference: ${key}`);
    if (stack.length >= limits.depth) reject('complexity_limit', 'Geometry reference depth exceeded.');
    if (key === coreKey) { output.cores.push({key, ...placement}); return output; }
    for (const record of read(key, current)) {
      if (++current.records > limits.records) reject('complexity_limit', 'Geometry record limit exceeded.');
      if (record.type === 1) splitCore(resolve(record.reference), coreKey, current, compose(placement, record), [...stack, key], output);
      else output.mesh.push({type: record.type, vertices: record.vertices.map(v => transform(v, placement.matrix, placement.offset))});
    }
    return output;
  }
  // This entry point requires an explicitly reviewed structural core. It can be
  // nested (98138s02 is the body underneath the top rim), but it cannot be moved,
  // scaled, substituted or duplicated. All other physical surfaces are derived
  // from the base's actual faceted mesh, never a bounding box or ideal cylinder.
  function prepareSurfaceBase(id, coreReference, profileEvidence = null) {
    const key = resolve(`${id}.dat`), coreKey = resolve(coreReference), current = state();
    const split = splitCore(key, coreKey, current);
    if (split.cores.length !== 1 || !equal(split.cores[0].matrix, IDENTITY) || !equal(split.cores[0].offset, ORIGIN)) reject('invalid_base', 'Reviewed surface base needs exactly one identity core.');
    walk(coreKey, identity, () => {}, current, [key]);
    return {id, key, core: split.cores[0], faces: surfaceFaces(split.mesh), files: current.files, profileEvidence};
  }
  function proveSurfaceVariant(id, base) {
    const key = resolve(`${id}.dat`), current = state();
    for (const file of base.files) read(file, current);
    const split = splitCore(key, base.core.key, current);
    if (split.cores.length !== 1) reject('core_mismatch', 'Variant must preserve the structural core exactly once.');
    if (!equal(split.cores[0].matrix, base.core.matrix) || !equal(split.cores[0].offset, base.core.offset)) reject('core_transform', 'The structural core transformation differs from the base.');
    if (!split.mesh.some(p => p.type === 3 || p.type === 4)) reject('empty_decoration', 'No replacement surface polygons.');
    for (const primitive of split.mesh) {
      if (!base.faces.some(face => primitive.vertices.every(v => insideFace(v, face)))) reject('off_surface', 'Decoration leaves the original faceted surface.');
    }
    const evidence = {
      proof: SURFACE_PROOF_VERSION, tolerance: TOLERANCE, areaEpsilon: AREA_EPSILON, areaAbsoluteCap: AREA_ABSOLUTE_CAP,
      base: {id: base.id, key: base.key, core: base.core, faces: base.faces.map(f => f.vertices), profile: base.profileEvidence},
      variant: {id, key}, files: [...current.files].sort().map(file => ({key: file, sha256: parsed.get(file).hash})),
    };
    return {base: base.id, evidence: hash(JSON.stringify(evidence))};
  }

  function canonicalPolygon(vertices) {
    // Preserve cyclic polygon adjacency. Sorting quad vertices independently
    // would incorrectly equate a valid polygon and a crossed or concave one.
    const encodings = [];
    for (const direction of [vertices, [...vertices].reverse()]) for (let i = 0; i < vertices.length; i++) {
      encodings.push(JSON.stringify([...direction.slice(i), ...direction.slice(0, i)]));
    }
    return encodings.sort()[0];
  }
  function signature(key, current, stack = []) {
    if (stack.includes(key)) reject('reference_cycle', `Cyclic geometry reference: ${key}`);
    if (stack.length >= limits.depth) reject('complexity_limit', 'Geometry reference depth exceeded.');
    const cached = signatures.get(key);
    if (cached) {
      if (stack.length + cached.depth > limits.depth) reject('complexity_limit', 'Geometry reference depth exceeded.');
      for (const file of cached.files) current.files.add(file);
      if (current.files.size > limits.files) reject('complexity_limit', 'Too many referenced geometry files.');
      current.records += cached.records;
      if (current.records > limits.records) reject('complexity_limit', 'Geometry record limit exceeded.');
      return cached;
    }
    const records = read(key, current), nodes = [], files = new Set([key]);
    let work = records.length, depth = 1, solids = 0;
    current.records += records.length;
    if (current.records > limits.records) reject('complexity_limit', 'Geometry record limit exceeded.');
    for (const record of records) {
      if (record.type === 1) {
        const child = signature(resolve(record.reference), current, [...stack, key]);
        work += child.records; depth = Math.max(depth, child.depth + 1); solids += child.solids;
        for (const file of child.files) files.add(file);
        if (child.solids) nodes.push({type: 1, matrix: record.matrix, offset: record.offset, signature: child.signature});
      } else if (record.type === 3 || record.type === 4) {
        nodes.push({type: record.type, vertices: canonicalPolygon(record.vertices)}); solids++;
      }
    }
    // Ignoring colour and edge lines retains all surface polygons and their
    // transforms. Identity wrapper files do not change a part's geometry.
    const only = nodes[0];
    const value = nodes.length === 1 && only.type === 1 && equal(only.matrix, IDENTITY) && equal(only.offset, ORIGIN)
      ? only.signature : hash(nodes.map(n => JSON.stringify(n)).sort().join('\n'));
    const result = {signature: value, files, records: work, depth, solids};
    signatures.set(key, result);
    return result;
  }
  function prepareExactBase(id, profileEvidence = null) {
    const key = resolve(`${id}.dat`), current = state(), result = signature(key, current);
    if (!result.solids) reject('empty_geometry', 'Exact equivalence requires surface geometry.');
    return {id, key, signature: result.signature, files: current.files, profileEvidence};
  }
  function proveExactVariant(id, base) {
    const key = resolve(`${id}.dat`), current = state(), result = signature(key, current);
    if (!result.solids || result.signature !== base.signature) reject('geometry_mismatch', 'Surface geometry differs from the reviewed base.');
    for (const file of base.files) read(file, current);
    const evidence = {
      proof: EXACT_PROOF_VERSION,
      base: {id: base.id, key: base.key, signature: base.signature, profile: base.profileEvidence},
      variant: {id, key}, files: [...current.files].sort().map(file => ({key: file, sha256: parsed.get(file).hash})),
    };
    return {base: base.id, evidence: hash(JSON.stringify(evidence))};
  }
  return {prepareBase, proveVariant, prepareSurfaceBase, proveSurfaceVariant, prepareExactBase, proveExactVariant};
}
