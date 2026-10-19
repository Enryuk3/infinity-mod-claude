// What Gojo is doing right now: the techniques in flight, Blue and Red waiting, the domain. Times are Date.now().

export const MURASAKI_MS = 3000
export const AO_MS = 3100
export const AKA_MS = 3000
// Infinity's ring around Satoru after /infinity
export const INFINITY_MS = 2600
// The void opens from Satoru outward, and folds back into it
export const DOMAIN_OPEN_MS = 900
export const DOMAIN_CLOSE_MS = 600

export const scene = {
  isWorking: false,
  isDomain: false,
  /** When the domain last opened or closed. */
  domainSince: -Infinity,
  murasakiSince: -Infinity,
  aoSince: -Infinity,
  akaSince: -Infinity,
  infinitySince: -Infinity,
  /** Blue and Red, summoned and waiting for Murasaki. */
  holdBlue: false,
  holdRed: false,
  /** The Purple playing is the turn's quiet one, fired from the corner, not /murasaki's. */
  isQuietPurple: false,
}

/** What outlives a reload or a new session: the domain you opened, which only you close. */
export type KeptScene = { isDomain: boolean }

export const keptScene = (): KeptScene => ({ isDomain: scene.isDomain })

/** Puts back what was kept, already settled: an open domain comes back open, not opening again. */
export const restoreScene = (kept: Partial<KeptScene> | undefined) => {
  if (kept?.isDomain && !scene.isDomain) {
    scene.isDomain = true
    scene.domainSince = Date.now() - 60_000
  }
}

/** Fires Murasaki from Blue and Red already waiting. */
export const fireMurasaki = () => {
  scene.holdBlue = false
  scene.holdRed = false
  scene.isQuietPurple = false
  scene.murasakiSince = Date.now()
}

/** The turn's quiet Purple, when it both read and wrote: Blue and Red waiting for /murasaki stay where they are. */
export const finishMurasaki = () => {
  scene.isQuietPurple = true
  scene.murasakiSince = Date.now()
}

export const fireAo = () => {
  scene.holdBlue = true
  scene.aoSince = Date.now()
}

export const fireAka = () => {
  scene.holdRed = true
  scene.akaSince = Date.now()
}

export const toggleDomain = () => {
  scene.isDomain = !scene.isDomain
  scene.domainSince = Date.now()
  return scene.isDomain
}

/** One technique at a time: Ao, Aka or Murasaki. */
export const isCasting = (now = Date.now()) =>
  now - scene.murasakiSince < MURASAKI_MS || now - scene.aoSince < AO_MS || now - scene.akaSince < AKA_MS
