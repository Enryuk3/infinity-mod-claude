import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { bandFrame, bandSvg, satoru } from '../hooks/satoru'
import { lethal } from '../hooks/lethal'
import { fireAka, fireAo, fireMurasaki, scene, toggleDomain } from '../hooks/scene'

const LETHAL_COMMANDS: [string, string][] = [
  ['rm -rf node_modules', 'rm -r'],
  ['cd app && rm -r pages', 'rm -r'],
  [['git', 'reset', '--hard'].join(' '), 'git reset --hard'],
  ['git push origin main --force', 'git push --force'],
  ['git clean -fd', 'git clean -f'],
  ['git checkout .', 'git checkout .'],
  ['supabase db reset', 'supabase db reset/push'],
  ['psql -c "DROP TABLE players"', 'DROP/TRUNCATE'],
  ['psql -c "TRUNCATE TABLE players"', 'DROP/TRUNCATE'],
  ['psql -c "truncate players;"', 'DROP/TRUNCATE'],
  ['psql -c "TRUNCATE players"', 'DROP/TRUNCATE'],
  ['echo hi; rm -rf dist', 'rm -r'],
  ['sudo rm -rf /var/cache/app', 'rm -r'],
  [`bash -c 'rm -rf build'`, 'rm -r'],
  [`ssh box 'cd /srv && git reset --hard'`, 'git reset --hard'],
  ['echo "$(rm -rf dist)"', 'rm -r'],
  ["psql <<'SQL'\nDROP TABLE players;\nSQL", 'DROP/TRUNCATE'],
  ['echo "DROP TABLE players" | psql', 'DROP/TRUNCATE'],
]
const SAFE = [
  'git push origin main --force-with-lease', 'git clean -n', 'rm notes.txt', 'pnpm lint', 'git checkout main',
  `printf '<p class="truncate text-sm">' > card.html`, 'rg -n "truncate" src', `echo '<p class="truncate block">'`, 'echo "<p className={\'truncate block\'}>"',
`sd 'truncate' 'line-clamp-1' src/App.tsx`,
  // Only naming one, as a search pattern, a message or a line printed, runs nothing
  'rg -n "rm -rf" src', `grep -rn 'git push --force' docs`, 'git commit -m "docs: explain the rm -rf guard"',
  `echo 'git reset --hard'`, 'rg "DROP TABLE" migrations', `sd 'TRUNCATE TABLE' 'DELETE FROM' schema.sql`,
]

const run = ($: Parameters<TestBody>[0], command: string) =>
  $.command.run({ command, args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }).then(r => JSON.stringify(r))

test('Infinity reconoce lo irreversible y deja pasar lo demás', async () => {
  for (const [command, label] of LETHAL_COMMANDS) expect(lethal(command)).toBe(label)
  for (const command of SAFE) expect(lethal(command)).toBeNull()
})

/** A machine where each command the measuring runs answers what `outputs` says for it. */
const machine = (outputs: Record<string, string>) => (_: unknown, e: { argv: readonly string[] }) => {
  const key = Object.keys(outputs).find(prefix => e.argv.join(' ').startsWith(prefix))
  return { value: { exitCode: 0, stdout: key ? outputs[key]! : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
}

test('Infinity pregunta antes de un rm -r, con los archivos que borraría', async ($, on) => {
  on('process.run', machine({
    'printenv HOME': '/home/satoru\n',
    'find ./node_modules': 'node_modules/a.js\nnode_modules/b.js\n',
    'du -sk': '2048\t./node_modules\n',
  }))
  on('tool.check', () => ({ decision: 'allow' as const }))

  const verdict = await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf node_modules' } })
  expect(verdict.decision).toBe('ask')
  expect(verdict.reason).toContain('"rm -r" es irreversible')
  expect(verdict.reason).toContain('Borraría 2 archivos (2.0 MB) en node_modules:')
  expect(verdict.reason).toContain('node_modules/a.js y node_modules/b.js.')
  expect(verdict.reason).toContain('node_modules/a.js')
})

test('Infinity pregunta antes de un reset, con los cambios que se perderían', async ($, on) => {
  on('process.run', machine({
    'git status': ' M src/a.ts\n M src/b.ts\n',
    'git diff --shortstat': ' 2 files changed, 3 insertions(+)\n',
  }))
  on('tool.check', () => ({ decision: 'allow' as const }))

  const verdict = await $.tool.check({ tool: 'Bash', input: { command: ['git', 'reset', '--hard'].join(' ') } })
  expect(verdict.decision).toBe('ask')
  expect(verdict.reason).toContain('Perdería los cambios sin commit de 2 archivos')
  expect(verdict.reason).toContain('src/b.ts')
})

test('Infinity no pregunta por lo que no es irreversible', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' as const }))

  expect((await $.tool.check({ tool: 'Bash', input: { command: 'rg -n "rm -rf" src' } })).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'Read', input: { file_path: 'a.ts' } })).decision).toBe('allow')
})

