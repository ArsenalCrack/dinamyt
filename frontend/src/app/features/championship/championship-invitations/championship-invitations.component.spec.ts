import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChampionshipInvitationsComponent } from './championship-invitations.component';

describe('ChampionshipInvitationsComponent', () => {
  let component: ChampionshipInvitationsComponent;
  let fixture: ComponentFixture<ChampionshipInvitationsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChampionshipInvitationsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ChampionshipInvitationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
