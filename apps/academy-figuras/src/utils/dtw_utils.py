"""
Módulo de evaluación con Dynamic Time Warping (DTW).
Compara la ejecución de un practicante contra una referencia de instructor
para evaluar la calidad y generar retroalimentación articulación por articulación.

Implementa BaseEvaluator (Escalabilidad):
    Se puede reemplazar por otro algoritmo (correlación, distancia euclidiana)
    creando una nueva clase que herede de BaseEvaluator.
"""
import numpy as np
from dtw import dtw
from .config import Config
from .base import BaseEvaluator


class DTWEvaluator(BaseEvaluator):
    """Evalúa la calidad de ejecución de una kata usando DTW.

    Implementa la interfaz BaseEvaluator, permitiendo intercambiar
    el algoritmo de evaluación sin afectar al pipeline.
    """

    def __init__(self):
        """Inicializa el evaluador DTW."""
        self.angle_names = list(Config.JOINT_ANGLES.keys())

    def evaluate(self, reference_features: np.ndarray,
                 student_features: np.ndarray) -> dict:
        """Evalúa la ejecución del practicante contra la referencia.

        Args:
            reference_features: Features de la referencia, shape (T1, D).
            student_features: Features del practicante, shape (T2, D).

        Returns:
            dict con:
                - 'overall_score': Puntuación global normalizada [0, 1]
                - 'quality_label': Etiqueta de calidad
                - 'dtw_distance': Distancia DTW total
                - 'dtw_normalized_distance': Distancia normalizada
                - 'alignment_path': Camino de alineación DTW
                - 'joint_scores': Puntuación por articulación
                - 'corrections': Lista de articulaciones a corregir
                - 'frame_deviations': Desviación por frame alineado
        """
        # DTW global sobre todas las features
        alignment = dtw(
            student_features,
            reference_features,
            dist_method=Config.DTW_DISTANCE_METRIC,
            keep_internals=True
        )

        # Distancia normalizada
        path_length = len(alignment.index1)
        normalized_distance = alignment.distance / path_length if path_length > 0 else float('inf')

        # Calcular puntuación global [0, 1] (1 = perfecto)
        overall_score = max(0.0, 1.0 - normalized_distance)

        # Determinar etiqueta de calidad
        quality_label = self._get_quality_label(normalized_distance)

        # Evaluación por articulación/ángulo
        joint_scores, corrections = self._evaluate_joints(
            reference_features, student_features,
            alignment.index1, alignment.index2
        )

        # Desviaciones por frame alineado
        frame_deviations = self._compute_frame_deviations(
            reference_features, student_features,
            alignment.index1, alignment.index2
        )

        return {
            "overall_score": overall_score,
            "quality_label": quality_label,
            "dtw_distance": alignment.distance,
            "dtw_normalized_distance": normalized_distance,
            "alignment_path": (alignment.index1, alignment.index2),
            "joint_scores": joint_scores,
            "corrections": corrections,
            "frame_deviations": frame_deviations,
        }

    def evaluate_angles_only(self, reference_angles: np.ndarray,
                              student_angles: np.ndarray) -> dict:
        """Evalúa usando solo los ángulos articulares (más interpretable).

        Args:
            reference_angles: Ángulos de referencia, shape (T1, num_angles).
            student_angles: Ángulos del practicante, shape (T2, num_angles).

        Returns:
            dict con evaluación detallada por articulación.
        """
        # DTW sobre ángulos
        alignment = dtw(
            student_angles,
            reference_angles,
            dist_method=Config.DTW_DISTANCE_METRIC,
            keep_internals=True
        )

        path_length = len(alignment.index1)
        normalized_distance = alignment.distance / path_length if path_length > 0 else float('inf')

        # Desviación (en grados) por cada par de frames alineados.
        # Antes este dato no se devolvía aquí, por lo que el panel de "desviación
        # temporal" del reporte siempre salía vacío en el pipeline real.
        frame_deviations = self._compute_frame_deviations(
            reference_angles, student_angles,
            alignment.index1, alignment.index2
        )

        # Evaluar cada articulación SOBRE LA ALINEACIÓN COMPARTIDA.
        # Antes se hacía un DTW independiente por ángulo, lo que deformaba el
        # tiempo de cada articulación por separado (físicamente inconsistente) y
        # disimulaba errores. Ahora todas las articulaciones se miden sobre el
        # mismo emparejamiento de frames, dado por el DTW global.
        aligned_stu = student_angles[alignment.index1]   # (P, num_angles)
        aligned_ref = reference_angles[alignment.index2]  # (P, num_angles)
        abs_diffs = np.abs(aligned_ref - aligned_stu)     # (P, num_angles)

        joint_evaluations = {}
        corrections = []

        for i, angle_name in enumerate(self.angle_names):
            col = abs_diffs[:, i]
            avg_diff = float(np.mean(col))
            max_diff = float(np.max(col))

            # Puntaje por ángulo: normalizado por un umbral realista (Config),
            # no por 180° (que hacía los puntajes demasiado indulgentes).
            angle_score = max(0.0, 1.0 - avg_diff / Config.ANGLE_SCORE_FULL_PENALTY_DEGREES)

            joint_evaluations[angle_name] = {
                "score": angle_score,
                "avg_difference_degrees": avg_diff,
                "max_difference_degrees": max_diff,
                "quality": self._get_angle_quality(avg_diff),
            }

            # Una articulación se reporta como corrección si su diferencia
            # promedio supera el umbral unificado de Config (en grados).
            if avg_diff > Config.CORRECTION_MIN_DEGREES:
                corrections.append({
                    "joint": angle_name,
                    "avg_diff": avg_diff,
                    "max_diff": max_diff,
                    "message": self._generate_correction_message(angle_name, avg_diff),
                })

        overall_score = float(np.mean([v["score"] for v in joint_evaluations.values()]))

        return {
            "overall_score": overall_score,
            "quality_label": self._get_quality_label(1.0 - overall_score),
            "joint_evaluations": joint_evaluations,
            "corrections": corrections,
            "frame_deviations": frame_deviations,
            "alignment_path": (alignment.index1, alignment.index2),
        }

    def dtw_distance(self, reference_angles: np.ndarray,
                     student_angles: np.ndarray) -> float:
        """Distancia DTW normalizada entre dos secuencias de ángulos.

        Útil para el reconocimiento por referencia: cuanto menor la distancia,
        más se parece la ejecución a la referencia. Es independiente de la
        longitud de los videos (se divide por la longitud del camino).

        Returns:
            Distancia normalizada (>= 0). 0 = idéntico.
        """
        alignment = dtw(
            student_angles,
            reference_angles,
            dist_method=Config.DTW_DISTANCE_METRIC,
            keep_internals=False
        )
        path_length = len(alignment.index1)
        return alignment.distance / path_length if path_length > 0 else float('inf')

    def _evaluate_joints(self, ref_features, stu_features, idx1, idx2):
        """Evalúa cada articulación/feature por separado."""
        num_body_landmarks = len(Config.BODY_LANDMARKS)
        num_angles = len(Config.JOINT_ANGLES)
        angle_start_idx = num_body_landmarks * 3

        joint_scores = {}
        corrections = []

        # Evaluar ángulos (última parte del vector de features)
        for i, angle_name in enumerate(self.angle_names):
            feat_idx = angle_start_idx + i
            if feat_idx < ref_features.shape[1] and feat_idx < stu_features.shape[1]:
                ref_vals = ref_features[idx2, feat_idx]
                stu_vals = stu_features[idx1, feat_idx]
                diff = np.mean(np.abs(ref_vals - stu_vals))
                score = max(0.0, 1.0 - diff / 180.0)

                joint_scores[angle_name] = score

                if diff > Config.JOINT_CORRECTION_THRESHOLD * 180:
                    corrections.append({
                        "joint": angle_name,
                        "score": score,
                        "avg_diff_degrees": diff,
                        "message": self._generate_correction_message(angle_name, diff),
                    })

        return joint_scores, corrections

    def _compute_frame_deviations(self, ref_features, stu_features, idx1, idx2):
        """Calcula la desviación euclidiana por cada par de frames alineados."""
        deviations = []
        for i in range(len(idx1)):
            dev = np.linalg.norm(ref_features[idx2[i]] - stu_features[idx1[i]])
            deviations.append(dev)
        return np.array(deviations)

    @staticmethod
    def _get_quality_label(normalized_distance: float) -> str:
        """Determina la etiqueta de calidad basada en la distancia normalizada."""
        for label, threshold in Config.DTW_QUALITY_THRESHOLDS.items():
            if normalized_distance <= threshold:
                return label
        return "necesita_mejora"

    @staticmethod
    def _get_angle_quality(avg_diff_degrees: float) -> str:
        """Califica la calidad de un ángulo específico."""
        if avg_diff_degrees < 10:
            return "excelente"
        elif avg_diff_degrees < 20:
            return "bueno"
        elif avg_diff_degrees < 35:
            return "aceptable"
        else:
            return "necesita_mejora"

    @staticmethod
    def _generate_correction_message(angle_name: str, avg_diff: float) -> str:
        """Genera un mensaje de corrección legible para el practicante."""
        joint_translations = {
            "codo_izquierdo": "codo izquierdo",
            "codo_derecho": "codo derecho",
            "hombro_izquierdo": "hombro izquierdo",
            "hombro_derecho": "hombro derecho",
            "cadera_izquierda": "cadera izquierda",
            "cadera_derecha": "cadera derecha",
            "rodilla_izquierda": "rodilla izquierda",
            "rodilla_derecha": "rodilla derecha",
            "tobillo_izquierdo": "tobillo izquierdo",
            "tobillo_derecho": "tobillo derecho",
        }

        joint_name = joint_translations.get(angle_name, angle_name)

        # Bandas de severidad unificadas en Config (de mayor a menor).
        severity = "El {} requiere un pequeño ajuste".format(joint_name)
        for min_deg, _level, template in Config.CORRECTION_BANDS:
            if avg_diff >= min_deg:
                severity = template.format(joint=joint_name)
                break

        return f"{severity} (diferencia promedio: {avg_diff:.1f}°). " \
               f"Revise la ejecución de referencia y ajuste el ángulo de esta articulación."

    # ── Implementación de la interfaz BaseEvaluator (Escalabilidad) ─────

    def get_corrections(self, evaluation_result: dict) -> list:
        """Implementa BaseEvaluator.get_corrections.

        Extrae la lista de correcciones de un resultado de evaluación.

        Args:
            evaluation_result: Resultado de evaluate() o evaluate_angles_only().

        Returns:
            Lista de dicts con 'joint', 'message', 'avg_diff'.
        """
        return evaluation_result.get("corrections", [])

