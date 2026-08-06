/* ==================================================================
   Humphrey's Courses Played

   golf_courses.json is the single source of truth. Nothing about a
   course — its par, its hole count, its score, its coordinates — is
   patched at runtime; if a value is wrong, fix it in the JSON.
================================================================== */

/* ---------- Configuration ---------- */

const DATA_URL = 'golf_courses.json';

// Most course coordinates are accurate to the town, not the clubhouse. Past
// about z12 this basemap starts printing golf-course names, which would sit
// next to a flag that is a kilometre off and advertise the error. Capping the
// zoom keeps the map honest: it never claims more precision than the data has.
const MAX_ZOOM      = 11;
const FIT_MAX_ZOOM  = 6;
const FIT_PADDING   = [36, 36];

// Esri World Topographic: place names are in English worldwide, where CARTO
// and OSM both render them in the local language and script.
const TILE_URL  = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
const TILE_ATTR = 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, DeLorme, NAVTEQ, TomTom, USGS';

// The home nations get their own flag, the way an Open leaderboard does it.
const HOME_NATIONS = ['England', 'Scotland', 'Wales', 'Northern Ireland'];
const COUNTRY_META = {
  'USA':              {flag:'\u{1F1FA}\u{1F1F8}', code:'USA'},
  'England':          {flag:'\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}', code:'ENG'},
  'Scotland':         {flag:'\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}', code:'SCO'},
  'Wales':            {flag:'\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}', code:'WAL'},
  'Northern Ireland': {flag:'\u{1F1EC}\u{1F1E7}', code:'NIR'},
  'UK':               {flag:'\u{1F1EC}\u{1F1E7}', code:'GBR'},
  'Ireland':          {flag:'\u{1F1EE}\u{1F1EA}', code:'IRL'},
  'South Africa':     {flag:'\u{1F1FF}\u{1F1E6}', code:'RSA'},
  'Singapore':        {flag:'\u{1F1F8}\u{1F1EC}', code:'SGP'},
  'UAE':              {flag:'\u{1F1E6}\u{1F1EA}', code:'UAE'},
  'Barbados':         {flag:'\u{1F1E7}\u{1F1E7}', code:'BAR'},
  'Cyprus':           {flag:'\u{1F1E8}\u{1F1FE}', code:'CYP'},
  'Greece':           {flag:'\u{1F1EC}\u{1F1F7}', code:'GRE'},
  'Spain':            {flag:'\u{1F1EA}\u{1F1F8}', code:'ESP'},
};
const FALLBACK_META  = {flag:'\u{1F3F3}', code:'---'};
// tokens naming a country rather than a place — stripped from "Location"
const COUNTRY_TOKENS = new Set([...Object.keys(COUNTRY_META), 'United States']);

const PARTNERS = [
  {key:'played_with_dad',       label:'Dad'},
  {key:'played_with_max',       label:'Max'},
  {key:'played_with_alexander', label:'Alexander'},
];

const FILTERS = [
  {id:'all',       label:'All',            match:() => true},
  {id:'scored',    label:'Scored',         match:c => c.best_score != null},
  ...PARTNERS.map(p => ({id:p.key, label:'With ' + p.label, match:c => !!c[p.key]})),
];

const DASH = '<span class="none">&ndash;</span>';

// One definition per column, driving both the header and the cells. Adding the
// ratings column later means one entry here and nothing else.
const COLUMNS = [
  {label:'#',           cls:'pos',    cell:(d, i) => String(i + 1)},
  {label:'Country',     cls:'ctry',   sort:'country',
   cell:d => `<span class="fl">${d.flag}</span><span class="code">${d.code}</span>`,
   title:d => d.country},
  {label:'Course',      cls:'course', sort:'name',   cell:d => esc(d.name)},
  {label:'Location',    cls:'loc',    sort:'region', cell:d => esc(d.region)},
  {label:'Played',      cls:'year',   sort:'first_played',
   cell:d => d.first_played
     ? d.first_played + (d.date_estimated ? '<span class="est">est.</span>' : '')
     : '<span class="est">unknown</span>'},
  {label:'Played With', cls:'with',   cell:partnersHTML},
  {label:'Par',         cls:'par',    sort:'par',        align:'right',
   cell:d => d.par == null ? DASH : d.par},
  {label:'Best',        cls:'score',  sort:'best_score', align:'right',
   cell:d => d.best_score == null ? DASH : d.best_score},
  {label:'Rating',      cls:'rating', sort:'rating',     align:'center',
   cell:d => ratingHTML(d.rating), title:d => d.rating == null ? null : `${d.rating} / 5`},
];

