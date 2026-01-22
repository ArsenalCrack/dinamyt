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

    beltOptions = [
        { value: 'Blanco', label: 'Blanco' },
        { value: 'Amarillo', label: 'Amarillo' },
        { value: 'Naranja', label: 'Naranja' },
        { value: 'Verde', label: 'Verde' },
        { value: 'Azul', label: 'Azul' },
        { value: 'Rojo', label: 'Rojo' },
        { value: 'Marrón', label: 'Marrón' },
        { value: 'Negro', label: 'Negro' }
    ];

    modalidadOptions: any[] = [];

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
                        this.modalidadOptions = [
                            { value: 'Combates', label: 'Combates' },
                            { value: 'Figura', label: 'Figura' }
                        ];
                    }
                } else {
                    // Mock modalities
                    this.modalidadOptions = [
                        { value: 'Combates', label: 'Combates' },
                        { value: 'Figura', label: 'Figura' }
                    ];
                }
                this.loading = false;
            },
            error: () => {
                // Mock for demo
                this.campeonato = {
                    nombre: 'Gran Torneo de Verano 2026',
                    ubicacion: 'Coliseo El Campín, Bogotá'
                };
                this.modalidadOptions = [
                    { value: 'Combates', label: 'Combates' },
                    { value: 'Figura', label: 'Figura' }
                ];
                this.loading = false;
            }
        });
    }

    toggleModalidad(val: string): void {
        const index = this.registrationData.modalidades.indexOf(val);
        if (index > -1) {
            this.registrationData.modalidades.splice(index, 1);
        } else {
            this.registrationData.modalidades.push(val);
        }
    }

    isModalidadSelected(val: string): boolean {
        return this.registrationData.modalidades.includes(val);
    }

    submitRegistration(): void {
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
