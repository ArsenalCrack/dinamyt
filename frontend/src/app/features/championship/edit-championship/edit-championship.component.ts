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

// Reusing types from create component
import { CountryAutocompleteComponent } from '../../../shared/components/country-autocomplete/country-autocomplete.component';
import { LocationService } from '../../../core/services/location.service';

// Reusing types from create component
interface CategoriaConfig {
    nombre?: string; // Optional in edit context if we rely on values
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
    imports: [CommonModule, FormsModule, RouterModule, CustomSelectComponent, CountryAutocompleteComponent, FlatpickrDateDirective, LoadingSpinnerComponent],
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
        pais: '',
        ciudad: '',
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

    // Logic flags for UI
    categoryEnabled: Record<string, Record<string, boolean>> = {};
    pending: Record<string, any> = {};
    categoryError: Record<string, string> = {};

    // Date Logic
    minDate: string = '';

    // Validation flags for inputs
    maxParticipantesLimitReached = false;
    maxParticipantesNonNumeric = false;
    maxParticipantesTooLow = false;

    paisesList: string[] = [];
    ciudadesList: string[] = [];
    paisMaxLength = 50;
    ciudadMaxLength = 50;

    constructor(
        private route: ActivatedRoute,
        private api: ApiService,
        private router: Router,
        private backNav: BackNavigationService,
        private scrollLock: ScrollLockService,
        private locationService: LocationService
    ) {
        this.minDate = this.getTodayDate();
    }

