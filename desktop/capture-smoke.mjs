import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {nativeImage} from 'electron';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {backendEnvironment} from './config.mjs';

const imageWidth = 640;
const imageHeight = 480;
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const textContent = response => response.content.filter(item => item.type === 'text').map(item => item.text).join('\n');

async function call(client, name, args = {}) {
  const response = await client.callTool({name, arguments: args});
  assert.equal(Boolean(response.isError), false, `${name}: ${textContent(response)}`);
  return JSON.parse(textContent(response));
}

async function editorState(window) {
  return window.webContents.executeJavaScript(`({
    modelId: document.querySelector('select[aria-label="Abrir modelo"]')?.value,
    title: document.querySelector('.project-title strong')?.textContent,
    revision: document.querySelector('.project-title strong')?.nextElementSibling?.textContent,
    pieceCount: document.querySelector('.scene-counter')?.textContent,
    selectedPiece: document.querySelector('.selection-id')?.textContent ?? null,
    step: document.querySelector('input[aria-label="Paso de montaje visible"]')?.value,
    canvases: [...document.querySelectorAll('canvas')].map(canvas => ({width: canvas.width, height: canvas.height})),
    errors: [...document.querySelectorAll('.toast.error')].map(element => element.textContent)
  })`);
}

function readPng(response, request, artifact) {
  assert.equal(Boolean(response.isError), false, `capture_model: ${textContent(response)}`);
  const images = response.content.filter(item => item.type === 'image');
  assert.equal(images.length, 1, 'MCP debe devolver exactamente un bloque image');
  assert.equal(images[0].mimeType, 'image/png');
  const png = Buffer.from(images[0].data, 'base64');
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'La respuesta debe contener PNG real');
  const decoded = nativeImage.createFromBuffer(png);
  assert.equal(decoded.isEmpty(), false, 'Electron debe poder decodificar la imagen recibida por MCP');
  assert.deepEqual(decoded.getSize(), {width: request.width, height: request.height});
  const bitmap = decoded.toBitmap();
  const colors = new Set();
  let foregroundPixels = 0;
  const background = bitmap.readUInt32LE(0);
  for (let offset = 0; offset < bitmap.length; offset += 4) {
    const color = bitmap.readUInt32LE(offset);
    colors.add(color);
    if (color !== background) foregroundPixels++;
  }
  assert.ok(colors.size > 30, `La captura debe mostrar geometría sombreada, no una imagen vacía (${colors.size} colores)`);
  assert.ok(foregroundPixels > request.width * request.height * .01, 'La construcción debe ocupar un área visible');
  const metadata = response.structuredContent;
  assert.ok(metadata, 'La captura incluye metadatos estructurados para identificar modelo y revisión');
  for (const key of ['modelId', 'view', 'width', 'height']) assert.equal(metadata[key], request[key], `Metadato de captura incorrecto: ${key}`);
  assert.equal(metadata.revision, request.expectedRevision, 'La imagen debe corresponder a la revisión solicitada');
  const text = JSON.parse(textContent(response));
  assert.deepEqual(text, metadata, 'Los metadatos textuales y estructurados deben coincidir');
  writeFileSync(artifact, png);
  return {bitmap, metadata, pngSha256: sha256(png), bitmapSha256: sha256(bitmap), colors: colors.size, foregroundPixels};
}

async function capture(client, target, view, path) {
  const request = {modelId: target.id, expectedRevision: target.revision, view, width: imageWidth, height: imageHeight};
  const response = await client.callTool({name: 'capture_model', arguments: request}, undefined, {timeout: 45000});
  const result = readPng(response, request, path);
  assert.equal(result.metadata.pieceCount, target.pieces.length, 'La captura debe incluir todas las piezas del modelo solicitado');
  assert.equal(result.metadata.mimeType, 'image/png');
  return result;
}

