// ═══════════════════════════════════════════════════════════════════════════
// LEVELUP AGENT — the assistant that can DO things (build -196)
//
// Turns the AI chat panel (Cmd/Ctrl+J, the ⚡ button, the topbar ✨ menu) into
// an agent that creates, edits, links and reports on every entity in the app,
// asks clarifying questions, walks through multi-step setups, and answers
// "what should I do next?" from the real state of the workspace.
//
// HOW IT WORKS
//   • The model replies with ONE JSON object: {say, actions[], ask, next}.
//     `say` is rendered as the reply; `actions` are proposals executed through
//     the app's own mutation paths (same shapes doFASave / finSaveTx / mmCreate
//     produce); `ask` renders clickable options; `next:"continue"` lets the
//     model take another step after seeing the tool results.
//   • Reads and navigation run instantly. Writes show a confirmation card
//     unless the user turned on "just do it" (D.prefs.aiAgent.autoWrite).
//     Deletes ALWAYS confirm. Every write is undoable for the session.
//   • Names are accepted wherever an id is expected; ambiguity comes back to
//     the model as candidates so it asks instead of guessing.
//   • Server side is ai.agent (real multi-turn messages, 16k system cap). If
//     that procedure is missing (deploy skew) the panel falls back to the
//     older ai.assist answer-only path, so the chat never goes dark.
//
// This file loads AFTER app-part1/2 and overrides three of part2's chat
// functions by global reassignment (sendAIMsg, _renderAIChatHistory,
// _renderAISuggestions) — the same pattern renderScreen already uses.
// The originals stay in part2 untouched, so the prompt-budget guards that
// extract them keep passing.
// ═══════════════════════════════════════════════════════════════════════════

var AGENT_SYS_MAX=15000;     // headroom under ai.agent's 16000
var AGENT_TURN_MAX=2500;     // one transcript turn
var AGENT_MAX_TURNS=16;      // transcript turns sent to the model
var AGENT_TOOLRES_MAX=2600;  // tool results relayed per step
var AGENT_MAX_STEPS=6;       // model→tools→model loops per user message
var _agentBusy=false;
var _agentWaiter=null;       // {mi,resolve} while a confirmation card is open
var _agentUndoStack=[];
var _agentUndoSeq=0;

// ─── CSS (JS-injected, per the house rule: never index.html <style>) ───────
function _luAgentCSS(){
  if(document.getElementById('lu-agent-css'))return;
  var s=document.createElement('style');s.id='lu-agent-css';
  s.textContent=[
  '.agent-card{margin:8px 0 2px;border:1px solid var(--bd2);border-radius:10px;background:var(--s1);overflow:hidden;font-size:12px;max-width:100%}',
  '.agent-card-h{display:flex;align-items:center;gap:8px;padding:8px 10px;background:color-mix(in srgb,var(--ac) 10%,var(--s2));border-bottom:1px solid var(--bd1);font-weight:650}',
  '.agent-card-h small{font-weight:400;color:var(--t3);margin-left:auto}',
  '.agent-act{display:flex;align-items:flex-start;gap:8px;padding:7px 10px;border-bottom:1px solid var(--bd1)}',
  '.agent-act:last-child{border-bottom:none}',
  '.agent-act input[type=checkbox]{margin-top:2px;flex:none}',
  '.agent-act .k{flex:none;font-size:10px;padding:1px 6px;border-radius:8px;background:var(--s3);color:var(--t2);white-space:nowrap;margin-top:1px}',
  '.agent-act .k.destructive{background:color-mix(in srgb,#ef4444 18%,var(--s3));color:#ef4444}',
  '.agent-act .k.nav,.agent-act .k.read{background:color-mix(in srgb,#3b82f6 14%,var(--s3));color:#60a5fa}',
  '.agent-act .d{flex:1;min-width:0;line-height:1.4;word-break:break-word}',
  '.agent-act .d small{display:block;color:var(--t3);font-size:11px}',
  '.agent-act .st{flex:none;font-size:11px;white-space:nowrap;display:flex;gap:6px;align-items:center}',
  '.agent-act .st .ok{color:#10b981}.agent-act .st .err{color:#ef4444}',
  '.agent-act .st button{background:transparent;border:1px solid var(--bd2);color:var(--t2);border-radius:6px;padding:1px 7px;font-size:10px;cursor:pointer}',
  '.agent-act .st button:hover{color:var(--t1);border-color:var(--ac)}',
  '.agent-card-f{display:flex;gap:6px;padding:8px 10px;background:var(--s2);border-top:1px solid var(--bd1);align-items:center;flex-wrap:wrap}',
  '.agent-card-f .btn{height:26px;font-size:11px;white-space:normal;line-height:1.3}',
  '.agent-card-f label{font-size:10.5px;color:var(--t3);display:flex;align-items:center;gap:4px;margin-left:auto;cursor:pointer}',
  '.agent-ask{margin-top:8px;display:flex;flex-wrap:wrap;gap:5px}',
  '.agent-ask button{background:color-mix(in srgb,var(--ac) 12%,var(--s2));border:1px solid color-mix(in srgb,var(--ac) 40%,var(--bd2));color:var(--t1);padding:5px 10px;border-radius:14px;font-size:11px;cursor:pointer;text-align:left;white-space:normal;line-height:1.3}',
  '.agent-ask button:hover{background:color-mix(in srgb,var(--ac) 22%,var(--s2))}',
  '.agent-step{align-self:center;font-size:10.5px;color:var(--t3);padding:2px 10px;border-radius:10px;background:var(--s2);border:1px dashed var(--bd1)}',
  '.agent-cfg{position:absolute;right:12px;top:52px;background:var(--s2);border:1px solid var(--bd2);border-radius:10px;padding:10px 12px;z-index:5;box-shadow:0 10px 32px rgba(0,0,0,.35);font-size:11.5px;min-width:230px}',
  '.agent-cfg label{display:flex;gap:8px;align-items:flex-start;margin:6px 0;cursor:pointer;line-height:1.35}',
  '.agent-cfg label input{margin-top:2px}',
  '.agent-cfg small{color:var(--t3)}',
  '.ai-chat-msg.bot .agent-say p:last-child{margin-bottom:0}',
  '.ai-chat-msg.tool{align-self:center;background:transparent;border:none;color:var(--t3);font-size:10.5px;padding:0;max-width:100%}',
  '@media (max-width:560px){.agent-act{flex-wrap:wrap}.agent-act .st{width:100%;justify-content:flex-end}}'
  ].join('\n');
  document.head.appendChild(s);
}

// ─── prefs ─────────────────────────────────────────────────────────────────
function _agentPrefs(){
  D.prefs=D.prefs||{};
  D.prefs.aiAgent=D.prefs.aiAgent||{};
  return D.prefs.aiAgent;
}
function _agentSetPref(k,v){_agentPrefs()[k]=v;save('prefs');}

// ─── small utilities ───────────────────────────────────────────────────────
function _agentToday(){return typeof _ymd==='function'?_ymd(new Date()):new Date().toISOString().slice(0,10);}
function _agentUser(){return (D.creds&&D.creds.userName)||'Me';}
function _agentStr(v,max){v=v==null?'':String(v);return max&&v.length>max?v.slice(0,max-1)+'…':v;}
function _agentNum(v,dflt){var n=parseFloat(v);return isNaN(n)?dflt:n;}
function _agentArr(v){if(Array.isArray(v))return v;if(v==null||v==='')return [];return String(v).split(/[,\n;]+/).map(function(s){return s.trim();}).filter(Boolean);}
// Accepts ISO dates plus the words people actually type. The model is told
// today's date and asked for ISO, so this is the safety net, not the plan.
function _agentDate(s){
  if(s==null||s==='')return '';
  if(typeof s==='number')s=String(s);
  s=String(s).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  var lo=s.toLowerCase(),d=new Date();d.setHours(12,0,0,0);
  var add=function(n){d.setDate(d.getDate()+n);return _ymd(d);};
  if(lo==='today'||lo==='now')return add(0);
  if(lo==='tomorrow')return add(1);
  if(lo==='yesterday')return add(-1);
  var m=lo.match(/^in (\d+) (day|week|month)s?$/);
  if(m){var n=parseInt(m[1],10);if(m[2]==='day')return add(n);if(m[2]==='week')return add(n*7);d.setMonth(d.getMonth()+n);return _ymd(d);}
  var days=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  var dm=lo.match(/^(next |this )?(sun|mon|tue|wed|thu|fri|sat)[a-z]*$/);
  if(dm){var target=days.findIndex(function(x){return x.indexOf(dm[2])===0;});var diff=(target-d.getDay()+7)%7;if(diff===0||dm[1]==='next ')diff+=diff===0?7:0;if(dm[1]==='next '&&diff<7)diff+=0;return add(diff||7);}
  if(lo==='next week')return add(7);
  if(lo==='end of week'||lo==='eow'){var f=(5-d.getDay()+7)%7;return add(f);}
  if(lo==='end of month'||lo==='eom'){d.setMonth(d.getMonth()+1,0);return _ymd(d);}
  var p=new Date(s);if(!isNaN(p.getTime()))return _ymd(p);
  return '';
}
function _agentTime(s){
  if(!s)return '';s=String(s).trim().toLowerCase();
  var m=s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if(!m)return /^\d{2}:\d{2}$/.test(s)?s:'';
  var h=parseInt(m[1],10),mi=m[2]?parseInt(m[2],10):0;
  if(m[3]==='pm'&&h<12)h+=12;if(m[3]==='am'&&h===12)h=0;
  return String(h).padStart(2,'0')+':'+String(mi).padStart(2,'0');
}
// Resolve an id OR a name against a list. Unique → item; several → candidates
// (the model asks); none → missing. This is what keeps "mark the auth task
// done" from silently touching the wrong task.
function _agentFind(list,ref,key){
  list=list||[];key=key||'title';
  if(ref==null||ref==='')return {missing:true};
  var s=String(ref).trim();
  var byId=list.find(function(x){return String(x.id)===s;});
  if(byId)return {item:byId};
  var lo=s.toLowerCase();
  var exact=list.filter(function(x){return String(x[key]||x.name||x.title||'').toLowerCase()===lo;});
  if(exact.length===1)return {item:exact[0]};
  var part=list.filter(function(x){return String(x[key]||x.name||x.title||'').toLowerCase().indexOf(lo)>=0;});
  if(part.length===1)return {item:part[0]};
  if(part.length>1)return {ambiguous:part.slice(0,6).map(function(x){return {id:x.id,name:x[key]||x.name||x.title};})};
  // last resort: every query word present
  var words=lo.split(/\s+/).filter(function(w){return w.length>2;});
  if(words.length>1){
    var loose=list.filter(function(x){var n=String(x[key]||x.name||x.title||'').toLowerCase();return words.every(function(w){return n.indexOf(w)>=0;});});
    if(loose.length===1)return {item:loose[0]};
    if(loose.length>1)return {ambiguous:loose.slice(0,6).map(function(x){return {id:x.id,name:x[key]||x.name||x.title};})};
  }
  return {missing:true};
}
function _agentNeed(res,what){
  if(res.item)return null;
  if(res.ambiguous)return {ok:false,error:'Several '+what+' match — which one?',candidates:res.ambiguous};
  return {ok:false,error:'No '+what+' found by that id or name.'};
}
function _agentRerender(){
  try{if(typeof updateSidebarBadges==='function')updateSidebarBadges();}catch(_){}
  try{if(typeof invalidateSearchIndex==='function')invalidateSearchIndex();}catch(_){}
  try{if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);}catch(_){}
}
function _agentPushUndo(label,fn){
  var id=++_agentUndoSeq;
  _agentUndoStack.push({id:id,label:label,fn:fn});
  if(_agentUndoStack.length>40)_agentUndoStack.shift();
  return id;
}
function _agentUndoById(id){
  var i=_agentUndoStack.findIndex(function(u){return u.id===id;});
  if(i<0){toast('Nothing to undo — that change was already reverted.');return false;}
  var u=_agentUndoStack.splice(i,1)[0];
  try{u.fn();_agentRerender();toast('↶ Undone: '+u.label);}catch(e){toast({type:'error',title:'Undo failed',msg:String(e&&e.message||e)});return false;}
  _renderAIChatHistory();
  return true;
}
function _agentUndoLast(){
  var u=_agentUndoStack[_agentUndoStack.length-1];
  if(!u){toast('Nothing to undo.');return;}
  _agentUndoById(u.id);
}
function _agentRemoveById(arr,id){
  var i=arr.findIndex(function(x){return String(x.id)===String(id);});
  if(i>=0)return arr.splice(i,1)[0];
  return null;
}
function _agentSnapshot(o){try{return JSON.parse(JSON.stringify(o));}catch(_){return Object.assign({},o);}}
function _agentRestore(target,snap){Object.keys(target).forEach(function(k){delete target[k];});Object.assign(target,snap);}

// Opens the created / referenced item in the app's own viewer.
function _agentOpen(ref){
  if(!ref||!ref.type)return false;
  var id=ref.id;
  try{
    switch(ref.type){
      case 'task':{var t=(D.tasks||[]).find(function(x){return String(x.id)===String(id);});if(!t)return false;if(curScreen!=='tasks'&&curScreen!=='myday')nav('tasks');setTimeout(function(){openDrawer('task',t);},250);return true;}
      case 'project':nav('projects');setTimeout(function(){openProjectDetail(id);},250);return true;
      case 'program':nav('programs');setTimeout(function(){openProgramDetail(id);},250);return true;
      case 'note':nav('notes');setTimeout(function(){showNoteInEditor(id);},300);return true;
      case 'goal':nav('goals');setTimeout(function(){openGoalDetail(id);},250);return true;
      case 'idea':nav('ideas');setTimeout(function(){openIdeaDetail(id);},250);return true;
      case 'habit':nav('habits');return true;
      case 'journal':nav('journal');return true;
      case 'contact':nav('contacts');setTimeout(function(){openContactDetail(id);},250);return true;
      case 'opportunity':nav('pipeline');setTimeout(function(){openOpportunityDetail(id);},250);return true;
      case 'mindmap':nav('mindmaps');setTimeout(function(){mmOpen(id);},250);return true;
      case 'event':nav('calendar');return true;
      case 'money':case 'transaction':case 'bill':case 'account':case 'savings':case 'budget':nav('money');return true;
      case 'report':case 'widget':nav('reports');return true;
      case 'page':nav(id);return true;
    }
  }catch(e){console.warn('[agent] open failed',e);}
  return false;
}

// ─── finance helpers ───────────────────────────────────────────────────────
function _agentFin(){
  if(typeof _finData!=='function')return null;
  try{return _finData();}catch(_){return null;}
}
function _agentFinCat(ref,kind){
  var f=_agentFin();if(!f)return null;
  var cats=f.categories||[];
  if(!ref){
    var d=cats.find(function(c){return c.id==='misc-other';})||cats.find(function(c){return (c.kind||'expense')===(kind||'expense');})||cats[0];
    return d||null;
  }
  var r=_agentFind(cats,ref,'name');
  if(r.item)return r.item;
  // Try group name ("Housing") → first category in that group
  var lo=String(ref).toLowerCase();
  var g=cats.find(function(c){return String(c.group||'').toLowerCase()===lo;});
  if(g)return g;
  return null;
}
function _agentFinSaveAll(){try{_finSave();}catch(_){}try{if(curScreen==='money')renderMoney();}catch(_){}}

