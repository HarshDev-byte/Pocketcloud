# PocketCloud Documentation

## 📁 Documentation Structure

### Features (`features/`)

Detailed documentation for each major feature:

- **[Auto Photo Backup](features/AUTO_PHOTO_BACKUP.md)** - Automatic mobile photo backup
- **[File Pipeline Rules](features/FILE_PIPELINE_RULES.md)** - Automated file processing
- **[Folder Sync Protocol](features/FOLDER_SYNC_PROTOCOL.md)** - Dropbox-style sync
- **[Health Monitor](features/HEALTH_MONITOR.md)** - Self-healing system checks
- **[Network Mode Switcher](features/NETWORK_MODE_SWITCHER.md)** - WiFi hotspot/client modes
- **[Storage Analytics](features/STORAGE_ANALYTICS.md)** - Usage insights
- **[Webhooks](features/WEBHOOKS.md)** - Automation and integrations
- **[Zero-Config Discovery](features/ZERO_CONFIG_DISCOVERY.md)** - Automatic device discovery

### Testing (`testing/`)

Test guides and documentation:

- **[E2E Feature Tests](testing/E2E_FEATURE_TESTS.md)** - End-to-end test guide
- **[Testing Guide](testing/TESTING.md)** - Comprehensive testing documentation

### Setup (`setup/`)

Production deployment guides:

- **[Performance Hardening](setup/PERFORMANCE_HARDENING.md)** - Optimization guide
- **[Production Hardening Summary](setup/PRODUCTION_HARDENING_SUMMARY.md)** - Security checklist
- **[Production Verification](setup/PRODUCTION_HARDENING_VERIFICATION.md)** - Deployment verification

## 🚀 Quick Links

### Getting Started

1. [Setup Scripts](../scripts/) - Installation and configuration
2. [Verification Tests](../scripts/verify/) - Test your installation
3. [Backend Code](../backend/src/) - Source code

### Common Tasks

- **Run Tests**: `bash scripts/verify/run-all-tests.sh`
- **Create Admin**: `bash scripts/05-create-admin.sh`
- **Check Health**: `curl http://localhost:3000/api/health`
- **View Logs**: `tail -f /mnt/pocketcloud/logs/app-*.log`

### API Documentation

See individual feature docs for API endpoints and examples.

## 📊 Feature Matrix

| Feature | Status | Documentation |
|---------|--------|---------------|
| File Management | ✅ | Core functionality |
| Folder Sync | ✅ | [Sync Protocol](features/FOLDER_SYNC_PROTOCOL.md) |
| Auto Photo Backup | ✅ | [Photo Backup](features/AUTO_PHOTO_BACKUP.md) |
| File Versioning | ✅ | Core functionality |
| Deduplication | ✅ | Core functionality |
| Full-Text Search | ✅ | Core functionality |
| Share Links | ✅ | Core functionality |
| WebDAV | ✅ | Core functionality |
| Encryption | ✅ | Core functionality |
| Webhooks | ✅ | [Webhooks](features/WEBHOOKS.md) |
| Pipeline Rules | ✅ | [Pipeline](features/FILE_PIPELINE_RULES.md) |
| Storage Analytics | ✅ | [Analytics](features/STORAGE_ANALYTICS.md) |
| Health Monitoring | ✅ | [Health](features/HEALTH_MONITOR.md) |
| Network Modes | ✅ | [Network](features/NETWORK_MODE_SWITCHER.md) |
| Zero-Config Discovery | ✅ | [Discovery](features/ZERO_CONFIG_DISCOVERY.md) |

## 🔧 Development

### Running Tests

```bash
# Unit tests
cd backend && npm test

# Feature tests (requires running backend)
ADMIN_USER=admin ADMIN_PASS=pass bash scripts/verify/04-feature-tests.sh

# All tests
ADMIN_USER=admin ADMIN_PASS=pass bash scripts/verify/run-all-tests.sh
```

### Code Structure

```
backend/src/
├── routes/        # API endpoints
├── services/      # Business logic
├── middleware/    # Express middleware
├── db/           # Database & migrations
├── utils/        # Utilities
└── tests/        # Unit tests
```

## 📝 Contributing

When adding new features:

1. Create feature documentation in `docs/features/`
2. Add tests in `backend/src/tests/`
3. Update this README
4. Run verification suite

## 🐛 Troubleshooting

See [scripts/verify/TROUBLESHOOTING.md](../scripts/verify/TROUBLESHOOTING.md) for common issues and fixes.

## 📞 Support

- Check documentation in this folder
- Review troubleshooting guide
- Check logs: `/mnt/pocketcloud/logs/`
- Run smoke test: `bash scripts/verify/01-smoke-test.sh`
