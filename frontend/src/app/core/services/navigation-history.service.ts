import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class NavigationHistoryService {
  private history: string[] = [];

  constructor(private router: Router) {
    // Inicializar con la URL actual si fue cargada directamente
    if (this.router.url) {
      this.history.push(this.router.url);
    }

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd)
      )
      .subscribe((e) => {
        const url = e.urlAfterRedirects;

        // Seguridad: evitar pushes duplicados consecutivos (algunos redirects lo causan)
        const last = this.history[this.history.length - 1];
        if (last === url) {
          return;
        }

        // Verificar si estamos "volviendo" al ítem anterior en la pila
        const previousIndex = this.history.length - 2;
        if (previousIndex >= 0 && this.history[previousIndex] === url) {
          // Retrocedimos. Quitamos el elemento superior (el que acabamos de dejar).
          this.history.pop();
        } else {
          // Avanzamos (o saltamos a otra ruta). Push.
          this.history.push(url);
        }
      });
  }

  getCurrentUrl(): string | null {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }

  getPreviousUrl(): string | null {
    if (this.history.length < 2) return null;
    return this.history[this.history.length - 2];
  }

  /**
   * Eliminar la última entrada del historial manualmente.
   * Útil al realizar acciones destructivas (como eliminar)
   * donde no se desea que el usuario vuelva a la página eliminada.
   */
  removeLastUrl(): void {
    if (this.history.length > 0) {
      this.history.pop();
    }
  }
}
