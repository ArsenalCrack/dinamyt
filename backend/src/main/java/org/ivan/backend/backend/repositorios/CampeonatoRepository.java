package org.ivan.backend.backend.repositorios;


import org.ivan.backend.backend.BD_tablas.Campeonato;
import org.ivan.backend.backend.BD_tablas.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CampeonatoRepository extends JpaRepository<Campeonato, Integer> {
    boolean existsBycreadoPor(long creadoPor);

    List<Campeonato> findByCreadoPor(long creadoPor);
}
