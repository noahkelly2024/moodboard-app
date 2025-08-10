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
from urllib.parse import quote_plus, urlparse
import random
import time
from typing import Dict, Any, List
import os  # added for env flag
import json  # NEW

# Try to import decoupled real search module
try:
    from search_furniture_real import search_furniture_real  # NEW
except Exception:
    search_furniture_real = None  # NEW: fallback if module not available

# NEW: Try to import dedicated Wayfair module implementation
try:
    from wayfair import get_products as wayfair_get_products
except Exception:
    wayfair_get_products = None

# NEW: Try to import Pottery Barn extractor for parsing API JSON
try:
    from pottery_barn import extract_product_info as pb_extract_product_info
except Exception:
    pb_extract_product_info = None

# NEW: Try to import West Elm API helpers
try:
    from west_elm import fetch_west_elm_autocomplete as we_fetch_autocomplete, extract_results as we_extract_results
except Exception:
    we_fetch_autocomplete = None  # type: ignore
    we_extract_results = None  # type: ignore

# NEW: Try to import Raymour & Flanigan API helpers
try:
    from raymour_flanigan import fetch_raymour_flanigan_autocomplete as rf_fetch_autocomplete, extract_results as rf_extract_results
except Exception:
    rf_fetch_autocomplete = None  # type: ignore
    rf_extract_results = None  # type: ignore

# Centralized Constructor.io key storage
try:
    from constructor_keys import get_keys as ctor_get_keys, save_keys as ctor_save_keys, status as ctor_status
except Exception:
    ctor_get_keys = None  # type: ignore
    ctor_save_keys = None  # type: ignore
    ctor_status = None  # type: ignore

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Register additional image format plugins (AVIF/HEIF) for Pillow
try:
    from pillow_heif import register_heif, register_avif  # type: ignore
    register_heif()
    register_avif()
except Exception:
    pass
try:
    # Importing registers the AVIF plugin for Pillow
    from pillow_avif import AvifImagePlugin  # type: ignore  # noqa: F401
except Exception:
    pass

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

def _referer_for_url(url: str) -> str | None:
    try:
        netloc = urlparse('https:' + url if url.startswith('//') else url).netloc.lower()
    except Exception:
        return None
    if any(k in netloc for k in ('potterybarn.com', 'pbimgs.com', 'weimgs.com', 'williamssonoma.com')):
        return 'https://www.potterybarn.com/'
    if 'wayfair' in netloc:
        return 'https://www.wayfair.com/'
    if 'ikea' in netloc:
        return 'https://www.ikea.com/'
    if 'westelm' in netloc or 'west-elm' in netloc:
        return 'https://www.westelm.com/'
    if 'raymourflanigan' in netloc:
        return 'https://www.raymourflanigan.com/'
    return None

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

def fetch_image_from_url(url: str) -> Image.Image:
    """Fetch an image from a URL and return a PIL Image with RGB mode.
    Supports WebP/AVIF/HEIF when plugins are available. Adds Referer for PB/CDN if needed.
    """
    try:
        if url.startswith('//'):
            url = 'https:' + url
        headers = {**_pick_headers(), 'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8'}
        ref = _referer_for_url(url)
        if ref:
            headers['Referer'] = ref
        resp = requests.get(url, headers=headers, timeout=TIMEOUT, stream=True)
        if resp.status_code == 403 and 'Referer' not in headers:
            # Retry with a best-guess referer for hotlink-protected CDNs
            guess_ref = _referer_for_url(url) or 'https://www.potterybarn.com/'
            headers['Referer'] = guess_ref
            resp = requests.get(url, headers=headers, timeout=TIMEOUT, stream=True)
        resp.raise_for_status()
        content_type = (resp.headers.get('Content-Type') or '').lower()
        if 'svg' in content_type or url.lower().endswith('.svg'):
            raise ValueError('SVG images are not supported for background removal')
        img = Image.open(io.BytesIO(resp.content))
        if img.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        return img
    except Exception as e:
        logger.error(f"Error fetching image from URL: {e}")
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
    """Remove background from uploaded image. Accepts base64 data URI or direct image URL."""
    global session
    try:
        data = request.get_json()
        if not data or ('image' not in data and 'imageUrl' not in data):
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
        # Support both base64 and URL inputs
        img_input = data.get('image') or data.get('imageUrl')
        if isinstance(img_input, str) and (img_input.startswith('http://') or img_input.startswith('https://') or img_input.startswith('//')):
            input_image = fetch_image_from_url(img_input)
        else:
            input_image = base64_to_image(img_input)
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
        'category': category if category != 'all' else 'general',
        'style': style if style != 'all' else 'unspecified',
        'inStock': True
    }

# --- Wayfair module adapter (moved up so it's defined before use) ---

