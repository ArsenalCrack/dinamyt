//echo por Andres Gonzalez 1077294332
package org.ivan.backend.backend.controladores;

import com.fasterxml.jackson.core.JsonProcessingException;
import org.ivan.backend.backend.BD_tablas.*;
import org.ivan.backend.backend.EmailService;
import org.ivan.backend.backend.repositorios.AcademiaRepository;
import org.ivan.backend.backend.repositorios.CampeonatoRepository;
import org.ivan.backend.backend.repositorios.InscripcionRepository;
import org.ivan.backend.backend.repositorios.UsuarioRepository;
import org.ivan.backend.backend.secciones.*;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Period;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;

@RestController
@RequestMapping("/api") // 1. Cambiamos la ruta base a "/api"
public class controlador_principal {

    @Autowired
    private CampeonatoLiveMapper campeonatoLiveMapper;
    private EmailService emailService;

    private final UsuarioRepository usuarioRepository;
    private final AcademiaRepository academiaRepository;
    private final CampeonatoRepository campeonatoRepository;
    private final InscripcionRepository inscripcionRepository;
    private final Map<String, Usuario> usuariosPendientes = new HashMap<>();

    private controlador_principal(UsuarioRepository usuarioRepository, AcademiaRepository academiaRepository,
            CampeonatoRepository campeonatoRepository, InscripcionRepository inscripcionRepository) {
        this.usuarioRepository = usuarioRepository;
        this.academiaRepository = academiaRepository;
        this.campeonatoRepository = campeonatoRepository;
        this.inscripcionRepository = inscripcionRepository;
    }

    private String GenerarCodigo() {
        return String.valueOf((int) (Math.random() * 900000) + 100000);
    }

    @GetMapping("/saludo") // 2. Ahora sí responde en "/saludo"
    private Map<String, String> Prueba() {
        // 3. Devolvemos un JSON estructurado, no un texto suelto
        Map<String, String> respuesta = new HashMap<>();
        respuesta.put("estado", "Online");

        return respuesta;
    }

    // ------------------ USUARIOS ------------------
    @PostMapping("/registro")
    private ResponseEntity<?> Crear(@RequestBody Usuario usuario) {

        String codigo = GenerarCodigo();

        if (usuarioRepository.existsById(usuario.getIdDocumento())) {
            return ResponseEntity.badRequest().body(Map.of("message", "Ya existe un usuario con ese documento"));
        }
        if (usuarioRepository.existsByCorreo(usuario.getCorreo())) {
            return ResponseEntity.badRequest().body(Map.of("message", "Ya existe un usuario con ese correo"));
        }
        emailService.enviarCodigo(usuario.getCorreo(), codigo);
        usuario.setCodigo(codigo);
        usuario.setFechaCodigo(LocalDateTime.now());

        if (usuario.getTipousuario() == null) {
            Tipousuario tipo = new Tipousuario();
            tipo.setID_Tipo(1);
            usuario.setTipousuario(tipo);
        } else if (usuario.getTipousuario().getID_Tipo() == null) {
            usuario.getTipousuario().setID_Tipo(1);
        }
        Academia academia = academiaRepository.findById(0)
                .orElseThrow(() -> new RuntimeException("Campeonato no encontrado"));
        Usuario instructor = usuarioRepository.findById(0L)
                .orElseThrow(() -> new RuntimeException("Campeonato no encontrado"));
        usuario.setInstructor(instructor);
        usuario.setAcademia(academia);
        usuario.setEstado(1);
        usuariosPendientes.put(usuario.getCorreo(), usuario);
        return ResponseEntity.ok("");
    }

    @PostMapping("/verificar")
    private ResponseEntity<?> Verificar(@RequestBody Usuario datos) {
        Usuario pendiente1 = usuariosPendientes.get(datos.getCorreo());
        if (LocalDateTime.now().isAfter(pendiente1.getFechaCodigo().plusMinutes(5))) {
            pendiente1.setCodigo("*");
            return ResponseEntity.badRequest().body(Map.of("message", "El código ha vencido"));
        }
        if (pendiente1.getCodigo().equals(datos.getCodigo())) {
            if (datos.getModo().equals("register")) {
                usuarioRepository.save(pendiente1);
                usuariosPendientes.remove(datos.getCorreo());
            }
            usuariosPendientes.remove(datos.getCorreo());
            return ResponseEntity.ok(Map.of("message", "correcto"));
        }
        return ResponseEntity.badRequest().body(Map.of("message", "El codigo no coincide"));
    }

    @PostMapping("/reenviar")
    private ResponseEntity<?> ReenviarCodigo(@RequestBody Usuario datos) {
        Usuario pendiente2 = usuariosPendientes.get(datos.getCorreo());
        pendiente2.setCodigo(GenerarCodigo());
        pendiente2.setFechaCodigo(LocalDateTime.now());
        emailService.enviarCodigo(pendiente2.getCorreo(), pendiente2.getCodigo());
        return ResponseEntity.ok(Map.of("message", "reenviado"));
    }

