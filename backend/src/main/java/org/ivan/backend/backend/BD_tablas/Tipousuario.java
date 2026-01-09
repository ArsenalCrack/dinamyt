package org.ivan.backend.backend.BD_tablas;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "tipo_usuario")
public class Tipousuario {

    @Id
    @Column(name = "ID_Tipo")
    private Integer ID_Tipo;

    @Column(length = 20)
    private String descripcion;

    public String getDescripcion() {
        return descripcion;
    }

    public void setDescripcion(String descripcion) {
        this.descripcion = descripcion;
    }

    public Integer getID_Tipo() {
        return ID_Tipo;
    }

    public void setID_Tipo(Integer ID_Tipo) {
        this.ID_Tipo = ID_Tipo;
    }
}

