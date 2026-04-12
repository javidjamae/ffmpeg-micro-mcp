#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status()  { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

check_prerequisites() {
    print_status "Checking prerequisites..."

    if ! command -v node > /dev/null; then
        print_error "Node.js is not installed. Required: >=22.14.0"
        exit 1
    fi

    NODE_VERSION=$(node -e "process.stdout.write(process.versions.node)")
    REQUIRED_MAJOR=22
    ACTUAL_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
    if [ "$ACTUAL_MAJOR" -lt "$REQUIRED_MAJOR" ]; then
        print_error "Node.js $NODE_VERSION is too old. Required: >=$REQUIRED_MAJOR"
        exit 1
    fi

    if ! command -v npm > /dev/null; then
        print_error "npm is not installed."
        exit 1
    fi

    print_success "Prerequisites OK (Node.js $NODE_VERSION)"
}

install_dependencies() {
    print_status "Installing dependencies..."
    npm install
    print_success "Dependencies installed"
}

build_project() {
    print_status "Building..."
    npm run build
    print_success "Build successful"
}

configure_git_hooks() {
    print_status "Configuring git hooks..."
    git config core.hooksPath .githooks
    print_success "Git hooks configured (.githooks/pre-push active)"
}

main() {
    print_status "Setting up ffmpeg-micro-mcp..."
    echo ""

    check_prerequisites
    install_dependencies
    build_project
    configure_git_hooks

    echo ""
    print_success "Setup complete!"
    echo ""
    echo "  Stdio (npm package):  npm start"
    echo "  HTTP (local dev):     FFMPEG_MICRO_API_URL=http://localhost:8081 npm run serve"
    echo "  Tests:                npm test"
    echo ""
}

main "$@"
