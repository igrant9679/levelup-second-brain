/* =============================================================================
   app-shell.js — the frame around every page (build -292)
   -----------------------------------------------------------------------------
   Loaded LAST. Everything here is added on top of what the earlier bundles
   draw, by wrapping their functions (initSidebars, renderHome) — nothing in an
   earlier bundle calls into this file, so a failure here can't stop the app
   from starting.

   1. PINNED PAGES   D.prefs.pinnedPages = ['tasks','notes',…] (in order; absent
                     = nothing pinned). A "Pinned" group at the top of the
                     sidebar, a "Pin this page" row, and a dialog to choose and
                     order them. Any page can be pinned, including the ones
                     that have no sidebar entry (My Week, Process, …).
   2. TAB BAR        ≤900px wide (where the sidebar is a slide-in drawer): four
                     pages + "More" along the bottom. The four are the first
                     pinned pages, topped up with Today / Tasks / Notes /
                     Calendar. Hidden while the on-screen keyboard is up.
   3. SIDEBAR FOOT   The collapse button used to float over the last sidebar
                     rows; it now lives in the user row, which stays in view.
   4. GET STARTED    A short checklist on Today for a workspace that has not
                     yet got a task, a note, a project and a calendar entry.

   All CSS is injected from here (#lu-shell-css) — never index.html.
   Handlers use _act() (data-act + the one delegated listener in app-1-core).
============================================================================= */

