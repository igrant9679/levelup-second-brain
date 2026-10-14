// ═══════════════════════════════════════════════════════════════════════════
// LEVELUP COACH — the assistant as a personal/professional coach (build -211)
//
// Layers on top of app-agent.js (loads after it) and turns the assistant from
// a tool you have to drive into a coach that drives with you:
//   • MEMORY — D.prefs.coach.profile {fields, facts[]}. The model learns about
//     the user in every conversation through instant, silent tools (remember /
//     forget / set_profile) and the profile rides in every system prompt.
//   • INTERVIEW — a resumable get-to-know-you conversation over COACH_AREAS,
//     one question at a time with tappable options; ends by building a starter
//     structure (programs, projects, goals, habits, clusters).
//   • PLAYBOOKS — "Coach me on…" sessions (plan my day, prioritize, goals,
//     habits, ideas, organize my life, money, weekly review, check-in). A
//     session is a MODE (D.prefs.coach.mode) whose guide is appended to the
//     system prompt until it ends, is replaced, or goes stale.
//   • AUTONOMY — ask | auto | full, stored as the agent's own flags
//     (aiAgent.autoWrite / aiAgent.autoDelete) so there is one source of truth.
//     "full" lets deletes run without a card; every agent delete is snapshotted
//     into D.prefs.coach.trash so it can be restored after a reload too.
//
// Everything here wraps app-agent/part1/part2 functions by global
// reassignment (the same pattern app-agent.js uses on part2). app-agent.js is
// untouched apart from the autoDelete gate, so scripts/check-ai-agent.mjs
// still exercises the agent exactly as before.
// ═══════════════════════════════════════════════════════════════════════════

var COACH_AREAS=[
  {id:'basics',label:'You & your roles',learn:'what they do (every "hat": jobs, companies, side projects, family roles), what a typical week looks like, what they want LevelUp to help with most'},
  {id:'work',label:'Work & business',learn:'their organisations and responsibilities, the projects/programs in flight, who they work with, what is stuck or keeping them up at night'},
  {id:'goals',label:'Goals & ambitions',learn:'what they want in 90 days, 1 year and 3–5 years — career, business, personal, health, relationships, money — and why each matters'},
  {id:'life',label:'Life & people',learn:'family and key relationships, commitments outside work, what recharges them, what they want more or less of'},
  {id:'habits',label:'Health & habits',learn:'sleep, exercise, routines that work, habits they have tried and dropped, what they want to build or break'},
  {id:'money',label:'Money',learn:'their money goals (debt payoff, savings, investing, income targets), what stresses them about money, how hands-on they want to be. NEVER ask for account numbers or passwords.'},
  {id:'schedule',label:'Your day & energy',learn:'when they start and stop work, peak-energy hours, meeting load, when they want check-ins, weekends on or off'},
  {id:'style',label:'How to coach you',learn:'tone (gentle / direct / tough-love), how much to push, how they respond to reminders, what has made past coaching or tools fail them'}
];

var COACH_PLAYBOOKS=[
  {id:'interview',icon:'👋',title:'Get to know me',start:"Let's do the get-to-know-you interview.",
    guide:'(built at run time — see _coachInterviewGuide)'},
  {id:'plan_day',icon:'☀️',title:'Plan my day',start:'Coach me: plan my day.',
    guide:'GOAL: a realistic plan for today in under 3 minutes. 1) call status if you have not. 2) Look at overdue, due today, My Day, calendar events, capacity, habits pending, bills due. 3) Pick the ONE most important task and two supporting ones (fit them into free time; respect peak-energy hours from the profile), say why in one line each. 4) Act: put them in My Day, set priority High on the one, block time for it, and move anything that cannot fit to a sensible later date. 5) Name the first 25-minute step to start right now. Ask at most one question (e.g. "anything I don\'t know about today?").'},
  {id:'prioritize',icon:'🎯',title:'Prioritize my tasks',start:'Coach me: help me prioritize my tasks.',
    guide:'GOAL: a clean, honest priority order. 1) list open tasks (and overdue). 2) Sort them Eisenhower-style using the profile\'s goals and roles: do now / schedule / delegate / drop. 3) Act: set priorities, due dates and My Day for the "do now" ones; mark obvious dead items as Someday (do not delete unless the user says). 4) Show the top 5 with one-line reasons. 5) If several tasks are vague, ask which to clarify first.'},
  {id:'goals',icon:'🏔',title:'Set my goals',start:'Coach me: help me set my goals.',
    guide:'GOAL: 1–3 meaningful goals the user believes in. 1) Ask which life area matters most right now (options from the profile). 2) Turn the answer into a SMART goal: outcome, measure, deadline, why it matters — one question at a time. 3) Act: create the goal with a target and due date, 3 milestones as tasks, and the first next action in My Day. 4) Offer a weekly check-in habit for it. Remember the why with remember.'},
  {id:'habits',icon:'🔁',title:'Build the right habits',start:'Coach me: which habits should I build?',
    guide:'GOAL: 2–3 tiny habits that serve their goals. 1) Read goals, current habits and the profile (energy, schedule, past failures). 2) Recommend habits that are small (≤10 min), tied to an existing cue ("after coffee…"), and linked to a goal — explain the link in one line. 3) Act: create them with cadence and a target time; suggest retiring habits with long-broken streaks. 4) Ask how they want to be reminded.'},
  {id:'idea',icon:'💡',title:'Flesh out an idea',start:'Coach me: help me flesh out an idea.',
    guide:'GOAL: turn a rough idea into a decision. 1) Ask which idea (offer the latest sparks from the Ideas page, or "a new one"). 2) Ask, one at a time: the problem, who it is for, why now, what it would take, biggest risk. 3) Score it with ICE (impact/confidence/ease 1–10) and say what the score means. 4) Act: update or create the idea with the answers, a note capturing the thinking (or a mind map), and 1–3 next-step tasks if it is worth pursuing — or recommend parking it.'},
  {id:'organize',icon:'🗂',title:'Organize my life',start:'Coach me: help me organize my life into programs, projects and clusters.',
    guide:'GOAL: a structure where everything has a home. Model: PROGRAM = an area of responsibility / hat (a company, a role, family, health, finances); PROJECT = an outcome with an end inside a program; CLUSTER = a working group of tasks (a context or theme). 1) list programs, projects and clusters; read the profile\'s roles. 2) Propose the structure in one compact list (create what is missing, merge or rename duplicates, name projects with no next action). 3) Act: create programs and link their projects, create clusters, file loose tasks into projects/clusters (move_to_cluster, update_task project). 4) Finish with the 3 projects that need a next action and add one each.'},
  {id:'money',icon:'💰',title:'Money check-up',start:'Coach me: give me a money check-up.',
    guide:'GOAL: the user knows exactly where money stands and the 1–3 moves that matter. 1) status (money), report_data/list for bills, budgets, accounts, savings goals. 2) Report: this month spent vs income, budget categories over, bills due in 7 days, debt/savings progress vs their money goals in the profile. 3) Recommend concrete moves (pay X before Y, cut Z, raise a budget, add a savings goal). 4) Act on the bookkeeping parts (set budgets, add bills or savings goals, add a reminder task). Never move real money; this app only tracks it.'},
  {id:'weekly',icon:'🗓',title:'Weekly review',start:'Coach me through my weekly review.',
    guide:'GOAL: close the week and set up the next. Steps, one at a time, with a short summary of the data at each: 1) wins — what got done (done7d, goals moved); 2) loose ends — overdue and inbox; 3) goals and habits — on track or not; 4) money — the week in spending; 5) next week — pick 3 outcomes. Act as you go: reschedule, clear inbox items into projects, set next week\'s top 3 as tasks with dates, and a journal entry summarising the week.'},
  {id:'checkin',icon:'⏱',title:'Check in with me',start:'Coach me: quick check-in.',
    guide:'GOAL: a 60-second course correction. Ask what they are working on right now (offer their My Day tasks as options plus "something else"). Then: if they are on track, encourage and name the next step; if stuck, help unblock in one move (split the task, time-box, or switch); if drifting, bring them back to the one thing that matters today. Act on what they agree to (complete, reschedule, start a timer via block_time).'}
];

