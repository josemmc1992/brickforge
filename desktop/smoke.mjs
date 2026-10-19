import {testMinifigNeckAssembly} from './neck-smoke.mjs';
import {testMinifigHipAssembly} from './hips-smoke.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {backendEnvironment} from './config.mjs';
import {testSlidingAssembly} from './axial-smoke.mjs';
import {testKeyedAssembly} from './keyed-smoke.mjs';
import {testStandardAccessAssembly} from './access-smoke.mjs';
import {testTechnicPinAssembly} from './pin-smoke.mjs';

export async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

export async function runSmoke({app,window,processes,config,backendReady,userData}) {
  const checks = [];
  // A hidden smoke window otherwise keeps its first compositor frame even after
  // React updates its DOM. Keep painting enabled only for this isolated test.
  window.webContents.setBackgroundThrottling(false);
  const headers = {Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json'};
  const probe = new DatabaseSync(':memory:'); probe.exec('CREATE TABLE probe (id INTEGER)'); probe.close();
  assert.match(backendReady.node, /^24\./u);
  assert.ok(backendReady.sqlite);
  checks.push('Node y SQLite reales en Electron y su proceso de servicio');
  const environment = backendEnvironment(config, {NODE_OPTIONS: '--inspect', PUBLIC_ORIGIN: 'https://outside.invalid', BRICKFORGE_TOKEN: 'ambient', ELECTRON_RUN_AS_NODE: '1', HOST: '0.0.0.0', PATH: process.env.PATH});
  assert.equal(environment.NODE_OPTIONS, undefined); assert.equal(environment.PUBLIC_ORIGIN, undefined); assert.equal(environment.ELECTRON_RUN_AS_NODE, undefined); assert.equal(environment.HOST, '127.0.0.1'); assert.equal(environment.BRICKFORGE_TOKEN, config.token);
  checks.push('Entorno hijo aislado de opciones y autenticación ambientales');
  const request = (path, body, auth = true) => fetch(config.origin + path, {method: 'POST', headers: auth ? headers : {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(10000)});
  assert.equal((await request('/api/action', {name: 'list_models'}, false)).status, 401);
  assert.equal((await request('/mcp', {jsonrpc: '2.0', id: 1, method: 'tools/list'}, false)).status, 401);
  assert.equal((await fetch(config.origin + '/.env')).status, 404);
  assert.equal((await fetch(config.origin + '/data/brickforge.sqlite')).status, 404);
  const crossOrigin = await fetch(config.origin + '/api/action', {method: 'POST', headers: {...headers, Origin: 'https://outside.invalid'}, body: JSON.stringify({name: 'list_models'})});
  assert.equal(crossOrigin.status, 403);
  checks.push('API y MCP requieren clave; protegen origen y archivos privados');

  const client = new Client({name: 'brickforge-desktop-smoke', version: '1'});
  async function call(name, args = {}) {
    const response = await client.callTool({name, arguments: args});
    assert.equal(Boolean(response.isError), false, JSON.stringify(response));
    return JSON.parse(response.content[0].text);
  }
  let model;
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(config.origin + '/mcp'), {requestInit: {headers}}));
    assert.equal((await client.listTools()).tools.length, 15);
    const created = await client.callTool({name: 'create_model', arguments: {name: 'Prueba de escritorio', template: 'robot'}});
    assert.equal(Boolean(created.isError), false);
    model = JSON.parse(created.content[0].text);
    assert.ok(model.pieces.length > 0);
    const catalogue = JSON.parse((await client.callTool({name: 'catalog_info', arguments: {}})).content[0].text);
    assert.ok(catalogue.connectionCoverage.basePartCount > 100);
    assert.ok(catalogue.connectionCoverage.variantCount > 1000);
    const ground = await client.callTool({name: 'place_on_ground', arguments: {modelId: model.id, expectedRevision: model.revision, piece: {id: 'desktop-jumper', part: '87580', color: 1, step: 15, group: 'Catálogo ampliado'}}});
    assert.equal(Boolean(ground.isError), false); model = JSON.parse(ground.content[0].text);
    const choices = await client.callTool({name: 'find_connections', arguments: {modelId: model.id, part: '3070bp01', anchorId: 'desktop-jumper'}});
    assert.equal(Boolean(choices.isError), false); const option = JSON.parse(choices.content[0].text).options[0]; assert.ok(option);
    const connected = await client.callTool({name: 'connect_piece', arguments: {modelId: model.id, expectedRevision: model.revision, piece: {id: 'desktop-pattern', part: '3070bp01', color: 14, step: 15, group: 'Catálogo ampliado'}, connection: option.connection}});
    assert.equal(Boolean(connected.isError), false); model = JSON.parse(connected.content[0].text);
    assert.ok(catalogue.connectionCoverage.generatedPartCount > 0);
    const generated = await call('get_part', {part: '43712'});
    assert.equal(generated.connectivity.supported, true);
    assert.equal(generated.connectivity.profile, 'ldraw-shadow-envelope-v1', 'El instalable debe cargar un perfil generado desde sus assets');
    model = await call('place_on_ground', {modelId: model.id, expectedRevision: model.revision, piece: {id: 'desktop-generated', part: '43712', color: 4, step: 16, group: 'Geometría y conectores LDraw'}});
    let generatedChoice, capPart;
    for (const part of ['3070b', '98138']) {
      const placements = await call('find_connections', {modelId: model.id, part, anchorId: 'desktop-generated'});
      if (placements.options.length) { generatedChoice = placements.options[0]; capPart = part; break; }
    }
    assert.ok(generatedChoice, 'La nueva familia debe ofrecer un encaje real válido');
    model = await call('connect_piece', {modelId: model.id, expectedRevision: model.revision, piece: {id: 'desktop-generated-cap', part: capPart, color: 14, step: 16, group: 'Geometría y conectores LDraw'}, connection: generatedChoice.connection});
    const assembly = (await call('analyze_model', {modelId: model.id})).assembly;
    assert.equal(assembly.valid, true);
    assert.ok(assembly.connections.some(connection => [connection.a, connection.b].includes('desktop-generated') && [connection.a, connection.b].includes('desktop-generated-cap')));
    const duplicate = {...model.pieces.find(piece => piece.id === 'desktop-generated'), id: 'desktop-overlap'};
    const displaced = [...model.pieces.find(piece => piece.id === 'desktop-generated-cap').position]; displaced[1] += 1;
    for (const operations of [[{action: 'add', piece: duplicate}], [{action: 'update', id: 'desktop-generated-cap', patch: {position: displaced}}]]) {
      const rejected = await client.callTool({name: 'edit_model', arguments: {modelId: model.id, expectedRevision: model.revision, operations}});
      assert.equal(rejected.isError, true, 'El servicio empaquetado debe rechazar solapamientos y piezas desconectadas');
      assert.deepEqual(await call('get_model', {modelId: model.id}), model, 'Un cambio inválido no puede modificar el modelo ni su revisión');
    }
    for (const [part, kind] of [['3673', 'bar-socket'], ['30374', 'bar']]) {
      const info = await call('get_part', {part});
      assert.equal(info.connectivity.supported, true);
      assert.equal(info.connectivity.profile, part === '3673' ? 'ldraw-technic-pin-envelope-v1' : 'ldraw-axial-envelope-v1');
      assert.ok(info.connectivity.connectors.some(port => port.kind === kind));
    }
    model = await call('place_on_ground', {modelId: model.id, expectedRevision: model.revision, piece: {id: 'desktop-r4-socket', part: '3673', color: 1, step: 17, group: 'Barra R4 y canal pasante'}});
    const axialChoices = await call('find_connections', {modelId: model.id, part: '30374', anchorId: 'desktop-r4-socket'});
    assert.ok(axialChoices.options.length, 'El MCP empaquetado debe encontrar el encaje axial');
    model = await call('connect_piece', {modelId: model.id, expectedRevision: model.revision, piece: {id: 'desktop-r4-bar', part: '30374', color: 14, step: 17, group: 'Barra R4 y canal pasante'}, connection: axialChoices.options[0].connection});
    const axialReport = (await call('analyze_model', {modelId: model.id})).assembly;
    assert.equal(axialReport.valid, true);
    assert.ok(axialReport.connections.some(connection => [connection.a, connection.b].includes('desktop-r4-socket') && [connection.a, connection.b].includes('desktop-r4-bar')));
    const axialPorts = (await call('get_connections', {modelId: model.id, pieceId: 'desktop-r4-socket'})).connectors;
    assert.ok(axialPorts.some(port => port.kind === 'bar-socket' && port.occupied));
    const axialDisplaced = [...model.pieces.find(piece => piece.id === 'desktop-r4-bar').position]; axialDisplaced[1] += .009;
    const rejectedAxial = await client.callTool({name: 'edit_model', arguments: {modelId: model.id, expectedRevision: model.revision, operations: [{action: 'update', id: 'desktop-r4-bar', patch: {position: axialDisplaced}}]}});
    assert.equal(rejectedAxial.isError, true, 'Una barra descentrada no cumple el contrato aunque el desplazamiento sea inferior a la tolerancia de colisión');
    assert.deepEqual(await call('get_model', {modelId: model.id}), model, 'El rechazo axial debe conservar el modelo y su revisión');
    model = await testSlidingAssembly(client, model, 'desktop');
    model = await testKeyedAssembly(client, model, 'desktop');
    model = await testStandardAccessAssembly(client, model, 'desktop');
    model = await testTechnicPinAssembly(client, model, 'desktop');
    model = await testMinifigNeckAssembly(client, model, 'desktop');
    model = await testMinifigHipAssembly(client, model, 'desktop');
    const read = await request('/api/action', {name: 'get_model', args: {modelId: model.id}});
    assert.equal((await read.json()).id, model.id);
  } finally { await client.close(); }
  checks.push('Cliente MCP genérico crea un modelo y HTTP lee la misma base');
  checks.push('Catálogo ampliado: placa con tetón centrado y variante decorada conectadas mediante MCP');
  checks.push('Perfil generado 43712 cargado desde assets, apoyado y conectado; solapamiento y desplazamiento rechazados sin modificar la revisión');
  checks.push('Barra 30374 en canal 3673 mediante MCP, perfil mejorado que conserva su contrato R4 y rechazo de desplazamiento de 0,009 LDU sin modificar el modelo');
  checks.push('Tres receptores 4274 sobre una varilla 30374 mediante MCP, reservas disjuntas y rechazo atómico de solapamiento, exceso de longitud y offsets inválidos');
  checks.push('Eje Technic A6 3705 y tres casquillos 3713 mediante MCP: perfiles v3, reservas, biseles, colisiones y rechazo atómico de descentrado');
  checks.push('Pin Technic 3673 une dos vigas 32523 por ambos extremos: ocupación, colisiones y rechazo atómico de descentrado y axialOffset');
  checks.push('Torso 973 y cabeza 3626c mediante MCP: asiento fijo, tetón superior conservado y rechazo atómico de solapamiento, hundimiento y axialOffset');
  checks.push('Accesos certificados en 6120 y 3573: uniones estándar en concavidades y rechazo atómico de solapamiento o desconexión');

  const backup = join(userData, 'smoke-backup.json');
  await processes.backup('export', backup);
  const exported = JSON.parse(readFileSync(backup, 'utf8'));
  assert.equal(exported.format, 'brickforge-backup-v1');
  assert.ok(exported.models.some(item => item.id === model.id));
  assert.deepEqual(exported.models.find(item => item.id === model.id), model, 'La copia debe preservar también la barra y el receptor axiales visibles');
  await processes.backup('import', backup);
  const conflicting = structuredClone(exported);
  conflicting.models.find(item => item.id === model.id).name = 'No debe sobrescribir';
  const conflictPath = join(userData, 'smoke-conflict.json');
  writeFileSync(conflictPath, JSON.stringify(conflicting));
  await assert.rejects(processes.backup('import', conflictPath), /Conflicting existing model/u);
  assert.equal((await (await request('/api/action', {name: 'get_model', args: {modelId: model.id}})).json()).name, 'Prueba de escritorio');
  checks.push('Copia JSON, importación idempotente y rechazo de conflictos sin sobrescribir');

  await window.loadURL(config.origin);
  async function waitForScene() {
    let state;
    let stable = 0;
    for (let i = 0; i < 450; i++) {
      state = await window.webContents.executeJavaScript(`({
        modelId: document.querySelector('select[aria-label="Abrir modelo"]')?.value,
        title: document.querySelector('.project-title strong')?.textContent,
        canvas: Boolean(document.querySelector('.studio canvas')),
        loaders: [...document.querySelectorAll('.viewer-message')].map(element => element.textContent),
        errors: [...document.querySelectorAll('.toast.error')].map(element => element.textContent),
        catalogCount: document.querySelectorAll('.part-card').length,
        searching: document.querySelector('.results-heading')?.textContent.includes('Buscando'),
        busy: document.querySelector('.statusbar')?.textContent.includes('Guardando'),
        visibility: document.visibilityState
      })`);
      const ready = state.modelId === model.id && state.title === model.name && state.canvas && state.loaders.length === 0 && state.errors.length === 0 && state.catalogCount > 0 && !state.searching && !state.busy;
      stable = ready ? stable + 1 : 0;
      if (stable === 3) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(stable, 3, `El modelo, sus geometrías y el catálogo deben estar completamente cargados: ${JSON.stringify(state)}`);
    // React's loading counter can clear before Three's next animation frame.
    // Wait for multiple actual paints, then flush the WebGL command queue.
    await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('El editor no produjo frames de renderizado.')), 5000);
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        document.querySelector('canvas').getContext('webgl2').finish();
        clearTimeout(timeout); resolve();
      })));
    })`);
    return state;
  }
  await waitForScene();
  const renderer = await window.webContents.executeJavaScript(`(async () => ({
    processType: typeof process, requireType: typeof require,
    session: await (await fetch('/api/session')).json(),
    cookie: document.cookie,
    csp: (await fetch('/')).headers.get('Content-Security-Policy'),
    webgl2: !!document.querySelector('canvas')?.getContext('webgl2'),
    compression: typeof DecompressionStream,
    externalFetchBlocked: await fetch('https://example.invalid/').then(() => false, () => true),
    popupBlocked: window.open('https://example.invalid/') === null
  }))()`);
  assert.equal(renderer.processType, 'undefined'); assert.equal(renderer.requireType, 'undefined');
  assert.equal(renderer.session.authenticated, true); assert.equal(renderer.session.mode, 'token');
  assert.equal(renderer.cookie, ''); assert.equal(renderer.webgl2, true); assert.equal(renderer.compression, 'function');
  assert.match(renderer.csp, /script-src 'self'/u); assert.equal(renderer.externalFetchBlocked, true); assert.equal(renderer.popupBlocked, true);
  const preferences = window.webContents.getLastWebPreferences();
  assert.equal(preferences.sandbox, true); assert.equal(preferences.contextIsolation, true); assert.equal(preferences.nodeIntegration, false); assert.equal(preferences.webviewTag, false);
  await window.webContents.executeJavaScript("location.href = 'https://example.invalid/'; void 0");
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(new URL(window.webContents.getURL()).origin, config.origin);
  checks.push('React, catálogo, WebGL2, autenticación silenciosa y renderer aislado con CSP');
  checks.push('Se bloquean navegación, ventanas y peticiones externas');
  const renderedScene = await waitForScene();
  const screenshot = await window.webContents.capturePage();
  writeFileSync(join(userData, 'smoke-window.png'), screenshot.toPNG());
  checks.push('Modelo seleccionado, geometrías y catálogo cargados, sin errores y con frames WebGL pintados antes de capturar');

  const backendPid = processes.pid;
  await processes.stop();
  assert.equal(processes.childCount, 0, 'No deben quedar procesos de servicio');
  assert.equal(processes.pid, undefined);
  await assert.rejects(fetch(config.origin + '/healthz', {signal: AbortSignal.timeout(2000)}));
  const database = new DatabaseSync(config.databasePath, {readOnly: true});
  assert.equal(database.prepare('SELECT name FROM models WHERE id=?').get(model.id).name, 'Prueba de escritorio');
  database.close();
  checks.push('Cierre del servicio y sus procesos; SQLite conserva el modelo');
  const result = {ok: true, version: app.getVersion(), electron: process.versions.electron, node: process.versions.node, backendNode: backendReady.node, sqlite: backendReady.sqlite, port: config.port, backendPid, renderedScene, checks};
  writeFileSync(join(userData, 'smoke-result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('PASS Brickforge desktop:', checks.join('; '));
}
