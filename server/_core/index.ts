import 'dotenv/config';

// Keep the server alive on unhandled errors (especially useful in dev)
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
});

import { createServer } from 'http';
import net from 'net';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { registerOAuthRoutes } from './oauth';
import { registerDevAuthRoutes } from './devAuth';
import { appRouter } from '../routers';
import { createContext } from './context';
import { setupVite } from './vite';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on('error', () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn('[Server] No DATABASE_URL set, skipping migrations');
    return;
  }
  try {
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    const postgres = (await import('postgres')).default;
    const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1') || connectionString.includes('@db:') || connectionString.includes('@db/');
    const client = postgres(connectionString, {
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 1,
    });
    const db = drizzle(client);
    console.log('[Server] Running database migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('[Server] Migrations complete');
    await client.end();
  } catch (error) {
    console.error('[Server] Migration failed:', error);
    throw error;
  }
}

async function startServer() {
  // Run database migrations before starting the server
  await runMigrations();

  const expressModule = await import('express');
  const express = (expressModule as any).default || expressModule;
  const app = express();
  const server = createServer(app);
  
  // Security middleware - relax CSP in development for Vite HMR inline scripts
  const isDev = process.env.NODE_ENV === 'development';
  app.use(helmet({
    contentSecurityPolicy: isDev ? false : {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-eval'", "https://maps.googleapis.com", "https://maps.gstatic.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https:", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https:", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "https://maps.googleapis.com", "https://maps.gstatic.com"],
        connectSrc: ["'self'", "https:", "https://maps.googleapis.com"],
        frameSrc: ["'self'", "https://maps.googleapis.com"],
      },
    },
  }));
  
  // Rate limiting for API endpoints
  // Dev: 1000 req/15min (tRPC batches fire many parallel queries per page load)
  // Prod: 100 req/15min
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isDev ? 1000 : 500,
    message: 'Too many requests from this IP, please try again later.'
  });
  app.use('/api/', limiter);
  
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  
  // Auth routes (email/password + dev login)
  registerOAuthRoutes(app);
  registerDevAuthRoutes(app);

  // Local file uploads
  const path = await import('path');
  const fs = await import('fs');
  const uploadsDir = path.default.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));

    // tRPC API
    app.use(
      '/api/trpc',
      createExpressMiddleware({
        router: appRouter,
        createContext,
      })
    );
  
    // Health check endpoint
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });
  
    // Detailed health check with database connectivity
    app.get('/api/health/ready', async (req, res) => {
      try {
        const { sql } = await import('drizzle-orm');
        const { getDb } = await import('../db');
        const db = await getDb();
        if (!db) throw new Error('Database not initialized');
        await db.execute(sql`SELECT 1`);
        res.json({ status: 'ok', database: 'connected' });
      } catch (error) {
        res.status(503).json({ status: 'error', error: String(error) });
      }
    });
  
    // Error handling middleware
    app.use((err: Error, req: any, res: any, next: any) => {
      console.error(err.stack);
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    });
    
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === 'development') {
    await setupVite(app, server);
  } else {
    const { serveStatic } = await import('./vite');
    await serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || '3000');
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