// ─── status digest: "where am I?" from the real workspace ──────────────────
function _agentStatus(){
  var today=_agentToday();
  var tasks=(D.tasks||[]).filter(function(t){return !t.parentTaskId;});
  var open=tasks.filter(function(t){return t.status!=='Done';});
  var isSub=function(t){return !!t.parentTaskId;};
  var overdue=open.filter(function(t){return t.due&&t.due<today;});
  var dueToday=open.filter(function(t){return t.due===today;});
  var myDay=open.filter(function(t){return t.myDay;});
  var d7=new Date();d7.setDate(d7.getDate()-7);var d7s=_ymd(d7);
  var done7=tasks.filter(function(t){return t.status==='Done'&&t.completedAt&&String(t.completedAt).slice(0,10)>=d7s;}).length;
  var inbox=0;try{var b=_gtdBuckets();inbox=(b&&b.Inbox&&(b.Inbox.length||b.Inbox))||0;if(typeof inbox!=='number')inbox=0;}catch(_){}
  var cap=null;try{var c=_dayCapacityCheck(new Date());cap={plannedMins:c.plannedMins,bookedMins:c.bookedMins,freeMins:c.freeMins,deltaMins:c.deltaMins};}catch(_){}
  var d14=new Date();d14.setDate(d14.getDate()-14);var d14iso=d14.toISOString();
  var goals=(D.goals||[]).filter(function(g){return (g.status||'Active')==='Active';}).map(function(g){return {id:g.id,title:g.title,pct:g.pct||0,stale:!(g.lastTouchedAt&&g.lastTouchedAt>d14iso)};});
  var habits=(D.habits||[]).filter(function(h){return (h.status||'Active')==='Active';});
  var pendingHabits=habits.filter(function(h){return !h.doneToday;}).map(function(h){return {id:h.id,title:h.title,streak:h.streak||0};});
  var projects=(D.projects||[]).filter(function(p){return (p.status||'Active')==='Active';});
  var noNext=projects.filter(function(p){return !open.some(function(t){return t.projectId===p.id;});}).map(function(p){return {id:p.id,name:p.name};});
  var lastJ=null;try{var js=(D.journal||[]).map(function(j){return typeof _parseJournalDate==='function'?_parseJournalDate(j):null;}).filter(Boolean).sort();if(js.length){var lj=new Date(js[js.length-1]);lastJ=Math.round((Date.now()-lj.getTime())/86400000);}}catch(_){}
  var events=[];try{var evs=Array.isArray(_calEvents)?_calEvents:[];events=evs.filter(function(e){return e.dateStr===today;}).sort(function(a,b){return (a.hour||0)-(b.hour||0);}).slice(0,8).map(function(e){return {title:e.title,hour:e.hour};});}catch(_){}
  var money=null;
  try{var f=_agentFin();if(f&&((f.transactions||[]).length||(f.bills||[]).length)){
    var ym=today.slice(0,7);var spent=_finSpent(ym),inc=_finIncome(ym);var by=_finSpentByCat(ym);
    var over=[];Object.keys(f.budgets||{}).forEach(function(cid){var bud=_finBudgetFor(cid,ym);if(bud&&by[cid]>bud)over.push({cat:_finCat(cid).name,over:Math.round(by[cid]-bud)});});
    var day=new Date().getDate();var dueSoon=(f.bills||[]).filter(function(b){return b.active!==false&&b.lastPaidYM!==ym&&b.dueDay>=day&&b.dueDay<=day+7;}).map(function(b){return {id:b.id,name:b.name,amount:b.amount,dueDay:b.dueDay};});
    money={month:ym,spent:Math.round(spent),income:Math.round(inc),overBudget:over.slice(0,5),billsDue7d:dueSoon.slice(0,8)};
  }}catch(_){}
  return {
    today:today,screen:(typeof curScreen!=='undefined'?curScreen:'home'),
    tasks:{open:open.length,overdue:overdue.slice(0,8).map(function(t){return {id:t.id,title:t.title,due:t.due,priority:t.priority};}),overdueCount:overdue.length,
      dueToday:dueToday.slice(0,8).map(function(t){return {id:t.id,title:t.title};}),myDay:myDay.slice(0,6).map(function(t){return {id:t.id,title:t.title,status:t.status};}),inbox:inbox,done7d:done7},
    capacity:cap,
    goals:goals.slice(0,8),
    habits:{pending:pendingHabits.slice(0,8),doneToday:habits.length-pendingHabits.length,total:habits.length},
    projects:{active:projects.length,withoutNextAction:noNext.slice(0,6)},
    journal:{daysSinceLastEntry:lastJ},
    events:events,
    money:money,
    ideas:{sparks:(D.ideas||[]).filter(function(i){return i.stage==='spark';}).length}
  };
}
// Compact one-liner version for the system prompt (the full object is a tool).
function _agentStatusLine(){
  try{
    var s=_agentStatus();
    var parts=['TODAY '+s.today+' · on the '+s.screen+' page',
      'tasks: '+s.tasks.open+' open, '+s.tasks.overdueCount+' overdue, '+s.tasks.dueToday.length+' due today, '+s.tasks.myDay.length+' in My Day, '+s.tasks.inbox+' in GTD inbox, '+s.tasks.done7d+' done in 7d'];
    if(s.tasks.overdue.length)parts.push('overdue: '+s.tasks.overdue.slice(0,4).map(function(t){return '#'+t.id+' '+_agentStr(t.title,40)+' ('+t.due+')';}).join('; '));
    if(s.capacity)parts.push('capacity today: '+Math.round(s.capacity.plannedMins/60*10)/10+'h planned, '+Math.round(s.capacity.freeMins/60*10)/10+'h free');
    parts.push('goals: '+s.goals.length+' active'+(s.goals.filter(function(g){return g.stale;}).length?' ('+s.goals.filter(function(g){return g.stale;}).length+' untouched 14d+)':''));
    parts.push('habits: '+s.habits.doneToday+'/'+s.habits.total+' done today');
    if(s.projects.withoutNextAction.length)parts.push('projects with no next action: '+s.projects.withoutNextAction.map(function(p){return p.name;}).join(', '));
    if(s.journal.daysSinceLastEntry!=null)parts.push('last journal entry '+s.journal.daysSinceLastEntry+'d ago');
    if(s.events.length)parts.push('events today: '+s.events.map(function(e){return e.hour+':00 '+_agentStr(e.title,30);}).join(', '));
    if(s.money){parts.push('money '+s.money.month+': spent $'+s.money.spent+' / income $'+s.money.income+(s.money.overBudget.length?'; over budget: '+s.money.overBudget.map(function(o){return o.cat+' +$'+o.over;}).join(', '):'')+(s.money.billsDue7d.length?'; bills due 7d: '+s.money.billsDue7d.map(function(b){return b.name+' $'+b.amount;}).join(', '):''));}
    return parts.join('\n');
  }catch(e){return 'TODAY '+_agentToday();}
}

// ─── entity builders (mirror the app's own creation code exactly) ──────────
function _agentNewTask(a){
  a=a||{};
  var projId=null,projName='';
  if(a.project!=null&&a.project!==''){var pr=_agentFind(D.projects||[],a.project,'name');if(pr.item){projId=pr.item.id;projName=pr.item.name;}else if(pr.ambiguous)return _agentNeed(pr,'projects');}
  var goalId=null;
  if(a.goal!=null&&a.goal!==''){var gr=_agentFind(D.goals||[],a.goal,'title');if(gr.item)goalId=gr.item.id;else if(gr.ambiguous)return _agentNeed(gr,'goals');}
  var pri=String(a.priority||'Medium');pri=pri.charAt(0).toUpperCase()+pri.slice(1).toLowerCase();if(['High','Medium','Low'].indexOf(pri)<0)pri='Medium';
  var due=_agentDate(a.due);
  var t={
    id:nextId(D.tasks),title:_agentStr(a.title,300).trim(),notes:_agentStr(a.notes||a.description||'',4000),
    priority:pri,status:a.status||'Not Started',smartList:a.smartList||'Task Intake',
    startDate:_agentDate(a.startDate)||'',endDate:due,due:due,
    startTime:_agentTime(a.startTime),endTime:_agentTime(a.endTime),
    estimatedMins:parseInt(a.estimatedMins,10)||0,actualMins:0,
    energy:a.energy||'medium',context:a.context||'',location:'Anywhere',pi:'Process',recurring:a.recurring||'None',
    projectId:projId,project:projName,linkedGoalId:goalId,assignedTo:null,delegatedTo:null,
    snoozeUntil:'',reminder:'',myDay:!!a.myDay,isWorkTask:true,
    tags:_agentArr(a.tags),scope:{personal:false,business:false},
    subtasks:_agentArr(a.subtasks).map(function(s,i){return {id:i+1,title:typeof s==='string'?s:(s&&s.title)||'',done:false};}).filter(function(s){return s.title;}),
    linkedNoteIds:[],predecessorIds:[],comments:[],createdBy:_agentUser(),createdAt:new Date().toISOString()
  };
  if(!t.title)return {ok:false,error:'A task needs a title.'};
  return {task:t};
}

