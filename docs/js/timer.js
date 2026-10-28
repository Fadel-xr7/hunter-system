'use strict';
/* =====================================================================
   نظام الصياد — timer.js
   بوابة التركيز: المؤقت ومراحله (شغل وراحة)، أزرار المدة، الربط بمهمة، ووضع الغمر.
   ===================================================================== */

/* ============ المؤقت ============ */
// الجلسة مقسومة لمراحل: شغل وراحة.
// ساعة = بومودورو (25 شغل، 5 راحة، مرتين). ساعتين فأكثر = ساعة شغل ثم 12 دقيقة راحة، والراحة تنضاف على الوقت.
let timerTick = null;
function timerPlan(min) {
  if (min === 60) return [{ type: 'work', min: 25 }, { type: 'break', min: 5 }, { type: 'work', min: 25 }, { type: 'break', min: 5 }];
  if (min >= 120) {
    const out = [];
    for (let i = 0; i < min / 60; i++) { if (i) out.push({ type: 'break', min: 12 }); out.push({ type: 'work', min: 60 }); }
    return out;
  }
  return [{ type: 'work', min }];
}

const curPhase = () => timerPlan(state.timer.minutes)[state.timer.phase] || timerPlan(state.timer.minutes)[0];
const timerTotal = () => curPhase().min * 60;
const timerLeft = () => state.timer.status === 'running' ? Math.max(0, Math.round((state.timer.endAt - Date.now()) / 1000)) : state.timer.remaining;

function timerToggle() {
  const t = state.timer;
  if (t.status === 'running') { t.remaining = timerLeft(); t.status = 'paused'; }
  else { t.endAt = Date.now() + (t.status === 'paused' ? t.remaining : timerTotal()) * 1000; t.status = 'running'; sound('start'); }
  commit(); runTimer();
}

function timerReset() {
  const t = state.timer;
  t.status = 'idle'; t.phase = 0; t.remaining = timerTotal(); t.endAt = 0;
  commit(); runTimer();
}

function runTimer() {
  clearInterval(timerTick);
  renderTimer();
  if (state.timer.status === 'running') timerTick = setInterval(() => { if (timerLeft() <= 0) phaseDone(); else renderTimer(); }, 500);
}

function phaseDone() {
  clearInterval(timerTick);
  const t = state.timer;
  const plan = timerPlan(t.minutes);
  const ph = plan[t.phase] || plan[0];
  const lastWork = plan.map((p) => p.type).lastIndexOf('work');
  const next = plan[t.phase + 1];
  let completeLinked = false;

  if (ph.type === 'work') {
    // كل مقطع شغل يُحسب لحاله، فلو وقفت بالنص ما يضيع اللي خلصته
    state.focus.minutes += ph.min;
    grant('focus:' + t.endAt + ':' + t.phase, ph.min * FOCUS_XP_PER_MIN, 'SENSE');
    if (t.phase === lastWork) {
      state.focus.sessions += 1;
      const workMin = plan.filter((p) => p.type === 'work').reduce((a, p) => a + p.min, 0);
      toast(L('أُغلقت بوابة التركيز', 'Focus gate closed'), '+' + workMin * FOCUS_XP_PER_MIN + ' XP' + L('، ' + workMin + ' دقيقة شغل', ', ' + workMin + ' min of work'), 'gold');
      sound('level');
      completeLinked = t.auto && Boolean(t.link);
    } else {
      toast(L('خلص مقطع الشغل', 'Work block done'), L('استراحة ' + next.min + ' دقيقة، قم وتحرك', next.min + '-min break. Get up and move'), 'gold');
      sound('start');
    }
  } else if (next) {
    toast(L('خلصت الاستراحة', 'Break over'), L('رجعنا للشغل: ' + next.min + ' دقيقة', 'Back to work: ' + next.min + ' min'));
    sound('start');
  }

  if (next) {
    // المرحلة الجاية تبدأ من نهاية اللي قبلها، فلو كانت الصفحة مقفلة يلحق الوقت صح
    t.phase += 1; t.endAt = t.endAt + next.min * 60000; t.status = 'running';
  } else {
    t.status = 'idle'; t.phase = 0; t.endAt = 0; t.remaining = timerTotal();
  }

  if (completeLinked) {
    const [kind, id] = t.link.split(':');
    const { fixed, gates } = todayTasks();
    const task = fixed.concat(gates).find((x) => x.kind === kind && x.id === id);
    if (task && !task.done) { toggleTask(kind, id); runTimer(); return; }
  }
  commit(); runTimer();
}

