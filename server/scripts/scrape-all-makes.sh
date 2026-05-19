#!/bin/bash
# Scrape all makes that have no listing page — uses /search?q= discovery
# Run after the main scrape-enginecodes.js has completed

set -e
cd "$(dirname "$0")/../.."

MAKES=(
  vauxhall
  volkswagen
  toyota
  honda
  renault
  peugeot
  citroen
  nissan
  "mercedes-benz"
  "land-rover"
  jaguar
  kia
  hyundai
  volvo
  mazda
  mitsubishi
  fiat
  porsche
  subaru
  suzuki
  saab
  "range-rover"
  skoda
  seat
)

for make in "${MAKES[@]}"; do
  echo ""
  echo "════════════════════════════════════════"
  echo "  Scraping: $make"
  echo "════════════════════════════════════════"
  node server/scripts/scrape-enginecodes.js --search="$make"
done

echo ""
echo "All makes done. Running import..."
node server/scripts/import-reference-data.js --engines
