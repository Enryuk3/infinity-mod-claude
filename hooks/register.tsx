import type { AudioClip, EngineInterface, Register, Timer } from 'claude-code'

import { finishMurasaki, fireAka, fireAo, fireMurasaki, isCasting, keptScene, restoreScene, scene, toggleDomain } from './scene'
import { lethal, lethalPart } from './lethal'
import { measure } from './radius'
import { wordFor } from './words'
import { DESIGN_MODEL, DESIGN_SAMPLE, ELEVEN_API, ELEVEN_JA_MODEL, ELEVEN_MODEL, GOJO_VOICE, audioOf, createdVoice, firstPreview, firstVoice, lineHash, refusalOf } from './voice'
import { BAND_MAX_PX, COMPACT_ROWS, bandFrame, bandSvg, satoru, YUJI_WALK_MS } from './satoru'
import type { Mood, SessionState } from './satoru'

// Everything lives in the band above the prompt: Satoru, the techniques to its right, the domain behind
const BAND_RASTER = 'satoru'
// In the terminal: rows of half blocks, two pixels each, sized to the terminal's own Gojo, his body whole and his head
// shorter; a terminal too short for them (the band gets at most half of it) falls back to 8, Gojo at half size
const BAND_ROWS = COMPACT_ROWS
const SHORT_BAND_ROWS = 8
// On the desktop the band is pixels, not cells: tall enough for the whole sprite, wide enough for Murasaki's flight
const DESKTOP_COLUMNS = 192
const DESKTOP_ROWS = 30

// Warns once when the context passes this, and again only after it drops back under REARM.
const CONTEXT_ALERT = { at: 80, rearm: 70 }

const JP_VOICES = ['Reed (Japonés (Japón))', 'Eddy (Japonés (Japón))', 'Kyoko']

const READING_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'ToolSearch'])
const WRITING_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])
const ASKING_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])
// One-shot moods fall back once they have played
const HAPPY_MS = 2100
// A new conversation: Satoru is glad to see you, a little longer than a finished turn
const GREET_MS = 3500

// Said aloud and shown as a Mac notification when a turn ends, so you can step away while it works; Gojo's swagger
const DONE_LINES = [
  'Listo.',
  'Ya está. Fácil.',
  'Era de esperarse.',
  'Terminé. Ni siquiera tuve que quitarme la venda.',
]
// With the domain open the swagger is saved for one line, the only one he needs
const DOMAIN_DONE_LINES = ['Soy el más fuerte.']
const OOPS_MS = 1200
// The ✓ and the thumbs-up are a moment, then Gojo goes back to rest; the corner pips still say the turn is over
const DONE_MS = 4000

type $ = EngineInterface

let bandLoop: Timer | undefined
// Where the band was last drawn, which is what a blit repaints
let band = { requestId: '', columns: 0, rows: BAND_ROWS }
let isSatoruShown = true
let settle: Timer | undefined
let isContextAlerted = false
// The last turn ended with an answer: Satoru stays in its finished pose until you write again
let hasFinished = false
// What the turn did: reading and writing both end it with a quiet Purple
let hasRead = false
let hasWritten = false

// Every open conversation keeps a small file with its state beside the mods (not inside one, which would reload
// it); each session reads the others' to show how many are open and where each one is
const PRESENCE_MS = 3000
// A file not touched in this long is a conversation that closed without saying so
const STALE_MS = 12_000
// A file not touched in a day is forgotten: removed, so closed conversations don't pile up
const FORGET_MS = 24 * 60 * 60 * 1000
let presence: Timer | undefined
let sessionFile = ''
let othersKey = ''
// The desktop's SVG plays a couple of seconds ahead and loops. Each new one makes the app reload the band, which
// blinks, so it is sent again only when the look changes, or when a moving scene has played its frames out.
let desktopLoop: Timer | undefined
let pendingRedraw: Timer | undefined
let isDesktopShown = false
let lastDesktopDraw = 0
// A busy turn changes moods many times a second; at most one reload in this long
const DESKTOP_MIN_GAP_MS = 1000