// ─── THE TOOL REGISTRY ─────────────────────────────────────────────────────
// kind: read (instant) · nav (instant) · write (confirm unless autoWrite) ·
//       destructive (always confirm). `sig` is the line the model sees.
var LU_AGENT_TOOLS=[
  // ── read ────────────────────────────────────────────────────────────────
  {name:'status',kind:'read',sig:'status{}',desc:'Full where-am-I digest: overdue/today/My Day/inbox, capacity, goals, habits, projects lacking a next action, bills due, budget overruns.',
    run:function(){return {ok:true,summary:'Read workspace status',data:_agentStatus()};}},
  {name:'search',kind:'read',sig:'search{query,limit?}',desc:'Keyword search across notes, tasks, journal, ideas, opportunities. Returns ids you can act on.',
    run:function(a){var hits=[];try{hits=_gatherRelevantContent(String(a.query||''),{limit:Math.min(parseInt(a.limit,10)||10,20),maxBodyChars:160});}catch(e){return {ok:false,error:'search failed: '+e.message};}
      return {ok:true,summary:'Searched "'+_agentStr(a.query,40)+'": '+hits.length+' hit(s)',data:hits.map(function(h){return {type:h.type,id:h.id,title:h.title,snippet:_agentStr(h.snippet,160)};})};}},
  {name:'list',kind:'read',sig:'list{entity,filter?,limit?}  entity∈tasks|projects|programs|goals|habits|notes|ideas|contacts|opportunities|mindmaps|journal|events|bills|accounts|transactions|budgets|savings|reports|pages  filter∈open|overdue|today|myday|done|inbox|active|recent|week|month',
    desc:'List items with ids (compact).',
    run:function(a){return _agentList(a);}},
  {name:'get',kind:'read',sig:'get{entity,id}',desc:'One item in detail (id or name).',run:function(a){return _agentGet(a);}},
  {name:'help',kind:'read',sig:'help{query}',desc:'Look up the Help Center (how the app works, routines, features).',
    run:function(a){var k='';try{k=_luKnowledgeHits(String(a.query||''),1400);}catch(_){}return k?{ok:true,summary:'Found help for "'+_agentStr(a.query,40)+'"',data:k}:{ok:true,summary:'No help article matched',data:''};}},
  {name:'report_data',kind:'read',sig:'report_data{}',desc:'The numbers behind every widget on the Reports page (for summarising or spotting trends).',
    run:function(){var out=[];try{(_reportWidgets||[]).forEach(function(w){var d=null;try{d=_widgetData(w);}catch(_){}out.push({title:w.title,source:w.source,groupBy:w.groupBy,metric:w.metric,viz:w.viz,data:d});});}catch(e){return {ok:false,error:e.message};}
      return {ok:true,summary:'Read '+out.length+' report widget(s)',data:out};}},

  // ── navigation ──────────────────────────────────────────────────────────
  {name:'navigate',kind:'nav',sig:'navigate{page,id?,type?}  page∈'+(typeof LU_PAGES!=='undefined'?LU_PAGES.map(function(p){return p.id;}).join('|'):'home|tasks|notes'),
    desc:'Go to a page; with type+id also open that item.',
    describe:function(a){return 'Go to '+(a.page||'')+(a.id?' and open '+(a.type||'item')+' '+a.id:'');},
    run:function(a){var page=String(a.page||'').toLowerCase();if(typeof SM!=='undefined'&&!SM[page])return {ok:false,error:'Unknown page "'+page+'"'};
      if(a.type&&a.id){var ok=_agentOpen({type:a.type,id:a.id});return {ok:true,summary:(ok?'Opened ':'Went to ')+page};}
      nav(page);return {ok:true,summary:'Went to '+page};}},

  // ── tasks ───────────────────────────────────────────────────────────────
  {name:'create_task',kind:'write',sig:'create_task{title,notes?,due?,priority?(High|Medium|Low),project?,goal?,myDay?,subtasks?[],tags?[],estimatedMins?,startTime?,recurring?}',
    desc:'Create a task (subtasks inline).',
    describe:function(a){return 'Create task "'+_agentStr(a.title,60)+'"'+(a.due?' due '+a.due:'')+(a.priority?' · '+a.priority:'')+(a.project?' · in '+a.project:'')+(a.subtasks&&a.subtasks.length?' · '+_agentArr(a.subtasks).length+' subtasks':'')+(a.myDay?' · My Day':'');},
    run:function(a){var r=_agentNewTask(a);if(!r.task)return r;var t=r.task;D.tasks.push(t);save('tasks');
      try{applyBidirectionalLinks('task',t.id);}catch(_){}
      if(t.linkedGoalId){var g=D.goals.find(function(x){return x.id===t.linkedGoalId;});if(g){g.linkedTaskIds=g.linkedTaskIds||[];if(g.linkedTaskIds.indexOf(t.id)<0)g.linkedTaskIds.push(t.id);save('goals');}}
      var undo=_agentPushUndo('create task "'+t.title+'"',function(){_agentRemoveById(D.tasks,t.id);save('tasks');});
      return {ok:true,summary:'Created task #'+t.id+' "'+t.title+'"',ref:{type:'task',id:t.id},undo:undo};}},
  {name:'update_task',kind:'write',sig:'update_task{id,title?,notes?,due?,priority?,status?(Not Started|In Progress|Done|Blocked),myDay?,project?,tags?,startTime?,endTime?,estimatedMins?}',
    desc:'Edit fields on a task (id or name).',
    describe:function(a){var f=Object.keys(a).filter(function(k){return k!=='id';});return 'Update task '+a.id+': '+f.map(function(k){return k+'='+_agentStr(JSON.stringify(a[k]),30);}).join(', ');},
    run:function(a){var r=_agentFind(D.tasks||[],a.id,'title');var need=_agentNeed(r,'tasks');if(need)return need;var t=r.item;var snap=_agentSnapshot(t);
      if(a.title!=null)t.title=_agentStr(a.title,300);if(a.notes!=null)t.notes=_agentStr(a.notes,4000);
      if(a.due!==undefined){t.due=_agentDate(a.due);t.endDate=t.due;}
      if(a.priority){var p=String(a.priority);p=p.charAt(0).toUpperCase()+p.slice(1).toLowerCase();if(['High','Medium','Low'].indexOf(p)>=0)t.priority=p;}
      if(a.status){t.status=a.status;_syncTaskCompletedAt(t);}
      if(a.myDay!=null)t.myDay=!!a.myDay;
      if(a.project!==undefined){if(!a.project){t.projectId=null;t.project='';}else{var pr=_agentFind(D.projects||[],a.project,'name');var pn=_agentNeed(pr,'projects');if(pn)return pn;t.projectId=pr.item.id;t.project=pr.item.name;}}
      if(a.tags!=null)t.tags=_agentArr(a.tags);if(a.startTime!=null)t.startTime=_agentTime(a.startTime);if(a.endTime!=null)t.endTime=_agentTime(a.endTime);
      if(a.estimatedMins!=null)t.estimatedMins=parseInt(a.estimatedMins,10)||0;
      save('tasks');var undo=_agentPushUndo('edit task "'+t.title+'"',function(){_agentRestore(t,snap);save('tasks');});
      return {ok:true,summary:'Updated task #'+t.id+' "'+t.title+'"',ref:{type:'task',id:t.id},undo:undo};}},
  {name:'complete_task',kind:'write',sig:'complete_task{id,done?=true}',desc:'Mark a task done (or reopen with done:false).',
    describe:function(a){return (a.done===false?'Reopen':'Complete')+' task '+a.id;},
    run:function(a){var r=_agentFind(D.tasks||[],a.id,'title');var need=_agentNeed(r,'tasks');if(need)return need;var t=r.item;var was=t.status,wasAt=t.completedAt;
      t.status=a.done===false?'Not Started':'Done';_syncTaskCompletedAt(t);save('tasks');
      if(t.status==='Done'){try{_trpc('activityFeed.log',{action:'task_completed',entityType:'task',entityTitle:t.title},'mutation').catch(function(){});}catch(_){}}
      var undo=_agentPushUndo((t.status==='Done'?'complete':'reopen')+' "'+t.title+'"',function(){t.status=was;t.completedAt=wasAt;save('tasks');});
      return {ok:true,summary:(t.status==='Done'?'Completed':'Reopened')+' "'+t.title+'"',ref:{type:'task',id:t.id},undo:undo};}},
  {name:'add_subtasks',kind:'write',sig:'add_subtasks{id,titles[]}',desc:'Append subtasks to a task.',
    describe:function(a){return 'Add '+_agentArr(a.titles).length+' subtask(s) to task '+a.id;},
    run:function(a){var r=_agentFind(D.tasks||[],a.id,'title');var need=_agentNeed(r,'tasks');if(need)return need;var t=r.item;t.subtasks=t.subtasks||[];
      var titles=_agentArr(a.titles).map(function(s){return typeof s==='string'?s:(s&&s.title)||'';}).filter(Boolean);if(!titles.length)return {ok:false,error:'No subtask titles given.'};
      var base=Date.now();var added=titles.map(function(tt,i){var s={id:base+i,title:tt,done:false};t.subtasks.push(s);return s;});save('tasks');
      var undo=_agentPushUndo('add subtasks to "'+t.title+'"',function(){t.subtasks=(t.subtasks||[]).filter(function(s){return added.indexOf(s)<0;});save('tasks');});
      return {ok:true,summary:'Added '+added.length+' subtask(s) to "'+t.title+'"',ref:{type:'task',id:t.id},undo:undo};}},
  {name:'block_time',kind:'write',sig:'block_time{id,start(HH:MM),mins?=60,date?}',desc:'Put a task on the calendar as a focus block and into My Day.',
    describe:function(a){return 'Block '+(a.mins||60)+' min at '+a.start+' for task '+a.id;},
    run:function(a){var r=_agentFind(D.tasks||[],a.id,'title');var need=_agentNeed(r,'tasks');if(need)return need;var t=r.item;var st=_agentTime(a.start);if(!st)return {ok:false,error:'start must be HH:MM'};
      var sm=parseInt(st.slice(0,2),10)*60+parseInt(st.slice(3),10);var mins=parseInt(a.mins,10)||60;var ds=_agentDate(a.date)||_agentToday();
      _calEvents=Array.isArray(_calEvents)?_calEvents:[];var ev={id:Date.now()+Math.floor(Math.random()*1000),title:'▶ '+t.title,hour:Math.floor(sm/60),endHour:Math.ceil((sm+mins)/60),start:st,end:_agentMinsToTime(sm+mins),color:'var(--ac)',dateStr:ds,linkedTaskId:String(t.id),_planned:true};
      _calEvents.push(ev);_agentSaveCal();var snap={startTime:t.startTime,endTime:t.endTime,myDay:t.myDay,startDate:t.startDate};
      t.startTime=st;t.endTime=ev.end;if(ds===_agentToday())t.myDay=true;t.startDate=t.startDate||ds;save('tasks');
      var undo=_agentPushUndo('time block for "'+t.title+'"',function(){_agentRemoveById(_calEvents,ev.id);_agentSaveCal();Object.assign(t,snap);save('tasks');});
      return {ok:true,summary:'Blocked '+mins+' min at '+st+' on '+ds+' for "'+t.title+'"',ref:{type:'event',id:ev.id},undo:undo};}},

  // ── projects & programs ─────────────────────────────────────────────────
  {name:'create_project',kind:'write',sig:'create_project{name,desc?,due?,status?,color?,program?,tasks?[]}',desc:'Create a project, optionally with its first tasks and inside a program.',
    describe:function(a){return 'Create project "'+_agentStr(a.name,60)+'"'+(a.due?' due '+a.due:'')+(a.program?' · in program '+a.program:'')+(a.tasks&&_agentArr(a.tasks).length?' · with '+_agentArr(a.tasks).length+' tasks':'');},
    run:function(a){if(!a.name)return {ok:false,error:'A project needs a name.'};var progItem=null;
      if(a.program){var pg=_agentFind(D.programs||[],a.program,'name');var pn=_agentNeed(pg,'programs');if(pn)return pn;progItem=pg.item;}
      var p={id:nextId(D.projects),name:_agentStr(a.name,200),desc:_agentStr(a.desc||a.description||'',4000),status:a.status||'Active',area:'',owner:_agentUser(),color:a.color||'#3B82F6',startDate:_agentDate(a.startDate)||'',due:_agentDate(a.due)||'TBD',quarter:'',year:new Date().getFullYear(),kanbanAxis:'Status',pct:0,tags:_agentArr(a.tags),scope:{personal:false,business:false},milestones:[],linkedGoalIds:[],createdBy:_agentUser(),createdAt:new Date().toISOString()};
      D.projects.push(p);save('projects');var madeTasks=[];
      _agentArr(a.tasks).forEach(function(tt){var spec=typeof tt==='string'?{title:tt}:(tt||{});spec.project=p.id;var r=_agentNewTask(spec);if(r.task){D.tasks.push(r.task);madeTasks.push(r.task);}});
      if(madeTasks.length)save('tasks');
      if(progItem){progItem.projectIds=progItem.projectIds||[];progItem.projectIds.push(p.id);save('programs');}
      var undo=_agentPushUndo('create project "'+p.name+'"',function(){_agentRemoveById(D.projects,p.id);madeTasks.forEach(function(t){_agentRemoveById(D.tasks,t.id);});if(progItem)progItem.projectIds=(progItem.projectIds||[]).filter(function(x){return x!==p.id;});save('projects');if(madeTasks.length)save('tasks');if(progItem)save('programs');});
      return {ok:true,summary:'Created project #'+p.id+' "'+p.name+'"'+(madeTasks.length?' with '+madeTasks.length+' task(s)':''),ref:{type:'project',id:p.id},undo:undo,data:{taskIds:madeTasks.map(function(t){return t.id;})}};}},
  {name:'update_project',kind:'write',sig:'update_project{id,name?,desc?,status?(Active|On Hold|Completed|Archived),due?,color?}',desc:'Edit a project.',
    describe:function(a){return 'Update project '+a.id;},
    run:function(a){var r=_agentFind(D.projects||[],a.id,'name');var need=_agentNeed(r,'projects');if(need)return need;var p=r.item;var snap=_agentSnapshot(p);
      if(a.name!=null)p.name=_agentStr(a.name,200);if(a.desc!=null)p.desc=_agentStr(a.desc,4000);if(a.status)p.status=a.status;if(a.due!==undefined)p.due=_agentDate(a.due)||'TBD';if(a.color)p.color=a.color;
      save('projects');var undo=_agentPushUndo('edit project "'+p.name+'"',function(){_agentRestore(p,snap);save('projects');});
      return {ok:true,summary:'Updated project "'+p.name+'"',ref:{type:'project',id:p.id},undo:undo};}},
  {name:'create_program',kind:'write',sig:'create_program{name,description?,projects?[]}',desc:'Create a program (a portfolio of projects).',
    describe:function(a){return 'Create program "'+_agentStr(a.name,60)+'"'+(a.projects&&_agentArr(a.projects).length?' linking '+_agentArr(a.projects).length+' project(s)':'');},
    run:function(a){if(!a.name)return {ok:false,error:'A program needs a name.'};D.programs=D.programs||[];var ids=[];
      for(var i=0;i<_agentArr(a.projects).length;i++){var pr=_agentFind(D.projects||[],_agentArr(a.projects)[i],'name');var pn=_agentNeed(pr,'projects');if(pn)return pn;ids.push(pr.item.id);}
      var pg={id:Date.now(),name:_agentStr(a.name,200),icon:a.icon||'📊',color:a.color||'#1f6feb',owner:_agentUser(),status:'Active',description:_agentStr(a.description||a.desc||'',4000),projectIds:ids,createdAt:new Date().toISOString()};
      D.programs.push(pg);save('programs');var undo=_agentPushUndo('create program "'+pg.name+'"',function(){_agentRemoveById(D.programs,pg.id);save('programs');});
      return {ok:true,summary:'Created program "'+pg.name+'"'+(ids.length?' with '+ids.length+' project(s)':''),ref:{type:'program',id:pg.id},undo:undo};}},
  {name:'update_program',kind:'write',sig:'update_program{id,name?,description?,status?,addProjects?[],removeProjects?[]}',desc:'Edit a program or change which projects it contains.',
    describe:function(a){return 'Update program '+a.id;},
    run:function(a){var r=_agentFind(D.programs||[],a.id,'name');var need=_agentNeed(r,'programs');if(need)return need;var pg=r.item;var snap=_agentSnapshot(pg);pg.projectIds=pg.projectIds||[];
      if(a.name!=null)pg.name=_agentStr(a.name,200);if(a.description!=null)pg.description=_agentStr(a.description,4000);if(a.status)pg.status=a.status;
      var addL=_agentArr(a.addProjects);for(var i=0;i<addL.length;i++){var pr=_agentFind(D.projects||[],addL[i],'name');var pn=_agentNeed(pr,'projects');if(pn)return pn;if(pg.projectIds.indexOf(pr.item.id)<0)pg.projectIds.push(pr.item.id);}
      var remL=_agentArr(a.removeProjects);for(var j=0;j<remL.length;j++){var rr=_agentFind(D.projects||[],remL[j],'name');if(rr.item)pg.projectIds=pg.projectIds.filter(function(x){return x!==rr.item.id;});}
      save('programs');var undo=_agentPushUndo('edit program "'+pg.name+'"',function(){_agentRestore(pg,snap);save('programs');});
      return {ok:true,summary:'Updated program "'+pg.name+'" ('+pg.projectIds.length+' projects)',ref:{type:'program',id:pg.id},undo:undo};}},

  // ── notes ───────────────────────────────────────────────────────────────
  {name:'create_note',kind:'write',sig:'create_note{title,body(markdown),tags?[],noteType?(Note|Meeting Notes|Decision|Reference),projects?[],tasks?[]}',desc:'Create a note. Body is Markdown; [[Title]] makes wiki-links.',
    describe:function(a){return 'Create note "'+_agentStr(a.title,60)+'"'+(a.body?' ('+String(a.body).length+' chars)':'');},
    run:function(a){if(!a.title)return {ok:false,error:'A note needs a title.'};var body=String(a.body||'');var html='';try{html=typeof renderMd==='function'?renderMd(body):'';}catch(_){}
      var projIds=[],taskIds=[];
      for(var i=0;i<_agentArr(a.projects).length;i++){var pr=_agentFind(D.projects||[],_agentArr(a.projects)[i],'name');if(pr.item)projIds.push(pr.item.id);}
      for(var j=0;j<_agentArr(a.tasks).length;j++){var tr=_agentFind(D.tasks||[],_agentArr(a.tasks)[j],'title');if(tr.item)taskIds.push(tr.item.id);}
      var n={id:nextId(D.notes),title:_agentStr(a.title,300),body:body,bodyHtml:html,noteType:a.noteType||'Note',para:'Resource',source:'AI Assistant',sourceUrl:'',readingStatus:'Inbox',favorite:false,tags:_agentArr(a.tags),scope:{personal:false,business:false},updated:'Just now',starred:false,linkedTaskIds:taskIds,linkedProjectIds:projIds,createdBy:_agentUser(),createdAt:new Date().toISOString()};
      D.notes.push(n);save('notes');try{applyBidirectionalLinks('note',n.id);}catch(_){}
      var undo=_agentPushUndo('create note "'+n.title+'"',function(){_agentRemoveById(D.notes,n.id);save('notes');});
      return {ok:true,summary:'Created note #'+n.id+' "'+n.title+'"',ref:{type:'note',id:n.id},undo:undo};}},
  {name:'append_note',kind:'write',sig:'append_note{id,text(markdown)}',desc:'Append text to an existing note.',
    describe:function(a){return 'Append to note '+a.id+': "'+_agentStr(a.text,50)+'"';},
    run:function(a){var r=_agentFind(D.notes||[],a.id,'title');var need=_agentNeed(r,'notes');if(need)return need;var n=r.item;var snap={body:n.body,bodyHtml:n.bodyHtml,updated:n.updated};
      var text=String(a.text||'');n.body=(n.body||'')+(n.body?'\n\n':'')+text;try{n.bodyHtml=(n.bodyHtml||'')+(typeof renderMd==='function'?renderMd(text):'<p>'+esc(text)+'</p>');}catch(_){}n.updated='Just now';n.updatedAt=new Date().toISOString();
      save('notes');var undo=_agentPushUndo('append to note "'+n.title+'"',function(){Object.assign(n,snap);save('notes');});
      return {ok:true,summary:'Appended to note "'+n.title+'"',ref:{type:'note',id:n.id},undo:undo};}},
  {name:'update_note',kind:'write',sig:'update_note{id,title?,body?,tags?,starred?,pinned?}',desc:'Edit a note (body replaces the whole text).',
    describe:function(a){return 'Update note '+a.id;},
    run:function(a){var r=_agentFind(D.notes||[],a.id,'title');var need=_agentNeed(r,'notes');if(need)return need;var n=r.item;var snap=_agentSnapshot(n);
      if(a.title!=null)n.title=_agentStr(a.title,300);if(a.body!=null){n.body=String(a.body);try{n.bodyHtml=typeof renderMd==='function'?renderMd(n.body):'';}catch(_){}}
      if(a.tags!=null)n.tags=_agentArr(a.tags);if(a.starred!=null)n.starred=!!a.starred;if(a.pinned!=null)n.pinned=!!a.pinned;n.updated='Just now';n.updatedAt=new Date().toISOString();
      save('notes');var undo=_agentPushUndo('edit note "'+n.title+'"',function(){_agentRestore(n,snap);save('notes');});
      return {ok:true,summary:'Updated note "'+n.title+'"',ref:{type:'note',id:n.id},undo:undo};}},

  // ── mind maps ───────────────────────────────────────────────────────────
  {name:'create_mindmap',kind:'write',sig:'create_mindmap{title,branches:[{text,children?:[text]}]}',desc:'Create a mind map with a root, branches and optional sub-branches (auto-laid out).',
    describe:function(a){var b=Array.isArray(a.branches)?a.branches:[];return 'Create mind map "'+_agentStr(a.title,50)+'" with '+b.length+' branch(es)';},
    run:function(a){if(!a.title)return {ok:false,error:'A mind map needs a title.'};D.mindmaps=D.mindmaps||[];
      var palette=['#3b82f6','#a855f7','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16'];
      var mk=function(id,text,x,y,color,isRoot){return {id:id,text:_agentStr(text,120),x:Math.round(x),y:Math.round(y),color:color,shape:'rect',icon:'',subItems:[],description:'',collapsed:false,isRoot:!!isRoot};};
      var nodes=[mk(1,a.title,480,320,'#3b82f6',true)],edges=[],nid=1;
      var branches=(Array.isArray(a.branches)?a.branches:_agentArr(a.branches)).map(function(b){return typeof b==='string'?{text:b}:(b||{});}).filter(function(b){return b.text;});
      var n=branches.length||1;
      branches.forEach(function(b,i){var ang=(Math.PI*2*i)/n-Math.PI/2;var col=palette[i%palette.length];var id=++nid;nodes.push(mk(id,b.text,480+Math.cos(ang)*230,320+Math.sin(ang)*170,col,false));edges.push({from:1,to:id});
        var kids=_agentArr(b.children).map(function(c){return typeof c==='string'?c:(c&&c.text)||'';}).filter(Boolean);var kn=kids.length;
        kids.forEach(function(k,j){var spread=Math.PI/3;var a2=ang+(kn>1?(-spread/2+spread*j/(kn-1)):0);var kid=++nid;nodes.push(mk(kid,k,480+Math.cos(a2)*420,320+Math.sin(a2)*300,col,false));edges.push({from:id,to:kid});});});
      var mm={id:_mmNextId(D.mindmaps),title:_agentStr(a.title,120),icon:'🧠',nodes:nodes,edges:edges,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),layout:'free'};
      D.mindmaps.push(mm);saveMindmaps();var undo=_agentPushUndo('create mind map "'+mm.title+'"',function(){_agentRemoveById(D.mindmaps,mm.id);saveMindmaps();});
      return {ok:true,summary:'Created mind map "'+mm.title+'" ('+nodes.length+' nodes)',ref:{type:'mindmap',id:mm.id},undo:undo};}},

  // ── ideas ───────────────────────────────────────────────────────────────
  {name:'create_idea',kind:'write',sig:'create_idea{title,description?,idea_type?(general|tool_to_build|business|content|process),goal?}',desc:'Capture an idea (starts at the Spark stage).',
    describe:function(a){return 'Capture idea "'+_agentStr(a.title,60)+'"';},
    run:function(a){if(!a.title)return {ok:false,error:'An idea needs a title.'};D.ideas=D.ideas||[];var goalId=null;if(a.goal){var g=_agentFind(D.goals||[],a.goal,'title');if(g.item)goalId=g.item.id;}
      var now=new Date().toISOString();var idea={id:nextId(D.ideas),title:_agentStr(a.title,300),description:_agentStr(a.description||'',4000),idea_type:a.idea_type||'general',stage:'spark',goal_id:goalId,ice_impact:5,ice_confidence:5,ice_ease:5,ai_ice_impact:null,ai_ice_confidence:null,ai_ice_ease:null,ai_ice_rationale:null,kill_reason:null,parked_review_date:null,promoted_project_id:null,verdict_outcome:null,spark_at:now,develop_at:null,stress_test_at:null,verdict_at:null,answers:[],collaborators:[],comments:[],votes:[],checkIns:[],createdBy:_agentUser(),createdAt:now,updatedAt:now};
      D.ideas.push(idea);save('ideas');var undo=_agentPushUndo('capture idea "'+idea.title+'"',function(){_agentRemoveById(D.ideas,idea.id);save('ideas');});
      return {ok:true,summary:'Captured idea #'+idea.id+' "'+idea.title+'"',ref:{type:'idea',id:idea.id},undo:undo};}},
  {name:'update_idea',kind:'write',sig:'update_idea{id,title?,description?,stage?(spark|develop|stress_test|verdict|parked|killed),ice_impact?,ice_confidence?,ice_ease?}',desc:'Move an idea along or rescore it.',
    describe:function(a){return 'Update idea '+a.id+(a.stage?' → '+a.stage:'');},
    run:function(a){var r=_agentFind(D.ideas||[],a.id,'title');var need=_agentNeed(r,'ideas');if(need)return need;var it=r.item;var snap=_agentSnapshot(it);
      if(a.title!=null)it.title=_agentStr(a.title,300);if(a.description!=null)it.description=_agentStr(a.description,4000);
      if(a.stage){it.stage=a.stage;var k=a.stage+'_at';if(!it[k])it[k]=new Date().toISOString();}
      ['ice_impact','ice_confidence','ice_ease'].forEach(function(k){if(a[k]!=null)it[k]=Math.max(1,Math.min(10,parseInt(a[k],10)||5));});it.updatedAt=new Date().toISOString();
      save('ideas');var undo=_agentPushUndo('edit idea "'+it.title+'"',function(){_agentRestore(it,snap);save('ideas');});
      return {ok:true,summary:'Updated idea "'+it.title+'"',ref:{type:'idea',id:it.id},undo:undo};}},

  // ── goals ───────────────────────────────────────────────────────────────
  {name:'create_goal',kind:'write',sig:'create_goal{title,category?(Work|Health|Finance|Learning|Personal),dueDate?,targetMetric?,targetNumber?,unit?,milestones?[],description?}',desc:'Create a goal with optional milestones.',
    describe:function(a){return 'Create goal "'+_agentStr(a.title,60)+'"'+(a.dueDate?' by '+a.dueDate:'')+(a.milestones&&_agentArr(a.milestones).length?' · '+_agentArr(a.milestones).length+' milestones':'');},
    run:function(a){if(!a.title)return {ok:false,error:'A goal needs a title.'};
      var g={id:nextId(D.goals),title:_agentStr(a.title,300),icon:a.icon||'🎯',category:a.category||'Work',status:'Active',year:new Date().getFullYear(),quarter:'',startDate:_agentToday(),dueDate:_agentDate(a.dueDate)||'',targetMetric:a.targetMetric||'',targetNumber:_agentNum(a.targetNumber,0),currentValue:0,unit:a.unit||'',area:'',target:a.targetMetric||'',descriptionHtml:a.description?('<p>'+esc(String(a.description))+'</p>'):'',pct:0,tags:_agentArr(a.tags),scope:{personal:false,business:false},reflections:[],linkedTaskIds:[],milestones:_agentArr(a.milestones).map(function(m,i){return {id:i+1,label:typeof m==='string'?m:(m&&(m.label||m.title))||'',done:false,due:(m&&m.due)?_agentDate(m.due):''};}).filter(function(m){return m.label;}),createdBy:_agentUser(),createdAt:new Date().toISOString()};
      D.goals.push(g);save('goals');var undo=_agentPushUndo('create goal "'+g.title+'"',function(){_agentRemoveById(D.goals,g.id);save('goals');});
      return {ok:true,summary:'Created goal #'+g.id+' "'+g.title+'"',ref:{type:'goal',id:g.id},undo:undo};}},
  {name:'goal_checkin',kind:'write',sig:'goal_checkin{id,progress,pct(0-100),blockers?,next?}',desc:'Log a check-in on a goal (updates % and writes a journal entry, like the app does).',
    describe:function(a){return 'Check in on goal '+a.id+' → '+a.pct+'%';},
    run:function(a){var r=_agentFind(D.goals||[],a.id,'title');var need=_agentNeed(r,'goals');if(need)return need;var g=r.item;if(!a.progress)return {ok:false,error:'Describe the progress.'};
      var pct=Math.max(0,Math.min(100,parseInt(a.pct,10)||g.pct||0));var snap=_agentSnapshot(g);
      var today=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});g.checkIns=g.checkIns||[];g.checkIns.push({date:today,progress:String(a.progress),blockers:String(a.blockers||''),next:String(a.next||''),pct:pct});
      g.pct=pct;g.lastTouchedAt=new Date().toISOString();g.pctHistory=Array.isArray(g.pctHistory)?g.pctHistory:[];g.pctHistory.push({ts:Date.now(),pct:pct});if(g.pctHistory.length>30)g.pctHistory=g.pctHistory.slice(-30);
      var j={id:Date.now(),type:'goal-checkin',title:'Goal Check-in: '+g.title,date:_agentToday(),body:'## Progress\n'+a.progress+(a.blockers?'\n\n## Blockers\n'+a.blockers:'')+(a.next?'\n\n## Next\n'+a.next:''),tags:['goal','check-in'],mood:'',energy:'',createdAt:new Date().toISOString(),createdBy:_agentUser()};
      D.journal.push(j);save('goals');save('journal');
      var undo=_agentPushUndo('check-in on "'+g.title+'"',function(){_agentRestore(g,snap);_agentRemoveById(D.journal,j.id);save('goals');save('journal');});
      return {ok:true,summary:'Checked in on "'+g.title+'" → '+pct+'% (journal entry added)',ref:{type:'goal',id:g.id},undo:undo};}},
  {name:'update_goal',kind:'write',sig:'update_goal{id,title?,status?(Active|Paused|Completed|Dropped),dueDate?,pct?,currentValue?}',desc:'Edit a goal.',
    describe:function(a){return 'Update goal '+a.id;},
    run:function(a){var r=_agentFind(D.goals||[],a.id,'title');var need=_agentNeed(r,'goals');if(need)return need;var g=r.item;var snap=_agentSnapshot(g);
      if(a.title!=null)g.title=_agentStr(a.title,300);if(a.status)g.status=a.status;if(a.dueDate!==undefined)g.dueDate=_agentDate(a.dueDate);if(a.pct!=null)g.pct=Math.max(0,Math.min(100,parseInt(a.pct,10)||0));if(a.currentValue!=null)g.currentValue=_agentNum(a.currentValue,g.currentValue);g.lastTouchedAt=new Date().toISOString();
      save('goals');var undo=_agentPushUndo('edit goal "'+g.title+'"',function(){_agentRestore(g,snap);save('goals');});
      return {ok:true,summary:'Updated goal "'+g.title+'"',ref:{type:'goal',id:g.id},undo:undo};}},

  // ── habits ──────────────────────────────────────────────────────────────
  {name:'create_habit',kind:'write',sig:'create_habit{title,cadence?(Daily|Weekly|Weekdays),category?(Health|Learning|Work|Mindfulness|Personal),icon?,targetTime?,notes?}',desc:'Create a habit.',
    describe:function(a){return 'Create habit "'+_agentStr(a.title,60)+'"'+(a.cadence?' · '+a.cadence:'');},
    run:function(a){if(!a.title)return {ok:false,error:'A habit needs a title.'};
      var h={id:nextId(D.habits),title:_agentStr(a.title,200),notes:_agentStr(a.notes||'',1000),icon:a.icon||'✅',category:a.category||'Health',status:'Active',cadence:a.cadence||'Daily',customDays:[],targetCount:1,targetTime:_agentTime(a.targetTime),startedOn:_agentToday(),reminderEnabled:false,reminderTime:'',linkedTaskId:null,streak:0,doneToday:false,completedDates:[],skippedDates:[],tags:[],scope:{personal:false,business:false},createdBy:_agentUser(),createdAt:new Date().toISOString()};
      D.habits.push(h);save('habits');var undo=_agentPushUndo('create habit "'+h.title+'"',function(){_agentRemoveById(D.habits,h.id);save('habits');});
      return {ok:true,summary:'Created habit "'+h.title+'"',ref:{type:'habit',id:h.id},undo:undo};}},
  {name:'habit_done',kind:'write',sig:'habit_done{id,done?=true}',desc:'Tick (or untick) a habit for today.',
    describe:function(a){return (a.done===false?'Untick':'Tick')+' habit '+a.id+' for today';},
    run:function(a){var r=_agentFind(D.habits||[],a.id,'title');var need=_agentNeed(r,'habits');if(need)return need;var h=r.item;var want=a.done!==false;if(!!h.doneToday===want)return {ok:true,summary:'"'+h.title+'" already '+(want?'done':'not done')+' today',ref:{type:'habit',id:h.id}};
      var snap=_agentSnapshot(h);var todayStr=new Date().toISOString().split('T')[0];h.completedDates=h.completedDates||[];h.skippedDates=h.skippedDates||[];
      h.doneToday=want;h.skippedToday=false;if(want){if(h.completedDates.indexOf(todayStr)<0)h.completedDates.push(todayStr);h.skippedDates=h.skippedDates.filter(function(d){return d!==todayStr;});}else{h.completedDates=h.completedDates.filter(function(d){return d!==todayStr;});}
      try{h.streak=calcHabitStreak(h);}catch(_){}save('habits');var undo=_agentPushUndo((want?'tick':'untick')+' "'+h.title+'"',function(){_agentRestore(h,snap);save('habits');});
      return {ok:true,summary:(want?'Ticked':'Unticked')+' "'+h.title+'"'+(want?' — streak '+(h.streak||0):''),ref:{type:'habit',id:h.id},undo:undo};}},

  // ── journal ─────────────────────────────────────────────────────────────
  {name:'journal_entry',kind:'write',sig:'journal_entry{title,body(markdown),mood?(1-5 or emoji),energy?(low|medium|high),highlights?,challenges?,gratitude?,date?}',desc:'Write a journal entry.',
    describe:function(a){return 'Journal entry "'+_agentStr(a.title,50)+'"'+(a.mood?' · mood '+a.mood:'');},
    run:function(a){if(!a.title&&!a.body)return {ok:false,error:'A journal entry needs a title or body.'};
      var moodMap={'5':'😊','4':'🙂','3':'😐','2':'😫','1':'😰'};var mood=a.mood==null?'😊':(moodMap[String(a.mood)]||String(a.mood));
      var j={id:nextId(D.journal),title:_agentStr(a.title||'Journal',300),date:_agentDate(a.date)||_agentToday(),mood:mood,energy:a.energy||'medium',body:String(a.body||''),diaryBody:'',prompts:{focused:'',energizing:'',learned:''},highlights:String(a.highlights||''),challenges:String(a.challenges||''),gratitude:String(a.gratitude||''),sleep:null,exercise:'',habitsDone:(D.habits||[]).filter(function(h){return h.doneToday;}).length,habitsTotal:(D.habits||[]).length,tags:_agentArr(a.tags),scope:{personal:false,business:false},createdBy:_agentUser(),createdAt:new Date().toISOString()};
      D.journal.push(j);save('journal');var undo=_agentPushUndo('journal entry "'+j.title+'"',function(){_agentRemoveById(D.journal,j.id);save('journal');});
      return {ok:true,summary:'Wrote journal entry "'+j.title+'"',ref:{type:'journal',id:j.id},undo:undo};}},

  // ── money ───────────────────────────────────────────────────────────────
  {name:'add_transaction',kind:'write',sig:'add_transaction{payee,amount,type?(expense|income),category?,account?,date?,notes?}',desc:'Log a money transaction.',
    describe:function(a){return 'Log '+(a.type==='income'?'income':'expense')+' $'+a.amount+' · '+_agentStr(a.payee,40)+(a.category?' · '+a.category:'');},
    run:function(a){var f=_agentFin();if(!f)return {ok:false,error:'Money page not available.'};if(_finRO())return {ok:false,error:'This budget is view-only.'};
      var amt=Math.abs(_agentNum(a.amount,NaN));if(isNaN(amt)||amt<=0)return {ok:false,error:'Amount must be a positive number.'};var kind=a.type==='income'?'income':'expense';
      var cat=_agentFinCat(a.category,kind);if(a.category&&!cat)return {ok:false,error:'No category "'+a.category+'". Existing: '+(f.categories||[]).slice(0,20).map(function(c){return c.name;}).join(', ')};
      var acct=null;if(a.account){var ar=_agentFind(f.accounts||[],a.account,'name');var an=_agentNeed(ar,'accounts');if(an)return an;acct=ar.item;}
      var rec={id:String(Date.now())+Math.floor(Math.random()*1000),date:_agentDate(a.date)||_agentToday(),payee:_agentStr(a.payee||'',120),catId:cat?cat.id:'',accountId:acct?acct.id:null,notes:_agentStr(a.notes||'',500),amount:kind==='income'?amt:-amt};
      f.transactions.push(rec);_agentFinSaveAll();var undo=_agentPushUndo('transaction '+rec.payee,function(){_agentRemoveById(f.transactions,rec.id);_agentFinSaveAll();});
      return {ok:true,summary:'Logged '+kind+' $'+amt.toFixed(2)+' · '+rec.payee+(cat?' ('+cat.name+')':''),ref:{type:'money',id:rec.id},undo:undo};}},
  {name:'add_bill',kind:'write',sig:'add_bill{name,amount,dueDay(1-28),category?,account?,autopay?}',desc:'Add a recurring bill.',
    describe:function(a){return 'Add bill "'+_agentStr(a.name,40)+'" $'+a.amount+' due day '+a.dueDay;},
    run:function(a){var f=_agentFin();if(!f)return {ok:false,error:'Money page not available.'};if(_finRO())return {ok:false,error:'This budget is view-only.'};if(!a.name)return {ok:false,error:'A bill needs a name.'};
      var cat=_agentFinCat(a.category,'expense');var acct=null;if(a.account){var ar=_agentFind(f.accounts||[],a.account,'name');if(ar.item)acct=ar.item;}
      var rec={id:String(Date.now())+Math.floor(Math.random()*1000),name:_agentStr(a.name,120),amount:Math.abs(_agentNum(a.amount,0)),dueDay:Math.min(28,Math.max(1,parseInt(a.dueDay,10)||1)),catId:cat?cat.id:'',accountId:acct?acct.id:null,autopay:!!a.autopay,active:true};
      f.bills.push(rec);_agentFinSaveAll();var undo=_agentPushUndo('bill '+rec.name,function(){_agentRemoveById(f.bills,rec.id);_agentFinSaveAll();});
      return {ok:true,summary:'Added bill "'+rec.name+'" $'+rec.amount+' on day '+rec.dueDay,ref:{type:'bill',id:rec.id},undo:undo};}},
  {name:'pay_bill',kind:'write',sig:'pay_bill{id}',desc:'Mark a bill paid this month (logs the payment transaction).',
    describe:function(a){return 'Mark bill '+a.id+' paid';},
    run:function(a){var f=_agentFin();if(!f)return {ok:false,error:'Money page not available.'};if(_finRO())return {ok:false,error:'View-only budget.'};var r=_agentFind(f.bills||[],a.id,'name');var need=_agentNeed(r,'bills');if(need)return need;var b=r.item;
      var was=b.lastPaidYM;var today=new Date();var tx={id:String(Date.now())+Math.floor(Math.random()*1000),date:_agentToday(),payee:b.name,catId:b.catId,accountId:b.accountId||null,notes:'Bill payment',amount:-Math.abs(Number(b.amount)||0)};
      f.transactions.push(tx);b.lastPaidYM=_finYM(today);_agentFinSaveAll();var undo=_agentPushUndo('pay '+b.name,function(){_agentRemoveById(f.transactions,tx.id);b.lastPaidYM=was;_agentFinSaveAll();});
      return {ok:true,summary:'Paid "'+b.name+'" ($'+Math.abs(b.amount)+') and logged it',ref:{type:'bill',id:b.id},undo:undo};}},
  {name:'set_budget',kind:'write',sig:'set_budget{category,amount}',desc:'Set the monthly budget for a category (0 removes it).',
    describe:function(a){return 'Set '+a.category+' budget to $'+a.amount+'/mo';},
    run:function(a){var f=_agentFin();if(!f)return {ok:false,error:'Money page not available.'};if(_finRO())return {ok:false,error:'View-only budget.'};var cat=_agentFinCat(a.category,'expense');if(!a.category||!cat)return {ok:false,error:'No category "'+a.category+'". Existing: '+(f.categories||[]).map(function(c){return c.name;}).slice(0,25).join(', ')};
      var was=f.budgets[cat.id];var n=_agentNum(a.amount,0);f.budgets=f.budgets||{};if(!n||n<=0)delete f.budgets[cat.id];else f.budgets[cat.id]=n;
      _agentFinSaveAll();var undo=_agentPushUndo('budget '+cat.name,function(){if(was==null)delete f.budgets[cat.id];else f.budgets[cat.id]=was;_agentFinSaveAll();});
      return {ok:true,summary:'Set '+cat.name+' budget to $'+n+'/mo',ref:{type:'budget',id:cat.id},undo:undo};}},
  {name:'add_account',kind:'write',sig:'add_account{name,type(checking|savings|credit|loan|investment|cash),balance,apr?,limit?}',desc:'Add a money account.',
    describe:function(a){return 'Add '+a.type+' account "'+_agentStr(a.name,40)+'" ($'+a.balance+')';},
    run:function(a){var f=_agentFin();if(!f)return {ok:false,error:'Money page not available.'};if(_finRO())return {ok:false,error:'View-only budget.'};if(!a.name)return {ok:false,error:'An account needs a name.'};
      var rec={id:String(Date.now())+Math.floor(Math.random()*1000),name:_agentStr(a.name,120),type:a.type||'checking',balance:Math.abs(_agentNum(a.balance,0)),limit:a.limit!=null?_agentNum(a.limit,null):null,apr:a.apr!=null?_agentNum(a.apr,null):null};
      f.accounts.push(rec);_agentFinSaveAll();var undo=_agentPushUndo('account '+rec.name,function(){_agentRemoveById(f.accounts,rec.id);_agentFinSaveAll();});
      return {ok:true,summary:'Added '+rec.type+' account "'+rec.name+'"',ref:{type:'account',id:rec.id},undo:undo};}},
  {name:'add_savings_goal',kind:'write',sig:'add_savings_goal{name,target,saved?,due?}',desc:'Add a savings goal on the Money page.',
    describe:function(a){return 'Add savings goal "'+_agentStr(a.name,40)+'" target $'+a.target;},
    run:function(a){var f=_agentFin();if(!f)return {ok:false,error:'Money page not available.'};if(_finRO())return {ok:false,error:'View-only budget.'};if(!a.name)return {ok:false,error:'A savings goal needs a name.'};
      var rec={id:String(Date.now())+Math.floor(Math.random()*1000),name:_agentStr(a.name,120),icon:'🎯',target:_agentNum(a.target,0),saved:_agentNum(a.saved,0),due:_agentDate(a.due)||null};
      f.goals.push(rec);_agentFinSaveAll();var undo=_agentPushUndo('savings goal '+rec.name,function(){_agentRemoveById(f.goals,rec.id);_agentFinSaveAll();});
      return {ok:true,summary:'Added savings goal "'+rec.name+'" ($'+rec.saved+' of $'+rec.target+')',ref:{type:'savings',id:rec.id},undo:undo};}},

  // ── calendar & contacts & pipeline ──────────────────────────────────────
  {name:'create_event',kind:'write',sig:'create_event{title,date,start(HH:MM),end?(HH:MM),location?,notes?}',desc:'Add a calendar event.',
    describe:function(a){return 'Event "'+_agentStr(a.title,40)+'" '+a.date+' '+a.start+(a.end?'–'+a.end:'');},
    run:function(a){if(!a.title)return {ok:false,error:'An event needs a title.'};var ds=_agentDate(a.date);if(!ds)return {ok:false,error:'date must be YYYY-MM-DD'};var st=_agentTime(a.start)||'09:00';var en=_agentTime(a.end)||_agentMinsToTime(parseInt(st.slice(0,2),10)*60+parseInt(st.slice(3),10)+60);
      _calEvents=Array.isArray(_calEvents)?_calEvents:[];var ev={id:Date.now()+Math.floor(Math.random()*1000),title:_agentStr(a.title,200),dateStr:ds,hour:parseInt(st.slice(0,2),10),endHour:parseInt(en.slice(0,2),10)+(en.slice(3)!=='00'?1:0),start:st,end:en,location:_agentStr(a.location||'',200),color:'var(--ac)',desc:_agentStr(a.notes||'',1000)+(a.notes?' ':'')+'(Created by the assistant)'};
      _calEvents.push(ev);_agentSaveCal();var undo=_agentPushUndo('event "'+ev.title+'"',function(){_agentRemoveById(_calEvents,ev.id);_agentSaveCal();});
      return {ok:true,summary:'Added event "'+ev.title+'" on '+ds+' at '+st,ref:{type:'event',id:ev.id},undo:undo};}},
  {name:'create_contact',kind:'write',sig:'create_contact{name,company?,title?,email?,phone?,location?,tags?[],notes?}',desc:'Add a contact.',
    describe:function(a){return 'Add contact "'+_agentStr(a.name,50)+'"'+(a.company?' · '+a.company:'');},
    run:function(a){if(!a.name)return {ok:false,error:'A contact needs a name.'};D.contacts=D.contacts||[];
      var c={id:nextId(D.contacts),name:_agentStr(a.name,200),title:_agentStr(a.title||'',120),company:_agentStr(a.company||'',120),email:_agentStr(a.email||'',200),phone:_agentStr(a.phone||'',60),linkedin:'',location:_agentStr(a.location||'',120),tags:_agentArr(a.tags),notes:_agentStr(a.notes||'',2000),enriched:false,enrichedAt:null};
      D.contacts.push(c);save('contacts');var undo=_agentPushUndo('contact '+c.name,function(){_agentRemoveById(D.contacts,c.id);save('contacts');});
      return {ok:true,summary:'Added contact "'+c.name+'"',ref:{type:'contact',id:c.id},undo:undo};}},
  {name:'create_opportunity',kind:'write',sig:'create_opportunity{name,accountName,stage?(Lead|Qualified|Proposal|Negotiation|Closed Won|Closed Lost),value?,closeDate?,owner?,contact?,notes?}',desc:'Add a sales pipeline opportunity.',
    describe:function(a){return 'Add opportunity "'+_agentStr(a.name,40)+'" for '+a.accountName+(a.value?' $'+a.value:'')+(a.stage?' · '+a.stage:'');},
    run:function(a){if(!a.name)return {ok:false,error:'An opportunity needs a name.'};D.opportunities=D.opportunities||[];var stage='Lead';if(a.stage){var sd=typeof _stageDef==='function'?_stageDef(a.stage):null;stage=sd?sd.key:'Lead';}
      var now=new Date().toISOString();var o={id:nextId(D.opportunities),name:_agentStr(a.name,200),accountName:_agentStr(a.accountName||'',200),stage:stage,value:_agentNum(a.value,0),probability:null,closeDate:_agentDate(a.closeDate)||'',owner:_agentStr(a.owner||_agentUser(),120),contact:_agentStr(a.contact||'',120),notes:_agentStr(a.notes||'',2000),status:stage==='Closed Won'?'won':stage==='Closed Lost'?'lost':'open',linkedTaskIds:[],source:'manual',createdAt:now,updatedAt:now};
      D.opportunities.push(o);save('opportunities');var undo=_agentPushUndo('opportunity '+o.name,function(){_agentRemoveById(D.opportunities,o.id);save('opportunities');});
      return {ok:true,summary:'Added opportunity "'+o.name+'" ('+o.stage+')',ref:{type:'opportunity',id:o.id},undo:undo};}},
  {name:'update_opportunity',kind:'write',sig:'update_opportunity{id,stage?,value?,closeDate?,notes?,probability?}',desc:'Move a deal along or edit it.',
    describe:function(a){return 'Update opportunity '+a.id+(a.stage?' → '+a.stage:'');},
    run:function(a){var r=_agentFind(D.opportunities||[],a.id,'name');var need=_agentNeed(r,'opportunities');if(need)return need;var o=r.item;var snap=_agentSnapshot(o);
      if(a.stage){var sd=typeof _stageDef==='function'?_stageDef(a.stage):null;if(!sd)return {ok:false,error:'Unknown stage "'+a.stage+'"'};o.stage=sd.key;o.status=sd.outcome||'open';if(sd.outcome==='won'&&!o.wonAt)o.wonAt=new Date().toISOString();if(sd.outcome==='lost'&&!o.lostAt)o.lostAt=new Date().toISOString();}
      if(a.value!=null)o.value=_agentNum(a.value,o.value);if(a.closeDate!==undefined)o.closeDate=_agentDate(a.closeDate);if(a.notes!=null)o.notes=_agentStr(a.notes,2000);if(a.probability!=null)o.probability=Math.max(0,Math.min(100,parseInt(a.probability,10)));o.updatedAt=new Date().toISOString();
      save('opportunities');var undo=_agentPushUndo('edit opportunity "'+o.name+'"',function(){_agentRestore(o,snap);save('opportunities');});
      return {ok:true,summary:'Updated "'+o.name+'" ('+o.stage+')',ref:{type:'opportunity',id:o.id},undo:undo};}},

  // ── reports ─────────────────────────────────────────────────────────────
  {name:'create_widget',kind:'write',sig:'create_widget{title,source(tasks|habits|goals|journal|projects|ideas|focus|allTasks|external|time),groupBy,metric,viz(kpi|bar|line|donut|heatmap|sparkline|progress|table),filter?[{field,op,value}],range?(7d|30d|90d|365d|all)}',
    desc:'Add a widget to the Reports page. groupBy: _total, _rows, day(<dateField>), week(..), month(..), or a field (status/priority/project/title/cadence/category/stage/mood). metric: count, list, sum(<field>), avg(<field>). filter ops: eq ne contains empty notempty gt lt gte lte overdue.',
    describe:function(a){return 'Add report widget "'+_agentStr(a.title,50)+'" ('+a.source+' · '+a.groupBy+' · '+a.metric+' · '+a.viz+')';},
    run:function(a){if(typeof _reportWidgets==='undefined')return {ok:false,error:'Reports engine not loaded.'};var w={title:String(a.title||'Widget'),source:(typeof WIDGET_SOURCES!=='undefined'&&WIDGET_SOURCES[a.source])?a.source:'tasks',groupBy:String(a.groupBy||'_total'),metric:String(a.metric||'count'),viz:['kpi','bar','line','donut','heatmap','sparkline','progress','table'].indexOf(a.viz)>=0?a.viz:'bar',filter:Array.isArray(a.filter)?a.filter:[],color:a.color||'',sizeW:a.sizeW||6};
      if(a.range)w.range=String(a.range);_reportWidgets.push(w);_saveReportWidgets();try{if(curScreen==='reports')renderReports();}catch(_){}
      var undo=_agentPushUndo('widget "'+w.title+'"',function(){var i=_reportWidgets.indexOf(w);if(i>=0)_reportWidgets.splice(i,1);_saveReportWidgets();});
      return {ok:true,summary:'Added widget "'+w.title+'" to Reports',ref:{type:'widget',id:w.title},undo:undo};}},
  {name:'run_report',kind:'nav',sig:'run_report{name}',desc:'Open a saved report by name, or a Money report (monthly-summary, budget-variance, spending-by-category, spending-trend, debt-overview, income-by-stream…).',
    describe:function(a){return 'Open report "'+_agentStr(a.name,40)+'"';},
    run:function(a){var saved=_getSavedReports();var r=_agentFind(saved,a.name,'name');if(r.item){nav('reports');setTimeout(function(){try{loadSavedReport(r.item.id);}catch(_){}},200);return {ok:true,summary:'Opened saved report "'+r.item.name+'"',ref:{type:'report',id:r.item.id}};}
      if(typeof FIN_REPORTS!=='undefined'){var fr=_agentFind(FIN_REPORTS,a.name,'name');if(fr.item){_finTab='reports';_finRepOpen=fr.item.id;nav('money');setTimeout(function(){try{renderMoney();}catch(_){}},150);return {ok:true,summary:'Opened Money report "'+fr.item.name+'"',ref:{type:'money',id:fr.item.id}};}}
      if(r.ambiguous)return _agentNeed(r,'reports');return {ok:false,error:'No report named "'+a.name+'". Saved: '+saved.map(function(s){return s.name;}).join(', ')+(typeof FIN_REPORTS!=='undefined'?' · Money: '+FIN_REPORTS.map(function(x){return x.id;}).join(', '):'')};}},
  {name:'save_report',kind:'write',sig:'save_report{name,emoji?}',desc:'Save the current Reports page layout under a name.',
    describe:function(a){return 'Save current report as "'+_agentStr(a.name,40)+'"';},
    run:function(a){if(!a.name)return {ok:false,error:'A report needs a name.'};var arr=_getSavedReports();var rec={id:Date.now(),name:String(a.name).trim(),emoji:(a.emoji||'📊').slice(0,4),range:(typeof _reportRange!=='undefined'?_reportRange:'30d'),sections:(typeof _reportSections!=='undefined'?Object.assign({},_reportSections):{}),widgets:JSON.parse(JSON.stringify(_reportWidgets||[])),createdAt:new Date().toISOString()};
      arr.push(rec);_setSavedReports(arr);var undo=_agentPushUndo('save report "'+rec.name+'"',function(){_setSavedReports(_getSavedReports().filter(function(x){return x.id!==rec.id;}));});
      return {ok:true,summary:'Saved report "'+rec.name+'" ('+rec.widgets.length+' widgets)',ref:{type:'report',id:rec.id},undo:undo};}},

  // ── linking & workspace ─────────────────────────────────────────────────
  {name:'link',kind:'write',sig:'link{fromType,fromId,toType,toId}  pairs: task↔note, task↔goal, task↔project, task↔opportunity, note↔project, project↔program',
    desc:'Connect two items (both directions).',
    describe:function(a){return 'Link '+a.fromType+' '+a.fromId+' ↔ '+a.toType+' '+a.toId;},
    run:function(a){return _agentLink(a);}},
  {name:'set_detail_level',kind:'write',sig:'set_detail_level{level(1-5)}',desc:'Workspace detail dial: 1 Essentials … 5 Everything (hides/shows pages & widgets, nothing deleted).',
    describe:function(a){return 'Set workspace detail level to '+a.level;},
    run:function(a){var n=Math.max(1,Math.min(5,parseInt(a.level,10)||3));var before=_agentSnapshot((D.prefs&&D.prefs.workspace)||null);luApplyLevel(n);
      var undo=_agentPushUndo('detail level '+n,function(){if(before)D.prefs.workspace=before;else delete D.prefs.workspace;save('prefs');try{_luRebuildLayoutCSS();}catch(_){}try{initSidebars();}catch(_){}});
      return {ok:true,summary:'Detail level set to '+n,undo:undo};}},
  {name:'show_page',kind:'write',sig:'show_page{page,on(true|false)}',desc:'Show or hide a page in the sidebar.',
    describe:function(a){return (a.on===false||a.on==='false'?'Hide':'Show')+' the '+a.page+' page';},
    run:function(a){var page=String(a.page||'').toLowerCase();var def=(typeof LU_PAGES!=='undefined'?LU_PAGES:[]).find(function(p){return p.id===page;});if(!def)return {ok:false,error:'Unknown page "'+page+'"'};if(def.core)return {ok:false,error:def.label+' cannot be hidden.'};
      var on=!(a.on===false||a.on==='false');luSetPageOn(page,on);var undo=_agentPushUndo((on?'show':'hide')+' '+def.label,function(){luSetPageOn(page,!on);});
      return {ok:true,summary:(on?'Showing':'Hid')+' '+def.label,undo:undo};}},
  {name:'delete',kind:'destructive',sig:'delete{entity(task|note|project|program|goal|habit|idea|journal|contact|opportunity|mindmap|event|bill|transaction),id}',desc:'Delete an item. Always confirmed by the user; undoable this session.',
    describe:function(a){return 'DELETE '+a.entity+' '+a.id;},
    run:function(a){return _agentDelete(a);}},
];
function _agentTool(name){return LU_AGENT_TOOLS.find(function(t){return t.name===name;});}
function _agentMinsToTime(m){m=Math.max(0,Math.min(24*60,m));return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}
function _agentSaveCal(){try{localStorage.setItem('lu_calEvents',JSON.stringify(_calEvents));}catch(_){}try{if(curScreen==='calendar'&&typeof renderCal==='function')renderCal();}catch(_){}}

