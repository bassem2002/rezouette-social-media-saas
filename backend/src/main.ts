import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import {
  resolveStaticAssetsPrefix,
  resolveStaticAssetsRoot,
} from './config/media.config.js';
import { DEFAULT_FRONTEND_BASE_URL } from './config/frontend.config.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  app.setGlobalPrefix('api/v1');

  // Médias servis en statique (hors préfixe API). On ne monte QUE `uploads/social`
  // sous `/uploads/social/` : `uploads/.tmp/` (fichiers multipart en cours, non
  // validés) reste ainsi HORS de l'arborescence publique. Les URL déjà
  // distribuées — `/uploads/social/AAAA/MM/fichier.ext` — sont inchangées.
  app.useStaticAssets(resolveStaticAssetsRoot(), {
    prefix: resolveStaticAssetsPrefix(),
  });

  // Même repli que `frontend.config.ts` : sans cette constante partagée, CORS et
  // la redirection OAuth pourraient viser deux origines différentes.
  app.enableCors({
    origin: process.env['FRONTEND_URL'] ?? DEFAULT_FRONTEND_BASE_URL,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Zernio API')
    .setDescription(
      'API de gestion des réseaux sociaux. Intégrations opérationnelles : Meta (Facebook + Instagram). ' +
        'Intégrations PRÉPARÉES ET TESTÉES AVEC DES MOCKS, non validées contre les API réelles : TikTok et LinkedIn. ' +
        'YouTube : connexion OAuth validée en conditions réelles ; upload implémenté mais PAS ENCORE validé contre Google. ' +
        'Les publications LinkedIn et YouTube sont désactivées par défaut (LINKEDIN_PUBLISH_API, YOUTUBE_PUBLISHING_ENABLED), lues au démarrage.',
    )
    .setVersion('1.0')
    .addTag('Auth Meta (OAuth)', 'Connexion OAuth Meta (Facebook Login)')
    .addTag('Auth TikTok (OAuth)', 'Connexion OAuth TikTok (Login Kit + PKCE)')
    .addTag(
      'Auth LinkedIn (OAuth/OIDC)',
      'Connexion OAuth 2.0 + OpenID Connect LinkedIn (profil membre)',
    )
    .addTag(
      'Auth YouTube (OAuth)',
      'Connexion OAuth Google/YouTube (PKCE S256, chaînes multiples)',
    )
    .addTag('Social — Meta (test & debug)', 'Endpoints de test/diagnostic Meta')
    .addTag(
      'Social — LinkedIn (membre)',
      'Statut du token, comptes et publication LinkedIn (profil membre)',
    )
    .addTag(
      'Social — YouTube',
      'Chaînes connectées, statut des tokens et publication vidéo YouTube',
    )
    .addTag(
      'Social — Historique des publications',
      'Consultation de l’historique persistant des publications',
    )
    .addTag(
      'Social — Publications programmées',
      'Planification et envoi différé des publications',
    )
    .addTag('Analytics', 'Statistiques agrégées (KPI, plateformes, erreurs, séries)')
    .addTag('Media', 'Upload d’images et génération d’URL publiques')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/v1/docs', app, document);

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
  logger.log(`Zernio API running on http://localhost:${port}/api/v1`);
  logger.log(`Swagger docs on http://localhost:${port}/api/v1/docs`);
}

bootstrap();
