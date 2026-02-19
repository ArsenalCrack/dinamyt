import { Injectable } from '@angular/core';

export interface DemographicGroup {
    id: string; // Unique hash or string representation to identify the group
    edad: string;
    peso: string;
    cinturon: string;
    genero: string; // "Masculino", "Femenino", "Mixto"
    activeModalities: string[]; // List of full ID strings (e.g., "COMBATES-...") sorted by priority
}

@Injectable({
    providedIn: 'root'
})
export class LiveManagementService {

    constructor() { }

    /**
     * Processes the raw 'secciones' (rules) and 'secciones_activas' (instances)
     * to produce a list of Demographic Groups ready for contention.
     */
    /**
     * Processes the raw 'secciones' (rules) and 'secciones_activas' (instances)
     * AND the competitor map to produce a list of Demographic Groups ready for contention.
     */
    processSecciones(
        seccionesRules: any[],
        seccionesActivas: string[],
        competitorMap: Map<string, any[]>
    ): DemographicGroup[] {
        // seccionesActivas (from backend) appears to be the whitelist of ALL valid sections, NOT just "Running" ones.

        const groupsMap = new Map<string, DemographicGroup>();

        // Iterate over ALL active sections to ensure they appear even if no competitors are mapped
        seccionesActivas.forEach(sectionId => {
            // Regex extraction to handle ranges correctly (avoid splitting by - inside brackets)
            const ageMatch = sectionId.match(/EDAD\((.*?)\)/);
            const weightMatch = sectionId.match(/PESO\((.*?)\)/);

            const rawAge = ageMatch ? ageMatch[1] : 'N/A';
            const rawWeight = weightMatch ? weightMatch[1] : 'N/A';

            // Formatear rangos: 4_9 -> 4-9
            const edadDisplay = rawAge.replace(/_/g, '-');
            const pesoDisplay = rawWeight.replace(/_/g, '-');

            // Remover Edad y Peso del string para procesar el resto
            let remainder = sectionId
                .replace(/EDAD\(.*?\)/, '')
                .replace(/PESO\(.*?\)/, '')
                .replace(/-+$/, '') // limpiar guión final
                .replace(/--+/g, '-'); // colapsar guiones

            const parts = remainder.split('-').filter(p => p.trim().length > 0);

            if (parts.length < 2) return;

            const rawModality = parts[0];
            const rawGender = parts[1];
            // Formato de género
            const gender = rawGender ? rawGender.replace(/_/g, ' ') : 'General';

            const isCombat = rawModality.toUpperCase().includes('COMBATE') || rawModality.toUpperCase().includes('KUMITE');

            let modalityType = 'GENERAL';
            // Determinar si es un grupo de salto que necesita separación
            if (rawModality.includes('SALTO_ALTO') || rawModality.includes('SALTO ALTO')) modalityType = 'SALTO_ALTO';
            else if (rawModality.includes('SALTO_LARGO') || rawModality.includes('SALTO LARGO')) modalityType = 'SALTO_LARGO';

            // Cinturón es el resto
            const beltParts = parts.slice(2);
            const beltPart = beltParts.length > 0 ? beltParts.join('-') : 'General';
            const cinturonDisplay = beltPart.replace(/_/g, '-');

            // CLAVE DEL GRUPO
            // Regla Usuario:
            // 1. NO COMBATE: "no importa si es mixto, femenino o masculino... entrarán en el mismo".
            //    -> Unificamos el género en la clave para agruparlos.
            // 2. COMBATE: "así tengan la misma edad/cinturón... pueden cambiarlo de tatami por genero".
            //    -> Mantenemos el género en la clave para mantenerlos separados y asignables a distintos tatamis.

            let genderKey = gender;
            let displayGender = gender;

            if (!isCombat) {
                genderKey = 'Unificado'; // Todos los géneros al mismo grupo
                displayGender = 'Mixto/Unificado';
            }

            // Nota: El usuario mencionó "cambiar por peso" en combate. El peso ya es parte de la clave, 
            // así que ya están separados por peso.

            // Clave única
            const groupKey = `${edadDisplay}|${pesoDisplay}|${cinturonDisplay}|${genderKey}|${modalityType}`;

            if (!groupsMap.has(groupKey)) {
                groupsMap.set(groupKey, {
                    id: groupKey,
                    edad: edadDisplay,
                    peso: pesoDisplay,
                    cinturon: cinturonDisplay,
                    genero: displayGender,
                    activeModalities: []
                });
            }

            const group = groupsMap.get(groupKey)!;

            // Si es un grupo unificado, actualizamos el label de género si encontramos variación
            if (!isCombat && group.genero !== 'Mixto/Unificado' && group.genero !== gender) {
                group.genero = 'Mixto/Unificado';
            }

            if (!group.activeModalities.includes(sectionId)) {
                group.activeModalities.push(sectionId);
            }
        });

        // Remover grupos sin modalidades activas
        const result = Array.from(groupsMap.values()).filter(g => g.activeModalities.length > 0);

        // Ordenar modalidades dentro de cada grupo
        result.forEach(g => {
            g.activeModalities = this.sortModalities(g.activeModalities);
        });

        return result;
    }

