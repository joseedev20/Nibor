import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const statePrefix = path.join(path.resolve(tmpdir()), 'nibor-smoke-')
const stateDir = await mkdtemp(statePrefix)
const isWindows = process.platform === 'win32'
const wranglerCli = path.join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const commandOptions = {
  cwd: projectRoot,
  env: { ...process.env, CI: '1' },
  shell: false,
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => resolve(address.port))
    })
  })
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    ...commandOptions,
    stdio: 'inherit',
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).map((value) => value.toString()).join('\n')
    throw new Error(`${command} terminó con código ${result.status}${output ? `\n${output}` : ''}`)
  }
}

async function waitForWorker(baseUrl, worker, logs) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (worker.exitCode !== null) {
      throw new Error(`Wrangler terminó antes de tiempo.\n${logs.join('')}`)
    }
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) return
    } catch {
      // Wrangler todavía está iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Wrangler no respondió en 30 segundos.\n${logs.join('')}`)
}

function stopProcessTree(child) {
  if (!child || child.exitCode !== null) return
  if (isWindows) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
  } else {
    child.kill('SIGTERM')
  }
}

function assertSafeTempPath(target) {
  const resolved = path.resolve(target)
  const parent = path.dirname(resolved)
  if (parent !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith('nibor-smoke-')) {
    throw new Error(`Ruta temporal inesperada; no se eliminará: ${resolved}`)
  }
}

async function removeTempState(target) {
  assertSafeTempPath(target)
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true })
      return
    } catch (error) {
      const retryable = ['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error?.code)
      if (!retryable || attempt === 20) throw error
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
}

let worker = null
try {
  console.log(`D1/R2 temporal: ${stateDir}`)
  run(process.execPath, [wranglerCli, 'd1', 'migrations', 'apply', 'nibor-finanzas', '--local', '--persist-to', stateDir], {
    stdio: 'pipe',
  })

  const port = await getFreePort()
  const baseUrl = `http://127.0.0.1:${port}/api`
  const workerLogs = []
  worker = spawn(process.execPath, [
    wranglerCli,
    'dev',
    '--port',
    String(port),
    '--persist-to',
    stateDir,
    '--log-level',
    'warn',
    '--var',
    'CALENDAR_FEED_TOKEN:smoke-calendar-token',
    '--var',
    'WIDGET_TOKEN:smoke-widget-token',
    '--show-interactive-dev-session=false',
  ], {
    ...commandOptions,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  worker.stdout.on('data', (chunk) => workerLogs.push(chunk.toString()))
  worker.stderr.on('data', (chunk) => workerLogs.push(chunk.toString()))

  await waitForWorker(baseUrl, worker, workerLogs)
  run(process.execPath, ['server/smoke.js'], {
    shell: false,
    env: { ...process.env, SMOKE_BASE_URL: baseUrl },
  })
  console.log('Smoke aislado OK: la D1 personal no fue utilizada.')
} finally {
  stopProcessTree(worker)
  await removeTempState(stateDir)
}