function animateBand($: $) {
  if (bandLoop) return
  bandLoop = $.clock.every(60, async () => {
    if (band.columns === 0) return
    const blitted = await $.ui.blit({ requestId: band.requestId, key: BAND_RASTER, cells: bandFrame(band.columns, band.rows) })
    // Not mounted any more (hidden, or redrawn at another width): the next draw starts it again
    if (blitted.deny !== undefined) stopBand()
  })
}

/** Redraws the desktop's band soon, so a new mood or technique doesn't wait for the loop; changes close together share one reload. */
function redrawDesktop($: $) {
  if (!isDesktopShown || pendingRedraw) return
  const wait = Math.max(0, lastDesktopDraw + DESKTOP_MIN_GAP_MS - Date.now())
  pendingRedraw = $.clock.after(wait, () => {
    pendingRedraw = undefined
    $.ui.invalidate('ui.render')
  })
}

function stopDesktop() {
  desktopLoop?.cancel()
  desktopLoop = undefined
  pendingRedraw?.cancel()
  pendingRedraw = undefined
  isDesktopShown = false
}

/** The terminal draws the word as text under the pixels, which a blit doesn't reach: a new word draws the band again. */
function redrawWord($: $) {
  if (band.columns > 0) $.ui.invalidate('ui.render')
}

function stopBand() {
  bandLoop?.cancel()
  bandLoop = undefined
  band = { requestId: '', columns: 0, rows: BAND_ROWS }
}

function feel($: $, mood: Mood, ms?: number) {
  settle?.cancel()
  settle = undefined
  const hasChanged = satoru.mood !== mood
  satoru.mood = mood
  satoru.since = Date.now()
  if (ms !== undefined) {
    settle = $.clock.after(ms, () => {
      settle = undefined
      // A one-shot settling into a finished turn shows the ✓ for its moment too
      if (!scene.isWorking && hasFinished && mood !== 'done') return feel($, 'done', DONE_MS)
      const next = scene.isWorking ? 'thinking' : 'idle'
      if (satoru.mood !== next) {
        satoru.word = wordFor(next, satoru.word)
        redrawWord($)
        redrawDesktop($)
      }
      satoru.mood = next
    })
  }
  if (hasChanged) {
    satoru.word = wordFor(mood, satoru.word)
    redrawWord($)
    redrawDesktop($)
  }
}

const moodOf = (tool: string): Mood =>
  READING_TOOLS.has(tool) ? 'reading' : WRITING_TOOLS.has(tool) ? 'editing' : ASKING_TOOLS.has(tool) ? 'asking' : tool === 'Bash' ? 'running' : 'thinking'

/** AppleScript's string literal: backslashes and quotes escaped. */
const appleString = (text: string) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

// The desktop app opens one conversation by its own id (local_…), which it hands the session in this variable
const HOST_SESSION = /^local_[A-Za-z0-9-]{1,64}$/
// osascript's notifications open nothing when clicked; terminal-notifier's open a link, so clicking one goes to the
// conversation that finished. The app's PATH may lack Homebrew's, hence the full paths first
const NOTIFIERS = ['/opt/homebrew/bin/terminal-notifier', '/usr/local/bin/terminal-notifier', 'terminal-notifier']
let hostSession: string | null | undefined
const CLAUDE_APP = 'com.anthropic.claudefordesktop'
let isMac: boolean | undefined

/** osascript, lsappinfo and terminal-notifier exist only on macOS; elsewhere the engine's own notification stands in. */
async function onMac($: $) {
  if (isMac !== undefined) return isMac
  const uname = await $.process.run(['uname', '-s']).catch(() => undefined)
  isMac = uname?.stdout.trim() === 'Darwin'

  return isMac
}

// The engine plays clips with afplay, on macOS alone; Linux and WSL play them with ffplay, from ffmpeg
const FFPLAY = ['ffplay', '-nodisp', '-autoexit', '-loglevel', 'error']
const FFPLAY_MISSING = 127
let isFfplayMissingTold = false

function tellFfplayMissing($: $) {
  if (isFfplayMissingTold) return
  isFfplayMissingTold = true
  $.ui.toast('∞ Sin sonido: instala ffmpeg (sudo apt install ffmpeg).')
}

