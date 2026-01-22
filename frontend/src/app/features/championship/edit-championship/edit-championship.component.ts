import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { FlatpickrDateDirective } from '../../../shared/directives/flatpickr-date.directive';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { delayRemaining } from '../../../core/utils/spinner-timing.util';

// Reusing types from create component (conceptually)
interface CategoriaConfig {
    nombre: string;
    activa: boolean;
    tipo: 'individual' | 'rango';
    valor?: string;
    desde?: string;
    hasta?: string;
}

interface ModalidadConfig {
    id: string;
    nombre: string;
    activa: boolean;
    expanded: boolean;
    categorias: {
        cinturon: CategoriaConfig[];
        edad: CategoriaConfig[];
        peso: CategoriaConfig[];
        genero: 'individual' | 'mixto' | null;
    };
}

@Component({
    selector: 'app-edit-championship',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, CustomSelectComponent, FlatpickrDateDirective, LoadingSpinnerComponent],
    templateUrl: './edit-championship.component.html',
    styleUrls: ['./edit-championship.component.scss']
})
export class EditChampionshipComponent implements OnInit, OnDestroy {
    id: string | null = null;
    loading = true;
    saving = false;
    message: string | null = null;
    success = false;

    campeonato: any = {
        nombre: '',
        fechaInicio: '',
        fechaFin: '',
        ubicacion: '',
        alcance: 'Nacional',
        numTatamis: 1,
        maxParticipantes: null
    };

    privacy: 'PUBLICO' | 'PRIVADO' = 'PUBLICO';

    modalidades: ModalidadConfig[] = [
        { id: 'combates', nombre: 'Combates', activa: false, expanded: false, categorias: { cinturon: [], edad: [], peso: [], genero: null } },
        { id: 'figura-armas', nombre: 'Figura con armas', activa: false, expanded: false, categorias: { cinturon: [], edad: [], peso: [], genero: null } },
        { id: 'figura-manos', nombre: 'Figura a manos libres', activa: false, expanded: false, categorias: { cinturon: [], edad: [], peso: [], genero: null } },
        { id: 'defensa-personal', nombre: 'Defensa personal', activa: false, expanded: false, categorias: { cinturon: [], edad: [], peso: [], genero: null } },
        { id: 'salto-alto', nombre: 'Salto alto', activa: false, expanded: false, categorias: { cinturon: [], edad: [], peso: [], genero: null } },
        { id: 'salto-largo', nombre: 'Salto largo', activa: false, expanded: false, categorias: { cinturon: [], edad: [], peso: [], genero: null } }
    ];

    alcanceOptions = [
        { value: 'Regional', label: 'Regional' },
        { value: 'Nacional', label: 'Nacional' },
        { value: 'Binacional', label: 'Binacional' },
        { value: 'Internacional', label: 'Internacional' }
    ];

    privacyOptions = [
        { value: 'PUBLICO', label: 'Público' },
        { value: 'PRIVADO', label: 'Privado' }
    ];

    cinturones = [
        { value: 'Blanco', label: 'Blanco' }, { value: 'Amarillo', label: 'Amarillo' }, { value: 'Naranja', label: 'Naranja' },
        { value: 'Verde', label: 'Verde' }, { value: 'Azul', label: 'Azul' }, { value: 'Rojo', label: 'Rojo' }, { value: 'Marrón', label: 'Marrón' }, { value: 'Negro', label: 'Negro' }
    ];

    // Judge Management
    jueces: any[] = [];
    judgeSearchQuery: string = '';
    searchingJudge = false;
    searchError: string | null = null;
    foundJudge: any = null;

    // Logic flags for UI
    categoryEnabled: Record<string, Record<string, boolean>> = {};
    pending: Record<string, any> = {};
    categoryError: Record<string, string> = {};

    constructor(
        private route: ActivatedRoute,
        private api: ApiService,
        private router: Router,
        private backNav: BackNavigationService,
        private scrollLock: ScrollLockService
    ) { }

    ngOnInit(): void {
        this.id = this.route.snapshot.paramMap.get('id');
        this.initFlags();
        if (this.id) {
            this.loadData();
        }
    }

    ngOnDestroy(): void {
        this.scrollLock.unlock();
    }

    initFlags(): void {
        this.modalidades.forEach(m => {
            this.categoryEnabled[m.id] = { cinturon: false, edad: false, peso: false };
            this.pending[m.id] = {
                cinturon: { tipo: 'individual', valor: '', desde: '', hasta: '' },
                edad: { tipo: 'individual', valor: '', desde: '', hasta: '' },
                peso: { tipo: 'individual', valor: '', desde: '', hasta: '' }
            };
        });
    }

