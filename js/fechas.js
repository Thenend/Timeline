// Fechas del Timeline.
// Una fecha se guarda de una de estas tres formas:
//   { "hace": 538000000 }   → hace 538 millones de años
//   { "año": -3000 }        → año 3000 a. C. (negativo = antes de Cristo)
//   { "dentro": 1000000000 } → dentro de 1000 millones de años
// Internamente todo se convierte a "año del calendario" (un número) para colocarlo.

const AHORA = new Date().getFullYear();

const UNIDADES = [
  { valor: 1e9, nombre: "miles de millones de años" },
  { valor: 1e6, nombre: "millones de años" },
  { valor: 1e3, nombre: "miles de años" },
  { valor: 1, nombre: "años" },
];

function aAño(fecha) {
  if ("año" in fecha) return fecha.año;
  if ("hace" in fecha) return AHORA - fecha.hace;
  if ("dentro" in fecha) return AHORA + fecha.dentro;
  throw new Error("Fecha sin valor");
}

function numero(n, decimales = 2) {
  return n.toLocaleString("es-ES", { maximumFractionDigits: decimales, useGrouping: "always" });
}

// 13800000000 → "13.800 millones", 7000000 → "7 millones", 100000 → "100.000"
function cantidadAños(n) {
  if (n >= 1e6) {
    const m = n / 1e6;
    return m === 1 ? "1 millón" : `${numero(m)} millones`;
  }
  return numero(n, 0);
}

function textoAño(año) {
  if (año < 0) return `${numero(-año, 0).replace(/\./g, "")} a. C.`;
  if (año < 1000) return `${año} d. C.`;
  return String(año);
}

function formatoFecha(fecha) {
  if ("año" in fecha) return textoAño(fecha.año);
  if ("hace" in fecha) {
    const n = fecha.hace;
    if (n === 0) return "Ahora";
    return `Hace ${cantidadAños(n)} ${n >= 1e6 ? "de años" : n === 1 ? "año" : "años"}`;
  }
  const n = fecha.dentro;
  return `Dentro de ${cantidadAños(n)} ${n >= 1e6 ? "de años" : n === 1 ? "año" : "años"}`;
}

function formatoEvento(ev) {
  if (!ev.hasta) return formatoFecha(ev.fecha);
  const a = ev.fecha, b = ev.hasta;
  // "Hace 11.500 – 10.500 millones de años" cuando ambas son "hace" en millones
  if ("hace" in a && "hace" in b && a.hace >= 1e6 && b.hace >= 1e6) {
    return `Hace ${numero(a.hace / 1e6)} – ${numero(b.hace / 1e6)} millones de años`;
  }
  return `${formatoFecha(a)} – ${formatoFecha(b)}`;
}

// Etiqueta corta para las marcas del eje.
function etiquetaMarca(añosAtras, modo) {
  if (modo === "año") return null;
  if (añosAtras === 0) return "Ahora";
  const signo = añosAtras < 0 ? "+" : "";
  const n = Math.abs(añosAtras);
  if (n >= 1e6) return `${signo}${numero(n / 1e6)} M`;
  return signo + numero(n, 0);
}

// Paso "bonito" (1, 2, 2.5, 5 × 10^k) para unas `objetivo` marcas en `rango` años.
function pasoBonito(rango, objetivo) {
  const bruto = rango / objetivo;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pot >= bruto) return m * pot;
  }
  return 10 * pot;
}

// Interpreta lo que escribe el usuario: "13,8", "13.800", "1.5", "538"
function leerNumero(texto) {
  let t = String(texto).trim().replace(/\s/g, "");
  if (!t) return NaN;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  return Number(t);
}

// Descompone una cantidad de años en número + unidad para el editor.
function descomponer(n) {
  for (const u of UNIDADES) {
    const minimo = u.valor === 1e3 ? 1e4 : u.valor; // 1500 → "1500 años", no "1,5 miles"
    const c = n / u.valor;
    if (n >= minimo && Math.abs(c * 1000 - Math.round(c * 1000)) < 1e-6) {
      return { cantidad: c, unidad: u.valor };
    }
  }
  return { cantidad: n, unidad: 1 };
}
