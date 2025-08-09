#!/usr/bin/env python3

# Simple test to check if rembg imports correctly
try:
    print("Testing imports...")
    import flask
    print("✓ Flask imported successfully")
    
    import rembg
    print("✓ rembg imported successfully")
    
    from rembg import remove, new_session
    print("✓ rembg functions imported successfully")
    
    print("Creating session...")
    session = new_session('u2net')
    print("✓ u2net session created successfully")
    
    print("\nAll imports and basic setup successful!")
    print("Available models should be working.")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
