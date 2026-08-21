/* 수집·정제 리포트 */
(function () {
  'use strict';

  var NANUMTEO = window.NANUMTEO || [];
  var NANUMTEO_META = window.NANUMTEO_META || {};
  var counts = NANUMTEO_META.counts || {};

  var SIDO_ORDER = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- 핵심 지표 타일 ----------
     Task 4가 만든 NANUMTEO_META.counts 는 total(원본 행 수)과
     제외_좌표없음(지오코딩 실패로 뺀 건수)만 갖는다. */
  var sidoSet = {};
  NANUMTEO.forEach(function (f) { sidoSet[f.sido] = true; });
  var sidoCount = Object.keys(sidoSet).length;

  var tiles = [
    { num: NANUMTEO.length, lbl: '지도에 표시된 곳' },
    { num: counts.total != null ? counts.total : NANUMTEO.length, lbl: '원본 전체' },
    { num: counts['제외_좌표없음'] != null ? counts['제외_좌표없음'] : 0, lbl: '제외 (좌표 없음)' },
    { num: sidoCount, lbl: '시도 수' }
  ];
  document.getElementById('statTiles').innerHTML = tiles.map(function (t) {
    return '<div class="stat-tile"><div class="num">' + t.num + '</div><div class="lbl">' + t.lbl + '</div></div>';
  }).join('');

  /* ---------- 지역별 막대 차트 ---------- */
  var bySido = {};
  NANUMTEO.forEach(function (f) {
    (bySido[f.sido] = bySido[f.sido] || []).push(f);
  });
  var entries = SIDO_ORDER
    .filter(function (r) { return bySido[r]; })
    .map(function (r) { return [r, bySido[r].length]; });
  entries.sort(function (a, b) { return b[1] - a[1]; });
  var max = entries.length ? entries[0][1] : 1;
  document.getElementById('regionBars').innerHTML = entries.map(function (e) {
    return (
      '<button class="dbar" data-sido="' + esc(e[0]) + '" title="지도에서 ' + esc(e[0]) + ' 보기">' +
        '<span>' + esc(e[0]) + '</span>' +
        '<span class="track"><span class="fill" style="width:' + (e[1] / max * 100) + '%"></span></span>' +
        '<span class="cnt">' + e[1] + '</span>' +
      '</button>'
    );
  }).join('');

  document.getElementById('regionBars').addEventListener('click', function (e) {
    var dbar = e.target.closest('.dbar');
    if (dbar) {
      location.href = 'index.html?sido=' + encodeURIComponent(dbar.getAttribute('data-sido'));
    }
  });

  /* ---------- 지역별 상세 표 ---------- */
  var tbody = document.querySelector('#reportTable tbody');
  tbody.innerHTML = entries.map(function (e) {
    var r = e[0], list = bySido[r];
    var sigunguSet = {};
    list.forEach(function (f) { if (f.sigungu) sigunguSet[f.sigungu] = true; });
    return (
      '<tr>' +
        '<td>' + esc(r) + '</td>' +
        '<td>' + list.length + '</td>' +
        '<td>' + Object.keys(sigunguSet).length + '</td>' +
      '</tr>'
    );
  }).join('');

  /* ---------- 헤더 ---------- */
  document.getElementById('totalCount').textContent = NANUMTEO.length;
  document.getElementById('surveyDate').textContent = NANUMTEO_META.surveyDate || '';

  // PWA: 서비스 워커 등록 (홈 화면 설치 · 오프라인 지원)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('서비스 워커 등록 실패:', err);
      });
    });
  }
})();
