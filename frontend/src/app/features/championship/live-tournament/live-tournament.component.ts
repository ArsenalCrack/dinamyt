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

interface Competitor {
  id: string;
  name: string;
  academy: string;
  belt?: string;
  weight?: string;
  gender?: string;
  age?: number;
  status?: string;
}

// Internal Tatami State
interface Tatami {
  id: number;
  name: string;
  status: 'FREE' | 'BUSY';

  // New Structure
  currentGroup?: DemographicGroup;
  modalityQueue?: string[]; // The list of modality IDs to run (Sorted)
  currentModalityId?: string; // The specific ID currently running (e.g. "COMBATES-...")
  statusModality?: 'READY' | 'RUNNING' | 'FINISHED'; // State of the current modality within the tatami

  // Future Queue (Pipelining)
  nextGroup?: DemographicGroup;

  judges?: string[];
  assignedJudges?: any;
}

@Component({
  selector: 'app-live-tournament',
  standalone: true,
  imports: [CommonModule, RouterModule, LoadingSpinnerComponent, AssignJudgesComponent, SectionCompetitorsComponent],
  templateUrl: './live-tournament.component.html',
  styleUrl: './live-tournament.component.scss'
})
export class LiveTournamentComponent implements OnInit {
  championshipId: string | null = null;
  championshipName: string = 'Cargando...';

  // State
  availableGroups: DemographicGroup[] = [];
  finishedModalities: any[] = []; // Just history log
  tatamis: Tatami[] = [];

  // Active Data Holders (Mapping ID -> Details)
  allCompetitorsMap = new Map<string, Competitor[]>(); // active_section_id -> competitors

  currentAssignTatami: Tatami | null = null;
  currentViewSectionId: string | null = null; // ID of the specific modality section to view

  showGroupSelector = false;
  targetTatamiForSelection: Tatami | null = null;

