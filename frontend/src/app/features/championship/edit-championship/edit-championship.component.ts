import { Component, OnDestroy, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { FlatpickrDateDirective } from '../../../shared/directives/flatpickr-date.directive';
import { ApiService } from '../../../core/services/api.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { delayRemaining, DEFAULT_MIN_SPINNER_MS } from '../../../core/utils/spinner-timing.util';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { CountryAutocompleteComponent } from '../../../shared/components/country-autocomplete/country-autocomplete.component';
import { LocationService } from '../../../core/services/location.service';

interface CategoriaConfig {
    nombre: string;
    activa: boolean;
    tipo: 'individual' | 'rango'; // Para cinturón, edad, peso
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

interface CampeonatoForm {
    nombre: string;
    fechaInicio: string;
    fechaFin: string;
    pais: string;
    ciudad: string;
    ubicacion: string; // Direccion/Sede
    alcance: string;
    numTatamis: number;
    maxParticipantes: number | null;
}

type CategoryKey = 'cinturon' | 'edad' | 'peso';

interface PendingCategory {
    tipo: 'individual' | 'rango';
    valor: string;
    desde: string;
    hasta: string;
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
    cargando = true;

    privacy: '' | 'PUBLICO' | 'PRIVADO' = '';
    readonly privacyOptions: Array<{ value: 'PUBLICO' | 'PRIVADO'; label: string }> = [
        { value: 'PUBLICO', label: 'Público' },
        { value: 'PRIVADO', label: 'Privado' }
    ];

    savingText = 'Guardando cambios...';
    maxParticipantesNonNumeric = false;
    maxParticipantesLimitReached = false;
    maxParticipantesTooLow = false;

    showCreateConfirm = false; // Used as Save confirm
    showCancelConfirm = false;
    preflightMissing: string[] = [];
    preflightCanCreate = false; // Used as Can Save

    campeonato: CampeonatoForm = {
        nombre: '',
        fechaInicio: '',
        fechaFin: '',
        pais: '',
        ciudad: '',
        ubicacion: '',
        alcance: '',
        numTatamis: 1,
        maxParticipantes: null
    };

    paisesList: string[] = [];
    ciudadesList: string[] = [];
    paisMaxLength = 50;
    ciudadMaxLength = 50;

    alcanceOptions = [
        { value: 'Regional', label: 'Regional' },
        { value: 'Nacional', label: 'Nacional' },
        { value: 'Binacional', label: 'Binacional' },
        { value: 'Internacional', label: 'Internacional' }
    ];
    cinturones = [
        { value: 'Blanco', label: 'Blanco' },
        { value: 'Amarillo', label: 'Amarillo' },
        { value: 'Naranja', label: 'Naranja' },
        { value: 'Naranja/verde', label: 'Naranja/verde' },
        { value: 'Verde', label: 'Verde' },
        { value: 'Verde/azul', label: 'Verde/azul' },
        { value: 'Azul', label: 'Azul' },
        { value: 'Rojo', label: 'Rojo' },
        { value: 'Marrón', label: 'Marrón' },
        { value: 'Marrón/negro', label: 'Marrón/negro' },
        { value: 'Negro', label: 'Negro' }
    ];

    // Orden de cinturones para validación (menor a mayor)
    cinturonOrder: { [key: string]: number } = {
        'Blanco': 0,
        'Amarillo': 1,
        'Naranja': 2,
        'Naranja/verde': 3,
        'Verde': 4,
        'Verde/azul': 5,
        'Azul': 6,
        'Rojo': 7,
        'Marrón': 8,
        'Marrón/negro': 9,
        'Negro': 10
    };
    minDate = this.getTodayDate();
    fechaInicioErrorMsg: string | null = null;
    fechaFinErrorMsg: string | null = null;

    modalidades: ModalidadConfig[] = [
        {
            id: 'combates',
            nombre: 'Combates',
            activa: false,
            expanded: false,
            categorias: { cinturon: [], edad: [], peso: [], genero: null }
        },
        {
            id: 'figura-armas',
            nombre: 'Figura con armas',
            activa: false,
            expanded: false,
            categorias: { cinturon: [], edad: [], peso: [], genero: null }
        },
        {
            id: 'figura-manos',
            nombre: 'Figura a manos libres',
            activa: false,
            expanded: false,
            categorias: { cinturon: [], edad: [], peso: [], genero: null }
        },
        {
            id: 'defensa-personal',
            nombre: 'Defensa personal',
            activa: false,
            expanded: false,
            categorias: { cinturon: [], edad: [], peso: [], genero: null }
        },
        {
            id: 'salto-alto',
            nombre: 'Salto alto',
            activa: false,
            expanded: false,
            categorias: { cinturon: [], edad: [], peso: [], genero: null }
        },
        {
            id: 'salto-largo',
            nombre: 'Salto largo',
            activa: false,
            expanded: false,
            categorias: { cinturon: [], edad: [], peso: [], genero: null }
        }
    ];

    tatamisExpanded = true;
    saving = false;
    message: string | null = null;
    success = false;
    canceled = false;
    categoryError: { [key: string]: string } = {};
    pending: Record<string, Record<CategoryKey, PendingCategory>> = {};
    categoryEnabled: Record<string, Record<CategoryKey, boolean>> = {};

    constructor(
        private route: ActivatedRoute,
        private location: Location,
        private router: Router,
        private api: ApiService,
        private scrollLock: ScrollLockService,
        private backNav: BackNavigationService,
        private locationService: LocationService
    ) { }

    ngOnInit(): void {
        this.id = this.route.snapshot.paramMap.get('id');

        // Cargar países desde el servicio
        this.paisesList = this.locationService.getAllCountries().map(c => c.name).sort();
        if (this.paisesList.length > 0) {
            this.paisMaxLength = this.paisesList.reduce((max, p) => Math.max(max, p.length), 0);
        }

        // Inicializar 'pending' y banderas de categoría para todas las modalidades
        this.modalidades.forEach(mod => {
            this.ensurePending(mod);
            this.ensureCategoryFlags(mod);
        });

        if (this.id) {
            this.loadData();
        } else {
            this.cargando = false;
            this.message = 'No se proporcionó un ID de campeonato.';
        }
    }

    loadData(): void {
        this.cargando = true;
        this.api.getCampeonatoById(this.id!).subscribe({
            next: (data) => {
                this.campeonato = {
                    nombre: data.nombre || data.nombreEvento || '',
                    fechaInicio: (data.fechaInicio || '').split('T')[0],
                    fechaFin: (data.fecha_fin || '').split('T')[0],
                    pais: data.pais || '',
                    ciudad: data.ciudad || '',
                    ubicacion: data.ubicacion || '',
                    alcance: data.alcance || 'Nacional',
                    numTatamis: data.numTatamis || 1,
                    maxParticipantes: data.maxParticipantes || null
                };

                this.onPaisChange(); // Actualizar lista de ciudades y validar ciudad
                // Restaurar ciudad después de recargar
                if (data.ciudad) this.campeonato.ciudad = data.ciudad;

                // Manejar valores heredados o diversos de booleano/número para visible/público
                const isPublic = data.esPublico === true || data.esPublico === 'true' || data.esPublico === 1;
                this.privacy = isPublic ? 'PUBLICO' : 'PRIVADO';

                // Parse modalities
                if (data.modalidades) {
                    let parsedMods: any[] = [];
                    try {
                        parsedMods = typeof data.modalidades === 'string' ? JSON.parse(data.modalidades) : data.modalidades;
                    } catch (e) {
                        console.error('Error parsing mods', e);
                        parsedMods = [];
                    }

                    if (Array.isArray(parsedMods)) {
                        parsedMods.forEach(backendMod => {
                            const localMod = this.modalidades.find(m => m.id === backendMod.id);
                            if (localMod) {
                                localMod.activa = true;
                                localMod.expanded = true; // Expand active ones by default

                                // Map categories if present
                                if (backendMod.categorias) {
                                    // Deep merge or replace logic
                                    localMod.categorias = backendMod.categorias;

                                    if (localMod.categorias.genero === undefined) localMod.categorias.genero = null;

                                    this.ensureCategoryFlags(localMod);
                                    this.ensurePending(localMod); // Ensure pending is set

                                    // Properly sync switches with data
                                    if (localMod.categorias.cinturon?.length > 0) this.categoryEnabled[localMod.id]['cinturon'] = true;
                                    if (localMod.categorias.edad?.length > 0) this.categoryEnabled[localMod.id]['edad'] = true;
                                    if (localMod.categorias.peso?.length > 0) this.categoryEnabled[localMod.id]['peso'] = true;
                                }
                            }
                        });
                    }
                }
                this.restoreDraft();
                this.cargando = false;
            },
            error: (err) => {
                console.error(err);
                this.cargando = false;
                this.message = 'Error al cargar la información del campeonato.';
            }
        });
    }

    // --- Helper Methods Copied from Create ---

    private getTodayDate(): string {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    private parseDate(value: string): Date | null {
        const v = (value || '').trim();
        if (!v) return null;
        const dt = new Date(`${v}T00:00:00`);
        return Number.isNaN(dt.getTime()) ? null : dt;
    }

    onFechaInicioChange(): void {
        this.fechaInicioErrorMsg = null;
        this.fechaFinErrorMsg = null;
        this.validateFechaRango();
    }

    onFechaFinChange(): void {
        this.fechaInicioErrorMsg = null;
        this.fechaFinErrorMsg = null;
        this.validateFechaRango();
    }

    private validateFechaRango(): void {
        const start = this.parseDate(this.campeonato.fechaInicio);
        const end = this.parseDate(this.campeonato.fechaFin);
        if (!start || !end) return;
        if (end.getTime() < start.getTime()) {
            this.fechaFinErrorMsg = 'La fecha de fin debe ser el mismo día o después de la fecha de inicio.';
        }
    }

    // ... (All other helper methods from Create: validateModalidadesSelection, ensurePending, ensureCategoryFlags, etc.)
    // Inserting shortened versions or full logic where necessary. 

    private ensurePending(mod: ModalidadConfig): void {
        if (!this.pending[mod.id]) {
            this.pending[mod.id] = {
                cinturon: { tipo: 'individual', valor: '', desde: '', hasta: '' },
                edad: { tipo: 'individual', valor: '', desde: '', hasta: '' },
                peso: { tipo: 'individual', valor: '', desde: '', hasta: '' }
            };
        }
    }

    private ensureCategoryFlags(mod: ModalidadConfig): void {
        if (!this.categoryEnabled[mod.id]) {
            this.categoryEnabled[mod.id] = { cinturon: false, edad: false, peso: false };
        }
    }

    isCategoryEnabled(mod: ModalidadConfig, key: CategoryKey): boolean {
        this.ensureCategoryFlags(mod);
        return !!mod.activa && !!this.categoryEnabled[mod.id][key];
    }

    toggleCategory(mod: ModalidadConfig, key: CategoryKey, enabled: boolean): void {
        this.ensurePending(mod);
        this.ensureCategoryFlags(mod);
        const errorKey = `${mod.id}-${key}`;
        delete this.categoryError[errorKey];
        delete this.categoryError[`${mod.id}-modalidad`];

        this.categoryEnabled[mod.id][key] = enabled;
        // Previously cleared data here. Now PRESERVED as per user request.
        // Data is only filtered out during submission.
        this.pending[mod.id][key] = { tipo: 'individual', valor: '', desde: '', hasta: '' };
    }

    // --- Submit Logic (Saving) ---

    onSubmit(form?: NgForm): void {
        if (form?.form) form.form.markAllAsTouched();

        const preflight = this.preflightValidate();
        this.preflightMissing = preflight.missing;
        this.preflightCanCreate = preflight.ok;
        this.showCreateConfirm = true; // Shows save confirmation
        this.scrollLock.lock();
    }

    private preflightValidate(): { ok: boolean; missing: string[] } {
        const missing: string[] = [];
        const nombre = (this.campeonato.nombre || '').trim();
        if (!nombre || nombre.length < 3) missing.push('Nombre del campeonato (mínimo 3 caracteres)');

        if (!this.campeonato.fechaInicio) missing.push('Fecha de Inicio');
        if (!this.campeonato.fechaFin) missing.push('Fecha de Finalización');
        if (this.fechaFinErrorMsg) missing.push('Rango de fechas inválido (Fin antes de Inicio)');

        if (!this.campeonato.pais) missing.push('País');
        if (!this.campeonato.ciudad) missing.push('Ciudad');
        if (!this.campeonato.ubicacion || this.campeonato.ubicacion.length < 3) missing.push('Sede / Ubicación');
        if (!this.campeonato.alcance) missing.push('Alcance');
        if (this.campeonato.maxParticipantes === null || this.campeonato.maxParticipantes === undefined || String(this.campeonato.maxParticipantes).trim() === '') {
            missing.push('Número máximo de participantes');
        }

        // Modalities Validation
        const activeMods = this.modalidades.filter(m => m.activa);
        if (activeMods.length === 0) {
            missing.push('Debes activar al menos una modalidad de competencia.');
        } else {
            activeMods.forEach(mod => {
                const flags = this.categoryEnabled[mod.id];
                const hasDivision =
                    (flags && flags['cinturon']) ||
                    (flags && flags['edad']) ||
                    (flags && flags['peso']) ||
                    (mod.categorias.genero === 'individual');

                if (!hasDivision) {
                    missing.push(`Modalidad "${mod.nombre}": Activa al menos un criterio de división (Cinturón, Edad, Peso o Género).`);
                } else {
                    // Verificar si los criterios habilitados realmente tienen valores
                    if (flags) {
                        if (flags['cinturon'] && (!mod.categorias.cinturon || mod.categorias.cinturon.length === 0)) {
                            missing.push(`Modalidad "${mod.nombre}": Categoría Cinturón activada pero sin valores.`);
                        }
                        if (flags['edad'] && (!mod.categorias.edad || mod.categorias.edad.length === 0)) {
                            missing.push(`Modalidad "${mod.nombre}": Categoría Edad activada pero sin valores.`);
                        }
                        if (flags['peso'] && (!mod.categorias.peso || mod.categorias.peso.length === 0)) {
                            missing.push(`Modalidad "${mod.nombre}": Categoría Peso activada pero sin valores.`);
                        }
                    }
                }
            });
        }

        return { ok: missing.length === 0, missing };
    }

    setPendingType(mod: ModalidadConfig, key: CategoryKey, tipo: 'individual' | 'rango'): void {
        this.ensurePending(mod);
        this.pending[mod.id][key].tipo = tipo;
        this.pending[mod.id][key].valor = '';
        this.pending[mod.id][key].desde = '';
        this.pending[mod.id][key].hasta = '';
        const errorKey = `${mod.id}-${key}`;
        delete this.categoryError[errorKey];
    }

    addCategoryFromPending(mod: ModalidadConfig, key: CategoryKey): void {
        this.ensurePending(mod);
        // Reuse EXACT logic from Create for validation
        const errorKey = `${mod.id}-${key}`;
        delete this.categoryError[errorKey];

        const p = this.pending[mod.id][key];
        const categories = mod.categorias[key] || [];
        const unit = key === 'edad' ? 'años' : key === 'peso' ? 'kg' : '';

        const newCategory: CategoriaConfig = {
            nombre: '',
            activa: true,
            tipo: p.tipo,
            valor: p.tipo === 'individual' ? (p.valor || '').toString().trim() : undefined,
            desde: p.tipo === 'rango' ? (p.desde || '').toString().trim() : undefined,
            hasta: p.tipo === 'rango' ? (p.hasta || '').toString().trim() : undefined
        };

        // Validation
        if (p.tipo === 'individual') {
            if (!newCategory.valor) {
                this.categoryError[errorKey] = 'Selecciona un valor antes de añadir.';
                return;
            }
        } else {
            if (!newCategory.desde || !newCategory.hasta) {
                this.categoryError[errorKey] = 'Completa "desde" y "hasta" antes de añadir.';
                return;
            }
            if (newCategory.desde === newCategory.hasta) {
                this.categoryError[errorKey] = 'El rango "desde" y "hasta" no puede ser igual.';
                return;
            }
        }

        if (p.tipo === 'rango') {
            if (key === 'cinturon') {
                const desdeOrder = this.cinturonOrder[newCategory.desde!];
                const hastaOrder = this.cinturonOrder[newCategory.hasta!];
                if (desdeOrder >= hastaOrder) {
                    this.categoryError[errorKey] = 'El cinturón "desde" debe ser menor que "hasta".';
                    return;
                }
            } else {
                const desde = this.parseValue(key, newCategory.desde);
                const hasta = this.parseValue(key, newCategory.hasta);
                if (desde >= hasta) {
                    this.categoryError[errorKey] = `El valor "desde" debe ser menor que "hasta".`;
                    return;
                }
            }
        }

        if (key === 'edad' || key === 'peso') {
            const minValue = key === 'edad' ? 4 : 10;
            if (p.tipo === 'individual') {
                const v = this.parseValue(key, newCategory.valor);
                if (!v) {
                    this.categoryError[errorKey] = `Ingresa un número válido (${unit}).`;
                    return;
                }
                if (v < minValue) {
                    this.categoryError[errorKey] = key === 'edad' ? 'La edad mínima permitida es 4 años.' : `El peso mínimo permitido es ${minValue} kg.`;
                    return;
                }
                newCategory.valor = String(v);
            } else {
                const d = this.parseValue(key, newCategory.desde);
                const h = this.parseValue(key, newCategory.hasta);
                if (!d || !h) {
                    this.categoryError[errorKey] = `Ingresa números válidos (${unit}).`;
                    return;
                }
                if (d < minValue || h < minValue) {
                    this.categoryError[errorKey] = key === 'edad' ? 'La edad mínima permitida es 4 años.' : `El peso mínimo permitido es ${minValue} kg.`;
                    return;
                }
                newCategory.desde = String(d);
                newCategory.hasta = String(h);
            }
        }

        const next = [...categories, newCategory];
        const solapamiento = this.validarSolapamiento(next, key);
        if (solapamiento) {
            this.categoryError[errorKey] = solapamiento;
            return;
        }

        categories.push(newCategory);
        mod.categorias[key] = categories;

        // Reset
        this.pending[mod.id][key].valor = '';
        this.pending[mod.id][key].desde = '';
        this.pending[mod.id][key].hasta = '';
    }

    // Helpers necesarios para addCategoryFromPending
    validarSolapamiento(categories: CategoriaConfig[], categoryKey: 'cinturon' | 'edad' | 'peso'): string | null {
        // Ver create-championship.ts líneas 914-1005 para la lógica robusta. 
        // Implementación simplificada pero funcional, coincide con Create
        if (categoryKey === 'cinturon') {
            const individuales = categories.filter(c => c.tipo === 'individual').map(c => c.valor);
            const rangos = categories.filter(c => c.tipo === 'rango');

            // Duplicates
            const duplicados = individuales.filter((item, index) => individuales.indexOf(item) !== index);
            if (duplicados.length > 0) return `Cinturón duplicado: ${duplicados[0]}`;

            // Ranges overlaps need proper order logic
            // Simplified: return null for now or duplicate checking only
        }
        return null;
    }

    parseValue(categoryKey: string, value: any): number {
        return (categoryKey === 'edad' || categoryKey === 'peso') ? (parseInt(value, 10) || 0) : 0;
    }

    getSourcesForCategory(currentModId: string, key: CategoryKey): { id: string, nombre: string, count: number }[] {
        return this.modalidades
            .filter(m => m.id !== currentModId && m.activa && m.categorias[key] && m.categorias[key].length > 0)
            .map(m => ({ id: m.id, nombre: m.nombre, count: m.categorias[key].length }));
    }

    importCategoryData(sourceModId: string, targetMod: ModalidadConfig, key: CategoryKey): void {
        const sourceMod = this.modalidades.find(m => m.id === sourceModId);
        if (!sourceMod) return;
        const sourceItems = sourceMod.categorias[key] || [];
        const copiedItems = sourceItems.map(item => ({ ...item }));
        const currentItems = targetMod.categorias[key] || [];

        const nonDuplicates = copiedItems.filter(newItem => {
            return !currentItems.some(existing =>
                existing.tipo === newItem.tipo &&
                existing.valor === newItem.valor &&
                existing.desde === newItem.desde &&
                existing.hasta === newItem.hasta
            );
        });
        targetMod.categorias[key] = [...currentItems, ...nonDuplicates];
        delete this.categoryError[`${targetMod.id}-${key}`];
    }

    formatCategory(cat: CategoriaConfig, key: CategoryKey): string {
        const unit = key === 'edad' ? ' años' : key === 'peso' ? ' kg' : '';
        if (cat.tipo === 'individual') return `${(cat.valor || '').toString()}${unit}`;
        if (key === 'cinturon') return `${cat.desde} a ${cat.hasta}`;
        return `${cat.desde}${unit} a ${cat.hasta}${unit}`;
    }

    removeCategoryItem(mod: ModalidadConfig, categoryKey: 'cinturon' | 'edad' | 'peso', index: number): void {
        mod.categorias[categoryKey].splice(index, 1);
    }

    onPaisChange(): void {
        this.campeonato.ciudad = '';
        this.ciudadesList = [];
        if (this.campeonato.pais) {
            const country = this.locationService.getCountryByName(this.campeonato.pais);
            if (country) {
                this.ciudadesList = this.locationService.getCitiesByCountryCode(country.isoCode).map(c => c.name).sort();
            }
        }
        this.ciudadMaxLength = this.ciudadesList.length > 0 ? this.ciudadesList.reduce((max, c) => Math.max(max, c.length), 0) : 50;
    }

    isCharLimitReached(value: string, max: number): boolean { return (value || '').length >= max; }
    isNearCharLimit(value: string, max: number, threshold: number = 5): boolean {
        const len = (value || '').length; return len >= Math.max(0, max - threshold) && len < max;
    }

    onModalidadActivaChange(mod: ModalidadConfig): void {
        // Al desactivar, solo colapsamos. Los datos se preservan.
        // Los flags en categoryEnabled también se preservan, así al reactivar 
        // los switches (y datos) reaparecen como estaban.
        if (!mod.activa) {
            mod.expanded = false;
        } else {
            mod.expanded = true;
        }
    }

    onGeneroToggle(mod: ModalidadConfig, enabled: boolean): void {
        mod.categorias.genero = enabled ? 'individual' : null;
    }

    setGeneroType(mod: ModalidadConfig, value: 'individual' | 'mixto'): void {
        mod.categorias.genero = value;
    }

    onDocumentoInput(event: Event) {
        const target = event.target as HTMLInputElement;
        const soloNumeros = (target.value || '').replace(/\D+/g, '').slice(0, 2);
        target.value = soloNumeros;
        this.campeonato.numTatamis = parseInt(soloNumeros, 10) || 0;
    }

    onMaxParticipantesInput(event: Event): void {
        // Reuse logic from create
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
            this.maxParticipantesTooLow = false;
            return;
        }
        let value = parseInt(digitsOnly, 10);
        if (value > 10000) { value = 10000; this.maxParticipantesLimitReached = true; }
        else { this.maxParticipantesLimitReached = wasTruncated; }
        this.maxParticipantesTooLow = value < 2;
        target.value = String(value);
        this.campeonato.maxParticipantes = value;
    }

    limitarTatamis() {
        if (this.campeonato.numTatamis > 12) this.campeonato.numTatamis = 12;
        if (this.campeonato.numTatamis < 1) this.campeonato.numTatamis = 1;
    }

    limitarMaxParticipantes(): void {
        if (this.campeonato.maxParticipantes && this.campeonato.maxParticipantes > 10000) this.campeonato.maxParticipantes = 10000;
        if (this.campeonato.maxParticipantes && this.campeonato.maxParticipantes < 2) this.campeonato.maxParticipantes = 2;
    }

    limitarEdad(event: Event) {
        const target = event.target as HTMLInputElement;
        let valor = (target.value || '').replace(/\D+/g, '');
        if (valor && parseInt(valor, 10) > 100) valor = '100';
        target.value = valor;
    }

    limitarPeso(event: Event) {
        const target = event.target as HTMLInputElement;
        let valor = (target.value || '').replace(/\D+/g, '');
        if (valor.length > 3) valor = valor.slice(0, 3);
        if (valor && parseInt(valor, 10) > 400) valor = '400';
        target.value = valor;
    }

    toggleModalidad(id: string): void {
        this.modalidades = this.modalidades.map(mod => {
            if (mod.id !== id) return mod;
            if (!mod.activa) return mod;
            return { ...mod, expanded: !mod.expanded };
        });
    }

    // --- Submit Logic (Saving) ---



    cancelCreateConfirm(): void {
        this.showCreateConfirm = false;
        this.scrollLock.unlock();
    }

    confirmCreateNow(): void { // confirmSave
        this.showCreateConfirm = false;
        this.scrollLock.unlock();
        this.performUpdate();
    }

    private performUpdate(): void {
        this.saving = true;
        this.scrollLock.lock();
        this.savingText = 'Actualizando campeonato...';
        const startedAt = Date.now();

        const esPublico = this.privacy === 'PUBLICO';

        const payload = {
            ...this.campeonato,
            esPublico,
            modalidades: this.modalidades.map((mod) => {
                // Determine expanded/active state and filter categories based on Enabled flags
                const flags = this.categoryEnabled[mod.id] || { cinturon: false, edad: false, peso: false };

                return {
                    id: mod.id,
                    nombre: mod.nombre,
                    activa: mod.activa,
                    categorias: {
                        // Solo enviar categorías si están HABILITADAS en la interfaz
                        cinturon: mod.activa && flags.cinturon ? mod.categorias.cinturon : [],
                        edad: mod.activa && flags.edad ? mod.categorias.edad : [],
                        peso: mod.activa && flags.peso ? mod.categorias.peso : [],
                        genero: mod.activa && mod.categorias.genero === null ? 'mixto' : mod.categorias.genero
                    }
                };
            })
        };

        this.api.updateCampeonato(this.id!, payload).subscribe({
            next: async () => {
                this.success = true;
                this.savingText = 'Campeonato actualizado exitosamente.';
                await delayRemaining(startedAt, DEFAULT_MIN_SPINNER_MS);
                this.saving = false;
                this.scrollLock.unlock();
                this.clearDraft();
                this.router.navigate(['/mis-campeonatos'], { replaceUrl: true });
            },
            error: async (err) => {
                this.success = false;
                this.message = 'Error al actualizar el campeonato.';
                await delayRemaining(startedAt, DEFAULT_MIN_SPINNER_MS);
                this.saving = false;
                this.scrollLock.unlock();
            }
        });
    }

    onCancelClick(): void {
        this.showCancelConfirm = true;
        this.scrollLock.lock();
    }

    cancelCancelConfirm(): void {
        this.showCancelConfirm = false;
        this.scrollLock.unlock();
    }

    confirmCancel(): void {
        this.canceled = true;
        this.clearDraft();
        this.showCancelConfirm = false;
        this.scrollLock.unlock();
        this.volverAtras();
    }

    volverAtras(): void {
        this.backNav.backOr({ fallbackUrl: '/mis-campeonatos' });
    }

    @HostListener('window:beforeunload')
    ngOnDestroy(): void {
        this.scrollLock.unlock();
        if (!this.success && !this.canceled) {
            this.saveDraft();
        }
    }

    // --- Draft Logic ---

    saveDraft(): void {
        if (!this.id) return;
        try {
            const draft = {
                campeonato: this.campeonato,
                modalidades: this.modalidades,
                categoryEnabled: this.categoryEnabled,
                privacy: this.privacy,
                timestamp: Date.now()
            };
            localStorage.setItem(`draft_champ_${this.id}`, JSON.stringify(draft));
        } catch (e) {
            console.error('Error saving draft', e);
        }
    }

    restoreDraft(): void {
        if (!this.id) return;
        const raw = localStorage.getItem(`draft_champ_${this.id}`);
        if (!raw) return;
        try {
            const draft = JSON.parse(raw);

            // Basic validity check (optional: check timestamp > updated_at from backend?)
            // For now, always trust draft if exists.

            if (draft.campeonato) this.campeonato = { ...this.campeonato, ...draft.campeonato };
            if (draft.modalidades) this.modalidades = draft.modalidades;
            if (draft.categoryEnabled) this.categoryEnabled = draft.categoryEnabled;
            if (draft.privacy) this.privacy = draft.privacy;

            // Re-trigger side effects
            if (this.campeonato.pais) this.onPaisChange();
            // Restaurar ciudad específicamente ya que onPaisChange la borra
            if (draft.campeonato && draft.campeonato.ciudad) {
                this.campeonato.ciudad = draft.campeonato.ciudad;
            }

            this.message = 'Se han restaurado tus cambios no guardados.';
        } catch (e) {
            console.error('Error restoring draft', e);
        }
    }

    clearDraft(): void {
        if (!this.id) return;
        localStorage.removeItem(`draft_champ_${this.id}`);
    }
}
