"""
04_train_cnn_lstm.py
Entrena el modelo CNN-LSTM para clasificacion de 18 katas de Hapkido.
Usa PyTorch (compatible con Python 3.14).

Arquitectura: Conv1D -> BatchNorm -> MaxPool -> LSTM -> Dense -> Softmax

Uso:
    python src/04_train_cnn_lstm.py
    python src/04_train_cnn_lstm.py --epochs 50 --batch-size 32
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import argparse, json
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
from sklearn.metrics import classification_report, confusion_matrix
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from utils.config import Config
from utils.model import KataCNNLSTM  # el modelo vive en utils/model.py (importable)


def plot_history(history, save_path):
    """Grafica curvas de entrenamiento."""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))
    epochs_range = range(1, len(history['train_acc']) + 1)

    ax1.plot(epochs_range, history['train_acc'], label='Train', linewidth=2)
    ax1.plot(epochs_range, history['val_acc'], label='Validation', linewidth=2)
    ax1.set_title('Accuracy', fontsize=14)
    ax1.set_xlabel('Epoch')
    ax1.legend()
    ax1.grid(True, alpha=0.3)

    ax2.plot(epochs_range, history['train_loss'], label='Train', linewidth=2)
    ax2.plot(epochs_range, history['val_loss'], label='Validation', linewidth=2)
    ax2.set_title('Loss', fontsize=14)
    ax2.set_xlabel('Epoch')
    ax2.legend()
    ax2.grid(True, alpha=0.3)

    plt.tight_layout()
    fig.savefig(save_path, dpi=150)
    plt.close()
    print(f"Graficas guardadas: {save_path}")


def plot_confusion(y_true, y_pred, num_classes, save_path):
    """Genera matriz de confusion."""
    cm = confusion_matrix(y_true, y_pred, labels=list(range(num_classes)))
    fig, ax = plt.subplots(figsize=(12, 10))
    im = ax.imshow(cm, interpolation='nearest', cmap='Blues')
    ax.set_title('Matriz de Confusion', fontsize=14)
    fig.colorbar(im)
    labels = [f"K{i+1}" for i in range(num_classes)]
    ax.set_xticks(range(num_classes))
    ax.set_yticks(range(num_classes))
    ax.set_xticklabels(labels, rotation=45)
    ax.set_yticklabels(labels)
    ax.set_xlabel('Prediccion')
    ax.set_ylabel('Real')
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, str(cm[i, j]), ha='center', va='center',
                    color='white' if cm[i, j] > cm.max()/2 else 'black')
    plt.tight_layout()
    fig.savefig(save_path, dpi=150)
    plt.close()


def train(epochs=None, batch_size=None):
    """Entrena el modelo CNN-LSTM."""
    print("=" * 60)
    print("  ENTRENAMIENTO CNN-LSTM - Katas Hapkido (PyTorch)")
    print("=" * 60)

    epochs = epochs or Config.EPOCHS
    batch_size = batch_size or Config.BATCH_SIZE
    seq_dir = Config.SEQUENCES_DIR
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    # Cargar datos
    X_train = np.load(seq_dir / "X_train.npy").astype(np.float32)
    y_train = np.load(seq_dir / "y_train.npy").astype(np.int64)
    X_val = np.load(seq_dir / "X_val.npy").astype(np.float32)
    y_val = np.load(seq_dir / "y_val.npy").astype(np.int64)
    X_test = np.load(seq_dir / "X_test.npy").astype(np.float32)
    y_test = np.load(seq_dir / "y_test.npy").astype(np.int64)

    # ── Remapeo de etiquetas a rango contiguo [0, num_classes) ───────────
    # Las etiquetas vienen como (kata_number - 1). Si no están las 18 katas
    # con datos (ej. solo kata_01 y kata_05 -> {0, 4}), CrossEntropyLoss
    # fallaría con un target fuera de rango y la predicción mapearía mal el
    # nombre. Aquí se compactan a {0, 1, ...} y se guarda el mapa inverso.
    present = np.unique(np.concatenate([y_train, y_val, y_test]))
    label_map = {int(orig): i for i, orig in enumerate(present)}
    # índice de clase del modelo -> kata_number original (label + 1)
    index_to_kata_number = [int(orig) + 1 for orig in present]
    remap = np.vectorize(lambda v: label_map[int(v)])
    y_train, y_val, y_test = remap(y_train), remap(y_val), remap(y_test)

    num_classes = len(present)
    input_dim = X_train.shape[2]  # feature dimension
    print(f"Train: {X_train.shape}, Val: {X_val.shape}, Test: {X_test.shape}")
    print(f"Clases: {num_classes}, Features: {input_dim}")
    if num_classes < Config.NUM_KATAS:
        print(f"[INFO] Solo {num_classes}/{Config.NUM_KATAS} katas tienen datos. "
              f"El modelo clasifica únicamente las katas presentes.")

    # DataLoaders
    train_ds = TensorDataset(torch.from_numpy(X_train), torch.from_numpy(y_train))
    val_ds = TensorDataset(torch.from_numpy(X_val), torch.from_numpy(y_val))
    test_ds = TensorDataset(torch.from_numpy(X_test), torch.from_numpy(y_test))

    # drop_last evita un último batch de tamaño 1 que rompería BatchNorm1d
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True,
                              drop_last=len(train_ds) > batch_size)
    val_loader = DataLoader(val_ds, batch_size=batch_size)
    test_loader = DataLoader(test_ds, batch_size=batch_size)

    # Modelo
    model = KataCNNLSTM(input_dim, num_classes).to(device)
    print(f"\nParametros: {sum(p.numel() for p in model.parameters()):,}")

    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=Config.LEARNING_RATE)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, factor=0.5, patience=7)

    # Entrenamiento
    Config.MODELS_DIR.mkdir(parents=True, exist_ok=True)
    best_val_acc = 0.0
    patience_counter = 0
    history = {"train_loss": [], "train_acc": [], "val_loss": [], "val_acc": []}

    for epoch in range(1, epochs + 1):
        # Train
        model.train()
        train_loss, train_correct, train_total = 0, 0, 0
        for X_batch, y_batch in train_loader:
            X_batch, y_batch = X_batch.to(device), y_batch.to(device)
            optimizer.zero_grad()
            outputs = model(X_batch)
            loss = criterion(outputs, y_batch)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * X_batch.size(0)
            train_correct += (outputs.argmax(1) == y_batch).sum().item()
            train_total += X_batch.size(0)

        # Validate
        model.eval()
        val_loss, val_correct, val_total = 0, 0, 0
        with torch.no_grad():
            for X_batch, y_batch in val_loader:
                X_batch, y_batch = X_batch.to(device), y_batch.to(device)
                outputs = model(X_batch)
                loss = criterion(outputs, y_batch)
                val_loss += loss.item() * X_batch.size(0)
                val_correct += (outputs.argmax(1) == y_batch).sum().item()
                val_total += X_batch.size(0)

        t_loss = train_loss / train_total
        t_acc = train_correct / train_total
        v_loss = val_loss / val_total
        v_acc = val_correct / val_total

        history["train_loss"].append(t_loss)
        history["train_acc"].append(t_acc)
        history["val_loss"].append(v_loss)
        history["val_acc"].append(v_acc)

        scheduler.step(v_loss)
        lr = optimizer.param_groups[0]['lr']

        print(f"Epoch {epoch}/{epochs} - loss: {t_loss:.4f} acc: {t_acc:.4f} "
              f"- val_loss: {v_loss:.4f} val_acc: {v_acc:.4f} - lr: {lr:.6f}")

        # Checkpoint
        if v_acc > best_val_acc:
            best_val_acc = v_acc
            torch.save(model.state_dict(), Config.MODELS_DIR / "cnn_lstm_kata_classifier.pth")
            patience_counter = 0
        else:
            patience_counter += 1
            if patience_counter >= Config.EARLY_STOPPING_PATIENCE:
                print(f"\nEarly stopping en epoch {epoch}")
                break

    # Cargar mejor modelo
    model.load_state_dict(torch.load(Config.MODELS_DIR / "cnn_lstm_kata_classifier.pth", weights_only=True))

    # Evaluar en test
    model.eval()
    all_preds, all_labels = [], []
    with torch.no_grad():
        for X_batch, y_batch in test_loader:
            X_batch = X_batch.to(device)
            outputs = model(X_batch)
            all_preds.extend(outputs.argmax(1).cpu().numpy())
            all_labels.extend(y_batch.numpy())

    y_pred = np.array(all_preds)
    y_true = np.array(all_labels)
    test_acc = (y_pred == y_true).mean()
    print(f"\nTest Accuracy: {test_acc:.4f}")

    # Nombres reales de las katas presentes (no asumir kata_01..N consecutivas)
    kata_names = [Config.KATA_NAMES[k - 1] for k in index_to_kata_number]
    print(classification_report(y_true, y_pred, labels=list(range(num_classes)),
                                target_names=kata_names, zero_division=0))

    # Guardar config del modelo para inferencia.
    # index_to_kata_number permite que la predicción mapee el índice del modelo
    # a la kata correcta aunque no estén las 18.
    model_config = {
        "input_dim": input_dim,
        "num_classes": num_classes,
        "index_to_kata_number": index_to_kata_number,
    }
    with open(Config.MODELS_DIR / "model_config.json", "w") as f:
        json.dump(model_config, f)

    # Graficas
    Config.RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    plot_history(history, Config.RESULTS_DIR / "training_curves.png")
    plot_confusion(y_true, y_pred, num_classes, Config.RESULTS_DIR / "confusion_matrix.png")

    history["test_accuracy"] = float(test_acc)
    with open(Config.MODELS_DIR / "training_history.json", "w") as f:
        json.dump(history, f, indent=2)

    print(f"\nModelo guardado: {Config.MODELS_DIR / 'cnn_lstm_kata_classifier.pth'}")
    print("Siguiente: python src/05_predict.py --video path/to/video.mp4")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=None)
    parser.add_argument("--batch-size", type=int, default=None)
    args = parser.parse_args()
    train(args.epochs, args.batch_size)


if __name__ == "__main__":
    main()