// ─── prefs ─────────────────────────────────────────────────────────────────
function _coachPrefs(){
  D.prefs=D.prefs||{};
  var c=D.prefs.coach;
  if(!c||typeof c!=='object')c=D.prefs.coach={};
  if(!c.profile||typeof c.profile!=='object')c.profile={};
  if(!Array.isArray(c.profile.facts))c.profile.facts=[];
  if(!c.profile.fields||typeof c.profile.fields!=='object')c.profile.fields={};
  if(!c.interview||typeof c.interview!=='object')c.interview={};
  if(!c.interview.done||typeof c.interview.done!=='object')c.interview.done={};
  if(!Array.isArray(c.trash))c.trash=[];
  return c;
}
function _coachSave(){try{save('prefs');}catch(_){}}
// Autonomy lives in the agent's own flags so the ⚙ popover and this stay in step.
function _coachAutonomy(){var p=(typeof _agentPrefs==='function')?_agentPrefs():{};return p.autoDelete?'full':(p.autoWrite?'auto':'ask');}
function coachSetAutonomy(level){
  var p=_agentPrefs();
  p.autoWrite=level!=='ask';
  p.autoDelete=level==='full';
  save('prefs');
  try{_coachRefreshUI();}catch(_){}
  toast('Coach autonomy: '+({ask:'asks before every change',auto:'does small things on its own',full:'fully autonomous'})[level]);
}
function _coachInterviewProgress(){var d=_coachPrefs().interview.done;var n=COACH_AREAS.filter(function(a){return d[a.id];}).length;return {done:n,total:COACH_AREAS.length,next:COACH_AREAS.find(function(a){return !d[a.id];})||null};}
function _coachFirstName(){var f=_coachPrefs().profile.fields;return (f.preferredName||((D.creds&&D.creds.userName)||'').split(' ')[0]||'');}

// Record the device timezone so the server's check-ins (next build) land at
// the user's local times. Client-owned: the server only ever reads it.
function _coachSyncTz(){
  try{var tz=Intl.DateTimeFormat().resolvedOptions().timeZone;var c=_coachPrefs();if(tz&&c.tz!==tz){c.tz=tz;_coachSave();}}catch(_){}
}

