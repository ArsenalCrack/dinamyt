"""
Modelo: Usuario
Roles: admin (gestiona campeonatos, tatamis, jueces) | maestro (inscribe a sus
alumnos y, si el admin se lo permite, puntúa como juez) | juez (puntúa combates)
"""

import os
from datetime import datetime, timezone
from ..extensions import db
import bcrypt

# Roles válidos del sistema. `rol` es un String (no Enum de BD) para poder
# ampliar la lista sin migrar el tipo en bases existentes; la validez se
# comprueba en la API. La jerarquía admin>maestro>juez se apoya además en
# `es_superadmin` (booleano aparte) y en `creado_por_id` (workspace).
ROLES_VALIDOS = ("admin", "maestro", "juez")

# Costo (rondas) de bcrypt al hashear contraseñas. 12 (el default de la
# librería) tarda ~0.5 s en un PC y 1.5–3 s en la CPU compartida del plan
# gratis de Render: cada login se siente lento y, bajo eventlet de un solo
# worker, bloquea TODO el proceso mientras calcula. 10 rondas siguen siendo
# seguras y son ~4× más rápidas. Ajustable por entorno si se quiere más costo.
BCRYPT_ROUNDS = int(os.getenv("BCRYPT_ROUNDS", "10"))


class Usuario(db.Model):
    __tablename__ = "usuarios"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    nombre = db.Column(db.String(150), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    # String (no Enum de BD): en SQLite el Enum se guarda como VARCHAR sin
    # CHECK y ampliar la lista de roles no requiere migración de tipo. La
    # validez del valor la impone la API (ver ROLES_VALIDOS).
    rol = db.Column(db.String(20), nullable=False, default="juez")
    # Jerarquía: superadmin > admin > juez. El superadmin (el admin sembrado)
    # ve y gestiona TODO; un admin normal solo su propio workspace (los jueces,
    # campeonatos y competidores que él creó). Booleano aparte y no un tercer
    # valor del Enum para no requerir migración del tipo en bases existentes.
    es_superadmin = db.Column(db.Boolean, default=False, nullable=True)
    # Club del maestro: lo fija el admin al crear al usuario maestro. Los
    # alumnos que ese maestro inscribe toman automáticamente este club.
    club = db.Column(db.String(80), nullable=True)
    # Permiso extra para que un maestro también pueda ser asignado a un tatami
    # como juez (sin necesidad de una segunda cuenta). Solo aplica a maestros.
    puede_juzgar = db.Column(db.Boolean, default=False, nullable=True)
    activo = db.Column(db.Boolean, default=True, nullable=False)
    creado_por_id = db.Column(
        db.Integer, db.ForeignKey("usuarios.id"), nullable=True, index=True
    )
    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    eliminado_at = db.Column(db.DateTime, nullable=True)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relaciones
    campeonatos_creados = db.relationship(
        "Campeonato", backref="creador", lazy="dynamic"
    )
    asignaciones = db.relationship(
        "AsignacionJuez",
        foreign_keys="AsignacionJuez.usuario_id",
        backref="usuario",
        lazy="dynamic",
    )
    asignaciones_creadas = db.relationship(
        "AsignacionJuez",
        foreign_keys="AsignacionJuez.asignado_por_id",
        backref="asignado_por",
        lazy="dynamic",
    )
    accesos = db.relationship(
        "AccesoTatami", backref="usuario", lazy="dynamic"
    )
    creado_por = db.relationship(
        "Usuario",
        remote_side=[id],
        foreign_keys=[creado_por_id],
        backref="usuarios_creados",
    )

    def set_password(self, password: str):
        """Hashea y almacena la contraseña."""
        salt = bcrypt.gensalt(BCRYPT_ROUNDS)
        self.password_hash = bcrypt.hashpw(
            password.encode("utf-8"), salt
        ).decode("utf-8")

    def check_password(self, password: str) -> bool:
        """Verifica la contraseña contra el hash almacenado."""
        return bcrypt.checkpw(
            password.encode("utf-8"),
            self.password_hash.encode("utf-8"),
        )

    @property
    def es_super(self) -> bool:
        """True si es superadmin (la columna puede ser NULL en bases viejas)."""
        return self.rol == "admin" and bool(self.es_superadmin)

    @property
    def es_maestro(self) -> bool:
        return self.rol == "maestro"

    @property
    def puede_ser_juez(self) -> bool:
        """True si el usuario puede asignarse a un tatami: un juez, o un
        maestro con el permiso `puede_juzgar` activado por el admin."""
        return self.rol == "juez" or (self.rol == "maestro" and bool(self.puede_juzgar))

    def necesita_rehash(self) -> bool:
        """True si el hash guardado usa más rondas que las configuradas.

        Permite migrar de forma transparente a un costo menor: tras un login
        correcto, el endpoint vuelve a hashear la contraseña con BCRYPT_ROUNDS,
        así los usuarios creados con 12 rondas pasan a 10 en su próximo ingreso.
        """
        try:
            rondas = int(self.password_hash.split("$")[2])
        except (AttributeError, IndexError, ValueError):
            return True
        return rondas > BCRYPT_ROUNDS

    def to_dict(self, include_asignaciones=False):
        data = {
            "id": self.id,
            "email": self.email,
            "nombre": self.nombre,
            "rol": self.rol,
            "es_superadmin": self.es_super,
            "club": self.club,
            "puede_juzgar": bool(self.puede_juzgar),
            "activo": self.activo,
            "creado_por_id": self.creado_por_id,
            "creado_por": (
                {
                    "id": self.creado_por.id,
                    "nombre": self.creado_por.nombre,
                    "email": self.creado_por.email,
                }
                if self.creado_por else None
            ),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "eliminado_at": self.eliminado_at.isoformat() if self.eliminado_at else None,
        }
        if include_asignaciones:
            data["asignaciones"] = [
                a.to_dict(include_usuario=False) for a in self.asignaciones.all()
            ]
        return data

    def __repr__(self):
        return f"<Usuario {self.email} ({self.rol})>"
