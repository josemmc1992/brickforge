'use client';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {LDrawLoader} from 'three/addons/loaders/LDrawLoader.js';
import {LDrawConditionalLineMaterial} from 'three/addons/materials/LDrawConditionalLineMaterial.js';
import {loadGeometry} from '@/lib/geometry';
import type {Piece} from '@/lib/model';
import {InstancedPieces,partKey} from './viewer-instances';

export type ViewerDiagnostics={scene:THREE.Scene;camera:THREE.PerspectiveCamera;renderer:THREE.WebGLRenderer;controls:OrbitControls;fit:()=>void;invalidate:()=>void;pick:(clientX:number,clientY:number)=>void;getStats:()=>{pending:number;pieceCount:number;visiblePieceCount:number;renderedFrames:number}};
type Props={pieces:Piece[];selected:string|null;onSelect:(id:string|null)=>void;visibleStep:number;fitSignal:number;onDiagnostics?:(diagnostics:ViewerDiagnostics)=>void};
type Runtime={instances:InstancedPieces;scene:THREE.Scene;camera:THREE.PerspectiveCamera;controls:OrbitControls;box:THREE.Box3Helper;loader:LDrawLoader;ready:Promise<void>;cache:Map<string,Promise<THREE.Group>>;fit:()=>void;invalidate:(shadows?:boolean)=>void;refreshSelection:()=>void;disposed:boolean;firstFit:boolean;pending:number;flush:number};

