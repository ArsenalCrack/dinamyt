# -*- coding: utf-8 -*-
"""
Genera `badge-96.png`, el icono pequeño de las notificaciones, desde el logo.

    python scripts/icono-notificacion.py

Escribe el resultado en el `public/` del portal y en el de Membresías, que son
las dos apps que mandan avisos push. Necesita Pillow (`pip install pillow`).

── Por qué existe este script y no un PNG hecho a mano ──────────────────────

`badge` **no es una imagen: es una plantilla**. Android le quita todo el color
y se queda solo con el canal alfa, pintando de blanco lo que sea opaco. Con el
logo a color puesto ahí —el oro y el trazo oscuro son igual de opacos— lo que
salía era la silueta EXTERIOR entera: una mancha blanca dentro de un círculo de
color, donde apenas se adivinaba un trozo de la D y el pie que sobresale.

La solución no es recortar el logo a ojo, sino derivar el alfa de la
LUMINANCIA: el oro se queda opaco y el trazo oscuro —que es lo que separa las
formas— se va a transparente. Así los huecos del dibujo viajan dentro de la
silueta y la D se sigue leyendo con su figura.

Y por eso es un script: el día que cambie el logo, el icono de las
notificaciones se vuelve a sacar de él en un comando, en vez de quedarse
señalando a un dibujo que ya no existe.

── Las tres decisiones que no son obvias ────────────────────────────────────

1. **La rampa va alta** (120–200 sobre 255). Los grises intermedios son el
   antialias del trazo oscuro; mandarlos a transparente es justo lo que abre el
   hueco entre la D y la figura.

2. **Las separaciones se ensanchan** (`EROSION`). En el original miden dos
   píxeles de 256, y al bajar a los 24 puntos de la barra de estado
   desaparecen: la figura se vuelve a fundir con la D y estamos donde
   empezamos. Tres pasos abren el hueco sin comerse los brazos y las piernas
   —con cuatro o cinco, la figura se convierte en un palo—.

3. **Lleva margen** (76 de 96). Android mete este icono dentro de un círculo en
   la bandeja de notificaciones, y sin margen la pierna que sobresale se queda
   fuera del recorte.
"""
import sys

try:
    from PIL import Image, ImageFilter
except ImportError:  # pragma: no cover
    sys.exit('Hace falta Pillow: pip install pillow')

ORIGEN = 'apps/ecosystem-portal/public/logo.png'

DESTINOS = [
    'apps/ecosystem-portal/public/badge-96.png',
    # Membresías vive en su propio repositorio (OPERAR §1.1). Si no está
    # clonado al lado, se salta: el del portal se genera igual.
    '../dinamyt-membresias/apps/membresias-web/public/badge-96.png',
]

#: Por debajo del primero todo se va; por encima del segundo todo se queda.
OSCURO, CLARO = 120, 200

#: Pasos de erosión sobre el original de 256 px. Ver la nota 2 de arriba.
EROSION = 3

#: Lienzo del icono, y cuánto de él puede ocupar el dibujo.
LADO = 96
CONTENIDO = 76


def alfa_por_luminancia(im: 'Image.Image') -> 'Image.Image':
    """El canal alfa del icono: opaco donde el logo es claro."""
    im = im.convert('RGBA')
    ancho, alto = im.size
    fuente = im.load()
    alfa = Image.new('L', (ancho, alto), 0)
    destino = alfa.load()
    for y in range(alto):
        for x in range(ancho):
            r, g, b, a = fuente[x, y]
            if a == 0:
                continue
            lum = (r * 299 + g * 587 + b * 114) // 1000
            if lum <= OSCURO:
                nuevo = 0
            elif lum >= CLARO:
                nuevo = 255
            else:
                nuevo = int(255 * (lum - OSCURO) / (CLARO - OSCURO))
            # El alfa original manda: un píxel medio transparente del borde no
            # puede volverse sólido solo por ser claro.
            destino[x, y] = nuevo * a // 255
    return alfa


def erosionar(alfa: 'Image.Image', pasos: int) -> 'Image.Image':
    """Come el borde de lo opaco. Cada paso ensancha los huecos por los dos lados."""
    for _ in range(pasos):
        alfa = alfa.filter(ImageFilter.MinFilter(3))
    return alfa


def encajar(alfa: 'Image.Image', lado: int, contenido: int) -> 'Image.Image':
    """Recorta al dibujo, lo escala al tamaño útil y lo centra con su margen."""
    glifo = Image.merge('RGBA', (
        Image.new('L', alfa.size, 255),
        Image.new('L', alfa.size, 255),
        Image.new('L', alfa.size, 255),
        alfa,
    ))
    caja = glifo.getbbox()
    if not caja:
        sys.exit('El glifo salió vacío: la rampa se comió el dibujo entero.')
    recorte = glifo.crop(caja)
    ancho, alto = recorte.size
    escala = contenido / max(ancho, alto)
    escalado = recorte.resize(
        (max(1, round(ancho * escala)), max(1, round(alto * escala))),
        Image.LANCZOS,
    )
    lienzo = Image.new('RGBA', (lado, lado), (255, 255, 255, 0))
    lienzo.paste(
        escalado,
        ((lado - escalado.size[0]) // 2, (lado - escalado.size[1]) // 2),
    )
    return lienzo


def main() -> None:
    try:
        original = Image.open(ORIGEN)
    except FileNotFoundError:
        sys.exit('No encuentro %s. Corre esto desde la raíz del monorepo.' % ORIGEN)

    badge = encajar(erosionar(alfa_por_luminancia(original), EROSION), LADO, CONTENIDO)

    escritos = 0
    for destino in DESTINOS:
        try:
            badge.save(destino)
        except (FileNotFoundError, OSError):
            # Sin acentos ni símbolos: la consola de Windows escribe en cp1252 y
            # un carácter de más aquí revienta el script después de haber hecho
            # su trabajo, que es la peor forma de fallar.
            print('  (falta)  %s' % destino)
            continue
        print('  escrito  %s (%dx%d)' % (destino, LADO, LADO))
        escritos += 1

    if not escritos:
        sys.exit('No se pudo escribir en ningún destino.')


if __name__ == '__main__':
    main()