    // Helper para lógica de asignación de tatamis
    getDemographicType(group: DemographicGroup): 'SALTO_ALTO' | 'SALTO_LARGO' | 'GENERAL' {
        // Verificar primera modalidad (están agrupadas por tipo, todas deberían coincidir)
        if (group.activeModalities.length === 0) return 'GENERAL';
        const id = group.activeModalities[0].toUpperCase();

        if (id.includes('SALTO_ALTO') || id.includes('SALTO ALTO')) return 'SALTO_ALTO';
        if (id.includes('SALTO_LARGO') || id.includes('SALTO LARGO')) return 'SALTO_LARGO';
        return 'GENERAL';
    }

    /**
     * Helper to parse 'secciones' JSON safely
     */
    parseSecciones(jsonStringOrObj: any): any[] {
        if (typeof jsonStringOrObj === 'string') {
            try {
                return JSON.parse(jsonStringOrObj);
            } catch (e) {
                console.error('Error parsing secciones JSON', e);
                return [];
            }
        }
        return Array.isArray(jsonStringOrObj) ? jsonStringOrObj : [];
    }

    parseSeccionesActivas(jsonStringOrObj: any): string[] {
        if (typeof jsonStringOrObj === 'string') {
            try {
                return JSON.parse(jsonStringOrObj);
            } catch (e) {
                console.error('Error parsing secciones activas JSON', e);
                return [];
            }
        }
        return Array.isArray(jsonStringOrObj) ? jsonStringOrObj : [];
    }

    getModalitiesForSection(activeModalities: string[]): string[] {
        return this.sortModalities(activeModalities);
    }

    private sortModalities(modalities: string[]): string[] {
        // Priority:
        // 1. Figuras / Manos Libres
        // 2. Figuras con Armas
        // 3. Defensa Personal
        // 4. Salto / Otras
        // 5. Combates (Last)

        const getPriority = (mod: string): number => {
            const m = mod.toUpperCase();
            if (m.includes('MANOS_LIBRES') || m.includes('MANOS LIBRES')) return 1;
            if (m.includes('CON_ARMAS') || m.includes('CON ARMAS')) return 2;
            if (m.includes('DEFENSA') || m.includes('DEFENSA_PERSONAL')) return 3;
            if (m.includes('SALTO')) return 4;
            if (m.includes('COMBATE') || m.includes('KUMITE')) return 5;
            return 4.5; // Other
        };

        return [...modalities].sort((a, b) => getPriority(a) - getPriority(b));
    }

    formatDemographicName(group: DemographicGroup): string {
        const firstModality = group.activeModalities.length > 0
            ? group.activeModalities[0].split('-')[0].replace(/_/g, ' ')
            : 'Grupo';

        return `${firstModality} | ${group.genero} • ${group.cinturon} • ${group.edad} años • ${group.peso} kg`;
    }
}
