import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { FormsModule } from '@angular/forms';

interface Participante {
    id: number;
    nombre: string;
    academia: string;
    modalidad: string;
    cinturon: string;
    peso: string;
    edad: string;
    genero: string;
    pais?: string;
    ciudad?: string;
}

interface Juez {
    id: number;
    nombre: string;
    avatar: string;
}

@Component({
    selector: 'app-championship-details',
    standalone: true,
    imports: [CommonModule, RouterModule, LoadingSpinnerComponent, FormsModule, CustomSelectComponent],
    templateUrl: './championship-details.component.html',
    styleUrls: ['./championship-details.component.scss']
})
export class ChampionshipDetailsComponent implements OnInit {
    id: string | null = null;
    campeonato: any = null;
    loading = true;
    error: string | null = null;
    currentUserId: string | null = null;
    copied = false;
    showDeleteModal = false;
    isDeleting = false;

    // Jueces
    jueces: Juez[] = [];

    // Participantes
    participantes: Participante[] = [];
    filteredParticipantes: Participante[] = [];

    // Filtros
    searchQuery: string = '';
    modalidadFilter: string = 'TODAS';

    // Filtros específicos de categoría
    pesoFilter: string = 'TODAS';
    cinturonFilter: string = 'TODAS';
    edadFilter: string = 'TODAS';
    generoFilter: string = 'TODAS';

    // Config and state
    modalidadesConfig: any[] = [];
    filtersVisible = {
        cinturon: true,
        peso: true,
        edad: true,
        genero: true
    };

    // Sorting
    sortOptions = [
        { label: 'Nombre (A-Z)', value: 'nombre-asc' },
        { label: 'Nombre (Z-A)', value: 'nombre-desc' },
        { label: 'Academia (A-Z)', value: 'academia-asc' },
        { label: 'Academia (Z-A)', value: 'academia-desc' },
        { label: 'Modalidad (A-Z)', value: 'modalidad-asc' },
        { label: 'Modalidad (Z-A)', value: 'modalidad-desc' },
        { label: 'Cinturón (A-Z)', value: 'cinturon-asc' },
        { label: 'Cinturón (Z-A)', value: 'cinturon-desc' },
        { label: 'Peso (Menor a Mayor)', value: 'peso-asc' },
        { label: 'Peso (Mayor a Menor)', value: 'peso-desc' },
        { label: 'Edad (Menor a Mayor)', value: 'edad-asc' },
        { label: 'Edad (Mayor a Menor)', value: 'edad-desc' },
        { label: 'Género (A-Z)', value: 'genero-asc' },
        { label: 'Género (Z-A)', value: 'genero-desc' }
    ];
    currentSort: string = 'nombre-asc';

    modalidadesOptions: { label: string, value: string }[] = [];
    pesosOptions: { label: string, value: string }[] = [];
    cinturonesOptions: { label: string, value: string }[] = [];
    edadesOptions: { label: string, value: string }[] = [];
    generosOptions: { label: string, value: string }[] = [];

    filteredCount = 0;
    showMobileFilters = false;
    showMobileActions = false;

    // Section states
    isInfoExpanded = true;
    isJudgesExpanded = false;
    isParticipantsExpanded = true;

    constructor(
        private route: ActivatedRoute,
        private api: ApiService,
        private router: Router,
        private backNav: BackNavigationService,
        private scrollLock: ScrollLockService
    ) { }

    ngOnInit(): void {
        this.currentUserId = sessionStorage.getItem('idDocumento');
        this.id = this.route.snapshot.paramMap.get('id');
        if (this.id) {
            this.loadData();
        } else {
            this.error = 'No se proporcionó un ID de campeonato.';
            this.loading = false;
        }
    }