export async function testModelCapture({app, window, config, userData, visibleModel}) {
  const checks = [];
  const artifacts = [];
  const http = new Client({name: 'brickforge-desktop-capture-http-smoke', version: '1'});
  let stdio;
  let stdioDiagnostics = '';
  assert.equal(window.isVisible(), false, 'Las pruebas de visión no deben mostrar una ventana al usuario');
  assert.equal(window.webContents.getBackgroundThrottling(), false, 'La aplicación real debe permitir capturar con la ventana oculta');
  const before = await editorState(window);
  assert.equal(before.modelId, visibleModel.id);
  assert.equal(before.canvases.length, 1);
  assert.deepEqual(before.errors, []);
  try {
    await http.connect(new StreamableHTTPClientTransport(new URL(config.origin + '/mcp'), {
      requestInit: {headers: {Authorization: `Bearer ${config.token}`}},
    }));
    const definition = (await http.listTools()).tools.find(tool => tool.name === 'capture_model');
    assert.ok(definition, 'Un cliente MCP genérico debe descubrir capture_model');
    assert.equal(definition.annotations.readOnlyHint, true);

    // Model A remains selected in the editor. Captures always request model B,
    // which has never been opened there, to rule out screenshots of the viewport.
    let target = await call(http, 'create_model', {name: 'Captura MCP aislada', template: 'empty'});
    for (const [label, args] of [
      ['modelo inexistente', {modelId: randomUUID()}],
      ['modelo vacío', {modelId: target.id}],
      ['revisión inválida', {modelId: target.id, expectedRevision: 0}],
      ['dimensiones inválidas', {modelId: target.id, width: 128}],
    ]) {
      const rejected = await http.callTool({name: 'capture_model', arguments: args}, undefined, {timeout: 5000});
      assert.equal(rejected.isError, true, `capture_model debe rechazar ${label} sin esperar un render`);
      assert.equal(rejected.content.some(item => item.type === 'image'), false);
    }
    target = await call(http, 'place_on_ground', {
      modelId: target.id, expectedRevision: target.revision,
      piece: {id: 'capture-base', part: '3001', color: 4, step: 1, group: 'Captura'},
    });
    const options = await call(http, 'find_connections', {modelId: target.id, anchorId: 'capture-base', part: '3005'});
    assert.ok(options.options.length);
    target = await call(http, 'connect_piece', {
      modelId: target.id, expectedRevision: target.revision,
      piece: {id: 'capture-top', part: '3005', color: 14, step: 2, group: 'Captura'},
      connection: options.options[0].connection,
    });
    const stale = await http.callTool({name: 'capture_model', arguments: {modelId: target.id, expectedRevision: target.revision - 1}}, undefined, {timeout: 5000});
    assert.equal(stale.isError, true, 'La revisión obsoleta se rechaza antes de capturar');

    const snapshots = new Map();
    for (const view of ['isometric', 'front', 'top']) {
      const filename = `smoke-capture-${view}.png`;
      const result = await capture(http, target, view, join(userData, filename));
      snapshots.set(view, result);
      const {bitmap, ...proof} = result;
      artifacts.push({filename, transport: 'http', ...proof});
      assert.deepEqual(await call(http, 'get_model', {modelId: target.id}), target, 'Capturar no cambia datos, revisión ni fecha del modelo solicitado');
      assert.deepEqual(await editorState(window), before, 'Capturar otro modelo no cambia la selección, el paso ni el canvas del editor');
    }
    assert.equal(new Set([...snapshots.values()].map(item => item.bitmapSha256)).size, 3, 'Las vistas frontal, isométrica y cenital deben tener píxeles distintos');
    checks.push('MCP HTTP devuelve PNG real del modelo solicitado, distinto del visible: frontal, isométrica y cenital a 640 × 480, con revisión exacta');

    // Only this isolated smoke profile receives a legacy fixture. Creating it
    // through the normal tools would correctly fail assembly validation before
    // reaching the renderer, which would not exercise missing-geometry recovery.
    const legacyId = randomUUID();
    const fixtureDatabase = new DatabaseSync(config.databasePath);
    fixtureDatabase.exec('PRAGMA busy_timeout=5000;');
    try {
      const pieces = [...target.pieces, {
        id: 'capture-missing-geometry', part: 'missing-capture-geometry', color: 4,
        position: [160, 24, 0], rotation: [0, 0, 0], step: 3, group: 'Prueba legacy aislada',
      }];
      fixtureDatabase.prepare('INSERT INTO models (id,owner,name,revision,pieces,updated_at) VALUES(?,?,?,?,?,?)')
        .run(legacyId, 'local', 'Captura con geometría ausente', 1, JSON.stringify(pieces), new Date().toISOString());
      const rejected = await http.callTool({
        name: 'capture_model', arguments: {modelId: legacyId, expectedRevision: 1, view: 'front', width: imageWidth, height: imageHeight},
      }, undefined, {timeout: 10000});
      assert.equal(rejected.isError, true, 'Una pieza sin geometría debe invalidar toda la captura');
      assert.equal(rejected.content.some(item => item.type === 'image'), false, 'No se puede devolver una imagen parcial de las piezas que sí cargaron');
      assert.match(textContent(rejected), /No se ha podido renderizar el modelo:/u, 'El fallo debe proceder del renderer, no del acceso al modelo o de un timeout');
      assert.match(textContent(rejected), /geometría|geometry|missing-capture-geometry/iu);
      assert.deepEqual((await call(http, 'get_model', {modelId: legacyId})).pieces, pieces, 'El rechazo no modifica el modelo legacy');
      const recoveredFilename = 'smoke-capture-front-after-render-error.png';
      const recovered = await capture(http, target, 'front', join(userData, recoveredFilename));
      assert.equal(recovered.bitmapSha256, snapshots.get('front').bitmapSha256, 'El actor debe recuperarse del fallo y renderizar la captura válida siguiente');
      const {bitmap: recoveredBitmap, ...recoveredProof} = recovered;
      artifacts.push({filename: recoveredFilename, transport: 'http', afterMissingGeometry: true, ...recoveredProof});
      assert.deepEqual(await editorState(window), before, 'El fallo de geometría y su recuperación no alteran el editor visible');
      checks.push('Geometría ausente en un modelo legacy rechazada sin imagen parcial; el renderer se recupera y la siguiente captura válida conserva sus píxeles');
    } finally {
      fixtureDatabase.prepare('DELETE FROM models WHERE id=?').run(legacyId);
      fixtureDatabase.close();
    }

    const previous = target;
    target = await call(http, 'edit_model', {
      modelId: target.id, expectedRevision: target.revision,
      operations: [{action: 'update', id: 'capture-base', patch: {color: 1}}],
    });
    assert.equal(target.revision, previous.revision + 1);
    const filename = 'smoke-capture-front-updated.png';
    const updated = await capture(http, target, 'front', join(userData, filename));
    const oldBitmap = snapshots.get('front').bitmap;
    let changedPixels = 0;
    for (let offset = 0; offset < oldBitmap.length; offset += 4) if (oldBitmap.readUInt32LE(offset) !== updated.bitmap.readUInt32LE(offset)) changedPixels++;
    assert.ok(changedPixels > 500, `Editar el color debe cambiar la fotografía, no solo sus metadatos (${changedPixels} píxeles)`);
    const {bitmap, ...proof} = updated;
    artifacts.push({filename, transport: 'http', changedPixels, ...proof});
    checks.push('Una edición de color produce una nueva revisión y nuevos píxeles; captura de revisión obsoleta, modelo ausente, vacío y argumentos inválidos rechazada');

    // Packaged Electron intentionally disables runAsNode. Never weaken that fuse
    // just for a test: exercise stdio with the development runtime, and HTTP with
    // the actual packaged application in the other desktop smoke modes.
    let stdioStatus = 'not-run: packaged runAsNode fuse remains disabled';
    if (!app.isPackaged) {
      stdio = new Client({name: 'brickforge-desktop-capture-stdio-smoke', version: '1'});
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [resolve(import.meta.dirname, '..', 'dist-server', 'stdio.mjs')],
        cwd: userData,
        env: {...backendEnvironment(config), ELECTRON_RUN_AS_NODE: '1'},
        stderr: 'pipe',
      });
      transport.stderr?.on('data', data => { stdioDiagnostics = (stdioDiagnostics + data.toString()).slice(-4000); });
      await stdio.connect(transport, {timeout: 10000});
      assert.notEqual(transport.pid, process.pid, 'stdio debe ejecutarse en un proceso independiente');
      assert.deepEqual(await call(stdio, 'get_model', {modelId: target.id}), target, 'HTTP y stdio comparten la misma base de modelos');
      const stdioFilename = 'smoke-capture-stdio-front.png';
      const stdioResult = await capture(stdio, target, 'front', join(userData, stdioFilename));
      assert.equal(stdioResult.bitmapSha256, updated.bitmapSha256, 'stdio debe devolver la misma geometría y revisión que HTTP, mediante el renderer de escritorio');
      const {bitmap: stdioBitmap, ...stdioProof} = stdioResult;
      artifacts.push({filename: stdioFilename, transport: 'stdio', ...stdioProof});
      stdioStatus = 'passed: separate process, shared SQLite, real desktop renderer';
      checks.push('MCP stdio en proceso independiente comparte SQLite y devuelve los mismos píxeles que HTTP usando el renderer real de Electron');
    }

    assert.deepEqual(await call(http, 'get_model', {modelId: target.id}), target);
    assert.deepEqual(await call(http, 'get_model', {modelId: visibleModel.id}), visibleModel, 'Capturar el modelo B no altera el modelo A abierto');
    assert.deepEqual(await editorState(window), before);
    assert.equal(window.isVisible(), false, 'La ventana continúa oculta después de capturar');
    checks.push('Capturas con ventana oculta y backgroundThrottling desactivado; selección, canvas y modelos preservados');
    const result = {ok: true, hiddenWindow: true, backgroundThrottling: false, stdio: stdioStatus, artifacts, checks};
    writeFileSync(join(userData, 'smoke-capture-result.json'), JSON.stringify(result, null, 2) + '\n');
    return result;
  } catch (error) {
    if (stdioDiagnostics) console.error('Diagnóstico del proceso MCP stdio de prueba:', stdioDiagnostics);
    throw error;
  } finally {
    await stdio?.close();
    await http.close();
  }
}
