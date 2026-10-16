"""Compara dos fases de capturas, píxel a píxel.

Para los cambios que NO deben verse (pasar estilos en línea a clases, mover
código): todo lo que salga distinto es un fallo. Uso:
    py -3.12 auditoria/herramientas/comparar.py <app> <fase-a> <fase-b>
Escribe `capturas/<app>/_dif__<a>__<b>/` con una imagen por pantalla que
cambió (las zonas distintas, en rojo) y lista cuánto cambió cada una.
"""
import sys
from pathlib import Path
from PIL import Image, ImageChops

app, a, b = sys.argv[1:4]
base = Path(__file__).resolve().parent.parent / 'capturas' / app
salida = base / f'_dif__{a}__{b}'
salida.mkdir(exist_ok=True)
distintas = 0
for pa in sorted((base / a).glob('*.png')):
    pb = base / b / pa.name
    if not pb.exists():
        print(f'falta en {b}: {pa.name}')
        continue
    ia, ib = Image.open(pa).convert('RGB'), Image.open(pb).convert('RGB')
    if ia.size != ib.size:
        print(f'TAMAÑO  {pa.name}: {ia.size} → {ib.size}')
        distintas += 1
        continue
    dif = ImageChops.difference(ia, ib).convert('L').point(lambda v: 255 if v > 24 else 0)
    n = sum(1 for v in dif.getdata() if v)
    if n:
        distintas += 1
        pct = 100 * n / (ia.size[0] * ia.size[1])
        print(f'{pct:6.3f} %  {pa.name}')
        marca = ib.copy()
        marca.paste((255, 0, 0), mask=dif)
        marca.save(salida / pa.name)
print(f'{distintas} distintas')
