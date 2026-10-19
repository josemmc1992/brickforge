import {app, BrowserWindow, clipboard, dialog, Menu, session, shell} from 'electron';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {loadConfig,mcpConfiguration,prepareTestProfile} from './config.mjs';
import {createProcesses} from './processes.mjs';

const smoke = process.argv.includes('--smoke-test');
const argument = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
app.setName('Brickforge');
if (smoke) {
  prepareTestProfile(argument('--test-user-data'));
  app.setPath('userData', argument('--test-user-data'));
} else if (argument('--test-user-data')) {
  throw new Error('--test-user-data solo está disponible con --smoke-test.');
}
app.setAppUserModelId('com.brickforge.desktop');
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();

let window;
let processes;
let quitting = false;
let fatal = false;
let serviceAvailable = false;
let backupBusy = false;
let config;
let userData;
const sameOrigin = value => { try { return new URL(value).origin === config.origin; } catch { return false; } };
const contentSecurityPolicy = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function focusWindow() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show(); window.focus();
}
app.on('second-instance', focusWindow);
app.on('activate', focusWindow);
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); quitting = true; serviceAvailable = false;
  void (async () => { try { await processes?.stop(); } finally { app.exit(fatal ? 1 : 0); } })();
});

async function fail(error) {
  if (fatal || quitting) return;
  fatal = true; serviceAvailable = false;
  const message = error instanceof Error ? error.message : String(error);
  await processes?.stop();
  if (smoke) {
    writeFileSync(join(app.getPath('userData'), 'smoke-result.json'), JSON.stringify({ok: false, error: message}, null, 2));
    console.error('Brickforge desktop smoke failed:', message);
  } else await dialog.showMessageBox({type: 'error', title: 'No se puede abrir Brickforge', message, detail: 'La aplicación se cerrará. Tus modelos se conservan en la carpeta de datos.', buttons: ['Cerrar']});
  app.quit();
}

async function configureSession() {
  const ses = session.fromPartition('brickforge-desktop'); // In memory: no persistent auth cookies.
  await ses.setProxy({mode: 'direct'});
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.setDevicePermissionHandler(() => false);
  ses.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({title: 'Guardar archivo de Brickforge', defaultPath: join(app.getPath('downloads'), item.getFilename())});
  });
  ses.webRequest.onBeforeRequest((details, callback) => {
    const localResource = sameOrigin(details.url) || details.url.startsWith(`blob:${config.origin}/`) || details.url.startsWith('data:image/');
    callback({cancel: !serviceAvailable || !localResource});
  });
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = {...details.requestHeaders};
    for (const key of Object.keys(headers)) if (key.toLowerCase() === 'authorization') delete headers[key];
    if (serviceAvailable && sameOrigin(details.url) && details.webContentsId === window?.webContents.id && (!details.initiatorOrigin || details.initiatorOrigin === config.origin)) {
      headers.Authorization = `Bearer ${config.token}`;
    }
    callback({requestHeaders: headers});
  });
  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = {...details.responseHeaders};
    if (sameOrigin(details.url)) headers['Content-Security-Policy'] = [contentSecurityPolicy];
    callback({responseHeaders: headers});
  });
  return ses;
}

async function connectAI() {
  const result = await dialog.showMessageBox(window, {
    type: 'info', title: 'Diseña LEGO con tu IA', message: 'Conectar una IA mediante MCP',
    detail: `Endpoint Streamable HTTP:\n${config.origin}/mcp\n\nBrickforge debe permanecer abierto. Utiliza un cliente MCP que pueda acceder a este ordenador. La configuración contiene una clave privada que permite leer y modificar tus construcciones; compártela solo con tu cliente de IA. El formato exacto puede variar según el cliente.`,
    buttons: ['Copiar configuración con clave', 'Cerrar'], defaultId: 1, cancelId: 1,
  });
  if (result.response === 0) clipboard.writeText(JSON.stringify(mcpConfiguration(config), null, 2));
}

