# DOCUMENTACIÓN TÉCNICA — SISTEMA INTELIGENTE: HAPKIDO
## Sistema de Clasificación y Evaluación de Katas mediante IA

**Materia:** Sistemas Inteligentes — Sexto Semestre  
**Universidad de Pamplona**  
**Fecha:** Mayo 2026

---

## TABLA DE CONTENIDOS

1. Descripción del Negocio (BPMN)
2. Historias de Usuario / Requerimientos Funcionales
3. Atributos de Calidad del Software
4. Manual de Instalación
5. Manual de Usuario
6. Diagramas de Arquitectura, Clases y Entidad-Relación
7. Plan de Pruebas Funcionales
8. Certificado de Despliegue

---

# 1. DESCRIPCIÓN DEL NEGOCIO

## 1.1 Contexto del Negocio

El sistema aborda la necesidad de estandarizar y automatizar la evaluación técnica de katas en la disciplina de Hapkido. Tradicionalmente, esta evaluación depende exclusivamente del criterio subjetivo de instructores humanos, lo que genera inconsistencias y limita la retroalimentación cuantitativa.

**Problema:** La evaluación manual de katas es subjetiva, no escalable y carece de métricas cuantificables para el progreso del practicante.

**Solución:** Un sistema inteligente que utiliza visión por computador (MediaPipe), redes neuronales (CNN-LSTM) y alineamiento temporal dinámico (DTW) para clasificar automáticamente cuál de las 18 katas se ejecuta, evaluar la calidad de ejecución y generar retroalimentación visual correctiva.

## 1.2 Proceso de Evaluación de Katas (BPMN)

**Título:** Proceso de Evaluación Inteligente de Katas de Hapkido

**Participantes (Pools/Lanes):**
- **Lane 1 — Practicante/Alumno:** Graba video ejecutando la kata, recibe reporte de retroalimentación.
- **Lane 2 — Sistema Inteligente (Software):** Procesa el video completo.
- **Lane 3 — Instructor (opcional):** Valida resultados, sube videos de referencia.

**Flujo del proceso:**
1. **Evento de Inicio:** El practicante graba un video de su ejecución de kata (formato MP4, mínimo 720p, 30 FPS).
2. **Tarea:** El practicante carga el video al sistema mediante línea de comandos (`05_predict.py --video`).
3. **Subproceso — Extracción de Pose (MediaPipe):**
   - Se procesa frame a frame el video.
   - Se extraen 33 landmarks corporales (x, y, z, visibilidad) por frame.
   - Se calculan 10 ángulos articulares clave (codos, hombros, caderas, rodillas, tobillos).
   - Se normalizan las coordenadas (centrado en caderas, escalado por distancia entre hombros).
4. **Compuerta exclusiva (XOR):** ¿Se detectó pose en al menos el 70% de los frames?
   - **No:** Evento de error → Notificar "Video de baja calidad, repetir grabación".
   - **Sí:** Continuar al siguiente paso.
5. **Subproceso — Clasificación CNN-LSTM:**
   - Se construye vector de features (66 coordenadas del cuerpo + 10 ángulos = 76 features).
   - Se normaliza la secuencia a 120 frames mediante interpolación lineal.
   - Se aplica StandardScaler a los features.
   - El modelo CNN-LSTM (Conv1D×3 → LSTM×2 → Dense×3 → Softmax) clasifica en 1 de 18 katas.
   - Salida: Kata predicha con probabilidad de confianza y Top-3 predicciones.
6. **Compuerta exclusiva (XOR):** ¿Existe video de referencia para la kata detectada?
   - **No:** Se omite evaluación DTW → Se reporta solo clasificación.
   - **Sí:** Continuar con DTW.
7. **Subproceso — Evaluación DTW:**
   - Se comparan los ángulos articulares del practicante vs. la referencia del instructor.
   - Se calcula distancia DTW global y por cada una de las 10 articulaciones.
   - Se asigna puntuación por articulación (0-100%) y puntuación global.
   - Se clasifican articulaciones: Excelente (<10°), Bueno (<20°), Aceptable (<35°), Necesita mejora (>35°).
   - Se identifican articulaciones que superan el umbral de corrección (>45° = diferencia significativa).
8. **Tarea — Generación de Retroalimentación Visual:**
   - Se genera imagen de reporte (matplotlib) con: puntuación global, barras por articulación, gráfico de desviación temporal, tabla de correcciones.
   - (Opcional) Se genera video anotado con esqueleto coloreado: verde=correcto, naranja=ajuste menor, rojo=corrección necesaria.
9. **Evento de Fin:** El practicante recibe el reporte de evaluación con puntuación y correcciones específicas.

**Subproceso previo — Preparación del Dataset:**
Instructor graba referencia → Organizar en carpetas kata_XX/referencia/ → Extraer pose → Construir secuencias → Entrenar modelo.

---

# 2. HISTORIAS DE USUARIO / REQUERIMIENTOS FUNCIONALES

## 2.1 Historias de Usuario

### HU-01: Configuración del Dataset
| Campo | Descripción |
|-------|-------------|
| **Como** | Instructor de Hapkido |
| **Quiero** | Configurar la estructura de carpetas del dataset automáticamente |
| **Para** | Organizar los videos de las 18 katas de forma estandarizada |
| **Criterios de Aceptación** | 1. El script `00_setup_dataset.py` crea 18 carpetas (kata_01 a kata_18). 2. Cada carpeta contiene subcarpetas `referencia/` y `practicantes/`. 3. Se genera archivo `metadata.csv` con las columnas necesarias. 4. Se soportan formatos: MP4, AVI, MOV, MKV. |
| **Prioridad** | Alta |
| **Script asociado** | `src/00_setup_dataset.py` |

### HU-02: Extracción de Pose Corporal
| Campo | Descripción |
|-------|-------------|
| **Como** | Sistema de procesamiento |
| **Quiero** | Extraer los 33 landmarks corporales y 10 ángulos articulares de cada video |
| **Para** | Obtener la representación numérica de los movimientos del practicante |
| **Criterios de Aceptación** | 1. Se extraen 33 landmarks (x,y,z,visibilidad) por frame con MediaPipe. 2. Se calculan 10 ángulos articulares (codos, hombros, caderas, rodillas, tobillos). 3. Se normalizan coordenadas centradas en caderas y escaladas por distancia entre hombros. 4. Se guardan archivos .npy por video. 5. Se actualiza metadata.csv. 6. Se advierte si la detección es <70%. |
| **Prioridad** | Alta |
| **Script asociado** | `src/01_extract_pose.py` |

### HU-03: Construcción de Secuencias
| Campo | Descripción |
|-------|-------------|
| **Como** | Pipeline de entrenamiento |
| **Quiero** | Construir secuencias temporales normalizadas a partir de los landmarks y ángulos |
| **Para** | Alimentar el modelo CNN-LSTM con datos de longitud uniforme |
| **Criterios de Aceptación** | 1. Se combinan 66 coordenadas corporales + 10 ángulos = 76 features por frame. 2. Se normalizan todas las secuencias a 120 frames mediante interpolación. 3. Se aplica StandardScaler. 4. Se divide: 70% train, 15% validación, 15% test (estratificado). 5. Se guardan X_train/val/test.npy, y_train/val/test.npy y scaler.pkl. |
| **Prioridad** | Alta |
| **Script asociado** | `src/03_build_sequences.py` |

