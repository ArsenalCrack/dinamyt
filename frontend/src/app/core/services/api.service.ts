import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = 'http://localhost:8080/api';

  constructor(private http: HttpClient) {}

  getSaludo(): Observable<any> {
    return this.http.get(`${this.apiUrl}/saludo`);
  }

  getCurrentUser(user: any) {
    return this.http.post(`${this.apiUrl}/me`, user);
  }

  login(credentials: { correo: string; contrasena: string }) {
    return this.http.post(`${this.apiUrl}/login`, credentials);
  }

  registrarUsuario(usuario: any) {
  return this.http.post(`${this.apiUrl}/registro`,usuario);
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

  cargaracademias(): Observable<any[]>{
    return this.http.get<any[]>(`${this.apiUrl}/academias`);
  }

  cargarinstructor(academia : any): Observable<any[]>{
    return this.http.post<any[]>(`${this.apiUrl}/instructores`, academia);
  }
}
