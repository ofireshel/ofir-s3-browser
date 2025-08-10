# Ofir's S3 Browser Server

A production-ready static file server for the S3 Browser application with enterprise-grade features.

## 🚀 Features

### Security
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, CSP
- **Path Traversal Protection**: Prevents directory traversal attacks
- **Method Restrictions**: Only allows GET and HEAD requests
- **File Size Limits**: Configurable maximum file size (default: 50MB)
- **Directory Listing Disabled**: Prevents unauthorized directory browsing

### Performance
- **HTTP Caching**: Proper Cache-Control headers and ETags
- **Conditional Requests**: Supports If-Modified-Since for efficient caching
- **File Streaming**: Memory-efficient file serving using streams
- **Request Timeouts**: Configurable timeout protection

### Monitoring & Logging
- **Structured Logging**: Timestamped logs with configurable levels
- **Request Statistics**: Tracks requests, errors, and performance metrics
- **Health Endpoint**: `/health` and `/status` endpoints for monitoring
- **Performance Metrics**: Request duration and file size tracking

### Reliability
- **Graceful Shutdown**: Handles SIGTERM and SIGINT signals properly
- **Error Handling**: Comprehensive error handling with proper HTTP status codes
- **Process Management**: Uncaught exception and unhandled rejection handling
- **Custom Error Pages**: User-friendly 404 and 500 error pages

## 🔧 Configuration

The server can be configured using environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3030 | Server port |
| `HOST` | 127.0.0.1 | Server host |
| `LOG_LEVEL` | info | Logging level (error, warn, info, debug) |
| `REQUEST_TIMEOUT` | 30000 | Request timeout in milliseconds |
| `MAX_FILE_SIZE` | 52428800 | Maximum file size in bytes (50MB) |
| `CACHE_MAX_AGE` | 3600 | Cache max-age in seconds |

## 📊 Health Monitoring

Visit `http://localhost:3030/health` to get server status:

```json
{
  "status": "healthy",
  "uptime": 123456,
  "requests": 42,
  "errors": 0,
  "errorRate": "0.00%",
  "memory": {
    "rss": 32972800,
    "heapTotal": 6123520,
    "heapUsed": 5536032,
    "external": 1983373,
    "arrayBuffers": 10715
  },
  "timestamp": "2025-08-09T14:25:32.573Z"
}
```

## 🎯 MIME Type Support

Comprehensive MIME type mapping for:
- Web files: HTML, CSS, JavaScript, JSON
- Images: PNG, JPEG, GIF, SVG, ICO
- Documents: PDF, TXT, ZIP
- 3D Models: GLB (for Three.js assets)

## 🛡️ Security Features

### Content Security Policy
```
default-src 'self' 'unsafe-inline' 'unsafe-eval' unpkg.com; 
img-src 'self' data:; 
script-src 'self' 'unsafe-inline' 'unsafe-eval' unpkg.com
```

### Security Headers
- Prevents content type sniffing
- Blocks embedding in frames
- Enables XSS protection
- Strict referrer policy

## 🚦 Usage

### Quick Start
```bash
# Start the server
node server.js

# Or use the convenience script
start-server.bat
```

### Development Mode
```bash
# Enable debug logging
LOG_LEVEL=debug node server.js

# Custom port
PORT=8080 node server.js
```

### Production Deployment
```bash
# Set production environment
NODE_ENV=production LOG_LEVEL=warn node server.js
```

## 📝 Logging

The server provides detailed logging with different levels:

```
[2025-08-09T14:25:26.664Z] [INFO] 🚀 Ofir's S3 Browser Server started successfully
[2025-08-09T14:25:26.664Z] [INFO] 📡 Server URL: http://127.0.0.1:3030
[2025-08-09T14:25:26.664Z] [INFO] 📁 Serving files from: C:\Users\ofire\ofir-s3-browser
[2025-08-09T14:25:26.664Z] [INFO] 🔒 Security headers: Enabled
[2025-08-09T14:25:32.572Z] [INFO] GET /health - 200 - 267 bytes - 1ms - Mozilla/5.0
```

## 🔄 Graceful Shutdown

The server handles shutdown signals gracefully:
- Finishes processing current requests
- Closes server connections cleanly
- Reports final statistics
- Force exits after 10-second timeout

## 🎨 Error Pages

Custom HTML error pages for better user experience:
- **404 Not Found**: Shows requested resource path
- **500 Internal Server Error**: User-friendly error message
- **403 Forbidden**: For directory access or path traversal attempts

## 📈 Performance

Optimizations for production use:
- Stream-based file serving (no memory limitations)
- Efficient caching with conditional requests
- Proper HTTP status codes and headers
- Request/response lifecycle optimization

## 🔍 Troubleshooting

### Common Issues

1. **Port in use**: Change PORT environment variable
2. **Permission denied**: Run with appropriate privileges
3. **File not found**: Check file paths and case sensitivity
4. **Large file errors**: Adjust MAX_FILE_SIZE setting

### Debug Mode
```bash
LOG_LEVEL=debug node server.js
```

This will show detailed request information for troubleshooting.

## 🏗️ Architecture

The server is built with:
- **Pure Node.js**: No external dependencies
- **Event-driven**: Non-blocking I/O for better performance  
- **Modular design**: Separated concerns for maintainability
- **Production-ready**: Enterprise-grade error handling and logging

---

**Version**: 1.0.0  
**Author**: Ofir  
**License**: MIT
