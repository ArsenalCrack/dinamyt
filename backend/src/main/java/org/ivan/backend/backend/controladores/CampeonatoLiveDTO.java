package org.ivan.backend.backend.controladores;

import org.ivan.backend.backend.BD_tablas.Campeonato;
import java.util.List;
import java.util.Map;

public class CampeonatoLiveDTO {

    private Campeonato campeonato;

    // modalidad -> seccion -> lista usuarios
    private Map<String, Map<String, List<UsuarioInscripcionDTO>>> individualesMasculinos;
    private Map<String, Map<String, List<UsuarioInscripcionDTO>>> individualesFemeninos;
    private Map<String, Map<String, List<UsuarioInscripcionDTO>>> mixtos;

    public CampeonatoLiveDTO() {
    }

    public CampeonatoLiveDTO(
            Campeonato campeonato,
            Map<String, Map<String, List<UsuarioInscripcionDTO>>> individualesMasculinos,
            Map<String, Map<String, List<UsuarioInscripcionDTO>>> individualesFemeninos,
            Map<String, Map<String, List<UsuarioInscripcionDTO>>> mixtos
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

    public Map<String, Map<String, List<UsuarioInscripcionDTO>>> getIndividualesMasculinos() {
        return individualesMasculinos;
    }

    public void setIndividualesMasculinos(
            Map<String, Map<String, List<UsuarioInscripcionDTO>>> individualesMasculinos) {
        this.individualesMasculinos = individualesMasculinos;
    }

    public Map<String, Map<String, List<UsuarioInscripcionDTO>>> getIndividualesFemeninos() {
        return individualesFemeninos;
    }

    public void setIndividualesFemeninos(
            Map<String, Map<String, List<UsuarioInscripcionDTO>>> individualesFemeninos) {
        this.individualesFemeninos = individualesFemeninos;
    }

    public Map<String, Map<String, List<UsuarioInscripcionDTO>>> getMixtos() {
        return mixtos;
    }

    public void setMixtos(
            Map<String, Map<String, List<UsuarioInscripcionDTO>>> mixtos) {
        this.mixtos = mixtos;
    }
}