### HU-04: Entrenamiento del Modelo CNN-LSTM
| Campo | Descripción |
|-------|-------------|
| **Como** | Desarrollador del sistema |
| **Quiero** | Entrenar un modelo CNN-LSTM para clasificar las 18 katas |
| **Para** | Identificar automáticamente qué kata está ejecutando un practicante |
| **Criterios de Aceptación** | 1. Arquitectura: Conv1D(64)→Conv1D(128)→Conv1D(256)→LSTM(128)→LSTM(64)→Dense(128)→Dense(64)→Dense(18). 2. Early stopping con paciencia de 15 epochs. 3. Learning rate scheduling (ReduceLROnPlateau). 4. Se genera matriz de confusión y curvas de entrenamiento. 5. Se guarda el mejor modelo (.pth) y configuración (.json). |
| **Prioridad** | Alta |
| **Script asociado** | `src/04_train_cnn_lstm.py` |

### HU-05: Evaluación DTW
| Campo | Descripción |
|-------|-------------|
| **Como** | Practicante de Hapkido |
| **Quiero** | Comparar mi ejecución de kata contra la referencia del instructor |
| **Para** | Saber en qué articulaciones necesito mejorar |
| **Criterios de Aceptación** | 1. DTW compara secuencia del practicante vs. referencia. 2. Se calcula puntuación global y por cada articulación. 3. Clasificación: Excelente(>85%), Bueno(>70%), Aceptable(>50%), Necesita mejora(<50%). 4. Se genera lista de correcciones con diferencia en grados. 5. Mensajes legibles: "El codo izquierdo necesita ajuste (diferencia: 25°)". |
| **Prioridad** | Alta |
| **Script asociado** | `src/02_evaluate_dtw.py` |

### HU-06: Predicción Completa (Pipeline End-to-End)
| Campo | Descripción |
|-------|-------------|
| **Como** | Practicante de Hapkido |
| **Quiero** | Subir un video y recibir clasificación + evaluación + retroalimentación visual |
| **Para** | Conocer mi rendimiento de forma integral |
| **Criterios de Aceptación** | 1. Pipeline: Video → Extracción → Clasificación → DTW → Reporte. 2. Se muestra kata detectada con porcentaje de confianza y Top-3. 3. Se genera imagen de reporte con gráficos. 4. (Opcional) Video anotado con esqueleto coloreado por calidad. |
| **Prioridad** | Alta |
| **Script asociado** | `src/05_predict.py` |

## 2.2 Requerimientos Funcionales (Resumen)

| ID | Requerimiento | Prioridad |
|----|---------------|-----------|
| RF-01 | El sistema debe crear la estructura de carpetas para 18 katas automáticamente | Alta |
| RF-02 | El sistema debe extraer 33 landmarks corporales usando MediaPipe BlazePose | Alta |
| RF-03 | El sistema debe calcular 10 ángulos articulares por frame | Alta |
| RF-04 | El sistema debe normalizar coordenadas (centrado y escalado) | Alta |
| RF-05 | El sistema debe normalizar secuencias temporales a 120 frames | Alta |
| RF-06 | El sistema debe entrenar un modelo CNN-LSTM para clasificar 18 katas | Alta |
| RF-07 | El sistema debe evaluar la calidad de ejecución usando DTW | Alta |
| RF-08 | El sistema debe generar retroalimentación visual con esqueleto coloreado | Media |
| RF-09 | El sistema debe generar reportes gráficos con matplotlib | Media |
| RF-10 | El sistema debe soportar videos en formatos MP4, AVI, MOV y MKV | Alta |
| RF-11 | El sistema debe advertir si la detección de pose es inferior al 70% | Media |
| RF-12 | El sistema debe generar video anotado con panel de evaluación lateral | Baja |

## 2.3 Requerimientos No Funcionales

| ID | Requerimiento | Categoría |
|----|---------------|-----------|
| RNF-01 | El sistema debe funcionar con Python 3.14+ y PyTorch | Compatibilidad |
| RNF-02 | El procesamiento de un video de 30s debe completarse en menos de 2 minutos | Rendimiento |
| RNF-03 | El modelo CNN-LSTM debe alcanzar un accuracy superior al 85% en test | Calidad |
| RNF-04 | Los videos deben tener mínimo 720p de resolución y 30 FPS | Entrada |
| RNF-05 | El sistema debe funcionar en CPU y GPU (CUDA) | Portabilidad |
| RNF-06 | Los datos procesados deben almacenarse en formato NumPy (.npy) | Almacenamiento |
| RNF-07 | La arquitectura debe permitir añadir nuevos módulos sin modificar los existentes (Escalabilidad) | Escalabilidad |
| RNF-08 | El sistema debe validar la integridad de los datos en cada etapa del pipeline (Seguridad) | Seguridad |
| RNF-09 | Los scripts deben proveer mensajes claros de progreso, errores y resultados (Usabilidad) | Usabilidad |
| RNF-10 | Cada módulo debe ser independiente y modificable sin afectar al resto (Mantenibilidad) | Mantenibilidad |
| RNF-11 | Los archivos de datos deben proteger su integridad mediante verificación de existencia y formato antes de lectura | Seguridad |
| RNF-12 | El sistema debe seguir un patrón de diseño modular basado en componentes desacoplados | Mantenibilidad |

---

# 3. ATRIBUTOS DE CALIDAD DEL SOFTWARE

## 3.1 Escalabilidad

**Definición:** Facilidad de adaptar el software a cambios y nuevas funcionalidades.

El sistema instancia una **definición basada en objetos y componentes** que permite incrementar funcionalidades y adaptarse a cambios sin modificar la arquitectura existente.

### Evidencia de Escalabilidad en el Sistema

| Mecanismo | Implementación | Archivo |
|-----------|----------------|--------|
| **Configuración centralizada** | La clase `Config` centraliza todos los parámetros (katas, hiperparámetros, rutas, umbrales). Para añadir más katas, solo se modifica `NUM_KATAS`. | `src/utils/config.py` |
| **Pipeline modular por scripts** | Cada script (00-05) es independiente y ejecutable por separado. Se pueden añadir nuevos pasos al pipeline sin alterar los existentes. | `src/00_*.py` a `src/05_*.py` |
| **Clases con responsabilidad única** | `PoseExtractor`, `DTWEvaluator`, `PoseVisualizer` y `KataCNNLSTM` son componentes autocontenidos. Se puede reemplazar MediaPipe por otro extractor sin tocar DTW ni el modelo. | `src/utils/` |
| **Parámetros dinámicos** | `get_feature_dim()` calcula la dimensión de features dinámicamente. El modelo se adapta al `input_dim` que recibe. Si se añaden más ángulos o landmarks, el sistema se ajusta. | `config.py`, `04_train_cnn_lstm.py` |
| **Formatos extensibles** | `VIDEO_EXTENSIONS` es una lista configurable. Añadir un nuevo formato es agregar una entrada a la lista. | `config.py` |
| **Arquitectura CNN-LSTM parametrizada** | Los filtros CNN, unidades LSTM y capas Dense se definen como listas en Config. Se puede cambiar la profundidad de la red modificando arrays. | `config.py` |

### Escenarios de Escalabilidad

