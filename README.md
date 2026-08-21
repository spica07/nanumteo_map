# 공동육아나눔터 지도 (nanumteo_map)

전국 공동육아나눔터 430곳 중 좌표를 확인한 426곳을 지도에서 찾아보는 PWA. 빌드 도구 없이 정적 파일로 동작한다.

- Leaflet + OpenStreetMap 타일
- 시도 → 시군구 필터, 이름·운영기관·주소 검색
- 공동육아나눔터 제도 안내 모달
- 오프라인 지원(서비스워커), 홈 화면 설치

## 데이터

출처는 「한국건강가정진흥원_전국 공동육아나눔터 기관현황」(공공데이터포털, pk=15055830).
API가 아니라 파일형 데이터라 `tools/download_data.py`가 다운로드 페이지에서
최신 첨부파일ID를 찾아 받는다. 원본에 좌표가 없어 카카오 지오코딩으로 채운다.

## 갱신 절차

```bash
py tools/download_data.py   # CSV 재다운로드 → tools/nanumteo_raw.csv
py tools/geocode.py         # 카카오 지오코딩 (캐시됨) → tools/geocoded.json
py tools/build_data.py      # 정제 → assets/js/data.js
```

`sw.js`의 `CACHE` 버전 숫자를 올려야 이용자에게 새 데이터가 내려간다.

## 규칙

- 독도를 항상 직접 그린다(위도 37.2429 / 경도 131.8664, 경상북도 울릉군 울릉읍 독도리).
- 국기 이모지를 포함해 이모지를 쓰지 않는다.
- 파이썬은 `python`이 아니라 `py`로 실행한다.
