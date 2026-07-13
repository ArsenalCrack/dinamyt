"""
Módulo de validación y seguridad del Sistema Inteligente de Hapkido.

Garantiza SEGURIDAD mediante:
- Validación de entrada (formato, existencia, integridad)
- Perfiles de usuario con niveles de acceso
- Verificación de integridad de datos procesados
- Sanitización de rutas y parámetros
"""
import os
import hashlib
import json
from pathlib import Path
from enum import Enum
from typing import Optional
import numpy as np
from .config import Config


# ── Perfiles de Usuario ─────────────────────────────────────────────────
class UserRole(Enum):
    """Roles de usuario con niveles de acceso diferenciados."""
    INSTRUCTOR = "instructor"      # Acceso completo
    PRACTICANTE = "practicante"    # Solo predicción y evaluación
    DESARROLLADOR = "desarrollador"  # Acceso total + configuración


# Permisos por rol: qué scripts puede ejecutar cada perfil
ROLE_PERMISSIONS = {
    UserRole.INSTRUCTOR: {
        "00_setup_dataset", "01_extract_pose", "02_evaluate_dtw",
        "03_build_sequences", "04_train_cnn_lstm", "05_predict",
    },
    UserRole.PRACTICANTE: {
        "05_predict",
    },
    UserRole.DESARROLLADOR: {
        "00_setup_dataset", "01_extract_pose", "02_evaluate_dtw",
        "03_build_sequences", "04_train_cnn_lstm", "05_predict",
    },
}


def check_permission(role: UserRole, script_name: str) -> bool:
    """Verifica si un rol tiene permiso para ejecutar un script.

    Args:
        role: Rol del usuario (UserRole).
        script_name: Nombre del script (sin extensión).

    Returns:
        True si tiene permiso.

    Raises:
        PermissionError: Si el rol no tiene acceso al script.
    """
    allowed = ROLE_PERMISSIONS.get(role, set())
    if script_name not in allowed:
        raise PermissionError(
            f"El perfil '{role.value}' no tiene permiso para ejecutar "
            f"'{script_name}'. Permisos disponibles: {', '.join(sorted(allowed))}"
        )
    return True


# ── Validación de Archivos ──────────────────────────────────────────────

