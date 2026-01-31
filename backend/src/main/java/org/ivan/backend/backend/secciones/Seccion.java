package org.ivan.backend.backend.secciones;

public class Seccion {

    private String PESO;       // "20-30" o null
    private String EDAD;       // "16-25" o null
    private String CINTURON;   // "Verde" o "Blanco-Naranja" o null
    private String GENERO;     // "Hombre", "Mujer", "Mixto" o null
    private String MODALIDAD;  // "Combates", etc.
    private String RAIZ;
    private String ID;

    // getters y setters

    public String getPESO() {
        return PESO;
    }

    public void setPESO(String PESO) {
        this.PESO = PESO;
    }

    public String getEDAD() {
        return EDAD;
    }

    public void setEDAD(String EDAD) {
        this.EDAD = EDAD;
    }

    public String getCINTURON() {
        return CINTURON;
    }

    public void setCINTURON(String CINTURON) {
        this.CINTURON = CINTURON;
    }

    public String getGENERO() {
        return GENERO;
    }

    public void setGENERO(String GENERO) {
        this.GENERO = GENERO;
    }

    public String getMODALIDAD() {
        return MODALIDAD;
    }

    public void setMODALIDAD(String MODALIDAD) {
        this.MODALIDAD = MODALIDAD;
    }

    public String getRAIZ() {
        return RAIZ;
    }

    public void setRAIZ(String RAIZ) {
        this.RAIZ = RAIZ;
    }

    public String getID() {
        return ID;
    }

    public void setID(String ID) {
        this.ID = ID;
    }
}


