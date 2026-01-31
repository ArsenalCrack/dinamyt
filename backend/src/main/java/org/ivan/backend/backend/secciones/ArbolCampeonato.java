package org.ivan.backend.backend.secciones;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ArbolCampeonato {

    private NodoArbol raiz;

    public ArbolCampeonato() {
        this.raiz = new NodoArbol("Campeonato", TipoNodo.RAIZ);
    }

    public NodoArbol getRaiz() {
        return raiz;
    }

    public List<Map<String, String>> obtenerSeccionesDetalladas() {

        List<Map<String, String>> resultado = new ArrayList<>();
        recorrer(raiz, resultado);
        return resultado;
    }

    private void recorrer(NodoArbol nodo, List<Map<String, String>> resultado) {

        if (nodo.getHijos().isEmpty()) {
            resultado.add(crearSeccion(nodo));
            return;
        }

        for (NodoArbol hijo : nodo.getHijos()) {
            recorrer(hijo, resultado);
        }
    }
    private Map<String, String> crearSeccion(NodoArbol hoja) {

        Map<String, String> seccion = new LinkedHashMap<>();

        NodoArbol actual = hoja;

        while (actual != null) {
            seccion.put(actual.getTipo().name(), actual.getNombre());
            actual = actual.getPadre();
        }

        // ID
        String id = String.join("-",
                seccion.get("MODALIDAD"),
                seccion.get("GENERO"),
                seccion.get("CINTURON"),
                "edad(" + seccion.get("EDAD") + ")",
                "peso(" + seccion.get("PESO") + ")"
        ).toUpperCase().replace(" ", "_");

        seccion.put("ID", id);


        return seccion;
    }


}
