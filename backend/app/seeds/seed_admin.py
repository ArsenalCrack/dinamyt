"""
Seed: Admin inicial
Crea el usuario admin con la contraseña configurada.
"""

from ..extensions import db
from ..models.usuario import Usuario


def seed_admin(config):
    """Crea el usuario admin inicial si no existe."""
    email = config.get("ADMIN_EMAIL", "admin@dinamyt.com")
    password = config.get("ADMIN_PASSWORD", "Amy2026*")
    nombre = config.get("ADMIN_NOMBRE", "Administrador DINAMYT")

    admin = Usuario.query.filter_by(email=email).first()
    if admin:
        # Idempotente: el admin sembrado es la raíz de la jerarquía. Si la BD
        # viene de una versión sin es_superadmin (columna NULL), se promueve.
        if not admin.es_superadmin:
            admin.es_superadmin = True
            db.session.commit()
            print(f"  [OK] Admin '{email}' promovido a superadmin.")
        else:
            print(f"  [OK] Admin '{email}' ya existe (superadmin).")
        return

    admin = Usuario(
        email=email,
        nombre=nombre,
        rol="admin",
        es_superadmin=True,
        activo=True,
    )
    admin.set_password(password)
    db.session.add(admin)
    db.session.commit()
    print(f"  [OK] Superadmin '{email}' creado con password configurada.")
