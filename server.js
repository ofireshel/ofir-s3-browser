const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const util = require('util');
const os = require('os');

// Configuration
const CONFIG = {
  port: process.env.PORT || 3030,
  host: process.env.HOST || '127.0.0.1',
  root: __dirname,
  maxAge: 3600, // Cache max-age in seconds
  logLevel: process.env.LOG_LEVEL || 'info',
  enableSecurity: true,
  requestTimeout: 30000, // 30 seconds
  maxFileSize: 50 * 1024 * 1024 // 50MB max file size
};

// MIME types mapping
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.glb': 'model/gltf-binary'
};

// Logging system
class Logger {
  constructor(level = 'info') {
    this.levels = { error: 0, warn: 1, info: 2, debug: 3 };
    this.level = this.levels[level] || 2;
  }

  log(level, message, ...args) {
    if (this.levels[level] <= this.level) {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
      console.log(prefix, message, ...args);
    }
  }

  error(message, ...args) { this.log('error', message, ...args); }
  warn(message, ...args) { this.log('warn', message, ...args); }
  info(message, ...args) { this.log('info', message, ...args); }
  debug(message, ...args) { this.log('debug', message, ...args); }
}

const logger = new Logger(CONFIG.logLevel);

// Request statistics
const stats = {
  requests: 0,
  errors: 0,
  startTime: Date.now(),
  get uptime() { return Date.now() - this.startTime; },
  get errorRate() { return this.requests > 0 ? (this.errors / this.requests * 100).toFixed(2) : 0; }
};

// Security headers
function addSecurityHeaders(res) {
  if (!CONFIG.enableSecurity) return;
  
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' unpkg.com; img-src 'self' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' unpkg.com; connect-src 'self'");
}

// Path sanitization
function sanitizePath(pathname) {
  // Remove query parameters and fragments
  pathname = pathname.split('?')[0].split('#')[0];
  
  // Normalize path separators
  pathname = pathname.replace(/\\/g, '/');
  
  // Remove dangerous path traversal attempts
  pathname = pathname.replace(/\.\.+/g, '');
  
  // Ensure it starts with /
  if (!pathname.startsWith('/')) {
    pathname = '/' + pathname;
  }
  
  // Default to index.html for root
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }
  
  return pathname;
}

