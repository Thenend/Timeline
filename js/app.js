"use strict";

// ---------- Medidas del dibujo ----------
const ANCHO_TARJETA = 176;
const PASO = ANCHO_TARJETA + 12;   // separación mínima entre centros de tarjetas de una fila
const ALTO_BARRA = 34;
const ALTO_EJE = 22;               // espacio para las marcas encima de la barra
const SEP_BARRA = 34;              // hueco entre la barra y la primera fila de tarjetas
const SEP_FILA = 16;
const ANCHO_MINIMO = 960;

// ---------- Estado ----------
let datos = null;
let ordenados = [];                // todos los eventos en orden cronológico
let anchoDibujado = 0;
let detalleActual = null;
const puedeGuardar = location.protocol.startsWith("http");

const $ = (sel, el = document) => el.querySelector(sel);

function h(etiqueta, props = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const hijo of hijos.flat()) {
    if (hijo == null || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(hijo));
  }
  return el;
}

function svg(etiqueta, props = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", etiqueta);
  for (const [k, v] of Object.entries(props)) el.setAttribute(k, v);
  return el;
}

const ICONO_LUPA = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M11 8v6M8 11h6"/></svg>';

// Texto oscuro o blanco según lo claro que sea el color de fondo.
function textoSobre(color) {
  const n = parseInt(color.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? "#1d1d1f" : "#ffffff";
}

function variablesColor(i) {
  const l = datos.lineas[i];
  let v = `--c:${l.color};--c-texto:${textoSobre(l.color)};`;
  const sig = datos.lineas[i + 1];
  if (sig) v += `--c-sig:${sig.color};--c-sig-texto:${textoSobre(sig.color)};`;
  return v;
}

// ---------- Líneas y eventos ----------

function rangoLinea(i) {
  const l = datos.lineas[i];
  return { desde: aAño(l.desde), hasta: l.hasta ? aAño(l.hasta) : AHORA };
}

// Un evento va en la línea más ampliada que contiene su fecha.
function lineaDeFecha(t) {
  for (let i = datos.lineas.length - 1; i >= 0; i--) {
    const r = rangoLinea(i);
    if (t >= r.desde && t <= r.hasta) return i;
  }
  return 0;
}

function tituloDe(ev) {
  return ev.texto.split("\n")[0];
}

function momento(ev) {
  return aAño(ev.fecha);
}

function centroDe(ev) {
  return ev.hasta ? (aAño(ev.fecha) + aAño(ev.hasta)) / 2 : aAño(ev.fecha);
}

// ---------- Colocación de tarjetas ----------

// Coloca las tarjetas de una fila lo más cerca posible de su fecha sin solaparse:
// minimiza la suma de desplazamientos² con separación mínima PASO (regresión isotónica).
function empaquetar(centros, ancho) {
  const n = centros.length;
  const lo = ANCHO_TARJETA / 2;
  const hi = ancho - ANCHO_TARJETA / 2 - (n - 1) * PASO;
  if (hi < lo) return null;
  const bloques = [];
  centros.forEach((c, j) => {
    bloques.push({ suma: c - j * PASO, n: 1 });
    while (bloques.length > 1) {
      const a = bloques[bloques.length - 2], b = bloques[bloques.length - 1];
      if (a.suma / a.n <= b.suma / b.n) break;
      a.suma += b.suma; a.n += b.n;
      bloques.pop();
    }
  });
  const pos = [];
  for (const b of bloques) {
    const v = Math.min(hi, Math.max(lo, b.suma / b.n));
    for (let k = 0; k < b.n; k++) pos.push(v + pos.length * PASO);
  }
  return pos;
}

// Reparte los eventos en filas (alternando debajo/encima de la barra) usando
// las mínimas filas posibles sin que las tarjetas se alejen demasiado de su fecha.
function repartirFilas(items, ancho) {
  const n = items.length;
  if (!n) return [];
  let mejor = null;
  for (let R = Math.min(2, n); R <= 16; R++) {
    const filas = Array.from({ length: R }, () => []);
    items.forEach((it, k) => filas[k % R].push(it));
    let cabe = true, maxDesvio = 0;
    const colocadas = filas.map(fila => {
      const pos = empaquetar(fila.map(it => it.cx), ancho);
      if (!pos) { cabe = false; return []; }
      return fila.map((it, j) => {
        maxDesvio = Math.max(maxDesvio, Math.abs(pos[j] - it.cx));
        return { ...it, px: pos[j] };
      });
    });
    if (!cabe) continue;
    mejor = colocadas;
    if (maxDesvio <= PASO * 1.25) break;
  }
  return mejor || [];
}

// ---------- Dibujo ----------

function anchoDisponible() {
  const main = $("#lineas");
  const estilo = getComputedStyle(main);
  const ancho = main.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
  return Math.max(ANCHO_MINIMO, Math.floor(ancho));
}

function dibujar() {
  ordenados = [...datos.eventos].sort((a, b) => momento(a) - momento(b));
  const porLinea = datos.lineas.map(() => []);
  for (const ev of ordenados) porLinea[lineaDeFecha(momento(ev))].push(ev);

  const main = $("#lineas");
  main.replaceChildren();
  anchoDibujado = anchoDisponible();
  datos.lineas.forEach((_, i) => dibujarLinea(i, porLinea[i], anchoDibujado));
  dibujarIndice();
  aplicarBusqueda();
}

function dibujarLinea(i, eventos, W) {
  const l = datos.lineas[i];
  const { desde, hasta } = rangoLinea(i);
  const MARGEN = 14;  // para que los puntos de los extremos no queden bajo el borde redondeado
  const x = t => MARGEN + ((t - desde) / (hasta - desde)) * (W - 2 * MARGEN);
  const hayFuturo = hasta > AHORA;

  const lienzo = h("div", { class: "lienzo", style: `width:${W}px` });
  const conectores = svg("svg", { class: "conectores" });
  lienzo.append(conectores);

  const seccion = h("section", { class: "linea", id: `linea-${i}`, style: variablesColor(i) },
    h("header", { class: "linea-cab" },
      h("span", { class: "num" }, String(i + 1)),
      h("h2", {}, l.titulo),
      h("span", { class: "rango" }, `${formatoFecha(l.desde)} → ${l.hasta ? formatoFecha(l.hasta) : "Ahora"}`)
    ),
    h("div", { class: "pista" }, lienzo)
  );
  $("#lineas").append(seccion);

  // Tarjetas: primero se crean para poder medir su altura.
  const items = eventos.map(ev => ({
    ev,
    ex: x(centroDe(ev)),
    cx: Math.min(W - ANCHO_TARJETA / 2, Math.max(ANCHO_TARJETA / 2, x(centroDe(ev)))),
  }));
  const filas = repartirFilas(items, W);
  for (const fila of filas) {
    for (const it of fila) {
      it.el = crearTarjeta(it.ev);
      it.el.style.left = `${it.px - ANCHO_TARJETA / 2}px`;
      lienzo.append(it.el);
    }
  }
  for (const fila of filas) for (const it of fila) it.alto = it.el.offsetHeight;

  // Filas pares debajo de la barra, impares encima (nivel 0 = la más cercana).
  const encima = filas.filter((_, r) => r % 2 === 1);
  const debajo = filas.filter((_, r) => r % 2 === 0);
  const altoFila = fila => Math.max(0, ...fila.map(it => it.alto));

  let y = 8;
  for (let a = encima.length - 1; a >= 0; a--) {
    const alto = altoFila(encima[a]);
    for (const it of encima[a]) {
      it.top = y + alto - it.alto;     // pegadas por abajo, hacia la barra
      it.arriba = true;
    }
    y += alto + SEP_FILA;
  }
  if (encima.length) y += SEP_BARRA - SEP_FILA;
  const ejeTop = y;
  const barraTop = ejeTop + ALTO_EJE;
  y = barraTop + ALTO_BARRA + SEP_BARRA;
  for (const fila of debajo) {
    for (const it of fila) { it.top = y; it.arriba = false; }
    y += altoFila(fila) + SEP_FILA;
  }
  lienzo.style.height = `${y + 4}px`;

  // Barra principal
  const finBarra = hayFuturo ? x(AHORA) : W;
  lienzo.append(h("div", { class: "barra", style: `top:${barraTop}px;width:${finBarra}px` }, l.titulo));
  if (hayFuturo) {
    lienzo.append(h("div", { class: "futuro", style: `top:${barraTop}px;left:${finBarra}px;width:${W - finBarra}px` }, "El futuro"));
    lienzo.append(h("div", { class: "ahora", title: "Ahora", style: `top:${barraTop - 6}px;left:${finBarra - 1}px;height:${ALTO_BARRA + 12}px` }));
  }

  // Tramo que se amplía en la línea siguiente
  if (i < datos.lineas.length - 1) {
    const sig = datos.lineas[i + 1];
    const r2 = rangoLinea(i + 1);
    let x1 = x(r2.desde);
    const x2 = r2.hasta >= hasta ? W : x(r2.hasta);
    if (x2 - x1 < 28) x1 = x2 - 28;
    const ancho = x2 - x1;
    const lupa = h("div", {
      class: "lupa", role: "button", tabindex: "0",
      title: `Ampliar: ${sig.titulo}`,
      "aria-label": `Ampliar: ${sig.titulo}`,
      style: `top:${barraTop}px;left:${x1}px;width:${ancho}px;${hayFuturo ? "border-radius:0" : ""}`,
      onclick: () => irALinea(i + 1),
      onkeydown: e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); irALinea(i + 1); } },
    });
    lupa.innerHTML = ICONO_LUPA;
    if (sig.lupa && ancho > sig.lupa.length * 6.6 + 36) lupa.append(sig.lupa);
    lienzo.append(lupa);
  }

  // Periodos (eventos con fecha de fin)
  for (const ev of eventos) {
    if (!ev.hasta) continue;
    const a = x(aAño(ev.fecha)), b = x(aAño(ev.hasta));
    lienzo.append(h("div", { class: "periodo", style: `top:${barraTop}px;left:${a}px;width:${Math.max(4, b - a)}px` }));
  }

  // Marcas del eje
  for (const m of marcasEje(i, W, x)) {
    let estilo = `top:${ejeTop}px;left:${m.x}px;`;
    if (m.x < 30) estilo += "transform:none;";
    else if (m.x > W - 30) estilo += "transform:translateX(-100%);";
    lienzo.append(h("span", { class: "marca-eje", style: estilo }, m.texto));
  }

  // Conectores y puntos sobre la barra
  for (const fila of filas) {
    for (const it of fila) {
      it.el.style.top = `${it.top}px`;
      let d;
      if (it.arriba) {
        const yb = barraTop, yc = it.top + it.alto;
        d = `M${it.ex},${yb} V${yb - ALTO_EJE - 8} L${it.px},${yc + 10} V${yc}`;
      } else {
        const yb = barraTop + ALTO_BARRA, yc = it.top;
        d = `M${it.ex},${yb} V${yb + 10} L${it.px},${yc - 10} V${yc}`;
      }
      const camino = svg("path", { d });
      conectores.append(camino);
      const punto = h("span", {
        class: "punto-evento",
        style: `left:${it.ex}px;top:${it.arriba ? barraTop - 4.5 : barraTop + ALTO_BARRA - 4.5}px`,
      });
      lienzo.append(punto);
      it.el.addEventListener("mouseenter", () => { camino.classList.add("resaltado"); punto.classList.add("resaltado"); });
      it.el.addEventListener("mouseleave", () => { camino.classList.remove("resaltado"); punto.classList.remove("resaltado"); });
    }
  }
}

