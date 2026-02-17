import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './not-found.component.html',
  styleUrls: ['./not-found.component.scss']
})
export class NotFoundComponent {
  private router = inject(Router);
  private auth = inject(AuthService);

  readonly estaLogueado = this.auth.isLoggedIn();

  irAlInicio(): void {
    this.router.navigate(['/']);
  }

  irAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  irAlLogin(): void {
    this.router.navigate(['/login']);
  }
}
