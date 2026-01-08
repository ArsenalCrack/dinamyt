import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterModule], // Importante para usar *ngIf
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterComponent implements OnInit, OnDestroy {

  private api = inject(ApiService);
  private auth = inject(AuthService);
  estadoBackend: string = 'Comprobando...';
  isLoggedIn: boolean = false;
  private subscription?: Subscription;

  ngOnInit() {
    this.api.getSaludo().subscribe({
      next: (data) => { this.estadoBackend = 'Online'; },
      error: () => { this.estadoBackend = 'Offline'; }
    });

    // Suscribirse al estado de autenticación
    this.subscription = this.auth.isLoggedIn$.subscribe(
      logged => this.isLoggedIn = logged
    );
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }
}
