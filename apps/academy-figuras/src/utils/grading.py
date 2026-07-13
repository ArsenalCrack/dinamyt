"""
Módulo de calificación unificada del Sistema Inteligente de Hapkido.

Centraliza TODA la lógica de puntaje, calificación y correcciones que antes
estaba dispersa y contradictoria en varios archivos. Convierte el resultado
crudo del DTW en un reporte limpio y legible:

    - puntaje global (0-100)
    - calificación (Excelente / Bueno / Aceptable / Necesita mejora)
    - "qué se califica": detalle por articulación con su criterio
    - correcciones en lenguaje natural

La función `build_report()` devuelve un diccionario JSON-serializable que es
el CONTRATO usado por:
    - la interfaz gráfica (Streamlit)
    - el script de predicción (CLI)
    - el futuro microservicio REST que consumirá DINAMYT Academy (NestJS)

Mantener este contrato estable hace trivial la integración web posterior.
"""
from __future__ import annotations
from .config import Config


# Traducción de nombre interno -> nombre legible de la articulación
JOINT_LABELS = {
    "codo_izquierdo": "codo izquierdo",
    "codo_derecho": "codo derecho",
    "hombro_izquierdo": "hombro izquierdo",
    "hombro_derecho": "hombro derecho",
    "cadera_izquierda": "cadera izquierda",
    "cadera_derecha": "cadera derecha",
    "rodilla_izquierda": "rodilla izquierda",
    "rodilla_derecha": "rodilla derecha",
    "tobillo_izquierdo": "tobillo izquierdo",
    "tobillo_derecho": "tobillo derecho",
}


def score_to_grade(score: float) -> dict:
    """Convierte un puntaje [0,1] en su calificación según Config.GRADE_BANDS.

    Returns:
        dict con 'label' (etiqueta), 'description' (texto) y 'score_pct' (0-100).
    """
    score = max(0.0, min(1.0, float(score)))
    for min_score, label, description in Config.GRADE_BANDS:
        if score >= min_score:
            return {"label": label, "description": description,
                    "score_pct": round(score * 100, 1)}
    # Fallback (no debería ocurrir porque la última banda es 0.0)
    last = Config.GRADE_BANDS[-1]
    return {"label": last[1], "description": last[2], "score_pct": round(score * 100, 1)}


def grade_color(label: str) -> str:
    """Color hexadecimal asociado a cada calificación (para la GUI)."""
    return {
        "Excelente": "#16A34A",        # verde
        "Bueno": "#65A30D",            # verde-oliva
        "Aceptable": "#D97706",        # naranja
        "Necesita mejora": "#DC2626",  # rojo
    }.get(label, "#6B7280")


def _correction_severity(avg_diff: float) -> str:
    """Devuelve el nivel de severidad ('alta'/'media'/'baja') de una diferencia."""
    for min_deg, level, _template in Config.CORRECTION_BANDS:
        if avg_diff >= min_deg:
            return level
    return "baja"


