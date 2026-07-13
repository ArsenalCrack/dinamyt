"""
Reconocimiento ABIERTO de figuras por referencia (sin reentrenar).

A diferencia del clasificador CNN-LSTM (que exige un conjunto fijo de clases y
muchos videos por clase), este motor permite:

    - Añadir figuras de a poco, en cualquier orden.
    - Reconocer una figura comparando un video nuevo contra TODAS las
      referencias guardadas usando DTW (vecino más cercano).
    - Obtener, en el mismo paso, el puntaje y las correcciones contra la
      referencia más parecida.

Componentes:
    - FigureLibrary   : almacena y administra las figuras de referencia.
    - FigureRecognizer: dada una ejecución, decide qué figura es.

Encaja con el modelo abierto de DINAMYT Academy: cada figura tiene un id libre
(no "kata_01..18"), igual que la plataforma maneja artes y grados de forma
extensible.
"""
from __future__ import annotations
import json
import re
import uuid
from pathlib import Path

import numpy as np

from .config import Config
from .dtw_utils import DTWEvaluator


def _slugify(text: str) -> str:
    """Convierte un nombre en un id de archivo seguro."""
    slug = re.sub(r"[^\w]+", "_", text.strip().lower(), flags=re.UNICODE)
    slug = slug.strip("_")
    return slug or uuid.uuid4().hex[:8]


class FigureLibrary:
    """Biblioteca persistente de figuras de referencia.

    Estructura en disco (Config.FIGURE_LIBRARY_DIR):
        index.json
        <figure_id>/<ref_id>_angles.npy
    """

    def __init__(self, root: Path = None):
        self.root = Path(root) if root else Config.FIGURE_LIBRARY_DIR
        self.root.mkdir(parents=True, exist_ok=True)
        self.index_path = self.root / "index.json"
        self._index = self._load_index()

    # ── Persistencia ────────────────────────────────────────────────────
    def _load_index(self) -> dict:
        if self.index_path.exists():
            with open(self.index_path, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"figures": {}}

    def _save_index(self):
        with open(self.index_path, "w", encoding="utf-8") as f:
            json.dump(self._index, f, indent=2, ensure_ascii=False)

    # ── Altas ───────────────────────────────────────────────────────────
    def add_reference(self, name: str, angles: np.ndarray,
                      belt: str = "", notes: str = "",
                      figure_id: str = None, source: str = "") -> str:
        """Añade una referencia. Crea la figura si no existe.

        Args:
            name: nombre legible de la figura (ej. "Dan Bong 1").
            angles: secuencia de ángulos (T, num_angles).
            belt: cinturón/grado asociado (opcional).
            notes: notas del instructor (opcional).
            figure_id: id de figura existente para añadir otra referencia
                a la misma figura. Si None, se deriva del nombre.
            source: nombre del archivo de video de origen (opcional).

        Returns:
            El figure_id de la figura.
        """
        angles = np.asarray(angles, dtype=np.float32)
        if angles.ndim != 2 or angles.shape[0] < 2:
            raise ValueError("La secuencia de ángulos debe ser 2D con al menos 2 frames.")

        if figure_id is None:
            figure_id = _slugify(name)

        fig = self._index["figures"].get(figure_id)
        if fig is None:
            fig = {"name": name, "belt": belt, "notes": notes, "references": []}
            self._index["figures"][figure_id] = fig
        else:
            # Actualiza metadatos si se proporcionan
            if belt:
                fig["belt"] = belt
            if notes:
                fig["notes"] = notes

        ref_id = uuid.uuid4().hex[:8]
        fig_dir = self.root / figure_id
        fig_dir.mkdir(parents=True, exist_ok=True)
        angles_file = fig_dir / f"{ref_id}_angles.npy"
        np.save(angles_file, angles)

        fig["references"].append({
            "ref_id": ref_id,
            "angles_file": str(angles_file.relative_to(self.root)),
            "frames": int(angles.shape[0]),
            "source": source,
        })
        self._save_index()
        return figure_id

    # ── Consultas ───────────────────────────────────────────────────────
    def list_figures(self) -> list:
        """Lista resumida de figuras: id, nombre, cinturón, nº de referencias."""
        out = []
        for fid, fig in self._index["figures"].items():
            out.append({
                "figure_id": fid,
                "name": fig.get("name", fid),
                "belt": fig.get("belt", ""),
                "notes": fig.get("notes", ""),
                "n_references": len(fig.get("references", [])),
            })
        return sorted(out, key=lambda f: f["name"].lower())

    def is_empty(self) -> bool:
        return len(self._index["figures"]) == 0

    def get_figure(self, figure_id: str) -> dict | None:
        return self._index["figures"].get(figure_id)

    def load_references(self, figure_id: str) -> list:
        """Carga las secuencias de ángulos de todas las referencias de una figura."""
        fig = self.get_figure(figure_id)
        if not fig:
            return []
        seqs = []
        for ref in fig.get("references", []):
            path = self.root / ref["angles_file"]
            if path.exists():
                seqs.append(np.load(path))
        return seqs

    def iter_references(self):
        """Itera (figure_id, name, angles) sobre TODAS las referencias."""
        for fid, fig in self._index["figures"].items():
            for ref in fig.get("references", []):
                path = self.root / ref["angles_file"]
                if path.exists():
                    yield fid, fig.get("name", fid), np.load(path)

    # ── Bajas ───────────────────────────────────────────────────────────
    def remove_figure(self, figure_id: str) -> bool:
        fig = self._index["figures"].pop(figure_id, None)
        if fig is None:
            return False
        fig_dir = self.root / figure_id
        if fig_dir.exists():
            for p in fig_dir.glob("*"):
                p.unlink()
            fig_dir.rmdir()
        self._save_index()
        return True


