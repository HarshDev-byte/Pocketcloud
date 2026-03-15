# Pocket Cloud Drive - Development Makefile
# Optimized for Mac development, Raspberry Pi 4B target

.PHONY: help dev-backend dev-frontend sync deploy logs ssh status backup tunnel tunnel-stop ssh-config clean install test

# Default target
help:
	@echo "Pocket Cloud Drive - Development Commands"
	@echo ""
	@echo "Development:"
	@echo "  make dev-backend    - Run backend locally on Mac (ts-node-dev)"
	@echo "  make dev-frontend   - Run frontend dev server (Vite)"
	@echo "  make dev            - Run both backend and frontend"
	@echo ""
	@echo "Deployment:"
	@echo "  make sync           - Sync code to Pi (development)"
	@echo "  make sync-watch     - Sync code to Pi with file watching"
	@echo "  make deploy         - Full production deployment to Pi"
	@echo ""
	@echo "Pi Management:"
	@echo "  make logs           - Show Pi backend logs"
	@echo "  make ssh            - SSH into Pi"
	@echo "  make status         - Show Pi service status"
	@echo "  make backup         - Trigger database backup on Pi"
	@echo "  make restart        - Restart Pi services"
	@echo ""
	@echo "Development Tools:"
	@echo "  make tunnel         - Start SSH tunnel for local development"
	@echo "  make tunnel-stop    - Stop SSH tunnel"
	@echo "  make ssh-config     - Configure SSH access to Pi"
	@echo ""
	@echo "Security:"
	@echo "  make firewall       - Setup Pi firewall (run on Pi)"
	@echo "  make https          - Setup HTTPS with self-signed cert (run on Pi)"
	@echo "  make security-check - Run security audit"
	@echo ""
	@echo "Maintenance:"
	@echo "  make install        - Install dependencies (Mac)"
	@echo "  make clean          - Clean build artifacts"
	@echo "  make test           - Run test suite"

# Development - Backend
dev-backend:
	@echo "Starting backend development server..."
	@if [ ! -f .env.local ]; then \
		echo "Creating .env.local for development..."; \
		cp .env.example .env.local; \
		sed -i '' 's|DB_PATH=.*|DB_PATH=./dev.db|' .env.local; \
		sed -i '' 's|STORAGE_PATH=.*|STORAGE_PATH=./dev-storage|' .env.local; \
		sed -i '' 's|UPLOAD_TEMP_DIR=.*|UPLOAD_TEMP_DIR=./dev-uploads|' .env.local; \
		sed -i '' 's|NODE_ENV=.*|NODE_ENV=development|' .env.local; \
	fi
	@mkdir -p dev-storage dev-uploads
	cd backend && npm run dev

# Development - Frontend
dev-frontend:
	@echo "Starting frontend development server..."
	cd frontend && npm run dev

# Development - Both
dev:
	@echo "Starting both backend and frontend..."
	@make -j2 dev-backend dev-frontend

# Sync to Pi (development)
sync:
	@./scripts/dev-sync.sh

# Sync with file watching
sync-watch:
	@./scripts/dev-sync.sh --watch

# Full deployment
deploy:
	@./scripts/deploy.sh

# Pi management
logs:
	@echo "Showing Pi backend logs (Ctrl+C to exit)..."
	@ssh pi@192.168.4.1 "sudo journalctl -u pocketcloud-backend -f --no-pager"

ssh:
	@ssh pi@192.168.4.1

status:
	@echo "Pi Service Status:"
	@ssh pi@192.168.4.1 "systemctl status pocketcloud-backend nginx --no-pager -l"

backup:
	@echo "Triggering database backup on Pi..."
	@ssh pi@192.168.4.1 "curl -X POST http://localhost:3000/api/admin/backup -H 'Content-Type: application/json' -b /opt/pocketcloud/admin-session.cookie || echo 'Backup trigger failed - check admin access'"

restart:
	@echo "Restarting Pi services..."
	@ssh pi@192.168.4.1 "sudo systemctl restart pocketcloud-backend nginx"
	@echo "Services restarted"

# Development tools
tunnel:
	@./scripts/dev-tunnel.sh start

