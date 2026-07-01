import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtTokenService } from './jwt.service';
import { MailerService } from './mailer.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    // Dependencias mockeadas: el test de smoke solo verifica que el proveedor
    // se construye con su grafo de dependencias resuelto.
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: {} },
        { provide: JwtTokenService, useValue: {} },
        { provide: MailerService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
