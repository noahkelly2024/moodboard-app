#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

VENV_DIR="$SCRIPT_DIR/venv"
PYTHON_BIN="python3"
if [ ! -d "$VENV_DIR" ]; then
  echo "Creating virtual environment at $VENV_DIR"
  python3 -m venv "$VENV_DIR"
fi

if [ -x "$VENV_DIR/bin/python" ]; then
  PYTHON_BIN="$VENV_DIR/bin/python"
  echo "Using virtual environment: $VENV_DIR"
fi

echo "Upgrading pip..."
$PYTHON_BIN -m pip install --upgrade pip

echo "Installing/Updating dependencies with $PYTHON_BIN -m pip..."
$PYTHON_BIN -m pip install -r requirements.txt

export PYTHONUNBUFFERED=1

echo "Starting backend on http://127.0.0.1:5000"
exec $PYTHON_BIN app.py
