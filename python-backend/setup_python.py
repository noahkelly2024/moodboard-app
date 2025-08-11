#!/usr/bin/env python3
"""
Simple Python setup script to install dependencies without shell scripts
"""

import subprocess
import sys
import os
from pathlib import Path

def main():
    # Get the directory where this script is located
    script_dir = Path(__file__).parent
    requirements_file = script_dir / 'requirements.txt'
    
    if not requirements_file.exists():
        print("No requirements.txt found")
        return
    
    print("Installing Python dependencies...")
    
    try:
        # Try to install with pip
        subprocess.check_call([
            sys.executable, '-m', 'pip', 'install', '-r', str(requirements_file)
        ])
        print("Dependencies installed successfully!")
        
    except subprocess.CalledProcessError as e:
        print(f"Warning: Failed to install some dependencies: {e}")
        print("The app may still work with system-installed packages")
        
    except Exception as e:
        print(f"Error installing dependencies: {e}")

if __name__ == '__main__':
    main()
