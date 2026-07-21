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
    },
    "competidores": {
        "categoria_especial": "BOOLEAN",
        # Fecha de última actualización de datos (peso/cinturón cambian entre
        # campeonatos). NULL en filas viejas = nunca actualizado tras crearse.
        "updated_at": "DATETIME",
    },
}


def ensure_optional_columns():
    """Agrega columnas nuevas cuando la base existente fue creada con una version previa."""
    inspector = inspect(db.engine)
    table_names = set(inspector.get_table_names())

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