export default function BrickViewer({pieces,selected,onSelect,visibleStep,fitSignal,onDiagnostics}:Props){
 const host=useRef<HTMLDivElement>(null),runtime=useRef<Runtime|null>(null),latest=useRef({pieces,selected,onSelect,visibleStep,onDiagnostics});latest.current={pieces,selected,onSelect,visibleStep,onDiagnostics};
 const [loading,setLoading]=useState(0),[errors,setErrors]=useState<string[]>([]),[retry,setRetry]=useState(0);
 useEffect(()=>{
  if(!host.current)return;const mount=host.current;let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}catch{setErrors(['WebGL no está disponible en este navegador.']);return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#edf1ef');renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.outputColorSpace=THREE.SRGBColorSpace;mount.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,1,20000);scene.background=new THREE.Color('#edf1ef');camera.position.set(570,420,650);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,130,0);controls.enableDamping=true;controls.minDistance=40;controls.maxDistance=3000;
  scene.add(new THREE.HemisphereLight(0xffffff,0x89908b,2.6));const sun=new THREE.DirectionalLight(0xffffff,3.3);sun.position.set(-250,600,350);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-500;sun.shadow.camera.right=500;sun.shadow.camera.top=500;sun.shadow.camera.bottom=-500;sun.shadow.bias=-.0001;scene.add(sun);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(4000,4000),new THREE.MeshStandardMaterial({color:'#e3e9e5',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.8;floor.receiveShadow=true;scene.add(floor);const grid=new THREE.GridHelper(1200,60,0xb7c6c0,0xd2dcd7);scene.add(grid);
  const instances=new InstancedPieces();scene.add(instances.group);const box=new THREE.Box3Helper(new THREE.Box3(),0x069d7a);box.visible=false;scene.add(box);
  const loader=new LDrawLoader();loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
  // Three 0.180.0 adapter: retain parsing/caching, replace only file transport.
  const parseCache=(loader as unknown as {partsCache:{parseCache:{fetchData:typeof loadGeometry}}}).partsCache?.parseCache;
  if(!parseCache||typeof parseCache.fetchData!=='function')throw new Error('Incompatible LDrawLoader');parseCache.fetchData=loadGeometry;
  const ready=loader.preloadMaterials('/catalog/LDConfig.ldr');
  let frame=0,renderedFrames=0,disposed=false;
  const render=()=>{frame=0;if(disposed)return;controls.update();renderer.render(scene,camera);renderedFrames++;};
  // OrbitControls emits change during damping. Rendering stops once it settles.
  const invalidate=(shadows=false)=>{if(disposed)return;if(shadows)renderer.shadowMap.needsUpdate=true;if(!frame)frame=requestAnimationFrame(render);};
  const changed=()=>invalidate();controls.addEventListener('change',changed);
  const restored=()=>invalidate(true);renderer.domElement.addEventListener('webglcontextrestored',restored);
  const refreshSelection=()=>{const bounds=instances.selectedBounds(latest.current.selected);box.visible=Boolean(bounds);if(bounds)box.box.copy(bounds);};
  const fit=()=>{const bounds=instances.bounds();if(bounds.isEmpty())return;const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());const distance=Math.max(size.x,size.y,size.z,100)*2.3,offset=new THREE.Vector3(distance*.8,distance*.55,distance);controls.maxDistance=Math.max(controls.maxDistance,offset.length()*2);camera.far=Math.max(camera.far,controls.maxDistance+size.length());camera.updateProjectionMatrix();controls.target.copy(center);camera.position.copy(center).add(offset);controls.update();invalidate();};
  const r:Runtime={instances,scene,camera,controls,box,loader,ready,cache:new Map(),fit,invalidate,refreshSelection,disposed:false,firstFit:false,pending:0,flush:0};runtime.current=r;
  const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();let start=[0,0];
  const down=(event:PointerEvent)=>{start=[event.clientX,event.clientY];};
  const up=(event:PointerEvent)=>{if(Math.hypot(event.clientX-start[0],event.clientY-start[1])>4)return;const rect=renderer.domElement.getBoundingClientRect();mouse.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);camera.updateMatrixWorld();ray.setFromCamera(mouse,camera);latest.current.onSelect(instances.pick(ray));};
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);
  const resize=new ResizeObserver(()=>{const {width,height}=mount.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();invalidate();});resize.observe(mount);
  latest.current.onDiagnostics?.({scene,camera,renderer,controls,fit,invalidate,pick:(clientX,clientY)=>{const event=new PointerEvent('pointerup',{clientX,clientY});down(event);up(event);},getStats:()=>({pending:r.pending,pieceCount:instances.pieceCount,visiblePieceCount:instances.visiblePieceCount,renderedFrames})});
  invalidate(true);
  return()=>{
   disposed=true;r.disposed=true;cancelAnimationFrame(frame);cancelAnimationFrame(r.flush);resize.disconnect();controls.removeEventListener('change',changed);controls.dispose();renderer.domElement.removeEventListener('webglcontextrestored',restored);renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',up);instances.dispose();
   const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
   scene.traverse(child=>{const drawing=child as THREE.Mesh;if(drawing.geometry)geometries.add(drawing.geometry);if(drawing.material)(Array.isArray(drawing.material)?drawing.material:[drawing.material]).forEach(material=>materials.add(material));});
   for(const promise of r.cache.values())void promise.then(template=>{const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>();template.traverse(child=>{const drawing=child as THREE.Mesh;if(drawing.geometry)gs.add(drawing.geometry);if(drawing.material)(Array.isArray(drawing.material)?drawing.material:[drawing.material]).forEach(material=>ms.add(material));});gs.forEach(value=>value.dispose());ms.forEach(value=>value.dispose());}).catch(()=>{});
   geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());sun.shadow.dispose();renderer.dispose();mount.removeChild(renderer.domElement);if(runtime.current===r)runtime.current=null;
  };
 },[retry]);
 useEffect(()=>{
  const r=runtime.current;if(!r)return;let cancelled=false;setErrors([]);
  const missing=new Map<string,Piece>();let pending=0;
  for(const piece of pieces)if(!r.instances.hasTemplate(partKey(piece))){missing.set(partKey(piece),piece);pending++;}
  r.pending=pending;setLoading(pending);r.instances.setPieces(pieces,latest.current.visibleStep);r.refreshSelection();r.invalidate(true);
  const flush=()=>{r.flush=0;if(cancelled||r.disposed)return;r.instances.setPieces(pieces,latest.current.visibleStep);r.refreshSelection();setLoading(r.pending);r.invalidate(true);if(!r.pending&&!r.firstFit&&r.instances.pieceCount){r.firstFit=true;r.fit();}};
  const queueFlush=()=>{if(!r.flush)r.flush=requestAnimationFrame(flush);};
  const loads=[...missing.values()];const counts=new Map<string,number>();for(const piece of pieces){const key=partKey(piece);counts.set(key,(counts.get(key)||0)+1);}
  let index=0;
  void Promise.all(Array.from({length:Math.min(4,loads.length)},async()=>{
   while(index<loads.length){const piece=loads[index++],key=partKey(piece);try{
    await r.ready;if(cancelled||r.disposed)return;
    let promise=r.cache.get(key);if(!promise){const text=`0 FILE brickforge-part.ldr\n1 ${piece.color} 0 0 0 1 0 0 0 1 0 0 0 1 ${piece.part}.dat\n`;promise=new Promise<THREE.Group>((resolve,reject)=>r.loader.parse(text,resolve,reject));r.cache.set(key,promise);}
    const template=await promise;if(cancelled||r.disposed)return;r.instances.addTemplate(key,template);
   }catch{r.cache.delete(key);if(!cancelled&&!r.disposed)setErrors(old=>[...new Set([...old,piece.part])]);}
   finally{if(!cancelled&&!r.disposed){r.pending-=counts.get(key)||0;queueFlush();}}
   if(cancelled||r.disposed)return;
  }})).then(()=>{if(!cancelled&&!r.disposed)queueFlush();});
  return()=>{cancelled=true;cancelAnimationFrame(r.flush);r.flush=0;};
 },[pieces,retry]);
 useEffect(()=>{const r=runtime.current;if(!r)return;r.instances.setStep(visibleStep);r.refreshSelection();r.invalidate(true);},[visibleStep,retry]);
 useEffect(()=>{const r=runtime.current;if(!r)return;r.refreshSelection();r.invalidate();},[selected,retry]);
 useEffect(()=>{runtime.current?.fit();},[fitSignal]);
 return <div className="scene-host" ref={host}>{loading>0&&<div className="viewer-message">Cargando geometrías · {loading}</div>}{errors.length>0&&<div className="viewer-message warning">No se pudieron cargar: {errors.slice(0,5).join(', ')}. <button onClick={()=>setRetry(value=>value+1)}>Reintentar carga</button></div>}</div>;
}
