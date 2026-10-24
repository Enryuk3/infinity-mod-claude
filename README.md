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

## Infinity

Antes de que Claude corra algo irreversible, Infinity mide qué tocaría y te lo pregunta en el diálogo de permiso: los archivos que borraría un `rm -r`, los cambios sin commit que perdería un `git reset --hard` o un `git checkout .`, lo que borraría un `git clean -f`, los commits del remoto que sobrescribiría un `git push --force`, o la sentencia `DROP`/`TRUNCATE` que mandaría a la base. Tú decides si pasa. Sin nadie a quien preguntar (`claude -p`), no pasa.

Un comando que solo menciona uno de esos, como un patrón de búsqueda o un mensaje de commit, no cuenta.

## Comandos

- `/satoru`: muestra u oculta a Satoru
- `/ao`, `/aka`, `/murasaki`: Azul, Rojo y Púrpura
- `/domain`: Expansión de Dominio

## Fuera de Claude (macOS)

- **Satoru en el escritorio**: mientras haya una conversación abierta, Gojo flota sobre tu escritorio con la misma banda en vivo (la venda, el Azul al escribir, el Rojo al leer, la palabra bajo sus pies). Se oculta cuando Claude está al frente.
- **Al terminar** una conversación sale un globo sobre su cabeza hasta que la veas; clic en él o en Gojo la abre.
- **Moverlo**: arrástralo; mientras lo sostienes, un borde punteado marca todo su espacio.
- **Ocultarlo**: clic derecho → "Ocultar a Satoru" lo guarda como ∞ en la barra de menú (∞✓ si algo terminó); un clic en el ∞ lo trae de vuelta.
- El mod se carga al abrir cada conversación: tras actualizarlo, las que ya estaban abiertas siguen con el anterior hasta reiniciarlas.
