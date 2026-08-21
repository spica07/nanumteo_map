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
    # org(운영기관명) 하나로 키를 잡으면 같은 운영기관이 지점마다 여러 번
    # 등장할 때(예: 울산북구가족센터가 서로 다른 주소로 2건) 어느 지점인지
    # 구분할 수 없어 잘못된 좌표가 다른 지점에도 섞여 들어간다. 원본 CSV의
    # 연번(no)은 행마다 유일하므로 이걸로 키를 잡는다.
    extra_by_no = {}
    if EXTRA.exists():
        extra = json.loads(EXTRA.read_text(encoding="utf-8"))
        extra_by_no = {str(e["no"]): e for e in extra.get("items", [])}

    items = []
    missing = []
    for r in records:
        lat, lng = r.get("lat"), r.get("lng")
        address, phone = r["address"], r["phone"]
        entry = extra_by_no.get(str(r["no"]))
        if entry:
            # lat/lng가 있으면(=지오코딩 성공) extra는 "확인된 정정"이다 —
            # 원본 주소가 이전 전 옛 주소로 남아있는 경우(예: 강서구가족센터
            # 1호점, 2026-08-22 제보) 실사용자 제보로 주소·전화·좌표를 덮어쓴다.
            # lat/lng가 없으면(=지오코딩 실패) 기존과 같이 좌표만 채운다.
            lat, lng = entry["lat"], entry["lng"]
            if "address" in entry:
                address = entry["address"]
            if "phone" in entry:
                phone = entry["phone"]
        if lat is None:
            missing.append(r["org"])
            continue
        items.append({
            "id": int(r["no"]) if str(r["no"]).isdigit() else len(items) + 1,
            "sido": r["sido"],
            "sigungu": r["sigungu"],
            "address": address,
            "org": r["org"],
            "phone": phone,
            "lat": round(lat, 6),
            "lng": round(lng, 6),
        })

    # 원본 컬럼명이 바뀌는 등으로 파이프라인이 조용히 거의 빈 데이터를
    # 만들어내는 사고를 막는 최소 안전장치. 지오코딩 실패는 정상적으로도
    # 몇 건씩 나오지만(주소 오탈자 등), 90% 밑으로 떨어지면 뭔가 근본적으로
    # 잘못됐다는 신호다.
    if records and len(items) < 0.9 * len(records):
        raise RuntimeError(
            f"결과가 너무 적습니다: {len(items)}/{len(records)} — "
            "원본 컬럼명이 바뀌었을 수 있습니다"
        )

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
