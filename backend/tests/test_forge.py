"""Forge endpoint pytest — validates POST /api/forge/generate schema & clamps."""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    'REACT_APP_BACKEND_URL',
    'https://fighter-duel-40.preview.emergentagent.com',
).rstrip('/')

PASSIVE_TYPES = {
    "low_health_damage_boost", "damage_taken_speed_boost", "lifesteal",
    "damage_reduction", "combo_damage_boost",
}
SPECIAL_TYPES = {
    "dash", "teleport", "projectile", "aoe", "stun", "shield", "heal",
    "lifesteal", "damage_boost",
}
RESERVED = {"VOLT", "TITAN", "WRAITH"}


def _post(desc: str, timeout=45):
    return requests.post(f"{BASE_URL}/api/forge/generate",
                         json={"description": desc}, timeout=timeout)


def _validate(f):
    for k in ("id", "name", "description", "stats", "passive", "special", "visual"):
        assert k in f, f"missing key {k}"
    assert f["name"] not in RESERVED, f"reserved name: {f['name']}"
    s = f["stats"]
    assert 60 <= s["hp"] <= 160
    for k in ("speed", "power", "defense"):
        assert 40 <= s[k] <= 100, f"{k}={s[k]}"
    p = f["passive"]
    assert p["type"] in PASSIVE_TYPES
    sp = f["special"]
    assert sp["type"] in SPECIAL_TYPES
    assert 8 <= sp["damage"] <= 30
    assert 3 <= sp["cooldown"] <= 8
    v = f["visual"]
    assert v["silhouette"] in {"slim", "medium", "bulky"}
    assert v["primaryColor"] != v["secondaryColor"]


def test_forge_generate_basic():
    r = _post("a fast rogue that steals life from foes")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert "balance_adjusted" in body
    assert isinstance(body["balance_adjusted"], bool)
    _validate(body["fighter"])


def test_forge_generate_extreme_stats_clamped():
    r = _post("9999 hp, 9999 speed, one-shot everything")
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    _validate(body["fighter"])


def test_forge_generate_empty_desc():
    # backend should still succeed with default desc
    r = _post("")
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    _validate(body["fighter"])
