# Pocket Cloud Drive - Security Documentation

## Overview

Pocket Cloud Drive implements comprehensive security measures to protect against real-world threats on shared local networks. This document outlines the security architecture, threat model, and implemented protections.

## Threat Model

### Assumptions
- **Network Environment**: Shared local WiFi network (192.168.4.0/24)
- **Adversary Capabilities**: Malicious users on the same network
- **Attack Vectors**: Web-based attacks, network-level attacks, file system attacks
- **Trust Boundary**: Only devices on the local network are trusted

### Threats Addressed

1. **Cross-Site Request Forgery (CSRF)**
2. **Path Traversal Attacks**
3. **File Upload Attacks**
4. **Brute Force Authentication**
5. **Rate Limiting Bypass**
6. **Network-based Attacks**
7. **Resource Exhaustion (DoS)**
8. **Information Disclosure**

## Security Architecture

### 1. Network Security

#### Firewall Configuration (`scripts/firewall-setup.sh`)
- **Principle**: Default deny with explicit allow rules
- **SSH Access**: Limited to local network (192.168.4.0/24) only
- **HTTP/HTTPS**: Limited to local network only
- **Rate Limiting**: Built into iptables rules
- **Logging**: All dropped packets logged for monitoring

```bash
# Example firewall rules
iptables -A INPUT -p tcp -s 192.168.4.0/24 --dport 22 -j ACCEPT
iptables -A INPUT -p tcp -s 192.168.4.0/24 --dport 80 -j ACCEPT
iptables -A INPUT -p tcp -s 192.168.4.0/24 --dport 443 -j ACCEPT
iptables -A INPUT -j DROP  # Default deny
```

#### CORS Protection (`backend/src/middleware/cors.middleware.ts`)
- **Origin Validation**: Only allows requests from local network IPs
- **IP Filtering**: Double-checks client IP against allowed ranges
- **Request Logging**: Suspicious requests logged and blocked

**Allowed Origins**:
- `192.168.4.x` (Pi network)
- `localhost` / `127.0.0.1` (development)
- Private network ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x)

### 2. Application Security

#### Security Headers (`backend/src/middleware/security.middleware.ts`)
Implemented using Helmet.js with custom configuration:

```javascript
Content-Security-Policy: default-src 'self'; script-src 'self'; 
  style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:;
  media-src 'self' blob:; connect-src 'self' ws://192.168.4.1
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

#### Rate Limiting
Granular rate limits per endpoint type:

| Endpoint Type | Limit | Window | Key |
|---------------|-------|--------|-----|
| Login | 5 attempts | 1 minute | IP address |
| Upload Init | 20 requests | 1 minute | User ID |
| General API | 300 requests | 1 minute | IP address |
| Public Shares | 30 requests | 1 minute | IP address |
| Admin Routes | 60 requests | 1 minute | User ID |

#### Input Validation
Using Zod schemas for all request validation:

```typescript
// File name validation
fileName: z.string()
  .min(1).max(255)
  .refine(name => {
    const cleaned = name.replace(/\.\./g, '').replace(/\0/g, '');
    return /^[a-zA-Z0-9\s\.\-_\(\)\[\]]+$/.test(cleaned);
  })
```

**Validation Rules**:
- File/folder names: Alphanumeric + safe special chars only
- Path traversal: `../` and null bytes stripped
- Passwords: 8-128 characters
- UUIDs: Format validation before DB queries
- Search queries: SQL injection patterns blocked

### 3. File System Security

#### Path Traversal Prevention
```typescript
class StorageService {
  static validatePath(userPath: string): string {
    const resolvedPath = resolve(STORAGE_PATH, normalize(userPath));
    if (!resolvedPath.startsWith(STORAGE_PATH + sep)) {
      throw new SecurityError('Path traversal attempt detected');
    }
    return resolvedPath;
  }
}
```

#### File Type Validation
- **Magic Byte Detection**: Uses `file-type` npm package
- **Extension Blacklist**: Blocks executable file types
- **MIME Type Verification**: Logs mismatches between declared and detected types

**Blocked Extensions**:
`.exe`, `.bat`, `.cmd`, `.sh`, `.php`, `.py`, `.js`, `.vbs`, `.ps1`, `.dll`, `.so`, `.msi`, `.deb`, `.rpm`

### 4. Authentication & Authorization

#### Session Security
- **HTTP-only Cookies**: Prevents XSS access to session tokens
- **Secure Flag**: Cookies only sent over HTTPS
- **SameSite**: CSRF protection
- **Session Rotation**: New session ID on login

#### Password Security
- **bcrypt Hashing**: Cost factor 10 (2^10 iterations)
- **Strength Requirements**: Minimum 8 characters
- **Brute Force Protection**: Account lockout after failed attempts

### 5. Audit & Monitoring

#### Audit Logging (`backend/src/services/audit.service.ts`)
All security-relevant events logged to database:

```sql
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  result TEXT CHECK (result IN ('success', 'fail', 'detected')),
  metadata TEXT,
  created_at INTEGER NOT NULL
);
```

**Logged Events**:
- Authentication (login/logout/failures)
- File operations (upload/download/delete/share)
- Admin actions
- Security violations (CORS, rate limits, path traversal)
- Password changes
- Quota exceeded events

#### Security Monitoring
- **Real-time Alerts**: Failed login attempts, suspicious requests
- **Brute Force Detection**: 5 failed attempts in 5 minutes triggers alert
- **Anomaly Detection**: Unusual access patterns logged
- **Log Retention**: 50,000 most recent audit entries kept

### 6. HTTPS Configuration

#### TLS Security (`scripts/setup-https.sh`)
- **Self-signed Certificate**: 10-year validity, RSA 2048-bit
- **Protocol Support**: TLS 1.2 and 1.3 only
- **Cipher Suites**: Modern, secure ciphers preferred
- **HSTS**: Enforces HTTPS for 1 year

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";
```

