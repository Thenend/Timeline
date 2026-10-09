"""Servidor local de Timeline.

Sirve la web en http://localhost:8765 y guarda los cambios del editor en
datos/timeline.json (con copia de seguridad en datos/copias/ antes de cada
guardado). Solo escucha en este ordenador.
"""
import json
import os
import socket
import sys
import time
import uuid
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PUERTO = 8765
RAIZ = os.path.dirname(os.path.abspath(__file__))
DATOS = os.path.join(RAIZ, "datos", "timeline.json")
COPIAS = os.path.join(RAIZ, "datos", "copias")
IMAGENES = os.path.join(RAIZ, "img")
MAX_COPIAS = 50
EXTENSIONES = {"jpg", "jpeg", "png", "webp", "gif"}


class Manejador(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RAIZ, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, formato, *args):
        pass

    def _responder(self, codigo, cuerpo):
        datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def _leer_cuerpo(self):
        return self.rfile.read(int(self.headers.get("Content-Length", 0)))

    def do_PUT(self):
        if urlparse(self.path).path != "/api/datos":
            return self._responder(404, {"error": "No existe"})
        try:
            nuevo = json.loads(self._leer_cuerpo().decode("utf-8"))
            if not isinstance(nuevo.get("lineas"), list) or not isinstance(nuevo.get("eventos"), list):
                raise ValueError("Faltan 'lineas' o 'eventos'")
        except Exception as e:
            return self._responder(400, {"error": f"Datos no válidos: {e}"})
        hacer_copia()
        temporal = DATOS + ".tmp"
        with open(temporal, "w", encoding="utf-8") as f:
            f.write(volcar(nuevo))
        os.replace(temporal, DATOS)
        self._responder(200, {"ok": True})

    def do_POST(self):
        url = urlparse(self.path)
        if url.path != "/api/imagen":
            return self._responder(404, {"error": "No existe"})
        ext = parse_qs(url.query).get("ext", ["jpg"])[0].lower()
        if ext not in EXTENSIONES:
            return self._responder(400, {"error": "Formato de imagen no admitido"})
        nombre = f"{uuid.uuid4().hex[:12]}.{ext}"
        with open(os.path.join(IMAGENES, nombre), "wb") as f:
            f.write(self._leer_cuerpo())
        self._responder(200, {"ruta": f"img/{nombre}"})


def volcar(datos):
    """JSON con un elemento por línea: fácil de leer y de comparar en git."""
    partes = []
    for clave, valor in datos.items():
        if isinstance(valor, list):
            elementos = ",\n    ".join(json.dumps(x, ensure_ascii=False) for x in valor)
            partes.append(f'  {json.dumps(clave)}: [\n    {elementos}\n  ]')
        else:
            partes.append(f"  {json.dumps(clave)}: {json.dumps(valor, ensure_ascii=False)}")
    return "{\n" + ",\n".join(partes) + "\n}\n"


def hacer_copia():
    if not os.path.exists(DATOS):
        return
    os.makedirs(COPIAS, exist_ok=True)
    marca = time.strftime("%Y-%m-%d_%H-%M-%S")
    with open(DATOS, "rb") as origen, open(os.path.join(COPIAS, f"timeline_{marca}.json"), "wb") as destino:
        destino.write(origen.read())
    copias = sorted(os.listdir(COPIAS))
    for vieja in copias[:-MAX_COPIAS]:
        os.remove(os.path.join(COPIAS, vieja))


def puerto_ocupado():
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", PUERTO)) == 0


if __name__ == "__main__":
    url = f"http://localhost:{PUERTO}/"
    if puerto_ocupado():
        # Ya hay un Timeline abierto: solo abrimos el navegador.
        webbrowser.open(url)
        sys.exit(0)
    os.makedirs(IMAGENES, exist_ok=True)
    servidor = ThreadingHTTPServer(("127.0.0.1", PUERTO), Manejador)
    print(f"Timeline abierto en {url}")
    print("Deja esta ventana abierta mientras usas la web. Ciérrala para terminar.")
    if "--sin-navegador" not in sys.argv:
        webbrowser.open(url)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