def build_report(evaluation_result: dict, figure_name: str = "") -> dict:
    """Construye el reporte de evaluación unificado a partir del resultado DTW.

    Args:
        evaluation_result: salida de DTWEvaluator.evaluate_angles_only(), que
            contiene 'overall_score', 'joint_evaluations', 'corrections',
            'frame_deviations'.
        figure_name: nombre legible de la figura/kata evaluada.

    Returns:
        dict (JSON-serializable) con:
            - figure: nombre de la figura
            - overall: {score_pct, label, description, color}
            - criteria: explicación de QUÉ se califica
            - joints: lista por articulación [{name, score_pct, avg_diff_deg,
                      quality, status, severity, message}]
            - corrections: lista de mensajes en lenguaje natural (las que aplican)
            - frame_deviations: lista de desviaciones por frame (para graficar)
    """
    overall_score = float(evaluation_result.get("overall_score", 0.0))
    grade = score_to_grade(overall_score)
    grade["color"] = grade_color(grade["label"])

    joint_evals = evaluation_result.get("joint_evaluations", {})
    joints = []
    corrections = []
    for joint_key, ev in joint_evals.items():
        readable = JOINT_LABELS.get(joint_key, joint_key.replace("_", " "))
        avg_diff = float(ev.get("avg_difference_degrees", 0.0))
        score = float(ev.get("score", 0.0))
        needs_fix = avg_diff > Config.CORRECTION_MIN_DEGREES
        severity = _correction_severity(avg_diff) if needs_fix else None

        joint_entry = {
            "name": readable,
            "key": joint_key,
            "score_pct": round(score * 100, 1),
            "avg_diff_deg": round(avg_diff, 1),
            "max_diff_deg": round(float(ev.get("max_difference_degrees", 0.0)), 1),
            "quality": ev.get("quality", ""),
            "status": "corregir" if needs_fix else "correcto",
            "severity": severity,
        }
        joints.append(joint_entry)

    # Las correcciones ya vienen formateadas por el evaluador; las ordenamos
    # de mayor a menor diferencia para mostrar primero lo más importante.
    raw_corrections = sorted(
        evaluation_result.get("corrections", []),
        key=lambda c: c.get("avg_diff", 0.0),
        reverse=True,
    )
    for c in raw_corrections:
        corrections.append({
            "joint": JOINT_LABELS.get(c.get("joint", ""), c.get("joint", "")),
            "avg_diff_deg": round(float(c.get("avg_diff", 0.0)), 1),
            "severity": _correction_severity(float(c.get("avg_diff", 0.0))),
            "message": c.get("message", ""),
        })

    # Ordenar articulaciones: primero las que necesitan corrección.
    joints.sort(key=lambda j: (j["status"] != "corregir", -j["avg_diff_deg"]))

    deviations = evaluation_result.get("frame_deviations", [])
    try:
        deviations = [round(float(d), 3) for d in deviations]
    except TypeError:
        deviations = []

    return {
        "figure": figure_name,
        "overall": grade,
        "criteria": criteria_explanation(),
        "joints": joints,
        "corrections": corrections,
        "frame_deviations": deviations,
        "summary": _summary_text(figure_name, grade, corrections),
    }


def criteria_explanation() -> dict:
    """Explica QUÉ califica el sistema y CÓMO (transparencia para el usuario)."""
    return {
        "que_califica": (
            "Se comparan los ángulos de 10 articulaciones (codos, hombros, "
            "caderas, rodillas y tobillos) de tu ejecución contra la referencia "
            "del instructor, alineando el tiempo con DTW para que no importe si "
            "vas más rápido o más lento."
        ),
        "como_se_puntua": (
            f"Cada articulación recibe un puntaje según su diferencia promedio "
            f"en grados respecto a la referencia (una diferencia de "
            f"{Config.ANGLE_SCORE_FULL_PENALTY_DEGREES:.0f}° equivale a 0%). El "
            f"puntaje global es el promedio de las 10 articulaciones."
        ),
        "bandas": [
            {"desde_pct": round(b[0] * 100), "calificacion": b[1], "detalle": b[2]}
            for b in Config.GRADE_BANDS
        ],
        "umbral_correccion_grados": Config.CORRECTION_MIN_DEGREES,
    }


def _summary_text(figure_name: str, grade: dict, corrections: list) -> str:
    """Frase resumen en lenguaje natural para encabezar el reporte."""
    fig = figure_name or "la figura"
    n = len(corrections)
    if n == 0:
        return (f"Tu ejecución de {fig} obtuvo {grade['score_pct']:.0f}% "
                f"({grade['label']}). ¡Sin correcciones necesarias!")
    art = "articulación" if n == 1 else "articulaciones"
    return (f"Tu ejecución de {fig} obtuvo {grade['score_pct']:.0f}% "
            f"({grade['label']}). Hay {n} {art} por ajustar.")
