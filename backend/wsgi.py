"""
DINAMYT Backend — Punto de entrada WSGI para producción.

Render / gunicorn lo usan así (un solo worker, obligatorio):
    gunicorn -k eventlet -w 1 wsgi:app

El estado de los tatamis, los rooms de Socket.IO y el limitador de
intentos viven en la memoria del proceso: NUNCA usar más de 1 worker.
"""
import os

from dotenv import load_dotenv

load_dotenv()

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402

app = create_app(os.getenv("FLASK_ENV", "production"))

# Crear tablas y seeds en el primer arranque (idempotente)
with app.app_context():
    db.create_all()
    from app.schema_compat import ensure_optional_columns
    ensure_optional_columns()

    from app.seeds.seed_categorias import seed_categorias
    from app.seeds.seed_admin import seed_admin
    seed_categorias()
    seed_admin(app.config)

    # Red de seguridad por workspace. Se aplica DESPUÉS de los seeds: las
    # políticas filtran por created_by, y sembrar con ellas puestas obligaría a
    # dar contexto a cada seed sin ganar nada (aquí no hay petición de nadie).
    # En SQLite es un no-op; solo hace algo con PostgreSQL.
    from app.rls import ensure_rls, estado_rls
    if ensure_rls():
        ok, motivo = estado_rls()
        print("[OK] RLS activo." if ok else f"[SEGURIDAD] RLS no protege: {motivo}")
