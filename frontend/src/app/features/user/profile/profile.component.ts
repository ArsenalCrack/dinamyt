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
  };

  ciudadesList: string[] = [];
  ciudadMaxLength = 50;

  telefonoCodigo = '';
  opcionesCodigoPais: Array<{ value: string | null; label: string }> = [];

  // Opciones para dropdowns
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

  correoLimitMsg = '';

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
  }

  private initLocationData() {
    this.paisesList = this.locationService.getAllCountries().map(c => c.name).sort();

    // Initialize phone codes from service
    const countries = this.locationService.getAllCountries();
    const codes = new Set<string>();
    countries.forEach(c => {
      if (c.phonecode) codes.add(c.phonecode.startsWith('+') ? c.phonecode : `+${c.phonecode}`);
    });

    // Convertir a lista única ordenada
    const sortedCodes = Array.from(codes).sort((a, b) => {
      // Parsear números para ordenar numéricamente (+1, +7, +57)
      return parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, ''));
    });

    this.opcionesCodigoPais = [
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
      // Buscar código coincidente de las opciones
      const codes = this.opcionesCodigoPais
        .map(o => o.value)
        .filter(v => v !== null) as string[];

      // Ordenar por longitud desc para coincidir primero con el código más largo (+1 vs +123)
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

      // Auto-actualizar código telefónico si está vacío
      if (!this.telefonoCodigo && country.phonecode) {
        this.telefonoCodigo = country.phonecode.startsWith('+') ? country.phonecode : `+${country.phonecode}`;
      }
    } else {
      this.ciudadesList = [];
    }

    // Limpiar ciudad si no está en la lista (más seguro)
    if (this.usuario.ciudad && !this.ciudadesList.includes(this.usuario.ciudad)) {
      // Solo limpiar si la lista no está vacía (si está vacía por error de carga, no borrar datos)
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

  // Note: Removed Academy/Instructor loading/handling methods

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (file) {
      this.fotoFile = file;
      const reader = new FileReader();
      reader.onload = () => this.fotoPreview = String(reader.result || '');
      reader.readAsDataURL(file);
      // Subir foto automáticamente
      this.subirFoto();
    }
  }

  private lockScroll() { document.body.style.overflow = 'hidden'; }
  private unlockScroll() { document.body.style.overflow = ''; }

  subirFoto() {
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



  guardarPerfil() {
    this.message = null;
    this.saving = true;
    this.lockScroll();
    const cinturonValue = this.usuario.cinturon_rango === null ? null : this.usuario.cinturon_rango?.trim() || null;

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
      numeroCelular: phoneFull, // Número completo con código de país
      numero_celular: phoneDigits, // Mantener compatibilidad si es necesario
      codigo_pais: this.telefonoCodigo,
      ciudad: this.usuario.ciudad,
      nacionalidad: this.usuario.nacionalidad, // Siempre enviar nacionalidad
      cinturonRango: cinturonValue,
    };

    payload.numeroCelular = phoneFull;


    const startedAt = Date.now();
    // Llamar a updateProfile del servicio API
    this.api.updateProfile(payload).subscribe({
      next: async (u: any) => {
        // Persistir en sessionStorage
        if (payload.correo) sessionStorage.setItem('correo', payload.correo);
        if (payload.ciudad !== undefined) sessionStorage.setItem('ciudad', payload.ciudad || '');
        sessionStorage.setItem('nacionalidad', payload.nacionalidad || '');

        if (payload.numeroCelular !== undefined) {
          sessionStorage.setItem('numero_celular', phoneDigits); // Guardar solo dígitos en sesión para inputs
          sessionStorage.setItem('numeroCelular', phoneDigits);
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

  irACambiarContrasena() {
    this.router.navigate(['/account/password']);
  }

  volverAtras(): void {
    this.location.back();
  }

  ngOnDestroy(): void {
    this.unlockScroll();
  }
}
