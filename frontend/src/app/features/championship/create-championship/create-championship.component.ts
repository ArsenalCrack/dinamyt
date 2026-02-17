import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
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
  selector: 'app-create-championship',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CustomSelectComponent, CountryAutocompleteComponent, FlatpickrDateDirective, LoadingSpinnerComponent],
  templateUrl: './create-championship.component.html',
  styleUrls: ['./create-championship.component.scss']
})
export class CreateChampionshipComponent implements OnInit, OnDestroy {
  private static readonly DRAFT_STORAGE_KEY = 'dinamyt:create-championship:draft:v1';
  private draftIntervalId: number | null = null;

  privacy: '' | 'PUBLICO' | 'PRIVADO' = '';
  readonly privacyOptions: Array<{ value: 'PUBLICO' | 'PRIVADO'; label: string }> = [
    { value: 'PUBLICO', label: 'Público' },
    { value: 'PRIVADO', label: 'Privado' }
  ];

  savingText = 'Creando campeonato...';
  private redirectingAfterCreate = false;
  maxParticipantesNonNumeric = false;
  maxParticipantesLimitReached = false;
  maxParticipantesTooLow = false;

  showCreateConfirm = false;
  showCancelConfirm = false;
  preflightMissing: string[] = [];
  preflightCanCreate = false;

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
    // Flatpickr suele entregar YYYY-MM-DD; forzamos medianoche para evitar desfases por TZ.
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

  private validateEnabledCategoriesHaveItems(): boolean {
    let ok = true;

    for (const mod of this.modalidades) {
      if (!mod.activa) continue;
      this.ensureCategoryFlags(mod);

      (['cinturon', 'edad', 'peso'] as const).forEach((key) => {
        if (!this.categoryEnabled[mod.id][key]) return;
        const items = mod.categorias[key] || [];
        if (items.length === 0) {
          this.categoryError[`${mod.id}-${key}`] = 'Añade al menos una opción si esta categoría está activa.';
          ok = false;
        }
      });
    }

    return ok;
  }

  private validateModalidadesSelection(): boolean {
    // 1) Debe existir al menos 1 modalidad activa
    const active = this.modalidades.filter(m => m.activa);
    if (active.length === 0) {
      this.message = 'Activa al menos una modalidad.';
      return false;
    }

    // 2) Para cada modalidad activa, debe haber al menos 1 categoría activa
    let ok = true;
    for (const mod of active) {
      this.ensureCategoryFlags(mod);
      const anyEnabled =
        !!this.categoryEnabled[mod.id].cinturon ||
        !!this.categoryEnabled[mod.id].edad ||
        !!this.categoryEnabled[mod.id].peso ||
        mod.categorias.genero !== null;

      const errorKey = `${mod.id}-modalidad`;
      if (!anyEnabled) {
        this.categoryError[errorKey] = 'Activa al menos una categoría para esta modalidad.';
        ok = false;
      } else {
        delete this.categoryError[errorKey];
      }
    }

    if (!ok) {
      this.message = 'En cada modalidad activa, elige al menos una categoría.';
    }

    return ok;
  }

  modalidades: ModalidadConfig[] = [
    {
      id: 'combates',
      nombre: 'Combates',
      activa: false,
      expanded: false,
      categorias: {
        cinturon: [],
        edad: [],
        peso: [],
        genero: null
      }
    },
    {
      id: 'figura-armas',
      nombre: 'Figura con armas',
      activa: false,
      expanded: false,
      categorias: {
        cinturon: [],
        edad: [],
        peso: [],
        genero: null
      }
    },
    {
      id: 'figura-manos',
      nombre: 'Figura a manos libres',
      activa: false,
      expanded: false,
      categorias: {
        cinturon: [],
        edad: [],
        peso: [],
        genero: null
      }
    },
    {
      id: 'defensa-personal',
      nombre: 'Defensa personal',
      activa: false,
      expanded: false,
      categorias: {
        cinturon: [],
        edad: [],
        peso: [],
        genero: null
      }
    },
    {
      id: 'salto-alto',
      nombre: 'Salto alto',
      activa: false,
      expanded: false,
      categorias: {
        cinturon: [],
        edad: [],
        peso: [],
        genero: null
      }
    },
    {
      id: 'salto-largo',
      nombre: 'Salto largo',
      activa: false,
      expanded: false,
      categorias: {
        cinturon: [],
        edad: [],
        peso: [],
        genero: null
      }
    }
  ];

