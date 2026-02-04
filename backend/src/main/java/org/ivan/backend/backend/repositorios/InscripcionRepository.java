package org.ivan.backend.backend.repositorios;

import java.util.List;
import org.ivan.backend.backend.BD_tablas.Inscripciones;
import org.ivan.backend.backend.BD_tablas.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InscripcionRepository extends JpaRepository<Inscripciones, Integer> {
    Optional<Inscripciones> findByUsuarioAndCampeonatoAndTipousuario(Long usuario,Long campeonato,Integer tipousuario);

    @Query("""
        SELECT i
        FROM Inscripciones i
        WHERE
          i.usuario = :usuario
          AND i.campeonato = :campeonato
          AND i.tipousuario IN (6,7,8)
    """)
    Optional<Inscripciones> findInscripcionJuez(
        @Param("usuario") Long usuario,
        @Param("campeonato") Long campeonato
    );

    Optional<Inscripciones> findByUsuarioAndCampeonato(Long usuario, Long campeonato);
    
    Optional<Inscripciones> findByUsuarioAndCampeonatoAndVisibleTrue(Long usuario, Long campeonato);

    List<Inscripciones> findByUsuarioAndVisibleTrueAndInvitadoFalse(Long usuario);
    
    List<Inscripciones> findByUsuarioAndVisibleTrueAndInvitadoTrue(Long usuario);
    
    boolean existsByUsuarioAndVisibleTrue(Long usuario);
    
    List<Inscripciones> findByUsuarioAndInvitadoTrueAndVisibleTrue(Long usuario);
    
    List<Inscripciones>findByCampeonatoAndTipousuarioAndVisibleTrueAndInvitadoFalse(Long campeonato,Integer tipousuario);
    
    List<Inscripciones> findByCampeonatoAndTipousuarioInAndEstadoAndVisibleTrue(Long campeonato, List<Integer> tipos,Integer estado);
    
    List<Inscripciones>findByCampeonatoAndVisibleTrueAndInvitadoTrue(Long campeonato);
    
}
