#!/usr/bin/env bash
# Adds `export const dynamic = "force-dynamic"` and `export const runtime = "nodejs"`
# to every admin API route + auth route.
#
# Why: Next.js sees middleware.ts and tries to do "page data collection" on every
# route at build time. Routes that call cookies() via getSession() then fail with
# "Cannot access X before initialization" because getSession() can't run in a
# build-time context. Marking the routes dynamic skips collection and lets them
# only run at request time (which is what they should do anyway).
#
# Idempotent — if a file already has `export const dynamic`, it's left alone.

set -e

ROUTES=$(find app/api/admin app/api/auth -name "route.ts" 2>/dev/null)

for f in $ROUTES; do
  if grep -q "export const dynamic" "$f"; then
    echo "  skip (already dynamic): $f"
    continue
  fi
  # Insert after the first line of imports (we'll put it right after `import { NextResponse }`)
  # Use a Python one-liner for safety with the file modification
  python3 <<PYEOF
with open("$f") as fh:
    content = fh.read()

# Find the last consecutive import line at the top
lines = content.split("\n")
last_import = -1
for i, line in enumerate(lines):
    if line.startswith("import ") or line.startswith("import{"):
        last_import = i
    elif line.strip() == "" and last_import >= 0 and i < len(lines) - 1 and lines[i+1].startswith("import"):
        continue  # blank line between imports
    elif last_import >= 0:
        break

if last_import < 0:
    # No imports found — prepend at the top
    new_content = 'export const dynamic = "force-dynamic"\nexport const runtime = "nodejs"\n\n' + content
else:
    # Insert after the last import line, with a blank line before the new exports
    insertion = ['', 'export const dynamic = "force-dynamic"', 'export const runtime = "nodejs"']
    new_lines = lines[:last_import + 1] + insertion + lines[last_import + 1:]
    new_content = "\n".join(new_lines)

with open("$f", "w") as fh:
    fh.write(new_content)
print(f"  patched: $f")
PYEOF
done

echo "✓ All admin/auth routes now marked dynamic."
