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
  registrarUsuario(usuario: any) {
  return this.http.post(
    'http://localhost:8080/api/registro',
    usuario
  );
  }


  solicitarRecuperacion(correo: string) {
    // Ajusta la URL según tu backend
    return this.http.post(`${this.apiUrl}/recuperar-password`, { correo });
  }

  verificarCodigo(codigo: string) {
    // Enviamos el código. El backend probablemente espera un objeto JSON.
    // Ajusta la estructura { codigo: codigo } según lo que espere tu Java.
    return this.http.post(`${this.apiUrl}/verificar`, { codigo });
  }

  reenviarCodigo(correo: string) {
    return this.http.post(`${this.apiUrl}/reenviar`, { correo });
  }

  cambiarPassword(data: any) {
  return this.http.post(`${this.apiUrl}/cambiar-password`, data);
}
}
