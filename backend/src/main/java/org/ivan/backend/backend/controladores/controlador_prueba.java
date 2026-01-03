package org.ivan.backend.backend.controladores;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api") // 1. Cambiamos la ruta base a "/api"
public class controlador_prueba {

    @GetMapping("/saludo") // 2. Ahora sí responde en "/saludo"
    public Map<String, String> prueba() {
        // 3. Devolvemos un JSON estructurado, no un texto suelto
        Map<String, String> respuesta = new HashMap<>();
        respuesta.put("estado", "Online");
        respuesta.put("mensaje", "Backend funcionando correctamente 🥋");

        return respuesta;
    }
}