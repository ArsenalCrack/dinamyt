import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { delayRemaining } from '../../../core/utils/spinner-timing.util';

interface AcademyData {
    nombre: string;
    direccion: string;
    telefono: string;
    url: string;
    descripcion: string;
}

@Component({
    selector: 'app-my-academy',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './my-academy.component.html',
    styleUrls: ['./my-academy.component.scss']
})
export class MyAcademyComponent implements OnInit {
    saving = false;
    message: string | null = null;
    success = false;

    logoUrl: string | null = null;
    logoPreview: string | ArrayBuffer | null = null;

    academy: AcademyData = {
        nombre: '',
        direccion: '',
        telefono: '',
        url: '',
        descripcion: ''
    };

    constructor(
        private location: Location,
        private backNav: BackNavigationService
    ) { }

    ngOnInit(): void {
        // Cargar datos guardados si existen en localStorage
        const saved = localStorage.getItem('my_academy_data');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.academy = { ...this.academy, ...parsed };
            } catch { }
        }

        const savedLogo = localStorage.getItem('my_academy_logo');
        if (savedLogo) {
            this.logoUrl = savedLogo;
        }
    }

    goBack(): void {
        this.backNav.backOr({ fallbackUrl: '/dashboard' });
    }

    onLogoChange(event: any): void {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.logoPreview = e.target?.result || null;
                // Guardar base64 localmente por ahora
                if (typeof this.logoPreview === 'string') {
                    localStorage.setItem('my_academy_logo', this.logoPreview);
                    this.logoUrl = this.logoPreview;
                }
            };
            reader.readAsDataURL(file);
        }
    }

    async saveAcademy(): Promise<void> {
        this.saving = true;
        this.message = null;
        const startedAt = Date.now();

        try {
            // Simular guardado
            localStorage.setItem('my_academy_data', JSON.stringify(this.academy));

            await delayRemaining(startedAt, 800);
            this.success = true;
            this.message = 'Datos de la academia guardados correctamente.';
        } catch (err) {
            this.success = false;
            this.message = 'Error al guardar los datos.';
        } finally {
            this.saving = false;
            setTimeout(() => this.message = null, 3000);
        }
    }
}
