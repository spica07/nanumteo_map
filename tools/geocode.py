# -*- coding: utf-8 -*-
"""nanumteo_raw.csv 의 도로명주소를 카카오 로컬 API로 지오코딩해
tools/geocoded.json 을 만든다. museum_map·kindergarten_map과 같은
캐시 방식(kakao_cache.json)을 쓴다. 인증키는 .env(KAKAO_REST_KEY).
"""
import csv
import json
import re
import sys
import time
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "nanumteo_raw.csv"
CACHE_FILE = ROOT / "tools" / "kakao_cache.json"
OUT = ROOT / "tools" / "geocoded.json"
KAKAO_ADDR_URL = "https://dapi.kakao.com/v2/local/search/address.json"


def load_kakao_key():
    env_path = ROOT / ".env"
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("KAKAO_REST_KEY="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError(".env 에서 KAKAO_REST_KEY를 찾을 수 없습니다.")


session = requests.Session()
session.headers["Authorization"] = "KakaoAK " + load_kakao_key()
cache = json.loads(CACHE_FILE.read_text(encoding="utf-8")) if CACHE_FILE.exists() else {}


def save_cache():
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")


def clean_query(addr):
    a = re.sub(r"\([^)]*\)", "", addr)
    a = re.sub(r"\s+", " ", a).strip()
    return a


def kakao_address(query):
    key = "addr:" + query
    if key in cache:
        return cache[key]
    for attempt in range(3):
        try:
            r = session.get(KAKAO_ADDR_URL, params={"query": query}, timeout=15)
            if r.status_code == 429:
                time.sleep(1.0)
                continue
            r.raise_for_status()
            docs = r.json().get("documents", [])
            hit = {"lat": float(docs[0]["y"]), "lng": float(docs[0]["x"])} if docs else None
            cache[key] = hit
            save_cache()
            time.sleep(0.05)
            return hit
        except requests.RequestException as e:
            if attempt == 2:
                print(f"  ! 요청 실패: {query!r} ({e})")
                return None
            time.sleep(0.5)
    return None


def main():
    rows = list(csv.DictReader(SRC.open(encoding="cp949")))
    # "주소(도로명) "과 "주소(도로명)" 둘 다 없으면(예: data.go.kr이 컬럼명을
    # 바꿈) r.get(...) or r.get(...) or "" 가 모든 행에서 조용히 빈 문자열을
    # 반환해 430건이 전부 지오코딩 실패로 빠진다. 미리 걸러낸다.
    if rows:
        first_keys = set(rows[0].keys())
        if "주소(도로명) " not in first_keys and "주소(도로명)" not in first_keys:
            raise RuntimeError(
                "CSV에서 '주소(도로명)' 컬럼을 찾을 수 없습니다 — "
                f"실제 컬럼명: {sorted(first_keys)} "
                "(data.go.kr이 컬럼명을 바꿨을 수 있습니다)"
            )
    geocoded = failed = 0
    out = []
    for r in rows:
        addr = (r.get("주소(도로명) ") or r.get("주소(도로명)") or "").strip()
        hit = kakao_address(addr) if addr else None
        if not hit:
            hit = kakao_address(clean_query(addr)) if addr else None
        if hit:
            geocoded += 1
        else:
            failed += 1
            print("  ! 지오코딩 실패:", r.get("운영기관"), "|", addr)
        out.append({
            "no": r.get("연번"),
            "sido": (r.get("시도") or "").strip(),
            "sigungu": (r.get("시군구") or "").strip(),
            "address": addr,
            "org": (r.get("운영기관") or "").strip(),
            "phone": (r.get("연락처") or "").strip(),
            "lat": hit["lat"] if hit else None,
            "lng": hit["lng"] if hit else None,
        })
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"완료: 지오코딩 {geocoded} / 실패 {failed} (전체 {len(rows)}) -> {OUT}")


if __name__ == "__main__":
    main()