/* ── shared ─────────────────────────────────────────────────────────────── */
function _shEsc(s){return (typeof esc==='function')?esc(s):String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function _shAct(fn,args,opts){return (typeof _act==='function')?_act(fn,args,opts):'';}
function _shNarrow(){return !!(window.matchMedia&&window.matchMedia('(max-width:900px)').matches);}
var _SH_ICON={myday:'sun',focus:'zap',command:'layers',standup:'users',myweek:'calendar',myyear:'calendar',process:'refresh',graph:'map',clusters:'columns',programs:'briefcase'};
var _SH_SHORT={help:'Help',command:'Tools',process:'Process',graph:'Graph'};

function _luShellCSS(){
  if(document.getElementById('lu-shell-css'))return;
  var st=document.createElement('style');st.id='lu-shell-css';
  st.textContent=[
/* pinned group */
'.sg[data-group="pinned"] .sl{display:flex;align-items:center;gap:6px}',
'.sg[data-group="pinned"] .sl>span{flex:1}',
'.lu-pin-edit{background:none;border:0;color:var(--t3);font:inherit;font-size:11px;font-weight:600;cursor:pointer;padding:2px 6px;border-radius:6px;letter-spacing:0;text-transform:none}',
'.lu-pin-edit:hover,.lu-pin-edit:focus-visible{color:var(--t1);background:var(--s3)}',
'.si.si-pinadd{color:var(--t3);border:1px dashed var(--bd2);background:transparent}',
'.si.si-pinadd:hover{color:var(--t1);border-color:var(--bd3)}',
'body.sidebar-collapsed .lu-pin-edit{display:none}',
/* sidebar foot: the user row stays in view and carries the collapse button */
'.sb>.su{position:sticky!important;bottom:0;background:var(--s1);z-index:3}',
'.sb>.su .sb-collapse-toggle{position:static;flex-shrink:0;width:28px;height:28px;margin-left:4px}',
'body.sidebar-collapsed .sb>.su{flex-direction:column;gap:6px}',
'body.sidebar-collapsed .sb>.su>span{display:none}',
'body.sidebar-collapsed .sb>.su .sb-collapse-toggle{margin:0 auto;left:auto}',
/* pin dialog */
'#lu-pin-ov{position:fixed;inset:0;z-index:var(--z-modal,1000);background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px}',
'#lu-pin-dlg{background:var(--s1);color:var(--t1);border:1px solid var(--bd2);border-radius:14px;width:min(460px,100%);max-height:min(640px,calc(100dvh - 32px));display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.45)}',
'#lu-pin-dlg h2{font-size:16px;font-weight:700;margin:0}',
'#lu-pin-dlg .pd-h{display:flex;align-items:center;gap:10px;padding:16px 18px 6px}',
'#lu-pin-dlg .pd-h h2{flex:1}',
'#lu-pin-dlg .pd-x{background:none;border:0;color:var(--t2);font-size:20px;line-height:1;cursor:pointer;width:36px;height:36px;border-radius:8px}',
'#lu-pin-dlg .pd-x:hover{background:var(--s3);color:var(--t1)}',
'#lu-pin-dlg p{margin:0;padding:0 18px 10px;font-size:12px;color:var(--t2)}',
'#lu-pin-dlg .pd-list{overflow-y:auto;padding:0 10px 6px;flex:1;min-height:0}',
'#lu-pin-dlg .pd-sec{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--t3);padding:10px 8px 4px}',
'#lu-pin-dlg .pd-row{display:flex;align-items:center;gap:8px;min-height:40px;padding:0 8px;border-radius:8px}',
'#lu-pin-dlg .pd-row:hover{background:var(--s2)}',
'#lu-pin-dlg .pd-row label{flex:1;display:flex;align-items:center;gap:10px;min-height:40px;cursor:pointer;font-size:13px}',
'#lu-pin-dlg .pd-row input{width:16px;height:16px;accent-color:var(--ac);cursor:pointer}',
'#lu-pin-dlg .pd-mv{background:var(--s2);border:1px solid var(--bd2);color:var(--t1);width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:13px}',
'#lu-pin-dlg .pd-mv:disabled{opacity:.35;cursor:default}',
'#lu-pin-dlg .pd-f{display:flex;align-items:center;gap:10px;padding:12px 18px 16px;border-top:1px solid var(--bd1)}',
'#lu-pin-dlg .pd-f label{flex:1;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--t2);cursor:pointer}',
/* get started */
'.lu-start{background:var(--s2);border:1px solid var(--bd2);border-radius:14px;padding:16px 18px;margin:14px 0 4px}',
'.lu-start-h{display:flex;align-items:center;gap:10px}',
'.lu-start-h b{font-size:15px}',
'.lu-start-h span{font-size:12px;color:var(--t2);flex:1}',
'.lu-start-hide{background:none;border:0;color:var(--t2);font:inherit;font-size:12px;cursor:pointer;padding:6px 8px;border-radius:8px}',
'.lu-start-hide:hover{background:var(--s3);color:var(--t1)}',
'.lu-start-bar{height:6px;border-radius:3px;background:var(--s4);margin:10px 0 12px;overflow:hidden}',
'.lu-start-bar i{display:block;height:100%;background:var(--ok);border-radius:3px}',
'.lu-start-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}',
'.lu-start-step{display:flex;align-items:flex-start;gap:10px;text-align:left;background:var(--s1);border:1px solid var(--bd1);border-radius:10px;padding:10px 12px;color:var(--t1);font:inherit;cursor:pointer;min-height:56px}',
'.lu-start-step:hover{border-color:var(--bd3)}',
'.lu-start-step .ck{flex-shrink:0;width:20px;height:20px;border-radius:50%;border:2px solid var(--bd3);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;margin-top:1px;color:transparent}',
'.lu-start-step.done .ck{background:var(--ok);border-color:var(--ok);color:#fff}',
'.lu-start-step b{display:block;font-size:13px;font-weight:600}',
'.lu-start-step small{display:block;font-size:12px;color:var(--t2);margin-top:1px}',
'.lu-start-step.done b{color:var(--t2);text-decoration:line-through}',
'@media (max-width:600px){.lu-start{padding:14px}.lu-start-step{min-height:44px;align-items:center;padding:8px 12px}.lu-start-step small{display:none}}',
/* tab bar */
'#lu-tabbar{display:none}',
'@media (max-width:900px) and (min-height:431px){',
' :root{--lu-tab-h:calc(56px + env(safe-area-inset-bottom,0px))}',
' #lu-tabbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:71;height:var(--lu-tab-h);padding:0 4px env(safe-area-inset-bottom,0px);background:var(--s1);border-top:1px solid var(--bd2)}',
' #lu-tabbar button{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;background:none;border:0;border-radius:10px;color:var(--t2);font:inherit;font-size:11px;font-weight:600;cursor:pointer;padding:0 2px;-webkit-tap-highlight-color:transparent}',
' #lu-tabbar button svg{width:22px;height:22px;flex-shrink:0}',
' #lu-tabbar button span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
' #lu-tabbar button[aria-current="page"]{color:var(--ach)}',
' #lu-tabbar button:active{background:var(--s3)}',
' body.lu-kb #lu-tabbar,body.lu-noshell #lu-tabbar{display:none}',
/* every screen ends where the bar starts, so nothing sits underneath it */
' body:not(.lu-kb):not(.lu-noshell) .scr{height:calc(100vh - var(--top) - var(--lu-tab-h))!important;height:calc(100dvh - var(--top) - var(--lu-tab-h))!important}',
/* the right-rail sheet (-265) sits on top of the bar, with a slimmer handle */
' body:not(.lu-kb):not(.lu-noshell) .scr.on .bg>.rr:not(:empty){bottom:var(--lu-tab-h);padding-bottom:18px;transform:translateY(calc(100% - 38px))}',
' body:not(.lu-kb):not(.lu-noshell) .scr.on .bg>.rr.lu-rr-open{transform:none}',
' body:not(.lu-kb):not(.lu-noshell) .scr.on .bg>.rr:not(:empty)::before{height:38px}',
' body:not(.lu-kb):not(.lu-noshell) .scr.on .bg:has(>.rr:not(:empty))>.mn{padding-bottom:54px!important}',
/* floating buttons and messages clear the bar (and the rail handle where there is one) */
' body:not(.lu-kb):not(.lu-noshell) .toast-stack,body:not(.lu-kb):not(.lu-noshell) .ai-bubble,body:not(.lu-kb):not(.lu-noshell) .toast,body:not(.lu-kb):not(.lu-noshell) #help-fab,body:not(.lu-kb):not(.lu-noshell) #contact-bulk-bar,body:not(.lu-kb):not(.lu-noshell) #lu-voice-indicator,body:not(.lu-kb):not(.lu-noshell) #tour-controls{bottom:calc(var(--lu-tab-h) + 14px)!important}',
' body:not(.lu-kb):not(.lu-noshell):has(.scr.on .bg>.rr:not(:empty)) .toast-stack,body:not(.lu-kb):not(.lu-noshell):has(.scr.on .bg>.rr:not(:empty)) .ai-bubble,body:not(.lu-kb):not(.lu-noshell):has(.scr.on .bg>.rr:not(:empty)) #help-fab{bottom:calc(var(--lu-tab-h) + 50px)!important}',
' body:not(.lu-kb):not(.lu-noshell) #proactive-hint{bottom:calc(var(--lu-tab-h) + 74px)!important}',
'}'
  ].join('\n');
  document.head.appendChild(st);
}

/* ── 1. pinned pages ────────────────────────────────────────────────────── */
/** Pages that may be pinned right now: switched on, and part of this workspace. */
function _luPinnable(){
  if(typeof LU_PAGES==='undefined'||!Array.isArray(LU_PAGES))return [];
  var noAtlas=document.body.getAttribute('data-ws-atlas')==='0';
  return LU_PAGES.filter(function(p){
    if(!p||!p.id||p.id==='programs')return false;          // Programs is a tab of Portfolio now
    if(p.id==='atlas'&&noAtlas)return false;
    try{if(typeof luPageOn==='function'&&!luPageOn(p.id))return false;}catch(_){}
    return true;
  });
}
/** The stored pins that can be shown, in the stored order. Never writes. */
function luPinnedPages(){
  var raw=(typeof D!=='undefined'&&D&&D.prefs&&Array.isArray(D.prefs.pinnedPages))?D.prefs.pinnedPages:[];
  var ok=_luPinnable().map(function(p){return p.id;});
  var seen={},out=[];
  raw.forEach(function(id){if(typeof id==='string'&&ok.indexOf(id)>=0&&!seen[id]){seen[id]=1;out.push(id);}});
  return out;
}
function _luPinsWrite(list){
  D.prefs=D.prefs||{};
  if(list&&list.length)D.prefs.pinnedPages=list.slice(0,12);else delete D.prefs.pinnedPages;   // sparse: absent = none
  try{save('prefs');}catch(_){try{localStorage.setItem('lu_prefs',JSON.stringify(D.prefs));}catch(__){}}
  try{if(typeof initSidebars==='function'&&typeof curScreen!=='undefined')initSidebars(curScreen);}catch(_){}
}
function luPinToggle(id){
  var list=luPinnedPages(),i=list.indexOf(id);
  if(i>=0)list.splice(i,1);
  else{if(_luPinnable().every(function(p){return p.id!==id;}))return;list.push(id);}
  _luPinsWrite(list);
  if(document.getElementById('lu-pin-ov'))_luPinDialogPaint(id);
}
function luPinThis(){
  var id=(typeof curScreen!=='undefined')?curScreen:'';
  if(!id||luPinnedPages().indexOf(id)>=0)return;
  luPinToggle(id);
  var def=(typeof luPageDef==='function')?luPageDef(id):null;
  try{toast({type:'success',title:'Pinned '+((def&&def.label)||'this page'),msg:'It stays at the top of the sidebar. Choose Edit to change the order.',duration:4000});}catch(_){}
}
function luPinMove(id,dir){
  var list=luPinnedPages(),i=list.indexOf(id),j=i+(dir<0?-1:1);
  if(i<0||j<0||j>=list.length)return;
  var t=list[i];list[i]=list[j];list[j]=t;
  _luPinsWrite(list);
  _luPinDialogPaint(id,dir<0?'up':'down');
}
function luPinShortcutSet(on){
  D.prefs=D.prefs||{};
  if(on)delete D.prefs.pinShortcutOff;else D.prefs.pinShortcutOff=true;
  try{save('prefs');}catch(_){}
  try{if(typeof initSidebars==='function'&&typeof curScreen!=='undefined')initSidebars(curScreen);}catch(_){}
}
function _luPinIcon(id){
  try{
    var tpl=document.getElementById('sb-tpl');
    var svg=tpl&&tpl.content&&tpl.content.querySelector('.si[data-n="'+id+'"] svg');
    if(svg)return svg.outerHTML;
  }catch(_){}
  try{if(typeof _icon==='function')return _icon(_SH_ICON[id]||'chevronRight',16,'currentColor');}catch(_){}
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>';
}
function _luPinLabel(id){var d=(typeof luPageDef==='function')?luPageDef(id):null;return (d&&d.label)||id;}

/** Runs after every initSidebars(): the Pinned group, and the sidebar foot. */
function _luShellSidebar(){
  var pins=luPinnedPages();
  var cur=(typeof curScreen!=='undefined')?curScreen:'';
  var canPinCur=!!cur&&pins.indexOf(cur)<0&&_luPinnable().some(function(p){return p.id===cur;})&&!(D.prefs&&D.prefs.pinShortcutOff);
  document.querySelectorAll('[data-sb]').forEach(function(sb){
    var old=sb.querySelector('.sg[data-group="pinned"]');if(old)old.remove();
    if(pins.length||canPinCur){
      var g=document.createElement('div');g.className='sg';g.setAttribute('data-group','pinned');
      var rows=pins.map(function(id){
        var src=sb.querySelector('.sg:not([data-group="pinned"]) .si[data-n="'+id+'"]');
        if(src){
          var c=src.cloneNode(true);c.removeAttribute('data-tour-id');c.classList.add('si-pinned');
          return c.outerHTML;
        }
        var label=_luPinLabel(id);
        return '<div class="si si-pinned'+(cur===id?' on':'')+'" data-n="'+_shEsc(id)+'" data-label="'+_shEsc(label)+'">'+_luPinIcon(id)+'<span class="l">'+_shEsc(label)+'</span></div>';
      }).join('');
      var add=canPinCur?'<div class="si si-pinadd" data-label="Pin this page" title="Keep '+_shEsc(_luPinLabel(cur))+' at the top of the sidebar"'+_shAct('luPinThis',[])+'><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg><span class="l">Pin this page</span></div>':'';
      g.innerHTML='<div class="sl"><span>Pinned</span><button type="button" class="lu-pin-edit" aria-label="Choose pinned pages"'+_shAct('luPinDialog',[],{stop:true})+'>Edit</button></div><div class="sg-body" style="padding:0 4px">'+rows+add+'</div>';
      var first=sb.querySelector('.sg');
      if(first)sb.insertBefore(g,first);else sb.insertBefore(g,sb.firstChild);
    }
    // The collapse button belongs in the user row, not floating over the last pages.
    var su=sb.querySelector(':scope > .su'),tg=sb.querySelector('.sb-collapse-toggle');
    if(su&&tg&&tg.parentNode!==su){
      tg.onclick=function(e){e.stopPropagation();if(typeof toggleSidebarCollapse==='function')toggleSidebarCollapse();};
      tg.setAttribute('aria-label','Collapse or expand the sidebar');
      var menu=su.querySelector('#sb-user-menu');
      if(menu)su.insertBefore(tg,menu);else su.appendChild(tg);
    }
  });
}

/* the dialog */
function luPinDialog(){
  _luShellCSS();
  var ov=document.getElementById('lu-pin-ov');
  if(!ov){
    ov=document.createElement('div');ov.id='lu-pin-ov';
    ov.addEventListener('mousedown',function(e){if(e.target===ov)luPinDialogClose();});
    ov.addEventListener('keydown',function(e){
      if(e.key==='Escape'){e.stopPropagation();luPinDialogClose();return;}
      if(e.key!=='Tab')return;
      var f=ov.querySelectorAll('button:not([disabled]),input');if(!f.length)return;
      var a=f[0],z=f[f.length-1];
      if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus();}
      else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus();}
    });
    ov.addEventListener('change',function(e){
      var t=e.target;if(!t||t.tagName!=='INPUT')return;
      if(t.hasAttribute('data-pin'))luPinToggle(t.getAttribute('data-pin'));
      else if(t.id==='lu-pin-shortcut')luPinShortcutSet(t.checked);
    });
    document.body.appendChild(ov);
    ov._back=document.activeElement;
  }
  try{if(typeof toggleMobileSidebar==='function'&&document.body.classList.contains('sb-open'))toggleMobileSidebar(false);}catch(_){}
  _luPinDialogPaint();
  var x=ov.querySelector('.pd-x');if(x)x.focus();
}
function luPinDialogClose(){
  var ov=document.getElementById('lu-pin-ov');if(!ov)return;
  var back=ov._back;ov.remove();
  try{if(back&&back.focus&&document.contains(back))back.focus();}catch(_){}
}
function _luPinDialogPaint(focusId,focusWhat){
  var ov=document.getElementById('lu-pin-ov');if(!ov)return;
  var pins=luPinnedPages(),all=_luPinnable();
  var row=function(p,i){
    var on=pins.indexOf(p.id)>=0;
    var mv=on?'<button type="button" class="pd-mv" data-mv="up" aria-label="Move '+_shEsc(p.label)+' up"'+(i===0?' disabled':'')+_shAct('luPinMove',[p.id,-1])+'>↑</button><button type="button" class="pd-mv" data-mv="down" aria-label="Move '+_shEsc(p.label)+' down"'+(i===pins.length-1?' disabled':'')+_shAct('luPinMove',[p.id,1])+'>↓</button>':'';
    return '<div class="pd-row" data-row="'+_shEsc(p.id)+'"><label><input type="checkbox" data-pin="'+_shEsc(p.id)+'"'+(on?' checked':'')+'><span>'+_shEsc(p.label)+'</span></label>'+mv+'</div>';
  };
  var pinned=pins.map(function(id){return all.filter(function(p){return p.id===id;})[0];}).filter(Boolean);
  var rest=all.filter(function(p){return pins.indexOf(p.id)<0;});
  var st=ov.querySelector('.pd-list');var keep=st?st.scrollTop:0;
  ov.innerHTML='<div id="lu-pin-dlg" role="dialog" aria-modal="true" aria-labelledby="lu-pin-t">'
    +'<div class="pd-h"><h2 id="lu-pin-t">Pinned pages</h2><button type="button" class="pd-x" aria-label="Close"'+_shAct('luPinDialogClose',[])+'>×</button></div>'
    +'<p>Pinned pages stay at the top of the sidebar. On a phone, the first four are the buttons along the bottom of the screen.</p>'
    +'<div class="pd-list">'
    +(pinned.length?'<div class="pd-sec">Pinned, in this order</div>'+pinned.map(row).join(''):'')
    +'<div class="pd-sec">'+(pinned.length?'Other pages':'Pages')+'</div>'+rest.map(row).join('')
    +'</div>'
    +'<div class="pd-f"><label><input type="checkbox" id="lu-pin-shortcut"'+((D.prefs&&D.prefs.pinShortcutOff)?'':' checked')+'><span>Show “Pin this page” in the sidebar</span></label><button type="button" class="btn btn-p"'+_shAct('luPinDialogClose',[])+'>Done</button></div>'
    +'</div>';
  var nl=ov.querySelector('.pd-list');if(nl)nl.scrollTop=keep;
  if(focusId){
    var r=ov.querySelector('.pd-row[data-row="'+focusId+'"]');
    var t=r&&(focusWhat?r.querySelector('.pd-mv[data-mv="'+focusWhat+'"]:not([disabled])')||r.querySelector('.pd-mv:not([disabled])'):null)||(r&&r.querySelector('input'));
    if(t)t.focus();
  }
}

