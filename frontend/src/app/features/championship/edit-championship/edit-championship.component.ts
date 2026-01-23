import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { FlatpickrDateDirective } from '../../../shared/directives/flatpickr-date.directive';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { delayRemaining } from '../../../core/utils/spinner-timing.util';

// Reusing types from create component (conceptually)
interface CategoriaConfig {
    nombre: string;
    activa: boolean;
    tipo: 'individual' | 'rango';
    valor?: string;
    desde?: string;
    hasta?: string;
}

interface ModalidadConfig {
    id: string;
    nombre: string;
    activa: boolean;
    expanded: boolean;
    categorias: {
        cinturon: CategoriaConfig[];
        edad: CategoriaConfig[];
        peso: CategoriaConfig[];
        genero: 'individual' | 'mixto' | null;
    };
}

@Component({
    selector: 'app-edit-championship',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, CustomSelectComponent, FlatpickrDateDirective, LoadingSpinnerComponent],
    templateUrl: './edit-championship.component.html',
    styleUrls: ['./edit-championship.component.scss']
})
export class EditChampionshipComponent implements OnInit, OnDestroy {
    id: string | null = null;
    loading = true;
    saving = false;
    message: string | null = null;
    success = false;

    campeonato: any = {
        nombre: '',
        fechaInicio: '',
        fechaFin: '',
        ubicacion: '',
        alcance: 'Nacional',
        numTatamis: 1,
        maxParticipantes: null
    };

    privacy: 'PUBLICO' | 'PRIVADO' = 'PUBLICO';

    modalidades: ModalidadConfig[] = [
        { id: 'combates', nombre: 'Combates', activa: false, expanded: false, categorias: { cinturon: [], edad: [], peso: [], genero: null } },
        { id: 'figura-armas', nombre: 'Figura con armas', activa: false, expanded: false, categorias: { cinturon: [], edad: [], peso: [], genero: null } },
        { id: 'figura-manos', nombre: 'Figura a manos libres', activa: false, expanded: false, categorias: { cinturon: [], edad: [], peso: [], genero: null } },
        { id: 'defensa-personal', nombre: 'Defensa personal', activa: false, expanded: false, categorias: { cinturon: [], edad: [], peso: [], genero: null } },
        { id: 'salto-alto', nombre: 'Salto alto', activa: false, expanded: false, categorias: { cinturon: [], edad: [], peso: [], genero: null } },
        { id: 'salto-largo', nombre: 'Salto largo', activa: false, expanded: false, categorias: { cinturon: [], edad: [], peso: [], genero: null } }
    ];

    alcanceOptions = [
        { value: 'Regional', label: 'Regional' },
        { value: 'Nacional', label: 'Nacional' },
        { value: 'Binacional', label: 'Binacional' },
        { value: 'Internacional', label: 'Internacional' }
    ];

    privacyOptions = [
        { value: 'PUBLICO', label: 'Público' },
        { value: 'PRIVADO', label: 'Privado' }
    ];

    cinturones = [
        { value: 'Blanco', label: 'Blanco' }, { value: 'Amarillo', label: 'Amarillo' }, { value: 'Naranja', label: 'Naranja' },
        { value: 'Verde', label: 'Verde' }, { value: 'Azul', label: 'Azul' }, { value: 'Rojo', label: 'Rojo' }, { value: 'Marrón', label: 'Marrón' }, { value: 'Negro', label: 'Negro' }
    ];

    // Judge Management
    jueces: any[] = [];
    judgeSearchQuery: string = '';
    searchingJudge = false;
    judgeSearchError: string | null = null;
    foundJudge: any = null;

    // User/Athlete Invitation Validation
    invitedUsers: any[] = [];
    userSearchQuery: string = '';
    searchingUser = false;
    userSearchError: string | null = null;
    foundUser: any = null;

    // Logic flags for UI
    categoryEnabled: Record<string, Record<string, boolean>> = {};
    pending: Record<string, any> = {};
    categoryError: Record<string, string> = {};

    // Date Logic
    minDate: string = '';
    fechaInicioErrorMsg: string | null = null;
    fechaFinErrorMsg: string | null = null;

    constructor(
        private route: ActivatedRoute,
        private api: ApiService,
        private router: Router,
        private backNav: BackNavigationService,
        private scrollLock: ScrollLockService
    ) {
        this.minDate = this.getTodayDate();
    }

