import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { delay } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { ApiService } from '../../../core/services/api.service';
import { UsuarioInscripcionDTO } from '../../../core/models/domain.models';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

// Extend DTO for UI properties if necessary (like expanded state)
interface InscripcionUI extends UsuarioInscripcionDTO {
  expandido?: boolean;
  edad?: number | null; // Calculated
  estadoTexto?: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO'; // Derived from estado number
}

@Component({
  selector: 'app-championship-inscriptions',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent],
  templateUrl: './championship-inscriptions.component.html',
  styleUrls: ['./championship-inscriptions.component.scss']
})
export class ChampionshipInscriptionsComponent implements OnInit {
  idCampeonato: string | null = null;
  busqueda: string = '';

  pestanaActiva: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO' = 'PENDIENTE';

  inscripciones: InscripcionUI[] = [];
  inscripcionesFiltradas: InscripcionUI[] = [];

  // Logic states
  modalRechazoAbierto = false;
  cargando = false;
  idObjetivoRechazo: number | null = null;
  originalIdObjetivoRechazo: number | null = null; // In case we need the raw ID

  modalEliminarAbierto = false;
  idObjetivoEliminar: number | null = null;

  avisoVisible = false;
  mensajeAviso = '';

  // Pagination
  paginaActual: number = 1;
  itemsPorPagina: number = 5;
  totalPaginas: number = 1;
  inscripcionesPaginadas: InscripcionUI[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private backNav: BackNavigationService,
    private scrollLock: ScrollLockService,
    private location: Location,
    private api: ApiService
  ) { }

  ngOnInit(): void {
    this.idCampeonato = this.route.snapshot.paramMap.get('id');
    if (this.idCampeonato) {
      this.cargarInscripciones();
    } else {
      this.aplicarFiltros();
    }
  }