// ─── memory tools (instant + silent; listed apart from READ in the catalog) ─
var COACH_FACT_MAX=80, COACH_FACT_LEN=220;
function _coachNorm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();}
function _coachRemember(area,text){
  text=String(text||'').replace(/\s+/g,' ').trim();
  if(!text)return {ok:false,error:'Nothing to remember.'};
  if(/\b(password|passcode|pin|ssn|social security|account number|routing number|card number|cvv)\b/i.test(text))return {ok:false,error:'Not stored: never keep credentials or account numbers.'};
  if(text.length>COACH_FACT_LEN)text=text.slice(0,COACH_FACT_LEN-1)+'…';
  area=String(area||'').toLowerCase().trim();
  if(!COACH_AREAS.some(function(a){return a.id===area;}))area=area&&/^[a-z]{2,16}$/.test(area)?area:'basics';
  var p=_coachPrefs().profile;var n=_coachNorm(text);
  var dup=p.facts.find(function(f){var m=_coachNorm(f.text);return m===n||(n.length>20&&(m.indexOf(n)>=0||n.indexOf(m)>=0));});
  if(dup){dup.text=text.length>=dup.text.length?text:dup.text;dup.at=new Date().toISOString();dup.area=area;_coachSave();return {ok:true,summary:'Updated: '+dup.text};}
  p.facts.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,5),area:area,text:text,at:new Date().toISOString()});
  if(p.facts.length>COACH_FACT_MAX)p.facts=p.facts.slice(-COACH_FACT_MAX);
  _coachSave();
  return {ok:true,summary:'Noted: '+text};
}
function _coachForget(ref){
  var p=_coachPrefs().profile;var s=String(ref||'').trim();if(!s)return {ok:false,error:'Say which fact.'};
  var n=_coachNorm(s);var before=p.facts.length;
  p.facts=p.facts.filter(function(f){return f.id!==s&&_coachNorm(f.text).indexOf(n)<0;});
  var gone=before-p.facts.length;if(!gone)return {ok:false,error:'No remembered fact matches "'+s+'".'};
  _coachSave();return {ok:true,summary:'Forgot '+gone+' fact'+(gone===1?'':'s')};
}
var COACH_FIELDS={preferredName:'what to call them',roles:'their hats/roles',workHours:'e.g. 08:00-17:30',peakEnergy:'e.g. 07:00-11:00',tone:'gentle | direct | tough-love',checkins:'how often/when they want check-ins',focus:'their #1 focus right now',family:'household / key people',motto:'what drives them'};
function _coachSetField(field,value){
  field=String(field||'').trim();value=String(value==null?'':value).replace(/\s+/g,' ').trim();
  if(!/^[a-zA-Z][a-zA-Z0-9]{1,23}$/.test(field))return {ok:false,error:'Field must be a short camelCase name (e.g. '+Object.keys(COACH_FIELDS).slice(0,4).join(', ')+').'};
  var f=_coachPrefs().profile.fields;
  if(!value){delete f[field];_coachSave();return {ok:true,summary:'Cleared '+field};}
  if(Object.keys(f).length>=30&&!(field in f))return {ok:false,error:'Profile is full — reuse a field.'};
  f[field]=value.slice(0,300);_coachSave();
  return {ok:true,summary:field+' = '+f[field]};
}
function _coachMarkArea(area){
  var a=COACH_AREAS.find(function(x){return x.id===String(area||'').toLowerCase().trim();});
  if(!a)return {ok:false,error:'Unknown area. Areas: '+COACH_AREAS.map(function(x){return x.id;}).join(', ')};
  var c=_coachPrefs();c.interview.done[a.id]=new Date().toISOString();
  if(!c.interview.startedAt)c.interview.startedAt=new Date().toISOString();
  var pr=_coachInterviewProgress();
  if(!pr.next&&!c.interview.completedAt)c.interview.completedAt=new Date().toISOString();
  _coachSave();
  // no `data` here: data makes the agent loop take another model step
  var left=COACH_AREAS.filter(function(x){return !c.interview.done[x.id];}).map(function(x){return x.id;});
  return {ok:true,summary:'Interview: '+a.label+' done ('+pr.done+'/'+pr.total+(left.length?'; next: '+left.join(', '):'; all areas done')+')'};
}
function _coachEndSession(){var c=_coachPrefs();var was=c.mode&&c.mode.id;c.mode=null;_coachSave();try{_coachModeBar();}catch(_){}return {ok:true,summary:was?'Ended the '+_coachPlaybook(was).title+' session':'No session was running'};}

(function(){
  if(typeof LU_AGENT_TOOLS==='undefined')return;
  var add=[
    {name:'remember',kind:'read',memory:true,sig:'remember{area('+COACH_AREAS.map(function(a){return a.id;}).join('|')+'),fact}',desc:'Store one durable fact about the user (≤25 words, third person). Instant and silent.',
      run:function(a){return _coachRemember(a.area,a.fact||a.text);}},
    {name:'forget',kind:'read',memory:true,sig:'forget{fact}',desc:'Remove remembered facts matching the text (or a fact id).',
      run:function(a){return _coachForget(a.fact||a.id||a.text);}},
    {name:'set_profile',kind:'read',memory:true,sig:'set_profile{field('+Object.keys(COACH_FIELDS).join('|')+'|otherCamelCase),value}',desc:'Set a structured profile field ("" clears).',
      run:function(a){return _coachSetField(a.field,a.value);}},
    {name:'interview_done',kind:'read',memory:true,sig:'interview_done{area}',desc:'Mark a get-to-know-you area finished.',
      run:function(a){return _coachMarkArea(a.area);}},
    {name:'end_session',kind:'read',memory:true,sig:'end_session{}',desc:'End the current coaching session when its goal is met.',
      run:function(){return _coachEndSession();}}
  ];
  add.forEach(function(t){if(!LU_AGENT_TOOLS.some(function(x){return x.name===t.name;}))LU_AGENT_TOOLS.push(t);});
})();

