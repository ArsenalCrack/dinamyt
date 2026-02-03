package org.ivan.backend.backend.repositorios;

import java.util.List;
import org.ivan.backend.backend.BD_tablas.Inscripciones;
import org.ivan.backend.backend.BD_tablas.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface InscripcionRepository extends JpaRepository<Inscripciones, Integer> {
    Optional<Inscripciones> findByUsuarioAndCampeonato(Long usuario, Long campeonato);
    
    Optional<Inscripciones> findByUsuarioAndCampeonatoAndVisibleTrue(Long usuario, Long campeonato);

    List<Inscripciones> findByUsuarioAndVisibleTrueAndInvitadoFalse(Long usuario);
    
    List<Inscripciones> findByUsuarioAndVisibleTrueAndInvitadoTrue(Long usuario);
    
    boolean existsByUsuarioAndVisibleTrue(Long usuario);
    
    List<Inscripciones> findByUsuarioAndInvitadoTrueAndVisibleTrue(Long usuario);
    
    List<Inscripciones>findByCampeonatoAndTipousuarioAndVisibleTrue(Long campeonato,Integer tipousuario);
    
    List<Inscripciones> findByCampeonatoAndTipousuarioInAndEstadoAndVisibleTrue(Long campeonato, List<Integer> tipos,Integer estado);
}
