"""
01_extract_pose.py
Extrae los 33 landmarks y angulos articulares de videos con MediaPipe.

Uso:
    python src/01_extract_pose.py
    python src/01_extract_pose.py --kata kata_01
    python src/01_extract_pose.py --video path/to/video.mp4
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import argparse, uuid
from pathlib import Path
import numpy as np
import pandas as pd
import cv2
from tqdm import tqdm
from utils.config import Config
from utils.pose_utils import PoseExtractor
from utils.validators import FileValidator, DataIntegrity
from utils.logger import get_logger

# Logger centralizado (Usabilidad + Mantenibilidad)
log = get_logger("01_extract_pose")


def extract_single_video(video_path, extractor, save_dir=None):
    """Extrae landmarks y angulos de un video.

    Incluye validación de entrada (Seguridad) y guardado de checksums (Integridad).
    """
    # Validar video antes de procesar (Seguridad)
    video_info = FileValidator.validate_video(str(video_path))
    for w in video_info.get("warnings", []):
        log.warning(w)

    log.info(f"  Procesando: {video_path.name}")
    result = extractor.extract_landmarks_from_video(str(video_path))
    landmarks = result["landmarks"]
    angles = result["angles"]

    log.result("Frames", f"{result['total_frames']} | Con pose: {result['valid_frames']} | FPS: {result['fps']}")

    landmarks_normalized = PoseExtractor.normalize_landmarks(landmarks)
    video_id = str(uuid.uuid4())[:8]

    if save_dir is None:
        save_dir = Config.LANDMARKS_DIR
    save_dir.mkdir(parents=True, exist_ok=True)
    angles_dir = Config.ANGLES_DIR
    angles_dir.mkdir(parents=True, exist_ok=True)

    lm_file = save_dir / f"{video_path.stem}_landmarks.npy"
    ang_file = angles_dir / f"{video_path.stem}_angles.npy"
    np.save(lm_file, landmarks_normalized)
    np.save(ang_file, angles)

    # Guardar checksums para verificación de integridad (Seguridad)
    DataIntegrity.save_checksum(str(lm_file))
    DataIntegrity.save_checksum(str(ang_file))

    detection_rate = result['valid_frames'] / max(result['total_frames'], 1) * 100
    if detection_rate < 70:
        log.warning(f"Baja detección ({detection_rate:.1f}%) en {video_path.name}")

    return {
        "video_id": video_id, "filename": video_path.name,
        "fps": result["fps"], "total_frames": result["total_frames"],
        "valid_frames": result["valid_frames"],
        "duration_seconds": result["total_frames"] / max(result["fps"], 1),
        "landmarks_file": str(lm_file), "angles_file": str(ang_file),
    }


def process_dataset(kata_filter=None):
    """Procesa todos los videos del dataset."""
    log.header("EXTRACCION DE POSE - MediaPipe BlazePose")
    Config.ensure_directories()

    metadata = pd.read_csv(Config.METADATA_FILE) if Config.METADATA_FILE.exists() else pd.DataFrame()

    videos = []
    katas = [kata_filter] if kata_filter else Config.KATA_NAMES
    for kata in katas:
        kata_dir = Config.RAW_VIDEOS_DIR / kata
        if not kata_dir.exists():
            continue
        for subdir, is_ref in [("referencia", True), ("practicantes", False)]:
            vdir = kata_dir / subdir
            if not vdir.exists():
                continue
            for ext in Config.VIDEO_EXTENSIONS:
                for vp in vdir.glob(f"*{ext}"):
                    if not metadata.empty and vp.name in metadata["filename"].values:
                        continue
                    videos.append({"path": vp, "kata": kata, "is_reference": is_ref})

    if not videos:
        log.info("No se encontraron videos nuevos.")
        return

    log.info(f"Videos a procesar: {len(videos)}")
    new_records = []
    with PoseExtractor() as ext:
        for vi in tqdm(videos, desc="Extrayendo poses"):
            try:
                r = extract_single_video(vi["path"], ext)
                kata_num = int(vi["kata"].split("_")[1])
                new_records.append({
                    "video_id": r["video_id"], "filename": r["filename"],
                    "kata": vi["kata"], "kata_number": kata_num,
                    "participant_id": "unknown", "belt_level": "",
                    "quality": "referencia" if vi["is_reference"] else "aceptable",
                    "repetition": 1, "is_reference": vi["is_reference"],
                    "fps": r["fps"], "total_frames": r["total_frames"],
                    "duration_seconds": r["duration_seconds"],
                    "landmarks_file": r["landmarks_file"],
                    "angles_file": r["angles_file"], "processed": True,
                })
            except Exception as e:
                log.error(f"Error en {vi['path'].name}: {e}")

    if new_records:
        new_df = pd.DataFrame(new_records)
        metadata = new_df if metadata.empty else pd.concat([metadata, new_df], ignore_index=True)
        metadata.to_csv(Config.METADATA_FILE, index=False)
        log.success(f"Metadata actualizada: {len(new_records)} registros nuevos")


def main():
    parser = argparse.ArgumentParser(description="Extraccion de pose con MediaPipe")
    parser.add_argument("--kata", type=str, default=None)
    parser.add_argument("--video", type=str, default=None)
    args = parser.parse_args()

    if args.video:
        with PoseExtractor() as ext:
            extract_single_video(Path(args.video), ext)
    else:
        process_dataset(kata_filter=args.kata)
    log.next_step("python src/03_build_sequences.py")


if __name__ == "__main__":
    main()
