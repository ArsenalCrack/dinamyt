import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { delay } from 'rxjs/operators';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { BackNavigationService } from '../../../core/services/back-navigation.service';
import { NavigationHistoryService } from '../../../core/services/navigation-history.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';

interface Participante {
    id: number;
    nombre: string;
    academia: string;
    modalidad: string;
    cinturon: string;
    peso: string;
    edad: string;
    genero: string;
    pais?: string;
    ciudad?: string;
    // New fields for granular filtering
    metaModalities?: string[];
    metaBelts?: string[];
    metaAges?: string[];
    metaWeights?: string[];
}

interface Juez {
    id: number;
    nombre: string;
    avatar: string;
    rol?: string; // 'Central', 'Mesa', etc.
    categoria?: string; // 'A', 'B', 'Internacional'
    pais?: string;
    ciudad?: string;
}

@Component({
    selector: 'app-championship-details',
    standalone: true,
    imports: [CommonModule, RouterModule, LoadingSpinnerComponent, FormsModule, CustomSelectComponent],
    templateUrl: './championship-details.component.html',
    styleUrls: ['./championship-details.component.scss']
})
export class ChampionshipDetailsComponent implements OnInit, OnDestroy {
    id: string | null = null;
    campeonato: any = null;
    cargando = true;
    mensajeError: string | null = null;
    currentUserId: string | null = null;
    copiado = false;
    mostrarModalEliminar = false;
    eliminando = false;

    // Jueces
    jueces: Juez[] = [];
    filteredJueces: Juez[] = [];
    paginatedJueces: Juez[] = [];
    juecesPage: number = 1;
    juecesPerPage: number = 6;
    totalJuecesPages: number = 1;
    juezSearchQuery: string = '';

    // Participantes
    participantes: Participante[] = [];
    filteredParticipantes: Participante[] = [];

    // Filtros
    searchQuery: string = '';
    modalidadFilter: string = 'TODAS';

    // Filtros específicos de categoría
    pesoFilter: string = 'TODAS';
    cinturonFilter: string = 'TODAS';
    edadFilter: string = 'TODAS';
    generoFilter: string = 'TODAS';

    // Config and state
    modalidadesConfig: any[] = [];
    filtersVisible = {
        cinturon: true,
        peso: true,
        edad: true,
        genero: true
    };

    // Sorting
    sortOptions = [
        { label: 'Nombre (A-Z)', value: 'nombre-asc' },
        { label: 'Nombre (Z-A)', value: 'nombre-desc' },
        { label: 'Academia (A-Z)', value: 'academia-asc' },
        { label: 'Academia (Z-A)', value: 'academia-desc' },
        { label: 'Modalidad (A-Z)', value: 'modalidad-asc' },
        { label: 'Modalidad (Z-A)', value: 'modalidad-desc' },
        { label: 'Cinturón (A-Z)', value: 'cinturon-asc' },
        { label: 'Cinturón (Z-A)', value: 'cinturon-desc' },
        { label: 'Peso (Menor a Mayor)', value: 'peso-asc' },
        { label: 'Peso (Mayor a Menor)', value: 'peso-desc' },
        { label: 'Edad (Menor a Mayor)', value: 'edad-asc' },
        { label: 'Edad (Mayor a Menor)', value: 'edad-desc' },
        { label: 'Género (A-Z)', value: 'genero-asc' },
        { label: 'Género (Z-A)', value: 'genero-desc' }
    ];
    currentSort: string = 'nombre-asc';

    modalidadesOptions: { label: string, value: string }[] = [];
    pesosOptions: { label: string, value: string }[] = [];
    cinturonesOptions: { label: string, value: string }[] = [];
    edadesOptions: { label: string, value: string }[] = [];
    generosOptions: { label: string, value: string }[] = [];

    filteredCount = 0;
    showMobileFilters = false;
    showMobileActions = false;

    // Section states
    activeTab: 'info' | 'participants' | 'results' = 'info';
    isInfoExpanded = true;
    isJudgesExpanded = true;
    isParticipantsExpanded = true;

    // Pagination
    currentPage: number = 1;
    itemsPerPage: number = 10;
    totalPages: number = 1;
    paginatedParticipantes: Participante[] = [];

