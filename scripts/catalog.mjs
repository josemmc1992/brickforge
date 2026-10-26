import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('..',import.meta.url));process.chdir(root);
const mode=process.argv[2]||'check';
if(!['generate','check','test'].includes(mode))throw new Error('Usage: node scripts/catalog.mjs generate|check|test');
function run(file,args=[]){
 console.log('\nCatalogue: '+file+' '+args.join(' '));
 const result=spawnSync(process.execPath,[file,...args],{stdio:'inherit',windowsHide:true});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error(file+' failed ('+result.status+')');
}
if(mode==='generate'||mode==='check'){
 for(const compiler of ['compile-assembly-variants','compile-shadow-catalog','compile-collision-catalog','compile-generated-assembly'])run('scripts/'+compiler+'.mjs',mode==='check'?['--check']:[]);
 const original=fs.readFileSync('vendor/ldcad-shadow/LICENSE.md');
 for(const directory of ['shadow','assembly'])if(!fs.readFileSync('public/catalog/'+directory+'/LICENSE.md').equals(original)||!fs.existsSync('public/catalog/'+directory+'/NOTICE.txt'))throw new Error('Missing or altered catalogue attribution for '+directory);
}else{
 for(const suite of ['test-assembly-variants','test-shadow-resolver','test-collision-catalog','test-generated-profile','test-axial-shaft','test-axial-envelope','test-generated-axial-profile','test-keyed-axial-shaft','test-keyed-axial-channel','test-generated-keyed-axial-profile','test-standard-access','test-generated-access-profile','test-faceted-wall-proof','test-technic-pin-channel','test-technic-pin-geometry','test-generated-technic-pin-profile','test-minifig-neck-geometry','test-minifig-hips-geometry'])run('scripts/'+suite+'.mjs');
 fs.mkdirSync('.desktop-tests',{recursive:true});
 for(const suite of ['axial-fit','axial-connections','keyed-axial-fit','keyed-axial-connections','keyed-axial-assembly','technic-pin-fit','technic-pin-assembly','minifig-neck-fit','minifig-neck-assembly','minifig-hips-fit','minifig-hips-assembly','connection-boundaries']){const outfile='.desktop-tests/'+suite+'.mjs';await build({entryPoints:['scripts/test-'+suite+'.ts'],bundle:true,platform:'node',format:'esm',outfile});run(outfile);}
 run('scripts/test-axial-integration.mjs');
 run('scripts/test-axial-sliding-integration.mjs');
 run('scripts/test-technic-pin-assets.mjs');
 run('scripts/test-minifig-neck-assets.mjs');
 run('scripts/test-minifig-hips-assets.mjs');
 run('scripts/test-technic-pin-source-coverage.mjs');
 run('scripts/test-technic-pin-source-coverage.mjs',['--family=minifig-neck']);
 run('scripts/test-technic-pin-source-coverage.mjs',['--family=minifig-hips']);
 const outfile='.desktop-tests/generated-runtime.mjs';
 await build({entryPoints:['scripts/test-generated-runtime.ts'],bundle:true,platform:'node',format:'esm',outfile});run(outfile);
}
