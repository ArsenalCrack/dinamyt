package org.ivan.backend.backend.repositorios;


import org.ivan.backend.backend.BD_tablas.Campeonato;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CampeonatoRepository extends JpaRepository<Campeonato, Integer> {
}
