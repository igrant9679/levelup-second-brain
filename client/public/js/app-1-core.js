// LevelUp client, file 1 of 7 (core): rich-text editor, data store (D), dates, navigation, drawer, modal, screen dispatch, recurrence, time tracker.
// Plain classic script: its top-level functions and variables are globals shared with the other files, and it must load in the order of scripts/lib/bundles.mjs (index.html loader). Split out of app-part1.js in build -234.
// Holds the markdown renderer's NUL-byte placeholders: keep exactly 12 NUL bytes (CI checks). Edit with latin1-safe tools.

// ====== LU RICH TEXT EDITOR (luRTE) ======
// Lightweight Gutenberg-style rich text editor using contenteditable + execCommand
// Used in: Notes inline edit, Journal entry modal, Mail compose
const luRTE_CSS=`
.rte-wrap{display:flex;flex-direction:column;border:1px solid var(--bd2);border-radius:6px;overflow:hidden;background:var(--s1)}
.rte-toolbar{display:flex;flex-wrap:wrap;gap:2px;padding:4px 6px;background:var(--s2);border-bottom:1px solid var(--bd1);align-items:center}
.rte-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:4px;border:none;background:transparent;color:var(--t1);cursor:pointer;font-size:12px;font-weight:600;transition:background .12s}
.rte-btn:hover{background:var(--s3)}
.rte-btn.active{background:var(--acs);color:var(--ac)}
.rte-sep{width:1px;height:18px;background:var(--bd1);margin:0 3px}
.rte-sel{height:24px;font-size:11px;padding:0 4px;border:1px solid var(--bd1);border-radius:4px;background:var(--s1);color:var(--t1);cursor:pointer}
.rte-body{min-height:160px;padding:10px 12px;font-size:13px;line-height:1.7;color:var(--t1);outline:none;overflow-y:auto;word-break:break-word}
.rte-body:empty:before{content:attr(data-placeholder);color:var(--t3);pointer-events:none}
.rte-body h1{font-size:20px;font-weight:700;margin:12px 0 6px}
.rte-body h2{font-size:16px;font-weight:600;margin:10px 0 4px}
.rte-body h3{font-size:14px;font-weight:600;margin:8px 0 4px}
.rte-body blockquote{border-left:3px solid var(--ac);margin:8px 0;padding:4px 12px;color:var(--t2);font-style:italic;background:var(--acs)}
.rte-body pre,.rte-body code{font-family:monospace;background:var(--s3);padding:2px 6px;border-radius:3px;font-size:11px}
.rte-body pre{display:block;padding:8px 12px;margin:6px 0;overflow-x:auto}
.rte-body ul{padding-left:20px;margin:4px 0}
.rte-body ol{padding-left:20px;margin:4px 0}
.rte-body li{margin:2px 0}
.rte-body a{color:var(--ac);text-decoration:underline}
.rte-body hr{border:none;border-top:1px solid var(--bd1);margin:10px 0}
.rte-body img{max-width:100%;border-radius:4px;margin:4px 0}
.rte-char-count{font-size:11px;color:var(--t3);padding:3px 8px;text-align:right;background:var(--s2);border-top:1px solid var(--bd1)}
`;

function luRTE_injectCSS(){
  if(document.getElementById('lu-rte-css'))return;
  const s=document.createElement('style');
  s.id='lu-rte-css';
  s.textContent=luRTE_CSS;
  document.head.appendChild(s);
}

// Render the RTE toolbar + contenteditable area
// opts: { id, placeholder, value, height, showCharCount }
function luRTE_render(opts={}){
  luRTE_injectCSS();
  const id=opts.id||'rte-body';
  const ph=opts.placeholder||'Start writing...';
  const h=opts.height||'200px';
  const val=opts.value||'';
  const allowHtmlPaste=opts.allowHtmlPaste?'true':'false';
  const initHtml=luRTE_mdToHtml(val);
  // Font family/size + text/highlight colour now ship on EVERY luRTE toolbar
  // via _rteFontTools() in the main toolbar; mail compose keeps its extra
  // align buttons here.
  const extraToolbar=opts.allowHtmlPaste?`
  <div class="rte-sep"></div>
  <button class="rte-btn" title="Align Left" onmousedown="event.preventDefault();document.execCommand('justifyLeft');document.getElementById('${id}').focus()">⇐</button>
  <button class="rte-btn" title="Align Center" onmousedown="event.preventDefault();document.execCommand('justifyCenter');document.getElementById('${id}').focus()">☰</button>
  <button class="rte-btn" title="Align Right" onmousedown="event.preventDefault();document.execCommand('justifyRight');document.getElementById('${id}').focus()">⇒</button>`
  :'';
  return `<div class="rte-wrap" id="${id}-wrap" data-allow-html-paste="${allowHtmlPaste}">
<div class="rte-toolbar" id="${id}-tb">
  <button class="rte-btn" title="Bold (Ctrl+B)" onmousedown="event.preventDefault();luRTE_cmd('bold','${id}')"><b>B</b></button>
  <button class="rte-btn" title="Italic (Ctrl+I)" onmousedown="event.preventDefault();luRTE_cmd('italic','${id}')"><i>I</i></button>
  <button class="rte-btn" title="Underline (Ctrl+U)" onmousedown="event.preventDefault();luRTE_cmd('underline','${id}')"><u>U</u></button>
  <button class="rte-btn" title="Strikethrough" onmousedown="event.preventDefault();luRTE_cmd('strikeThrough','${id}')"><s>S</s></button>
  <div class="rte-sep"></div>
  <select class="rte-sel" title="Heading" onchange="luRTE_heading(this.value,'${id}');this.value=''">
    <option value="">Paragraph</option>
    <option value="h1">Heading 1</option>
    <option value="h2">Heading 2</option>
    <option value="h3">Heading 3</option>
    <option value="pre">Code Block</option>
    <option value="blockquote">Quote</option>
  </select>
  <div class="rte-sep"></div>
  <button class="rte-btn" title="Bullet list (dots)" onmousedown="event.preventDefault();luRTE_cmd('insertUnorderedList','${id}')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg></button>
  <button class="rte-btn" title="Numbered list" onmousedown="event.preventDefault();luRTE_cmd('insertOrderedList','${id}')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/><text x="1.5" y="8.5" font-size="8" font-weight="700" fill="currentColor" stroke="none">1</text><text x="1.5" y="20.5" font-size="8" font-weight="700" fill="currentColor" stroke="none">2</text></svg></button>
  <button class="rte-btn" title="Outdent" onmousedown="event.preventDefault();luRTE_cmd('outdent','${id}')">⇤</button>
  <button class="rte-btn" title="Indent" onmousedown="event.preventDefault();luRTE_cmd('indent','${id}')">⇥</button>
  <div class="rte-sep"></div>
  <button class="rte-btn" title="Insert Link" onmousedown="event.preventDefault();luRTE_insertLink('${id}')">🔗</button>
  <button class="rte-btn" title="Insert Image (file or URL)" onmousedown="event.preventDefault();luRTE_insertImage('${id}')">🖼</button>
  <button class="rte-btn" title="Insert Horizontal Rule" onmousedown="event.preventDefault();luRTE_cmd('insertHorizontalRule','${id}')">—</button>
  <button class="rte-btn" title="Clear Formatting" onmousedown="event.preventDefault();luRTE_cmd('removeFormat','${id}')">Tx</button>
  <div class="rte-sep"></div>
  <button class="rte-btn" title="Undo (Ctrl+Z)" onmousedown="event.preventDefault();luRTE_cmd('undo','${id}')">↩</button>
  <button class="rte-btn" title="Redo (Ctrl+Y)" onmousedown="event.preventDefault();luRTE_cmd('redo','${id}')">↪</button>
  ${_rteFontTools()}
  ${extraToolbar}
</div>
<div class="rte-body" id="${id}" contenteditable="true" data-placeholder="${ph}" style="min-height:${h}"
  onkeydown="luRTE_keydown(event,'${id}')"
  oninput="luRTE_onInput('${id}')"
  onpaste="luRTE_onPaste(event,'${id}')">${initHtml}</div>
${opts.showCharCount!==false?`<div class="rte-char-count" id="${id}-cc">0 chars</div>`:''}
</div>`;
}

function luRTE_cmd(cmd,id){
  const el=document.getElementById(id);
  if(!el)return;
  el.focus();
  // If the selection isn't inside this editor (e.g. the user clicked a toolbar
  // button before ever clicking into the body), execCommand silently no-ops —
  // the "bullet button does nothing" bug. Place the caret at the end first.
  const sel=window.getSelection();
  if(!sel.rangeCount||!el.contains(sel.getRangeAt(0).commonAncestorContainer)){
    const r=document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }
  document.execCommand(cmd,false,null);
  if(_luRTE_isListCmd(cmd))_luRTE_fixNestedLists(el);
  luRTE_updateCharCount(id);
}

function _luRTE_isListCmd(cmd){
  return cmd==='insertUnorderedList'||cmd==='insertOrderedList'||cmd==='indent'||cmd==='outdent';
}

// Chromium's execCommand('insert(Un)orderedList') nests the new <ul>/<ol>
// INSIDE the caret's <p>/<h1-6> instead of replacing it — invalid HTML that
// the live DOM tolerates but the editing engine then chokes on: the whole
// paragraph becomes ONE giant li ("bullets don't work when editing an
// existing note" — bodies with <p> wrappers come from Word imports, AI
// inserts, and renderMd; 108/208 prod notes have them). Hoist any list out
// of its invalid container, keeping content before/after the list in place,
// then restore the caret.
function _luRTE_fixNestedLists(ed){
  if(!ed)return;
  const sel=window.getSelection();
  let caret=null;
  if(sel&&sel.rangeCount){
    const r=sel.getRangeAt(0);
    if(ed.contains(r.startContainer))caret={node:r.startContainer,off:r.startOffset};
  }
  const bad=ed.querySelectorAll('p>ul,p>ol,h1>ul,h1>ol,h2>ul,h2>ol,h3>ul,h3>ol,h4>ul,h4>ol,h5>ul,h5>ol,h6>ul,h6>ol');
  bad.forEach(list=>{
    const box=list.parentNode, parent=box&&box.parentNode;
    if(!parent)return;
    // Content AFTER the list stays a paragraph of its own, placed after.
    const tail=box.cloneNode(false);
    while(list.nextSibling)tail.appendChild(list.nextSibling);
    parent.insertBefore(list,box.nextSibling);
    if(tail.textContent.trim()||tail.querySelector('img,br'))parent.insertBefore(tail,list.nextSibling);
    // Drop the original container if the list was all it had.
    if(!box.textContent.trim()&&!box.querySelector('img,br'))box.remove();
  });
  if(caret&&ed.contains(caret.node)){
    try{
      const max=caret.node.nodeType===3?caret.node.textContent.length:caret.node.childNodes.length;
      const r=document.createRange();
      r.setStart(caret.node,Math.min(caret.off,max));
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }catch(_){/* caret restore is best-effort */}
  }
}

// ─── Generic helpers for the bespoke (non-luRTE) toolbars ────────────────────
// Every bespoke toolbar (drawer note/journal/goal/task-notes, FA modals, idea
// editors) is a toolbar <div> whose contenteditable sits as a following
// sibling. These helpers discover that editable from any control inside the
// toolbar, so one set of markup works for every surface.
function _rteFindEd(el){
  let n=el;
  for(let i=0;i<5&&n;i++){
    let sib=n.nextElementSibling;
    while(sib){
      if(sib.getAttribute&&sib.getAttribute('contenteditable')==='true')return sib;
      const inner=sib.querySelector&&sib.querySelector('[contenteditable="true"]');
      if(inner)return inner;
      sib=sib.nextElementSibling;
    }
    n=n.parentElement;
  }
  return null;
}
// Run a command against this toolbar's editable, placing the caret inside it
// first if the selection is elsewhere (otherwise execCommand silently no-ops).
function _rteExec(ev,cmd,val){
  const src=(ev&&(ev.currentTarget||ev.target))||null;
  const ed=src?_rteFindEd(src):null;
  if(!ed)return;
  ed.focus();
  const sel=window.getSelection();
  if(!sel.rangeCount||!ed.contains(sel.getRangeAt(0).commonAncestorContainer)){
    const r=document.createRange();
    r.selectNodeContents(ed);r.collapse(false);
    sel.removeAllRanges();sel.addRange(r);
  }
  document.execCommand(cmd,false,val==null?null:val);
  if(_luRTE_isListCmd(cmd))_luRTE_fixNestedLists(ed);
}
// Font / colour controls need the selection captured on mousedown (opening a
// <select> or native colour dialog steals it) and restored before applying.
let _rteSel={ed:null,range:null};
function _rteSaveSel(el){
  const ed=_rteFindEd(el);
  _rteSel.ed=ed;_rteSel.range=null;
  const s=window.getSelection();
  if(ed&&s&&s.rangeCount){
    const r=s.getRangeAt(0);
    if(ed.contains(r.commonAncestorContainer))_rteSel.range=r.cloneRange();
  }
}
function _rteApply(el,cmd,val){
  if(!val)return;
  const ed=_rteSel.ed||_rteFindEd(el);
  if(!ed)return;
  ed.focus();
  const s=window.getSelection();
  if(_rteSel.range){s.removeAllRanges();s.addRange(_rteSel.range);}
  else{const r=document.createRange();r.selectNodeContents(ed);r.collapse(false);s.removeAllRanges();s.addRange(r);}
  try{document.execCommand('styleWithCSS',false,true);}catch(_){}
  document.execCommand(cmd,false,val);
}
// Shared font-family / font-size / text-colour / highlight controls, appended
// to every RTE toolbar (bespoke + luRTE). Target editable is auto-discovered.
function _rteFontTools(){
  const fonts=['Arial','Georgia','Verdana','Tahoma','Trebuchet MS','Times New Roman','Courier New','system-ui'];
  return `<div style="width:1px;background:var(--bd1);margin:2px 2px"></div>`+
    `<select title="Font style" style="height:22px;font-size:11px;max-width:88px;padding:0 3px;border:1px solid var(--bd1);border-radius:4px;background:var(--s1);color:var(--t1);cursor:pointer" onmousedown="_rteSaveSel(this)" onchange="_rteApply(this,'fontName',this.value);this.selectedIndex=0"><option value="">Font</option>${fonts.map(f=>`<option value="${f}" style="font-family:'${f}'">${f}</option>`).join('')}</select>`+
    `<select title="Font size" style="height:22px;font-size:11px;width:54px;padding:0 3px;border:1px solid var(--bd1);border-radius:4px;background:var(--s1);color:var(--t1);cursor:pointer" onmousedown="_rteSaveSel(this)" onchange="_rteApply(this,'fontSize',this.value);this.selectedIndex=0"><option value="">Size</option><option value="1">8</option><option value="2">10</option><option value="3">12</option><option value="4">14</option><option value="5">18</option><option value="6">24</option><option value="7">36</option></select>`+
    `<label title="Text colour" style="display:inline-flex;align-items:center;gap:2px;cursor:pointer;padding:0 2px"><span style="font-size:11px;font-weight:700;color:var(--t1)">A</span><input type="color" style="width:18px;height:18px;border:none;padding:0;background:transparent;cursor:pointer" onmousedown="_rteSaveSel(this)" onchange="_rteApply(this,'foreColor',this.value)"></label>`+
    `<label title="Highlight colour" style="display:inline-flex;align-items:center;gap:2px;cursor:pointer;padding:0 2px"><span style="font-size:11px;font-weight:700;background:#ff0;color:#000;padding:0 3px;border-radius:2px">H</span><input type="color" value="#ffff00" style="width:18px;height:18px;border:none;padding:0;background:transparent;cursor:pointer" onmousedown="_rteSaveSel(this)" onchange="_rteApply(this,'hiliteColor',this.value)"></label>`;
}

// Notion-style auto-format: typing "- " / "* " at the start of a line turns it
// into a bullet list, "1. " into a numbered list, "#"/"##"/"###" + space into a
// heading. Returns true when it consumed the keystroke.
function luRTE_autoFormat(e,id){
  const sel=window.getSelection();
  if(!sel||!sel.rangeCount||!sel.isCollapsed)return false;
  const node=sel.anchorNode;
  if(!node||node.nodeType!==3)return false;
  const el=document.getElementById(id);
  if(!el||!el.contains(node))return false;
  const off=sel.anchorOffset;
  const before=node.textContent.slice(0,off);
  const m=before.match(/^(-|\*|\d{1,2}\.|#{1,3})$/);
  if(!m)return false;
  // Must be at a logical line start: nothing (or a <br>) before this text node.
  const prev=node.previousSibling;
  if(prev&&prev.nodeName!=='BR')return false;
  // Already inside a list item → let the browser handle it normally.
  const pe=node.parentNode&&node.parentNode.nodeType===1?node.parentNode:el;
  if(pe.closest&&pe.closest('li'))return false;
  const trig=m[1];
  e.preventDefault();
  // Strip the trigger characters, keep the caret at the line start.
  node.textContent=node.textContent.slice(off);
  const r=document.createRange();
  r.setStart(node,0);r.collapse(true);
  sel.removeAllRanges();sel.addRange(r);
  if(trig==='-'||trig==='*')document.execCommand('insertUnorderedList',false,null);
  else if(/^\d{1,2}\.$/.test(trig))document.execCommand('insertOrderedList',false,null);
  else document.execCommand('formatBlock',false,'h'+trig.length);
  _luRTE_fixNestedLists(el);
  luRTE_updateCharCount(id);
  return true;
}

// Saved-selection ranges per editor id, used so the colour picker doesn't
// lose the user's selection when its native dialog steals focus.
const _luRTE_savedSel={};
function luRTE_saveSel(id){
  const sel=window.getSelection();
  if(!sel||sel.rangeCount===0)return;
  const range=sel.getRangeAt(0);
  const el=document.getElementById(id);
  if(!el)return;
  // Only save if the range is inside the target editor
  if(el.contains(range.commonAncestorContainer)){
    _luRTE_savedSel[id]=range.cloneRange();
  }
}
function luRTE_applyColor(cmd,id,value){
  const el=document.getElementById(id);
  if(!el)return;
  el.focus();
  const saved=_luRTE_savedSel[id];
  if(saved){
    const sel=window.getSelection();
    sel.removeAllRanges();
    sel.addRange(saved);
  }
  // Use CSS-based colour so the colour applies to a span (more reliable than <font>)
  try{document.execCommand('styleWithCSS',false,true);}catch(_){}
  document.execCommand(cmd,false,value);
  luRTE_updateCharCount(id);
}

function luRTE_heading(tag,id){
  if(!tag)return;
  const el=document.getElementById(id);
  if(!el)return;
  el.focus();
  if(tag==='pre'){
    document.execCommand('formatBlock',false,'pre');
  } else if(tag==='blockquote'){
    document.execCommand('formatBlock',false,'blockquote');
  } else {
    document.execCommand('formatBlock',false,tag);
  }
}

function luRTE_insertLink(id){
  const url=prompt('Enter URL:','https://');
  if(!url)return;
  const el=document.getElementById(id);
  if(!el)return;
  el.focus();
  document.execCommand('createLink',false,url);
}

// Insert an image into the contenteditable RTE. Two paths:
//   1) Pick a file from disk → read as data URL → embed inline. The image
//      lives inside the note body and travels with the note (works offline,
//      survives across devices since the body syncs to the server).
//   2) Paste a URL → embed via <img src="…">. Useful for already-hosted
//      images (Imgur, S3, etc.).
// Uses a custom modal instead of prompt() so the file-picker user-gesture
// chain isn't broken (browsers block .click() on a dynamic input after a
// prompt dismissal).
function luRTE_insertImage(id){
  const el=document.getElementById(id);
  if(!el)return;
  // Remember the current selection inside the editor so insertHTML targets
  // the right cursor position even after the modal interaction.
  let savedRange=null;
  try{
    const sel=window.getSelection();
    if(sel&&sel.rangeCount>0){
      const r=sel.getRangeAt(0);
      if(el.contains(r.commonAncestorContainer))savedRange=r.cloneRange();
    }
  }catch(_){}
  const restoreCaret=()=>{
    el.focus();
    if(savedRange){
      const sel=window.getSelection();sel.removeAllRanges();sel.addRange(savedRange);
    }
  };
  // Build the modal markup
  const m=document.getElementById('modal-content');if(!m){toast('Modal not available');return;}
  m.innerHTML=`
    <h2 style="font-size:15px;font-weight:600;margin:0 0 6px">🖼 Insert Image</h2>
    <p style="font-size:11px;color:var(--t2);margin:0 0 14px">Upload an image from your computer, or paste a URL.</p>
    <div style="display:grid;grid-template-columns:1fr;gap:10px">
      <button type="button" class="btn btn-p" id="lu-img-pick-btn" style="height:42px;font-size:13px;display:flex;align-items:center;justify-content:center;gap:8px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Upload from computer
      </button>
      <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.08em"><div style="flex:1;height:1px;background:var(--bd1)"></div>or<div style="flex:1;height:1px;background:var(--bd1)"></div></div>
      <div class="field"><label>Paste an image URL</label><input id="lu-img-url" class="inp" placeholder="https://… or data:image/png;base64,…" autofocus></div>
      <button type="button" class="btn btn-s" id="lu-img-url-btn" style="height:32px;font-size:11px">Insert URL</button>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:14px;padding-top:10px;border-top:1px solid var(--bd1)">
      <button type="button" class="btn btn-s" onclick="closeModal()">Cancel</button>
    </div>
  `;
  document.getElementById('modal-capture').classList.add('show');
  // Hidden file input that the Upload button proxies. Triggering .click()
  // from within an onclick handler preserves the user-gesture chain so the
  // browser doesn't suppress the dialog.
  const pickBtn=document.getElementById('lu-img-pick-btn');
  const urlBtn=document.getElementById('lu-img-url-btn');
  const urlInp=document.getElementById('lu-img-url');
  pickBtn.onclick=()=>{
    const inp=document.createElement('input');
    inp.type='file';
    inp.accept='image/png,image/jpeg,image/webp,image/gif,image/avif';
    inp.style.display='none';
    inp.onchange=()=>{
      const f=inp.files&&inp.files[0];if(!f){return;}
      if(f.size>5*1024*1024){toast({type:'error',title:'Image too large',msg:'Maximum size is 5 MB.'});return;}
      const r=new FileReader();
      r.onload=()=>{
        closeModal();
        setTimeout(()=>{
          restoreCaret();
          const safeAlt=(f.name||'Image').replace(/"/g,'&quot;');
          document.execCommand('insertHTML',false,`<img src="${r.result}" alt="${safeAlt}" style="max-width:100%;border-radius:6px;display:block;margin:8px 0">`);
        },80);
      };
      r.onerror=()=>toast('Failed to read image');
      r.readAsDataURL(f);
    };
    document.body.appendChild(inp);
    inp.click();
    setTimeout(()=>inp.remove(),60000);
  };
  const doUrl=()=>{
    const url=(urlInp.value||'').trim();
    if(!url){toast('Enter an image URL or click Upload from computer');return;}
    if(!/^https?:\/\//i.test(url)&&!url.startsWith('data:image/')){
      toast({type:'error',title:'Invalid image URL',msg:'Must start with http://, https://, or data:image/'});
      return;
    }
    closeModal();
    setTimeout(()=>{
      restoreCaret();
      const safe=url.replace(/"/g,'&quot;');
      document.execCommand('insertHTML',false,`<img src="${safe}" alt="Image" style="max-width:100%;border-radius:6px;display:block;margin:8px 0">`);
    },80);
  };
  urlBtn.onclick=doUrl;
  urlInp.onkeydown=(e)=>{if(e.key==='Enter'){e.preventDefault();doUrl();}};
}

function luRTE_keydown(e,id){
  if((e.ctrlKey||e.metaKey)&&e.key==='b'){e.preventDefault();luRTE_cmd('bold',id);}
  else if((e.ctrlKey||e.metaKey)&&e.key==='i'){e.preventDefault();luRTE_cmd('italic',id);}
  else if((e.ctrlKey||e.metaKey)&&e.key==='u'){e.preventDefault();luRTE_cmd('underline',id);}
  // Tab key for indent
  else if(e.key==='Tab'){e.preventDefault();luRTE_cmd(e.shiftKey?'outdent':'indent',id);}
  // Space after "-", "*", "1.", or "#"-"###" at line start → auto-format
  else if(e.key===' '){if(luRTE_autoFormat(e,id))return;}
  // Ctrl+S save — call context-specific save handler
  else if((e.ctrlKey||e.metaKey)&&e.key==='s'){
    e.preventDefault();
    if(id==='nie-body' && typeof saveNoteInlineEdit==='function' && _noteInlineEditId){
      saveNoteInlineEdit(_noteInlineEditId);
    } else {
      const saveBtn=document.querySelector('[data-rte-save]');
      if(saveBtn)saveBtn.click();
    }
  }
  // Note wiki-link support: delegate to noteWikiKeydown if available
  if(typeof noteWikiKeydown==='function' && id==='nie-body'){noteWikiKeydown(e);}
}

function luRTE_onInput(id){
  luRTE_updateCharCount(id);
  // Note wiki-link support
  if(id==='nie-body' && typeof noteWikiInput==='function'){
    const el=document.getElementById(id);
    if(el)noteWikiInput(el);
  }
  // FA modals track a dirty flag for their unsaved-changes guard.
  try{ if(id&&id.slice(0,3)==='fa-'&&typeof _faHasChanges!=='undefined')_faHasChanges=true; }catch(_){}
}

function luRTE_onPaste(e,id){
  const wrap=document.getElementById(id+'-wrap');
  if(wrap&&wrap.dataset.allowHtmlPaste==='true'){// camelCase of data-allow-html-paste
    // Allow rich HTML paste for compose
    e.preventDefault();
    const html=(e.clipboardData||window.clipboardData).getData('text/html');
    const text=(e.clipboardData||window.clipboardData).getData('text/plain');
    if(html){document.execCommand('insertHTML',false,html);}
    else{document.execCommand('insertText',false,text);}
    return;
  }
  // Strip HTML on paste, keep plain text (default for notes/journal)
  e.preventDefault();
  const text=(e.clipboardData||window.clipboardData).getData('text/plain');
  document.execCommand('insertText',false,text);
}

function luRTE_updateCharCount(id){
  const el=document.getElementById(id);
  const cc=document.getElementById(id+'-cc');
  if(el&&cc){
    const chars=(el.innerText||el.textContent||'').length;
    cc.textContent=chars+' chars';
  }
}

// Get the inner HTML of the RTE (for saving)
function luRTE_getValue(id){
  const el=document.getElementById(id);
  return el?el.innerHTML:'';
}

// Get plain text (for char count, AI, etc.)
function luRTE_getText(id){
  const el=document.getElementById(id);
  return el?(el.innerText||el.textContent||''):'';
}

// Set value (HTML or markdown)
function luRTE_setValue(id,val){
  const el=document.getElementById(id);
  if(!el)return;
  el.innerHTML=luRTE_mdToHtml(val);
  luRTE_updateCharCount(id);
}

// A body already contains real HTML (RTE / contenteditable output, or an
// imported document) if it has any recognizable tag ANYWHERE — not just at the
// start. contenteditable produces mixed bodies like "Govwin<br><ul><li>…" that
// begin with plain text; the old startsWith('<') check missed those, and the
// markdown converter below then HTML-escaped their <ul>/<li> into literal
// "&lt;ul&gt;" text, destroying every saved list on reopen. Plain-markdown
// bodies contain no such tags and still fall through to the converter.
// ── HTML sanitizer (Phase 0 security, build -225) ───────────────────────────
// Every surface that shows stored or received HTML — notes (own, shared,
// imported, web-clipped), the rich-text editor when it loads a body, mail,
// assistant/coach messages, Help answers — goes through this. DOMPurify
// (client/public/js/vendor/purify.min.js, loaded before the bundles) removes
// scripts, event-handler attributes and javascript: URLs while keeping
// formatting, links, images (incl. data: images) and inline styles. If the
// library ever fails to load, a conservative regex fallback still strips the
// dangerous constructs.
function luSanitizeHtml(html){
  if(html==null)return '';
  const s=String(html);
  if(!s)return '';
  if(window.DOMPurify&&typeof DOMPurify.sanitize==='function'){
    return DOMPurify.sanitize(s,{ADD_ATTR:['target'],FORBID_TAGS:['style','form','input','button','textarea','select','option','iframe','frame','object','embed','base','meta','link','svg','math']});
  }
  return s
    .replace(/<\s*(script|iframe|frame|object|embed|style|base|meta|link|form|svg|math)\b[\s\S]*?(?:<\/\s*\1\s*>|$)/gi,'')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,'')
    .replace(/(href|src|action|formaction|xlink:href)\s*=\s*(["']?)\s*(?:javascript|vbscript|data:text\/html)/gi,'$1=$2#');
}
// Parse HTML without running it: a DOMParser document has no browsing
// context, so images don't load and onerror/onload never fire (a detached
// document.createElement('div') DOES load images). Use this to read text or
// structure out of stored HTML.
function luParseInert(html){
  try{return new DOMParser().parseFromString('<!doctype html><body>'+String(html==null?'':html),'text/html').body;}
  catch(_){const d=document.implementation.createHTMLDocument('');d.body.innerHTML=String(html==null?'':html);return d.body;}
}
function _luRTE_isHtml(text){
  return /<\/?(?:ul|ol|li|p|div|br|h[1-6]|strong|b|em|i|u|s|a|img|blockquote|pre|code|span|hr|font|table|tr|td)\b[^>]*>/i.test(text);
}
// Convert stored markdown/HTML body to display HTML
function luRTE_mdToHtml(text){return luSanitizeHtml(_luRTE_mdToHtmlRaw(text));}
function _luRTE_mdToHtmlRaw(text){
  if(!text)return'';
  // Already HTML anywhere in the string → return as-is (never re-escape it).
  if(_luRTE_isHtml(text))return text;
  // Otherwise it's plain text / markdown. Normalise any stray <br> to newlines.
  let s=text.replace(/<br\s*\/?>/gi,'\n');
  s=s
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`(.+?)`/g,'<code>$1</code>')
    .replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/^## (.+)$/gm,'<h2>$1</h2>')
    .replace(/^# (.+)$/gm,'<h1>$1</h1>')
    .replace(/^&gt; (.+)$/gm,'<blockquote>$1</blockquote>');
  // Lists: group CONSECUTIVE "-"/"*" (or "N.") lines into one <ul>/<ol> each.
  // The old single-regex wrap (/(<li>.*<\/li>)/gs) spanned from the FIRST list
  // item to the LAST across the whole document, swallowing everything between.
  s=s.replace(/(?:^[-*] .+(?:\n|$))+/gm,block=>
    '<ul>'+block.trim().split('\n').map(l=>'<li>'+l.replace(/^[-*] /,'')+'</li>').join('')+'</ul>');
  s=s.replace(/(?:^\d{1,2}\. .+(?:\n|$))+/gm,block=>
    '<ol>'+block.trim().split('\n').map(l=>'<li>'+l.replace(/^\d{1,2}\. /,'')+'</li>').join('')+'</ol>');
  // Newlines between/around blocks: block elements carry their own separation.
  s=s.replace(/\n?(<\/(?:ul|ol|h1|h2|h3|blockquote)>)\n?/g,'$1')
     .replace(/\n\n/g,'</p><p>')
     .replace(/\n/g,'<br>');
  return s;
}

// renderMd — preferred read-only markdown→HTML renderer for description and
// notes display surfaces (project descriptions, task notes preview, idea
// descriptions, goal target text, etc.). Handles headings, bold/italic,
// inline code, fenced code, blockquotes, bullet/numbered lists, horizontal
// rules, links, autolinks, and inline images. Pre-escapes HTML so user
// content can't inject script. Intentionally minimal and dependency-free.
function renderMd(text){return luSanitizeHtml(_renderMdRaw(text));}
function _renderMdRaw(text){
  if(text==null)return '';
  let s=String(text);
  if(!s.trim())return '';
  // Already HTML anywhere (RTE / contenteditable output, imported docs)? Return
  // as-is — re-escaping would turn saved <ul>/<li> etc. into literal text. The
  // old /^\s*</ start-only check missed mixed "text<br><ul>…" bodies.
  if(_luRTE_isHtml(s))return s;
  // 1. Pull out fenced code blocks first so their contents survive escaping
  const codeBlocks=[];
  s=s.replace(/```([\s\S]*?)```/g,(_,c)=>{
    const i=codeBlocks.push(c)-1;return ` CB${i} `;
  });
  // 2. Pull out images so escaping doesn't break their src/alt
  const images=[];
  s=s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g,(_,alt,url)=>{
    const i=images.push({alt,url})-1;return ` IM${i} `;
  });
  // 3. Pull out [text](url) links the same way
  const links=[];
  s=s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,(_,t,u)=>{
    const i=links.push({t,u})-1;return ` LN${i} `;
  });
  // 4. Escape remaining HTML
  s=s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  // 5. Block-level transforms
  s=s.replace(/^######\s+(.+)$/gm,'<h6 style="font-size:11px;font-weight:600;margin:8px 0 2px">$1</h6>')
     .replace(/^#####\s+(.+)$/gm,'<h5 style="font-size:12px;font-weight:600;margin:8px 0 2px">$1</h5>')
     .replace(/^####\s+(.+)$/gm,'<h4 style="font-size:13px;font-weight:600;margin:8px 0 2px">$1</h4>')
     .replace(/^###\s+(.+)$/gm,'<h3 style="font-size:14px;font-weight:600;margin:10px 0 4px">$1</h3>')
     .replace(/^##\s+(.+)$/gm,'<h2 style="font-size:16px;font-weight:600;margin:12px 0 4px">$1</h2>')
     .replace(/^#\s+(.+)$/gm,'<h1 style="font-size:18px;font-weight:700;margin:14px 0 6px">$1</h1>')
     .replace(/^---+$/gm,'<hr style="border:none;border-top:1px solid var(--bd1);margin:10px 0">')
     .replace(/^\s*&gt;\s+(.+)$/gm,'<blockquote style="border-left:3px solid var(--ac);padding:2px 8px;margin:6px 0;color:var(--t2);font-style:italic">$1</blockquote>');
  // 6. Lists — group consecutive items into a single <ul>/<ol>
  s=s.replace(/(?:^[-*+]\s+.+(?:\n|$))+/gm,(block)=>{
    const items=block.trim().split(/\n/).map(l=>l.replace(/^[-*+]\s+/,'')).map(it=>`<li style="margin:2px 0">${it}</li>`).join('');
    return `<ul style="margin:6px 0 6px 18px;padding:0">${items}</ul>`;
  });
  s=s.replace(/(?:^\d+\.\s+.+(?:\n|$))+/gm,(block)=>{
    const items=block.trim().split(/\n/).map(l=>l.replace(/^\d+\.\s+/,'')).map(it=>`<li style="margin:2px 0">${it}</li>`).join('');
    return `<ol style="margin:6px 0 6px 22px;padding:0">${items}</ol>`;
  });
  // 7. Inline transforms
  s=s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
     .replace(/(^|[\s(])\*([^\s*][^*]*?)\*(?=[\s).,!?;:]|$)/g,'$1<em>$2</em>')
     .replace(/(^|[\s(])_([^\s_][^_]*?)_(?=[\s).,!?;:]|$)/g,'$1<em>$2</em>')
     .replace(/`([^`]+?)`/g,'<code style="background:var(--s3);padding:1px 5px;border-radius:3px;font-family:ui-monospace,monospace;font-size:.92em">$1</code>')
     .replace(/(^|\s)(https?:\/\/[^\s<]+)/g,'$1<a href="$2" target="_blank" rel="noopener" style="color:var(--ac);text-decoration:underline">$2</a>');
  // 8. Paragraph breaks (double newlines) and soft breaks
  s=s.replace(/\n{2,}/g,'</p><p style="margin:6px 0">').replace(/\n/g,'<br>');
  s=`<p style="margin:6px 0">${s}</p>`;
  // 9. Restore protected blocks with proper HTML
  s=s.replace(/ LN(\d+) /g,(_,i)=>{
    const {t,u}=links[+i];
    const safeUrl=String(u).replace(/"/g,'&quot;');
    return `<a href="${safeUrl}" target="_blank" rel="noopener" style="color:var(--ac);text-decoration:underline">${t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</a>`;
  });
  s=s.replace(/ IM(\d+) /g,(_,i)=>{
    const {alt,url}=images[+i];
    const safeUrl=String(url).replace(/"/g,'&quot;');
    const safeAlt=String(alt||'Image').replace(/"/g,'&quot;');
    return `<img src="${safeUrl}" alt="${safeAlt}" style="max-width:100%;border-radius:6px;margin:8px 0;display:block" loading="lazy" onerror="this.style.display='none'">`;
  });
  s=s.replace(/ CB(\d+) /g,(_,i)=>{
    const c=codeBlocks[+i].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<pre style="background:var(--s3);border:1px solid var(--bd1);border-radius:6px;padding:8px 10px;margin:8px 0;font-family:ui-monospace,monospace;font-size:11px;overflow-x:auto"><code>${c}</code></pre>`;
  });
  return s;
}

// ─── AI output length control ───────────────────────────────────────────────
// Centralised so every AI button (RTE Assistance bars, Compose flows, Decision
// Brief, etc.) picks up the same length preference. Resolution order:
//   window._aiLengthOverride (transient — set by an in-bar chip)
//   D.prefs.aiOutputLength    (persisted Settings → AI default)
//   'medium'                  (built-in fallback)
// `level` is one of 'short' | 'medium' | 'long'.
function _aiLength(){
  const ov=(typeof window!=='undefined'&&window._aiLengthOverride)||'';
  const pref=(D&&D.prefs&&D.prefs.aiOutputLength)||'';
  const v=ov||pref||'medium';
  return (v==='short'||v==='medium'||v==='long')?v:'medium';
}
// Word-count guidance injected into the AI systemPrompt. Phrased as a "ceiling"
// hint so models that ignore exact targets still produce noticeably different
// lengths. Returns an empty string for unknown levels.
function _aiLengthHint(level){
  const L=(level||_aiLength());
  if(L==='short')return '\n\nLength guidance: Keep your response SHORT. Aim for ~80 words (roughly 3-5 sentences). Be punchy and direct. No filler.';
  if(L==='long')return '\n\nLength guidance: Provide a LONG, comprehensive response. Aim for ~500 words. Use headings (##), bullet lists, and bold where helpful. Cover the topic thoroughly.';
  return '\n\nLength guidance: Provide a MEDIUM-length response. Aim for ~200 words. Use formatting (headings, bullets, bold) only when it genuinely helps comprehension.';
}
function _aiSetLength(level){
  if(level!=='short'&&level!=='medium'&&level!=='long')return;
  // Persist as the Settings default so the change sticks across sessions.
  // Clear the transient override so the persisted value is what reads next.
  if(!D.prefs)D.prefs={};
  D.prefs.aiOutputLength=level;
  if(typeof window!=='undefined')window._aiLengthOverride=null;
  if(typeof save==='function')save('prefs');
  // Refresh any visible length chips (each chip carries data-ai-length-chip).
  document.querySelectorAll('[data-ai-length-chip]').forEach(el=>{
    const labels={short:'Short',medium:'Medium',long:'Long'};
    el.textContent='Length: '+labels[level];
  });
  if(typeof toast==='function')toast('AI length: '+level);
}
// Compact dropdown-style chip for the AI Assistance bars. Click cycles through
// short → medium → long → short.
function _aiLengthChip(){
  const lvl=_aiLength();
  const labels={short:'Short',medium:'Medium',long:'Long'};
  const next={short:'medium',medium:'long',long:'short'};
  return `<button type="button" class="btn btn-s" data-ai-length-chip style="height:24px;font-size:11px;padding:0 8px;margin-left:auto;color:var(--t2)" onclick="_aiSetLength('${next[lvl]}')" title="Click to cycle Short → Medium → Long. Affects all AI buttons on this page.">Length: ${labels[lvl]}</button>`;
}

// Convert RTE HTML back to plain text / markdown for storage
function luRTE_htmlToMd(html){
  if(!html)return'';
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi,'# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi,'## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi,'### $1\n')
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi,'> $1\n')
    .replace(/<pre[^>]*>(.*?)<\/pre>/gi,'```\n$1\n```\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi,'**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi,'**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi,'*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi,'*$1*')
    .replace(/<code[^>]*>(.*?)<\/code>/gi,'`$1`')
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi,(m,inner)=>{let i=0;return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi,(mm,c)=>(++i)+'. '+c+'\n');})
    .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi,(m,inner)=>inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi,'- $1\n'))
    .replace(/<li[^>]*>(.*?)<\/li>/gi,'- $1\n')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<p[^>]*>/gi,'')
    .replace(/<\/p>/gi,'\n')
    .replace(/<div[^>]*>/gi,'')
    .replace(/<\/div>/gi,'\n')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi,'[$2]($1)')
    .replace(/<hr\s*\/?>/gi,'---\n')
    .replace(/<[^>]+>/g,'')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&nbsp;/g,' ')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

// ====== DATA STORE ======
// Every task status, in workflow order. Each status picker reads this list —
// the drawer had no Someday, so a Someday task opened in it showed
// "Not Started" and saving silently pulled it back into the active list.
const TASK_STATUSES=['Not Started','Pending','Scheduled','In Progress','Done','Someday'];
function _statusOptions(cur){
  const list=TASK_STATUSES.includes(cur)||!cur?TASK_STATUSES:[cur,...TASK_STATUSES];
  return list.map(s=>`<option ${s===cur?'selected':''}>${esc(s)}</option>`).join('');
}
// ── Dates (Phase 3, build -228) ─────────────────────────────────────────
// The app's dates are LOCAL calendar days. Three helpers, and
// `pnpm check:dates` fails the build if the UTC forms come back:
//  _ymd(d)    local YYYY-MM-DD of a Date (default now). NOT
//             toISOString().slice(0,10), which is the UTC day — tomorrow,
//             after ~8pm Eastern.
//  _pd(v)     drop-in for new Date(v). Only a bare 'YYYY-MM-DD' string
//             changes: local midnight, where the browser reads UTC midnight
//             (the evening before, west of UTC). Dates, numbers and full
//             timestamps behave exactly like new Date(v).
//  _dayOf(v)  local day of a stored value: a 'YYYY-MM-DD' stays as is, a
//             timestamp ('…T03:12:00.000Z') becomes the day it was locally.
function _pd(v){
  if(typeof v==='string'){
    const m=v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m)return new Date(+m[1],+m[2]-1,+m[3]);
    return new Date(String(v));
  }
  return v instanceof Date?new Date(v.getTime()):new Date(v==null?(v===null?0:NaN):+v);
}
function _dayOf(v){
  if(!v)return '';
  const s=String(v);
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  const d=_pd(v);
  return isNaN(d)?s.slice(0,10):_ymd(d);
}
// Whole calendar days from today to a stored day: 0 = today, -1 = yesterday.
// Comparing a due day's midnight with the current TIME rounded "today" in the
// afternoon to "1d ago".
function _daysUntil(day){
  const d=_pd(_dayOf(day));
  if(isNaN(d))return null;
  return Math.round((d-_pd(_ymd()))/86400000);
}
// A calendar time as 24h "HH:MM": accepts "14:30", "2:30 PM", "10 AM", or
// falls back to a whole hour.
function _calHM(v,fallbackHour){
  const m=String(v==null?'':v).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i);
  if(m){
    let h=+m[1];const mi=+(m[2]||0);const ap=(m[3]||'').toLowerCase();
    if(ap.startsWith('p')&&h<12)h+=12;
    if(ap.startsWith('a')&&h===12)h=0;
    if(h<24&&mi<60)return String(h).padStart(2,'0')+':'+String(mi).padStart(2,'0');
  }
  const fh=Math.max(0,Math.min(23,Math.floor(Number(fallbackHour)||0)));
  return String(fh).padStart(2,'0')+':00';
}
// Is an external (Nifty / Smartsheet) status "done"? ONE answer for every
// view: List and Cards accepted completed / cancelled / resolved / shipped
// while Gantt, Calendar, Clusters, Programs and project cards accepted only
// done / complete / closed, so the same task was open in one view and done in
// the next. A status that STARTS with one of these words counts ("Done - QA").
const _EXT_DONE_RE=/^(done|complete|completed|closed|cancell?ed|resolved|shipped)\b/;
function _isExtDone(status){ return _EXT_DONE_RE.test(String(status||'').trim().toLowerCase()); }
function _ymd(d){d=d||new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
// Platform detection for keyboard-shortcut hints — Mac/iOS show ⌘, everything else Ctrl.
const _isMac=/Mac|iPhone|iPod|iPad/i.test((navigator.platform||'')+' '+(navigator.userAgent||''));
// Global today string used across screens (YYYY-MM-DD), in LOCAL time.
// It was computed once at load, so a tab left open overnight (the iPad) kept
// yesterday's Today tab, overdue marks and KPIs. _luRefreshToday() moves it
// on — from the midnight timer, on focus / tab return, and once a minute
// (timers don't fire while a device sleeps) — and re-renders once per change.
var _todayStr=_ymd();
function _luRefreshToday(){
  const t=_ymd();
  if(t===_todayStr)return false;
  _todayStr=t;
  try{if(typeof checkMyDayReset==='function')checkMyDayReset();}catch(e){console.warn('[today] reset failed',e);}
  try{if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);}catch(e){}
  try{if(typeof toast==='function')toast('☀️ New day! My Day has been refreshed.');}catch(e){}
  return true;
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)_luRefreshToday();});
// ── Keyboard access for click-only controls (Phase 5, build -230) ──────────
// Much of the app is rendered as div/span with an inline onclick — task
// checkboxes, status and priority pills, cards, rows, cluster headers, Money
// rows — which a keyboard could not reach. Rather than rewrite ~1,000
// templates, every such element gets tabindex=0 as it is rendered, and
// Enter/Space activate it. role="button" is added only when it has no
// interactive children (a row holding buttons must not become a button).
// Skipped: native controls, contenteditable, a handler that only stops
// propagation, and click-outside backgrounds (event.target===this).
// `pnpm check:a11y` fails if a visible click-only element is left unreachable.
const _LU_NATIVE=/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY|OPTION|LABEL|DETAILS|IFRAME|VIDEO|AUDIO)$/;
const _luTxt=el=>String(el&&el.textContent||'').replace(/\s+/g,' ').trim();
function _luKbdFix(el){
  if(!el||el.nodeType!==1||_LU_NATIVE.test(el.tagName)||el.hasAttribute('tabindex')||el.isContentEditable)return;
  const oc=el.getAttribute('onclick');
  if(!oc||/^\s*(event\.stopPropagation\(\);?\s*)?$/.test(oc)||/event\.target\s*===?\s*this/.test(oc))return;
  el.setAttribute('tabindex','0');
  // Task / habit completion boxes are checkboxes, with their state and the
  // item they complete.
  if(el.matches('.chk,.tlc-chk')&&!el.hasAttribute('role')){
    el.setAttribute('role','checkbox');
    el.setAttribute('aria-checked',el.classList.contains('on')||el.classList.contains('done')||el.classList.contains('checked')?'true':'false');
    const row=el.closest('[data-task-id],.lr,.tlc,.cl-task-row');
    const t=row?_luTxt(row.querySelector('.rt,.tlc-t,.tlc-title,.tt')||row).slice(0,60):'';
    if(t&&!el.getAttribute('aria-label'))el.setAttribute('aria-label','Complete '+t);
    return;
  }
  if(!el.hasAttribute('role')&&!el.querySelector('a,button,input,select,textarea,[onclick],[contenteditable="true"]'))el.setAttribute('role','button');
}
// Accessible names for form controls rendered without one. A screen reader
// announced most selects and checkboxes as just "combo box" / "checkbox":
// the forms put a visible <label> next to the control without connecting
// it. In order: connect the field's own <label>; a row checkbox becomes
// "Select ‹row›"; otherwise the control's title, a short text label just
// before it, or (selects) the first option. Anything named in the markup
// (aria-label, <label for>, wrapping label) is left alone.
function _luHasName(c){
  if(c.getAttribute('aria-label')||c.getAttribute('aria-labelledby')||c.getAttribute('title'))return true;
  if(c.labels&&c.labels.length)return true;
  if(c.tagName!=='SELECT'&&c.getAttribute('placeholder'))return true;
  if(c.tagName==='INPUT'&&/^(button|submit|reset|hidden|image)$/i.test(c.type))return true;
  return false;
}
function _luNameFix(c){
  if(!c||_luHasName(c))return;
  // 1) the field's own visible <label> (label + control in one container)
  const box=c.closest('.field,.fa-field,.form-row,.fin-field,label');
  const lab=box&&box.tagName!=='LABEL'?box.querySelector('label:not([for])'):null;
  if(lab&&!lab.querySelector('input,select,textarea')){
    // the label's own words, not the text of buttons inside it ("⚙ Advanced")
    const t=[...lab.childNodes].filter(n=>n.nodeType===3||(n.nodeType===1&&!n.matches('button,.btn,a'))).map(n=>n.textContent).join(' ').replace(/\s+/g,' ').trim()||_luTxt(lab);
    if(t){if(c.id)lab.htmlFor=c.id;else c.setAttribute('aria-label',t.slice(0,80));if(_luHasName(c))return;c.setAttribute('aria-label',t.slice(0,80));return;}
  }
  // 2) a selection checkbox in a row
  if(c.type==='checkbox'){
    const row=c.closest('[data-task-id],tr,.lr,.tlc,.cl-task-row,.fin-row');
    if(row){const t=_luTxt(row).slice(0,60);c.setAttribute('aria-label','Select '+(t||'row'));return;}
  }
  // 3) a short text label just before it
  const prev=c.previousElementSibling;
  const pt=prev&&!prev.matches('input,select,textarea,button')?_luTxt(prev):'';
  if(pt&&pt.length<=40){c.setAttribute('aria-label',pt.replace(/[:：]\s*$/,''));return;}
  // 4) a select's first option ("All members", "Link a project…")
  if(c.tagName==='SELECT'&&c.options.length){const t=_luTxt(c.options[0]);if(t){c.setAttribute('aria-label',t.slice(0,80));return;}}
  if(c.id)c.setAttribute('aria-label',c.id.replace(/^[a-z]+-/,'').replace(/[-_]+/g,' '));
}
function _luKbdScan(root){
  if(!root||root.nodeType!==1)return;
  if(root.hasAttribute('onclick'))_luKbdFix(root);
  root.querySelectorAll('[onclick]').forEach(_luKbdFix);
  if(root.matches('input,select,textarea'))_luNameFix(root);
  root.querySelectorAll('input,select,textarea').forEach(_luNameFix);
}
new MutationObserver(ms=>{for(const m of ms){if(m.type==='attributes')_luKbdFix(m.target);else m.addedNodes.forEach(_luKbdScan);}})
  .observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['onclick']});
if(document.body)_luKbdScan(document.body);else document.addEventListener('DOMContentLoaded',()=>_luKbdScan(document.body));
document.addEventListener('keydown',e=>{
  if(e.key!=='Enter'&&e.key!==' ')return;
  const el=e.target;
  if(!el||el.nodeType!==1||_LU_NATIVE.test(el.tagName)||el.isContentEditable||!el.hasAttribute('onclick')||el.getAttribute('tabindex')!=='0')return;
  if(e.altKey||e.ctrlKey||e.metaKey)return;
  e.preventDefault();
  el.click();
});
window.addEventListener('focus',()=>_luRefreshToday());
setInterval(_luRefreshToday,60000);
var D = {
  tasks: JSON.parse(localStorage.getItem('lu_tasks') || 'null') || [
    {id:101,title:'Finalize Q2 product roadmap presentation',status:'In Progress',priority:'High',due:'2026-05-02',energy:'High',est:90,tags:['strategy','product'],projectId:1,assignee:'Idris Grant',context:'@computer',notes:'Include market analysis, competitor landscape, and 3-quarter forecast. Coordinate with Priya on design assets.',subtasks:[{id:1,title:'Gather market data',done:true},{id:2,title:'Draft slide deck',done:true},{id:3,title:'Review with leadership',done:false},{id:4,title:'Incorporate feedback',done:false}],myDay:true,starred:true,createdAt:'2026-04-20'},
    {id:102,title:'Review and merge auth refactor pull request',status:'Not Started',priority:'High',due:'2026-04-28',energy:'High',est:45,tags:['engineering','code-review'],projectId:2,assignee:'Idris Grant',context:'@computer',notes:'PR #247 by Marcus Webb. Check for security edge cases, test coverage, and backward compatibility with existing sessions.',subtasks:[{id:1,title:'Read PR diff',done:false},{id:2,title:'Run test suite locally',done:false},{id:3,title:'Leave review comments',done:false}],myDay:true,starred:false,createdAt:'2026-04-25'},
    {id:103,title:'Prepare onboarding materials for new hire',status:'Not Started',priority:'Medium',due:'2026-05-05',energy:'Medium',est:60,tags:['hr','onboarding'],projectId:null,assignee:'Idris Grant',context:'@computer',notes:'New hire starts May 6. Prepare welcome doc, tool access checklist, 30-60-90 day plan template, and schedule intro meetings with each team lead.',subtasks:[{id:1,title:'Write welcome document',done:false},{id:2,title:'Create tool access checklist',done:false},{id:3,title:'Draft 30-60-90 plan',done:false},{id:4,title:'Schedule intro meetings',done:false}],myDay:false,starred:false,createdAt:'2026-04-26'},
    {id:1,title:'Finalize LevelUp platform requirements',priority:'High',due:'2025-05-19',startDate:'2025-05-19',endDate:'2025-05-19',startTime:'09:00',endTime:'11:00',estimatedMins:120,context:'Deep Work',project:'LevelUp Platform',projectId:1,status:'In Progress',myDay:true,energy:'high',notes:'Cover all MVP screens and data model.',recurring:'None',subtasks:[{id:1,title:'Write user stories',done:true},{id:2,title:'Define data schema',done:true},{id:3,title:'Review with Priya',done:false}],linkedGoalId:1,createdBy:'Idris Grant'},
    {id:2,title:'Review sprint backlog with dev team',priority:'High',due:'2025-05-19',startDate:'2025-05-19',endDate:'2025-05-19',startTime:'10:00',endTime:'11:00',estimatedMins:60,context:'Calls',project:'LevelUp Platform',projectId:1,status:'Scheduled',myDay:true,energy:'medium',notes:'',recurring:'Weekly',subtasks:[],linkedGoalId:1,createdBy:'Priya Nair'},
    {id:3,title:'Respond to investor follow-up emails',priority:'Medium',due:'2025-05-19',startDate:'2025-05-19',endDate:'2025-05-19',startTime:'08:00',endTime:'08:30',estimatedMins:30,context:'Admin',project:'Fundraising',projectId:2,status:'Pending',myDay:true,energy:'low',notes:'',recurring:'None',subtasks:[],linkedGoalId:2,createdBy:'Idris Grant'},
    {id:4,title:'Draft Q3 product roadmap',priority:'Medium',due:'2025-05-20',startDate:'2025-05-20',endDate:'2025-05-21',startTime:'09:00',endTime:'12:00',estimatedMins:180,context:'Deep Work',project:'LevelUp Platform',projectId:1,status:'Not Started',myDay:false,energy:'high',notes:'',recurring:'None',subtasks:[{id:1,title:'Outline key themes',done:false},{id:2,title:'Add milestones',done:false}],linkedGoalId:1,createdBy:'Idris Grant'},
    {id:5,title:'Prepare demo for advisory board',priority:'High',due:'2025-05-23',startDate:'2025-05-22',endDate:'2025-05-23',startTime:'14:00',endTime:'16:00',estimatedMins:120,context:'Work',project:'LevelUp Platform',projectId:1,status:'Not Started',myDay:false,energy:'high',notes:'',recurring:'None',subtasks:[],linkedGoalId:1,createdBy:'Idris Grant'},
    {id:6,title:'Research AI note-linking approaches',priority:'Low',due:'2025-05-24',startDate:'2025-05-24',endDate:'2025-05-24',startTime:'',endTime:'',estimatedMins:90,context:'Learning',project:'Second Brain Research',projectId:3,status:'Not Started',myDay:false,energy:'medium',notes:'',recurring:'None',subtasks:[],linkedGoalId:null,createdBy:'Marcus Webb'},
    {id:7,title:'Update pitch deck financials',priority:'Medium',due:'2025-05-25',startDate:'2025-05-25',endDate:'2025-05-25',startTime:'',endTime:'',estimatedMins:60,context:'Work',project:'Fundraising',projectId:2,status:'Not Started',myDay:false,energy:'high',notes:'',recurring:'None',subtasks:[],linkedGoalId:2,createdBy:'Priya Nair'},
    {id:8,title:'Write weekly reflection post',priority:'Low',due:'2025-05-26',startDate:'2025-05-26',endDate:'2025-05-26',startTime:'',endTime:'',estimatedMins:45,context:'Creative',project:'Personal Brand',projectId:4,status:'Not Started',myDay:false,energy:'low',notes:'',recurring:'Weekly',subtasks:[],linkedGoalId:5,createdBy:'Idris Grant'},
    {id:201,title:'Design Q3 Sprint Planning Workshop',priority:'High',due:'2026-05-10',startDate:'2026-05-08',endDate:'2026-05-10',startTime:'10:00',endTime:'12:00',estimatedMins:120,context:'Deep Work',project:'LevelUp Platform',projectId:1,status:'Not Started',myDay:true,energy:'high',tags:['planning','leadership','sprint'],notes:'Prepare agenda, invite all team leads, set up Miro board for async pre-work. Goal: align on Q3 OKRs and define sprint 8 scope with clear acceptance criteria for each story.',recurring:'None',subtasks:[{id:1,title:'Draft workshop agenda',done:false},{id:2,title:'Send calendar invites',done:false},{id:3,title:'Set up Miro collaboration board',done:false},{id:4,title:'Prepare OKR alignment slides',done:false}],linkedGoalId:1,assignedTo:'Idris Grant',createdBy:'Idris Grant'},
    {id:202,title:'Competitive Analysis — Top 5 Productivity Apps',priority:'Medium',due:'2026-05-15',startDate:'2026-05-12',endDate:'2026-05-15',startTime:'09:00',endTime:'11:00',estimatedMins:180,context:'Research',project:'Second Brain Research',projectId:3,status:'Not Started',myDay:false,energy:'medium',tags:['research','strategy','competitive'],notes:'Analyze Notion, Obsidian, Roam, Logseq, and Mem.ai. Focus on: pricing, AI features, target persona, onboarding flow, and key differentiators. Produce a 1-page comparison matrix.',recurring:'None',subtasks:[{id:1,title:'Create comparison matrix template',done:false},{id:2,title:'Research Notion and Obsidian',done:false},{id:3,title:'Research Roam, Logseq, Mem.ai',done:false},{id:4,title:'Write executive summary',done:false}],linkedGoalId:null,assignedTo:'Marcus Webb',createdBy:'Marcus Webb'},
    {id:203,title:'Prepare Monthly Stakeholder Report',priority:'High',due:'2026-04-30',startDate:'2026-04-28',endDate:'2026-04-30',startTime:'14:00',endTime:'16:00',estimatedMins:90,context:'Admin',project:'Fundraising',projectId:2,status:'In Progress',myDay:true,energy:'medium',tags:['reporting','investors','monthly'],notes:'Include: MRR growth, user acquisition metrics, key product milestones, burn rate, and 30-day outlook. Use the standard investor update template. Send by April 30 EOD.',recurring:'Monthly',subtasks:[{id:1,title:'Pull metrics from dashboard',done:true},{id:2,title:'Write narrative summary',done:false},{id:3,title:'Format with template',done:false},{id:4,title:'Review with Priya before sending',done:false}],linkedGoalId:2,assignedTo:'Idris Grant',createdBy:'Idris Grant'},
  ],
  notes: JSON.parse(localStorage.getItem('lu_notes') || (localStorage.getItem('lu_session') ? '[]' : 'null')) || [
    {id:1,title:'LevelUp Vision & Core Principles',tags:['vision','product'],source:'Manual',updated:'Just now',starred:true,body:'LevelUp is a personal operating system for ambitious builders. Core principles: capture everything, process daily, connect ideas, act with intention.',createdBy:'Idris Grant'},
    {id:2,title:'Second Brain Architecture Notes',tags:['second-brain','architecture'],source:'Meeting Notes',updated:'1h ago',starred:false,body:'PARA method adapted for LevelUp: Projects (active), Areas (ongoing), Resources (reference), Archive (inactive). Each node links to tasks and goals.',createdBy:'Idris Grant'},
    {id:3,title:'AI Integration Research',tags:['research','ai'],source:'Web Clipper',updated:'3h ago',starred:true,body:'Key AI use cases for personal productivity: smart capture parsing, proactive nudges, pattern detection in journal entries, suggested daily plans.',createdBy:'Marcus Webb'},
    {id:4,title:'Fundraising Narrative – Draft 2',tags:['fundraising','pitch'],source:'Manual',updated:'Yesterday',starred:false,body:'Problem: knowledge workers lose 30% of time to context switching. Solution: LevelUp unifies tasks, notes, goals and surfaces what matters most.',createdBy:'Idris Grant'},
    {id:5,title:'Advisory Board Prep Notes',tags:['meetings','strategy'],source:'Manual',updated:'Yesterday',starred:false,body:'Key questions to address: GTM timeline, AI differentiation, pricing model, enterprise vs. prosumer focus.',createdBy:'Priya Nair'},
    {id:6,title:'Book Notes – Building a Second Brain',tags:['books','productivity'],source:'Manual',updated:'2d ago',starred:true,body:'Tiago Forte: CODE method — Capture, Organize, Distill, Express. Progressive summarization for note refinement. Projects should always have a next action.',createdBy:'Idris Grant'},
    {id:7,title:'Sprint 7 Retrospective',tags:['engineering','process'],source:'Meeting Notes',updated:'3d ago',starred:false,body:'Velocity: 42 points. Blockers: auth flow complexity. Wins: search indexing 3x faster. Next sprint focus: mobile responsiveness and offline mode.',createdBy:'Priya Nair'},
    {id:8,title:'Personal Brand Strategy',tags:['marketing','personal'],source:'Manual',updated:'3d ago',starred:false,body:'Positioning: builder who ships. Channels: LinkedIn (thought leadership), X (product updates), newsletter (weekly reflection). Cadence: 3x/week.',createdBy:'Marcus Webb'},
  ],
  projects: JSON.parse(localStorage.getItem('lu_projects') || 'null') || [
    {id:1,name:'LevelUp Platform',color:'#3B82F6',status:'Active',due:'Jun 30',pct:55,desc:'Core app development — tasks, notes, goals, AI assistant.'},
    {id:2,name:'Fundraising',color:'#8B5CF6',status:'Active',due:'Jul 15',pct:35,desc:'Seed round preparation: deck, data room, investor outreach.'},
    {id:3,name:'Second Brain Research',color:'#F59E0B',status:'Active',due:'May 31',pct:70,desc:'Research synthesis for AI-powered knowledge linking feature.'},
    {id:4,name:'Personal Brand',color:'#10B981',status:'Active',due:'Ongoing',pct:45,desc:'LinkedIn, newsletter, and X presence for LevelUp launch.'},
    {id:5,name:'Advisory Board Setup',color:'#EF4444',status:'Active',due:'Jun 10',pct:60,desc:'Recruit 3 advisors, define engagement model.'},
    {id:6,name:'Mobile MVP',color:'#06B6D4',status:'Not Started',due:'Aug 1',pct:10,desc:'React Native port of core LevelUp screens.'},
  ],
  goals: JSON.parse(localStorage.getItem('lu_goals') || 'null') || [
    {id:1,icon:'🚀',title:'Ship LevelUp v1.0',target:'Public launch by Jul 31',pct:55,category:'Work',startDate:'2025-01-01',dueDate:'2025-07-31',linkedTaskIds:[1,2,4,5],milestones:[
      {id:1,title:'MVP feature complete',done:true,due:'2025-04-30'},
      {id:2,title:'Beta launch to 100 users',done:false,due:'2025-06-15'},
      {id:3,title:'Public v1.0 launch',done:false,due:'2025-07-31'},
    ]},
    {id:2,icon:'💰',title:'Close seed round',target:'$500K by Aug 1',pct:30,category:'Work',startDate:'2025-03-01',dueDate:'2025-08-01',linkedTaskIds:[3,7],milestones:[
      {id:1,title:'Deck finalized',done:true,due:'2025-04-01'},
      {id:2,title:'10 investor meetings',done:false,due:'2025-06-30'},
      {id:3,title:'Term sheet signed',done:false,due:'2025-08-01'},
    ]},
    {id:3,icon:'📚',title:'Read 24 books this year',target:'9 of 24 done',pct:38,category:'Learning',startDate:'2025-01-01',dueDate:'2025-12-31',linkedTaskIds:[],milestones:[
      {id:1,title:'6 books by Q1',done:true,due:'2025-03-31'},
      {id:2,title:'12 books by mid-year',done:false,due:'2025-06-30'},
      {id:3,title:'24 books by year-end',done:false,due:'2025-12-31'},
    ]},
    {id:4,icon:'🏃',title:'Run 500 miles this year',target:'195 of 500',pct:39,category:'Health',startDate:'2025-01-01',dueDate:'2025-12-31',linkedTaskIds:[],milestones:[
      {id:1,title:'100 miles',done:true,due:'2025-03-31'},
      {id:2,title:'250 miles',done:false,due:'2025-06-30'},
      {id:3,title:'500 miles',done:false,due:'2025-12-31'},
    ]},
    {id:5,icon:'✍️',title:'Publish 50 posts',target:'18 of 50 published',pct:36,category:'Personal Brand',startDate:'2025-01-01',dueDate:'2025-12-31',linkedTaskIds:[8],milestones:[
      {id:1,title:'10 posts published',done:true,due:'2025-03-31'},
      {id:2,title:'25 posts published',done:false,due:'2025-06-30'},
      {id:3,title:'50 posts published',done:false,due:'2025-12-31'},
    ]},
  ],
  journal: JSON.parse(localStorage.getItem('lu_journal') || (localStorage.getItem('lu_session') ? '[]' : 'null')) || [
    {id:1,date:'Today · Monday, May 19',title:'Morning Reflection',body:'Feeling sharp. Prioritized the requirements doc and the investor follow-ups. The demo prep is the big unlock this week.',mood:'😊'},
    {id:2,date:'Yesterday · Sunday, May 18',title:'Weekly Review',body:'Shipped 19 tasks. Biggest win: got the search feature working end-to-end. Biggest miss: skipped two deep work blocks. Next week: protect mornings.',mood:'🙂'},
    {id:3,date:'May 17 · Saturday',title:'Gratitude',body:'Grateful for the team — they shipped the auth refactor without me having to micromanage. That trust is everything.',mood:'😊'},
    {id:4,date:'May 16 · Friday',title:'End of Week',body:'Tired but good tired. The advisory board call went better than expected. Two potential advisors said yes.',mood:'😫'},
  ],
  habits: JSON.parse(localStorage.getItem('lu_habits') || 'null') || [
    {id:1,icon:'🧘',title:'Morning meditation',cadence:'Daily',streak:18,doneToday:true,startTime:'06:30',reminderTime:'06:25',category:'Mindfulness',notes:'10-minute guided session',linkedTaskId:null,createdBy:'Idris Grant'},
    {id:2,icon:'📖',title:'Read 20 pages',cadence:'Daily',streak:11,doneToday:true,startTime:'21:00',reminderTime:'20:55',category:'Learning',notes:'Non-fiction only. Log in reading tracker.',linkedTaskId:null,createdBy:'Idris Grant'},
    {id:3,icon:'🏃',title:'Daily run or walk',cadence:'Daily',streak:7,doneToday:false,startTime:'07:00',reminderTime:'06:55',category:'Health',notes:'Minimum 30 minutes. Track in Strava.',linkedTaskId:null,createdBy:'Idris Grant'},
    {id:4,icon:'✏️',title:'Journal entry',cadence:'Daily',streak:9,doneToday:false,startTime:'22:00',reminderTime:'21:55',category:'Reflection',notes:'Morning or evening. Min 5 minutes.',linkedTaskId:null,createdBy:'Idris Grant'},
    {id:5,icon:'💻',title:'Deep work block (2h)',cadence:'Daily',streak:5,doneToday:false,startTime:'09:00',reminderTime:'08:55',category:'Productivity',notes:'No meetings, no Slack. Full focus.',linkedTaskId:null,createdBy:'Priya Nair'},
    {id:6,icon:'💪',title:'Strength training',cadence:'3xd7/week',streak:4,doneToday:false,startTime:'07:30',reminderTime:'07:25',category:'Health',notes:'Mon / Wed / Fri. 45 min sessions.',linkedTaskId:null,createdBy:'Marcus Webb'},
  ],
  teams: JSON.parse(localStorage.getItem('lu_teams') || 'null') || [
    {id:1,name:'LevelUp Core Team',members:[
      {id:1,userId:1,name:'Owner',email:'',role:'Owner',color:'#3B82F6',perms:{tasks:true,notes:true,projects:true,goals:true,journal:true,settings:true,mail:true,calendar:true,habits:true,coach:true}},
    ]},
  ],
  aiTopics: JSON.parse(localStorage.getItem('lu_aiTopics') || 'null') || ['Technology','World News'],
  aiMessages: [],
  ideas: JSON.parse(localStorage.getItem('lu_ideas') || 'null') || [
    {id:1,title:'AI-powered daily briefing tool',description:'A tool that synthesizes your tasks, notes, and calendar into a 5-minute morning briefing.',idea_type:'tool_to_build',stage:'develop',goal_id:1,ice_impact:8,ice_confidence:6,ice_ease:5,ai_ice_impact:7,ai_ice_confidence:5,ai_ice_ease:6,ai_ice_rationale:'High impact if users adopt it daily, but confidence is moderate given complexity of synthesis.',kill_reason:null,parked_review_date:null,promoted_project_id:null,spark_at:'2026-04-10T09:00:00Z',develop_at:'2026-04-12T10:00:00Z',stress_test_at:null,verdict_at:null,answers:[{stage:'spark',question_key:'one_sentence',body:'A tool that reads your second brain and delivers a personalized morning briefing.'},{stage:'spark',question_key:'who_for',body:'Ambitious builders who use LevelUp and want to start each day with clarity.'},{stage:'develop',question_key:'problem_evidence',body:'Users report spending 15-20 min each morning manually reviewing tasks and notes.'},{stage:'develop',question_key:'workaround',body:'Manual review of Notion/Obsidian, or just winging it.'}],collaborators:[],comments:[],votes:[],checkIns:[],createdBy:'Idris Grant',createdAt:'2026-04-10T09:00:00Z',updatedAt:'2026-04-12T10:00:00Z'},
    {id:2,title:'Weekly team async standup bot',description:'Automate weekly async standups via a bot that collects updates and synthesizes them.',idea_type:'process_change',stage:'stress_test',goal_id:null,ice_impact:6,ice_confidence:7,ice_ease:7,ai_ice_impact:6,ai_ice_confidence:7,ai_ice_ease:8,ai_ice_rationale:'Moderate impact, high ease — many existing tools do this. Differentiation is unclear.',kill_reason:null,parked_review_date:null,promoted_project_id:null,spark_at:'2026-04-05T08:00:00Z',develop_at:'2026-04-07T09:00:00Z',stress_test_at:'2026-04-15T11:00:00Z',verdict_at:null,answers:[],collaborators:[],comments:[],votes:[],checkIns:[],createdBy:'Priya Nair',createdAt:'2026-04-05T08:00:00Z',updatedAt:'2026-04-15T11:00:00Z'},
    {id:3,title:'Publish a "Building in Public" newsletter',description:'Weekly newsletter documenting the LevelUp build journey — decisions, metrics, lessons.',idea_type:'content',stage:'verdict',goal_id:5,ice_impact:7,ice_confidence:8,ice_ease:7,ai_ice_impact:8,ai_ice_confidence:7,ai_ice_ease:7,ai_ice_rationale:'Strong brand-building play with compounding returns. Effort is manageable at 2h/week.',kill_reason:null,parked_review_date:null,promoted_project_id:4,spark_at:'2026-03-20T10:00:00Z',develop_at:'2026-03-22T09:00:00Z',stress_test_at:'2026-03-28T14:00:00Z',verdict_at:'2026-04-01T10:00:00Z',verdict_outcome:'promoted',answers:[],collaborators:[],comments:[],votes:[],checkIns:[],createdBy:'Idris Grant',createdAt:'2026-03-20T10:00:00Z',updatedAt:'2026-04-01T10:00:00Z'},
  ],
  contacts: JSON.parse(localStorage.getItem('lu_contacts') || 'null') || [
    {id:1,name:'Sarah Chen',title:'VP of Product',company:'Notion',email:'sarah.chen@notion.so',phone:'+1 415 555 0101',linkedin:'linkedin.com/in/sarahchen',location:'San Francisco, CA',tags:['investor-prospect','product'],notes:'Met at ProductConf 2026. Interested in LevelUp for enterprise.',enriched:false,enrichedAt:null},
    {id:2,name:'Marcus Rivera',title:'Partner',company:'Sequoia Capital',email:'m.rivera@sequoiacap.com',phone:'',linkedin:'linkedin.com/in/marcusrivera',location:'Menlo Park, CA',tags:['investor','vip'],notes:'Warm intro via James. Follow up after Q2 metrics.',enriched:false,enrichedAt:null},
    {id:3,name:'Priya Kapoor',title:'Head of Engineering',company:'Linear',email:'priya@linear.app',phone:'+1 650 555 0203',linkedin:'linkedin.com/in/priyakapoor',location:'New York, NY',tags:['partnership','engineering'],notes:'Exploring API integration between Linear and LevelUp tasks.',enriched:false,enrichedAt:null},
    {id:4,name:'David Park',title:'Founder & CEO',company:'Reflect Notes',email:'david@reflect.app',phone:'',linkedin:'linkedin.com/in/davidpark',location:'Austin, TX',tags:['competitor','founder'],notes:'Competitor analysis. Friendly relationship. Possible co-marketing.',enriched:false,enrichedAt:null},
    {id:5,name:'Aisha Johnson',title:'Director of Partnerships',company:'Atlassian',email:'aisha.j@atlassian.com',phone:'+1 212 555 0305',linkedin:'linkedin.com/in/aishajohnson',location:'New York, NY',tags:['partnership','enterprise'],notes:'Exploring Jira integration. Decision maker for partner program.',enriched:false,enrichedAt:null},
    {id:6,name:'Tom Nakamura',title:'Angel Investor',company:'Independent',email:'tom@nakamura.vc',phone:'',linkedin:'linkedin.com/in/tomnakamura',location:'Seattle, WA',tags:['investor','angel'],notes:'$50K check size. Focus on productivity tools. Intro from Sarah.',enriched:false,enrichedAt:null},
    {id:7,name:'Elena Vasquez',title:'Product Designer',company:'Figma',email:'elena.v@figma.com',phone:'+1 415 555 0407',linkedin:'linkedin.com/in/elenavasquez',location:'San Francisco, CA',tags:['design','advisor'],notes:'Potential design advisor. Loves the UX direction of LevelUp.',enriched:false,enrichedAt:null},
    {id:8,name:'James Okafor',title:'CTO',company:'Coda',email:'james@coda.io',phone:'',linkedin:'linkedin.com/in/jamesokafor',location:'San Francisco, CA',tags:['technical','partnership'],notes:'Discussed API collaboration. Coda has complementary use cases.',enriched:false,enrichedAt:null},
  ],
  clusters: JSON.parse(localStorage.getItem('lu_clusters') || 'null') || [
    {id:1,name:'LevelUp Build',icon:'🚀',color:'#3B82F6',owner:'Idris Grant',collaborators:[],projectIds:[1,2],pct:0,createdAt:'2026-01-01'},
    {id:2,name:'Physical Transformation',icon:'💪',color:'#10B981',owner:'Idris Grant',collaborators:[],projectIds:[],pct:0,createdAt:'2026-01-01'},
    {id:3,name:'House Remodel',icon:'🏠',color:'#F59E0B',owner:'Idris Grant',collaborators:[],projectIds:[],pct:0,createdAt:'2026-02-01'},
  ],
  // Portfolio layer above projects. Each program groups multiple projects so
  // company / business-line rollups become a first-class view. Seeded with
  // CommunityForce + LSI Media for the COO/CEO use case; user can add more.
  programs: JSON.parse(localStorage.getItem('lu_programs') || 'null') || [
    {id:1,name:'CommunityForce',icon:'📊',color:'#1f6feb',owner:'Idris Grant',status:'Active',description:'COO scope: all CF workstreams (federal services + awards platform + Salesforce practice).',projectIds:[],createdAt:'2026-01-01'},
    {id:2,name:'LSI Media',icon:'💜',color:'#9333ea',owner:'Idris Grant',status:'Active',description:'CEO scope: oversight only — day-to-day handled by team.',projectIds:[],createdAt:'2026-01-01'},
    {id:3,name:'Personal',icon:'🏠',color:'#10b981',owner:'Idris Grant',status:'Active',description:'Personal projects, home, learning.',projectIds:[],createdAt:'2026-01-01'},
  ],
  creds: JSON.parse(localStorage.getItem('lu_creds') || '{}'),
  prefs: JSON.parse(localStorage.getItem('lu_prefs') || '{"darkMode":true,"compact":false,"accent":"#3B82F6"}'),
  // External tasks pulled from Smartsheet / NiftyPM by the server cron. Read-only
  // mirror; the source tool is authoritative. Populated by loadExternalTasks()
  // on app boot + after manual refresh. Each row carries `_source` and `_url`
  // for the [CF]/[LSI] badge + deep-link.
  externalTasks: [],
  // Recent time entries (90d window). Populated by loadTimeEntries() on boot.
  // Shape: [{id, userId, taskId, source, startedAt, endedAt, durationMins, note, createdAt}].
  timeEntries: [],
  // Sales pipeline opportunities. Stored in user_app_data.opportunities as
  // JSON. Each row: {id, name, accountName, stage, value, probability,
  // closeDate, owner, contact, notes, status:'open'|'won'|'lost',
  // linkedTaskIds:[], source:'manual'|'smartsheet', sourceConfigId,
  // externalId, createdAt, updatedAt}. Linked tasks reference back via
  // task.linkedOpportunityId. Pulled from Smartsheet pipeline-shaped sheets
  // (Stage + Value columns) by the same cron path that auto-creates projects.
  opportunities: JSON.parse(localStorage.getItem('lu_opportunities')||'[]'),
};
// Pipeline stage definitions. Order matters — used for Kanban column order
// and stage progression. Probability is the default win-rate for a deal at
// this stage (drives the weighted-forecast number).
const _PIPELINE_STAGES=[
  {key:'Lead',         label:'Lead',         color:'#94a3b8', probability:10},
  {key:'Qualified',    label:'Qualified',    color:'#3b82f6', probability:25},
  {key:'Proposal',     label:'Proposal',     color:'#a855f7', probability:50},
  {key:'Negotiation',  label:'Negotiation',  color:'#f59e0b', probability:75},
  {key:'On-Hold',      label:'On-Hold',      color:'#64748b', probability:0},
  {key:'Closed Won',   label:'Closed Won',   color:'#10b981', probability:100, terminal:true, outcome:'won'},
  {key:'Closed Lost',  label:'Closed Lost',  color:'#ef4444', probability:0,   terminal:true, outcome:'lost'},
];
// Tolerate slash / hyphen / case variants from Smartsheet picklists.
//   "Closed/Won"  → matches "Closed Won"
//   "On Hold"     → matches "On-Hold"
//   "closed lost" → matches "Closed Lost"
// Hyphens too: "On-Hold" used to fall back to Lead at 10% (the server's
// canonicalise already handled them).
function _normStage(s){return String(s||'').replace(/[\/_-]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();}
function _stageDef(key){
  if(!key)return _PIPELINE_STAGES[0];
  const norm=_normStage(key);
  const hit=_PIPELINE_STAGES.find(s=>_normStage(s.key)===norm||_normStage(s.label)===norm);
  return hit||_PIPELINE_STAGES[0];
}
function save(k){localStorage.setItem('lu_'+k,JSON.stringify(D[k]))}

// ─── External tasks (Smartsheet + NiftyPM) ──────────────────────────────────
// Loaded from /api/trpc/externalSources.listExternalTasks. Source-owned fields
// (title, due, status, assignee, url) are read-only here; local overlay
// (myDay flag, localPriority, localNote) lives in row.override.
// Recent time-entry rows from the server. Same independent-failure pattern
// as loadExternalTasks. Cached on D.timeEntries — used by Command Center
// time tile, the WIDGET_SOURCES.time reports source, and the per-project
// time rollup. 90d window keeps the cache compact while still covering
// month-over-month widgets.
async function loadTimeEntries(){
  try{
    const rows=await _trpc('timeEntries.listRecent',{sinceDays:90},'query');
    D.timeEntries=Array.isArray(rows)?rows:[];
    if(typeof renderScreen==='function'&&typeof curScreen!=='undefined'&&curScreen==='command')renderScreen('command');
    return D.timeEntries.length;
  }catch(e){
    if(window.__DEV__)console.warn('[timeEntries] load failed:',e.message||e);
    return 0;
  }
}
async function loadExternalTasks(){
  try{
    const rows=await _trpc('externalSources.listExternalTasks',{includeRemoved:false},'query');
    D.externalTasks=Array.isArray(rows)?rows:[];
    // Invalidate the Cmd+K search index so the next palette open includes
    // the updated external rows.
    if(typeof invalidateSearchIndex==='function')invalidateSearchIndex();
    if(typeof _topbarSyncTooltipUpdate==='function')_topbarSyncTooltipUpdate();
    return D.externalTasks.length;
  }catch(e){
    // No network / no tables / user not signed in — fine, just leave empty.
    if(window.__DEV__)console.warn('[external] load failed:',e.message||e);
    return 0;
  }
}
// ── Push a native task TO Nifty (build -202) ───────────────────────────────
// The integration pulled from Nifty and pushed STATUS back; this creates a
// Nifty task from a LevelUp task with project, assignee, dates and status.
// After a verified create the local task is REMOVED by default (the task now
// lives in Nifty and syncs back as an external row like every other Nifty
// task) — with an Undo toast — or kept as a linked copy (t.pushedTo).
//   openPushToNiftyModal(taskId)   → one task
//   openPushToNiftyModal(null)     → every bulk-selected task
let _niftyPush={ids:[],projects:[],watches:[],meta:{}};
function _niftyPlainText(html){
  const s=String(html||'');
  if(!/<[a-z][\s\S]*>/i.test(s))return s.trim();
  const d=luParseInert(s);return (d.textContent||'').trim();
}
async function openPushToNiftyModal(taskId){
  const ids=taskId!=null?[taskId]:Array.from(_bulkSelected||[]);
  const tasks=ids.map(id=>D.tasks.find(t=>String(t.id)===String(id))).filter(Boolean);
  if(!tasks.length){toast('Select at least one task first');return;}
  _niftyPush.ids=tasks.map(t=>t.id);
  const mc=document.getElementById('modal-content');if(!mc)return;
  mc.innerHTML=`<div style="padding:16px;max-width:520px"><h3 style="font-size:15px;font-weight:700;margin-bottom:8px">↗ Push to Nifty</h3><div style="font-size:12px;color:var(--t3)">Loading your Nifty projects…</div></div>`;
  document.getElementById('modal-capture').classList.add('show');document.body.style.overflow='hidden';
  let projects=[],watches=[];
  try{
    const [p,w]=await Promise.all([_trpc('externalSources.listNiftyProjects',undefined,'query'),_trpc('externalSources.listNiftyWatches',undefined,'query').catch(()=>[])]);
    projects=Array.isArray(p)?p:[];watches=Array.isArray(w)?w:[];
  }catch(e){
    mc.innerHTML=`<div style="padding:16px;max-width:520px"><h3 style="font-size:15px;font-weight:700;margin-bottom:8px">↗ Push to Nifty</h3>
      <div style="font-size:12px;color:var(--t2);line-height:1.5">Nifty isn't connected for your account yet.<br><span style="color:var(--t3)">${esc(String(e&&e.message||e).slice(0,160))}</span></div>
      <div class="dr-actions" style="margin-top:12px"><button class="btn btn-p" onclick="closeModal();nav('settings');setTimeout(()=>{try{const el=[...document.querySelectorAll('#s-settings .si')].find(e=>/sp-5/.test(e.getAttribute('onclick')||''));if(el)showSetTab(el,'sp-5');}catch(_){}},350)">Open Settings → Integrations</button><button class="btn btn-s" onclick="closeModal()">Close</button></div></div>`;
    return;
  }
  if(!projects.length){mc.querySelector('div>div').textContent='No Nifty projects found for this account.';return;}
  _niftyPush.projects=projects;_niftyPush.watches=watches;
  const watchedIds=new Set(watches.map(w=>String(w.projectId)));
  // Default project: the watch whose LevelUp default project matches this task's project, else the first watched one.
  const single=tasks.length===1?tasks[0]:null;
  let defaultPid=null;
  if(single&&single.projectId){const w=watches.find(w=>String(w.defaultProjectId)===String(single.projectId));if(w)defaultPid=String(w.projectId);}
  if(!defaultPid){const w=watches[0];defaultPid=w?String(w.projectId):String(projects[0].id);}
  const sorted=projects.slice().sort((a,b)=>(watchedIds.has(String(b.id))?1:0)-(watchedIds.has(String(a.id))?1:0)||String(a.name).localeCompare(String(b.name)));
  const projOpts=sorted.map(p=>`<option value="${esc(String(p.id))}" ${String(p.id)===defaultPid?'selected':''}>${watchedIds.has(String(p.id))?'★ ':''}${esc(p.name)}</option>`).join('');
  const title=single?single.title:`${tasks.length} selected tasks`;
  mc.innerHTML=`<div style="padding:16px;max-width:560px">
    <h3 style="font-size:15px;font-weight:700;margin-bottom:4px">↗ Push to Nifty</h3>
    <div style="font-size:11px;color:var(--t3);margin-bottom:12px">${single?'Creates this task in NiftyPM.':'Creates one Nifty task per selected task with the same project, assignee and status.'} ★ = a project you already sync.</div>
    <div class="field"><label>Nifty project</label><select class="inp" id="np-project" onchange="_niftyPushLoadMeta(this.value)">${projOpts}</select></div>
    ${single?`<div class="field"><label>Name</label><input class="inp" id="np-name" value="${esc(single.title||'')}"></div>
    <div class="field"><label>Description</label><textarea class="inp" id="np-desc" rows="3" style="resize:vertical">${esc(_niftyPlainText(single.notes||''))}</textarea></div>`
    :`<div class="field"><label>Tasks</label><div style="font-size:12px;color:var(--t2);max-height:120px;overflow:auto;border:1px solid var(--bd1);border-radius:6px;padding:6px 8px">${tasks.map(t=>`• ${esc(t.title)}`).join('<br>')}</div></div>`}
    <div class="field-row">
      <div class="field" style="flex:1"><label>Assignee</label><select class="inp" id="np-assignee"><option value="">Loading…</option></select></div>
      <div class="field" style="flex:1"><label>Status / list</label><select class="inp" id="np-status"><option value="">Loading…</option></select></div>
    </div>
    <div class="field-row">
      <div class="field" style="flex:1"><label>Due date${single?'':' <span style="font-weight:400;color:var(--t3)">(blank = each task\'s own)</span>'}</label><input class="inp" type="date" id="np-due" value="${esc(single?(single.due||''):'')}"></div>
      <div class="field" style="flex:1"><label>Start date</label><input class="inp" type="date" id="np-start" value="${esc(single?(single.startDate||''):'')}"></div>
    </div>
    <div class="field"><label>After pushing</label>
      <label style="display:flex;gap:8px;align-items:flex-start;font-size:12px;cursor:pointer;margin:4px 0"><input type="radio" name="np-after" value="move" checked style="margin-top:2px"><span><b>Move</b> — remove the local copy; the task syncs back from Nifty like your other Nifty tasks <span style="color:var(--t3)">(undoable from the toast)</span></span></label>
      <label style="display:flex;gap:8px;align-items:flex-start;font-size:12px;cursor:pointer;margin:4px 0"><input type="radio" name="np-after" value="keep" style="margin-top:2px"><span><b>Keep a linked copy</b> — the local task stays and shows a Nifty badge</span></label>
    </div>
    <div id="np-status-line" style="font-size:11px;color:var(--t3);min-height:14px"></div>
    <div class="dr-actions" style="margin-top:10px">
      <button class="btn btn-p" id="np-go" onclick="_niftyPushSubmit()">↗ Push ${single?'to Nifty':tasks.length+' tasks'}</button>
      <button class="btn btn-s" onclick="closeModal()">Cancel</button>
    </div>
  </div>`;
  _niftyPushLoadMeta(defaultPid);
}
async function _niftyPushLoadMeta(projectId){
  const aSel=document.getElementById('np-assignee'),sSel=document.getElementById('np-status'),line=document.getElementById('np-status-line');
  if(!aSel||!sSel)return;
  aSel.innerHTML='<option value="">Loading…</option>';sSel.innerHTML='<option value="">Loading…</option>';
  let meta=_niftyPush.meta[projectId];
  if(!meta){
    try{meta=await _trpc('externalSources.niftyProjectMeta',{projectId:String(projectId)},'query');_niftyPush.meta[projectId]=meta;}
    catch(e){meta={statuses:[],members:[],error:String(e&&e.message||e)};}
  }
  if(document.getElementById('np-project')&&document.getElementById('np-project').value!==String(projectId))return; // user changed project meanwhile
  const members=meta.members||[],statuses=meta.statuses||[];
  const me=members.find(m=>/\(me\)$/.test(m.name));
  aSel.innerHTML='<option value="">Unassigned</option>'+members.map(m=>`<option value="${esc(String(m.id))}" ${me&&m.id===me.id?'selected':''}>${esc(m.name)}</option>`).join('');
  sSel.innerHTML='<option value="">Project default</option>'+statuses.map(s=>`<option value="${esc(String(s.id))}">${esc(s.name)}</option>`).join('');
  if(line)line.textContent=meta.error?('Could not load project details: '+meta.error.slice(0,120)):(members.length?`${members.length} assignable member${members.length===1?'':'s'}${meta.membersVia?'':' (from tasks already synced)'} · ${statuses.length} status${statuses.length===1?'':'es'}`:'No members returned for this project — the task will be unassigned unless you pick one');
}
async function _niftyPushSubmit(){
  const g=id=>document.getElementById(id);
  const projectId=g('np-project')&&g('np-project').value;
  if(!projectId){toast('Pick a Nifty project');return;}
  const tasks=_niftyPush.ids.map(id=>D.tasks.find(t=>String(t.id)===String(id))).filter(Boolean);
  if(!tasks.length){closeModal();return;}
  const single=tasks.length===1?tasks[0]:null;
  const assignee=g('np-assignee')&&g('np-assignee').value||'';
  const statusId=g('np-status')&&g('np-status').value||'';
  const due=g('np-due')&&g('np-due').value||'';
  const start=g('np-start')&&g('np-start').value||'';
  const after=(document.querySelector('input[name="np-after"]:checked')||{}).value||'move';
  const btn=g('np-go');if(btn){btn.disabled=true;btn.textContent='Pushing…';}
  const line=g('np-status-line');
  const project=(_niftyPush.projects||[]).find(p=>String(p.id)===String(projectId));
  const results=[];
  for(let i=0;i<tasks.length;i++){
    const t=tasks[i];
    if(line)line.textContent=`Pushing ${i+1} of ${tasks.length}: ${t.title.slice(0,50)}…`;
    const payload={projectId:String(projectId),name:single?(g('np-name').value.trim()||t.title):t.title,description:single?(g('np-desc').value||''):_niftyPlainText(t.notes||''),
      dueDate:due||t.due||undefined,startDate:start||t.startDate||undefined,assignedTo:assignee?[assignee]:undefined,statusId:statusId||undefined};
    Object.keys(payload).forEach(k=>{if(payload[k]===undefined||payload[k]==='')delete payload[k];});
    try{const r=await _trpc('externalSources.niftyCreateTask',payload,'mutation');results.push({t,r});}
    catch(e){results.push({t,r:{ok:false,error:String(e&&e.message||e)}});}
  }
  const okRes=results.filter(x=>x.r&&x.r.ok),bad=results.filter(x=>!(x.r&&x.r.ok));
  const removed=[];
  okRes.forEach(({t,r})=>{
    if(after==='move'){const i=D.tasks.indexOf(t);if(i>=0){removed.push({t,i});D.tasks.splice(i,1);}}
    else{t.pushedTo={source:'nifty',externalId:r.id,url:r.url||null,projectId:String(projectId),projectName:project?project.name:'',at:new Date().toISOString(),verified:!!r.verified};}
  });
  if(okRes.length)save('tasks');
  closeModal();
  if(okRes.length){
    const first=okRes[0].r;
    const actions=[];
    if(first.url)actions.push({label:'Open in Nifty',onClick:()=>window.open(first.url,'_blank','noopener')});
    if(removed.length)actions.push({label:'Undo (restore local copy)',onClick:()=>{removed.sort((a,b)=>a.i-b.i).forEach(({t,i})=>D.tasks.splice(Math.min(i,D.tasks.length),0,t));save('tasks');try{renderCurrentTaskView();}catch(_){}toast('Local copy restored — the Nifty task still exists');}});
    const droppedAll=[...new Set(okRes.flatMap(x=>x.r.dropped||[]))];
    const droppedNote=droppedAll.length?` ⚠ Nifty refused ${droppedAll.map(d=>d==='assignees'?'the assignee':d==='task_group'?'the list':d.replace('_',' ')).join(', ')} — set ${droppedAll.length===1?'it':'them'} in Nifty.`:'';
    toast({type:droppedAll.length?'warn':'success',title:`↗ ${okRes.length} task${okRes.length===1?'':'s'} created in Nifty${project?' · '+project.name:''}`,msg:(okRes.every(x=>x.r.verified)?'Verified by reading back. ':'Created (not yet readable back — check Nifty). ')+(after==='move'?'Local cop'+(okRes.length===1?'y':'ies')+' removed; syncing the Nifty copy now…':'Local copy kept and linked.')+droppedNote,actions,duration:droppedAll.length?14000:9000});
    try{await refreshExternalTasksNow();}catch(_){}
  }
  if(bad.length){
    const b=bad[0].r||{};
    toast({type:'error',title:`${bad.length} task${bad.length===1?'':'s'} not pushed`,msg:String(b.error||'Nifty rejected the request').slice(0,220)+(b.status?` (HTTP ${b.status})`:''),duration:12000});
    console.warn('[nifty push] failures',bad.map(x=>({task:x.t.title,result:x.r})));
  }
  if(_bulkSelected&&tasks.length>1)_bulkSelected.clear();
  try{renderCurrentTaskView();}catch(_){}
}
async function refreshExternalTasksNow(){
  _topbarSyncSpin(true);
  try{
    toast({type:'info',title:'Syncing NiftyPM…',duration:2000});
    const stats=await _trpc('externalSources.refreshNow',undefined,'mutation');
    await loadExternalTasks();
    // Hierarchical Smartsheet sync may have auto-created LevelUp projects on
    // the server side (writes to user_app_data.projects). Reload that blob
    // so D.projects matches what's in the DB and the new projects show up
    // in the Projects page + drawer pickers + Command Center tiles.
    const projectsCreated=Number(stats&&stats.projectsCreated)||0;
    if(projectsCreated>0&&typeof loadServerData==='function'){
      try{await loadServerData();}catch(_){/* fine */}
    }
    const noneConfigured=stats.sheetsProcessed===0&&stats.projectsProcessed===0;
    const extra=projectsCreated>0?` · +${projectsCreated} project${projectsCreated===1?'':'s'} auto-created`:'';
    toast({type:noneConfigured?'info':'success',title:noneConfigured?'No sources configured — Settings → Integrations to set up':`✓ Synced ${stats.sheetsProcessed} sheet(s), ${stats.projectsProcessed} project(s)${extra}`,duration:projectsCreated>0?4500:3000});
    if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
    D.prefs=D.prefs||{};
    D.prefs.lastExternalSyncAt=new Date().toISOString();
    save('prefs');
    _topbarSyncTooltipUpdate();
  }catch(e){
    toast({type:'warn',title:'Sync failed',msg:e.message||String(e),duration:4500});
  }finally{_topbarSyncSpin(false);}
}

// Targeted resync for one auto-synced project. Uses the per-sheet endpoint
// (refreshOneSource) when the project carries a sourceConfigId, so a single
// sheet refreshes in ~1s instead of waiting for every watched sheet. Falls
// back to refreshExternalTasksNow when the provenance is incomplete.
async function _resyncProjectSource(pid){
  const p=(D.projects||[]).find(x=>String(x.id)===String(pid));
  if(!p){toast({type:'warn',title:'Project not found'});return;}
  const src=p.autoSyncSource||{};
  const label=src.sheetName||p.name;
  _topbarSyncSpin(true);
  try{
    if(src.source&&src.sourceConfigId){
      toast({type:'info',title:`↻ Resyncing "${label}"…`,duration:1800});
      const stats=await _trpc('externalSources.refreshOneSource',{source:src.source,sourceConfigId:src.sourceConfigId},'mutation');
      await loadExternalTasks();
      // If any new projects were created (unlikely for a single sheet) reload appData.
      if(Number(stats&&stats.projectsCreated)>0&&typeof loadServerData==='function'){
        try{await loadServerData();}catch(_){}
      }
      D.prefs=D.prefs||{};D.prefs.lastExternalSyncAt=new Date().toISOString();save('prefs');
      _topbarSyncTooltipUpdate();
      toast({type:'success',title:`✓ "${label}" resynced`,duration:2200});
    }else{
      // No sourceConfigId on the project (older auto-created records, or
      // hand-built projects) — fall back to the full refresh.
      await refreshExternalTasksNow();
    }
  }catch(e){
    toast({type:'warn',title:'Resync failed',msg:e.message||String(e),duration:4000});
  }finally{
    _topbarSyncSpin(false);
  }
  // Re-open the drawer so the new task counts + health strip reflect the
  // fresh pull.
  setTimeout(()=>{ if(typeof openProjectDetail==='function')openProjectDetail(pid); },300);
}
// ─── Top-header Sync button — global accessor + spinner + tooltip ─────────
function _topbarSyncNow(){
  if(typeof refreshExternalTasksNow==='function')refreshExternalTasksNow();
}
function _topbarSyncSpin(on){
  const btn=document.getElementById('topbar-sync-btn');
  if(!btn)return;
  const svg=btn.querySelector('svg');
  if(svg){
    if(on){svg.style.animation='lu-spin 1s linear infinite';btn.style.color='var(--ac)';}
    else  {svg.style.animation='';btn.style.color='';}
  }
  const dot=document.getElementById('topbar-sync-dot');
  if(dot)dot.style.display=on?'none':((D.prefs&&D.prefs.lastExternalSyncAt)?'':'none');
}
function _topbarSyncTooltipUpdate(){
  const btn=document.getElementById('topbar-sync-btn');
  if(!btn)return;
  const last=D.prefs&&D.prefs.lastExternalSyncAt;
  const cfN=(Array.isArray(D.externalTasks)?D.externalTasks:[]).filter(t=>t.source==='smartsheet'&&!(t.override&&t.override.tombstoned)).length;
  const lsiN=(Array.isArray(D.externalTasks)?D.externalTasks:[]).filter(t=>t.source==='nifty'&&!(t.override&&t.override.tombstoned)).length;
  const sources=(cfN?1:0)+(lsiN?1:0);
  if(last){
    const ago=(Date.now()-_pd(last).getTime())/60000;
    const label=ago<2?'just now':ago<60?`${Math.floor(ago)}m ago`:ago<1440?`${Math.floor(ago/60)}h ago`:`${Math.floor(ago/1440)}d ago`;
    btn.title=`Sync NiftyPM · last pulled ${label} · ${cfN} CF + ${lsiN} LSI rows`;
    // Compact label visible beside the button on desktop.
    const lbl=document.getElementById('topbar-sync-label');
    if(lbl){lbl.style.display='';lbl.textContent=`synced ${label}${sources?' · '+sources+' src':''}`;}
  }else{
    btn.title='Sync NiftyPM — click to pull now';
    const lbl=document.getElementById('topbar-sync-label');
    if(lbl)lbl.style.display='none';
  }
  // Show the green dot only when at least one successful pull has happened.
  const dot=document.getElementById('topbar-sync-dot');
  if(dot)dot.style.display=last?'':'none';
}
// Inject spinner keyframes once.
(function(){
  if(typeof document==='undefined')return;
  if(document.getElementById('lu-spin-kf'))return;
  const s=document.createElement('style');s.id='lu-spin-kf';
  s.textContent='@keyframes lu-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
})();
// Refresh tooltip periodically so "5m ago" stays accurate.
setInterval(()=>{try{_topbarSyncTooltipUpdate();}catch{}}, 60000);
function _extSourceBadge(src){
  if(src==='smartsheet')return '<span style="display:inline-block;padding:1px 5px;border-radius:3px;background:#1f6feb;color:#fff;font-size:9px;font-weight:600;letter-spacing:.4px;margin-right:4px" title="From CommunityForce Smartsheet">CF</span>';
  if(src==='nifty')return '<span style="display:inline-block;padding:1px 5px;border-radius:3px;background:#9333ea;color:#fff;font-size:9px;font-weight:600;letter-spacing:.4px;margin-right:4px" title="From LSI Media NiftyPM">LSI</span>';
  return '';
}
// Build a unified iterator: native tasks + non-tombstoned external tasks
// shaped to look enough like native tasks that existing render code can
// consume them. Used by My Day rendering and the daily cross-source widget.
function _unifiedTasks(opts){
  opts=opts||{};
  const includeExt=opts.includeExternal!==false;
  const out=D.tasks.map(t=>Object.assign({},t,{_source:'local'}));
  if(includeExt&&Array.isArray(D.externalTasks)){
    D.externalTasks.forEach(et=>{
      const ov=et.override||{};
      if(ov.tombstoned)return;
      out.push({
        id:'ext:'+et.source+':'+et.externalId,
        title:et.title,
        status:et.status||'Not Started',
        priority:ov.localPriority||et.priority,
        due:ov.localDue||et.due,
        assignee:et.assignee,
        project:et.projectLabel,
        myDay:!!ov.myDay,
        tags:(ov.localTags||'').split(',').filter(Boolean),
        notes:ov.localNote||et.description||'',
        _source:et.source,
        _url:et.externalUrl,
        _externalId:et.externalId,
        _readOnly:true,
      });
    });
  }
  return out;
}

// ─── Task Context (customizable dropdown) ────────────────────────────────────
// Stored in D.prefs.taskContexts so it rides with the prefs sync. Defaults
// cover both the legacy seed values and the user-suggested business buckets.
const _DEFAULT_TASK_CONTEXTS=['LSI Business','CF Business','Financial Personal','Deep Work','Admin','Calls','Learning','Creative','Personal','Inbox'];
function _getTaskContexts(){
  const arr=(D.prefs&&Array.isArray(D.prefs.taskContexts))?D.prefs.taskContexts.slice():null;
  if(arr&&arr.length)return arr;
  return _DEFAULT_TASK_CONTEXTS.slice();
}
function _renderContextSelect(id,current,className){
  const opts=_getTaskContexts();
  // Make sure the current value is in the list — if a task already had a
  // free-text context that no longer matches an option, keep it as a
  // "(current)" entry so we don't silently lose data.
  const cur=(current||'').trim();
  if(cur&&!opts.includes(cur))opts.unshift(cur);
  const html=opts.map(o=>`<option value="${esc(o)}" ${o===cur?'selected':''}>${esc(o)}</option>`).join('');
  return `<select class="${className||'inp'}" id="${id}"><option value="" ${!cur?'selected':''}>—</option>${html}</select>`;
}
function manageTaskContexts(){
  const m=document.getElementById('modal-content');if(!m)return;
  const list=_getTaskContexts();
  m.innerHTML=`
    <h2 style="font-size:15px;font-weight:600;margin-bottom:6px">⚙ Manage Task Contexts</h2>
    <p style="font-size:11px;color:var(--t2);margin-bottom:8px">Used as a category on each task — e.g. <em>LSI Business</em>, <em>Deep Work</em>, <em>Admin</em>. One per line.</p>
    <textarea id="ctx-mgr-list" class="inp" style="min-height:200px;font-size:12px;line-height:1.6;font-family:ui-monospace,monospace">${esc(list.join('\n'))}</textarea>
    <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
      <button class="btn btn-s" onclick="_resetTaskContexts()">↺ Reset to Defaults</button>
      <button class="btn btn-s" onclick="closeModal()">Cancel</button>
      <button class="btn btn-p" onclick="_saveTaskContexts()">💾 Save</button>
    </div>`;
  document.getElementById('modal-capture').classList.add('show');
}
function _saveTaskContexts(){
  const raw=document.getElementById('ctx-mgr-list')?.value||'';
  // Clean: trim + dedupe (case-insensitive, keep first occurrence)
  const seen=new Set();
  const arr=raw.split(/\r?\n/).map(l=>l.trim()).filter(l=>{
    if(!l)return false;
    const k=l.toLowerCase();
    if(seen.has(k))return false;
    seen.add(k);return true;
  });
  D.prefs=D.prefs||{};
  D.prefs.taskContexts=arr;
  save('prefs');
  closeModal();
  toast('✓ Saved '+arr.length+' context option'+(arr.length===1?'':'s'));
  // If a task drawer is currently open, refresh it so the dropdown rebuilds.
  if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
}
function _resetTaskContexts(){
  if(!confirm('Reset to the default set of contexts? Any custom additions will be removed.'))return;
  const ta=document.getElementById('ctx-mgr-list');
  if(ta)ta.value=_DEFAULT_TASK_CONTEXTS.join('\n');
}
function saveAll(){['tasks','notes','projects','goals','journal','habits','teams','aiTopics','ideas','contacts','mindmaps','clusters','prefs','opportunities'].forEach(k=>{try{(window.save||save)(k);}catch(_){localStorage.setItem('lu_'+k,JSON.stringify(D[k]));}});localStorage.setItem('lu_creds',JSON.stringify(D.creds))}
function applyPrefs(){
  document.body.classList.toggle('light-mode',D.prefs.darkMode===false);
  // Aurora Glass — ambient accent auras behind frosted surfaces. One class
  // drives the whole look (see the AURORA GLASS block in index.html), so it
  // can be switched off from Settings → Appearance without a deploy.
  // Default ON; only an explicit false opts out.
  document.body.classList.toggle('aurora',D.prefs.auroraGlass!==false);
  // Daybreak Pop — the light-mode counterpart: porcelain ground, ink text, and
  // accent-tinted card shadows. The CSS is scoped to body.light-mode.daybreak,
  // so this class is inert in dark mode. Default ON; only an explicit false opts out.
  document.body.classList.toggle('daybreak',D.prefs.daybreakPop!==false);
  _luApplyDaybreakCSS();
  // Chromatic Bento — Home dashboard widgets as deep-tinted colour tiles.
  // Works in both light and dark. Default ON; only an explicit false opts out.
  document.body.classList.toggle('bento',D.prefs.chromaticBento!==false);
  _luApplyBentoCSS();
  // Electric Ink — near-black ground, voltage accents in glows/borders/numerals.
  // Dark mode only (the CSS is scoped to body:not(.light-mode).electric) and
  // DEFAULT OFF, unlike the other three: it is an opt-in direction, so it takes
  // an explicit true.
  document.body.classList.toggle('electric',D.prefs.electricInk===true);
  _luApplyElectricCSS();
  // Repaint the topbar dark/light switch for whatever the mode now is. Hooked
  // here so it is correct however the mode changed — topbar, Settings, or a
  // scheduled theme swap.
  try{_syncThemeToggleBtn();}catch(_){}
  // Density (#13). Backwards-compat: if `compact` is set without `density`,
  // treat as 'compact'. Otherwise default to 'normal'.
  const density=D.prefs.density||(D.prefs.compact?'compact':'normal');
  document.body.classList.toggle('compact-mode',density==='compact');
  document.body.classList.toggle('dense-mode',density==='dense');
  document.documentElement.style.setProperty('--ac',D.prefs.accent||'#3B82F6');
  // derive ach/acs from accent
  document.documentElement.style.setProperty('--ach',D.prefs.accent||'#60A5FA');
  document.documentElement.style.setProperty('--acs',(D.prefs.accent||'#3B82F6')+'26');
  // Apply workspace name
  const wl=document.getElementById('workspace-label');
  if(wl)wl.textContent=D.prefs.workspaceName||'LevelUp';
  // Apply the active theme (custom or scheduled), then the page-accent map.
  if(typeof applyTheme==='function')applyTheme();
}

// ═══════════════════════════════════════════════════════════════════════════
// THEME ENGINE — granular per-user appearance with saved profiles + scheduling
// ═══════════════════════════════════════════════════════════════════════════
//
// Themes are stored in D.prefs (per-user, server-synced via the prefs blob).
//   D.prefs.theme            — active theme object (overrides default vars)
//   D.prefs.themeProfiles    — array of {id,name,emoji,theme}
//   D.prefs.themeSchedule    — array of {id,enabled,profileId,days,start,end}
//   D.prefs.themeFontFamily  — global font-family override
//   D.prefs.themeFontScale   — multiplier (0.85–1.30) applied to root font-size
//
// A "theme" is just a flat object mapping CSS variable names (without --) to
// values. applyTheme() merges defaults + the active profile + any scheduled
// override and pushes them onto the :root element.

const THEME_DEFAULTS_DARK={
  bg:'#0B0F1A',s1:'#0F1525',s2:'#161D2E',s3:'#1E2740',s4:'#252F4A',
  bd1:'rgba(255,255,255,.06)',bd2:'rgba(255,255,255,.10)',bd3:'rgba(255,255,255,.16)',
  // t3 lifted #64748B → #7C8AA3: old value measured 3.1–4.0:1 on the surfaces
  // (AA fail) for all 9-10px meta text. Keep t3 visibly dimmer than t2.
  t1:'#F8FAFC',t2:'#94A3B8',t3:'#7C8AA3',t4:'#475569',
  ac:'#3B82F6',ach:'#60A5FA',acs:'rgba(59,130,246,.15)',
  red:'#F87171',warn:'#FBBF24',ok:'#4ADE80',purp:'#C084FC',
  brd:'rgba(255,255,255,.10)',
};
const THEME_DEFAULTS_LIGHT={
  ...THEME_DEFAULTS_DARK,
  bg:'#F1F5F9',s1:'#FFFFFF',s2:'#F8FAFC',s3:'#EEF2F7',s4:'#E2E8F0',
  bd1:'rgba(0,0,0,.07)',bd2:'rgba(0,0,0,.10)',bd3:'rgba(0,0,0,.16)',
  // Light-mode t3 was #94A3B8 = 2.56:1 on white (worst contrast in the app);
  // #64748B measures 4.76:1 and still reads as muted next to t2 #475569.
  t1:'#0F172A',t2:'#475569',t3:'#64748B',t4:'#CBD5E1',
  brd:'rgba(0,0,0,.10)',
};
// ── Chromatic Bento ────────────────────────────────────────────────────────
// Home dashboard widgets stop borrowing colour and BECOME the colour: each
// tile is a deep-tinted surface keyed to its domain, with a wider radius so
// the grid reads as a board of widgets. You find the habits card by its green
// before you read a word of it.
//
// Hues come from the app's OWN per-route palette (the body[data-screen]
// --page-accent map in index.html) rather than a new invented set. That
// matters: build -61 already tinted the dashboard card TITLES from that same
// palette, so tile and title harmonise instead of clashing.
const BENTO_HUES={
  // default-on cards
  tasks:'#22c55e', notes:'#f97316', projects:'#a855f7', goals:'#dc2626',
  files:'#0ea5e9', habits:'#10b981', meetings:'#0284c7', recent:'#6366f1',
  pinned:'#f59e0b', focus:'#ef4444', reports:'#06b6d4',
  // opt-in cards
  habitHeatmap:'#10b981', moodTrend:'#f43f5e', mindmaps:'#ec4899',
  bookmarks:'#d97706', deadlines:'#ef4444', productivityScore:'#06b6d4',
  streaks:'#f59e0b', weekAhead:'#14b8a6', ideasPipeline:'#eab308',
  taskVelocity:'#22c55e', tagCloud:'#8b5cf6', weather:'#0284c7',
  quoteOfDay:'#a855f7', yesteryear:'#0d9488', aiInsight:'#8b5cf6',
  focusSuggestion:'#ef4444', staleContent:'#64748b',
};
function _luApplyBentoCSS(){
  try{
    let tag=document.getElementById('lu-bento-css');
    if(!tag){tag=document.createElement('style');tag.id='lu-bento-css';document.head.appendChild(tag);}
    const rules=Object.keys(BENTO_HUES).map(id=>
      `body.bento .home-card-wrap[data-home-id="${id}"]{--tile-accent:${BENTO_HUES[id]}}`);
    rules.push(
      // Home cards render as .cd inside .home-card-wrap, so this out-specifies
      // Aurora's `body.aurora .cd` and Daybreak's `body.light-mode.daybreak .cd`
      // WITHOUT relying on stylesheet order.
      'body.bento .home-card-wrap .cd{',
      '  background:color-mix(in srgb,var(--tile-accent,#3B82F6) 15%,var(--s1))!important;',
      '  border:1px solid color-mix(in srgb,var(--tile-accent,#3B82F6) 30%,transparent)!important;',
      '  border-radius:18px!important;',
      '  backdrop-filter:none!important;',
      '  box-shadow:none!important;',
      '}',
      // A white-ish ground shows colour far more readily, so the light recipe
      // tints much less and keeps a soft accent shadow for separation.
      'body.light-mode.bento .home-card-wrap .cd{',
      '  background:color-mix(in srgb,var(--tile-accent,#3B82F6) 9%,#FFFFFF)!important;',
      '  border-color:color-mix(in srgb,var(--tile-accent,#3B82F6) 24%,transparent)!important;',
      '  box-shadow:0 1px 2px rgba(16,20,38,.05), 0 8px 20px -14px color-mix(in srgb,var(--tile-accent,#3B82F6) 55%,transparent)!important;',
      '}',
      // Tiles are draggable; keep hover to colour only so nothing reflows mid-drag.
      'body.bento .home-card-wrap .cd:hover{',
      '  border-color:color-mix(in srgb,var(--tile-accent,#3B82F6) 48%,transparent)!important;',
      '}'
    );
    tag.textContent=rules.join('\n');
  }catch(e){if(window.__DEV__)console.warn('[bento] css inject failed',e);}
}

// Daybreak Pop's card treatment, injected as its own stylesheet.
//
// This lives here rather than in index.html for a concrete reason: appended to
// the end of that file's 150 KB <style>, it stopped the CSS parser dead — the
// rules never reached the CSSOM AND the ~370 KB of bundled Tailwind that vite
// concatenates after it was dropped with them. The exact trigger was never
// pinned down (the same bytes parse fine in a standalone sheet), which is
// itself the argument for not putting them there. Injected stylesheets are
// what this app already uses for dynamic CSS — #lu-page-accents,
// #lu-layout-css — and they are reliable.
//
// Only the card treatment is here; the ground/text TOKENS are DAYBREAK_LIGHT
// below, because applyTheme() writes tokens inline on <body> and inline beats
// any stylesheet.
function _luApplyDaybreakCSS(){
  try{
    let tag=document.getElementById('lu-daybreak-css');
    if(!tag){tag=document.createElement('style');tag.id='lu-daybreak-css';document.head.appendChild(tag);}
    // Scoped to body.light-mode.daybreak, so it is inert in dark mode and
    // removed entirely by the toggle.
    tag.textContent=[
      'body.light-mode.daybreak .cd,',
      'body.light-mode.daybreak .rr > [style*="var(--s2)"]{',
      '  background:#FFFFFF!important;',
      '  border-color:transparent!important;',
      '  backdrop-filter:none;',
      '  box-shadow:0 1px 2px rgba(16,20,38,.05), 0 10px 26px -14px color-mix(in srgb,var(--page-accent,#2563EB) 42%,transparent)!important;',
      '}',
      'body.light-mode.daybreak .cd:hover,',
      'body.light-mode.daybreak .rr > [style*="var(--s2)"]:hover{',
      '  box-shadow:0 2px 5px rgba(16,20,38,.06), 0 16px 34px -14px color-mix(in srgb,var(--page-accent,#2563EB) 56%,transparent)!important;',
      '}',
      'body.light-mode.daybreak .rr{',
      '  background:color-mix(in srgb,#fff 78%,transparent);',
      '  border-left-color:rgba(22,33,62,.08);',
      '}',
      '@media (prefers-reduced-transparency:reduce){',
      '  body.light-mode.daybreak .cd,',
      '  body.light-mode.daybreak .rr > [style*="var(--s2)"]{box-shadow:0 1px 3px rgba(16,20,38,.12)!important}',
      '  body.light-mode.daybreak .rr{background:var(--s1)}',
      '}',
    ].join('\n');
  }catch(e){if(window.__DEV__)console.warn('[daybreak] css inject failed',e);}
}

// Daybreak Pop's ground/text tokens (light mode only).
//
// These MUST live here rather than in CSS: applyTheme() pushes the whole token
// set as INLINE styles onto <body>, and inline beats any stylesheet rule, so a
// `body.light-mode.daybreak{--bg:…}` block could never win. The card treatment
// (accent-tinted shadows) is still plain CSS — that isn't token-based.
//
// Deliberately omits ac/ach/acs/purp/ok/red/warn: the user picks their accent
// (D.prefs.accent), and overriding it here would silently discard that choice.
// Merged as a DEFAULTS layer, so an explicitly stored theme still wins.
const DAYBREAK_LIGHT={
  bg:'#F2F5FB',            // cool porcelain
  s1:'#FFFFFF',s2:'#FFFFFF',s3:'#EDF1F9',s4:'#DFE6F2',
  bd1:'rgba(22,33,62,.07)',bd2:'rgba(22,33,62,.11)',bd3:'rgba(22,33,62,.17)',
  t1:'#101426',            // ink
  t2:'#3E475E',t3:'#5A6478',
  brd:'rgba(22,33,62,.11)',
};
// ── Electric Ink ───────────────────────────────────────────────────────────
// Near-black ground, maximum-voltage accents. The rule that makes it work:
// colour lives in GLOWS, TOP-BORDERS and BIG NUMERALS — never in fills. That
// keeps it loud without hurting legibility, which is what separates it from a
// neon theme that is painful to read.
//
// DARK MODE ONLY, and DEFAULT OFF (unlike Aurora/Daybreak/Bento, which shipped
// on). It is a deliberate, loud direction rather than a refinement of the
// stock look, so it is opt-in: `D.prefs.electricInk===true`.
//
// Ground/text TOKENS are ELECTRIC_DARK below — they cannot live in CSS,
// because applyTheme() writes the token set as INLINE styles on <body> and
// inline beats any stylesheet rule. Everything that is NOT a token is in the
// injected stylesheet below.
function _luApplyElectricCSS(){
  try{
    let tag=document.getElementById('lu-electric-css');
    if(!tag){tag=document.createElement('style');tag.id='lu-electric-css';document.head.appendChild(tag);}
    // Scoped to body:not(.light-mode).electric, so it is inert in light mode
    // and removed entirely by the toggle.
    const E='body:not(.light-mode).electric';
    tag.textContent=[
      // The voltage palette. These are NOT theme tokens on purpose: applyTheme
      // writes every key of the theme object inline and never removes one, so
      // putting them in ELECTRIC_DARK would leave stale --volt/--lime vars on
      // <body> after the theme is switched off. A stylesheet rule scoped to
      // .electric appears and disappears with the class.
      `${E}{--volt:#5B8CFF;--magenta:#FF4ECD;--lime:#A3E635;--amber:#FFC53D}`,
      // 1. KPI tiles — colour as a 2px TOP BORDER, glow on the NUMERAL only.
      //    renderHome inline-styles these tiles (background/border/shadow), and
      //    inline beats a stylesheet, so !important is required here. It is
      //    scoped tightly enough that it cannot leak past the hero strip.
      `${E} .home-hero-tile{background:#0F0F17!important;border:1px solid rgba(255,255,255,.07)!important;border-top:2px solid var(--volt)!important;box-shadow:none!important}`,
      `${E} .home-hero-tile:nth-child(4n+2){border-top-color:var(--magenta)!important}`,
      `${E} .home-hero-tile:nth-child(4n+3){border-top-color:var(--lime)!important}`,
      `${E} .home-hero-tile:nth-child(4n+4){border-top-color:var(--amber)!important}`,
      `${E} .home-hero-tile:hover{filter:none;transform:translateY(-2px)}`,
      //    The numeral is the first line of the tile's text column. It already
      //    carries its own colour inline; this only adds the glow.
      `${E} .home-hero-tile>div:last-child>div:first-child{text-shadow:0 0 14px currentColor!important}`,
      // 2. Active nav — EDGE-LIT RAIL, not a filled pill. The stock look fills
      //    the row with --acs and draws a 3px bar in ::before; both go.
      `${E} .si.on{background:transparent;color:var(--volt);box-shadow:inset 2px 0 0 var(--volt)}`,
      `${E} .si.on::before{display:none}`,
      `${E} .si.on svg{stroke:var(--volt)!important}`,
      `${E} .si.on .c{background:var(--volt);color:#08080D}`,
      // 3. Card titles — volt blue, alternating lime so a long page has rhythm.
      //    TWO alternation rules are needed because cards sit in two different
      //    structures, and using only the first shipped every title volt (the
      //    alternation silently did nothing until it was measured):
      //      - most pages: .cd elements are direct siblings -> nth-of-type works
      //      - Home: each .cd is the ONLY .cd inside its own .home-card-wrap, so
      //        every one is nth-of-type(1). Alternate on the WRAPPER instead;
      //        those are siblings, and the order tracks the user's drag-reorder.
      `${E} .cd .cd-t{color:var(--volt)}`,
      `${E} .cd:nth-of-type(even) .cd-t{color:var(--lime)}`,
      `${E} .home-card-wrap:nth-of-type(even) .cd .cd-t{color:var(--lime)}`,
      // Discipline from the pitch: glow on numerals and borders ONLY, never on
      // body text. This is the guard rail — if a future edit adds a text-shadow
      // to prose inside a card, this puts it back.
      `${E} .cd p,${E} .cd span,${E} .cd li,${E} .cd td{text-shadow:none}`,
    ].join('\n');
  }catch(e){if(window.__DEV__)console.warn('[electric] css inject failed',e);}
}

// Electric Ink's ground/text tokens (dark mode only).
//
// Same constraint as DAYBREAK_LIGHT: these MUST be here rather than in CSS,
// because applyTheme() writes them inline on <body>.
//
// Deliberately omits ac/ach/acs — the user picks their accent
// (D.prefs.accent) and overriding it would silently discard that choice. The
// voltage palette reaches the UI through the injected stylesheet instead.
//
// t2/t3 are LIFTED from the stock dark values (#94A3B8/#7C8AA3). The pitch
// flagged that they were tuned for #0B0F1A, not this darker ground — the
// darker ground actually *helps* contrast, but the raised surfaces (s3/s4)
// are where small meta text gets thin, so these are re-checked there. See
// scripts/check-electric-contrast.mjs for the measured ratios.
const ELECTRIC_DARK={
  bg:'#08080D',                                            // near-black ground
  s1:'#0F0F17',s2:'#13131D',s3:'#1B1B27',s4:'#242433',     // surfaces
  bd1:'rgba(255,255,255,.07)',bd2:'rgba(255,255,255,.12)',bd3:'rgba(255,255,255,.18)',
  t1:'#F5F7FF',t2:'#A6B0CA',t3:'#8C96B2',t4:'#4A5268',
  ok:'#A3E635',warn:'#FFC53D',purp:'#FF4ECD',              // lime / amber / magenta
  brd:'rgba(255,255,255,.12)',
};
// Page-accent map (the hue used for each route's banner + cards).
// Editable in the UI so users can rebrand the per-page palette too.
const PAGE_ACCENT_DEFAULTS={
  home:'#3b82f6',myday:'#f59e0b',myweek:'#14b8a6',myyear:'#6366f1',
  capture:'#fb7185',ideas:'#eab308',mindmaps:'#ec4899',focus:'#ef4444',
  process:'#8b5cf6',tasks:'#14b8a6',notes:'#10b981',projects:'#6366f1',
  clusters:'#06b6d4',calendar:'#0284c7',mail:'#9333ea',goals:'#dc2626',
  habits:'#10b981',coach:'#facc15',journal:'#f43f5e',team:'#0ea5e9',
  contacts:'#0d9488',bookmarks:'#d97706',archive:'#64748b',reports:'#06b6d4',
};
// Curated bundled profiles users can apply or start from.
const THEME_PRESETS=[
  {id:'_default',name:'LevelUp Default',emoji:'🌌',theme:{}},
  {id:'_focus',name:'Deep Focus',emoji:'🎯',theme:{
    bg:'#0A0E1A',s1:'#0D121F',s2:'#121828',s3:'#1A2236',s4:'#243250',
    ac:'#06b6d4',ach:'#22d3ee',acs:'rgba(6,182,212,.18)',
    t1:'#E6F1FF',t2:'#86A3C8',
  }},
  {id:'_sunset',name:'Sunset',emoji:'🌅',theme:{
    bg:'#1A0F1F',s1:'#22142B',s2:'#2A1A36',s3:'#3A2548',s4:'#4A2F5A',
    ac:'#f97316',ach:'#fb923c',acs:'rgba(249,115,22,.18)',
    t1:'#FFF7ED',t2:'#FDBA74',
  }},
  {id:'_forest',name:'Forest',emoji:'🌲',theme:{
    bg:'#0A1410',s1:'#0E1A14',s2:'#13251C',s3:'#1A3527',s4:'#244836',
    ac:'#10b981',ach:'#34d399',acs:'rgba(16,185,129,.18)',
    t1:'#ECFDF5',t2:'#86EFAC',
  }},
  {id:'_paper',name:'Paper (Light)',emoji:'📜',theme:{
    bg:'#FAF8F3',s1:'#FFFFFF',s2:'#F5F1E8',s3:'#EEE7D6',s4:'#E0D5BC',
    ac:'#8b5cf6',ach:'#a78bfa',acs:'rgba(139,92,246,.16)',
    t1:'#1F1A14',t2:'#5C5040',t3:'#8A7B66',t4:'#B5A78E',
    bd1:'rgba(0,0,0,.07)',bd2:'rgba(0,0,0,.10)',bd3:'rgba(0,0,0,.16)',
    brd:'rgba(0,0,0,.10)',
  }},
  {id:'_midnight',name:'Midnight Ink',emoji:'🌙',theme:{
    bg:'#020617',s1:'#070D1C',s2:'#0C1326',s3:'#141C36',s4:'#1E2747',
    ac:'#a855f7',ach:'#c084fc',acs:'rgba(168,85,247,.18)',
    t1:'#F1F5F9',t2:'#94A3B8',
  }},
  {id:'_rose',name:'Rose Garden',emoji:'🌹',theme:{
    bg:'#1A0E14',s1:'#22131C',s2:'#2D1A26',s3:'#3D2333',s4:'#4D2D42',
    ac:'#f43f5e',ach:'#fb7185',acs:'rgba(244,63,94,.18)',
    t1:'#FFF1F2',t2:'#FCA5A5',
  }},
  {id:'_zen',name:'Zen Morning',emoji:'🍵',theme:{
    bg:'#F5F7F4',s1:'#FFFFFF',s2:'#EEF2EC',s3:'#E0E8DC',s4:'#CFDAC8',
    ac:'#16a34a',ach:'#22c55e',acs:'rgba(22,163,74,.14)',
    t1:'#1A2E1A',t2:'#516555',t3:'#7A8A7B',t4:'#A5B0A2',
    bd1:'rgba(0,0,0,.07)',bd2:'rgba(0,0,0,.10)',bd3:'rgba(0,0,0,.16)',
    brd:'rgba(0,0,0,.10)',
  }},
  // ── 5 more dark presets ──
  {id:'_ocean',name:'Ocean Deep',emoji:'🌊',theme:{
    bg:'#06141F',s1:'#0A1B29',s2:'#0F2536',s3:'#163349',s4:'#1F4861',
    ac:'#14b8a6',ach:'#2dd4bf',acs:'rgba(20,184,166,.18)',
    t1:'#E0F2F1',t2:'#7FB8B5',
  }},
  {id:'_crimson',name:'Crimson Night',emoji:'🩸',theme:{
    bg:'#140A0C',s1:'#1C0E11',s2:'#261318',s3:'#371A20',s4:'#4A222A',
    ac:'#ef4444',ach:'#f87171',acs:'rgba(239,68,68,.18)',
    t1:'#FCEBEB',t2:'#D49AA0',
  }},
  {id:'_amethyst',name:'Amethyst',emoji:'🔮',theme:{
    bg:'#120A22',s1:'#190F2E',s2:'#22153B',s3:'#301E52',s4:'#3F2A6B',
    ac:'#a855f7',ach:'#c084fc',acs:'rgba(168,85,247,.18)',
    t1:'#F2EBFF',t2:'#B69FD8',
  }},
  {id:'_slate',name:'Slate Pro',emoji:'🪨',theme:{
    bg:'#0E1217',s1:'#141A21',s2:'#1B232C',s3:'#26313D',s4:'#33414F',
    ac:'#38bdf8',ach:'#7dd3fc',acs:'rgba(56,189,248,.16)',
    t1:'#E8EDF2',t2:'#94A3B8',
  }},
  {id:'_carbon',name:'Carbon (OLED)',emoji:'⬛',theme:{
    bg:'#000000',s1:'#070707',s2:'#0E0E0E',s3:'#171717',s4:'#222222',
    ac:'#3b82f6',ach:'#60a5fa',acs:'rgba(59,130,246,.20)',
    t1:'#F5F5F5',t2:'#9CA3AF',
  }},
  // ── 7 more light presets ──
  {id:'_cloud',name:'Cloud (Light)',emoji:'☁️',theme:{
    bg:'#F4F6FA',s1:'#FFFFFF',s2:'#FAFBFD',s3:'#EEF1F6',s4:'#E2E7EF',
    ac:'#3b82f6',ach:'#60a5fa',acs:'rgba(59,130,246,.14)',
    t1:'#0F172A',t2:'#475569',t3:'#94A3B8',t4:'#CBD5E1',
    bd1:'rgba(0,0,0,.06)',bd2:'rgba(0,0,0,.10)',bd3:'rgba(0,0,0,.16)',
    brd:'rgba(0,0,0,.10)',
  }},
  {id:'_sand',name:'Sand (Light)',emoji:'🏜️',theme:{
    bg:'#FBF6EE',s1:'#FFFDF8',s2:'#F5EDDF',s3:'#EEE2CC',s4:'#E2D2B2',
    ac:'#d97706',ach:'#f59e0b',acs:'rgba(217,119,6,.15)',
    t1:'#3A2E1A',t2:'#6B5A3C',t3:'#94815C',t4:'#BFAE86',
    bd1:'rgba(0,0,0,.07)',bd2:'rgba(0,0,0,.11)',bd3:'rgba(0,0,0,.17)',
    brd:'rgba(0,0,0,.11)',
  }},
  {id:'_mint',name:'Mint (Light)',emoji:'🌿',theme:{
    bg:'#F1FAF5',s1:'#FFFFFF',s2:'#E9F6EE',s3:'#DCEFE3',s4:'#C7E4D2',
    ac:'#059669',ach:'#10b981',acs:'rgba(5,150,105,.14)',
    t1:'#0F2A1E',t2:'#3D6354',t3:'#6E8E7F',t4:'#9DB8AC',
    bd1:'rgba(0,0,0,.06)',bd2:'rgba(0,0,0,.10)',bd3:'rgba(0,0,0,.16)',
    brd:'rgba(0,0,0,.10)',
  }},
  {id:'_sky',name:'Sky (Light)',emoji:'🌤️',theme:{
    bg:'#EFF6FD',s1:'#FFFFFF',s2:'#E6F1FB',s3:'#D7E8F6',s4:'#C2DBEF',
    ac:'#0284c7',ach:'#0ea5e9',acs:'rgba(2,132,199,.14)',
    t1:'#0C2433',t2:'#37536A',t3:'#6586A0',t4:'#9BB6CB',
    bd1:'rgba(0,0,0,.06)',bd2:'rgba(0,0,0,.10)',bd3:'rgba(0,0,0,.16)',
    brd:'rgba(0,0,0,.10)',
  }},
  {id:'_blush',name:'Blush (Light)',emoji:'🌸',theme:{
    bg:'#FDF2F6',s1:'#FFFFFF',s2:'#FBE8EF',s3:'#F6D9E4',s4:'#EFC3D5',
    ac:'#db2777',ach:'#ec4899',acs:'rgba(219,39,119,.13)',
    t1:'#33121F',t2:'#6B3B4D',t3:'#9C6B7C',t4:'#C99FAD',
    bd1:'rgba(0,0,0,.06)',bd2:'rgba(0,0,0,.10)',bd3:'rgba(0,0,0,.16)',
    brd:'rgba(0,0,0,.10)',
  }},
  {id:'_sollight',name:'Solarized Light',emoji:'🔆',theme:{
    bg:'#FDF6E3',s1:'#FFFCF0',s2:'#EEE8D5',s3:'#E3DCC4',s4:'#D6CFB4',
    ac:'#268BD2',ach:'#3a9fe0',acs:'rgba(38,139,210,.15)',
    t1:'#073642',t2:'#586E75',t3:'#839496',t4:'#93A1A1',
    bd1:'rgba(101,123,131,.14)',bd2:'rgba(101,123,131,.22)',bd3:'rgba(101,123,131,.30)',
    brd:'rgba(101,123,131,.22)',
  }},
  {id:'_lavender',name:'Lavender (Light)',emoji:'💜',theme:{
    bg:'#F6F3FC',s1:'#FFFFFF',s2:'#EFEAFA',s3:'#E4DCF4',s4:'#D3C7EC',
    ac:'#7c3aed',ach:'#8b5cf6',acs:'rgba(124,58,237,.13)',
    t1:'#241733',t2:'#4F3D6B',t3:'#7E6E9C',t4:'#AC9FC6',
    bd1:'rgba(0,0,0,.06)',bd2:'rgba(0,0,0,.10)',bd3:'rgba(0,0,0,.16)',
    brd:'rgba(0,0,0,.10)',
  }},
];
const THEME_VAR_GROUPS=[
  {label:'Backgrounds',keys:[
    {k:'bg',name:'Page background'},
    {k:'s1',name:'Surface 1 (sidebar / rail)'},
    {k:'s2',name:'Surface 2 (cards)'},
    {k:'s3',name:'Surface 3 (hover / pills)'},
    {k:'s4',name:'Surface 4 (deep)'},
  ]},
  {label:'Text',keys:[
    {k:'t1',name:'Primary text'},
    {k:'t2',name:'Secondary text'},
    {k:'t3',name:'Tertiary / hint'},
    {k:'t4',name:'Disabled / faint'},
  ]},
  {label:'Accent',keys:[
    {k:'ac',name:'Accent'},
    {k:'ach',name:'Accent hover'},
  ]},
  {label:'Semantic',keys:[
    {k:'red',name:'Error / overdue'},
    {k:'warn',name:'Warning'},
    {k:'ok',name:'Success'},
    {k:'purp',name:'Purple highlight'},
  ]},
];

// Resolve the *effective* theme: defaults → active stored theme → scheduled override.
function _getEffectiveTheme(){
  const dark=D.prefs.darkMode!==false;
  let defaults=dark?THEME_DEFAULTS_DARK:THEME_DEFAULTS_LIGHT;
  // Daybreak Pop sits on top of the light defaults but UNDER anything the user
  // has explicitly chosen, so it restyles the ground without overriding them.
  if(!dark&&D.prefs.daybreakPop!==false)defaults=Object.assign({},defaults,DAYBREAK_LIGHT);
  // Electric Ink is the dark-mode counterpart: same precedence rule — above the
  // dark defaults, UNDER anything the user explicitly stored, so it restyles the
  // ground without overriding a chosen theme.
  if(dark&&D.prefs.electricInk===true)defaults=Object.assign({},defaults,ELECTRIC_DARK);
  let theme=Object.assign({},defaults,D.prefs.theme||{});
  // Scheduled override
  const sched=_getActiveSchedule();
  if(sched){
    const prof=(D.prefs.themeProfiles||[]).find(p=>p.id===sched.profileId);
    if(prof&&prof.theme)theme=Object.assign({},defaults,prof.theme);
  }
  return theme;
}
// Determine if any scheduled entry applies right now. Returns the entry or null.
function _getActiveSchedule(){
  const sched=(D.prefs&&D.prefs.themeSchedule)||[];
  if(!sched.length)return null;
  const now=new Date();
  const day=now.getDay(); // 0=Sun..6=Sat
  const mins=now.getHours()*60+now.getMinutes();
  for(const e of sched){
    if(!e.enabled)continue;
    if(Array.isArray(e.days)&&e.days.length&&!e.days.includes(day))continue;
    const start=_hmToMin(e.start);const end=_hmToMin(e.end);
    if(start===null||end===null)continue;
    // Support overnight ranges (e.g. 22:00-06:00)
    const inRange=start<=end?(mins>=start&&mins<end):(mins>=start||mins<end);
    if(inRange)return e;
  }
  return null;
}
function _hmToMin(s){
  if(!s||typeof s!=='string')return null;
  const m=s.match(/^(\d{1,2}):(\d{2})$/);if(!m)return null;
  return Math.min(23,Math.max(0,Number(m[1])))*60+Math.min(59,Math.max(0,Number(m[2])));
}

// Push the effective theme onto :root. Called on boot, on toggle, and every
// minute via the scheduler tick.
let _lastAppliedThemeKey='';
// Time-aware accent drift (#15). Slowly nudges the user's accent hue across
// the day so the UI feels alive without redefining the theme. Peaks warm at
// hour 6 (+12°), neutral at midnight/noon, cools to -12° at hour 18.
function _hexToHsl(hex){
  if(!/^#[0-9a-f]{6}$/i.test(hex))return null;
  const r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h,s,l=(mx+mn)/2;
  if(mx===mn){h=s=0;}else{const d=mx-mn;s=l>0.5?d/(2-mx-mn):d/(mx+mn);
    switch(mx){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;case b:h=(r-g)/d+4;break;}h/=6;}
  return [h*360,s*100,l*100];
}
function _hslToHex(h,s,l){
  s/=100;l/=100;const k=n=>(n+h/30)%12;const a=s*Math.min(l,1-l);
  const f=n=>{const x=k(n);return l-a*Math.max(-1,Math.min(x-3,9-x,1));};
  const toHex=v=>Math.round(v*255).toString(16).padStart(2,'0');
  return '#'+toHex(f(0))+toHex(f(8))+toHex(f(4));
}
function _getDriftedAccent(baseHex){
  const hsl=_hexToHsl(baseHex);if(!hsl)return baseHex;
  const now=new Date();const hour=now.getHours()+now.getMinutes()/60;
  const hueShift=12*Math.sin(hour*Math.PI/12);
  return _hslToHex((hsl[0]+hueShift+360)%360,hsl[1],hsl[2]);
}
function applyTheme(opts){
  const t=_getEffectiveTheme();
  const root=document.documentElement;
  // Apply the CSS vars to BOTH <html> and <body>. The static stylesheet has a
  // `body.light-mode{--bg:…;--s1:…;--t1:…;…}` block that re-declares every
  // colour var ON <body>. For any element inside <body>, custom-property
  // resolution finds that body-level declaration before it reaches an inline
  // value set only on <html> — so in Light mode the hardcoded light palette
  // shadowed presets / custom colours / accent drift and they appeared to do
  // nothing. An inline style on the <body> element beats the body.light-mode
  // class rule on that same element, so setting the vars on body too makes
  // them win in both modes.
  const bodyEl=document.body;
  for(const [k,v] of Object.entries(t)){
    if(v===undefined||v===null||v==='')continue;
    root.style.setProperty('--'+k,v);
    if(bodyEl)bodyEl.style.setProperty('--'+k,v);
  }
  // #15 drift override — applied AFTER base theme so it wins for --ac/--ach/--acs.
  if(D.prefs&&D.prefs.accentDrift){
    const base=t.ac||D.prefs.accent||'#3B82F6';
    const drifted=_getDriftedAccent(base);
    root.style.setProperty('--ac',drifted);
    root.style.setProperty('--ach',drifted);
    root.style.setProperty('--acs',drifted+'26');
    if(bodyEl){
      bodyEl.style.setProperty('--ac',drifted);
      bodyEl.style.setProperty('--ach',drifted);
      bodyEl.style.setProperty('--acs',drifted+'26');
    }
  }
  // Page-accent map overrides
  const paMap=Object.assign({},PAGE_ACCENT_DEFAULTS,D.prefs.pageAccents||{});
  // Inject as a <style id="lu-page-accents"> so we override the static rules
  let styleEl=document.getElementById('lu-page-accents');
  if(!styleEl){styleEl=document.createElement('style');styleEl.id='lu-page-accents';document.head.appendChild(styleEl);}
  const rules=Object.entries(paMap).map(([screen,color])=>`body[data-screen="${screen}"]{--page-accent:${color}}`);
  styleEl.textContent=rules.join('\n');
  // Font family + scale
  const ff=D.prefs.themeFontFamily;
  if(ff&&ff!=='__system'){
    document.body.style.fontFamily=ff;
  }else{
    document.body.style.fontFamily='';
  }
  const fs=Number(D.prefs.themeFontScale)||1;
  root.style.setProperty('--lu-font-scale',String(fs));
  let baseFs=document.body.classList.contains('dense-mode')?12:document.body.classList.contains('compact-mode')?13:15;
  // Whole-UI scaling (Spacious ⇄ Compact): most of the app uses hardcoded px
  // sizes that don't inherit body font-size, so the old font-size-only scale
  // barely moved anything. Scale the layout itself with zoom (all modern
  // browsers, Firefox 126+). Text must not double-scale, so body font-size
  // stays at the density base when zoom is active. Old behaviour kept as a
  // fallback for browsers without zoom.
  if('zoom' in document.body.style){
    document.body.style.zoom=(fs===1?'':String(fs));
    document.body.style.fontSize=baseFs+'px';
  }else{
    document.body.style.fontSize=(baseFs*fs).toFixed(1)+'px';
  }
  // Re-render to update inline-styled colour pickers etc. if requested.
  if(opts&&opts.silent!==true){
    _lastAppliedThemeKey=_themeFingerprint();
  }
  // First applyTheme() boots the once-per-minute scheduler tick.
  _ensureThemeSchedulerRunning();
}
// Coerce a CSS colour string to a hex value usable by <input type="color">.
// rgba()/hsl()/etc. fall back to a sensible hex so the picker isn't blank.
function _themeColorAsHex(c){
  if(!c||typeof c!=='string')return '#000000';
  c=c.trim();
  if(/^#[0-9a-f]{6}$/i.test(c))return c;
  if(/^#[0-9a-f]{3}$/i.test(c))return '#'+c[1]+c[1]+c[2]+c[2]+c[3]+c[3];
  // rgb(a)(...) — parse first three numbers
  const m=c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if(m){return '#'+[m[1],m[2],m[3]].map(x=>Number(x).toString(16).padStart(2,'0')).join('');}
  return '#000000';
}
function _themeFingerprint(){
  try{
    // When drift is on, include a 15-min time bucket so the scheduler re-applies
    // the theme periodically as the hue rotates through the day.
    const driftBucket=(D.prefs&&D.prefs.accentDrift)?Math.floor(Date.now()/(15*60*1000)):0;
    return JSON.stringify([_getEffectiveTheme(),D.prefs.pageAccents||{},D.prefs.themeFontFamily,D.prefs.themeFontScale,driftBucket]);
  }catch(_){return Math.random().toString();}
}
// Scheduler tick: every 60s, re-check the effective theme. If it changed,
// re-apply. Started lazily on first applyTheme().
let _themeSchedTimer=null;
function _ensureThemeSchedulerRunning(){
  if(_themeSchedTimer)return;
  _themeSchedTimer=setInterval(()=>{
    const fp=_themeFingerprint();
    if(fp!==_lastAppliedThemeKey){
      _lastAppliedThemeKey=fp;
      applyTheme({silent:true});
    }
  },60*1000);
}

// ───── Theme persistence helpers ─────
function setThemeVar(key,value){
  D.prefs.theme=D.prefs.theme||{};
  if(!value){delete D.prefs.theme[key];}else{D.prefs.theme[key]=value;}
  save('prefs');applyTheme();
}
function setPageAccent(screen,color){
  D.prefs.pageAccents=D.prefs.pageAccents||{};
  if(!color){delete D.prefs.pageAccents[screen];}else{D.prefs.pageAccents[screen]=color;}
  save('prefs');applyTheme();
}
function resetTheme(){
  if(!confirm('Reset all colours, fonts and page accents to the LevelUp defaults? Saved profiles and schedules are kept.'))return;
  delete D.prefs.theme;
  delete D.prefs.pageAccents;
  delete D.prefs.themeFontFamily;
  delete D.prefs.themeFontScale;
  save('prefs');applyTheme();
  if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
  toast('🌌 Theme reset to defaults');
}
function applyThemePreset(preset){
  if(!preset)return;
  D.prefs.theme=Object.assign({},preset.theme||{});
  save('prefs');applyTheme();
  if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
  toast(`${preset.emoji||'🎨'} Applied: ${preset.name}`);
}

// ───────────────────────── Universal icon / emoji picker ─────────────────────────
// One picker reused everywhere an icon/symbol can be assigned: Projects, Notes,
// Clusters, Goals, Habits, Note folders, quick-capture forms. Renders its own
// top-level overlay (z-index above every drawer/modal) so it can be opened from
// inside another drawer or modal and stack cleanly on top.
const EMOJI_CATALOG=[
  {id:'fav',label:'⭐ Popular',e:`⭐ 🌟 ✨ 🔥 🚀 🎯 💡 ✅ ✔️ ❤️ 📌 📍 🏆 🥇 💎 👑 🎉 🎁 🔑 🔒 🧠 💪 👀 👍 🙌 🙏 💯 ⚡ 🌈 ☀️ 🌙 ⏰ 📅 📆 🗓️ 📝 📒 📔 📚 📖 ✏️ 🖊️ 🗂️ 📁 📂 🗄️ 📦 🏠 🏢 💼 💰 💵 💳 📈 📉 📊 🧩 🔧 🛠️ ⚙️ 🔬 🔭 🧪 🩺 🎨 🎵 🎬 📷 🎮 ☕ 🍎 🌱 🌳 🐶 🐱 ✈️ 🚗 🌍 ⚽ 🏋️ 🧘 🛒 🔔 💬 📧 📞 ❓ ❗ ➕ ➖ ✖️ ♻️ 🚩 🏁 🎓 🛡️ 🧭 🤖`},
  {id:'smile',label:'😀 Smileys',e:`😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😎 🥳 🤓 🧐 🤔 🤨 😐 😏 😒 🙄 😬 😌 😔 😪 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 😵 🤯 🤠 😈 👿 👻 💀 ☠️ 👽 👾 🤖 🎃 😺 😸 😹 😻 😼 😽 🙀 😿 😾`},
  {id:'people',label:'🙌 People',e:`👋 🤚 ✋ 🖖 👌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🙏 ✍️ 💅 🤳 💪 🦾 🦵 🦶 👂 👃 🧠 🫀 🫁 🦷 🦴 👀 👁️ 👅 👄 👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 🧔 👮 🕵️ 💂 👷 🤴 👸 🤵 👰 🤰 🤱 👼 🎅 🤶 🦸 🦹 🧙 🧚 🧛 🧜 🧝 🧞 🧟 💆 💇 🚶 🏃 💃 🕺 🧘`},
  {id:'nature',label:'🐶 Nature',e:`🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🦗 🕷️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🐘 🦏 🐪 🐫 🦒 🦘 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🐐 🦌 🐕 🐈 🐓 🦃 🦚 🦜 🦢 🕊️ 🐇 🐁 🐀 🐿️ 🦔 🐾 🐉 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🎍 🎋 🍃 🍂 🍁 🍄 🐚 🌾 💐 🌷 🌹 🥀 🌺 🌸 🌼 🌻 🌞 🌝 🌛 🌜 🌚 🌕 🌖 🌗 🌘 🌑 🌒 🌓 🌔 🌙 🌎 🌍 🌏 🪐 💫 ⭐ 🌟 ✨ ⚡ ☄️ 💥 🔥 🌪️ 🌈 ☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌨️ ❄️ ☃️ ⛄ 🌬️ 💨 💧 💦 ☔ 🌊`},
  {id:'food',label:'🍎 Food',e:`🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🌽 🥕 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥗 🥘 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍘 🍥 🥠 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 🍼 ☕ 🍵 🧃 🥤 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾 🧊 🥄 🍴 🍽️`},
  {id:'activity',label:'⚽ Activity',e:`⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🪂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧘 🏄 🏊 🤽 🚣 🧗 🚵 🚴 🏆 🥇 🥈 🥉 🏅 🎖️ 🏵️ 🎗️ 🎫 🎟️ 🎪 🤹 🎭 🩰 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🪕 🎻 🎲 ♟️ 🎯 🎳 🎮 🎰 🧩`},
  {id:'travel',label:'✈️ Travel',e:`🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🚚 🚛 🚜 🛴 🚲 🛵 🏍️ 🛺 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩️ 💺 🛰️ 🚀 🛸 🚁 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ ⛽ 🚧 🚦 🚥 🚏 🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ ⛺ 🏠 🏡 🏘️ 🏚️ 🏗️ 🏭 🏢 🏬 🏣 🏥 🏦 🏨 🏪 🏫 🏩 💒 🏛️ ⛪ 🕌 🕍 🛕 🕋 ⛩️ 🛤️ 🛣️ 🗾 🌅 🌄 🌠 🎇 🎆 🌇 🌆 🏙️ 🌃 🌌 🌉 🌁`},
  {id:'objects',label:'💡 Objects',e:`⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 🕹️ 💽 💾 💿 📀 📼 📷 📸 📹 🎥 📽️ 🎞️ 📞 ☎️ 📟 📠 📺 📻 🎙️ ⏱️ ⏲️ ⏰ 🕰️ ⌛ ⏳ 📡 🔋 🔌 💡 🔦 🕯️ 🧯 🛢️ 💸 💵 💴 💶 💷 💰 💳 🧾 💎 ⚖️ 🧰 🔧 🔨 ⚒️ 🛠️ ⛏️ 🔩 ⚙️ 🧱 ⛓️ 🧲 🔫 💣 🧨 🪓 🔪 🗡️ ⚔️ 🛡️ 🚬 ⚰️ ⚱️ 🏺 🔮 📿 🧿 💈 ⚗️ 🔭 🔬 🕳️ 🩹 🩺 💊 💉 🩸 🧬 🦠 🧫 🧪 🌡️ 🧹 🧺 🧻 🚽 🚿 🛁 🛀 🧼 🪥 🧽 🪣 🔑 🗝️ 🚪 🪑 🛋️ 🛏️ 🧸 🖼️ 🛍️ 🛒 🎁 🎈 🎀 🎊 🎉 🪔 🏮 ✉️ 📩 📨 📧 💌 📥 📦 📫 📪 📬 📭 📮 🗳️ ✏️ ✒️ 🖋️ 🖊️ 🖌️ 🖍️ 📝 💼 📁 📂 🗂️ 📅 📆 🗒️ 🗓️ 📇 📈 📉 📊 📋 📌 📍 📎 🖇️ 📏 📐 ✂️ 🗃️ 🗄️ 🗑️ 🔒 🔓 🔏 🔐`},
  {id:'symbols',label:'❤️ Symbols',e:`❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 🕎 ☯️ ☦️ 🛐 ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 ⚛️ 🉑 ☢️ ☣️ ✴️ 🆚 💮 🉐 ㊙️ ㊗️ 🈴 🈵 🈹 🈲 🅰️ 🅱️ 🆎 🆑 🅾️ 🆘 ❌ ⭕ 🛑 ⛔ 📛 🚫 💯 💢 ♨️ 🔞 ❗ ❕ ❓ ❔ ‼️ ⁉️ 🔅 🔆 〽️ ⚠️ 🚸 🔱 ⚜️ 🔰 ♻️ ✅ 🈯 💹 ❇️ ✳️ ❎ 🌐 💠 Ⓜ️ 🌀 💤 🏧 🚾 ♿ 🅿️ 🛗 🈳 🈂️ 🛂 🛃 🛄 🛅 🚹 🚺 🚼 🚻 🚮 🎦 📶 🈁 🔣 ℹ️ 🔤 🔡 🔠 🆖 🆗 🆙 🆒 🆕 🆓 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 🔢 #️⃣ *️⃣ ⏏️ ▶️ ⏸️ ⏯️ ⏹️ ⏺️ ⏭️ ⏮️ ⏩ ⏪ ⏫ ⏬ ◀️ 🔼 🔽 ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ ↩️ ↪️ ⤴️ ⤵️ 🔀 🔁 🔂 🔄 🔃 ➕ ➖ ➗ ✖️ ♾️ 💲 💱 ™️ ©️ ®️ 〰️ ➰ ➿ 🔚 🔙 🔛 🔝 🔜 ✔️ ☑️ 🔘 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟤 🔺 🔻 🔸 🔹 🔶 🔷 🔳 🔲 ▪️ ▫️ ◾ ◽ ◼️ ◻️ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ 🟫 🔈 🔇 🔉 🔊 🔔 🔕 📣 📢 💬 💭 🗯️ ♠️ ♣️ ♥️ ♦️ 🃏 🀄 🕐 🕑 🕒 🕓 🕔 🕕`},
];
const _EMOJI_KW={
  '🚀':'rocket launch ship startup fast','🎯':'target goal aim focus','💡':'idea light bulb tip','🔥':'fire hot trending streak',
  '⭐':'star favorite','🌟':'star sparkle glow','✨':'sparkle shine magic new','✅':'check done complete task','✔️':'check done tick',
  '❤️':'heart love like','📌':'pin pinned save','📍':'pin location place map','🏆':'trophy win award winner','🥇':'medal gold first',
  '💎':'diamond gem premium quality','👑':'crown king vip best','🎉':'party celebrate done launch','🎁':'gift present reward','🔑':'key access login secret',
  '🔒':'lock secure private safe','🧠':'brain mind think learn idea','💪':'muscle strong strength gym power','👀':'eyes look watch review',
  '👍':'thumbs up good approve like','🙏':'pray thanks please hope','💯':'hundred perfect score','⚡':'bolt energy power fast quick',
  '🌈':'rainbow color pride','☀️':'sun day weather bright','🌙':'moon night sleep','⏰':'alarm clock time reminder',
  '📅':'calendar date schedule plan','📆':'calendar date','🗓️':'calendar planner schedule','📝':'memo note write task','📒':'notebook journal log',
  '📚':'books library learn study','📖':'book read open story','✏️':'pencil write edit','🖊️':'pen write sign','🗂️':'folders files organize sort',
  '📁':'folder directory group','📂':'folder open','🗄️':'cabinet archive files store','📦':'box package archive ship','🏠':'home house main',
  '🏢':'office building company work','💼':'briefcase work business job','💰':'money bag finance budget save','💵':'cash money dollar',
  '💳':'card credit payment buy','📈':'chart up growth stats gain','📉':'chart down loss stats drop','📊':'bar chart stats report data',
  '🧩':'puzzle piece solve part','🔧':'wrench tool fix settings','🛠️':'tools build fix maintain','⚙️':'gear settings config system',
  '🔬':'microscope research science lab','🔭':'telescope research vision future','🧪':'test tube experiment science','🩺':'health medical doctor care',
  '🎨':'art design palette paint create','🎵':'music note song audio','🎬':'movie film video','📷':'camera photo picture','🎮':'game gaming play fun',
  '☕':'coffee break cafe morning','🍎':'apple fruit food health','🌱':'seedling grow plant new start','🌳':'tree nature grow evergreen',
  '🐶':'dog pet animal','🐱':'cat pet animal','✈️':'plane travel flight trip','🚗':'car drive travel commute','🌍':'earth world global map',
  '⚽':'soccer ball sport football','🏋️':'gym workout fitness lift exercise','🧘':'yoga meditate calm mindful zen','🛒':'cart shopping buy store',
  '🔔':'bell notification alert remind','💬':'chat message comment talk','📧':'email mail message inbox','📞':'phone call contact',
  '❓':'question help unknown ask','❗':'exclamation important alert','➕':'plus add new create','➖':'minus remove subtract','✖️':'multiply close x cancel',
  '♻️':'recycle reuse eco green','🚩':'flag milestone mark report','🏁':'flag finish goal done race','💀':'skull danger dead risk','👻':'ghost spooky',
  '🤖':'robot bot ai automation','🌵':'cactus plant desert','🍕':'pizza food meal','🎓':'graduation school education learn degree',
  '🛡️':'shield security protect defend safe','🧭':'compass navigate direction explore','🪐':'planet space cosmos','🌊':'wave water ocean sea flow',
};
let _emojiPickCb=null,_emojiPickCat='fav',_emojiPickQuery='',_emojiPickAllowClear=true;
function _emojiOv(){
  let ov=document.getElementById('lu-emoji-ov');
  if(!ov){
    ov=document.createElement('div');
    ov.id='lu-emoji-ov';
    ov.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(3px)';
    ov.onclick=function(e){if(e.target===ov)_emojiPickClose();};
    document.body.appendChild(ov);
  }
  return ov;
}
function openEmojiPicker(opts){
  opts=opts||{};
  _emojiPickCb=typeof opts.onPick==='function'?opts.onPick:null;
  _emojiPickQuery='';
  _emojiPickAllowClear=opts.allowClear!==false;
  _emojiPickCat='fav';
  const ov=_emojiOv();
  ov.dataset.title=opts.title||'Pick an icon';
  ov.style.display='flex';
  _emojiPickRender();
  setTimeout(function(){const s=document.getElementById('lu-emoji-search');if(s)s.focus();},60);
}
function _emojiPickClose(){const ov=document.getElementById('lu-emoji-ov');if(ov)ov.style.display='none';_emojiPickCb=null;}
function _emojiPickChoose(e){const cb=_emojiPickCb;_emojiPickClose();if(cb)try{cb(e);}catch(_){}}
function _emojiPickSetCat(c){_emojiPickCat=c;_emojiPickQuery='';const s=document.getElementById('lu-emoji-search');if(s)s.value='';_emojiPickRender();}
function _emojiPickSearch(v){_emojiPickQuery=(v||'').trim().toLowerCase();_emojiPickGrid();_emojiPickPaintTabs();}
function _emojiPickList(){
  const split=s=>s.split(/\s+/).filter(Boolean);
  if(_emojiPickQuery){
    const q=_emojiPickQuery,seen={},out=[];
    EMOJI_CATALOG.forEach(c=>{
      split(c.e).forEach(em=>{
        if(seen[em])return;
        const kw=_EMOJI_KW[em]||'';
        if(kw.indexOf(q)>=0||c.label.toLowerCase().indexOf(q)>=0){seen[em]=1;out.push(em);}
      });
    });
    return out;
  }
  const cat=EMOJI_CATALOG.find(c=>c.id===_emojiPickCat)||EMOJI_CATALOG[0];
  return split(cat.e);
}
function _emojiPickGrid(){
  const g=document.getElementById('lu-emoji-grid');if(!g)return;
  const list=_emojiPickList();
  g.innerHTML=list.length
    ? list.map(em=>`<button type="button" title="${esc(em)}" onclick="_emojiPickChoose('${em}')" style="font-size:22px;line-height:1;height:42px;width:42px;border:1px solid transparent;border-radius:8px;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .1s,transform .1s" onmouseover="this.style.background='var(--s3)';this.style.transform='scale(1.12)'" onmouseout="this.style.background='transparent';this.style.transform='scale(1)'">${em}</button>`).join('')
    : `<div style="grid-column:1/-1;padding:24px;text-align:center;font-size:12px;color:var(--t3)">No matches. Try another word, or browse a category above.</div>`;
}
function _emojiPickPaintTabs(){
  document.querySelectorAll('#lu-emoji-tabs [data-cat]').forEach(b=>{
    const on=!_emojiPickQuery&&b.dataset.cat===_emojiPickCat;
    b.style.border='1px solid '+(on?'var(--ac)':'var(--bd2)');
    b.style.background=on?'var(--ac)':'transparent';
    b.style.color=on?'#fff':'var(--t2)';
  });
}
function _emojiPickRender(){
  const ov=_emojiOv();
  const tabs=EMOJI_CATALOG.map(c=>`<button type="button" data-cat="${c.id}" onclick="_emojiPickSetCat('${c.id}')" style="flex:0 0 auto;height:30px;padding:0 10px;font-size:11px;border:1px solid var(--bd2);background:transparent;color:var(--t2);border-radius:7px;cursor:pointer;white-space:nowrap">${c.label}</button>`).join('');
  ov.innerHTML=`<div style="background:var(--s1);border:1px solid var(--bd2);border-radius:14px;width:min(580px,96vw);max-height:86dvh;display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,.55);overflow:hidden">
    <div style="display:flex;align-items:center;gap:8px;padding:13px 16px;border-bottom:1px solid var(--bd1)">
      <span style="font-size:14px;font-weight:700;flex:1">${esc(ov.dataset.title||'Pick an icon')}</span>
      ${_emojiPickAllowClear?`<button type="button" class="btn btn-s" style="font-size:11px;height:28px" onclick="_emojiPickChoose('')">✕ No icon</button>`:''}
      <button type="button" class="btn btn-s" style="font-size:13px;height:28px;width:30px;padding:0" onclick="_emojiPickClose()" title="Cancel">✕</button>
    </div>
    <div style="padding:10px 16px 6px"><input id="lu-emoji-search" class="inp" placeholder="🔍 Search — rocket, money, idea, calendar…" oninput="_emojiPickSearch(this.value)" style="width:100%"></div>
    <div id="lu-emoji-tabs" style="display:flex;gap:5px;overflow-x:auto;padding:4px 16px 10px;border-bottom:1px solid var(--bd1)">${tabs}</div>
    <div id="lu-emoji-grid" style="padding:12px 14px;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(42px,1fr));gap:4px;align-content:start"></div>
  </div>`;
  _emojiPickGrid();_emojiPickPaintTabs();
}
// Field helper: a hidden input (keeps the id the caller's save logic already
// reads) + a button that shows the current glyph and opens the picker.
function _iconPickBtn(inputId,current,placeholder){
  current=current||'';
  const safe=esc(current);
  return `<input type="hidden" id="${inputId}" value="${safe}">`+
  `<button type="button" id="${inputId}-btn" class="btn btn-s" onclick="openEmojiPicker({title:'Choose an icon',current:document.getElementById('${inputId}').value,onPick:function(e){var i=document.getElementById('${inputId}');if(i)i.value=e;var b=document.getElementById('${inputId}-btn');if(b){var c=b.querySelector('.lu-ip-cur'),p=b.querySelector('.lu-ip-ph');if(c)c.textContent=e||'';if(p)p.style.display=e?'none':'';}}})" style="display:inline-flex;align-items:center;gap:7px;height:36px;min-width:64px;padding:0 12px;font-size:20px;justify-content:center;cursor:pointer">`+
  `<span class="lu-ip-cur">${safe}</span><span class="lu-ip-ph" style="font-size:11px;color:var(--t3);${current?'display:none':''}">${esc(placeholder||'Pick…')}</span></button>`;
}
function saveThemeAsProfile(){
  const name=prompt('Name this profile (e.g. "Morning Focus", "Evening Wind-down"):','');
  if(!name||!name.trim())return;
  const emoji=prompt('Pick an emoji icon (optional):','🎨')||'🎨';
  const arr=Array.isArray(D.prefs.themeProfiles)?D.prefs.themeProfiles:[];
  arr.push({
    id:Date.now(),
    name:name.trim(),
    emoji:emoji.trim().slice(0,4)||'🎨',
    theme:Object.assign({},D.prefs.theme||{}),
    pageAccents:Object.assign({},D.prefs.pageAccents||{}),
    fontFamily:D.prefs.themeFontFamily||null,
    fontScale:D.prefs.themeFontScale||null,
    createdAt:new Date().toISOString(),
  });
  D.prefs.themeProfiles=arr;save('prefs');
  if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
  toast('✓ Profile saved');
}
function loadThemeProfile(id){
  const p=(D.prefs.themeProfiles||[]).find(x=>x.id===id);if(!p)return;
  D.prefs.theme=Object.assign({},p.theme||{});
  D.prefs.pageAccents=Object.assign({},p.pageAccents||{});
  if(p.fontFamily!==undefined)D.prefs.themeFontFamily=p.fontFamily;
  if(p.fontScale!==undefined)D.prefs.themeFontScale=p.fontScale;
  save('prefs');applyTheme();
  if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
  toast(`${p.emoji||'🎨'} Loaded: ${p.name}`);
}
function deleteThemeProfile(id){
  const p=(D.prefs.themeProfiles||[]).find(x=>x.id===id);if(!p)return;
  if(!confirm('Delete profile "'+p.name+'"? Any schedule using it will become inactive.'))return;
  D.prefs.themeProfiles=(D.prefs.themeProfiles||[]).filter(x=>x.id!==id);
  // Disable any schedules pointing at it
  (D.prefs.themeSchedule||[]).forEach(s=>{if(s.profileId===id)s.enabled=false;});
  save('prefs');
  if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
  toast('Profile deleted');
}
function renameThemeProfile(id){
  const p=(D.prefs.themeProfiles||[]).find(x=>x.id===id);if(!p)return;
  const name=prompt('Rename profile:',p.name);if(!name||!name.trim())return;
  p.name=name.trim();save('prefs');
  if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
}
// ───── Schedule rule helpers ─────
function addThemeSchedule(){
  const profiles=D.prefs.themeProfiles||[];
  if(!profiles.length){toast('Save at least one profile first');return;}
  const arr=Array.isArray(D.prefs.themeSchedule)?D.prefs.themeSchedule:[];
  arr.push({
    id:Date.now(),
    enabled:true,
    profileId:profiles[0].id,
    days:[0,1,2,3,4,5,6],
    start:'09:00',
    end:'12:00',
  });
  D.prefs.themeSchedule=arr;save('prefs');applyTheme();
  if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
}
function updateThemeSchedule(id,patch){
  const arr=D.prefs.themeSchedule||[];const e=arr.find(x=>x.id===id);if(!e)return;
  Object.assign(e,patch);save('prefs');applyTheme();
}
function deleteThemeSchedule(id){
  D.prefs.themeSchedule=(D.prefs.themeSchedule||[]).filter(x=>x.id!==id);
  save('prefs');applyTheme();
  if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
}
function toggleDarkMode(el){
  el.classList.toggle('on');
  D.prefs.darkMode=el.classList.contains('on');
  save('prefs'); // was raw localStorage — bypassed server sync, so it reverted on refresh
  applyPrefs();
  toast(D.prefs.darkMode?'🌙 Dark mode on':'☀️ Light mode on');
}
// ── Topbar dark/light switch ───────────────────────────────────────────────
// Same pref as Settings → Appearance, but callable without a `.tog` element,
// so the two controls cannot disagree about what "on" means.
//
// NB it must call applyTheme() as well as applyPrefs(): applyPrefs toggles the
// `light-mode` CLASS, but the actual palette comes from the CSS custom
// properties applyTheme() writes inline on <body>. Removing/adding the class
// alone does not repaint the theme — a documented trap in this codebase.
function toggleThemeMode(){
  D.prefs=D.prefs||{};
  const goingDark=D.prefs.darkMode===false;   // currently light -> go dark
  D.prefs.darkMode=goingDark;
  save('prefs');
  applyPrefs();
  if(typeof applyTheme==='function')applyTheme();
  if(typeof curScreen!=='undefined'&&typeof renderScreen==='function')renderScreen(curScreen);
  toast(goingDark?'🌙 Dark mode on':'☀️ Light mode on');
}
// Paints the topbar button for the CURRENT mode, and keeps the Settings toggle
// in sync so switching from the topbar while that panel is open doesn't leave
// it showing a stale state.
function _syncThemeToggleBtn(){
  const dark=!(D.prefs&&D.prefs.darkMode===false);
  const btn=document.getElementById('topbar-theme-btn');
  if(btn){
    // Show the action, not the state: in dark mode offer the sun (switch to light).
    btn.innerHTML=dark
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';
    const label=dark?'Switch to light mode':'Switch to dark mode';
    btn.setAttribute('aria-label',label);
    btn.setAttribute('title',label);
  }
  const tog=document.getElementById('tog-dark');   // Settings → Appearance
  if(tog)tog.classList.toggle('on',dark);
}
// Aurora Glass on/off. The look is entirely CSS scoped to body.aurora, so this
// is the whole implementation of the switch.
function toggleAuroraGlass(el){
  el.classList.toggle('on');
  D.prefs.auroraGlass=el.classList.contains('on');
  save('prefs');
  applyPrefs();
  toast(D.prefs.auroraGlass?'✨ Aurora Glass on':'Aurora Glass off');
}
// Daybreak Pop on/off. Light-mode only — the CSS is scoped to
// body.light-mode.daybreak, so toggling it in dark mode changes nothing
// visible, which the Settings row says explicitly.
function toggleDaybreakPop(el){
  el.classList.toggle('on');
  D.prefs.daybreakPop=el.classList.contains('on');
  save('prefs');
  applyPrefs();
  const lit=D.prefs.darkMode===false;
  toast(D.prefs.daybreakPop
    ?(lit?'🌅 Daybreak Pop on':'🌅 Daybreak Pop on — shows in light mode')
    :'Daybreak Pop off');
}
// Electric Ink on/off. Dark-mode only — the CSS is scoped to
// body:not(.light-mode).electric and the tokens only merge when dark, so
// enabling it while in light mode changes nothing visible. The toast says so
// rather than silently doing nothing; we deliberately do NOT flip the user's
// darkMode pref for them.
function toggleElectricInk(el){
  el.classList.toggle('on');
  D.prefs.electricInk=el.classList.contains('on');
  save('prefs');
  applyPrefs();
  if(typeof applyTheme==='function')applyTheme();   // ground/text tokens
  const lit=D.prefs.darkMode===false;
  toast(D.prefs.electricInk
    ?(lit?'⚡ Electric Ink on — switch to dark mode to see it':'⚡ Electric Ink on')
    :'Electric Ink off');
}
// Chromatic Bento on/off. Home-scoped, so the toast says where to look.
function toggleChromaticBento(el){
  el.classList.toggle('on');
  D.prefs.chromaticBento=el.classList.contains('on');
  save('prefs');
  applyPrefs();
  if(typeof curScreen!=='undefined'&&curScreen==='home'&&typeof renderScreen==='function')renderScreen('home');
  toast(D.prefs.chromaticBento?'🎨 Colour tiles on — see Home':'Colour tiles off');
}
function toggleCompact(el){
  el.classList.toggle('on');
  D.prefs.compact=el.classList.contains('on');
  D.prefs.density=D.prefs.compact?'compact':'normal';
  save('prefs');
  applyPrefs();
  toast(D.prefs.compact?'Compact mode on':'Compact mode off');
}
function toggleAccentDrift(el){
  el.classList.toggle('on');
  D.prefs=D.prefs||{};
  D.prefs.accentDrift=el.classList.contains('on');
  save('prefs');
  if(typeof applyTheme==='function')applyTheme();
  toast(D.prefs.accentDrift?'🌅 Accent drift on':'Accent drift off');
}
// Density selector (#13) — sets D.prefs.density to 'compact' | 'normal' | 'dense'.
// Keeps the legacy `compact` boolean in sync so old code paths still work.
function setDensity(level){
  if(!['compact','normal','dense'].includes(level))level='normal';
  D.prefs.density=level;
  D.prefs.compact=(level==='compact');
  save('prefs');
  applyPrefs();
  if(typeof renderScreen==='function'&&typeof curScreen!=='undefined'&&curScreen==='settings')renderScreen('settings');
  toast({type:'success',title:'Density updated',msg:`Switched to ${level} density.`,duration:2500});
}
function setAccent(c){
  D.prefs.accent=c;
  save('prefs');
  applyPrefs();
  renderScreen('settings');
  toast('Accent color updated');
}
// Ignores ids that aren't finite numbers: one string id (Atlas spawns used
// 'n_…') made Math.max return NaN, so every later note/journal got id NaN,
// which the server dropped — the items were lost on the next load.
var nextId=(arr)=>{let m=0;for(const x of (arr||[])){const v=Number(x&&x.id);if(Number.isFinite(v)&&v>m)m=v;}return m+1;};

// ====== NAVIGATION ======
const SM={home:'s-home',tasks:'s-tasks',notes:'s-notes',mail:'s-mail',calendar:'s-calendar',projects:'s-projects',programs:'s-programs',clusters:'s-clusters',goals:'s-goals',journal:'s-journal',archive:'s-archive',settings:'s-settings',myday:'s-myday',myweek:'s-myweek',myyear:'s-myyear',process:'s-process',habits:'s-habits',coach:'s-coach',team:'s-team',capture:'s-home',ideas:'s-ideas',mindmaps:'s-mindmaps',focus:'s-focus',contacts:'s-contacts',help:'s-help',bookmarks:'s-bookmarks',reports:'s-reports',graph:'s-graph',command:'s-command',standup:'s-standup',pipeline:'s-pipeline',atlas:'s-atlas',money:'s-money'};
var curScreen='home';
function nav(s){
  // A hidden page can still be reached by a deep link, the command palette or
  // an in-app link. Turn it back on rather than dead-ending on a blank screen.
  if(s&&typeof luPageOn==='function'&&!luPageOn(s)){
    luSetPageOn(s,true);
    const d=luPageDef(s);
    if(typeof toast==='function'&&d)toast(`${d.label} was hidden — turned back on`);
  }
  document.querySelectorAll('.scr').forEach(x=>x.classList.remove('on'));
  document.getElementById(SM[s]||'s-home').classList.add('on');
  curScreen=s;
  _curScreen=s;
  // Tag the body with the active screen so per-page accent theming applies
  // (gradient header strip + card left-border tint + empty-state CTA color).
  document.body.setAttribute('data-screen',s||'home');
  // Auto-close the mobile sidebar after navigation so it doesn't sit open
  if(typeof toggleMobileSidebar==='function')toggleMobileSidebar(false);
  initSidebars(s);
  renderScreen(s);
  if(s==='capture')openModal('capture');
  // Trigger proactive hints after a delay
  if(typeof triggerProactiveHint==='function')triggerProactiveHint(s);
}
// ─── Right-rail shortcuts legend ────────────────────────────────────
// A compact reference card auto-appended to every visible right rail
// (.rr) and the Notes-page rail (.notes-rail). Collapsible; state saved
// to localStorage. Click "show all" to open the full shortcuts overlay.
function _renderShortcutsLegend(){
  const collapsed=localStorage.getItem('lu_sc_legend_collapsed')==='1';
  // Common essentials — short list to keep the card compact.
  const _ck=_isMac?'⌘':'Ctrl';
  const rows=[
    {label:'Command Palette',keys:[_ck,'K']},
    {label:'AI Chat',keys:[_ck,'J']},
    {label:'New Task',keys:[_ck,'N']},
    {label:'Save',keys:[_ck,'S']},
    {label:'All shortcuts',keys:['?']},
    {label:'Close',keys:['Esc']},
  ];
  const html=`<div class="lu-sc-legend ${collapsed?'collapsed':''}" id="lu-sc-legend">
    <div class="lu-sc-legend-h" onclick="_toggleSCLegend()">
      <span class="lu-sc-legend-h-title">⌨ Shortcuts</span>
      <span class="lu-sc-legend-h-toggle">▾</span>
    </div>
    <div class="lu-sc-legend-rows">
      ${rows.map(r=>`<div class="lu-sc-legend-row"><span class="lu-sc-label">${esc(r.label)}</span><span class="lu-sc-keys">${r.keys.map(k=>`<kbd>${esc(k)}</kbd>`).join('')}</span></div>`).join('')}
      <div class="lu-sc-legend-more" onclick="openShortcuts()">See all → press ?</div>
    </div>
  </div>`;
  // Append to every visible right rail. Skip ones that already have it.
  const rails=document.querySelectorAll('.scr.on .rr, .scr.on .notes-rail');
  rails.forEach(r=>{
    if(r.querySelector('#lu-sc-legend'))return;
    r.insertAdjacentHTML('beforeend',html);
  });
}
function _toggleSCLegend(){
  const el=document.getElementById('lu-sc-legend');if(!el)return;
  const willCollapse=!el.classList.contains('collapsed');
  el.classList.toggle('collapsed',willCollapse);
  try{localStorage.setItem('lu_sc_legend_collapsed',willCollapse?'1':'0');}catch(_){}
  // Apply to any other instances rendered into other rails
  document.querySelectorAll('.lu-sc-legend').forEach(x=>x.classList.toggle('collapsed',willCollapse));
}
// Mini-week strip (#10). 7-day calendar overview pinned to every right rail
// — today + the next 6 days, each cell showing day-of-week, date number, and
// dots for tasks (accent) and meetings (blue). Click a cell to jump to Cal.
// Toggleable via D.prefs.miniWeekStrip (default on).
function _renderMiniWeekStrip(){
  if(D.prefs&&D.prefs.miniWeekStrip===false)return;
  const today=new Date();today.setHours(0,0,0,0);
  const dayLetters=['S','M','T','W','T','F','S'];
  const cells=Array.from({length:7},(_,i)=>{
    const d=_pd(today);d.setDate(d.getDate()+i);
    const k=_ymd(d);
    const isToday=i===0;
    const taskCount=(D.tasks||[]).filter(t=>t.status!=='Done'&&(t.due===k||t.startDate===k)).length;
    const evtCount=_calEventsOn(d).length;
    const dots=[];
    if(taskCount)dots.push(`<span class="lu-mini-week-dot" title="${taskCount} task${taskCount===1?'':'s'}"></span>`);
    if(evtCount)dots.push(`<span class="lu-mini-week-dot evt" title="${evtCount} event${evtCount===1?'':'s'}"></span>`);
    return `<div class="lu-mini-week-cell ${isToday?'today':''}" role="button" tabindex="0" onclick="_openCalDay('${k}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();_openCalDay('${k}')}" title="${d.toDateString()}${taskCount?` · ${taskCount} task${taskCount===1?'':'s'}`:''}${evtCount?` · ${evtCount} event${evtCount===1?'':'s'}`:''}">
      <span class="lu-mini-week-dow">${dayLetters[d.getDay()]}</span>
      <span class="lu-mini-week-num">${d.getDate()}</span>
      <span class="lu-mini-week-dots">${dots.join('')}</span>
    </div>`;
  }).join('');
  const html=`<div class="lu-mini-week" id="lu-mini-week">
    <div class="lu-mini-week-h"><span>Next 7 Days</span><a href="javascript:void(0)" onclick="nav('calendar')">Open calendar →</a></div>
    <div class="lu-mini-week-grid">${cells}</div>
  </div>`;
  // Inject as the FIRST child of every visible right rail.
  const rails=document.querySelectorAll('.scr.on .rr, .scr.on .notes-rail');
  rails.forEach(r=>{
    const old=r.querySelector('#lu-mini-week');if(old)old.remove();
    r.insertAdjacentHTML('afterbegin',html);
  });
}
// One discoverable way into per-page customization, injected into every rail
// alongside the shortcuts legend — the same trick _renderMiniWeekStrip uses,
// and far safer than threading a button through a dozen page headers. Pages
// with no rail are covered by Settings → Workspace and the command palette.
function _renderCustomizeAffordance(){
  const page=typeof curScreen!=='undefined'?curScreen:'home';
  const html=`<div class="lu-page-customize" style="margin-top:8px">
    <button class="btn btn-s" style="width:100%;font-size:11px;height:26px"
      onclick="openPageCustomize('${_jsAttr(page)}')"
      title="Choose which sections show on this page">⚙ Customize this page</button>
  </div>`;
  document.querySelectorAll('.scr.on .rr, .scr.on .notes-rail').forEach(r=>{
    const old=r.querySelector('.lu-page-customize');if(old)old.remove();
    r.insertAdjacentHTML('beforeend',html);
  });
}
// Auto-inject after every screen render. renderScreen is the orchestrator
// that fires per-page render functions; we tack on the legend afterwards.
const _origRenderScreen=window.renderScreen||function(){};
window.renderScreen=function(s){
  const r=_origRenderScreen.apply(this,arguments);
  setTimeout(()=>{_renderMiniWeekStrip();_renderShortcutsLegend();_applyPlatformKeys();_renderCustomizeAffordance();},50);
  return r;
};
// On non-Mac, swap the static Mac ⌘ glyph for "Ctrl" in keyboard-shortcut hints.
function _applyPlatformKeys(){
  if(_isMac)return;
  document.querySelectorAll('kbd').forEach(k=>{
    if(k.textContent.indexOf('⌘')>-1)k.textContent=k.textContent.replace(/⌘/g,'Ctrl');
  });
  document.querySelectorAll('.cmdp-kbd,#gSearch+span').forEach(el=>{
    if(el.textContent.indexOf('⌘')>-1)el.textContent=el.textContent.replace(/⌘/g,'Ctrl ');
  });
}
// Also try on initial load (in case the first page renders before this
// patch is in scope) and whenever the user opens a new screen.
document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{_renderMiniWeekStrip();_renderShortcutsLegend();_applyPlatformKeys();},500));

// ─── Keyboard shortcuts overlay ──────────────────────────────────────
function openShortcuts(){
  const ov=document.getElementById('shortcuts-overlay');if(!ov)return;
  ov.classList.add('show');
  document.addEventListener('keydown',_shortcutsEsc);
}
function closeShortcuts(){
  const ov=document.getElementById('shortcuts-overlay');if(!ov)return;
  ov.classList.remove('show');
  document.removeEventListener('keydown',_shortcutsEsc);
}
function _shortcutsEsc(e){if(e.key==='Escape'){e.preventDefault();closeShortcuts();}}

// ─── Image lightbox ──────────────────────────────────────────────────
// Click any inline image inside a note / journal / idea / goal / report
// body to open a full-screen viewer. Arrow keys navigate between images
// within the same container; Esc closes.
let _lbImages=[];let _lbIdx=0;
function _lbContainerOf(img){
  // Walk up until we hit a content container that's a sensible 'gallery scope'.
  const stops=['notes-editor-panel','notes-editor','dr-note-rte','dr-diary-rte','dr-goal-rte','fa-note-rte','fa-jrnl-rte','fa-goal-rte','nie-body','reports-main','modal-content','drawer-content'];
  let el=img.parentElement;
  while(el&&el!==document.body){
    if(el.id&&stops.includes(el.id))return el;
    if(el.classList&&(el.classList.contains('md-body')||el.classList.contains('notes-editor')||el.classList.contains('cd')))return el;
    el=el.parentElement;
  }
  return img.parentElement||document.body;
}
function openLightbox(img){
  if(!img||!img.src)return;
  const ctx=_lbContainerOf(img);
  _lbImages=[...ctx.querySelectorAll('img')].filter(i=>i.src&&!i.classList.contains('nc-thumb')&&!i.classList.contains('lu-lightbox-img-thumb'));
  _lbIdx=Math.max(0,_lbImages.indexOf(img));
  _renderLightbox();
  const ov=document.getElementById('lu-lightbox');if(ov)ov.classList.add('show');
  document.addEventListener('keydown',_lbKey);
}
function closeLightbox(){
  const ov=document.getElementById('lu-lightbox');if(ov)ov.classList.remove('show');
  document.removeEventListener('keydown',_lbKey);
}
function stepLightbox(d){
  if(!_lbImages.length)return;
  _lbIdx=(_lbIdx+d+_lbImages.length)%_lbImages.length;
  _renderLightbox();
}
function _renderLightbox(){
  const im=document.getElementById('lu-lightbox-img');
  const ct=document.getElementById('lu-lightbox-counter');
  const prev=document.getElementById('lu-lightbox-prev');
  const next=document.getElementById('lu-lightbox-next');
  if(!im||!_lbImages.length)return;
  const src=_lbImages[_lbIdx];
  im.src=src.src;im.alt=src.alt||'';
  if(ct)ct.textContent=_lbImages.length>1?`${_lbIdx+1} / ${_lbImages.length}`:'';
  const showNav=_lbImages.length>1;
  if(prev)prev.style.display=showNav?'flex':'none';
  if(next)next.style.display=showNav?'flex':'none';
  if(ct)ct.style.display=showNav?'block':'none';
}
function _lbKey(e){
  if(e.key==='Escape'){e.preventDefault();closeLightbox();}
  else if(e.key==='ArrowRight'){e.preventDefault();stepLightbox(1);}
  else if(e.key==='ArrowLeft'){e.preventDefault();stepLightbox(-1);}
}
// Delegated click listener — any IMG inside content surfaces opens the
// lightbox without needing inline handlers on each one. Sidebar/topbar
// icons and note thumbnails are excluded.
document.addEventListener('click',function(e){
  const t=e.target;if(!t||t.tagName!=='IMG')return;
  // Skip avatars, thumbnails, icons, etc.
  if(t.classList.contains('nc-thumb')||t.closest('.nc-thumb')||t.closest('.av')||t.closest('.logo')||t.closest('.sb'))return;
  // Only handle clicks in content regions
  const ok=t.closest('.notes-editor')||t.closest('#notes-editor-panel')||t.closest('.md-body')||t.closest('#dr-note-rte')||t.closest('#dr-diary-rte')||t.closest('#dr-goal-rte')||t.closest('#fa-note-rte')||t.closest('#fa-jrnl-rte')||t.closest('#fa-goal-rte')||t.closest('[id^="idea-body-rte-"]')||t.closest('#nie-body')||t.closest('#reports-main')||t.closest('#drawer-content')||t.closest('#modal-content');
  if(!ok)return;
  // Skip when inside any contenteditable that's actively focused — let the
  // user click to position cursor / select the image without it zooming.
  if(t.closest('[contenteditable="true"]')&&document.activeElement&&document.activeElement.isContentEditable)return;
  e.preventDefault();
  openLightbox(t);
},true);

// ═══════════════════════════════════════════════════════════════════
// KNOWLEDGE GRAPH — force-directed visualisation of all notes connected
// by [[wiki-links]] and shared tags. Pure SVG + JS Verlet integration,
// no external libs.
// ═══════════════════════════════════════════════════════════════════
let _kgState=null; // {nodes:[{id,x,y,vx,vy,r,color,title,degree}], links:[{a,b}], view:{x,y,zoom}}
let _kgRaf=null;
let _kgDrag=null; // {nodeId, startMouse, startNodePos}
let _kgPan=null;
let _kgHover=null;
let _kgMoved=false; // true when the last mouse-down turned into a drag/pan
// Edge taxonomy. Priority order = which type "wins" the line style when a
// pair is connected several ways; also the order shown in the legend.
const KG_TYPE_ORDER=['wiki','linked','mention','tag','similar','folder'];
const KG_EDGE_STYLE={
  wiki   :{c:'168,85,247', w:2,   dash:'',    label:'[[wiki link]]'},
  linked :{c:'59,130,246', w:2,   dash:'',    label:'Linked item (drawer)'},
  mention:{c:'168,85,247', w:1.3, dash:'2 4', label:'Title mentioned in text'},
  tag    :{c:'168,85,247', w:1,   dash:'4 3', label:'Shared #tag'},
  similar:{c:'45,212,191', w:1,   dash:'5 4', label:'Similar content'},
  folder :{c:'148,163,184',w:1,   dash:'1 4', label:'Same folder'},
};
const KG_PALETTE=['#a855f7','#3b82f6','#22c55e','#f59e0b','#ec4899','#06b6d4','#ef4444','#14b8a6','#8b5cf6','#0ea5e9','#f97316','#84cc16'];
function _kgHashHue(s){let h=0;s=String(s||'');for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h;}
function _kgColorForKey(s){if(!s)return '#64748b';return KG_PALETTE[_kgHashHue(s)%KG_PALETTE.length];}
const KG_STOP=new Set(('the a an and or but if then else of to in on at by for with from into over under is are was were be been being this that these those it its as not no do does did have has had will would can could should i you he she they we my your our their about more most some any all out up down so than too very just'.split(' ')));
function _kgTokens(s){
  return (String(s||'').toLowerCase().replace(/\[\[([^\]]+)\]\]/g,'$1').match(/[a-z][a-z0-9]{3,}/g)||[]).filter(w=>!KG_STOP.has(w));
}
function _kgSettings(){
  let edges;try{edges=JSON.parse(localStorage.getItem('lu_kg_edges')||'null');}catch(_){}
  if(!edges||typeof edges!=='object')edges={wiki:true,linked:true,mention:true,tag:true,similar:false,folder:false};
  return {
    edges,
    colorBy:localStorage.getItem('lu_kg_colorby')||'palette', // palette|tag|folder|color
    cluster:localStorage.getItem('lu_kg_cluster')||'none',     // none|tag|folder|color
    tagFilter:localStorage.getItem('lu_kg_tagfilter')||'',
    hideOrphans:localStorage.getItem('lu_kg_hide_orphans')==='1',
  };
}
function _kgSetEdge(type,on){const s=_kgSettings();s.edges[type]=!!on;localStorage.setItem('lu_kg_edges',JSON.stringify(s.edges));if(_kgState){_kgState.enabled=s.edges;_kgRender();_kgRenderInfo();}}
function _kgSetColorBy(v){localStorage.setItem('lu_kg_colorby',v);renderKnowledgeGraph();}
function _kgSetCluster(v){localStorage.setItem('lu_kg_cluster',v);renderKnowledgeGraph();}
function _kgSetTagFilter(v){if(v)localStorage.setItem('lu_kg_tagfilter',v);else localStorage.removeItem('lu_kg_tagfilter');renderKnowledgeGraph();}
function _kgToggleSettingsPop(){const p=document.getElementById('kg-settings-pop');if(p)p.style.display=p.style.display==='none'?'block':'none';}
function renderKnowledgeGraph(){
  const main=document.getElementById('graph-main');if(!main)return;
  const cfg=_kgSettings();
  let notes=(D.notes||[]).slice();
  // Optional single-tag focus.
  const allTags=[...new Set((D.notes||[]).flatMap(n=>n.tags||[]))].sort((a,b)=>a.localeCompare(b));
  if(cfg.tagFilter)notes=notes.filter(n=>(n.tags||[]).includes(cfg.tagFilter));
  const folders=(typeof _noteFolders==='function'?_noteFolders():[])||[];
  const folderName=id=>{const f=folders.find(x=>x.id===id);return f?f.name:null;};
  const titleToId={};notes.forEach(n=>{const t=(n.title||'').trim().toLowerCase();if(t&&!(t in titleToId))titleToId[t]=n.id;});
  // ── Build every edge type into one de-duped pair map (edge.types = Set). ──
  const pairs=new Map();
  const addEdge=(a,b,type)=>{if(a==null||b==null||a===b)return;const k=a<b?a+'_'+b:b+'_'+a;let e=pairs.get(k);if(!e){e={a:Math.min(a,b),b:Math.max(a,b),types:[]};pairs.set(k,e);}if(!e.types.includes(type))e.types.push(type);};
  notes.forEach(n=>{
    // wiki [[Title]]
    [...String(n.body||'').matchAll(/\[\[([^\]]+)\]\]/g)].forEach(m=>{const id=titleToId[m[1].trim().toLowerCase()];if(id)addEdge(n.id,id,'wiki');});
    // explicit drawer "Linked items"
    (n.linkedNoteIds||[]).forEach(id=>{if((D.notes||[]).some(x=>x.id===id))addEdge(n.id,id,'linked');});
  });
  // mention: another note's title appears verbatim in this note's text
  const mentionTitles=notes.filter(n=>{const t=(n.title||'').trim();return t.length>=5&&!/^untitled/i.test(t);}).map(n=>({id:n.id,t:(n.title||'').trim().toLowerCase()}));
  if(notes.length<=900){
    notes.forEach(n=>{
      const body=(' '+String(n.body||'').toLowerCase().replace(/\[\[([^\]]+)\]\]/g,'$1')+' ');
      if(body.length<6)return;
      mentionTitles.forEach(mt=>{if(mt.id!==n.id&&body.indexOf(mt.t)>=0)addEdge(n.id,mt.id,'mention');});
    });
  }
  // shared #tag
  const tagged=notes.filter(n=>(n.tags||[]).length);
  for(let i=0;i<tagged.length;i++)for(let j=i+1;j<tagged.length;j++){
    if((tagged[i].tags||[]).some(t=>(tagged[j].tags||[]).includes(t)))addEdge(tagged[i].id,tagged[j].id,'tag');
  }
  // similar content (top-token Jaccard) — capped for perf
  if(notes.length<=600){
    const tok=notes.map(n=>({id:n.id,s:new Set(_kgTokens(n.title+' '+n.body).slice(0,40))}));
    for(let i=0;i<tok.length;i++)for(let j=i+1;j<tok.length;j++){
      const A=tok[i].s,B=tok[j].s;if(A.size<4||B.size<4)continue;
      let inter=0;A.forEach(w=>{if(B.has(w))inter++;});
      if(inter<3)continue;
      const jac=inter/(A.size+B.size-inter);
      if(jac>=0.16)addEdge(tok[i].id,tok[j].id,'similar');
    }
  }
  // same folder — connect as a star to the folder's first note (keeps it O(n))
  const byFolder={};notes.forEach(n=>{if(n.folderId!=null){(byFolder[n.folderId]=byFolder[n.folderId]||[]).push(n.id);}});
  Object.values(byFolder).forEach(ids=>{if(ids.length<2)return;ids.sort((a,b)=>a-b);for(let i=1;i<ids.length;i++)addEdge(ids[0],ids[i],'folder');});
  const links=[...pairs.values()];
  // Degree from all built edges (stable node sizing regardless of toggles).
  const degree={};links.forEach(e=>{degree[e.a]=(degree[e.a]||0)+1;degree[e.b]=(degree[e.b]||0)+1;});
  const connectedIds=new Set();links.forEach(e=>{connectedIds.add(e.a);connectedIds.add(e.b);});
  const orphanCount=notes.filter(n=>!connectedIds.has(n.id)).length;
  const visibleNotes=cfg.hideOrphans?notes.filter(n=>connectedIds.has(n.id)):notes;
  const hideOrphans=cfg.hideOrphans;
  // ── Clustering layout: assign each node a cluster key + a fixed centroid ──
  const clusterKeyOf=n=>{
    if(cfg.cluster==='tag')return (n.tags&&n.tags[0])||'(untagged)';
    if(cfg.cluster==='folder')return folderName(n.folderId)||'(no folder)';
    if(cfg.cluster==='color')return n.color||'(no color)';
    return null;
  };
  const W=main.clientWidth||900;const H=main.clientHeight||640;
  const cx=W/2,cy=H/2;const R=Math.min(W,H)*0.34;
  let clusters=[];
  if(cfg.cluster!=='none'){
    const keys=[...new Set(visibleNotes.map(clusterKeyOf))];
    const cols=Math.ceil(Math.sqrt(keys.length));
    const rows=Math.ceil(keys.length/cols);
    const gx=W/(cols+1),gy=H/(rows+1);
    clusters=keys.map((k,i)=>({key:k,label:String(k),cx:gx*((i%cols)+1),cy:gy*(Math.floor(i/cols)+1),color:_kgColorForKey(k)}));
  }
  const clusterByKey={};clusters.forEach(c=>{clusterByKey[c.key]=c;});
  const colorOf=n=>{
    if(cfg.colorBy==='tag')return _kgColorForKey((n.tags&&n.tags[0])||'');
    if(cfg.colorBy==='folder')return _kgColorForKey(folderName(n.folderId)||'');
    if(cfg.colorBy==='color')return n.color||'#64748b';
    return n.color||KG_PALETTE[_kgHashHue(n.title||'')%KG_PALETTE.length];
  };
  const N=visibleNotes.length;
  const nodes=visibleNotes.map((n,i)=>{
    const deg=degree[n.id]||0;
    const ck=clusterKeyOf(n);const cl=ck!=null?clusterByKey[ck]:null;
    const baseX=cl?cl.cx:cx,baseY=cl?cl.cy:cy;
    const ang=(i/Math.max(N,1))*Math.PI*2;const rr=cl?60:R;
    return {
      id:n.id,title:n.title||'(untitled)',
      x:baseX+Math.cos(ang)*rr+(Math.random()-0.5)*30,
      y:baseY+Math.sin(ang)*rr+(Math.random()-0.5)*30,
      vx:0,vy:0,
      r:Math.max(5,Math.min(22,6+deg*1.4)),
      color:colorOf(n),
      degree:deg,
      starred:!!n.starred,
      clusterKey:ck,
    };
  });
  _kgState={
    nodes,links,
    view:{x:0,y:0,zoom:1},
    selected:null,
    search:'',
    enabled:cfg.edges,
    colorBy:cfg.colorBy,
    cluster:cfg.cluster,
    clusters,
    orphanCount,
  };
  // Per-type counts (for legend / header).
  const typeCounts={};links.forEach(e=>e.types.forEach(t=>{typeCounts[t]=(typeCounts[t]||0)+1;}));
  const enabledLinkCount=links.filter(e=>e.types.some(t=>cfg.edges[t])).length;
  const totalEdges=enabledLinkCount;
  const helpSeen=localStorage.getItem('lu_kg_help_seen')==='1';
  // Built-in guide / legend — explains exactly what the graph represents and
  // how to drive it. Collapsible; auto-shows the first time, then on demand.
  const guideHtml=`<div id="kg-guide" style="position:absolute;top:14px;left:14px;width:300px;max-width:calc(100% - 28px);background:var(--s1);border:1px solid var(--bd2);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.45);z-index:20;font-size:11.5px;color:var(--t2);display:${helpSeen?'none':'block'}">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--bd1)">
      <strong style="font-size:12px;color:var(--t1)">🕸 How to read this graph</strong>
      <button class="btn btn-s" style="height:22px;width:22px;padding:0;font-size:12px" onclick="_kgToggleGuide(false)" title="Close">✕</button>
    </div>
    <div style="padding:12px;line-height:1.6">
      <div style="margin-bottom:8px"><strong style="color:var(--t1)">What it shows</strong><br>Every <strong>circle is a note</strong>. Bigger circles have more connections; a <span style="color:#facc15">gold ring</span> means starred. Lines connect related notes — six ways:</div>
      ${KG_TYPE_ORDER.map(t=>{const s=KG_EDGE_STYLE[t];const on=cfg.edges[t];return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;${on?'':'opacity:.45'}"><svg width="32" height="8" style="flex-shrink:0"><line x1="0" y1="4" x2="32" y2="4" stroke="rgba(${s.c},.85)" stroke-width="${s.w}" ${s.dash?`stroke-dasharray="${s.dash}"`:''}/></svg> <span>${esc(s.label)}${typeof typeCounts!=='undefined'&&typeCounts[t]?` <span style="color:var(--t3)">· ${typeCounts[t]}</span>`:''}</span></div>`;}).join('')}
      <div style="margin:8px 0 6px"><strong style="color:var(--t1)">How to use it</strong></div>
      <div style="margin-bottom:3px">• <strong>Click</strong> a note → highlight it + its neighbours</div>
      <div style="margin-bottom:3px">• <strong>Double-click</strong> (or “Open”) → edit the note</div>
      <div style="margin-bottom:3px">• <strong>Drag</strong> a note · drag empty space to pan</div>
      <div style="margin-bottom:3px">• <strong>Search</strong> to spotlight matching notes</div>
      <div style="margin-bottom:10px">• <strong>⚙ View</strong> → choose edge types, colour-by, cluster layout</div>
      <div style="background:var(--s2);border:1px solid var(--bd1);border-radius:6px;padding:8px 10px;font-size:11px">💡 Even without manual <code style="background:var(--s3);padding:1px 4px;border-radius:3px">[[links]]</code>, the graph auto-connects notes that mention each other, share tags, sit in the same folder, or cover similar topics. Toggle these under <strong>⚙ View</strong>.</div>
      <label style="display:flex;align-items:center;gap:6px;margin-top:10px;cursor:pointer;font-size:10.5px;color:var(--t3)"><input type="checkbox" onchange="if(this.checked)localStorage.setItem('lu_kg_help_seen','1');else localStorage.removeItem('lu_kg_help_seen')" ${helpSeen?'checked':''}> Don’t show this automatically</label>
    </div>
  </div>`;
  // Selected-node info panel (hidden until a node is clicked).
  const infoHtml=`<div id="kg-info" style="position:absolute;top:14px;right:14px;width:260px;max-width:calc(100% - 28px);background:var(--s1);border:1px solid var(--bd2);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.45);z-index:19;font-size:11.5px;color:var(--t2);display:none"></div>`;
  // Header + canvas
  main.innerHTML=`<div style="position:absolute;inset:0;display:flex;flex-direction:column">
    <div class="ph-r" style="padding:14px 18px;border-bottom:1px solid var(--bd1);background:var(--s1);z-index:5">
      <div>
        <h1 style="font-size:20px;font-weight:700">🕸 Knowledge Graph</h1>
        <p style="font-size:11px;color:var(--t2);margin-top:2px">${nodes.length} note${nodes.length===1?'':'s'} · ${enabledLinkCount} connection${enabledLinkCount===1?'':'s'}${orphanCount?` · ${orphanCount} unconnected`:''}${cfg.tagFilter?` · filtered by #${esc(cfg.tagFilter)}`:''}</p>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;position:relative">
        <input id="kg-search" placeholder="🔍 Find a note…" value="${esc(_kgState.search)}" oninput="_kgSearch(this.value)" style="height:28px;font-size:11px;padding:0 8px;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;color:var(--t1);width:140px">
        <select onchange="_kgSetTagFilter(this.value)" style="height:28px;font-size:11px;padding:0 6px;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;color:var(--t1);max-width:130px" title="Show only notes with this tag">
          <option value="" ${!cfg.tagFilter?'selected':''}>All tags</option>
          ${allTags.map(t=>`<option value="${esc(t)}" ${cfg.tagFilter===t?'selected':''}>#${esc(t)}</option>`).join('')}
        </select>
        <label style="font-size:11px;color:var(--t2);cursor:pointer;display:flex;align-items:center;gap:4px" title="Hide notes with no connections"><input type="checkbox" ${hideOrphans?'checked':''} id="kg-orphans" onchange="_kgToggleOrphans(this.checked)"> hide unconnected</label>
        <button class="btn btn-s" style="height:28px;font-size:11px" onclick="_kgToggleSettingsPop()" title="Edge types, colour-by, cluster layout">⚙ View</button>
        <button class="btn btn-s" style="height:28px;font-size:11px" onclick="_kgRecenter()" title="Re-run the layout from scratch">🎯 Recenter</button>
        <button class="btn btn-s" style="height:28px;font-size:11px" onclick="_kgFreezeLayout()" title="Stop the auto-layout so nodes hold position">⏸ Freeze</button>
        <button class="btn btn-s" style="height:28px;font-size:11px" onclick="_kgToggleGuide()" title="What am I looking at?">❔ Guide</button>
        <div id="kg-settings-pop" style="display:none;position:absolute;top:34px;right:0;width:248px;background:var(--s1);border:1px solid var(--bd2);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.45);z-index:30;padding:12px;font-size:11.5px;color:var(--t2)">
          <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Connection types</div>
          ${KG_TYPE_ORDER.map(t=>{const s=KG_EDGE_STYLE[t];return `<label style="display:flex;align-items:center;gap:7px;cursor:pointer;padding:3px 0"><input type="checkbox" ${cfg.edges[t]?'checked':''} onchange="_kgSetEdge('${t}',this.checked)"><svg width="26" height="8" style="flex-shrink:0"><line x1="0" y1="4" x2="26" y2="4" stroke="rgba(${s.c},.9)" stroke-width="${s.w}" ${s.dash?`stroke-dasharray="${s.dash}"`:''}/></svg><span style="flex:1">${esc(s.label)}</span><span style="color:var(--t3);font-size:11px">${typeCounts[t]||0}</span></label>`;}).join('')}
          <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin:10px 0 4px">Colour nodes by</div>
          <select onchange="_kgSetColorBy(this.value)" class="inp" style="width:100%;height:26px;font-size:11px;padding:0 6px">
            ${[['palette','Note colour / auto'],['tag','First tag'],['folder','Folder'],['color','Manual colour tag']].map(([v,l])=>`<option value="${v}" ${cfg.colorBy===v?'selected':''}>${l}</option>`).join('')}
          </select>
          <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin:10px 0 4px">Cluster layout by</div>
          <select onchange="_kgSetCluster(this.value)" class="inp" style="width:100%;height:26px;font-size:11px;padding:0 6px">
            ${[['none','None (free-floating)'],['tag','First tag'],['folder','Folder'],['color','Colour']].map(([v,l])=>`<option value="${v}" ${cfg.cluster===v?'selected':''}>${l}</option>`).join('')}
          </select>
          <button class="btn btn-s" style="width:100%;height:26px;font-size:11px;margin-top:10px" onclick="_kgToggleSettingsPop()">Close</button>
        </div>
      </div>
    </div>
    <div id="kg-canvas-wrap" style="flex:1;position:relative;overflow:hidden;background:radial-gradient(circle at 50% 50%,color-mix(in srgb,#a855f7 6%,var(--bg)),var(--bg) 70%);cursor:grab">
      <svg id="kg-svg" width="100%" height="100%" style="display:block;user-select:none">
        <g id="kg-cluster-layer"></g>
        <g id="kg-edges-layer"></g>
        <g id="kg-nodes-layer"></g>
      </svg>
      <div id="kg-tip" style="position:absolute;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;padding:6px 10px;font-size:11px;color:var(--t1);pointer-events:none;display:none;box-shadow:0 4px 16px rgba(0,0,0,.4);z-index:10"></div>
      <div id="kg-legend" style="position:absolute;bottom:14px;left:14px;background:color-mix(in srgb,var(--s1) 88%,transparent);border:1px solid var(--bd1);border-radius:8px;padding:8px 10px;font-size:10.5px;color:var(--t2);z-index:11;max-width:240px;${cfg.colorBy==='palette'?'display:none':''}"></div>
      ${guideHtml}
      ${infoHtml}
      ${nodes.length&&totalEdges===0?`<div id="kg-nolinks" style="position:absolute;bottom:18px;left:50%;transform:translateX(-50%);background:var(--s1);border:1px solid var(--bd2);border-radius:8px;padding:10px 16px;font-size:11.5px;color:var(--t2);box-shadow:0 4px 20px rgba(0,0,0,.4);z-index:12;text-align:center;max-width:90%">No connections with the current settings. Open <strong>⚙ View</strong> and enable more connection types (mentions, similar content, same folder), or add <code style="background:var(--s3);padding:1px 4px;border-radius:3px">[[Note Title]]</code> links / shared #tags. <span style="color:var(--ac);cursor:pointer;text-decoration:underline" onclick="_kgToggleGuide(true)">Show guide</span></div>`:''}
      ${nodes.length===0?`<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--t3);text-align:center;padding:40px"><div><div style="font-size:48px;margin-bottom:10px">🕸</div><div style="font-size:14px;font-weight:600;color:var(--t1);margin-bottom:4px">${cfg.tagFilter?'No notes with #'+esc(cfg.tagFilter):(hideOrphans&&orphanCount?'No connected notes yet':'Your graph is empty')}</div><div style="font-size:12px;max-width:360px;margin:0 auto 14px">${cfg.tagFilter?'Try a different tag or choose “All tags”.':(hideOrphans&&orphanCount?`You have ${orphanCount} note${orphanCount===1?'':'s'} but none are connected with the current settings. Untick “hide unconnected”, or enable more connection types under ⚙ View.`:'Create notes — the graph auto-connects them by mentions, tags, folders and similar content.')}</div><button class="btn btn-p" onclick="openFA('note')">+ Create a note</button></div></div>`:''}
    </div>
  </div>`;
  if(!nodes.length)return;
  _kgWireEvents();
  _kgStartSimulation();
}
// Highest-priority *enabled* type for an edge, or null if all its types are
// toggled off (meaning the edge is currently hidden).
function _kgEdgeType(e){
  const en=(_kgState&&_kgState.enabled)||{};
  for(const t of KG_TYPE_ORDER){if(e.types&&e.types.includes(t)&&en[t])return t;}
  return null;
}
// Adjacency for neighbour lookups — only counts currently-visible edges.
function _kgNeighborSet(id){
  const s=new Set();
  if(!_kgState)return s;
  for(const l of _kgState.links){
    if(!_kgEdgeType(l))continue;
    if(l.a===id)s.add(l.b);
    if(l.b===id)s.add(l.a);
  }
  return s;
}
function _kgToggleGuide(force){
  const g=document.getElementById('kg-guide');if(!g)return;
  const show=typeof force==='boolean'?force:(g.style.display==='none');
  g.style.display=show?'block':'none';
  if(!show)localStorage.setItem('lu_kg_help_seen','1');
}
function _kgToggleOrphans(checked){
  localStorage.setItem('lu_kg_hide_orphans',checked?'1':'0');
  renderKnowledgeGraph();
}
function _kgSearch(v){
  if(!_kgState)return;
  _kgState.search=(v||'').trim().toLowerCase();
  _kgRender();
}
function _kgSelectNode(id){
  if(!_kgState)return;
  _kgState.selected=(_kgState.selected===id?null:id);
  _kgRender();
  _kgRenderInfo();
}
function _kgClearSelection(){
  if(!_kgState)return;
  _kgState.selected=null;
  const info=document.getElementById('kg-info');if(info)info.style.display='none';
  _kgRender();
}
function _kgOpenNote(id){
  nav('notes');setTimeout(()=>{if(typeof showNoteInEditor==='function')showNoteInEditor(id);},120);
}
// Wrap the first verbatim occurrence of each mentioned note title in [[ ]] so
// detected mentions become permanent wiki links. Operates only on text
// outside existing [[...]] segments.
function _kgMaterializeMentions(id){
  const n=(D.notes||[]).find(x=>x.id===id);if(!n)return;
  let segs=String(n.body||'').split(/(\[\[[^\]]+\]\])/g);
  const alreadyLinked=new Set();
  segs.forEach(s=>{const m=/^\[\[([^\]]+)\]\]$/.exec(s);if(m)alreadyLinked.add(m[1].trim().toLowerCase());});
  const titles=(D.notes||[]).filter(o=>o.id!==id&&(o.title||'').trim().length>=5)
    .map(o=>o.title.trim()).sort((a,b)=>b.length-a.length);
  let count=0;
  titles.forEach(title=>{
    const tl=title.toLowerCase();
    if(alreadyLinked.has(tl))return;
    for(let i=0;i<segs.length;i++){
      const s=segs[i];
      if(/^\[\[[^\]]+\]\]$/.test(s))continue; // skip existing links
      const idx=s.toLowerCase().indexOf(tl);
      if(idx>=0){
        segs[i]=s.slice(0,idx)+'[['+s.slice(idx,idx+title.length)+']]'+s.slice(idx+title.length);
        alreadyLinked.add(tl);count++;break;
      }
    }
  });
  if(!count){toast('No new mentions to link.');return;}
  n.body=segs.join('');
  n.updated=new Date().toISOString();
  if(typeof save==='function')save('notes');
  toast('🔗 Linked '+count+' mention'+(count===1?'':'s')+' in “'+(n.title||'note')+'”');
  renderKnowledgeGraph();
}
function _kgRenderInfo(){
  const info=document.getElementById('kg-info');if(!info||!_kgState)return;
  const id=_kgState.selected;
  if(id==null){info.style.display='none';return;}
  const node=_kgState.nodes.find(n=>n.id===id);
  const n=(D.notes||[]).find(x=>x.id===id);
  if(!node||!n){info.style.display='none';return;}
  // Build neighbour list with the relationship type for each.
  const relOf={};
  for(const l of _kgState.links){
    const t=_kgEdgeType(l);if(!t)continue;
    if(l.a===id)relOf[l.b]=t;else if(l.b===id)relOf[l.a]=t;
  }
  const neigh=Object.keys(relOf).map(nid=>_kgState.nodes.find(x=>x.id===Number(nid))).filter(Boolean)
    .sort((a,b)=>b.degree-a.degree);
  // Mentions this note makes that aren't real [[links]] yet → offer to convert.
  const bodyLc=' '+String(n.body||'').toLowerCase().replace(/\[\[([^\]]+)\]\]/g,' ')+' ';
  const convertible=(D.notes||[]).filter(o=>o.id!==id&&(o.title||'').trim().length>=5&&bodyLc.indexOf((o.title||'').trim().toLowerCase())>=0).length;
  const tags=(n.tags||[]).slice(0,8);
  const snippet=esc(String(n.body||'').replace(/\[\[([^\]]+)\]\]/g,'$1').replace(/[#*_>`~-]/g,'').replace(/\s+/g,' ').trim().slice(0,160));
  info.innerHTML=`
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid var(--bd1)">
      <div style="min-width:0">
        <div style="font-size:12.5px;font-weight:700;color:var(--t1);word-break:break-word">${esc(node.title)}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">${node.degree} connection${node.degree===1?'':'s'}${node.starred?' · ★ starred':''}</div>
      </div>
      <button class="btn btn-s" style="height:22px;width:22px;padding:0;font-size:12px;flex-shrink:0" onclick="_kgClearSelection()" title="Close">✕</button>
    </div>
    <div style="padding:10px 12px;line-height:1.55">
      ${snippet?`<div style="font-size:11px;color:var(--t2);margin-bottom:8px">${snippet}${snippet.length>=160?'…':''}</div>`:'<div style="font-size:11px;color:var(--t3);margin-bottom:8px;font-style:italic">No body text.</div>'}
      ${tags.length?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">${tags.map(t=>`<span style="font-size:11px;background:var(--s3);color:var(--t2);padding:2px 6px;border-radius:8px">#${esc(t)}</span>`).join('')}</div>`:''}
      ${neigh.length?`<div style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px">Connected notes (${neigh.length})</div><div style="max-height:150px;overflow-y:auto">${neigh.map(x=>{const rt=relOf[x.id];const st=KG_EDGE_STYLE[rt]||{c:'148,163,184',label:rt};return `<div class="lr" style="cursor:pointer;padding:4px 4px" onclick="_kgFocusNode(${x.id})" title="${esc(st.label)} — click to jump"><span style="width:7px;height:7px;border-radius:50%;background:${x.color};flex-shrink:0"></span><span class="rt" style="font-size:11px">${esc(x.title)}</span><span style="font-size:9px;color:rgb(${st.c});flex-shrink:0;border:1px solid rgba(${st.c},.5);border-radius:7px;padding:0 5px">${esc(rt)}</span></div>`;}).join('')}</div>`:'<div style="font-size:10.5px;color:var(--t3)">No connections with the current ⚙ View settings.</div>'}
      ${convertible?`<button class="btn btn-s" style="width:100%;height:26px;font-size:10.5px;margin-top:8px" onclick="_kgMaterializeMentions(${id})" title="Wrap the ${convertible} note title${convertible===1?'':'s'} mentioned in this note's text with [[ ]] so they become permanent links">🔗 Convert ${convertible} mention${convertible===1?'':'s'} to [[links]]</button>`:''}
      <button class="btn btn-p" style="width:100%;height:28px;font-size:11px;margin-top:8px" onclick="_kgOpenNote(${id})">✎ Open note</button>
    </div>`;
  info.style.display='block';
}
function _kgFocusNode(id){
  if(!_kgState)return;
  _kgState.selected=id;
  // Recenter the canvas on the focused node so the user doesn't lose it.
  const wrap=document.getElementById('kg-canvas-wrap');
  const node=_kgState.nodes.find(n=>n.id===id);
  if(wrap&&node){
    const W=wrap.clientWidth,H=wrap.clientHeight;
    const dx=W/2-node.x,dy=H/2-node.y;
    _kgState.nodes.forEach(n=>{n.x+=dx;n.y+=dy;});
  }
  _kgRender();
  _kgRenderInfo();
}
// Resolve which node ids are "active" (full-opacity) given the current
// search query and/or selection. Returns null when nothing is constraining
// the view (everything is active).
function _kgActiveSet(){
  if(!_kgState)return null;
  const sel=_kgState.selected;
  const q=_kgState.search;
  if(sel!=null){
    const s=_kgNeighborSet(sel);s.add(sel);return s;
  }
  if(q){
    const s=new Set();
    _kgState.nodes.forEach(n=>{if((n.title||'').toLowerCase().includes(q))s.add(n.id);});
    return s;
  }
  return null;
}
function _kgPaintEdges(){
  const layer=document.getElementById('kg-edges-layer');if(!layer||!_kgState)return;
  const {nodes,links}=_kgState;
  const byId={};nodes.forEach(n=>{byId[n.id]=n;});
  const active=_kgActiveSet();
  const sel=_kgState.selected;
  const parts=[];
  for(const l of links){
    const t=_kgEdgeType(l);if(!t)continue;
    const a=byId[l.a],b=byId[l.b];if(!a||!b)continue;
    let lit;
    if(sel!=null)lit=(l.a===sel||l.b===sel);
    else if(active)lit=active.has(l.a)&&active.has(l.b);
    else lit=true;
    const st=KG_EDGE_STYLE[t];
    const stroke=`rgba(${st.c},${lit?0.75:0.08})`;
    const dash=st.dash?`stroke-dasharray="${st.dash}"`:'';
    parts.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${stroke}" stroke-width="${lit?st.w:Math.min(st.w,1)}" ${dash}/>`);
  }
  layer.innerHTML=parts.join('');
}
function _kgPaintClusters(){
  const layer=document.getElementById('kg-cluster-layer');if(!layer||!_kgState)return;
  const cl=_kgState.clusters||[];
  if(!cl.length){layer.innerHTML='';return;}
  layer.innerHTML=cl.map(c=>`<text x="${c.cx.toFixed(0)}" y="${c.cy.toFixed(0)}" text-anchor="middle" font-size="13" font-weight="700" fill="${c.color}" opacity=".18" style="pointer-events:none;font-family:-apple-system,Inter,sans-serif;text-transform:uppercase;letter-spacing:1px">${esc(String(c.label).slice(0,22))}</text>`).join('');
}
function _kgRenderLegend(){
  const el=document.getElementById('kg-legend');if(!el||!_kgState)return;
  const cb=_kgState.colorBy;
  if(cb==='palette'){el.style.display='none';return;}
  // Tally the colour groups currently shown.
  const groups=new Map();
  _kgState.nodes.forEach(n=>{groups.set(n.color,(groups.get(n.color)||0)+1);});
  const folders=(typeof _noteFolders==='function'?_noteFolders():[])||[];
  // Re-derive a human label per colour from one representative note.
  const labelFor=color=>{
    const node=_kgState.nodes.find(n=>n.color===color);if(!node)return '';
    const src=(D.notes||[]).find(x=>x.id===node.id)||{};
    if(cb==='tag')return (src.tags&&src.tags[0])?'#'+src.tags[0]:'(untagged)';
    if(cb==='folder'){const f=folders.find(x=>x.id===src.folderId);return f?f.name:'(no folder)';}
    if(cb==='color')return src.color?'colour':'(none)';
    return '';
  };
  const rows=[...groups.entries()].sort((a,b)=>b[1]-a[1]).slice(0,9)
    .map(([color,n])=>`<div style="display:flex;align-items:center;gap:6px;padding:1px 0"><span style="width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0"></span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(labelFor(color))}</span><span style="color:var(--t3)">${n}</span></div>`).join('');
  el.style.display='block';
  el.innerHTML=`<div style="font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;font-size:11px;margin-bottom:4px">Colour: ${cb==='tag'?'first tag':cb==='folder'?'folder':'manual colour'}</div>${rows}`;
}
function _kgPaintNodes(){
  const layer=document.getElementById('kg-nodes-layer');if(!layer||!_kgState)return;
  const {nodes}=_kgState;
  const active=_kgActiveSet();
  layer.innerHTML=nodes.map(n=>{
    const sel=_kgState.selected===n.id;
    const isActive=!active||active.has(n.id);
    const op=isActive?'.95':'.16';
    const stroke=sel?'#fff':n.starred?'#facc15':'rgba(0,0,0,.4)';
    const sw=sel?3:n.starred?1.5:1;
    const showLabel=isActive&&(n.r>8||sel||active);
    return `<g transform="translate(${n.x.toFixed(1)},${n.y.toFixed(1)})" data-node-id="${n.id}" style="cursor:pointer">
      <circle r="${n.r}" fill="${n.color}" stroke="${stroke}" stroke-width="${sw}" opacity="${op}"/>
      ${showLabel?`<text x="0" y="${n.r+13}" text-anchor="middle" font-size="10" fill="var(--t1)" style="pointer-events:none;font-family:-apple-system,Inter,sans-serif" opacity="${isActive?1:.5}">${esc(n.title.slice(0,32))}${n.title.length>32?'…':''}</text>`:''}
    </g>`;
  }).join('');
}
function _kgRender(){_kgPaintClusters();_kgPaintEdges();_kgPaintNodes();_kgRenderLegend();}
function _kgStartSimulation(){
  // Force-directed simulation (Verlet-style) for ~200 ticks then idle.
  if(_kgRaf)cancelAnimationFrame(_kgRaf);
  if(!_kgState||!_kgState.nodes.length)return;
  const wrap=document.getElementById('kg-canvas-wrap');
  const W=wrap.clientWidth,H=wrap.clientHeight;
  let ticks=0;const MAX_TICKS=240;
  const REPULSION=2500;
  const SPRING=0.012;const SPRING_LEN=120;
  const FRICTION=0.86;const CENTER_PULL=0.0008;
  function step(){
    const {nodes,links}=_kgState;
    // Reset accelerations
    nodes.forEach(n=>{n.ax=0;n.ay=0;});
    // Repulsion between every pair
    for(let i=0;i<nodes.length;i++){
      for(let j=i+1;j<nodes.length;j++){
        const a=nodes[i],b=nodes[j];
        const dx=a.x-b.x,dy=a.y-b.y;const d2=dx*dx+dy*dy+0.01;const d=Math.sqrt(d2);
        const f=REPULSION/d2;
        a.ax+=dx/d*f;a.ay+=dy/d*f;
        b.ax-=dx/d*f;b.ay-=dy/d*f;
      }
    }
    // Spring attraction along visible edges only.
    const byId={};nodes.forEach(n=>{byId[n.id]=n;});
    for(const l of links){
      if(!_kgEdgeType(l))continue;
      const a=byId[l.a],b=byId[l.b];if(!a||!b)continue;
      const dx=b.x-a.x,dy=b.y-a.y;const d=Math.sqrt(dx*dx+dy*dy)+0.01;
      const force=SPRING*(d-SPRING_LEN);
      a.ax+=dx/d*force;a.ay+=dy/d*force;
      b.ax-=dx/d*force;b.ay-=dy/d*force;
    }
    // Centring pull — toward the node's cluster centroid when clustering is
    // on, otherwise toward canvas centre.
    const cx=W/2,cy=H/2;
    const clById={};(_kgState.clusters||[]).forEach(c=>{clById[c.key]=c;});
    const clustered=(_kgState.clusters||[]).length>0;
    nodes.forEach(n=>{
      const c=clustered&&n.clusterKey!=null?clById[n.clusterKey]:null;
      const tx=c?c.cx:cx,ty=c?c.cy:cy;
      const pull=c?CENTER_PULL*9:CENTER_PULL;
      n.ax+=(tx-n.x)*pull;n.ay+=(ty-n.y)*pull;
    });
    // Integrate
    nodes.forEach(n=>{
      if(_kgDrag&&_kgDrag.nodeId===n.id)return; // dragged node is fixed
      n.vx=(n.vx+n.ax)*FRICTION;
      n.vy=(n.vy+n.ay)*FRICTION;
      n.x+=n.vx;n.y+=n.vy;
    });
    _kgRender();
    ticks++;
    if(ticks<MAX_TICKS||_kgDrag){_kgRaf=requestAnimationFrame(step);}else{_kgRaf=null;}
  }
  step();
}
function _kgWireEvents(){
  const wrap=document.getElementById('kg-canvas-wrap');
  const svg=document.getElementById('kg-svg');
  if(!wrap||!svg)return;
  // Mouse down on node → start drag; on background → start pan
  svg.onmousedown=(e)=>{
    _kgMoved=false;
    const g=e.target.closest('[data-node-id]');
    if(g){
      const nid=Number(g.dataset.nodeId);
      const node=_kgState.nodes.find(n=>n.id===nid);
      _kgDrag={nodeId:nid,startMouse:{x:e.clientX,y:e.clientY},startNodePos:{x:node.x,y:node.y}};
      wrap.style.cursor='grabbing';
      _kgStartSimulation();
    }else{
      _kgPan={start:{x:e.clientX,y:e.clientY}};
      wrap.style.cursor='grabbing';
    }
  };
  document.addEventListener('mousemove',_kgMouseMove);
  document.addEventListener('mouseup',_kgMouseUp);
  // Hover tooltip
  svg.onmousemove=(e)=>{
    if(_kgDrag||_kgPan)return;
    const g=e.target.closest('[data-node-id]');
    const tip=document.getElementById('kg-tip');if(!tip)return;
    if(g){
      const nid=Number(g.dataset.nodeId);
      const node=_kgState.nodes.find(n=>n.id===nid);
      const n=D.notes.find(x=>x.id===nid);
      if(node&&n){
        tip.innerHTML=`<div style="font-weight:600;margin-bottom:2px">${esc(node.title)}</div><div style="font-size:11px;color:var(--t3)">${node.degree} connection${node.degree===1?'':'s'}${(n.tags||[]).length?' · '+(n.tags||[]).slice(0,3).map(t=>'#'+t).join(' '):''}</div>`;
        const rect=wrap.getBoundingClientRect();
        tip.style.left=(e.clientX-rect.left+12)+'px';
        tip.style.top=(e.clientY-rect.top+12)+'px';
        tip.style.display='block';
      }
    }else tip.style.display='none';
  };
  svg.onmouseleave=()=>{const tip=document.getElementById('kg-tip');if(tip)tip.style.display='none';};
  // Single click = select node (highlight it + neighbours, open info panel).
  // Click on empty space = clear selection. Double-click = open the note.
  svg.onclick=(e)=>{
    if(_kgPan||_kgDrag)return;
    if(_kgMoved){_kgMoved=false;return;} // ignore click that ended a drag
    const g=e.target.closest('[data-node-id]');
    if(g){
      _kgSelectNode(Number(g.dataset.nodeId));
    }else{
      _kgClearSelection();
    }
  };
  svg.ondblclick=(e)=>{
    const g=e.target.closest('[data-node-id]');
    if(g)_kgOpenNote(Number(g.dataset.nodeId));
  };
  // ── Touch support (iPhone/iPad): the graph was mouse-only, so panning,
  // dragging nodes and tapping to select did nothing on a touch device.
  // Bridge touch events into the existing mouse handlers. svg + wrap are
  // re-created on every render so these listeners don't accumulate. ──
  const _pt=e=>{const t=(e.touches&&e.touches[0])||(e.changedTouches&&e.changedTouches[0]);return t?{clientX:t.clientX,clientY:t.clientY,target:e.target}:null;};
  let _kgTapStart=null;
  svg.addEventListener('touchstart',e=>{
    const p=_pt(e);if(!p)return;
    e.preventDefault();
    _kgTapStart={x:p.clientX,y:p.clientY,t:Date.now()};
    svg.onmousedown(p);
  },{passive:false});
  wrap.addEventListener('touchmove',e=>{
    if(!_kgDrag&&!_kgPan)return;
    const p=_pt(e);if(!p)return;
    e.preventDefault();
    _kgMouseMove(p);
  },{passive:false});
  wrap.addEventListener('touchend',e=>{
    const moved=_kgMoved;
    _kgMouseUp();
    // A quick, near-stationary touch = a tap → select / clear (mirrors click).
    const cp=e.changedTouches&&e.changedTouches[0];
    const quick=_kgTapStart&&(Date.now()-_kgTapStart.t)<350;
    const still=cp&&_kgTapStart&&Math.abs(cp.clientX-_kgTapStart.x)<8&&Math.abs(cp.clientY-_kgTapStart.y)<8;
    _kgTapStart=null;
    if(moved||!quick||!still||!cp)return;
    const el=document.elementFromPoint(cp.clientX,cp.clientY);
    const g=el&&el.closest?el.closest('[data-node-id]'):null;
    if(g)_kgSelectNode(Number(g.dataset.nodeId));else _kgClearSelection();
  });
}
function _kgMouseMove(e){
  if(_kgDrag){
    const dx=e.clientX-_kgDrag.startMouse.x;
    const dy=e.clientY-_kgDrag.startMouse.y;
    if(Math.abs(dx)>3||Math.abs(dy)>3)_kgMoved=true;
    const node=_kgState.nodes.find(n=>n.id===_kgDrag.nodeId);
    if(node){node.x=_kgDrag.startNodePos.x+dx;node.y=_kgDrag.startNodePos.y+dy;node.vx=0;node.vy=0;}
  }else if(_kgPan){
    // Panning: shift all nodes uniformly
    const dx=e.clientX-_kgPan.start.x;const dy=e.clientY-_kgPan.start.y;
    if(Math.abs(dx)>2||Math.abs(dy)>2)_kgMoved=true;
    _kgPan.start={x:e.clientX,y:e.clientY};
    _kgState.nodes.forEach(n=>{n.x+=dx;n.y+=dy;});
    _kgRender();
  }
}
function _kgMouseUp(){
  const wrap=document.getElementById('kg-canvas-wrap');if(wrap)wrap.style.cursor='grab';
  _kgDrag=null;_kgPan=null;
}
function _kgRecenter(){
  if(!_kgState)return;renderKnowledgeGraph();
}
function _kgFreezeLayout(){
  if(_kgRaf){cancelAnimationFrame(_kgRaf);_kgRaf=null;}
  _kgState.nodes.forEach(n=>{n.vx=0;n.vy=0;});
  toast('⏸ Layout frozen — drag any node to nudge it.');
}

// ─── Home widgets: drag-to-reorder ──────────────────────────────────
let _homeDragFrom=null;
function _homeDragStart(e,id){_homeDragFrom=id;e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',id);}catch(_){}e.currentTarget.classList.add('dragging');}
function _homeDragOver(e,id){if(!_homeDragFrom||_homeDragFrom===id)return;e.preventDefault();e.dataTransfer.dropEffect='move';e.currentTarget.classList.add('drop-target');}
function _homeDragLeave(e){e.currentTarget.classList.remove('drop-target');}
function _homeDragEnd(e){e.currentTarget.classList.remove('dragging');document.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));_homeDragFrom=null;}
function _homeDrop(e,toId){
  e.preventDefault();e.currentTarget.classList.remove('drop-target');
  if(!_homeDragFrom||_homeDragFrom===toId)return;
  // Reorder D.prefs.homeCards: pull from position, insert before target.
  const prefs=getHomeCardPrefs().slice().sort((a,b)=>a.order-b.order);
  const fromIdx=prefs.findIndex(p=>p.id===_homeDragFrom);
  const toIdx=prefs.findIndex(p=>p.id===toId);
  if(fromIdx<0||toIdx<0)return;
  const moved=prefs.splice(fromIdx,1)[0];
  prefs.splice(toIdx,0,moved);
  // Reassign orders sequentially.
  prefs.forEach((p,i)=>{p.order=i;});
  saveHomeCardPrefs(prefs);
  _homeDragFrom=null;
  if(curScreen==='home'&&typeof renderHome==='function')renderHome();
}

// ─── Home widget helpers (weather, AI insight, focus tracking) ────────
function _setWeatherLoc(loc){
  if(!loc||!loc.trim())return;
  D.prefs.weatherLocation=loc.trim();
  D.prefs.weatherCache=null;save('prefs');
  _refreshWeather();
  if(curScreen==='home'&&typeof renderHome==='function')renderHome();
}
async function _refreshWeather(){
  const loc=(D.prefs&&D.prefs.weatherLocation)||'';if(!loc)return;
  try{
    const r=await fetch(`https://wttr.in/${encodeURIComponent(loc)}?format=j1`);
    if(!r.ok)throw new Error('weather fetch failed');
    const j=await r.json();
    const cur=(j.current_condition&&j.current_condition[0])||{};
    const wxDesc=(cur.weatherDesc&&cur.weatherDesc[0]&&cur.weatherDesc[0].value)||'';
    const data={
      temp:cur.temp_F,feels:cur.FeelsLikeF,humidity:cur.humidity,wind:cur.windspeedMiles,
      desc:wxDesc,
      icon:_weatherIcon(wxDesc,cur.weatherCode),
    };
    D.prefs.weatherCache={ts:Date.now(),data};save('prefs');
    if(curScreen==='home'&&typeof renderHome==='function')renderHome();
  }catch(e){console.warn('[weather]',e);}
}
function _weatherIcon(desc,code){
  const d=String(desc||'').toLowerCase();
  if(d.includes('thunder')||d.includes('storm'))return '⛈';
  if(d.includes('snow')||d.includes('sleet')||d.includes('flurr'))return '❄';
  if(d.includes('rain')||d.includes('drizzle')||d.includes('shower'))return '🌧';
  if(d.includes('fog')||d.includes('mist')||d.includes('haze'))return '🌫';
  if(d.includes('cloud')&&d.includes('part'))return '⛅';
  if(d.includes('overcast')||d.includes('cloud'))return '☁';
  if(d.includes('clear')&&new Date().getHours()>=20)return '🌙';
  if(d.includes('clear')||d.includes('sun'))return '☀';
  return '🌤';
}
// ═══════════════════════════════════════════════════════════════════════════
// AI CONTENT-AWARE LAYER (Tier 1)
// ═══════════════════════════════════════════════════════════════════════════
// The original `_buildAIContext()` ships counts + titles. These helpers go
// deeper — they pull *actual content* (note bodies, task descriptions,
// journal entries, idea details) so AI prompts can reason about real text
// rather than just metadata.
//
// Three public entry points:
//   - aiAskLevelup(query)       → universal Q&A with citations
//   - aiNoteDeepInsight(noteId) → per-note key points / actions / questions
//   - _gatherRelevantContent(q) → shared content scorer (returns top hits)
//
// All are token-conscious: cap total prompt content to ~8K chars, prefer
// title + first 400 chars per item, and order results by relevance.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Score an object's relevance to a query using a simple keyword overlap +
 * recency boost. Returns 0..N — higher = better. Designed to be cheap so
 * we can score every note/task/journal/idea on each invocation.
 *
 * Scoring:
 *   +3 per query term that appears in the title (case-insensitive)
 *   +1 per query term that appears in the body
 *   +0.5 if the object was touched in the last 7 days
 *   +0.25 if the object was touched in the last 30 days
 */
function _relevanceScore(obj, queryTerms, bodyExtractor){
  if(!obj) return 0;
  const title = String(obj.title || obj.name || '').toLowerCase();
  const body = String((bodyExtractor ? bodyExtractor(obj) : (obj.body || obj.bodyHtml || obj.description || ''))).toLowerCase();
  let score = 0;
  for(const term of queryTerms){
    if(!term) continue;
    if(title.includes(term)) score += 3;
    if(body.includes(term)) score += 1;
  }
  // Recency boost — _ymd if available, else parse updated/createdAt.
  const updatedRaw = obj.updated || obj.updatedAt || obj.createdAt || obj.date || '';
  const tMs = Date.parse(updatedRaw);
  if(isFinite(tMs)){
    const ageDays = (Date.now() - tMs) / (86400 * 1000);
    if(ageDays < 7) score += 0.5;
    else if(ageDays < 30) score += 0.25;
  }
  return score;
}

/**
 * Pull a snippet of plain text from an object's body. Strips HTML and
 * caps length so we don't burn tokens on a 10k-char note body.
 */
function _bodySnippet(text, maxLen){
  if(!text) return '';
  // Strip HTML tags + decode common entities.
  let plain = String(text).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  if(plain.length > maxLen) plain = plain.slice(0, maxLen) + '…';
  return plain;
}

/**
 * Gather content from across the workspace relevant to a query. Returns
 * up to `limit` items (default 12) scored & sorted by relevance, each with
 * type, id, title, snippet, score, and a render-back URL.
 *
 * Includes: notes, tasks (native + external), journal entries, ideas,
 * opportunities. Skips Done tasks and tombstoned externals unless
 * `opts.includeDone` is true.
 */
function _gatherRelevantContent(query, opts){
  opts = opts || {};
  const limit = opts.limit || 12;
  const maxBodyChars = opts.maxBodyChars || 400;
  const queryTerms = String(query || '').toLowerCase().split(/[\s,;:!?"()\[\]{}]+/).filter(w => w.length > 2);
  if(!queryTerms.length){
    // No query terms (e.g. very short question). Fall back to most-recently-touched.
    queryTerms.push('');
  }
  const candidates = [];
  // Notes — bodyHtml or body.
  for(const n of (D.notes || [])){
    if(n.archived && !opts.includeArchived) continue;
    const bodyText = n.bodyHtml || n.body || '';
    const score = _relevanceScore(n, queryTerms, () => bodyText);
    if(score > 0 || !queryTerms[0]) candidates.push({type:'note', id:n.id, title:n.title || '(untitled)', snippet:_bodySnippet(bodyText, maxBodyChars), score, openFn:`showNoteInEditor(${n.id})`, icon:'📝'});
  }
  // Tasks (native).
  for(const t of (D.tasks || [])){
    if(t.status === 'Done' && !opts.includeDone) continue;
    const bodyText = t.description || t.notes || '';
    const score = _relevanceScore({title:t.title, body:bodyText, updated:t.updated || t.createdAt}, queryTerms);
    if(score > 0 || !queryTerms[0]) candidates.push({type:'task', id:t.id, title:t.title, snippet:_bodySnippet(bodyText, maxBodyChars), score, meta:`${t.priority||'Medium'}${t.due?' · due '+t.due:''}${t.project?' · '+t.project:''}`, openFn:`openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))`, icon:'☑'});
  }
  // External tasks.
  for(const et of (D.externalTasks || [])){
    if(et.removedAt || (et.override && et.override.tombstoned)) continue;
    if(et.status === 'Done' && !opts.includeDone) continue;
    const score = _relevanceScore({title:et.title, body:et.description || '', updated:et.updatedAt || et.fetchedAt}, queryTerms);
    if(score > 0 || !queryTerms[0]) candidates.push({type:'ext-task', id:et.externalId, title:et.title, snippet:_bodySnippet(et.description || '', maxBodyChars), score, meta:`${et.source==='nifty'?'LSI':'CF'}${et.status?' · '+et.status:''}${et.due?' · due '+et.due:''}`, openFn:`_openExternalAnnotateModal('${et.source}','${et.externalId}')`, icon:et.source==='nifty'?'🟣':'🟦'});
  }
  // Journal entries.
  for(const j of (D.journal || [])){
    const bodyText = j.body || '';
    const score = _relevanceScore({title:j.title || j.date, body:bodyText, updated:j.date}, queryTerms);
    if(score > 0 || !queryTerms[0]) candidates.push({type:'journal', id:j.id, title:`${j.date} ${j.mood||''} ${j.title||''}`.trim(), snippet:_bodySnippet(bodyText, maxBodyChars), score, openFn:`nav('jrnl')`, icon:'📔'});
  }
  // Ideas.
  for(const i of (D.ideas || [])){
    const bodyText = i.description || i.bodyHtml || '';
    const score = _relevanceScore({title:i.title, body:bodyText, updated:i.updatedAt || i.createdAt}, queryTerms);
    if(score > 0 || !queryTerms[0]) candidates.push({type:'idea', id:i.id, title:i.title, snippet:_bodySnippet(bodyText, maxBodyChars), score, meta:`stage: ${i.stage||'spark'}`, openFn:`openIdeaDetail&&openIdeaDetail(${i.id})`, icon:'💡'});
  }
  // Opportunities.
  for(const o of (D.opportunities || [])){
    const bodyText = o.notes || '';
    const score = _relevanceScore({title:`${o.name||''} ${o.accountName||''}`, body:bodyText, updated:o.updatedAt}, queryTerms);
    if(score > 0 || !queryTerms[0]) candidates.push({type:'opportunity', id:o.id, title:`${o.name||'(unnamed)'} — ${o.accountName||''}`, snippet:_bodySnippet(bodyText, maxBodyChars), score, meta:`${o.stage||''}${o.value?' · $'+o.value.toLocaleString():''}`, openFn:`openOpportunityDetail&&openOpportunityDetail(${o.id})`, icon:'💼'});
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

// Suggestion-chip handler for the Ask LevelUp modal. Sets the input
// value and immediately submits — saves a click. Called from inline
// onclick="" so it must be in global scope.
function _askLuPrefill(q){
  const inp=document.getElementById('ask-lu-input');
  if(!inp)return;
  inp.value=q;
  inp.focus();
  // Trigger submit via the keydown handler we registered.
  const ev=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});
  inp.dispatchEvent(ev);
}

/**
 * ASK LEVELUP — universal Q&A. Gathers relevant content from across the
 * workspace, asks AI to synthesize an answer with citations back to the
 * source objects, renders in an overlay modal with clickable citations.
 *
 * Cmd+/ shortcut or topbar button to invoke.
 */
async function aiAskLevelup(prefillQuery){
  // Show the modal with an input first; submit triggers the actual AI call.
  const existing = document.getElementById('ask-lu-ov');
  if(existing) existing.remove();
  const ov = document.createElement('div');
  ov.id = 'ask-lu-ov';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding-top:80px';
  ov.onclick = (e) => { if(e.target === ov) ov.remove(); };
  ov.innerHTML = `<div style="background:var(--s1);color:var(--t1);border:1px solid var(--bd2);border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,0.5);width:680px;max-width:95vw;max-height:80vh;overflow:hidden;display:flex;flex-direction:column">
    <div style="padding:14px 16px;border-bottom:1px solid var(--bd1);display:flex;align-items:center;gap:10px">
      <span style="font-size:20px">✨</span>
      <input id="ask-lu-input" type="text" placeholder="Ask anything about your workspace… (e.g., 'what did I decide about hiring?')" value="${esc(prefillQuery||'')}" autocomplete="off" data-1p-ignore data-lpignore="true" style="flex:1;background:transparent;border:none;outline:none;color:var(--t1);font-size:15px">
      <button class="btn btn-s" style="font-size:11px" onclick="document.getElementById('ask-lu-ov')?.remove()">Esc</button>
    </div>
    <div id="ask-lu-suggest" style="padding:10px 16px;border-bottom:1px solid var(--bd1);font-size:11px;color:var(--t3);display:flex;flex-wrap:wrap;gap:6px">
      <span style="font-weight:600;color:var(--t2)">Try:</span>
      ${['What did I decide about hiring?','Summarize my open Air Force opportunities.','What recurring themes are in my recent journal entries?','What is blocking my goals this week?','What are my unfinished follow-ups from notes?'].map(s=>`<button class="btn btn-s" style="font-size:11px;padding:2px 8px;height:22px" onclick="_askLuPrefill('${_jsAttr(s)}')">${esc(s)}</button>`).join('')}
    </div>
    <div id="ask-lu-body" style="flex:1;overflow:auto;padding:16px;font-size:13px;line-height:1.6;color:var(--t2)">
      <div style="text-align:center;color:var(--t3);padding:30px 20px">
        <div style="font-size:36px;margin-bottom:10px">🧠</div>
        <div>Type a question above. LevelUp will read your notes, tasks, journal entries, ideas, and opportunities to answer with citations.</div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const inp = document.getElementById('ask-lu-input');
  setTimeout(() => { try { inp?.focus(); inp?.select(); } catch(_){} }, 50);
  const submit = async () => {
    const q = inp.value.trim();
    if(!q) return;
    const body = document.getElementById('ask-lu-body');
    body.innerHTML = `<div style="color:var(--t3);text-align:center;padding:30px"><div class="lu-spin" style="display:inline-block;width:24px;height:24px;border:3px solid var(--bd2);border-top-color:var(--ac);border-radius:50%;animation:spin 1s linear infinite"></div><div style="margin-top:10px;font-size:11px">Gathering relevant content and thinking…</div></div>`;
    try {
      // Gather candidates — pull more than we'll use, with modest body
      // snippets per item. We trim the assembled prompt to ~3500 chars
      // total (server enforces 4000-char systemPrompt limit). Smaller
      // snippets per item mean more items can fit.
      let hits = _gatherRelevantContent(q, {limit:10, maxBodyChars:240});
      // Questions about the APP have no match in the user's data. Answer those
      // from the Help Center instead of dead-ending on 'nothing found'.
      const _luKnow = (typeof _luKnowledgeHits==='function' && (!hits.length || _luIsProductQuestion(q)))
        ? _luKnowledgeHits(q, hits.length ? 700 : 1600) : '';
      if(!hits.length && !_luKnow){
        body.innerHTML = `<div style="text-align:center;color:var(--t3);padding:30px">No relevant content found in your workspace. Try keywords from a note title, task name, or journal entry.</div>`;
        return;
      }
      // Build the source block under a hard budget. Add items until we
      // exceed 2800 chars (leaving ~700 for the system-prompt boilerplate).
      const SOURCE_BUDGET = 2800;
      const SYSTEM_BUDGET = 3600; // total systemPrompt cap, under server's 4000
      const blockLines = [];
      let used = 0;
      const usedHits = [];
      for(const h of hits){
        const line = `[${usedHits.length+1}] ${h.type.toUpperCase()} — ${(h.title||'').slice(0,80)}\n${(h.snippet||'').slice(0,300)}`;
        if(used + line.length + 2 > SOURCE_BUDGET) break;
        blockLines.push(line);
        used += line.length + 2;
        usedHits.push(h);
      }
      hits = usedHits;
      const sourceBlock = blockLines.join('\n\n');
      let sys = `You are LevelUp's research assistant. The user has a personal-productivity workspace (notes, tasks, journal entries, ideas, sales opportunities). Below are the most relevant items to their question. Answer concisely (2-5 short paragraphs) referencing items using [1] [2] [3] citation format. Do NOT make up facts — only use what's in the items. If the answer isn't in the items, say so.\n\nRELEVANT ITEMS:\n${sourceBlock}${_luKnow?'\n\nPRODUCT GUIDANCE (from the LevelUp Help Center — use this for questions about how to USE the app, and do not cite it with a number):\n'+_luKnow:''}`;
      // Final safety trim — should never trigger but belt-and-suspenders.
      if(sys.length > SYSTEM_BUDGET) sys = sys.slice(0, SYSTEM_BUDGET - 20) + '\n…(truncated)';
      const cfg = typeof _getAIConfig === 'function' ? _getAIConfig() : {};
      const res = await _trpc('ai.assist', {
        systemPrompt: sys,
        userContent: q,
        provider: cfg.provider || 'manus',
      }, 'mutation');
      const answer = String(res?.result || res?.text || '').trim() || '(no answer returned)';
      const answerHtml = esc(answer).replace(/\[(\d+)\]/g, (_, n) => {
        const i = parseInt(n, 10) - 1;
        const h = hits[i];
        if(!h) return `[${n}]`;
        return `<a href="javascript:void(0)" onclick="document.getElementById('ask-lu-ov')?.remove();setTimeout(()=>{${h.openFn}},80)" style="background:var(--acs);color:var(--ac);padding:1px 5px;border-radius:8px;font-size:11px;font-weight:600;text-decoration:none;border:1px solid color-mix(in srgb,var(--ac) 30%,transparent)" title="${esc(h.title)}">${h.icon} ${n}</a>`;
      }).replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
      body.innerHTML = `<div style="margin-bottom:16px">${answerHtml}</div>
        <div style="border-top:1px solid var(--bd1);padding-top:12px;margin-top:12px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--t3);margin-bottom:6px;font-weight:600">Sources (${hits.length}) — click any [n] in the answer above</div>
          <div style="display:flex;flex-direction:column;gap:6px">${hits.map((h,i)=>`<div style="font-size:11px;padding:6px 8px;background:var(--s2);border-radius:6px;border:1px solid var(--bd1);cursor:pointer" onclick="document.getElementById('ask-lu-ov')?.remove();setTimeout(()=>{${h.openFn}},80)" title="Open">
            <div style="display:flex;align-items:center;gap:6px"><span style="background:var(--s3);color:var(--t2);padding:1px 5px;border-radius:8px;font-weight:600">${i+1}</span><span>${h.icon}</span><span style="font-weight:600;color:var(--t1)">${esc(h.title)}</span>${h.meta?`<span style="color:var(--t3);font-size:11px;margin-left:auto">${esc(h.meta)}</span>`:''}</div>
            <div style="color:var(--t3);margin-top:3px;font-size:11px;line-height:1.4">${esc(h.snippet.slice(0,200))}${h.snippet.length>200?'…':''}</div>
          </div>`).join('')}</div>
        </div>`;
    } catch(err){
      body.innerHTML = `<div style="color:var(--red);padding:20px;background:rgba(239,68,68,0.08);border-radius:6px">⚠ Failed to answer: ${esc(err.message || String(err))}</div>`;
    }
  };
  inp.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); submit(); }
    if(e.key === 'Escape'){ ov.remove(); }
  });
  if(prefillQuery) submit();
}

/**
 * AI DEEP INSIGHT for a single note — reads the full bodyHtml/body and
 * returns structured analysis: key points, action items extracted (with
 * "create task" buttons), open questions, related notes from the
 * gatherer. Cached on n.aiDeepInsight so re-opens are instant.
 */
async function aiNoteDeepInsight(noteId, opts){
  const note = (D.notes || []).find(n => n.id === noteId);
  if(!note){ toast({type:'warn', title:'Note not found'}); return; }
  const force = opts && opts.force;
  // Check cache.
  if(!force && note.aiDeepInsight && note.aiDeepInsight.cachedAt){
    return _renderNoteDeepInsight(noteId, note.aiDeepInsight);
  }
  const bodyText = _bodySnippet(note.bodyHtml || note.body || '', 6000);
  if(!bodyText){
    toast({type:'info', title:'Note has no content to analyze'});
    return;
  }
  // Open the panel with a loading state immediately.
  _renderNoteDeepInsight(noteId, {loading:true});
  try {
    const cfg = typeof _getAIConfig === 'function' ? _getAIConfig() : {};
    const sys = `You are LevelUp's note analyzer. Read the note below and respond with STRICT JSON ONLY (no markdown, no code fences) of shape:
{
  "summary": "1-2 sentence summary",
  "keyPoints": ["bullet 1", "bullet 2", "bullet 3"],
  "actionItems": [{"title":"specific imperative task", "why":"brief reason"}],
  "openQuestions": ["question 1", "question 2"]
}
Rules: 3-6 keyPoints, 0-5 actionItems (only genuinely actionable items — skip vague stuff), 0-4 openQuestions. Output JSON only.

NOTE TITLE: ${note.title || '(untitled)'}
NOTE BODY:
${bodyText}`;
    const res = await _trpc('ai.assist', {
      systemPrompt: sys,
      userContent: 'Analyze this note.',
      provider: cfg.provider || 'manus',
      jsonMode: true,
    }, 'mutation');
    let parsed;
    const raw = String(res?.result || res?.text || '').trim();
    try { parsed = JSON.parse(raw); }
    catch(_){
      // Strip code fences if present.
      const m = raw.match(/\{[\s\S]*\}/);
      if(m) try { parsed = JSON.parse(m[0]); } catch(_){}
    }
    if(!parsed || typeof parsed !== 'object'){
      throw new Error('AI returned non-JSON output');
    }
    // Pull related notes via the gatherer using the note title + first 100 chars as the query.
    const relatedQuery = `${note.title || ''} ${bodyText.slice(0,200)}`;
    const related = _gatherRelevantContent(relatedQuery, {limit:5}).filter(h => !(h.type === 'note' && h.id === noteId));
    const insight = {
      cachedAt: new Date().toISOString(),
      summary: parsed.summary || '',
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions : [],
      related: related.slice(0, 5),
    };
    note.aiDeepInsight = insight;
    save('notes');
    _renderNoteDeepInsight(noteId, insight);
  } catch(err){
    _renderNoteDeepInsight(noteId, {error: err.message || String(err)});
  }
}

function _renderNoteDeepInsight(noteId, insight){
  const host = document.getElementById('note-ai-insight-panel');
  if(!host){
    // No host — caller hasn't opened the panel container. Open via toast nav.
    return;
  }
  if(insight.loading){
    host.innerHTML = `<div style="padding:14px;text-align:center;color:var(--t3)"><div class="lu-spin" style="display:inline-block;width:20px;height:20px;border:3px solid var(--bd2);border-top-color:var(--ac);border-radius:50%;animation:spin 1s linear infinite"></div><div style="margin-top:8px;font-size:11px">Reading your note and extracting insights…</div></div>`;
    return;
  }
  if(insight.error){
    host.innerHTML = `<div style="padding:12px;color:var(--red);background:rgba(239,68,68,0.08);border-radius:6px;font-size:11px">⚠ ${esc(insight.error)}<br><button class="btn btn-s" style="font-size:11px;margin-top:6px" onclick="aiNoteDeepInsight(${noteId},{force:true})">Retry</button></div>`;
    return;
  }
  const cachedAge = insight.cachedAt ? Math.round((Date.now() - _pd(insight.cachedAt).getTime()) / 60000) : 0;
  host.innerHTML = `<div style="padding:0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--ac)">${_icon('brain',16,'currentColor')} AI Deep Insight</div>
      <div style="display:flex;gap:6px;align-items:center;font-size:11px;color:var(--t3)">
        ${cachedAge<60?`${cachedAge}m ago`:`${Math.round(cachedAge/60)}h ago`}
        <button class="btn btn-s" style="font-size:10px;padding:0 6px;height:20px" onclick="aiNoteDeepInsight(${noteId},{force:true})" title="Regenerate">↻</button>
      </div>
    </div>
    ${insight.summary?`<div style="padding:8px 10px;background:var(--s2);border-left:3px solid var(--ac);border-radius:4px;margin-bottom:10px;font-size:12px;line-height:1.5;font-style:italic">${esc(insight.summary)}</div>`:''}
    ${insight.keyPoints && insight.keyPoints.length?`<div style="margin-bottom:10px">
      <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:4px">${_icon('target',14,'currentColor')} Key points</div>
      <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.6">${insight.keyPoints.map(k=>`<li>${esc(k)}</li>`).join('')}</ul>
    </div>`:''}
    ${insight.actionItems && insight.actionItems.length?`<div style="margin-bottom:10px">
      <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:4px">${_icon('zap',14,'currentColor')} Suggested action items</div>
      <div style="display:flex;flex-direction:column;gap:4px">${insight.actionItems.map((a,i)=>`<div style="display:flex;gap:6px;align-items:flex-start;padding:6px 8px;background:var(--s2);border-radius:4px;font-size:11px">
        <button class="btn btn-s" style="font-size:10px;padding:0 6px;height:20px;flex-shrink:0;background:#16a34a;color:#fff;border-color:#15803d" onclick="_aiInsightCreateTask(${noteId},${i})" title="Create as task linked to this note">+ Task</button>
        <div style="flex:1"><div style="color:var(--t1);font-weight:500">${esc(a.title)}</div>${a.why?`<div style="color:var(--t3);font-size:11px;margin-top:2px">${esc(a.why)}</div>`:''}</div>
      </div>`).join('')}</div>
    </div>`:''}
    ${insight.openQuestions && insight.openQuestions.length?`<div style="margin-bottom:10px">
      <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:4px">❓ Open questions</div>
      <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.6;color:var(--t2)">${insight.openQuestions.map(q=>`<li>${esc(q)}</li>`).join('')}</ul>
    </div>`:''}
    ${insight.related && insight.related.length?`<div>
      <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:4px">🔗 Related across workspace</div>
      <div style="display:flex;flex-direction:column;gap:4px">${insight.related.map(r=>`<div style="font-size:11px;padding:5px 8px;background:var(--s2);border-radius:4px;cursor:pointer" onclick="${r.openFn}" title="${esc(r.snippet.slice(0,200))}"><span style="margin-right:5px">${r.icon}</span><span style="font-weight:500">${esc(r.title)}</span>${r.meta?`<span style="color:var(--t3);margin-left:6px;font-size:11px">${esc(r.meta)}</span>`:''}</div>`).join('')}</div>
    </div>`:''}
  </div>`;
}

// Opens a side panel overlay for the Note Deep Insight. The panel
// docks on the right edge so the user can read the note + insight
// side-by-side. Calls aiNoteDeepInsight which writes into the host
// div #note-ai-insight-panel inside this overlay.
function _openNoteInsightPanel(noteId){
  document.getElementById('note-insight-side')?.remove();
  const side = document.createElement('div');
  side.id = 'note-insight-side';
  side.style.cssText = 'position:fixed;top:56px;right:0;width:380px;max-width:95vw;height:calc(100vh - 56px);background:var(--s1);border-left:1px solid var(--bd2);box-shadow:-4px 0 20px rgba(0,0,0,0.25);z-index:200;overflow-y:auto;padding:14px;display:flex;flex-direction:column;animation:slideInRight 200ms ease-out';
  side.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--bd1)">
    <div style="font-size:13px;font-weight:600;color:var(--t1)">${_icon('brain',15,'currentColor')} Deep Insight</div>
    <button class="btn btn-s" style="height:24px;font-size:11px;padding:0 6px" onclick="document.getElementById('note-insight-side')?.remove()" title="Close">✕</button>
  </div>
  <div id="note-ai-insight-panel" style="flex:1"></div>`;
  document.body.appendChild(side);
  aiNoteDeepInsight(noteId);
}

// Toggle the collapsed state of a CF project section header in the Tasks
// list. Persists in D.prefs.cfCollapsedProjects[] so the fold state
// survives reloads. Re-renders the current task view so the section
// expands/collapses immediately.
function _toggleCfProjectCollapsed(label){
  D.prefs=D.prefs||{};
  D.prefs.cfCollapsedProjects=D.prefs.cfCollapsedProjects||[];
  const norm=String(label).toLowerCase();
  const set=new Set(D.prefs.cfCollapsedProjects.map(s=>String(s).toLowerCase()));
  if(set.has(norm)){
    D.prefs.cfCollapsedProjects=D.prefs.cfCollapsedProjects.filter(s=>String(s).toLowerCase()!==norm);
  } else {
    D.prefs.cfCollapsedProjects.push(label);
  }
  save('prefs');
  if(typeof renderCurrentTaskView==='function')renderCurrentTaskView();
}

// "Collapse all" / "Expand all" CF project sections at once. Wired to a
// small header button in the Tasks page header (see _renderCfFoldAllBtn).
function _foldAllCfProjects(){
  D.prefs=D.prefs||{};
  // Find every CF project label that has at least one orphan-subtask row.
  const labels=new Set();
  (D.externalTasks||[]).forEach(et=>{
    if(et.source!=='smartsheet'||!et.projectLabel)return;
    try{const k=JSON.parse(et.raw||'{}').kind;if(k==='subtask')labels.add(et.projectLabel);}catch(_){}
  });
  D.prefs.cfCollapsedProjects=Array.from(labels);
  save('prefs');
  if(typeof renderCurrentTaskView==='function')renderCurrentTaskView();
}
function _expandAllCfProjects(){
  D.prefs=D.prefs||{};
  D.prefs.cfCollapsedProjects=[];
  save('prefs');
  if(typeof renderCurrentTaskView==='function')renderCurrentTaskView();
}

// Helper: create a native task from an AI-suggested action item, linked
// back to the originating note.
function _aiInsightCreateTask(noteId, actionIdx){
  const note = (D.notes || []).find(n => n.id === noteId);
  if(!note || !note.aiDeepInsight) return;
  const action = note.aiDeepInsight.actionItems && note.aiDeepInsight.actionItems[actionIdx];
  if(!action) return;
  const newId = Date.now();
  D.tasks = D.tasks || [];
  D.tasks.unshift({
    id: newId,
    title: action.title,
    description: action.why || '',
    status: 'Not Started',
    priority: 'Medium',
    createdAt: new Date().toISOString(),
    createdBy: (D.creds && D.creds.userName) || 'AI',
    linkedNoteIds: [noteId],
  });
  // Add the reverse link on the note for future "tasks from this note" rollup.
  note.linkedTaskIds = note.linkedTaskIds || [];
  if(!note.linkedTaskIds.includes(newId)) note.linkedTaskIds.push(newId);
  save('tasks'); save('notes');
  toast({type:'success', title:`+ Task: ${action.title.slice(0,40)}${action.title.length>40?'…':''}`, msg:'Linked to this note.'});
}

async function _refreshAIInsight(){
  const today=_ymd(new Date());
  try{
    const {provider,configured}=_getAIConfig();
    if(!configured){
      D.prefs.aiInsightCard={date:today,text:'Configure an AI key in Settings → AI Features to see daily insights.'};
      save('prefs');if(curScreen==='home'&&typeof renderHome==='function')renderHome();
      return;
    }
    const ctx=typeof _buildAIContext==='function'?_buildAIContext():'';
    const res=await _trpc('ai.assist',{
      systemPrompt:`You are a productivity coach. Read the workspace snapshot and write ONE concise, encouraging insight (2 sentences max, ~140 chars) that highlights something specific the user is doing well OR a specific small action that would help. Be specific — reference actual numbers / titles when you can. Plain text, no markdown.\n\n${ctx}`,
      userContent:`Generate today's insight.`,
      provider:provider||'manus',
    },'mutation');
    const text=String(res?.result||res?.text||'').trim()||'Keep going — small consistent wins compound into big outcomes.';
    D.prefs.aiInsightCard={date:today,text};save('prefs');
    if(curScreen==='home'&&typeof renderHome==='function')renderHome();
  }catch(e){
    D.prefs.aiInsightCard={date:today,text:'Could not generate today\'s insight. Check your AI key in Settings → AI Features.'};
    save('prefs');if(curScreen==='home'&&typeof renderHome==='function')renderHome();
  }
}
// AI Daily Focus: cross-source recommendation of the top 3-5 items to tackle
// today. Reads native + external tasks via _unifiedTasks(), asks ai.assist for
// structured picks with reasoning, caches per-day in D.prefs.dailyFocusAI.
// Manual refresh forces a re-fetch regardless of cache.
async function _refreshDailyFocusAI(opts){
  const force=opts&&opts.force;
  const today=_ymd(new Date());
  const cache=(D.prefs&&D.prefs.dailyFocusAI)||null;
  if(!force&&cache&&cache.date===today&&Array.isArray(cache.picks)&&cache.picks.length)return;
  // Mark pending so the UI can show a spinner without re-firing the request.
  D.prefs.dailyFocusAI={date:today,picks:cache?cache.picks:[],pending:true};
  if(typeof renderScreen==='function'&&curScreen==='home')renderScreen('home');
  try{
    const {provider,configured}=typeof _getAIConfig==='function'?_getAIConfig():{provider:'manus',configured:true};
    // Build a compact task summary the model can reason over. Strip junk and
    // cap the list to keep tokens reasonable. Each item includes a stable id
    // shape so the response can reference items unambiguously.
    const all=typeof _unifiedTasks==='function'?_unifiedTasks():[];
    const todayKey=today;
    const open=all.filter(t=>{
      const s=(t.status||'').toLowerCase();
      if(_isExtDone(s))return false;
      return true;
    });
    // Prioritise the candidate pool: overdue → today → my-day → next 14 days → rest. Cap 60.
    const score=t=>{
      const due=t.due;
      if(due&&due<todayKey)return 0;       // overdue
      if(due===todayKey)return 1;          // due today
      if(t.myDay)return 2;                  // my day
      if(due&&due<=_ymd(new Date(Date.now()+14*86400000)))return 3; // next 2 weeks
      return 4;                              // rest
    };
    const candidates=open.slice().sort((a,b)=>score(a)-score(b)||(a.due||'9999').localeCompare(b.due||'9999')).slice(0,60);
    const compact=candidates.map(t=>({
      id:String(t.id),
      title:(t.title||'').slice(0,200),
      source:t._source||'local',
      due:t.due||null,
      priority:t.priority||null,
      status:t.status||null,
      project:t.project||t.projectLabel||null,
      myDay:!!t.myDay,
    }));
    const sys=`You are a productivity coach for a COO/CEO running two companies. Read the open task list (mix of personal items, CF = CommunityForce Smartsheet items, LSI = LSI Media Nifty items) and pick the TOP 3 to 5 items that the user should focus on TODAY, in order. Bias toward: overdue items, items due today, items flagged "myDay", and high-leverage strategic work over busy work. When two items would compete, prefer the one that unblocks others. Output STRICTLY a JSON array — no prose, no markdown — each element shaped {"id":"<id from input>","reason":"<one short sentence, ~12 words, why this item matters today>"}. Do NOT include items not in the input. Do NOT invent ids.`;
    const userContent=`Today: ${todayKey}\nOpen tasks (${compact.length}):\n${JSON.stringify(compact)}`;
    const res=await _trpc('ai.assist',{systemPrompt:sys,userContent,provider:provider||'manus'},'mutation');
    const raw=String(res?.result||res?.text||'').trim();
    // Tolerate the model wrapping the JSON in ```json fences or padding.
    const m=raw.match(/\[[\s\S]*\]/);
    let picks=[];
    if(m){
      try{
        const parsed=JSON.parse(m[0]);
        if(Array.isArray(parsed)){
          // Resolve each pick back to the source row so the renderer has the
          // title, source, url, etc. without re-querying.
          picks=parsed.map(p=>{
            const c=candidates.find(x=>String(x.id)===String(p.id));
            if(!c)return null;
            return {id:String(c.id),title:c.title,source:c._source||'local',url:c._url||null,due:c.due||null,reason:String(p.reason||'').slice(0,300)};
          }).filter(Boolean).slice(0,5);
        }
      }catch{ /* parse error — leave picks empty */ }
    }
    D.prefs.dailyFocusAI={date:today,picks,pending:false,generatedAt:new Date().toISOString()};
    save('prefs');
    if(typeof renderScreen==='function'&&curScreen==='home')renderScreen('home');
  }catch(e){
    D.prefs.dailyFocusAI={date:today,picks:[],pending:false,error:e.message||String(e)};
    save('prefs');
    if(typeof renderScreen==='function'&&curScreen==='home')renderScreen('home');
  }
}

// Render the AI Focus section as part of the Command Center card. Renders
// inline (no separate card) so it's right next to the rollup counts.
function _renderDailyFocusAISection(){
  const cache=(D.prefs&&D.prefs.dailyFocusAI)||{};
  const picks=Array.isArray(cache.picks)?cache.picks:[];
  const hasAIConfig=(()=>{try{return !!_getAIConfig().configured;}catch{return false;}})();
  if(!hasAIConfig){
    return `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--bd1);font-size:11px;color:var(--t3);text-align:center">Add an AI key in Settings → AI Features to see Daily Focus picks.</div>`;
  }
  const today=_ymd(new Date());
  const stale=!cache.date||cache.date!==today;
  if(cache.pending){
    return `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--bd1);font-size:11px;color:var(--t3);text-align:center">✨ Thinking about today's focus…</div>`;
  }
  if(!picks.length||stale){
    return `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--bd1);display:flex;align-items:center;justify-content:space-between;gap:8px">
      <div style="font-size:11px;color:var(--t3)">✨ ${stale?'Refresh':'Generate'} AI Daily Focus picks${cache.error?` <span style="color:var(--red)" title="${esc(cache.error)}">(error — click to retry)</span>`:''}</div>
      <button class="btn btn-s" style="font-size:10px;padding:0 8px;height:20px" onclick="_refreshDailyFocusAI({force:true})">${stale&&picks.length?'↻':'✨ Pick'}</button>
    </div>`;
  }
  const rows=picks.map((p,i)=>{
    const badge=p.source==='smartsheet'?_extSourceBadge('smartsheet'):(p.source==='nifty'?_extSourceBadge('nifty'):'');
    const clickHandler=p.source==='local'
      ?`(()=>{const t=D.tasks.find(x=>String(x.id)===${JSON.stringify(p.id)});if(t)openDrawer('task',t);})()`
      :(p.url?`window.open('${esc(p.url)}','_blank','noopener')`:'void 0');
    return `<div style="display:flex;align-items:flex-start;gap:6px;padding:6px 0;${i<picks.length-1?'border-bottom:1px solid var(--bd1);':''}cursor:pointer" onclick="${clickHandler}">
      <span style="font-size:11px;font-weight:700;color:var(--ac);min-width:14px;flex-shrink:0">${i+1}.</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:500;line-height:1.35;display:flex;align-items:center;gap:4px;flex-wrap:wrap">${badge}<span style="overflow:hidden;text-overflow:ellipsis">${esc(p.title)}</span></div>
        ${p.reason?`<div style="font-size:11px;color:var(--t3);line-height:1.4;margin-top:2px;font-style:italic">${esc(p.reason)}</div>`:''}
      </div>
    </div>`;
  }).join('');
  return `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--bd1)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <span style="font-size:11px;font-weight:600;color:var(--t2)">✨ AI Daily Focus</span>
      <button class="btn btn-s" style="font-size:10px;padding:0 5px;height:18px" title="Regenerate" onclick="_refreshDailyFocusAI({force:true})">↻</button>
    </div>
    ${rows}
  </div>`;
}

// AI-generated hero subtitle (#8). Cached per day in D.prefs.aiHeroBrief.
// Toggled on via D.prefs.heroAIBrief checkbox in the Customize Dashboard modal.
async function _refreshHeroBrief(){
  const today=_ymd(new Date());
  const cache=(D.prefs&&D.prefs.aiHeroBrief)||null;
  // Bail early if a fresh cache already exists.
  if(cache&&cache.date===today&&cache.text&&!cache.pending)return;
  // Mark pending so concurrent renders don't kick off duplicate calls.
  D.prefs.aiHeroBrief={date:today,text:cache?.text||'Generating your daily brief…',pending:true};
  try{
    const {provider,configured}=_getAIConfig();
    if(!configured){
      D.prefs.aiHeroBrief={date:today,text:'Configure an AI key in Settings → AI Features to see daily AI briefs.'};
      save('prefs');if(curScreen==='home'&&typeof renderHome==='function')renderHome();
      return;
    }
    const ctx=typeof _buildAIContext==='function'?_buildAIContext():'';
    const res=await _trpc('ai.assist',{
      systemPrompt:`You are a calm productivity coach. Read the workspace snapshot and write ONE short greeting line (max 18 words, ~110 chars) for the top of the user's dashboard. Reference one specific number or item from their day if useful (e.g. "2 overdue", "habit streak of 18"). End with a gentle nudge or question. No emoji. No quotes. Plain text only.\n\n${ctx}`,
      userContent:`Generate today's hero greeting line.`,
      provider:provider||'manus',
    },'mutation');
    const text=String(res?.result||res?.text||'').trim().replace(/^["']|["']$/g,'')||'Energy is finite — spend it on what compounds.';
    D.prefs.aiHeroBrief={date:today,text};save('prefs');
    if(curScreen==='home'&&typeof renderHome==='function')renderHome();
  }catch(e){
    D.prefs.aiHeroBrief={date:today,text:'Could not generate today\'s brief — falling back to default. Check your AI key in Settings.'};
    save('prefs');if(curScreen==='home'&&typeof renderHome==='function')renderHome();
  }
}
// Hover popover for hero stat tiles (#7). One shared #hero-tile-popover lives
// at body level; we position it on mouseenter using the tile's data-tile-idx
// to look up content from window._heroTilePops (set by renderHome).
function _heroTilePopShow(e){
  const el=e.currentTarget;
  const idx=Number(el.getAttribute('data-tile-idx'));
  const html=(window._heroTilePops||[])[idx];
  if(!html)return;
  let pop=document.getElementById('hero-tile-popover');
  if(!pop){
    pop=document.createElement('div');
    pop.id='hero-tile-popover';
    document.body.appendChild(pop);
  }
  pop.innerHTML=html;
  // Position below the tile, clamped horizontally to viewport.
  const r=el.getBoundingClientRect();
  pop.style.left='0px';pop.style.top='-9999px';pop.classList.add('show');
  const pw=pop.offsetWidth||220;
  pop.style.left=Math.max(8,Math.min(window.innerWidth-pw-8,r.left))+'px';
  pop.style.top=(r.bottom+8)+'px';
}
function _heroTilePopHide(){
  const pop=document.getElementById('hero-tile-popover');
  if(pop)pop.classList.remove('show');
}
// Hook into the existing focus timer so we accumulate per-hour totals.
// This piggybacks on the focusLog write path so we don't change the timer code.
(function wrapFocusLog(){
  // We can't easily intercept the existing log writes without code changes;
  // instead, on every page render compute focusByHour from focusLog dates
  // if the data is there. focusLog is {YYYY-MM-DD: minutes}. We can't infer
  // hour from a date-only key, so use a separate D.prefs.focusByHour dict
  // updated when a focus session finishes. The focus timer is in renderFocus;
  // we'll patch it elsewhere. For now this stub keeps the widget happy.
})();

// Sidebar collapse-to-icons toggle. Persists in localStorage so the user's
// preference survives a refresh.
function toggleSidebarCollapse(){
  const want=!document.body.classList.contains('sidebar-collapsed');
  document.body.classList.toggle('sidebar-collapsed',want);
  try{localStorage.setItem('lu_sidebar_collapsed',want?'1':'0');}catch(_){}
  // Update the toggle button arrow + title
  document.querySelectorAll('.sb-collapse-toggle').forEach(b=>{
    b.innerHTML=want?'»':'«';
    b.title=want?'Expand sidebar':'Collapse sidebar';
  });
}
// Apply saved sidebar state on initial load.
try{if(localStorage.getItem('lu_sidebar_collapsed')==='1')document.body.classList.add('sidebar-collapsed');}catch(_){}

// Hamburger toggle for the mobile sidebar slide-in. `force` (true/false) lets
// callers explicitly open or close; omitting it toggles current state.
function toggleMobileSidebar(force){
  const open=force!==undefined?!!force:!document.body.classList.contains('sb-open');
  document.body.classList.toggle('sb-open',open);
  const bd=document.getElementById('sb-backdrop');
  if(bd)bd.classList.toggle('show',open);
}
// ═══════════════════════════════════════════════════════════════════════════
// SIDEBAR GROUP COLLAPSE (Visual Foundation Stage 2 — May 27)
// ═══════════════════════════════════════════════════════════════════════════
// Two-tier sidebar with 6 collapsible groups (today / work / mind / life /
// comms / other). Each group's collapsed state persists in
// D.prefs.sidebarGroupsCollapsed[] (array of group keys). Hydrated by
// initSidebars on every nav so the user's fold state survives across
// every page render.
//
// The sidebar template is re-cloned into every screen's <nav class="sb">
// on each renderScreen call, so all DOM state would reset without an
// explicit hydration pass.
// ═══════════════════════════════════════════════════════════════════════════

function _toggleSidebarGroup(key){
  D.prefs=D.prefs||{};
  D.prefs.sidebarGroupsCollapsed=D.prefs.sidebarGroupsCollapsed||[];
  const set=new Set(D.prefs.sidebarGroupsCollapsed);
  if(set.has(key)) set.delete(key); else set.add(key);
  D.prefs.sidebarGroupsCollapsed=Array.from(set);
  try{ save('prefs'); }catch(_){}
  _hydrateSidebarGroupsCollapsed();
}

function _hydrateSidebarGroupsCollapsed(){
  // Declutter default: for users who have never toggled a group, start with the
  // low-traffic groups (Comms, Other) collapsed so the resting sidebar is
  // shorter. Saved once so it's stable; any user toggle thereafter wins.
  if(D.prefs && D.prefs.sidebarGroupsCollapsed===undefined){
    D.prefs.sidebarGroupsCollapsed=['comms','other'];
    try{ save('prefs'); }catch(_){}
  }
  const collapsed=new Set(((D.prefs&&D.prefs.sidebarGroupsCollapsed)||[]));
  document.querySelectorAll('[data-sb] .sg').forEach(sg=>{
    const key=sg.dataset.group;
    sg.classList.toggle('collapsed', collapsed.has(key));
  });
}

// Day / Week / Year segmented toggle shared by the three "Planner" pages
// (My Day / My Week / My Year). Consolidating those into one sidebar entry
// ("Planner") + this in-page toggle removed two routes from the sidebar.
// Collapses a calendar header's AI actions into one "✨ AI ▾" dropdown
// (matches the Goals/Projects AI menus) so the header isn't a long button row.
function _calAIMenu(id,items){
  return `<div style="position:relative;display:inline-block"><button class="btn btn-s" style="height:28px;font-size:11px;color:var(--ac)" onclick="event.stopPropagation();togglePopMenu('${id}')" title="AI calendar tools">✨ AI ▾</button><div id="${id}" data-pop-menu="1" style="display:none;position:absolute;right:0;top:32px;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:4px;z-index:50;min-width:190px;box-shadow:0 4px 16px rgba(0,0,0,.35)">${items.map(it=>`<button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:${it.c};background:transparent;border:none;text-align:left" onclick="closePopMenu('${id}');${it.fn}">${it.label}</button>`).join('')}</div></div>`;
}
function _focusViewTabs(active){
  const tabs=[['myday','Day'],['myweek','Week'],['myyear','Year']];
  return `<div style="display:inline-flex;margin-top:8px;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;overflow:hidden">${tabs.map(([r,l])=>`<button class="btn" style="border-radius:0;height:26px;font-size:11px;border:none;padding:0 12px;background:${active===r?'var(--ac)':'transparent'};color:${active===r?'#fff':'var(--t2)'}" onclick="nav('${r}')">${l}</button>`).join('')}</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ICON HELPER (Visual Foundation Stage 3 starter — May 27)
// ═══════════════════════════════════════════════════════════════════════════
// Returns Lucide-style stroke-2 SVG markup for the named icon. Callers
// use this to replace emoji usage in template literals incrementally:
//   `${_icon('folder', 16)} Project X`   instead of   `📁 Project X`
//
// The icon set is intentionally small — only icons LevelUp actually uses
// at scale. To add an icon: copy the path data from lucide.dev, paste
// here. Stroke width 2 + 24×24 viewBox matches the existing sidebar SVGs.
//
// API: _icon(name, sizePx, colorOrVar)
//   _icon('folder')                  → 16px, currentColor
//   _icon('folder', 14)              → 14px, currentColor
//   _icon('folder', 14, 'var(--ac)') → 14px, accent color
// ═══════════════════════════════════════════════════════════════════════════

const _ICON_PATHS = {
  // Navigation + structure
  folder:    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  layers:    '<polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/><polyline points="12 22 12 15.5"/><polyline points="22 8.5 12 15.5 2 8.5"/>',
  list:      '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  // Status / actions
  check:     '<polyline points="20 6 9 17 4 12"/>',
  checkCircle:'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  x:         '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  plus:      '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  trash:     '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  edit:      '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  refresh:   '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  sparkles:  '<path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"/><circle cx="18" cy="6" r="1.5" fill="currentColor"/><circle cx="6" cy="18" r="1.5" fill="currentColor"/>',
  // Domains
  target:    '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  lightbulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M2 13a10 10 0 0 1 20 0c0 5-4 7-4 10H6c0-3-4-5-4-10z"/>',
  bookOpen:  '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  brain:     '<path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04Z"/>',
  calendar:  '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  // Visual states
  chevronRight: '<polyline points="9 18 15 12 9 6"/>',
  chevronDown:  '<polyline points="6 9 12 15 18 9"/>',
  externalLink: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  eye:       '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:    '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
  // Added May 31 for the page-header emoji→SVG migration (first slice).
  barChart:  '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  mail:      '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  sun:       '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  zap:       '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  users:     '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  map:       '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
  settings:  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  search:    '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  link:      '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  columns:   '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>',
  clock:     '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  // Added May 31 for the home-widget {icon,label} refactor.
  pin:       '<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>',
  flame:     '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  activity:  '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  trophy:    '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  tag:       '<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  bookmark:  '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  cloud:     '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  quote:     '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/>',
  camera:    '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  // Added May 31 for the Settings sub-nav {icon,label} refactor.
  user:      '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  palette:   '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.83-.44-1.12-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.66h1.99c3.05 0 5.56-2.5 5.56-5.56C21.96 6.01 17.46 2 12 2z"/>',
  bell:      '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  save:      '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  lock:      '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  shield:    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  // Status glyphs for toast notifications.
  alertTriangle:'<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  alertCircle:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  info:      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
};

function _icon(name, size, color){
  const path = _ICON_PATHS[name];
  if(!path){
    // Unknown icon → fall back to a tiny "?" so missing icons are
    // visible during development, not silently invisible.
    console.warn('[_icon] unknown icon:', name);
    return `<span style="display:inline-block;width:${size||16}px;text-align:center;color:var(--red);font-weight:700">?</span>`;
  }
  const px = size || 16;
  const c  = color || 'currentColor';
  return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0">${path}</svg>`;
}

function initSidebars(a){
  const t=document.getElementById('sb-tpl');
  document.querySelectorAll('[data-sb]').forEach(sb=>{
    sb.innerHTML=t.innerHTML;
    sb.querySelectorAll('.si').forEach(i=>{
      i.classList.remove('on');if(i.dataset.n===a)i.classList.add('on');
      // Populate data-label so the collapsed-sidebar flyout knows what to show.
      const lbl=i.querySelector('.l');
      if(lbl)i.setAttribute('data-label',lbl.textContent.trim());
    });
    // Inject the collapse toggle once per sidebar
    if(!sb.querySelector('.sb-collapse-toggle')){
      const btn=document.createElement('button');
      btn.className='sb-collapse-toggle';
      btn.title='Collapse sidebar';
      btn.innerHTML=document.body.classList.contains('sidebar-collapsed')?'»':'«';
      btn.onclick=toggleSidebarCollapse;
      sb.appendChild(btn);
    }
  });
  // Hide any group the user has emptied out. The items themselves are hidden
  // by #lu-layout-css; a group whose every item is gone would otherwise leave
  // a stranded header.
  try{
    document.querySelectorAll('[data-sb] .sg').forEach(g=>{
      const items=[...g.querySelectorAll('.si[data-n]')];
      g.style.display=(!items.length||items.some(i=>luPageOn(i.dataset.n)))?'':'none';
    });
  }catch(_){}
  // Hydrate group-collapse state: re-apply each saved group's collapsed
  // class on every nav (sidebars are re-cloned from #sb-tpl per render,
  // so without this every navigation would reset the user's fold state).
  _hydrateSidebarGroupsCollapsed();
  // Re-clone leaves #sb-name/#sb-email empty (placeholder removed). Fill them
  // immediately from D.creds so the bottom-left avatar doesn't flash a stale
  // placeholder during page navigation.
  if(typeof updateProfileUI==='function')updateProfileUI();
}
document.addEventListener('click',e=>{const i=e.target.closest('.si[data-n]');if(i)nav(i.dataset.n)});

// ====== UTILITY ======
function pillClass(p){return p==='High'?'p-h':p==='Medium'?'p-m':p==='Low'?'p-l':''}
function statusPill(s){const m={'In Progress':'p-ip',Pending:'p-pe','Not Started':'p-ns',Scheduled:'p-sc',Done:'p-dn',Active:'p-ip'};return m[s]||'p-ns'}
// ─── Rich toast notifications ──────────────────────────────────────────────
// Backwards compatible: toast('msg') and toast('msg','error') keep working.
// New shape: toast({title,msg,type,icon,duration,actions:[{label,onClick,primary}]})
//   - type: 'success'|'warn'|'error'|'info' (default auto-detects from leading emoji)
//   - actions: ['Undo' button etc.]; clicking auto-dismisses unless onClick returns false
//   - duration: ms; 0 = persistent until user dismisses
function toast(m,type,duration){
  // Old-style call → wrap into rich format
  let opts;
  if(typeof m==='string'){
    opts={title:m,type:type==='error'?'error':_inferToastType(m),duration:duration};
  }else if(m&&typeof m==='object'){
    opts=m;
  }else{
    return;
  }
  return _showRichToast(opts);
}
// Spawn a small one-shot confetti burst from the centre-top of the viewport.
// Used for High-priority task completions. Tasteful — 18 particles, 1s.
function spawnConfetti(opts){
  const o=opts||{};
  const count=o.count||18;
  const originX=o.x||(window.innerWidth/2);
  const originY=o.y||80;
  const colors=['#22c55e','#f59e0b','#3b82f6','#a855f7','#ec4899','#facc15','#06b6d4'];
  for(let i=0;i<count;i++){
    const el=document.createElement('div');
    el.className='lu-confetti';
    el.style.left=originX+'px';
    el.style.top=originY+'px';
    el.style.background=colors[i%colors.length];
    const ang=Math.random()*Math.PI-Math.PI/2;
    const speed=120+Math.random()*220;
    el.style.setProperty('--cx',(Math.cos(ang)*speed).toFixed(0)+'px');
    el.style.setProperty('--cy',(Math.abs(Math.sin(ang))*speed+260).toFixed(0)+'px');
    el.style.animation=`confettiFly ${.9+Math.random()*.5}s cubic-bezier(.2,.7,.3,1) forwards`;
    el.style.borderRadius=Math.random()<.4?'50%':'2px';
    document.body.appendChild(el);
    setTimeout(()=>el.remove(),1600);
  }
}
// Track rapid-fire task completions and toast an encouraging streak message.
let _completionTimes=[];
function _trackCompletionStreak(){
  const now=Date.now();
  _completionTimes=_completionTimes.filter(t=>now-t<120*1000);
  _completionTimes.push(now);
  if(_completionTimes.length===3){
    toast({type:'success',title:'🔥 3 in a row!',msg:"You're on a roll — keep the momentum going.",duration:3500});
  }else if(_completionTimes.length===5){
    toast({type:'success',title:'🚀 5 down!',msg:"This is what flow looks like.",duration:4000});
    _completionTimes=[];
  }
}

function _inferToastType(s){
  const t=String(s||'');
  if(/^(❌|⚠|⚠️|Failed|Error|Could not|Couldn’t|Couldn't)/i.test(t))return 'error';
  if(/^(⚠|Warning|Heads up)/i.test(t))return 'warn';
  if(/^(✅|✓|✔|✨|🎉|Saved|Done|Synced)/i.test(t))return 'success';
  return 'info';
}
function _ensureToastStack(){
  let stack=document.getElementById('toast-stack');
  if(!stack){
    stack=document.createElement('div');
    stack.id='toast-stack';
    stack.className='toast-stack';
    document.body.appendChild(stack);
  }
  return stack;
}
function _showRichToast(opts){
  const stack=_ensureToastStack();
  const wrap=document.createElement('div');
  const type=opts.type||'info';
  wrap.className='toast-rich t-'+type;
  // Default type icons are semantic-colored SVGs. A caller-supplied opts.icon
  // (e.g. a celebration emoji) still overrides, so custom toasts are unaffected.
  const icons={
    success:_icon('checkCircle',18,'var(--color-status-ok)'),
    warn:_icon('alertTriangle',18,'var(--color-status-warn)'),
    error:_icon('alertCircle',18,'var(--color-status-err)'),
    info:_icon('info',18,'var(--color-status-info)')
  };
  const icon=opts.icon||icons[type]||icons.info;
  const title=opts.title||opts.msg||'';
  const sub=opts.title&&opts.msg?opts.msg:'';
  const safeTitle=String(title).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const safeSub=String(sub||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const actsHtml=Array.isArray(opts.actions)&&opts.actions.length
    ? `<div class="ti-actions">${opts.actions.map((a,i)=>`<button class="ti-act${a.primary?' primary':''}" data-aci="${i}">${esc(a.label||'OK')}</button>`).join('')}</div>`
    : '';
  wrap.innerHTML=`<div class="ti-icon">${icon}</div>
    <div class="ti-body">
      <div class="ti-title">${safeTitle}</div>
      ${safeSub?`<div class="ti-msg">${safeSub}</div>`:''}
      ${actsHtml}
    </div>
    <button class="ti-close" aria-label="Dismiss">×</button>
    <div class="ti-progress" style="width:100%"></div>`;
  // Wire actions
  wrap.querySelectorAll('.ti-act').forEach(btn=>{
    btn.addEventListener('click',(e)=>{
      e.stopPropagation();
      const a=opts.actions[Number(btn.dataset.aci)];
      let keep=false;
      try{if(a&&typeof a.onClick==='function')keep=a.onClick()===false?false:false;}catch(_){}
      if(!keep)_dismissToast(wrap);
    });
  });
  wrap.querySelector('.ti-close').addEventListener('click',()=>_dismissToast(wrap));
  stack.appendChild(wrap);
  // Cap visible toasts to 4
  while(stack.children.length>4)stack.removeChild(stack.firstChild);
  // Auto-dismiss with progress bar
  const dur=opts.duration!==undefined?opts.duration:(opts.actions?6000:3000);
  if(dur>0){
    const bar=wrap.querySelector('.ti-progress');
    bar.style.transition=`width ${dur}ms linear`;
    requestAnimationFrame(()=>{bar.style.width='0%';});
    wrap.dataset.dismissTimer=String(setTimeout(()=>_dismissToast(wrap),dur));
  }else{
    const bar=wrap.querySelector('.ti-progress');if(bar)bar.style.display='none';
  }
  return wrap;
}
function _dismissToast(el){
  if(!el||el.classList.contains('leaving'))return;
  if(el.dataset.dismissTimer)clearTimeout(Number(el.dataset.dismissTimer));
  el.classList.add('leaving');
  setTimeout(()=>{if(el.parentElement)el.parentElement.removeChild(el);},220);
}

// ─── Empty state component ──────────────────────────────────────────────
// renderEmptyState({icon,title,hint,ctaLabel,ctaFn}) → HTML string.
// ctaFn is a function name (string) registered globally OR a JS expression.
// Used in lieu of plain "No X yet." text wherever a list is empty.
function renderEmptyState(o){
  // icon accepts either an _ICON_PATHS name (preferred — renders a large
  // accent-tinted SVG illustration that matches the page hue) OR a literal
  // emoji/string for legacy callers not yet migrated.
  const rawIcon=o.icon||'sparkles';
  const icon=(typeof rawIcon==='string' && _ICON_PATHS[rawIcon])
    ? `<span style="display:inline-flex;opacity:.9">${_icon(rawIcon,44,'var(--page-accent)')}</span>`
    : esc(rawIcon);
  const title=esc(o.title||'Nothing here yet');
  const hint=o.hint?`<div class="es-hint">${esc(o.hint)}</div>`:'';
  const cta=o.ctaLabel?`<button class="es-cta" onclick="${o.ctaFn||''}">${esc(o.ctaLabel)}</button>`:'';
  return `<div class="empty-state">
    <div class="es-icon">${icon}</div>
    <div class="es-title">${title}</div>
    ${hint}
    ${cta}
  </div>`;
}
function el(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html)e.innerHTML=html;return e}

// ====== DETAIL DRAWER ======
function openDrawer(type,item){
  const d=document.getElementById('drawer-content');
  const ov=document.getElementById('drawer-ov');
  d.innerHTML=renderDrawer(type,item);
  ov.classList.add('show');
  // Load related bookmarks for note drawers
  if(type==='note' && item?.id) setTimeout(()=>loadRelatedBookmarks('note', item.id), 0);
  // Hydrate "Estimated X / Actual Y" line for task drawer from time_entries.
  // Fire-and-forget: failure leaves the line blank, never blocks the drawer.
  if(type==='task' && item?.id){
    setTimeout(()=>_hydrateTaskActuals(item),0);
    setTimeout(()=>_hydrateTaskCustomFields(item),0);
  }
  if(type==='project' && item?.id){
    setTimeout(()=>_hydrateProjectCustomFieldsList(item.id),0);
  }
  // Hydrate the chip-based Linked Items picker for task drawers. Inline
  // <script> tags inside innerHTML don't execute, so we have to do this here.
  if((type==='task'||type==='note'||type==='journal') && item?.id && typeof _drInitLinks==='function'){
    // Journal entries use the same field names; _journalLinksOf adds back-links.
    _drInitLinks(type==='journal'&&typeof _journalLinksOf==='function'?_journalLinksOf(item):{
      projects:item.linkedProjectIds||[],
      goals:item.linkedGoalIds||[],
      tasks:item.linkedTaskIds||[],
      notes:item.linkedNoteIds||[],
      bookmarks:item.linkedBookmarkIds||[],
      journal:item.linkedJournalIds||[],
    },item.id,type);
    setTimeout(_drRenderTaskLinks,0);
  }
}
function closeDrawer(){document.getElementById('drawer-ov').classList.remove('show')}
function renderDrawer(type,item){
  const pinBtn=(t,id)=>{const pinned=D.prefs.pinned&&D.prefs.pinned.some(p=>p.type===t&&p.id===id);return `<button class="btn btn-s" style="height:22px;padding:0 7px;font-size:11px;margin-right:4px" onclick="togglePin('${t}',${id})" title="${pinned?'Unpin from Home':'Pin to Home'}">${pinned?'📌 Pinned':'📌 Pin'}</button>`;};
  const cb=`<button class="close" onclick="closeDrawer()">✕</button>`;
  if(type==='task'){
    const subs=item.subtasks||[];
    const subHtml=subs.map((s,si)=>{
      const descId=`st-desc-${item.id}-${si}`;
      const hasDesc=!!(s.descHtml&&s.descHtml.trim());
      return `<div style="border:1px solid var(--bd1);border-radius:6px;margin-bottom:4px;overflow:hidden">
        <div class="lr" style="padding:4px 6px;background:var(--s2)">
          <div class="chk ${s.done?'on':''}" onclick="toggleSubtask(${_tidLit(item.id)},${si})"></div>
          <span class="rt" style="flex:1;font-size:11px;${s.done?'text-decoration:line-through;color:var(--t3)':''}">${esc(s.title)}</span>
          <button type="button" class="btn btn-s" style="height:18px;font-size:10px;padding:0 5px;margin-left:4px" onclick="(function(){const d=document.getElementById('${descId}');if(d)d.style.display=d.style.display==='none'?'block':'none'})()" title="Toggle description">${hasDesc?'📝':'+ desc'}</button>
          <span onclick="deleteSubtask(${_tidLit(item.id)},${si})" style="cursor:pointer;color:var(--t3);font-size:11px;margin-left:4px" title="Delete subtask">✕</span>
        </div>
        <div id="${descId}" style="display:${hasDesc?'block':'none'};padding:6px;background:var(--s1);border-top:1px solid var(--bd1)">
          <div style="display:flex;flex-wrap:wrap;gap:2px;padding:3px 5px;background:var(--s2);border:1px solid var(--bd1);border-bottom:none;border-radius:5px 5px 0 0">
            <button type="button" class="btn btn-s" style="height:20px;min-width:20px;padding:0 4px;font-size:10px;font-weight:700" onmousedown="event.preventDefault();_rteExec(event,'bold')"><b>B</b></button>
            <button type="button" class="btn btn-s" style="height:20px;min-width:20px;padding:0 4px;font-size:10px;font-style:italic" onmousedown="event.preventDefault();_rteExec(event,'italic')"><i>I</i></button>
            <button type="button" class="btn btn-s" style="height:20px;min-width:20px;padding:0 4px;font-size:10px;text-decoration:underline" onmousedown="event.preventDefault();_rteExec(event,'underline')"><u>U</u></button>
            <button type="button" class="btn btn-s" style="height:20px;padding:0 4px;font-size:10px" onmousedown="event.preventDefault();_rteExec(event,'insertUnorderedList')">• List</button>
            <button type="button" class="btn btn-s" style="height:20px;padding:0 4px;font-size:10px" onmousedown="event.preventDefault();_rteExec(event,'removeFormat')">Tx</button>
          </div>
          <div id="st-rte-${item.id}-${si}" contenteditable="true" spellcheck="true"
            style="min-height:60px;max-height:200px;overflow-y:auto;padding:7px;background:var(--s1);border:1px solid var(--bd1);border-radius:0 0 5px 5px;font-size:11px;line-height:1.6;color:var(--t1);outline:none"
            oninput="(function(el){const t=D.tasks.find(x=>x.id==${_tidLit(item.id)});if(t&&t.subtasks[${si}])t.subtasks[${si}].descHtml=el.innerHTML;save('tasks');})(this)"
          >${s.descHtml||''}</div>
        </div>
      </div>`;
    }).join('');
    const doneCount=subs.filter(s=>s.done).length;
    return `<h2>${_icon('list',18,'currentColor')} Edit Task ${pinBtn('task',item.id)}${cb}</h2>
    <div class="field-row" style="align-items:flex-end">
      <div class="field" style="flex:1"><label>Title</label><input class="inp" value="${esc(item.title)}" id="dr-title"></div>
      <div class="field" style="flex:0 0 auto"><label style="font-size:11px;color:var(--t2)">Title Color</label>
        <div style="display:flex;gap:4px;align-items:center;margin-top:4px">
          ${['','#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#06b6d4'].map(c=>c?`<span onclick="document.getElementById('dr-title-color').value='${c}';this.parentElement.querySelectorAll('span').forEach(s=>s.style.outline='');this.style.outline='2px solid var(--ac)';this.style.outlineOffset='1px'" style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${c};cursor:pointer;${(item.titleColor||'')=== c?'outline:2px solid var(--ac);outline-offset:1px':''}"></span>`:`<span onclick="document.getElementById('dr-title-color').value='';this.parentElement.querySelectorAll('span').forEach(s=>s.style.outline='');this.style.outline='2px solid var(--ac)';this.style.outlineOffset='1px'" style="display:inline-block;width:16px;height:16px;border-radius:50%;background:var(--s3);cursor:pointer;border:1px dashed var(--bd2);${!(item.titleColor)?'outline:2px solid var(--ac);outline-offset:1px':''}" title="Default"></span>`).join('')}
          <input type="color" id="dr-title-color" value="${item.titleColor||'#4f46e5'}" style="width:22px;height:22px;border:none;background:none;cursor:pointer;padding:0" title="Custom color">
          <input type="hidden" id="dr-title-color-val" value="${item.titleColor||''}">
        </div>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Priority</label><select class="inp" id="dr-pri"><option ${item.priority==='High'?'selected':''}>High</option><option ${item.priority==='Medium'?'selected':''}>Medium</option><option ${item.priority==='Low'?'selected':''}>Low</option></select></div>
      <div class="field"><label>Status</label><select class="inp" id="dr-status">${_statusOptions(item.status||'Not Started')}</select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Start Date</label><input class="inp" type="date" value="${esc(item.startDate||item.due||'')}" id="dr-startdate"></div>
      <div class="field"><label>End / Due Date</label><input class="inp" type="date" value="${esc(item.endDate||item.due||'')}" id="dr-due"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Start Time</label><input class="inp" type="time" value="${esc(item.startTime||'')}" id="dr-starttime"></div>
      <div class="field"><label>End Time</label><input class="inp" type="time" value="${esc(item.endTime||'')}" id="dr-endtime"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Project</label><select class="inp" id="dr-proj"><option value="">None</option>${D.projects.map(p=>`<option value="${p.id}" ${item.projectId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Cluster <span style="font-size:10px;color:var(--t3);font-weight:400">group</span></label><select class="inp" id="dr-cluster">${_clusterOptionsHtml(item.clusterId)}</select></div>
      <div class="field"><label style="display:flex;align-items:center;justify-content:space-between">Context<button type="button" class="btn btn-s" style="height:18px;font-size:10px;padding:0 6px" onclick="manageTaskContexts()" title="Add, rename, or remove options">⚙ Manage</button></label>${_renderContextSelect('dr-ctx',item.context||'')}</div>
    </div>
    <div class="field-row">
      <div class="field"><label style="display:flex;align-items:center;justify-content:space-between">Recurring<button type="button" class="btn btn-s" style="height:18px;font-size:10px;padding:0 6px" onclick="_toggleRecurrenceAdvanced(${_tidLit(item.id)})" title="Advanced: weekday picker, end date, count">⚙ Advanced</button></label><select class="inp" id="dr-recurring" onchange="_onRecurringChange(${_tidLit(item.id)})"><option ${(item.recurring||'None')==='None'?'selected':''}>None</option><option ${item.recurring==='Daily'?'selected':''}>Daily</option><option ${item.recurring==='Weekly'?'selected':''}>Weekly</option><option ${item.recurring==='Bi-weekly'?'selected':''}>Bi-weekly</option><option ${item.recurring==='Monthly'?'selected':''}>Monthly</option><option ${item.recurring==='Yearly'?'selected':''}>Yearly</option></select>
        <div id="dr-recurring-adv" style="display:none;margin-top:6px;padding:8px;background:var(--s2);border:1px solid var(--bd1);border-radius:6px">
          ${(()=>{const r=_parseRecurrenceRule(item.recurrenceRule);const days=['S','M','T','W','T','F','S'];return `
          <div style="font-size:11px;color:var(--t3);margin-bottom:6px">Fine-tune the recurrence rule (writes <code>recurrenceRule</code> JSON for the server-side generator).</div>
          <div style="display:flex;gap:6px;margin-bottom:6px"><label style="font-size:11px;color:var(--t2);flex:1">Every <input type="number" id="dr-rec-interval" class="inp" min="1" max="365" value="${r.interval||1}" style="width:60px;font-size:11px;padding:2px 4px"></label></div>
          <div id="dr-rec-byday" style="margin-bottom:6px">
            <div style="font-size:11px;color:var(--t2);margin-bottom:3px">Weekdays (Weekly/Bi-weekly only)</div>
            <div style="display:flex;gap:3px">${days.map((d,i)=>`<label style="display:inline-flex;align-items:center;gap:2px;font-size:11px;padding:3px 5px;background:${(r.byDay||[]).includes(i)?'var(--ac)':'var(--s3)'};color:${(r.byDay||[]).includes(i)?'#fff':'var(--t2)'};border-radius:3px;cursor:pointer" onclick="(function(lbl){setTimeout(()=>{const cb=lbl.querySelector('input');const on=cb.checked;lbl.style.background=on?'var(--ac)':'var(--s3)';lbl.style.color=on?'#fff':'var(--t2)';},0)})(this)"><input type="checkbox" data-rec-day="${i}" ${(r.byDay||[]).includes(i)?'checked':''} style="display:none">${d}</label>`).join('')}</div>
          </div>
          <div style="display:flex;gap:8px"><label style="font-size:11px;color:var(--t2);flex:1">Until <input type="date" id="dr-rec-until" class="inp" value="${r.until||''}" style="font-size:11px;padding:2px 4px"></label><label style="font-size:11px;color:var(--t2);flex:1">Max count <input type="number" id="dr-rec-count" class="inp" min="0" placeholder="∞" value="${r.count||''}" style="font-size:11px;padding:2px 4px"></label></div>`;})()}
        </div>
      </div>
      <div class="field"><label>Est. Time (min)<span id="dr-actual-line" style="font-size:11px;color:var(--t3);margin-left:6px"></span></label><input class="inp" type="number" value="${item.estimatedMins||''}" id="dr-estmins" min="0"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Energy</label><select class="inp" id="dr-energy"><option ${item.energy==='high'?'selected':''}>high</option><option ${item.energy==='medium'?'selected':''}>medium</option><option ${item.energy==='low'?'selected':''}>low</option></select></div>
      <div class="field"><label>Linked Goal</label><select class="inp" id="dr-goal"><option value="">None</option>${D.goals.map(g=>`<option value="${g.id}" ${item.linkedGoalId===g.id?'selected':''}>${g.icon} ${esc(g.title)}</option>`).join('')}</select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Assignees <span style="font-size:11px;color:var(--t3);font-weight:400">★=Primary</span></label>${buildMultiAssignee('dr-ma',item)}</div>
      <div class="field"><label>Created By</label><input class="inp" value="${esc(item.createdBy||D.creds.userName||'Idris Grant')}" id="dr-createdby" readonly style="background:var(--s2);color:var(--t3)"></div>
    </div>
    <div class="field">
      <label style="display:flex;align-items:center;justify-content:space-between">
        Notes
        <button type="button" id="btn-dr-task-ai-desc" class="btn btn-s" style="height:22px;font-size:11px;padding:0 8px;color:var(--ac)" onclick="aiComposeTaskNotes(${_tidLit(item.id)})">✨ AI Compose</button>
      </label>
      ${luRTE_render({id:'dr-notes-rte', placeholder:'Notes, context, decisions…', value:(item.notesHtml||item.notes||''), height:'120px'})}
    </div>
    <div class="field"><label style="display:flex;align-items:center;justify-content:space-between">Subtasks ${subs.length?`<span style="font-size:11px;color:var(--t3)">(${doneCount}/${subs.length} done)</span>`:'<span></span>'}<button type="button" id="btn-dr-task-ai-subs" class="btn btn-s" style="height:22px;font-size:11px;padding:0 8px;color:var(--purp)" onclick="aiSuggestSubtasks(${_tidLit(item.id)})">🧩 AI Suggest Subtasks</button></label>
    <div id="subtask-list">${subHtml}</div>
    <div style="display:flex;gap:6px;margin-top:6px"><input class="inp" placeholder="Add subtask..." id="new-subtask" style="flex:1" onkeydown="if(event.key==='Enter'){event.preventDefault();addSubtask(${_tidLit(item.id)})}"><button class="btn btn-s" onclick="addSubtask(${_tidLit(item.id)})">+ Add</button></div>
    ${_renderRealSubtasksSection(item)}
    </div>
    <!-- Linked Items — chip-based picker so it's obvious what's actually
         linked vs. just visible in a multi-select. Initialized below via
         _drInitLinks(item) which reads item.linkedXxxIds into _drLinks. -->
    <div class="field" style="margin-top:8px"><label>🔗 Linked Items <span style="font-size:11px;font-weight:400;color:var(--t3)">Pick from the dropdown to link · click ✕ on a chip to unlink · saves with Save Changes</span></label>
      <div id="dr-task-links" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px"></div>
    </div>
    <div class="field"><label>Comments / Activity</label>
    <div id="task-comments" style="max-height:140px;overflow-y:auto;margin-bottom:6px">${(function(comments){if(!comments||!comments.length)return "<div style='font-size:10px;color:var(--t3);padding:4px 0'>No comments yet.</div>";return comments.map((c,ci)=>{const isOwn=c.author===(D.creds.userName||(D.teams[0]&&D.teams[0].members[0]&&D.teams[0].members[0].name)||'Idris');return `<div style="padding:5px 0;border-bottom:1px solid var(--s3)"><div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--t3);margin-bottom:2px"><span>${esc(c.author||'Idris')}</span><div style="display:flex;gap:4px;align-items:center"><span>${c.ts||''}</span>${isOwn?`<span onclick="editTaskComment(${_tidLit(item.id)},${ci})" style="cursor:pointer;color:var(--ac);font-size:11px" title="Edit">✏</span><span onclick="deleteTaskComment(${_tidLit(item.id)},${ci})" style="cursor:pointer;color:var(--red);font-size:11px" title="Delete">✕</span>`:''}</div></div><div style="font-size:11px">${esc(c.text)}</div></div>`;}).join('');})(item.comments||[])}</div>
    <div style="display:flex;gap:6px"><input class="inp" placeholder="Add a comment..." id="new-comment" style="flex:1" onkeydown="if(event.key==='Enter'){event.preventDefault();addTaskComment(${_tidLit(item.id)})}"><button class="btn btn-s" onclick="addTaskComment(${_tidLit(item.id)})">Post</button></div>
    </div>
    <div class="dr-actions">
    <button class="btn btn-p" onclick="saveItem('task',${_tidLit(item.id)})">Save Changes</button>
    <button class="btn btn-s" title="${item.pushedTo&&item.pushedTo.source==='nifty'?'Already pushed to Nifty · click to open it':'Create this task in NiftyPM (project, assignee, dates, status)'}" onclick="${item.pushedTo&&item.pushedTo.url?`window.open('${esc(item.pushedTo.url)}','_blank','noopener')`:`openPushToNiftyModal(${_tidLit(item.id)})`}">↗ ${item.pushedTo&&item.pushedTo.source==='nifty'?'Open in Nifty':'Push to Nifty'}</button>
    <button class="btn btn-d" onclick="deleteItem('task',${_tidLit(item.id)})">Delete</button>
    <button class="btn btn-s" onclick="closeDrawer()">Cancel</button></div>`;
  }
   if(type==='note'){
    return `<h2>${item.icon?esc(item.icon)+' ':'\ud83d\udcdd '}Edit Note ${pinBtn('note',item.id)}${cb}</h2>
    <div class="field-row" style="align-items:flex-end">
      <div class="field" style="flex:0 0 auto"><label>Icon</label>${_iconPickBtn('dr-note-icon',item.icon||'','Pick\u2026')}</div>
      <div class="field" style="flex:1"><label>Title</label><input class="inp" value="${esc(item.title)}" id="dr-title"></div>
      <div class="field" style="flex:0 0 auto"><label style="font-size:11px;color:var(--t2)">Title Color</label>
        <div style="display:flex;gap:4px;align-items:center;margin-top:4px">
          ${['','#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#06b6d4'].map(c=>c?`<span onclick="document.getElementById('dr-note-title-color').value='${c}';this.parentElement.querySelectorAll('span').forEach(s=>s.style.outline='');this.style.outline='2px solid var(--ac)';this.style.outlineOffset='1px'" style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${c};cursor:pointer;${(item.titleColor||'')=== c?'outline:2px solid var(--ac);outline-offset:1px':''}"></span>`:`<span onclick="document.getElementById('dr-note-title-color').value='';this.parentElement.querySelectorAll('span').forEach(s=>s.style.outline='');this.style.outline='2px solid var(--ac)';this.style.outlineOffset='1px'" style="display:inline-block;width:16px;height:16px;border-radius:50%;background:var(--s3);cursor:pointer;border:1px dashed var(--bd2);${!(item.titleColor)?'outline:2px solid var(--ac);outline-offset:1px':''}" title="Default"></span>`).join('')}
          <input type="color" id="dr-note-title-color" value="${item.titleColor||'#4f46e5'}" style="width:22px;height:22px;border:none;background:none;cursor:pointer;padding:0" title="Custom color">
        </div>
      </div>
    </div>
    <div class="field"><label>Tags (comma separated)</label><input class="inp" value="${(item.tags||[]).join(', ')}" id="dr-tags"></div>
    <div class="field-row">
      <div class="field" style="flex:1"><label>Source</label><input class="inp" value="${esc(item.source)}" id="dr-source"></div>
      <div class="field" style="flex:1"><label>📁 Folder</label>
        <select class="inp" id="dr-folder">
          <option value="">— No folder —</option>
          ${_noteFolderFlatList().map(({f,depth})=>`<option value="${f.id}" ${item.folderId===f.id?'selected':''}>${'  '.repeat(depth)}${esc(f.icon||'📁')} ${esc(f.name)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field"><label>Content (Markdown)</label><textarea class="inp" style="min-height:120px" id="dr-body">${esc(item.body||'')}</textarea></div>
    <div class="field" style="margin-top:8px">
      <label><span>📝 Free-form Body <span style="font-size:11px;font-weight:400;color:var(--t3)">Rich text — edit freely</span></span></label>
      ${luRTE_render({id:'dr-note-rte', placeholder:'Continue your note here…', value:(item.bodyHtml||''), height:'160px'})}
      <!-- AI Assistance in Note Drawer -->
      <div style="margin-top:6px;padding:7px;background:var(--s2);border-radius:6px;border:1px solid var(--bd1)">
        <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:5px">✨ AI Assistance</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button type="button" class="btn btn-s" style="height:22px;font-size:11px" onclick="drNoteAI('expand')">${_icon('sparkles',12,'currentColor')} Expand</button>
          <button type="button" class="btn btn-s" style="height:22px;font-size:11px" onclick="drNoteAI('summarise')">${_icon('list',12,'currentColor')} Summarise</button>
          <button type="button" class="btn btn-s" style="height:22px;font-size:11px" onclick="drNoteAI('link')">🔗 Link Concepts</button>
          <button type="button" class="btn btn-s" style="height:22px;font-size:11px" onclick="drNoteAI('autotag')">${_icon('tag',12,'currentColor')} Auto-tag</button>
        </div>
        <div id="dr-note-ai-result" style="display:none;margin-top:5px;padding:7px;background:var(--s1);border-radius:4px;font-size:11px;color:var(--t2);line-height:1.6;white-space:pre-wrap;max-height:150px;overflow-y:auto"></div>
      </div>
    </div>
    <!-- Linked Items — chip-based picker (same as the Task drawer). Moved
         to sit next to Related Bookmarks so it's visible in the same scroll
         viewport above the Save / Delete / Cancel actions; the user can't
         miss it from the bottom of the drawer. Hydrated by
         openDrawer -> _drInitLinks. -->
    <div style="margin-top:12px;padding:10px;background:var(--s2);border-radius:6px;border:1px solid var(--bd1)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:11px;font-weight:600;color:var(--t2)">🔗 Linked Items</span>
        <span style="font-size:11px;color:var(--t3);font-weight:400">Pick from each dropdown · click ✕ on a chip to unlink · saves with Save Changes</span>
      </div>
      <div id="dr-task-links" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"></div>
    </div>
    <!-- Related Bookmarks Section -->
    <div style="margin-top:12px;padding:10px;background:var(--s2);border-radius:6px;border:1px solid var(--bd1)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:11px;font-weight:600;color:var(--t2)">🔗 Related Bookmarks</span>
        <button type="button" class="btn btn-s" style="height:22px;font-size:11px;padding:0 8px" onclick="showLinkBookmarkPanel('note',${_tidLit(item.id)})">+ Link</button>
      </div>
      <div id="related-bk-note-${item.id}" style="font-size:11px;color:var(--t3)">Loading...</div>
    </div>
    <div class="dr-actions">
    <button class="btn btn-p" onclick="saveItem('note',${_tidLit(item.id)})">Save Changes</button>
    <button class="btn btn-d" onclick="deleteItem('note',${_tidLit(item.id)})">Delete</button>
    <button class="btn btn-s" onclick="closeDrawer()">Cancel</button></div>`;
  }
  if(type==='program'){
    return `<h2>${item.icon?esc(item.icon)+' ':'📊 '}Edit Program ${cb}</h2>
    <div class="field-row" style="align-items:flex-end">
      <div class="field" style="flex:0 0 auto"><label>Icon</label>${_iconPickBtn('dr-prog-icon',item.icon||'📊','Pick…')}</div>
      <div class="field" style="flex:1"><label>Name</label><input class="inp" value="${esc(item.name||'')}" id="dr-title"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Color</label><input type="color" value="${esc(item.color||'#1f6feb')}" id="dr-color" style="height:32px;width:60px;border:none;background:none;cursor:pointer"></div>
      <div class="field"><label>Status</label><select class="inp" id="dr-status"><option ${(item.status||'Active')==='Active'?'selected':''}>Active</option><option ${item.status==='Paused'?'selected':''}>Paused</option><option ${item.status==='Completed'?'selected':''}>Completed</option></select></div>
      <div class="field"><label>Owner</label><input class="inp" value="${esc(item.owner||'')}" id="dr-owner"></div>
    </div>
    <div class="field"><label>Description</label><textarea class="inp" id="dr-body" style="min-height:60px">${esc(item.description||'')}</textarea></div>
    <div class="field"><label>Assignees <span style="font-size:11px;color:var(--t3);font-weight:400">★=Primary Responsible</span></label>${buildMultiAssignee('dr-prog-ma',item)}</div>
    <div class="field"><label>Projects in this program (${(D.projects||[]).length} available)</label>
      <div style="max-height:220px;overflow-y:auto;border:1px solid var(--bd2);border-radius:5px;padding:4px;background:var(--s2)">
        ${(D.projects||[]).map(p=>`<label style="display:flex;align-items:center;gap:6px;padding:3px 4px;cursor:pointer;font-size:11px"><input type="checkbox" ${(item.projectIds||[]).includes(p.id)?'checked':''} data-prog-pid="${p.id}" class="prog-proj-cb"><span style="width:7px;height:7px;border-radius:2px;background:${p.color};display:inline-block"></span> ${p.icon?esc(p.icon)+' ':''}${esc(p.name)}</label>`).join('')}
      </div>
    </div>
    <div class="dr-actions">
      <button class="btn btn-p" onclick="saveItem('program',${_tidLit(item.id)})">Save</button>
      <button class="btn btn-d" onclick="deleteItem('program',${_tidLit(item.id)})">Delete</button>
      <button class="btn btn-s" onclick="closeDrawer()">Cancel</button>
    </div>`;
  }
  if(type==='project'){
    return `<h2>${item.icon?esc(item.icon)+' ':'📁 '}Edit Project ${cb}</h2>
    <div class="field-row" style="align-items:flex-end"><div class="field" style="flex:0 0 auto"><label>Icon</label>${_iconPickBtn('dr-proj-icon',item.icon||'','Pick…')}</div>
    <div class="field" style="flex:1"><label>Name</label><input class="inp" value="${esc(item.name)}" id="dr-title"></div></div>
    <div class="field-row"><div class="field"><label>Color</label><input type="color" value="${item.color}" id="dr-color" style="height:32px;width:60px;border:none;background:none;cursor:pointer"></div>
    <div class="field"><label>Status</label><select class="inp" id="dr-status"><option>Active</option><option>On Hold</option><option>Completed</option></select></div></div>
    <div class="field-row"><div class="field"><label>Due</label><input class="inp" value="${esc(item.due)}" id="dr-due"></div>
    <div class="field"><label>Progress %</label><input type="number" class="inp" value="${item.pct}" min="0" max="100" id="dr-pct"></div></div>
    <div class="field"><label>Assignees <span style="font-size:11px;color:var(--t3);font-weight:400">★=Primary Responsible</span></label>${buildMultiAssignee('dr-proj-ma',item)}</div>
    <div class="field"><label style="display:flex;align-items:center;justify-content:space-between">Description<button type="button" id="btn-dr-proj-ai-desc" class="btn btn-s" style="height:22px;font-size:11px;padding:0 8px;color:var(--ac)" onclick="aiComposeProjectDesc(${_tidLit(item.id)})">✨ AI Describe</button></label><textarea class="inp" id="dr-body">${esc(item.desc||'')}</textarea></div>
    ${_renderProjectEditTasksSection(item.id)}
    <div class="field" style="margin-top:14px">
      <label style="display:flex;align-items:center;justify-content:space-between">
        <span>Custom Fields</span>
        <button type="button" class="btn btn-s" style="height:22px;font-size:11px;padding:0 8px" onclick="_openCustomFieldEditor(${_tidLit(item.id)})">+ Add field</button>
      </label>
      <div id="proj-custom-fields-list" style="margin-top:4px;padding:8px;background:var(--s2);border:1px solid var(--bd1);border-radius:6px;font-size:11px;color:var(--t3)">Loading…</div>
    </div>
    <div class="dr-actions">
    <button class="btn btn-p" onclick="saveItem('project',${_tidLit(item.id)})">Save</button>
    <button class="btn btn-s" style="color:var(--purp)" onclick="aiSuggestProjectTasks(${_tidLit(item.id)})">🧩 AI Suggest Tasks</button>
    <button class="btn btn-d" onclick="deleteItem('project',${_tidLit(item.id)})">Delete</button>
    <button class="btn btn-s" onclick="closeDrawer()">Cancel</button></div>`;
  }
  if(type==='goal'){
    return `<h2>${_icon('target',18,'currentColor')} Edit Goal ${pinBtn('goal',item.id)}${cb}</h2>
    <div class="field"><label>Title</label><input class="inp" value="${esc(item.title)}" id="dr-title"></div>
    <div class="field-row">
      <div class="field"><label>Icon</label>${_iconPickBtn('dr-icon',item.icon||'🎯','Pick…')}</div>
      <div class="field"><label>Category</label><select class="inp" id="dr-category"><option ${(item.category||'')==='Work'?'selected':''}>Work</option><option ${item.category==='Learning'?'selected':''}>Learning</option><option ${item.category==='Health'?'selected':''}>Health</option><option ${item.category==='Personal Brand'?'selected':''}>Personal Brand</option><option ${item.category==='Finance'?'selected':''}>Finance</option><option ${item.category==='Personal'?'selected':''}>Personal</option></select></div>
      <div class="field"><label>Progress %${item.pctManual?` <span style="font-size:11px;color:var(--warn);font-weight:600">(manual)</span>`:''}</label><input type="number" class="inp" value="${item.pct}" min="0" max="100" id="dr-pct"><div style="font-size:11px;color:var(--t3);margin-top:3px">${item.pctManual?'Manual override active — auto-calculation from linked tasks &amp; milestones is paused. <a style="color:var(--ac);cursor:pointer" onclick="event.stopPropagation();document.getElementById(\'dr-pct\').dataset.resetAuto=\'1\';this.textContent=\'✓ will reset on Save\'">↺ Reset to auto</a>':'Auto-calculated from linked tasks &amp; milestones. Edit to lock to a manual value.'}</div></div>
    </div>
    <div class="field"><label>Target <span style="font-size:11px;color:var(--t3);font-weight:400">(short summary, e.g. "5 of 12 done")</span></label><input class="inp" value="${esc(item.target||'')}" id="dr-target"></div>
    <div class="field-row">
      <div class="field"><label>Start Date</label><input class="inp" type="date" value="${esc(item.startDate||'')}" id="dr-startdate"></div>
      <div class="field"><label>Due Date</label><input class="inp" type="date" value="${esc(item.dueDate||'')}" id="dr-due"></div>
    </div>
    <div class="field" style="margin-top:8px">
      <label><span>Description <span style="font-size:11px;color:var(--t3);font-weight:400">Rich text — why this goal matters, milestones, etc.</span></span></label>
      ${luRTE_render({id:'dr-goal-rte', placeholder:'Describe the goal in detail — why it matters, milestones, success criteria…', value:(item.descriptionHtml||''), height:'140px'})}
    </div>
    <div class="field"><label>Linked Tasks</label><div style="max-height:120px;overflow-y:auto;border:1px solid var(--bd2);border-radius:5px;padding:4px">${D.tasks.map(t=>`<label style="display:flex;align-items:center;gap:6px;padding:2px 4px;cursor:pointer;font-size:11px"><input type="checkbox" ${(item.linkedTaskIds||[]).includes(t.id)?'checked':''} data-tid="${t.id}" class="goal-task-cb"> ${esc(t.title)}</label>`).join('')}</div></div>
    <div class="dr-actions">
    <button class="btn btn-p" onclick="saveItem('goal',${_tidLit(item.id)})">Save</button>
    <button class="btn btn-d" onclick="deleteItem('goal',${_tidLit(item.id)})">Delete</button>
    <button class="btn btn-s" onclick="closeDrawer()">Cancel</button></div>`;
  }
  if(type==='journal'){
    return `<h2>${_icon('edit',18,'currentColor')} Edit Journal Entry ${cb}</h2>
    <div class="field"><label>Title</label><input class="inp" value="${esc(item.title)}" id="dr-title"></div>
    ${(()=>{const iso=typeof _faJournalISO==='function'?_faJournalISO(item):'';const legacy=item.date&&!/^\d{4}-\d{2}-\d{2}$/.test(String(item.date))?`<div style="font-size:11px;color:var(--t3);margin-top:3px">Saved as &ldquo;${esc(item.date)}&rdquo;</div>`:'';return `<div class="field"><label>Date</label><input type="date" class="inp" value="${iso}" data-orig="${iso}" id="dr-date">${legacy}</div>`;})()}
    <div class="field"><label>Mood</label><div style="display:flex;gap:6px">${['😊','🙂','😐','😫','😰'].map(m=>`<span style="font-size:20px;cursor:pointer;${item.mood===m?'outline:2px solid var(--ac);border-radius:6px':''}" onclick="this.parentElement.querySelectorAll('span').forEach(s=>s.style.outline='');this.style.outline='2px solid var(--ac)';this.style.borderRadius='6px';document.getElementById('dr-mood').value='${m}'">${m}</span>`).join('')}</div><input type="hidden" id="dr-mood" value="${item.mood}"></div>
    <div class="field"><label>Content</label><textarea class="inp" style="min-height:150px" id="dr-body">${esc(item.body||'')}</textarea></div>
    <div class="field" style="margin-top:10px">
      <label><span>📓 Diary Entry <span style="font-size:11px;font-weight:400;color:var(--t3)">Rich text — edit freely</span></span></label>
      ${luRTE_render({id:'dr-diary-rte', placeholder:'Continue your diary entry here…', value:(item.diaryBody||''), height:'160px'})}
      <!-- AI Assistance in Drawer -->
      <div style="margin-top:6px;padding:7px;background:var(--s2);border-radius:6px;border:1px solid var(--bd1)">
        <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:5px">✨ AI Assistance</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button type="button" class="btn btn-s" style="height:22px;font-size:11px" onclick="drJrnlAI('expand')">${_icon('sparkles',12,'currentColor')} Expand</button>
          <button type="button" class="btn btn-s" style="height:22px;font-size:11px" onclick="drJrnlAI('reflect')">🧘 Reflect</button>
          <button type="button" class="btn btn-s" style="height:22px;font-size:11px" onclick="drJrnlAI('summarise')">${_icon('list',12,'currentColor')} Summarise</button>
          <button type="button" class="btn btn-s" style="height:22px;font-size:11px" onclick="drJrnlAI('mood')">${_icon('activity',12,'currentColor')} Mood</button>
          <button type="button" class="btn btn-s" style="height:22px;font-size:11px;color:var(--ac)" onclick="drJrnlAI('react')">💬 React</button>
          ${typeof _aiLengthChip==='function'?_aiLengthChip():''}
        </div>
        <div id="dr-jrnl-ai-result" style="display:none;margin-top:5px;padding:7px;background:var(--s1);border-radius:4px;font-size:11px;color:var(--t2);line-height:1.6;white-space:pre-wrap;max-height:150px;overflow-y:auto"></div>
      </div>
    </div>
    <div class="field" style="margin-top:10px"><label>&#128279; Linked Items <span style="font-size:11px;font-weight:400;color:var(--t3)">Pick from the dropdown to link &middot; click &#10005; on a chip to unlink &middot; saves with Save</span></label>
      <div id="dr-task-links" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px"></div>
    </div>
    <div class="dr-actions">
    <button class="btn btn-p" onclick="saveItem('journal',${_tidLit(item.id)})">Save</button>
    <button class="btn btn-s" onclick="closeDrawer();openFA('journal',${_tidLit(item.id)})" title="Edit every field: energy, reflection prompts, highlights, gratitude, sleep, exercise, tags and more">${_icon('edit',12,'currentColor')} Edit all fields</button>
    <button class="btn btn-s" onclick="shareJournalEntry(${_tidLit(item.id)})">📤 Share / Copy</button>
    <button class="btn btn-s" onclick="exportSingleJournalMD(${_tidLit(item.id)})" title="Export this entry as Markdown">⬇ MD</button>
    <button class="btn btn-s" onclick="exportSingleJournalPDF(${_tidLit(item.id)})" title="Export this entry as PDF">🖨 PDF</button>
    <button class="btn btn-d" onclick="deleteItem('journal',${_tidLit(item.id)})">Delete</button></div>`;
  }
  return `<h2>Details ${cb}</h2><p>Details view for this item.</p>`;
}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
// Safe to drop inside a single-quoted JS string literal inside an HTML
// attribute. Escapes backslash, single quote, and HTML-escapes the rest.
// An id as a JS literal for an inline handler: numbers (and numeric strings)
// stay bare, exactly as before; other ids (server-promoted subtasks "s1716…",
// older Atlas items "n_…") are quoted — unquoted, they were read as variable
// names and the click threw before doing anything.
// Run a re-render without losing the text box being typed in. Search boxes
// that re-render their whole page replaced themselves on every keystroke, so
// typing stopped after one letter. The box is found again by id, or by its
// placeholder (unique on each page), and gets focus and caret back.
function _keepFocus(fn){
  const a=document.activeElement;
  let key=null,s=null,e=null;
  if(a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA')){
    const esc2=v=>(window.CSS&&CSS.escape)?CSS.escape(v):String(v).replace(/["\\]/g,'\\$&');
    key=a.id?'#'+esc2(a.id):(a.placeholder?a.tagName.toLowerCase()+'[placeholder="'+esc2(a.placeholder)+'"]':null);
    try{s=a.selectionStart;e=a.selectionEnd;}catch(_){}
  }
  const r=fn();
  if(key){
    const n=document.querySelector(key);
    if(n&&n!==document.activeElement){
      n.focus();
      try{if(s!=null)n.setSelectionRange(s,e);}catch(_){}
    }
  }
  return r;
}
function _tidLit(id){
  if(typeof id==='number'&&Number.isFinite(id))return String(id);
  const s=String(id==null?'':id);
  return /^-?\d+(\.\d+)?$/.test(s)?s:"'"+_jsAttr(s)+"'";
}
// Any value as a JS literal inside a DOUBLE-quoted on*="…" attribute: the
// JSON is HTML-escaped, and the browser decodes it back before running it.
// (A raw JSON.stringify there ends the attribute at its first quote.)
function _jsArg(v){
  return JSON.stringify(v===undefined?null:v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function _jsAttr(s){return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
// ── CSV / HTML EXPORT HELPERS ────────────────────────────────────────────────
// Convert a JS value into a CSV-safe cell. Quotes if needed; escapes embedded quotes.
function _csvCell(v){
  if(v===null||v===undefined)return '';
  let s=typeof v==='string'?v:(Array.isArray(v)?v.join('; '):(typeof v==='object'?JSON.stringify(v):String(v)));
  s=s.replace(/\r?\n/g,' ').trim();
  if(s.includes('"')||s.includes(',')||s.includes('\n'))s='"'+s.replace(/"/g,'""')+'"';
  return s;
}
function _exportToCSV(filename,headers,rows){
  const csv=[headers.map(_csvCell).join(',')].concat(rows.map(r=>headers.map(h=>_csvCell(r[h])).join(','))).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();
  setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},100);
  toast('⬇ Exported '+filename);
}
function _exportToHTML(filename,title,headers,rows){
  const stamp=new Date().toLocaleString();
  const tableRows=rows.map(r=>'<tr>'+headers.map(h=>{const v=r[h];const cell=v==null?'':(Array.isArray(v)?v.join(', '):(typeof v==='object'?JSON.stringify(v):String(v)));return '<td>'+esc(cell).replace(/\n/g,'<br>')+'</td>';}).join('')+'</tr>').join('');
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  body{font-family:'Segoe UI',Inter,Arial,sans-serif;margin:32px;color:#222}
  h1{margin:0 0 4px;font-size:22px}
  .meta{color:#666;font-size:12px;margin-bottom:18px}
  table{border-collapse:collapse;width:100%;font-size:12px}
  th{background:#f2f4f7;text-align:left;padding:8px 10px;border:1px solid #d0d5dd;font-weight:600}
  td{padding:8px 10px;border:1px solid #e4e7ec;vertical-align:top}
  tr:nth-child(even) td{background:#fafbfc}
  </style></head><body>
  <h1>${esc(title)}</h1>
  <div class="meta">Exported ${esc(stamp)} · ${rows.length} item${rows.length===1?'':'s'}</div>
  <table><thead><tr>${headers.map(h=>'<th>'+esc(h)+'</th>').join('')}</tr></thead><tbody>${tableRows}</tbody></table>
  </body></html>`;
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();
  setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},100);
  toast('⬇ Exported '+filename+' (open in Word/browser)');
}
// Per-section export entry points.
function exportTasks(format){
  const items=(D.tasks||[]).map(t=>({Title:t.title,Status:t.status,Priority:t.priority,Due:t.due||'',Project:t.project||'',Context:t.context||'',Tags:(t.tags||[]).join('; '),Notes:t.notes||'',CreatedBy:t.createdBy||'',CreatedAt:t.createdAt||''}));
  const headers=['Title','Status','Priority','Due','Project','Context','Tags','Notes','CreatedBy','CreatedAt'];
  const stamp=_ymd(new Date());
  if(format==='html')_exportToHTML('levelup-tasks-'+stamp+'.html','LevelUp — Tasks',headers,items);
  else _exportToCSV('levelup-tasks-'+stamp+'.csv',headers,items);
}
function exportNotes(format){
  const items=(D.notes||[]).map(n=>({Title:n.title,Source:n.source||'',Tags:(n.tags||[]).join('; '),Updated:n.updated||'',Body:n.body||'',Starred:n.starred?'Yes':''}));
  const headers=['Title','Source','Tags','Updated','Body','Starred'];
  const stamp=_ymd(new Date());
  if(format==='html')_exportToHTML('levelup-notes-'+stamp+'.html','LevelUp — Notes',headers,items);
  else _exportToCSV('levelup-notes-'+stamp+'.csv',headers,items);
}
function exportProjects(format){
  const items=(D.projects||[]).map(p=>({Name:p.name,Status:p.status||'',Owner:p.owner||'',StartDate:p.startDate||'',Due:p.due||'',Quarter:p.quarter||'',Description:p.desc||'',Progress:(p.pct||0)+'%'}));
  const headers=['Name','Status','Owner','StartDate','Due','Quarter','Description','Progress'];
  const stamp=_ymd(new Date());
  if(format==='html')_exportToHTML('levelup-projects-'+stamp+'.html','LevelUp — Projects',headers,items);
  else _exportToCSV('levelup-projects-'+stamp+'.csv',headers,items);
}
function exportClusters(format){
  const items=(D.clusters||[]).map(c=>{const projIds=new Set(c.projectIds||[]);const tasks=(D.tasks||[]).filter(t=>t.clusterId===c.id||(t.projectId&&projIds.has(t.projectId)));const done=tasks.filter(t=>t.status==='Done').length;return {Name:c.name,Icon:c.icon||'',Color:c.color||'',Owner:c.owner||'',Projects:(c.projectIds||[]).length,TotalTasks:tasks.length,DoneTasks:done,Progress:tasks.length?Math.round(done/tasks.length*100)+'%':'0%',CreatedAt:c.createdAt||''};});
  const headers=['Name','Icon','Color','Owner','Projects','TotalTasks','DoneTasks','Progress','CreatedAt'];
  const stamp=_ymd(new Date());
  if(format==='html')_exportToHTML('levelup-clusters-'+stamp+'.html','LevelUp — Clusters',headers,items);
  else _exportToCSV('levelup-clusters-'+stamp+'.csv',headers,items);
}
function exportJournal(format){
  const items=(D.journal||[]).map(j=>({Date:j.date||'',Title:j.title||'',Mood:j.mood||'',Body:j.body||'',Tags:(j.tags||[]).join('; ')}));
  const headers=['Date','Title','Mood','Body','Tags'];
  const stamp=_ymd(new Date());
  if(format==='html')_exportToHTML('levelup-journal-'+stamp+'.html','LevelUp — Journal',headers,items);
  else _exportToCSV('levelup-journal-'+stamp+'.csv',headers,items);
}
function openExportPicker(){
  const sections=[
    {id:'tasks',label:'Tasks',icon:'✓',count:(D.tasks||[]).length,fn:'exportTasks'},
    {id:'notes',label:'Notes',icon:'📝',count:(D.notes||[]).length,fn:'exportNotes'},
    {id:'projects',label:'Projects',icon:'📁',count:(D.projects||[]).length,fn:'exportProjects'},
    {id:'clusters',label:'Clusters',icon:'⬡',count:(D.clusters||[]).length,fn:'exportClusters'},
    {id:'journal',label:'Journal',icon:'📔',count:(D.journal||[]).length,fn:'exportJournal'},
    {id:'bookmarks',label:'Bookmarks',icon:'🔖',count:'…',fn:'exportBookmarks'},
  ];
  const html=`<div style="padding:18px;min-width:360px">
    <h3 style="font-size:15px;font-weight:700;margin-bottom:6px">⬇ Export Data</h3>
    <p style="font-size:11px;color:var(--t3);margin-bottom:14px">Pick a section, then a format. Your data downloads as a file.</p>
    <div style="display:flex;flex-direction:column;gap:6px">${sections.map(s=>`
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--s2);border:1px solid var(--bd1);border-radius:8px">
        <span style="font-size:18px;width:24px;text-align:center">${s.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600">${s.label}</div>
          <div style="font-size:11px;color:var(--t3)">${s.count} item${s.count===1?'':'s'}</div>
        </div>
        <button class="btn btn-s" style="height:26px;font-size:11px" onclick="closeModal();${s.fn}('csv')">CSV</button>
        <button class="btn btn-s" style="height:26px;font-size:11px" onclick="closeModal();${s.fn}('html')">HTML</button>
      </div>`).join('')}</div>
    <div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn btn-s" onclick="closeModal()">Close</button></div>
  </div>`;
  const mc=document.getElementById('modal-content');
  if(mc)mc.innerHTML=html;
  document.getElementById('modal-capture').classList.add('show');
  document.body.style.overflow='hidden';
}
async function exportBookmarks(format){
  try{
    const res=await _trpc('bookmarks.list',{page:1,pageSize:100},'query');
    const items=(res?.bookmarks||[]).map(b=>({Title:b.title||'',URL:b.url||'',SiteName:b.siteName||'',Description:b.description||'',Tags:(b.tags||[]).join('; '),CreatedAt:b.createdAt||''}));
    const headers=['Title','URL','SiteName','Description','Tags','CreatedAt'];
    const stamp=_ymd(new Date());
    if(format==='html')_exportToHTML('levelup-bookmarks-'+stamp+'.html','LevelUp — Bookmarks',headers,items);
    else _exportToCSV('levelup-bookmarks-'+stamp+'.csv',headers,items);
  }catch(e){toast('⚠ Export failed: '+e.message);}
}
// Real workspace accounts (so you can assign work to invited members like new
// hires that aren't in the local D.teams blob). Loaded once after login.
let _workspaceMembers=[];
async function _loadWorkspaceMembers(){
  try{
    if(typeof _trpc!=='function')return;
    const res=await _trpc('team.listMembers',undefined,'query');
    if(Array.isArray(res)){
      _workspaceMembers=res;
      if(typeof curScreen!=='undefined'&&curScreen==='team'&&typeof renderTeam==='function')renderTeam();
    }
  }catch(_){ /* non-fatal — fall back to blob members */ }
}
// Merged assignee roster: real accounts first, then any legacy blob team
// members, deduped by name. Avatar/color come from a blob member when present.
function _assigneeMembers(){
  const blob=(D.teams||[]).flatMap(t=>t.members||[]);
  const byName=new Map();
  for(const m of blob){ if(m&&m.name)byName.set(m.name.trim().toLowerCase(),m); }
  const out=[];
  const seen=new Set();
  for(const u of (_workspaceMembers||[])){
    if(!u||!u.name)continue;
    const k=u.name.trim().toLowerCase();
    if(seen.has(k))continue; seen.add(k);
    const b=byName.get(k)||{};
    out.push({ name:u.name, role:u.role||b.role||'member', color:b.color||'#6366f1', avatar:b.avatar, userId:u.id });
  }
  for(const m of blob){
    if(!m||!m.name)continue;
    const k=m.name.trim().toLowerCase();
    if(seen.has(k))continue; seen.add(k);
    out.push(m);
  }
  return out;
}
// ── Multi-assignee picker (assignees[] + Primary Responsible) ─────────────
// Reusable across Task / Project / Program / Mind Map / Report editors.
// buildMultiAssignee(id,item) seeds from item.assignees/assigneeNames/
// primaryAssigneeId (falling back to legacy assignedTo) and renders chips with
// a ★ to set Primary + × to remove, plus an "+ Add member" select. Read the
// result with _maGet(id) → {assignees:[ids], assigneeNames:[names], primaryAssigneeId}.
// Only real accounts (members with a userId) are assignable, since the server
// keys cross-user visibility on userIds.
let _maState={};
function buildMultiAssignee(id,item){
  const members=_assigneeMembers().filter(m=>m.userId!=null);
  const seed=[];
  if(item){
    const ids=Array.isArray(item.assignees)?item.assignees.map(Number).filter(n=>!isNaN(n)):[];
    const names=Array.isArray(item.assigneeNames)?item.assigneeNames:[];
    if(ids.length){
      ids.forEach((uid,i)=>{ const m=members.find(x=>x.userId===uid); seed.push({userId:uid,name:(names[i]||(m&&m.name)||('user '+uid)),primary:Number(item.primaryAssigneeId)===uid}); });
    } else if(item.assignedTo){ const m=members.find(x=>x.name===item.assignedTo); if(m)seed.push({userId:m.userId,name:m.name,primary:true}); }
  }
  if(seed.length&&!seed.some(s=>s.primary))seed[0].primary=true;
  _maState[id]={list:seed};
  return _maRender(id);
}
function _maRender(id){
  const st=_maState[id]||{list:[]};
  const members=_assigneeMembers().filter(m=>m.userId!=null);
  const chips=st.list.map(s=>{
    const m=members.find(x=>x.userId===s.userId)||{};
    const ini=String(s.name||'?').split(' ').map(w=>w[0]||'').join('').substring(0,2).toUpperCase();
    const col=m.color||'#6366f1';
    return `<span style="display:inline-flex;align-items:center;gap:5px;background:var(--s2);border:1px solid ${s.primary?'var(--warn)':'var(--bd2)'};border-radius:999px;padding:2px 7px 2px 2px;margin:2px;font-size:11px">
      <span style="width:18px;height:18px;border-radius:50%;background:${col};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;flex-shrink:0">${ini}</span>
      <span>${esc(s.name)}</span>
      <span title="${s.primary?'Primary Responsible':'Make Primary'}" onclick="_maSetPrimary('${id}',${s.userId})" style="cursor:pointer;color:${s.primary?'var(--warn)':'var(--t3)'}">★</span>
      <span title="Remove" onclick="_maRemove('${id}',${s.userId})" style="cursor:pointer;color:var(--t3);font-weight:700;font-size:13px;line-height:1">×</span>
    </span>`;
  }).join('');
  const avail=members.filter(m=>!st.list.some(s=>s.userId===m.userId));
  const opts=['<option value="">+ Add member…</option>'].concat(avail.map(m=>`<option value="${m.userId}">${esc(m.name)}</option>`)).join('');
  return `<div id="${id}-ma">
    <div style="display:flex;flex-wrap:wrap;align-items:center;min-height:24px">${chips||'<span style="font-size:11px;color:var(--t3)">No one assigned</span>'}</div>
    <select class="inp" style="margin-top:4px;font-size:11px" onchange="_maAdd('${id}',this.value);this.value=''">${opts}</select>
  </div>`;
}
function _maAdd(id,uidStr){ const uid=Number(uidStr); if(!uid)return; const st=_maState[id]; if(!st)return; if(st.list.some(s=>s.userId===uid))return; const m=_assigneeMembers().find(x=>x.userId===uid); const first=st.list.length===0; st.list.push({userId:uid,name:(m&&m.name)||('user '+uid),primary:first}); _maRefresh(id); }
function _maRemove(id,uid){ const st=_maState[id]; if(!st)return; const wasPrimary=(st.list.find(s=>s.userId===uid)||{}).primary; st.list=st.list.filter(s=>s.userId!==uid); if(wasPrimary&&st.list.length)st.list[0].primary=true; _maRefresh(id); }
function _maSetPrimary(id,uid){ const st=_maState[id]; if(!st)return; st.list.forEach(s=>s.primary=(s.userId===uid)); _maRefresh(id); }
function _maRefresh(id){ const host=document.getElementById(id+'-ma'); if(host)host.outerHTML=_maRender(id); }
function _maGet(id){ const st=_maState[id]||{list:[]}; const primary=st.list.find(s=>s.primary); return { assignees:st.list.map(s=>s.userId), assigneeNames:st.list.map(s=>s.name), primaryAssigneeId:primary?primary.userId:null }; }
// Build a custom avatar+name assignee dropdown
function buildAssigneeDropdown(id,currentValue){
  const members=_assigneeMembers();
  const sel=members.find(m=>m.name===currentValue);
  const selInitials=sel?sel.name.split(' ').map(w=>w[0]||'').join('').substring(0,2).toUpperCase():'';
  const selColor=sel?sel.color||'var(--ac)':'var(--t3)';
  const triggerAvatar=sel
    ?(sel.avatar
        ?`<img src="${esc(sel.avatar)}" class="ca-avatar" style="object-fit:cover">`
        :`<div class="ca-avatar" style="background:${selColor}">${selInitials}</div>`)
    :`<div class="ca-avatar" style="background:var(--s3);color:var(--t3)">—</div>`;
  const items=[`<div class="ca-item ${!currentValue?'selected':''}" onclick="_caSelect('${id}','')"><div class="ca-avatar" style="background:var(--s3);color:var(--t3)">—</div><span>Unassigned</span></div>`]
    .concat(members.map(m=>{
      const ini=m.name.split(' ').map(w=>w[0]||'').join('').substring(0,2).toUpperCase();
      const col=m.color||'var(--ac)';
      const avatarEl=m.avatar
        ?`<img src="${esc(m.avatar)}" class="ca-avatar" style="object-fit:cover">`
        :`<div class="ca-avatar" style="background:${col}">${ini}</div>`;
      return `<div class="ca-item ${currentValue===m.name?'selected':''}" onclick="_caSelect('${id}','${esc(m.name)}')">${avatarEl}<span>${esc(m.name)}<span style="font-size:11px;color:var(--t3);margin-left:4px">${esc(m.role)}</span></span></div>`;
    }));
  return `<div class="ca-wrap" id="${id}-wrap">
    <input type="hidden" id="${id}-val" value="${esc(currentValue||'')}">
    <div class="ca-trigger" onclick="_caToggle('${id}')">${triggerAvatar}<span class="ca-label">${sel?esc(sel.name):'Unassigned'}</span><span class="ca-caret">▾</span></div>
    <div class="ca-menu" id="${id}-menu" style="display:none">${items.join('')}</div>
  </div>`;
}
function _caToggle(id){
  const menu=document.getElementById(id+'-menu');
  if(!menu)return;
  const open=menu.style.display!=='none';
  // Close all other open ca-menus
  document.querySelectorAll('.ca-menu').forEach(m=>{m.style.display='none';});
  if(!open){menu.style.display='block';}
}
function _caSelect(id,value){
  const hidden=document.getElementById(id+'-val');
  if(hidden)hidden.value=value;
  const menu=document.getElementById(id+'-menu');
  if(menu)menu.style.display='none';
  // Update trigger display
  const wrap=document.getElementById(id+'-wrap');
  if(!wrap)return;
  const members=_assigneeMembers();
  const sel=members.find(m=>m.name===value);
  const trigger=wrap.querySelector('.ca-trigger');
  if(!trigger)return;
  const ini=sel?sel.name.split(' ').map(w=>w[0]||'').join('').substring(0,2).toUpperCase():'';
  const col=sel?sel.color||'var(--ac)':'var(--t3)';
  const avatarEl=sel
    ?(sel.avatar
        ?`<img src="${esc(sel.avatar)}" class="ca-avatar" style="object-fit:cover">`
        :`<div class="ca-avatar" style="background:${col}">${ini}</div>`)
    :`<div class="ca-avatar" style="background:var(--s3);color:var(--t3)">—</div>`;
  trigger.innerHTML=`${avatarEl}<span class="ca-label">${sel?esc(sel.name):'Unassigned'}</span><span class="ca-caret">▾</span>`;
  // Update selected state in menu items
  wrap.querySelectorAll('.ca-item').forEach(item=>{
    item.classList.toggle('selected',item.querySelector('span')?.textContent?.trim().startsWith(value&&sel?sel.name:'__none__')||(!value&&item.textContent.includes('Unassigned')));
  });
}
// Close ca-menus when clicking outside
document.addEventListener('click',e=>{
  if(!e.target.closest('.ca-wrap')){
    document.querySelectorAll('.ca-menu').forEach(m=>{m.style.display='none';});
  }
});
// ── Date / time formatting respecting General prefs ──────────────────────────
function fmtDate(d){
  // d can be a Date object, ISO string, or YYYY-MM-DD string
  if(!d)return '';
  const dt=d instanceof Date?d:new Date(String(d).includes('T')?d:d+'T00:00');
  if(isNaN(dt))return String(d);
  const fmt=(D.prefs&&D.prefs.dateFormat)||'MM/DD/YYYY';
  const mm=String(dt.getMonth()+1).padStart(2,'0');
  const dd=String(dt.getDate()).padStart(2,'0');
  const yyyy=dt.getFullYear();
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if(fmt==='DD/MM/YYYY')return `${dd}/${mm}/${yyyy}`;
  if(fmt==='YYYY-MM-DD')return `${yyyy}-${mm}-${dd}`;
  if(fmt==='D MMM YYYY')return `${dt.getDate()} ${months[dt.getMonth()]} ${yyyy}`;
  return `${mm}/${dd}/${yyyy}`; // default MM/DD/YYYY
}
function fmtTime(d){
  if(!d)return '';
  const dt=d instanceof Date?d:_pd(d);
  if(isNaN(dt))return String(d);
  const use24=(D.prefs&&D.prefs.timeFormat)==='24h';
  return dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:!use24});
}
function fmtDateTime(d){
  if(!d)return '';
  return fmtDate(d)+' '+fmtTime(d);
}

function fmtNoteDate(raw){
  if(!raw&&raw!==0)return '';
  // Handle numeric ms-since-epoch timestamps from Word imports
  if(typeof raw==='number'||(/^\d{10,}$/.test(String(raw)))){
    const d=new Date(Number(raw));
    if(!isNaN(d.getTime()))return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  }
  // Already a human-readable string
  return String(raw);
}
// ─── Drawer Linked Items state (chip-based picker) ─────────────────────
// Held in module scope rather than on the item directly so Cancel doesn't
// commit changes mid-edit. Hydrated by _drInitLinks when the drawer opens
// and read on Save by saveItem.
let _drLinks={projects:[],goals:[],tasks:[],notes:[],bookmarks:[],journal:[]};
let _drLinksHostId=null;
let _drLinksHostType=null; // 'task' | 'note' | 'journal' (null = legacy: id match only)
function _drInitLinks(initial,hostId,hostType){
  _drLinks={
    projects:Array.isArray(initial?.projects)?[...initial.projects]:[],
    goals:Array.isArray(initial?.goals)?[...initial.goals]:[],
    tasks:Array.isArray(initial?.tasks)?[...initial.tasks]:[],
    notes:Array.isArray(initial?.notes)?[...initial.notes]:[],
    bookmarks:Array.isArray(initial?.bookmarks)?[...initial.bookmarks]:[],
    journal:Array.isArray(initial?.journal)?[...initial.journal]:[],
  };
  _drLinksHostId=hostId||null;
  _drLinksHostType=hostType||null;
}
// Is x the item the picker is open on? (Never offer an item as a link to itself.)
function _drIsHost(kind,x){return x.id===_drLinksHostId&&(!_drLinksHostType||_drLinksHostType===kind);}
function _drAddLink(category,idStr){
  const id=parseInt(idStr);if(isNaN(id))return;
  if(!_drLinks[category])_drLinks[category]=[];
  if(!_drLinks[category].includes(id))_drLinks[category].push(id);
  _drAutoSaveLinks();
  // Defer the re-render: rebuilding #dr-task-links innerHTML *inside* the
  // <select>'s own change event makes iOS Safari swallow the selection
  // (picking a Note appeared to do nothing). Let the event finish first.
  setTimeout(()=>_drRenderTaskLinks(_drAutoTargetContainer()),0);
}
function _drRemoveLink(category,id){
  _drLinks[category]=(_drLinks[category]||[]).filter(x=>x!==id);
  _drAutoSaveLinks();
  setTimeout(()=>_drRenderTaskLinks(_drAutoTargetContainer()),0);
}
function _drAutoTargetContainer(){
  // When the Full-Edit drawer is open, drawer-links takes precedence even if
  // the inline editor's note-inline-links is also in the DOM behind it.
  // Otherwise prefer the inline editor's container, falling back to drawer.
  const drawerOpen=document.getElementById('drawer-ov')?.classList.contains('show');
  if(drawerOpen&&document.getElementById('dr-task-links')) return 'dr-task-links';
  return document.getElementById('note-inline-links')?'note-inline-links':'dr-task-links';
}
function _drAutoSaveLinks(){
  // When the inline note editor is the active host, persist link changes to
  // the underlying note immediately — the inline editor has no Save button.
  // Skip auto-save when the Full-Edit drawer is on top: the drawer's own
  // "Save Changes" button is the commit point for that flow.
  if(!_drLinksAutoSaveNoteId)return;
  if(document.getElementById('drawer-ov')?.classList.contains('show'))return;
  const n=(D.notes||[]).find(x=>x.id===_drLinksAutoSaveNoteId);
  if(!n)return;
  n.linkedProjectIds=[...(_drLinks.projects||[])];
  n.linkedGoalIds=[...(_drLinks.goals||[])];
  n.linkedTaskIds=[...(_drLinks.tasks||[])];
  n.linkedNoteIds=[...(_drLinks.notes||[])];
  n.linkedBookmarkIds=[...(_drLinks.bookmarks||[])];
  n.linkedJournalIds=[...(_drLinks.journal||[])];
  n.updated='Just now';
  try{ save('notes'); }catch(e){ console.error('autosave note links failed',e); }
}
function _drRenderTaskLinks(containerId){
  // Renders the chip-based linker into the target element. Defaults to the
  // drawer's `dr-task-links` for backward compat; the inline note editor
  // passes its own id so both linkers can coexist on the same page.
  const wrap=document.getElementById(containerId||'dr-task-links');if(!wrap)return;
  const cats=[
    {key:'projects',label:'Projects',icon:'📁',source:()=>D.projects||[],labelOf:p=>p.name,filter:()=>true},
    {key:'goals',label:'Goals',icon:'🎯',source:()=>D.goals||[],labelOf:g=>(g.icon||'🎯')+' '+g.title,filter:()=>true},
    {key:'tasks',label:_drLinksHostType&&_drLinksHostType!=='task'?'Tasks':'Other Tasks',icon:'📋',source:()=>D.tasks||[],labelOf:t=>t.title,filter:t=>!_drIsHost('task',t)&&t.status!=='Done'},
    {key:'notes',label:'Notes',icon:'📝',source:()=>D.notes||[],labelOf:n=>n.title||'(untitled)',filter:n=>!_drIsHost('note',n)},
    {key:'bookmarks',label:'Bookmarks',icon:'🔖',source:()=>D.bookmarks||[],labelOf:b=>b.title||b.url||'(untitled)',filter:()=>true},
    {key:'journal',label:'Journal Entries',icon:'📔',source:()=>D.journal||[],labelOf:j=>(j.date||'')+' · '+(j.title||'(untitled)'),filter:j=>!_drIsHost('journal',j)},
  ];
  wrap.innerHTML=cats.map(c=>{
    const linkedIds=_drLinks[c.key]||[];
    const all=c.source().filter(c.filter);
    const linkedItems=linkedIds.map(id=>all.find(x=>x.id===id)).filter(Boolean);
    const available=all.filter(x=>!linkedIds.includes(x.id)).slice(0,200);
    const chips=linkedItems.length
      ?linkedItems.map(x=>`<span style="display:inline-flex;align-items:center;gap:4px;background:var(--acs);color:var(--ac);border:1px solid color-mix(in srgb,var(--ac) 35%,var(--bd2));border-radius:12px;padding:2px 4px 2px 8px;font-size:11px;margin:2px 3px 2px 0;max-width:100%"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px">${esc(c.labelOf(x))}</span><span style="cursor:pointer;padding:0 4px;border-radius:8px;line-height:1;font-weight:600" title="Unlink" onclick="_drRemoveLink('${c.key}',${x.id})">✕</span></span>`).join('')
      :`<span style="font-size:11px;color:var(--t3);font-style:italic">None linked</span>`;
    const dropdown=available.length
      ?`<select class="inp" style="height:26px;font-size:11px;padding:0 6px;margin-top:6px;width:100%" onchange="_drAddLink('${c.key}',this.value);this.value=''"><option value="">+ Add ${esc(c.label.toLowerCase())}…</option>${available.map(x=>`<option value="${x.id}">${esc(c.labelOf(x))}</option>`).join('')}</select>`
      :`<div style="font-size:11px;color:var(--t3);margin-top:6px">No more ${esc(c.label.toLowerCase())} to add.</div>`;
    return `<div><label style="font-size:11px;color:var(--t3);font-weight:600;text-transform:uppercase;display:flex;align-items:center;gap:4px">${c.icon} ${esc(c.label)}<span style="margin-left:auto;font-size:11px;color:${linkedItems.length?'var(--ac)':'var(--t3)'}">${linkedItems.length?linkedItems.length+' linked':''}</span></label><div style="margin-top:4px;display:flex;flex-wrap:wrap;align-items:center;min-height:22px">${chips}</div>${dropdown}</div>`;
  }).join('');
}
function saveItem(type,id){
  if(type==='task'){const t=D.tasks.find(x=>x.id===id);if(t){
    t.title=$('#dr-title').value;
    t.titleColor=$('#dr-title-color')?.value||'';
    t.priority=$('#dr-pri').value;
    // Status is applied after the other fields (below), so a repeating
    // task completed from the drawer spawns with its updated rule.
    const _drNewStatus=$('#dr-status').value;
    t.startDate=$('#dr-startdate').value;
    t.endDate=$('#dr-due').value;
    t.due=$('#dr-due').value;
    t.startTime=$('#dr-starttime').value;
    t.endTime=$('#dr-endtime').value;
    const pSel=document.getElementById('dr-proj');
    t.projectId=pSel.value?parseInt(pSel.value):null;
    t.project=pSel.value?D.projects.find(p=>p.id===parseInt(pSel.value))?.name||'':'';
    const cSel=document.getElementById('dr-cluster');
    if(cSel){if(cSel.value)t.clusterId=parseInt(cSel.value);else delete t.clusterId;}
    t.context=$('#dr-ctx').value;
    t.recurring=$('#dr-recurring').value;
    // Mirror the dropdown choice + (optional) advanced fields into the
    // structured recurrenceRule the server-side generator consumes. If the
    // user picks 'None' we clear the rule too. Advanced byDay checkboxes
    // only apply to Weekly / Bi-weekly.
    t.recurrenceRule=_buildRecurrenceRuleFromDrawer();
    t.estimatedMins=parseInt($('#dr-estmins').value)||0;
    t.energy=$('#dr-energy').value;
    const gSel=document.getElementById('dr-goal');
    t.linkedGoalId=gSel.value?parseInt(gSel.value):null;
    // Task Notes: now a contenteditable RTE (dr-notes-rte). Store the rendered
    // HTML on t.notesHtml; mirror plain text into t.notes so existing search /
    // export paths (which read t.notes) keep working. Back-compat: if the old
    // textarea is still around (e.g., a stale render path), fall through.
    {
      const ntRte=document.getElementById('dr-notes-rte');
      const ntTa=document.getElementById('dr-notes');
      if(ntRte){
        t.notesHtml=ntRte.innerHTML;
        t.notes=(ntRte.innerText||'').trim();
      }else if(ntTa){
        t.notes=ntTa.value;
      }
    }
    // Multi-assignee picker → assignees[] + Primary Responsible. Keep
    // t.assignedTo pointed at the Primary's name for back-compat with every
    // view/report/relational mirror that still reads the single assignee.
    if(typeof _maGet==='function'&&document.getElementById('dr-ma-ma')){
      const ma=_maGet('dr-ma');
      t.assignees=ma.assignees; t.assigneeNames=ma.assigneeNames; t.primaryAssigneeId=ma.primaryAssigneeId;
      const pi=ma.assignees.indexOf(ma.primaryAssigneeId);
      t.assignedTo=pi>=0?ma.assigneeNames[pi]:null;
    }
    // Persist linked items from the chip-based picker state (_drLinks).
    // Only writes if the picker host matches this task — avoids overwriting
    // when saving an unrelated drawer that didn't initialize the linker.
    if(_drLinksHostId===id){
      t.linkedProjectIds=[..._drLinks.projects];
      t.linkedGoalIds=[..._drLinks.goals];
      t.linkedTaskIds=[..._drLinks.tasks];
      t.linkedNoteIds=[..._drLinks.notes];
      t.linkedBookmarkIds=[..._drLinks.bookmarks];
      t.linkedJournalIds=[..._drLinks.journal];
    }
    setTaskStatus(t,_drNewStatus,{noSave:true});
    save('tasks');
  }}
  if(type==='note'){const n=D.notes.find(x=>x.id===id);if(n){n.title=$('#dr-title').value;n.icon=document.getElementById('dr-note-icon')?.value||'';n.titleColor=document.getElementById('dr-note-title-color')?.value||'';n.tags=$('#dr-tags').value.split(',').map(s=>s.trim()).filter(Boolean);n.source=$('#dr-source').value;n.body=$('#dr-body').value;const drNoteRte=document.getElementById('dr-note-rte');if(drNoteRte)n.bodyHtml=drNoteRte.innerHTML;
    // Persist linked items from the chip-based picker state (_drLinks),
    // only when the picker host matches this note (mirrors the task save).
    if(_drLinksHostId===id){
      n.linkedProjectIds=[..._drLinks.projects];
      n.linkedGoalIds=[..._drLinks.goals];
      n.linkedTaskIds=[..._drLinks.tasks];
      n.linkedNoteIds=[..._drLinks.notes];
      n.linkedBookmarkIds=[..._drLinks.bookmarks];
      n.linkedJournalIds=[..._drLinks.journal];
    }
    // Folder assignment
    const folderSel=document.getElementById('dr-folder');
    if(folderSel){const fv=parseInt(folderSel.value);if(!isNaN(fv))n.folderId=fv;else delete n.folderId;}
    n.updated='Just now';save('notes')}}
  if(type==='program'){
    const prog=(D.programs||[]).find(x=>x.id===id);
    if(prog){
      prog.name=$('#dr-title').value;
      prog.icon=document.getElementById('dr-prog-icon')?.value||prog.icon||'📊';
      prog.color=$('#dr-color').value;
      prog.status=$('#dr-status').value;
      prog.owner=$('#dr-owner').value;
      prog.description=$('#dr-body').value;
      if(typeof _maGet==='function'&&document.getElementById('dr-prog-ma-ma')){const ma=_maGet('dr-prog-ma');prog.assignees=ma.assignees;prog.assigneeNames=ma.assigneeNames;prog.primaryAssigneeId=ma.primaryAssigneeId;const pi=ma.assignees.indexOf(ma.primaryAssigneeId);prog.assignedTo=pi>=0?ma.assigneeNames[pi]:'';}
      prog.projectIds=Array.from(document.querySelectorAll('.prog-proj-cb:checked')).map(cb=>parseInt(cb.getAttribute('data-prog-pid'),10)).filter(Number.isFinite);
      save('programs');
      closeDrawer();
      if(typeof renderPrograms==='function'&&curScreen==='programs')renderPrograms();
      toast({type:'success',title:'Program saved',duration:1500});
    }
    return;
  }
  if(type==='project'){const p=D.projects.find(x=>x.id===id);if(p){p.name=$('#dr-title').value;p.icon=document.getElementById('dr-proj-icon')?.value||'';p.color=$('#dr-color').value;p.status=$('#dr-status').value;p.due=$('#dr-due').value;const newPct=parseInt($('#dr-pct').value)||0;// Setting pct explicitly via the drawer locks it (pctManual=true). If user wants auto, they can clear via the value 0 + the auto-pct will resume showing computed value on cards.
    if(newPct!==(p.pct||0))p.pctManual=true;
    p.pct=newPct;p.desc=$('#dr-body').value;
    if(typeof _maGet==='function'&&document.getElementById('dr-proj-ma-ma')){const ma=_maGet('dr-proj-ma');p.assignees=ma.assignees;p.assigneeNames=ma.assigneeNames;p.primaryAssigneeId=ma.primaryAssigneeId;const pi=ma.assignees.indexOf(ma.primaryAssigneeId);p.assignedTo=pi>=0?ma.assigneeNames[pi]:'';}
    save('projects')}}
  if(type==='goal'){const g=D.goals.find(x=>x.id===id);if(g){
    g.title=$('#dr-title').value;
    g.icon=$('#dr-icon').value;
    const _pctEl=$('#dr-pct');
    const _newPct=parseInt(_pctEl?.value)||0;
    if(_pctEl&&_pctEl.dataset&&_pctEl.dataset.resetAuto==='1'){
      // User clicked "↺ Reset to auto" — clear the manual lock so the
      // auto-calc takes over on next render.
      delete g.pctManual; g.pct=_newPct;
    } else if(_newPct!==g.pct){
      // User typed a new value — lock as manual so the auto-calc can't
      // immediately overwrite it on the next renderGoals() pass.
      g.pct=_newPct; g.pctManual=true;
    } else {
      g.pct=_newPct;
    }
    g.target=$('#dr-target').value;
    g.category=document.getElementById('dr-category')?.value||'';
    g.startDate=document.getElementById('dr-startdate')?.value||'';
    g.dueDate=document.getElementById('dr-due')?.value||'';
    g.linkedTaskIds=[...document.querySelectorAll('.goal-task-cb:checked')].map(cb=>parseInt(cb.dataset.tid));
    const drGoalRte=document.getElementById('dr-goal-rte');
    if(drGoalRte)g.descriptionHtml=drGoalRte.innerHTML;
    save('goals');
  }}
  if(type==='journal'){const j=D.journal.find(x=>x.id===id);if(j){j.title=$('#dr-title').value;
    // Only when the picker changed, so legacy free-text dates survive a plain save.
    const dEl=document.getElementById('dr-date');
    if(dEl&&dEl.value&&dEl.value!==dEl.dataset.orig)_journalMoveToDate(j,dEl.value);
    if(_drLinksHostId===id&&_drLinksHostType==='journal'){const prev=_journalLinksOf(j);_journalSetLinks(j,_drLinks);_journalSyncBacklinks(j.id,prev,_drLinks);}
    j.updatedAt=new Date().toISOString();
    j.mood=$('#dr-mood').value;j.body=$('#dr-body').value;const drRte=document.getElementById('dr-diary-rte');if(drRte)j.diaryBody=drRte.innerHTML;save('journal')}}
  closeDrawer();toast('Saved!');renderScreen(curScreen);
}
function deleteItem(type,id){
  if(!confirm('Delete this item?'))return;
  if(type==='task')D.tasks=D.tasks.filter(x=>x.id!==id);
  if(type==='note')D.notes=D.notes.filter(x=>x.id!==id);
  if(type==='project')D.projects=D.projects.filter(x=>x.id!==id);
  if(type==='program'){D.programs=(D.programs||[]).filter(x=>x.id!==id);save('programs');closeDrawer();if(curScreen==='programs'&&typeof renderPrograms==='function')renderPrograms();toast({type:'info',title:'Program deleted',duration:1500});return;}
  if(type==='goal')D.goals=D.goals.filter(x=>x.id!==id);
  if(type==='journal')D.journal=D.journal.filter(x=>x.id!==id);
  save(type==='task'?'tasks':type+'s');
  closeDrawer();toast('Deleted');renderScreen(curScreen);
}
function $$(s){return document.querySelector(s)}
function $(s){return document.getElementById?document.getElementById(s.replace('#','')):document.querySelector(s)}
function addSubtask(taskId){
  const inp=document.getElementById('new-subtask');
  const title=(inp?.value||'').trim();
  if(!title){toast('Enter a subtask title');return;}
  const t=D.tasks.find(x=>x.id===taskId);
  if(!t)return;
  if(!t.subtasks)t.subtasks=[];
  t.subtasks.push({id:Date.now(),title,done:false});
  save('tasks');
  // re-render subtask list in drawer without closing
  const list=document.getElementById('subtask-list');
  if(list){
    const subs=t.subtasks;
    list.innerHTML=subs.map((s,si)=>{const descId=`st-desc-${taskId}-${si}`;const hasDesc=!!(s.descHtml&&s.descHtml.trim());return `<div style="border:1px solid var(--bd1);border-radius:6px;margin-bottom:4px;overflow:hidden"><div class="lr" style="padding:4px 6px;background:var(--s2)"><div class="chk ${s.done?'on':''}" onclick="toggleSubtask(${taskId},${si})"></div><span class="rt" style="flex:1;font-size:11px;${s.done?'text-decoration:line-through;color:var(--t3)':''}">${esc(s.title)}</span><button type="button" class="btn btn-s" style="height:18px;font-size:10px;padding:0 5px;margin-left:4px" onclick="(function(){const d=document.getElementById('${descId}');if(d)d.style.display=d.style.display==='none'?'block':'none'})()">${hasDesc?'📝':'+ desc'}</button><span onclick="deleteSubtask(${taskId},${si})" style="cursor:pointer;color:var(--t3);font-size:11px;margin-left:4px">✕</span></div><div id="${descId}" style="display:${hasDesc?'block':'none'};padding:6px;background:var(--s1);border-top:1px solid var(--bd1)"><div id="st-rte-${taskId}-${si}" contenteditable="true" spellcheck="true" style="min-height:40px;max-height:150px;overflow-y:auto;padding:6px;background:var(--s1);border:1px solid var(--bd1);border-radius:4px;font-size:11px;line-height:1.6;color:var(--t1);outline:none" oninput="(function(el){const t=D.tasks.find(x=>x.id===${taskId});if(t&&t.subtasks[${si}])t.subtasks[${si}].descHtml=el.innerHTML;save('tasks');})(this)">${s.descHtml||''}</div></div></div>`;}).join('');
  }
  inp.value='';
  inp.focus();
  toast('Subtask added');
}
function toggleSubtask(taskId,idx){
  const t=D.tasks.find(x=>x.id===taskId);
  if(!t||!t.subtasks[idx])return;
  t.subtasks[idx].done=!t.subtasks[idx].done;
  save('tasks');
  // Update drawer subtask list if open
  const list=document.getElementById('subtask-list');
  if(list){const subs=t.subtasks;list.innerHTML=subs.map((s,si)=>{const descId=`st-desc-${taskId}-${si}`;const hasDesc=!!(s.descHtml&&s.descHtml.trim());return `<div style="border:1px solid var(--bd1);border-radius:6px;margin-bottom:4px;overflow:hidden"><div class="lr" style="padding:4px 6px;background:var(--s2)"><div class="chk ${s.done?'on':''}" onclick="toggleSubtask(${taskId},${si})"></div><span class="rt" style="flex:1;font-size:11px;${s.done?'text-decoration:line-through;color:var(--t3)':''}">${esc(s.title)}</span><button type="button" class="btn btn-s" style="height:18px;font-size:10px;padding:0 5px;margin-left:4px" onclick="(function(){const d=document.getElementById('${descId}');if(d)d.style.display=d.style.display==='none'?'block':'none'})()">${hasDesc?'📝':'+ desc'}</button><span onclick="deleteSubtask(${taskId},${si})" style="cursor:pointer;color:var(--t3);font-size:11px;margin-left:4px">✕</span></div><div id="${descId}" style="display:${hasDesc?'block':'none'};padding:6px;background:var(--s1);border-top:1px solid var(--bd1)"><div id="st-rte-${taskId}-${si}" contenteditable="true" spellcheck="true" style="min-height:40px;max-height:150px;overflow-y:auto;padding:6px;background:var(--s1);border:1px solid var(--bd1);border-radius:4px;font-size:11px;line-height:1.6;color:var(--t1);outline:none" oninput="(function(el){const t=D.tasks.find(x=>x.id===${taskId});if(t&&t.subtasks[${si}])t.subtasks[${si}].descHtml=el.innerHTML;save('tasks');})(this)">${s.descHtml||''}</div></div></div>`;}).join('');}
  // Update exec list if on My Day
  const execList=document.getElementById('md-exec-list');
  if(execList){const activeTab=document.querySelector('#md-e .tab.on');const filter=activeTab?activeTab.textContent.toLowerCase().replace(' priority','').replace(' ',''):'all';execList.innerHTML=renderMdExecList(filter==='highpriority'?'high':filter);}
}
function deleteSubtask(taskId,idx){
  const t=D.tasks.find(x=>x.id===taskId);
  if(!t||!t.subtasks)return;
  t.subtasks.splice(idx,1);
  save('tasks');
  const list=document.getElementById('subtask-list');
  if(list){
    const subs=t.subtasks;
    list.innerHTML=subs.map((s,si)=>{const descId=`st-desc-${taskId}-${si}`;const hasDesc=!!(s.descHtml&&s.descHtml.trim());return `<div style="border:1px solid var(--bd1);border-radius:6px;margin-bottom:4px;overflow:hidden"><div class="lr" style="padding:4px 6px;background:var(--s2)"><div class="chk ${s.done?'on':''}" onclick="toggleSubtask(${taskId},${si})"></div><span class="rt" style="flex:1;font-size:11px;${s.done?'text-decoration:line-through;color:var(--t3)':''}">${esc(s.title)}</span><button type="button" class="btn btn-s" style="height:18px;font-size:10px;padding:0 5px;margin-left:4px" onclick="(function(){const d=document.getElementById('${descId}');if(d)d.style.display=d.style.display==='none'?'block':'none'})()">${hasDesc?'📝':'+ desc'}</button><span onclick="deleteSubtask(${taskId},${si})" style="cursor:pointer;color:var(--t3);font-size:11px;margin-left:4px">✕</span></div><div id="${descId}" style="display:${hasDesc?'block':'none'};padding:6px;background:var(--s1);border-top:1px solid var(--bd1)"><div id="st-rte-${taskId}-${si}" contenteditable="true" spellcheck="true" style="min-height:40px;max-height:150px;overflow-y:auto;padding:6px;background:var(--s1);border:1px solid var(--bd1);border-radius:4px;font-size:11px;line-height:1.6;color:var(--t1);outline:none" oninput="(function(el){const t=D.tasks.find(x=>x.id===${taskId});if(t&&t.subtasks[${si}])t.subtasks[${si}].descHtml=el.innerHTML;save('tasks');})(this)">${s.descHtml||''}</div></div></div>`;}).join('');
  }
}

// ====== MODAL ======
const CAP_TYPES=['Task','Note','Project','Goal','Journal','Idea'];
var capType='Task';
function openModal(type,preType){
  const m=$('modal-content');
  capType=preType||'Task';
  if(type==='capture'){
    m.innerHTML=renderCaptureModal(capType);
  }
  $('modal-capture').classList.add('show');
  document.body.style.overflow='hidden';
  const ti=document.getElementById('cap-title');if(ti)setTimeout(()=>ti.focus(),80);
}
function renderCaptureModal(active){
  const tabs=CAP_TYPES.map(t=>`<div class="tab ${t===active?'on':''}" onclick="capType='${t}';document.getElementById('modal-content').innerHTML=renderCaptureModal('${t}')" style="flex:1;text-align:center;padding:5px;font-size:11px">${t}</div>`).join('');
  const tabBar=`<div style="display:flex;gap:2px;background:var(--s3);border-radius:6px;padding:2px;margin-bottom:12px">${tabs}</div>`;
  const footer=`<div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end"><button class="btn btn-s" onclick="closeModal()">Cancel</button><button class="btn btn-p" onclick="doCapture()">Save ${active}</button></div>`;
  const titleField=`<div class="field"><label>Title</label><input class="inp" placeholder="${active==='Task'?'What needs to be done?':active==='Note'?'Note title...':active==='Project'?'Project name...':active==='Goal'?'Goal title...':'Journal entry title...'}" id="cap-title"></div>`;
  if(active==='Task'){
    return `<h2>${_icon('zap',18,'currentColor')} Quick Capture <button class="close" onclick="closeModal()">✕</button></h2>${tabBar}${titleField}
    <div class="field"><label>Notes</label><textarea class="inp" placeholder="Add details..." id="cap-body"></textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <div class="field"><label>Priority</label><select class="inp" id="cap-pri"><option>Low</option><option selected>Medium</option><option>High</option></select></div>
    <div class="field"><label>Due Date</label><input class="inp" type="date" id="cap-due"></div>
    <div class="field"><label>Project</label><select class="inp" id="cap-proj"><option value="">None</option>${D.projects.map(p=>`<option>${esc(p.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Context</label>${_renderContextSelect('cap-ctx','Inbox')}</div></div>${footer}`;
  }
  if(active==='Note'){
    return `<h2>${_icon('edit',18,'currentColor')} Quick Capture <button class="close" onclick="closeModal()">✕</button></h2>${tabBar}${titleField}
    <div class="field"><label>Content</label><textarea class="inp" style="min-height:100px" placeholder="Write your note..." id="cap-body"></textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <div class="field"><label>Tags (comma separated)</label><input class="inp" placeholder="tag1, tag2" id="cap-tags"></div>
    <div class="field"><label>Source</label><select class="inp" id="cap-source"><option>Manual</option><option>Meeting Notes</option><option>Web Clipper</option><option>Quick Capture</option></select></div></div>${footer}`;
  }
  if(active==='Project'){
    return `<h2>${_icon('folder',18,'currentColor')} Quick Capture <button class="close" onclick="closeModal()">✕</button></h2>${tabBar}${titleField}
    <div class="field"><label>Description</label><textarea class="inp" placeholder="What is this project about?" id="cap-body"></textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
    <div class="field"><label>Due Date</label><input class="inp" type="date" id="cap-due"></div>
    <div class="field"><label>Status</label><select class="inp" id="cap-status"><option>Active</option><option>Not Started</option><option>On Hold</option></select></div>
    <div class="field"><label>Color</label><input type="color" class="inp" id="cap-color" value="#3B82F6" style="height:32px;cursor:pointer"></div></div>${footer}`;
  }
  if(active==='Goal'){
    return `<h2>${_icon('target',18,'currentColor')} Quick Capture <button class="close" onclick="closeModal()">✕</button></h2>${tabBar}${titleField}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <div class="field"><label>Icon</label>${_iconPickBtn('cap-icon','🎯','Pick…')}</div>
    <div class="field"><label>Target description</label><input class="inp" placeholder="e.g. 5 of 12 done" id="cap-target"></div></div>${footer}`;
  }
  if(active==='Journal'){
    return `<h2>✏️ Quick Capture <button class="close" onclick="closeModal()">✕</button></h2>${tabBar}${titleField}
    <div class="field"><label>Content</label>${luRTE_render({id:'cap-body', placeholder:"What's on your mind?", height:'160px'})}</div>
    <div class="field"><label>Mood</label><div style="display:flex;gap:8px;margin-top:4px">${['😊','🙂','😐','😫','😰'].map(mo=>`<span style="font-size:22px;cursor:pointer;padding:3px;border-radius:6px" onclick="this.parentElement.querySelectorAll('span').forEach(s=>s.style.outline='');this.style.outline='2px solid var(--ac)';document.getElementById('cap-mood').value='${mo}'">${mo}</span>`).join('')}</div><input type="hidden" id="cap-mood" value="😊"></div>${footer}`;
  }
  if(active==='Idea'){
    return `<h2>${_icon('lightbulb',18,'currentColor')} Quick Capture <button class="close" onclick="closeModal()">✕</button></h2>${tabBar}${titleField}
    <div class="field"><label>One-line description</label><input class="inp" placeholder="In one sentence…" id="cap-body"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <div class="field"><label>Idea type</label><select class="inp" id="cap-idea-type">${Object.entries(IDEA_TYPE_LABELS).map(([k,v])=>`<option value="${k}">${IDEA_TYPE_ICONS[k]} ${v}</option>`).join('')}</select></div>
    <div class="field"><label>Link to goal</label><select class="inp" id="cap-idea-goal"><option value="">— None —</option>${D.goals.map(g=>`<option value="${g.id}">${g.icon} ${esc(g.title)}</option>`).join('')}</select></div></div>${footer}`;
  }
  return '';
}
function closeModal(){$('modal-capture').classList.remove('show');document.body.style.overflow='';const mc=$('modal-content');if(mc)mc.className='modal';if(typeof _cmpAutosaveTimer!=='undefined'&&_cmpAutosaveTimer){clearInterval(_cmpAutosaveTimer);_cmpAutosaveTimer=null;}}
function doCapture(){
  const title=document.getElementById('cap-title')?.value.trim();if(!title){toast('Title is required');return}
  const now=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'});
  if(capType==='Task'){
    const due=document.getElementById('cap-due')?.value;const dueLabel=due?new Date(due+'T00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'';
    void dueLabel; // tasks keep due as YYYY-MM-DD (a label like "Oct 25" broke every due-date comparison)
    D.tasks.push({id:nextId(D.tasks),title,priority:document.getElementById('cap-pri')?.value||'Medium',due:due||'',context:document.getElementById('cap-ctx')?.value||'Inbox',project:document.getElementById('cap-proj')?.value||'',status:'Not Started',myDay:false,energy:'',notes:document.getElementById('cap-body')?.value||''});
    save('tasks');
    _trpc('activityFeed.log',{action:'task_created',entityType:'task',entityTitle:title},'mutation').catch(()=>{});
  } else if(capType==='Note'){
    const tags=(document.getElementById('cap-tags')?.value||'').split(',').map(s=>s.trim()).filter(Boolean);
    D.notes.push({id:nextId(D.notes),title,tags,source:document.getElementById('cap-source')?.value||'Quick Capture',updated:'Just now',starred:false,body:document.getElementById('cap-body')?.value||''});
    save('notes');
    _trpc('activityFeed.log',{action:'note_created',entityType:'note',entityTitle:title},'mutation').catch(()=>{});
  } else if(capType==='Project'){
    const due=document.getElementById('cap-due')?.value;const dueLabel=due?new Date(due+'T00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'';
    D.projects.push({id:nextId(D.projects),name:title,color:document.getElementById('cap-color')?.value||'#3B82F6',status:document.getElementById('cap-status')?.value||'Active',due:dueLabel||'TBD',pct:0,desc:document.getElementById('cap-body')?.value||''});
    save('projects');
  } else if(capType==='Goal'){
    D.goals.push({id:nextId(D.goals),icon:document.getElementById('cap-icon')?.value||'🎯',title,target:document.getElementById('cap-target')?.value||'',pct:0});
    save('goals');
  } else if(capType==='Journal'){
    const dateStr=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
    const capBodyEl=document.getElementById('cap-body');
    const journalBody=capBodyEl?(capBodyEl.contentEditable==='true'?luRTE_htmlToMd(capBodyEl.innerHTML):capBodyEl.value):'';
    // A real local date + createdAt — the old "Today · Wednesday, October 25"
    // had no year, so next January it read as a future date.
    void dateStr;
    D.journal.push({id:nextId(D.journal),date:_ymd(),title,body:journalBody,mood:document.getElementById('cap-mood')?.value||'😊',createdBy:(D.creds&&D.creds.userName)||'',createdAt:new Date().toISOString()});
    save('journal');
  } else if(capType==='Idea'){
    const idea_type=document.getElementById('cap-idea-type')?.value||'general';
    const goal_id=parseInt(document.getElementById('cap-idea-goal')?.value)||null;
    const desc=document.getElementById('cap-body')?.value||'';
    const idea={id:nextId(D.ideas||[]),title,description:desc,idea_type,stage:'spark',goal_id,ice_impact:5,ice_confidence:5,ice_ease:5,ai_ice_impact:null,ai_ice_confidence:null,ai_ice_ease:null,ai_ice_rationale:null,kill_reason:null,parked_review_date:null,promoted_project_id:null,verdict_outcome:null,spark_at:new Date().toISOString(),develop_at:null,stress_test_at:null,verdict_at:null,answers:[],collaborators:[],comments:[],votes:[],checkIns:[],createdBy:D.creds.userName||'Idris Grant',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    if(!D.ideas)D.ideas=[];
    D.ideas.push(idea);
    save('ideas');
    closeModal();toast('💡 Idea captured! Opening in Ideas…');nav('ideas');setTimeout(()=>openIdeaDetail(idea.id),100);return;
  }
  closeModal();toast('✓ '+capType+' saved: '+title);renderScreen(curScreen);
}

// ====== RENDER SCREENS ======
function setBadge(id,val){
  // Update all instances of this badge across all cloned sidebars
  document.querySelectorAll('#'+id).forEach(el=>{
    if(val&&val>0){el.textContent=val>99?'99+':val;el.style.display='';}
    else{el.textContent='';el.style.display='none';}
  });
}
// ---- Notification sound ----
let _prevUnreadCount=0;
function playNotifChime(){
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    // Two-note ascending chime: C5 then E5
    [[523.25,0],[659.25,0.18]].forEach(([freq,delay])=>{
      const osc=ctx.createOscillator();
      const gain=ctx.createGain();
      osc.connect(gain);gain.connect(ctx.destination);
      osc.type='sine';osc.frequency.value=freq;
      const t=ctx.currentTime+delay;
      gain.gain.setValueAtTime(0,t);
      gain.gain.linearRampToValueAtTime(0.18,t+0.02);
      gain.gain.exponentialRampToValueAtTime(0.001,t+0.55);
      osc.start(t);osc.stop(t+0.55);
    });
  }catch(e){}
}
function updateSidebarBadges(){
  const today=_todayStr;
  // My Day: tasks in My Day not done
  const myDayCount=D.tasks.filter(t=>t.myDay&&t.status!=='Done').length;
  setBadge('badge-myday',myDayCount);
  // Tasks: overdue tasks (not done, due < today)
  const overdueCount=D.tasks.filter(t=>t.status!=='Done'&&t.due&&t.due<today).length;
  setBadge('badge-tasks',overdueCount);
  // Notes: starred notes
  const starredNotes=D.notes.filter(n=>n.starred).length;
  setBadge('badge-notes',starredNotes);
  // Process: GTD Inbox bucket — unprocessed captures to triage (matches the Process header + Inbox tab)
  const inboxCount=D.tasks.filter(_gtdBuckets().Inbox).length;
  setBadge('badge-process',inboxCount);
  // Habits: habits not done today
  const habitsPending=D.habits.filter(h=>!h.doneToday).length;
  setBadge('badge-habits',habitsPending);
  // Coach: sum of overdue + habits pending (actionable items)
  const coachCount=overdueCount+habitsPending;
  setBadge('badge-coach',coachCount>0?coachCount:null);
  // Mail: unread inbox count (real data); falls back to total inbox length if no read flag exists.
  const inbox=(D&&D.mail&&Array.isArray(D.mail.inbox))?D.mail.inbox:[];
  const unreadMail=inbox.filter(m=>m&&m.read!==true&&m.isRead!==true).length;
  setBadge('badge-mail',unreadMail);
  // Update notification badge — only count unread (not yet seen) notifs
  const _allNotifs=buildNotifs();
  const _readIds=getReadNotifIds();
  const unreadCount=_allNotifs.filter(n=>!_readIds.has(n.id)).length;
  const nb=document.getElementById('notif-badge');
  if(nb){
    if(unreadCount>0){nb.textContent=unreadCount>99?'99+':unreadCount;nb.style.display='';}
    else{nb.textContent='';nb.style.display='none';}
  }
  // Play chime when new unread notifications appear
  if(unreadCount>_prevUnreadCount&&D.prefs&&D.prefs.notifications&&D.prefs.notifications.soundAlerts){
    playNotifChime();
  }
  _prevUnreadCount=unreadCount;
}
function renderScreen(s){
  if(s==='home')renderHome();if(s==='tasks')renderTasks();if(s==='notes')renderNotes();
  if(s==='mail')renderMail();if(s==='calendar')renderCal();if(s==='projects')renderProjects();if(s==='programs')renderPrograms();
  if(s==='goals')renderGoals();if(s==='journal')renderJournal();if(s==='archive')renderArchive();if(s==='reports')renderReports();
  if(s==='myday')renderMyDay();if(s==='myweek')renderMyWeek();if(s==='myyear')renderMyYear();
  if(s==='process')renderProcess();if(s==='habits')renderHabits();if(s==='coach')renderCoach();
  if(s==='team')renderTeam();
  if(s==='settings')renderSettings();
  if(s==='ideas')renderIdeas();
  if(s==='mindmaps')renderMindmaps();
  if(s==='focus')renderFocus();
  if(s==='contacts')renderContacts();
  if(s==='bookmarks')renderBookmarks();
  if(s==='clusters')renderClustersDashboard();
  if(s==='graph')renderKnowledgeGraph();
  if(s==='command')renderCommandCenter();
  if(s==='standup')renderStandup();
  if(s==='pipeline')renderPipeline();
  if(s==='atlas')renderAtlas();
  if(s==='money')renderMoney();
  if(s==='help')renderHelp();
  updateSidebarBadges();
  // Apply the user's per-page layout (rails / hidden sections) before paint.
  applyPageLayout(s);
  // Pane resizers need the fresh layout — install after this frame paints.
  setTimeout(initPaneResizers,60);
}

// ─── Resizable panes ─────────────────────────────────────────────────────────
// Drag handles on the column boundaries of every multi-pane screen:
//   • Notes: folders-nav │ list │ (editor) │ links-rail — 3 handles
//   • Every right-rail screen (.bg.wr — Tasks, Mail, Calendar, Home, …): the
//     main │ rail boundary — one shared rail width across all of them.
// Widths persist in D.prefs.paneSizes (server-synced) and re-apply on every
// screen render. Mobile keeps its stacked layouts (the ≤900px CSS overrides
// use !important, which beats these inline widths — and we don't install
// handles there at all). Reuses the pre-existing .notes-resize handle CSS.
function _paneSizes(){D.prefs=D.prefs||{};return D.prefs.paneSizes=D.prefs.paneSizes||{};}
function _applyCurrentPaneSizes(){
  const scr=document.querySelector('.scr.on');if(!scr)return;
  const bg=scr.querySelector(':scope > .bg');if(!bg)return;
  const ps=_paneSizes();
  if(scr.id==='s-notes'){
    bg.style.gridTemplateColumns=`var(--side) ${ps.notesNav||160}px ${ps.notesList||240}px 1fr ${ps.notesRail||200}px`;
  }else if(bg.classList.contains('wr')){
    // Rail hidden by the user's layout → don't reserve its track. (The
    // generated #lu-layout-css also forces this with !important, so the two
    // agree whichever runs last.)
    const railOff=typeof luRailOn==='function'&&!luRailOn(scr.id.replace(/^s-/,''));
    bg.style.gridTemplateColumns=railOff?'var(--side) 1fr':`var(--side) 1fr ${ps.rail||280}px`;
  }
}
function initPaneResizers(){
  const scr=document.querySelector('.scr.on');if(!scr)return;
  const bg=scr.querySelector(':scope > .bg');if(!bg)return;
  bg.querySelectorAll(':scope > .notes-resize').forEach(e=>e.remove());
  if(window.innerWidth<=900)return;
  _applyCurrentPaneSizes();
  const mk=(pane,edge,key,min,max)=>{
    if(!pane)return;
    const r0=pane.getBoundingClientRect();
    if(r0.width<2)return; // pane hidden (grid view / focus mode)
    const h=document.createElement('div');
    h.className='notes-resize';
    h.title='Drag to resize · double-click to reset';
    if(getComputedStyle(bg).position==='static')bg.style.position='relative';
    bg.appendChild(h);
    const pos=()=>{
      const b=pane.getBoundingClientRect(),g=bg.getBoundingClientRect();
      h.style.top=(b.top-g.top)+'px';h.style.height=b.height+'px';
      h.style.left=((edge==='right'?b.right:b.left)-g.left-3)+'px';
    };
    pos();h._pos=pos;
    h.ondblclick=()=>{delete _paneSizes()[key];save('prefs');initPaneResizers();};
    h.onmousedown=(e)=>{
      e.preventDefault();
      const startX=e.clientX,startW=pane.getBoundingClientRect().width;
      h.classList.add('dragging');
      document.body.style.cursor='col-resize';document.body.style.userSelect='none';
      const mv=(ev)=>{
        const dx=ev.clientX-startX;
        const w=Math.max(min,Math.min(max,edge==='right'?startW+dx:startW-dx));
        _paneSizes()[key]=Math.round(w);
        _applyCurrentPaneSizes();
        bg.querySelectorAll(':scope > .notes-resize').forEach(x=>{if(x._pos)x._pos();});
      };
      const up=()=>{
        document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);
        h.classList.remove('dragging');
        document.body.style.cursor='';document.body.style.userSelect='';
        save('prefs');
      };
      document.addEventListener('mousemove',mv);
      document.addEventListener('mouseup',up);
    };
  };
  if(scr.id==='s-notes'){
    if(document.body.classList.contains('notes-mode-sheets')||document.body.classList.contains('notes-mode-slides'))return;
    mk(document.getElementById('notes-nav-panel'),'right','notesNav',110,340);
    mk(document.getElementById('notes-list-panel'),'right','notesList',170,520);
    mk(document.getElementById('notes-rail-panel'),'left','notesRail',140,420);
  }else if(bg.classList.contains('wr')){
    mk(bg.querySelector(':scope > .rr'),'left','rail',180,520);
  }
}
if(typeof window!=='undefined'&&!window._luPaneRzResizeWired){
  window._luPaneRzResizeWired=true;
  let _przT=null;
  window.addEventListener('resize',()=>{clearTimeout(_przT);_przT=setTimeout(initPaneResizers,150);});
}

let _bulkSelected=new Set();
let _bulkMode=false;
function toggleBulkMode(){
  _bulkMode=!_bulkMode;
  _bulkSelected.clear();
  renderCurrentTaskView();
  const bar=$('bulk-action-bar');
  if(bar)bar.style.display=_bulkMode?'flex':'none';
}
function toggleBulkSelect(id,ev){
  ev.stopPropagation();
  if(_bulkSelected.has(id))_bulkSelected.delete(id);
  else _bulkSelected.add(id);
  const bar=$('bulk-action-bar');
  if(bar){const n=_bulkSelected.size;bar.querySelector('#bulk-count').textContent=n+' selected';}
  const row=document.querySelector(`[data-task-id="${id}"]`);
  if(row)row.style.background=_bulkSelected.has(id)?'var(--acs)':'';
}
function bulkAction(action){
  if(!_bulkSelected.size){toast('No tasks selected');return;}
  const ids=[..._bulkSelected];
  if(action==='done'){
    if(!confirm(`Mark ${ids.length} task(s) as Done?`))return;
    const affectedGoalIds=new Set();
    ids.forEach(id=>{
      const t=D.tasks.find(x=>x.id===id);
      if(t){
        t.status='Done';
        _syncTaskCompletedAt(t);
        maybeSpawnRecurring(t);
        D.goals.forEach(g=>{if((g.linkedTaskIds||[]).includes(t.id))affectedGoalIds.add(g.id);});
        if(t.linkedGoalId)affectedGoalIds.add(t.linkedGoalId);
      }
    });
    save('tasks');
    affectedGoalIds.forEach(gid=>{const g=D.goals.find(x=>x.id===gid);if(g)autoCalcGoalPctBidirectional(g);});
    toast(`✓ ${ids.length} task(s) marked Done`);
  } else if(action==='delete'){
    if(!confirm(`Delete ${ids.length} task(s)? This cannot be undone.`))return;
    D.tasks=D.tasks.filter(t=>!ids.includes(t.id));
    save('tasks');toast(`🗑 ${ids.length} task(s) deleted`);
  } else if(action==='project'){
    const pName=prompt('Move to project (enter project name):');
    if(!pName)return;
    const p=D.projects.find(x=>x.name.toLowerCase()===pName.toLowerCase());
    if(!p){toast('Project not found');return;}
    ids.forEach(id=>{const t=D.tasks.find(x=>x.id===id);if(t){t.projectId=p.id;t.project=p.name;}});
    save('tasks');toast(`📁 ${ids.length} task(s) moved to ${p.name}`);
  } else if(action==='cluster'){
    // The picker applies to every bulk-selected task and re-renders itself.
    openTaskClusterPicker(null,window.event);
    return;
  } else if(action==='nifty'){
    // One modal, one project/assignee/status for every selected task.
    openPushToNiftyModal(null);
    return;
  } else if(action==='someday'){
    ids.forEach(id=>{const t=D.tasks.find(x=>x.id===id);if(t)setTaskStatus(t,'Someday',{noSave:true});});
    save('tasks');toast(`💤 ${ids.length} task(s) moved to Someday`);
  }
  _bulkSelected.clear();
  updateSidebarBadges();
  renderCurrentTaskView();
}
// ====== RECURRENCE RULE HELPERS ======
// The drawer keeps the existing "None / Daily / Weekly / Bi-weekly / Monthly /
// Yearly" dropdown that long-term users know, then mirrors the choice into a
// structured `recurrenceRule` JSON object the server-side cron consumes to
// materialize future instances. The "⚙ Advanced" expander lets a user pick
// specific weekdays (for weekly rules), an "until" date, or a max count
// — anything the simple dropdown can't express.
function _parseRecurrenceRule(raw){
  if(!raw)return {};
  try{const r=typeof raw==='string'?JSON.parse(raw):raw;return r&&typeof r==='object'?r:{};}catch{return {};}
}
function _toggleRecurrenceAdvanced(){
  const el=document.getElementById('dr-recurring-adv');
  if(!el)return;
  el.style.display=el.style.display==='none'?'block':'none';
}
function _onRecurringChange(){
  // Reveal byDay row only when relevant.
  const sel=document.getElementById('dr-recurring');
  const byDay=document.getElementById('dr-rec-byday');
  if(!sel||!byDay)return;
  byDay.style.display=(sel.value==='Weekly'||sel.value==='Bi-weekly')?'block':'none';
}
function _buildRecurrenceRuleFromDrawer(){
  const sel=document.getElementById('dr-recurring');
  if(!sel)return null;
  const v=sel.value;
  if(!v||v==='None')return null;
  const freqMap={Daily:'daily',Weekly:'weekly','Bi-weekly':'weekly',Monthly:'monthly',Yearly:'yearly'};
  const freq=freqMap[v];
  if(!freq)return null;
  const intervalEl=document.getElementById('dr-rec-interval');
  let interval=parseInt(intervalEl?intervalEl.value:'',10);
  if(!Number.isFinite(interval)||interval<1)interval=1;
  if(v==='Bi-weekly')interval=Math.max(interval,2);
  const rule={freq,interval};
  if(freq==='weekly'){
    const days=Array.from(document.querySelectorAll('[data-rec-day]')).filter(el=>el.checked).map(el=>Number(el.getAttribute('data-rec-day')));
    if(days.length)rule.byDay=days;
  }
  const untilEl=document.getElementById('dr-rec-until');
  if(untilEl&&untilEl.value)rule.until=untilEl.value;
  const countEl=document.getElementById('dr-rec-count');
  const count=countEl?parseInt(countEl.value,10):NaN;
  if(Number.isFinite(count)&&count>0)rule.count=count;
  return JSON.stringify(rule);
}
// ====== TASK TIME TRACKER ======
// Local-first: t.timeSpent stays as the in-memory counter so the timer feels
// instant and survives offline. The server endpoints (timeEntries.start /
// .stop) fire-and-forget so the time_entries table accrues a real audit log
// that survives device wipes and powers cross-device totals. If the server
// call fails the local counter is still correct.
let _timerTaskId=null,_timerStart=null,_timerInterval=null;
function startTaskTimer(id,event){
  if(event)event.stopPropagation();
  if(_timerTaskId===id){stopTaskTimer();return;}
  if(_timerTaskId)stopTaskTimer();
  _timerTaskId=id;
  _timerStart=Date.now();
  _timerInterval=setInterval(()=>{
    const el=document.getElementById('timer-display-'+id);
    if(el){
      const secs=Math.floor((Date.now()-_timerStart)/1000);
      const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60),s=secs%60;
      el.textContent=(h?h+'h ':'')+m+'m '+s+'s';
    }
  },1000);
  // Update button appearance
  const btn=document.getElementById('timer-btn-'+id);
  if(btn){btn.style.background='var(--red)';btn.style.color='#fff';btn.title='Stop timer';}
  toast('▶ Timer started for task');
  // Fire-and-forget server start. Server-side single-active-timer enforcement
  // means an in-flight previous run gets auto-stopped too — matches the
  // existing local "stop any running timer first" behaviour.
  if(typeof _trpc==='function'){
    _trpc('timeEntries.start',{taskId:String(id),source:'local'},'mutation').catch(()=>{});
  }
}
function stopTaskTimer(){
  if(!_timerTaskId)return;
  const stoppedId=_timerTaskId;
  const elapsed=Math.round((Date.now()-_timerStart)/60000); // minutes
  const t=D.tasks.find(x=>x.id===stoppedId);
  if(t&&elapsed>0){
    t.timeSpent=(t.timeSpent||0)+elapsed;
    save('tasks');
    toast(`⏹ Timer stopped: +${elapsed} min logged (total: ${t.timeSpent} min)`);
  }
  clearInterval(_timerInterval);
  _timerTaskId=null;_timerStart=null;_timerInterval=null;
  renderCurrentTaskView();
  if(typeof _trpc==='function'){
    _trpc('timeEntries.stop',{taskId:String(stoppedId)},'mutation').catch(()=>{});
  }
}
// Drawer "Estimated 90m / Actual 67m" line. Reads from the server
// time_entries table so it survives device wipes. Falls back to the local
// t.timeSpent counter when offline.
async function _hydrateTaskActuals(t){
  const lineEl=document.getElementById('dr-actual-line');
  if(!lineEl)return;
  const fmt=mins=>{
    if(!mins)return '0m';
    const h=Math.floor(mins/60);const m=mins%60;
    return (h?h+'h ':'')+(m?m+'m':(h?'':'0m'));
  };
  const est=t.estimatedMins||0;
  // Local fallback first so something shows immediately.
  if(t.timeSpent){
    lineEl.textContent=`· Actual ${fmt(t.timeSpent)}`;
    lineEl.style.color=est&&t.timeSpent>est?'var(--red)':'var(--ok)';
  }
  try{
    const totals=await _trpc('timeEntries.totalsByTask',{},'query');
    const row=Array.isArray(totals)?totals.find(r=>String(r.taskId)===String(t.id)):null;
    const actualMins=row?Number(row.mins)||0:0;
    if(actualMins){
      const variance=est?Math.round((actualMins-est)/est*100):0;
      const varianceLabel=est?` (${variance>=0?'+':''}${variance}%)`:'';
      lineEl.textContent=`· Actual ${fmt(actualMins)}${varianceLabel}`;
      lineEl.style.color=est&&actualMins>est?'var(--red)':(est?'var(--ok)':'var(--t3)');
    }
  }catch{ /* offline — leave local fallback if any */ }
}

// Recover from a page reload mid-timer: ask the server whether a timer is
// running for the current user and resume the in-page counter from its start.
// Idempotent — safe to call on every boot.
async function _restoreRunningTimer(){
  try{
    const running=await _trpc('timeEntries.running',undefined,'query');
    if(!running)return;
    const numericId=Number(running.taskId);
    if(!Number.isFinite(numericId))return; // external-task timer, no local row to attach to
    if(_timerTaskId)return; // already running locally
    const startMs=_pd(running.startedAt).getTime();
    _timerTaskId=numericId;
    _timerStart=startMs;
    _timerInterval=setInterval(()=>{
      const el=document.getElementById('timer-display-'+numericId);
      if(el){
        const secs=Math.floor((Date.now()-_timerStart)/1000);
        const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60),s=secs%60;
        el.textContent=(h?h+'h ':'')+m+'m '+s+'s';
      }
    },1000);
  }catch{ /* offline / not signed in — fine */ }
}
function taskRow(t,showActs=true){
  const isSomeday=t.status==='Someday';
  const _todayForRow=_ymd((new Date()));
  const isOverdueTask=t.status!=='Done'&&t.due&&t.due<_todayForRow;
  const assigneeLabel=t.assignedTo?`👤 ${t.assignedTo.split(' ')[0]}`:'Delegate';
  const bulkChk=_bulkMode?`<div class="chk ${_bulkSelected.has(t.id)?'on':''}" style="flex-shrink:0;margin-right:2px" onclick="toggleBulkSelect(${_tidLit(t.id)},event)"></div>`:
    `<div class="chk ${t.status==='Done'?'on':''}" onclick="event.stopPropagation();toggleTask(${_tidLit(t.id)})"></div>`;
  // Blocked indicator: task is blocked if any predecessor task is not Done
  const isBlocked=(t.predecessorIds||[]).length>0&&(t.predecessorIds||[]).some(pid=>{
    const pred=D.tasks.find(x=>x.id===pid);
    return pred&&pred.status!=='Done';
  });
  const blockedLabel=isBlocked?`<span style="font-size:11px;color:var(--red);white-space:nowrap;font-weight:600" title="Blocked by incomplete predecessor tasks">🔒 Blocked</span>`:'';
  const isTimerActive=_timerTaskId===t.id;
  const timerBtn=`<button id="timer-btn-${t.id}" class="btn btn-s" style="height:20px;font-size:10px;padding:0 5px;${isTimerActive?'background:var(--red);color:#fff':''}" title="${isTimerActive?'Stop timer':'Start timer'}" onclick="event.stopPropagation();startTaskTimer(${_tidLit(t.id)},event)">${isTimerActive?'⏹':'▶'}</button>`;
  const timeLabel=t.timeSpent?`<span style="font-size:11px;color:var(--t3);white-space:nowrap" title="Time spent">${t.timeSpent}m</span>`:
    (isTimerActive?`<span id="timer-display-${t.id}" style="font-size:11px;color:var(--red);white-space:nowrap;font-variant-numeric:tabular-nums">0m 0s</span>`:'');
  const blockBtn=`<button class="btn btn-s" style="height:20px;font-size:10px;padding:0 5px" title="Block time in Calendar" onclick="event.stopPropagation();blockTaskTime(${_tidLit(t.id)})">📅</button><button class="btn btn-s" style="height:20px;font-size:10px;padding:0 5px" title="${t.clusterId?'In cluster: '+esc(((D.clusters||[]).find(c=>c.id===t.clusterId)||{}).name||'')+' · click to change':'Move to a cluster'}" onclick="event.stopPropagation();openTaskClusterPicker(${_tidLit(t.id)},event)">⬡</button>${t.pushedTo&&t.pushedTo.source==='nifty'?`<a class="btn btn-s" style="height:20px;font-size:10px;padding:0 5px;color:#a78bfa;text-decoration:none" title="Pushed to Nifty${t.pushedTo.projectName?' · '+esc(t.pushedTo.projectName):''} · open" ${t.pushedTo.url?`href="${esc(t.pushedTo.url)}" target="_blank" rel="noopener"`:''} onclick="event.stopPropagation()">↗ Nifty</a>`:''}`;
  const _tcStyle=t.titleColor?`color:${t.titleColor};font-weight:600`:'';
  // K: subtask progress chip
  const _subs=Array.isArray(t.subtasks)?t.subtasks:[];
  const _subDone=_subs.filter(s=>s.done).length;
  const _subChip=_subs.length?`<span class="lu-subtask-chip ${_subDone===_subs.length?'done':''}" title="${_subDone} of ${_subs.length} subtask${_subs.length===1?'':'s'} done">☑ ${_subDone}/${_subs.length}</span>`:'';
  // E: clickable priority + status pills with inline picker
  const priPillClickable=`<span class="pill ${pillClass(t.priority)} lu-pill-clickable" title="Click to change priority" onclick="event.stopPropagation();_taskPillPicker(event,${_tidLit(t.id)},'priority')">${t.priority}</span>`;
  return `<div class="lr ${isOverdueTask?'lr-overdue':''}" data-task-id="${t.id}" style="${_bulkSelected.has(t.id)?'background:var(--acs)':isOverdueTask?'border-left:2px solid var(--red)':isBlocked?'border-left:2px solid var(--red)':''}" onclick="${_bulkMode?`toggleBulkSelect(${_tidLit(t.id)},event)`:`openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))`}">${bulkChk}<span class="rt" style="${_tcStyle}">${esc(t.title)}</span>${_subChip}${isOverdueTask?`<span style="font-size:11px;color:var(--red);white-space:nowrap;font-weight:600">⚠ Overdue</span>`:''} ${blockedLabel}${priPillClickable}<span class="rm" style="${isOverdueTask?'color:var(--red);font-weight:600':''}">${t.due?fmtDate(t.due):''}</span>${t.assignedTo?`<span style="font-size:11px;color:var(--t3);white-space:nowrap">${esc(t.assignedTo.split(' ')[0])}</span>`:''} ${timeLabel}${showActs?`<span class="acts">${timerBtn}<button class="btn btn-s" style="height:20px;font-size:10px;padding:0 5px" title="Snooze…" onclick="event.stopPropagation();_taskSnoozePopover(event,${_tidLit(t.id)})">⏰</button><button class="lr-row-acts-toggle" title="More actions" onclick="event.stopPropagation();_taskRowMoreToggle(event,${_tidLit(t.id)})">⋮</button><div class="lr-row-acts-pop" id="lr-row-acts-${t.id}">${blockBtn ? `<button onclick="event.stopPropagation();_closeAllRowActs();blockTaskTime(${_tidLit(t.id)})">${_icon('calendar',12,'currentColor')} Block time in Calendar</button>`:''}<button onclick="event.stopPropagation();_closeAllRowActs();delegateTask(${_tidLit(t.id)})">📤 Delegate</button><button onclick="event.stopPropagation();_closeAllRowActs();aiSuggestDelegate(${_tidLit(t.id)})">🤖 AI suggest delegate</button>${t.blockedBy?`<button onclick="event.stopPropagation();_closeAllRowActs();aiUnblockTask(${_tidLit(t.id)})">🔓 AI unblock</button>`:''}<button onclick="event.stopPropagation();_closeAllRowActs();moveSomeday(${_tidLit(t.id)})">${isSomeday?'📥 Move to Inbox':'💤 Move to Someday'}</button><button onclick="event.stopPropagation();_closeAllRowActs();openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))">✏ Full edit</button><button onclick="event.stopPropagation();_closeAllRowActs();deleteItem('task',${_tidLit(t.id)})" style="color:var(--red)">✕ Delete</button></div></span>`:''}</div>`;
}
function addTaskComment(taskId){
  const inp=document.getElementById('new-comment');
  if(!inp||!inp.value.trim())return;
  const t=D.tasks.find(x=>x.id===taskId);
  if(!t)return;
  t.comments=t.comments||[];
  const now=new Date();
  const ts=now.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' '+now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  t.comments.push({id:Date.now(),author:D.creds.userName||(D.teams[0]&&D.teams[0].members[0]&&D.teams[0].members[0].name)||'Idris',text:inp.value.trim(),ts});
  save('tasks');
  inp.value='';
  // Re-render comments panel inline
  const panel=document.getElementById('task-comments');
  if(panel)panel.innerHTML=(function(comments){if(!comments||!comments.length)return "<div style='font-size:10px;color:var(--t3);padding:4px 0'>No comments yet.</div>";return comments.map((c,ci)=>{const isOwn=c.author===(D.creds.userName||(D.teams[0]&&D.teams[0].members[0]&&D.teams[0].members[0].name)||'Idris');return `<div style="padding:5px 0;border-bottom:1px solid var(--s3)"><div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--t3);margin-bottom:2px"><span>${esc(c.author||'Idris')}</span><div style="display:flex;gap:4px;align-items:center"><span>${c.ts||''}</span>${isOwn?`<span onclick="editTaskComment(${taskId},${ci})" style="cursor:pointer;color:var(--ac);font-size:11px" title="Edit">✏</span><span onclick="deleteTaskComment(${taskId},${ci})" style="cursor:pointer;color:var(--red);font-size:11px" title="Delete">✕</span>`:''}</div></div><div style="font-size:11px">${esc(c.text)}</div></div>`;}).join('');})(t.comments);
  toast('💬 Comment added');
}
function editTaskComment(taskId,ci){
  const t=D.tasks.find(x=>x.id===taskId);
  if(!t||!t.comments[ci])return;
  const newText=prompt('Edit comment:',t.comments[ci].text);
  if(newText===null)return;
  if(!newText.trim()){toast('Comment cannot be empty');return;}
  t.comments[ci].text=newText.trim();
  t.comments[ci].edited=true;
  save('tasks');
  const panel=document.getElementById('task-comments');
  if(panel){
    const comments=t.comments;
    panel.innerHTML=(function(comments){
      if(!comments||!comments.length)return "<div style='font-size:10px;color:var(--t3);padding:4px 0'>No comments yet.</div>";
      return comments.map((c,ci)=>{
        const isOwn=c.author===(D.creds.userName||(D.teams[0]&&D.teams[0].members[0]&&D.teams[0].members[0].name)||'Idris');
        return `<div style="padding:5px 0;border-bottom:1px solid var(--s3)">`
          +`<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--t3);margin-bottom:2px">`
          +`<span>${esc(c.author||'Idris')}</span>`
          +`<div style="display:flex;gap:4px;align-items:center">`
          +`<span>${c.ts||''}${c.edited?' (edited)':''}</span>`
          +(isOwn?`<span onclick="editTaskComment(${taskId},${ci})" style="cursor:pointer;color:var(--ac);font-size:11px" title="Edit">✏</span>`
          +`<span onclick="deleteTaskComment(${taskId},${ci})" style="cursor:pointer;color:var(--red);font-size:11px" title="Delete">✕</span>`:'')
          +`</div></div>`
          +`<div style="font-size:11px">${esc(c.text)}</div>`
          +`</div>`;
      }).join('');
    })(comments);
  }
  toast('✏ Comment updated');
}
function deleteTaskComment(taskId,ci){
  if(!confirm('Delete this comment?'))return;
  const t=D.tasks.find(x=>x.id===taskId);
  if(!t||!t.comments)return;
  t.comments.splice(ci,1);
  save('tasks');
  const panel=document.getElementById('task-comments');
  if(panel){
    panel.innerHTML=t.comments.length
      ?t.comments.map((c,ci)=>{
        const isOwn=c.author===(D.creds.userName||(D.teams[0]&&D.teams[0].members[0]&&D.teams[0].members[0].name)||'Idris');
        return `<div style="padding:5px 0;border-bottom:1px solid var(--s3)">`
          +`<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--t3);margin-bottom:2px">`
          +`<span>${esc(c.author||'Idris')}</span>`
          +`<div style="display:flex;gap:4px;align-items:center">`
          +`<span>${c.ts||''}</span>`
          +(isOwn?`<span onclick="editTaskComment(${taskId},${ci})" style="cursor:pointer;color:var(--ac);font-size:11px" title="Edit">✏</span>`
          +`<span onclick="deleteTaskComment(${taskId},${ci})" style="cursor:pointer;color:var(--red);font-size:11px" title="Delete">✕</span>`:'')
          +`</div></div>`
          +`<div style="font-size:11px">${esc(c.text)}</div>`
          +`</div>`;
      }).join('')
      :"<div style='font-size:10px;color:var(--t3);padding:4px 0'>No comments yet.</div>";
  }
  toast('🗑 Comment deleted');
}
function delegateTask(id){
  const t=D.tasks.find(x=>x.id===id);
  if(!t)return;
  const members=D.teams.flatMap(tm=>tm.members).filter(m=>m.name!==(D.creds.userName||'Idris Grant'));
  if(!members.length){toast('No other team members to delegate to');return;}
  const opts=members.map((m,i)=>`${i+1}. ${m.name} (${m.role})`).join('\n');
  const choice=prompt(`Delegate "${t.title}" to:\n${opts}\n\nEnter number:`);
  if(!choice)return;
  const idx=parseInt(choice)-1;
  if(isNaN(idx)||idx<0||idx>=members.length){toast('Invalid selection');return;}
  const assignee=members[idx].name;
  t.assignedTo=assignee;
  t.status=t.status==='Not Started'?'Delegated':t.status;
  t.comments=t.comments||[];
  const ts=new Date().toLocaleString();
  t.comments.push({id:Date.now(),author:D.creds.userName||'Idris Grant',ts,text:`Delegated to ${assignee}`,type:'delegation'});
  save('tasks');
  toast(`📤 Task delegated to ${assignee}`);
  renderScreen(curScreen);
}
