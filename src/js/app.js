// The composition root: wires events to the features and boots the app. The only file that imports everything.
import { COLOR_SLOTS, DEFAULT_SETTINGS } from './core/config.js';
import { $, addDays, clone, esc, fmt, fmtWd, mondayOf, reduceMotion, todayKey, uid } from './core/utils.js';
import { normalizeSettings, state } from './core/state.js';
import { recompute } from './core/stats.js';
import { connectCloud, flushUnsynced, loadLocal, saveSettings, sync, testLS } from './core/store.js';
import { addExtra, removeExtra, toggleHabit, toggleRest } from './features/today.js';
import { clearPromos, nextPromo, toast } from './core/effects.js';
import { render } from './core/render.js';
import { claimReward, setReward, showTip } from './features/progress.js';
import { addSetRow, deleteLift, onExerciseChange, openLiftSheet, saveLift, setLiftFilter, toggleLadder } from './features/lifts.js';
import { applyCalories, bodyFilter, ciChip, openCheckin, saveBodyFilter, saveCheckin, stepBodyWeek } from './features/body.js';
import { bDelete, bUnlink, BXP, clearSelection, openBuildSheet, saveBuildForm, selectNode, toggleBuildLadder, toggleShowAll } from './features/build.js';
import { closeSheets, draft, draftHabit, extraFor, openExtra, openRank, openSettings, renderSettingsList } from './core/sheets.js';
import { bindCoach, initCoach, initCoach2, onExportClick, renderDataBox } from './features/coach.js';