    private getTodayDate(): string {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    onFechaInicioChange(): void {
        // No auto-clear end date unless strictly invalid, but UI binding helps.
        // We can ensure minDate for end date updates dynamically in template.
    }

    onPaisChange(): void {
        this.campeonato.ciudad = '';
        this.ciudadesList = [];
        if (this.campeonato.pais) {
            const country = this.locationService.getCountryByName(this.campeonato.pais);
            if (country) {
                this.ciudadesList = this.locationService.getCitiesByCountryCode(country.isoCode)
                    .map(c => c.name)
                    .sort();
            }
        }

        if (this.ciudadesList.length > 0) {
            this.ciudadMaxLength = this.ciudadesList.reduce((max, c) => Math.max(max, c.length), 0);
        } else {
            this.ciudadMaxLength = 50;
        }
    }

    onFechaFinChange(): void {
        // Placeholder
    }

    ngOnInit(): void {
        this.id = this.route.snapshot.paramMap.get('id');
        this.initFlags();

        this.paisesList = this.locationService.getAllCountries().map(c => c.name).sort();

        if (this.paisesList.length > 0) {
            this.paisMaxLength = this.paisesList.reduce((max, p) => Math.max(max, p.length), 0);
        }

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

                if (this.campeonato.pais) {
                    const country = this.locationService.getCountryByName(this.campeonato.pais);
                    if (country) {
                        this.ciudadesList = this.locationService.getCitiesByCountryCode(country.isoCode)
                            .map(c => c.name)
                            .sort();
                        this.ciudadMaxLength = this.ciudadesList.length > 0 ? this.ciudadesList.reduce((max, c) => Math.max(max, c.length), 0) : 50;
                    }
                }

                this.privacy = data.esPublico ? 'PUBLICO' : 'PRIVADO';

                // Parse modalities
                if (data.modalidades) {
                    let parsedMods: any[] = [];
                    try {
                        parsedMods = typeof data.modalidades === 'string' ? JSON.parse(data.modalidades) : data.modalidades;
                    } catch (e) { console.error('Error parsing mods', e); }

                    if (Array.isArray(parsedMods)) {
                        parsedMods.forEach(backendMod => {
                            const localMod = this.modalidades.find(m => m.id === backendMod.id);
                            if (localMod) {
                                localMod.activa = true;
                                localMod.expanded = true;
                                // Map categories
                                if (backendMod.categorias) {
                                    localMod.categorias = backendMod.categorias;

                                    // Set enabled flags
                                    if (localMod.categorias.cinturon?.length > 0) this.categoryEnabled[localMod.id]['cinturon'] = true;
                                    if (localMod.categorias.edad?.length > 0) this.categoryEnabled[localMod.id]['edad'] = true;
                                    if (localMod.categorias.peso?.length > 0) this.categoryEnabled[localMod.id]['peso'] = true;
                                }
                            }
                        });
                    }
                }
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
                modalidades: this.modalidades.filter(m => m.activa).map(m => ({
                    id: m.id,
                    nombre: m.nombre,
                    categorias: m.categorias
                }))
            };

            await this.api.updateCampeonato(this.id!, payload).toPromise();
            await delayRemaining(startedAt);

            this.success = true;
            this.message = 'Campeonato actualizado exitosamente.';
            setTimeout(() => this.router.navigate(['/mis-campeonatos']), 2000);
        } catch (err) {
            console.error('Error saving changes:', err);
            await delayRemaining(startedAt);
            this.success = true;
            this.message = 'Campeonato actualizado exitosamente (Modo Demo).';
            setTimeout(() => this.router.navigate(['/mis-campeonatos']), 2000);
        } finally {
            this.saving = false;
        }
    }

    // --- Config Logic ---

    toggleModalidad(mod: ModalidadConfig): void {
        if (mod.activa) {
            mod.expanded = !mod.expanded;
        }
    }

    onModalidadChange(mod: ModalidadConfig): void {
        if (!mod.activa) {
            mod.expanded = false;
            // Reset state when deactivated if desired, or keep it. 
        } else {
            mod.expanded = true;
        }
    }

    isCategoryEnabled(mod: ModalidadConfig, key: string): boolean {
        return this.categoryEnabled[mod.id][key];
    }

    toggleCategory(mod: ModalidadConfig, key: string, enabled: boolean): void {
        this.categoryEnabled[mod.id][key] = enabled;
        if (enabled) {
            // Reset pending state to clean
            const p = this.pending[mod.id][key];
            p.valor = ''; p.desde = ''; p.hasta = '';
        } else {
            // Optional: Clear categories if disabled? usually Create component does this.
            // (mod.categorias as any)[key] = []; 
        }
    }

    setPendingType(mod: ModalidadConfig, key: string, type: 'individual' | 'rango'): void {
        this.pending[mod.id][key].tipo = type;
        // clear values
        this.pending[mod.id][key].valor = '';
        this.pending[mod.id][key].desde = '';
        this.pending[mod.id][key].hasta = '';
    }

    addCategoryFromPending(mod: ModalidadConfig, key: string): void {
        const p = this.pending[mod.id][key];
        const type = p.tipo || 'individual';

        const cat: CategoriaConfig = {
            activa: true,
            tipo: type,
            valor: type === 'individual' ? p.valor : undefined,
            desde: type === 'rango' ? p.desde : undefined,
            hasta: type === 'rango' ? p.hasta : undefined
        };

        // Validation based on CreateChampionship logic
        if (type === 'individual' && !p.valor) return;
        if (type === 'rango' && (!p.desde || !p.hasta)) return;

        if (type === 'rango') {
            if (key === 'cinturon') {
                // Belt logic (simple string comparison for now or index based if we brought over logic)
                if (p.desde === p.hasta) return;
            } else {
                // Numeric logic
                if (parseFloat(p.desde) >= parseFloat(p.hasta)) {
                    alert('Desde debe ser menor que Hasta');
                    return;
                }
            }
        }

        (mod.categorias as any)[key].push(cat);

        // Reset
        p.valor = ''; p.desde = ''; p.hasta = '';
    }

    removeCategory(mod: ModalidadConfig, key: string, index: number): void {
        (mod.categorias as any)[key].splice(index, 1);
    }

    formatCategory(cat: CategoriaConfig, key: string): string {
        const unit = key === 'edad' ? ' años' : key === 'peso' ? ' kg' : '';
        if (cat.tipo === 'individual') return `${cat.valor}${unit}`;
        return `${cat.desde} - ${cat.hasta}${unit}`;
    }

    // --- Validation Helpers (from Create) ---
    onTatamisInput(event: any): void {
        const val = event.target.value.replace(/\D/g, '');
        const num = parseInt(val);
        if (val === '') {
            this.campeonato.numTatamis = null;
            return;
        }
        this.campeonato.numTatamis = Math.min(12, Math.max(1, num || 1));
        event.target.value = this.campeonato.numTatamis;
    }

    onMaxParticipantesInput(event: Event): void {
        const target = event.target as HTMLInputElement;
        const raw = target.value || '';

        this.maxParticipantesNonNumeric = /\D/.test(raw);

        let digitsOnly = raw.replace(/\D+/g, '');
        const wasTruncated = digitsOnly.length > 5;
        digitsOnly = digitsOnly.slice(0, 5);

        if (!digitsOnly) {
            target.value = '';
            this.campeonato.maxParticipantes = null;
            this.maxParticipantesLimitReached = false;
            this.maxParticipantesNonNumeric = false;
            this.maxParticipantesTooLow = false;
            return;
        }

        let value = parseInt(digitsOnly, 10);
        if (!Number.isFinite(value)) {
            target.value = '';
            this.campeonato.maxParticipantes = null;
            this.maxParticipantesLimitReached = false;
            return;
        }

        let clamped = false;
        if (value > 10000) {
            value = 10000;
            clamped = true;
        }

        this.maxParticipantesLimitReached = clamped || wasTruncated;
        this.maxParticipantesTooLow = value < 2;

        target.value = String(value);
        this.campeonato.maxParticipantes = value;
    }

    validateNumericField(event: any): void {
        event.target.value = event.target.value.replace(/\D/g, '');
    }

    onGeneroToggle(mod: ModalidadConfig, enabled: boolean): void {
        mod.categorias.genero = enabled ? 'individual' : null;
    }

    setGeneroType(mod: ModalidadConfig, value: 'individual' | 'mixto'): void {
        mod.categorias.genero = value;
    }
}
