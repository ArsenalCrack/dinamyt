"""
00_setup_dataset.py
Crea la estructura de carpetas del dataset para las 18 katas de Hapkido.

Uso:
    python src/00_setup_dataset.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')

import pandas as pd
from utils.config import Config


def setup_dataset():
    """Crea toda la estructura de carpetas del dataset."""
    print("=" * 60)
    print("  CONFIGURACION DEL DATASET - Sistema Hapkido")
    print("=" * 60)

    created_dirs = Config.ensure_directories()
    print(f"\n[OK] Se crearon/verificaron {len(created_dirs)} directorios.")

    print("\n[ESTRUCTURA DEL DATASET]")
    print(f"   {Config.RAW_VIDEOS_DIR}/")
    for kata in Config.KATA_NAMES[:3]:
        print(f"   +-- {kata}/")
        print(f"   |   +-- referencia/     <- Videos del instructor")
        print(f"   |   +-- practicantes/   <- Videos de alumnos")
    print(f"   +-- ...")
    print(f"   +-- {Config.KATA_NAMES[-1]}/")
    print(f"       +-- referencia/")
    print(f"       +-- practicantes/")

    if not Config.METADATA_FILE.exists():
        columns = [
            "video_id", "filename", "kata", "kata_number",
            "participant_id", "belt_level", "quality", "repetition",
            "is_reference", "fps", "total_frames", "duration_seconds",
            "landmarks_file", "angles_file", "processed",
        ]
        pd.DataFrame(columns=columns).to_csv(Config.METADATA_FILE, index=False)
        print(f"\n[OK] Metadata creada: {Config.METADATA_FILE}")
    else:
        print(f"\n[OK] Metadata existente: {Config.METADATA_FILE}")

    print("\n" + "=" * 60)
    print("  INSTRUCCIONES")
    print("=" * 60)
    print("""
    1. Coloque los videos de REFERENCIA (instructor) en:
       dataset/raw_videos/kata_XX/referencia/

    2. Coloque los videos de PRACTICANTES en:
       dataset/raw_videos/kata_XX/practicantes/

    3. Formato de nombre recomendado:
       kata_01_ref_instructor01_rep01.mp4
       kata_01_prac_alumno01_rep01.mp4

    4. Formatos soportados: {}

    5. Una vez organizados los videos, ejecute:
       python src/01_extract_pose.py
    """.format(", ".join(Config.VIDEO_EXTENSIONS)))

    video_count = 0
    for kata in Config.KATA_NAMES:
        kata_dir = Config.RAW_VIDEOS_DIR / kata
        if kata_dir.exists():
            for subdir in ["referencia", "practicantes"]:
                path = kata_dir / subdir
                if path.exists():
                    for ext in Config.VIDEO_EXTENSIONS:
                        video_count += len(list(path.glob(f"*{ext}")))

    if video_count > 0:
        print(f"[INFO] Se encontraron {video_count} videos existentes.")
    else:
        print("[INFO] Aun no hay videos. Siga las instrucciones anteriores.")

    print("\n[OK] Setup completado exitosamente.")


if __name__ == "__main__":
    setup_dataset()
