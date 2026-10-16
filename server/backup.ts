import {readFileSync,writeFileSync} from 'node:fs';
import {sqlite,owner} from './database';
import {validatePieces} from '../lib/model';
const [command,path]=process.argv.slice(2);
if(!path||!['import','export'].includes(command))throw new Error('Usage: node dist-server/backup.mjs import|export FILE.json');
if(command==='export'){
 const rows=sqlite.prepare('SELECT * FROM models WHERE owner=?').all(owner) as any[];
 writeFileSync(path,JSON.stringify({format:'brickforge-backup-v1',models:rows.map(r=>({id:r.id,name:r.name,revision:r.revision,pieces:JSON.parse(r.pieces),updatedAt:r.updated_at}))},null,2),{flag:'wx'});
 console.error(`Exported ${rows.length} models.`);
}else{
 const data=JSON.parse(readFileSync(path,'utf8'));
 if(data.format!=='brickforge-backup-v1'||!Array.isArray(data.models))throw new Error('Invalid backup format');
 // Offline migration preserves legacy geometry; subsequent structural edits still validate assembly.
 const models=data.models.map((m:any)=>{
  if(typeof m.id!=='string'||!m.id||typeof m.name!=='string'||!m.name||!Number.isInteger(m.revision)||m.revision<1||!Number.isFinite(Date.parse(m.updatedAt)))throw new Error('Invalid model metadata');
  return {...m,pieces:validatePieces(m.pieces)};
 });
 sqlite.exec('BEGIN IMMEDIATE');let added=0;
 try{for(const m of models){const old=sqlite.prepare('SELECT * FROM models WHERE id=?').get(m.id) as any;
  if(old){if(old.owner!==owner||old.revision!==m.revision||old.name!==m.name||old.pieces!==JSON.stringify(m.pieces))throw new Error(`Conflicting existing model: ${m.id}. Restore into a new database.`);continue;}
  sqlite.prepare('INSERT INTO models VALUES (?,?,?,?,?,?)').run(m.id,owner,m.name,m.revision,JSON.stringify(m.pieces),m.updatedAt);added++;
 }sqlite.exec('COMMIT');}catch(error){sqlite.exec('ROLLBACK');throw error;}
 console.error(`Imported ${added} models; existing identical models preserved.`);
}