/**
 * Plays a clip at `gain` (linear, 0 to 4): the engine's player on macOS, ffplay elsewhere. Rejects when it can't play,
 * the clip missing included, as `$.audio.play` does, so a caller falls back the same way on every system.
 */
async function play($: $, clip: AudioClip, gain = 1) {
  if (await onMac($)) return $.audio.play(clip, { gain })
  const ffplay = [...FFPLAY, '-af', `volume=${gain}`]
  if ('asset' in clip) {
    const path = `${$.plugin.root}/${clip.asset}`
    if (!(await $.fs.exists(path))) throw new Error(`${clip.asset} no existe`)
    const played = await $.process.run([...ffplay, path], { timeoutMs: 120_000 }).catch(() => {
      tellFfplayMissing($)
      throw new Error('ffplay no está instalado')
    })
    if (played.exitCode !== 0) throw new Error(played.stderr.trim() || `ffplay salió con ${played.exitCode}`)
    return
  }
  if (!('base64' in clip)) throw new Error('solo se reproducen archivos del mod y audio en base64')
  // ffplay reads the decoded clip from its stdin; ffplay's own argv is fixed, so nothing of the clip reaches the shell
  const played = await $.process.run(['sh', '-c', `base64 -d | ${ffplay.join(' ')} -`], { stdin: clip.base64, timeoutMs: 120_000 })
  if (played.exitCode === FFPLAY_MISSING) tellFfplayMissing($)
  if (played.exitCode !== 0) throw new Error(played.stderr.trim() || `ffplay salió con ${played.exitCode}`)
}

/** Whether the Claude app is the one in front: then you see it finish, and a notification only gets in the way. */
async function isClaudeInFront($: $) {
  const front = await $.process.run(['lsappinfo', 'front']).catch(() => undefined)
  const asn = front?.stdout.trim()
  if (!asn) return false
  const info = await $.process.run(['lsappinfo', 'info', '-only', 'bundleid', asn]).catch(() => undefined)

  return info?.stdout.includes(`"${CLAUDE_APP}"`) ?? false
}

async function hostSessionId($: $) {
  if (hostSession !== undefined) return hostSession
  const printed = await $.process.run(['printenv', 'CLAUDE_CODE_HOST_SESSION_ID']).catch(() => undefined)
  const id = printed?.stdout.trim() ?? ''
  hostSession = HOST_SESSION.test(id) ? id : null

  return hostSession
}

/** A notification, only while you are away from Claude. On macOS, clicked it opens this very conversation (without terminal-notifier, a plain one); elsewhere the engine raises it, or a toast where it cannot. */
async function notifyDone($: $, line: string) {
  if (await isClaudeInFront($)) return
  const folder = (await $.session.cwd().catch(() => '')).split('/').filter(Boolean).pop()
  const title = folder ? `∞ Satoru terminó · ${folder}` : '∞ Satoru terminó'
  if (!(await onMac($))) {
    const sent = await $.ui.notify(line, { title }).catch(() => undefined)
    if (!sent?.isSent) $.ui.toast(`${title}: ${line}`)
    return
  }
  const id = await hostSessionId($)
  if (id) {
    for (const notifier of NOTIFIERS) {
      const sent = await $.process
        .run([notifier, '-title', title, '-message', line, '-open', `claude://code/continue?session=${id}`, '-group', id])
        .catch(() => undefined)
      if (sent?.exitCode === 0) return
    }
  }
  await $.process.run(['osascript', '-e', `display notification ${appleString(line)} with title ${appleString(title)}`])
}

/** Says the line aloud, naming the conversation by its folder when it has a real one; ElevenLabs first. */
async function sayDone($: $, line: string) {
  const folder = (await $.session.cwd().catch(() => '')).split('/').filter(Boolean).pop() ?? ''
  const name = folder.startsWith('scratch-') ? '' : folder.replace(/[-_.]+/g, ' ').trim()
  const text = name ? `${name}: ${line}` : line
  await sayEleven($, text)
}

// Satoru speaks only after a long turn and while you are away from Claude; short answers end in silence
const SPEAK_AFTER_MS = 60_000
let turnStartedAt = 0

