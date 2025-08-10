import requests
import json
import csv
from datetime import datetime

def fetch_pottery_barn_data():
    """Fetch data from Pottery Barn API"""
    url = "https://ac.cnstrc.com/search/sofa"
    params = {
        "c": "ciojs-client-2.66.0",
        "key": "key_w3v8XC1kGR9REv46",
        "i": "f70eef75-549d-4dc0-98e1-5addb6c8c3cc",
        "s": "3",
        "offset": "0",
        "num_results_per_page": "20",
    }
    
    try:
        response = requests.get(url, params=params)
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
    print(f"POTTERY BARN SOFA COLLECTION ({len(products)} items found)")
    print(f"{'='*60}")
    
    for i, product in enumerate(products, 1):
        print(f"\n{i}. {product['title']}")
        print(f"   Price: {product['price']}")
        if product['url']:
            print(f"   URL: {product['url']}")
        if product['image']:
            print(f"   Image: {product['image']}")
        print(f"   {'-'*40}")

def main():
    print("Fetching Pottery Barn product data...")
    
    # Fetch data from API
    raw_data = fetch_pottery_barn_data()
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
