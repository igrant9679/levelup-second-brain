// Guard for pasting into a note (build -280).
//
// Pasting from Word used to arrive as plain text: tables, headings, lists and
// emphasis were lost. Notes now keep the structure of what was copied and drop
// the source's look (fonts, colours). This runs the SHIPPED code in headless
// Chrome against clipboard HTML shaped like what Word, Excel, Google Docs and
// web pages really put on the clipboard, then pastes into the real editor.
//
//   pnpm build && node scripts/check-paste.mjs
//
// Needs a local Chrome/Edge (CHROME_PATH to override), like check:screens.
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDist, openBrowser } from './lib/headless.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── fixtures ────────────────────────────────────────────────────────────────
const WORD = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta http-equiv=Content-Type content="text/html; charset=utf-8">
<meta name=ProgId content=Word.Document><meta name=Generator content="Microsoft Word 15">
<style><!-- p.MsoNormal {margin:0in;font-size:11.0pt;font-family:"Calibri",sans-serif;} --></style>
</head><body lang=EN-US style='tab-interval:.5in'><!--StartFragment-->
<p class=MsoTitle>Quarterly Plan<o:p></o:p></p>
<h1>Overview<o:p></o:p></h1>
<p class=MsoNormal><span style='font-size:11.0pt;font-family:"Calibri",sans-serif;color:black'>This is a long
paragraph with <b>bold</b>, <i>italic</i> and <u>underlined</u> words, a
<span style='background:yellow;mso-highlight:yellow'>highlight</span> and a <a href="https://example.com/report">link</a>.<o:p></o:p></span></p>
<p class=MsoNormal><o:p>&nbsp;</o:p></p>
<p class=MsoNormal><o:p>&nbsp;</o:p></p>
<p class=MsoNormal align=center style='text-align:center'><b><span style='color:#C00000'>Centered note</span></b><o:p></o:p></p>
<p class=MsoNormal style='margin-left:.5in'>Indented paragraph<o:p></o:p></p>
<h2>Steps<o:p></o:p></h2>
<p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span
style='font-family:Symbol;mso-fareast-font-family:Symbol'><span style='mso-list:Ignore'>·<span
style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>First bullet<o:p></o:p></p>
<p class=MsoListParagraphCxSpMiddle style='margin-left:1.0in;text-indent:-.25in;mso-list:l0 level2 lfo1'><![if !supportLists]><span
style='font-family:"Courier New"'><span style='mso-list:Ignore'>o<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;
</span></span></span><![endif]>Nested bullet<o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span
style='font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;
</span></span></span><![endif]>Second bullet<o:p></o:p></p>
<p class=MsoNormal>Between the lists<o:p></o:p></p>
<p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l1 level1 lfo2'><![if !supportLists]><span
style='mso-list:Ignore'>1.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]>Step one<o:p></o:p></p>
<p class=MsoListParagraphCxSpMiddle style='text-indent:-.25in;mso-list:l1 level1 lfo2'><![if !supportLists]><span
style='mso-list:Ignore'>2.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]>Step two<o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='text-indent:-.25in;mso-list:l1 level1 lfo2'><![if !supportLists]><span
style='mso-list:Ignore'>3.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]>Step three<o:p></o:p></p>
<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0 style='border-collapse:collapse;border:none;mso-border-alt:solid windowtext .5pt'>
 <tr style='mso-yfti-irow:0;mso-yfti-firstrow:yes'>
  <td width=312 valign=top style='width:233.75pt;border:solid windowtext 1.0pt;background:#D9E2F3;padding:0in 5.4pt 0in 5.4pt'>
  <p class=MsoNormal><b>Name<o:p></o:p></b></p></td>
  <td width=156 valign=top style='width:116.9pt;border:solid windowtext 1.0pt;border-left:none;background:#D9E2F3'>
  <p class=MsoNormal align=right style='text-align:right'><b>Qty<o:p></o:p></b></p></td>
  <td width=156 valign=top style='width:116.9pt;border:solid windowtext 1.0pt;border-left:none;background:#D9E2F3'>
  <p class=MsoNormal><b>Notes<o:p></o:p></b></p></td>
 </tr>
 <tr style='mso-yfti-irow:1'>
  <td width=312 valign=top style='width:233.75pt;border:solid windowtext 1.0pt;border-top:none'>
  <p class=MsoNormal>Widgets<o:p></o:p></p></td>
  <td width=156 valign=top style='width:116.9pt;border-top:none;border-left:none;border-bottom:solid windowtext 1.0pt;border-right:solid windowtext 1.0pt'>
  <p class=MsoNormal align=right style='text-align:right'>12<o:p></o:p></p></td>
  <td width=156 valign=top style='width:116.9pt;border-top:none;border-left:none;border-bottom:solid windowtext 1.0pt;border-right:solid windowtext 1.0pt'>
  <p class=MsoNormal>First line<o:p></o:p></p><p class=MsoNormal>Second line<o:p></o:p></p></td>
 </tr>
 <tr style='mso-yfti-irow:2;mso-yfti-lastrow:yes'>
  <td width=468 colspan=2 valign=top style='width:350.65pt;border:solid windowtext 1.0pt;border-top:none'>
  <p class=MsoNormal>Spans two columns<o:p></o:p></p></td>
  <td width=156 valign=top style='width:116.9pt;border-top:none;border-left:none;border-bottom:solid windowtext 1.0pt;border-right:solid windowtext 1.0pt'>
  <p class=MsoNormal><o:p>&nbsp;</o:p></p></td>
 </tr>
