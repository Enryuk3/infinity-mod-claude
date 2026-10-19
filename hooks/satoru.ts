// Satoru Gojo in the band above the prompt; Ao, Aka and Murasaki play to its right.
// Half-block pixels: each cell is two stacked pixels, so they come out square.
import { AKA_MS, AO_MS, DOMAIN_CLOSE_MS, DOMAIN_OPEN_MS, INFINITY_MS, MURASAKI_MS, isCasting, scene } from './scene'

// Three states read at a glance: working (thinking, reading, editing, running, asking), stopped (idle) and finished
// (done: the turn is over and waits for you); happy and oops are one-shots that settle into one of them
export type Mood = 'idle' | 'thinking' | 'reading' | 'editing' | 'running' | 'asking' | 'happy' | 'oops' | 'done'

/** Where another open conversation is: working, finished and waiting for you, or stopped. */
export type SessionState = 'working' | 'done' | 'idle'

export const satoru = {
  mood: 'idle' as Mood,
  // When the mood started, for the one-shot animations (jump, shake)
  since: 0,
  // Subagents: a Yuji each, who walks off to do his task and comes back to Gojo only once it is done
  crew: [] as Yuji[],
  // The other open conversations, one pip each in the band's corner
  others: [] as SessionState[],
  // The curious word for the current mood, shown beside the band
  word: '',
}

const ORANGE = 0xd77757
const PALE = 0xf0a58a
const SIX_EYES = 0x5ac8ff
const DONE_GREEN = 0x4ade80
const PIP_IDLE = 0x6b7080
const BLUE = 0x3aa0ff
const BLUE_CORE = 0xc8ecff
const RED = 0xff3d5a
const RED_CORE = 0xffd0d6
const PURPLE = 0xa04bff
const PURPLE_CORE = 0xf0e0ff
const INFINITY_RING = 0xc9a7ff
const DEFAULT = 0x01000000


type Pixel = [number, number, number]

// Every steady motion repeats within this, so the desktop's SVG loops it without a seam
export const LOOP_MS = 3600
/** The angle `period` ms of motion comes round in, at time `t`. */
const cycle = (t: number, period: number) => ((t % period) / period) * Math.PI * 2
type Look = { dx: number; dy: number; isClosed: boolean }
/** Gojo's own gestures: where the blindfold sits, a hand pushing it up, the domain's hand sign, a hand in the pocket. */
type Cast = 'ao' | 'aka' | 'purple-sign' | 'purple-pinch' | 'purple-fire'
/** `isFocus` is the two raised fingers of Gojo concentrating, while a command runs. */
type Gesture = {
  blindfoldY: number | null
  isHandAtFace: boolean
  isSign: boolean
  isClasped: boolean
  isPocket: boolean
  isFocus: boolean
  cast: Cast | null
}
/** `isGasp` opens the mouth, startled when something fails. */
type Pose = { look: Look; armUp: [boolean, boolean]; legStep: 0 | 1 | null; face: number; gesture?: Gesture; isGasp?: boolean }

// The hand takes the blindfold off, and it goes back on when the fight is over
const LIFT_MS = 700
// A minute without techniques puts the blindfold back on
const BLINDFOLD_BACK_MS = 60_000
const LOWER_MS = 450
// After the lift, the hand sign holds while the void opens
const SIGN_MS = 1800

let veil = { isUnveiled: false, since: -Infinity }

// Where Satoru stands: its corner at rest, further in while Blue, Red or Purple is out, so Red fits on its left
const CORNER_X = 2
const FIGHT_X = 16
const STEP_IN_MS = 300
const STEP_OUT_MS = 550
let stance = { isFighting: false, since: -Infinity, from: 0 }

/**
 * How far Satoru has walked from its corner toward the fighting spot, 0 to 1, and whether it is still walking.
 */
function stanceAt(t: number) {
  // Only /ao and /aka (and the /murasaki they lead to) step out; working and the turn's quiet Purple stay home
  const isFighting = scene.holdBlue || scene.holdRed || t - scene.aoSince < AO_MS || t - scene.akaSince < AKA_MS
    || (t - scene.murasakiSince < MURASAKI_MS && !scene.isQuietPurple)
  const target = isFighting ? 1 : 0
  if (isFighting !== stance.isFighting) {
    // Turning back mid-walk starts from wherever it got to
    const was = stance
    const k = Math.min(1, (t - was.since) / (was.isFighting ? STEP_IN_MS : STEP_OUT_MS))
    stance = { isFighting, since: t, from: was.from + ((was.isFighting ? 1 : 0) - was.from) * k }
  }
  const k = Math.min(1, (t - stance.since) / (isFighting ? STEP_IN_MS : STEP_OUT_MS))
  const progress = stance.from + (target - stance.from) * (k * k * (3 - 2 * k))

  return { progress, isMoving: k < 1 && stance.from !== target }
}

// Your Gojo, 19 × 30: the lilac hair, the blindfold over the face, the high collar, the hands at the sides, the legs.
// o outline, L l hair, U uniform and blindfold, F f skin
const SPRITE = [
  '........o...o......',
  '....o..olo.oLo.....',
  '....oo.oLo.oLo..o..',
  '.o.olLolLloLLololo.',
  '.ololLLlLLlLLlLoLo.',
  'olllLLlLLllLlLLLLlo',
  '.oLllLLlLlLlLlLLllo',
  '.oLLLlLlLLLlLlLllo.',
  'olLlLlLLLLlLlLlLLlo',
  '.olLlLlLLLlLLLlLlo.',
  '.olLlLLLLlLLLlLLlo.',
  '..oUUUUUUUUUUUUUo..',
  '..oUUUUUUUUUUUUUo..',
  '..oUUUUUUUUUUUUUo..',
  '..ofUUUUfFfUUUUfo..',
  '...ofFFFFFFFFFfo...',
  '....ofFFFFFFFfo....',
  '......oUfffUo......',
  '.....ooUUUUUoo.....',
  '.....oUoooooUo.....',
  '....oUUUUoUUUUo....',
  '...oUUoUUoUUoUUo...',
  '...offoUUoUUoffo...',
  '....ooUoUoUoUoo....',
  '.....ooUUoUUoo.....',
  '.....ooooooooo.....',
  '.....oUUUUUUUo.....',
  '......oUo.oUo......',
  '......oUo.oUo......',
  '.......oo.oo.......',
]
export const SPRITE_W = 19
export const SPRITE_H = 30
// The terminal's Gojo: the whole body, a shorter head (hair 7 rows of 11, the blindfold and face whole), 24 rows. Of the
// two same legs rows the second stays, which the walk lifts
const GOJO_COMPACT = [0, 1, 3, 4, 5, 7, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 28, 29]
// Yuji and Megumi beside him, their hair cut the same way, keeping them a head shorter than him
const YUJI_COMPACT = [0, 1, 2, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 23, 24]
const MEGUMI_COMPACT = [0, 1, 2, 4, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]