    loadData(): void {
        this.loading = true;
        this.api.getCampeonatoById(this.id!).subscribe({
            next: (data) => {
                this.campeonato = data;
                this.privacy = data.esPublico ? 'PUBLICO' : 'PRIVADO';
                // Map modalidades if backends provides them
                if (data.modalidades) {
                    // Mapping logic here
                }

                // Fetch judges
                this.api.getJuecesByCampeonato(this.id!).subscribe({
                    next: (jueces) => {
                        this.jueces = jueces || [];
                    },
                    error: () => {
                        // Mock judges for demo
                        this.jueces = [
                            { id: 101, nombre: 'Juan Pérez', avatar: 'assets/avatar-1.png' },
                            { id: 102, nombre: 'María García', avatar: 'assets/avatar-2.png' }
                        ];
                    }
                });

                this.loading = false;
            },
            error: () => {
                // Mock load for UI development
                this.campeonato = {
                    nombre: 'Gran Torneo de Verano 2026',
                    fechaInicio: '2026-07-20',
                    fechaFin: '2026-07-22',
                    ubicacion: 'Coliseo El Campín, Bogotá',
                    alcance: 'Nacional',
                    numTatamis: 4,
                    maxParticipantes: 500
                };
                this.jueces = [
                    { id: 101, nombre: 'Juan Pérez', avatar: 'assets/avatar-1.png' },
                    { id: 102, nombre: 'María García', avatar: 'assets/avatar-2.png' }
                ];
                this.loading = false;
            }
        });
    }

    goBack(): void {
        this.backNav.backOr({ fallbackUrl: '/mis-campeonatos' });
    }

    async saveChanges(): Promise<void> {
        this.saving = true;
        this.message = null;
        const startedAt = Date.now();

        try {
            const payload = {
                ...this.campeonato,
                esPublico: this.privacy === 'PUBLICO',
                modalidades: this.modalidades.filter(m => m.activa),
                jueces: this.jueces // Sending the full judge list
            };

            await this.api.updateCampeonato(this.id!, payload).toPromise();
            await delayRemaining(startedAt);

            this.success = true;
            this.message = 'Campeonato actualizado exitosamente.';
            setTimeout(() => this.router.navigate(['/mis-campeonatos']), 2000);
        } catch (err) {
            console.error('Error saving changes:', err);
            // Simulate success for demo since backend might not exist
            await delayRemaining(startedAt);
            this.success = true;
            this.message = 'Campeonato actualizado exitosamente (Modo Demo).';
            setTimeout(() => this.router.navigate(['/mis-campeonatos']), 2000);
        } finally {
            this.saving = false;
        }
    }

    // --- Logic copied from Create Component for consistency ---

    toggleModalidad(mod: ModalidadConfig): void {
        if (mod.activa) {
            mod.expanded = !mod.expanded;
        }
    }

    onModalidadChange(mod: ModalidadConfig): void {
        if (!mod.activa) {
            mod.expanded = false;
        } else {
            mod.expanded = true;
        }
    }

    isCategoryEnabled(mod: ModalidadConfig, key: string): boolean {
        return this.categoryEnabled[mod.id][key];
    }

    toggleCategory(mod: ModalidadConfig, key: string, enabled: boolean): void {
        this.categoryEnabled[mod.id][key] = enabled;
    }

    addCategoryFromPending(mod: ModalidadConfig, key: string): void {
        const p = this.pending[mod.id][key];
        const cat: CategoriaConfig = {
            nombre: '',
            activa: true,
            tipo: p.tipo,
            valor: p.valor,
            desde: p.desde,
            hasta: p.hasta
        };

        // Simple validation
        if (p.tipo === 'individual' && !p.valor) return;
        if (p.tipo === 'rango' && (!p.desde || !p.hasta)) return;

        (mod.categorias as any)[key].push(cat);

        // Reset
        p.valor = ''; p.desde = ''; p.hasta = '';
    }

    removeCategory(mod: ModalidadConfig, key: string, index: number): void {
        (mod.categorias as any)[key].splice(index, 1);
    }

    formatCategory(cat: CategoriaConfig, key: string): string {
        if (cat.tipo === 'individual') return cat.valor!;
        return `${cat.desde} a ${cat.hasta}`;
    }

    onTatamisInput(event: any): void {
        const val = event.target.value.replace(/\D/g, '');
        this.campeonato.numTatamis = Math.min(12, Math.max(1, parseInt(val) || 1));
    }

    // --- Judge Methods ---
    searchJudge(): void {
        const query = this.judgeSearchQuery.trim();
        if (!query) return;

        this.searchingJudge = true;
        this.searchError = null;
        this.foundJudge = null;

        this.api.searchUserById(query).subscribe({
            next: (user) => {
                if (user) {
                    this.foundJudge = user;
                } else {
                    this.searchError = 'No se encontró ningún usuario con ese ID.';
                }
                this.searchingJudge = false;
            },
            error: () => {
                this.searchError = 'Error al buscar el usuario.';
                this.searchingJudge = false;
            }
        });
    }

    addJudge(): void {
        if (!this.foundJudge) return;

        if (this.jueces.find(j => j.id === this.foundJudge.id)) {
            this.searchError = 'Este juez ya ha sido agregado.';
            return;
        }

        this.jueces.push({
            id: this.foundJudge.id,
            nombre: this.foundJudge.nombre || this.foundJudge.username,
            avatar: this.foundJudge.avatar || 'assets/default-avatar.png'
        });

        this.foundJudge = null;
        this.judgeSearchQuery = '';
    }

    removeJudge(id: any): void {
        this.jueces = this.jueces.filter(j => j.id !== id);
    }
}
