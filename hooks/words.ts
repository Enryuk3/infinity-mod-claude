// Curious words for what Satoru is up to, the way Claude's own spinner says "Cavilando…"; one is picked each time
// the mood changes, so the band only changes words when it already redraws
import type { Mood } from './satoru'

// Rare verbs ("Cavilando") with a touch of Gojo, in the style of the spinner verbs in settings. Each fits in 13
// letters, so it reads at a glance under the desktop Satoru's feet as well as at the end of the band
const WORDS: Record<Mood, string[]> = {
  thinking: ['Cavilando', 'Elucubrando', 'Barruntando', 'Rumiando', 'Calculando', 'Tramando'],
  reading: ['Escudriñando', 'Hojeando', 'Desentrañando', 'Ojeando', 'Husmeando'],
  editing: ['Pergeñando', 'Hilvanando', 'Zurciendo', 'Cincelando', 'Puliendo'],
  running: ['Ejecutando', 'Trajinando', 'Maniobrando', 'Probando'],
  asking: ['Tu veredicto', 'Te toca', 'Tu señal'],
  happy: ['¡Yosh!', '¡Hola!', '¡Aquí estoy!'],
  oops: ['¡Tch!', '¡Recórcholis!', '¡Uy!'],
  done: ['Listo', 'Hecho', 'Pan comido', 'Ni sudé', 'Obvio'],
  idle: ['Remoloneando', 'Holgazaneando', 'Tomando aire', 'En pausa', 'Al acecho'],
}

/** A word for the mood, never the one just shown; exclamations stand alone, the rest trail off. */
export function wordFor(mood: Mood, previous = ''): string {
  const options = WORDS[mood].filter(w => w !== previous.replace(/…$/, ''))
  const word = options[Math.floor(Math.random() * options.length)] ?? WORDS[mood][0]!

  return /[!.]$/.test(word) || mood === 'done' ? word : `${word}…`
}
