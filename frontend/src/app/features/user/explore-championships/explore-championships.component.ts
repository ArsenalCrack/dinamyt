import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { Location } from '@angular/common';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { AuthService } from '../../../core/services/auth.service';
import { ApiService } from '../../../core/services/api.service';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

type EstadoCampeonato = 'ACTIVO' | 'PLANIFICADO' | 'TERMINADO' | 'BORRADOR';
type PrivacidadFiltro = 'TODOS' | 'PUBLICO' | 'PRIVADO';

interface CampeonatoApiItem {
  id: number;
  nombre: string;
  fechaInicio: string;
  ubicacion: string;
  alcance: string | null;
  creadoPor?: string | null;
  esPublico?: boolean;
  estado: EstadoCampeonato;
  participantes: number;
  capacidad: number | null;
  cuposDisponibles: number | null;
  puedeInscribirse: boolean;
  visibilidad?: boolean;
}

interface CampeonatoUiItem {
  id: number;
  nombre: string;
  fechaInicio: string;
  ubicacion: string;
  alcance: string | null;
  creadoPor: string | null;
  creadoPorNombre: string | null;
  esPublico: boolean;
  estadoKey: EstadoCampeonato;
  estadoLabel: string;
  participantes: number;
  capacidad: number | null;
  cuposDisponibles: number | null;
  puedeInscribirse: boolean;
  isVisible: boolean;
}

@Component({
  selector: 'app-explore-championships',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CustomSelectComponent, LoadingSpinnerComponent],
  templateUrl: './explore-championships.component.html',
  styleUrls: ['./explore-championships.component.scss']
})
export class ExploreChampionshipsComponent implements OnInit {
  searchQuery: string = '';
  championships: CampeonatoUiItem[] = [];
  filteredChampionships: CampeonatoUiItem[] = [];

  statusFilter: 'TODOS' | EstadoCampeonato = 'TODOS';
  privacyFilter: PrivacidadFiltro = 'TODOS';

  readonly statusOptions: Array<{ value: 'TODOS' | EstadoCampeonato; label: string }> = [
    { value: 'TODOS', label: 'Todos' },
    { value: 'ACTIVO', label: 'Activos' },
    { value: 'PLANIFICADO', label: 'Planificados' },
    { value: 'TERMINADO', label: 'Terminados' },
  ];

  readonly privacyOptions: Array<{ value: PrivacidadFiltro; label: string }> = [
    { value: 'TODOS', label: 'Todos' },
    { value: 'PUBLICO', label: 'Públicos' },
    { value: 'PRIVADO', label: 'Privados' },
  ];

  cargando = false;
  errorMessage: string | null = null;
  showLoginModal: boolean = false;

  showAccessCodeModal = false;
  accessCode = '';
  accessCodeError: string | null = null;
  accessCodeSubmitting = false;
  private accessCodeChampionshipId: number | null = null;

  // Delete modal
  showDeleteModal = false;
  deletingId: number | null = null;
  isDeleting = false;

  currentUserId: string | null = null;

  private modalLocked = false;

  constructor(
    private router: Router,
    private location: Location,
    private scrollLock: ScrollLockService,
    private auth: AuthService,
    private api: ApiService,
    private backNav: BackNavigationService
  ) { }

  private lockModal(): void {
    if (this.modalLocked) return;
    this.scrollLock.lock();
    this.modalLocked = true;
  }

  private unlockModal(): void {
    if (!this.modalLocked) return;
    this.scrollLock.unlock();
    this.modalLocked = false;
  }

  ngOnInit(): void {
    this.currentUserId = sessionStorage.getItem('idDocumento');
    this.loadChampionships();
  }

  private estadoLabel(estado: string): string {
    switch (estado) {
      case 'ACTIVO': return 'Activo';
      case 'PLANIFICADO': return 'Planificado';
      case 'TERMINADO': return 'Terminado';
      case 'BORRADOR': return 'Borrador';
      default: return estado;
    }
  }

  private calculateStatus(fechaInicio: string, fechaFin: string | undefined): EstadoCampeonato {
    if (!fechaInicio) return 'BORRADOR';
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Comparar solo fechas (día)

    const start = new Date(fechaInicio);
    const startCompare = new Date(start);
    startCompare.setHours(0, 0, 0, 0);

    const end = fechaFin ? new Date(fechaFin) : new Date(start);
    const endCompare = new Date(end);
    endCompare.setHours(23, 59, 59, 999);

    if (now < startCompare) return 'PLANIFICADO';
    if (now > endCompare) return 'TERMINADO';
    return 'ACTIVO';
  }

