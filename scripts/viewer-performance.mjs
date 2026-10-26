import {spawn,spawnSync} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const argument=name=>process.argv.find(value=>value.startsWith(`${name}=`))?.slice(name.length+1);
const counts=(argument('--counts')||'1000,5000,15000').split(',').map(Number);
const frames=Number(argument('--frames')||30);
if(counts.some(n=>!Number.isInteger(n)||n<1||n>15000)||!Number.isInteger(frames)||frames<5||frames>300)throw Error('Invalid counts or frames');
await mkdir(resolve(root,'.desktop-tests'),{recursive:true});
const output=await mkdtemp(resolve(root,'.desktop-tests/viewer-performance-'));
const baselineRef=argument('--baseline-ref');
const sources=process.argv.includes('--baseline-only')?[]:[{mode:'current',path:resolve(root,'components/brick-viewer.tsx')}];
if(baselineRef){
  const git=spawnSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,'show',`${baselineRef}:components/brick-viewer.tsx`],{cwd:root,encoding:'utf8',windowsHide:true});
  if(git.status!==0)throw Error(`Could not read baseline: ${git.stderr}`);
  let source=git.stdout;
  // Adapter for the beta.11 viewer. Only exposes existing runtime to the test;
  // does not change its render loop, geometry, loading or camera behavior.
  const substitutions=[
    ['fitSignal:number};','fitSignal:number;onDiagnostics?:(value:any)=>void};'],
    ['fitSignal}:Props)','fitSignal,onDiagnostics}:Props)'],
    ['let frame=0;const tick=',`onDiagnostics?.({...runtime.current,renderer,invalidate:()=>{},pick:(clientX,clientY)=>{const event=new PointerEvent('pointerup',{clientX,clientY});down(event);up(event);},getStats:()=>({pieceCount:runtime.current?.objects.size})});\n  let frame=0;const tick=`]
  ];
  for(const [from,to]of substitutions){if(!source.includes(from))throw Error('Baseline adapter only supports the beta.11 viewer');source=source.replace(from,to);}
  const path=resolve(output,'baseline.tsx');await writeFile(path,source);sources.unshift({mode:'baseline',path});
}
if(!sources.length)throw Error('--baseline-only requires --baseline-ref');
for(const {mode,path}of sources){
  await build({absWorkingDir:root,entryPoints:[resolve(root,'scripts/viewer-performance-fixture.tsx')],outfile:resolve(output,`${mode}.js`),bundle:true,format:'esm',platform:'browser',target:'chrome144',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'},alias:{'brickforge-benchmark-viewer':path,'@':root},tsconfig:resolve(root,'tsconfig.json')});
}
let installedFixture=false;
if(process.argv.includes('--installed-fixture')){
  const database=new DatabaseSync(resolve(process.env.APPDATA,'Brickforge/data/brickforge.sqlite'),{readOnly:true});
  try{
    const row=database.prepare('SELECT pieces FROM models ORDER BY json_array_length(pieces) DESC LIMIT 1').get();
    if(!row)throw Error('No installed model available');
    await writeFile(resolve(output,'installed-fixture.json'),row.pieces);installedFixture=true;
  }finally{database.close();}
}
const config={root,output,counts,frames,modes:sources.map(s=>s.mode),baselineRef:baselineRef||null,installedFixture,measureOnly:process.argv.includes('--measure-only')};
await writeFile(resolve(output,'config.json'),JSON.stringify(config,null,2));
const executable=createRequire(import.meta.url)('electron');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
const child=spawn(executable,[resolve(root,'scripts/viewer-performance-main.mjs'),`--benchmark-config=${resolve(output,'config.json')}`],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let diagnostics='';
for(const stream of[child.stdout,child.stderr])stream.on('data',data=>{diagnostics=(diagnostics+data.toString()).slice(-24000);process.stderr.write(data);});
const exitCode=await new Promise((res,rej)=>{
  const timeout=setTimeout(()=>{child.kill();rej(Error(`Viewer benchmark timed out: ${diagnostics}`));},900000);
  child.once('error',error=>{clearTimeout(timeout);rej(error);});child.once('exit',code=>{clearTimeout(timeout);res(code);});
});
if(exitCode!==0)throw Error(`Viewer benchmark failed (${exitCode}): ${diagnostics}`);
const report=JSON.parse(await readFile(resolve(output,'result.json'),'utf8'));
if(report.ok!==true)throw Error(`Viewer benchmark did not pass: ${JSON.stringify(report)}`);
console.log(JSON.stringify(report,null,2));