/** A sprite's pixels with only the rows `keep` names, closed up: row keep[i] becomes row i. */
function keepRows(pixels: Pixel[], keep: number[]): Pixel[] {
  const at = new Map(keep.map((y, i) => [y, i]))
  return pixels.flatMap(([x, y, c]) => (at.has(y) ? [[x, at.get(y)!, c] as Pixel] : []))
}
// Room on the right for the arm thrown out firing Purple
const GRID_W = 27
// The head without the blindfold, rows 0 to 14: with the band gone the hair falls, rounder, its bangs over the brow
// and down the sides of the face; the eyes are drawn over it
const UNVEILED_HEAD = [
  '........o..........',
  '.......oLo.........',
  '......ooLLooo......',
  '..ooooLoLLLLooo....',
  '.olLLLLLLLLLLLLoo..',
  '.ooLLLlLLLLLLLLLLo.',
  '.ooLLLLLLLLLLLLLo..',
  'oLLLLLLLLLLLLLLLLo.',
  'ooLLLLLLlLLLLLLLLo.',
  '.oLLLLLLLLLLLLLLLo.',
  'oLLLLLLLLLLLFLLLLLo',
  '.oLLlLllLLlLFlLLLo.',
  '.olLllFlLlFlFFlLlo.',
  '.olFFFFFFFFFFFFFlo.',
  '..olFFFFFFFFFFFlo..',
]
// Without the blindfold the eyes are small and round, two by two, the light on their lower left
const EYE_ROWS = [13, 14]
const EYES_X = [5, 12]
const EYE = ['EE', 'wp']
const EYE_SHUT = ['FF', 'oo']

type ArmPose = 'focus' | 'pinch' | 'fire' | 'raised' | 'face'
// The right arm's poses, each drawn whole over the armless body as [row, first column, pixels], a space leaving what is
// there: the two raised fingers by the chin, the pinch before the chest, the arm thrown out from the shoulder
const ARM_SHAPES: Record<ArmPose, [number, number, string][]> = {
  // Up at the brow, the fingers over the blindfold's edge pushing it into the hair; the forearm runs up past the
  // cheek with its own outline, so the hand never reads as part of the face
  face: [
    [9, 14, 'ooo'],
    [10, 13, 'oFFFo'],
    [11, 14, 'oFFo'],
    [12, 15, 'ofFo'],
    [13, 15, 'oUUo'],
    [14, 15, 'oUUo'],
    [15, 15, 'oUUo'],
    [16, 15, 'oUUo'],
    [17, 15, 'oUUo'],
    [18, 15, 'oUUo'],
    [19, 14, 'UUUo'],
    [20, 14, 'UUo'],
    [21, 13, 'ooo'],
  ],
  // A thumbs-up, a wave, a question: short, the fist by the chin and the elbow bent at the shoulder
  raised: [
    [15, 16, 'o'],
    [16, 15, 'oFo'],
    [17, 15, 'oFFo'],
    [18, 15, 'ofFo'],
    [19, 14, 'UUUo'],
    [20, 14, 'UUo'],
    [21, 13, 'ooo'],
  ],
  focus: [
    [13, 16, 'oo'],
    [14, 15, 'oFFo'],
    [15, 15, 'oFFo'],
    [16, 15, 'ofFo'],
    [17, 15, 'oUUo'],
    [18, 15, 'oUUo'],
    [19, 14, 'UUUo'],
    [20, 14, 'UUo'],
    [21, 13, 'ooo'],
  ],
  pinch: [
    [18, 10, 'o'],
    [19, 9, 'oFo'],
    [20, 9, 'oFFUUUo'],
    [21, 9, 'ofFUUUo'],
    [22, 10, 'oooooo'],
  ],
  fire: [
    [17, 20, 'o'],
    [18, 14, 'ooooooFo'],
    [19, 14, 'UUUUUFFFo'],
    [20, 14, 'UUUUUfFFo'],
    [21, 13, 'ooooooooFo'],
    [22, 21, 'o'],
  ],
}
const SKIN = 0xf8e4b8
const SKIN_SHADE = 0xf4c47c
const SKIN_ALARM = 0xf29a8a
const OUTLINE = 0x0b0b0f
const GOJO_UNIFORM = 0x263434
const LILAC = 0xd6c8e8
const LILAC_SHADE = 0xb496d6
const EYE_LIGHT = 0xa8e6ff
const EYE_SHINE = 0xffffff
const MOUTH = 0x8a4a3a

/** Gojo, as [x, y, color] in sprite units; y 0 is the top of the hair. */
function gojoPixels(pose: Pose): Pixel[] {
  const gesture: Gesture = pose.gesture ?? { blindfoldY: 1, isHandAtFace: false, isSign: false, isClasped: false, isPocket: false, isFocus: false, cast: null }
  const grid = SPRITE.map(row => [...row.padEnd(GRID_W, '.')])
  const set = (x: number, y: number, c: string) => {
    if (grid[y] && x >= 0 && x < GRID_W) grid[y]![x] = c
  }

  // The blindfold: over the eyes as drawn, spiky hair above it, or off, the hair fallen over the bare face
  if (gesture.blindfoldY === null) {
    UNVEILED_HEAD.forEach((row, y) => (grid[y] = [...row.padEnd(GRID_W, '.')]))
    // The eyes move a pixel toward where they look
    const look = Math.sign(pose.look.dx)
    const eye = pose.look.isClosed ? EYE_SHUT : EYE
    for (const x of EYES_X) eye.forEach((line, j) => [...line].forEach((c, i) => set(x + look + i, EYE_ROWS[0]! + j, c)))
  }

  // Something failed: the mouth drops open
  if (pose.isGasp) set(9, 16, 'M')

  // The hands: at the sides as drawn, in the pockets, or clasped before the chest summoning Blue and Red
  const hideHand = (side: 'left' | 'right') => (side === 'left' ? [4, 5] : [13, 14]).forEach(x => set(x, 22, 'U'))
  let arm: ArmPose | null = null
  if (gesture.isClasped && !gesture.isHandAtFace) {
    hideHand('left')
    hideHand('right')
    ;[...'fFFFf'].forEach((c, i) => set(7 + i, 21, c))
  } else {
    if (gesture.isPocket) hideHand('left')
    if (gesture.isHandAtFace && gesture.blindfoldY !== null) arm = 'face'
    else if (gesture.cast === 'purple-pinch') arm = 'pinch'
    else if (gesture.cast === 'purple-fire') arm = 'fire'
    else if (gesture.isSign || gesture.isFocus || gesture.cast === 'purple-sign') arm = 'focus'
    else if (pose.armUp[1]) arm = 'raised'
    else if (gesture.isPocket) hideHand('right')
  }
  if (arm) {
    // The arm leaves his side: its hanging sleeve and hand are gone, so it never shows twice, and the torso keeps the
    // same straight edge as on his left
    for (let y = 21; y <= 22; y += 1) for (let x = 13; x <= 15; x += 1) set(x, y, '.')
    set(14, 23, '.')
  }
  if (arm) {
    // Every arm pose is drawn whole, outline and all, over the armless body
    for (const [y, x0, row] of ARM_SHAPES[arm]) [...row].forEach((c, i) => c !== ' ' && set(x0 + i, y, c))
  }

  // Walking lifts one leg: its foot comes up a row
  if (pose.legStep !== null) {
    const x0 = pose.legStep === 0 ? 6 : 10
    for (let i = 0; i < 3; i += 1) set(x0 + i, 28, 'o'), set(x0 + i, 29, '.')
  }

  const colors: Record<string, number> = {
    o: OUTLINE, U: GOJO_UNIFORM, L: LILAC, l: LILAC_SHADE, F: pose.face, f: SKIN_SHADE, E: SIX_EYES, p: EYE_LIGHT, w: EYE_SHINE, M: MOUTH,
  }
  const out: Pixel[] = []
  grid.forEach((row, y) => row.forEach((c, x) => c !== '.' && out.push([x, y, colors[c]!])))

  return out
}

