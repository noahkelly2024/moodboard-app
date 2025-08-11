#!/usr/bin/env python3
"""
Setup script for macOS - installs Python dependencies for the mood board app
Run this once on your Mac before running the app
"""

import subprocess
import sys
import os

def main():
    print("Setting up Python dependencies for Mood Board App...")
    
    # Check if we're in the right directory
    if not os.path.exists('requirements.txt'):
        print("Error: requirements.txt not found. Please run this script from the python-backend directory.")
        sys.exit(1)
    
    print("Installing dependencies...")
    
    try:
        # Install dependencies
        subprocess.check_call([
            sys.executable, '-m', 'pip', 'install', '--user', '-r', 'requirements.txt'
        ])
        print("✅ Python dependencies installed successfully!")
        print("\nYou can now run the app with:")
        print("  npm run electron")
        print("  or")
        print("  npm run dev")
        
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install dependencies: {e}")
        print("\nTry installing manually:")
        print("  pip3 install --user flask flask-cors rembg pillow numpy opencv-python")
        sys.exit(1)
        
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