function marcasEje(i, W, x) {
  const l = datos.lineas[i];
  const { desde, hasta } = rangoLinea(i);
  const objetivo = Math.max(4, Math.floor(W / 115));
  const marcas = [];
  if ("año" in l.desde) {
    const paso = pasoBonito(hasta - desde, objetivo);
    for (let a = Math.ceil(desde / paso) * paso; a <= hasta; a += paso) {
      if (x(AHORA) - x(a) < 70) continue;   // deja sitio a "Ahora"
      marcas.push({ x: x(a), texto: a < 0 ? `${-a} a. C.` : String(a) });
    }
    marcas.push({ x: x(AHORA), texto: "Ahora" });
  } else {
    const maxAtras = AHORA - desde, minAtras = AHORA - hasta;
    const paso = pasoBonito(maxAtras - minAtras, objetivo);
    for (let n = Math.ceil(minAtras / paso) * paso; n <= maxAtras; n += paso) {
      marcas.push({ x: x(AHORA - n), texto: etiquetaMarca(n) });
    }
  }
  return marcas;
}

function crearTarjeta(ev) {
  return h("button", {
    class: "tarjeta", type: "button", "data-id": ev.id,
    onclick: () => abrirDetalle(ev.id),
  },
    ev.imagen ? h("img", { src: ev.imagen, alt: "", loading: "lazy" }) : null,
    h("span", { class: "t-cuerpo" },
      h("span", { class: "t-fecha" }, formatoEvento(ev)),
      h("span", { class: "t-titulo" }, tituloDe(ev))
    )
  );
}

