import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPackedGeometryRepository,createEnvelopeCompiler} from './lib/ldraw-envelope.mjs';
import {certifyWholeR4Shaft,centeredR4Port} from './lib/axial-shaft.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),compiler=createEnvelopeCompiler(createPackedGeometryRepository(root));
const meta=length=>({type:'cylinder',gender:'M',pos:[0,-length/2,0],normal:[0,-1,0],unsupportedFeatures:[],shape:{caps:'none',center:true,slide:true,group:'',sections:[{shape:'R',radius:4,length}]}});
for(const [id,length] of [['30374',80],['87994',60]]){
 const source=compiler.geometry(id),result=certifyWholeR4Shaft(source,meta(length));
 assert.equal(result.status,'certified',id+': '+result.reason);
 assert.equal(result.port.axial.length,length);assert.equal(result.port.axial.section.length,16);
 const missing=structuredClone(source);missing.body.splice(missing.body.findIndex(f=>f.length===4),1);
 assert.notEqual(certifyWholeR4Shaft(missing,meta(length)).status,'certified','a missing wall is not supplied by metadata');
 const missingCap=structuredClone(source);missingCap.body.splice(missingCap.body.findIndex(f=>f.length===3),1);
 assert.notEqual(certifyWholeR4Shaft(missingCap,meta(length)).status,'certified','missing caps are not invented');
 const crossed=structuredClone(source);crossed.body=crossed.body.map(f=>f.length===4?[f[0],f[2],f[1],f[3]]:f);
 assert.notEqual(certifyWholeR4Shaft(crossed,meta(length)).status,'certified','a crossed quad has the right vertices but does not cover the shaft wall');
 const bump=structuredClone(source);bump.body.push([[4,0,0],[5,0,0],[4,-1,0]]);
 assert.notEqual(certifyWholeR4Shaft(bump,meta(length)).status,'certified','protrusions are not removed');
 assert.notEqual(certifyWholeR4Shaft(source,meta(length-1)).status,'certified','wrong metadata length does not change geometry');
 const floating=meta(length);floating.pos[1]-=2;
 assert.notEqual(certifyWholeR4Shaft(source,floating).status,'certified','offset metadata cannot create a floating shaft');
 const transverse=meta(length);transverse.normal=[1,0,0];
 assert.notEqual(certifyWholeR4Shaft(source,transverse).status,'certified','a wrong axis cannot certify a shaft');
}
for(const malformed of [
 {...meta(80),gender:'F'},
 {...meta(80),unsupportedFeatures:['unknown']},
 {...meta(80),shape:{...meta(80).shape,center:false}},
 {...meta(80),shape:{...meta(80).shape,caps:'B'}},
 {...meta(80),shape:{...meta(80).shape,group:'pin'}},
])assert.notEqual(certifyWholeR4Shaft(compiler.geometry('30374'),malformed).status,'certified');
assert.equal(centeredR4Port({...meta(80),normal:[0,2,0]}),null);
for(const radius of [NaN,undefined,'4']){
 const invalid=meta(80);invalid.shape.sections[0].radius=radius;
 assert.equal(centeredR4Port(invalid),null,'radius must be a finite number');
}
console.log('PASS: exact source R4 shafts 30374/87994, closed surface proof, missing walls/caps, protrusions, offset/axis/length errors and unsupported metadata.');