  private estadoRank(estado: string): number {
    switch (estado) {
      case 'ACTIVO': return 0;
      case 'PLANIFICADO': return 1;
      case 'TERMINADO': return 2;
      case 'BORRADOR': return 3;
      default: return 99;
    }
  }

  private sortCampeonatos(list: CampeonatoUiItem[]): CampeonatoUiItem[] {
    return [...list].sort((a, b) => {
      const ra = this.estadoRank(a.estadoKey);
      const rb = this.estadoRank(b.estadoKey);
      if (ra !== rb) return ra - rb;
      // por fecha de inicio
      const da = new Date(a.fechaInicio).getTime();
      const db = new Date(b.fechaInicio).getTime();
      if (!Number.isNaN(da) && !Number.isNaN(db) && da !== db) return da - db;
      return (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
    });
  }

  loadChampionships(): void {
    this.cargando = true;
    this.errorMessage = null;

    this.api.getCampeonatos().subscribe({
      next: (res: any) => {
        const items: CampeonatoApiItem[] = Array.isArray(res) ? res : [];
        console.log('Campeonatos loaded:', items);
        this.championships = this.sortCampeonatos(
          items.map((c: any) => {
            // Dynamic status calculation based on dates 
            // (Ignoring the backend "BORRADOR" if dates exist)
            const calculatedStatus = this.calculateStatus(c.fechaInicio, c.fecha_fin);

            return {
              id: c.idCampeonato ?? c.id,
              nombre: c.nombre,
              fechaInicio: c.fechaInicio,
              ubicacion: c.ubicacion,
              alcance: c.alcance ?? null,
              creadoPor: c.creadoPor ? String(c.creadoPor) : null,
              creadoPorNombre: c.creadoPorNombre || (c.nombreCreador ? `${c.nombreCreador}` : 'Desconocido'),
              esPublico: c.esPublico !== false,
              estadoKey: calculatedStatus,
              estadoLabel: this.estadoLabel(calculatedStatus),
              participantes: c.participantes ?? 0,
              capacidad: c.maxParticipantes ?? c.capacidad,
              cuposDisponibles: c.cuposDisponibles ?? null,
              puedeInscribirse: !!c.puedeInscribirse,
              isVisible: c.visibilidad !== false
            };
          })
        );
        this.applyFilters();
        this.cargando = false;
      },
      error: (err) => {
        console.error('Error loading championships:', err);
        this.cargando = false;
        this.errorMessage = 'No pudimos cargar los campeonatos. Intenta de nuevo.';
        this.championships = [];
        this.filteredChampionships = [];
      }
    });
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  setStatusFilter(value: 'TODOS' | EstadoCampeonato): void {
    this.statusFilter = value;
    this.applyFilters();
  }

  setStatusFilterFromUi(value: string): void {
    const allowed: Array<'TODOS' | EstadoCampeonato> = ['TODOS', 'ACTIVO', 'PLANIFICADO', 'TERMINADO'];
    const next = (allowed as string[]).includes(value) ? (value as any) : 'TODOS';
    this.setStatusFilter(next);
  }

  setPrivacyFilter(value: PrivacidadFiltro): void {
    this.privacyFilter = value;
    this.applyFilters();
  }

  setPrivacyFilterFromUi(value: string): void {
    const allowed: PrivacidadFiltro[] = ['TODOS', 'PUBLICO', 'PRIVADO'];
    const next = allowed.includes(value as PrivacidadFiltro) ? (value as PrivacidadFiltro) : 'TODOS';
    this.setPrivacyFilter(next);
  }

  private applyFilters(): void {
    const query = this.searchQuery.trim().toLowerCase();
    const status = this.statusFilter;
    const privacy = this.privacyFilter;

    let next = this.championships.filter(c => c.isVisible);

    if (status !== 'TODOS') {
      next = next.filter(c => c.estadoKey === status);
    }

    if (privacy !== 'TODOS') {
      next = next.filter(c => (privacy === 'PUBLICO') ? c.esPublico : !c.esPublico);
    }

    if (query) {
      next = next.filter(c =>
        (c.nombre || '').toLowerCase().includes(query) ||
        (c.ubicacion || '').toLowerCase().includes(query) ||
        ((c.alcance || '').toLowerCase().includes(query))
      );
    }

    this.filteredChampionships = this.sortCampeonatos(next);
  }

  goBack(): void {
    this.backNav.backOr({
      fallbackUrl: '/dashboard',
      disallowPrevious: [/^\/campeonatos\/crear(\b|\/|$)/]
    });
  }

  registerChampionship(id: number): void {
    // Verificar si el usuario está logueado (criterio centralizado)
    if (!this.auth.isLoggedIn()) {
      this.showLoginModal = true;
      this.lockModal();
      return;
    }

    const selected = this.championships.find(c => c.id === id) || this.filteredChampionships.find(c => c.id === id) || null;

    if (selected && !selected.esPublico) {
      this.showAccessCodeModal = true;
      this.accessCodeChampionshipId = id;
      this.accessCode = '';
      this.accessCodeError = null;
      this.accessCodeSubmitting = false;
      this.lockModal();
      return;
    }

    // Navegar a la página de inscripción para campeonatos públicos
    this.router.navigate(['/campeonato/register', id]);
  }

  closeAccessCodeModal(): void {
    this.showAccessCodeModal = false;
    this.accessCode = '';
    this.accessCodeError = null;
    this.accessCodeSubmitting = false;
    this.accessCodeChampionshipId = null;
    this.unlockModal();
  }

  submitAccessCode(): void {
    const id = this.accessCodeChampionshipId;
    const code = (this.accessCode || '').trim();

    if (!id) {
      this.accessCodeError = 'No encontramos el campeonato seleccionado.';
      return;
    }
    if (!code) {
      this.accessCodeError = 'El código es obligatorio.';
      return;
    }

    this.accessCodeSubmitting = true;
    this.accessCodeError = null;

    this.api.validarCodigoCampeonato(id, code).subscribe({
      next: () => {
        this.accessCodeSubmitting = false;
        this.closeAccessCodeModal();
        this.router.navigate(['/campeonato/register', id], { queryParams: { code: code } });
      },
      error: (err) => {
        this.accessCodeSubmitting = false;
        const msg = err?.error?.message || err?.error?.mensaje;
        this.accessCodeError = msg || 'Código inválido. Intenta de nuevo.';
      }
    });
  }

  closeLoginModal(): void {
    this.showLoginModal = false;
    this.unlockModal();
  }

  goToLogin(): void {
    this.showLoginModal = false;
    this.unlockModal();
    this.router.navigate(['/login']);
  }

  viewDetails(id: number): void {
    // Navegar a detalles
    this.router.navigate(['/campeonato/details', id]);
  }

  deleteChampionship(id: number): void {
    this.deletingId = id;
    this.showDeleteModal = true;
    this.lockModal();
  }

  closeDeleteModal(): void {
    this.showDeleteModal = false;
    this.deletingId = null;
    this.isDeleting = false;
    this.unlockModal();
  }

  confirmDelete(): void {
    if (this.deletingId === null) return;

    this.isDeleting = true;
    this.api.deleteCampeonato(this.deletingId).subscribe({
      next: () => {
        // Soft delete: just remove from list and update UI
        this.championships = this.championships.filter(c => c.id !== this.deletingId);
        this.applyFilters();
        this.closeDeleteModal();
      },
      error: (err) => {
        console.error('Error deleting championship:', err);
        // Fallback for demo
        this.championships = this.championships.filter(c => c.id !== this.deletingId);
        this.applyFilters();
        this.closeDeleteModal();
      }
    });
  }

  getAvailableSlots(participantes: number, capacidad: number | null, cuposDisponibles: number | null): number | null {
    if (cuposDisponibles !== null && cuposDisponibles !== undefined) return cuposDisponibles;
    if (capacidad === null || capacidad === undefined) return null;
    return capacidad - participantes;
  }

  getProgressPercentage(participantes: number, capacidad: number | null): number {
    if (!capacidad || capacidad <= 0) return 0;
    return Math.min(100, Math.max(0, (participantes / capacidad) * 100));
  }

  isOwner(championship: CampeonatoUiItem): boolean {
    return this.currentUserId !== null && String(this.currentUserId) === String(championship.creadoPor);
  }

  canRegister(championship: CampeonatoUiItem): boolean {
    // No puede inscribirse si es el dueño
    if (this.isOwner(championship)) return false;
    // Solo puede inscribirse si está en fase PLANIFICADO
    return championship.estadoKey === 'PLANIFICADO' && !!championship.puedeInscribirse;
  }
}
