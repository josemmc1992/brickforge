import * as THREE from 'three';
import type {Piece} from '@/lib/model';

type Drawing=THREE.Mesh|THREE.LineSegments;
type PartTemplate={drawings:Drawing[];bounds:THREE.Box3;transparent:boolean};
type Placement={piece:Piece;matrix:THREE.Matrix4;bounds:THREE.Box3;template:PartTemplate};
type Chunk={objects:Drawing[];matrices:THREE.InstancedBufferAttribute};
const CHUNK_SIZE=512;
const unitScale=new THREE.Vector3(1,1,1);
export const partKey=(piece:Piece)=>`${piece.part}:${piece.color}`;

// Bake LDraw's coordinate conversion once per template. Instance transforms stay
// right-handed, which Three requires for InstancedMesh normal/front-face handling.
function bakeGeometry(source:THREE.BufferGeometry,matrix:THREE.Matrix4,mesh:boolean){
 const geometry=source.clone();geometry.applyMatrix4(matrix);
 for(const name of ['control0','control1']){const attribute=geometry.getAttribute(name);if(attribute)new THREE.BufferAttribute(attribute.array,attribute.itemSize).applyMatrix4(matrix);}
 const direction=geometry.getAttribute('direction');
 if(direction){const linear=new THREE.Matrix3().setFromMatrix4(matrix);new THREE.BufferAttribute(direction.array,direction.itemSize).applyMatrix3(linear);}
 if(mesh&&matrix.determinant()<0){
  // Reversing indices also works for non-indexed multi-material meshes.
  const sourceIndex=geometry.getIndex();const indices=sourceIndex?Array.from(sourceIndex.array):Array.from({length:geometry.getAttribute('position').count},(_,i)=>i);
  for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  geometry.setIndex(indices);
 }
 geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

function instanceLineMaterial(source:THREE.Material){
 const material=source.clone();
 if((material as THREE.ShaderMaterial).isShaderMaterial){
  const shader=material as THREE.ShaderMaterial;
  // Conditional lines must project endpoints AND control points per instance.
  shader.vertexShader='attribute mat4 bfInstanceMatrix;\n'+shader.vertexShader.replaceAll('modelViewMatrix','bfModelViewMatrix').replace('void main() {','void main() {\nmat4 bfModelViewMatrix = modelViewMatrix * bfInstanceMatrix;');
 }else{
  material.onBeforeCompile=shader=>{shader.vertexShader='attribute mat4 bfInstanceMatrix;\n'+shader.vertexShader.replace('#include <project_vertex>','transformed = ( bfInstanceMatrix * vec4( transformed, 1.0 ) ).xyz;\n#include <project_vertex>');};
  material.customProgramCacheKey=()=> 'brickforge-instanced-lines-v1';
 }
 return material;
}

export class InstancedPieces{
 readonly group=new THREE.Group();
 private templates=new Map<string,PartTemplate>();
 private chunks=new Map<string,Chunk[]>();
 private placements=new Map<string,Placement>();
 private pieces:Piece[]=[];
 private step=Infinity;
 private quaternion=new THREE.Quaternion();
 private euler=new THREE.Euler();
 private position=new THREE.Vector3();
 private pickBounds=new THREE.Box3();
 private meshProxy=new THREE.Mesh();
 private lineProxy=new THREE.LineSegments();
 private materials=new Set<THREE.Material>();
 private geometries=new Set<THREE.BufferGeometry>();
 hasTemplate(key:string){return this.templates.has(key);}
 get visiblePieceCount(){let count=0;for(const value of this.placements.values())if(value.piece.step<=this.step)count++;return count;}
 get pieceCount(){return this.placements.size;}
 addTemplate(key:string,source:THREE.Group){
  if(this.templates.has(key))return;
  source.updateMatrixWorld(true);const drawings:Drawing[]=[],bounds=new THREE.Box3();let transparent=false;
  const reflection=new THREE.Matrix4().makeScale(1,-1,1);
  source.traverse(object=>{
   const drawing=object as Drawing;if(!(drawing as THREE.Mesh).isMesh&&!(drawing as THREE.LineSegments).isLineSegments)return;
   const mesh=Boolean((drawing as THREE.Mesh).isMesh),matrix=new THREE.Matrix4().multiplyMatrices(reflection,drawing.matrixWorld);
   const geometry=bakeGeometry(drawing.geometry,matrix,mesh);this.geometries.add(geometry);bounds.union(geometry.boundingBox!);
   const sourceMaterials=Array.isArray(drawing.material)?drawing.material:[drawing.material];
   const materials=sourceMaterials.map(value=>{const result=mesh?value.clone():instanceLineMaterial(value);this.materials.add(result);transparent ||=result.transparent;return result;});
   const material=Array.isArray(drawing.material)?materials:materials[0];
   drawings.push(mesh?new THREE.Mesh(geometry,material):new THREE.LineSegments(geometry,material));
  });
  this.templates.set(key,{drawings,bounds,transparent});
 }
 setPieces(pieces:Piece[],step:number){this.pieces=pieces;this.step=step;this.rebuild();}
 setStep(step:number){if(this.step===step)return;this.step=step;this.rebuild();}
 private createChunk(key:string,template:PartTemplate,capacity:number):Chunk{
  const matrices=new THREE.InstancedBufferAttribute(new Float32Array(capacity*16),16);matrices.setUsage(THREE.DynamicDrawUsage);
  const objects=template.drawings.map(source=>{
   let object:Drawing;
   if((source as THREE.Mesh).isMesh){const mesh=new THREE.InstancedMesh(source.geometry,source.material,capacity);mesh.instanceMatrix=matrices;mesh.castShadow=true;mesh.receiveShadow=true;object=mesh;}
   else{
    const geometry=new THREE.InstancedBufferGeometry();geometry.index=source.geometry.index?.clone()??null;geometry.groups=source.geometry.groups.map(value=>({...value}));
    // Each disposable geometry must own its attributes: Three removes their GPU
    // buffers when a chunk disappears, even if another geometry still uses them.
    for(const [name,attribute] of Object.entries(source.geometry.attributes))geometry.setAttribute(name,attribute.clone());
    geometry.setAttribute('bfInstanceMatrix',matrices);geometry.instanceCount=0;object=new THREE.LineSegments(geometry,source.material);
   }
   object.matrixAutoUpdate=false;object.userData.batchKey=key;this.group.add(object);return object;
  });
  return {objects,matrices};
 }
 private removeChunk(chunk:Chunk){for(const object of chunk.objects){this.group.remove(object);if((object as THREE.InstancedMesh).isInstancedMesh)(object as THREE.InstancedMesh).dispose();else object.geometry.dispose();}}
 private rebuild(){
  const groups=new Map<string,Placement[]>();this.placements.clear();
  for(const piece of this.pieces){
   const key=partKey(piece),template=this.templates.get(key);if(!template)continue;
   this.euler.set(...piece.rotation.map(THREE.MathUtils.degToRad) as [number,number,number]);this.quaternion.setFromEuler(this.euler);this.position.set(...piece.position);
   const matrix=new THREE.Matrix4().compose(this.position,this.quaternion,unitScale),bounds=template.bounds.clone().applyMatrix4(matrix),placement={piece,matrix,bounds,template};this.placements.set(piece.id,placement);
   if(piece.step>this.step)continue;let group=groups.get(key);if(!group){group=[];groups.set(key,group);}group.push(placement);
  }
  for(const [key,chunks] of this.chunks){if(!groups.has(key)){for(const chunk of chunks)this.removeChunk(chunk);this.chunks.delete(key);}}
  for(const [key,placements] of groups){
   const template=this.templates.get(key)!;
   // Separate transparent pieces retain Three's object-level depth sorting.
   const capacity=template.transparent?1:CHUNK_SIZE,needed=Math.ceil(placements.length/capacity),chunks=this.chunks.get(key)||[];
   while(chunks.length>needed)this.removeChunk(chunks.pop()!);
   while(chunks.length<needed)chunks.push(this.createChunk(key,template,capacity));
   for(let i=0;i<chunks.length;i++){
    const chunk=chunks[i],start=i*capacity,count=Math.min(capacity,placements.length-start),bounds=new THREE.Box3();
    for(let j=0;j<count;j++){const placement=placements[start+j];placement.matrix.toArray(chunk.matrices.array,j*16);bounds.union(placement.bounds);}
    chunk.matrices.needsUpdate=true;const sphere=bounds.getBoundingSphere(new THREE.Sphere());
    for(const object of chunk.objects){
     if((object as THREE.InstancedMesh).isInstancedMesh){const mesh=object as THREE.InstancedMesh;mesh.count=count;mesh.boundingBox=bounds;mesh.boundingSphere=sphere;}
     else{const geometry=object.geometry as THREE.InstancedBufferGeometry;geometry.instanceCount=count;geometry.boundingBox=bounds;geometry.boundingSphere=sphere;}
    }
   }
   this.chunks.set(key,chunks);
  }
 }
 bounds(visibleOnly=false){const result=new THREE.Box3();for(const placement of this.placements.values())if(!visibleOnly||placement.piece.step<=this.step)result.union(placement.bounds);return result;}
 selectedBounds(id:string|null){const placement=id?this.placements.get(id):null;return placement&&placement.piece.step<=this.step?placement.bounds:null;}
 pick(raycaster:THREE.Raycaster){
  let nearest=Infinity,id:string|null=null;
  for(const placement of this.placements.values()){
   if(placement.piece.step>this.step||!raycaster.ray.intersectsBox(this.pickBounds.copy(placement.bounds).expandByScalar(raycaster.params.Line?.threshold??1)))continue;
   for(const drawing of placement.template.drawings){
    const proxy=(drawing as THREE.Mesh).isMesh?this.meshProxy:this.lineProxy;proxy.geometry=drawing.geometry;proxy.material=drawing.material;proxy.matrixWorld.copy(placement.matrix);
    const hits:THREE.Intersection[]=[];proxy.raycast(raycaster,hits);
    for(const hit of hits)if(hit.distance<nearest){nearest=hit.distance;id=placement.piece.id;}
   }
  }
  return id;
 }
 dispose(){for(const chunks of this.chunks.values())for(const chunk of chunks)this.removeChunk(chunk);this.chunks.clear();this.geometries.forEach(value=>value.dispose());this.materials.forEach(value=>value.dispose());this.templates.clear();this.placements.clear();}
}
