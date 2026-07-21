"""Compatibilidad ligera de esquema para instalaciones locales sin migraciones."""

from sqlalchemy import inspect, text

from .extensions import db


OPTIONAL_COLUMNS = {
    "usuarios": {
        "creado_por_id": "INTEGER",
        "eliminado_at": "DATETIME",
        # Jerarquía: el superadmin ve todos los workspaces; un admin normal
        # solo ve lo que él creó (sus jueces, campeonatos y competidores).
        "es_superadmin": "BOOLEAN",
        # Rol maestro: club (lo fija el admin) y permiso para juzgar.
        "club": "VARCHAR(80)",
        "puede_juzgar": "BOOLEAN",
    },
    "asignaciones_juez": {
        "asignado_por_id": "INTEGER",
    },
    "llaves": {
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
        "categoria_especial": "BOOLEAN",
        # Fecha de última actualización de datos (peso/cinturón cambian entre
        # campeonatos). NULL en filas viejas = nunca actualizado tras crearse.
        "updated_at": "DATETIME",
    },
    "inscripciones": {
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
