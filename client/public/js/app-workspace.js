/* ══════════════════════════════════════════════════════════════════════════
 * app-workspace.js — workspaces (multi-workspace, build -278).
 *
 * LevelUp is sold to many companies and individuals. Each one is a WORKSPACE
 * with its own owner, admins, members, data, AI keys, mail sender and file
 * storage. One login can belong to several workspaces. See
 * docs/multi-tenant-plan.md and server/_core/workspace.ts.
 *
 * This file (loaded last, plain globals like the other bundles) adds:
 *   - window._luMe / _luWs      who you are HERE: role, owner?, operator?,
 *                               the workspace's features — from auth.me, not
 *                               guessed from which admin call happens to work;
 *   - the workspace switcher    top bar + the sidebar user menu (only when the
 *                               login is in more than one workspace);
 *   - Workspace settings        General · Storage · Data (wsOpenSettings);
 *   - the platform console      the operator's workspaces list (wsOpenConsole);
 *   - the "workspace suspended" screen.
 *
 * SWITCHING is a change of account as far as this browser is concerned: the
 * server gives a new session for your member row in the other workspace, the
 * whole local cache is wiped (the same _luWipeLocalCache as signing out) and
 * the page reloads, so one company's cached items can never be shown in — or
 * synced into — another.
 *
 * Markup here uses _act() (data-act) for every handler: no inline JS strings.
 * ══════════════════════════════════════════════════════════════════════════ */

var _wsMe = null;        // auth.me result
var _wsTab = 'general';
var _wsStore = null;     // workspace.storageGet result
var _wsMovePoll = null;

function _wsCSS(){
  if(document.getElementById('lu-ws-css'))return;
  var s=document.createElement('style');s.id='lu-ws-css';
  s.textContent=[
    '#ws-modal{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:flex;align-items:flex-start;justify-content:center;padding:4vh 12px;overflow:auto}',
    '.ws-dlg{background:var(--s1);border:1px solid var(--bd2);border-radius:14px;width:min(860px,100%);padding:18px 20px 20px;color:var(--t1);box-shadow:0 20px 60px rgba(0,0,0,.45)}',
    '.ws-dlg.wide{width:min(1100px,100%)}',
    '.ws-h{display:flex;align-items:center;gap:10px;margin-bottom:12px}',
    '.ws-h h2{font-size:18px;font-weight:700;margin:0;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ws-tabs{display:flex;gap:2px;border-bottom:1px solid var(--bd1);margin-bottom:14px;flex-wrap:wrap}',
    '.ws-tab{padding:8px 12px;border:none;background:none;color:var(--t2);font-size:13px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;font-family:inherit}',
    '.ws-tab.on{color:var(--t1);border-bottom-color:var(--ac);font-weight:650}',
    '.ws-card{background:var(--s2);border:1px solid var(--bd1);border-radius:10px;padding:14px;margin-bottom:12px}',
    '.ws-card h3{font-size:14px;font-weight:650;margin:0 0 6px}',
    '.ws-card p,.ws-card li{font-size:12.5px;color:var(--t2);line-height:1.55}',
    '.ws-card ol{margin:6px 0 10px 18px;padding:0}',
    '.ws-card code{background:var(--s3);border-radius:4px;padding:1px 5px;font-size:11.5px;color:var(--t1);word-break:break-all}',
    '.ws-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin:8px 0}',
    '.ws-f{display:flex;flex-direction:column;gap:4px;flex:1;min-width:180px}',
    '.ws-f label{font-size:11.5px;color:var(--t2);font-weight:600}',
    '.ws-f .inp{height:34px}',
    '.ws-pill{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:11px;font-size:11px;font-weight:650;background:var(--s3);color:var(--t2)}',
    '.ws-pill.ok{background:rgba(22,163,74,.16);color:var(--ok)}',
    '.ws-pill.warn{background:rgba(217,119,6,.18);color:var(--warn)}',
    '.ws-pill.bad{background:rgba(220,38,38,.16);color:var(--red)}',
    '.ws-msg{font-size:12.5px;margin-top:8px;line-height:1.5}',
    '.ws-tbl{width:100%;border-collapse:collapse;font-size:12.5px}',
    '.ws-tbl th{text-align:left;font-size:11px;color:var(--t3);font-weight:650;padding:6px 8px;border-bottom:1px solid var(--bd1);white-space:nowrap}',
    '.ws-tbl td{padding:8px;border-bottom:1px solid var(--bd1);vertical-align:top}',
    '.ws-scroll{overflow-x:auto}',
    '.ws-opt{display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid var(--bd1);border-radius:9px;margin-bottom:8px;cursor:pointer;background:var(--s1)}',
    '.ws-opt.on{border-color:var(--ac);box-shadow:0 0 0 1px var(--ac) inset}',
    '.ws-opt b{font-size:13px}',
    '.ws-opt span{display:block;font-size:12px;color:var(--t2);margin-top:2px}',
    '#ws-switch-btn{max-width:190px;height:30px;padding:0 10px;border-radius:8px;border:1px solid var(--bd2);background:var(--s2);color:var(--t1);font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:inherit}',
    '#ws-switch-btn span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#ws-switch-menu{position:absolute;right:0;top:40px;background:var(--s2);border:1px solid var(--bd2);border-radius:10px;padding:5px;z-index:var(--z-dropdown,900);min-width:230px;box-shadow:0 10px 30px rgba(0,0,0,.35)}',
    '.ws-mi{display:flex;align-items:center;gap:8px;width:100%;min-height:38px;padding:6px 10px;border:none;background:transparent;color:var(--t1);font-size:12.5px;text-align:left;border-radius:7px;cursor:pointer;font-family:inherit}',
    '.ws-mi:hover{background:var(--s3)}',
    '.ws-mi small{display:block;color:var(--t3);font-size:11px}',
    '@media(max-width:700px){#ws-switch-btn{max-width:120px}.ws-dlg{padding:14px}}',
    '#ws-inactive{position:fixed;inset:0;background:var(--bg);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px}',
    // features a workspace does not have are hidden everywhere they have a nav entry
    'body[data-ws-atlas="0"] .si[data-n="atlas"]{display:none!important}',
  ].join('\n');
  document.head.appendChild(s);
}

function _wsEsc(v){return (typeof esc==='function')?esc(v==null?'':String(v)):String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
/** The local calendar day of a stored timestamp (the app's own _dayOf). */
function _wsDay(v){if(!v)return '';try{return (typeof _dayOf==='function')?_dayOf(v):'';}catch(_){return '';}}
function _wsAct(fn,args){return (typeof _act==='function')?_act(fn,args||[]):'';}
function _wsRole(){return (_wsMe&&_wsMe.workspace&&_wsMe.workspace.role)||'member';}
function _wsCanAdmin(){var r=_wsRole();return r==='owner'||r==='admin';}
/** Does this workspace have a feature (atlas, cfLabels)? Unknown until auth.me answered → true, so nothing flickers away for the original workspace. */
function luWsFeature(name){var m=_wsMe||window._luMe;if(!m||!m.workspace)return true;return !!(m.workspace.features||{})[name];}
window.luWsFeature=luWsFeature;


// ─── modal ──────────────────────────────────────────────────────────────────
function wsModal(html,wide){
  wsCloseModal();
  _wsCSS();
  var ov=document.createElement('div');ov.id='ws-modal';
  ov.innerHTML='<div class="ws-dlg'+(wide?' wide':'')+'" role="dialog" aria-modal="true">'+html+'</div>';
  ov.addEventListener('mousedown',function(e){ov._down=(e.target===ov);});
  ov.addEventListener('mouseup',function(e){if(e.target===ov&&ov._down)wsCloseModal();ov._down=false;});
  document.body.appendChild(ov);
  return ov;
}
function wsCloseModal(){
  var ov=document.getElementById('ws-modal');if(ov)ov.remove();
  if(_wsMovePoll){clearInterval(_wsMovePoll);_wsMovePoll=null;}
}
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&document.getElementById('ws-modal')){e.stopPropagation();wsCloseModal();}},true);

