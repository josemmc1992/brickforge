// A reproducible guard over the staged Git tree. It never prints matching values.
// Complements code review; passing this scan is not a guarantee of no secrets.
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const git=(...args)=>execFileSync('git',['-c','safe.directory='+process.cwd(),...args],{maxBuffer:64*1024*1024});
const entries=git('ls-files','--stage','-z').toString().split('\0').filter(Boolean);
if(!entries.length)throw new Error('No staged files: run git add before checking the repository.');
const findings=[];let compressed=0;
// One batch avoids starting thousands of Windows processes for the generated
// catalogue. Parse the binary protocol by its declared byte lengths; never split
// binary blobs on newlines or print their contents.
const hashes=[...new Set(entries.map(entry=>entry.slice(0,entry.indexOf('\t')).split(' ')[1]))];
const sizeOutput=execFileSync('git',['-c','safe.directory='+process.cwd(),'cat-file','--batch-check'],{input:hashes.join('\n')+'\n',maxBuffer:8*1024*1024}).toString('utf8');
const sizes=new Map(sizeOutput.trim().split('\n').map(line=>{const [hash,type,size]=line.trim().split(' ');if(type!=='blob'||!/^\d+$/.test(size))throw new Error('Unexpected Git object type in staged files');return [hash,Number(size)];}));
if([...sizes.values()].some(size=>size>64*1024*1024)||[...sizes.values()].reduce((a,b)=>a+b,0)>384*1024*1024)throw new Error('Staged tree exceeds the bounded scanner size. Review large files before packaging.');
const packed=execFileSync('git',['-c','safe.directory='+process.cwd(),'cat-file','--batch'],{input:hashes.join('\n')+'\n',maxBuffer:400*1024*1024});
const blobs=new Map();let cursor=0;
for(const hash of hashes){
 const newline=packed.indexOf(10,cursor);if(newline<0)throw new Error('Truncated Git batch header');
 const header=packed.subarray(cursor,newline).toString('ascii').split(' '),size=sizes.get(hash);
 if(header[0]!==hash||header[1]!=='blob'||Number(header[2])!==size)throw new Error('Unexpected Git batch object');
 cursor=newline+1;if(cursor+size>=packed.length||packed[cursor+size]!==10)throw new Error('Truncated Git batch content');
 blobs.set(hash,packed.subarray(cursor,cursor+size));cursor+=size+1;
}
if(cursor!==packed.length)throw new Error('Unexpected trailing Git batch data');
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
 if(/^(?:data|backups|node_modules|dist|dist-server|release|\.desktop-tests|\.desktop-cache|coverage|\.agents|\.codex|\.claude)\//.test(path)||/\.(?:sqlite|db)(?:-.*)?$/i.test(path)||/\.(?:pem|key|p12|pfx|zip|tar\.gz|exe|msi|dll|blockmap)$/i.test(path)||['AGENTS.local.md','CLAUDE.local.md','.npmrc','credentials.json','secrets.json'].includes(basename)||(basename.startsWith('.env')&&basename!=='.env.example'))findings.push([path,'private or generated file in index']);
 let bytes=blobs.get(metadata[1]);
 if(bytes[0]===0x1f&&bytes[1]===0x8b){try{bytes=gunzipSync(bytes,{maxOutputLength:64*1024*1024});compressed++;}catch{findings.push([path,'cannot inspect compressed file']);continue;}}
 const value=bytes.toString('utf8');
 for(const [label,pattern] of patterns)if(pattern.test(value))findings.push([path,label]);
 if(/C:[\\/]Users[\\/]User[\\/]/i.test(value))findings.push([path,'machine-specific user path']);
}
if(findings.length){for(const [path,reason] of findings)console.error(`${path}: ${reason}`);process.exitCode=1;}
else console.log(`PASS: ${entries.length} staged files, ${compressed} decompressed archives; no blocked paths or matching secret patterns. Manual review is still required.`);