function castAt(t: number): Cast | null {
  const mu = (t - scene.murasakiSince) / MURASAKI_MS
  if (mu >= 0 && mu < 1) return mu < 0.3 ? 'purple-sign' : mu < 0.5 ? 'purple-pinch' : 'purple-fire'
  const ao = (t - scene.aoSince) / AO_MS
  if (ao >= 0 && ao < 1) return 'ao'
  const aka = (t - scene.akaSince) / AKA_MS
  if (aka >= 0 && aka < 1) return 'aka'

  return null
}

/** Where the blindfold is now: over the eyes (1) or off (null), and whether the hand is at it. */
function blindfoldAt(t: number): { y: number | null; isHandAtFace: boolean } {
  // The blindfold comes off with the first technique and stays off while the fight goes on; it goes back on
  // only after a quiet minute, so lifting it is a moment, not a tic." The domain keeps it off for as long as it stays open
  const lastFight = Math.max(
    scene.aoSince + AO_MS,
    scene.akaSince + AKA_MS,
    scene.murasakiSince + MURASAKI_MS,
    scene.isDomain ? t : scene.domainSince,
  )
  const isUnveiled = scene.isDomain || scene.holdBlue || scene.holdRed || t - lastFight < BLINDFOLD_BACK_MS
  // The first drawing after a load finds Gojo as he already was: a domain still open shows him without the
  // blindfold, not taking it off again
  if (veil.since === -Infinity) veil = { isUnveiled, since: -Infinity }
  else if (isUnveiled !== veil.isUnveiled) veil = { isUnveiled, since: t }
  const p = (t - veil.since) / (isUnveiled ? LIFT_MS : LOWER_MS)
  if (p >= 1) return { y: isUnveiled ? null : 1, isHandAtFace: false }
  // The hand comes up to the blindfold and takes it off; lowering it puts it straight back over the eyes
  if (isUnveiled) return { y: p < 0.5 ? 1 : null, isHandAtFace: p > 0.15 }
  return { y: 1, isHandAtFace: false }
}

// Yuji, the subagents' look: your drawing, 19 × 25, five rows shorter than Gojo. o outline, P p hair, k the dark
// sides, F skin, W B the eyes' light and lower half, R r the hood, N n the uniform, Y the button, S the shoes
const YUJI = [
  '........o...o......',
  '.......oPoooPo.....',
  '.....oopPPPPPpoo...',
  '...ooPPPPPPPPPPPoo.',
  '..oPPPPPPPPPpPPPPPo',
  '.oPPPPPpPPpPPPPPPPo',
  '..oPPPpFPpFpPpPpPPo',
  '.oPpPpFFpFFFpFpFpPo',
  '..oppFFFFFFFFFFFppo',
  '..okkFFFFFFFFFFFkko',
  '..oFkFooFFFFFooFkFo',
  '..oFkFWoFFFFFWoFkFo',
  '...ooFBBFFFFFBBFoo.',
  '....oFFFFFFFFFFFo..',
  '.....orRRrRRRrro...',
  '.....ooRRrrRrroo...',
  '.....oNNNNNNYNNo...',
  '....oNoNNNNNNNoNo..',
  '....oRoNNNNNNNoRo..',
  '....oFonnnnnnnoFo..',
  '.....ooooooooooo...',
  '......oNNNoNNNo....',
  '.......oNo.oNo.....',
  '.......oSo.oSo.....',
  '.......ooo.ooo.....',
]
export const YUJI_W = 19
export const YUJI_H = 25
const YUJI_COLORS: Record<string, number> = {
  o: OUTLINE, P: 0xefb0b6, p: 0xa8636c, k: 0x3a2826, F: 0xfbe6c4, W: 0xffffff, B: 0x6b3f2c,
  R: 0xe0484c, r: 0xb52f35, N: 0x3b4a9a, n: 0x2b3778, Y: 0xc9a94a, S: 0x8a2a2a, y: 0xffe27a,
}

// Room on his right for the punch and its spark
export const YUJI_GRID_W = 23

/**
 * A subagent on the band: who goes (Yuji, or Megumi when Yuji is already out), the spot he keeps until he is back,
 * when it started, and when it finished, null while it works.
 */
export type Yuji = { id: string; who: 'yuji' | 'megumi'; slot: number; since: number; doneAt: number | null }

// Megumi, the second subagent's look: your drawing, 24 × 25 like Yuji's height. o outline, K G hair, F skin, n W E
// the eyes, N the uniform, Y the buttons, S the shoes; v his shadows
const MEGUMI = [
  '.............oo.........',
  '......oooo..oKo.........',
  '.......oKKooKKooooooo...',
  '......oKKKKoKKoKKKKo....',
  '..ooooKKGGKKKKKKKKo.....',
  '....oooKGKKGKKGKGKKKoo..',
  '....oKKGKKKGKKGKKGoKKKo.',
  '.oKKKoKKKKKKKKKKKKooo...',
  '..oooKKKKoKKKoKKoKKooo..',
  '...ooKKKoFoKoFKoFoKoooo.',
  '..ooooKoFFoKoFoFFoKooo..',
  '...ooFKFnnFoFFFnnFKFo...',
  '....oFoFWnFFFFFWnFoFoo..',
  '.....ooFEEFFFFFEEFooo...',
  '......oFFFFFFFFFFFo.....',
  '.......oNNNNNNoNNo......',
  '........ooNNNYooo.......',
  '.......oNNNNNNoNNo......',
  '......oNoNNNNNYNoNo.....',
  '......oNoNNNNNoNoNo.....',
  '......oFoNNNNNoNoFo.....',
  '.......ooooooooooo......',
  '........oNNNoNNNo.......',
  '.........oSo.oSo........',
  '.........ooo.ooo........',
]
export const MEGUMI_W = 24
// Room on his right for the Divine Dog rising from his shadow
export const MEGUMI_GRID_W = 32
// The Divine Dog: ears up, white eyes, its body still half in the shadow
const DIVINE_DOG = [
  '.o.....o.',
  'oDo...oDo',
  'oDDoooDDo',
  'oDWDDDWDo',
  'oDDDDDDDo',
  '.oDDDDDo.',
]
const MEGUMI_COLORS: Record<string, number> = {
  o: OUTLINE, K: 0x1c2030, G: 0x4a5470, F: 0xfbe2c8, n: 0x1e2550, W: 0xffffff, E: 0x4a64b8, N: 0x3c3c96,
  Y: 0xc2a250, S: 0x5a4628, v: 0x2a1745, D: 0x16131f, h: 0xd9c7a8,
}

/**
 * Megumi, as [x, y, color] in sprite units: walking lifts one foot; working he holds the Ten Shadows' sign, both
 * hands together before the chest, and the Divine Dog rises out of the shadow pooled at his feet.
 */
