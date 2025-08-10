import requests
import json
import csv
from datetime import datetime
from urllib.parse import quote_plus

try:
    from constructor_keys import get_keys as ctor_get_keys
except Exception:
    ctor_get_keys = None  # type: ignore

# Default fallbacks
_DEFAULT_KEY = "key_w3v8XC1kGR9REv46"
_DEFAULT_CLIENTLIB = "ciojs-client-2.66.0"


def fetch_pottery_barn_data(query: str = "sofa", num_results: int = 20):
    """Fetch data from Pottery Barn Constructor.io Search API for a given query."""
    url = f"https://ac.cnstrc.com/search/{quote_plus(query)}"
    # Pull overrides from store on every call
    api_key = _DEFAULT_KEY
    client_lib = _DEFAULT_CLIENTLIB
    if 'ctor_get_keys' in globals() and ctor_get_keys:
        try:
            k, c = ctor_get_keys('pottery_barn', fallback_key=api_key, fallback_clientlib=client_lib)
            api_key = k or api_key
            client_lib = c or client_lib
        except Exception:
            pass
    params = {
        "c": client_lib,
        "key": api_key,
        "i": "f70eef75-549d-4dc0-98e1-5addb6c8c3cc",
        "s": "3",
        "offset": "0",
        "num_results_per_page": str(num_results),
    }
    try:
        response = requests.get(url, params=params, timeout=20)
        response.raise_for_status()  # Raise an exception for bad status codes
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data: {e}")
        return None


def extract_product_info(data):
    """Extract structured product information from API response"""
    products = []
    
    if not data or 'response' not in data or 'results' not in data['response']:
        # Try alternative data structure
        if 'results' in data:
            results = data['results']
        else:
            print("No product data found in API response")
            return products
    else:
        results = data['response']['results']
    
    for item in results:
        product_data = item.get('data', {})
        
        # Format price - use lowest price if available, otherwise use min price
        price = product_data.get('lowestPrice', '')
        if not price:
            price_min = product_data.get('salePriceMin', '')
            if price_min:
                price = f"${price_min}"
        elif price:
            price = f"${price}"
        
        product = {
            'title': product_data.get('title', ''),
            'price': price,
            'url': product_data.get('url', ''),
            'image': product_data.get('image_url', ''),
        }
        products.append(product)
    
    return products


def save_to_csv(products, filename="pottery_barn_products.csv"):
    """Save products to CSV file"""
    if not products:
        print("No products to save to CSV")
        return
    
    # Only use the 4 columns we want
    fieldnames = ['title', 'price', 'url', 'image']
    
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(products)
    
    print(f"CSV data saved to {filename}")


def display_products(products):
    """Display product information in console"""
    if not products:
        print("No products to display")
        return
    
    print(f"\n{'='*60}")
    print(f"POTTERY BARN COLLECTION ({len(products)} items found)")
    print(f"{'='*60}")
    
    for i, product in enumerate(products, 1):
        print(f"\n{i}. {product['title']}")
        if product.get('price'):
            print(f"   Price: {product['price']}")
        if product.get('url'):
            print(f"   URL: {product['url']}")
        if product.get('image'):
            print(f"   Image: {product['image']}")
        print(f"   {'-'*40}")


def main():
    query = "sofa"
    print("Fetching Pottery Barn product data...")
    
    # Fetch data from API
    raw_data = fetch_pottery_barn_data(query=query)
    if not raw_data:
        print("Failed to fetch data. Exiting.")
        return
    
    # Extract structured product information
    products = extract_product_info(raw_data)
    print(f"Successfully extracted {len(products)} products")
    
    if products:
        # Save data to csv
        save_to_csv(products)
        
        # Display products in console
        display_products(products)
        
        print(f"\n{'='*60}")
        print("DATA EXPORT SUMMARY:")
        print(f"• CSV file: pottery_barn_products.csv ({len(products)} products)")  
        print(f"{'='*60}")
    else:
        print("No products found to export")


if __name__ == "__main__":
    main()