// ─── persistent trash for agent deletes ────────────────────────────────────
var COACH_TRASH_MAX=25, COACH_TRASH_ITEM_MAX=60000;
function _coachListFor(ent){
  var f=null;try{f=typeof _agentFin==='function'?_agentFin():null;}catch(_){}
  var m={task:[D.tasks,'title','tasks'],note:[D.notes,'title','notes'],project:[D.projects,'name','projects'],program:[D.programs,'name','programs'],cluster:[D.clusters,'name','clusters'],goal:[D.goals,'title','goals'],habit:[D.habits,'title','habits'],idea:[D.ideas,'title','ideas'],journal:[D.journal,'title','journal'],contact:[D.contacts,'name','contacts'],opportunity:[D.opportunities,'name','opportunities'],mindmap:[D.mindmaps,'title','mindmaps'],
    event:[(typeof _calEvents!=='undefined'&&Array.isArray(_calEvents))?_calEvents:null,'title','cal'],bill:[f&&f.bills,'name','fin'],transaction:[f&&f.transactions,'payee','fin']};
  return m[ent]||null;
}
function _coachSaveList(key){
  if(key==='mindmaps'){if(typeof saveMindmaps==='function')saveMindmaps();}
  else if(key==='cal'){if(typeof _agentSaveCal==='function')_agentSaveCal();}
  else if(key==='fin'){if(typeof _agentFinSaveAll==='function')_agentFinSaveAll();}
  else save(key);
}
(function(){
  if(typeof _agentDelete!=='function')return;
  var orig=_agentDelete;
  window._agentDelete=function(a){
    var ent=String(a&&a.entity||'').toLowerCase();var spec=_coachListFor(ent);var snap=null;
    try{if(spec&&spec[0]){var r=_agentFind(spec[0],a.id,spec[1]);if(r&&r.item)snap=JSON.parse(JSON.stringify(r.item));}}catch(_){}
    var res=orig(a);
    if(res&&res.ok&&snap){
      try{var js=JSON.stringify(snap);if(js.length<=COACH_TRASH_ITEM_MAX){var c=_coachPrefs();c.trash.unshift({ent:ent,item:snap,at:new Date().toISOString(),label:String(snap.title||snap.name||snap.payee||ent)});c.trash=c.trash.slice(0,COACH_TRASH_MAX);_coachSave();res.summary+=' (restorable: Settings → AI Coach)';}}catch(_){}
    }
    return res;
  };
})();
function coachTrashRestore(i){
  var c=_coachPrefs();var t=c.trash[i];if(!t)return;
  var spec=_coachListFor(t.ent);if(!spec||!spec[0]){toast('Cannot restore that kind of item here.');return;}
  var list=spec[0];
  if(list.some(function(x){return String(x.id)===String(t.item.id);})){toast('It is already back.');}
  else{list.push(t.item);_coachSaveList(spec[2]);}
  c.trash.splice(i,1);_coachSave();
  try{renderScreen(curScreen);}catch(_){}
  _coachRenderSettings();
  toast('Restored '+t.ent+' "'+t.label+'"');
}

// ─── prompt: catalog + coach block ─────────────────────────────────────────
window._agentCatalog=function(){
  var groups={read:[],nav:[],write:[],destructive:[],memory:[]};
  LU_AGENT_TOOLS.forEach(function(t){(t.memory?groups.memory:groups[t.kind]).push(t.sig);});
  var auto=_coachAutonomy();
  return ['TOOLS — call as {"tool":"name","args":{...}}. Names/ids: any id field also accepts a name; the app resolves unique names and returns candidates when ambiguous (then ASK).',
    'READ (run instantly): '+groups.read.join(' · '),
    'NAVIGATE (instant): '+groups.nav.join(' · '),
    'MEMORY (instant, silent — use freely): '+groups.memory.join(' · '),
    'WRITE ('+(auto==='ask'?'the user approves each one':'RUN IMMEDIATELY — the user chose autonomous mode; every change is undoable')+'): '+groups.write.join(' · '),
    'DESTRUCTIVE ('+(auto==='full'?'runs immediately; recoverable from the assistant trash — still only delete what the user clearly wants gone':'always confirmed by the user')+'): '+groups.destructive.join(' · ')].join('\n');
};
function _coachPlaybook(id){return COACH_PLAYBOOKS.find(function(p){return p.id===id;})||null;}
function _coachInterviewGuide(){
  var d=_coachPrefs().interview.done;
  var rows=COACH_AREAS.map(function(a){return (d[a.id]?'[done] ':'[todo] ')+a.id+' — '+a.label+': learn '+a.learn;}).join('\n');
  var pr=_coachInterviewProgress();
  return 'GET-TO-KNOW-YOU INTERVIEW ('+pr.done+'/'+pr.total+' areas done). You are interviewing the user so you can coach them well. Rules:\n'+
    '- Ask ONE short question per reply, warm and specific, building on what they just said. Always give 3–5 tappable answer options in ask (plus they can type anything). Include "Skip this" as the last option.\n'+
    '- After every answer: remember each durable fact (one per call; and set_profile for structured ones like workHours, peakEnergy, tone, roles), then ask the next question. 2–4 questions per area is enough; do not interrogate.\n'+
    '- When an area is covered (or skipped), call interview_done for it and move to the next [todo] area, telling them where you are ("3 of 8 — now money").\n'+
    '- Resume at the first [todo] area. Never re-ask something already in PROFILE.\n'+
    '- When all areas are done: summarise what you learned in 5 bullets, then build their starter structure in ONE reply — programs for each hat, projects under them, 1–3 goals with a first milestone task, 2–3 tiny habits, and clusters for their working contexts (skip anything that already exists). Then call end_session and offer to plan their day.\n'+
    rows;
}
function _coachProfileText(max){
  var p=_coachPrefs().profile;var out=[];
  var fk=Object.keys(p.fields);if(fk.length)out.push(fk.map(function(k){return k+': '+p.fields[k];}).join(' · '));
  try{var cr=D.creds||{};var me=[];if(cr.jobTitle)me.push('job title: '+cr.jobTitle);if(cr.bio)me.push('bio/focus: '+String(cr.bio).slice(0,240));if(me.length)out.push(me.join(' · '));}catch(_){}
  var by={};p.facts.slice().reverse().forEach(function(f){(by[f.area]=by[f.area]||[]).push(f.text);});
  COACH_AREAS.map(function(a){return a.id;}).concat(Object.keys(by).filter(function(k){return !COACH_AREAS.some(function(a){return a.id===k;});})).forEach(function(k){if(by[k])out.push(k+': '+by[k].join(' | '));});
  var s=out.join('\n');
  return s.length>max?s.slice(0,max-1)+'…':s;
}
function _coachBlock(){
  var c=_coachPrefs();
  // sessions go stale after 6h of no use (the interview persists until done)
  if(c.mode&&c.mode.id!=='interview'&&c.mode.at&&Date.now()-c.mode.at>6*3600e3){c.mode=null;_coachSave();}
  var name=_coachFirstName()||'the user';var auto=_coachAutonomy();
  var pr=_coachInterviewProgress();
  var profile=_coachProfileText(2400);
  var lines=[
    'COACHING — you are '+name+'\'s personal and professional coach, not a passive tool. Warm, direct, brief; lead the conversation and decide when they are unsure.',
    '- LEARN CONSTANTLY: whenever they reveal something durable (roles, goals, preferences, constraints, people, schedule, money situation, what motivates or drains them), call remember — one fact per call — or set_profile. Never store passwords or account numbers.',
    '- PERSONALISE: ground every recommendation in PROFILE (their hats, goals, energy pattern, tone) and the live workspace data.',
    '- ONE THING AT A TIME: one question per reply, with 2–4 tappable options in ask.',
    '- DECIDE: when they ask what to work on, pick ONE task (or a top 3), one-line reason each, and act on it (My Day, priority, time block).',
    '- AUTONOMY = '+auto+': '+({ask:'propose actions; the user approves them.',auto:'carry out creates/edits immediately (undoable), then say what you did; deletes are confirmed by the user.',full:'carry out everything immediately, including deletes when clearly wanted, then report what you did in one line. Everything is undoable or restorable.'})[auto],
    'PROFILE — what you know about '+name+(profile?':\n'+profile:': nothing yet.')+(pr.done<pr.total?'\n(get-to-know-you interview '+pr.done+'/'+pr.total+'; if they seem lost or new, offer to finish it)':'')
  ];
  if(c.mode&&c.mode.id){
    var pb=_coachPlaybook(c.mode.id);
    if(pb)lines.push('ACTIVE SESSION — '+pb.title+' (call end_session when its goal is met):\n'+(pb.id==='interview'?_coachInterviewGuide():pb.guide));
  }
  return lines.join('\n');
}
(function(){
  if(typeof _agentSystemPrompt!=='function')return;
  var orig=_agentSystemPrompt;
  window._agentSystemPrompt=function(lastUserText){
    var block='';try{block=_coachBlock();}catch(e){console.warn('[coach] block failed',e);}
    if(!block)return orig(lastUserText);
    var cap=AGENT_SYS_MAX;
    var base;
    try{AGENT_SYS_MAX=Math.max(6000,cap-block.length-4);base=orig(lastUserText);}finally{AGENT_SYS_MAX=cap;}
    return _aiClampStr(base+'\n\n'+block,cap);
  };
})();

