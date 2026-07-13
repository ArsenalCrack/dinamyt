"""
Módulo de visualización del sistema de Hapkido.
Permite dibujar el esqueleto corporal sobre frames de video,
marcar articulaciones que necesitan corrección, y generar
imágenes/videos con retroalimentación visual.
"""
import numpy as np
import cv2
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')  # Backend no interactivo
from .config import Config


class PoseVisualizer:
    """Visualiza poses corporales y retroalimentación correctiva."""

    # Colores (BGR para OpenCV)
    COLOR_CORRECT = (0, 255, 0)       # Verde - correcto
    COLOR_WARNING = (0, 165, 255)     # Naranja - ajuste menor
    COLOR_ERROR = (0, 0, 255)         # Rojo - necesita corrección
    COLOR_SKELETON = (255, 200, 100)  # Azul claro - esqueleto normal
    COLOR_REFERENCE = (255, 255, 0)   # Cian - referencia
    COLOR_TEXT_BG = (40, 40, 40)      # Gris oscuro - fondo de texto
    COLOR_WHITE = (255, 255, 255)

    # Landmark a segmento corporal (para colorear correcciones)
    JOINT_TO_LANDMARKS = {
        "codo_izquierdo": [11, 13, 15],
        "codo_derecho": [12, 14, 16],
        "hombro_izquierdo": [13, 11, 23],
        "hombro_derecho": [14, 12, 24],
        "cadera_izquierda": [11, 23, 25],
        "cadera_derecha": [12, 24, 26],
        "rodilla_izquierda": [23, 25, 27],
        "rodilla_derecha": [24, 26, 28],
        "tobillo_izquierdo": [25, 27, 31],
        "tobillo_derecho": [26, 28, 32],
    }

    @staticmethod
    def draw_skeleton(frame: np.ndarray, landmarks: np.ndarray,
                      corrections: list = None,
                      show_angles: bool = True) -> np.ndarray:
        """Dibuja el esqueleto corporal sobre un frame.

        Args:
            frame: Imagen BGR.
            landmarks: Array (33, 4) con x, y, z, visibility.
            corrections: Lista de dicts con articulaciones a corregir.
            show_angles: Si muestra los ángulos articulares.

        Returns:
            Frame con el esqueleto dibujado.
        """
        h, w = frame.shape[:2]
        output = frame.copy()

        # Determinar landmarks que necesitan corrección
        error_landmarks = set()
        warning_landmarks = set()
        if corrections:
            for corr in corrections:
                joint_name = corr.get("joint", "")
                lm_indices = PoseVisualizer.JOINT_TO_LANDMARKS.get(joint_name, [])
                avg_diff = corr.get("avg_diff", corr.get("avg_diff_degrees", 0))
                if avg_diff > 45:
                    error_landmarks.update(lm_indices)
                else:
                    warning_landmarks.update(lm_indices)

        # Dibujar conexiones del esqueleto
        for start_idx, end_idx in Config.SKELETON_CONNECTIONS:
            if (landmarks[start_idx, 3] > 0.3 and landmarks[end_idx, 3] > 0.3):
                pt1 = (int(landmarks[start_idx, 0] * w),
                       int(landmarks[start_idx, 1] * h))
                pt2 = (int(landmarks[end_idx, 0] * w),
                       int(landmarks[end_idx, 1] * h))

                # Determinar color de la conexión
                if start_idx in error_landmarks or end_idx in error_landmarks:
                    color = PoseVisualizer.COLOR_ERROR
                    thickness = 3
                elif start_idx in warning_landmarks or end_idx in warning_landmarks:
                    color = PoseVisualizer.COLOR_WARNING
                    thickness = 3
                else:
                    color = PoseVisualizer.COLOR_CORRECT
                    thickness = 2

                cv2.line(output, pt1, pt2, color, thickness)

        # Dibujar puntos de landmarks
        for i in Config.BODY_LANDMARKS:
            if landmarks[i, 3] > 0.3:
                pt = (int(landmarks[i, 0] * w), int(landmarks[i, 1] * h))

                if i in error_landmarks:
                    color = PoseVisualizer.COLOR_ERROR
                    radius = 8
                elif i in warning_landmarks:
                    color = PoseVisualizer.COLOR_WARNING
                    radius = 7
                else:
                    color = PoseVisualizer.COLOR_CORRECT
                    radius = 5

                cv2.circle(output, pt, radius, color, -1)
                cv2.circle(output, pt, radius + 2, PoseVisualizer.COLOR_WHITE, 1)

        return output

    @staticmethod
    def draw_comparison(frame: np.ndarray,
                        student_landmarks: np.ndarray,
                        reference_landmarks: np.ndarray,
                        corrections: list = None) -> np.ndarray:
        """Dibuja el esqueleto del practicante y la referencia superpuestos.

        Args:
            frame: Imagen BGR del practicante.
            student_landmarks: Landmarks del practicante (33, 4).
            reference_landmarks: Landmarks de la referencia (33, 4).
            corrections: Lista de correcciones.

        Returns:
            Frame con ambos esqueletos superpuestos.
        """
        h, w = frame.shape[:2]
        output = frame.copy()

        # Dibujar referencia (semi-transparente)
        overlay = output.copy()
        for start_idx, end_idx in Config.SKELETON_CONNECTIONS:
            if (reference_landmarks[start_idx, 3] > 0.3 and
                reference_landmarks[end_idx, 3] > 0.3):
                pt1 = (int(reference_landmarks[start_idx, 0] * w),
                       int(reference_landmarks[start_idx, 1] * h))
                pt2 = (int(reference_landmarks[end_idx, 0] * w),
                       int(reference_landmarks[end_idx, 1] * h))
                cv2.line(overlay, pt1, pt2, PoseVisualizer.COLOR_REFERENCE, 2)

        # Aplicar transparencia a la referencia
        cv2.addWeighted(overlay, 0.4, output, 0.6, 0, output)

        # Dibujar esqueleto del practicante encima
        output = PoseVisualizer.draw_skeleton(output, student_landmarks, corrections)

        return output

    @staticmethod
    def create_evaluation_panel(frame: np.ndarray,
                                 evaluation_result: dict,
                                 kata_name: str = "") -> np.ndarray:
        """Crea un panel de evaluación junto al frame del video.

        Args:
            frame: Frame del video con esqueleto dibujado.
            evaluation_result: Resultado de DTWEvaluator.evaluate().
            kata_name: Nombre de la kata clasificada.

        Returns:
            Imagen combinada (frame + panel de evaluación).
        """
        h, w = frame.shape[:2]
        panel_width = 400
        panel = np.zeros((h, panel_width, 3), dtype=np.uint8)
        panel[:] = (30, 30, 30)  # Fondo oscuro

        y_offset = 30
        font = cv2.FONT_HERSHEY_SIMPLEX

        # Título
        cv2.putText(panel, "EVALUACION DE KATA", (15, y_offset),
                    font, 0.7, PoseVisualizer.COLOR_WHITE, 2)
        y_offset += 35

        if kata_name:
            cv2.putText(panel, f"Kata: {kata_name}", (15, y_offset),
                        font, 0.6, (200, 200, 100), 1)
            y_offset += 30

        # Puntuación global
        score = evaluation_result.get("overall_score", 0)
        quality = evaluation_result.get("quality_label", "N/A")
        score_color = PoseVisualizer._score_to_color(score)

        cv2.putText(panel, f"Puntuacion: {score:.1%}", (15, y_offset),
                    font, 0.6, score_color, 2)
        y_offset += 25
        cv2.putText(panel, f"Calidad: {quality}", (15, y_offset),
                    font, 0.5, score_color, 1)
        y_offset += 35

        # Barra de progreso
        bar_x, bar_y = 15, y_offset
        bar_w, bar_h = panel_width - 30, 20
        cv2.rectangle(panel, (bar_x, bar_y),
                      (bar_x + bar_w, bar_y + bar_h), (60, 60, 60), -1)
        filled_w = int(bar_w * min(score, 1.0))
        cv2.rectangle(panel, (bar_x, bar_y),
                      (bar_x + filled_w, bar_y + bar_h), score_color, -1)
        y_offset += 40

        # Línea separadora
        cv2.line(panel, (15, y_offset), (panel_width - 15, y_offset),
                 (80, 80, 80), 1)
        y_offset += 20

        # Puntuación por articulación
        cv2.putText(panel, "ARTICULACIONES:", (15, y_offset),
                    font, 0.5, PoseVisualizer.COLOR_WHITE, 1)
        y_offset += 25

        joint_scores = evaluation_result.get("joint_scores", {})
        joint_evals = evaluation_result.get("joint_evaluations", {})

        items = joint_scores if joint_scores else {k: v.get("score", 0) for k, v in joint_evals.items()}

        for joint_name, score_val in items.items():
            display_name = joint_name.replace("_", " ").title()
            color = PoseVisualizer._score_to_color(score_val if isinstance(score_val, float) else score_val)

            # Mini barra
            mini_bar_w = 100
            filled = int(mini_bar_w * min(score_val, 1.0))
            cv2.rectangle(panel, (15, y_offset - 10),
                          (15 + mini_bar_w, y_offset + 5), (60, 60, 60), -1)
            cv2.rectangle(panel, (15, y_offset - 10),
                          (15 + filled, y_offset + 5), color, -1)

            cv2.putText(panel, f"{display_name}: {score_val:.0%}",
                        (125, y_offset + 3), font, 0.35, color, 1)
            y_offset += 20

            if y_offset > h - 60:
                break

        # Correcciones
        corrections = evaluation_result.get("corrections", [])
        if corrections and y_offset < h - 80:
            y_offset += 10
            cv2.line(panel, (15, y_offset), (panel_width - 15, y_offset),
                     (80, 80, 80), 1)
            y_offset += 20
            cv2.putText(panel, "CORRECCIONES:", (15, y_offset),
                        font, 0.5, PoseVisualizer.COLOR_ERROR, 1)
            y_offset += 25

            for corr in corrections[:5]:  # Máximo 5 correcciones visibles
                msg = corr.get("message", "")
                # Truncar mensaje si es muy largo
                if len(msg) > 45:
                    msg = msg[:42] + "..."
                cv2.putText(panel, f"! {msg}", (15, y_offset),
                            font, 0.3, (200, 200, 200), 1)
                y_offset += 18

        # Combinar frame y panel
        combined = np.hstack([frame, panel])
        return combined

    @staticmethod
    def generate_evaluation_report(evaluation_result: dict,
                                    kata_name: str = "",
                                    output_path: str = None) -> plt.Figure:
        """Genera un reporte gráfico de la evaluación con matplotlib.

        Args:
            evaluation_result: Resultado de la evaluación DTW.
            kata_name: Nombre de la kata.
            output_path: Ruta para guardar la imagen del reporte.

        Returns:
            Figura de matplotlib.
        """
        fig, axes = plt.subplots(2, 2, figsize=(14, 10))
        fig.suptitle(f"Reporte de Evaluación - {kata_name}",
                     fontsize=16, fontweight='bold', y=0.98)

        # 1. Puntuación global (gauge chart simplificado)
        ax1 = axes[0, 0]
        score = evaluation_result.get("overall_score", 0)
        quality = evaluation_result.get("quality_label", "N/A")
        colors_map = {"excelente": "#00C853", "bueno": "#FFD600",
                      "aceptable": "#FF9100", "necesita_mejora": "#FF1744"}
        bar_color = colors_map.get(quality, "#9E9E9E")

        ax1.barh(["Puntuación"], [score], color=bar_color, height=0.5)
        ax1.set_xlim(0, 1)
        ax1.set_title(f"Puntuación Global: {score:.1%}\nCalidad: {quality}",
                      fontsize=12)
        ax1.axvline(x=0.5, color='gray', linestyle='--', alpha=0.5)
        ax1.axvline(x=0.85, color='gray', linestyle='--', alpha=0.5)

        # 2. Puntuación por articulación (radar chart simplificado)
        ax2 = axes[0, 1]
        joint_evals = evaluation_result.get("joint_evaluations", {})
        joint_scores = evaluation_result.get("joint_scores", {})
        items = joint_evals if joint_evals else joint_scores

        if items:
            names = [k.replace("_", " ").title() for k in items.keys()]
            scores_vals = [v.get("score", v) if isinstance(v, dict) else v for v in items.values()]
            colors_list = [colors_map.get(PoseVisualizer._score_to_label(s), "#9E9E9E")
                           for s in scores_vals]

            bars = ax2.barh(names, scores_vals, color=colors_list, height=0.6)
            ax2.set_xlim(0, 1)
            ax2.set_title("Puntuación por Articulación", fontsize=12)
            for bar, val in zip(bars, scores_vals):
                ax2.text(bar.get_width() + 0.02, bar.get_y() + bar.get_height()/2,
                         f"{val:.0%}", va='center', fontsize=9)

        # 3. Desviaciones por frame
        ax3 = axes[1, 0]
        deviations = evaluation_result.get("frame_deviations", np.array([]))
        if len(deviations) > 0:
            ax3.plot(deviations, color='#1976D2', linewidth=0.8, alpha=0.8)
            ax3.fill_between(range(len(deviations)), deviations,
                             alpha=0.2, color='#1976D2')
            ax3.axhline(y=np.mean(deviations), color='red', linestyle='--',
                        label=f'Promedio: {np.mean(deviations):.2f}')
            ax3.set_xlabel("Frame alineado")
            ax3.set_ylabel("Desviación")
            ax3.set_title("Desviación por Frame (DTW)", fontsize=12)
            ax3.legend()
        else:
            ax3.text(0.5, 0.5, "Sin datos de desviación por frame",
                     ha='center', va='center', transform=ax3.transAxes)

        # 4. Correcciones (tabla)
        ax4 = axes[1, 1]
        ax4.axis('off')
        corrections = evaluation_result.get("corrections", [])
        if corrections:
            table_data = []
            for corr in corrections[:8]:
                joint = corr.get("joint", "").replace("_", " ").title()
                diff = corr.get("avg_diff", corr.get("avg_diff_degrees", 0))
                table_data.append([joint, f"{diff:.1f}°"])

            table = ax4.table(cellText=table_data,
                              colLabels=["Articulación", "Desviación"],
                              loc='center', cellLoc='center')
            table.auto_set_font_size(False)
            table.set_fontsize(10)
            table.scale(1, 1.5)
            ax4.set_title("Articulaciones a Corregir", fontsize=12, pad=20)
        else:
            ax4.text(0.5, 0.5, "¡Sin correcciones necesarias!\n🎉 Excelente ejecución",
                     ha='center', va='center', transform=ax4.transAxes, fontsize=14)
            ax4.set_title("Correcciones", fontsize=12)

        plt.tight_layout()

        if output_path:
            fig.savefig(output_path, dpi=150, bbox_inches='tight')
            print(f"Reporte guardado en: {output_path}")

        return fig

    @staticmethod
    def _score_to_color(score: float) -> tuple:
        """Convierte un score [0, 1] a color BGR."""
        if score >= 0.85:
            return PoseVisualizer.COLOR_CORRECT
        elif score >= 0.50:
            return PoseVisualizer.COLOR_WARNING
        else:
            return PoseVisualizer.COLOR_ERROR

    @staticmethod
    def _score_to_label(score: float) -> str:
        """Convierte un score a etiqueta de calidad."""
        if score >= 0.85:
            return "excelente"
        elif score >= 0.70:
            return "bueno"
        elif score >= 0.50:
            return "aceptable"
        else:
            return "necesita_mejora"
