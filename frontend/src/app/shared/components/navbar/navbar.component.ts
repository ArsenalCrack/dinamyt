import { Component, OnInit, HostListener, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { filter, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { delayRemaining } from '../../../core/utils/spinner-timing.util';
import { extractUserRoles } from '../../../core/utils/user-type.util';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, LoadingSpinnerComponent],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit, OnDestroy {
  @ViewChild('navbarCollapse', { read: ElementRef }) private navbarCollapseRef?: ElementRef<HTMLElement>;
  @ViewChild('navbarToggler', { read: ElementRef }) private navbarTogglerRef?: ElementRef<HTMLButtonElement>;

  username: string | null = null;
  isLoggedIn = false;
  loading = true;
  loggingOut = false;
  showUserDropdown = false;
  currentUrl = '';
  userType: number | null = null;
  usuario: any;
  private destroy$ = new Subject<void>();

  constructor(
    private api: ApiService,
    private router: Router,
    private auth: AuthService,
    private scrollLock: ScrollLockService
  ) {
    // Escuchar cambios de navegación para actualizar el estado
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.currentUrl = this.router.url || '';
      this.closeDropdown();
      this.closeMobileNavbar();
      this.checkLoginStatus();
    });
  }

  ngOnInit(): void {
    this.currentUrl = this.router.url || '';
    this.checkLoginStatus();

    // Cargar usuario cacheado (si existe) para poder armar /me correctamente.
    // Cargar usuario cacheado (si existe) para poder armar /me correctamente.
    const rawUsuario = localStorage.getItem('usuario');
    try {
      const parsed = rawUsuario ? JSON.parse(rawUsuario) : null;
      // Si el backend devuelve { usuario: {...}, instructor: ... }, extraemos usuario
      this.usuario = parsed?.usuario || parsed;
    } catch {
      this.usuario = null;
    }

    if (this.isLoggedIn) {
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
        this.userType = null;
      } else {
        // Redirigir a checkLoginStatus para asegurar sincronización
        this.checkLoginStatus();
      }
    });

    this.auth.roles$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(roles => {
      if (roles && roles.length > 0) {
        this.checkLoginStatus();
      }
    });

    this.auth.username$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(username => {
      this.username = username || sessionStorage.getItem('nombreC') || this.usuario?.nombreC || null;
    });

    // Evita llamar /me sin body: el backend responde 400 si request == null.
    const correo = (sessionStorage.getItem('correo') || this.usuario?.correo || '').trim();
    const idDocumento = this.usuario?.idDocumento ?? this.usuario?.id_documento ?? null;

    let meRequest = (this.usuario && Object.keys(this.usuario).length > 0)
      ? this.usuario
      : (correo ? { correo } : (idDocumento != null ? { idDocumento } : null));

    if (!meRequest) {
      this.loading = false;
      return;
    }

    const startedAt = Date.now();

    // Safety timeout to prevent infinite loading state
    const timeout = setTimeout(() => {
      if (this.loading) {
        console.warn('Navbar user load timed out');
        this.loading = false;
      }
    }, 5000);

    this.api.getCurrentUser(meRequest).subscribe({
      next: async (u: any) => {
        clearTimeout(timeout);
        const storedName = sessionStorage.getItem('nombreC');
        this.username = u?.nombreC || storedName || this.usuario?.nombreC || null;
        if (u?.nombreC && !storedName) {
          sessionStorage.setItem('nombreC', u.nombreC);
        }
        // Actualizar usuario local para tener la data fresca, incluyendo tipousuario
        this.usuario = u;
        localStorage.setItem('usuario', JSON.stringify(u));
        this.checkLoginStatus(); // Recalcular userType
        this.isLoggedIn = true;
        this.auth.setLoggedIn(true, this.username);

        await delayRemaining(startedAt);
        this.loading = false;
      },
      error: async () => {
        clearTimeout(timeout);
        await delayRemaining(startedAt);
        console.warn('Error loading user in navbar');
        this.loading = false;
        // Even on error, we might still be logged in via session
        this.checkLoginStatus();
      }
    });
  }

  private lockScroll() { this.scrollLock.lock(); }
  private unlockScroll() { this.scrollLock.unlock(); }

  ngOnDestroy(): void {
    this.unlockScroll();
    this.destroy$.next();
    this.destroy$.complete();
  }

  checkLoginStatus(): void {
    const rawUsuario = localStorage.getItem('usuario');
    try {
      const parsed = rawUsuario ? JSON.parse(rawUsuario) : null;
      this.usuario = parsed?.usuario || parsed;
    } catch {
      this.usuario = null;
    }

    this.username = sessionStorage.getItem('nombreC') || this.usuario?.nombreC || null;
    const token = sessionStorage.getItem('token') || sessionStorage.getItem('authToken');
    const correo = sessionStorage.getItem('correo');
    this.isLoggedIn = !!(token || this.username || correo);

    // Extract user type
    this.userType = null;
    if (this.usuario) {
      const roles = extractUserRoles(this.usuario);
      console.log('Roles detected:', roles);

      if (roles.includes('administrador') || roles.includes('admin_proyecto')) {
        this.userType = 3;
      } else if (roles.includes('dueño')) {
        this.userType = 4;
      } else if (roles.includes('instructor')) {
        this.userType = 2;
      } else if (roles.includes('usuario')) {
        this.userType = 1;
      }
    }
    console.log('Detected User Type (Final):', this.userType, 'Is 2?', this.userType === 2);

    this.auth.setLoggedIn(this.isLoggedIn, this.username);
  }

  isPanelLinkActive(): boolean {
    const url = (this.currentUrl || '').split('?')[0];
    if (!this.isLoggedIn) {
      return url === '' || url === '/';
    }
    return url.startsWith('/dashboard') || url.startsWith('/campeonatos/crear');
  }

  isChampionshipsLinkActive(): boolean {
    const url = (this.currentUrl || '').split('?')[0];
    return url.startsWith('/campeonatos') && !url.startsWith('/campeonatos/crear');
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

  private closeMobileNavbar(): void {
    const collapseEl = this.navbarCollapseRef?.nativeElement;
    if (!collapseEl) return;
    if (!collapseEl.classList.contains('show')) return;

    const win = window as any;
    const bs = win?.bootstrap;

    try {
      if (bs?.Collapse?.getOrCreateInstance) {
        const instance = bs.Collapse.getOrCreateInstance(collapseEl, { toggle: false });
        instance.hide();
      } else {
        collapseEl.classList.remove('show');
      }
    } finally {
      const togglerEl = this.navbarTogglerRef?.nativeElement;
      if (togglerEl) {
        togglerEl.classList.add('collapsed');
        togglerEl.setAttribute('aria-expanded', 'false');
      }
    }
  }

  goToProfile(): void {
    this.closeDropdown();
    this.router.navigate(['/perfil']);
  }

  goToMyChamps(): void {
    this.closeDropdown();
    this.router.navigate(['/mis-campeonatos']);
  }

  goToMyAcademy(): void {
    this.closeDropdown();
    this.router.navigate(['/mi-academia']);
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

