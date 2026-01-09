import { Component, OnInit, AfterViewInit, OnDestroy, inject, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { Location } from '@angular/common';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { CountryAutocompleteComponent } from '../../../shared/components/country-autocomplete/country-autocomplete.component';
import { PAISES } from '../../../core/models/paises';

@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CustomSelectComponent, CountryAutocompleteComponent],
  templateUrl: './registro.component.html',
  styleUrls: ['./registro.component.scss']
})
export class RegistroComponent implements OnInit, OnDestroy {

  private api = inject(ApiService);
  private router = inject(Router);
  private location = inject(Location);
  private cdr = inject(ChangeDetectorRef);


  // VARIABLES PARA VISIBILIDAD DE CONTRASEÑA
  mostrarPass: boolean = false;
  mostrarConfirmPass: boolean = false;

  Mensajes: string = '';
  exito: boolean = false;
  cargando: boolean = false;
  loadingText: string = 'Procesando... por favor espera';

  // Datos del modelo
  idDocumento!: string;
  nombres!: string;
  apellidos!: string;
  nombreC!: string;
  sexo: string = '';
  nacionalidad: string = '';
  cinturon_rango: string = '';
  fechaNacimiento!: string;
  correo!: string;
  contrasena!: string;
  confirmPassword!: string;
  academia: string = '';
  academiaOtra: string = '';
  instructor: string = '';
  instructorOtro: string = '';
  telefonoOpcional: string = '';

