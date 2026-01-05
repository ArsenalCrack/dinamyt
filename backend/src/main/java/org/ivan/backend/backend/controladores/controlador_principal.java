package org.ivan.backend.backend.controladores;
import org.ivan.backend.backend.EmailService;
import org.ivan.backend.backend.BD_tablas.Usuario;
import org.ivan.backend.backend.repositorios.UsuarioRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api") // 1. Cambiamos la ruta base a "/api"
public class controlador_principal {

    @Autowired
    private EmailService emailService;

    private final UsuarioRepository usuarioRepository;

    public controlador_principal(UsuarioRepository usuarioRepository) {
        this.usuarioRepository = usuarioRepository;
    }

    @GetMapping("/saludo") // 2. Ahora sí responde en "/saludo"
    public Map<String, String> prueba() {
        // 3. Devolvemos un JSON estructurado, no un texto suelto
        Map<String, String> respuesta = new HashMap<>();
        respuesta.put("estado", "Online");

        return respuesta;
    }
    @PostMapping("/registro")
    public ResponseEntity<?> crear(@RequestBody Usuario usuario){

        String codigo =generarCodigo();

        if (usuarioRepository.existsById(usuario.getIdDocumento())) {
            return ResponseEntity.badRequest().body("❌ Ya existe un usuario con ese documento");
        }
        emailService.enviarCodigo(usuario.getCorreo(), codigo);
        Usuario guardado = usuarioRepository.save(usuario);

        return ResponseEntity.ok(guardado);
    }
    private String generarCodigo() {
        return String.valueOf((int) (Math.random() * 900000) + 100000);
    }
}