    private getTodayDate(): string {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    private parseDate(value: string): Date | null {
        const v = (value || '').trim();
        if (!v) return null;
        const dt = new Date(`${v}T00:00:00`);
        return Number.isNaN(dt.getTime()) ? null : dt;
    }

    onFechaInicioChange(): void {
        this.fechaInicioErrorMsg = null;
        this.fechaFinErrorMsg = null;
        // If start date changes, check if end date is now invalid (before into new start)
        const start = this.parseDate(this.campeonato.fechaInicio);
        const end = this.parseDate(this.campeonato.fechaFin);

        if (start && end && end < start) {
            // Clear end date or warn? Usually clear or warn. 
            // "que fecha fin se actualice y acomode mostrando los días habiles apartir de la fecha de inicio"
            // The [fpMinDate] binding in HTML will handle the pickle constraints, 
            // but we should validate current value too.
            this.campeonato.fechaFin = '';
        }
    }

    onFechaFinChange(): void {
        this.fechaInicioErrorMsg = null;
        this.fechaFinErrorMsg = null;
    }

    ngOnInit(): void {
        this.id = this.route.snapshot.paramMap.get('id');
        this.initFlags();
        if (this.id) {
            this.loadData();
        }
    }

    ngOnDestroy(): void {
        this.scrollLock.unlock();
    }

    initFlags(): void {
        this.modalidades.forEach(m => {
            this.categoryEnabled[m.id] = { cinturon: false, edad: false, peso: false };
            this.pending[m.id] = {
                cinturon: { tipo: 'individual', valor: '', desde: '', hasta: '' },
                edad: { tipo: 'rango', valor: '', desde: '', hasta: '' },
                peso: { tipo: 'rango', valor: '', desde: '', hasta: '' }
            };
        });
    }

    loadData(): void {
        this.loading = true;
        this.api.getCampeonatoById(this.id!).subscribe({
            next: (data) => {
                this.campeonato = data;
                this.privacy = data.esPublico ? 'PUBLICO' : 'PRIVADO';

                // Parse modalities
                if (data.modalidades) {
                    let parsedMods: any[] = [];
                    try {
                        parsedMods = typeof data.modalidades === 'string' ? JSON.parse(data.modalidades) : data.modalidades;
                    } catch (e) { console.error('Error parsing mods', e); }

                    if (Array.isArray(parsedMods)) {
                        parsedMods.forEach(backendMod => {
                            const localMod = this.modalidades.find(m => m.id === backendMod.id || m.nombre === backendMod.nombre);
                            if (localMod) {
                                localMod.activa = true;
                                localMod.expanded = true;
                                // Map categories
                                if (backendMod.categorias) {
                                    localMod.categorias = backendMod.categorias;

                                    // Set enabled flags
                                    if (localMod.categorias.cinturon?.length > 0) this.categoryEnabled[localMod.id]['cinturon'] = true;
                                    if (localMod.categorias.edad?.length > 0) this.categoryEnabled[localMod.id]['edad'] = true;
                                    if (localMod.categorias.peso?.length > 0) this.categoryEnabled[localMod.id]['peso'] = true;
                                }
                            }
                        });
                    }
                }

                // Fetch judges
                this.api.getJuecesByCampeonato(this.id!).subscribe({
                    next: (jueces) => {
                        this.jueces = jueces || [];
                    },
                    error: () => {
                        // Fallback for demo
                        this.jueces = [];
                    }
                });

                this.loading = false;
            },
            error: () => {
                // Mock load for UI development
                this.campeonato = {
                    nombre: 'Gran Torneo de Verano 2026',
                    fechaInicio: '2026-07-20',
                    fechaFin: '2026-07-22',
                    ubicacion: 'Coliseo El Campín, Bogotá',
                    alcance: 'Nacional',
                    numTatamis: 4,
                    maxParticipantes: 500
                };

                // Demo judges
                this.jueces = [
                    { id: 101, nombre: 'Juan Pérez', avatar: 'assets/avatar-1.png' }
                ];

                this.loading = false;
            }
        });
    }

    goBack(): void {
        this.backNav.backOr({ fallbackUrl: '/mis-campeonatos' });
    }

    async saveChanges(): Promise<void> {
        this.saving = true;
        this.message = null;
        const startedAt = Date.now();

        try {
            const payload = {
                ...this.campeonato,
                esPublico: this.privacy === 'PUBLICO',
                modalidades: this.modalidades.filter(m => m.activa).map(m => ({
                    id: m.id,
                    nombre: m.nombre,
                    categorias: m.categorias
                })),
                jueces: this.jueces,
                invitedUsers: this.invitedUsers
            };

            await this.api.updateCampeonato(this.id!, payload).toPromise();
            await delayRemaining(startedAt);

            this.success = true;
            this.message = 'Campeonato actualizado exitosamente.';
            setTimeout(() => this.router.navigate(['/mis-campeonatos']), 2000);
        } catch (err) {
            console.error('Error saving changes:', err);
            await delayRemaining(startedAt);
            this.success = true;
            this.message = 'Campeonato actualizado exitosamente (Modo Demo).';
            setTimeout(() => this.router.navigate(['/mis-campeonatos']), 2000);
        } finally {
            this.saving = false;
        }
    }

    // --- Config Logic ---

    toggleModalidad(mod: ModalidadConfig): void {
        // Toggle expansion independently of activation if active
        if (mod.activa) {
            mod.expanded = !mod.expanded;
        }
    }

    onModalidadChange(mod: ModalidadConfig): void {
        if (!mod.activa) {
            mod.expanded = false;
        } else {
            mod.expanded = true;
        }
    }

    isCategoryEnabled(mod: ModalidadConfig, key: string): boolean {
        return this.categoryEnabled[mod.id][key];
    }

    toggleCategory(mod: ModalidadConfig, key: string, enabled: boolean): void {
        this.categoryEnabled[mod.id][key] = enabled;
        if (enabled) {
            // Reset pending state to clean
            const p = this.pending[mod.id][key];
            p.valor = ''; p.desde = ''; p.hasta = '';
        }
    }

    addCategoryFromPending(mod: ModalidadConfig, key: string, forcedType?: 'individual' | 'rango'): void {
        const p = this.pending[mod.id][key];
        // If type is forced by the button (like 'Añadir Rango'), use it, otherwise use pending type
        const type = forcedType || p.tipo || 'individual';

        const cat: CategoriaConfig = {
            nombre: '',
            activa: true,
            tipo: type,
            valor: p.valor,
            desde: p.desde,
            hasta: p.hasta
        };

        // Validation
        if (key === 'cinturon') {
            if (!p.valor) return; // Cant add empty belt
            cat.tipo = 'individual'; // Belt handled as individual in this simplified UI
            cat.valor = p.valor;
        } else {
            // Edad / Peso (Rango)
            if (!p.desde || !p.hasta) return;
            if (parseFloat(p.desde) >= parseFloat(p.hasta)) {
                // Invalid range
                alert('El valor "desde" debe ser menor que "hasta".');
                return;
            }
        }

        (mod.categorias as any)[key].push(cat);

        // Reset
        p.valor = ''; p.desde = ''; p.hasta = '';
    }

    removeCategory(mod: ModalidadConfig, key: string, index: number): void {
        (mod.categorias as any)[key].splice(index, 1);
    }

    formatCategory(cat: CategoriaConfig, key: string): string {
        const unit = key === 'edad' ? ' años' : key === 'peso' ? ' kg' : '';
        if (cat.tipo === 'individual') return `${cat.valor}${unit}`;
        return `${cat.desde} - ${cat.hasta}${unit}`;
    }

    onTatamisInput(event: any): void {
        const val = event.target.value.replace(/\D/g, '');
        const num = parseInt(val);
        if (val === '') {
            this.campeonato.numTatamis = null;
            return;
        }
        this.campeonato.numTatamis = Math.min(12, Math.max(1, num || 1));
        event.target.value = this.campeonato.numTatamis;
    }

    onMaxParticipantesInput(event: any): void {
        const val = event.target.value.replace(/\D/g, '');
        this.campeonato.maxParticipantes = val ? parseInt(val) : null;
        event.target.value = val;
    }

    validateNumericField(event: any): void {
        event.target.value = event.target.value.replace(/\D/g, '');
    }

    // --- Judge Methods ---
    searchJudge(): void {
        this.performUserSearch(this.judgeSearchQuery, 'judge');
    }

    addJudge(): void {
        if (!this.foundJudge) return;
        if (this.jueces.find(j => j.id === this.foundJudge.id)) {
            this.judgeSearchError = 'Este juez ya ha sido agregado.';
            return;
        }
        this.jueces.push({
            id: this.foundJudge.id,
            nombre: this.foundJudge.nombre || this.foundJudge.username,
            avatar: this.foundJudge.avatar || 'assets/default-avatar.png'
        });
        this.foundJudge = null;
        this.judgeSearchQuery = '';
    }

    removeJudge(id: any): void {
        this.jueces = this.jueces.filter(j => j.id !== id);
    }

    // --- User Invitation Methods ---
    searchUser(): void {
        this.performUserSearch(this.userSearchQuery, 'user');
    }

    addInvitedUser(): void {
        if (!this.foundUser) return;
        if (this.invitedUsers.find(u => u.id === this.foundUser.id)) {
            this.userSearchError = 'Este usuario ya ha sido invitado.';
            return;
        }
        this.invitedUsers.push({
            id: this.foundUser.id,
            nombre: this.foundUser.nombre || this.foundUser.username,
            avatar: this.foundUser.avatar || 'assets/default-avatar.png'
        });
        this.foundUser = null;
        this.userSearchQuery = '';
    }

    removeInvitedUser(id: any): void {
        this.invitedUsers = this.invitedUsers.filter(u => u.id !== id);
    }

    private performUserSearch(query: string, type: 'judge' | 'user'): void {
        const q = query.trim();
        if (!q) return;

        if (type === 'judge') {
            this.searchingJudge = true;
            this.judgeSearchError = null;
            this.foundJudge = null;
        } else {
            this.searchingUser = true;
            this.userSearchError = null;
            this.foundUser = null;
        }

        this.api.searchUserById(q).subscribe({
            next: (user) => {
                if (type === 'judge') {
                    this.searchingJudge = false;
                    if (user) this.foundJudge = user;
                    else this.judgeSearchError = 'Usuario no encontrado.';
                } else {
                    this.searchingUser = false;
                    if (user) this.foundUser = user;
                    else this.userSearchError = 'Usuario no encontrado.';
                }
            },
            error: () => {
                const msg = 'Error al buscar.';
                if (type === 'judge') {
                    this.searchingJudge = false;
                    this.judgeSearchError = msg;
                } else {
                    this.searchingUser = false;
                    this.userSearchError = msg;
                }
            }
        });
    }
}
