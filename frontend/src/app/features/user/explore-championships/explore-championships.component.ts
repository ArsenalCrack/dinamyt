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
import { Campeonato } from '../../../core/models/campeonato.model';

type EstadoCampeonato = 'ACTIVO' | 'PLANIFICADO' | 'TERMINADO' | 'BORRADOR';
type PrivacidadFiltro = 'TODOS' | 'PUBLICO' | 'PRIVADO';

interface CampeonatoUI extends Omit<Campeonato, 'cuposDisponibles'> {
  // UI Specific or mapped properties
  creadoPorNombre: string | null;
  estadoKey: EstadoCampeonato;
  estadoLabel: string;
  cuposDisponibles?: number | null; // Allow null explicity or undefined
  isVisible: boolean;
  capacidad: number | null; // Alias for maxParticipantes for UI consistency if needed
}

@Component({
  selector: 'app-explore-championships',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CustomSelectComponent, LoadingSpinnerComponent],
  templateUrl: './explore-championships.component.html',
  styleUrls: ['./explore-championships.component.scss']
})
export class ExploreChampionshipsComponent implements OnInit {
  busqueda: string = '';
  campeonatos: CampeonatoUI[] = [];
  campeonatosFiltrados: CampeonatoUI[] = [];
  campeonatosPaginados: CampeonatoUI[] = [];

  // Pagination
  paginaActual: number = 1;
  itemsPorPagina: number = 6;
  totalPaginas: number = 1;

  filtroEstado: 'TODOS' | EstadoCampeonato = 'TODOS';
  filtroPrivacidad: PrivacidadFiltro = 'TODOS';
  ordenFecha: 'MAS_RECIENTE' | 'MAS_ANTIGUO' = 'MAS_RECIENTE';

  readonly opcionesEstado: Array<{ value: 'TODOS' | EstadoCampeonato; label: string }> = [
    { value: 'TODOS', label: 'Todos' },
    { value: 'ACTIVO', label: 'Activos' },
    { value: 'PLANIFICADO', label: 'Planificados' },
    { value: 'TERMINADO', label: 'Terminados' },
  ];

  readonly opcionesPrivacidad: Array<{ value: PrivacidadFiltro; label: string }> = [
    { value: 'TODOS', label: 'Todos' },
    { value: 'PUBLICO', label: 'Públicos' },
    { value: 'PRIVADO', label: 'Privados' },
  ];

  readonly opcionesOrdenFecha: Array<{ value: 'MAS_RECIENTE' | 'MAS_ANTIGUO'; label: string }> = [
    { value: 'MAS_RECIENTE', label: 'Más reciente' },
    { value: 'MAS_ANTIGUO', label: 'Más antiguo' },
  ];

  cargando = false;
  mensajeError: string | null = null;
  mostrarModalLogin: boolean = false;

  mostrarModalCodigo = false;
  codigoAcceso = '';
  errorCodigoAcceso: string | null = null;
  enviandoCodigoAcceso = false;
  idCampeonatoCodigo: number | null = null;

  // Modal de eliminación
  mostrarModalEliminar = false;
  idEliminando: number | null = null;
  estaEliminando = false;

  idUsuarioActual: string | null = null;
  mostrarFiltrosMovil = false;

