import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { delay } from 'rxjs/operators';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';

@Component({
  selector: 'app-my-inscriptions',
  standalone: true,
  imports: [CommonModule, RouterModule, LoadingSpinnerComponent],
  templateUrl: './my-inscriptions.component.html',
  styleUrl: './my-inscriptions.component.scss'
})
export class MyInscriptionsComponent implements OnInit {
  pestanaActiva: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO' = 'PENDIENTE';
  cargando = true;
  inscripciones: any[] = [];
  inscripcionesFiltradas: any[] = [];

  mostrarModalEliminar = false;
  idInscripcionSeleccionada: number | null = null;
  eliminando = false;

  constructor(
    private api: ApiService,
    private backNav: BackNavigationService,
    private location: Location,
    private scrollLock: ScrollLockService
  ) { }

  ngOnInit(): void {
    this.cargarInscripciones();
  }

  cargarInscripciones(): void {
    const userId = sessionStorage.getItem('idDocumento');
    if (!userId) {
      console.warn('No se encontró ID de usuario en sesión');
      this.cargando = false;
      return;
    }

    this.cargando = true;
    this.scrollLock.lock();
    this.api.getMisInscripciones(userId)
      .pipe(delay(1000))
      .subscribe({
        next: (data: any[]) => {
          this.inscripciones = (data || []).map(item => ({
            ...item,
            id: item.idInscripcion,
            estado: this.mapearEstado(item.estado),
            expanded: false
          })) || [];
          this.aplicarFiltro();
          this.cargando = false;
          this.scrollLock.unlock();
        },
        error: (err) => {
          console.error('Error al cargar inscripciones', err);
          this.inscripciones = [];
          this.aplicarFiltro();
          this.cargando = false;
          this.scrollLock.unlock();
        }
      });
  }

  alternarDetalles(item: any): void {
    item.expanded = !item.expanded;
  }

  mapearEstado(status: number): string {
    switch (status) {
      case 3: return 'ACEPTADO';
      case 2: return 'PENDIENTE';
      case 4: return 'RECHAZADO';
      default: return 'PENDIENTE';
    }
  }

  seleccionarPestana(tab: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO'): void {
    this.pestanaActiva = tab;
    this.aplicarFiltro();
  }

  aplicarFiltro(): void {
    this.inscripcionesFiltradas = this.inscripciones.filter(i => i.estado === this.pestanaActiva);
  }

  volverAtras(): void {
    this.location.back();
  }

  solicitarEliminar(id: number): void {
    this.idInscripcionSeleccionada = id;
    this.mostrarModalEliminar = true;
  }

  cancelarEliminar(): void {
    this.mostrarModalEliminar = false;
    this.idInscripcionSeleccionada = null;
  }

  confirmarEliminar(): void {
    if (!this.idInscripcionSeleccionada) return;

    this.eliminando = true;
    this.api.eliminarInscripcion(this.idInscripcionSeleccionada).subscribe({
      next: () => {
        this.inscripciones = this.inscripciones.filter(i => i.id !== this.idInscripcionSeleccionada);
        this.aplicarFiltro();
        this.eliminando = false;
        this.mostrarModalEliminar = false;
        this.idInscripcionSeleccionada = null;
      },
      error: (err) => {
        console.error('Error al eliminar inscripción', err);
        this.eliminando = false;
        alert('Error al eliminar la inscripción.');
      }
    });
  }

  obtenerClaseEstado(status: string): string {
    switch (status) {
      case 'ACEPTADO': return 'status-accepted';
      case 'RECHAZADO': return 'status-rejected';
      default: return 'status-pending';
    }
  }

  obtenerEtiquetaEstado(status: string): string {
    switch (status) {
      case 'ACEPTADO': return 'Aceptada';
      case 'RECHAZADO': return 'Rechazada';
      case 'PENDIENTE': return 'Pendiente';
      default: return status;
    }
  }
}
