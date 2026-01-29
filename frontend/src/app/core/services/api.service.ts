import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = 'http://localhost:8080/api';

  constructor(private http: HttpClient) { }

  getSaludo(): Observable<any> {
    return this.http.get(`${this.apiUrl}/saludo`);
  }

  getCurrentUser(user: any) {
    return this.http.post(`${this.apiUrl}/me`, user);
  }

  setTempEmail(email: string) {
    localStorage.setItem('temp_email', email);
  }

  login(credentials: { correo: string; contrasena: string }) {
    return this.http.post(`${this.apiUrl}/login`, credentials);
  }

  registrarUsuario(usuario: any) {
    return this.http.post(`${this.apiUrl}/registro`, usuario);
  }

  solicitarRecuperacion(correo: string) {
    // Ajusta la URL según tu backend
    return this.http.post(`${this.apiUrl}/recuperar-password`, { correo });
  }

  verificarCodigo(datos: any) {
    // Enviamos el código. El backend probablemente espera un objeto JSON.
    // Ajusta la estructura { codigo: codigo } según lo que espere tu Java.
    return this.http.post(`${this.apiUrl}/verificar`, datos);
  }

  reenviarCodigo(correo: string) {
    return this.http.post(`${this.apiUrl}/reenviar`, { correo });
  }

  cambiarPassword(data: any) {
    return this.http.post(`${this.apiUrl}/cambiar-password`, data);
  }

  // Actualizar datos de perfil (parcial)
  updateProfile(data: any) {
    // Ajusta la ruta según tu backend (PUT o PATCH)
    return this.http.put(`${this.apiUrl}/perfil`, data);
  }

  // Subir foto de perfil
  uploadProfilePhoto(file: File) {
    const form = new FormData();
    form.append('foto', file);
    return this.http.post(`${this.apiUrl}/perfil/foto`, form);
  }

  cargaracademias(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/academias`);
  }

  cargarinstructor(academia: number, idInstructor: string): Observable<any[]> {
    return this.http.post<any[]>(`${this.apiUrl}/instructores?academia=${academia}&idInstructor=${idInstructor}`, null);
  }


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

  // --- Módulo Academia ---

  // Registro de estudiante/instructor en una academia existente
  registrarseEnAcademia(payload: { idAcademia: string, idInstructor: string, userId: string }) {
    return this.http.post(`${this.apiUrl}/academia/unirse`, payload);
  }

  // Creación de nueva academia (Dueño)
  crearAcademia(payload: any) {
    return this.http.post(`${this.apiUrl}/academia/crear`, payload);
  }

  // Obtener detalles de mi academia (para todos los roles)
  getMiAcademia(userId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/academia/mi-academia/${userId}`);
  }

  // Gestión de dueño (Mi Dashboard)
  getDetallesAcademiaOwner(userId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/academia/owner-dashboard/${userId}`);
  }

  // Aceptar/Rechazar inscripciones
  gestionarInscripcion(idSolicitud: string, estado: 'aceptado' | 'rechazado') {
    return this.http.post(`${this.apiUrl}/academia/solicitudes/${idSolicitud}`, { estado });
  }

  // Obtener listas de miembros
  getMiembrosAcademia(idAcademia: string, tipo: 'estudiantes' | 'instructores') {
    return this.http.get<any[]>(`${this.apiUrl}/academia/${idAcademia}/${tipo}`);
  }

  // Obtener solicitudes de inscripción (pendientes)
  getInscripcionesAcademia(idAcademia: string) {
    return this.http.get<any[]>(`${this.apiUrl}/academia/${idAcademia}/solicitudes`);
  }

  // Eliminar miembro
  eliminarMiembro(idAcademia: string, idUsuario: string) {
    return this.http.delete(`${this.apiUrl}/academia/${idAcademia}/miembros/${idUsuario}`);
  }

  // Actualizar academia
  updateAcademia(idAcademia: string, payload: any) {
    return this.http.put(`${this.apiUrl}/academia/${idAcademia}`, payload);
  }

  deleteCampeonato(id: string | number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/campeonatos/${id}`);
  }

    // Judge management
  searchUsers(query: string, excluirId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/usuarios/search/${query}`, {params: {excluirId}
    });
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

  eliminarInscripcion(inscriptionId: string | number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/inscripciones/${inscriptionId}`);
  }

  getMisInvitaciones(userId: string | number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/invitaciones/usuario/${userId}`);
  }

  // responderInvitacion: estado can be 'ACEPTADO', 'RECHAZADO', 'CANCELADO'
  responderInvitacion(invitationId: string | number, estado: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/invitaciones/${invitationId}`, { estado });
  }
}