// Help articles and report presets are written in the original workspace's
// words ("CF", "LSI", "CommunityForce"). Every other workspace gets them
// reworded, once per page load (switching workspace reloads the page), and
// loses the Help sections about Atlas when it has no Atlas (build -282).
function _wsNeutralWording(){
  if(typeof _luCfOn!=='function'||typeof _luWsText!=='function'||_luCfOn()||window._wsWorded)return;
  window._wsWorded=true;
  var atlas=luWsFeature('atlas');
  try{
    if(typeof HC_ARTICLES!=='undefined'&&Array.isArray(HC_ARTICLES))HC_ARTICLES.forEach(function(a){
      if(!atlas&&a.body)a.body=String(a.body).replace(/\n###? [^\n]*Atlas[^\n]*\n[\s\S]*?(?=\n###? |$)/g,'');
      ['title','summary','body'].forEach(function(k){if(a[k])a[k]=_luWsText(a[k]);});
    });
  }catch(_){}
  try{
    if(typeof WIDGET_TEMPLATES!=='undefined')WIDGET_TEMPLATES.forEach(function(t){
      if(t.label)t.label=_luWsText(t.label);
      if(t.w&&t.w.title)t.w.title=_luWsText(t.w.title);
    });
    if(typeof WIDGET_SOURCES!=='undefined')Object.keys(WIDGET_SOURCES).forEach(function(k){
      var s=WIDGET_SOURCES[k];if(s&&s.label)s.label=_luWsText(s.label);
    });
  }catch(_){}
}

// ─── who am I here ──────────────────────────────────────────────────────────
async function wsBoot(){
  _wsCSS();
  try{_wsMe=await _trpc('auth.me',{},'query');}catch(_){_wsMe=null;}
  window._luMe=_wsMe;
  if(!_wsMe)return;
  if(_wsMe.workspaceInactive){_wsShowInactive(_wsMe);return;}
  var ws=_wsMe.workspace||null;
  window._luWs=ws;
  try{
    document.body.setAttribute('data-ws-role',_wsRole());
    document.body.setAttribute('data-operator',_wsMe.isOperator?'1':'0');
    document.body.setAttribute('data-ws-atlas',luWsFeature('atlas')?'1':'0');
    document.body.setAttribute('data-ws-cf',luWsFeature('cfLabels')?'1':'0');
  }catch(_){}
  _wsPaintSwitcher();
  _wsPaintUserMenu();
  try{
    if(typeof HC_ARTICLES!=='undefined'&&Array.isArray(HC_ARTICLES)){
      var drop=[];
      if(!luWsFeature('atlas'))drop.push('atlas-communityforce');
      if(!luWsFeature('cfLabels'))drop.push('smartsheet-integration','pipeline-smartsheet-sync');
      for(var hi=HC_ARTICLES.length-1;hi>=0;hi--)if(drop.indexOf(HC_ARTICLES[hi].slug)>=0)HC_ARTICLES.splice(hi,1);
    }
  }catch(_){}
  _wsNeutralWording();
  _wsBillAfterBoot();
  // back from connecting Google Drive as this workspace's storage
  try{
    if(window._wsPendingDrive==='ok'){window._wsPendingDrive=null;toast('Google Drive connected — new files are stored there now','success',7000);wsOpenSettings('storage');}
    else if(window._wsPendingDrive){var d=window._wsPendingDrive;window._wsPendingDrive=null;toast('Google Drive was not connected: '+d,'error',12000);wsOpenSettings('storage');}
  }catch(_){}
}

function _wsPaintSwitcher(){
  var old=document.getElementById('ws-switch-wrap');if(old)old.remove();
  var list=(_wsMe&&_wsMe.workspaces)||[];
  if(list.length<2)return;                       // one workspace: no switcher at all
  var av=document.getElementById('topbar-avatar');if(!av||!av.parentNode)return;
  var cur=list.filter(function(w){return w.current;})[0]||{name:(_wsMe.workspace||{}).name||'Workspace'};
  var wrap=document.createElement('div');wrap.id='ws-switch-wrap';wrap.style.cssText='position:relative;display:inline-flex;align-items:center';
  wrap.innerHTML='<button id="ws-switch-btn" aria-haspopup="true" aria-label="Switch workspace — current: '+_wsEsc(cur.name)+'" title="Switch workspace"'+_wsAct('wsToggleSwitchMenu')+'><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg><span>'+_wsEsc(cur.name)+'</span></button>';
  av.parentNode.insertBefore(wrap,av);
}
function wsToggleSwitchMenu(){
  var m=document.getElementById('ws-switch-menu');
  if(m){m.remove();return;}
  var wrap=document.getElementById('ws-switch-wrap');if(!wrap)return;
  m=document.createElement('div');m.id='ws-switch-menu';m.setAttribute('role','menu');
  m.innerHTML=_wsSwitchItems()+'<div style="height:1px;background:var(--bd1);margin:4px 0"></div><button class="ws-mi" role="menuitem"'+_wsAct('wsOpenSettings',['general'])+'>⚙ Workspace settings</button>';
  wrap.appendChild(m);
  setTimeout(function(){document.addEventListener('click',function h(e){if(!m.contains(e.target)&&e.target.id!=='ws-switch-btn'&&!(e.target.closest&&e.target.closest('#ws-switch-btn'))){m.remove();document.removeEventListener('click',h);}});},0);
}
function _wsSwitchItems(){
  var list=(_wsMe&&_wsMe.workspaces)||[];
  return list.map(function(w){
    var off=w.status!=='active';
    return '<button class="ws-mi" role="menuitem"'+(w.current||off?' disabled style="opacity:'+(w.current?'1':'.5')+';cursor:default"':_wsAct('wsSwitch',[w.id]))+'>'
      +'<span style="width:14px">'+(w.current?'✓':'')+'</span><span style="flex:1;min-width:0"><span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_wsEsc(w.name)+'</span><small>'+_wsEsc(w.role)+(off?' · '+_wsEsc(w.status):'')+'</small></span></button>';
  }).join('');
}
function _wsPaintUserMenu(){
  // the sidebar's user menu is cloned into every screen from a template: add our entries to each copy
  document.querySelectorAll('#sb-user-menu,[id="sb-user-menu"]').forEach(function(menu){
    if(menu.querySelector('[data-ws-entry]')){_wsMenuCreateEntry(menu);return;}
    var html='<button class="ws-mi" data-ws-entry="1"'+_wsAct('wsOpenSettings',['general'])+'>🏢 Workspace: '+_wsEsc((_wsMe.workspace||{}).name||'')+'</button>';
    if(((_wsMe&&_wsMe.workspaces)||[]).length>1)html+='<button class="ws-mi" data-ws-entry="1"'+_wsAct('wsOpenSwitchDialog')+'>⇄ Switch workspace…</button>';
    if(_wsMe&&_wsMe.isOperator)html+='<button class="ws-mi" data-ws-entry="1"'+_wsAct('wsOpenConsole')+'>🛠 Platform console</button>';
    var box=document.createElement('div');box.innerHTML=html;
    while(box.firstChild)menu.insertBefore(box.firstChild,menu.firstChild);
    _wsMenuCreateEntry(menu);
  });
}
function _wsMenuCreateEntry(menu){
  // only where the operator opened sign-up (known once billing.plans has answered)
  if(!_wsPub||!_wsPub.signupOpen||menu.querySelector('[data-ws-create]'))return;
  var box=document.createElement('div');
  box.innerHTML='<button class="ws-mi" data-ws-create="1"'+_wsAct('wsCreateWorkspaceDialog')+'>＋ Create a workspace</button>';
  var mine=menu.querySelectorAll('[data-ws-entry]');
  menu.insertBefore(box.firstChild,mine.length?mine[mine.length-1].nextSibling:menu.firstChild);
}
function wsOpenSwitchDialog(){
  wsModal('<div class="ws-h"><h2>Switch workspace</h2><button class="btn btn-s"'+_wsAct('wsCloseModal')+'>Close</button></div><p style="font-size:12.5px;color:var(--t2);margin:0 0 10px">Each workspace keeps its own tasks, notes, people and settings. Switching reloads the app.</p>'+_wsSwitchItems());
}

/** Move this browser to another workspace: save what is pending, new session, wipe the cache, reload. */
async function wsSwitch(workspaceId){
  var m=document.getElementById('ws-switch-menu');if(m)m.remove();
  try{
    toast('Switching workspace…');
    try{if(typeof _flushDirtyNow==='function')_flushDirtyNow();}catch(_){}
    await new Promise(function(r){setTimeout(r,450);});
    var r=await _trpc('workspace.switch',{workspaceId:workspaceId},'mutation');
    // From here the cookie belongs to the other workspace: nothing cached may survive.
    try{if(typeof _luWipeLocalCache==='function')_luWipeLocalCache();}catch(_){}
    try{localStorage.setItem('lu_last_uid',String(r.userId));}catch(_){}
    location.replace('/');
  }catch(e){toast((e&&e.message)||'Could not switch workspace','error',8000);}
}

// ─── suspended / closed workspace ───────────────────────────────────────────
function _wsShowInactive(me){
  _wsCSS();
  var old=document.getElementById('ws-inactive');if(old)old.remove();
  var others=(me.workspaces||[]).filter(function(w){return w.status==='active';});
  var what=me.wsStatus==='deleted'?'has been closed':me.wsStatus==='missing'?'no longer exists':'is suspended';
  var d=document.createElement('div');d.id='ws-inactive';
  d.innerHTML='<div class="ws-dlg" style="max-width:460px"><h2 style="font-size:18px;margin:0 0 8px">This workspace '+what+'</h2>'
    +'<p style="font-size:13px;color:var(--t2);line-height:1.55;margin:0 0 14px">'+(me.wsStatus==='suspended'?'Its data is safe, but nobody can open it until it is reactivated. Ask the workspace’s owner, or LevelUp support.':'If you think this is a mistake, ask the workspace’s owner, or LevelUp support.')+'</p>'
    +(others.length?'<p style="font-size:12.5px;font-weight:650;margin:0 0 6px">Your other workspaces</p>'+others.map(function(w){return '<button class="ws-mi" style="border:1px solid var(--bd1);margin-bottom:6px"'+_wsAct('wsSwitch',[w.id])+'><span style="flex:1">'+_wsEsc(w.name)+'<small>'+_wsEsc(w.role)+'</small></span>Open →</button>';}).join(''):'')
    +'<button class="btn" style="margin-top:8px"'+_wsAct('wsSignOutInactive')+'>Sign out</button></div>';
  document.body.appendChild(d);
}
async function wsSignOutInactive(){
  try{localStorage.removeItem('lu_session');if(typeof _luWipeLocalCache==='function')_luWipeLocalCache();}catch(_){}
  try{await _trpc('auth.logout',{},'mutation');}catch(_){}
  location.replace('/');
}

// ─── Workspace settings ─────────────────────────────────────────────────────
async function wsOpenSettings(tab){
  var m=document.getElementById('ws-switch-menu');if(m)m.remove();
  try{if(typeof closePopMenu==='function')closePopMenu('sb-user-menu');}catch(_){}
  _wsTab=tab||_wsTab||'general';
  if(!_wsMe){try{_wsMe=await _trpc('auth.me',{},'query');}catch(_){}}
  _wsRenderSettings('<p style="font-size:12.5px;color:var(--t2)">Loading…</p>');
  var cur=null;try{cur=await _trpc('workspace.current',undefined,'query');}catch(_){}
  window._wsCur=cur;
  if(_wsTab==='storage'&&_wsCanAdmin()){try{_wsStore=await _trpc('workspace.storageGet',undefined,'query');}catch(e){_wsStore={error:(e&&e.message)||'Could not load'};}}
  if(_wsTab==='billing'){
    if(!(_wsMe&&_wsMe.billing))_wsTab='general';
    else{try{_wsBill=await _trpc('billing.status',undefined,'query');}catch(e){_wsBill={error:(e&&e.message)||'Could not load'};}}
  }
  _wsRenderSettings(_wsTab==='billing'?_wsBillingHtml(_wsBill):_wsTab==='storage'?_wsStorageHtml():_wsTab==='data'?_wsDataHtml():_wsGeneralHtml(cur));
  if(_wsTab==='storage')_wsWatchMove();
}
function _wsRenderSettings(body){
  var tabs=[['general','General']];
  if(_wsMe&&_wsMe.billing)tabs.push(['billing','Plan & billing']);
  if(_wsCanAdmin())tabs.push(['storage','File storage']);
  if(_wsRole()==='owner')tabs.push(['data','Export & close']);
  var name=(_wsMe&&_wsMe.workspace&&_wsMe.workspace.name)||'Workspace';
  wsModal('<div class="ws-h"><h2>'+_wsEsc(name)+'</h2><span class="ws-pill">'+_wsEsc(_wsRole())+'</span><button class="btn btn-s"'+_wsAct('wsCloseModal')+'>Close</button></div>'
    +'<div class="ws-tabs" role="tablist">'+tabs.map(function(t){return '<button class="ws-tab'+(t[0]===_wsTab?' on':'')+'" role="tab" aria-selected="'+(t[0]===_wsTab)+'"'+_wsAct('wsOpenSettings',[t[0]])+'>'+t[1]+'</button>';}).join('')+'</div>'
    +'<div id="ws-body">'+body+'</div>');
}
function _wsUsageLine(label,u){
  if(!u)return '';
  var pct=u.cap>0?Math.min(100,Math.round(u.used/u.cap*100)):0;
  return '<div style="margin:6px 0"><div style="display:flex;justify-content:space-between;font-size:12px"><span>'+label+'</span><span>'+Number(u.used).toLocaleString()+' of '+Number(u.cap).toLocaleString()+' today</span></div>'
    +'<div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden;margin-top:3px"><div style="height:100%;width:'+pct+'%;background:'+(pct>=90?'var(--red)':pct>=70?'var(--warn)':'var(--ok)')+'"></div></div></div>';
}
function _wsGeneralHtml(cur){
  var role=_wsRole();
  var list=(_wsMe&&_wsMe.workspaces)||[];
  var h='<div class="ws-card"><h3>This workspace</h3>'
    +'<p>A workspace is one company’s or one person’s LevelUp: its own tasks, notes, people, AI keys, mail sender and files. Nothing is shared with any other workspace.</p>';
  if(role==='owner'){
    h+='<div class="ws-row"><div class="ws-f"><label for="ws-name">Workspace name</label><input class="inp" id="ws-name" maxlength="120" value="'+_wsEsc((cur&&cur.name)||'')+'"></div><button class="btn"'+_wsAct('wsRename')+'>Save name</button></div>';
  }else{
    h+='<p><b>Name:</b> '+_wsEsc((cur&&cur.name)||'')+'</p>';
  }
  h+='<p><b>Your role here:</b> '+_wsEsc(role)+' — '+(role==='owner'?'you manage members, roles, AI keys, storage and the mail sender.':role==='admin'?'the owner made you an admin: you can manage the AI keys and file storage, and help manage members’ items.':'you see your own items and what teammates share with or assign to you.')+'</p>';
  h+='<div class="ws-row"><button class="btn btn-s"'+_wsAct('wsGoTeam')+'>People in this workspace →</button></div></div>';
  if(cur&&cur.usage){
    h+='<div class="ws-card"><h3>Today’s usage</h3><p>Daily limits protect every workspace from runaway use. They reset at midnight UTC. Using your own AI key (Settings → AI Features) is not limited by LevelUp’s AI allowance.</p>'+_wsUsageLine('AI requests',cur.usage.ai)+_wsUsageLine('Emails sent for you',cur.usage.email)+'</div>';
  }
  if(list.length>1){
    h+='<div class="ws-card"><h3>Your workspaces</h3>'+_wsSwitchItems()+'</div>';
  }
  return h;
}
function wsGoTeam(){wsCloseModal();try{nav('team');}catch(_){}}
async function wsRename(){
  var v=((document.getElementById('ws-name')||{}).value||'').trim();
  if(!v){toast('Enter a name','error');return;}
  try{await _trpc('workspace.rename',{name:v},'mutation');toast('Workspace renamed','success');await wsBoot();wsOpenSettings('general');}
  catch(e){toast((e&&e.message)||'Could not rename','error',8000);}
}

// ── storage ──
function _wsStorageHtml(){
  var s=_wsStore||{};
  if(s.error)return '<div class="ws-card"><p style="color:var(--red)">'+_wsEsc(s.error)+'</p></div>';
  var cur=s.current||'platform';
  var stores=s.stores||[];
  var here=cur==='platform'?'LevelUp’s storage':(function(){var st=stores.filter(function(x){return x.id===cur;})[0]||{};return st.mode==='s3'?'your S3 bucket “'+(st.bucket||'')+'”':'your Google Drive'+(st.account?' ('+st.account+')':'');})();
  var h='<div class="ws-card"><h3>Where this workspace’s files are kept</h3>'
    +'<p>Images in notes, imported documents and profile pictures are files. They are stored in <b>'+_wsEsc(here)+'</b>. Whatever you choose, only members of this workspace can open them — every file is checked against the workspace before it is served.</p>'
    +'<p>Changing the storage affects <b>new</b> files at once. Files you already have stay where they are and keep working; you can move them afterwards with one button.</p></div>';
  // choose
  h+='<div class="ws-card"><h3>Choose a storage</h3>';
  h+='<div class="ws-opt'+(cur==='platform'?' on':'')+'" role="button" tabindex="0"'+(cur==='platform'?'':_wsAct('wsStorageUse',['platform']))+'><div style="font-size:20px">☁</div><div><b>LevelUp storage'+(cur==='platform'?' — in use':'')+'</b><span>The default. Nothing to set up. Your files are kept in LevelUp’s own storage, in a folder that belongs to this workspace only.</span></div></div>';
  stores.forEach(function(st){
    var on=st.id===cur;
    h+='<div class="ws-opt'+(on?' on':'')+'"><div style="font-size:20px">'+(st.mode==='s3'?'🪣':'📁')+'</div><div style="flex:1;min-width:0"><b>'+_wsEsc(st.mode==='s3'?'S3 bucket: '+st.bucket:'Google Drive'+(st.account?': '+st.account:''))+(on?' — in use':'')+'</b>'
      +'<span>'+(st.mode==='s3'?_wsEsc((st.endpoint||'AWS S3')+' · '+st.region+(st.prefix?' · folder '+st.prefix:'')+' · key '+st.accessKeyId):'Folder “LevelUp files” in that Drive')+'</span>'
      +'<div class="ws-row" style="margin:8px 0 0">'+(on?'':'<button class="btn btn-s"'+_wsAct('wsStorageUse',[st.id])+'>Use this</button><button class="btn btn-s"'+_wsAct('wsStorageForget',[st.id])+'>Forget</button>')+'</div></div></div>';
  });
  h+='</div>';
  // move
  if(s.filesElsewhere>0||(s.move&&s.move.running)){
    var mv=s.move||null;
    h+='<div class="ws-card" id="ws-move-card"><h3>Move existing files</h3>'
      +'<p><b>'+Number(s.filesElsewhere||0).toLocaleString()+'</b> file'+(s.filesElsewhere===1?' is':'s are')+' still in an earlier storage. They open normally. Moving copies each one into the current storage, checks it, then removes the old copy. Links in your notes do not change.</p>'
      +'<div id="ws-move-status" class="ws-msg">'+_wsMoveText(mv)+'</div>'
      +'<div class="ws-row"><button class="btn" id="ws-move-btn"'+(mv&&mv.running?' disabled':'')+_wsAct('wsStorageMove')+'>Move them to the current storage</button></div></div>';
  }
  // own S3
  h+='<div class="ws-card"><h3>Use your own S3 bucket</h3>'
    +'<p>For companies that want their files in their own cloud account. Works with Amazon S3, Cloudflare R2, Backblaze B2, Wasabi, MinIO and other S3-compatible services. LevelUp reads and writes the files through its server, so the bucket stays <b>private</b> — do not make it public, and no CORS setup is needed.</p>'
    +'<details><summary style="cursor:pointer;font-size:12.5px;font-weight:650">Step by step: Amazon S3</summary><ol>'
    +'<li>Sign in to the AWS console → <b>S3</b> → <b>Create bucket</b>. Pick a name (for example <code>acme-levelup-files</code>) and a region near you. Leave <b>Block all public access</b> switched <b>on</b>. Create it.</li>'
    +'<li>Go to <b>IAM</b> → <b>Policies</b> → <b>Create policy</b> → <b>JSON</b>, and paste this, with your bucket’s name in both places:<br><code>{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:PutObject","s3:GetObject","s3:DeleteObject"],"Resource":"arn:aws:s3:::YOUR-BUCKET/*"},{"Effect":"Allow","Action":["s3:ListBucket"],"Resource":"arn:aws:s3:::YOUR-BUCKET"}]}</code><br>Name it <code>levelup-files</code> and create it. This lets LevelUp use that one bucket and nothing else in your account.</li>'
    +'<li><b>IAM</b> → <b>Users</b> → <b>Create user</b> (for example <code>levelup</code>), no console access. Attach the <code>levelup-files</code> policy.</li>'
    +'<li>Open the user → <b>Security credentials</b> → <b>Create access key</b> → “Application running outside AWS”. Copy the <b>Access key ID</b> and the <b>Secret access key</b> (the secret is shown once).</li>'
    +'<li>Below: leave <b>Endpoint</b> empty, enter the bucket’s <b>region</b> (for example <code>us-east-1</code>), the bucket name and the two keys. Press <b>Test</b>, then <b>Save and use</b>.</li></ol></details>'
    +'<details><summary style="cursor:pointer;font-size:12.5px;font-weight:650">Step by step: Cloudflare R2</summary><ol>'
    +'<li>Cloudflare dashboard → <b>R2</b> → <b>Create bucket</b>. Name it (for example <code>acme-levelup-files</code>). Keep public access off.</li>'
    +'<li><b>R2</b> → <b>Manage R2 API Tokens</b> → <b>Create API token</b>. Permission: <b>Object Read &amp; Write</b>. Under “Specify bucket”, choose only the bucket you made. Create it.</li>'
    +'<li>Copy the <b>Access Key ID</b>, the <b>Secret Access Key</b>, and the <b>endpoint</b> shown for S3 clients — it looks like <code>https://&lt;account id&gt;.r2.cloudflarestorage.com</code>.</li>'
    +'<li>Below: paste that address into <b>Endpoint</b>, type <code>auto</code> as the region, then the bucket name and the two keys. Press <b>Test</b>, then <b>Save and use</b>.</li></ol></details>'
    +'<div class="ws-row"><div class="ws-f"><label for="ws-s3-endpoint">Endpoint (leave empty for Amazon S3)</label><input class="inp" id="ws-s3-endpoint" placeholder="https://<account>.r2.cloudflarestorage.com" autocomplete="off"></div>'
    +'<div class="ws-f" style="max-width:160px"><label for="ws-s3-region">Region</label><input class="inp" id="ws-s3-region" placeholder="us-east-1" autocomplete="off"></div></div>'
    +'<div class="ws-row"><div class="ws-f"><label for="ws-s3-bucket">Bucket name</label><input class="inp" id="ws-s3-bucket" autocomplete="off"></div>'
    +'<div class="ws-f"><label for="ws-s3-prefix">Folder inside the bucket (optional)</label><input class="inp" id="ws-s3-prefix" placeholder="levelup" autocomplete="off"></div></div>'
    +'<div class="ws-row"><div class="ws-f"><label for="ws-s3-key">Access key ID</label><input class="inp" id="ws-s3-key" autocomplete="off"></div>'
    +'<div class="ws-f"><label for="ws-s3-secret">Secret access key</label><input class="inp" id="ws-s3-secret" type="password" autocomplete="new-password"></div></div>'
    +'<div class="ws-row"><button class="btn btn-s"'+_wsAct('wsS3Test')+'>Test</button><button class="btn"'+_wsAct('wsS3Save')+'>Save and use</button></div>'
    +'<div id="ws-s3-msg" class="ws-msg" role="status"></div>'
    +'<p style="margin-top:8px">The secret is stored encrypted and is never shown again. <b>Test</b> writes a small file, reads it back and deletes it; a bucket that fails the test is not saved.</p></div>';
  // own Drive
  h+='<div class="ws-card"><h3>Use your own Google Drive</h3>'
    +'<p>LevelUp creates one folder, <b>“LevelUp files”</b>, in the Google Drive of the account you sign in with, and keeps this workspace’s files there. It is given access <b>only to the files it creates</b> — it cannot see anything else in that Drive.</p>'
    +'<ol><li>Decide which Google account should hold the files. For a company, use a shared or admin account rather than a personal one, so the files stay with the company if someone leaves.</li>'
    +'<li>Press <b>Connect Google Drive</b> and sign in with that account.</li>'
    +'<li>Google asks whether LevelUp may “see, edit, create and delete only the specific Google Drive files that you use with this app”. Choose <b>Allow</b>.</li>'
    +'<li>You come back here. LevelUp makes the folder, saves a test file, reads it back and removes it. If that works, the Drive becomes this workspace’s storage. If it does not, nothing changes and you see why.</li>'
    +'<li>Later: don’t delete or rename away the “LevelUp files” folder, and don’t remove LevelUp at <code>myaccount.google.com/permissions</code> — files would stop opening until you connect again.</li></ol>'
    +(s.driveConnectAvailable?'<div class="ws-row"><button class="btn"'+_wsAct('wsDriveConnect')+'>Connect Google Drive</button></div>':'<p class="ws-msg" style="color:var(--warn)">Google Drive sign-in is not switched on for this LevelUp server yet. Use LevelUp storage or an S3 bucket, or ask LevelUp support.</p>')
    +'</div>';
  return h;
}
function _wsMoveText(mv){
  if(!mv)return '';
  if(mv.running)return 'Moving… '+mv.moved+' of '+mv.total+' done'+(mv.failed?' · '+mv.failed+' could not be moved':'')+'. You can close this window; it carries on.';
  return 'Last move: '+mv.moved+' of '+mv.total+' moved'+(mv.failed?' · <span style="color:var(--red)">'+mv.failed+' could not be moved and stay where they were</span>':'')+(mv.error?' · '+_wsEsc(mv.error):'')+'.';
}
function _wsS3Input(){
  var g=function(id){return ((document.getElementById(id)||{}).value||'').trim();};
  return {endpoint:g('ws-s3-endpoint')||undefined,region:g('ws-s3-region')||(g('ws-s3-endpoint')?'auto':'us-east-1'),bucket:g('ws-s3-bucket'),accessKeyId:g('ws-s3-key'),secretAccessKey:g('ws-s3-secret'),prefix:g('ws-s3-prefix')||undefined};
}
function _wsS3Msg(text,kind){var el=document.getElementById('ws-s3-msg');if(el){el.textContent=text;el.style.color=kind==='ok'?'var(--ok)':kind==='bad'?'var(--red)':'var(--t2)';}}
function _wsS3Check(i){
  if(!i.bucket){_wsS3Msg('Enter the bucket name.','bad');return false;}
  if(!i.accessKeyId||!i.secretAccessKey){_wsS3Msg('Enter the access key ID and the secret access key.','bad');return false;}
  if(i.endpoint&&!/^https:\/\//i.test(i.endpoint)){_wsS3Msg('The endpoint must start with https://','bad');return false;}
  return true;
}
async function wsS3Test(){
  var i=_wsS3Input();if(!_wsS3Check(i))return;
  _wsS3Msg('Testing — writing, reading and deleting a small file…');
  try{var r=await _trpc('workspace.storageTestS3',i,'mutation');_wsS3Msg(r.ok?'✓ The bucket works. Press “Save and use” to switch to it.':'✗ '+(r.error||'The test failed.'),r.ok?'ok':'bad');}
  catch(e){_wsS3Msg('✗ '+((e&&e.message)||'The test failed.'),'bad');}
}
async function wsS3Save(){
  var i=_wsS3Input();if(!_wsS3Check(i))return;
  _wsS3Msg('Testing, then saving…');
  try{
    var r=await _trpc('workspace.storageSetS3',i,'mutation');
    if(!r.ok){_wsS3Msg('✗ Not saved: '+(r.error||'the bucket did not pass the test.'),'bad');return;}
    toast('New files now go to your S3 bucket','success',6000);
    wsOpenSettings('storage');
  }catch(e){_wsS3Msg('✗ '+((e&&e.message)||'Could not save.'),'bad');}
}
function wsDriveConnect(){
  try{if(typeof _flushDirtyNow==='function')_flushDirtyNow();}catch(_){}
  window.location.href='/api/oauth/drive/start?for=workspace';
}
async function wsStorageUse(store){
  try{
    var r=await _trpc('workspace.storageUse',{store:store},'mutation');
    if(!r.ok){toast('Not changed: '+(r.error||'that storage did not pass the test'),'error',10000);return;}
    toast(store==='platform'?'New files now go to LevelUp storage':'Storage changed','success');
    wsOpenSettings('storage');
  }catch(e){toast((e&&e.message)||'Could not change storage','error',8000);}
}
async function wsStorageForget(store){
  if(!confirm('Forget this storage? LevelUp will no longer have its keys. (Refused while files are still kept there.)'))return;
  try{
    var r=await _trpc('workspace.storageForget',{store:store},'mutation');
    if(!r.ok){toast(r.error||'Could not forget it','error',10000);return;}
    toast('Storage forgotten','success');wsOpenSettings('storage');
  }catch(e){toast((e&&e.message)||'Could not forget it','error',8000);}
}
async function wsStorageMove(){
  var b=document.getElementById('ws-move-btn');if(b)b.disabled=true;
  try{await _trpc('workspace.storageMove',undefined,'mutation');_wsWatchMove(true);}
  catch(e){toast((e&&e.message)||'Could not start the move','error',8000);if(b)b.disabled=false;}
}
function _wsWatchMove(force){
  if(_wsMovePoll){clearInterval(_wsMovePoll);_wsMovePoll=null;}
  if(!force&&!(_wsStore&&_wsStore.move&&_wsStore.move.running))return;
  _wsMovePoll=setInterval(async function(){
    if(!document.getElementById('ws-move-card')){clearInterval(_wsMovePoll);_wsMovePoll=null;return;}
    try{
      var s=await _trpc('workspace.storageGet',undefined,'query');_wsStore=s;
      var el=document.getElementById('ws-move-status');if(el)el.innerHTML=_wsMoveText(s.move);
      if(!s.move||!s.move.running){clearInterval(_wsMovePoll);_wsMovePoll=null;wsOpenSettings('storage');}
    }catch(_){}
  },2500);
}

// ── export & close ──
function _wsDataHtml(){
  var name=(_wsMe&&_wsMe.workspace&&_wsMe.workspace.name)||'';
  return '<div class="ws-card"><h3>Export everything</h3>'
    +'<p>One file with everything stored for this workspace: every member’s tasks, notes, projects, goals, journal, contacts, Money, PM records, settings and the list of uploaded files. Passwords, sign-in tokens and API keys are left out. It is yours to keep or to move elsewhere.</p>'
    +'<div class="ws-row"><button class="btn"'+_wsAct('wsExport')+'>Download the export (.json)</button></div><div id="ws-export-msg" class="ws-msg" role="status"></div></div>'
    +(_wsMe&&_wsMe.isOperator?'':'<div class="ws-card" style="border-color:var(--red)"><h3 style="color:var(--red)">Close this workspace</h3>'
      +'<p>Closing locks everybody out <b>immediately</b>. After <b>30 days</b> everything in it is deleted for good: every member’s items, settings and the files kept in LevelUp storage (files in your own bucket or Drive are yours and are left alone). During the 30 days LevelUp support can reopen it. Export first if you may need the data.</p>'
      +'<div class="ws-row"><div class="ws-f"><label for="ws-close-name">Type the workspace’s name to confirm: <b>'+_wsEsc(name)+'</b></label><input class="inp" id="ws-close-name" autocomplete="off"></div><button class="btn" style="background:var(--red);color:#fff;border-color:var(--red)"'+_wsAct('wsCloseWorkspace')+'>Close workspace</button></div></div>');
}
async function wsExport(){
  var el=document.getElementById('ws-export-msg');if(el)el.textContent='Preparing…';
  try{
    var r=await _trpc('workspace.export',undefined,'mutation');
    var blob=new Blob([JSON.stringify(r.dump,null,1)],{type:'application/json'});
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download='levelup-'+String((r.dump&&r.dump.name)||'workspace').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')+'-'+(typeof _ymd==='function'?_ymd(new Date()):'export')+'.json';
    document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},2000);
    if(el)el.textContent='Downloaded: '+Number(r.rows).toLocaleString()+' rows from '+r.tables+' lists.';
  }catch(e){if(el){el.textContent=(e&&e.message)||'The export failed.';el.style.color='var(--red)';}}
}
async function wsCloseWorkspace(){
  var v=((document.getElementById('ws-close-name')||{}).value||'').trim();
  var name=(_wsMe&&_wsMe.workspace&&_wsMe.workspace.name)||'';
  if(v!==name){toast('Type the workspace’s exact name to confirm','error');return;}
  if(!confirm('Close “'+name+'” now? Everyone is locked out at once and the data is deleted after 30 days.'))return;
  try{await _trpc('workspace.requestDelete',{confirmName:v},'mutation');wsCloseModal();location.replace('/');}
  catch(e){toast((e&&e.message)||'Could not close the workspace','error',10000);}
}

