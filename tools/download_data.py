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