| Escenario | Cambio Requerido | Impacto |
|-----------|------------------|---------|
| Añadir katas 19-25 | Cambiar `NUM_KATAS=25` en Config, crear carpetas, reentrenar | Solo `config.py` |
| Cambiar de MediaPipe a otro extractor | Crear nueva clase que implemente la misma interfaz de `PoseExtractor` | Solo `pose_utils.py` |
| Añadir nuevos ángulos articulares | Agregar entradas al dict `JOINT_ANGLES` | Solo `config.py` |
| Cambiar modelo CNN-LSTM por Transformer | Crear nueva clase que herede `nn.Module` con mismo `forward(x)` | Solo `04_train_cnn_lstm.py` |
| Integrar interfaz web | El pipeline de `05_predict.py` se puede invocar como función desde cualquier backend | Sin cambios al core |

## 3.2 Seguridad

**Definición:** Garantiza autenticidad, confidencialidad e integridad de la información, incorporando niveles de acceso y gestión segura de datos.

### Evidencia de Seguridad en el Sistema

| Mecanismo | Implementación | Archivo |
|-----------|----------------|--------|
| **Validación de entrada** | Antes de procesar, se verifica: existencia del archivo de video, formato soportado, apertura exitosa con OpenCV. Si falla, se lanza excepción descriptiva. | `pose_utils.py` |
| **Validación de datos procesados** | Antes de cargar .npy o .pth, se verifica existencia del archivo. `load_model_and_scaler()` valida modelo, scaler y config antes de inferencia. | `05_predict.py` |
| **Integridad de metadatos** | `metadata.csv` solo se actualiza tras procesamiento exitoso. Videos ya procesados se omiten (chequeo por `filename` en metadata). Esto evita duplicación y corrupción. | `01_extract_pose.py` |
| **Manejo de errores robusto** | Cada video se procesa en bloque try-except individual. Un video fallido no detiene el pipeline completo. Se registra el error y se continúa. | `01_extract_pose.py` |
| **Protección numérica** | Se usa `np.clip` para evitar errores en `arccos`. División por cero protegida con `+ 1e-8` y validación de `shoulder_dist < 1e-6`. | `pose_utils.py` |
| **Detección de calidad** | Se alerta cuando la detección de pose es inferior al 70%, protegiendo contra datos de baja calidad que comprometerían la integridad de los resultados. | `01_extract_pose.py` |
| **Aislamiento de entorno** | El entorno virtual `entorno_ia/` aísla las dependencias del sistema operativo, evitando conflictos y garantizando reproducibilidad. | `entorno_ia/` |
| **Verificación de integridad** | Checksums SHA-256 se calculan y almacenan para cada archivo procesado, permitiendo detectar corrupción de datos. | `validators.py` |

### Niveles de Acceso y Perfiles

| Perfil | Acceso | Operaciones Permitidas |
|--------|--------|------------------------|
| **Instructor** | Completo | Subir videos de referencia, ejecutar entrenamiento, configurar parámetros, evaluar practicantes |
| **Practicante** | Evaluación | Subir video propio, ejecutar predicción (`05_predict.py`), visualizar reportes |
| **Desarrollador** | Sistema | Modificar configuración, reentrenar modelo, ajustar umbrales, agregar funcionalidades |

> **Nota:** El control de acceso se gestiona mediante perfiles de usuario definidos en `validators.py` (clase `UserRole` y diccionario `ROLE_PERMISSIONS`). El script `05_predict.py` acepta el parámetro `--role` para verificar permisos antes de ejecutar operaciones.

## 3.3 Usabilidad

**Definición:** El software es fácil de ejecutar, brindando accesibilidad, navegabilidad y comprensión para la operatividad de la herramienta.

### Evidencia de Usabilidad en el Sistema

| Mecanismo | Implementación | Archivo |
|-----------|----------------|--------|
| **CLI con argumentos claros** | Todos los scripts usan `argparse` con descripciones legibles. `--help` muestra opciones disponibles. | Todos los scripts |
| **Mensajes de progreso** | Barras de progreso con `tqdm` en procesamiento batch. Mensajes paso a paso: `[1/4] Extrayendo pose...`, `[2/4] Clasificando...` | `05_predict.py`, `01_extract_pose.py` |
| **Salida formateada** | Resultados con separadores visuales (`=====`), alineación de columnas, porcentajes legibles (`85.3%`). | Todos los scripts |
| **Retroalimentación visual intuitiva** | Esqueleto coloreado: verde=correcto, naranja=ajuste, rojo=error. Cualquier usuario entiende qué corregir sin conocimientos técnicos. | `visualization.py` |
| **Mensajes de corrección en lenguaje natural** | "El codo izquierdo necesita ajuste moderado (diferencia: 25.3°)" en lugar de códigos numéricos. | `dtw_utils.py` |
| **Reportes gráficos autoexplicativos** | 4 paneles: puntuación global, barras por articulación, desviación temporal, tabla de correcciones. | `visualization.py` |
| **Instrucciones post-ejecución** | Cada script indica cuál es el siguiente paso: "Siguiente: python src/03_build_sequences.py". | Todos los scripts |
| **Nomenclatura guiada** | Se provee formato recomendado de nombres de archivo y estructura de carpetas. | `00_setup_dataset.py` |
| **Ejecución secuencial numerada** | Los scripts están numerados (00-05) para indicar el orden de ejecución. | `src/` |
| **Logger centralizado** | Sistema de logging con colores ANSI, niveles configurables y salida a archivo para trazabilidad. | `logger.py` |

## 3.4 Mantenibilidad

**Definición:** Facilidad de modificar el software después de su desarrollo para corregir errores y mejorar rendimiento, mediante modularidad garantizada por patrones de diseño.

### Patrón de Diseño: Pipeline Modular con Componentes Desacoplados

El sistema implementa un **patrón Pipeline (Pipes and Filters)** combinado con **principios SOLID**:

| Principio | Implementación |
|-----------|----------------|
| **S — Responsabilidad Única** | Cada clase tiene una sola responsabilidad: `PoseExtractor` extrae, `DTWEvaluator` evalúa, `PoseVisualizer` visualiza, `KataCNNLSTM` clasifica. |
| **O — Abierto/Cerrado** | Se pueden añadir nuevos evaluadores o extractores sin modificar los existentes. La clase `Config` permite extender parámetros sin alterar el código que los consume. |
| **D — Inversión de Dependencias** | Los módulos dependen de `Config` (abstracción de configuración) y no de valores hardcodeados. Cambiar un parámetro en Config se propaga a todo el sistema. |

### Evidencia de Mantenibilidad

| Mecanismo | Implementación | Archivo |
|-----------|----------------|--------|
| **Separación de responsabilidades** | Utilidades (`utils/`) separadas de scripts de pipeline (`src/`). Cada módulo es editable independientemente. | Estructura del proyecto |
| **Configuración externalizada** | Todos los parámetros en `Config`: hiperparámetros, rutas, umbrales. No hay "números mágicos" en el código. | `config.py` |
| **Docstrings completos** | Todas las clases y métodos tienen docstrings con Args, Returns y descripción. Facilita comprensión por nuevos desarrolladores. | Todos los archivos |
| **Context Manager** | `PoseExtractor` implementa `__enter__` / `__exit__` para liberación automática de recursos de MediaPipe. | `pose_utils.py` |
| **Métodos estáticos reutilizables** | `calculate_angle()`, `normalize_landmarks()`, `build_feature_vector()` son métodos estáticos usables fuera de la clase. | `pose_utils.py` |
| **Manejo de errores granular** | Try-except por video individual. Errores de un video no afectan al resto del batch. | `01_extract_pose.py` |
| **Formato NumPy estándar** | Los datos intermedios (.npy) son formato estándar, legibles por cualquier herramienta Python/NumPy. Facilita debugging y verificación. | Todo el pipeline |
| **Interfaces abstractas** | Clases base (`BaseExtractor`, `BaseEvaluator`, `BaseClassifier`, `BaseVisualizer`) definen contratos para extensibilidad. | `base.py` |