/* ── 2. the phone tab bar ───────────────────────────────────────────────── */
var _SH_TAB_DEFAULTS=['home','tasks','notes','calendar','projects','goals'];
function luTabPages(){
  var ok=_luPinnable().map(function(p){return p.id;});
  var out=luPinnedPages().slice(0,4);
  _SH_TAB_DEFAULTS.forEach(function(id){if(out.length<4&&out.indexOf(id)<0&&ok.indexOf(id)>=0)out.push(id);});
  return out;
}
function luTabGo(id){
  try{if(document.body.classList.contains('sb-open')&&typeof toggleMobileSidebar==='function')toggleMobileSidebar(false);}catch(_){}
  if(typeof nav==='function')nav(id);
}
function _luTabbarPaint(){
  var bar=document.getElementById('lu-tabbar');
  if(!bar){
    bar=document.createElement('nav');bar.id='lu-tabbar';bar.setAttribute('aria-label','Main pages');
    document.body.appendChild(bar);
  }
  var cur=(typeof curScreen!=='undefined')?curScreen:'';
  var lit={myday:'home',focus:'home',standup:'home',command:'home'}[cur]||cur;
  var pages=luTabPages();
  if(pages.indexOf(cur)>=0)lit=cur;                       // a pinned Today view lights itself
  var key=pages.join(',')+'|'+lit;
  if(bar._key===key)return;
  bar._key=key;
  bar.innerHTML=pages.map(function(id){
    var label=_SH_SHORT[id]||_luPinLabel(id);
    return '<button type="button"'+(id===lit?' aria-current="page"':'')+_shAct('luTabGo',[id])+'>'+_luPinIcon(id)+'<span>'+_shEsc(label)+'</span></button>';
  }).join('')
  +'<button type="button" aria-label="More pages"'+_shAct('toggleMobileSidebar',[])+'><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg><span>More</span></button>';
}
/** The on-screen keyboard: a bar fixed to the bottom would ride up on top of it. */
function _luTabbarKeyboard(){
  var typing=function(el){
    if(!el||!el.tagName)return false;
    if(el.isContentEditable)return true;
    var t=el.tagName;
    if(t==='TEXTAREA')return true;
    if(t!=='INPUT')return false;
    return ['checkbox','radio','button','submit','range','color','file'].indexOf((el.type||'').toLowerCase())<0;
  };
  var coarse=function(){return !!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches);};
  document.addEventListener('focusin',function(e){if(_shNarrow()&&coarse()&&typing(e.target))document.body.classList.add('lu-kb');});
  document.addEventListener('focusout',function(){setTimeout(function(){if(!typing(document.activeElement))document.body.classList.remove('lu-kb');},120);});
}

