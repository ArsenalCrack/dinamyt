/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package org.ivan.backend.backend.controladores;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 *
 * @author andre
 */
public class UsuarioInscripcionDTO {

    private Long idDocumento;
    private String nombreC;
    private String sexo;
    private LocalDate fechaNacimiento;
    private String cinturonRango;
    private String nacionalidad;
    private String ciudad;
    private String correo;
    private String numeroCelular;
    private String instructor;
    private String academia;
    private List<String> secciones;
    private long idincripcion;
    private String peso;
    private String campeonato;
    private LocalDate fecha_inicio;
    private String ciudad_campeonato;
    private String nombre_Creador;
    private Integer tipoUsuario;
    private Integer rol;
    // 🔴 ESTE ES EL ESTADO DE LA INSCRIPCIÓN
    private Integer estado;

    // 🔴 FECHA DE INSCRIPCIÓN
    private LocalDateTime fechaInscripcion;

    public Integer getRol() {
        return rol;
    }

    public void setRol(Integer rol) {
        this.rol = rol;
    }
    
    public Integer getTipoUsuario() {
        return tipoUsuario;
    }

    public void setTipoUsuario(Integer tipoUsuario) {
        this.tipoUsuario = tipoUsuario;
    }

    public String getCampeonato() {
        return campeonato;
    }

    public void setCampeonato(String campeonato) {
        this.campeonato = campeonato;
    }

    public LocalDate getFecha_inicio() {
        return fecha_inicio;
    }

    public void setFecha_inicio(LocalDate fecha_inicio) {
        this.fecha_inicio = fecha_inicio;
    }

    public String getCiudad_campeonato() {
        return ciudad_campeonato;
    }

    public void setCiudad_campeonato(String ciudad_campeonato) {
        this.ciudad_campeonato = ciudad_campeonato;
    }

    public String getNombre_Creador() {
        return nombre_Creador;
    }

    public void setNombre_Creador(String nombre_Creador) {
        this.nombre_Creador = nombre_Creador;
    }

    
    public String getPeso() {
        return peso;
    }

    public void setPeso(String peso) {
        this.peso = peso;
    }
    
    
    public java.time.LocalDateTime getFechaInscripcion() {
        return fechaInscripcion;
    }

    public void setFechaInscripcion(java.time.LocalDateTime fechaInscripcion) {
        this.fechaInscripcion = fechaInscripcion;
    }

    public List<String> getSecciones() {
        return secciones;
    }

    public long getIdincripcion() {
        return idincripcion;
    }

    // getters y setters
    public void setIdincripcion(long idincripcion) {
        this.idincripcion = idincripcion;
    }

    public void setSecciones(List<String> secciones) {
        this.secciones = secciones;
    }

    public String getAcademia() {
        return academia;
    }

    public void setAcademia(String academia) {
        this.academia = academia;
    }

    public String getInstructor() {
        return instructor;
    }

    public void setInstructor(String instructor) {
        this.instructor = instructor;
    }

    public Long getIdDocumento() {
        return idDocumento;
    }

    public void setIdDocumento(Long idDocumento) {
        this.idDocumento = idDocumento;
    }

    public String getNombreC() {
        return nombreC;
    }

    public void setNombreC(String nombreC) {
        this.nombreC = nombreC;
    }

    public String getSexo() {
        return sexo;
    }

    public void setSexo(String sexo) {
        this.sexo = sexo;
    }

    public LocalDate getFechaNacimiento() {
        return fechaNacimiento;
    }

    public void setFechaNacimiento(LocalDate fechaNacimiento) {
        this.fechaNacimiento = fechaNacimiento;
    }

    public String getCinturonRango() {
        return cinturonRango;
    }

    public void setCinturonRango(String cinturonRango) {
        this.cinturonRango = cinturonRango;
    }

    public String getNacionalidad() {
        return nacionalidad;
    }

    public void setNacionalidad(String nacionalidad) {
        this.nacionalidad = nacionalidad;
    }

    public String getCiudad() {
        return ciudad;
    }

    public void setCiudad(String ciudad) {
        this.ciudad = ciudad;
    }

    public String getCorreo() {
        return correo;
    }

    public void setCorreo(String correo) {
        this.correo = correo;
    }

    public String getNumeroCelular() {
        return numeroCelular;
    }

    public void setNumeroCelular(String numeroCelular) {
        this.numeroCelular = numeroCelular;
    }

    public Integer getEstado() {
        return estado;
    }

    public void setEstado(Integer estado) {
        this.estado = estado;
    }

}
