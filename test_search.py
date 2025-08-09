#!/usr/bin/env python3
"""
Test script for the furniture search functionality
"""

import requests
import json
import sys

def test_search_endpoint():
    """Test the /search-furniture endpoint"""
    
    print("Testing furniture search endpoint...")
    
    # Test data
    test_queries = [
        "chair",
        "table", 
        "sofa",
        "lamp",
        "bookshelf"
    ]
    
    base_url = "http://127.0.0.1:5000"
    
    # Test health endpoint first
    try:
        health_response = requests.get(f"{base_url}/health", timeout=5)
        if health_response.status_code == 200:
            print("✓ Backend health check passed")
        else:
            print("✗ Backend health check failed")
            return False
    except requests.exceptions.RequestException as e:
        print(f"✗ Cannot connect to backend: {e}")
        return False
    
    # Test search endpoint with different queries
    for query in test_queries:
        try:
            payload = {
                "query": query,
                "filters": {
                    "category": "all",
                    "priceRange": "all",
                    "style": "all"
                }
            }
            
            print(f"\n🔍 Searching for: '{query}'")
            response = requests.post(
                f"{base_url}/search-furniture",
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    results = data.get('results', [])
                    print(f"  ✓ Found {len(results)} results")
                    
                    # Show first few results
                    for i, result in enumerate(results[:3]):
                        title = result.get('title', 'Unknown')
                        price = result.get('price', 'N/A')
                        site = result.get('site', 'Unknown')
                        print(f"    {i+1}. {title} - {price} ({site})")
                        
                    if len(results) > 3:
                        print(f"    ... and {len(results) - 3} more results")
                else:
                    print(f"  ✗ Search failed: {data.get('error', 'Unknown error')}")
            else:
                print(f"  ✗ HTTP {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            print(f"  ✗ Request failed: {e}")
        except json.JSONDecodeError as e:
            print(f"  ✗ Invalid JSON response: {e}")
    
    return True

if __name__ == "__main__":
    print("🔍 Furniture Search Test")
    print("=" * 50)
    
    success = test_search_endpoint()
    
    print("\n" + "=" * 50)
    if success:
        print("✓ Test completed successfully!")
    else:
        print("✗ Test failed!")
        sys.exit(1)
