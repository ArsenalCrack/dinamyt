"""
Microservicio de FIGURAS de DINAMYT Academy (FastAPI, puerto 3009).

Corre en la misma máquina que academy-api y se comunican por RUTAS DE ARCHIVO
dentro del almacén compartido (.uploads/academy). Dos operaciones:

    POST /extract  — precalcula pose/ángulos de un video de REFERENCIA (.npz).
    POST /compare  — compara el video del ESTUDIANTE contra la referencia:
                     score por articulación (DTW), correcciones con marca de
                     tiempo mm:ss, imágenes comparativas con esqueleto
                     (líneas/puntos, articulación en rojo) y video anotado.

No usa la CNN-LSTM: el estudiante ELIGE qué figura intenta, así que basta
MediaPipe + DTW (sin torch, arranque liviano).
"""
from __future__ import annotations

import sys
import traceback
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

from src.utils.pose_utils import PoseExtractor  # noqa: E402
from src.utils.dtw_utils import DTWEvaluator  # noqa: E402
from src.utils.grading import JOINT_LABELS  # noqa: E402
from src.utils import correcciones  # noqa: E402
from src.utils.visualization import PoseVisualizer  # noqa: E402

app = FastAPI(title="DINAMYT Academy — figuras", version="1.0")


class ExtractIn(BaseModel):
    video_path: str
    angles_path: str


class CompareIn(BaseModel):
    student_video_path: str
    reference_video_path: str
    reference_angles_path: str
    out_dir: str
    base_dir: str | None = None  # para devolver rutas relativas


def _extraer(video_path: str) -> dict:
    with PoseExtractor() as ext:
        r = ext.extract_landmarks_from_video(video_path)
    total = max(int(r["total_frames"]), 1)
    r["detection_rate"] = round(r["valid_frames"] / total * 100.0, 1)
    return r


def _rel(base: str | None, p: Path) -> str:
    if base:
        try:
            return p.resolve().relative_to(Path(base).resolve()).as_posix()
        except ValueError:
            pass
    return p.as_posix()


@app.get("/health")
def health():
    return {"status": "ok", "service": "academy-figuras"}


@app.post("/extract")
def extract(body: ExtractIn):
    try:
        r = _extraer(body.video_path)
        destino = Path(body.angles_path)
        destino.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            destino,
            angles=r["angles"],
            landmarks=r["landmarks"],
            fps=r["fps"],
        )
        return {"detectionRate": r["detection_rate"]}
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        raise HTTPException(500, f"Extracción fallida: {e}")


@app.post("/compare")
def compare(body: CompareIn):
    try:
        ref = np.load(body.reference_angles_path)
        ref_angles = ref["angles"]
        ref_landmarks = ref["landmarks"]

        stu = _extraer(body.student_video_path)
        stu_angles = stu["angles"]
        fps = float(stu["fps"]) or 30.0

        resultado = DTWEvaluator().evaluate_angles_only(ref_angles, stu_angles)
        idx_stu, idx_ref = resultado["alignment_path"]

        # Momentos de desvío por articulación (timestamps mm:ss del estudiante).
        momentos = correcciones.detectar_momentos(
            ref_angles, stu_angles, np.asarray(idx_stu), np.asarray(idx_ref), fps,
        )

        out_dir = Path(body.out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        # Correcciones con sus momentos + imagen comparativa por momento.
        corrections_out = []
        for c in resultado["corrections"]:
            joint = c["joint"]
            moms = []
            for k, m in enumerate(momentos.get(joint, [])):
                img = out_dir / f"corr_{joint}_{k}.png"
                ok = correcciones.imagen_comparativa(
                    body.student_video_path,
                    body.reference_video_path,
                    m,
                    stu["landmarks"],
                    ref_landmarks,
                    joint,
                    str(img),
                )
                moms.append(
                    {
                        "time": round(float(m["time"]), 1),
                        "label": m["label"],
                        "startLabel": m["start_label"],
                        "endLabel": m["end_label"],
                        "maxDiff": float(m["max_diff"]),
                        "image": _rel(body.base_dir, img) if ok else None,
                    }
                )
            corrections_out.append(
                {
                    "joint": joint,
                    "jointLabel": JOINT_LABELS.get(joint, joint.replace("_", " ")),
                    "message": c["message"],
                    "avgDiff": round(float(c["avg_diff"]), 1),
                    "momentos": moms,
                }
            )

        # Video anotado (esqueleto coloreado; rótulo CORRIGE en los segmentos).
        anotado = out_dir / "anotado.mp4"
        video_ok = False
        try:
            video_ok = correcciones.video_anotado(
                body.student_video_path,
                stu["landmarks"],
                {c["joint"]: momentos.get(c["joint"], []) for c in resultado["corrections"]},
                resultado["corrections"],
                str(anotado),
                fps,
            )
        except Exception:  # noqa: BLE001
            traceback.print_exc()

        # Reporte gráfico (matplotlib) — mejor esfuerzo.
        reporte = out_dir / "reporte.png"
        reporte_ok = False
        try:
            PoseVisualizer.generate_evaluation_report(resultado, output_path=str(reporte))
            reporte_ok = reporte.exists()
        except Exception:  # noqa: BLE001
            traceback.print_exc()

        return {
            "overallScore": round(float(resultado["overall_score"]) * 100.0, 2),
            "qualityLabel": resultado["quality_label"],
            "detectionRate": stu["detection_rate"],
            "warning": (
                f"Baja detección de pose ({stu['detection_rate']:.0f}%). Graba con el "
                f"cuerpo completo visible y buena iluminación."
                if stu["detection_rate"] < 70
                else None
            ),
            "joints": {
                name: {
                    "score": round(float(ev["score"]) * 100.0, 1),
                    "avgDiff": round(float(ev["avg_difference_degrees"]), 1),
                    "quality": ev["quality"],
                }
                for name, ev in resultado["joint_evaluations"].items()
            },
            "corrections": corrections_out,
            "reportImg": _rel(body.base_dir, reporte) if reporte_ok else None,
            "annotatedVideo": _rel(body.base_dir, anotado) if video_ok else None,
        }
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        raise HTTPException(500, f"Comparación fallida: {e}")
