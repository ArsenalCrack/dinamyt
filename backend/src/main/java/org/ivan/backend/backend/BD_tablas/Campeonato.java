package org.ivan.backend.backend.BD_tablas;

import jakarta.persistence.*;

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

    // getters y setters

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
}

