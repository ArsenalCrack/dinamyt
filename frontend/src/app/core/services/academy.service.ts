import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class AcademyService {
    private apiUrl = 'http://localhost:8080/api';

    constructor(private http: HttpClient) { }

    cargaracademias(): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/academias`);
    }

    // Deprecated usage in original API? kept for compatibility if needed.
    // Original had "createAcademy" (singular) and "crearAcademia" (Spanish)
    // I will check usages later, but for now safe to include both if distinct.
    // createAcademy calls /academias/crear
    // crearAcademia calls /academia/crear
    // Wait, these are different endpoints in the text I read!
    // One is /academias/crear (plural) - line 70
    // One is /academia/crear (singular) - line 115
    // I must keep both or consolidate if they are duplicated. The USER added /academias/crear recently.

    createAcademy(data: any) {
        // Current active endpoint for MyAcademyComponent
        return this.http.post(`${this.apiUrl}/academias/crear`, data);
    }

    cargarinstructor(academia: number, idInstructor: string): Observable<any[]> {
        return this.http.post<any[]>(`${this.apiUrl}/instructores?academia=${academia}&idInstructor=${idInstructor}`, null);
    }

    registrarseEnAcademia(payload: { idAcademia: string, idInstructor: string, userId: string }) {
        return this.http.post(`${this.apiUrl}/academia/unirse`, payload);
    }

    crearAcademia(payload: any) {
        // Legacy or alternative endpoint?
        return this.http.post(`${this.apiUrl}/academia/crear`, payload);
    }

    getMiAcademia(userId: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/academia/mi-academia/${userId}`);
    }

    getDetallesAcademiaOwner(userId: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/academia/owner-dashboard/${userId}`);
    }

    gestionarInscripcion(idSolicitud: string, estado: 'aceptado' | 'rechazado') {
        return this.http.post(`${this.apiUrl}/academia/solicitudes/${idSolicitud}`, { estado });
    }

    getMiembrosAcademia(idAcademia: string, tipo: 'estudiantes' | 'instructores') {
        return this.http.get<any[]>(`${this.apiUrl}/academia/${idAcademia}/${tipo}`);
    }

    getInscripcionesAcademia(idAcademia: string) {
        return this.http.get<any[]>(`${this.apiUrl}/academia/${idAcademia}/solicitudes`);
    }

    eliminarMiembro(idAcademia: string, idUsuario: string) {
        return this.http.delete(`${this.apiUrl}/academia/${idAcademia}/miembros/${idUsuario}`);
    }

    updateAcademia(idAcademia: string, payload: any) {
        return this.http.put(`${this.apiUrl}/academia/${idAcademia}`, payload);
    }
}
