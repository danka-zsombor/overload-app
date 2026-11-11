(() => {
  const STORAGE_KEY = 'overload-workouts-v2';
  const DRAFT_KEY = 'overload-draft-v2';
  const PAUSED_DRAFT_KEY = 'overload-paused-draft-v2';
  const LEGACY_STORAGE_KEY = 'form-training-journal-v1';
  const LEGACY_DRAFT_KEY = 'form-training-draft-v1';
  const list = document.getElementById('movement-list');
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  let workouts = loadWorkouts();
  let toastTimer;

  const exerciseGroups = [
    { name:'bench press', type:'compound', pattern:'bilateral', aliases:['bench press','bench','flat bench','barbell bench','barbell bench press','bp'] },
    { name:'incline bench press', type:'compound', aliases:['incline bench','incline bench press','incline barbell press'] },
    { name:'dumbbell bench press', type:'compound', pattern:'independent', aliases:['dumbbell bench','db bench','dumbbell bench press'] },
    { name:'squat', type:'compound', aliases:['squat','back squat','barbell squat','high bar squat','low bar squat'] },
    { name:'front squat', type:'compound', aliases:['front squat','barbell front squat'] },
    { name:'deadlift', type:'compound', aliases:['deadlift','conventional deadlift','barbell deadlift'] },
    { name:'romanian deadlift', type:'compound', aliases:['romanian deadlift','rdl','dumbbell rdl'] },
    { name:'overhead press', type:'compound', aliases:['overhead press','ohp','shoulder press','standing press','military press'] },
    { name:'barbell row', type:'compound', aliases:['barbell row','bent over row','bent-over row','bb row'] },
    { name:'pull-up', type:'compound', aliases:['pull up','pull-up','pullups','chin up','chin-up'] },
    { name:'lat pulldown', type:'compound', aliases:['lat pulldown','lat pull down','pulldown'] },
    { name:'leg press', type:'compound', aliases:['leg press','sled press'] },
    { name:'biceps curl', type:'isolation', pattern:'independent', aliases:['biceps curl','bicep curl','curl','dumbbell curl','db curl'] },
    { name:'triceps pushdown', type:'isolation', aliases:['triceps pushdown','tricep pushdown','cable pushdown','rope pushdown'] },
    { name:'lateral raise', type:'isolation', pattern:'independent', aliases:['lateral raise','side raise','dumbbell lateral raise','db lateral raise'] },
    { name:'leg extension', type:'isolation', aliases:['leg extension','quad extension'] },
    { name:'leg curl', type:'isolation', aliases:['leg curl','hamstring curl','lying leg curl','seated leg curl'] },
    { name:'calf raise', type:'isolation', aliases:['calf raise','standing calf raise','seated calf raise'] },
    { name:'chest fly', type:'isolation', aliases:['chest fly','chest flye','dumbbell fly','dumbbell flye','pec deck'] },
    { name:'face pull', type:'isolation', aliases:['face pull','cable face pull'] }
  ];
  const aliasMap = new Map();
  const typeMap = new Map();
  const patternMap = new Map();
  function normalizeExercise(name) {
    return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  }
  exerciseGroups.forEach(group => {
    const canonical = normalizeExercise(group.name);
    typeMap.set(canonical,group.type);
    patternMap.set(canonical, group.pattern || 'bilateral');
    group.aliases.forEach(alias => aliasMap.set(normalizeExercise(alias),canonical));
  });
  function exerciseKey(name) {
    const normalized = normalizeExercise(name);
    return aliasMap.get(normalized) || normalized;
  }
  function inferType(name) { return typeMap.get(exerciseKey(name)) || ''; }
  function inferPattern(name) {
    const key = exerciseKey(name);
    if (patternMap.has(key)) return patternMap.get(key);
    const text = normalizeExercise(name);
    if (/\b(unilateral|one arm|single arm|one leg|single leg|alternating|split squat|bulgarian split|lunge|lunges|step up|step ups)\b/.test(text)) return 'unilateral';
    if (/\b(dumbbell|dumbbells|db)\b/.test(text)) return 'independent';
    return 'bilateral';
  }
  function patternLabel(pattern) {
    return ({ bilateral:'Bilateral', independent:'Independent · per dumbbell', unilateral:'Unilateral · per side' })[pattern] || 'Bilateral';
  }

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function typeCode(type) { return type === 'isolation' ? 1 : 0; }
  function typeFromCode(code) { return Number(code) === 1 ? 'isolation' : 'compound'; }
  function patternCode(pattern) { return pattern === 'unilateral' ? 2 : pattern === 'independent' ? 1 : 0; }
  function patternFromCode(code) { return Number(code) === 2 ? 'unilateral' : Number(code) === 1 ? 'independent' : 'bilateral'; }
  function storedPattern(name) {
    const text = String(name || '').toLowerCase();
    if (/unilateral|one arm|single arm|one leg|single leg|alternating|split squat|lunge|step up/.test(text)) return 'unilateral';
    if (/dumbbell|\bdb\b/.test(text)) return 'independent';
    return 'bilateral';
  }
  function packWorkout(workout) {
    return [workout.id,workout.createdAt,workout.date,workout.name || '',workout.notes || '',workout.durationSeconds == null ? -1 : Number(workout.durationSeconds),
      workout.movements.map(m => [m.name,typeCode(m.type),patternCode(m.pattern || storedPattern(m.name)),
        m.sets.map(s => [Number(s.reps) || 0,Math.round((Number(s.weight) || 0) * 10),s.restSeconds == null ? -1 : Number(s.restSeconds)])])];
  }
  function unpackWorkout(row) {
    if (!Array.isArray(row)) return row;
    const [id,createdAt,date,name,notes,durationSeconds,movements] = row;
    return { id,createdAt,date,name,notes,durationSeconds:Number(durationSeconds) < 0 ? null : Number(durationSeconds),movements:(movements || []).map(m => ({
      name:m[0],type:typeFromCode(m[1]),pattern:patternFromCode(m[2]),
      sets:(m[3] || []).map(s => ({ reps:Number(s[0]) || 0,weight:(Number(s[1]) || 0) / 10,restSeconds:Number(s[2]) < 0 ? null : Number(s[2]) }))
    })) };
  }
  function saveWorkouts() { localStorage.setItem(STORAGE_KEY,JSON.stringify(workouts.map(packWorkout))); }
  function loadWorkouts() {
    const compact = read(STORAGE_KEY,null);
    if (Array.isArray(compact)) return compact.map(unpackWorkout);
    const legacy = read(LEGACY_STORAGE_KEY,[]);
    if (legacy.length) {
      const migrated = legacy.map(workout => ({...workout,movements:workout.movements.map(m => ({...m,pattern:m.pattern || storedPattern(m.name)}))}));
      const compactText = JSON.stringify(migrated.map(packWorkout));
      try { localStorage.setItem(STORAGE_KEY,compactText); }
      catch { localStorage.removeItem(LEGACY_STORAGE_KEY); localStorage.setItem(STORAGE_KEY,compactText); }
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return migrated;
    }
    return [];
  }
  function packDraft(draft) {
    return [draft.name,draft.date,draft.notes,draft.movements.map(m => [m.id,m.name,typeCode(m.type),patternCode(m.pattern),
      m.sets.map(s => [s.reps === '' ? null : Number(s.reps),s.weight === '' ? null : Math.round(Number(s.weight) * 10),s.loggedAt ? Number(s.loggedAt) : null,s.restSeconds === '' ? -1 : Number(s.restSeconds)])])];
  }
  function unpackDraft(row) {
    if (!Array.isArray(row)) return row;
    return {name:row[0] || '',date:row[1] || '',notes:row[2] || '',movements:(row[3] || []).map(m => ({
      id:m[0],name:m[1],type:typeFromCode(m[2]),pattern:patternFromCode(m[3]),
      sets:(m[4] || []).map(s => ({reps:s[0] == null ? '' : String(s[0]),weight:s[1] == null ? '' : String(s[1] / 10),loggedAt:s[2] == null ? '' : String(s[2]),restSeconds:Number(s[3]) < 0 ? '' : String(s[3])}))
    }))};
  }
  function draftHasContent(raw) {
    if (!raw) return false;
    try {
      const draft = unpackDraft(JSON.parse(raw));
      return Boolean(draft.name || draft.notes || (draft.movements || []).some(m => m.name || (m.sets || []).some(s => s.reps !== '' || s.weight !== '')));
    } catch { return false; }
  }
  function prepareFreshShortcut() {
    const existing = localStorage.getItem(DRAFT_KEY) || localStorage.getItem(LEGACY_DRAFT_KEY);
    if (draftHasContent(existing)) localStorage.setItem(PAUSED_DRAFT_KEY,existing);
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(LEGACY_DRAFT_KEY);
  }
  function startFreshWorkoutFromNative() {
    prepareFreshShortcut();
    $('#workout-name').value = '';
    $('#workout-notes').value = '';
    list.innerHTML = '';
    setToday(); updateMovementCount(); updateTimers();
    addMovement();
    updateDraftSwitch();
    showPage('workout');
    showToast('Fresh workout ready.');
  }
  window.overloadStartFreshWorkout = startFreshWorkoutFromNative;
  function updateDraftSwitch() { $('#draft-switch').hidden = !localStorage.getItem(PAUSED_DRAFT_KEY); }
  function todayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function displayDate(date, options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) {
    if (!date) return '';
    return new Intl.DateTimeFormat(undefined, options).format(new Date(`${date}T12:00:00`));
  }
  function newId() { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`; }
  function setToday() { $('#workout-date').value = todayString(); }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function movementMarkup(movement, index) {
    const sets = movement.sets?.length ? movement.sets : [{ reps:'', weight:'' }];
    const movementType = movement.type || inferType(movement.name) || 'compound';
    const pattern = movement.pattern || inferPattern(movement.name);
    return `<article class="movement-card" data-id="${escapeHtml(movement.id)}">
      <div class="movement-top"><span class="movement-index">${String(index+1).padStart(2,'0')}</span><input class="movement-name" type="text" maxlength="60" placeholder="Movement name" aria-label="Movement name" value="${escapeHtml(movement.name)}"><select class="movement-type" aria-label="Movement type"><option value="compound" ${movementType==='compound'?'selected':''}>Compound</option><option value="isolation" ${movementType==='isolation'?'selected':''}>Isolation</option></select><button class="remove-movement" type="button" aria-label="Remove movement" title="Remove movement">×</button></div>
      <div class="movement-meta"><span>STYLE</span><select class="movement-pattern" aria-label="Movement style"><option value="bilateral" ${pattern==='bilateral'?'selected':''}>Bilateral</option><option value="independent" ${pattern==='independent'?'selected':''}>Independent · per dumbbell</option><option value="unilateral" ${pattern==='unilateral'?'selected':''}>Unilateral · per side</option></select><span class="pattern-hint">Auto-matched · change if needed</span></div>
      <div class="set-head"><span>SET</span><span>WEIGHT <span class="unit">(KG)</span></span><span>REPS</span><span></span></div>
      <div class="set-list">${sets.map((set, i) => setMarkup(set,i,movement.name)).join('')}</div>
      <div class="coach-advice" aria-live="polite"></div>
      <button type="button" class="add-set"><span>＋</span> Add set</button>
    </article>`;
  }
  function setMarkup(set, index, movementName = '') {
    return `<div class="set-group" data-logged-at="${escapeHtml(set.loggedAt || '')}" data-rest-seconds="${escapeHtml(set.restSeconds ?? '')}"><div class="set-row"><span class="set-number">${String(index+1).padStart(2,'0')}</span><input class="set-input weight-input" type="number" min="0" step="0.5" inputmode="decimal" placeholder="0" aria-label="Weight in kilograms" value="${escapeHtml(set.weight)}"><input class="set-input reps-input" type="number" min="0" step="1" inputmode="numeric" placeholder="0" aria-label="Repetitions" value="${escapeHtml(set.reps)}"><button class="remove-set" type="button" aria-label="Remove set" title="Remove set">×</button></div><div class="set-comparisons">${comparisonRows(movementName,index)}</div></div>`;
  }
  function currentDraft() {
    return {
      name: $('#workout-name').value,
      date: $('#workout-date').value,
      notes: $('#workout-notes').value,
      movements: $$('.movement-card', list).map(card => ({
        id: card.dataset.id,
        name: $('.movement-name', card).value,
        type: $('.movement-type', card).value,
        pattern: $('.movement-pattern', card).value,
        sets: $$('.set-group', card).map(group => {
          const row = $('.set-row', group);
          return { reps: $('.reps-input', row).value, weight: $('.weight-input', row).value, loggedAt: group.dataset.loggedAt || '', restSeconds: group.dataset.restSeconds || '' };
        })
      }))
    };
  }
  function saveDraft() {
    const compactText = JSON.stringify(packDraft(currentDraft()));
    try { localStorage.setItem(DRAFT_KEY,compactText); }
    catch { localStorage.removeItem(LEGACY_DRAFT_KEY); localStorage.setItem(DRAFT_KEY,compactText); }
  }
  function restoreDraft() {
    const draft = unpackDraft(read(DRAFT_KEY, null) ?? read(LEGACY_DRAFT_KEY, null));
    if (!draft) return;
    $('#workout-name').value = draft.name || '';
    $('#workout-date').value = draft.date || todayString();
    $('#workout-notes').value = draft.notes || '';
    list.innerHTML = (draft.movements || []).map(movementMarkup).join('');
    let prior = 0;
    $$('.set-group', list).forEach(group => {
      const row = $('.set-row', group);
      if ($('.reps-input', row).value && $('.weight-input', row).value !== '' && !group.dataset.loggedAt) {
        group.dataset.loggedAt = String(Date.now() + prior++);
        if (prior > 1) group.dataset.restSeconds = '0';
      }
    });
    saveDraft(); localStorage.removeItem(LEGACY_DRAFT_KEY); updateTimers();
    updateMovementCount();
  }
  function updateMovementCount() { $('#movement-count').textContent = $$('.movement-card', list).length; }
  function reindex() {
    $$('.movement-card', list).forEach((card, i) => {
      $('.movement-index', card).textContent = String(i+1).padStart(2,'0');
      $$('.set-row', card).forEach((row, j) => { $('.set-number', row).textContent = String(j+1).padStart(2,'0'); });
    });
    updateMovementCount();
    $$('.movement-card', list).forEach(refreshComparisons);
  }
  function movementSessions(name) {
    const key = name.trim().toLocaleLowerCase();
    const currentDate = $('#workout-date').value || todayString();
    if (!key) return [];
    return workouts
      .filter(w => w.date <= currentDate && w.movements.some(m => exerciseKey(m.name) === exerciseKey(name)))
      .sort((a,b) => b.date.localeCompare(a.date) || b.createdAt-a.createdAt)
      .map(workout => ({ workout, movement:workout.movements.find(m => exerciseKey(m.name) === exerciseKey(name)) }));
  }
  function comparisonRows(name, setIndex) {
    const sessions = movementSessions(name);
    const last = sessions[0];
    const weekTarget = new Date(`${$('#workout-date').value || todayString()}T12:00:00`);
    weekTarget.setDate(weekTarget.getDate()-7);
    const week = [...sessions].sort((a,b) => Math.abs(new Date(`${a.workout.date}T12:00:00`)-weekTarget)-Math.abs(new Date(`${b.workout.date}T12:00:00`)-weekTarget))[0];
    const row = (label, entry) => {
      const set = entry?.movement.sets[setIndex];
      if (!set) return '';
      return `<div class="comparison-row"><span class="comparison-label">${label}</span><span class="comparison-stat">${escapeHtml(fmt(set.weight))} kg <i>·</i> ${escapeHtml(set.reps)} reps</span></div>`;
    };
    return `${row('LAST TIME',last)}${row('≈ 1 WEEK',week)}`;
  }
  function refreshComparisons(card) {
    const name = $('.movement-name',card).value;
    $$('.set-group',card).forEach((group,index) => { $('.set-comparisons',group).innerHTML = comparisonRows(name,index); });
    renderCoach(card);
  }
    function renderCoach(card) {
    const name = $('.movement-name',card).value.trim();
    const type = $('.movement-type',card).value;
    const pattern = $('.movement-pattern',card).value;
    const { low, high } = type === 'isolation' ? { low:10,high:15 } : { low:6,high:10 };
    const target = $('.coach-advice',card);
    if (!name) { target.innerHTML = ''; return; }

    const previousMovement = movementSessions(name)[0]?.movement;
    const previousSets = previousMovement?.sets || [];
    const bump = type === 'isolation' ? 1 : 2.5;
    const loadChange = pattern === 'independent' ? 'to each dumbbell' : pattern === 'unilateral' ? 'per side' : 'to the total load';
    const unitHint = pattern === 'independent' ? 'per dumbbell' : pattern === 'unilateral' ? 'per side' : 'total load';
    const setGroups = $$('.set-group',$('.set-list',card));
    const setAdvice = setGroups.map((group,index) => {
      const previous = previousSets[index];
      if (!previous) {
        return `<p><strong>SET ${index+1}</strong> No matching set was logged last time. Establish a comfortable ${unitHint} for ${low}–${high} reps.</p>`;
      }

      const reps = Number(previous.reps) || 0;
      const weight = Number(previous.weight) || 0;
      if (reps >= high) {
        return `<p><strong>SET ${index+1}</strong> Last time: ${escapeHtml(fmt(weight))} kg × ${reps} reps. Increase by ${fmt(bump)} kg ${loadChange}; aim for ${low}–${high} reps.</p>`;
      }
      if (reps >= low) {
        const targetReps = Math.min(high,reps+1);
        return `<p><strong>SET ${index+1}</strong> Last time: ${escapeHtml(fmt(weight))} kg × ${reps} reps. Keep ${escapeHtml(fmt(weight))} kg ${unitHint} and aim for ${targetReps} reps.</p>`;
      }
      return `<p><strong>SET ${index+1}</strong> Last time: ${escapeHtml(fmt(weight))} kg × ${reps} reps. Keep the load and build toward ${low}–${high} reps.</p>`;
    }).join('');

    target.innerHTML = `<span class="coach-label">MOVEMENT INTELLIGENCE · ${patternLabel(pattern).toUpperCase()} · ${type.toUpperCase()} · SET-BY-SET · ${low}–${high} REPS</span>${setAdvice}`;
  }
function addMovement(movement = { id:newId(), name:'', sets:[{reps:'',weight:''}] }) {
    list.insertAdjacentHTML('beforeend', movementMarkup(movement, $$('.movement-card',list).length));
    reindex(); saveDraft();
    $('.movement-name', list.lastElementChild).focus();
  }
  function showPage(page) {
    const pages = { workout:'#workout-view', history:'#history', trophies:'#trophies' };
    if (!pages[page]) page = 'workout';
    Object.entries(pages).forEach(([name, selector]) => { $(selector).hidden = name !== page; });
    document.body.dataset.page = page;
    $$('.nav-item,.drawer-nav a').forEach(link => {
      const active = link.hash === `#${page === 'workout' ? 'workout' : page}`;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    });
    const hash = `#${page === 'workout' ? 'workout' : page}`;
    if (location.hash !== hash) history.replaceState(null,'',`${location.pathname}${location.search}${hash}`);
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function openMenu() {
    $('#app-menu').classList.add('open');
    $('#app-menu').setAttribute('aria-hidden','false');
    $('#app-menu').removeAttribute('inert');
    $('#menu-backdrop').hidden = false;
    $('#menu-toggle').setAttribute('aria-expanded','true');
    document.body.classList.add('menu-open');
    $('#menu-close').focus();
  }
  function closeMenu() {
    $('#app-menu').classList.remove('open');
    $('#app-menu').setAttribute('aria-hidden','true');
    $('#app-menu').setAttribute('inert','');
    $('#menu-backdrop').hidden = true;
    $('#menu-toggle').setAttribute('aria-expanded','false');
    document.body.classList.remove('menu-open');
    $('#menu-toggle').focus();
  }
  function showToast(message) {
    const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }
  function fmt(value) { return Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 }); }
  function formatClock(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), secs = total % 60;
    return hours ? `${hours}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}` : `${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  }
  function loggedGroups() { return $$('.set-group', list).filter(group => Number(group.dataset.loggedAt) > 0); }
  function updateTimers() {
    const groups = loggedGroups().sort((a,b) => Number(a.dataset.loggedAt) - Number(b.dataset.loggedAt));
    const cluster = $('#timer-cluster');
    cluster.hidden = groups.length === 0;
    if (!groups.length) return;
    const first = Number(groups[0].dataset.loggedAt), last = Number(groups.at(-1).dataset.loggedAt), now = Date.now();
    $('#workout-timer').textContent = formatClock((now-first) / 1000);
    $('#rest-timer').textContent = formatClock((now-last) / 1000);
  }
  function logCompletedSet(group) {
    const row = $('.set-row', group), reps = Number($('.reps-input', row).value), weightRaw = $('.weight-input', row).value;
    if (!(reps > 0 && weightRaw !== '' && Number(weightRaw) >= 0)) {
      delete group.dataset.loggedAt; delete group.dataset.restSeconds;
      updateTimers(); saveDraft(); return;
    }
    if (!group.dataset.loggedAt) {
      const previous = loggedGroups().map(item => Number(item.dataset.loggedAt)).filter(Number.isFinite);
      const now = Date.now();
      group.dataset.loggedAt = String(now);
      if (previous.length) group.dataset.restSeconds = String(Math.max(0, Math.round((now - Math.max(...previous)) / 1000)));
    }
    updateTimers(); saveDraft();
  }
  function workoutVolume(workout) {
    return workout.movements.reduce((total, movement) => total + movement.sets.reduce((sum, set) => sum + (Number(set.reps)||0) * (Number(set.weight)||0), 0), 0);
  }
  function summarize(workout) {
    const sets = workout.movements.reduce((sum,m) => sum + m.sets.length,0);
    return `${workout.movements.length} movement${workout.movements.length===1?'':'s'} · ${sets} set${sets===1?'':'s'}`;
  }
  function renderHistory() {
    const sorted = [...workouts].sort((a,b) => b.date.localeCompare(a.date) || b.createdAt-a.createdAt);
    $('#history-total').textContent = String(workouts.length);
    $('#history-empty').hidden = sorted.length > 0;
    $('#history-list').innerHTML = sorted.map(w => `<article class="history-item" id="workout-${escapeHtml(w.id)}" data-id="${escapeHtml(w.id)}"><div class="history-main"><div><div class="history-date">${escapeHtml(displayDate(w.date))}</div><div class="history-name">${escapeHtml(w.name || 'Training session')}</div></div><div class="history-summary">${escapeHtml(summarize(w))}${w.durationSeconds != null ? ` · ${formatClock(w.durationSeconds)}` : ''}${w.notes ? ` · ${escapeHtml(w.notes)}` : ''}</div><span class="history-volume">${fmt(workoutVolume(w))} kg</span><button class="history-toggle" type="button" aria-expanded="false">View</button><button class="delete-workout" type="button" aria-label="Delete ${escapeHtml(w.name || 'workout')}" title="Delete workout">×</button></div><div class="history-details" hidden>${w.movements.map(m => `<div class="history-movement"><strong>${escapeHtml(m.name)}<small>${escapeHtml(patternLabel(m.pattern || inferPattern(m.name)))}</small></strong><span>${m.sets.map((set,i) => `S${i+1} · ${escapeHtml(fmt(set.weight))} kg × ${escapeHtml(set.reps)} reps${set.restSeconds != null ? ` · rest ${formatClock(set.restSeconds)}` : ''}`).join('　')}</span></div>`).join('')}</div></article>`).join('');
    renderMenuWorkouts(sorted);
    renderTrophyRoom();
    $$('.movement-card', list).forEach(refreshComparisons);
  }
  function renderMenuWorkouts(sorted) {
    $('#menu-workout-count').textContent = sorted.length;
    $('#menu-empty').hidden = sorted.length > 0;
    $('#menu-workout-list').innerHTML = sorted.map(w => `<button class="menu-workout-item" type="button" data-workout-id="${escapeHtml(w.id)}"><span class="menu-workout-date">${escapeHtml(displayDate(w.date,{month:'short',day:'numeric',year:'numeric'}))}</span><strong>${escapeHtml(w.name || 'Training session')}</strong><small>${escapeHtml(summarize(w))}</small></button>`).join('');
  }
  function renderTrophyRoom() {
    const records = new Map();
    const ordered = [...workouts].sort((a,b) => a.date.localeCompare(b.date) || a.createdAt-b.createdAt);
    for (const workout of ordered) {
      for (const movement of workout.movements) {
        const key = exerciseKey(movement.name);
        if (!key) continue;
        let record = records.get(key);
        if (!record) {
          const known = exerciseGroups.find(group => normalizeExercise(group.name) === key);
          record = { key, name:known?.name || movement.name, type:movement.type || inferType(movement.name) || 'compound', pattern:movement.pattern || inferPattern(movement.name), working:null, oneRep:null };
          records.set(key,record);
        }
        record.type = movement.type || inferType(movement.name) || record.type;
        record.pattern = movement.pattern || inferPattern(movement.name);
        for (const rawSet of movement.sets) {
          const set = { reps:Number(rawSet.reps)||0, weight:Number(rawSet.weight)||0, date:workout.date };
          if (set.reps > 1 && (!record.working || set.weight > record.working.weight || (set.weight === record.working.weight && set.reps > record.working.reps))) record.working = set;
          if (set.reps === 1 && set.weight > 0 && (!record.oneRep || set.weight > record.oneRep.weight)) record.oneRep = set;
        }
      }
    }
    const sorted = [...records.values()].sort((a,b) => a.name.localeCompare(b.name));
    $('#trophy-total').textContent = `${sorted.length} EXERCISE${sorted.length===1?'':'S'}`;
    $('#trophy-empty').hidden = sorted.length > 0;
    $('#trophy-list').innerHTML = sorted.map(record => `<article class="trophy-card"><div class="trophy-title"><h3>${escapeHtml(record.name)}</h3><span>${escapeHtml(patternLabel(record.pattern).toUpperCase())} · ${record.type==='isolation'?'ISOLATION':'COMPOUND'}</span></div><div class="trophy-prs"><div class="trophy-pr"><small>WORKING SET PR</small>${record.working?`<strong>${fmt(record.working.weight)} kg <i>×</i> ${record.working.reps} reps</strong><span>${escapeHtml(displayDate(record.working.date))}</span>`:'<strong>Not logged yet</strong>'}</div>${record.oneRep?`<div class="trophy-pr"><small>1 REP MAX</small><strong>${fmt(record.oneRep.weight)} kg</strong><span>${escapeHtml(displayDate(record.oneRep.date))}</span></div>`:''}</div></article>`).join('');
  }
  function clearForm() {
    $('#workout-name').value = ''; $('#workout-notes').value = ''; list.innerHTML = ''; setToday(); updateMovementCount();
    localStorage.removeItem(DRAFT_KEY); saveDraft(); updateTimers();
  }
  function saveWorkout() {
    const form = currentDraft();
    const movements = form.movements.map(m => ({ name:m.name.trim(), type:m.type, pattern:m.pattern, sets:m.sets.filter(s => s.reps !== '' || s.weight !== '').map(s => ({ reps:Number(s.reps)||0, weight:Number(s.weight)||0, loggedAt:Number(s.loggedAt)||0, restSeconds:s.restSeconds === '' ? null : Number(s.restSeconds) })) })).filter(m => m.name || m.sets.length);
    if (!form.date) { showToast('Choose a date for this workout.'); $('#workout-date').focus(); return; }
    if (!movements.length) { showToast('Add a movement and at least one set to save.'); if (!$('.movement-card',list)) addMovement(); else $('.movement-name',list).focus(); return; }
    const incomplete = movements.some(m => !m.name || !m.sets.length || m.sets.some(s => s.reps <= 0 || s.weight < 0));
    if (incomplete) { showToast('Add a movement name, reps, and weight for each set.'); return; }
    const logged = movements.flatMap(m => m.sets.map(s => s.loggedAt).filter(Boolean));
    const durationSeconds = logged.length ? Math.max(0, Math.round((Math.max(...logged)-Math.min(...logged))/1000)) : 0;
    const workout = { id:newId(), createdAt:Date.now(), date:form.date, name:form.name.trim(), notes:form.notes.trim(), durationSeconds, movements };
    workouts.unshift(workout); saveWorkouts(); clearForm(); renderHistory(); showToast('Workout saved. Nice work.');
  }

  document.addEventListener('input', event => {
    if (event.target.matches('#workout-name,#workout-date,#workout-notes,.movement-name,.movement-type,.reps-input,.weight-input')) saveDraft();
    const card = event.target.closest('.movement-card');
    if (card && event.target.matches('.movement-name')) {
      const inferred = inferType(event.target.value);
      if (inferred && $('.movement-type',card).value !== inferred) { $('.movement-type',card).value = inferred; saveDraft(); }
      $('.movement-pattern',card).value = inferPattern(event.target.value);
      saveDraft();
      refreshComparisons(card);
    }
    if (event.target.matches('.reps-input,.weight-input')) logCompletedSet(event.target.closest('.set-group'));
    if (event.target.matches('#workout-date')) $$('.movement-card',list).forEach(refreshComparisons);
  });
  document.addEventListener('change', event => {
    const card = event.target.closest('.movement-card');
    if (card && event.target.matches('.movement-type,.movement-pattern')) { saveDraft(); renderCoach(card); }
  });
  document.addEventListener('click', event => {
    if (event.target.closest('#menu-toggle')) { openMenu(); return; }
    if (event.target.closest('#menu-close') || event.target.id === 'menu-backdrop') { closeMenu(); return; }
    const pageLink = event.target.closest('.drawer-nav a,.side-nav a');
    if (pageLink) {
      event.preventDefault();
      const page = pageLink.hash.slice(1);
      showPage(page === 'workout' ? 'workout' : page);
      if (document.body.classList.contains('menu-open')) closeMenu();
      return;
    }
    const workoutLink = event.target.closest('.menu-workout-item');
    if (workoutLink) {
      const target = document.getElementById(`workout-${workoutLink.dataset.workoutId}`);
      showPage('history');
      if (document.body.classList.contains('menu-open')) closeMenu();
      if (target) { if ($('.history-details',target).hidden) $('.history-toggle',target).click(); target.scrollIntoView({behavior:'smooth',block:'center'}); target.classList.add('highlighted'); setTimeout(() => target.classList.remove('highlighted'),1600); }
      return;
    }
    const button = event.target.closest('button'); if (!button) return;
    if (button.id === 'draft-switch') {
      const current = localStorage.getItem(DRAFT_KEY);
      const previous = localStorage.getItem(PAUSED_DRAFT_KEY);
      if (current && draftHasContent(current)) localStorage.setItem(PAUSED_DRAFT_KEY,current);
      else localStorage.removeItem(PAUSED_DRAFT_KEY);
      if (previous) localStorage.setItem(DRAFT_KEY,previous);
      location.href = location.pathname;
      return;
    }
    if (button.id === 'add-movement') addMovement();
    if (button.id === 'save-workout') saveWorkout();
    if (button.id === 'clear-workout') { clearForm(); showToast('Workout form cleared.'); }
    if (button.classList.contains('history-toggle')) {
      const details = $('.history-details',button.closest('.history-item'));
      const isOpen = button.getAttribute('aria-expanded') === 'true';
      details.hidden = isOpen; button.setAttribute('aria-expanded',String(!isOpen)); button.textContent = isOpen ? 'View' : 'Hide';
    }
    if (button.classList.contains('add-set')) {
      const card = button.closest('.movement-card');
      const rows = $('.set-list', card);
      rows.insertAdjacentHTML('beforeend', setMarkup({reps:'',weight:''}, $$('.set-group',rows).length, $('.movement-name',card).value)); reindex(); saveDraft(); updateTimers();
      $('.reps-input', rows.lastElementChild).focus();
    }
    if (button.classList.contains('remove-movement')) { button.closest('.movement-card').remove(); reindex(); saveDraft(); updateTimers(); }
    if (button.classList.contains('remove-set')) {
      const card = button.closest('.movement-card');
      if ($$('.set-row',card).length === 1) { $('.reps-input',button.closest('.set-row')).value=''; $('.weight-input',button.closest('.set-row')).value=''; }
      else button.closest('.set-group').remove();
      reindex(); saveDraft(); updateTimers();
    }
    if (button.classList.contains('delete-workout')) {
      const id = button.closest('.history-item').dataset.id;
      workouts = workouts.filter(w => w.id !== id); saveWorkouts(); renderHistory(); showToast('Workout removed from your history.');
    }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  const quickStart = new URLSearchParams(location.search).get('new-workout') === '1';
  if (quickStart) prepareFreshShortcut();
  setToday(); restoreDraft(); renderHistory(); updateTimers(); updateDraftSwitch();
  const requestedPage = location.hash.slice(1);
  showPage(quickStart ? 'workout' : (requestedPage === 'history' || requestedPage === 'trophies' ? requestedPage : 'workout'));
  if (quickStart) {
    history.replaceState(null,'',location.pathname + location.hash);
    addMovement();
    updateDraftSwitch();
    showToast('Fresh workout ready.');
  }
  setInterval(updateTimers, 1000);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
