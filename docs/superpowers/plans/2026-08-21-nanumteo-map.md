# 공동육아나눔터 지도 (nanumteo_map) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전국 공동육아나눔터 430곳을 지도에서 찾아보는 빌드 없는 정적 PWA를 만든다.

**Architecture:** data.go.kr의 파일형 데이터셋(`한국건강가정진흥원_전국 공동육아나눔터 기관현황`, pk=15055830)을 직접 다운로드(`tools/download_data.py`)해 CSV를 얻고, 도로명주소를 카카오 로컬 API로 지오코딩(`tools/geocode.py`)한 뒤 `tools/build_data.py`가 museum_map과 같은 객체 배열 형태의 `assets/js/data.js`를 생성한다. 430곳으로 규모가 작아 튜플 최적화 없이 객체 배열을 그대로 쓴다.

**Tech Stack:** Python 3(`py` 실행), `requests`(카카오 API 호출), 표준 라이브러리(`urllib`, `csv`, `json`). 프런트엔드는 순수 JS(ES5) + Leaflet 1.9 + OpenStreetMap.

**Spec:** `docs/superpowers/specs/2026-08-21-nanumteo-map-design.md`

## Global Constraints

- 파이썬은 `python`이 아니라 `py`로 실행한다.
- 이모지(국기 포함)를 쓰지 않는다. 아이콘은 인라인 SVG(`class="ico"`, `viewBox="0 0 24 24"`).
- 독도를 항상 위도 37.2429 / 경도 131.8664(경상북도 울릉군 울릉읍 독도리)에 직접 표시한다.
- `report.html`은 메인 UI에서 버튼을 노출하지 않는다.
- `assets/js/data.js`는 `tools/build_data.py`가 생성한다 — 직접 수정하지 않는다.
- `.env`는 git에 커밋하지 않는다.
- 원본 CSV는 `cp949` 인코딩이다(2026-08-21 실제 다운로드로 확인).
- 전국 대상이다(서울로 좁히지 않는다 — 2026-08-21 사용자 결정, daycare_map만 서울 전용이고 이 프로젝트는 원래 스펙대로 전국).

---

### Task 1: 프로젝트 골격

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `manifest.json`
- Create: `robots.txt`

**Interfaces:**
- Consumes: 없음
- Produces: 이후 모든 Task가 참조하는 디렉터리 구조

- [ ] **Step 1: `.gitignore` 작성**

```gitignore
.env
node_modules/
tools/*.csv
tools/*.json
!tools/kakao_cache.json
.DS_Store
```

(`kakao_cache.json`은 museum_map·kindergarten_map 관례대로 커밋 대상이다 — 재지오코딩 방지.)

- [ ] **Step 2: `.env.example` 작성**

```
# 카카오 로컬 API 인증키 (도로명주소 지오코딩용). 카카오맵 API 활성화 필요.
KAKAO_REST_KEY=
```

- [ ] **Step 3: `.env` 생성 (git에 안 잡힘)**

다른 지도 프로젝트(`museum_map`, `medicine_map` 등)의 `.env`에 있는 `KAKAO_REST_KEY`와 같은 값을 `nanumteo_map/.env`에 넣는다.

- [ ] **Step 4: `manifest.json` 작성**

