package org.ivan.backend.backend.BD_tablas;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "usuario")
public class Usuario {

    // ===== PK =====
    @Id
    @Column(name = "ID_documento")
    private Long idDocumento;

    // ===== DATOS BÁSICOS =====
    @Column(name = "nombreC", length = 150, nullable = false)
    private String nombreC;

    @Column(length = 20)
    private String sexo;

    @Column(name = "fecha_nacimiento")
    private LocalDate fechaNacimiento;

    @Column(name = "cinturon_rango", length = 20)
    private String cinturonRango;

    @Column(name = "Nacionalidad", length = 20)
    private String nacionalidad;

    @Column(name = "Correo", length = 120)
    private String correo;

    @Column(name = "Contraseña", length = 255)
    private String contrasena;

    @Column(name = "numero_celular", length = 30)
    private String numeroCelular;

    @Column(name = "TipoUsuario")
    private Integer tipousuario;

    @Column(name = "Instructor")
    private Integer Instructor;

    @Column(name = "academia")
    private Integer academia;

    // ===== CAMPOS TRANSIENTES =====
    @Transient
    private String codigo;

    @Transient
    private LocalDateTime fechaCodigo;

    @Transient
    private String modo;

    @Transient
    private String nombreInstructor;

    @Transient
    private String nombreacademia;

    // ===== GETTERS & SETTERS =====


    public String getNombreInstructor() {
        return nombreInstructor;
    }

    public void setNombreInstructor(String nombreInstructor) {
        this.nombreInstructor = nombreInstructor;
    }

    public String getNombreacademia() {
        return nombreacademia;
    }

    public void setNombreacademia(String nombreacademia) {
        this.nombreacademia = nombreacademia;
    }

    public Integer getTipousuario() {
        return tipousuario;
    }

    public void setTipousuario(Integer tipousuario) {
        this.tipousuario = tipousuario;
    }

    public Integer getInstructor() {
        return Instructor;
    }

    public void setInstructor(Integer instructor) {
        Instructor = instructor;
    }

    public Integer getAcademia() {
        return academia;
    }

    public void setAcademia(Integer academia) {
        this.academia = academia;
    }

    public LocalDateTime getFechaCodigo() {
        return fechaCodigo;
    }

    public void setFechaCodigo(LocalDateTime fechaCodigo) {
        this.fechaCodigo = fechaCodigo;
    }

    public String getModo() {
        return modo;
    }

    public void setModo(String modo) {
        this.modo = modo;
    }

    public String getCodigo() {
        return codigo;
    }

    public void setCodigo(String codigo) {
        this.codigo = codigo;
    }

    public String getNumeroCelular() {
        return numeroCelular;
    }

    public void setNumeroCelular(String numeroCelular) {
        this.numeroCelular = numeroCelular;
    }

    public String getContrasena() {
        return contrasena;
    }

    public void setContrasena(String contrasena) {
        this.contrasena = contrasena;
    }

    public String getCorreo() {
        return correo;
    }

    public void setCorreo(String correo) {
        this.correo = correo;
    }

    public String getNacionalidad() {
        return nacionalidad;
    }

    public void setNacionalidad(String nacionalidad) {
        this.nacionalidad = nacionalidad;
    }

    public String getCinturonRango() {
        return cinturonRango;
    }

    public void setCinturonRango(String cinturonRango) {
        this.cinturonRango = cinturonRango;
    }

    public LocalDate getFechaNacimiento() {
        return fechaNacimiento;
    }

    public void setFechaNacimiento(LocalDate fechaNacimiento) {
        this.fechaNacimiento = fechaNacimiento;
    }

    public String getSexo() {
        return sexo;
    }

    public void setSexo(String sexo) {
        this.sexo = sexo;
    }

    public String getNombreC() {
        return nombreC;
    }

    public void setNombreC(String nombreC) {
        this.nombreC = nombreC;
    }

    public Long getIdDocumento() {
        return idDocumento;
    }

    public void setIdDocumento(Long idDocumento) {
        this.idDocumento = idDocumento;
    }
}