// ─── chat rendering: memory tools as one quiet line, not action cards ──────
(function(){
  if(typeof _agentRenderActions!=='function')return;
  var orig=_agentRenderActions;
  window._agentRenderActions=function(m,mi){
    if(!m||!Array.isArray(m.actions)||!m.actions.length)return orig(m,mi);
    var isMem=function(a){var t=_agentTool(a.tool);return !!(t&&t.memory);};
    var mem=m.actions.filter(isMem);
    if(!mem.length)return orig(m,mi);
    var rest=Object.assign({},m,{actions:m.actions.filter(function(a){return !isMem(a);})});
    var noted=mem.filter(function(a){return a.ok;}).map(function(a){return a.summary;});
    return orig(rest,mi)+(noted.length?'<div style="font-size:10.5px;color:var(--t3);margin-top:6px;line-height:1.4">🧠 '+esc(noted.join(' · '))+'</div>':'');
  };
})();
// _agentRenderAsk hides a question once any action ran — but memory saves ride
// along with nearly every interview question, so they must not count.
(function(){
  if(typeof _agentRenderAsk!=='function')return;
  var orig=_agentRenderAsk;
  window._agentRenderAsk=function(m){
    if(!m||!Array.isArray(m.actions)||!m.actions.length)return orig(m);
    var real=m.actions.filter(function(a){var t=_agentTool(a.tool);return !(t&&t.memory);});
    return orig(Object.assign({},m,{actions:real}));
  };
})();

// ─── sessions ──────────────────────────────────────────────────────────────
function coachStart(id){
  var pb=_coachPlaybook(id);if(!pb)return;
  var c=_coachPrefs();c.mode={id:id,at:Date.now(),since:new Date().toISOString()};
  if(id==='interview'&&!c.interview.startedAt)c.interview.startedAt=new Date().toISOString();
  _coachSave();
  var start=pb.start;
  if(id==='interview'&&_coachInterviewProgress().done>0)start="Let's continue the get-to-know-you interview.";
  luAgentAsk(start);
  setTimeout(_coachModeBar,350);
}
function coachEnd(){_coachEndSession();toast('Coaching session ended');}
// Keep the session alive while it is being used.
(function(){
  if(typeof _agentSend!=='function')return;
  var orig=_agentSend;
  window._agentSend=async function(text){
    var c=_coachPrefs();if(c.mode)c.mode.at=Date.now();
    var r=await orig(text);
    try{_coachModeBar();}catch(_){}
    return r;
  };
})();
(function(){
  if(typeof clearAIChat!=='function')return;
  var orig=clearAIChat;
  window.clearAIChat=function(){var r=orig.apply(this,arguments);try{var c=_coachPrefs();if(c.mode&&c.mode.id!=='interview'){c.mode=null;_coachSave();}_coachModeBar();}catch(_){}return r;};
})();
// A slim bar above the chat naming the running session.
function _coachModeBar(){
  var chat=document.getElementById('ai-chat');if(!chat)return;
  var bar=document.getElementById('coach-mode-bar');
  var c=_coachPrefs();var pb=c.mode&&_coachPlaybook(c.mode.id);
  if(!pb){if(bar)bar.remove();return;}
  if(!bar){bar=document.createElement('div');bar.id='coach-mode-bar';chat.parentNode.insertBefore(bar,chat);}
  var extra=pb.id==='interview'?(' · '+_coachInterviewProgress().done+'/'+COACH_AREAS.length):'';
  bar.style.cssText='display:flex;align-items:center;gap:8px;padding:6px 12px;font-size:11.5px;background:color-mix(in srgb,var(--ac) 12%,var(--s2));border-bottom:1px solid var(--bd1)';
  bar.innerHTML='<span>'+pb.icon+' Coaching: <b>'+esc(pb.title)+'</b>'+extra+'</span><button onclick="coachEnd()" style="margin-left:auto;background:transparent;border:1px solid var(--bd2);color:var(--t2);border-radius:6px;padding:1px 8px;font-size:10.5px;cursor:pointer">End session</button>';
}