// ─── Platform console (operator) ────────────────────────────────────────────
var _wsConsoleRows=[];
async function wsOpenConsole(){
  try{if(typeof closePopMenu==='function')closePopMenu('sb-user-menu');}catch(_){}
  wsModal('<div class="ws-h"><h2>Platform console</h2><button class="btn btn-s"'+_wsAct('wsCloseModal')+'>Close</button></div><div id="ws-console"><p style="font-size:12.5px;color:var(--t2)">Loading…</p></div>',true);
  await _wsConsoleLoad();
}
async function _wsConsoleLoad(){
  var box=document.getElementById('ws-console');if(!box)return;
  try{
    var r=await _trpc('workspace.opList',undefined,'query');
    _wsConsoleRows=r.workspaces||[];
    box.innerHTML=_wsConsoleHtml();
  }catch(e){box.innerHTML='<p style="color:var(--red);font-size:13px">'+_wsEsc((e&&e.message)||'Could not load')+'</p>';}
}
function _wsUse(u){return u?Number(u.used).toLocaleString()+' / '+Number(u.cap).toLocaleString():'';}
function _wsConsoleHtml(){
  var h='<div class="ws-card"><h3>Workspaces</h3><p>Each customer is a workspace. From here you create them, pause them, set their daily limits and change their owner. You see who is in a workspace and how much it uses — <b>never what is in it</b>: its tasks, notes, files and Money are only visible to its own members.</p></div>';
  h+='<div class="ws-card"><h3>Billing &amp; sign-up</h3><p>Plans and their Stripe prices, the free trial, and whether anyone can create a workspace from the sign-in page.</p><div class="ws-row"><button class="btn btn-s"'+_wsAct('wsOpenBillingAdmin')+'>Open billing &amp; sign-up</button></div></div>';
  h+='<div class="ws-card"><h3>Create a workspace</h3><p>You name it and say who will own it. They get an email with a link: someone new sets a password; someone who already has a LevelUp login adds this workspace to it.</p>'
    +'<div class="ws-row"><div class="ws-f"><label for="wsc-name">Workspace name</label><input class="inp" id="wsc-name" maxlength="120" placeholder="Acme Inc."></div>'
    +'<div class="ws-f"><label for="wsc-email">Owner’s email</label><input class="inp" id="wsc-email" type="email" placeholder="owner@acme.com"></div>'
    +'<div class="ws-f"><label for="wsc-owner">Owner’s name (optional)</label><input class="inp" id="wsc-owner" maxlength="128"></div>'
    +'<button class="btn"'+_wsAct('wsConsoleCreate')+'>Create and invite</button></div><div id="wsc-msg" class="ws-msg" role="status"></div></div>';
  h+='<div class="ws-card"><div class="ws-scroll"><table class="ws-tbl"><thead><tr><th>Workspace</th><th>Status</th><th>Billing</th><th>Owner</th><th>People</th><th>AI today</th><th>Email today</th><th>Files</th><th></th></tr></thead><tbody>';
  _wsConsoleRows.forEach(function(w){
    var st=w.status==='active'?'<span class="ws-pill ok">active</span>':w.status==='suspended'?'<span class="ws-pill warn">suspended</span>':'<span class="ws-pill bad">closed</span>';
    var owner=w.owner?_wsEsc(w.owner.name||'')+'<br><span style="color:var(--t3)">'+_wsEsc(w.owner.email||'')+'</span>':(w.ownerInvited?'<span style="color:var(--warn)">invited: '+_wsEsc(w.ownerInvited)+'</span>':'<span style="color:var(--red)">no owner</span>');
    var feats=Object.keys(w.features||{}).filter(function(k){return w.features[k];});
    h+='<tr><td><b>'+_wsEsc(w.name)+'</b><br><span style="color:var(--t3)">#'+w.id+(feats.length?' · '+_wsEsc(feats.join(', ')):'')+'</span></td><td>'+st+(w.deletedAt?'<br><span style="color:var(--t3);font-size:11px">closed '+_wsEsc(_wsDay(w.deletedAt))+'</span>':'')+'</td><td>'+_wsConsoleBillCell(w)+'</td><td>'+owner+'</td><td>'+w.members+'</td><td>'+_wsUse(w.usage&&w.usage.ai)+'</td><td>'+_wsUse(w.usage&&w.usage.email)+'</td><td>'+_wsEsc(w.storageMode==='platform'?'LevelUp':w.storageMode||'LevelUp')+'</td>'
      +'<td style="white-space:nowrap"><button class="btn btn-s"'+_wsAct('wsConsoleManage',[w.id])+'>Manage</button></td></tr>';
  });
  h+='</tbody></table></div></div>';
  return h;
}
async function wsConsoleCreate(){
  var g=function(id){return ((document.getElementById(id)||{}).value||'').trim();};
  var msg=document.getElementById('wsc-msg');
  var name=g('wsc-name'),email=g('wsc-email');
  if(!name||!/^\S+@\S+\.\S+$/.test(email)){if(msg){msg.textContent='Enter a workspace name and the owner’s email.';msg.style.color='var(--red)';}return;}
  if(msg){msg.textContent='Creating…';msg.style.color='var(--t2)';}
  try{
    var r=await _trpc('workspace.opCreate',{name:name,ownerEmail:email,ownerName:g('wsc-owner')||undefined},'mutation');
    await _wsConsoleLoad();
    var m2=document.getElementById('wsc-msg');
    if(m2){m2.style.color='var(--t1)';m2.innerHTML='✓ Created. '+(r.emailed?'The invitation was emailed to '+_wsEsc(email)+'.':'<b>The invitation email could not be sent</b> — give the owner this link yourself:')+'<br><code>'+_wsEsc(r.inviteUrl)+'</code>';}
  }catch(e){if(msg){msg.textContent=(e&&e.message)||'Could not create it';msg.style.color='var(--red)';}}
}
async function wsConsoleManage(id){
  var w=_wsConsoleRows.filter(function(x){return x.id===id;})[0];if(!w)return;
  var members=[];try{members=(await _trpc('workspace.opMembers',{workspaceId:id},'query')).members||[];}catch(_){}
  if(!_wsBillCfg){try{_wsBillCfg=await _trpc('billing.opConfigGet',undefined,'query');}catch(_){}}
  var own=_wsMe&&_wsMe.workspace&&_wsMe.workspace.id===id;
  var h='<div class="ws-h"><h2>'+_wsEsc(w.name)+'</h2><button class="btn btn-s"'+_wsAct('wsOpenConsole')+'>← All workspaces</button></div>';
  h+='<div class="ws-card"><h3>Name and status</h3><div class="ws-row"><div class="ws-f"><label for="wsm-name">Name</label><input class="inp" id="wsm-name" maxlength="120" value="'+_wsEsc(w.name)+'"></div><button class="btn btn-s"'+_wsAct('wsConsoleSave',[id,'name'])+'>Save name</button></div>'
    +(own||id===1?'<p>This is the platform’s own workspace: it can’t be suspended or closed.</p>'
      :'<div class="ws-row">'+(w.status==='active'?'<button class="btn btn-s"'+_wsAct('wsConsoleSave',[id,'suspend'])+'>Suspend</button>':'<button class="btn btn-s"'+_wsAct('wsConsoleSave',[id,'activate'])+'>'+(w.status==='deleted'?'Reopen':'Reactivate')+'</button>')
        +(w.status!=='deleted'?'<button class="btn btn-s" style="color:var(--red)"'+_wsAct('wsConsoleClose',[id])+'>Close (delete after 30 days)</button>':'')+'</div>'
        +'<p><b>Suspend</b> locks everyone out and stops its emails and background jobs; nothing is deleted. <b>Close</b> does the same and deletes everything after 30 days — until then you can reopen it here.</p>')
    +'</div>';
  h+='<div class="ws-card"><h3>Owner</h3>'+(members.length?'<div class="ws-row"><div class="ws-f"><label for="wsm-owner">The owner manages the workspace’s members, roles, AI keys, storage and mail</label><select class="inp" id="wsm-owner">'+members.map(function(m){return '<option value="'+m.id+'"'+(m.role==='owner'?' selected':'')+'>'+_wsEsc((m.name||'(no name)')+' — '+(m.email||'')+(m.role==='owner'?' (owner)':''))+'</option>';}).join('')+'</select></div><button class="btn btn-s"'+_wsAct('wsConsoleSave',[id,'owner'])+'>Change owner</button></div>':'<p>Nobody has joined yet'+(w.ownerInvited?' — invited: '+_wsEsc(w.ownerInvited):'')+'.</p>')
    +(w.owner?'':'<div class="ws-row"><div class="ws-f"><label for="wsm-inv">Invite an owner by email</label><input class="inp" id="wsm-inv" type="email"></div><button class="btn btn-s"'+_wsAct('wsConsoleSave',[id,'invite'])+'>Send invitation</button></div>')
    +'<div id="wsm-msg" class="ws-msg" role="status"></div></div>';
  var q=w.quotas||{};
  h+='<div class="ws-card"><h3>Daily limits</h3><p>How many AI requests (on LevelUp’s keys) and system emails this workspace may use per day. Leave empty for the standard limit ('+_wsEsc(String((w.usage&&w.usage.ai&&q.ai==null)?w.usage.ai.cap:5000))+' AI, '+_wsEsc(String((w.usage&&w.usage.email&&q.email==null)?w.usage.email.cap:800))+' emails).</p>'
    +'<div class="ws-row"><div class="ws-f" style="max-width:200px"><label for="wsm-ai">AI requests per day</label><input class="inp" id="wsm-ai" type="number" min="0" value="'+(q.ai!=null?_wsEsc(q.ai):'')+'" placeholder="standard"></div>'
    +'<div class="ws-f" style="max-width:200px"><label for="wsm-email">Emails per day</label><input class="inp" id="wsm-email" type="number" min="0" value="'+(q.email!=null?_wsEsc(q.email):'')+'" placeholder="standard"></div>'
    +'<button class="btn btn-s"'+_wsAct('wsConsoleSave',[id,'quotas'])+'>Save limits</button></div></div>';
  h+=_wsConsoleBillCard(w);
  var f=w.features||{};
  h+='<div class="ws-card"><h3>Extras</h3><p>Features built for one company. Off for everyone unless switched on here.</p>'
    +'<label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin:6px 0"><input type="checkbox" id="wsm-f-atlas"'+(f.atlas?' checked':'')+'> Atlas (the CommunityForce resource-planner feed)</label>'
    +'<label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin:6px 0"><input type="checkbox" id="wsm-f-cf"'+(f.cfLabels?' checked':'')+'> CommunityForce / LSI wording (CF and LSI views, badges and coach wording)</label>'
    +'<div class="ws-row"><button class="btn btn-s"'+_wsAct('wsConsoleSave',[id,'features'])+'>Save extras</button></div></div>';
  h+='<div class="ws-card"><h3>People ('+members.length+')</h3><div class="ws-scroll"><table class="ws-tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last seen</th></tr></thead><tbody>'
    +members.map(function(m){return '<tr><td>'+_wsEsc(m.name||'')+'</td><td>'+_wsEsc(m.email||'')+'</td><td>'+_wsEsc(m.role)+'</td><td>'+_wsEsc(_wsDay(m.lastSignedIn))+'</td></tr>';}).join('')+'</tbody></table></div></div>';
  wsModal(h,true);
}
async function wsConsoleSave(id,what){
  var g=function(i){return ((document.getElementById(i)||{}).value||'').trim();};
  var msg=function(t,bad){var el=document.getElementById('wsm-msg');if(el){el.textContent=t;el.style.color=bad?'var(--red)':'var(--ok)';}else toast(t,bad?'error':'success',bad?9000:3000);};
  try{
    if(what==='name')await _trpc('workspace.opUpdate',{workspaceId:id,name:g('wsm-name')},'mutation');
    else if(what==='suspend'){if(!confirm('Suspend this workspace? Everyone in it is locked out until you reactivate it.'))return;await _trpc('workspace.opUpdate',{workspaceId:id,status:'suspended'},'mutation');}
    else if(what==='activate')await _trpc('workspace.opUpdate',{workspaceId:id,status:'active'},'mutation');
    else if(what==='quotas'){var num=function(v){return v===''?null:Math.max(0,Math.floor(Number(v)||0));};await _trpc('workspace.opUpdate',{workspaceId:id,quotas:{ai:num(g('wsm-ai')),email:num(g('wsm-email'))}},'mutation');}
    else if(what==='features')await _trpc('workspace.opUpdate',{workspaceId:id,features:{atlas:!!(document.getElementById('wsm-f-atlas')||{}).checked,cfLabels:!!(document.getElementById('wsm-f-cf')||{}).checked}},'mutation');
    else if(what==='owner'){var uid=Number(g('wsm-owner'));if(!uid)return;if(!confirm('Make this person the owner? The current owner becomes an admin.'))return;await _trpc('workspace.opSetOwner',{workspaceId:id,memberUserId:uid},'mutation');}
    else if(what==='invite'){var em=g('wsm-inv');if(!/^\S+@\S+\.\S+$/.test(em)){msg('Enter an email address.',true);return;}var r=await _trpc('workspace.opInviteOwner',{workspaceId:id,ownerEmail:em},'mutation');await _wsConsoleReload(id);var el=document.getElementById('wsm-msg');if(el){el.style.color='var(--t1)';el.innerHTML=(r.emailed?'✓ Invitation emailed.':'<b>The email could not be sent</b> — give them this link:')+'<br><code>'+_wsEsc(r.inviteUrl)+'</code>';}return;}
    toast('Saved','success');
    await _wsConsoleReload(id);
  }catch(e){msg((e&&e.message)||'Could not save',true);}
}
async function _wsConsoleReload(id){
  try{var r=await _trpc('workspace.opList',undefined,'query');_wsConsoleRows=r.workspaces||[];}catch(_){}
  await wsConsoleManage(id);
}
async function wsConsoleClose(id){
  var w=_wsConsoleRows.filter(function(x){return x.id===id;})[0];if(!w)return;
  var v=prompt('Close “'+w.name+'”? Everyone is locked out now and everything in it is deleted after 30 days.\n\nType the workspace’s name to confirm:');
  if(v==null)return;
  try{await _trpc('workspace.opDelete',{workspaceId:id,confirmName:v.trim()},'mutation');toast('Workspace closed — it can be reopened for 30 days','success',6000);await _wsConsoleReload(id);}
  catch(e){toast((e&&e.message)||'Could not close it','error',9000);}
}