  // Opciones para dropdowns
  cinturones: Array<{ value: string; label: string }> = [
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

  // Lista de países para el autocompletado
  paisesList: string[] = PAISES;
  // Component-bound selects for custom date picker
  diasOptions: Array<{ value: string; label: string }> = [];
  mesesOptions: Array<{ value: string; label: string }> = [];
  aniosOptions: Array<{ value: string; label: string }> = [];
  diaSeleccionado: string = '';
  mesSeleccionado: string = '';
  anioSeleccionado: string = '';

  // Variable para validar la edad (Mínimo 4 años)
  fechaMaximaPermitida!: string;
  // Fecha mínima permitida (evitar fechas 'falsas')
  fechaMinimaPermitida!: string;
  fechaErrorMsg: string = '';
  showExpiredBanner = false;
  @ViewChild('bannerResendBtn') bannerResendBtn?: ElementRef<HTMLButtonElement>;

  volverAtras() {
    this.location.back();
  }

  closeMensaje() {
    this.Mensajes = '';
  }


  ngOnInit() {
    this.calcularFechaMaxima();
    this.calcularFechaMinima();
    this.generarOpcionesFecha();
    const flag = sessionStorage.getItem('verifyExpiredRedirect');
    if (flag === 'register') {
      this.showExpiredBanner = true;
      this.correo = this.correo || (sessionStorage.getItem('emailParaVerificar') || '');
      sessionStorage.removeItem('verifyExpiredRedirect');
    }
  }

  generarOpcionesFecha() {
    // meses
    this.mesesOptions = [
      { value: '01', label: 'Enero' }, { value: '02', label: 'Febrero' }, { value: '03', label: 'Marzo' },
      { value: '04', label: 'Abril' }, { value: '05', label: 'Mayo' }, { value: '06', label: 'Junio' },
      { value: '07', label: 'Julio' }, { value: '08', label: 'Agosto' }, { value: '09', label: 'Septiembre' },
      { value: '10', label: 'Octubre' }, { value: '11', label: 'Noviembre' }, { value: '12', label: 'Diciembre' }
    ];

    // días 1..31
    this.diasOptions = Array.from({ length: 31 }, (_, i) => {
      const val = String(i + 1).padStart(2, '0');
      return { value: val, label: String(i + 1) };
    });

    // años: limitar rango a 100 años hacia atrás desde el máximo permitido
    const maxYear = parseInt(this.fechaMaximaPermitida.split('-')[0] || String(new Date().getFullYear() - 4), 10);
    const minYear = Math.max(parseInt(this.fechaMinimaPermitida.split('-')[0] || '1900', 10), maxYear - 100);
    const years: Array<{ value: string; label: string }> = [];
    for (let y = maxYear; y >= minYear; y--) {
      years.push({ value: String(y), label: String(y) });
    }
    this.aniosOptions = years;

    // Si ya había fechaNacimiento, sincronizar selects
    if (this.fechaNacimiento) {
      const parts = this.fechaNacimiento.split('-');
      if (parts.length === 3) {
        this.anioSeleccionado = parts[0];
        this.mesSeleccionado = parts[1];
        this.diaSeleccionado = parts[2];
      }
    }
  }

  // Recalcula días según mes/año seleccionados y ajusta selección si queda fuera de rango
  updateDias() {
    // Si no hay mes seleccionado, mostrar 31 días por defecto
    if (!this.mesSeleccionado) {
      this.diasOptions = Array.from({ length: 31 }, (_, i) => {
        const val = String(i + 1).padStart(2, '0');
        return { value: val, label: String(i + 1) };
      });
      return;
    }

    // Usar año seleccionado o año actual para calcular días del mes
    // Esto es importante para febrero en años bisiestos
    const year = this.anioSeleccionado ? Number(this.anioSeleccionado) : new Date().getFullYear();
    const month = Number(this.mesSeleccionado);

    // Esta función calcula automáticamente los días según el año (incluye años bisiestos)
    const daysInMonth = new Date(year, month, 0).getDate();

    // Actualizar opciones
    this.diasOptions = Array.from({ length: daysInMonth }, (_, i) => {
      const val = String(i + 1).padStart(2, '0');
      return { value: val, label: String(i + 1) };
    });

    // Si el día seleccionado excede el máximo, limpiarlo DESPUÉS de actualizar opciones
    if (this.diaSeleccionado && Number(this.diaSeleccionado) > daysInMonth) {
      const esBisiesto = month === 2 && daysInMonth === 29;
      this.diaSeleccionado = '';
      this.fechaNacimiento = '';
      if (month === 2 && esBisiesto) {
        this.fechaErrorMsg = `El año ${year} es bisiesto, febrero tiene 29 días. Debes seleccionar un día entre 1 y 29.`;
      } else {
        this.fechaErrorMsg = `El mes seleccionado solo tiene ${daysInMonth} días. Debes seleccionar un día entre 1 y ${daysInMonth}.`;
      }
      // Forzar detección de cambios
      this.cdr.detectChanges();
    } else if (this.fechaErrorMsg.includes('mes seleccionado solo tiene')) {
      // Limpiar mensaje de error si ahora el día es válido
      this.fechaErrorMsg = '';
    }
  }

  onDiaChange(value: string) {
    this.diaSeleccionado = value;
    this.validateDiaForCurrentMonth();
    this.updateFechaFromSelects();
  }

  onMesChange(value: string) {
    this.mesSeleccionado = value;
    this.updateDias();
    if (this.diaSeleccionado && this.mesSeleccionado && this.anioSeleccionado) {
      this.updateFechaFromSelects();
    }
  }

  onAnioChange(value: string) {
    this.anioSeleccionado = value;
    this.updateDias();
    if (this.diaSeleccionado && this.mesSeleccionado && this.anioSeleccionado) {
      this.updateFechaFromSelects();
    }
  }

  // Valida si el día seleccionado es válido para el mes/año actual
  validateDiaForCurrentMonth() {
    if (!this.diaSeleccionado || !this.mesSeleccionado) return;

    const year = this.anioSeleccionado ? Number(this.anioSeleccionado) : new Date().getFullYear();
    const month = Number(this.mesSeleccionado);
    const day = Number(this.diaSeleccionado);
    const daysInMonth = new Date(year, month, 0).getDate();

    if (day > daysInMonth) {
      this.diaSeleccionado = '';
      this.fechaNacimiento = '';
      this.fechaErrorMsg = `El mes seleccionado solo tiene ${daysInMonth} días. Por favor, selecciona un día válido.`;
    }
  }

  updateFechaFromSelects() {
    if (!this.diaSeleccionado || !this.mesSeleccionado || !this.anioSeleccionado) {
      this.fechaNacimiento = '';
      // No mostrar error si simplemente no han completado los campos aún
      return;
    }

    // Validar que el día sea válido para el mes/año antes de construir la fecha
    const year = Number(this.anioSeleccionado);
    const month = Number(this.mesSeleccionado);
    const day = Number(this.diaSeleccionado);
    const daysInMonth = new Date(year, month, 0).getDate();

    if (day > daysInMonth) {
      this.fechaNacimiento = '';
      // No mostrar error aquí, updateDias ya lo maneja
      return;
    }

    // Construir fecha usando constructor con parámetros para evitar problemas de zona horaria
    const d = new Date(year, month - 1, day);

    // Validar que la fecha construida sea correcta (JavaScript ajusta fechas inválidas)
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
      this.fechaNacimiento = '';
      this.fechaErrorMsg = 'Fecha no válida para el día/mes seleccionados.';
      return;
    }

    // Si todo es válido, asignar la fecha en formato YYYY-MM-DD y limpiar errores
    const candidate = `${this.anioSeleccionado}-${this.mesSeleccionado}-${this.diaSeleccionado}`;
    this.fechaNacimiento = candidate;
    this.fechaErrorMsg = '';
    // Ejecutar validación de rango de edad
    this.validateFecha(true);
  }

