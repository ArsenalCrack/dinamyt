# DINAMYT Academy — microservicio de figuras (:3009)

Sistema Inteligente Hapkido (MediaPipe + DTW) integrado al monorepo como
microservicio de Academy. Origen: `github.com/ArsenalCrack/dinamyt-figuras`
(este directorio es ahora la copia canónica; incluye las mejoras de
correcciones visuales con timestamps de 2026-07).

- El **maestro** sube la figura de referencia por cinturón (academy-web →
  academy-api `POST /figuras/references`), que llama aquí a `POST /extract`
  para precalcular pose/ángulos (`.npz`).
- El **estudiante** graba/sube su ejecución; academy-api llama a
  `POST /compare`: score global y por articulación (DTW sobre la alineación
  compartida), correcciones con marca de tiempo `mm:ss`, **imágenes
  comparativas** (estudiante | referencia con esqueleto y la articulación a
  corregir en rojo) y **video anotado**.

## Correr en local

```powershell
cd apps/academy-figuras
python -m venv .venv
.venv\Scripts\pip install -r requirements-service.txt
.venv\Scripts\uvicorn service.main:app --port 3009
```

academy-api usa `FIGURAS_SERVICE_URL` (por defecto `http://localhost:3009`) y
comparte archivos por ruta en `.uploads/academy` (`ACADEMY_UPLOADS_DIR`).
La CNN-LSTM (clasificación automática de las 18 katas, `src/05_predict.py`)
sigue disponible para uso investigativo, pero el servicio NO la necesita.
