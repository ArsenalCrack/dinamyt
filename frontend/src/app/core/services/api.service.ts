import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { UserService } from './user.service';
import { AcademyService } from './academy.service';
import { ChampionshipService } from './championship.service';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = 'http://localhost:8080/api';

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private user: UserService,
    private academy: AcademyService,
    private championship: ChampionshipService
  ) { }

  getSaludo(): Observable<any> {
    // Keep internal general wrapper or move to GeneralService if desired
    return this.http.get(`${this.apiUrl}/saludo`);
  }

  // --- Auth Delegates ---
  login(credentials: { correo: string; contrasena: string }) { return this.auth.login(credentials); }
  registrarUsuario(usuario: any) { return this.auth.registrarUsuario(usuario); }
  solicitarRecuperacion(correo: string) { return this.auth.solicitarRecuperacion(correo); }
  verificarCodigo(datos: any) { return this.auth.verificarCodigo(datos); }
  reenviarCodigo(correo: string) { return this.auth.reenviarCodigo(correo); }
  cambiarPassword(data: any) { return this.auth.cambiarPassword(data); }

  // --- User Delegates ---
  getCurrentUser(user: any) { return this.user.getCurrentUser(user); }
  setTempEmail(email: string) { this.user.setTempEmail(email); }
  updateProfile(data: any) { return this.user.updateProfile(data); }
  uploadProfilePhoto(file: File) { return this.user.uploadProfilePhoto(file); }
  searchUsers(query: string, excluirId: string) { return this.user.searchUsers(query, excluirId); }

  // --- Academy Delegates ---
  cargaracademias() { return this.academy.cargaracademias(); }
  createAcademy(data: any) { return this.academy.createAcademy(data); }
  cargarinstructor(academia: number, idInstructor: string) { return this.academy.cargarinstructor(academia, idInstructor); }
  registrarseEnAcademia(payload: any) { return this.academy.registrarseEnAcademia(payload); }
  crearAcademia(payload: any) { return this.academy.crearAcademia(payload); }
  getMiAcademia(userId: string) { return this.academy.getMiAcademia(userId); }
  getDetallesAcademiaOwner(userId: string) { return this.academy.getDetallesAcademiaOwner(userId); }
  gestionarInscripcion(idSolicitud: string, estado: 'aceptado' | 'rechazado') { return this.academy.gestionarInscripcion(idSolicitud, estado); }
  getMiembrosAcademia(idAcademia: string, tipo: 'estudiantes' | 'instructores') { return this.academy.getMiembrosAcademia(idAcademia, tipo); }
  getInscripcionesAcademia(idAcademia: string) { return this.academy.getInscripcionesAcademia(idAcademia); }
  eliminarMiembro(idAcademia: string, idUsuario: string) { return this.academy.eliminarMiembro(idAcademia, idUsuario); }
  updateAcademia(idAcademia: string, payload: any) { return this.academy.updateAcademia(idAcademia, payload); }

  // --- Championship Delegates ---
  getCinturones() { return this.championship.getCinturones(); }
  crearCampeonato(payload: any) { return this.championship.crearCampeonato(payload); }
  getCampeonatos() { return this.championship.getCampeonatos(); }
  validarCodigoCampeonato(id: number, codigo: string) { return this.championship.validarCodigoCampeonato(id, codigo); }
  getMisCampeonatos(userId: string) { return this.championship.getMisCampeonatos(userId); }
  getCampeonatoById(id: string | number) { return this.championship.getCampeonatoById(id); }
  updateCampeonato(id: string | number, payload: any) { return this.championship.updateCampeonato(id, payload); }
  deleteCampeonato(id: string | number) { return this.championship.deleteCampeonato(id); }
  getJuecesByCampeonato(campeonatoId: string | number) { return this.championship.getJuecesByCampeonato(campeonatoId); }
  inscribirUsuarioCampeonato(payload: any) { return this.championship.inscribirUsuarioCampeonato(payload); }
  getMisInscripciones(userId: string | number) { return this.championship.getMisInscripciones(userId); }
  eliminarInscripcion(inscriptionId: string | number) { return this.championship.eliminarInscripcion(inscriptionId); }
  getMisInvitaciones(userId: string | number) { return this.championship.getMisInvitaciones(userId); }
  responderInvitacion(invitationId: string | number, estado: string) { return this.championship.responderInvitacion(invitationId, estado); }
  enviarInvitacion(payload: any) { return this.championship.enviarInvitacion(payload); }
  getLiveManagement(id: string | number) { return this.championship.getLiveManagement(id); }
  getInscriptionsByChampionship(id: string | number) { return this.championship.getInscriptionsByChampionship(id); }
  getInvitationsByChampionship(id: string | number) { return this.championship.getInvitationsByChampionship(id); }

}
