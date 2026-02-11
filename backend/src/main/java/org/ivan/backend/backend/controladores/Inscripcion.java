package org.ivan.backend.backend.controladores;

import java.time.LocalDate;
import java.time.Period;
import java.util.Comparator;
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
        // GÉNERO
        if (s.getGENERO() != null) {

            // Si la sección es MIXTO, acepta cualquier género
            if ("Mixto".equalsIgnoreCase(s.getGENERO())) {
                // no se valida género
            } else {
                if (genero == null || !genero.equalsIgnoreCase(s.getGENERO())) {
                    return false;
                }
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
                                    "Mas de una seccion valida para la modalidad: " + modalidad
                            );
                        }

                        encontrada = s;
                    }
                }

                if (encontrada == null) {
                    throw new RuntimeException(
                            "El competidor no cumple ninguna seccion para la modalidad: " + modalidad
                    );
                }

                resultado.put(modalidad, encontrada);
            }

            return resultado;

        } catch (RuntimeException e) {
            throw e;
        }
    }
        static void ordenarListas(Map<String, List<UsuarioInscripcionDTO>> listas) {

        Map<String, Integer> ordenCinturon = Map.of(
                "BLANCO", 1,
                "AMARILLO", 2,
                "VERDE", 3,
                "AZUL", 4,
                "ROJO", 5,
                "NEGRO", 6
        );

        Comparator<UsuarioInscripcionDTO> comparador =
        Comparator
                .comparingInt(Inscripcion::calcularEdad)
                .thenComparingInt(dto ->
                        ordenCinturon.getOrDefault(dto.getCinturonRango(), 99)
                );


        listas.values().forEach(lista -> lista.sort(comparador));
    }
    private static int calcularEdad(UsuarioInscripcionDTO dto) {
        return Period.between(
                dto.getFechaNacimiento(),
                LocalDate.now()
        ).getYears();
    }
}
