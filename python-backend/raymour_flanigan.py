import requests
import csv
import uuid
import time
import json
from urllib.parse import quote_plus

API_BASE = "https://ac.cnstrc.com"
API_KEY = "key_1tigFZoUEs7Ygkww"
CLIENT_LIB = "cio-ui-autocomplete-1.23.27"
ORIGIN = "https://www.raymourflanigan.com"
REFERER = "https://www.raymourflanigan.com/"

# NEW: pull overrides from persistent key store when available
try:
    from constructor_keys import get_keys as ctor_get_keys  # type: ignore
except Exception:
    ctor_get_keys = None  # type: ignore

# Optionally override module-level defaults at import time
if 'ctor_get_keys' in globals() and ctor_get_keys:
    try:
        k, c = ctor_get_keys('raymour_flanigan', fallback_key=API_KEY, fallback_clientlib=CLIENT_LIB)
        API_KEY = k or API_KEY
        CLIENT_LIB = c or CLIENT_LIB
    except Exception:
        pass

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": ORIGIN,
    "Referer": REFERER,
}

# Helpers to robustly extract fields

def _parse_json_field(val):
    try:
        if isinstance(val, str) and val.strip().startswith("{"):
            return json.loads(val)
    except Exception:
        return None
    return None


def _format_price(val):
    if val is None or val == "":
        return ""
    try:
        # handle numeric strings
        num = float(val)
        # Keep cents if present in source like 199.95
        return f"${num:.2f}".rstrip("0").rstrip(".") if "." in f"{val}" else f"${num:.2f}".rstrip("0").rstrip(".")
    except Exception:
        s = str(val)
        return s if s.startswith("$") else f"${s}"


def _derive_price(data_obj):
    # Common direct fields first
    for key in ("lowestPrice", "salePriceMin", "salePrice", "price", "min_price", "priceMin", "price_value", "priceUSD"):
        if key in data_obj and data_obj.get(key) not in (None, ""):
            return _format_price(data_obj.get(key))

    # Try embedded Pricing JSON string
    pricing_raw = data_obj.get("Pricing")
    pricing = _parse_json_field(pricing_raw)
    if isinstance(pricing, dict):
        # Prefer sale/price if present
        if pricing.get("price") not in (None, ""):
            return _format_price(pricing.get("price"))
        if pricing.get("overridePrice") not in (None, 0, ""):
            return _format_price(pricing.get("overridePrice"))
        if pricing.get("originalPrice") not in (None, 0, ""):
            return _format_price(pricing.get("originalPrice"))
        # financePricing.amount sometimes mirrors price
        finance = pricing.get("financePricing") or {}
        if isinstance(finance, dict) and finance.get("amount") not in (None, 0, ""):
            return _format_price(finance.get("amount"))

    # Try Analytics JSON string (often contains string price)
    analytics_raw = data_obj.get("Analytics")
    analytics = _parse_json_field(analytics_raw)
    if isinstance(analytics, dict) and analytics.get("price"):
        return _format_price(analytics.get("price"))

    return ""


def _absolutize_url(url):
    if not url:
        return ""
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if url.startswith("/"):
        return f"{ORIGIN}{url}"
    return f"{ORIGIN}/{url}"


def _derive_title(item, data_obj):
    # Prefer explicit title, then item value, then Analytics name
    title = data_obj.get("title") or item.get("value") or ""
    if title:
        return title
    analytics = _parse_json_field(data_obj.get("Analytics"))
    if isinstance(analytics, dict) and analytics.get("name"):
        return analytics.get("name")
    return title