// ─── suggestion chips + command palette ────────────────────────────────────
(function(){
  if(typeof _renderAISuggestions!=='function')return;
  var orig=_renderAISuggestions;
  window._renderAISuggestions=function(){
    orig();
    var el=document.getElementById('ai-suggestions');if(!el)return;
    var pr=_coachInterviewProgress();
    var picks=pr.done<pr.total?['interview','plan_day']:['plan_day','checkin'];
    var html=picks.map(function(id){var pb=_coachPlaybook(id);var t=id==='interview'&&pr.done?'Continue getting to know me':pb.title;return '<button onclick="coachStart(\''+id+'\')" style="border-color:color-mix(in srgb,var(--ac) 45%,var(--bd2))">'+pb.icon+' '+esc(t)+'</button>';}).join('');
    html+='<button onclick="coachMenu(event)">🧭 Coach me on…</button>';
    el.insertAdjacentHTML('afterbegin',html);
    try{_coachModeBar();}catch(_){}
  };
})();
function coachMenu(ev){
  if(ev)ev.stopPropagation();
  var ex=document.getElementById('coach-menu');if(ex){ex.remove();return;}
  var d=document.createElement('div');d.id='coach-menu';
  d.style.cssText='position:fixed;z-index:calc(var(--z-modal,1000) + 20);background:var(--s2);border:1px solid var(--bd2);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.35);padding:6px;min-width:230px';
  d.innerHTML=COACH_PLAYBOOKS.map(function(pb){return '<div onclick="document.getElementById(\'coach-menu\').remove();coachStart(\''+pb.id+'\')" style="padding:7px 10px;border-radius:6px;cursor:pointer;font-size:12.5px" onmouseover="this.style.background=\'var(--s3)\'" onmouseout="this.style.background=\'\'">'+pb.icon+' '+esc(pb.title)+'</div>';}).join('');
  document.body.appendChild(d);
  var r=(ev&&ev.target&&ev.target.getBoundingClientRect)?ev.target.getBoundingClientRect():{left:window.innerWidth/2-115,bottom:120,top:120};
  var h=d.offsetHeight,w=d.offsetWidth;
  var top=r.bottom+6;if(top+h>window.innerHeight-8)top=Math.max(8,r.top-h-6);
  d.style.top=top+'px';d.style.left=Math.max(8,Math.min(r.left,window.innerWidth-w-8))+'px';
  setTimeout(function(){document.addEventListener('click',function h(e){if(!d.contains(e.target)){d.remove();document.removeEventListener('click',h);}});},0);
}
(function(){
  if(typeof _cmdpActions!=='function')return;
  var orig=_cmdpActions;
  window._cmdpActions=function(){
    var list=orig();
    try{COACH_PLAYBOOKS.slice().reverse().forEach(function(pb){list.unshift({id:'coach-'+pb.id,group:'Coach',icon:pb.icon,title:'Coach: '+pb.title,run:function(){coachStart(pb.id);}});});}catch(_){}
    return list;
  };
})();

// ─── Coach page hero ───────────────────────────────────────────────────────
function _coachHeroHTML(){
  var pr=_coachInterviewProgress();var auto=_coachAutonomy();var c=_coachPrefs();
  var nFacts=c.profile.facts.length+Object.keys(c.profile.fields).length;
  var pct=Math.round(pr.done/pr.total*100);
  var primary=pr.done<pr.total
    ?'<button class="btn btn-p" style="height:34px;font-size:13px" onclick="coachStart(\'interview\')">👋 '+(pr.done?'Continue getting to know me':'Start: get to know me (5–10 min)')+'</button>'
    :'<button class="btn btn-p" style="height:34px;font-size:13px" onclick="coachStart(\'plan_day\')">☀️ Plan my day with me</button>';
  var chips=COACH_PLAYBOOKS.filter(function(p){return p.id!=='interview';}).map(function(pb){return '<button class="btn btn-s" style="height:28px;font-size:11.5px" onclick="coachStart(\''+pb.id+'\')">'+pb.icon+' '+esc(pb.title)+'</button>';}).join('');
  return '<div id="coach-hero" class="cd" style="margin-bottom:14px;padding:16px;border:1px solid color-mix(in srgb,var(--page-accent,var(--ac)) 40%,var(--bd2));background:color-mix(in srgb,var(--page-accent,var(--ac)) 7%,var(--s1))">'+
    '<div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap">'+
      '<div style="flex:1;min-width:240px">'+
        '<div style="font-size:16px;font-weight:700;margin-bottom:4px">🧭 Your AI coach</div>'+
        '<div style="font-size:12.5px;color:var(--t2);line-height:1.5;margin-bottom:10px">'+(pr.done<pr.total
          ?'I coach best when I know you. Answer a few questions — tap an option or type your own — and I\'ll set up your programs, projects, goals and habits, then help you run every day.'
          :'I know you now ('+nFacts+' things remembered). Ask me anything, or pick a session below — I\'ll decide with you and do the work.')+'</div>'+
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><div style="flex:1;max-width:260px;height:6px;border-radius:3px;background:var(--s3);overflow:hidden"><div style="width:'+pct+'%;height:100%;background:var(--page-accent,var(--ac))"></div></div><span style="font-size:11px;color:var(--t3)">Getting to know you: '+pr.done+'/'+pr.total+'</span></div>'+
        primary+
      '</div>'+
      '<div style="min-width:200px;font-size:11.5px;color:var(--t2)">'+
        '<div style="font-weight:600;margin-bottom:4px">How much should I do on my own?</div>'+
        ['ask','auto','full'].map(function(l){return '<label style="display:flex;gap:6px;align-items:flex-start;margin:3px 0;cursor:pointer"><input type="radio" name="coach-auto-hero" '+(auto===l?'checked':'')+' onchange="coachSetAutonomy(\''+l+'\')"><span>'+({ask:'Ask before every change',auto:'Do creates &amp; edits; ask before deleting',full:'Fully autonomous (undo anything)'})[l]+'</span></label>';}).join('')+
        '<div style="margin-top:6px"><a href="#" onclick="event.preventDefault();coachOpenSettings()" style="color:var(--ac)">What I know about you ('+nFacts+') →</a></div>'+
      '</div>'+
    '</div>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid var(--bd1)"><span style="font-size:11px;color:var(--t3);align-self:center;margin-right:2px">Coach me on:</span>'+chips+'</div>'+
  '</div>';
}
function _coachInjectHero(){
  var main=document.getElementById('coach-main');if(!main)return;
  var old=document.getElementById('coach-hero');if(old)old.remove();
  var tmp=document.createElement('div');tmp.innerHTML=_coachHeroHTML();var hero=tmp.firstChild;
  var head=main.querySelector('.ph-r,.pg-h');
  if(head&&head.parentNode===main)head.insertAdjacentElement('afterend',hero);else main.insertBefore(hero,main.firstChild);
}
(function(){
  if(typeof renderCoach!=='function')return;
  var orig=renderCoach;
  window.renderCoach=function(){var r=orig.apply(this,arguments);try{_coachInjectHero();}catch(e){console.warn('[coach] hero failed',e);}return r;};
})();
// One coach, not two: the Coach page's older "Talk to your coach" box (ai.assist,
// no memory, no actions) now hands its message to the agent-backed coach.
(function(){
  if(typeof aiCoachChatSend!=='function')return;
  window.aiCoachChatSend=function(){
    var inp=document.getElementById('coach-chat-input');if(!inp)return;
    var text=(inp.value||'').trim();if(!text)return;
    inp.value='';
    luAgentAsk(text);
  };
})();
function _coachRefreshUI(){
  if(document.getElementById('coach-hero'))_coachInjectHero();
  if(document.getElementById('coach-settings-body'))_coachRenderSettings();
}

