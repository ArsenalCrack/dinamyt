import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { Location } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CustomSelectComponent],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnDestroy {
  user = {
    nombreC: sessionStorage.getItem('nombreC') || '',
    correo: sessionStorage.getItem('correo') || '',
    idDocumento: sessionStorage.getItem('idDocumento') || '',
    sexo: sessionStorage.getItem('sexo') || '',
    fechaNacimiento: sessionStorage.getItem('fechaNacimiento') || '',
    cinturon_rango: sessionStorage.getItem('cinturon_rango') ?? sessionStorage.getItem('cinturonRango') ?? null,
    nacionalidad: sessionStorage.getItem('nacionalidad') || '',
    numero_celular: (sessionStorage.getItem('numero_celular') ?? sessionStorage.getItem('numeroCelular')) || '',
    academia: sessionStorage.getItem('academia') || '',
    Instructor: (sessionStorage.getItem('Instructor') ?? sessionStorage.getItem('instructor')) || ''
  };

  // Opciones para dropdowns
  academias: Array<{ value: string | null; label: string }> = [];
  instructores: Array<{ value: string | null; label: string }> = [];
  cinturones: Array<{ value: string | null; label: string }> = [
    { value: null, label: 'Sin cinturón' },
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

  academiaOtra: string = '';
  instructorOtro: string = '';

  fotoPreview: string | null = null;
  fotoFile: File | null = null;
  fotoUrl: string | null = sessionStorage.getItem('fotoUrl');
  saving = false;
  message: string | null = null;
  success = false;

  constructor(private api: ApiService, private router: Router, private location: Location) {
    this.cargarAcademias();
    this.cargarInstructores();
  }

  cargarAcademias() {
    this.api.cargaracademias().subscribe({
      next: (u: any[]) => {
        this.academias = u.map(a => ({value: a.id?.toString() ?? null,label: a.nombre}));
      },
      error: (err) => {
        console.log(err);
      }
    })


  }

  cargarInstructores() {

    this.instructores = [];

  }

  // Opciones con valores nulos para UX consistente
  get academiaOptions(): Array<{ value: string | null; label: string }> {
    return [{ value: null, label: 'Sin academia' }, ...this.academias, { value: 'otra', label: 'Otra' }];
  }

  get instructorOptions(): Array<{ value: string | null; label: string }> {
    return [{ value: null, label: 'Independiente' }, ...this.instructores, { value: 'otro', label: 'Otro' }];
  }

  goBack(): void {
    this.location.back();
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
    const cinturonValue = this.user.cinturon_rango === null ? null : this.user.cinturon_rango?.trim() || null;
    const academiaValue = this.user.academia === 'otra'
      ? (this.academiaOtra?.trim() || null)
      : (this.user.academia?.trim() || null);
    const instructorValue = this.user.Instructor === 'otro'
      ? (this.instructorOtro?.trim() || null)
      : (this.user.Instructor?.trim() || null);

    const payload: any = {
      correo: this.user.correo?.trim(),
      numero_celular: this.user.numero_celular?.trim(),
      cinturon_rango: cinturonValue,
      academia: academiaValue,
      Instructor: instructorValue
    };
    this.api.updateProfile(payload).subscribe({
      next: (u: any) => {
        // Persistir en sessionStorage si el backend devuelve los valores actualizados
        if (payload.correo) sessionStorage.setItem('correo', payload.correo);
        if (payload.numero_celular !== undefined) {
          if (!payload.numero_celular) {
            sessionStorage.removeItem('numero_celular');
            sessionStorage.removeItem('numeroCelular');
          } else {
            sessionStorage.setItem('numero_celular', payload.numero_celular);
            sessionStorage.setItem('numeroCelular', payload.numero_celular);
          }
        }
        if (payload.cinturon_rango !== undefined) {
          if (payload.cinturon_rango === null) {
            sessionStorage.removeItem('cinturon_rango');
            sessionStorage.removeItem('cinturonRango');
          } else {
            sessionStorage.setItem('cinturon_rango', payload.cinturon_rango);
            sessionStorage.setItem('cinturonRango', payload.cinturon_rango);
          }
        }
        if (payload.academia !== undefined) {
          if (!payload.academia) sessionStorage.removeItem('academia');
          else sessionStorage.setItem('academia', payload.academia);
        }
        if (payload.Instructor !== undefined) {
          if (!payload.Instructor) {
            sessionStorage.removeItem('Instructor');
            sessionStorage.removeItem('instructor');
          } else {
            sessionStorage.setItem('Instructor', payload.Instructor);
            sessionStorage.setItem('instructor', payload.Instructor);
          }
        }
        this.success = true;
        this.message = 'Perfil actualizado.';
        this.saving = false;
        this.unlockScroll();
      },
      error: (err) => {
        this.success = false;
        this.message = err?.error?.message || 'No se pudo actualizar el perfil.';
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