### Mapa de Dependencias entre Módulos

```
Config (config.py)           ← Módulo central, sin dependencias externas al proyecto
  ↑         ↑         ↑         ↑
  │         │         │         │
PoseExtractor  DTWEvaluator  PoseVisualizer  KataCNNLSTM
(pose_utils.py) (dtw_utils.py) (visualization.py) (04_train_cnn_lstm.py)
  ↑              ↑              ↑                ↑
  └──────────────┴──────────────┴────────────────┘
                         │
               05_predict.py (Pipeline Orquestador)
```

> **Impacto de mantenimiento:** Modificar cualquier módulo (`PoseExtractor`, `DTWEvaluator`, etc.) no afecta a los demás siempre que se mantenga la interfaz pública (métodos y tipos de retorno). El orquestador (`05_predict.py`) es el único punto que combina todos los componentes.

---

# 4. MANUAL DE INSTALACIÓN

## 4.1 Requisitos Previos

| Componente | Versión Mínima | Descripción |
|------------|----------------|-------------|
| Python | 3.10+ (recomendado 3.14) | Lenguaje de programación principal |
| pip | 21.0+ | Gestor de paquetes de Python |
| GPU (opcional) | CUDA 11.8+ | Aceleración por hardware para entrenamiento |
| Cámara/Webcam | 720p, 30 FPS | Para grabación de videos de katas |
| Espacio en disco | Mínimo 5 GB | Videos + modelos + datos procesados |
| Sistema Operativo | Windows 10/11 | Plataforma principal de ejecución |

## 4.2 Instalación Paso a Paso

### Paso 1: Obtener el script de la aplicación
Copie la carpeta completa del proyecto `Software/` en el directorio deseado de su equipo. La carpeta contiene todo el código fuente del sistema, organizado en los directorios `src/`, `dataset/`, `models/` y `results/`. Asegúrese de que la estructura de directorios se mantenga intacta.

```bash
# Ubicarse en el directorio del proyecto
cd Software
```

### Paso 2: Crear entorno virtual
```bash
python -m venv entorno_ia
# Windows:
entorno_ia\Scripts\activate
# Linux/Mac:
source entorno_ia/bin/activate
```

### Paso 3: Instalar dependencias
```bash
pip install -r requirements.txt
```

**Contenido de `requirements.txt`:**
```
mediapipe>=0.10.0
opencv-python>=4.8.0
numpy>=1.24.0
torch>=2.0.0
scipy>=1.11.0
scikit-learn>=1.3.0
matplotlib>=3.7.0
pandas>=2.0.0
dtw-python>=1.3.0
tqdm>=4.65.0
```

Las dependencias incluyen: mediapipe (estimación de pose), opencv-python (procesamiento de video), numpy (cálculos matriciales), torch/PyTorch (framework de Deep Learning), scipy (funciones matemáticas), scikit-learn (normalización y métricas), matplotlib (gráficas), pandas (metadatos CSV), dtw-python (Dynamic Time Warping) y tqdm (barras de progreso).

### Paso 4: Configurar estructura del dataset
```bash
python src/00_setup_dataset.py
```
Esto crea:
- 18 carpetas `dataset/raw_videos/kata_01/` a `kata_18/`
- Subcarpetas `referencia/` y `practicantes/` en cada una
- Carpetas de datos procesados: `landmarks/`, `angles/`, `sequences/`
- Archivo `metadata.csv` inicial

### Paso 5: Verificar instalación
```bash
python -c "import mediapipe; import torch; import cv2; print('Instalación correcta')"
```

### Paso 6 (Opcional): Instalar soporte GPU
Si el equipo dispone de una GPU compatible con CUDA, se puede instalar la versión de PyTorch con aceleración por hardware para reducir significativamente los tiempos de entrenamiento.
```bash
pip install torch --index-url https://download.pytorch.org/whl/cu118
```

## 4.3 Estructura de Directorios Resultante

```
Software/
├── dataset/
│   ├── raw_videos/
│   │   ├── kata_01/ ... kata_18/
│   │   │   ├── referencia/       ← Videos del instructor
│   │   │   └── practicantes/     ← Videos de alumnos
│   └── processed_data/
│       ├── landmarks/            ← Landmarks extraídos (.npy)
│       ├── angles/               ← Ángulos articulares (.npy)
│       ├── sequences/            ← Secuencias normalizadas (.npy)
│       └── metadata.csv          ← Registro de videos procesados
├── models/                        ← Modelo entrenado (.pth)
├── results/                       ← Reportes y gráficas
├── src/
│   ├── 00_setup_dataset.py
│   ├── 01_extract_pose.py
│   ├── 02_evaluate_dtw.py
│   ├── 03_build_sequences.py
│   ├── 04_train_cnn_lstm.py
│   ├── 05_predict.py
│   └── utils/
│       ├── __init__.py            # Exportaciones del módulo
│       ├── config.py              # Configuración centralizada
│       ├── base.py                # Interfaces abstractas (Escalabilidad)
│       ├── validators.py          # Validación y seguridad (Seguridad)
│       ├── logger.py              # Logging centralizado (Usabilidad)
│       ├── pose_utils.py          # Extracción de pose (MediaPipe)
│       ├── dtw_utils.py           # Evaluación DTW
│       └── visualization.py       # Visualización de resultados
├── requirements.txt
└── entorno_ia/
```

## 4.4 Solución de Problemas Comunes

| Problema | Solución |
|----------|----------|
| `ModuleNotFoundError: mediapipe` | `pip install mediapipe>=0.10.0` |
| `CUDA not available` | El sistema funciona en CPU. Para GPU: instalar CUDA toolkit 11.8+ |
| Error de codificación UTF-8 en Windows | Los scripts incluyen `sys.stdout.reconfigure(encoding='utf-8')` automáticamente |
| Video no detecta pose | Verificar: fondo neutro, cuerpo completo visible, buena iluminación frontal |
| Archivo .npy no encontrado | Ejecutar los pasos previos del pipeline en orden (00 → 01 → 03 → 04 → 05) |
| Error de permisos en Windows | Ejecutar PowerShell como Administrador o verificar permisos de escritura en la carpeta |

---

# 5. MANUAL DE USUARIO

## 5.1 Perfiles de Usuario

El sistema define tres perfiles de usuario con diferentes niveles de acceso:

| Perfil | Acceso | Operaciones Permitidas |
|--------|--------|------------------------|
| **Instructor** | Completo | Subir videos de referencia, ejecutar entrenamiento, configurar parámetros, evaluar practicantes |
| **Practicante** | Evaluación | Subir video propio, ejecutar predicción (`05_predict.py`), visualizar reportes |
| **Desarrollador** | Sistema | Modificar configuración, reentrenar modelo, ajustar umbrales, agregar funcionalidades |

## 5.2 Flujo de Trabajo General

