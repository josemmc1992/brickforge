import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {gunzipSync} from 'node:zlib';
import {createPackedGeometryRepository,createEnvelopeCompiler} from './lib/ldraw-envelope.mjs';
import {minifigHipRequest,certifyMinifigHips,createMinifigHipCompiler} from './lib/minifig-hips.mjs';
import {buildGeneratedMinifigHipProfile} from './lib/generated-minifig-hips-profile.mjs';
import {buildGeneratedProfile} from './lib/generated-profile.mjs';
import {buildGeneratedAccessProfile} from './lib/generated-access-profile.mjs';
import {createMinifigNeckCompiler} from './lib/minifig-neck.mjs';
import {buildGeneratedMinifigNeckProfile} from './lib/generated-minifig-neck-profile.mjs';
import {clipSurfacePolygon} from './lib/axial-envelope.mjs';
const root=path.resolve(import.meta.dirname,'..'),repo=createPackedGeometryRepository(root),gc=createEnvelopeCompiler(repo),hipCompiler=createMinifigHipCompiler(repo),neckCompiler=createMinifigNeckCompiler(repo),json=f=>JSON.parse(fs.readFileSync(path.join(root,f))),shadow=json('lib/shadow-catalog.json'),collision=json('lib/collision-manifest.json'),packs=new Map();
function metadata(id){const e=shadow.parts[id];if(!packs.has(e.pack))packs.set(e.pack,JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'public/catalog/shadow',e.pack+'.bin')))));return packs.get(e.pack)[id];}
function input(id){
 const m=metadata(id),e=collision.parts[id],geometry=gc.geometry(id),envelope=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'public/catalog/collision',e.asset+'.bin')))),socketClearance=r=>gc.socketClearance(id,r);
 let b=buildGeneratedProfile({metadata:m,envelope,socketClearance});
 if(!b.supported)b=buildGeneratedAccessProfile({metadata:m,envelope,geometry,expectedSourceHash:e.sourceHash,socketClearance});
 const neck=buildGeneratedMinifigNeckProfile({metadata:m,geometry,expectedSourceHash:e.sourceHash,baseProfile:b.supported?b.profile:null,neckCompiler});if(neck.supported)b=neck;
 return {metadata:m,geometry,expectedSourceHash:e.sourceHash,baseProfile:b.supported?b.profile:null,hipCompiler};
}
let negative=0;const samples={};
for(const id of ['3815b','3815bp04','41879a','67638','973','973p01','973p8b','973p8j']){
 const args=input(id),before=JSON.stringify(args.baseProfile),r=buildGeneratedMinifigHipProfile(args);assert.equal(r.supported,true,id+': '+JSON.stringify(r));assert.equal(r.profile.version,7);assert.deepEqual(buildGeneratedMinifigHipProfile(args),r);assert.equal(JSON.stringify(args.baseProfile),before);assert.ok((args.baseProfile?.connectors??[]).every(c=>r.profile.connectors.some(n=>JSON.stringify(n)===JSON.stringify(c))));assert.deepEqual(r.profile.neckEvidence,args.baseProfile?.neckEvidence);samples[id]=r.profile;
 for(const change of [{expectedSourceHash:'0'.repeat(64)},{metadata:{...args.metadata,coverage:'partial'}},{geometry:{...args.geometry,body:[...args.geometry.body,[[1,1,1],[2,1,1],[1,2,1]]]}},{geometry:{...args.geometry,body:[...args.geometry.body,[[1,-2,1],[2,-2,1],[1,-1,1]]]}}]){assert.equal(buildGeneratedMinifigHipProfile({...args,...change}).supported,false);negative++;}
}
const hips=gc.geometry('3815b'),torso=gc.geometry('973'),mc=metadata('3815b').connectors.filter(minifigHipRequest),fc=metadata('973').connectors.filter(minifigHipRequest);
assert.equal(buildGeneratedMinifigHipProfile(input('16709')).supported,false);negative++;
const reject=(g,c)=>{const r=certifyMinifigHips(g,c);assert.equal(r.status,'indeterminate',r.reason??'Unexpected certificate');negative++;};
// Intrusion at any point along exterior access, including a remote cap, fails.
for(const y of [-31,-33,-100])reject({...torso,body:[...torso.body,[[8,y,-1],[12,y,-1],[10,y,1]]]},fc);
reject({...torso,studs:[...torso.studs,{faces:[[[8,-30,-1],[12,-30,-1],[10,-30,1]]]}]},fc);
reject({...torso,body:[...torso.body,[[-1,-33,-1],[1,-33,-1],[0,-33,1]]]},fc);
for(const change of [p=>p[1]>0?[p[0]*1.01,p[1],p[2]]:p,p=>p[1]>0?[p[0],p[1]-1,p[2]]:p])reject({...hips,body:hips.body.map(f=>f.map(change))},mc);
// Removing a critical wall fails the equivalence proof, even if the void is empty.
const region=certifyMinifigHips(torso,fc).certificate.innerRegion;
const index=torso.body.findIndex(f=>{let p=f;for(const h of region)p=clipSurfacePolygon(p,h);if(p.length<3)return false;const a=p[1].map((n,i)=>n-p[0][i]),b=p[2].map((n,i)=>n-p[0][i]);return Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])>1e-8;});assert.ok(index>=0);reject({...torso,body:torso.body.filter((_,i)=>i!==index)},fc);
for(const c of [ {...mc[0],pos:[NaN,0,0]}, {...mc[0],frame:[1,0,0,0,-1,.1,0,0,1]}, {...mc[0],shape:{...mc[0].shape,slide:true}}, {...mc[0],shape:{...mc[0].shape,center:true}}, {...mc[0],shape:{...mc[0].shape,caps:'B'}}, {...mc[0],unsupportedFeatures:['unknown']}, {...fc[0],normal:[0,1,0]}, {...fc[0],shape:{...fc[0].shape,sections:[{shape:'R',radius:6,length:12}]}}]){assert.equal(minifigHipRequest(c),null);negative++;}
for(const c of [mc.slice(0,1),[mc[0],mc[0]],[mc[0],fc[0]],[...mc,mc[0]]])reject(hips,c);
for(const id of ['973','3815b']){const key=repo.resolve(id+'.dat'),changed={resolve:name=>repo.resolve(name),read:k=>repo.read(k)+(k===key?'\n0 changed source\n':'')};assert.throws(()=>createMinifigHipCompiler(changed),/Reviewed minifig hip\/waist source changed/);negative++;}
fs.mkdirSync(path.join(root,'.desktop-tests'),{recursive:true});fs.writeFileSync(path.join(root,'.desktop-tests/minifig-hips-samples.json'),JSON.stringify(samples)+'\n');console.log(JSON.stringify({minifigHipGeometry:true,realReferences:Object.keys(samples).length,negativeCases:negative,sourceEquivalenceAndEmptyPrisms:true,inheritedConnectorsPreserved:true}));
