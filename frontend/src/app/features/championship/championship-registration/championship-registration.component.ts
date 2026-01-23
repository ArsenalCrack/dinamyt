import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';

@Component({
    selector: 'app-championship-registration',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, LoadingSpinnerComponent, CustomSelectComponent],
    templateUrl: './championship-registration.component.html',
    styleUrls: ['./championship-registration.component.scss']
})
export class ChampionshipRegistrationComponent implements OnInit {
    id: string | null = null;
    code: string | null = null;
    campeonato: any = null;
    loading = true;
    submitting = false;
    message: string | null = null;
    success = false;

    // Simplified form data
    registrationData: { peso: string; cinturon: string; modalidades: string[] } = {
        peso: '',
        cinturon: '',
        modalidades: []
    };

    fullModalities: any[] = [];

    beltOptions = [
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

    modalidadOptions: any[] = [];

    // Validations
    weightError: string | null = null;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private api: ApiService,
        private backNav: BackNavigationService
    ) { }

    ngOnInit(): void {
        this.id = this.route.snapshot.paramMap.get('id');
        this.code = this.route.snapshot.queryParamMap.get('code');

        if (this.id) {
            this.loadChampionship();
        } else {
            this.router.navigate(['/campeonatos']);
        }
    }

    loadChampionship(): void {
        this.loading = true;
        this.api.getCampeonatoById(this.id!).subscribe({
            next: (data) => {
                this.campeonato = data;
                // Map modalities from campeonato if available
                if (data.modalidades) {
                    try {
                        const parsed = typeof data.modalidades === 'string' ? JSON.parse(data.modalidades) : data.modalidades;
                        if (Array.isArray(parsed)) {
                            this.fullModalities = parsed;
                            this.modalidadOptions = parsed.map((m: any) => ({
                                value: m.nombre || m.id,
                                label: m.nombre
                            }));
                        } else {
                            // Fallback if not an array
                            throw new Error('Modalidades is not an array');
                        }
                    } catch (e) {
                        console.error('Error parsing modalidades', e);
                        this.fallbackModalities();
                    }
                } else {
                    this.fallbackModalities();
                }
                this.loading = false;
            },
            error: () => {
                // Mock for demo
                this.campeonato = {
                    nombre: 'Gran Torneo de Verano 2026',
                    ubicacion: 'Coliseo El Campín, Bogotá'
                };
                this.fallbackModalities();
                this.loading = false;
            }
        });
    }

    fallbackModalities() {
        this.modalidadOptions = [
            { value: 'Combates', label: 'Combates' },
            { value: 'Figura', label: 'Figura' }
        ];
        // Mock full structure for fallback
        this.fullModalities = [
            { nombre: 'Combates', categorias: { cinturon: [], peso: [] } },
            { nombre: 'Figura', categorias: { cinturon: [], peso: [] } }
        ];
    }

    toggleModalidad(val: string): void {
        const index = this.registrationData.modalidades.indexOf(val);
        if (index > -1) {
            this.registrationData.modalidades.splice(index, 1);
        } else {
            this.registrationData.modalidades.push(val);
        }

        // Reset fields if they are no longer required
        if (!this.isFieldRequired('cinturon')) this.registrationData.cinturon = '';
        if (!this.isFieldRequired('peso')) this.registrationData.peso = '';
        this.weightError = null;
    }

    isModalidadSelected(val: string): boolean {
        return this.registrationData.modalidades.includes(val);
    }

    isFieldRequired(field: 'cinturon' | 'peso'): boolean {
        // Find if any selected modality has configuration for this field
        return this.registrationData.modalidades.some(modName => {
            const modConfig = this.fullModalities.find(m => (m.nombre || m.id) === modName);
            if (!modConfig || !modConfig.categorias) return false;

            // Check if the category type exists and has items
            const categoryConfig = modConfig.categorias[field];
            return Array.isArray(categoryConfig) && categoryConfig.length > 0;
        });
    }

    validateWeight(event: Event): void {
        const input = event.target as HTMLInputElement;
        let val = input.value.replace(/\D/g, ''); // Remove non-digits

        if (val.length > 3) {
            val = val.slice(0, 3);
        }

        input.value = val;
        this.registrationData.peso = val;

        if (!val && this.isFieldRequired('peso')) {
            this.weightError = 'El peso es obligatorio';
        } else if (val && parseInt(val) < 10) {
            this.weightError = 'Peso mínimo 10kg';
        } else {
            this.weightError = null;
        }
    }

    submitRegistration(): void {
        if (this.isFieldRequired('peso') && !this.registrationData.peso) {
            this.weightError = 'El peso es obligatorio';
            return;
        }

        if (this.isFieldRequired('cinturon') && !this.registrationData.cinturon) {
            // Should be handled by [disabled] on submit button or similar, but good to check
            this.message = 'Selecciona tu cinturón';
            this.success = false;
            return;
        }

        this.submitting = true;
        this.message = null;

        const payload = {
            ...this.registrationData,
            campeonatoId: this.id,
            codigoAcceso: this.code
        };

        // Simulated API call
        setTimeout(() => {
            this.success = true;
            this.message = 'Inscripción realizada exitosamente.';
            this.submitting = false;
            setTimeout(() => {
                this.router.navigate(['/campeonatos']);
            }, 2000);
        }, 1500);
    }

    goBack(): void {
        this.backNav.backOr({ fallbackUrl: '/campeonatos' });
    }
}
