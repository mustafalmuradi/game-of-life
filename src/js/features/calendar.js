// Google Calendar inside the tracker, through the viewer's own connector (the mcp capability): today's events on Today,
// kept current by a watch, and "Add to Calendar" from the task sheet, one call per tap. Calls run as the viewer; the
// page never sees a token. Without the capability (a local copy, the harness) the card and the button simply don't exist.
import { $, addDays, esc, pad, parseKey, todayKey } from '../core/utils.js';
import { state } from '../core/state.js';
import { toast } from '../core/effects.js';
import { findTask, updateTask } from './tasks.js';

export var CAL_SERVER = 'Google Calendar';
var cal = {mcp:undefined, unsub:null, day:null, events:null, err:null, ask:false, loading:false, storedAt:null, adding:false};
var DENIED = ['needs_reauth', 'server_not_connected', 'not_in_manifest', 'blocked_by_policy', 'selection_required', 'not_granted', 'capability_disabled', 'capability_removed', 'consent_required'];

export function calAvailable(){ return !!cal.mcp; }
export function calInit(){
  if(!(window.claude && typeof window.claude.use === 'function')){ cal.mcp = null; return; }
  window.claude.use('mcp').then(function(m){ cal.mcp = m || null; if(m) calWatch(); renderCal(); }).catch(function(){ cal.mcp = null; renderCal(); });
}
function dayInput(d){ return {startTime:d + 'T00:00:00', endTime:addDays(d, 1) + 'T00:00:00', orderBy:'startTime', pageSize:60}; }
/* a watch on today's events: replays what is cached, refreshes every 5 minutes, re-registers at midnight */
export function calWatch(){
  if(!cal.mcp) return;
  var d = todayKey(); if(cal.unsub && cal.day === d) return;
  if(cal.unsub){ try { cal.unsub(); } catch(e){} cal.unsub = null; }
  cal.day = d; if(!cal.events) cal.loading = true;
  try {
    cal.unsub = cal.mcp.watchTool(CAL_SERVER, 'list_events', dayInput(d), function(ev){
      cal.loading = false;
      if(ev.type === 'data'){ cal.events = normEvents(ev.result && ev.result.payload); cal.err = null; cal.ask = false; cal.storedAt = ev.result && ev.result.cache ? ev.result.cache.storedAt : Date.now(); }
      else {
        var code = ev.error && ev.error.code || 'upstream_error';
        if(code === 'approval_required' || (code === 'upstream_error' && !cal.events)) cal.ask = true; // a watch can't ask for consent; a tap can
        else if(DENIED.indexOf(code) >= 0){ cal.events = null; cal.err = code; }
        else if(!cal.events) cal.err = code;
      }
      renderCal();
    }, {cache:{staleTime:60000, gcTime:600000}, refetchInterval:300000});
  } catch(e){ cal.loading = false; cal.err = 'upstream_error'; }
}
/* one direct call: the first time, this is what asks the viewer to allow the connector for this page */
export function calConnect(){
  if(!cal.mcp) return;
  cal.loading = true; cal.err = null; renderCal();
  cal.mcp.callTool(CAL_SERVER, 'list_events', dayInput(todayKey()), {cache:{staleTime:60000, gcTime:600000}}).then(function(r){
    cal.events = normEvents(r && r.payload); cal.err = null; cal.ask = false; cal.loading = false; cal.storedAt = Date.now(); renderCal(); calWatch();
  }).catch(function(e){
    cal.loading = false; var code = e && e.code || 'upstream_error';
    cal.err = code === 'approval_required' || code === 'consent_required' ? 'declined' : code; cal.ask = false; renderCal();
  });
}
function normEvents(p){
  var list = p && Array.isArray(p.events) ? p.events : [];
  return list.filter(function(e){ return e && e.status !== 'cancelled' && (e.start && (e.start.dateTime || e.start.date)); }).map(function(e){
    var allDay = !e.start.dateTime;
    var s = allDay ? parseKey(e.start.date) : new Date(e.start.dateTime), en = e.end ? (e.end.dateTime ? new Date(e.end.dateTime) : parseKey(e.end.date)) : null;
    return {id:String(e.id || ''), title:String(e.summary || '(no title)').slice(0, 120), allDay:allDay, s:s, en:en, loc:String(e.location || '').slice(0, 80), link:String(e.htmlLink || '')};
  }).sort(function(a, b){ return a.s - b.s; });
}
function clock(dt){ var h = dt.getHours(), m = dt.getMinutes(); return (h % 12 || 12) + (m ? ':' + pad(m) : '') + (h < 12 ? 'a' : 'p'); }
function leftText(ms){ var m = Math.ceil(ms/60000); if(m < 1) return 'now'; var h = Math.floor(m/60), r = m % 60; return 'in ' + (h ? h + 'h' + (r ? ' ' + r + 'm' : '') : r + 'm'); }
var FIX = {
  needs_reauth:'Reconnect Google Calendar in claude.ai Settings → Connectors.',
  server_not_connected:'Add Google Calendar in claude.ai Settings → Connectors.',
  selection_required:'Choose which Google Calendar this page may use (claude.ai asks).',
  not_in_manifest:'Google Calendar is off for this page. Allow it from the page’s Permissions menu.',
  declined:'Google Calendar is off for this page. Allow it from the page’s Permissions menu.',
  blocked_by_policy:'Your organization blocks Google Calendar here.',
  consent_required:'Google Calendar needs your OK in Claude.'
};
export function renderCal(){
  var el = $('#cal'); if(!el) return;
  if(!cal.mcp || state.selected !== todayKey()){ el.hidden = true; el.innerHTML = ''; return; }
  var h = '<div class="cl-head"><p class="eyebrow">Google Calendar · today</p>';
  if(cal.events && cal.events.length) h += '<span class="cl-count">' + cal.events.length + (cal.events.length === 1 ? ' event' : ' events') + '</span>';
  h += '</div>';
  if(cal.ask && !cal.events){
    h += '<p class="cl-note">See your day here. Claude asks once before this page can read your calendar.</p><button class="primary cl-btn" type="button" data-act="cal-connect"' + (cal.loading ? ' disabled' : '') + '>' + (cal.loading ? 'Asking…' : 'Show today’s calendar') + '</button>';
  } else if(cal.err && !cal.events){
    h += '<p class="cl-note">' + esc(FIX[cal.err] || 'Google Calendar didn’t answer (' + cal.err + ').') + '</p>' + (cal.err === 'blocked_by_policy' || cal.err === 'needs_reauth' || cal.err === 'server_not_connected' ? '' : '<button class="ghost small cl-btn" type="button" data-act="cal-connect">Try again</button>');
  } else if(cal.loading && !cal.events){
    h += '<p class="cl-note">Reading your calendar…</p>';
  } else if(cal.events && !cal.events.length){
    h += '<p class="cl-note">Nothing on the calendar today.</p>';
  } else if(cal.events){
    var now = Date.now(), allDay = cal.events.filter(function(e){ return e.allDay; }), timed = cal.events.filter(function(e){ return !e.allDay; });
    if(allDay.length) h += '<div class="cl-allday">' + allDay.map(function(e){ return '<span class="cl-chip">' + esc(e.title) + '</span>'; }).join('') + '</div>';
    var past = timed.filter(function(e){ return (e.en ? e.en.getTime() : e.s.getTime() + 1800000) <= now; });
    var live = timed.filter(function(e){ return e.s.getTime() <= now && (e.en ? e.en.getTime() : e.s.getTime() + 1800000) > now; });
    var next = timed.filter(function(e){ return e.s.getTime() > now; });
    h += '<div class="cl-list">';
    if(past.length) h += '<details class="cl-past"><summary>' + past.length + ' earlier</summary>' + past.map(function(e){ return row(e, 'past'); }).join('') + '</details>';
    h += live.map(function(e){ return row(e, 'live'); }).join('');
    h += next.slice(0, 6).map(function(e, i){ return row(e, i === 0 ? 'next' : ''); }).join('');
    if(next.length > 6) h += '<p class="cl-more">+ ' + (next.length - 6) + ' later</p>';
    h += '</div>';
  }
  el.innerHTML = h; el.hidden = false;
  function row(e, kind){
    var tag = kind === 'live' ? 'Now' : kind === 'next' ? leftText(e.s.getTime() - Date.now()) : '';
    return '<div class="cl-ev' + (kind ? ' is-' + kind : '') + '"><span class="cl-t">' + esc(clock(e.s)) + (e.en ? '<small>–' + esc(clock(e.en)) + '</small>' : '') + '</span><span class="cl-n">' + esc(e.title) + (e.loc ? '<small>' + esc(e.loc) + '</small>' : '') + '</span>' + (tag ? '<span class="cl-tag">' + esc(tag) + '</span>' : '') + '</div>';
  }
}
/* every 30 s: the now/next markers move; a new day re-registers the watch */
export function calTick(){ if(!cal.mcp) return; if(todayKey() !== cal.day) calWatch(); if(state.selected === todayKey()) renderCal(); }