function dibujarIndice() {
  const nav = $("#indice");
  nav.replaceChildren(...datos.lineas.map((l, i) =>
    h("a", { href: `#linea-${i}`, style: `--c:${l.color}`, "data-i": i,
      onclick: e => { e.preventDefault(); irALinea(i); } },
      h("span", { class: "punto" }), l.titulo)
  ));
  vigilarLineaActiva();
}

let observador = null;
function vigilarLineaActiva() {
  observador?.disconnect();
  observador = new IntersectionObserver(entradas => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      const i = e.target.id.split("-")[1];
      document.querySelectorAll("#indice a").forEach(a => a.classList.toggle("activa", a.dataset.i === i));
    }
  }, { rootMargin: "-130px 0px -65% 0px" });
  document.querySelectorAll(".linea").forEach(s => observador.observe(s));
}

function irALinea(i) {
  const s = $(`#linea-${i}`);
  s.scrollIntoView({ behavior: "smooth", block: "start" });
  s.classList.remove("destello");
  void s.offsetWidth;
  s.classList.add("destello");
}

function enfocarEvento(id) {
  const t = document.querySelector(`.tarjeta[data-id="${id}"]`);
  if (!t) return;
  t.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  t.classList.remove("enfocada");
  void t.offsetWidth;
  t.classList.add("enfocada");
}

