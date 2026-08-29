import os
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://fighter-duel-40.preview.emergentagent.com').rstrip('/')


def test_root():
    r = requests.get(f"{BASE_URL}/api/", timeout=15)
    assert r.status_code == 200
    assert r.json() == {"message": "Hello World"}


def test_openapi():
    r = requests.get(f"{BASE_URL}/api/openapi.json", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "paths" in data
    assert any(p.startswith("/api") for p in data["paths"].keys())


def test_status_crud():
    payload = {"client_name": "TEST_pytest"}
    r = requests.post(f"{BASE_URL}/api/status", json=payload, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["client_name"] == "TEST_pytest"
    assert "id" in body

    r2 = requests.get(f"{BASE_URL}/api/status", timeout=15)
    assert r2.status_code == 200
    assert isinstance(r2.json(), list)
