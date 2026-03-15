import { Request, Response, NextFunction } from 'express';

/**
 * CORS middleware optimized for captive portal and local network access
 * Handles cross-origin requests from captive browser frames and local devices
 */
export function corsSecurityMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.get('Origin');
  const referer = req.get('Referer');
  const clientIP = req.ip;
  const userAgent = req.get('User-Agent') || '';
  
  // Check if this is a captive portal probe
  const isCaptivePortalProbe = 
    userAgent.includes('CaptiveNetworkSupport') ||
    userAgent.includes('Microsoft NCSI') ||
    userAgent.includes('NetworkConnectivity') ||
    userAgent.includes('ConnectivityCheck') ||
    req.path.includes('hotspot-detect') ||
    req.path.includes('generate_204') ||
    req.path.includes('ncsi.txt');

  // For captive portal probes, allow all origins during initial connection phase
  if (isCaptivePortalProbe) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, User-Agent');
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    return next();
  }

  // Allow requests without Origin header (direct API calls, mobile apps)
  if (!origin && !referer) {
    return next();
  }

  // Extract hostname from origin or referer
  let requestHost: string | null = null;
  
  if (origin) {
    try {
      const url = new URL(origin);
      requestHost = url.hostname;
    } catch (error) {
      // Invalid origin URL
    }
  } else if (referer) {
    try {
      const url = new URL(referer);
      requestHost = url.hostname;
    } catch (error) {
      // Invalid referer URL
    }
  }

  if (!requestHost) {
    console.warn(`Invalid origin/referer header from IP: ${clientIP}`);
    return res.status(403).json({ error: 'Invalid request origin' });
  }

  // Define allowed origins
  const allowedOrigins = [
    // Pi network
    '192.168.4.1',
    'pocketcloud.local',
    
    // Local development
    'localhost',
    '127.0.0.1',
  ];

  // Check if origin is explicitly allowed
  const isExplicitlyAllowed = allowedOrigins.includes(requestHost);
  
  // Check if origin is in the Pi's subnet (192.168.4.x)
  const isInPiSubnet = /^192\.168\.4\.\d{1,3}$/.test(requestHost);
  
  // Check if origin is localhost with port (for development)
  const isLocalhostWithPort = /^(localhost|127\.0\.0\.1):\d+$/.test(requestHost);
  
  // Check if origin is in private network ranges (for client WiFi mode)
  const isInPrivateNetwork = /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(requestHost);

  if (!isExplicitlyAllowed && !isInPiSubnet && !isLocalhostWithPort && !isInPrivateNetwork) {
    console.warn(`CORS violation: Blocked request from ${requestHost} (IP: ${clientIP})`);
    
    return res.status(403).json({ 
      error: 'Cross-origin request blocked',
      message: 'This PocketCloud Drive only accepts requests from the local network'
    });
  }

  // Set CORS headers for allowed origins
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie');
  res.header('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
}

/**
 * Additional IP-based security check
 * Ensures requests come from the local network even if CORS headers are spoofed
 */
export function ipSecurityMiddleware(req: Request, res: Response, next: NextFunction) {
  const clientIP = req.ip;
  
  // Define allowed IP patterns
  const allowedIPPatterns = [
    // Pi network subnet
    /^192\.168\.4\./,
    
    // Localhost (IPv4)
    /^127\.0\.0\.1$/,
    
    // Localhost (IPv6)
    /^::1$/,
    
    // IPv4-mapped IPv6 localhost
    /^::ffff:127\.0\.0\.1$/,
    
    // Private network ranges (in case Pi is on different subnet)
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./
  ];

  const isAllowedIP = allowedIPPatterns.some(pattern => pattern.test(clientIP));

  if (!isAllowedIP) {
    LoggerService.warn('security', 
      `IP security violation: Blocked request from ${clientIP}`,
      (req as any).user?.id
    );
    
    AuditService.logSecurityEvent(
      (req as any).user?.id,
      'ip_security_violation',
      'http_request',
      clientIP,
      req.get('User-Agent') || 'unknown',
      'fail',
      { 
        path: req.path,
        method: req.method
      }
    );

    return res.status(403).json({ 
      error: 'Access denied',
      message: 'Requests are only allowed from the local network'
    });
  }

  next();
}

/**
 * Security headers middleware
 * Adds additional security headers beyond helmet
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  // Prevent MIME type sniffing
  res.header('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking
  res.header('X-Frame-Options', 'DENY');
  
  // Control referrer information
  res.header('Referrer-Policy', 'no-referrer');
  
  // Prevent XSS attacks
  res.header('X-XSS-Protection', '1; mode=block');
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
  
  // Cache control for sensitive endpoints
  if (req.path.startsWith('/api/admin') || req.path.startsWith('/api/auth')) {
    res.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
  }

  next();
}

/**
 * Request logging middleware for security monitoring
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  // Log suspicious patterns
  const suspiciousPatterns = [
    /\.\./,           // Path traversal
    /<script/i,       // XSS attempts
    /union.*select/i, // SQL injection
    /exec\(/i,        // Code injection
    /eval\(/i,        // Code injection
    /javascript:/i,   // JavaScript injection
    /vbscript:/i,     // VBScript injection
    /onload=/i,       // Event handler injection
    /onerror=/i       // Event handler injection
  ];

  const requestData = JSON.stringify({
    url: req.url,
    body: req.body,
    query: req.query,
    headers: req.headers
  });

  const hasSuspiciousPattern = suspiciousPatterns.some(pattern => 
    pattern.test(requestData)
  );

  if (hasSuspiciousPattern) {
    LoggerService.warn('security', 
      `Suspicious request pattern detected from ${req.ip}: ${req.method} ${req.url}`,
      (req as any).user?.id
    );
    
    AuditService.logSecurityEvent(
      (req as any).user?.id,
      'suspicious_request',
      'http_request',
      req.ip,
      req.get('User-Agent') || 'unknown',
      'detected',
      {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent')
      }
    );
  }

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    // Log slow requests (potential DoS)
    if (duration > 5000) { // 5 seconds
      LoggerService.warn('security', 
        `Slow request detected: ${req.method} ${req.url} took ${duration}ms from ${req.ip}`,
        (req as any).user?.id
      );
    }
    
    // Log failed authentication attempts
    if (res.statusCode === 401 || res.statusCode === 403) {
      AuditService.logSecurityEvent(
        (req as any).user?.id,
        'access_denied',
        'http_request',
        req.ip,
        req.get('User-Agent') || 'unknown',
        'fail',
        {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode
        }
      );
    }
  });

  next();
}