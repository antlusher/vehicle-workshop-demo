#!/bin/bash
set -e

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root or with sudo"
  exit 1
fi

if [ -z "$1" ]; then
  echo "Usage: $0 <repo-url> [branch]"
  exit 1
fi

REPO_URL="$1"
BRANCH="${2:-main}"
WORKDIR="/opt/vehicle-workshop"

apt-get update -y
apt-get install -y docker.io docker-compose-plugin git
usermod -aG docker "$SUDO_USER"
systemctl enable docker
systemctl start docker

mkdir -p "$WORKDIR"
cd "$WORKDIR"
rm -rf ./*
git clone --branch "$BRANCH" "$REPO_URL" .

cat > server/.env <<'EOF'
OPENAI_API_KEY=
REG_LOOKUP_API_URL=
REG_LOOKUP_API_KEY=
CLIENT_ORIGIN=http://localhost:5173
EOF

docker compose up --build -d

echo "Deployment complete. Visit http://$(curl -s ifconfig.me):5173"