/** Yuji's subagent answered: he walks back to Gojo, and once there he is gone. */
function yujiDone($: $, id: string) {
  const yuji = satoru.crew.find(y => y.id === id)
  if (!yuji || yuji.doneAt !== null) return
  yuji.doneAt = Date.now()
  redrawDesktop($)
  const gone = Math.max(yuji.doneAt, yuji.since + YUJI_WALK_MS) + YUJI_WALK_MS - Date.now()
  $.clock.after(gone + 100, () => {
    satoru.crew = satoru.crew.filter(y => y !== yuji)
    redrawDesktop($)
  })
}

/** Says the turn is over and raises a notification, since the desktop app has none of its own for plugins. */
async function announceDone($: $) {
  // In the domain the blindfold is off, so he keeps it short and leaves the blindfold out
  const lines = scene.isDomain ? DOMAIN_DONE_LINES : DONE_LINES
  const line = lines[Math.floor(Math.random() * lines.length)]!
  const isLong = Date.now() - turnStartedAt >= SPEAK_AFTER_MS
  if (isLong && !(await isClaudeInFront($).catch(() => false))) void sayDone($, line).catch(() => {})
  void notifyDone($, line).catch(() => {})
}

const myState = (): SessionState => (scene.isWorking ? 'working' : hasFinished ? 'done' : 'idle')
const STATE_ORDER: SessionState[] = ['working', 'done', 'idle']
const isSessionState = (value: unknown): value is SessionState => STATE_ORDER.includes(value as SessionState)

/**
 * Writes this conversation's state and reads everyone else's; the band redraws only when the others change. A
 * conversation that ends takes its file with it, and files left by ones that closed without saying so are removed.
 */
async function beat($: $, state: SessionState | 'ended' = myState()) {
  const dir = `${$.plugin.root}/../.infinity-sessions`
  if (!sessionFile) sessionFile = `${await $.session.id()}.json`
  // $.fs writes but doesn't remove: rm -f on named files, never a folder
  if (state === 'ended') {
    await $.process.run(['rm', '-f', `${dir}/${sessionFile}`])
    return
  }
  await $.fs.write(`${dir}/${sessionFile}`, JSON.stringify({ state }))
  const now = Date.now()
  const entries = await $.fs.list(dir)
  const forgotten = entries.filter(f => f.kind === 'file' && f.name.endsWith('.json') && now - f.mtimeMs > FORGET_MS)
  if (forgotten.length > 0) void $.process.run(['rm', '-f', ...forgotten.map(f => `${dir}/${f.name}`)]).catch(() => {})
  const fresh = entries.filter(f => f.kind === 'file' && f.name.endsWith('.json') && f.name !== sessionFile && now - f.mtimeMs < STALE_MS)
  const states = await Promise.all(
    fresh.map(f => $.fs.read(`${dir}/${f.name}`).then(text => (JSON.parse(String(text)) as { state?: unknown }).state).catch(() => undefined)),
  )
  const others = states.filter(isSessionState).sort((a, b) => STATE_ORDER.indexOf(a) - STATE_ORDER.indexOf(b))
  const key = others.join(',')
  if (key !== othersKey) {
    othersKey = key
    satoru.others = others
    redrawDesktop($)
  }
}

// Each line is generated once and kept on disk beside the mods, so a phrase said again costs nothing; any failure
// (no key, no network, no credit) answers false and the caller falls back to the system voice
let eleven: { key: string; voice: string } | null | undefined
// Told once per load why ElevenLabs refused, so a bad key or a missing permission doesn't fail in silence
let isElevenRefusalTold = false

function tellElevenRefusal($: $, why: string) {
  if (isElevenRefusalTold) return
  isElevenRefusalTold = true
  $.ui.toast(`∞ Satoru no puede hablar con ElevenLabs (${why}).`)
}

async function envOf($: $, name: string) {
  const printed = await $.process.run(['printenv', name]).catch(() => undefined)

  return printed?.exitCode === 0 ? printed.stdout.trim() : ''
}

const DESIGNED_VOICE = 'elevenlabs-voice'

