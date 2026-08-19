"""Configuración común de los tests."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from app.security import reiniciar_limites  # noqa: E402


@pytest.fixture(autouse=True)
def _limites_en_blanco():
    """
    Deja el rate limiting en blanco antes de cada test.

    El contador vive en el proceso, así que sin esto los ~140 tests van
    sumando peticiones desde la misma IP (127.0.0.1) y en algún punto de la
    suite empiezan a salir 429 en tests que no tienen nada que ver.
    """
    reiniciar_limites()
    yield