    // Modals state
    showLoginModal = false;
    showAccessCodeModal = false;
    accessCode = '';
    accessCodeError: string | null = null;
    accessCodeSubmitting = false;

    constructor(
        private route: ActivatedRoute,
        private api: ApiService,
        private auth: AuthService,
        private router: Router,
        private backNav: BackNavigationService,
        private navHistory: NavigationHistoryService,
        private scrollLock: ScrollLockService
    ) { }

    // ... (ngOnInit and loadData remain similar, just ensuring Imports are there)

    isOwner(): boolean {
        if (!this.campeonato || !this.currentUserId) return false;
        return String(this.campeonato.creadoPor) === String(this.currentUserId);
    }

    get canRegister(): boolean {
        if (!this.campeonato) return false;
        if (this.isOwner()) return false;
        return (this.campeonato.estadoReal === 'PLANIFICADO') && !!this.campeonato.puedeInscribirse;
    }

    registerChampionship(): void {
        const id = this.campeonato?.id || this.campeonato?.idCampeonato;
        if (!id) return;

        // Refresh user ID just in case
        this.currentUserId = sessionStorage.getItem('idDocumento');

        // 1. Check Auth
        if (!this.auth.isLoggedIn()) {
            this.showLoginModal = true;
            this.scrollLock.lock();
            return;
        }

        if (!this.currentUserId) {
            // Fallback
            this.proceedChampionshipRegistration(id);
            return;
        }

        // Verificar invitaciones primero
        this.cargando = true;

        this.api.getMisInscripciones(this.currentUserId).subscribe({
            next: (inscripciones: any[]) => {
                this.cargando = false;

                const record = inscripciones.find((item: any) => {
                    // Búsqueda robusta del ID
                    let campId = item.id_campeonato || item.idCampeonato || item.IdCampeonato ||
                        item.campeonato_id || item.campeonatoId || item.id_torneo || item.ref_campeonato;

                    if (!campId && typeof item.campeonato === 'object' && item.campeonato !== null) {
                        campId = item.campeonato.id || item.campeonato.idCampeonato;
                    }

                    const isMatch = String(campId) === String(id);
                    return isMatch;
                });

                if (record) {
                    if (record.invitado == 1) {
                        alert('Has sido invitado a este campeonato como competidor. Debes inscribirte mediante la invitación en tu sección de invitaciones.');
                        return;
                    }
                }
                this.proceedChampionshipRegistration(id);
            },
            error: (err) => {
                console.error('Error checking inscriptions', err);
                this.cargando = false;
                this.proceedChampionshipRegistration(id);
            }
        });
    }

    private proceedChampionshipRegistration(id: any): void {
        // 2. Verificar si es privado
        if (!this.campeonato.esPublico) {
            this.showAccessCodeModal = true;
            this.accessCode = '';
            this.accessCodeError = null;
            this.accessCodeSubmitting = false;
            this.scrollLock.lock();
            return;
        }

        // 3. Registrar (navegar al formulario de inscripción)
        this.router.navigate(['/campeonato/register', id]);
    }

    // Acciones del modal de login
    closeLoginModal(): void {
        this.showLoginModal = false;
        this.scrollLock.unlock();
    }

    goToLogin(): void {
        this.closeLoginModal();
        const id = this.campeonato?.id || this.campeonato?.idCampeonato;
        // Redirigir de vuelta a esta página después del login
        this.auth.redirectUrl = this.router.url; // Volver a los detalles
        this.router.navigate(['/login']);
    }

    // Access Code Modal Actions
    closeAccessCodeModal(): void {
        this.showAccessCodeModal = false;
        this.accessCode = '';
        this.scrollLock.unlock();
    }

    onAccessCodeChange(value: string): void {
        let clean = value.replace(/[^0-9]/g, '');
        if (clean.length > 6) clean = clean.substring(0, 6);
        this.accessCode = clean;
    }