/* ----- Add to Calendar, from the task sheet ----- */
function isoLocal(dt){ return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) + 'T' + pad(dt.getHours()) + ':' + pad(dt.getMinutes()) + ':00'; }
/* today: the next quarter hour from now; another day: the block's usual start */
export function taskStart(d, it){
  var base = parseKey(d);
  if(d === todayKey()){ var n = new Date(), m = Math.ceil((n.getHours()*60 + n.getMinutes() + 5)/15)*15; return new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(m/60), m % 60, 0, 0); }
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), it.block === 'pm' ? 14 : it.block === 'eve' ? 19 : 9, 0, 0, 0);
}
export function calAddTask(d, id, btn){
  var it = findTask(d, id); if(!it) return;
  if(!cal.mcp){ toast('Calendar isn’t available in this view.'); return; }
  if(it.cal){ toast('Already on your calendar.'); return; }
  if(cal.adding) return;
  var start = taskStart(d, it), end = new Date(start.getTime() + (it.est || 30)*60000);
  var input = {summary:it.title, startTime:isoLocal(start), endTime:isoLocal(end), description:'Game Of Life task · ' + it.lane + ' · Q' + it.q + (it.note ? '\n' + it.note : '')};
  cal.adding = true; if(btn){ btn.disabled = true; btn.textContent = 'Adding…'; }
  cal.mcp.callTool(CAL_SERVER, 'create_event', input).then(function(r){
    var p = r && r.payload && typeof r.payload === 'object' ? r.payload : {};
    updateTask(d, id, {cal:String(p.id || 'yes')});
    toast('On your calendar · ' + clock(start) + '–' + clock(end));
    if(btn){ btn.textContent = 'On calendar'; }
    try { if(cal.mcp.invalidate) cal.mcp.invalidate(CAL_SERVER, 'list_events'); } catch(e){}
  }).catch(function(e){
    var code = e && e.code || 'upstream_error';
    toast(code === 'approval_required' || code === 'consent_required' || code === 'not_in_manifest' ? 'Allow Google Calendar for this page first.' : code === 'tool_error' ? 'Google Calendar refused it: ' + String(e.message || '').slice(0, 80) : FIX[code] || 'Couldn’t reach Google Calendar. Try again.');
    if(btn){ btn.disabled = false; btn.textContent = 'Add to Calendar'; }
  }).then(function(){ cal.adding = false; });
}
