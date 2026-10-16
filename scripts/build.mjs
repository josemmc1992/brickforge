import {build as frontend} from 'vite';
import {build as backend} from 'esbuild';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
await frontend();
await backend({entryPoints:['server/http.ts','server/stdio.ts','server/backup.ts'],outdir:'dist-server',outExtension:{'.js':'.mjs'},platform:'node',format:'esm',target:'node22',bundle:true,packages:'external',sourcemap:true});
