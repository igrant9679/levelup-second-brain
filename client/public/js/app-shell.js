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
