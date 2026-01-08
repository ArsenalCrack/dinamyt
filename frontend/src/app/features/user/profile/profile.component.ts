import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { Location } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent {
  user = {
    nombreC: sessionStorage.getItem('username') || '',
    correo: sessionStorage.getItem('correo') || '',
    idDocumento: sessionStorage.getItem('idDocumento') || '',
    sexo: sessionStorage.getItem('sexo') || '',
    fechaNacimiento: sessionStorage.getItem('fechaNacimiento') || '',
    cinturonRango: sessionStorage.getItem('cinturonRango') || '',
    nacionalidad: sessionStorage.getItem('nacionalidad') || '',
    numeroCelular: sessionStorage.getItem('numeroCelular') || '',
    academia: sessionStorage.getItem('academia') || '',
    instructor: sessionStorage.getItem('instructor') || ''
  };

  fotoPreview: string | null = null;
  fotoFile: File | null = null;
  fotoUrl: string | null = sessionStorage.getItem('fotoUrl');
  saving = false;
  message: string | null = null;
  success = false;

  constructor(private api: ApiService, private router: Router, private location: Location) {}

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

  uploadPhoto() {
    if (!this.fotoFile) return;
    this.saving = true;
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
      },
      error: (err) => {
        this.success = false;
        this.message = err?.error?.message || 'No se pudo subir la foto.';
        this.saving = false;
      }
    });
  }

  saveProfile() {
    this.message = null;
    this.saving = true;
    const payload: any = {
      correo: this.user.correo?.trim(),
      numeroCelular: this.user.numeroCelular?.trim(),
      cinturonRango: this.user.cinturonRango?.trim(),
      academia: this.user.academia?.trim(),
      instructor: this.user.instructor?.trim()
    };
    this.api.updateProfile(payload).subscribe({
      next: (u: any) => {
        // Persistir en sessionStorage si el backend devuelve los valores actualizados
        if (payload.correo) sessionStorage.setItem('correo', payload.correo);
        if (payload.numeroCelular) sessionStorage.setItem('numeroCelular', payload.numeroCelular);
        if (payload.cinturonRango) sessionStorage.setItem('cinturonRango', payload.cinturonRango);
        if (payload.academia) sessionStorage.setItem('academia', payload.academia);
        if (payload.instructor) sessionStorage.setItem('instructor', payload.instructor);
        this.success = true;
        this.message = 'Perfil actualizado.';
        this.saving = false;
      },
      error: (err) => {
        this.success = false;
        this.message = err?.error?.message || 'No se pudo actualizar el perfil.';
        this.saving = false;
      }
    });
  }

  goChangePassword() {
    this.router.navigate(['/account/password']);
  }
}
