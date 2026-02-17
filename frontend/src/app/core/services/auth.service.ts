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

  // Gestión de Estado
  private isLoggedInSubject = new BehaviorSubject<boolean>(false);
  public isLoggedIn$ = this.isLoggedInSubject.asObservable();

  private usernameSubject = new BehaviorSubject<string | null>(null);
  public username$ = this.usernameSubject.asObservable();

  private rolesSubject = new BehaviorSubject<string[]>([]);
  public roles$ = this.rolesSubject.asObservable();

  public redirectUrl: string | null = null;

  constructor(private http: HttpClient, private router: Router) {
    this.checkLoginStatus();
    // Escuchar cambios en storage para sincronizar entre pestañas
    window.addEventListener('storage', (event) => {
      if (event.key === 'usuario' || event.key === 'token') {
        this.validateSessionConsistency();
      }
    });
  }

  private validateSessionConsistency() {
    const storedUserStr = localStorage.getItem('usuario');
    const sessionEmail = sessionStorage.getItem('correo');

    // Si creo que estoy logueado (tengo correo en sesión)
    if (sessionEmail) {
      if (!storedUserStr) {
        // localStorage fue limpiado en otra pestaña -> Cerrar sesión aquí también
        this.forceLogout();
        return;
      }

      try {
        const storedUser = JSON.parse(storedUserStr);
        const storageEmail = storedUser.usuario?.correo || storedUser.correo || storedUser.email;

        // Si el usuario en localStorage es diferente al de mi sesión -> Conflicto -> Cerrar sesión
        if (storageEmail && storageEmail !== sessionEmail) {
          this.forceLogout();
        }
      } catch (e) {
        // Storage corrupto -> cerrar sesión por seguridad
        this.forceLogout();
      }
    }
  }

  forceLogout() {
    sessionStorage.clear();
    // No limpiar localStorage ya que puede ser válido para la OTRA pestaña
    this.setLoggedIn(false, null);
    this.router.navigate(['/login']);
  }

  // --- Métodos de API ---

  login(credentials: { correo: string; contrasena: string }) {
    return this.http.post(`${this.apiUrl}/login`, credentials).pipe(
      tap((res: any) => {
        if (res && res.usuario) {
          this.setLoggedIn(true, res.usuario.nombre || res.usuario.correo);
          // Guardar roles si están disponibles, o actualizar después
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

  // --- Ayudantes de Estado ---

  isLoggedIn(): boolean {
    return this.isLoggedInSubject.value;
  }

  isAdminType3(): boolean {
    // Verificar roles actuales
    const roles = this.rolesSubject.value;
    if (roles.includes('administrador') || roles.includes('admin_proyecto')) return true;

    // Respaldo en sessionStorage si los roles aún no se cargaron pero el tipo está guardado
    const sessType = sessionStorage.getItem('tipo_usuario');
    return sessType === '3';
  }

  // --- Métodos de Gestión de Estado ---

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
    // Verificación básica desde almacenamiento
    const token = sessionStorage.getItem('token') || sessionStorage.getItem('authToken');
    const idDoc = sessionStorage.getItem('ID_documento') || sessionStorage.getItem('idDocumento');
    const correoSession = sessionStorage.getItem('correo');

    // Verificar localStorage solo para poblar datos si la sesión es válida
    const storedUser = localStorage.getItem('usuario');

    // VERIFICACIÓN ESTRICTA: El usuario está logueado SOLO si hay un token de sesión o identificador específico.
    // Depender solo de storedUser (localStorage) causa sesiones "fantasma" al cerrar pestañas.
    if (token || idDoc || correoSession) {
      this.isLoggedInSubject.next(true);

      // Intentar poblar nombre de usuario desde la mejor fuente disponible
      let username = null;

      // 1. Intentar desde el objeto de usuario en localStorage
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          const user = parsed.usuario || parsed;
          username = user.nombreC || user.nombre || user.correo;
        } catch (e) { }
      }

      // 2. Respaldo desde sessionStorage
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
