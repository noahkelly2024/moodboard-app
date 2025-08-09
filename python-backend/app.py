from flask import Flask, request, jsonify
from flask_cors import CORS
import rembg
from rembg import remove, new_session
from PIL import Image
import io
import base64
import logging
import re
import requests
from bs4 import BeautifulSoup
from urllib.parse import quote_plus
import random
import time
from typing import Dict, Any, List
import os  # added for env flag
import json  # NEW

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Global session variable
session = None

USER_AGENTS = [
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
]
DEFAULT_HEADERS_BASE = {"Accept-Language": "en-US,en;q=0.9", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}
TIMEOUT = 10
MAX_PER_SITE = 6  # limit per retailer to reduce scraping load

# --- Utility helpers ---

def base64_to_image(base64_string):
    """Convert base64 string to PIL Image."""
    try:
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        image_data = base64.b64decode(base64_string)
        image = Image.open(io.BytesIO(image_data))
        if image.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', image.size, (255, 255, 255))
            if image.mode == 'P':
                image = image.convert('RGBA')
            background.paste(image, mask=image.split()[-1] if image.mode in ('RGBA', 'LA') else None)
            image = background
        elif image.mode != 'RGB':
            image = image.convert('RGB')
        return image
    except Exception as e:
        logger.error(f"Error converting base64 to image: {e}")
        raise

def image_to_base64(image, format='PNG'):
    """Convert PIL Image to base64 string."""
    buffer = io.BytesIO()
    image.save(buffer, format=format)
    buffer.seek(0)
    image_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
    return f"data:image/{format.lower()};base64,{image_base64}"

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'rembg_version': rembg.__version__ if hasattr(rembg, '__version__') else 'unknown',
        'session_loaded': session is not None
    })

@app.route('/models', methods=['GET'])
def list_models():
    """List available rembg models."""
    available_models = [
        'u2net',
        'u2net_human_seg',
        'u2net_cloth_seg', 
        'isnet-general-use',
        'silueta'
    ]
    return jsonify({'models': available_models, 'default': 'u2net'})

