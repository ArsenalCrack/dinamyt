import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit {
  username: string | null = null;
  isLoggedIn = false;
  loading = true;
  loggingOut = false;
  showUserDropdown = false;

  constructor(private api: ApiService, private router: Router, private auth: AuthService) {
    // Escuchar cambios de navegación para actualizar el estado
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.checkLoginStatus();
    });
  }

  ngOnInit(): void {
    this.checkLoginStatus();
    this.api.getCurrentUser().subscribe({
      next: (u: any) => {
        // Priorizar nombreC del backend o del sessionStorage
        const storedName = sessionStorage.getItem('username');
        this.username = u?.nombreC || storedName || u?.username || u?.name || u?.nombre || null;
        // Si el backend devuelve nombreC y no lo teníamos, guardarlo
        if (u?.nombreC && !storedName) {
          sessionStorage.setItem('username', u.nombreC);
        }
        this.isLoggedIn = true;
        this.auth.setLoggedIn(true, this.username);
        this.loading = false;
      },
      error: () => {
        // API may fail if no cookie/token; keep inferred state
        this.loading = false;
      }
    });
  }

  checkLoginStatus(): void {
    // Obtener el username que guardó el login (que contiene nombreC del registro)
    this.username = sessionStorage.getItem('username') || sessionStorage.getItem('userName');
    const token = sessionStorage.getItem('token') || sessionStorage.getItem('authToken');
    const correo = sessionStorage.getItem('correo');
    // consider user logged if token exists, username exists, or correo exists
    this.isLoggedIn = !!(token || this.username || correo);
    this.auth.setLoggedIn(this.isLoggedIn, this.username);

    console.log('checkLoginStatus - username capturado:', this.username);
    console.log('checkLoginStatus - correo:', correo);
    console.log('checkLoginStatus - isLoggedIn:', this.isLoggedIn);
  }

  toggleUserDropdown(): void {
    this.showUserDropdown = !this.showUserDropdown;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const clickedInside = target.closest('.user-menu-wrapper');
    if (!clickedInside && this.showUserDropdown) {
      this.closeDropdown();
    }
  }

  closeDropdown(): void {
    this.showUserDropdown = false;
  }

  goToProfile(): void {
    this.closeDropdown();
    this.router.navigate(['/perfil']);
  }

  logout(): void {
    this.closeDropdown();
    this.loggingOut = true;
    setTimeout(() => {
      sessionStorage.clear();
      this.username = null;
      this.isLoggedIn = false;
      this.loggingOut = false;
      this.auth.setLoggedIn(false, null);
      // Forzar actualización de Home si ya estamos en '/'
      const onHome = this.router.url === '/';
      if (onHome) {
        // disparar navegación simulada para refrescar bindings que dependan del router
        this.router.navigateByUrl('/dashboard', { skipLocationChange: true }).then(() => {
          this.router.navigate(['/']);
        });
      } else {
        this.router.navigate(['/']);
      }
    }, 1000);
  }
}