    @PostMapping("recuperar-password")
    private ResponseEntity<?> VerificarCorreo(@RequestBody Usuario correo) {

        if (usuarioRepository.existsByCorreo(correo.getCorreo())) {
            usuariosPendientes.put(correo.getCorreo(), usuarioRepository.findByCorreo((correo.getCorreo())));
            Usuario pendiente3 = usuariosPendientes.get(correo.getCorreo());
            pendiente3.setCodigo(GenerarCodigo());
            pendiente3.setFechaCodigo(LocalDateTime.now());
            emailService.enviarCodigo(pendiente3.getCorreo(), pendiente3.getCodigo());
            return ResponseEntity.ok(Map.of("message", "Correo verificado"));
        } else {
            return ResponseEntity.badRequest().body(Map.of("message", "Correo no registrado"));
        }
    }

    @PostMapping("/cambiar-password")
    private ResponseEntity<?> CambriaContrast(@RequestBody Usuario datos) {
        Usuario pendiente4 = usuarioRepository.findByCorreo((datos.getCorreo()));
        if (pendiente4 != null) {
            if (datos.getModo().equals("recuperar")) {
                pendiente4.setContrasena(datos.getContrasena());
                usuarioRepository.save(pendiente4);
                usuariosPendientes.remove(datos.getCorreo());
                return ResponseEntity.ok(Map.of("message", "Contraseña Actualizada"));
            }
            if (datos.getModo().equals("cambiar")) {
                if (pendiente4.getContrasena().equals(datos.getContrasena())) {
                    pendiente4.setContrasena(datos.getCodigo());
                    usuarioRepository.save(pendiente4);
                    return ResponseEntity.ok(Map.of("message", "Contraseña Actualizada"));
                }
            }

        } else {
            return ResponseEntity.badRequest().body(Map.of("message", "usuario no encontrado"));
        }
        return ResponseEntity.badRequest().body(Map.of("message", "Contraseña actual incorrecta"));
    }

    @PostMapping("/login")
    private ResponseEntity<?> login(@RequestBody Usuario respuesta) {
        if (usuarioRepository.existsByCorreo(respuesta.getCorreo())) {
            Usuario pendiente3 = usuarioRepository.findByCorreo((respuesta.getCorreo()));
            Usuario instructor = pendiente3.getInstructor();
            if (pendiente3.getContrasena().equals(respuesta.getContrasena())) {
                usuariosPendientes.remove(respuesta.getCorreo());
                Map<String, Object> responseMap = new HashMap<>();
                responseMap.put("usuario", pendiente3);
                responseMap.put("instructor", instructor);
                return ResponseEntity.ok(responseMap);

            } else {
                return ResponseEntity.badRequest().body(Map.of("message", "Contraseña incorrecta"));
            }
        }
        return ResponseEntity.badRequest().body(Map.of("message", "El correo no se encuentra registrado"));
    }

    @PostMapping("/me")
    private ResponseEntity<?> me(@RequestBody(required = false) Usuario respuesta) {
        if (respuesta != null) {
            return ResponseEntity.ok(respuesta);
        }
        return ResponseEntity.badRequest().body(Map.of("message", "Error"));
    }

    @GetMapping("/academias")
    private ResponseEntity<?> academiass() {
        List<Academia> academias = academiaRepository.findAll();
        if (academias != null) {
            return ResponseEntity.ok(academias);
        }
        return ResponseEntity.badRequest().body(Map.of("message", "Error"));
    }

    @PostMapping("/instructores")
    private ResponseEntity<?> instructores(@RequestParam int academia,
            @RequestParam(required = false, defaultValue = "0") String idInstructor) {
        long idExcluir = 0;
        try {
            if (idInstructor != null && !idInstructor.trim().isEmpty()) {
                idExcluir = Long.parseLong(idInstructor);
            }
        } catch (NumberFormatException e) {
            idExcluir = 0;
        }

        List<Usuario> instructores = usuarioRepository.findByAcademia_IDacademiaAndTipousuario_IDTipoAndIdDocumentoNot(
                academia, 2, idExcluir);

        return ResponseEntity.ok(instructores);
    }

