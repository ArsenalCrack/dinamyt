import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent {
  canCreate = false;
  nombreC: string | null = null;
  hasMyChampionships = false;
  // Estado de perfil
  profileCompletion = 0;
  missingFields: string[] = [];
  usuario: any;

  constructor(private apiService: ApiService, private auth: AuthService) { }

  ngOnInit(): void {
    this.usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    // Obtener el username que contiene el nombreC del registro

    this.apiService.getCurrentUser(this.usuario).subscribe({
      next: (u: any) => {
        console.log("u",u.nombreC);

        // Priorizar nombreC del backend
        if (u?.nombreC) {
          this.nombreC = u.nombreC;
          sessionStorage.setItem('nombreC', u.nombreC);
        } else if (!this.nombreC) {
          this.nombreC = u?.username || u?.name || null;
        }

        // permission heuristics: backend may expose roles or explicit flags
        const roles: string[] = u?.roles || u?.authorities || [];
        if (Array.isArray(roles) && roles.length) {
          this.canCreate = roles.includes('ADMIN') || roles.includes('ROLE_ADMIN');
        }
        if (!this.canCreate) {
          this.canCreate = !!u?.canCreateChampionship;
        }

        // Permitir permisos temporales en desarrollo
        if (!this.canCreate && this.auth.hasTemporaryPermissions()) {
          const devRole = this.auth.getTemporaryRole();
          this.canCreate = devRole === 'admin' || devRole === 'creator';
          this.hasMyChampionships = true;
          console.log('✅ Permisos temporales activos:', devRole);
        }

        // Detect if user has created championships
        const createdList = u?.myChampionships || u?.createdChampionships || u?.championships || null;
        if (Array.isArray(createdList)) {
          this.hasMyChampionships = createdList.length > 0;
        } else if (typeof u?.championshipsCount === 'number') {
          this.hasMyChampionships = u.championshipsCount > 0;
        } else if (typeof u?.createdCount === 'number') {
          this.hasMyChampionships = u.createdCount > 0;
        }

        // Calcular progreso de perfil con base en datos del proyecto
        this.computeProfileStatus(u);
      },
      error: () => {
        // Keep defaults (hide create card)
        // Intentar calcular el estado con sessionStorage si falla la API
        this.computeProfileStatus(null);

        // Permitir permisos temporales en desarrollo aunque falle API
        if (this.auth.hasTemporaryPermissions()) {
          const devRole = this.auth.getTemporaryRole();
          this.canCreate = devRole === 'admin' || devRole === 'creator';
          this.hasMyChampionships = true;
          console.log('✅ Permisos temporales activos (sin API):', devRole);
        }
      }
    });
  }

  private computeProfileStatus(user: any | null): void {
    const fields = [
      { key: 'nombreC', label: 'Nombre completo' },
      { key: 'idDocumento', label: 'Documento' },
      { key: 'sexo', label: 'Sexo' },
      { key: 'fechaNacimiento', label: 'Fecha de nacimiento' },
      { key: 'cinturonRango', label: 'Cinturón/Rango' },
      { key: 'nacionalidad', label: 'Nacionalidad' },
      { key: 'numeroCelular', label: 'Teléfono' },
      { key: 'correo', label: 'Correo' },
      { key: 'academia', label: 'Academia' },
      { key: 'instructor', label: 'Instructor' }
    ];

    let completed = 0;
    const missing: string[] = [];

    for (const f of fields) {
      const val = (user && user[f.key]) || sessionStorage.getItem(f.key);
      console.log(val)
      if (val && String(val).trim().length > 0) {
        
        completed++;
      } else {
        missing.push(f.label);
      }
    }

    this.profileCompletion = Math.round((completed / fields.length) * 100);
    this.missingFields = missing;
  }
}
