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
    if(menu.querySelector('[data-ws-entry]'))return;
    var html='<button class="ws-mi" data-ws-entry="1"'+_wsAct('wsOpenSettings',['general'])+'>🏢 Workspace: '+_wsEsc((_wsMe.workspace||{}).name||'')+'</button>';
    if(((_wsMe&&_wsMe.workspaces)||[]).length>1)html+='<button class="ws-mi" data-ws-entry="1"'+_wsAct('wsOpenSwitchDialog')+'>⇄ Switch workspace…</button>';
    if(_wsMe&&_wsMe.isOperator)html+='<button class="ws-mi" data-ws-entry="1"'+_wsAct('wsOpenConsole')+'>🛠 Platform console</button>';
    var box=document.createElement('div');box.innerHTML=html;
    while(box.firstChild)menu.insertBefore(box.firstChild,menu.firstChild);
  });
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
  _wsRenderSettings(_wsTab==='storage'?_wsStorageHtml():_wsTab==='data'?_wsDataHtml():_wsGeneralHtml(cur));
  if(_wsTab==='storage')_wsWatchMove();
}
function _wsRenderSettings(body){
  var tabs=[['general','General']];
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
  h+='<div class="ws-card"><h3>Create a workspace</h3><p>You name it and say who will own it. They get an email with a link: someone new sets a password; someone who already has a LevelUp login adds this workspace to it.</p>'
    +'<div class="ws-row"><div class="ws-f"><label for="wsc-name">Workspace name</label><input class="inp" id="wsc-name" maxlength="120" placeholder="Acme Inc."></div>'
    +'<div class="ws-f"><label for="wsc-email">Owner’s email</label><input class="inp" id="wsc-email" type="email" placeholder="owner@acme.com"></div>'
    +'<div class="ws-f"><label for="wsc-owner">Owner’s name (optional)</label><input class="inp" id="wsc-owner" maxlength="128"></div>'
    +'<button class="btn"'+_wsAct('wsConsoleCreate')+'>Create and invite</button></div><div id="wsc-msg" class="ws-msg" role="status"></div></div>';
  h+='<div class="ws-card"><div class="ws-scroll"><table class="ws-tbl"><thead><tr><th>Workspace</th><th>Status</th><th>Owner</th><th>People</th><th>AI today</th><th>Email today</th><th>Files</th><th></th></tr></thead><tbody>';
  _wsConsoleRows.forEach(function(w){
    var st=w.status==='active'?'<span class="ws-pill ok">active</span>':w.status==='suspended'?'<span class="ws-pill warn">suspended</span>':'<span class="ws-pill bad">closed</span>';
    var owner=w.owner?_wsEsc(w.owner.name||'')+'<br><span style="color:var(--t3)">'+_wsEsc(w.owner.email||'')+'</span>':(w.ownerInvited?'<span style="color:var(--warn)">invited: '+_wsEsc(w.ownerInvited)+'</span>':'<span style="color:var(--red)">no owner</span>');
    var feats=Object.keys(w.features||{}).filter(function(k){return w.features[k];});
    h+='<tr><td><b>'+_wsEsc(w.name)+'</b><br><span style="color:var(--t3)">#'+w.id+(feats.length?' · '+_wsEsc(feats.join(', ')):'')+'</span></td><td>'+st+(w.deletedAt?'<br><span style="color:var(--t3);font-size:11px">closed '+_wsEsc(_wsDay(w.deletedAt))+'</span>':'')+'</td><td>'+owner+'</td><td>'+w.members+'</td><td>'+_wsUse(w.usage&&w.usage.ai)+'</td><td>'+_wsUse(w.usage&&w.usage.email)+'</td><td>'+_wsEsc(w.storageMode==='platform'?'LevelUp':w.storageMode||'LevelUp')+'</td>'
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
          'Connections you make — Outlook, NiftyPM, your bank link, a mail account — belong to the workspace you made them in. Connect them again in another workspace if you need them there.',
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
