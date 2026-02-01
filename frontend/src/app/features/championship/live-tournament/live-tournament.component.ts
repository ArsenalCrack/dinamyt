import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { delay } from 'rxjs/operators';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';

interface Competitor {
  id: string;
  name: string;
  academy: string;
}

interface Section {
  id: string;
  name: string; // e.g. "Kumite Male -75kg"
  category: string; // e.g. "Black Belt"
  competitors: Competitor[];
  status: 'PENDING' | 'READY' | 'RUNNING' | 'FINISHED';
  tatamiId?: number;
}

interface Tatami {
  id: number;
  name: string;
  status: 'FREE' | 'BUSY';
  currentSection?: Section;
}

@Component({
  selector: 'app-live-tournament',
  standalone: true,
  imports: [CommonModule, RouterModule, LoadingSpinnerComponent],
  templateUrl: './live-tournament.component.html',
  styleUrl: './live-tournament.component.scss'
})
export class LiveTournamentComponent implements OnInit {
  championshipId: string | null = null;
  championshipName: string = 'Cargando...';

  sectionsQueue: Section[] = [];
  finishedSections: Section[] = [];
  tatamis: Tatami[] = [];

  // Stats
  totalSections = 0;
  loading = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
    private scrollLock: ScrollLockService
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

    // Attempt to call the new API endpoint
    this.api.getLiveManagement(this.championshipId)
      .pipe(delay(1500))
      .subscribe({
        next: (data) => {
          // If backend were ready, we would map `data` to our local arrays.
          // Since it's likely 404/500 now or unimplemented, we might not reach here correctly yet.
          // Or if user mocks it in backend, we should use it.
          // For now, I'll log and use fallback if empty.
          console.log('Live Data:', data);
          if (data && data.tatamis) {
            this.tatamis = data.tatamis;
            this.sectionsQueue = data.queue || [];
            this.finishedSections = data.finished || [];
            this.totalSections = this.sectionsQueue.length + this.finishedSections.length +
              this.tatamis.filter(t => t.currentSection).length;
          } else {
            this.assignInitialSections();
          }
          this.loading = false;
          this.scrollLock.unlock();
        },
        error: (e) => {
          console.warn('Backend implementation for Live Management not found/ready, using mocks.', e);
          this.initMockData();
          this.assignInitialSections();
          this.loading = false;
          this.scrollLock.unlock();
        }
      });
  }

  exit(): void {
    this.router.navigate(['/campeonato/panel', this.championshipId]);
  }

  initMockData() {
    // Create 10 Tatamis
    for (let i = 1; i <= 10; i++) {
      this.tatamis.push({ id: i, name: `Tatami ${i}`, status: 'FREE' });
    }

    // Create 50 Mock Sections
    const modalities = ['Kumite', 'Kata', 'Kobudo', 'Defensa Personal'];
    const categories = ['Cinturón Negro', 'Cinturón Café', 'Cinturón Azul', 'Cinturón Verde', 'Cinturón Naranja', 'Cinturón Blanco'];
    const ages = ['Mayores (18-35)', 'Juvenil (15-17)', 'Cadetes (12-14)', 'Infantil (10-11)', 'Pre-Infantil (8-9)', 'Master (+35)'];
    const genders = ['Masculino', 'Femenino', 'Mixto'];

    for (let i = 1; i <= 50; i++) {
      const mod = modalities[Math.floor(Math.random() * modalities.length)];
      const cat = categories[Math.floor(Math.random() * categories.length)];
      const age = ages[Math.floor(Math.random() * ages.length)];
      const gen = genders[Math.floor(Math.random() * genders.length)];

      this.sectionsQueue.push({
        id: `sec-${i}`,
        name: `${mod} ${gen} - ${age}`,
        category: cat,
        competitors: this.generateCompetitors(Math.floor(Math.random() * 6) + 2),
        status: 'PENDING'
      });
    }
    this.totalSections = this.sectionsQueue.length;
    this.championshipName = 'Campeonato Demo (Mock)';
  }

  generateCompetitors(count: number): Competitor[] {
    const names = ['Santiago R.', 'Valentina M.', 'Juan P.', 'Carlos D.', 'Ana L.', 'Pedro S.', 'Laura G.', 'Miguel T.', 'Sofía V.', 'Andrés C.'];
    const academies = ['Dinamyt Central', 'Dojo Cobra', 'Tiger Academy', 'Eagle Martial Arts'];
    const list: Competitor[] = [];
    for (let i = 0; i < count; i++) {
      list.push({
        id: `comp-${Math.random().toString(36).substr(2, 9)}`,
        name: names[Math.floor(Math.random() * names.length)],
        academy: academies[Math.floor(Math.random() * academies.length)]
      });
    }
    return list;
  }

  assignInitialSections() {
    this.tatamis.forEach(tatami => {
      this.assignNextSection(tatami);
    });
  }

  assignNextSection(tatami: Tatami) {
    if (this.sectionsQueue.length > 0) {
      const section = this.sectionsQueue.shift()!;
      section.status = 'READY';
      section.tatamiId = tatami.id;

      tatami.status = 'BUSY';
      tatami.currentSection = section;
    } else {
      tatami.status = 'FREE';
      tatami.currentSection = undefined;
    }
  }

  startSection(tatami: Tatami) {
    if (tatami.currentSection && tatami.currentSection.status === 'READY') {
      tatami.currentSection.status = 'RUNNING';
    }
  }

  finishSection(tatami: Tatami) {
    if (tatami.currentSection && tatami.currentSection.status === 'RUNNING') {
      if (confirm(`¿Finalizar la sección en ${tatami.name}?`)) {
        const finished = tatami.currentSection;
        finished.status = 'FINISHED';
        this.finishedSections.unshift(finished);

        tatami.status = 'FREE';
        tatami.currentSection = undefined;
        this.assignNextSection(tatami);
      }
    }
  }
}
