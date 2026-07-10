"""
Correcciones VISUALES con marca de tiempo (mejora 2026-07 para DINAMYT Academy).

A partir del camino DTW entre el estudiante y la referencia:
    1. Detecta los SEGMENTOS de tiempo donde cada articulación se desvía
       (p. ej. "codo derecho entre 01:31 y 01:38, pico en 01:34").
    2. Genera imágenes comparativas lado a lado (estudiante | referencia) con
       el esqueleto dibujado (líneas + puntos) y la articulación a corregir
       resaltada en rojo con un halo, en el instante del peor desvío.
    3. Devuelve todo con timestamps mm:ss listos para la interfaz.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from .config import Config
from .grading import JOINT_LABELS
from .visualization import PoseVisualizer


def fmt_tiempo(segundos: float) -> str:
    """Segundos → 'mm:ss' (p. ej. 94 → '01:34')."""
    s = max(0, int(round(segundos)))
    return f"{s // 60:02d}:{s % 60:02d}"


def detectar_momentos(
    ref_angles: np.ndarray,
    stu_angles: np.ndarray,
    idx_stu: np.ndarray,
    idx_ref: np.ndarray,
    fps: float,
    umbral_grados: float | None = None,
    max_por_articulacion: int = 2,
) -> dict[str, list[dict]]:
    """Encuentra, por articulación, los momentos del video del ESTUDIANTE donde
    su ángulo se aparta de la referencia (sobre la alineación DTW compartida).

    Returns:
        {nombre_articulacion: [{frame_student, frame_reference, time, label,
                                start_label, end_label, max_diff}, ...]}
    """
    umbral = umbral_grados or max(Config.CORRECTION_MIN_DEGREES * 1.5, 20.0)
    alineado = np.abs(ref_angles[idx_ref] - stu_angles[idx_stu])  # (P, n_angulos)
    nombres = list(Config.JOINT_ANGLES.keys())
    resultado: dict[str, list[dict]] = {}

    # Suavizado (~1/6 de segundo) para no reportar picos de un solo frame.
    k = max(3, int(round(fps / 6)) | 1)
    kernel = np.ones(k) / k

    for j, nombre in enumerate(nombres):
        col = alineado[:, j]
        if len(col) < k:
            continue
        suave = np.convolve(col, kernel, mode="same")
        mask = suave > umbral

        segmentos = []
        i = 0
        while i < len(mask):
            if not mask[i]:
                i += 1
                continue
            inicio = i
            while i < len(mask) and mask[i]:
                i += 1
            fin = i - 1
            pico = inicio + int(np.argmax(col[inicio : fin + 1]))
            segmentos.append((inicio, fin, pico, float(col[pico])))

        # Los peores primero; máximo N por articulación para no abrumar.
        segmentos.sort(key=lambda s: -s[3])
        momentos = []
        for inicio, fin, pico, max_diff in segmentos[:max_por_articulacion]:
            frame_stu = int(idx_stu[pico])
            momentos.append(
                {
                    "frame_student": frame_stu,
                    "frame_reference": int(idx_ref[pico]),
                    "time": frame_stu / fps,
                    "label": fmt_tiempo(frame_stu / fps),
                    "start_label": fmt_tiempo(int(idx_stu[inicio]) / fps),
                    "end_label": fmt_tiempo(int(idx_stu[fin]) / fps),
                    "max_diff": round(max_diff, 1),
                }
            )
        momentos.sort(key=lambda m: m["time"])
        if momentos:
            resultado[nombre] = momentos
    return resultado


def _leer_frame(video_path: str, indice: int) -> np.ndarray | None:
    cap = cv2.VideoCapture(str(video_path))
    try:
        cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, indice))
        ok, frame = cap.read()
        return frame if ok else None
    finally:
        cap.release()


def _rotular(img: np.ndarray, texto: str) -> np.ndarray:
    """Franja superior con el rótulo (estudiante/referencia + tiempo)."""
    banda = np.zeros((34, img.shape[1], 3), dtype=np.uint8)
    cv2.putText(banda, texto, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.62,
                (243, 241, 232), 2, cv2.LINE_AA)
    return np.vstack([banda, img])


def imagen_comparativa(
    student_video: str,
    reference_video: str,
    momento: dict,
    landmarks_stu: np.ndarray,
    landmarks_ref: np.ndarray,
    joint: str,
    out_path: str,
) -> bool:
    """Panel lado a lado (estudiante | referencia) en el instante del desvío,
    con esqueleto (líneas + puntos) y la articulación a corregir en rojo."""
    f_stu = _leer_frame(student_video, momento["frame_student"])
    f_ref = _leer_frame(reference_video, momento["frame_reference"])
    if f_stu is None or f_ref is None:
        return False

    correccion = [{"joint": joint, "avg_diff": momento["max_diff"]}]
    img_stu = PoseVisualizer.draw_skeleton(
        f_stu, landmarks_stu[momento["frame_student"]], corrections=correccion,
        show_angles=False,
    )
    img_ref = PoseVisualizer.draw_skeleton(
        f_ref, landmarks_ref[momento["frame_reference"]], corrections=None,
        show_angles=False,
    )

    # Halo sobre el vértice de la articulación problema en el estudiante.
    h, w = img_stu.shape[:2]
    _, vertice, _ = Config.JOINT_ANGLES[joint]
    lm = landmarks_stu[momento["frame_student"]]
    if lm[vertice, 3] > 0.3:
        centro = (int(lm[vertice, 0] * w), int(lm[vertice, 1] * h))
        cv2.circle(img_stu, centro, 26, (0, 0, 255), 3)
        cv2.circle(img_stu, centro, 34, (0, 0, 255), 1)

    # Igualar alturas y unir.
    alto = 480
    def escalar(img: np.ndarray) -> np.ndarray:
        escala = alto / img.shape[0]
        return cv2.resize(img, (int(img.shape[1] * escala), alto))

    etiqueta = JOINT_LABELS.get(joint, joint.replace("_", " "))
    panel = np.hstack([
        _rotular(escalar(img_stu), f"TU EJECUCION  {momento['label']}  -  {etiqueta}"),
        _rotular(escalar(img_ref), "REFERENCIA DEL MAESTRO"),
    ])
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    return bool(cv2.imwrite(str(out_path), panel))


def video_anotado(
    student_video: str,
    landmarks_stu: np.ndarray,
    momentos_por_joint: dict[str, list[dict]],
    corrections: list[dict],
    out_path: str,
    fps: float,
) -> bool:
    """Video del estudiante con el esqueleto dibujado; en los segmentos con
    desvío la articulación se pinta en rojo/naranja (corrección visual)."""
    cap = cv2.VideoCapture(str(student_video))
    if not cap.isOpened():
        return False
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    out = cv2.VideoWriter(
        str(out_path), cv2.VideoWriter_fourcc(*"mp4v"), fps or 30.0, (w, h),
    )

    # Ventana de frames "en corrección" por articulación (± medio segundo).
    margen = int(round((fps or 30) / 2))
    ventanas: dict[str, list[tuple[int, int]]] = {}
    for joint, momentos in momentos_por_joint.items():
        ventanas[joint] = [
            (m["frame_student"] - margen, m["frame_student"] + margen) for m in momentos
        ]

    i = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            activas = [
                {"joint": j, "avg_diff": 60}
                for j, vs in ventanas.items()
                if any(a <= i <= b for a, b in vs)
            ]
            if i < len(landmarks_stu):
                frame = PoseVisualizer.draw_skeleton(
                    frame, landmarks_stu[i],
                    corrections=activas or corrections, show_angles=False,
                )
                if activas:
                    cv2.putText(
                        frame, f"CORRIGE: {', '.join(a['joint'].replace('_', ' ') for a in activas)}",
                        (12, h - 16), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2, cv2.LINE_AA,
                    )
            out.write(frame)
            i += 1
    finally:
        cap.release()
        out.release()
    return True