```
Paso 0: Setup        → python src/00_setup_dataset.py
Paso 1: Colocar videos en las carpetas correspondientes
Paso 2: Extraer pose → python src/01_extract_pose.py
Paso 3: Secuencias   → python src/03_build_sequences.py
Paso 4: Entrenar     → python src/04_train_cnn_lstm.py
Paso 5: Predecir     → python src/05_predict.py --video <ruta>
```

## 5.3 Preparación de Videos

**Requisitos del video:**
- Formato: MP4 (preferido), AVI, MOV o MKV
- Resolución mínima: 720p (1280×720)
- FPS: 30 frames por segundo
- Fondo: Preferiblemente neutro y uniforme
- Encuadre: Cuerpo completo visible en todo momento
- Iluminación: Buena iluminación frontal

**Nomenclatura recomendada:**
```
kata_01_ref_instructor01_rep01.mp4    → Video de referencia (instructor)
kata_01_prac_alumno01_rep01.mp4       → Video de practicante (alumno)
```

**Ubicación de archivos:**
```
dataset/raw_videos/
├── kata_01/
│   ├── referencia/         ← Videos del instructor (mínimo 1 por kata)
│   │   └── kata_01_ref_instructor01_rep01.mp4
│   └── practicantes/       ← Videos de alumnos (mínimo 5 por kata)
│       ├── kata_01_prac_alumno01_rep01.mp4
│       └── kata_01_prac_alumno01_rep02.mp4
```

## 5.4 Uso de Cada Script

### Script 00: Configuración del Dataset
```bash
python src/00_setup_dataset.py
```
- Crea todas las carpetas necesarias
- Genera metadata.csv vacío
- Solo es necesario ejecutar una vez

### Script 01: Extracción de Pose
```bash
# Procesar todos los videos del dataset:
python src/01_extract_pose.py

# Procesar solo una kata específica:
python src/01_extract_pose.py --kata kata_01

# Procesar un video individual:
python src/01_extract_pose.py --video path/to/video.mp4
```
**Salida:** Archivos `.npy` con landmarks (frames×33×4) y ángulos (frames×10) en `dataset/processed_data/`. Actualiza `metadata.csv` con la información de cada video procesado.

### Script 02: Evaluación DTW
```bash
# Evaluar practicantes de una kata contra referencia:
python src/02_evaluate_dtw.py --kata kata_01

# Evaluar dos archivos directamente:
python src/02_evaluate_dtw.py --ref ref.npy --student stu.npy
```
**Salida:** Reporte gráfico en `results/eval_*.png` con puntuación global, barras por articulación y tabla de correcciones.

### Script 03: Construcción de Secuencias
```bash
python src/03_build_sequences.py
```
**Salida:** Archivos de entrenamiento en `dataset/processed_data/sequences/` (X_train, X_val, X_test con 120 frames × 76 features) y `scaler.pkl`.

### Script 04: Entrenamiento
```bash
# Con parámetros por defecto (100 epochs, batch 16):
python src/04_train_cnn_lstm.py

# Con parámetros personalizados:
python src/04_train_cnn_lstm.py --epochs 50 --batch-size 32
```
**Salida:** Modelo en `models/cnn_lstm_kata_classifier.pth`, curvas de entrenamiento y matriz de confusión en `results/`.

### Script 05: Predicción Completa
```bash
# Solo clasificación + evaluación:
python src/05_predict.py --video path/to/video.mp4

# Con visualización (genera video anotado):
python src/05_predict.py --video path/to/video.mp4 --visualize

# Especificando rol de usuario:
python src/05_predict.py --video path/to/video.mp4 --role practicante
```
**Salida:** Kata detectada con porcentaje de confianza y Top-3 predicciones, puntuación DTW global y por articulación, correcciones sugeridas, reporte gráfico y video anotado con esqueleto coloreado.

## 5.5 Interpretación de Resultados

### Puntuación Global
| Rango | Calificación | Significado |
|-------|-------------|-------------|
| 85-100% | Excelente | Ejecución muy cercana a la referencia del instructor |
| 70-84% | Bueno | Ejecución correcta con detalles menores por mejorar |
| 50-69% | Aceptable | Necesita práctica en varias articulaciones |
| <50% | Necesita mejora | Diferencias significativas con la referencia |

### Colores del Esqueleto Anotado
| Color | Significado |
|-------|-------------|
| 🟢 Verde | Articulación con ejecución correcta (diferencia < 25°) |
| 🟠 Naranja | Articulación que necesita ajuste menor (diferencia < 45°) |
| 🔴 Rojo | Articulación con diferencia significativa (diferencia > 45°) |

### Correcciones Sugeridas
El sistema genera mensajes en lenguaje natural indicando qué articulaciones necesitan ajuste, con la diferencia promedio en grados. Por ejemplo: *"El codo izquierdo necesita ajuste moderado (diferencia promedio: 25.3°). Revise la ejecución de referencia y ajuste el ángulo de esta articulación."*

### Reporte Gráfico de Evaluación
El sistema genera un reporte gráfico en formato PNG con cuatro paneles:
1. **Puntuación global:** Barra horizontal coloreada según la calificación de calidad.
2. **Puntuación por articulación:** Barras horizontales con la puntuación de cada una de las 10 articulaciones.
3. **Desviación temporal:** Gráfico de línea con la desviación frame a frame tras el alineamiento DTW.
4. **Tabla de correcciones:** Articulaciones que superan el umbral, con la desviación promedio en grados.

---

# 6. DIAGRAMAS DE ARQUITECTURA, CLASES Y ENTIDAD-RELACIÓN

## 6.1 Diagrama de Arquitectura del Sistema

El sistema se estructura en cuatro capas principales:

**Capa de Entrada:** Video MP4 proporcionado por el usuario.

**Capa de Procesamiento (3 módulos):**

- **Módulo 1 — Extracción de Pose (MediaPipe BlazePose):**
  - Entrada: Video MP4 (frame a frame)
  - Proceso: Detección de 33 landmarks corporales (x, y, z, visibilidad)
  - Proceso: Cálculo de 10 ángulos articulares (codos, hombros, caderas, rodillas, tobillos)
  - Proceso: Normalización (centrado en caderas, escalado por distancia entre hombros)
  - Salida: Arrays NumPy (.npy) con landmarks y ángulos

- **Módulo 2 — Clasificación CNN-LSTM (PyTorch):**
  - Entrada: Vector de 76 features × 120 frames (normalizado con StandardScaler)
  - Arquitectura: Conv1D(64) → Conv1D(128) → Conv1D(256) → LSTM(128) → LSTM(64) → Dense(128) → Dense(64) → Dense(18) → Softmax
  - Salida: Kata predicha (1 de 18) con probabilidad de confianza

- **Módulo 3 — Evaluación DTW (Dynamic Time Warping):**
  - Entrada: Ángulos del practicante + Ángulos de referencia del instructor
  - Proceso: Alineamiento temporal dinámico (distancia euclidiana) por cada una de las 10 articulaciones
  - Salida: Puntuación global (0-100%), puntuación por articulación, lista de correcciones

**Capa de Salida:**
- Reporte de evaluación con puntuación, gráficos matplotlib, tabla de correcciones
- Video anotado con esqueleto coloreado (verde/naranja/rojo) + panel lateral