// ─── list / get / link / delete implementations ────────────────────────────
function _agentList(a){
  var ent=String(a.entity||'').toLowerCase(),f=String(a.filter||'').toLowerCase(),lim=Math.min(parseInt(a.limit,10)||25,60),today=_agentToday();
  var wk=new Date();wk.setDate(wk.getDate()+7);var wks=_ymd(wk);
  var rows=[],label=ent;
  var t=function(x){return {id:x.id,title:x.title,status:x.status,priority:x.priority,due:x.due||'',project:x.project||'',myDay:!!x.myDay,subtasks:(x.subtasks||[]).length};};
  switch(ent){
    case 'tasks':case 'task':{var all=(D.tasks||[]).filter(function(x){return !x.parentTaskId;});var open=all.filter(function(x){return x.status!=='Done';});
      if(f==='overdue')rows=open.filter(function(x){return x.due&&x.due<today;});else if(f==='today')rows=open.filter(function(x){return x.due===today||x.myDay;});else if(f==='myday')rows=open.filter(function(x){return x.myDay;});
      else if(f==='done')rows=all.filter(function(x){return x.status==='Done';}).sort(function(p,q){return String(q.completedAt||'').localeCompare(String(p.completedAt||''));});
      else if(f==='week')rows=open.filter(function(x){return x.due&&x.due>=today&&x.due<=wks;});else if(f==='inbox')rows=open.filter(function(x){return !x.due&&!x.projectId&&!x.myDay;});
      else if(f==='recent')rows=all.slice().sort(function(p,q){return String(q.createdAt||'').localeCompare(String(p.createdAt||''));});else rows=open;
      rows=rows.map(t);break;}
    case 'projects':case 'project':rows=(D.projects||[]).filter(function(p){return f==='active'?(p.status||'Active')==='Active':true;}).map(function(p){return {id:p.id,name:p.name,status:p.status,due:p.due,pct:p.pct||0,openTasks:(D.tasks||[]).filter(function(x){return x.projectId===p.id&&x.status!=='Done';}).length};});break;
    case 'programs':case 'program':rows=(D.programs||[]).map(function(p){return {id:p.id,name:p.name,status:p.status,projects:(p.projectIds||[]).length};});break;
    case 'goals':case 'goal':rows=(D.goals||[]).filter(function(g){return f==='active'?(g.status||'Active')==='Active':true;}).map(function(g){return {id:g.id,title:g.title,status:g.status,pct:g.pct||0,dueDate:g.dueDate||'',category:g.category,milestones:(g.milestones||[]).length};});break;
    case 'habits':case 'habit':rows=(D.habits||[]).map(function(h){return {id:h.id,title:h.title,cadence:h.cadence,streak:h.streak||0,doneToday:!!h.doneToday,status:h.status};});break;
    case 'notes':case 'note':rows=(D.notes||[]).filter(function(n){return !n.archived;}).slice().sort(function(p,q){return String(q.createdAt||'').localeCompare(String(p.createdAt||''));}).map(function(n){return {id:n.id,title:n.title,tags:(n.tags||[]).slice(0,5),noteType:n.noteType||'Note',chars:String(n.body||n.bodyHtml||'').length};});break;
    case 'ideas':case 'idea':rows=(D.ideas||[]).map(function(i){return {id:i.id,title:i.title,stage:i.stage,idea_type:i.idea_type,ice:(i.ice_impact||0)+'/'+(i.ice_confidence||0)+'/'+(i.ice_ease||0)};});break;
    case 'contacts':case 'contact':rows=(D.contacts||[]).map(function(c){return {id:c.id,name:c.name,company:c.company||'',title:c.title||'',email:c.email||''};});break;
    case 'opportunities':case 'opportunity':case 'deals':case 'pipeline':rows=(D.opportunities||[]).filter(function(o){return f==='open'?o.status==='open':true;}).map(function(o){return {id:o.id,name:o.name,account:o.accountName,stage:o.stage,value:o.value,closeDate:o.closeDate||'',status:o.status};});break;
    case 'mindmaps':case 'mindmap':rows=(D.mindmaps||[]).map(function(m){return {id:m.id,title:m.title,nodes:(m.nodes||[]).length};});break;
    case 'journal':rows=(D.journal||[]).slice().sort(function(p,q){return String(q.createdAt||q.date||'').localeCompare(String(p.createdAt||p.date||''));}).map(function(j){return {id:j.id,title:j.title,date:j.date,mood:j.mood||'',preview:_agentStr(String(j.body||'').replace(/\s+/g,' '),120)};});break;
    case 'events':case 'calendar':{var evs=Array.isArray(_calEvents)?_calEvents:[];rows=evs.filter(function(e){if(f==='today')return e.dateStr===today;if(f==='week'||!f)return e.dateStr>=today&&e.dateStr<=wks;if(f==='month')return e.dateStr>=today&&e.dateStr<=today.slice(0,7)+'-31';return true;}).sort(function(p,q){return (p.dateStr+String(p.hour).padStart(2,'0')).localeCompare(q.dateStr+String(q.hour).padStart(2,'0'));}).map(function(e){return {id:e.id,title:e.title,date:e.dateStr,hour:e.hour,end:e.end||e.endHour,location:e.location||''};});break;}
    case 'bills':{var fb=_agentFin();if(!fb)return {ok:false,error:'Money not available.'};rows=(fb.bills||[]).map(function(b){return {id:b.id,name:b.name,amount:b.amount,dueDay:b.dueDay,category:_finCat(b.catId).name,autopay:!!b.autopay,active:b.active!==false,lastPaid:b.lastPaidYM||''};});break;}
    case 'accounts':{var fa=_agentFin();if(!fa)return {ok:false,error:'Money not available.'};rows=(fa.accounts||[]).map(function(x){return {id:x.id,name:x.name,type:x.type,balance:x.balance,apr:x.apr||null,limit:x.limit||null};});break;}
    case 'transactions':{var ft=_agentFin();if(!ft)return {ok:false,error:'Money not available.'};var ym=today.slice(0,7);rows=(ft.transactions||[]).filter(function(x){return f==='month'||!f?String(x.date||'').slice(0,7)===ym:true;}).sort(function(p,q){return String(q.date).localeCompare(String(p.date));}).map(function(x){return {id:x.id,date:x.date,payee:x.payee,amount:x.amount,category:_finCat(x.catId).name};});label='transactions ('+(f||'this month')+')';break;}
    case 'budgets':{var fg=_agentFin();if(!fg)return {ok:false,error:'Money not available.'};var ym2=today.slice(0,7);var by=_finSpentByCat(ym2);rows=Object.keys(fg.budgets||{}).map(function(cid){var bud=_finBudgetFor(cid,ym2);return {category:_finCat(cid).name,catId:cid,budget:bud,spent:Math.round(by[cid]||0),left:Math.round(bud-(by[cid]||0))};});break;}
    case 'savings':{var fs=_agentFin();if(!fs)return {ok:false,error:'Money not available.'};rows=(fs.goals||[]).map(function(g){return {id:g.id,name:g.name,target:g.target,saved:g.saved,due:g.due||''};});break;}
    case 'reports':case 'report':rows=_getSavedReports().map(function(r){return {id:r.id,name:r.name,widgets:(r.widgets||[]).length};}).concat(typeof FIN_REPORTS!=='undefined'?FIN_REPORTS.map(function(r){return {id:r.id,name:r.name,money:true};}):[]);break;
    case 'pages':case 'page':rows=(typeof LU_PAGES!=='undefined'?LU_PAGES:[]).map(function(p){return {id:p.id,label:p.label,group:p.group};});break;
    case 'widgets':rows=(typeof _reportWidgets!=='undefined'?_reportWidgets:[]).map(function(w,i){return {index:i,title:w.title,source:w.source,viz:w.viz};});break;
    default:return {ok:false,error:'Unknown entity "'+ent+'". Use one of: tasks projects programs goals habits notes ideas contacts opportunities mindmaps journal events bills accounts transactions budgets savings reports pages'};
  }
  var total=rows.length;rows=rows.slice(0,lim);
  return {ok:true,summary:'Listed '+total+' '+label+(f?' ('+f+')':''),data:{total:total,rows:rows}};
}
function _agentGet(a){
  var ent=String(a.entity||'').toLowerCase();var pools={task:[D.tasks,'title'],tasks:[D.tasks,'title'],project:[D.projects,'name'],projects:[D.projects,'name'],program:[D.programs,'name'],programs:[D.programs,'name'],goal:[D.goals,'title'],goals:[D.goals,'title'],habit:[D.habits,'title'],habits:[D.habits,'title'],note:[D.notes,'title'],notes:[D.notes,'title'],idea:[D.ideas,'title'],ideas:[D.ideas,'title'],contact:[D.contacts,'name'],contacts:[D.contacts,'name'],opportunity:[D.opportunities,'name'],opportunities:[D.opportunities,'name'],mindmap:[D.mindmaps,'title'],mindmaps:[D.mindmaps,'title'],journal:[D.journal,'title']};
  var p=pools[ent];if(!p)return {ok:false,error:'Unknown entity "'+ent+'"'};var r=_agentFind(p[0]||[],a.id,p[1]);var need=_agentNeed(r,ent);if(need)return need;
  var item=_agentSnapshot(r.item);['bodyHtml','diaryBody','descriptionHtml','comments','pctHistory','answers','votes'].forEach(function(k){delete item[k];});
  if(item.body)item.body=_agentStr(String(item.body).replace(/\s+/g,' '),1500);if(item.notes)item.notes=_agentStr(item.notes,800);if(item.description)item.description=_agentStr(item.description,800);
  if(ent.indexOf('mindmap')===0){item.nodes=(item.nodes||[]).map(function(n){return {id:n.id,text:n.text};});}
  if(ent.indexOf('project')===0){item.tasks=(D.tasks||[]).filter(function(t){return t.projectId===item.id;}).map(function(t){return {id:t.id,title:t.title,status:t.status,due:t.due||''};}).slice(0,30);}
  if(ent.indexOf('program')===0){item.projects=(item.projectIds||[]).map(function(id){var pr=(D.projects||[]).find(function(x){return x.id===id;});return pr?{id:pr.id,name:pr.name,status:pr.status}:{id:id};});}
  return {ok:true,summary:'Read '+ent+' '+(item.title||item.name||item.id),data:item};
}
function _agentLink(a){
  var ft=String(a.fromType||'').toLowerCase(),tt=String(a.toType||'').toLowerCase();
  var pool=function(t){return {task:[D.tasks,'title'],note:[D.notes,'title'],goal:[D.goals,'title'],project:[D.projects,'name'],program:[D.programs,'name'],opportunity:[D.opportunities,'name']}[t];};
  var pf=pool(ft),pt=pool(tt);if(!pf||!pt)return {ok:false,error:'Unsupported link types '+ft+'↔'+tt};
  var rf=_agentFind(pf[0]||[],a.fromId,pf[1]);var nf=_agentNeed(rf,ft+'s');if(nf)return nf;var rt=_agentFind(pt[0]||[],a.toId,pt[1]);var nt=_agentNeed(rt,tt+'s');if(nt)return nt;
  var A=rf.item,B=rt.item;var pair=[ft,tt].sort().join('-');var keys=[];var addTo=function(o,k,v){o[k]=o[k]||[];if(o[k].indexOf(v)<0){o[k].push(v);keys.push([o,k,v]);}};
  var undoOps=[];
  switch(pair){
    case 'note-task':{var task=ft==='task'?A:B,note=ft==='note'?A:B;addTo(task,'linkedNoteIds',note.id);addTo(note,'linkedTaskIds',task.id);undoOps=['tasks','notes'];break;}
    case 'goal-task':{var t2=ft==='task'?A:B,g=ft==='goal'?A:B;var was=t2.linkedGoalId;t2.linkedGoalId=g.id;keys.push([t2,'linkedGoalId',was,true]);addTo(g,'linkedTaskIds',t2.id);undoOps=['tasks','goals'];break;}
    case 'project-task':{var t3=ft==='task'?A:B,p=ft==='project'?A:B;keys.push([t3,'projectId',t3.projectId,true]);keys.push([t3,'project',t3.project,true]);t3.projectId=p.id;t3.project=p.name;undoOps=['tasks'];break;}
    case 'opportunity-task':{var t4=ft==='task'?A:B,o=ft==='opportunity'?A:B;keys.push([t4,'linkedOpportunityId',t4.linkedOpportunityId,true]);t4.linkedOpportunityId=o.id;addTo(o,'linkedTaskIds',t4.id);undoOps=['tasks','opportunities'];break;}
    case 'note-project':{var n=ft==='note'?A:B,p2=ft==='project'?A:B;addTo(n,'linkedProjectIds',p2.id);undoOps=['notes'];break;}
    case 'program-project':{var pg=ft==='program'?A:B,p3=ft==='project'?A:B;addTo(pg,'projectIds',p3.id);undoOps=['programs'];break;}
    default:return {ok:false,error:'Unsupported link pair '+ft+'↔'+tt};
  }
  undoOps.forEach(function(k){save(k);});
  var undo=_agentPushUndo('link '+ft+'↔'+tt,function(){keys.forEach(function(k){if(k[3])k[0][k[1]]=k[2];else k[0][k[1]]=(k[0][k[1]]||[]).filter(function(v){return v!==k[2];});});undoOps.forEach(function(k){save(k);});});
  return {ok:true,summary:'Linked '+ft+' "'+(A.title||A.name)+'" ↔ '+tt+' "'+(B.title||B.name)+'"',undo:undo};
}
function _agentDelete(a){
  var ent=String(a.entity||'').toLowerCase();
  var map={task:[D.tasks,'title','tasks'],note:[D.notes,'title','notes'],project:[D.projects,'name','projects'],program:[D.programs,'name','programs'],goal:[D.goals,'title','goals'],habit:[D.habits,'title','habits'],idea:[D.ideas,'title','ideas'],journal:[D.journal,'title','journal'],contact:[D.contacts,'name','contacts'],opportunity:[D.opportunities,'name','opportunities'],mindmap:[D.mindmaps,'title','mindmaps']};
  if(ent==='event'){var evs=Array.isArray(_calEvents)?_calEvents:[];var re=_agentFind(evs,a.id,'title');var ne=_agentNeed(re,'events');if(ne)return ne;var idx=evs.indexOf(re.item);evs.splice(idx,1);_agentSaveCal();var u1=_agentPushUndo('delete event "'+re.item.title+'"',function(){evs.splice(Math.min(idx,evs.length),0,re.item);_agentSaveCal();});return {ok:true,summary:'Deleted event "'+re.item.title+'"',undo:u1};}
  if(ent==='bill'||ent==='transaction'){var f=_agentFin();if(!f)return {ok:false,error:'Money not available.'};if(_finRO())return {ok:false,error:'View-only budget.'};var arr=ent==='bill'?f.bills:f.transactions;var rr=_agentFind(arr,a.id,ent==='bill'?'name':'payee');var nn=_agentNeed(rr,ent+'s');if(nn)return nn;var ix=arr.indexOf(rr.item);arr.splice(ix,1);_agentFinSaveAll();var u2=_agentPushUndo('delete '+ent,function(){arr.splice(Math.min(ix,arr.length),0,rr.item);_agentFinSaveAll();});return {ok:true,summary:'Deleted '+ent+' "'+(rr.item.name||rr.item.payee)+'"',undo:u2};}
  var m=map[ent];if(!m)return {ok:false,error:'Cannot delete "'+ent+'"'};var list=m[0]||[];var r=_agentFind(list,a.id,m[1]);var need=_agentNeed(r,ent+'s');if(need)return need;
  var i=list.indexOf(r.item);list.splice(i,1);if(ent==='mindmap')saveMindmaps();else save(m[2]);
  var undo=_agentPushUndo('delete '+ent+' "'+(r.item.title||r.item.name)+'"',function(){list.splice(Math.min(i,list.length),0,r.item);if(ent==='mindmap')saveMindmaps();else save(m[2]);});
  return {ok:true,summary:'Deleted '+ent+' "'+(r.item.title||r.item.name)+'"',undo:undo};
}

