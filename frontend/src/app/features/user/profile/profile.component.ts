import { Component, ElementRef, HostListener, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { Location } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { delayRemaining } from '../../../core/utils/spinner-timing.util';
import { CountryAutocompleteComponent } from '../../../shared/components/country-autocomplete/country-autocomplete.component';
import { LocationService } from '../../../core/services/location.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CustomSelectComponent, LoadingSpinnerComponent, CountryAutocompleteComponent],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnDestroy {
  private readonly MAX_EMAIL_LEN = 40;
  private readonly MAX_PHONE_LEN = 20;

  paisesList: string[] = [];

  usuario = {
    nombreC: sessionStorage.getItem('nombreC') || '',
    correo: sessionStorage.getItem('correo') || '',
    idDocumento: sessionStorage.getItem('idDocumento') || '',
    sexo: sessionStorage.getItem('sexo') || '',
    fechaNacimiento: sessionStorage.getItem('fechaNacimiento') || '',
    cinturon_rango: sessionStorage.getItem('cinturon_rango') ?? sessionStorage.getItem('cinturonRango') ?? null,
    nacionalidad: sessionStorage.getItem('nacionalidad') || '',
    ciudad: sessionStorage.getItem('ciudad') || '',
    numero_celular: (sessionStorage.getItem('numero_celular') ?? sessionStorage.getItem('numeroCelular')) || '',
    academia: this.parseStoredValue(sessionStorage.getItem('academia'), ['academia']),
    Instructor: this.parseStoredValue(sessionStorage.getItem('Instructor') ?? sessionStorage.getItem('instructor'), ['Instructor', 'instructor'])
  };

  ciudadesList: string[] = [];
  ciudadMaxLength = 50;

  telefonoCodigo = '';
  phoneCodeOptions: Array<{ value: string | null; label: string }> = [];

  // Opciones para dropdowns
  academias: Array<{ value: string | null; label: string }> = [];
  instructores: Array<{ value: string | null; label: string }> = [];
  private static readonly CINTURONES_BASE = [
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

  get cinturonOptions(): Array<{ value: string | null; label: string }> {
    const current = this.usuario.cinturon_rango;
    // Si ya tiene un cinturón (no es null ni 'Sin cinturón'), no mostramos la opción 'Sin cinturón'
    if (current && current !== 'Sin cinturón') {
      return ProfileComponent.CINTURONES_BASE;
    }
    return [
      { value: null, label: 'Sin cinturón' },
      ...ProfileComponent.CINTURONES_BASE
    ];
  }

  academiaOtra: string = '';
  instructorOtro: string = '';

  correoLimitMsg = '';

  academiaLimitMsg = '';
  instructorLimitMsg = '';
  academiaOtraLimitMsg = '';
  instructorOtroLimitMsg = '';

  // Autocomplete (academia)
  @ViewChild('academiaAutocomplete', { static: false }) academiaAutocomplete?: ElementRef<HTMLElement>;
  academiaSearchText = '';
  academiaIsOpen = false;
  academiaFocusedIndex = -1;
  academiaFilteredOptions: Array<{ value: string | null; label: string }> = [];
  academiaOptionsStyle: { [key: string]: any } = {};

  // Autocomplete (instructor)
  @ViewChild('instructorAutocomplete', { static: false }) instructorAutocomplete?: ElementRef<HTMLElement>;
  instructorSearchText = '';
  instructorIsOpen = false;
  instructorFocusedIndex = -1;
  instructorFilteredOptions: Array<{ value: string | null; label: string }> = [];
  instructorOptionsStyle: { [key: string]: any } = {};

  fotoPreview: string | null = null;
  fotoFile: File | null = null;
  fotoUrl: string | null = sessionStorage.getItem('fotoUrl');
  saving = false;
  message: string | null = null;
  success = false;

  constructor(
    private api: ApiService,
    private router: Router,
    private location: Location,
    private locationService: LocationService
  ) {
    this.initLocationData();
    this.initTelefono();
    this.initCiudad();
    this.cargarAcademias();
  }

  private initLocationData() {
    this.paisesList = this.locationService.getAllCountries().map(c => c.name).sort();

    // Initialize phone codes from service
    const countries = this.locationService.getAllCountries();
    const codes = new Set<string>();
    countries.forEach(c => {
      if (c.phonecode) codes.add(c.phonecode.startsWith('+') ? c.phonecode : `+${c.phonecode}`);
    });

    // Convert to sorted unique list
    const sortedCodes = Array.from(codes).sort((a, b) => {
      // Parse numbers to sort numerically (+1, +7, +57)
      return parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, ''));
    });

    this.phoneCodeOptions = [
      { value: null, label: 'Sin prefijo' },
      ...sortedCodes.map(code => ({ value: code, label: code }))
    ];
  }

  private initCiudad(): void {
    if (this.usuario.nacionalidad) {
      const country = this.locationService.getCountryByName(this.usuario.nacionalidad);
      if (country) {
        this.ciudadesList = this.locationService.getCitiesByCountryCode(country.isoCode)
          .map(c => c.name)
          .sort();
      } else {
        // Fallback: si no encontramos el país, dejar lista vacía o intentar recuperarla si fuera posible
        this.ciudadesList = [];
      }

      if (this.ciudadesList.length > 0) {
        this.ciudadMaxLength = this.ciudadesList.reduce((max, c) => Math.max(max, c.length), 0);
      } else {
        this.ciudadMaxLength = 50;
      }
    }
  }

  private initTelefono(): void {
    const raw = String(this.usuario.numero_celular || '').trim();
    const parts = this.extractTelefonoParts(raw);
    this.telefonoCodigo = parts.code;
    this.usuario.numero_celular = parts.number;
  }

  private extractTelefonoParts(raw: string): { code: string; number: string } {
    // Attempt to guess code based on current nationality if raw is empty
    let fallbackCode = '';
    if (this.usuario.nacionalidad) {
      const c = this.locationService.getCountryByName(this.usuario.nacionalidad);
      if (c && c.phonecode) fallbackCode = c.phonecode.startsWith('+') ? c.phonecode : `+${c.phonecode}`;
    }

    if (!raw) return { code: fallbackCode, number: '' };

    const cleaned = raw.replace(/\s+/g, '');
    const digits = cleaned.replace(/\D/g, '');

    // Caso: viene con +código
    if (cleaned.startsWith('+')) {
      // Find matching code from options
      const codes = this.phoneCodeOptions
        .map(o => o.value)
        .filter(v => v !== null) as string[];

      // Sort by length desc to match longest code first (+1 vs +123)
      codes.sort((a, b) => b.length - a.length);

      const match = codes.find(c => cleaned.startsWith(c));
      if (match) {
        const restDigits = cleaned.slice(match.length).replace(/\D/g, '');
        return { code: match, number: restDigits.slice(0, this.MAX_PHONE_LEN) };
      }
      return { code: fallbackCode, number: digits.slice(0, this.MAX_PHONE_LEN) };
    }

    // Caso: solo número
    return { code: fallbackCode, number: digits.slice(0, this.MAX_PHONE_LEN) };
  }

  onCountryChange() {
    this.ciudadesList = [];
    if (!this.usuario.nacionalidad) {
      this.usuario.ciudad = '';
      return;
    }

    const country = this.locationService.getCountryByName(this.usuario.nacionalidad);
    if (country) {
      this.ciudadesList = this.locationService.getCitiesByCountryCode(country.isoCode)
        .map(c => c.name)
        .sort();

      // Auto-update phone code if empty
      if (!this.telefonoCodigo && country.phonecode) {
        this.telefonoCodigo = country.phonecode.startsWith('+') ? country.phonecode : `+${country.phonecode}`;
      }
    } else {
      this.ciudadesList = [];
    }

    // Clear city if not in list (optional, but safer)
    if (this.usuario.ciudad && !this.ciudadesList.includes(this.usuario.ciudad)) {
      // Only clear if list is not empty (because if list is empty due to fetch error, we shouldn't wipe data)
      if (this.ciudadesList.length > 0) this.usuario.ciudad = '';
    }
  }

  onCorreoInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const maxLength = this.MAX_EMAIL_LEN;
    let value = target.value || '';

    if (value.length > maxLength) {
      value = value.slice(0, maxLength);
      target.value = value;
    }

    this.usuario.correo = value;

    if (value.length === maxLength) {
      this.correoLimitMsg = `Has alcanzado el límite máximo de ${maxLength} caracteres.`;
    } else if (value.length > maxLength - 10) {
      const remaining = maxLength - value.length;
      this.correoLimitMsg = `Te quedan ${remaining} caracteres disponibles.`;
    } else {
      this.correoLimitMsg = '';
    }
  }

  onTelefonoInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = (input.value || '').replace(/\D/g, '').slice(0, this.MAX_PHONE_LEN);
    this.usuario.numero_celular = digits;
    if (input.value !== digits) input.value = digits;
  }

  private parseStoredValue(value: string | null, keysToClear: string[] = []): string | null {
    if (!value) return null;
    const v = String(value).trim();
    if (!v || v === 'null' || v === 'undefined' || v === '[object Object]') {
      for (const k of keysToClear) sessionStorage.removeItem(k);
      return null;
    }
    return v;
  }

  cargarAcademias() {
    this.api.cargaracademias().subscribe({
      next: (u: any[]) => {
        this.academias = (u || []).map(a => {
          const rawId = a?.ID_academia ?? a?.id_academia ?? a?.idAcademia ?? a?.id;
          const rawNombre = a?.nombre ?? a?.name;
          return {
            value: rawId !== null && rawId !== undefined ? String(rawId) : null,
            label: rawNombre !== null && rawNombre !== undefined ? String(rawNombre) : ''
          };
        }).filter(a => a.label);

        // Si en sessionStorage hay un texto (academia personalizada), forzar modo 'otra'
        this.normalizeAcademiaFromStoredValue();
        this.syncAcademiaSearchTextFromValue();
        console.log(this.usuario.Instructor);
        if (this.usuario.academia && this.usuario.academia !== 'otra') {
          this.cargarInstructores(this.usuario.academia);
        }
      },
      error: (err) => {
        console.log(err);
      }
    })
  }

  cargarInstructores(idAcademia: string | number | null): void {
    const id = Number(idAcademia);
    // Validaciones
    if (!idAcademia || idAcademia === 'otra' || isNaN(id)) {
      this.instructores = [];
      this.normalizeInstructorFromStoredValue();
      this.syncInstructorSearchTextFromValue();
      return;
    }

    this.api.cargarinstructor(id,sessionStorage.getItem('idDocumento') || '').subscribe({
      next: (u: any[]) => {
        this.instructores = (u || [])
          .map(i => {
            const rawId = i?.idDocumento ?? i?.ID_documento ?? i?.id_documento ?? i?.id;
            const rawNombre = i?.nombreC ?? i?.nombre ?? i?.name;

            return {
              value: rawId != null ? String(rawId) : null,
              label: rawNombre != null ? String(rawNombre) : ''
            };
          })
          .filter(i => i.label);

        this.normalizeInstructorFromStoredValue();
        this.syncInstructorSearchTextFromValue();
      },
      error: err => {
        console.error(err);
        this.instructores = [];
        this.syncInstructorSearchTextFromValue();
      }
    });
  }


  private normalizeAcademiaFromStoredValue() {
    const current = this.usuario.academia;
    if (!current || current === 'otra') return;

    // Valor corrupto en sessionStorage (p.ej. guardado como objeto)
    if (String(current).trim() === '[object Object]') {
      sessionStorage.removeItem('academia');
      this.usuario.academia = null;
      this.academiaOtra = '';
      return;
    }

    const currentStr = String(current).trim();

    // 1) Si coincide con algún id, ok
    const matchById = this.academias.some(a => a.value === currentStr);
    if (matchById) return;

    // 2) Si viene guardado como nombre, resolver al id correspondiente
    const matchByLabel = this.academias.find(a => a.label.trim().toLowerCase() === currentStr.toLowerCase());
    if (matchByLabel?.value) {
      this.usuario.academia = matchByLabel.value;
      return;
    }

    // 3) Si no coincide, tratarlo como texto libre
    this.academiaOtra = currentStr.slice(0, 50);
    this.usuario.academia = 'otra';
  }

  private normalizeInstructorFromStoredValue() {
    const current = this.usuario.Instructor;
    if (!current || current === 'otro') return;

    if (String(current).trim() === '[object Object]') {
      sessionStorage.removeItem('Instructor');
      sessionStorage.removeItem('instructor');
      this.usuario.Instructor = null;
      this.instructorOtro = '';
      return;
    }

    const currentStr = String(current).trim();

    // 1) Si coincide con algún id, ok
    const matchById = this.instructores.some(i => i.value === currentStr);
    if (matchById) return;

    // 2) Si viene guardado como nombre, resolver al id correspondiente
    const matchByLabel = this.instructores.find(i => i.label.trim().toLowerCase() === currentStr.toLowerCase());
    if (matchByLabel?.value) {
      this.usuario.Instructor = matchByLabel.value;
      return;
    }

    // 3) Si no coincide, tratarlo como texto libre
    this.instructorOtro = currentStr.slice(0, 50);
    this.usuario.Instructor = 'otro';
  }

  // Opciones con valores nulos para UX consistente
  get academiaOptions(): Array<{ value: string | null; label: string }> {
    return [...this.academias];
  }

  get instructorOptions(): Array<{ value: string | null; label: string }> {
    return [...this.instructores];
  }

  private compareValues(a: any, b: any): boolean {
    if (a === b) return true;
    if (a === null || a === undefined || b === null || b === undefined) return a === b;
    return String(a) === String(b);
  }

  private findLabelByValue(options: Array<{ value: string | null; label: string }>, value: any): string {
    const match = options.find(o => this.compareValues(o.value, value));
    return match?.label ?? '';
  }

  private syncAcademiaSearchTextFromValue(): void {
    if (this.academiaIsOpen) return;
    this.academiaSearchText = this.findLabelByValue(this.academiaOptions, this.usuario.academia);
  }

  private syncInstructorSearchTextFromValue(): void {
    if (this.instructorIsOpen) return;
    this.instructorSearchText = this.findLabelByValue(this.instructorOptions, this.usuario.Instructor);
  }

  private positionAcademiaOptions() {
    try {
      const el = this.academiaAutocomplete?.nativeElement;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const margin = 16;
      const preferredWidth = Math.max(rect.width, 200);
      const maxWidth = Math.min(preferredWidth, vw - margin * 2);

      let left = rect.left;
      if (left + maxWidth + margin > vw) left = Math.max(margin, vw - maxWidth - margin);
      if (left < margin) left = margin;

      const spaceBelow = vh - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const maxHeight = 240;
      const gap = 8;

      let top: number | null = null;
      let bottom: number | null = null;
      if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
        top = rect.bottom + gap;
      } else {
        bottom = vh - (rect.top - gap);
      }

      const style: any = {
        position: 'fixed',
        left: `${left}px`,
        width: `${maxWidth}px`,
        'max-height': `${maxHeight}px`,
        overflow: 'auto'
      };
      if (top !== null) style.top = `${top}px`; else style.bottom = `${bottom}px`;
      this.academiaOptionsStyle = style;
    } catch {
      this.academiaOptionsStyle = {};
    }
  }

  private positionInstructorOptions() {
    try {
      const el = this.instructorAutocomplete?.nativeElement;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const margin = 16;
      const preferredWidth = Math.max(rect.width, 200);
      const maxWidth = Math.min(preferredWidth, vw - margin * 2);

      let left = rect.left;
      if (left + maxWidth + margin > vw) left = Math.max(margin, vw - maxWidth - margin);
      if (left < margin) left = margin;

      const spaceBelow = vh - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const maxHeight = 240;
      const gap = 8;

      let top: number | null = null;
      let bottom: number | null = null;
      if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
        top = rect.bottom + gap;
      } else {
        bottom = vh - (rect.top - gap);
      }

      const style: any = {
        position: 'fixed',
        left: `${left}px`,
        width: `${maxWidth}px`,
        'max-height': `${maxHeight}px`,
        overflow: 'auto'
      };
      if (top !== null) style.top = `${top}px`; else style.bottom = `${bottom}px`;
      this.instructorOptionsStyle = style;
    } catch {
      this.instructorOptionsStyle = {};
    }
  }

  goBack(): void {
    this.location.back();
  }

  onAcademiaChange(value: string | null): void {

    // Guardar academia (ID o 'otra')
    this.usuario.academia = value;

    // Reset instructor
    this.usuario.Instructor = null;
    this.instructores = [];

    if (value === 'otra' || !value) {
      this.academiaOtra = '';
      this.syncAcademiaSearchTextFromValue();
      return;
    }

    // Cargar instructores usando el ID
    this.cargarInstructores(value);

    this.syncAcademiaSearchTextFromValue();
  }


  onInstructorChange(value: any): void {
    this.usuario.Instructor = value;
    if (this.usuario.Instructor !== 'otro') {
      this.instructorOtro = '';
    }
    this.syncInstructorSearchTextFromValue();
  }

  // ==== UI handlers: Academia autocomplete (inline) ====
  onAcademiaInputChange() {
    if (this.academiaSearchText?.length > 50) this.academiaSearchText = this.academiaSearchText.slice(0, 50);
    this.academiaLimitMsg = this.academiaSearchText?.length >= 50 ? 'Máximo 50 caracteres.' : '';

    const search = this.academiaSearchText.toLowerCase().trim();
    const options = this.academiaOptions;
    this.academiaFilteredOptions = !search
      ? [...options]
      : options.filter(o => o.label.toLowerCase().includes(search));

    this.academiaIsOpen = true;
    this.academiaFocusedIndex = this.academiaFilteredOptions.length > 0 ? 0 : -1;
    this.positionAcademiaOptions();
  }

  onAcademiaInputFocus() {
    this.academiaFilteredOptions = [...this.academiaOptions];
    this.academiaIsOpen = true;
    this.academiaFocusedIndex = this.academiaFilteredOptions.length > 0 ? 0 : -1;
    this.positionAcademiaOptions();
  }

  toggleAcademiaDropdown() {
    if (this.academiaIsOpen) {
      this.academiaIsOpen = false;
      return;
    }
    this.academiaFilteredOptions = [...this.academiaOptions];
    this.academiaIsOpen = true;
    this.academiaFocusedIndex = this.academiaFilteredOptions.length > 0 ? 0 : -1;
    this.positionAcademiaOptions();
  }

  selectAcademia(option: { value: string | null; label: string }) {
    this.academiaSearchText = option.label;
    this.onAcademiaChange(option.value);
    this.academiaIsOpen = false;
  }

  onAcademiaInputBlur() {
    // Si el texto no coincide con una opción válida, restaurar el valor seleccionado
    const exactMatch = this.academiaOptions.some(o => o.label === this.academiaSearchText);
    if (this.academiaSearchText && !exactMatch) {
      this.syncAcademiaSearchTextFromValue();
    }
  }

  onAcademiaKeydown(event: KeyboardEvent) {
    if (!this.academiaIsOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.onAcademiaInputFocus();
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.academiaFocusedIndex = Math.min(this.academiaFocusedIndex + 1, this.academiaFilteredOptions.length - 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.academiaFocusedIndex = Math.max(this.academiaFocusedIndex - 1, 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const opt = this.academiaFilteredOptions[this.academiaFocusedIndex];
      if (opt) this.selectAcademia(opt);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.academiaIsOpen = false;
      this.syncAcademiaSearchTextFromValue();
    }
  }

  // ==== UI handlers: Instructor autocomplete (inline) ====
  onInstructorInputChange() {
    if (this.instructorSearchText?.length > 50) this.instructorSearchText = this.instructorSearchText.slice(0, 50);
    this.instructorLimitMsg = this.instructorSearchText?.length >= 50 ? 'Máximo 50 caracteres.' : '';

    const search = this.instructorSearchText.toLowerCase().trim();
    const options = this.instructorOptions;
    this.instructorFilteredOptions = !search
      ? [...options]
      : options.filter(o => o.label.toLowerCase().includes(search));

    this.instructorIsOpen = true;
    this.instructorFocusedIndex = this.instructorFilteredOptions.length > 0 ? 0 : -1;
    this.positionInstructorOptions();
  }

  onInstructorInputFocus() {
    this.instructorFilteredOptions = [...this.instructorOptions];
    this.instructorIsOpen = true;
    this.instructorFocusedIndex = this.instructorFilteredOptions.length > 0 ? 0 : -1;
    this.positionInstructorOptions();
  }

  toggleInstructorDropdown() {
    if (this.instructorIsOpen) {
      this.instructorIsOpen = false;
      return;
    }
    this.instructorFilteredOptions = [...this.instructorOptions];
    this.instructorIsOpen = true;
    this.instructorFocusedIndex = this.instructorFilteredOptions.length > 0 ? 0 : -1;
    this.positionInstructorOptions();
  }

  selectInstructor(option: { value: string | null; label: string }) {
    this.instructorSearchText = option.label;
    this.onInstructorChange(option.value);
    this.instructorIsOpen = false;
  }

  onInstructorInputBlur() {
    const exactMatch = this.instructorOptions.some(o => o.label === this.instructorSearchText);
    if (this.instructorSearchText && !exactMatch) {
      this.syncInstructorSearchTextFromValue();
    }
  }

  onInstructorKeydown(event: KeyboardEvent) {
    if (!this.instructorIsOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.onInstructorInputFocus();
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.instructorFocusedIndex = Math.min(this.instructorFocusedIndex + 1, this.instructorFilteredOptions.length - 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.instructorFocusedIndex = Math.max(this.instructorFocusedIndex - 1, 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const opt = this.instructorFilteredOptions[this.instructorFocusedIndex];
      if (opt) this.selectInstructor(opt);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.instructorIsOpen = false;
      this.syncInstructorSearchTextFromValue();
    }
  }

  onAcademiaOtraInput() {
    if (this.academiaOtra?.length > 50) this.academiaOtra = this.academiaOtra.slice(0, 50);
    this.academiaOtraLimitMsg = this.academiaOtra?.length >= 50 ? 'Máximo 50 caracteres.' : '';
  }

  onInstructorOtroInput() {
    if (this.instructorOtro?.length > 50) this.instructorOtro = this.instructorOtro.slice(0, 50);
    this.instructorOtroLimitMsg = this.instructorOtro?.length >= 50 ? 'Máximo 50 caracteres.' : '';
  }

  @HostListener('document:click', ['$event.target'])
  onClickOutside(target: EventTarget | null) {
    if (!target) return;
    const node = target as Node;

    if (this.academiaIsOpen && this.academiaAutocomplete && !this.academiaAutocomplete.nativeElement.contains(node)) {
      this.academiaIsOpen = false;
      this.syncAcademiaSearchTextFromValue();
    }

    if (this.instructorIsOpen && this.instructorAutocomplete && !this.instructorAutocomplete.nativeElement.contains(node)) {
      this.instructorIsOpen = false;
      this.syncInstructorSearchTextFromValue();
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    if (this.academiaIsOpen) this.positionAcademiaOptions();
    if (this.instructorIsOpen) this.positionInstructorOptions();
  }

  @HostListener('window:scroll')
  onWindowScroll() {
    if (this.academiaIsOpen) this.positionAcademiaOptions();
    if (this.instructorIsOpen) this.positionInstructorOptions();
  }

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (file) {
      this.fotoFile = file;
      const reader = new FileReader();
      reader.onload = () => this.fotoPreview = String(reader.result || '');
      reader.readAsDataURL(file);
      // Subir foto automáticamente
      this.uploadPhoto();
    }
  }

  private lockScroll() { document.body.style.overflow = 'hidden'; }
  private unlockScroll() { document.body.style.overflow = ''; }

  uploadPhoto() {
    if (!this.fotoFile) return;
    this.saving = true;
    this.lockScroll();
    this.api.uploadProfilePhoto(this.fotoFile).subscribe({
      next: (res: any) => {
        this.success = true;
        this.message = 'Foto actualizada.';
        if (res?.url) {
          sessionStorage.setItem('fotoUrl', res.url);
          this.fotoUrl = res.url;
          this.fotoPreview = null;
        }
        this.saving = false;
        this.unlockScroll();
      },
      error: (err) => {
        this.success = false;
        this.message = err?.error?.message || 'No se pudo subir la foto.';
        this.saving = false;
        this.unlockScroll();
      }
    });
  }

  saveProfile() {
    this.message = null;
    this.saving = true;
    this.lockScroll();
    const cinturonValue = this.usuario.cinturon_rango === null ? null : this.usuario.cinturon_rango?.trim() || null;

    let academiaValue: any = null;
    if (this.usuario.academia === 'otra') {
      academiaValue = this.academiaOtra?.trim().slice(0, 50) || null;
    } else if (this.usuario.academia) {
      academiaValue = typeof this.usuario.academia === 'string' ? this.usuario.academia.trim() : String(this.usuario.academia);
    }

    let instructorValue: any = null;
    if (this.usuario.Instructor === 'otro') {
      instructorValue = this.instructorOtro?.trim().slice(0, 50) || null;
    } else if (this.usuario.Instructor) {
      instructorValue = typeof this.usuario.Instructor === 'string' ? this.usuario.Instructor.trim() : String(this.usuario.Instructor);
    }

    const emailValue = (this.usuario.correo || '').trim().slice(0, this.MAX_EMAIL_LEN);

    // Validación de correo real
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailValue || !emailRegex.test(emailValue)) {
      this.success = false;
      this.message = 'Por favor, ingresa un correo electrónico válido.';
      this.saving = false;
      this.unlockScroll();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const phoneDigits = (this.usuario.numero_celular || '').replace(/\D/g, '');
    const phoneFull = ((this.telefonoCodigo || '') + phoneDigits).slice(0, this.MAX_PHONE_LEN);

    const payload: any = {
      correo: emailValue,
      numeroCelular: phoneFull,
      ciudad: this.usuario.ciudad,
      cinturonRango: cinturonValue,
      codigo: academiaValue, // Used as academia ID
      modo: instructorValue  // Used as instructor ID
    };

    const startedAt = Date.now();
    this.api.updateProfile(payload).subscribe({
      next: async (u: any) => {
        // Persistir en sessionStorage
        if (payload.correo) sessionStorage.setItem('correo', payload.correo);
        if (payload.ciudad !== undefined) sessionStorage.setItem('ciudad', payload.ciudad || '');

        if (payload.numeroCelular !== undefined) {
          if (!payload.numeroCelular) {
            sessionStorage.removeItem('numero_celular');
            sessionStorage.removeItem('numeroCelular');
          } else {
            sessionStorage.setItem('numero_celular', payload.numeroCelular);
            sessionStorage.setItem('numeroCelular', payload.numeroCelular);
          }
        }

        if (payload.cinturonRango !== undefined) {
          if (payload.cinturonRango === null) {
            sessionStorage.removeItem('cinturon_rango');
            sessionStorage.removeItem('cinturonRango');
          } else {
            sessionStorage.setItem('cinturon_rango', payload.cinturonRango);
            sessionStorage.setItem('cinturonRango', payload.cinturonRango);
          }
        }

        // 'codigo' is the academia ID here
        if (payload.codigo !== undefined) {
          if (!payload.codigo) sessionStorage.removeItem('academia');
          else sessionStorage.setItem('academia', payload.codigo);
        }

        // 'modo' is the instructor ID here
        if (payload.modo !== undefined) {
          if (!payload.modo) {
            sessionStorage.removeItem('Instructor');
            sessionStorage.removeItem('instructor');
          } else {
            sessionStorage.setItem('Instructor', payload.modo);
            sessionStorage.setItem('instructor', payload.modo);
          }
        }
        this.success = true;
        this.message = 'Perfil actualizado.';

        await delayRemaining(startedAt);
        this.saving = false;
        this.unlockScroll();
      },
      error: async (err) => {
        this.success = false;
        this.message = err?.error?.message || 'No se pudo actualizar el perfil.';

        await delayRemaining(startedAt);
        this.saving = false;
        this.unlockScroll();
      }
    });
  }

  goChangePassword() {
    this.router.navigate(['/account/password']);
  }

  ngOnDestroy(): void {
    this.unlockScroll();
  }
}
