"""
Motor de secciones (categorización automática de competidores).

Portado del paquete @dinamyt/campeonatos-core (categorizacion.ts + secciones.ts)
del proyecto DINAMYT turbo. Lógica pura, sin IO ni BD, para poder testearla en
aislamiento.

El admin configura, por modalidad, listas de categorías de cinturón, edad y
peso, y el género. De ahí se arma el árbol
    Modalidad → Género → Cinturón → Edad → Peso
cuyas HOJAS son las secciones. Un nivel sin categorías se omite; el peso vacío
produce una única sección sin división por peso.

Cinturón: el admin define, por categoría, QUÉ GRUPOS de cinturón entran (ej.
una categoría "Principiantes" = [BLANCO, PRINCIPIANTE]). El competidor cae en
la sección cuya categoría de cinturón incluye su grupo (ver
`emparejar_seccion`).
"""

import re
from datetime import date

# Jerarquía de grupos de cinturón (de menor a mayor).
ORDEN_GRUPO = ("BLANCO", "PRINCIPIANTE", "INTERMEDIO", "AVANZADO", "NEGRO")

# Modalidades por defecto del sistema local. `tipo_llave` decide qué clase de
# llave se genera: "combate" (eliminación directa) o "figuras" (grupo puntuado).
# Los nombres de figuras son los canónicos de frontend/src/lib/categorias.ts.
MODALIDADES_DEFAULT = (
    {"nombre": "COMBATE", "tipo_llave": "combate"},
    {"nombre": "FIGURA A MANOS LIBRES", "tipo_llave": "figuras"},
    {"nombre": "FIGURA CON ARMAS", "tipo_llave": "figuras"},
    {"nombre": "DEFENSA PERSONAL", "tipo_llave": "figuras"},
)


def config_categorias_default():
    """
    Config inicial editable por el admin. Cinturones agrupados 1:1 con los
    grupos canónicos, edades típicas y sin división de peso (el admin agrega
    los cortes de peso que use su torneo, normalmente solo en combate).
    """
    cinturones = [
        {"activa": True, "valor": "Blancos", "grupos": ["BLANCO"]},
        {"activa": True, "valor": "Principiantes", "grupos": ["PRINCIPIANTE"]},
        {"activa": True, "valor": "Intermedios", "grupos": ["INTERMEDIO"]},
        {"activa": True, "valor": "Avanzados", "grupos": ["AVANZADO"]},
        {"activa": True, "valor": "Negros", "grupos": ["NEGRO"]},
    ]
    edades = [
        {"activa": True, "tipo": "individual", "valor": "6-8"},
        {"activa": True, "tipo": "individual", "valor": "9-11"},
        {"activa": True, "tipo": "individual", "valor": "12-14"},
        {"activa": True, "tipo": "individual", "valor": "15-17"},
        {"activa": True, "tipo": "individual", "valor": "18+"},
    ]
    modalidades = []
    for m in MODALIDADES_DEFAULT:
        modalidades.append({
            "nombre": m["nombre"],
            "tipo_llave": m["tipo_llave"],
            "activa": True,
            "categorias": {
                # Combate por género (mixto se decide por edad en el futuro);
                # figuras mixtas por defecto. Todo editable por el admin.
                "genero": "separado" if m["tipo_llave"] == "combate" else "mixto",
                "cinturon": [dict(c, grupos=list(c["grupos"])) for c in cinturones],
                "edad": [dict(e) for e in edades],
                "peso": [],
            },
        })
    return {"modalidades": modalidades}


def calcular_edad(fecha_nacimiento, ref=None):
    """Edad cumplida (años) a una fecha de referencia (la del campeonato)."""
    if fecha_nacimiento is None:
        return None
    ref = ref or date.today()
    edad = ref.year - fecha_nacimiento.year
    if (ref.month, ref.day) < (fecha_nacimiento.month, fecha_nacimiento.day):
        edad -= 1
    return edad


def en_rango(valor, etiqueta):
    """
    ¿Un valor cae dentro de una etiqueta de rango?
    Formatos: "-50" (≤50), "50-60" (50..60 inclusive), "70+" (≥70). Ignora
    sufijos como "kg". Espejo de enRango() del core turbo.
    """
    s = re.sub(r"[^0-9.+-]", "", str(etiqueta))
    if not s:
        return False
    try:
        if s.endswith("+"):
            return valor >= float(s[:-1])
        if s.startswith("-"):
            return valor <= float(s[1:])
        partes = s.split("-")
        a = float(partes[0])
        if len(partes) < 2 or partes[1] == "":
            return valor == a
        return a <= valor <= float(partes[1])
    except ValueError:
        return False


