"""
Utilidades de extracción de pose corporal con MediaPipe BlazePose.
Incluye:
- Extracción de los 33 landmarks por frame
- Cálculo de ángulos articulares
- Normalización de coordenadas
- Construcción de vectores de features

Implementa BaseExtractor (Escalabilidad):
    Se puede reemplazar por otro extractor (OpenPose, MoveNet)
    creando una nueva clase que herede de BaseExtractor.
"""
import os
import urllib.request

import numpy as np
import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.core.base_options import BaseOptions
from .config import Config
from .base import BaseExtractor


def ensure_pose_model() -> str:
    """Garantiza que el modelo .task de PoseLandmarker exista (lo descarga si falta).

    Returns:
        Ruta al archivo del modelo.
    """
    path = Config.POSE_MODEL_PATH
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(Config.POSE_MODEL_URL, str(path))
    return str(path)


class PoseExtractor(BaseExtractor):
    """Extrae landmarks y ángulos articulares de videos usando MediaPipe.

    Usa la API Tasks de MediaPipe (PoseLandmarker). Las versiones recientes
    de MediaPipe (requeridas en Python 3.13/3.14) eliminaron la API antigua
    `mediapipe.solutions.pose`. La interfaz pública de esta clase no cambia,
    por lo que el resto del sistema funciona sin modificaciones.
    """

    def __init__(self):
        """Inicializa el detector de pose (API Tasks)."""
        self.model_path = ensure_pose_model()
        # El detector de VIDEO se crea por video (para reiniciar el tracking).
        self._image_landmarker = None  # se crea bajo demanda (modo IMAGE)

    def _make_video_landmarker(self):
        """Crea un PoseLandmarker en modo VIDEO (tracking temporal suavizado)."""
        options = vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=self.model_path),
            running_mode=vision.RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=Config.MEDIAPIPE_MIN_DETECTION_CONFIDENCE,
            min_tracking_confidence=Config.MEDIAPIPE_MIN_TRACKING_CONFIDENCE,
            min_pose_presence_confidence=Config.MEDIAPIPE_MIN_PRESENCE_CONFIDENCE,
        )
        return vision.PoseLandmarker.create_from_options(options)

    def extract_landmarks_from_video(self, video_path: str) -> dict:
        """Extrae landmarks de todos los frames de un video.

        Args:
            video_path: Ruta al archivo de video.

        Returns:
            dict con:
                - 'landmarks': np.array de shape (num_frames, 33, 4)
                - 'angles': np.array de shape (num_frames, num_angles)
                - 'fps': FPS del video original
                - 'total_frames': Número total de frames procesados
                - 'valid_frames': Número de frames donde se detectó pose
        """
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise FileNotFoundError(f"No se pudo abrir el video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        if not fps or fps <= 0:
            fps = float(Config.TARGET_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        all_landmarks = []
        all_angles = []
        valid_count = 0

        # Detector de VIDEO fresco por cada video (reinicia tracking y timestamps).
        landmarker = self._make_video_landmarker()
        frame_idx = 0
        last_ts = -1
        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                # Convertir BGR → RGB y envolver en mp.Image (API Tasks)
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)

                # Timestamp en ms, estrictamente creciente (requisito de la API)
                ts = int(round(frame_idx * 1000.0 / fps))
                if ts <= last_ts:
                    ts = last_ts + 1
                last_ts = ts
                frame_idx += 1

                results = landmarker.detect_for_video(mp_image, ts)

                if results.pose_landmarks:
                    # Extraer landmarks como array (33, 4)
                    landmarks = self._landmarks_to_array(results.pose_landmarks[0])
                    all_landmarks.append(landmarks)

                    # Calcular ángulos articulares
                    angles = self._compute_angles(landmarks)
                    all_angles.append(angles)
                    valid_count += 1
                else:
                    # Si no se detecta pose, agregar array de ceros
                    all_landmarks.append(np.zeros((Config.NUM_LANDMARKS, Config.LANDMARK_DIMS)))
                    all_angles.append(np.zeros(len(Config.JOINT_ANGLES)))
        finally:
            cap.release()
            landmarker.close()

        # total_frames del contenedor puede ser inexacto; usar los leídos.
        if total_frames <= 0:
            total_frames = frame_idx

        return {
            "landmarks": np.array(all_landmarks),
            "angles": np.array(all_angles),
            "fps": fps,
            "total_frames": total_frames,
            "valid_frames": valid_count,
        }

    def extract_landmarks_from_frame(self, frame: np.ndarray) -> tuple:
        """Extrae landmarks de un único frame.

        Args:
            frame: Imagen BGR (np.ndarray).

        Returns:
            Tupla (landmarks, angles) o (None, None) si no se detecta pose.
        """
        if self._image_landmarker is None:
            options = vision.PoseLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=self.model_path),
                running_mode=vision.RunningMode.IMAGE,
                num_poses=1,
                min_pose_detection_confidence=Config.MEDIAPIPE_MIN_DETECTION_CONFIDENCE,
                min_pose_presence_confidence=Config.MEDIAPIPE_MIN_PRESENCE_CONFIDENCE,
            )
            self._image_landmarker = vision.PoseLandmarker.create_from_options(options)

        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
        results = self._image_landmarker.detect(mp_image)

        if results.pose_landmarks:
            landmarks = self._landmarks_to_array(results.pose_landmarks[0])
            angles = self._compute_angles(landmarks)
            return landmarks, angles
        return None, None

    def _landmarks_to_array(self, pose_landmarks) -> np.ndarray:
        """Convierte una lista de 33 landmarks (API Tasks) a numpy array (33, 4).

        Cada landmark de la API Tasks expone x, y, z, visibility y presence.
        """
        landmarks = np.array([
            [lm.x, lm.y, lm.z, getattr(lm, "visibility", 0.0) or 0.0]
            for lm in pose_landmarks
        ])
        return landmarks

    @staticmethod
    def _compute_angles(landmarks: np.ndarray) -> np.ndarray:
        """Calcula los ángulos articulares definidos en Config.

        Args:
            landmarks: Array de shape (33, 4) con x, y, z, visibility.

        Returns:
            Array de ángulos en grados, shape (num_angles,).
        """
        angles = []
        for name, (a, b, c) in Config.JOINT_ANGLES.items():
            angle = PoseExtractor.calculate_angle(
                landmarks[a, :3],  # Punto A (x, y, z)
                landmarks[b, :3],  # Vértice  (x, y, z)
                landmarks[c, :3],  # Punto C (x, y, z)
            )
            angles.append(angle)
        return np.array(angles)

    @staticmethod
    def calculate_angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
        """Calcula el ángulo en el vértice b formado por los puntos a-b-c.

        Args:
            a: Coordenadas del punto A (3D).
            b: Coordenadas del vértice (3D).
            c: Coordenadas del punto C (3D).

        Returns:
            Ángulo en grados [0, 180].
        """
        ba = a - b
        bc = c - b

        # Producto punto y magnitudes
        cosine_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-8)
        # Clamp para evitar errores numéricos con arccos
        cosine_angle = np.clip(cosine_angle, -1.0, 1.0)
        angle = np.degrees(np.arccos(cosine_angle))
        return angle

    @staticmethod
    def normalize_landmarks(landmarks: np.ndarray) -> np.ndarray:
        """Normaliza los landmarks para independencia de posición y escala.

        Usa el punto medio entre las caderas como origen y la distancia
        entre hombros como factor de escala.

        Args:
            landmarks: Array de shape (num_frames, 33, 4).

        Returns:
            Array normalizado de shape (num_frames, 33, 4).
        """
        normalized = landmarks.copy()

        for i in range(len(normalized)):
            frame = normalized[i]

            # Centro: punto medio entre caderas (landmarks 23 y 24)
            hip_center = (frame[23, :3] + frame[24, :3]) / 2.0

            # Escala: distancia entre hombros (landmarks 11 y 12)
            shoulder_dist = np.linalg.norm(frame[11, :3] - frame[12, :3])
            if shoulder_dist < 1e-6:
                shoulder_dist = 1.0  # Evitar división por cero

            # Centrar y escalar coordenadas (x, y, z)
            frame[:, :3] = (frame[:, :3] - hip_center) / shoulder_dist
            normalized[i] = frame

        return normalized

    @staticmethod
    def build_feature_vector(landmarks: np.ndarray, angles: np.ndarray) -> np.ndarray:
        """Construye el vector de features combinando landmarks del cuerpo y ángulos.

        Args:
            landmarks: Array normalizado de shape (num_frames, 33, 4).
            angles: Array de ángulos de shape (num_frames, num_angles).

        Returns:
            Array de features de shape (num_frames, feature_dim).
        """
        # Tomar solo landmarks del cuerpo (excluir cara) y solo x, y, z
        body_coords = landmarks[:, Config.BODY_LANDMARKS, :3]
        # Aplanar: (num_frames, num_body_landmarks, 3) → (num_frames, num_body_landmarks*3)
        body_flat = body_coords.reshape(body_coords.shape[0], -1)

        # Concatenar con ángulos
        features = np.concatenate([body_flat, angles], axis=1)
        return features

    @staticmethod
    def normalize_sequence_length(features: np.ndarray,
                                   target_length: int = None) -> np.ndarray:
        """Normaliza la longitud de una secuencia mediante interpolación.

        Args:
            features: Array de shape (num_frames, feature_dim).
            target_length: Longitud objetivo. Default: Config.SEQUENCE_LENGTH.

        Returns:
            Array de shape (target_length, feature_dim).
        """
        if target_length is None:
            target_length = Config.SEQUENCE_LENGTH

        current_length = features.shape[0]
        if current_length == target_length:
            return features

        # Interpolación lineal para ajustar la longitud
        indices = np.linspace(0, current_length - 1, target_length)
        normalized = np.zeros((target_length, features.shape[1]))

        for j in range(features.shape[1]):
            normalized[:, j] = np.interp(
                indices,
                np.arange(current_length),
                features[:, j]
            )

        return normalized

    def close(self):
        """Libera recursos de MediaPipe."""
        if self._image_landmarker is not None:
            self._image_landmarker.close()
            self._image_landmarker = None

    # ── Implementación de la interfaz BaseExtractor (Escalabilidad) ──────

    def extract_from_video(self, video_path: str) -> dict:
        """Implementa BaseExtractor.extract_from_video."""
        return self.extract_landmarks_from_video(video_path)

    def extract_from_frame(self, frame: np.ndarray) -> tuple:
        """Implementa BaseExtractor.extract_from_frame."""
        return self.extract_landmarks_from_frame(frame)

    def normalize(self, landmarks: np.ndarray) -> np.ndarray:
        """Implementa BaseExtractor.normalize."""
        return self.normalize_landmarks(landmarks)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