/* ── 4. get started ─────────────────────────────────────────────────────── */
function _luStartSteps(){
  var n=function(k){try{return (D[k]||[]).length;}catch(_){return 0;}};
  var cal=0;try{cal=(typeof _calEvents!=='undefined'&&Array.isArray(_calEvents))?_calEvents.length:0;}catch(_){}
  var s=(D.prefs&&D.prefs.startCard)||{};
  var me=window._luMe||null;
  var canInvite=!!(me&&(me.isOwner||String(me.role||'').toLowerCase()==='admin'));
  var steps=[
    {k:'task',core:true,done:n('tasks')>0,t:'Add your first task',d:'One thing to get done, with a due date.'},
    {k:'note',core:true,done:n('notes')>0,t:'Write a note',d:'Meeting notes, a plan, anything worth keeping.'},
    {k:'project',core:true,done:n('projects')>0,t:'Start a project',d:'Gather the tasks and dates for one outcome.'},
    {k:'calendar',core:true,done:cal>0,t:'Put something on the calendar',d:'Add an event, or connect Outlook or Google.'},
    {k:'pin',core:false,done:luPinnedPages().length>0||!!s.pin,t:'Pin the pages you use most',d:'They stay at the top of the sidebar.'}
  ];
  if(canInvite)steps.push({k:'invite',core:false,done:!!s.invite,t:'Invite a teammate',d:'Share projects, tasks and notes.'});
  return steps;
}
/** Shown while one of the four basics is still missing, the workspace is small, and it was not hidden. */
function _luStartWanted(){
  try{
    if(!D||!D.prefs)return false;
    if(D.prefs.startCard&&D.prefs.startCard.off)return false;
    // Only once the server has answered: before that an account's lists are still empty on a new
    // device, and the signed-out sample view never gets here at all.
    if(typeof _serverSyncReady==='undefined'||!_serverSyncReady)return false;
    var total=(D.tasks||[]).length+(D.notes||[]).length+(D.projects||[]).length;
    if(total>=25)return false;
    return _luStartSteps().some(function(s){return s.core&&!s.done;});
  }catch(_){return false;}
}
function _luStartHtml(){
  var steps=_luStartSteps(),done=steps.filter(function(s){return s.done;}).length;
  return '<section class="lu-start" aria-label="Get started">'
    +'<div class="lu-start-h"><b>Get started</b><span>'+done+' of '+steps.length+' done</span><button type="button" class="lu-start-hide" aria-label="Hide the get-started list"'+_shAct('luStartHide',[])+'>Hide</button></div>'
    +'<div class="lu-start-bar" aria-hidden="true"><i style="width:'+Math.round(done/steps.length*100)+'%"></i></div>'
    +'<div class="lu-start-steps">'+steps.map(function(s){
      return '<button type="button" class="lu-start-step'+(s.done?' done':'')+'"'+_shAct('luStartGo',[s.k])+'><span class="ck" aria-hidden="true">✓</span><span><b>'+_shEsc(s.t)+(s.done?'<span style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)"> (done)</span>':'')+'</b><small>'+_shEsc(s.d)+'</small></span></button>';
    }).join('')+'</div></section>';
}
function _luStartPaint(){
  var el=document.getElementById('home-main');if(!el)return;
  var old=el.querySelector(':scope > .lu-start');if(old)old.remove();
  if(!_luStartWanted())return;
  _luShellCSS();
  var bar=el.querySelector(':scope > .lu-today-bar');
  if(bar)bar.insertAdjacentHTML('afterend',_luStartHtml());else el.insertAdjacentHTML('afterbegin',_luStartHtml());
}
function _luStartMark(k){
  D.prefs=D.prefs||{};D.prefs.startCard=D.prefs.startCard||{};
  if(D.prefs.startCard[k])return;
  D.prefs.startCard[k]=true;try{save('prefs');}catch(_){}
}
function luStartGo(k){
  if(k==='task'&&typeof openFA==='function')openFA('task');
  else if(k==='note'&&typeof openFA==='function')openFA('note');
  else if(k==='project'&&typeof openFA==='function')openFA('project');
  else if(k==='calendar'&&typeof nav==='function')nav('calendar');
  else if(k==='pin'){_luStartMark('pin');luPinDialog();}
  else if(k==='invite'){_luStartMark('invite');if(typeof nav==='function')nav('team');}
}
function luStartHide(){
  D.prefs=D.prefs||{};D.prefs.startCard=Object.assign({},D.prefs.startCard||{},{off:true});
  try{save('prefs');}catch(_){}
  _luStartPaint();
  try{toast({type:'info',title:'Get-started list hidden',msg:'Help & Learning has the same steps whenever you want them.',duration:4000});}catch(_){}
}

/* ── wiring ─────────────────────────────────────────────────────────────── */
(function(){
  if(typeof document==='undefined'||window._luShellWired)return;
  window._luShellWired=true;
  try{_luShellCSS();}catch(_){}
  // After every sidebar rebuild (each navigation): the Pinned group, the foot, the tab bar.
  try{
    var origSb=window.initSidebars;
    if(typeof origSb==='function'){
      window.initSidebars=function(){
        var r=origSb.apply(this,arguments);
        try{_luShellSidebar();}catch(e){console.warn('[shell] sidebar',e);}
        try{_luTabbarPaint();}catch(e){console.warn('[shell] tab bar',e);}
        return r;
      };
    }
  }catch(_){}
  try{
    var origHome=window.renderHome;
    if(typeof origHome==='function'){
      window.renderHome=function(){
        var r=origHome.apply(this,arguments);
        try{_luStartPaint();}catch(e){console.warn('[shell] get started',e);}
        return r;
      };
    }
  }catch(_){}
  try{_luTabbarKeyboard();}catch(_){}
  // The command palette: "Choose pinned pages".
  try{
    var oc=window._cmdpActions;
    if(typeof oc==='function'){
      window._cmdpActions=function(){
        var list=oc.apply(this,arguments);
        try{list.push({id:'pins',group:'Navigate',icon:'📌',title:'Choose pinned pages',run:function(){luPinDialog();}});}catch(_){}
        return list;
      };
    }
  }catch(_){}
  // Help article.
  try{
    if(typeof HC_ARTICLES!=='undefined'&&Array.isArray(HC_ARTICLES)&&!HC_ARTICLES.some(function(a){return a.slug==='pinned-pages';})){
      HC_ARTICLES.push({id:76,slug:'pinned-pages',catId:13,title:'Pinned pages and the phone tab bar',
        summary:'Keep the pages you use most at the top of the sidebar and along the bottom of your phone.',
        tags:['pin','pinned','favourites','favorites','sidebar','tab bar','phone','mobile','navigation','get started'],
        body:[
          '## Pinned pages',
          '',
          'Pin the pages you open most and they stay in a **Pinned** group at the top of the sidebar, above Today.',
          '',
          '### Pin a page',
          '- Open the page, then choose **Pin this page** at the top of the sidebar.',
          '- Or choose **Edit** next to *Pinned* (or search the command palette for **Choose pinned pages**) and tick the pages you want. The arrows change their order.',
          '',
          'Any page can be pinned, including the ones that have no sidebar entry of their own, such as My Week, My Year and Process. A pinned page still appears in its usual group as well.',
          '',
          'To unpin a page, choose **Edit** and untick it. If you would rather not see the *Pin this page* row, untick **Show “Pin this page” in the sidebar** in the same dialog.',
          '',
          'Pins are part of your own settings: they follow you to your other devices and nobody else sees them.',
          '',
          '## On a phone',
          '',
          'On a phone or a narrow tablet, four pages and **More** sit along the bottom of the screen. The four are your first four pinned pages. If you have pinned fewer than four, Today, Tasks, Notes and Calendar fill the gaps. **More** opens the full menu.',
          '',
          'The bar hides while you are typing, so it never sits on top of the keyboard. Where a page has a side panel, **More for this page** sits just above the bar.',
          '',
          '## The get-started list',
          '',
          'A new workspace shows a short **Get started** list on Today: add a task, write a note, start a project, put something on the calendar. Each step ticks itself off when you have done it, and the list goes away once those four are done. **Hide** removes it at any time.'
        ].join('\n')});
    }
  }catch(_){}
  try{if(typeof curScreen!=='undefined'&&curScreen&&typeof initSidebars==='function')initSidebars(curScreen);}catch(_){}
})();

/* =============================================================================
   Build -294 — five more pieces of the frame
   -----------------------------------------------------------------------------
   5. LOADING OUTLINES  .lu-skel: pulsing bars where a panel used to say
                        "Loading…" while it fetched. The markup is a plain
                        string in the bundles that fetch; only the CSS is here.
   6. ANNOUNCEMENTS     Every toast is also written into a hidden live region,
                        so a screen reader says "Task deleted. Undo available".
                        Errors use the assertive region. luAnnounce(text) is
                        there for anything else that changes without focus.
   7. SWIPE A TASK      Touch only, Tasks page (List and Clusters): right =
                        complete (or reopen), left = snooze until tomorrow.
                        Both show a message with Undo.
   8. SETTINGS SEARCH   A box under the Settings heading. It reads the page as
                        drawn (rows, headings, buttons), plus a few everyday
                        words per section for the panels that fill in later.
   9. INSTALL           One offer per device to install LevelUp as an app
                        (Chrome / Edge / Android), or the Add to Home Screen
                        steps on an iPhone or iPad. Also in the command palette.
============================================================================= */

