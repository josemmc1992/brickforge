if (!process.parentPort) throw new Error('Este proceso solo se inicia desde Brickforge Desktop.');
let exitCode = 1;
const finish = message => {
  process.parentPort.on('message', ({data}) => { if (data?.type === 'received') process.exit(exitCode); });
  process.parentPort.postMessage(message);
  // Allow IPC delivery before exit; a vanished parent must not leave a worker alive.
  setTimeout(() => process.exit(exitCode), 1000);
};
try {
  if (!['import', 'export'].includes(process.argv[2])) throw new Error('Operación de copia inválida.');
  await import('../dist-server/backup.mjs');
  exitCode = 0;
  finish({type: 'complete'});
  // backup.mjs commits synchronously; exit releases its SQLite connection.
} catch (error) {
  finish({type: 'failed', message: error.message});
}
