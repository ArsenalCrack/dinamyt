"""
Modelo: Ajuste — interruptores globales de la instalación.

Clave → valor JSON. Hoy solo lo usa el modo mantenimiento (ver
`app/mantenimiento.py`), y por eso es una tabla de dos columnas y no una fila
con una columna por opción: añadir el siguiente interruptor no obliga a migrar
el esquema de nadie.

Es GLOBAL, no de un workspace: lo que se guarda aquí lo decide el superadmin y
afecta a toda la instalación. Por eso queda fuera de las políticas de RLS
(ver `app/rls.py`), que acotan datos de un admin frente a otro.
"""

from datetime import datetime, timezone

from ..extensions import db


class Ajuste(db.Model):
    __tablename__ = "ajustes"

    clave = db.Column(db.String(60), primary_key=True)
    # JSON y no texto: así un ajuste puede guardar varios datos a la vez (el de
    # mantenimiento guarda si está activo, el aviso y desde cuándo) sin inventar
    # un formato de serialización propio.
    valor = db.Column(db.JSON, nullable=True)
    actualizado_por_id = db.Column(
        db.Integer, db.ForeignKey("usuarios.id"), nullable=True
    )
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self):
        return f"<Ajuste {self.clave}>"
