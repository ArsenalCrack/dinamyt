package org.ivan.backend.backend.secciones;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class NodoArbol {

    private String nombre;
    private TipoNodo tipo;
    private NodoArbol padre;
    private List<NodoArbol> hijos = new ArrayList<>();

    public NodoArbol(String nombre, TipoNodo tipo) {
        this.nombre = nombre;
        this.tipo = tipo;
    }

    public void agregarHijo(NodoArbol hijo) {
        hijo.setPadre(this);
        hijos.add(hijo);
    }
    public Map<TipoNodo, String> obtenerDescripcion() {
        Map<TipoNodo, String> descripcion = new LinkedHashMap<>();
        NodoArbol actual = this;

        while (actual != null) {
            descripcion.put(actual.tipo, actual.nombre);
            actual = actual.padre;
        }

        return descripcion;
    }



    public String getNombre() {
        return nombre;
    }

    public TipoNodo getTipo() {
        return tipo;
    }

    public List<NodoArbol> getHijos() {
        return hijos;
    }

    public void setNombre(String nombre) {
        this.nombre = nombre;
    }

    public void setTipo(TipoNodo tipo) {
        this.tipo = tipo;
    }

    public NodoArbol getPadre() {
        return padre;
    }

    public void setPadre(NodoArbol padre) {
        this.padre = padre;
    }

    public void setHijos(List<NodoArbol> hijos) {
        this.hijos = hijos;
    }
}