function megumiPixels(legStep: 0 | 1 | null, isWorking: boolean, beat: boolean): Pixel[] {
  const grid = MEGUMI.map(row => [...row.padEnd(MEGUMI_GRID_W, '.')])
  const set = (x: number, y: number, c: string) => {
    if (grid[y] && x >= 0 && x < MEGUMI_GRID_W) grid[y]![x] = c
  }
  if (legStep !== null) {
    const x0 = legStep === 0 ? 9 : 13
    for (let i = 0; i < 3; i += 1) set(x0 + i, YUJI_H - 2, 'o'), set(x0 + i, YUJI_H - 1, '.')
  }
  if (isWorking) {
    // The arms bend at the elbow and the forearms come in across the waist, outlined above and below, to the hands
    // meeting in the middle, fingers up, the knuckles shaded: the dog's sign
    set(7, 20, 'o'), set(17, 20, 'o')
    for (const x of [8, 9, 10, 14, 15, 16]) set(x, 18, 'o'), set(x, 19, 'N'), set(x, 20, 'o')
    for (const [x, y, c] of [[11, 18, 'F'], [12, 18, 'F'], [11, 19, 'h'], [12, 19, 'h']] as const) set(x, y, c)
    for (const [x, y] of [[11, 17], [12, 17], [11, 20], [12, 20]] as const) set(x, y, 'o')
    // His shadow pools wide at his feet and reaches the dog
    const y0 = YUJI_H - 1
    for (let x = 5; x <= 29; x += 1) if (grid[y0]![x] === '.') set(x, y0, 'v')
    for (let x = 19; x <= 29; x += 1) set(x, y0 - 1, 'v')
    // The Divine Dog rising out of it, a row lower on the off beat as it breathes
    const top = y0 - 1 - DIVINE_DOG.length + (beat ? 0 : 1)
    DIVINE_DOG.forEach((line, j) => [...line].forEach((c, i) => c !== '.' && set(20 + i, top + j, c)))
  }
  const out: Pixel[] = []
  grid.forEach((row, y) => row.forEach((c, x) => c !== '.' && out.push([x, y, MEGUMI_COLORS[c]!])))

  return out
}
// Walking off to work, and back to Gojo once done
export const YUJI_WALK_MS = 1200
// Punching while he works: the fist out, then back, a beat each
const PUNCH_MS = 300

/**
 * Yuji, as [x, y, color] in sprite units; walking lifts one foot a row, as Gojo's does, and working he throws
 * Divergent Fist to the right, a spark where it lands.
 */
function yujiPixels(legStep: 0 | 1 | null, isPunching = false): Pixel[] {
  const grid = YUJI.map(row => [...row.padEnd(YUJI_GRID_W, '.')])
  const set = (x: number, y: number, c: string) => {
    if (grid[y] && x >= 0 && x < YUJI_GRID_W) grid[y]![x] = c
  }
  if (legStep !== null) {
    const x0 = legStep === 0 ? 7 : 11
    for (let i = 0; i < 3; i += 1) set(x0 + i, YUJI_H - 2, 'o'), set(x0 + i, YUJI_H - 1, '.')
  }
  if (isPunching) {
    // The right arm straight out at the chest, the red cuff, the fist
    for (const [x, c] of [[15, 'N'], [16, 'N'], [17, 'R'], [18, 'F']] as const) set(x, 18, c)
    for (let x = 15; x <= 18; x += 1) set(x, 17, 'o'), set(x, 19, 'o')
    set(19, 18, 'o'), set(15, 17, 'o'), set(14, 19, 'o')
    // The spark of the hit
    for (const [x, y] of [[21, 16], [20, 18], [22, 18], [21, 20]] as const) set(x, y, 'y')
  }
  const out: Pixel[] = []
  grid.forEach((row, y) => row.forEach((c, x) => c !== '.' && out.push([x, y, YUJI_COLORS[c]!])))

  return out
}

/** Writing and reading: the moods that hold a sphere while the turn works. */
const isWorkHold = (mood: Mood) => mood === 'editing' || mood === 'reading'

function poseFor(mood: Mood, t: number, since: number): { pose: Pose; dx: number; dy: number } {
  const blink = t % 3600 < 140
  const look: Look = { dx: 0, dy: 0, isClosed: blink }
  const blindfold = blindfoldAt(t)
  const isFighting = isCasting(t) || scene.holdBlue || scene.holdRed
  const signSince = t - scene.domainSince - LIFT_MS
  const cast = castAt(t)
  // Gojo never hurries: writing holds Blue and reading holds Red, both quietly, between the clasped hands
  const isHolding = scene.isWorking && isWorkHold(mood) && cast === null && !scene.isDomain
  const gesture: Gesture = {
    blindfoldY: blindfold.y,
    isHandAtFace: blindfold.isHandAtFace,
    isSign: scene.isDomain && signSince >= 0 && signSince < SIGN_MS,
    // Hands stay together while Blue or Red is summoned or waiting; Purple takes the right arm
    isClasped: cast === 'ao' || cast === 'aka' || (cast === null && (scene.holdBlue || scene.holdRed)) || isHolding,
    // At rest and while thinking, a hand in the pocket and a slow sway
    isPocket: (mood === 'idle' || mood === 'thinking') && !isFighting && !scene.isDomain,
    isFocus: mood === 'running' && cast === null && !scene.isDomain,
    cast,
  }
  const pose: Pose = { look, armUp: [false, false], legStep: null, face: SKIN, gesture }
  let dx = gesture.isPocket && Math.sin(cycle(t, 3600)) > 0.45 ? 1 : 0
  // Feet on the ground: no hopping in place, whatever the mood
  const dy = 0

  if (mood === 'thinking') {
    look.dx = Math.floor(t / 900) % 2 === 0 ? -1 : 1
  } else if (mood === 'reading') {
    // Eyes sweep left to right as if reading a line, when the blindfold is up
    look.dx = [-1, 0, 1, 0][Math.floor(t / 300) % 4]!
    look.isClosed = false
  } else if (mood === 'asking') {
    pose.armUp = [false, Math.floor(t / 600) % 2 === 0]
    look.isClosed = false
  } else if (mood === 'happy') {
    // A relaxed wave, no jumping
    pose.armUp = [false, Math.floor((t - since) / 350) % 2 === 0]
    look.isClosed = false
  } else if (mood === 'done') {
    // Finished: a thumbs-up held high, still, until you write again
    pose.armUp = [false, true]
    look.isClosed = false
  } else if (mood === 'oops') {
    dx = Math.floor(t / 60) % 2 === 0 ? -1 : 1
    pose.face = t - since < 700 ? SKIN_ALARM : SKIN
    pose.isGasp = true
  }
  // Firing Purple, the eyes follow it out to the right, whatever the mood was looking at
  if (cast !== null && cast.startsWith('purple')) {
    look.dx = 1
    look.isClosed = false
  }

  return { pose, dx, dy }
}

type Canvas = { W: number; H: number; put: (x: number, y: number, color: number) => void }

function orb({ put }: Canvas, cx: number, cy: number, r: number, color: number, core: number) {
  if (r <= 0) return
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y += 1) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x += 1) {
      const d = Math.hypot(x - cx, y - cy)
      if (d <= r) put(x, y, d <= r * 0.45 ? core : color)
    }
  }
}

function ring({ put }: Canvas, cx: number, cy: number, r: number, color: number) {
  const steps = Math.max(12, Math.round(r * 7))
  for (let k = 0; k < steps; k += 1) {
    const a = (k / steps) * Math.PI * 2
    put(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), color)
  }
}

/** Whether the turn's quiet sphere for `mood` shows: writing's Blue or reading's Red, while the turn works. */
const isWorkOrb = (mood: Mood, now: number) =>
  scene.isWorking && satoru.mood === mood && !isCasting(now) && !scene.isDomain

/**
 * Ao pulls everything in, Aka pushes everything out, Murasaki fuses them and fires from Satoru's hand. Sizes are in
 * `u`, a tenth of the band's height, so the effects keep their proportions at any resolution.
 */
