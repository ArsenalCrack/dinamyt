import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { User, UserRole } from '../../core/models/user.model';
import { ScrollLockService } from '../../core/services/scroll-lock.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  puedeCrear = false;
  nombreC: string | null = null;
  tieneCampeonatos = false;
  // Estado de perfil
  completitudPerfil = 0;
  camposFaltantes: string[] = [];
  usuario: any;

  // Modal bienvenida
  mostrarAlertaPerfil = false;

  // Acceso de Juez
  asignacionesJuez: any[] = [];
  cargandoJuez = false;

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
          const flatRoles = roles.map(r => typeof r === 'string' ? r : (r as any).authority || (r as any).name);
          this.puedeCrear = flatRoles.includes('ADMIN') || flatRoles.includes('ROLE_ADMIN') || flatRoles.includes('administrador');
        }

        // Lógica para tipos de usuario
        // Por defecto Tipo 1 (Normal) si es null/undefined
        let typeId = 1;
        if (u?.tipousuario) {
          // Manejar las diferentes variantes de mayúsculas del ID
          const raw = u.tipousuario.idTipo || u.tipousuario.ID_Tipo || u.tipousuario.id_Tipo || u.tipousuario.IDTipo || u.tipousuario.id;
          typeId = raw ? Number(raw) : 1;
        }

        if (typeId === 3) {
          this.puedeCrear = true;
          this.tieneCampeonatos = true;
        }

        if (!this.puedeCrear) {
          this.puedeCrear = !!u?.canCreateChampionship;
        }

        const createdList = u?.myChampionships || u?.createdChampionships || u?.championships || null;
        if (Array.isArray(createdList)) {
          this.tieneCampeonatos = createdList.length > 0;
        } else if (typeof u?.championshipsCount === 'number') {
          this.tieneCampeonatos = u.championshipsCount > 0;
        } else if (typeof u?.createdCount === 'number') {
          this.tieneCampeonatos = u.createdCount > 0;
        }

        // Calcular progreso de perfil con base en datos del proyecto
        this.calcularEstadoPerfil(u);

        // Verificar si mostrar alerta de bienvenida al perfil
        if (sessionStorage.getItem('showWelcomeProfileAlert')) {
          sessionStorage.removeItem('showWelcomeProfileAlert');
          if (this.completitudPerfil < 100) {
            this.mostrarAlertaPerfil = true;
            this.scrollLock.lock();
          }
        }
      },

      error: () => {
        // Keep defaults (hide create card)
        // Intentar calcular el estado con sessionStorage si falla la API
        this.calcularEstadoPerfil(null);
      }
    });

    this.cargarInvitacionesJuez();
  }

  cargarInvitacionesJuez() {
    // Intentar obtener ID de múltiples fuentes para robustez
    let userId = sessionStorage.getItem('idDocumento');
    if (!userId && this.usuario) {
      userId = this.usuario.idDocumento || this.usuario.id || this.usuario.sub;
    }
    if (!userId) {
      const stored = JSON.parse(localStorage.getItem('usuario') || '{}');
      userId = stored.usuario?.idDocumento || stored.idDocumento;
    }

    console.log('Cargando panel de juez para Usuario ID:', userId);

    if (!userId) return;

    this.cargandoJuez = true;

    // Usamos forkJoin para traer todo lo necesario: inscripciones, invitaciones y la lista de campeonatos (para cruzar IDs)
    forkJoin({
      inscripciones: this.apiService.getMisInscripciones(userId).pipe(catchError(() => of([]))),
      invitaciones: this.apiService.getMisInvitaciones(userId).pipe(catchError(() => of([]))),
      campeonatos: this.apiService.getCampeonatos().pipe(catchError(() => of([]))) // Necesario para obtener IDs de invitaciones
    }).subscribe({
      next: ({ inscripciones, invitaciones, campeonatos }) => {
        console.log('Datos crudos:', { inscripciones, invitaciones, campeonatos });

        let listaUnificada: any[] = [];

        // 1. Procesar Inscripciones (ya suelen traer ID)
        if (Array.isArray(inscripciones)) {
          listaUnificada = [...inscripciones];
        }

        // 2. Procesar Invitaciones (Suelen venir sin ID de campeonato, solo nombre)
        if (Array.isArray(invitaciones)) {
          const invitacionesProcesadas = invitaciones.map(inv => {
            // Normalizar DTO
            const nombreCamp = inv.campeonato || inv.campeonatoNombre;
            let idCamp = inv.id_campeonato || inv.idCampeonato || inv.campeonatoId;

            // Si falta el ID, buscarlo en la lista de campeonatos por nombre
            if (!idCamp && nombreCamp && Array.isArray(campeonatos)) {
              const match = campeonatos.find((c: any) => c.nombre === nombreCamp);
              if (match) {
                idCamp = match.idCampeonato;
              }
            }

            return {
              ...inv,
              campeonatoNombre: nombreCamp,
              id_campeonato: idCamp,
              // Normalizar tipos
              tipousuario: inv.tipoUsuario || inv.tipousuario || inv.id_tipo,
              estado: inv.estado
            };
          });
          listaUnificada = [...listaUnificada, ...invitacionesProcesadas];
        }

        // 3. Filtrar Jueces Activos
        const juecesActivos = listaUnificada.filter(item => {
          const rawStatus = item.estado;
          // Estado 3 = Aceptado/Inscrito, o string "ACEPTADO"
          const isAccepted = String(rawStatus) === '3' || String(rawStatus).toUpperCase() === 'ACEPTADO';

          const typeId = Number(item.tipousuario || item.id_tipo || item.idTipo || item.tipoUsuario);
          // 6: Central, 7: Mesa, 8: Juez
          const isJudge = [6, 7, 8].includes(typeId);

          // Verificar que tengamos un ID de campeonato para redirigir
          const hasId = !!(item.id_campeonato || item.idCampeonato || item.campeonatoId);

          return isAccepted && isJudge && hasId;
        });

        console.log('Jueces Filtrados Finales:', juecesActivos);

        // 4. Mapeo final para la vista
        this.asignacionesJuez = juecesActivos.map(a => ({
          id_campeonato: a.id_campeonato || a.idCampeonato || a.campeonatoId,
          campeonatoNombre: a.campeonatoNombre || a.nombreCampeonato || 'Campeonato',
          rol: a.rol // Opcional
        }));

        // Eliminar duplicados por ID de campeonato (por si aparece en ambas listas)
        this.asignacionesJuez = this.asignacionesJuez.filter((v, i, a) => a.findIndex(t => t.id_campeonato === v.id_campeonato) === i);

        this.cargandoJuez = false;
      },
      error: (err) => {
        console.error('Error cargando datos de juez', err);
        this.cargandoJuez = false;
      }
    });
  }

  cerrarAlertaPerfil(): void {
    this.mostrarAlertaPerfil = false;
    this.scrollLock.unlock();
  }

  irAlPerfil(): void {
    this.mostrarAlertaPerfil = false;
    this.scrollLock.unlock();
    this.router.navigate(['/perfil']);
  }

  private calcularEstadoPerfil(user: User | null): void {
    const fields = [
      { key: 'nombreC', label: 'Nombre completo' },
      { key: 'idDocumento', label: 'Documento' },
      { key: 'sexo', label: 'Sexo' },
      { key: 'fechaNacimiento', label: 'Fecha de nacimiento' },
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

    this.completitudPerfil = Math.round((completed / fields.length) * 100);
    this.camposFaltantes = missing;
  }
}
