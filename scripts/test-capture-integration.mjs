import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';

// A real, decodable PNG keeps the transport checks independent of a GPU.
function png(width, height) {
  const crc = bytes => {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = y * (width * 4 + 1) + 1 + x * 4;
    scanlines[offset] = x % 256; scanlines[offset + 1] = y % 256; scanlines[offset + 2] = 40; scanlines[offset + 3] = 255;
  }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

export async function testCaptureIntegration({http, stdio, post, token, cookie}) {
  const headers = {Authorization: `Bearer ${token}`};
  const call = async (client, name, args) => {
    const result = await client.callTool({name, arguments: args});
    assert.ok(!result.isError, JSON.stringify(result));
    return JSON.parse(result.content.find(item => item.type === 'text').text);
  };
  for (const path of ['/api/capture/claim', '/api/capture/result']) {
    assert.equal((await post(path, {})).status, 401, `${path}: authentication required`);
    assert.equal((await post(path, {}, {...headers, Origin: 'https://outside.invalid'})).status, 403, `${path}: foreign origin rejected`);
  }
  let model = await call(http, 'create_model', {name: 'Capture protocol fixture'});
  const empty = await http.callTool({name: 'capture_model', arguments: {modelId: model.id}});
  assert.equal(empty.isError, true, 'Empty model must not produce a misleading picture');
  model = await call(http, 'place_on_ground', {modelId: model.id, expectedRevision: model.revision, piece: {id: 'capture-base', part: '3004', color: 4, step: 1, group: 'Capture'}});
  const image = png(256, 256);
  for (const [client, label] of [[http, 'HTTP'], [stdio, 'stdio']]) {
    const tools = (await client.listTools()).tools;
    assert.equal(tools.find(tool => tool.name === 'capture_model')?.annotations?.readOnlyHint, true);
    for (const args of [
      {modelId: 'missing-capture-model'},
      {modelId: model.id, view: 'file:///private'},
      {modelId: model.id, width: 100000},
      {modelId: model.id, width: 256.5},
      {modelId: model.id, expectedRevision: model.revision - 1}
    ]) assert.equal((await client.callTool({name: 'capture_model', arguments: args})).isError, true, `${label}: reject invalid capture input`);
    const pending = client.callTool({name: 'capture_model', arguments: {modelId: model.id, expectedRevision: model.revision, view: 'front', width: 256, height: 256}});
    pending.catch(() => {}); // Keep cleanup from creating an unhandled rejection if an assertion fails.
    let job;
    for (let attempt = 0; attempt < 60 && !job; attempt++) {
      const claim = await post('/api/capture/claim', {}, {Cookie: cookie});
      assert.equal(claim.status, 200);
      job = (await claim.json()).job;
      if (!job) await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(job, `${label}: independent HTTP renderer must receive the request`);
    assert.equal(job.model.id, model.id);
    assert.equal(job.model.revision, model.revision);
    assert.deepEqual(job.model.pieces, model.pieces);
    assert.equal(job.view, 'front');
    assert.equal((await (await post('/api/capture/claim', {}, headers)).json()).job, null, 'A claimed request cannot be claimed twice');
    const badLease = await post('/api/capture/result', {id: job.id, leaseToken: 'wrong-lease', data: image}, headers);
    assert.ok(badLease.status >= 400, 'Unrelated renderer cannot satisfy a capture');
    for (const data of ['not-a-png', png(257, 256)]) {
      const badImage = await post('/api/capture/result', {id: job.id, leaseToken: job.leaseToken, data}, headers);
      assert.ok(badImage.status >= 400, 'Corrupt or wrong-size image must be rejected');
    }
    const completed = await post('/api/capture/result', {id: job.id, leaseToken: job.leaseToken, data: image}, headers);
    assert.equal(completed.status, 200);
    const result = await pending;
    assert.ok(!result.isError, JSON.stringify(result));
    const content = result.content.find(item => item.type === 'image');
    assert.ok(content, `${label}: image must be an MCP image block, not JSON text`);
    assert.equal(content.mimeType, 'image/png');
    assert.equal(content.data, image);
    const metadata = result.structuredContent;
    assert.equal(metadata.modelId, model.id);
    assert.equal(metadata.revision, model.revision);
    assert.equal(metadata.view, 'front');
    assert.equal(metadata.width, 256); assert.equal(metadata.height, 256);
    assert.equal(metadata.pieceCount, 1);
    assert.ok(!result.content.filter(item => item.type === 'text').some(item => item.text.includes(image)), 'Do not duplicate image bytes as text');
    assert.deepEqual(await call(client, 'get_model', {modelId: model.id}), model, 'Capturing must not modify a model');
    const replay = await post('/api/capture/result', {id: job.id, leaseToken: job.leaseToken, data: image}, headers);
    assert.ok(replay.status >= 400, 'A consumed result cannot be replayed');
  }
}