class FigureRecognizer:
    """Reconoce qué figura ejecuta un practicante comparando contra la biblioteca."""

    def __init__(self, library: FigureLibrary, evaluator: DTWEvaluator = None):
        self.library = library
        self.evaluator = evaluator or DTWEvaluator()

    def recognize(self, angles: np.ndarray, top_k: int = 3) -> dict:
        """Reconoce la figura más parecida a la ejecución dada.

        Args:
            angles: secuencia de ángulos del video a reconocer (T, num_angles).
            top_k: cuántas figuras candidatas devolver en el ranking.

        Returns:
            dict con:
                - 'recognized': bool (False si la biblioteca está vacía)
                - 'best': mejor candidato {figure_id, name, distance, confidence,
                          reference_angles}
                - 'ranking': lista de candidatos ordenados por similitud
        """
        if self.library.is_empty():
            return {"recognized": False, "best": None, "ranking": [],
                    "reason": "La biblioteca de figuras está vacía. Añade al menos una referencia."}

        angles = np.asarray(angles, dtype=np.float32)

        # Distancia mínima por figura (entre todas sus referencias)
        per_figure = {}  # figure_id -> {name, distance, reference_angles}
        for fid, name, ref_angles in self.library.iter_references():
            try:
                dist = self.evaluator.dtw_distance(ref_angles, angles)
            except Exception:
                continue
            cur = per_figure.get(fid)
            if cur is None or dist < cur["distance"]:
                per_figure[fid] = {"name": name, "distance": float(dist),
                                   "reference_angles": ref_angles}

        if not per_figure:
            return {"recognized": False, "best": None, "ranking": [],
                    "reason": "No se pudo comparar contra ninguna referencia."}

        # Confianza: softmax sobre -distancia (menor distancia => mayor confianza)
        items = list(per_figure.items())
        dists = np.array([v["distance"] for _, v in items], dtype=np.float64)
        temp = max(float(dists.mean()), 1e-6)
        weights = np.exp(-(dists - dists.min()) / temp)
        confidences = weights / weights.sum()

        ranking = []
        for (fid, v), conf in zip(items, confidences):
            ranking.append({
                "figure_id": fid,
                "name": v["name"],
                "distance": round(v["distance"], 4),
                "confidence": float(conf),
                "reference_angles": v["reference_angles"],
            })
        ranking.sort(key=lambda r: r["distance"])

        best = ranking[0]
        # Ranking público sin los arrays pesados
        public_ranking = [
            {k: r[k] for k in ("figure_id", "name", "distance", "confidence")}
            for r in ranking[:top_k]
        ]

        return {"recognized": True, "best": best, "ranking": public_ranking}
