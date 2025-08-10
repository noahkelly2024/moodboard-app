import requests
from bs4 import BeautifulSoup
import csv
from urllib.parse import urljoin

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
}

BASE_URL = "https://www.wayfair.com/keyword.php"
WAYFAIR_DOMAIN = "https://www.wayfair.com"




# NEW: helpers to extract thumbnail image URL from nearby <img>

# Choose a src from a srcset string, preferring width near target (default 400w)
def _choose_from_srcset(srcset: str, target: int = 400) -> str | None:
    if not srcset:
        return None
    candidates: list[tuple[int, str]] = []
    for part in srcset.split(','):
        token = part.strip()
        if not token:
            continue
        segs = token.split()
        if not segs:
            continue
        url = segs[0]
        width = None
        for s in segs[1:]:
            if s.endswith('w'):
                try:
                    width = int(s[:-1])
                except Exception:
                    width = None
        candidates.append(((width or 0), url))
    if not candidates:
        return None
    candidates.sort(key=lambda x: x[0])
    # Pick the smallest candidate >= target; otherwise pick the largest available
    for w, u in candidates:
        if w >= target:
            return u
    return candidates[-1][1]


def _normalize_img_url(val: str) -> str | None:
    if not val:
        return None
    # Handle srcset values by picking a reasonable thumbnail
    if ',' in val and (' ' in val or 'w' in val):
        chosen = _choose_from_srcset(val, target=400)
        if chosen:
            val = chosen
        else:
            # fallback: first candidate
            parts = [p.strip().split(' ')[0] for p in val.split(',') if p.strip()]
            if parts:
                val = parts[0]
    if val.startswith('//'):
        return 'https:' + val
    if val.startswith('/'):
        return urljoin(WAYFAIR_DOMAIN, val)
    return val


def _find_root(node):
    cur = node
    while getattr(cur, 'parent', None) is not None:
        cur = cur.parent
    return cur


def _extract_img_from_node(node) -> str | None:
    if not node:
        return None
    # Prefer the ListingCard lead image or FluidImage
    img = node.select_one('img[data-test-id*="ListingCardImageCarousel"]') \
          or node.select_one('img[data-test-id*="LeadImage"]') \
          or node.select_one('img[data-hb-id="FluidImage"]') \
          or node.find('img')
    if not img:
        return None
    for attr in ('data-src', 'data-srcset', 'srcset', 'src', 'data-original'):
        val = img.get(attr)
        if val:
            return _normalize_img_url(val)
    return None


def _find_thumbnail(title_elem) -> str | None:
    if not title_elem:
        return None
    # 1) Look within the closest anchor first
    parent_link = title_elem.find_parent('a')
    if parent_link:
        val = _extract_img_from_node(parent_link)
        if val:
            return val

    # 2) Walk up ancestors to find a card container, then extract an image within
    node = title_elem
    for _ in range(8):
        if not node:
            break
        # Heuristic: nodes that likely represent a listing card
        if (
            node.get('data-enzyme-id') and 'ListingCard' in str(node.get('data-enzyme-id'))
        ) or (
            node.get('data-hb-id') and 'ListingCard' in str(node.get('data-hb-id'))
        ) or (
            node.get('class') and any('ListingCard' in ' '.join(node.get('class')) for _ in [0])
        ) or node.name in ('li', 'article', 'div'):
            val = _extract_img_from_node(node)
            if val:
                return val
        node = node.parent

    # 3) Try sibling anchors around the title (common pattern: image/link sibling before title)
    container = title_elem.parent
    for _ in range(3):
        if not container:
            break
        # Check previous and next siblings for images
        sib = container.previous_sibling
        while sib and hasattr(sib, 'name'):
            val = _extract_img_from_node(sib)
            if val:
                return val
            sib = sib.previous_sibling
        sib = container.next_sibling
        while sib and hasattr(sib, 'name'):
            val = _extract_img_from_node(sib)
            if val:
                return val
            sib = sib.next_sibling
        container = container.parent

    # 4) Global fallback: match <img alt> that contains the product title text
    title_text = title_elem.get_text(strip=True) or ''
    title_text_l = title_text.lower()
    root = _find_root(title_elem)
    try:
        imgs = root.find_all('img')
    except Exception:
        imgs = []
    best: str | None = None
    for img in imgs:
        alt = (img.get('alt') or '').strip().lower()
        if not alt:
            continue
        # Require at least a partial match to avoid random picks
        if title_text_l and (title_text_l in alt or alt in title_text_l):
            for attr in ('data-src', 'data-srcset', 'srcset', 'src', 'data-original'):
                val = img.get(attr)
                if val:
                    best = _normalize_img_url(val)
                    break
        if best:
            break
    return best


def get_products(query="black leather sofa", max_pages=1):
    all_products = []
    current_page = 1

    while current_page <= max_pages:
        params = {'keyword': query, 'curpage': current_page}
        print(f"[INFO] Scraping listing page {current_page}...")
        response = requests.get(BASE_URL, headers=HEADERS, params=params)

        if response.status_code != 200:
            print(f"[ERROR] Failed to load page {current_page}, status code: {response.status_code}")
            break

        soup = BeautifulSoup(response.text, 'html.parser')
        product_titles = soup.select('h2[data-test-id="ListingCard-ListingCardName-Text"]')
        prices = soup.select('span[data-test-id="PriceDisplay"]')

        if not product_titles:
            print(f"[INFO] No products found on page {current_page}.")
            break

        for i in range(len(product_titles)):
            title_elem = product_titles[i]
            title = title_elem.get_text(strip=True) if title_elem else "N/A"
            price = prices[i].get_text(strip=True) if i < len(prices) else "N/A"

            parent_link = title_elem.find_parent("a")
            product_url = urljoin(WAYFAIR_DOMAIN, parent_link["href"]) if parent_link and parent_link.has_attr("href") else "N/A"
            # NEW: thumbnail image (robust)
            image_url = _find_thumbnail(title_elem) or ""

            all_products.append({
                "title": title,
                "price": price,
                "url": product_url,
                "image": image_url,
            })

        current_page += 1

    return all_products


def save_products(products, filename="wayfair_bs4_products.csv"):
    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["title", "price", "url", "image"])
        writer.writeheader()
        writer.writerows(products)
    print(f"[DONE] Saved {len(products)} products to {filename}")


if __name__ == "__main__":
    products = get_products(query="black leather sofa", max_pages=1)
    save_products(products)