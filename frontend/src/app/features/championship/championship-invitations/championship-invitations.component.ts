import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common'; // Import Location
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
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

@Component({
  selector: 'app-championship-invitations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './championship-invitations.component.html',
  styleUrls: ['./championship-invitations.component.scss']
})
export class ChampionshipInvitationsComponent implements OnInit {
  championshipId: string | null = null;

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
  selectedJudgeRole: string = 'Juez Central';
  sendingInvitation = false;

  // Modal States
  cancelModalOpen = false;
  cancelTargetId: number | null = null;

  toastVisible = false;
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
    this.mockData(); // Load initial data
    this.applyFilters();
  }

  mockData(): void {
    // Generate some mock invitations
    this.invitations = [
      // Competidores Pendientes
      { id: 1, documento: '1000203040', nombre: 'Miguel O´Hara', email: 'miguel.2099@spider.com', avatar: '', tipo: 'COMPETIDOR', estado: 'PENDIENTE', fechaEnvio: '2025-10-01' },
      { id: 2, documento: '1000203041', nombre: 'Gwen Stacy', email: 'gwen.stacy@spider.com', avatar: '', tipo: 'COMPETIDOR', estado: 'PENDIENTE', fechaEnvio: '2025-10-02' },
      // Competidores Aceptados
      { id: 3, documento: '1000203042', nombre: 'Peter Parker', email: 'peter.parker@spider.com', avatar: '', tipo: 'COMPETIDOR', estado: 'ACEPTADO', fechaEnvio: '2025-09-28' },
      { id: 4, documento: '1000203043', nombre: 'Miles Morales', email: 'miles.morales@spider.com', avatar: '', tipo: 'COMPETIDOR', estado: 'ACEPTADO', fechaEnvio: '2025-09-29' },
      // Competidores Rechazados
      { id: 5, documento: '1000203044', nombre: 'Eddie Brock', email: 'venom@symbiote.com', avatar: '', tipo: 'COMPETIDOR', estado: 'RECHAZADO', fechaEnvio: '2025-09-30' },

      // Jueces Pendientes
      { id: 6, documento: '9000102030', nombre: 'Matt Murdock', email: 'matt@nelsonmurdock.com', rol: 'Juez Central', tipo: 'JUEZ', estado: 'PENDIENTE', fechaEnvio: '2025-10-05' },
      { id: 7, documento: '9000102031', nombre: 'Jennifer Walters', email: 'jen@shehulk.com', rol: 'Juez de Mesa', tipo: 'JUEZ', estado: 'PENDIENTE', fechaEnvio: '2025-10-06' },
      // Jueces Aceptados
      { id: 8, documento: '9000102032', nombre: 'Steve Rogers', email: 'cap@avengers.com', rol: 'Juez Principal', tipo: 'JUEZ', estado: 'ACEPTADO', fechaEnvio: '2025-09-15' },
      // Jueces Rechazados
      { id: 9, documento: '9000102033', nombre: 'Tony Stark', email: 'ironman@stark.com', rol: 'Juez de Mesa', tipo: 'JUEZ', estado: 'RECHAZADO', fechaEnvio: '2025-09-10' },
    ];
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
    this.selectedJudgeRole = 'Juez Central';
  }

  closeInviteModal(): void {
    this.inviteModalOpen = false;
    this.scrollLock.unlock();
  }

  searchUsers(): void {
    if (!this.inviteSearchQuery.trim()) {
      this.availableUsers = [];
      return;
    }

    this.api.searchUsers(this.inviteSearchQuery).subscribe({
      next: (users) => {
        this.availableUsers = (users || []).map(u => ({
          id: u.ID_documento || u.documento || u.id,
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

    // Simulate API call
    setTimeout(() => {
      const newInvitation: Invitacion = {
        id: Math.floor(Math.random() * 10000),
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
    }, 1000);
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
      // Remove from list
      this.invitations = this.invitations.filter(i => i.id !== this.cancelTargetId);

      const msg = this.activeTab === 'PENDIENTE'
        ? 'Invitación cancelada correctamente.'
        : 'Usuario eliminado de la lista de invitaciones.';

      this.showToast(msg);
      this.applyFilters();
    }
    this.closeCancelModal();
  }

  showToast(msg: string): void {
    this.toastMessage = msg;
    this.toastVisible = true;
    setTimeout(() => {
      this.toastVisible = false;
    }, 3000);
  }
}