def _adapt_wayfair_products(items: List[Dict[str, Any]], category: str, style: str) -> List[Dict[str, Any]]:
    """Convert results from python-backend/wayfair.get_products() into app schema.
    Expected input item keys: title, price, url, image
    Output schema keys: id, title, price, originalPrice, site, image, url, category, style, inStock
    """
    adapted: List[Dict[str, Any]] = []
    if not isinstance(items, list):
        return adapted

    PRICE_REGEX = re.compile(r'\$\s*([0-9][0-9,]*\.?[0-9]{0,2})')

    def _extract_price_str(p):
        if p is None:
            return None
        s = str(p)
        m = PRICE_REGEX.search(s)
        if m:
            return f"${m.group(1)}"
        return s if '$' in s else None

    def _extract_price_float(p):
        try:
            m = PRICE_REGEX.search(str(p))
            if not m:
                return None
            return float(m.group(1).replace(',', ''))
        except Exception:
            return None

    for i, it in enumerate(items):
        if not isinstance(it, dict):
            continue
        title = (it.get('title') or '').strip()
        if not title:
            continue
        url = it.get('url') or ''
        price_str = _extract_price_str(it.get('price'))
        price_val = _extract_price_float(it.get('price'))

        img_url = it.get('image') or ''
        if isinstance(img_url, str):
            if img_url.startswith('//'):
                img_url = 'https:' + img_url
            elif img_url.startswith('/'):
                img_url = 'https://www.wayfair.com' + img_url
        else:
            img_url = ''

        adapted.append({
            'id': f'wayfair-{i+1}',
            'title': title,
            'price': price_str or (f"${price_val:.2f}" if isinstance(price_val, float) else None) or '$',
            'originalPrice': None,
            'site': 'Wayfair',
            'image': img_url or '/window.svg',
            'url': url,
            'category': category or 'all',
            'style': style or 'all',
            'inStock': True,
        })

    return adapted

# NEW: Pottery Barn helpers (API-based)