    loadData(): void {
        this.loading = true;
        this.api.getCampeonatoById(this.id!).subscribe({
            next: (data) => {
                console.log(data);
                this.campeonato = data;

                // Parse Modalities Config
                try {
                    this.modalidadesConfig = typeof data.modalidades === 'string'
                        ? JSON.parse(data.modalidades)
                        : (data.modalidades || []);
                } catch (e) {
                    this.modalidadesConfig = [];
                }

                // Calcular estado real basado en fechas
                if (this.campeonato) {
                    if (!this.campeonato.pais) this.campeonato.pais = 'Colombia'; // Ghost
                    if (!this.campeonato.ciudad) this.campeonato.ciudad = 'Bogotá'; // Ghost
                    this.campeonato.estadoReal = this.calculateStatus(this.campeonato.fechaInicio, this.campeonato.fecha_fin);
                }

                // Mock participants with detailed data
                // In production this would come from an endpoint like /campeonatos/:id/participantes
                this.mockParticipantes();

                this.extractAvailableOptions();
                this.checkActiveFilters();
                this.applyFilters();

                // Fetch judges
                this.api.getJuecesByCampeonato(this.id!).subscribe({
                    next: (jueces) => {
                        this.jueces = jueces || [];
                    },
                    error: () => {
                        this.jueces = [
                            { id: 101, nombre: 'Juan Pérez', avatar: 'assets/avatar-1.png' },
                            { id: 102, nombre: 'María García', avatar: 'assets/avatar-2.png' }
                        ];
                    }
                });

                this.loading = false;
            },
            error: (err) => {
                console.error('Error loading championship details:', err);
                this.loading = false;
            }
        });
    }

    private mockParticipantes(): void {
        // Generate some ghost data
        this.participantes = [
            { id: 1, nombre: 'Carlos Ruiz', academia: 'Cobra Kai', modalidad: 'Combates', cinturon: 'Azul', peso: '70kg', edad: '22', genero: 'Masculino', pais: 'Colombia', ciudad: 'Bogotá' },
            { id: 2, nombre: 'Diana Prince', academia: 'Themyscira Gym', modalidad: 'Defensa personal', cinturon: 'Negro', peso: '60kg', edad: '28', genero: 'Femenino', pais: 'Colombia', ciudad: 'Medellín' },
            { id: 3, nombre: 'Miguel Diaz', academia: 'Eagle Fang', modalidad: 'Combates', cinturon: 'Blanco', peso: '65kg', edad: '17', genero: 'Masculino', pais: 'México', ciudad: 'Monterrey' },
            { id: 4, nombre: 'Samantha LaRusso', academia: 'Miyagi-Do', modalidad: 'Kata', cinturon: 'Verde', peso: '55kg', edad: '17', genero: 'Femenino', pais: 'EE.UU.', ciudad: 'Los Angeles' }
        ];
    }

    extractAvailableOptions(): void {
        const toOption = (val: string) => ({ label: val, value: val });
        const unique = (arr: string[]) => Array.from(new Set(arr)).sort();

        this.modalidadesOptions = [
            { label: 'Todas', value: 'TODAS' },
            ...unique(this.participantes.map(p => p.modalidad)).map(toOption)
        ];
        this.cinturonesOptions = [
            { label: 'Todos', value: 'TODAS' },
            ...unique(this.participantes.map(p => p.cinturon)).map(toOption)
        ];
        this.pesosOptions = [
            { label: 'Todos', value: 'TODAS' },
            ...unique(this.participantes.map(p => p.peso)).map(toOption)
        ];
        this.edadesOptions = [
            { label: 'Todas', value: 'TODAS' },
            ...this.participantes.map(p => p.edad).filter((v, i, a) => a.indexOf(v) === i)
                .sort((a, b) => parseInt(a) - parseInt(b)).map(toOption)
        ];
        this.generosOptions = [
            { label: 'Todos', value: 'TODAS' },
            ...unique(this.participantes.map(p => p.genero)).map(toOption)
        ];
    }

    onModalityChange(): void {
        this.checkActiveFilters();
        this.applyFilters();
    }

    checkActiveFilters(): void {
        if (this.modalidadFilter === 'TODAS') {
            this.filtersVisible = { cinturon: true, peso: true, edad: true, genero: true };
            return;
        }

        const config = this.modalidadesConfig.find((m: any) => m.nombre === this.modalidadFilter || m.id === this.modalidadFilter); // loose match

        if (config && config.categorias) {
            this.filtersVisible = {
                cinturon: config.categorias.cinturon && config.categorias.cinturon.length > 0,
                peso: config.categorias.peso && config.categorias.peso.length > 0,
                edad: config.categorias.edad && config.categorias.edad.length > 0,
                genero: config.categorias.genero !== null
            };
        } else {
            // Fallback if no config found (e.g. mock vs real mismatch)
            this.filtersVisible = { cinturon: true, peso: true, edad: true, genero: true };
        }
    }