tunnel-stop:
	@./scripts/dev-tunnel.sh stop

tunnel-status:
	@./scripts/dev-tunnel.sh status

ssh-config:
	@./scripts/pi-ssh-config.sh

# Maintenance
install:
	@echo "Installing dependencies..."
	@if ! command -v node >/dev/null 2>&1; then \
		echo "Error: Node.js not found. Install it first:"; \
		echo "  brew install node"; \
		exit 1; \
	fi
	@if ! command -v rsync >/dev/null 2>&1; then \
		echo "Installing rsync..."; \
		brew install rsync; \
	fi
	@if ! command -v fswatch >/dev/null 2>&1; then \
		echo "Installing fswatch..."; \
		brew install fswatch; \
	fi
	cd backend && npm install
	cd frontend && npm install
	@echo "Dependencies installed successfully"

clean:
	@echo "Cleaning build artifacts..."
	@rm -rf backend/dist
	@rm -rf frontend/dist
	@rm -rf backend/node_modules/.cache
	@rm -rf frontend/node_modules/.cache
	@rm -rf dev.db* dev-storage dev-uploads
	@echo "Clean completed"

test:
	@echo "Running test suite..."
	cd backend && npm test
	cd frontend && npm test
	@echo "Tests completed"

# Pi setup (run once)
pi-setup:
	@echo "Setting up Pi for development..."
	@if ! ssh pi@192.168.4.1 "test -d /opt/pocketcloud"; then \
		echo "Copying setup scripts to Pi..."; \
		scp -r scripts/ pi@192.168.4.1:/tmp/pocketcloud-scripts/; \
		ssh pi@192.168.4.1 "cd /tmp/pocketcloud-scripts && sudo ./setup.sh"; \
	else \
		echo "Pi already set up"; \
	fi

# Health check
health:
	@echo "Checking Pi health..."
	@curl -s http://192.168.4.1:3000/api/health | jq . || echo "Health check failed"

# Show Pi system info
pi-info:
	@echo "Pi System Information:"
	@ssh pi@192.168.4.1 "echo 'Hostname:' && hostname && echo 'Uptime:' && uptime && echo 'Memory:' && free -h && echo 'Disk:' && df -h /mnt/pocketcloud && echo 'Temperature:' && vcgencmd measure_temp"

# Development database reset
db-reset:
	@echo "Resetting development database..."
	@rm -f dev.db*
	@rm -rf dev-storage/*
	@echo "Development database reset"

# Show development URLs
urls:
	@echo "Development URLs:"
	@echo "  Frontend (local): http://localhost:5173"
	@echo "  Backend (local):  http://localhost:3000"
	@echo "  Pi Frontend:      http://192.168.4.1"
	@echo "  Pi Backend:       http://192.168.4.1:3000"
	@if ./scripts/dev-tunnel.sh status >/dev/null 2>&1; then \
		echo "  Tunneled Backend: http://localhost:3000"; \
	fi
# Security targets
firewall:
	@echo "Setting up Pi firewall..."
	@ssh pi@192.168.4.1 "sudo /opt/pocketcloud/scripts/firewall-setup.sh"

https:
	@echo "Setting up HTTPS on Pi..."
	@ssh pi@192.168.4.1 "sudo /opt/pocketcloud/scripts/setup-https.sh"

security-check:
	@echo "Running security audit..."
	@echo "Checking file permissions..."
	@ssh pi@192.168.4.1 "ls -la /opt/pocketcloud/backend/.env /opt/pocketcloud/data/ /mnt/pocketcloud/files/"
	@echo "Checking firewall status..."
	@ssh pi@192.168.4.1 "sudo iptables -L -n"
	@echo "Checking SSL certificate..."
	@ssh pi@192.168.4.1 "sudo openssl x509 -in /etc/ssl/pocketcloud/cert.pem -text -noout | grep -E '(Subject:|Not Before|Not After)'" || echo "No SSL certificate found"
	@echo "Checking recent security events..."
	@curl -s http://192.168.4.1:3000/api/admin/security-alerts | jq '.summary' || echo "Could not fetch security alerts"