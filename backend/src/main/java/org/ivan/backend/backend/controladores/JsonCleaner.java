package org.ivan.backend.backend.controladores;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.Arrays;
import org.ivan.backend.backend.secciones.ModalidadDTO;

import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public class JsonCleaner {

    private static final ObjectMapper mapper = new ObjectMapper();

    public static String limpiarDesdeObject(Object data) throws Exception {
        JsonNode root = mapper.valueToTree(data);
        JsonNode limpio = limpiar(root);
        return mapper.writeValueAsString(limpio);
    }

    private static JsonNode limpiar(JsonNode node) {

        if (node.isObject()) {
            ObjectNode obj = (ObjectNode) node;
            Iterator<Map.Entry<String, JsonNode>> iterator = obj.fields();

            while (iterator.hasNext()) {
                Map.Entry<String, JsonNode> entry = iterator.next();
                JsonNode value = limpiar(entry.getValue());

                if (value == null ||
                        value.isNull() ||
                        (value.isTextual() && value.asText().isEmpty()) ||
                        (value.isArray() && value.isEmpty()) ||
                        (value.isObject() && value.isEmpty())) {
                    iterator.remove();
                } else {
                    obj.set(entry.getKey(), value);
                }
            }
            return obj;
        }

        if (node.isArray()) {
            ArrayNode array = (ArrayNode) node;

            for (int i = array.size() - 1; i >= 0; i--) {
                JsonNode item = array.get(i);

                // 🚨 eliminar si activa = false
                if (item.has("activa") && !item.get("activa").asBoolean()) {
                    array.remove(i);
                    continue;
                }

                JsonNode cleaned = limpiar(item);

                if (cleaned == null ||
                        cleaned.isNull() ||
                        (cleaned.isObject() && cleaned.isEmpty())) {
                    array.remove(i);
                } else {
                    array.set(i, cleaned);
                }
            }
            return array;
        }


        return node;
    }
    public static List<ModalidadDTO> convertir(String json) {
        try {
            return mapper.readValue(
                    json,
                    new TypeReference<List<ModalidadDTO>>() {}
            );
        } catch (Exception e) {
            e.printStackTrace();
            return List.of();
        }
    }
    
    public static List<String> embellecerModalidades(String rawString) {
        if (rawString == null || rawString.isEmpty() || rawString.equals("[]")) {
            return new ArrayList<>();
        }

        // 1. Limpieza inicial del string JSON
        // Quitamos los corchetes [ ] y las comillas "
        String limpio = rawString.replace("[", "").replace("]", "").replace("\"", "");

        // 2. Separamos por la coma para obtener cada modalidad individual
        String[] modalidadesIndividuales = limpio.split(",");

        return Arrays.stream(modalidadesIndividuales)
            .map(String::trim) // Quitamos espacios accidentales
            .map(mod -> {
                // --- Tu lógica original de procesamiento ---
                String[] partes = mod.split("-");
                if (partes.length == 0) return "";

                // Nombre principal
                String nombre = partes[0].replace("_", " ").toLowerCase();
                if (nombre.length() > 0) {
                    nombre = nombre.substring(0, 1).toUpperCase() + nombre.substring(1);
                }

                // Regex para Edad y Peso
                String edad = extraerValor(mod, "EDAD");
                String peso = extraerValor(mod, "PESO");

                // Rangos de cinturón
                String rangos = (partes.length >= 4) ? partes[2] + "/" + partes[3] : "N/A";

                // Construcción del String
                StringBuilder sb = new StringBuilder(nombre);
                sb.append(" (").append(rangos).append(")");
                if (!edad.isEmpty()) sb.append(" - Edad: ").append(edad);
                if (!peso.isEmpty()) sb.append(" - Peso: ").append(peso).append("kg");

                return sb.toString();
            })
            .collect(Collectors.toList());
    }

    private static String extraerValor(String texto, String campo) {
        Pattern pattern = Pattern.compile(campo + "\\((.*?)\\)");
        Matcher matcher = pattern.matcher(texto);
        return matcher.find() ? matcher.group(1) : "";
    }
}