function techniques(canvas: Canvas, now: number, leftX: number, handX: number, u: number) {
  const { W, H } = canvas
  const cy = (H - 1) / 2
  // Red to Satoru's left, Blue to its right, the way the anime frames them
  const rx = leftX - 8 * u
  const bx = handX + 9 * u

  const ao = (now - scene.aoSince) / AO_MS
  if (ao >= 0 && ao < 1) {
    // Particles spiral in from the whole zone while the sphere grows
    for (let i = 0; i < 14; i += 1) {
      const a = i * 2.4 + ao * 7
      const d = (1 - ((ao * 1.6 + i / 14) % 1)) * 16 * u
      orb(canvas, bx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6, u * 0.4, i % 3 === 0 ? BLUE_CORE : BLUE, BLUE_CORE)
    }
    orb(canvas, bx, cy, Math.min(3, ao * 5) * u, BLUE, BLUE_CORE)
  } else if (scene.holdBlue || isWorkOrb('editing', now)) {
    orb(canvas, bx, cy, (2 + Math.sin(cycle(now, 1200)) * 0.5) * u, BLUE, BLUE_CORE)
    for (let k = 0; k < 3; k += 1) {
      const a = cycle(now, 1800) + (k * Math.PI * 2) / 3
      orb(canvas, bx + Math.cos(a) * 4 * u, cy + Math.sin(a) * 3 * u, u * 0.4, BLUE_CORE, BLUE_CORE)
    }
  }

  const aka = (now - scene.akaSince) / AKA_MS
  if (aka >= 0 && aka < 1) {
    // Shockwaves push out from the sphere
    for (let k = 0; k < 3; k += 1) {
      const r = ((aka * 2.5 + k / 3) % 1) * 18 * u
      ring(canvas, rx, cy, r, k === 0 ? RED_CORE : RED)
    }
    orb(canvas, rx, cy, Math.min(3, aka * 5) * u, RED, RED_CORE)
  } else if (scene.holdRed) {
    orb(canvas, rx, cy, (2 + (Math.floor(now / 100) % 3 === 0 ? 0.6 : 0)) * u, RED, RED_CORE)
  } else if (isWorkOrb('reading', now)) {
    // Reading's Red breathes slowly instead of flickering: it is held, not fired; at home there is no room on the
    // left, so it waits where Blue would
    orb(canvas, bx, cy, (2 + Math.sin(cycle(now, 1200)) * 0.5) * u, RED, RED_CORE)
  }

  const mu = (now - scene.murasakiSince) / MURASAKI_MS
  if (mu >= 0 && mu < 1) {
    const mx = handX + 2 * u
    if (mu < 0.3) {
      // Blue and Red rush to Satoru's hand and meet
      const k = mu / 0.3
      orb(canvas, bx + (mx - 3 * u - bx) * k, cy, 2 * u, BLUE, BLUE_CORE)
      orb(canvas, rx + (mx + 3 * u - rx) * k, cy, 2 * u, RED, RED_CORE)
    } else if (mu < 0.5) {
      const k = (mu - 0.3) / 0.2
      orb(canvas, mx, cy, (1 + k * 3) * u, PURPLE, PURPLE_CORE)
    } else {
      // Fired: the sphere crosses the band and leaves a fading wake that erases everything behind it
      const k = (mu - 0.5) / 0.5
      const head = mx + k * (W - mx + 12 * u)
      const fade = 1 - k
      const half = Math.round(u)
      for (let x = Math.round(mx); x < Math.min(W, head); x += 1) {
        for (let dy = -half; dy <= half; dy += 1) {
          const isCore = Math.abs(dy) < half / 2 + 0.5
          if (isCore || fade > 0.4) canvas.put(x, Math.round(cy) + dy, isCore ? PURPLE_CORE : PURPLE)
        }
      }
      orb(canvas, head, cy, 4 * u, PURPLE, PURPLE_CORE)
    }
  }
}

// A cheap, steady per-pixel random: which pixels of the void are stars, and how they twinkle
const hash = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

/** How far the void reaches from Satoru, in pixels: grows as the domain opens, shrinks as it closes. */
function voidRadius(now: number, full: number) {
  const k = (now - scene.domainSince) / (scene.isDomain ? DOMAIN_OPEN_MS : DOMAIN_CLOSE_MS)
  if (scene.isDomain) return full * Math.min(1, Math.max(0, k)) ** 0.7
  return k >= 1 ? 0 : full * (1 - Math.max(0, k))
}

const VOID_SKY = 0x0b0718

/**
 * Unlimited Void behind everything: a dark sky of stars and streams of information flowing past. Once it fills the
 * band the sky itself is left out, and true comes back so the frame lays it as one rectangle.
 */
function voidBackdrop({ W, H, put }: Canvas, now: number, cx: number, cy: number, u: number, reach: number): boolean {
  const radius = voidRadius(now, reach)
  if (radius <= 0) return false
  const isFull = radius >= Math.hypot(W, H) * 0.98
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const d = Math.hypot(x - cx, (y - cy) * 2)
      if (d > radius) continue
      const h = hash(x, y)
      // The edge of the opening void glows
      if (radius - d < 2.5 * u && radius < Math.hypot(W, H) * 0.98) {
        put(x, y, 0xc8b0ff)
        continue
      }
      const twinkle = Math.sin(cycle(now, 1800) + h * 40)
      if (h > 0.965 && twinkle > -0.2) put(x, y, twinkle > 0.7 ? 0xffffff : h > 0.985 ? 0x8fd8ff : 0xb9a6ff)
      else {
        // Information streams: faint dashes racing to the right, one lane per few rows
        // A lane's length every 600ms, six lanes' patterns, so the streams come round every LOOP_MS
        const shift = x + (now % LOOP_MS) * 23 / 600
        const lane = y % 3 === 0 ? shift % 23 : -1
        if (lane >= 0 && lane < 4 && hash(Math.floor(shift / 23) % 6, y) > 0.55) put(x, y, 0x2a1f55)
        else if (!isFull) put(x, y, VOID_SKY)
      }
    }
  }

  return isFull
}

/** Infinity: a ring turns around Satoru for a moment, nothing gets through. */
function infinityRing({ put }: Canvas, now: number, cx: number, cy: number, rx: number, ry: number) {
  const k = (now - scene.infinitySince) / INFINITY_MS
  if (k < 0 || k >= 1) return
  const grow = Math.min(1, k * 4)
  const steps = Math.round(rx * 6)
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2 + now / 300
    // Dashed: the ring visibly turns
    if (Math.floor((i / steps) * 16) % 2 === 1) continue
    put(Math.round(cx + Math.cos(a) * rx * grow), Math.round(cy + Math.sin(a) * ry * grow), k > 0.8 && i % 3 === 0 ? 0xffffff : INFINITY_RING)
  }
}

/**
 * The band at `now`, in three layers: what is behind Gojo and what is in front of him as W × H pixels, row by row
 * (a color each, -1 where nothing is drawn), and Gojo and Yuji apart, so the SVG draws each of their poses once.
 */
type Sprite = { pixels: Pixel[]; x: number; y: number; scale: number; w: number; h: number }
type Layers = { under: Int32Array; over: Int32Array; sprites: Sprite[]; isVoidFull: boolean; voidAt: [number, number] }

/**
 * `reach` is how far the void opens: the band's own corners, or further where the drawing goes on past the band.
 * `isCompact` draws the terminal's shorter Gojo, Yuji and Megumi.
 */
