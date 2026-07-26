"""Compatibilidad ligera de esquema para instalaciones locales sin migraciones."""

from sqlalchemy import inspect, text

from .extensions import db


OPTIONAL_COLUMNS = {
    "usuarios": {
        # Identidad estable entre instancias (local ↔ online). Ver app/uid.py.
        "uid": "VARCHAR(32)",
        "creado_por_id": "INTEGER",
        "eliminado_at": "DATETIME",
        # Jerarquía: el superadmin ve todos los workspaces; un admin normal
        # solo ve lo que él creó (sus jueces, campeonatos y competidores).
        "es_superadmin": "BOOLEAN",
        # Rol maestro: club (lo fija el admin) y permiso para juzgar.
        "club": "VARCHAR(80)",
        "puede_juzgar": "BOOLEAN",
        # Delegación del maestro: ciudad de origen y país derivado.
        "delegacion": "VARCHAR(120)",
        "pais_delegacion": "VARCHAR(80)",
    },
    "asignaciones_juez": {
        "uid": "VARCHAR(32)",
        "asignado_por_id": "INTEGER",
    },
    "tatamis": {
        "uid": "VARCHAR(32)",
    },
    "llaves": {
        "uid": "VARCHAR(32)",
        "tatami_id": "INTEGER",
        "tipo": "VARCHAR(20)",
        "descripcion": "TEXT",
        "estado": "VARCHAR(20)",
        "seccion_clave": "VARCHAR(300)",
    },
    "campeonatos": {
        "config_categorias": "JSON",
        "export_uuid": "VARCHAR(64)",
        # Detalles públicos + ciclo de vida (preparacion/en_curso/finalizado).
        "lugar": "VARCHAR(120)",
        "ciudad": "VARCHAR(120)",
        "pais": "VARCHAR(120)",
        "estado": "VARCHAR(20)",
    },
    "competidores": {
        "uid": "VARCHAR(32)",
        "categoria_especial": "BOOLEAN",
        # Fecha de última actualización de datos (peso/cinturón cambian entre
        # campeonatos). NULL en filas viejas = nunca actualizado tras crearse.
        "updated_at": "DATETIME",
    },
    "inscripciones": {
        "uid": "VARCHAR(32)",
        # Moderación de inscripciones enviadas por maestros.
        "estado": "VARCHAR(20)",
        "created_by": "INTEGER",
        "motivo_rechazo": "TEXT",
    },
}

# Valores por defecto para filas creadas ANTES de que existiera la columna
# (se aplican una sola vez, solo donde el valor quedó NULL tras el ALTER).
BACKFILL = {
    # Las inscripciones previas eran todas del admin → participan.
    "inscripciones": {"estado": "aceptada"},
    # Los campeonatos previos arrancan en preparación.
    "campeonatos": {"estado": "preparacion"},
}


def _ensure_usuarios_rol_width(inspector, table_names):
    """Amplía usuarios.rol si una instalación vieja quedó con VARCHAR(5)."""
    if "usuarios" not in table_names:
        return

    columnas = {col["name"]: col for col in inspector.get_columns("usuarios")}
    rol = columnas.get("rol")
    if not rol:
        return

    tipo = rol["type"]
    largo = getattr(tipo, "length", None)
    valores_enum = getattr(tipo, "enums", None)
    necesita_ensanchar = largo is not None and largo < 20
    necesita_salir_de_enum = valores_enum is not None and "maestro" not in valores_enum
    if not necesita_ensanchar and not necesita_salir_de_enum:
        return

    dialecto = db.engine.dialect.name
    if dialecto == "postgresql":
        db.session.execute(
            text("ALTER TABLE usuarios ALTER COLUMN rol TYPE VARCHAR(20) USING rol::text")
        )
    elif dialecto in {"mysql", "mariadb"}:
        db.session.execute(text("ALTER TABLE usuarios MODIFY COLUMN rol VARCHAR(20) NOT NULL"))
    elif dialecto == "sqlite":
        # SQLite no aplica el largo de VARCHAR; dejarlo como está evita reconstruir
        # la tabla y preserva llaves/indices de instalaciones locales antiguas.
        return
    else:
        return

    db.session.commit()


def ensure_optional_columns():
    """Agrega columnas nuevas cuando la base existente fue creada con una version previa."""
    inspector = inspect(db.engine)
    table_names = set(inspector.get_table_names())
    _ensure_usuarios_rol_width(inspector, table_names)

    for table_name, columns in OPTIONAL_COLUMNS.items():
        if table_name not in table_names:
            continue
        existing = {col["name"] for col in inspector.get_columns(table_name)}
        for column_name, column_type in columns.items():
            if column_name in existing:
                continue
            db.session.execute(
                text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
            )
    db.session.commit()

    # Backfill de valores por defecto donde el ALTER dejó NULL (idempotente).
    for table_name, valores in BACKFILL.items():
        if table_name not in table_names:
            continue
        columnas = {col["name"] for col in inspect(db.engine).get_columns(table_name)}
        for column_name, valor in valores.items():
            if column_name not in columnas:
                continue
            db.session.execute(
                text(
                    f"UPDATE {table_name} SET {column_name} = :valor "
                    f"WHERE {column_name} IS NULL"
                ),
                {"valor": valor},
            )
    db.session.commit()

    _ensure_indices_uid(table_names)

    # Los uid llevan un valor DISTINTO por fila, así que no salen de un UPDATE
    # plano como el resto: los genera el backfill de app/uid.py.
    from .uid import backfill_uids
    rellenados = backfill_uids()
    if rellenados:
        print(f"  [OK] Identidad de sincronización asignada a {rellenados} registro(s)")


def _ensure_indices_uid(table_names):
    """Índice por uid en las bases que recibieron la columna con ALTER TABLE.

    `db.create_all()` sí crea el índice en una base nueva, pero un ALTER TABLE
    solo agrega la columna. Sin el índice, emparejar por uid al importar haría
    un recorrido completo de la tabla.
    """
    indices = {
        "usuarios": "uid",
        "competidores": "uid",
        "tatamis": "uid",
        "asignaciones_juez": "uid",
        "inscripciones": "uid",
        "llaves": "uid",
        "campeonatos": "export_uuid",
    }
    for table_name, column_name in indices.items():
        if table_name not in table_names:
            continue
        # SQLite y PostgreSQL admiten los dos IF NOT EXISTS; el nombre es el
        # mismo que genera SQLAlchemy con index=True, así que no se duplica.
        db.session.execute(
            text(
                f"CREATE INDEX IF NOT EXISTS ix_{table_name}_{column_name} "
                f"ON {table_name} ({column_name})"
            )
        )
    db.session.commit()
