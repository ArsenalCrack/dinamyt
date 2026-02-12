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

    assignJudgesToTatami(championshipId: string | number, tatamiId: number, body: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/campeonatos/${championshipId}/live-management/tatamis/${tatamiId}/jueces`, body);
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
     * Assigns a section (modality) to a specific tatami.
     * Note: This might need backend support to persist the assignment if the page reloads.
     */
    assignSectionToTatami(championshipId: string | number, sectionId: string, tatamiId: number): Observable<any> {
        // We reuse updateSectionStatus but sending the tatamiId and status 'ASSIGNED' or 'BUSY'
        // Assuming backend handles this state.
        return this.updateSectionStatus(championshipId, sectionId, 'BUSY', tatamiId);
    }

    /**
     * Persist the assignment of a whole Demographic Group to a Tatami.
     * Use this when user clicks "Assign Group" in the modal.
     */
    assignGroupToTatami(championshipId: string | number, tatamiId: number, group: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/campeonatos/${championshipId}/live-management/tatamis/${tatamiId}/assign-group`, group);
    }

    /**
     * Clear the current assignment of a Tatami (Undo/Cancel).
     */
    unassignTatami(championshipId: string | number, tatamiId: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/campeonatos/${championshipId}/live-management/tatamis/${tatamiId}/assignment`);
    }

    /**
     * Submit final results/winners for a specific section.
     */
    submitSectionResults(championshipId: string | number, sectionId: string, results: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/campeonatos/${championshipId}/live-management/secciones/${sectionId}/results`, results);
    }

    /**
     * Update status of a competitor (e.g. ABSENT, DISQUALIFIED).
     */
    markCompetitorStatus(championshipId: string | number, sectionId: string, competitorId: string, status: 'ABSENT' | 'DISQUALIFIED' | 'PRESENT'): Observable<any> {
        return this.http.put(`${this.apiUrl}/campeonatos/${championshipId}/live-management/secciones/${sectionId}/competitors/${competitorId}/status`, { status });
    }
}
