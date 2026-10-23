// Lo irreversible no pasa: Infinity lo detiene antes de que te toque.

// Read with quoted text blanked out, so a search pattern, a commit message or an echoed line that only names one of
// these is not one
const SHELL: [RegExp, string][] = [
  [/\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b/, 'rm -r'],
  [/\bgit\s+reset\s+.*--hard\b/, 'git reset --hard'],
  [/\bgit\s+clean\s+(-[a-zA-Z]*f|--force)/, 'git clean -f'],
  [/\bgit\s+push\b(?!.*--force-with-lease).*(\s--force\b|\s-f\b|\s\+\S)/, 'git push --force'],
  [/\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/, 'git checkout .'],
  [/\bsupabase\s+db\s+(reset|push)\b/, 'supabase db reset/push'],
]

// SQL comes quoted or in a heredoc, so it is read whole, but only where a database client is there to run it
const SQL: [RegExp, string][] = [
  [/\b(DROP\s+(TABLE|SCHEMA|DATABASE)|TRUNCATE\s+TABLE)\b/i, 'DROP/TRUNCATE'],
  // A bare TRUNCATE only where a statement starts (a string's opening, after a `;`, a line) and ends there too
  [/(^|["';]\s*)TRUNCATE\s+[\w.]+\s*(;|\bCASCADE\b|\bRESTART\b|$|["'])/im, 'DROP/TRUNCATE'],
]
const DB_CLIENTS = new Set([
  'psql', 'pgcli', 'mysql', 'mariadb', 'sqlite3', 'duckdb', 'supabase', 'turso', 'clickhouse', 'clickhouse-client',
  'cockroach', 'mongosh', 'prisma', 'wrangler', 'bq', 'snowsql',
])

// Programs that run the string they are handed: that string is read as a command too
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'fish', 'ksh'])
// Words that run the command after them, so the program is the next word
const WRAPPERS = new Set(['sudo', 'env', 'time', 'nohup', 'command', 'exec', 'xargs', 'nice'])

// A command of the line: its text with quoted text blanked out, that quoted text apart, and its words as the shell
// hands them to the program, quotes taken off
type Segment = { bare: string; quoted: string[]; words: string[] }

/** Where the `$(…)` or backtick substitution opening at `i` ends, just past its close. */
function substitutionEnd(command: string, i: number): number {
  if (command[i] === '`') {
    const end = command.indexOf('`', i + 1)
    return end === -1 ? command.length : end + 1
  }
  let depth = 0
  for (let j = i; j < command.length; j += 1) {
    if (command.startsWith('$(', j)) {
      depth += 1
      j += 1
    } else if (command[j] === ')' && (depth -= 1) === 0) return j + 1
  }

  return command.length
}

/**
 * Splits a command line into the commands it runs (on `;`, `&`, `|`, newlines), each with its quoted text blanked out
 * and kept apart. A substitution runs even inside double quotes, so it stays in the open.
 */
function segments(command: string): Segment[] {
  const out: Segment[] = []
  let bare = ''
  let quoted: string[] = []
  let words: string[] = []
  let word = ''
  let isInWord = false
  const endWord = () => {
    if (isInWord) words.push(word)
    word = ''
    isInWord = false
  }
  let i = 0
  while (i < command.length) {
    const c = command[i]!
    if (c === '\\') {
      bare += command.slice(i, i + 2)
      word += command[i + 1] ?? ''
      isInWord = true
      i += 2
    } else if (c === "'") {
      const end = command.indexOf("'", i + 1)
      const stop = end === -1 ? command.length : end
      quoted.push(command.slice(i + 1, stop))
      word += command.slice(i + 1, stop)
      isInWord = true
      bare += "''"
      i = stop + 1
    } else if (c === '"') {
      let text = ''
      i += 1
      while (i < command.length && command[i] !== '"') {
        if (command[i] === '\\') {
          text += command[i + 1] ?? ''
          i += 2
        } else if (command.startsWith('$(', i) || command[i] === '`') {
          const end = substitutionEnd(command, i)
          bare += ` ${command.slice(i, end)} `
          text += command.slice(i, end)
          i = end
        } else {
          text += command[i]
          i += 1
        }
      }
      quoted.push(text)
      word += text
      isInWord = true
      bare += '""'
      i += 1
    } else if (c === ';' || c === '&' || c === '|' || c === '\n') {
      endWord()
      out.push({ bare, quoted, words })
      bare = ''
      quoted = []
      words = []
      i += 1
    } else {
      if (c === ' ' || c === '\t') endWord()
      else {
        word += c
        isInWord = true
      }
      bare += c
      i += 1
    }
  }
  endWord()
  out.push({ bare, quoted, words })

  return out.filter(s => s.bare.trim() !== '')
}

/** The program a segment runs: past variable assignments, and words that run what follows them and their flags. */
function programOf(bare: string): string {
  const words = bare.trim().split(/\s+/)
  let k = 0
  while (k < words.length && (/^\w+=/.test(words[k]!) || WRAPPERS.has(words[k]!) || words[k]!.startsWith('-'))) k += 1

  return (words[k] ?? '').replace(/^.*\//, '')
}

/**
 * The irreversible part of a command line: its label, the words of the command that does it, the folder an earlier
 * `cd` moved to, if any, and whether it runs on another machine (over ssh), where nothing can be measured from here.
 */
export type LethalPart = { label: string; words: string[]; dir: string | null; isRemote: boolean; sql: string | null }

function shellPart(command: string, depth: number, isRemote: boolean): LethalPart | null {
  let dir: string | null = null
  for (const { bare, quoted, words } of segments(command)) {
    const found = SHELL.find(([pattern]) => pattern.test(bare))
    if (found) return { label: found[1], words, dir, isRemote, sql: null }
    const program = programOf(bare)
    if (program === 'cd' || program === 'pushd') dir = words[1] ?? null
    // bash -c '…', eval '…', ssh host '…': the string they get is run
    const runsString = (SHELLS.has(program) && /\s-\w*c\b/.test(bare)) || program === 'eval' || program === 'ssh'
    if (!runsString || depth >= 3) continue
    for (const inner of quoted) {
      const part = shellPart(inner, depth + 1, isRemote || program === 'ssh')
      if (part) return { ...part, dir: part.dir ?? dir }
    }
  }

  return null
}

/** The first irreversible thing the command does, with what it takes to measure it, or null. */
export function lethalPart(command: string): LethalPart | null {
  const shell = shellPart(command, 0, false)
  if (shell) return shell
  const hasDatabase = segments(command).some(({ bare }) => DB_CLIENTS.has(programOf(bare)))
  if (!hasDatabase) return null
  for (const [pattern, label] of SQL) {
    const found = command.match(pattern)
    if (found) {
      // The statement itself, from its keyword to its end, to show what it would run
      const from = command.slice((found.index ?? 0) + found[0].search(/\S*(DROP|TRUNCATE)/i))
      const sql = from.split(/;|["'\n]/)[0]!.trim()
      return { label, words: [], dir: null, isRemote: false, sql }
    }
  }

  return null
}

/** The label of the first irreversible thing the command does, or null. */
export const lethal = (command: string) => lethalPart(command)?.label ?? null
