package org.ivan.backend.backend.BD_tablas;

import jakarta.persistence.*;
import java.time.LocalDate;

@Entity
@Table(name = "usuario")
public class Usuario {

    @Id
    @Column(name = "ID_documento")
    protected long idDocumento;

    @Column(name = "nombreC", length = 150)
    protected String nombreC;

    @Column(length = 20)
    protected String sexo;

    @Column(name = "fecha_nacimiento")
    protected LocalDate fechaNacimiento;

    @Column(name = "cinturon_rango", length = 20)
    protected String cinturonRango;

    @Column(length = 20)
    protected String nacionalidad;

    @Column(name = "Correo", length = 120)
    protected String correo;

    @Column(name = "Contraseña", length = 255)
    protected String contrasena;

    @Column(name = "numero_celular")
    protected Integer numeroCelular;

    @Column(name = "verificacion")
    protected String codigo;

    // ===== GETTERS & SETTERS =====


    public String getCodigo() {
        return codigo;
    }

    public void setCodigo(String codigo) {
        this.codigo = codigo;
    }

    public void setIdDocumento(long idDocumento) {
        this.idDocumento = idDocumento;
    }

    public long getIdDocumento() {
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

    public String getCorreo() {
        return correo;
    }

    public void setCorreo(String correo) {
        this.correo = correo;
    }

    public String getContrasena() {
        return contrasena;
    }

    public void setContrasena(String contrasena) {
        this.contrasena = contrasena;
    }

    public Integer getNumeroCelular() {
        return numeroCelular;
    }

    public void setNumeroCelular(Integer numeroCelular) {
        this.numeroCelular = numeroCelular;
    }
}
