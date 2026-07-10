"""
Clases base abstractas del Sistema Inteligente de Hapkido.

Define interfaces (contratos) para los componentes principales del sistema,
garantizando ESCALABILIDAD mediante el principio Abierto/Cerrado (SOLID-O):
se pueden crear nuevas implementaciones sin modificar las existentes.

Patrón de diseño: Strategy + Template Method
"""
from abc import ABC, abstractmethod
import numpy as np


class BaseExtractor(ABC):
    """Interfaz abstracta para extractores de pose corporal.

    Cualquier nuevo extractor (MediaPipe, OpenPose, MoveNet, etc.)
    debe implementar estos métodos para ser compatible con el pipeline.

    Ejemplo de extensión:
        class OpenPoseExtractor(BaseExtractor):
            def extract_from_video(self, video_path): ...
            def extract_from_frame(self, frame): ...
            def normalize(self, landmarks): ...
            def close(self): ...
    """

    @abstractmethod
    def extract_from_video(self, video_path: str) -> dict:
        """Extrae landmarks de todos los frames de un video.

        Args:
            video_path: Ruta al archivo de video.

        Returns:
            dict con claves: 'landmarks', 'angles', 'fps',
            'total_frames', 'valid_frames'.
        """
        pass

    @abstractmethod
    def extract_from_frame(self, frame: np.ndarray) -> tuple:
        """Extrae landmarks de un único frame.

        Args:
            frame: Imagen BGR (np.ndarray).

        Returns:
            Tupla (landmarks, angles) o (None, None) si no se detecta.
        """
        pass

    @abstractmethod
    def normalize(self, landmarks: np.ndarray) -> np.ndarray:
        """Normaliza landmarks para independencia de posición y escala.

        Args:
            landmarks: Array de landmarks crudos.

        Returns:
            Array normalizado.
        """
        pass

    @abstractmethod
    def close(self):
        """Libera recursos del extractor."""
        pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


class BaseEvaluator(ABC):
    """Interfaz abstracta para evaluadores de calidad de ejecución.

    Permite intercambiar el algoritmo de evaluación (DTW, ED, correlación)
    sin afectar al resto del sistema.

    Ejemplo de extensión:
        class CorrelationEvaluator(BaseEvaluator):
            def evaluate(self, ref, student): ...
            def get_corrections(self, result): ...
    """

    @abstractmethod
    def evaluate(self, reference: np.ndarray, student: np.ndarray) -> dict:
        """Evalúa la ejecución del practicante contra la referencia.

        Args:
            reference: Datos de la referencia (instructor).
            student: Datos del practicante.

        Returns:
            dict con: 'overall_score', 'quality_label', 'corrections'.
        """
        pass

    @abstractmethod
    def get_corrections(self, evaluation_result: dict) -> list:
        """Extrae la lista de correcciones de un resultado de evaluación.

        Args:
            evaluation_result: Resultado de evaluate().

        Returns:
            Lista de dicts con 'joint', 'message', 'avg_diff'.
        """
        pass


class BaseClassifier(ABC):
    """Interfaz abstracta para clasificadores de katas.

    Permite intercambiar el modelo (CNN-LSTM, Transformer, SVM, etc.)
    sin afectar al pipeline de predicción.
    """

    @abstractmethod
    def predict(self, features: np.ndarray) -> dict:
        """Clasifica una secuencia de features.

        Args:
            features: Array de features normalizado.

        Returns:
            dict con: 'kata_index', 'kata_name', 'confidence', 'top_k'.
        """
        pass

    @abstractmethod
    def load(self, model_path: str):
        """Carga un modelo entrenado desde disco."""
        pass


class BaseVisualizer(ABC):
    """Interfaz abstracta para visualizadores.

    Permite crear diferentes backends de visualización
    (OpenCV, web, terminal, etc.) sin modificar el pipeline.
    """

    @abstractmethod
    def render_skeleton(self, frame: np.ndarray, landmarks: np.ndarray,
                        corrections: list = None) -> np.ndarray:
        """Renderiza el esqueleto sobre un frame."""
        pass

    @abstractmethod
    def generate_report(self, evaluation_result: dict,
                        kata_name: str, output_path: str = None):
        """Genera un reporte de evaluación."""
        pass
