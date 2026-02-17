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


    // TODO: Endpoint no implementado en backend
    createAcademy(data: any) {
        // Endpoint activo para MyAcademyComponent
        return this.http.post(`${this.apiUrl}/academias/crear`, data);
    }

    cargarinstructor(academia: number, idInstructor: string): Observable<any[]> {
        return this.http.post<any[]>(`${this.apiUrl}/instructores?academia=${academia}&idInstructor=${idInstructor}`, null);
    }

    // TODO: Endpoint no implementado en backend
    registrarseEnAcademia(payload: { idAcademia: string, idInstructor: string, userId: string }) {
        return this.http.post(`${this.apiUrl}/academia/unirse`, payload);
    }

    // TODO: Endpoint no implementado en backend
    crearAcademia(payload: any) {
        // Endpoint alternativo o legacy
        return this.http.post(`${this.apiUrl}/academia/crear`, payload);
    }

    // TODO: Endpoint no implementado en backend
    getMiAcademia(userId: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/academia/mi-academia/${userId}`);
    }

    // TODO: Endpoint no implementado en backend
    getDetallesAcademiaOwner(userId: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/academia/owner-dashboard/${userId}`);
    }

    // TODO: Endpoint no implementado en backend
    gestionarInscripcion(idSolicitud: string, estado: 'aceptado' | 'rechazado') {
        return this.http.post(`${this.apiUrl}/academia/solicitudes/${idSolicitud}`, { estado });
    }

    // TODO: Endpoint no implementado en backend
    getMiembrosAcademia(idAcademia: string, tipo: 'estudiantes' | 'instructores') {
        return this.http.get<any[]>(`${this.apiUrl}/academia/${idAcademia}/${tipo}`);
    }

    // TODO: Endpoint no implementado en backend
    getInscripcionesAcademia(idAcademia: string) {
        return this.http.get<any[]>(`${this.apiUrl}/academia/${idAcademia}/solicitudes`);
    }

    // TODO: Endpoint no implementado en backend
    eliminarMiembro(idAcademia: string, idUsuario: string) {
        return this.http.delete(`${this.apiUrl}/academia/${idAcademia}/miembros/${idUsuario}`);
    }

    // TODO: Endpoint no implementado en backend
    updateAcademia(idAcademia: string, payload: any) {
        return this.http.put(`${this.apiUrl}/academia/${idAcademia}`, payload);
    }
}