function paintBand(W: number, H: number, now: number, reach = Math.hypot(W, H), isCompact = false): Layers {
  const under = new Int32Array(W * H).fill(-1)
  const over = new Int32Array(W * H).fill(-1)
  let buf = under
  const put = (x: number, y: number, color: number) => {
    if (x >= 0 && y >= 0 && x < W && y < H) buf[y * W + x] = color
  }
  const block = (x: number, y: number, s: number, color: number) => {
    for (let i = 0; i < s; i += 1) for (let j = 0; j < s; j += 1) put(x + i, y + j, color)
  }
  const canvas: Canvas = { W, H, put }

  // The band's unit, a tenth of its height: the effects, the marks and the walk are sized in it
  const u = H / 10
  // A pixel of the sprite: one at 30 rows, more on a taller band
  const scale = Math.max(1, Math.floor(H / SPRITE_H))
  const mark = Math.max(1, Math.round(u))
  const { pose, dx, dy } = poseFor(satoru.mood, now, satoru.since)
  const spriteW = SPRITE_W * scale
  const gap = 2 * mark
  const groundY = H
  // Satoru sits in its corner; to fight it walks out to where Red fits on its left, and back once it's over
  const stance = stanceAt(now)
  if (stance.isMoving) pose.legStep = Math.floor(now / 110) % 2 === 0 ? 0 : 1
  const home = Math.round((CORNER_X + (FIGHT_X - CORNER_X) * stance.progress) * u)
  const originX = home
  const spriteH = isCompact ? GOJO_COMPACT.length : SPRITE_H
  const originY = groundY - spriteH * scale
  const centerX = originX + spriteW / 2
  // The face, where the void opens from and Infinity turns around
  const centerY = originY + (isCompact ? GOJO_COMPACT.indexOf(14) : 14) * scale

  const isVoidFull = voidBackdrop(canvas, now, centerX, centerY, u, reach)
  // Satoru sits near the left edge: the ring stays inside the band
  infinityRing(canvas, now, centerX, centerY, Math.min(spriteW * 0.8, centerX - 1), H / 2 - 0.5)

  // Behind Satoru: Red's waves and the spheres pass behind him on their way to the hand
  techniques(canvas, now, originX, originX + spriteW, u)

  const sprites: Sprite[] = [
    {
      pixels: isCompact ? keepRows(gojoPixels(pose), GOJO_COMPACT) : gojoPixels(pose),
      x: originX + dx * scale,
      y: originY + dy * scale,
      scale,
      w: GRID_W,
      h: spriteH,
    },
  ]
  // Subagents: each Yuji or Megumi starts at Gojo's side, walks off to his own spot and works there, and walks back
  // only once his task is done, then is gone
  satoru.crew.filter(y => y.slot < 3).forEach(yuji => {
    const { slot } = yuji
    const side = originX + spriteW + gap + slot * (MEGUMI_W * scale + gap)
    const spot = Math.round(W * 0.42) + slot * (MEGUMI_W * scale + 2 * gap)
    const out = (now - yuji.since) / YUJI_WALK_MS
    const backFrom = yuji.doneAt === null ? Infinity : Math.max(yuji.doneAt, yuji.since + YUJI_WALK_MS)
    const back = (now - backFrom) / YUJI_WALK_MS
    if (out < 0 || back >= 1) return
    const ease = (k: number) => k * k * (3 - 2 * k)
    const isWalking = out < 1 || back >= 0
    const x = out < 1 ? side + (spot - side) * ease(out) : back >= 0 ? spot + (side - spot) * ease(back) : spot
    const legStep = isWalking ? ((Math.floor(now / 150) + slot) % 2) as 0 | 1 : null
    const beat = Math.floor((now - yuji.since) / PUNCH_MS) % 2 === 0
    const isMegumi = yuji.who === 'megumi'
    const drawn = isMegumi ? megumiPixels(legStep, !isWalking, beat) : yujiPixels(legStep, !isWalking && beat)
    const keep = isMegumi ? MEGUMI_COMPACT : YUJI_COMPACT
    const pixels = isCompact ? keepRows(drawn, keep) : drawn
    const h = isCompact ? keep.length : YUJI_H
    const w = isMegumi ? MEGUMI_GRID_W : YUJI_GRID_W
    sprites.push({ pixels, x: Math.round(x), y: groundY - h * scale, scale, w, h })
  })
  // Everything from here on is in front of him
  buf = over

  // Beside the head: the marks that say what Gojo is up to
  const markX = originX + spriteW
  // A small pixel glyph there, each of its pixels `mark` wide
  const glyph = (rows: string[], color: number) => {
    const gx = markX + 2 * mark
    rows.forEach((line, j) => [...line].forEach((c, i) => c === '#' && block(gx + i * mark, originY + j * mark, mark, color)))
  }

  // Thinking: three sparkles orbit the head, like the spinner's ✻
  if (satoru.mood === 'thinking') {
    for (let k = 0; k < 3; k += 1) {
      const a = cycle(now, 1800) + (k * Math.PI * 2) / 3
      const cx = markX + 3 * u + Math.cos(a) * 3 * u
      const cy = originY + 3 * u + Math.sin(a) * 2 * u
      block(Math.round(cx), Math.round(cy), mark, k === 0 ? PALE : ORANGE)
    }
  }

  // Asking: a pixel "?" beside the head, blinking
  if (satoru.mood === 'asking' && Math.floor(now / 600) % 2 === 0) glyph(['.##.', '#..#', '..#.', '.#..', '....', '.#..'], PALE)

  // Finished: a green check over the head, so a glance says the turn is over; it steps aside while Gojo fights
  // (Blue, Red or Purple out, or the domain open), which is a moment of its own
  if (satoru.mood === 'done' && !isCasting(now) && !scene.holdBlue && !scene.holdRed && !scene.isDomain) {
    glyph(['....#', '...#.', '#.#..', '.#...'], DONE_GREEN)
  }

  // The other conversations: a square pip each in the top right corner, working ones blinking orange,
  // finished ones green, stopped ones grey
  satoru.others.slice(0, 8).forEach((state, i) => {
    const isLit = state !== 'working' || Math.floor(now / 500) % 2 === 0
    const color = state === 'working' ? (isLit ? ORANGE : PALE) : state === 'done' ? DONE_GREEN : PIP_IDLE
    block(W - 3 * mark - i * 3 * mark, 0, 2 * mark, color)
  })

  return { under, over, sprites, isVoidFull, voidAt: [centerX, centerY] }
}

/** The three layers flattened into one W × H picture: behind, Gojo, in front. */
function flatten({ under, over, sprites, isVoidFull }: Layers, W: number, H: number): Int32Array {
  const buf = under.slice()
  if (isVoidFull) for (let i = 0; i < buf.length; i += 1) if (buf[i]! < 0) buf[i] = VOID_SKY
  for (const sprite of sprites) {
    for (const [x, y, color] of sprite.pixels) {
      for (let i = 0; i < sprite.scale; i += 1) {
        for (let j = 0; j < sprite.scale; j += 1) {
          const px = sprite.x + x * sprite.scale + i
          const py = sprite.y + y * sprite.scale + j
          if (px >= 0 && py >= 0 && px < W && py < H) buf[py * W + px] = color
        }
      }
    }
  }
  for (let i = 0; i < buf.length; i += 1) if (over[i]! >= 0) buf[i] = over[i]!

  return buf
}

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The mood's word in the band's bottom right corner, set in the SVG itself so it costs no extra reload. In CSS pixels
 * of the whole slot, so it reaches the input's right edge however wide the window is.
 */
function wordText(height: number): string {
  if (!satoru.word) return ''

  const u = height / 10

  return `<text x="100%" dx="${-u}" y="${height - u}" text-anchor="end" font-family="ui-monospace,Menlo,monospace" font-size="${1.7 * u}" font-style="italic" fill="${hex(PALE)}">✻ ${escapeXml(satoru.word)}</text>`
}

/** Rows of half blocks that draw the terminal's Gojo pixel for pixel. */
export const COMPACT_ROWS = GOJO_COMPACT.length / 2