def _expandir(lista):
    """Expande categorías de edad/peso a etiquetas ("valor" o "desde-hasta")."""
    out = []
    for c in lista or []:
        if not c.get("activa", True):
            continue
        if c.get("tipo") == "individual" and c.get("valor"):
            out.append(str(c["valor"]))
        elif c.get("tipo") == "rango":
            out.append(f"{c.get('desde', '')}-{c.get('hasta', '')}")
    return out


def _expandir_cinturon(lista):
    """Expande categorías de cinturón conservando los grupos que abarca cada una."""
    activas = [c for c in (lista or []) if c.get("activa", True)]
    if not activas:
        return [{"label": None, "grupos": []}]
    out = []
    for c in activas:
        grupos = c.get("grupos") or ([c["valor"]] if c.get("valor") else [])
        label = c.get("valor") or ("-".join(grupos) if grupos else None)
        out.append({"label": label, "grupos": grupos})
    return out


def _clave_seccion(modalidad, genero, cinturon, edad, peso):
    """Clave canónica única de una sección (para deduplicar y regenerar)."""
    partes = [
        modalidad,
        genero,
        cinturon or "",
        f"edad({edad or ''})",
        f"peso({peso or 'SIN_PESO'})",
    ]
    return "-".join(partes).upper().replace(" ", "_")


def nombre_seccion(s):
    """Nombre/descripción legible de la sección (pantallas y reportes)."""
    partes = [s["modalidad"], s["genero"]]
    if s.get("cinturon"):
        partes.append(str(s["cinturon"]))
    if s.get("edad"):
        partes.append(f"{s['edad']} años")
    if s.get("peso"):
        peso = str(s["peso"])
        partes.append(peso if "kg" in peso.lower() else f"{peso} kg")
    return " · ".join(str(p) for p in partes)


def generar_secciones(modalidades):
    """
    Genera las secciones (hojas del árbol) desde la config de modalidades.

    `modalidades`: [{
        "nombre": "COMBATE", "tipo_llave": "combate", "activa": True,
        "categorias": {
            "genero": "mixto" | "separado",
            "cinturon": [{"activa", "valor"?, "grupos"?: [..]}],
            "edad":     [{"activa", "tipo": "individual"|"rango", ...}],
            "peso":     [{"activa", "tipo": ..., ...}],
        },
    }, ...]
    """
    secciones = []
    for m in modalidades or []:
        if not m.get("activa", True):
            continue
        cat = m.get("categorias") or {}
        genero_cfg = str(cat.get("genero", "mixto")).lower()
        generos = ["Mixto"] if genero_cfg == "mixto" else ["Masculino", "Femenino"]

        cinturones = _expandir_cinturon(cat.get("cinturon"))
        edades = _expandir(cat.get("edad")) or [None]
        pesos = _expandir(cat.get("peso")) or [None]

        for g in generos:
            for c in cinturones:
                for e in edades:
                    for p in pesos:
                        seccion = {
                            "clave": _clave_seccion(m["nombre"], g, c["label"], e, p),
                            "modalidad": m["nombre"],
                            "tipo_llave": m.get("tipo_llave") or "combate",
                            "genero": g,
                            "cinturon": c["label"],
                            "cinturon_grupos": c["grupos"] or None,
                            "edad": e,
                            "peso": p,
                        }
                        seccion["nombre"] = nombre_seccion(seccion)
                        secciones.append(seccion)
    return secciones


def emparejar_seccion(secciones, criterio):
    """
    Encuentra la sección que corresponde a un competidor: misma modalidad;
    género igual o sección Mixto; el grupo de cinturón del competidor incluido
    en los grupos de la sección; y edad/peso dentro de los rangos.

    `criterio`: {"modalidad", "genero", "grupo_cinturon", "edad", "peso"}
    Retorna la sección o None. Si la sección exige edad/peso y el competidor
    no tiene el dato, no empareja (el llamador reporta el aviso).
    """
    genero = str(criterio.get("genero") or "").upper()
    grupo = str(criterio.get("grupo_cinturon") or "").upper()
    edad = criterio.get("edad")
    peso = criterio.get("peso")

    for s in secciones:
        if s["modalidad"] != criterio.get("modalidad"):
            continue
        sg = str(s["genero"]).upper()
        if sg != "MIXTO" and sg != genero:
            continue
        grupos = s.get("cinturon_grupos") or []
        if grupos and grupo not in [str(x).upper() for x in grupos]:
            continue
        if s.get("edad"):
            if edad is None or not en_rango(edad, s["edad"]):
                continue
        if s.get("peso"):
            if peso is None or not en_rango(peso, s["peso"]):
                continue
        return s
    return None
