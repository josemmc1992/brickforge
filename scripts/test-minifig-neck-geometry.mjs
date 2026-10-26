import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {gunzipSync} from 'node:zlib';
import {createPackedGeometryRepository,createEnvelopeCompiler} from './lib/ldraw-envelope.mjs';
import {reviewedR4Section} from './lib/axial-envelope.mjs';
import {minifigNeckRequest,certifyMinifigNeck,createMinifigNeckCompiler} from './lib/minifig-neck.mjs';
import {buildGeneratedMinifigNeckProfile} from './lib/generated-minifig-neck-profile.mjs';
import {buildGeneratedProfile} from './lib/generated-profile.mjs';
const root=path.resolve(import.meta.dirname,'..'),repo=createPackedGeometryRepository(root),gc=createEnvelopeCompiler(repo),section=reviewedR4Section(repo),neckCompiler=createMinifigNeckCompiler(repo),json=f=>JSON.parse(fs.readFileSync(path.join(root,f))),shadow=json('lib/shadow-catalog.json'),collision=json('lib/collision-manifest.json'),packs=new Map();
function metadata(id){const e=shadow.parts[id];if(!packs.has(e.pack))packs.set(e.pack,JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'public/catalog/shadow',e.pack+'.bin')))));return packs.get(e.pack)[id];}
function input(id){const m=metadata(id),e=collision.parts[id],envelope=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'public/catalog/collision',e.asset+'.bin')))),b=buildGeneratedProfile({metadata:m,envelope,socketClearance:r=>gc.socketClearance(id,r)});return {metadata:m,geometry:gc.geometry(id),expectedSourceHash:e.sourceHash,baseProfile:b.supported?b.profile:null,neckCompiler};}
let real=0,negative=0;const samples={};
for(const id of ['973','973p01','973p03','3626b','3626c','3626cpdgb','3144']){
 const args=input(id),before=JSON.stringify(args.baseProfile),r=buildGeneratedMinifigNeckProfile(args);assert.equal(r.supported,true,id+': '+JSON.stringify(r));assert.equal(r.profile.version,6);assert.deepEqual(buildGeneratedMinifigNeckProfile(args),r);assert.equal(JSON.stringify(args.baseProfile),before);assert.ok((args.baseProfile?.connectors??[]).every(c=>r.profile.connectors.some(n=>JSON.stringify(n)===JSON.stringify(c))));samples[id]=r.profile;real++;
 for(const change of [{expectedSourceHash:'0'.repeat(64)},{metadata:{...args.metadata,coverage:'partial'}},{geometry:{...args.geometry,body:[...args.geometry.body,[[1,1,1],[2,1,1],[1,2,1]]]}},{geometry:{...args.geometry,body:[...args.geometry.body,[[1,-2,1],[2,-2,1],[1,-1,1]]]}}]){assert.equal(buildGeneratedMinifigNeckProfile({...args,...change}).supported,false);negative++;}
}
const head=gc.geometry('3626b'),hc=metadata('3626b').connectors.find(minifigNeckRequest),torso=gc.geometry('973'),tc=metadata('973').connectors.find(minifigNeckRequest);
const reject=(g,c=hc,s=section)=>{const r=certifyMinifigNeck(g,c,s);assert.equal(r.status,'indeterminate',JSON.stringify(r));negative++;};
// Blocking caps, remote access obstruction and an interior separated feature
// must reject even when nominal metadata still reports the same socket.
for(const y of [-24,-15,-25,-100])reject({...head,body:[...head.body,[[-2,y,-2],[2,y,-2],[2,y,2],[-2,y,2]]]});
reject({...head,studs:[...head.studs,{faces:[[[-1,-10,-1],[1,-10,-1],[0,-10,1]]]}]});
const wallIndex=head.body.findIndex(f=>f.some(p=>Math.abs(p[0]-6)<1e-8&&p[1]===-24)&&f.some(p=>p[1]===-4));assert.ok(wallIndex>=0);reject({...head,body:head.body.filter((_,i)=>i!==wallIndex)});
reject(head,hc,{...section,sourceHash:'0'.repeat(64)});reject(head,hc,{...section,polygon:section.polygon.map(p=>p.map(n=>n*1.01))});
for(const c of [ {...hc,pos:[NaN,0,0]}, {...hc,frame:[1,0,0,0,-1,.1,0,0,1]}, {...hc,shape:{...hc.shape,caps:'none'}}, {...hc,shape:{...hc.shape,center:true}}, {...hc,shape:{...hc.shape,sections:[{shape:'R',radius:6,length:19}]}}, {...hc,unsupportedFeatures:['unknown']}, {...tc,shape:{...tc.shape,slide:'true'}}, {...tc,normal:[0,-1,0]}]){assert.equal(minifigNeckRequest(c),null);negative++;}
reject({...torso,body:torso.body.map(f=>f.map(p=>p[1]>0?[p[0]*1.01,p[1],p[2]]:p))},tc);
reject({...torso,body:[...torso.body,[[0,13,0],[1,13,0],[0,13,1]]]},tc);
reject({...torso,body:torso.body.map(f=>f.map(p=>p[1]>0?[p[0],p[1]-1,p[2]]:p))},tc);
const reviewedKey=repo.resolve('973.dat'),changed={resolve:name=>repo.resolve(name),read:key=>repo.read(key)+(key===reviewedKey?'\n0 changed source\n':'')};
assert.throws(()=>createMinifigNeckCompiler(changed),/Reviewed minifig neck source changed/);negative++;
fs.mkdirSync(path.join(root,'.desktop-tests'),{recursive:true});fs.writeFileSync(path.join(root,'.desktop-tests/minifig-neck-samples.json'),JSON.stringify(samples)+'\n');console.log(JSON.stringify({minifigNeckGeometry:true,realReferences:real,negativeCases:negative,fullWallAndSourceProof:true,inheritedConnectorsPreserved:true}));
