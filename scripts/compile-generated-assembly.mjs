import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {createPackedGeometryRepository,createEnvelopeCompiler} from './lib/ldraw-envelope.mjs';
import {buildGeneratedProfile} from './lib/generated-profile.mjs';
import {createAxialEnvelopeCompiler} from './lib/axial-envelope.mjs';
import {buildGeneratedAxialProfile} from './lib/generated-axial-profile.mjs';
import {createKeyedAxialEnvelopeCompiler} from './lib/keyed-axial-channel.mjs';
import {buildGeneratedKeyedAxialProfile} from './lib/generated-keyed-axial-profile.mjs';
import {buildGeneratedAccessProfile} from './lib/generated-access-profile.mjs';
import {createTechnicPinChannelCompiler,centeredTechnicPinHoleRequest} from './lib/technic-pin-channel.mjs';
import {buildGeneratedTechnicPinProfile} from './lib/generated-technic-pin-profile.mjs';
import {REVIEWED_TECHNIC_PIN} from './lib/technic-pin-shaft.mjs';

import {createMinifigNeckCompiler,minifigNeckRequest} from './lib/minifig-neck.mjs';
import {buildGeneratedMinifigNeckProfile} from './lib/generated-minifig-neck-profile.mjs';
import {createMinifigHipCompiler,minifigHipRequest} from './lib/minifig-hips.mjs';
import {buildGeneratedMinifigHipProfile} from './lib/generated-minifig-hips-profile.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),out=path.join(root,'lib/generated-assembly.json'),assetDir=path.join(root,'public/catalog/assembly');
const read=file=>fs.readFileSync(path.join(root,file));
const json=file=>JSON.parse(read(file));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const catalog=json('lib/catalog-data.json'),shadow=json('lib/shadow-catalog.json'),collision=json('lib/collision-manifest.json'),variants=json('lib/assembly-variants.json');
const inputs=['scripts/compile-generated-assembly.mjs','scripts/lib/generated-profile.mjs','scripts/lib/generated-axial-profile.mjs','scripts/lib/axial-envelope.mjs','scripts/lib/axial-shaft.mjs','scripts/lib/ldraw-envelope.mjs','scripts/lib/variant-proof.mjs','lib/axial-fit.ts','lib/catalog-data.json','lib/shadow-catalog.json','lib/collision-manifest.json','lib/assembly-variants.json','lib/base-profiles.ts'];
inputs.push('scripts/lib/keyed-axial-channel.mjs','scripts/lib/keyed-axial-shaft.mjs','scripts/lib/generated-keyed-axial-profile.mjs','lib/keyed-axial-fit.ts');
inputs.push('scripts/lib/standard-access.mjs','scripts/lib/generated-access-profile.mjs');
inputs.push('scripts/lib/technic-pin-channel.mjs','scripts/lib/technic-pin-shaft.mjs','scripts/lib/faceted-wall-proof.mjs','scripts/lib/generated-technic-pin-profile.mjs','lib/technic-pin-fit.ts');
inputs.push('scripts/lib/minifig-neck.mjs','scripts/lib/generated-minifig-neck-profile.mjs','lib/minifig-neck-fit.ts');
inputs.push('scripts/lib/minifig-hips.mjs','scripts/lib/generated-minifig-hips-profile.mjs','lib/minifig-hips-fit.ts');
const digest=createHash('sha256');for(const file of inputs)digest.update(file+'\0').update(read(file)).update('\0');const inputDigest=digest.digest('hex');
const check=process.argv.includes('--check'),verify=process.argv.includes('--verify');
if(check&&!verify){
 const manifest=json('lib/generated-assembly.json');
 if(manifest.version!==1||manifest.inputDigest!==inputDigest)throw Error('Generated assembly catalogue is stale. Regenerate and review it.');
 const assets=new Map(Object.values(manifest.profiles).map(e=>[e.asset,e]));
 for(const [id,entry] of assets){
  if(!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid assembly asset hash');
  const bytes=read('public/catalog/assembly/'+id+'.bin');
  if(bytes.length!==entry.bytes||hash(bytes)!==id)throw Error('Assembly asset integrity failure: '+id);
  if(gunzipSync(bytes,{maxOutputLength:2*1024*1024}).length!==entry.expandedBytes)throw Error('Unexpected assembly asset size');
 }
 console.log('Generated assembly catalogue: '+Object.keys(manifest.profiles).length+' references / '+assets.size+' verified asset hashes.');
 process.exit(0);
}
const bundle=await build({entryPoints:[path.join(root,'lib/base-profiles.ts')],bundle:true,write:false,platform:'node',format:'esm',target:'node22'});
const {basePartIds}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const curated=new Set([...basePartIds,...Object.keys(variants.aliases)]),repository=createPackedGeometryRepository(root),compiler=createEnvelopeCompiler(repository),axialCompiler=createAxialEnvelopeCompiler(repository);
const keyedCompiler=createKeyedAxialEnvelopeCompiler(repository);
const pinCompiler=createTechnicPinChannelCompiler(repository);
const neckCompiler=createMinifigNeckCompiler(repository);
const hipCompiler=createMinifigHipCompiler(repository);
const packs=new Map();
function metadata(id){
 const entry=shadow.parts[id];if(!entry)return {coverage:'absent',connectors:[]};
 if(!packs.has(entry.pack)){
  const bytes=read('public/catalog/shadow/'+entry.pack+'.bin');
  if(hash(bytes)!==shadow.packs[entry.pack].sha256)throw Error('Shadow pack integrity failure');
  packs.set(entry.pack,JSON.parse(gunzipSync(bytes,{maxOutputLength:64*1024*1024})));
  if(packs.size>6)packs.delete(packs.keys().next().value);
 }
 return packs.get(entry.pack)[id];
}
function envelope(entry){
 if(!/^[a-f0-9]{64}$/.test(entry.asset))throw Error('Unsafe envelope hash');
 const data=gunzipSync(read('public/catalog/collision/'+entry.asset+'.bin'),{maxOutputLength:8*1024*1024});
 if(hash(data)!==entry.asset)throw Error('Envelope asset integrity failure');
 return JSON.parse(data);
}
if(!verify)fs.mkdirSync(assetDir,{recursive:true});
const profiles={},unavailable={},reasons={},families={},assets=new Set(),rejectedPorts={};let done=0;
const sample=process.argv.find(a=>a.startsWith('--sample='));
const selected=sample?catalog.filter(p=>sample.slice(9).split(',').includes(p.id)):[...catalog].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
for(const part of selected){
 if(curated.has(part.id)&&!sample){done++;continue;}
 const family=families[part.category]??={total:0,generated:0,unavailable:0};family.total++;
 let result;
 const e=collision.parts[part.id];
 if(e?.status!=='compiled')result={supported:false,reason:e?.reason||'missing_collision_envelope'};
 else if(shadow.parts[part.id]?.coverage!=='complete')result={supported:false,reason:shadow.parts[part.id]?.coverage==='partial'?'partial_connection_metadata':'missing_connection_metadata'};
 else {
  const meta=metadata(part.id),body=envelope(e);
  result=buildGeneratedProfile({metadata:meta,envelope:body,socketClearance:request=>compiler.socketClearance(part.id,request)});
  if(!result.supported&&result.reason==='no_verified_standard_connections'){
   const axial=buildGeneratedAxialProfile({partId:part.id,metadata:meta,envelope:body,geometry:compiler.geometry(part.id),axialCompiler,poseContract:'r4-through-sliding-v2'});
   if(axial.supported)result=axial;
   else for(const [reason,count] of Object.entries(axial.rejected||{}))result.rejected['axial:'+reason]=(result.rejected['axial:'+reason]||0)+count;
   if(!result.supported){
    const keyed=buildGeneratedKeyedAxialProfile({partId:part.id,metadata:meta,geometry:compiler.geometry(part.id),repository,keyedCompiler});
    if(keyed.supported)result=keyed;
    else for(const [reason,count] of Object.entries(keyed.rejected||{}))result.rejected['keyed:'+reason]=(result.rejected['keyed:'+reason]||0)+count;
   }
   if(!result.supported){
    const access=buildGeneratedAccessProfile({metadata:meta,envelope:body,geometry:compiler.geometry(part.id),expectedSourceHash:e.sourceHash,socketClearance:request=>compiler.socketClearance(part.id,request)});
    if(access.supported)result=access;
    else for(const [reason,count] of Object.entries(access.rejected||{}))result.rejected['access:'+reason]=(result.rejected['access:'+reason]||0)+count;
   }
  }
  if(e.sourceHash===REVIEWED_TECHNIC_PIN.sourceHash||meta.connectors.some(centeredTechnicPinHoleRequest)){
   const pin=buildGeneratedTechnicPinProfile({metadata:meta,geometry:compiler.geometry(part.id),expectedSourceHash:e.sourceHash,baseProfile:result.supported?result.profile:null,channelCompiler:pinCompiler,repository});
   const rejected={...(result.rejected||{})};for(const [reason,count] of Object.entries(pin.rejected||{}))rejected['pin:'+reason]=(rejected['pin:'+reason]||0)+count;
   if(pin.supported)result={...pin,rejected};else result={...result,rejected};
  }
  if(meta.connectors.some(minifigNeckRequest)){
   const neck=buildGeneratedMinifigNeckProfile({metadata:meta,geometry:compiler.geometry(part.id),expectedSourceHash:e.sourceHash,baseProfile:result.supported?result.profile:null,neckCompiler});
   const rejected={...(result.rejected||{})};for(const [reason,count] of Object.entries(neck.rejected||{}))rejected['neck:'+reason]=(rejected['neck:'+reason]||0)+count;
   if(neck.supported)result={...neck,rejected};else result={...result,rejected};
  }
  if(meta.connectors.some(minifigHipRequest)){
   const hip=buildGeneratedMinifigHipProfile({metadata:meta,geometry:compiler.geometry(part.id),expectedSourceHash:e.sourceHash,baseProfile:result.supported?result.profile:null,hipCompiler});
   const rejected={...(result.rejected||{})};for(const [reason,count] of Object.entries(hip.rejected||{}))rejected['hips:'+reason]=(rejected['hips:'+reason]||0)+count;
   if(hip.supported)result={...hip,rejected};else result={...result,rejected};
  }
 }
 if(sample){console.log(JSON.stringify({part:part.id,supported:result.supported,reason:result.reason,connectors:result.profile?.connectors,solids:result.profile?.solids.length,rejected:result.rejected}));continue;}
 for(const [reason,count] of Object.entries(result.rejected||{}))rejectedPorts[reason]=(rejectedPorts[reason]||0)+count;
 if(result.supported){
  const expanded=Buffer.from(JSON.stringify(result.profile)+'\n');
  if(expanded.length>2*1024*1024||result.profile.connectors.length>2000)result={supported:false,reason:'profile_complexity_limit'};
  else{
   const bytes=gzipSync(expanded,{level:9});bytes[9]=255;const asset=hash(bytes);
   if(!assets.has(asset)){
    const file=path.join(assetDir,asset+'.bin');
    if(verify){if(!fs.existsSync(file)||!fs.readFileSync(file).equals(bytes))throw Error('Recompiled assembly asset differs: '+part.id);}
    else fs.writeFileSync(file,bytes);
    assets.add(asset);
   }
   profiles[part.id]={asset,bytes:bytes.length,expandedBytes:expanded.length,connectorCount:result.profile.connectors.length,family:part.category,connectionFamily:result.profile.version>=5?result.profile.primaryConnectionFamily:result.profile.version===4?'stud-socket-access':result.profile.version===3?'axial-a6':result.profile.version===2?'axial-r4':'stud-socket',...(result.profile.version>=5?{connectionFamilies:result.profile.connectionFamilies}:{})};family.generated++;
  }
 }
 if(!result.supported){unavailable[part.id]=result.reason;reasons[result.reason]=(reasons[result.reason]||0)+1;family.unavailable++;}
 if(++done%1000===0)console.error(`Assembly compilation ${done}/${catalog.length}; ${Object.keys(profiles).length} new supported references.`);
}
if(sample)process.exit(0);
const ordered=o=>Object.fromEntries(Object.entries(o).sort(([a],[b])=>a<b?-1:a>b?1:0));
const byCategory={},baseIds=new Set(basePartIds);
for(const part of catalog){const row=byCategory[part.category]??={catalogCount:0,manualBaseCount:0,verifiedVariantCount:0,generatedCount:0,notBuildableCount:0};row.catalogCount++;if(baseIds.has(part.id))row.manualBaseCount++;else if(curated.has(part.id))row.verifiedVariantCount++;else if(profiles[part.id])row.generatedCount++;else row.notBuildableCount++;}
const manifest={version:1,inputDigest,source:{shadow:shadow.source,collisionCompiler:collision.compiler},policy:'Source-backed exterior stud/socket joins plus source-certified R4 through channels and complete shafts. Axial sliding requires the v2 contract and verified slide metadata; multiple receivers reserve non-overlapping shaft intervals. Other internal cavities, arbitrary pin joins and other joints remain unsupported.',profiles,unavailable,summary:{axialGeneratedPartCount:Object.values(profiles).filter(p=>p.connectionFamily==='axial-r4').length,generatedPartCount:Object.keys(profiles).length,uniqueAssets:assets.size,curatedPartCount:curated.size,totalSupported:curated.size+Object.keys(profiles).length,metadataReferences:shadow.summary.withMetadata,fullyParsedMetadataReferences:shadow.summary.complete,collisionEnvelopes:collision.counts.compiled,reasons:ordered(reasons),rejectedPorts:ordered(rejectedPorts),families:ordered(families),byCategory:ordered(byCategory)}};
manifest.policy+=' Keyed A6 joins use source-certified cross sections, complete beveled shafts and their shorter proven engagement intervals; each receiver reserves its entire interval.';
manifest.summary.keyedAxialGeneratedPartCount=Object.values(profiles).filter(p=>p.connectionFamily==='axial-a6').length;
manifest.policy+=' Standard access profiles remove only a source-certified empty outward column from the hull; verified active studs and all other separated features remain represented.';
manifest.summary.accessGeneratedPartCount=Object.values(profiles).filter(p=>p.connectionFamily==='stud-socket-access').length;
manifest.policy+=' Fixed 20-LDU Technic pin ends and stepped R8/R6/R8 holes require full-source void proofs and all 48 facet wall rectangles. Existing generated connectors retain their IDs when a pin hole is added. Only the reviewed frictionless whole pin is enabled; other pin shapes remain unsupported.';
manifest.summary.technicPinGeneratedPartCount=Object.values(profiles).filter(p=>p.connectionFamilies?.includes('technic-pin')).length;
manifest.summary.technicPinNewPartCount=Object.values(profiles).filter(p=>p.connectionFamily==='technic-pin').length;
manifest.summary.technicPinEnhancedPartCount=manifest.summary.technicPinGeneratedPartCount-manifest.summary.technicPinNewPartCount;
manifest.policy+=' Fixed minifig neck/head seating requires exact reviewed upper-neck geometry, source-preserving torso solids and a complete 16-facet head cavity with a full-source empty outward prism. Existing head connectors are preserved; arms and hips are not inferred.';
manifest.summary.minifigNeckGeneratedPartCount=Object.values(profiles).filter(p=>p.connectionFamilies?.includes('minifig-neck')).length;
manifest.summary.minifigNeckNewPartCount=Object.values(profiles).filter(p=>p.connectionFamily==='minifig-neck').length;
manifest.summary.minifigNeckEnhancedPartCount=manifest.summary.minifigNeckGeneratedPartCount-manifest.summary.minifigNeckNewPartCount;
manifest.policy+=' Paired minifig waist posts require exact reviewed upper geometry and torso interface, full-source empty outward prisms, fixed seating and aligned bevel headings. Existing foot and neck connectors are preserved. Arms and leg pivots remain separate mechanisms.';
manifest.summary.minifigHipGeneratedPartCount=Object.values(profiles).filter(p=>p.connectionFamilies?.includes('minifig-hips')).length;
manifest.summary.minifigHipNewPartCount=Object.values(profiles).filter(p=>p.connectionFamily==='minifig-hips').length;
manifest.summary.minifigHipEnhancedPartCount=manifest.summary.minifigHipGeneratedPartCount-manifest.summary.minifigHipNewPartCount;
const serialized=JSON.stringify(manifest)+'\n';
if(verify){if(fs.readFileSync(out,'utf8').replaceAll('\r\n','\n')!==serialized)throw Error('Generated assembly manifest differs on full recompilation');}
else{
 fs.writeFileSync(out,serialized);
 for(const file of fs.readdirSync(assetDir))if(/^[a-f0-9]{64}\.bin$/.test(file)&&!assets.has(file.slice(0,-4)))fs.unlinkSync(path.join(assetDir,file));
}
console.log(JSON.stringify(manifest.summary));
