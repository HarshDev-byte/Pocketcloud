#!/bin/bash

# Fix all config imports in services
find backend/src/services -name "*.js" -type f -exec sed -i.bak 's|require('\''../config/|require('\''../../config/|g' {} \;

# Clean up backup files
find backend/src/services -name "*.bak" -delete

echo "Fixed all config imports in services"