// ─── prompt ────────────────────────────────────────────────────────────────
function _agentCatalog(){
  var groups={read:[],nav:[],write:[],destructive:[]};
  LU_AGENT_TOOLS.forEach(function(t){groups[t.kind].push(t.sig);});
  return ['TOOLS — call as {"tool":"name","args":{...}}. Names/ids: any id field also accepts a name; the app resolves unique names and returns candidates when ambiguous (then ASK).',
    'READ (run instantly): '+groups.read.join(' · '),
    'NAVIGATE (instant): '+groups.nav.join(' · '),
    'WRITE (user confirms unless they enabled auto-run): '+groups.write.join(' · '),
    'DESTRUCTIVE (always confirmed): '+groups.destructive.join(' · ')].join('\n');
}
function _agentSystemPrompt(lastUserText){
  var name=(_agentUser()||'').split(' ')[0]||'there';
  var head=[
    'You are the LevelUp Assistant — an expert operator of this personal "second brain" app who can take ACTIONS in it, not just talk. You help '+name+' capture, organise, decide, and never be lost about what to do next.',
    '',
    'RESPONSE FORMAT — reply with ONE JSON object and nothing else:',
    '{"say":"markdown for the user","actions":[{"tool":"create_task","args":{...},"why":"6 words"}],"ask":{"question":"...","options":["...","..."]},"next":"wait"|"continue"}',
    '- say: 1–5 short sentences (or a tight list). Name real pages and items. No preamble like "Sure!".',
    '- actions: optional. Read/navigate tools run at once; writes are shown to the user to approve. Put several related actions in ONE reply (e.g. a project plus its tasks). Use ids from WORKSPACE, a list/search/get result, or a name.',
    '- ask: optional. Use it whenever a required detail is missing or a choice matters (which project? due when? which of these three?). Give 2–4 concrete options. Do NOT ask about things you can look up with list/search/status.',
    '- next: "continue" when you need the tool results before you can finish (e.g. search first, then create). Otherwise "wait". Never loop more than a few steps.',
    '',
    'WORKING STYLE:',
    '- If the request is clear, DO it (propose the actions) and say what you did in one line. If it is ambiguous, ask ONE crisp question with options.',
    '- Walk through bigger setups step by step: say the plan in one sentence, act, then offer the natural next step as an ask.',
    '- "What should I do next?" / "I feel lost": call status if you have not this turn, then recommend ONE concrete next action grounded in overdue/today/inbox/goals/habits/bills, and offer to do it.',
    '- Recommendations and decisions: reason from the actual data (status, list, get, report_data). Be direct — give a recommendation, then the 2–3 reasons.',
    '- Dates: today is '+_agentToday()+'. Output ISO dates (YYYY-MM-DD) and 24h HH:MM times.',
    '- Never invent ids or claim something was done — actions are proposals until the results come back.',
    '- Product questions ("how do I…", routines, features): answer from the primer and help tool, naming the page and keystroke.',
    '',
    (typeof LU_AI_PRIMER!=='undefined'?LU_AI_PRIMER:''),
    '',
    _agentCatalog()
  ].join('\n');
  var status='WORKSPACE NOW:\n'+_agentStatusLine();
  var know='';
  try{if(lastUserText&&typeof _luIsProductQuestion==='function'&&_luIsProductQuestion(lastUserText)&&typeof _luKnowledgeHits==='function')know=_luKnowledgeHits(lastUserText,900);}catch(_){}
  var ctx='';try{ctx=typeof _buildAIContext==='function'?_buildAIContext():'';}catch(_){}
  var room=AGENT_SYS_MAX-head.length-status.length-(know?know.length+30:0)-40;
  ctx=_aiClampStr(ctx,Math.max(0,Math.min(ctx.length,room)));
  var out=head+'\n\n'+status+(know?'\n\nRELEVANT HELP:\n'+know:'')+(ctx?'\n\n'+ctx:'');
  return _aiClampStr(out,AGENT_SYS_MAX);
}

