"""
05_predict.py
Pipeline completo: Video -> Clasificar kata (PyTorch) -> Evaluar DTW -> Feedback.

Patrón Pipeline (Pipes & Filters) — Orquestador principal.
Integra: PoseExtractor + KataCNNLSTM + DTWEvaluator + PoseVisualizer

Uso:
    python src/05_predict.py --video path/to/video.mp4
    python src/05_predict.py --video path/to/video.mp4 --visualize
    python src/05_predict.py --video path/to/video.mp4 --role practicante
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import argparse, json, pickle
from pathlib import Path
import numpy as np
import cv2
import torch
import pandas as pd
from utils.config import Config
from utils.pose_utils import PoseExtractor
from utils.dtw_utils import DTWEvaluator
from utils.visualization import PoseVisualizer
from utils.validators import FileValidator, UserRole, check_permission
from utils.logger import get_logger
from utils.model import KataCNNLSTM

# Logger centralizado (Usabilidad + Mantenibilidad)
log = get_logger("05_predict")


def load_model_and_scaler():
    """Carga el modelo CNN-LSTM (PyTorch) y el scaler.

    Incluye validación de integridad de archivos (Seguridad).
    """
    # Validación centralizada de archivos del modelo (Seguridad)
    validated = FileValidator.validate_model_files()
    log.debug(f"Archivos del modelo validados: {list(validated.keys())}")

    model_path = validated["model"]
    scaler_path = validated["scaler"]
    config_path = validated["config"]

    with open(config_path) as f:
        model_config = json.load(f)

    model = KataCNNLSTM(
        model_config["input_dim"], model_config["num_classes"])
    model.load_state_dict(torch.load(str(model_path), weights_only=True))
    model.eval()

    with open(scaler_path, "rb") as f:
        scaler = pickle.load(f)

    return model, scaler, model_config


def load_reference(kata_name):
    """Carga datos de referencia para una kata."""
    if not Config.METADATA_FILE.exists():
        return None, None
    metadata = pd.read_csv(Config.METADATA_FILE)
    ref = metadata[(metadata["kata"] == kata_name) & (metadata["is_reference"] == True)]
    if ref.empty:
        return None, None
    return np.load(ref.iloc[0]["landmarks_file"]), np.load(ref.iloc[0]["angles_file"])


def predict_video(video_path, visualize=False, role=UserRole.PRACTICANTE):
    """Pipeline completo de predicción y evaluación.

    Patrón Pipeline: Video → Extracción → Clasificación → DTW → Reporte

    Args:
        video_path: Ruta al video de entrada.
        visualize: Si genera video anotado.
        role: Rol del usuario para control de acceso.
    """
    log.header("PREDICCION Y EVALUACION - Hapkido (PyTorch)")

    # Verificar permisos del rol (Seguridad)
    check_permission(role, "05_predict")
    log.debug(f"Acceso autorizado para rol: {role.value}")

    video_path = Path(video_path)

    # Validación completa del video de entrada (Seguridad)
    log.step(0, 4, "Validando video de entrada")
    video_info = FileValidator.validate_video(str(video_path))
    for w in video_info.get("warnings", []):
        log.warning(w)
    log.result("Video", video_info['filename'])
    log.result("Resolución", f"{video_info['width']}x{video_info['height']}")
    log.result("Duración", f"{video_info['duration_seconds']:.1f}", "segundos")

    # 1. Extraer pose
    log.step(1, 4, "Extrayendo pose corporal (MediaPipe)")
    with PoseExtractor() as ext:
        result = ext.extract_landmarks_from_video(str(video_path))

    landmarks = result["landmarks"]
    angles = result["angles"]
    landmarks_norm = PoseExtractor.normalize_landmarks(landmarks)
    detection_rate = result['valid_frames'] / max(result['total_frames'], 1) * 100
    log.result("Frames totales", result['total_frames'])
    log.result("Frames con pose", result['valid_frames'])
    log.result("Tasa de detección", f"{detection_rate:.1f}%")
    if detection_rate < 70:
        log.warning(f"Baja detección de pose ({detection_rate:.1f}%). Considere regrabar el video.")

    # 2. Clasificar kata
    log.step(2, 4, "Clasificando kata (CNN-LSTM)")
    model, scaler, model_config = load_model_and_scaler()
    features = PoseExtractor.build_feature_vector(landmarks_norm, angles)
    features_seq = PoseExtractor.normalize_sequence_length(features)

    # Escalar
    orig_shape = features_seq.shape
    feat_flat = scaler.transform(features_seq.reshape(-1, features_seq.shape[-1]))
    features_seq = feat_flat.reshape(orig_shape)

    # Predecir con PyTorch
    with torch.no_grad():
        x = torch.from_numpy(features_seq.astype(np.float32)).unsqueeze(0)
        logits = model(x)
        probs = torch.softmax(logits, dim=1).numpy()[0]

    # Mapear el índice del modelo a la kata real (no asumir kata_01..N).
    idx_to_kata = model_config.get("index_to_kata_number",
                                   list(range(1, len(probs) + 1)))

    def _kata_name(model_idx):
        kata_num = idx_to_kata[model_idx]
        return Config.KATA_NAMES[kata_num - 1]

    kata_idx = int(np.argmax(probs))
    kata_name = _kata_name(kata_idx)
    confidence = probs[kata_idx]
    log.result("Kata detectada", f"{kata_name} ({confidence:.1%})")

    top3 = np.argsort(probs)[-3:][::-1]
    log.info("  Top-3 predicciones:")
    for i in top3:
        log.info(f"    {_kata_name(int(i))}: {probs[i]:.1%}")

    # 3. Evaluar con DTW
    log.step(3, 4, "Evaluando calidad técnica (DTW)")
    ref_lm, ref_ang = load_reference(kata_name)
    evaluation = None
    if ref_ang is not None:
        evaluator = DTWEvaluator()
        evaluation = evaluator.evaluate_angles_only(ref_ang, angles)
        log.result("Puntuación global", f"{evaluation['overall_score']:.1%}")
        log.result("Calidad", evaluation['quality_label'])
        corrections = evaluator.get_corrections(evaluation)
        if corrections:
            log.info("  Correcciones sugeridas:")
            for c in corrections[:5]:
                log.info(f"    → {c['joint'].replace('_',' ').title()}: {c['avg_diff']:.1f}°")
    else:
        log.warning(f"Sin video de referencia para {kata_name}. Evaluación DTW omitida.")

    # 4. Visualizar
    if visualize and evaluation:
        log.step(4, 4, "Generando visualización")
        Config.RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        report_path = Config.RESULTS_DIR / f"pred_{video_path.stem}.png"
        PoseVisualizer.generate_evaluation_report(
            evaluation, kata_name, str(report_path))

        output_video = Config.RESULTS_DIR / f"annotated_{video_path.stem}.mp4"
        _create_annotated_video(
            str(video_path), landmarks, evaluation,
            kata_name, confidence, str(output_video))

    log.success("Predicción finalizada")
    return {"kata": kata_name, "confidence": confidence, "evaluation": evaluation}


def _create_annotated_video(video_path, landmarks, evaluation,
                             kata_name, confidence, output_path):
    """Crea video con esqueleto y panel de evaluacion."""
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    # Primer frame para obtener dimensiones
    ret, first = cap.read()
    if not ret:
        return
    w = first.shape[1]
    out = cv2.VideoWriter(output_path, fourcc, fps, (w + 400, h))

    corrections = evaluation.get("corrections", [])
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    frame_idx = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret or frame_idx >= len(landmarks):
            break
        annotated = PoseVisualizer.draw_skeleton(frame, landmarks[frame_idx], corrections)
        combined = PoseVisualizer.create_evaluation_panel(
            annotated, evaluation, f"{kata_name} ({confidence:.0%})")
        out.write(combined)
        frame_idx += 1

    cap.release()
    out.release()
    print(f"  Video anotado: {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Pipeline de predicción y evaluación de katas de Hapkido",
        epilog="Ejemplo: python src/05_predict.py --video kata.mp4 --visualize"
    )
    parser.add_argument("--video", type=str, required=True,
                        help="Ruta al video de kata a evaluar")
    parser.add_argument("--visualize", action="store_true",
                        help="Generar video anotado con esqueleto y reporte gráfico")
    parser.add_argument("--role", type=str, default="practicante",
                        choices=["instructor", "practicante", "desarrollador"],
                        help="Perfil de usuario (controla permisos de acceso)")
    args = parser.parse_args()

    role = UserRole(args.role)
    try:
        predict_video(args.video, args.visualize, role)
    except PermissionError as e:
        log.error(str(e))
    except FileNotFoundError as e:
        log.error(str(e))
    except ValueError as e:
        log.error(str(e))


if __name__ == "__main__":
    main()
