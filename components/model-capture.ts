import * as THREE from 'three';
import {LDrawLoader} from 'three/addons/loaders/LDrawLoader.js';
import {LDrawConditionalLineMaterial} from 'three/addons/materials/LDrawConditionalLineMaterial.js';
import {loadGeometry} from '@/lib/geometry';
import {CAPTURE_MAX_PNG_BYTES} from '@/lib/capture';
import type {CaptureJob, CaptureView} from '@/lib/capture';

// This adapter is deliberately tied to the pinned Three 0.180.0 loader, like the editor.
type LoaderInternals = {
  partsCache: {
    parseCache: {fetchData: (file: string) => Promise<string>};
    loadModel: (file: string) => Promise<THREE.Group>;
  };
  edgeMaterialCache: WeakMap<THREE.Material, THREE.Material>;
  conditionalEdgeMaterialCache: WeakMap<THREE.Material, THREE.Material>;
  missingColorMaterial: THREE.Material;
  missingEdgeColorMaterial: THREE.Material;
  missingConditionalEdgeColorMaterial: THREE.Material;
};

const directions: Record<CaptureView, [number, number, number]> = {
  isometric: [.8, .55, 1], front: [0, 0, 1], back: [0, 0, -1],
  left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0],
};
let rendering = false;

function cancelled(signal: AbortSignal) {
  if (signal.aborted) throw new Error('La captura se ha cancelado o ha agotado su plazo.');
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error('La captura se ha cancelado o ha agotado su plazo.'));
    signal.addEventListener('abort', abort, {once: true});
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}

function fittedCamera(bounds: THREE.Box3, view: CaptureView, width: number, height: number) {
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(bounds.getSize(new THREE.Vector3()).length(), 1);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, radius * 10);
  if (view === 'top') camera.up.set(0, 0, -1);
  camera.position.copy(center).addScaledVector(new THREE.Vector3(...directions[view]).normalize(), radius * 3);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  const projected = new THREE.Box3();
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
      }
    }
  }
  const size = projected.getSize(new THREE.Vector3());
  const aspect = width / height;
  const halfHeight = Math.max(size.y / 2, size.x / (2 * aspect), .5) * 1.15;
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
  return {camera, center, radius};
}

