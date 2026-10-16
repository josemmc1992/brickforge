// A reproducible guard over the staged Git tree. It never prints matching values.
// Complements code review; passing this scan is not a guarantee of no secrets.
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const git=(...args)=>execFileSync('git',args,{maxBuffer:64*1024*1024});
const entries=git('ls-files','--stage','-z').toString().split('\0').filter(Boolean);
if(!entries.length)throw new Error('No staged files: run git add before checking the repository.');
const findings=[];let compressed=0;
const patterns=[
 ['private key',/-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
 ['GitHub token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/],
 ['AWS access key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
 ['Slack token',/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
 ['API secret',/\bsk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{32,}\b/],
 ['Google API key',/\bAIza[A-Za-z0-9_-]{35}\b/],
 ['embedded URL credentials',/\b(?:https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s/:]+:[^\s/@]+@/],
 ['literal credential assignment',/\b(?:password|api_key|apiKey|client_secret|access_token|BRICKFORGE_TOKEN)\s*[:=]\s*['"][A-Za-z0-9_+\/-]{16,}['"]/i],
];
for(const entry of entries){
 const tab=entry.indexOf('\t'),metadata=entry.slice(0,tab).split(' '),path=entry.slice(tab+1),basename=path.split('/').at(-1);
 if(metadata[0]==='120000')findings.push([path,'symbolic link is not allowed in the release']);
 if(/^(?:data|backups|node_modules|dist|dist-server|coverage|\.agents|\.codex|\.claude)\//.test(path)||/\.(?:sqlite|db)(?:-.*)?$/i.test(path)||/\.(?:pem|key|p12|pfx|zip|tar\.gz)$/i.test(path)||['AGENTS.local.md','CLAUDE.local.md','.npmrc','credentials.json','secrets.json'].includes(basename)||(basename.startsWith('.env')&&basename!=='.env.example'))findings.push([path,'private or generated file in index']);
 let bytes=git('cat-file','blob',metadata[1]);
 if(bytes[0]===0x1f&&bytes[1]===0x8b){try{bytes=gunzipSync(bytes,{maxOutputLength:64*1024*1024});compressed++;}catch{findings.push([path,'cannot inspect compressed file']);continue;}}
 const value=bytes.toString('utf8');
 for(const [label,pattern] of patterns)if(pattern.test(value))findings.push([path,label]);
 if(/C:[\\/]Users[\\/]User[\\/]/i.test(value))findings.push([path,'machine-specific user path']);
}
if(findings.length){for(const [path,reason] of findings)console.error(`${path}: ${reason}`);process.exitCode=1;}
else console.log(`PASS: ${entries.length} staged files, ${compressed} decompressed archives; no blocked paths or matching secret patterns. Manual review is still required.`);
