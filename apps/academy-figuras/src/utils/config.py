"""
Configuración centralizada del Sistema Inteligente de Hapkido.
Contiene todos los parámetros globales del pipeline:
- Rutas del proyecto
- Parámetros de MediaPipe
- Parámetros del modelo CNN-LSTM
- Parámetros de DTW
"""
import os
from pathlib import Path

class Config:
    """Configuración global del sistema."""

    # ── Rutas del Proyecto ──────────────────────────────────────────────
    PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
    DATASET_DIR = PROJECT_ROOT / "dataset"
    RAW_VIDEOS_DIR = DATASET_DIR / "raw_videos"
    PROCESSED_DIR = DATASET_DIR / "processed_data"
    LANDMARKS_DIR = PROCESSED_DIR / "landmarks"
    ANGLES_DIR = PROCESSED_DIR / "angles"
    SEQUENCES_DIR = PROCESSED_DIR / "sequences"
    METADATA_FILE = PROCESSED_DIR / "metadata.csv"
    # Biblioteca de figuras (reconocimiento abierto por referencia, sin reentrenar)
    FIGURE_LIBRARY_DIR = PROCESSED_DIR / "figure_library"
    MODELS_DIR = PROJECT_ROOT / "models"
    SRC_DIR = PROJECT_ROOT / "src"
    RESULTS_DIR = PROJECT_ROOT / "results"

    # ── Katas (18 figuras) ──────────────────────────────────────────────
    NUM_KATAS = 18
    KATA_NAMES = [f"kata_{str(i).zfill(2)}" for i in range(1, NUM_KATAS + 1)]

    # ── Calidad de ejecución ────────────────────────────────────────────
    QUALITY_LABELS = ["referencia", "aceptable", "con_correcciones"]

    # ── Parámetros de Video ─────────────────────────────────────────────
    VIDEO_EXTENSIONS = [".mp4", ".avi", ".mov", ".mkv"]
    TARGET_FPS = 30
    MIN_RESOLUTION = (720, 1280)  # (height, width)

    # ── MediaPipe Pose (API Tasks - PoseLandmarker) ─────────────────────
    NUM_LANDMARKS = 33
    LANDMARK_DIMS = 4  # x, y, z, visibility
    MEDIAPIPE_MIN_DETECTION_CONFIDENCE = 0.5
    MEDIAPIPE_MIN_TRACKING_CONFIDENCE = 0.5
    MEDIAPIPE_MIN_PRESENCE_CONFIDENCE = 0.5
    # Modelo .task de la API Tasks de MediaPipe. Las versiones recientes
    # (necesarias para Python 3.13/3.14) eliminaron la API antigua
    # `mediapipe.solutions.pose`; ahora se usa PoseLandmarker con este modelo.
    POSE_MODEL_PATH = MODELS_DIR / "pose_landmarker_lite.task"
    POSE_MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/"
                      "pose_landmarker/pose_landmarker_lite/float16/latest/"
                      "pose_landmarker_lite.task")

    # Nombres de los 33 landmarks de MediaPipe BlazePose
    LANDMARK_NAMES = [
        "nose", "left_eye_inner", "left_eye", "left_eye_outer",
        "right_eye_inner", "right_eye", "right_eye_outer",
        "left_ear", "right_ear", "mouth_left", "mouth_right",
        "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
        "left_wrist", "right_wrist", "left_pinky", "right_pinky",
        "left_index", "right_index", "left_thumb", "right_thumb",
        "left_hip", "right_hip", "left_knee", "right_knee",
        "left_ankle", "right_ankle", "left_heel", "right_heel",
        "left_foot_index", "right_foot_index"
    ]

    # Índices de landmarks relevantes para artes marciales (cuerpo completo)
    BODY_LANDMARKS = list(range(11, 33))  # Excluye cara (0-10)

    # ── Ángulos Articulares Clave ───────────────────────────────────────
    # Cada ángulo se define como (punto_A, vértice, punto_B)
    JOINT_ANGLES = {
        "codo_izquierdo":     (11, 13, 15),   # hombro_izq, codo_izq, muñeca_izq
        "codo_derecho":       (12, 14, 16),   # hombro_der, codo_der, muñeca_der
        "hombro_izquierdo":   (13, 11, 23),   # codo_izq, hombro_izq, cadera_izq
        "hombro_derecho":     (14, 12, 24),   # codo_der, hombro_der, cadera_der
        "cadera_izquierda":   (11, 23, 25),   # hombro_izq, cadera_izq, rodilla_izq
        "cadera_derecha":     (12, 24, 26),   # hombro_der, cadera_der, rodilla_der
        "rodilla_izquierda":  (23, 25, 27),   # cadera_izq, rodilla_izq, tobillo_izq
        "rodilla_derecha":    (24, 26, 28),   # cadera_der, rodilla_der, tobillo_der
        "tobillo_izquierdo":  (25, 27, 31),   # rodilla_izq, tobillo_izq, pie_izq
        "tobillo_derecho":    (26, 28, 32),   # rodilla_der, tobillo_der, pie_der
    }

    # ── Conexiones del esqueleto para visualización ─────────────────────
    SKELETON_CONNECTIONS = [
        # Torso
        (11, 12), (11, 23), (12, 24), (23, 24),
        # Brazo izquierdo
        (11, 13), (13, 15), (15, 17), (15, 19), (15, 21),
        # Brazo derecho
        (12, 14), (14, 16), (16, 18), (16, 20), (16, 22),
        # Pierna izquierda
        (23, 25), (25, 27), (27, 29), (27, 31),
        # Pierna derecha
        (24, 26), (26, 28), (28, 30), (28, 32),
    ]

    # ── CNN-LSTM ────────────────────────────────────────────────────────
    SEQUENCE_LENGTH = 120         # Frames por secuencia (normalizado)
    FEATURE_DIM = None            # Se calcula dinámicamente
    CNN_FILTERS = [64, 128, 256]  # Filtros de las capas Conv1D
    CNN_KERNEL_SIZE = 3
    LSTM_UNITS = [128, 64]        # Unidades de las capas LSTM
    DENSE_UNITS = [128, 64]       # Unidades de las capas Dense
    DROPOUT_RATE = 0.3
    LEARNING_RATE = 0.001
    BATCH_SIZE = 16
    EPOCHS = 100
    EARLY_STOPPING_PATIENCE = 15
    VALIDATION_SPLIT = 0.15
    TEST_SPLIT = 0.15

    # ── DTW ─────────────────────────────────────────────────────────────
    DTW_DISTANCE_METRIC = "euclidean"
    DTW_QUALITY_THRESHOLDS = {
        "excelente": 0.15,    # Distancia normalizada < 15%
        "bueno": 0.30,        # Distancia normalizada < 30%
        "aceptable": 0.50,    # Distancia normalizada < 50%
        "necesita_mejora": 1.0 # Distancia normalizada >= 50%
    }
    # Umbral para marcar una articulación como "a corregir"
    JOINT_CORRECTION_THRESHOLD = 0.25

    # ── Calificación unificada (FUENTE ÚNICA DE VERDAD) ─────────────────
    # Antes los umbrales estaban dispersos y contradictorios en 4 lugares.
    # Aquí se centralizan. El puntaje va de 0.0 a 1.0 (0% a 100%).
    GRADE_BANDS = [
        # (puntaje_mínimo, etiqueta, descripción para el usuario)
        (0.85, "Excelente",       "Ejecución muy cercana a la referencia del instructor."),
        (0.70, "Bueno",           "Ejecución correcta con detalles menores por mejorar."),
        (0.50, "Aceptable",       "Necesita práctica en varias articulaciones."),
        (0.00, "Necesita mejora", "Diferencias significativas con la referencia."),
    ]
    # Bandas de corrección por articulación, según la diferencia promedio en grados.
    # (diferencia_mínima_en_grados, severidad, plantilla_de_mensaje)
    # Se evalúan de mayor a menor: la primera que se cumpla define el mensaje.
    CORRECTION_BANDS = [
        (45, "alta",   "La posición del {joint} difiere significativamente de la referencia"),
        (25, "media",  "El {joint} necesita un ajuste moderado"),
        (12, "baja",   "El {joint} requiere un pequeño ajuste"),
    ]
    # Si la diferencia promedio de una articulación supera esto (en grados),
    # se incluye como corrección. Por debajo se considera correcta.
    CORRECTION_MIN_DEGREES = 12

    # Normalización del puntaje por ángulo: una diferencia de este valor (grados)
    # equivale a puntaje 0. Antes era 180° (demasiado indulgente); 60° es realista
    # para evaluación técnica de artes marciales.
    ANGLE_SCORE_FULL_PENALTY_DEGREES = 60.0

    @classmethod
    def ensure_directories(cls):
        """Crea todos los directorios necesarios del proyecto."""
        dirs_to_create = [
            cls.RAW_VIDEOS_DIR,
            cls.LANDMARKS_DIR,
            cls.ANGLES_DIR,
            cls.SEQUENCES_DIR,
            cls.MODELS_DIR,
            cls.RESULTS_DIR,
        ]
        # Crear carpetas por kata
        for kata in cls.KATA_NAMES:
            dirs_to_create.append(cls.RAW_VIDEOS_DIR / kata / "referencia")
            dirs_to_create.append(cls.RAW_VIDEOS_DIR / kata / "practicantes")

        for d in dirs_to_create:
            d.mkdir(parents=True, exist_ok=True)

        return dirs_to_create

    @classmethod
    def get_feature_dim(cls):
        """Calcula la dimensión de features por frame.
        
        Features = landmarks del cuerpo (x,y,z) + ángulos articulares
        """
        body_coords = len(cls.BODY_LANDMARKS) * 3  # x, y, z por cada landmark
        angles = len(cls.JOINT_ANGLES)
        cls.FEATURE_DIM = body_coords + angles
        return cls.FEATURE_DIM
