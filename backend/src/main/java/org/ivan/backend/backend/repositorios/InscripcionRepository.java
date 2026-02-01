package org.ivan.backend.backend.repositorios;

import org.ivan.backend.backend.BD_tablas.Inscripciones;
import org.ivan.backend.backend.BD_tablas.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface InscripcionRepository extends JpaRepository<Inscripciones, Integer> {
    Optional<Inscripciones> findByUsuarioAndCampeonato(Long usuario, Long campeonato);

    java.util.List<Inscripciones> findByUsuario(Long usuario);
}
