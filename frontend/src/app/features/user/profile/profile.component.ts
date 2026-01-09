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
    cinturon_rango: sessionStorage.getItem('cinturon_rango') || '',
    nacionalidad: sessionStorage.getItem('nacionalidad') || '',
    numero_celular: sessionStorage.getItem('numero_celular') || '',
    academia: sessionStorage.getItem('academia') || '',
    Instructor: sessionStorage.getItem('Instructor') || ''
  };

  // Opciones para dropdowns
  academias: Array<{ value: string; label: string }> = [];
  instructores: Array<{ value: string; label: string }> = [];
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
    // TODO: Implementar cuando se agregue el endpoint en el backend
    // Por ahora, academias está vacío. Se llenará desde la API
    this.academias = [];
    // Ejemplo cuando esté lista la API:
    // this.api.getAcademias().subscribe({
    //   next: (data: any[]) => {
    //     this.academias = data.map(a => ({ value: a.nombre, label: a.nombre }));
    //   }
    // });
  }

  cargarInstructores() {
    // TODO: Implementar cuando se agregue el endpoint en el backend
    // Por ahora, instructores está vacío. Se llenará desde la API
    this.instructores = [];
    // Ejemplo cuando esté lista la API:
    // this.api.getInstructores().subscribe({
    //   next: (data: any[]) => {
    //     this.instructores = data.map(i => ({ value: i.nombre, label: i.nombre }));
    //   }
    // });
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
    const payload: any = {
      correo: this.user.correo?.trim(),
      numero_celular: this.user.numero_celular?.trim(),
      cinturon_rango: this.user.cinturon_rango?.trim(),
      academia: this.user.academia === 'otra' ? this.academiaOtra?.trim() : this.user.academia?.trim(),
      Instructor: this.user.Instructor === 'otro' ? this.instructorOtro?.trim() : this.user.Instructor?.trim()
    };
    this.api.updateProfile(payload).subscribe({
      next: (u: any) => {
        // Persistir en sessionStorage si el backend devuelve los valores actualizados
        if (payload.correo) sessionStorage.setItem('correo', payload.correo);
        if (payload.numero_celular) sessionStorage.setItem('numero_celular', payload.numero_celular);
        if (payload.cinturon_rango) sessionStorage.setItem('cinturon_rango', payload.cinturon_rango);
        if (payload.academia) sessionStorage.setItem('academia', payload.academia);
        if (payload.Instructor) sessionStorage.setItem('Instructor', payload.Instructor);
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