function _luShell2CSS(){
  if(document.getElementById('lu-shell2-css'))return;
  var st=document.createElement('style');st.id='lu-shell2-css';
  st.textContent=[
/* loading outlines */
'.lu-skel{display:block;max-width:520px;padding:3px 0;text-align:left}',
'.lu-skel i{display:block;height:10px;border-radius:5px;background:var(--s4);margin:0 0 9px;animation:luSkelPulse 1.4s ease-in-out infinite}',
'.lu-skel i:nth-child(1){width:88%}',
'.lu-skel i:nth-child(2){width:70%;animation-delay:.12s}',
'.lu-skel i:nth-child(3){width:46%;animation-delay:.24s}',
'.lu-skel i:last-child{margin-bottom:0}',
'.lu-skel.one{display:inline-block;width:120px;padding:0;vertical-align:middle}',
'.lu-skel.one i{width:100%}',
'.lu-skel.rows{max-width:none}',
'.lu-skel.rows i{height:34px;border-radius:8px;width:100%;margin-bottom:8px}',
'.lu-skel.rows i:nth-child(4){animation-delay:.36s}',
'@keyframes luSkelPulse{0%,100%{opacity:.45}50%{opacity:.95}}',
'@media (prefers-reduced-motion:reduce){.lu-skel i{animation:none;opacity:.7}}',
/* live regions: there for screen readers, not for the eye */
'.lu-live{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}',
/* swipe a task */
'@media (pointer:coarse){#tasks-list .tlc[data-task-id],#tasks-list .cl-task-row[data-task-id]{touch-action:pan-y}}',
'.lu-swipe-bg{position:absolute;left:0;top:0;z-index:0;box-sizing:border-box;border-radius:12px;display:flex;align-items:center;padding:0 18px;font-size:13px;font-weight:700;color:#fff;pointer-events:none;overflow:hidden;white-space:nowrap}',
'.lu-swipe-bg.r{justify-content:flex-start;background:#166534}',
'.lu-swipe-bg.l{justify-content:flex-end;background:#92400e}',
'.lu-swipe-bg.r.arm{background:#15803d}',
'.lu-swipe-bg.l.arm{background:#b45309}',
'.lu-swipe-bg span{opacity:.75;transform:scale(.94);transition:opacity .12s,transform .12s}',
'.lu-swipe-bg.arm span{opacity:1;transform:scale(1.06)}',
'.lu-swiping{position:relative!important;z-index:1!important;transition:none!important;box-shadow:none!important}',
'.lu-swiping.lu-swipe-ease{transition:transform .17s ease-out!important}',
/* cluster rows have no fill of their own: give them one while they slide, so the label is not read through them */
'.cl-task-row.lu-swiping{background:var(--s2)!important}',
/* settings search */
'.lu-setq{position:relative;max-width:420px;margin:0 0 14px}',
'.lu-setq input.inp{width:100%;box-sizing:border-box;font-size:13px;min-height:38px;padding-left:36px!important}',
'.lu-setq>svg{position:absolute;left:11px;top:11px;pointer-events:none}',
'.lu-setq-list{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:30;background:var(--s1);border:1px solid var(--bd2);border-radius:12px;box-shadow:0 18px 44px rgba(0,0,0,.35);padding:6px;max-height:min(420px,60vh);overflow-y:auto}',
'.lu-setq-o{display:flex;align-items:baseline;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;min-height:38px;box-sizing:border-box}',
'.lu-setq-o b{flex:1;min-width:0;font-size:13px;font-weight:600;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
'.lu-setq-o span{flex-shrink:0;font-size:11px;color:var(--t2)}',
'.lu-setq-o[aria-selected="true"],.lu-setq-o:hover{background:var(--s3)}',
'.lu-setq-none{padding:10px;font-size:12px;color:var(--t2)}',
'.lu-set-hit{outline:2px solid var(--ach)!important;outline-offset:4px;border-radius:8px;animation:luSetHit 2.2s ease-out 1}',
'@keyframes luSetHit{0%{background:color-mix(in srgb,var(--ac) 22%,transparent)}100%{background:transparent}}',
'@media (max-width:600px){.lu-setq{max-width:none}}'
  ].join('\n');
  document.head.appendChild(st);
}

/* ── 6. announcements ───────────────────────────────────────────────────── */
function _luLiveInit(){
  if(document.getElementById('lu-live-polite'))return;
  var mk=function(id,role,live){
    var d=document.createElement('div');d.id=id;d.className='lu-live';
    d.setAttribute('role',role);d.setAttribute('aria-live',live);d.setAttribute('aria-atomic','true');
    document.body.appendChild(d);return d;
  };
  mk('lu-live-polite','status','polite');
  mk('lu-live-alert','alert','assertive');
}
var _luLiveTimer={};
/** Say `text` to a screen reader without moving focus. urgent = interrupt. */
function luAnnounce(text,urgent){
  try{
    _luLiveInit();
    var id=urgent?'lu-live-alert':'lu-live-polite';
    var el=document.getElementById(id);if(!el)return;
    var t=String(text==null?'':text).replace(/\s+/g,' ').trim();
    if(!t)return;
    // Emptied first, filled a moment later: the same sentence twice in a row is then announced twice.
    el.textContent='';
    clearTimeout(_luLiveTimer[id]);
    _luLiveTimer[id]=setTimeout(function(){el.textContent=t;},70);
  }catch(_){}
}
/** What a toast says aloud: its title, its second line, and that an action is on offer. */
function _luToastSpeech(opts){
  if(!opts||typeof opts!=='object')return '';
  var title=String(opts.title||opts.msg||''),sub=opts.title&&opts.msg?String(opts.msg):'';
  var parts=[title];
  if(sub&&sub!==title)parts.push(sub);
  var acts=(Array.isArray(opts.actions)?opts.actions:[]).map(function(a){return a&&a.label?String(a.label):'';}).filter(Boolean);
  if(acts.length)parts.push(acts.join(', ')+' available');
  return parts.map(function(p){return p.replace(/\s+/g,' ').trim().replace(/[.!?]+$/,'');}).filter(Boolean).join('. ');
}

