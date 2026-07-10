"""
Orquestador de alto nivel del Sistema Inteligente de Hapkido.

Reúne extracción de pose + reconocimiento + calificación en funciones simples
y SIN interfaz (no imprime, no abre ventanas): devuelve diccionarios.

Esta es la capa "núcleo" reutilizable. La consumen:
    - la interfaz gráfica Streamlit (gui/app.py)
    - el CLI de predicción
    - el futuro microservicio REST (FastAPI) que llamará DINAMYT Academy

Separar núcleo (esta capa) de interfaz hace que añadir la API web después sea
cuestión de envolver estas funciones; no hay que reescribir lógica.
"""
from __future__ import annotations
from pathlib import Path

import numpy as np

from .pose_utils import PoseExtractor
from .dtw_utils import DTWEvaluator
from .recognition import FigureLibrary, FigureRecognizer
from . import grading


def extract_pose_data(video_path: str) -> dict:
    """Extrae pose, ángulos y métricas de calidad de un video.

    Returns:
        dict con: landmarks (crudos), landmarks_norm, angles, fps,
        total_frames, valid_frames, detection_rate (0-100).
    """
    with PoseExtractor() as ext:
        result = ext.extract_landmarks_from_video(str(video_path))

    landmarks = result["landmarks"]
    angles = result["angles"]
    total = max(int(result["total_frames"]), 1)
    detection_rate = result["valid_frames"] / total * 100.0

    return {
        "landmarks": landmarks,
        "landmarks_norm": PoseExtractor.normalize_landmarks(landmarks),
        "angles": angles,
        "fps": float(result["fps"]),
        "total_frames": int(result["total_frames"]),
        "valid_frames": int(result["valid_frames"]),
        "detection_rate": round(detection_rate, 1),
    }


def evaluate_pair(reference_angles: np.ndarray, student_angles: np.ndarray,
                  figure_name: str = "", evaluator: DTWEvaluator = None) -> dict:
    """Evalúa una ejecución contra una referencia y devuelve el reporte unificado.

    Returns:
        El reporte de grading.build_report() (contrato JSON).
    """
    evaluator = evaluator or DTWEvaluator()
    result = evaluator.evaluate_angles_only(np.asarray(reference_angles),
                                            np.asarray(student_angles))
    return grading.build_report(result, figure_name=figure_name)


def recognize_and_grade(student_angles: np.ndarray, library: FigureLibrary,
                        top_k: int = 3, evaluator: DTWEvaluator = None) -> dict:
    """Reconoce la figura y la califica contra su mejor referencia.

    Returns:
        dict con:
            - 'recognized': bool
            - 'recognition': {best_name, best_id, confidence, ranking}
            - 'report': reporte de calificación (o None si no se reconoció)
            - 'reason': motivo si no se reconoció
    """
    evaluator = evaluator or DTWEvaluator()
    recognizer = FigureRecognizer(library, evaluator)
    rec = recognizer.recognize(student_angles, top_k=top_k)

    if not rec["recognized"]:
        return {"recognized": False, "recognition": None, "report": None,
                "reason": rec.get("reason", "No reconocido.")}

    best = rec["best"]
    report = evaluate_pair(best["reference_angles"], student_angles,
                           figure_name=best["name"], evaluator=evaluator)

    return {
        "recognized": True,
        "recognition": {
            "best_id": best["figure_id"],
            "best_name": best["name"],
            "confidence": best["confidence"],
            "distance": best["distance"],
            "ranking": rec["ranking"],
        },
        "report": report,
    }


def analyze_video(video_path: str, library: FigureLibrary) -> dict:
    """Pipeline completo desde un archivo de video: extraer -> reconocer -> calificar.

    Esta es la función que envolverá el microservicio REST (un endpoint
    POST /analizar que recibe el video y devuelve este mismo dict como JSON).

    Returns:
        dict con 'video' (métricas de extracción) + el resultado de
        recognize_and_grade().
    """
    pose = extract_pose_data(video_path)
    out = recognize_and_grade(pose["angles"], library)
    out["video"] = {
        "filename": Path(video_path).name,
        "fps": pose["fps"],
        "total_frames": pose["total_frames"],
        "valid_frames": pose["valid_frames"],
        "detection_rate": pose["detection_rate"],
    }
    # Advertencia de calidad
    if pose["detection_rate"] < 70:
        out["warning"] = (f"Baja detección de pose ({pose['detection_rate']:.0f}%). "
                          f"El resultado puede ser poco fiable; considera regrabar "
                          f"con el cuerpo completo visible y buena iluminación.")
    return out
