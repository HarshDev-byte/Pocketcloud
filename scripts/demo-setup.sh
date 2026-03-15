#!/bin/bash
# Demo Environment Setup Script for Pocket Cloud Drive
# Creates realistic demo content and configurations

set -euo pipefail

DEMO_USER="demo"
DEMO_PASS="demo"
STORAGE_PATH="/mnt/pocketcloud/files"
DEMO_PATH="$STORAGE_PATH/$DEMO_USER"

echo "🎬 Setting up Pocket Cloud Drive demo environment..."

# Create demo user
echo "👤 Creating demo user..."
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$DEMO_USER\",\"password\":\"$DEMO_PASS\",\"role\":\"user\"}" || true

# Create directory structure
echo "📁 Creating demo directories..."
mkdir -p "$DEMO_PATH"/{Photos,Documents,Videos,Music,Projects}
mkdir -p "$DEMO_PATH/Photos"/{Vacation_2024,Family,Work_Events}

# Download sample photos from Unsplash (Creative Commons)
echo "📸 Downloading sample photos..."
UNSPLASH_PHOTOS=(
  "photo-1506905925346-21bda4d32df4" # Mountain landscape
  "photo-1441974231531-c6227db76b6e" # Forest path
  "photo-1506905925346-21bda4d32df4" # Beach sunset
  "photo-1441974231531-c6227db76b6e" # City skyline
  "photo-1506905925346-21bda4d32df4" # Coffee shop
)
for i in "${!UNSPLASH_PHOTOS[@]}"; do
  photo_id="${UNSPLASH_PHOTOS[$i]}"
  filename="vacation_$(printf "%02d" $((i+1))).jpg"
  curl -s "https://source.unsplash.com/$photo_id/1920x1080" \
    -o "$DEMO_PATH/Photos/Vacation_2024/$filename" || true
done

# Create sample documents
echo "📄 Creating sample documents..."
cat > "$DEMO_PATH/Documents/Q4_Report.md" << 'EOF'
# Q4 2024 Report

## Executive Summary
This quarter showed exceptional growth across all metrics.

## Key Achievements
- Revenue increased 45% YoY
- Customer satisfaction: 98%
- New product launches: 3

## Next Quarter Goals
- Expand to European markets
- Launch mobile app v2.0
- Hire 15 new team members
EOF

cat > "$DEMO_PATH/Documents/Meeting_Notes.md" << 'EOF'
# Team Meeting - March 15, 2024

## Attendees
- Sarah (Product Manager)
- Mike (Engineering Lead)
- Lisa (Design Director)

## Action Items
- [ ] Finalize API specifications
- [ ] Complete user testing round 2
- [ ] Prepare demo for investors

## Next Meeting
March 22, 2024 at 2:00 PM
EOF

# Create fake large video file for demo
echo "🎥 Creating demo video file..."
fallocate -l 2G "$DEMO_PATH/Videos/4K_Demo_Video.mp4" 2>/dev/null || \
  dd if=/dev/zero of="$DEMO_PATH/Videos/4K_Demo_Video.mp4" bs=1M count=2048 2>/dev/null

# Create sample music files
echo "🎵 Creating sample music files..."
mkdir -p "$DEMO_PATH/Music/Jazz_Playlist"
for i in {1..5}; do
  fallocate -l 8M "$DEMO_PATH/Music/Jazz_Playlist/Track_$(printf "%02d" $i).mp3" 2>/dev/null || \
    dd if=/dev/zero of="$DEMO_PATH/Music/Jazz_Playlist/Track_$(printf "%02d" $i).mp3" bs=1M count=8 2>/dev/null
done

# Create project files
echo "💻 Creating project files..."
cat > "$DEMO_PATH/Projects/website_redesign.md" << 'EOF'
# Website Redesign Project

## Timeline
- Design phase: 2 weeks
- Development: 4 weeks  
- Testing: 1 week
- Launch: April 1, 2024

## Resources
- Designer: Lisa
- Frontend: Mike
- Backend: Sarah
EOF

# Set proper ownership
chown -R www-data:www-data "$DEMO_PATH"
chmod -R 755 "$DEMO_PATH"

# Create share links via API
echo "🔗 Creating demo share links..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$DEMO_USER\",\"password\":\"$DEMO_PASS\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token' 2>/dev/null || echo "")

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  # Create password-protected share
  curl -s -X POST http://localhost:3000/api/shares \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"path":"/Documents/Q4_Report.md","password":"demo123","expiresAt":"2024-12-31T23:59:59Z"}' || true
  
  # Create public share
  curl -s -X POST http://localhost:3000/api/shares \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"path":"/Photos/Vacation_2024","expiresAt":"2024-12-31T23:59:59Z"}' || true
fi

# Create encrypted file
echo "🔒 Creating encrypted demo file..."
cat > "$DEMO_PATH/Documents/Confidential.txt" << 'EOF'
CONFIDENTIAL DOCUMENT

This file contains sensitive information that should be encrypted.
Password: demo123
EOF

# Encrypt the file (if encryption service is available)
if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  curl -s -X POST http://localhost:3000/api/files/encrypt \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"path":"/Documents/Confidential.txt","password":"demo123"}' || true
fi

# Set video playback position for demo
echo "⏯️ Setting video playback position..."
if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  curl -s -X POST http://localhost:3000/api/media/position \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"path":"/Videos/4K_Demo_Video.mp4","position":45}' || true
fi

# Generate thumbnails
echo "🖼️ Generating thumbnails..."
systemctl restart pocketcloud-thumbnail-generator || true

# Create demo admin user
echo "👑 Creating demo admin user..."
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin","role":"admin"}' || true

echo "✅ Demo environment setup complete!"
echo ""
echo "Demo Credentials:"
echo "  User: $DEMO_USER / $DEMO_PASS"
echo "  Admin: admin / admin"
echo ""
echo "Demo Content Created:"
echo "  📸 Photos: 5 vacation photos"
echo "  📄 Documents: Q4 report, meeting notes"
echo "  🎥 Videos: 2GB demo video file"
echo "  🎵 Music: 5 jazz tracks"
echo "  🔗 Share Links: 2 created"
echo "  🔒 Encrypted File: Confidential.txt"
echo ""
echo "Access: http://192.168.4.1"