test('Infinity deja pasar lo que no es letal', async ($, on) => {
  let reached = 0
  on('tool.call', { tool: 'Bash' }, () => {
    reached += 1
    return { result: { stdout: 'ok', stderr: '', interrupted: false } }
  })

  await $.tool.call({ tool: 'Bash', command: 'git push origin main --force-with-lease' })
  await $.tool.call({ tool: 'Bash', command: 'pnpm lint' })
  expect(reached).toBe(2)
})

test('Expansión de Dominio abre y cierra el Vacío Ilimitado', async ($, on) => {
  // The domain's clip plays from sounds/; muted here, the domain still opens and closes
  on('audio.play', () => ({ value: undefined }))

  expect(await run($, 'domain')).toContain('Vacío Ilimitado')
  expect(await run($, 'domain')).toContain('Dominio cerrado')
})

test('El dominio abierto se queda guardado hasta que lo cierras', async ($, on) => {
  on('audio.play', () => ({ value: undefined }))
  const kept: unknown[] = []
  on('store.set', (_, e) => {
    if (e.key === 'scene') kept.push(e.value)
    return { value: undefined }
  })

  await run($, 'domain')
  await run($, 'domain')
  expect(kept).toEqual([{ isDomain: true }, { isDomain: false }])
})

test('Azul y Rojo no se pisan entre sí', async ($, on) => {
  on('audio.play', () => ({ value: undefined }))
  on('audio.speak', () => ({ value: { via: 'system' as const } }))

  expect(await run($, 'ao')).toContain('Azul.')
  expect(await run($, 'aka')).toContain('técnica en curso')
})

test('Púrpura pide a Azul y Rojo primero', async ($, on) => {
  on('audio.play', () => ({ value: undefined }))
  on('audio.speak', () => ({ value: { via: 'system' as const } }))

  expect(await run($, 'murasaki')).toContain('Falta /ao y /aka')
})

test('Infinity suena con un kya! al detener un comando', async ($, on) => {
  const played: string[] = []
  on('process.run', machine({ uname: 'Darwin\n' }))
  on('audio.play', (_, e) => {
    played.push(JSON.stringify(e))
    return { value: undefined }
  })
  on('tool.check', () => ({ decision: 'allow' as const }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } }))

  await $.tool.call({ tool: 'Bash', command: 'rm -rf node_modules' })
  // The kya plays alongside the question, a few awaits behind it
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
  expect(played.some(p => p.includes('sounds/kya.mp3'))).toBe(true)
})

test('Satoru se dibuja en cada estado, técnica y dominio', async () => {
  const size = Math.ceil((100 * 5 * 12) / 3) * 4
  for (const mood of ['idle', 'thinking', 'reading', 'editing', 'running', 'asking', 'happy', 'oops'] as const) {
    satoru.mood = mood
    satoru.crew = mood === 'running' ? [{ id: 'a', who: 'yuji', slot: 0, since: Date.now() - 5000, doneAt: null }, { id: 'b', who: 'megumi', slot: 1, since: Date.now(), doneAt: null }] : []
    expect(bandFrame(100, 5).length).toBe(size)
  }
  for (const fire of [fireAo, fireAka, fireMurasaki, toggleDomain, toggleDomain]) {
    fire()
    expect(bandFrame(100, 5).length).toBe(size)
  }
  scene.infinitySince = Date.now()
  expect(bandFrame(100, 5).length).toBe(size)
})

