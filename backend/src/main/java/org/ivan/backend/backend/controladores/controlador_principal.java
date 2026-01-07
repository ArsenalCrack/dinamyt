//echo por Andres Gonzalez 1077294332
package org.ivan.backend.backend.controladores;
import org.ivan.backend.backend.EmailService;
import org.ivan.backend.backend.BD_tablas.Usuario;
import org.ivan.backend.backend.repositorios.UsuarioRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api") // 1. Cambiamos la ruta base a "/api"
public class controlador_principal {

    @Autowired
    private EmailService emailService;

    private final UsuarioRepository usuarioRepository;
    private final Map<String, Usuario> usuariosPendientes = new HashMap<>();

    public controlador_principal(UsuarioRepository usuarioRepository) {
        this.usuarioRepository = usuarioRepository;
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
    public ResponseEntity<?> Crear(@RequestBody Usuario usuario){

        String codigo =GenerarCodigo();

        if (usuarioRepository.existsById(usuario.getIdDocumento())) {
            return ResponseEntity.badRequest().body(Map.of("message", "❌ Ya existe un usuario con ese documento"));
        }
        if (usuarioRepository.existsByCorreo(usuario.getCorreo())) {
            return ResponseEntity.badRequest().body(Map.of("message", "❌ Ya existe un usuario con ese correo"));
        }
        emailService.enviarCodigo(usuario.getCorreo(), codigo);
        usuario.setCodigo(codigo);
        usuario.setFechaCodigo(LocalDateTime.now());
        usuariosPendientes.put(usuario.getCorreo(),usuario);
        return ResponseEntity.ok("");
    }
    @PostMapping("/verificar")
    private ResponseEntity<?>  Verificar(@RequestBody Usuario datos){
        Usuario pendiente1 = usuariosPendientes.get(datos.getCorreo());
        if (LocalDateTime.now().isAfter(pendiente1.getFechaCodigo().plusMinutes(5))) {
            pendiente1.setCodigo("*");
            return ResponseEntity.badRequest().body(Map.of("message", "❌ El código ha vencido"));
        }
        if (pendiente1.getCodigo().equals(datos.getCodigo())){
            if (datos.getModo().equals("register")) {
                usuarioRepository.save(pendiente1);
                usuariosPendientes.remove(datos.getCorreo());
            }
            return ResponseEntity.ok(Map.of("message", "correcto"));
        }
        return ResponseEntity.badRequest().body(Map.of("message", "❌ El codigo no coincide ❌"));
    }
    @PostMapping("/reenviar")
    private ResponseEntity<?> ReenviarCodigo (@RequestBody Usuario datos){
        Usuario pendiente2 = usuariosPendientes.get(datos.getCorreo());
        pendiente2.setCodigo(GenerarCodigo());
        pendiente2.setFechaCodigo(LocalDateTime.now());
        emailService.enviarCodigo(pendiente2.getCorreo(), pendiente2.getCodigo());
        return ResponseEntity.ok(Map.of("message", "reenviado"));
    }
    @PostMapping("recuperar-password")
    private ResponseEntity<?> VerificarCorreo(@RequestBody Usuario correo){

        if (usuarioRepository.existsByCorreo(correo.getCorreo())){
            usuariosPendientes.put(correo.getCorreo(),usuarioRepository.findByCorreo((correo.getCorreo())));
            Usuario pendiente3 = usuariosPendientes.get(correo.getCorreo());
            pendiente3.setCodigo(GenerarCodigo());
            pendiente3.setFechaCodigo(LocalDateTime.now());
            emailService.enviarCodigo(pendiente3.getCorreo(), pendiente3.getCodigo());
            return ResponseEntity.ok(Map.of("message", "Correo verificado"));
        }else{
            return ResponseEntity.badRequest().body(Map.of("message", "❌ Correo no registrado"));
        }
    }
    @PostMapping("/cambiar-password")
    private ResponseEntity<?> CambiarContraseña(@RequestBody Usuario datos){
        Usuario pendiente4 = usuariosPendientes.get(datos.getCorreo());
        if (pendiente4!=null){
            pendiente4.setContrasena(datos.getContrasena());
            usuarioRepository.save(pendiente4);
            usuariosPendientes.remove(datos.getCorreo());
            return ResponseEntity.ok(Map.of("message", "Contraseña Actualizada"));
        }else{
            return ResponseEntity.badRequest().body(Map.of("message", "Error"));
        }
    }
    @PostMapping("/login")
    private ResponseEntity<?> login(@RequestBody Usuario respuesta){
        System.out.println(respuesta.getCorreo());
        System.out.println(respuesta.getContrasena());
        if (usuarioRepository.existsByCorreo(respuesta.getCorreo())) {
            usuariosPendientes.put(respuesta.getCorreo(), usuarioRepository.findByCorreo((respuesta.getCorreo())));
            Usuario pendiente3 = usuariosPendientes.get(respuesta.getCorreo());
            if (pendiente3.getContrasena().equals(respuesta.getContrasena())){
                return ResponseEntity.ok(Map.of("message", "Correcto"));

            }
        }
        return ResponseEntity.badRequest().body(Map.of("message", "Error"));
    }
}