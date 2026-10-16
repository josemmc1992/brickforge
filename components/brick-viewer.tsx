'use client';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {LDrawLoader} from 'three/addons/loaders/LDrawLoader.js';
import {LDrawConditionalLineMaterial} from 'three/addons/materials/LDrawConditionalLineMaterial.js';
import {loadGeometry} from '@/lib/geometry';
import type {Piece} from '@/lib/model';
type Props={pieces:Piece[];selected:string|null;onSelect:(id:string|null)=>void;visibleStep:number;fitSignal:number};
export default function BrickViewer({pieces,selected,onSelect,visibleStep,fitSignal}:Props){
 const host=useRef<HTMLDivElement>(null),runtime=useRef<any>(null),onPick=useRef(onSelect);onPick.current=onSelect;
 const [loading,setLoading]=useState(0),[errors,setErrors]=useState<string[]>([]),[retry,setRetry]=useState(0);
 useEffect(()=>{
  if(!host.current)return;const mount=host.current;let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});}catch{setErrors(['WebGL no está disponible en este navegador.']);return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#edf1ef');renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;mount.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,1,20000);camera.position.set(570,420,650);const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,130,0);controls.enableDamping=true;controls.minDistance=40;controls.maxDistance=3000;
  scene.add(new THREE.HemisphereLight(0xffffff,0x89908b,2.6));const sun=new THREE.DirectionalLight(0xffffff,3.3);sun.position.set(-250,600,350);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-500;sun.shadow.camera.right=500;sun.shadow.camera.top=500;sun.shadow.camera.bottom=-500;sun.shadow.bias=-.0001;scene.add(sun);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(4000,4000),new THREE.MeshStandardMaterial({color:'#e3e9e5',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.8;floor.receiveShadow=true;scene.add(floor);scene.add(new THREE.GridHelper(1200,60,0xb7c6c0,0xd2dcd7));
  const group=new THREE.Group();scene.add(group);const box=new THREE.BoxHelper(new THREE.Object3D(),0x069d7a);box.visible=false;scene.add(box);
  const loader=new LDrawLoader();loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);// Three 0.180.0 adapter: keep parsing/caching, replace only file transport.
  const cache=(loader as any).partsCache?.parseCache;if(!cache||typeof cache.fetchData!=='function')throw new Error('Incompatible LDrawLoader');cache.fetchData=loadGeometry;const ready=loader.preloadMaterials('/catalog/LDConfig.ldr');
  const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();let start=[0,0];const down=(e:PointerEvent)=>{start=[e.clientX,e.clientY]};const up=(e:PointerEvent)=>{if(Math.hypot(e.clientX-start[0],e.clientY-start[1])>4)return;const rect=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(mouse,camera);const hit=ray.intersectObjects(group.children,true).find(h=>{let o:THREE.Object3D|null=h.object;while(o&&o!==group){if(!o.visible)return false;o=o.parent;}return true;});let obj=hit?.object;while(obj&&!obj.userData.pieceId)obj=obj.parent||undefined;onPick.current(obj?.userData.pieceId||null);};
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);
  const resize=new ResizeObserver(()=>{const {width,height}=mount.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();});resize.observe(mount);
  const fit=()=>{const bounds=new THREE.Box3().setFromObject(group);if(bounds.isEmpty())return;const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());const distance=Math.max(size.x,size.y,size.z,100)*2.3;controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(distance*.8,distance*.55,distance));controls.update();};
  runtime.current={scene,group,camera,controls,box,loader,ready,cache:new Map(),objects:new Map(),fit,disposed:false};
  let frame=0;const tick=()=>{controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(tick);};tick();
  return()=>{runtime.current.disposed=true;cancelAnimationFrame(frame);resize.disconnect();controls.dispose();const geometries=new Set<any>(),materials=new Set<any>();scene.traverse((o:any)=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach((m:any)=>materials.add(m));});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();mount.removeChild(renderer.domElement);};
 },[retry]);
 useEffect(()=>{const r=runtime.current;if(!r)return;let cancelled=false;setErrors([]);
  const ids=new Set(pieces.map(p=>p.id));for(const [id,obj] of r.objects){if(!ids.has(id)){r.group.remove(obj);r.objects.delete(id);}}
  let pending=pieces.filter(p=>r.objects.get(p.id)?.userData.key!==p.part+':'+p.color).length;setLoading(pending);
  async function renderPiece(p:Piece){const key=p.part+':'+p.color;let obj=r.objects.get(p.id);if(obj?.userData.key!==key){if(obj){r.group.remove(obj);r.objects.delete(p.id);}try{await r.ready;if(!r.cache.has(key)){const text=`0 FILE brickforge-part.ldr\n1 ${p.color} 0 0 0 1 0 0 0 1 0 0 0 1 ${p.part}.dat\n`;r.cache.set(key,new Promise((res,rej)=>r.loader.parse(text,res,rej)));}const template=await r.cache.get(key);if(cancelled||r.disposed)return;obj=new THREE.Group();const mesh=template.clone(true);mesh.scale.y=-1;mesh.traverse((c:any)=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;}});obj.add(mesh);obj.userData={pieceId:p.id,key};r.objects.set(p.id,obj);r.group.add(obj);}catch{r.cache.delete(key);if(!cancelled)setErrors(old=>[...new Set([...old,p.part])]);}finally{if(!cancelled)setLoading(--pending);}}
   if(obj){obj.position.set(...p.position);obj.rotation.set(...p.rotation.map(v=>THREE.MathUtils.degToRad(v)) as [number,number,number]);obj.visible=p.step<=visibleStep;}}
  // Bound concurrent part loads to avoid flooding the geometry source.
  let index=0;Promise.all(Array.from({length:4},async()=>{while(index<pieces.length){const p=pieces[index++];await renderPiece(p);if(cancelled)return;}})).then(()=>{if(!cancelled&&r.objects.size&&r.firstFit!==true){r.firstFit=true;r.fit();}});
  return()=>{cancelled=true;};
 },[pieces,retry]);
 useEffect(()=>{const r=runtime.current;if(!r)return;for(const p of pieces){const obj=r.objects.get(p.id);if(obj)obj.visible=p.step<=visibleStep;}const chosen=r.objects.get(selected);r.box.visible=Boolean(chosen&&chosen.visible);if(chosen)r.box.setFromObject(chosen);},[selected,visibleStep,pieces,loading]);
 useEffect(()=>{runtime.current?.fit();},[fitSignal]);
 return <div className="scene-host" ref={host}>{loading>0&&<div className="viewer-message">Cargando geometrías · {loading}</div>}{errors.length>0&&<div className="viewer-message warning">No se pudieron cargar: {errors.slice(0,5).join(', ')}. <button onClick={()=>setRetry(v=>v+1)}>Reintentar carga</button></div>}</div>;
}
