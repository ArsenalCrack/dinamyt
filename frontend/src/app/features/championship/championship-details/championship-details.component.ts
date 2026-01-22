import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
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
}

interface Juez {
    id: number;
    nombre: string;
    avatar: string;
}

@Component({
    selector: 'app-championship-details',
    standalone: true,
    imports: [CommonModule, RouterModule, LoadingSpinnerComponent, FormsModule],
    templateUrl: './championship-details.component.html',
    styleUrls: ['./championship-details.component.scss']
})
export class ChampionshipDetailsComponent implements OnInit {
    id: string | null = null;
    campeonato: any = null;
    loading = true;
    error: string | null = null;

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

    modalidades: string[] = [];
    pesos: string[] = [];
    cinturones: string[] = [];
    edades: string[] = [];
    generos: string[] = [];

    constructor(
        private route: ActivatedRoute,
        private api: ApiService,
        private router: Router,
        private backNav: BackNavigationService
    ) { }

    ngOnInit(): void {
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
                this.extractFilters();
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
            }
        });
    }

    extractFilters(): void {
        this.modalidades = Array.from(new Set(this.participantes.map(p => p.modalidad)));
        this.cinturones = Array.from(new Set(this.participantes.map(p => p.cinturon)));
        this.pesos = Array.from(new Set(this.participantes.map(p => p.peso)));
        this.edades = Array.from(new Set(this.participantes.map(p => p.edad)));
        this.generos = Array.from(new Set(this.participantes.map(p => p.genero)));
    }

    applyFilters(): void {
        const query = this.searchQuery.toLowerCase().trim();
        this.filteredParticipantes = this.participantes.filter(p => {
            const matchSearch = !query || p.nombre.toLowerCase().includes(query) || p.academia.toLowerCase().includes(query);
            const matchMod = this.modalidadFilter === 'TODAS' || p.modalidad === this.modalidadFilter;
            const matchCinturon = this.cinturonFilter === 'TODAS' || p.cinturon === this.cinturonFilter;
            const matchPeso = this.pesoFilter === 'TODAS' || p.peso === this.pesoFilter;
            const matchEdad = this.edadFilter === 'TODAS' || p.edad === this.edadFilter;
            const matchGenero = this.generoFilter === 'TODAS' || p.genero === this.generoFilter;

            // Apply all filters simultaneously (AND logic)
            return matchSearch && matchMod && matchCinturon && matchPeso && matchEdad && matchGenero;
        });
    }

    goBack(): void {
        this.backNav.backOr({ fallbackUrl: '/mis-campeonatos' });
    }

    editChampionship(): void {
        this.router.navigate(['/campeonato/edit', this.id]);
    }
}
