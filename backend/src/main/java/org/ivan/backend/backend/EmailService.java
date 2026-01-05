/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package org.ivan.backend.backend;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/**
 *
 * @author andre
 */
@Service
public class EmailService {

    @Autowired
    private JavaMailSender mailSender;

    public void enviarCodigo(String correo, String codigo) {

        SimpleMailMessage mensaje = new SimpleMailMessage();


        mensaje.setTo(correo);
        mensaje.setSubject("Verificación de cuenta - DidaMartials");


        String cuerpoMensaje = "¡Bienvenido a DidaMartials!\n\n" +
                "Gracias por registrarte en nuestra plataforma de gestión de artes marciales.\n" +
                "Para completar tu registro y verificar tu identidad, por favor utiliza el siguiente código de seguridad:\n\n" +
                "--------------------------------\n" +
                "   CÓDIGO: " + codigo + "\n" +
                "--------------------------------\n\n" +
                "Si no has solicitado este código, por favor ignora este mensaje o contacta a soporte.\n\n" +
                "Atentamente,\n" +
                "El equipo de DidaMartials\n" +
                "Administración y Seguridad";

        mensaje.setText(cuerpoMensaje);

        mailSender.send(mensaje);
    }
}