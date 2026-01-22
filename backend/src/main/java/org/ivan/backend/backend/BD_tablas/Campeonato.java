package org.ivan.backend.backend.BD_tablas;

import jakarta.persistence.*;

import java.time.LocalDate;

@Entity
@Table(name = "campeonato")
public class Campeonato {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_campeonato")
    private Long idCampeonato;

    private String nombre;
    private String ubicacion;
    private String alcance;

    @Column(name = "num_tatamis")
    private Integer numTatamis;

    @Column(name = "max_participantes")
    private Integer maxParticipantes;

    @Column(name = "es_publico")
    private Boolean esPublico;

    @Column(name = "creado_por")
    private Long creadoPor;

    @Column(columnDefinition = "json")
    private String modalidades;

    @Column(name = "fecha_inicio")
    private LocalDate fechaInicio;

    @Column(name = "fecha_fin")
    private LocalDate fecha_fin;

    @Column(name = "estado")
    private String estado;

    @Column(name = "participantes")
    private Integer participantes;

    @Column(name = "puede_inscribirse")
    private Boolean puedeInscribirse;

    @Column(name = "nombre_creador")
    private String nombre_creador;

    @Column(name = "Codigo")
    private String Codigo;

    @Transient
    public Integer getCuposDisponibles() {
        if (maxParticipantes == null || participantes == null)
            return null;
        return maxParticipantes - participantes;
    }

    // getters y setters

    public String getNombre_creador() {
        return nombre_creador;
    }

    public void setNombre_creador(String nombre_creador) {
        this.nombre_creador = nombre_creador;
    }

    public String getCodigo() {
        return Codigo;
    }

    public void setCodigo(String codigo) {
        Codigo = codigo;
    }

    public String getNombreCreador() {
        return nombre_creador;
    }

    public void setNombreCreador(String nombreCreador) {
        nombre_creador = nombreCreador;
    }

    public Long getIdCampeonato() {
        return idCampeonato;
    }

    public void setIdCampeonato(Long idCampeonato) {
        this.idCampeonato = idCampeonato;
    }

    public String getNombre() {
        return nombre;
    }

    public void setNombre(String nombre) {
        this.nombre = nombre;
    }

    public String getUbicacion() {
        return ubicacion;
    }

    public void setUbicacion(String ubicacion) {
        this.ubicacion = ubicacion;
    }

    public String getAlcance() {
        return alcance;
    }

    public void setAlcance(String alcance) {
        this.alcance = alcance;
    }

    public Integer getNumTatamis() {
        return numTatamis;
    }

    public void setNumTatamis(Integer numTatamis) {
        this.numTatamis = numTatamis;
    }

    public Integer getMaxParticipantes() {
        return maxParticipantes;
    }

    public void setMaxParticipantes(Integer maxParticipantes) {
        this.maxParticipantes = maxParticipantes;
    }

    public Boolean getEsPublico() {
        return esPublico;
    }

    public void setEsPublico(Boolean esPublico) {
        this.esPublico = esPublico;
    }

    public Long getCreadoPor() {
        return creadoPor;
    }

    public void setCreadoPor(Long creadoPor) {
        this.creadoPor = creadoPor;
    }

    public String getModalidades() {
        return modalidades;
    }

    public void setModalidades(String modalidades) {
        this.modalidades = modalidades;
    }

    public LocalDate getFechaInicio() {
        return fechaInicio;
    }

    public void setFechaInicio(LocalDate fechaInicio) {
        this.fechaInicio = fechaInicio;
    }

    public String getEstado() {
        return estado;
    }

    public void setEstado(String estado) {
        this.estado = estado;
    }

    public Integer getParticipantes() {
        return participantes;
    }

    public void setParticipantes(Integer participantes) {
        this.participantes = participantes;
    }

    public Boolean getPuedeInscribirse() {
        return puedeInscribirse;
    }

    public void setPuedeInscribirse(Boolean puedeInscribirse) {
        this.puedeInscribirse = puedeInscribirse;
    }

    public LocalDate getFecha_fin() {
        return fecha_fin;
    }

    public void setFecha_fin(LocalDate fecha_fin) {
        this.fecha_fin = fecha_fin;
    }
}
