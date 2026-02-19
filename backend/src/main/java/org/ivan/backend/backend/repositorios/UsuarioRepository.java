package org.ivan.backend.backend.repositorios;

import org.ivan.backend.backend.BD_tablas.Tipousuario;
import org.ivan.backend.backend.BD_tablas.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UsuarioRepository extends JpaRepository<Usuario, Long> {
    
    List<Usuario> findByIdDocumentoIn(List<Long> ids);
    boolean existsByCorreo(String correo);

    Usuario findByCorreo(String correo);

    boolean existsByTipousuario(Tipousuario tipo);

    List<Usuario> findByAcademia_IDacademiaAndTipousuario_IDTipoAndIdDocumentoNot(int IDacademia, int IDTipo,
                    Long idInstructorExcluir);

    @Query("""
        SELECT u
        FROM Usuario u
        WHERE
          (
            LOWER(u.nombreC) LIKE LOWER(CONCAT('%', :nombre, '%'))
            OR CAST(u.idDocumento AS string) LIKE CONCAT('%', :nombre, '%')
          )
          AND u.estado = :estado
          AND u.idDocumento <> :idExcluir
          AND NOT EXISTS (
            SELECT 1
            FROM Inscripciones i
            WHERE
              i.usuario = u.idDocumento
              AND i.campeonato = :idCampeonato
              AND (
                (:tipo = 5 AND i.tipousuario = 5)
                OR
                (:tipo IN (6,7,8) AND i.tipousuario IN (6,7,8))
              )
          )
    """)
    List<Usuario> findUsuariosDisponiblesPorCampeonato(
        @Param("nombre") String nombre,
        @Param("estado") Integer estado,
        @Param("idExcluir") Long idExcluir,
        @Param("idCampeonato") Long idCampeonato,
        @Param("tipo") Integer tipo
    );




}