// ---------- Detalle ----------

function abrirDetalle(id) {
  const ev = datos.eventos.find(e => e.id === id);
  if (!ev) return;
  detalleActual = id;
  const d = $("#detalle");
  const i = lineaDeFecha(momento(ev));
  d.style.cssText = variablesColor(i);

  const img = $("#detalle-imagen");
  img.replaceChildren(ev.imagen ? h("img", { src: ev.imagen, alt: "" }) : "");
  img.hidden = !ev.imagen;

  $("#detalle-linea").textContent = datos.lineas[i].titulo;
  $("#detalle-fecha").textContent = formatoEvento(ev);
  const [titulo, ...resto] = ev.texto.split("\n");
  $("#detalle-texto").replaceChildren(h("h3", {}, titulo), ...resto.filter(Boolean).map(p => h("p", {}, p)));

  const k = ordenados.findIndex(e => e.id === id);
  $("#detalle-anterior").disabled = k <= 0;
  $("#detalle-siguiente").disabled = k >= ordenados.length - 1;
  $("#detalle-editar").hidden = !puedeGuardar;
  if (!d.open) d.showModal();
}

function moverDetalle(delta) {
  const k = ordenados.findIndex(e => e.id === detalleActual) + delta;
  if (k >= 0 && k < ordenados.length) abrirDetalle(ordenados[k].id);
}

