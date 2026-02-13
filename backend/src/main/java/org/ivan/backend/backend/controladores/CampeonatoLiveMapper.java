/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package org.ivan.backend.backend.controladores;

import java.time.LocalDate;
import java.time.Period;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.ivan.backend.backend.BD_tablas.Campeonato;
import org.ivan.backend.backend.BD_tablas.Inscripciones;
import org.ivan.backend.backend.BD_tablas.Usuario;
import org.ivan.backend.backend.repositorios.UsuarioRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/**
 *
 * @author andre
 */
@Component
public class CampeonatoLiveMapper {

    @Autowired
    private UsuarioRepository usuarioRepository;

    private final ObjectMapper mapper = new ObjectMapper();

    public CampeonatoLiveDTO construirCampeonatoLive(
            Campeonato cam,
            List<Inscripciones> inscripciones
    ) {

        Set<String> seccionesActivas = leerSeccionesActivas(cam);

        Map<String, List<UsuarioInscripcionDTO>> masculinos = new HashMap<>();
        Map<String, List<UsuarioInscripcionDTO>> femeninos = new HashMap<>();
        Map<String, List<UsuarioInscripcionDTO>> mixtos = new HashMap<>();

        for (Inscripciones ins : inscripciones) {

            Usuario u = usuarioRepository.findById(ins.getUsuario()).orElse(null);
            if (u == null || ins.getSecciones() == null) continue;

            List<String> seccionesUsuario = leerSecciones(ins);

            for (String seccion : seccionesUsuario) {

                if (!seccionesActivas.contains(seccion)) continue;

                String modalidad = seccion.split("-")[0];

                UsuarioInscripcionDTO dto = crearDTO(u, ins, seccion);

                if (seccion.contains("MIXTO")) {
                    mixtos.computeIfAbsent(modalidad, k -> new ArrayList<>()).add(dto);
                }
                else if (seccion.contains("MASCULINO")) {
                    masculinos.computeIfAbsent(modalidad, k -> new ArrayList<>()).add(dto);
                }
                else if (seccion.contains("FEMENINO")) {
                    femeninos.computeIfAbsent(modalidad, k -> new ArrayList<>()).add(dto);
                }
            }
        }

        // ORDEN INICIAL (no definitivo)
        InscripcionOrdenador.ordenarPorEdadYCinturon(masculinos);
        InscripcionOrdenador.ordenarPorEdadYCinturon(femeninos);
        InscripcionOrdenador.ordenarPorEdadYCinturon(mixtos);

        return new CampeonatoLiveDTO(
                cam,
                masculinos,
                femeninos,
                mixtos
        );
    }
    
    private Set<String> leerSeccionesActivas(Campeonato cam) {
    try {
        return new HashSet<>(mapper.readValue(
                cam.getSeccionesActivas(),
                new TypeReference<List<String>>() {}
        ));
    } catch (Exception e) {
        throw new RuntimeException("Error leyendo secciones del campeonato");
    }
}

private List<String> leerSecciones(Inscripciones ins) {
    try {
        return mapper.readValue(
                ins.getSecciones(),
                new TypeReference<List<String>>() {}
        );
    } catch (Exception e) {
        return List.of();
    }
}

private UsuarioInscripcionDTO crearDTO(
        Usuario u,
        Inscripciones ins,
        String seccion
) {
    UsuarioInscripcionDTO dto = new UsuarioInscripcionDTO();
    dto.setIdDocumento(u.getIdDocumento());
    dto.setNombreC(u.getNombreC());
    dto.setSexo(u.getSexo());
    dto.setFechaNacimiento(u.getFechaNacimiento());
    dto.setCinturonRango(u.getCinturonRango());
    dto.setAcademia(u.getAcademia().getNombre());
    dto.setInstructor(u.getInstructor().getNombreC());
    dto.setSecciones(List.of(seccion));
    dto.setPeso(JsonCleaner.obtenerPrimerPeso(ins.getSecciones()));
    return dto;
}
public class InscripcionOrdenador {

    private static final Map<String, Integer> ORDEN_CINTURON = Map.of(
            "BLANCO", 1,
            "AMARILLO", 2,
            "VERDE", 3,
            "AZUL", 4,
            "ROJO", 5,
            "NEGRO", 6
    );

    public static void ordenarPorEdadYCinturon(
            Map<String, List<UsuarioInscripcionDTO>> mapa
    ) {
        Comparator<UsuarioInscripcionDTO> comparador =
                Comparator
                        // 1️⃣ EDAD (dinámica)
                        .comparingInt(CampeonatoLiveMapper::calcularEdad)
                        // 2️⃣ CINTURÓN (orden lógico, no alfabético)
                        .thenComparingInt(dto ->
                                ORDEN_CINTURON.getOrDefault(
                                        dto.getCinturonRango().toUpperCase(),
                                        99
                                )
                        );

        mapa.values().forEach(lista -> lista.sort(comparador));
    }
}
private static int calcularEdad(UsuarioInscripcionDTO dto) {
        return Period.between(
                dto.getFechaNacimiento(),
                LocalDate.now()
        ).getYears();
    }
    
}