/** Designs Satoru's own voice from a description, plays its preview and keeps it; the answer says how it went. */
async function designVoice($: $, description: string): Promise<string> {
  const key = await envOf($, 'ELEVENLABS_API_KEY')
  if (!key) return 'Falta ELEVENLABS_API_KEY en el bloque env de ~/.claude/settings.json.'
  if (description.length < 20) return 'Describe la voz con al menos 20 caracteres, o usa /voz sin nada para la de Gojo.'
  const headers = { 'xi-api-key': key, 'Content-Type': 'application/json' }
  const designed = await $.http.fetch(`${ELEVEN_API}/text-to-voice/design`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ voice_description: description, text: DESIGN_SAMPLE, model_id: DESIGN_MODEL }),
  })
  if (!designed.ok) return `ElevenLabs no pudo diseñarla (${refusalOf(designed.status, designed.text)}).`
  const preview = firstPreview(designed.text)
  if (!preview) return 'ElevenLabs no devolvió ninguna muestra.'
  if (preview.audio) void play($, { base64: preview.audio, mime: 'audio/mpeg' }).catch(() => {})
  const created = await $.http.fetch(`${ELEVEN_API}/text-to-voice`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ voice_name: 'Satoru', voice_description: description, generated_voice_id: preview.id }),
  })
  const voice = created.ok ? createdVoice(created.text) : ''
  if (!voice) return `ElevenLabs no pudo guardarla (${refusalOf(created.status, created.text)}).`
  await $.store.set(DESIGNED_VOICE, voice)
  // The next line looks the voice up again
  eleven = undefined
  isElevenRefusalTold = false

  return `Voz nueva guardada en tu cuenta como "Satoru" (${voice}). Escucha la muestra; si no te convence, /voz otra vez con otra descripción.`
}

/** The key and the voice, looked up once: settings, then the one /voz designed, then the account's first. */
async function elevenSettings($: $) {
  if (eleven !== undefined) return eleven
  const key = await envOf($, 'ELEVENLABS_API_KEY')
  // A voice set in settings wins, then the one /voz designed, then one of the account's default voices
  const designed = await $.store.get(DESIGNED_VOICE).catch(() => undefined)
  let voice = (await envOf($, 'ELEVENLABS_VOICE_ID')) || (typeof designed === 'string' ? designed : '')
  if (key && !voice) {
    const listed = await $.http.fetch(`${ELEVEN_API}/voices`, { headers: { 'xi-api-key': key } }).catch(() => undefined)
    voice = listed?.ok ? firstVoice(listed.text) : ''
    // The key can't list voices: new keys come without that permission, and without it no default voice is found
    if (listed && !listed.ok) tellElevenRefusal($, `${refusalOf(listed.status, listed.text)}; dale a la key el permiso Voices: Read`)
  }
  if (key && !voice) tellElevenRefusal($, 'no encontré ninguna voz en tu cuenta')
  eleven = key && voice ? { key, voice } : null

  return eleven
}

/** Says `text` in the ElevenLabs voice; false when it could not, so the caller speaks it some other way. */
async function sayEleven($: $, text: string, isJapanese = false, gain = 1): Promise<boolean> {
  try {
    const found = await elevenSettings($)
    if (!found) return false
    const model = isJapanese ? ELEVEN_JA_MODEL : ELEVEN_MODEL
    const file = `${$.plugin.root}/../.infinity-voices/${lineHash(`${found.voice}|${model}|${text}`)}.b64`
    let base64 = (await $.fs.exists(file)) ? String(await $.fs.read(file)) : ''
    if (!base64) {
      const made = await $.http.fetch(`${ELEVEN_API}/text-to-speech/${found.voice}/with-timestamps`, {
        method: 'POST',
        headers: { 'xi-api-key': found.key, 'Content-Type': 'application/json' },
        body: JSON.stringify(isJapanese ? { text, model_id: model, language_code: 'ja' } : { text, model_id: model }),
      })
      if (!made.ok) {
        tellElevenRefusal($, refusalOf(made.status, made.text))
        return false
      }
      base64 = audioOf(made.text)
      if (!base64) return false
      await $.fs.write(file, base64)
    }
    await play($, { base64, mime: 'audio/mpeg' }, gain)

    return true
  } catch {
    return false
  }
}

