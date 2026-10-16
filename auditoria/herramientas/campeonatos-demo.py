"""
Datos de demostración para la base LOCAL de Campeonatos (instance/dinamyt.db),
para poder fotografiar las pantallas de un campeonato. Todo inventado.
Idempotente: si ya existe «Abierto Demo de Hapkido 2026», no hace nada.

Uso, con la base local de Campeonatos (desde D:/Repositorios/dinamyt-combat/backend):
    python D:/Repositorios/dinamyt/auditoria/herramientas/campeonatos-demo.py
Las capturas usan los ids que deja (1 en curso, 2 en preparación): campeonatos.json.
"""
import random
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path.cwd()))

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402

random.seed(20261016)

app = create_app("development")
assert "dinamyt.db" in str(app.config["SQLALCHEMY_DATABASE_URI"]), app.config["SQLALCHEMY_DATABASE_URI"]

with app.app_context():
    from app.models.campeonato import Campeonato
    from app.models.competidor import Competidor, Inscripcion
    from app.models.tatami import Tatami
    from app.models.llave import Llave
    from app.models.asignacion import AsignacionJuez
    from app.models.usuario import Usuario
    from app.api.llaves import generar_estructura

    if Campeonato.query.filter_by(nombre="Abierto Demo de Hapkido 2026").first():
        print("ya estaba sembrado")
        sys.exit(0)

    dueno = Usuario.query.filter_by(email="admin@dinamyt.com").first()
    juez = Usuario.query.filter_by(email="juez@dinamyt.com").first()
    assert dueno, "falta admin@dinamyt.com: entra una vez por DINAMYT"

    config = {"modalidades": [{
        "nombre": "COMBATE", "tipo_llave": "combate", "activa": True,
        "categorias": {
            "genero": "separado",
            "cinturon": [{"activa": True, "valor": "Todos",
                          "grupos": ["BLANCO", "PRINCIPIANTE", "INTERMEDIO", "AVANZADO", "NEGRO"]}],
            "edad": [{"activa": True, "tipo": "rango", "desde": "10", "hasta": "17"}],
            "peso": [],
        },
    }]}

    clubes = ["Club Halcón Dorado", "Escuela Río Pamplonita", "Dojo Norte", "Club Los Patios"]
    mujeres = ["Valentina Rincón", "Sara Castellanos", "Mariana Duarte", "Isabela Quintero",
               "Gabriela Ortega", "Lucía Pabón", "Daniela Contreras", "Juliana Mendoza"]
    hombres = ["Samuel Jaimes", "Tomás Villamizar", "Nicolás Peñaranda", "Matías Suárez",
               "Emiliano Rojas", "Jerónimo Vera", "Santiago Bautista", "Andrés Carrillo"]

    def ficha(nombre, genero, i):
        c = Competidor(
            nombre_completo=nombre.upper(), genero=genero,
            documento=str(1090000000 + random.randint(100000, 999999)),
            fecha_nacimiento=date(random.randint(2010, 2014), random.randint(1, 12), random.randint(1, 28)),
            grupo_cinturon="INTERMEDIO", cinturon="Verde", peso=round(random.uniform(32, 58), 1),
            club=clubes[i % len(clubes)], created_by=dueno.id,
        )
        db.session.add(c)
        db.session.flush()
        return c

    # 1 · En curso: tatamis, inscritos y llaves.
    a = Campeonato(nombre="Abierto Demo de Hapkido 2026", activo=True, estado="en_curso",
                   descripcion="Campeonato de demostración con datos inventados.",
                   fecha_inicio=date(2026, 11, 14), fecha_fin=date(2026, 11, 15),
                   lugar="Coliseo Demo", ciudad="Cúcuta", pais="Colombia",
                   created_by=dueno.id, config_categorias=config)
    db.session.add(a)
    db.session.flush()
    t1, t2 = Tatami(campeonato_id=a.id, numero=1), Tatami(campeonato_id=a.id, numero=2)
    db.session.add_all([t1, t2])
    db.session.flush()

    fem = [ficha(n, "FEMENINO", i) for i, n in enumerate(mujeres[:6])]
    mas = [ficha(n, "MASCULINO", i) for i, n in enumerate(hombres[:6])]
    for c in fem + mas:
        db.session.add(Inscripcion(campeonato_id=a.id, competidor_id=c.id, modalidades=["COMBATE"],
                                   grupo_cinturon=c.grupo_cinturon, peso=c.peso, estado="aceptada",
                                   created_by=dueno.id))
    for tat, grupo, nombre in [(t1, fem, "COMBATE · FEMENINO · INTERMEDIO · 10-17"),
                               (t2, mas, "COMBATE · MASCULINO · INTERMEDIO · 10-17")]:
        db.session.add(Llave(campeonato_id=a.id, tatami_id=tat.id, nombre=nombre, tipo="combate",
                             created_by=dueno.id,
                             estructura=generar_estructura([{"nombre": c.nombre_completo, "club": c.club} for c in grupo])))
    if juez:
        db.session.add(AsignacionJuez(usuario_id=juez.id, tatami_id=t1.id, rol_tatami="arbitro",
                                      nombre_display="Juez central", asignado_por_id=dueno.id))

    # 2 · En preparación: inscripciones por revisar.
    b = Campeonato(nombre="Copa Demo Infantil", activo=True, estado="preparacion",
                   descripcion="Inscripciones abiertas. Datos inventados.",
                   fecha_inicio=date(2026, 12, 5), fecha_fin=date(2026, 12, 5),
                   lugar="Polideportivo Demo", ciudad="Villa del Rosario", pais="Colombia",
                   created_by=dueno.id, config_categorias=config)
    db.session.add(b)
    db.session.flush()
    db.session.add(Tatami(campeonato_id=b.id, numero=1))
    for i, n in enumerate(mujeres[6:] + hombres[6:]):
        c = ficha(n, "FEMENINO" if i < 2 else "MASCULINO", i)
        db.session.add(Inscripcion(campeonato_id=b.id, competidor_id=c.id, modalidades=["COMBATE"],
                                   grupo_cinturon=c.grupo_cinturon, peso=c.peso,
                                   estado="pendiente" if i % 2 else "aceptada", created_by=dueno.id))
    db.session.commit()
    print(f"sembrado: {a.nombre} (id {a.id}) y {b.nombre} (id {b.id})")