// ─── Plans, billing and sign-up (build -279) ────────────────────────────────
// A workspace that is not billed has me.billing === null and none of this shows.
var _wsPub=null,_wsBill=null,_wsBillCfg=null;
function _wsBillCSS(){
  if(document.getElementById('ws-bill-css'))return;
  var s=document.createElement('style');s.id='ws-bill-css';
  s.textContent='.ws-plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:8px 0}'
    +'.ws-plan{border:1px solid var(--bd1);border-radius:10px;padding:12px;background:var(--s2);display:flex;flex-direction:column;gap:6px;min-width:0}'
    +'.ws-plan h4{margin:0;font-size:14px}.ws-plan p{margin:0;font-size:12px;color:var(--t2);line-height:1.45}'
    +'.ws-plan ul{margin:0;padding-left:16px;font-size:12px;color:var(--t2);line-height:1.6}'
    +'.ws-plan .ws-price{font-size:12px;color:var(--t2)}.ws-plan .ws-price b{font-size:20px;color:var(--t1)}'
    +'.ws-meter{height:6px;border-radius:3px;background:var(--s3);overflow:hidden;margin-top:3px}.ws-meter i{display:block;height:100%;background:var(--ac)}'
    +'.ws-meter i.hot{background:var(--red)}'
    +'#ws-bill-bar{position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:880;max-width:calc(100vw - 24px);box-sizing:border-box;display:flex;gap:10px;align-items:center;'
    +'background:var(--s1);color:var(--t1);border:1px solid var(--bd2);border-radius:999px;padding:6px 8px 6px 14px;font-size:12.5px;box-shadow:0 6px 20px rgba(0,0,0,.25)}'
    +'#ws-bill-bar.bad{border-color:var(--red)}#ws-bill-bar span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    +'#ws-bill-bar button{flex:none}'
    +'.wsb-tbl input.inp{min-width:70px}.wsb-tbl td{vertical-align:top}';
  document.head.appendChild(s);
}
function _wsMoney(p){
  if(!p)return '';
  try{return new Intl.NumberFormat(undefined,{style:'currency',currency:String(p.currency||'usd').toUpperCase(),minimumFractionDigits:(p.amount%100?2:0)}).format(p.amount/100);}
  catch(_){return (p.amount/100).toFixed(2)+' '+String(p.currency||'').toUpperCase();}
}
function _wsStorageMb(mb){if(mb==null)return 'No limit';return mb>=1024?(Math.round(mb/102.4)/10)+' GB':mb+' MB';}
function _wsNiceDay(v){
  if(!v)return '';
  try{return new Date(v).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});}catch(_){return String(v).slice(0,10);}
}
async function _wsLoadPub(force){
  if(_wsPub&&!force)return _wsPub;
  try{_wsPub=await _trpc('billing.plans',undefined,'query');}catch(_){_wsPub={signupOpen:false,billingOn:false,trialDays:0,plans:[]};}
  return _wsPub;
}
function _wsPlanCards(plans,buy){
  if(!plans||!plans.length)return '<p style="font-size:12.5px;color:var(--t2)">No plans are on sale yet.</p>';
  return '<div class="ws-plans">'+plans.map(function(p){
    var per=p.perSeat?' per person':'';
    var price=p.monthly?'<b>'+_wsEsc(_wsMoney(p.monthly))+'</b>'+per+' / month':(p.yearly?'<b>'+_wsEsc(_wsMoney(p.yearly))+'</b>'+per+' / year':'Not on sale yet');
    var alt=p.monthly&&p.yearly?'<div class="ws-price">or '+_wsEsc(_wsMoney(p.yearly))+per+' / year</div>':'';
    var people=p.members==null?'Any number of people':(p.members===1?'One person':'Up to '+p.members+' people');
    var btns='';
    if(buy&&p.buyable){
      btns='<div class="ws-row" style="margin-top:auto">'
        +(p.monthly?'<button class="btn btn-p btn-s"'+_wsAct('wsBillCheckout',[p.key,'month'])+'>Choose monthly</button>':'')
        +(p.yearly?'<button class="btn btn-s"'+_wsAct('wsBillCheckout',[p.key,'year'])+'>Choose yearly</button>':'')+'</div>';
    }
    return '<div class="ws-plan"><h4>'+_wsEsc(p.name)+'</h4><div class="ws-price">'+price+'</div>'+alt
      +(p.blurb?'<p>'+_wsEsc(p.blurb)+'</p>':'')
      +'<ul><li>'+people+'</li><li>'+Number(p.ai).toLocaleString()+' AI requests a day</li><li>'+_wsEsc(_wsStorageMb(p.storageMb))+' file storage</li></ul>'+btns+'</div>';
  }).join('')+'</div>';
}
function _wsBillLine(b){
  // one sentence for the state a workspace is in (b = billing.status or me.billing)
  if(!b)return '';
  var plan=b.planName?_wsEsc(b.planName):'';
  if(b.status==='comped')return 'Complimentary'+(plan&&plan!=='Complimentary'?' ('+plan+' limits)':'')+' — this workspace is not charged.';
  if(b.status==='trialing'){
    var d=b.trialDaysLeft;
    return 'Free trial — <b>'+d+' day'+(d===1?'':'s')+' left</b>'+(b.trialEndsAt?' (until '+_wsEsc(_wsNiceDay(b.trialEndsAt))+')':'')+'.'
      +(b.hasSubscription?' Your '+plan+' plan starts then; nothing is charged before.':' Choose a plan to keep working after that.');
  }
  if(b.status==='active')return '<b>'+plan+'</b>'+(b.interval?' · billed '+(b.interval==='year'?'yearly':'monthly'):'')
    +(b.currentPeriodEnd?(b.cancelAtPeriodEnd?' · <span style="color:var(--red)">ends '+_wsEsc(_wsNiceDay(b.currentPeriodEnd))+' (cancelled)</span>':' · renews '+_wsEsc(_wsNiceDay(b.currentPeriodEnd))):'')+'.';
  if(b.status==='past_due')return '<span style="color:var(--red)"><b>The last payment failed.</b></span> '+(b.locked?'The workspace is locked until the card is updated.':'Update the card'+(b.graceEndsAt?' by '+_wsEsc(_wsNiceDay(b.graceEndsAt)):'')+' or the workspace will be locked.');
  if(b.status==='trial_ended')return '<b>The free trial has ended.</b> Choose a plan to unlock the workspace.';
  if(b.status==='canceled')return '<b>The subscription has ended.</b> Choose a plan to unlock the workspace.';
  return '';
}
function _wsMeter(label,used,cap,fmt){
  var f=fmt||function(n){return Number(n).toLocaleString();};
  var pct=cap?Math.min(100,Math.round(100*used/cap)):0;
  return '<div style="margin:8px 0;font-size:12.5px"><div style="display:flex;justify-content:space-between;gap:8px"><span>'+label+'</span><span style="color:var(--t2)">'+_wsEsc(f(used))+(cap==null?'':' of '+_wsEsc(f(cap)))+'</span></div>'
    +(cap==null?'':'<div class="ws-meter" role="img" aria-label="'+pct+'% used"><i class="'+(pct>=90?'hot':'')+'" style="width:'+pct+'%"></i></div>')+'</div>';
}
function _wsBillingHtml(st){
  _wsBillCSS();
  if(!st||st.error)return '<p style="color:var(--red);font-size:13px">'+_wsEsc((st&&st.error)||'Could not load')+'</p>';
  var h='<div class="ws-card"><h3>Plan</h3><p style="font-size:13px;color:var(--t1)">'+_wsBillLine(st)+'</p>';
  if(st.isOwner){
    if(st.hasSubscription){
      h+='<div class="ws-row"><button class="btn btn-p"'+_wsAct('wsBillPortal')+'>Manage billing</button></div>'
        +'<p>Opens Stripe’s secure page: change the card, see invoices, change the plan or cancel.'+(st.seats>1?' You are billed for '+st.seats+' people; the number follows your member list.':'')+'</p>';
    }else if(st.status==='comped'){
      h+='';
    }else if(!st.canBuy){
      h+='<p>Plans are not on sale at the moment. Ask LevelUp support.</p>';
    }
  }else if(st.billed){
    h+='<p>Only the workspace’s owner can change the plan.</p>';
  }
  h+='<div id="ws-bill-msg" class="ws-msg" role="status"></div></div>';
  var u=st.usage||{},l=st.limits;
  h+='<div class="ws-card"><h3>What this workspace uses</h3>'
    +_wsMeter('People',u.members||0,l?l.members:null)
    +_wsMeter('AI requests today',(u.ai&&u.ai.used)||0,u.ai?u.ai.cap:null)
    +_wsMeter('Emails today',(u.email&&u.email.used)||0,u.email?u.email.cap:null)
    +(u.storageBytes!=null&&l&&l.storageMb!=null?_wsMeter('File storage',Math.round(u.storageBytes/1048576),l.storageMb,_wsStorageMb):'')
    +'<p>AI requests count only when LevelUp’s keys are used — with your own key (Settings → AI Features) they don’t. File storage counts LevelUp’s storage only, not your own bucket or Drive.</p></div>';
  if(st.isOwner&&!st.hasSubscription&&st.status!=='comped'&&st.canBuy){
    h+='<div class="ws-card"><h3>Choose a plan</h3>'+_wsPlanCards(st.plans,true)
      +'<p>You pay on Stripe’s secure page.'+(st.status==='trialing'&&st.trialDaysLeft>2?' The days left in your free trial are kept — the first charge is on '+_wsEsc(_wsNiceDay(st.trialEndsAt))+'.':'')+' You can change plan or cancel at any time.</p></div>';
  }
  return h;
}
async function wsBillCheckout(plan,interval){
  var msg=document.getElementById('ws-bill-msg')||document.getElementById('ws-lock-msg');
  if(msg){msg.textContent='Opening the payment page…';msg.style.color='var(--t2)';}
  try{var r=await _trpc('billing.checkout',{plan:plan,interval:interval},'mutation');if(r&&r.url)location.href=r.url;}
  catch(e){if(msg){msg.textContent=(e&&e.message)||'Could not open the payment page.';msg.style.color='var(--red)';}else toast((e&&e.message)||'Could not open the payment page','error',9000);}
}
async function wsBillPortal(){
  var msg=document.getElementById('ws-bill-msg')||document.getElementById('ws-lock-msg');
  if(msg){msg.textContent='Opening the billing page…';msg.style.color='var(--t2)';}
  try{var r=await _trpc('billing.portal',undefined,'mutation');if(r&&r.url)location.href=r.url;}
  catch(e){if(msg){msg.textContent=(e&&e.message)||'Could not open the billing page.';msg.style.color='var(--red)';}else toast((e&&e.message)||'Could not open the billing page','error',9000);}
}