// Get MIME type
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// Request handler
async function handleRequest(req, res) {
  const startTime = Date.now();
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown';
  
  stats.requests++;
  
  try {
    // Add security headers
    addSecurityHeaders(res);
    
    // Parse URL
    const parsedUrl = url.parse(req.url);
    let pathname = sanitizePath(parsedUrl.pathname || '/');
    
    logger.debug(`Request: ${req.method} ${pathname} from ${clientIP}`);
    
    // Allow POST only for scores API
    if (req.method !== 'GET' && req.method !== 'HEAD' && !(req.method === 'POST' && pathname === '/api/scores')) {
      res.writeHead(405, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Allow': 'GET, HEAD'
      });
      res.end('Method Not Allowed');
      logger.warn(`Method ${req.method} not allowed for ${pathname}`);
      return;
    }
    
    // Handle API: scores
    if (pathname === '/api/scores') {
      const scoresFile = path.join(CONFIG.root, 'scores.json');
      // Ensure file exists with dummy data
      try {
        await fs.promises.access(scoresFile, fs.constants.F_OK);
      } catch (_) {
        const seed = {
          players: {
            "Ofir": { used: 85, total: 100 },
            "Avi": { used: 60, total: 80 },
            "Dana": { used: 72, total: 95 },
            "Noa": { used: 50, total: 70 },
            "Lior": { used: 20, total: 35 }
          }
        };
        await fs.promises.writeFile(scoresFile, JSON.stringify(seed, null, 2));
      }
      if (req.method === 'GET') {
        const raw = await fs.promises.readFile(scoresFile, 'utf-8').catch(() => '{}');
        const data = JSON.parse(raw || '{}');
        const players = data.players || {};
        const list = Object.entries(players).map(([player, agg]) => {
          const used = Number(agg.used || 0);
          const total = Number(agg.total || 1);
          const avg = total > 0 ? used / total : 0;
          return { player, used, total, avg };
        }).sort((a,b) => b.avg - a.avg).slice(0, 5);
        const body = JSON.stringify({ top5: list }, null, 2);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(body);
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); if (body.length > 1e6) req.connection.destroy(); });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const player = (payload.player || 'Anonymous').toString().slice(0, 64);
            const used = Math.max(0, Math.min(20, Number(payload.used || 0)));
            const total = Math.max(1, Math.min(20, Number(payload.total || 20)));
            const raw = await fs.promises.readFile(scoresFile, 'utf-8').catch(() => '{}');
            const data = JSON.parse(raw || '{}');
            if (!data.players) data.players = {};
            if (!data.players[player]) data.players[player] = { used: 0, total: 0 };
            data.players[player].used += used;
            data.players[player].total += total;
            await fs.promises.writeFile(scoresFile, JSON.stringify(data, null, 2));
            // Return updated top5 so clients can refresh without another request
            const players = data.players || {};
            const list = Object.entries(players).map(([player, agg]) => {
              const u = Number(agg.used || 0);
              const t = Number(agg.total || 1);
              const a = t > 0 ? u / t : 0;
              return { player, used: u, total: t, avg: a };
            }).sort((a,b) => b.avg - a.avg).slice(0, 5);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ status: 'ok', top5: list }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON' }));
          }
        });
        return;
      }
    }

    // Construct file path
    const filePath = path.join(CONFIG.root, pathname);
    
    // Security check - ensure file is within root directory
    const resolvedPath = path.resolve(filePath);
    const resolvedRoot = path.resolve(CONFIG.root);
    if (!resolvedPath.startsWith(resolvedRoot)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      logger.warn(`Access denied to ${pathname} (path traversal attempt)`);
      stats.errors++;
      return;
    }
    
    // Check if file exists and get stats
    const fileStats = await fs.promises.stat(filePath).catch(() => null);
    
    if (!fileStats) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>404 Not Found</title></head>
        <body>
          <h1>404 - Not Found</h1>
          <p>The requested resource <code>${pathname}</code> was not found on this server.</p>
          <hr>
          <small>Ofir's S3 Browser Server</small>
        </body>
        </html>
      `);
      logger.info(`404 Not Found: ${pathname}`);
      stats.errors++;
      return;
    }
    
    // Don't serve directories
    if (fileStats.isDirectory()) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Directory listing forbidden');
      logger.warn(`Directory access denied: ${pathname}`);
      stats.errors++;
      return;
    }
    
    // Check file size limit
    if (fileStats.size > CONFIG.maxFileSize) {
      res.writeHead(413, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('File too large');
      logger.warn(`File too large: ${pathname} (${fileStats.size} bytes)`);
      stats.errors++;
      return;
    }
    
    // Handle conditional requests (If-Modified-Since)
    const lastModified = fileStats.mtime.toUTCString();
    const ifModifiedSince = req.headers['if-modified-since'];
    
    if (ifModifiedSince && new Date(ifModifiedSince) >= fileStats.mtime) {
      res.writeHead(304);
      res.end();
      logger.debug(`304 Not Modified: ${pathname}`);
      return;
    }
    
    // Set response headers
    const mimeType = getMimeType(filePath);
    const isHTML = mimeType.startsWith('text/html');
    const headers = {
      'Content-Type': mimeType,
      'Content-Length': fileStats.size,
      'Last-Modified': lastModified,
      'Cache-Control': isHTML ? 'no-cache, no-store, must-revalidate' : `public, max-age=${CONFIG.maxAge}`,
      'ETag': `"${fileStats.size}-${fileStats.mtime.getTime()}"`,
      'Server': 'Ofir-S3-Browser/1.0'
    };
    
    res.writeHead(200, headers);
    
    // For HEAD requests, don't send body
    if (req.method === 'HEAD') {
      res.end();
      logger.debug(`HEAD response: ${pathname}`);
      return;
    }
    
    // Stream file to response
    const readStream = fs.createReadStream(filePath);
    
    readStream.on('error', (err) => {
      logger.error(`Error reading file ${pathname}:`, err.message);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal Server Error');
      }
      stats.errors++;
    });
    
    readStream.pipe(res);
    
    readStream.on('end', () => {
      const duration = Date.now() - startTime;
      logger.info(`${req.method} ${pathname} - 200 - ${fileStats.size} bytes - ${duration}ms - ${userAgent}`);
    });
    
  } catch (error) {
    logger.error(`Server error for ${req.url}:`, error.message);
    stats.errors++;
    
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>500 Internal Server Error</title></head>
        <body>
          <h1>500 - Internal Server Error</h1>
          <p>An unexpected error occurred while processing your request.</p>
          <hr>
          <small>Ofir's S3 Browser Server</small>
        </body>
        </html>
      `);
    }
  }
}

// Create server
const server = http.createServer(handleRequest);

// Set request timeout
server.timeout = CONFIG.requestTimeout;

// Graceful shutdown handling
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  server.close((err) => {
    if (err) {
      logger.error('Error during server shutdown:', err.message);
      process.exit(1);
    }
    
    logger.info('Server closed successfully');
    logger.info(`Final stats - Requests: ${stats.requests}, Errors: ${stats.errors}, Error Rate: ${stats.errorRate}%, Uptime: ${Math.round(stats.uptime / 1000)}s`);
    process.exit(0);
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Error handling
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err.message);
  logger.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server
server.listen(CONFIG.port, CONFIG.host, () => {
  logger.info(`🚀 Ofir's S3 Browser Server started successfully`);
  logger.info(`📡 Server URL: http://${CONFIG.host}:${CONFIG.port}`);
  logger.info(`📁 Serving files from: ${CONFIG.root}`);
  logger.info(`🔒 Security headers: ${CONFIG.enableSecurity ? 'Enabled' : 'Disabled'}`);
  logger.info(`📊 Log level: ${CONFIG.logLevel}`);
  logger.info(`💾 Max file size: ${(CONFIG.maxFileSize / 1024 / 1024).toFixed(1)}MB`);
  logger.info(`⏱️  Request timeout: ${CONFIG.requestTimeout / 1000}s`);
  logger.info(`🖥️  System: ${os.type()} ${os.release()} (${os.arch()})`);
  logger.info(`🟢 Server ready - Press Ctrl+C to stop`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${CONFIG.port} is already in use`);
  } else if (err.code === 'EACCES') {
    logger.error(`Permission denied for port ${CONFIG.port}`);
  } else {
    logger.error('Server error:', err.message);
  }
  process.exit(1);
});

// Status endpoint for health checks
server.on('request', (req, res) => {
  if (req.url === '/status' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      uptime: stats.uptime,
      requests: stats.requests,
      errors: stats.errors,
      errorRate: stats.errorRate + '%',
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    }, null, 2));
  }
});
