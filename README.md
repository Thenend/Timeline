# Timeline

Línea del tiempo desde el Big Bang hasta hoy, con zooms sucesivos (8 líneas).
Basada en el FigJam «Timeline».

## Abrirla

Doble clic en **Abrir Timeline.bat**. Se abre en el navegador (http://localhost:8765)
y la ventana negra debe quedar abierta mientras la usas.

## Cómo funciona

- Todo el contenido está en `datos/timeline.json`:
  - `lineas`: cada línea tiene título, color y fecha de inicio (`desde`). Termina en «Ahora»
    salvo que tenga `hasta`. `lupa` es el texto del tramo ampliado en la línea anterior.
  - `eventos`: fecha, texto (la primera línea es el título) e imagen opcional.
    Con `hasta` el evento es un periodo.
- Fechas: `{"hace": 538000000}`, `{"año": -3000}` (negativo = a. C.) o `{"dentro": 1000000000}`.
- Cada evento aparece en la línea más ampliada que contiene su fecha; no hay que colocarlo a mano.
- Al guardar desde la web se hace una copia del archivo anterior en `datos/copias/` (últimas 50).
- Las imágenes van en `img/`.

## Imágenes del FigJam

`herramientas/importar_imagenes_figma.py` descarga las imágenes que faltan
(necesita un token personal de Figma en `herramientas/figma_token.txt`).

## Publicación

La web está publicada en GitHub Pages (https://thenend.github.io/Timeline/) y se
actualiza sola con cada push a `main`. Allí es de solo lectura: para editar,
usa **Abrir Timeline.bat** en tu PC y sube los cambios.
