import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
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

  constructor(private http: HttpClient, private router: Router) {
    this.checkLoginStatus();
    // Listen for storage changes to sync across tabs
    window.addEventListener('storage', (event) => {
      if (event.key === 'usuario' || event.key === 'token') {
        this.validateSessionConsistency();
      }
    });
  }

  private validateSessionConsistency() {
    const storedUserStr = localStorage.getItem('usuario');
    const sessionEmail = sessionStorage.getItem('correo');

    // If I think I'm logged in (have session email)
    if (sessionEmail) {
      if (!storedUserStr) {
        // localStorage cleared elsewhere -> Logout here too
        this.forceLogout();
        return;
      }

      try {
        const storedUser = JSON.parse(storedUserStr);
        const storageEmail = storedUser.usuario?.correo || storedUser.correo || storedUser.email;

        // If the user in localStorage is different from my session user -> Conflict -> Logout
        if (storageEmail && storageEmail !== sessionEmail) {
          this.forceLogout();
        }
      } catch (e) {
        // Corrupt storage -> safety logout
        this.forceLogout();
      }
    }
  }

  forceLogout() {
    sessionStorage.clear();
    // Don't clear localStorage as it might be valid for the OTHER tab
    this.setLoggedIn(false, null);
    this.router.navigate(['/login']);
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
    // Basic check from storage
    const token = sessionStorage.getItem('token') || sessionStorage.getItem('authToken');
    const idDoc = sessionStorage.getItem('ID_documento') || sessionStorage.getItem('idDocumento');
    const correoSession = sessionStorage.getItem('correo');

    // Check localStorage just to populate data if session is valid
    const storedUser = localStorage.getItem('usuario');

    // STRICT CHECK: User is logged in ONLY if there is a session token or session-specific identifier.
    // relying on storedUser (localStorage) alone causes "ghost" sessions after closing tabs.
    if (token || idDoc || correoSession) {
      this.isLoggedInSubject.next(true);

      // Try to populate username from best available source
      let username = null;

      // 1. Try localStorage user object
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          const user = parsed.usuario || parsed;
          username = user.nombreC || user.nombre || user.correo;
        } catch (e) { }
      }

      // 2. Fallback to session storage name
      if (!username) {
        username = sessionStorage.getItem('nombreC') || correoSession;
      }

      this.usernameSubject.next(username);

      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          const user = parsed.usuario || parsed;
          const storageEmail = user.correo || user.email;

          if (correoSession && storageEmail && correoSession !== storageEmail) {
            this.forceLogout();
          }
        } catch (e) { }
      }

    } else {
      this.isLoggedInSubject.next(false);
      this.usernameSubject.next(null);
    }
  }
}
