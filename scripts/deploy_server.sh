#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH=""
PROJECT_DIR="/home/ubuntu/strategy-lab"
SERVER_NAME="_"
ALLOWED_ORIGIN=""
SERVICE_NAME="strategy-lab-backend"
SHARED_MONGO_URI=""
SHARED_MONGO_DB="strategy_lab"
SHARED_MONGO_COLLECTION="shared_kv"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive)
      ARCHIVE_PATH="$2"
      shift 2
      ;;
    --project-dir)
      PROJECT_DIR="$2"
      shift 2
      ;;
    --server-name)
      SERVER_NAME="$2"
      shift 2
      ;;
    --allowed-origin)
      ALLOWED_ORIGIN="$2"
      shift 2
      ;;
    --service-name)
      SERVICE_NAME="$2"
      shift 2
      ;;
    --mongo-uri)
      SHARED_MONGO_URI="$2"
      shift 2
      ;;
    --mongo-db)
      SHARED_MONGO_DB="$2"
      shift 2
      ;;
    --mongo-collection)
      SHARED_MONGO_COLLECTION="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${ARCHIVE_PATH}" ]]; then
  echo "Missing --archive path" >&2
  exit 1
fi

if [[ -z "${ALLOWED_ORIGIN}" ]]; then
  if [[ "${SERVER_NAME}" == "_" ]]; then
    echo "Missing --allowed-origin when server_name is _" >&2
    exit 1
  fi
  ALLOWED_ORIGIN="http://${SERVER_NAME}"
fi

if [[ ! -f "${ARCHIVE_PATH}" ]]; then
  echo "Archive not found: ${ARCHIVE_PATH}" >&2
  exit 1
fi

if [[ -z "${SHARED_MONGO_URI}" ]]; then
  echo "Missing --mongo-uri (required for persistent shared backend storage)" >&2
  exit 1
fi

echo "[1/8] Install system packages"
sudo apt update
sudo apt install -y nginx python3-venv python3-pip curl git rsync

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi

echo "[2/8] Extract project"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT
tar -xzf "${ARCHIVE_PATH}" -C "${TMP_DIR}"

if [[ ! -d "${TMP_DIR}/strategy-lab" ]]; then
  echo "Archive content invalid: strategy-lab directory not found" >&2
  exit 1
fi

rm -rf "${PROJECT_DIR}"
mkdir -p "$(dirname "${PROJECT_DIR}")"
mv "${TMP_DIR}/strategy-lab" "${PROJECT_DIR}"

echo "[3/8] Build frontend"
cd "${PROJECT_DIR}"
npm ci
npm run build

echo "[4/8] Publish frontend files"
sudo mkdir -p /var/www/strategy-lab
sudo rsync -a --delete "${PROJECT_DIR}/dist/" /var/www/strategy-lab/

echo "[5/8] Setup backend virtualenv"
cd "${PROJECT_DIR}"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt

echo "[6/8] Configure systemd service"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
sudo tee "${SERVICE_FILE}" > /dev/null <<EOF
[Unit]
Description=Strategy Lab Backend
After=network.target

[Service]
User=${USER}
WorkingDirectory=${PROJECT_DIR}
Environment=MARKET_API_ALLOWED_ORIGINS=${ALLOWED_ORIGIN}
Environment=MARKET_SHARED_STORE_REQUIRED=1
Environment=MARKET_SHARED_STORE_MONGODB_URI=${SHARED_MONGO_URI}
Environment=MARKET_SHARED_STORE_MONGODB_DB=${SHARED_MONGO_DB}
Environment=MARKET_SHARED_STORE_MONGODB_COLLECTION=${SHARED_MONGO_COLLECTION}
ExecStart=${PROJECT_DIR}/.venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --app-dir ${PROJECT_DIR}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now "${SERVICE_NAME}"

echo "[7/8] Configure nginx"
NGINX_FILE="/etc/nginx/sites-available/strategy-lab"
sudo tee "${NGINX_FILE}" > /dev/null <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    root /var/www/strategy-lab;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/strategy-lab /etc/nginx/sites-enabled/strategy-lab
sudo nginx -t
sudo systemctl restart nginx

echo "[8/8] Verify"
echo "Backend health:"
curl -fsS http://127.0.0.1:8000/api/health || true
echo
echo "Public health:"
if [[ "${SERVER_NAME}" == "_" ]]; then
  echo "Use your server IP: http://<SERVER_IP>/api/health"
else
  curl -fsS "http://${SERVER_NAME}/api/health" || true
fi
echo
echo "Done."
