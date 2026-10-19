// Curious words for what Satoru is up to, the way Claude's own spinner says "Cavilando…"; one is picked each time
// the mood changes, so the band only changes words when it already redraws
import type { Mood } from './satoru'

// Rare verbs ("Cavilando") with a touch of Gojo, in the style of the spinner verbs in settings
const WORDS: Record<Mood, string[]> = {
  thinking: ['Cavilando', 'Elucubrando', 'Barruntando', 'Rumiando', 'Calculando con los Seis Ojos', 'Tramando'],
  reading: ['Escudriñando', 'Hojeando', 'Desentrañando', 'Viendo con los Seis Ojos', 'Husmeando'],
  editing: ['Pergeñando', 'Hilvanando', 'Zurciendo', 'Cincelando', 'Puliendo'],
  running: ['Ejecutando', 'Trajinando', 'Maniobrando', 'Poniendo a prueba'],
  asking: ['Aguardando tu veredicto', 'Te toca', 'Esperando tu señal'],
  happy: ['¡Yosh!', '¡Hola!', '¡Aquí estoy!'],
  oops: ['¡Tch!', '¡Recórcholis!', '¡Uy!'],
  done: ['Listo', 'Hecho', 'Pan comido', 'Ni me despeiné', 'Era de esperarse'],
  idle: ['Remoloneando', 'Holgazaneando', 'Tomando aire', 'En pausa', 'Al acecho'],
}

/** A word for the mood, never the one just shown; exclamations stand alone, the rest trail off. */
export function wordFor(mood: Mood, previous = ''): string {
  const options = WORDS[mood].filter(w => w !== previous.replace(/…$/, ''))
  const word = options[Math.floor(Math.random() * options.length)] ?? WORDS[mood][0]!

  return /[!.]$/.test(word) || mood === 'done' ? word : `${word}…`
}
