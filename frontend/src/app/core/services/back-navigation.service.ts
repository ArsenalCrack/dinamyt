import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { NavigationHistoryService } from './navigation-history.service';

export interface BackNavigationOptions {
  fallbackUrl: string;
  disallowPrevious?: Array<string | RegExp>;
}

@Injectable({
  providedIn: 'root'
})
export class BackNavigationService {
  constructor(
    private router: Router,
    private history: NavigationHistoryService
  ) {}

  async backOr(options: BackNavigationOptions): Promise<void> {
    const current = this.history.getCurrentUrl() || '';
    const previous = this.history.getPreviousUrl() || '';

    const disallow = options.disallowPrevious ?? [];
    const isDisallowed = (url: string) =>
      disallow.some((rule) => (typeof rule === 'string' ? url === rule : rule.test(url)));

    // Si no hay historial útil dentro de la app, o el anterior es "mala idea", usar fallback.
    const canGoPrevious = !!previous && previous !== current && !isDisallowed(previous);
    const target = canGoPrevious ? previous : options.fallbackUrl;

    await this.router.navigateByUrl(target);
  }
}
