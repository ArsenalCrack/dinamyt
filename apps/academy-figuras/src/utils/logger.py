"""
Sistema de logging centralizado del Sistema Inteligente de Hapkido.

Garantiza USABILIDAD y MANTENIBILIDAD mediante:
- Mensajes de progreso claros y formateados
- Niveles de detalle configurables (INFO, WARNING, ERROR, DEBUG)
- Salida a consola con colores y a archivo de log
- Formato consistente en todos los módulos del sistema
"""
import logging
import sys
from pathlib import Path
from datetime import datetime
from .config import Config


class HapkidoLogger:
    """Logger centralizado con formato consistente para todo el sistema.

    Uso:
        from utils.logger import get_logger
        logger = get_logger("01_extract_pose")
        logger.info("Procesando video...")
        logger.warning("Baja detección de pose")
        logger.error("Video no encontrado")
        logger.step(1, 4, "Extrayendo pose corporal")
        logger.success("Pipeline finalizado")
    """

    # Colores ANSI para terminal (mejora usabilidad)
    COLORS = {
        "RESET": "\033[0m",
        "GREEN": "\033[92m",
        "YELLOW": "\033[93m",
        "RED": "\033[91m",
        "BLUE": "\033[94m",
        "CYAN": "\033[96m",
        "BOLD": "\033[1m",
        "DIM": "\033[2m",
    }

    def __init__(self, name: str, log_to_file: bool = True):
        """Inicializa el logger.

        Args:
            name: Nombre del módulo (ej: '01_extract_pose').
            log_to_file: Si guarda logs en archivo.
        """
        self.name = name
        self.logger = logging.getLogger(f"hapkido.{name}")
        self.logger.setLevel(logging.DEBUG)

        # Evitar duplicar handlers si se instancia varias veces
        if not self.logger.handlers:
            # Handler de consola (con colores)
            console = logging.StreamHandler(sys.stdout)
            console.setLevel(logging.INFO)
            console.setFormatter(self._ConsoleFormatter())
            self.logger.addHandler(console)

            # Handler de archivo (sin colores, con más detalle)
            if log_to_file:
                log_dir = Config.RESULTS_DIR / "logs"
                log_dir.mkdir(parents=True, exist_ok=True)
                log_file = log_dir / f"{name}_{datetime.now():%Y%m%d}.log"
                file_handler = logging.FileHandler(str(log_file), encoding="utf-8")
                file_handler.setLevel(logging.DEBUG)
                file_handler.setFormatter(logging.Formatter(
                    "%(asctime)s | %(name)s | %(levelname)s | %(message)s",
                    datefmt="%Y-%m-%d %H:%M:%S",
                ))
                self.logger.addHandler(file_handler)

    def info(self, message: str):
        """Mensaje informativo."""
        self.logger.info(message)

    def warning(self, message: str):
        """Mensaje de advertencia."""
        self.logger.warning(message)

    def error(self, message: str):
        """Mensaje de error."""
        self.logger.error(message)

    def debug(self, message: str):
        """Mensaje de depuración (solo en archivo de log)."""
        self.logger.debug(message)

    def header(self, title: str):
        """Muestra un encabezado formateado para secciones principales.

        Args:
            title: Título del encabezado.
        """
        separator = "=" * 60
        self.logger.info(separator)
        self.logger.info(f"  {title}")
        self.logger.info(separator)

    def step(self, current: int, total: int, description: str):
        """Muestra el progreso del pipeline paso a paso.

        Args:
            current: Paso actual.
            total: Total de pasos.
            description: Descripción del paso.
        """
        c = self.COLORS
        msg = f"{c['CYAN']}[{current}/{total}]{c['RESET']} {description}..."
        self.logger.info(msg)

    def success(self, message: str):
        """Muestra un mensaje de éxito destacado.

        Args:
            message: Mensaje de éxito.
        """
        c = self.COLORS
        self.logger.info(f"{c['GREEN']}✓ {message}{c['RESET']}")

    def result(self, label: str, value, unit: str = ""):
        """Muestra un resultado con formato clave-valor.

        Args:
            label: Etiqueta del resultado.
            value: Valor.
            unit: Unidad opcional.
        """
        c = self.COLORS
        unit_str = f" {unit}" if unit else ""
        self.logger.info(f"  {c['DIM']}{label}:{c['RESET']} {value}{unit_str}")

    def table(self, headers: list, rows: list):
        """Muestra datos en formato tabla.

        Args:
            headers: Lista de encabezados.
            rows: Lista de listas con los datos.
        """
        if not rows:
            return

        # Calcular anchos de columna
        all_data = [headers] + rows
        col_widths = [
            max(len(str(row[i])) for row in all_data)
            for i in range(len(headers))
        ]

        # Formatear
        header_line = " | ".join(
            str(h).ljust(w) for h, w in zip(headers, col_widths)
        )
        separator = "-+-".join("-" * w for w in col_widths)

        self.logger.info(f"  {header_line}")
        self.logger.info(f"  {separator}")
        for row in rows:
            line = " | ".join(
                str(v).ljust(w) for v, w in zip(row, col_widths)
            )
            self.logger.info(f"  {line}")

    def next_step(self, command: str):
        """Indica cuál es el siguiente paso del pipeline.

        Args:
            command: Comando del siguiente paso.
        """
        c = self.COLORS
        self.logger.info(
            f"\n{c['BLUE']}→ Siguiente paso:{c['RESET']} {command}"
        )

    class _ConsoleFormatter(logging.Formatter):
        """Formateador con colores para la consola."""

        LEVEL_COLORS = {
            logging.DEBUG: "\033[2m",      # Dim
            logging.INFO: "",               # Normal
            logging.WARNING: "\033[93m",    # Yellow
            logging.ERROR: "\033[91m",      # Red
            logging.CRITICAL: "\033[91;1m", # Bold Red
        }

        def format(self, record):
            color = self.LEVEL_COLORS.get(record.levelno, "")
            reset = "\033[0m" if color else ""

            # No agregar prefijo de nivel para INFO (más limpio)
            if record.levelno == logging.INFO:
                return f"{record.getMessage()}"
            elif record.levelno == logging.WARNING:
                return f"{color}⚠ ADVERTENCIA: {record.getMessage()}{reset}"
            elif record.levelno >= logging.ERROR:
                return f"{color}✗ ERROR: {record.getMessage()}{reset}"
            else:
                return f"{color}[DEBUG] {record.getMessage()}{reset}"


def get_logger(name: str, log_to_file: bool = True) -> HapkidoLogger:
    """Obtiene una instancia del logger centralizado.

    Args:
        name: Nombre del módulo.
        log_to_file: Si guarda logs en archivo.

    Returns:
        Instancia de HapkidoLogger.
    """
    return HapkidoLogger(name, log_to_file)
