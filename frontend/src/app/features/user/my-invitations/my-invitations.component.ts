import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterModule } from '@angular/router';
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
    privatelocation: Location
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
        this.invitations = data.map((i: any) => ({
          ...i,
          estadoTexto: this.mapEstado(i.estado),
          expanded: false // Default collapsed
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