// ---------- Editor ----------

const editor = {
  evento: null,
  imagen: null,       // ruta de la imagen actual (si se conserva)
  archivo: null,      // imagen nueva elegida o pegada (Blob)
  desde: null,
  hasta: null,
};

function crearCampoFecha(contenedor, alCambiar) {
  const tipo = h("select", { "aria-label": "Tipo de fecha" },
    h("option", { value: "hace" }, "Hace"),
    h("option", { value: "año" }, "En el año"),
    h("option", { value: "dentro" }, "Dentro de"));
  const cantidad = h("input", { type: "text", inputmode: "decimal", "aria-label": "Cantidad", placeholder: "Número" });
  const unidad = h("select", { "aria-label": "Unidad" },
    ...UNIDADES.map(u => h("option", { value: u.valor }, u.nombre)));
  const era = h("select", { "aria-label": "Era" },
    h("option", { value: "1" }, "d. C."),
    h("option", { value: "-1" }, "a. C."));
  const vista = h("p", { class: "fecha-sub" });
  contenedor.append(tipo, cantidad, unidad, era, vista);

  function leer() {
    const n = leerNumero(cantidad.value);
    if (!Number.isFinite(n) || n < 0) return null;
    if (tipo.value === "año") {
      if (n < 1 || !Number.isInteger(n)) return null;
      return { año: n * Number(era.value) };
    }
    const años = Math.round(n * Number(unidad.value));
    if (tipo.value === "dentro" && años <= 0) return null;
    return { [tipo.value]: años };
  }

  function refrescar() {
    const esAño = tipo.value === "año";
    unidad.hidden = esAño;
    era.hidden = !esAño;
    const f = leer();
    vista.textContent = f ? formatoFecha(f) : (cantidad.value ? "Número no válido" : "");
    alCambiar?.();
  }

  function poner(f) {
    if (!f) {
      tipo.value = "año"; cantidad.value = ""; era.value = "1"; unidad.value = "1";
    } else if ("año" in f) {
      tipo.value = "año";
      cantidad.value = String(Math.abs(f.año));
      era.value = f.año < 0 ? "-1" : "1";
    } else {
      const clave = "hace" in f ? "hace" : "dentro";
      const { cantidad: c, unidad: u } = descomponer(f[clave]);
      tipo.value = clave;
      cantidad.value = numero(c, 3);
      unidad.value = String(u);
    }
    refrescar();
  }

  [tipo, unidad, era].forEach(el => el.addEventListener("change", refrescar));
  cantidad.addEventListener("input", refrescar);
  return { leer, poner, enfocar: () => cantidad.focus() };
}

function pistaLinea() {
  const p = $("#pista-linea");
  const f = editor.desde.leer();
  if (!f) { p.replaceChildren(); return; }
  const i = lineaDeFecha(aAño(f));
  p.style.cssText = `--c:${datos.lineas[i].color}`;
  p.replaceChildren("Aparecerá en la línea ", h("span", { class: "punto" }), h("strong", {}, datos.lineas[i].titulo));
}

function vistaImagen() {
  const v = $("#imagen-vista");
  const url = editor.archivo ? URL.createObjectURL(editor.archivo) : editor.imagen;
  v.style.backgroundImage = url ? `url("${url}")` : "";
  v.textContent = url ? "" : "Sin imagen";
  $("#imagen-quitar").hidden = !url;
}

