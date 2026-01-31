package org.ivan.backend.backend.secciones;

import java.util.ArrayList;
import java.util.List;

public class ArbolBuilder {

    public void construir(ArbolCampeonato arbol, List<ModalidadDTO> modalidades) {

        for (ModalidadDTO m : modalidades) {
            if (!m.activa) continue;

            NodoArbol nodoModalidad = new NodoArbol(m.nombre, TipoNodo.MODALIDAD);
            arbol.getRaiz().agregarHijo(nodoModalidad);

            construirGenero(nodoModalidad, m);
        }

    }

    private void construirGenero(NodoArbol padre, ModalidadDTO m) {

        List<String> generos;

        if ("mixto".equalsIgnoreCase(m.categorias.genero)) {
            generos = List.of("Mixto");
        } else {
            generos = List.of("Masculino", "Femenino");
        }

        for (String g : generos) {
            NodoArbol nodo = new NodoArbol(g, TipoNodo.GENERO);
            padre.agregarHijo(nodo);

            construirCinturon(nodo, m);
        }
    }

    private void construirCinturon(NodoArbol padre, ModalidadDTO m) {

        List<String> cinturones = expandirCategorias(m.categorias.cinturon);

        if (cinturones == null || cinturones.isEmpty()) {
            construirEdad(padre, m);
            return;
        }

        for (String c : cinturones) {
            NodoArbol nodo = new NodoArbol(c, TipoNodo.CINTURON);
            padre.agregarHijo(nodo);

            construirEdad(nodo, m);
        }
    }

    private void construirEdad(NodoArbol padre, ModalidadDTO m) {

        List<String> edades = expandirCategorias(m.categorias.edad);

        if (edades == null || edades.isEmpty()) {
            construirPeso(padre, m);
            return;
        }

        for (String e : edades) {
            NodoArbol nodo = new NodoArbol(e, TipoNodo.EDAD);
            padre.agregarHijo(nodo);

            construirPeso(nodo, m);
        }
    }

    private void construirPeso(NodoArbol padre, ModalidadDTO m) {

        List<String> pesos = expandirCategorias(m.categorias.peso);

        if (pesos == null || pesos.isEmpty()) {
            padre.agregarHijo(new NodoArbol("SIN_PESO", TipoNodo.PESO));
            return;
        }

        for (String p : pesos) {
            padre.agregarHijo(new NodoArbol(p, TipoNodo.PESO));
        }
    }


    private List<String> expandirCategorias(List<CategoriaDTO> lista) {
        if (lista == null) return List.of();

        List<String> result = new ArrayList<>();

        for (CategoriaDTO c : lista) {
            if (!c.activa) continue;

            if ("individual".equals(c.tipo)) {
                result.add(c.valor);
            } else if ("rango".equals(c.tipo)) {
                result.add(c.desde + "-" + c.hasta);
            }
        }
        return result;
    }

}