/* ============ الرسم ============ */
function renderTimer() {
  const left = timerLeft(), total = timerTotal();
  const plan = timerPlan(state.timer.minutes), ph = curPhase();
  const works = plan.filter((p) => p.type === 'work').length;
  const workNo = plan.slice(0, state.timer.phase + 1).filter((p) => p.type === 'work').length;
  const st = state.timer.status;
  $('timerPhase').textContent = st === 'idle' ? L('جاهز', 'Ready') : (ph.type === 'break' ? L('استراحة', 'Break') : L('تركيز', 'Focus')) + (st === 'paused' ? L(' · متوقف', ' · paused') : '');
  $('timerSub').textContent = plan.length < 2 ? ph.min + L(' دقيقة', ' min') : ph.type === 'break' ? L('راحة ' + ph.min + ' د، بعدها نرجع للشغل', ph.min + '-min break, then back to work') : L('مقطع ' + workNo + ' من ' + works, 'Block ' + workNo + ' of ' + works);
  $('focusPanel').classList.toggle('on-break', ph.type === 'break' && state.timer.status !== 'idle');
  const steps = $('timerSteps');
  steps.hidden = plan.length < 2 && !look().alwaysShowSteps;
  steps.replaceChildren(...plan.map((p, i) => el('span', {
    class: 'step ' + p.type + (i < state.timer.phase ? ' done' : i === state.timer.phase && state.timer.status !== 'idle' ? ' cur' : ''),
    style: 'flex-grow:' + p.min, title: (p.type === 'work' ? L('شغل ', 'Work ') : L('راحة ', 'Break ')) + p.min + L(' دقيقة', ' min')
  })));
  $('timerDisplay').textContent = pad(Math.floor(left / 60)) + ':' + pad(left % 60);
  $('timerDisplay').classList.toggle('running', state.timer.status === 'running');
  // الحلقة تنقص مع الوقت (pathLength = 1000)
  $('timerRing').style.strokeDashoffset = String(Math.round((1 - (total ? left / total : 1)) * 1000));
  placeOrbit('timerOrbit', total ? left / total : 1);
  $('timerStart').textContent = state.timer.status === 'running' ? L('إيقاف مؤقت', 'Pause') : state.timer.status === 'paused' ? L('كمّل', 'Resume') : L('ادخل البوابة', 'Enter the gate');
  renderImmersive(left, total, ph, plan);
  $('timerMinutes').value = String(state.timer.minutes);
  $('timerMinutes').disabled = state.timer.status !== 'idle';
  renderDurChips();
  $('timerAuto').checked = state.timer.auto;
  if (state.timer.status === 'running') document.title = pad(Math.floor(left / 60)) + ':' + pad(left % 60) + ' | ' + APP_NAME;
  else document.title = APP_NAME;
}

