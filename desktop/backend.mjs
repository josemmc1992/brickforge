// The only privileged messages accepted here come from Electron's parent process.
const parent = process.parentPort;
if (!parent) throw new Error('Este proceso solo se inicia desde Brickforge Desktop.');
let backend;
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  try { await backend?.stopServer(); } catch { code = 1; }
  parent.postMessage({type: 'stopped', code});
  process.exit(code);
}
parent.on('message', ({data}) => { if (data?.type === 'shutdown') void stop(); });
try {
  // Exercise the actual runtime rather than assuming the system Node is available.
  const {DatabaseSync} = await import('node:sqlite');
  const probe = new DatabaseSync(':memory:');
  probe.exec('CREATE TABLE runtime_check (id INTEGER)');
  probe.close();
  backend = await import('../dist-server/http.mjs');
  await backend.ready;
  backend.server.on('error', error => {
    parent.postMessage({type: 'failed', code: error.code, message: error.message});
    void stop(1);
  });
  parent.postMessage({type: 'ready', pid: process.pid, node: process.versions.node, sqlite: process.versions.sqlite});
  const parentPid = Number(process.argv[2]);
  if (!Number.isInteger(parentPid) || parentPid <= 0) throw new Error('Identificador del proceso principal inválido.');
  setInterval(() => { try { process.kill(parentPid, 0); } catch { void stop(); } }, 2000).unref();
} catch (error) {
  parent.postMessage({type: 'failed', code: error.code, message: error.message});
  await stop(1);
}
