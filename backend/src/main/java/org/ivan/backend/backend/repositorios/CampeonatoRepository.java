package org.ivan.backend.backend.repositorios;

import org.ivan.backend.backend.BD_tablas.Campeonato;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface CampeonatoRepository extends JpaRepository<Campeonato, Integer> {
    boolean existsBycreadoPor(long creadoPor);

    List<Campeonato> findByCreadoPor(long creadoPor);
    List<Campeonato> findByVisibleTrue();
    List<Campeonato> findByVisibleTrueAndEstado(String estado);
}
