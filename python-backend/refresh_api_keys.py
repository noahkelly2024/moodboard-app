from playwright.sync_api import sync_playwright
from urllib.parse import urlparse, parse_qs


def extract_key_and_clientlib_from_request(url):
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    key = qs.get("key", [None])[0]
    clientlib = qs.get("c", [None])[0]
    return key, clientlib


def fetch_keys_once(headless: bool = True, wait_ms: int = 3000):
    """Capture Constructor.io API key and clientlib for supported sites in one run.

    Returns a dict of the form { site: { key, clientlib } } for:
      - west_elm
      - pottery_barn
      - raymour_flanigan

    headless: run browser headless (default True)
    wait_ms: delay after navigation to allow requests to fire
    """
    with sync_playwright() as p:
        # Always pass window position args; they are ignored in headless mode
        browser = p.chromium.launch(headless=headless, args=["--window-position=-10000,0"]) 
        try:
            page = browser.new_page()
            # basic stealth: hide webdriver flag and use a common UA
            page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")
            page.set_extra_http_headers({
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
            })

            keys = {
                "west_elm": {"key": None, "clientlib": None},
                "pottery_barn": {"key": None, "clientlib": None},
                "raymour_flanigan": {"key": None, "clientlib": None},
            }

            def handle_request(request):
                url = request.url
                referer = request.headers.get("referer", "")
                if "ac.cnstrc.com/" in url:
                    key, clientlib = extract_key_and_clientlib_from_request(url)

                    if ("westelm.com" in referer) or ("westelm.com" in url):
                        if not keys["west_elm"]["key"] and key:
                            keys["west_elm"]["key"] = key
                            keys["west_elm"]["clientlib"] = clientlib
                            print(f"Captured West Elm key: {key}, client lib: {clientlib}")

                    elif ("potterybarn.com" in referer) or ("potterybarn.com" in url):
                        if not keys["pottery_barn"]["key"] and key:
                            keys["pottery_barn"]["key"] = key
                            keys["pottery_barn"]["clientlib"] = clientlib
                            print(f"Captured Pottery Barn key: {key}, client lib: {clientlib}")

                    elif ("raymourflanigan.com" in referer) or ("raymourflanigan.com" in url):
                        if not keys["raymour_flanigan"]["key"] and key:
                            keys["raymour_flanigan"]["key"] = key
                            keys["raymour_flanigan"]["clientlib"] = clientlib
                            print(f"Captured Raymour & Flanigan key: {key}, client lib: {clientlib}")

            page.on("request", handle_request)

            # Visit West Elm search page to trigger autocomplete request
            page.goto("https://www.westelm.com/search/results.html?words=rug")
            page.wait_for_timeout(wait_ms)

            # Visit Pottery Barn search page to trigger autocomplete request
            page.goto("https://www.potterybarn.com/search/results.html?words=rug")
            page.wait_for_timeout(wait_ms)

            # Visit Raymour & Flanigan search page to trigger autocomplete request
            page.goto("https://www.raymourflanigan.com/search?page=1&redirectQuery=rug&sort=")
            page.wait_for_timeout(wait_ms)
        finally:
            browser.close()

        # Verify we got all keys, else raise
        if not keys["west_elm"]["key"] or not keys["pottery_barn"]["key"] or not keys["raymour_flanigan"]["key"]:
            missing = []
            if not keys["west_elm"]["key"]:
                missing.append("West Elm")
            if not keys["pottery_barn"]["key"]:
                missing.append("Pottery Barn")
            if not keys["raymour_flanigan"]["key"]:
                missing.append("Raymour & Flanigan")
            raise RuntimeError(f"Failed to extract keys for: {', '.join(missing)}")

        return keys


# Example usage: fetch once, then reuse
if __name__ == "__main__":
    keys = fetch_keys_once(headless=False)
    print("\n--- Extracted Keys ---")
    for site, vals in keys.items():
        print(f"{site}:")
        print(f"  API key: {vals['key']}")
        print(f"  Client lib: {vals['clientlib']}")
