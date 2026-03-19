#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  Ready2Spray — One-Command Setup
#  Installs Docker (if needed), builds containers, pulls the
#  AI model, and launches the app. Works on macOS and Linux.
# ============================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Detect OS
OS="$(uname -s)"
ARCH="$(uname -m)"

banner() {
  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║                                          ║${NC}"
  echo -e "${GREEN}║   ${BOLD}Ready2Spray — Open Source Setup${NC}${GREEN}         ║${NC}"
  echo -e "${GREEN}║   Aerial & Pest Control Operations       ║${NC}"
  echo -e "${GREEN}║                                          ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
  echo ""
}

log()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn()  { echo -e "  ${YELLOW}⚠${NC} $1"; }
info()  { echo -e "  ${BLUE}→${NC} $1"; }
fail()  { echo -e "  ${RED}✗${NC} $1"; exit 1; }
step()  { echo ""; echo -e "${CYAN}[$1] $2${NC}"; }

# ────────────────────────────────────────────
#  Step 1 — Install Docker if missing
# ────────────────────────────────────────────
install_docker() {
  step "1/5" "Checking Docker installation..."

  if command -v docker &>/dev/null && docker compose version &>/dev/null; then
    log "Docker is already installed ($(docker --version | head -1))"
    return 0
  fi

  warn "Docker is not installed. Installing now..."

  case "$OS" in
    Darwin)
      # macOS — use Homebrew if available, otherwise direct download
      if command -v brew &>/dev/null; then
        info "Installing Docker Desktop via Homebrew..."
        brew install --cask docker
      else
        info "Homebrew not found. Installing Homebrew first..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        # Add Homebrew to PATH for Apple Silicon
        if [[ "$ARCH" == "arm64" ]]; then
          eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || true
        else
          eval "$(/usr/local/bin/brew shellenv)" 2>/dev/null || true
        fi
        info "Installing Docker Desktop via Homebrew..."
        brew install --cask docker
      fi

      # Start Docker Desktop
      info "Starting Docker Desktop..."
      open -a Docker

      # Wait for Docker daemon to be ready
      echo -n "  Waiting for Docker to start (this may take a minute)..."
      for i in $(seq 1 90); do
        if docker info &>/dev/null 2>&1; then
          echo -e " ${GREEN}✓${NC}"
          break
        fi
        if [ "$i" -eq 90 ]; then
          echo ""
          fail "Docker Desktop did not start in time.\n  Open Docker Desktop manually, wait for it to finish starting, then re-run ./setup.sh"
        fi
        sleep 2
      done
      ;;

    Linux)
      # Linux — use official install script
      if command -v apt-get &>/dev/null || command -v yum &>/dev/null || command -v dnf &>/dev/null || command -v pacman &>/dev/null; then
        info "Installing Docker Engine via official install script..."
        curl -fsSL https://get.docker.com | sh

        # Add current user to docker group so they don't need sudo
        if ! groups "$USER" | grep -q docker; then
          sudo usermod -aG docker "$USER"
          warn "Added $USER to the docker group."
          warn "You may need to log out and back in, then re-run ./setup.sh"
        fi

        # Start and enable Docker
        sudo systemctl start docker 2>/dev/null || sudo service docker start 2>/dev/null || true
        sudo systemctl enable docker 2>/dev/null || true

        # Install Docker Compose plugin if not bundled
        if ! docker compose version &>/dev/null 2>&1; then
          info "Installing Docker Compose plugin..."
          sudo apt-get update -qq && sudo apt-get install -y -qq docker-compose-plugin 2>/dev/null \
            || sudo yum install -y docker-compose-plugin 2>/dev/null \
            || sudo dnf install -y docker-compose-plugin 2>/dev/null \
            || true
        fi
      else
        fail "Unsupported Linux distribution.\n  Install Docker manually: https://docs.docker.com/engine/install/"
      fi
      ;;

    *)
      fail "Unsupported OS: $OS\n  Install Docker manually: https://www.docker.com/products/docker-desktop"
      ;;
  esac

  # Final verification
  if ! command -v docker &>/dev/null; then
    fail "Docker installation failed. Install manually: https://docs.docker.com/get-docker/"
  fi

  if ! docker compose version &>/dev/null 2>&1; then
    fail "Docker Compose not available. Update Docker or install docker-compose-plugin."
  fi

  log "Docker installed successfully"
}

# ────────────────────────────────────────────
#  Step 2 — Ensure Docker daemon is running
# ────────────────────────────────────────────
ensure_docker_running() {
  step "2/5" "Verifying Docker daemon..."

  if docker info &>/dev/null 2>&1; then
    log "Docker daemon is running"
    return 0
  fi

  # Try to start Docker
  case "$OS" in
    Darwin)
      info "Starting Docker Desktop..."
      open -a Docker 2>/dev/null || true
      ;;
    Linux)
      info "Starting Docker service..."
      sudo systemctl start docker 2>/dev/null || sudo service docker start 2>/dev/null || true
      ;;
  esac

  echo -n "  Waiting for Docker daemon..."
  for i in $(seq 1 60); do
    if docker info &>/dev/null 2>&1; then
      echo -e " ${GREEN}✓${NC}"
      return 0
    fi
    sleep 2
  done

  echo ""
  fail "Docker daemon is not running.\n  Start Docker Desktop (macOS) or run: sudo systemctl start docker (Linux)"
}

