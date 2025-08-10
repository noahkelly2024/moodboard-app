import json
import os
from typing import Dict, Tuple, Optional
from datetime import datetime  # NEW

_KEYS_FILE = os.path.join(os.path.dirname(__file__), 'constructor_keys.json')

SITE_ENV_MAP = {
    'west_elm': ('WEST_ELM_API_KEY', 'WEST_ELM_CLIENT_LIB'),
    'pottery_barn': ('POTTERY_BARN_API_KEY', 'POTTERY_BARN_CLIENT_LIB'),
    'raymour_flanigan': ('RAYMOUR_FLANIGAN_API_KEY', 'RAYMOUR_FLANIGAN_CLIENT_LIB'),
}

def _load_file() -> Dict:
    try:
        if os.path.exists(_KEYS_FILE):
            with open(_KEYS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f) or {}
    except Exception:
        pass
    return {}


def _save_file(keys: Dict) -> None:
    try:
        with open(_KEYS_FILE, 'w', encoding='utf-8') as f:
            json.dump(keys, f, indent=2)
    except Exception:
        pass


def get_keys(site: str, fallback_key: Optional[str] = None, fallback_clientlib: Optional[str] = None) -> Tuple[Optional[str], Optional[str]]:
    """Return (key, clientlib) for the given site.
    Order of precedence: JSON file -> environment -> provided fallbacks.
    """
    data = _load_file()
    site_entry = (data.get(site) or {}) if isinstance(data, dict) else {}
    key = site_entry.get('key')
    clientlib = site_entry.get('clientlib')

    if not key or not clientlib:
        envs = SITE_ENV_MAP.get(site)
        if envs:
            env_key, env_cli = envs
            key = key or os.getenv(env_key)
            clientlib = clientlib or os.getenv(env_cli)

    return key or fallback_key, clientlib or fallback_clientlib


def save_keys(new_keys: Dict[str, Dict[str, Optional[str]]]) -> Dict:
    """Merge and persist new keys. Returns merged keys.
    Adds/updates per-site 'updated_at' timestamp when new values provided.
    """
    data = _load_file()
    if not isinstance(data, dict):
        data = {}
    for site, vals in (new_keys or {}).items():
        if not isinstance(vals, dict):
            continue
        curr = data.get(site) or {}
        in_key = vals.get('key')
        in_cli = vals.get('clientlib')
        # Merge values, prefer new truthy values
        merged_key = in_key or curr.get('key')
        merged_cli = in_cli or curr.get('clientlib')
        entry = {
            'key': merged_key,
            'clientlib': merged_cli,
        }
        # Set/update timestamp if any new truthy value differs from stored
        if (in_key and in_key != curr.get('key')) or (in_cli and in_cli != curr.get('clientlib')) or ('updated_at' not in curr and (merged_key or merged_cli)):
            entry['updated_at'] = datetime.utcnow().isoformat() + 'Z'
        else:
            if 'updated_at' in curr:
                entry['updated_at'] = curr['updated_at']
        data[site] = entry
    _save_file(data)
    return data


def status() -> Dict[str, Dict[str, bool]]:
    data = _load_file()
    out: Dict[str, Dict[str, bool]] = {}
    for site in SITE_ENV_MAP.keys():
        entry = (data.get(site) or {}) if isinstance(data, dict) else {}
        out[site] = {
            'has_key': bool(entry.get('key') or os.getenv(SITE_ENV_MAP[site][0])),
            'has_clientlib': bool(entry.get('clientlib') or os.getenv(SITE_ENV_MAP[site][1])),
            'updated_at': entry.get('updated_at'),  # NEW: last refresh timestamp if available
        }
    return out