test('En la app Satoru se dibuja como un SVG animado que cabe en el límite', async () => {
  const check = () => {
    const { source, playMs } = bandSvg(192, 30)
    expect(source.startsWith('<svg')).toBe(true)
    expect(source.length).toBeLessThan(131_072)
    expect(playMs).toBeGreaterThan(0)
  }
  for (const mood of ['idle', 'thinking', 'running', 'happy', 'oops'] as const) {
    satoru.mood = mood
    check()
  }
  for (const fire of [fireAo, fireAka, fireMurasaki, toggleDomain]) {
    fire()
    check()
  }
  toggleDomain()
})


test('Terminado lleva su ✓ y cada conversación abierta es un punto en la esquina', async () => {
  const size = Math.ceil((100 * 5 * 12) / 3) * 4
  satoru.mood = 'done'
  satoru.others = ['working', 'done', 'idle']
  expect(bandFrame(100, 5).length).toBe(size)
  expect(bandSvg(192, 30).source).toContain('#4ade80')
  satoru.others = []
})

test('Escribir sostiene Azul y leer sostiene Rojo, en silencio y sin laptop', async () => {
  scene.aoSince = scene.akaSince = scene.murasakiSince = -Infinity
  scene.holdBlue = scene.holdRed = false
  if (scene.isDomain) toggleDomain()
  scene.isWorking = true
  satoru.mood = 'editing'
  expect(bandSvg(192, 30).source).toContain('#3aa0ff')
  satoru.mood = 'reading'
  expect(bandSvg(192, 30).source).toContain('#ff3d5a')
  satoru.mood = 'thinking'
  const thinking = bandSvg(192, 30).source
  expect(thinking).not.toContain('#3aa0ff')
  expect(thinking).not.toContain('#9aa0ad')
  scene.isWorking = false
})


test('Cada subagente es un Yuji que se va a trabajar y vuelve solo al terminar', async () => {
  scene.aoSince = scene.akaSince = scene.murasakiSince = -Infinity
  scene.holdBlue = scene.holdRed = false
  if (scene.isDomain) toggleDomain()
  scene.isWorking = true
  satoru.mood = 'thinking'
  satoru.crew = []
  expect(bandSvg(192, 30).source).not.toContain('#efb0b6')
  // Working at his spot: he is there, punching, the spark of the hit included
  satoru.crew = [{ id: 'yuji', who: 'yuji', slot: 0, since: Date.now() - 5000, doneAt: null }]
  const working = bandSvg(192, 30).source
  expect(working).toContain('#efb0b6')
  expect(working).toContain('#ffe27a')
  expect(working.length).toBeLessThan(131_072)
  expect(bandFrame(100, 8).length).toBe(Math.ceil((100 * 8 * 12) / 3) * 4)
  // Done long ago: he walked back and is gone
  satoru.crew = [{ id: 'yuji', who: 'yuji', slot: 0, since: Date.now() - 9000, doneAt: Date.now() - 5000 }]
  expect(bandSvg(192, 30).source).not.toContain('#efb0b6')
  // A second subagent while Yuji works is Megumi, his shadow at his feet
  satoru.crew = [
    { id: 'yuji', who: 'yuji', slot: 0, since: Date.now() - 5000, doneAt: null },
    { id: 'megumi', who: 'megumi', slot: 1, since: Date.now() - 5000, doneAt: null },
  ]
  const both = bandSvg(192, 30).source
  expect(both).toContain('#efb0b6')
  expect(both).toContain('#1c2030')
  expect(both).toContain('#2a1745')
  expect(both.length).toBeLessThan(131_072)
  satoru.crew = []
  scene.isWorking = false
})