/**
 * One frame of the band, `columns` × `rows` cells, as RasterProps['cells']. With room for the terminal's Gojo each
 * half block is a pixel, the whole Gojo where it fits; with less, the band is painted at twice the size and one pixel
 * in four kept.
 */
export function bandFrame(columns: number, rows: number): string {
  const W = columns
  const H = rows * 2
  let buf: Int32Array
  if (rows >= COMPACT_ROWS) buf = flatten(paintBand(W, H, Date.now(), undefined, H < SPRITE_H), W, H)
  else {
    const full = flatten(paintBand(W * 2, rows * 4, Date.now()), W * 2, rows * 4)
    buf = new Int32Array(W * H)
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) buf[y * W + x] = full[y * 2 * W * 2 + x * 2]!
  }
  const words = new Uint32Array(columns * rows * 3)
  for (let row = 0; row < rows; row += 1) {
    for (let x = 0; x < W; x += 1) {
      const top = buf[row * 2 * W + x]!
      const bottom = buf[(row * 2 + 1) * W + x]!
      const w = (row * W + x) * 3
      if (top < 0 && bottom < 0) words.set([0x20, DEFAULT, DEFAULT], w)
      else if (bottom < 0) words.set([0x2580, top, DEFAULT], w)
      else if (top < 0) words.set([0x2584, bottom, DEFAULT], w)
      else words.set([0x2580, top, bottom], w)
    }
  }

  return toBase64(new Uint8Array(words.buffer))
}

// The desktop has no cells: the band goes as an SVG that plays its frames on its own. A steady scene loops
// LOOP_MS; one playing out (a technique and the walk back, the domain opening, a jump) plays once, whole, to
// where it settles and holds there, so nothing jumps between reloads
const FRAME_STEPS_MS = [100, 150, 200, 300]
// Under the Svg element's 131,072 characters, with room for the wrapper
const SVG_BUDGET = 120_000
// 192 × 30 pixels at 4 make a 768 × 120 band; the markup fills its frame, so the frame never scrolls
const PIXEL_PX = 4
// A jump or a shake ends when its mood does, which the hooks time; play this much and hold
const MOOD_PLAY_MS = 2200

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`

// The app does not say how wide the input is: the drawing asks for more than any window and the app fits it to the slot
export const BAND_MAX_PX = 4000
// How far the void opens on the desktop, in band pixels: past the band, since the drawing spans the whole input
const VOID_REACH_W = 400
// The streams come round every six lanes' lengths, so a tile that wide repeats them seamlessly
const STREAM_TILE = 23 * 6

/**
 * The void past the band's right edge, where the desktop's drawing goes on to the input's own: the same sky, stars
 * and streams in vectors, opening and closing with the band's own void, and covering any width once open.
 */
function voidBeyond(W: number, H: number, start: number, [cx, cy]: [number, number], tag: string): string {
  const since = scene.domainSince
  const ms = scene.isDomain ? DOMAIN_OPEN_MS : DOMAIN_CLOSE_MS
  if (!scene.isDomain && start - since >= ms) return ''
  const px = PIXEL_PX
  const left = W * px
  const tile = STREAM_TILE * px
  const reach = Math.hypot(VOID_REACH_W, H)
  const STEPS = 12
  const radii = Array.from({ length: STEPS + 1 }, (_, i) => voidRadius(since + (ms * i) / STEPS, reach) * px)
  const at = (r: number) => `{rx:${r.toFixed(1)}px;ry:${(r / 2).toFixed(1)}px}`
  const keys = radii.map((r, i) => `${((i / STEPS) * (scene.isDomain ? 99.9 : 100)).toFixed(1)}%${at(r)}`)
  if (scene.isDomain) keys.push(`100%${at(BAND_MAX_PX * 4)}`)
  const delay = since - start
  const u = H / 10

  const stars = new Map<string, string>()
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < STREAM_TILE; x += 1) {
      const h = hash(x + 7919, y)
      if (h <= 0.965) continue
      const key = `${(x + y) % 3}|${h > 0.985 ? 0x8fd8ff : 0xb9a6ff}`
      stars.set(key, `${stars.get(key) ?? ''}M${x * px} ${y * px}h${px}v${px}h-${px}z`)
    }
  }
  let streams = ''
  for (let y = 0; y < H; y += 3) {
    for (let b = 0; b < 6; b += 1) if (hash(b, y) > 0.55) streams += `M${23 * b * px} ${y * px}h${4 * px}v${px}h-${4 * px}z`
  }
  // Tiles laid on the band's own grid, so the streams carry on across its edge
  const first = Math.floor(left / tile)
  const count = Math.ceil((left + BAND_MAX_PX) / tile) - first + 1
  const tiles = (id: string) => Array.from({ length: count }, (_, k) => `<use href="#${id}" x="${(first + k) * tile - left}"/>`).join('')

  const style = `<style>.${tag}v{animation:${tag}v ${ms}ms linear ${delay}ms both}@keyframes ${tag}v{${keys.join('')}}`
    + `.${tag}r{animation:${tag}r ${LOOP_MS}ms linear ${-(start % LOOP_MS)}ms infinite}@keyframes ${tag}r{to{transform:translateX(-${tile}px)}}`
    + [0x8fd8ff, 0xb9a6ff].map(color => {
      // The band's twinkle: white at its peak, its own color around it, gone in the trough
      const own = hex(color)
      return `@keyframes ${tag}t${own.slice(1)}{0%,87.5%,100%{fill:#fff;opacity:1}12.5%,72%{fill:${own};opacity:1}28%{fill:${own};opacity:0}}`
    }).join('')
    + '</style>'
  const starPaths = [...stars].map(([key, d]) => {
    const [phase, color] = key.split('|')
    const own = hex(Number(color))
    return `<path style="animation:${tag}t${own.slice(1)} 1800ms step-end -${Number(phase) * 600}ms infinite" fill="${own}" d="${d}"/>`
  }).join('')
  const ellipse = (cls: string, rest: string) => `<ellipse class="${cls}" cx="${cx * px - left}" cy="${cy * px}" ${rest}/>`

  return `${style}<svg x="${left}" width="${BAND_MAX_PX}" height="${H * px}" overflow="hidden" shape-rendering="crispEdges">`
    + `<defs><clipPath id="${tag}c">${ellipse(`${tag}v`, '')}</clipPath>`
    + `<path id="${tag}s" fill="${hex(0x2a1f55)}" d="${streams}"/><g id="${tag}k">${starPaths}</g></defs>`
    + `<g clip-path="url(#${tag}c)"><rect width="${BAND_MAX_PX}" height="${H * px}" fill="${hex(VOID_SKY)}"/>`
    + `<g class="${tag}r">${tiles(`${tag}s`)}</g>${tiles(`${tag}k`)}</g>`
    + `${ellipse(`${tag}v`, `fill="none" stroke="${hex(0xc8b0ff)}" stroke-width="${2.5 * u * px}"`)}</svg>`
}

/** One frame as a path per color, each horizontal run of a color one rectangle. */
function framePaths(buf: Int32Array, W: number, H: number): string {
  const runs = new Map<number, string>()
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; ) {
      const color = buf[y * W + x]!
      let end = x + 1
      while (end < W && buf[y * W + end] === color) end += 1
      if (color >= 0) runs.set(color, `${runs.get(color) ?? ''}M${x} ${y}h${end - x}v1h${x - end}z`)
      x = end
    }
  }

  return [...runs].map(([color, d]) => `<path fill="${hex(color)}" d="${d}"/>`).join('')
}

