import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { ApiService } from './core/services/api.service';
import { of } from 'rxjs';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        {
          provide: ApiService,
          useValue: {
            getSaludo: () => of({ mensaje: 'OK', estado: 'Online' }),
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should have default backend status values before init', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.mensajeBackend).toBe('Esperando conexión...');
    expect(app.estadoBackend).toBe('Desconocido');
  });

  it('should update backend status on init', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    expect(app.mensajeBackend).toBe('OK');
    expect(app.estadoBackend).toBe('Online');
  });
});
