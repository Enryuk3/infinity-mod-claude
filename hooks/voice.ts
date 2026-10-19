// Satoru's voice from ElevenLabs: what needs no engine. The calls themselves live in register.tsx, since `$` never
// crosses an import. The key (and optionally the voice) come from the env block of ~/.claude/settings.json.

export const ELEVEN_API = 'https://api.elevenlabs.io/v1'
// Speaks Spanish and Japanese alike, for the turn lines and the techniques
export const ELEVEN_MODEL = 'eleven_multilingual_v2'
// The techniques' Japanese: multilingual_v2 ignores language_code and reads short kana as English, v3 takes it
export const ELEVEN_JA_MODEL = 'eleven_v3'

/** FNV-1a: a short steady name for a cached line. */
export function lineHash(text: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)

  return (h >>> 0).toString(16)
}

/**
 * The voice to use from the account's list: a default one (category `premade`), which the free plan may call
 * through the API, unlike the Voice Library's; else the first listed.
 */
export function firstVoice(text: string) {
  const voices = (JSON.parse(text) as { voices?: { voice_id: string; category?: string }[] }).voices ?? []

  return (voices.find(v => v.category === 'premade') ?? voices[0])?.voice_id ?? ''
}

/** ElevenLabs' own words for a refusal (`detail.message`, or its status), for a toast. */
export function refusalOf(status: number, text: string) {
  try {
    const detail = (JSON.parse(text) as { detail?: { message?: string; status?: string } | string }).detail
    const said = typeof detail === 'string' ? detail : (detail?.message ?? detail?.status)
    if (said) return `${status}: ${said}`
  } catch {}

  return String(status)
}

export const audioOf = (text: string) => (JSON.parse(text) as { audio_base64?: string }).audio_base64 ?? ''

// Voice Design: a voice of your own, which the free plan may use through the API (library voices it may not)
export const DESIGN_MODEL = 'eleven_multilingual_ttv_v2'
export const GOJO_VOICE = 'Hombre joven de unos 28 años, voz clara y segura, tono burlón, relajado y carismático, '
  + 'como un hechicero invencible que se divierte; español neutro, ritmo ágil, ligera sonrisa al hablar.'
// What the preview says: 100 to 1000 characters
export const DESIGN_SAMPLE = 'Tranquilo, ya terminé. Revisé cada archivo, ejecuté las pruebas y todo quedó en orden. '
  + 'Era de esperarse: soy el más fuerte. ¿Tienes algo más difícil para mí?'

/** The first preview of a design: its id, and its audio to play while it is saved. */
export function firstPreview(text: string): { id: string; audio: string } | null {
  const previews = (JSON.parse(text) as { previews?: { generated_voice_id?: string; audio_base_64?: string; audio_base64?: string }[] }).previews
  const first = previews?.[0]
  if (!first?.generated_voice_id) return null

  return { id: first.generated_voice_id, audio: first.audio_base_64 ?? first.audio_base64 ?? '' }
}

export const createdVoice = (text: string) => (JSON.parse(text) as { voice_id?: string }).voice_id ?? ''