```json
{
  "name": "공동육아나눔터 지도",
  "short_name": "나눔터지도",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#F7F5F0",
  "theme_color": "#C2703D",
  "icons": [
    { "src": "assets/icons/app-icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "assets/icons/app-icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 5: `robots.txt` 작성**

```
User-agent: *
Allow: /
```

- [ ] **Step 6: 디렉터리 생성 및 커밋**

```bash
mkdir -p assets/css assets/js assets/icons tools docs/superpowers/specs docs/superpowers/plans
git add .gitignore .env.example manifest.json robots.txt
git commit -m "nanumteo_map: 프로젝트 골격"
```

---

### Task 2: 원본 데이터 다운로드 스크립트

**Files:**
- Create: `tools/download_data.py`

**Interfaces:**
- Consumes: 없음(무키 다운로드)
- Produces: `tools/nanumteo_raw.csv` (cp949 인코딩, 헤더 1행 + 데이터, 컬럼: `연번,시도,시군구,주소(도로명) ,운영기관,연락처`) — Task 3이 이 파일을 읽는다.

data.go.kr의 이 데이터셋은 "파일형"이라 museum_map(`columList.json`/`standard.json`, "표준데이터"형)과 다운로드 방식이 다르다. 2026-08-21에 직접 확인한 실제 다운로드 URL을 그대로 쓴다: `https://www.data.go.kr/data/15055830/fileData.do` 페이지 안의 `atchFileId=FILE_000000003556678&fileDetailSn=1`을 `https://www.data.go.kr/cmm/cmm/fileDownload.do`에 넘기면 CSV가 내려받아진다. **이 파일ID는 데이터셋이 갱신되면 바뀔 수 있다** — Task 2 Step 1에서 페이지를 다시 읽어 최신 `atchFileId`를 자동으로 찾도록 만든다(하드코딩하지 않는다).

- [ ] **Step 1: `tools/download_data.py` 작성**