  calcularEdad(fechaNacimiento: string | Date): number | null {
    if (!fechaNacimiento) return null;
    const birthDate = new Date(fechaNacimiento);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  cargarInscripciones(): void {
    if (!this.idCampeonato) return;
    this.cargando = true;
    this.scrollLock.lock();

    this.api.getInscriptionsByChampionship(this.idCampeonato)
      .pipe(delay(1000))
      .subscribe({
        next: (data: any[]) => {
          if (data && Array.isArray(data)) {
            this.inscripciones = data.map((item: any) => {
              // Map raw data to DTO/UI
              // Ensure we use the properties from UsuarioInscripcionDTO or raw backend response
              // Backend DTO: idincripcion, nombreC, idDocumento, etc.

              // Calculate derived fields
              const estadoNum = item.estado; // 2=Pend, 3=Acc, 4=Rej based on previous logic observation
              let estadoTexto: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO' = 'PENDIENTE';
              if (estadoNum === 3) estadoTexto = 'ACEPTADO';
              else if (estadoNum === 4) estadoTexto = 'RECHAZADO';
              else estadoTexto = 'PENDIENTE'; // Default to 2

              const edadCalc = item.fechaNacimiento ? this.calcularEdad(item.fechaNacimiento) : null;

              // Ensure 'secciones' is array
              const seccionesArr = Array.isArray(item.secciones) ? item.secciones : (item.secciones ? [item.secciones] : []);

              const mapped: InscripcionUI = {
                ...item, // Spread raw properties (idincripcion, nombreC, etc.)
                secciones: seccionesArr,
                expandido: false,
                edad: edadCalc,
                estadoTexto: estadoTexto,
                // Ensure specific fields exist if spread missing or null
                fechaInscripcion: item.fechaInscripcion || new Date().toISOString()
              };

              // Verify fallback for DTO mismatches if needed?
              // Assuming 'item' matches UsuarioInscripcionDTO structure mostly.
              return mapped;
            });

            this.aplicarFiltros();
          }
          this.cargando = false;
          this.scrollLock.unlock();
        },
        error: (err) => {
          console.warn('Error cargando inscripciones:', err);
          this.cargando = false;
          this.scrollLock.unlock();
          this.aplicarFiltros();
        }
      });
  }

  seleccionarPestana(tab: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO'): void {
    this.pestanaActiva = tab;
    this.aplicarFiltros();
  }

  volverAtras(): void {
    this.location.back();
  }

  alternarDetalles(id: number): void {
    // id refers to idincripcion
    const item = this.inscripciones.find(i => i.idincripcion === id);
    if (item) {
      item.expandido = !item.expandido;
    }
  }

  aplicarFiltros(): void {
    const q = this.busqueda.toLowerCase().trim();
    this.inscripcionesFiltradas = this.inscripciones.filter(i => {
      // Filter by status
      const matchesTab = i.estadoTexto === this.pestanaActiva;

      // Filter by search (Nombre or Documento)
      // nombreC and idDocumento from DTO
      const nombre = i.nombreC || '';
      const doc = i.idDocumento || '';
      const matchesSearch = (nombre.toLowerCase().includes(q) || String(doc).includes(q));

      return matchesTab && matchesSearch;
    });

    this.paginaActual = 1;
    this.actualizarPaginacion();
  }

  actualizarPaginacion(): void {
    this.totalPaginas = Math.ceil(this.inscripcionesFiltradas.length / this.itemsPorPagina) || 1;
    if (this.paginaActual > this.totalPaginas) this.paginaActual = 1;

    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    const fin = inicio + this.itemsPorPagina;
    this.inscripcionesPaginadas = this.inscripcionesFiltradas.slice(inicio, fin);
  }

  paginaSiguiente(): void {
    if (this.paginaActual < this.totalPaginas) {
      this.paginaActual++;
      this.actualizarPaginacion();
      this.irArriba();
    }
  }

  paginaAnterior(): void {
    if (this.paginaActual > 1) {
      this.paginaActual--;
      this.actualizarPaginacion();
      this.irArriba();
    }
  }

  private irArriba(): void {
    const element = document.getElementById('inscriptions-search-anchor');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  aceptarInscripcion(inscripcion: InscripcionUI): void {
    this.cargando = true;
    // 3 = ACEPTADO
    this.api.gestionarInscripcionCampeonato(inscripcion.idincripcion, 3).subscribe({
      next: () => {
        inscripcion.estadoTexto = 'ACEPTADO';
        inscripcion.estado = 3;
        this.mostrarAviso(`El competidor ${inscripcion.nombreC} ha sido aceptado con éxito.`);
        this.aplicarFiltros();
        this.cargando = false;
      },
      error: (err) => {
        console.error(err);
        this.mostrarAviso('Error al aceptar inscripción');
        this.cargando = false;
      }
    });
  }

  confirmarRechazo(id: number): void {
    this.idObjetivoRechazo = id;
    this.modalRechazoAbierto = true;
    this.scrollLock.lock();
  }

  cerrarModalRechazo(): void {
    this.modalRechazoAbierto = false;
    this.idObjetivoRechazo = null;
    this.scrollLock.unlock();
  }

  finalizarRechazo(): void {
    if (this.idObjetivoRechazo) {
      this.cargando = true;
      // 4 = RECHAZADO
      this.api.gestionarInscripcionCampeonato(this.idObjetivoRechazo, 4).subscribe({
        next: () => {
          this.mostrarAviso(`Inscripción rechazada.`);
          this.cargarInscripciones();
        },
        error: (err) => {
          console.error(err);
          this.mostrarAviso('Error al rechazar inscripción');
          this.cargando = false;
        }
      });
    }
    this.cerrarModalRechazo();
  }

  limpiarModalidad(mod: string): string {
    if (!mod) return '';
    let cleaned = mod.replace(/-\s*Peso:\s*SIN_PESO\s*kg/gi, '')
      .replace(/Peso:\s*SIN_PESO\s*kg/gi, '')
      .replace(/-\s*Peso:\s*SIN_PESO/gi, '')
      .replace(/-\s*Edad:\s*NULL/gi, '')
      .replace(/Edad:\s*NULL\s*-\s*/gi, '')
      .replace(/Edad:\s*NULL/gi, '');

    cleaned = cleaned.replace(/\s*-\s*-\s*/g, ' - ').replace(/\s*-\s*$/, '').trim();

    return cleaned;
  }

  confirmarEliminacion(id: number): void {
    this.idObjetivoEliminar = id;
    this.modalEliminarAbierto = true;
    this.scrollLock.lock();
  }

  cerrarModalEliminar(): void {
    this.modalEliminarAbierto = false;
    this.idObjetivoEliminar = null;
    this.scrollLock.unlock();
  }

  finalizarEliminacion(): void {
    if (this.idObjetivoEliminar) {
      this.cargando = true;
      // Eliminar -> Estado 4 (Rechazado) according to previous logic
      this.api.gestionarInscripcionCampeonato(this.idObjetivoEliminar, 4).subscribe({
        next: () => {
          this.mostrarAviso('Competidor eliminado (enviado a rechazados).');
          this.cargarInscripciones();
        },
        error: (err) => {
          console.error(err);
          this.mostrarAviso('Error al eliminar');
          this.cargando = false;
        }
      });
    }
    this.cerrarModalEliminar();
  }

  mostrarAviso(msg: string): void {
    this.mensajeAviso = msg;
    this.avisoVisible = true;
    setTimeout(() => {
      this.avisoVisible = false;
    }, 3000);
  }
}