/* ── 7. swipe a task ────────────────────────────────────────────────────── */
var _luSw=null,_luSwSwallow=0;
function _luSwipeRow(target){
  if(!target||!target.closest)return null;
  if(typeof curScreen==='undefined'||curScreen!=='tasks')return null;
  if(typeof _bulkMode!=='undefined'&&_bulkMode)return null;
  if(target.closest('button,a,input,select,textarea,label,[contenteditable="true"],.tlc-drag'))return null;
  var row=target.closest('.tlc[data-task-id],.cl-task-row[data-task-id]');
  if(!row||!row.closest('#tasks-list'))return null;
  return row;
}
function _luSwipeTask(row){
  var raw=row.getAttribute('data-task-id');
  var id=(typeof _tidOf==='function')?_tidOf(raw):raw;
  return (D.tasks||[]).find(function(t){return t.id===id;})||null;
}
function _luSwipeThreshold(w){return Math.max(72,Math.min(130,w*0.34));}
function _luSwipeLabel(dir,task){
  if(dir==='r')return task&&task.status==='Done'?'↩ Reopen':'✓ Done';
  return 'Tomorrow 💤';
}
function _luSwipeClear(s,keepRow){
  if(!s)return;
  try{if(s.bg&&s.bg.parentNode)s.bg.parentNode.removeChild(s.bg);}catch(_){}
  if(s.row&&!keepRow){s.row.classList.remove('lu-swiping','lu-swipe-ease');s.row.style.transform='';}
}
function _luSwipeStart(e){
  if(_luSw){_luSwipeClear(_luSw);_luSw=null;}
  if(!e.touches||e.touches.length!==1)return;
  var t=e.touches[0];
  if(t.clientX<22)return;                       // the edge belongs to the browser's Back swipe
  var row=_luSwipeRow(e.target);if(!row)return;
  var task=_luSwipeTask(row);if(!task)return;   // rows from other tools carry no task id
  _luSw={row:row,task:task,x:t.clientX,y:t.clientY,dx:0,on:false,bg:null,w:row.offsetWidth||320,armed:false};
}
function _luSwipeBegin(s){
  s.on=true;
  var bg=document.createElement('div');bg.className='lu-swipe-bg';bg.setAttribute('aria-hidden','true');
  bg.style.width=s.row.offsetWidth+'px';bg.style.height=s.row.offsetHeight+'px';
  bg.innerHTML='<span></span>';
  s.row.parentNode.insertBefore(bg,s.row);
  // Put it exactly behind the row, wherever the nearest positioned ancestor happens to be.
  var a=s.row.getBoundingClientRect(),b=bg.getBoundingClientRect();
  bg.style.left=(a.left-b.left)+'px';bg.style.top=(a.top-b.top)+'px';
  s.bg=bg;
  s.row.classList.add('lu-swiping');
}
function _luSwipeMove(e){
  var s=_luSw;if(!s)return;
  var t=e.touches&&e.touches[0];if(!t){return;}
  var dx=t.clientX-s.x,dy=t.clientY-s.y;
  // A press-and-hold has picked the task up to drag it somewhere (app-2's touch drag): that wins.
  if(typeof _luDrag!=='undefined'&&_luDrag&&_luDrag.on){_luSwipeClear(s);_luSw=null;return;}
  if(!s.on){
    if(Math.abs(dy)>10&&Math.abs(dy)>=Math.abs(dx)){_luSw=null;return;}   // the page is scrolling
    if(Math.abs(dx)<12||Math.abs(dx)<Math.abs(dy)*1.3)return;
    _luSwipeBegin(s);
  }
  if(e.cancelable)e.preventDefault();
  var lim=s.w*0.62;
  if(Math.abs(dx)>lim)dx=(dx<0?-1:1)*(lim+(Math.abs(dx)-lim)*0.25);
  s.dx=dx;
  s.row.style.transform='translateX('+Math.round(dx)+'px)';
  var dir=dx>0?'r':'l',armed=Math.abs(dx)>=_luSwipeThreshold(s.w);
  if(s.bg){
    s.bg.className='lu-swipe-bg '+dir+(armed?' arm':'');
    var sp=s.bg.firstChild;var lab=_luSwipeLabel(dir,s.task);if(sp&&sp.textContent!==lab)sp.textContent=lab;
  }
  if(armed&&!s.armed){try{if(navigator.vibrate)navigator.vibrate(8);}catch(_){}}
  s.armed=armed;
}
function _luSwipeEnd(e,cancelled){
  var s=_luSw;_luSw=null;
  if(!s)return;
  if(!s.on)return;
  _luSwSwallow=Date.now();
  var dir=s.dx>0?'r':'l';
  if(cancelled||!s.armed){
    s.row.classList.add('lu-swipe-ease');s.row.style.transform='translateX(0)';
    setTimeout(function(){_luSwipeClear(s);},190);
    return;
  }
  s.row.classList.add('lu-swipe-ease');
  s.row.style.transform='translateX('+(dir==='r'?s.w+24:-(s.w+24))+'px)';
  setTimeout(function(){
    _luSwipeClear(s);
    try{_luSwipeAct(s.task.id,dir);}catch(err){console.warn('[shell] swipe',err);}
  },175);
}
/** What a swipe does. Right: complete / reopen. Left: snooze until tomorrow. */
function _luSwipeAct(id,dir){
  var t=(D.tasks||[]).find(function(x){return x.id===id;});if(!t)return;
  if(dir==='l'){if(typeof snoozeTask==='function')snoozeTask(id);return;}
  if(typeof toggleTask!=='function')return;
  var prev=t.status,wasDone=prev==='Done';
  toggleTask(id);
  if(typeof renderCurrentTaskView==='function')setTimeout(renderCurrentTaskView,100);
  // A repeating task makes its next copy when it is completed; a second toggle would not take
  // that copy away again, so those get the message without the button.
  var repeating=!!(t.recurring&&t.recurring!=='None');
  var opts={type:'success',title:wasDone?'Task reopened':'Task completed',msg:t.title||'',duration:6000};
  if(!repeating||wasDone)opts.actions=[{label:'Undo',onClick:function(){
    // Back to the status it HAD ("In Progress", "Blocked"…), not just "not done".
    var cur=(D.tasks||[]).find(function(x){return x.id===id;});
    if(!cur||cur.status===prev)return;
    if(typeof setTaskStatus==='function')setTaskStatus(cur,prev);else toggleTask(id);
    if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
  }}];
  if(typeof toast==='function')toast(opts);
}
function _luSwipeInit(){
  document.addEventListener('touchstart',_luSwipeStart,{passive:true,capture:true});
  document.addEventListener('touchmove',_luSwipeMove,{passive:false,capture:true});
  document.addEventListener('touchend',function(e){_luSwipeEnd(e,false);},true);
  document.addEventListener('touchcancel',function(e){_luSwipeEnd(e,true);},true);
  // Rows can also be dragged (a long press starts the browser's own drag): the swipe lets go at once.
  document.addEventListener('dragstart',function(){if(_luSw){var s=_luSw;_luSw=null;_luSwipeClear(s);}},true);
  // The tap a browser may still send after a swipe must not open the task.
  window.addEventListener('click',function(e){
    if(_luSwSwallow&&Date.now()-_luSwSwallow<420){_luSwSwallow=0;e.stopPropagation();e.preventDefault();}
  },true);
}
/** Said once per device, the first time a touch device shows a task that can be swiped. */
function _luSwipeTip(){
  try{
    if(localStorage.getItem('lu_swipe_tip'))return;
    if(typeof curScreen==='undefined'||curScreen!=='tasks')return;
    if(!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches))return;
    if(!document.querySelector('#tasks-list .tlc[data-task-id],#tasks-list .cl-task-row[data-task-id]'))return;
    localStorage.setItem('lu_swipe_tip','1');
    if(typeof toast==='function')toast({type:'info',icon:'👆',title:'Swipe a task',msg:'Right to complete it, left to snooze it until tomorrow.',duration:7000});
  }catch(_){}
}

/* ── 8. settings search ─────────────────────────────────────────────────── */
/* Everyday words per section. They only ever open the SECTION — the panels that are filled in
   after they open (Workspace, AI Coach, Bank, the digest cards…) have no rows to read until then. */