// ─── Settings → AI Coach (sp-15) ───────────────────────────────────────────
function coachOpenSettings(){
  nav('settings');
  // Settings re-renders once after nav; keep re-selecting the tab until it sticks.
  var tries=0;
  (function pick(){
    tries++;
    var panel=document.getElementById('sp-15');
    var el=[].slice.call(document.querySelectorAll('#settings-main .si')).find(function(x){return /AI Coach/.test(x.textContent);});
    if(el&&panel&&panel.style.display==='none')showSetTab(el,'sp-15');
    if(tries<12)setTimeout(pick,150);
  })();
}
function _coachRenderSettings(){
  var body=document.getElementById('coach-settings-body');if(!body)return;
  var c=_coachPrefs();var auto=_coachAutonomy();var pr=_coachInterviewProgress();
  var card=function(title,inner,sub){return '<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px 14px;margin-bottom:12px"><div style="font-size:13px;font-weight:650;margin-bottom:'+(sub?'2':'8')+'px">'+title+'</div>'+(sub?'<div style="font-size:11.5px;color:var(--t3);margin-bottom:8px">'+sub+'</div>':'')+inner+'</div>';};
  var autoHtml=['ask','auto','full'].map(function(l){return '<label style="display:flex;gap:8px;align-items:flex-start;margin:5px 0;cursor:pointer;font-size:12.5px"><input type="radio" name="coach-auto" '+(auto===l?'checked':'')+' onchange="coachSetAutonomy(\''+l+'\')"><span><b>'+({ask:'Ask first',auto:'Small things on its own',full:'Fully autonomous'})[l]+'</b><br><span style="color:var(--t3);font-size:11.5px">'+({ask:'Every create, edit and delete waits for your approval.',auto:'Creates and edits happen immediately (undoable). Deletes still ask.',full:'Everything happens immediately, deletes included. Deleted items land in the trash below and can be restored.'})[l]+'</span></span></label>';}).join('');
  var fields=c.profile.fields;var fk=Object.keys(fields);
  var fieldsHtml=fk.length?fk.map(function(k){return '<div style="display:flex;gap:8px;align-items:center;font-size:12px;padding:3px 0"><span style="color:var(--t3);min-width:110px">'+esc(k)+'</span><span style="flex:1">'+esc(fields[k])+'</span><button class="btn btn-s" style="height:22px;font-size:10.5px;padding:0 7px" onclick="_coachSetField(\''+k+'\',\'\');_coachRenderSettings()">✕</button></div>';}).join(''):'';
  var by={};c.profile.facts.forEach(function(f){(by[f.area]=by[f.area]||[]).push(f);});
  var factsHtml=Object.keys(by).length?Object.keys(by).map(function(a){var lab=(COACH_AREAS.find(function(x){return x.id===a;})||{label:a}).label;
    return '<div style="margin:8px 0 2px;font-size:10.5px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px">'+esc(lab)+'</div>'+by[a].slice().reverse().map(function(f){return '<div style="display:flex;gap:8px;align-items:flex-start;font-size:12px;padding:3px 0"><span style="flex:1;line-height:1.4">'+esc(f.text)+'</span><button class="btn btn-s" style="height:22px;font-size:10.5px;padding:0 7px;flex:none" title="Forget this" onclick="_coachForget(\''+f.id+'\');_coachRenderSettings()">✕</button></div>';}).join('');}).join('')
    :'<div style="font-size:12px;color:var(--t3)">Nothing yet. The coach learns as you talk to it — or run the interview.</div>';
  var addHtml='<div style="display:flex;gap:6px;margin-top:10px"><select id="coach-add-area" class="inp" style="height:28px;font-size:12px;max-width:150px">'+COACH_AREAS.map(function(a){return '<option value="'+a.id+'">'+esc(a.label)+'</option>';}).join('')+'</select><input id="coach-add-fact" class="inp" style="height:28px;font-size:12px;flex:1" placeholder="Tell the coach something about you…" onkeydown="if(event.key===\'Enter\')coachAddFact()"><button class="btn btn-p" style="height:28px;font-size:11.5px" onclick="coachAddFact()">Add</button></div>';
  var intHtml='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">'+COACH_AREAS.map(function(a){var d=c.interview.done[a.id];return '<span style="font-size:11px;padding:3px 8px;border-radius:10px;background:'+(d?'color-mix(in srgb,#10b981 18%,var(--s3))':'var(--s3)')+';color:'+(d?'#10b981':'var(--t2)')+'">'+(d?'✓ ':'')+esc(a.label)+'</span>';}).join('')+'</div>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-p" style="height:28px;font-size:11.5px" onclick="coachStart(\'interview\')">'+(pr.done?(pr.done<pr.total?'Continue the interview':'Talk it through again'):'Start the interview')+'</button>'+(pr.done?'<button class="btn btn-s" style="height:28px;font-size:11.5px" onclick="coachResetInterview()">Restart from scratch</button>':'')+'</div>';
  var trashHtml=c.trash.length?c.trash.map(function(t,i){return '<div style="display:flex;gap:8px;align-items:center;font-size:12px;padding:3px 0"><span style="color:var(--t3);min-width:80px">'+esc(t.ent)+'</span><span style="flex:1">'+esc(t.label)+'</span><span style="color:var(--t3);font-size:11px">'+esc(String(t.at).slice(0,10))+'</span><button class="btn btn-s" style="height:22px;font-size:10.5px;padding:0 8px" onclick="coachTrashRestore('+i+')">Restore</button></div>';}).join('')
    :'<div style="font-size:12px;color:var(--t3)">Nothing deleted by the assistant.</div>';
  body.innerHTML=
    card('🤖 How much the coach does on its own',autoHtml)+
    card('👋 Get-to-know-you interview',intHtml,pr.done+' of '+pr.total+' areas covered. The coach resumes where you left off.')+
    card('🧠 What the coach knows about you',(fieldsHtml?'<div style="margin-bottom:8px">'+fieldsHtml+'</div>':'')+factsHtml+addHtml+(c.profile.facts.length||fk.length?'<div style="margin-top:10px"><button class="btn btn-d" style="height:26px;font-size:11px" onclick="coachForgetAll()">Forget everything</button></div>':''),'Used in every conversation. Remove anything that is wrong or private.')+
    card('🗑 Deleted by the assistant',trashHtml,'The last '+COACH_TRASH_MAX+' items the assistant deleted — restore any of them.')+
    card('🔔 Check-ins through the day','<div style="font-size:12px;color:var(--t3)">Coming in the next build: morning plan, mid-morning nudge, midday check-in, afternoon re-prioritize and end-of-day review — by in-app message, email and phone push, each switchable.</div>');
}
function coachAddFact(){var inp=document.getElementById('coach-add-fact');var area=document.getElementById('coach-add-area');if(!inp||!inp.value.trim())return;var r=_coachRemember(area&&area.value,inp.value);if(!r.ok)toast(r.error);inp.value='';_coachRenderSettings();}
function coachForgetAll(){if(!confirm('Forget everything the coach knows about you? This cannot be undone.'))return;var c=_coachPrefs();c.profile={facts:[],fields:{}};_coachSave();_coachRenderSettings();toast('The coach has forgotten everything');}
function coachResetInterview(){if(!confirm('Restart the interview from the first question? What the coach already knows stays (remove facts below if you want).'))return;var c=_coachPrefs();c.interview={done:{}};_coachSave();_coachRenderSettings();}
(function(){
  if(typeof showSetTab!=='function')return;
  var orig=showSetTab;
  window.showSetTab=function(el,id){var r=orig.apply(this,arguments);if(id==='sp-15')_coachRenderSettings();return r;};
})();

