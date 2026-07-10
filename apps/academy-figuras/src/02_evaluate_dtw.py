"""
02_evaluate_dtw.py
Evalua la ejecucion de un practicante contra la referencia usando DTW.

Uso:
    python src/02_evaluate_dtw.py --kata kata_01
    python src/02_evaluate_dtw.py --ref ref.npy --student stu.npy
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import argparse
from pathlib import Path
import numpy as np
import pandas as pd
from utils.config import Config
from utils.dtw_utils import DTWEvaluator
from utils.pose_utils import PoseExtractor
from utils.visualization import PoseVisualizer


def evaluate_kata(kata_name, student_file=None):
    """Evalua todos los practicantes contra la referencia de una kata."""
    print("=" * 60)
    print(f"  EVALUACION DTW - {kata_name}")
    print("=" * 60)

    metadata = pd.read_csv(Config.METADATA_FILE)
    kata_data = metadata[metadata["kata"] == kata_name]

    # Buscar referencia
    ref_data = kata_data[kata_data["is_reference"] == True]
    if ref_data.empty:
        print(f"No hay video de referencia para {kata_name}")
        return

    ref_angles = np.load(ref_data.iloc[0]["angles_file"])
    ref_landmarks = np.load(ref_data.iloc[0]["landmarks_file"])
    print(f"Referencia: {ref_data.iloc[0]['filename']}")

    # Evaluar practicantes
    evaluator = DTWEvaluator()
    if student_file:
        students = [{"angles_file": student_file, "filename": Path(student_file).name}]
    else:
        stu_data = kata_data[kata_data["is_reference"] == False]
        students = stu_data.to_dict("records")

    if not students:
        print("No hay videos de practicantes para evaluar.")
        return

    Config.RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    for stu in students:
        print(f"\nEvaluando: {stu['filename']}")
        stu_angles = np.load(stu["angles_file"])

        result = evaluator.evaluate_angles_only(ref_angles, stu_angles)

        print(f"  Puntuacion: {result['overall_score']:.1%}")
        print(f"  Calidad: {result['quality_label']}")

        if result["corrections"]:
            print("  Correcciones:")
            for c in result["corrections"]:
                print(f"    - {c['joint']}: {c['avg_diff']:.1f} grados")

        # Generar reporte grafico
        report_path = Config.RESULTS_DIR / f"eval_{kata_name}_{Path(stu['filename']).stem}.png"
        PoseVisualizer.generate_evaluation_report(result, kata_name, str(report_path))


def evaluate_files(ref_file, student_file):
    """Evalua dos archivos de angulos directamente."""
    print("=" * 60)
    print("  EVALUACION DTW - Archivos directos")
    print("=" * 60)

    ref_angles = np.load(ref_file)
    stu_angles = np.load(student_file)

    evaluator = DTWEvaluator()
    result = evaluator.evaluate_angles_only(ref_angles, stu_angles)

    print(f"Puntuacion: {result['overall_score']:.1%}")
    print(f"Calidad: {result['quality_label']}")

    if result["corrections"]:
        print("\nCorrecciones necesarias:")
        for c in result["corrections"]:
            print(f"  - {c['message']}")

    Config.RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = Config.RESULTS_DIR / "eval_direct.png"
    PoseVisualizer.generate_evaluation_report(result, "Evaluacion Directa", str(report_path))
    return result


def main():
    parser = argparse.ArgumentParser(description="Evaluacion DTW de katas")
    parser.add_argument("--kata", type=str, default=None)
    parser.add_argument("--ref", type=str, default=None)
    parser.add_argument("--student", type=str, default=None)
    args = parser.parse_args()

    if args.ref and args.student:
        evaluate_files(args.ref, args.student)
    elif args.kata:
        evaluate_kata(args.kata)
    else:
        print("Uso: python 02_evaluate_dtw.py --kata kata_01")
        print("  o: python 02_evaluate_dtw.py --ref ref.npy --student stu.npy")


if __name__ == "__main__":
    main()