```python
# -*- coding: utf-8 -*-
"""공공데이터포털 「한국건강가정진흥원_전국 공동육아나눔터 기관현황」(pk=15055830)을
로그인·API키 없이 내려받아 tools/nanumteo_raw.csv 로 저장.

이 데이터셋은 "파일형"(표준데이터 아님)이라 페이지에 박힌 atchFileId를 먼저
찾아야 한다. 데이터셋이 갱신되면 atchFileId가 바뀌므로 하드코딩하지 않는다.
"""
import re
import sys
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / "nanumteo_raw.csv"
DETAIL_URL = "https://www.data.go.kr/data/15055830/fileData.do"
DOWNLOAD_BASE = "https://www.data.go.kr/cmm/cmm/fileDownload.do"
HEADERS = {"User-Agent": "Mozilla/5.0"}


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()


def main():
    html = fetch(DETAIL_URL).decode("utf-8", errors="replace")
    m = re.search(r"atchFileId=([A-Za-z0-9_]+)&fileDetailSn=(\d+)", html)
    if not m:
        raise RuntimeError(
            "atchFileId를 찾지 못했습니다 — data.go.kr 페이지 구조가 바뀌었을 수 있습니다. "
            "https://www.data.go.kr/data/15055830/fileData.do 를 직접 열어 확인하세요."
        )
    atch_file_id, detail_sn = m.group(1), m.group(2)
    print("atchFileId:", atch_file_id, "| fileDetailSn:", detail_sn)

    url = f"{DOWNLOAD_BASE}?atchFileId={atch_file_id}&fileDetailSn={detail_sn}&insertDataPrcus=N"
    data = fetch(url)
    OUT.write_bytes(data)
    print(f"저장 완료: {len(data):,} bytes -> {OUT}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 실행**

Run: `cd nanumteo_map && py tools/download_data.py`
Expected: "atchFileId: FILE_..." 출력 후 "저장 완료: 약 38,000 bytes -> ...\tools\nanumteo_raw.csv".

- [ ] **Step 3: 인코딩과 내용 확인**

Run: `py -c "print(open('tools/nanumteo_raw.csv', encoding='cp949').read()[:300])"`
Expected: `연번,시도,시군구,주소(도로명) ,운영기관,연락처`로 시작하는 헤더와 이어지는 데이터 행이 한글 깨짐 없이 출력된다.

- [ ] **Step 4: 커밋**

```bash
git add tools/download_data.py
git commit -m "nanumteo_map: 원본 CSV 다운로드 스크립트"
```

---

### Task 3: 지오코딩 스크립트

**Files:**
- Create: `tools/geocode.py`

**Interfaces:**
- Consumes: `tools/nanumteo_raw.csv`(Task 2), `.env`의 `KAKAO_REST_KEY`
- Produces: `tools/geocoded.json` — 배열, 각 원소 `{연번, 시도, 시군구, 주소, 운영기관, 연락처, lat, lng, geoApprox}`. Task 4가 이 파일을 읽는다. `tools/kakao_cache.json`(재실행 시 캐시, 커밋 대상).

- [ ] **Step 1: `tools/geocode.py` 작성**

```python
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
```

- [ ] **Step 2: 실행**

Run: `py tools/geocode.py`
Expected: 진행 중 실패한 주소가 있으면 "! 지오코딩 실패: ..." 로그가 나오고, 마지막에 "완료: 지오코딩 N / 실패 M (전체 430) -> ...\tools\geocoded.json"이 출력된다. 430곳 중 실패는 소수(0~5건 정도)로 예상된다 — 많으면(10건 이상) 주소 컬럼명 파싱이 잘못됐을 가능성이 크므로 Step 1의 컬럼명(`주소(도로명) ` 뒤 공백 유무)을 다시 확인한다.

- [ ] **Step 3: 실패 건 확인**

Run: `py -c "import json; d=json.load(open('tools/geocoded.json', encoding='utf-8')); print([x['org'] for x in d if x['lat'] is None])"`
Expected: 실패한 기관명 목록이 출력된다. 있다면 이름을 적어 뒀다가 Task 4에서 수동 보강 여부를 판단한다.

- [ ] **Step 4: 커밋**

```bash
git add tools/geocode.py tools/kakao_cache.json
git commit -m "nanumteo_map: 카카오 지오코딩 스크립트"
```

---

### Task 4: 정제 스크립트 — `assets/js/data.js` 생성

**Files:**
- Create: `tools/build_data.py`
- Conditionally create: `tools/nanumteo_extra.json` (Task 3 Step 3에서 지오코딩 실패 건이 있을 때만, museum_map의 `museums_extra.json` 패턴대로 수동 좌표 보강)

**Interfaces:**
- Consumes: `tools/geocoded.json`(Task 3), 있다면 `tools/nanumteo_extra.json`
- Produces: `assets/js/data.js` — `window.NANUMTEO_META`, `window.NANUMTEO_SIDOS`, `window.NANUMTEO`(객체 배열, 각 원소 `{id, sido, sigungu, address, org, phone, lat, lng}`). Task 5(app.js)가 이 스키마를 소비한다.

- [ ] **Step 1: `tools/build_data.py` 작성**

```python
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
```

- [ ] **Step 2: (조건부) 좌표 실패 건 수동 보강**

Task 3 Step 3에서 실패 목록이 나왔다면, 각 기관명으로 카카오맵이나 검색엔진에서 직접 좌표를 찾아 `tools/nanumteo_extra.json`을 만든다:

```json
{
  "_comment": "geocode.py가 못 찾은 곳 수동 보강. lat/lng는 카카오맵에서 직접 확인.",
  "items": [
    { "org": "실패했던 운영기관명 그대로", "lat": 37.0000, "lng": 127.0000 }
  ]
}
```

실패가 0건이면 이 Step은 건너뛴다(파일을 만들지 않는다 — `build_data.py`가 파일 존재 여부로 분기한다).

- [ ] **Step 3: 실행**

Run: `py tools/build_data.py`
Expected: "완료: 430곳 (좌표 없어 제외 0건: [])" 같은 출력과 함께 `assets/js/data.js` 생성. `제외 0건`이 아니면 Step 2로 돌아가 보강한다.

- [ ] **Step 4: 문법 검증**

Run: `node --check assets/js/data.js`
Expected: 아무 출력 없이 종료.

- [ ] **Step 5: 커밋**

```bash
git add tools/build_data.py assets/js/data.js
git add tools/nanumteo_extra.json  # 있는 경우에만
git commit -m "nanumteo_map: 정제 스크립트 및 data.js 생성"
```

---

### Task 5: "내 주변" 모듈 이식

**Files:**
- Create: `assets/js/geo.js` (내용은 `shelter_map/assets/js/geo.js`를 그대로 복사)

**Interfaces:**
- Consumes: 없음
- Produces: Task 6(app.js)이 `latLngOf`, `onClear`, `onChange`, `unitLabel: '나눔터'`로 호출

- [ ] **Step 1: 복사**

```bash
cp ../shelter_map/assets/js/geo.js assets/js/geo.js
```

- [ ] **Step 2: 동일성 확인**

Run: `diff ../shelter_map/assets/js/geo.js assets/js/geo.js`
Expected: 출력 없음.

- [ ] **Step 3: 문법 검증**

Run: `node --check assets/js/geo.js`
Expected: 아무 출력 없이 종료.

- [ ] **Step 4: 커밋**

```bash
git add assets/js/geo.js
git commit -m "nanumteo_map: geo.js 이식"
```

---

### Task 6: `assets/js/app.js` — 지도·필터·상세·제도 안내 모달

**Files:**
- Create: `assets/js/app.js` (기반: `museum_map/assets/js/app.js` 복사 후 아래대로 수정)

**Interfaces:**
- Consumes: `window.NANUMTEO`(객체 배열, 필드: `id, sido, sigungu, address, org, phone, lat, lng`), `window.NANUMTEO_META`, `window.NANUMTEO_SIDOS`, `assets/js/geo.js`
- Produces: `index.html`(Task 7)이 참조하는 DOM id 전부

- [ ] **Step 1: 복사**

```bash
cp ../museum_map/assets/js/app.js assets/js/app.js
```

- [ ] **Step 2: 데이터 변수명 교체**

museum_map의 `window.MUSEUMS`, `window.DATA_META` 등을 읽던 부분을 `window.NANUMTEO`, `window.NANUMTEO_META`, `window.NANUMTEO_SIDOS`로 바꾼다. 이 프로젝트는 필드가 museum_map(박물관 종류·요금·휴관일 등 10여 개)보다 훨씬 적으므로(7개), museum_map에만 있는 필드(요금, 휴관일, 전시 종류 등) 관련 코드는 전부 지운다.

- [ ] **Step 3: 필터를 지역만 남기고 단순화**

museum_map의 "종류" 필터, "무료 여부" 필터 등 이 프로젝트에 없는 필드 기반 필터는 전부 지운다. 남기는 것: 시도 → 시군구(2단계, `sigungu`는 데이터에서 직접 뽑는다 — 별도 코드표 불필요), 이름(`org`)·주소 검색, 찜하기.

- [ ] **Step 4: 유형별 마커 색상 로직 제거**

이 프로젝트는 유형 필터가 없으므로(스펙 5절) 모든 마커를 단일 색상으로 그린다. `KIND_COLOR` 관련 코드를 지우고 `--sign`(또는 새로 정의할 단일 브랜드 색) 하나로 고정한다.

- [ ] **Step 5: 상세 화면 구성**

시도, 시군구, 도로명주소(`address`), 운영기관명(`org`), 연락처(`phone`)를 표시하고, 그 아래 문구를 고정으로 붙인다:

```javascript
'<p class="notice">운영시간과 이용 방법은 운영기관에 직접 문의하세요.</p>'
```

- [ ] **Step 6: 공통 제도 안내 모달 추가 (신규, museum_map에 없는 것)**

버튼 하나(`id="aboutBtn"`, 헤더 영역)를 누르면 여는 모달을 새로 만든다. 내용은 스펙 6절 그대로 고정 텍스트로 넣는다:

```javascript
var ABOUT_HTML =
  '<h3>공동육아나눔터란</h3>' +
  '<p>영유아와 초등 저학년을 대상으로 안전한 돌봄 공간을 제공하는 곳이에요. ' +
  '부모 그룹이 자율적으로 교대 돌봄(1회 2~4시간)을 하는 품앗이 공동육아를 ' +
  '센터가 매칭하고 살펴봐요.</p>' +
  '<p>발달단계별 놀이·체험 프로그램, 명절·생태 체험 같은 활동도 함께 운영해요.</p>';

