"""
Modelo: Campeonato
Un campeonato agrupa tatamis y tiene fechas.
Soporta múltiples campeonatos simultáneos.
"""

from datetime import datetime, timezone
from ..extensions import db


class Campeonato(db.Model):
    __tablename__ = "campeonatos"

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(255), nullable=False)
    descripcion = db.Column(db.Text, nullable=True)
    fecha_inicio = db.Column(db.Date, nullable=True)
    fecha_fin = db.Column(db.Date, nullable=True)
    activo = db.Column(db.Boolean, default=True, nullable=False)
    # Config de categorías por modalidad para la generación automática de
    # llaves: {"modalidades": [{nombre, tipo, activa, categorias: {...}}]}.
    # NULL = el admin todavía no configuró (el flujo manual no la necesita).
    config_categorias = db.Column(db.JSON, nullable=True)
    # UUID estable para exportar/publicar los resultados en otra instancia.
    # Se genera la primera vez que se exporta (ver api/resultados.py). Permite
    # que reimportar el mismo campeonato REEMPLACE el snapshot, no lo duplique.
    export_uuid = db.Column(db.String(64), nullable=True, index=True)
    created_by = db.Column(
        db.Integer, db.ForeignKey("usuarios.id"), nullable=True
    )
    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # Relaciones
    tatamis = db.relationship(
        "Tatami", backref="campeonato", lazy="dynamic", cascade="all, delete-orphan"
    )
    inscripciones = db.relationship(
        "Inscripcion", backref="campeonato", lazy="dynamic",
        cascade="all, delete-orphan",
    )

    def to_dict(self, include_tatamis=False):
        data = {
            "id": self.id,
            "nombre": self.nombre,
            "descripcion": self.descripcion,
            "fecha_inicio": self.fecha_inicio.isoformat() if self.fecha_inicio else None,
            "fecha_fin": self.fecha_fin.isoformat() if self.fecha_fin else None,
            "activo": self.activo,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "num_tatamis": self.tatamis.count() if self.tatamis else 0,
            "num_inscripciones": self.inscripciones.count() if self.inscripciones else 0,
        }
        if include_tatamis:
            data["tatamis"] = [t.to_dict() for t in self.tatamis.all()]
            data["config_categorias"] = self.config_categorias
        return data

    def __repr__(self):
        return f"<Campeonato {self.nombre}>"
