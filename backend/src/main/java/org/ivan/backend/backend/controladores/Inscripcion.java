package org.ivan.backend.backend.controladores;

import org.ivan.backend.backend.secciones.Seccion;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.ivan.backend.backend.BD_tablas.Usuario;
import org.ivan.backend.backend.repositorios.InscripcionRepository;
import org.springframework.beans.factory.annotation.Autowired;

public class Inscripcion {

    private static final List<String> ORDEN_CINTURONES = List.of(
            "Blanco",
            "Amarillo",
            "Naranja",
            "Naranja/verde",
            "Verde",
            "Verde/azul",
            "Azul",
            "Rojo",
            "Marrón",
            "Marrón/negro",
            "Negro"
    );

    static boolean estaEnRango(Integer valor, String rango) {
        if (valor == null || rango == null) return false;

        String[] partes = rango.split("-");
        int min = Integer.parseInt(partes[0]);
        int max = Integer.parseInt(partes[1]);

        return valor >= min && valor <= max;
    }
    static boolean estaEnRangoCinturon(String competidor, String rango) {

        String[] partes = rango.split("-");
        String desde = partes[0];
        String hasta = partes[1];

        int idxCompetidor = ORDEN_CINTURONES.indexOf(competidor);
        int idxDesde = ORDEN_CINTURONES.indexOf(desde);
        int idxHasta = ORDEN_CINTURONES.indexOf(hasta);

        if (idxCompetidor == -1 || idxDesde == -1 || idxHasta == -1) {
            return false;
        }

        return idxCompetidor >= idxDesde && idxCompetidor <= idxHasta;
    }

    static boolean coincideCinturon(String competidor, String seccion) {
        if (competidor == null || seccion == null) return false;

        // Rango explícito
        if (seccion.contains("-")) {
            return estaEnRangoCinturon(competidor, seccion);
        }

        // Cinturón único
        return seccion.equalsIgnoreCase(competidor);
    }

    static boolean cumpleSeccion(
            Seccion s,
            Integer edad,
            Integer peso,
            String cinturon,
            String genero
    ) {

        // EDAD
        if (s.getEDAD() != null) {
            if (edad == null || !estaEnRango(edad, s.getEDAD())) {
                return false;
            }
        }

        if (s.getPESO() != null && !"SIN_PESO".equalsIgnoreCase(s.getPESO())) {
            if (peso == null || !estaEnRango(peso, s.getPESO())) {
                return false;
            }
        }

        // CINTURÓN
        if (s.getCINTURON() != null) {
            if (cinturon == null || !coincideCinturon(cinturon, s.getCINTURON())) {
                return false;
            }
        }

        // GÉNERO
        if (s.getGENERO() != null) {
            if (genero == null || !genero.equalsIgnoreCase(s.getGENERO())) {
                return false;
            }
        }

        return true;
    }
    static Map<String, Seccion> buscarSeccionesPorModalidades(
            String jsonSecciones,
            List<String> modalidades,
            Integer edad,
            Integer peso,
            String cinturon,
            String genero
    ) {
        ObjectMapper mapper = new ObjectMapper();
        Map<String, Seccion> resultado = new HashMap<>();

        try {
            List<Seccion> secciones = mapper.readValue(
                    jsonSecciones,
                    new TypeReference<List<Seccion>>() {}
            );

            for (String modalidad : modalidades) {

                Seccion encontrada = null;

                for (Seccion s : secciones) {

                    if (!modalidad.equalsIgnoreCase(s.getMODALIDAD())) {
                        continue;
                    }

                    if (cumpleSeccion(s, edad, peso, cinturon, genero)) {

                        if (encontrada != null) {
                            throw new RuntimeException(
                                    "Más de una sección válida para la modalidad: " + modalidad
                            );
                        }

                        encontrada = s;
                    }
                }

                if (encontrada == null) {
                    throw new RuntimeException(
                            "El competidor no cumple ninguna sección para la modalidad: " + modalidad
                    );
                }

                resultado.put(modalidad, encontrada);
            }

            return resultado;

        } catch (Exception e) {
            throw new RuntimeException("Error al procesar secciones", e);
        }
    }
}