    submitAccessCode(): void {
        const id = this.campeonato?.id || this.campeonato?.idCampeonato;
        const code = (this.accessCode || '').trim();

        if (!id) return;
        if (!code) {
            this.accessCodeError = 'El código es obligatorio.';
            return;
        }

        this.accessCodeSubmitting = true;
        this.accessCodeError = null;

        this.api.validarCodigoCampeonato(id, code).subscribe({
            next: () => {
                this.accessCodeSubmitting = false;
                this.closeAccessCodeModal();
                this.router.navigate(['/campeonato/register', id], { queryParams: { code: code } });
            },
            error: (err) => {
                this.accessCodeSubmitting = false;
                const msg = err?.error?.message || err?.error?.mensaje;
                this.accessCodeError = msg || 'Código inválido. Intenta de nuevo.';
            }
        });
    }

    ngOnInit(): void {
        this.currentUserId = sessionStorage.getItem('idDocumento');
        this.id = this.route.snapshot.paramMap.get('id');
        if (this.id) {
            this.loadData();
        } else {
            this.mensajeError = 'No se proporcionó un ID de campeonato.';
            this.cargando = false;
        }
    }

    loadData(): void {
        this.cargando = true;
        this.scrollLock.lock();
        this.api.getCampeonatoById(this.id!)
            .pipe(delay(800))
            .subscribe({
                next: (data) => {
                    this.campeonato = data;

                    // Verificar acceso por visibilidad
                    // Requisito: si visible/visibilidad es 0, el usuario no puede acceder por URL
                    const isVisible = (
                        data.visible !== 0 && data.visible !== '0' && data.visible !== false &&
                        data.Visible !== 0 && data.Visible !== '0' && data.Visible !== false &&
                        data.visibilidad !== 0 && data.visibilidad !== '0' && data.visibilidad !== false &&
                        data.Visibilidad !== 0 && data.Visibilidad !== '0' && data.Visibilidad !== false
                    );
                    if (!isVisible) {
                        this.router.navigate(['/campeonatos']); // Redirigir si no es visible
                        this.scrollLock.unlock(); // Asegurar que el bloqueo se libere
                        return;
                    }

                    // Parsear configuración de modalidades
                    try {
                        this.modalidadesConfig = typeof data.modalidades === 'string'
                            ? JSON.parse(data.modalidades)
                            : (data.modalidades || []);
                    } catch (e) {
                        this.modalidadesConfig = [];
                    }

                    // Calcular estado real basado en fechas
                    if (this.campeonato) {
                        this.campeonato.estadoReal = this.calculateStatus(this.campeonato.fechaInicio, this.campeonato.fecha_fin);
                    }

                    this.loadParticipantes();

                    this.extractAvailableOptions();
                    this.checkActiveFilters();
                    this.applyFilters();

                    // Obtener jueces
                    this.api.getJuecesByCampeonato(this.id!).subscribe({
                        next: (data: any[]) => {
                            const rawInscriptions = data || [];
                            // Mapear inscripciones y obtener detalles de usuario para cada una
                            const judgePromises = rawInscriptions.map((ins: any) => {
                                const userId = ins.usuario;
                                // Usar searchUsers para obtener info del usuario por ID
                                // CRÍTICO: Pasar '0' como idCampeonato para no excluir usuarios ya inscritos en este campeonato
                                return new Promise<Juez | null>((resolve) => {
                                    this.api.searchUsers(String(userId), '0', '0', 6).subscribe({
                                        next: (users: any[]) => {
                                            // La búsqueda puede retornar múltiples, encontrar coincidencia exacta por ID
                                            const user = users.find(u => String(u.idDocumento) === String(userId));
                                            if (user) {
                                                // Determinar rol usando tipousuario directamente de la inscripción (columna BD)
                                                // 6: Central, 7: Mesa, 8: Juez
                                                const typeId = ins.tipousuario ?? ins.idTipo ?? ins.id_tipo;

                                                let role = 'Referi de Esquina';
                                                if (typeId === 6) role = 'Referi Central';
                                                else if (typeId === 7) role = 'Referi de Mesa';
                                                else if (typeId === 8) role = 'Referi de Esquina';
                                                else if (typeId === 9) role = 'Coach';
                                                else if (typeId === 10) role = 'Referi Running';
                                                else if (typeId === 'COMPETIDOR') role = 'Competidor'; // Verificación de seguridad

                                                resolve({
                                                    id: user.idDocumento,
                                                    nombre: user.nombreC,
                                                    avatar: 'assets/avatar-1.png',
                                                    rol: role,
                                                    categoria: user.cinturonRango || 'N/A',
                                                    pais: user.nacionalidad,
                                                    ciudad: user.ciudad
                                                });
                                            } else {
                                                resolve(null);
                                            }
                                        },
                                        error: (err) => {
                                            resolve(null)
                                        }
                                    });
                                });
                            });

                            Promise.all(judgePromises).then(results => {
                                this.jueces = results.filter(j => j !== null) as Juez[];
                                this.filterJueces();
                            });
                        },
                        error: (err) => {
                            console.error('Error loading judges', err);
                            this.jueces = [];
                        }
                    });

                    this.cargando = false;
                    this.scrollLock.unlock();
                },
                error: (err) => {
                    console.error('Error loading championship details:', err);
                    this.cargando = false;
                    this.scrollLock.unlock();
                }
            });
    }

