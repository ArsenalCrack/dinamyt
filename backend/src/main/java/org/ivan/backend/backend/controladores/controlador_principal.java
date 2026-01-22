//echo por Andres Gonzalez 1077294332
package org.ivan.backend.backend.controladores;

import org.ivan.backend.backend.BD_tablas.*;
import org.ivan.backend.backend.EmailService;
import org.ivan.backend.backend.repositorios.AcademiaRepository;
import org.ivan.backend.backend.repositorios.CampeonatoRepository;
import org.ivan.backend.backend.repositorios.UsuarioRepository;
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

    public controlador_principal(UsuarioRepository usuarioRepository, AcademiaRepository academiaRepository,
            CampeonatoRepository campeonatoRepository) {
        this.usuarioRepository = usuarioRepository;
        this.academiaRepository = academiaRepository;
        this.campeonatoRepository = campeonatoRepository;
    }

    private String GenerarCodigo() {
        return String.valueOf((int) (Math.random() * 900000) + 100000);
    }

    @GetMapping("/saludo") // 2. Ahora sí responde en "/saludo"
    public Map<String, String> Prueba() {
        // 3. Devolvemos un JSON estructurado, no un texto suelto
        Map<String, String> respuesta = new HashMap<>();
        respuesta.put("estado", "Online");

        return respuesta;
    }

    @PostMapping("/registro")
    public ResponseEntity<?> Crear(@RequestBody Usuario usuario) {

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
        System.out.println("a: " + datos.getCorreo());
        Usuario pendiente4 = usuarioRepository.findByCorreo((datos.getCorreo()));
        if (pendiente4 != null) {
            System.out.println("a");
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
            System.out.println(instructor);
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
        System.out.println("a" + respuesta);
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
    private ResponseEntity<?> instructores(@RequestBody int idAcademia) {

        // AJUSTA "Instructor" según tu BD
        List<Usuario> instructores = usuarioRepository.findByAcademia_IDacademiaAndTipousuario_IDTipo(idAcademia, 2);
        System.out.println("id academia" + idAcademia);
        System.out.println(instructores);
        if (instructores.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Sin instructores"));
        }

        return ResponseEntity.ok(instructores);
    }

    @PutMapping("/perfil")
    private ResponseEntity<?> actualizar_datos(@RequestBody Usuario datos) {
        if (datos.getCorreo() == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "Sin instructores"));
        }
        System.out.println(datos.getNumeroCelular() + "  " + datos.getCinturonRango());
        Usuario usuario = usuarioRepository.findByCorreo(datos.getCorreo());
        Usuario instructor = usuarioRepository.findById(Long.parseLong(datos.getModo()))
                .orElseThrow(() -> new RuntimeException("Instructor no encontrado"));
        Academia academia = academiaRepository.findById(Integer.parseInt(datos.getModo()))
                .orElseThrow(() -> new RuntimeException("Instructor no encontrado"));
        usuario.setCorreo(datos.getCorreo());
        usuario.setNumeroCelular(datos.getNumeroCelular());
        usuario.setCinturonRango(datos.getCinturonRango());
        usuario.setAcademia(academia);
        usuario.setInstructor(instructor);
        usuarioRepository.save(usuario);
        return ResponseEntity.ok(datos);
    }

    @PostMapping("/campeonatos")
    public ResponseEntity<?> crear(@RequestBody Map<String, Object> datos) {
        try {
            Campeonato campeonato = new Campeonato();

            campeonato.setNombre((String) datos.get("nombre"));
            campeonato.setUbicacion((String) datos.get("ubicacion"));
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
                ObjectMapper mapper = new ObjectMapper();
                String modalidadesJson = mapper.writeValueAsString(datos.get("modalidades"));
                campeonato.setModalidades(modalidadesJson);
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
            return ResponseEntity.status(500).body(
                    Map.of("message", "Error al crear el campeonato"));
        }
    }

    @GetMapping("/campeonatos")
    private ResponseEntity<?> cargarcampeonatos() {
        List<Campeonato> campeonatos = campeonatoRepository.findAll();
        return ResponseEntity.ok(campeonatos);
    }

    @GetMapping("/campeonatos/mis/{userId}")
    public ResponseEntity<?> cargarCampeonatosMios(
            @PathVariable String userId) {

        List<Campeonato> campeonatos = campeonatoRepository.findByCreadoPor(Long.parseLong(userId));

        System.out.println("campeonatos: " + campeonatos);
        return ResponseEntity.ok(campeonatos);
    }

}