// the small bar an owner sees during a trial or after a failed payment
function _wsBillBar(){
  var old=document.getElementById('ws-bill-bar');if(old)old.remove();
  var b=_wsMe&&_wsMe.billing;
  if(!b||b.locked||_wsRole()!=='owner')return;
  var text='',bad=false,hold=1;
  if(b.status==='trialing'&&b.trialDaysLeft!=null){
    // a trial that already has a subscription needs no nagging
    if(b.currentPeriodEnd)return;
    text='Free trial: '+b.trialDaysLeft+' day'+(b.trialDaysLeft===1?'':'s')+' left';hold=b.trialDaysLeft>7?7:1;
  }else if(b.status==='past_due'){text='Payment failed — update your card'+(b.graceEndsAt?' by '+_wsNiceDay(b.graceEndsAt):'');bad=true;}
  else return;
  try{var until=Number(localStorage.getItem('lu_bill_bar_hide')||0);if(until>Date.now()&&!bad)return;}catch(_){}
  _wsBillCSS();
  var d=document.createElement('div');d.id='ws-bill-bar';if(bad)d.className='bad';d.setAttribute('role','status');
  d.innerHTML='<span>'+_wsEsc(text)+'</span><button class="btn btn-p btn-s"'+_wsAct('wsOpenSettings',['billing'])+'>'+(bad?'Fix it':'Choose a plan')+'</button>'
    +(bad?'':'<button class="btn btn-s" aria-label="Hide this for now"'+_wsAct('wsBillBarHide',[hold])+'>✕</button>');
  document.body.appendChild(d);
}
function wsBillBarHide(days){
  try{localStorage.setItem('lu_bill_bar_hide',String(Date.now()+Number(days||1)*86400000));}catch(_){}
  var el=document.getElementById('ws-bill-bar');if(el)el.remove();
}