  private modalBloqueado = false;
  private idRegistroPendiente: number | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private location: Location,
    private scrollLock: ScrollLockService,
    private auth: AuthService,
    private api: ApiService,
    private backNav: BackNavigationService
  ) { }

  private bloquearModal(): void {
    if (this.modalBloqueado) return;
    this.scrollLock.lock();
    this.modalBloqueado = true;
  }

  private desbloquearModal(): void {
    if (!this.modalBloqueado) return;
    this.scrollLock.unlock();
    this.modalBloqueado = false;
  }

  alternarFiltrosMovil(): void {
    this.mostrarFiltrosMovil = !this.mostrarFiltrosMovil;
  }

  ngOnInit(): void {
    this.idUsuarioActual = sessionStorage.getItem('idDocumento');
    this.cargarCampeonatos();
  }

  private obtenerEtiquetaEstado(estado: string): string {
    switch (estado) {
      case 'ACTIVO': return 'Activo';
      case 'PLANIFICADO': return 'Planificado';
      case 'TERMINADO': return 'Terminado';
      case 'BORRADOR': return 'Borrador';
      default: return estado;
    }
  }

  private calcularEstado(fechaInicio: string, fechaFin: string | undefined): EstadoCampeonato {
    if (!fechaInicio) return 'BORRADOR';

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const parseLocalDate = (dateStr: string): Date => {
      if (!dateStr) return new Date();
      const parts = dateStr.split('T')[0].split('-');
      if (parts.length === 3) {
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

  private ordenarCampeonatos(lista: CampeonatoUI[]): CampeonatoUI[] {
    return [...lista].sort((a, b) => {
      const da = new Date(a.fechaInicio).getTime();
      const db = new Date(b.fechaInicio).getTime();

      let dateComparison = 0;
      if (!Number.isNaN(da) && !Number.isNaN(db)) {
        if (this.ordenFecha === 'MAS_RECIENTE') {
          dateComparison = da - db;
        } else {
          dateComparison = db - da;
        }
      }

      if (dateComparison !== 0) return dateComparison;
      return (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
    });
  }

  cargarCampeonatos(): void {
    this.cargando = true;
    this.mensajeError = null;

    this.api.getCampeonatos().subscribe({
      next: (res: any) => {
        const items: any[] = Array.isArray(res) ? res : [];

        this.campeonatos = items.map((c: any) => {
          const calculatedStatus = this.calcularEstado(c.fechaInicio, c.fecha_fin);

          // Force casting/mapping to UI model
          const mapped: CampeonatoUI = {
            ...c, // Spread backend properties (Campeonato interface items)
            idCampeonato: c.idCampeonato ?? c.id, // Ensure ID
            creadoPorNombre: c.creadoPorNombre || (c.nombreCreador ? `${c.nombreCreador}` : 'Desconocido'),
            estadoKey: calculatedStatus,
            estadoLabel: this.obtenerEtiquetaEstado(calculatedStatus),
            capacidad: c.maxParticipantes ?? c.capacidad,
            cuposDisponibles: c.cuposDisponibles ?? null,
            isVisible: (
              c.visible !== 0 && c.visible !== '0' && c.visible !== false &&
              c.Visible !== 0 && c.Visible !== '0' && c.Visible !== false &&
              c.visibilidad !== 0 && c.visibilidad !== '0' && c.visibilidad !== false &&
              c.Visibilidad !== 0 && c.Visibilidad !== '0' && c.Visibilidad !== false
            )
          };
          return mapped;
        });

        this.aplicarFiltros();
        this.cargando = false;

        const pendingId = this.route.snapshot.queryParams['autoRegister'];
        if (pendingId) {
          this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { autoRegister: null },
            queryParamsHandling: 'merge',
            replaceUrl: true
          });

          const idNum = Number(pendingId);
          if (!isNaN(idNum)) {
            setTimeout(() => {
              this.registrarCampeonato(idNum);
            }, 100);
          }
        }
      },
      error: (err) => {
        console.error('Error loading championships:', err);
        this.cargando = false;
        this.mensajeError = 'No pudimos cargar los campeonatos. Intenta de nuevo.';
        this.campeonatos = [];
        this.campeonatosFiltrados = [];
        this.campeonatosPaginados = [];
      }
    });
  }

  alCambiarBusqueda(): void {
    this.paginaActual = 1;
    this.aplicarFiltros();
  }

  seleccionarFiltroEstado(value: 'TODOS' | EstadoCampeonato): void {
    this.filtroEstado = value;
    this.paginaActual = 1;
    this.aplicarFiltros();
  }

  seleccionarFiltroEstadoUI(value: string): void {
    const allowed: Array<'TODOS' | EstadoCampeonato> = ['TODOS', 'ACTIVO', 'PLANIFICADO', 'TERMINADO'];
    const next = (allowed as string[]).includes(value) ? (value as any) : 'TODOS';
    this.seleccionarFiltroEstado(next);
  }

  seleccionarFiltroPrivacidad(value: PrivacidadFiltro): void {
    this.filtroPrivacidad = value;
    this.paginaActual = 1;
    this.aplicarFiltros();
  }

  seleccionarFiltroPrivacidadUI(value: string): void {
    const allowed: PrivacidadFiltro[] = ['TODOS', 'PUBLICO', 'PRIVADO'];
    const next = allowed.includes(value as PrivacidadFiltro) ? (value as PrivacidadFiltro) : 'TODOS';
    this.seleccionarFiltroPrivacidad(next);
  }

  seleccionarOrdenFecha(value: 'MAS_RECIENTE' | 'MAS_ANTIGUO'): void {
    this.ordenFecha = value;
    this.paginaActual = 1;
    this.aplicarFiltros();
  }

  seleccionarOrdenFechaUI(value: string): void {
    const allowed: Array<'MAS_RECIENTE' | 'MAS_ANTIGUO'> = ['MAS_RECIENTE', 'MAS_ANTIGUO'];
    const next = (allowed as string[]).includes(value) ? (value as any) : 'MAS_RECIENTE';
    this.seleccionarOrdenFecha(next);
  }

  private aplicarFiltros(): void {
    const query = this.busqueda.trim().toLowerCase();
    const status = this.filtroEstado;
    const privacy = this.filtroPrivacidad;

    let next = this.campeonatos.filter(c => c.isVisible);

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

    this.campeonatosFiltrados = this.ordenarCampeonatos(next);
    this.totalPaginas = Math.ceil(this.campeonatosFiltrados.length / this.itemsPorPagina) || 1;

    if (this.paginaActual > this.totalPaginas) {
      this.paginaActual = 1;
    }

    this.actualizarPaginacion();
  }

  private actualizarPaginacion(): void {
    const startIndex = (this.paginaActual - 1) * this.itemsPorPagina;
    const endIndex = startIndex + this.itemsPorPagina;
    this.campeonatosPaginados = this.campeonatosFiltrados.slice(startIndex, endIndex);
  }

  paginaSiguiente(): void {
    if (this.paginaActual < this.totalPaginas) {
      this.paginaActual++;
      this.actualizarPaginacion();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  paginaAnterior(): void {
    if (this.paginaActual > 1) {
      this.paginaActual--;
      this.actualizarPaginacion();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  irAPagina(page: number): void {
    if (page >= 1 && page <= this.totalPaginas && page !== this.paginaActual) {
      this.paginaActual = page;
      this.actualizarPaginacion();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  obtenerNumerosPagina(): number[] {
    const total = this.totalPaginas;
    const current = this.paginaActual;

    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    let start = Math.max(1, current - 2);
    let end = Math.min(total, current + 2);

    const pages = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  volverAtras(): void {
    this.backNav.backOr({
      fallbackUrl: '/dashboard',
      disallowPrevious: [/^\/campeonatos\/crear(\b|\/|$)/]
    });
  }

  registrarCampeonato(id: number): void {
    this.idUsuarioActual = sessionStorage.getItem('idDocumento');

    if (!this.auth.isLoggedIn()) {
      this.idRegistroPendiente = id;
      this.mostrarModalLogin = true;
      this.bloquearModal();
      return;
    }

    if (!this.idUsuarioActual) {
      console.warn('User logged in but no ID found in session.');
      this.procesarRegistro(id);
      return;
    }

    this.cargando = true;

    this.api.getMisInscripciones(this.idUsuarioActual).subscribe({
      next: (inscripciones: any[]) => {
        const record = inscripciones.find((item: any) => {
          let campId = item.id_campeonato || item.idCampeonato || item.IdCampeonato ||
            item.campeonato_id || item.campeonatoId || item.id_torneo || item.ref_campeonato;

          if (!campId && typeof item.campeonato === 'object' && item.campeonato !== null) {
            campId = item.campeonato.id || item.campeonato.idCampeonato;
          }

          return String(campId) === String(id);
        });

        if (record) {
          if (record.invitado == 1) {
            this.cargando = false;
            alert('Has sido invitado a este campeonato como competidor. Debes inscribirte mediante la invitación en tu sección de invitaciones.');
            return;
          }
        }

        this.procesarRegistro(id);
      },
      error: (err) => {
        console.error('Error checking invitations', err);
        this.procesarRegistro(id);
      }
    });
  }

  private procesarRegistro(id: number): void {
    const selected = this.campeonatos.find(c => c.idCampeonato === id) || this.campeonatosFiltrados.find(c => c.idCampeonato === id) || null;

    this.cargando = false;

    if (selected && !selected.esPublico) {
      this.mostrarModalCodigo = true;
      this.idCampeonatoCodigo = id;
      this.codigoAcceso = '';
      this.errorCodigoAcceso = null;
      this.enviandoCodigoAcceso = false;
      this.bloquearModal();
      return;
    }

    this.router.navigate(['/campeonato/register', id]);
  }

  cerrarModalCodigo(): void {
    this.mostrarModalCodigo = false;
    this.codigoAcceso = '';
    this.errorCodigoAcceso = null;
    this.enviandoCodigoAcceso = false;
    this.idCampeonatoCodigo = null;
    this.desbloquearModal();
  }

  alCambiarCodigo(value: string): void {
    let clean = value.replace(/[^0-9]/g, '');
    if (clean.length > 6) {
      clean = clean.substring(0, 6);
    }
    this.codigoAcceso = clean;
  }

  alPegarCodigo(event: ClipboardEvent): void {
    event.preventDefault();
    const clipboardData = event.clipboardData || (window as any).clipboardData;
    const pastedText = clipboardData.getData('text');
    const cleanPaste = pastedText.replace(/[^0-9]/g, '').slice(0, 6);
    this.codigoAcceso = cleanPaste;
  }

  alPresionarTeclaCodigo(event: KeyboardEvent): void {
    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Home', 'End'];

    if (event.ctrlKey || event.metaKey) {
      return;
    }

    if (allowedKeys.includes(event.key)) {
      return;
    }

    if (!/^[0-9]$/.test(event.key)) {
      event.preventDefault();
    }
  }

  enviarCodigo(): void {
    const id = this.idCampeonatoCodigo;
    const code = (this.codigoAcceso || '').trim();

    if (!id) {
      this.errorCodigoAcceso = 'No encontramos el campeonato seleccionado.';
      return;
    }
    if (!code) {
      this.errorCodigoAcceso = 'El código es obligatorio.';
      return;
    }

    this.enviandoCodigoAcceso = true;
    this.errorCodigoAcceso = null;

    this.api.validarCodigoCampeonato(id, code).subscribe({
      next: () => {
        this.enviandoCodigoAcceso = false;
        this.cerrarModalCodigo();
        this.router.navigate(['/campeonato/register', id], { queryParams: { code: code } });
      },
      error: (err) => {
        this.enviandoCodigoAcceso = false;
        const msg = err?.error?.message || err?.error?.mensaje;
        this.errorCodigoAcceso = msg || 'Código inválido. Intenta de nuevo.';
      }
    });
  }

  cerrarModalLogin(): void {
    this.mostrarModalLogin = false;
    this.desbloquearModal();
  }

  irALogin(): void {
    this.mostrarModalLogin = false;
    this.desbloquearModal();

    if (this.idRegistroPendiente) {
      this.auth.redirectUrl = `/campeonatos?autoRegister=${this.idRegistroPendiente}`;
      this.idRegistroPendiente = null;
    }

    this.router.navigate(['/login']);
  }

  verDetalles(id: number): void {
    this.router.navigate(['/campeonato/details', id]);
  }

  eliminarCampeonato(id: number): void {
    this.idEliminando = id;
    this.mostrarModalEliminar = true;
    this.bloquearModal();
  }

  cerrarModalEliminar(): void {
    this.mostrarModalEliminar = false;
    this.idEliminando = null;
    this.estaEliminando = false;
    this.desbloquearModal();
  }

  confirmarEliminacion(): void {
    if (this.idEliminando === null) return;

    this.estaEliminando = true;
    this.api.deleteCampeonato(this.idEliminando).subscribe({
      next: () => {
        this.campeonatos = this.campeonatos.filter(c => c.idCampeonato !== this.idEliminando);
        this.aplicarFiltros();
        this.cerrarModalEliminar();
      },
      error: (err) => {
        console.error('Error deleting championship:', err);
        this.estaEliminando = false;
        this.cerrarModalEliminar();
      }
    });
  }

  obtenerCuposDisponibles(participantes: number, capacidad: number | null, cuposDisponibles: number | null | undefined): number | null {
    if (cuposDisponibles !== null && cuposDisponibles !== undefined) return cuposDisponibles;
    if (capacidad === null || capacidad === undefined) return null;
    return capacidad - participantes;
  }

  obtenerPorcentajeProgreso(participantes: number, capacidad: number | null): number {
    if (!capacidad || capacidad <= 0) return 0;
    return Math.min(100, Math.max(0, (participantes / capacidad) * 100));
  }

  esCreador(championship: CampeonatoUI): boolean {
    return this.idUsuarioActual !== null && String(this.idUsuarioActual) === String(championship.creadoPor);
  }

  puedeInscribirse(championship: CampeonatoUI): boolean {
    if (this.esCreador(championship)) return false;
    return championship.estadoKey === 'PLANIFICADO' && !!championship.puedeInscribirse;
  }
}