document.getElementById('aboutBtn').addEventListener('click', function () {
  openModal(ABOUT_HTML); // museum_map에 이미 있는 모달 열기 헬퍼를 재사용
});
```

(`openModal` 헬퍼 함수명은 museum_map의 실제 함수명을 Step 1에서 복사한 파일에서 확인해 그대로 맞춘다 — 다르면 그 이름으로 바꾼다.)

- [ ] **Step 7: "내 주변" 연동**

`geo.js` 초기화 호출부의 `unitLabel`을 `'나눔터'`로, `latLngOf`를 `function(r) { return [r.lat, r.lng]; }`로 맞춘다(museum_map도 객체 배열이라 이 부분은 필드명만 바꾸면 된다).

- [ ] **Step 8: 독도 표시**

`markDokdo()`는 museum_map 원본 그대로 유지한다(수정 불필요).

- [ ] **Step 9: 문법 검증**

Run: `node --check assets/js/app.js`
Expected: 아무 출력 없이 종료.

- [ ] **Step 10: 커밋**

```bash
git add assets/js/app.js
git commit -m "nanumteo_map: app.js (museum_map 이식 + 제도 안내 모달 추가)"
```

---

### Task 7: `index.html` / `report.html` / `style.css` / `sw.js`

**Files:**
- Create: `index.html` (기반: `museum_map/index.html`)
- Create: `report.html` (기반: `museum_map/report.html`)
- Create: `assets/css/style.css` (기반: `museum_map/assets/css/style.css`)
- Create: `sw.js` (기반: `museum_map/sw.js`)

**Interfaces:**
- Consumes: Task 6의 `app.js`가 참조하는 DOM id 전부(`#aboutBtn` 포함)
- Produces: 브라우저에서 열리는 완성된 페이지

