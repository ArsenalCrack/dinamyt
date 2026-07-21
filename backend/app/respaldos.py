"""
Respaldo automático de la base de datos local.

Durante un campeonato TODO vive en un archivo SQLite: si el disco falla o el
archivo se corrompe, se pierde el evento completo. Este módulo copia la BD
cada RESPALDO_MINUTOS (10 por defecto, 0 = desactivado) a
`instance/respaldos/`, usando la API de backup de SQLite (segura con la BD en
uso, a diferencia de copiar el archivo a mano). También copia el snapshot en
vivo de los tatamis. Conserva los últimos MAX_RESPALDOS.

Solo aplica al despliegue local con SQLite; con PostgreSQL en la nube el
proveedor ya hace sus propios respaldos.
"""

import os
import shutil
import sqlite3
import threading
import time
from datetime import datetime
from pathlib import Path

MAX_RESPALDOS = 20


def iniciar_respaldos(app):
    """Arranca el hilo de respaldos si la BD es SQLite (despliegue local)."""
    try:
        minutos = int(os.getenv("RESPALDO_MINUTOS", "10"))
    except ValueError:
        minutos = 10
    if minutos <= 0:
        print("  [OFF] Respaldos automáticos desactivados (RESPALDO_MINUTOS=0)")
        return

    with app.app_context():
        from .extensions import db
        url = db.engine.url
        if url.drivername != "sqlite" or not url.database:
            return
        origen = Path(url.database)
        if not origen.is_absolute():
            origen = Path(app.instance_path) / url.database

    destino_dir = origen.parent / "respaldos"
    snapshot = origen.parent / "tatami_states.json"

    def _un_respaldo():
        destino_dir.mkdir(parents=True, exist_ok=True)
        marca = datetime.now().strftime("%Y%m%d_%H%M%S")
        destino = destino_dir / f"dinamyt_{marca}.db"
        src = sqlite3.connect(str(origen))
        try:
            dst = sqlite3.connect(str(destino))
            try:
                with dst:
                    src.backup(dst)
            finally:
                dst.close()
        finally:
            src.close()
        if snapshot.exists():
            shutil.copy2(snapshot, destino_dir / f"tatami_states_{marca}.json")
        # Conservar solo los últimos MAX_RESPALDOS (de cada tipo)
        for patron in ("dinamyt_*.db", "tatami_states_*.json"):
            viejos = sorted(destino_dir.glob(patron))
            for archivo in viejos[:-MAX_RESPALDOS]:
                try:
                    archivo.unlink()
                except OSError:
                    pass
        return destino.name

    def _ciclo():
        while True:
            time.sleep(minutos * 60)
            try:
                nombre = _un_respaldo()
                print(f"  [OK] Respaldo automático de la BD: respaldos/{nombre}")
            except Exception as e:
                print(f"  [WARN] Falló el respaldo automático: {e}")

    threading.Thread(target=_ciclo, daemon=True, name="respaldos-bd").start()
    print(
        f"  [OK] Respaldo automático activo: cada {minutos} min "
        f"en {destino_dir} (se conservan {MAX_RESPALDOS})"
    )