**Capa de Datos:**
- Dataset: raw_videos/ (18 katas × referencia + practicantes)
- Processed Data: landmarks (.npy), angles (.npy), sequences (.npy), metadata.csv
- Models: cnn_lstm_kata_classifier.pth, model_config.json, scaler.pkl

**Atributos de Calidad Transversales:**
- **Escalabilidad:** Config centraliza parámetros. NUM_KATAS configurable, módulos intercambiables, arquitectura parametrizada.
- **Seguridad:** Validación de entrada, integridad de datos, protección numérica, perfiles de usuario.
- **Usabilidad:** CLI con argparse, barras de progreso, mensajes en lenguaje natural, reportes gráficos.
- **Mantenibilidad:** Patrón Pipeline, principios SOLID, docstrings completos, configuración externalizada.

## 6.2 Diagrama de Componentes

| Componente | Archivo | Interfaz Principal | Dependencias |
|------------|---------|-------------------|--------------|
| **«configuration» Config** | `src/utils/config.py` | Rutas, parámetros MediaPipe, hiperparámetros CNN-LSTM, umbrales DTW, ángulos articulares | Ninguna (módulo central) |
| **«processing» PoseExtractor** | `src/utils/pose_utils.py` | `extract_landmarks_from_video()`, `normalize_landmarks()`, `build_feature_vector()` | Config, MediaPipe, OpenCV, NumPy |
| **«evaluation» DTWEvaluator** | `src/utils/dtw_utils.py` | `evaluate()`, `evaluate_angles_only()`, `get_corrections()` | Config, dtw-python, NumPy |
| **«visualization» PoseVisualizer** | `src/utils/visualization.py` | `draw_skeleton()`, `create_evaluation_panel()`, `generate_evaluation_report()` | Config, OpenCV, matplotlib |
| **«model» KataCNNLSTM** | `src/04_train_cnn_lstm.py` | `forward(x) → logits` (hereda de `torch.nn.Module`) | Config, PyTorch |
| **«orchestrator» PredictionPipeline** | `src/05_predict.py` | `predict_video()` — Pipeline: Video → Extracción → Clasificación → Evaluación → Reporte | PoseExtractor, KataCNNLSTM, DTWEvaluator, PoseVisualizer |

**Relaciones:**
- Todos los componentes dependen de Config (Inversión de Dependencias)
- PredictionPipeline usa (<<use>>) los 4 componentes funcionales
- PoseExtractor y DTWEvaluator son independientes entre sí (desacoplados)
- PoseVisualizer es independiente de PoseExtractor y DTWEvaluator

**Patrones de diseño:**
- Config: Patrón Configuración Centralizada — Punto único de modificación
- PoseExtractor: Context Manager Pattern + Responsabilidad Única (SOLID-S)
- 05_predict: Patrón Pipeline (Pipes & Filters) — orquesta componentes desacoplados

## 6.3 Diagrama de Clases

### Clase Config (Configuración Centralizada)
- **Atributos:** `PROJECT_ROOT`, `DATASET_DIR`, `RAW_VIDEOS_DIR`, `PROCESSED_DIR`, `LANDMARKS_DIR`, `ANGLES_DIR`, `SEQUENCES_DIR`, `MODELS_DIR`, `RESULTS_DIR` (todos `Path`); `NUM_KATAS: int = 18`, `KATA_NAMES: list[str]`, `NUM_LANDMARKS: int = 33`, `LANDMARK_DIMS: int = 4`, `MEDIAPIPE_MODEL_COMPLEXITY: int = 2`, `JOINT_ANGLES: dict` (10 ángulos), `SKELETON_CONNECTIONS: list`, `SEQUENCE_LENGTH: int = 120`, `CNN_FILTERS: [64,128,256]`, `LSTM_UNITS: [128,64]`, `DENSE_UNITS: [128,64]`, `DROPOUT_RATE: 0.3`, `LEARNING_RATE: 0.001`, `BATCH_SIZE: 16`, `EPOCHS: 100`, `DTW_QUALITY_THRESHOLDS: dict`, `JOINT_CORRECTION_THRESHOLD: 0.25`
- **Métodos:** `+ensure_directories(): list[Path]`, `+get_feature_dim(): int`

### Clase PoseExtractor (Extracción de Pose)
- **Atributos:** `-mp_pose`, `-mp_drawing`, `-pose` (MediaPipe)
- **Métodos:** `+extract_landmarks_from_video(video_path: str): dict`, `+extract_landmarks_from_frame(frame: ndarray): tuple`, `+calculate_angle(a, b, c): float` «static», `+normalize_landmarks(landmarks): ndarray` «static», `+build_feature_vector(landmarks, angles): ndarray` «static», `+normalize_sequence_length(features, target): ndarray` «static», `+close()`, Context Manager (`__enter__`, `__exit__`)

### Clase DTWEvaluator (Evaluación DTW)
- **Atributos:** `-angle_names: list[str]`
- **Métodos:** `+evaluate(ref_features, stu_features): dict`, `+evaluate_angles_only(ref_angles, stu_angles): dict`, `+get_corrections(evaluation_result): list`, `-_get_quality_label(distance): str` «static», `-_get_angle_quality(diff): str` «static», `-_generate_correction_message(angle, diff): str` «static»

### Clase PoseVisualizer (Visualización)
- **Constantes:** `COLOR_CORRECT: (0,255,0)`, `COLOR_WARNING: (0,165,255)`, `COLOR_ERROR: (0,0,255)`, `JOINT_TO_LANDMARKS: dict`
- **Métodos (todos estáticos):** `+draw_skeleton(frame, landmarks, corrections): ndarray`, `+draw_comparison(frame, student_lm, ref_lm, corrections): ndarray`, `+create_evaluation_panel(frame, eval_result, kata_name): ndarray`, `+generate_evaluation_report(eval_result, kata_name, output): Figure`

### Clase KataCNNLSTM (hereda de nn.Module)
- **Atributos:** `-conv1, conv2, conv3: nn.Sequential`, `-lstm1: nn.LSTM(256→128)`, `-lstm2: nn.LSTM(128→64)`, `-dropout_lstm: nn.Dropout`, `-classifier: nn.Sequential`
- **Métodos:** `+__init__(input_dim: int, num_classes: int)`, `+forward(x: Tensor): Tensor`

**Relaciones:**
- PoseExtractor, DTWEvaluator, PoseVisualizer, KataCNNLSTM → Config (dependencia «use»)
- KataCNNLSTM → torch.nn.Module (herencia)
- 05_predict → todos los componentes (composición)

## 6.4 Diagrama Entidad-Relación

El sistema usa archivos planos (CSV, NumPy) en lugar de base de datos relacional. Las entidades y relaciones se modelan así:

| Entidad | Atributos Clave | Almacenamiento |
|---------|-----------------|----------------|
| **Kata** | kata_id (PK), nombre, cinturón, nivel | Estructura de carpetas |
| **Video** | video_id (PK), filename, kata_id (FK), participant_id, belt_level, quality, is_reference, fps, total_frames, duration_seconds, processed | `metadata.csv` |
| **Landmarks** | video_id (FK), landmarks_file, shape (frames, 33, 4) | `.npy` en `landmarks/` |
| **Angles** | video_id (FK), angles_file, shape (frames, 10) | `.npy` en `angles/` |
| **Secuencia** | video_id (FK), features (120, 76), label, split | `.npy` en `sequences/` |
| **Modelo Entrenado** | model_id, architecture, input_dim, num_classes, model_file, test_accuracy | `.pth` + `.json` en `models/` |
| **Evaluación DTW** | evaluation_id, video_id (FK), reference_video_id (FK), overall_score, quality_label, report_file | `.png` en `results/` |
| **Corrección** | evaluation_id (FK), joint_name, avg_difference, max_difference, message | Dentro de la evaluación |

