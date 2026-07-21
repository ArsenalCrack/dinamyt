"""
Traducción de los archivos que genera el backend (PDF/Excel de reportes,
PDF de llaves, plantilla de importación).

El frontend ya está traducido, pero estos archivos los arma Python con texto
fijo. El idioma llega por `?lang=en` (o `?lang=es`) en la petición de descarga;
por defecto español. `idioma_request()` lo resuelve desde el request de Flask.
"""

from flask import request

IDIOMAS = ("es", "en")


def idioma_request(default="es"):
    """Idioma pedido para el archivo: ?lang=en|es (o cabecera Accept-Language)."""
    lang = (request.args.get("lang") or "").strip().lower()
    if lang in IDIOMAS:
        return lang
    accept = (request.headers.get("Accept-Language") or "").strip().lower()
    if accept.startswith("en"):
        return "en"
    return default if default in IDIOMAS else "es"


# clave → {es, en}. Usa {marcadores} para interpolar con .format().
_STRINGS = {
    # ── Comunes / valores de celda ──
    "combate": {"es": "Combate", "en": "Combat"},
    "figuras": {"es": "Figuras", "en": "Forms"},
    "comb_corto": {"es": "Comb.", "en": "Comb."},
    "fig_corto": {"es": "Fig.", "en": "Forms"},
    "tatami_n": {"es": "Tatami {n}", "en": "Tatami {n}"},
    "tatami_corto": {"es": "T{n}", "en": "T{n}"},
    "empate": {"es": "Empate", "en": "Tie"},
    "completo": {"es": "Completo", "en": "Complete"},
    "incompleto": {"es": "Incompleto", "en": "Incomplete"},
    "desempate_reev": {"es": "· Desempate reevaluado: {nombres}",
                       "en": "· Tiebreak re-evaluated: {nombres}"},
    "figuras_estado": {"es": "Figuras — {estado}", "en": "Forms — {estado}"},
    "especial_sfx": {"es": " (Especial)", "en": " (Special)"},
    "empate_sfx": {"es": " (Empate)", "en": " (Tie)"},
    "medalla_oro": {"es": "1° (Oro)", "en": "1st (Gold)"},
    "medalla_plata": {"es": "2° (Plata)", "en": "2nd (Silver)"},
    "medalla_bronce": {"es": "3° (Bronce)", "en": "3rd (Bronze)"},
    "medalla_n": {"es": "{n}°", "en": "{n}"},
    # Rondas
    "ronda_r1": {"es": "Round 1", "en": "Round 1"},
    "ronda_r2": {"es": "Round 2", "en": "Round 2"},
    "ronda_oro": {"es": "Punto de Oro", "en": "Golden Point"},
    # Tipos de punto
    "pt_especial": {"es": "Especial", "en": "Special"},
    "pt_kyonggo": {"es": "KyongGo", "en": "KyongGo"},
    "pt_gamjeum": {"es": "GamJeum", "en": "GamJeum"},
    "pt_decision": {"es": "Decisión JC", "en": "CJ Decision"},
    "pt_normal": {"es": "Punto Normal", "en": "Normal Point"},
    # ── Contexto de filtros ──
    "punt_combate": {"es": "Puntuación Combate", "en": "Combat scoring"},
    "punt_individual": {"es": "Puntuación Individual", "en": "Individual scoring"},
    "sub_campeonato": {"es": "Campeonato: {v}", "en": "Championship: {v}"},
    "sub_categoria": {"es": "Categoría: {v}", "en": "Category: {v}"},
    "sub_seleccion": {"es": "Selección de {n} registro(s)",
                      "en": "Selection of {n} record(s)"},
    # ── Título / encabezado ──
    "reporte_titulo": {"es": "DINAMYT — Reporte de Resultados",
                       "en": "DINAMYT — Results Report"},
    "reporte_generado": {"es": "Generado: {fecha}", "en": "Generated: {fecha}"},
    "reporte_total": {"es": "Total: {n} registros", "en": "Total: {n} records"},
    # ── Excel: nombres de hoja ──
    "hoja_resultados": {"es": "Resultados DINAMYT", "en": "DINAMYT Results"},
    "hoja_detalle": {"es": "Detalle de Puntos", "en": "Points Detail"},
    "hoja_ranking": {"es": "Ranking Figuras", "en": "Forms Ranking"},
    "hoja_podios": {"es": "Podios Llaves", "en": "Bracket Podiums"},
    # ── Excel: encabezados principales ──
    "h_id": {"es": "ID", "en": "ID"},
    "h_tipo": {"es": "Tipo", "en": "Type"},
    "h_categoria": {"es": "Categoría", "en": "Category"},
    "h_campeonato": {"es": "Campeonato", "en": "Championship"},
    "h_tatami": {"es": "Tatami", "en": "Tatami"},
    "h_rojo_comp": {"es": "Rojo / Competidor", "en": "Red / Competitor"},
    "h_azul_cat": {"es": "Azul / Categoría", "en": "Blue / Category"},
    "h_pts1_total": {"es": "Pts 1 / Total", "en": "Pts 1 / Total"},
    "h_pts2": {"es": "Pts 2", "en": "Pts 2"},
    "h_ganador": {"es": "Ganador", "en": "Winner"},
    "h_ronda_final": {"es": "Ronda Final", "en": "Final Round"},
    "h_rondas_hc": {"es": "Rondas (Hong-Chung)", "en": "Rounds (Hong-Chung)"},
    "h_num_jueces": {"es": "No. Jueces", "en": "No. Judges"},
    "h_duracion": {"es": "Duracion (s)", "en": "Duration (s)"},
    "h_fecha_hora": {"es": "Fecha/Hora", "en": "Date/Time"},
    "h_jueces_full": {"es": "Jueces (rol, nombre y correo)",
                      "en": "Judges (role, name and email)"},
    # ── Excel: detalle de puntos ──
    "h_combate_id": {"es": "Combate ID", "en": "Match ID"},
    "h_hong": {"es": "Hong", "en": "Hong"},
    "h_chung": {"es": "Chung", "en": "Chung"},
    "h_rol": {"es": "Rol", "en": "Role"},
    "h_nombre_juez": {"es": "Nombre juez", "en": "Judge name"},
    "h_correo": {"es": "Correo", "en": "Email"},
    "h_asignacion": {"es": "Asignacion", "en": "Assignment"},
    "h_acceso": {"es": "Acceso", "en": "Access"},
    "h_color": {"es": "Color", "en": "Color"},
    "h_pts": {"es": "Pts", "en": "Pts"},
    "h_accion": {"es": "Accion", "en": "Action"},
    "h_tiempo": {"es": "Tiempo (s)", "en": "Time (s)"},
    "h_momento": {"es": "Momento", "en": "Moment"},
    "h_ronda": {"es": "Ronda", "en": "Round"},
    # ── Excel: figuras ──
    "h_registro_id": {"es": "Registro ID", "en": "Record ID"},
    "h_descripcion": {"es": "Descripción", "en": "Description"},
    "h_estado": {"es": "Estado", "en": "Status"},
    "h_puesto": {"es": "Puesto", "en": "Place"},
    "h_competidor": {"es": "Competidor", "en": "Competitor"},
    "h_club": {"es": "Club", "en": "Club"},
    "h_total": {"es": "Total", "en": "Total"},
    "h_puntajes_juez": {"es": "Puntajes por juez (criterio y correo)",
                        "en": "Scores per judge (criterion and email)"},
    # ── Excel: podios ──
    "h_llave": {"es": "Llave", "en": "Bracket"},
    # ── PDF: encabezados y secciones ──
    "h_num": {"es": "#", "en": "#"},
    "h_rojo_comp_corto": {"es": "Rojo/Comp.", "en": "Red/Comp."},
    "h_azul_cat_corto": {"es": "Azul/Cat.", "en": "Blue/Cat."},
    "h_fecha": {"es": "Fecha", "en": "Date"},
    "sec_marcador_rondas": {"es": "Marcador por rondas (Hong-Chung)",
                            "en": "Score by rounds (Hong-Chung)"},
    "h_comb_id": {"es": "Comb ID", "en": "Match ID"},
    "h_rojo": {"es": "Rojo", "en": "Red"},
    "h_azul": {"es": "Azul", "en": "Blue"},
    "h_rondas_jugadas": {"es": "Rondas jugadas", "en": "Rounds played"},
    "sec_jueces": {"es": "Jueces, correo y asignación",
                   "en": "Judges, email and assignment"},
    "h_jueces": {"es": "Jueces", "en": "Judges"},
    "sec_detalle_puntos": {"es": "Detalle de Puntos por Juez",
                           "en": "Points Detail per Judge"},
    "h_nombre": {"es": "Nombre", "en": "Name"},
    "h_asign_corto": {"es": "Asign.", "en": "Assign."},
    "sec_ranking_figuras": {"es": "Ranking de Figuras", "en": "Forms Ranking"},
    "h_reg_id": {"es": "Reg ID", "en": "Rec ID"},
    "sec_puntajes_figuras": {"es": "Puntajes de Figuras por juez (criterio y correo)",
                             "en": "Forms scores per judge (criterion and email)"},
    "h_puntajes": {"es": "Puntajes", "en": "Scores"},
    "sec_podios_llaves": {"es": "Podios de Llaves (eliminación)",
                          "en": "Bracket Podiums (elimination)"},
    # ── PDF de una llave (llaves.py) ──
    "llave_grupo_figuras": {"es": "Grupo de figuras", "en": "Forms group"},
    "llave_cuadro": {"es": "Cuadro de eliminación", "en": "Elimination bracket"},
    "llave_generado": {"es": "Generado {fecha}", "en": "Generated {fecha}"},
    "llave_bye": {"es": "BYE (pase directo)", "en": "BYE (direct pass)"},
    "llave_por_definir": {"es": "Por definir", "en": "To be defined"},
    "llave_campeon": {"es": "CAMPEÓN", "en": "CHAMPION"},
    "llave_3er": {"es": "3ER PUESTO", "en": "3RD PLACE"},
    "llave_podio": {"es": "PODIO", "en": "PODIUM"},
    "llave_final": {"es": "Final", "en": "Final"},
    "llave_semifinal": {"es": "Semifinal", "en": "Semifinal"},
    "llave_cuartos": {"es": "Cuartos", "en": "Quarterfinals"},
    "llave_octavos": {"es": "Octavos", "en": "Round of 16"},
    "llave_ronda_n": {"es": "Ronda {n}", "en": "Round {n}"},
    # ── Plantilla de importación (competidores.py) ──
    "tpl_hoja": {"es": "Competidores", "en": "Competitors"},
    "tpl_h_nombre": {"es": "Nombre completo", "en": "Full name"},
    "tpl_h_documento": {"es": "Documento", "en": "ID number"},
    "tpl_h_fecha": {"es": "Fecha nacimiento", "en": "Birth date"},
    "tpl_h_genero": {"es": "Género", "en": "Gender"},
    "tpl_h_cinturon": {"es": "Cinturón", "en": "Belt"},
    "tpl_h_peso": {"es": "Peso", "en": "Weight"},
    "tpl_h_club": {"es": "Club", "en": "Club"},
    "tpl_h_especial": {"es": "Especial", "en": "Special"},
    "tpl_h_modalidades": {"es": "Modalidades", "en": "Disciplines"},
    "tpl_hoja_notas": {"es": "Notas", "en": "Notes"},
    "tpl_notas_titulo": {"es": "Cómo llenar la plantilla",
                         "en": "How to fill in the template"},
    "tpl_n_nombre": {"es": "· Nombre completo: obligatorio (máximo {n} caracteres).",
                     "en": "· Full name: required (max {n} characters)."},
    "tpl_n_documento": {"es": "· Documento: solo números, máximo {n} dígitos; evita duplicados al re-importar.",
                        "en": "· ID number: digits only, max {n} digits; avoid duplicates when re-importing."},
    "tpl_n_fecha": {"es": "· Fecha nacimiento: dd/mm/aaaa. Edad entre {min} y {max} años.",
                    "en": "· Birth date: dd/mm/yyyy. Age between {min} and {max} years."},
    "tpl_n_genero": {"es": "· Género: M o F (también vale MASCULINO / FEMENINO).",
                     "en": "· Gender: M or F (MALE / FEMALE also work)."},
    "tpl_n_cinturon": {"es": "· Cinturón: uno del catálogo — {lista}. El grupo competitivo se asigna solo.",
                       "en": "· Belt: one from the catalog — {lista}. The competitive group is assigned automatically."},
    "tpl_n_peso": {"es": "· Peso: en kilogramos ({min} a {max}), punto o coma decimal.",
                   "en": "· Weight: in kilograms ({min} to {max}), dot or comma decimal."},
    "tpl_n_club": {"es": "· Club: academia o equipo (máximo {n} caracteres).",
                   "en": "· Club: academy or team (max {n} characters)."},
    "tpl_n_especial": {"es": "· Especial: SI para categoría especial (en figuras recibe 1er puesto sin afectar el ranking normal).",
                       "en": "· Special: YES for special category (in forms it gets 1st place without affecting the normal ranking)."},
    "tpl_n_modalidades": {"es": "· Modalidades: separadas por coma; solo se usa al importar dentro de un campeonato.",
                          "en": "· Disciplines: comma-separated; only used when importing within a championship."},
    "tpl_n_ejemplo": {"es": "· La fila de ejemplo se puede borrar o sobrescribir.",
                      "en": "· The example row can be deleted or overwritten."},
}


def trad(lang):
    """Devuelve una función t(clave, **kw) que traduce e interpola."""
    lang = lang if lang in IDIOMAS else "es"

    def t(clave, **kw):
        entry = _STRINGS.get(clave)
        if not entry:
            return clave
        texto = entry.get(lang) or entry.get("es") or clave
        return texto.format(**kw) if kw else texto

    return t
