import {app,BrowserWindow,nativeImage} from 'electron';
import {createServer,request as nodeRequest} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import assert from 'node:assert/strict';

const argument=process.argv.find(value=>value.startsWith('--benchmark-config='));
if(!argument)throw Error('Only run through scripts/viewer-performance.mjs');
const config=JSON.parse(await readFile(argument.slice('--benchmark-config='.length),'utf8'));
const profile=resolve(config.output,'electron-profile');await mkdir(profile,{recursive:true});
app.setName('Brickforge viewer benchmark');app.setPath('userData',profile);
// Two comparison windows run sequentially; closing the first must not quit Electron.
app.on('window-all-closed',()=>{});
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('force-device-scale-factor','1');
async function run(){
await app.whenReady();
let window;
const server=createServer(async(req,res)=>{
  try{
    if(req.headers.host!==new URL(origin).host||(req.headers.origin&&req.headers.origin!==origin)){res.writeHead(403).end();return;}
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/'){
      const mode=new URL(req.url,'http://localhost').searchParams.get('mode');
      if(!config.modes.includes(mode)){res.writeHead(404).end();return;}
      res.setHeader('Content-Type','text/html');
      res.end(`<!doctype html><html><head><style>html,body,#root,.scene-host{width:100%;height:100%;margin:0;overflow:hidden}.scene-host{position:relative}.viewer-message{position:absolute;top:0;left:0;background:white;z-index:1}canvas{display:block}</style></head><body><div id="root"></div><script type="module" src="/${mode}.js"></script></body></html>`);return;
    }
    let path;
    if(config.modes.some(mode=>pathname===`/${mode}.js`)){path=resolve(config.output,pathname.slice(1));res.setHeader('Content-Type','text/javascript');}
    else if(pathname==='/installed-fixture.json'&&config.installedFixture){path=resolve(config.output,'installed-fixture.json');res.setHeader('Content-Type','application/json');}
    else if(pathname.startsWith('/catalog/')){
      const catalog=resolve(config.root,'public/catalog');path=resolve(config.root,'public',`.${pathname}`);
      if(!path.startsWith(catalog+sep))throw Error('Invalid fixture path');
    }else{res.writeHead(404).end();return;}
    res.end(await readFile(path));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const statusWithHeaders=headers=>new Promise((resolve,reject)=>{const request=nodeRequest(origin,{headers},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);request.end();});
assert.equal(await statusWithHeaders({Host:'untrusted.invalid'}),403,'The fixture server rejects DNS rebinding hosts');
assert.equal(await statusWithHeaders({Origin:'https://untrusted.invalid'}),403,'The fixture server rejects foreign origins');
const report={ok:false,viewport:{width:1200,height:800},frames:config.frames,baselineRef:config.baselineRef,electron:process.versions.electron,measurementNote:'Hidden Electron windows can throttle animation callbacks. Frame cadence is not application FPS. Compare CPU render-call cost and draw calls on identical geometry. The finish() sample is a CPU wall-clock measurement, not a GPU timer.',measureOnly:Boolean(config.measureOnly),gpuFeatures:app.getGPUFeatureStatus(),measurements:[],regressions:[],visualComparisons:[]};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const checkpoint=()=>writeFile(resolve(config.output,'result.json'),JSON.stringify(report,null,2)+'\n');
async function js(source){return window.webContents.executeJavaScript(source);}
async function ready(expected){
  let stable=0,last;
  for(let i=0;i<1800;i++){
    last=await js(`({count:window.viewerTest?.pieces?.length,ready:!!window.viewerTest?.diagnostics,loaders:[...document.querySelectorAll('.viewer-message')].map(e=>e.textContent)})`);
    if(last.loaders.some(message=>message.includes('No se pudieron')))throw Error(`Geometry load failed: ${JSON.stringify(last)}`);
    stable=last.count===expected&&last.ready&&!last.loaders.length?stable+1:0;
    if(stable===3){await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');return;}
    await delay(100);
  }
  throw Error(`Viewer load timed out: ${JSON.stringify(last)}`);
}
async function fit(){await js('window.viewerTest.fit();void 0');await delay(200);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');}
async function installProbe(){
  await js(`(()=>{
    const t=window.viewerTest,d=t.diagnostics,renderer=d.renderer;
    const original=renderer.render.bind(renderer);let count=0;
    t.probe={enabled:false,frames:[],count:()=>count};
    renderer.render=(...args)=>{
      const start=performance.now();original(...args);const submitted=performance.now();
      if(t.probe.enabled){renderer.getContext().finish();const finished=performance.now();t.probe.frames.push({start,submitMs:submitted-start,completeMs:finished-start,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,lines:renderer.info.render.lines});}
      count++;
    };
    const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
    t.gpu=debug?{vendor:gl.getParameter(debug.UNMASKED_VENDOR_WEBGL),renderer:gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)}:{renderer:gl.getParameter(gl.RENDERER)};
  })()`);
}
async function orbit(){
  return js(`(async()=>{
    const t=window.viewerTest,d=t.diagnostics,p=t.probe;
    const camera=d.camera,controls=d.controls,target=controls.target.clone();
    const offset=camera.position.clone().sub(target),radius=Math.hypot(offset.x,offset.z),angle=Math.atan2(offset.z,offset.x);
    const all=[],frames=${config.frames};p.frames=[];p.enabled=true;
    const start=performance.now();
    for(let i=0;i<frames;i++){
      await new Promise(requestAnimationFrame);
      const theta=angle+(i+1)*Math.PI/frames;
      camera.position.set(target.x+Math.cos(theta)*radius,target.y+offset.y,target.z+Math.sin(theta)*radius);
      controls.update();d.invalidate();
    }
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    p.enabled=false;
    const duration=performance.now()-start;
    const samples=p.frames.slice(1),sorted=values=>values.sort((a,b)=>a-b),median=values=>sorted(values)[Math.floor(values.length/2)]||0;
    const intervals=samples.slice(1).map((frame,i)=>frame.start-samples[i].start);
    return {durationMs:duration,measuredFrames:samples.length,medianFrameMs:median(intervals),medianSubmitMs:median(samples.map(f=>f.submitMs)),medianCompleteMs:median(samples.map(f=>f.completeMs)),medianDrawCalls:median(samples.map(f=>f.calls)),triangles:samples.at(-1)?.triangles,lines:samples.at(-1)?.lines,gpu:t.gpu,stats:d.getStats?.()};
  })()`);
}
async function regression(mode){
  await js('window.viewerTest.setPieces(window.viewerTest.regression);window.viewerTest.setStep(2);void 0');await ready(5);await fit();
  await js("window.viewerTest.select('red');void 0");await settled();
  const initial=await js(`(()=>{const d=viewerTest.diagnostics;const box=d.scene.children.find(o=>o.type==='BoxHelper'||o.type==='Box3Helper');return {visible:box?.visible,vertices:box?.box?[...box.box.min.toArray(),...box.box.max.toArray()]:box?Array.from(box.geometry.attributes.position.array):[],cameraFar:d.camera.far,maxDistance:d.controls.maxDistance}})()`);
  assert.equal(initial.visible,true,'Selected piece has a visible box');
  assert.ok(initial.vertices.length>0&&initial.vertices.every(Number.isFinite));
  await writeFile(resolve(config.output,`${mode}-regression.png`),(await window.webContents.capturePage()).toPNG());
  await js("window.viewerTest.select('blue');window.viewerTest.setStep(1);void 0");await delay(100);
  assert.equal(await js("viewerTest.diagnostics.scene.children.find(o=>o.type==='BoxHelper'||o.type==='Box3Helper')?.visible"),false,'Selection is hidden when its build step is hidden');
  await js("viewerTest.setStep(2);viewerTest.setPieces(viewerTest.regression.map(p=>p.id==='red'?{...p,color:2,position:[-200,50,0],rotation:[90,0,90]}:p));viewerTest.select('red');void 0");await ready(5);
  const changed=await js("(()=>{const box=viewerTest.diagnostics.scene.children.find(o=>o.type==='BoxHelper'||o.type==='Box3Helper');return box.box?[...box.box.min.toArray(),...box.box.max.toArray()]:Array.from(box.geometry.attributes.position.array)})()");
  assert.notDeepEqual(changed,initial.vertices,'Selection follows changed transforms and reloaded color');
  await js("viewerTest.setPieces(viewerTest.pieces.filter(p=>p.id!=='red'));void 0");await ready(4);
  assert.equal(await js("viewerTest.diagnostics.scene.children.find(o=>o.type==='BoxHelper'||o.type==='Box3Helper')?.visible"),false,'Removed selected piece does not leave stale box');
  // Exercise the actual DOM picking handler at the projected centre of the blue brick.
  await js("viewerTest.select(null);viewerTest.lastPick=null;viewerTest.fit();void 0");await delay(150);
  const point=await js(`(()=>{const d=viewerTest.diagnostics,canvas=document.querySelector('canvas'),rect=canvas.getBoundingClientRect();const p=d.controls.target.clone().set(0,12,0).project(d.camera);return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2}})()`);
  await js(`viewerTest.diagnostics.pick(${point.x},${point.y});void 0`);await delay(150);
  const pick=await js('viewerTest.lastPick');assert.equal(pick,'blue','Raycast returns the original piece id after rendering batches');
  report.regressions.push({mode,selection:true,stepVisibility:true,transformAndColorUpdate:true,removal:true,picking:true});
}
function pixelDifference(a,b){
  const aa=a.toBitmap(),bb=b.toBitmap();assert.equal(aa.length,bb.length);let changed=0;
  for(let i=0;i<aa.length;i+=4)if(Math.max(Math.abs(aa[i]-bb[i]),Math.abs(aa[i+1]-bb[i+1]),Math.abs(aa[i+2]-bb[i+2]))>8)changed++;
  return changed/(aa.length/4);
}
async function settled(){await delay(180);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');}
async function extendedRegression(mode){
  await js("viewerTest.select(null);viewerTest.setStep(2);viewerTest.setPieces(Array.from({length:768},(_,i)=>({id:'chunk-'+i,part:'3001',color:4,position:[i%32*90,24,Math.floor(i/32)*50],rotation:[0,0,0],step:i<128?1:2,group:'Chunk lifecycle'})));void 0");
  await ready(768);await fit();const full=await window.webContents.capturePage();
  await js('viewerTest.setStep(1);void 0');await settled();const hidden=await window.webContents.capturePage();
  assert.ok(pixelDifference(full,hidden)>.001,'Hiding pieces removes actual pixels');
  await js('viewerTest.setStep(2);void 0');await settled();const restored=await window.webContents.capturePage();
  const restoredDifference=pixelDifference(full,restored);assert.ok(restoredDifference<.001,`Recreated chunks preserve surfaces and lines (${restoredDifference})`);
  assert.equal(await js('viewerTest.diagnostics.renderer.getContext().getError()'),0,'Recreated batches do not leave WebGL errors');
  await js('viewerTest.setPieces(viewerTest.transparency);void 0');await ready(5);
  for(const [name,position]of [['front',[0,70,260]],['back',[0,70,-260]],['oblique',[160,110,180]]]){
    await js(`(()=>{const d=viewerTest.diagnostics;d.camera.position.set(...${JSON.stringify(position)});d.controls.target.set(0,12,-15);d.controls.update();d.invalidate()})()`);await settled();
    await writeFile(resolve(config.output,`${mode}-transparency-${name}.png`),(await window.webContents.capturePage()).toPNG());
  }
  await js("viewerTest.setPieces(viewerTest.transparency.filter(p=>p.id!=='glass-1'));void 0");await ready(4);
  assert.equal(await js('viewerTest.diagnostics.renderer.getContext().getError()'),0,'Removing one transparent object preserves remaining GPU buffers');
  await writeFile(resolve(config.output,`${mode}-transparency-removed.png`),(await window.webContents.capturePage()).toPNG());
  await js("viewerTest.setPieces([{id:'far',part:'3001',color:4,position:[100000,24,-100000],rotation:[0,90,0],step:1,group:'World bounds'}]);viewerTest.select('far');void 0");await ready(1);await fit();
  const far=await js("(()=>{const d=viewerTest.diagnostics,p=d.controls.target.clone().set(100000,12,-100000).project(d.camera);return {target:d.controls.target.toArray(),projected:p.toArray(),box:d.scene.children.find(o=>o.type==='BoxHelper'||o.type==='Box3Helper').visible}})()");
  const farFit=Math.abs(far.target[0]-100000)<50&&Math.abs(far.target[2]+100000)<50&&far.projected.every(n=>Math.abs(n)<1)&&far.box;
  if(mode==='current')assert.ok(farFit,`Bounds and fitting update for a model far from origin: ${JSON.stringify(far)}`);
  const beforeLoss=await window.webContents.capturePage();
  await writeFile(resolve(config.output,`${mode}-context-before.png`),beforeLoss.toPNG());
  const canLoseContext=await js(`(()=>{const gl=viewerTest.diagnostics.renderer.getContext(),extension=gl.getExtension('WEBGL_lose_context');if(!extension)return false;viewerTest.restore=()=>extension.restoreContext();extension.loseContext();return true;})()`);
  if(canLoseContext){
    await delay(200);await js('viewerTest.restore();void 0');await delay(700);await settled();
    assert.equal(await js('viewerTest.diagnostics.renderer.getContext().isContextLost()'),false,'WebGL context is restored');
    const recovered=await window.webContents.capturePage();const difference=pixelDifference(beforeLoss,recovered);
    await writeFile(resolve(config.output,`${mode}-context-after.png`),recovered.toPNG());
    assert.ok(difference<.01,`Restoring the context redraws the idle scene and its shadows (${difference})`);
  }
  report.regressions.push({mode,chunkRemovalAndRecreation:true,chunkPixelDifference:restoredDifference,transparentRemoval:true,largeCoordinatesFit:farFit,far,contextRestore:canLoseContext});
}
try{
  for(const mode of config.modes){
    window=new BrowserWindow({x:20,y:20,width:1200,height:800,useContentSize:true,show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
    window.setContentSize(1200,800);window.webContents.setZoomFactor(1);
    window.webContents.on('render-process-gone',(_event,details)=>{console.error('Renderer gone',details);});
    window.webContents.on('console-message',(_event,...args)=>{if(args[0]?.level==='error'||args[0]===3)console.error('Renderer error',...args);});
    console.log(`Benchmark ${mode} opening isolated renderer`);
    await window.loadURL(`${origin}/?mode=${mode}`);await ready(0);await installProbe();
    const viewport=await js('({width:innerWidth,height:innerHeight,pixelRatio:devicePixelRatio})');
    assert.deepEqual(viewport,{width:1200,height:800,pixelRatio:1},'The two renderers must use the same measured viewport and pixel ratio');
    if(!config.measureOnly)await regression(mode);
    const cases=config.counts.map(count=>({name:`synthetic-${count}`,count,expression:`viewerTest.fixture(${count})`}));
    if(config.installedFixture){const pieces=JSON.parse(await readFile(resolve(config.output,'installed-fixture.json'),'utf8'));cases.push({name:'installed-model',count:pieces.length,expression:"await(await fetch('/installed-fixture.json')).json()"});}
    for(const item of cases){
      console.log(`Benchmark ${mode} ${item.name} loading`);
      const started=Date.now();await js(`(async()=>{viewerTest.select(null);viewerTest.setStep(Number.MAX_SAFE_INTEGER);viewerTest.setPieces(${item.expression});})()`);await ready(item.count);await fit();const loadMs=Date.now()-started;
      const measurement=await orbit();
      await delay(700);const idleBefore=await js('viewerTest.probe.count()');await delay(600);const idleFrames=await js('viewerTest.probe.count()')-idleBefore;
      report.measurements.push({mode,fixture:item.name,pieces:item.count,loadMs,idleFrames,...measurement});
      await checkpoint();
      console.log(`Benchmark ${mode} ${item.name}: ${JSON.stringify(report.measurements.at(-1))}`);
      await writeFile(resolve(config.output,`${mode}-${item.name}.png`),(await window.webContents.capturePage()).toPNG());
    }
    if(!config.measureOnly&&mode==='baseline'){
      try{await extendedRegression(mode);}catch(error){report.regressions.push({mode,knownBaselineFailure:error.message});console.log('Known baseline regression:',error.message);}
    }else if(!config.measureOnly)await extendedRegression(mode);
    await checkpoint();
    window.destroy();window=undefined;
  }
  if(!config.measureOnly&&config.modes.includes('baseline')&&config.modes.includes('current')){
    for(const view of ['regression','transparency-front','transparency-back','transparency-oblique','transparency-removed']){
      const baseline=nativeImage.createFromBuffer(await readFile(resolve(config.output,`baseline-${view}.png`))),current=nativeImage.createFromBuffer(await readFile(resolve(config.output,`current-${view}.png`)));
      const changedPixelRatio=pixelDifference(baseline,current);report.visualComparisons.push({view,changedPixelRatio});
      assert.ok(changedPixelRatio<(view==='regression'?.02:.01),`Visual parity ${view}: ${changedPixelRatio}`);
    }
  }
  report.gpuFeatures=app.getGPUFeatureStatus();report.ok=true;
}catch(error){report.error=error.stack;console.error(error);}
await writeFile(resolve(config.output,'result.json'),JSON.stringify(report,null,2)+'\n');
if(window&&!window.isDestroyed())window.destroy();server.close();app.exit(report.ok?0:1);
}
void run().catch(error=>{console.error(error);app.exit(1);});
