#!/bin/bash
set -e

echo "🚀 Starting Mood Board App in Production Mode"
echo "============================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3 first."
    exit 1
fi

echo "✅ Prerequisites check passed"
echo ""

# Install Node.js dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Node.js dependencies..."
    npm install
    echo "✅ Node.js dependencies installed"
else
    echo "✅ Node.js dependencies already installed"
fi

# Build the Next.js application
echo ""
echo "🔨 Building Next.js application..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please check the errors above."
    exit 1
fi

echo "✅ Next.js application built successfully"
echo ""

# Setup Python backend
echo "🐍 Setting up Python backend..."
cd python-backend

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment and install dependencies
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "✅ Python backend setup complete"
echo ""

cd ..

# Start both services
echo "🚀 Starting both frontend and backend services..."
echo "   Frontend: http://localhost:3000"
echo "   Backend: http://127.0.0.1:5000"
echo ""
echo "Press Ctrl+C to stop both services"
echo ""

# Use the npm start command which runs both services concurrently
npm run start
