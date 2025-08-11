#!/bin/bash
set -e

echo "🚀 Starting Mood Board App (Development Mode)"
echo "=============================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to kill processes on specific ports
kill_port() {
    local port=$1
    echo -e "${YELLOW}Checking port $port...${NC}"
    if check_port $port; then
        echo -e "${YELLOW}Port $port is in use. Attempting to free it...${NC}"
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
}

# Check if we're in the right directory
if [[ ! -f "package.json" ]] || [[ ! -d "python-backend" ]]; then
    echo -e "${RED}❌ Please run this script from the moodboard-app root directory.${NC}"
    exit 1
fi

echo -e "${BLUE}📦 Installing/updating Node.js dependencies...${NC}"
npm install

# Clean up any existing processes on our ports
kill_port 3000  # Next.js frontend
kill_port 5000  # Python backend

echo -e "${BLUE}🐍 Setting up Python backend environment...${NC}"
cd python-backend

# Setup Python virtual environment if it doesn't exist
if [[ ! -d "venv" ]]; then
    echo -e "${BLUE}Creating Python virtual environment...${NC}"
    python3 -m venv venv
fi

# Activate virtual environment and install dependencies
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

cd ..

echo -e "${GREEN}✅ Environment setup complete!${NC}"
echo -e "${BLUE}🌟 Starting both frontend and backend services in development mode...${NC}"
echo ""
echo -e "${GREEN}Frontend:${NC} http://localhost:3000 (with hot reload)"
echo -e "${GREEN}Backend:${NC}  http://localhost:5000 (with auto-reload)"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop both services${NC}"
echo ""

# Start both services in development mode with concurrently
npm run dev
