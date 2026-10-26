import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deflateSync} from 'node:zlib';
import {CaptureBroker,CaptureError,captureOptions,validateCapturePng} from '../server/capture';
import {CAPTURE_MAX_PNG_BYTES,CAPTURE_VIEWS} from '../lib/capture';
import type {Model} from '../lib/model';

function crc32(bytes:Buffer){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=value&1?(value>>>1)^0xedb88320:value>>>1;}return (value^0xffffffff)>>>0;}
function chunk(type:string,data:Buffer){const kind=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([kind,data])));return Buffer.concat([length,kind,data,crc]);}
function png(width=256,height=256,channels=4,filter=0){
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=channels===4?6:2;
 const row=width*channels+1,pixels=Buffer.alloc(row*height,255);for(let y=0;y<height;y++)pixels[y*row]=filter;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
const model=():Model=>({id:'capture-fixture',name:'Fixture',revision:7,updatedAt:'2026-10-19T00:00:00Z',pieces:[{id:'one',part:'3001',color:4,position:[0,24,0],rotation:[0,0,0],step:1,group:'capture'}]});
const options=captureOptions({modelId:model().id,width:256,height:256});
const image=png().toString('base64');
let checks=0;
function fail(work:()=>unknown,message?:RegExp){assert.throws(work,message??CaptureError);checks++;}
async function reject(work:Promise<unknown>,message:RegExp){await assert.rejects(work,message);checks++;}
assert.deepEqual(captureOptions({modelId:'model'}),{modelId:'model',view:'isometric',width:1024,height:768});checks++;
for(const view of CAPTURE_VIEWS){assert.equal(captureOptions({modelId:'model',view}).view,view);checks++;}
for(const args of [null,[],{},'model',{modelId:''},{modelId:'a',arbitrary:true},{modelId:'a',view:null},{modelId:'a',view:'perspective'},{modelId:'a',width:255},{modelId:'a',height:1025},{modelId:'a',width:300.1},{modelId:'a',width:'256'},{modelId:'a',width:null},{modelId:'a',expectedRevision:0},{modelId:'a',expectedRevision:1.5},{modelId:'a',expectedRevision:null}])fail(()=>captureOptions(args));
assert.equal(validateCapturePng(image,256,256),image);checks++;
assert.equal(validateCapturePng(png(256,256,3).toString('base64'),256,256),png(256,256,3).toString('base64'));checks++;
const damaged=png();damaged[damaged.length-1]^=1;
for(const data of ['not base64',image+'\n','data:image/png;base64,'+image,damaged.toString('base64'),png().subarray(0,50).toString('base64'),Buffer.concat([png(),Buffer.from('extra')]).toString('base64'),png(257).toString('base64'),png(256,256,4,5).toString('base64'),Buffer.alloc(CAPTURE_MAX_PNG_BYTES+1).toString('base64')])fail(()=>validateCapturePng(data,256,256));

const broker=new CaptureBroker(':memory:',{pollMs:1});
try{
 fail(()=>broker.enqueue('',model(),options),/sesión/);
 fail(()=>broker.enqueue('alice',model(),{...options,expectedRevision:6}),/ha cambiado/);
 fail(()=>broker.enqueue('alice',{...model(),pieces:[]},options),/no contiene piezas/);
 const snapshot=model(),first=broker.enqueue('alice',snapshot,options);
 snapshot.pieces[0].color=14;snapshot.revision=8;
 assert.equal(broker.claim('bob'),null);checks++;
 const lease=broker.claim('alice');assert.ok(lease);checks++;
 assert.equal(lease.model.revision,7);assert.equal(lease.model.pieces[0].color,4);checks+=2;
 assert.equal(broker.claim('alice'),null);checks++;
 for(const input of [null,{},[],{id:first.id,leaseToken:lease.leaseToken,data:image,error:'both'},{id:first.id,leaseToken:lease.leaseToken,data:image,other:1},{id:first.id,leaseToken:lease.leaseToken,error:5},{id:first.id,leaseToken:lease.leaseToken,error:''},{id:first.id,leaseToken:lease.leaseToken,error:'x'.repeat(301)}])fail(()=>broker.complete('alice',input));
 fail(()=>broker.complete('bob',{id:first.id,leaseToken:lease.leaseToken,data:image}),/no existe/);
 fail(()=>broker.complete('alice',{id:first.id,leaseToken:'0'.repeat(64),data:image}),/no existe/);
 fail(()=>broker.complete('alice',{id:first.id,leaseToken:lease.leaseToken,data:'invalid'}),/PNG/);
 broker.complete('alice',{id:first.id,leaseToken:lease.leaseToken,data:image});
 fail(()=>broker.complete('alice',{id:first.id,leaseToken:lease.leaseToken,data:image}),/ya se ha entregado/);
 assert.equal(await broker.waitForResult(first.id,'alice'),image);checks++;
 await reject(broker.waitForResult(first.id,'alice'),/No se ha recibido/);
 const failed=broker.enqueue('alice',model(),options),failedLease=broker.claim('alice')!;
 broker.complete('alice',{id:failed.id,leaseToken:failedLease.leaseToken,error:'Geometría no disponible: 3001'});
 await reject(broker.waitForResult(failed.id,'alice'),/Geometría no disponible/);
 const pending=Array.from({length:4},()=>broker.enqueue('alice',model(),options));
 fail(()=>broker.enqueue('alice',model(),options),/cuatro capturas/);
 const other=broker.enqueue('bob',model(),options),controller=new AbortController();controller.abort();
 for(const job of pending)await reject(broker.waitForResult(job.id,'alice',controller.signal),/cancelada/);
 await reject(broker.waitForResult(other.id,'bob',controller.signal),/cancelada/);
 assert.equal(broker.claim('alice'),null);checks++;
 assert.equal(broker.claim('bob'),null);checks++;
}finally{broker.close();}

let clock=1000;
const expiring=new CaptureBroker(':memory:',{now:()=>clock,deadlineMs:30,pollMs:1});
try{
 const job=expiring.enqueue('alice',model(),options);clock+=31;
 assert.equal(expiring.claim('alice'),null);checks++;
 await reject(expiring.waitForResult(job.id,'alice'),/Abre Brickforge/);
 const leased=expiring.enqueue('alice',model(),options),lease=expiring.claim('alice')!;
 const result=expiring.waitForResult(leased.id,'alice');clock+=31;
 await reject(result,/ha agotado el plazo/);
 fail(()=>expiring.complete('alice',{id:lease.id,leaseToken:lease.leaseToken,data:image}),/ha caducado/);
}finally{expiring.close();}

const directory=mkdtempSync(join(tmpdir(),'brickforge-capture-broker-')),path=join(directory,'transient.sqlite');
const producer=new CaptureBroker(path,{pollMs:1}),renderer=new CaptureBroker(path,{pollMs:1});
try{
 const pending=producer.enqueue('alice',model(),options),lease=renderer.claim('alice');assert.ok(lease);checks++;
 assert.equal(producer.claim('alice'),null);checks++;
 renderer.complete('alice',{id:lease.id,leaseToken:lease.leaseToken,data:image});
 assert.equal(await producer.waitForResult(pending.id,'alice'),image);checks++;
 assert.equal(renderer.claim('alice'),null);checks++;
}finally{producer.close();renderer.close();rmSync(directory,{recursive:true,force:true});}
console.log(`Capture broker: ${checks} checks passed (input/PNG validation, snapshots, ownership, limits, leases, cancellation, expiry and shared SQLite).`);