// the workspace is locked for non-payment: the reason, and the way out
async function _wsShowLocked(me){
  _wsCSS();_wsBillCSS();
  var old=document.getElementById('ws-inactive');if(old)old.remove();
  var b=me.billing||{};
  var owner=!!me.isOwner;
  var name=(me.workspace&&me.workspace.name)||'This workspace';
  var why=b.lockReason==='trial_ended'?'The free trial of “'+name+'” has ended':b.lockReason==='unpaid'?'“'+name+'” is locked: a payment is outstanding':'The subscription of “'+name+'” has ended';
  var others=(me.workspaces||[]).filter(function(w){return !w.current&&w.status==='active';});
  var d=document.createElement('div');d.id='ws-inactive';
  d.innerHTML='<div class="ws-dlg" style="max-width:'+(owner?'760px':'460px')+';max-height:calc(100vh - 32px);overflow:auto"><h2 style="font-size:18px;margin:0 0 8px">'+_wsEsc(why)+'</h2>'
    +'<p style="font-size:13px;color:var(--t2);line-height:1.55;margin:0 0 12px">'+(owner?'Nothing has been deleted. Everything is exactly as you left it and opens again as soon as a plan is in place. You can also download your data or close the workspace.':'Nothing has been deleted. It opens again as soon as the workspace’s owner sorts out the plan — please ask them.')+'</p>'
    +'<div id="ws-lock-body">'+(owner?'<p style="font-size:12.5px;color:var(--t2)">Loading plans…</p>':'')+'</div><div id="ws-lock-msg" class="ws-msg" role="status"></div>'
    +(others.length?'<p style="font-size:12.5px;font-weight:650;margin:12px 0 6px">Your other workspaces</p>'+others.map(function(w){return '<button class="ws-mi" style="border:1px solid var(--bd1);margin-bottom:6px"'+_wsAct('wsSwitch',[w.id])+'><span style="flex:1">'+_wsEsc(w.name)+'<small>'+_wsEsc(w.role)+'</small></span>Open →</button>';}).join(''):'')
    +'<div class="ws-row" style="margin-top:10px">'+(owner?'<button class="btn btn-s"'+_wsAct('wsLockedExport')+'>Download my data</button><button class="btn btn-s" style="color:var(--red)"'+_wsAct('wsLockedClose')+'>Close workspace…</button>':'')+'<button class="btn btn-s"'+_wsAct('wsSignOutInactive')+'>Sign out</button></div><div id="ws-export-msg" class="ws-msg" role="status"></div></div>';
  document.body.appendChild(d);
  if(!owner)return;
  var st=null;try{st=await _trpc('billing.status',undefined,'query');}catch(e){st={error:(e&&e.message)||'Could not load the plans'};}
  var box=document.getElementById('ws-lock-body');if(!box)return;
  if(st.error){box.innerHTML='<p style="color:var(--red);font-size:13px">'+_wsEsc(st.error)+'</p>';return;}
  box.innerHTML=st.hasSubscription
    ?'<div class="ws-row"><button class="btn btn-p"'+_wsAct('wsBillPortal')+'>Update the card</button></div><p style="font-size:12.5px;color:var(--t2)">Opens Stripe’s secure page. The workspace unlocks as soon as the payment goes through.</p>'
    :(st.canBuy?_wsPlanCards(st.plans,true):'<p style="font-size:12.5px;color:var(--t2)">Plans are not on sale at the moment. Please contact LevelUp support.</p>');
}
function wsLockedExport(){return wsExport();}
async function wsLockedClose(){
  var name=(_wsMe&&_wsMe.workspace&&_wsMe.workspace.name)||'';
  var v=prompt('Close “'+name+'”? Everyone is locked out and everything in it is deleted after 30 days. Download your data first if you may need it.\n\nType the workspace’s name to confirm:');
  if(v==null)return;
  try{await _trpc('workspace.requestDelete',{confirmName:v.trim()},'mutation');location.replace('/');}
  catch(e){var m=document.getElementById('ws-lock-msg');if(m){m.textContent=(e&&e.message)||'Could not close the workspace';m.style.color='var(--red)';}}
}

// back from Stripe, or from a link in a reminder email
async function _wsBillReturn(){
  var q;try{q=new URLSearchParams(location.search);}catch(_){return;}
  var v=q.get('billing');if(!v)return;
  try{q.delete('billing');history.replaceState(null,'',location.pathname+(q.toString()?'?'+q.toString():'')+location.hash);}catch(_){}
  if(!_wsMe||!_wsMe.id)return;
  if(v==='success'||v==='portal'){
    var wasLocked=!!(_wsMe.billing&&_wsMe.billing.locked);
    if(_wsMe.isOwner){try{await _trpc('billing.refresh',undefined,'mutation');}catch(_){}}
    var me=null;try{me=await _trpc('auth.me',{},'query');}catch(_){}
    if(me&&me.id){_wsMe=me;window._luMe=me;}
    var nowLocked=!!(_wsMe.billing&&_wsMe.billing.locked);
    if(wasLocked&&!nowLocked){location.replace('/');return;}
    if(nowLocked){_wsShowLocked(_wsMe);return;}
    _wsBillBar();
    if(v==='success')toast('Thank you — your plan is set up','success',6000);
    wsOpenSettings('billing');
  }else if(v==='cancelled'){
    toast('No plan was chosen — nothing was charged','info',6000);
    if(!(_wsMe.billing&&_wsMe.billing.locked))wsOpenSettings('billing');
  }else if(v==='open'){
    if(!(_wsMe.billing&&_wsMe.billing.locked))wsOpenSettings('billing');
  }
}
// called at the end of wsBoot: what does this workspace's billing mean for this person, right now?
function _wsBillAfterBoot(){
  try{
    var b=_wsMe&&_wsMe.billing;
    if(b&&b.locked){
      var q='';try{q=new URLSearchParams(location.search).get('billing')||'';}catch(_){}
      if(q==='success'||q==='portal'){_wsBillReturn();return;}
      _wsShowLocked(_wsMe);return;
    }
    _wsBillBar();
    _wsBillReturn();
    _wsLoadPub().then(function(){_wsPaintUserMenu();});
  }catch(_){}
}

// ── a further workspace for the login that is signed in ──
function wsCreateWorkspaceDialog(){
  try{if(typeof closePopMenu==='function')closePopMenu('sb-user-menu');}catch(_){}
  var p=_wsPub||{};
  wsModal('<div class="ws-h"><h2>Create a workspace</h2><button class="btn btn-s"'+_wsAct('wsCloseModal')+'>Close</button></div>'
    +'<div class="ws-card"><p>A new, empty workspace that you own — for another company, a client or yourself. It is separate from this one: its own people, items, files and plan.'+(p.billingOn&&p.trialDays?' It starts with a '+p.trialDays+'-day free trial.':'')+'</p>'
    +'<div class="ws-row"><div class="ws-f"><label for="wsn-name">Workspace name</label><input class="inp" id="wsn-name" maxlength="120" placeholder="Acme Inc."></div><button class="btn btn-p"'+_wsAct('wsCreateWorkspace')+'>Create and open</button></div>'
    +'<div id="wsn-msg" class="ws-msg" role="status"></div></div>');
  setTimeout(function(){var e=document.getElementById('wsn-name');if(e)e.focus();},50);
}
async function wsCreateWorkspace(){
  var name=((document.getElementById('wsn-name')||{}).value||'').trim();
  var msg=document.getElementById('wsn-msg');
  if(!name){if(msg){msg.textContent='Give the workspace a name.';msg.style.color='var(--red)';}return;}
  if(msg){msg.textContent='Creating…';msg.style.color='var(--t2)';}
  try{
    try{if(typeof _flushDirtyNow==='function')_flushDirtyNow();}catch(_){}
    await new Promise(function(r){setTimeout(r,450);});
    var r=await _trpc('billing.createWorkspace',{name:name},'mutation');
    // the cookie now belongs to the new workspace: nothing cached may survive
    try{if(typeof _luWipeLocalCache==='function')_luWipeLocalCache();}catch(_){}
    try{if(r&&r.userId)localStorage.setItem('lu_last_uid',String(r.userId));}catch(_){}
    location.replace('/');
  }catch(e){if(msg){msg.textContent=(e&&e.message)||'Could not create the workspace';msg.style.color='var(--red)';}}
}

