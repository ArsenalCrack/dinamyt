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
  activeTab: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO' = 'PENDIENTE';
  loading = true;
  invitations: any[] = [];
  filteredInvitations: any[] = [];

  // Modals for actions
  showRejectModal = false;
  showCancelModal = false;
  selectedInvitationId: number | null = null;
  processing = false;

  constructor(
    private api: ApiService,
    private backNav: BackNavigationService,
    private location: Location,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.loadInvitations();
  }
  mapEstado(estado: number): 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO' {
    switch (estado) {
      case 3: return 'ACEPTADO';
      case 4: return 'RECHAZADO';
      default: return 'PENDIENTE';
    }
  }


  loadInvitations(): void {
    const userId = sessionStorage.getItem('idDocumento');
    if (!userId) {
      this.loading = false;
      return;
    }

    this.loading = true;
    this.api.getMisInvitaciones(userId).subscribe({
      next: (data) => {
        // Detailed Debug for ID issue
        if (data && data.length > 0) {
          console.log('Sample Raw Invitation Keys:', Object.keys(data[0]));
          console.log('Sample Raw Invitation Values:', JSON.stringify(data[0]));
        }

        this.invitations = data.map((i: any) => ({
          id_invitacion: i.idincripcion,
          estado: i.estado,
          id_tipo: i.tipoUsuario,

          // 🔁 Mapeo de nombres del backend → frontend
          nombre_campeonato: i.campeonato,
          // Handle various possible backend naming conventions for ids
          // We try extensive mapping because the field name is uncertain
          id_campeonato: i.id_campeonato || i.idCampeonato || i.IdCampeonato || i.campeonato_id || i.campeonatoId,

          // Championship details (if needed)
          ciudad: i.ciudad_campeonato,

          // Invitation Date details (User requested fecha_inscripcion)
          // We include fecha_envio as likely candidate from other endpoints
          fecha_invitacion: i.fecha_inscripcion || i.fechaInscripcion || i.fecha_envio || i.fecha_registro || i.fecha_creacion,

          nombre_invitador: i.nombre_Creador,

          // internos del componente
          estadoTexto: this.mapEstado(i.estado),
          expanded: false
        }));

        this.applyFilter();
        this.loading = false;
      },
      error: (err) => {
        console.error('Error fetching invitations', err);
        this.loading = false;
      }
    });
  }

  setTab(tab: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO'): void {
    this.activeTab = tab;
    this.applyFilter();
  }

  applyFilter(): void {
    this.filteredInvitations =
      this.invitations.filter(i => i.estadoTexto === this.activeTab);
  }



  toggleExpanded(item: any): void {
    item.expanded = !item.expanded;
  }

  goBack(): void {
    this.backNav.backOr({ fallbackUrl: '/dashboard' });
  }

  viewDetails(item: any): void {
    if (!item.id_campeonato) {
      console.warn('Cannot view details: Championship ID missing. Available keys:', Object.keys(item));
      return;
    }

    // Rol 5 = Competidor
    if (item.id_tipo === 5) {
      this.router.navigate(['/campeonato/register', item.id_campeonato]);
    } else {
      this.router.navigate(['/campeonato/details', item.id_campeonato]);
    }
  }

  // Actions
  acceptInvitation(id: number): void {
    this.processing = true;
    this.api.responderInvitacion(id, 'ACEPTADO').subscribe({
      next: () => {
        this.updateLocalStatus(id, 'ACEPTADO');
        this.processing = false;
      },
      error: (e) => {
        console.error(e);
        this.processing = false;
      }
    });
  }

  confirmReject(id: number): void {
    this.selectedInvitationId = id;
    this.showRejectModal = true;
  }

  confirmCancel(id: number): void {
    this.selectedInvitationId = id;
    this.showCancelModal = true;
  }

  finalizeReject(): void {
    if (!this.selectedInvitationId) return;
    this.processing = true;
    this.api.responderInvitacion(this.selectedInvitationId, 'RECHAZADO').subscribe({
      next: () => {
        this.updateLocalStatus(this.selectedInvitationId!, 'RECHAZADO');
        this.closeModals();
        this.processing = false;
      },
      error: (e) => {
        console.error(e);
        this.processing = false;
      }
    });
  }

  finalizeCancel(): void {
    if (!this.selectedInvitationId) return;
    // "Cancelar invitación cuando ya haya sido aceptada" - treating as Reject/Cancel
    this.processing = true;
    this.api.responderInvitacion(this.selectedInvitationId, 'CANCELADO').subscribe({
      next: () => {
        // Maybe remove it or move to Rejected tab? Let's move to Rejected/Cancelled if that state exists
        // For now moving to rejected tab locally
        this.updateLocalStatus(this.selectedInvitationId!, 'RECHAZADO');
        this.closeModals();
        this.processing = false;
      },
      error: (e) => {
        console.error(e);
        this.processing = false;
      }
    });
  }

  closeModals(): void {
    this.showRejectModal = false;
    this.showCancelModal = false;
    this.selectedInvitationId = null;
  }

  updateLocalStatus(id: number, newStatus: string): void {
    const item = this.invitations.find(i => i.id_invitacion === id);
    if (item) {
      item.estado = (newStatus === 'ACEPTADO' ? 3 : (newStatus === 'RECHAZADO' ? 4 : item.estado));
      item.estadoTexto = newStatus;
      this.applyFilter();
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'ACEPTADO': return 'status-accepted';
      case 'RECHAZADO': return 'status-rejected';
      default: return 'status-pending';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'ACEPTADO': return 'Aceptada';
      case 'RECHAZADO': return 'Rechazada';
      case 'PENDIENTE': return 'Pendiente';
      default: return status;
    }
  }
  getRoleLabel(roleId: number): string {
    switch (roleId) {
      case 5: return 'Competidor';
      case 6: return 'Juez Central';
      case 7: return 'Juez de Mesa';
      case 8: return 'Juez';
      default: return 'Participante';
    }
  }
}
