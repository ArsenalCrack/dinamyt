package org.ivan.backend.backend.repositorios;

import org.ivan.backend.backend.BD_tablas.Academia;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AcademiaRepository extends JpaRepository<Academia, Integer> {
}
