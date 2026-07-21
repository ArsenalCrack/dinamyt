# Modelos de la base de datos DINAMYT
from .usuario import Usuario
from .campeonato import Campeonato
from .categoria import Categoria
from .tatami import Tatami, SesionTatami
from .asignacion import AsignacionJuez, AccesoTatami
from .combate import Combate, EventoCombate
from .competidor import Competidor, Inscripcion

__all__ = [
    "Usuario",
    "Campeonato",
    "Categoria",
    "Tatami",
    "SesionTatami",
    "AsignacionJuez",
    "AccesoTatami",
    "Combate",
    "EventoCombate",
    "Competidor",
    "Inscripcion",
]
