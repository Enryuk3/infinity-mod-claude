// Lo irreversible no pasa: Infinity lo detiene antes de que te toque.
const LETHAL: [RegExp, string][] = [
  [/\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b/, 'rm -r'],
  [/\bgit\s+reset\s+.*--hard\b/, 'git reset --hard'],
  [/\bgit\s+clean\s+(-[a-zA-Z]*f|--force)/, 'git clean -f'],
  [/\bgit\s+push\b(?!.*--force-with-lease).*(\s--force\b|\s-f\b|\s\+\S)/, 'git push --force'],
  [/\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/, 'git checkout .'],
  [/\bsupabase\s+db\s+(reset|push)\b/, 'supabase db reset/push'],
  [/\b(DROP\s+(TABLE|SCHEMA|DATABASE)|TRUNCATE\s+TABLE)\b/i, 'DROP/TRUNCATE'],
  // A bare TRUNCATE only where a statement starts (a string's opening, after a `;`) and ends there too; Tailwind's
  // `truncate` class, even first in class="…", is not one
  [/(?<!class(?:Name)?=[{]?)(^|["';]\s*)TRUNCATE\s+[\w.]+\s*(;|\bCASCADE\b|\bRESTART\b|$|["'])/i, 'DROP/TRUNCATE'],
]

/** The label of the first irreversible thing the command does, or null. */
export const lethal = (command: string) => LETHAL.find(([pattern]) => pattern.test(command))?.[1] ?? null