  totalActive = 0;
  loading = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
    private scrollLock: ScrollLockService,
    private liveService: LiveManagementService
  ) { }

  ngOnInit(): void {
    this.championshipId = this.route.snapshot.paramMap.get('id');
    this.scrollLock.lock();
    this.loadChampionshipData();
    this.loadLiveManagementData();
  }

  loadChampionshipData() {
    if (!this.championshipId) return;
    this.api.getCampeonatoById(this.championshipId).subscribe({
      next: (data) => {
        this.championshipName = data.nombre || data.nombreEvento;
      },
      error: (e) => console.error('Error loading championship details', e)
    });
  }

  loadLiveManagementData() {
    if (!this.championshipId) return;
    this.loading = true;

    this.api.getLiveManagement(this.championshipId)
      .pipe(delay(1500))
      .subscribe({
        next: (data) => {
          if (data && data.campeonato) {
            this.processBackendData(data);
          } else {
            console.warn('Backend returned empty/invalid structure, using mocks.');
            this.initMockData();
          }
          this.loading = false;
          this.scrollLock.unlock();
        },
        error: (e) => {
          console.warn('Error fetching live data, using mocks.', e);
          this.initMockData();
          this.loading = false;
          this.scrollLock.unlock();
        }
      });
  }

  processBackendData(data: any) {
    // 1. Setup Tatamis
    const numTatamis = data.campeonato.numTatamis || 1;
    this.tatamis = [];
    for (let i = 1; i <= numTatamis; i++) {
      this.tatamis.push({ id: i, name: `Tatami ${i}`, status: 'FREE' });
    }

    // 2. Extract Data for Competitors (Mapping Section ID -> Competitor List)
    this.allCompetitorsMap.clear();
    const getAge = (dob: string) => {
      if (!dob) return 0;
      const birth = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      return age;
    };

    const extract = (groupData: any) => {
      if (!groupData) return;
      Object.keys(groupData).forEach(modality => {
        const users = groupData[modality];
        if (Array.isArray(users)) {
          users.forEach((u: any) => {
            const sectionId = (u.secciones && u.secciones.length > 0) ? u.secciones[0] : 'UNKNOWN';
            if (!this.allCompetitorsMap.has(sectionId)) {
              this.allCompetitorsMap.set(sectionId, []);
            }
            // Check if not already added to avoid duplicates if user is in multiple lists (shouldn't happen per modality)
            // But here we iterate modalities.
            this.allCompetitorsMap.get(sectionId)?.push({
              id: u.idDocumento,
              name: u.nombreC,
              academy: u.academia || 'Sin Academia',
              belt: u.cinturonRango,
              weight: u.peso,
              gender: u.sexo,
              age: getAge(u.fechaNacimiento),
              status: u.estado || 'INSCRITO'
            });
          });
        }
      });
    };

    if (data.individuales) {
      extract(data.individuales.masculinos);
      extract(data.individuales.femeninos);
    }
    extract(data.mixtos);

    // 3. Process Sections via Service
    const seccionesRules = this.liveService.parseSecciones(data.campeonato.secciones);
    const seccionesActivas = this.liveService.parseSeccionesActivas(data.campeonato.seccionesActivas);

    // Filter active sections to only those that actually have competitors or are valid
    // This is optional, but good for cleanup.
    // const relevantActiveSections = seccionesActivas; // Using all for now as strict whitelist 

    this.availableGroups = this.liveService.processSecciones(seccionesRules, seccionesActivas, this.allCompetitorsMap);
    this.totalActive = this.availableGroups.reduce((acc, g) => acc + g.activeModalities.length, 0);
  }

  // --- UI Actions ---

  filteredGroupsForSelection: DemographicGroup[] = [];

  openGroupSelector(tatami: Tatami) {
    // Allow if FREE OR (BUSY and no nextGroup and not a special Jump tatami)
    const totalTatamis = this.tatamis.length;
    const isLast = tatami.id === totalTatamis;
    const isPenultimate = tatami.id === totalTatamis - 1;
    const isJumpTatami = isLast || isPenultimate;

    // Rule: "This won't happen in jumps.. only in the rest".
    // So if Jump Tatami is BUSY, return.
    if (tatami.status === 'BUSY') {
      if (isJumpTatami) return;
      if (tatami.nextGroup) return; // Already queued
    }

    this.targetTatamiForSelection = tatami;

    if (totalTatamis < 2) {
      this.filteredGroupsForSelection = this.availableGroups;
    } else {
      // Strict Filter Logic
      this.filteredGroupsForSelection = this.availableGroups.filter(group => {
        const type = this.liveService.getDemographicType(group);

        if (isLast) return type === 'SALTO_ALTO';
        if (isPenultimate) return type === 'SALTO_LARGO';

        // If we are queuing for a "General" tatami, we still only want General groups
        return type === 'GENERAL';
      });
    }

    this.showGroupSelector = true;
    this.scrollLock.lock();
  }

  closeGroupSelector() {
    this.showGroupSelector = false;
    this.targetTatamiForSelection = null;
    this.filteredGroupsForSelection = [];
    this.scrollLock.unlock();
  }

  selectGroup(group: DemographicGroup) {
    if (!this.targetTatamiForSelection) return;

    const tatami = this.targetTatamiForSelection;

    // Remove from available list immediately
    this.availableGroups = this.availableGroups.filter(g => g.id !== group.id);

    if (tatami.status === 'FREE') {
      // Assign as Current
      tatami.currentGroup = group;
      tatami.modalityQueue = [...group.activeModalities];
      tatami.status = 'BUSY';
      this.advanceQueue(tatami);
    } else {
      // Queue as Next
      tatami.nextGroup = group;
    }

    this.closeGroupSelector();
  }

  advanceQueue(tatami: Tatami) {
    if (!tatami.modalityQueue) return;

    if (tatami.modalityQueue.length > 0) {
      // Peek next
      tatami.currentModalityId = tatami.modalityQueue[0];
      tatami.statusModality = 'READY';
    } else {
      // Finished all modalities in the CURRENT group

      // Check for Pipelined Group
      if (tatami.nextGroup) {
        tatami.currentGroup = tatami.nextGroup;
        tatami.modalityQueue = [...tatami.nextGroup.activeModalities];
        tatami.nextGroup = undefined;

        this.advanceQueue(tatami); // Start first modality of new group
      } else {
        // Really Free
        tatami.status = 'FREE';
        tatami.currentGroup = undefined;
        tatami.currentModalityId = undefined;
        tatami.modalityQueue = undefined;
        tatami.statusModality = undefined;
      }
    }
  }

  startCurrentModality(tatami: Tatami) {
    if (!tatami.currentModalityId || !this.championshipId) return;

    tatami.statusModality = 'RUNNING';

    // Use specific API
    this.api.startSection(this.championshipId, tatami.currentModalityId).subscribe({
      error: (e) => console.warn('Backend update failed', e)
    });
  }

  finishCurrentModality(tatami: Tatami) {
    if (!tatami.currentModalityId || !tatami.modalityQueue) return;

    if (confirm('¿Finalizar esta modalidad y pasar a la siguiente?')) {
      const finishedId = tatami.currentModalityId;

      if (this.championshipId) {
        // Use specific API
        this.api.finishSection(this.championshipId, finishedId).subscribe();
      }

      this.finishedModalities.unshift({
        id: finishedId,
        name: this.formatModalityName(finishedId),
        tatamiId: tatami.id
      });

      // Remove current from queue
      tatami.modalityQueue.shift();

      // Load next
      this.advanceQueue(tatami);
    }
  }

  unassignGroup(tatami: Tatami) {
    if (!this.championshipId) return;
    if (confirm('¿Estás seguro de cancelar la asignación actual? El Tatami quedará LIBRE.')) {
      this.api.unassignTatami(this.championshipId, tatami.id).subscribe({
        next: () => {
          // Reset Tatami locally
          tatami.status = 'FREE';
          tatami.currentGroup = undefined;
          tatami.modalityQueue = undefined;
          tatami.currentModalityId = undefined;
          tatami.statusModality = 'READY'; // or undefined
          tatami.assignedJudges = undefined; // If unassign clears judges too? Usually separate.
          // Judges usually stay assigned to Tatami, group is what leaves.
        },
        error: (e) => alert('Error al desasignar')
      });
    }
  }

  submitResults(tatami: Tatami) {
    // Placeholder for Results Modal
    alert(`Aquí se abrirá el modal para registrar resultados de: ${this.formatModalityName(tatami.currentModalityId!)}`);
    // this.api.submitSectionResults(...)
  }

  manageCompetitors(tatami: Tatami) {
    // Placeholder for Competitors Management (Check-in)
    alert(`Aquí se gestionará la asistencia/check-in para: ${this.getPrimaryModalityName(tatami.currentGroup!)}`);
  }

  // --- Helpers ---

  getFormatGroupTitle(group: DemographicGroup): string {
    return this.liveService.formatDemographicName(group);
  }

  formatModalityName(fullId: string): string {
    // e.g. "COMBATES-MASCULINO..." -> "Combates"
    if (!fullId) return '';
    const parts = fullId.split('-');
    // Replace underscores with spaces for readability
    return parts[0].replace(/_/g, ' ');
  }

  // Used in HTML to get competitors for the CURRENT running modality
  getCompetitorsForModality(fullId: string | undefined): Competitor[] {
    if (!fullId) return [];
    return this.allCompetitorsMap.get(fullId) || [];
  }

  getPrimaryModalityName(group: DemographicGroup): string {
    if (!group || !group.activeModalities || group.activeModalities.length === 0) {
      return 'Grupo';
    }
    // "COMBATES-MASCULINO..." -> "COMBATES" -> "COMBATES" (replace internal _ with space)
    const first = group.activeModalities[0];
    if (!first) return 'Grupo';
    return first.split('-')[0].replace(/_/g, ' ');
  }



  // --- Legacy / Required methods ---

  exit(): void {
    this.router.navigate(['/campeonato/panel', this.championshipId]);
  }

  assignJudges(tatami: Tatami) {
    this.currentAssignTatami = tatami;
    this.scrollLock.lock();
  }

  onJudgesAssigned(result: any) {
    if (this.currentAssignTatami && this.championshipId) {
      const payload = {
        central: result.central?.id,
        table: result.table?.id,
        normal: result.normal?.map((j: any) => j.id) || []
      };
      this.api.assignJudgesToTatami(this.championshipId, this.currentAssignTatami.id, payload).subscribe({
        next: () => {
          const judgesList = [];
          if (result.central) judgesList.push(result.central.nombre);
          if (result.table) judgesList.push(result.table.nombre);
          if (result.normal) judgesList.push(...result.normal.map((j: any) => j.nombre));

          this.currentAssignTatami!.judges = judgesList;
          this.currentAssignTatami!.assignedJudges = result;
          this.closeAssignModal();
        }
      });
    } else {
      this.closeAssignModal();
    }
  }

  closeAssignModal() {
    this.currentAssignTatami = null;
    this.scrollLock.unlock();
  }

  viewCompetitors(sectionId: string | undefined) {
    if (!sectionId) return;
    this.currentViewSectionId = sectionId;
    this.scrollLock.lock();
  }

  closeViewCompetitors() {
    this.currentViewSectionId = null;
    this.scrollLock.unlock();
  }

  // Getter for the view component
  get currentViewSectionObject(): any {
    if (!this.currentViewSectionId) return null;
    return {
      id: this.currentViewSectionId,
      name: this.formatModalityName(this.currentViewSectionId),
      category: 'Detalle',
      competitors: this.getCompetitorsForModality(this.currentViewSectionId) || []
    };
  }

  initMockData() {
    this.tatamis = [
      { id: 1, name: 'Tatami 1', status: 'FREE' },
      { id: 2, name: 'Tatami 2', status: 'FREE' }
    ];
    this.availableGroups = [{
      id: 'mock1',
      edad: '10-12',
      peso: '30-40',
      cinturon: 'Blanco',
      genero: 'Mixto',
      activeModalities: ['KATA-MOCK', 'COMBATE-MOCK']
    }];
  }
}
