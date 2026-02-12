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

        // Iterate over ALL known section IDs (from competitors) to build potential groups
        competitorMap.forEach((_, sectionId) => {
            // Regex extraction to handle ranges correctly (avoid splitting by - inside brackets)
            const ageMatch = sectionId.match(/EDAD\((.*?)\)/);
            const weightMatch = sectionId.match(/PESO\((.*?)\)/);

            const rawAge = ageMatch ? ageMatch[1] : 'N/A';
            const rawWeight = weightMatch ? weightMatch[1] : 'N/A';

            // Format ranges: 4_9 -> 4-9
            const edadDisplay = rawAge.replace(/_/g, '-');
            const pesoDisplay = rawWeight.replace(/_/g, '-');

            // Remove Age and Weight from string to process the rest
            // We replace with empty string, then cleanup consecutive hyphens
            let remainder = sectionId
                .replace(/EDAD\(.*?\)/, '')
                .replace(/PESO\(.*?\)/, '')
                .replace(/-+$/, '') // trim trailing dash
                .replace(/--+/g, '-'); // collapse dashes

            const parts = remainder.split('-').filter(p => p.trim().length > 0);

            if (parts.length < 2) return;

            const rawModality = parts[0];
            const rawGender = parts[1];
            // Gender format
            const gender = rawGender ? rawGender.replace(/_/g, ' ') : 'General';

            let modalityType = 'GENERAL';
            // Determine if it is a Jump group which needs separation
            if (rawModality.includes('SALTO_ALTO') || rawModality.includes('SALTO ALTO')) modalityType = 'SALTO_ALTO';
            else if (rawModality.includes('SALTO_LARGO') || rawModality.includes('SALTO LARGO')) modalityType = 'SALTO_LARGO';

            // Belt is the rest
            const beltParts = parts.slice(2);
            const beltPart = beltParts.length > 0 ? beltParts.join('-') : 'General';
            // Clean belt display just in case
            const cinturonDisplay = beltPart.replace(/_/g, '-');

            // Group Key
            const groupKey = `${edadDisplay}|${pesoDisplay}|${cinturonDisplay}|${gender}|${modalityType}`;

            if (!groupsMap.has(groupKey)) {
                groupsMap.set(groupKey, {
                    id: groupKey,
                    edad: edadDisplay,
                    peso: pesoDisplay,
                    cinturon: cinturonDisplay,
                    genero: gender,
                    activeModalities: []
                });
            }

            const group = groupsMap.get(groupKey)!;
            if (!group.activeModalities.includes(sectionId)) {
                group.activeModalities.push(sectionId);
            }
        });

        // Remove groups with no active modalities
        const result = Array.from(groupsMap.values()).filter(g => g.activeModalities.length > 0);

        // Sort modalities within each group
        result.forEach(g => {
            g.activeModalities = this.sortModalities(g.activeModalities);
        });

        return result;
    }

    // Helper for Tatami Assignment Logic
    getDemographicType(group: DemographicGroup): 'SALTO_ALTO' | 'SALTO_LARGO' | 'GENERAL' {
        // Check first modality (they are grouped by type so all should match)
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
