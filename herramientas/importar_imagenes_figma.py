"""Descarga desde el FigJam las imágenes de los eventos que aún no tienen.

Uso (con la web cerrada, o recárgala después):
    python herramientas/importar_imagenes_figma.py

Necesita un token personal de Figma (Settings → Security → Personal access
tokens, permiso "File content: Read") guardado en herramientas/figma_token.txt
o en la variable de entorno FIGMA_TOKEN. Ese archivo no se sube a git.

Pide todas las imágenes en una sola llamada a la API de Figma.
"""
import json
import os
import sys
import urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, RAIZ)
from servidor import DATOS, IMAGENES, hacer_copia, volcar  # noqa: E402


def leer_token():
    token = os.environ.get("FIGMA_TOKEN", "").strip()
    ruta = os.path.join(AQUI, "figma_token.txt")
    if not token and os.path.exists(ruta):
        token = open(ruta, encoding="utf-8").read().strip()
    if not token:
        sys.exit("Falta el token: guárdalo en herramientas/figma_token.txt")
    return token


def pedir(url, token=None):
    peticion = urllib.request.Request(url, headers={"X-Figma-Token": token} if token else {})
    with urllib.request.urlopen(peticion, timeout=120) as r:
        return r.read()


def main():
    mapa = json.load(open(os.path.join(AQUI, "figma_imagenes.json"), encoding="utf-8"))
    datos = json.load(open(DATOS, encoding="utf-8"))
    eventos = {e["id"]: e for e in datos["eventos"]}
    pendientes = {ev: nodo for ev, nodo in mapa["imagenes"].items()
                  if ev in eventos and not eventos[ev].get("imagen")}
    if not pendientes:
        print("Todos los eventos ya tienen imagen.")
        return
    print(f"Pidiendo {len(pendientes)} imágenes a Figma…")
    token = leer_token()
    ids = ",".join(pendientes.values())
    respuesta = json.loads(pedir(
        f"https://api.figma.com/v1/images/{mapa['archivo']}?ids={ids}&format=jpg&scale=1", token))
    if respuesta.get("err"):
        sys.exit(f"Figma respondió con un error: {respuesta['err']}")
    urls = respuesta["images"]

    hechas = 0
    for ev, nodo in pendientes.items():
        url = urls.get(nodo)
        if not url:
            print(f"  {ev}: Figma no ha devuelto imagen")
            continue
        with open(os.path.join(IMAGENES, f"{ev}.jpg"), "wb") as f:
            f.write(pedir(url))
        eventos[ev]["imagen"] = f"img/{ev}.jpg"
        hechas += 1
        print(f"  {ev}: ok")

    hacer_copia()
    with open(DATOS, "w", encoding="utf-8") as f:
        f.write(volcar(datos))
    print(f"Listo: {hechas} imágenes añadidas.")


if __name__ == "__main__":
    main()