// ─── a gentle nudge for people who have not met the coach yet ──────────────
function _coachBootNudge(){
  try{
    var c=_coachPrefs();var pr=_coachInterviewProgress();
    if(pr.done>0||c.nudgeDismissed)return;
    var wiz=document.getElementById('lu-wiz-ov'); // the setup wizard goes first
    if(wiz&&wiz.offsetParent!==null){setTimeout(_coachBootNudge,60000);return;}
    var today=typeof _ymd==='function'?_ymd(new Date()):new Date().toISOString().slice(0,10);
    if(c.nudgedOn===today)return;
    c.nudgedOn=today;_coachSave();
    toast({type:'info',title:'🧭 Meet your AI coach',msg:'A few quick questions and it will organise your life, plan your days and keep you on track.',duration:15000,
      actions:[{label:'Let\'s start',primary:true,onClick:function(){coachStart('interview');}},{label:'Not now',onClick:function(){}},{label:'Don\'t ask again',onClick:function(){_coachPrefs().nudgeDismissed=true;_coachSave();}}]});
  }catch(_){}
}

// boot — only AFTER the server's prefs have loaded: saving prefs earlier would
// push this device's defaults over the account's real prefs.
(function(){
  if(typeof loadServerData!=='function')return;
  var orig=loadServerData;var nudged=false;
  window.loadServerData=async function(){
    var r=await orig.apply(this,arguments);
    try{_coachSyncTz();if(!nudged){nudged=true;setTimeout(_coachBootNudge,8000);}}catch(_){}
    return r;
  };
})();
try{if(window.luAgent)window.luAgent.systemPrompt=window._agentSystemPrompt;}catch(_){}
window.luCoach={start:coachStart,end:coachEnd,prefs:_coachPrefs,block:_coachBlock,remember:_coachRemember,areas:COACH_AREAS,playbooks:COACH_PLAYBOOKS,autonomy:_coachAutonomy};