def fetch_raymour_flanigan_autocomplete(query="rug", num_suggestions=0, num_products=12, client_id=None, session="1"):
    """Call Raymour & Flanigan (Constructor.io) autocomplete API for a query.

    Set num_products>0 to also retrieve product hits alongside suggestions.
    """
    if not client_id:
        client_id = str(uuid.uuid4())

    # NEW: get latest key/clientlib from store each call
    api_key = API_KEY
    client_lib = CLIENT_LIB
    if 'ctor_get_keys' in globals() and ctor_get_keys:
        try:
            k, c = ctor_get_keys('raymour_flanigan', fallback_key=api_key, fallback_clientlib=client_lib)
            api_key = k or api_key
            client_lib = c or client_lib
        except Exception:
            pass

    url = f"{API_BASE}/autocomplete/{quote_plus(query)}"
    params = {
        "c": client_lib,
        "key": api_key,
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
        title = _derive_title(item, data_obj)
        image = data_obj.get("image_url", "")
        url = _absolutize_url(data_obj.get("url", ""))
        price = _derive_price(data_obj)

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
            title = d.get("title", "") or item.get("value") or _derive_title(item, d)
            image = d.get("image_url", "")
            url = _absolutize_url(d.get("url", ""))
            price = _derive_price(d)
            results.append({
                "title": title,
                "price": price,
                "url": url,
                "image": image,
            })

    return results


def fetch_raymour_flanigan_search(query="rug", num_results_per_page=24, page=1, client_id=None, session="1"):
    """Call Raymour & Flanigan (Constructor.io) full search API for a query.

    The search endpoint typically contains price fields, unlike autocomplete.
    """
    if not client_id:
        client_id = str(uuid.uuid4())

    # NEW: get latest key/clientlib from store each call
    api_key = API_KEY
    client_lib = CLIENT_LIB
    if 'ctor_get_keys' in globals() and ctor_get_keys:
        try:
            k, c = ctor_get_keys('raymour_flanigan', fallback_key=api_key, fallback_clientlib=client_lib)
            api_key = k or api_key
            client_lib = c or client_lib
        except Exception:
            pass

    url = f"{API_BASE}/search/{quote_plus(query)}"
    params = {
        "c": client_lib,
        "key": api_key,
        "i": client_id,
        "s": str(session),
        "num_results_per_page": str(num_results_per_page),
        "page": str(page),
        "_dt": str(int(time.time() * 1000)),
    }

    try:
        resp = requests.get(url, headers=HEADERS, params=params, timeout=20)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        print(f"Error fetching Raymour & Flanigan search: {e}")
        return None


def extract_results_from_search(data):
    """Extract products from the full search payload with price when available."""
    rows = []
    if not data:
        return rows

    response = data.get("response") or {}
    for item in response.get("results", []) or []:
        d = item.get("data") or {}
        title = d.get("title", "") or item.get("value") or _derive_title(item, d)
        image = d.get("image_url", "")
        url = _absolutize_url(d.get("url", ""))
        price = _derive_price(d)

        rows.append({
            "title": title,
            "price": price,
            "url": url,
            "image": image,
        })
    return rows


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


def save_raw_json(data, filename="raymour_flanigan_raw.json"):
    """Save the full raw JSON response to a file for inspection."""
    try:
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Raw response saved to {filename}")
    except Exception as e:
        print(f"Failed to save raw JSON: {e}")


def main():
    query = "rug"
    print("Fetching Raymour & Flanigan autocomplete data...")

    # Ask API for only products (no suggestions) and request more than 4 products
    raw = fetch_raymour_flanigan_autocomplete(query=query, num_suggestions=0, num_products=12)
    if not raw:
        print("Failed to fetch data. Exiting.")
        return

    # Optionally save the entire response so you can locate where price lives without filtering
    save_raw_json(raw, filename="raymour_flanigan_raw.json")

    # Extract only product rows from autocomplete
    rows = extract_results(raw, fallback_query=query, include_suggestions=False)
    print(f"Successfully extracted {len(rows)} rows from autocomplete")

    # If autocomplete doesn't include prices, fall back to full search API
    if not rows or all(not (r.get("price") or "") for r in rows):
        print("No prices found in autocomplete. Falling back to search API...")
        search_raw = fetch_raymour_flanigan_search(query=query, num_results_per_page=24, page=1)
        if search_raw:
            rows = extract_results_from_search(search_raw)
            print(f"Extracted {len(rows)} rows from search")
        else:
            print("Failed to fetch search results as fallback.")

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
