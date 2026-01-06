//echo por Andres Gonzalez 1077294332
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
    Usuario guardado;

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
        guardado= usuario;
        guardado.setCodigo(codigo);
        return ResponseEntity.ok("");
    }
    @PostMapping("/verificar")
    private ResponseEntity<?>  Verificar(@RequestBody Usuario CodigoRecibido){
        System.out.println(guardado.getCodigo());
        System.out.println(CodigoRecibido.getCodigo());
        if (guardado.getCodigo().equals(CodigoRecibido.getCodigo())){
            usuarioRepository.save(guardado);
            return ResponseEntity.ok(Map.of("message", "correcto"));
        }
        return ResponseEntity.badRequest().body(Map.of("message", "❌ El codigo no coincide ❌"));
    }
    @PostMapping("/reenviar")
    private ResponseEntity<?> ReenviarCodigo (){
        guardado.setCodigo(GenerarCodigo());
        emailService.enviarCodigo(guardado.getCorreo(), guardado.getCodigo());
        return ResponseEntity.ok(Map.of("message", "reenviado"));
    }
    @PostMapping("recuperar-password")
    private ResponseEntity<?> VerificarCorreo(@RequestBody Usuario correo){
        if (usuarioRepository.existsByCorreo(correo.getCorreo())){
            guardado=usuarioRepository.findByCorreo((correo.getCorreo()));
            guardado.setCodigo(GenerarCodigo());
            emailService.enviarCodigo(guardado.getCorreo(), guardado.getCodigo());
            return ResponseEntity.ok(Map.of("message", "Correo verificado"));
        }else{
            return ResponseEntity.badRequest().body(Map.of("message", "❌ Correo no registrado"));
        }
    }
    @PostMapping("/cambiar-password")
    private ResponseEntity<?> CambiarContraseña(@RequestBody Usuario datos){
        guardado=usuarioRepository.findByCorreo((datos.getCorreo()));
        if (guardado!=null){
            guardado.setContrasena(datos.getContrasena());
            usuarioRepository.save(guardado);
            return ResponseEntity.ok(Map.of("message", "Contraseña Actualizada"));
        }else{
            return ResponseEntity.badRequest().body(Map.of("message", "Error"));
        }
    }
}