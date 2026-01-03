package org.ivan.backend.backend.controladores;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class controlador_prueba {
    @GetMapping("/")
    public String prueba(){
        return "hola";
    }
}