// ── sign-up from the sign-in page ──
function _wsSignupUi(){
  var box=document.getElementById('login-box-register');
  if(!box||box.getAttribute('data-ws-up')||!_wsPub||!_wsPub.signupOpen)return;
  box.setAttribute('data-ws-up','1');
  try{
    var h=box.querySelector('h2');if(h)h.textContent='Create your workspace';
    var p=box.querySelector('p');if(p)p.textContent=_wsPub.billingOn&&_wsPub.trialDays?'Free for '+_wsPub.trialDays+' days. No card needed.':'LevelUp for yourself or your team.';
    var nameIn=document.getElementById('reg-name');
    if(nameIn){
      nameIn.setAttribute('placeholder','Your name');
      var wrap=nameIn.parentNode,clone=wrap.cloneNode(true);
      var lab=clone.querySelector('label'),inp=clone.querySelector('input');
      if(lab&&inp){
        lab.textContent='Workspace or company name';lab.setAttribute('for','reg-ws');
        inp.id='reg-ws';inp.value='';inp.setAttribute('placeholder','Acme Inc. (or leave empty)');inp.setAttribute('autocomplete','organization');inp.setAttribute('maxlength','120');
        wrap.parentNode.insertBefore(clone,wrap.nextSibling);
      }
    }
    var err=document.getElementById('reg-err');
    if(err&&(_wsPub.termsUrl||_wsPub.privacyUrl)){
      var t=document.createElement('label');
      t.style.cssText='display:flex;gap:8px;align-items:flex-start;font-size:11.5px;color:var(--t2);margin-bottom:12px;line-height:1.4';
      var link=function(u,txt){return u?'<a href="'+_wsEsc(u)+'" target="_blank" rel="noopener" style="color:var(--ach)">'+txt+'</a>':'';};
      var parts=[link(_wsPub.termsUrl,'Terms'),link(_wsPub.privacyUrl,'Privacy Policy')].filter(Boolean).join(' and ');
      t.innerHTML='<input type="checkbox" id="reg-terms" style="margin-top:2px"><span>I agree to the '+parts+'.</span>';
      err.parentNode.insertBefore(t,err);
    }
    var btn=document.getElementById('reg-submit-btn');if(btn)btn.textContent='Create workspace';
  }catch(_){}
  var orig=window.attemptRegister;
  window.attemptRegister=function(){
    if(_wsPub&&_wsPub.signupOpen)return _wsSignupStart();
    return orig&&orig.apply(this,arguments);
  };
}
async function _wsSignupStart(){
  var g=function(id){return (document.getElementById(id)||{}).value||'';};
  var name=g('reg-name').trim(),ws=g('reg-ws').trim(),email=g('reg-email').trim().toLowerCase(),pw=g('reg-password');
  var errEl=document.getElementById('reg-err'),btn=document.getElementById('reg-submit-btn');
  var bad=function(t){if(errEl)errEl.textContent=t;};
  if(!name)return bad('Please enter your name.');
  if(!/^\S+@\S+\.\S+$/.test(email))return bad('Please enter your email address.');
  if(pw.length<8)return bad('Password must be at least 8 characters.');
  var terms=document.getElementById('reg-terms');
  if(terms&&!terms.checked)return bad('Please accept the terms to continue.');
  if(btn){btn.disabled=true;btn.textContent='Sending…';}
  bad('');
  try{
    await _trpc('billing.signupStart',{name:name,workspaceName:ws,email:email,password:pw,acceptTerms:!!(terms&&terms.checked)},'mutation');
    var box=document.getElementById('login-box-register');
    if(box)box.innerHTML='<h2>Check your email</h2><p>We sent a confirmation link to <b>'+_wsEsc(email)+'</b>.</p>'
      +'<p style="font-size:12.5px;color:var(--t2);line-height:1.55;margin:10px 0 16px">Open the link to create your workspace — it works once, for 24 hours. Nothing is created until you do. If the email doesn’t arrive in a few minutes, check the spam folder.</p>'
      +'<div style="text-align:center;font-size:11px;color:var(--t3)"><span style="color:var(--ach);cursor:pointer;text-decoration:underline"'+_wsAct('wsSignupAgain')+'>Use a different address</span></div>';
  }catch(e){
    bad((e&&e.message)||'Could not start the sign-up. Please try again.');
    if(btn){btn.disabled=false;btn.textContent='Create workspace';}
  }
}
function wsSignupAgain(){location.replace('/');}
// the link from the confirmation email: /?signup=<token>
async function _wsSignupConfirmPage(token){
  _wsCSS();
  var d=document.createElement('div');d.id='ws-inactive';
  var paint=function(html){d.innerHTML='<div class="ws-dlg" style="max-width:460px">'+html+'</div>';};
  paint('<h2 style="font-size:18px;margin:0 0 8px">One moment…</h2>');
  document.body.appendChild(d);
  var clean=function(){try{history.replaceState(null,'','/');}catch(_){}};
  var info=null;try{info=await _trpc('billing.signupPeek',{token:token},'query');}catch(_){info=null;}
  if(!info||!info.valid){
    clean();
    paint('<h2 style="font-size:18px;margin:0 0 8px">This link is no longer valid</h2><p style="font-size:13px;color:var(--t2);line-height:1.55;margin:0 0 14px">Confirmation links work once and for 24 hours. If you already confirmed, just sign in. Otherwise start again from the sign-up page.</p><button class="btn btn-p"'+_wsAct('wsSignupAgain')+'>Go to sign in</button>');
    return;
  }
  window._wsSignupToken=token;
  paint('<h2 style="font-size:18px;margin:0 0 8px">Create “'+_wsEsc(info.workspaceName)+'”</h2>'
    +'<p style="font-size:13px;color:var(--t2);line-height:1.55;margin:0 0 14px">Your email <b>'+_wsEsc(info.email)+'</b> is confirmed. Create the workspace and you are signed in as its owner.</p>'
    +'<div class="ws-row"><button class="btn btn-p" id="ws-signup-go"'+_wsAct('wsSignupConfirm')+'>Create workspace and open LevelUp</button></div><div id="ws-signup-msg" class="ws-msg" role="status"></div>');
}
async function wsSignupConfirm(){
  var msg=document.getElementById('ws-signup-msg'),btn=document.getElementById('ws-signup-go');
  if(btn)btn.disabled=true;
  if(msg){msg.textContent='Creating your workspace…';msg.style.color='var(--t2)';}
  try{
    var r=await _trpc('billing.signupConfirm',{token:window._wsSignupToken||''},'mutation');
    // whoever used this browser before: none of their cached data may show in the new account
    try{if(typeof _luWipeLocalCache==='function')_luWipeLocalCache();}catch(_){}
    try{if(r&&r.userId)localStorage.setItem('lu_last_uid',String(r.userId));}catch(_){}
    location.replace('/');
  }catch(e){
    if(msg){msg.textContent=(e&&e.message)||'Could not create the workspace.';msg.style.color='var(--red)';}
    if(btn)btn.disabled=false;
  }
}

// ── operator: plans, prices and the sign-up switch ──
async function wsOpenBillingAdmin(){
  _wsBillCSS();
  wsModal('<div class="ws-h"><h2>Billing &amp; sign-up</h2><button class="btn btn-s"'+_wsAct('wsOpenConsole')+'>← Platform console</button></div><div id="ws-billadmin"><p style="font-size:12.5px;color:var(--t2)">Loading…</p></div>',true);
  var box=document.getElementById('ws-billadmin');
  try{_wsBillCfg=await _trpc('billing.opConfigGet',undefined,'query');}
  catch(e){if(box)box.innerHTML='<p style="color:var(--red);font-size:13px">'+_wsEsc((e&&e.message)||'Could not load')+'</p>';return;}
  if(box)box.innerHTML=_wsBillAdminHtml(_wsBillCfg);
}
function _wsBillAdminHtml(r){
  var c=r.config,s=r.stripe||{},hook=location.origin+'/api/stripe/webhook';
  var yes=function(ok,t){return '<span class="ws-pill '+(ok?'ok':'warn')+'">'+t+'</span>';};
  var h='<div class="ws-card"><h3>Stripe</h3><p>'+yes(s.configured,s.configured?'connected':'not connected')+' '+(s.mode?yes(s.mode==='live',s.mode==='live'?'live mode':'test mode'):'')+' '+yes(s.webhookSecretSet,s.webhookSecretSet?'webhook secret set':'webhook secret missing')+'</p>'
    +'<p>Payments run through your Stripe account. To connect it: 1. In Stripe, create a <b>Product</b> for each plan with a recurring <b>Price</b> (monthly and, if you like, yearly) and copy each price id (it starts with <code>price_</code>) into the table below. '
    +'2. In Stripe → Developers → API keys copy the <b>secret key</b> and set it on Railway as <code>STRIPE_SECRET_KEY</code>. '
    +'3. In Stripe → Developers → Webhooks add an endpoint for <code>'+_wsEsc(hook)+'</code> with the events <code>checkout.session.completed</code>, <code>customer.subscription.created</code>, <code>customer.subscription.updated</code>, <code>customer.subscription.deleted</code>, <code>invoice.paid</code> and <code>invoice.payment_failed</code>; copy its <b>signing secret</b> to Railway as <code>STRIPE_WEBHOOK_SECRET</code>. '
    +'4. In Stripe → Settings → Billing → Customer portal, switch the portal on. Use Stripe’s <b>test mode</b> keys first: nothing is charged, and test cards work.</p></div>';
  h+='<div class="ws-card"><h3>Sign-up and trial</h3>'
    +(c.signupOpen&&!r.sellable?'<p style="color:var(--red)"><b>Sign-up is open but nothing is on sale</b> (Stripe is not connected, or no plan has a price): new workspaces are free and have no plan limits.</p>':'')
    +'<label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin:6px 0"><input type="checkbox" id="wsb-open"'+(c.signupOpen?' checked':'')+'> Anyone can create a workspace from the sign-in page (email confirmation required)</label>'
    +'<div class="ws-row"><div class="ws-f" style="max-width:150px"><label for="wsb-trial">Free trial, days</label><input class="inp" id="wsb-trial" type="number" min="0" max="90" value="'+_wsEsc(c.trialDays)+'"></div>'
    +'<div class="ws-f" style="max-width:190px"><label for="wsb-trialplan">Limits during the trial</label><select class="inp" id="wsb-trialplan">'+c.plans.map(function(p){return '<option value="'+_wsEsc(p.key)+'"'+(p.key===c.trialPlan?' selected':'')+'>'+_wsEsc(p.name)+'</option>';}).join('')+'</select></div>'
    +'<div class="ws-f" style="max-width:210px"><label for="wsb-grace">Days allowed after a failed payment</label><input class="inp" id="wsb-grace" type="number" min="0" max="60" value="'+_wsEsc(c.graceDays)+'"></div></div>'
    +'<div class="ws-row"><div class="ws-f"><label for="wsb-terms">Link to your Terms (optional)</label><input class="inp" id="wsb-terms" type="url" value="'+_wsEsc(c.termsUrl)+'" placeholder="https://"></div>'
    +'<div class="ws-f"><label for="wsb-privacy">Link to your Privacy Policy (optional)</label><input class="inp" id="wsb-privacy" type="url" value="'+_wsEsc(c.privacyUrl)+'" placeholder="https://"></div></div>'
    +'<label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin:6px 0"><input type="checkbox" id="wsb-tax"'+(c.automaticTax?' checked':'')+'> Let Stripe add sales tax / VAT at checkout (needs Stripe Tax set up in Stripe)</label>'
    +'<p>When a trial ends without a plan, or a payment stays unpaid past the days allowed, the workspace is locked: nothing is deleted, and its owner can pay, export or close it. Workspaces you created yourself and your own are never billed unless you say so on their Manage page.</p></div>';
  h+='<div class="ws-card"><h3>Plans</h3><p>The limits each plan allows, and the Stripe prices that sell it. A plan without a price id cannot be bought. The amounts customers see are read from Stripe.</p><div class="ws-scroll"><table class="ws-tbl wsb-tbl"><thead><tr><th>Plan</th><th>People</th><th>AI / day</th><th>Emails / day</th><th>Storage MB</th><th>Stripe price ids</th><th>Options</th></tr></thead><tbody>';
  c.plans.forEach(function(p){
    var k=_wsEsc(p.key),pr=(r.prices||{})[p.key]||{};
    var shown=function(id,info,label){return id?(info?'<span style="color:var(--ok)">'+_wsEsc(_wsMoney(info))+' / '+_wsEsc(info.interval)+'</span>':'<span style="color:var(--red)">'+label+' price not found in Stripe</span>'):'';};
    h+='<tr data-wsb-plan="'+k+'"><td><input class="inp" aria-label="Plan name" data-f="name" maxlength="40" value="'+_wsEsc(p.name)+'"><input class="inp" aria-label="Short description" data-f="blurb" maxlength="200" value="'+_wsEsc(p.blurb)+'" style="margin-top:4px" placeholder="Short description"></td>'
      +'<td><input class="inp" aria-label="People allowed" data-f="members" type="number" min="1" value="'+(p.members==null?'':_wsEsc(p.members))+'" placeholder="no limit"></td>'
      +'<td><input class="inp" aria-label="AI requests a day" data-f="ai" type="number" min="0" value="'+_wsEsc(p.ai)+'"></td>'
      +'<td><input class="inp" aria-label="Emails a day" data-f="email" type="number" min="0" value="'+_wsEsc(p.email)+'"></td>'
      +'<td><input class="inp" aria-label="Storage in megabytes" data-f="storageMb" type="number" min="0" value="'+(p.storageMb==null?'':_wsEsc(p.storageMb))+'" placeholder="no limit"></td>'
      +'<td><input class="inp" aria-label="Monthly price id" data-f="priceMonthly" value="'+_wsEsc(p.priceMonthly)+'" placeholder="price_… (monthly)"><div style="font-size:11px">'+shown(p.priceMonthly,pr.monthly,'Monthly')+'</div>'
      +'<input class="inp" aria-label="Yearly price id" data-f="priceYearly" value="'+_wsEsc(p.priceYearly)+'" placeholder="price_… (yearly)" style="margin-top:4px"><div style="font-size:11px">'+shown(p.priceYearly,pr.yearly,'Yearly')+'</div></td>'
      +'<td style="white-space:nowrap;font-size:12px"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-f="perSeat"'+(p.perSeat?' checked':'')+'> per person</label><label style="display:flex;gap:6px;align-items:center;margin-top:4px"><input type="checkbox" data-f="public"'+(p.public?' checked':'')+'> offered</label></td></tr>';
  });
  h+='</tbody></table></div><div class="ws-row"><button class="btn btn-p"'+_wsAct('wsBillAdminSave')+'>Save</button></div><div id="wsb-msg" class="ws-msg" role="status"></div></div>';
  return h;
}
async function wsBillAdminSave(){
  var msg=document.getElementById('wsb-msg');
  var v=function(id){return ((document.getElementById(id)||{}).value||'').trim();};
  var cur=(_wsBillCfg&&_wsBillCfg.config)||{plans:[]};
  var plans=[];
  document.querySelectorAll('tr[data-wsb-plan]').forEach(function(tr,i){
    var key=tr.getAttribute('data-wsb-plan'),old=cur.plans.filter(function(p){return p.key===key;})[0]||{};
    var f=function(n){var el=tr.querySelector('[data-f="'+n+'"]');return el?(el.type==='checkbox'?el.checked:String(el.value||'').trim()):'';};
    var num=function(n){var s=f(n);return s===''?null:Math.max(0,Math.floor(Number(s)||0));};
    plans.push({key:key,name:f('name')||old.name,blurb:f('blurb'),perSeat:!!f('perSeat'),members:num('members'),ai:num('ai')==null?0:num('ai'),email:num('email')==null?0:num('email'),storageMb:num('storageMb'),priceMonthly:f('priceMonthly'),priceYearly:f('priceYearly'),'public':!!f('public'),order:old.order||i+1});
  });
  var open=!!(document.getElementById('wsb-open')||{}).checked;
  if(open&&!cur.signupOpen&&!confirm('Open sign-up? Anyone will be able to create a workspace from the sign-in page.'))return;
  if(msg){msg.textContent='Saving…';msg.style.color='var(--t2)';}
  try{
    await _trpc('billing.opConfigSet',{config:{plans:plans,signupOpen:open,trialDays:Number(v('wsb-trial')||0),trialPlan:v('wsb-trialplan'),graceDays:Number(v('wsb-grace')||0),termsUrl:v('wsb-terms'),privacyUrl:v('wsb-privacy'),automaticTax:!!(document.getElementById('wsb-tax')||{}).checked}},'mutation');
    _wsPub=null;
    await wsOpenBillingAdmin();
    toast('Saved','success');
  }catch(e){if(msg){msg.textContent=(e&&e.message)||'Could not save';msg.style.color='var(--red)';}}
}
function _wsConsoleBillCell(w){
  var b=w.billing;if(!b)return '<span style="color:var(--t3)">not billed</span>';
  var cls=b.locked?'bad':(b.status==='active'||b.status==='comped')?'ok':'warn';
  var label=b.status==='trialing'?'trial · '+b.trialDaysLeft+'d':b.status==='trial_ended'?'trial ended':b.status==='past_due'?'payment failed':b.status;
  return '<span class="ws-pill '+cls+'">'+_wsEsc(label)+'</span>'+(b.planName?'<br><span style="color:var(--t3);font-size:11px">'+_wsEsc(b.planName)+(b.locked?' · locked':'')+'</span>':'');
}
function _wsConsoleBillCard(w){
  var b=w.billing,plans=((_wsBillCfg&&_wsBillCfg.config&&_wsBillCfg.config.plans)||[]);
  var opts=plans.map(function(p){return '<option value="'+_wsEsc(p.key)+'">'+_wsEsc(p.name)+'</option>';}).join('');
  return '<div class="ws-card"><h3>Billing</h3><p>'+(b?_wsConsoleBillCell(w).replace('<br>',' '):'This workspace is <b>not billed</b>: no trial, no plan limits, never locked.')
    +(b&&b.hasSubscription?' It has a Stripe subscription — changes are made in Stripe or by its owner.':'')+'</p>'
    +(b&&b.hasSubscription?'':'<div class="ws-row"><div class="ws-f" style="max-width:260px"><label for="wsm-bmode">Set to</label><select class="inp" id="wsm-bmode"><option value="none">Not billed (free, no plan limits)</option><option value="comped">Free, with a plan’s limits</option><option value="trial">Free trial, then it must choose a plan</option></select></div>'
      +'<div class="ws-f" style="max-width:170px"><label for="wsm-bplan">Plan (for limits)</label><select class="inp" id="wsm-bplan">'+opts+'</select></div>'
      +'<div class="ws-f" style="max-width:130px"><label for="wsm-bdays">Trial days</label><input class="inp" id="wsm-bdays" type="number" min="0" max="365" value="14"></div>'
      +'<button class="btn btn-s"'+_wsAct('wsConsoleBilling',[w.id])+'>Apply</button></div><p>“Free trial” locks the workspace when the days run out unless its owner has chosen a plan — use it to extend a customer’s trial, too.</p>')
    +'</div>';
}
async function wsConsoleBilling(id){
  var g=function(i){return ((document.getElementById(i)||{}).value||'').trim();};
  var mode=g('wsm-bmode');
  if(mode==='trial'&&!confirm('Put this workspace on a free trial? When the days run out it is locked until its owner chooses a plan.'))return;
  try{
    await _trpc('billing.opSet',{workspaceId:id,mode:mode,plan:g('wsm-bplan')||undefined,trialDays:mode==='trial'?Math.max(0,Math.floor(Number(g('wsm-bdays'))||0)):undefined},'mutation');
    toast('Saved','success');
    await _wsConsoleReload(id);
  }catch(e){toast((e&&e.message)||'Could not save','error',9000);}
}
// start-up: a confirmation link, and the sign-up form on the sign-in page
function _wsBillInit(){
  try{
    var tok='';try{tok=new URLSearchParams(location.search).get('signup')||'';}catch(_){}
    if(/^[a-f0-9]{64}$/.test(tok)){_wsSignupConfirmPage(tok);return;}
  }catch(_){}
  var tries=0;
  var up=function(){
    tries++;
    if(_wsMe&&_wsMe.id)return;                       // signed in: no sign-in page
    if(!document.getElementById('login-box-register')){if(tries<10)setTimeout(up,400);return;}
    _wsLoadPub().then(function(){_wsSignupUi();});
  };
  setTimeout(up,300);
  // Help Center article
  try{
    if(typeof HC_ARTICLES!=='undefined'&&Array.isArray(HC_ARTICLES)&&!HC_ARTICLES.some(function(a){return a.slug==='plans-billing';})){
      HC_ARTICLES.push({id:75,slug:'plans-billing',catId:6,title:'Plans, the free trial and billing',
        summary:'The free trial, choosing or changing a plan, what a plan limits, what happens when a payment fails, and creating another workspace.',
        tags:['plan','billing','trial','subscription','payment','invoice','card','stripe','upgrade','cancel','locked','seats','sign up'],
        body:[
          '## Plans, the free trial and billing',
          '',
          'A workspace that was created from the sign-up page starts with a **free trial** — no card needed. To keep using it after the trial its **owner** chooses a plan. Workspaces set up for you by LevelUp may not be billed at all: then **Workspace settings** has no *Plan & billing* tab and nothing here applies.',
          '',
          '### Where it is',
          'Menu on your name (bottom of the sidebar) → **Workspace: …** → **Plan & billing**. Everyone in the workspace can see the plan and how much is used; only the owner can change it.',
          '',
          '### Choosing a plan',
          'Pick a plan and *monthly* or *yearly*. You pay on **Stripe’s secure page** — LevelUp never sees your card. If you choose during the trial, the days you have left are kept: the first charge is on the day the trial ends.',
          '',
          '### What a plan limits',
          '- **People** — how many members the workspace can have (invitations that are still open count).',
          '- **AI requests a day** — on LevelUp’s keys. With the workspace’s own AI key (Settings → AI Features) there is no such limit.',
          '- **Emails a day** — digests, check-ins, reports and invitations.',
          '- **File storage** — in LevelUp’s storage. Files in your own S3 bucket or Google Drive don’t count.',
          '',
          'On a plan priced **per person**, the bill follows your member list: adding or removing someone changes the next invoice, with the difference for the current period worked out by Stripe.',
          '',
          '### Changing the card, seeing invoices, changing plan, cancelling',
          '**Manage billing** opens Stripe’s customer portal for all of these. If you cancel, the workspace keeps working until the end of the period you paid for.',
          '',
          '### If a payment fails',
          'The owner gets an email and sees a notice in LevelUp. The workspace keeps working for a few days. If the payment is still outstanding after that, the workspace is **locked**.',
          '',
          '### What “locked” means',
          'Nobody can open the workspace’s items — but **nothing is deleted**. The owner can sign in, choose a plan or update the card (which unlocks it at once), **download all the data**, or close the workspace. Members see a message asking them to contact the owner, and can still switch to their other workspaces.',
          '',
          '### Another workspace',
          'One sign-in can own several workspaces — for a second company, a client, or yourself. Menu on your name → **Create a workspace**. Each workspace has its own plan. You can have one free trial running at a time.',
        ].join('\n')});
    }
  }catch(_){}
}