// أزرار المدة: نفس خيارات القائمة المنسدلة. ظاهرة في الأنمي، وحبر الليل يستخدم القائمة (style.css)
function renderDurChips() {
  const box = $('durChips');
  if (!box) return;
  const sel = $('timerMinutes');
  // نبنيها مرة وحدة بس، وبعدها نحدّث حالتها. لو انبنت كل رسم يضيع التركيز من الكيبورد
  if (box.childElementCount !== sel.options.length) {
    box.replaceChildren(...[...sel.options].map((o) => el('button', {
      type: 'button', class: 'dur-chip', 'data-v': o.value, 'aria-label': o.textContent, text: timerLabel(Number(o.value), true),
      onclick: () => { if (sel.disabled || sel.value === o.value) return; sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    })));
  }
  for (const b of box.children) {
    b.setAttribute('aria-pressed', String(b.dataset.v === sel.value));
    b.disabled = sel.disabled;
  }
}

function renderLinkOptions() {
  const sel = $('timerLink');
  const { fixed, gates } = todayTasks();
  sel.replaceChildren(el('option', { value: '', text: L('بدون ربط', 'No link') }),
    ...fixed.concat(gates).filter((t) => !t.done).map((t) => el('option', { value: t.kind + ':' + t.id, text: t.title })));
  sel.value = [...sel.options].some((o) => o.value === state.timer.link) ? state.timer.link : '';
}

/* ============ وضع الغمر: المؤقت بملء الشاشة وكل شي ثاني يختفي ============ */
function openImmersive() {
  const dlg = $('immersive');
  if (dlg.open) return;
  dlg.showModal();
  document.documentElement.classList.add('immersed');
  // ملء الشاشة على النافذة نفسها (لو على الصفحة كلها، تغطي النافذة)
  try { if (dlg.requestFullscreen && !document.fullscreenElement) dlg.requestFullscreen().catch(() => {}); } catch (e) { /* بدون ملء الشاشة */ }
  renderTimer();
  $('imToggle').focus();
}

function closeImmersive() { const dlg = $('immersive'); if (dlg.open) dlg.close(); }

function renderImmersive(left, total, ph) {
  const dlg = $('immersive');
  if (!dlg || !dlg.open) return;
  const { fixed, gates } = todayTasks();
  const linked = state.timer.link ? fixed.concat(gates).find((x) => x.kind + ':' + x.id === state.timer.link) : null;
  $('imTask').textContent = linked ? linked.title : L('جلسة تركيز حرة', 'Free focus session');
  $('imPhase').textContent = $('timerPhase').textContent;
  $('imTime').textContent = $('timerDisplay').textContent;
  $('imSub').textContent = $('timerSub').textContent;
  $('imRing').style.strokeDashoffset = String(Math.round((1 - (total ? left / total : 1)) * 1000));
  placeOrbit('imOrbit', total ? left / total : 1);
  $('imToggle').textContent = $('timerStart').textContent;
  $('imSteps').hidden = $('timerSteps').hidden;
  $('imSteps').replaceChildren(...[...$('timerSteps').children].map((c) => c.cloneNode(true)));
  dlg.classList.toggle('on-break', ph.type === 'break' && state.timer.status !== 'idle');
}

// نقطة تدور مع المؤقت (تبان في حبر الليل)
function placeOrbit(id, frac) {
  const o = $(id);
  if (!o) return;
  const a = (-90 + 360 * Math.max(0, Math.min(1, frac))) * Math.PI / 180;
  o.setAttribute('cx', (120 + 108 * Math.cos(a)).toFixed(1));
  o.setAttribute('cy', (120 + 108 * Math.sin(a)).toFixed(1));
}

/* ============ الأزرار ============ */
function bindTimer() {
  $('timerStart').addEventListener('click', timerToggle);
  $('timerReset').addEventListener('click', timerReset);
  $('timerMinutes').replaceChildren(...TIMER_OPTS.map((m) => el('option', { value: m, text: timerLabel(m) })));
  $('timerMinutes').addEventListener('change', (e) => { if (state.timer.status !== 'idle') return; state.timer.minutes = Number(e.target.value); state.timer.phase = 0; state.timer.remaining = timerTotal(); commit(); });
  $('timerLink').addEventListener('change', (e) => { state.timer.link = e.target.value; save(); });
  $('timerAuto').addEventListener('change', (e) => { state.timer.auto = e.target.checked; save(); });
  // وضع الغمر
  $('immBtn').addEventListener('click', openImmersive);
  $('imToggle').addEventListener('click', timerToggle);
  $('imExit').addEventListener('click', closeImmersive);
  $('immersive').addEventListener('close', () => {
    document.documentElement.classList.remove('immersed');
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch (e) { /* تجاهل */ }
  });
}
