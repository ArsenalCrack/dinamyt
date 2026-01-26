package org.ivan.backend.backend.BD_tablas;


import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;


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

    @Column(name = "ciudad", length = 100)
    private String ciudad;

    @Column(name = "Correo", length = 120)
    private String correo;

    @Column(name = "Contraseña", length = 255)
    private String contrasena;

    @Column(name = "numero_celular", length = 30)
    private String numeroCelular;

    //relaciones con las tablas
    @ManyToOne
    @JoinColumn(name = "Instructor", referencedColumnName = "ID_documento")
    private Usuario Instructor;

    @ManyToOne
    @JoinColumn(name = "academia", referencedColumnName = "ID_academia")
    private Academia academia;

    @ManyToOne
    @JoinColumn(name = "TipoUsuario", referencedColumnName = "ID_Tipo")
    private Tipousuario tipousuario;


    // ===== CAMPOS TRANSIENTES =====
    @Transient
    private String codigo;

    @Transient
    private LocalDateTime fechaCodigo;

    @Transient
    private String modo;
    // ===== GETTERS & SETTERS =====

    public String getCiudad() {
        return ciudad;
    }

    public void setCiudad(String ciudad) {
        this.ciudad = ciudad;
    }

    public Tipousuario getTipousuario() {
        return tipousuario;
    }

    public void setTipousuario(Tipousuario tipousuario) {
        this.tipousuario = tipousuario;
    }

    public Usuario getInstructor() {
        return Instructor;
    }

    public void setInstructor(Usuario instructor) {
        Instructor = instructor;
    }

    public Academia getAcademia() {
        return academia;
    }

    public void setAcademia(Academia academia) {
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