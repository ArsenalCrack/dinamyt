import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { delay } from 'rxjs/operators';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { AssignJudgesComponent } from './assign-judges/assign-judges.component';
import { SectionCompetitorsComponent } from './section-competitors/section-competitors.component';
import { DemographicGroup, LiveManagementService } from './live-management.service';

interface Competidor {
  id: string;
  nombre: string;
  academia: string;
  cinturon?: string;
  peso?: string;
  genero?: string;
  edad?: number;
  estado?: string;
}

// Estado interno del Tatami
interface Tatami {
  id: number;
  nombre: string;
  estado: 'FREE' | 'BUSY';

  // Nueva Estructura
  grupoActual?: DemographicGroup;
  colaModalidades?: string[]; // Lista de IDs de modalidades a ejecutar (Ordenada)
  modalidadActualId?: string; // El ID específico en ejecución (ej: "COMBATES-...")
  estadoModalidad?: 'READY' | 'RUNNING' | 'FINISHED'; // Estado de la modalidad actual dentro del tatami

  // Cola futura (Pipelining)
  siguienteGrupo?: DemographicGroup;

  jueces?: string[];
  juecesAsignados?: any;
}

export interface GrupoSeleccionable extends DemographicGroup {
  tatamiOrigenId?: number;
  esParcial?: boolean;
  modalidadARobar?: string;
}

@Component({
  selector: 'app-live-tournament',
  standalone: true,
  imports: [CommonModule, RouterModule, LoadingSpinnerComponent, AssignJudgesComponent, SectionCompetitorsComponent],
  templateUrl: './live-tournament.component.html',
  styleUrl: './live-tournament.component.scss'
})
export class LiveTournamentComponent implements OnInit {
  idCampeonato: string | null = null;
  nombreCampeonato: string = 'Cargando...';

  // Estado
  gruposDisponibles: DemographicGroup[] = [];
  modalidadesFinalizadas: any[] = []; // Historial
  tatamis: Tatami[] = [];

  // Mapas de datos activos (ID -> Detalles)
  mapaCompetidores = new Map<string, Competidor[]>(); // seccion_activa_id -> competidores

  tatamiAsignarJuecesActual: Tatami | null = null;
  seccionVistaActualId: string | null = null; // ID de la sección de modalidad específica a visualizar

  mostrarSelectorGrupo = false;
  tatamiObjetivoSeleccion: Tatami | null = null;

