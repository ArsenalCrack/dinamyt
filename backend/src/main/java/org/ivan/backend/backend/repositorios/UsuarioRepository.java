package org.ivan.backend.backend.repositorios;

import org.ivan.backend.backend.BD_tablas.Tipousuario;
import org.ivan.backend.backend.BD_tablas.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UsuarioRepository extends JpaRepository<Usuario, Long> {

        boolean existsByCorreo(String correo);

        Usuario findByCorreo(String correo);

        boolean existsByTipousuario(Tipousuario tipo);

        List<Usuario> findByAcademia_IDacademiaAndTipousuario_IDTipoAndIdDocumentoNot(int IDacademia, int IDTipo,
                        Long idInstructorExcluir);

        @Query("""
                        SELECT u
                        FROM Usuario u
                        WHERE
                          (LOWER(u.nombreC) LIKE LOWER(CONCAT('%', :nombre, '%')) OR CAST(u.idDocumento AS string) LIKE CONCAT('%', :nombre, '%'))
                          AND u.estado = :estado
                          AND u.idDocumento <> :idExcluir
                          AND NOT EXISTS (
                            SELECT i
                            FROM Inscripciones i
                            WHERE
                              i.usuario = u.idDocumento
                              AND i.campeonato = :idCampeonato
                              AND i.estado IN (2, 3)
                          )
                        """)
        List<Usuario> findUsuariosDisponiblesPorCampeonato(
                        @Param("nombre") String nombre,
                        @Param("estado") Integer estado,
                        @Param("idExcluir") Long idExcluir,
                        @Param("idCampeonato") Long idCampeonato);

}
