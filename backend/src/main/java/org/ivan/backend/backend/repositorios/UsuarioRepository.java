package org.ivan.backend.backend.repositorios;

import org.ivan.backend.backend.BD_tablas.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UsuarioRepository extends JpaRepository<Usuario, Long> {
    boolean existsByCorreo(String correo);

    Usuario findByCorreo(String correo);
}