function abrirEditor(ev) {
  editor.evento = ev || null;
  editor.imagen = ev?.imagen || null;
  editor.archivo = null;
  $("#editor-titulo").textContent = ev ? "Editar evento" : "Nuevo evento";
  $("#editor-borrar").hidden = !ev;
  editor.desde.poner(ev?.fecha);
  $("#es-periodo").checked = !!ev?.hasta;
  $('[data-fecha="hasta"]').hidden = !ev?.hasta;
  editor.hasta.poner(ev?.hasta);
  $("#texto").value = ev?.texto || "";
  vistaImagen();
  pistaLinea();
  $("#editor").showModal();
  editor.desde.enfocar();
}

async function reducirImagen(archivo) {
  if (archivo.type === "image/gif") return { blob: archivo, ext: "gif" };
  const bmp = await createImageBitmap(archivo);
  const escala = Math.min(1, 1200 / bmp.width);
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bmp.width * escala);
  lienzo.height = Math.round(bmp.height * escala);
  const ctx = lienzo.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  const blob = await new Promise(ok => lienzo.toBlob(ok, "image/jpeg", 0.85));
  return { blob, ext: "jpg" };
}

async function subirImagen(archivo) {
  const { blob, ext } = await reducirImagen(archivo);
  const r = await peticion(`/api/imagen?ext=${ext}`, { method: "POST", body: blob });
  return (await r.json()).ruta;
}

