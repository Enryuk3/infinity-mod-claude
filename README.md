# Infinity

Satoru Gojo sobre el input de Claude Code: Azul, Rojo, Púrpura y el Vacío Ilimitado. Lo irreversible no te toca.

## Instalación

En tu terminal, primero agrega el marketplace y luego instala el mod:

```bash
claude plugin marketplace add Enryuk3/infinity-mod-claude
```

```bash
claude plugin install infinity@infinity-mod-claude
```

Se instala para tu usuario, en todos tus proyectos. Abre una sesión nueva de Claude Code.

## Actualizar

Trae la versión nueva del marketplace y actualiza el mod:

```bash
claude plugin marketplace update infinity-mod-claude
```

```bash
claude plugin update infinity@infinity-mod-claude
```

Luego abre una sesión nueva de Claude Code.

### Sonido en Linux y Windows (WSL)

En macOS suena sin instalar nada. En Linux y en WSL los sonidos se reproducen con `ffplay`, que viene en ffmpeg:

```bash
sudo apt install ffmpeg
```

En WSL el audio sale a Windows a través de WSLg (Windows 11, o WSL actualizado en Windows 10).

## Comandos

- `/satoru`: muestra u oculta a Satoru
- `/ao`, `/aka`, `/murasaki`: Azul, Rojo y Púrpura
- `/domain`: Expansión de Dominio
- `/voz [descripción]`: diseña la voz de Satoru en ElevenLabs

## Opcional

- `ELEVENLABS_API_KEY` (y `ELEVENLABS_VOICE_ID`) en el bloque `env` de `~/.claude/settings.json` para la voz.
- En macOS, `brew install terminal-notifier` para que la notificación abra la conversación al hacer clic.
