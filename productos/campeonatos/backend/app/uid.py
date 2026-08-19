"""
Identidad estable entre instancias (software LOCAL ↔ software ONLINE).

Todas las tablas usan una PK entera autoincremental: el usuario `id=7` del
servidor online es OTRA persona en el software local. Si se exportara e
importara por id, cada traspaso duplicaría gente o mezclaría registros.

Por eso cada fila sincronizable lleva además un `uid`: un UUID hexadecimal de
32 caracteres que NO cambia al viajar de una instancia a otra. El importador
empareja primero por `uid`; si no encuentra, cae a la clave natural (email del
usuario, documento del competidor…) y solo entonces crea la fila
(ver `api/sincronizacion.py`).

- El uid NUNCA se muestra en la interfaz: es interno del exportador/importador.
- Las filas nuevas lo reciben solas (`default=nuevo_uid` en cada modelo).
- Las bases que ya existían lo reciben con `backfill_uids()`, que corre al
  arrancar desde `schema_compat.ensure_optional_columns()`.
- `Campeonato` no tiene columna `uid`: reutiliza la `export_uuid` que ya usaba
  para publicar resultados, de modo que el paquete completo y el snapshot de
  resultados hablen SIEMPRE del mismo campeonato.

La columna no se declara UNIQUE a propósito: SQLite no admite agregar una
columna única con ALTER TABLE, y las bases locales se actualizan justamente
así. La unicidad la garantiza el generador (UUID4) y la respeta el importador,
que nunca inserta un uid que ya existe.
"""

import uuid

# Modelos que participan en la sincronización, con el atributo donde guardan su
# uid. El orden es el de dependencia (primero los que nadie referencia): lo
# aprovechan el backfill y el importador.
def _modelos_sincronizables():
    """[(modelo, nombre_del_campo)] — import perezoso para evitar ciclos."""
    from .models.asignacion import AsignacionJuez
    from .models.campeonato import Campeonato
    from .models.competidor import Competidor, Inscripcion
    from .models.llave import Llave
    from .models.tatami import Tatami
    from .models.usuario import Usuario

    return [
        (Usuario, "uid"),
        (Competidor, "uid"),
        (Campeonato, "export_uuid"),
        (Tatami, "uid"),
        (AsignacionJuez, "uid"),
        (Inscripcion, "uid"),
        (Llave, "uid"),
    ]


def nuevo_uid() -> str:
    """UUID4 en hexadecimal (32 caracteres, sin guiones)."""
    return uuid.uuid4().hex


def campo_uid(obj) -> str:
    """Nombre del atributo donde `obj` guarda su uid (ver nota de Campeonato)."""
    return "uid" if hasattr(obj, "uid") else "export_uuid"


def uid_de(obj):
    """uid actual del objeto, o None si todavía no tiene."""
    if obj is None:
        return None
    return getattr(obj, campo_uid(obj), None) or None


def asegurar_uid(obj) -> str:
    """uid del objeto, generándolo si le falta (filas anteriores al backfill).

    No hace commit: el llamador decide cuándo persistir.
    """
    campo = campo_uid(obj)
    valor = uid_de(obj)
    if not valor:
        valor = nuevo_uid()
        setattr(obj, campo, valor)
    return valor


def backfill_uids() -> int:
    """Asigna uid a las filas creadas antes de que existiera la columna.

    Se genera uno distinto por fila, así que no puede hacerse con un UPDATE
    plano (a diferencia del resto de valores por defecto de `schema_compat`).
    Es idempotente: solo toca las filas con uid NULL. Devuelve cuántas rellenó.
    """
    from .extensions import db

    total = 0
    for modelo, campo in _modelos_sincronizables():
        columna = getattr(modelo, campo)
        for fila in modelo.query.filter(columna.is_(None)).all():
            setattr(fila, campo, nuevo_uid())
            total += 1
    if total:
        db.session.commit()
    return total
