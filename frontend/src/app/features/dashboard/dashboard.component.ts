import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { User, UserRole } from '../../core/models/user.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  canCreate = false;
  nombreC: string | null = null;
  hasMyChampionships = false;
  // Estado de perfil
  profileCompletion = 0;
  missingFields: string[] = [];
  usuario: any;

  constructor(private apiService: ApiService, private auth: AuthService) { }

  ngOnInit(): void {
    try {
      const parsed = JSON.parse(localStorage.getItem('usuario') || '{}');
      this.usuario = parsed?.usuario || parsed || {};
    } catch {
      this.usuario = {};
    }

    if (!this.usuario || Object.keys(this.usuario).length === 0) {
      // If no user in local storage, try to see if session has data or just fail gracefully
      console.warn('No user found in localStorage');
      // Optionally redirect to login or handle as guest
    }

    // Ensure we send a valid object, even if empty, to avoid "Required request body is missing"
    const payload = this.usuario || {};

    this.apiService.getCurrentUser(payload).subscribe({
      next: (u: User) => {
        console.log("u", u.nombreC);

        // Priorizar nombreC del backend
        if (u?.nombreC) {
          this.nombreC = u.nombreC;
          sessionStorage.setItem('nombreC', u.nombreC);
        } else if (!this.nombreC) {
          this.nombreC = u?.username || u?.name || null;
        }

        // permission heuristics: backend may expose roles or explicit flags
        // cast explicitly to any if checks are loose, or strictly use UserRole
        const roles: any[] = u?.roles || u?.authorities || [];
        if (Array.isArray(roles) && roles.length) {
          // Check for strings or objects if complex roles exist
          const flatRoles = roles.map(r => typeof r === 'string' ? r : (r as any).authority || (r as any).name);
          this.canCreate = flatRoles.includes('ADMIN') || flatRoles.includes('ROLE_ADMIN') || flatRoles.includes('administrador');
        }

        // Logic for User Types
        // Default to Type 1 (Normal) if null/undefined
        let typeId = 1;
        if (u?.tipousuario) {
          // Handle various potential casing for the ID
          const raw = u.tipousuario.idTipo || u.tipousuario.ID_Tipo || u.tipousuario.id_Tipo || u.tipousuario.IDTipo || u.tipousuario.id;
          typeId = raw ? Number(raw) : 1;
        }

        if (typeId === 3) {
          this.canCreate = true;
          this.hasMyChampionships = true;
        }

        if (!this.canCreate) {
          this.canCreate = !!u?.canCreateChampionship;
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
      }
    });
  }

  private computeProfileStatus(user: User | null): void {
    const fields = [
      { key: 'nombreC', label: 'Nombre completo' },
      { key: 'idDocumento', label: 'Documento' },
      { key: 'sexo', label: 'Sexo' },
      { key: 'fechaNacimiento', label: 'Fecha de nacimiento' },
      // En el proyecto coexisten claves antiguas y nuevas
      { key: 'cinturon_rango', label: 'Cinturón/Rango' },
      { key: 'nacionalidad', label: 'Nacionalidad' },
      { key: 'numero_celular', label: 'Teléfono' },
      { key: 'correo', label: 'Correo' },
      { key: 'academia', label: 'Academia' },
      { key: 'Instructor', label: 'Instructor' }
    ];

    let completed = 0;
    const missing: string[] = [];

    const sessionFallbackKeys: Record<string, string[]> = {
      cinturon_rango: ['cinturon_rango', 'cinturonRango'],
      numero_celular: ['numero_celular', 'numeroCelular'],
      Instructor: ['Instructor', 'instructor']
    };

    for (const f of fields) {
      // safe access with casting to any since keys are dynamic strings
      const valFromUser = user ? (user as any)[f.key] : null;
      const fallbackKeys = sessionFallbackKeys[f.key] || [f.key];
      const valFromSession = fallbackKeys.map(k => sessionStorage.getItem(k)).find(v => v !== null);
      const val = valFromUser ?? valFromSession;

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