// ─── wiring ─────────────────────────────────────────────────────────────────
(function(){
  // back from Google with ?oauth_success=wsdrive / ?oauth_error=wsdrive (app-part2 already took them off the URL)
  try{
    if(window._pendingOAuthSuccess==='wsdrive'){window._wsPendingDrive='ok';window._pendingOAuthSuccess=null;}
    if(window._pendingOAuthError==='wsdrive'){window._wsPendingDrive=window._pendingOAuthErrorDetail||'Google did not finish the sign-in.';window._pendingOAuthError=null;window._pendingOAuthErrorDetail=null;}
  }catch(_){}
  // Every sign-in (and session restore) → learn who we are here.
  try{
    var orig=window.doLoginSuccess;
    if(typeof orig==='function'&&!orig._ws){
      var wrapped=function(member){var out=orig.apply(this,arguments);try{setTimeout(wsBoot,60);}catch(_){}return out;};
      wrapped._ws=true;
      window.doLoginSuccess=wrapped;
    }
  }catch(_){}
  // The sidebar is re-cloned when it is rebuilt: keep our user-menu entries in each copy.
  try{
    var origInit=window.initSidebars;
    if(typeof origInit==='function'&&!origInit._ws){
      var w2=function(){var out=origInit.apply(this,arguments);try{if(_wsMe&&!_wsMe.workspaceInactive)_wsPaintUserMenu();}catch(_){}return out;};
      w2._ws=true;window.initSidebars=w2;
    }
  }catch(_){}
  // Help Center article (the assistant reads Help through _luKnowledgeHits)
  try{
    if(typeof HC_ARTICLES!=='undefined'&&Array.isArray(HC_ARTICLES)&&!HC_ARTICLES.some(function(a){return a.slug==='workspaces';})){
      HC_ARTICLES.push({id:74,slug:'workspaces',catId:6,title:'Workspaces — your company’s own LevelUp',
        summary:'What a workspace is, who the owner, admins and members are, belonging to more than one, where files are kept, exporting and closing.',
        tags:['workspace','team','owner','admin','switch','storage','s3','google drive','export','invite'],
        body:[
          '## Workspaces',
          '',
          'A **workspace** is one company’s or one person’s LevelUp. It has its own people, tasks, notes, projects, Money, AI keys, email sender and files. **Nothing is shared between workspaces** — people in another workspace cannot see your items, your team list or your files, and you cannot see theirs.',
          '',
          '### Who is who',
          '- **Owner** — one per workspace. Invites and removes people, grants admin, chooses the AI keys, the email sender and the file storage, can export everything and close the workspace.',
          '- **Admin** — someone the owner trusts to help: can manage the AI keys and file storage and help with members’ items. An admin is an admin **in that workspace only**.',
          '- **Member** — sees their own items and whatever teammates share with or assign to them.',
          '',
          'Open **Workspace settings** from the menu on your name (bottom of the sidebar) to see your role.',
          '',
          '### More than one workspace',
          'One sign-in can belong to several workspaces — for example your employer’s and your own. When that is the case a **workspace switcher** appears at the top right. Switching reloads LevelUp, because each workspace keeps its own data on this device too.',
          '',
          'Connections you make — Outlook, NiftyPM, your bank link, a mail account — belong to the workspace you made them in. Connect them again in another workspace if you need them there. The same goes for **push notifications**: switch them on in each workspace you want them from, on each device.',
          '',
          '### Joining another workspace',
          'When someone invites an email address that already has a LevelUp account, the invitation asks for **that account’s password** and adds the workspace to it. Your password, name and data elsewhere do not change.',
          '',
          '### Where files are kept (owner and admins)',
          '**Workspace settings → File storage.** By default files are in LevelUp’s storage, in a folder that is your workspace’s only. You can instead use **your own S3 bucket** (Amazon S3, Cloudflare R2 and others) or **your own Google Drive** — the page has step-by-step instructions and a **Test** button. Changing storage affects new files; **Move existing files** copies the old ones across without breaking any link.',
          '',
          '### AI',
          'AI features work from the first day on LevelUp’s keys, within a daily allowance for the workspace. The owner or an admin can enter the workspace’s own key in **Settings → AI Features** instead.',
          '',
          '### Export and closing (owner)',
          '**Workspace settings → Export & close.** *Export* downloads everything stored for the workspace as one file. *Close* locks everyone out at once and deletes the data after 30 days; until then LevelUp support can reopen it.',
        ].join('\n')});
    }
  }catch(_){}
  _wsBillInit();
  // A signed-in session whose workspace is suspended never reaches doLoginSuccess
  // (auth.me carries no id): show the reason instead of a bare sign-in form.
  setTimeout(function(){
    try{
      if(_wsMe)return;
      if(/^\/invite\//.test(location.pathname))return;
      _trpc('auth.me',{},'query').then(function(me){if(me&&me.workspaceInactive){_wsMe=me;window._luMe=me;_wsShowInactive(me);}}).catch(function(){});
    }catch(_){}
  },900);
})();
