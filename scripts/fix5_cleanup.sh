#!/usr/bin/env bash
# Fix 5 — post-unzip cleanup: delete the broadcast feature files.
# Run this once after extracting fix5_admin_hardening.zip into the repo.
set -e

echo "→ Removing /api/admin/broadcast route..."
rm -rf app/api/admin/broadcast

echo "→ Removing /dashboard/broadcast page..."
rm -rf app/dashboard/broadcast

echo "✓ Broadcast feature removed. Users will now see banners in the app instead."
