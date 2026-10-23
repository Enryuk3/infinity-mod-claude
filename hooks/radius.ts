// What an irreversible command would touch, measured before anyone decides: the files rm would delete, the changes a
// reset would drop, the commits a force push would overwrite. Nothing here changes anything; every path goes to the
// tools as an argument, so no part of the command runs as shell.
import type { EngineInterface } from 'claude-code'

import type { LethalPart } from './lethal'

type $ = EngineInterface

// Each measurement is a dry run that should take a moment; a slow one is given up on, not waited for
const MEASURE_MS = 8000
// The dialog shows a few names, then how many more
const LISTED = 5

const kb = (size: number) =>
  size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} GB` : size >= 1024 ? `${(size / 1024).toFixed(1)} MB` : `${size} KB`

/**
 * A few names and how many more there are, as one sentence: the app's dialog runs lines together, so a list one per
 * line would read as one run-on line there.
 */
function listed(names: string[]): string[] {
  if (names.length === 0) return []
  const shown = names.slice(0, LISTED)
  const rest = names.length - shown.length
  const text = rest > 0 ? `${shown.join(', ')} y ${rest} más` : shown.length > 1 ? `${shown.slice(0, -1).join(', ')} y ${shown.at(-1)}` : shown[0]!

  return [`${text}.`]
}

const lines = (text: string) => text.split('\n').map(line => line.trimEnd()).filter(Boolean)

async function run($: $, argv: string[], cwd: string) {
  return $.process.run(argv, { cwd, timeoutMs: MEASURE_MS })
}

/** The words after the program that does it (`rm`, `git`), past `sudo` and the like. */
function argsAfter(words: string[], program: string): string[] {
  const at = words.findIndex(word => word.replace(/^.*\//, '') === program)
  return at === -1 ? [] : words.slice(at + 1)
}

async function homeOf($: $) {
  const printed = await $.process.run(['printenv', 'HOME']).catch(() => undefined)
  return printed?.stdout.trim() ?? ''
}

async function rmRadius($: $, words: string[], cwd: string): Promise<string[]> {
  const args = argsAfter(words, 'rm')
  const afterFlags = args.indexOf('--')
  const targets = afterFlags === -1 ? args.filter(arg => !arg.startsWith('-')) : args.slice(afterFlags + 1)
  if (targets.length === 0) return ['No nombra qué borrar.']
  if (targets.some(target => target === '{}' || target.includes('$'))) {
    return ['Borra lo que le pase otro comando o una variable: no puedo saber qué de antemano.']
  }
  const home = await homeOf($)
  const found: string[] = []
  const missing: string[] = []
  // The targets as the command names them (a glob as written), where they match something
  const named: string[] = []
  for (const target of targets) {
    const path = home ? target.replace(/^~(?=\/|$)/, home) : target
    // Globs expand as the shell would, with nothing else of the shell: no splitting, no substitution
    const expanded = /[*?[]/.test(path)
      ? lines((await run($, ['bash', '-O', 'nullglob', '-c', 'IFS=; for p in $1; do printf "%s\\n" "$p"; done', '_', path], cwd)).stdout)
      : [path]
    let isMatched = false
    for (const one of expanded) {
      const exists = await run($, ['test', '-e', one], cwd)
      if (exists.exitCode === 0) {
        found.push(one)
        isMatched = true
      }
      else missing.push(one)
    }
    if (expanded.length === 0) missing.push(target)
    if (isMatched) named.push(target)
  }
  if (found.length === 0) return [`No existe: ${missing.join(', ')}. No borraría nada.`]
  // A relative path goes to find with ./ in front, so a name like -delete is a path, never an action
  const safe = found.map(path => (path.startsWith('/') || path.startsWith('.') ? path : `./${path}`))
  const files = lines((await run($, ['find', ...safe, '-type', 'f'], cwd)).stdout).map(file => file.replace(/^\.\//, '')).sort()
  const size = lines((await run($, ['du', '-sk', ...safe], cwd)).stdout).reduce((sum, line) => sum + (Number.parseInt(line, 10) || 0), 0)
  const where = named.join(', ')
  const out = [`Borraría ${files.length} archivo${files.length === 1 ? '' : 's'} (${kb(size)}) en ${where}:`, ...listed(files)]

  return missing.length > 0 ? [...out, `No existe: ${missing.join(', ')}.`] : out
}

/** The folder git runs in: `git -C dir` moves it from where the command stands. */
function gitArgs(words: string[]): { args: string[]; dir: string | null } {
  const args = argsAfter(words, 'git')
  if (args[0] === '-C' && args[1]) return { args: args.slice(2), dir: args[1] }
  return { args, dir: null }
}

async function resetRadius($: $, cwd: string): Promise<string[]> {
  const status = await run($, ['git', 'status', '--porcelain', '--untracked-files=no'], cwd)
  if (status.exitCode !== 0) return ['No está en un repositorio de git.']
  const files = lines(status.stdout).map(line => line.slice(3))
  if (files.length === 0) return ['No hay cambios sin commit: no se perdería nada.']
  const stat = (await run($, ['git', 'diff', '--shortstat', 'HEAD'], cwd)).stdout.trim()

  return [`Perdería los cambios sin commit de ${files.length} archivo${files.length === 1 ? '' : 's'}${stat ? ` (${stat})` : ''}:`, ...listed(files)]
}

async function checkoutRadius($: $, cwd: string): Promise<string[]> {
  const diff = await run($, ['git', 'diff', '--name-only'], cwd)
  if (diff.exitCode !== 0) return ['No está en un repositorio de git.']
  const files = lines(diff.stdout)
  if (files.length === 0) return ['No hay cambios sin guardar en el stage: no se perdería nada.']

  return [`Descartaría los cambios de ${files.length} archivo${files.length === 1 ? '' : 's'}:`, ...listed(files)]
}

async function cleanRadius($: $, args: string[], cwd: string): Promise<string[]> {
  // The same clean with -n in place of -f: what it would remove, removing nothing
  const dry = ['-n']
  for (let k = args.indexOf('clean') + 1; k < args.length; k += 1) {
    const arg = args[k]!
    if (arg === '--force' || arg === '-i' || arg === '--interactive') continue
    if (/^-[a-zA-Z]+$/.test(arg)) {
      const kept = arg.replace(/[fi]/g, '')
      if (kept !== '-') dry.push(kept)
    } else dry.push(arg)
  }
  const result = await run($, ['git', 'clean', ...dry], cwd)
  if (result.exitCode !== 0) return [`No pude simularlo: ${result.stderr.trim() || 'git clean falló'}.`]
  const paths = lines(result.stdout).map(line => line.replace(/^Would remove /, ''))
  if (paths.length === 0) return ['No hay archivos sin seguimiento que borrar.']

  // Folders come whole, with all they hold: elements, not files
  return [`Borraría ${paths.length} elemento${paths.length === 1 ? '' : 's'} sin seguimiento:`, ...listed(paths)]
}

async function pushRadius($: $, args: string[], cwd: string): Promise<string[]> {
  const named = args.slice(args.indexOf('push') + 1).filter(arg => !arg.startsWith('-'))
  const remote = named[0] ?? 'origin'
  let branch = named[1]?.replace(/^\+/, '').split(':').pop() ?? ''
  if (!branch || branch === 'HEAD') branch = (await run($, ['git', 'rev-parse', '--abbrev-ref', 'HEAD'], cwd)).stdout.trim()
  const ref = `refs/remotes/${remote}/${branch.replace(/^refs\/heads\//, '')}`
  const count = await run($, ['git', 'rev-list', '--count', `HEAD..${ref}`], cwd)
  if (count.exitCode !== 0) return [`No conozco ${remote}/${branch} (sin fetch): no sé qué commits sobrescribiría.`]
  const dropped = Number.parseInt(count.stdout, 10) || 0
  if (dropped === 0) return [`${remote}/${branch} no tiene commits que tu rama no tenga: no se perdería ninguno.`]
  const log = lines((await run($, ['git', 'log', '--oneline', `-${LISTED}`, `HEAD..${ref}`], cwd)).stdout)

  return [`Sobrescribiría ${dropped} commit${dropped === 1 ? '' : 's'} de ${remote}/${branch} que tu rama no tiene:`, ...listed(log)]
}

/** One line per thing the command would change, as best it can be measured from here. */
export async function measure($: $, part: LethalPart): Promise<string[]> {
  if (part.isRemote) return ['Corre en otra máquina por ssh: desde aquí no puedo medir qué tocaría.']
  if (part.sql) {
    const what = /^truncate/i.test(part.sql) ? 'Borra todas las filas' : 'Borra la estructura y todos sus datos'
    return [`Ejecutaría en la base: ${part.sql}.`, `${what}; sin respaldo no se recupera.`]
  }
  if (part.label === 'supabase db reset/push') {
    return part.words.includes('reset')
      ? ['Reinicia la base local: borra todos sus datos y vuelve a aplicar las migraciones.']
      : ['Aplica las migraciones locales a la base remota; no se deshacen solas.']
  }
  const sessionCwd = await $.session.cwd().catch(() => '.')
  const home = part.dir?.startsWith('~') ? await homeOf($) : ''
  const moved = part.dir ? part.dir.replace(/^~(?=\/|$)/, home) : null
  let cwd = moved ? (moved.startsWith('/') ? moved : `${sessionCwd}/${moved}`) : sessionCwd
  // A folder that isn't there can't be measured from; the command would fail there too, or land somewhere else
  const isThere = async (folder: string) => (await $.process.run(['test', '-d', folder]).catch(() => undefined))?.exitCode === 0
  try {
    if (!(await isThere(cwd))) return [`La carpeta ${part.dir ?? cwd} no existe: no puedo medir qué tocaría.`]
    if (part.label === 'rm -r') return await rmRadius($, part.words, cwd)
    const { args, dir } = gitArgs(part.words)
    if (dir) cwd = dir.startsWith('/') ? dir : `${cwd}/${dir}`
    if (dir && !(await isThere(cwd))) return [`La carpeta ${dir} no existe: no puedo medir qué tocaría.`]
    if (part.label === 'git reset --hard') return await resetRadius($, cwd)
    if (part.label === 'git checkout .') return await checkoutRadius($, cwd)
    if (part.label === 'git clean -f') return await cleanRadius($, args, cwd)
    if (part.label === 'git push --force') return await pushRadius($, args, cwd)
  } catch (error) {
    return [`No pude medir qué tocaría (${error instanceof Error ? error.message : String(error)}).`]
  }

  return []
}