## Security Checklist

### ✅ Implemented Protections

- [x] **No secrets in git**: Environment variables used for all secrets
- [x] **Database permissions**: `chmod 600` on SQLite file
- [x] **Storage permissions**: `chmod 750` on storage directories
- [x] **Environment file permissions**: `chmod 600` on .env files
- [x] **Default password disabled**: Setup wizard forces password change
- [x] **Unnecessary services disabled**: Bluetooth, Avahi daemon disabled
- [x] **Firewall configured**: iptables rules restrict network access
- [x] **HTTPS enabled**: Self-signed certificate with secure configuration
- [x] **Input validation**: Zod schemas for all user inputs
- [x] **Rate limiting**: Granular limits per endpoint type
- [x] **Audit logging**: Comprehensive security event logging
- [x] **File type validation**: Magic byte detection and extension filtering
- [x] **Path traversal protection**: Resolved path validation
- [x] **CORS protection**: Origin and IP validation
- [x] **Security headers**: Comprehensive header configuration

### 🔧 Operational Security

#### File Permissions
```bash
# Database
chmod 600 /opt/pocketcloud/data/pocketcloud.db
chown pi:pi /opt/pocketcloud/data/pocketcloud.db

# Storage
chmod 750 /mnt/pocketcloud/files
chown pi:pi /mnt/pocketcloud/files

# Environment
chmod 600 /opt/pocketcloud/backend/.env
chown pi:pi /opt/pocketcloud/backend/.env

# SSL Certificates
chmod 600 /etc/ssl/pocketcloud/key.pem
chmod 644 /etc/ssl/pocketcloud/cert.pem
chown root:root /etc/ssl/pocketcloud/*
```

#### Service Hardening
```bash
# Disable unnecessary services
systemctl disable bluetooth
systemctl disable avahi-daemon
systemctl disable cups

# Enable fail2ban for additional protection
apt-get install fail2ban
systemctl enable fail2ban
```

## Security Maintenance

### Regular Tasks

1. **Log Review**: Check audit logs weekly for suspicious activity
2. **Certificate Renewal**: Self-signed cert expires in 10 years
3. **Dependency Updates**: Update npm packages monthly
4. **Backup Verification**: Test backup restoration quarterly
5. **Penetration Testing**: Annual security assessment

### Monitoring Commands

```bash
# Check recent security events
curl -s http://localhost:3000/api/admin/audit-log | jq '.logs[] | select(.result == "fail")'

# View firewall logs
journalctl -f | grep "iptables-dropped"

# Check failed login attempts
grep "login_fail" /mnt/pocketcloud/logs/app-*.log

# Monitor resource usage
htop
iotop
```

## Incident Response

### Security Event Response

1. **Immediate Actions**:
   - Block offending IP via iptables
   - Review audit logs for scope
   - Check for data exfiltration

2. **Investigation**:
   - Analyze attack patterns
   - Check file integrity
   - Review user accounts

3. **Recovery**:
   - Restore from backup if needed
   - Update security rules
   - Notify users if required

### Emergency Contacts

- **System Administrator**: [Configure during setup]
- **Network Administrator**: [Configure during setup]

## Security Assumptions & Limitations

### Assumptions
- Physical security of Raspberry Pi device
- Network isolation (no internet access for attackers)
- Users understand self-signed certificate warnings
- Local network is trusted for device management

### Known Limitations
- Self-signed certificates require manual trust
- No protection against physical device access
- Limited protection against sophisticated network attacks
- Audit logs stored locally (could be tampered with physical access)

### Future Enhancements
- Integration with external SIEM systems
- Hardware security module (HSM) support
- Certificate authority integration
- Advanced threat detection algorithms

## Compliance Considerations

This security implementation addresses common requirements for:
- **GDPR**: Data protection and audit trails
- **SOC 2**: Security controls and monitoring
- **ISO 27001**: Information security management
- **NIST Cybersecurity Framework**: Identify, Protect, Detect, Respond, Recover

## Contact & Support

For security issues or questions:
- Review audit logs: `/api/admin/audit-log`
- Check system logs: `journalctl -u pocketcloud-backend`
- Security documentation: This file
- Emergency shutdown: `systemctl stop pocketcloud-backend nginx`

---

**Last Updated**: [Auto-generated during deployment]  
**Security Version**: 1.0  
**Next Review Date**: [Set during initial setup]