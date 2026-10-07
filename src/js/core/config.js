// Scoring rules, belts, the default habits and the nutrition/sleep targets. Numbers only.

/* ---------- scoring rules ---------- */
export var BASE_XP = 20, EXTRA_XP = 10, EXTRA_CAP = 3, SWEEP_XP = 30, SWEEP_STEP = 5, SWEEP_MAX = 80, LIGHT_XP = 10;
export var LS_KEY = 'dojo-log-v1';
export var COLOR_SLOTS = ['read','meditate','workout','money','sleep','x1','x2','x3'];
export var BELTS = [
  {name:'White',  fill:'#F4F4F0', tab:'#17181C', stitch:'rgba(0,0,0,.14)'},
  {name:'Blue',   fill:'#2356C0', tab:'#17181C', stitch:'rgba(255,255,255,.2)'},
  {name:'Purple', fill:'#6B3FB0', tab:'#17181C', stitch:'rgba(255,255,255,.2)'},
  {name:'Brown',  fill:'#6E4526', tab:'#17181C', stitch:'rgba(255,255,255,.18)'},
  {name:'Black',  fill:'#141417', tab:'#B3261E', stitch:'rgba(255,255,255,.14)'}
];

export var DEFAULT_SETTINGS = {
  version: 1,
  habits: [
    {id:'read', name:'Read', target:'25 minutes', color:'read', since:'2000-01-01', pauses:[], presets:['Extra reading session','Quran','Notes and review']},
    {id:'meditate', name:'Meditate', target:'5 minutes', color:'meditate', since:'2000-01-01', pauses:[], ladder:[5,10,15,20,25], unit:'minutes', presets:['Extra sit','Dhikr','Evening wind-down']},
    {id:'workout', name:'Train', target:'5 strength + 1 light a week \u00b7 1 full rest', color:'workout', since:'2000-01-01', pauses:[], restPerWeek:2, maxPerWeek:5, lightPerWeek:1, extraCap:1, presets:['Mobility and stretching','Easy walk']},
    {id:'money', name:'Money-producing work', target:'One focused income block', color:'money', since:'2000-01-01', pauses:[], presets:['Extra call block','Outreach push','Deal or proposal work']},
    {id:'sleep', name:'Bed on time', target:'In bed by 9:00 PM', color:'sleep', since:'2000-01-01', pauses:[], presets:['Screens off by 8:30','Phone out of the room','Up for Fajr, no snooze']},
    {id:'nicotine', name:'Nicotine-free', target:'Patch on, zero vaping', color:'x1', since:'2026-09-26', pauses:[], extraCap:0, presets:['Extra session']},
    {id:'eat', name:'Eat enough', target:'Hit your Cal AI calorie goal', color:'x2', since:'2026-09-28', pauses:[], extraCap:0, presets:['Extra session']},
    {id:'sunnah', name:'Sunnah prayers', target:'12 rawatib: Fajr 2, Dhuhr 4+2, Maghrib 2, Isha 2', color:'x3', since:'2026-10-01', pauses:[], presets:['Duha','4 before Asr','Tahajjud']}
  ],
  targets: null
};
export var DEFAULT_TARGETS = {cal:3274, pro:190, proMax:200, carb:430, fat:90, fib:38, sod:2300, lastMeal:'20:00', bed:'21:00', satBed:'00:00', trainPerWeek:6, strengthPerWeek:5, lightDays:1, restDays:1, ripMin:2, ripMax:3, goalWeight:170, startWeight:144};

