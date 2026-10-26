import {build as frontend} from 'vite';
import {build as backend} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const catalogCheck=spawnSync(process.execPath,['scripts/catalog.mjs','check'],{stdio:'inherit',windowsHide:true});
if(catalogCheck.status!==0)throw new Error('Catálogo de encajes desactualizado o inválido. Ejecuta npm run catalog:generate y revisa el resultado.');
await frontend();
await backend({entryPoints:['server/http.ts','server/stdio.ts','server/backup.ts'],outdir:'dist-server',outExtension:{'.js':'.mjs'},platform:'node',format:'esm',target:'node22',bundle:true,packages:'external',sourcemap:true});