</table>
<p class=MsoNormal><o:p>&nbsp;</o:p></p>
<table class=MsoNormalTable border=0 cellspacing=0 cellpadding=0 style='border-collapse:collapse'>
 <tr><td width=312 valign=top style='width:233.75pt;padding:0in 5.4pt 0in 5.4pt'><p class=MsoNormal>Left column<o:p></o:p></p></td>
  <td width=312 valign=top style='width:233.75pt;padding:0in 5.4pt 0in 5.4pt'><p class=MsoNormal>Right column<o:p></o:p></p></td></tr>
</table>
<span style='font-size:11.0pt'><br clear=all style='mso-special-character:line-break;page-break-before:always'></span>
<p class=MsoNormal>Name:<span style='mso-tab-count:1'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span>Value<o:p></o:p></p>
<p class=MsoNormal><!--[if gte vml 1]><v:shape id="Picture_x0020_1" type="#_x0000_t75" style='width:75pt;height:75pt'>
 <v:imagedata src="file:///C:/Users/x/AppData/Local/Temp/msohtmlclip1/01/clip_image001.png" o:title=""/></v:shape><![endif]--><![if !vml]><img width=100 height=100
src="file:///C:/Users/x/AppData/Local/Temp/msohtmlclip1/01/clip_image002.png" v:shapes="Picture_x0020_1"><![endif]><o:p></o:p></p>
<!--EndFragment--></body></html>`;

const PNG_HEX = '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082';
const WORD_RTF = String.raw`{\rtf1\ansi{\*\shppict{\pict{\*\picprop\shplid1025}\picscalex100\picscaley100\picw26\pich26\picwgoal1500\pichgoal1500\pngblip\bliptag-1234567{\*\blipuid 0123456789abcdef0123456789abcdef}` + PNG_HEX + String.raw`}}{\nonshppict{\pict\picw26\pich26\wmetafile8 010009000003}}}`;

const EXCEL = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta name=ProgId content=Excel.Sheet>
<style><!-- .xl65 {font-weight:700;} --></style></head><body><table border=0 cellpadding=0 cellspacing=0 width=192 style='border-collapse:collapse;width:144pt'>
<!--StartFragment--><col width=64 span=3 style='width:48pt'>
<tr height=20><td height=20 class=xl65 width=64 style='height:15.0pt;width:48pt'>Item</td><td class=xl65 width=64>Jan</td><td class=xl65 width=64>Feb</td></tr>
<tr height=20><td height=20>Rent</td><td align=right>1200</td><td align=right>1200</td></tr>
<!--EndFragment--></table></body></html>`;

const GDOCS = `<meta charset='utf-8'><b style="font-weight:normal;" id="docs-internal-guid-1b2c3d4e-7fff-aaaa-bbbb-cccccccccccc"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;font-weight:700;white-space:pre-wrap;">Bold start</span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;font-weight:400;font-style:italic;white-space:pre-wrap;"> then italic</span></p><ul style="margin-top:0;margin-bottom:0;"><li dir="ltr" style="list-style-type:disc;font-size:11pt;"><p dir="ltr" style="line-height:1.38;" role="presentation"><span style="font-size:11pt;color:#000000;">one</span></p></li><li dir="ltr"><p dir="ltr" role="presentation"><span style="text-decoration:line-through;">two</span></p></li></ul></b>`;