// ─── parse ─────────────────────────────────────────────────────────────────
function _agentParse(text){
  text=String(text==null?'':text).trim();
  var obj=null;
  var tryParse=function(s){try{var o=JSON.parse(s);return (o&&typeof o==='object')?o:null;}catch(_){return null;}};
  obj=tryParse(text);
  if(!obj){var fence=text.match(/```(?:json)?\s*([\s\S]*?)```/i);if(fence)obj=tryParse(fence[1].trim());}
  if(!obj){var a=text.indexOf('{'),b=text.lastIndexOf('}');if(a>=0&&b>a)obj=tryParse(text.slice(a,b+1));}
  if(!obj)return {say:text||"I didn't get a usable reply — try again.",actions:[],ask:null,next:'wait',raw:true};
  var actions=Array.isArray(obj.actions)?obj.actions.filter(function(x){return x&&typeof x==='object'&&x.tool;}).map(function(x){return {tool:String(x.tool),args:(x.args&&typeof x.args==='object')?x.args:{},why:x.why?String(x.why):''};}):[];
  var ask=null;if(obj.ask&&typeof obj.ask==='object'&&obj.ask.question){ask={question:String(obj.ask.question),options:Array.isArray(obj.ask.options)?obj.ask.options.map(String).slice(0,6):[]};}
  else if(typeof obj.ask==='string'&&obj.ask.trim())ask={question:obj.ask,options:[]};
  var say=typeof obj.say==='string'?obj.say:(typeof obj.message==='string'?obj.message:(typeof obj.text==='string'?obj.text:''));
  if(!say&&!actions.length&&!ask)say=text;
  return {say:say,actions:actions,ask:ask,next:obj.next==='continue'?'continue':'wait'};
}