    loadParticipantes(): void {
        this.api.getInscriptionsByChampionship(this.id!).subscribe({
            next: (data) => {
                if (data && Array.isArray(data) && data.length > 0) {

                    // 1. Mapeamos los datos de la API al formato de la interfaz Participante
                    const todosLosParticipantes = data.map((item: any) => this.mapToParticipante(item));

                    this.participantes = todosLosParticipantes.filter((_, i) => data[i].estado === 3);

                    // 3. Si después de filtrar no queda nadie (porque quizás todos están aceptados/rechazados)
                    // puedes decidir si mostrar una lista vacía o volver a cargar sin filtro. 
                    // Aquí mantengo tu lógica de "seguridad" pero solo con los de estado 2.
                    if (this.participantes.length === 0) {
                    }

                    this.extractAvailableOptions();
                    this.checkActiveFilters();
                    this.applyFilters();
                }
            },
            error: (err) => {
                console.error('Error al cargar participantes:', err);
            }
        });
    }

    private mapToParticipante(item: any): Participante {
        const rawModalities: string[] = Array.isArray(item.modalidades) ? item.modalidades :
            Array.isArray(item.secciones) ? item.secciones :
                (item.modalidad ? [item.modalidad] : []);

        const parsedModalities: string[] = [];
        const parsedBelts: string[] = [];
        const parsedAges: string[] = [];
        const parsedWeights: string[] = [];

        if (rawModalities.length > 0) {
            rawModalities.forEach(modString => {
                // Regex: "ModalityName (Belt) - Edad: Age - Peso: Weight"
                // Example: "Salto largo (BLANCO/NARANJA) - Edad: 4-12 - Peso: 10-20kg"
                const match = modString.match(/^(.*?)\s*\((.*?)\)\s*-\s*Edad:\s*(.*?)\s*-\s*Peso:\s*(.*)$/i);
                if (match) {
                    parsedModalities.push(match[1].trim());
                    parsedBelts.push(match[2].trim());
                    parsedAges.push(match[3].trim());
                    parsedWeights.push(match[4].trim());
                } else {
                    // Respaldo: solo usar el nombre si el formato es más simple
                    // ej: "Modalidad (Cinturón)"
                    const simpleMatch = modString.match(/^(.*?)\s*\(/);
                    if (simpleMatch) {
                        parsedModalities.push(simpleMatch[1].trim());
                    } else {
                        parsedModalities.push(modString.trim());
                    }
                }
            });
        }

        const unique = (arr: string[]) => Array.from(new Set(arr)).filter(Boolean);

        return {
            id: item.idDocumento || item.id_inscripcion || item.id,
            nombre: item.nombreC || item.nombre_completo || item.nombre || item.nombre_usuario || 'Desconocido',
            academia: item.academia || 'Independiente',
            // Display formatted list of modality names
            modalidad: unique(parsedModalities).join(', ') || ((item.modalidad || 'N/A') as string),
            cinturon: item.cinturonRango || item.cinturon || 'Blanco',
            peso: this.formatRange(item.peso || 'N/A'),
            edad: (item.fechaNacimiento ? this.calcularEdad(item.fechaNacimiento).toString() : this.formatRange((item.edad || 0).toString())) + ' Años',
            genero: item.sexo || item.genero || 'N/A',
            pais: item.nacionalidad || item.pais || 'Colombia',
            ciudad: item.ciudad || '',

            // Meta-data for filters
            metaModalities: unique(parsedModalities),
            metaBelts: unique(parsedBelts),
            metaAges: unique(parsedAges),
            metaWeights: unique(parsedWeights)
        };
    }

    private formatRange(val: string): string {
        if (!val) return val;
        // Verificar si es un rango como "d-d" y no un número negativo u otra cosa
        // Regex simple para "número-número"
        if (/^\d+(\.\d+)?\s*-\s*\d+(\.\d+)?/.test(val)) {
            return val.replace('-', ' a ');
        }
        return val;
    }

    private calcularEdad(fechaNacimiento: string): number {
        if (!fechaNacimiento) return 0;
        const birthDate = new Date(fechaNacimiento);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    }

    extractAvailableOptions(): void {
        const toOption = (val: string) => ({ label: val, value: val });
        // Extrae valores únicos de un array de arrays
        const uniqueFlat = (extractor: (p: Participante) => string[] | undefined) => {
            const allValues = this.participantes.flatMap(p => extractor(p) || []);
            return Array.from(new Set(allValues)).filter(Boolean).sort();
        };
        // Extrae valores únicos de un array simple
        const uniqueSimple = (arr: string[]) => Array.from(new Set(arr)).filter(Boolean).sort();

        this.modalidadesOptions = [
            { label: 'Todas', value: 'TODAS' },
            ...uniqueFlat(p => p.metaModalities).map(toOption)
        ];
        this.cinturonesOptions = [
            { label: 'Todos', value: 'TODAS' },
            ...uniqueFlat(p => p.metaBelts).map(val => ({
                label: val.includes('/') ? val.replace('/', ' hasta ') : val,
                value: val
            }))
        ];
        this.pesosOptions = [
            { label: 'Todos', value: 'TODAS' },
            ...uniqueFlat(p => p.metaWeights).map(val => ({ label: this.formatRange(val), value: val }))
        ];
        this.edadesOptions = [
            { label: 'Todas', value: 'TODAS' },
            ...uniqueFlat(p => p.metaAges).map(val => ({ label: this.formatRange(val) + ' Años', value: val }))
        ];
        this.generosOptions = [
            { label: 'Todos', value: 'TODAS' },
            ...uniqueSimple(this.participantes.map(p => p.genero)).map(toOption)
        ];
    }

    onModalityChange(): void {
        this.checkActiveFilters();
        // Resetear sub-filtros cuando cambia la modalidad para evitar combinaciones imposibles
        this.cinturonFilter = 'TODAS';
        this.pesoFilter = 'TODAS';
        this.edadFilter = 'TODAS';
        this.applyFilters();
    }

    clearFilters(): void {
        this.searchQuery = '';
        this.modalidadFilter = 'TODAS';
        this.cinturonFilter = 'TODAS';
        this.pesoFilter = 'TODAS';
        this.edadFilter = 'TODAS';
        this.generoFilter = 'TODAS';
        this.applyFilters();
    }

    checkActiveFilters(): void {
        if (this.modalidadFilter === 'TODAS') {
            this.filtersVisible = { cinturon: true, peso: true, edad: true, genero: true };
            return;
        }

        const config = this.modalidadesConfig.find((m: any) => m.nombre === this.modalidadFilter || m.id === this.modalidadFilter); // loose match

        if (config && config.categorias) {
            this.filtersVisible = {
                cinturon: config.categorias.cinturon && config.categorias.cinturon.length > 0,
                peso: config.categorias.peso && config.categorias.peso.length > 0,
                edad: config.categorias.edad && config.categorias.edad.length > 0,
                genero: config.categorias.genero !== null
            };
        } else {
            // Respaldo si no se encuentra la configuración
            this.filtersVisible = { cinturon: true, peso: true, edad: true, genero: true };
        }
    }

    applyFilters(): void {
        const query = this.searchQuery.toLowerCase().trim();

        // Filtrar
        let result = this.participantes.filter(p => {
            const matchSearch = !query ||
                p.nombre.toLowerCase().includes(query) ||
                p.academia.toLowerCase().includes(query) ||
                (p.ciudad && p.ciudad.toLowerCase().includes(query));

            // Usar arrays meta-parseados para verificar coincidencias de filtros
            const matchMod = this.modalidadFilter === 'TODAS' ||
                (p.metaModalities && p.metaModalities.includes(this.modalidadFilter));

            // Solo aplicar filtros si están visibles/activos para la modalidad
            const matchCinturon = !this.filtersVisible.cinturon || this.cinturonFilter === 'TODAS' ||
                (p.metaBelts && p.metaBelts.includes(this.cinturonFilter));

            const matchPeso = !this.filtersVisible.peso || this.pesoFilter === 'TODAS' ||
                (p.metaWeights && p.metaWeights.includes(this.pesoFilter));

            const matchEdad = !this.filtersVisible.edad || this.edadFilter === 'TODAS' ||
                (p.metaAges && p.metaAges.includes(this.edadFilter));

            const matchGenero = !this.filtersVisible.genero || this.generoFilter === 'TODAS' || p.genero === this.generoFilter;

            return matchSearch && matchMod && matchCinturon && matchPeso && matchEdad && matchGenero;
        });

        // Ordenar
        result.sort((a, b) => {
            const [field, dir] = this.currentSort.split('-');
            const isAsc = dir === 'asc';

            let valA: any = a[field as keyof Participante];
            let valB: any = b[field as keyof Participante];

            // Manejar strings numéricos
            if (field === 'edad' || field === 'peso') {
                valA = parseFloat(valA) || 0;
                valB = parseFloat(valB) || 0;
            }

            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
                return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
            } else {
                return isAsc ? valA - valB : valB - valA;
            }
        });

        this.filteredParticipantes = result;
        this.filteredCount = result.length;

        // Resetear paginación
        this.currentPage = 1;
        this.updatePagination();
    }

