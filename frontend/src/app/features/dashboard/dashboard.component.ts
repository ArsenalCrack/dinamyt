import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent {
  canCreate = false;
  username: string | null = null;
  hasMyChampionships = false;

  constructor(private apiService: ApiService) { }

  ngOnInit(): void {
    // Try to get a cached username first
    this.username = sessionStorage.getItem('username') || sessionStorage.getItem('userName');

    this.apiService.getCurrentUser().subscribe({
      next: (u: any) => {
        if (!this.username) {
          this.username = u?.username || u?.name || null;
        }
        // permission heuristics: backend may expose roles or explicit flags
        const roles: string[] = u?.roles || u?.authorities || [];
        if (Array.isArray(roles) && roles.length) {
          this.canCreate = roles.includes('ADMIN') || roles.includes('ROLE_ADMIN');
        }
        if (!this.canCreate) {
          this.canCreate = !!u?.canCreateChampionship;
        }

        // Detect if user has created championships
        const createdList = u?.myChampionships || u?.createdChampionships || u?.championships || null;
        if (Array.isArray(createdList)) {
          this.hasMyChampionships = createdList.length > 0;
        } else if (typeof u?.championshipsCount === 'number') {
          this.hasMyChampionships = u.championshipsCount > 0;
        } else if (typeof u?.createdCount === 'number') {
          this.hasMyChampionships = u.createdCount > 0;
        }
      },
      error: () => {
        // Keep defaults (hide create card)
      }
    });
  }
}