/** When what is playing out now settles into the steady loop; `now` when nothing is. */
function settlesAt(now: number): number {
  return Math.max(
    now,
    // A technique, then the walk back to the corner
    Math.max(scene.aoSince + AO_MS, scene.akaSince + AKA_MS, scene.murasakiSince + MURASAKI_MS) + (scene.holdBlue || scene.holdRed ? 0 : STEP_OUT_MS),
    scene.domainSince + (scene.isDomain ? DOMAIN_OPEN_MS + LIFT_MS + SIGN_MS : DOMAIN_CLOSE_MS),
    scene.infinitySince + INFINITY_MS,
    stance.since + Math.max(STEP_IN_MS, STEP_OUT_MS),
    veil.since + LIFT_MS,
    satoru.mood === 'happy' || satoru.mood === 'oops' ? satoru.since + MOOD_PLAY_MS : -Infinity,
    // Yuji walking off to work, or back to Gojo
    ...satoru.crew.map(y => y.doneAt === null ? y.since + YUJI_WALK_MS : Math.max(y.doneAt, y.since + YUJI_WALK_MS) + YUJI_WALK_MS),
  )
}

/** When the blindfold goes back on by itself, if it is off: nothing else changes the steady scene on its own. */
function blindfoldBackAt(): number | null {
  if (!veil.isUnveiled || scene.isDomain || scene.holdBlue || scene.holdRed) return null
  const lastFight = Math.max(scene.aoSince + AO_MS, scene.akaSince + AKA_MS, scene.murasakiSince + MURASAKI_MS, scene.domainSince)

  return lastFight + BLINDFOLD_BACK_MS
}

// Painting ahead walks the stance and the blindfold forward to where the drawing ends. Kept, it is where the
// scene really is once that time comes; a drawing replaced before then goes back to the live state
let ahead: { until: number; veil: typeof veil; stance: typeof stance } | null = null

/**
 * The band from now on, W × H pixels, as an SVG that plays its frames: a scene playing out plays once, then the
 * steady scene it settles into loops on, in the same drawing, so it never holds a frame waiting for a reload.
 * `redrawAt` is when to draw it again (the blindfold going back on), or null for never.
 */
export function bandSvg(W: number, H: number): { source: string; playMs: number; redrawAt: number | null; height: number } {
  const start = Date.now()
  if (ahead !== null && start >= ahead.until) {
    veil = ahead.veil
    stance = ahead.stance
  }
  ahead = null
  const reach = Math.hypot(VOID_REACH_W, H)
  const first = paintBand(W, H, start, reach)
  const live = { veil, stance }
  const onceMs = settlesAt(start) - start

  // Each of Gojo's and Yuji's poses and each distinct frame is drawn once, in the defs; the frames point at them, so a steady
  // scene costs little more than the frames that actually change
  // Ids of this drawing only, so two of them on one page never borrow each other's
  const tag = start.toString(36)
  const beyond = voidBeyond(W, H, start, first.voidAt, tag)
  const budget = SVG_BUDGET - beyond.length
  let defs: string[] = []
  let sprites = new Map<string, string>()
  let bodies = new Map<string, string>()
  let size = 0
  const frameOf = (layers: Layers) => {
    const uses = layers.sprites.map(({ pixels, x, y, scale, w, h }) => {
      const key = `${scale}:${pixels.map(([px, py, c]) => `${px},${py},${c}`).join(';')}`
      let spriteId = sprites.get(key)
      if (spriteId === undefined) {
        spriteId = `${tag}s${sprites.size}`
        sprites.set(key, spriteId)
        const sw = w * scale
        const sh = h * scale
        const own = new Int32Array(sw * sh).fill(-1)
        for (const [px, py, c] of pixels) {
          for (let i = 0; i < scale; i += 1) for (let j = 0; j < scale; j += 1) own[(py * scale + j) * sw + px * scale + i] = c
        }
        const def = `<g id="${spriteId}">${framePaths(own, sw, sh)}</g>`
        defs.push(def)
        size += def.length
      }

      return `<use href="#${spriteId}" x="${x}" y="${y}"/>`
    }).join('')
    const sky = layers.isVoidFull ? `<rect width="${W}" height="${H}" fill="${hex(VOID_SKY)}"/>` : ''
    const body = `${sky}${framePaths(layers.under, W, H)}${uses}${framePaths(layers.over, W, H)}`
    let bodyId = bodies.get(body)
    if (bodyId === undefined) {
      bodyId = `${tag}f${bodies.size}`
      bodies.set(body, bodyId)
      const def = `<g id="${bodyId}">${body}</g>`
      defs.push(def)
      size += def.length
    }
    // The frame itself: its slot in the animation, pointing at its drawing
    size += 64 + tag.length

    return bodyId
  }

  let once: string[] = []
  let loop: string[] = []
  let frameMs = FRAME_STEPS_MS[0]!
  let settled = live
  for (const step of FRAME_STEPS_MS) {
    frameMs = step
    veil = live.veil
    stance = live.stance
    defs = []
    sprites = new Map()
    bodies = new Map()
    size = 0
    // Once: from now to where the scene settles, whole frames
    const onceFrames = Math.ceil(onceMs / step)
    once = []
    for (let i = 0; i < onceFrames && size <= budget; i += 1) once.push(frameOf(i === 0 ? first : paintBand(W, H, start + i * step, reach)))
    settled = { veil, stance }
    // Then the steady loop, from the first frame after it settles
    const loopFrom = start + onceFrames * step
    loop = []
    for (let i = 0; i < LOOP_MS / step && size <= budget; i += 1) {
      loop.push(frameOf(onceFrames === 0 && i === 0 ? first : paintBand(W, H, loopFrom + i * step, reach)))
    }
    if (size <= budget) break
  }
  // What the drawing shows from its end on is where the scene really is by then
  if (once.length > 0) ahead = { until: start + once.length * frameMs, veil: settled.veil, stance: settled.stance }
  veil = live.veil
  stance = live.stance

  const onceTotal = once.length * frameMs
  const loopTotal = loop.length * frameMs
  // Each frame shows for its own slice of its part and hides for the rest; only the frames hide, so the drawings
  // they point at show through them
  const keyframes = (name: string, total: number) =>
    `@keyframes ${name}{0%{visibility:visible}${(frameMs / total) * 100}%,100%{visibility:hidden}}`
  const style = `<style>.o,.l{visibility:hidden}`
    + (once.length > 0 ? `.o{animation:o ${onceTotal}ms step-end 1}${keyframes('o', onceTotal)}` : '')
    + `.l{animation:l ${loopTotal}ms step-end infinite}${keyframes('l', loopTotal)}</style>`
  const body = once.map((id, i) => `<g class="o" style="animation-delay:${i * frameMs}ms"><use href="#${id}"/></g>`).join('')
    + loop.map((id, i) => `<g class="l" style="animation-delay:${onceTotal + i * frameMs}ms"><use href="#${id}"/></g>`).join('')
  // The scene keeps its size at the left; the outer drawing spans the slot, so the word sits at its right edge
  const width = W * PIXEL_PX
  const height = H * PIXEL_PX
  const stage = `<svg viewBox="0 0 ${W} ${H}" width="${width}" height="${height}" shape-rendering="crispEdges"><defs>${defs.join('')}</defs>${body}</svg>`
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${height}" style="display:block;overflow:hidden">${style}${beyond}${stage}${wordText(height)}</svg>`

  return { source, playMs: onceTotal + loopTotal, redrawAt: blindfoldBackAt(), height }
}

function toBase64(bytes: Uint8Array): string {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64
  if (native) return native.call(bytes)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))

  return btoa(binary)
}
