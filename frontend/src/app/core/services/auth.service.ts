import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _username = new BehaviorSubject<string | null>(this.readUsername());
  private _isLoggedIn = new BehaviorSubject<boolean>(this.computeLoggedIn());
  private _roles = new BehaviorSubject<string[]>(this.readRoles());

  readonly username$ = this._username.asObservable();
  readonly isLoggedIn$ = this._isLoggedIn.asObservable();
  readonly roles$ = this._roles.asObservable();

  setLoggedIn(isLoggedIn: boolean, username: string | null = null) {
    this._isLoggedIn.next(isLoggedIn);
    if (username !== undefined) {
      this._username.next(username);
    } else if (!isLoggedIn) {
      this._username.next(null);
    }
    if (!isLoggedIn) {
      this.setRoles([]);
    }
  }

  setRoles(roles: string[]): void {
    const normalized = Array.from(
      new Set((roles || []).map(r => String(r || '').trim().toLowerCase()).filter(Boolean))
    );

    if (normalized.length === 0) {
      sessionStorage.removeItem('roles');
      this._roles.next([]);
      return;
    }

    sessionStorage.setItem('roles', JSON.stringify(normalized));
    this._roles.next(normalized);
  }

  getRoles(): string[] {
    return this.readRoles();
  }

  hasRole(role: string): boolean {
    const r = String(role || '').trim().toLowerCase();
    if (!r) return false;
    return this.getRoles().includes(r);
  }

  refreshFromSession() {
    const nextUsername = this.readUsername();
    const nextLoggedIn = this.computeLoggedIn();
    const nextRoles = this.readRoles();

    // Evitar bucles infinitos: solo emitir si el valor realmente cambió.
    if (this._username.value !== nextUsername) {
      this._username.next(nextUsername);
    }
    if (this._isLoggedIn.value !== nextLoggedIn) {
      this._isLoggedIn.next(nextLoggedIn);
    }
    // Comparación simple por JSON para evitar loops
    if (JSON.stringify(this._roles.value) !== JSON.stringify(nextRoles)) {
      this._roles.next(nextRoles);
    }
  }

  isLoggedIn(): boolean {
    // No emitir aquí para evitar loops si algún subscriber consulta el estado en su propio next().
    return this.computeLoggedIn();
  }

  isAdminType3(): boolean {
    // "Admin" para gestión de campeonatos: administrador o admin_proyecto
    return this.hasRole('administrador') || this.hasRole('admin_proyecto');
  }

  private readUsername(): string | null {
    return (
      sessionStorage.getItem('username') ||
      sessionStorage.getItem('userName') ||
      null
    );
  }

  private readRoles(): string[] {
    const raw = sessionStorage.getItem('roles');
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return Array.from(new Set(parsed.map(r => String(r || '').trim().toLowerCase()).filter(Boolean)));
    } catch {
      return [];
    }
  }

  private computeLoggedIn(): boolean {
    const token = sessionStorage.getItem('token') || sessionStorage.getItem('authToken');
    const correo = sessionStorage.getItem('correo');
    const username = this.readUsername();
    return !!(token || username || correo);
  }
}
