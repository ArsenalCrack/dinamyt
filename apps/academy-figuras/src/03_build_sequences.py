"""
03_build_sequences.py
Construye secuencias temporales normalizadas para el modelo CNN-LSTM.
Combina landmarks + angulos en vectores de features y normaliza longitud.

Uso:
    python src/03_build_sequences.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import pickle
from tqdm import tqdm
from utils.config import Config
from utils.pose_utils import PoseExtractor


def build_sequences():
    """Construye secuencias normalizadas para entrenamiento."""
    print("=" * 60)
    print("  CONSTRUCCION DE SECUENCIAS - CNN-LSTM")
    print("=" * 60)

    metadata = pd.read_csv(Config.METADATA_FILE)
    processed = metadata[metadata["processed"] == True]

    if processed.empty:
        print("No hay datos procesados. Ejecute primero 01_extract_pose.py")
        return

    print(f"Videos procesados: {len(processed)}")
    print(f"Katas: {processed['kata'].nunique()}")

    feature_dim = Config.get_feature_dim()
    print(f"Dimension de features: {feature_dim}")

    sequences = []
    labels = []
    video_ids = []

    for _, row in tqdm(processed.iterrows(), total=len(processed), desc="Construyendo"):
        try:
            landmarks = np.load(row["landmarks_file"])
            angles = np.load(row["angles_file"])

            # Construir vector de features
            features = PoseExtractor.build_feature_vector(landmarks, angles)

            # Normalizar longitud temporal
            features_norm = PoseExtractor.normalize_sequence_length(
                features, Config.SEQUENCE_LENGTH
            )

            sequences.append(features_norm)
            labels.append(row["kata_number"] - 1)  # 0-indexed
            video_ids.append(row["video_id"])

        except Exception as e:
            print(f"Error en {row['filename']}: {e}")
            continue

    if not sequences:
        print("No se pudieron construir secuencias.")
        return

    X = np.array(sequences)
    y = np.array(labels)
    print(f"\nDataset: X={X.shape}, y={y.shape}")
    print(f"Clases: {np.unique(y)}")

    # Normalizar features (StandardScaler)
    original_shape = X.shape
    X_flat = X.reshape(-1, X.shape[-1])
    scaler = StandardScaler()
    X_flat = scaler.fit_transform(X_flat)
    X = X_flat.reshape(original_shape)

    # Split estratificado: 70% train, 15% val, 15% test
    X_train, X_temp, y_train, y_temp = train_test_split(
        X, y, test_size=0.30, random_state=42, stratify=y
    )
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp, y_temp, test_size=0.50, random_state=42, stratify=y_temp
    )

    print(f"\nSplit:")
    print(f"  Train: {X_train.shape}")
    print(f"  Val:   {X_val.shape}")
    print(f"  Test:  {X_test.shape}")

    # Guardar
    seq_dir = Config.SEQUENCES_DIR
    seq_dir.mkdir(parents=True, exist_ok=True)

    np.save(seq_dir / "X_train.npy", X_train)
    np.save(seq_dir / "y_train.npy", y_train)
    np.save(seq_dir / "X_val.npy", X_val)
    np.save(seq_dir / "y_val.npy", y_val)
    np.save(seq_dir / "X_test.npy", X_test)
    np.save(seq_dir / "y_test.npy", y_test)

    with open(seq_dir / "scaler.pkl", "wb") as f:
        pickle.dump(scaler, f)

    print(f"\nArchivos guardados en: {seq_dir}")
    print("Siguiente: python src/04_train_cnn_lstm.py")


if __name__ == "__main__":
    build_sequences()
