"""Hoja de contacto: la captura de escritorio y la de celular de una pantalla,
lado a lado, para mirarlas de un vistazo. Uso:
    py -3.12 auditoria/herramientas/hoja.py <app> <fase> <ruta-archivo> <rol> [tema_escritorio] [tema_movil]
p. ej. hoja.py portal antes dashboard orgadmin oscuro claro  →  capturas/portal/antes/_hoja__dashboard__orgadmin.png
"""
import sys
from pathlib import Path
from PIL import Image

app, fase, nombre, rol = sys.argv[1:5]
tema_e = sys.argv[5] if len(sys.argv) > 5 else 'oscuro'
tema_m = sys.argv[6] if len(sys.argv) > 6 else 'claro'
base = Path(__file__).resolve().parent.parent / 'capturas' / app / fase
esc = Image.open(base / f'{nombre}__{rol}__escritorio-{tema_e}.png').convert('RGB')
mov = Image.open(base / f'{nombre}__{rol}__movil-{tema_m}.png').convert('RGB')
esc = esc.resize((720, round(esc.height * 720 / esc.width)))
mov = mov.resize((360, round(mov.height * 360 / mov.width)))
alto = max(esc.height, mov.height)
hoja = Image.new('RGB', (720 + 24 + 360, alto), (128, 128, 128))
hoja.paste(esc, (0, 0))
hoja.paste(mov, (744, 0))
salida = base / f'_hoja__{nombre}__{rol}.png'
hoja.save(salida)
print(salida)