  // Calcula la fecha mínima (p.ej. 1900-01-01) para evitar fechas claramente falsas
  calcularFechaMinima() {
    this.fechaMinimaPermitida = '1900-01-01';
  }

  // Validación de la fecha al cambiar o perder foco
  // Si `force` es false, validamos sólo cuando el valor tiene longitud completa (YYYY-MM-DD)
  validateFecha(force: boolean = false) {
    this.fechaErrorMsg = '';
    if (!this.fechaNacimiento) return;

    // Evitar mostrar errores mientras el usuario está escribiendo el valor incompleto
    if (!force && this.fechaNacimiento.toString().length < 10) {
      // no tocar el modal; solo limpiar mensajes previos relacionados
      if (this.Mensajes && this.Mensajes.toLowerCase().includes('fecha')) this.Mensajes = '';
      return;
    }

    const fecha = new Date(this.fechaNacimiento);
    if (isNaN(fecha.getTime())) {
      this.fechaErrorMsg = 'Formato de fecha inválido.';
      return;
    }

    const min = new Date(this.fechaMinimaPermitida);
    const max = new Date(this.fechaMaximaPermitida);
    const actualYear = new Date().getFullYear();

    if (fecha.getFullYear() > actualYear) {
      this.fechaErrorMsg = 'El año ingresado no es correcto.';
      return;
    }

    if (fecha < min) {
      this.fechaErrorMsg = 'La fecha es demasiado antigua. Ingresa una fecha válida.';
      return;
    }

    if (fecha > max) {
      this.fechaErrorMsg = 'La fecha excede el límite permitido. Debes tener al menos 4 años.';
      return;
    }

    // Si pasa validaciones, limpiar mensajes previos
    this.fechaErrorMsg = '';
  }

  // Calcula la fecha de hoy hace 4 años
  calcularFechaMaxima() {
    const hoy = new Date();
    const haceCuatroAnios = new Date(hoy.getFullYear() - 4, hoy.getMonth(), hoy.getDate());
    // Formato YYYY-MM-DD para el input HTML
    this.fechaMaximaPermitida = haceCuatroAnios.toISOString().split('T')[0];
  }

