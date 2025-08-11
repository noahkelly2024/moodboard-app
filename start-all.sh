#!/bin/bash
set -e

echo "🚀 Starting Mood Board App with Backend Services"
echo "================================================"

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

# Check Node.js availability
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 18+ and try again.${NC}"
    exit 1
fi

# Check Python availability
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 is not installed. Please install Python 3.8+ and try again.${NC}"
    exit 1
fi

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
echo -e "${BLUE}🌟 Starting both frontend and backend services...${NC}"
echo ""
echo -e "${GREEN}Frontend:${NC} http://localhost:3000"
echo -e "${GREEN}Backend:${NC}  http://localhost:5000"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop both services${NC}"
echo ""

# Start both services with concurrently
npm run start
