# Módulo de utilidades para el Sistema Inteligente de Hapkido
#
# Arquitectura modular (Mantenibilidad):
#   - config.py      → Configuración centralizada
#   - base.py        → Interfaces abstractas (Escalabilidad)
#   - validators.py  → Validación y seguridad (Seguridad)
#   - logger.py      → Logging centralizado (Usabilidad)
#   - pose_utils.py  → Extracción de pose
#   - dtw_utils.py   → Evaluación DTW
#   - visualization.py → Visualización de resultados

from .config import Config
from .base import BaseExtractor, BaseEvaluator, BaseClassifier, BaseVisualizer
from .pose_utils import PoseExtractor
from .dtw_utils import DTWEvaluator
from .visualization import PoseVisualizer
from .validators import FileValidator, DataIntegrity, UserRole, check_permission
from .logger import get_logger
from . import grading

# La CNN-LSTM (y todo lo que arrastra torch) es OPCIONAL: el microservicio de
# DINAMYT Academy solo usa MediaPipe + DTW. Sin torch instalado, el resto del
# paquete sigue funcionando.
try:  # pragma: no cover
    from .model import KataCNNLSTM
    from .recognition import FigureLibrary, FigureRecognizer
    from . import engine
except ModuleNotFoundError:  # torch no instalado (modo servicio liviano)
    KataCNNLSTM = None
    FigureLibrary = None
    FigureRecognizer = None
    engine = None