/**
 * The technique's line: sounds/<name>-voice.mp3 when there is one, so it needs no key nor network;
 * else Satoru's ElevenLabs voice, and without it the techniques keep their sound effects and stay silent.
 */
async function speak($: $, name: string, text: string) {
  try {
    await play($, { asset: `sounds/${name}-voice.mp3` }, TECHNIQUE_VOICE_GAIN)
    return
  } catch {}
  await sayEleven($, text, true, TECHNIQUE_VOICE_GAIN)
}

const TECHNIQUE_DUCKED_GAIN = 0.4
// The kya when Infinity blocks a command, at half volume: at full it startles
const KYA_GAIN = 0.5
// The techniques' voice, level with the effect under it and with Purple's own clip (gain runs 0 to 4)
const TECHNIQUE_VOICE_GAIN = 0.5

/**
 * A technique's sound, all in sounds/: a whole clip of its own (murasaki.mp3, domain.mp3) plays alone; without one,
 * <name>-effect.wav plays with <name>-voice.mp3 over it (ao, aka).
 */
async function cast($: $, name: string, voiceLine?: string) {
  try {
    await play($, { asset: `sounds/${name}.mp3` })
    return
  } catch {}
  // Under a spoken line the effect ducks, so the voice saying the technique's name comes through
  await Promise.all([
    play($, { asset: `sounds/${name}-effect.wav` }, voiceLine ? TECHNIQUE_DUCKED_GAIN : 0.7).catch(() => {}),
    voiceLine ? speak($, name, voiceLine).catch(() => {}) : undefined,
  ])
}

const BUSY = 'Espera, todavía hay una técnica en curso.'

// The domain is yours to close: kept in the store, a reload or a new conversation brings it back open
const KEPT_SCENE = 'scene'

/** Fires Murasaki, only once Blue and Red are both waiting. */
function murasaki($: $) {
  if (isCasting()) return BUSY
  if (!(scene.holdBlue && scene.holdRed)) {
    const missing = [!scene.holdBlue && '/ao', !scene.holdRed && '/aka'].filter(Boolean).join(' y ')
    return `Falta ${missing}: Púrpura necesita a Azul y Rojo.`
  }
  fireMurasaki()
  redrawDesktop($)
  void cast($, 'murasaki', '[calm, confident] きょしき… むらさき。')
  return 'Púrpura.'
}

function ao($: $) {
  if (isCasting()) return BUSY
  fireAo()
  redrawDesktop($)
  void cast($, 'ao', '[calm, confident] じゅつしきじゅんてん… あお。')
  return scene.holdRed ? 'Azul. Rojo te espera: /murasaki.' : 'Azul.'
}

function aka($: $) {
  if (isCasting()) return BUSY
  fireAka()
  redrawDesktop($)
  void cast($, 'aka', '[calm, confident] じゅつしきはんてん… あか。')
  return scene.holdBlue ? 'Rojo. Azul te espera: /murasaki.' : 'Rojo.'
}

