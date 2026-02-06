import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common'; // Import Location
import { delay } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';

interface Invitacion {
  id: number;
  documento: string; // User's document
  nombre: string;
  email: string;
  avatar?: string; // Optional: mock avatar
  rol?: string; // Para jueces: Juez Central, Mesa, etc.
  estado: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO';
  tipo: 'COMPETIDOR' | 'JUEZ';
  fechaEnvio: string;
}

import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-championship-invitations',
  standalone: true,
  imports: [CommonModule, FormsModule, CustomSelectComponent, LoadingSpinnerComponent],
  templateUrl: './championship-invitations.component.html',
  styleUrls: ['./championship-invitations.component.scss']
})
export class ChampionshipInvitationsComponent implements OnInit {
  championshipId: string | null = null;

  judgeRoleOptions = [
    { value: 'Juez Central', label: 'Juez Central' },
    { value: 'Juez de Mesa', label: 'Juez de Mesa' },
    { value: 'Juez', label: 'Juez' }
  ];

  // States
  activeSection: 'COMPETIDOR' | 'JUEZ' = 'COMPETIDOR';
  activeTab: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO' = 'PENDIENTE';
  searchQuery: string = '';

  // Data
  invitations: Invitacion[] = [];
  filteredInvitations: Invitacion[] = [];
  paginatedInvitations: Invitacion[] = [];

  // Pagination
  currentPage: number = 1;
  itemsPerPage: number = 6;
  totalPages: number = 1;

  // Invite Modal States
  inviteModalOpen = false;
  inviteSearchQuery = '';
  availableUsers: any[] = []; // Mock users found
  selectedUser: any | null = null;
  selectedJudgeRole: string = 'Juez';
  sendingInvitation = false;
  loading = false;

  // Modal States
  cancelModalOpen = false;
  cancelTargetId: number | null = null;

