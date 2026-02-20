import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { BackNavigationService } from '../../../core/services/back-navigation.service';

@Component({
  selector: 'app-my-invitations',
  standalone: true,
  imports: [CommonModule, RouterModule, LoadingSpinnerComponent],
  templateUrl: './my-invitations.component.html',
  styleUrls: ['./my-invitations.component.scss']
})
export class MyInvitationsComponent implements OnInit {
  pestanaActiva: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO' = 'PENDIENTE';
  cargando = true;
  invitaciones: any[] = [];
  invitacionesFiltradas: any[] = [];

  // Modales para acciones
  mostrarModalRechazar = false;
  mostrarModalCancelar = false;
  idInvitacionSeleccionada: number | null = null;
  procesando = false;

  constructor(
    private api: ApiService,
    private backNav: BackNavigationService,
    private location: Location,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.cargarInvitaciones();
  }
  mapEstado(estado: number): 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO' {
    switch (estado) {
      case 3: return 'ACEPTADO';
      case 4: return 'RECHAZADO';
      default: return 'PENDIENTE';
    }
  }


  cargarInvitaciones(): void {
    const userId = sessionStorage.getItem('idDocumento');
    if (!userId) {
      this.cargando = false;
      return;
    }

    this.cargando = true;
    this.api.getMisInvitaciones(userId).subscribe({
      next: (data) => {
        // Detailed Debug for ID issue
        if (data && data.length > 0) {
        }

        this.invitaciones = data.map((i: any) => ({
          id_invitacion: i.idincripcion,
          estado: i.estado,
          id_tipo: i.tipoUsuario,

          // 🔁 Mapeo de nombres del backend → frontend
          nombre_campeonato: i.campeonato,
          id_campeonato: i.idcampeonato || i.id_campeonato || i.idCampeonato || i.IdCampeonato || i.campeonato_id || i.campeonatoId,

          // Detalles del campeonato
          ciudad: i.ciudad_campeonato,

          // Fecha de invitación
          fecha_invitacion: i.fecha_inscripcion || i.fechaInscripcion || i.fecha_envio || i.fecha_registro || i.fecha_creacion,

          nombre_invitador: i.nombre_Creador,

          // internos del componente
          estadoTexto: this.mapEstado(i.estado),
          expanded: false
        }));

        this.aplicarFiltro();
        this.cargando = false;
      },
      error: (err) => {
        console.error('Error al cargar invitaciones', err);
        this.cargando = false;
      }
    });
  }

  seleccionarPestana(tab: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO'): void {
    this.pestanaActiva = tab;
    this.aplicarFiltro();
  }

  aplicarFiltro(): void {
    this.invitacionesFiltradas =
      this.invitaciones.filter(i => i.estadoTexto === this.pestanaActiva);
  }



  alternarExpandido(item: any): void {
    item.expanded = !item.expanded;
  }

  volverAtras(): void {
    this.backNav.backOr({ fallbackUrl: '/dashboard' });
  }

  verDetalles(item: any): void {
    const champId = item.id_campeonato || item.campeonato_id || item.IdCampeonato;
    if (!champId) {
      alert('No se puede ver detalles: ID de campeonato faltante.');
      console.warn('No se puede ver detalles: ID de campeonato faltante. Claves disponibles:', Object.keys(item));
      return;
    }

    this.router.navigate(['/campeonato/details', champId]);
  }

  // Acciones
  aceptarInvitacion(item: any): void {
    if (item.id_tipo === 5) {
      const champId = item.id_campeonato || item.campeonato_id || item.IdCampeonato;
      if (!champId) {
        alert('No se puede iniciar inscripción: ID de campeonato faltante.');
        return;
      }

      // Pasar un queryparam indicando que viene de una invitación
      this.router.navigate(['/campeonato/register', champId], {
        queryParams: { invitacionId: item.id_invitacion, tipo: 'invitado' }
      });
      return;
    }

    // Para jueces u otros roles, proceso normal
    this.procesando = true;
    this.api.gestionarInscripcionCampeonato(item.id_invitacion, 3).subscribe({
      next: () => {
        this.actualizarEstadoLocal(item.id_invitacion, 'ACEPTADO');
        this.procesando = false;
      },
      error: (e) => {
        console.error(e);
        this.procesando = false;
      }
    });
  }

  confirmarRechazo(id: number): void {
    this.idInvitacionSeleccionada = id;
    this.mostrarModalRechazar = true;
  }

  confirmarCancelacion(id: number): void {
    this.idInvitacionSeleccionada = id;
    this.mostrarModalCancelar = true;
  }

  finalizarRechazo(): void {
    if (!this.idInvitacionSeleccionada) return;
    this.procesando = true;
    this.api.gestionarInscripcionCampeonato(this.idInvitacionSeleccionada, 4).subscribe({
      next: () => {
        this.actualizarEstadoLocal(this.idInvitacionSeleccionada!, 'RECHAZADO');
        this.cerrarModales();
        this.procesando = false;
      },
      error: (e) => {
        console.error(e);
        this.procesando = false;
      }
    });
  }

  finalizarCancelacion(): void {
    if (!this.idInvitacionSeleccionada) return;
    this.procesando = true;
    this.api.eliminarInscripcion(this.idInvitacionSeleccionada).subscribe({
      next: () => {
        this.actualizarEstadoLocal(this.idInvitacionSeleccionada!, 'RECHAZADO');
        this.cerrarModales();
        this.procesando = false;
      },
      error: (e) => {
        console.error(e);
        this.procesando = false;
      }
    });
  }

  cerrarModales(): void {
    this.mostrarModalRechazar = false;
    this.mostrarModalCancelar = false;
    this.idInvitacionSeleccionada = null;
  }

  actualizarEstadoLocal(id: number, nuevoEstado: string): void {
    const item = this.invitaciones.find(i => i.id_invitacion === id);
    if (item) {
      item.estado = (nuevoEstado === 'ACEPTADO' ? 3 : (nuevoEstado === 'RECHAZADO' ? 4 : item.estado));
      item.estadoTexto = nuevoEstado;
      this.aplicarFiltro();
    }
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
  obtenerEtiquetaRol(roleId: number): string {
    switch (roleId) {
      case 5: return 'Competidor';
      case 6: return 'Juez Central';
      case 7: return 'Juez de Mesa';
      case 8: return 'Juez';
      case 10: return 'Juez Running';
      default: return 'Participante';
    }
  }
}