**Relaciones:**
- Kata 1 ──< N Video (una kata tiene muchos videos)
- Video 1 ── 1 Landmarks (un video genera un archivo de landmarks)
- Video 1 ── 1 Angles (un video genera un archivo de ángulos)
- Video 1 ── 1 Secuencia (un video genera una secuencia)
- Video(ref) 1 ──< N Evaluación (una referencia se usa en muchas evaluaciones)
- Evaluación 1 ──< N Corrección (una evaluación puede tener varias correcciones)

---

# 7. PLAN DE PRUEBAS FUNCIONALES

## 7.1 Estrategia de Pruebas

| Aspecto | Descripción |
|---------|-------------|
| **Tipo** | Pruebas funcionales de caja negra |
| **Alcance** | Todos los scripts del pipeline (00 al 05) |
| **Ambiente** | Windows 10/11, Python 3.14, CPU/GPU |
| **Datos de prueba** | Videos de katas grabados (mínimo 3 katas con 5 videos cada una) |

## 7.2 Casos de Prueba

### CP-01: Configuración del Dataset
| Campo | Detalle |
|-------|---------|
| **Objetivo** | Verificar la creación de estructura de carpetas |
| **Precondiciones** | Python instalado, directorio del proyecto limpio |
| **Pasos** | 1. Ejecutar `python src/00_setup_dataset.py` |
| **Resultado esperado** | Se crean 18 carpetas kata_XX con subcarpetas referencia/ y practicantes/. Se genera metadata.csv vacío. |
| **Criterio de éxito** | Todas las carpetas existen. metadata.csv contiene las columnas esperadas. |

### CP-02: Extracción de Pose — Video Válido
| Campo | Detalle |
|-------|---------|
| **Objetivo** | Verificar extracción de landmarks de un video válido |
| **Precondiciones** | Video MP4 de kata disponible, 720p, 30 FPS, cuerpo completo |
| **Pasos** | 1. Colocar video en `dataset/raw_videos/kata_01/referencia/` 2. Ejecutar `python src/01_extract_pose.py --kata kata_01` |
| **Resultado esperado** | Se generan archivos .npy de landmarks (shape: frames×33×4) y ángulos (shape: frames×10). Se actualiza metadata.csv. Detección de pose >70%. |
| **Criterio de éxito** | Archivos .npy existen y tienen las dimensiones correctas. |

### CP-03: Extracción de Pose — Video Inválido
| Campo | Detalle |
|-------|---------|
| **Objetivo** | Verificar manejo de video con poca detección de pose |
| **Precondiciones** | Video con obstrucciones o mala calidad |
| **Pasos** | 1. Usar un video donde la persona no sea completamente visible 2. Ejecutar extracción |
| **Resultado esperado** | El sistema genera advertencia "Baja detección (<70%)". Se procesan frames con arrays de ceros donde no hay pose. |
| **Criterio de éxito** | No hay crash. Se muestra advertencia apropiada. |

### CP-04: Construcción de Secuencias
| Campo | Detalle |
|-------|---------|
| **Objetivo** | Verificar normalización temporal y split de datos |
| **Precondiciones** | Al menos 10 videos procesados con 01_extract_pose.py |
| **Pasos** | 1. Ejecutar `python src/03_build_sequences.py` |
| **Resultado esperado** | Se generan X_train, X_val, X_test con shape (N, 120, 76). Se guarda scaler.pkl. Split 70/15/15 estratificado. |
| **Criterio de éxito** | Archivos .npy existen. Las dimensiones son correctas. Todas las clases aparecen en cada split. |

### CP-05: Entrenamiento CNN-LSTM
| Campo | Detalle |
|-------|---------|
| **Objetivo** | Verificar que el modelo entrena correctamente |
| **Precondiciones** | Secuencias construidas (CP-04 exitoso) |
| **Pasos** | 1. Ejecutar `python src/04_train_cnn_lstm.py --epochs 10` |
| **Resultado esperado** | El loss decrece progresivamente. Se guarda cnn_lstm_kata_classifier.pth. Se generan training_curves.png y confusion_matrix.png. Se imprime classification_report. |
| **Criterio de éxito** | Modelo .pth existe. Gráficas generadas. No hay errores de dimensiones. |

### CP-06: Evaluación DTW
| Campo | Detalle |
|-------|---------|
| **Objetivo** | Verificar comparación DTW entre practicante y referencia |
| **Precondiciones** | Videos de referencia y practicante procesados |
| **Pasos** | 1. Ejecutar `python src/02_evaluate_dtw.py --kata kata_01` |
| **Resultado esperado** | Puntuación entre 0% y 100%. Lista de correcciones con articulación y diferencia en grados. Reporte .png generado en results/. |
| **Criterio de éxito** | Puntuación coherente. Correcciones legibles. Reporte gráfico generado. |

### CP-07: Evaluación DTW — Referencia contra sí misma
| Campo | Detalle |
|-------|---------|
| **Objetivo** | Verificar que la referencia comparada consigo misma da puntuación perfecta |
| **Precondiciones** | Video de referencia procesado |
| **Pasos** | 1. Ejecutar DTW usando el mismo archivo como referencia y como estudiante |
| **Resultado esperado** | Puntuación = 100% (o muy cercana). Calidad = "excelente". Sin correcciones. |
| **Criterio de éxito** | Puntuación ≥ 99%. |

### CP-08: Pipeline Completo de Predicción
| Campo | Detalle |
|-------|---------|
| **Objetivo** | Verificar el pipeline end-to-end |
| **Precondiciones** | Modelo entrenado, videos de referencia disponibles |
| **Pasos** | 1. Ejecutar `python src/05_predict.py --video <video_nuevo> --visualize` |
| **Resultado esperado** | Se muestra kata predicha con confianza. Top-3 predicciones. Puntuación DTW y correcciones. Reporte gráfico .png. Video anotado con esqueleto coloreado. |
| **Criterio de éxito** | Pipeline completa sin errores. Todos los archivos de salida generados. |

### CP-09: Predicción sin Referencia
| Campo | Detalle |
|-------|---------|
| **Objetivo** | Verificar que el sistema funciona sin video de referencia |
| **Precondiciones** | Modelo entrenado, pero sin referencia para la kata detectada |
| **Pasos** | 1. Ejecutar predicción con video de kata sin referencia |
| **Resultado esperado** | Clasificación funciona normalmente. DTW se omite con mensaje "Sin referencia para kata_XX". No hay crash. |
| **Criterio de éxito** | Clasificación exitosa. Mensaje informativo sobre ausencia de referencia. |

### CP-10: Robustez — Formatos de Video
| Campo | Detalle |
|-------|---------|
| **Objetivo** | Verificar soporte de múltiples formatos |
| **Precondiciones** | Videos en MP4, AVI, MOV |
| **Pasos** | 1. Procesar un video en cada formato soportado |
| **Resultado esperado** | Todos los formatos se procesan correctamente. |
| **Criterio de éxito** | Extracción exitosa para MP4, AVI, MOV y MKV. |

