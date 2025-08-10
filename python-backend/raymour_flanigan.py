import requests
import csv
import uuid
import time
from urllib.parse import quote_plus

API_BASE = "https://ac.cnstrc.com"
API_KEY = "key_1tigFZoUEs7Ygkww"
CLIENT_LIB = "cio-ui-autocomplete-1.23.27"
ORIGIN = "https://www.raymourflanigan.com"
REFERER = "https://www.raymourflanigan.com/"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": ORIGIN,
    "Referer": REFERER,
}

def fetch_raymour_flanigan_autocomplete(query="rug", num_suggestions=0, num_products=12, client_id=None, session="1"):
    """Call Raymour & Flanigan (Constructor.io) autocomplete API for a query.

    Set num_products>0 to also retrieve product hits alongside suggestions.
    """
    if not client_id:
        client_id = str(uuid.uuid4())

    url = f"{API_BASE}/autocomplete/{quote_plus(query)}"
    params = {
        "c": CLIENT_LIB,
        "key": API_KEY,
        "i": client_id,
        "s": str(session),
        # Note: the API expects this exact key with a space in it; requests will encode it properly.
        "num_results_Products": str(num_products),
        "num_results_Search Suggestions": str(num_suggestions),
        "_dt": str(int(time.time() * 1000)),
    }

    try:
        resp = requests.get(url, headers=HEADERS, params=params, timeout=20)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        print(f"Error fetching Raymour & Flanigan autocomplete: {e}")
        return None


def extract_results(data, fallback_query="", include_suggestions=False):
    """Extract a flat list of products (and optional suggestions) from autocomplete payload.

    Returns list of dicts with keys: title, price, url, image.
    Set include_suggestions=True to include search suggestions; by default only products are returned.
    """
    results = []
    if not data:
        return results

    sections = data.get("sections") or {}

    # Suggestions (optional)
    if include_suggestions:
        for item in sections.get("Search Suggestions", []) or []:
            title = item.get("value") or ""
            search_url = f"https://www.raymourflanigan.com/search?page=1&redirectQuery={quote_plus(title)}" if title else ""
            results.append({
                "title": title,
                "price": "",
                "url": search_url,
                "image": "",
            })

    # Products (if requested)
    for item in sections.get("Products", []) or []:
        data_obj = item.get("data") or {}
        title = data_obj.get("title") or item.get("value") or ""
        image = data_obj.get("image_url", "")
        url = data_obj.get("url", "")
        # price may be present as lowestPrice or salePriceMin
        price = data_obj.get("lowestPrice") or data_obj.get("salePriceMin") or ""
        if isinstance(price, (int, float)):
            price = f"${price}"
        elif price:
            price = price if str(price).startswith("$") else f"${price}"

        results.append({
            "title": title,
            "price": price,
            "url": url,
            "image": image,
        })

    # Fallback: if no sections found, try legacy shapes
    if not results:
        response = data.get("response") or {}
        for item in response.get("results", []) or []:
            d = item.get("data") or {}
            results.append({
                "title": d.get("title", ""),
                "price": f"${d.get('lowestPrice')}" if d.get("lowestPrice") else (f"${d.get('salePriceMin')}" if d.get("salePriceMin") else ""),
                "url": d.get("url", ""),
                "image": d.get("image_url", ""),
            })

    return results


def save_to_csv(rows, filename="raymour_flanigan_results.csv"):
    if not rows:
        print("No results to save to CSV")
        return
    # Only keep the desired columns in the CSV
    fields = ["title", "price", "url", "image"]
    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    print(f"CSV data saved to {filename}")


def display_rows(rows, query):
    if not rows:
        print("No results to display")
        return
    print(f"\n{'='*60}")
    print(f"RAYMOUR & FLANIGAN RESULTS FOR '{query}' ({len(rows)} rows)")
    print(f"{'='*60}")
    for i, r in enumerate(rows, 1):
        print(f"\n{i}. {r.get('title', '')}")
        if r.get("price"):
            print(f"   Price: {r['price']}")
        if r.get("url"):
            print(f"   URL: {r['url']}")
        if r.get("image"):
            print(f"   Image: {r['image']}")
        print(f"   {'-'*40}")


def main():
    query = "rug"
    print("Fetching Raymour & Flanigan autocomplete data...")

    # Ask API for only products (no suggestions) and request more than 4 products
    raw = fetch_raymour_flanigan_autocomplete(query=query, num_suggestions=0, num_products=12)
    if not raw:
        print("Failed to fetch data. Exiting.")
        return

    # Extract only product rows
    rows = extract_results(raw, fallback_query=query, include_suggestions=False)
    print(f"Successfully extracted {len(rows)} rows")

    if rows:
        save_to_csv(rows, filename="raymour_flanigan_results.csv")
        display_rows(rows, query)
        print(f"\n{'='*60}")
        print("DATA EXPORT SUMMARY:")
        print(f"• CSV file: raymour_flanigan_results.csv ({len(rows)} rows)")
        print(f"{'='*60}")
    else:
        print("No results found to export")


if __name__ == "__main__":
    main()