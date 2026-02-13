
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { NavigationHistoryService } from '../../../core/services/navigation-history.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';

@Component({
    selector: 'app-championship-panel',
    standalone: true,
    imports: [CommonModule, RouterModule, LoadingSpinnerComponent],
    templateUrl: './championship-panel.component.html',
    styleUrls: ['./championship-panel.component.scss']
})
export class ChampionshipPanelComponent implements OnInit, OnDestroy {
    id: string | null = null;
    campeonato: any = null;
    loading = true;
    error: string | null = null;
    currentUserId: string | null = null;
    copied = false;

    // Modal states
    showDeleteModal = false;
    showPublishModal = false;
    showEditBlockedModal = false;
    isDeleting = false;
    isPublishing = false;

    constructor(
        private route: ActivatedRoute,
        private api: ApiService,
        private router: Router,
        private backNav: BackNavigationService,
        private navHistory: NavigationHistoryService,
        private scrollLock: ScrollLockService
    ) { }

    ngOnInit(): void {
        this.currentUserId = sessionStorage.getItem('idDocumento');
        this.id = this.route.snapshot.paramMap.get('id');

        if (this.id) {
            this.loadData();
        } else {
            this.error = 'ID de campeonato no válido.';
            this.loading = false;
        }
    }

    loadData(): void {
        this.loading = true;
        this.api.getCampeonatoById(this.id!).subscribe({
            next: (data) => {
                this.campeonato = data;

                // Security Check: Visibility (Deleted/Hidden)
                const isVisible = (
                    data.visible !== 0 && data.visible !== '0' && data.visible !== false &&
                    data.Visible !== 0 && data.Visible !== '0' && data.Visible !== false &&
                    data.visibilidad !== 0 && data.visibilidad !== '0' && data.visibilidad !== false &&
                    data.Visibilidad !== 0 && data.Visibilidad !== '0' && data.Visibilidad !== false
                );

                if (!isVisible) {
                    this.router.navigate(['/mis-campeonatos']);
                    return;
                }

                // Validate Ownership
                if (!this.isOwner()) {
                    this.router.navigate(['/mis-campeonatos']); // Redirect if not owner
                    return;
                }

                // Calculate status
                if (!this.campeonato.pais) this.campeonato.pais = 'Colombia'; // Ghost
                if (!this.campeonato.ciudad) this.campeonato.ciudad = 'Bogotá'; // Ghost
                console.log('Campeonato Data:', this.campeonato); // Debug: Check incoming status
                this.campeonato.estadoReal = this.calculateStatus(this.campeonato.fechaInicio, this.campeonato.fecha_fin);

                this.loading = false;
            },
            error: (err) => {
                console.error('Error loading championship panel:', err);
                this.error = 'No se pudo cargar la información del campeonato.';
                this.loading = false;
            }
        });
    }

    calculateStatus(fechaInicio: string, fechaFin: string | undefined): string {
        if (!fechaInicio) return 'PLANIFICADO';

        // Priority: Explicit Status > Privacy (Draft) > Date Logic
        if (this.campeonato?.estado === 'BORRADOR') return 'BORRADOR';
        if (this.campeonato?.estado === 'LISTO') return 'LISTO';

        // If not public (and not LISTO/BORRADOR), it is a Draft
        // Check for loose equality or boolean
        const isPublic = this.campeonato?.esPublico === true || this.campeonato?.esPublico === 1 || this.campeonato?.esPublico === '1';
        if (!isPublic) return 'BORRADOR';

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

    isOwner(): boolean {
        if (!this.campeonato || !this.currentUserId) return false;
        return String(this.campeonato.creadoPor) === String(this.currentUserId);
    }

    goBack(): void {
        this.router.navigate(['/mis-campeonatos']);
    }

    copyCode(): void {
        const codeToCopy = this.campeonato?.Codigo || this.campeonato?.codigo;
        if (!codeToCopy) return;

        navigator.clipboard.writeText(codeToCopy).then(() => {
            this.copied = true;
            setTimeout(() => this.copied = false, 2000);
        });
    }

    // Action Methods
    startChampionship(): void {
        this.router.navigate(['/campeonato/live', this.id]);
    }

    sendInvitations(): void {
        this.router.navigate(['/campeonato/invitations', this.id]);
    }

    viewInscriptions(): void {
        this.router.navigate(['/campeonato/inscriptions', this.id]);
    }

    editChampionship(): void {
        if (this.campeonato.estado === 'LISTO') {
            this.showEditBlockedModal = true;
            this.scrollLock.lock();
            return;
        }
        this.router.navigate(['/campeonato/edit', this.id]);
    }

    closeEditBlockedModal(): void {
        this.showEditBlockedModal = false;
        this.scrollLock.unlock();
    }

    publishChampionship(): void {
        if (!this.id || this.isPublishing) return;
        this.showPublishModal = true;
        this.scrollLock.lock();
    }

    closePublishModal(): void {
        this.showPublishModal = false;
        this.isPublishing = false;
        this.scrollLock.unlock();
    }

    confirmPublish(): void {
        this.isPublishing = true;
        // Construct payload to update status to LISTO and ensure visibility
        const payload = {
            ...this.campeonato,
            estado: 'LISTO',
            esPublico: 1,
            visible: 1,
            // Ensure modalities are sent in expected format if they were parsed
            modalidades: typeof this.campeonato.modalidades === 'string'
                ? JSON.parse(this.campeonato.modalidades)
                : this.campeonato.modalidades
        };

        this.api.updateCampeonato(this.id!, payload).subscribe({
            next: (updatedData) => {
                this.closePublishModal();
                // Update local state
                this.campeonato.estado = 'LISTO';
                this.campeonato.esPublico = 1;
                this.campeonato.visible = 1;
                this.campeonato.estadoReal = 'LISTO';
            },
            error: (err) => {
                console.error('Error publishing championship:', err);
                this.isPublishing = false;
                alert('Hubo un error al publicar el campeonato. Por favor intenta de nuevo.'); // Fallback alert for error
            }
        });
    }

    viewPublicDetails(): void {
        this.router.navigate(['/campeonato/details', this.id]);
    }

    // Delete Logic
    deleteChampionship(): void {
        this.showDeleteModal = true;
        this.scrollLock.lock();
    }

    closeDeleteModal(): void {
        this.showDeleteModal = false;
        this.isDeleting = false;
        this.scrollLock.unlock();
    }

    confirmDelete(): void {
        if (!this.id) return;
        this.isDeleting = true;
        this.api.deleteCampeonato(this.id).subscribe({
            next: () => {
                this.closeDeleteModal();
                this.navHistory.removeLastUrl(); // Clean history
                this.router.navigate(['/mis-campeonatos']);
            },
            error: (err) => {
                console.error('Error deleting:', err);
                this.isDeleting = false;
                this.closeDeleteModal(); // Unlock scroll even on error
                this.navHistory.removeLastUrl(); // Clean history even on fallback
                this.router.navigate(['/mis-campeonatos']);
            }
        });
    }

    ngOnDestroy(): void {
        this.scrollLock.unlock();
    }
}
