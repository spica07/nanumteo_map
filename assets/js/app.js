/* 전국 공동육아나눔터 지도 — 앱 로직 */
(function () {
  'use strict';

  var NANUMTEO = window.NANUMTEO || [];
  var NANUMTEO_META = window.NANUMTEO_META || {};
  var NANUMTEO_SIDOS = window.NANUMTEO_SIDOS || [];

  /* 마커 색은 디자인 시스템이 소유한다. 유형 필터가 없으므로(스펙 5절)
     모든 마커를 단일 색으로 그린다. */
  var ROOT_STYLE = getComputedStyle(document.documentElement);
  function cssVar(name, fallback) {
    return (ROOT_STYLE.getPropertyValue(name) || '').trim() || fallback;
  }
  var MARKER_COLOR = cssVar('--sign', '#6E3B1F');

  /* 지리 순서로 정렬한 고정 목록이 기본이다. 다만 실제 데이터(NANUMTEO_SIDOS,
     build_data.py 가 원본에서 뽑은 시도 집합)에 이 목록에 없는 값이 있으면
     — 예: 광주+전남 시도 통합처럼 새 시도명이 생기는 경우 — 조용히 빠지지
     않도록 목록 끝에 이어 붙인다. */
  var SIDO_ORDER = (function () {
    var base = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
      '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
    var unknown = NANUMTEO_SIDOS.filter(function (s) { return base.indexOf(s) === -1; });
    return base.concat(unknown);
  })();
  var SIDO_VIEW = {
    '': { center: [36.30, 127.80], zoom: 7 },
    '서울': { center: [37.5642, 126.99], zoom: 11 },
    '경기': { center: [37.42, 127.18], zoom: 9 },
    '인천': { center: [37.46, 126.64], zoom: 11 },
    '부산': { center: [35.17, 129.06], zoom: 11 },
    '대구': { center: [35.85, 128.57], zoom: 11 },
    '광주': { center: [35.15, 126.87], zoom: 12 },
    '대전': { center: [36.34, 127.39], zoom: 12 },
    '울산': { center: [35.55, 129.31], zoom: 11 },
    '제주': { center: [33.38, 126.55], zoom: 10 },
    '세종': { center: [36.55, 127.27], zoom: 11 },
    '강원': { center: [37.75, 128.30], zoom: 8 },
    '충북': { center: [36.75, 127.75], zoom: 9 },
    '충남': { center: [36.50, 126.85], zoom: 9 },
    '전북': { center: [35.75, 127.15], zoom: 9 },
    '전남': { center: [34.85, 126.95], zoom: 9 },
    '경북': { center: [36.35, 128.90], zoom: 8 },
    '경남': { center: [35.25, 128.25], zoom: 9 }
  };

  var state = {
    q: '',
    sido: '',
    district: '',   // "시도|시군구" 복합 키
    favOnly: false,
    view: 'list'
  };

  var favorites = loadFavorites();

  function loadFavorites() {
    try {
      return new Set(JSON.parse(localStorage.getItem('ntm_favorites') || '[]'));
    } catch (e) { return new Set(); }
  }
  function saveFavorites() {
    localStorage.setItem('ntm_favorites', JSON.stringify(Array.from(favorites)));
  }

  // 마지막으로 사용한 지역·빠른필터 버튼 상태를 이 기기에 기억한다
  function loadLastFilters() {
    try {
      return JSON.parse(localStorage.getItem('ntm_lastFilters')) || null;
    } catch (e) { return null; }
  }
  function saveLastFilters() {
    try {
      var toggles = {};
      document.querySelectorAll('[data-toggle]').forEach(function (btn) {
        toggles[btn.getAttribute('data-toggle')] = !!state[btn.getAttribute('data-toggle')];
      });
      toggles.district = state.district;
      localStorage.setItem('ntm_lastFilters', JSON.stringify(toggles));
    } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var HEART_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M12 20.4 4.3 12.8a4.8 4.8 0 0 1 6.8-6.8l.9.9.9-.9a4.8 4.8 0 1 1 6.8 6.8z"/></svg>';

  function districtKey(f) { return f.sido + '|' + f.sigungu; }

  /* ---------- 필터링 ---------- */
  function matches(f) {
    if (state.sido && f.sido !== state.sido) return false;
    if (state.district && districtKey(f) !== state.district) return false;
    if (state.favOnly && !favorites.has(f.id)) return false;
    if (state.q) {
      var q = state.q.toLowerCase();
      var hay = [f.org, f.address, f.sigungu, f.sido].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  /* ---------- 지도 ---------- */
  var map = L.map('map', { zoomControl: true, renderer: L.canvas() })
    .setView(SIDO_VIEW[''].center, SIDO_VIEW[''].zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  /* ---------- 독도 ---------- */
  // 배경 지도 표기는 축척·언어에 따라 달라지거나 빠질 수 있다.
  // 우리 지도에서는 독도를 항상 같은 자리에 직접 그린다. (독도 표시)
  // 행정구역: 경상북도 울릉군 울릉읍 독도리
  (function markDokdo() {
    var dokdo = L.circleMarker([37.2429, 131.8664], {
      radius: 5,
      color: '#2f2e2b',
      weight: 1.6,
      fillColor: '#ffffff',
      fillOpacity: 1
    }).addTo(map);
    dokdo.bindTooltip('독도', {
      permanent: true,
      direction: 'right',
      offset: [6, 0],
      className: 'dokdo-label'
    });
    dokdo.bindPopup('<b>독도</b><br>경상북도 울릉군 울릉읍 독도리');
  })();
  var markerLayer = L.layerGroup().addTo(map);
  var markersById = {};

  function renderMarkers(list) {
    markerLayer.clearLayers();
    markersById = {};
    list.forEach(function (f) {
      var marker = L.circleMarker([f.lat, f.lng], {
        radius: 8,
        fillColor: MARKER_COLOR,
        color: '#ffffff',
        weight: 2,
        fillOpacity: 0.9
      });
      var popupHtml =
        '<div class="popup-name">' + esc(f.org) + '</div>' +
        '<div class="popup-meta">' + esc(f.sido) + ' ' + esc(f.sigungu) + '</div>' +
        '<button class="popup-btn" data-popup-detail="' + f.id + '">자세히 보기</button>';
      marker.bindPopup(popupHtml);
      marker.addTo(markerLayer);
      markersById[f.id] = marker;
    });
  }

  /* ---------- 카드에서 지도 위치로 이동 ---------- */
  function locateOnMap(id) {
    var f = NANUMTEO.find(function (x) { return x.id === id; });
    if (!f) return;
    if (window.innerWidth <= 900 && state.view !== 'map') {
      state.view = 'map';
      document.querySelectorAll('#viewToggle .pill').forEach(function (p) {
        p.classList.toggle('active', p.getAttribute('data-view') === 'map');
      });
      var grid = document.querySelector('.content-grid');
      grid.classList.remove('view-list');
      grid.classList.add('view-map');
      setTimeout(function () { map.invalidateSize(); }, 50);
    }
    map.flyTo([f.lat, f.lng], 15, { duration: 0.8 });
    var marker = markersById[f.id];
    if (marker) map.once('moveend', function () { marker.openPopup(); });
  }

  /* ---------- 카드 ---------- */
  function cardHtml(f) {
    var fav = favorites.has(f.id);
    var tags = [
      nearby.tag(f),
      '<span class="tag district">' + esc(f.sido) + (f.sigungu ? ' ' + esc(f.sigungu) : '') + '</span>'
    ];
    return (
      '<article class="facility-card" data-id="' + f.id + '">' +
        '<div class="card-body">' +
          '<div class="card-title-row">' +
            '<h3 class="card-name">' + esc(f.org) + '</h3>' +
            '<button class="fav-btn' + (fav ? ' on' : '') + '" data-fav="' + f.id + '"' +
              ' aria-label="찜" aria-pressed="' + fav + '">' + HEART_ICON + '</button>' +
          '</div>' +
          '<div class="card-tags">' + tags.join('') + '</div>' +
          '<div class="card-info">' + esc(f.address) + '</div>' +
          '<button class="card-locate" data-locate="' + f.id + '">위치보기</button>' +
        '</div>' +
      '</article>'
    );
  }

  function renderCards(list) {
    var grid = document.getElementById('cardGrid');
    grid.innerHTML = list.map(cardHtml).join('');
    document.getElementById('emptyState').hidden = list.length > 0;
  }

  /* ---------- 모달 공통 ---------- */
  function openModal(html) {
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('modalOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    document.getElementById('modalOverlay').hidden = true;
    document.body.style.overflow = '';
  }

  /* ---------- 상세 모달 ---------- */
  function detailRow(k, v) {
    if (!v) return '';
    return '<div class="detail-item"><span class="k">' + k + '</span><span class="v">' + esc(v) + '</span></div>';
  }

  /* 전화번호는 "NN-NNN-NNNN(내선)", "NNN-NNN-NNNN~N" 같은 형태가 섞여 있다.
     tel: 링크는 괄호(내선)나 물결(~) 뒤를 잘라 숫자만 남기고, 화면에는
     원문 그대로를 보여준다. */
  function phoneRow(phone) {
    if (!phone) return '';
    var digits = phone.split(/[(~]/)[0].replace(/[^0-9]/g, '');
    var v = digits
      ? '<a class="tel-link" href="tel:' + digits + '">' + esc(phone) + '</a>'
      : esc(phone);
    return '<div class="detail-item"><span class="k">전화</span><span class="v">' + v + '</span></div>';
  }

  window.openFacilityModal = function (id) {
    var f = NANUMTEO.find(function (x) { return x.id === id; });
    if (!f) return;
    var fav = favorites.has(f.id);
    var naverUrl = 'https://map.naver.com/p/search/' +
      encodeURIComponent(f.sido + ' ' + f.sigungu + ' ' + f.org);
    openModal(
      '<h2 class="modal-title">' + esc(f.org) + '</h2>' +
      '<div class="modal-tags">' +
        '<span class="tag district">' + esc(f.sido) + (f.sigungu ? ' ' + esc(f.sigungu) : '') + '</span>' +
      '</div>' +
      '<div class="detail-list">' +
        detailRow('내 위치에서', nearby.text(f)) +
        detailRow('시도', f.sido) +
        detailRow('시군구', f.sigungu) +
        detailRow('주소', f.address) +
        detailRow('운영기관', f.org) +
        phoneRow(f.phone) +
      '</div>' +
      '<p class="notice">운영시간과 이용 방법은 운영기관에 직접 문의하세요.</p>' +
      '<div class="modal-links">' +
        '<a class="link-btn map" href="' + naverUrl + '" target="_blank" rel="noopener">네이버 길찾기</a>' +
        '<button class="link-btn fav" data-fav="' + f.id + '">' + (fav ? '찜 해제' : '찜하기') + '</button>' +
      '</div>'
    );
  };

  /* ---------- 공동육아나눔터 제도 안내 모달 (신규) ----------
     장소마다 다른 내용이 아니라 제도가 전국 공통이므로 고정 텍스트로 둔다.
     상세 모달과 같은 #modalOverlay/#modalBody/closeModal() 을 그대로 쓴다. */
  var ABOUT_HTML =
    '<h2 class="modal-title">공동육아나눔터란</h2>' +
    '<p>영유아와 초등 저학년을 대상으로 안전한 돌봄 공간을 제공하는 곳이에요. ' +
    '부모 그룹이 자율적으로 교대 돌봄(1회 2~4시간)을 하는 품앗이 공동육아를 ' +
    '센터가 매칭하고 살펴봐요.</p>' +
    '<p>발달단계별 놀이·체험 프로그램, 명절·생태 체험 같은 활동도 함께 운영해요.</p>';

  document.getElementById('aboutBtn').addEventListener('click', function () {
    openModal(ABOUT_HTML);
  });

  /* ---------- 렌더 파이프라인 ---------- */
  function render() {
    var list = nearby.sort(NANUMTEO.filter(matches));
    renderMarkers(list);
    renderCards(list);
    document.getElementById('resultCount').textContent = nearby.active()
      ? '가까운 ' + list.length + '곳'
      : '총 ' + list.length + '곳' + (list.length < NANUMTEO.length ? ' (전체 ' + NANUMTEO.length + '곳 중)' : '');
  }

  /* ---------- 내 주변 ----------
     권한 요청·거리 계산·내 위치 마커는 geo.js 가 맡는다. 이 앱이 알려줄 것은
     좌표를 꺼내는 법과, 지역 필터를 어떻게 푸는지뿐이다.

     unitLabel 은 "나눔터"가 아니라 "나눔터 시설"로 둔다 — geo.js 의 안내
     문구는 항상 "<unitLabel>이 없어요" 형태로 조립되는데, "나눔터"는 받침
     없이 끝나 "나눔터이 없어요"가 되어 버린다("천문대이 없어요"와 같은
     함정, observatory_map 은 "천문 시설"로 피했다). "시설"은 받침(ㄹ)으로
     끝나 문법이 맞는다. */

  /* 지역 필터만 조용히 푼다 — setSido/setDistrict 는 지도를 날리고 render
     까지 부르므로 켜는 길목에서 쓰면 화면이 두 번 튄다. */
  function clearSido() {
    state.sido = '';
    state.district = '';
    document.getElementById('districtSelect').value = '';
    document.querySelectorAll('#sidoFilters .pill').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-sido') === '');
    });
  }

  var nearby = window.createNearby({
    map: map,
    button: document.getElementById('nearbyBtn'),
    label: document.getElementById('nearbyLabel'),
    notice: document.getElementById('nearbyNotice'),
    unitLabel: '나눔터 시설',
    latLngOf: function (r) { return [r.lat, r.lng]; },
    onClear: clearSido,
    onChange: render
  });

  /* ---------- 초기 UI 구성 ---------- */
  function buildFilterPills() {
    var sidoRow = document.getElementById('sidoFilters');
    var present = {};
    NANUMTEO.forEach(function (f) { present[f.sido] = true; });
    var pills = ['<button class="pill active" data-sido="">전체</button>'];
    SIDO_ORDER.forEach(function (r) {
      if (present[r]) pills.push('<button class="pill" data-sido="' + r + '">' + r + '</button>');
    });
    sidoRow.insertAdjacentHTML('beforeend', pills.join(''));
  }

  function buildDistrictSelect() {
    var sel = document.getElementById('districtSelect');
    var bySido = {};
    NANUMTEO.forEach(function (f) {
      if (!f.sigungu) return;
      if (!bySido[f.sido]) bySido[f.sido] = {};
      bySido[f.sido][f.sigungu] = (bySido[f.sido][f.sigungu] || 0) + 1;
    });
    SIDO_ORDER.forEach(function (r) {
      if (!bySido[r]) return;
      var group = document.createElement('optgroup');
      group.label = r;
      Object.keys(bySido[r]).sort(function (a, b) { return a.localeCompare(b, 'ko'); })
        .forEach(function (d) {
          var opt = document.createElement('option');
          opt.value = r + '|' + d;
          opt.textContent = r + ' ' + d + ' (' + bySido[r][d] + ')';
          group.appendChild(opt);
        });
      sel.appendChild(group);
    });
  }

  /* ---------- 이벤트 ---------- */
  function setDistrict(key) {
    nearby.off();
    state.district = key;
    document.getElementById('districtSelect').value = key;
    if (key) {
      var parts = key.split('|');
      var sub = NANUMTEO.filter(function (f) { return f.sido === parts[0] && f.sigungu === parts[1]; });
      if (sub.length) {
        var lat = sub.reduce(function (s, f) { return s + f.lat; }, 0) / sub.length;
        var lng = sub.reduce(function (s, f) { return s + f.lng; }, 0) / sub.length;
        map.flyTo([lat, lng], 12, { duration: 0.8 });
      }
    } else {
      var v = SIDO_VIEW[state.sido] || SIDO_VIEW[''];
      map.flyTo(v.center, v.zoom, { duration: 0.8 });
    }
    saveLastFilters();
    render();
  }

  function setSido(r) {
    nearby.off();   /* 지역을 고르는 건 내 주변을 그만두겠다는 뜻이다 */
    state.sido = r;
    // 다른 지역의 시군구가 선택돼 있으면 해제
    if (state.district && r && state.district.split('|')[0] !== r) {
      state.district = '';
      document.getElementById('districtSelect').value = '';
    }
    document.querySelectorAll('#sidoFilters .pill').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-sido') === r);
    });
    if (!state.district) {
      var v = SIDO_VIEW[r] || SIDO_VIEW[''];
      map.flyTo(v.center, v.zoom, { duration: 0.8 });
    }
    render();
  }

  var searchTimer = null;
  document.getElementById('searchInput').addEventListener('input', function (e) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.q = e.target.value.trim();
      render();
    }, 200);
  });

  document.getElementById('districtSelect').addEventListener('change', function (e) {
    setDistrict(e.target.value);
  });

  var filterToggleBtn = document.getElementById('filterToggleBtn');
  var filterGroups = document.getElementById('filterGroups');
  filterToggleBtn.addEventListener('click', function () {
    var willOpen = filterGroups.hidden;
    filterGroups.hidden = !willOpen;
    var label = willOpen ? '필터 닫기' : '필터 열기';
    filterToggleBtn.title = label;
    filterToggleBtn.setAttribute('aria-label', label);
    filterToggleBtn.setAttribute('aria-expanded', String(willOpen));
  });

  document.addEventListener('click', function (e) {
    var t = e.target;

    var favBtn = t.closest('[data-fav]');
    if (favBtn) {
      e.stopPropagation();
      var id = Number(favBtn.getAttribute('data-fav'));
      if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
      saveFavorites();
      render();
      if (!document.getElementById('modalOverlay').hidden) window.openFacilityModal(id);
      return;
    }

    var locateBtn = t.closest('[data-locate]');
    if (locateBtn) {
      e.stopPropagation();
      locateOnMap(Number(locateBtn.getAttribute('data-locate')));
      return;
    }

    var popupBtn = t.closest('[data-popup-detail]');
    if (popupBtn) {
      window.openFacilityModal(Number(popupBtn.getAttribute('data-popup-detail')));
      return;
    }

    var sidoPill = t.closest('[data-sido]');
    if (sidoPill) {
      setSido(sidoPill.getAttribute('data-sido'));
      return;
    }

    var togglePill = t.closest('[data-toggle]');
    if (togglePill) {
      var key = togglePill.getAttribute('data-toggle');
      state[key] = !state[key];
      document.querySelectorAll('[data-toggle="' + key + '"]').forEach(function (p) {
        p.classList.toggle('active', state[key]);
      });
      saveLastFilters();
      render();
      return;
    }

    var viewBtn = t.closest('[data-view]');
    if (viewBtn) {
      state.view = viewBtn.getAttribute('data-view');
      document.querySelectorAll('#viewToggle .pill').forEach(function (p) {
        p.classList.toggle('active', p === viewBtn);
      });
      var grid = document.querySelector('.content-grid');
      grid.classList.remove('view-map', 'view-list');
      grid.classList.add('view-' + state.view);
      if (state.view === 'map') setTimeout(function () { map.invalidateSize(); }, 50);
      return;
    }

    var card = t.closest('.facility-card');
    if (card) {
      window.openFacilityModal(Number(card.getAttribute('data-id')));
      return;
    }

    if (t.id === 'modalClose' || t.id === 'modalOverlay') closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  document.getElementById('resetBtn').addEventListener('click', function () {
    state.q = ''; state.sido = '';
    state.favOnly = false;
    document.getElementById('searchInput').value = '';
    // 필터 칩만 훑는다 — .filter-bar 전체를 훑으면 같은 패널에 있는
    // 지도/목록 전환 버튼까지 active 가 벗겨진다
    document.querySelectorAll('.filter-groups .pill').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-sido') === '');
    });
    document.querySelectorAll('[data-toggle]').forEach(function (p) { p.classList.remove('active'); });
    setDistrict('');
  });

  /* ---------- 시작 ---------- */
  document.getElementById('surveyDate').textContent = NANUMTEO_META.surveyDate || '';
  document.getElementById('totalCount').textContent = NANUMTEO.length;
  buildFilterPills();
  buildDistrictSelect();
  // 모바일 기본은 목록 뷰
  if (window.innerWidth <= 900) {
    document.querySelector('.content-grid').classList.add('view-list');
  }
  // 리포트 등에서 ?district=시도|시군구 또는 ?sido=시도 로 진입한 경우 URL을 우선
  // 적용하고, 그렇지 않으면 이 기기에 마지막으로 저장된 필터를 복원한다
  var params = new URLSearchParams(location.search);
  var paramDistrict = params.get('district');
  var paramSido = params.get('sido');
  if (paramDistrict && paramDistrict.indexOf('|') !== -1) {
    setDistrict(paramDistrict);
  } else if (paramSido && SIDO_VIEW[paramSido]) {
    setSido(paramSido);
  } else {
    var savedFilters = loadLastFilters();
    if (savedFilters) {
      document.querySelectorAll('[data-toggle]').forEach(function (btn) {
        var key = btn.getAttribute('data-toggle');
        if (savedFilters[key]) {
          state[key] = true;
          btn.classList.add('active');
        }
      });
      if (savedFilters.district && savedFilters.district.indexOf('|') !== -1) {
        setDistrict(savedFilters.district);
      } else {
        render();
      }
    } else {
      render();
    }
  }

  // PWA: 서비스 워커 등록 (홈 화면 설치 · 오프라인 지원)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('서비스 워커 등록 실패:', err);
      });
    });
  }
})();
