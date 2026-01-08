import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {
  username: string | null = null;
  private sub?: Subscription;

  constructor(private auth: AuthService) {}

  ngOnInit(): void {
    // Inicial
    this.auth.refreshFromSession();
    // Suscribirse a cambios reactivos de autenticación
    this.sub = this.auth.username$.subscribe(u => {
      if (u) {
        this.username = u;
      } else {
        // Si no hay username, caer a correo si existe
        const correo = sessionStorage.getItem('correo');
        const token = sessionStorage.getItem('token');
        this.username = correo || (token ? 'usuario' : null);
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
