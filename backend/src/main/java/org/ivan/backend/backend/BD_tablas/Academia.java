package org.ivan.backend.backend.BD_tablas;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "academia")
public class Academia {

    @Id
    @Column(name = "ID_academia")
    private Integer IDacademia;
    @Column(name = "nombre")
    private String nombre;
    @Column(name = "descripcion")
    private String descripcion;

    public Integer getID_academia() {
        return IDacademia;
    }

    public void setID_academia(Integer ID_academia) {
        this.IDacademia = ID_academia;
    }

    public String getNombre() {
        return nombre;
    }

    public void setNombre(String nombre) {
        this.nombre = nombre;
    }

    public String getDescripcion() {
        return descripcion;
    }

    public void setDescripcion(String descripcion) {
        this.descripcion = descripcion;
    }
}