  toastVisible = false;
  toastIsError = false;
  toastMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private api: ApiService,
    private scrollLock: ScrollLockService
  ) { }

  ngOnInit(): void {
    this.championshipId = this.route.snapshot.paramMap.get('id');
    if (this.championshipId) {
      this.loadInvitations();
    } else {
      this.applyFilters();
    }
  }

  private mapEstado(estado: number): 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO' {
    switch (estado) {
      case 2: return 'PENDIENTE';
      case 3: return 'ACEPTADO';
      case 4: return 'RECHAZADO';
      default: return 'PENDIENTE';
    }
  }

  loadInvitations(): void {
    if (!this.championshipId) return;
    this.loading = true;
    this.scrollLock.lock();

    this.api.getInvitationsByChampionship(this.championshipId)
      .pipe(delay(1000))
      .subscribe({
        next: (data) => {
          if (data && Array.isArray(data)) {
            console.log(data);
            this.invitations = data.map((item: any) => ({
              id: item.id || item.idincripcion,
              documento: item.idDocumento || item.usuario || '0',
              nombre: item.nombreC || item.nombre || 'Usuario',
              email: item.email || item.correo || '',
              avatar: item.avatar || '',
              rol: item.rol,
              estado: this.mapEstado(item.estado),
              tipo: item.tipoUsuario === 5 ? 'COMPETIDOR' : 'JUEZ',
              fechaEnvio: item.fechaInscripcion || item.fecha_inscripcion || item.fecha || item.fechaEnvio || item.fecha_envio || new Date().toISOString()
            }));
            this.applyFilters();
          } else {
            this.applyFilters();
          }
          this.loading = false;
          this.scrollLock.unlock();
        },
        error: (err) => {
          console.warn('API de invitaciones no disponible.', err);
          this.applyFilters();
          this.loading = false;
          this.scrollLock.unlock();
        }
      });
  }


  goBack(): void {
    this.location.back();
  }

  setActiveSection(section: 'COMPETIDOR' | 'JUEZ'): void {
    this.activeSection = section;
    this.currentPage = 1; // Reset pagination when switching context
    this.applyFilters();
  }

  setActiveTab(tab: 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO'): void {
    this.activeTab = tab;
    this.currentPage = 1;
    this.applyFilters();
  }

  applyFilters(): void {
    const q = this.searchQuery.toLowerCase().trim();

    this.filteredInvitations = this.invitations.filter(item => {
      // 1. Filter by Section (Type)
      const typeMatch = item.tipo === this.activeSection;

      // 2. Filter by Status (Tab)
      const statusMatch = item.estado === this.activeTab;

      // 3. Filter by Search (Name or ID - simulated by checking ID string)
      const searchMatch = !q ||
        item.nombre.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q) ||
        item.documento.includes(q);

      return typeMatch && statusMatch && searchMatch;
    });

    this.updatePagination();
  }

  updatePagination(): void {
    this.totalPages = Math.ceil(this.filteredInvitations.length / this.itemsPerPage) || 1;
    if (this.currentPage > this.totalPages) this.currentPage = 1;

    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    this.paginatedInvitations = this.filteredInvitations.slice(startIndex, endIndex);

    // Removed automatic scrollToTop here as requested
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagination();
      this.scrollToTop(); // Keep scroll only for pagination
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagination();
      this.scrollToTop(); // Keep scroll only for pagination
    }
  }

  scrollToTop(): void {
    const el = document.getElementById('invitations-top-anchor');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Invite Modal Logic
  openInviteModal(): void {
    this.inviteModalOpen = true;
    this.scrollLock.lock();
    this.inviteSearchQuery = '';
    this.availableUsers = [];
    this.selectedUser = null;
    this.selectedUser = null;
    this.selectedJudgeRole = 'Juez';
  }

  closeInviteModal(): void {
    this.inviteModalOpen = false;
    this.scrollLock.unlock();
  }

  private getTipoInscripcion(): number {
    if (this.activeSection === 'COMPETIDOR') {
      return 5;
    }
    // Para juez basta con enviar uno cualquiera (ej: 6)
    return 6;
  }

  searchUsers(): void {
    if (!this.inviteSearchQuery.trim()) {
      this.availableUsers = [];
      return;
    }
    const tipo = this.getTipoInscripcion();
    this.api.searchUsers(this.inviteSearchQuery, sessionStorage.getItem('idDocumento') || '', this.championshipId || '', tipo).subscribe({
      next: (users) => {
        this.availableUsers = (users || [])
          .filter(u => (u.idDocumento || u.documento || u.id) != '0')
          .map(u => ({
            id: u.idDocumento || u.documento || u.id,
            nombre: u.nombreC || u.nombre,
            email: u.correo || u.email || 'Sin correo visible',
            avatar: u.avatar || 'assets/default-avatar.png'
          }));
      },
      error: (err) => {
        console.error('Error finding users:', err);
        this.availableUsers = [];
      }
    });
  }

  selectUser(user: any): void {
    this.selectedUser = user;
    this.availableUsers = []; // Clear list to show selection state
  }

  unselectUser(): void {
    this.selectedUser = null;
    this.searchUsers(); // Show results again
  }

  sendInvitation(): void {
    if (!this.selectedUser) return;

    this.sendingInvitation = true;

    // Determine ID_tipo
    let idTipo = 5; // Default Competidor
    if (this.activeSection === 'JUEZ') {
      switch (this.selectedJudgeRole) {
        case 'Juez Central': idTipo = 6; break;
        case 'Juez de Mesa': idTipo = 7; break;
        case 'Juez': idTipo = 8; break;
        default: idTipo = 8;
      }
    }

    const payload = {
      id_usuario: this.selectedUser.id,
      id_campeonato: this.championshipId || '',
      id_tipo: idTipo
    };

    this.api.enviarInvitacion(payload).subscribe({
      next: (res) => {
        const newInvitation: Invitacion = {
          id: res.id || Math.floor(Math.random() * 10000), // Use ID from response if available
          documento: this.selectedUser.id,
          nombre: this.selectedUser.nombre,
          email: this.selectedUser.email,
          avatar: this.selectedUser.avatar,
          tipo: this.activeSection,
          estado: 'PENDIENTE',
          fechaEnvio: new Date().toISOString().split('T')[0],
          rol: this.activeSection === 'JUEZ' ? this.selectedJudgeRole : undefined
        };

        this.invitations.unshift(newInvitation); // Add to top
        this.sendingInvitation = false;
        this.closeInviteModal();
        this.showToast(`Invitación enviada a ${newInvitation.nombre}`);

        // Switch to "Pending" tab so user sees it
        this.setActiveTab('PENDIENTE');
        this.applyFilters();
      },
      error: (err) => {
        console.error('Error enviando invitación', err);
        this.sendingInvitation = false;
        // Don't close modal on error so user can retry
        this.showToast(err.error?.message || 'No se ha enviado con exito', true);
      }
    });
  }

  // Cancel / Delete Invitation Logic
  confirmCancel(id: number): void {
    this.cancelTargetId = id;
    this.cancelModalOpen = true;
    this.scrollLock.lock();
  }

  closeCancelModal(): void {
    this.cancelModalOpen = false;
    this.cancelTargetId = null;
    this.scrollLock.unlock();
  }

  finalizeCancel(): void {
    if (this.cancelTargetId) {
      this.api.deleteInvitation(this.cancelTargetId).subscribe({
        next: () => {
          // Remove from list
          this.invitations = this.invitations.filter(i => i.id !== this.cancelTargetId);

          const msg = this.activeTab === 'PENDIENTE'
            ? 'Invitación cancelada correctamente.'
            : 'Usuario eliminado de la lista de invitaciones.';

          this.showToast(msg);
          this.applyFilters();
          this.closeCancelModal();
        },
        error: (err) => {
          console.error('Error deleting invitation', err);
          this.showToast('Error al cancelar la invitación: ' + (err.error?.message || 'Error desconocido'), true);
          this.closeCancelModal();
        }
      });
    } else {
      this.closeCancelModal();
    }
  }

  showToast(msg: string, isError: boolean = false): void {
    this.toastMessage = msg;
    this.toastIsError = isError;
    this.toastVisible = true;
    setTimeout(() => {
      this.toastVisible = false;
    }, 3000);
  }
}
