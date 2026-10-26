import assert from 'node:assert/strict';
import {R4_SECTION} from './lib/axial-shaft.mjs';
import {buildGeneratedAxialProfile} from './lib/generated-axial-profile.mjs';

const connector={type:'cylinder',gender:'F',pos:[0,0,0],normal:[1,0,0],unsupportedFeatures:[],shape:{caps:'none',center:true,slide:true,group:'',sections:[{shape:'R',radius:4,length:40}]}};
// Isolate the adapter: source geometry certification is exercised separately.
const build=(polygon,{source=connector,...options}={})=>buildGeneratedAxialProfile({partId:'fixture',metadata:{coverage:'complete',connectors:[source]},axialCompiler:{compile:()=>({status:'certified',version:'fixture-proof',sourceHash:'fixture',certificate:{section:{polygon}},asset:{solids:[{vertices:[],normals:[],edges:[]}]}})},...options});
assert.equal(build(R4_SECTION).supported,true);
assert.equal(build([...R4_SECTION].reverse()).supported,true,'source frame winding is normalized');
assert.equal(build(R4_SECTION.map(p=>p.map(n=>n*.999))).supported,true,'source rounding fits the existing collision allowance');
const narrow=build(R4_SECTION.map(p=>p.map(n=>n*.98)));
assert.equal(narrow.supported,false,'a certified empty hole is not necessarily a usable R4 socket');
assert.equal(narrow.rejected.axial_channel_does_not_fit_supported_shaft,1);
assert.equal(build(R4_SECTION.map((p,i)=>i===0?[NaN,0]:p)).supported,false,'malformed sections cannot become runtime profiles');
const original=structuredClone(connector),legacy=build(R4_SECTION);
assert.equal(legacy.profile.connectors[0].axial.contract,'r4-through-centered-fixed-v1');
assert.equal(Object.hasOwn(legacy.profile.connectors[0].axial,'slide'),false,'legacy callers never opt into sliding implicitly');
assert.deepEqual(build(R4_SECTION,{poseContract:'r4-through-centered-fixed-v1'}),legacy,'explicit legacy contract preserves the complete profile');
for(const slide of [true,false]){
 const source={...connector,shape:{...connector.shape,slide}};
 const result=build(R4_SECTION,{source,poseContract:'r4-through-sliding-v2'});
 assert.equal(result.supported,true);
 assert.equal(result.profile.connectors[0].axial.contract,'r4-through-sliding-v2');
 assert.equal(result.profile.connectors[0].axial.slide,slide,'source boolean must survive unchanged');
 assert.deepEqual(result.profile.solids,legacy.profile.solids,'pose semantics cannot change conservative geometry');
 assert.deepEqual(result.profile.axialEvidence,legacy.profile.axialEvidence,'pose semantics cannot change source hashes or proof');
 assert.deepEqual(result.profile.connectors[0].axial.section,legacy.profile.connectors[0].axial.section);
}
for(const slide of [undefined,null,0,1,'true','false',{},[]]){
 const source={...connector,shape:{...connector.shape,slide}};
 const result=build(R4_SECTION,{source,poseContract:'r4-through-sliding-v2'});
 assert.equal(result.supported,false,'v2 requires a real metadata boolean: '+JSON.stringify(slide));
 assert.equal(result.rejected.axial_slide_metadata_invalid,1);
 assert.deepEqual(build(R4_SECTION,{source}),legacy,'legacy geometry-only fixtures keep fixed semantics');
}
for(const poseContract of [null,false,'','r4-through-sliding-v3']){
 const result=build(R4_SECTION,{poseContract});
 assert.equal(result.supported,false);
 assert.equal(result.reason,'axial_pose_contract_unsupported');
}
assert.deepEqual(connector,original,'the adapter never mutates source metadata');
console.log('PASS generated axial adapter: source-fit checks, legacy default, opt-in v2 booleans, unchanged source evidence and rejection of malformed contracts/flags.');
