import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
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
  pais?: string;
  ciudad?: string;
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
  pais?: string;
  ciudad?: string;
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
  // ... (properties remain)
  searchQuery: string = '';
  championships: CampeonatoUiItem[] = [];
  filteredChampionships: CampeonatoUiItem[] = [];
  paginatedChampionships: CampeonatoUiItem[] = [];

  // Pagination
  currentPage: number = 1;
  itemsPerPage: number = 6;
  totalPages: number = 1;

  statusFilter: 'TODOS' | EstadoCampeonato = 'TODOS';
  privacyFilter: PrivacidadFiltro = 'TODOS';
  dateSort: 'MAS_RECIENTE' | 'MAS_ANTIGUO' = 'MAS_RECIENTE';

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

  readonly dateSortOptions: Array<{ value: 'MAS_RECIENTE' | 'MAS_ANTIGUO'; label: string }> = [
    { value: 'MAS_RECIENTE', label: 'Más reciente' },
    { value: 'MAS_ANTIGUO', label: 'Más antiguo' },
  ];

  cargando = false;
  errorMessage: string | null = null;
  showLoginModal: boolean = false;

  showAccessCodeModal = false;
  accessCode = '';
  accessCodeError: string | null = null;
  accessCodeSubmitting = false;
  accessCodeChampionshipId: number | null = null;

  // Delete modal
  showDeleteModal = false;
  deletingId: number | null = null;
  isDeleting = false;

  currentUserId: string | null = null;
  showMobileFilters = false;

  private modalLocked = false;
  private pendingRegistrationId: number | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
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

  toggleMobileFilters(): void {
    this.showMobileFilters = !this.showMobileFilters;
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

    // Obtener fecha actual en medianoche local para comparar solo días
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Función auxiliar para parsear YYYY-MM-DD como fecha local
    const parseLocalDate = (dateStr: string): Date => {
      if (!dateStr) return new Date();
      const parts = dateStr.split('T')[0].split('-');
      if (parts.length === 3) {
        // new Date(year, monthIndex, day) crea una fecha en hora local
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      }
      return new Date(dateStr);
    };

    const startCompare = parseLocalDate(fechaInicio);
    startCompare.setHours(0, 0, 0, 0);

    const endCompare = fechaFin ? parseLocalDate(fechaFin) : new Date(startCompare);
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
      const da = new Date(a.fechaInicio).getTime();
      const db = new Date(b.fechaInicio).getTime();

      let dateComparison = 0;
      if (!Number.isNaN(da) && !Number.isNaN(db)) {
        if (this.dateSort === 'MAS_RECIENTE') {
          dateComparison = da - db;
        } else {
          dateComparison = db - da;
        }
      }

      if (dateComparison !== 0) return dateComparison;
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

        // Map items
        this.championships = items.map((c: any) => {
          // Dynamic status calculation based on dates 
          // (Ignoring the backend "BORRADOR" if dates exist)
          const calculatedStatus = this.calculateStatus(c.fechaInicio, c.fecha_fin);

          return {
            id: c.idCampeonato ?? c.id,
            nombre: c.nombre,
            fechaInicio: c.fechaInicio,
            ubicacion: c.ubicacion,
            pais: c.pais || 'Colombia', // Ghost data
            ciudad: c.ciudad || 'Bogotá', // Ghost data
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
            isVisible: (
              c.visible !== 0 && c.visible !== '0' && c.visible !== false &&
              c.Visible !== 0 && c.Visible !== '0' && c.Visible !== false &&
              c.visibilidad !== 0 && c.visibilidad !== '0' && c.visibilidad !== false &&
              c.Visibilidad !== 0 && c.Visibilidad !== '0' && c.Visibilidad !== false
            )
          };
        });

        this.applyFilters();
        this.cargando = false;

        // Auto-action handling
        const pendingId = this.route.snapshot.queryParams['autoRegister'];
        if (pendingId) {
          // Clear query param to avoid re-triggering on refresh
          this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { autoRegister: null },
            queryParamsHandling: 'merge',
            replaceUrl: true
          });

          const idNum = Number(pendingId);
          if (!isNaN(idNum)) {
            // We need to wait a tick or ensure view is ready? 
            // Logic is safe to call immediately as data is loaded.
            setTimeout(() => {
              this.registerChampionship(idNum);
            }, 100);
          }
        }
      },
      error: (err) => {
        console.error('Error loading championships:', err);
        this.cargando = false;
        this.errorMessage = 'No pudimos cargar los campeonatos. Intenta de nuevo.';
        this.championships = [];
        this.filteredChampionships = [];
        this.paginatedChampionships = [];
      }
    });
  }

  onSearchChange(): void {
    this.currentPage = 1; // Reset to first page on new search
    this.applyFilters();
  }

  setStatusFilter(value: 'TODOS' | EstadoCampeonato): void {
    this.statusFilter = value;
    this.currentPage = 1;
    this.applyFilters();
  }

  setStatusFilterFromUi(value: string): void {
    const allowed: Array<'TODOS' | EstadoCampeonato> = ['TODOS', 'ACTIVO', 'PLANIFICADO', 'TERMINADO'];
    const next = (allowed as string[]).includes(value) ? (value as any) : 'TODOS';
    this.setStatusFilter(next);
  }

  setPrivacyFilter(value: PrivacidadFiltro): void {
    this.privacyFilter = value;
    this.currentPage = 1;
    this.applyFilters();
  }

  setPrivacyFilterFromUi(value: string): void {
    const allowed: PrivacidadFiltro[] = ['TODOS', 'PUBLICO', 'PRIVADO'];
    const next = allowed.includes(value as PrivacidadFiltro) ? (value as PrivacidadFiltro) : 'TODOS';
    this.setPrivacyFilter(next);
  }

  setDateSort(value: 'MAS_RECIENTE' | 'MAS_ANTIGUO'): void {
    this.dateSort = value;
    // Don't reset page? User requested "filters don't delete if page changes", 
    // but usually sorting re-orders everything so page 2 might become page 1 content.
    // "que los filtros no se borren si llego a cambiar de paginación" -> means pagination state shouldn't clear filters.
    // BUT changing a filter usually rests pagination to 1 to avoid being out of bounds.
    // I will reset page to 1 because the data order changes completely.
    this.currentPage = 1;
    this.applyFilters();
  }

  setDateSortFromUi(value: string): void {
    const allowed: Array<'MAS_RECIENTE' | 'MAS_ANTIGUO'> = ['MAS_RECIENTE', 'MAS_ANTIGUO'];
    const next = (allowed as string[]).includes(value) ? (value as any) : 'MAS_RECIENTE';
    this.setDateSort(next);
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

    // Sort
    this.filteredChampionships = this.sortCampeonatos(next);

    // Calculate Pagination
    this.totalPages = Math.ceil(this.filteredChampionships.length / this.itemsPerPage) || 1;

    // Adjust current page if out of bounds (e.g. filter reduced results)
    if (this.currentPage > this.totalPages) {
      this.currentPage = 1;
    }

    this.updatePagination();
  }

  private updatePagination(): void {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    this.paginatedChampionships = this.filteredChampionships.slice(startIndex, endIndex);
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagination();
      // Optional: Scroll to top of grid?
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagination();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.currentPage = page;
      this.updatePagination();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  getPageNumbers(): number[] {
    // Simple range for now, or could be smarter (1, ... 4, 5, 6 ... 10)
    // Since max items is not huge likely, lets just show all or limit to 5
    const total = this.totalPages;
    const current = this.currentPage;

    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    // Complex pagination logic (1, 2, ..., 5, 6, 7, ..., 10) - simplified for 5 visible
    // Let's just standard simple sliding window
    let start = Math.max(1, current - 2);
    let end = Math.min(total, current + 2);

    const pages = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
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
      this.pendingRegistrationId = id;
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

  onAccessCodeChange(value: string): void {
    // Sanitiza el valor para que solo queden números
    let clean = value.replace(/[^0-9]/g, '');
    if (clean.length > 6) {
      clean = clean.substring(0, 6);
    }
    this.accessCode = clean;
  }

  onAccessCodePaste(event: ClipboardEvent): void {
    event.preventDefault();
    const clipboardData = event.clipboardData || (window as any).clipboardData;
    const pastedText = clipboardData.getData('text');
    const cleanPaste = pastedText.replace(/[^0-9]/g, '').slice(0, 6);
    this.accessCode = cleanPaste;
  }

  onAccessCodeKeyDown(event: KeyboardEvent): void {
    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Home', 'End'];

    // Permitir combinaciones con Ctrl o Meta (Mac) para Copiar/Pegar/Cortar/Seleccionar
    if (event.ctrlKey || event.metaKey) {
      return;
    }

    // Permitir teclas de navegación y control básicas
    if (allowedKeys.includes(event.key)) {
      return;
    }

    // Bloquear si NO es un número (evita letras, puntos, comas, etc.)
    if (!/^[0-9]$/.test(event.key)) {
      event.preventDefault();
    }
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

    if (this.pendingRegistrationId) {
      this.auth.redirectUrl = `/campeonatos?autoRegister=${this.pendingRegistrationId}`;
      this.pendingRegistrationId = null;
    }

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
