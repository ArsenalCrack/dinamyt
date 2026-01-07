import { Component, OnInit, AfterViewInit, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { Location } from '@angular/common';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';

@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CustomSelectComponent],
  templateUrl: './registro.component.html',
  styleUrls: ['./registro.component.scss']
})
export class RegistroComponent implements OnInit {

  private api = inject(ApiService);
  private router = inject(Router);
  private location = inject(Location);


  // VARIABLES PARA VISIBILIDAD DE CONTRASEÑA
  mostrarPass: boolean = false;
  mostrarConfirmPass: boolean = false;

  Mensajes: string = '';
  exito: boolean = false;
  cargando: boolean = false;

  // Datos del modelo
  idDocumento!: string;
  nombreC!: string;
  sexo: string = '';
  nacionalidad: string = '';
  fechaNacimiento!: string;
  // Component-bound selects for custom date picker
  diasOptions: Array<{ value: string; label: string }> = [];
  mesesOptions: Array<{ value: string; label: string }> = [];
  aniosOptions: Array<{ value: string; label: string }> = [];
  diaSeleccionado: string = '';
  mesSeleccionado: string = '';
  anioSeleccionado: string = '';
  correo!: string;
  contrasena!: string;
  confirmPassword!: string;

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
    if (!this.mesSeleccionado || !this.anioSeleccionado) return;
    const year = Number(this.anioSeleccionado);
    const month = Number(this.mesSeleccionado);
    const daysInMonth = new Date(year, month, 0).getDate();
    this.diasOptions = Array.from({ length: daysInMonth }, (_, i) => {
      const val = String(i + 1).padStart(2, '0');
      return { value: val, label: String(i + 1) };
    });
    // if selected day exceeds new max, clear it
    if (this.diaSeleccionado && Number(this.diaSeleccionado) > daysInMonth) {
      this.diaSeleccionado = '';
      this.fechaErrorMsg = 'El día no existe para el mes/año seleccionados.';
    }
  }

  onMesChange(value: string) {
    this.mesSeleccionado = value;
    this.updateDias();
    this.updateFechaFromSelects();
  }

  onAnioChange(value: string) {
    this.anioSeleccionado = value;
    this.updateDias();
    this.updateFechaFromSelects();
  }

  updateFechaFromSelects() {
    if (!this.diaSeleccionado || !this.mesSeleccionado || !this.anioSeleccionado) {
      this.fechaNacimiento = '';
      this.fechaErrorMsg = '';
      return;
    }
    const candidate = `${this.anioSeleccionado}-${this.mesSeleccionado}-${this.diaSeleccionado}`;
    // Check for valid date (e.g., 31 feb)
    const d = new Date(candidate);
    if (isNaN(d.getTime()) || (d.getFullYear() !== Number(this.anioSeleccionado) || (d.getMonth() + 1) !== Number(this.mesSeleccionado) || d.getDate() !== Number(this.diaSeleccionado))) {
      this.fechaNacimiento = candidate; // keep selection string
      this.fechaErrorMsg = 'Fecha no válida para el día/mes seleccionados.';
      return;
    }
    this.fechaNacimiento = candidate;
    // ejecutar validación completa (forzada)
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
    // validar fecha antes de enviar
    this.validateFecha(true);
    if (this.fechaErrorMsg) {
      // dejar el modal de mensaje visible (ya se setea en validateFecha)
      return;
    }
    if (this.contrasena !== this.confirmPassword) {
      this.Mensajes = "Las contraseñas no coinciden";
      return;
    }

    const usuario = {
      idDocumento: Number(this.idDocumento),
      nombreC: this.nombreC?.trim(), // Limpiamos espacios extra
      sexo: this.sexo,
      nacionalidad: this.nacionalidad,
      fechaNacimiento: this.fechaNacimiento,
      correo: this.correo,
      contrasena: this.contrasena
    };

    // Mostrar overlay bloqueante desde que se envía la petición
    this.cargando = true;
    this.Mensajes = '';

    console.log('Enviando usuario:', usuario);

    this.api.registrarUsuario(usuario).subscribe({
      next: (res) => {
        // Éxito: mantenemos overlay visible hasta 2s para dar feedback
        this.exito = true;
        this.Mensajes = "¡Formulario exitoso!";
        sessionStorage.setItem('verifyMode', 'register');
        sessionStorage.setItem('emailParaVerificar', this.correo);
        // Guardar expiración del código: 5 minutos desde ahora
        const expires = Date.now() + 5 * 60 * 1000;
        sessionStorage.setItem('verifyExpiresAt', String(expires));

        setTimeout(() => {
          this.cargando = false;
          this.router.navigate(['/verify']);
        }, 2000);
      },
      error: (err) => {
        // Error: quitar overlay y mostrar mensaje
        this.cargando = false;
        this.exito = false;
        this.Mensajes = err.error?.message || 'Error al registrar.';
      }
    });
  }

  // Permitir solo dígitos en el campo documento
  onlyDigits(event: Event) {
    const el = event.target as HTMLInputElement;
    const clean = (el.value || '').replace(/\D+/g, '');
    el.value = clean;
    this.idDocumento = clean;
  }

  ngAfterViewInit(): void {
    if (this.showExpiredBanner && this.bannerResendBtn) {
      setTimeout(() => this.bannerResendBtn?.nativeElement.focus(), 120);
    }
  }

  // Reenviar código desde banner (para usuarios que vuelven tras expiración)
  reenviarDesdeBanner() {
    if (!this.correo) return;
    this.cargando = true;
    this.api.reenviarCodigo(this.correo).subscribe({
      next: () => {
        this.cargando = false;
        this.exito = true;
        this.Mensajes = 'Se envió un nuevo código. Revisa tu correo.';
        const expires = Date.now() + 5 * 60 * 1000;
        sessionStorage.setItem('verifyExpiresAt', String(expires));
        this.showExpiredBanner = false;
      },
      error: (err) => {
        this.cargando = false;
        this.exito = false;
        this.Mensajes = err.error?.message || 'No se pudo reenviar el código.';
      }
    });
  }
}
