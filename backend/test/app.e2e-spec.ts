import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    process.env.API_PREFIX = 'api';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('serves the production API prefix and Swagger', async () => {
    await request(app.getHttpServer())
      .get('/api/')
      .expect(200)
      .expect('Hello World!');
    await request(app.getHttpServer()).get('/api/docs').expect(200);
    await request(app.getHttpServer()).get('/').expect(404);
  });

  afterEach(async () => {
    delete process.env.API_PREFIX;
    await app.close();
  });
});