class FileValidator:
    """Validaciones de archivos de entrada y datos procesados."""

    @staticmethod
    def validate_video(video_path: str) -> dict:
        """Valida un archivo de video antes de procesarlo.

        Args:
            video_path: Ruta al video.

        Returns:
            dict con información del video validado.

        Raises:
            FileNotFoundError: Si el archivo no existe.
            ValueError: Si el formato no es soportado o el video es inválido.
        """
        path = Path(video_path)

        # Existencia
        if not path.exists():
            raise FileNotFoundError(
                f"Video no encontrado: {video_path}\n"
                f"Verifique que la ruta sea correcta."
            )

        # Formato
        if path.suffix.lower() not in Config.VIDEO_EXTENSIONS:
            raise ValueError(
                f"Formato no soportado: '{path.suffix}'\n"
                f"Formatos válidos: {', '.join(Config.VIDEO_EXTENSIONS)}"
            )

        # Tamaño mínimo (evitar archivos vacíos o corruptos)
        file_size = path.stat().st_size
        if file_size < 1024:  # < 1KB probablemente corrupto
            raise ValueError(
                f"Archivo demasiado pequeño ({file_size} bytes). "
                f"Posiblemente corrupto: {video_path}"
            )

        # Intentar abrir con OpenCV para validar integridad
        import cv2
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            raise ValueError(
                f"No se pudo abrir el video: {video_path}\n"
                f"El archivo puede estar corrupto o usar un codec no soportado."
            )

        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()

        # Validar FPS
        if fps < 1:
            raise ValueError(
                f"FPS inválido ({fps}) en: {video_path}\n"
                f"El video debe tener al menos 1 FPS."
            )

        # Advertencia de resolución (no bloquea, solo informa)
        warnings = []
        if height < Config.MIN_RESOLUTION[0] or width < Config.MIN_RESOLUTION[1]:
            warnings.append(
                f"Resolución baja ({width}x{height}). "
                f"Recomendado: {Config.MIN_RESOLUTION[1]}x{Config.MIN_RESOLUTION[0]}"
            )

        if fps < Config.TARGET_FPS:
            warnings.append(
                f"FPS bajo ({fps:.0f}). Recomendado: {Config.TARGET_FPS} FPS"
            )

        return {
            "path": str(path),
            "filename": path.name,
            "format": path.suffix,
            "size_bytes": file_size,
            "fps": fps,
            "width": width,
            "height": height,
            "total_frames": total_frames,
            "duration_seconds": total_frames / fps if fps > 0 else 0,
            "warnings": warnings,
            "valid": True,
        }

    @staticmethod
    def validate_npy_file(file_path: str, expected_dims: int = None) -> np.ndarray:
        """Valida y carga un archivo NumPy con verificación de integridad.

        Args:
            file_path: Ruta al archivo .npy.
            expected_dims: Número esperado de dimensiones (opcional).

        Returns:
            Array NumPy cargado.

        Raises:
            FileNotFoundError: Si el archivo no existe.
            ValueError: Si las dimensiones no coinciden o el archivo está corrupto.
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(
                f"Archivo de datos no encontrado: {file_path}\n"
                f"¿Ejecutó el paso anterior del pipeline?"
            )

        if path.suffix != '.npy':
            raise ValueError(f"Se esperaba archivo .npy, se recibió: {path.suffix}")

        try:
            data = np.load(str(path), allow_pickle=False)
        except Exception as e:
            raise ValueError(
                f"Error al cargar {file_path}: {e}\n"
                f"El archivo puede estar corrupto. Reejecutar el paso de extracción."
            )

        if expected_dims is not None and data.ndim != expected_dims:
            raise ValueError(
                f"Dimensiones incorrectas en {path.name}: "
                f"esperado {expected_dims}D, obtenido {data.ndim}D"
            )

        if data.size == 0:
            raise ValueError(f"Archivo vacío: {file_path}")

        if np.any(np.isnan(data)):
            raise ValueError(
                f"Datos con NaN detectados en {file_path}. "
                f"Datos posiblemente corruptos."
            )

        return data

    @staticmethod
    def validate_model_files() -> dict:
        """Verifica que todos los archivos del modelo existan.

        Returns:
            dict con rutas validadas.

        Raises:
            FileNotFoundError: Si falta algún archivo necesario.
        """
        required = {
            "model": Config.MODELS_DIR / "cnn_lstm_kata_classifier.pth",
            "config": Config.MODELS_DIR / "model_config.json",
            "scaler": Config.SEQUENCES_DIR / "scaler.pkl",
        }

        missing = []
        for name, path in required.items():
            if not path.exists():
                missing.append(f"  - {name}: {path}")

        if missing:
            raise FileNotFoundError(
                "Archivos del modelo faltantes:\n" +
                "\n".join(missing) +
                "\n\n¿Ejecutó el entrenamiento? → python src/04_train_cnn_lstm.py"
            )

        return {k: str(v) for k, v in required.items()}


# ── Integridad de Datos ─────────────────────────────────────────────────

class DataIntegrity:
    """Verificación de integridad de datos procesados."""

    CHECKSUMS_FILE = Config.PROCESSED_DIR / "checksums.json"

    @staticmethod
    def compute_checksum(file_path: str) -> str:
        """Calcula el hash SHA-256 de un archivo.

        Args:
            file_path: Ruta al archivo.

        Returns:
            String con el hash hexadecimal.
        """
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    @classmethod
    def save_checksum(cls, file_path: str):
        """Guarda el checksum de un archivo procesado.

        Args:
            file_path: Ruta al archivo procesado.
        """
        checksums = cls._load_checksums()
        checksums[str(file_path)] = cls.compute_checksum(file_path)

        cls.CHECKSUMS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(cls.CHECKSUMS_FILE, "w") as f:
            json.dump(checksums, f, indent=2)

    @classmethod
    def verify_checksum(cls, file_path: str) -> bool:
        """Verifica la integridad de un archivo contra su checksum guardado.

        Args:
            file_path: Ruta al archivo a verificar.

        Returns:
            True si el checksum coincide o no hay checksum previo.
        """
        checksums = cls._load_checksums()
        stored = checksums.get(str(file_path))
        if stored is None:
            return True  # No hay checksum previo, se asume válido

        current = cls.compute_checksum(file_path)
        return current == stored

    @classmethod
    def _load_checksums(cls) -> dict:
        """Carga el archivo de checksums."""
        if cls.CHECKSUMS_FILE.exists():
            with open(cls.CHECKSUMS_FILE, "r") as f:
                return json.load(f)
        return {}


# ── Sanitización ────────────────────────────────────────────────────────

def sanitize_path(path_str: str) -> Path:
    """Sanitiza una ruta de archivo para prevenir path traversal.

    Args:
        path_str: Ruta proporcionada por el usuario.

    Returns:
        Path sanitizada.

    Raises:
        ValueError: Si la ruta contiene caracteres peligrosos.
    """
    path = Path(path_str).resolve()

    # Verificar que no contiene componentes peligrosos
    dangerous = ["..", "~"]
    for part in Path(path_str).parts:
        if part in dangerous:
            raise ValueError(
                f"Ruta no permitida (contiene '{part}'): {path_str}\n"
                f"Use rutas absolutas o relativas simples."
            )

    return path