async function peticion(url, opciones) {
  let r;
  try {
    r = await fetch(url, opciones);
  } catch {
    throw new Error("No hay conexión con el servidor. ¿Está abierta la ventana de «Abrir Timeline.bat»?");
  }
  if (!r.ok) {
    let msg = `Error ${r.status}`;
    try { msg = (await r.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return r;
}

async function guardarDatos(nuevos) {
  nuevos.eventos.sort((a, b) => momento(a) - momento(b));
  await peticion("/api/datos", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nuevos, null, 2),
  });
  datos = nuevos;
  dibujar();
}

function nuevoId() {
  return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

async function guardarEditor(e) {
  e.preventDefault();
  const fecha = editor.desde.leer();
  if (!fecha) return aviso("Escribe una fecha válida", true);
  const periodo = $("#es-periodo").checked;
  const hasta = periodo ? editor.hasta.leer() : null;
  if (periodo && !hasta) return aviso("Escribe una fecha de fin válida", true);
  if (periodo && aAño(hasta) <= aAño(fecha)) return aviso("La fecha de fin debe ser posterior a la de inicio", true);
  const texto = $("#texto").value.trim().replace(/\r/g, "");
  if (!texto) return aviso("Escribe un texto", true);

  const boton = $("#editor-guardar");
  boton.disabled = true;
  try {
    let imagen = editor.imagen;
    if (editor.archivo) imagen = await subirImagen(editor.archivo);
    const ev = { id: editor.evento?.id || nuevoId(), fecha };
    if (hasta) ev.hasta = hasta;
    ev.texto = texto;
    if (imagen) ev.imagen = imagen;

    const nuevos = structuredClone(datos);
    const k = nuevos.eventos.findIndex(x => x.id === ev.id);
    if (k >= 0) nuevos.eventos[k] = ev; else nuevos.eventos.push(ev);
    await guardarDatos(nuevos);
    $("#editor").close();
    aviso(k >= 0 ? "Cambios guardados" : "Evento añadido");
    requestAnimationFrame(() => enfocarEvento(ev.id));
  } catch (err) {
    aviso(err.message, true);
  } finally {
    boton.disabled = false;
  }
}

async function borrarEvento() {
  const ev = editor.evento;
  if (!ev || !confirm(`¿Borrar «${tituloDe(ev)}»?`)) return;
  try {
    const nuevos = structuredClone(datos);
    nuevos.eventos = nuevos.eventos.filter(x => x.id !== ev.id);
    await guardarDatos(nuevos);
    $("#editor").close();
    aviso("Evento borrado");
  } catch (err) {
    aviso(err.message, true);
  }
}

function prepararEditor() {
  editor.desde = crearCampoFecha($('[data-fecha="desde"]'), pistaLinea);
  editor.hasta = crearCampoFecha($('[data-fecha="hasta"]'));
  $("#es-periodo").addEventListener("change", e => {
    $('[data-fecha="hasta"]').hidden = !e.target.checked;
  });
  $("#form-editor").addEventListener("submit", guardarEditor);
  $("#editor-borrar").addEventListener("click", borrarEvento);
  $("#imagen-archivo").addEventListener("change", e => {
    if (e.target.files[0]) { editor.archivo = e.target.files[0]; vistaImagen(); }
    e.target.value = "";
  });
  $("#imagen-quitar").addEventListener("click", () => {
    editor.archivo = null; editor.imagen = null; vistaImagen();
  });
  $("#editor").addEventListener("paste", e => {
    const item = [...e.clipboardData.items].find(it => it.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    editor.archivo = item.getAsFile();
    vistaImagen();
  });
}

// ---------- Búsqueda ----------

const normalizar = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
let coincidencias = [];
let indiceCoincidencia = -1;

function aplicarBusqueda() {
  const q = normalizar($("#buscar").value.trim());
  document.body.classList.toggle("buscando", !!q);
  coincidencias = q
    ? ordenados.filter(ev => normalizar(ev.texto + " " + formatoEvento(ev)).includes(q)).map(ev => ev.id)
    : [];
  const ids = new Set(coincidencias);
  document.querySelectorAll(".tarjeta").forEach(t => t.classList.toggle("coincide", ids.has(t.dataset.id)));
  $("#buscar-cuenta").textContent = q ? (coincidencias.length === 1 ? "1 evento" : `${coincidencias.length} eventos`) : "";
  indiceCoincidencia = -1;
}

// ---------- Avisos ----------

let temporizadorAviso;
function aviso(texto, error = false) {
  const t = $("#toast");
  t.textContent = texto;
  t.classList.toggle("error", error);
  t.classList.add("visible");
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => t.classList.remove("visible"), error ? 5000 : 2200);
}

// ---------- Inicio ----------

async function iniciar() {
  try {
    const r = await fetch("datos/timeline.json", { cache: "no-store" });
    datos = await r.json();
  } catch {
    $("#aviso-servidor").hidden = false;
    $("#lineas").replaceChildren(h("p", {}, "No se han podido cargar los datos."));
    return;
  }
  $("#aviso-servidor").hidden = puedeGuardar;
  $("#btn-nuevo").hidden = !puedeGuardar;

  prepararEditor();
  dibujar();

  $("#btn-nuevo").addEventListener("click", () => abrirEditor(null));
  $("#detalle-anterior").addEventListener("click", () => moverDetalle(-1));
  $("#detalle-siguiente").addEventListener("click", () => moverDetalle(1));
  $("#detalle-editar").addEventListener("click", () => {
    const ev = datos.eventos.find(e => e.id === detalleActual);
    $("#detalle").close();
    abrirEditor(ev);
  });
  $("#detalle").addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") moverDetalle(-1);
    if (e.key === "ArrowRight") moverDetalle(1);
  });
  document.querySelectorAll("dialog").forEach(d => {
    d.addEventListener("click", e => { if (e.target === d) d.close(); });
  });
  document.querySelectorAll("[data-cerrar]").forEach(b =>
    b.addEventListener("click", () => b.closest("dialog").close()));

  const buscar = $("#buscar");
  buscar.addEventListener("input", aplicarBusqueda);
  buscar.addEventListener("keydown", e => {
    if (e.key === "Enter" && coincidencias.length) {
      indiceCoincidencia = (indiceCoincidencia + (e.shiftKey ? -1 : 1) + coincidencias.length) % coincidencias.length;
      enfocarEvento(coincidencias[indiceCoincidencia]);
    }
    if (e.key === "Escape") { buscar.value = ""; aplicarBusqueda(); }
  });

  let temporizador;
  window.addEventListener("resize", () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { if (anchoDisponible() !== anchoDibujado) dibujar(); }, 150);
  });
}

iniciar();
