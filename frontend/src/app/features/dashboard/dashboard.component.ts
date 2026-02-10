import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { User, UserRole } from '../../core/models/user.model';
import { ScrollLockService } from '../../core/services/scroll-lock.service';

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

  // Modal welcome
  showProfileAlert = false;

  // Judge Access
  judgeAssignments: any[] = [];
  loadingJudge = false;

  constructor(
    private apiService: ApiService,
    private auth: AuthService,
    private router: Router,
    private scrollLock: ScrollLockService
  ) { }

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

        // Check for welcome profile alert
        if (sessionStorage.getItem('showWelcomeProfileAlert')) {
          sessionStorage.removeItem('showWelcomeProfileAlert');
          // Only show if completion < 100 to avoid annoying users who somehow have complete profiles
          if (this.profileCompletion < 100) {
            this.showProfileAlert = true;
            this.scrollLock.lock();
          }
        }
      },

      error: () => {
        // Keep defaults (hide create card)
        // Intentar calcular el estado con sessionStorage si falla la API
        this.computeProfileStatus(null);
      }
    });

    this.loadJudgeInvitations();
  }

  loadJudgeInvitations() {
    const userId = sessionStorage.getItem('idDocumento');
    if (!userId) return;

    this.loadingJudge = true;
    this.apiService.getMisInvitaciones(userId).subscribe({
      next: (invitations: any[]) => {
        if (!invitations || !Array.isArray(invitations)) {
          this.loadingJudge = false;
          return;
        }
        // Filter invitations that are ACCEPTED and related to Judge role (type 6 or 7)
        this.judgeAssignments = invitations.filter(inv => {
          const isAccepted = inv.estado === 'ACEPTADO' || inv.estado === 3; // Normalize status
          const isJudge = inv.id_tipo === 6 || inv.id_tipo === 7 || inv.tipousuario === 6 || inv.tipousuario === 7;
          return isAccepted && isJudge;
        });
        this.loadingJudge = false;
      },
      error: (e) => {
        console.error('Error loading judge invitations', e);
        this.loadingJudge = false;
      }
    });
  }

  closeProfileAlert(): void {
    this.showProfileAlert = false;
    this.scrollLock.unlock();
  }

  goToProfile(): void {
    this.showProfileAlert = false;
    this.scrollLock.unlock();
    this.router.navigate(['/perfil']);
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