  totalActivas = 0;
  cargando = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
    private scrollLock: ScrollLockService,
    private liveService: LiveManagementService
  ) { }

  ngOnInit(): void {
    this.idCampeonato = this.route.snapshot.paramMap.get('id');
    this.scrollLock.lock();
    this.cargarDatosCampeonato();
    this.cargarDatosGestionEnVivo();
  }

  cargarDatosCampeonato() {
    if (!this.idCampeonato) return;
    this.api.getCampeonatoById(this.idCampeonato).subscribe({
      next: (data) => {
        this.nombreCampeonato = data.nombre || data.nombreEvento;
      },
      error: (e) => console.error('Error cargando detalles del campeonato', e)
    });
  }

  cargarDatosGestionEnVivo() {
    if (!this.idCampeonato) return;
    this.cargando = true;

    this.api.getLiveManagement(this.idCampeonato)
      .pipe(delay(1500))
      .subscribe({
        next: (data) => {
          if (data && data.campeonato) {
            this.procesarDatosBackend(data);
          } else {
            console.warn('Backend retornó estructura vacía/inválida, usando datos de prueba.');
            this.inicializarDatosPrueba();
          }
          this.cargando = false;
          this.scrollLock.unlock();
        },
        error: (e) => {
          console.warn('Error obteniendo datos en vivo, usando datos de prueba.', e);
          this.inicializarDatosPrueba();
          this.cargando = false;
          this.scrollLock.unlock();
        }
      });
  }

  procesarDatosBackend(data: any) {
    // 1. Configurar Tatamis
    const numTatamis = data.campeonato.numTatamis || 1;
    this.tatamis = [];
    for (let i = 1; i <= numTatamis; i++) {
      this.tatamis.push({ id: i, nombre: `Tatami ${i}`, estado: 'FREE' });
    }

    // 2. Extraer datos de competidores (Mapeo ID Sección -> Lista de Competidores)
    this.mapaCompetidores.clear();
    const calcularEdad = (fechaNac: string) => {
      if (!fechaNac) return 0;
      const nacimiento = new Date(fechaNac);
      const hoy = new Date();
      let edad = hoy.getFullYear() - nacimiento.getFullYear();
      const m = hoy.getMonth() - nacimiento.getMonth();
      if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) {
        edad--;
      }
      return edad;
    };

    const extraer = (datosGrupo: any) => {
      if (!datosGrupo) return;
      Object.keys(datosGrupo).forEach(modalidad => {
        const usuarios = datosGrupo[modalidad];
        if (Array.isArray(usuarios)) {
          usuarios.forEach((u: any) => {
            const seccionId = (u.secciones && u.secciones.length > 0) ? u.secciones[0] : 'DESCONOCIDO';
            if (!this.mapaCompetidores.has(seccionId)) {
              this.mapaCompetidores.set(seccionId, []);
            }
            this.mapaCompetidores.get(seccionId)?.push({
              id: u.idDocumento,
              nombre: u.nombreC,
              academia: u.academia || 'Sin Academia',
              cinturon: u.cinturonRango,
              peso: u.peso,
              genero: u.sexo,
              edad: calcularEdad(u.fechaNacimiento),
              estado: u.estado || 'INSCRITO'
            });
          });
        }
      });
    };

    if (data.individuales) {
      extraer(data.individuales.masculinos);
      extraer(data.individuales.femeninos);
    }
    extraer(data.mixtos);

    // 3. Procesar secciones mediante el servicio
    const reglasSeciones = this.liveService.parseSecciones(data.campeonato.secciones);
    const seccionesActivas = this.liveService.parseSeccionesActivas(data.campeonato.seccionesActivas);

    this.gruposDisponibles = this.liveService.processSecciones(reglasSeciones, seccionesActivas, this.mapaCompetidores);
    this.totalActivas = this.gruposDisponibles.reduce((acc, g) => acc + g.activeModalities.length, 0);
  }

  // --- Acciones de UI ---

  // Interfaz auxiliar para selección
  gruposFiltradosParaSeleccion: GrupoSeleccionable[] = [];

  abrirSelectorGrupo(tatami: Tatami) {
    const totalTatamis = this.tatamis.length;
    const esUltimo = tatami.id === totalTatamis;
    const esPenultimo = tatami.id === totalTatamis - 1;
    const esTatamiSalto = esUltimo || esPenultimo;

    if (tatami.estado === 'BUSY') {
      if (esTatamiSalto) return;
      if (tatami.siguienteGrupo) return; // Ya tiene cola
    }

    this.tatamiObjetivoSeleccion = tatami;
    this.gruposFiltradosParaSeleccion = [];

    // 1. Obtener grupos disponibles estándar
    let candidatos: GrupoSeleccionable[] = [...this.gruposDisponibles];

    // 2. Si NO hay grupos estándar, buscar elementos "robables"
    if (candidatos.length === 0) {

      // A. Buscar "Grupos en cola siguiente" (Grupos completos esperando)
      this.tatamis.forEach(t => {
        if (t.id !== tatami.id && t.siguienteGrupo) {
          candidatos.push({ ...t.siguienteGrupo, tatamiOrigenId: t.id });
        }
      });

      // B. Buscar "Modalidades pendientes" en grupos OCUPADOS (Dividir grupos activos)
      this.tatamis.forEach(t => {
        if (t.id !== tatami.id && t.estado === 'BUSY' && t.grupoActual && t.colaModalidades && t.colaModalidades.length > 1) {
          const siguienteModalidadId = t.colaModalidades[1];
          if (siguienteModalidadId) {
            candidatos.push({
              ...t.grupoActual,
              activeModalities: [siguienteModalidadId],
              tatamiOrigenId: t.id,
              esParcial: true,
              modalidadARobar: siguienteModalidadId
            });
          }
        }
      });
    }

    if (totalTatamis < 2) {
      this.gruposFiltradosParaSeleccion = candidatos;
    } else {
      // Lógica de filtro estricto
      this.gruposFiltradosParaSeleccion = candidatos.filter(grupo => {
        const tipo = this.liveService.getDemographicType(grupo);

        if (esUltimo) return tipo === 'SALTO_ALTO';
        if (esPenultimo) return tipo === 'SALTO_LARGO';

        return tipo === 'GENERAL';
      });
    }

    this.mostrarSelectorGrupo = true;
    this.scrollLock.lock();
  }

  cerrarSelectorGrupo() {
    this.mostrarSelectorGrupo = false;
    this.tatamiObjetivoSeleccion = null;
    this.gruposFiltradosParaSeleccion = [];
    this.scrollLock.unlock();
  }

  seleccionarGrupo(grupo: GrupoSeleccionable) {
    if (!this.tatamiObjetivoSeleccion) return;

    const tatami = this.tatamiObjetivoSeleccion;

    // A. Limpiar fuente si fue robado
    if (grupo.tatamiOrigenId) {
      const tatamiOrigen = this.tatamis.find(t => t.id === grupo.tatamiOrigenId);

      if (tatamiOrigen) {
        if (grupo.esParcial && grupo.modalidadARobar) {
          if (tatamiOrigen.colaModalidades) {
            tatamiOrigen.colaModalidades = tatamiOrigen.colaModalidades.filter(m => m !== grupo.modalidadARobar);
          }
        } else if (tatamiOrigen.siguienteGrupo && tatamiOrigen.siguienteGrupo.id === grupo.id) {
          tatamiOrigen.siguienteGrupo = undefined;
        }
      }
    } else {
      // B. Remover de la lista disponible si era estándar
      this.gruposDisponibles = this.gruposDisponibles.filter(g => g.id !== grupo.id);
    }

    // Asignar al objetivo
    if (tatami.estado === 'FREE') {
      tatami.grupoActual = grupo;
      tatami.colaModalidades = [...grupo.activeModalities];
      tatami.estado = 'BUSY';
      this.avanzarCola(tatami);
    } else {
      tatami.siguienteGrupo = grupo;
    }

    this.cerrarSelectorGrupo();
  }

  avanzarCola(tatami: Tatami) {
    if (!tatami.colaModalidades) return;

    if (tatami.colaModalidades.length > 0) {
      tatami.modalidadActualId = tatami.colaModalidades[0];
      tatami.estadoModalidad = 'READY';
    } else {
      // Terminaron todas las modalidades del grupo actual

      // Verificar grupo en pipeline
      if (tatami.siguienteGrupo) {
        tatami.grupoActual = tatami.siguienteGrupo;
        tatami.colaModalidades = [...tatami.siguienteGrupo.activeModalities];
        tatami.siguienteGrupo = undefined;

        this.avanzarCola(tatami); // Iniciar primera modalidad del nuevo grupo
      } else {
        // Realmente libre
        tatami.estado = 'FREE';
        tatami.grupoActual = undefined;
        tatami.modalidadActualId = undefined;
        tatami.colaModalidades = undefined;
        tatami.estadoModalidad = undefined;
      }
    }
  }

  iniciarModalidadActual(tatami: Tatami) {
    if (!tatami.modalidadActualId || !this.idCampeonato) return;

    tatami.estadoModalidad = 'RUNNING';

    this.api.startSection(this.idCampeonato, tatami.modalidadActualId).subscribe({
      error: (e) => console.warn('Falló la actualización en backend', e)
    });
  }

  finalizarModalidadActual(tatami: Tatami) {
    if (!tatami.modalidadActualId || !tatami.colaModalidades) return;

    if (confirm('¿Finalizar esta modalidad y pasar a la siguiente?')) {
      const idFinalizada = tatami.modalidadActualId;

      if (this.idCampeonato) {
        this.api.finishSection(this.idCampeonato, idFinalizada).subscribe();
      }

      this.modalidadesFinalizadas.unshift({
        id: idFinalizada,
        name: this.formatearNombreModalidad(idFinalizada),
        tatamiId: tatami.id
      });

      // Remover actual de la cola
      tatami.colaModalidades.shift();

      // Cargar siguiente
      this.avanzarCola(tatami);
    }
  }

  desasignarGrupo(tatami: Tatami) {
    if (!this.idCampeonato) return;
    if (confirm('¿Estás seguro de cancelar la asignación actual? El Tatami quedará LIBRE.')) {
      this.api.unassignTatami(this.idCampeonato, tatami.id).subscribe({
        next: () => {
          tatami.estado = 'FREE';
          tatami.grupoActual = undefined;
          tatami.colaModalidades = undefined;
          tatami.modalidadActualId = undefined;
          tatami.estadoModalidad = 'READY';
          tatami.juecesAsignados = undefined;
        },
        error: (e) => alert('Error al desasignar')
      });
    }
  }

  enviarResultados(tatami: Tatami) {
    if (!tatami.modalidadActualId || !this.idCampeonato) return;

    const confirmacionAdmin = confirm(`Administrador: ¿Está listo para registrar y revisar los resultados de: ${this.formatearNombreModalidad(tatami.modalidadActualId)}?`);
    if (!confirmacionAdmin) return;

    const resultadosJuez = {
      detalles: 'Estos resultados han sido verificados por el Juez Central',
      estado: 'FINALIZADO_REVISADO'
    };

    if (confirm('¿Los resultados son correctos? Al confirmar, se guardarán y se mostrarán al PÚBLICO.')) {
      this.api.enviarResultadosSeccion(this.idCampeonato, tatami.modalidadActualId, resultadosJuez).subscribe({
        next: () => alert('Resultados publicados correctamente.'),
        error: (e) => alert('Error al publicar resultados.')
      });
    }
  }

  gestionarCompetidores(tatami: Tatami) {
    alert(`Aquí se gestionará la asistencia/check-in para: ${this.obtenerNombreModalidadPrincipal(tatami.grupoActual!)}`);
  }

  // --- Helpers ---

  obtenerTituloGrupo(grupo: DemographicGroup): string {
    return this.liveService.formatDemographicName(grupo);
  }

  formatearNombreModalidad(idCompleto: string): string {
    if (!idCompleto) return '';
    const partes = idCompleto.split('-');
    return partes[0].replace(/_/g, ' ');
  }

  // Usado en HTML para obtener competidores de la modalidad en curso
  obtenerCompetidoresModalidad(idCompleto: string | undefined): Competidor[] {
    if (!idCompleto) return [];
    return this.mapaCompetidores.get(idCompleto) || [];
  }

  obtenerNombreModalidadPrincipal(grupo: DemographicGroup): string {
    if (!grupo || !grupo.activeModalities || grupo.activeModalities.length === 0) {
      return 'Grupo';
    }
    const primera = grupo.activeModalities[0];
    if (!primera) return 'Grupo';
    return primera.split('-')[0].replace(/_/g, ' ');
  }



  // --- Métodos legacy / requeridos ---

  salir(): void {
    this.router.navigate(['/campeonato/panel', this.idCampeonato]);
  }

  asignarJueces(tatami: Tatami) {
    this.tatamiAsignarJuecesActual = tatami;
    this.scrollLock.lock();
  }

  onJuecesAsignados(resultado: any) {
    if (this.tatamiAsignarJuecesActual && this.idCampeonato) {
      const payload = {
        central: resultado.central?.id,
        table: resultado.table?.id,
        normal: resultado.normal?.map((j: any) => j.id) || []
      };
      this.api.assignJudgesToTatami(this.idCampeonato, this.tatamiAsignarJuecesActual.id, payload).subscribe({
        next: () => {
          const listaJueces = [];
          if (resultado.central) listaJueces.push(resultado.central.nombre);
          if (resultado.table) listaJueces.push(resultado.table.nombre);
          if (resultado.normal) listaJueces.push(...resultado.normal.map((j: any) => j.nombre));

          this.tatamiAsignarJuecesActual!.jueces = listaJueces;
          this.tatamiAsignarJuecesActual!.juecesAsignados = resultado;
          this.cerrarModalAsignar();
        }
      });
    } else {
      this.cerrarModalAsignar();
    }
  }

  cerrarModalAsignar() {
    this.tatamiAsignarJuecesActual = null;
    this.scrollLock.unlock();
  }

  verCompetidores(seccionId: string | undefined) {
    if (!seccionId) return;
    this.seccionVistaActualId = seccionId;
    this.scrollLock.lock();
  }

  cerrarVistaCompetidores() {
    this.seccionVistaActualId = null;
    this.scrollLock.unlock();
  }

  verResultados(item: any) {
    if (!item || !item.id) return;
    this.verCompetidores(item.id);
  }

  // Getter para el componente de vista
  get objetoSeccionVistaActual(): any {
    if (!this.seccionVistaActualId) return null;
    return {
      id: this.seccionVistaActualId,
      name: this.formatearNombreModalidad(this.seccionVistaActualId),
      category: 'Detalle',
      competitors: this.obtenerCompetidoresModalidad(this.seccionVistaActualId) || []
    };
  }

  inicializarDatosPrueba() {
    this.tatamis = [
      { id: 1, nombre: 'Tatami 1', estado: 'FREE' },
      { id: 2, nombre: 'Tatami 2', estado: 'FREE' }
    ];
    this.gruposDisponibles = [{
      id: 'mock1',
      edad: '10-12',
      peso: '30-40',
      cinturon: 'Blanco',
      genero: 'Mixto',
      activeModalities: ['KATA-MOCK', 'COMBATE-MOCK']
    }];
  }
}