/** Render only the saved snapshot, on a detached canvas; never read the visible editor or desktop. */
export async function renderModelCapture(job: CaptureJob, signal: AbortSignal): Promise<string> {
  cancelled(signal);
  if (rendering) throw new Error('Ya hay una captura en curso en este editor.');
  if (!job.model.pieces.length) throw new Error('El modelo no contiene piezas que capturar.');
  rendering = true;
  const cancellation = new AbortController();
  signal = AbortSignal.any([signal, cancellation.signal]);
  const check = () => {
    cancelled(signal);
    if (Date.now() >= job.expiresAt) throw new Error('La captura ha agotado su plazo.');
  };
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  scene.add(group);
  const loader = new LDrawLoader();
  loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
  const internals = loader as unknown as LoaderInternals;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const failures = new Set<string>();
  let renderer: THREE.WebGLRenderer | undefined;
  let disposed = false;

  const disposeMaterial = (material?: THREE.Material) => {
    if (!material || materials.has(material)) return;
    materials.add(material);
    material.dispose();
  };
  const disposeObject = (object: THREE.Object3D) => {
    object.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry && !geometries.has(mesh.geometry)) {
        geometries.add(mesh.geometry);
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) disposeMaterial(material);
      }
    });
  };
  const disposeLoaderMaterials = () => {
    for (const material of loader.materials) {
      disposeMaterial(material);
      const edge = internals.edgeMaterialCache.get(material);
      disposeMaterial(edge);
      if (edge) disposeMaterial(internals.conditionalEdgeMaterialCache.get(edge));
    }
    disposeMaterial(internals.missingColorMaterial);
    disposeMaterial(internals.missingEdgeColorMaterial);
    disposeMaterial(internals.missingConditionalEdgeColorMaterial);
  };
  const templates = new Map<string, Promise<THREE.Group>>();
  const loadedObjects = new Set<THREE.Object3D>();
  const track = (object: THREE.Group) => {
    if (disposed) disposeObject(object);
    else loadedObjects.add(object);
    return object;
  };

  try {
    if (!internals.partsCache?.parseCache || typeof internals.partsCache.loadModel !== 'function') {
      throw new Error('El cargador LDraw no es compatible con las capturas.');
    }
    internals.partsCache.parseCache.fetchData = async file => {
      try {
        check();
        const text = await loadGeometry(file);
        check();
        return text;
      } catch (error) {
        failures.add(file);
        throw error;
      }
    };
    // LDraw swallows some nested-part errors. Record them so a partial model is never returned.
    const loadModel = internals.partsCache.loadModel.bind(internals.partsCache);
    internals.partsCache.loadModel = async file => {
      try { return track(await loadModel(file)); }
      catch (error) { failures.add(file); throw error; }
    };
    const ready = loader.preloadMaterials('/catalog/LDConfig.ldr').then(() => {
      if (disposed) disposeLoaderMaterials();
    });
    await abortable(ready, signal);

    let nextPiece = 0;
    const workers = Array.from({length: Math.min(4, job.model.pieces.length)}, async () => {
      while (nextPiece < job.model.pieces.length) {
        check();
        const piece = job.model.pieces[nextPiece++];
        const key = `${piece.part}:${piece.color}`;
        if (!templates.has(key)) {
          const text = `0 FILE brickforge-capture.ldr\n1 ${piece.color} 0 0 0 1 0 0 0 1 0 0 0 1 ${piece.part}.dat\n`;
          templates.set(key, new Promise<THREE.Group>((resolve, reject) => loader.parse(text, resolve, reject)).then(track));
        }
        const template = await templates.get(key)!;
        check();
        if (disposed) return;
        const object = new THREE.Group();
        const mesh = template.clone(true);
        mesh.scale.y = -1;
        mesh.traverse(child => {
          if ((child as THREE.Mesh).isMesh) { child.castShadow = true; child.receiveShadow = true; }
        });
        object.add(mesh);
        object.position.set(...piece.position);
        object.rotation.set(...piece.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]);
        group.add(object);
      }
    });
    await abortable(Promise.all(workers), signal);
    if (failures.size) throw new Error(`No se pudo cargar toda la geometría: ${[...failures].slice(0, 4).join(', ')}.`);
    if (group.children.length !== job.model.pieces.length) throw new Error('La captura está incompleta; no se enviará una imagen parcial.');
    const bounds = new THREE.Box3().setFromObject(group, true);
    if (bounds.isEmpty()) throw new Error('El modelo no tiene geometría visible que capturar.');
    const {camera, center, radius} = fittedCamera(bounds, job.view, job.width, job.height);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x89908b, 2.6));
    const sun = new THREE.DirectionalLight(0xffffff, 3.3);
    sun.position.copy(center).addScaledVector(new THREE.Vector3(-250, 600, 350).normalize(), radius * 3);
    sun.target.position.copy(center);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {left: -radius, right: radius, top: radius, bottom: -radius, near: .01, far: radius * 8});
    sun.shadow.bias = -.0001;
    scene.add(sun, sun.target);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(radius * 8, radius * 8), new THREE.MeshStandardMaterial({color: '#e3e9e5', roughness: 1}));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(center.x, bounds.min.y - .8, center.z);
    floor.receiveShadow = true;
    scene.add(floor);

    check();
    try { renderer = new THREE.WebGLRenderer({antialias: true, alpha: false, preserveDrawingBuffer: true}); }
    catch { throw new Error('WebGL no está disponible para capturar el modelo.'); }
    renderer.setPixelRatio(1);
    renderer.setSize(job.width, job.height, false);
    renderer.setClearColor('#edf1ef');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.render(scene, camera); // Explicit render also works when the desktop window is minimized.
    if (renderer.getContext().isContextLost()) throw new Error('Se perdió el contexto gráfico durante la captura.');
    check();
    const url = renderer.domElement.toDataURL('image/png');
    if (!url.startsWith('data:image/png;base64,')) throw new Error('No se pudo codificar la captura como PNG.');
    const data = url.slice('data:image/png;base64,'.length);
    const bytes = data.length * 3 / 4 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
    if (bytes > CAPTURE_MAX_PNG_BYTES) throw new Error('La captura supera 1 MiB. Solicita una imagen de menor resolución.');
    check();
    return data;
  } catch (error) {
    if (signal.aborted) throw new Error('La captura se ha cancelado o ha agotado su plazo.');
    if (failures.size) throw new Error(`No se pudo cargar toda la geometría: ${[...failures].slice(0, 4).join(', ')}.`);
    throw error;
  } finally {
    cancellation.abort();
    disposed = true;
    disposeObject(scene);
    for (const object of loadedObjects) disposeObject(object);
    loadedObjects.clear();
    disposeLoaderMaterials();
    // dispose() does not free the shadow render targets owned by lights.
    scene.traverse(object => { if (object instanceof THREE.DirectionalLight) object.shadow.dispose(); });
    renderer?.dispose();
    renderer?.forceContextLoss();
    scene.clear();
    templates.clear();
    rendering = false;
  }
}