async function copyBackup(command) {
  if (backupBusy) return;
  backupBusy = true;
  try {
    if (command === 'export') {
      const selection = await dialog.showSaveDialog(window, {title: 'Exportar todas las construcciones', defaultPath: `brickforge-copia-${new Date().toISOString().slice(0, 10)}.json`, filters: [{name: 'Copia de Brickforge', extensions: ['json']}]});
      if (selection.canceled || !selection.filePath) return;
      await processes.backup('export', selection.filePath);
      await dialog.showMessageBox(window, {type: 'info', message: 'Copia de seguridad exportada.', detail: selection.filePath});
    } else {
      const selection = await dialog.showOpenDialog(window, {title: 'Importar una copia de Brickforge', properties: ['openFile'], filters: [{name: 'Copia de Brickforge', extensions: ['json']}]});
      if (selection.canceled || !selection.filePaths[0]) return;
      const backupDir = join(userData, 'backups'); mkdirSync(backupDir, {recursive: true});
      const safetyCopy = join(backupDir, `antes-de-importar-${Date.now()}.json`);
      await processes.backup('export', safetyCopy);
      await processes.backup('import', selection.filePaths[0]);
      window.webContents.reload();
      await dialog.showMessageBox(window, {type: 'info', message: 'Copia importada. Los modelos existentes se han conservado.', detail: `Copia anterior guardada en:\n${safetyCopy}`});
    }
  } catch (error) {
    await dialog.showMessageBox(window, {type: 'error', title: 'Copia de seguridad', message: 'No se pudo completar la copia.', detail: `${error.message}\n\nLas importaciones con conflictos se cancelan sin sobrescribir tus construcciones. Para exportar, elige un nombre de archivo nuevo.`});
  } finally { backupBusy = false; }
}

function installMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label: 'Archivo', submenu: [
      {label: 'Importar copia de seguridad…', click: () => void copyBackup('import')},
      {label: 'Exportar copia de seguridad…', click: () => void copyBackup('export')},
      {type: 'separator'}, {label: 'Cerrar Brickforge', role: 'quit'},
    ]},
    {label: 'Editar', submenu: [{label: 'Deshacer', role: 'undo'}, {label: 'Rehacer', role: 'redo'}, {type: 'separator'}, {label: 'Cortar', role: 'cut'}, {label: 'Copiar', role: 'copy'}, {label: 'Pegar', role: 'paste'}, {label: 'Seleccionar todo', role: 'selectAll'}]},
    {label: 'Ver', submenu: [{label: 'Recargar', role: 'reload'}, {type: 'separator'}, {label: 'Tamaño original', role: 'resetZoom'}, {label: 'Acercar', role: 'zoomIn'}, {label: 'Alejar', role: 'zoomOut'}, {type: 'separator'}, {label: 'Pantalla completa', role: 'togglefullscreen'}]},
    {label: 'Ayuda', submenu: [
      {label: 'Conectar IA…', click: () => void connectAI()},
      {label: 'Abrir carpeta de datos', click: () => void shell.openPath(userData)},
      {type: 'separator'},
      {label: 'Acerca de Brickforge', click: () => void dialog.showMessageBox(window, {type: 'info', title: 'Brickforge', message: `Brickforge ${app.getVersion()} · BETA`, detail: 'Diseña LEGO con IA.\n\nEditor 3D y servidor MCP genérico, con catálogo LDraw y datos guardados en tu ordenador.\n\nProyecto independiente, sin afiliación con LEGO. Esta versión beta puede tener errores. Haz copias de tus construcciones.', buttons: ['Cerrar']})},
    ]},
  ]));
}

async function start() {
  await app.whenReady();
  userData = app.getPath('userData');
  let testPort;
  if (smoke) {
    const {freePort} = await import('./smoke.mjs');
    testPort = await freePort();
  }
  config = loadConfig(userData, testPort);
  const root = resolve(import.meta.dirname, '..');
  processes = createProcesses(root, userData, config, error => void fail(error));
  const backendReady = await processes.start();
  serviceAvailable = true;
  const ses = await configureSession();
  window = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1000, minHeight: 700, show: false,
    title: 'Brickforge · Diseña LEGO con IA · Beta', icon: join(root, 'desktop', 'assets', 'icon.png'), backgroundColor: '#f4f3ef',
    webPreferences: {session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false, webviewTag: false, webSecurity: true, allowRunningInsecureContent: false, devTools: false},
  });
  window.on('page-title-updated', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  for (const eventName of ['will-navigate', 'will-frame-navigate']) window.webContents.on(eventName, (event, url) => {
    const destination = typeof url === 'string' ? url : event.url;
    if (!sameOrigin(destination)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.on('render-process-gone', (_event, details) => { if (!quitting) void fail(new Error(`El editor se ha cerrado (${details.reason}). Vuelve a abrir Brickforge.`)); });
  window.webContents.on('unresponsive', () => { /* The OS still offers closing the window; no forced data loss. */ });
  installMenu();
  await window.loadURL(config.origin);
  if (!smoke) window.show();
  else {
    const {runSmoke} = await import('./smoke.mjs');
    await runSmoke({app,window,processes,config,backendReady,userData});
    app.quit();
  }
}

if (hasLock) void start().catch(error => void fail(error));
