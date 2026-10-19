import {utilityProcess} from 'electron';
import {join} from 'node:path';
import {backendEnvironment} from './config.mjs';

export function createProcesses(root, userData, config, onUnexpectedExit) {
  const children = new Set();
  let backend;
  let stopping = false;
  function fork(file, args, name) {
    const child = utilityProcess.fork(join(root, 'desktop', file), args, {
      cwd: userData, env: backendEnvironment(config), execArgv: [], stdio: 'pipe', serviceName: name,
    });
    children.add(child);
    child.once('exit', () => children.delete(child));
    // Drain output without persisting paths, private model names or credentials.
    child.stdout?.on('data', () => {});
    child.stderr?.on('data', () => {});
    child.on('error', () => {}); // The corresponding exit event drives failure handling.
    return child;
  }
  async function start() {
    if (backend) throw new Error('El servicio ya se ha iniciado.');
    backend = fork('backend.mjs', [String(process.pid)], 'Brickforge · Modelos y MCP');
    const child = backend;
    let ready = false;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { child.kill(); reject(new Error('El servicio local no ha arrancado en 30 segundos.')); }, 30000);
      child.on('message', message => {
        if (message?.type === 'ready') { ready = true; clearTimeout(timeout); resolve(message); }
        if (message?.type === 'failed') {
          clearTimeout(timeout);
          const error = new Error(message.code === 'EADDRINUSE'
            ? `El puerto ${config.port} está ocupado. Cierra la otra aplicación o cambia port en ${config.path} y vuelve a abrir Brickforge. No se ha conectado a ningún proceso ajeno.`
            : `No se pudo iniciar el servicio local: ${message.message || 'error desconocido'}`);
          if (ready && !stopping) onUnexpectedExit(error); else reject(error);
        }
      });
      child.once('exit', code => {
        clearTimeout(timeout);
        const error = new Error(`El servicio de modelos se ha cerrado (código ${code}). Tus construcciones siguen en la carpeta de datos. Vuelve a abrir Brickforge.`);
        if (!ready) reject(error);
        else if (!stopping) onUnexpectedExit(error);
      });
    });
  }
  async function backup(command, path) {
    if (stopping) throw new Error('Brickforge se está cerrando.');
    const child = fork('backup-runner.mjs', [command, path], 'Brickforge · Copia de seguridad');
    return new Promise((resolve, reject) => {
      let failure;
      let complete = false;
      const timeout = setTimeout(() => { failure = 'La copia ha superado el límite de dos minutos.'; child.kill(); }, 120000);
      child.on('message', message => {
        if (message?.type === 'failed') failure = message.message;
        if (message?.type === 'complete') complete = true;
        if (['failed', 'complete'].includes(message?.type)) child.postMessage({type: 'received'});
      });
      child.once('exit', code => { clearTimeout(timeout); if (code === 0 && complete) resolve(); else reject(new Error(failure || `No se pudo ${command === 'import' ? 'importar' : 'exportar'} la copia.`)); });
    });
  }
  async function stop() {
    stopping = true;
    const pending = [...children].map(child => new Promise(resolve => {
      child.once('exit', resolve);
      try { if (child === backend) child.postMessage({type: 'shutdown'}); else child.kill(); }
      catch { child.kill(); }
    }));
    if (!pending.length) return;
    let timer;
    await Promise.race([Promise.all(pending), new Promise(resolve => { timer = setTimeout(resolve, 5000); })]);
    clearTimeout(timer);
    for (const child of children) child.kill();
    if (children.size) await new Promise(resolve => setTimeout(resolve, 150));
  }
  return {start, backup, stop, get pid() { return backend?.pid; }, get childCount() { return children.size; }};
}