### CP-11: Escalabilidad — Agregar nuevas katas
| Campo | Detalle |
|-------|---------|
| **Objetivo** | Verificar que el sistema se adapta al incremento de katas |
| **Precondiciones** | Sistema funcional con 18 katas |
| **Pasos** | 1. Cambiar `NUM_KATAS=20` en `config.py` 2. Ejecutar `00_setup_dataset.py` 3. Agregar videos para kata_19 y kata_20 4. Reejecutar pipeline completo |
| **Resultado esperado** | Se crean carpetas kata_19 y kata_20. El modelo entrena con 20 clases. Predicción funciona con 20 katas. |
| **Criterio de éxito** | No se modificó ningún script excepto `config.py`. Todo el pipeline funciona sin errores. |

### CP-12: Seguridad — Integridad de datos con entrada inválida
| Campo | Detalle |
|-------|---------|
| **Objetivo** | Verificar que el sistema maneja entradas inválidas sin corromper datos |
| **Precondiciones** | Dataset con videos válidos procesados |
| **Pasos** | 1. Colocar un archivo no-video (ej: .txt renombrado a .mp4) 2. Ejecutar extracción 3. Verificar metadata.csv |
| **Resultado esperado** | El sistema captura la excepción, muestra error descriptivo. metadata.csv no se corrompe. Videos previos no se afectan. |
| **Criterio de éxito** | No hay crash. metadata.csv mantiene integridad. Mensaje de error legible. |

### CP-13: Usabilidad — Ayuda y mensajes
| Campo | Detalle |
|-------|---------|
| **Objetivo** | Verificar que los scripts proveen ayuda y mensajes claros |
| **Precondiciones** | Sistema instalado |
| **Pasos** | 1. Ejecutar cada script con `--help` 2. Ejecutar `05_predict.py` sin argumentos 3. Ejecutar pipeline completo y verificar mensajes |
| **Resultado esperado** | `--help` muestra opciones disponibles. Sin argumentos muestra uso correcto. Los mensajes indican progreso y siguiente paso. |
| **Criterio de éxito** | Todos los scripts muestran ayuda. Mensajes son comprensibles para un usuario no técnico. |

### CP-14: Mantenibilidad — Modificación de módulo individual
| Campo | Detalle |
|-------|---------|
| **Objetivo** | Verificar que un módulo puede modificarse sin afectar a otros |
| **Precondiciones** | Sistema funcional |
| **Pasos** | 1. Modificar los umbrales DTW en `config.py` 2. Ejecutar evaluación DTW 3. Verificar que extracción y entrenamiento no se afectan |
| **Resultado esperado** | Los nuevos umbrales se aplican. Los módulos de extracción y entrenamiento siguen funcionando sin cambios. |
| **Criterio de éxito** | Cambio en Config se propaga solo a DTWEvaluator. Demás módulos no requieren modificación. |

## 7.3 Matriz de Trazabilidad

| Caso de Prueba | Req. Funcional | Atributo de Calidad |
|----------------|----------------|---------------------|
| CP-01 | RF-01 | — |
| CP-02 | RF-02, RF-03, RF-04 | — |
| CP-03 | RF-11 | Seguridad |
| CP-04 | RF-05 | — |
| CP-05 | RF-06 | — |
| CP-06 | RF-07 | — |
| CP-07 | RF-07 | Seguridad |
| CP-08 | RF-07, RF-08, RF-09 | Usabilidad |
| CP-09 | RF-07 | Usabilidad |
| CP-10 | RF-10 | Escalabilidad |
| CP-11 | RNF-07 | **Escalabilidad** |
| CP-12 | RNF-08, RNF-11 | **Seguridad** |
| CP-13 | RNF-09 | **Usabilidad** |
| CP-14 | RNF-10, RNF-12 | **Mantenibilidad** |

---

# 8. CERTIFICADO DE DESPLIEGUE

## 8.1 Estado Actual del Software

El Sistema Inteligente de Hapkido se encuentra **completamente desarrollado y funcional** a nivel de código fuente. El software está desplegado como una herramienta de línea de comandos (CLI) para uso local.

### Evidencia de Despliegue

| Aspecto | Estado |
|---------|--------|
| Código fuente completo | ✅ 6 scripts principales + 7 módulos de utilidades |
| Estructura del dataset | ✅ 18 carpetas creadas con subdirectorios |
| Archivo de metadatos | ✅ metadata.csv generado |
| Pipeline de procesamiento | ✅ Extracción, construcción, entrenamiento, predicción |
| Dependencias documentadas | ✅ requirements.txt con 10 bibliotecas |
| Entorno virtual | ✅ Configurado en `entorno_ia/` |
| Control de versiones | ✅ Git inicializado con .gitignore |

### Naturaleza del Producto

Este software es un **producto derivado de una innovación de proceso** en la evaluación de katas de artes marciales. Innova al reemplazar el proceso tradicional de evaluación subjetiva por instructores con un sistema automatizado basado en:

1. **Visión por computador** (MediaPipe) para captura objetiva de movimiento
2. **Deep Learning** (CNN-LSTM) para clasificación automática
3. **Alineamiento temporal dinámico** (DTW) para evaluación cuantitativa

### Constancia de Disponibilidad

El software se encuentra disponible y listo para uso en el proceso específico de evaluación de katas de Hapkido. El pipeline completo puede ejecutarse una vez que se disponga del dataset de videos de las 18 katas, para lo cual la estructura de recepción ya está preparada.

**Ubicación:** Carpeta local `Software/` con control de versiones Git.  
**Ejecución:** Mediante línea de comandos Python (CLI).  
**Plataforma:** Windows 10/11 con Python 3.14+.

---

# ANEXO A: Tabla de Tecnologías Utilizadas

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Python | 3.14+ | Lenguaje principal |
| PyTorch | ≥2.0.0 | Framework de Deep Learning (CNN-LSTM) |
| MediaPipe | ≥0.10.0 | Estimación de pose (33 landmarks) |
| OpenCV | ≥4.8.0 | Procesamiento de video e imágenes |
| NumPy | ≥1.24.0 | Cálculos matriciales |
| SciPy | ≥1.11.0 | Funciones matemáticas |
| scikit-learn | ≥1.3.0 | Normalización, métricas, split de datos |
| matplotlib | ≥3.7.0 | Generación de gráficas y reportes |
| pandas | ≥2.0.0 | Manejo de metadata (CSV) |
| dtw-python | ≥1.3.0 | Implementación DTW optimizada |
| tqdm | ≥4.65.0 | Barras de progreso |

# ANEXO B: Las 18 Katas del Sistema

| Nº | Identificador | Nivel | Cinturón |
|----|---------------|-------|----------|
| 1-3 | kata_01 a kata_03 | Básico | Blanco a Amarillo |
| 4-6 | kata_04 a kata_06 | Intermedio | Verde a Azul |
| 7-9 | kata_07 a kata_09 | Avanzado | Rojo a Rojo-Negro |
| 10-12 | kata_10 a kata_12 | Cinturón Negro | 1er Dan |
| 13-15 | kata_13 a kata_15 | Superior | 2do Dan |
| 16-18 | kata_16 a kata_18 | Maestro | 3er Dan+ |

> **Nota:** Los nombres específicos de cada kata deben ser proporcionados por el instructor de Hapkido.

---

*Fin de la documentación técnica.*
