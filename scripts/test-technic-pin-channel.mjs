import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createPackedGeometryRepository,createEnvelopeCompiler} from './lib/ldraw-envelope.mjs';
import {reviewedR4Section} from './lib/axial-envelope.mjs';
import {certifyTechnicPinChannel,centeredTechnicPinHoleRequest} from './lib/technic-pin-channel.mjs';
const root=path.resolve(import.meta.dirname,'..'),repo=createPackedGeometryRepository(root),gc=createEnvelopeCompiler(repo),section=reviewedR4Section(repo),shadow=JSON.parse(fs.readFileSync(path.join(root,'lib/shadow-catalog.json'))),packs=new Map();
const clone=structuredClone;let real=0,negatives=0;
function connector(id){const e=shadow.parts[id];if(!packs.has(e.pack))packs.set(e.pack,JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'public/catalog/shadow/'+e.pack+'.bin')))));return packs.get(e.pack)[id].connectors.find(c=>centeredTechnicPinHoleRequest(c));}
function reject(source,c,s=section){const result=certifyTechnicPinChannel(source,c,s);assert.equal(result.status,'indeterminate',JSON.stringify(result));negatives++;return result;}
for(const id of ['3700','3701','32523','43857','32000','32524','32316','41239']){
 const c=connector(id),source=gc.geometry(id),proof=certifyTechnicPinChannel(source,c,section);assert.equal(proof.status,'certified',id+': '+JSON.stringify(proof));assert.equal(proof.port.kind,'pin-hole');assert.equal(proof.port.pin.contract,'technic-pin-20-fixed-v1');assert.equal(proof.certificate.bands.length,3);assert.equal(proof.certificate.bands.flatMap(b=>b.surfaceSupport.patches).length,48);assert.ok(proof.asset.solids.length<=129);assert.equal(proof.sourceHash,source.sourceHash);assert.deepEqual(certifyTechnicPinChannel(source,c,section),proof);real++;
 const m=c.frame,world=([x,y,z])=>[0,1,2].map(i=>c.pos[i]+m[i*3]*x+m[i*3+1]*y+m[i*3+2]*z);
 for(const y of [0,9,-9,25,-25]){const cap=[[-9,y,-9],[9,y,-9],[9,y,9],[-9,y,9]].map(world);reject({...source,body:[...source.body,cap]},c);}
 reject({...source,studs:[...source.studs,{faces:[[[-1,0,-1],[1,0,-1],[0,0,1]].map(world)]}]},c);
}
const source=gc.geometry('3700'),c=connector('3700');
for(const bad of [null,{},[],{...source,sourceHash:'bad'},{...source,body:[null]},{...source,body:[[[NaN,0,0],[0,1,0],[0,0,1]]]},{...source,studs:[{faces:null}]},{...source,studs:[{faces:[[[0,0,0],[1,0,0]]]}]}])reject(bad,c);
for(const bad of [null,{},[],{...c,normal:[0,0,0]},{...c,pos:[Infinity,0,0]},{...c,frame:[1,1e-9,0,0,1,0,0,0,1]},{...c,frame:[1,0,0,1,0,0,0,0,1]},{...c,scale:'YOnly'},{...c,unsupportedFeatures:['uninterpreted']},{...c,shape:{...c.shape,caps:'A'}},{...c,shape:{...c.shape,center:false}},{...c,shape:{...c.shape,group:'unimplemented'}},{...c,shape:{...c.shape,sections:[{shape:'R',radius:6,length:20}]}}])reject(source,bad);
for(const bad of [null,{}, {...section,sourceHash:'0'.repeat(64)},{...section,polygon:section.polygon.map(p=>p.map(n=>n*1.01))},{...section,polygon:Array(16).fill(section.polygon[0])}])reject(source,c,bad);
// Removing the source walls of one outer recess cannot pass using only the
// still-continuous R6 shaft wall and nominal metadata.
const axis=[c.frame[1],c.frame[4],c.frame[7]],height=p=>p.reduce((s,n,i)=>s+(n-c.pos[i])*axis[i],0),missing={...source,body:source.body.filter(f=>{const mean=f.reduce((s,p)=>s+height(p)/f.length,0);return mean<=8||mean>=10;})};
assert.equal(reject(missing,c).reason,'pin_wall_surface_gap');
console.log(JSON.stringify({technicPinChannel:true,realReferences:real,negativeCases:negatives,wholeRecessSurfacesRequired:true,allPassed:true}));