- [ ] **Step 1: index.html**

```bash
cp ../museum_map/index.html index.html
```

`<title>`을 "공동육아나눔터 지도"로, 헤더에 Task 6 Step 6의 `id="aboutBtn"` 버튼("공동육아나눔터란?" 같은 라벨)을 추가, museum_map 전용 필터 UI(종류·무료여부)는 지운다. `<script>` 로드 순서를 `data.js` → `geo.js` → `app.js`로 확인.

- [ ] **Step 2: report.html**

```bash
cp ../museum_map/report.html report.html
```

`window.NANUMTEO_META.counts`(Task 4에서 만든 `total`, `제외_좌표없음`)를 표시하도록 필드명을 맞춘다.

- [ ] **Step 3: style.css**

```bash
cp ../museum_map/assets/css/style.css assets/css/style.css
```

유형별 색상 변수(`--kind-*`)가 있다면 지운다(이 프로젝트는 단일 색상). `.notice`(Task 6 Step 5의 문의 안내 문구), `.modal-about` 스타일을 추가한다.

- [ ] **Step 4: sw.js**

```bash
cp ../museum_map/sw.js sw.js
```

`const CACHE = '...'`을 `const CACHE = 'nanumteo-map-cache-v1';`로, `PRECACHE` 파일 목록을 이 프로젝트 실제 파일로 맞춘다.

- [ ] **Step 5: 문법 검증**

Run: `node --check sw.js && node --check assets/js/app.js`
Expected: 둘 다 아무 출력 없이 종료.

- [ ] **Step 6: 로컬 서버로 육안 확인**