async function checkContext($: $) {
  const usage = await $.session.usage()
  const { percent: reported, tokens, window } = usage.context
  const percent = reported ?? (tokens ? (tokens / window) * 100 : 0)
  if (percent >= CONTEXT_ALERT.at && !isContextAlerted) {
    isContextAlerted = true
    feel($, 'oops', OOPS_MS)
    $.ui.toast(`∞ Contexto al ${Math.round(percent)}%`)
  } else if (percent < CONTEXT_ALERT.rearm) {
    isContextAlerted = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await Promise.all([
      $.command.register({ name: 'ao', description: 'Azul: atrae todo hacia un punto y lo aplasta' }),
      $.command.register({ name: 'aka', description: 'Rojo: carga y lo repele todo con una onda expansiva' }),
      $.command.register({ name: 'murasaki', description: 'Púrpura: Azul y Rojo se funden y borran todo a su paso' }),
      $.command.register({ name: 'domain', description: 'Expansión de Dominio: Vacío Ilimitado (on/off)' }),
      $.command.register({ name: 'satoru', description: 'Muestra u oculta a Satoru sobre el input' }),
      $.command.register({ name: 'voz', description: 'Diseña la voz de Satoru en ElevenLabs (sin texto: la de Gojo)', argumentHint: '[descripción de la voz]' }),
    ])
    restoreScene((await $.store.get(KEPT_SCENE).catch(() => undefined)) as Parameters<typeof restoreScene>[0])
    // The domain used to pin a status line; a reload clears whatever is left of it
    $.ui.status(undefined)
    feel($, 'happy', GREET_MS)
    presence?.cancel()
    presence = $.clock.every(PRESENCE_MS, () => void beat($).catch(() => {}))
    void beat($).catch(() => {})
    void checkContext($).catch(() => {})

    return next(e)
  })

  on('command.run', { command: 'voz' }, async ($, e) => ({
    text: await designVoice($, e.args.trim() || GOJO_VOICE).catch(error => `No se pudo crear la voz: ${String(error)}`),
  }))
  on('command.run', { command: 'murasaki' }, async $ => ({ text: murasaki($) }))
  on('command.run', { command: 'ao' }, async $ => ({ text: ao($) }))
  on('command.run', { command: 'aka' }, async $ => ({ text: aka($) }))

  on('command.run', { command: 'domain' }, async $ => {
    const isOn = toggleDomain()
    void $.store.set(KEPT_SCENE, keptScene()).catch(() => {})
    if (isOn) void cast($, 'domain', '[calm, confident] りょういきてんかい… むりょうくうしょ。')
    redrawDesktop($)
  
    return { text: isOn ? 'Expansión de Dominio: Vacío Ilimitado.' : 'Dominio cerrado.' }
  })

  on('command.run', { command: 'satoru' }, async $ => {
    isSatoruShown = !isSatoruShown
    if (isSatoruShown) feel($, 'happy', HAPPY_MS)
    else {
      stopBand()
      stopDesktop()
    }
    $.ui.invalidate('ui.render')

    return { text: isSatoruShown ? '✻ Satoru está aquí.' : '✻ Satoru se fue a dormir.' }
  })

  on('session.end', async ($, e, next) => {
    presence?.cancel()
    presence = undefined
    await beat($, 'ended').catch(() => {})

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    scene.isWorking = true
    hasFinished = false
    hasRead = false
    hasWritten = false
    turnStartedAt = Date.now()
    feel($, 'thinking')
    void beat($).catch(() => {})

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      yujiDone($, e.agentId)
      return next(e)
    }
    scene.isWorking = false
    // A stopped turn takes its subagents with it: their Yuji come back
    if (e.isAborted) for (const yuji of satoru.crew) yujiDone($, yuji.id)
    hasFinished = !e.isAborted && e.reason === 'answer'
    if (hasFinished && hasRead && hasWritten && !isCasting()) finishMurasaki()
    feel($, hasFinished ? 'done' : 'idle', hasFinished ? DONE_MS : undefined)
    void beat($).catch(() => {})
    void checkContext($).catch(() => {})
    if (!e.isAborted && e.reason === 'answer') {
      void announceDone($).catch(() => {})
    }

    return next(e)
  })

  // Each subagent is Yuji or Megumi: he leaves Gojo's side when it starts and comes back when it answers
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.agentId !== undefined) {
      // Yuji goes first; Megumi when Yuji is already out; each keeps the first free spot until he is back
      const who = satoru.crew.some(y => y.who === 'yuji') && !satoru.crew.some(y => y.who === 'megumi') ? 'megumi' : 'yuji'
      let slot = 0
      while (satoru.crew.some(y => y.slot === slot)) slot += 1
      satoru.crew.push({ id: started.agentId, who, slot, since: Date.now(), doneAt: null })
      redrawDesktop($)
    }

    return started
  })

  // Lo irreversible no pasa sin ti: Infinity mide qué tocaría y te lo pregunta en el diálogo de permiso. Where nobody
  // can be asked (claude -p, a host without a person) the engine takes the ask as a refusal
  on('tool.check', async ($, e, next) => {
    const command = e.tool === 'Bash' ? (e.input as { command?: unknown }).command : undefined
    const part = typeof command === 'string' ? lethalPart(command) : null
    if (!part) return next(e)
    // Only a real call hits the ring, with a kya!; a query asks nothing of anyone
    if (e.tool_use_id !== undefined) {
      scene.infinitySince = Date.now()
      feel($, 'oops', OOPS_MS)
      void play($, { asset: 'sounds/kya.mp3' }, KYA_GAIN).catch(() => {})
    }
    const radius = await measure($, part).catch(() => ['No pude medir qué tocaría.'])

    return { decision: 'ask', reason: [`∞ Infinity: "${part.label}" es irreversible.`, ...radius].join('\n') }
  }).catch(($, e, next) => {
    // Fail closed: a check that broke, or one asked beneath its own measuring, lets nothing irreversible through
    const command = e.tool === 'Bash' ? (e.input as { command?: unknown }).command : undefined
    const label = typeof command === 'string' ? lethal(command) : null

    return label ? { decision: 'deny', reason: `∞ Infinity no pudo revisar "${label}", así que no lo deja pasar.` } : next(e)
  })

  on('tool.call', async ($, e, next) => {
    // A subagent's own calls are Yuji's work, not Gojo's: they don't change his face
    if (e.agentId !== undefined) return next(e)
    const isSpawn = e.tool === 'Agent'
    if (!isSpawn) feel($, moodOf(e.tool))
    const ran = await next(e)
    const hasFailed = ran.deny !== undefined || ran.isError === true
    if (!hasFailed && READING_TOOLS.has(e.tool)) hasRead = true
    if (!hasFailed && WRITING_TOOLS.has(e.tool)) hasWritten = true
    if (hasFailed && !isSpawn) feel($, 'oops', OOPS_MS)
    // Reading and writing hold their sphere until the next kind of work, so Blue and Red don't flicker per call
    else if (!isSpawn && !(satoru.mood === 'reading' || satoru.mood === 'editing')) feel($, 'thinking')

    return ran
  }).catch(($, e, next) => {
    // Fail closed: if this hook broke before the call ran, a lethal command still doesn't run
    const label = e.tool === 'Bash' ? lethal(e.command) : null

    return label && !next.called ? { deny: `∞ Infinity detuvo "${label}".` } : next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // A survey owns the band while it asks
    if (!isSatoruShown || e.props.hasSurvey) return next(e)
    if (e.surface === 'desktop') {
      const { Svg } = $.ui.resolve(e)
      const { source, redrawAt, height } = bandSvg(DESKTOP_COLUMNS, DESKTOP_ROWS)
      isDesktopShown = true
      lastDesktopDraw = Date.now()
      desktopLoop?.cancel()
      // A steady scene loops by itself and a technique plays whole in one drawing: draw again only once it has
      // settled, or when the blindfold goes back on
      desktopLoop = redrawAt === null
        ? undefined
        : $.clock.after(Math.max(0, redrawAt - Date.now()), () => {
          desktopLoop = undefined
          redrawDesktop($)
        })

      return <Svg source={source} alt="Satoru" width={BAND_MAX_PX} height={height} isInteractive />
    }
    // Only the terminal and the desktop draw pixels, so the other surfaces keep theirs
    if (e.surface !== 'terminal') return next(e)
    const { Box, Raster, Text } = $.ui.resolve(e)
    const columns = Math.max(40, Math.min(160, e.props.bodyColumns))
    // The word takes a row of its own under the band
    const rows = e.props.maxRows > BAND_ROWS ? BAND_ROWS : SHORT_BAND_ROWS
    if (columns !== band.columns || rows !== band.rows || e.requestId !== band.requestId) stopBand()
    band = { requestId: e.requestId, columns, rows }
    animateBand($)

    return (
      <Box flexDirection="column">
        <Raster key={BAND_RASTER} columns={columns} rows={rows} cells={bandFrame(columns, rows)} />
        {satoru.word ? <Text color="#f0a58a" italic>{`✻ ${satoru.word}`}</Text> : null}
      </Box>
    )
  })
}
