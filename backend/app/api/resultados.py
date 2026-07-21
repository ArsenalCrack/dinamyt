"""
API: Resultados públicos (sin login)

Expone los podios y rankings ya definidos de un campeonato para que el público
—competidores y familias— consulte quién quedó en cada categoría, sin cuenta.

Solo lee campeonatos ACTIVOS (misma visibilidad que la pantalla pública) y solo
resultados ya cerrados:
- Llaves de combate terminadas → podio 1°/2°/3°.
- Categorías de figuras calificadas → ranking completo.
- Combates sueltos (fuera de llave) guardados → ganador.

Cada resultado incluye `participantes` (todos los nombres involucrados) para que
el front permita BUSCAR por nombre: un competidor se encuentra entre cientos.
"""

from flask import Blueprint, jsonify

from ..models.campeonato import Campeonato
from ..models.tatami import Tatami, SesionTatami
from ..models.combate import Combate
from ..models.llave import Llave
from ..timeutil import iso_utc
from .llaves import podio_llave

resultados_bp = Blueprint("resultados", __name__)


@resultados_bp.route("/campeonatos", methods=["GET"])
def listar_campeonatos():
    """
    GET /api/resultados/campeonatos — Campeonatos activos con nº de resultados.
    Sin login. Lo usa el selector de la página pública de resultados.
    """
    campeonatos = (
        Campeonato.query.filter_by(activo=True)
        .order_by(Campeonato.created_at.desc())
        .all()
    )
    result = []
    for c in campeonatos:
        result.append({
            "id": c.id,
            "nombre": c.nombre,
            "num_resultados": _contar_resultados(c.id),
        })
    return jsonify(result), 200


def _tatami_numeros(camp_id):
    """{tatami_id: numero} de los tatamis del campeonato."""
    return {
        t.id: t.numero
        for t in Tatami.query.filter_by(campeonato_id=camp_id).all()
    }


def _sesion_a_tatami(camp_id):
    """{sesion_id: tatami_id} para mapear combates guardados a su tatami."""
    tatami_ids = [t.id for t in Tatami.query.filter_by(campeonato_id=camp_id).all()]
    if not tatami_ids:
        return {}
    return {
        s.id: s.tatami_id
        for s in SesionTatami.query.filter(
            SesionTatami.tatami_id.in_(tatami_ids)
        ).all()
    }


def _combates_del_campeonato(camp_id):
    """Combates guardados (figuras + sueltos) de todos los tatamis del campeonato."""
    sesion_map = _sesion_a_tatami(camp_id)
    if not sesion_map:
        return [], {}
    combates = (
        Combate.query.filter(Combate.sesion_tatami_id.in_(list(sesion_map.keys())))
        .order_by(Combate.created_at.desc())
        .all()
    )
    return combates, sesion_map


def _contar_resultados(camp_id):
    """Nº aproximado de tarjetas de resultado (para el selector)."""
    llaves = [
        l for l in Llave.query.filter_by(campeonato_id=camp_id).all()
        if l.tipo_norm == "combate" and podio_llave(l.estructura)
    ]
    combates, _ = _combates_del_campeonato(camp_id)
    figuras_o_sueltos = [
        c for c in combates
        if (c.jueces_detalle or {}).get("tipo") == "figuras"
        or not (c.jueces_detalle or {}).get("llave")
    ]
    return len(llaves) + len(figuras_o_sueltos)


def _nombre_categoria(combate):
    detalle = combate.jueces_detalle or {}
    if detalle.get("nombre_categoria"):
        return detalle["nombre_categoria"]
    if combate.categoria and combate.categoria.nombre:
        return combate.categoria.nombre
    return "Combate"


@resultados_bp.route("/campeonato/<int:camp_id>", methods=["GET"])
def resultados_campeonato(camp_id):
    """
    GET /api/resultados/campeonato/:id — Resultados públicos del campeonato.
    404 si no existe o no está activo (no se exponen campeonatos ocultos).
    """
    camp = Campeonato.query.get(camp_id)
    if not camp or not camp.activo:
        return jsonify({"error": "Campeonato no encontrado"}), 404

    numeros = _tatami_numeros(camp_id)
    resultados = []

    # ── 1) Llaves de combate con podio (terminadas o con campeón) ──
    llaves = Llave.query.filter_by(campeonato_id=camp_id).all()
    for ll in llaves:
        if ll.tipo_norm != "combate":
            continue
        podio = podio_llave(ll.estructura)
        if not podio:
            continue
        comps = (ll.estructura or {}).get("competidores", [])
        resultados.append({
            "tipo": "combate",
            "id": f"llave-{ll.id}",
            "nombre": ll.nombre,
            "descripcion": ll.descripcion or "",
            "tatami_numero": numeros.get(ll.tatami_id),
            "podio": podio,
            "participantes": [c.get("nombre", "") for c in comps if c.get("nombre")],
            "num_competidores": len(comps),
            "fecha": iso_utc(ll.created_at),
        })

    # ── 2) Figuras y combates sueltos (desde los combates guardados) ──
    combates, sesion_map = _combates_del_campeonato(camp_id)
    for c in combates:
        detalle = c.jueces_detalle or {}
        tatami_num = numeros.get(sesion_map.get(c.sesion_tatami_id))
        es_figuras = detalle.get("tipo") == "figuras" or c.ronda_final == "figuras"

        if es_figuras:
            ranking = detalle.get("ranking") if isinstance(detalle.get("ranking"), list) else []
            resultados.append({
                "tipo": "figuras",
                "id": f"comb-{c.id}",
                "nombre": _nombre_categoria(c),
                "descripcion": (detalle.get("descripcion") or "").strip(),
                "tatami_numero": tatami_num,
                "ranking": [
                    {
                        "puesto": r.get("puesto"),
                        "nombre": r.get("nombre", "-"),
                        "club": r.get("club", ""),
                        "total": r.get("total", 0),
                        "especial": bool(r.get("especial")),
                        "empate": bool(r.get("empate")),
                    }
                    for r in ranking
                ],
                "participantes": [r.get("nombre", "") for r in ranking if r.get("nombre")],
                "num_competidores": len(ranking),
                "fecha": iso_utc(c.created_at),
            })
            continue

        # Combate suelto: los que pertenecen a una llave ya se muestran como
        # podio (arriba); aquí solo los combates individuales sin llave.
        if detalle.get("llave"):
            continue
        ganador_color = c.ganador
        ganador_nombre = (
            c.nombre_hong if ganador_color == "hong"
            else c.nombre_chung if ganador_color == "chung"
            else None
        )
        resultados.append({
            "tipo": "combate_suelto",
            "id": f"comb-{c.id}",
            "nombre": _nombre_categoria(c),
            "descripcion": "",
            "tatami_numero": tatami_num,
            "hong": {"nombre": c.nombre_hong, "marcador": c.marcador_hong or 0},
            "chung": {"nombre": c.nombre_chung, "marcador": c.marcador_chung or 0},
            "ganador": {"nombre": ganador_nombre, "color": ganador_color},
            "participantes": [
                n for n in (c.nombre_hong, c.nombre_chung)
                if n and n not in ("Hong", "Chung")
            ],
            "fecha": iso_utc(c.created_at),
        })

    # Listas para los filtros del front
    categorias = sorted({r["nombre"] for r in resultados if r.get("nombre")})
    tatamis = sorted({r["tatami_numero"] for r in resultados if r.get("tatami_numero")})

    return jsonify({
        "campeonato": {"id": camp.id, "nombre": camp.nombre},
        "resultados": resultados,
        "categorias": categorias,
        "tatamis": tatamis,
    }), 200