Run: `py -m http.server 8020` (nanumteo_map 폴더에서)
브라우저로 `http://localhost:8020`을 열어 지도에 430개 마커가 찍히는지, 시도/시군구 필터가 동작하는지, 상세 모달에 "운영시간과 이용 방법은 운영기관에 직접 문의하세요" 문구가 보이는지, "공동육아나눔터란?" 버튼을 눌렀을 때 제도 안내 모달이 뜨는지 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add index.html report.html assets/css/style.css sw.js
git commit -m "nanumteo_map: index.html/report.html/style.css/sw.js"
```

---

### Task 8: 아이콘 및 README

**Files:**
- Create: `tools/make_icons.py` (기반: `museum_map/tools/make_icons.py`)
- Create: `assets/icons/*.png`
- Create: `README.md`

**Interfaces:**
- Consumes: 없음
- Produces: 최종 배포 가능 상태

- [ ] **Step 1: 아이콘 스크립트 복사 및 실행**

```bash
cp ../museum_map/tools/make_icons.py tools/make_icons.py
```

라벨 텍스트만 "나눔터"로 바꾸고 실행한다.

Run: `py tools/make_icons.py`
Expected: `assets/icons/`에 PNG 생성.

- [ ] **Step 2: README.md 작성**

```markdown
# 공동육아나눔터 지도 (nanumteo_map)

전국 공동육아나눔터 430여 곳을 지도에서 찾아보는 PWA. 빌드 도구 없이 정적 파일로 동작한다.

- Leaflet + OpenStreetMap 타일
- 시도 → 시군구 필터, 이름·운영기관·주소 검색
- 공동육아나눔터 제도 안내 모달
- 오프라인 지원(서비스워커), 홈 화면 설치

## 데이터

출처는 「한국건강가정진흥원_전국 공동육아나눔터 기관현황」(공공데이터포털, pk=15055830).
API가 아니라 파일형 데이터라 `tools/download_data.py`가 다운로드 페이지에서
최신 첨부파일ID를 찾아 받는다. 원본에 좌표가 없어 카카오 지오코딩으로 채운다.

## 갱신 절차

\`\`\`bash
py tools/download_data.py   # CSV 재다운로드 → tools/nanumteo_raw.csv
py tools/geocode.py         # 카카오 지오코딩 (캐시됨) → tools/geocoded.json
py tools/build_data.py      # 정제 → assets/js/data.js
\`\`\`

`sw.js`의 `CACHE` 버전 숫자를 올려야 이용자에게 새 데이터가 내려간다.

## 규칙

- 독도를 항상 직접 그린다(위도 37.2429 / 경도 131.8664, 경상북도 울릉군 울릉읍 독도리).
- 국기 이모지를 포함해 이모지를 쓰지 않는다.
- 파이썬은 `python`이 아니라 `py`로 실행한다.
```

- [ ] **Step 3: 커밋**

```bash
git add tools/make_icons.py assets/icons/ README.md
git commit -m "nanumteo_map: 아이콘 및 README"
```

- [ ] **Step 4: 스펙 대비 최종 확인**

`docs/superpowers/specs/2026-08-21-nanumteo-map-design.md` 섹션 2~8을 하나씩 보며 대응 코드를 확인한다. 빠진 게 있으면 보완한다.

---

## Self-Review 메모

- **스펙 커버리지:** 섹션 2(데이터) → Task 2, 섹션 3(좌표) → Task 3, 섹션 4(렌더링) → Task 6(객체 배열 방식 확정), 섹션 5(필터·UI) → Task 6 Step 3, 섹션 6(상세 화면) → Task 6 Step 5·6, 섹션 7(공통 규칙) → Global Constraints + Task 6 Step 8, 섹션 8(파일 구조) → Task 1·7·8.
- **다운로드 URL 취약성:** Task 2의 `atchFileId`는 데이터셋이 갱신되면 바뀌므로 하드코딩하지 않고 페이지에서 매번 다시 찾도록 만들었다 — museum_map(표준데이터, `publicDataPk`가 절대 안 바뀜)과 다른 이 프로젝트만의 리스크라 Step 1 스크립트에 명시적으로 주석을 남겼다.
- **좌표 실패 처리:** Task 3에서 실패가 나올 가능성을 열어두고 Task 4 Step 2에 museum_map과 동일한 수동 보강 패턴(`_extra.json`)을 마련해 뒀다 — placeholder가 아니라 조건부 실행 경로다(실패 0건이면 건너뜀).
