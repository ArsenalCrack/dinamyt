import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _username = new BehaviorSubject<string | null>(this.readUsername());
  private _isLoggedIn = new BehaviorSubject<boolean>(this.computeLoggedIn());

  readonly username$ = this._username.asObservable();
  readonly isLoggedIn$ = this._isLoggedIn.asObservable();

  setLoggedIn(isLoggedIn: boolean, username: string | null = null) {
    this._isLoggedIn.next(isLoggedIn);
    if (username !== undefined) {
      this._username.next(username);
    } else if (!isLoggedIn) {
      this._username.next(null);
    }
  }

  refreshFromSession() {
    this._username.next(this.readUsername());
    this._isLoggedIn.next(this.computeLoggedIn());
  }

  // Método para dar permisos temporales en desarrollo
  grantTemporaryPermissions(role: string = 'admin'): void {
    console.log('⚠️ Permisos temporales otorgados:', role);
    sessionStorage.setItem('devRole', role);
    sessionStorage.setItem('devPermissionsGranted', 'true');
  }

  // Método para revocar permisos temporales
  revokeTemporaryPermissions(): void {
    console.log('❌ Permisos temporales revocados');
    sessionStorage.removeItem('devRole');
    sessionStorage.removeItem('devPermissionsGranted');
  }

  // Verificar si tiene permisos temporales
  hasTemporaryPermissions(): boolean {
    return sessionStorage.getItem('devPermissionsGranted') === 'true';
  }

  // Obtener rol temporal
  getTemporaryRole(): string | null {
    return sessionStorage.getItem('devRole');
  }

  private readUsername(): string | null {
    return (
      sessionStorage.getItem('username') ||
      sessionStorage.getItem('userName') ||
      null
    );
  }

  private computeLoggedIn(): boolean {
    const token = sessionStorage.getItem('token') || sessionStorage.getItem('authToken');
    const correo = sessionStorage.getItem('correo');
    const username = this.readUsername();
    return !!(token || username || correo);
  }
}
