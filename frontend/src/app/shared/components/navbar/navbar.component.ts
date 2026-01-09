import { Component, OnInit, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { filter, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit, OnDestroy {
  username: string | null = null;
  isLoggedIn = false;
  loading = true;
  loggingOut = false;
  showUserDropdown = false;
  usuario: any;
  private destroy$ = new Subject<void>();

  constructor(private api: ApiService, private router: Router, private auth: AuthService) {
    // Escuchar cambios de navegación para actualizar el estado
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.checkLoginStatus();
    });
  }

  ngOnInit(): void {
    this.checkLoginStatus();
    if (this.isLoggedIn) {
      this.usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
      if (!this.username && this.usuario?.nombreC) {
        this.username = this.usuario.nombreC;
        sessionStorage.setItem('nombreC', this.usuario.nombreC);
      }
    }
    
    this.auth.isLoggedIn$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(isLoggedIn => {
      this.isLoggedIn = isLoggedIn;
      if (!isLoggedIn) {
        this.username = null;
        this.usuario = null;
      }
    });

    this.auth.username$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(username => {
      this.username = username || sessionStorage.getItem('nombreC') || this.usuario?.nombreC || null;
    });

    this.api.getCurrentUser(this.usuario).subscribe({
      next: (u: any) => {
        const storedName = sessionStorage.getItem('nombreC');
        this.username = u?.nombreC || storedName || this.usuario?.nombreC || null;
        if (u?.nombreC && !storedName) {
          sessionStorage.setItem('nombreC', u.nombreC);
        }
        this.isLoggedIn = true;
        this.auth.setLoggedIn(true, this.username);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  private lockScroll() { document.body.style.overflow = 'hidden'; }
  private unlockScroll() { document.body.style.overflow = ''; }

  ngOnDestroy(): void {
    this.unlockScroll();
    this.destroy$.next();
    this.destroy$.complete();
  }

  checkLoginStatus(): void {
    this.username = sessionStorage.getItem('nombreC') || this.usuario?.nombreC || null;
    const token = sessionStorage.getItem('token') || sessionStorage.getItem('authToken');
    const correo = sessionStorage.getItem('correo');
    this.isLoggedIn = !!(token || this.username || correo);
    this.auth.setLoggedIn(this.isLoggedIn, this.username);
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
    this.lockScroll();
    
    // Limpiar datos inmediatamente
    sessionStorage.clear();
    localStorage.removeItem('usuario');
    
    // Actualizar estado local inmediatamente
    this.username = null;
    this.isLoggedIn = false;
    this.usuario = null;
    
    // Notificar al AuthService inmediatamente
    this.auth.setLoggedIn(false, null);
    
    // Navegar después de 500ms (solo para mostrar overlay)
    setTimeout(() => {
      this.loggingOut = false;
      this.unlockScroll();
      this.router.navigate(['/']);
    }, 500);
  }
}