    updatePagination(): void {
        this.totalPages = Math.ceil(this.filteredParticipantes.length / this.itemsPerPage) || 1;
        if (this.currentPage > this.totalPages) this.currentPage = 1;

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        this.paginatedParticipantes = this.filteredParticipantes.slice(startIndex, endIndex);
    }

    nextPage(): void {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.updatePagination();
            this.scrollToTopList();
        }
    }

    prevPage(): void {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.updatePagination();
            this.scrollToTopList();
        }
    }

    goToPage(page: number): void {
        if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
            this.currentPage = page;
            this.updatePagination();
            this.scrollToTopList();
        }
    }

    getPageNumbers(): number[] {
        const total = this.totalPages;
        const current = this.currentPage;
        let start = Math.max(1, current - 2);
        let end = Math.min(total, current + 2);

        if (total <= 5) {
            start = 1;
            end = total;
        }

        const pages = [];
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        return pages;
    }

    private scrollToTopList() {
        const element = document.getElementById('participants-list-anchor');
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    sendInvitations(): void {
        alert('Funcionalidad de invitaciones en desarrollo. Se enviarán correos a los usuarios seleccionados.');
    }

    startChampionship(): void {
        if (confirm('¿Estás seguro de iniciar el campeonato? Esto cambiará el estado a EN CURSO.')) {
            // Mock logic
            this.campeonato.estadoReal = 'EN CURSO';
        }
    }

    volverAtras(): void {
        const fallback = this.isOwner() ? '/mis-campeonatos' : '/campeonatos';
        this.backNav.backOr({ fallbackUrl: fallback });
    }

    editarCampeonato(): void {
        this.router.navigate(['/campeonato/edit', this.id]);
    }

    verInscripciones(): void {
        this.router.navigate(['/campeonato/inscriptions', this.id]);
    }

    private calculateStatus(fechaInicio: string, fechaFin: string | undefined): string {
        if (!fechaInicio) return 'PLANIFICADO';

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const parseLocalDate = (dateStr: string): Date => {
            if (!dateStr) return new Date();
            const parts = dateStr.split('T')[0].split('-');
            if (parts.length === 3) {
                return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            }
            return new Date(dateStr);
        };

        const startCompare = parseLocalDate(fechaInicio);
        startCompare.setHours(0, 0, 0, 0);

        const endCompare = fechaFin ? parseLocalDate(fechaFin) : new Date(startCompare);
        endCompare.setHours(23, 59, 59, 999);

        if (now < startCompare) return 'PLANIFICADO';
        if (now > endCompare) return 'TERMINADO';
        return 'ACTIVO';
    }



    copiarCodigo(): void {
        const codeToCopy = this.campeonato?.Codigo || this.campeonato?.codigo;
        if (!codeToCopy) return;

        navigator.clipboard.writeText(codeToCopy).then(() => {
            this.copiado = true;
            setTimeout(() => this.copiado = false, 2000);
        });
    }

    eliminarCampeonato(): void {
        this.mostrarModalEliminar = true;
        this.scrollLock.lock();
    }

    cerrarModalEliminar(): void {
        this.mostrarModalEliminar = false;
        this.eliminando = false;
        this.scrollLock.unlock();
    }

    confirmarEliminar(): void {
        if (!this.id) return;
        this.eliminando = true;
        this.api.deleteCampeonato(this.id).subscribe({
            next: () => {
                this.cerrarModalEliminar();
                this.navHistory.removeLastUrl();
                this.router.navigate(['/mis-campeonatos']);
            },
            error: (err) => {
                console.error('Error al eliminar campeonato:', err);
                this.eliminando = false;
                this.cerrarModalEliminar();
                this.navHistory.removeLastUrl();
                this.router.navigate(['/mis-campeonatos']);
            }
        });
    }

    ngOnDestroy(): void {
        this.scrollLock.unlock();
    }

    toggleSection(section: 'info' | 'judges' | 'participants'): void {
        switch (section) {
            case 'info': this.isInfoExpanded = !this.isInfoExpanded; break;
            case 'judges': this.isJudgesExpanded = !this.isJudgesExpanded; break;
            case 'participants': this.isParticipantsExpanded = !this.isParticipantsExpanded; break;
        }
    }

    toggleMobileFilters(): void {
        this.showMobileFilters = !this.showMobileFilters;
    }

    toggleMobileActions(): void {
        this.showMobileActions = !this.showMobileActions;
    }

    setActiveTab(tab: 'info' | 'participants' | 'results'): void {
        this.activeTab = tab;
    }

    filterJueces(): void {
        const query = this.juezSearchQuery.toLowerCase().trim();
        this.filteredJueces = this.jueces.filter(j =>
            !query || j.nombre.toLowerCase().includes(query) ||
            (j.rol && j.rol.toLowerCase().includes(query)) ||
            (j.categoria && j.categoria.toLowerCase().includes(query))
        );
        this.juecesPage = 1;
        this.updateJuecesPagination();
    }

    updateJuecesPagination(): void {
        this.totalJuecesPages = Math.ceil(this.filteredJueces.length / this.juecesPerPage) || 1;
        if (this.juecesPage > this.totalJuecesPages) this.juecesPage = 1;

        const startIndex = (this.juecesPage - 1) * this.juecesPerPage;
        const endIndex = startIndex + this.juecesPerPage;
        this.paginatedJueces = this.filteredJueces.slice(startIndex, endIndex);
    }

    prevJuecesPage(): void {
        if (this.juecesPage > 1) {
            this.juecesPage--;
            this.updateJuecesPagination();
            this.scrollToJudgesSearch();
        }
    }

    nextJuecesPage(): void {
        if (this.juecesPage < this.totalJuecesPages) {
            this.juecesPage++;
            this.updateJuecesPagination();
            this.scrollToJudgesSearch();
        }
    }

    private scrollToJudgesSearch() {
        // No hacer scroll en escritorio (ancho > 768px)
        if (window.innerWidth > 768) {
            return;
        }

        // Hacer scroll al encabezado de la sección en lugar del campo de búsqueda
        const element = document.getElementById('judges-section-anchor');
        if (element) {
            // Usar un pequeño offset si es posible, scrollIntoView es estándar
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}
