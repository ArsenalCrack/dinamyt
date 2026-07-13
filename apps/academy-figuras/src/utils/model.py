"""
Definición del modelo CNN-LSTM para clasificación de katas.

Se extrae del script de entrenamiento (04_train_cnn_lstm.py) a este módulo
para que pueda IMPORTARSE de forma limpia desde cualquier parte del sistema
(entrenamiento, predicción, GUI o futuro microservicio).

Antes el modelo se cargaba con SourceFileLoader sobre un archivo cuyo nombre
empieza por dígito ('04_...'), un mecanismo frágil que re-ejecutaba todo el
módulo. Ahora basta:  from utils.model import KataCNNLSTM
"""
import torch.nn as nn
from .config import Config


class KataCNNLSTM(nn.Module):
    """Arquitectura CNN-LSTM para clasificación de katas.

    Conv1D x3 (BatchNorm + ReLU + MaxPool + Dropout) -> LSTM x2 -> Dense x3.
    Los hiperparámetros provienen de Config (Inversión de Dependencias).
    """

    def __init__(self, input_dim, num_classes):
        super().__init__()
        # CNN: bloques Conv1D. Entrada al forward: (batch, seq_len, features),
        # se permuta a (batch, features, seq_len) para Conv1d.
        self.conv1 = nn.Sequential(
            nn.Conv1d(input_dim, Config.CNN_FILTERS[0], Config.CNN_KERNEL_SIZE, padding=1),
            nn.BatchNorm1d(Config.CNN_FILTERS[0]),
            nn.ReLU(),
            nn.MaxPool1d(2),
            nn.Dropout(Config.DROPOUT_RATE),
        )
        self.conv2 = nn.Sequential(
            nn.Conv1d(Config.CNN_FILTERS[0], Config.CNN_FILTERS[1], Config.CNN_KERNEL_SIZE, padding=1),
            nn.BatchNorm1d(Config.CNN_FILTERS[1]),
            nn.ReLU(),
            nn.MaxPool1d(2),
            nn.Dropout(Config.DROPOUT_RATE),
        )
        self.conv3 = nn.Sequential(
            nn.Conv1d(Config.CNN_FILTERS[1], Config.CNN_FILTERS[2], Config.CNN_KERNEL_SIZE, padding=1),
            nn.BatchNorm1d(Config.CNN_FILTERS[2]),
            nn.ReLU(),
            nn.MaxPool1d(2),
            nn.Dropout(Config.DROPOUT_RATE),
        )
        # LSTM
        self.lstm1 = nn.LSTM(Config.CNN_FILTERS[2], Config.LSTM_UNITS[0],
                             batch_first=True, dropout=Config.DROPOUT_RATE)
        self.lstm2 = nn.LSTM(Config.LSTM_UNITS[0], Config.LSTM_UNITS[1],
                             batch_first=True)
        self.dropout_lstm = nn.Dropout(Config.DROPOUT_RATE)

        # Dense
        self.classifier = nn.Sequential(
            nn.Linear(Config.LSTM_UNITS[1], Config.DENSE_UNITS[0]),
            nn.BatchNorm1d(Config.DENSE_UNITS[0]),
            nn.ReLU(),
            nn.Dropout(Config.DROPOUT_RATE),
            nn.Linear(Config.DENSE_UNITS[0], Config.DENSE_UNITS[1]),
            nn.ReLU(),
            nn.Dropout(Config.DROPOUT_RATE),
            nn.Linear(Config.DENSE_UNITS[1], num_classes),
        )

    def forward(self, x):
        # x: (batch, seq_len, features) -> (batch, features, seq_len)
        x = x.permute(0, 2, 1)
        x = self.conv1(x)
        x = self.conv2(x)
        x = self.conv3(x)
        # -> (batch, seq_len', features) para la LSTM
        x = x.permute(0, 2, 1)
        x, _ = self.lstm1(x)
        x = self.dropout_lstm(x)
        x, _ = self.lstm2(x)
        # Tomar último timestep
        x = x[:, -1, :]
        x = self.classifier(x)
        return x
