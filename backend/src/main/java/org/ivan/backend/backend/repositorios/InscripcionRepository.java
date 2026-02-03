package org.ivan.backend.backend.repositorios;

import java.util.List;
import org.ivan.backend.backend.BD_tablas.Inscripciones;
import org.ivan.backend.backend.BD_tablas.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface InscripcionRepository extends JpaRepository<Inscripciones, Integer> {
    Optional<Inscripciones> findByUsuarioAndCampeonato(Long usuario, Long campeonato);

    List<Inscripciones> findByUsuario(Long usuario);
    
    boolean existsByUsuario(Long usuario);
    
    List<Inscripciones> findByUsuarioAndInvitadoTrue(Long usuario);
    
    List<Inscripciones>findByCampeonato(Long campeonato);
}
