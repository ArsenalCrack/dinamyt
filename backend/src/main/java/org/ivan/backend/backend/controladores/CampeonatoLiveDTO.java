/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package org.ivan.backend.backend.controladores;

/**
 *
 * @author andre
 */
import org.ivan.backend.backend.BD_tablas.Campeonato;
import java.util.List;
import java.util.Map;

public class CampeonatoLiveDTO {

    private Campeonato campeonato;

    // modalidad -> lista de usuarios
    private Map<String, List<UsuarioInscripcionDTO>> individualesMasculinos;
    private Map<String, List<UsuarioInscripcionDTO>> individualesFemeninos;
    private Map<String, List<UsuarioInscripcionDTO>> mixtos;

    public CampeonatoLiveDTO() {
    }

    public CampeonatoLiveDTO(
            Campeonato campeonato,
            Map<String, List<UsuarioInscripcionDTO>> individualesMasculinos,
            Map<String, List<UsuarioInscripcionDTO>> individualesFemeninos,
            Map<String, List<UsuarioInscripcionDTO>> mixtos
    ) {
        this.campeonato = campeonato;
        this.individualesMasculinos = individualesMasculinos;
        this.individualesFemeninos = individualesFemeninos;
        this.mixtos = mixtos;
    }

    public Campeonato getCampeonato() {
        return campeonato;
    }

    public void setCampeonato(Campeonato campeonato) {
        this.campeonato = campeonato;
    }

    public Map<String, List<UsuarioInscripcionDTO>> getIndividualesMasculinos() {
        return individualesMasculinos;
    }

    public void setIndividualesMasculinos(Map<String, List<UsuarioInscripcionDTO>> individualesMasculinos) {
        this.individualesMasculinos = individualesMasculinos;
    }

    public Map<String, List<UsuarioInscripcionDTO>> getIndividualesFemeninos() {
        return individualesFemeninos;
    }

    public void setIndividualesFemeninos(Map<String, List<UsuarioInscripcionDTO>> individualesFemeninos) {
        this.individualesFemeninos = individualesFemeninos;
    }

    public Map<String, List<UsuarioInscripcionDTO>> getMixtos() {
        return mixtos;
    }

    public void setMixtos(Map<String, List<UsuarioInscripcionDTO>> mixtos) {
        this.mixtos = mixtos;
    }
}
