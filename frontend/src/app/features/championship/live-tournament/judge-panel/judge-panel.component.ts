
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../../../core/services/api.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { interval, Subscription } from 'rxjs';

@Component({
    selector: 'app-judge-panel',
    standalone: true,
    imports: [CommonModule, LoadingSpinnerComponent],
    templateUrl: './judge-panel.component.html',
    styleUrls: ['./judge-panel.component.scss']
})
export class JudgePanelComponent implements OnInit, OnDestroy {
    championshipId: string | null = null;
    loading = true;
    errorMessage: string | null = null;

    // Status
    assignedTatami: any = null;
    currentSection: any = null;
    role: string = 'Juez'; // Can be 'Central', 'Mesa', 'Esquina'

    // Scoring / Combat
    competitorRed: any = null;
    competitorBlue: any = null;
    scores: { red: number, blue: number } = { red: 0, blue: 0 };

    pollingSubscription: Subscription | null = null;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private api: ApiService
    ) { }

    ngOnInit(): void {
        this.championshipId = this.route.snapshot.paramMap.get('id');
        if (!this.championshipId) {
            this.errorMessage = 'Campeonato no válido';
            this.loading = false;
            return;
        }

        this.checkAssignment();

        // Poll for updates every 5 seconds (to check for new matches/sections)
        this.pollingSubscription = interval(5000).subscribe(() => {
            this.refreshStatus();
        });
    }

    ngOnDestroy(): void {
        if (this.pollingSubscription) {
            this.pollingSubscription.unsubscribe();
        }
    }

    checkAssignment() {
        this.loading = true;
        // Mock API call - in real scenario, call backend to get judge status
        // this.api.getJudgeAssignment(this.championshipId).subscribe(...)

        // Simulate API delay
        setTimeout(() => {
            // Mock data
            this.loading = false;
            // Logic to simulate assignment. In real app, response will tell us where we are.
            this.assignedTatami = { id: 1, name: 'Tatami 1' };
            this.role = 'Juez Central';

            this.currentSection = {
                id: 'sec-123',
                name: 'Kumite Masculino -75kg',
                category: 'Cinturón Negro',
                status: 'RUNNING'
            };

            this.competitorRed = { name: 'Juan Pérez', academy: 'Dojo Cobra' };
            this.competitorBlue = { name: 'Carlos Díaz', academy: 'Eagle M.A.' };
        }, 1000);
    }

    refreshStatus() {
        // Background refresh
        console.log('Refreshing judge status...');
        // logic to update current match score or status
    }

    addPoint(color: 'red' | 'blue', points: number) {
        if (color === 'red') this.scores.red += points;
        else this.scores.blue += points;

        if (this.currentSection && this.championshipId) {
            this.api.updateMatchScore(this.championshipId, 'current-match', this.scores).subscribe({
                next: () => console.log('Score updated'),
                error: (e) => console.error('Error updating score', e)
            });
        }
    }

    goBack() {
        this.router.navigate(['/mis-inscripciones']);
    }
}
