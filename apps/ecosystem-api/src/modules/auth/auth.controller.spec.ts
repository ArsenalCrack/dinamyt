import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtTokenService } from './jwt.service';
import { SessionsService } from './sessions.service';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    // Se mockean los servicios para no arrastrar su grafo real (BD, correo).
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: JwtTokenService, useValue: {} },
        // El guard de las rutas autenticadas lo necesita: desde que la sesión
        // se puede cerrar, comprobar la firma ya no basta.
        { provide: SessionsService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
