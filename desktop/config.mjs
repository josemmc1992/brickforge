import {randomBytes} from 'node:crypto';
import {chmodSync,existsSync,mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {isAbsolute,join} from 'node:path';

export function prepareTestProfile(path) {
  if (!path || !isAbsolute(path)) throw new Error('--smoke-test requiere --test-user-data con una ruta absoluta.');
  const marker = join(path, '.brickforge-smoke-profile');
  if (existsSync(path) && readdirSync(path).length && !existsSync(marker)) {
    throw new Error('El perfil de prueba debe estar vacío; no se utilizarán datos existentes.');
  }
  mkdirSync(path, {recursive: true, mode: 0o700});
  if (!existsSync(marker)) writeFileSync(marker, 'Perfil aislado de prueba de Brickforge.\n', {flag: 'wx', mode: 0o600});
}

function protectFile(path) {
  chmodSync(path, 0o600);
  if (process.platform === 'win32') {
    const system32 = join(process.env.SystemRoot || 'C:\\Windows', 'System32');
    const identity = execFileSync(join(system32, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], {encoding: 'utf8', windowsHide: true});
    const sid = identity.match(/S-1-[0-9-]+/u)?.[0];
    if (!sid) throw new Error('No se pudo determinar el usuario de Windows para proteger la configuración.');
    execFileSync(join(system32, 'icacls.exe'), [path, '/inheritance:r', '/grant:r', `*${sid}:(F)`], {stdio: 'pipe', windowsHide: true});
  }
}

export function loadConfig(userData, testPort) {
  mkdirSync(userData, {recursive: true, mode: 0o700});
  const path = join(userData, 'config.json');
  let config;
  if (existsSync(path)) config = JSON.parse(readFileSync(path, 'utf8'));
  else {
    config = {version: 1, port: testPort ?? 3101, token: randomBytes(32).toString('hex')};
    writeFileSync(path, JSON.stringify(config, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  }
  if (config.version !== 1 || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 || typeof config.token !== 'string' || !/^[a-f0-9]{64}$/u.test(config.token)) {
    throw new Error('config.json no es válido. Debe conservar version: 1, un puerto entre 1024 y 65535 y la clave generada por Brickforge.');
  }
  protectFile(path);
  mkdirSync(join(userData, 'data'), {recursive: true, mode: 0o700});
  return {...config, path, databasePath: join(userData, 'data', 'brickforge.sqlite'), origin: `http://127.0.0.1:${config.port}`};
}

export function backendEnvironment(config, source = process.env) {
  // Use a small OS allowlist: no ambient .env, NODE_OPTIONS, proxies or auth overrides.
  const allowed = new Set(['systemroot', 'windir', 'comspec', 'temp', 'tmp', 'tmpdir', 'path', 'pathext', 'home', 'userprofile', 'appdata', 'localappdata', 'lang', 'lc_all']);
  const env = Object.fromEntries(Object.entries(source).filter(([name, value]) => allowed.has(name.toLowerCase()) && typeof value === 'string'));
  return {...env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(config.port), BRICKFORGE_DB: config.databasePath, BRICKFORGE_TOKEN: config.token};
}

export function mcpConfiguration(config) {
  return {mcpServers: {brickforge: {url: `${config.origin}/mcp`, headers: {Authorization: `Bearer ${config.token}`}}}};
}
