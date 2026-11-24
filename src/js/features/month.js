// Month view on Headquarters (Nov 24, 2026): tapping the week strip (its title or any day) expands it in place into a
// WHOOP-style month. Every day's number is colored by habits missed (Mustafa's rule): green = clean sweep, yellow = 1-3
// missed, red = 4+ missed. Logged rests and passes count as done, same as the sweep. Today stays neutral until it is
// earned (a clean sweep) or over. Monday-first, so each row is one tracker week. The arrows page from the first logged month to the month of the
// furthest plannable day (the week arrows' reach); a day selects it and folds back to its week; the title folds back.
import { addDays, esc, fmtWd, mondayOf, pad, todayKey } from '../core/utils.js';
import { state } from '../core/state.js';
import { ICON } from '../core/svg.js';

export var month = {open:false, shown:null}; // shown: the 'YYYY-MM' on screen while open

/* green = clean sweep, yellow = 1-3 habits missed, red = 4+ missed ('' = no habits that day) */
export function dayBand(b){
  if(!b || !b.total) return '';
  if(b.sweep) return 'green';
  return b.total - b.done <= 3 ? 'yellow' : 'red';
}
function monthOf(d){ return d.slice(0, 7); }
function addMonths(mk, n){ var y = +mk.slice(0, 4), m = +mk.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + pad(m + 1); }
/* the week arrows reach 4 weeks ahead (tasks can be planned there); this is that week's Sunday */
export function planLimit(){ return addDays(mondayOf(todayKey()), 34); }
function bounds(){
  var today = todayKey(), start = state.stats && state.stats.start;
  return {first:monthOf(start && start < today ? start : today), last:monthOf(planLimit())};
}
function clamp(mk){ var b = bounds(); return mk < b.first ? b.first : mk > b.last ? b.last : mk; }
export function openMonth(){ month.shown = clamp(monthOf(state.selected)); month.open = true; }
export function closeMonth(){ month.open = false; }
export function stepMonth(n){
  var next = addMonths(clamp(month.shown || monthOf(state.selected)), n), b = bounds();
  if(next < b.first || next > b.last) return false;
  month.shown = next; return true;
}
export function pickDay(d){ state.selected = d; state.weekOf = mondayOf(d); month.open = false; }

function openTasks(d){ return state.tasks[d] ? state.tasks[d].items.filter(function(x){ return !x.rolledTo && !x.droppedAt; }).length : 0; }
export function monthHTML(){
  var st = state.stats, today = todayKey(), lim = planLimit(), b = bounds(), mk = clamp(month.shown || monthOf(state.selected));
  var start = st.start && st.start < today ? st.start : today;
  var y = +mk.slice(0, 4), m = +mk.slice(5, 7) - 1, days = new Date(y, m + 1, 0).getDate();
  var lead = (new Date(y, m, 1).getDay() + 6) % 7; // Monday-first
  var cells = '', sweeps = 0;
  for(var i = 0; i < lead; i++) cells += '<span class="mc-d mc-pad" aria-hidden="true"></span>';
  for(var day = 1; day <= days; day++){
    var d = mk + '-' + pad(day), cls = 'mc-d' + (d === today ? ' is-today' : '') + (d === state.selected ? ' is-sel' : '');
    var cur = d === today ? ' aria-current="date"' : '';
    if(d < start || d > lim){ cells += '<span class="' + cls + ' is-off">' + day + '</span>'; continue; }
    if(d > today){ // plannable: tasks only, habits unlock on the day
      var tk = openTasks(d);
      cells += '<button type="button" class="' + cls + ' is-fut' + (tk ? ' has-plan' : '') + '" data-act="mv-day" data-d="' + d + '" aria-label="' + esc(fmtWd(d) + (tk ? ', ' + tk + ' planned' : ', plan ahead')) + '">' + day + '</button>';
      continue;
    }
    var bd = st.byDate[d], band = dayBand(bd);
    if(!band){ cells += '<span class="' + cls + ' is-off"' + cur + '>' + day + '</span>'; continue; } // no active habits that day
    if(bd.sweep) sweeps++;
    var miss = bd.total - bd.done, live = d === today && !bd.sweep; // today stays neutral until it's earned or over
    cells += '<button type="button" class="' + cls + (live ? '' : ' b-' + band) + '" data-act="mv-day" data-d="' + d + '"' + cur +
      ' aria-label="' + esc(fmtWd(d) + ': ' + (bd.sweep ? 'clean sweep' : live ? bd.done + ' of ' + bd.total + ' habits so far' : miss + (miss === 1 ? ' habit' : ' habits') + ' missed')) + '">' + day + '</button>';
  }
  var label = new Date(y, m, 1).toLocaleDateString('en-US', {month:'long', year:'numeric'});
  return '<div class="week-head">' +
    '<button class="arrow" type="button" data-act="mv-prev" aria-label="Previous month"' + (mk <= b.first ? ' disabled' : '') + '><svg viewBox="0 0 24 24">' + ICON.left + '</svg></button>' +
    '<button class="t week-title" type="button" data-act="month-close" aria-expanded="true" aria-label="' + esc(label + '. Close the month view') + '">' + esc(label) +
      '<span>' + (mk > monthOf(today) ? 'plan ahead' : sweeps === 1 ? '1 sweep' : sweeps + ' sweeps') + '</span><svg class="wchev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button>' +
    '<button class="arrow" type="button" data-act="mv-next" aria-label="Next month"' + (mk >= b.last ? ' disabled' : '') + '><svg viewBox="0 0 24 24">' + ICON.right + '</svg></button></div>' +
    '<div class="mc-grid"><span class="mc-wd">Mon</span><span class="mc-wd">Tue</span><span class="mc-wd">Wed</span><span class="mc-wd">Thu</span><span class="mc-wd">Fri</span><span class="mc-wd">Sat</span><span class="mc-wd">Sun</span>' + cells + '</div>' +
    '<div class="mc-legend"><span><i class="b-green"></i>Clean sweep</span><span><i class="b-yellow"></i>Missed 1–3</span><span><i class="b-red"></i>Missed 4+</span></div>';
}
