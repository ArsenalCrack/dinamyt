//echo por Andres Gonzalez 1077294332
package org.ivan.backend.backend.controladores;

import org.ivan.backend.backend.BD_tablas.*;
import org.ivan.backend.backend.EmailService;
import org.ivan.backend.backend.repositorios.AcademiaRepository;
import org.ivan.backend.backend.repositorios.CampeonatoRepository;
import org.ivan.backend.backend.repositorios.UsuarioRepository;
import org.ivan.backend.backend.secciones.ArbolBuilder;
import org.ivan.backend.backend.secciones.ArbolCampeonato;

import org.ivan.backend.backend.secciones.NodoArbol;
import org.ivan.backend.backend.secciones.TipoNodo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api") // 1. Cambiamos la ruta base a "/api"
public class controlador_principal {

    @Autowired
    private EmailService emailService;

    private final UsuarioRepository usuarioRepository;
    private final AcademiaRepository academiaRepository;
    private final CampeonatoRepository campeonatoRepository;
    private final Map<String, Usuario> usuariosPendientes = new HashMap<>();

    private controlador_principal(UsuarioRepository usuarioRepository, AcademiaRepository academiaRepository,
            CampeonatoRepository campeonatoRepository) {
        this.usuarioRepository = usuarioRepository;
        this.academiaRepository = academiaRepository;
        this.campeonatoRepository = campeonatoRepository;
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
    private ResponseEntity<?> CambiarContraseña(@RequestBody Usuario datos) {
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

    /*
     * @PostMapping("/academias/crear")
     * private ResponseEntity<?> crearAcademia(@RequestBody Map<String, Object>
     * data) {
     * try {
     * // Extract ownerId flexibly (Integer or String)
     * Object ownerIdObj = data.get("ownerId");
     * if (ownerIdObj == null)
     * return ResponseEntity.badRequest().body(Map.of("message",
     * "Owner ID requerido"));
     * 
     * Long ownerId;
     * if (ownerIdObj instanceof Number) {
     * ownerId = ((Number) ownerIdObj).longValue();
     * } else {
     * try {
     * ownerId = Long.parseLong(ownerIdObj.toString());
     * } catch (NumberFormatException e) {
     * return ResponseEntity.badRequest().body(Map.of("message",
     * "Formato de ID invalido"));
     * }
     * }
     * 
     * Usuario owner = usuarioRepository.findById(ownerId).orElse(null);
     * if (owner == null)
     * return ResponseEntity.badRequest().body(Map.of("message",
     * "Usuario no encontrado"));
     * 
     * // Create Academy
     * Academia academia = new Academia();
     * academia.setNombre((String) data.get("nombre"));
     * academia.setDescripcion((String) data.get("descripcion"));
     * academia.setDireccion((String) data.get("direccion"));
     * academia.setNumeroContacto((String) data.get("numeroContacto"));
     * academia.setLinkRedSocial((String) data.get("linkRedSocial"));
     * academia.setPais((String) data.get("pais"));
     * academia.setCiudad((String) data.get("ciudad"));
     * 
     * // Assuming ID is auto-generated?
     * // The Entity uses @Id but NOT @GeneratedValue.
     * // Check if user expects us to generate ID or if it's auto-increment in DB?
     * // Usually we should Generate ID if not auto. The other method uses
     * // GenerarCodigo() but that returns string.
     * // Academy ID is Integer. Let's try simple random if no auto-gen provided, OR
     * // hope DB is auto_increment.
     * // But relying on hope is bad. The 'Campeonato' uses GenerarCodigo (int 6
     * // chars).
     * // Let's use a random int for now if ID is null.
     * academia.setID_academia((int) (Math.random() * 900000) + 100000);
     * 
     * academiaRepository.save(academia);
     * 
     * // Assign Academy to Owner
     * owner.setAcademia(academia);
     * usuarioRepository.save(owner);
     * 
     * return ResponseEntity.ok(Map.of("message", "Academia creada exitosamente",
     * "academia", academia));
     * } catch (Exception e) {
     * e.printStackTrace();
     * return ResponseEntity.status(500).body(Map.of("message",
     * "Error al crear academia"));
     * }
     * }
     */

    @GetMapping("/academias")
    private ResponseEntity<?> academiass() {
        List<Academia> academias = academiaRepository.findAll();
        if (academias != null) {
            return ResponseEntity.ok(academias);
        }
        return ResponseEntity.badRequest().body(Map.of("message", "Error"));
    }

    @PostMapping("/instructores")
    private ResponseEntity<?> instructores(@RequestParam int academia, @RequestParam String idInstructor) {
        // AJUSTA "Instructor" según tu BD
        List<Usuario> instructores = usuarioRepository.findByAcademia_IDacademiaAndTipousuario_IDTipoAndIdDocumentoNot(
                academia, 2, Long.parseLong(idInstructor));
        if (instructores.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Sin instructores"));
        }

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
        List<Campeonato> campeonatos = campeonatoRepository.findByVisibleTrue();
        return ResponseEntity.ok(campeonatos);
    }

    @GetMapping("/campeonatos/mis/{userId}")
    private ResponseEntity<?> cargarCampeonatosMios(
            @PathVariable String userId) {

        List<Campeonato> campeonatos = campeonatoRepository.findByCreadoPor(Long.parseLong(userId));
        return ResponseEntity.ok(campeonatos);
    }

    @GetMapping("/campeonatos/{id}")
    private ResponseEntity<?> cargarCampeonatoporid(
            @PathVariable String id) {

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

    @GetMapping("/usuarios/search/{query}")
    private ResponseEntity<?> buscarUsuarios(@PathVariable String query, @RequestParam String excluirId) {
        List<Usuario> usuarios = usuarioRepository.findByNombreCContainingIgnoreCaseAndEstadoAndIdDocumentoNot(query,
                true, Long.parseLong(excluirId));
        if (usuarios != null) {
            return ResponseEntity.ok(usuarios);
        }
        return ResponseEntity.status(500).body(Map.of("message", "Usuario no encontrado"));
    }

}