# ────────────────────────────────────────────
#  Step 3 — Configure environment
# ────────────────────────────────────────────
setup_env() {
  step "3/5" "Setting up environment..."

  if [ ! -f .env ]; then
    cp .env.example .env
    # Generate random JWT secret
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 64)
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s/CHANGE_ME_TO_A_RANDOM_STRING_AT_LEAST_32_CHARS/$JWT_SECRET/" .env
    else
      sed -i "s/CHANGE_ME_TO_A_RANDOM_STRING_AT_LEAST_32_CHARS/$JWT_SECRET/" .env
    fi
    log "Created .env with secure JWT secret"
  else
    log ".env already exists, keeping your settings"
  fi
}

# ────────────────────────────────────────────
#  Step 4 — Build and start all containers
# ────────────────────────────────────────────
start_services() {
  step "4/5" "Building and starting services..."
  info "This will download & build: PostgreSQL, Ollama + Qwen AI model, and the app"
  info "First run takes 3-10 minutes depending on your internet speed"
  echo ""

  docker compose up --build -d

  echo ""

  # ── Wait for PostgreSQL ──
  echo -n "  Waiting for PostgreSQL..."
  for i in $(seq 1 30); do
    if docker compose exec -T db pg_isready -U ready2spray &>/dev/null; then
      echo -e " ${GREEN}✓${NC}"
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo -e " ${RED}timeout${NC}"
      fail "PostgreSQL failed to start.\n  Run: docker compose logs db"
    fi
    sleep 2
  done

  # ── Wait for application ──
  echo -n "  Waiting for application..."
  for i in $(seq 1 60); do
    if curl -sf http://localhost:3000/api/health &>/dev/null; then
      echo -e " ${GREEN}✓${NC}"
      break
    fi
    if [ "$i" -eq 60 ]; then
      echo -e " ${RED}timeout${NC}"
      fail "Application failed to start.\n  Run: docker compose logs app"
    fi
    sleep 3
  done

  # ── Wait for Ollama + model ──
  echo -n "  Waiting for Ollama AI model (qwen3.5:4b)..."
  MODEL_READY=false
  for i in $(seq 1 120); do
    # Check if the model is available in Ollama
    if docker compose exec -T ollama ollama list 2>/dev/null | grep -q "qwen3.5"; then
      echo -e " ${GREEN}✓${NC}"
      MODEL_READY=true
      break
    fi
    # Show progress every 15 seconds
    if [ $((i % 5)) -eq 0 ]; then
      echo -n "."
    fi
    sleep 3
  done

  if [ "$MODEL_READY" = false ]; then
    warn "AI model is still downloading in the background."
    warn "The chat feature will work once the download finishes."
    warn "Check progress: docker compose logs -f ollama-setup"
  fi
}

# ────────────────────────────────────────────
#  Step 5 — Done!
# ────────────────────────────────────────────
show_success() {
  step "5/5" "Setup complete!"
  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║                                          ║${NC}"
  echo -e "${GREEN}║   ${BOLD}Ready2Spray is running!${NC}${GREEN}                 ║${NC}"
  echo -e "${GREEN}║                                          ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  ${BOLD}Open in your browser:${NC}"
  echo -e "  ${CYAN}http://localhost:3000${NC}"
  echo ""
  echo -e "  ${BOLD}Login:${NC} Click ${CYAN}\"Quick Login\"${NC} on the login page"
  echo -e "         (or register a new account)"
  echo ""
  echo -e "  ${BOLD}Services running:${NC}"
  echo -e "  ├── App          ${CYAN}http://localhost:3000${NC}"
  echo -e "  ├── PostgreSQL   localhost:5432"
  echo -e "  └── Ollama AI    localhost:11434"
  echo ""
  echo -e "  ${BOLD}Useful commands:${NC}"
  echo -e "  ${BLUE}docker compose logs -f app${NC}     View app logs"
  echo -e "  ${BLUE}docker compose logs -f ollama${NC}  View AI model logs"
  echo -e "  ${BLUE}docker compose down${NC}            Stop all services"
  echo -e "  ${BLUE}docker compose up -d${NC}           Start services"
  echo -e "  ${BLUE}docker compose down -v${NC}         Reset everything (deletes data)"
  echo ""
  echo -e "  ${BOLD}Optional integrations:${NC}"
  echo -e "  • Google Maps  → Add GOOGLE_MAPS_API_KEY to .env"
  echo -e "  • Cloud AI     → Set LLM_PROVIDER=anthropic + API key in .env"
  echo -e "  • See ${CYAN}docs/INTEGRATIONS.md${NC} for all options"
  echo ""
}

# ── Main ──
banner
install_docker
ensure_docker_running
setup_env
start_services
show_success
