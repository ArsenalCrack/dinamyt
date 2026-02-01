package org.ivan.backend.backend.repositorios;

import org.ivan.backend.backend.BD_tablas.Tipousuario;
import org.ivan.backend.backend.BD_tablas.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UsuarioRepository extends JpaRepository<Usuario, Long> {

    boolean existsByCorreo(String correo);

    Usuario findByCorreo(String correo);

    boolean existsByTipousuario(Tipousuario tipo);

    List<Usuario> findByAcademia_IDacademiaAndTipousuario_IDTipoAndIdDocumentoNot(int IDacademia, int IDTipo,
            Long idInstructorExcluir);

    List<Usuario> findByNombreCContainingIgnoreCaseAndEstadoAndIdDocumentoNot(String nombre, Integer estado,
            Long idExcluir);

}