// ─── execution ─────────────────────────────────────────────────────────────
function _agentDescribe(act){
  var t=_agentTool(act.tool);
  if(!t)return 'Unknown tool "'+act.tool+'"';
  try{if(t.describe)return t.describe(act.args||{});}catch(_){}
  return t.name.replace(/_/g,' ')+' '+_agentStr(JSON.stringify(act.args||{}),80);
}
function _agentExec(act){
  var t=_agentTool(act.tool);
  if(!t)return {ok:false,error:'Unknown tool "'+act.tool+'". Available: '+LU_AGENT_TOOLS.map(function(x){return x.name;}).join(', ')};
  try{var r=t.run(act.args||{})||{ok:false,error:'no result'};if(r.ok&&t.kind!=='read'&&t.kind!=='nav')_agentRerender();return r;}
  catch(e){console.error('[agent] tool failed',act,e);return {ok:false,error:String(e&&e.message||e)};}
}
function _agentResultsForModel(results){
  var lines=results.map(function(r,i){var o={tool:r.tool,ok:r.ok};if(r.summary)o.summary=r.summary;if(r.error)o.error=r.error;if(r.candidates)o.candidates=r.candidates;if(r.ref)o.ref=r.ref;if(r.data!==undefined)o.data=r.data;
    var s=JSON.stringify(o);if(s.length>1400)s=s.slice(0,1399)+'…';return s;});
  var text='TOOL RESULTS:\n'+lines.join('\n');
  return _aiClampStr(text,AGENT_TOOLRES_MAX);
}

// ─── transcript ────────────────────────────────────────────────────────────
function _agentPush(msg){
  D.prefs.aiChat=D.prefs.aiChat||{messages:[]};
  if(!Array.isArray(D.prefs.aiChat.messages))D.prefs.aiChat.messages=[];
  msg.ts=msg.ts||Date.now();
  D.prefs.aiChat.messages.push(msg);
  if(D.prefs.aiChat.messages.length>50)D.prefs.aiChat.messages=D.prefs.aiChat.messages.slice(-50);
  save('prefs');
  return D.prefs.aiChat.messages.length-1;
}
function _agentTurnsForModel(){
  var hist=_aiChatHistory();
  var turns=[];
  hist.slice(-AGENT_MAX_TURNS).forEach(function(m){
    if(!m)return;
    if(m.role==='user'){turns.push({role:'user',content:_aiClampStr(m.content,m.tool?AGENT_TOOLRES_MAX:AGENT_TURN_MAX)});}
    else if(m.role==='assistant'){
      var body=String(m.content||'');
      if(Array.isArray(m.actions)&&m.actions.length){body+='\n[actions: '+m.actions.map(function(a){return a.tool+(a.ok===false?' ✗':a.ok?' ✓':' (not run)')+(a.summary?' '+_agentStr(a.summary,80):'');}).join('; ')+']';}
      if(m.ask&&m.ask.question)body+='\n[asked: '+_agentStr(m.ask.question,120)+']';
      turns.push({role:'assistant',content:_aiClampStr(body,AGENT_TURN_MAX)});
    }
  });
  return turns;
}