    @PutMapping("/perfil")
    private ResponseEntity<?> actualizar_datos(@RequestBody Usuario datos) {
        if (datos.getCorreo() == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "Correo es obligatorio"));
        }

        Usuario usuario = usuarioRepository.findByCorreo(datos.getCorreo());
        if (usuario == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "Usuario no encontrado"));
        }

        // Update basic fields
        usuario.setCorreo(datos.getCorreo());

        if (datos.getNumeroCelular() != null) {
            usuario.setNumeroCelular(datos.getNumeroCelular());
        }

        if (datos.getCinturonRango() != null) {
            usuario.setCinturonRango(datos.getCinturonRango());
        }

        if (datos.getCiudad() != null) {
            usuario.setCiudad(datos.getCiudad());
        }

        if (datos.getNacionalidad() != null) {
            usuario.setNacionalidad(datos.getNacionalidad());
        }

        usuarioRepository.save(usuario);
        return ResponseEntity.ok(usuario);
    }

    // ------------------ CAMPEONATOS-INVITACIONES-INSCRIPCIONES ------------------
    @PostMapping("/campeonatos")
    private ResponseEntity<?> crear(@RequestBody Map<String, Object> datos) {
        try {
            Campeonato campeonato = new Campeonato();
            campeonato.setVisible(true);
            campeonato.setNombre((String) datos.get("nombre"));
            campeonato.setUbicacion((String) datos.get("ubicacion"));
            campeonato.setPais((String) datos.get("pais"));
            campeonato.setCiudad((String) datos.get("ciudad"));
            campeonato.setAlcance((String) datos.get("alcance"));

            if (datos.get("numTatamis") != null) {
                campeonato.setNumTatamis(
                        Integer.parseInt(datos.get("numTatamis").toString()));
            }

            if (datos.get("maxParticipantes") != null) {
                campeonato.setMaxParticipantes(
                        Integer.parseInt(datos.get("maxParticipantes").toString()));
            }

            campeonato.setEsPublico(
                    datos.get("esPublico") != null &&
                            Boolean.parseBoolean(datos.get("esPublico").toString()));
            if (campeonato.getEsPublico()) {
            } else {
                campeonato.setCodigo(GenerarCodigo());
            }

            if (datos.get("creadoPor") != null) {
                campeonato.setCreadoPor(
                        Long.parseLong(datos.get("creadoPor").toString()));
                campeonato.setNombreCreador(datos.get("NombreCreador").toString());
            }

            if (datos.get("modalidades") != null) {
                String modalidadesJson = JsonCleaner.limpiarDesdeObject(datos.get("modalidades"));
                campeonato.setModalidades(modalidadesJson);

                // creamos las secciones de una
                ArbolCampeonato arbol = new ArbolCampeonato();
                ArbolBuilder builder = new ArbolBuilder();

                builder.construir(arbol, JsonCleaner.convertir(campeonato.getModalidades()));

                // 2. Obtener secciones
                List<Map<String, String>> resultado = arbol.obtenerSeccionesDetalladas();
                ObjectMapper mapper = new ObjectMapper();
                campeonato.setSecciones(mapper.writeValueAsString(resultado));
            }

            campeonato.setParticipantes(0);
            campeonato.setEstado("BORRADOR");
            campeonato.setPuedeInscribirse(true);
            if (datos.get("fechaInicio") != null) {
                campeonato.setFechaInicio(LocalDate.parse(datos.get("fechaInicio").toString()));
            }
            if (datos.get("fechaFin") != null) {
                campeonato.setFecha_fin(LocalDate.parse(datos.get("fechaFin").toString()));
            }

            campeonatoRepository.save(campeonato);

            return ResponseEntity.ok(
                    Map.of("message", "Campeonato creado correctamente"));

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of("message", "Error al crear el campeonato"));
        }
    }

    @GetMapping("/campeonatos")
    private ResponseEntity<?> cargarcampeonatos() {
        List<Campeonato> campeonatos = campeonatoRepository.findByVisibleTrueAndEstado("LISTO");
        return ResponseEntity.ok(campeonatos);
    }

    @GetMapping("/campeonatos/mis/{userId}")
    private ResponseEntity<?> cargarCampeonatosMios(@PathVariable String userId) {

        List<Campeonato> campeonatos = campeonatoRepository.findByCreadoPor(Long.parseLong(userId));
        return ResponseEntity.ok(campeonatos);
    }

    @GetMapping("/campeonatos/{id}")
    private ResponseEntity<?> cargarCampeonatoporid(@PathVariable String id) {

        Campeonato campeonato = campeonatoRepository.findById(Integer.parseInt(id))
                .orElseThrow(() -> new RuntimeException("Campeonato no encontrado"));
        return ResponseEntity.ok(campeonato);
    }

    @PostMapping("/campeonatos/{id}/validar-codigo")
    private ResponseEntity<?> validar_codigo_campeonato(@PathVariable int id, @RequestBody Map<String, Object> codigo) {

        Campeonato campeonato = campeonatoRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Campeonato no encontrado"));
        if (campeonato.getCodigo().equals(codigo.get("codigo"))) {
            return ResponseEntity.ok(campeonato);
        }
        return ResponseEntity.status(500).body(Map.of("message", "Codigo incorrecto"));
    }

    @DeleteMapping("/campeonatos/{id}")
    private ResponseEntity<?> elimiar_campeonato(@PathVariable int id) {
        Campeonato campeonato = campeonatoRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Campeonato no encontrado"));
        campeonato.setVisible(false);
        campeonatoRepository.save(campeonato);
        return ResponseEntity.badRequest().body(Map.of("message", "No se a podido eliminar el campeonato"));
    }

    @PutMapping("/campeonatos/{id}")
    private ResponseEntity<?> actualizarCampeonato(@PathVariable int id, @RequestBody Map<String, Object> datos) {
        try {
            Campeonato campeonato = campeonatoRepository.findById(id)
                    .orElseThrow(() -> new RuntimeException("Campeonato no encontrado"));
            campeonato.setVisible(true);
            campeonato.setNombre((String) datos.get("nombre"));
            campeonato.setUbicacion((String) datos.get("ubicacion"));
            campeonato.setPais((String) datos.get("pais"));
            campeonato.setCiudad((String) datos.get("ciudad"));
            campeonato.setAlcance((String) datos.get("alcance"));

            if (datos.get("numTatamis") != null) {
                campeonato.setNumTatamis(
                        Integer.parseInt(datos.get("numTatamis").toString()));
            }

            if (datos.get("maxParticipantes") != null) {
                campeonato.setMaxParticipantes(
                        Integer.parseInt(datos.get("maxParticipantes").toString()));
            }

            campeonato.setEsPublico(
                    datos.get("esPublico") != null &&
                            Boolean.parseBoolean(datos.get("esPublico").toString()));
            if (datos.get("creadoPor") != null) {
                campeonato.setCreadoPor(
                        Long.parseLong(datos.get("creadoPor").toString()));
                campeonato.setNombreCreador(datos.get("NombreCreador").toString());
            }

            if (datos.get("modalidades") != null) {
                String modalidadesJson = JsonCleaner.limpiarDesdeObject(datos.get("modalidades"));
                campeonato.setModalidades(modalidadesJson);

                // creamos las secciones de una
                ArbolCampeonato arbol = new ArbolCampeonato();
                ArbolBuilder builder = new ArbolBuilder();

                builder.construir(arbol, JsonCleaner.convertir(campeonato.getModalidades()));

                // 2. Obtener secciones
                List<Map<String, String>> resultado = arbol.obtenerSeccionesDetalladas();
                ObjectMapper mapper = new ObjectMapper();
                campeonato.setSecciones(mapper.writeValueAsString(resultado));
            }

            campeonato.setEstado("BORRADOR");
            campeonato.setPuedeInscribirse(true);
            if (datos.get("fechaInicio") != null) {
                campeonato.setFechaInicio(LocalDate.parse(datos.get("fechaInicio").toString()));
            }
            if (datos.get("fechaFin") != null) {
                campeonato.setFecha_fin(LocalDate.parse(datos.get("fechaFin").toString()));
            }

            campeonatoRepository.save(campeonato);

            return ResponseEntity.ok(
                    Map.of("message", "Campeonato creado correctamente"));

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of("message", "Error al crear el campeonato"));
        }
    }

    @GetMapping("/usuarios/search/{query}")
    private ResponseEntity<?> buscarUsuarios(@PathVariable String query, @RequestParam String excluirId,
            @RequestParam Long idCampeonato, @RequestParam Integer tipo) {
        List<Usuario> usuarios = usuarioRepository.findUsuariosDisponiblesPorCampeonato(query, 1,
                Long.parseLong(excluirId), idCampeonato, tipo);
        if (usuarios != null) {
            return ResponseEntity.ok(usuarios);
        }
        return ResponseEntity.status(500).body(Map.of("message", "Usuario no encontrado"));
    }

    @PostMapping("/inscripciones")
    private ResponseEntity<?> inscribirse(@RequestBody Map<String, Object> datos) throws Exception {
        try {
            List<String> seccionesActuales = new ArrayList<>();
            Campeonato campeonato = campeonatoRepository.findById(
                    Integer.parseInt(datos.get("campeonatoId").toString()))
                    .orElseThrow(() -> new RuntimeException("Campeonato no encontrado"));

            Usuario usuario = usuarioRepository.findById(
                    Long.parseLong(datos.get("idUsuario").toString()))
                    .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
            Integer peso = datos.get("peso") != null ? Integer.parseInt(datos.get("peso").toString()) : null;

            @SuppressWarnings("unchecked")
            List<String> modalidades = (List<String>) datos.get("modalidades");

            Map<String, Seccion> seccionesAsignadas = Inscripcion.buscarSeccionesPorModalidades(
                    campeonato.getSecciones(),
                    modalidades,
                    usuario.calcularEdad(usuario.getFechaNacimiento().toString()),
                    peso,
                    usuario.getCinturonRango(),
                    usuario.getSexo());

            if (seccionesAsignadas == null || seccionesAsignadas.isEmpty()) {
                return ResponseEntity.status(400).body(Map.of("message", "Sección adecuada no encontrada"));
            }

            ObjectMapper objectMapper = new ObjectMapper();
            List<String> nuevasIds = seccionesAsignadas.values().stream()
                    .map(Seccion::getID)
                    .toList();
            // Verificar si el usuario ya tiene inscripción en este campeonato
            Inscripciones inscripcion = inscripcionRepository
                    .findByUsuarioAndCampeonato(usuario.getIdDocumento(), campeonato.getIdCampeonato())
                    .orElseGet(Inscripciones::new);

            // Leer las secciones que ya tenía
            if (inscripcion.isVisible()) {

                if (inscripcion.getSecciones() != null && !inscripcion.getSecciones().isEmpty()) {
                    seccionesActuales = objectMapper.readValue(
                            inscripcion.getSecciones(),
                            new TypeReference<List<String>>() {
                            });

                }
            } else {
                inscripcion.setVisible(true);
            }

            // Agregar solo nuevas secciones que no tenía antes
            for (String id : nuevasIds) {
                if (!seccionesActuales.contains(id)) {
                    seccionesActuales.add(id);
                }
            }

            // Guardar en la inscripción
            inscripcion.setUsuario(usuario.getIdDocumento());
            inscripcion.setCampeonato(campeonato.getIdCampeonato());
            inscripcion.setSecciones(objectMapper.writeValueAsString(seccionesActuales));
            inscripcion.setTipousuario(5); // ajusta según tu lógica
            inscripcion.setFechaInscripcion(LocalDateTime.now());
            inscripcion.setEstado(2);
            inscripcionRepository.save(inscripcion);

            return ResponseEntity.ok(Map.of(
                    "campeonato", campeonato,
                    "inscripcion", inscripcion));
        } catch (RuntimeException e) {
            System.out.println(e.getMessage());
            return ResponseEntity.status(400).body(Map.of("message", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(400).body(Map.of("message", "Error interno del servidor"));
        }
    }

    @GetMapping("/inscripciones/usuario/{id}")
    private ResponseEntity<?> getMisInscripciones(@PathVariable Long id) {
        try {
            List<Inscripciones> inscripciones = inscripcionRepository.findByUsuarioAndVisibleTrueAndInvitadoFalse(id);
            List<Map<String, Object>> response = new ArrayList<>();
            ObjectMapper mapper = new ObjectMapper();

            for (Inscripciones inscripcion : inscripciones) {
                Map<String, Object> item = new HashMap<>();
                item.put("idInscripcion", inscripcion.getIdInscripcion());
                item.put("estado", inscripcion.getEstado());
                item.put("fechaInscripcion", inscripcion.getFechaInscripcion());

                // Obtener Campeonato
                Campeonato camp = campeonatoRepository.findById(inscripcion.getCampeonato().intValue())
                        .orElse(null);

                if (camp != null) {
                    item.put("campeonatoNombre", camp.getNombre());
                    item.put("campeonatoId", camp.getIdCampeonato());
                    item.put("ubicacion", camp.getUbicacion());

                    // Procesar secciones
                    List<String> misSeccionesIds = new ArrayList<>();
                    if (inscripcion.getSecciones() != null) {
                        misSeccionesIds = mapper.readValue(inscripcion.getSecciones(),
                                new TypeReference<List<String>>() {
                                });
                    }

                    List<Map<String, String>> detallesSecciones = new ArrayList<>();
                    if (camp.getSecciones() != null) {
                        List<Map<String, String>> todasLasSecciones = mapper.readValue(camp.getSecciones(),
                                new TypeReference<List<Map<String, String>>>() {
                                });

                        // Filtrar
                        List<String> finalMisSeccionesIds = misSeccionesIds;
                        detallesSecciones = todasLasSecciones.stream()
                                .filter(s -> finalMisSeccionesIds.contains(s.get("ID"))) // Asegurar que el ID coincida
                                                                                         // con la clave usada en el
                                                                                         // JSON
                                .toList();
                    }
                    item.put("seccionesDetalles", detallesSecciones);
                } else {
                    item.put("campeonatoNombre", "Campeonato no encontrado");
                }

                response.add(item);
            }

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of("message", "Error al obtener inscripciones"));
        }
    }

    @PostMapping("/invitaciones/enviar")
    private ResponseEntity<?> enviarinvitacion(@RequestBody Map<String, Object> datos) {
        Inscripciones inscripcion;
        if (datos.get("id_tipo").toString() == "5") {
            inscripcion = inscripcionRepository
                    .findByUsuarioAndCampeonatoAndTipousuario(Long.valueOf(datos.get("id_usuario").toString()),
                            Long.valueOf(datos.get("id_campeonato").toString()), 5)
                    .orElseGet(Inscripciones::new);
            inscripcion.setTipousuario(
                    Integer.valueOf(datos.get("id_tipo").toString()));
        } else {
            inscripcion = inscripcionRepository
                    .findInscripcionJuez(Long.valueOf(datos.get("id_usuario").toString()),
                            Long.valueOf(datos.get("id_campeonato").toString()))
                    .orElseGet(Inscripciones::new);
            inscripcion.setTipousuario(
                    Integer.valueOf(datos.get("id_tipo").toString()));
        }

        Long idUsuario = Long.valueOf(datos.get("id_usuario").toString());

        if (!usuarioRepository.existsById(idUsuario)) {
            return ResponseEntity.status(404)
                    .body(Map.of("message", "Usuario no existe"));
        }

        inscripcion.setUsuario(idUsuario);

        Integer idCampeonato = Integer.valueOf(datos.get("id_campeonato").toString());

        if (!campeonatoRepository.existsById(idCampeonato)) {
            return ResponseEntity.status(404)
                    .body(Map.of("message", "Campeonato no existe"));
        }

        inscripcion.setCampeonato(Long.valueOf(idCampeonato));

        inscripcion.setEstado(2);
        inscripcion.setInvitado(true);
        inscripcion.setVisible(true);
        inscripcion.setFechaInscripcion(LocalDateTime.now());

        inscripcionRepository.save(inscripcion);

        return ResponseEntity.ok(Map.of("message", "Inscripción creada"));

    }

    @GetMapping("/invitaciones/usuario/{userId}")
    private ResponseEntity<?> ObInvitaciones(@PathVariable Long userId) {

        List<Inscripciones> inscripciones = inscripcionRepository.findByUsuarioAndVisibleTrueAndInvitadoTrue(userId);

        if (inscripciones == null || inscripciones.isEmpty()) {
            return ResponseEntity.status(404)
                    .body(Map.of("message", "Sin invitaciones"));
        }

        List<UsuarioInscripcionDTO> respuesta = new ArrayList<>();

        for (Inscripciones ins : inscripciones) {

            UsuarioInscripcionDTO dto = new UsuarioInscripcionDTO();
            dto.setFecha_inscripcion(ins.getFechaInscripcion());
            // ===== CAMPOS OBLIGATORIOS PARA EL FRONT =====
            dto.setIdincripcion(ins.getIdInscripcion());
            dto.setEstado(ins.getEstado());
            dto.setTipoUsuario(ins.getTipousuario()); // 🔴 IMPORTANTE
            // ===========================================

            campeonatoRepository.findById(Integer.parseInt(ins.getCampeonato().toString())).ifPresent(c -> {
                dto.setIdcampeonato(c.getIdCampeonato());
                dto.setCampeonato(c.getNombre());
                dto.setFecha_inicio(c.getFechaInicio());
                dto.setCiudad_campeonato(c.getCiudad());
                usuarioRepository.findById(c.getCreadoPor()).ifPresent(creador -> {
                    dto.setNombre_Creador(creador.getNombreC());
                });
            });

            respuesta.add(dto);
        }

        return ResponseEntity.ok(respuesta);
    }

    @GetMapping("/campeonatos/{id}/inscripciones")
    private ResponseEntity<?> obinscripcionesmicampeonato(@PathVariable Long id) {

        List<UsuarioInscripcionDTO> resultado = new ArrayList<>();

        List<Inscripciones> inscripciones = inscripcionRepository
                .findByCampeonatoAndTipousuarioAndVisibleTrueAndInvitadoFalse(id, 5);

        for (Inscripciones ins : inscripciones) {

            Usuario u = usuarioRepository.findById(ins.getUsuario()).orElse(null);
            if (u == null)
                continue;

            UsuarioInscripcionDTO dto = new UsuarioInscripcionDTO();

            dto.setIdDocumento(u.getIdDocumento());
            dto.setNombreC(u.getNombreC());
            dto.setSexo(u.getSexo());
            dto.setFechaNacimiento(u.getFechaNacimiento());
            dto.setCinturonRango(u.getCinturonRango());
            dto.setNacionalidad(u.getNacionalidad());
            dto.setCiudad(u.getCiudad());
            dto.setCorreo(u.getCorreo());
            dto.setNumeroCelular(u.getNumeroCelular());
            dto.setInstructor(u.getInstructor().getNombreC());
            dto.setAcademia(u.getAcademia().getNombre());
            List<String> secciones = JsonCleaner.embellecerModalidades(ins.getSecciones());
            dto.setSecciones(secciones);
            dto.setIdincripcion(ins.getIdInscripcion());
            dto.setEstado(ins.getEstado());
            dto.setFechaInscripcion(ins.getFechaInscripcion());
            dto.setPeso(JsonCleaner.obtenerPrimerPeso(ins.getSecciones()));
            resultado.add(dto);
        }

        return ResponseEntity.ok(resultado);
    }

    @GetMapping("/campeonatos/{campeonatoId}/jueces")
    private ResponseEntity<?> objuez(@PathVariable Long campeonatoId) {
        List<Integer> tiposInteres = Arrays.asList(6, 7, 8, 10);
        List<Inscripciones> inscripciones = inscripcionRepository
                .findByCampeonatoAndTipousuarioInAndEstadoAndVisibleTrue(campeonatoId, tiposInteres, 3);
        return ResponseEntity.ok(inscripciones);
    }

    @DeleteMapping("/inscripciones/{inscriptionId}")
    private ResponseEntity<?> elimiarinscripcionpropia(@PathVariable Integer inscriptionId) {
        Inscripciones ins = inscripcionRepository.findById(inscriptionId)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
        System.out.println(ins.getEstado());
        System.out.println(ins.getEstado());
        if (ins.getEstado()==3 && ins.getTipousuario()==5) {
            Campeonato campeonato = campeonatoRepository.findById(Integer.parseInt(ins.getCampeonato().toString()))
                    .orElseThrow(() -> new RuntimeException("Campeonato no encontrado"));
            campeonato.setParticipantes(campeonato.getParticipantes()-1);
            System.out.println(campeonato.getNombre());
            campeonatoRepository.save(campeonato);
        }
        ins.setVisible(false);
        inscripcionRepository.save(ins);
        return ResponseEntity.ok(ins);
    }

    @DeleteMapping("/invitaciones/{inscriptionId}")
    private ResponseEntity<?> eliminarinvitacion(@PathVariable Integer inscriptionId) {
        Inscripciones ins = inscripcionRepository.findById(inscriptionId)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
        System.out.println(ins.getEstado());
        if (ins.getEstado()==3 && ins.getTipousuario()==5) {
            Campeonato campeonato = campeonatoRepository.findById(Integer.parseInt(ins.getCampeonato().toString()))
                    .orElseThrow(() -> new RuntimeException("Campeonato no encontrado"));
            campeonato.setParticipantes(campeonato.getParticipantes()-1);
            System.out.println(campeonato.getNombre());
            campeonatoRepository.save(campeonato);
        }
        ins.setVisible(false);
        inscripcionRepository.save(ins);
        return ResponseEntity.ok(ins);
    }

    @PutMapping("/invitaciones/{invitationId}")
    public ResponseEntity<?> respuestraainvitacion(@PathVariable Integer invitationId,
            @RequestBody Map<String, Object> estado) {
        Inscripciones ins = inscripcionRepository.findById(invitationId)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
        Campeonato campeonato = campeonatoRepository.findById(Integer.parseInt(ins.getCampeonato().toString()))
                    .orElseThrow(() -> new RuntimeException("Campeonato no encontrado"));
        ObjectMapper mapper = new ObjectMapper();
        System.out.println(invitationId + " " + estado);
        if (estado.get("estado").toString().equals("ACEPTADO")) {
            ins.setEstado(3);

            List<String> lista;

            if (ins.getSecciones() == null || ins.getSecciones().isBlank()) {
                inscripcionRepository.save(ins);
                return ResponseEntity.ok("");
            } else {
                lista = mapper.readValue(
                        ins.getSecciones(),
                        new TypeReference<List<String>>() {}
                );
            }
            List<String> actualesCampeonato = new ArrayList<>();
            if (campeonato.getSeccionesActivas() != null && !campeonato.getSeccionesActivas().isEmpty()) {
                actualesCampeonato = mapper.readValue(
                        campeonato.getSeccionesActivas(),
                        new TypeReference<List<String>>() {
                        });
            }
            for (String id : lista) {
                if (!actualesCampeonato.contains(id)) {
                    actualesCampeonato.add(id);
                }
            }

            campeonato.setSeccionesActivas(mapper.writeValueAsString(actualesCampeonato));
            campeonatoRepository.save(campeonato);
            inscripcionRepository.save(ins);
        } else {            
            if (ins.getEstado()==3 && ins.getTipousuario()==5) {
                campeonato.setParticipantes(campeonato.getParticipantes()-1);
                System.out.println(campeonato.getNombre());
                campeonatoRepository.save(campeonato);
        }
            ins.setEstado(4);
            inscripcionRepository.save(ins);
        }
        return ResponseEntity.ok("");
    }

    @PutMapping("/inscripciones/{id}")
    public ResponseEntity<?> responderinscripcion(@PathVariable Integer id, @RequestBody Map<String, Object> estado) {
        Inscripciones ins = inscripcionRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
        Campeonato campeonato = campeonatoRepository.findById(Integer.parseInt(ins.getCampeonato().toString()))
                    .orElseThrow(() -> new RuntimeException("Campeonato no encontrado"));
        ObjectMapper mapper = new ObjectMapper();
        System.out.println(id + " " + estado);
        if (estado.get("estado").toString().equals("3")) {
            ins.setEstado(3);

            List<String> lista = mapper.readValue(
                    ins.getSecciones(),
                    new TypeReference<List<String>>() {
                    });
            System.out.println(campeonato.getIdCampeonato());
            List<String> actualesCampeonato = new ArrayList<>();
            if (campeonato.getSeccionesActivas() != null && !campeonato.getSeccionesActivas().isEmpty()) {
                actualesCampeonato = mapper.readValue(
                        campeonato.getSeccionesActivas(),
                        new TypeReference<List<String>>() {
                        });
            }
            for (String id2 : lista) {
                if (!actualesCampeonato.contains(id2)) {
                    actualesCampeonato.add(id2);
                }
            }

            campeonato.setSeccionesActivas(mapper.writeValueAsString(actualesCampeonato));
            campeonato.setParticipantes(campeonato.getParticipantes()+1);
            campeonatoRepository.save(campeonato);
            inscripcionRepository.save(ins);
        } else {
            if (ins.getEstado()==3 && ins.getTipousuario()==5) {
                campeonato.setParticipantes(campeonato.getParticipantes()-1);
                System.out.println(campeonato.getNombre());
                campeonatoRepository.save(campeonato);
        }
            ins.setEstado(4);
            inscripcionRepository.save(ins);
        }
        return ResponseEntity.ok("");
    }

    @GetMapping("/campeonatos/{id}/invitaciones")
    private ResponseEntity<?> obtenerinvitacionesdelcampeonato(@PathVariable Long id) {
        List<Inscripciones> inss = inscripcionRepository.findByCampeonatoAndVisibleTrueAndInvitadoTrue(id);
        List<UsuarioInscripcionDTO> resultado = new ArrayList<>();
        for (Inscripciones ins : inss) {

            Usuario u = usuarioRepository.findById(ins.getUsuario()).orElse(null);
            if (u == null)
                continue;

            UsuarioInscripcionDTO dto = new UsuarioInscripcionDTO();

            dto.setIdincripcion(ins.getIdInscripcion());
            dto.setIdDocumento(ins.getUsuario());
            dto.setNombreC(u.getNombreC());
            dto.setCorreo(u.getCorreo());
            dto.setTipoUsuario(ins.getTipousuario());
            dto.setEstado(ins.getEstado());
            dto.setFechaInscripcion(ins.getFechaInscripcion());
            resultado.add(dto);
        }
        return ResponseEntity.ok(resultado);
    }

    @GetMapping("/campeonatos/{id}/live-management")
    private ResponseEntity<?> panelcampeonato(@PathVariable Integer id) {

        Campeonato cam = campeonatoRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Campeonato no encontrado"));

        List<Inscripciones> inscripciones = inscripcionRepository
                .findByCampeonatoAndTipousuarioAndVisibleTrueAndInvitadoFalse(
                        cam.getIdCampeonato().longValue(), 5);

        CampeonatoLiveDTO liveDTO = campeonatoLiveMapper.construirCampeonatoLive(cam, inscripciones);

        return ResponseEntity.ok(liveDTO);
    }

    @GetMapping("/campeonatos/{championshipId}/jueces-live-disponibles")
    private ResponseEntity<?> buscarjuecesactivosenelcampeonato(@PathVariable Long championshipId) {
        List<Inscripciones> jueces = inscripcionRepository.findIdcampeonatojueces(championshipId);
        List<UsuarioInscripcionDTO> LISTA = new ArrayList<>();
        for (Inscripciones i : jueces) {
            UsuarioInscripcionDTO juez = new UsuarioInscripcionDTO();
            Usuario us = usuarioRepository.findById(i.getUsuario()).orElse(null);
            juez.setIdDocumento(i.getUsuario());
            juez.setNombreC(us.getNombreC());
            juez.setRol(i.getTipousuario());
            juez.setNacionalidad(us.getNacionalidad());
            LISTA.add(juez);
        }
        if (LISTA.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Jueces no encontrados"));
        } else {
            return ResponseEntity.ok(LISTA);
        }
    }

    @PostMapping("/tatamis/{tatamiId}/jueces")
    private ResponseEntity<?> assignJudgesToTatami(@PathVariable Long championshipId, @PathVariable Long tatamiId,
            @RequestBody Map<String, Object> body) {
        System.out.println(championshipId);
        System.out.println(tatamiId);
        System.out.println(body);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/tatamis/{tatamiId}/assign-group")
    private ResponseEntity<?> assignGroupToTatami(@PathVariable Long championshipId, @PathVariable Long tatamiId,
            @RequestBody Map<String, Object> group) {
        System.out.println(championshipId);
        System.out.println(tatamiId);
        System.out.println(group);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/tatamis/{tatamiId}/assignment")
    private ResponseEntity<?> unassignTatami(@PathVariable Long championshipId, @PathVariable Long tatamiId) {
        System.out.println(championshipId);
        System.out.println(tatamiId);
        return ResponseEntity.ok().build();
    }

    // ------------------ SECCIONES ------------------

    @PutMapping("/secciones/{sectionId}/status")
    private ResponseEntity<?> updateSectionStatus(@PathVariable Long championshipId, @PathVariable String sectionId,
            @RequestBody String request) {
        System.out.println(championshipId);
        System.out.println(sectionId);
        System.out.println(request);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/secciones/{sectionId}/results")
    private ResponseEntity<?> submitSectionResults(@PathVariable Long championshipId, @PathVariable String sectionId,
            @RequestBody Object results) {
        System.out.println(championshipId);
        System.out.println(sectionId);
        System.out.println(results);
        return ResponseEntity.ok().build();
    }

    @PutMapping("/secciones/{sectionId}/competitors/{competitorId}/status")
    private ResponseEntity<?> markCompetitorStatus(@PathVariable Long championshipId, @PathVariable String sectionId,
            @PathVariable String competitorId, @RequestBody String request) {
        System.out.println(championshipId);
        System.out.println(sectionId);
        System.out.println(competitorId);
        System.out.println(request);
        return ResponseEntity.ok().build();
    }

    // ------------------ MATCHES ------------------

    @PutMapping("/matches/{matchId}/score")
    private ResponseEntity<?> updateMatchScore(@PathVariable Long championshipId, @PathVariable String matchId,
            @RequestBody Object scores) {
        System.out.println(championshipId);
        System.out.println(matchId);
        System.out.println(scores);
        return ResponseEntity.ok().build();
    }

}