/* ---------- events ---------- */
function bind(){
  document.addEventListener('click', function(e){
    var t = e.target.closest('[data-act],[data-tab]'); if(!t) return;
    if(t.hasAttribute('data-tab')){ state.tab = t.getAttribute('data-tab'); render(); return; }
    var act = t.getAttribute('data-act'), hid = t.getAttribute('data-h');
    switch(act){
      case 'toggle': toggleHabit(hid, t); break;
      case 'rest': toggleRest(hid); break;
      case 'light': toggleRest(hid, 'light'); break;
      case 'open-extra': openExtra(hid); break;
      case 'rm-extra': removeExtra(hid, t.getAttribute('data-x')); break;
      case 'log-preset': { var hh = extraFor; closeSheets(); var anchor = document.querySelector('[data-act="open-extra"][data-h="' + hh + '"]'); addExtra(hh, t.getAttribute('data-note'), anchor); break; }
      case 'close-sheet': closeSheets(); break;
      case 'close-promo': nextPromo(); break;
      case 'open-rank': openRank(hid); break;
      case 'open-lift': openLiftSheet(); break;
      case 'open-checkin': openCheckin(); break;
      case 'ci-chip': ciChip(t.getAttribute('data-g'), t.getAttribute('data-v')); break;
      case 'body-filter': { var tag = t.getAttribute('data-tag'); bodyFilter[tag] = !bodyFilter[tag]; saveBodyFilter(); render(); break; }
      case 'body-week': stepBodyWeek(parseInt(t.getAttribute('data-dir'), 10) || 0); break;
      case 'apply-cal': applyCalories(parseInt(t.getAttribute('data-delta'), 10) || 0); break;
      case 'del-lift': deleteLift(t.getAttribute('data-id')); break;
      case 'lift-filter': setLiftFilter(t.getAttribute('data-loc')); break;
      case 'toggle-ladder': toggleLadder(); break;
      case 'claim-reward': claimReward(t.getAttribute('data-k')); break;
      case 'bnode': selectNode(t.getAttribute('data-id')); break;
      case 'bsel-clear': clearSelection(); break;
      case 'bnew-ship': openBuildSheet('ship', null, t.getAttribute('data-node') ? {node:t.getAttribute('data-node')} : null); break;
      case 'bnew-node': openBuildSheet('node'); break;
      case 'bnew-skill': openBuildSheet('skill'); break;
      case 'bedit-ship': openBuildSheet('ship', t.getAttribute('data-id')); break;
      case 'bedit-skill': openBuildSheet('skill', t.getAttribute('data-id')); break;
      case 'bedit-node': openBuildSheet('node', t.getAttribute('data-id')); break;
      case 'bdelete': bDelete(); break;
      case 'bunlink': bUnlink(t.getAttribute('data-id'), t.getAttribute('data-to')); break;
      case 'bshow-all': toggleShowAll(); break;
      case 'toggle-bladder': toggleBuildLadder(); break;
      case 'pick-day': state.selected = t.getAttribute('data-d'); render(); break;
      case 'go-today': state.selected = todayKey(); state.weekOf = mondayOf(state.selected); render(); break;
      case 'week-prev': state.weekOf = addDays(state.weekOf, -7); state.selected = addDays(state.weekOf, 6); render(); break;
      case 'week-next': {
        var nw = addDays(state.weekOf, 7), td = todayKey();
        if(nw <= td){ state.weekOf = nw; state.selected = mondayOf(td) === nw ? td : addDays(nw, 6); render(); }
        break;
      }
      case 'open-day': { var dd = t.getAttribute('data-d'); state.selected = dd; state.weekOf = mondayOf(dd); state.tab = 'today'; render(); window.scrollTo({top:0, behavior: reduceMotion ? 'auto' : 'smooth'}); break; }
      case 'pause': { var p = draftHabit(hid); if(p){ var td2 = todayKey(); p.pauses = (p.pauses || []).filter(function(x){ return x.to; }); p.pauses.push({from:td2, to:null}); if(p.since > td2) p.since = td2; renderSettingsList(); } break; }
      case 'resume': { var q = draftHabit(hid); if(q){ var td3 = todayKey(); q.pauses = (q.pauses || []).map(function(x){ return x.to ? x : {from:x.from, to:td3}; }).filter(function(x){ return x.from < x.to; }); renderSettingsList(); } break; }
    }
  });
  $('#btn-settings').addEventListener('click', function(){ openSettings(); renderDataBox(); });
  $('#btn-export').addEventListener('click', onExportClick);
  $('#lift-form').addEventListener('submit', function(e){ e.preventDefault(); saveLift(); });
  $('#ci-form').addEventListener('submit', function(e){ e.preventDefault(); saveCheckin(); });
  $('#bd-form').addEventListener('submit', function(e){ e.preventDefault(); saveBuildForm(); });
  $('#bd-form').addEventListener('change', function(e){ if(e.target && e.target.id === 'bd-kind') $('#bd-xp').textContent = '+' + (BXP[e.target.value] || BXP.fix) + ' XP'; });
  document.addEventListener('keydown', function(e){ var g = e.target && e.target.closest && e.target.closest('.bn'); if(g && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); g.dispatchEvent(new MouseEvent('click', {bubbles:true})); } });
  $('#lf-add-set').addEventListener('click', function(){
    var rows = Array.from($('#lf-sets').children);
    addSetRow(rows.length ? rows[rows.length-1].querySelector('input[id^="lf-w-"]').value : '', '');
  });
  $('#lf-ex').addEventListener('change', onExerciseChange);
  $('#ex-form').addEventListener('submit', function(e){
    e.preventDefault();
    var note = $('#ex-note').value.trim(); var hh = extraFor;
    closeSheets();
    addExtra(hh, note || 'Extra session', document.querySelector('[data-act="open-extra"][data-h="' + hh + '"]'));
  });
  function onDraftInput(e){
    var i = e.target; var hb = draftHabit(i.getAttribute('data-h')); if(!hb) return;
    var f = i.getAttribute('data-f'); if(!f) return;
    hb[f] = f === 'restPerWeek' ? (parseInt(i.value, 10) || 0) : i.value;
  }
  $('#st-list').addEventListener('input', onDraftInput);
  $('#st-list').addEventListener('change', onDraftInput);
  $('#btn-add').addEventListener('click', function(){
    var name = $('#new-name').value.trim(), target = $('#new-target').value.trim();
    if(!name){ $('#new-name').focus(); return; }
    var used = draft.habits.map(function(h){ return h.color; });
    var color = COLOR_SLOTS.filter(function(c){ return used.indexOf(c) < 0; })[0] || COLOR_SLOTS[draft.habits.length % COLOR_SLOTS.length];
    draft.habits.push({id:'h' + uid(), name:name, target:target || 'Daily', color:color, since:todayKey(), pauses:[], restPerWeek:0, presets:['Extra session']});
    $('#new-name').value = ''; $('#new-target').value = '';
    renderSettingsList();
  });
  $('#btn-save').addEventListener('click', function(){
    var bad = draft.habits.filter(function(h){ return !h.name.trim(); })[0];
    if(bad){ var inp = document.getElementById('st-name-' + bad.id); if(inp) inp.focus(); toast('Every habit needs a name.'); return; }
    draft.habits.forEach(function(h){ h.name = h.name.trim(); h.target = h.target.trim(); });
    state.settings = normalizeSettings(draft);
    closeSheets(); recompute(); render();
    var btn = $('#btn-save'); btn.disabled = true;
    saveSettings().then(function(ok){ btn.disabled = false; if(ok) toast('Habits saved'); });
  });
  document.querySelectorAll('.sheet-back').forEach(function(b){ b.addEventListener('click', function(e){ if(e.target === b) closeSheets(); }); });
  $('#promo').addEventListener('click', function(e){ if(e.target.id === 'promo') nextPromo(); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ closeSheets(); clearPromos(); } });

  var vp = $('#view-progress');
  vp.addEventListener('pointermove', function(e){ var r = e.target.closest && e.target.closest('#chart rect[data-i]'); if(r) showTip(r.getAttribute('data-i')); });
  vp.addEventListener('pointerleave', function(){ var t = $('#tip'); if(t) t.hidden = true; });
  vp.addEventListener('change', function(e){ var i = e.target; if(i && i.matches && i.matches('input[data-reward]')) setReward(i.getAttribute('data-reward'), i.value); });
  vp.addEventListener('input', function(e){ var i = e.target; if(!(i && i.matches && i.matches('input[data-reward]'))) return; var b = i.parentNode.querySelector('[data-act="claim-reward"]'); if(b) b.disabled = !i.value.trim(); });
  vp.addEventListener('click', function(e){
    var r = e.target.closest && e.target.closest('#chart rect[data-i]');
    if(r){ showTip(r.getAttribute('data-i')); return; }
    var c = e.target.closest && e.target.closest('#heat rect[data-d]');
    if(c){
      var d = c.getAttribute('data-d'), b = state.stats.byDate[d];
      $('#heat-cap').innerHTML = '<span><b>' + esc(fmtWd(d)) + '</b> · ' + (b ? b.done + ' of ' + b.total + ' habits · ' + fmt(b.xp) + ' XP' + (b.sweep ? ' · clean sweep' : '') : 'Nothing logged') + '</span><button type="button" data-act="open-day" data-d="' + d + '">Open day</button>';
    }
  });

  function rollover(){
    var t = todayKey();
    if(t !== state.lastToday){
      if(state.selected === state.lastToday) state.selected = t;
      if(state.weekOf === mondayOf(state.lastToday)) state.weekOf = mondayOf(state.selected);
      state.lastToday = t; recompute(); render();
    }
  }
  setInterval(rollover, 60000);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden){ rollover(); flushUnsynced(); } });
  window.addEventListener('online', flushUnsynced);
}

/* ---------- boot ---------- */
state.settings = normalizeSettings(clone(DEFAULT_SETTINGS));
sync.lsOK = testLS();
loadLocal();
state.mode = sync.lsOK ? 'local' : 'memory';
recompute();
bind();
bindCoach();
render();
connectCloud();
initCoach();
initCoach2();
