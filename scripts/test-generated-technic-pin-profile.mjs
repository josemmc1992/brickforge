import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createPackedGeometryRepository,createEnvelopeCompiler} from './lib/ldraw-envelope.mjs';
import {createTechnicPinChannelCompiler} from './lib/technic-pin-channel.mjs';
import {buildGeneratedTechnicPinProfile} from './lib/generated-technic-pin-profile.mjs';
import {buildGeneratedProfile} from './lib/generated-profile.mjs';
import {createAxialEnvelopeCompiler} from './lib/axial-envelope.mjs';
import {buildGeneratedAxialProfile} from './lib/generated-axial-profile.mjs';
import {createKeyedAxialEnvelopeCompiler} from './lib/keyed-axial-channel.mjs';
import {buildGeneratedKeyedAxialProfile} from './lib/generated-keyed-axial-profile.mjs';
import {buildGeneratedAccessProfile} from './lib/generated-access-profile.mjs';
const root=path.resolve(import.meta.dirname,'..'),repo=createPackedGeometryRepository(root),gc=createEnvelopeCompiler(repo),channelCompiler=createTechnicPinChannelCompiler(repo),axialCompiler=createAxialEnvelopeCompiler(repo),keyedCompiler=createKeyedAxialEnvelopeCompiler(repo),json=f=>JSON.parse(fs.readFileSync(path.join(root,f))),shadow=json('lib/shadow-catalog.json'),collision=json('lib/collision-manifest.json'),packs=new Map(),inputs=new Map();
function args(id){
 if(inputs.has(id))return inputs.get(id);
 const e=shadow.parts[id];if(!packs.has(e.pack))packs.set(e.pack,JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'public/catalog/shadow/'+e.pack+'.bin')))));
 const metadata=packs.get(e.pack)[id],geometry=gc.geometry(id),entry=collision.parts[id],envelope=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'public/catalog/collision/'+entry.asset+'.bin')))),socketClearance=request=>gc.socketClearance(id,request);
 // Rebuild the pre-pin profile from source, not from an already enhanced v5 asset.
 let baseline=buildGeneratedProfile({metadata,envelope,socketClearance});
 if(!baseline.supported)baseline=buildGeneratedAxialProfile({partId:id,metadata,envelope,geometry,axialCompiler,poseContract:'r4-through-sliding-v2'});
 if(!baseline.supported)baseline=buildGeneratedKeyedAxialProfile({partId:id,metadata,geometry,repository:repo,keyedCompiler});
 if(!baseline.supported)baseline=buildGeneratedAccessProfile({metadata,envelope,geometry,expectedSourceHash:entry.sourceHash,socketClearance});
 const input={metadata,geometry,expectedSourceHash:entry.sourceHash,baseProfile:baseline.supported?baseline.profile:null,channelCompiler,repository:repo};inputs.set(id,input);return input;
}
const profiles={},counts=[];let negatives=0;
for(const id of ['3673','3700','3701','32523','43857','32000','32524','32316','32034','41239']){
 const input=args(id),original=input.baseProfile?JSON.stringify(input.baseProfile):null,r=buildGeneratedTechnicPinProfile(input);assert.equal(r.supported,true,id+': '+JSON.stringify(r));assert.equal(r.profile.version,5);assert.equal(r.profile.source,'ldraw-technic-pin-envelope-v1');assert.ok(r.profile.solids.length<=129);assert.ok(r.profile.connectors.some(c=>c.kind==='pin'||c.kind==='pin-hole'));
 assert.ok((input.baseProfile?.connectors??[]).every(c=>r.profile.connectors.some(n=>n.id===c.id)));assert.equal(input.baseProfile?JSON.stringify(input.baseProfile):null,original,'Enhancement must not mutate its baseline profile');
 assert.equal(buildGeneratedTechnicPinProfile({...input,expectedSourceHash:'0'.repeat(64)}).supported,false);assert.equal(buildGeneratedTechnicPinProfile({...input,metadata:{...input.metadata,coverage:'partial'}}).supported,false);negatives+=2;
 profiles[id]=r.profile;counts.push({id,previousPorts:input.baseProfile?.connectors.length??0,pinPorts:r.profile.connectors.filter(c=>c.kind==='pin'||c.kind==='pin-hole').length,solids:r.profile.solids.length});
}
assert.equal(profiles['3673'].connectors.filter(c=>c.kind==='pin').length,2);assert.ok(profiles['3673'].connectors.some(c=>c.id==='bar-socket:0:0:0:1:0:0'));
assert.ok(profiles['32523'].connectors.filter(c=>c.kind==='pin-hole').length>=2,'A multi-hole beam must remain useful beyond one connection');
const input=args('32523'),duplicated={...input,metadata:{...input.metadata,connectors:[...input.metadata.connectors,...input.metadata.connectors]}};assert.deepEqual(buildGeneratedTechnicPinProfile(duplicated).profile,profiles['32523'],'Repeated metadata must not duplicate occupancy of one physical hole');
const report={generatedTechnicPins:true,references:counts.length,negativeCases:negatives,preservedConnectorIds:true,counts};fs.mkdirSync(path.join(root,'.desktop-tests'),{recursive:true});fs.writeFileSync(path.join(root,'.desktop-tests/technic-pin-sample-profiles.json'),JSON.stringify(profiles)+'\n');console.log(JSON.stringify(report));