// A nine-hole 27 must never sit above an eighteen-hole 73, so they are ranked
// on separate boards rather than flagged within one.
const BOARDS = [
  {holes:18, title:'Eighteen‑hole courses', note:''},
  {holes:9,  title:'Nine‑hole courses',
   note:' · scores are over nine holes, so they are kept off the eighteen‑hole board.'},
];

/* ---------- Helpers ---------- */

const esc = s => String(s).replace(/[&<>"]/g, ch =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'})[ch]);

function partnersHTML(c){
  return PARTNERS.filter(p => c[p.key])
    .map(p => `<span class="tag person">${p.label}</span>`).join('');
}

// 5 balls, half-steps allowed: full for whole points, one half ball for a
// .5, the rest left hollow. Ratings are a personal judgment call, so an
// unrated course gets the same dash as an unrecorded par/score, not a row
// of empty balls implying "rated zero".
function ratingHTML(r){
  if (r == null) return DASH;
  const full = Math.floor(r);
  const half = r % 1 !== 0;
  const balls = Array.from({length:5}, (_, i) => {
    const cls = i < full ? 'full' : (i === full && half ? 'half' : 'empty');
    return `<span class="gball ${cls}"></span>`;
  }).join('');
  return `<span class="gballs">${balls}</span>`;
}

// derived presentation fields; everything factual already comes from the JSON
function decorate(c){
  const parts = c.location.split(',').map(s => s.trim()).filter(Boolean);
  const meta  = COUNTRY_META[c.country] || FALLBACK_META;
  c.flag = meta.flag;
  c.code = meta.code;
  const kept = parts.filter(p => !COUNTRY_TOKENS.has(p));
  c.region = kept.length ? kept.join(', ') : parts[parts.length - 1];
  return c;
}

/* ---------- Boot ---------- */

d3.json(DATA_URL)
  .then(courses => init(courses.map(decorate)))
  .catch(err => {
    console.error(err);
    d3.select('#load-error').style('display', 'block')
      .text(`Could not load ${DATA_URL} — ${err.message}`);
  });


function init(COURSES){

  /* ---------- Header stats ---------- */
  const scored   = COURSES.filter(c => c.best_score != null);
  const scores18 = COURSES.filter(c => c.holes === 18 && c.best_score != null)
                          .map(c => c.best_score);

  const stats = [
    {num: COURSES.length,                                 label:'Courses Played'},
    {num: new Set(COURSES.map(c => c.sovereign)).size,    label:'Countries'},
    {num: COURSES.filter(c => c.played_with_dad).length,  label:'With Dad'},
    {num: scores18.length ? Math.min(...scores18) : '—',  label:'Best Round (18)'},
  ];
  d3.select('#stats-strip').selectAll('.stat').data(stats).enter()
    .append('div').attr('class','stat')
    .html(d => `<span class="num">${d.num}</span><span class="label">${d.label}</span>`);

  // NB courses played, not rounds — the data has one row per course and no
  // per-round counts, so a country total is "distinct courses there".
  const byCountry = Array.from(
    d3.group(COURSES, c => c.country),
    ([country, list]) => ({country, n:list.length, flag:list[0].flag})
  ).sort((a,b) => b.n - a.n || a.country.localeCompare(b.country));

  d3.select('#country-strip').selectAll('.cstat').data(byCountry).enter()
    .append('div').attr('class','cstat')
    .html(d => `<span class="fl">${d.flag}</span><span class="n">${d.n}</span>` +
               `<span class="nm">${esc(d.country)}</span>`);

  d3.select('#foot-note')
    .text(`${scored.length} of ${COURSES.length} courses have a recorded best score.`);

  /* ---------- Leaderboards ---------- */
  const state = {sortKey:null, sortDir:1, filter:'all', search:'', active:null};

  // filter buttons
  d3.select('#filters').selectAll('button').data(FILTERS).enter()
    .append('button')
      .attr('class', d => 'filter-btn' + (d.id === state.filter ? ' active' : ''))
      .text(d => d.label)
      .on('click', (event, d) => {
        state.filter = d.id;
        d3.selectAll('#filters button').classed('active', x => x.id === d.id);
        renderBoards();
      });

  // both boards are built from the same COLUMNS definition
  const boards = d3.select('#boards').selectAll('section.board-block')
    .data(BOARDS).enter().append('section').attr('class','board-block');

  boards.append('h3').attr('class','board-title').html(d => d.title);
  const wrap  = boards.append('div').attr('class','board');
  const table = wrap.append('div').attr('class','board-scroll')
                    .append('table').attr('class','board-table');

  table.append('thead').append('tr').selectAll('th')
    .data(COLUMNS).enter().append('th')
      .attr('class', d => d.sort ? null : 'nosort')
      .style('text-align', d => d.align || null)
      .html(d => esc(d.label) + (d.sort ? '<span class="arrow">&#9650;</span>' : ''))
      .on('click', (event, d) => { if (d.sort) setSort(d.sort); });

  table.append('tbody').attr('class', d => `body-${d.holes}`);
  wrap.append('div').attr('class','board-foot')
      .html(d => `<span class="count-${d.holes}"></span>${d.note}`);

  const totals = new Map(BOARDS.map(b =>
    [b.holes, COURSES.filter(c => c.holes === b.holes).length]));

  function matches(c){
    const f = FILTERS.find(x => x.id === state.filter);
    if (f && !f.match(c)) return false;
    const q = state.search.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q)
              || c.location.toLowerCase().includes(q)
              || c.code.toLowerCase().includes(q);
  }

  function comparator(a, b){
    const byName = a.name.localeCompare(b.name);
    const k = state.sortKey;
    if (!k) return byName;
    const av = a[k], bv = b[k];
    if (typeof av === 'string' || typeof bv === 'string')
      return state.sortDir * String(av).localeCompare(String(bv)) || byName;
    if (av == null && bv == null) return byName;
    if (av == null) return 1;             // unknowns last, in either direction
    if (bv == null) return -1;
    return state.sortDir * (av - bv) || byName;
  }

  function renderBoards(){
    const data = COURSES.filter(matches).sort(comparator);
    BOARDS.forEach(b => renderBoard(b, data.filter(c => c.holes === b.holes)));
  }

  function renderBoard(board, data){
    const total = totals.get(board.holes);
    d3.select(`.count-${board.holes}`).text(
      data.length === total
        ? `${total} ${total === 1 ? 'course' : 'courses'}`
        : `${data.length} of ${total} courses`);

    const tbody = d3.select(`.body-${board.holes}`);
    tbody.selectAll('tr').remove();

    if (!data.length){
      tbody.append('tr').attr('class','empty-row')
        .append('td').attr('colspan', COLUMNS.length)
        .text('No courses match that filter.');
      return;
    }

    tbody.selectAll('tr').data(data).enter().append('tr')
      .classed('active', d => d.name === state.active)
      .on('click', (event, d) => selectCourse(d))
      .selectAll('td')
      .data((d, i) => COLUMNS.map(col => ({col, d, i})))
      .enter().append('td')
        .attr('class', x => x.col.cls)
        .attr('title', x => x.col.title ? x.col.title(x.d) : null)
        .html(x => x.col.cell(x.d, x.i));
  }

  function setSort(key){
    if (state.sortKey === key) state.sortDir = -state.sortDir;
    else { state.sortKey = key; state.sortDir = (key === 'first_played') ? -1 : 1; }
    d3.selectAll('.board-table thead th')
      .classed('sorted', d => d.sort === state.sortKey)
      .select('.arrow').html(state.sortDir === 1 ? '&#9650;' : '&#9660;');
    renderBoards();
  }

  d3.select('#course-search').on('input', function(){
    state.search = this.value;
    renderBoards();
  });

  /* ---------- Map ---------- */
  // One marker per CLUB, not per coordinate: grouping by coordinate collapsed
  // every club sharing a town-centre position into a single pin. A club's own
  // courses still share one flag, which is the case that should cluster.
  const sites = Array.from(
    d3.group(COURSES.filter(c => c.lat != null && c.lon != null), c => c.club),
    ([key, list]) => ({
      key,
      club:  key,
      lat:   list[0].lat,
      lon:   list[0].lon,
      place: list[0].location,
      flag:  list[0].flag,
      courses: list.slice().sort((a,b) => a.name.localeCompare(b.name)),
    })
  );

  const map = L.map('map', {
    maxZoom: MAX_ZOOM,
    zoomControl: false,            // we render our own buttons
    worldCopyJump: true,
  });
  L.tileLayer(TILE_URL, {maxZoom: MAX_ZOOM, attribution: TILE_ATTR}).addTo(map);

  const flagSVG = count => `
    <svg width="26" height="30" viewBox="-13 -22 26 30" aria-hidden="true">
      <circle class="halo" cx="0" cy="-9" r="9"/>
      <line class="pole" x1="0" y1="0" x2="0" y2="-13"/>
      <path class="cloth" d="M0,-13 L8,-9.7 L0,-6.4 Z"/>
      <circle class="base" cx="0" cy="0" r="1.8"/>
      ${count > 1 ? `<circle class="count-bg" cx="-6" cy="-11" r="5.4"/>
                     <text class="count" x="-6" y="-9">${count}</text>` : ''}
    </svg>`;

  const markers = new Map();
  const bounds  = L.latLngBounds([]);

  sites.forEach(site => {
    const marker = L.marker([site.lat, site.lon], {
      icon: L.divIcon({
        className:'pin-icon',
        html: flagSVG(site.courses.length),
        iconSize:[26, 30],
        iconAnchor:[13, 30],       // the flag's base sits on the coordinate
      }),
      title: site.club,
      riseOnHover: true,
    }).addTo(map);

    marker.bindTooltip(
      `<strong>${esc(site.club)}</strong><br>${site.flag} ${esc(site.place)}` +
      (site.courses.length > 1 ? `<br>${site.courses.length} courses` : ''),
      {direction:'top', offset:[0, -26], className:'map-tip'});

    marker.on('click', () => {
      selectSite(site);
      map.flyTo([site.lat, site.lon], MAX_ZOOM, {duration:.6});
    });

    markers.set(site.key, marker);
    bounds.extend([site.lat, site.lon]);
  });

  function highlight(key){
    markers.forEach((m, k) => {
      const el = m.getElement();
      if (el) el.classList.toggle('selected', k === key);
    });
  }

  /* ---------- Detail panel ---------- */
  function openDetail(site){
    d3.select('#detail-place').text(site.club);
    d3.select('#detail-count').text(
      (site.courses.length === 1 ? '1 course' : `${site.courses.length} courses`)
      + ' · ' + site.place);

    const items = d3.select('#detail-body').html('')
      .selectAll('div.detail-item').data(site.courses).enter()
      .append('div').attr('class','detail-item');

    items.append('div').attr('class','dn').text(d => d.name);
    items.append('div').attr('class','detail-meta').html(d => {
      const tags = PARTNERS.filter(p => d[p.key])
        .map(p => `<span class="tag person">w/ ${p.label}</span>`);
      if (d.first_played)
        tags.push(`<span class="tag year">${d.first_played}` +
                  `${d.date_estimated ? ' est.' : ''}</span>`);
      if (d.best_score != null)
        tags.push(`<span class="tag score">Score: ${d.best_score}</span>`);
      return tags.join('');
    });

    d3.select('#detail').classed('open', true);
  }

  function closeDetail(){
    d3.select('#detail').classed('open', false);
    highlight(null);
    state.active = null;
    renderBoards();
  }

  function selectSite(site){
    state.active = site.courses.length === 1 ? site.courses[0].name : null;
    renderBoards();
    highlight(site.key);
    openDetail(site);
  }

  // clicking a leaderboard row finds that course on the map
  function selectCourse(course){
    state.active = course.name;
    renderBoards();
    const site = sites.find(s => s.courses.some(c => c.name === course.name));
    if (!site) return;
    highlight(site.key);
    openDetail(site);
    map.flyTo([site.lat, site.lon], MAX_ZOOM, {duration:.7});
  }

  d3.select('#detail-close').on('click', closeDetail);
  map.on('click', () => { if (d3.select('#detail').classed('open')) closeDetail(); });

  /* ---------- Map controls ---------- */
  // invalidateSize first: run before the container has been laid out, Leaflet
  // reads a zero size and fitBounds collapses to maximum zoom. animate:false so
  // the result is final immediately, rather than an interpolated view a later
  // call cannot correct.
  // Floor the zoom at "all courses visible" so the world can't be shrunk into
  // a corner. Derived from the container rather than hardcoded, because the
  // zoom that fits the bounds differs between a desktop pane and a phone.
  function updateMinZoom(){
    map.setMinZoom(0);                        // clear the old floor before measuring
    const fitZoom = map.getBoundsZoom(bounds, false, L.point(FIT_PADDING));
    map.setMinZoom(Math.min(fitZoom, FIT_MAX_ZOOM));
  }

  function fitAll(animate){
    map.invalidateSize();
    updateMinZoom();
    map.fitBounds(bounds, {padding:FIT_PADDING, maxZoom:FIT_MAX_ZOOM, animate:!!animate});
  }

  // keep the floor correct when the window changes size, without moving the view
  map.on('resize', updateMinZoom);

  d3.select('#zoom-in').on('click',  () => map.zoomIn());
  d3.select('#zoom-out').on('click', () => map.zoomOut());
  d3.select('#zoom-reset').on('click', () => { closeDetail(); fitAll(true); });

  fitAll();
  requestAnimationFrame(() => fitAll());          // once layout has settled
  window.addEventListener('load', () => fitAll(), {once:true});

  /* ---------- Go ---------- */
  setSort('best_score');
}