  registrar() {
    console.log('Valores de fecha:', {
      dia: this.diaSeleccionado,
      mes: this.mesSeleccionado,
      anio: this.anioSeleccionado
    });

    // VALIDACIÓN 1: Verificar que todos los campos de fecha estén completos
    if (!this.diaSeleccionado || !this.mesSeleccionado || !this.anioSeleccionado) {
      const faltantes = [];
      if (!this.diaSeleccionado) faltantes.push('día');
      if (!this.mesSeleccionado) faltantes.push('mes');
      if (!this.anioSeleccionado) faltantes.push('año');

      if (faltantes.length === 3) {
        this.Mensajes = "No has ingresado tu fecha de nacimiento. Por favor selecciona día, mes y año.";
      } else {
        this.Mensajes = `Fecha de nacimiento incompleta. Falta seleccionar: ${faltantes.join(', ')}.`;
      }
      this.exito = false;
      return;
    }

    // VALIDACIÓN 2: Verificar que el día sea válido para el mes seleccionado
    const year = Number(this.anioSeleccionado);
    const month = Number(this.mesSeleccionado);
    const day = Number(this.diaSeleccionado);
    const daysInMonth = new Date(year, month, 0).getDate();

    if (day > daysInMonth) {
      const mesesNombres = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                            'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      this.Mensajes = `Fecha incorrecta: el día ${day} no existe en ${mesesNombres[month]}. ` +
                      `Este mes solo tiene ${daysInMonth} días. Por favor cambia el día a un valor entre 1 y ${daysInMonth}.`;
      this.exito = false;
      return;
    }

    // VALIDACIÓN 3: Verificar que la fecha construida sea válida
    const fechaTest = new Date(year, month - 1, day);
    if (fechaTest.getFullYear() !== year ||
        fechaTest.getMonth() !== month - 1 ||
        fechaTest.getDate() !== day) {
      this.Mensajes = `La fecha ${day}/${month}/${year} no es válida. Por favor verifica los datos ingresados.`;
      this.exito = false;
      return;
    }

    // Combinar nombres y apellidos en nombreC
    this.nombreC = `${this.nombres?.trim()} ${this.apellidos?.trim()}`.trim();

    // VALIDACIÓN: Verificar que cinturon_rango esté seleccionado
    if (!this.cinturon_rango || this.cinturon_rango === '') {
      this.Mensajes = "Debes seleccionar un cinturón.";
      this.exito = false;
      return;
    }

    const usuario = {
      idDocumento: Number(this.idDocumento),
      nombreC: this.nombreC,
      sexo: this.sexo,
      nacionalidad: this.nacionalidad,
      academia: this.academia === 'otra' ? this.academiaOtra?.trim() : this.academia?.trim() || undefined,
      instructor: this.instructor === 'otro' ? this.instructorOtro?.trim() : this.instructor?.trim() || undefined,
      telefonoOpcional: this.telefonoOpcional?.trim() || undefined,
      // Enviamos con ambos nombres para compatibilidad con la BD
      cinturon_rango: this.cinturon_rango,
      cinturon: this.cinturon_rango,
      fechaNacimiento: this.fechaNacimiento,
      correo: this.correo,
      contrasena: this.contrasena
    };

    // Mostrar overlay bloqueante desde que se envía la petición
    this.cargando = true;
    this.loadingText = 'Procesando... por favor espera';
    this.lockScroll();
    this.Mensajes = '';

    console.log('Enviando usuario:', usuario);

    this.api.registrarUsuario(usuario).subscribe({
      next: (res) => {
        this.exito = true;
        this.loadingText = 'Verificando código...';
        this.Mensajes = '';
        sessionStorage.setItem('verifyMode', 'register');
        sessionStorage.setItem('emailParaVerificar', this.correo);
        const expires = Date.now() + 5 * 60 * 1000;
        sessionStorage.setItem('verifyExpiresAt', String(expires));

        setTimeout(() => {
          this.unlockScroll();
          this.router.navigate(['/verify']);
        }, 2000);
      },
      error: (err) => {
        this.cargando = false;
        this.unlockScroll();
        this.exito = false;
        this.Mensajes = err.error?.message || 'Error al registrar.';
      }
    });
  }

  // Permitir solo dígitos en el campo documento
  onlyDigits(event: Event) {
    const input = event.target as HTMLInputElement;
    input.value = input.value.replace(/\D/g, '');
    this.idDocumento = input.value;
  }

  ngAfterViewInit(): void {
    if (this.showExpiredBanner && this.bannerResendBtn) {
      setTimeout(() => this.bannerResendBtn?.nativeElement.focus(), 120);
    }
  }

  // Reenviar código desde banner (para usuarios que vuelven tras expiración)
  reenviarDesdeBanner() {
    if (!this.correo) {
      alert('No hay un correo registrado');
      return;
    }
    this.cargando = true;
    this.lockScroll();
    this.api.reenviarCodigo(this.correo).subscribe({
      next: () => {
        this.cargando = false;
        this.unlockScroll();
        this.showExpiredBanner = false;
        const expires = Date.now() + 5 * 60 * 1000;
        sessionStorage.setItem('verifyExpiresAt', String(expires));
        this.router.navigate(['/verify']);
      },
      error: () => {
        this.cargando = false;
        this.unlockScroll();
        alert('No se pudo reenviar el código');
      }
    });
  }

  private lockScroll() { document.body.style.overflow = 'hidden'; }
  private unlockScroll() { document.body.style.overflow = ''; }

  ngOnDestroy(): void {
    this.unlockScroll();
  }
}
