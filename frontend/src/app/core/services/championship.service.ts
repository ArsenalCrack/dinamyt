import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class ChampionshipService {
    private apiUrl = 'http://localhost:8080/api';

    constructor(private http: HttpClient) { }

    getCinturones(): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/cinturones`);
    }

    crearCampeonato(payload: any) {
        return this.http.post(`${this.apiUrl}/campeonatos`, payload);
    }

    getCampeonatos(): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/campeonatos`);
    }

    validarCodigoCampeonato(id: number, codigo: string) {
        return this.http.post(`${this.apiUrl}/campeonatos/${id}/validar-codigo`, { codigo });
    }

    getMisCampeonatos(userId: string): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/campeonatos/mis/${userId}`);
    }

    getCampeonatoById(id: string | number): Observable<any> {
        return this.http.get(`${this.apiUrl}/campeonatos/${id}`);
    }

    updateCampeonato(id: string | number, payload: any): Observable<any> {
        return this.http.put(`${this.apiUrl}/campeonatos/${id}`, payload);
    }

    deleteCampeonato(id: string | number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/campeonatos/${id}`);
    }

    getJuecesByCampeonato(campeonatoId: string | number): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/campeonatos/${campeonatoId}/jueces`);
    }

    inscribirUsuarioCampeonato(payload: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/inscripciones`, payload);
    }

    getMisInscripciones(userId: string | number): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/inscripciones/usuario/${userId}`);
    }

    // TODO: Endpoint no implementado en backend
    eliminarInscripcion(inscriptionId: string | number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/inscripciones/${inscriptionId}`);
    }

    // TODO: Endpoint no implementado en backend
    getMisInvitaciones(userId: string | number): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/invitaciones/usuario/${userId}`);
    }

    // TODO: Endpoint no implementado en backend
    responderInvitacion(invitationId: string | number, estado: string): Observable<any> {
        return this.http.put(`${this.apiUrl}/invitaciones/${invitationId}`, { estado });
    }

    deleteInvitation(invitationId: string | number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/invitaciones/${invitationId}`);
    }

    // TODO: Endpoint no implementado en backend
    enviarInvitacion(payload: { id_usuario: string, id_campeonato: string, id_tipo: number }): Observable<any> {
        return this.http.post(`${this.apiUrl}/invitaciones/enviar`, payload);
    }

    // TODO: Endpoint no implementado en backend
    getLiveManagement(id: string | number): Observable<any> {
        return this.http.get(`${this.apiUrl}/campeonatos/${id}/live-management`);
    }

    // TODO: Endpoint no implementado en backend
    getInscriptionsByChampionship(id: string | number): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/campeonatos/${id}/inscripciones`);
    }

    // TODO: Endpoint no implementado en backend
    getInvitationsByChampionship(id: string | number): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/campeonatos/${id}/invitaciones`);
    }

    updateInscriptionState(id: string | number, estado: number): Observable<any> {
        return this.http.put(`${this.apiUrl}/inscripciones/${id}`, { estado });
    }

    /**
     * Asigna jueces a un tatami específico.
     * Backend: Implementar este endpoint para recibir la lista de jueces y guardarla asociada al tatami.
     * Body esperado: { "juezCentral": id_usuario, "jueez": [id_usuario1, ...], "juezMesa": id_usuario }
     * Nota: Validar que los usuarios asignados tengan el rol correspondiente si es necesario.
     */
    asignarJuecesATatami(championshipId: string | number, tatamiId: number, body: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/campeonatos/${championshipId}/live-management/tatamis/${tatamiId}/jueces`, body);
    }

    /**
     * Obtiene los jueces pertenecientes al campeonato para ser mostrados en el buscador y asignados.
     * Backend: Buscar todos los jueces (usuarios con rol juez/juez central/etc) que estén inscritos en el campeonato.
     * Lógica clave:
     * 1. Consultar la tabla de 'inscripciones' filtrando por el id_campeonato.
     * 2. Filtrar por 'tipousuario' (o columna similar de rol en la inscripción).
     *    - Juez Central: ID 6
     *    - Juez de Mesa: ID 7
     *    - Juez Normal/De Esquina: ID 8 (o cualquier otro asignado a jueces)
     * 3. Retornar la información del usuario asociado a esa inscripción.
     *
     * Respuesta esperada: Lista de objetos usuario:
     * [
     *   {
     *     "id": "123",
     *     "nombre": "Juan Perez",
     *     "rol": "Juez Central", // O el string que corresponda según el ID (6->Juez Central, etc)
     *     "pais": "Colombia",
     *     "avatar": "url..."
     *   },
     *   ...
     * ]
     */
    obtenerJuecesDelCampeonato(championshipId: string | number): Observable<any> {
        return this.http.get(`${this.apiUrl}/campeonatos/${championshipId}/jueces-live-disponibles`);
    }

    updateSectionStatus(championshipId: string | number, sectionId: string, status: string, tatamiId?: number): Observable<any> {
        return this.http.put(`${this.apiUrl}/campeonatos/${championshipId}/live-management/secciones/${sectionId}/status`, { status, tatamiId });
    }

    updateMatchScore(championshipId: string | number, matchId: string, scores: any): Observable<any> {
        return this.http.put(`${this.apiUrl}/campeonatos/${championshipId}/live-management/matches/${matchId}/score`, scores);
    }

    // --- Specific Live Flow Methods (Semantic Wrappers) ---

    startSection(championshipId: string | number, sectionId: string): Observable<any> {
        return this.updateSectionStatus(championshipId, sectionId, 'RUNNING');
    }

    finishSection(championshipId: string | number, sectionId: string): Observable<any> {
        return this.updateSectionStatus(championshipId, sectionId, 'FINISHED');
    }

    /**
     * Asigna una sección (modalidad) a un tatami específico.
     * Nota: Esto podría necesitar soporte del backend para persistir la asignación si la página se recarga.
     */
    assignSectionToTatami(championshipId: string | number, sectionId: string, tatamiId: number): Observable<any> {
        // Reutilizamos updateSectionStatus enviando el tatamiId y estado 'OCUPADO'
        return this.updateSectionStatus(championshipId, sectionId, 'OCUPADO', tatamiId);
    }

    /**
     * Persistir la asignación de un Grupo Demográfico completo a un Tatami.. osea no solo una sección, sino varias que tienen iguales categorias.
     * Usar esto cuando el usuario hace clic en "Asignar Grupo" en el modal.
     */
    assignGroupToTatami(championshipId: string | number, tatamiId: number, group: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/campeonatos/${championshipId}/live-management/tatamis/${tatamiId}/assign-group`, group);
    }

    /**
     * Limpiar la asignación actual de un Tatami (Deshacer/Cancelar).
     */
    unassignTatami(championshipId: string | number, tatamiId: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/campeonatos/${championshipId}/live-management/tatamis/${tatamiId}/assignment`);
    }

    /**
     * Enviar resultados finales de una sección.
     * Esta acción debería hacer públicos los resultados tras la validación del administrador.
     */
    enviarResultadosSeccion(championshipId: string | number, sectionId: string, results: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/campeonatos/${championshipId}/live-management/secciones/${sectionId}/results`, results);
    }

    /**
     * Actualiza el estado de un competidor (ej. AUSENTE, DESCALIFICADO, PRESENTE).
     * Backend: Implementar endpoint para cambiar estado individual. Útil para Check-in.
     * Body esperado: { "status": "AUSENTE" | "DESCALIFICADO" | "PRESENTE" }
     */
    actualizarEstadoCompetidor(championshipId: string | number, sectionId: string, competitorId: string, status: 'AUSENTE' | 'DESCALIFICADO' | 'PRESENTE'): Observable<any> {
        return this.http.put(`${this.apiUrl}/campeonatos/${championshipId}/live-management/secciones/${sectionId}/competitors/${competitorId}/status`, { status });
    }
}