// ─── the loop ──────────────────────────────────────────────────────────────
function _agentSetStatus(s){var el=document.getElementById('ai-panel-status');if(el)el.textContent=s;}
function _agentTyping(on){
  var c=document.getElementById('ai-chat');if(!c)return;
  var t=document.getElementById('ai-typing');
  if(on){if(!t){t=document.createElement('div');t.className='ai-chat-typing';t.id='ai-typing';t.innerHTML='<span></span><span></span><span></span>';c.appendChild(t);}c.scrollTop=c.scrollHeight;}
  else if(t)t.remove();
}
async function _agentCall(lastUserText){
  var cfg=_getAIConfig();
  var sys=_agentSystemPrompt(lastUserText);
  var turns=_agentTurnsForModel();
  var res=await _trpc('ai.agent',{system:sys,messages:turns,provider:cfg.provider||'manus',apiKey:cfg.apiKey||undefined,jsonMode:true,maxTokens:2000},'mutation');
  return String(res&&(res.result||res.text)||'');
}
// Older server without ai.agent → answer-only path through ai.assist.
async function _agentFallbackAnswer(text){
  var cfg=_getAIConfig();
  var history=_aiChatHistory().slice(-10,-1);
  var sys=_aiChatSystemPrompt(history);
  var res=await _trpc('ai.assist',{systemPrompt:sys,userContent:_aiClampStr(text,AI_USER_MAX),provider:cfg.provider||'manus',apiKey:cfg.apiKey||undefined},'mutation');
  return String(res&&(res.result||res.text)||'').trim();
}
function _agentWaitForConfirm(mi){
  return new Promise(function(resolve){_agentWaiter={mi:mi,resolve:resolve};});
}
function _agentConfirm(mi,run){
  var msgs=_aiChatHistory();var m=msgs[mi];
  if(!m||!m.pending){if(_agentWaiter&&_agentWaiter.mi===mi){var w=_agentWaiter;_agentWaiter=null;w.resolve(null);}return;}
  var selected=[];
  if(run){
    var boxes=document.querySelectorAll('[data-agent-mi="'+mi+'"] input[type=checkbox][data-idx]');
    var picked={};boxes.forEach(function(b){picked[b.getAttribute('data-idx')]=b.checked;});
    m.pending.forEach(function(a,i){if(picked[String(i)]!==false)selected.push(a);});
  }
  var w2=_agentWaiter;_agentWaiter=null;
  if(w2&&w2.mi===mi)w2.resolve(run?selected:null);
  else{ // card was re-rendered after the loop ended (e.g. panel reopened) — run directly
    _agentRunPending(mi,run?selected:null);
  }
}
function _agentRunPending(mi,selected){
  var msgs=_aiChatHistory();var m=msgs[mi];if(!m)return [];
  var pending=m.pending||[];m.pending=null;
  var results=[];
  m.actions=pending.map(function(a){
    var chosen=selected&&selected.indexOf(a)>=0;
    if(!chosen)return {tool:a.tool,args:a.args,summary:_agentDescribe(a),skipped:true};
    var r=_agentExec(a);var rec={tool:a.tool,args:a.args,ok:!!r.ok,summary:r.ok?r.summary:(r.error||'failed'),ref:r.ref||null,undo:r.undo||null,candidates:r.candidates||null};
    results.push(Object.assign({tool:a.tool},r));return rec;
  });
  save('prefs');
  return results;
}
async function _agentSend(text){
  if(_agentBusy)return;
  text=String(text||'').trim();if(!text)return;
  _luAgentCSS();
  _agentPush({role:'user',content:text});
  _renderAIChatHistory();
  _agentBusy=true;var sendBtn=document.getElementById('ai-send-btn');if(sendBtn)sendBtn.disabled=true;
  _agentTyping(true);_agentSetStatus('Thinking…');
  var lastUserText=text;
  try{
    for(var step=0;step<AGENT_MAX_STEPS;step++){
      var raw;
      try{raw=await _agentCall(lastUserText);}
      catch(e){
        var msg=String(e&&e.message||e);
        if(/No "mutation"-procedure|No procedure|not found on path|404/i.test(msg)&&step===0){
          // server predates ai.agent — degrade to the answer-only chat
          var ans=await _agentFallbackAnswer(text);
          _agentPush({role:'assistant',content:ans||"I didn't get a response.",fallback:true});
          break;
        }
        throw e;
      }
      var parsed=_agentParse(raw);
      var mi=_agentPush({role:'assistant',content:parsed.say||'',ask:parsed.ask,pending:null,actions:null});
      var m=_aiChatHistory()[mi];
      if(!parsed.actions.length){_renderAIChatHistory();break;}
      // split instant vs confirm-needed
      var prefs=_agentPrefs();
      var instant=[],needOk=[];
      parsed.actions.forEach(function(a){var t=_agentTool(a.tool);if(!t){needOk.push(a);return;}
        if(t.kind==='read'||t.kind==='nav')instant.push(a);
        else if(t.kind==='write'&&prefs.autoWrite)instant.push(a);
        else needOk.push(a);});
      var results=[];
      // run instant ones now
      m.actions=[];
      instant.forEach(function(a){var r=_agentExec(a);m.actions.push({tool:a.tool,args:a.args,ok:!!r.ok,summary:r.ok?r.summary:(r.error||'failed'),ref:r.ref||null,undo:r.undo||null,candidates:r.candidates||null});results.push(Object.assign({tool:a.tool},r));});
      if(needOk.length){
        m.pending=needOk;save('prefs');_renderAIChatHistory();_agentTyping(false);_agentSetStatus('Waiting for your go-ahead…');
        var selected=await _agentWaitForConfirm(mi);
        _agentTyping(true);_agentSetStatus('Working…');
        var more=_agentRunPending(mi,selected);
        // merge: keep instant records first, then the confirmed ones
        var confirmedRecs=m.actions;m.actions=(confirmedRecs||[]);
        results=results.concat(more);
        if(selected===null){
          // user skipped: tell the model once, don't loop
          _agentPush({role:'user',content:'TOOL RESULTS:\n(The user skipped the proposed actions. Do not repeat them unless asked.)',tool:true,hidden:true});
          _renderAIChatHistory();break;
        }
      }
      save('prefs');_renderAIChatHistory();
      if(!results.length){break;}
      // relay results; continue only if the model asked to or a tool needs clarification
      var needsMore=parsed.next==='continue'||results.some(function(r){return r.candidates||(!r.ok&&/which|Several/i.test(r.error||''));})||results.some(function(r){return r.data!==undefined;});
      _agentPush({role:'user',content:_agentResultsForModel(results),tool:true,hidden:true});
      if(!needsMore){break;}
      lastUserText=text;
      _agentSetStatus('Working… step '+(step+2));
    }
  }catch(e){
    var rawErr=String(e&&e.message||e);
    var tooBig=/too_big|Too big|too large/i.test(rawErr);
    _agentPush({role:'assistant',content:tooBig?'⚠️ That conversation got too large to send. **Clear the chat** (🗑) and ask again — nothing in your workspace was changed.':'⚠️ I couldn\'t reach the AI provider.\n\n'+rawErr.slice(0,200)+'\n\nCheck **Settings → AI Features** for a working key.'});
  }finally{
    _agentBusy=false;if(sendBtn)sendBtn.disabled=false;_agentTyping(false);_agentSetStatus('Ready · I can act on your workspace');
    _renderAIChatHistory();
  }
}

// ─── rendering (overrides part2's chat renderers) ──────────────────────────
function _agentRenderActions(m,mi){
  var html='';
  var kindOf=function(tool){var t=_agentTool(tool);return t?t.kind:'write';};
  if(m.pending&&m.pending.length){
    var live=_agentWaiter&&_agentWaiter.mi===mi;
    html+='<div class="agent-card" data-agent-mi="'+mi+'"><div class="agent-card-h">✋ Approve these actions? <small>'+m.pending.length+' proposed</small></div>';
    m.pending.forEach(function(a,i){var k=kindOf(a.tool);html+='<div class="agent-act"><input type="checkbox" data-idx="'+i+'" checked><span class="k '+k+'">'+(k==='destructive'?'delete':k)+'</span><div class="d">'+esc(_agentDescribe(a))+(a.why?'<small>'+esc(a.why)+'</small>':'')+'</div></div>';});
    html+='<div class="agent-card-f"><button class="btn btn-p" onclick="_agentConfirm('+mi+',true)">✓ Run selected</button><button class="btn btn-s" onclick="_agentConfirm('+mi+',false)">Skip</button>';
    if(!m.pending.some(function(a){return kindOf(a.tool)==='destructive';}))html+='<label><input type="checkbox" onchange="_agentSetPref(\'autoWrite\',this.checked)" '+(_agentPrefs().autoWrite?'checked':'')+'> don\'t ask again for creates/edits</label>';
    html+='</div></div>';
    return html;
  }
  if(Array.isArray(m.actions)&&m.actions.length){
    html+='<div class="agent-card"><div class="agent-card-h">⚙ Actions <small>'+m.actions.filter(function(a){return a.ok;}).length+' done'+(m.actions.some(function(a){return a.ok===false;})?' · '+m.actions.filter(function(a){return a.ok===false;}).length+' failed':'')+'</small></div>';
    m.actions.forEach(function(a){
      var k=kindOf(a.tool);
      var st=a.skipped?'<span style="color:var(--t3)">skipped</span>':(a.ok?'<span class="ok">✓</span>':'<span class="err">✗</span>');
      var open=(a.ok&&a.ref&&a.ref.type&&a.ref.type!=='money'&&a.ref.type!=='budget')?'<button onclick="_agentOpen('+JSON.stringify(a.ref).replace(/"/g,'&quot;')+')">Open</button>':'';
      var undo=(a.ok&&a.undo&&_agentUndoStack.some(function(u){return u.id===a.undo;}))?'<button onclick="_agentUndoById('+a.undo+')">↶ Undo</button>':'';
      html+='<div class="agent-act"><span class="k '+k+'">'+(k==='destructive'?'delete':k)+'</span><div class="d">'+esc(a.summary||_agentDescribe(a))+(a.candidates?'<small>Candidates: '+esc(a.candidates.map(function(c){return '#'+c.id+' '+c.name;}).join(' · '))+'</small>':'')+'</div><div class="st">'+st+open+undo+'</div></div>';
    });
    html+='</div>';
  }
  return html;
}
function _agentRenderAsk(m){
  if(!m.ask||!m.ask.question)return '';
  var html='<div class="agent-ask" style="width:100%"><div style="width:100%;font-weight:600;margin-bottom:2px">'+esc(m.ask.question)+'</div>';
  (m.ask.options||[]).forEach(function(o){html+='<button onclick="_aiQuickSend(\''+esc(String(o)).replace(/'/g,'&#39;').replace(/\n/g,' ')+'\')">'+esc(String(o))+'</button>';});
  return html+'</div>';
}
function _agentEmptyState(){
  var first=(_agentUser()||'').split(' ')[0]||'there';
  return '<div class="ai-chat-msg bot">👋 Hi '+esc(first)+'! I\'m your LevelUp assistant — and I can <b>do</b> things now, not just answer.'+
    '<br><br>Tell me in plain words and I\'ll create tasks, projects, notes, goals, habits, mind maps, ideas, journal entries, money items and reports; move things along; link them together; and walk you through anything step by step. I\'ll ask before I change anything, and every change can be undone.'+
    '<ul style="margin:8px 0;padding-left:20px"><li>"What should I do next?"</li><li>"Set up a project for the Q4 launch with the first five tasks"</li><li>"Log $42 at Costco under groceries"</li><li>"Mind-map my options for the pricing decision"</li><li>"I feel behind — help me get back on track"</li></ul>'+
    '<div style="font-size:11px;color:var(--t3)">Ctrl/⌘ J opens me from any page. ⚙ in the header controls whether I ask before acting.</div></div>';
}
window._renderAIChatHistory=function(){
  _luAgentCSS();
  var c=document.getElementById('ai-chat');if(!c)return;
  var msgs=_aiChatHistory();
  if(!msgs.length){c.innerHTML=_agentEmptyState();}
  else{
    c.innerHTML=msgs.map(function(m,mi){
      if(m.role==='user'){
        if(m.tool||m.hidden){var n=(String(m.content||'').match(/\n/g)||[]).length;return '<div class="ai-chat-msg tool">↳ relayed '+Math.max(1,n)+' result'+(n===1?'':'s')+' to the assistant</div>';}
        return '<div class="ai-chat-msg user">'+esc(m.content)+'<div class="ai-chat-msg-meta">'+_fmtChatTime(m.ts)+'</div></div>';
      }
      var body=m.content?('<div class="agent-say">'+(typeof renderMd==='function'?renderMd(m.content):esc(m.content))+'</div>'):'';
      return '<div class="ai-chat-msg bot">'+body+_agentRenderActions(m,mi)+_agentRenderAsk(m)+'<div class="ai-chat-msg-meta">'+_fmtChatTime(m.ts)+(m.fallback?' · answer-only mode':'')+'</div></div>';
    }).join('');
  }
  if(_agentBusy)_agentTyping(true);
  c.scrollTop=c.scrollHeight;
  _renderAISuggestions();
  if(typeof _updateAIMsgCount==='function')_updateAIMsgCount();
  _agentEnsureHeader();
};
window._renderAISuggestions=function(){
  var el=document.getElementById('ai-suggestions');if(!el)return;
  var screen=(typeof curScreen!=='undefined'?curScreen:'home')||'home';
  var sets={
    home:['Set something up for me','Brief me on today'],
    myday:['Plan my day — pick my three tasks','Block time for my top task'],
    tasks:['Triage my overdue tasks','Break my biggest task into subtasks','Add a task…'],
    notes:['Turn my latest note into tasks','Create a note from what we discussed'],
    projects:['Create a project with its first tasks','Which project has no next action?'],
    programs:['Create a program and link projects'],
    goals:['Check in on my top goal','Create a goal with milestones'],
    habits:['Tick off what I did today','Add a habit'],
    journal:['Write today\'s journal entry for me','What themes keep coming up?'],
    money:['Log an expense','Which bills are due this week?','Am I over budget anywhere?'],
    pipeline:['Move a deal to the next stage','Add an opportunity'],
    calendar:['Add an event','What does this week look like?'],
    ideas:['Capture an idea','Score my ideas by ICE'],
    mindmaps:['Mind-map a decision for me'],
    reports:['Add a widget: overdue tasks by project','Summarise this report'],
    help:['Teach me the weekly review','How do I get the most out of this?'],
  };
  var picks=['🧭 What should I do next?'].concat(sets[screen]||sets.home);
  el.innerHTML=picks.map(function(s){var q=s.replace(/^🧭 /,'');return '<button onclick="_aiQuickSend(\''+esc(q).replace(/'/g,'&#39;')+'\')">'+esc(s)+'</button>';}).join('');
};
window.sendAIMsg=async function(){
  var inp=document.getElementById('ai-input');
  var msg=(inp&&inp.value||'').trim();
  if(!msg||_agentBusy)return;
  inp.value='';try{autoSizeAIInput(inp);}catch(_){}
  await _agentSend(msg);
};
// header: ⚙ settings popover + ↶ undo
function _agentEnsureHeader(){
  var h=document.querySelector('#ai-panel .ai-panel-h-actions');if(!h||document.getElementById('agent-cfg-btn'))return;
  var b=document.createElement('button');b.id='agent-cfg-btn';b.title='Assistant settings';b.textContent='⚙';b.onclick=function(e){e.stopPropagation();_agentToggleCfg();};
  var u=document.createElement('button');u.id='agent-undo-btn';u.title='Undo the assistant\'s last change';u.textContent='↶';u.onclick=function(){_agentUndoLast();};
  h.insertBefore(u,h.firstChild);h.insertBefore(b,h.firstChild);
  var st=document.getElementById('ai-panel-status');if(st&&/powered by/.test(st.textContent))st.textContent='Ready · I can act on your workspace';
}
function _agentToggleCfg(){
  var ex=document.getElementById('agent-cfg');if(ex){ex.remove();return;}
  var p=_agentPrefs();var panel=document.getElementById('ai-panel');if(!panel)return;
  var d=document.createElement('div');d.id='agent-cfg';d.className='agent-cfg';
  d.innerHTML='<div style="font-weight:650;margin-bottom:4px">Assistant actions</div>'+
    '<label><input type="checkbox" '+(p.autoWrite?'checked':'')+' onchange="_agentSetPref(\'autoWrite\',this.checked)"><span>Just do it — run creates and edits without asking<br><small>Deletes always ask. Everything is undoable this session.</small></span></label>'+
    '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><button class="btn btn-s" style="height:24px;font-size:11px" onclick="_agentUndoLast()">↶ Undo last change</button><button class="btn btn-s" style="height:24px;font-size:11px" onclick="openHelpDrawer(\'assistant actions\');_agentToggleCfg()">? How this works</button></div>'+
    '<div style="margin-top:8px"><small>'+LU_AGENT_TOOLS.length+' actions available · '+_agentUndoStack.length+' undoable change'+(_agentUndoStack.length===1?'':'s')+'</small></div>';
  panel.appendChild(d);
  setTimeout(function(){document.addEventListener('click',function h(e){if(!d.contains(e.target)){d.remove();document.removeEventListener('click',h);}});},0);
}

// ─── command palette + "what next" entry points ────────────────────────────
function luAgentAsk(text){
  var p=document.getElementById('ai-panel');
  if(p&&!p.classList.contains('show'))toggleAIPanel();
  setTimeout(function(){_agentSend(text);},p&&!p.classList.contains('show')?300:0);
}
function luAgentWhatNext(){luAgentAsk('What should I do next?');}
(function(){
  if(typeof _cmdpActions!=='function')return;
  var orig=_cmdpActions;
  window._cmdpActions=function(){
    var list=orig();
    try{
      list.unshift({id:'agent-next',group:'Assistant',icon:'🧭',title:'What should I do next?',run:function(){luAgentWhatNext();}});
      list.unshift({id:'agent-ask',group:'Assistant',icon:'⚡',title:'Ask the assistant to do something…',run:function(){var p=document.getElementById('ai-panel');if(p&&!p.classList.contains('show'))toggleAIPanel();}});
    }catch(_){}
    return list;
  };
})();
// Expose for tests and the console.
window.luAgent={tools:LU_AGENT_TOOLS,exec:_agentExec,parse:_agentParse,systemPrompt:_agentSystemPrompt,status:_agentStatus,find:_agentFind,date:_agentDate,undoLast:_agentUndoLast,ask:luAgentAsk};
try{_luAgentCSS();}catch(_){}