const HOSTILE = `<p onclick="alert(1)">para<img src=x onerror="alert(2)"><script>alert(3)</script></p><a href="javascript:alert(4)">bad link</a><iframe src="https://evil.test"></iframe><form><input value="x"></form><b onmouseover="alert(5)">bold</b><a href="https://ok.test/a" onclick="alert(6)" target="_top">good link</a><svg><script>alert(7)</script></svg><style>*{display:none}</style>`;

// ── run ─────────────────────────────────────────────────────────────────────
let failures = 0;
const ok = (cond, label, detail) => {
  if (cond) console.log('PASS  ' + label);
  else { failures++; console.log('FAIL  ' + label + (detail ? '\n        ' + String(detail).slice(0, 700) : '')); }
};

let srv = null, br = null;
try {
  srv = await serveDist(join(ROOT, 'dist', 'public'));
  br = await openBrowser();
  const { send, evaluate, loadApp } = br;
  try { await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch {}
  await loadApp(srv.origin + '/');
  const J = v => JSON.stringify(v);
  // Parse a cleaned result and answer questions about it inside the page.
  const probe = (html, rtf) => evaluate(`(()=>{
    const r=_pasteCleanHtml(${J(html)},${J(rtf || '')});
    const d=luParseInert(r.html);
    const q=s=>d.querySelectorAll(s).length;
    const t=s=>Array.from(d.querySelectorAll(s)).map(e=>e.textContent.replace(/\\s+/g,' ').trim());
    return JSON.stringify({html:r.html,rich:r.rich,onlyImage:r.onlyImage,dropped:r.dropped,images:r.images.length,
      h1:t('h1'),h2:t('h2'),ulTop:q(':scope>ul'),olTop:q(':scope>ol'),nested:q('ul>li>ul>li'),olItems:t('ol>li'),ulItems:t(':scope>ul>li'),
      tables:q('table'),plain:q('table.lu-plain'),ruled:q('table.lu-table:not(.lu-plain)'),th:t('th'),tdCount:q('td'),
      b:q('b'),i:q('i'),u:q('u'),s:q('s'),mark:q('mark'),a:Array.from(d.querySelectorAll('a')).map(a=>a.getAttribute('href')),
      styles:Array.from(d.querySelectorAll('[style]')).map(e=>e.localName+'|'+e.getAttribute('style')),
      imgs:Array.from(d.querySelectorAll('img')).map(i=>(i.getAttribute('src')||'').slice(0,30)),
      colspan:Array.from(d.querySelectorAll('[colspan]')).map(e=>e.getAttribute('colspan')),
      cellHtml:Array.from(d.querySelectorAll('td')).map(e=>e.innerHTML),
      blanks:Array.from(d.children).filter(e=>e.localName==='p'&&!e.textContent.trim()&&!e.querySelector('img')).length,
      text:d.textContent.replace(/\\s+/g,' ')});
  })()`).then(JSON.parse);

  // 1 ── Word
  const w = await probe(WORD, WORD_RTF);
  ok(w.rich, 'Word: recognised as formatted content');
  ok(w.h1.join('|') === 'Quarterly Plan|Overview' && w.h2.join('|') === 'Steps', 'Word: title and headings kept', J([w.h1, w.h2]));
  ok(w.ulItems.length === 2 && /^First bullet/.test(w.ulItems[0]) && w.ulItems[1] === 'Second bullet' && w.nested === 1, 'Word: bullets become a real list, with the nested level', J(w.ulItems) + ' nested ' + w.nested);
  ok(w.olItems.join('|') === 'Step one|Step two|Step three', 'Word: numbered list kept, numbers not typed into the text', J(w.olItems));
  ok(!/[·§]/.test(w.text) && !/\bo Nested/.test(w.text) && !/1\.\s*Step one/.test(w.text), 'Word: no leftover bullet or number characters', w.text);
  ok(w.tables === 2 && w.ruled === 1 && w.plain === 1, 'Word: both tables kept; the borderless one stays unruled', J([w.tables, w.ruled, w.plain]));
  ok(w.th.join('|') === 'Name|Qty|Notes', 'Word: shaded bold first row becomes the header row', J(w.th));
  ok(w.colspan.join() === '2', 'Word: merged cells kept', J(w.colspan));
  ok(w.cellHtml.some(h => h === 'First line<br>Second line'), 'Word: two paragraphs in a cell become two lines', J(w.cellHtml));
  ok(w.styles.some(s => /^th\|.*width:50%/.test(s)) && w.styles.filter(s => /width:25%/.test(s)).length === 2, 'Word: column widths kept as shares', J(w.styles));
  ok(w.styles.some(s => s === 'p|text-align:center') && w.styles.some(s => s === 'p|margin-left:2em') && w.styles.some(s => /^td\|.*text-align:right/.test(s)), 'Word: centring, indent and right-aligned cells kept', J(w.styles));
  ok(w.b >= 2 && w.i === 1 && w.u === 1 && w.mark === 1 && w.a.join() === 'https://example.com/report', 'Word: bold, italic, underline, highlight and link kept', J([w.b, w.i, w.u, w.mark, w.a]));
  ok(!/font-family|font-size|mso-|class="?Mso|windowtext|<o:p/i.test(w.html), "Word: fonts, sizes and Word's own markup dropped", (w.html.match(/.{0,40}(font-family|font-size|mso-|Mso|windowtext|<o:p).{0,40}/i) || [])[0]);
  ok(/<span class="lu-tc" style="color:#c00000;--tc:#c00000">Centered note<\/span>/.test(w.html) && !/--tc:#000000/.test(w.html), 'Word: a text colour is kept; plain black text follows the theme', (w.html.match(/.{0,80}Centered note.{0,20}/) || [])[0]);
  ok(w.styles.filter(x => /^th\|.*background-color:#d9e2f3;color:#000/.test(x)).length === 3 && (w.html.match(/<th class="lu-fill"/g) || []).length === 3, 'Word: cell shading is kept, with text that reads on it', J(w.styles.filter(x => /^th/.test(x))));
  ok(/This is a long paragraph with bold, italic and underlined words/.test(w.text), 'Word: a paragraph broken across source lines reads as one', w.text.slice(0, 200));
  ok(w.blanks === 2, 'Word: two blank paragraphs in a row collapse to one (3 in the source, 2 kept)', w.blanks + ' blank paragraphs');
  ok(w.images === 1 && w.dropped === 0 && w.imgs.length === 1 && /^data:image\/png;base64,iVBOR/.test(w.imgs[0]), "Word: the picture is read from the clipboard's RTF copy", J([w.images, w.dropped, w.imgs]));
  const wNoRtf = await probe(WORD, '');
  ok(wNoRtf.images === 0 && wNoRtf.dropped === 1 && wNoRtf.imgs.length === 0 && wNoRtf.tables === 2, 'Word: without the RTF copy the picture is left out and counted, the rest is kept', J([wNoRtf.images, wNoRtf.dropped, wNoRtf.imgs]));

  const hi = await probe(`<p class=MsoNormal>a <span style='background:lime;mso-highlight:lime'>green</span> b <span style='color:white;background:navy;mso-highlight:navy'>navy</span> c <span style='background:yellow;mso-highlight:yellow'>yellow</span> d <span style='background:#FFE599;mso-shading:white'>shaded</span><o:p></o:p></p>`);
  ok(hi.mark === 4 && /<mark style="background-color:#00ff00;color:#000">green<\/mark>/.test(hi.html) && /<mark style="background-color:#000080;color:#fff">navy<\/mark>/.test(hi.html) && /<mark>yellow<\/mark>/.test(hi.html) && /<mark style="background-color:#ffe599;color:#000">shaded<\/mark>/.test(hi.html),
    'Word: highlighter colours are kept, each with text that stays readable on it', hi.html);

  const col = await probe(`<html xmlns:w="urn:schemas-microsoft-com:office:word"><body>
<p class=MsoNormal><span style='color:red'>red words</span> then <span style='color:#000080'>navy words</span> then <span style='color:white'>white words</span> then <span style='color:windowtext'>auto words</span> then <span style='color:#333333'>grey words</span></p>
<p class=MsoNormal style='background:#1F3864'><b><span style='color:white'>Banner line</span></b></p>
<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0>
 <tr><td style='border:solid windowtext 1.0pt;background:#1F3864'><p class=MsoNormal><b><span style='color:white'>Date</span></b></p></td>
     <td style='border:solid windowtext 1.0pt;background:#1F3864'><p class=MsoNormal><b><span style='color:white'>Item</span></b></p></td></tr>
 <tr bgcolor="#F2F2F2"><td style='border:solid windowtext 1.0pt'><p class=MsoNormal>3/12</p></td>
     <td style='border:solid windowtext 1.0pt;background:#FFF2CC'><p class=MsoNormal><span style='color:#C00000'>Late</span></p></td></tr>
 <tr><td style='border:solid windowtext 1.0pt;background:white'><p class=MsoNormal>3/21</p></td>
     <td style='border:solid windowtext 1.0pt'><p class=MsoNormal>On time</p></td></tr>
</table></body></html>`);
  ok(/<span class="lu-tc" style="color:#ff0000;--tc:#ff0000">red words<\/span> then navy words then white words then auto words then grey words/.test(col.html), 'Colours: a real text colour is kept; near-black, dark grey, white and automatic text follow the theme', col.html.slice(0, 260));
  ok(/<p class="lu-fill" style="background-color:#1f3864;color:#fff;padding:2px 8px"><b><span class="lu-tc" style="color:#ffffff;--tc:#ffffff">Banner line<\/span><\/b><\/p>/.test(col.html), 'Colours: a shaded paragraph keeps its fill and its white text', (col.html.match(/<p class="lu-fill".{0,200}/) || [])[0]);
  ok((col.html.match(/<th class="lu-fill" style="background-color:#1f3864;color:#fff;text-align:left">/g) || []).length === 2 && /<span class="lu-tc" style="color:#ffffff;--tc:#ffffff">Date<\/span>/.test(col.html), 'Colours: a dark header row keeps its fill and its white text', (col.html.match(/<tr><th.{0,260}/) || [])[0]);
  ok(/<td class="lu-fill" style="background-color:#f2f2f2;color:#000">3\/12<\/td>/.test(col.html) && /<td class="lu-fill" style="background-color:#fff2cc;color:#000"><span class="lu-tc" style="color:#c00000;--tc:#c00000">Late<\/span><\/td>/.test(col.html), "Colours: a row's shading reaches its cells; a cell's own shading wins", (col.html.match(/<td.{0,330}/) || [])[0]);
  ok(/<td class="lu-fill" style="background-color:#ffffff;color:#000">3\/21<\/td><td class="lu-fill" style="background-color:#ffffff;color:#000">On time<\/td>/.test(col.html), 'Colours: in a table with shaded rows, the white cells stay white', (col.html.match(/.{0,120}3\/21.{0,120}/) || [])[0]);
  ok(!/<td class="lu-fill"/.test(w.html) && w.tdCount > 0, 'Colours: with only the header row shaded, the other cells follow the theme', (w.html.match(/<td.{0,80}/) || [])[0]);

  // 2 ── Excel
  const x = await probe(EXCEL);
  ok(x.rich && x.tables === 1 && x.ruled === 1 && x.tdCount === 6 && /Rent/.test(x.text), 'Excel: cells arrive as a ruled table', J([x.tables, x.ruled, x.tdCount, x.html.slice(0, 200)]));
  ok(x.styles.filter(s => /text-align:right/.test(s)).length === 2, 'Excel: right-aligned numbers stay right-aligned', J(x.styles));

  // 3 ── Google Docs
  const g = await probe(GDOCS);
  ok(g.rich && g.b === 1 && g.i === 1 && g.s === 1 && g.ulTop === 1 && g.ulItems.join('|') === 'one|two', 'Google Docs: bold / italic / strike from styles, the list, and no bold wrapper around everything', g.html);

  // 4 ── plain sentence, single paragraph
  const p1 = await probe(`<span style="color:rgb(32,33,36);font-family:arial">just a sentence from a page</span>`);
  ok(!p1.rich, 'A plain sentence is still pasted as plain text', p1.html);
  const p2 = await probe(`<p class=MsoNormal>Some <b>bold</b> text<o:p></o:p></p>`);
  ok(p2.rich && p2.html === 'Some <b>bold</b> text', 'One paragraph joins the line it is pasted into', p2.html);

  // 5 ── hostile markup
  const h = await probe(HOSTILE);
  ok(!/onclick|onerror|onmouseover|<script|javascript:|<iframe|<form|<input|<svg|<style|target=/i.test(h.html), 'Hostile markup: no handlers, scripts, frames, forms or javascript: links survive', h.html);
  ok(h.a.join() === 'https://ok.test/a' && /bad link/.test(h.text) && h.b === 1, 'Hostile markup: the text and the safe link are kept', h.html);

  // 6 ── the real editor
  const setup = await evaluate(`(async()=>{
    D.prefs.darkMode=true;applyPrefs();applyTheme();
    nav('notes');
    await new Promise(r=>setTimeout(r,400));
    const n=(D.notes||[])[0]; if(!n) return 'no notes';
    _noteSetHtml(n,'<p>Existing <span style="color:#ff0000">red words</span> stay.</p>');
    showNoteInEditor(n.id);
    await new Promise(r=>setTimeout(r,400));
    return document.getElementById('nie-body')?'ok:'+n.id:'no editor';
  })()`);
  ok(/^ok:/.test(setup), 'The note editor opens', setup);
  const noteId = setup.slice(3);
  const pasteInto = (html, extra = '') => evaluate(`(async()=>{
    const el=document.getElementById('nie-body'); el.focus();
    const r=document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
    const dt=new DataTransfer(); dt.setData('text/html',${J(html)}); dt.setData('text/plain','PLAIN TEXT FALLBACK'); ${extra}
    el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
    await new Promise(r=>setTimeout(r,1600));
    const n=(D.notes||[]).find(x=>String(x.id)===${J(noteId)});
    return JSON.stringify({live:el.innerHTML,saved:n?n.bodyHtml:'',body:n?n.body:''});
  })()`).then(JSON.parse);

  const e1 = await pasteInto(WORD);
  ok(/<table class="lu-table">/.test(e1.live) && /<h1>Quarterly Plan<\/h1>/.test(e1.live) && /<ol>/.test(e1.live), 'Editor: a Word paste shows its table, headings and lists', e1.live.slice(0, 400));
  ok(/<span style="color:\s*(#ff0000|rgb\(255, 0, 0\));?">red words<\/span>/.test(e1.live), "Editor: the note's existing formatting is untouched", e1.live.slice(0, 200));
  ok(!/font-family|font-size|<font/i.test(e1.live.replace(/<span style="color:[^"]*">red words<\/span>/, '')), 'Editor: the browser adds no fonts or sizes of its own to pasted text', (e1.live.match(/.{0,60}(font-family|font-size|<font).{0,60}/i) || [])[0]);
  ok(/class="lu-table"/.test(e1.saved) && /<th[^>]*>Name<\/th>/.test(e1.saved), 'Editor: the note saves itself with the table', e1.saved.slice(0, 300));
  ok(/Name \| Qty \| Notes \|/.test(e1.body) && /Widgets \| 12 \|/.test(e1.body) && /# Quarterly Plan/.test(e1.body), 'Editor: search / AI text reads the table row by row', e1.body.slice(0, 400));
  ok(!/PLAIN TEXT FALLBACK/.test(e1.live), 'Editor: the plain-text copy is not pasted as well');
  ok(/<span class="lu-tc" style="color:\s*(#c00000|rgb\(192, 0, 0\));\s*--tc:\s*#c00000;?">Centered note<\/span>/.test(e1.live) && /lu-tc/.test(e1.saved) && /<th class="lu-fill"/.test(e1.saved), 'Editor: pasted text colour and cell shading survive the insert and the save', (e1.live.match(/.{0,120}Centered note.{0,20}/) || [])[0]);
  const shades = await evaluate(`(async()=>{
    const el=document.getElementById('nie-body');
    const read=()=>{const sp=el.querySelector('span.lu-tc');const th=el.querySelector('th.lu-fill');const b=th.querySelector('b')||th;
      return {text:getComputedStyle(sp).color, thBg:getComputedStyle(th).backgroundColor, thText:getComputedStyle(b).color};};
    await new Promise(r=>setTimeout(r,3200)); const dark=read();
    D.prefs.darkMode=false;applyPrefs();applyTheme(); await new Promise(r=>setTimeout(r,3500)); const light=read();
    D.prefs.darkMode=true;applyPrefs();applyTheme();
    return JSON.stringify({dark,light});
  })()`).then(JSON.parse);
  const lumOf = c => { const m = /(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)/.exec(c.replace(/^[a-z-]+\(\s*(srgb\s+)?/, '')) || [0, 0, 0, 0]; const k = /srgb|oklab/.test(c) ? 255 : 1; return (0.2126 * m[1] * k + 0.7152 * m[2] * k + 0.0722 * m[3] * k) / 255; };
  const darkL = parseFloat((/oklab\(([\d.]+)/.exec(shades.dark.text) || [0, '0'])[1]) || lumOf(shades.dark.text);
  ok(shades.light.text === 'rgb(192, 0, 0)' && shades.dark.text !== 'rgb(192, 0, 0)' && darkL > 0.6, 'Editor: a pasted text colour shows as picked on the light theme and lighter on the dark one', J(shades));
  ok(shades.dark.thBg === 'rgb(217, 226, 243)' && shades.light.thBg === 'rgb(217, 226, 243)' && shades.dark.thText === 'rgb(0, 0, 0)' && shades.light.thText === 'rgb(0, 0, 0)', 'Editor: a shaded cell looks the same on both themes (fill and text)', J(shades));

  const e2 = await pasteInto(`<div style="font-family: Consolas; white-space: pre;"><div><span style="color:#00f">const</span> x = <b>1</b>;</div></div>`, `dt.setData('vscode-editor-data','{"mode":"javascript"}');`);
  ok(/PLAIN TEXT FALLBACK/.test(e2.live), 'Editor: code copied from an editor still pastes as plain text');

  // the New Note box is a note editor too
  const fa = await evaluate(`(async()=>{
    openFA('note'); await new Promise(r=>setTimeout(r,500));
    const el=document.getElementById('fa-note-rte'); if(!el) return JSON.stringify({live:'no editor'});
    el.focus(); const r=document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
    const dt=new DataTransfer(); dt.setData('text/html',${J(WORD)}); dt.setData('text/plain','PLAIN TEXT FALLBACK');
    el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
    await new Promise(r=>setTimeout(r,500));
    const li=el.querySelector('ul>li'), p=el.querySelector('p'), ul=el.querySelector('ul');
    const out={live:el.innerHTML, liLeft:li?li.getBoundingClientRect().left:0, pLeft:p?p.getBoundingClientRect().left:0,
      marker:li?getComputedStyle(li).listStyleType:'', display:li?getComputedStyle(li).display:'', ulPad:ul?getComputedStyle(ul).paddingLeft:''};
    try{closeModal();}catch(_){}
    return JSON.stringify(out);
  })()`).then(JSON.parse);
  ok(/<table class="lu-table">/.test(fa.live) && /<ul>/.test(fa.live) && /<ol>/.test(fa.live) && /<mark>highlight<\/mark>/.test(fa.live) && !/PLAIN TEXT FALLBACK/.test(fa.live), 'New Note box: a Word paste keeps its table, lists and highlight', fa.live.slice(0, 300));
  ok(fa.display === 'list-item' && fa.marker === 'disc' && fa.liLeft > fa.pLeft + 8, 'New Note box: bullets are drawn as real, indented bullets', J([fa.display, fa.marker, fa.liLeft, fa.pLeft, fa.ulPad]));

  const other = await evaluate(`(()=>{const dt=new DataTransfer();dt.setData('text/html',${J(EXCEL)});return _notePasteRich({clipboardData:dt},'some-task-editor');})()`);
  ok(other === false, 'Other editors (tasks, journal) keep pasting plain text');

  const lone = await evaluate(`(()=>{const dt=new DataTransfer();dt.setData('text/html','<img src="https://example.com/a.png">');
    dt.items.add(new File([new Uint8Array([137,80,78,71])],'a.png',{type:'image/png'}));return _notePasteRich({clipboardData:dt},'nie-body');})()`);
  ok(lone === false, 'A lone copied picture still goes through the image upload');
} catch (e) {
  failures++; console.log('FAIL  the check itself broke: ' + (e && e.stack || e));
} finally {
  if (br) await br.close();
  if (srv) srv.close();
}
if (failures) { console.log(`\n${failures} paste problem(s).`); process.exitCode = 1; }
else console.log('\npaste OK');