@app.route('/remove-background', methods=['POST'])
def remove_background():
    """Remove background from uploaded image."""
    global session
    try:
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({'error': 'No image data provided'}), 400
        model_name = data.get('model', 'u2net')
        if session is None or getattr(session, '_model_name', None) != model_name:
            logger.info(f"Creating rembg session with model: {model_name}")
            try:
                session = new_session(model_name)
                session._model_name = model_name
            except Exception as model_error:
                logger.warning(f"Failed to create session with model {model_name}: {model_error}")
                logger.info("Falling back to u2net model")
                session = new_session('u2net')
                session._model_name = 'u2net'
        input_image = base64_to_image(data['image'])
        logger.info(f"Processing image of size: {input_image.size} with model: {getattr(session, '_model_name', 'unknown')}")
        output_image = remove(input_image, session=session)
        result_base64 = image_to_base64(output_image, 'PNG')
        return jsonify({
            'success': True,
            'image': result_base64,
            'model_used': getattr(session, '_model_name', 'unknown'),
            'original_size': input_image.size,
            'output_size': output_image.size
        })
    except Exception as e:
        logger.error(f"Error in remove_background: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# -------- Furniture Search (Refactored Wayfair only) ---------

PRICE_RANGE_MAP = {
    'under200': (None, 200),
    '200to500': (200, 500),
    '500to1000': (500, 1000),
    'over1000': (1000, None)
}

def price_in_range(value, price_min, price_max):
    if value is None:
        return True
    if price_min is not None and value < price_min:
        return False
    if price_max is not None and value > price_max:
        return False
    return True

def _pick_headers():
    return {**DEFAULT_HEADERS_BASE, 'User-Agent': random.choice(USER_AGENTS)}

def make_result(idx_prefix: str, idx: int, title: str, price_val, site: str, image: str, url: str, category: str, style: str) -> Dict[str, Any]:
    return {
        'id': f'{idx_prefix}-{idx}',
        'title': title,
        'price': f"${price_val:.2f}" if price_val is not None else 'N/A',
        'originalPrice': None,
        'site': site,
        'image': image,
        'url': url,
        'rating': round(random.uniform(3.5, 5.0), 1),
        'reviews': random.randint(5, 500),
        'category': category if category != 'all' else 'general',
        'style': style if style != 'all' else 'unspecified',
        'inStock': True
    }

# --- Wayfair scraping helpers (resilient) ---
PRICE_REGEX = re.compile(r'\$\s*([0-9][0-9,]*\.?[0-9]{0,2})')

SELECTOR_SETS = [
    '[data-enzyme-id="ProductCard"]',
    'a.ProductCard',
    '[data-hb-id="ProductCard"]',
    'div[class*="ProductCard"]',
    'li[class*="ProductCard"]',
]

TITLE_SELECTORS = [
    '[data-enzyme-id="ProductName"]',
    '[data-hb-id="ProductName"]',
    'div[class*="Title"], span[class*="Title"], span'
]

PRICE_SELECTORS = [
    '[data-enzyme-id="RegularPrice"]',
    '[data-enzyme-id="SalePrice"]',
    '[data-hb-id*="Price"]',
    'span[class*="Price"], div[class*="Price"]',
    'span'
]

IMAGE_ATTRS = ['data-src', 'data-srcset', 'src', 'data-original']

# NEW: JSON / ld+json parsing helpers
LDJSON_PRODUCT_TYPES = {"Product", "ListItem"}
PRODUCT_KEY_HINTS = ["product", "Product", "name", "price"]

def _extract_first(selector_list, root):
    for sel in selector_list:
        el = root.select_one(sel)
        if el and el.get_text(strip=True):
            return el.get_text(strip=True), el
    return None, None

def _extract_price(root):
    # Try explicit selectors
    for sel in PRICE_SELECTORS:
        el = root.select_one(sel)
        if el:
            txt = el.get_text(" ", strip=True)
            m = PRICE_REGEX.search(txt)
            if m:
                try:
                    return float(m.group(1).replace(',', ''))
                except ValueError:
                    pass
    # Fallback: any text containing $ in card
    txt = root.get_text(" ", strip=True)
    m = PRICE_REGEX.search(txt)
    if m:
        try:
            return float(m.group(1).replace(',', ''))
        except ValueError:
            return None
    return None

def _extract_image(card):
    img = card.select_one('img')
    if not img:
        return None
    for attr in IMAGE_ATTRS:
        val = img.get(attr)
        if val:
            # handle srcset
            if ' ' in val and ',' in val:
                # pick last (largest) candidate
                parts = [p.strip().split(' ')[0] for p in val.split(',') if p.strip()]
                if parts:
                    return parts[-1]
            return val
    return None

def _normalize_url(url):
    if not url:
        return None
    if url.startswith('//'):
        return 'https:' + url
    if url.startswith('/'):
        return 'https://www.wayfair.com' + url
    return url

# NEW: parse application/ld+json structured data for products

def _json_products_from_ldjson(soup):
    products = []
    for script in soup.find_all('script', type=lambda v: v and 'ld+json' in v):
        txt = script.string or script.get_text(strip=True) or ''
        if not txt:
            continue
        try:
            data = json.loads(txt)
        except Exception:
            continue
        candidates = []
        if isinstance(data, list):
            candidates.extend(data)
        elif isinstance(data, dict):
            # Some Wayfair pages wrap graph
            if '@graph' in data and isinstance(data['@graph'], list):
                candidates.extend(data['@graph'])
            else:
                candidates.append(data)
        for obj in candidates:
            if not isinstance(obj, dict):
                continue
            obj_type = obj.get('@type')
            if isinstance(obj_type, list):
                typeset = set(obj_type)
            else:
                typeset = {obj_type} if obj_type else set()
            if not (typeset & LDJSON_PRODUCT_TYPES):
                # Sometimes offer/product nested
                if obj.get('item') and isinstance(obj['item'], dict):
                    inner = obj['item']
                    if inner.get('@type') in LDJSON_PRODUCT_TYPES:
                        obj = inner
                    else:
                        continue
            name = obj.get('name') or obj.get('title')
            if not name:
                continue
            offers = obj.get('offers') or {}
            if isinstance(offers, list):
                offers = offers[0]
            price_val = None
            for key in ('price', 'lowPrice', 'highPrice'):  # choose something
                if key in offers:
                    try:
                        price_val = float(str(offers[key]).replace(',', '').replace('$', ''))
                        break
                    except Exception:
                        pass
            if price_val is None and 'price' in obj:
                try:
                    price_val = float(str(obj['price']).replace(',', '').replace('$', ''))
                except Exception:
                    pass
            image = obj.get('image')
            if isinstance(image, list):
                image = image[-1]
            url = obj.get('url') or (offers.get('url') if isinstance(offers, dict) else None)
            products.append({
                'name': name,
                'price': price_val,
                'image': image,
                'url': url
            })
    return products

# NEW: very loose regex fallback for inline JSON blobs

INLINE_JSON_PRODUCT_REGEX = re.compile(r'\{[^{}]{0,500}?"name"\s*:\s*"([^"\\]{1,120})"[^{}]{0,300}?"price"\s*:\s*"?\$?([0-9][0-9,]*\.?[0-9]{0,2})"?[^{}]*?\}', re.IGNORECASE)

def _json_products_from_inline(soup, limit=50):
    text_sources = []
    for script in soup.find_all('script'):
        txt = script.string or script.get_text() or ''
        if any(k in txt for k in PRODUCT_KEY_HINTS):
            text_sources.append(txt)
    products = []
    for txt in text_sources:
        for m in INLINE_JSON_PRODUCT_REGEX.finditer(txt):
            name = m.group(1).strip()
            try:
                price_val = float(m.group(2).replace(',', ''))
            except Exception:
                price_val = None
            products.append({'name': name, 'price': price_val, 'image': None, 'url': None})
            if len(products) >= limit:
                return products
    return products

def scrape_wayfair(query: str, price_min, price_max, category: str, style: str):
    """Scrape Wayfair for products matching the query with resilient parsing.
    NOTE: Scraping HTML can break if site markup changes; handle errors gracefully.
    """
    results = []
    debug_meta: Dict[str, Any] = {}
    try:
        w_url = f"https://www.wayfair.com/keyword.php?keyword={quote_plus(query)}"
        resp = requests.get(
            w_url,
            timeout=TIMEOUT,
            headers=_pick_headers(),
            allow_redirects=True,
        )
        debug_meta['status_code'] = resp.status_code
        if not resp.ok:
            logger.warning(f"Wayfair request failed: {resp.status_code}")
            return results, debug_meta
        soup = BeautifulSoup(resp.text, 'html.parser')

        # Aggregate candidate cards from multiple selector patterns
        seen = set()
        cards = []
        per_selector_counts = {}
        for sel in SELECTOR_SETS:
            found = soup.select(sel)
            per_selector_counts[sel] = len(found)
            for f in found:
                if id(f) not in seen:
                    cards.append(f)
                    seen.add(id(f))
        # Fallback heuristic: anchors to product pages containing price
        if not cards:
            for a in soup.find_all('a', href=True):
                if '/product/' in a['href'] or 'keyword.php' in a['href']:
                    if '$' in a.get_text():
                        cards.append(a)
        logger.info(f"Wayfair candidate cards found: {len(cards)} for query '{query}'")
        debug_meta['candidate_cards'] = len(cards)
        debug_meta['per_selector'] = per_selector_counts

        for card in cards:
            if len(results) >= MAX_PER_SITE:
                break
            title_text, title_el = _extract_first(TITLE_SELECTORS, card)
            if not title_text:
                # fallback: use aria-label or alt text from image
                title_text = card.get('aria-label') or None
                if not title_text:
                    img_alt = card.select_one('img')
                    if img_alt and img_alt.get('alt'):
                        title_text = img_alt.get('alt')
            if not title_text:
                continue
            price_val = _extract_price(card)
            if not price_in_range(price_val, price_min, price_max):
                continue
            image_url = _extract_image(card)
            href = None
            # Prefer nearest anchor
            if card.name == 'a':
                href = card.get('href')
            else:
                a_inside = card.select_one('a[href]')
                if a_inside:
                    href = a_inside.get('href')
            href = _normalize_url(href) or w_url
            results.append(make_result('wayfair', len(results), title_text, price_val, 'Wayfair', image_url, href, category, style))
        # JSON fallback(s)
        json_products_used = 0
        if not results:
            ld_products = _json_products_from_ldjson(soup)
            for p in ld_products:
                if len(results) >= MAX_PER_SITE:
                    break
                if not p.get('name'):
                    continue
                price_val = p.get('price')
                if not price_in_range(price_val, price_min, price_max):
                    continue
                results.append(make_result('wayfair', len(results), p['name'], price_val, 'Wayfair', p.get('image'), _normalize_url(p.get('url')) or w_url, category, style))
                json_products_used += 1
        if not results:
            inline_products = _json_products_from_inline(soup)
            for p in inline_products:
                if len(results) >= MAX_PER_SITE:
                    break
                if not p.get('name'):
                    continue
                price_val = p.get('price')
                if not price_in_range(price_val, price_min, price_max):
                    continue
                results.append(make_result('wayfair', len(results), p['name'], price_val, 'Wayfair', p.get('image'), w_url, category, style))
                json_products_used += 1
        debug_meta['json_products_used'] = json_products_used

        # Alt/IMG fallback: grab imgs containing query in alt
        if not results:
            alts = []
            lowered_query = query.lower()
            for img in soup.find_all('img'):
                alt = (img.get('alt') or '').strip()
                if len(alt) > 5 and lowered_query.split()[0] in alt.lower():
                    alts.append((alt, _extract_image(img.parent) if img.parent else img.get('src')))
            for alt, img_url in alts[:MAX_PER_SITE]:
                results.append(make_result('wayfair', len(results), alt, None, 'Wayfair', img_url, w_url, category, style))
            debug_meta['alt_fallback_used'] = len(results)

        if not results:
            # Log diagnostic snippet when empty
            snippet = resp.text[:2000].replace('\n', ' ') if resp.text else ''
            logger.info(f"Wayfair parse produced zero results. HTML snippet: {snippet}")
            debug_meta['html_snippet'] = snippet
    except Exception as e:
        logger.warning(f"Wayfair scrape failed: {e}")
        debug_meta['exception'] = str(e)
    return results, debug_meta

@app.route('/search', methods=['POST'])
def furniture_search():
    """Furniture search (Wayfair only refactor). Returns JSON list of results.
    WARNING: Demo scraping only; respect site ToS and robots.txt for production use.
    """
    try:
        data = request.get_json(silent=True) or {}
        query = data.get('query', '').strip()
        filters = data.get('filters', {})
        price_range = filters.get('priceRange', 'all')
        style = filters.get('style', 'all')
        category = filters.get('category', 'all')
        debug_flag = data.get('debug') or os.getenv('WAYFAIR_DEBUG') == '1'

        if not query:
            return jsonify({'success': True, 'results': []})

        price_min, price_max = PRICE_RANGE_MAP.get(price_range, (None, None))

        # Wayfair scrape only
        results, debug_meta = scrape_wayfair(query, price_min, price_max, category, style)

        response = {'success': True, 'results': results, 'sourceCount': 1}
        if debug_flag:
            response['debug'] = {
                'resultCount': len(results),
                'priceRange': [price_min, price_max],
                'query': query,
                'meta': debug_meta
            }
        return jsonify(response)
    except Exception as e:
        logger.error(f"Search failed: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# Removed duplicate - using the existing comprehensive search implementation above

if __name__ == '__main__':
    logger.info("Starting rembg background removal + furniture search server...")
    try:
        logger.info("Preloading rembg model...")
        session = new_session('u2net')
        logger.info("Model preloaded successfully")
    except Exception as e:
        logger.error(f"Failed to preload model: {e}")
        session = None
    app.run(
        host='127.0.0.1',
        port=5000,
        debug=False,
        threaded=True
    )
