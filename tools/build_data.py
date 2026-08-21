# -*- coding: utf-8 -*-
"""geocoded.json (+ 있으면 nanumteo_extra.json 수동 보강)을 합쳐
assets/js/data.js 를 생성한다. 430곳 규모라 museum_map처럼 객체 배열을 쓴다
(shelter_map류의 튜플 최적화는 이 규모에서 불필요하다).
"""
import json
import sys
from datetime import date
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "geocoded.json"
EXTRA = ROOT / "tools" / "nanumteo_extra.json"
OUT = ROOT / "assets" / "js" / "data.js"


def main():
    records = json.loads(SRC.read_text(encoding="utf-8"))
    extra_by_org = {}
    if EXTRA.exists():
        extra = json.loads(EXTRA.read_text(encoding="utf-8"))
        extra_by_org = {e["org"]: e for e in extra.get("items", [])}

    items = []
    missing = []
    for r in records:
        lat, lng = r.get("lat"), r.get("lng")
        if lat is None and r["org"] in extra_by_org:
            lat, lng = extra_by_org[r["org"]]["lat"], extra_by_org[r["org"]]["lng"]
        if lat is None:
            missing.append(r["org"])
            continue
        items.append({
            "id": int(r["no"]) if str(r["no"]).isdigit() else len(items) + 1,
            "sido": r["sido"],
            "sigungu": r["sigungu"],
            "address": r["address"],
            "org": r["org"],
            "phone": r["phone"],
            "lat": round(lat, 6),
            "lng": round(lng, 6),
        })

    items.sort(key=lambda x: (x["sido"], x["sigungu"], x["org"]))
    sidos = sorted({i["sido"] for i in items})

    meta = {
        "surveyDate": date.today().isoformat(),
        "source": "한국건강가정진흥원 전국 공동육아나눔터 기관현황(data.go.kr)",
        "counts": {"total": len(items), "제외_좌표없음": len(missing)},
    }

    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    body = "\n".join([
        "// 자동 생성 파일 — tools/build_data.py 가 생성. 직접 수정하지 마세요.",
        f"window.NANUMTEO_META = {dump(meta)};",
        f"window.NANUMTEO_SIDOS = {dump(sidos)};",
        f"window.NANUMTEO = {dump(items)};",
        "",
    ])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(body, encoding="utf-8")

    print(f"완료: {len(items)}곳 (좌표 없어 제외 {len(missing)}건: {missing})")
    print(f"시도 {len(sidos)}종: {sidos}")
    print(OUT)


if __name__ == "__main__":
    main()
