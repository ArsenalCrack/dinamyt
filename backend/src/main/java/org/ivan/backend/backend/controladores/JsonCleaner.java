package org.ivan.backend.backend.controladores;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Iterator;
import java.util.Map;

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
}