  tatamisExpanded = true;
  saving = false;
  message: string | null = null;
  success = false;
  categoryError: { [key: string]: string } = {};
  pending: Record<string, Record<CategoryKey, PendingCategory>> = {};
  categoryEnabled: Record<string, Record<CategoryKey, boolean>> = {};

  constructor(
    private location: Location,
    private router: Router,
    private api: ApiService,
    private scrollLock: ScrollLockService,
    private backNav: BackNavigationService,
    private locationService: LocationService
  ) { }

  ngOnInit(): void {
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

    this.loadDraft();
    this.draftIntervalId = window.setInterval(() => this.saveDraft(), 1000);
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

  ngOnDestroy(): void {
    if (this.draftIntervalId != null) {
      window.clearInterval(this.draftIntervalId);
      this.draftIntervalId = null;
    }
    // Evita que la pantalla quede "paralizada" si el usuario navega hacia atrás.
    this.scrollLock.unlock();
    // Si acabamos de crear y vamos a redirigir, no re-guardes el borrador.
    if (!this.redirectingAfterCreate) {
      this.saveDraft();
    }
  }

  touchDraft(): void {
    this.saveDraft();
  }

  private saveDraft(): void {
    if (this.redirectingAfterCreate) return;
    try {
      const draft = {
        savedAt: Date.now(),
        campeonato: this.campeonato,
        privacy: this.privacy,
        modalidades: this.modalidades,
        categoryEnabled: this.categoryEnabled,
        pending: this.pending,
        tatamisExpanded: this.tatamisExpanded
      };
      localStorage.setItem(CreateChampionshipComponent.DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Ignorar errores de storage
    }
  }

  private loadDraft(): void {
    try {
      const raw = localStorage.getItem(CreateChampionshipComponent.DRAFT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;

      if (parsed.campeonato && typeof parsed.campeonato === 'object') {
        this.campeonato = { ...this.campeonato, ...parsed.campeonato };
      }

      if (parsed.privacy === 'PUBLICO' || parsed.privacy === 'PRIVADO') this.privacy = parsed.privacy;

      if (Array.isArray(parsed.modalidades)) {
        const byId = new Map<string, any>(parsed.modalidades.map((m: any) => [m?.id, m]));
        this.modalidades = this.modalidades.map((m) => {
          const dm = byId.get(m.id);
          if (!dm) return m;
          return {
            ...m,
            activa: !!dm.activa,
            expanded: !!dm.expanded,
            categorias: {
              cinturon: Array.isArray(dm?.categorias?.cinturon) ? dm.categorias.cinturon : [],
              edad: Array.isArray(dm?.categorias?.edad) ? dm.categorias.edad : [],
              peso: Array.isArray(dm?.categorias?.peso) ? dm.categorias.peso : [],
              genero: dm?.categorias?.genero ?? null
            }
          };
        });
      }

      if (parsed.categoryEnabled && typeof parsed.categoryEnabled === 'object') {
        this.categoryEnabled = parsed.categoryEnabled;
      }
      if (parsed.pending && typeof parsed.pending === 'object') {
        this.pending = parsed.pending;
      }
      if (typeof parsed.tatamisExpanded === 'boolean') {
        this.tatamisExpanded = parsed.tatamisExpanded;
      }

      this.modalidades.forEach(mod => {
        this.ensurePending(mod);
        this.ensureCategoryFlags(mod);
      });
    } catch {
      // Ignorar borrador corrupto
    }
  }

  private clearDraft(): void {
    try {
      localStorage.removeItem(CreateChampionshipComponent.DRAFT_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
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
    if (!enabled) {
      mod.categorias[key] = [];
    }
    // reset pending
    this.pending[mod.id][key] = { tipo: 'individual', valor: '', desde: '', hasta: '' };
  }

  setPendingType(mod: ModalidadConfig, key: CategoryKey, tipo: 'individual' | 'rango'): void {
    this.ensurePending(mod);
    this.pending[mod.id][key].tipo = tipo;
    // limpiar campos al cambiar tipo
    this.pending[mod.id][key].valor = '';
    this.pending[mod.id][key].desde = '';
    this.pending[mod.id][key].hasta = '';
    const errorKey = `${mod.id}-${key}`;
    delete this.categoryError[errorKey];
  }

  addCategoryFromPending(mod: ModalidadConfig, key: CategoryKey): void {
    this.ensurePending(mod);
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

    // requeridos
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

    // validación de orden (rango)
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

    // normalizar numéricos
    if (key === 'edad' || key === 'peso') {
      const minValue = key === 'edad' ? 4 : 10;
      if (p.tipo === 'individual') {
        const v = this.parseValue(key, newCategory.valor);
        if (!v) {
          this.categoryError[errorKey] = `Ingresa un número válido (${unit}).`;
          return;
        }

        if (v < minValue) {
          this.categoryError[errorKey] = key === 'edad'
            ? 'La edad mínima permitida es 4 años.'
            : `El peso mínimo permitido es ${minValue} kg.`;
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
          this.categoryError[errorKey] = key === 'edad'
            ? 'La edad mínima permitida es 4 años.'
            : `El peso mínimo permitido es ${minValue} kg.`;
          return;
        }
        newCategory.desde = String(d);
        newCategory.hasta = String(h);
      }
    }

    // validar solapamiento/duplicados
    const next = [...categories, newCategory];
    const solapamiento = this.validarSolapamiento(next, key);
    if (solapamiento) {
      this.categoryError[errorKey] = solapamiento;
      return;
    }

    categories.push(newCategory);
    mod.categorias[key] = categories;

    // reset
    this.pending[mod.id][key].valor = '';
    this.pending[mod.id][key].desde = '';
    this.pending[mod.id][key].hasta = '';
  }

  getSourcesForCategory(currentModId: string, key: CategoryKey): { id: string, nombre: string, count: number }[] {
    return this.modalidades
      .filter(m => m.id !== currentModId && m.activa && m.categorias[key] && m.categorias[key].length > 0)
      .map(m => ({
        id: m.id,
        nombre: m.nombre,
        count: m.categorias[key].length
      }));
  }

  importCategoryData(sourceModId: string, targetMod: ModalidadConfig, key: CategoryKey): void {
    const sourceMod = this.modalidades.find(m => m.id === sourceModId);
    if (!sourceMod) return;

    const sourceItems = sourceMod.categorias[key] || [];
    // Copia profunda de items para evitar problemas de referencia
    const copiedItems = sourceItems.map(item => ({ ...item })); // Copia superficial es suficiente si las propiedades son primitivas

    // Combinar con items actuales, evitando duplicados exactos
    const currentItems = targetMod.categorias[key] || [];

    // Estrategia simple: añadir filtrando duplicados exactos
    const nonDuplicates = copiedItems.filter(newItem => {
      // Verificar si el newItem ya existe en currentItems
      // Comparación básica de igualdad para nuestra estructura de config
      return !currentItems.some(existing =>
        existing.tipo === newItem.tipo &&
        existing.valor === newItem.valor &&
        existing.desde === newItem.desde &&
        existing.hasta === newItem.hasta
      );
    });

    targetMod.categorias[key] = [...currentItems, ...nonDuplicates];

    // Limpiar error si existe
    delete this.categoryError[`${targetMod.id}-${key}`];
    delete this.categoryError[`${targetMod.id}-modalidad`];
  }

  formatCategory(cat: CategoriaConfig, key: CategoryKey): string {
    const unit = key === 'edad' ? ' años' : key === 'peso' ? ' kg' : '';
    if (cat.tipo === 'individual') {
      return `${(cat.valor || '').toString()}${unit}`.trim();
    }
    if (key === 'cinturon') return `${cat.desde} a ${cat.hasta}`;
    return `${cat.desde}${unit} a ${cat.hasta}${unit}`;
  }

  isCharLimitReached(value: string, max: number): boolean {
    return (value || '').length >= max;
  }

  isNearCharLimit(value: string, max: number, threshold: number = 5): boolean {
    const len = (value || '').length;
    return len >= Math.max(0, max - threshold) && len < max;
  }

  onModalidadActivaChange(mod: ModalidadConfig): void {
    if (!mod.activa) {
      mod.expanded = false;
      this.ensureCategoryFlags(mod);
      this.categoryEnabled[mod.id].cinturon = false;
      this.categoryEnabled[mod.id].edad = false;
      this.categoryEnabled[mod.id].peso = false;

      delete this.categoryError[`${mod.id}-modalidad`];

      mod.categorias.cinturon = [];
      mod.categorias.edad = [];
      mod.categorias.peso = [];
      mod.categorias.genero = null;
    } else {
      // Si el usuario activa una modalidad, abrirla para que pueda configurar categorías
      mod.expanded = true;
    }
  }

  onGeneroToggle(mod: ModalidadConfig, enabled: boolean): void {
    delete this.categoryError[`${mod.id}-modalidad`];
    mod.categorias.genero = enabled ? 'individual' : null;
  }

  setGeneroType(mod: ModalidadConfig, value: 'individual' | 'mixto'): void {
    delete this.categoryError[`${mod.id}-modalidad`];
    mod.categorias.genero = value;
  }

  onDocumentoInput(event: Event) {
    const target = event.target as HTMLInputElement;
    const soloNumeros = (target.value || '').replace(/\D+/g, '').slice(0, 2);
    target.value = soloNumeros;
    this.campeonato.numTatamis = parseInt(soloNumeros, 10) || 0;
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

  limitarTatamis() {
    if (this.campeonato.numTatamis > 12) {
      this.campeonato.numTatamis = 12;
    }
    if (this.campeonato.numTatamis < 1) {
      this.campeonato.numTatamis = 1;
    }
  }

  limitarMaxParticipantes(): void {
    const current = this.campeonato.maxParticipantes;
    if (current == null) return;

    if (current > 10000) {
      this.campeonato.maxParticipantes = 10000;
      this.maxParticipantesLimitReached = true;
    }
    if (current < 2) {
      this.campeonato.maxParticipantes = 2;
    }

    this.maxParticipantesTooLow = (this.campeonato.maxParticipantes ?? 0) < 2;
  }

  limitarEdad(event: Event) {
    const target = event.target as HTMLInputElement;
    let valor = (target.value || '').replace(/\D+/g, '');
    if (valor && parseInt(valor, 10) > 100) {
      valor = '100';
    }
    target.value = valor;
  }

  limitarPeso(event: Event) {
    const target = event.target as HTMLInputElement;
    let valor = (target.value || '').replace(/\D+/g, '');
    if (valor.length > 3) {
      valor = valor.slice(0, 3);
    }
    // Validar que no supere 400
    if (valor && parseInt(valor, 10) > 400) {
      valor = '400';
    }
    target.value = valor;
  }


  toggleModalidad(id: string): void {
    this.modalidades = this.modalidades.map(mod => {
      if (mod.id !== id) return mod;
      if (!mod.activa) return mod;
      return { ...mod, expanded: !mod.expanded };
    });
  }

  setCategoriaType(mod: ModalidadConfig, categoryKey: 'cinturon' | 'edad' | 'peso', type: 'individual' | 'rango'): void {
    const categories = mod.categorias[categoryKey];
    if (categories) {
      mod.categorias[categoryKey] = categories.map(cat => ({ ...cat, tipo: type }));
    }
  }

  addCategoryItem(mod: ModalidadConfig, categoryKey: 'cinturon' | 'edad' | 'peso', tipo?: 'individual' | 'rango'): void {
    const categories = mod.categorias[categoryKey];
    if (!categories) return;

    const errorKey = `${mod.id}-${categoryKey}`;
    delete this.categoryError[errorKey];

    // Si hay un último item vacío, sobreescribirlo con el nuevo tipo
    if (categories.length > 0) {
      const lastItem = categories[categories.length - 1];
      const isLastEmpty = !lastItem.valor && !lastItem.desde && !lastItem.hasta;

      if (isLastEmpty && tipo) {
        // Sobreescribir el tipo del último item vacío
        lastItem.tipo = tipo;
        if (tipo === 'individual') {
          lastItem.valor = '';
          lastItem.desde = undefined;
          lastItem.hasta = undefined;
        } else {
          lastItem.valor = undefined;
          lastItem.desde = '';
          lastItem.hasta = '';
        }
        return;
      }
    }

    // Validar items incompletos
    const itemsIncompletos = categories.filter(cat => {
      if (cat.tipo === 'individual') {
        return !cat.valor || (cat.valor || '').toString().trim() === '';
      } else {
        return !cat.desde || !cat.hasta ||
          (cat.desde || '').toString().trim() === '' ||
          (cat.hasta || '').toString().trim() === '';
      }
    });

    if (itemsIncompletos.length > 0) {
      this.categoryError[errorKey] = 'Completa todos los campos antes de agregar otro.';
      return;
    }

    // Validar que en rangos el valor desde no sea igual al hasta
    const rangosIguales = categories.some(cat => {
      if (cat.tipo === 'rango' && cat.desde && cat.hasta) {
        if (categoryKey === 'cinturon') {
          return cat.desde === cat.hasta;
        } else {
          const desde = (cat.desde || '').toString().trim();
          const hasta = (cat.hasta || '').toString().trim();
          return desde === hasta;
        }
      }
      return false;
    });

    if (rangosIguales) {
      this.categoryError[errorKey] = `El rango "desde" y "hasta" no pueden ser iguales.`;
      return;
    }

    // Validar rangos (desde < hasta)
    const rangosInvalidos = categories.some(cat => {
      if (cat.tipo === 'rango' && cat.desde && cat.hasta) {
        if (categoryKey === 'cinturon') {
          const desdeOrder = this.cinturonOrder[cat.desde];
          const hastaOrder = this.cinturonOrder[cat.hasta];
          return desdeOrder >= hastaOrder;
        } else {
          const desde = this.parseValue(categoryKey, cat.desde);
          const hasta = this.parseValue(categoryKey, cat.hasta);
          return desde >= hasta;
        }
      }
      return false;
    });

    if (rangosInvalidos) {
      this.categoryError[errorKey] = 'El valor "desde" debe ser menor que "hasta".';
      return;
    }

    // Validar solapamiento completo
    const solapamiento = this.validarSolapamiento(categories, categoryKey);
    if (solapamiento) {
      this.categoryError[errorKey] = solapamiento;
      return;
    }

    // Agregar nueva categoría
    const tipoFinal = tipo || 'individual';
    const newCategory: CategoriaConfig = {
      nombre: '',
      activa: true,
      tipo: tipoFinal,
      valor: tipoFinal === 'individual' ? '' : undefined,
      desde: tipoFinal === 'rango' ? '' : undefined,
      hasta: tipoFinal === 'rango' ? '' : undefined
    };
    categories.push(newCategory);
  }

  validarSolapamiento(categories: CategoriaConfig[], categoryKey: 'cinturon' | 'edad' | 'peso'): string | null {
    // Validación para cinturón
    if (categoryKey === 'cinturon') {
      const individuales = categories
        .filter(cat => cat.tipo === 'individual' && cat.valor)
        .map(cat => (cat.valor || '').toString().trim());

      const rangos = categories
        .filter(cat => cat.tipo === 'rango' && cat.desde && cat.hasta)
        .map(cat => ({
          desde: (cat.desde || '').toString().trim(),
          hasta: (cat.hasta || '').toString().trim()
        }));

      // Verificar duplicados individuales
      const duplicados = individuales.filter((item, index) => individuales.indexOf(item) !== index);
      if (duplicados.length > 0) {
        return `Cinturón duplicado: ${duplicados[0]}`;
      }

      // Verificar si un individual está dentro de un rango
      for (const ind of individuales) {
        const indOrder = this.cinturonOrder[ind];
        for (const rango of rangos) {
          const desdeOrder = this.cinturonOrder[rango.desde];
          const hastaOrder = this.cinturonOrder[rango.hasta];
          if (indOrder >= desdeOrder && indOrder <= hastaOrder) {
            return `El cinturón "${ind}" ya está incluido en el rango "${rango.desde} a ${rango.hasta}".`;
          }
        }
      }

      // Verificar solapamiento entre rangos
      for (let i = 0; i < rangos.length; i++) {
        for (let j = i + 1; j < rangos.length; j++) {
          const r1Desde = this.cinturonOrder[rangos[i].desde];
          const r1Hasta = this.cinturonOrder[rangos[i].hasta];
          const r2Desde = this.cinturonOrder[rangos[j].desde];
          const r2Hasta = this.cinturonOrder[rangos[j].hasta];

          if ((r1Desde <= r2Hasta && r1Hasta >= r2Desde)) {
            return `Los rangos "${rangos[i].desde} a ${rangos[i].hasta}" y "${rangos[j].desde} a ${rangos[j].hasta}" se solapan.`;
          }
        }
      }
    }
    // Validación para edad y peso (numéricos)
    else if (categoryKey === 'edad' || categoryKey === 'peso') {
      const individuales = categories
        .filter(cat => cat.tipo === 'individual' && cat.valor)
        .map(cat => this.parseValue(categoryKey, cat.valor!));

      const rangos = categories
        .filter(cat => cat.tipo === 'rango' && cat.desde && cat.hasta)
        .map(cat => ({
          desde: this.parseValue(categoryKey, cat.desde!),
          hasta: this.parseValue(categoryKey, cat.hasta!),
          desdeStr: (cat.desde || '').toString(),
          hastaStr: (cat.hasta || '').toString()
        }));

      // Verificar duplicados individuales
      const duplicados = individuales.filter((item, index) => individuales.indexOf(item) !== index);
      if (duplicados.length > 0) {
        const unidad = categoryKey === 'edad' ? 'años' : 'kg';
        return `Valor duplicado: ${duplicados[0]} ${unidad}`;
      }

      // Verificar si un individual está dentro de un rango
      for (const ind of individuales) {
        for (const rango of rangos) {
          if (ind >= rango.desde && ind <= rango.hasta) {
            const unidad = categoryKey === 'edad' ? 'años' : 'kg';
            return `El valor "${ind} ${unidad}" ya está incluido en el rango "${rango.desdeStr} a ${rango.hastaStr}".`;
          }
        }
      }

      // Verificar solapamiento entre rangos
      for (let i = 0; i < rangos.length; i++) {
        for (let j = i + 1; j < rangos.length; j++) {
          const r1 = rangos[i];
          const r2 = rangos[j];
          if ((r1.desde <= r2.hasta && r1.hasta >= r2.desde)) {
            return `Los rangos "${r1.desdeStr} a ${r1.hastaStr}" y "${r2.desdeStr} a ${r2.hastaStr}" se solapan.`;
          }
        }
      }
    }

    return null;
  }

  parseValue(categoryKey: string, value: any): number {
    if (categoryKey === 'edad' || categoryKey === 'peso') {
      return parseInt(value, 10) || 0;
    }
    return 0;
  }

  removeCategoryItem(mod: ModalidadConfig, categoryKey: 'cinturon' | 'edad' | 'peso', index: number): void {
    const categories = mod.categorias[categoryKey];
    if (categories) {
      categories.splice(index, 1);
      if (categories.length === 0) {
        // Si no quedan categorías, limpiar el array
        mod.categorias[categoryKey] = [];
      }
    }
  }

  private preflightValidate(): { ok: boolean; missing: string[] } {
    const missing: string[] = [];

    const nombre = (this.campeonato.nombre || '').trim();
    const ubicacion = (this.campeonato.ubicacion || '').trim();
    const alcance = (this.campeonato.alcance || '').trim();
    const privacidad = (this.privacy || '').trim();
    const numTatamis = Number(this.campeonato.numTatamis);
    const maxParticipantes = Number(this.campeonato.maxParticipantes);

    if (!nombre || nombre.length < 3) missing.push('Nombre (mínimo 3 caracteres)');
    if (!ubicacion || ubicacion.length < 3) missing.push('Ubicación / Sede (mínimo 3 caracteres)');

    if (!this.campeonato.fechaInicio) missing.push('Fecha de inicio');
    if (!this.campeonato.fechaFin) missing.push('Fecha de fin');
    if (this.campeonato.fechaInicio && this.campeonato.fechaFin) {
      const start = this.parseDate(this.campeonato.fechaInicio);
      const end = this.parseDate(this.campeonato.fechaFin);
      if (!start || !end) missing.push('Fechas con formato válido');
      else if (end.getTime() < start.getTime()) missing.push('Rango de fechas válido (fin >= inicio)');
    }

    if (!alcance) missing.push('Ámbito');

    if (!privacidad) missing.push('Privacidad');

    if (!Number.isFinite(numTatamis) || numTatamis < 1 || numTatamis > 12) {
      missing.push('Número de áreas (Tatamis) (1 a 12)');
    }

    if (!Number.isFinite(maxParticipantes) || maxParticipantes < 2 || maxParticipantes > 10000) {
      missing.push('Máximo de participantes (2 a 10000)');
    }

    const active = this.modalidades.filter(m => m.activa);
    if (active.length === 0) {
      missing.push('Activar al menos una modalidad');
    }

    for (const mod of active) {
      this.ensureCategoryFlags(mod);
      const anyEnabled =
        !!this.categoryEnabled[mod.id]?.cinturon ||
        !!this.categoryEnabled[mod.id]?.edad ||
        !!this.categoryEnabled[mod.id]?.peso ||
        mod.categorias.genero !== null;

      if (!anyEnabled) {
        missing.push(`Configurar categorías en ${mod.nombre}`);
        continue;
      }

      (['cinturon', 'edad', 'peso'] as const).forEach((key) => {
        if (!this.categoryEnabled[mod.id]?.[key]) return;
        const items = mod.categorias[key] || [];
        if (items.length === 0) {
          const label = key === 'cinturon' ? 'Cinturón / Nivel' : key === 'edad' ? 'Edad' : 'Peso';
          missing.push(`Añadir al menos una opción de ${label} en ${mod.nombre}`);
        }
      });
    }

    return { ok: missing.length === 0, missing };
  }

  onSubmit(form?: NgForm): void {
    if (form?.form) {
      form.form.markAllAsTouched();
    }

    this.saveDraft();

    const preflight = this.preflightValidate();
    this.preflightMissing = preflight.missing;
    this.preflightCanCreate = preflight.ok;
    this.showCreateConfirm = true;
    this.scrollLock.lock();
  }

  cancelCreateConfirm(): void {
    this.showCreateConfirm = false;
    this.scrollLock.unlock();
  }

  confirmCreateNow(): void {
    if (!this.preflightCanCreate) return;
    this.showCreateConfirm = false;
    this.scrollLock.unlock();
    this.performCreate();
  }

  private performCreate(): void {
    this.message = null;
    this.success = false;
    this.redirectingAfterCreate = false;
    this.savingText = 'Creando campeonato...';

    const nombre = (this.campeonato.nombre || '').trim();
    const ubicacion = (this.campeonato.ubicacion || '').trim();
    const alcance = (this.campeonato.alcance || '').trim();
    const numTatamis = Number(this.campeonato.numTatamis);
    const maxParticipantes = Number(this.campeonato.maxParticipantes);

    const esPublico = this.privacy === 'PUBLICO' ? true : this.privacy === 'PRIVADO' ? false : undefined;

    const payload = {
      ...this.campeonato,
      nombre,
      ubicacion,
      alcance,
      numTatamis,
      maxParticipantes,
      ...(typeof esPublico === 'boolean' ? { esPublico } : {}),
      creadoPor: sessionStorage.getItem('idDocumento'),
      NombreCreador: sessionStorage.getItem("nombreC"),
      modalidades: this.modalidades.map(({ expanded, ...rest }) => ({
        ...rest,
        categorias: {
          ...rest.categorias,
          genero: rest.activa && rest.categorias.genero === null ? 'mixto' : rest.categorias.genero
        }
      }))
    };

    this.saving = true;
    this.scrollLock.lock();
    const startedAt = Date.now();

    this.api.crearCampeonato(payload).subscribe({
      next: async (res: any) => {
        this.success = true;

        this.redirectingAfterCreate = true;
        this.savingText = 'Campeonato creado. Abriendo Mis campeonatos...';

        if (this.draftIntervalId != null) {
          window.clearInterval(this.draftIntervalId);
          this.draftIntervalId = null;
        }

        this.clearDraft();

        await delayRemaining(startedAt, DEFAULT_MIN_SPINNER_MS);

        this.saving = false;
        this.scrollLock.unlock();
        this.router.navigate(['/mis-campeonatos'], { replaceUrl: true });
      },
      error: async (err) => {
        this.success = false;
        this.message = err?.error?.message || 'No pudimos crear el campeonato. Intenta de nuevo.';
        window.scrollTo({ top: 0, behavior: 'smooth' });

        await delayRemaining(startedAt, DEFAULT_MIN_SPINNER_MS);
        this.saving = false;
        this.scrollLock.unlock();
      }
    });
  }

  // --- Cancel Flow ---

  onCancelClick(): void {
    this.showCancelConfirm = true;
    this.scrollLock.lock();
  }

  cancelCancelConfirm(): void {
    this.showCancelConfirm = false;
    this.scrollLock.unlock();
  }

  confirmCancel(): void {
    this.showCancelConfirm = false;
    this.scrollLock.unlock();
    this.clearDraft();
    this.router.navigate(['/dashboard']);
  }


  volverAtras(): void {
    this.backNav.backOr({
      fallbackUrl: '/dashboard'
    });
  }
}