def _fetch_pottery_barn_raw(query: str, num_results: int = 20):
    """Fetch Pottery Barn search JSON via Constructor.io API for a given query."""
    try:
        url = f"https://ac.cnstrc.com/search/{quote_plus(query)}"
        # Pull API key/clientlib from persistent store if available
        api_key = "key_w3v8XC1kGR9REv46"
        client_lib = "ciojs-client-2.66.0"
        if ctor_get_keys:
            k, c = ctor_get_keys('pottery_barn', fallback_key=api_key, fallback_clientlib=client_lib)
            api_key = k or api_key
            client_lib = c or client_lib
        params = {
            "c": client_lib,
            "key": api_key,
            "i": "f70eef75-549d-4dc0-98e1-5addb6c8c3cc",
            "s": "3",
            "offset": "0",
            "num_results_per_page": str(num_results),
        }
        r = requests.get(url, params=params, timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning(f"Pottery Barn fetch failed: {e}")
        return None

def _pb_simple_extract(data) -> List[Dict[str, Any]]:
    """Fallback extractor if pottery_barn.extract_product_info isn't importable."""
    items: List[Dict[str, Any]] = []
    try:
        results = []
        if data and isinstance(data, dict):
            if 'response' in data and isinstance(data['response'], dict) and 'results' in data['response']:
                results = data['response']['results']
            elif 'results' in data:
                results = data['results']
        for it in results:
            pdata = (it.get('data') or {}) if isinstance(it, dict) else {}
            title = pdata.get('title') or ''
            if not title:
                continue
            price = pdata.get('lowestPrice') or pdata.get('salePriceMin')
            price_str = f"${price}" if price else ''
            items.append({
                'title': title,
                'price': price_str,
                'url': pdata.get('url', ''),
                'image': pdata.get('image_url', ''),
            })
    except Exception:
        return []
    return items

def pb_get_products(query: str, num_results: int = 20) -> List[Dict[str, Any]]:
    raw = _fetch_pottery_barn_raw(query, num_results=num_results)
    if not raw:
        return []
    if pb_extract_product_info:
        try:
            return pb_extract_product_info(raw) or []
        except Exception as e:
            logger.warning(f"Pottery Barn extract_product_info failed: {e}; falling back to simple extractor")
    return _pb_simple_extract(raw)


def _adapt_pottery_barn_products(items: List[Dict[str, Any]], category: str, style: str) -> List[Dict[str, Any]]:
    adapted: List[Dict[str, Any]] = []
    PRICE_REGEX = re.compile(r'\$\s*([0-9][0-9,]*\.?[0-9]{0,2})')

    def _price_str(p):
        if p is None:
            return None
        s = str(p)
        m = PRICE_REGEX.search(s)
        if m:
            return f"${m.group(1)}"
        return s if '$' in s else None

    for i, it in enumerate(items):
        if not isinstance(it, dict):
            continue
        title = (it.get('title') or '').strip()
        if not title:
            continue
        url = it.get('url') or ''
        img = it.get('image') or ''
        adapted.append({
            'id': f'potterybarn-{i+1}',
            'title': title,
            'price': _price_str(it.get('price')) or '$',
            'originalPrice': None,
            'site': 'Pottery Barn',
            'image': img or '/window.svg',
            'url': url,
            'category': category or 'all',
            'style': style or 'all',
            'inStock': True,
        })
    return adapted

# NEW: West Elm helpers (API-based)

def we_get_products(query: str, num_results: int = 20) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    try:
        if we_fetch_autocomplete and we_extract_results:
            raw = we_fetch_autocomplete(query=query, num_suggestions=0, num_products=num_results)
            if raw:
                items = we_extract_results(raw, fallback_query=query, include_suggestions=False) or []
    except Exception as e:
        logger.warning(f"West Elm API fetch failed: {e}")
    return items


def _adapt_west_elm_products(items: List[Dict[str, Any]], category: str, style: str) -> List[Dict[str, Any]]:
    adapted: List[Dict[str, Any]] = []
    PRICE_REGEX = re.compile(r'\$\s*([0-9][0-9,]*\.?[0-9]{0,2})')

    def _price_str(p):
        if p is None:
            return None
        s = str(p)
        m = PRICE_REGEX.search(s)
        if m:
            return f"${m.group(1)}"
        return s if '$' in s else None

    for i, it in enumerate(items or []):
        if not isinstance(it, dict):
            continue
        title = (it.get('title') or '').strip()
        if not title:
            continue
        url = it.get('url') or ''
        img = it.get('image') or ''
        adapted.append({
            'id': f'westelm-{i+1}',
            'title': title,
            'price': _price_str(it.get('price')) or '$',
            'originalPrice': None,
            'site': 'West Elm',
            'image': img or '/window.svg',
            'url': url,
            'category': category or 'all',
            'style': style or 'all',
            'inStock': True,
        })
    return adapted

# NEW: Raymour & Flanigan helpers (API-based)

def rf_get_products(query: str, num_results: int = 20) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    try:
        if rf_fetch_autocomplete and rf_extract_results:
            raw = rf_fetch_autocomplete(query=query, num_suggestions=0, num_products=num_results)
            if raw:
                items = rf_extract_results(raw, fallback_query=query, include_suggestions=False) or []
    except Exception as e:
        logger.warning(f"Raymour & Flanigan API fetch failed: {e}")
    return items


def _adapt_raymour_flanigan_products(items: List[Dict[str, Any]], category: str, style: str) -> List[Dict[str, Any]]:
    adapted: List[Dict[str, Any]] = []
    PRICE_REGEX = re.compile(r'\$\s*([0-9][0-9,]*\.?[0-9]{0,2})')

    def _price_str(p):
        if p is None:
            return None
        s = str(p)
        m = PRICE_REGEX.search(s)
        if m:
            return f"${m.group(1)}"
        return s if '$' in s else None

    for i, it in enumerate(items or []):
        if not isinstance(it, dict):
            continue
        title = (it.get('title') or '').strip()
        if not title:
            continue
        url = it.get('url') or ''
        img = it.get('image') or ''
        adapted.append({
            'id': f'raymourflanigan-{i+1}',
            'title': title,
            'price': _price_str(it.get('price')) or '$',
            'originalPrice': None,
            'site': 'Raymour & Flanigan',
            'image': img or '/window.svg',
            'url': url,
            'category': category or 'all',
            'style': style or 'all',
            'inStock': True,
        })
    return adapted

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

def scrape_ikea(query: str, price_min, price_max, category: str, style: str):
    """Scrape IKEA for furniture items."""
    results = []
    debug_meta = {}
    try:
        ikea_url = f"https://www.ikea.com/us/en/search/products/?q={quote_plus(query)}"
        resp = requests.get(
            ikea_url,
            timeout=TIMEOUT,
            headers=_pick_headers(),
            allow_redirects=True,
        )
        debug_meta['status_code'] = resp.status_code
        if not resp.ok:
            logger.warning(f"IKEA request failed: {resp.status_code}")
            return results, debug_meta
            
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # IKEA product selectors
        def _class_has_product(x):
            if not x:
                return False
            if isinstance(x, (list, tuple, set)):
                s = ' '.join(x).lower()
            else:
                s = str(x).lower()
            return 'product' in s
        product_cards = soup.find_all(['div', 'article'], class_=_class_has_product)
        if not product_cards:
            # Fallback selectors
            product_cards = soup.find_all('a', href=lambda x: x and '/products/' in x)[:MAX_PER_SITE]
        
        logger.info(f"IKEA candidate cards found: {len(product_cards)} for query '{query}'")
        debug_meta['candidate_cards'] = len(product_cards)
        
        for card in product_cards:
            if len(results) >= MAX_PER_SITE:
                break
                
            # Extract title (use CSS selectors)
            title = None
            title_selectors = ['h3', 'h2', 'span[class*="name"]', '[data-testid*="name"]']
            for sel in title_selectors:
                title_el = card.select_one(sel)
                if title_el and title_el.get_text(strip=True):
                    title = title_el.get_text(strip=True)
                    break
            
            if not title:
                # Try aria-label or alt text
                title = card.get('aria-label') or card.get('title')
                if not title:
                    img = card.find('img')
                    if img:
                        title = img.get('alt')
            
            if not title:
                continue
                
            # Extract price
            price_val = None
            price_selectors = ['span[class*="price"]', '[data-testid*="price"]', 'span', 'div']
            for sel in price_selectors:
                price_el = card.select_one(sel)
                if price_el:
                    price_text = price_el.get_text()
                    price_match = PRICE_REGEX.search(price_text)
                    if price_match:
                        try:
                            price_val = float(price_match.group(1).replace(',', ''))
                            break
                        except ValueError:
                            continue
            
            if not price_in_range(price_val, price_min, price_max):
                continue
                
            # Extract image
            image_url = None
            img = card.find('img')
            if img:
                for attr in IMAGE_ATTRS:
                    val = img.get(attr)
                    if val:
                        if val.startswith('//'):
                            image_url = 'https:' + val
                        elif val.startswith('/'):
                            image_url = 'https://www.ikea.com' + val
                        else:
                            image_url = val
                        break
            
            # Extract URL
            product_url = ikea_url
            if card.name == 'a':
                href = card.get('href')
                if href:
                    if href.startswith('/'):
                        product_url = 'https://www.ikea.com' + href
                    elif href.startswith('http'):
                        product_url = href
            else:
                link = card.find('a', href=True)
                if link:
                    href = link['href']
                    if href.startswith('/'):
                        product_url = 'https://www.ikea.com' + href
                    elif href.startswith('http'):
                        product_url = href
            
            results.append(make_result('ikea', len(results), title, price_val, 'IKEA', image_url, product_url, category, style))
        
        # JSON fallbacks similar to Wayfair
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
                url = p.get('url')
                if url and url.startswith('/'):
                    url = 'https://www.ikea.com' + url
                results.append(make_result('ikea', len(results), p['name'], price_val, 'IKEA', p.get('image'), url or ikea_url, category, style))
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
                results.append(make_result('ikea', len(results), p['name'], price_val, 'IKEA', p.get('image'), ikea_url, category, style))
                json_products_used += 1
        debug_meta['json_products_used'] = json_products_used

        # Alt/IMG fallback
        if not results:
            alts = []
            lowered_query = query.lower()
            for img in soup.find_all('img'):
                alt = (img.get('alt') or '').strip()
                if len(alt) > 5 and lowered_query.split()[0] in alt.lower():
                    src = None
                    for attr in IMAGE_ATTRS:
                        val = img.get(attr)
                        if val:
                            src = val
                            break
                    alts.append((alt, src))
            for alt, img_url in alts[:MAX_PER_SITE]:
                results.append(make_result('ikea', len(results), alt, None, 'IKEA', img_url, ikea_url, category, style))
            debug_meta['alt_fallback_used'] = len(results)

        if not results:
            snippet = resp.text[:2000].replace('\n', ' ') if resp.text else ''
            logger.info(f"IKEA parse produced zero results. HTML snippet: {snippet}")
            debug_meta['html_snippet'] = snippet
            
    except Exception as e:
        logger.warning(f"IKEA scrape failed: {e}")
        debug_meta['exception'] = str(e)
    
    return results, debug_meta

def scrape_westelm(query: str, price_min, price_max, category: str, style: str):
    """Scrape West Elm for furniture items."""
    results = []
    debug_meta = {}
    try:
        westelm_url = f"https://www.westelm.com/search/results.html?words={quote_plus(query)}"
        resp = requests.get(
            westelm_url,
            timeout=TIMEOUT,
            headers=_pick_headers(),
            allow_redirects=True,
        )
        debug_meta['status_code'] = resp.status_code
        if not resp.ok:
            logger.warning(f"West Elm request failed: {resp.status_code}")
            return results, debug_meta
            
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # West Elm product selectors
        def _class_has_product(x):
            if not x:
                return False
            if isinstance(x, (list, tuple, set)):
                s = ' '.join(x).lower()
            else:
                s = str(x).lower()
            return 'product' in s or 'grid' in s
        product_cards = soup.find_all(['div', 'article'], class_=_class_has_product)
        if not product_cards:
            # Fallback selectors
            product_cards = soup.find_all('a', href=lambda x: x and '/products/' in x)[:MAX_PER_SITE]
        
        logger.info(f"West Elm candidate cards found: {len(product_cards)} for query '{query}'")
        debug_meta['candidate_cards'] = len(product_cards)
        
        for card in product_cards:
            if len(results) >= MAX_PER_SITE:
                break
                
            # Extract title
            title = None
            title_selectors = ['h3', 'h2', 'span[class*="name"]', '[class*="title"]']
            for sel in title_selectors:
                title_el = card.select_one(sel)
                if title_el and title_el.get_text(strip=True):
                    title = title_el.get_text(strip=True)
                    break
            
            if not title:
                title = card.get('aria-label') or card.get('title')
                if not title:
                    img = card.find('img')
                    if img:
                        title = img.get('alt')
            
            if not title:
                continue
                
            # Extract price
            price_val = None
            price_selectors = ['span[class*="price"]', '[class*="price"]', 'span', 'div']
            for sel in price_selectors:
                price_el = card.select_one(sel)
                if price_el:
                    price_text = price_el.get_text()
                    price_match = PRICE_REGEX.search(price_text)
                    if price_match:
                        try:
                            price_val = float(price_match.group(1).replace(',', ''))
                            break
                        except ValueError:
                            continue
            
            if not price_in_range(price_val, price_min, price_max):
                continue
                
            # Extract image
            image_url = None
            img = card.find('img')
            if img:
                for attr in IMAGE_ATTRS:
                    val = img.get(attr)
                    if val:
                        if val.startswith('//'):
                            image_url = 'https:' + val
                        elif val.startswith('/'):
                            image_url = 'https://www.westelm.com' + val
                        else:
                            image_url = val
                        break
            
            # Extract URL
            product_url = westelm_url
            if card.name == 'a':
                href = card.get('href')
                if href:
                    if href.startswith('/'):
                        product_url = 'https://www.westelm.com' + href
                    elif href.startswith('http'):
                        product_url = href
            else:
                link = card.find('a', href=True)
                if link:
                    href = link['href']
                    if href.startswith('/'):
                        product_url = 'https://www.westelm.com' + href
                    elif href.startswith('http'):
                        product_url = href
            
            results.append(make_result('westelm', len(results), title, price_val, 'West Elm', image_url, product_url, category, style))
        
        # JSON fallbacks
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
                url = p.get('url')
                if url and url.startswith('/'):
                    url = 'https://www.westelm.com' + url
                results.append(make_result('westelm', len(results), p['name'], price_val, 'West Elm', p.get('image'), url or westelm_url, category, style))
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
                results.append(make_result('westelm', len(results), p['name'], price_val, 'West Elm', p.get('image'), westelm_url, category, style))
                json_products_used += 1
        debug_meta['json_products_used'] = json_products_used

        # Alt/IMG fallback
        if not results:
            alts = []
            lowered_query = query.lower()
            for img in soup.find_all('img'):
                alt = (img.get('alt') or '').strip()
                if len(alt) > 5 and lowered_query.split()[0] in alt.lower():
                    src = None
                    for attr in IMAGE_ATTRS:
                        val = img.get(attr)
                        if val:
                            src = val
                            break
                    alts.append((alt, src))
            for alt, img_url in alts[:MAX_PER_SITE]:
                results.append(make_result('westelm', len(results), alt, None, 'West Elm', img_url, westelm_url, category, style))
            debug_meta['alt_fallback_used'] = len(results)

        if not results:
            snippet = resp.text[:2000].replace('\n', ' ') if resp.text else ''
            logger.info(f"West Elm parse produced zero results. HTML snippet: {snippet}")
            debug_meta['html_snippet'] = snippet
            
    except Exception as e:
        logger.warning(f"West Elm scrape failed: {e}")
        debug_meta['exception'] = str(e)
    
    return results, debug_meta

def get_fallback_results(query: str, category: str, style: str) -> List[Dict[str, Any]]:
    """Generate fallback results when scraping fails."""
    base_prices = [199, 299, 399, 499, 599, 799, 999]
    
    fallback_items = [
        {
            'title': f'{query.title()} Modern Accent Chair',
            'site': 'Wayfair',
            'image': 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=300&h=300&fit=crop&crop=center',
            'url': 'https://www.wayfair.com',
            'category': 'seating',
            'style': 'modern'
        },
        {
            'title': f'{query.title()} Scandinavian Table',
            'site': 'IKEA',
            'image': 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=300&h=300&fit=crop&crop=center',
            'url': 'https://www.ikea.com',
            'category': 'tables',
            'style': 'scandinavian'
        },
        {
            'title': f'{query.title()} Mid-Century Floor Lamp',
            'site': 'West Elm',
            'image': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=300&fit=crop&crop=center',
            'url': 'https://www.westelm.com',
            'category': 'lighting',
            'style': 'mid-century'
        },
        {
            'title': f'{query.title()} Industrial Bookshelf',
            'site': 'CB2',
            'image': 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&h=300&fit=crop&crop=center',
            'url': 'https://www.cb2.com',
            'category': 'storage',
            'style': 'industrial'
        },
        {
            'title': f'{query.title()} Contemporary Sofa',
            'site': 'Pottery Barn',
            'image': 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=300&h=300&fit=crop&crop=center',
            'url': 'https://www.potterybarn.com',
            'category': 'seating',
            'style': 'contemporary'
        }
    ]
    
    results = []
    for i, item in enumerate(fallback_items):
        price_val = random.choice(base_prices)
        results.append(make_result(f'fallback-{item["site"].lower()}', i, item['title'], price_val, item['site'], item['image'], item['url'], item['category'], item['style']))
    
    return results[:6]  # Return up to 6 fallback results

SERPAPI_KEY = os.getenv('SERPAPI_KEY')
DISABLE_SEARCH_FALLBACK = os.getenv('DISABLE_SEARCH_FALLBACK') == '1'
# Default to using the decoupled real search module when it is available, unless explicitly disabled via env
_env_use_real = os.getenv('USE_REAL_SEARCH_MODULE')
USE_REAL_SEARCH_MODULE = (search_furniture_real is not None) if _env_use_real is None else (_env_use_real == '1')  # UPDATED
# NEW: Flag to route searches to Wayfair module only (default on for now)
WAYFAIR_ONLY = os.getenv('WAYFAIR_ONLY', '1') == '1'

# --- SerpAPI helpers (optional real results) ---

def _parse_price_to_float(price_str: str):
    if not price_str:
        return None
    try:
        m = PRICE_REGEX.search(price_str)
        if m:
            return float(m.group(1).replace(',', ''))
        # Fallback: digits only
        return float(re.sub(r'[^0-9.]+' , '', price_str))
    except Exception:
        return None

def _site_name_from_url(url: str) -> str:
    try:
        netloc = urlparse(url).netloc.lower()
    except Exception:
        return 'Unknown'
    if 'wayfair' in netloc:
        return 'Wayfair'
    if 'ikea' in netloc:
        return 'IKEA'
    if 'westelm' in netloc or 'west-elm' in netloc:
        return 'West Elm'
    if 'raymourflanigan' in netloc:
        return 'Raymour & Flanigan'
    return netloc.split(':')[0]

# Restored helper

def _search_serpapi_for_domain(query: str, domain: str, price_min, price_max, category: str, style: str, limit: int = 10):
    results = []
    debug = {}
    if not SERPAPI_KEY:
        debug['skipped'] = 'no_api_key'
        return results, debug
    try:
        params = {
            'engine': 'google_shopping',
            'q': f"site:{domain} {query}",
            'hl': 'en',
            'gl': 'us',
            'api_key': SERPAPI_KEY,
            'num': max(limit, MAX_PER_SITE)
        }
        r = requests.get('https://serpapi.com/search.json', params=params, timeout=TIMEOUT)
        debug['status_code'] = r.status_code
        if not r.ok:
            debug['error'] = f"HTTP {r.status_code}"
            return results, debug
        data = r.json()
        items = data.get('shopping_results') or []
        debug['raw_count'] = len(items)
        for it in items:
            if len(results) >= MAX_PER_SITE:
                break
            title = it.get('title')
            link = it.get('link') or it.get('product_link')
            if not title or not link:
                continue
            price_val = _parse_price_to_float(it.get('price') or it.get('extracted_price'))
            if not price_in_range(price_val, price_min, price_max):
                continue
            image = it.get('thumbnail') or it.get('image')
            site = _site_name_from_url(link)
            # Normalize domain restriction
            if domain not in (urlparse(link).netloc or ''):
                # Some results may be aggregated; skip if not in domain
                if domain not in link:
                    continue
            results.append(make_result(domain.split('.')[0], len(results), title, price_val, site, image, link, category, style))
        return results, debug
    except Exception as e:
        debug['exception'] = str(e)
        return results, debug

@app.route('/search-furniture', methods=['POST'])
def search_furniture_endpoint():
    """Multi-site furniture search aggregating results from Wayfair, IKEA, West Elm, and Pottery Barn.
    WARNING: Demo scraping only; respect site ToS and robots.txt for production use.
    """
    try:
        data = request.get_json(silent=True) or {}
        query = data.get('query', '').strip()
        filters = data.get('filters', {})
        price_range = filters.get('priceRange', 'all')
        style = filters.get('style', 'all')
        category = filters.get('category', 'all')
        debug_flag = data.get('debug') or os.getenv('SEARCH_DEBUG') == '1'
        no_fallback = data.get('noFallback') or DISABLE_SEARCH_FALLBACK

        if not query:
            return jsonify({'success': True, 'results': []})

        price_min, price_max = PRICE_RANGE_MAP.get(price_range, (None, None))
        
        logger.info(f"Multi-site search for: '{query}' with filters: {filters}")

        # NEW: Prefer dedicated Wayfair module only (for now) — now combined with Pottery Barn and West Elm
        if WAYFAIR_ONLY and wayfair_get_products is not None and not data.get('forceMultiSite'):
            try:
                # Wayfair
                try:
                    wayfair_items = wayfair_get_products(query)
                except TypeError:
                    wayfair_items = wayfair_get_products(query=query)
                wf_adapted = _adapt_wayfair_products(wayfair_items, category, style)

                # Pottery Barn via API
                pb_items = pb_get_products(query)
                pb_adapted = _adapt_pottery_barn_products(pb_items, category, style) if pb_items else []

                # West Elm via API
                we_items = we_get_products(query)
                we_adapted = _adapt_west_elm_products(we_items, category, style) if we_items else []

                # Raymour & Flanigan via API
                rf_items = rf_get_products(query)
                rf_adapted = _adapt_raymour_flanigan_products(rf_items, category, style) if rf_items else []

                # Combine + dedupe by URL
                combined = []
                seen_urls = set()
                for lst in (wf_adapted, pb_adapted, we_adapted, rf_adapted):
                    for it in lst:
                        u = it.get('url') or ''
                        if u and u in seen_urls:
                            continue
                        if u:
                            seen_urls.add(u)
                        combined.append(it)

                if combined:
                    random.shuffle(combined)
                    final = combined[:20]
                    sites = []
                    if wf_adapted:
                        sites.append('Wayfair')
                    if pb_adapted:
                        sites.append('Pottery Barn')
                    if we_adapted:
                        sites.append('West Elm')
                    if rf_adapted:
                        sites.append('Raymour & Flanigan')
                    response = {
                        'success': True,
                        'results': final,
                        'total': len(final),
                        'query': query,
                        'sites_searched': sites or ['Wayfair']
                    }
                    if debug_flag:
                        response['debug'] = {
                            'wayfairOnly': True,
                            'priceRange': [price_min, price_max],
                            'wayfair_raw_count': len(wayfair_items) if isinstance(wayfair_items, list) else None,
                            'pb_raw_count': len(pb_items) if isinstance(pb_items, list) else None,
                            'we_raw_count': len(we_items) if isinstance(we_items, list) else None,
                            'rf_raw_count': len(rf_items) if isinstance(rf_items, list) else None,
                        }
                    logger.info(f"Returning {len(response['results'])} results from Wayfair + Pottery Barn + West Elm + Raymour & Flanigan modules")
                    return jsonify(response)
                else:
                    logger.warning("Wayfair+PB+WE+RF modules returned no adaptable items; falling back to HTML scrapers")
            except Exception as e:
                logger.error(f"Module path failed: {e}; falling back to existing scrapers")
        
        # Search all sites in parallel-ish (could use threading for better performance)
        all_results = []
        debug_info = {}
        sites_searched = []
        seen_urls = set()

        # Optional SerpAPI first for more reliable results
        if SERPAPI_KEY:
            serp_debug = {}
            for domain in ['wayfair.com', 'ikea.com', 'westelm.com', 'raymourflanigan.com']:
                serp_results, sd = _search_serpapi_for_domain(query, domain, price_min, price_max, category, style, limit=12)
                serp_debug[domain] = sd
                added = 0
                for item in serp_results:
                    if item['url'] in seen_urls:
                        continue
                    seen_urls.add(item['url'])
                    all_results.append(item)
                    added += 1
                if added:
                    sites_searched.append(_site_name_from_url(f'https://{domain}'))
            debug_info['serpapi'] = {**serp_debug, 'used': True}
        else:
            debug_info['serpapi'] = {'used': False}
        
        # Also try HTML scrapers to supplement results
        try:
            wayfair_results, wayfair_debug = scrape_wayfair(query, price_min, price_max, category, style)
            for it in wayfair_results:
                if it['url'] not in seen_urls:
                    seen_urls.add(it['url'])
                    all_results.append(it)
            sites_searched.append('Wayfair')
            debug_info['wayfair'] = wayfair_debug
            logger.info(f"Wayfair returned {len(wayfair_results)} results")
        except Exception as e:
            logger.error(f"Wayfair search failed: {e}")
            debug_info['wayfair'] = {'error': str(e)}

        try:
            ikea_results, ikea_debug = scrape_ikea(query, price_min, price_max, category, style)
            for it in ikea_results:
                if it['url'] not in seen_urls:
                    seen_urls.add(it['url'])
                    all_results.append(it)
            sites_searched.append('IKEA')
            debug_info['ikea'] = ikea_debug
            logger.info(f"IKEA returned {len(ikea_results)} results")
        except Exception as e:
            logger.error(f"IKEA search failed: {e}")
            debug_info['ikea'] = {'error': str(e)}
            
        try:
            westelm_results, westelm_debug = scrape_westelm(query, price_min, price_max, category, style)
            for it in westelm_results:
                if it['url'] not in seen_urls:
                    seen_urls.add(it['url'])
                    all_results.append(it)
            sites_searched.append('West Elm')
            debug_info['westelm'] = westelm_debug
            logger.info(f"West Elm returned {len(westelm_results)} results")
        except Exception as e:
            logger.error(f"West Elm search failed: {e}")
            debug_info['westelm'] = {'error': str(e)}

        # NEW: Add Pottery Barn API results to multi-site flow
        try:
            pb_items = pb_get_products(query)
            pb_adapted = _adapt_pottery_barn_products(pb_items, category, style) if pb_items else []
            added = 0
            for it in pb_adapted:
                if it['url'] and it['url'] in seen_urls:
                    continue
                if it['url']:
                    seen_urls.add(it['url'])
                all_results.append(it)
                added += 1
            if added:
                sites_searched.append('Pottery Barn')
            debug_info['pottery_barn'] = {'raw_count': len(pb_items) if isinstance(pb_items, list) else None, 'adapted': len(pb_adapted)}
            logger.info(f"Pottery Barn returned {len(pb_adapted)} results")
        except Exception as e:
            logger.error(f"Pottery Barn fetch failed: {e}")
            debug_info['pottery_barn'] = {'error': str(e)}

        # NEW: Add West Elm API results to multi-site flow (in addition to HTML scraper)
        try:
            we_items = we_get_products(query)
            we_adapted = _adapt_west_elm_products(we_items, category, style) if we_items else []
            added = 0
            for it in we_adapted:
                if it['url'] and it['url'] in seen_urls:
                    continue
                if it['url']:
                    seen_urls.add(it['url'])
                all_results.append(it)
                added += 1
            if added and 'West Elm' not in sites_searched:
                sites_searched.append('West Elm')
            debug_info['westelm_api'] = {'raw_count': len(we_items) if isinstance(we_items, list) else None, 'adapted': len(we_adapted)}
            logger.info(f"West Elm API returned {len(we_adapted)} results")
        except Exception as e:
            logger.error(f"West Elm API fetch failed: {e}")
            debug_info['westelm_api'] = {'error': str(e)}

        # NEW: Add Raymour & Flanigan API results to multi-site flow
        try:
            rf_items = rf_get_products(query)
            rf_adapted = _adapt_raymour_flanigan_products(rf_items, category, style) if rf_items else []
            added = 0
            for it in rf_adapted:
                if it['url'] and it['url'] in seen_urls:
                    continue
                if it['url']:
                    seen_urls.add(it['url'])
                all_results.append(it)
                added += 1
            if added:
                sites_searched.append('Raymour & Flanigan')
            debug_info['raymour_flanigan'] = {'raw_count': len(rf_items) if isinstance(rf_items, list) else None, 'adapted': len(rf_adapted)}
            logger.info(f"Raymour & Flanigan returned {len(rf_adapted)} results")
        except Exception as e:
            logger.error(f"Raymour & Flanigan API fetch failed: {e}")
            debug_info['raymour_flanigan'] = {'error': str(e)}

        # If no results from scraping, optional fallback
        if not all_results:
            logger.warning("No results from scrapers/SerpAPI")
            if not no_fallback:
                logger.warning("Using fallback results")
                all_results = get_fallback_results(query, category, style)
                sites_searched = ['Fallback Data']

        # Shuffle results to mix sites
        random.shuffle(all_results)
        
        # Limit total results
        final_results = all_results[:20]

        response = {
            'success': True, 
            'results': final_results,
            'total': len(final_results),
            'query': query,
            'sites_searched': sites_searched
        }
        
        if debug_flag:
            response['debug'] = {
                'resultCount': len(final_results),
                'priceRange': [price_min, price_max],
                'query': query,
                'sitesAttempted': len(debug_info),
                'siteDebug': debug_info
            }
            
        logger.info(f"Returning {len(final_results)} total results from {len(sites_searched)} sites")
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Search failed: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# NEW: Adapter for dedicated Wayfair module results (moved above usage)
# def _adapt_wayfair_products(...):
#     Moved above search_furniture_endpoint to ensure availability at runtime.

@app.route('/constructor-keys/status', methods=['GET'])
def constructor_keys_status():
    try:
        if not ctor_status:
            return jsonify({'success': False, 'error': 'Key store unavailable'}), 500
        return jsonify({'success': True, 'status': ctor_status()})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/constructor-keys/refresh', methods=['POST'])
def constructor_keys_refresh():
    """Refresh Constructor.io keys for supported sites using Playwright capture.
    Requires playwright and browser binaries installed.
    """
    try:
        if not ctor_save_keys or not ctor_status:
            return jsonify({'success': False, 'error': 'Key store unavailable'}), 500
        try:
            from refresh_api_keys import fetch_keys_once  # type: ignore
        except Exception as e:
            return jsonify({'success': False, 'error': f'Playwright refresh not available: {e}'}), 500
        # Run refresh in NON-headless mode per request (use original script)
        try:
            keys = fetch_keys_once(headless=False)  # type: ignore
        except TypeError:
            # Backward compatibility if function has no headless param
            keys = fetch_keys_once()  # type: ignore
        if not keys:
            return jsonify({'success': False, 'error': 'No keys captured'}), 500
        merged = ctor_save_keys(keys)
        stat = ctor_status()
        # Compute sites missing key or clientlib after refresh
        missing_sites = [
            s for s, v in (stat or {}).items()
            if not (isinstance(v, dict) and v.get('has_key') and v.get('has_clientlib'))
        ]
        return jsonify({
            'success': True,
            'keys': {k: {"key": v.get('key'), "clientlib": v.get('clientlib')} for k, v in merged.items()},
            'status': stat,
            'missing_sites': missing_sites,
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    logger.info("Starting furniture search + rembg backend server...")
    # Optionally preload rembg model for faster first request
    try:
        if session is None:
            logger.info("Preloading rembg model (u2net)...")
            session = new_session('u2net')
            setattr(session, '_model_name', 'u2net')
            logger.info("Model preloaded successfully")
    except Exception as e:
        logger.warning(f"Failed to preload rembg model: {e}")
        session = None

    host = os.getenv('HOST', '127.0.0.1')
    # Default to port 5000 to match frontend/tests; can override via PORT env var
    port = int(os.getenv('PORT', '5000'))  # UPDATED DEFAULT PORT
    logger.info(f"Server listening on http://{host}:{port}")
    app.run(host=host, port=port, debug=False, threaded=True)
