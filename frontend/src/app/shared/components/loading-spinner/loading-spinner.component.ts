import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="spinner-overlay" [class.fixed]="fixed" [class.fade-in]="true">
      <div class="spinner-container">
        <div class="spinner-visual">
          <div class="outer-ring"></div>
          <div class="inner-ring"></div>
          <div class="center-dot"></div>
        </div>
        <p class="loading-text" *ngIf="message">{{ message }}</p>
      </div>
    </div>
  `,
  styles: [`
    .spinner-overlay {
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.7);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      z-index: 10000;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    .spinner-overlay.fixed {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
    }
    
    .spinner-overlay:not(.fixed) {
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
      border-radius: inherit;
    }

    .fade-in {
      animation: overlayFadeIn 0.5s ease-out;
    }

    .spinner-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      padding: 40px;
      border-radius: 24px;
      background: rgba(255, 255, 255, 0.5);
      box-shadow: 0 10px 30px rgba(0,0,0,0.05);
      border: 1px solid rgba(255,255,255,0.8);
    }

    .spinner-visual {
      position: relative;
      width: 80px;
      height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .outer-ring {
      position: absolute;
      width: 100%;
      height: 100%;
      border: 4px solid transparent;
      border-top-color: #D60000;
      border-right-color: rgba(214, 0, 0, 0.1);
      border-radius: 50%;
      animation: spinPremium 1.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite;
    }

    .inner-ring {
      position: absolute;
      width: 60%;
      height: 60%;
      border: 3px solid transparent;
      border-bottom-color: #1a1a1a;
      border-left-color: rgba(26, 26, 26, 0.05);
      border-radius: 50%;
      animation: spinPremiumReverse 1.2s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite;
    }

    .center-dot {
      width: 8px;
      height: 8px;
      background-color: #D60000;
      border-radius: 50%;
      box-shadow: 0 0 10px rgba(214, 0, 0, 0.4);
      animation: pulseDot 1s ease-in-out infinite alternate;
    }

    .loading-text {
      margin: 0;
      font-family: 'Montserrat', sans-serif;
      font-weight: 700;
      color: #1a1a1a;
      font-size: 1.1rem;
      letter-spacing: 1px;
      text-transform: uppercase;
      text-align: center;
      opacity: 0.9;
    }

    @keyframes spinPremium {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes spinPremiumReverse {
      from { transform: rotate(0deg); }
      to { transform: rotate(-360deg); }
    }

    @keyframes pulseDot {
      from { transform: scale(0.8); opacity: 0.5; }
      to { transform: scale(1.2); opacity: 1; }
    }

    @keyframes overlayFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `]
})
export class LoadingSpinnerComponent {
  @Input() message: string = 'Cargando...';
  @Input() fixed: boolean = true;
}
