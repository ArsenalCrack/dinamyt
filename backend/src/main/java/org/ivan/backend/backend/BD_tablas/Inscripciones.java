package org.ivan.backend.backend.BD_tablas;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "inscripciones")
public class Inscripciones {

    // ===== PK =====
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "idinscripcion")
    private Long idInscripcion;

    // ===== RELACIONES =====

    @Column(name = "idusuario")
    private Long usuario;

    @Column(name = "idcampeonato")
    private Long campeonato;

    // ===== DATOS DE INSCRIPCIÓN =====

    @Column(name = "secciones", columnDefinition = "TEXT")
    private String secciones; // JSON o lista separada por coma

    @Column(name = "tipousuario")
    private Integer tipousuario; // JSON con IDs de sección

    @Column(name = "fecha_inscripcion")
    private LocalDateTime fechaInscripcion;

    @Column(name = "estado")
    private Integer estado;

    // ===== GETTERS & SETTERS =====

    public Long getIdInscripcion() {
        return idInscripcion;
    }

    public void setIdInscripcion(Long idInscripcion) {
        this.idInscripcion = idInscripcion;
    }

    public Long getUsuario() {
        return usuario;
    }

    public void setUsuario(Long usuario) {
        this.usuario = usuario;
    }

    public Long getCampeonato() {
        return campeonato;
    }

    public void setCampeonato(Long campeonato) {
        this.campeonato = campeonato;
    }

    public String getSecciones() {
        return secciones;
    }

    public void setSecciones(String secciones) {
        this.secciones = secciones;
    }

    public Integer getTipousuario() {
        return tipousuario;
    }

    public void setTipousuario(Integer tipousuario) {
        this.tipousuario = tipousuario;
    }

    public LocalDateTime getFechaInscripcion() {
        return fechaInscripcion;
    }

    public void setFechaInscripcion(LocalDateTime fechaInscripcion) {
        this.fechaInscripcion = fechaInscripcion;
    }

    public Integer isEstado() {
        return estado;
    }

    public void setEstado(Integer estado) {
        this.estado = estado;
    }
}
