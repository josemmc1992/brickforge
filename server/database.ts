import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Built entrypoints all live in dist-server/. Never depend on a client's cwd.
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const databasePath=resolve(process.env.BRICKFORGE_DB||resolve(root,'data/brickforge.sqlite'));
mkdirSync(dirname(databasePath),{recursive:true});
export const sqlite=new DatabaseSync(databasePath);
sqlite.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS models (id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,revision INTEGER NOT NULL,pieces TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS models_owner ON models(owner);`);
export const owner='local';
export const database={prepare(sql:string){return {bind(...values:any[]){const statement=sqlite.prepare(sql);return {
 async first<T>(){return (statement.get(...values)??null) as T|null;},
 async all(){return {results:statement.all(...values)};},
 async run(){const result=statement.run(...values);return {meta:{changes:Number(result.changes)}};}
 };}};}};