    applyFilters(): void {
        const query = this.searchQuery.toLowerCase().trim();

        // Filter
        let result = this.participantes.filter(p => {
            const matchSearch = !query ||
                p.nombre.toLowerCase().includes(query) ||
                p.academia.toLowerCase().includes(query) ||
                (p.ciudad && p.ciudad.toLowerCase().includes(query));

            const matchMod = this.modalidadFilter === 'TODAS' || p.modalidad === this.modalidadFilter;

            // Only apply filters if they are visible/active for the modality
            const matchCinturon = !this.filtersVisible.cinturon || this.cinturonFilter === 'TODAS' || p.cinturon === this.cinturonFilter;
            const matchPeso = !this.filtersVisible.peso || this.pesoFilter === 'TODAS' || p.peso === this.pesoFilter;
            const matchEdad = !this.filtersVisible.edad || this.edadFilter === 'TODAS' || p.edad === this.edadFilter;
            const matchGenero = !this.filtersVisible.genero || this.generoFilter === 'TODAS' || p.genero === this.generoFilter;

            return matchSearch && matchMod && matchCinturon && matchPeso && matchEdad && matchGenero;
        });

        // Sort
        result.sort((a, b) => {
            const [field, dir] = this.currentSort.split('-');
            const isAsc = dir === 'asc';

            let valA: any = a[field as keyof Participante];
            let valB: any = b[field as keyof Participante];

            // Handle numeric strings
            if (field === 'edad' || field === 'peso') {
                valA = parseFloat(valA) || 0;
                valB = parseFloat(valB) || 0;
            }

            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
                return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
            } else {
                return isAsc ? valA - valB : valB - valA;
            }
        });

        this.filteredParticipantes = result;
        this.filteredCount = result.length;
    }

    sendInvitations(): void {
        alert('Funcionalidad de invitaciones en desarrollo. Se enviarán correos a los usuarios seleccionados.');
    }

    startChampionship(): void {
        if (confirm('¿Estás seguro de iniciar el campeonato? Esto cambiará el estado a EN CURSO.')) {
            // Mock logic
            this.campeonato.estadoReal = 'EN CURSO';
        }
    }

    goBack(): void {
        const fallback = this.isOwner() ? '/mis-campeonatos' : '/campeonatos';
        this.backNav.backOr({ fallbackUrl: fallback });
    }

    editChampionship(): void {
        this.router.navigate(['/campeonato/edit', this.id]);
    }

    viewInscriptions(): void {
        this.router.navigate(['/campeonato/inscriptions', this.id]);
    }

    private calculateStatus(fechaInicio: string, fechaFin: string | undefined): string {
        if (!fechaInicio) return 'PLANIFICADO';

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

    copyCode(): void {
        const codeToCopy = this.campeonato?.Codigo || this.campeonato?.codigo;
        if (!codeToCopy) return;

        navigator.clipboard.writeText(codeToCopy).then(() => {
            this.copied = true;
            setTimeout(() => this.copied = false, 2000);
        });
    }

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
                this.router.navigate(['/mis-campeonatos']);
            },
            error: (err) => {
                console.error('Error deleting championship:', err);
                this.isDeleting = false;
                // Fallback for safety
                this.router.navigate(['/mis-campeonatos']);
            }
        });
    }

    toggleMobileFilters(): void {
        this.showMobileFilters = !this.showMobileFilters;
    }

    toggleMobileActions(): void {
        this.showMobileActions = !this.showMobileActions;
    }

    toggleSection(section: 'info' | 'judges' | 'participants'): void {
        switch (section) {
            case 'info': this.isInfoExpanded = !this.isInfoExpanded; break;
            case 'judges': this.isJudgesExpanded = !this.isJudgesExpanded; break;
            case 'participants': this.isParticipantsExpanded = !this.isParticipantsExpanded; break;
        }
    }
}