var _LU_SET_WORDS={
  'sp-0':'profile name photo picture avatar email password time zone timezone sign out',
  'sp-1':'general workspace name home screen start page first day of week monday sunday date format time format 24 hour clock keyboard shortcuts',
  'sp-2':'appearance theme themes dark light mode colour color accent font size text bigger smaller compact',
  'sp-13':'workspace pages hide show sidebar side panel detail level essentials setup preset layout',
  'sp-3':'notifications daily digest weekly review email reminders deadline habit streaks goal milestones quiet hours sound',
  'sp-4':'accounts outlook microsoft google gmail calendar mail connect sender email delivery log',
  'sp-5':'integrations nifty niftypm atlas automations rules',
  'sp-14':'bank banks connections simplefin transactions money',
  'sp-6':'ai features key keys provider model openrouter',
  'sp-15':'ai coach check-ins check in coaching',
  'sp-7':'teams team members roles permissions invite',
  'sp-8':'word doc docx import onenote',
  'sp-9':'sync syncing devices out of date',
  'sp-10':'backup backups export download data',
  'sp-11':'privacy private cache who can see',
  'sp-12':'admin logs errors email delivery scheduled tasks'
};
var _LU_SET_DULL=/^(save|cancel|close|ok|test|add|edit|remove|delete|refresh|copy|connect|disconnect|reset|clear|apply|update|done|yes|no|on|off|more|less|show|hide|\+|×)$/i;
var _luSetHits=[],_luSetSel=-1,_luSetTimer=0;
function _luSetMain(){return document.getElementById('settings-main');}
function _luSetText(s){return String(s==null?'':s).replace(/\s+/g,' ').trim();}
/** The Settings menu as drawn: [{id,label,tab}] for the sections this person can open. */
function _luSetSections(){
  var main=_luSetMain();if(!main)return [];
  var out=[];
  Array.prototype.forEach.call(main.querySelectorAll('.si[onclick*="showSetTab"]'),function(tab){
    var m=/showSetTab\(this,'([^']+)'\)/.exec(tab.getAttribute('onclick')||'');
    if(!m)return;
    try{if(getComputedStyle(tab).display==='none')return;}catch(_){}
    out.push({id:m[1],label:_luSetText(tab.textContent),tab:tab});
  });
  return out;
}
/** Hidden by its own style or an ancestor's, up to (not counting) the panel — panels are all hidden but one. */
function _luSetShown(el,panel){
  try{
    for(var a=el;a&&a!==panel;a=a.parentElement){
      if(a.hidden||getComputedStyle(a).display==='none')return false;
    }
  }catch(_){}
  return true;
}
/** A row's own name: the first piece of text in it. */
function _luSetRowLabel(row){
  var w=document.createTreeWalker(row,NodeFilter.SHOW_TEXT,null);
  var n;
  while((n=w.nextNode())){
    var p=n.parentElement;
    if(p&&/^(SCRIPT|STYLE|OPTION|TEXTAREA)$/.test(p.tagName))continue;
    var t=_luSetText(n.nodeValue);
    if(t.length>=3)return t.slice(0,80);
  }
  return '';
}
/** Everything that can be found right now. */
function _luSetIndex(){
  var out=[],seen={};
  var add=function(sec,label,desc,el,kind){
    label=_luSetText(label);if(label.length<3)return;
    var key=sec.id+'|'+label.toLowerCase();if(seen[key])return;seen[key]=1;
    out.push({sec:sec.id,secLabel:sec.label,label:label,kind:kind,el:el||null,
      hay:(label+' '+_luSetText(desc||'')).toLowerCase(),lab:label.toLowerCase()});
  };
  _luSetSections().forEach(function(sec){
    var panel=document.getElementById(sec.id);
    out.push({sec:sec.id,secLabel:sec.label,label:sec.label,kind:'sec',el:null,
      hay:(sec.label+' '+(_LU_SET_WORDS[sec.id]||'')).toLowerCase(),lab:sec.label.toLowerCase()});
    seen[sec.id+'|'+sec.label.toLowerCase()]=1;
    if(!panel)return;
    Array.prototype.forEach.call(panel.querySelectorAll('h3,h4'),function(h){
      if(_luSetShown(h,panel))add(sec,h.textContent,'',h,'head');
    });
    Array.prototype.forEach.call(panel.querySelectorAll('.lr'),function(r){
      if(!_luSetShown(r,panel))return;
      add(sec,_luSetRowLabel(r),_luSetText(r.textContent).slice(0,260),r,'row');
    });
    Array.prototype.forEach.call(panel.querySelectorAll('button'),function(b){
      var t=_luSetText(b.textContent).replace(/^[^A-Za-z0-9]+/,'');
      if(t.length<4||t.length>44||_LU_SET_DULL.test(t))return;
      if(_luSetShown(b,panel))add(sec,t,'',b,'button');
    });
  });
  return out;
}
/** Pure: the best matches for q in an index made by _luSetIndex. */
function _luSetSearch(index,q,max){
  q=_luSetText(q).toLowerCase();
  if(q.length<2)return [];
  var toks=q.split(' ').filter(Boolean);
  var res=[];
  (index||[]).forEach(function(e){
    for(var i=0;i<toks.length;i++){if(e.hay.indexOf(toks[i])<0)return;}
    var sc;
    if(e.lab===q)sc=120;
    else if(e.lab.indexOf(q)===0)sc=100;
    else if(e.lab.indexOf(q)>=0)sc=80;
    else if(toks.every(function(t){return e.lab.indexOf(t)>=0;}))sc=60;
    else sc=30;
    if(e.kind==='sec')sc+=5;else if(e.kind==='head')sc+=2;else if(e.kind==='button')sc-=4;
    res.push({e:e,sc:sc});
  });
  res.sort(function(a,b){return b.sc-a.sc||a.e.label.length-b.e.label.length;});
  return res.slice(0,max||8).map(function(r){return r.e;});
}
function _luSetPaint(){
  var inp=document.getElementById('lu-setq-in'),list=document.getElementById('lu-setq-list');
  if(!inp||!list)return;
  var q=_luSetText(inp.value);
  if(q.length<2){_luSetHits=[];_luSetSel=-1;list.hidden=true;list.innerHTML='';inp.setAttribute('aria-expanded','false');inp.removeAttribute('aria-activedescendant');return;}
  _luSetHits=_luSetSearch(_luSetIndex(),q,8);
  _luSetSel=_luSetHits.length?0:-1;
  list.hidden=false;inp.setAttribute('aria-expanded','true');
  if(!_luSetHits.length){
    list.innerHTML='<div class="lu-setq-none">Nothing in Settings matches “'+_shEsc(q)+'”.</div>';
    inp.removeAttribute('aria-activedescendant');
    luAnnounce('No matching settings');
    return;
  }
  list.innerHTML=_luSetHits.map(function(e,i){
    return '<div class="lu-setq-o" role="option" id="lu-setq-o'+i+'" data-i="'+i+'" aria-selected="'+(i===0?'true':'false')+'"><b>'+_shEsc(e.label)+'</b><span>'+_shEsc(e.kind==='sec'?'Section':e.secLabel)+'</span></div>';
  }).join('');
  inp.setAttribute('aria-activedescendant','lu-setq-o0');
  luAnnounce(_luSetHits.length+(_luSetHits.length===1?' result':' results'));
}
function _luSetMove(d){
  if(!_luSetHits.length)return;
  _luSetSel=(_luSetSel+d+_luSetHits.length)%_luSetHits.length;
  var list=document.getElementById('lu-setq-list'),inp=document.getElementById('lu-setq-in');
  Array.prototype.forEach.call(list.querySelectorAll('.lu-setq-o'),function(o,i){
    o.setAttribute('aria-selected',i===_luSetSel?'true':'false');
    if(i===_luSetSel&&o.scrollIntoView)o.scrollIntoView({block:'nearest'});
  });
  if(inp)inp.setAttribute('aria-activedescendant','lu-setq-o'+_luSetSel);
}
function _luSetClose(clear){
  var inp=document.getElementById('lu-setq-in'),list=document.getElementById('lu-setq-list');
  if(inp&&clear)inp.value='';
  if(list){list.hidden=true;list.innerHTML='';}
  if(inp){inp.setAttribute('aria-expanded','false');inp.removeAttribute('aria-activedescendant');}
  _luSetHits=[];_luSetSel=-1;
}
/** The element a result points at, found again by name if the panel was redrawn since. */
function _luSetFind(e){
  var panel=document.getElementById(e.sec);if(!panel)return null;
  if(e.el&&e.el.isConnected&&panel.contains(e.el))return e.el;
  var want=e.label.toLowerCase(),hit=null;
  var sel=e.kind==='head'?'h3,h4':e.kind==='button'?'button':'.lr';
  Array.prototype.some.call(panel.querySelectorAll(sel),function(x){
    var t=(e.kind==='row'?_luSetRowLabel(x):_luSetText(x.textContent).replace(/^[^A-Za-z0-9]+/,'')).toLowerCase();
    if(t===want||(e.kind!=='row'&&t.indexOf(want)===0)){hit=x;return true;}
    return false;
  });
  return hit;
}
function _luSetFlash(el){
  if(!el)return;
  try{el.scrollIntoView({block:'center'});}catch(_){}
  el.classList.remove('lu-set-hit');void el.offsetWidth;el.classList.add('lu-set-hit');
  setTimeout(function(){el.classList.remove('lu-set-hit');},2400);
  // Focus goes to the setting, so a keyboard or screen-reader user lands on it too.
  try{
    var f=el.matches&&el.matches('button,input,select,textarea,[tabindex]')?el:el.querySelector('button,input,select,textarea,[role="switch"],[tabindex]:not([tabindex="-1"])');
    if(!f){el.setAttribute('tabindex','-1');f=el;}
    f.focus({preventScroll:true});
  }catch(_){}
}
/** Open a result: its section, then the row itself. */
function luSetGo(i){
  var e=_luSetHits[i];if(!e)return;
  var sec=_luSetSections().filter(function(s){return s.id===e.sec;})[0];
  if(!sec||typeof showSetTab!=='function'){_luSetClose(true);return;}
  _luSetClose(true);
  showSetTab(sec.tab,sec.id);
  if(e.kind==='sec'){
    try{sec.tab.focus&&sec.tab.focus();}catch(_){}
    luAnnounce(sec.label+' settings');
    return;
  }
  // Some panels load their rows when they open: look again as they arrive.
  var done=null;
  [0,450,1100,2000].forEach(function(ms){
    setTimeout(function(){
      if(done&&done.isConnected)return;
      var el=_luSetFind(e);
      if(el){done=el;_luSetFlash(el);}
    },ms);
  });
  luAnnounce(e.label+', in '+sec.label);
}
/** Put the box under the Settings heading (the page is redrawn whole, so this runs after each draw). */
function _luSetMount(){
  var main=_luSetMain();if(!main||document.getElementById('lu-set-search'))return;
  var head=main.querySelector('.pg-h');if(!head)return;
  var box=document.createElement('div');box.id='lu-set-search';box.className='lu-setq';
  box.innerHTML=((typeof _icon==='function')?_icon('search',15,'var(--t2)'):'')
    +'<input id="lu-setq-in" class="inp" type="search" placeholder="Search settings" autocomplete="off" spellcheck="false" role="combobox" aria-label="Search settings" aria-autocomplete="list" aria-expanded="false" aria-controls="lu-setq-list">'
    +'<div id="lu-setq-list" class="lu-setq-list" role="listbox" aria-label="Matching settings" hidden></div>';
  head.parentNode.insertBefore(box,head.nextSibling);
  var inp=box.querySelector('input'),list=box.querySelector('.lu-setq-list');
  inp.addEventListener('input',function(){clearTimeout(_luSetTimer);_luSetTimer=setTimeout(_luSetPaint,90);});
  inp.addEventListener('focus',function(){if(_luSetText(inp.value).length>=2)_luSetPaint();});
  inp.addEventListener('keydown',function(ev){
    if(ev.key==='ArrowDown'){ev.preventDefault();if(list.hidden)_luSetPaint();else _luSetMove(1);}
    else if(ev.key==='ArrowUp'){ev.preventDefault();_luSetMove(-1);}
    else if(ev.key==='Enter'){if(_luSetSel>=0){ev.preventDefault();luSetGo(_luSetSel);}}
    else if(ev.key==='Escape'){if(!list.hidden||inp.value){ev.preventDefault();ev.stopPropagation();_luSetClose(true);}}
  });
  // mousedown, not click: the list must act before the box loses focus and closes it.
  list.addEventListener('mousedown',function(ev){
    var o=ev.target&&ev.target.closest?ev.target.closest('.lu-setq-o'):null;if(!o)return;
    ev.preventDefault();luSetGo(Number(o.getAttribute('data-i')));
  });
  inp.addEventListener('blur',function(){setTimeout(function(){if(document.activeElement!==inp)_luSetClose(false);},160);});
}
function _luSetWatch(){
  var main=_luSetMain();if(!main||main._luSetWatched)return;
  main._luSetWatched=true;
  try{new MutationObserver(function(){try{_luSetMount();}catch(_){}}).observe(main,{childList:true});}catch(_){}
  _luSetMount();
}
/** From the command palette: open Settings with the cursor in the search box. */
function luSetSearchOpen(){
  if(typeof nav==='function')nav('settings');
  setTimeout(function(){_luSetMount();var i=document.getElementById('lu-setq-in');if(i){try{i.focus();}catch(_){}}},140);
}

