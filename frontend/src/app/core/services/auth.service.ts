import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:8080/api';

  // State Management
  private isLoggedInSubject = new BehaviorSubject<boolean>(false);
  public isLoggedIn$ = this.isLoggedInSubject.asObservable();

  private usernameSubject = new BehaviorSubject<string | null>(null);
  public username$ = this.usernameSubject.asObservable();

  private rolesSubject = new BehaviorSubject<string[]>([]);
  public roles$ = this.rolesSubject.asObservable();

  public redirectUrl: string | null = null;

  constructor(private http: HttpClient) {
    this.checkLoginStatus();
  }

  // --- API Methods ---

  login(credentials: { correo: string; contrasena: string }) {
    return this.http.post(`${this.apiUrl}/login`, credentials).pipe(
      tap((res: any) => {
        if (res && res.usuario) {
          this.setLoggedIn(true, res.usuario.nombre || res.usuario.correo);
          // Store roles if available, or update later
        }
      })
    );
  }

  registrarUsuario(usuario: any) {
    return this.http.post(`${this.apiUrl}/registro`, usuario);
  }

  solicitarRecuperacion(correo: string) {
    return this.http.post(`${this.apiUrl}/recuperar-password`, { correo });
  }

  verificarCodigo(datos: any) {
    return this.http.post(`${this.apiUrl}/verificar`, datos);
  }

  reenviarCodigo(correo: string) {
    return this.http.post(`${this.apiUrl}/reenviar`, { correo });
  }

  cambiarPassword(data: any) {
    return this.http.post(`${this.apiUrl}/cambiar-password`, data);
  }

  // --- State Helpers ---

  isLoggedIn(): boolean {
    return this.isLoggedInSubject.value;
  }

  isAdminType3(): boolean {
    // Check current roles
    const roles = this.rolesSubject.value;
    if (roles.includes('administrador') || roles.includes('admin_proyecto')) return true;

    // Fallback to session storage if roles not loaded yet but type is stored
    const sessType = sessionStorage.getItem('tipo_usuario');
    return sessType === '3';
  }

  // --- State Management Methods ---

  setRoles(roles: string[]) {
    this.rolesSubject.next(roles);
  }

  refreshFromSession() {
    this.checkLoginStatus();
  }

  setLoggedIn(status: boolean, username: string | null, roles: string[] = []) {
    this.isLoggedInSubject.next(status);
    this.usernameSubject.next(username);
    this.rolesSubject.next(roles);
  }

  checkLoginStatus() {
    // Basic check from storage - can be refined
    const idDoc = sessionStorage.getItem('ID_documento') || sessionStorage.getItem('idDocumento');
    const storedUser = localStorage.getItem('usuario');

    if (idDoc || storedUser) {
      this.isLoggedInSubject.next(true);
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          const user = parsed.usuario || parsed;
          this.usernameSubject.next(user.nombreC || user.nombre || user.correo);
          // Roles would need to be extracted or passed, for now empty
        } catch (e) { }
      }
    } else {
      this.isLoggedInSubject.next(false);
      this.usernameSubject.next(null);
    }
  }
}