/* ── 9. install ─────────────────────────────────────────────────────────── */
function _luInstallEvent(){return window._luInstallEvt||null;}
function _luInstalled(){
  try{return !!((window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true);}catch(_){return false;}
}
function _luIsIos(){
  try{var ua=navigator.userAgent||'';return /iPhone|iPad|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);}catch(_){return false;}
}
/** Pure: what to offer. 'prompt' = the browser's own install dialog, 'ios' = the Add to Home Screen steps. */
function _luInstallMode(installed,hasEvent,ios){
  if(installed)return 'none';
  if(hasEvent)return 'prompt';
  if(ios)return 'ios';
  return 'none';
}
function luInstallMode(){return _luInstallMode(_luInstalled(),!!_luInstallEvent(),_luIsIos());}
var _LU_IOS_STEPS='Tap the Share button, then “Add to Home Screen”.';
/** Install now (a tap or a palette command — the browser only allows its dialog after one). */
function luInstall(){
  var mode=luInstallMode();
  if(mode==='prompt'){
    var ev=_luInstallEvent();window._luInstallEvt=null;
    try{
      ev.prompt();
      if(ev.userChoice&&ev.userChoice.then)ev.userChoice.then(function(c){
        if(c&&c.outcome==='accepted'&&typeof toast==='function')toast({type:'success',title:'LevelUp is installed',msg:'Open it from your home screen or app list.'});
      }).catch(function(){});
    }catch(e){if(typeof toast==='function')toast('Could not open the install dialog. Use your browser’s menu instead.','error');}
    return;
  }
  if(typeof toast!=='function')return;
  if(mode==='ios'){toast({type:'info',icon:'📲',title:'Add LevelUp to your Home Screen',msg:_LU_IOS_STEPS,duration:0,actions:[{label:'Got it'}]});return;}
  if(_luInstalled()){toast({type:'info',title:'LevelUp is already installed on this device'});return;}
  toast({type:'info',icon:'📲',title:'Install from your browser’s menu',msg:'Look for “Install LevelUp” or “Add to Home screen”. Not every browser offers it.',duration:8000});
}
/** Pure: is this the moment for the one automatic offer? */
function _luInstallDue(mode,asked,visits,signedIn){
  return mode!=='none'&&!asked&&visits>=2&&!!signedIn;
}
function _luInstallOffer(){
  try{
    var mode=luInstallMode();
    var signedIn=typeof _serverSyncReady!=='undefined'&&!!_serverSyncReady;
    var lo=document.getElementById('login-overlay');
    if(lo&&lo.offsetParent!==null)signedIn=false;
    if(!_luInstallDue(mode,localStorage.getItem('lu_install_asked'),Number(localStorage.getItem('lu_visits')||0),signedIn))return false;
    localStorage.setItem('lu_install_asked',String(Date.now()));
    if(mode==='ios')toast({type:'info',icon:'📲',title:'Add LevelUp to your Home Screen',msg:_LU_IOS_STEPS+' It then opens like any other app.',duration:0,actions:[{label:'Got it'}]});
    else toast({type:'info',icon:'📲',title:'Install LevelUp',msg:'Open it from your home screen or app list, in its own window.',duration:0,
      actions:[{label:'Install',primary:true,onClick:function(){luInstall();}},{label:'Not now'}]});
    return true;
  }catch(_){return false;}
}
function _luInstallInit(){
  try{localStorage.setItem('lu_visits',String(Number(localStorage.getItem('lu_visits')||0)+1));}catch(_){}
  // index.html keeps an early event in window._luInstallEvt; one that comes later lands here.
  window.addEventListener('beforeinstallprompt',function(e){try{e.preventDefault();}catch(_){}window._luInstallEvt=e;});
  window.addEventListener('appinstalled',function(){window._luInstallEvt=null;try{localStorage.setItem('lu_install_asked',String(Date.now()));}catch(_){}});
  // Not while signing in, and not in the first seconds of a visit.
  var tries=0;
  var tick=function(){
    tries++;
    if(_luInstallOffer()||tries>=12)return;
    setTimeout(tick,10000);
  };
  setTimeout(tick,12000);
}

/* ── wiring (-294) ──────────────────────────────────────────────────────── */
(function(){
  if(typeof document==='undefined'||window._luShell2Wired)return;
  window._luShell2Wired=true;
  try{_luShell2CSS();}catch(_){}
  try{_luLiveInit();}catch(_){}
  // Toasts are spoken as well as shown.
  try{
    var origToast=window._showRichToast;
    if(typeof origToast==='function'){
      window._showRichToast=function(opts){
        var r=origToast.apply(this,arguments);
        try{var say=_luToastSpeech(opts);if(say)luAnnounce(say,opts&&opts.type==='error');}catch(_){}
        return r;
      };
    }
  }catch(_){}
  try{_luSwipeInit();}catch(e){console.warn('[shell] swipe',e);}
  try{_luSetWatch();}catch(e){console.warn('[shell] settings search',e);}
  try{_luInstallInit();}catch(e){console.warn('[shell] install',e);}
  // After each navigation: the swipe tip on Tasks, the search box on Settings.
  try{
    var origNav=window.nav;
    if(typeof origNav==='function'){
      window.nav=function(id){
        var r=origNav.apply(this,arguments);
        try{
          if(id==='tasks')setTimeout(_luSwipeTip,900);
          if(id==='settings')setTimeout(function(){try{_luSetWatch();_luSetMount();}catch(_){}} ,60);
        }catch(_){}
        return r;
      };
    }
  }catch(_){}
  // The command palette.
  try{
    var oc=window._cmdpActions;
    if(typeof oc==='function'){
      window._cmdpActions=function(){
        var list=oc.apply(this,arguments);
        try{
          list.push({id:'set-search',group:'Navigate',icon:'🔎',title:'Search settings',run:function(){luSetSearchOpen();}});
          if(luInstallMode()!=='none')list.push({id:'install',group:'Tools',icon:'📲',title:'Install LevelUp as an app',run:function(){luInstall();}});
        }catch(_){}
        return list;
      };
    }
  }catch(_){}
  // Help.
  try{
    if(typeof HC_ARTICLES!=='undefined'&&Array.isArray(HC_ARTICLES)&&!HC_ARTICLES.some(function(a){return a.slug==='phone-and-install';})){
      HC_ARTICLES.push({id:77,slug:'phone-and-install',catId:13,title:'Install LevelUp, swipe tasks, search Settings',
        summary:'Put LevelUp on your home screen, finish tasks with a swipe, and find any setting by typing.',
        tags:['install','app','home screen','pwa','iphone','ipad','android','swipe','gesture','snooze','complete','settings','search','theme','dark','light'],
        body:[
          '## Install LevelUp as an app',
          '',
          'LevelUp can sit on your home screen or in your app list and open in its own window, without the browser’s address bar.',
          '',
          '- **Chrome or Edge (computer or Android):** LevelUp offers it once, on your second visit. You can also open the command palette and choose **Install LevelUp as an app**, or use the browser’s own menu.',
          '- **iPhone or iPad:** tap the **Share** button, then **Add to Home Screen**.',
          '',
          'It is the same LevelUp with the same data. Nothing is downloaded from an app store.',
          '',
          '## Swipe a task (phones and tablets)',
          '',
          'On the Tasks page, in the List and Clusters views:',
          '',
          '- **Swipe right** to complete a task. On a completed task it reopens it.',
          '- **Swipe left** to snooze it until tomorrow.',
          '',
          'Keep going until the label lights up, then let go. Let go earlier and nothing happens. Each swipe shows a message with **Undo**. Tasks that come from another tool, such as NiftyPM, are not swiped: open them instead.',
          '',
          '## Search Settings',
          '',
          'Type in the **Search settings** box at the top of Settings, for example “digest”, “time zone” or “theme”. Pick a result and LevelUp opens the right section and points at the setting. The arrow keys and Enter work too. The command palette has **Search settings** as well.',
          '',
          '## Light or dark the first time',
          '',
          'A browser that has never opened LevelUp starts in your device’s own light or dark setting. Once you choose a theme in Settings → Appearance, or sign in to an account that has one, that choice is what you get.'
        ].join('\n')});
    }
  }catch(_){}
  try{if(typeof curScreen!=='undefined'&&curScreen==='settings')_luSetMount();}catch(_){}
})();
