function renderSettingsHTML(){
  // Each tab: an _ICON_PATHS name + plain-text label. Rendered icon+label so
  // every Settings tab has an icon (matches the main sidebar's icon-per-item).
  const setNav=[
    {ic:'user',lb:'Profile'},{ic:'settings',lb:'General'},{ic:'palette',lb:'Appearance'},
    {ic:'bell',lb:'Notifications'},{ic:'mail',lb:'Accounts'},{ic:'link',lb:'Integrations'},
    {ic:'sparkles',lb:'AI Features'},{ic:'users',lb:'Teams'},{ic:'edit',lb:'Word Doc Import'},
    {ic:'refresh',lb:'Sync'},{ic:'save',lb:'Backup'},{ic:'lock',lb:'Privacy'},
    {ic:'shield',lb:'Admin'}
  ];
  // Visual section breaks before these indexes (same pattern as the sidebar).
  const setSections={1:'Preferences',4:'Connections',7:'Workspace & Data',12:'Admin'};
  const name=D.creds.userName||'Idris Grant';
  const email=D.creds.email||'idris@levelup.app';
  const initials=name.split(' ').map(w=>w[0]||'').join('').substring(0,2).toUpperCase();
  return `<div class="pg-h"><h1 style="display:inline-flex;align-items:center;gap:8px">${_icon('settings',22,'var(--page-accent)')}Settings</h1><p style="font-size:12px;color:var(--t2)">Configure your LevelUp experience.</p></div>
  <div style="display:grid;grid-template-columns:160px 1fr;gap:16px">
  <div>${setNav.map((n,i)=>{const sl=setSections[i]?`<div class="sl" style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.6px;padding:10px 8px 3px">${setSections[i]}</div>`:'';return `${sl}<div class="si ${i===0?'on':''}" onclick="showSetTab(this,'sp-${i}')" style="margin:0 0 1px;padding:5px 8px;font-size:11px">${_icon(n.ic,15,'currentColor')} ${n.lb}</div>`;}).join('')}</div>
  <div>
  <!-- Profile --><div id="sp-0" class="sp">
  <h3 style="font-size:14px;font-weight:600;margin-bottom:12px">\ud83d\udc64 Profile</h3>
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;padding:12px;background:var(--s2);border-radius:8px">
  <div style="position:relative;flex-shrink:0;cursor:pointer" title="Click to change photo" onclick="uploadUserAvatar()">
    ${D.creds.avatar
      ?`<img src="${D.creds.avatar}" id="prof-av" alt="avatar" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid var(--ac);display:block">`
      :`<div style="width:56px;height:56px;border-radius:50%;background:var(--ac);color:#fff;font-size:20px;font-weight:700;display:flex;align-items:center;justify-content:center" id="prof-av">${initials}</div>`
    }
    <div style="position:absolute;bottom:0;right:0;width:18px;height:18px;background:var(--ac);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;border:2px solid var(--s2)">📷</div>
    ${D.creds.avatar?`<div onclick="event.stopPropagation();removeUserAvatar()" title="Remove photo" style="position:absolute;top:-3px;right:-3px;width:16px;height:16px;background:var(--red);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;cursor:pointer;border:1px solid var(--bg);color:#fff;font-weight:700">×</div>`:''}
  </div>
  <div style="flex:1">
    <div style="font-size:15px;font-weight:600" id="prof-name">${esc(name)}</div>
    <div style="font-size:11px;color:var(--t3)" id="prof-email">${esc(email)}</div>
    <div style="font-size:11px;color:var(--ac);margin-top:2px">Owner</div>
    ${(()=>{
      // Profile completeness: photo(25), bio(25), jobTitle(25), tz(25)
      const fields=[
        {label:'Photo',done:!!D.creds.avatar},
        {label:'Bio',done:!!(D.creds.bio&&D.creds.bio.trim())},
        {label:'Job Title',done:!!(D.creds.jobTitle&&D.creds.jobTitle.trim())},
        {label:'Timezone',done:!!(D.creds.tz&&D.creds.tz.trim())}
      ];
      const pct=Math.round(fields.filter(f=>f.done).length/fields.length*100);
      const color=pct===100?'var(--ok)':pct>=50?'var(--ac)':'var(--warn)';
      const missing=fields.filter(f=>!f.done).map(f=>f.label);
      return `<div style="margin-top:8px">
        <div style="display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--t3);margin-bottom:4px">
          <span>Profile ${pct}% complete</span>
          ${missing.length?`<span style="color:var(--t3)">Add: ${missing.join(', ')}</span>`:"<span style='color:var(--ok)'>&#10003; All done!</span>"}
        </div>
        <div style="height:4px;background:var(--s3);border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:4px;transition:width .4s ease"></div>
        </div>
      </div>`;
    })()}
  </div>
  </div>
  <div class="lr" style="padding:8px 0"><div style="flex:1"><div style="font-size:12px;font-weight:500">Display Name</div><div style="font-size:11px;color:var(--t3)">Shown in sidebar and greetings</div></div><input class="inp" id="prof-name-input" style="max-width:200px" value="${esc(name)}" oninput="D.creds.userName=this.value;updateProfileUI();document.getElementById('prof-name').textContent=this.value;document.getElementById('prof-av').textContent=this.value.split(' ').map(w=>w[0]||'').join('').substring(0,2).toUpperCase();saveAll();clearTimeout(window._nameTimer);window._nameTimer=setTimeout(()=>saveNameToServer(this.value),1200)"></div>
  <div class="lr" style="padding:8px 0;flex-direction:column;align-items:flex-start;gap:6px"><div style="display:flex;align-items:center;justify-content:space-between;width:100%"><div><div style="font-size:12px;font-weight:500">Email Address</div><div style="font-size:11px;color:var(--t3)">Current: <span id="current-email-display">${esc(email)}</span></div></div><button class="btn btn-s" style="font-size:11px;height:28px" onclick="showChangeEmailForm()">Change Email</button></div><div id="change-email-form" style="display:none;width:100%;padding:10px;background:var(--s2);border-radius:6px;border:1px solid var(--brd)"><div style="font-size:11px;font-weight:600;margin-bottom:8px">Change Email Address</div><div style="margin-bottom:6px"><div style="font-size:11px;color:var(--t3);margin-bottom:2px">New Email Address</div><input class="inp" type="email" id="new-email-input" placeholder="new@example.com" style="width:100%;max-width:280px;font-size:12px" autocomplete="email"></div><div style="margin-bottom:8px"><div style="font-size:11px;color:var(--t3);margin-bottom:2px">Current Password (required to confirm)</div><input class="inp" type="password" id="email-change-pw" placeholder="Your current password" style="width:100%;max-width:280px;font-size:12px" autocomplete="current-password"></div><div style="display:flex;gap:6px"><button class="btn btn-p" id="email-change-btn" style="height:28px;font-size:11px" onclick="doChangeEmail()">Update Email</button><button class="btn btn-s" style="height:28px;font-size:11px" onclick="document.getElementById('change-email-form').style.display='none'">Cancel</button></div><div id="email-change-msg" style="font-size:11px;margin-top:6px;min-height:14px"></div></div></div>
  <div class="lr" style="padding:8px 0"><div style="flex:1"><div style="font-size:12px;font-weight:500">Job Title</div></div><input class="inp" style="max-width:200px" placeholder="e.g. Founder & CEO" value="${esc(D.creds.jobTitle||'')}" oninput="D.creds.jobTitle=this.value;saveAll();updateProfileCompleteness()"></div>
  <div class="lr" style="padding:8px 0"><div style="flex:1"><div style="font-size:12px;font-weight:500">Time Zone</div></div><select class="inp" style="max-width:180px" onchange="D.creds.tz=this.value;saveAll();updateProfileCompleteness()"><option value="" ${!D.creds.tz?'selected':''}>— Select —</option><option ${D.creds.tz==='Eastern Time'?'selected':''}>Eastern Time</option><option ${D.creds.tz==='Central'?'selected':''}>Central</option><option ${D.creds.tz==='Pacific'?'selected':''}>Pacific</option><option ${D.creds.tz==='UTC'?'selected':''}>UTC</option></select></div>
  <div class="lr" style="padding:8px 0"><div style="flex:1"><div style="font-size:12px;font-weight:500">Bio / Focus</div><div style="font-size:11px;color:var(--t3)">Shown in Coach insights</div></div><textarea class="inp" style="max-width:280px;height:60px" placeholder="A line about what you're focused on — shown in Coach insights" oninput="D.creds.bio=this.value;saveAll();updateProfileCompleteness()">${esc(D.creds.bio||'')}</textarea></div>
  <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--brd)">
    <div style="font-size:12px;font-weight:600;margin-bottom:10px">🔒 Change Password</div>
    <div style="margin-bottom:8px">
      <div style="font-size:11px;color:var(--t3);margin-bottom:3px">Current Password</div>
      <input class="inp" type="password" id="chpw-current" placeholder="Your current password" autocomplete="current-password" style="width:100%;max-width:280px;font-size:12px">
    </div>
    <div style="margin-bottom:8px">
      <div style="font-size:11px;color:var(--t3);margin-bottom:3px">New Password <span style="font-weight:400">(min 8 characters)</span></div>
      <input class="inp" type="password" id="chpw-new" placeholder="New password" autocomplete="new-password" style="width:100%;max-width:280px;font-size:12px">
    </div>
    <div style="margin-bottom:10px">
      <div style="font-size:11px;color:var(--t3);margin-bottom:3px">Confirm New Password</div>
      <input class="inp" type="password" id="chpw-confirm" placeholder="Repeat new password" autocomplete="new-password" style="width:100%;max-width:280px;font-size:12px">
    </div>
    <button class="btn btn-p" id="chpw-btn" style="height:32px;font-size:12px" onclick="changePassword()">Update Password</button>
    <div id="chpw-msg" style="font-size:11px;margin-top:6px;min-height:14px"></div>
  </div>
  <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--brd)"><div style="font-size:12px;font-weight:600;margin-bottom:8px">Session</div>
  <button class="btn btn-s" style="margin-bottom:8px" onclick="doLogout()">🚪 Sign Out &amp; Switch User</button>
  <div style="font-size:11px;color:var(--t3);margin-bottom:12px">Signs you out and returns to the login screen. Your data is preserved.</div>
  <div style="font-size:12px;font-weight:600;margin-bottom:8px">Danger Zone</div>
  <button class="btn btn-d" onclick="if(confirm('Reset ALL app data to defaults? This cannot be undone.')){localStorage.clear();location.reload()}">🗑 Reset All Data</button></div>
  </div>
  <!-- General --><div id="sp-1" class="sp" style="display:none">
  <h3 style="font-size:14px;font-weight:600;margin-bottom:16px">⚙ General</h3>

  <!-- Workspace Name -->
  <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--brd)">
    <div style="font-size:12px;font-weight:600;margin-bottom:10px">Workspace</div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Workspace Name</div><div style="font-size:11px;color:var(--t3)">Shown in the sidebar header</div></div>
      <input class="inp" id="gen-workspace-name" style="max-width:200px;font-size:12px" value="${esc(D.prefs&&D.prefs.workspaceName||'LevelUp')}" oninput="D.prefs=D.prefs||{};D.prefs.workspaceName=this.value;const wl=document.getElementById('workspace-label');if(wl)wl.textContent=this.value||'LevelUp';saveAll()">
    </div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Default Home Screen</div><div style="font-size:11px;color:var(--t3)">Module shown on launch</div></div>
      <select class="inp" id="gen-home-screen" style="max-width:160px;font-size:12px" onchange="D.prefs=D.prefs||{};D.prefs.homeScreen=this.value;saveAll()">
        ${['Dashboard','Tasks','Calendar','Notes','Habits','Journal','Goals','Contacts'].map(m=>`<option value="${m}" ${(D.prefs&&D.prefs.homeScreen||'Dashboard')===m?'selected':''}>${m}</option>`).join('')}
      </select>
    </div>
  </div>

  <!-- Date & Time -->
  <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--brd)">
    <div style="font-size:12px;font-weight:600;margin-bottom:10px">Date &amp; Time</div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">First Day of Week</div><div style="font-size:11px;color:var(--t3)">Affects Calendar and weekly views</div></div>
      <div style="display:flex;gap:4px">
        <button id="gen-fdow-mon" class="btn ${!(D.prefs&&D.prefs.firstDayOfWeek==='sunday')?'btn-p':''}" style="font-size:11px;padding:3px 10px" onclick="D.prefs=D.prefs||{};D.prefs.firstDayOfWeek='monday';document.getElementById('gen-fdow-mon').className='btn btn-p';document.getElementById('gen-fdow-sun').className='btn';saveAll()">Mon</button>
        <button id="gen-fdow-sun" class="btn ${(D.prefs&&D.prefs.firstDayOfWeek==='sunday')?'btn-p':''}" style="font-size:11px;padding:3px 10px" onclick="D.prefs=D.prefs||{};D.prefs.firstDayOfWeek='sunday';document.getElementById('gen-fdow-sun').className='btn btn-p';document.getElementById('gen-fdow-mon').className='btn';saveAll()">Sun</button>
      </div>
    </div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Date Format</div><div style="font-size:11px;color:var(--t3)">How dates are displayed across the app</div></div>
      <select class="inp" id="gen-date-format" style="max-width:160px;font-size:12px" onchange="D.prefs=D.prefs||{};D.prefs.dateFormat=this.value;saveAll()">
        ${[{v:'MM/DD/YYYY',l:'MM/DD/YYYY'},{v:'DD/MM/YYYY',l:'DD/MM/YYYY'},{v:'YYYY-MM-DD',l:'YYYY-MM-DD'},{v:'D MMM YYYY',l:'D MMM YYYY'}].map(o=>`<option value="${o.v}" ${(D.prefs&&D.prefs.dateFormat||'MM/DD/YYYY')===o.v?'selected':''}>${o.l}</option>`).join('')}
      </select>
    </div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Time Format</div><div style="font-size:11px;color:var(--t3)">12-hour (AM/PM) or 24-hour clock</div></div>
      <div style="display:flex;gap:4px">
        <button id="gen-tf-12" class="btn ${!(D.prefs&&D.prefs.timeFormat==='24h')?'btn-p':''}" style="font-size:11px;padding:3px 10px" onclick="D.prefs=D.prefs||{};D.prefs.timeFormat='12h';document.getElementById('gen-tf-12').className='btn btn-p';document.getElementById('gen-tf-24').className='btn';saveAll()">12h</button>
        <button id="gen-tf-24" class="btn ${(D.prefs&&D.prefs.timeFormat==='24h')?'btn-p':''}" style="font-size:11px;padding:3px 10px" onclick="D.prefs=D.prefs||{};D.prefs.timeFormat='24h';document.getElementById('gen-tf-24').className='btn btn-p';document.getElementById('gen-tf-12').className='btn';saveAll()">24h</button>
      </div>
    </div>
  </div>

  <!-- Working Hours — drives the AI Capacity Check + Smart Scheduler -->
  <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--brd)">
    <div style="font-size:12px;font-weight:600;margin-bottom:4px">⏰ Working Hours</div>
    <div style="font-size:11px;color:var(--t3);margin-bottom:10px">Used by the Capacity check on My Day and the AI Smart Scheduler. Per-day overrides (e.g. shorter Fridays, no weekends) take precedence when set.</div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Default Hours</div><div style="font-size:11px;color:var(--t3)">Applies on any day without a per-day override.</div></div>
      <div style="display:flex;gap:6px;align-items:center;font-size:12px">
        <select class="inp" id="gen-wh-start" style="width:78px;font-size:12px" onchange="_saveWorkingHoursDefault()">
          ${Array.from({length:24},(_,h)=>`<option value="${h}" ${(D.prefs&&D.prefs.workingHours&&D.prefs.workingHours.start)===h||(!(D.prefs&&D.prefs.workingHours&&Number.isFinite(D.prefs.workingHours.start))&&h===9)?'selected':''}>${String(h).padStart(2,'0')}:00</option>`).join('')}
        </select>
        <span style="color:var(--t3)">→</span>
        <select class="inp" id="gen-wh-end" style="width:78px;font-size:12px" onchange="_saveWorkingHoursDefault()">
          ${Array.from({length:24},(_,h)=>{const v=h+1;return `<option value="${v}" ${(D.prefs&&D.prefs.workingHours&&D.prefs.workingHours.end)===v||(!(D.prefs&&D.prefs.workingHours&&Number.isFinite(D.prefs.workingHours.end))&&v===17)?'selected':''}>${String(v).padStart(2,'0')}:00</option>`;}).join('')}
        </select>
      </div>
    </div>
    <div id="gen-wh-dow-block" style="padding:6px 0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div style="font-size:11px;font-weight:500;color:var(--t2)">Per-day overrides</div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-s" style="height:22px;font-size:11px" onclick="_applyWorkingHoursPreset('weekdays-only')" title="Mon–Fri use the default; Sat/Sun are non-working (no capacity)">Weekdays only</button>
          <button class="btn btn-s" style="height:22px;font-size:11px" onclick="_applyWorkingHoursPreset('clear-overrides')" title="Drop every per-day override">Clear</button>
        </div>
      </div>
      <div id="gen-wh-dow" style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px">${_renderDowOverrideGrid()}</div>
    </div>
  </div>

  <!-- Language -->
  <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--brd)">
    <div style="font-size:12px;font-weight:600;margin-bottom:10px">Language &amp; Region</div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Language</div><div style="font-size:11px;color:var(--t3)">UI display language</div></div>
      <select class="inp" id="gen-language" style="max-width:160px;font-size:12px" onchange="D.prefs=D.prefs||{};D.prefs.language=this.value;saveAll()">
        ${[{v:'en',l:'English'},{v:'es',l:'Español'},{v:'fr',l:'Français'},{v:'de',l:'Deutsch'},{v:'pt',l:'Português'}].map(o=>`<option value="${o.v}" ${(D.prefs&&D.prefs.language||'en')===o.v?'selected':''}>${o.l}</option>`).join('')}
      </select>
    </div>
  </div>

  <!-- Behaviour -->
  <div>
    <div style="font-size:12px;font-weight:600;margin-bottom:10px">Behaviour</div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Auto-save</div><div style="font-size:11px;color:var(--t3)">Automatically save changes as you type</div></div>
      <div class="tog ${!(D.prefs&&D.prefs.autoSave===false)?'on':''}" id="tog-autosave" onclick="D.prefs=D.prefs||{};D.prefs.autoSave=!this.classList.contains('on');this.classList.toggle('on');saveAll()"></div>
    </div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Keyboard Shortcuts</div><div style="font-size:11px;color:var(--t3)">Enable global keyboard shortcuts (?, Cmd+K, etc.)</div></div>
      <div class="tog ${!(D.prefs&&D.prefs.keyboardShortcuts===false)?'on':''}" id="tog-kbshortcuts" onclick="D.prefs=D.prefs||{};D.prefs.keyboardShortcuts=!this.classList.contains('on');this.classList.toggle('on');saveAll()"></div>
    </div>
  </div>

  <!-- Replay Intro -->
  <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--brd)">
    <div style="font-size:12px;font-weight:600;margin-bottom:6px">Onboarding Intro</div>
    <p style="font-size:11px;color:var(--t3);margin-bottom:10px">Replay the animated intro splash screen that appeared on your first login.</p>
    <button class="btn" style="font-size:11px;background:var(--s3);border:1px solid var(--bd2)" onclick="localStorage.removeItem('lu_splash_shown_v1');const name=(D.creds&&D.creds.userName||'User').split(' ')[0];showSplashScreen(name);">&#9654; Replay Intro</button>
  </div>
  <!-- Reset to Defaults -->
  <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--brd)">
    <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--warn)">Reset General Settings</div>
    <p style="font-size:11px;color:var(--t3);margin-bottom:10px">Restores all General settings to their defaults. Your tasks, notes, and other app data are not affected.</p>
    <button class="btn btn-d" style="font-size:11px" onclick="if(confirm('Reset all General settings to defaults?')){const keep={darkMode:D.prefs.darkMode,compact:D.prefs.compact,accent:D.prefs.accent,notifications:D.prefs.notifications};D.prefs={...keep,workspaceName:'LevelUp',homeScreen:'Dashboard',firstDayOfWeek:'monday',dateFormat:'MM/DD/YYYY',timeFormat:'12h',language:'en',autoSave:true,keyboardShortcuts:true};saveAll();applyPrefs();renderScreen('settings');toast('\u2699 General settings reset to defaults');}">&#x21BA; Reset to Defaults</button>
  </div>
  </div>
  <!-- Appearance --><div id="sp-2" class="sp" style="display:none">
  <h3 style="font-size:14px;font-weight:600;margin-bottom:4px">🎨 Appearance</h3>
  <p style="font-size:11px;color:var(--t3);margin-bottom:14px">Themes are personal — each team member can customise independently. Changes apply instantly and sync across your devices.</p>

  <!-- Base toggles -->
  <div class="cd" style="padding:10px 14px;margin-bottom:14px">
    <div class="lr" style="padding:8px 0"><div style="flex:1"><div style="font-size:12px;font-weight:500">Dark Mode</div><div style="font-size:11px;color:var(--t3)">Default dark theme (recommended)</div></div><div class="tog ${D.prefs&&D.prefs.darkMode!==false?'on':''}" id="tog-dark" onclick="toggleDarkMode(this)"></div></div>
    <div class="lr" style="padding:8px 0"><div style="flex:1"><div style="font-size:12px;font-weight:500">Density</div><div style="font-size:11px;color:var(--t3)">Sizing for rows, padding, and labels</div></div>${(()=>{const cur=(D.prefs&&D.prefs.density)||(D.prefs&&D.prefs.compact?'compact':'normal');const opts=[{k:'compact',l:'Compact'},{k:'normal',l:'Normal'},{k:'dense',l:'Dense'}];return `<div style="display:flex;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;overflow:hidden">${opts.map(o=>`<button class="btn" style="border-radius:0;height:26px;padding:0 10px;font-size:11px;background:${cur===o.k?'var(--ac)':'transparent'};color:${cur===o.k?'#fff':'var(--t2)'};border:none;cursor:pointer" onclick="setDensity('${o.k}')">${o.l}</button>`).join('')}</div>`;})()}</div>
    <div class="lr" style="padding:8px 0"><div style="flex:1"><div style="font-size:12px;font-weight:500">🌅 Time-aware accent drift</div><div style="font-size:11px;color:var(--t3)">Subtly nudges accent hue across the day — warm at sunrise, cool at dusk</div></div><div class="tog ${D.prefs&&D.prefs.accentDrift?'on':''}" id="tog-accent-drift" onclick="toggleAccentDrift(this)"></div></div>
  </div>

  <!-- Quick presets -->
  <div class="cd" style="padding:12px 14px;margin-bottom:14px">
    <div style="font-size:12px;font-weight:600;margin-bottom:8px">🌌 Quick Presets</div>
    <p style="font-size:11px;color:var(--t3);margin-bottom:10px">Apply a curated theme as a starting point. You can then customise any colour below.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px">
      ${THEME_PRESETS.map(p=>`<button class="btn btn-s" style="height:auto;padding:8px 10px;font-size:11px;display:flex;align-items:center;gap:6px;text-align:left;justify-content:flex-start;border:1px solid ${p.theme.ac?`color-mix(in srgb,${p.theme.ac} 40%,var(--bd2))`:'var(--bd2)'};background:linear-gradient(135deg,${p.theme.bg||'var(--s2)'} 0%,${p.theme.s2||'var(--s3)'} 100%)" onclick="applyThemePreset(${JSON.stringify(p).replace(/"/g,'&quot;')})"><span style="font-size:16px;flex-shrink:0">${p.emoji}</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;color:${p.theme.t1||'var(--t1)'}">${esc(p.name)}</span></button>`).join('')}
    </div>
  </div>

  <!-- Granular colour pickers -->
  <div class="cd" style="padding:12px 14px;margin-bottom:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:12px;font-weight:600">🎨 Custom Colours</div>
      <button class="btn btn-s" style="font-size:11px;height:24px" onclick="resetTheme()">↺ Reset to Defaults</button>
    </div>
    ${(()=>{const eff=_getEffectiveTheme();return THEME_VAR_GROUPS.map(g=>`
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">${esc(g.label)}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px">
          ${g.keys.map(kk=>`<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--s1);border:1px solid var(--bd1);border-radius:6px;cursor:pointer">
            <input type="color" value="${_themeColorAsHex(eff[kk.k])}" style="width:28px;height:24px;border:none;padding:0;background:transparent;cursor:pointer" oninput="setThemeVar('${kk.k}',this.value)">
            <div style="flex:1;min-width:0">
              <div style="font-size:11px;color:var(--t1);font-weight:500">${esc(kk.name)}</div>
              <div style="font-size:11px;color:var(--t3);font-family:ui-monospace,monospace">--${kk.k}</div>
            </div>
          </label>`).join('')}
        </div>
      </div>
    `).join('');})()}
  </div>

  <!-- Page accent (per-route hue) -->
  <details class="cd" style="padding:12px 14px;margin-bottom:14px">
    <summary style="font-size:12px;font-weight:600;cursor:pointer;list-style:none">📄 Per-Page Accent Colours <span style="font-size:11px;color:var(--t3);font-weight:400">— controls each route's banner hue</span></summary>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;margin-top:10px">
      ${(()=>{const cur=Object.assign({},PAGE_ACCENT_DEFAULTS,D.prefs.pageAccents||{});return Object.entries(cur).map(([screen,color])=>`<label style="display:flex;align-items:center;gap:6px;padding:5px 7px;background:var(--s1);border:1px solid var(--bd1);border-radius:6px;cursor:pointer"><input type="color" value="${color}" style="width:24px;height:20px;border:none;padding:0;background:transparent;cursor:pointer" oninput="setPageAccent('${screen}',this.value)"><span style="font-size:11px;color:var(--t1);text-transform:capitalize">${screen}</span></label>`).join('');})()}
    </div>
  </details>

  <!-- Typography -->
  <div class="cd" style="padding:12px 14px;margin-bottom:14px">
    <div style="font-size:12px;font-weight:600;margin-bottom:10px">🔤 Typography</div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Font Family</div><div style="font-size:11px;color:var(--t3)">Applied across the app</div></div>
      <select class="inp" style="max-width:220px;font-size:12px" onchange="D.prefs.themeFontFamily=this.value;save('prefs');applyTheme()">
        ${[['__system','System default'],['"Inter",sans-serif','Inter'],['"Roboto",sans-serif','Roboto'],['"SF Pro",-apple-system,sans-serif','SF Pro / Apple system'],['"Segoe UI",sans-serif','Segoe UI'],['Georgia,serif','Georgia (serif)'],['"Times New Roman",serif','Times New Roman'],['"Courier New",ui-monospace,monospace','Courier (mono)'],['"JetBrains Mono",ui-monospace,monospace','JetBrains Mono'],['"Lora",serif','Lora']].map(([v,l])=>`<option value="${esc(v)}" ${(D.prefs.themeFontFamily||'__system')===v?'selected':''}>${esc(l)}</option>`).join('')}
      </select>
    </div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Display Scale <span style="font-size:10px;color:var(--t3);font-weight:400">Compact ⇄ Spacious</span></div><div style="font-size:11px;color:var(--t3)">${Math.round((Number(D.prefs.themeFontScale)||1)*100)}% — scales the whole interface</div></div>
      <input type="range" min="0.85" max="1.30" step="0.05" value="${Number(D.prefs.themeFontScale)||1}" style="width:180px" oninput="D.prefs.themeFontScale=Number(this.value);save('prefs');applyTheme();this.parentElement.querySelector('div div:last-child').textContent=Math.round(Number(this.value)*100)+'% — scales the whole interface'">
    </div>
  </div>

  <!-- Saved profiles -->
  <div class="cd" style="padding:12px 14px;margin-bottom:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="font-size:12px;font-weight:600">⭐ Saved Profiles</div>
      <button class="btn btn-p" style="font-size:11px;height:24px" onclick="saveThemeAsProfile()">💾 Save Current as Profile</button>
    </div>
    <p style="font-size:11px;color:var(--t3);margin-bottom:8px">Capture the current colours + fonts + page accents as a named profile you can re-apply any time, or schedule by time of day.</p>
    ${(()=>{const profs=D.prefs.themeProfiles||[];if(!profs.length)return '<div style="font-size:11px;color:var(--t3);text-align:center;padding:14px">No saved profiles yet.</div>';
      return `<div style="display:flex;flex-direction:column;gap:6px">${profs.map(p=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--s1);border:1px solid var(--bd1);border-radius:6px">
        <span style="font-size:16px">${esc(p.emoji||'🎨')}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:500">${esc(p.name)}</div>
          <div style="font-size:11px;color:var(--t3)">${Object.keys(p.theme||{}).length} colour overrides · ${Object.keys(p.pageAccents||{}).length} page accents${p.fontFamily&&p.fontFamily!=='__system'?' · custom font':''}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          ${(Object.values(p.theme||{}).slice(0,4)).map(c=>`<span style="width:14px;height:14px;border-radius:50%;background:${esc(c)};border:1px solid var(--bd2)"></span>`).join('')}
        </div>
        <button class="btn btn-p" style="height:24px;font-size:11px" onclick="loadThemeProfile(${p.id})">Apply</button>
        <button class="btn btn-s" style="height:24px;font-size:11px" onclick="renameThemeProfile(${p.id})" title="Rename">✏</button>
        <button class="btn btn-d" style="height:24px;font-size:11px" onclick="deleteThemeProfile(${p.id})" title="Delete">✕</button>
      </div>`).join('')}</div>`;
    })()}
  </div>

  <!-- Scheduled profile changes -->
  <div class="cd" style="padding:12px 14px;margin-bottom:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="font-size:12px;font-weight:600">⏰ Schedule Profiles</div>
      <button class="btn btn-p" style="font-size:11px;height:24px" onclick="addThemeSchedule()">+ Add Rule</button>
    </div>
    <p style="font-size:11px;color:var(--t3);margin-bottom:8px">Auto-switch profiles by time of day. Useful for ramping focus colours in the morning, sunset palette in the evening, etc. Multiple rules: the first matching wins.</p>
    ${(()=>{
      const sched=D.prefs.themeSchedule||[];
      const profs=D.prefs.themeProfiles||[];
      if(!sched.length)return '<div style="font-size:11px;color:var(--t3);text-align:center;padding:14px">No schedule rules yet. Save a profile, then add a rule to auto-apply it.</div>';
      const dayLbl=['S','M','T','W','T','F','S'];
      return `<div style="display:flex;flex-direction:column;gap:8px">${sched.map(s=>`<div style="padding:10px;background:var(--s1);border:1px solid var(--bd1);border-radius:6px;display:grid;grid-template-columns:auto 1fr auto auto auto;gap:8px;align-items:center">
        <div class="tog ${s.enabled?'on':''}" onclick="updateThemeSchedule(${s.id},{enabled:!${!!s.enabled}});renderScreen('settings')" title="Toggle this rule"></div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;min-width:0">
          <span style="font-size:11px;color:var(--t2)">Apply</span>
          <select class="inp" style="height:24px;font-size:11px;max-width:160px" onchange="updateThemeSchedule(${s.id},{profileId:Number(this.value)})">
            ${profs.map(p=>`<option value="${p.id}" ${p.id===s.profileId?'selected':''}>${esc(p.emoji||'🎨')} ${esc(p.name)}</option>`).join('')}
          </select>
          <span style="font-size:11px;color:var(--t2)">from</span>
          <input type="time" class="inp" style="height:24px;font-size:11px;width:90px" value="${esc(s.start||'09:00')}" onchange="updateThemeSchedule(${s.id},{start:this.value})">
          <span style="font-size:11px;color:var(--t2)">to</span>
          <input type="time" class="inp" style="height:24px;font-size:11px;width:90px" value="${esc(s.end||'12:00')}" onchange="updateThemeSchedule(${s.id},{end:this.value})">
        </div>
        <div style="display:flex;gap:2px">
          ${dayLbl.map((d,di)=>{const on=(s.days||[0,1,2,3,4,5,6]).includes(di);return `<span title="${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][di]}" style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;border-radius:4px;cursor:pointer;${on?'background:var(--ac);color:#fff':'background:var(--s3);color:var(--t3)'}" onclick="(function(){const arr=(D.prefs.themeSchedule.find(x=>x.id===${s.id}).days||[]).slice();const i=arr.indexOf(${di});if(i>=0)arr.splice(i,1);else arr.push(${di});updateThemeSchedule(${s.id},{days:arr});renderScreen('settings')})()">${d}</span>`;}).join('')}
        </div>
        <button class="btn btn-d" style="height:22px;font-size:11px" onclick="deleteThemeSchedule(${s.id})">✕</button>
      </div>`).join('')}</div>`;
    })()}
    ${(()=>{const a=_getActiveSchedule();if(!a)return '';const p=(D.prefs.themeProfiles||[]).find(x=>x.id===a.profileId);return `<div style="margin-top:8px;font-size:11px;color:var(--ok);padding:5px 8px;background:rgba(34,197,94,.1);border-radius:6px">▶ Active now: ${esc(p?p.emoji+' '+p.name:'(unknown)')} (${esc(a.start)}–${esc(a.end)})</div>`;})()}
  </div>
  </div>
  <!-- Notifications --><div id="sp-3" class="sp" style="display:none">
  <h3 style="font-size:14px;font-weight:600;margin-bottom:16px">🔔 Notifications</h3>

  <!-- In-App Alerts -->
  <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--brd)">
    <div style="font-size:12px;font-weight:600;margin-bottom:10px">In-App Alerts</div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Daily Digest</div><div style="font-size:11px;color:var(--t3)">Morning summary of tasks, habits, and goals for the day</div></div>
      <div class="tog ${!(D.prefs&&D.prefs.notifications&&D.prefs.notifications.dailyDigest===false)?'on':''}" id="tog-notif-digest" onclick="D.prefs=D.prefs||{};D.prefs.notifications=D.prefs.notifications||{};D.prefs.notifications.dailyDigest=!this.classList.contains('on');this.classList.toggle('on');saveAll();toast(this.classList.contains('on')?'📊 Daily digest on':'📊 Daily digest off')"></div>
    </div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Deadline Reminders</div><div style="font-size:11px;color:var(--t3)">Alert when a task is due today or overdue</div></div>
      <div class="tog ${!(D.prefs&&D.prefs.notifications&&D.prefs.notifications.deadlineReminders===false)?'on':''}" id="tog-notif-deadline" onclick="D.prefs=D.prefs||{};D.prefs.notifications=D.prefs.notifications||{};D.prefs.notifications.deadlineReminders=!this.classList.contains('on');this.classList.toggle('on');saveAll();toast(this.classList.contains('on')?'⏰ Deadline reminders on':'⏰ Deadline reminders off')"></div>
    </div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Habit Streak Alerts</div><div style="font-size:11px;color:var(--t3)">Notify when a streak is at risk or broken</div></div>
      <div class="tog ${!(D.prefs&&D.prefs.notifications&&D.prefs.notifications.habitStreaks===false)?'on':''}" id="tog-notif-habits" onclick="D.prefs=D.prefs||{};D.prefs.notifications=D.prefs.notifications||{};D.prefs.notifications.habitStreaks=!this.classList.contains('on');this.classList.toggle('on');saveAll();toast(this.classList.contains('on')?'🔥 Habit streak alerts on':'🔥 Habit streak alerts off')"></div>
    </div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Goal Milestone Alerts</div><div style="font-size:11px;color:var(--t3)">Celebrate when a goal reaches 25%, 50%, 75%, or 100%</div></div>
      <div class="tog ${!(D.prefs&&D.prefs.notifications&&D.prefs.notifications.goalMilestones===false)?'on':''}" id="tog-notif-goals" onclick="D.prefs=D.prefs||{};D.prefs.notifications=D.prefs.notifications||{};D.prefs.notifications.goalMilestones=!this.classList.contains('on');this.classList.toggle('on');saveAll();toast(this.classList.contains('on')?'🎯 Goal milestone alerts on':'🎯 Goal milestone alerts off')"></div>
    </div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">AI Insight Alerts</div><div style="font-size:11px;color:var(--t3)">Show AI-generated tips and nudges in the notification panel</div></div>
      <div class="tog ${!(D.prefs&&D.prefs.notifications&&D.prefs.notifications.aiInsights===false)?'on':''}" id="tog-notif-ai" onclick="D.prefs=D.prefs||{};D.prefs.notifications=D.prefs.notifications||{};D.prefs.notifications.aiInsights=!this.classList.contains('on');this.classList.toggle('on');saveAll();if(this.classList.contains('on')){if(typeof startAIAssistant==='function')startAIAssistant()}else{if(typeof aiTimer!=='undefined'&&aiTimer){clearInterval(aiTimer);aiTimer=null;}const b=document.getElementById('ai-bubble');if(b)b.innerHTML=''}toast(this.classList.contains('on')?'✨ AI insight alerts on':'✨ AI insight alerts off')"></div>
    </div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Sound Alerts</div><div style="font-size:11px;color:var(--t3)">Play a subtle chime when new notifications arrive</div></div>
      <div class="tog ${D.prefs&&D.prefs.notifications&&D.prefs.notifications.soundAlerts?'on':''}" id="tog-notif-sound" onclick="D.prefs=D.prefs||{};D.prefs.notifications=D.prefs.notifications||{};D.prefs.notifications.soundAlerts=!this.classList.contains('on');this.classList.toggle('on');saveAll();if(this.classList.contains('on'))playNotifChime();toast(this.classList.contains('on')?'🔔 Sound alerts on':'🔕 Sound alerts off')"></div>
    </div>
  </div>

  <!-- Reminder Timing -->
  <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--brd)">
    <div style="font-size:12px;font-weight:600;margin-bottom:10px">Reminder Timing</div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Daily Digest Time</div><div style="font-size:11px;color:var(--t3)">When to show the morning summary</div></div>
      <input type="time" class="inp" style="max-width:120px;font-size:12px" value="${D.prefs&&D.prefs.notifications&&D.prefs.notifications.digestTime||'08:00'}" onchange="D.prefs=D.prefs||{};D.prefs.notifications=D.prefs.notifications||{};D.prefs.notifications.digestTime=this.value;saveAll();toast('⏰ Digest time set to '+this.value)">
    </div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Deadline Advance Notice</div><div style="font-size:11px;color:var(--t3)">How early to warn before a task is due</div></div>
      <select class="inp" style="max-width:160px;font-size:12px" onchange="D.prefs=D.prefs||{};D.prefs.notifications=D.prefs.notifications||{};D.prefs.notifications.deadlineAdvance=this.value;saveAll()">
        ${[{v:'same-day',l:'Same day'},{v:'1-day',l:'1 day before'},{v:'2-days',l:'2 days before'},{v:'3-days',l:'3 days before'}].map(o=>`<option value="${o.v}" ${(D.prefs&&D.prefs.notifications&&D.prefs.notifications.deadlineAdvance||'1-day')===o.v?'selected':''}>${o.l}</option>`).join('')}
      </select>
    </div>
  </div>

  <!-- Daily Morning Digest (server-side) -->
  <div id="daily-digest-panel" style="margin-bottom:16px;padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd)">
    <div style="font-size:12px;font-weight:600;margin-bottom:4px">☀ Daily Morning Digest Email</div>
    <p style="font-size:11px;color:var(--t3);margin-bottom:8px">A single email each morning summarizing today's plate across CommunityForce (Smartsheet), LSI Media (NiftyPM), and your personal LevelUp tasks. Sent only when there's something to surface.</p>
    <div id="daily-digest-body" style="font-size:11px;color:var(--t2)">Loading…</div>
  </div>

  <!-- Weekly Review (server-side) -->
  <div id="weekly-review-panel" style="margin-bottom:16px;padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd)">
    <div style="font-size:12px;font-weight:600;margin-bottom:4px">📊 Weekly Review Email</div>
    <p style="font-size:11px;color:var(--t3);margin-bottom:8px">Late-week recap email: what shipped this past week, what's overdue / carrying over, what's coming next week — across CF + LSI + Personal. Includes an AI-generated reflection (if an AI key is configured).</p>
    <div id="weekly-review-body" style="font-size:11px;color:var(--t2)">Loading…</div>
  </div>

  <!-- Email Notifications -->
  <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--brd)">
    <div style="font-size:12px;font-weight:600;margin-bottom:4px">Email Notifications</div>
    <p style="font-size:11px;color:var(--t3);margin-bottom:10px">Control which system emails LevelUp sends to your account. Changes take effect immediately.</p>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">OAuth Token Expiry Emails</div><div style="font-size:11px;color:var(--t3)">Receive an email when your Microsoft 365 token is about to expire</div></div>
      <div class="tog" id="tog-email-expiry" onclick="toggleEmailNotifPref('optOutExpiryEmails',this)"></div>
    </div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Daily Digest Emails</div><div style="font-size:11px;color:var(--t3)">Receive a daily email summary of your tasks, habits, and goals</div></div>
      <div class="tog on" id="tog-email-digest" onclick="toggleEmailNotifPref('optOutDigestEmails',this)"></div>
    </div>
    <div id="email-notif-prefs-status" style="font-size:11px;color:var(--t3);margin-top:4px"></div>
  </div>

  <!-- Quiet Hours -->
  <div>
    <div style="font-size:12px;font-weight:600;margin-bottom:10px">Quiet Hours</div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Enable Quiet Hours</div><div style="font-size:11px;color:var(--t3)">Suppress all notifications during this window</div></div>
      <div class="tog ${D.prefs&&D.prefs.notifications&&D.prefs.notifications.quietHours?'on':''}" id="tog-quiet-hours" onclick="D.prefs=D.prefs||{};D.prefs.notifications=D.prefs.notifications||{};D.prefs.notifications.quietHours=!this.classList.contains('on');this.classList.toggle('on');saveAll()"></div>
    </div>
    <div class="lr" style="padding:6px 0">
      <div style="flex:1"><div style="font-size:12px;font-weight:500">Quiet Hours Window</div><div style="font-size:11px;color:var(--t3)">Start and end time for quiet hours</div></div>
      <div style="display:flex;align-items:center;gap:6px">
        <select class="inp" style="max-width:90px;font-size:12px" onchange="D.prefs=D.prefs||{};D.prefs.notifications=D.prefs.notifications||{};D.prefs.notifications.quietStart=this.value;saveAll()">
          ${['20:00','21:00','22:00','23:00','00:00'].map(t=>`<option value="${t}" ${(D.prefs&&D.prefs.notifications&&D.prefs.notifications.quietStart||'22:00')===t?'selected':''}>${t}</option>`).join('')}
        </select>
        <span style="font-size:11px;color:var(--t3)">to</span>
        <select class="inp" style="max-width:90px;font-size:12px" onchange="D.prefs=D.prefs||{};D.prefs.notifications=D.prefs.notifications||{};D.prefs.notifications.quietEnd=this.value;saveAll()">
          ${['05:00','06:00','07:00','08:00','09:00'].map(t=>`<option value="${t}" ${(D.prefs&&D.prefs.notifications&&D.prefs.notifications.quietEnd||'07:00')===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
    </div>
  </div>
  </div>
  <!-- Accounts --><div id="sp-4" class="sp" style="display:none"><h3 style="font-size:14px;font-weight:600;margin-bottom:8px">Connected Accounts</h3>
  <p style="font-size:11px;color:var(--t3);margin-bottom:12px">Connect your Microsoft 365 account to enable two-way Calendar, Mail, and Contacts sync. Tokens are stored securely on the server — never in your browser.</p>
  <div id="oauth-ms-card" style="background:var(--s2);border-radius:8px;padding:12px;margin-bottom:10px">
    <div class="lr" style="margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:32px;height:32px;background:#0078d4;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff">M</div>
        <div><div style="font-size:12px;font-weight:600">Microsoft 365</div><div style="font-size:11px;color:var(--t3)">Outlook · Calendar · Contacts</div></div>
      </div>
      <div id="oauth-ms-badge" style="font-size:11px;padding:2px 8px;border-radius:10px;background:var(--s3);color:var(--t3)">Not connected</div>
    </div>
    <div id="oauth-ms-info" style="display:none;font-size:11px;color:var(--t2);margin-bottom:8px"></div>
    <div id="oauth-ms-expiry" style="display:none;font-size:11px;margin-bottom:8px"></div>
    <div id="oauth-ms-expiry-bar-wrap" style="display:none;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
        <span id="oauth-ms-expiry-label" style="font-size:11px;color:var(--t2)"></span>
        <span id="oauth-ms-expiry-days" style="font-size:11px;font-weight:600"></span>
      </div>
      <div style="height:4px;border-radius:2px;background:var(--s3);overflow:hidden">
        <div id="oauth-ms-expiry-bar" style="height:100%;border-radius:2px;transition:width 0.4s ease"></div>
      </div>
    </div>
    <!-- Step indicator (shown when not connected) -->
    <div id="oauth-ms-steps" style="display:flex;gap:4px;align-items:center;margin-bottom:8px;font-size:11px;color:var(--t3)">
      <span id="oauth-ms-step1" style="display:flex;align-items:center;gap:3px"><span style="width:16px;height:16px;border-radius:50%;background:var(--ac);color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center">1</span> Save credentials</span>
      <span style="color:var(--t3)">›</span>
      <span id="oauth-ms-step2" style="display:flex;align-items:center;gap:3px"><span style="width:16px;height:16px;border-radius:50%;background:var(--s3);color:var(--t2);font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center">2</span> Connect</span>
      <span style="color:var(--t3)">›</span>
      <span id="oauth-ms-step3" style="display:flex;align-items:center;gap:3px"><span style="width:16px;height:16px;border-radius:50%;background:var(--s3);color:var(--t2);font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center">3</span> Test</span>
    </div>
    <div id="oauth-ms-guide" style="font-size:11px;color:var(--t3);margin-bottom:8px;display:none">Click <strong>Connect Microsoft 365</strong> to open the Microsoft consent page. You will be redirected back automatically after authorising.</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button id="btn-ms-connect" class="btn" style="font-size:11px;padding:4px 10px" onclick="connectOAuth('microsoft')">🔗 Connect Microsoft 365</button>
      <button id="btn-ms-disconnect" class="btn btn-d" style="font-size:11px;padding:4px 10px;display:none" onclick="disconnectOAuth('microsoft')">✕ Disconnect</button>
      <button id="btn-ms-refresh" class="btn" style="font-size:11px;padding:4px 10px;display:none" onclick="refreshOAuthToken('microsoft')">🔄 Refresh Token</button>
      <button id="btn-ms-test" class="btn btn-s" style="font-size:11px;padding:4px 10px;display:none" onclick="testOAuthConnection('microsoft')">🔌 Test Connection</button>
      <button id="btn-ms-sync-cal" class="btn" style="font-size:11px;padding:4px 10px;display:none" onclick="syncOAuthCalendar('microsoft')">📅 Sync Calendar</button>
      <button id="btn-ms-sync-mail" class="btn" style="font-size:11px;padding:4px 10px;display:none" onclick="syncOAuthMail('microsoft')">✉ Sync Mail</button>
      <button id="btn-ms-sync-contacts" class="btn" style="font-size:11px;padding:4px 10px;display:none" onclick="openContactsImportPicker('microsoft')">👥 Import Contacts</button>
    </div>
  </div>
  <!-- Non-admin notice: secondary email is managed by admin -->
  <div class="admin-hide-only" style="background:var(--s2);border-radius:8px;padding:10px 12px;margin-bottom:10px;border:1px dashed var(--bd2);font-size:11px;color:var(--t2)">
    🔒 Your notification email account is managed by your administrator. Contact them to change it.
  </div>
  <!-- Secondary Email Account (SMTP/IMAP) — admin-only (admin uses this to set their OWN sender) -->
  <div id="smtp-imap-card" class="admin-only" style="background:var(--s2);border-radius:8px;padding:12px;margin-bottom:10px">
    <div class="lr" style="margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:32px;height:32px;background:#6366f1;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff">✉</div>
        <div><div style="font-size:12px;font-weight:600">Secondary Email Account</div><div style="font-size:11px;color:var(--t3)">SMTP/IMAP · Any Email Provider</div></div>
      </div>
      <div id="smtp-imap-badge" style="font-size:11px;padding:2px 8px;border-radius:10px;background:var(--s3);color:var(--t3)">Not configured</div>
    </div>
    <div id="smtp-imap-form" style="display:none;margin-bottom:8px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
        <input id="smtp-email" class="inp" type="email" placeholder="Email address" style="font-size:11px" />
        <input id="smtp-display-name" class="inp" type="text" placeholder="Display name (optional)" style="font-size:11px" />
      </div>
      <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:4px">IMAP Settings</div>
      <div style="display:grid;grid-template-columns:1fr 120px 120px;gap:6px;margin-bottom:6px">
        <input id="smtp-imap-host" class="inp" type="text" placeholder="IMAP Host (e.g., imap.gmail.com)" style="font-size:11px" />
        <input id="smtp-imap-port" class="inp" type="number" placeholder="Port" value="993" style="font-size:11px" />
        <select id="smtp-imap-encryption" class="inp" style="font-size:11px"><option value="ssl">SSL</option><option value="tls">TLS</option><option value="none">None</option></select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
        <input id="smtp-imap-username" class="inp" type="text" placeholder="IMAP Username" style="font-size:11px" />
        <input id="smtp-imap-password" class="inp" type="password" placeholder="IMAP Password" style="font-size:11px" />
      </div>
      <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:4px">SMTP Settings</div>
      <div style="display:grid;grid-template-columns:1fr 120px 120px;gap:6px;margin-bottom:6px">
        <input id="smtp-smtp-host" class="inp" type="text" placeholder="SMTP Host (e.g., smtp.gmail.com)" style="font-size:11px" />
        <input id="smtp-smtp-port" class="inp" type="number" placeholder="Port" value="587" style="font-size:11px" />
        <select id="smtp-smtp-encryption" class="inp" style="font-size:11px"><option value="ssl">SSL</option><option value="tls" selected>TLS</option><option value="none">None</option></select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
        <input id="smtp-smtp-username" class="inp" type="text" placeholder="SMTP Username" style="font-size:11px" />
        <input id="smtp-smtp-password" class="inp" type="password" placeholder="SMTP Password" style="font-size:11px" />
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-p" style="font-size:11px;padding:4px 10px;flex:1" onclick="saveSmtpImapAccount()">💾 Save Account</button>
        <button id="btn-smtp-test" class="btn btn-s" style="font-size:11px;padding:4px 10px" onclick="testSmtpImapConnection()">🔌 Test</button>
      </div>
      <div id="smtp-test-results" style="display:none;margin-top:8px;padding:8px;background:var(--s2);border-radius:6px;border:1px solid var(--brd);font-size:11px">
        <div style="font-weight:600;margin-bottom:6px">Connection Test Results</div>
        <div id="smtp-test-smtp-row" style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span id="smtp-test-smtp-icon" style="font-size:14px">⏳</span>
          <span style="font-weight:500;min-width:40px">SMTP</span>
          <span id="smtp-test-smtp-msg" style="color:var(--t2)">Testing...</span>
          <span id="smtp-test-smtp-latency" style="margin-left:auto;color:var(--t3)"></span>
        </div>
        <div id="smtp-test-imap-row" style="display:flex;align-items:center;gap:6px">
          <span id="smtp-test-imap-icon" style="font-size:14px">⏳</span>
          <span style="font-weight:500;min-width:40px">IMAP</span>
          <span id="smtp-test-imap-msg" style="color:var(--t2)">Testing...</span>
          <span id="smtp-test-imap-latency" style="margin-left:auto;color:var(--t3)"></span>
        </div>
      </div>
    </div>
    <div id="smtp-imap-buttons" style="display:flex;gap:6px;flex-wrap:wrap">
      <button id="btn-smtp-add" class="btn" style="font-size:11px;padding:4px 10px" onclick="showSmtpImapForm()">➕ Add Account</button>
      <button id="btn-smtp-edit" class="btn" style="font-size:11px;padding:4px 10px;display:none" onclick="showSmtpImapForm()">✏️ Edit</button>
      <button id="btn-smtp-delete" class="btn btn-d" style="font-size:11px;padding:4px 10px;display:none" onclick="deleteSmtpImapAccount()">✕ Remove</button>
    </div>
  </div>
  <!-- Admin: shared sender info -->
  <div class="admin-only" style="background:var(--s2);border-radius:8px;padding:10px 12px;margin-bottom:10px;border:1px dashed var(--ac);font-size:11px;color:var(--t2)">
    💡 All system mail — <strong>Team invites, reports, and notifications</strong> — is sent from the secondary email configured above. Once it's saved it's used automatically; the <strong>System Notification Sender</strong> picker below is optional and only needed to override which account sends.
  </div>
  <!-- Per-User Credential Entry -->
  <div id="oauth-user-creds" style="margin-top:12px;padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd)">
    <details>
    <summary style="font-size:12px;font-weight:600;margin-bottom:4px;cursor:pointer">🔑 Advanced: Override with your own OAuth App Credentials</summary>
    <p style="font-size:11px;color:var(--t3);margin:8px 0 10px">Most users can skip this. The app uses global OAuth credentials configured by the owner (Railway env vars <code>MS_CLIENT_ID</code> / <code>MS_CLIENT_SECRET</code> / <code>MS_TENANT_ID</code>). Only fill in your own Azure AD app credentials below if you want to override the global app for your account.</p>
    <div style="margin-bottom:10px">
      <div style="font-size:11px;font-weight:600;color:#0078d4;margin-bottom:6px">Microsoft 365</div>
      <div style="margin-bottom:6px">
        <label style="font-size:11px;color:var(--t2);font-weight:500;display:block;margin-bottom:2px">Application (Client) ID</label>
        <input id="ms-cred-id" class="inp" style="width:100%;font-size:11px" type="text" placeholder="e.g., b7bdcd01-c4e0-4c4c-8e16-606b9457fc6e" />
      </div>
      <div style="margin-bottom:6px">
        <label style="font-size:11px;color:var(--t2);font-weight:500;display:block;margin-bottom:2px">Client Secret (Value)</label>
        <input id="ms-cred-secret" class="inp" style="width:100%;font-size:11px" type="password" placeholder="e.g., 6~q8Q~cZgq6LVyPn-4hkJW0llzPfVqDVQJwxKa5m" />
      </div>
      <div style="display:flex;gap:6px;margin-bottom:4px;flex-wrap:wrap">
        <button class="btn btn-p" style="height:30px;font-size:11px;white-space:nowrap" onclick="saveOAuthCredentials('microsoft')">Save</button>
        <button class="btn btn-s" style="height:30px;font-size:11px;white-space:nowrap" id="btn-ms-verify-creds" onclick="verifyOAuthCredentials('microsoft')" title="Check if these credentials are accepted by Microsoft">🔍 Verify</button>
        <button class="btn btn-d" style="height:30px;font-size:11px" onclick="deleteOAuthCredentials('microsoft')" title="Remove saved credentials">✕ Clear</button>
      </div>
      <div style="margin-bottom:6px">
        <label style="font-size:11px;color:var(--t2);font-weight:500;display:block;margin-bottom:2px">Tenant ID (Optional — single-tenant apps only)</label>
        <input id="ms-cred-tenant" class="inp" style="width:100%;font-size:11px" type="text" placeholder="e.g., 3e6b1e3d-2176-40c3-83fe-9d8183e016c1" />
        <div style="font-size:11px;color:var(--t3);margin-top:2px">Leave blank for multi-tenant. Required if your Azure app is single-tenant. Find in Azure Portal → App registrations → your app → Directory (tenant) ID.</div>
      </div>
      <div style="font-size:11px;color:var(--t3);margin-bottom:4px">Redirect URI to add in Azure Portal → App registrations → your app → Authentication: <code style="background:var(--s3);padding:1px 4px;border-radius:3px;user-select:all" onclick="navigator.clipboard.writeText(window.location.origin+'/api/oauth/microsoft/callback');toast('✓ Copied')"><span id="ms-redirect-uri"></span></code> <button class="btn btn-s" style="height:20px;font-size:10px;padding:0 6px" onclick="navigator.clipboard.writeText(window.location.origin+'/api/oauth/microsoft/callback');toast('✓ Copied')">Copy</button></div>
      <!-- Microsoft Graph Scope Selector -->
      <div style="margin-bottom:6px">
        <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:4px">📋 Permission Scopes <span style="font-weight:400;color:var(--t3)">(select what you need — fewer scopes = less consent friction)</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--t2)">
          <label style="display:flex;align-items:center;gap:3px;cursor:pointer"><input type="checkbox" id="ms-scope-mail" value="Mail.ReadWrite,Mail.Send" checked style="cursor:pointer"> ✉ Mail</label>
          <label style="display:flex;align-items:center;gap:3px;cursor:pointer"><input type="checkbox" id="ms-scope-calendar" value="Calendars.ReadWrite" checked style="cursor:pointer"> 📅 Calendar</label>
          <label style="display:flex;align-items:center;gap:3px;cursor:pointer"><input type="checkbox" id="ms-scope-contacts" value="Contacts.ReadWrite" checked style="cursor:pointer"> 👥 Contacts</label>
        </div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">Changes take effect on the next Connect. Reconnect after changing scopes.</div>
      </div>
      <div id="ms-cred-status" style="font-size:11px;color:var(--t3)"></div>
      <div id="ms-verify-status" style="font-size:11px;margin-top:2px"></div>
      <div id="ms-audit-log" style="margin-top:6px;display:none">
        <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:4px;cursor:pointer" onclick="toggleAuditLog('microsoft')">▶ Recent Activity</div>
        <div id="ms-audit-log-entries" style="display:none;max-height:120px;overflow-y:auto;font-size:11px;color:var(--t3)"></div>
      </div>
    </div>
    </details>

  </div>
  <!-- Notification Sender (owner/admin only) -->
  <div id="notif-sender-section" class="admin-only" style="display:none;margin-top:12px;padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd)">
    <div style="font-size:12px;font-weight:600;margin-bottom:4px">📤 System Notification Sender</div>
    <p style="font-size:11px;color:var(--t3);margin-bottom:8px">Choose which connected account is used to send all system notifications (password reset emails, digest emails, alerts). Only accounts that are currently connected appear here.</p>
    <div style="display:flex;gap:8px;align-items:center">
      <select id="notif-sender-select" class="inp" style="flex:1;font-size:11px">
        <option value="">— Use built-in notification service —</option>
      </select>
      <button class="btn btn-p" style="height:30px;font-size:11px" onclick="saveNotificationSender()">Save</button>
      <button id="btn-test-email" class="btn" style="height:30px;font-size:11px" onclick="testEmailSender()">📧 Test Email</button>
    </div>
    <div id="notif-sender-status" style="font-size:11px;color:var(--t3);margin-top:4px"></div>
    <!-- Email Delivery Log -->
    <div style="margin-top:10px">
      <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:6px">📋 Recent Delivery Log</div>
      <div id="email-delivery-log" style="font-size:11px;color:var(--t3)">Loading…</div>
    </div>
  </div>
  <!-- Data Migration Health (owner/admin only) — Step 3 readiness for retiring
       the user_app_data blob columns. Read-only: shows table-vs-blob counts,
       consistency, and which store served the last load. -->
  <div id="migration-health-section" class="admin-only" style="display:none;margin-top:12px;padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <div style="font-size:12px;font-weight:600">🔬 Data Migration Health</div>
      <button class="btn btn-s" style="height:26px;font-size:11px" onclick="loadMigrationHealth()">↻ Check now</button>
    </div>
    <p style="font-size:11px;color:var(--t3);margin-bottom:8px">Blob → relational migration status for tasks / notes / ideas. All three need <b>consistent ✓</b> and <b>served from: relational</b> over a soak period before the legacy blob columns can be retired (Step 3). Read-only — checking changes nothing.</p>
    <div id="migration-health-body" style="font-size:11px;color:var(--t3)">Click “Check now” to run the readiness checks.</div>
  </div>
  <!-- OAuth Setup Instructions -->
  <div style="margin-top:12px;padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd)">
    <div style="font-size:12px;font-weight:600;margin-bottom:8px">⚙ Setup Required — Microsoft 365 OAuth</div>
    <p style="font-size:11px;color:var(--t3);margin-bottom:10px">To enable the Connect button, register an OAuth app with Microsoft and enter your credentials above. You need a <strong>Client ID</strong> and <strong>Client Secret</strong>.</p>
    <div style="margin-bottom:10px">
      <div style="font-size:11px;font-weight:600;color:#0078d4;margin-bottom:4px">Steps to register your app:</div>
      <ol style="font-size:11px;color:var(--t3);padding-left:16px;margin:0;line-height:1.8">
        <li>Go to <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" style="color:var(--ac)">portal.azure.com → App registrations</a> → New registration</li>
        <li>Set <strong>Redirect URI</strong> to: <code style="background:var(--s3);padding:1px 4px;border-radius:3px;user-select:all">${window.location.origin}/api/oauth/microsoft/callback</code></li>
        <li>Copy the <strong>Application (client) ID</strong> → paste into the field above</li>
        <li>Go to <strong>Certificates &amp; secrets</strong> → <strong>New client secret</strong> → copy the <strong>Value</strong> → paste into the field above</li>
        <li>Optional: If your app is single-tenant, copy the <strong>Directory (tenant) ID</strong> → paste into the Tenant ID field above</li>
      </ol>
    </div>
  </div>
   </div>
  <!-- Integrations --><div id="sp-5" class="sp" style="display:none">
  <h3 style="font-size:14px;font-weight:600;margin-bottom:16px">🔌 Integrations</h3>
  <!-- Contact Enrichment -->
  <div style="padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd);margin-bottom:12px">
    <div style="font-size:12px;font-weight:600;margin-bottom:4px">🔍 Contact Enrichment — Clodura</div>
    <p style="font-size:11px;color:var(--t3);margin-bottom:8px">Add your Clodura API key to enable one-click contact enrichment with verified email, phone, LinkedIn, and 40+ firmographic fields.</p>
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
      <input id="clo-api-key" class="inp" type="password" placeholder="Clodura API Key" style="flex:1;font-size:11px" value="${esc(D.creds.clo_key||'')}" oninput="D.creds.clo_key=this.value;saveAll()">
      <button class="btn btn-s" style="height:30px;font-size:11px" onclick="document.getElementById('clo-api-key').type=document.getElementById('clo-api-key').type==='password'?'text':'password'">👁</button>
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-p" style="height:28px;font-size:11px" onclick="D.creds.clo_key=document.getElementById('clo-api-key').value;saveAll();toast('✅ Clodura API key saved')">Save</button>
      ${D.creds.clo_key?`<button class="btn btn-d" style="height:28px;font-size:11px" onclick="D.creds.clo_key='';saveAll();renderScreen('settings');toast('Clodura key removed')">✕ Remove</button>`:''}
    </div>
    <div style="font-size:11px;color:var(--t3);margin-top:6px">${D.creds.clo_key?'<span style="color:var(--ok)">✓ Configured</span>':'Not configured — <a href="https://clodura.ai" target="_blank" style="color:var(--ac)">Get a Clodura API key</a>'}</div>
  </div>
  <!-- Atlas (CFResourcePlanner) one-way sync.
       Hydrated by _hydrateAtlasPanel() after the settings page mounts. -->
  <div id="atlas-panel" style="padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd);margin-bottom:12px">
    <div style="font-size:12px;font-weight:600;margin-bottom:4px">🗺 Atlas — CFResourcePlanner mirror</div>
    <p style="font-size:11px;color:var(--t3);margin-bottom:8px">One-way sync from Atlas. Replaces the legacy CF Smartsheet pulls — Atlas is now the source of truth for CF org chart, projects, opportunities, proposals, recruiting, resource planning, capacity, proforma, reports, COE plan, and project tasks. Set <code style="background:var(--s3);padding:1px 4px;border-radius:3px;font-size:11px">ATLAS_SYNC_URL</code> + <code style="background:var(--s3);padding:1px 4px;border-radius:3px;font-size:11px">ATLAS_SYNC_TOKEN</code> as Railway env vars on this LevelUp deployment.</p>
    <div id="atlas-panel-body" style="font-size:11px;color:var(--t2)">Loading…</div>
    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      <button class="btn btn-p" style="height:28px;font-size:11px" onclick="_atlasPullNow()">↻ Pull from Atlas</button>
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="_hydrateAtlasPanel()">Reload status</button>
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="nav('atlas')">→ Open Atlas page</button>
      <button class="btn btn-d" style="height:28px;font-size:11px" onclick="_atlasClear()" title="Wipe the locally cached Atlas snapshot. Does NOT touch Atlas itself.">✕ Clear cached snapshot</button>
    </div>
  </div>
  <!-- Automation Rules — hydrated by _hydrateAutomationsPanel() -->
  <div id="automations-panel" style="padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd);margin-bottom:12px">
    <div style="font-size:12px;font-weight:600;margin-bottom:4px">⚙ Automation Rules</div>
    <p style="font-size:11px;color:var(--t3);margin-bottom:8px">When a task matches a trigger, run an action automatically. Runs every 15 min on the server. Works on native + external (Smartsheet/Nifty) tasks.</p>
    <div id="automations-body" style="font-size:11px;color:var(--t2)">Loading…</div>
    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      <button class="btn btn-p" style="height:28px;font-size:11px" onclick="_openAutomationEditor()">+ New rule</button>
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="_automationsRunNow()">▶ Run all now</button>
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="_hydrateAutomationsPanel()">Reload</button>
    </div>
  </div>
  <!-- External Task Sync / Webhooks -->
  <div style="padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd);margin-bottom:12px">
    <div style="font-size:12px;font-weight:600;margin-bottom:4px">🔗 External Task Sync — Webhook</div>
    <p style="font-size:11px;color:var(--t3);margin-bottom:8px">Send tasks from Zapier, Make, or any HTTP source directly into LevelUp. POST JSON to the endpoint below with <code style="background:var(--s3);padding:1px 4px;border-radius:3px">{title, due, priority, context}</code>.</p>
    <div style="font-size:11px;color:var(--t2);margin-bottom:4px">Webhook Endpoint:</div>
    <div style="display:flex;gap:6px;align-items:center">
      <code style="background:var(--s3);padding:4px 8px;border-radius:4px;font-size:11px;flex:1;user-select:all;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${window.location.origin}/api/webhook/tasks</code>
      <button class="btn btn-s" style="height:26px;font-size:11px" onclick="navigator.clipboard.writeText(window.location.origin+'/api/webhook/tasks');toast('✓ Copied')">Copy</button>
    </div>
  </div>
  <!-- Calendar Integration -->
  <div style="padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd);margin-bottom:12px">
    <div style="font-size:12px;font-weight:600;margin-bottom:4px">📅 Calendar Integrations</div>
    <p style="font-size:11px;color:var(--t3);margin-bottom:8px">Calendar sync is managed via your Connected Accounts (Settings → Accounts). Once connected, use the ☁ Sync O365 button in the Calendar view to pull events.</p>
    <div style="display:flex;gap:8px">
      <button class="btn btn-s" style="font-size:11px" onclick="nav('settings');setTimeout(()=>{document.querySelectorAll('.sp').forEach(x=>x.style.display='none');document.getElementById('sp-4').style.display='';document.querySelectorAll('.si').forEach((x,i)=>{x.classList.toggle('on',i===4)});loadOAuthStatus()},50)">→ Go to Accounts</button>
      <button class="btn btn-s" style="font-size:11px" onclick="nav('mail')">→ Open Calendar</button>
    </div>
  </div>
  </div>
  <!-- AI Features --><div id="sp-6" class="sp" style="display:none">
  <h3 style="font-size:14px;font-weight:600;margin-bottom:16px">✨ AI Features</h3>
  <!-- Default AI output length -->
  <div style="padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd);margin-bottom:12px">
    <h4 style="font-size:12px;font-weight:600;margin-bottom:4px">📏 Default AI output length</h4>
    <p style="font-size:11px;color:var(--t3);margin-bottom:10px">Controls how much text AI generates (Validate, Pre-mortem, Expand, Compose Notes, Compose Description, Journal modes, Note modes, etc.). You can override per-RTE via the chip in each AI Assistance bar — clicking it cycles Short → Medium → Long.</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${[['short','📏 Short','~80 words · 3-5 sentences'],['medium','📐 Medium','~200 words · default'],['long','📋 Long','~500 words · formatted'] ].map(([v,l,h])=>{
        const active=((D.prefs&&D.prefs.aiOutputLength)||'medium')===v;
        return `<button class="btn ${active?'btn-p':'btn-s'}" style="font-size:11px;height:auto;padding:8px 10px;text-align:left;flex:1;min-width:140px" onclick="_aiSetLength('${v}');renderScreen('settings')"><div style="font-weight:600">${l}</div><div style="font-size:11px;color:${active?'rgba(255,255,255,.85)':'var(--t3)'};margin-top:2px">${h}</div></button>`;
      }).join('')}
    </div>
  </div>
  <!-- AI Provider Keys -->
  <div style="padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd);margin-bottom:12px">
    <h4 style="font-size:12px;font-weight:600;margin-bottom:4px">🔑 AI Provider API Keys</h4>
    <p style="font-size:11px;color:var(--t3);margin-bottom:10px">${String(D.creds.role||'').toLowerCase()==='admin'?'Workspace AI keys — saved on the server and shared with all team members. Each user does <strong>not</strong> need to enter their own key.':"🔒 AI keys are managed by your administrator and shared across the team. You don't need to enter your own."}</p>
    <!-- Active Provider Selector -->
    <div style="margin-bottom:12px">
      <label style="font-size:11px;font-weight:600;color:var(--t2);display:block;margin-bottom:4px">Active Provider</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${['openai','claude','gemini'].map(p=>{
          const labels={openai:'OpenAI',claude:'Anthropic Claude',gemini:'Google Gemini'};
          const active=_sharedAI.provider||'openai';
          const isAdmin=String(D.creds.role||'').toLowerCase()==='admin';
          return `<button class="btn ${active===p?'btn-p':'btn-s'}" style="font-size:11px;height:26px${isAdmin?'':';opacity:.6;pointer-events:none'}" ${isAdmin?`onclick="setAIProvider('${p}')"`:''}>${{openai:'🟢',claude:'🟠',gemini:'🔵'}[p]} ${labels[p]}</button>`;
        }).join('')}
      </div>
      <div style="font-size:11px;color:var(--t3);margin-top:6px">
        ${(()=>{const p=_sharedAI.provider||'openai';const hasKey=!!_sharedAI.keys[p];return hasKey?'<span style="color:var(--ok)">✓ Ready to use</span>':'<span style="color:var(--warn)">⚠ Add an API key below to use this provider</span>';})()}
      </div>
    </div>
    <!-- OpenAI -->
    <div style="margin-bottom:10px;padding:10px;background:var(--s1);border-radius:6px;border:1px solid var(--bd1)">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <div style="width:20px;height:20px;background:#10a37f;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff">O</div>
        <div style="font-size:11px;font-weight:600">OpenAI (GPT-4o, GPT-4o-mini)</div>
        ${_sharedAI.keys.openai?'<span style="font-size:11px;color:var(--ok);margin-left:auto">✓ Configured</span>':'<span style="font-size:11px;color:var(--t3);margin-left:auto">Not set</span>'}
      </div>
      <div style="display:flex;gap:6px">
        <input id="ai-openai-key" class="inp" type="password" placeholder="sk-..." style="flex:1;font-size:11px" value="${esc(_sharedAI.keys.openai||'')}" ${String(D.creds.role||'').toLowerCase()==='admin'?'':'disabled'}>
        <button class="btn btn-s" style="height:30px;font-size:11px" onclick="document.getElementById('ai-openai-key').type=document.getElementById('ai-openai-key').type==='password'?'text':'password'">👁</button>
        <button class="btn btn-p admin-only" style="height:30px;font-size:11px" onclick="setAIKey('openai',document.getElementById('ai-openai-key').value.trim())">Save</button>
        <button class="btn btn-s" style="height:30px;font-size:11px" id="btn-test-openai" onclick="testAIProvider('openai','ai-openai-key','btn-test-openai')">⚡ Test</button>
      </div>
      <div id="ai-openai-status" style="font-size:11px;margin-top:4px;display:none"></div>
      <div style="font-size:11px;color:var(--t3);margin-top:4px">Get your key at <a href="https://platform.openai.com/api-keys" target="_blank" style="color:var(--ac)">platform.openai.com/api-keys</a></div>
    </div>
    <!-- Claude -->
    <div style="margin-bottom:10px;padding:10px;background:var(--s1);border-radius:6px;border:1px solid var(--bd1)">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <div style="width:20px;height:20px;background:#d97706;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff">A</div>
        <div style="font-size:11px;font-weight:600">Anthropic Claude (claude-3-5-sonnet)</div>
        ${_sharedAI.keys.claude?'<span style="font-size:11px;color:var(--ok);margin-left:auto">✓ Configured</span>':'<span style="font-size:11px;color:var(--t3);margin-left:auto">Not set</span>'}
      </div>
      <div style="display:flex;gap:6px">
        <input id="ai-claude-key" class="inp" type="password" placeholder="sk-ant-..." style="flex:1;font-size:11px" value="${esc(_sharedAI.keys.claude||'')}" ${String(D.creds.role||'').toLowerCase()==='admin'?'':'disabled'}>
        <button class="btn btn-s" style="height:30px;font-size:11px" onclick="document.getElementById('ai-claude-key').type=document.getElementById('ai-claude-key').type==='password'?'text':'password'">👁</button>
        <button class="btn btn-p admin-only" style="height:30px;font-size:11px" onclick="setAIKey('claude',document.getElementById('ai-claude-key').value.trim())">Save</button>
        <button class="btn btn-s" style="height:30px;font-size:11px" id="btn-test-claude" onclick="testAIProvider('claude','ai-claude-key','btn-test-claude')">⚡ Test</button>
      </div>
      <div id="ai-claude-status" style="font-size:11px;margin-top:4px;display:none"></div>
      <div style="font-size:11px;color:var(--t3);margin-top:4px">Get your key at <a href="https://console.anthropic.com/settings/keys" target="_blank" style="color:var(--ac)">console.anthropic.com</a></div>
    </div>
    <!-- Gemini -->
    <div style="padding:10px;background:var(--s1);border-radius:6px;border:1px solid var(--bd1)">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <div style="width:20px;height:20px;background:#4285f4;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff">G</div>
        <div style="font-size:11px;font-weight:600">Google Gemini (gemini-1.5-pro)</div>
        ${_sharedAI.keys.gemini?'<span style="font-size:11px;color:var(--ok);margin-left:auto">✓ Configured</span>':'<span style="font-size:11px;color:var(--t3);margin-left:auto">Not set</span>'}
      </div>
      <div style="display:flex;gap:6px">
        <input id="ai-gemini-key" class="inp" type="password" placeholder="AIza..." style="flex:1;font-size:11px" value="${esc(_sharedAI.keys.gemini||'')}" ${String(D.creds.role||'').toLowerCase()==='admin'?'':'disabled'}>
        <button class="btn btn-s" style="height:30px;font-size:11px" onclick="document.getElementById('ai-gemini-key').type=document.getElementById('ai-gemini-key').type==='password'?'text':'password'">👁</button>
        <button class="btn btn-p admin-only" style="height:30px;font-size:11px" onclick="setAIKey('gemini',document.getElementById('ai-gemini-key').value.trim())">Save</button>
        <button class="btn btn-s" style="height:30px;font-size:11px" id="btn-test-gemini" onclick="testAIProvider('gemini','ai-gemini-key','btn-test-gemini')">⚡ Test</button>
      </div>
      <div id="ai-gemini-status" style="font-size:11px;margin-top:4px;display:none"></div>
      <div style="font-size:11px;color:var(--t3);margin-top:4px">Get your key at <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--ac)">aistudio.google.com</a></div>
    </div>
  </div>
  <!-- Usage & Cost Caps -->
  <div style="padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd);margin-bottom:12px">
    <h4 style="font-size:12px;font-weight:600;margin-bottom:8px">💰 Usage & Cost Caps</h4>
    <div class="lr" style="padding:8px 0"><div style="flex:1"><div style="font-size:12px">Monthly cap (USD)</div><div style="font-size:11px;color:var(--t3)">AI features stop when this limit is reached</div></div><input class="inp" style="max-width:80px" value="$20.00"></div>
    <div class="lr" style="padding:8px 0"><div style="flex:1"><div style="font-size:12px">This month's usage</div></div><span style="font-size:12px;font-weight:500;color:var(--ok)">$3.42 / $20.00</span></div>
  </div>
  <!-- AI Feature Toggles -->
  <div style="padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd);margin-bottom:12px">
    <h4 style="font-size:12px;font-weight:600;margin-bottom:8px">🤖 AI Feature Toggles</h4>
    ${[{key:'aiTasks',label:'Task AI',desc:'Smart decomposition, priority scoring, delegation suggestions'},{key:'aiCalendar',label:'Calendar AI',desc:'Meeting prep briefs, schedule optimisation, NL event creation'},{key:'aiMail',label:'Mail AI',desc:'Smart reply drafts, triage scoring, thread summarisation'},{key:'aiNotes',label:'Notes AI',desc:'Concept linking, gap detection, Q&A over notes'},{key:'aiHabits',label:'Habits & Journal AI',desc:'Mood correlation, streak coaching, sentiment trends'},{key:'aiContacts',label:'Contacts AI',desc:'Relationship health score, conversation starters, duplicates'}].map(f=>`<div class="lr" style="padding:6px 0"><div style="flex:1"><div style="font-size:12px">${f.label}</div><div style="font-size:11px;color:var(--t3)">${f.desc}</div></div><div class="tog ${!(D.prefs&&D.prefs[f.key]===false)?'on':''}" onclick="D.prefs=D.prefs||{};D.prefs['${f.key}']=!this.classList.contains('on');this.classList.toggle('on');saveAll();toast(this.classList.contains('on')?'${f.label} on':'${f.label} off')"></div></div>`).join('')}
  </div>
  <!-- Assistant Topics -->
  <div style="padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd);margin-bottom:12px">
    <h4 style="font-size:12px;font-weight:600;margin-bottom:6px">📰 Assistant Topics</h4>
    <p style="font-size:11px;color:var(--t2);margin-bottom:8px">The AI assistant will proactively share info on these topics:</p>
    ${['World News','Politics','Technology','Entertainment','Science','Weather','Sports','Finance'].map(t=>`<div class="lr" style="padding:4px 0"><div class="chk ${D.aiTopics.includes(t)?'on':''}" onclick="if(D.aiTopics.includes('${t}'))D.aiTopics=D.aiTopics.filter(x=>x!=='${t}');else D.aiTopics.push('${t}');save('aiTopics');renderScreen('settings')"></div><span style="font-size:11px">${t}</span></div>`).join('')}
  </div>
  <!-- AI Follow-ups in Compose -->
  <div style="padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd)">
    <h4 style="font-size:12px;font-weight:600;margin-bottom:4px">✉ AI Compose Features</h4>
    <p style="font-size:11px;color:var(--t3);margin-bottom:8px">AI-powered tools available in the compose modal.</p>
    <div class="lr" style="padding:6px 0"><div style="flex:1"><div style="font-size:12px">✨ Suggest Follow-ups</div><div style="font-size:11px;color:var(--t3)">Generate 3 follow-up message suggestions based on your draft</div></div><span style="font-size:11px;color:var(--ok)">✓ Enabled</span></div>
    <div class="lr" style="padding:6px 0"><div style="flex:1"><div style="font-size:12px">🤖 Smart Reply Drafts</div><div style="font-size:11px;color:var(--t3)">One-click AI draft based on email thread context</div></div><span style="font-size:11px;color:var(--ok)">✓ Enabled</span></div>
    <div class="lr" style="padding:6px 0"><div style="flex:1"><div style="font-size:12px">📋 Thread Summarisation</div><div style="font-size:11px;color:var(--t3)">Collapse long chains into a 3-sentence summary</div></div><span style="font-size:11px;color:var(--ok)">✓ Enabled</span></div>
  </div>
  </div>
  <!-- Teams --><div id="sp-7" class="sp" style="display:none"><h3 style="font-size:14px;font-weight:600;margin-bottom:8px">Teams & Permissions</h3>
  <p style="font-size:11px;color:var(--t2);margin-bottom:10px">Manage team members and their access rights.</p>
  ${D.teams.map(team=>`<div class="team-card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div style="font-size:14px;font-weight:600">${esc(team.name)}</div><button class="btn btn-p" style="height:26px;font-size:11px" onclick="addTeamMember(${team.id})">+ Add Member</button></div>
  ${team.members.map(m=>`<div class="member-row"><div class="member-av" style="background:${m.color}">${m.name.split(' ').map(w=>w[0]).join('')}</div><div class="member-info"><div class="member-name">${esc(m.name)}</div><div class="member-role">${esc(m.email)} · ${m.role}</div></div>
  <select class="inp" style="width:80px;height:24px;font-size:11px" onchange="updateMemberRole(${team.id},${m.id},this.value)"><option ${m.role==='Owner'?'selected':''}>Owner</option><option ${m.role==='Admin'?'selected':''}>Admin</option><option ${m.role==='Member'?'selected':''}>Member</option><option ${m.role==='Viewer'?'selected':''}>Viewer</option></select>
  <button class="btn btn-s" style="height:24px;font-size:11px" onclick="editTeamMember(${team.id},${m.id})">✏ Edit</button>
  <button class="btn btn-s" style="height:24px;font-size:11px" onclick="editPerms(${team.id},${m.id})">Permissions</button>
  ${m.role!=='Owner'?`<button class="btn btn-d" style="height:24px;font-size:11px" onclick="if(confirm('Remove ${m.name} from team?'))removeMember(${team.id},${m.id})">✕ Remove</button>`:''}</div>`).join('')}
  </div>`).join('')}
  <button class="btn btn-s" onclick="addTeam()">+ Create Team</button>
  </div>
  <!-- Word Doc Note Import --><div id="sp-8" class="sp" style="display:none">
  <h3 style="font-size:14px;font-weight:600;margin-bottom:4px">📝 Word Document Note Import</h3>
  <p style="font-size:11px;color:var(--t2);margin-bottom:12px">Import notes from a Microsoft Word (.docx) file. Each note in the document must begin with a <strong>title</strong>, followed by a <strong>date line</strong> (e.g. <em>Monday, January 1, 2024</em>) and a <strong>time line</strong> (e.g. <em>9:00 AM</em>).</p>

  <!-- Upload area -->
  <div id="wdi-drop-zone" style="border:2px dashed var(--bd2);border-radius:10px;padding:24px;text-align:center;cursor:pointer;margin-bottom:12px;transition:border-color .2s,background .2s" onclick="document.getElementById('wdi-file-input').click()" ondragover="event.preventDefault();this.style.borderColor='var(--ac)';this.style.background='var(--acs)'" ondragleave="this.style.borderColor='var(--bd2)';this.style.background=''" ondrop="event.preventDefault();this.style.borderColor='var(--bd2)';this.style.background='';wdiHandleDrop(event.dataTransfer.files)">
    <div style="font-size:28px;margin-bottom:6px">📄</div>
    <div style="font-size:12px;font-weight:600;margin-bottom:3px">Drop your .docx file here</div>
    <div style="font-size:11px;color:var(--t3)">or click to browse — max 100 MB</div>
    <input type="file" id="wdi-file-input" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style="display:none" onchange="wdiHandleDrop(this.files)">
  </div>

  <!-- Selected file info -->
  <div id="wdi-file-info" style="display:none;background:var(--s2);border-radius:8px;padding:10px;margin-bottom:10px">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:18px">📄</span>
      <div style="flex:1;min-width:0">
        <div id="wdi-file-name" style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>
        <div id="wdi-file-size" style="font-size:11px;color:var(--t3)"></div>
      </div>
      <button class="btn btn-s" style="font-size:11px;height:24px" onclick="wdiClearFile()">✕ Clear</button>
    </div>
  </div>

  <!-- Bypass binaries option (for when storage isn't configured yet) -->
  <label id="wdi-skip-row" style="display:none;align-items:center;gap:8px;padding:8px 10px;margin-bottom:10px;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;cursor:pointer;font-size:11px">
    <input type="checkbox" id="wdi-skip-binaries" style="accent-color:var(--ac);cursor:pointer">
    <div style="flex:1">
      <div style="font-weight:600">⚡ Skip images & attachments</div>
      <div style="font-size:11px;color:var(--t3);margin-top:2px">Imports text and formatting only. Use this when server storage isn't configured yet — avoids stuffing megabytes of data URIs into your notes.</div>
    </div>
  </label>

  <!-- Parse button -->
  <button id="wdi-parse-btn" class="btn btn-p" style="width:100%;font-size:12px;margin-bottom:12px;display:none" onclick="wdiParseFile()">🔍 Analyse Document</button>

  <!-- Parse progress -->
  <div id="wdi-progress" style="display:none;text-align:center;padding:16px;color:var(--t3);font-size:11px">
    <div style="font-size:22px;margin-bottom:6px">⏳</div>
    <div>Parsing document…</div>
  </div>

  <!-- Warnings -->
  <div id="wdi-warnings" style="display:none;background:var(--warn-bg,#fffbeb);border:1px solid var(--warn,#f59e0b);border-radius:8px;padding:10px;margin-bottom:10px;font-size:11px;color:var(--t2)">
    <div style="font-weight:600;margin-bottom:4px">⚠ Warnings</div>
    <div id="wdi-warnings-list"></div>
  </div>

  <!-- Preview table -->
  <div id="wdi-preview" style="display:none">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="font-size:12px;font-weight:600">📊 Preview — <span id="wdi-note-count">0</span> notes found</div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-s" style="font-size:11px;height:24px" onclick="wdiSelectAll(true)">Select all</button>
        <button class="btn btn-s" style="font-size:11px;height:24px" onclick="wdiSelectAll(false)">Deselect all</button>
      </div>
    </div>
    <!-- Duplicate handling -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px;background:var(--s2);border-radius:6px">
      <span style="font-size:11px;font-weight:600;color:var(--t2);white-space:nowrap">Duplicate handling:</span>
      <select id="wdi-dup-mode" class="inp" style="height:24px;font-size:11px;flex:1">
        <option value="skip">Skip duplicates (keep existing)</option>
        <option value="overwrite">Overwrite duplicates</option>
        <option value="rename">Import as new (rename with suffix)</option>
      </select>
    </div>
    <!-- Note list -->
    <div id="wdi-note-list" style="max-height:260px;overflow-y:auto;border:1px solid var(--bd1);border-radius:8px"></div>
    <!-- Import button -->
    <button class="btn btn-p" style="width:100%;font-size:12px;margin-top:10px" onclick="wdiImportSelected()">📥 Import Selected Notes</button>
  </div>

  <!-- Import result -->
  <div id="wdi-result" style="display:none;margin-top:10px;padding:10px;border-radius:8px;font-size:11px"></div>

  <!-- Import history -->
  <div style="margin-top:16px">
    <div style="font-size:11px;font-weight:600;margin-bottom:6px;color:var(--t2)">🕐 Import History</div>
    <div id="wdi-history" style="font-size:11px;color:var(--t3)">No imports yet.</div>
  </div>
  </div>
  <!-- Sync --><div id="sp-9" class="sp" style="display:none">
  <h3 style="font-size:14px;font-weight:600;margin-bottom:12px">Sync</h3>
  <!-- Live sync status card -->
  <div id="sync-panel-status" style="background:var(--bg2,rgba(255,255,255,0.04));border:1px solid var(--brd);border-radius:8px;padding:12px;margin-bottom:12px">
    <div style="font-size:11px;font-weight:600;margin-bottom:8px;color:var(--t2)">Connected Providers</div>
    <div id="sync-panel-ms" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--brd)">
      <div style="width:28px;height:28px;border-radius:6px;background:#0078d4;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0">M</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:500">Microsoft 365</div>
        <div id="sync-panel-ms-status" style="font-size:11px;color:var(--t3)">Loading…</div>
      </div>
      <div style="display:flex;gap:4px">
        <button class="btn" style="font-size:11px;padding:3px 8px" onclick="syncOAuthCalendar('microsoft')">📅 Cal</button>
        <button class="btn" style="font-size:11px;padding:3px 8px" onclick="syncOAuthMail('microsoft')">✉ Mail</button>
        <button class="btn" style="font-size:11px;padding:3px 8px" onclick="openContactsImportPicker('microsoft')">👥 Contacts</button>
      </div>
    </div>
  </div>
  <!-- Sync all button -->
  <button class="btn btn-p" style="width:100%;font-size:12px;margin-bottom:12px" onclick="syncAllProviders()">🔄 Sync All Now</button>
  <!-- Sync log -->
  <div style="font-size:11px;font-weight:600;margin-bottom:6px;color:var(--t2)">Recent Sync Activity</div>
  <div id="sync-panel-log" style="font-size:11px;color:var(--t3);background:var(--bg2,rgba(0,0,0,0.04));border-radius:6px;padding:8px;max-height:160px;overflow-y:auto">Loading…</div>
  </div>
  <!-- Backup --><div id="sp-10" class="sp" style="display:none"><h3 style="font-size:14px;font-weight:600;margin-bottom:8px">Backup & Export</h3>
  <div class="lr" style="padding:8px 0"><div style="flex:1"><div style="font-size:12px">Export All Data</div><div style="font-size:11px;color:var(--t3)">JSON + Markdown + CSV</div></div><button class="btn btn-p" style="font-size:11px" onclick="exportData()">Export ZIP</button></div>
  <div class="lr" style="padding:8px 0"><div style="flex:1"><div style="font-size:12px">Auto-Backup</div></div><div class="tog on" onclick="this.classList.toggle('on')"></div></div>
  <div class="lr" style="padding:8px 0"><div style="flex:1"><div style="font-size:12px">Import Data</div><div style="font-size:11px;color:var(--t3)">Restore from JSON backup</div></div><button class="btn btn-s" style="font-size:11px" onclick="document.getElementById('import-input').click()">Import JSON</button></div>
  <div style="background:var(--acs);border-left:3px solid var(--ac);border-radius:0 6px 6px 0;padding:8px 12px;margin-top:4px;font-size:11px;color:var(--t2)">⚠ Importing will <strong>replace</strong> all current data. Export a backup first if needed.</div></div>
  <!-- Privacy --><div id="sp-11" class="sp" style="display:none"><h3 style="font-size:14px;font-weight:600;margin-bottom:8px">Privacy</h3>
  <p style="font-size:11px;color:var(--t2);margin-bottom:8px">LevelUp is local-first. Your data lives on your machine.</p>
  <div class="lr" style="padding:8px 0"><div style="flex:1"><div style="font-size:12px">Local encryption</div></div><div class="tog" onclick="this.classList.toggle('on')"></div></div>
  <div class="lr" style="padding:8px 0"><div style="flex:1"><div style="font-size:12px">AI Audit Log</div></div><button class="btn btn-s" style="font-size:11px">View Activity</button></div></div>
  <!-- Admin --><div id="sp-12" class="sp" style="display:none">
    <h3 style="font-size:14px;font-weight:600;margin-bottom:8px">\ud83d\udee1 Admin Tools</h3>
    <p style="font-size:11px;color:var(--t3);margin-bottom:12px">Visible to administrators only. Manage system-wide email delivery and OAuth token health.</p>
    <!-- Expiry Notification -->
    <div style="margin-bottom:16px;padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd)">
      <div style="font-size:12px;font-weight:600;margin-bottom:4px">\u26a0 OAuth Token Expiry Check</div>
      <p style="font-size:11px;color:var(--t3);margin-bottom:8px">Check all users' connected OAuth tokens and send an owner notification if any expire within 3 days. Runs at most once per day.</p>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-p" style="height:30px;font-size:11px" onclick="adminCheckTokenExpiry()">Check &amp; Notify Now</button>
        <span id="admin-expiry-status" style="font-size:11px;color:var(--t3)"></span>
      </div>
    </div>
    <!-- Send Expiry Emails Now -->
    <div style="margin-bottom:16px;padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd)">
      <div style="font-size:12px;font-weight:600;margin-bottom:4px">📨 Send Expiry Warning Emails</div>
      <p style="font-size:11px;color:var(--t3);margin-bottom:8px">Send a direct expiry warning email to each user whose OAuth token expires within 7 days. Idempotent — runs at most once per day.</p>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-p" style="height:30px;font-size:11px" onclick="adminSendExpiryEmails()">Send Expiry Emails Now</button>
        <span id="admin-expiry-email-status" style="font-size:11px;color:var(--t3)"></span>
      </div>
    </div>
        <!-- Email Delivery Log -->
    <div style="padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd)">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px">\ud83d\udce7 Email Delivery Log</div>
      <!-- Filters -->
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        <select id="admin-log-status" class="inp" style="width:100px;font-size:11px;height:28px" onchange="loadAdminDeliveryLog(1)">
          <option value="">All statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
        </select>
        <input type="date" id="admin-log-from" class="inp" style="font-size:11px;height:28px;width:130px" onchange="loadAdminDeliveryLog(1)">
        <input type="date" id="admin-log-to" class="inp" style="font-size:11px;height:28px;width:130px" onchange="loadAdminDeliveryLog(1)">
        <button class="btn btn-s" style="height:28px;font-size:11px" onclick="clearAdminLogFilters()">Clear</button>
      </div>
      <!-- Table -->
      <div id="admin-delivery-log" style="font-size:11px;color:var(--t3)">Loading\u2026</div>
      <!-- Pagination -->
      <div id="admin-log-pagination" style="display:flex;gap:6px;align-items:center;margin-top:8px;font-size:11px"></div>
    </div>
    <!-- Log Retention Period -->
    <div style="margin-top:16px;padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd)">
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">&#x23F1; Log Retention Period</div>
      <p style="font-size:11px;color:var(--t3);margin-bottom:8px">Logs older than this many days are deleted during each scheduled run (min 7, max 3650).</p>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <input id="admin-retention-days" class="inp" type="number" min="7" max="3650" style="width:100px;font-size:12px" placeholder="90" />
        <button class="btn btn-p" style="height:30px;font-size:11px" onclick="saveLogRetentionDays()">Save</button>
        <span id="admin-retention-status" style="font-size:11px;color:var(--t3)"></span>
      </div>
    </div>
    <!-- Scheduled Task History -->
    <div style="margin-top:16px;padding:12px;background:var(--s2);border-radius:8px;border:1px solid var(--brd)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:12px;font-weight:600">⏱ Scheduled Task History</div>
        <button class="btn btn-s" style="height:26px;font-size:11px" onclick="loadScheduledTaskLog()">↻ Refresh</button>
      </div>
      <p style="font-size:11px;color:var(--t3);margin-bottom:8px">Last 20 runs of the daily OAuth token expiry check job.</p>
      <div id="admin-task-log" style="font-size:11px;color:var(--t3)">Loading…</div>
    </div>
  </div>
  </div></div>`;
}

function renderCredCard(title,icon,desc,prefix,fields,isAI=false){
  const connected=fields.some(f=>D.creds[f.split('|')[1]]);
  return `<div class="cred"><div class="cred-h"><div class="cred-icon" style="background:var(--s3);color:var(--ac)">${icon}</div><div style="flex:1"><div class="cred-title">${title}</div><div class="cred-desc">${desc}</div></div><div class="cred-st"><span class="dot ${connected?'dot-g':'dot-x'}"></span><span style="color:${connected?'var(--ok)':'var(--t3)'}">${connected?'Configured':'Not set'}</span></div></div>
  ${fields.map(f=>{const[label,key]=f.split('|');return`<div style="margin-bottom:6px"><label style="font-size:11px;font-weight:500;color:var(--t2);display:block;margin-bottom:2px">${label}</label><div style="display:flex;gap:4px"><input class="inp" style="flex:1;font-size:11px" type="password" placeholder="Enter ${label}" value="${esc(D.creds[key]||'')}" onchange="D.creds['${key}']=this.value;saveAll();toast('Saved!')"><button class="btn btn-s" style="height:30px;font-size:11px" onclick="this.previousElementSibling.type=this.previousElementSibling.type==='password'?'text':'password'">👁</button></div></div>`}).join('')}
  <div style="display:flex;gap:4px;margin-top:6px"><button class="btn btn-p" style="height:26px;font-size:11px" onclick="testIntegrationCred('${prefix}','${title}')">Test</button>${connected?`<button class="btn btn-d" style="height:26px;font-size:11px" onclick="${fields.map(f=>`D.creds['${f.split('|')[1]}']=''`).join(';')};saveAll();renderScreen('settings');toast('Disconnected')">Disconnect</button>`:''}</div></div>`;
}

function showSetTab(el,id){
  el.parentElement.querySelectorAll('.si').forEach(x=>x.classList.remove('on'));el.classList.add('on');
  document.querySelectorAll('.sp').forEach(x=>x.style.display='none');
  document.getElementById(id).style.display='';
  if(id==='sp-4'){loadOAuthStatus();loadEmailDeliveryLog();populateRedirectUris();}
  if(id==='sp-5'){if(typeof _hydrateAutomationsPanel==='function')_hydrateAutomationsPanel();if(typeof _hydrateAtlasPanel==='function')_hydrateAtlasPanel();}
  if(id==='sp-3'){loadEmailNotifPrefs();if(typeof _hydrateDailyDigestPanel==='function')_hydrateDailyDigestPanel();if(typeof _hydrateWeeklyReviewPanel==='function')_hydrateWeeklyReviewPanel();}
  if(id==='sp-12'){loadAdminDeliveryLog(1);loadScheduledTaskLog();loadLogRetentionDays();}
  if(id==='sp-8')loadOnenoteStatus();
  if(id==='sp-9')loadSyncPanel();
}

// ─── External Sources (Smartsheet + Nifty) Settings UI ─────────────────────
// All async helpers for the sp-5 Integrations panel. Builds the connection
// status / watch lists / add-modal flow against the externalSources.* tRPC
// procedures. Kept in one block for grep-ability.

// ─── Daily Digest Email Settings Panel ──────────────────────────────────────
async function _hydrateDailyDigestPanel(){
  const body=document.getElementById('daily-digest-body');
  if(!body)return;
  body.innerHTML='Loading…';
  try{
    const p=await _trpc('dailyDigest.getPrefs',undefined,'query');
    body.innerHTML=_renderDailyDigestPanelHTML(p);
  }catch(e){
    body.innerHTML=`<div style="color:var(--red);font-size:11px">Failed to load: ${esc(e.message||String(e))}</div>`;
  }
}
function _renderDailyDigestPanelHTML(p){
  const userEmail=(D.creds&&D.creds.email)||'(no email on file)';
  const recipient=p.recipientEmail||userEmail;
  const lastSent=p.lastSentDate?`Last sent: ${esc(p.lastSentDate)}`:'Not yet sent';
  return `
    <div class="lr" style="padding:6px 0;align-items:center">
      <div style="flex:1">
        <div style="font-size:12px;font-weight:500">Send the morning digest</div>
        <div style="font-size:11px;color:var(--t3)">${lastSent}</div>
      </div>
      <div class="tog ${p.enabled?'on':''}" id="tog-digest-enabled" onclick="_toggleDigestEnabled()"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:8px;margin-top:8px">
      <div>
        <div style="font-size:11px;color:var(--t2);margin-bottom:3px">Send around</div>
        <input id="digest-time" type="time" class="inp" style="width:100%;font-size:11px" value="${esc(p.time||'07:00')}" onchange="_saveDigestTime()">
      </div>
      <div>
        <div style="font-size:11px;color:var(--t2);margin-bottom:3px">Recipient (default: your email)</div>
        <input id="digest-recipient" class="inp" placeholder="${esc(userEmail)}" style="width:100%;font-size:11px" value="${esc(p.recipientEmail||'')}" onblur="_saveDigestRecipient()">
      </div>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-top:8px">Resolves to: <code style="background:var(--s3);padding:1px 4px;border-radius:3px">${esc(recipient)}</code></div>
    <div style="display:flex;gap:6px;margin-top:10px">
      <button class="btn btn-p" style="height:28px;font-size:11px" onclick="_digestSendNow()">📧 Send now (test)</button>
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="_hydrateDailyDigestPanel()">Reload</button>
    </div>
  `;
}
async function _toggleDigestEnabled(){
  const tog=document.getElementById('tog-digest-enabled');
  const willBeOn=!tog.classList.contains('on');
  try{
    await _trpc('dailyDigest.savePrefs',{enabled:willBeOn},'mutation');
    tog.classList.toggle('on');
    toast({type:'success',title:willBeOn?'☀ Daily digest on':'Daily digest off'});
  }catch(e){toast({type:'warn',title:'Save failed',msg:e.message||String(e)});}
}
async function _saveDigestTime(){
  const v=document.getElementById('digest-time').value;
  if(!v)return;
  try{
    await _trpc('dailyDigest.savePrefs',{time:v},'mutation');
    toast({type:'success',title:`Send time set to ${v}`,duration:1500});
  }catch(e){toast({type:'warn',title:'Save failed',msg:e.message||String(e)});}
}
async function _saveDigestRecipient(){
  const v=document.getElementById('digest-recipient').value.trim();
  try{
    await _trpc('dailyDigest.savePrefs',{recipientEmail:v||null},'mutation');
    await _hydrateDailyDigestPanel();
  }catch(e){toast({type:'warn',title:'Save failed',msg:e.message||String(e)});}
}
function _toggleExternalQueueMode(){
  const tog=document.getElementById('tog-ext-queue');
  D.prefs=D.prefs||{};
  D.prefs.externalQueueMode=!D.prefs.externalQueueMode;
  if(tog)tog.classList.toggle('on',D.prefs.externalQueueMode);
  save('prefs');
  toast({type:'success',title:D.prefs.externalQueueMode?'⬆ Queue mode ON — status changes will be batched':'Auto-push ON — each change writes back immediately',duration:2500});
}

async function _digestSendNow(){
  try{
    toast({type:'info',title:'Sending test digest…',duration:1500});
    const r=await _trpc('dailyDigest.sendNow',undefined,'mutation');
    if(r.sent>0)toast({type:'success',title:`✓ Digest sent (${r.sent})`});
    else if(r.skipped>0)toast({type:'info',title:'Nothing on today\'s plate — nothing to send'});
    else toast({type:'warn',title:`No send — errors:${r.errors}`});
  }catch(e){toast({type:'warn',title:'Send failed',msg:e.message||String(e)});}
}

// ─── Weekly Review panel (parallel to daily digest) ─────────────────────────
async function _hydrateWeeklyReviewPanel(){
  const body=document.getElementById('weekly-review-body');
  if(!body)return;
  body.innerHTML='Loading…';
  try{
    const p=await _trpc('weeklyReview.getPrefs',undefined,'query');
    body.innerHTML=_renderWeeklyReviewPanelHTML(p);
  }catch(e){
    body.innerHTML=`<div style="color:var(--red);font-size:11px">Failed to load: ${esc(e.message||String(e))}</div>`;
  }
}
function _renderWeeklyReviewPanelHTML(p){
  const userEmail=(D.creds&&D.creds.email)||'(no email on file)';
  const recipient=p.recipientEmail||userEmail;
  const lastSent=p.lastSentDate?`Last sent: ${esc(p.lastSentDate)}`:'Not yet sent';
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return `
    <div class="lr" style="padding:6px 0;align-items:center">
      <div style="flex:1">
        <div style="font-size:12px;font-weight:500">Send the weekly review</div>
        <div style="font-size:11px;color:var(--t3)">${lastSent}</div>
      </div>
      <div class="tog ${p.enabled?'on':''}" id="tog-weekly-enabled" onclick="_toggleWeeklyEnabled()"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 2fr;gap:8px;margin-top:8px">
      <div>
        <div style="font-size:11px;color:var(--t2);margin-bottom:3px">Day</div>
        <select id="weekly-dow" class="inp" style="width:100%;font-size:11px" onchange="_saveWeeklyDow()">
          ${days.map((d,i)=>`<option value="${i}" ${p.dayOfWeek===i?'selected':''}>${d}</option>`).join('')}
        </select>
      </div>
      <div>
        <div style="font-size:11px;color:var(--t2);margin-bottom:3px">Time</div>
        <input id="weekly-time" type="time" class="inp" style="width:100%;font-size:11px" value="${esc(p.time||'16:30')}" onchange="_saveWeeklyTime()">
      </div>
      <div>
        <div style="font-size:11px;color:var(--t2);margin-bottom:3px">Recipient (default: your email)</div>
        <input id="weekly-recipient" class="inp" placeholder="${esc(userEmail)}" style="width:100%;font-size:11px" value="${esc(p.recipientEmail||'')}" onblur="_saveWeeklyRecipient()">
      </div>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-top:8px">Resolves to: <code style="background:var(--s3);padding:1px 4px;border-radius:3px">${esc(recipient)}</code></div>
    <div style="display:flex;gap:6px;margin-top:10px">
      <button class="btn btn-p" style="height:28px;font-size:11px" onclick="_weeklySendNow()">📧 Send now (test)</button>
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="_hydrateWeeklyReviewPanel()">Reload</button>
    </div>
  `;
}
async function _toggleWeeklyEnabled(){
  const tog=document.getElementById('tog-weekly-enabled');
  const willBeOn=!tog.classList.contains('on');
  try{
    await _trpc('weeklyReview.savePrefs',{enabled:willBeOn},'mutation');
    tog.classList.toggle('on');
    toast({type:'success',title:willBeOn?'📊 Weekly review on':'Weekly review off'});
  }catch(e){toast({type:'warn',title:'Save failed',msg:e.message||String(e)});}
}
async function _saveWeeklyDow(){
  const v=parseInt(document.getElementById('weekly-dow').value,10);
  try{await _trpc('weeklyReview.savePrefs',{dayOfWeek:v},'mutation');toast({type:'success',title:'Day saved',duration:1200});}
  catch(e){toast({type:'warn',title:'Save failed',msg:e.message||String(e)});}
}
async function _saveWeeklyTime(){
  const v=document.getElementById('weekly-time').value;
  if(!v)return;
  try{await _trpc('weeklyReview.savePrefs',{time:v},'mutation');toast({type:'success',title:`Time set to ${v}`,duration:1500});}
  catch(e){toast({type:'warn',title:'Save failed',msg:e.message||String(e)});}
}
async function _saveWeeklyRecipient(){
  const v=document.getElementById('weekly-recipient').value.trim();
  try{await _trpc('weeklyReview.savePrefs',{recipientEmail:v||null},'mutation');await _hydrateWeeklyReviewPanel();}
  catch(e){toast({type:'warn',title:'Save failed',msg:e.message||String(e)});}
}
async function _weeklySendNow(){
  try{
    toast({type:'info',title:'Sending test review…',duration:1500});
    const r=await _trpc('weeklyReview.sendNow',undefined,'mutation');
    if(r.sent>0)toast({type:'success',title:`✓ Review sent (${r.sent})`});
    else if(r.skipped>0)toast({type:'info',title:'Nothing to send (empty week)'});
    else toast({type:'warn',title:`No send — errors:${r.errors}`});
  }catch(e){toast({type:'warn',title:'Send failed',msg:e.message||String(e)});}
}

// ─── Automation Rules panel ─────────────────────────────────────────────────
// Hydrates sp-5's #automations-body with the user's rules + add/edit modal
// flow against the automations.* tRPC procedures.
window._automationRules = [];
async function _hydrateAutomationsPanel(){
  const body=document.getElementById('automations-body');
  if(!body)return;
  body.innerHTML='Loading…';
  try{
    const rules=await _trpc('automations.list',undefined,'query');
    window._automationRules=rules||[];
    body.innerHTML=_renderAutomationsPanelHTML(rules||[]);
  }catch(e){
    body.innerHTML=`<div style="color:var(--red);font-size:11px">Failed to load: ${esc(e.message||String(e))}</div>`;
  }
}
function _autoTriggerLabel(t){
  return ({task_overdue_today:'Task is overdue',task_status_done:'Task marked Done',external_status:'External status matches'})[t]||t;
}
function _autoActionLabel(a){
  return ({set_my_day:'Add to My Day',add_tag:'Add tag',set_priority:'Set priority'})[a]||a;
}
function _renderAutomationsPanelHTML(rules){
  if(!rules.length)return '<div style="font-size:11px;color:var(--t3);padding:8px 0">No rules yet. Click <strong>+ New rule</strong> to create your first automation.</div>';
  return `<div style="display:flex;flex-direction:column;gap:6px">${rules.map(r=>{
    const tc=r.triggerConfig?(()=>{try{return JSON.parse(r.triggerConfig);}catch{return{};}})():{};
    const ac=r.actionConfig?(()=>{try{return JSON.parse(r.actionConfig);}catch{return{};}})():{};
    const trigDetail=r.trigger==='external_status'&&tc.statusEquals?` = "${esc(String(tc.statusEquals))}"`:'';
    const actDetail=r.action==='add_tag'&&ac.tag?` "${esc(String(ac.tag))}"`:r.action==='set_priority'&&ac.priority?` → ${esc(String(ac.priority))}`:r.action==='set_my_day'?(ac.on===false?' (remove)':''):'';
    const lastFired=r.lastFiredAt?new Date(r.lastFiredAt).toLocaleString():'Never';
    const errBadge=r.lastError?` <span style="color:var(--red);font-size:11px" title="${esc(r.lastError)}">⚠ error</span>`:'';
    return `<div style="padding:8px;background:var(--s1);border:1px solid var(--bd1);border-radius:6px;display:flex;align-items:center;gap:8px">
      <div class="tog ${r.enabled?'on':''}" onclick="_toggleAutomation(${r.id})" style="flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:600">${esc(r.name)}${errBadge}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">When <strong>${esc(_autoTriggerLabel(r.trigger))}</strong>${esc(trigDetail)} → <strong>${esc(_autoActionLabel(r.action))}</strong>${esc(actDetail)}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">Fired ${r.fireCount||0}× · Last: ${esc(lastFired)}</div>
      </div>
      <button class="btn btn-s" style="height:24px;font-size:11px" onclick="_openAutomationEditor(${r.id})">Edit</button>
      <button class="btn btn-d" style="height:24px;font-size:11px" onclick="_deleteAutomation(${r.id})">✕</button>
    </div>`;
  }).join('')}</div>`;
}
async function _toggleAutomation(id){
  const rule=(window._automationRules||[]).find(r=>r.id===id);if(!rule)return;
  const willBeOn=!rule.enabled;
  try{
    await _trpc('automations.update',{id,enabled:willBeOn},'mutation');
    await _hydrateAutomationsPanel();
    toast({type:'success',title:willBeOn?'Rule enabled':'Rule disabled',duration:1500});
  }catch(e){toast({type:'warn',title:'Toggle failed',msg:e.message||String(e)});}
}
async function _deleteAutomation(id){
  if(!confirm('Delete this rule?'))return;
  try{
    await _trpc('automations.delete',{id},'mutation');
    await _hydrateAutomationsPanel();
    toast({type:'success',title:'Rule deleted',duration:1500});
  }catch(e){toast({type:'warn',title:'Delete failed',msg:e.message||String(e)});}
}
async function _automationsRunNow(){
  try{
    toast({type:'info',title:'Running rules…',duration:1500});
    const r=await _trpc('automations.runNow',undefined,'mutation');
    toast({type:'success',title:`Ran ${r.rulesEvaluated} rule(s) — ${r.matched} matched, ${r.modified} modified`});
    await _hydrateAutomationsPanel();
  }catch(e){toast({type:'warn',title:'Run failed',msg:e.message||String(e)});}
}
function _openAutomationEditor(id){
  const existing=id?(window._automationRules||[]).find(r=>r.id===id):null;
  const tc=existing&&existing.triggerConfig?(()=>{try{return JSON.parse(existing.triggerConfig);}catch{return{};}})():{};
  const ac=existing&&existing.actionConfig?(()=>{try{return JSON.parse(existing.actionConfig);}catch{return{};}})():{};
  const trigger=existing?existing.trigger:'task_overdue_today';
  const action=existing?existing.action:'set_my_day';
  const html=`<div id="auto-editor-modal" class="modal" style="display:flex;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;align-items:center;justify-content:center;padding:16px" onclick="if(event.target===this)_closeAutomationEditor()">
    <div style="background:var(--s1);border:1px solid var(--brd);border-radius:10px;padding:16px;max-width:520px;width:100%;max-height:90vh;overflow:auto">
      <div style="display:flex;align-items:center;margin-bottom:12px">
        <h3 style="font-size:13px;font-weight:600;flex:1;margin:0">${existing?'Edit':'New'} Automation Rule</h3>
        <button class="btn btn-s" style="height:24px;font-size:11px" onclick="_closeAutomationEditor()">✕</button>
      </div>
      <div style="margin-bottom:10px">
        <div style="font-size:11px;color:var(--t2);margin-bottom:3px">Name</div>
        <input id="auto-name" class="inp" style="width:100%;font-size:11px" value="${esc(existing?existing.name:'')}" placeholder="e.g. Overdue → My Day">
      </div>
      <div style="margin-bottom:10px">
        <div style="font-size:11px;color:var(--t2);margin-bottom:3px">When (trigger)</div>
        <select id="auto-trigger" class="inp" style="width:100%;font-size:11px" onchange="_autoToggleTriggerFields()">
          <option value="task_overdue_today" ${trigger==='task_overdue_today'?'selected':''}>Native task is overdue</option>
          <option value="task_status_done" ${trigger==='task_status_done'?'selected':''}>Native task just marked Done</option>
          <option value="external_status" ${trigger==='external_status'?'selected':''}>External task status matches…</option>
        </select>
      </div>
      <div id="auto-trigger-fields" style="margin-bottom:10px;display:${trigger==='external_status'?'block':'none'}">
        <div style="font-size:11px;color:var(--t2);margin-bottom:3px">Status equals (case-insensitive)</div>
        <input id="auto-trig-status" class="inp" style="width:100%;font-size:11px" value="${esc(tc.statusEquals||'')}" placeholder="e.g. In-Progress">
      </div>
      <div style="margin-bottom:10px">
        <div style="font-size:11px;color:var(--t2);margin-bottom:3px">Then (action)</div>
        <select id="auto-action" class="inp" style="width:100%;font-size:11px" onchange="_autoToggleActionFields()">
          <option value="set_my_day" ${action==='set_my_day'?'selected':''}>Add to My Day</option>
          <option value="add_tag" ${action==='add_tag'?'selected':''}>Add tag</option>
          <option value="set_priority" ${action==='set_priority'?'selected':''}>Set priority</option>
        </select>
      </div>
      <div id="auto-action-fields" style="margin-bottom:14px"></div>
      <div style="display:flex;gap:6px;justify-content:flex-end">
        <button class="btn btn-s" style="height:28px;font-size:11px" onclick="_closeAutomationEditor()">Cancel</button>
        <button class="btn btn-p" style="height:28px;font-size:11px" onclick="_saveAutomation(${existing?existing.id:'null'})">${existing?'Save':'Create'}</button>
      </div>
    </div>
  </div>`;
  const host=document.createElement('div');host.id='auto-editor-host';host.innerHTML=html;document.body.appendChild(host);
  _autoRenderActionFields(action,ac);
}
function _autoToggleTriggerFields(){
  const t=document.getElementById('auto-trigger').value;
  document.getElementById('auto-trigger-fields').style.display=(t==='external_status'?'block':'none');
}
function _autoToggleActionFields(){
  _autoRenderActionFields(document.getElementById('auto-action').value,{});
}
function _autoRenderActionFields(action,ac){
  const box=document.getElementById('auto-action-fields');if(!box)return;
  if(action==='set_my_day'){
    box.innerHTML=`<label style="font-size:11px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="auto-act-on" ${ac.on!==false?'checked':''}> Add to My Day (uncheck to remove from My Day)</label>`;
  }else if(action==='add_tag'){
    box.innerHTML=`<div style="font-size:11px;color:var(--t2);margin-bottom:3px">Tag</div><input id="auto-act-tag" class="inp" style="width:100%;font-size:11px" value="${esc(ac.tag||'')}" placeholder="e.g. urgent">`;
  }else if(action==='set_priority'){
    box.innerHTML=`<div style="font-size:11px;color:var(--t2);margin-bottom:3px">Priority</div><select id="auto-act-priority" class="inp" style="width:100%;font-size:11px"><option value="High" ${ac.priority==='High'?'selected':''}>High</option><option value="Medium" ${ac.priority==='Medium'||!ac.priority?'selected':''}>Medium</option><option value="Low" ${ac.priority==='Low'?'selected':''}>Low</option></select>`;
  }
}
function _closeAutomationEditor(){
  const h=document.getElementById('auto-editor-host');if(h)h.remove();
}
async function _saveAutomation(id){
  const name=document.getElementById('auto-name').value.trim();
  if(!name){toast({type:'warn',title:'Name required'});return;}
  const trigger=document.getElementById('auto-trigger').value;
  const action=document.getElementById('auto-action').value;
  const triggerConfig={};
  if(trigger==='external_status'){
    const s=document.getElementById('auto-trig-status').value.trim();
    if(!s){toast({type:'warn',title:'Status value required'});return;}
    triggerConfig.statusEquals=s;
  }
  const actionConfig={};
  if(action==='set_my_day'){actionConfig.on=document.getElementById('auto-act-on').checked;}
  else if(action==='add_tag'){
    const t=document.getElementById('auto-act-tag').value.trim();
    if(!t){toast({type:'warn',title:'Tag required'});return;}
    actionConfig.tag=t;
  }else if(action==='set_priority'){actionConfig.priority=document.getElementById('auto-act-priority').value;}
  try{
    if(id){
      await _trpc('automations.update',{id,name,trigger,triggerConfig,action,actionConfig},'mutation');
    }else{
      await _trpc('automations.create',{name,trigger,triggerConfig,action,actionConfig,enabled:true},'mutation');
    }
    _closeAutomationEditor();
    await _hydrateAutomationsPanel();
    toast({type:'success',title:id?'Rule saved':'Rule created'});
  }catch(e){toast({type:'warn',title:'Save failed',msg:e.message||String(e)});}
}

async function _hydrateExternalSourcesPanel(){
  const body=document.getElementById('ext-sources-body');
  if(!body)return;
  body.innerHTML='Loading…';
  try{
    const status=await _trpc('externalSources.status',undefined,'query');
    const ssWatches=status.smartsheet.connected?await _trpc('externalSources.listSmartsheetWatches',undefined,'query'):[];
    const nfWatches=status.nifty.connected?await _trpc('externalSources.listNiftyWatches',undefined,'query'):[];
    body.innerHTML=_renderExternalSourcesPanelHTML(status,ssWatches,nfWatches);
  }catch(e){
    body.innerHTML=`<div style="color:var(--red);font-size:11px">Failed to load: ${esc(e.message||String(e))}</div>`;
  }
}

// Tombstoned archive — pulls externalTasks with `includeRemoved:true` and lists
// the rows whose override has tombstoned=true. Revive uses upsertOverride to
// clear the tombstone flag; the next puller cycle will refresh status/text.
async function _hydrateTombstoneArchive(){
  const body=document.getElementById('ext-archive-body');
  if(!body)return;
  body.innerHTML='Loading…';
  try{
    const all=await _trpc('externalSources.listExternalTasks',{includeRemoved:true},'query');
    const dead=(Array.isArray(all)?all:[]).filter(r=>r.override&&r.override.tombstoned);
    if(!dead.length){
      body.innerHTML='<div style="color:var(--t3);font-size:11px;padding:8px 0">✅ No archived rows — every external task in the index is live.</div>';
      return;
    }
    body.innerHTML=dead.map(et=>{
      const ovr=et.override||{};
      const srcLabel=et.source==='smartsheet'?'CF':'LSI';
      const srcColor=et.source==='smartsheet'?'#1f6feb':'#9333ea';
      const annot=[];
      if(ovr.localTags)annot.push('🏷 '+esc(ovr.localTags));
      if(ovr.localPriority)annot.push('★ '+esc(ovr.localPriority));
      if(ovr.localNote)annot.push('📝 note');
      if(ovr.localProjectId){const pj=(D.projects||[]).find(p=>String(p.id)===String(ovr.localProjectId));if(pj)annot.push('📁 '+esc(pj.name));}
      return `<div class="lr" style="padding:8px 0;border-bottom:1px solid var(--bd1);display:flex;align-items:center;gap:9px">
        <span style="display:inline-block;padding:2px 6px;border-radius:3px;background:${srcColor};color:#fff;font-size:11px;font-weight:600;letter-spacing:.4px">${srcLabel}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(et.title||'(no title)')}</div>
          <div style="font-size:11px;color:var(--t3);margin-top:2px">${annot.length?annot.join(' · '):'No local annotations'}${et.removedAt?' · removed '+esc(et.removedAt.slice(0,10)):''}</div>
        </div>
        <button class="btn btn-s" style="height:24px;font-size:11px" onclick="_reviveTombstoned('${_jsAttr(et.source)}','${_jsAttr(et.externalId)}')" title="Clear the tombstone so this row shows up again on next sync">↻ Revive</button>
      </div>`;
    }).join('');
  }catch(e){
    body.innerHTML=`<div style="color:var(--red);font-size:11px">Failed to load: ${esc(e.message||String(e))}</div>`;
  }
}
// Build the per-project task-count map: id → {native, external}. Reads
// client caches D.tasks + D.externalTasks (the latter already excludes
// tombstoned via the override flag).
function _autoProjectTaskCounts(){
  const counts={};
  for(const t of (D.tasks||[])){
    if(t.projectId==null)continue;
    const k=String(t.projectId);
    (counts[k]=counts[k]||{native:0,external:0}).native++;
  }
  for(const t of (D.externalTasks||[])){
    const ov=t.override;if(ov&&ov.tombstoned)continue;
    const pid=ov&&ov.localProjectId;
    if(pid==null)continue;
    const k=String(pid);
    (counts[k]=counts[k]||{native:0,external:0}).external++;
  }
  return counts;
}
// Render the auto-synced-projects maintenance panel body. Lists empties +
// no-description rows; offers bulk delete + bulk AI fill.
function _renderAutoProjectsMaint(){
  const body=document.getElementById('ext-projects-maint-body');
  if(!body)return;
  const all=(D.projects||[]).filter(p=>p&&p.autoCreatedBy);
  if(!all.length){
    body.innerHTML='<div style="color:var(--t3);font-size:11px;padding:6px 0">No auto-synced projects yet. Run a Smartsheet sync from the panel above to create some.</div>';
    return;
  }
  const counts=_autoProjectTaskCounts();
  const empties=all.filter(p=>{const c=counts[String(p.id)];return !c||(c.native===0&&c.external===0);});
  const missingDesc=all.filter(p=>!(p.desc||'').trim());
  const list=all.slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(p=>{
    const c=counts[String(p.id)]||{native:0,external:0};
    const total=c.native+c.external;
    const tag=total===0?'<span style="color:var(--red);font-weight:600">empty</span>':'<span style="color:var(--t3)">'+total+' task'+(total===1?'':'s')+'</span>';
    const descTag=(p.desc||'').trim()?'<span style="color:var(--ok);font-size:11px">📝 has description</span>':'<span style="color:var(--warn);font-size:11px">📝 no description</span>';
    return `<div class="lr" style="padding:6px 0;border-bottom:1px solid var(--bd1);display:flex;align-items:center;gap:9px;font-size:11px">
      <span style="width:6px;height:6px;border-radius:2px;background:${p.color||'#1f6feb'};flex-shrink:0"></span>
      <span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name||'(no name)')}</span>
      ${descTag}
      ${tag}
    </div>`;
  }).join('');
  // Detect orphaned auto-synced projects — those not in any program's
  // projectIds[]. Backfill button appears below when present.
  const linkedSet=new Set();
  for(const prog of (D.programs||[])){
    (prog.projectIds||[]).forEach(id=>linkedSet.add(String(id)));
  }
  const orphans=all.filter(p=>!linkedSet.has(String(p.id)));

  body.innerHTML=`
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
      <span style="font-size:11px;color:var(--t3)">${all.length} auto-synced · <strong style="color:var(--red)">${empties.length} empty</strong> · <strong style="color:var(--warn)">${missingDesc.length} without description</strong>${orphans.length?` · <strong style="color:var(--ac)">${orphans.length} not in a program</strong>`:''}</span>
      <div style="flex:1"></div>
      ${orphans.length?`<button class="btn btn-s" style="height:26px;font-size:11px;color:var(--ac);border-color:var(--ac)" onclick="_linkAutoProjectsToPrograms()" title="Push CF auto-synced projects into the CommunityForce program, LSI ones into LSI Media. Runs only on projects not already in a program.">🔗 Link ${orphans.length} to program</button>`:''}
      ${empties.length?`<button class="btn btn-d" style="height:26px;font-size:11px" onclick="_cleanupEmptyAutoProjects()" title="Delete every auto-synced project with zero linked tasks">🗑 Delete ${empties.length} empty</button>`:''}
      ${missingDesc.length?`<button class="btn btn-s" style="height:26px;font-size:11px;color:var(--purp);border-color:var(--purp)" onclick="_aiFillAutoProjectDescriptions()" title="AI-generate 2-sentence descriptions for projects that don't have one">✨ AI fill ${missingDesc.length} description${missingDesc.length===1?'':'s'}</button>`:''}
    </div>
    <div style="max-height:280px;overflow-y:auto">${list}</div>`;
}
// Backfill program links for already-created auto-synced projects.
// Smartsheet-sync → CommunityForce program, nifty-sync → LSI Media.
// Case-insensitive program name match. Idempotent: only adds projects not
// already in the target program's projectIds[].
function _linkAutoProjectsToPrograms(){
  const all=(D.projects||[]).filter(p=>p&&p.autoCreatedBy);
  if(!all.length){toast({type:'info',title:'Nothing to link.'});return;}
  const findProg=name=>(D.programs||[]).find(p=>(p.name||'').toLowerCase()===name.toLowerCase());
  const cf=findProg('CommunityForce');
  const lsi=findProg('LSI Media');
  if(!cf&&!lsi){toast({type:'warn',title:'No CommunityForce / LSI Media program found.',msg:'Create the programs first, then run this.',duration:4000});return;}
  let added=0;
  for(const p of all){
    const targetProg=p.autoCreatedBy==='nifty-sync'?lsi:cf;
    if(!targetProg)continue;
    const ids=(targetProg.projectIds=targetProg.projectIds||[]);
    if(ids.some(x=>String(x)===String(p.id)))continue;
    ids.push(p.id);
    added++;
  }
  if(added>0){
    save('programs');
    toast({type:'success',title:`✓ Linked ${added} project${added===1?'':'s'} to their program`,duration:2400});
  }else{
    toast({type:'info',title:'All auto-synced projects are already in a program.'});
  }
  _renderAutoProjectsMaint();
  if(curScreen==='programs'&&typeof renderPrograms==='function')renderPrograms();
}
function _cleanupEmptyAutoProjects(){
  const counts=_autoProjectTaskCounts();
  const all=(D.projects||[]).filter(p=>p&&p.autoCreatedBy);
  const toDelete=all.filter(p=>{const c=counts[String(p.id)];return !c||(c.native===0&&c.external===0);});
  if(!toDelete.length){toast({type:'info',title:'No empty auto-synced projects to delete.'});return;}
  if(!confirm(`Delete ${toDelete.length} empty auto-synced project${toDelete.length===1?'':'s'}? This cannot be undone.\n\n${toDelete.slice(0,8).map(p=>'• '+(p.name||'(no name)')).join('\n')}${toDelete.length>8?`\n…and ${toDelete.length-8} more`:''}`))return;
  const delIds=new Set(toDelete.map(p=>String(p.id)));
  D.projects=(D.projects||[]).filter(p=>!delIds.has(String(p.id)));
  // Also remove the deleted ids from any program's projectIds[].
  for(const prog of (D.programs||[])){
    if(Array.isArray(prog.projectIds))prog.projectIds=prog.projectIds.filter(id=>!delIds.has(String(id)));
  }
  save('projects');save('programs');
  toast({type:'success',title:`✓ Deleted ${toDelete.length} empty project${toDelete.length===1?'':'s'}`,duration:2400});
  _renderAutoProjectsMaint();
  if(curScreen==='projects'&&typeof renderProjects==='function')renderProjects();
  if(curScreen==='programs'&&typeof renderPrograms==='function')renderPrograms();
}
async function _aiFillAutoProjectDescriptions(){
  const all=(D.projects||[]).filter(p=>p&&p.autoCreatedBy&&!(p.desc||'').trim());
  if(!all.length){toast({type:'info',title:'No descriptions to fill.'});return;}
  const {provider,apiKey}=_getAIConfig?_getAIConfig():{};
  if(!apiKey&&provider!=='manus'){toast({type:'warn',title:'AI key missing',msg:'Add a provider key in Settings → AI Features.'});return;}
  if(!confirm(`Generate AI descriptions for ${all.length} project${all.length===1?'':'s'}? Costs one AI call per project.`))return;
  toast({type:'info',title:`Generating ${all.length} description${all.length===1?'':'s'}…`,duration:2500});
  const ext=(D.externalTasks||[]).filter(t=>!(t.override&&t.override.tombstoned));
  const sys=`You are writing a concise project description for a project-management dashboard. Read the project name and its task titles. Output EXACTLY one or two sentences (~30-50 words total) that describe what this project is about. Plain text only. No markdown, no quotes, no headers.`;
  let filled=0,failed=0;
  for(const p of all){
    // Gather linked task titles. Native first (D.tasks where projectId===p.id),
    // then external (override.localProjectId===p.id). Cap at 20 titles to keep
    // the prompt small.
    const taskTitles=[];
    for(const t of (D.tasks||[])){if(String(t.projectId)===String(p.id)&&t.title)taskTitles.push(t.title);if(taskTitles.length>=20)break;}
    for(const t of ext){if(taskTitles.length>=20)break;const pid=t.override&&t.override.localProjectId;if(String(pid)===String(p.id)&&t.title)taskTitles.push(t.title);}
    if(!taskTitles.length){failed++;continue;}
    const userContent=`Project name: ${p.name}\n\nTask titles in this project:\n${taskTitles.map(t=>'- '+t).join('\n')}`;
    try{
      const res=await _trpc('ai.assist',{systemPrompt:sys,userContent,provider:provider||'manus',apiKey:apiKey||undefined},'mutation');
      const text=String(res?.result||res?.text||'').trim().replace(/^["']|["']$/g,'').replace(/\n+/g,' ').slice(0,400);
      if(text){
        p.desc=text;
        // descriptionHtml is the field the read-only renderer prefers; clear it
        // so the markdown text we just wrote is used instead of any stale html.
        if(p.descriptionHtml)p.descriptionHtml='';
        filled++;
      }else failed++;
    }catch(e){
      console.warn('[ai-fill] project',p.id,'failed:',e&&e.message);
      failed++;
    }
  }
  save('projects');
  toast({type:filled>0?'success':'warn',title:`✓ ${filled} description${filled===1?'':'s'} written${failed?` · ${failed} skipped`:''}`,duration:3500});
  _renderAutoProjectsMaint();
  if(curScreen==='projects'&&typeof renderProjects==='function')renderProjects();
}

async function _reviveTombstoned(source,externalId){
  if(!confirm('Revive this row? The next external sync will refresh its source-side status; if the row is still gone in the source, it will be re-tombstoned within 72h.'))return;
  try{
    await _trpc('externalSources.upsertOverride',{source,externalId,patch:{tombstoned:false}},'mutation');
    toast({type:'success',title:'Revived — next sync will refresh it.',duration:2400});
    await loadExternalTasks();
    _hydrateTombstoneArchive();
  }catch(e){toast({type:'warn',title:'Revive failed',msg:e.message||String(e)});}
}

function _renderExternalSourcesPanelHTML(status,ssWatches,nfWatches){
  return `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
    ${_renderSmartsheetCard(status.smartsheet,ssWatches)}
    ${_renderNiftyCard(status.nifty,nfWatches)}
  </div>`;
}

function _renderSmartsheetCard(s,watches){
  const connected=!!s.connected;
  return `
  <div style="background:var(--s3);border:1px solid var(--bd1);border-radius:6px;padding:10px">
    <div style="font-size:12px;font-weight:600;margin-bottom:4px">📊 Smartsheet (CF)</div>
    ${connected
      ?`<div style="font-size:11px;color:var(--ok);margin-bottom:6px">✓ ${esc(s.accountDisplayName||s.accountEmail||'Connected')} · ${s.watchCount} watched</div>`
      :`<div style="font-size:11px;color:var(--t3);margin-bottom:6px">Not connected — <a href="https://app.smartsheet.com/b/personalsettings" target="_blank" style="color:var(--ac)">get an API token</a></div>`}
    <div style="display:flex;gap:6px;margin-bottom:6px">
      <input id="ext-token-smartsheet" class="inp" type="password" placeholder="${connected?'(token saved — paste to replace)':'Paste API token'}" style="flex:1;font-size:11px;height:26px">
      <button class="btn btn-p" style="height:26px;font-size:11px" onclick="_extSetToken('smartsheet')">${connected?'Update':'Connect'}</button>
      ${connected?`<button class="btn btn-d" style="height:26px;font-size:11px" onclick="_extDisconnect('smartsheet')" title="Removes token, watches, and pulled tasks">✕</button>`:''}
    </div>
    ${connected?_renderWatchList('smartsheet',watches):''}
    ${connected?`<button class="btn btn-s" style="height:24px;font-size:11px;margin-top:4px" onclick="_extOpenAddWatch('smartsheet')">+ Watch a sheet</button>`:''}
  </div>`;
}

// Nifty has THREE possible UI states because it's OAuth, not PAT:
//   (a) no app configured       → show Client ID + Secret form
//   (b) app saved, not connected → show "Connect to NiftyPM" (kicks OAuth)
//   (c) fully connected          → normal watch list + add-project flow
function _renderNiftyCard(s,watches){
  const connected=!!s.connected;
  const appConfigured=!!s.oauthAppConfigured;
  let body;
  if(connected){
    body=`<div style="font-size:11px;color:var(--ok);margin-bottom:6px">✓ ${esc(s.accountDisplayName||s.accountEmail||'Connected')} · ${s.watchCount} watched</div>
      <div style="display:flex;gap:6px;margin-bottom:6px">
        <button class="btn btn-p" style="height:26px;font-size:11px" onclick="_extConnectNifty()" title="Re-authorize (e.g. if scope changed)">↻ Reconnect</button>
        <button class="btn btn-d" style="height:26px;font-size:11px" onclick="_extDisconnect('nifty')" title="Removes credentials, watches, and pulled tasks">✕</button>
      </div>
      ${_renderWatchList('nifty',watches)}
      <button class="btn btn-s" style="height:24px;font-size:11px;margin-top:4px" onclick="_extOpenAddWatch('nifty')">+ Watch a project</button>`;
  }else if(appConfigured){
    body=`<div style="font-size:11px;color:var(--warn);margin-bottom:6px">App saved · click <strong>Connect</strong> to authorize</div>
      <div style="display:flex;gap:6px;margin-bottom:6px">
        <button class="btn btn-p" style="height:26px;font-size:11px" onclick="_extConnectNifty()">🔗 Connect to NiftyPM</button>
        <button class="btn" style="height:26px;font-size:11px" onclick="_extEditNiftyApp()" title="Edit Client ID / Secret">Edit app</button>
        <button class="btn btn-d" style="height:26px;font-size:11px" onclick="_extDisconnect('nifty')">✕</button>
      </div>`;
  }else{
    body=`<div style="font-size:11px;color:var(--t3);margin-bottom:6px">Not connected — create an app at <a href="https://nifty.pm/integrations/apps" target="_blank" style="color:var(--ac)">Nifty → Integrations → Apps</a> (use redirect URL <code style="background:var(--s2);padding:1px 4px;border-radius:3px;font-size:11px">${window.location.origin}/api/oauth/nifty/callback</code>)</div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px">
        <input id="ext-nifty-client-id" class="inp" placeholder="Client ID" style="font-size:11px;height:26px">
        <input id="ext-nifty-client-secret" class="inp" type="password" placeholder="Client Secret" style="font-size:11px;height:26px">
        <button class="btn btn-p" style="height:26px;font-size:11px" onclick="_extSaveNiftyApp()">Save & Connect</button>
      </div>`;
  }
  return `
  <div style="background:var(--s3);border:1px solid var(--bd1);border-radius:6px;padding:10px">
    <div style="font-size:12px;font-weight:600;margin-bottom:4px">💜 NiftyPM (LSI)</div>
    ${body}
  </div>`;
}

async function _extSaveNiftyApp(){
  const cid=document.getElementById('ext-nifty-client-id').value.trim();
  const cs=document.getElementById('ext-nifty-client-secret').value.trim();
  if(!cid||!cs){toast({type:'warn',title:'Both Client ID and Secret are required'});return;}
  try{
    await _trpc('externalSources.saveNiftyOAuthApp',{clientId:cid,clientSecret:cs},'mutation');
    toast({type:'success',title:'App saved — opening Nifty authorization…'});
    await _extConnectNifty();
  }catch(e){toast({type:'warn',title:'Save failed',msg:e.message||String(e)});}
}

async function _extEditNiftyApp(){
  // Surface the saved-app state by transitioning the card back to "no app"
  // visually (the user can re-enter creds). The existing row is upserted.
  try{
    await _trpc('externalSources.disconnect',{source:'nifty'},'mutation');
    await _hydrateExternalSourcesPanel();
  }catch(e){toast({type:'warn',title:'Could not reset',msg:e.message||String(e)});}
}

async function _extConnectNifty(){
  try{
    const res=await _trpc('externalSources.getNiftyAuthUrl',{origin:window.location.origin},'query');
    // Open in the same tab so the OAuth callback redirect lands back at our app.
    window.location.href=res.authUrl;
  }catch(e){toast({type:'warn',title:'Could not start Nifty OAuth',msg:e.message||String(e)});}
}

function _renderWatchList(source,watches){
  if(!watches.length){
    return `<div style="font-size:11px;color:var(--t3);padding:6px 0">No ${source==='smartsheet'?'sheets':'projects'} watched yet.</div>`;
  }
  // Surface error vs healthy with a coloured left-stripe; show how stale the
  // last pull is so users notice when the cron has stopped firing for a row.
  const now=Date.now();
  const fmtAge=ms=>{const m=Math.floor(ms/60000);if(m<2)return 'just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';return Math.floor(h/24)+'d ago';};
  return `<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">${watches.map(w=>{
    const hasErr=!!w.lastError;
    const stripe=hasErr?'var(--red)':(w.lastPulledAt?'var(--ok)':'var(--warn)');
    const lastPullAge=w.lastPulledAt?fmtAge(now-new Date(w.lastPulledAt).getTime()):'never pulled';
    const lastPullAbs=w.lastPulledAt?new Date(w.lastPulledAt).toLocaleString():'never';
    const pill=hasErr
      ?`<span title="${esc(w.lastError).slice(0,400)}" style="font-size:11px;padding:1px 5px;border-radius:3px;background:rgba(239,68,68,.18);color:var(--red);font-weight:600;flex-shrink:0;cursor:help">⚠ error · hover for details</span>`
      :(w.lastPulledAt
        ?`<span title="Last pull: ${lastPullAbs}" style="font-size:11px;padding:1px 5px;border-radius:3px;background:rgba(34,197,94,.18);color:var(--ok);font-weight:600;flex-shrink:0">✓ ${lastPullAge}</span>`
        :`<span style="font-size:11px;padding:1px 5px;border-radius:3px;background:rgba(245,158,11,.18);color:var(--warn);font-weight:600;flex-shrink:0">pending first pull</span>`);
    const label=w.label||(source==='smartsheet'?w.sheetId:w.projectId);
    const matchSummary=source==='smartsheet'?`${esc(w.ownerColumn)} ${w.matchMode} "${esc(w.ownerMatchValue)}"`:`${w.filterByAssignee?'My tasks only':'All tasks'}`;
    const removeFn=source==='smartsheet'?'_extRemoveSmartsheetWatch':'_extRemoveNiftyWatch';
    // For Nifty watches, show a "Sync subtasks" toggle row underneath
    // the match summary so the user can flip noise reduction without
    // editing JSON in the console.
    const subtaskToggle=source==='nifty'?`<label style="display:flex;align-items:center;gap:4px;color:var(--t3);font-size:11px;margin-top:2px;cursor:pointer" title="When OFF, subtasks (Nifty rows whose 'task' parent is set) are dropped at pull time — useful when subtasks duplicate parent titles and clutter the Tasks page.">
      <input type="checkbox" ${(w.includeSubtasks!==0)?'checked':''} onchange="_extToggleNiftySubtasks(${w.id},this.checked)" style="margin:0">
      Sync subtasks
    </label>`:'';
    return `<div style="display:flex;align-items:center;gap:6px;padding:5px 6px;background:var(--s2);border-left:3px solid ${stripe};border-radius:4px;font-size:11px">
      <div style="flex:1;overflow:hidden">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:1px">
          <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label)}</span>
          ${pill}
        </div>
        <div style="color:var(--t3);font-size:11px">${matchSummary}</div>
        ${subtaskToggle}
      </div>
      <button class="btn btn-s" style="height:20px;font-size:10px;padding:0 5px" onclick="${removeFn}(${w.id})" title="Remove">✕</button>
    </div>`;
  }).join('')}</div>`;
}

// Flip the per-watch "Sync subtasks" toggle. When OFF the next pull
// drops subtask rows; existing tracked subtasks get stamped removedAt
// by the vanish logic and disappear from the Tasks view.
async function _extToggleNiftySubtasks(watchId,includeSubtasks){
  try{
    await _trpc('externalSources.updateNiftyWatch',{id:watchId,includeSubtasks},'mutation');
    toast({type:'info',title:`Subtask sync ${includeSubtasks?'ON':'OFF'} — running pull now…`,duration:1500});
    await refreshExternalTasksNow();
    await _hydrateExternalSourcesPanel();
  }catch(e){
    toast({type:'warn',title:'Update failed',msg:e.message||String(e)});
  }
}

async function _extSetToken(source){
  const inp=document.getElementById(`ext-token-${source}`);
  if(!inp||!inp.value.trim()){toast({type:'warn',title:'Paste an API token first'});return;}
  try{
    const res=await _trpc('externalSources.setToken',{source,apiToken:inp.value.trim()},'mutation');
    inp.value='';
    toast({type:'success',title:`Connected as ${res.account.name||res.account.email}`});
    await _hydrateExternalSourcesPanel();
  }catch(e){toast({type:'warn',title:'Connect failed',msg:e.message||String(e)});}
}

async function _extDisconnect(source){
  if(!confirm(`Disconnect ${source}? This removes the token, all watches, and all pulled tasks for this source. Local overrides (notes/priorities) are preserved.`))return;
  try{
    await _trpc('externalSources.disconnect',{source},'mutation');
    toast({type:'success',title:`Disconnected ${source}`});
    await _hydrateExternalSourcesPanel();
    await loadExternalTasks();
  }catch(e){toast({type:'warn',title:'Disconnect failed',msg:e.message||String(e)});}
}

async function _extRemoveSmartsheetWatch(id){
  if(!confirm('Stop watching this sheet?'))return;
  try{
    await _trpc('externalSources.removeSmartsheetWatch',{id},'mutation');
    await _hydrateExternalSourcesPanel();
    await loadExternalTasks();
  }catch(e){toast({type:'warn',title:'Remove failed',msg:e.message||String(e)});}
}

async function _extRemoveNiftyWatch(id){
  if(!confirm('Stop watching this project?'))return;
  try{
    await _trpc('externalSources.removeNiftyWatch',{id},'mutation');
    await _hydrateExternalSourcesPanel();
    await loadExternalTasks();
  }catch(e){toast({type:'warn',title:'Remove failed',msg:e.message||String(e)});}
}

async function _extOpenAddWatch(source){
  const modalBg=document.getElementById('modal-capture');
  const modal=document.getElementById('modal-content');
  if(!modalBg||!modal){toast({type:'warn',title:'Modal not available'});return;}
  modal.innerHTML='<div style="padding:14px"><div style="font-size:13px;font-weight:600;margin-bottom:8px">Loading available '+(source==='smartsheet'?'sheets':'projects')+'…</div></div>';
  modalBg.classList.add('show');
  try{
    if(source==='smartsheet'){
      const sheets=await _trpc('externalSources.listSmartsheetSheets',undefined,'query');
      modal.innerHTML=_renderAddSmartsheetWatchModal(sheets);
    }else{
      const projects=await _trpc('externalSources.listNiftyProjects',undefined,'query');
      modal.innerHTML=_renderAddNiftyWatchModal(projects);
    }
  }catch(e){
    modal.innerHTML=`<div style="padding:14px"><div style="color:var(--red);font-size:11px">Failed: ${esc(e.message||String(e))}</div><button class="btn" onclick="closeModal()" style="margin-top:8px">Close</button></div>`;
  }
}

function _renderAddSmartsheetWatchModal(sheets){
  return `<div style="padding:14px;max-width:520px">
    <div style="font-size:13px;font-weight:600;margin-bottom:10px">Watch a Smartsheet</div>
    <div style="font-size:11px;color:var(--t2);margin-bottom:6px">Sheet</div>
    <select id="ext-ss-sheet" class="inp" style="width:100%;font-size:11px;margin-bottom:8px" onchange="_extOnSheetPicked(this.value)">
      <option value="">Pick a sheet…</option>
      ${sheets.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}
    </select>
    <div id="ext-ss-cols-wrap" style="display:none">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <div style="font-size:11px;color:var(--t2);margin-bottom:4px">Owner column</div>
          <select id="ext-ss-owner-col" class="inp" style="width:100%;font-size:11px"></select>
        </div>
        <div>
          <div style="font-size:11px;color:var(--t2);margin-bottom:4px">Match mode</div>
          <select id="ext-ss-match-mode" class="inp" style="width:100%;font-size:11px">
            <option value="contains">Contains (e.g. "Idris + Ayesha")</option>
            <option value="exact">Exact</option>
            <option value="contact">Contact-list cell (your email)</option>
          </select>
        </div>
      </div>
      <div style="margin-top:8px">
        <div style="font-size:11px;color:var(--t2);margin-bottom:4px">Match value (the name/email to look for)</div>
        <input id="ext-ss-match-value" class="inp" style="width:100%;font-size:11px" placeholder="Idris" value="${esc((D.creds&&D.creds.userName||'').split(' ')[0]||'')}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
        <div>
          <div style="font-size:11px;color:var(--t2);margin-bottom:4px">Status column (optional)</div>
          <select id="ext-ss-status-col" class="inp" style="width:100%;font-size:11px"></select>
        </div>
        <div>
          <div style="font-size:11px;color:var(--t2);margin-bottom:4px">Due column (optional)</div>
          <select id="ext-ss-due-col" class="inp" style="width:100%;font-size:11px"></select>
        </div>
      </div>
      <div style="margin-top:8px">
        <div style="font-size:11px;color:var(--t2);margin-bottom:4px">Friendly label</div>
        <input id="ext-ss-label" class="inp" style="width:100%;font-size:11px" placeholder="CF: 120-Day Plan">
      </div>
      <div style="margin-top:8px">
        <div style="font-size:11px;color:var(--t2);margin-bottom:4px">Exclude these statuses (comma-separated, leave blank to pull everything including Closed)</div>
        <input id="ext-ss-exclude" class="inp" style="width:100%;font-size:11px" placeholder="(blank — pull all, completion syncs via completedAt)">
      </div>
      <div style="margin-top:8px;padding:8px;background:var(--s2);border-radius:6px;border:1px solid var(--bd1)">
        <div style="font-size:11px;font-weight:600;margin-bottom:4px">${_icon('folder',13,'currentColor')} Mirror as LevelUp project</div>
        <div style="font-size:11px;color:var(--t3);margin-bottom:6px">Auto-link every row pulled from this sheet to a LevelUp project so it appears on the Projects page + roll-ups.</div>
        <select id="ext-ss-project" class="inp" style="width:100%;font-size:11px">
          <option value="__new__">+ Create new project from this sheet</option>
          <option value="">(don't mirror — pull tasks only)</option>
          ${(D.projects||[]).map(p=>`<option value="${p.id}">→ Link to existing: ${esc(p.name)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:12px">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-p" onclick="_extSubmitSmartsheetWatch()">Save & Refresh</button>
    </div>
  </div>`;
}

async function _extOnSheetPicked(sheetId){
  const wrap=document.getElementById('ext-ss-cols-wrap');
  if(!sheetId){wrap.style.display='none';return;}
  wrap.style.display='';
  try{
    const cols=await _trpc('externalSources.fetchSheetColumns',{sheetId},'query');
    const ownerSel=document.getElementById('ext-ss-owner-col');
    const statusSel=document.getElementById('ext-ss-status-col');
    const dueSel=document.getElementById('ext-ss-due-col');
    const opts=cols.map(c=>`<option value="${esc(c.title)}">${esc(c.title)}${c.primary?' (primary)':''} · ${esc(c.type)}</option>`).join('');
    const guessOwner=cols.find(c=>/owner|assignee|ao|assigned/i.test(c.title));
    const guessStatus=cols.find(c=>/status|state/i.test(c.title));
    const guessDue=cols.find(c=>/due|end\s*date|deadline/i.test(c.title));
    ownerSel.innerHTML=opts;if(guessOwner)ownerSel.value=guessOwner.title;
    statusSel.innerHTML='<option value="">(none)</option>'+opts;if(guessStatus)statusSel.value=guessStatus.title;
    dueSel.innerHTML='<option value="">(none)</option>'+opts;if(guessDue)dueSel.value=guessDue.title;
  }catch(e){toast({type:'warn',title:'Could not load columns',msg:e.message||String(e)});}
}

async function _extSubmitSmartsheetWatch(){
  const sheetId=document.getElementById('ext-ss-sheet').value;
  if(!sheetId){toast({type:'warn',title:'Pick a sheet first'});return;}
  const ownerColumn=document.getElementById('ext-ss-owner-col').value;
  const ownerMatchValue=document.getElementById('ext-ss-match-value').value.trim();
  if(!ownerColumn||!ownerMatchValue){toast({type:'warn',title:'Owner column + match value are required'});return;}
  const label=document.getElementById('ext-ss-label').value.trim()||undefined;
  // Resolve "Mirror as project" choice. "__new__" creates a fresh LevelUp
  // project from the sheet's friendly label. Other values: empty (skip
  // mirroring) or an existing project id.
  let defaultProjectId=null;
  const projChoice=document.getElementById('ext-ss-project').value;
  if(projChoice==='__new__'){
    const newId=Date.now();
    D.projects=D.projects||[];
    D.projects.push({id:newId,name:label||'(unnamed sheet)',icon:'📊',color:'#1f6feb',status:'Active',owner:(D.creds&&D.creds.userName)||'Idris Grant',desc:'Mirrored from Smartsheet · '+(label||''),createdAt:new Date().toISOString()});
    save('projects');
    defaultProjectId=String(newId);
  } else if(projChoice){
    defaultProjectId=String(projChoice);
  }
  try{
    await _trpc('externalSources.addSmartsheetWatch',{
      sheetId,
      label,
      ownerColumn,
      ownerMatchValue,
      matchMode:document.getElementById('ext-ss-match-mode').value,
      statusColumn:document.getElementById('ext-ss-status-col').value||undefined,
      dueColumn:document.getElementById('ext-ss-due-col').value||undefined,
      excludeDoneStatuses:document.getElementById('ext-ss-exclude').value||undefined,
      defaultProjectId:defaultProjectId||undefined,
    },'mutation');
    closeModal();
    toast({type:'success',title:defaultProjectId?'Sheet added + mirrored as project · pulling now…':'Sheet added — pulling now…'});
    await refreshExternalTasksNow();
    await _hydrateExternalSourcesPanel();
  }catch(e){toast({type:'warn',title:'Save failed',msg:e.message||String(e)});}
}

// Re-add the two standard CommunityForce watched sheets in one click. Used
// when a "reconnect Smartsheet" wiped existing watches — the user shouldn't
// have to re-key sheet IDs and column choices from memory.
async function _readdCfWatches(){
  const ownerName=(D.creds&&D.creds.userName)||'Idris Grant';
  const presets=[
    {sheetId:'7278463428808580',label:'CF — 120-Day Plan',ownerColumn:'PM',ownerMatchValue:ownerName,matchMode:'contains',statusColumn:'Status',dueColumn:'Due'},
    {sheetId:'1841858691596164',label:'CF — Pipeline 2026/2027',ownerColumn:'PM',ownerMatchValue:ownerName,matchMode:'contains',statusColumn:'Status',dueColumn:'Exp Close Date'},
  ];
  if(!confirm('Re-add the two standard CommunityForce watched sheets ('+presets.map(p=>p.label).join(', ')+')?\n\nThis is safe to run if some already exist — duplicates are ignored.')) return;
  let okCount=0, errs=[];
  for(const p of presets){
    try{
      await _trpc('externalSources.addSmartsheetWatch',p,'mutation');
      okCount++;
    }catch(e){
      // Duplicate-sheet errors are expected & harmless — treat them as success.
      const msg=String(e&&e.message||e);
      if(/duplicate|already|exists/i.test(msg)){ okCount++; }
      else errs.push(p.label+': '+msg);
    }
  }
  if(errs.length){
    toast({type:'warn',title:`Re-added ${okCount}/${presets.length} · ${errs.length} failed`,msg:errs.join(' · ')});
  } else {
    toast({type:'success',title:`✅ Re-added ${okCount} CF watches — pulling now…`});
  }
  try{ await refreshExternalTasksNow(); }catch(_){}
  await _hydrateExternalSourcesPanel();
}

// Nuclear reset: stamp removedAt on every Nifty row, then re-pull. The
// puller's historical-completion filter only re-adds currently-open
// Nifty tasks. Historical completions stay hidden permanently. Use when
// previously-completed Nifty tasks linger as Open in the LevelUp Tasks
// list because the puller never had a reason to vanish them.
async function _niftyResetAndResync(){
  if(!confirm("Reset all Nifty rows in LevelUp and re-pull?\n\n• Every Nifty row will be marked hidden\n• Then a fresh pull runs immediately\n• Only currently-open Nifty tasks come back\n• Anything completed prior to today stays hidden\n• Local notes/links survive (preserved as tombstones if not re-pulled)\n\nProceed?")) return;
  toast({type:'info',title:'Resetting Nifty rows + re-pulling…',duration:3000});
  try{
    const res=await _trpc('externalSources.niftyResetAndResync',{},'mutation');
    toast({type:'success',title:`✅ Nifty reset complete`,msg:`Hidden ${res.stampedAtStart} stale row(s) · re-added ${res.visibleAfterPull} currently-open · ${res.stillHiddenAfterPull} stayed hidden (historical or no longer in Nifty)`});
    try{ await loadExternalTasks(); }catch(_){}
    await _hydrateExternalSourcesPanel();
    try{ renderScreen('tasks'); }catch(_){}
  }catch(e){
    toast({type:'warn',title:'Reset failed',msg:e.message||String(e)});
  }
}

// Inspect: dump LevelUp + Nifty state for each Nifty external_tasks row so
// we can see why the historical-completion filter isn't catching tasks the
// user remembers completing. The columns to watch:
//   - nifty_completed:    boolean (true => puller WILL drop)
//   - nifty_completed_at: ISO string (set + < today => puller WILL drop)
//   - nifty_archived:     boolean (treated as done if no completed_at)
//   - nifty_status_name + nifty_task_group: what status the user sees in Nifty
// If nifty_completed=false AND nifty_completed_at is null AND nifty_archived
// is false AND status_name is some custom done-ish value ("Reviewed",
// "Shipped"), we need to broaden the filter to include that status name.
async function _niftyInspectRows(){
  toast({type:'info',title:'Loading Nifty rows…',duration:1500});
  try{
    const q=(prompt('Filter by title (leave blank for first 30 rows):','')||'').trim();
    const rows=await _trpc('externalSources.niftyInspectRows',{titleQuery:q||undefined,limit:50},'query');
    if(!rows||!rows.length){
      toast({type:'info',title:'No matching Nifty rows in LevelUp'});
      return;
    }
    const fmt=(v)=>{if(v==null)return '<span style="color:var(--t3)">null</span>';if(v===true)return '<span style="color:#16a34a;font-weight:600">true</span>';if(v===false)return '<span style="color:#ef4444">false</span>';return esc(String(v));};
    // Stash rows on window so per-row buttons can access them without
    // re-serializing into onclick attributes (which breaks on quotes in raw).
    window._niftyInspectRows=rows;
    const ids=rows.map(r=>r.id).join(',');
    const html=`<div style="max-width:1200px;padding:14px;max-height:90vh;overflow:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;flex-wrap:wrap">
        <div style="font-size:14px;font-weight:600">🔎 Nifty rows — LevelUp vs Nifty state${q?` · matching "${esc(q)}"`:''}</div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-s" style="font-size:11px;background:#7c2d12;color:#fff;border-color:#5b2010" onclick="_niftyHideAllShown([${ids}])">🗑 Hide all ${rows.length} shown</button>
          <button class="btn btn-s" style="font-size:11px" onclick="document.getElementById('nifty-inspect-ov')?.remove()">Close</button>
        </div>
      </div>
      <p style="font-size:11px;color:var(--t3);margin-bottom:10px">Showing ${rows.length} row(s). Click <strong>Raw</strong> to view the full JSON Nifty returned for that task. Click <strong>Hide</strong> to mark that row removed in LevelUp immediately. Use <strong>Hide all shown</strong> for a bulk cleanup.</p>
      <div style="overflow-x:auto;font-size:11px;line-height:1.5">
        <table style="border-collapse:collapse;width:100%;font-family:ui-monospace,Menlo,Consolas,monospace">
          <thead><tr style="background:var(--s3);text-align:left">
            <th style="padding:6px;border-bottom:1px solid var(--bd2)">Title</th>
            <th style="padding:6px;border-bottom:1px solid var(--bd2)">LU status</th>
            <th style="padding:6px;border-bottom:1px solid var(--bd2)">Nifty completed</th>
            <th style="padding:6px;border-bottom:1px solid var(--bd2)">Nifty completed_at</th>
            <th style="padding:6px;border-bottom:1px solid var(--bd2)">archived</th>
            <th style="padding:6px;border-bottom:1px solid var(--bd2)">status.name</th>
            <th style="padding:6px;border-bottom:1px solid var(--bd2)">status.category</th>
            <th style="padding:6px;border-bottom:1px solid var(--bd2)">task_group</th>
            <th style="padding:6px;border-bottom:1px solid var(--bd2)">task_group_id</th>
            <th style="padding:6px;border-bottom:1px solid var(--bd2)">Actions</th>
          </tr></thead>
          <tbody>${rows.map((r,i)=>`<tr id="nir-${r.id}" style="border-bottom:1px solid var(--bd1)">
            <td style="padding:6px;max-width:240px;word-wrap:break-word"><a href="${esc(r.nifty_url||'#')}" target="_blank" style="color:var(--ac)">${esc(r.title||'(untitled)')}</a></td>
            <td style="padding:6px">${fmt(r.levelup_status)}</td>
            <td style="padding:6px">${fmt(r.nifty_completed)}</td>
            <td style="padding:6px">${fmt(r.nifty_completed_at)}</td>
            <td style="padding:6px">${fmt(r.nifty_archived)}</td>
            <td style="padding:6px">${fmt(r.nifty_status_name)}</td>
            <td style="padding:6px">${fmt(r.nifty_status_category)}</td>
            <td style="padding:6px">${fmt(r.nifty_task_group)}</td>
            <td style="padding:6px;max-width:120px;overflow:hidden;text-overflow:ellipsis">${fmt(r.nifty_task_group_id)}</td>
            <td style="padding:6px;white-space:nowrap">
              <button class="btn btn-s" style="font-size:11px;padding:2px 6px" onclick="_niftyShowRaw(${i})">Raw</button>
              <button class="btn btn-s" style="font-size:11px;padding:2px 6px;background:#7c2d12;color:#fff;border-color:#5b2010" onclick="_niftyHideRow(${r.id})">Hide</button>
            </td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
    // Use a simple fixed overlay instead of the capture modal (which is
    // specialized for new-item capture and doesn't accept arbitrary HTML).
    document.getElementById('nifty-inspect-ov')?.remove();
    const ov=document.createElement('div');
    ov.id='nifty-inspect-ov';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.onclick=(e)=>{ if(e.target===ov) ov.remove(); };
    const inner=document.createElement('div');
    inner.style.cssText='background:var(--s1);color:var(--t1);border:1px solid var(--bd2);border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,0.5);max-width:95vw;max-height:90vh;overflow:hidden';
    inner.innerHTML=html;
    ov.appendChild(inner);
    document.body.appendChild(ov);
  }catch(e){
    toast({type:'warn',title:'Inspect failed',msg:e.message||String(e)});
  }
}

// Show the full raw JSON Nifty returned for one inspect row. Lets us see
// fields the adapter doesn't currently read (custom workflow states,
// non-standard completion signals, etc).
function _niftyShowRaw(idx){
  const r=(window._niftyInspectRows||[])[idx];
  if(!r){toast({type:'warn',title:'Row not found in cache'});return;}
  let pretty=r.raw_json||'';
  try{ pretty=JSON.stringify(JSON.parse(pretty),null,2); }catch(_){}
  const ta=document.createElement('div');
  ta.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:10001;display:flex;align-items:center;justify-content:center;padding:30px';
  ta.onclick=(e)=>{ if(e.target===ta) ta.remove(); };
  ta.innerHTML=`<div style="background:var(--s1);color:var(--t1);border:1px solid var(--bd2);border-radius:10px;padding:14px;max-width:90vw;max-height:85vh;display:flex;flex-direction:column;gap:8px">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:13px;font-weight:600">Raw Nifty JSON — ${esc(r.title||'(untitled)')}</div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-s" style="font-size:11px" onclick="navigator.clipboard.writeText(this.parentElement.parentElement.nextElementSibling.textContent).then(()=>this.textContent='✅ Copied')">📋 Copy</button>
        <button class="btn btn-s" style="font-size:11px" onclick="this.closest('div[style*=fixed]').remove()">Close</button>
      </div>
    </div>
    <pre style="background:var(--s2);border:1px solid var(--bd1);border-radius:6px;padding:10px;font-size:11px;line-height:1.5;overflow:auto;max-height:70vh;white-space:pre-wrap;word-wrap:break-word;font-family:ui-monospace,Menlo,Consolas,monospace">${esc(pretty)}</pre>
  </div>`;
  document.body.appendChild(ta);
}

// Hide one Nifty row immediately (stamp removedAt). The row vanishes from
// the Tasks page and the inspect table.
async function _niftyHideRow(id){
  try{
    const res=await _trpc('externalSources.niftyHideRows',{ids:[id]},'mutation');
    document.getElementById('nir-'+id)?.remove();
    toast({type:'success',title:`Hidden ${res.hidden} row`});
    try{ await loadExternalTasks(); }catch(_){}
  }catch(e){
    toast({type:'warn',title:'Hide failed',msg:e.message||String(e)});
  }
}

// Bulk-hide every row currently shown in the inspect modal. Confirms first.
async function _niftyHideAllShown(ids){
  if(!ids.length){toast({type:'info',title:'Nothing to hide'});return;}
  if(!confirm(`Hide all ${ids.length} Nifty rows shown?\n\nThey'll be marked removed in LevelUp and disappear from the Tasks page. Local notes/links survive (tombstoned after 72h if not re-pulled).\n\nProceed?`)) return;
  try{
    const res=await _trpc('externalSources.niftyHideRows',{ids},'mutation');
    toast({type:'success',title:`✅ Hidden ${res.hidden} row(s)`});
    document.getElementById('nifty-inspect-ov')?.remove();
    try{ await loadExternalTasks(); }catch(_){}
    try{ renderScreen('tasks'); }catch(_){}
  }catch(e){
    toast({type:'warn',title:'Bulk hide failed',msg:e.message||String(e)});
  }
}

function _renderAddNiftyWatchModal(projects){
  return `<div style="padding:14px;max-width:480px">
    <div style="font-size:13px;font-weight:600;margin-bottom:10px">Watch a NiftyPM project</div>
    <div style="font-size:11px;color:var(--t2);margin-bottom:4px">Project</div>
    <select id="ext-nf-project" class="inp" style="width:100%;font-size:11px;margin-bottom:8px">
      <option value="">Pick a project…</option>
      ${projects.map(p=>`<option value="${esc(p.id)}" data-name="${esc(p.name)}">${esc(p.name)}</option>`).join('')}
    </select>
    <div style="font-size:11px;color:var(--t2);margin-bottom:4px">Friendly label</div>
    <input id="ext-nf-label" class="inp" style="width:100%;font-size:11px;margin-bottom:8px" placeholder="LSI: Q3 Launch">
    <label style="display:flex;align-items:center;gap:8px;font-size:11px;margin-bottom:8px"><input id="ext-nf-mine-only" type="checkbox" checked> Only tasks assigned to me</label>
    <div style="margin-top:8px;padding:8px;background:var(--s2);border-radius:6px;border:1px solid var(--bd1)">
      <div style="font-size:11px;font-weight:600;margin-bottom:4px">${_icon('folder',13,'currentColor')} Mirror as LevelUp project</div>
      <div style="font-size:11px;color:var(--t3);margin-bottom:6px">Auto-link every Nifty task pulled to a LevelUp project.</div>
      <select id="ext-nf-project-map" class="inp" style="width:100%;font-size:11px">
        <option value="__new__">+ Create new project from this Nifty project</option>
        <option value="">(don't mirror — pull tasks only)</option>
        ${(D.projects||[]).map(p=>`<option value="${p.id}">→ Link to existing: ${esc(p.name)}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:12px">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-p" onclick="_extSubmitNiftyWatch()">Save & Refresh</button>
    </div>
  </div>`;
}

async function _extSubmitNiftyWatch(){
  const sel=document.getElementById('ext-nf-project');
  const projectId=sel.value;
  if(!projectId){toast({type:'warn',title:'Pick a project first'});return;}
  const label=document.getElementById('ext-nf-label').value.trim()||sel.options[sel.selectedIndex].dataset.name||undefined;
  const filterByAssignee=document.getElementById('ext-nf-mine-only').checked;
  // Mirror choice
  let defaultProjectId=null;
  const projChoice=document.getElementById('ext-nf-project-map').value;
  if(projChoice==='__new__'){
    const newId=Date.now();
    D.projects=D.projects||[];
    D.projects.push({id:newId,name:label||'(unnamed Nifty project)',icon:'💜',color:'#9333ea',status:'Active',owner:(D.creds&&D.creds.userName)||'Idris Grant',desc:'Mirrored from NiftyPM · '+(label||''),createdAt:new Date().toISOString()});
    save('projects');
    defaultProjectId=String(newId);
  } else if(projChoice){
    defaultProjectId=String(projChoice);
  }
  try{
    await _trpc('externalSources.addNiftyWatch',{projectId,label,filterByAssignee,defaultProjectId:defaultProjectId||undefined},'mutation');
    closeModal();
    toast({type:'success',title:'Project added — pulling now…'});
    await refreshExternalTasksNow();
    await _hydrateExternalSourcesPanel();
  }catch(e){toast({type:'warn',title:'Save failed',msg:e.message||String(e)});}
}
// ====== EXPORT / IMPORT ======
function exportData(){
  // Build JSON backup
  const ts=new Date().toISOString().slice(0,10);
  const payload={version:1,exported:new Date().toISOString(),tasks:D.tasks,notes:D.notes,projects:D.projects,goals:D.goals,journal:D.journal,habits:D.habits,teams:D.teams,aiTopics:D.aiTopics};
  const jsonStr=JSON.stringify(payload,null,2);

  // Build CSV for tasks
  const csvHeader='id,title,priority,due,context,project,status,myDay,energy\n';
  const csvRows=D.tasks.map(t=>[t.id,`"${(t.title||'').replace(/"/g,'""')}"`,t.priority,t.due,t.context,t.project,t.status,t.myDay,t.energy].join(',')).join('\n');
  const csvStr=csvHeader+csvRows;

  // Build Markdown notes
  const mdNotes=D.notes.map(n=>`# ${n.title}\n\n**Tags:** ${(n.tags||[]).join(', ')}  \n**Source:** ${n.source}  \n**Updated:** ${n.updated}\n\n---\n\n${n.body||''}\n`).join('\n\n---\n\n');

  // Use JSZip if available, otherwise fall back to JSON only
  if(typeof JSZip!=='undefined'){
    const zip=new JSZip();
    zip.file('levelup-backup-'+ts+'.json',jsonStr);
    zip.file('tasks-'+ts+'.csv',csvStr);
    zip.file('notes-'+ts+'.md',mdNotes);
    zip.generateAsync({type:'blob'}).then(blob=>{
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='levelup-export-'+ts+'.zip';a.click();toast('✓ Exported as ZIP');
    });
  } else {
    // Fallback: download JSON
    const blob=new Blob([jsonStr],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='levelup-backup-'+ts+'.json';a.click();
    // Also download CSV
    const b2=new Blob([csvStr],{type:'text/csv'});
    const a2=document.createElement('a');a2.href=URL.createObjectURL(b2);a2.download='tasks-'+ts+'.csv';setTimeout(()=>a2.click(),300);
    // Also download MD
    const b3=new Blob([mdNotes],{type:'text/markdown'});
    const a3=document.createElement('a');a3.href=URL.createObjectURL(b3);a3.download='notes-'+ts+'.md';setTimeout(()=>a3.click(),600);
    toast('✓ Exported 3 files (JSON + CSV + MD)');
  }
}

function importData(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const data=JSON.parse(e.target.result);
      // Validate it looks like a LevelUp backup
      if(!data.tasks&&!data.notes&&!data.projects){toast('⚠ Invalid backup file');return}
      const counts=[];
      if(Array.isArray(data.tasks)){D.tasks=data.tasks;counts.push(data.tasks.length+' tasks')}
      if(Array.isArray(data.notes)){D.notes=data.notes;counts.push(data.notes.length+' notes')}
      if(Array.isArray(data.projects)){D.projects=data.projects;counts.push(data.projects.length+' projects')}
      if(Array.isArray(data.goals)){D.goals=data.goals;counts.push(data.goals.length+' goals')}
      if(Array.isArray(data.journal)){D.journal=data.journal;counts.push(data.journal.length+' journal entries')}
      if(Array.isArray(data.habits)){D.habits=data.habits;counts.push(data.habits.length+' habits')}
      if(Array.isArray(data.teams)){D.teams=data.teams}
      if(Array.isArray(data.aiTopics)){D.aiTopics=data.aiTopics}
      saveAll();
      renderScreen(curScreen);
      toast('✓ Imported: '+counts.join(', '));
    }catch(ex){
      toast('⚠ Could not parse backup file: '+ex.message);
    }
  };
  reader.readAsText(file);
}

// ====== TEAMS ======
// ---- Profile picture upload ----
// ---- Avatar crop state ----
let _avatarMemberId=null,_avatarImg=null,_avatarOffX=0,_avatarOffY=0,_avatarDragging=false,_avatarDragStartX=0,_avatarDragStartY=0,_avatarDragOffX=0,_avatarDragOffY=0;
function uploadMemberAvatar(memberId){
  const input=document.createElement('input');
  input.type='file';
  input.accept='image/jpeg,image/png,image/webp,image/gif';
  input.onchange=()=>{
    const file=input.files&&input.files[0];
    if(!file)return;
    if(file.size>10*1024*1024){toast('⚠️ Image must be under 10 MB');return;}
    const reader=new FileReader();
    reader.onload=(e)=>{
      const img=new Image();
      img.onload=()=>{
        _avatarMemberId=memberId;
        _avatarImg=img;
        _avatarOffX=0;_avatarOffY=0;
        const zoomEl=document.getElementById('avatar-zoom');
        if(zoomEl){zoomEl.value='1';}
        const modal=document.getElementById('avatar-crop-modal');
        if(modal){modal.style.display='flex';}
        _avatarDraw();
        _avatarBindEvents();
      };
      img.src=e.target.result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}
function _avatarDraw(){
  const canvas=document.getElementById('avatar-crop-canvas');
  if(!canvas||!_avatarImg)return;
  const ctx=canvas.getContext('2d');
  const size=180;
  const zoomEl=document.getElementById('avatar-zoom');
  const zoom=zoomEl?parseFloat(zoomEl.value):1;
  const zoomVal=document.getElementById('avatar-zoom-val');
  if(zoomVal)zoomVal.textContent=zoom.toFixed(1)+'×';
  ctx.clearRect(0,0,size,size);
  // Clip to circle
  ctx.save();
  ctx.beginPath();ctx.arc(size/2,size/2,size/2,0,Math.PI*2);ctx.clip();
  // Fit image to canvas at zoom level, centered + offset
  const scale=Math.max(size/_avatarImg.width,size/_avatarImg.height)*zoom;
  const sw=_avatarImg.width*scale,sh=_avatarImg.height*scale;
  const dx=(size-sw)/2+_avatarOffX,dy=(size-sh)/2+_avatarOffY;
  ctx.drawImage(_avatarImg,dx,dy,sw,sh);
  ctx.restore();
}
// Keep references to window-level drag handlers so they can be removed on close
let _avatarMoveHandler=null,_avatarUpHandler=null;
function _avatarBindEvents(){
  // Clean up any previous window listeners
  if(_avatarMoveHandler)window.removeEventListener('mousemove',_avatarMoveHandler);
  if(_avatarUpHandler)window.removeEventListener('mouseup',_avatarUpHandler);
  const canvas=document.getElementById('avatar-crop-canvas');
  if(!canvas)return;
  // Replace canvas node to clear old element-level listeners
  const fresh=canvas.cloneNode(false); // shallow clone — no bitmap needed
  canvas.parentNode.replaceChild(fresh,canvas);
  fresh.style.cursor='grab';
  // Redraw immediately on the fresh canvas
  // (must happen after replace so _avatarDraw targets the new element)
  requestAnimationFrame(()=>_avatarDraw());
  fresh.addEventListener('mousedown',(e)=>{_avatarDragging=true;_avatarDragStartX=e.clientX;_avatarDragStartY=e.clientY;_avatarDragOffX=_avatarOffX;_avatarDragOffY=_avatarOffY;fresh.style.cursor='grabbing';});
  _avatarMoveHandler=(e)=>{if(!_avatarDragging)return;_avatarOffX=_avatarDragOffX+(e.clientX-_avatarDragStartX);_avatarOffY=_avatarDragOffY+(e.clientY-_avatarDragStartY);_avatarDraw();};
  _avatarUpHandler=()=>{_avatarDragging=false;fresh.style.cursor='grab';};
  window.addEventListener('mousemove',_avatarMoveHandler);
  window.addEventListener('mouseup',_avatarUpHandler);
  fresh.addEventListener('wheel',(e)=>{e.preventDefault();const zEl=document.getElementById('avatar-zoom');if(!zEl)return;let v=parseFloat(zEl.value)+(e.deltaY<0?0.1:-0.1);v=Math.max(1,Math.min(3,v));zEl.value=v;_avatarDraw();},{passive:false});
  // Touch support
  let lastTouchDist=null;
  fresh.addEventListener('touchstart',(e)=>{if(e.touches.length===1){_avatarDragging=true;_avatarDragStartX=e.touches[0].clientX;_avatarDragStartY=e.touches[0].clientY;_avatarDragOffX=_avatarOffX;_avatarDragOffY=_avatarOffY;}if(e.touches.length===2){lastTouchDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}},{passive:true});
  fresh.addEventListener('touchmove',(e)=>{if(e.touches.length===1&&_avatarDragging){_avatarOffX=_avatarDragOffX+(e.touches[0].clientX-_avatarDragStartX);_avatarOffY=_avatarDragOffY+(e.touches[0].clientY-_avatarDragStartY);_avatarDraw();}if(e.touches.length===2&&lastTouchDist){const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);const zEl=document.getElementById('avatar-zoom');if(zEl){let v=parseFloat(zEl.value)*(d/lastTouchDist);v=Math.max(1,Math.min(3,v));zEl.value=v;_avatarDraw();}lastTouchDist=d;}},{passive:true});
  fresh.addEventListener('touchend',()=>{_avatarDragging=false;lastTouchDist=null;});
  // Re-bind zoom slider (was cloned)
  const zoomEl=document.getElementById('avatar-zoom');
  if(zoomEl)zoomEl.oninput=_avatarDraw;
}
function closeAvatarCrop(){
  const modal=document.getElementById('avatar-crop-modal');
  if(modal)modal.style.display='none';
  // Clean up window-level drag listeners
  if(_avatarMoveHandler){window.removeEventListener('mousemove',_avatarMoveHandler);_avatarMoveHandler=null;}
  if(_avatarUpHandler){window.removeEventListener('mouseup',_avatarUpHandler);_avatarUpHandler=null;}
  _avatarImg=null;_avatarMemberId=null;_avatarDragging=false;
}
async function saveAvatarCrop(){
  const canvas=document.getElementById('avatar-crop-canvas');
  if(!canvas||!_avatarMemberId)return;
  const btn=document.getElementById('avatar-crop-save-btn');
  if(btn){btn.disabled=true;btn.textContent='Saving…';}
  try{
    // Export canvas as JPEG data URL
    const dataUrl=canvas.toDataURL('image/jpeg',0.92);
    const res=await _trpc('team.uploadMemberAvatar',{memberId:_avatarMemberId,dataUrl,mimeType:'image/jpeg'},'mutation');
    const member=D.teams.flatMap(t=>t.members).find(m=>m.id===_avatarMemberId);
    if(member){member.avatar=res.url;save('teams');}
    closeAvatarCrop();
    renderTeam();
    toast('✅ Profile photo updated!');
  }catch(err){
    console.error('Avatar upload error:',err);
    toast('❌ Upload failed: '+(err.message||'Unknown error'));
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Save Photo';}
  }
}
function removeAvatarMember(memberId){
  const member=D.teams.flatMap(t=>t.members).find(m=>m.id===memberId);
  if(!member)return;
  delete member.avatar;
  save('teams');
  renderTeam();
  toast('🗑️ Profile photo removed');
}
function addTeamMember(teamId){
  const name=prompt('Member name:');if(!name)return;
  const email=prompt('Member email:')||'';
  const team=D.teams.find(t=>t.id===teamId);
  team.members.push({id:nextId(team.members),userId:null,name,email,role:'Member',color:'#'+Math.floor(Math.random()*16777215).toString(16),perms:{tasks:true,notes:true,projects:true,goals:false,journal:false,settings:false,mail:false,calendar:true,habits:false,coach:false}});
  save('teams');renderScreen('settings');toast('Member added!');
}
function updateMemberRole(teamId,memberId,role){
  D.teams.find(t=>t.id===teamId).members.find(m=>m.id===memberId).role=role;save('teams');toast('Role updated');
}
function editTeamMember(teamId,memberId){
  const m=D.teams.find(t=>t.id===teamId).members.find(x=>x.id===memberId);
  const d=document.getElementById('drawer-content');
  d.innerHTML=`<h2>✏ Edit Member: ${esc(m.name)}<button class="close" onclick="closeDrawer()">✕</button></h2>
  <div class="field"><label>Name</label><input class="inp" id="em-name" value="${esc(m.name)}"></div>
  <div class="field"><label>Email</label><input class="inp" id="em-email" value="${esc(m.email||'')}"></div>
  <div class="field"><label>Job Title</label><input class="inp" id="em-title" value="${esc(m.jobTitle||'')}"></div>
  <div class="field"><label>Role</label><select class="inp" id="em-role"><option ${m.role==='Owner'?'selected':''}>Owner</option><option ${m.role==='Admin'?'selected':''}>Admin</option><option ${m.role==='Member'?'selected':''}>Member</option><option ${m.role==='Viewer'?'selected':''}>Viewer</option></select></div>
  <div class="field"><label>Avatar Color</label><input type="color" class="inp" id="em-color" value="${m.color||'#3B82F6'}" style="height:36px;padding:2px"></div>
  <div style="display:flex;gap:8px;margin-top:12px" class="admin-only">
  <button class="btn btn-p" onclick="saveTeamMember(${teamId},${memberId})">Save Changes</button>
  ${m.role!=='Owner'?`<button class="btn btn-d" onclick="if(confirm('Remove ${esc(m.name)} from team?')){removeMember(${teamId},${memberId});closeDrawer();}">Remove Member</button>`:''}
  </div>`;
  document.getElementById('drawer-ov').classList.add('show');
}
function saveTeamMember(teamId,memberId){
  const m=D.teams.find(t=>t.id===teamId).members.find(x=>x.id===memberId);
  m.name=document.getElementById('em-name').value.trim()||m.name;
  m.email=document.getElementById('em-email').value.trim();
  m.jobTitle=document.getElementById('em-title').value.trim();
  m.role=document.getElementById('em-role').value;
  m.color=document.getElementById('em-color').value;
  save('teams');
  closeDrawer();
  renderScreen('settings');
  toast('✓ Member updated');
}
function removeMember(teamId,memberId){
  const team=D.teams.find(t=>t.id===teamId);team.members=team.members.filter(m=>m.id!==memberId);save('teams');renderScreen('settings');toast('Member removed');
}
function editPerms(teamId,memberId){
  const m=D.teams.find(t=>t.id===teamId).members.find(x=>x.id===memberId);
  const perms=['tasks','notes','projects','goals','journal','settings','mail','calendar','habits','coach'];
  const d=document.getElementById('drawer-content');
  d.innerHTML=`<h2>🔒 Permissions: ${esc(m.name)}<button class="close" onclick="closeDrawer()">✕</button></h2>
  <p style="font-size:11px;color:var(--t2);margin-bottom:10px">Toggle access to app sections for this team member.</p>
  ${perms.map(p=>`<div class="lr" style="padding:6px 0"><span style="font-size:12px;flex:1;text-transform:capitalize">${p}</span><div class="tog ${m.perms[p]?'on':''}" onclick="this.classList.toggle('on');D.teams.find(t=>t.id===${teamId}).members.find(x=>x.id===${memberId}).perms['${p}']=this.classList.contains('on');save('teams');toast('Permission updated')"></div></div>`).join('')}`;
  document.getElementById('drawer-ov').classList.add('show');
}
function addTeam(){const n=prompt('Team name:');if(n){D.teams.push({id:nextId(D.teams),name:n,members:[]});save('teams');renderScreen('settings');toast('Team created!')}}

// ====== ONENOTE PDF IMPORT ======
async function extractPdfText(arrayBuffer){
  // Use pdf.js if available (best quality)
  if(typeof pdfjsLib!=='undefined'){
    try{
      const pdf=await pdfjsLib.getDocument({data:new Uint8Array(arrayBuffer)}).promise;
      const pages=[];
      for(let p=1;p<=pdf.numPages;p++){
        const page=await pdf.getPage(p);
        const tc=await page.getTextContent();
        const pageText=tc.items.map(item=>item.str).join(' ');
        if(pageText.trim())pages.push(pageText.trim());
      }
      return pages.join('\n\n');
    }catch(ex){console.warn('pdf.js extraction failed, falling back:',ex);}
  }
  // Fallback: BT/ET stream extraction
  let raw='';
  const bytes=new Uint8Array(arrayBuffer);
  for(let i=0;i<Math.min(bytes.length,300000);i++)raw+=String.fromCharCode(bytes[i]);
  const btBlocks=raw.match(/BT[\s\S]*?ET/g)||[];
  let lines=[];
  btBlocks.forEach(block=>{
    const strMatches=block.match(/\(([^)\\]|\\.)*\)\s*Tj|\[([^\]]*)\]\s*TJ/g)||[];
    strMatches.forEach(sm=>{
      const inner=sm.match(/\(([^)\\]|\\.)*\)/g)||[];
      inner.forEach(s=>{
        let t=s.slice(1,-1)
          .replace(/\\n/g,'\n').replace(/\\r/g,'').replace(/\\t/g,' ')
          .replace(/\\\(/g,'(').replace(/\\\)/g,')').replace(/\\\\/g,'\\')
          .replace(/\\[0-7]{3}/g,m=>String.fromCharCode(parseInt(m.slice(1),8)));
        t=t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g,'');
        if(t.trim().length>0)lines.push(t);
      });
    });
  });
  if(lines.length<5){
    const rawStrings=raw.match(/\(([A-Za-z0-9 ,\.\-\'\"\!\?\:\;\n\t]{4,200})\)/g)||[];
    rawStrings.forEach(s=>{
      const t=s.slice(1,-1).trim();
      if(t.length>3&&!/^[\d\s\.]+$/.test(t))lines.push(t);
    });
  }
  return lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
function handleOneNoteFiles(files){
  const res=document.getElementById('onenote-results');
  res.innerHTML='<div style="font-size:12px;color:var(--ac)">⏳ Processing '+files.length+' file(s)...</div>';
  let imported=0;
  const total=Array.from(files).filter(f=>f.name.toLowerCase().endsWith('.pdf')).length;
  if(total===0){res.innerHTML='<div style="font-size:11px;color:var(--red)">⚠ No PDF files found. Please select .pdf files exported from OneNote.</div>';return;}
  Array.from(files).forEach(async file=>{
    if(!file.name.toLowerCase().endsWith('.pdf')){
      res.innerHTML+='<div style="font-size:11px;color:var(--t3)">⏩ Skipped (not PDF): '+esc(file.name)+'</div>';
      return;
    }
    const nameNoExt=file.name.replace(/\.pdf$/i,'');
    let tag='imported',title=nameNoExt;
    if(nameNoExt.includes(' - ')){const parts=nameNoExt.split(' - ');tag=parts[0].trim();title=parts.slice(1).join(' - ').trim()}
    else if(nameNoExt.includes('_')){const parts=nameNoExt.split('_');tag=parts[0].trim();title=parts.slice(1).join('_').trim()}
    try{
      const arrayBuffer=await file.arrayBuffer();
      let bodyText=await extractPdfText(arrayBuffer);
      if(!bodyText||bodyText.length<20){
        bodyText='[PDF imported: '+file.name+']\n\nFile size: '+(file.size/1024).toFixed(1)+' KB\n\nThe PDF did not contain extractable text (it may be a scanned image). For best results, export from OneNote as a Word document and paste the text here.';
      } else {
        bodyText=bodyText.substring(0,8000)+(bodyText.length>8000?'\n\n[...truncated at 8000 chars]':'');
      }
      const noteId=nextId(D.notes);
      D.notes.push({id:noteId,title:title||nameNoExt,tags:[tag.toLowerCase().replace(/\s+/g,'-'),'onenote'],source:'OneNote Import',updated:'Just now',starred:false,body:bodyText,createdBy:D.creds.userName||'Idris Grant'});
      save('notes');imported++;
      invalidateSearchIndex();
      const statusEl=res.querySelector('.import-status');
      if(statusEl)statusEl.textContent='✓ Imported '+imported+'/'+total+' note(s)';
      else res.innerHTML='<div class="import-status" style="font-size:12px;color:var(--ok)">✓ Imported '+imported+'/'+total+' note(s)</div>';
      res.innerHTML+=`<div class="lr" style="cursor:pointer;margin-top:4px" onclick="nav('notes');setTimeout(()=>showNoteInEditor(${noteId}),200)"><span style="font-size:11px;padding:2px 4px;border-radius:2px;background:var(--purps);color:var(--purp)">OneNote</span><span class="rt">${esc(title)}</span><span style="font-size:11px;padding:2px 4px;border-radius:2px;background:var(--s3);color:var(--t3)">#${tag.toLowerCase()}</span></div>`;
    }catch(ex){
      res.innerHTML+='<div style="font-size:11px;color:var(--red)">⚠ Error importing '+esc(file.name)+': '+ex.message+'</div>';
    }
  });
}

// ====== AI ASSISTANT ======
// Static non-news messages (always shown)
const aiStaticMsgs=[
  {type:'warning',msg:'⚠️ 3 tasks are overdue. Consider processing them in GTD.'},
  {type:'info',msg:'💡 Tip: Use the My Day screen to plan your morning. It takes just 5 minutes.'},
  {type:'encourage',msg:'🔥 Keep building your streaks! Consistent habits compound into big results.'},
  {type:'info',msg:'📊 Schedule your deep work blocks during your peak energy hours for best results.'},
];
let aiMsgs=[...aiStaticMsgs]; // will be extended with live headlines
let aiMsgIdx=0,aiTimer=null,_newsLoaded=false;

async function loadLiveNews(){
  if(_newsLoaded)return;
  try{
    const topics=D.aiTopics&&D.aiTopics.length?D.aiTopics:['Technology','World News'];
    const headlines=await _trpc('news.getHeadlines',{topics,countPerTopic:3},'query');
    if(headlines&&headlines.length){
      const topicEmoji={'Technology':'📱','World News':'🌍','Business':'💼','Science':'🔬','Politics':'🏛️','Health':'🏥','Entertainment':'🎬','Sports':'⚽','Finance':'📈'};
      const newsMsgs=headlines.map(h=>{
        const emoji=topicEmoji[h.topic]||'📰';
        return {type:'news',msg:`${emoji} ${h.topic}: ${h.title}`,link:h.link};
      });
      // Replace any existing news entries with live ones
      aiMsgs=[...aiStaticMsgs,...newsMsgs];
      // Shuffle for variety
      for(let i=aiMsgs.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[aiMsgs[i],aiMsgs[j]]=[aiMsgs[j],aiMsgs[i]];}
      _newsLoaded=true;
    }
  }catch(e){console.warn('[news] Failed to load live headlines:',e);}
}

function startAIAssistant(){
  if(aiTimer)return;
  // Load live news first, then start cycling
  loadLiveNews().then(()=>{
    showAIMsg();
    aiTimer=setInterval(showAIMsg,240000); // every 4 minutes
  });
}
function showAIMsg(){
  const bubble=document.getElementById('ai-bubble');
  if(!bubble)return;
  // Skip whole categories (news / info / encourage / warning) the user has dismissed.
  let attempts=0,m=null;
  while(attempts<aiMsgs.length){
    const cand=aiMsgs[aiMsgIdx%aiMsgs.length];aiMsgIdx++;attempts++;
    if(!localStorage.getItem('lu_dismissed_type_'+cand.type)){m=cand;break;}
  }
  if(!m)return; // every category dismissed — stay quiet
  const div=document.createElement('div');
  div.className='ai-msg';
  const msgContent=m.link?`<div style="cursor:pointer" onclick="window.open('${m.link}','_blank')">${m.msg} <span style="font-size:11px;color:var(--ac)">↗ Read more</span></div>`:`<div>${m.msg}</div>`;
  div.innerHTML=`<button class="ai-close" title="Hide ${m.type} messages" onclick="localStorage.setItem('lu_dismissed_type_${m.type}','1');this.parentElement.remove()">✕</button><div class="ai-type ${m.type}">${m.type.toUpperCase()}</div>${msgContent}`;
  bubble.insertBefore(div,bubble.firstChild);
  // Speak if enabled
  if('speechSynthesis' in window && D.creds.aiSpeak){
    const u=new SpeechSynthesisUtterance(m.msg.replace(/[📅⚠️🌟💡📰🌤️🔥📊🌍]/g,''));
    u.rate=1;u.pitch=1;u.volume=0.7;speechSynthesis.speak(u);
  }
  // Remove after 15 seconds
  setTimeout(()=>{if(div.parentElement)div.remove()},15000);
  // Keep max 3 visible
  while(bubble.children.length>3)bubble.lastChild.remove();
}

// ═══════════════════════════════════════════════════════════════════════════
// AI CHAT ASSISTANT — slide-out conversational panel with persistent memory.
// Messages live in D.prefs.aiChat.messages and ride the prefs sync, so the
// thread follows the user across devices. Last 50 messages kept; older ones
// are dropped to keep the prefs blob bounded.
// ═══════════════════════════════════════════════════════════════════════════
function _aiChatHistory(){return (D.prefs&&D.prefs.aiChat&&Array.isArray(D.prefs.aiChat.messages))?D.prefs.aiChat.messages:[];}
function _aiChatPushMessage(role,content){
  D.prefs.aiChat=D.prefs.aiChat||{messages:[]};
  D.prefs.aiChat.messages.push({role,content,ts:Date.now()});
  // Bound to last 50 to keep the prefs blob manageable
  if(D.prefs.aiChat.messages.length>50)D.prefs.aiChat.messages=D.prefs.aiChat.messages.slice(-50);
  save('prefs');
}
function _aiChatClear(){
  D.prefs.aiChat={messages:[]};save('prefs');
  const c=document.getElementById('ai-chat');if(c)c.innerHTML='';
  _renderAIChatHistory();
  toast('Conversation cleared');
}
function clearAIChat(){
  if(!_aiChatHistory().length){toast('Nothing to clear');return;}
  if(confirm('Clear the entire conversation history?'))_aiChatClear();
}

function toggleAIPanel(){
  const p=document.getElementById('ai-panel');
  const ov=document.getElementById('ai-panel-overlay');
  const isOpen=p.classList.contains('show');
  if(isOpen){
    p.classList.remove('show');if(ov)ov.classList.remove('show');
    return;
  }
  p.classList.add('show');if(ov)ov.classList.add('show');
  _renderAIChatHistory();
  // Focus the input once the slide-in finishes
  setTimeout(()=>{const inp=document.getElementById('ai-input');if(inp)inp.focus();},280);
}
function _renderAIChatHistory(){
  const c=document.getElementById('ai-chat');if(!c)return;
  const msgs=_aiChatHistory();
  if(!msgs.length){
    c.innerHTML=`<div class="ai-chat-msg bot">
      👋 Hi ${esc((D.creds.userName||'').split(' ')[0]||'there')}! I'm your LevelUp assistant.
      <br><br>Ask me about your workspace — I know your tasks, goals, habits, notes, calendar, ideas, and journal. Try:
      <ul style="margin:8px 0;padding-left:20px">
        <li>What are my top priorities today?</li>
        <li>Draft a daily standup from my completed tasks</li>
        <li>What habit am I closest to breaking the streak on?</li>
        <li>Summarise my journal entries from this week</li>
      </ul>
    </div>`;
  }else{
    c.innerHTML=msgs.map(m=>`<div class="ai-chat-msg ${m.role==='user'?'user':'bot'}">${m.role==='user'?esc(m.content):(typeof renderMd==='function'?renderMd(m.content):esc(m.content))}<div class="ai-chat-msg-meta">${_fmtChatTime(m.ts)}</div></div>`).join('');
  }
  c.scrollTop=c.scrollHeight;
  _renderAISuggestions();
  _updateAIMsgCount();
}
function _renderAISuggestions(){
  const el=document.getElementById('ai-suggestions');if(!el)return;
  // Context-aware suggestions based on the current screen
  const screen=curScreen||'home';
  const sets={
    home:["What should I focus on right now?","Brief me on today.","What did I get done yesterday?"],
    tasks:["Triage my inbox.","What's blocking me?","Decompose my biggest task."],
    notes:["What notes haven't I revisited in a while?","Find related notes to this one.","Suggest tags for untagged notes."],
    goals:["How am I tracking against my goals?","Which goal needs attention?","Generate a check-in for my top goal."],
    habits:["How am I doing on habits this week?","Which habit is at risk?","Suggest one habit I should drop."],
    journal:["Summarise my last week of journal entries.","What themes keep coming up?","Coach me on a recent entry."],
    calendar:["Prep me for my next meeting.","What does this week look like?","Find an open 90-min block."],
    mail:["Triage my inbox.","Draft a reply to the latest message.","Which threads need follow-up?"],
    reports:["Build a widget showing overdue tasks by project.","Summarise this report.","Suggest a chart for my data."],
    ideas:["Pre-mortem my top idea.","Score my ideas by ICE.","Which idea has the most momentum?"],
  };
  const picks=sets[screen]||sets.home;
  el.innerHTML=picks.map(s=>`<button onclick="_aiQuickSend('${esc(s).replace(/'/g,'&#39;')}')">${esc(s)}</button>`).join('');
}
function _aiQuickSend(s){
  const inp=document.getElementById('ai-input');
  if(!inp)return;
  inp.value=s;
  sendAIMsg();
}
function _fmtChatTime(ts){
  if(!ts)return '';
  const d=new Date(ts);
  const now=new Date();
  if(d.toDateString()===now.toDateString())return d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
  return d.toLocaleDateString([],{month:'short',day:'numeric'})+' '+d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
}
function _updateAIMsgCount(){
  const el=document.getElementById('ai-msg-count');if(!el)return;
  const n=_aiChatHistory().length;el.textContent=n+' message'+(n===1?'':'s');
}
// Build a concise workspace-context snippet to send with the prompt so the
// model can answer questions about the user's actual data. Kept terse to
// stay within token limits — counts + small samples, not full dumps.
function _buildAIContext(){
  const today=new Date().toISOString().slice(0,10);
  const tasks=D.tasks||[];const notes=D.notes||[];const goals=D.goals||[];const habits=D.habits||[];const journal=D.journal||[];const ideas=D.ideas||[];
  const open=tasks.filter(t=>t.status!=='Done'&&t.status!=='Someday');
  const overdue=open.filter(t=>t.due&&t.due<today);
  const today_tasks=open.filter(t=>t.due===today||t.startDate===today||t.myDay);
  const top=open.slice(0,5).map(t=>`- ${t.title} [${t.priority}${t.due?', due '+t.due:''}${t.project?', '+t.project:''}]`).join('\n');
  const recentNotes=notes.slice(0,5).map(n=>`- ${n.title}${(n.tags||[]).length?' ('+n.tags.slice(0,3).map(x=>'#'+x).join(' ')+')':''}`).join('\n');
  const goalSummary=goals.slice(0,5).map(g=>`- ${g.title}: ${g.pct||0}%`).join('\n');
  const habitSummary=habits.slice(0,6).map(h=>`- ${h.title} (${h.cadence}): 🔥${h.streak||0} streak${h.doneToday?', done today':''}`).join('\n');
  const recentJournal=journal.slice(-3).map(j=>`- ${j.date} ${j.mood||''}: ${(j.body||'').slice(0,140)}`).join('\n');
  const ideaSummary=ideas.slice(0,4).map(i=>`- ${i.title} [${i.stage||'spark'}]`).join('\n');
  return `WORKSPACE CONTEXT (snapshot — refer to it when answering)
Current screen: ${curScreen||'home'} · today: ${today} · user: ${D.creds.userName||'unknown'}

Tasks: ${tasks.length} total, ${open.length} open, ${overdue.length} overdue, ${today_tasks.length} due today
${top?'Top open tasks:\n'+top:''}

Goals (${goals.length}):
${goalSummary||'(none)'}

Habits (${habits.length}):
${habitSummary||'(none)'}

Recent notes (${notes.length} total):
${recentNotes||'(none)'}

Recent journal entries:
${recentJournal||'(none)'}

Ideas (${ideas.length}):
${ideaSummary||'(none)'}`;
}
function onAIInputKey(e){
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendAIMsg();}
}
function autoSizeAIInput(t){
  t.style.height='auto';
  t.style.height=Math.min(t.scrollHeight,120)+'px';
}
function toggleNotifPanel(){
  const p=document.getElementById('notif-panel');
  const isOpen=p.style.display==='flex';
  p.style.display=isOpen?'none':'flex';
  if(!isOpen){
    renderNotifPanel();
    // Mark all current notifs as read when panel is opened
    const ids=buildNotifs().map(n=>n.id);
    markNotifsReadInStorage(ids);
    const nb=document.getElementById('notif-badge');
    if(nb){nb.textContent='';nb.style.display='none';}
  }
  // Close if clicking outside
  if(!isOpen){
    setTimeout(()=>{
      function outsideClick(e){
        if(!p.contains(e.target)&&e.target.id!=='notif-btn'){
          p.style.display='none';
          document.removeEventListener('click',outsideClick);
        }
      }
      document.addEventListener('click',outsideClick);
    },10);
  }
}
// ---- Notification read-state helpers ----
const NOTIF_READ_KEY='lu_notifs_read';
function getReadNotifIds(){
  try{return new Set(JSON.parse(localStorage.getItem(NOTIF_READ_KEY)||'[]'));}
  catch(e){return new Set();}
}
function markNotifsReadInStorage(ids){
  const existing=getReadNotifIds();
  ids.forEach(id=>existing.add(id));
  // Prune to last 500 to avoid unbounded growth
  const arr=[...existing].slice(-500);
  try{localStorage.setItem(NOTIF_READ_KEY,JSON.stringify(arr));}catch(e){}
}
function clearAllReadNotifIds(){
  try{localStorage.removeItem(NOTIF_READ_KEY);}catch(e){}
}
// ---- Notification helpers ----
function isInQuietHours(){
  const n=D.prefs&&D.prefs.notifications;
  if(!n||!n.quietHours)return false;
  const now=new Date();
  const hm=h=>h.split(':').map(Number);
  const [sh,sm]=hm(n.quietStart||'22:00');
  const [eh,em]=hm(n.quietEnd||'07:00');
  const cur=now.getHours()*60+now.getMinutes();
  const start=sh*60+sm;
  const end=eh*60+em;
  // Handles overnight window (e.g. 22:00 – 07:00)
  if(start>end)return cur>=start||cur<end;
  return cur>=start&&cur<end;
}
function deadlineAdvanceDays(){
  const v=(D.prefs&&D.prefs.notifications&&D.prefs.notifications.deadlineAdvance)||'1-day';
  if(v==='same-day')return 0;
  if(v==='2-days')return 2;
  if(v==='3-days')return 3;
  return 1;
}
function buildNotifs(){
  const today=_todayStr;
  const notifs=[];
  const np=D.prefs&&D.prefs.notifications||{};
  const quiet=isInQuietHours();
  // ---- Deadline Reminders ----
  if(np.deadlineReminders!==false&&!quiet){
    const advDays=deadlineAdvanceDays();
    // Overdue tasks
    D.tasks.filter(t=>t.status!=='Done'&&t.due&&t.due<today).forEach(t=>{
      notifs.push({id:'od-'+t.id,type:'warning',icon:'⚠️',title:'Overdue task',body:t.title,time:fmtDate(t.due),read:false,action:()=>{toggleNotifPanel();openDrawer('task',t);}});
    });
    // Tasks due today
    D.tasks.filter(t=>t.status!=='Done'&&t.due===today).forEach(t=>{
      notifs.push({id:'td-'+t.id,type:'info',icon:'📋',title:'Due today',body:t.title,time:'Today',read:false,action:()=>{toggleNotifPanel();openDrawer('task',t);}});
    });
    // Tasks due within advance window (but not today/overdue)
    if(advDays>0){
      const cutoff=new Date();cutoff.setDate(cutoff.getDate()+advDays);
      const cutoffStr=cutoff.toISOString().split('T')[0];
      D.tasks.filter(t=>t.status!=='Done'&&t.due&&t.due>today&&t.due<=cutoffStr).forEach(t=>{
        const d=Math.ceil((new Date(t.due)-new Date())/(1000*60*60*24));
        notifs.push({id:'up-'+t.id,type:'info',icon:'📅',title:`Due in ${d} day${d!==1?'s':''}`,body:t.title,time:fmtDate(t.due),read:false,action:()=>{toggleNotifPanel();openDrawer('task',t);}});
      });
    }
  }
  // ---- Habit Streak Alerts ----
  if(np.habitStreaks!==false&&!quiet){
    D.habits.filter(h=>!h.doneToday&&h.cadence==='Daily').forEach(h=>{
      const streakMsg=h.streak>0?` · 🔥 ${h.streak}d streak at risk`:'';
      notifs.push({id:'hb-'+h.id,type:'habit',icon:h.icon,title:'Habit pending',body:h.title+streakMsg+(h.startTime?' · '+h.startTime:''),time:'Today',read:false,action:()=>{toggleNotifPanel();nav('habits');}});
    });
    // Broken streaks (streak was >0 yesterday but habit not done today and it's past midnight)
    D.habits.filter(h=>!h.doneToday&&h.cadence==='Daily'&&h.streak===0&&(h.completedDates||[]).length>0).forEach(h=>{
      const last=(h.completedDates||[]).sort().slice(-1)[0];
      if(last&&last<today)notifs.push({id:'bs-'+h.id,type:'warning',icon:'💔',title:'Streak broken',body:h.title+' — missed yesterday',time:'Today',read:false,action:()=>{toggleNotifPanel();nav('habits');}});
    });
  }
  // ---- Goal Milestone Alerts ----
  if(np.goalMilestones!==false&&!quiet){
    const milestones=[25,50,75,100];
    const seenKey='lu_goal_milestones_seen';
    let seen={};
    try{seen=JSON.parse(localStorage.getItem(seenKey)||'{}');}catch(e){}
    D.goals.filter(g=>g.pct>0).forEach(g=>{
      milestones.forEach(m=>{
        if(g.pct>=m&&!(seen[g.id]||[]).includes(m)){
          notifs.push({id:'gm-'+g.id+'-'+m,type:'goal',icon:'🎯',title:`Goal ${m===100?'complete':'milestone'}: ${m}%`,body:g.title,time:'Now',read:false,action:()=>{toggleNotifPanel();nav('goals');if(!(seen[g.id]||[]).includes(m)){seen[g.id]=(seen[g.id]||[]).concat(m);try{localStorage.setItem(seenKey,JSON.stringify(seen));}catch(e){}}}});
        }
      });
    });
  }
  // ---- Goal Deadline Alerts (always on) ----
  if(!quiet){
    D.goals.filter(g=>g.due&&g.pct<100).forEach(g=>{
      const daysLeft=Math.ceil((new Date(g.due)-new Date())/(1000*60*60*24));
      if(daysLeft>=0&&daysLeft<=7)notifs.push({id:'gl-'+g.id,type:'goal',icon:'🎯',title:`Goal deadline in ${daysLeft}d`,body:g.title+' · '+g.pct+'% done',time:fmtDate(g.due),read:false,action:()=>{toggleNotifPanel();nav('goals');}});
    });
  }
  // ---- Snoozed tasks due back today ----
  D.tasks.filter(t=>t.snoozeUntil===today&&t.status!=='Done').forEach(t=>{
    notifs.push({id:'sn-'+t.id,type:'snooze',icon:'⏰',title:'Snoozed task back today',body:t.title,time:'Today',read:false,action:()=>{toggleNotifPanel();openDrawer('task',t);}});
  });
  // ---- Filter out still-snoozed notifications ----
  // Read the snooze map from localStorage and remove entries whose expiry has passed
  const now=Date.now();
  let snoozed=getSnoozedNotifs();
  let snoozeDirty=false;
  Object.keys(snoozed).forEach(id=>{
    if(snoozed[id]<=now){delete snoozed[id];snoozeDirty=true;}
  });
  if(snoozeDirty){try{localStorage.setItem(NOTIF_SNOOZE_KEY,JSON.stringify(snoozed));}catch(e){}}
  return notifs.filter(n=>!snoozed[n.id]);
}
// ---- Daily Digest ----
function closeDigest(){
  const m=document.getElementById('digest-modal');
  if(m)m.style.display='none';
}
function showSplashScreen(firstName){
  const el=document.getElementById('splash-screen');
  if(!el)return;
  const greet=document.getElementById('splash-greeting');
  if(greet)greet.textContent='Welcome aboard, '+firstName+' 🚀';
  el.style.display='flex';
  // After 2.8s (bar completes) fade out then hide
  setTimeout(()=>{
    el.classList.add('fade-out');
    setTimeout(()=>{
      el.style.display='none';
      el.classList.remove('fade-out');
      // Trigger digest and assistant after splash
      setTimeout(showDailyDigest,800);
      setTimeout(startAIAssistant,3000);
      toast('👋 Welcome to LevelUp, '+firstName+'!');
    },500);
  },2800);
}
function showDailyDigest(){
  const np=D.prefs&&D.prefs.notifications||{};
  if(np.dailyDigest===false)return;
  if(isInQuietHours())return;
  // Only show once per day
  const today=_todayStr;
  const lastKey='lu_digest_shown';
  if(localStorage.getItem(lastKey)===today)return;
  // Only show after configured digest time
  const [dh,dm]=(np.digestTime||'08:00').split(':').map(Number);
  const now=new Date();
  if(now.getHours()*60+now.getMinutes()<dh*60+dm)return;
  // Build digest content
  const todayTasks=D.tasks.filter(t=>t.status!=='Done'&&t.due===today);
  const overdueTasks=D.tasks.filter(t=>t.status!=='Done'&&t.due&&t.due<today);
  const myDayTasks=D.tasks.filter(t=>t.myDay&&t.status!=='Done');
  const habitsPending=D.habits.filter(h=>!h.doneToday&&h.cadence==='Daily');
  const activeGoals=D.goals.filter(g=>g.pct<100).slice(0,3);
  const dateEl=document.getElementById('digest-date');
  if(dateEl)dateEl.textContent=now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  const section=(icon,title,items,renderFn)=>items.length?`<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${icon} ${title}</div>${items.map(renderFn).join('')}</div>`:'';
  const taskRow=t=>`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--bd1)"><span class="pill ${pillClass(t.priority)}" style="font-size:9px">${t.priority}</span><span style="font-size:12px;flex:1">${esc(t.title)}</span></div>`;
  const habitRow=h=>`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--bd1)"><span style="font-size:14px">${h.icon}</span><span style="font-size:12px;flex:1">${esc(h.title)}</span><span style="font-size:11px;color:var(--warn)">🔥${h.streak}d</span></div>`;
  const goalRow=g=>`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--bd1)"><span style="font-size:14px">${g.icon}</span><span style="font-size:12px;flex:1">${esc(g.title)}</span><div style="width:60px;height:5px;background:var(--s3);border-radius:3px;overflow:hidden"><div style="height:100%;width:${g.pct}%;background:var(--ac)"></div></div><span style="font-size:11px;color:var(--ac)">${g.pct}%</span></div>`;
  let html='';
  if(overdueTasks.length)html+=`<div style="background:rgba(239,68,68,.1);border:1px solid var(--red);border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:11px;color:var(--red)">⚠️ <strong>${overdueTasks.length} overdue task${overdueTasks.length>1?'s':''}</strong> need attention</div>`;
  html+=section('📋','Due today',todayTasks,taskRow);
  html+=section('☀️','My Day',myDayTasks.slice(0,5),taskRow);
  html+=section('🔥','Habits to complete',habitsPending.slice(0,5),habitRow);
  html+=section('🎯','Active goals',activeGoals,goalRow);
  if(!html)html='<div style="text-align:center;padding:20px 0;color:var(--t3);font-size:12px">🎉 Nothing urgent today — enjoy a focused day!</div>';
  const body=document.getElementById('digest-body');
  if(body)body.innerHTML=html;
  const m=document.getElementById('digest-modal');
  if(m)m.style.display='flex';
  localStorage.setItem(lastKey,today);
}
// ---- Snooze notification ----
const NOTIF_SNOOZE_KEY='lu_notifs_snoozed';
function getSnoozedNotifs(){
  try{return JSON.parse(localStorage.getItem(NOTIF_SNOOZE_KEY)||'{}');}catch(e){return {};}
}
function snoozeNotif(id,durationMs){
  // durationMs can be a number (ms) or the string 'tomorrow'
  let expiry;
  let label;
  if(durationMs==='tomorrow'||isNaN(durationMs)){
    const tom=new Date();tom.setDate(tom.getDate()+1);tom.setHours(9,0,0,0);
    expiry=tom.getTime();label='tomorrow at 9 AM';
  }else{
    expiry=Date.now()+(durationMs||3600000);
    label=durationMs<=900000?'15 minutes':durationMs<=3600000?'1 hour':'3 hours';
  }
  // Mark as read now
  markNotifsReadInStorage([id]);
  const snoozed=getSnoozedNotifs();
  snoozed[id]=expiry;
  try{localStorage.setItem(NOTIF_SNOOZE_KEY,JSON.stringify(snoozed));}catch(e){}
  // Re-mark unread after snooze expires (in-session)
  const delay=expiry-Date.now();
  if(delay>0&&delay<24*60*60*1000){
    setTimeout(()=>{
      const readIds=getReadNotifIds();
      readIds.delete(id);
      try{localStorage.setItem(NOTIF_READ_KEY,JSON.stringify([...readIds]));}catch(e){}
      updateSidebarBadges();
    },delay);
  }
  renderNotifPanel();
  updateSidebarBadges();
  toast('⏰ Snoozed for '+label);
}
function renderNotifPanel(){
  const list=document.getElementById('notif-list');
  if(!list)return;
  const notifs=buildNotifs();
  const readIds=getReadNotifIds();
  const unread=notifs.filter(n=>!readIds.has(n.id));
  const badge=document.getElementById('notif-badge');
  if(badge){
    if(unread.length>0){badge.textContent=unread.length>99?'99+':unread.length;badge.style.display='';}
    else{badge.textContent='';badge.style.display='none';}
  }
  if(!notifs.length){
    list.innerHTML='<div style="text-align:center;padding:24px 0;color:var(--t3);font-size:12px">🎉 All caught up! No new notifications.</div>';
    return;
  }
  const typeColor={warning:'var(--red)',info:'var(--ac)',habit:'var(--ok)',goal:'var(--warn)',snooze:'var(--purp)'};
  list.innerHTML=notifs.map(n=>{
    const isRead=readIds.has(n.id);
    return`<div style="display:flex;gap:10px;padding:10px 8px;border-radius:8px;transition:background .15s;border-bottom:1px solid var(--bd1);${isRead?'opacity:.55':''}" onmouseover="this.style.background='var(--s3)'" onmouseout="this.style.background=''">
      <div style="font-size:18px;flex-shrink:0;width:28px;text-align:center;cursor:pointer" onclick="(${n.action.toString()})()">${n.icon}</div>
      <div style="flex:1;min-width:0;cursor:pointer" onclick="(${n.action.toString()})()">
        <div style="font-size:11px;font-weight:600;color:${typeColor[n.type]||'var(--t1)'}">${n.title}${isRead?'<span style="font-size:11px;color:var(--t3);margin-left:4px">✓ read</span>':''}</div>
        <div style="font-size:11px;color:var(--t1);margin:1px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(n.body)}</div>
        <div style="font-size:11px;color:var(--t3)">${n.time}</div>
      </div>
      <select onchange="event.stopPropagation();if(this.value)snoozeNotif('${n.id}',+this.value)" onclick="event.stopPropagation()" style="flex-shrink:0;background:var(--s3);border:1px solid var(--bd2);border-radius:5px;padding:2px 4px;font-size:11px;color:var(--t2);cursor:pointer;align-self:center;max-width:72px" title="Snooze">
        <option value="">⏰ Snooze</option>
        <option value="900000">15 min</option>
        <option value="3600000">1 hour</option>
        <option value="10800000">3 hours</option>
        <option value="tomorrow">Tomorrow</option>
      </select>
    </div>`;
  }).join('');
}
function markAllNotifsRead(){
  const list=document.getElementById('notif-list');
  if(list)list.innerHTML='<div style="text-align:center;padding:24px 0;color:var(--t3);font-size:12px">🎉 All caught up! No new notifications.</div>';
  // Persist read state for all current notifs
  const ids=buildNotifs().map(n=>n.id);
  markNotifsReadInStorage(ids);
  const badge=document.getElementById('notif-badge');
  if(badge){badge.textContent='';badge.style.display='none';}
  toast('All notifications marked as read');
}
function appendAIChat(role,msg){
  // Kept for backwards compatibility — pushes to history + re-renders.
  _aiChatPushMessage(role==='user'?'user':'assistant',msg);
  _renderAIChatHistory();
}
let _aiChatBusy=false;
async function sendAIMsg(){
  if(_aiChatBusy)return;
  const inp=document.getElementById('ai-input');
  const msg=(inp?.value||'').trim();
  if(!msg)return;
  _aiChatPushMessage('user',msg);
  inp.value='';autoSizeAIInput(inp);
  _renderAIChatHistory();
  // Show typing indicator
  const c=document.getElementById('ai-chat');
  if(c){
    const t=document.createElement('div');t.className='ai-chat-typing';t.id='ai-typing';
    t.innerHTML='<span></span><span></span><span></span>';
    c.appendChild(t);c.scrollTop=c.scrollHeight;
  }
  const status=document.getElementById('ai-panel-status');
  if(status)status.textContent='Thinking…';
  const sendBtn=document.getElementById('ai-send-btn');
  if(sendBtn)sendBtn.disabled=true;
  _aiChatBusy=true;
  try{
    const {provider,apiKey}=_getAIConfig();
    // Build the chat transcript as a single user-content blob since ai.assist
    // takes systemPrompt + userContent rather than a structured turn list.
    const history=_aiChatHistory().slice(-10,-1); // up to last 9 turns before the just-sent message
    const sys=`You are the LevelUp AI assistant — a friendly, sharp productivity coach embedded inside a personal "second brain" app. Your job is to help the user understand and act on their own workspace.

Rules:
- Be concise. Aim for 2–6 sentences unless the user explicitly asks for a long answer or a list.
- Refer to the workspace context below when answering. Mention specific items by name when relevant.
- When the user asks you to do something (create a task, schedule a focus block, summarise notes), describe what you'd do — the app's automation tools aren't directly hooked up yet, so propose a clear plan they can execute.
- Use light Markdown: bullet lists, **bold** for emphasis, headings only when you really need them.
- Speak in the second person ("you"). Encouraging tone, not corporate.

${_buildAIContext()}

Previous conversation turns (oldest first):
${history.map(m=>`${m.role==='user'?'USER':'ASSISTANT'}: ${m.content}`).join('\n\n')}`;
    const res=await _trpc('ai.assist',{
      systemPrompt:sys,
      userContent:msg,
      provider:provider||'manus',
      apiKey:apiKey||undefined,
    },'mutation');
    const text=String(res?.result||res?.text||'').trim()||"I didn't get a response — try rephrasing, or check that an AI key is configured in Settings → AI Features.";
    _aiChatPushMessage('assistant',text);
  }catch(e){
    _aiChatPushMessage('assistant',`⚠️ I couldn't reach the AI provider.\n\n${String(e.message||e).slice(0,200)}\n\nMake sure an API key is configured in **Settings → AI Features**, and that the chosen provider is reachable.`);
  }finally{
    _aiChatBusy=false;
    if(sendBtn)sendBtn.disabled=false;
    const typing=document.getElementById('ai-typing');if(typing)typing.remove();
    if(status)status.textContent='Ready · powered by your AI keys';
    _renderAIChatHistory();
  }
}

function exportNotePDF(id){
  const n=D.notes.find(x=>x.id===id);
  if(!n)return;
  toast('📄 Preparing PDF...');
  // Render markdown body to HTML
  const bodyHtml=(n.body||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/^#{3}\s+(.+)$/gm,'<h3>$1</h3>')
    .replace(/^#{2}\s+(.+)$/gm,'<h2>$1</h2>')
    .replace(/^#\s+(.+)$/gm,'<h1>$1</h1>')
    .replace(/^[-*]\s+(.+)$/gm,'<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs,'<ul>$1</ul>')
    .replace(/^>\s+(.+)$/gm,'<blockquote>$1</blockquote>')
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\[\[(.+?)\]\]/g,'<span class="wikilink">$1</span>')
    .replace(/\n\n+/g,'</p><p>')
    .replace(/\n/g,'<br>');
  const tagsHtml=(n.tags||[]).map(t=>`<span class="tag">#${t}</span>`).join(' ');
  const printHtml=`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${n.title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',sans-serif;font-size:13px;line-height:1.7;color:#1a202c;padding:40px 48px;max-width:800px;margin:0 auto}
  h1{font-size:26px;font-weight:700;margin:20px 0 6px;color:#1a202c}
  h2{font-size:18px;font-weight:600;margin:18px 0 5px;color:#2d3748}
  h3{font-size:15px;font-weight:600;margin:14px 0 4px;color:#4a5568}
  p{margin:8px 0;color:#2d3748}
  ul{margin:8px 0 8px 20px}
  li{margin:3px 0}
  blockquote{border-left:3px solid #3b82f6;padding:6px 12px;margin:10px 0;color:#4a5568;background:#eff6ff;border-radius:0 4px 4px 0}
  code{background:#f7fafc;border:1px solid #e2e8f0;padding:1px 5px;border-radius:3px;font-family:monospace;font-size:12px}
  .wikilink{color:#3b82f6;text-decoration:underline;cursor:pointer}
  .tag{display:inline-block;background:#eff6ff;color:#3b82f6;padding:2px 8px;border-radius:10px;font-size:11px;margin-right:4px}
  .meta{font-size:11px;color:#718096;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #e2e8f0}
  .note-title{font-size:28px;font-weight:700;color:#1a202c;margin-bottom:8px}
  .footer{margin-top:40px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;color:#a0aec0;display:flex;justify-content:space-between}
  @media print{
    body{padding:20px 24px}
    @page{margin:15mm 20mm;size:A4}
  }
</style>
</head><body>
<div class="note-title">${n.title}</div>
<div class="meta">
  ${tagsHtml?`<div style="margin-bottom:6px">${tagsHtml}</div>`:''}
  <span>Source: ${n.source||'Manual'}</span>
  ${n.updated?` &nbsp;·&nbsp; Updated: ${n.updated}`:''}
  ${n.createdBy?` &nbsp;·&nbsp; Author: ${n.createdBy}`:''}
</div>
<div class="body-content"><p>${bodyHtml||'<em>No content</em>'}</p></div>
<div class="footer"><span>LevelUp Second Brain</span><span>Exported ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</span></div>
</body></html>`;
  // Open in a new window and trigger print dialog
  const win=window.open('','_blank','width=900,height=700');
  if(!win){toast('⚠ Pop-up blocked. Please allow pop-ups for this site.');return;}
  win.document.write(printHtml);
  win.document.close();
  win.focus();
  setTimeout(()=>{
    win.print();
    // Close after print dialog closes (some browsers)
    win.onafterprint=()=>win.close();
  },400);
  toast('📄 PDF print dialog opened for: '+n.title);
}
// ====== NOTES AI (extended) ======
function aiConceptLink(id){
  const n=D.notes.find(x=>x.id===id);
  if(!n)return;
  const body=(n.body||'').toLowerCase();
  if(body.length<30){toast('Note too short for concept linking');return;}
  toast('🔗 Finding concept links...');
  // Find notes that share significant keywords
  const words=body.replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>4);
  const freq={};
  words.forEach(w=>{freq[w]=(freq[w]||0)+1;});
  const stopWords=new Set(['about','after','again','being','could','doing','every','first','found','given','going','great','group','having','helps','large','later','learn','light','local','might','never','often','other','place','right','small','still','their','there','these','think','those','three','under','until','using','where','which','while','would','write','years','your']);
  const topWords=Object.entries(freq).filter(([w])=>!stopWords.has(w)).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([w])=>w);
  const linked=D.notes.filter(note=>{
    if(note.id===id)return false;
    const noteText=(note.title+' '+(note.body||'')).toLowerCase();
    const matches=topWords.filter(w=>noteText.includes(w)).length;
    return matches>=2;
  }).map(note=>{
    const noteText=(note.title+' '+(note.body||'')).toLowerCase();
    const matches=topWords.filter(w=>noteText.includes(w)).length;
    return{note,matches};
  }).sort((a,b)=>b.matches-a.matches).slice(0,6);
  if(!linked.length){toast('✅ No strong concept links found in other notes');return;}
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">🔗 Concept Links</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:4px">Notes sharing concepts with <strong>${esc(n.title)}</strong>:</div>
  <div style="font-size:11px;color:var(--t3);margin-bottom:10px">Shared keywords: ${topWords.slice(0,5).map(w=>`<span style="background:var(--acs);color:var(--ac);padding:1px 5px;border-radius:8px;margin-right:3px">${w}</span>`).join('')}</div>
  <div style="max-height:280px;overflow-y:auto">${linked.map(({note,matches})=>`<div style="padding:8px;margin-bottom:5px;border-radius:6px;background:var(--s2);cursor:pointer" onclick="closeModal();showNoteInEditor(${note.id})">
    <div style="font-size:12px;font-weight:600;margin-bottom:2px">${esc(note.title)}</div>
    <div style="font-size:11px;color:var(--t3)">${matches} shared concept${matches!==1?'s':''} · ${(note.tags||[]).map(t=>'#'+t).join(' ')}</div>
  </div>`).join('')}</div>
  <div style="display:flex;gap:8px;margin-top:10px">
  <button class="btn btn-p" onclick="closeModal()">Close</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}

function aiGapDetect(id){
  const n=D.notes.find(x=>x.id===id);
  if(!n)return;
  const body=(n.body||'').trim();
  if(body.length<50){toast('Note too short for gap detection');return;}
  toast('🔍 Detecting knowledge gaps...');
  // Identify questions and incomplete sections
  const sentences=body.split(/[.!?\n]+/).map(s=>s.trim()).filter(s=>s.length>10);
  const gaps=[];
  // Look for placeholder markers
  const placeholderPatterns=[/\[.*?\]/g,/TODO[:\s]/i,/TBD/i,/\?\?\?/,/FIXME/i,/\.\.\./];
  placeholderPatterns.forEach(re=>{
    if(re.test(body))gaps.push('Contains placeholder or incomplete section: '+re.source);
  });
  // Look for unanswered questions in the note itself
  const questions=sentences.filter(s=>s.trim().endsWith('?')).slice(0,4);
  if(questions.length)gaps.push(...questions.map(q=>'Unanswered question: '+q));
  // Check for thin sections (very short paragraphs)
  const paras=body.split(/\n{2,}/).filter(p=>p.trim().length>0);
  const thinParas=paras.filter(p=>p.trim().split(/\s+/).length<8);
  if(thinParas.length>0)gaps.push(`${thinParas.length} section${thinParas.length!==1?'s':''} appear thin (under 8 words) — consider expanding`);
  // Check for missing common sections based on note type
  const lower=body.toLowerCase();
  if((lower.includes('project')||lower.includes('plan'))&&!lower.includes('deadline')&&!lower.includes('due'))gaps.push('Missing: deadline or due date');
  if((lower.includes('meeting')||lower.includes('discussion'))&&!lower.includes('action'))gaps.push('Missing: action items from meeting');
  if(lower.includes('research')&&!lower.includes('source')&&!lower.includes('reference'))gaps.push('Missing: sources or references');
  if(!gaps.length){toast('✅ Note appears complete — no obvious gaps detected!');return;}
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">🔍 Knowledge Gap Report</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:10px">Potential gaps in <strong>${esc(n.title)}</strong>:</div>
  <div style="max-height:280px;overflow-y:auto">${gaps.map((g,i)=>`<div style="padding:7px 10px;margin-bottom:5px;border-radius:6px;background:var(--s2);font-size:12px;display:flex;gap:8px"><span style="color:var(--red);font-weight:700;flex-shrink:0">${i+1}.</span><span>${esc(g)}</span></div>`).join('')}</div>
  <button class="btn btn-p" style="margin-top:12px" onclick="closeModal()">Got it</button>`;
  document.getElementById('modal-capture').classList.add('show');
}

function aiNoteQA(){
  const question=prompt('Ask a question about your notes:\n\nExamples:\n• What did I decide about pricing?\n• What are my goals for Q3?\n• What did I write about the Acme deal?');
  if(!question||!question.trim())return;
  toast('🤔 Searching your notes...');
  const q=question.toLowerCase();
  const qWords=q.replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>3);
  // Score all notes by relevance to the question
  const scored=D.notes.map(n=>{
    const text=(n.title+' '+(n.body||'')+' '+(n.tags||[]).join(' ')).toLowerCase();
    const matches=qWords.filter(w=>text.includes(w)).length;
    // Find the most relevant sentence
    const sentences=(n.body||'').split(/[.!?\n]+/).map(s=>s.trim()).filter(s=>s.length>15);
    const bestSentence=sentences.find(s=>qWords.some(w=>s.toLowerCase().includes(w)))||sentences[0]||'';
    return{n,matches,bestSentence};
  }).filter(x=>x.matches>0).sort((a,b)=>b.matches-a.matches).slice(0,5);
  if(!scored.length){toast('No matching notes found for that question');return;}
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">🤔 Q&A Over Your Notes</h2>
  <div style="background:var(--acs);border:1px solid var(--ac);border-radius:6px;padding:8px 10px;margin-bottom:10px;font-size:12px;font-style:italic">“${esc(question)}”</div>
  <div style="font-size:11px;font-weight:600;color:var(--t3);margin-bottom:8px">MOST RELEVANT NOTES (${scored.length}):</div>
  <div style="max-height:280px;overflow-y:auto">${scored.map(({n,matches,bestSentence})=>`<div style="padding:8px;margin-bottom:6px;border-radius:6px;background:var(--s2);cursor:pointer" onclick="closeModal();showNoteInEditor(${n.id})">
    <div style="font-size:12px;font-weight:600;margin-bottom:3px">${esc(n.title)} <span style="font-size:11px;color:var(--t3);font-weight:400">${matches} match${matches!==1?'es':''}</span></div>
    ${bestSentence?`<div style="font-size:11px;color:var(--t2);line-height:1.5">“${esc(bestSentence.slice(0,120))}${bestSentence.length>120?'…':''}”</div>`:''}
  </div>`).join('')}</div>
  <button class="btn btn-p" style="margin-top:10px" onclick="closeModal()">Close</button>`;
  document.getElementById('modal-capture').classList.add('show');
}

function aiExpandToDoc(id){
  const n=D.notes.find(x=>x.id===id);
  if(!n)return;
  const body=(n.body||'').trim();
  if(body.length<20){toast('Note too short to expand');return;}
  toast('📄 Expanding note to document...');
  const title=n.title||'Untitled';
  const sentences=body.split(/[.!?\n]+/).map(s=>s.trim()).filter(s=>s.length>10);
  const lower=body.toLowerCase();
  // Determine document type
  let docType='Report';
  if(lower.includes('meeting')||lower.includes('agenda'))docType='Meeting Notes';
  else if(lower.includes('plan')||lower.includes('strategy'))docType='Strategic Plan';
  else if(lower.includes('proposal')||lower.includes('pitch'))docType='Proposal';
  else if(lower.includes('research')||lower.includes('analysis'))docType='Research Brief';
  // Build expanded document
  const today=new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  let expanded=`# ${title}\n\n`;
  expanded+=`**Document Type:** ${docType}  \n**Date:** ${today}  \n**Author:** ${D.creds.userName||'Idris Grant'}\n\n---\n\n`;
  expanded+=`## Executive Summary\n\n${sentences.slice(0,2).join('. ')}.\n\n`;
  expanded+=`## Background\n\n${sentences.slice(2,5).join('. ')}.\n\n`;
  if(sentences.length>5){
    expanded+=`## Key Points\n\n${sentences.slice(5,9).map(s=>`- ${s}`).join('\n')}\n\n`;
  }
  expanded+=`## Next Steps\n\n- [ ] Review and validate key findings\n- [ ] Share with relevant stakeholders\n- [ ] Schedule follow-up discussion\n\n`;
  expanded+=`---\n\n*Generated from note: ${title}*`;
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">📄 Expanded Document</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:8px">Type: ${docType} · ${sentences.length} sentences expanded</div>
  <textarea id="expand-doc-body" class="inp" style="height:260px;font-size:11px;font-family:monospace;resize:vertical">${expanded}</textarea>
  <div style="display:flex;gap:8px;margin-top:10px">
  <button class="btn btn-p" onclick="(function(){
    const content=document.getElementById('expand-doc-body').value;
    D.notes.push({id:Date.now(),title:'[Doc] '+${JSON.stringify(title)},body:content,tags:[...(${JSON.stringify(n.tags||[])}||[]),'ai-expanded'],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),pinned:false});
    save('notes');renderNotes();closeModal();
    toast('✓ Expanded document saved as new note!');
  })()">Save as New Note</button>
  <button class="btn btn-s" onclick="navigator.clipboard.writeText(document.getElementById('expand-doc-body').value).then(()=>toast('✓ Copied!')).catch(()=>toast('Copy failed'))">Copy</button>
  <button class="btn btn-s" onclick="closeModal()">Discard</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}

function aiSummarizeNote(id){
  const n=D.notes.find(x=>x.id===id);
  if(!n)return;
  if(!n.body||n.body.trim().length<30){toast('Note is too short to summarize.');return;}
  toast('✨ Summarizing...');
  // Build a summary from the note body using keyword extraction
  const sentences=n.body.split(/[.!?\n]+/).map(s=>s.trim()).filter(s=>s.length>20);
  const bullets=sentences.slice(0,Math.min(sentences.length,6)).map(s=>{
    // Trim to ~80 chars
    return s.length>80?s.slice(0,77)+'...':s;
  });
  const bulletText=bullets.map(b=>'- '+b).join('\n');
  // Stash the payload so the buttons can act on it without trying to inline
  // JSON-stringified strings into an onclick attribute (those embed double
  // quotes, which break the attribute and spill code into the modal body).
  window._aiSummaryPayload={id,bulletText};
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:10px">✨ AI Summary — ${esc(n.title)}</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:8px">Bullet-point summary extracted from note content:</div>
  <div id="ai-sum-preview" style="background:var(--s3);border:1px solid var(--bd2);border-radius:6px;padding:10px;font-size:12px;color:var(--t1);line-height:1.7;max-height:240px;overflow-y:auto">${bullets.map(b=>`<div style="display:flex;gap:6px;margin-bottom:4px"><span style="color:var(--ac)">•</span><span>${esc(b)}</span></div>`).join('')}</div>
  <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
    <button class="btn btn-p" onclick="_applyAISummary()">Prepend to Note</button>
    <button class="btn btn-s" onclick="_copyAISummary()">📋 Copy</button>
    <button class="btn btn-s" onclick="closeModal()">Close</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}
function _applyAISummary(){
  const p=window._aiSummaryPayload;if(!p)return;
  const n=D.notes.find(x=>x.id===p.id);if(!n)return;
  n.body='## ✨ AI Summary\n\n'+p.bulletText+'\n\n---\n\n'+(n.body||'');
  save('notes');showNoteInEditor(p.id);closeModal();
  toast('✓ Summary prepended to note!');
}
function _copyAISummary(){
  const p=window._aiSummaryPayload;if(!p)return;
  navigator.clipboard.writeText(p.bulletText).then(()=>toast('✓ Copied!')).catch(()=>toast('Copy failed'));
}

function aiAutoTagNote(id){
  const n=D.notes.find(x=>x.id===id);
  if(!n)return;
  const body=(n.body||'').trim();
  if(body.length<20){toast('⚠ Note is too short to auto-tag.');return;}
  toast('✨ Analyzing note for tags...');
  // Extract candidate tags from the note body using keyword heuristics
  const words=body.toLowerCase()
    .replace(/[^a-z0-9\s-]/g,' ')
    .split(/\s+/)
    .filter(w=>w.length>3);
  // Count word frequency
  const freq={};
  words.forEach(w=>{freq[w]=(freq[w]||0)+1;});
  // Filter out common stop words
  const stopWords=new Set(['this','that','with','from','have','been','will','they','their','there','what','when','where','which','about','into','more','also','some','than','then','these','those','were','your','just','like','very','over','such','each','both','after','before','could','would','should','other','only','most','many','much','even','well','back','good','also','here','time','year','work','need','want','make','take','give','know','think','come','look','going','doing','being','having']);
  const candidates=Object.entries(freq)
    .filter(([w,c])=>c>=1&&!stopWords.has(w)&&w.length>=4)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,10)
    .map(([w])=>w);
  // Also check for existing tags in D.notes to suggest related ones
  const allTags=[...new Set(D.notes.flatMap(x=>x.tags||[]))];
  const relatedTags=allTags.filter(t=>body.toLowerCase().includes(t.toLowerCase())&&!(n.tags||[]).includes(t));
  const suggestedTags=[...new Set([...relatedTags,...candidates])].slice(0,8);
  const existingTags=n.tags||[];
  const newSuggestions=suggestedTags.filter(t=>!existingTags.includes(t));
  if(!newSuggestions.length){toast('✨ No new tags to suggest — note is already well-tagged!');return;}
  // Show modal with suggested tags
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:10px">✨ AI Auto-Tag — ${esc(n.title)}</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:10px">Suggested tags based on note content. Click to toggle, then Apply.</div>
  ${existingTags.length?`<div style="margin-bottom:8px"><div style="font-size:11px;color:var(--t3);margin-bottom:4px">Current tags:</div><div style="display:flex;gap:4px;flex-wrap:wrap">${existingTags.map(t=>`<span style="font-size:11px;background:var(--acs);color:var(--ac);padding:2px 7px;border-radius:10px">#${t}</span>`).join('')}</div></div>`:''}
  <div style="margin-bottom:12px"><div style="font-size:11px;color:var(--t3);margin-bottom:6px">Suggested new tags (click to select):</div>
  <div id="autotag-chips" style="display:flex;gap:6px;flex-wrap:wrap">${newSuggestions.map(t=>`<span class="autotag-chip" data-tag="${t}" style="font-size:11px;background:var(--s3);border:1px solid var(--bd2);color:var(--t2);padding:4px 10px;border-radius:12px;cursor:pointer;transition:all .15s" onclick="this.classList.toggle('sel');this.style.background=this.classList.contains('sel')?'var(--acs)':'var(--s3)';this.style.color=this.classList.contains('sel')?'var(--ac)':'var(--t2)';this.style.borderColor=this.classList.contains('sel')?'var(--ac)':'var(--bd2)'">#${t}</span>`).join('')}</div></div>
  <div style="display:flex;gap:8px;margin-top:4px">
  <button class="btn btn-p" onclick="(function(){
    const chips=document.querySelectorAll('.autotag-chip.sel');
    if(!chips.length){toast('⚠ Select at least one tag');return;}
    const selected=[...chips].map(c=>c.dataset.tag);
    const note=D.notes.find(x=>x.id===${id});
    if(!note)return;
    note.tags=[...new Set([...(note.tags||[]),...selected])];
    save('notes');
    closeModal();
    renderNotes();
    toast('✨ '+selected.length+' tag'+(selected.length!==1?'s':'')+' added: '+selected.map(t=>'#'+t).join(', '));
  })()">Apply Selected Tags</button>
  <button class="btn btn-s" onclick="closeModal()">Cancel</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}

async function bulkAutoTagNotes(){
  const untagged=D.notes.filter(n=>!n.tags||!n.tags.length);
  if(!untagged.length){toast('✅ All notes already have tags!');return;}
  const confirm_=window.confirm(`Auto-tag ${untagged.length} untagged note${untagged.length!==1?'s':''}? The AI will suggest and automatically apply tags to each note.`);
  if(!confirm_)return;
  const {provider,apiKey}=_getAIConfig();
  let done=0,failed=0;
  toast(`🏷 Auto-tagging ${untagged.length} notes… (0/${untagged.length})`);
  for(const note of untagged){
    try{
      const body=(note.body||'').trim().substring(0,600);
      if(body.length<10){done++;continue;}
      const systemPrompt='You are a note tagging assistant. Return ONLY a JSON array of 3-6 lowercase tag strings (no # prefix, no spaces, use hyphens). Example: ["project-management","ai","productivity"]';
      const userContent=`Note title: ${note.title}\n\nContent: ${body}`;
      const res=await _trpc('ai.assist',{systemPrompt,userContent,provider:provider||'manus',apiKey:apiKey||undefined},'mutation');
      const text=(res?.result||res?.text||'').trim();
      // Parse JSON array from response
      const match=text.match(/\[.*?\]/s);
      if(match){
        const tags=JSON.parse(match[0]).filter(t=>typeof t==='string'&&t.length>0).map(t=>t.toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,''));
        if(tags.length){note.tags=[...new Set([...(note.tags||[]),...tags])];}
      }
      done++;
      toast(`🏷 Auto-tagging… (${done}/${untagged.length})`);
    }catch(e){
      failed++;
      done++;
    }
    // Small delay to avoid rate limiting
    await new Promise(r=>setTimeout(r,300));
  }
  save('notes');
  renderNotes();
  toast(`✅ Auto-tagged ${done-failed} note${done-failed!==1?'s':''}${failed?` (${failed} failed)`:''}`);
}

// ====== JOURNAL HELPERS ======
function calcJournalStreak(){
  return D.journal.length > 0 ? Math.min(D.journal.length, 30) : 0;
}
function shareJournalEntry(id){
  const j=D.journal.find(x=>x.id===id);
  if(!j)return;
  const md=`# ${j.title}\n\n**Date:** ${j.date}  ${j.mood?' **Mood:** '+j.mood:''}\n\n${j.body||''}`;
  // Show a share modal with copy + email draft options
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:12px">📤 Share Journal Entry</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:8px">Copy as Markdown or open as email draft:</div>
  <textarea id="share-md-text" style="width:100%;height:160px;background:var(--s3);border:1px solid var(--bd2);border-radius:6px;padding:8px;font-size:11px;color:var(--t1);font-family:monospace;resize:vertical" readonly>${md.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
  <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
  <button class="btn btn-p" onclick="navigator.clipboard.writeText(document.getElementById('share-md-text').value).then(()=>toast('✓ Copied to clipboard!')).catch(()=>{document.getElementById('share-md-text').select();document.execCommand('copy');toast('✓ Copied!')})">📋 Copy Markdown</button>
  <button class="btn btn-s" onclick="window.open('mailto:?subject='+encodeURIComponent('${esc(j.title)}')+\'&body=\'+encodeURIComponent(document.getElementById(\'share-md-text\').value),'_blank');toast('Email draft opened')">Email Draft</button>
  <button class="btn btn-s" onclick="closeModal()">Close</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}
function renderNotePreview(src){
  const el=document.getElementById('fa-note-preview');
  if(!el)return;
  const html=src
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/^#{3}\s+(.+)$/gm,'<h3 style="font-size:14px;font-weight:600;margin:8px 0 3px">$1</h3>')
    .replace(/^#{2}\s+(.+)$/gm,'<h2 style="font-size:16px;font-weight:600;margin:10px 0 4px">$1</h2>')
    .replace(/^#\s+(.+)$/gm,'<h1 style="font-size:18px;font-weight:700;margin:12px 0 5px">$1</h1>')
    .replace(/^[-*]\s+(.+)$/gm,'<li style="margin:2px 0">$1</li>')
    .replace(/`([^`]+)`/g,'<code style="background:var(--s3);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>')
    .replace(/\n/g,'<br>');
  el.innerHTML=html||'<em style="color:var(--t3)">Preview will appear here as you type...</em>';
}
function openJournalPrompt(title, promptText){
  capType='Journal';
  const m=$('modal-content');
  m.innerHTML=renderCaptureModal('Journal');
  $('modal-capture').classList.add('show');
  setTimeout(()=>{
    const ti=document.getElementById('cap-title');
    const body=document.getElementById('cap-body');
    if(ti) ti.value=title+' — '+new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'});
    if(body){ body.value=promptText+'\n\n'; body.focus(); body.setSelectionRange(body.value.length,body.value.length); }
  },60);
}

// ====== GLOBAL SEARCH & SEMANTIC SEARCH ======
let searchIdx=0;
// Open a drawer once the target screen has actually rendered. The old
// 120ms setTimeout fired before clusters/list views finished mounting, so
// openDrawer hit a missing target and silently no-op'd. Polls for the
// container, then opens the drawer + scrolls the matching row into view.
function _openAfterNav(screen, kind, id, find){
  nav(screen);
  let tries=0;
  const tick=()=>{
    tries++;
    const ready=document.querySelector(`#s-${screen}, .lr[data-task-id], #tasks-list, #notes-list, #projects-grid, #journal-list, .ph-r`);
    if(!ready && tries<20){setTimeout(tick,80);return;}
    const obj=find();
    if(obj && typeof openDrawer==='function'){
      try{openDrawer(kind,obj);}catch(e){console.warn('[search] openDrawer failed:',e);}
    }
    // Scroll the matching row into view if it's in the current screen.
    const row=document.querySelector(`[data-task-id="${id}"], [data-note-id="${id}"], [data-project-id="${id}"], [data-journal-id="${id}"]`);
    if(row && row.scrollIntoView)row.scrollIntoView({block:'center',behavior:'smooth'});
  };
  setTimeout(tick,80);
}
function buildSearchIndex(){
  const items=[];
  D.tasks.forEach(t=>items.push({type:'Task',icon:'☑',label:t.title,meta:t.due+' · '+t.priority,tags:(t.tags||[]).join(' '),body:t.notes||'',action:()=>_openAfterNav('tasks','task',t.id,()=>D.tasks.find(x=>x.id===t.id))}));
  D.notes.forEach(n=>items.push({type:'Note',icon:'📝',label:n.title,meta:(n.tags||[]).map(t=>'#'+t).join(' ')||n.source,tags:(n.tags||[]).join(' '),body:n.body||'',action:()=>_openAfterNav('notes','note',n.id,()=>D.notes.find(x=>x.id===n.id))}));
  D.projects.forEach(p=>items.push({type:'Project',icon:'📁',label:p.name,meta:p.status+' · '+p.pct+'%',tags:'',body:p.desc||'',action:()=>_openAfterNav('projects','project',p.id,()=>D.projects.find(x=>x.id===p.id))}));
  D.goals.forEach(g=>items.push({type:'Goal',icon:g.icon||'🎯',label:g.title,meta:g.pct+'%',tags:'',body:g.desc||'',action:()=>nav('goals')}));
  D.journal.forEach(j=>items.push({type:'Journal',icon:'✏️',label:j.title,meta:j.date,tags:'',body:j.body||'',action:()=>{nav('journal');setTimeout(()=>openDrawer('journal',D.journal.find(x=>x.id===j.id)),120)}}));
  D.habits.forEach(h=>items.push({type:'Habit',icon:h.icon||'✅',label:h.name||h.title,meta:(h.cadence||h.frequency||'')+' · '+(h.streak||0)+'d streak',tags:'',body:'',action:()=>nav('habits')}));
  (D.contacts||[]).forEach(c=>items.push({type:'Contact',icon:'👤',label:c.name,meta:(c.role||c.title||'')+' · '+(c.company||''),tags:(c.tags||[]).join(' '),body:c.notes||'',action:()=>{nav('contacts');setTimeout(()=>openContactDetail(c.id),120)}}));
  (D.mail||[]).forEach(m=>items.push({type:'Mail',icon:'✉️',label:m.subject||'(no subject)',meta:m.from+' · '+m.date,tags:'',body:m.body||'',action:()=>{nav('mail');setTimeout(()=>openMailItem&&openMailItem(m.id),120)}}));
  (_calEvents||[]).forEach(ev=>items.push({type:'Event',icon:'📅',label:ev.title,meta:ev.dateStr+' '+ev.start,tags:'',body:ev.location||ev.desc||'',action:()=>{nav('calendar');}}));
  (D.ideas||[]).forEach(i=>items.push({type:'Idea',icon:'💡',label:i.title,meta:i.status||'',tags:(i.tags||[]).join(' '),body:i.body||'',action:()=>{nav('ideas');setTimeout(()=>openIdeaDetail&&openIdeaDetail(i.id),120)}}));
  // External tasks from Smartsheet (CF) + NiftyPM (LSI). Cmd+K opens the
  // source URL in a new tab since we can't open a drawer for read-only rows.
  (D.externalTasks||[]).forEach(et=>{
    if(et.override&&et.override.tombstoned)return;
    const label=(et.source==='smartsheet'?'[CF] ':et.source==='nifty'?'[LSI] ':'')+et.title;
    const due=(et.override&&et.override.localDue)||et.due||'';
    items.push({
      type:et.source==='smartsheet'?'Smartsheet':'NiftyPM',
      icon:et.source==='smartsheet'?'📊':'💜',
      label,
      meta:[et.status||'',due||'',et.projectLabel||''].filter(Boolean).join(' · '),
      tags:(et.override&&et.override.localTags)||'',
      body:et.description||(et.override&&et.override.localNote)||'',
      // Nav to Tasks view, scroll the matching external-task row into view,
      // and flash-highlight it. Open the source URL in a new tab too when
      // present (Smartsheet usually has one; Nifty often doesn't).
      action:()=>{
        const url=et.externalUrl||'';
        if(url)window.open(url,'_blank','noopener');
        nav('tasks');
        let tries=0;
        const find=()=>{
          tries++;
          const row=document.querySelector(`[data-ext-id="${CSS.escape(et.externalId)}"][data-source="${et.source}"]`);
          if(row){
            row.scrollIntoView({block:'center',behavior:'smooth'});
            row.style.transition='outline .25s,background .25s';
            row.style.outline='2px solid var(--ac)';
            row.style.background='rgba(124,58,237,.08)';
            setTimeout(()=>{row.style.outline='';row.style.background='';},2200);
            return;
          }
          if(tries<25)setTimeout(find,100);
          else if(!url)toast({type:'warn',title:'Couldn\'t locate the task on Tasks view',msg:'Try the External Tasks rail directly.'});
        };
        setTimeout(find,120);
      }
    });
  });
  [['Home','🏠','home'],['My Day','☀️','myday'],['My Week','📅','myweek'],['Tasks','☑','tasks'],['Notes','📝','notes'],['Projects','📁','projects'],['Goals','🎯','goals'],['Journal','✏️','journal'],['Habits','✅','habits'],['Contacts','👤','contacts'],['Mail','✉️','mail'],['Calendar','📅','calendar'],['Coach','⚡','coach'],['Settings','⚙️','settings'],['Archive','🗄','archive']].forEach(([label,icon,screen])=>items.push({type:'Nav',icon,label:'Go to '+label,meta:'',tags:'',body:'',action:()=>nav(screen)}));
  return items;
}

// Semantic search: score items by concept overlap
function semanticScore(item, tokens){
  const text=(item.label+' '+(item.meta||'')+' '+(item.tags||'')+' '+(item.body||'')).toLowerCase();
  let score=0;
  tokens.forEach(tok=>{
    if(item.label.toLowerCase().includes(tok))score+=3;
    else if((item.meta||'').toLowerCase().includes(tok))score+=2;
    else if((item.tags||'').toLowerCase().includes(tok))score+=2;
    else if(text.includes(tok))score+=1;
  });
  return score;
}

// Synonym/concept expansion map for semantic search
const SEARCH_CONCEPTS={
  meeting:['calendar','event','schedule','appointment'],
  task:['todo','action','work','do'],
  note:['notes','document','write','written'],
  contact:['person','people','colleague','client','customer'],
  goal:['objective','target','aim','okr'],
  habit:['routine','daily','streak','practice'],
  journal:['diary','reflection','entry','mood'],
  project:['initiative','programme','program','effort'],
  email:['mail','message','inbox','sent'],
  idea:['brainstorm','concept','thought','inspiration'],
};

function expandQuery(q){
  const tokens=q.toLowerCase().split(/\s+/).filter(t=>t.length>1);
  const expanded=[...tokens];
  tokens.forEach(tok=>{
    Object.entries(SEARCH_CONCEPTS).forEach(([key,synonyms])=>{
      if(key.includes(tok)||tok.includes(key))expanded.push(...synonyms);
      synonyms.forEach(s=>{if(s.includes(tok)||tok.includes(s))expanded.push(key,...synonyms);});
    });
  });
  return [...new Set(expanded)];
}

// Cross-module insights: find everything related to a query
// Stores pending actions for insight rows (keyed by temp index)
let _insightActions=[];
function aiCrossModuleInsight(q){
  if(!q.trim()){toast('Type a search query first');return;}
  const tokens=expandQuery(q);
  const allItems=getSearchItems();
  const nonNav=allItems.map((it,i)=>({it,i})).filter(({it})=>it.type!=='Nav');
  const scored=nonNav
    .map(({it,i})=>({it,i,score:semanticScore(it,tokens)}))
    .filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score)
    .slice(0,20);
  if(!scored.length){toast('No related items found for "'+q+'"');return;}
  _insightActions=scored.map(x=>x.i); // store original indices
  const groups={};
  scored.forEach((x,pos)=>{if(!groups[x.it.type])groups[x.it.type]=[];groups[x.it.type].push({it:x.it,pos,score:x.score});});
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:4px">🔍 Everything about "${esc(q)}"</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:10px">${scored.length} related items across ${Object.keys(groups).length} module${Object.keys(groups).length!==1?'s':''}:</div>
  <div style="max-height:360px;overflow-y:auto">${Object.entries(groups).map(([type,rows])=>`
    <div style="margin-bottom:10px">
      <div style="font-size:11px;font-weight:600;color:var(--t3);letter-spacing:.05em;margin-bottom:4px">${type.toUpperCase()}S (${rows.length})</div>
      ${rows.map(({it,pos,score})=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:5px;background:var(--s2);margin-bottom:3px;cursor:pointer" data-insight-pos="${pos}" onclick="closeModal();execSearch(_insightActions[${pos}])" onmouseover="this.style.background='var(--s3)'" onmouseout="this.style.background='var(--s2)'">
        <span style="font-size:14px">${it.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.label)}</div>
          ${it.meta?`<div style="font-size:11px;color:var(--t3)">${esc(it.meta)}</div>`:''}
        </div>
        <div style="font-size:11px;color:var(--ac);font-weight:600;flex-shrink:0">${score}pts</div>
      </div>`).join('')}
    </div>`).join('')}</div>
  <button class="btn btn-p" style="margin-top:8px" onclick="closeModal()">Close</button>`;
  document.getElementById('modal-capture').classList.add('show');
}
let _searchItems=null;
function getSearchItems(){if(!_searchItems)_searchItems=buildSearchIndex();return _searchItems;}
function invalidateSearchIndex(){_searchItems=null;}
// ═══════════════════════════════════════════════════════════════════════════
// COMMAND PALETTE — Cmd+K / Ctrl+K
// Centered modal overlay with universal search across the workspace plus a
// curated set of actions (navigate, create, toggle theme, apply profile…).
// Reuses getSearchItems() for the data layer and adds an Actions catalog.
// ═══════════════════════════════════════════════════════════════════════════
let _cmdpIdx=0;          // currently-highlighted row index
let _cmdpRows=[];        // flat list of {kind:'action'|'search', …}
let _cmdpRecent=JSON.parse(localStorage.getItem('lu_cmdp_recent')||'[]');

// Static action catalog — these are always available regardless of query.
// Each action has: id, title, icon, group, run(), optional meta + shortcut.
function _cmdpActions(){
  const isDark=D.prefs.darkMode!==false;
  const profs=(D.prefs.themeProfiles||[]);
  return [
    {id:'nav-home',group:'Navigate',icon:'🏠',title:'Go to Home',run:()=>nav('home')},
    {id:'nav-myday',group:'Navigate',icon:'☀',title:'Go to My Day',run:()=>nav('myday')},
    {id:'nav-tasks',group:'Navigate',icon:'📋',title:'Go to Tasks',run:()=>nav('tasks')},
    {id:'nav-notes',group:'Navigate',icon:'📝',title:'Go to Notes',run:()=>nav('notes')},
    {id:'nav-projects',group:'Navigate',icon:'📁',title:'Go to Projects',run:()=>nav('projects')},
    {id:'nav-goals',group:'Navigate',icon:'🎯',title:'Go to Goals',run:()=>nav('goals')},
    {id:'nav-habits',group:'Navigate',icon:'✅',title:'Go to Habits',run:()=>nav('habits')},
    {id:'nav-calendar',group:'Navigate',icon:'📅',title:'Go to Calendar',run:()=>nav('calendar')},
    {id:'nav-mail',group:'Navigate',icon:'✉',title:'Go to Mail',run:()=>nav('mail')},
    {id:'nav-journal',group:'Navigate',icon:'✏',title:'Go to Journal',run:()=>nav('journal')},
    {id:'nav-ideas',group:'Navigate',icon:'💡',title:'Go to Ideas',run:()=>nav('ideas')},
    {id:'nav-bookmarks',group:'Navigate',icon:'🔖',title:'Go to Bookmarks',run:()=>nav('bookmarks')},
    {id:'nav-graph',group:'Navigate',icon:'🕸',title:'Go to Knowledge Graph',run:()=>nav('graph')},
    {id:'nav-clusters',group:'Navigate',icon:'⬡',title:'Go to Clusters',run:()=>nav('clusters')},
    {id:'nav-contacts',group:'Navigate',icon:'👤',title:'Go to Contacts',run:()=>nav('contacts')},
    {id:'nav-reports',group:'Navigate',icon:'📊',title:'Go to Reports',run:()=>nav('reports')},
    {id:'nav-focus',group:'Navigate',icon:'⏱',title:'Go to Focus / Pomodoro',run:()=>nav('focus')},
    {id:'nav-process',group:'Navigate',icon:'⚡',title:'Go to Process (GTD)',run:()=>nav('process')},
    {id:'nav-settings',group:'Navigate',icon:'⚙',title:'Open Settings',run:()=>nav('settings')},
    {id:'create-task',group:'Create',icon:'📋',title:'Add new task…',shortcut:(_isMac?'⌘N':'Ctrl+N'),run:()=>openFA('task')},
    {id:'create-note',group:'Create',icon:'📝',title:'Add new note…',run:()=>openFA('note')},
    {id:'create-project',group:'Create',icon:'📁',title:'Add new project…',run:()=>openFA('project')},
    {id:'create-goal',group:'Create',icon:'🎯',title:'Add new goal…',run:()=>openFA('goal')},
    {id:'create-journal',group:'Create',icon:'✏',title:'Add new journal entry…',run:()=>openFA('journal')},
    {id:'create-idea',group:'Create',icon:'💡',title:'Capture new idea…',run:()=>openFA('idea')},
    {id:'create-bookmark',group:'Create',icon:'🔖',title:'Add new bookmark…',run:()=>showAddBookmark()},
    {id:'create-habit',group:'Create',icon:'✅',title:'Add new habit…',run:()=>openFA('habit')},
    {id:'tool-focus-start',group:'Tools',icon:'▶',title:'Start a focus timer',run:()=>{nav('focus');setTimeout(()=>{const b=document.querySelector('[onclick*="toggleFocus"]');if(b)b.click();},150);}},
    {id:'tool-toggle-dark',group:'Tools',icon:isDark?'☀':'🌙',title:isDark?'Switch to Light Mode':'Switch to Dark Mode',run:()=>{const t=document.getElementById('tog-dark');if(t)toggleDarkMode(t);else{D.prefs.darkMode=!D.prefs.darkMode;applyPrefs();save('prefs');}}},
    {id:'tool-reset-theme',group:'Tools',icon:'↺',title:'Reset theme to defaults',run:()=>resetTheme()},
    {id:'tool-save-profile',group:'Tools',icon:'💾',title:'Save current theme as profile…',run:()=>saveThemeAsProfile()},
    ...profs.map(p=>({id:'profile-'+p.id,group:'Theme Profiles',icon:p.emoji||'🎨',title:'Apply: '+p.name,run:()=>loadThemeProfile(p.id)})),
  ];
}

function openCommandPalette(){
  const ov=document.getElementById('cmdp-overlay');if(!ov)return;
  ov.classList.add('show');
  const inp=document.getElementById('cmdp-input');
  if(inp){inp.value='';renderCommandPalette('');setTimeout(()=>inp.focus(),20);}
  document.addEventListener('keydown',_cmdpEscHandler);
}
function closeCommandPalette(){
  const ov=document.getElementById('cmdp-overlay');if(!ov)return;
  ov.classList.remove('show');
  document.removeEventListener('keydown',_cmdpEscHandler);
}
function _cmdpEscHandler(e){if(e.key==='Escape'){e.preventDefault();closeCommandPalette();}}

function renderCommandPalette(q){
  const list=document.getElementById('cmdp-list');if(!list)return;
  q=(q||'').trim();
  const ql=q.toLowerCase();
  const actions=_cmdpActions();
  // Filter actions: match title OR group
  let actionRows;
  if(!q){
    // Show recent + top picks when empty
    const recentIds=new Set(_cmdpRecent);
    const recent=actions.filter(a=>recentIds.has(a.id)).slice(0,4);
    const navTop=actions.filter(a=>a.group==='Navigate').slice(0,6);
    const create=actions.filter(a=>a.group==='Create').slice(0,4);
    actionRows=[
      ...(recent.length?[{__sec:'Recent'},...recent.map(a=>({kind:'action',data:a}))]:[]),
      {__sec:'Navigate'},...navTop.map(a=>({kind:'action',data:a})),
      {__sec:'Create'},...create.map(a=>({kind:'action',data:a})),
    ];
  }else{
    const matched=actions.filter(a=>a.title.toLowerCase().includes(ql)||a.group.toLowerCase().includes(ql));
    const grouped={};matched.forEach(a=>{(grouped[a.group]=grouped[a.group]||[]).push(a);});
    actionRows=[];
    for(const g of Object.keys(grouped)){
      actionRows.push({__sec:g});
      grouped[g].forEach(a=>actionRows.push({kind:'action',data:a}));
    }
  }
  // Universal search rows (data) — only when there's a query
  let searchRows=[];
  if(q&&typeof getSearchItems==='function'){
    try{
      const items=getSearchItems();
      const tokens=typeof expandQuery==='function'?expandQuery(q):[q];
      const scored=items.map((it,i)=>({item:it,idx:i,score:typeof semanticScore==='function'?semanticScore(it,tokens):(it.label.toLowerCase().includes(ql)?1:0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,12);
      const matches=scored.length?scored:items.map((it,i)=>({item:it,idx:i,score:0})).filter(x=>x.item.label.toLowerCase().includes(ql)||(x.item.meta||'').toLowerCase().includes(ql)).slice(0,10);
      const byType={};matches.forEach(m=>{(byType[m.item.type]=byType[m.item.type]||[]).push(m);});
      for(const t of Object.keys(byType)){
        searchRows.push({__sec:t+'s'});
        byType[t].forEach(m=>searchRows.push({kind:'search',data:m.item,idx:m.idx}));
      }
    }catch(_){}
  }
  _cmdpRows=[];
  let html='';
  for(const row of actionRows.concat(searchRows)){
    if(row.__sec){
      html+=`<div class="cmdp-sec">${esc(row.__sec)}</div>`;
    }else if(row.kind==='action'){
      const a=row.data;
      const i=_cmdpRows.length;_cmdpRows.push(row);
      html+=`<div class="cmdp-row" data-i="${i}" onclick="_cmdpRun(${i})"><div class="cmdp-row-icon">${a.icon||'•'}</div><div class="cmdp-row-body"><div class="cmdp-row-title">${esc(a.title)}</div><div class="cmdp-row-meta">${esc(a.group)}</div></div>${a.shortcut?`<span class="cmdp-row-shortcut">${esc(a.shortcut)}</span>`:''}</div>`;
    }else if(row.kind==='search'){
      const it=row.data;
      const i=_cmdpRows.length;_cmdpRows.push(row);
      html+=`<div class="cmdp-row" data-i="${i}" onclick="_cmdpRun(${i})"><div class="cmdp-row-icon">${it.icon||'•'}</div><div class="cmdp-row-body"><div class="cmdp-row-title">${esc(it.label)}</div>${it.meta?`<div class="cmdp-row-meta">${esc(it.meta)}</div>`:''}</div><span class="cmdp-row-shortcut">${esc(it.type||'')}</span></div>`;
    }
  }
  if(!_cmdpRows.length){
    html=`<div class="cmdp-empty">No matches for "${esc(q)}". Try a page name (e.g. <em>Tasks</em>) or an action (e.g. <em>add note</em>).</div>`;
  }
  list.innerHTML=html;
  _cmdpIdx=0;_cmdpHighlight();
}
function _cmdpHighlight(){
  const rows=document.querySelectorAll('#cmdp-list .cmdp-row');
  rows.forEach((r,i)=>{
    if(i===_cmdpIdx){r.classList.add('active');r.scrollIntoView({block:'nearest'});}
    else r.classList.remove('active');
  });
}
function onCommandPaletteKey(e){
  if(e.key==='ArrowDown'){e.preventDefault();_cmdpIdx=Math.min(_cmdpIdx+1,_cmdpRows.length-1);_cmdpHighlight();}
  else if(e.key==='ArrowUp'){e.preventDefault();_cmdpIdx=Math.max(_cmdpIdx-1,0);_cmdpHighlight();}
  else if(e.key==='Enter'){e.preventDefault();_cmdpRun(_cmdpIdx);}
  else if(e.key==='Escape'){e.preventDefault();closeCommandPalette();}
}
function _cmdpRun(i){
  const row=_cmdpRows[i];if(!row)return;
  closeCommandPalette();
  if(row.kind==='action'){
    // Record recent
    _cmdpRecent=[row.data.id,..._cmdpRecent.filter(x=>x!==row.data.id)].slice(0,8);
    try{localStorage.setItem('lu_cmdp_recent',JSON.stringify(_cmdpRecent));}catch(_){}
    try{row.data.run();}catch(e){toast('Action failed: '+(e.message||e));}
  }else if(row.kind==='search'&&typeof execSearch==='function'){
    execSearch(row.idx);
  }
}

function onSearchInput(q){
  const drop=document.getElementById('search-drop');
  q=q.trim();
  if(!q){drop.classList.remove('show');searchIdx=0;return;}
  const items=getSearchItems();
  const tokens=expandQuery(q);
  // Semantic scoring: annotate original items with score, preserving index reference
  const scored=items
    .map((it,i)=>({item:it,idx:i,score:semanticScore(it,tokens)}))
    .filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score)
    .slice(0,14);
  // Fallback to substring match if semantic returns nothing
  const ql=q.toLowerCase();
  const matches=scored.length
    ?scored
    :items.map((it,i)=>({item:it,idx:i,score:0})).filter(x=>x.item.label.toLowerCase().includes(ql)||(x.item.meta||'').toLowerCase().includes(ql)).slice(0,12);
  if(!matches.length){
    drop.innerHTML=`<div class="sd-empty">No results for "${esc(q)}"</div><div class="sd-hint"><span>Press <kbd>Esc</kbd> to close</span></div>`;
    drop.classList.add('show');return;
  }
  const groups={};
  matches.forEach(({item,idx})=>{if(!groups[item.type])groups[item.type]=[];groups[item.type].push({item,idx});});
  let html='';
  Object.entries(groups).forEach(([type,rows])=>{
    html+=`<div class="sd-sec">${type}s</div>`;
    rows.forEach(({item,idx})=>{
      html+=`<div class="sd-row" onclick="execSearch(${idx})"><span class="sd-icon">${item.icon}</span><span class="sd-label">${esc(item.label)}</span>${item.meta?`<span class="sd-meta">${esc(item.meta)}</span>`:''}</div>`;
    });
  });
  // Cross-module insights button
  const qEsc=q.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  html+=`<div class="sd-hint" style="border-top:1px solid var(--bd2);padding-top:6px;margin-top:4px;display:flex;justify-content:space-between;align-items:center">`+
    `<span><kbd>↑↓</kbd> navigate &nbsp; <kbd>Enter</kbd> open &nbsp; <kbd>Esc</kbd> close</span>`+
    `<button class="btn btn-s" style="font-size:10px;height:20px;padding:0 6px;color:var(--ac)" onclick="closeSearch();aiCrossModuleInsight('${qEsc}')">🔍 All related</button>`+
    `</div>`;
  drop.innerHTML=html;
  drop.classList.add('show');
  searchIdx=0;
  highlightSearchRow();
}
function onSearchFocus(){
  const q=document.getElementById('gSearch').value.trim();
  if(q) onSearchInput(q);
}
function onSearchKey(e){
  const drop=document.getElementById('search-drop');
  if(!drop.classList.contains('show'))return;
  const rows=drop.querySelectorAll('.sd-row');
  if(e.key==='ArrowDown'){e.preventDefault();searchIdx=Math.min(searchIdx+1,rows.length-1);highlightSearchRow();}
  else if(e.key==='ArrowUp'){e.preventDefault();searchIdx=Math.max(searchIdx-1,0);highlightSearchRow();}
  else if(e.key==='Enter'){e.preventDefault();const active=drop.querySelector('.sd-row.active');if(active)active.click();}
  else if(e.key==='Escape'){closeSearch();}
}
function highlightSearchRow(){
  const drop=document.getElementById('search-drop');
  drop.querySelectorAll('.sd-row').forEach((r,i)=>{r.classList.toggle('active',i===searchIdx);if(i===searchIdx)r.scrollIntoView({block:'nearest'});});
}
function execSearch(idx){
  const items=getSearchItems();
  if(items[idx]){items[idx].action();closeSearch();}
}
function closeSearch(){
  document.getElementById('search-drop').classList.remove('show');
  document.getElementById('gSearch').value='';
  searchIdx=0;
}
document.addEventListener('click',e=>{
  if(!e.target.closest('.tb-s'))closeSearch();
});

// ====== START FRESH MY DAY ======
function startFreshMyDay(){
  if(!confirm('Start Fresh will clear all My Day selections. Incomplete tasks will be marked as Carry Over. Continue?'))return;
  D.tasks.forEach(t=>{
    if(t.myDay&&t.status==='Done'){t.myDay=false;}
    else if(t.myDay&&t.status!=='Done'){t.myDay=false;t.due='Carry Over';}
  });
  save('tasks');
  invalidateSearchIndex();
  renderScreen('myday');
  toast('\u2600\ufe0f My Day cleared \u2014 ready to plan a fresh day!');
}

// ====== SCHEDULE MY DAY ======
function scheduleMyDay(){
  const tasks=D.tasks.filter(t=>t.myDay&&t.status!=='Done');
  if(!tasks.length){toast('No My Day tasks to schedule. Select some tasks in Plan first.');return;}
  const startHour=parseInt(prompt('What time should your day start? (24h, e.g. 9 for 9:00 AM)','9')||'9');
  if(isNaN(startHour)||startHour<0||startHour>23){toast('Invalid start time.');return;}
  // Sort: High priority first, then by existing due date
  const sorted=[...tasks].sort((a,b)=>{
    const pOrd={High:0,Medium:1,Low:2};
    if(pOrd[a.priority]!==pOrd[b.priority])return pOrd[a.priority]-pOrd[b.priority];
    return 0;
  });
  let cursor=startHour*60; // minutes from midnight
  sorted.forEach(t=>{
    const dur=t.estimatedMins||30;
    const hh=Math.floor(cursor/60);
    const mm=cursor%60;
    const endMin=cursor+dur;
    const eh=Math.floor(endMin/60);
    const em=endMin%60;
    const fmt=h=>String(h).padStart(2,'0');
    t.startTime=`${fmt(hh)}:${fmt(mm)}`;
    t.endTime=`${fmt(eh)}:${fmt(em)}`;
    cursor+=dur+5; // 5-min buffer between tasks
    const real=D.tasks.find(x=>x.id===t.id);
    if(real){real.startTime=t.startTime;real.endTime=t.endTime;}
  });
  save('tasks');
  renderScreen('myday');
  const total=sorted.reduce((s,t)=>s+(t.estimatedMins||30),0);
  const endH=Math.floor((startHour*60+total+(sorted.length-1)*5)/60);
  const endM=(startHour*60+total+(sorted.length-1)*5)%60;
  toast(`🗓 Scheduled ${sorted.length} tasks — ${startHour}:00 to ${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`);
}

// ====== PROFILE UI SYNC ======
function updateProfileUI(){
  const name=D.creds.userName||'';
  const email=D.creds.email||'';
  const initials=name.split(' ').map(w=>w[0]||'').join('').substring(0,2).toUpperCase();
  // Update topbar and sidebar avatars — show photo if set, otherwise initials
  document.querySelectorAll('#sb-avatar,#topbar-avatar').forEach(el=>{
    if(D.creds.avatar){
      // Swap to img element if not already
      if(el.tagName!=='IMG'){
        const img=document.createElement('img');
        img.src=D.creds.avatar;
        img.alt=name;
        img.className=el.className;
        img.id=el.id;
        img.style.cssText='width:28px;height:28px;border-radius:50%;object-fit:cover;cursor:pointer';
        if(el.id==='topbar-avatar'){img.onclick=()=>nav('settings');}
        if(el.id==='sb-avatar'){img.style.cssText='width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0';}
        el.parentNode.replaceChild(img,el);
      }else{
        el.src=D.creds.avatar;
      }
    }else{
      // Swap back to div if currently an img
      if(el.tagName==='IMG'){
        const div=document.createElement('div');
        div.className=el.className;
        div.id=el.id;
        div.textContent=initials;
        if(el.id==='topbar-avatar'){div.onclick=()=>nav('settings');}
        el.parentNode.replaceChild(div,el);
      }else{
        el.textContent=initials;
      }
    }
  });
  document.querySelectorAll('#sb-name').forEach(el=>el.textContent=name);
  document.querySelectorAll('#sb-email').forEach(el=>el.textContent=email);
}
function uploadUserAvatar(){
  const input=document.createElement('input');
  input.type='file';
  input.accept='image/jpeg,image/png,image/webp,image/gif';
  input.onchange=()=>{
    const file=input.files&&input.files[0];
    if(!file)return;
    if(file.size>10*1024*1024){toast('⚠️ Image must be under 10 MB');return;}
    const reader=new FileReader();
    reader.onload=(e)=>{
      const img=new Image();
      img.onload=()=>{
        // Reuse the team member avatar crop modal
        _avatarMemberId='__user__';
        _avatarImg=img;
        _avatarOffX=0;_avatarOffY=0;
        const zoomEl=document.getElementById('avatar-zoom');
        if(zoomEl){zoomEl.value='1';}
        const modal=document.getElementById('avatar-crop-modal');
        if(modal){
          // Retitle the modal for user avatar
          const title=modal.querySelector('div[style*="font-size:15px"]');
          if(title)title.textContent='📷 Crop Profile Photo';
          // Override the save button to call saveUserAvatarCrop
          const btn=document.getElementById('avatar-crop-save-btn');
          if(btn){btn.onclick=saveUserAvatarCrop;}
          modal.style.display='flex';
        }
        _avatarDraw();
        _avatarBindEvents();
      };
      img.src=e.target.result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}
async function saveUserAvatarCrop(){
  const canvas=document.getElementById('avatar-crop-canvas');
  if(!canvas)return;
  const btn=document.getElementById('avatar-crop-save-btn');
  if(btn){btn.disabled=true;btn.textContent='Saving…';}
  try{
    const dataUrl=canvas.toDataURL('image/jpeg',0.92);
    const res=await _trpc('userProfile.uploadAvatar',{dataUrl,mimeType:'image/jpeg'},'mutation');
    D.creds.avatar=res.url;
    saveAll();
    closeAvatarCrop();
    // Re-render settings to show new avatar
    renderSettings();
    updateProfileUI();
    toast('✅ Profile photo updated!');
  }catch(err){
    console.error('User avatar upload error:',err);
    toast('❌ Upload failed: '+(err.message||'Unknown error'));
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Save Photo';}
    // Restore save button to team avatar handler
    const btn2=document.getElementById('avatar-crop-save-btn');
    if(btn2)btn2.onclick=saveAvatarCrop;
  }
}
function removeUserAvatar(){
  delete D.creds.avatar;
  saveAll();
  renderSettings();
  updateProfileUI();
  toast('🗑️ Profile photo removed');
}
function updateProfileCompleteness(){
  // Update the progress bar and missing-fields text live without re-rendering the full settings panel
  const fields=[
    {label:'Photo',done:!!D.creds.avatar},
    {label:'Bio',done:!!(D.creds.bio&&D.creds.bio.trim())},
    {label:'Job Title',done:!!(D.creds.jobTitle&&D.creds.jobTitle.trim())},
    {label:'Timezone',done:!!(D.creds.tz&&D.creds.tz.trim())}
  ];
  const pct=Math.round(fields.filter(f=>f.done).length/fields.length*100);
  const color=pct===100?'var(--ok)':pct>=50?'var(--ac)':'var(--warn)';
  const missing=fields.filter(f=>!f.done).map(f=>f.label);
  // The completeness bar is inside the profile header card — find it by its unique structure
  const bar=document.querySelector('#sp-0 [style*="transition:width"]');
  if(bar){bar.style.width=pct+'%';bar.style.background=color;}
  // Update the percentage text and missing fields hint
  const pctSpan=document.querySelector('#sp-0 span');
  document.querySelectorAll('#sp-0 span').forEach(el=>{
    if(el.textContent&&el.textContent.includes('% complete')){
      el.textContent='Profile '+pct+'% complete';
    }
  });
  document.querySelectorAll('#sp-0 span').forEach(el=>{
    if(el.textContent&&(el.textContent.startsWith('Add:') || el.textContent.includes('All done'))){
      el.textContent=missing.length?'Add: '+missing.join(', '):'\u2713 All done!';
      el.style.color=missing.length?'var(--t3)':'var(--ok)';
    }
  });
}

// ====== MY DAY AUTO-RESET + HABIT RESET ======
function checkMyDayReset(){
  const today=new Date().toDateString();
  const lastReset=localStorage.getItem('lu_myday_reset');
  if(lastReset===today)return;
  // Reset My Day task flags
  let changed=false;
  D.tasks.forEach(t=>{
    if(t.myDay&&t.status==='Done'){t.myDay=false;changed=true;}
    if(t.due==='Today'&&t.status!=='Done'){t.due='Overdue';changed=true;}
  });
  if(changed)save('tasks');
  // Reset habit completion flags for a new day
  // Also break streaks for habits that were not done/skipped yesterday
  const todayDate=new Date();todayDate.setHours(0,0,0,0);
  const yesterdayDate=new Date(todayDate);yesterdayDate.setDate(todayDate.getDate()-1);
  const yesterdayStr=yesterdayDate.toISOString().split('T')[0];
  let habitsChanged=false;
  D.habits.forEach(h=>{
    if(h.doneToday||h.skippedToday){
      // If habit was done or skipped, record it for yesterday before clearing
      if(h.doneToday){
        if(!h.completedDates)h.completedDates=[];
        if(!h.completedDates.includes(yesterdayStr))h.completedDates.push(yesterdayStr);
      } else if(h.skippedToday){
        if(!h.skippedDates)h.skippedDates=[];
        if(!h.skippedDates.includes(yesterdayStr))h.skippedDates.push(yesterdayStr);
      }
      h.doneToday=false;
      h.skippedToday=false;
      habitsChanged=true;
    } else {
      // Habit was NOT done or skipped yesterday — recalculate streak using cadence-aware logic
      if((h.streak||0)>0){
        const newStreak=calcHabitStreak(h);
        if(newStreak!==h.streak){
          h.streak=newStreak;
          habitsChanged=true;
        }
      }
    }
  });
  if(habitsChanged)save('habits');
  localStorage.setItem('lu_myday_reset',today);
}
function scheduleMidnightReset(){
  const now=new Date();
  const midnight=new Date(now);
  midnight.setHours(24,0,0,500);
  const ms=midnight-now;
  setTimeout(()=>{
    checkMyDayReset();
    renderScreen(curScreen);
    toast('☀️ New day! My Day has been refreshed.');
    scheduleMidnightReset();
  },ms);
}

// ====== GOAL AUTO-PROGRESS CALCULATION ======
function autoCalcGoalPct(g){
  // Respect manual override: if the user typed a Progress % in the drawer
  // we record g.pctManual=true and the auto-calc skips this goal. Without
  // this gate, every render of the Goals page would overwrite the manual
  // value with the linked-tasks/milestones formula — so users reported
  // that "the Progress % won't save". A "↺ Reset to auto" link in the
  // drawer clears the flag.
  if(g.pctManual)return;
  // Weight: 60% linked tasks completion, 40% milestones completion
  const tasks=D.tasks.filter(t=>(g.linkedTaskIds||[]).includes(t.id));
  const ms=g.milestones||[];
  const taskScore=tasks.length?tasks.filter(t=>t.status==='Done').length/tasks.length:null;
  const msScore=ms.length?ms.filter(m=>m.done).length/ms.length:null;
  if(taskScore===null&&msScore===null)return; // no linked data, keep manual pct
  const weights=taskScore!==null&&msScore!==null?[0.6,0.4]:[1,0];
  const scores=[taskScore!==null?taskScore:msScore,msScore!==null?msScore:taskScore];
  g.pct=Math.round((scores[0]*weights[0]+scores[1]*weights[1])*100);
  save('goals');
}

// ====== RECURRING TASK AUTO-GENERATION ======
function addDays(dateStr,n){
  if(!dateStr)return '';
  const d=new Date(dateStr);
  if(isNaN(d))return dateStr;
  d.setDate(d.getDate()+n);
  return d.toISOString().split('T')[0];
}
function recurringOffset(cadence){
  if(cadence==='Daily')return 1;
  if(cadence==='Weekly')return 7;
  if(cadence==='Bi-weekly')return 14;
  if(cadence==='Monthly')return 30;
  return 0;
}
function maybeSpawnRecurring(task){
  if(!task.recurring||task.recurring==='None')return;
  const offset=recurringOffset(task.recurring);
  if(!offset)return;
  // Avoid duplicates: check if a future instance already exists
  const alreadyExists=D.tasks.some(t=>t._recurringFrom===task.id&&t.status!=='Done');
  if(alreadyExists)return;
  const newTask=Object.assign({},task,{
    id:nextId(D.tasks),
    status:'Not Started',
    myDay:false,
    doneToday:false,
    subtasks:(task.subtasks||[]).map(s=>({...s,done:false})),
    due:addDays(task.due,offset),
    startDate:addDays(task.startDate,offset),
    endDate:addDays(task.endDate,offset),
    _recurringFrom:task.id,
  });
  D.tasks.push(newTask);
  save('tasks');
  toast('🔁 Next '+task.recurring.toLowerCase()+' instance created: '+esc(task.title));
}

// ====== KEYBOARD SHORTCUTS ======
document.addEventListener('keydown',e=>{
  // Always allow Escape regardless of shortcut preference
  const _kbEnabled=!(D.prefs&&D.prefs.keyboardShortcuts===false);
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT'||e.target.isContentEditable)return;
  if(!_kbEnabled){
    // Escape still works even when shortcuts are disabled
    if(e.key==='Escape'){closeModal();closeDrawer();document.getElementById('ai-panel').classList.remove('show');closeSearch();if(typeof _tourOverlayActive!=='undefined'&&_tourOverlayActive)exitTour();if(typeof _helpDrawerOpen!=='undefined'&&_helpDrawerOpen)closeHelpDrawer();}
    return;
  }
  // Single-letter navigation — plain keypresses only. Without the modifier
  // guard these hijacked Ctrl+F (find), Ctrl+P (print), Ctrl/Cmd+D (bookmark).
  if(!e.ctrlKey&&!e.metaKey&&!e.altKey){
    if(e.key==='d')nav('myday');if(e.key==='w')nav('myweek');if(e.key==='y')nav('myyear');if(e.key==='p')nav('process');if(e.key==='i')nav('ideas');if(e.key==='f')nav('focus');
  }
  if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();openCommandPalette()}
  if((e.ctrlKey||e.metaKey)&&e.key==='j'){e.preventDefault();toggleAIPanel()}
  // Cmd/Ctrl + / opens the Ask LevelUp universal Q&A overlay. Different
  // mental model from Cmd+J (persistent chat) vs Cmd+K (navigate) — this
  // is "ask one question and get cited answer back."
  if((e.ctrlKey||e.metaKey)&&e.key==='/'){e.preventDefault();if(typeof aiAskLevelup==='function')aiAskLevelup();}
  // '?' anywhere (when not typing) opens the keyboard shortcuts overlay.
  if(e.key==='?'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    const t=e.target;
    const typing=t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable);
    if(!typing){e.preventDefault();openShortcuts();}
  }
  if((e.ctrlKey||e.metaKey)&&e.key==='n'){e.preventDefault();openFA('task')}
  // NOTE: '?' and Ctrl/Cmd+/ were each bound TWICE in this handler — '?' opened
  // the shortcuts overlay AND navigated to Help; Ctrl+/ opened Ask LevelUp AND
  // the Help drawer, all on one keypress. The shortcuts overlay and Ask LevelUp
  // (both bound above) win; Help stays reachable via sidebar + command palette.
  if(e.key==='Escape'){
    closeModal();closeDrawer();
    document.getElementById('ai-panel').classList.remove('show');
    closeSearch();
    if(_tourOverlayActive)exitTour();
    if(_helpDrawerOpen)closeHelpDrawer();
  }
});

// ====== LOGIN ======
let _loginSelectedMember=null;
// ---- Email + Password Login ----
function showLoginTab(tab){
  const boxes=['signin','register','forgot','reset'];
  boxes.forEach(id=>{
    const el=document.getElementById('login-box-'+id);
    if(el)el.style.display='none';
  });
  const target=document.getElementById('login-box-'+tab);
  if(target)target.style.display='';
  // Focus first input in the shown box
  setTimeout(()=>{
    if(tab==='signin'){const e=document.getElementById('login-email');if(e)e.focus();}
    else if(tab==='register'){const n=document.getElementById('reg-name');if(n)n.focus();}
    else if(tab==='forgot'){const e=document.getElementById('forgot-email');if(e)e.focus();}
    else if(tab==='reset'){const p=document.getElementById('reset-password');if(p)p.focus();}
  },50);
}
function toggleLoginPwVis(){
  const pw=document.getElementById('login-password');
  const btn=document.getElementById('login-pw-toggle');
  if(!pw)return;
  if(pw.type==='password'){pw.type='text';if(btn)btn.textContent='🙈';}
  else{pw.type='password';if(btn)btn.textContent='👁';}
}
function loginFieldKey(e){
  if(e.key==='Enter')attemptLogin();
}
function registerFieldKey(e){
  if(e.key==='Enter')attemptRegister();
}
function forgotFieldKey(e){
  if(e.key==='Enter')attemptForgotPassword();
}
function resetFieldKey(e){
  if(e.key==='Enter')attemptResetPassword();
}
function initLoginScreen(){
  // Check for reset_token in URL
  const sp=new URLSearchParams(window.location.search);
  const resetToken=sp.get('reset_token');
  if(resetToken){
    // Store token for use in attemptResetPassword
    window._pendingResetToken=resetToken;
    showLoginTab('reset');
    return;
  }
  // Try to restore session from JWT cookie (handles OAuth callback redirects and page refreshes)
  // If the cookie is valid, auth.me returns the user and we skip the login screen entirely
  const _sessionCheck=document.getElementById('login-session-check');
  const _formWrapper=document.getElementById('login-form-wrapper');
  if(_sessionCheck)_sessionCheck.style.display='flex';
  if(_formWrapper)_formWrapper.style.display='none';
  _trpc('auth.me',{},'query').then(user=>{
    if(user&&user.id){
      // Restore session: build member object from server response
      const member={id:user.id,name:user.name||'User',email:user.email||'',role:user.role||'user',rememberMe:true};
      doLoginSuccess(member);
    } else {
      // No valid session — show login form
      if(_sessionCheck)_sessionCheck.style.display='none';
      if(_formWrapper)_formWrapper.style.display='';
      setTimeout(()=>{const e=document.getElementById('login-email');if(e)e.focus();},100);
    }
  }).catch(()=>{
    // Network error or no session — show login form
    if(_sessionCheck)_sessionCheck.style.display='none';
    if(_formWrapper)_formWrapper.style.display='';
    setTimeout(()=>{const e=document.getElementById('login-email');if(e)e.focus();},100);
  });
}
async function attemptLogin(){
  const email=(document.getElementById('login-email')||{}).value||'';
  const password=(document.getElementById('login-password')||{}).value||'';
  const rememberMe=!!(document.getElementById('login-remember')||{}).checked;
  const errEl=document.getElementById('login-err');
  const btn=document.getElementById('login-submit-btn');
  if(!email.trim()){if(errEl)errEl.textContent='Please enter your email address.';return;}
  if(!password){if(errEl)errEl.textContent='Please enter your password.';return;}
  if(btn){btn.disabled=true;btn.innerHTML='<svg style="display:inline;animation:spin 1s linear infinite;vertical-align:middle;margin-right:6px" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Signing in…';}
  if(errEl)errEl.textContent='';
  try{
    const res=await _trpc('emailAuth.login',{email:email.trim().toLowerCase(),password,rememberMe},'mutation');
    if(res&&res.success){
      // Store minimal local session for app state
      const userData={id:res.user.id,name:res.user.name,email:res.user.email,role:res.user.role,rememberMe};
      doLoginSuccess(userData);
    } else {
      if(errEl)errEl.textContent='Login failed. Please try again.';
    }
  } catch(err){
    const msg=(err&&err.message)||'Invalid email or password';
    if(errEl)errEl.textContent=msg;
  } finally {
    if(btn){btn.disabled=false;btn.textContent='Sign In';}
  }
}
async function attemptRegister(){
  const name=(document.getElementById('reg-name')||{}).value||'';
  const email=(document.getElementById('reg-email')||{}).value||'';
  const password=(document.getElementById('reg-password')||{}).value||'';
  const errEl=document.getElementById('reg-err');
  const btn=document.getElementById('reg-submit-btn');
  if(!name.trim()){if(errEl)errEl.textContent='Please enter your full name.';return;}
  if(!email.trim()){if(errEl)errEl.textContent='Please enter your email address.';return;}
  if(password.length<8){if(errEl)errEl.textContent='Password must be at least 8 characters.';return;}
  if(btn){btn.disabled=true;btn.innerHTML='<svg style="display:inline;animation:spin 1s linear infinite;vertical-align:middle;margin-right:6px" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Creating account…';}
  if(errEl)errEl.textContent='';
  try{
    const res=await _trpc('emailAuth.register',{name:name.trim(),email:email.trim().toLowerCase(),password},'mutation');
    if(res&&res.success){
      const userData={id:res.user.id,name:res.user.name,email:res.user.email,role:res.user.role};
      doLoginSuccess(userData);
    } else {
      if(errEl)errEl.textContent='Registration failed. Please try again.';
    }
  } catch(err){
    const msg=(err&&err.message)||'Registration failed';
    if(errEl)errEl.textContent=msg;
  } finally {
    if(btn){btn.disabled=false;btn.textContent='Create Account';}
  }
}
async function attemptForgotPassword(){
  const email=(document.getElementById('forgot-email')||{}).value||'';
  const errEl=document.getElementById('forgot-err');
  const successEl=document.getElementById('forgot-success');
  const btn=document.getElementById('forgot-submit-btn');
  if(!email.trim()){if(errEl)errEl.textContent='Please enter your email address.';return;}
  if(errEl)errEl.textContent='';
  if(successEl){successEl.style.display='none';successEl.textContent='';}
  if(btn){btn.disabled=true;btn.innerHTML='<svg style="display:inline;animation:spin 1s linear infinite;vertical-align:middle;margin-right:6px" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Sending…';}
  try{
    const res=await _trpc('emailAuth.forgotPassword',{email:email.trim().toLowerCase(),origin:window.location.origin},'mutation');
    if(successEl){
      successEl.textContent='✓ Reset link sent! Check your email (or the app owner notification).';
      successEl.style.display='block';
    }
    if(btn)btn.style.display='none';
    // In dev mode, show the token directly
    if(res&&res.devToken){
      if(errEl){errEl.style.color='var(--ac)';errEl.textContent='Dev mode: token = '+res.devToken;}
    }
  } catch(err){
    const msg=(err&&err.message)||'Failed to send reset email';
    if(errEl)errEl.textContent=msg;
  } finally {
    if(btn&&btn.style.display!=='none'){btn.disabled=false;btn.textContent='Send Reset Link';}
  }
}
async function attemptResetPassword(){
  const newPw=(document.getElementById('reset-password')||{}).value||'';
  const confirmPw=(document.getElementById('reset-confirm')||{}).value||'';
  const token=window._pendingResetToken||new URLSearchParams(window.location.search).get('reset_token')||'';
  const errEl=document.getElementById('reset-err');
  const successEl=document.getElementById('reset-success');
  const btn=document.getElementById('reset-submit-btn');
  if(!token){if(errEl)errEl.textContent='Invalid reset link. Please request a new one.';return;}
  if(newPw.length<8){if(errEl)errEl.textContent='Password must be at least 8 characters.';return;}
  if(newPw!==confirmPw){if(errEl)errEl.textContent='Passwords do not match.';return;}
  if(errEl)errEl.textContent='';
  if(successEl){successEl.style.display='none';successEl.textContent='';}
  if(btn){btn.disabled=true;btn.innerHTML='<svg style="display:inline;animation:spin 1s linear infinite;vertical-align:middle;margin-right:6px" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Updating…';}
  try{
    const res=await _trpc('emailAuth.resetPassword',{token,newPassword:newPw,confirmPassword:confirmPw},'mutation');
    if(res&&res.success){
      if(successEl){
        successEl.textContent='✓ Password updated! Redirecting to sign in…';
        successEl.style.display='block';
      }
      // Clear token from URL and redirect to sign in
      window._pendingResetToken=null;
      const url=new URL(window.location.href);
      url.searchParams.delete('reset_token');
      window.history.replaceState({},document.title,url.toString());
      setTimeout(()=>showLoginTab('signin'),2000);
    }
  } catch(err){
    const msg=(err&&err.message)||'Failed to reset password';
    if(errEl)errEl.textContent=msg;
  } finally {
    if(btn){btn.disabled=false;btn.textContent='Update Password';}
  }
}
function doLoginSuccess(member){
  // Session duration: 30 days if rememberMe, else 1 day (matches JWT cookie)
  const sessionMs=member.rememberMe?30*24*60*60*1000:24*60*60*1000;
  localStorage.setItem('lu_session',JSON.stringify({memberId:member.id,name:member.name,expires:Date.now()+sessionMs}));
  // Update creds to reflect logged-in user
  D.creds.userName=member.name||'User';
  D.creds.email=member.email||'';
  D.creds.role=member.role||'Member';
  // Tag the body so admin-only / admin-hide-only CSS gates apply correctly
  document.body.setAttribute('data-role', String(D.creds.role||'Member').toLowerCase()==='admin'?'admin':'user');
  D.creds.color=member.color||'var(--ac)';
  localStorage.setItem('lu_creds',JSON.stringify(D.creds));
  // Apply permissions
  applyUserPerms(member);
  // Hide login overlay
  const ov=document.getElementById('login-overlay');
  if(ov)ov.classList.add('hidden');
  // Check for expiring OAuth tokens and show banner if needed
  setTimeout(()=>checkTokenExpiryBanner(),1500);
  // Re-check every 60 seconds so the button state stays current
  setInterval(()=>checkTokenExpiryBanner(),60*1000);
  // Seed example tasks ONCE only — guarded by a localStorage flag so deleted tasks stay deleted
  const _seedKey='lu_examples_seeded_v1';
  if(!localStorage.getItem(_seedKey)){
    const exampleIds=[201,202,203];
    exampleIds.forEach(eid=>{
      if(!D.tasks.find(t=>t.id===eid)){
        const defaults=[{id:201,title:'Design Q3 Sprint Planning Workshop',priority:'High',due:'2026-05-10',startDate:'2026-05-08',endDate:'2026-05-10',startTime:'10:00',endTime:'12:00',estimatedMins:120,context:'Deep Work',project:'LevelUp Platform',projectId:1,status:'Not Started',myDay:true,energy:'high',tags:['planning','leadership','sprint'],notes:'Prepare agenda, invite all team leads, set up Miro board for async pre-work. Goal: align on Q3 OKRs and define sprint 8 scope with clear acceptance criteria for each story.',recurring:'None',subtasks:[{id:1,title:'Draft workshop agenda',done:false},{id:2,title:'Send calendar invites',done:false},{id:3,title:'Set up Miro collaboration board',done:false},{id:4,title:'Prepare OKR alignment slides',done:false}],linkedGoalId:1,assignedTo:'Idris Grant',createdBy:'Idris Grant'},{id:202,title:'Competitive Analysis — Top 5 Productivity Apps',priority:'Medium',due:'2026-05-15',startDate:'2026-05-12',endDate:'2026-05-15',startTime:'09:00',endTime:'11:00',estimatedMins:180,context:'Research',project:'Second Brain Research',projectId:3,status:'Not Started',myDay:false,energy:'medium',tags:['research','strategy','competitive'],notes:'Analyze Notion, Obsidian, Roam, Logseq, and Mem.ai. Focus on: pricing, AI features, target persona, onboarding flow, and key differentiators. Produce a 1-page comparison matrix.',recurring:'None',subtasks:[{id:1,title:'Create comparison matrix template',done:false},{id:2,title:'Research Notion and Obsidian',done:false},{id:3,title:'Research Roam, Logseq, Mem.ai',done:false},{id:4,title:'Write executive summary',done:false}],linkedGoalId:null,assignedTo:'Marcus Webb',createdBy:'Marcus Webb'},{id:203,title:'Prepare Monthly Stakeholder Report',priority:'High',due:'2026-04-30',startDate:'2026-04-28',endDate:'2026-04-30',startTime:'14:00',endTime:'16:00',estimatedMins:90,context:'Admin',project:'Fundraising',projectId:2,status:'In Progress',myDay:true,energy:'medium',tags:['reporting','investors','monthly'],notes:'Include: MRR growth, user acquisition metrics, key product milestones, burn rate, and 30-day outlook. Use the standard investor update template. Send by April 30 EOD.',recurring:'Monthly',subtasks:[{id:1,title:'Pull metrics from dashboard',done:true},{id:2,title:'Write narrative summary',done:false},{id:3,title:'Format with template',done:false},{id:4,title:'Review with Priya before sending',done:false}],linkedGoalId:2,assignedTo:'Idris Grant',createdBy:'Idris Grant'}];
        const ex=defaults.find(x=>x.id===eid);
        if(ex)D.tasks.push(ex);
      }
    });
    save('tasks');
    localStorage.setItem(_seedKey,'1');
  }
  // One-time migration: reassign every existing habit's createdBy to the
  // current user, so single-user installs see all seeded habits under
  // 'My Habits'. Guarded by a localStorage flag — runs once per device.
  // Also re-applied inside loadServerData() in case habits arrive from the
  // server after this point.
  if(typeof reassignHabitsToOwner==='function')reassignHabitsToOwner();
  // One-time: migrate notes flagged favorite→starred so the Favorites view shows them.
  if(typeof _backfillNoteStarredFromFavorite==='function')_backfillNoteStarredFromFavorite();
  // Load workspace-shared AI keys (admin manages, everyone uses)
  if(typeof loadSharedAISettings==='function')loadSharedAISettings();
  // Catch-up: send any scheduled reports whose time has passed. Fired ~6s
  // after login so the rest of the boot finishes first.
  if(typeof _checkReportSchedules==='function')setTimeout(()=>_checkReportSchedules().catch(()=>{}),6000);
  // Boot app
  applyPrefs();
  // Start the AI/news assistant ticker if enabled (default: on)
  try{
    if(!(D.prefs&&D.prefs.notifications&&D.prefs.notifications.aiInsights===false)){
      if(typeof startAIAssistant==='function')startAIAssistant();
    }
  }catch(_){}
  checkMyDayReset();
  scheduleMidnightReset();
  // Respect Default Home Screen preference
  const _homeScreen=(D.prefs&&D.prefs.homeScreen||'Dashboard').toLowerCase();
  const _homeMap={dashboard:'home',tasks:'tasks',calendar:'calendar',notes:'notes',habits:'habits',journal:'journal',goals:'goals',contacts:'contacts'};
  const _homeKey=_homeMap[_homeScreen]||'home';
  initSidebars(_homeKey);
  updateProfileUI();
  renderScreen(_homeKey);
  updateSidebarBadges();
  // Load server-side data (restores data across deployments and devices)
  setTimeout(loadServerData,300);
  // Team-visibility: pull tasks shared with me (assigned-to-me / admin view)
  // after my own data has loaded. Kept separate from D.tasks; read-only.
  setTimeout(()=>{ if(typeof _loadSharedTasks==='function')_loadSharedTasks(); },1600);
  setTimeout(()=>{ if(typeof _loadSharedProjects==='function')_loadSharedProjects(); },1800);
  setTimeout(()=>{ if(typeof _loadSharedPrograms==='function')_loadSharedPrograms(); },2000);
  setTimeout(()=>{ if(typeof _loadSharedMindMaps==='function')_loadSharedMindMaps(); },2200);
  setTimeout(()=>{ if(typeof _loadSharedReports==='function')_loadSharedReports(); },2400);
  setTimeout(()=>{ if(typeof _loadSharedNotes==='function')_loadSharedNotes(); },2600);
  // Load the real workspace roster so assignment dropdowns include invited
  // members (e.g. new hires) that aren't in the local D.teams blob.
  setTimeout(()=>{ if(typeof _loadWorkspaceMembers==='function')_loadWorkspaceMembers(); },900);
  // Pull external-source tasks (Smartsheet/Nifty) into D.externalTasks.
  // Independent of loadServerData — its own table, its own endpoint, its
  // own failure mode (no token / no watches = empty array, never throws).
  setTimeout(()=>{ if(typeof loadExternalTasks==='function') loadExternalTasks().then(()=>{ if(typeof renderScreen==='function') renderScreen(curScreen); }); },800);
  // Pull recent time entries into D.timeEntries. Powers the Command Center
  // time tile + Reports `time` source. Same independent-failure pattern.
  setTimeout(()=>{ if(typeof loadTimeEntries==='function') loadTimeEntries().catch(()=>{}); },1500);
  // Hydrate the topbar Push button count on boot.
  setTimeout(()=>{ if(typeof _refreshPendingCount==='function') _refreshPendingCount(); },1000);
  // Reattach to a running timer if the user reloaded mid-session.
  setTimeout(()=>{ if(typeof _restoreRunningTimer==='function') _restoreRunningTimer(); },1200);
  // Show onboarding splash on first-ever login
  const _splashKey='lu_splash_shown_v1';
  if(!localStorage.getItem(_splashKey)){
    localStorage.setItem(_splashKey,'1');
    showSplashScreen(member.name.split(' ')[0]);
    // First-ever login → splash plays for ~3.3s, then offer the welcome tour
    setTimeout(()=>{ if(typeof _maybeOfferTour==='function') _maybeOfferTour(); },4500);
  }else{
    // Show daily digest after a short delay so the app is fully rendered
    setTimeout(showDailyDigest,1500);
    setTimeout(startAIAssistant,5000);
    toast('👋 Welcome, '+member.name.split(' ')[0]+'!');
    // Returning users who haven't seen the tour yet: offer it once
    setTimeout(()=>{ if(typeof _maybeOfferTour==='function') _maybeOfferTour(); },3500);
  }
  // Handle shared idea URL: ?idea=ID&token=TOKEN
  const _sp=new URLSearchParams(window.location.search);
  const _sharedIdeaId=parseInt(_sp.get('idea'));
  const _sharedToken=_sp.get('token');
  if(_sharedIdeaId&&_sharedToken){
    const _si=(D.ideas||[]).find(x=>x.id===_sharedIdeaId&&x.public_token===_sharedToken);
    if(_si){setTimeout(()=>{nav('ideas');openIdeaDetail(_si.id);toast('🔗 Viewing shared idea: '+_si.title);},300);}
    else{toast('⚠️ Shared idea link is invalid or has been revoked.');}
  }
  // Handle pending OAuth success/error from page load (set before login)
  if(window._pendingOAuthSuccess){
    const _prov=window._pendingOAuthSuccess;
    window._pendingOAuthSuccess=null;
    // Nifty lands on the Integrations tab (sp-5) \u2014 not Accounts.
    if(_prov==='nifty'){
      toast({type:'success',title:'\u2713 NiftyPM connected \u2014 pulling tasks\u2026',duration:3500});
      setTimeout(()=>{
        nav('settings');
        setTimeout(()=>{
          const intBtn=Array.from(document.querySelectorAll('.si')).find(x=>x.textContent.trim()==='Integrations');
          if(intBtn)intBtn.click();
          // Fire the first pull and refresh the panel state.
          setTimeout(async()=>{
            if(typeof refreshExternalTasksNow==='function')await refreshExternalTasksNow();
            if(typeof _hydrateExternalSourcesPanel==='function')await _hydrateExternalSourcesPanel();
          },600);
        },300);
      },500);
    }else{
      const _provLabel=_prov==='microsoft'?'Microsoft 365':'Google Workspace';
      toast('\u2713 '+_provLabel+' connected \u2014 running connection test\u2026');
      setTimeout(()=>{
        nav('settings');
        setTimeout(()=>{
          const accountsBtn=Array.from(document.querySelectorAll('.si')).find(x=>x.textContent.trim()==='Accounts');
          if(accountsBtn)accountsBtn.click();
          else{document.querySelectorAll('.sp').forEach(x=>x.style.display='none');const sp4=document.getElementById('sp-4');if(sp4){sp4.style.display='';loadOAuthStatus&&loadOAuthStatus();loadEmailDeliveryLog&&loadEmailDeliveryLog();}}
          setTimeout(async()=>{
            const card=document.getElementById('oauth-'+(_prov==='microsoft'?'ms':_prov)+'-card');
            if(card){card.scrollIntoView({behavior:'smooth',block:'center'});card.style.outline='2px solid var(--ac)';setTimeout(()=>card.style.outline='',3000);}
            await testOAuthConnection(_prov);
          },600);
        },300);
      },500);
    }
  }
  if(window._pendingOAuthError){
    const _err=window._pendingOAuthError;
    const _detail=window._pendingOAuthErrorDetail;
    window._pendingOAuthError=null;
    window._pendingOAuthErrorDetail=null;
    const _msg=(_err==='microsoft_token'||_err==='nifty_token'||_err==='nifty_server'||_err==='nifty_db')&&_detail
      ?`⚠️ ${_err.startsWith('nifty')?'Nifty':'Microsoft'} error: ${_detail}`
      :'⚠️ OAuth error: '+_err.replace(/_/g,' ');
    toast(_msg,'error',20000);
  }

  // Handle deep-link URL: ?goto=accounts[&provider=microsoft|google]
  // Used by expiry notification emails to take the user directly to Settings → Accounts
  const _goto=_sp.get('goto');
  if(_goto==='accounts'){
    const _provider=_sp.get('provider');
    history.replaceState(null,'',window.location.pathname);
    setTimeout(()=>{
      nav('settings');
      setTimeout(()=>{
        // Switch to the Accounts tab (sp-4)
        const tabs=document.querySelectorAll('[data-sb] .si, .si[onclick*="showSetTab"]');
        const accountsBtn=Array.from(document.querySelectorAll('.si')).find(x=>x.textContent.trim()==='Accounts');
        if(accountsBtn)accountsBtn.click();
        else{
          document.querySelectorAll('.sp').forEach(x=>x.style.display='none');
          const sp4=document.getElementById('sp-4');
          if(sp4){sp4.style.display='';loadOAuthStatus();loadEmailDeliveryLog();}
        }
        // Highlight the relevant provider card
        if(_provider){
          setTimeout(()=>{
            const card=document.getElementById('oauth-'+(_provider==='microsoft'?'ms':_provider)+'-card');
            if(card){card.scrollIntoView({behavior:'smooth',block:'center'});card.style.outline='2px solid var(--ac)';setTimeout(()=>card.style.outline='',3000);}
          },400);
        }
        toast('🔗 Go to Settings → Accounts to reconnect your provider');
      },300);
    },500);
  }
}
function applyUserPerms(member){
  const perms=member.perms||{};
  // Hide sidebar items the user doesn't have access to
  const permMap={mail:'s-mail',calendar:'s-calendar',settings:'s-settings',coach:'s-coach'};
  // We apply via CSS class on body
  document.body.dataset.role=member.role||'Member';
  // Restrict settings nav for non-admin users (DB roles: 'admin' | 'user')
  const roleNorm=(member.role||'').toLowerCase();
  if(roleNorm==='admin'||roleNorm==='owner'){
    document.body.classList.remove('restricted');
  } else {
    document.body.classList.add('restricted');
  }
}
function showChangeEmailForm(){
  const form=document.getElementById('change-email-form');
  if(!form)return;
  form.style.display=form.style.display==='none'?'block':'none';
  if(form.style.display==='block'){
    const inp=document.getElementById('new-email-input');
    if(inp)inp.focus();
  }
}
async function doChangeEmail(){
  const newEmailEl=document.getElementById('new-email-input');
  const pwEl=document.getElementById('email-change-pw');
  const msgEl=document.getElementById('email-change-msg');
  const btn=document.getElementById('email-change-btn');
  if(!newEmailEl||!pwEl||!msgEl)return;
  const newEmail=newEmailEl.value.trim();
  const password=pwEl.value;
  if(!newEmail){msgEl.style.color='var(--red)';msgEl.textContent='Please enter a new email address.';return;}
  if(!password){msgEl.style.color='var(--red)';msgEl.textContent='Please enter your current password to confirm.';return;}
  if(btn){btn.disabled=true;btn.textContent='Updating…';}
  msgEl.textContent='';
  try{
    const res=await _trpc('emailAuth.updateEmail',{newEmail,currentPassword:password},'mutation');
    if(res&&res.success){
      D.creds.email=res.newEmail;
      saveAll();
      const disp=document.getElementById('current-email-display');
      if(disp)disp.textContent=res.newEmail;
      const profEmail=document.getElementById('prof-email');
      if(profEmail)profEmail.textContent=res.newEmail;
      msgEl.style.color='var(--ok)';
      msgEl.textContent='✓ Email updated successfully!';
      newEmailEl.value='';
      pwEl.value='';
      setTimeout(()=>{const form=document.getElementById('change-email-form');if(form)form.style.display='none';},2500);
      toast('✉️ Email updated to '+res.newEmail);
    }
  }catch(err){
    const msg=(err&&err.message)||'Failed to update email';
    msgEl.style.color='var(--red)';
    msgEl.textContent=msg;
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Update Email';}
  }
}
async function saveNameToServer(newName){
  if(!newName||!newName.trim())return;
  try{
    await _trpc('emailAuth.updateName',{newName:newName.trim()},'mutation');
  }catch(e){
    console.warn('[saveNameToServer] Failed:',e&&e.message);
  }
}
async function changePassword(){
  const currEl=document.getElementById('chpw-current');
  const newEl=document.getElementById('chpw-new');
  const confEl=document.getElementById('chpw-confirm');
  const msgEl=document.getElementById('chpw-msg');
  const btn=document.getElementById('chpw-btn');
  if(!currEl||!newEl||!confEl||!msgEl)return;
  const currentPw=currEl.value;
  const newPw=newEl.value;
  const confPw=confEl.value;
  if(!currentPw){msgEl.style.color='var(--red)';msgEl.textContent='Please enter your current password.';return;}
  if(newPw.length<8){msgEl.style.color='var(--red)';msgEl.textContent='New password must be at least 8 characters.';return;}
  if(newPw!==confPw){msgEl.style.color='var(--red)';msgEl.textContent='New password and confirmation do not match.';return;}
  if(btn){btn.disabled=true;btn.innerHTML='<svg style="display:inline;animation:spin 1s linear infinite;vertical-align:middle;margin-right:4px" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Updating…';}
  msgEl.textContent='';
  try{
    await _trpc('emailAuth.setPassword',{currentPassword:currentPw,newPassword:newPw,confirmPassword:confPw},'mutation');
    currEl.value='';newEl.value='';confEl.value='';
    msgEl.style.color='var(--ok)';msgEl.textContent='✓ Password updated successfully!';
    setTimeout(()=>{if(msgEl)msgEl.textContent='';},4000);
    toast('🔒 Password updated');
  } catch(err){
    const msg=(err&&err.message)||'Failed to update password';
    msgEl.style.color='var(--red)';msgEl.textContent=msg;
  } finally {
    if(btn){btn.disabled=false;btn.textContent='Update Password';}
  }
}
async function doLogout(){
  localStorage.removeItem('lu_session');
  // Clear the JWT session cookie via tRPC
  try{await _trpc('auth.logout',{},'mutation');}catch(e){console.warn('Logout endpoint error:',e);}
  const ov=document.getElementById('login-overlay');
  if(ov){ov.classList.remove('hidden');initLoginScreen();}
  toast('Signed out');
}

// ====== FULL ADD MODAL SYSTEM ======
// State
let _faType=null; // current entity type
let _faAddAnother=false;
let _faHasChanges=false;
let _faTags=[]; // current modal tags
let _faLinked={tasks:[],notes:[],projects:[],goals:[],journal:[],bookmarks:[]}; // linked item ids
let _faSubtasks=[]; // inline subtask rows
let _faMilestones=[]; // project milestones
let _faReflections=[]; // goal check-ins
let _faDecisionAlts=[]; // note decision alternatives
let _faMeetingActions=[]; // meeting action items
let _faCustomDays=[]; // habit custom days
let _faSessionScope={personal:true,business:false}; // persists across Save & Add Another
let _faSessionTags=[]; // persists across Save & Add Another

// Open Full Add modal
function faSetDueChip(daysOffset){
  const d=new Date();
  d.setDate(d.getDate()+daysOffset);
  const iso=d.toISOString().split('T')[0];
  const inp=document.getElementById('fa-due');
  if(inp){inp.value=iso;inp.dispatchEvent(new Event('change'));}
  // Highlight selected chip
  document.querySelectorAll('.fa-due-chip').forEach(c=>c.style.background='');
  event.target.style.background='var(--ac)';
  event.target.style.color='#fff';
}
function faAutoSuggestDueDate(){
  // Called when priority changes - suggest a date if due is empty
  const pri=document.getElementById('fa-priority')?.value;
  const due=document.getElementById('fa-due');
  if(!due||due.value)return; // don't override existing value
  const offsets={High:1,Medium:7,Low:14};
  const offset=offsets[pri]||7;
  const d=new Date();
  d.setDate(d.getDate()+offset);
  due.placeholder=d.toISOString().split('T')[0]+' (suggested)';
}
function openFA(type){
  _faType=type;
  _faHasChanges=false;
  _faTags=[..._faSessionTags];
  _faLinked={tasks:[],notes:[],projects:[],goals:[],journal:[],bookmarks:[]};
  _faSubtasks=[];
  _faMilestones=[];
  _faReflections=[];
  _faDecisionAlts=[];
  _faMeetingActions=[];
  _faCustomDays=[];
  const ov=document.getElementById('fa-modal-ov');
  const body=document.getElementById('fa-modal-body');
  const title=document.getElementById('fa-modal-title');
  const icons={task:'📋 New Task',note:'📝 New Note',project:'📁 New Project',goal:'🎯 New Goal',journal:'✏️ New Journal Entry',habit:'🔄 New Habit'};
  title.textContent=icons[type]||'New Item';
  body.innerHTML=renderFAForm(type);
  ov.classList.add('show');
  const ti=document.getElementById('fa-title');if(ti)setTimeout(()=>ti.focus(),80);
  _faHasChanges=false;
  // Mark dirty on any input
  body.addEventListener('input',()=>{_faHasChanges=true;},{once:true});
}
function closeFA(force){
  if(!force&&_faHasChanges){
    if(!confirm('You have unsaved changes. Close anyway?'))return;
  }
  if(typeof _voiceStop==='function')_voiceStop(); // stop voice dictation if active
  document.getElementById('fa-modal-ov').classList.remove('show');
  _faType=null;
}
// Keyboard shortcuts
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&document.getElementById('fa-modal-ov')?.classList.contains('show'))closeFA();
  if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&document.getElementById('fa-modal-ov')?.classList.contains('show')){e.preventDefault();if(e.shiftKey){doFASave(true);}else{doFASave(false);}}
});

// Tag system
function faAddTag(val){
  val=val.trim();
  if(!val||_faTags.includes(val))return;
  _faTags.push(val);
  _faHasChanges=true;
  renderFATags();
}
function faRemoveTag(idx){
  _faTags.splice(idx,1);
  renderFATags();
}
function renderFATags(){
  const wrap=document.getElementById('fa-tag-wrap');
  if(!wrap)return;
  const input=wrap.querySelector('.fa-tag-input');
  const chips=_faTags.map((t,i)=>`<span class="fa-tag">${esc(t)}<span class="fa-tag-x" onclick="faRemoveTag(${i})">✕</span></span>`).join('');
  wrap.innerHTML=chips+`<input class="fa-tag-input" placeholder="Add tag..." id="fa-tag-input" onkeydown="if(event.key==='Enter'||event.key===','){event.preventDefault();faAddTag(this.value);this.value=''}">`;
}

// Typeahead linker
function faLinkerInput(field,val){
  const drop=document.getElementById('fa-drop-'+field);
  if(!drop)return;
  const sources={tasks:D.tasks,notes:D.notes,projects:D.projects,goals:D.goals,journal:D.journal,habits:D.habits,ideas:D.ideas,contacts:D.contacts,bookmarks:D.bookmarks||[]};
  const src=sources[field]||[];
  const q=(val||'').toLowerCase();
  // When val is empty, show the most recent unlinked items so the user can browse without typing.
  const available=src.filter(x=>!_faLinked[field].includes(x.id));
  const matches=q
    ? available.filter(x=>(x.title||x.name||'').toLowerCase().includes(q)).slice(0,10)
    : available.slice(-10).reverse(); // most recent first when no query
  if(!matches.length){drop.classList.remove('show');return;}
  drop.innerHTML=matches.map(x=>`<div class="fa-typeahead-item" onclick="faLinkItem('${field}',${x.id},'${esc(x.title||x.name||'')}')">${esc(x.title||x.name||'')}</div>`).join('');
  drop.classList.add('show');
}
// Show the dropdown when the input gets focus (even if empty) so users can see available items.
function faLinkerFocus(field){faLinkerInput(field,document.getElementById('fa-link-inp-'+field)?.value||'');}
// Hide dropdown shortly after blur so click handlers on items still fire.
function faLinkerBlur(field){setTimeout(()=>{const d=document.getElementById('fa-drop-'+field);if(d)d.classList.remove('show');},150);}
function faLinkItem(field,id,label){
  if(_faLinked[field].includes(id))return;
  _faLinked[field].push(id);
  _faHasChanges=true;
  renderFALinked(field);
  const inp=document.getElementById('fa-link-inp-'+field);
  if(inp)inp.value='';
  const drop=document.getElementById('fa-drop-'+field);
  if(drop)drop.classList.remove('show');
}
function faUnlinkItem(field,id){
  _faLinked[field]=_faLinked[field].filter(x=>x!==id);
  renderFALinked(field);
}
function renderFALinked(field){
  const wrap=document.getElementById('fa-linked-'+field);
  if(!wrap)return;
  const sources={tasks:D.tasks,notes:D.notes,projects:D.projects,goals:D.goals,journal:D.journal,habits:D.habits,ideas:D.ideas,contacts:D.contacts,bookmarks:D.bookmarks||[]};
  const src=sources[field]||[];
  wrap.innerHTML=(_faLinked[field]||[]).map(id=>{
    const item=src.find(x=>x.id===id);
    const label=item?(item.title||item.name||'#'+id):'#'+id;
    return`<span class="fa-chip">${esc(label)}<span class="fa-chip-x" onclick="faUnlinkItem('${field}',${id})">✕</span></span>`;
  }).join('');
}
function faLinkerHtml(field,placeholder){
  return`<div class="fa-typeahead"><input class="fa-inp" id="fa-link-inp-${field}" placeholder="${placeholder} (click to browse)" oninput="faLinkerInput('${field}',this.value)" onfocus="faLinkerFocus('${field}')" onblur="faLinkerBlur('${field}')" autocomplete="off"><div class="fa-typeahead-drop" id="fa-drop-${field}"></div></div><div class="fa-linked-chips" id="fa-linked-${field}"></div>`;
}

// Toggle helper
function faToggle(id){
  const t=document.getElementById(id);
  if(!t)return;
  t.classList.toggle('on');
  const thumb=t.querySelector('.fa-toggle-thumb');
  _faHasChanges=true;
}
function faToggleVal(id){return document.getElementById(id)?.classList.contains('on')}

// Subtask helpers
function faAddSubtask(){
  _faSubtasks.push({title:'',status:'Not Started',priority:'Medium',due:'',estimatedMins:0,energy:'medium',myDay:false});
  renderFASubtasks();
}
function faRemoveSubtask(i){
  _faSubtasks.splice(i,1);
  renderFASubtasks();
}
function renderFASubtasks(){
  const wrap=document.getElementById('fa-subtasks');
  if(!wrap)return;
  wrap.innerHTML=_faSubtasks.map((s,i)=>`
  <div class="fa-subtask-row">
    <input type="text" placeholder="Subtask title..." value="${esc(s.title)}" oninput="_faSubtasks[${i}].title=this.value" style="flex:2">
    <select class="fa-inp" style="width:90px;padding:4px 6px" onchange="_faSubtasks[${i}].status=this.value"><option>Not Started</option><option>In Progress</option><option>Done</option></select>
    <select class="fa-inp" style="width:70px;padding:4px 6px" onchange="_faSubtasks[${i}].priority=this.value"><option>Low</option><option selected>Medium</option><option>High</option></select>
    <input type="date" class="fa-inp" style="width:120px" value="${s.due||''}" onchange="_faSubtasks[${i}].due=this.value">
    <button class="btn btn-d" style="height:24px;font-size:11px;padding:0 6px;flex-shrink:0" onclick="faRemoveSubtask(${i})">✕</button>
  </div>`).join('');
}

// Milestone helpers
function faAddMilestone(){
  _faMilestones.push({label:'',targetDate:'',status:'Not Started'});
  renderFAMilestones();
}
function faRemoveMilestone(i){
  _faMilestones.splice(i,1);
  renderFAMilestones();
}
function renderFAMilestones(){
  const wrap=document.getElementById('fa-milestones');
  if(!wrap)return;
  wrap.innerHTML=_faMilestones.map((m,i)=>`
  <div class="fa-milestone-row">
    <input class="fa-inp" style="padding:4px 8px" placeholder="Milestone label..." value="${esc(m.label)}" oninput="_faMilestones[${i}].label=this.value">
    <input type="date" class="fa-inp" style="padding:4px 8px" value="${m.targetDate||''}" onchange="_faMilestones[${i}].targetDate=this.value">
    <select class="fa-inp" style="padding:4px 6px" onchange="_faMilestones[${i}].status=this.value"><option>Not Started</option><option>In Progress</option><option>Done</option></select>
    <button class="btn btn-d" style="height:24px;font-size:11px;padding:0 6px" onclick="faRemoveMilestone(${i})">✕</button>
  </div>`).join('');
}

// Decision alternatives helpers
function faAddAlt(){
  _faDecisionAlts.push({label:'',pros:'',cons:''});
  renderFAAlts();
}
function faRemoveAlt(i){
  _faDecisionAlts.splice(i,1);
  renderFAAlts();
}
function renderFAAlts(){
  const wrap=document.getElementById('fa-alts');
  if(!wrap)return;
  wrap.innerHTML=_faDecisionAlts.map((a,i)=>`
  <div class="fa-rep-row c3" style="display:grid;grid-template-columns:1fr 1fr 1fr 24px;gap:6px;align-items:start">
    <input class="fa-inp" style="padding:4px 8px" placeholder="Option label" value="${esc(a.label)}" oninput="_faDecisionAlts[${i}].label=this.value">
    <textarea class="fa-inp" style="padding:4px 8px;min-height:50px" placeholder="Pros" oninput="_faDecisionAlts[${i}].pros=this.value">${esc(a.pros)}</textarea>
    <textarea class="fa-inp" style="padding:4px 8px;min-height:50px" placeholder="Cons" oninput="_faDecisionAlts[${i}].cons=this.value">${esc(a.cons)}</textarea>
    <button class="btn btn-d" style="height:24px;font-size:11px;padding:0 6px;margin-top:2px" onclick="faRemoveAlt(${i})">✕</button>
  </div>`).join('');
}

// Meeting action items helpers
function faAddAction(){
  _faMeetingActions.push({title:'',assignee:'',due:''});
  renderFAActions();
}
function faRemoveAction(i){
  _faMeetingActions.splice(i,1);
  renderFAActions();
}
function renderFAActions(){
  const wrap=document.getElementById('fa-actions');
  if(!wrap)return;
  const members=D.teams.flatMap(t=>t.members);
  wrap.innerHTML=_faMeetingActions.map((a,i)=>`
  <div style="display:grid;grid-template-columns:1fr 120px 120px 24px;gap:6px;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)">
    <input class="fa-inp" style="padding:4px 8px" placeholder="Action item..." value="${esc(a.title)}" oninput="_faMeetingActions[${i}].title=this.value">
    <select class="fa-inp" style="padding:4px 6px" onchange="_faMeetingActions[${i}].assignee=this.value"><option value="">Unassigned</option>${members.map(m=>`<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('')}</select>
    <input type="date" class="fa-inp" style="padding:4px 8px" value="${a.due||''}" onchange="_faMeetingActions[${i}].due=this.value">
    <button class="btn btn-d" style="height:24px;font-size:11px;padding:0 6px" onclick="faRemoveAction(${i})">✕</button>
  </div>`).join('');
}

// Habit custom day toggle
function faToggleDay(day){
  if(_faCustomDays.includes(day))_faCustomDays=_faCustomDays.filter(d=>d!==day);
  else _faCustomDays.push(day);
  document.querySelectorAll('.fa-day-btn').forEach(b=>{b.classList.toggle('sel',_faCustomDays.includes(b.dataset.day));});
}

// Mood selector
function faSelectMood(el,val){
  document.querySelectorAll('.fa-mood-btn').forEach(b=>b.classList.remove('sel'));
  el.classList.add('sel');
  const inp=document.getElementById('fa-mood-val');
  if(inp)inp.value=val;
}

// Note type conditional fields
function faUpdateNoteType(val){
  const dec=document.getElementById('fa-note-decision');
  const meet=document.getElementById('fa-note-meeting');
  if(dec)dec.style.display=val==='Decision'?'':'none';
  if(meet)meet.style.display=val==='Meeting Notes'?'':'none';
}

// Habit cadence conditional
function faUpdateCadence(val){
  const grid=document.getElementById('fa-custom-days');
  if(grid)grid.style.display=val==='Custom'?'':'none';
}

// Bidirectional linker: when saving, update related entities
function applyBidirectionalLinks(type,newId){
  // Link tasks to project
  if(type==='task'){
    _faLinked.projects.forEach(pid=>{
      const p=D.projects.find(x=>x.id===pid);
      // projectId is already set on the task; nothing extra needed
    });
    // Link task to goals
    _faLinked.goals.forEach(gid=>{
      const g=D.goals.find(x=>x.id===gid);
      if(g&&!g.linkedTaskIds)g.linkedTaskIds=[];
      if(g&&!g.linkedTaskIds.includes(newId))g.linkedTaskIds.push(newId);
    });
    if(_faLinked.goals.length)save('goals');
  }
  if(type==='note'){
    // Link note to tasks
    _faLinked.tasks.forEach(tid=>{
      const t=D.tasks.find(x=>x.id===tid);
      if(t&&!t.linkedNoteIds)t.linkedNoteIds=[];
      if(t&&!t.linkedNoteIds.includes(newId))t.linkedNoteIds.push(newId);
    });
    if(_faLinked.tasks.length)save('tasks');
  }
}

// ===== FORM RENDERERS =====
function faCommonLinks(){
  return`
  <div class="fa-section">
    <div class="fa-section-title">🔗 Linked Items</div>
    <div class="fa-row c2">
      <div class="fa-field"><label>Linked Projects</label>${faLinkerHtml('projects','Search projects...')}</div>
      <div class="fa-field"><label>Linked Goals</label>${faLinkerHtml('goals','Search goals...')}</div>
    </div>
    <div class="fa-row c2">
      <div class="fa-field"><label>Linked Tasks</label>${faLinkerHtml('tasks','Search tasks...')}</div>
      <div class="fa-field"><label>Linked Notes</label>${faLinkerHtml('notes','Search notes...')}</div>
    </div>
    <div class="fa-row c2">
      <div class="fa-field"><label>Linked Journal Entries</label>${faLinkerHtml('journal','Search journal...')}</div>
      <div class="fa-field"><label>Linked Bookmarks</label>${faLinkerHtml('bookmarks','Search bookmarks...')}</div>
    </div>
  </div>`;
}
function faCommonScope(){
  return`<div class="fa-scope-row">
    <label class="fa-checkbox-row"><input type="checkbox" id="fa-scope-personal" ${_faSessionScope.personal?'checked':''}> Personal</label>
    <label class="fa-checkbox-row"><input type="checkbox" id="fa-scope-business" ${_faSessionScope.business?'checked':''}> Business</label>
  </div>`;
}
function faCommonTags(){
  const chips=_faTags.map((t,i)=>`<span class="fa-tag">${esc(t)}<span class="fa-tag-x" onclick="faRemoveTag(${i})">✕</span></span>`).join('');
  return`<div class="fa-tag-wrap" id="fa-tag-wrap" onclick="document.getElementById('fa-tag-input')?.focus()">${chips}<input class="fa-tag-input" placeholder="Add tag..." id="fa-tag-input" onkeydown="if(event.key==='Enter'||event.key===','){event.preventDefault();faAddTag(this.value);this.value=''}"></div>`;
}

function renderFAForm(type){
  if(type==='task')return renderFATask();
  if(type==='note')return renderFANote();
  if(type==='project')return renderFAProject();
  if(type==='goal')return renderFAGoal();
  if(type==='journal')return renderFAJournal();
  if(type==='habit')return renderFAHabit();
  return '';
}

function renderFATask(){
  const members=D.teams.flatMap(t=>t.members);
  return`
  <div class="fa-section">
    <div class="fa-section-title">📋 Core Details</div>
    <div class="fa-field" style="margin-bottom:10px">
      <label>Title <span style="color:var(--red)">*</span></label>
      <input class="fa-inp" id="fa-title" placeholder="What needs to be done?">
      <span class="err" id="fa-title-err">Title is required</span>
    </div>
    <div class="fa-field" style="margin-bottom:10px">
      <label>Description</label>
      <textarea class="fa-inp" id="fa-desc" placeholder="Add details, context, or markdown notes..."></textarea>
    </div>
    ${faCommonScope()}
    <div class="fa-field" style="margin-bottom:10px"><label>Tags</label>${faCommonTags()}</div>
  </div>
  <div class="fa-section">
    <div class="fa-section-title">📅 Scheduling</div>
    <div class="fa-row c2">
      <div class="fa-field"><label>Start Date</label><input type="date" class="fa-inp" id="fa-startdate"></div>
      <div class="fa-field"><label>Start Time</label><input type="time" class="fa-inp" id="fa-starttime"></div>
    </div>
    <div class="fa-row c2">
      <div class="fa-field"><label>Due Date <span style="font-size:11px;color:var(--t3);font-weight:400">— or pick:</span></label>
        <input type="date" class="fa-inp" id="fa-due">
        <div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px" id="fa-due-chips">
          <span class="fa-due-chip" onclick="faSetDueChip(0)" title="Today">Today</span>
          <span class="fa-due-chip" onclick="faSetDueChip(1)" title="Tomorrow">Tomorrow</span>
          <span class="fa-due-chip" onclick="faSetDueChip(3)" title="In 3 days">+3 days</span>
          <span class="fa-due-chip" onclick="faSetDueChip(7)" title="Next week">Next week</span>
          <span class="fa-due-chip" onclick="faSetDueChip(14)" title="In 2 weeks">+2 weeks</span>
          <span class="fa-due-chip" onclick="faSetDueChip(30)" title="Next month">Next month</span>
        </div>
      </div>
      <div class="fa-field"><label>Due Time</label><input type="time" class="fa-inp" id="fa-duetime"></div>
    </div>
    <div class="fa-row c4">
      <div class="fa-field"><label>Priority</label><select class="fa-inp" id="fa-priority"><option>Low</option><option selected>Medium</option><option>High</option></select></div>
      <div class="fa-field"><label>Status</label><select class="fa-inp" id="fa-status"><option>Not Started</option><option>In Progress</option><option>Pending</option><option>Scheduled</option><option>Done</option></select></div>
      <div class="fa-field"><label>Smart List</label><select class="fa-inp" id="fa-smartlist"><option>Task Intake</option><option>Do Next</option><option>Calendar</option><option>Delegated</option><option>Snoozed</option><option>Someday</option><option>Done</option></select></div>
      <div class="fa-field"><label>Recurrence</label><select class="fa-inp" id="fa-recurring"><option>None</option><option>Daily</option><option>Weekdays</option><option>Weekly</option><option>Bi-weekly</option><option>Monthly</option></select></div>
    </div>
  </div>
  <div class="fa-section">
    <div class="fa-section-title">⚙️ Task Details</div>
    <div class="fa-row c3">
      <div class="fa-field"><label style="display:flex;align-items:center;justify-content:space-between">Context<button type="button" class="btn btn-s" style="height:18px;font-size:10px;padding:0 6px" onclick="manageTaskContexts()" title="Add, rename, or remove options">⚙</button></label>${_renderContextSelect('fa-context','','fa-inp')}</div>
      <div class="fa-field"><label>Location</label><select class="fa-inp" id="fa-location"><option>Anywhere</option><option>Home</option><option>Office</option><option>Errands</option><option>Online</option></select></div>
      <div class="fa-field"><label>Energy</label><select class="fa-inp" id="fa-energy"><option>low</option><option selected>medium</option><option>high</option></select></div>
    </div>
    <div class="fa-row c3">
      <div class="fa-field"><label>Est. Minutes</label><input type="number" class="fa-inp" id="fa-estmins" min="0" placeholder="30"></div>
      <div class="fa-field"><label>Actual Minutes</label><input type="number" class="fa-inp" id="fa-actmins" min="0" placeholder="0"></div>
      <div class="fa-field"><label>Processing</label><select class="fa-inp" id="fa-pi"><option>Process</option><option>Immersive</option></select></div>
    </div>
    <div class="fa-row c2">
      <div class="fa-field"><label>Project</label><select class="fa-inp" id="fa-project"><option value="">None</option>${D.projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
      <div class="fa-field"><label>Assigned To</label><select class="fa-inp" id="fa-assignee"><option value="">Unassigned</option>${members.map(m=>`<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('')}</select></div>
    </div>
    <div class="fa-row c2">
      <div class="fa-field"><label>Linked Goal</label><select class="fa-inp" id="fa-linkedgoal"><option value="">None</option>${D.goals.map(g=>`<option value="${g.id}">${g.icon} ${esc(g.title)}</option>`).join('')}</select></div>
      <div class="fa-field"><label>Snooze Until</label><input type="date" class="fa-inp" id="fa-snooze"></div>
    </div>
    <div class="fa-row c2">
      <div class="fa-field"><label>Reminder</label><input type="datetime-local" class="fa-inp" id="fa-reminder"></div>
      <div class="fa-field"><label>Delegated To</label><select class="fa-inp" id="fa-delegated"><option value="">None</option>${members.map(m=>`<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('')}</select></div>
    </div>
    <div class="fa-row">
      <div class="fa-field"><label>🔒 Blocked By (Predecessor Tasks)</label>${faLinkerHtml('tasks','Search tasks that must complete first...')}</div>
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;padding:6px 0">
      <label class="fa-checkbox-row"><input type="checkbox" id="fa-myday"> Add to My Day</label>
      <label class="fa-checkbox-row"><input type="checkbox" id="fa-iswork" checked> Work Task</label>
      <label class="fa-checkbox-row"><input type="checkbox" id="fa-sync-todo"> Sync to Microsoft To Do</label>
      <label class="fa-checkbox-row"><input type="checkbox" id="fa-sync-clickup"> Sync to ClickUp</label>
    </div>
  </div>
  <div class="fa-section">
    <div class="fa-section-title">✅ Subtasks</div>
    <div id="fa-subtasks"></div>
    <div class="fa-add-row" onclick="faAddSubtask()">+ Add subtask</div>
  </div>
  ${faCommonLinks()}`;
}

function renderFANote(){
  return`
  <div class="fa-section">
    <div class="fa-section-title">📝 Core Details</div>
    <div class="fa-field" style="margin-bottom:10px">
      <label>Title <span style="color:var(--red)">*</span></label>
      <input class="fa-inp" id="fa-title" placeholder="Note title...">
      <span class="err" id="fa-title-err">Title is required</span>
    </div>
    <div class="fa-row c2">
      <div class="fa-field"><label>Note Type</label><select class="fa-inp" id="fa-notetype" onchange="faUpdateNoteType(this.value)"><option>Note</option><option>Decision</option><option>Meeting Notes</option><option>Reading Highlight</option><option>Web Clip</option></select></div>
      <div class="fa-field"><label>PARA</label><select class="fa-inp" id="fa-para"><option>Project</option><option>Area</option><option>Resource</option><option>Archive</option></select></div>
    </div>
    <div class="fa-row c2">
      <div class="fa-field"><label>Source</label><input class="fa-inp" id="fa-source" placeholder="Book, website, meeting..."></div>
      <div class="fa-field"><label>Source URL</label><input class="fa-inp" id="fa-sourceurl" placeholder="https://..."></div>
    </div>
    <div class="fa-row c2">
      <div class="fa-field"><label>Reading Status</label><select class="fa-inp" id="fa-readstatus"><option>Inbox</option><option>To Read</option><option>Reading</option><option>Read</option><option>Reference</option></select></div>
      <div class="fa-field" style="justify-content:flex-end;padding-top:18px">
        <label class="fa-checkbox-row"><input type="checkbox" id="fa-favorite"> ⭐ Favorite</label>
      </div>
    </div>
    ${faCommonScope()}
    <div class="fa-field" style="margin-bottom:10px"><label>Tags</label>${faCommonTags()}</div>
    <div class="fa-field">
      <label style="display:flex;justify-content:space-between;align-items:center">Content <span style="font-size:11px;color:var(--t3);font-weight:400">Markdown supported</span></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <textarea class="fa-inp" id="fa-desc" style="min-height:140px;font-family:monospace;font-size:11px" placeholder="# Title\n\nWrite your note in **markdown**...\n\n- Bullet points\n- **Bold**, *italic*" oninput="renderNotePreview(this.value)"></textarea>
        <div id="fa-note-preview" style="min-height:140px;background:var(--s1);border:1px solid var(--bd1);border-radius:6px;padding:10px;font-size:12px;color:var(--t2);line-height:1.6;overflow-y:auto"><em style="color:var(--t3)">Preview will appear here as you type...</em></div>
      </div>
    </div>
    <!-- Rich Text Body -->
    <div class="fa-field" style="margin-top:12px">
      <label><span>📝 Free-form Body <span style="font-size:11px;font-weight:400;color:var(--t3)">Rich text editor — write your full thoughts here</span></span></label>
      ${luRTE_render({id:'fa-note-rte', placeholder:'Write your full note here — no structure required. Use the toolbar to format as you go...', value:'', height:'180px'})}
      <!-- AI Assistance -->
      <div style="margin-top:6px;padding:8px;background:var(--s2);border-radius:6px;border:1px solid var(--bd1)">
        <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:5px">✨ AI Assistance</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button type="button" class="btn btn-s" style="height:24px;font-size:11px" onclick="rteNoteAI('expand')">📝 Expand</button>
          <button type="button" class="btn btn-s" style="height:24px;font-size:11px" onclick="rteNoteAI('summarise')">📌 Summarise</button>
          <button type="button" class="btn btn-s" style="height:24px;font-size:11px" onclick="rteNoteAI('link')">🔗 Link Concepts</button>
          <button type="button" class="btn btn-s" style="height:24px;font-size:11px" onclick="rteNoteAI('autotag')">🏷 Auto-tag</button>
          <button type="button" class="btn btn-s" style="height:24px;font-size:11px" onclick="rteNoteAI('questions')">❓ Key Questions</button>
          <button type="button" class="btn btn-d" style="height:24px;font-size:11px" onclick="document.getElementById('fa-note-rte').innerHTML='';luRTE_updateCharCount('fa-note-rte')">🗑 Clear</button>
          ${typeof _aiLengthChip==='function'?_aiLengthChip():''}
        </div>
        <div id="fa-note-ai-result" style="display:none;margin-top:6px;padding:8px;background:var(--s1);border-radius:4px;font-size:11px;color:var(--t2);line-height:1.6;white-space:pre-wrap;max-height:180px;overflow-y:auto"></div>
      </div>
    </div>
  </div>
  <!-- Decision fields -->
  <div id="fa-note-decision" style="display:none">
    <div class="fa-section">
      <div class="fa-section-title">⚖️ Decision Details</div>
      <div class="fa-row c2">
        <div class="fa-field"><label>Decision Context</label><textarea class="fa-inp" id="fa-dec-context" placeholder="What problem are you solving?"></textarea></div>
        <div class="fa-field"><label>Choice Made</label><input class="fa-inp" id="fa-dec-choice" placeholder="The option selected..."></div>
      </div>
      <div class="fa-row c2">
        <div class="fa-field"><label>Rationale</label><textarea class="fa-inp" id="fa-dec-rationale" placeholder="Why this choice?"></textarea></div>
        <div class="fa-field"><label>Expected Outcome</label><textarea class="fa-inp" id="fa-dec-outcome" placeholder="What do you expect?"></textarea></div>
      </div>
      <div class="fa-row c2">
        <div class="fa-field"><label>Review Date</label><input type="date" class="fa-inp" id="fa-dec-review"></div>
        <div class="fa-field"><label>Actual Outcome</label><input class="fa-inp" id="fa-dec-actual" placeholder="Fill in after review..."></div>
      </div>
      <div class="fa-section-title" style="margin-top:12px">Alternatives Considered</div>
      <div id="fa-alts"></div>
      <div class="fa-add-row" onclick="faAddAlt()">+ Add alternative</div>
    </div>
  </div>
  <!-- Meeting Notes fields -->
  <div id="fa-note-meeting" style="display:none">
    <div class="fa-section">
      <div class="fa-section-title">📅 Meeting Details</div>
      <div class="fa-row c2">
        <div class="fa-field"><label>Meeting Date & Time</label><input type="datetime-local" class="fa-inp" id="fa-meet-dt"></div>
        <div class="fa-field"><label>Attendees</label><input class="fa-inp" id="fa-meet-attendees" placeholder="Names, comma separated..."></div>
      </div>
      <div class="fa-section-title" style="margin-top:12px">Action Items (saved as Tasks)</div>
      <div id="fa-actions"></div>
      <div class="fa-add-row" onclick="faAddAction()">+ Add action item</div>
    </div>
  </div>
  ${faCommonLinks()}`;
}

function renderFAProject(){
  return`
  <div class="fa-section">
    <div class="fa-section-title">${_icon('folder',14,'currentColor')} Core Details</div>
    <div class="fa-field" style="margin-bottom:10px">
      <label>Project Name <span style="color:var(--red)">*</span></label>
      <input class="fa-inp" id="fa-title" placeholder="Project name...">
      <span class="err" id="fa-title-err">Name is required</span>
    </div>
    <div class="fa-field" style="margin-bottom:10px">
      <label>Description</label>
      <textarea class="fa-inp" id="fa-desc" placeholder="What is this project about?"></textarea>
    </div>
    ${faCommonScope()}
    <div class="fa-field" style="margin-bottom:10px"><label>Tags</label>${faCommonTags()}</div>
  </div>
  <div class="fa-section">
    <div class="fa-section-title">📊 Project Settings</div>
    <div class="fa-row c3">
      <div class="fa-field"><label>Status</label><select class="fa-inp" id="fa-status"><option>Planned</option><option selected>Active</option><option>On Hold</option><option>Completed</option><option>Archived</option></select></div>
      <div class="fa-field"><label>Area</label><input class="fa-inp" id="fa-area" placeholder="Work, Personal..."></div>
      <div class="fa-field"><label>Owner</label><select class="fa-inp" id="fa-owner"><option value="">Unassigned</option>${D.teams.flatMap(t=>t.members).map(m=>`<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('')}</select></div>
    </div>
    <div class="fa-row c4">
      <div class="fa-field"><label>Start Date</label><input type="date" class="fa-inp" id="fa-startdate"></div>
      <div class="fa-field"><label>Due Date</label><input type="date" class="fa-inp" id="fa-due"></div>
      <div class="fa-field"><label>Quarter</label><select class="fa-inp" id="fa-quarter"><option value="">—</option><option>Q1</option><option>Q2</option><option>Q3</option><option>Q4</option></select></div>
      <div class="fa-field"><label>Year</label><input type="number" class="fa-inp" id="fa-year" value="${new Date().getFullYear()}" min="2020" max="2035"></div>
    </div>
    <div class="fa-row c2">
      <div class="fa-field"><label>Color</label><input type="color" class="fa-inp" id="fa-color" value="#3B82F6" style="height:36px;cursor:pointer"></div>
      <div class="fa-field"><label>Kanban Axis</label><select class="fa-inp" id="fa-kanban-axis"><option>Status</option><option>Smart List</option><option>Context</option><option>Assignee</option></select></div>
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;padding:6px 0">
      <label class="fa-checkbox-row"><input type="checkbox" id="fa-save-template"> Save as Template</label>
    </div>
  </div>
  <div class="fa-section">
    <div class="fa-section-title">🏁 Milestones</div>
    <div id="fa-milestones"></div>
    <div class="fa-add-row" onclick="faAddMilestone()">+ Add milestone</div>
  </div>
  ${faCommonLinks()}`;
}

function renderFAGoal(){
  return`
  <div class="fa-section">
    <div class="fa-section-title">🎯 Core Details</div>
    <div class="fa-field" style="margin-bottom:10px">
      <label>Goal Title <span style="color:var(--red)">*</span></label>
      <input class="fa-inp" id="fa-title" placeholder="What do you want to achieve?">
      <span class="err" id="fa-title-err">Title is required</span>
    </div>
    <div class="fa-field" style="margin-bottom:10px">
      <label><span>Description <span style="font-size:11px;color:var(--t3);font-weight:400">Rich text — why this goal matters, milestones, success criteria</span></span></label>
      ${luRTE_render({id:'fa-goal-rte', placeholder:'Why does this goal matter? Describe milestones, success criteria…', value:'', height:'140px'})}
      <textarea class="fa-inp" id="fa-desc" style="display:none"></textarea>
    </div>
    ${faCommonScope()}
    <div class="fa-field" style="margin-bottom:10px"><label>Tags</label>${faCommonTags()}</div>
  </div>
  <div class="fa-section">
    <div class="fa-section-title">📊 Goal Metrics</div>
    <div class="fa-row c3">
      <div class="fa-field"><label>Icon</label><input class="fa-inp" id="fa-icon" value="🎯" style="font-size:18px"></div>
      <div class="fa-field"><label>Category</label><select class="fa-inp" id="fa-category"><option>Work</option><option>Learning</option><option>Health</option><option>Personal Brand</option><option>Finance</option><option>Personal</option></select></div>
      <div class="fa-field"><label>Status</label><select class="fa-inp" id="fa-status"><option>Active</option><option>On Hold</option><option>Completed</option></select></div>
    </div>
    <div class="fa-row c4">
      <div class="fa-field"><label>Year <span style="color:var(--red)">*</span></label><input type="number" class="fa-inp" id="fa-year" value="${new Date().getFullYear()}" min="2020" max="2035"></div>
      <div class="fa-field"><label>Quarter</label><select class="fa-inp" id="fa-quarter"><option value="">Annual</option><option>Q1</option><option>Q2</option><option>Q3</option><option>Q4</option></select></div>
      <div class="fa-field"><label>Start Date</label><input type="date" class="fa-inp" id="fa-startdate"></div>
      <div class="fa-field"><label>Due Date</label><input type="date" class="fa-inp" id="fa-due"></div>
    </div>
    <div class="fa-row c3">
      <div class="fa-field"><label>Target Metric</label><input class="fa-inp" id="fa-metric" placeholder="e.g. Complete 12 chapters"></div>
      <div class="fa-field"><label>Target Number</label><input type="number" class="fa-inp" id="fa-target-num" min="0" placeholder="12"></div>
      <div class="fa-field"><label>Unit</label><input class="fa-inp" id="fa-unit" placeholder="chapters, km, $..."></div>
    </div>
    <div class="fa-row c2">
      <div class="fa-field"><label>Current Value</label><input type="number" class="fa-inp" id="fa-current" min="0" placeholder="0"></div>
      <div class="fa-field"><label>Linked Area</label><input class="fa-inp" id="fa-area" placeholder="Health, Career..."></div>
    </div>
  </div>
  <div class="fa-section">
    <div class="fa-section-title">📝 Reflection Notes</div>
    <div id="fa-reflections"></div>
    <div class="fa-add-row" onclick="faAddReflection()">+ Add check-in note</div>
  </div>
  ${faCommonLinks()}`;
}

function faAddReflection(){
  _faReflections.push({date:new Date().toISOString().split('T')[0],note:''});
  renderFAReflections();
}
function faRemoveReflection(i){
  _faReflections.splice(i,1);
  renderFAReflections();
}
function renderFAReflections(){
  const wrap=document.getElementById('fa-reflections');
  if(!wrap)return;
  wrap.innerHTML=_faReflections.map((r,i)=>`
  <div style="display:grid;grid-template-columns:130px 1fr 24px;gap:6px;align-items:start;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)">
    <input type="date" class="fa-inp" style="padding:4px 8px" value="${r.date||''}" onchange="_faReflections[${i}].date=this.value">
    <textarea class="fa-inp" style="padding:4px 8px;min-height:50px" placeholder="Weekly check-in note..." oninput="_faReflections[${i}].note=this.value">${esc(r.note)}</textarea>
    <button class="btn btn-d" style="height:24px;font-size:11px;padding:0 6px;margin-top:2px" onclick="faRemoveReflection(${i})">✕</button>
  </div>`).join('');
}

function renderFAJournal(){
  const today=new Date().toISOString().split('T')[0];
  const habitsDone=D.habits.filter(h=>h.doneToday).length;
  const habitsTotal=D.habits.length;
  return`
  <div class="fa-section">
    <div class="fa-section-title">✏️ Journal Entry</div>
    <div class="fa-field" style="margin-bottom:10px">
      <label>Title <span style="color:var(--red)">*</span></label>
      <input class="fa-inp" id="fa-title" placeholder="Entry title...">
      <span class="err" id="fa-title-err">Title is required</span>
    </div>
    <div class="fa-row c2">
      <div class="fa-field"><label>Date</label><input type="date" class="fa-inp" id="fa-date" value="${today}"></div>
      <div class="fa-field"><label>Energy Level</label><select class="fa-inp" id="fa-energy"><option>low</option><option selected>medium</option><option>high</option></select></div>
    </div>
    <div class="fa-field" style="margin-bottom:10px">
      <label>Mood</label>
      <div class="fa-mood-row">
        ${['😊','🙂','😐','😫','😰'].map((m,i)=>`<span class="fa-mood-btn${i===0?' sel':''}" onclick="faSelectMood(this,'${m}')">${m}</span>`).join('')}
      </div>
      <input type="hidden" id="fa-mood-val" value="😊">
    </div>
    ${faCommonScope()}
    <div class="fa-field" style="margin-bottom:10px"><label>Tags</label>${faCommonTags()}</div>
  </div>
  <div class="fa-section">
    <div class="fa-section-title">💭 Reflection Prompts</div>
    <div class="fa-prompt-row"><label>What am I focused on?</label><textarea class="fa-inp" id="fa-prompt1" placeholder="Your answer..."></textarea></div>
    <div class="fa-prompt-row"><label>What's energizing me?</label><textarea class="fa-inp" id="fa-prompt2" placeholder="Your answer..."></textarea></div>
    <div class="fa-prompt-row"><label>What's one thing I learned?</label><textarea class="fa-inp" id="fa-prompt3" placeholder="Your answer..."></textarea></div>
  </div>
  <div class="fa-section">
    <div class="fa-section-title">✨ Highlights & Challenges</div>
    <div class="fa-row c2">
      <div class="fa-field"><label>Highlights</label><textarea class="fa-inp" id="fa-highlights" placeholder="What went well today?"></textarea></div>
      <div class="fa-field"><label>Challenges</label><textarea class="fa-inp" id="fa-challenges" placeholder="What was difficult?"></textarea></div>
    </div>
    <div class="fa-field" style="margin-bottom:10px">
      <label>Gratitude</label>
      <textarea class="fa-inp" id="fa-gratitude" placeholder="What are you grateful for? (optional)"></textarea>
    </div>
  </div>
  <div class="fa-section">
    <div class="fa-section-title">📊 Daily Stats</div>
    <div class="fa-row c3">
      <div class="fa-field"><label>Sleep Hours</label><input type="number" class="fa-inp" id="fa-sleep" min="0" max="24" step="0.5" placeholder="7.5"></div>
      <div class="fa-field"><label>Exercise</label><select class="fa-inp" id="fa-exercise"><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select></div>
      <div class="fa-field"><label>Habits Today (auto)</label><input class="fa-inp" value="${habitsDone} / ${habitsTotal} done" readonly style="background:rgba(255,255,255,.03);color:var(--t3)"></div>
    </div>
  </div>
  <div class="fa-section" id="fa-journal-rte-section">
    <div class="fa-section-title" style="display:flex;justify-content:space-between;align-items:center">
      <span>📓 Free-form Diary Entry</span>
      <span style="font-size:11px;font-weight:400;color:var(--t3)">Rich text — write freely, format as you go</span>
    </div>
    ${luRTE_render({id:'fa-jrnl-rte', placeholder:'Write freely here — this is your private diary. No prompts, no structure. Just your thoughts...', value:'', height:'200px'})}
    <!-- AI Assistance -->
    <div style="margin-top:8px;padding:8px;background:var(--s2);border-radius:6px;border:1px solid var(--bd1)">
      <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:6px">✨ AI Assistance</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap">
        <button type="button" class="btn btn-s" style="height:26px;font-size:11px" onclick="rteJournalAI('expand')">📝 Expand</button>
        <button type="button" class="btn btn-s" style="height:26px;font-size:11px" onclick="rteJournalAI('reflect')">🧘 Reflect</button>
        <button type="button" class="btn btn-s" style="height:26px;font-size:11px" onclick="rteJournalAI('summarise')">📌 Summarise</button>
        <button type="button" class="btn btn-s" style="height:26px;font-size:11px" onclick="rteJournalAI('mood')">🟡 Mood Analysis</button>
        <button type="button" class="btn btn-s" style="height:26px;font-size:11px" onclick="rteJournalAI('questions')">❓ Prompt Me</button>
        <button type="button" class="btn btn-d" style="height:26px;font-size:11px" onclick="document.getElementById('fa-jrnl-rte').innerHTML='';luRTE_updateCharCount('fa-jrnl-rte')">🗑 Clear</button>
        ${typeof _aiLengthChip==='function'?_aiLengthChip():''}
      </div>
      <div id="fa-jrnl-ai-result" style="display:none;margin-top:8px;padding:8px;background:var(--s1);border-radius:4px;font-size:11px;color:var(--t2);line-height:1.6;white-space:pre-wrap;max-height:200px;overflow-y:auto"></div>
    </div>
  </div>
  ${faCommonLinks()}`;
}

function renderFAHabit(){
  return`
  <div class="fa-section">
    <div class="fa-section-title">🔄 Habit Details</div>
    <div class="fa-field" style="margin-bottom:10px">
      <label>Habit Name <span style="color:var(--red)">*</span></label>
      <input class="fa-inp" id="fa-title" placeholder="What habit do you want to build?">
      <span class="err" id="fa-title-err">Title is required</span>
    </div>
    <div class="fa-field" style="margin-bottom:10px">
      <label>Description</label>
      <textarea class="fa-inp" id="fa-desc" placeholder="Why does this habit matter?"></textarea>
    </div>
    ${faCommonScope()}
    <div class="fa-field" style="margin-bottom:10px"><label>Tags</label>${faCommonTags()}</div>
  </div>
  <div class="fa-section">
    <div class="fa-section-title">⚙️ Habit Settings</div>
    <div class="fa-row c3">
      <div class="fa-field"><label>Icon (emoji)</label><input class="fa-inp" id="fa-icon" value="✅" style="font-size:18px"></div>
      <div class="fa-field"><label>Category</label><select class="fa-inp" id="fa-category"><option>Health</option><option>Mind</option><option>Work</option><option>Personal</option><option>Custom</option></select></div>
      <div class="fa-field"><label>Status</label><select class="fa-inp" id="fa-status"><option>Active</option><option>Paused</option><option>Archived</option></select></div>
    </div>
    <div class="fa-row c2">
      <div class="fa-field"><label>Cadence</label><select class="fa-inp" id="fa-cadence" onchange="faUpdateCadence(this.value)"><option>Daily</option><option>Weekdays</option><option>Weekly</option><option>Custom</option></select></div>
      <div class="fa-field"><label>Target Count / Period</label><input type="number" class="fa-inp" id="fa-target-count" min="1" value="1"></div>
    </div>
    <div id="fa-custom-days" style="display:none">
      <div class="fa-field"><label>Custom Days</label>
      <div class="fa-day-grid">
        ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<button type="button" class="fa-day-btn" data-day="${d}" onclick="faToggleDay('${d}')">${d}</button>`).join('')}
      </div></div>
    </div>
    <div class="fa-row c2">
      <div class="fa-field"><label>Target Time</label><input type="time" class="fa-inp" id="fa-targettime"></div>
      <div class="fa-field"><label>Started On</label><input type="date" class="fa-inp" id="fa-startedon" value="${new Date().toISOString().split('T')[0]}"></div>
    </div>
    <div class="fa-row c2">
      <div class="fa-field">
        <label>Reminder</label>
        <label class="fa-checkbox-row"><input type="checkbox" id="fa-reminder-enabled"> Enable reminder</label>
      </div>
      <div class="fa-field"><label>Reminder Time</label><input type="time" class="fa-inp" id="fa-reminder-time"></div>
    </div>
    <div class="fa-row">
      <div class="fa-field"><label>Linked Task</label><select class="fa-inp" id="fa-linkedtask"><option value="">None</option>${D.tasks.map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join('')}</select></div>
    </div>
  </div>
  ${faCommonLinks()}`;
}

// ===== SAVE HANDLER =====
function doFASave(addAnother){
  const titleEl=document.getElementById('fa-title');
  const titleErr=document.getElementById('fa-title-err');
  if(!titleEl||!titleEl.value.trim()){
    if(titleEl){titleEl.classList.add('err-border');}
    if(titleErr)titleErr.classList.add('show');
    return;
  }
  if(titleEl)titleEl.classList.remove('err-border');
  if(titleErr)titleErr.classList.remove('show');

  // Show spinner
  const saveBtn=document.getElementById('fa-save-btn');
  if(saveBtn)saveBtn.innerHTML='<span class="fa-spinner"></span>Saving...';

  setTimeout(()=>{
   try {
    const title=titleEl.value.trim();
    const desc=document.getElementById('fa-desc')?.value||'';
    const scope={personal:document.getElementById('fa-scope-personal')?.checked||false,business:document.getElementById('fa-scope-business')?.checked||false};
    _faSessionScope=scope;
    _faSessionTags=[..._faTags];
    let newId;

    if(_faType==='task'){
      const proj=document.getElementById('fa-project');
      const projId=proj?.value?parseInt(proj.value):null;
      const projName=projId?D.projects.find(p=>p.id===projId)?.name||'':'';
      const gSel=document.getElementById('fa-linkedgoal');
      const linkedGoalId=gSel?.value?parseInt(gSel.value):null;
      const assignee=document.getElementById('fa-assignee')?.value||null;
      const delegated=document.getElementById('fa-delegated')?.value||null;
      const t={
        id:nextId(D.tasks),title,notes:desc,
        priority:document.getElementById('fa-priority')?.value||'Medium',
        status:document.getElementById('fa-status')?.value||'Not Started',
        smartList:document.getElementById('fa-smartlist')?.value||'Task Intake',
        startDate:document.getElementById('fa-startdate')?.value||'',
        endDate:document.getElementById('fa-due')?.value||'',
        due:document.getElementById('fa-due')?.value||'',
        startTime:document.getElementById('fa-starttime')?.value||'',
        endTime:document.getElementById('fa-duetime')?.value||'',
        estimatedMins:parseInt(document.getElementById('fa-estmins')?.value)||0,
        actualMins:parseInt(document.getElementById('fa-actmins')?.value)||0,
        energy:document.getElementById('fa-energy')?.value||'medium',
        context:document.getElementById('fa-context')?.value||'',
        location:document.getElementById('fa-location')?.value||'Anywhere',
        pi:document.getElementById('fa-pi')?.value||'Process',
        recurring:document.getElementById('fa-recurring')?.value||'None',
        projectId:projId,project:projName,
        linkedGoalId,assignedTo:assignee,delegatedTo:delegated,
        snoozeUntil:document.getElementById('fa-snooze')?.value||'',
        reminder:document.getElementById('fa-reminder')?.value||'',
        myDay:document.getElementById('fa-myday')?.checked||false,
        isWorkTask:document.getElementById('fa-iswork')?.checked||true,
        tags:_faTags,scope,
        subtasks:_faSubtasks.filter(s=>s.title.trim()).map((s,i)=>({id:i+1,...s})),
        linkedNoteIds:_faLinked.notes,
        predecessorIds:_faLinked.tasks,
        comments:[],createdBy:D.creds.userName||'Idris Grant',
        createdAt:new Date().toISOString()
      };
      newId=t.id;
      D.tasks.push(t);
      save('tasks');
      // Assignment notification
      if(assignee&&assignee!==D.creds.userName){
        t.comments.push({author:D.creds.userName||'Idris Grant',ts:new Date().toLocaleString(),text:`Assigned to ${assignee}`});
        toast('📬 Task assigned to '+assignee);
      }
    } else if(_faType==='note'){
      const noteType=document.getElementById('fa-notetype')?.value||'Note';
      const n={
        id:nextId(D.notes),title,body:desc,
        bodyHtml:document.getElementById('fa-note-rte')?.innerHTML||'',
        noteType,para:document.getElementById('fa-para')?.value||'Resource',
        source:document.getElementById('fa-source')?.value||'Manual',
        sourceUrl:document.getElementById('fa-sourceurl')?.value||'',
        readingStatus:document.getElementById('fa-readstatus')?.value||'Inbox',
        favorite:document.getElementById('fa-favorite')?.checked||false,
        // The Favorites view filters on `starred`, so the ⭐ Favorite checkbox
        // must set `starred` (was hardcoded false → new "favorites" never showed).
        tags:_faTags,scope,updated:'Just now',starred:document.getElementById('fa-favorite')?.checked||false,
        linkedTaskIds:_faLinked.tasks,linkedProjectIds:_faLinked.projects,
        createdBy:D.creds.userName||'Idris Grant',
        createdAt:new Date().toISOString()
      };
      if(noteType==='Decision'){
        n.decision={context:document.getElementById('fa-dec-context')?.value||'',choice:document.getElementById('fa-dec-choice')?.value||'',rationale:document.getElementById('fa-dec-rationale')?.value||'',expectedOutcome:document.getElementById('fa-dec-outcome')?.value||'',reviewDate:document.getElementById('fa-dec-review')?.value||'',actualOutcome:document.getElementById('fa-dec-actual')?.value||'',alternatives:_faDecisionAlts};
      }
      if(noteType==='Meeting Notes'){
        n.meeting={datetime:document.getElementById('fa-meet-dt')?.value||'',attendees:document.getElementById('fa-meet-attendees')?.value||'',actionItems:_faMeetingActions};
        // Save action items as tasks
        _faMeetingActions.filter(a=>a.title.trim()).forEach(a=>{
          D.tasks.push({id:nextId(D.tasks),title:a.title,assignedTo:a.assignee||null,due:a.due||'',status:'Not Started',priority:'Medium',notes:'From meeting: '+title,createdBy:D.creds.userName||'Idris Grant',tags:['meeting-action'],linkedNoteIds:[n.id],subtasks:[],comments:[]});
        });
        if(_faMeetingActions.length)save('tasks');
      }
      newId=n.id;
      D.notes.push(n);
      save('notes');
    } else if(_faType==='project'){
      const p={
        id:nextId(D.projects),name:title,desc,
        status:document.getElementById('fa-status')?.value||'Active',
        area:document.getElementById('fa-area')?.value||'',
        owner:document.getElementById('fa-owner')?.value||'',
        color:document.getElementById('fa-color')?.value||'#3B82F6',
        startDate:document.getElementById('fa-startdate')?.value||'',
        due:document.getElementById('fa-due')?.value||'TBD',
        quarter:document.getElementById('fa-quarter')?.value||'',
        year:parseInt(document.getElementById('fa-year')?.value)||new Date().getFullYear(),
        kanbanAxis:document.getElementById('fa-kanban-axis')?.value||'Status',
        pct:0,tags:_faTags,scope,
        milestones:_faMilestones.filter(m=>m.label.trim()),
        linkedGoalIds:_faLinked.goals,
        createdBy:D.creds.userName||'Idris Grant',
        createdAt:new Date().toISOString()
      };
      newId=p.id;
      D.projects.push(p);
      save('projects');
    } else if(_faType==='goal'){
      const g={
        id:nextId(D.goals),title,
        icon:document.getElementById('fa-icon')?.value||'🎯',
        category:document.getElementById('fa-category')?.value||'Work',
        status:document.getElementById('fa-status')?.value||'Active',
        year:parseInt(document.getElementById('fa-year')?.value)||new Date().getFullYear(),
        quarter:document.getElementById('fa-quarter')?.value||'',
        startDate:document.getElementById('fa-startdate')?.value||'',
        dueDate:document.getElementById('fa-due')?.value||'',
        targetMetric:document.getElementById('fa-metric')?.value||'',
        targetNumber:parseFloat(document.getElementById('fa-target-num')?.value)||0,
        currentValue:parseFloat(document.getElementById('fa-current')?.value)||0,
        unit:document.getElementById('fa-unit')?.value||'',
        area:document.getElementById('fa-area')?.value||'',
        target:document.getElementById('fa-metric')?.value||'',
        descriptionHtml:document.getElementById('fa-goal-rte')?.innerHTML||'',
        pct:0,tags:_faTags,scope,
        reflections:_faReflections.filter(r=>r.note.trim()),
        linkedTaskIds:_faLinked.tasks,
        milestones:[],
        createdBy:D.creds.userName||'Idris Grant',
        createdAt:new Date().toISOString()
      };
      newId=g.id;
      D.goals.push(g);
      save('goals');
    } else if(_faType==='journal'){
      const j={
        id:nextId(D.journal),title,
        date:document.getElementById('fa-date')?.value||new Date().toISOString().split('T')[0],
        mood:document.getElementById('fa-mood-val')?.value||'😊',
        energy:document.getElementById('fa-energy')?.value||'medium',
        body:desc,
        diaryBody:document.getElementById('fa-jrnl-rte')?.innerHTML||'',
        prompts:{focused:document.getElementById('fa-prompt1')?.value||'',energizing:document.getElementById('fa-prompt2')?.value||'',learned:document.getElementById('fa-prompt3')?.value||''},
        highlights:document.getElementById('fa-highlights')?.value||'',
        challenges:document.getElementById('fa-challenges')?.value||'',
        gratitude:document.getElementById('fa-gratitude')?.value||'',
        sleep:parseFloat(document.getElementById('fa-sleep')?.value)||null,
        exercise:document.getElementById('fa-exercise')?.value||'',
        habitsDone:D.habits.filter(h=>h.doneToday).length,
        habitsTotal:D.habits.length,
        tags:_faTags,scope,
        createdBy:D.creds.userName||'Idris Grant',
        createdAt:new Date().toISOString()
      };
      newId=j.id;
      D.journal.push(j);
      save('journal');
    } else if(_faType==='habit'){
      const h={
        id:nextId(D.habits),
        title,notes:desc,
        icon:document.getElementById('fa-icon')?.value||'✅',
        category:document.getElementById('fa-category')?.value||'Health',
        status:document.getElementById('fa-status')?.value||'Active',
        cadence:document.getElementById('fa-cadence')?.value||'Daily',
        customDays:_faCustomDays,
        targetCount:parseInt(document.getElementById('fa-target-count')?.value)||1,
        targetTime:document.getElementById('fa-targettime')?.value||'',
        startedOn:document.getElementById('fa-startedon')?.value||new Date().toISOString().split('T')[0],
        reminderEnabled:document.getElementById('fa-reminder-enabled')?.checked||false,
        reminderTime:document.getElementById('fa-reminder-time')?.value||'',
        linkedTaskId:document.getElementById('fa-linkedtask')?.value?parseInt(document.getElementById('fa-linkedtask').value):null,
        streak:0,doneToday:false,
        tags:_faTags,scope,
        createdBy:D.creds.userName||'Idris Grant',
        createdAt:new Date().toISOString()
      };
      newId=h.id;
      D.habits.push(h);
      save('habits');
    }

    if(newId)applyBidirectionalLinks(_faType,newId);
    // Link selected bookmarks to the new entity (server-side join). Fire-and-forget; non-fatal.
    if(newId&&Array.isArray(_faLinked.bookmarks)&&_faLinked.bookmarks.length){
      const linkableTypes=new Set(['note','idea','task','project','goal']);
      if(linkableTypes.has(_faType)){
        _faLinked.bookmarks.forEach(bid=>{
          _trpc('bookmarks.linkToEntity',{bookmarkId:bid,entityType:_faType,entityId:newId},'mutation').catch(e=>console.warn('[bookmarks] link failed',e?.message||e));
        });
      }
    }
    toast('✓ '+(_faType||'Item')+' saved: '+title);
    _faHasChanges=false;
    updateSidebarBadges();
    renderScreen(curScreen);

    if(addAnother){
      // Re-open same type with session scope/tags persisted
      openFA(_faType);
    } else {
      closeFA(true);
    }
   } catch(err) {
    // If anything in the save flow throws, surface it to the user instead of
    // hanging the spinner forever. The note may have been pushed to D.notes
    // already — just not finalised (badges / re-render).
    console.error('[doFASave] error during save:',err);
    toast({type:'error',title:'⚠ Save error',msg:(err&&err.message)?err.message:'Something went wrong while saving. Check the browser console for details.',duration:8000});
   } finally {
    // Always reset the Save button so the user isn't stuck on "Saving…"
    const btn=document.getElementById('fa-save-btn');
    if(btn)btn.innerHTML='Save';
   }
  },200);
}

// ====== CONTACTS AI ======
function aiContactHealth(){
  const contacts=D.contacts||[];
  if(!contacts.length){toast('No contacts yet');return;}
  const today=new Date();
  const scored=contacts.map(c=>{
    const linkedTasks=D.tasks.filter(t=>(t.tags||[]).includes('contact:'+((c.name||'').toLowerCase().replace(/\s+/g,'-'))));
    const doneTasks=linkedTasks.filter(t=>t.status==='Done').length;
    const openTasks=linkedTasks.filter(t=>t.status!=='Done').length;
    // Days since last contact (use completedAt of most recent done task)
    const lastDates=linkedTasks.filter(t=>t.completedAt).map(t=>new Date(t.completedAt)).sort((a,b)=>b-a);
    const daysSince=lastDates.length?Math.floor((today-lastDates[0])/(1000*60*60*24)):999;
    // Health score: recent contact + task completion rate
    const recencyScore=daysSince<7?100:daysSince<14?80:daysSince<30?60:daysSince<60?40:daysSince<90?20:0;
    const taskScore=linkedTasks.length?Math.round(doneTasks/linkedTasks.length*100):50;
    const health=Math.round((recencyScore*0.6+taskScore*0.4));
    return{c,health,daysSince,doneTasks,openTasks,linkedTasks:linkedTasks.length};
  }).sort((a,b)=>a.health-b.health);
  const getColor=h=>h>=70?'var(--grn)':h>=40?'var(--warn)':'var(--red)';
  const getLabel=h=>h>=70?'Strong':h>=40?'Needs Attention':'At Risk';
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">❤ Relationship Health</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:10px">Scored by recency of contact + task completion rate:</div>
  <div style="max-height:340px;overflow-y:auto">${scored.map(({c,health,daysSince,linkedTasks,openTasks})=>{
    const color=getColor(health);
    const label=getLabel(health);
    return`<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;margin-bottom:4px;border-radius:6px;background:var(--s2);cursor:pointer" onclick="closeModal();openContactDetail(${c.id})">
      <div style="width:36px;height:36px;border-radius:50%;background:var(--acs);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:var(--ac);flex-shrink:0">${(c.name||'?')[0].toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500">${esc(c.name)}</div>
        <div style="font-size:11px;color:var(--t3)">${daysSince===999?'Never contacted':daysSince===0?'Contacted today':'Last contact '+daysSince+'d ago'} · ${linkedTasks} task${linkedTasks!==1?'s':''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:16px;font-weight:700;color:${color}">${health}</div>
        <div style="font-size:11px;color:${color}">${label}</div>
      </div>
    </div>`;
  }).join('')}</div>
  <button class="btn btn-p" style="margin-top:10px" onclick="closeModal()">Close</button>`;
  document.getElementById('modal-capture').classList.add('show');
}

function aiContactConversation(id){
  const c=D.contacts.find(x=>x.id===id);
  if(!c)return;
  const linkedTasks=D.tasks.filter(t=>(t.tags||[]).includes('contact:'+((c.name||'').toLowerCase().replace(/\s+/g,'-'))));
  const recentTask=linkedTasks.filter(t=>t.status==='Done').sort((a,b)=>(b.completedAt||'').localeCompare(a.completedAt||''))[0];
  const role=c.role||c.title||'professional';
  const company=c.company||'their company';
  const starters=[
    `How has ${company} been navigating the current market conditions?`,
    `What\'s the biggest challenge your team is working through right now?`,
    `I\'ve been thinking about ${role.toLowerCase().includes('ceo')||role.toLowerCase().includes('founder')?'scaling and growth':'your industry'} lately — what\'s your take on where things are heading?`,
    recentTask?`Last time we connected, we discussed "${recentTask.title}" — how did that turn out?`:`It\'s been a while — what\'s been keeping you busy lately?`,
    `What\'s one thing you wish more people understood about what you do at ${company}?`,
    c.notes?`I noticed you mentioned ${c.notes.split(' ').slice(0,5).join(' ')}... how did that develop?`:`What projects are you most excited about right now?`,
    `How are you thinking about ${new Date().getFullYear()+1} planning — any big shifts in direction?`,
    `Who else in your network do you think I should be talking to about this space?`,
  ].filter(Boolean);
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:4px">💬 Conversation Starters</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:10px">For your next interaction with <strong>${esc(c.name)}</strong> (${esc(role)} at ${esc(company)}):</div>
  <div style="max-height:300px;overflow-y:auto">${starters.map((s,i)=>`<div style="padding:8px 10px;margin-bottom:6px;border-radius:6px;background:var(--s2);font-size:12px;line-height:1.5;cursor:pointer;border:1px solid transparent" onmouseover="this.style.borderColor='var(--ac)'" onmouseout="this.style.borderColor='transparent'" onclick="navigator.clipboard&&navigator.clipboard.writeText('${s.replace(/'/g,"\\'").replace(/"/g,'&quot;')}');toast('📋 Copied to clipboard')">
    <span style="color:var(--t3);font-size:11px;margin-right:6px">${i+1}.</span>${esc(s)}
  </div>`).join('')}</div>
  <div style="font-size:11px;color:var(--t3);margin-top:8px">📋 Click any starter to copy to clipboard</div>
  <button class="btn btn-p" style="margin-top:8px" onclick="closeModal()">Close</button>`;
  document.getElementById('modal-capture').classList.add('show');
}

function aiContactDuplicates(){
  const contacts=D.contacts||[];
  if(contacts.length<2){toast('Need at least 2 contacts to detect duplicates');return;}
  const dupes=[];
  const normalize=s=>(s||'').toLowerCase().trim().replace(/[^a-z0-9]/g,'');
  for(let i=0;i<contacts.length;i++){
    for(let j=i+1;j<contacts.length;j++){
      const a=contacts[i],b=contacts[j];
      const nameA=normalize(a.name),nameB=normalize(b.name);
      const emailA=normalize(a.email),emailB=normalize(b.email);
      // Exact email match
      if(emailA&&emailA===emailB){dupes.push({a,b,reason:'Same email address',confidence:'High'});continue;}
      // Same name
      if(nameA&&nameA===nameB){dupes.push({a,b,reason:'Identical name',confidence:'High'});continue;}
      // Similar name (one is substring of other)
      if(nameA.length>3&&nameB.length>3&&(nameA.includes(nameB)||nameB.includes(nameA))){dupes.push({a,b,reason:'Similar name',confidence:'Medium'});continue;}
      // Same company + similar role
      const compA=normalize(a.company),compB=normalize(b.company);
      const roleA=normalize(a.role||a.title||''),roleB=normalize(b.role||b.title||'');
      if(compA&&compA===compB&&roleA&&roleA===roleB){dupes.push({a,b,reason:'Same company & role',confidence:'Medium'});}
    }
  }
  const m=document.getElementById('modal-content');
  if(!dupes.length){
    m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">🔍 Duplicate Detection</h2><div style="padding:20px;text-align:center;color:var(--grn);font-size:13px">✅ No duplicates found across ${contacts.length} contacts!</div><button class="btn btn-p" style="margin-top:10px" onclick="closeModal()">Close</button>`;
  } else {
    m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">🔍 Duplicate Detection</h2>
    <div style="font-size:11px;color:var(--t2);margin-bottom:10px">Found ${dupes.length} potential duplicate pair${dupes.length!==1?'s':''}:</div>
    <div style="max-height:320px;overflow-y:auto">${dupes.map(({a,b,reason,confidence})=>{
      const confColor=confidence==='High'?'var(--red)':'var(--warn)';
      return`<div style="padding:10px;margin-bottom:8px;border-radius:6px;background:var(--s2);font-size:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="font-weight:600">${esc(reason)}</span>
          <span style="font-size:11px;color:${confColor};font-weight:600">${confidence} confidence</span>
        </div>
        <div style="display:flex;gap:8px">
          <div style="flex:1;padding:6px;background:var(--s3);border-radius:4px;cursor:pointer" onclick="closeModal();openContactDetail(${a.id})">
            <div style="font-weight:500">${esc(a.name)}</div>
            <div style="font-size:11px;color:var(--t3)">${esc(a.email||'')} · ${esc(a.company||'')}</div>
          </div>
          <div style="flex:1;padding:6px;background:var(--s3);border-radius:4px;cursor:pointer" onclick="closeModal();openContactDetail(${b.id})">
            <div style="font-weight:500">${esc(b.name)}</div>
            <div style="font-size:11px;color:var(--t3)">${esc(b.email||'')} · ${esc(b.company||'')}</div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--t3);margin-top:4px">Click a card to open and manually merge or delete</div>
      </div>`;
    }).join('')}</div>
    <button class="btn btn-p" style="margin-top:10px" onclick="closeModal()">Close</button>`;
  }
  document.getElementById('modal-capture').classList.add('show');
}

// ====== BOOKMARKS ======
let _bkSearch='',_bkTagFilter='',_bkFavFilter=false,_bkReadFilter='',_bkSort='newest',_bkPage=1,_bkPageSize=30;
let _bkData=[],_bkTotal=0,_bkTags=[],_bkLoading=false;
// Collections state
let _bkCollections=[],_bkCollFilter=null; // null = All Bookmarks
let _bkShares=[];
let _bkMultiSelect=false,_bkSelected=new Set(); // bulk selection state
async function loadCollections(){
  try{_bkCollections=await _trpc('bookmarks.collections.list',null,'query');}catch(e){_bkCollections=[];}
}
async function loadShares(){
  try{_bkShares=await _trpc('bookmarks.shares.list',null,'query');}catch(e){_bkShares=[];}
}

async function loadBookmarks(){
  _bkLoading=true;
  try{
    const params={search:_bkSearch||undefined,tag:_bkTagFilter||undefined,sort:_bkSort,page:_bkPage,pageSize:_bkPageSize};
    if(_bkFavFilter) params.isFavorite=true;
    if(_bkReadFilter==='read') params.isRead=true;
    else if(_bkReadFilter==='unread') params.isRead=false;
    const res=await _trpc('bookmarks.list',params,'query');
    _bkData=res.bookmarks||[];
    _bkTotal=res.total||0;
  }catch(e){console.error('Failed to load bookmarks',e);_bkData=[];_bkTotal=0;}
  try{_bkTags=await _trpc('bookmarks.tags',null,'query');}catch(e){_bkTags=[];}
  _bkLoading=false;
}

function renderBookmarks(){
  loadBookmarks().then(()=>paintBookmarks());
  loadCollections().then(()=>paintBookmarks());
  loadShares();
  paintBookmarks(); // show loading state immediately
}

// ─── Related Bookmarks helpers ───────────────────────────────────────────────

async function loadRelatedBookmarks(entityType, entityId){
  const containerId = `related-bk-${entityType}-${entityId}`;
  const el = document.getElementById(containerId);
  if(!el) return;
  try {
    const result = await _trpc('bookmarks.getLinkedBookmarks', { entityType, entityId });
    const items = result?.bookmarks || result || [];
    if(!items.length){
      el.innerHTML = `<div style="color:var(--t3);font-size:11px;font-style:italic">No linked bookmarks yet. Click + Link to add one.</div>`;
      return;
    }
    el.innerHTML = items.map(b => `
      <div style="display:flex;align-items:flex-start;gap:6px;padding:5px 0;border-bottom:1px solid var(--bd1)">
        ${b.favicon ? `<img src="${b.favicon}" style="width:14px;height:14px;margin-top:2px;flex-shrink:0" onerror="this.style.display='none'">` : '<span style="font-size:12px;flex-shrink:0">🔖</span>'}
        <div style="flex:1;min-width:0">
          <a href="${b.url}" target="_blank" rel="noopener" style="font-size:11px;font-weight:500;color:var(--ac);text-decoration:none;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(b.title||b.url)}">${esc(b.title||b.url)}</a>
          ${b.description ? `<div style="font-size:11px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.description.slice(0,80))}</div>` : ''}
        </div>
        <button class="btn btn-s" style="font-size:11px;padding:1px 5px;color:var(--err);flex-shrink:0" onclick="unlinkBookmarkFromEntity('${entityType}',${entityId},${b.id})" title="Remove link">✕</button>
      </div>
    `).join('');
  } catch(e) {
    el.innerHTML = `<div style="color:var(--err);font-size:11px">Failed to load linked bookmarks.</div>`;
  }
}

async function unlinkBookmarkFromEntity(entityType, entityId, bookmarkId){
  try {
    await _trpc('bookmarks.unlinkFromEntity', { entityType, entityId, bookmarkId });
    loadRelatedBookmarks(entityType, entityId);
    toast('Bookmark unlinked.');
  } catch(e) {
    toast('Failed to unlink bookmark.');
  }
}

function showLinkBookmarkPanel(entityType, entityId){
  const html = `
    <div style="padding:4px 0">
      <div style="font-size:12px;font-weight:600;margin-bottom:10px">🔗 Link a Bookmark</div>
      <input class="inp" id="bk-link-search" placeholder="Search your bookmarks…" oninput="filterLinkBookmarkList(this.value)" style="margin-bottom:8px">
      <div id="bk-link-list" style="max-height:260px;overflow-y:auto">
        <div style="color:var(--t3);font-size:11px;text-align:center;padding:20px 0">Loading bookmarks…</div>
      </div>
    </div>
  `;
  openBkModal('Link Bookmark', html, [
    { label: 'Cancel', cls: 'btn-s', action: 'closeBkModal()' }
  ]);
  // Load bookmarks into the list
  _trpc('bookmarks.list', { page: 1, pageSize: 50 }).then(result => {
    const items = result?.bookmarks || [];
    window._bkLinkItems = items;
    window._bkLinkEntityType = entityType;
    window._bkLinkEntityId = entityId;
    renderLinkBookmarkList(items, entityType, entityId);
  }).catch(() => {
    const listEl = document.getElementById('bk-link-list');
    if(listEl) listEl.innerHTML = '<div style="color:var(--err);font-size:11px">Failed to load bookmarks.</div>';
  });
}

function filterLinkBookmarkList(query){
  const items = window._bkLinkItems || [];
  const filtered = query.trim() ? items.filter(b => (b.title||'').toLowerCase().includes(query.toLowerCase()) || (b.url||'').toLowerCase().includes(query.toLowerCase())) : items;
  renderLinkBookmarkList(filtered, window._bkLinkEntityType, window._bkLinkEntityId);
}

function renderLinkBookmarkList(items, entityType, entityId){
  const listEl = document.getElementById('bk-link-list');
  if(!listEl) return;
  if(!items.length){
    listEl.innerHTML = '<div style="color:var(--t3);font-size:11px;text-align:center;padding:16px 0">No bookmarks found.</div>';
    return;
  }
  listEl.innerHTML = items.map(b => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid var(--bd1);cursor:pointer" onclick="doLinkBookmark('${entityType}',${entityId},${b.id},this)">
      ${b.favicon ? `<img src="${b.favicon}" style="width:16px;height:16px;flex-shrink:0" onerror="this.style.display='none'">` : '<span style="font-size:14px">🔖</span>'}
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.title||b.url)}</div>
        <div style="font-size:11px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.url)}</div>
      </div>
      <button class="btn btn-s" style="font-size:11px;padding:2px 8px;flex-shrink:0">Link</button>
    </div>
  `).join('');
}

async function doLinkBookmark(entityType, entityId, bookmarkId, rowEl){
  try {
    await _trpc('bookmarks.linkToEntity', { entityType, entityId, bookmarkId }, 'mutation');
    if(rowEl) rowEl.style.background = 'var(--ok)22';
    loadRelatedBookmarks(entityType, entityId);
    toast('Bookmark linked!');
    setTimeout(closeBkModal, 600);
  } catch(e) {
    toast('Failed to link bookmark.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function paintBookmarks(){
  const el=$('bookmarks-main');
  if(!el)return;
  const totalPages=Math.ceil(_bkTotal/_bkPageSize)||1;

  // Tag pills for filter
  const tagPills=_bkTags.map(t=>`<span class="pill" style="cursor:pointer;margin:2px;${_bkTagFilter===t?'background:var(--ac);color:#fff':'background:var(--s3);color:var(--t2)'}" onclick="_bkTagFilter=_bkTagFilter==='${esc(t)}'?'':'${esc(t)}';_bkPage=1;renderBookmarks()">${esc(t)}</span>`).join('');

  // Collections sidebar
  const collSidebar=`
    <div style="width:190px;flex-shrink:0;border-right:1px solid var(--bd1);padding-right:12px;margin-right:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.5px">Collections</span>
        <button class="btn btn-s" style="height:20px;font-size:10px;padding:0 6px" onclick="showCreateCollection()" title="New collection">+</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:2px">
        <div class="lr" style="border-radius:6px;padding:5px 8px;cursor:pointer;background:${_bkCollFilter===null?'var(--acs)':'transparent'};color:${_bkCollFilter===null?'var(--ac)':'inherit'}" onclick="_bkCollFilter=null;_bkPage=1;renderBookmarks()">
          <span style="font-size:12px">&#128278;</span><span style="font-size:11px;font-weight:500">All Bookmarks</span><span style="font-size:11px;color:var(--t3);margin-left:auto">${_bkTotal}</span>
        </div>
        ${_bkCollections.map(c=>`
          <div class="lr" style="border-radius:6px;padding:5px 8px;cursor:pointer;background:${_bkCollFilter===c.id?'var(--acs)':'transparent'};color:${_bkCollFilter===c.id?'var(--ac)':'inherit'}" onclick="_bkCollFilter=${c.id};_bkPage=1;loadCollectionView(${c.id})">
            <span style="font-size:12px">${esc(c.icon||'&#128193;')}</span>
            <span style="font-size:11px;font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</span>
            <span style="font-size:11px;color:var(--t3)">${c.bookmarkCount||0}</span>
            <div style="display:flex;gap:2px" onclick="event.stopPropagation()">
              <button class="btn btn-s" style="height:16px;font-size:10px;padding:0 4px" onclick="editCollection(${c.id})" title="Edit">&#9999;</button>
              <button class="btn btn-s" style="height:16px;font-size:10px;padding:0 4px;color:var(--red)" onclick="deleteCollection(${c.id})" title="Delete">&#128465;</button>
            </div>
          </div>`).join('')}
        ${_bkCollections.length===0?'<div style="font-size:11px;color:var(--t3);padding:8px 4px;font-style:italic">No collections yet</div>':''}
      </div>
      <div style="margin-top:14px;border-top:1px solid var(--bd1);padding-top:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.5px">Shared Links</span>
          <button class="btn btn-s" style="height:20px;font-size:10px;padding:0 6px" onclick="showShareManager()" title="Manage shares">&#9881;</button>
        </div>
        ${_bkShares.length===0?'<div style="font-size:11px;color:var(--t3);font-style:italic">No shared links</div>':''}
        ${_bkShares.slice(0,5).map(s=>`
          <div style="margin-bottom:6px;padding:4px 0;border-bottom:1px solid var(--bd1)">
            <div style="font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--t1)">${esc(s.title||'Untitled share')}</div>
            <div style="font-size:11px;color:var(--t3);margin-bottom:3px">${s.viewCount||0} views</div>
            <div style="display:flex;gap:4px">
              <button class="btn btn-s" style="height:16px;font-size:10px;padding:0 5px" onclick="copyShareLink('${esc(s.token)}')">&#128203; Copy</button>
              <button class="btn btn-s" style="height:16px;font-size:10px;padding:0 5px;color:var(--red)" onclick="deleteShare(${s.id})">&#128465;</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`;

  // Bookmark cards
  let cards='';
  if(_bkLoading){
    cards='<div style="text-align:center;padding:40px;color:var(--t3)">Loading bookmarks...</div>';
  }else if(_bkData.length===0){
    cards=renderEmptyState({
      icon:'🔖',
      title:_bkCollFilter?'Empty collection':'Build your library',
      hint:_bkCollFilter?'Add bookmarks to this collection using the folder button on any card.':'Save articles, docs, and references that matter. AI can suggest tags and write descriptions for you.',
      ctaLabel:_bkCollFilter?'':'+ Add your first bookmark',
      ctaFn:'showAddBookmark()'
    });
  }else{
    cards=_bkData.map(b=>{
      const tags=b.tags?JSON.parse(b.tags):[];
      const tagHtml=tags.map(t=>`<span class="pill" style="background:var(--s3);color:var(--t2);font-size:11px;margin-right:3px">${esc(t)}</span>`).join('');
      const favicon=b.favicon?`<img src="${esc(b.favicon)}" style="width:16px;height:16px;border-radius:2px;flex-shrink:0" onerror="this.style.display='none'">`:'<span style="font-size:14px">&#127760;</span>';
      const domain=(() => { try { return new URL(b.url).hostname.replace(/^www\./,''); } catch { return ''; } })();
      const readMins=b.wordCount?Math.max(1,Math.round(b.wordCount/200)):null;
      const readTimeHtml=readMins?`<span style="font-size:11px;color:var(--t3)">&#9201; ${readMins} min read</span>`:'';
      const isSelected=_bkSelected.has(b.id);
      return `<div class="cd" style="cursor:pointer;transition:border-color .15s,box-shadow .15s;position:relative${b.isRead?';opacity:.75':''}${isSelected?';border-color:var(--ac);box-shadow:0 0 0 2px var(--acs)':''}" onmouseenter="this.style.borderColor='var(--ac)'" onmouseleave="this.style.borderColor='${isSelected?'var(--ac)':''}'" onclick="_bkMultiSelect?toggleBkSelect(${b.id}):window.open('${esc(b.url)}','_blank')">
        ${_bkMultiSelect?`<div style="position:absolute;top:8px;left:8px;z-index:2;width:18px;height:18px;border-radius:4px;border:2px solid ${isSelected?'var(--ac)':'var(--bd2)'};background:${isSelected?'var(--ac)':'var(--s1)'};display:flex;align-items:center;justify-content:center;cursor:pointer" onclick="event.stopPropagation();toggleBkSelect(${b.id})">${isSelected?'<svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" stroke-width="1.5" fill="none"/></svg>':''}</div>`:''}
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;min-width:0;overflow:hidden">
              ${favicon}
              <span style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 0%;min-width:0">${esc(b.title||'Untitled')}</span>
              <span style="font-size:11px;color:var(--t3);flex-shrink:0">${esc(domain)}</span>
            </div>
            ${b.description?`<div style="font-size:11px;color:var(--t2);margin-bottom:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(b.description)}</div>`:''}
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              ${tagHtml}
              ${readTimeHtml}
              <span style="font-size:11px;color:var(--t3)">${new Date(b.createdAt).toLocaleDateString()}</span>
              ${b.isRead?'<span class="pill" style="background:var(--oks);color:var(--ok);font-size:11px">&#10003; Read</span>':''}
            </div>
          </div>
          ${b.ogImage?`<img src="${esc(b.ogImage)}" style="width:80px;height:56px;border-radius:6px;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">`:''}
        </div>
        <div style="position:absolute;top:8px;right:8px;display:flex;gap:4px" onclick="event.stopPropagation()">
          <button class="btn btn-s" style="height:22px;font-size:11px;padding:0 6px" onclick="event.stopPropagation();toggleBookmarkFav(${b.id},${b.isFavorite})" title="${b.isFavorite?'Unfavorite':'Favorite'}">${b.isFavorite?'&#11088;':'&#9734;'}</button>
          <button class="btn btn-s" style="height:22px;font-size:11px;padding:0 6px" onclick="event.stopPropagation();toggleBookmarkRead(${b.id},${b.isRead})" title="${b.isRead?'Mark unread':'Mark read'}">${b.isRead?'Unread':'Read'}</button>
          <button class="btn btn-s" style="height:22px;font-size:11px;padding:0 6px" onclick="event.stopPropagation();showAddToCollection(${b.id})" title="Add to collection">&#128193;</button>
          ${_bkCollFilter?`<button class="btn btn-s" style="height:22px;font-size:11px;padding:0 6px;color:var(--warn)" onclick="event.stopPropagation();removeFromCollection(${_bkCollFilter},${b.id})" title="Remove from this collection">&#128197;</button>`:''}
          <button class="btn btn-s" style="height:22px;font-size:11px;padding:0 6px" onclick="event.stopPropagation();shareBookmark(${b.id})" title="Share">&#128279;</button>
          <button class="btn btn-s" style="height:22px;font-size:11px;padding:0 6px" onclick="event.stopPropagation();editBookmark(${b.id})" title="Edit">&#9999;</button>
          <button class="btn btn-s" style="height:22px;font-size:11px;padding:0 6px;color:var(--red)" onclick="event.stopPropagation();deleteBookmark(${b.id})" title="Delete">&#128465;</button>
        </div>
      </div>`;
    }).join('');
  }

  const collTitle=_bkCollFilter?(_bkCollections.find(c=>c.id===_bkCollFilter)||{name:'Collection'}).name:'All Bookmarks';

  el.innerHTML=`<div class="pg-h ph-r">
    <div><h1>&#128278; Bookmarks</h1><p style="font-size:12px;color:var(--t2)">${_bkCollFilter?'Viewing: '+esc(collTitle):'Your saved web pages &amp; reading list'} <span style="opacity:.45;font-size:11px">· build ${esc(String((window.__APP_BUILD)||'?'))}</span></p></div>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="btn btn-s" style="font-size:11px" onclick="showBookmarklet()" title="Get browser bookmarklet for one-click saving">&#128278; Bookmarklet</button>
      ${_bkCollFilter?`<button class="btn btn-s" style="font-size:11px" onclick="shareCollection(${_bkCollFilter})">&#128279; Share Collection</button>`:''}
      <button class="btn ${_bkMultiSelect?'btn-p':'btn-s'}" style="font-size:11px" onclick="toggleBkMultiSelect()" title="Select multiple bookmarks">&#9745; Select</button>
      <button class="btn btn-p" onclick="showAddBookmark()">+ Add Bookmark</button>
    </div>
  </div>
  <div style="display:flex;gap:0;align-items:flex-start">
    ${collSidebar}
    <div style="flex:1;min-width:0">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
        <div class="tb-s" style="max-width:280px;flex:1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input placeholder="Search bookmarks..." value="${esc(_bkSearch)}" oninput="_bkSearch=this.value;_bkPage=1;clearTimeout(window._bkDebounce);window._bkDebounce=setTimeout(renderBookmarks,300)">
        </div>
        <select class="inp" style="width:auto;height:32px;font-size:11px" onchange="_bkSort=this.value;_bkPage=1;renderBookmarks()">
          <option value="newest" ${_bkSort==='newest'?'selected':''}>Newest</option>
          <option value="oldest" ${_bkSort==='oldest'?'selected':''}>Oldest</option>
          <option value="alpha" ${_bkSort==='alpha'?'selected':''}>A-Z</option>
        </select>
        ${!_bkCollFilter?`
        <button class="btn ${_bkFavFilter?'btn-p':'btn-s'}" style="height:32px;font-size:11px" onclick="_bkFavFilter=!_bkFavFilter;_bkPage=1;renderBookmarks()">&#11088; Favorites</button>
        <button class="btn ${_bkReadFilter==='unread'?'btn-p':'btn-s'}" style="height:32px;font-size:11px" onclick="_bkReadFilter=_bkReadFilter==='unread'?'':'unread';_bkPage=1;renderBookmarks()">&#128218; Reading List</button>
        <select class="inp" style="width:auto;height:32px;font-size:11px" onchange="_bkReadFilter=this.value;_bkPage=1;renderBookmarks()">
          <option value="" ${_bkReadFilter===''?'selected':''}>All</option>
          <option value="unread" ${_bkReadFilter==='unread'?'selected':''}>Unread</option>
          <option value="read" ${_bkReadFilter==='read'?'selected':''}>Read</option>
        </select>`:''}
      </div>
      ${_bkTags.length&&!_bkCollFilter?`<div style="margin-bottom:12px;display:flex;flex-wrap:wrap;gap:2px;align-items:center"><span style="font-size:11px;color:var(--t3);margin-right:4px">Tags:</span>${tagPills}</div>`:''}
      ${_bkMultiSelect&&_bkSelected.size>0?`<div style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:200;background:var(--s2);border:1px solid var(--ac);border-radius:12px;padding:10px 18px;display:flex;gap:10px;align-items:center;box-shadow:0 4px 24px rgba(0,0,0,.4)">
        <span style="font-size:12px;color:var(--t2)">${_bkSelected.size} selected</span>
        <button class="btn btn-s" style="font-size:11px" onclick="bulkAddToCollection()">&#128193; Add to Collection</button>
        <button class="btn btn-s" style="font-size:11px" onclick="bulkShareBookmarks()">&#128279; Share Selected</button>
        <button class="btn btn-s" style="font-size:11px;color:var(--warn)" onclick="_bkSelected.clear();paintBookmarks()">&#10005; Clear</button>
        <button class="btn btn-s" style="font-size:11px" onclick="toggleBkMultiSelect()">Done</button>
      </div>`:''}
      <div id="bk-cards">${cards}</div>
      ${_bkTotal>_bkPageSize?`<div style="display:flex;justify-content:center;align-items:center;gap:12px;margin-top:16px">
        <button class="btn btn-s" ${_bkPage<=1?'disabled':''} onclick="_bkPage--;renderBookmarks()">&#8592; Prev</button>
        <span style="font-size:11px;color:var(--t3)">Page ${_bkPage} of ${totalPages}</span>
        <button class="btn btn-s" ${_bkPage>=totalPages?'disabled':''} onclick="_bkPage++;renderBookmarks()">Next &#8594;</button>
      </div>`:''}
      <div style="margin-top:16px;font-size:11px;color:var(--t3);text-align:center">${_bkTotal} bookmark${_bkTotal!==1?'s':''} total</div>
    </div>
  </div>`;
}
function openBkModal(title,body,buttons){
  const m=$('modal-content');
  if(!m)return;
  const btns=(buttons||[]).map(b=>`<button class="btn ${b.cls||'btn-s'}" onclick="${b.action}">${b.label}</button>`).join('');
  m.innerHTML=`<h2 style="margin:0 0 16px;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:space-between">${title}<button class="close" onclick="closeModal()">✕</button></h2><div id="bk-modal-body">${body}</div>${btns?`<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">${btns}</div>`:''}` ;
  $('modal-capture').classList.add('show');
  document.body.style.overflow='hidden';
  setTimeout(()=>{const fi=m.querySelector('input,textarea');if(fi)fi.focus();},80);
}

function showBookmarklet(){
  const base=window.location.origin;
  const code=`javascript:(function(){var u=encodeURIComponent(location.href);var t=encodeURIComponent(document.title);window.open('${base}/api/bookmarklet/save?url='+u+'&title='+t,'_blank','width=400,height=300,menubar=no,toolbar=no,location=no');})();`;
  const safeCode=code.replace(/</g,'&lt;').replace(/>/g,'&gt;');
  openBkModal('🔖 Browser Bookmarklet',
    `<div style="display:flex;flex-direction:column;gap:16px">` +
    `<div style="background:var(--s2);border-radius:8px;padding:16px;text-align:center">` +
    `<div style="font-size:32px;margin-bottom:8px">🔖</div>` +
    `<div style="font-size:13px;font-weight:600;margin-bottom:4px">Save to LevelUp in one click</div>` +
    `<div style="font-size:11px;color:var(--t2)">Drag the button below to your browser's bookmarks bar, then click it on any page to instantly save it to your LevelUp bookmarks.</div>` +
    `</div>` +
    `<div style="text-align:center"><a href="${code}" style="display:inline-block;padding:10px 20px;background:var(--ac);color:#fff;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;cursor:grab" onclick="event.preventDefault();toast('Drag this to your bookmarks bar!')">🔖 Save to LevelUp</a></div>` +
    `<div style="font-size:11px;color:var(--t3)"><strong>How to install:</strong><br>1. Show your browser's bookmarks bar (Ctrl+Shift+B or Cmd+Shift+B)<br>2. Drag the button above to the bookmarks bar<br>3. Visit any page and click the bookmarklet to save it instantly</div>` +
    `<div style="font-size:11px;color:var(--t3)">Or copy the code manually:</div>` +
    `<textarea class="inp" style="font-size:11px;font-family:monospace;height:60px" readonly onclick="this.select()">${safeCode}</textarea>` +
    `</div>`,
    [{label:'Close',cls:'btn-s',action:'closeModal()'}]
  );
}

function showAddBookmark(){
  openBkModal('🔖 Add Bookmark',
    '<div style="display:flex;flex-direction:column;gap:12px">' +
    '<div class="field"><label>URL *</label><input class="inp" id="bk-url" placeholder="https://example.com"></div>' +
    '<div class="field"><label>Title <span style="color:var(--t3);font-weight:400">(optional — auto-fetched from page)</span></label><input class="inp" id="bk-title" placeholder="Leave blank to auto-detect"></div>' +
    '<div class="field"><label style="display:flex;align-items:center;justify-content:space-between">Description<button type="button" id="btn-bk-desc-ai" class="btn btn-s" style="height:22px;font-size:11px;padding:0 8px;color:var(--ac)" onclick="doSuggestBookmarkDescription(\'bk-description\',\'btn-bk-desc-ai\')">✨ AI Describe</button></label><textarea class="inp" id="bk-description" placeholder="Short summary — click ✨ AI Describe to generate" style="min-height:60px"></textarea></div>' +
    '<div class="field"><label style="display:flex;align-items:center;justify-content:space-between">Tags <span style="color:var(--t3);font-weight:400">(comma-separated)</span><button type="button" id="btn-bk-tags-ai" class="btn btn-s" style="height:22px;font-size:11px;padding:0 8px;color:var(--purp)" onclick="doSuggestBookmarkTags(\'bk-tags\',\'btn-bk-tags-ai\')">✨ AI Suggest</button></label><input class="inp" id="bk-tags" placeholder="dev, react, tutorial"></div>' +
    '<div class="field"><label>Notes</label><textarea class="inp" id="bk-notes" placeholder="Your private notes about this page..." style="min-height:60px"></textarea></div>' +
    '</div>',
    [{label:'Cancel',cls:'btn-s',action:'closeModal()'},{label:'💾 Save Bookmark',cls:'btn-p',action:'doAddBookmark()'}]
  );
}

async function doSuggestBookmarkTags(inputId,btnId){
  inputId=inputId||'bk-tags';
  let url=document.getElementById('bk-url')?.value?.trim();
  if(!url){const bid=document.getElementById(inputId)?.dataset?.bid;if(bid){const b=_bkData.find(x=>x.id===Number(bid));url=b?.url;}}
  if(!url){toast('Enter a URL first');return;}
  try{new URL(url);}catch{toast('Please enter a valid URL first');return;}
  const title=(document.getElementById('bk-title')?.value||document.getElementById('bk-edit-title')?.value||'').trim()||undefined;
  const btn=btnId?document.getElementById(btnId):document.querySelector('#modal-body button[onclick="doSuggestBookmarkTags()"]');
  const orig=btn?btn.textContent:'';
  if(btn){btn.textContent='\u23f3 Thinking...';btn.disabled=true;}
  try{
    const {provider,apiKey}=_getAIConfig();
    const res=await _trpc('bookmarks.suggestTags',{url,title,provider,apiKey},'mutation');
    if(res.tags&&res.tags.length){
      const tagsInput=document.getElementById(inputId);
      if(tagsInput)tagsInput.value=res.tags.join(', ');
      toast('\u2728 AI suggested '+res.tags.length+' tags!');
    }else{
      toast('No tags suggested — try adding a title first');
    }
  }catch(e){
    toast('AI tagging failed: '+(e.message||e));
  }finally{
    if(btn){btn.textContent=orig||'\u2728 AI Suggest';btn.disabled=false;}
  }
}

async function doSuggestBookmarkDescription(inputId,btnId){
  inputId=inputId||'bk-description';
  let url=document.getElementById('bk-url')?.value?.trim();
  if(!url){const bid=document.getElementById(inputId)?.dataset?.bid;if(bid){const b=_bkData.find(x=>x.id===Number(bid));url=b?.url;}}
  if(!url){toast('Enter a URL first');return;}
  try{new URL(url);}catch{toast('Please enter a valid URL first');return;}
  const title=(document.getElementById('bk-title')?.value||document.getElementById('bk-edit-title')?.value||'').trim()||undefined;
  const btn=btnId?document.getElementById(btnId):null;
  const orig=btn?btn.textContent:'';
  if(btn){btn.textContent='\u23f3 Thinking...';btn.disabled=true;}
  try{
    const {provider,apiKey}=_getAIConfig();
    const res=await _trpc('bookmarks.suggestDescription',{url,title,provider,apiKey},'mutation');
    if(res&&res.description){
      const el=document.getElementById(inputId);
      if(el)el.value=res.description;
      toast('\u2728 AI description generated');
    }else{
      toast('No description generated \u2014 try filling Title first');
    }
  }catch(e){
    toast('AI describe failed: '+(e.message||e));
  }finally{
    if(btn){btn.textContent=orig||'\u2728 AI Describe';btn.disabled=false;}
  }
}

async function doAddBookmark(){
  const url=$('bk-url')?.value?.trim();
  if(!url){toast('Please enter a URL');return;}
  try{
    new URL(url);
  }catch{toast('Please enter a valid URL');return;}
  const title=$('bk-title')?.value?.trim()||undefined;
  const tagsRaw=$('bk-tags')?.value?.trim();
  const tags=tagsRaw?tagsRaw.split(',').map(t=>t.trim()).filter(Boolean):undefined;
  const description=$('bk-description')?.value?.trim()||undefined;
  const notes=$('bk-notes')?.value?.trim()||undefined;
  try{
    toast('Saving bookmark...');
    await _trpc('bookmarks.create',{url,title,description,tags,notes},'mutation');
    closeModal();
    toast('✅ Bookmark saved!');
    renderBookmarks();
  }catch(e){
    toast('Failed to save bookmark: '+(e.message||e));
  }
}

async function toggleBookmarkFav(id,current){
  try{
    await _trpc('bookmarks.update',{id,isFavorite:!current},'mutate');
    renderBookmarks();
  }catch(e){toast('Error: '+e.message);}
}

async function toggleBookmarkRead(id,current){
  try{
    await _trpc('bookmarks.update',{id,isRead:!current},'mutate');
    renderBookmarks();
  }catch(e){toast('Error: '+e.message);}
}

function editBookmark(id){
  const b=_bkData.find(x=>x.id===id);
  if(!b)return;
  const tags=b.tags?JSON.parse(b.tags):[];
  openBkModal('✏️ Edit Bookmark',
    '<div style="display:flex;flex-direction:column;gap:12px">' +
    `<div class="field"><label>URL</label><input class="inp" value="${esc(b.url)}" disabled style="opacity:.6"></div>` +
    `<div class="field"><label>Title</label><input class="inp" id="bk-edit-title" value="${esc(b.title||'')}"></div>` +
    `<div class="field"><label style="display:flex;align-items:center;justify-content:space-between">Description<button type="button" id="btn-bk-edit-desc-ai" class="btn btn-s" style="height:22px;font-size:11px;padding:0 8px;color:var(--ac)" onclick="doSuggestBookmarkDescription('bk-edit-desc','btn-bk-edit-desc-ai')">✨ AI Describe</button></label><textarea class="inp" id="bk-edit-desc" data-bid="${id}" style="min-height:60px">${esc(b.description||'')}</textarea></div>` +
    `<div class="field"><label style="display:flex;align-items:center;justify-content:space-between">Tags <span style="color:var(--t3);font-weight:400">(comma-separated)</span><button type="button" id="btn-bk-edit-tags-ai" class="btn btn-s" style="height:22px;font-size:11px;padding:0 8px;color:var(--purp)" onclick="doSuggestBookmarkTags('bk-edit-tags','btn-bk-edit-tags-ai')">✨ AI Suggest</button></label><input class="inp" id="bk-edit-tags" data-bid="${id}" value="${esc(tags.join(', '))}"></div>` +
    `<div class="field"><label>Notes</label><textarea class="inp" id="bk-edit-notes" style="min-height:60px">${esc(b.notes||'')}</textarea></div>` +
    '</div>',
    [{label:'Cancel',cls:'btn-s',action:'closeModal()'},{label:'💾 Save Changes',cls:'btn-p',action:`doEditBookmark(${id})`}]
  );
}

async function doEditBookmark(id){
  const title=$('bk-edit-title')?.value?.trim();
  const description=$('bk-edit-desc')?.value?.trim();
  const tagsRaw=$('bk-edit-tags')?.value?.trim();
  const tags=tagsRaw?tagsRaw.split(',').map(t=>t.trim()).filter(Boolean):[];
  const notes=$('bk-edit-notes')?.value?.trim();
  try{
    await _trpc('bookmarks.update',{id,title,description,tags,notes},'mutate');
    closeModal();
    toast('✅ Bookmark updated!');
    renderBookmarks();
  }catch(e){toast('Error: '+e.message);}
}

async function deleteBookmark(id){
  if(!confirm('Delete this bookmark?'))return;
  try{
    await _trpc('bookmarks.delete',{id},'mutate');
    toast('Bookmark deleted');
    renderBookmarks();
  }catch(e){toast('Error: '+e.message);}
}

// ====== BOOKMARK COLLECTIONS ======

async function loadCollectionView(collectionId){
  _bkLoading=true;
  paintBookmarks();
  try{
    const items=await _trpc('bookmarks.collections.getBookmarks',{collectionId},'query');
    _bkData=items||[];
    _bkTotal=_bkData.length;
  }catch(e){console.error('Failed to load collection',e);_bkData=[];_bkTotal=0;}
  _bkLoading=false;
  paintBookmarks();
}

function showCreateCollection(){
  openBkModal('📁 New Collection',
    '<div style="display:flex;flex-direction:column;gap:12px">' +
    '<div class="field"><label>Name *</label><input class="inp" id="col-name" placeholder="e.g. Research, Recipes, Dev Tools"></div>' +
    '<div class="field"><label>Description</label><input class="inp" id="col-desc" placeholder="Optional description"></div>' +
    '<div style="display:flex;gap:12px">' +
    '<div class="field" style="flex:1"><label>Icon (emoji)</label><input class="inp" id="col-icon" value="📁" maxlength="4" style="font-size:20px;text-align:center"></div>' +
    '<div class="field" style="flex:1"><label>Color</label><input type="color" id="col-color" value="#3B82F6" style="width:100%;height:36px;border:none;border-radius:6px;cursor:pointer"></div>' +
    '</div>' +
    '</div>',
    [{label:'Cancel',cls:'btn-s',action:'closeModal()'},{label:'Create Collection',cls:'btn-p',action:'doCreateCollection()'}]
  );
}

async function doCreateCollection(){
  const name=document.getElementById('col-name')?.value?.trim();
  if(!name){toast('Please enter a collection name');return;}
  const description=document.getElementById('col-desc')?.value?.trim()||undefined;
  const icon=document.getElementById('col-icon')?.value?.trim()||'📁';
  const color=document.getElementById('col-color')?.value||'#3B82F6';
  try{
    await _trpc('bookmarks.collections.create',{name,description,icon,color},'mutate');
    closeModal();
    toast('Collection created!');
    renderBookmarks();
  }catch(e){toast('Error: '+e.message);}
}

function editCollection(id){
  const c=_bkCollections.find(x=>x.id===id);
  if(!c)return;
  openBkModal('✏️ Edit Collection',
    '<div style="display:flex;flex-direction:column;gap:12px">' +
    `<div class="field"><label>Name *</label><input class="inp" id="col-edit-name" value="${esc(c.name)}"></div>` +
    `<div class="field"><label>Description</label><input class="inp" id="col-edit-desc" value="${esc(c.description||'')}"></div>` +
    '<div style="display:flex;gap:12px">' +
    `<div class="field" style="flex:1"><label>Icon</label><input class="inp" id="col-edit-icon" value="${esc(c.icon||'📁')}" maxlength="4" style="font-size:20px;text-align:center"></div>` +
    `<div class="field" style="flex:1"><label>Color</label><input type="color" id="col-edit-color" value="${esc(c.color||'#3B82F6')}" style="width:100%;height:36px;border:none;border-radius:6px;cursor:pointer"></div>` +
    '</div>' +
    '</div>',
    [{label:'Cancel',cls:'btn-s',action:'closeModal()'},{label:'Save Changes',cls:'btn-p',action:`doEditCollection(${id})`}]
  );
}

async function doEditCollection(id){
  const name=document.getElementById('col-edit-name')?.value?.trim();
  if(!name){toast('Name is required');return;}
  const description=document.getElementById('col-edit-desc')?.value?.trim()||undefined;
  const icon=document.getElementById('col-edit-icon')?.value?.trim()||'📁';
  const color=document.getElementById('col-edit-color')?.value||'#3B82F6';
  try{
    await _trpc('bookmarks.collections.update',{id,name,description,icon,color},'mutate');
    closeModal();
    toast('Collection updated!');
    renderBookmarks();
  }catch(e){toast('Error: '+e.message);}
}

async function deleteCollection(id){
  const c=_bkCollections.find(x=>x.id===id);
  if(!confirm(`Delete collection "${c?.name||'this collection'}"? Bookmarks will not be deleted.`))return;
  try{
    await _trpc('bookmarks.collections.delete',{id},'mutate');
    if(_bkCollFilter===id){_bkCollFilter=null;}
    toast('Collection deleted');
    renderBookmarks();
  }catch(e){toast('Error: '+e.message);}
}

function showAddToCollection(bookmarkId){
  const b=_bkData.find(x=>x.id===bookmarkId);
  const title=b?b.title||b.url:'this bookmark';
  const collItems=_bkCollections.map(c=>`
    <div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid var(--bd1);cursor:pointer" onclick="doAddToCollection(${c.id},${bookmarkId},this)">
      <span style="font-size:16px">${esc(c.icon||'📁')}</span>
      <div style="flex:1">
        <div style="font-size:12px;font-weight:500">${esc(c.name)}</div>
        <div style="font-size:11px;color:var(--t3)">${c.bookmarkCount||0} bookmarks</div>
      </div>
      <button class="btn btn-s" style="font-size:11px;padding:2px 8px">Add</button>
    </div>`).join('');
  openBkModal('📁 Add to Collection',
    `<div style="font-size:12px;color:var(--t2);margin-bottom:12px">Adding: <strong>${esc(title.slice(0,60))}</strong></div>` +
    (collItems||'<div style="text-align:center;padding:20px;color:var(--t3)">No collections yet. <a href="#" onclick="closeModal();showCreateCollection()">Create one first</a>.</div>'),
    [{label:'Cancel',cls:'btn-s',action:'closeModal()'}]
  );
}

async function doAddToCollection(collectionId,bookmarkId,rowEl){
  try{
    await _trpc('bookmarks.collections.addBookmark',{collectionId,bookmarkId},'mutate');
    if(rowEl)rowEl.style.background='var(--oks)';
    toast('Added to collection!');
    setTimeout(closeModal,600);
    loadCollections().then(()=>paintBookmarks());
  }catch(e){toast('Error: '+e.message);}
}

async function removeFromCollection(collectionId,bookmarkId){
  const b=_bkData.find(x=>x.id===bookmarkId);
  const title=b?b.title||b.url:'this bookmark';
  if(!confirm(`Remove "${title.slice(0,60)}" from this collection?`))return;
  try{
    await _trpc('bookmarks.collections.removeBookmark',{collectionId,bookmarkId},'mutate');
    toast('Removed from collection');
    loadCollections();
    loadCollectionView(collectionId);
  }catch(e){toast('Error: '+e.message);}
}

// ====== BULK MULTI-SELECT ======
function toggleBkMultiSelect(){
  _bkMultiSelect=!_bkMultiSelect;
  if(!_bkMultiSelect)_bkSelected.clear();
  paintBookmarks();
}
function toggleBkSelect(id){
  if(_bkSelected.has(id))_bkSelected.delete(id);
  else _bkSelected.add(id);
  paintBookmarks();
}
function bulkAddToCollection(){
  if(!_bkSelected.size)return;
  const ids=[..._bkSelected];
  const colOpts=_bkCollections.map(c=>`<div class="lr" style="border-radius:6px;padding:6px 8px;cursor:pointer" onclick="doBulkAddToCollection(${c.id},[${ids}],this)"><span style="font-size:14px">${esc(c.icon||'📁')}</span><span style="font-size:12px">${esc(c.name)}</span></div>`).join('');
  openBkModal('📁 Add '+ids.length+' Bookmarks to Collection',
    colOpts||'<div style="color:var(--t3);font-size:12px">No collections yet. Create one first.</div>',
    [{label:'Cancel',cls:'btn-s',action:'closeModal()'}]
  );
}
async function doBulkAddToCollection(collectionId,bookmarkIds,rowEl){
  try{
    await Promise.all(bookmarkIds.map(id=>_trpc('bookmarks.collections.addBookmark',{collectionId,bookmarkId:id},'mutate')));
    if(rowEl)rowEl.style.background='var(--oks)';
    toast(bookmarkIds.length+' bookmarks added to collection!');
    setTimeout(closeModal,600);
    loadCollections().then(()=>paintBookmarks());
  }catch(e){toast('Error: '+e.message);}
}
function bulkShareBookmarks(){
  if(!_bkSelected.size)return;
  const ids=[..._bkSelected];
  openBkModal('🔗 Share '+ids.length+' Bookmarks',
    '<div style="display:flex;flex-direction:column;gap:12px">' +
    '<div class="field"><label>Share Title</label><input class="inp" id="sh-title" placeholder="e.g. Useful React resources"></div>' +
    '<div class="field"><label>Description (optional)</label><textarea class="inp" id="sh-desc" placeholder="What is this about?" style="min-height:60px"></textarea></div>' +
    '<div class="field"><label>Expires in</label><select class="inp" id="sh-expires"><option value="">Never</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></div>' +
    '</div>',
    [{label:'Cancel',cls:'btn-s',action:'closeModal()'},{label:'Create Share Link',cls:'btn-p',action:`doShareBookmarks([${ids}])`}]
  );
}

// ====== BOOKMARK SHARES ======

function shareBookmark(bookmarkId){
  const b=_bkData.find(x=>x.id===bookmarkId);
  const title=b?b.title||b.url:'Shared Bookmark';
  openBkModal('🔗 Share Bookmark',
    '<div style="display:flex;flex-direction:column;gap:12px">' +
    `<div style="font-size:12px;color:var(--t2)">Creating a public link for: <strong>${esc(title.slice(0,60))}</strong></div>` +
    '<div class="field"><label>Share Title (optional)</label><input class="inp" id="sh-title" placeholder="e.g. Useful React resources"></div>' +
    '<div class="field"><label>Description (optional)</label><textarea class="inp" id="sh-desc" placeholder="What is this about?" style="min-height:60px"></textarea></div>' +
    '<div class="field"><label>Expires in (optional)</label><select class="inp" id="sh-expires"><option value="">Never</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></div>' +
    '</div>',
    [{label:'Cancel',cls:'btn-s',action:'closeModal()'},{label:'Create Share Link',cls:'btn-p',action:`doShareBookmarks([${bookmarkId}])`}]
  );
}

function shareCollection(collectionId){
  const c=_bkCollections.find(x=>x.id===collectionId);
  openBkModal('🔗 Share Collection',
    '<div style="display:flex;flex-direction:column;gap:12px">' +
    `<div style="font-size:12px;color:var(--t2)">Sharing collection: <strong>${esc(c?.name||'Collection')}</strong> (${c?.bookmarkCount||0} bookmarks)</div>` +
    '<div class="field"><label>Share Title (optional)</label><input class="inp" id="sh-title" placeholder="e.g. My dev bookmarks"></div>' +
    '<div class="field"><label>Description (optional)</label><textarea class="inp" id="sh-desc" placeholder="What is this about?" style="min-height:60px"></textarea></div>' +
    '<div class="field"><label>Expires in (optional)</label><select class="inp" id="sh-expires"><option value="">Never</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></div>' +
    '</div>',
    [{label:'Cancel',cls:'btn-s',action:'closeModal()'},{label:'Create Share Link',cls:'btn-p',action:`doShareCollection(${collectionId})`}]
  );
}

async function doShareBookmarks(bookmarkIds){
  const title=document.getElementById('sh-title')?.value?.trim()||undefined;
  const description=document.getElementById('sh-desc')?.value?.trim()||undefined;
  const expiresRaw=document.getElementById('sh-expires')?.value;
  const expiresInDays=expiresRaw?parseInt(expiresRaw):undefined;
  try{
    const share=await _trpc('bookmarks.shares.create',{title,description,shareType:'selection',bookmarkIds,expiresInDays},'mutate');
    closeModal();
    const url=window.location.origin+'/share/'+share.token;
    showShareSuccess(url);
    loadShares().then(()=>paintBookmarks());
  }catch(e){toast('Error: '+e.message);}
}

async function doShareCollection(collectionId){
  const title=document.getElementById('sh-title')?.value?.trim()||undefined;
  const description=document.getElementById('sh-desc')?.value?.trim()||undefined;
  const expiresRaw=document.getElementById('sh-expires')?.value;
  const expiresInDays=expiresRaw?parseInt(expiresRaw):undefined;
  try{
    const share=await _trpc('bookmarks.shares.create',{title,description,shareType:'collection',collectionId,expiresInDays},'mutate');
    closeModal();
    const url=window.location.origin+'/share/'+share.token;
    showShareSuccess(url);
    loadShares().then(()=>paintBookmarks());
  }catch(e){toast('Error: '+e.message);}
}

function showShareSuccess(url){
  openBkModal('✅ Share Link Created',
    `<div style="display:flex;flex-direction:column;gap:12px">` +
    `<div style="background:var(--s2);border-radius:8px;padding:12px;display:flex;align-items:center;gap:8px">` +
    `<input class="inp" id="share-url-input" value="${esc(url)}" readonly onclick="this.select()" style="flex:1;font-size:11px">` +
    `<button class="btn btn-p" style="flex-shrink:0" onclick="copyShareLink(null,'${esc(url)}')">Copy</button>` +
    `</div>` +
    `<div style="font-size:11px;color:var(--t3)">Anyone with this link can view these bookmarks without logging in.</div>` +
    `</div>`,
    [{label:'Close',cls:'btn-s',action:'closeModal()'}]
  );
}

function copyShareLink(token,directUrl){
  const url=directUrl||(window.location.origin+'/share/'+token);
  navigator.clipboard.writeText(url).then(()=>toast('Link copied to clipboard!')).catch(()=>{
    const el=document.createElement('textarea');
    el.value=url;document.body.appendChild(el);el.select();document.execCommand('copy');document.body.removeChild(el);
    toast('Link copied!');
  });
}

async function deleteShare(id){
  if(!confirm('Delete this share link? Anyone with the link will no longer be able to access it.'))return;
  try{
    await _trpc('bookmarks.shares.delete',{id},'mutate');
    toast('Share link deleted');
    loadShares().then(()=>paintBookmarks());
  }catch(e){toast('Error: '+e.message);}
}

function showShareManager(){
  const rows=_bkShares.map(s=>{
    const url=window.location.origin+'/share/'+s.token;
    const exp=s.expiresAt?new Date(s.expiresAt).toLocaleDateString():'Never';
    return `<div style="padding:8px 0;border-bottom:1px solid var(--bd1)">
      <div style="display:flex;align-items:flex-start;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:500">${esc(s.title||'Untitled')}</div>
          <div style="font-size:11px;color:var(--t3)">${s.shareType==='collection'?'Collection':'Selection'} &bull; ${s.viewCount||0} views &bull; Expires: ${exp}</div>
          <div style="font-size:11px;color:var(--ac);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(url)}</div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button class="btn btn-s" style="height:24px;font-size:11px" onclick="copyShareLink(null,'${esc(url)}')">Copy</button>
          <button class="btn btn-s" style="height:24px;font-size:11px;color:var(--red)" onclick="deleteShare(${s.id})">Delete</button>
        </div>
      </div>
    </div>`;
  }).join('');
  openBkModal('🔗 Shared Links',
    _bkShares.length===0
      ?'<div style="text-align:center;padding:30px;color:var(--t3)">No shared links yet. Use the 🔗 button on any bookmark or collection to create one.</div>'
      :rows,
    [{label:'Close',cls:'btn-s',action:'closeModal()'}]
  );
}

// ====== CONTACTS & CLODURA ENRICHMENT ======
let _contactSearch='',_contactTagFilter='',_contactSelected=new Set();
function renderContacts(){
  const contacts=D.contacts||[];
  const apiKey=D.creds.clo_key||'';
  // Filter
  const q=_contactSearch.toLowerCase();
  const filtered=contacts.filter(c=>{
    const matchQ=!q||(c.name+c.company+c.email+c.title+c.location+(c.tags||[]).join(' ')).toLowerCase().includes(q);
    const matchTag=!_contactTagFilter||(c.tags||[]).includes(_contactTagFilter);
    return matchQ&&matchTag;
  });
  // All tags
  const allTags=[...new Set(contacts.flatMap(c=>c.tags||[]))].sort();
  const enrichedCount=contacts.filter(c=>c.enriched).length;
  const hasKey=!!apiKey;
  $('contacts-main').innerHTML=`
  <div class="pg-h" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">
    <div style="flex:1;min-width:0">
      <h1 style="font-size:22px;font-weight:700">👤 Contacts</h1>
      <p style="font-size:12px;color:var(--t2)">${contacts.length} contacts · ${enrichedCount} enriched via Clodura</p>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn btn-s" style="height:30px;font-size:11px" onclick="openAddContactModal()">+ Add Contact</button>
      <button class="btn btn-s" style="height:30px;font-size:11px" onclick="importContactsCSV()">📥 Import CSV</button>
      <button class="btn btn-s" style="height:30px;font-size:11px;color:#0078d4" onclick="openContactsImportPicker('microsoft')" title="Pick which Microsoft 365 contacts to import">📥 Import from O365</button>
      <button class="btn btn-s" style="height:30px;font-size:11px" onclick="exportContactsCSV()">📤 Export CSV</button>
      <button class="btn btn-s" style="height:30px;font-size:11px;color:var(--ac)" onclick="aiContactHealth()" title="AI: Relationship health scores">❤ Health</button>
      <button class="btn btn-s" style="height:30px;font-size:11px;color:var(--purp)" onclick="aiContactDuplicates()" title="AI: Detect duplicate contacts">🔍 Dupes</button>
      <button class="btn btn-p" style="height:30px;font-size:11px;${!hasKey?'opacity:.5;cursor:not-allowed':''}"
        onclick="${hasKey?'enrichAllContacts()':"toast('⚠️ Add your Clodura API key in Settings → Integrations first')"}">
        🔍 Enrich All via Clodura
      </button>
    </div>
  </div>
  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
    <input class="inp" style="flex:1;min-width:180px;max-width:320px;height:30px;font-size:11px" placeholder="Search contacts…" value="${esc(_contactSearch)}" oninput="_contactSearch=this.value;renderContacts()">
    <select class="inp" style="height:30px;font-size:11px;max-width:160px" onchange="_contactTagFilter=this.value;renderContacts()">
      <option value="">All tags</option>
      ${allTags.map(t=>`<option value="${esc(t)}" ${_contactTagFilter===t?'selected':''}>${esc(t)}</option>`).join('')}
    </select>
    <span style="font-size:11px;color:var(--t3)">${filtered.length} result${filtered.length!==1?'s':''}</span>
  </div>
  ${!hasKey?`<div style="background:var(--warn)1a;border:1px solid var(--warn);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:11px;color:var(--t2);display:flex;align-items:center;gap:10px">
    <span style="font-size:18px">🔑</span>
    <div><strong>Clodura API key not configured.</strong> Add it in <span class="cd-a" onclick="nav('settings');setTimeout(()=>{document.querySelectorAll('.sp').forEach(x=>x.style.display='none');document.getElementById('sp-4').style.display='';document.querySelectorAll('[data-sb] .si').forEach(x=>{x.classList.remove('on');if(x.dataset.n==='settings')x.classList.add('on')})},100)">Settings → Integrations</span> to enable enrichment.</div>
  </div>`:''}
  <div style="overflow-x:auto">
  <table style="width:100%;border-collapse:collapse;font-size:11px">
    <thead><tr style="border-bottom:2px solid var(--bd2);text-align:left">
      <th style="padding:6px 8px;font-weight:600;color:var(--t2);width:28px"><input type="checkbox" id="contact-check-all" onchange="toggleSelectAllContacts(this.checked)" style="cursor:pointer"></th>
      <th style="padding:6px 8px;font-weight:600;color:var(--t2)">Name</th>
      <th style="padding:6px 8px;font-weight:600;color:var(--t2)">Title</th>
      <th style="padding:6px 8px;font-weight:600;color:var(--t2)">Company</th>
      <th style="padding:6px 8px;font-weight:600;color:var(--t2)">Email</th>
      <th style="padding:6px 8px;font-weight:600;color:var(--t2)">Phone</th>
      <th style="padding:6px 8px;font-weight:600;color:var(--t2)">Tags</th>
      <th style="padding:6px 8px;font-weight:600;color:var(--t2)">Status</th>
      <th style="padding:6px 8px;font-weight:600;color:var(--t2)">Actions</th>
    </tr></thead>
    <tbody id="contacts-tbody">
    ${filtered.map(c=>contactRow(c,hasKey)).join('')}
    ${filtered.length===0?`<tr><td colspan="9" style="padding:8px">${renderEmptyState({icon:'👥',title:contacts.length?'No contacts match this filter':'No contacts yet',hint:contacts.length?'Clear the search or tag filter to see everyone.':'Add a contact manually, import a CSV, or pull them from Office 365.',ctaLabel:contacts.length?'':'+ Add your first contact',ctaFn:'openAddContactModal()'})}</td></tr>`:''}
    </tbody>
  </table>
  </div>
  `;
  // Bulk action bar
  const bar=document.createElement('div');
  bar.id='contact-bulk-bar';
  bar.style.cssText='display:none;position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--s1);border:1px solid var(--bd2);border-radius:10px;padding:8px 16px;display:none;gap:10px;align-items:center;box-shadow:0 4px 24px rgba(0,0,0,.4);z-index:100';
  bar.innerHTML=`<span id="contact-bulk-count" style="font-size:11px;color:var(--t2)">0 selected</span>
    <button class="btn btn-p" style="height:26px;font-size:11px" onclick="enrichSelectedContacts()">🔍 Enrich Selected</button>
    <button class="btn btn-d" style="height:26px;font-size:11px" onclick="deleteSelectedContacts()">🗑 Delete</button>
    <button class="btn btn-s" style="height:26px;font-size:11px" onclick="_contactSelected.clear();renderContacts()">✕ Clear</button>`;
  $('contacts-main').appendChild(bar);
  updateContactBulkBar();
  // Rail
  renderContactsRail(contacts);
}
function contactRow(c,hasKey){
  const initials=c.name.split(' ').map(w=>w[0]||'').join('').substring(0,2).toUpperCase();
  const colors=['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#06B6D4'];
  const color=colors[c.id%colors.length];
  const enrichBtnLabel=c.enriched?'✓ Enriched':'🔍 Enrich';
  const enrichBtnStyle=c.enriched?'background:var(--ok)1a;color:var(--ok);border:1px solid var(--ok)':'background:var(--acs);color:var(--ac);border:1px solid var(--ac)';
  return`<tr style="border-bottom:1px solid var(--bd1);cursor:pointer" onclick="openContactDetail(${c.id})" id="contact-row-${c.id}">
    <td style="padding:6px 8px" onclick="event.stopPropagation()"><input type="checkbox" ${_contactSelected.has(c.id)?'checked':''} onchange="toggleContactSelect(${c.id},this.checked)" style="cursor:pointer"></td>
    <td style="padding:6px 8px">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:28px;height:28px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>
        <div><div style="font-weight:500">${esc(c.name)}</div><div style="font-size:11px;color:var(--t3)">${esc(c.location||'')}</div></div>
      </div>
    </td>
    <td style="padding:6px 8px;color:var(--t2)">${esc(c.title||'—')}</td>
    <td style="padding:6px 8px;font-weight:500">${esc(c.company||'—')}</td>
    <td style="padding:6px 8px">${c.email?`<a href="mailto:${esc(c.email)}" onclick="event.stopPropagation()" style="color:var(--ac);text-decoration:none">${esc(c.email)}</a>`:'<span style="color:var(--t3)">—</span>'}</td>
    <td style="padding:6px 8px;color:var(--t2)">${c.phone||'<span style="color:var(--t3)">—</span>'}</td>
    <td style="padding:6px 8px">${(c.tags||[]).slice(0,2).map(t=>`<span style="font-size:11px;padding:1px 5px;border-radius:8px;background:var(--acs);color:var(--ac);margin-right:3px">${esc(t)}</span>`).join('')}${(c.tags||[]).length>2?`<span style="font-size:11px;color:var(--t3)">+${c.tags.length-2}</span>`:''}</td>
    <td style="padding:6px 8px">
      <span id="enrich-status-${c.id}" style="font-size:11px;padding:2px 6px;border-radius:8px;${enrichBtnStyle}">${enrichBtnLabel}</span>
    </td>
    <td style="padding:6px 8px" onclick="event.stopPropagation()">
      <div style="display:flex;gap:4px">
        <button class="btn btn-s" style="height:22px;font-size:11px;padding:0 6px" onclick="openContactDetail(${c.id})" title="View">👁</button>
        <button class="btn btn-s" style="height:22px;font-size:11px;padding:0 6px" onclick="openEditContactModal(${c.id})" title="Edit">✏</button>
        <button class="btn btn-p" style="height:22px;font-size:11px;padding:0 6px;${!hasKey?'opacity:.5;':''}"
          onclick="${hasKey?`enrichContact(${c.id})`:`toast('⚠️ Add Clodura API key in Settings → Integrations')`}"
          title="Enrich via Clodura">🔍</button>
        <button class="btn btn-d" style="height:22px;font-size:11px;padding:0 6px" onclick="deleteContact(${c.id})" title="Delete">🗑</button>
      </div>
    </td>
  </tr>`;
}
function renderContactsRail(contacts){
  const tags=[...new Set(contacts.flatMap(c=>c.tags||[]))].sort();
  const enriched=contacts.filter(c=>c.enriched).length;
  const withEmail=contacts.filter(c=>c.email).length;
  const withPhone=contacts.filter(c=>c.phone).length;
  const withLinkedin=contacts.filter(c=>c.linkedin).length;
  $('contacts-rail').innerHTML=`
    <div style="font-size:12px;font-weight:600;margin-bottom:8px">📊 Stats</div>
    <div class="stat"><div class="stat-n">${contacts.length}</div><div class="stat-l">Total Contacts</div></div>
    <div class="stat"><div class="stat-n" style="color:var(--ok)">${enriched}</div><div class="stat-l">Enriched</div></div>
    <div class="stat"><div class="stat-n">${withEmail}</div><div class="stat-l">With Email</div></div>
    <div class="stat"><div class="stat-n">${withPhone}</div><div class="stat-l">With Phone</div></div>
    <div class="stat"><div class="stat-n">${withLinkedin}</div><div class="stat-l">With LinkedIn</div></div>
    <div style="margin-top:14px;font-size:12px;font-weight:600;margin-bottom:6px">🏷 Tags</div>
    ${tags.map(t=>{
      const count=contacts.filter(c=>(c.tags||[]).includes(t)).length;
      return`<div class="lr" style="padding:3px 0;cursor:pointer" onclick="_contactTagFilter=_contactTagFilter===\'${t}\'?\'\':\'${t}\';renderContacts()">
        <span style="font-size:11px;${_contactTagFilter===t?'color:var(--ac);font-weight:600':''}">${esc(t)}</span>
        <span style="font-size:11px;color:var(--t3);background:var(--s3);padding:1px 5px;border-radius:8px">${count}</span>
      </div>`;
    }).join('')}
    <div style="margin-top:14px">
      <button class="btn btn-p" style="width:100%;height:28px;font-size:11px" onclick="openAddContactModal()">+ Add Contact</button>
    </div>
  `;
}
function toggleContactSelect(id,checked){
  if(checked)_contactSelected.add(id);else _contactSelected.delete(id);
  updateContactBulkBar();
}
function toggleSelectAllContacts(checked){
  const contacts=D.contacts||[];
  const q=_contactSearch.toLowerCase();
  const filtered=contacts.filter(c=>{
    const matchQ=!q||(c.name+c.company+c.email+c.title+c.location+(c.tags||[]).join(' ')).toLowerCase().includes(q);
    const matchTag=!_contactTagFilter||(c.tags||[]).includes(_contactTagFilter);
    return matchQ&&matchTag;
  });
  filtered.forEach(c=>{if(checked)_contactSelected.add(c.id);else _contactSelected.delete(c.id);});
  updateContactBulkBar();
  renderContacts();
}
function updateContactBulkBar(){
  const bar=document.getElementById('contact-bulk-bar');
  if(!bar)return;
  const n=_contactSelected.size;
  bar.style.display=n>0?'flex':'none';
  const cnt=document.getElementById('contact-bulk-count');
  if(cnt)cnt.textContent=n+' selected';
}
function deleteContact(id){
  if(!confirm('Delete this contact?'))return;
  D.contacts=D.contacts.filter(c=>c.id!==id);
  save('contacts');renderContacts();toast('🗑 Contact deleted');
}
function deleteSelectedContacts(){
  if(!_contactSelected.size){toast('No contacts selected');return;}
  if(!confirm(`Delete ${_contactSelected.size} contact(s)?`))return;
  D.contacts=D.contacts.filter(c=>!_contactSelected.has(c.id));
  _contactSelected.clear();save('contacts');renderContacts();toast('🗑 Contacts deleted');
}

// ---- Clodura Enrichment ----
async function enrichContact(id){
  const c=D.contacts.find(x=>x.id===id);
  if(!c)return;
  const apiKey=D.creds.clo_key||'';
  if(!apiKey){toast('⚠️ Add your Clodura API key in Settings → Integrations');return;}
  const statusEl=document.getElementById('enrich-status-'+id);
  if(statusEl){statusEl.textContent='⏳ Enriching…';statusEl.style.color='var(--warn)';}
  toast('🔍 Enriching '+c.name+'…');
  try{
    // Build query params from available contact data
    const params=new URLSearchParams();
    if(c.name){const parts=c.name.trim().split(' ');params.set('first_name',parts[0]||'');params.set('last_name',parts.slice(1).join(' ')||'');}
    if(c.email)params.set('email',c.email);
    if(c.company)params.set('company',c.company);
    if(c.title)params.set('title',c.title);
    if(c.linkedin)params.set('linkedin_url','https://'+c.linkedin.replace(/^https?:\/\//,''));
    const res=await fetch(`https://clodura.dev/api/v1/enrich/search?${params.toString()}`,{
      method:'GET',
      headers:{'x-api-key':apiKey,'Accept':'application/json'}
    });
    if(!res.ok){const err=await res.text();throw new Error(`API error ${res.status}: ${err}`);}
    const data=await res.json();
    // Map response fields to contact
    const person=data.person||data.data||data.result||data;
    if(person&&typeof person==='object'){
      if(person.email&&!c.email)c.email=person.email;
      if(person.phone||person.phone_number)c.phone=person.phone||person.phone_number||c.phone;
      if(person.title||person.job_title)c.title=person.title||person.job_title||c.title;
      if(person.company||person.organization)c.company=person.company||person.organization||c.company;
      if(person.location||person.city)c.location=person.location||(person.city?(person.city+(person.country?', '+person.country:'')):'');
      if(person.linkedin_url||person.linkedin)c.linkedin=(person.linkedin_url||person.linkedin||c.linkedin).replace(/^https?:\/\//,'');
      if(person.twitter)c.twitter=person.twitter;
      if(person.seniority)c.seniority=person.seniority;
      if(person.department)c.department=person.department;
      if(person.company_size)c.companySize=person.company_size;
      if(person.industry)c.industry=person.industry;
      if(person.technologies&&person.technologies.length)c.technologies=person.technologies;
    }
    c.enriched=true;
    c.enrichedAt=new Date().toISOString();
    c.enrichedRaw=person;
    save('contacts');
    renderContacts();
    toast('✅ '+c.name+' enriched successfully!');
  }catch(err){
    console.error('Clodura enrichment error:',err);
    if(statusEl){statusEl.textContent='⚠️ Failed';statusEl.style.color='var(--red)';}
    toast('❌ Enrichment failed: '+err.message);
  }
}
async function enrichAllContacts(){
  const apiKey=D.creds.clo_key||'';
  if(!apiKey){toast('⚠️ Add your Clodura API key in Settings → Integrations');return;}
  const unenriched=(D.contacts||[]).filter(c=>!c.enriched);
  if(!unenriched.length){toast('✅ All contacts already enriched');return;}
  if(!confirm(`Enrich ${unenriched.length} contact(s) via Clodura? This will use API credits.`))return;
  toast('🔍 Enriching '+unenriched.length+' contacts…');
  let done=0,failed=0;
  for(const c of unenriched){
    try{await enrichContact(c.id);done++;}catch(e){failed++;}
    await new Promise(r=>setTimeout(r,400)); // rate limit
  }
  toast(`✅ Enrichment complete: ${done} enriched${failed?' · '+failed+' failed':''}`);
}
async function enrichSelectedContacts(){
  const apiKey=D.creds.clo_key||'';
  if(!apiKey){toast('⚠️ Add your Clodura API key in Settings → Integrations');return;}
  if(!_contactSelected.size){toast('No contacts selected');return;}
  const ids=[..._contactSelected];
  if(!confirm(`Enrich ${ids.length} selected contact(s) via Clodura?`))return;
  toast('🔍 Enriching '+ids.length+' contacts…');
  let done=0,failed=0;
  for(const id of ids){
    try{await enrichContact(id);done++;}catch(e){failed++;}
    await new Promise(r=>setTimeout(r,400));
  }
  _contactSelected.clear();
  toast(`✅ Done: ${done} enriched${failed?' · '+failed+' failed':''}`);
}

// ---- Contact Detail ----
function openContactDetail(id){
  const c=D.contacts.find(x=>x.id===id);
  if(!c)return;
  const initials=c.name.split(' ').map(w=>w[0]||'').join('').substring(0,2).toUpperCase();
  const colors=['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#06B6D4'];
  const color=colors[c.id%colors.length];
  const hasKey=!!D.creds.clo_key;
  const d=document.getElementById('drawer-content');
  const ov=document.getElementById('drawer-ov');
  d.innerHTML=`<h2>👤 ${esc(c.name)} <button class="close" onclick="closeDrawer()">✕</button></h2>
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:12px;background:var(--s2);border-radius:8px">
    <div style="width:52px;height:52px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>
    <div style="flex:1">
      <div style="font-size:16px;font-weight:700">${esc(c.name)}</div>
      <div style="font-size:11px;color:var(--t2)">${esc(c.title||'')}${c.title&&c.company?' · ':''}${esc(c.company||'')}</div>
      <div style="font-size:11px;color:var(--t3);margin-top:2px">${esc(c.location||'')}</div>
    </div>
    ${c.enriched?`<span style="font-size:11px;padding:2px 7px;border-radius:8px;background:var(--ok)1a;color:var(--ok);border:1px solid var(--ok)">✓ Enriched</span>`:''}
  </div>
  <div style="display:grid;gap:6px;margin-bottom:14px">
    ${c.email?`<div class="lr" style="padding:5px 0"><span style="font-size:11px;color:var(--t3);width:70px;flex-shrink:0">Email</span><a href="mailto:${esc(c.email)}" style="color:var(--ac);font-size:11px;text-decoration:none">${esc(c.email)}</a></div>`:''}
    ${c.phone?`<div class="lr" style="padding:5px 0"><span style="font-size:11px;color:var(--t3);width:70px;flex-shrink:0">Phone</span><span style="font-size:11px">${esc(c.phone)}</span></div>`:''}
    ${c.linkedin?`<div class="lr" style="padding:5px 0"><span style="font-size:11px;color:var(--t3);width:70px;flex-shrink:0">LinkedIn</span><a href="https://${esc(c.linkedin)}" target="_blank" style="color:var(--ac);font-size:11px;text-decoration:none">${esc(c.linkedin)}</a></div>`:''}
    ${c.twitter?`<div class="lr" style="padding:5px 0"><span style="font-size:11px;color:var(--t3);width:70px;flex-shrink:0">Twitter</span><span style="font-size:11px">@${esc(c.twitter)}</span></div>`:''}
    ${c.department?`<div class="lr" style="padding:5px 0"><span style="font-size:11px;color:var(--t3);width:70px;flex-shrink:0">Dept</span><span style="font-size:11px">${esc(c.department)}</span></div>`:''}
    ${c.seniority?`<div class="lr" style="padding:5px 0"><span style="font-size:11px;color:var(--t3);width:70px;flex-shrink:0">Seniority</span><span style="font-size:11px">${esc(c.seniority)}</span></div>`:''}
    ${c.industry?`<div class="lr" style="padding:5px 0"><span style="font-size:11px;color:var(--t3);width:70px;flex-shrink:0">Industry</span><span style="font-size:11px">${esc(c.industry)}</span></div>`:''}
    ${c.companySize?`<div class="lr" style="padding:5px 0"><span style="font-size:11px;color:var(--t3);width:70px;flex-shrink:0">Co. Size</span><span style="font-size:11px">${esc(c.companySize)}</span></div>`:''}
    ${c.technologies&&c.technologies.length?`<div class="lr" style="padding:5px 0;align-items:flex-start"><span style="font-size:11px;color:var(--t3);width:70px;flex-shrink:0">Tech Stack</span><div style="display:flex;flex-wrap:wrap;gap:3px">${c.technologies.slice(0,8).map(t=>`<span style="font-size:11px;padding:1px 5px;border-radius:8px;background:var(--s3);color:var(--t2)">${esc(t)}</span>`).join('')}</div></div>`:''}
  </div>
  ${(c.tags||[]).length?`<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:600;color:var(--t3);margin-bottom:5px">TAGS</div><div style="display:flex;flex-wrap:wrap;gap:4px">${c.tags.map(t=>`<span style="font-size:11px;padding:2px 8px;border-radius:8px;background:var(--acs);color:var(--ac)">${esc(t)}</span>`).join('')}</div></div>`:''}
  ${c.notes?`<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:600;color:var(--t3);margin-bottom:5px">NOTES</div><div style="font-size:11px;color:var(--t2);line-height:1.6;background:var(--s2);padding:8px 10px;border-radius:6px">${esc(c.notes)}</div></div>`:''}
  ${c.enrichedAt?`<div style="font-size:11px;color:var(--t3);margin-bottom:10px">Last enriched: ${new Date(c.enrichedAt).toLocaleString()}</div>`:''}  ${(()=>{
    const slug='contact:'+c.name.toLowerCase().replace(/\s+/g,'-');
    const nameLC=c.name.toLowerCase();
    const linked=D.tasks.filter(t=>{
      const tagMatch=(t.tags||[]).some(tg=>tg===slug||tg.toLowerCase()===nameLC);
      const titleMatch=(t.title||'').toLowerCase().includes(nameLC);
      return tagMatch||titleMatch;
    }).sort((a,b)=>{
      // Open tasks first, then by due date
      const aD=a.status==='Done'?1:0;
      const bD=b.status==='Done'?1:0;
      if(aD!==bD)return aD-bD;
      return (a.due||'9999')>(b.due||'9999')?1:-1;
    });
    if(!linked.length)return `<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;color:var(--t3);margin-bottom:6px;letter-spacing:.05em">ACTIVITY</div><div style="font-size:11px;color:var(--t3);padding:8px 10px;background:var(--s2);border-radius:6px">No tasks linked yet — click 📋 Create Task to add one.</div></div>`;
    const priColor={High:'var(--red)',Medium:'var(--warn,#f59e0b)',Low:'var(--ok)'};
    const rows=linked.map(t=>{
      const done=t.status==='Done';
      const pri=t.priority||'Medium';
      const dueStr=t.due?new Date(t.due+'T00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'No due date';
      const overdue=!done&&t.due&&t.due<new Date().toISOString().split('T')[0];
      return `<div style="display:flex;align-items:flex-start;gap:8px;padding:7px 8px;border-radius:6px;background:var(--s2);margin-bottom:4px;${done?'opacity:.55':''}">` +
        `<button onclick="toggleTask(${t.id});openContactDetail(${c.id})" title="${done?'Mark open':'Mark done'}" style="flex-shrink:0;margin-top:1px;width:16px;height:16px;border-radius:50%;border:2px solid ${done?'var(--ok)':'var(--bd2)'};background:${done?'var(--ok)':'transparent'};cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff">${done?'✓':''}</button>` +
        `<div style="flex:1;min-width:0">` +
          `<div style="font-size:11px;font-weight:600;${done?'text-decoration:line-through;color:var(--t3)':''};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</div>` +
          `<div style="display:flex;gap:6px;align-items:center;margin-top:2px;flex-wrap:wrap">` +
            `<span style="font-size:11px;color:${priColor[pri]||'var(--t3)'}">${pri}</span>` +
            `<span style="font-size:11px;color:${overdue?'var(--red)':'var(--t3)'}">${overdue?'⚠ Overdue · ':''}${dueStr}</span>` +
            `<span style="font-size:11px;padding:1px 5px;border-radius:8px;background:var(--s3);color:var(--t2)">${esc(t.status)}</span>` +
          `</div>` +
        `</div>` +
      `</div>`;
    }).join('');
    const openCount=linked.filter(t=>t.status!=='Done').length;
    return `<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;color:var(--t3);margin-bottom:6px;letter-spacing:.05em">ACTIVITY <span style="font-weight:400;color:var(--t3)">(${linked.length} task${linked.length!==1?'s':''}, ${openCount} open)</span></div>${rows}</div>`;
  })()}  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
    <button class="btn btn-p" style="height:28px;font-size:11px" onclick="createTaskFromContact(${c.id})">📋 Create Task</button>
    <button class="btn btn-p" style="height:28px;font-size:11px" onclick="openEditContactModal(${c.id})">✏ Edit</button>
    <button class="btn btn-p" style="height:28px;font-size:11px;${!hasKey?'opacity:.5;':''}"
      onclick="${hasKey?`closeDrawer();enrichContact(${c.id})`:`toast('⚠️ Add Clodura API key in Settings → Integrations')`}">
      🔍 Enrich via Clodura
    </button>
    <button class="btn btn-s" style="height:28px;font-size:11px;color:var(--grn)" onclick="aiContactConversation(${c.id})">💬 Starters</button>
    <button class="btn btn-s" style="height:28px;font-size:11px" onclick="closeDrawer()">Close</button>
    <button class="btn btn-d" style="height:28px;font-size:11px" onclick="deleteContact(${c.id});closeDrawer()">🗑 Delete</button>
  </div>`;
  ov.classList.add('show');
}

// ---- Create Task from Contact ----
function createTaskFromContact(id){
  const c=D.contacts.find(x=>x.id===id);
  if(!c)return;
  // Close the contact drawer first
  closeDrawer();
  // Open the FA task modal
  openFA('task');
  // Pre-fill after a short delay to let the form render
  setTimeout(()=>{
    // Title: "Follow up with [Name]"
    const titleEl=document.getElementById('fa-title');
    if(titleEl)titleEl.value='Follow up with '+c.name;
    // Description: contact context
    const descEl=document.getElementById('fa-desc');
    if(descEl){
      const lines=[];
      if(c.title||c.company)lines.push('Contact: '+(c.title?c.title+' at ':'')+c.company);
      if(c.email)lines.push('Email: '+c.email);
      if(c.phone)lines.push('Phone: '+c.phone);
      if(c.notes)lines.push('','Notes: '+c.notes);
      descEl.value=lines.join('\n');
    }
    // Context: Calls
    const ctxEl=document.getElementById('fa-context');
    if(ctxEl)ctxEl.value='Calls';
    // Priority: Medium
    const priEl=document.getElementById('fa-priority');
    if(priEl)priEl.value='Medium';
    // Due: tomorrow
    const dueEl=document.getElementById('fa-due');
    if(dueEl){
      const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
      dueEl.value=tomorrow.toISOString().split('T')[0];
    }
    // Tags: follow-up + contact's name slug
    _faTags=['follow-up','contact:'+c.name.toLowerCase().replace(/\s+/g,'-')];
    renderFATags();
    // Focus title
    if(titleEl)titleEl.focus();
    // Mark dirty
    _faHasChanges=true;
  },120);
}

// ---- Add / Edit Contact Modal ----
function openAddContactModal(){
  const d=document.getElementById('drawer-content');
  const ov=document.getElementById('drawer-ov');
  d.innerHTML=contactFormHTML(null);
  ov.classList.add('show');
}
function openEditContactModal(id){
  const c=D.contacts.find(x=>x.id===id);
  if(!c)return;
  const d=document.getElementById('drawer-content');
  const ov=document.getElementById('drawer-ov');
  d.innerHTML=contactFormHTML(c);
  ov.classList.add('show');
}
function contactFormHTML(c){
  const isEdit=!!c;
  return`<h2>${isEdit?'✏ Edit Contact':'➕ New Contact'} <button class="close" onclick="closeDrawer()">✕</button></h2>
  <div class="field"><label>Full Name *</label><input class="inp" id="cf-name" value="${esc(c?c.name:'')}"></div>
  <div class="field-row">
    <div class="field"><label>Job Title</label><input class="inp" id="cf-title" value="${esc(c?c.title||'':'')}"></div>
    <div class="field"><label>Company</label><input class="inp" id="cf-company" value="${esc(c?c.company||'':'')}"></div>
  </div>
  <div class="field-row">
    <div class="field"><label>Email</label><input class="inp" type="email" id="cf-email" value="${esc(c?c.email||'':'')}"></div>
    <div class="field"><label>Phone</label><input class="inp" type="tel" id="cf-phone" value="${esc(c?c.phone||'':'')}"></div>
  </div>
  <div class="field"><label>LinkedIn URL</label><input class="inp" id="cf-linkedin" value="${esc(c?c.linkedin||'':'')}"></div>
  <div class="field"><label>Location</label><input class="inp" id="cf-location" value="${esc(c?c.location||'':'')}"></div>
  <div class="field"><label>Tags (comma separated)</label><input class="inp" id="cf-tags" value="${esc(c?(c.tags||[]).join(', '):'')}"></div>
  <div class="field"><label>Notes</label><textarea class="inp" id="cf-notes" style="min-height:80px">${esc(c?c.notes||'':'')}</textarea></div>
  <div style="display:flex;gap:8px;margin-top:12px">
    <button class="btn btn-p" onclick="saveContactForm(${isEdit?c.id:'null'})">Save</button>
    <button class="btn btn-s" onclick="closeDrawer()">Cancel</button>
    ${isEdit?`<button class="btn btn-d" onclick="deleteContact(${c.id});closeDrawer()">Delete</button>`:''}
  </div>`;
}
function saveContactForm(id){
  const name=document.getElementById('cf-name').value.trim();
  if(!name){toast('Name is required');return;}
  const tags=document.getElementById('cf-tags').value.split(',').map(t=>t.trim()).filter(Boolean);
  if(id){
    const c=D.contacts.find(x=>x.id===id);
    if(!c)return;
    c.name=name;
    c.title=document.getElementById('cf-title').value.trim();
    c.company=document.getElementById('cf-company').value.trim();
    c.email=document.getElementById('cf-email').value.trim();
    c.phone=document.getElementById('cf-phone').value.trim();
    c.linkedin=document.getElementById('cf-linkedin').value.trim();
    c.location=document.getElementById('cf-location').value.trim();
    c.tags=tags;
    c.notes=document.getElementById('cf-notes').value.trim();
  }else{
    const newC={id:nextId(D.contacts),name,title:document.getElementById('cf-title').value.trim(),company:document.getElementById('cf-company').value.trim(),email:document.getElementById('cf-email').value.trim(),phone:document.getElementById('cf-phone').value.trim(),linkedin:document.getElementById('cf-linkedin').value.trim(),location:document.getElementById('cf-location').value.trim(),tags,notes:document.getElementById('cf-notes').value.trim(),enriched:false,enrichedAt:null};
    D.contacts.push(newC);
  }
  save('contacts');closeDrawer();renderContacts();toast(id?'✓ Contact updated':'✓ Contact added');
}

// ---- Import / Export ----
function importContactsCSV(){
  const inp=document.createElement('input');
  inp.type='file';inp.accept='.csv';
  inp.onchange=async(e)=>{
    const file=e.target.files[0];if(!file)return;
    const text=await file.text();
    const lines=text.split('\n').filter(l=>l.trim());
    if(lines.length<2){toast('CSV appears empty');return;}
    const headers=lines[0].split(',').map(h=>h.trim().toLowerCase().replace(/["']/g,''));
    let added=0;
    lines.slice(1).forEach(line=>{
      const vals=line.match(/(?:"[^"]*"|[^,])+/g)||line.split(',');
      const row={};
      headers.forEach((h,i)=>{row[h]=(vals[i]||'').replace(/^"|"$/g,'').trim();});
      const name=row.name||row.full_name||row['first name']+(row['last name']?' '+row['last name']:'');
      if(!name)return;
      D.contacts.push({id:nextId(D.contacts),name,title:row.title||row.job_title||'',company:row.company||row.organization||'',email:row.email||'',phone:row.phone||row.mobile||'',linkedin:row.linkedin||row.linkedin_url||'',location:row.location||row.city||'',tags:row.tags?row.tags.split(';').map(t=>t.trim()).filter(Boolean):[],notes:row.notes||'',enriched:false,enrichedAt:null});
      added++;
    });
    save('contacts');renderContacts();toast(`✅ Imported ${added} contacts from CSV`);
  };
  inp.click();
}
function exportContactsCSV(){
  const headers=['name','title','company','email','phone','linkedin','location','tags','notes','enriched','enrichedAt'];
  const rows=D.contacts.map(c=>[c.name,c.title||'',c.company||'',c.email||'',c.phone||'',c.linkedin||'',c.location||'',(c.tags||[]).join(';'),c.notes||'',c.enriched?'yes':'no',c.enrichedAt||''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','));
  const csv=headers.join(',')+String.fromCharCode(10)+rows.join(String.fromCharCode(10));
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='contacts-export.csv';a.click();
  toast('📤 Contacts exported as CSV');
}

// ====== WORD DOC NOTE IMPORT ======
var _wdiParsedNotes=[]; // [{name,content}] from server
var _wdiFile=null;

function wdiHandleDrop(files){
  if(!files||!files.length)return;
  const f=files[0];
  if(!f.name.endsWith('.docx')){
    toast('⚠ Please select a .docx file');
    return;
  }
  if(f.size>100*1024*1024){
    toast('⚠ File is too large (max 100 MB)');
    return;
  }
  _wdiFile=f;
  document.getElementById('wdi-file-name').textContent=f.name;
  document.getElementById('wdi-file-size').textContent=(f.size/1024).toFixed(1)+' KB';
  document.getElementById('wdi-file-info').style.display='';
  document.getElementById('wdi-parse-btn').style.display='';document.getElementById('wdi-skip-row').style.display='flex';
  document.getElementById('wdi-preview').style.display='none';
  document.getElementById('wdi-result').style.display='none';
  document.getElementById('wdi-warnings').style.display='none';
  _wdiParsedNotes=[];
}

function wdiClearFile(){
  _wdiFile=null;
  _wdiParsedNotes=[];
  document.getElementById('wdi-file-info').style.display='none';
  document.getElementById('wdi-parse-btn').style.display='none';document.getElementById('wdi-skip-row').style.display='none';
  document.getElementById('wdi-preview').style.display='none';
  document.getElementById('wdi-result').style.display='none';
  document.getElementById('wdi-warnings').style.display='none';
  document.getElementById('wdi-file-input').value='';
}

async function wdiParseFile(){
  if(!_wdiFile){toast('⚠ No file selected');return;}
  document.getElementById('wdi-parse-btn').style.display='none';document.getElementById('wdi-skip-row').style.display='none';
  document.getElementById('wdi-progress').style.display='';
  document.getElementById('wdi-preview').style.display='none';
  document.getElementById('wdi-result').style.display='none';
  document.getElementById('wdi-warnings').style.display='none';
  try{
    // Read file as base64
    const base64=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=e=>{
        // Chunked base64 encoding — avoids call stack overflow on large files (>500KB)
        const bytes=new Uint8Array(e.target.result);
        let b64str='';
        const chunk=8192;
        for(let c=0;c<bytes.length;c+=chunk){
          b64str+=String.fromCharCode.apply(null,bytes.subarray(c,c+chunk));
        }
        const b64=btoa(b64str);
        resolve(b64);
      };
      reader.onerror=reject;
      reader.readAsArrayBuffer(_wdiFile);
    });
    const skipBinaries=!!document.getElementById('wdi-skip-binaries')?.checked;
    const result=await _trpc('wordImport.parseDocx',{fileBase64:base64,fileName:_wdiFile.name,skipBinaries},'mutation');
    _wdiParsedNotes=result.notes||[];
    document.getElementById('wdi-progress').style.display='none';
    // Show warnings
    if(result.warnings&&result.warnings.length){
      document.getElementById('wdi-warnings').style.display='';
      document.getElementById('wdi-warnings-list').innerHTML=result.warnings.map(w=>`<div>• ${esc(w)}</div>`).join('');
    }
    if(!_wdiParsedNotes.length){
      document.getElementById('wdi-result').style.display='';
      document.getElementById('wdi-result').style.background='var(--warn-bg,#fffbeb)';
      document.getElementById('wdi-result').style.color='var(--t2)';
      document.getElementById('wdi-result').textContent='⚠ No notes were detected in this document. Check the format: each note must start with a title, then a date line, then a time line.';
      document.getElementById('wdi-parse-btn').style.display='';document.getElementById('wdi-skip-row').style.display='flex';
      return;
    }
    // Render preview
    document.getElementById('wdi-note-count').textContent=_wdiParsedNotes.length;
    const existingTitles=new Set(D.notes.map(n=>n.title));
    document.getElementById('wdi-note-list').innerHTML=_wdiParsedNotes.map((n,i)=>{
      const isDup=existingTitles.has(n.name);
      const preview=n.content.substring(0,80).replace(/\n/g,' ');
      return `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-bottom:1px solid var(--bd1);${i===_wdiParsedNotes.length-1?'border:none':''}">
        <input type="checkbox" id="wdi-chk-${i}" checked style="margin-top:2px;flex-shrink:0">
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(n.name)}${isDup?'<span style="margin-left:6px;font-size:11px;background:var(--warn,#f59e0b);color:#fff;padding:1px 5px;border-radius:8px">duplicate</span>':''}</div>
          <div style="font-size:11px;color:var(--t3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(preview)}</div>
        </div>
      </div>`;
    }).join('');
    document.getElementById('wdi-preview').style.display='';
  }catch(e){
    document.getElementById('wdi-progress').style.display='none';
    document.getElementById('wdi-parse-btn').style.display='';document.getElementById('wdi-skip-row').style.display='flex';
    document.getElementById('wdi-result').style.display='';
    document.getElementById('wdi-result').style.background='var(--err-bg,#fef2f2)';
    document.getElementById('wdi-result').style.color='var(--err,#dc2626)';
    document.getElementById('wdi-result').textContent='❌ Error: '+(e?.message||'Unknown error');
  }
}

function wdiSelectAll(sel){
  _wdiParsedNotes.forEach((_,i)=>{
    const chk=document.getElementById('wdi-chk-'+i);
    if(chk)chk.checked=sel;
  });
}

async function wdiImportSelected(){
  const dupMode=document.getElementById('wdi-dup-mode').value;
  const selected=_wdiParsedNotes.filter((_,i)=>{
    const chk=document.getElementById('wdi-chk-'+i);
    return chk&&chk.checked;
  });
  if(!selected.length){toast('⚠ Select at least one note to import');return;}
  let imported=0,skipped=0,overwritten=0;
  const existingTitles=new Set(D.notes.map(n=>n.title));
  for(const n of selected){
    const isDup=existingTitles.has(n.name);
    if(isDup){
      if(dupMode==='skip'){skipped++;continue;}
      if(dupMode==='overwrite'){
        const idx=D.notes.findIndex(x=>x.title===n.name);
        if(idx>=0){D.notes[idx].body=n.content;D.notes[idx].bodyHtml=n.contentHtml||'';D.notes[idx].updated=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});overwritten++;continue;}
      }
      // rename mode: fall through with modified name
    }
    const finalName=isDup&&dupMode==='rename'?n.name+' (imported)':n.name;
    D.notes.push({id:Date.now()+Math.random(),title:finalName,body:n.content,bodyHtml:n.contentHtml||'',tags:[],source:'Word Import',created:new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),updated:new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})});
    imported++;
  }
  save('notes');
  // Push to the server immediately rather than relying on the 2s debounce —
  // imported notes too big for the localStorage cache live only in memory
  // until the server has them, so a reload right after import would lose them.
  if(typeof _pushKeyToServer==='function'){
    try{await _pushKeyToServer('notes');}catch(_){}
  }
  // Record history
  const histEl=document.getElementById('wdi-history');
  const entry=document.createElement('div');
  entry.style.cssText='padding:4px 0;border-bottom:1px solid var(--bd1);font-size:10px';
  entry.innerHTML=`<strong>${new Date().toLocaleString()}</strong> — ${imported} imported${skipped?' / '+skipped+' skipped':''}${overwritten?' / '+overwritten+' overwritten':''} from <em>${esc(_wdiFile?.name||'file')}</em>`;
  if(histEl.textContent==='No imports yet.')histEl.textContent='';
  histEl.prepend(entry);
  // Show result
  const res=document.getElementById('wdi-result');
  res.style.display='';
  res.style.background='var(--ok-bg,#f0fdf4)';
  res.style.color='var(--ok,#16a34a)';
  res.innerHTML=`✅ <strong>${imported}</strong> note${imported!==1?'s':''} imported${skipped?`, ${skipped} skipped`:''}${overwritten?`, ${overwritten} overwritten`:''}. <a href="#" onclick="renderScreen('notes');return false">Go to Notes →</a>`;
  document.getElementById('wdi-preview').style.display='none';
  toast('📥 '+imported+' note'+(imported!==1?'s':'')+' imported from Word document');
}

// ====== ONENOTE IMPORT ======
// State for the notebook browser
var _onSelectedNotebook=null; // {id,name}
var _onSelectedSection=null;  // {id,name}
var _onImportJobId=null;
var _onPollTimer=null;

async function loadOnenoteStatus(){
  const badge=document.getElementById('on-status-badge');
  const text=document.getElementById('on-status-text');
  const connectWrap=document.getElementById('on-btn-connect-wrap');
  const connectedWrap=document.getElementById('on-btn-connected-wrap');
  if(!badge)return;
  try{
    const status=await _trpc('onenote.status',undefined,'query');
    if(status&&status.connected){
      badge.style.background='var(--ok)';badge.style.color='#fff';badge.textContent='✓ Connected';
      text.textContent=status.email||status.displayName||'Microsoft account connected';
      connectWrap.style.display='none';connectedWrap.style.display='';
      renderOnenoteHistory(status.latestJob);
    } else {
      badge.style.background='var(--s3)';badge.style.color='var(--t3)';badge.textContent='Not connected';
      text.textContent='Connect your Microsoft account to get started';
      connectWrap.style.display='';connectedWrap.style.display='none';
    }
  } catch(e){
    text.textContent='Could not check connection status';
    console.error('[OneNote]',e);
  }
}

async function connectOnenote(){
  try{
    const data=await _trpc('onenote.getAuthUrl',{origin:window.location.origin},'query');
    if(data&&data.url)window.location.href=data.url;
  } catch(e){
    showToast('Could not get Microsoft auth URL: '+e.message,'error');
  }
}

async function disconnectOnenote(){
  if(!confirm('Disconnect your Microsoft account from OneNote import?'))return;
  try{
    await _trpc('oauthSync.disconnect',{provider:'microsoft'},'mutation');
    loadOnenoteStatus();
    document.getElementById('on-browser').style.display='none';
    showToast('Microsoft account disconnected');
  } catch(e){
    showToast('Disconnect failed: '+e.message,'error');
  }
}

async function loadOnenoteNotebooks(){
  const browser=document.getElementById('on-browser');
  const nbWrap=document.getElementById('on-notebooks-wrap');
  browser.style.display='';
  document.getElementById('on-sections-wrap').style.display='none';
  document.getElementById('on-pages-wrap').style.display='none';
  nbWrap.style.display='';
  nbWrap.innerHTML='<div style="font-size:11px;color:var(--t3);padding:8px 0">Loading notebooks…</div>';
  try{
    const notebooks=await _trpc('onenote.listNotebooks',undefined,'query');
    if(!notebooks||notebooks.length===0){
      nbWrap.innerHTML='<div style="font-size:11px;color:var(--t3)">No notebooks found in your Microsoft account.</div>';
      return;
    }
    nbWrap.innerHTML=notebooks.map(nb=>`
      <div class="lr" style="cursor:pointer;padding:8px;border-radius:8px;margin-bottom:4px;background:var(--s2)" onclick="selectOnenoteNotebook('${nb.id.replace(/'/g,"\\'")}',' ${nb.name.replace(/'/g,"\\'")}')">  
        <span style="font-size:18px;margin-right:8px">📓</span>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:500">${esc(nb.name)}</div>
          <div style="font-size:11px;color:var(--t3)">Last modified: ${new Date(nb.lastModified).toLocaleDateString()}</div>
        </div>
        <span style="font-size:11px;color:var(--t3)">›</span>
      </div>`).join('');
  } catch(e){
    nbWrap.innerHTML='<div style="font-size:11px;color:var(--red)">Failed to load notebooks: '+esc(e.message)+'</div>';
  }
}

async function selectOnenoteNotebook(id,name){
  _onSelectedNotebook={id,name};
  document.getElementById('on-selected-nb-name').textContent=name;
  document.getElementById('on-notebooks-wrap').style.display='none';
  const secWrap=document.getElementById('on-sections-wrap');
  const secList=document.getElementById('on-sections-list');
  secWrap.style.display='';
  secList.innerHTML='<div style="font-size:11px;color:var(--t3)">Loading sections…</div>';
  try{
    const sections=await _trpc('onenote.listSections',{notebookId:id},'query');
    if(!sections||sections.length===0){
      secList.innerHTML='<div style="font-size:11px;color:var(--t3)">No sections found.</div>';
      return;
    }
    secList.innerHTML=sections.map(s=>`
      <div class="lr" style="cursor:pointer;padding:8px;border-radius:8px;margin-bottom:4px;background:var(--s2)" onclick="selectOnenoteSection('${s.id.replace(/'/g,"\\'")}',' ${s.name.replace(/'/g,"\\'")}')">  
        <span style="font-size:16px;margin-right:8px">📂</span>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:500">${esc(s.name)}</div>
          <div style="font-size:11px;color:var(--t3)">Last modified: ${new Date(s.lastModified).toLocaleDateString()}</div>
        </div>
        <span style="font-size:11px;color:var(--t3)">›</span>
      </div>`).join('');
  } catch(e){
    secList.innerHTML='<div style="font-size:11px;color:var(--red)">Failed to load sections: '+esc(e.message)+'</div>';
  }
}

async function selectOnenoteSection(id,name){
  _onSelectedSection={id,name};
  document.getElementById('on-selected-sec-name').textContent=name;
  document.getElementById('on-sections-wrap').style.display='none';
  const pagesWrap=document.getElementById('on-pages-wrap');
  const pagesList=document.getElementById('on-pages-list');
  pagesWrap.style.display='';
  pagesList.innerHTML='<div style="font-size:11px;color:var(--t3)">Loading pages…</div>';
  try{
    const pages=await _trpc('onenote.listPages',{sectionId:id},'query');
    if(!pages||pages.length===0){
      pagesList.innerHTML='<div style="font-size:11px;color:var(--t3)">No pages found.</div>';
      return;
    }
    pagesList.innerHTML=`<div style="font-size:11px;color:var(--t3);margin-bottom:6px">${pages.length} page${pages.length!==1?'s':''} found — click a page to import it individually, or use the button below to import all.</div>`+
      pages.map(p=>`
        <div class="lr" style="cursor:pointer;padding:6px 8px;border-radius:6px;margin-bottom:3px;background:var(--s2)" onclick="startOnenoteImport('page','${p.id.replace(/'/g,"\\'")}',' ${p.title.replace(/'/g,"\\'")}')">  
          <span style="font-size:14px;margin-right:8px">📄</span>
          <div style="flex:1">
            <div style="font-size:11px;font-weight:500">${esc(p.title||'Untitled')}</div>
            <div style="font-size:11px;color:var(--t3)">${new Date(p.lastModified).toLocaleDateString()}</div>
          </div>
        </div>`).join('');
  } catch(e){
    pagesList.innerHTML='<div style="font-size:11px;color:var(--red)">Failed to load pages: '+esc(e.message)+'</div>';
  }
}

async function startOnenoteImport(scope,pageId,pageName){
  if(!_onSelectedNotebook){showToast('No notebook selected','error');return;}
  const input={
    scope,
    notebookId:_onSelectedNotebook.id,
    notebookName:_onSelectedNotebook.name,
    sectionId:_onSelectedSection?_onSelectedSection.id:undefined,
    sectionName:_onSelectedSection?_onSelectedSection.name:undefined,
    pageId:pageId||undefined,
    pageName:pageName||undefined,
  };
  try{
    const result=await _trpc('onenote.startImport',input,'mutation');
    _onImportJobId=result.jobId;
    document.getElementById('on-browser').style.display='none';
    document.getElementById('on-progress-wrap').style.display='';
    document.getElementById('on-progress-label').textContent='Importing '+result.totalPages+' page'+(result.totalPages!==1?'s':'')+'…';
    document.getElementById('on-progress-bar').style.width='0%';
    document.getElementById('on-progress-pct').textContent='0%';
    pollOnenoteProgress();
  } catch(e){
    showToast('Import failed to start: '+e.message,'error');
  }
}

function pollOnenoteProgress(){
  if(_onPollTimer)clearInterval(_onPollTimer);
  _onPollTimer=setInterval(async()=>{
    if(!_onImportJobId)return;
    try{
      const job=await _trpc('onenote.getImportProgress',{jobId:_onImportJobId},'query');
      const pct=job.progressPct||0;
      document.getElementById('on-progress-bar').style.width=pct+'%';
      document.getElementById('on-progress-pct').textContent=pct+'%';
      document.getElementById('on-progress-label').textContent=
        `Imported ${job.importedPages} of ${job.totalPages} pages${job.failedPages>0?' ('+job.failedPages+' failed)':''}`;
      if(job.status==='completed'||job.status==='failed'){
        clearInterval(_onPollTimer);
        _onPollTimer=null;
        document.getElementById('on-progress-wrap').style.display='none';
        if(job.status==='completed'){
          showToast('✅ Imported '+job.importedPages+' note'+(job.importedPages!==1?'s':'')+' from OneNote!');
        } else {
          showToast('⚠ Import finished with errors. '+job.failedPages+' pages failed.','error');
        }
        loadOnenoteStatus();
        loadOnenoteHistory();
      }
    } catch(e){
      console.error('[OneNote poll]',e);
    }
  },2000);
}

async function loadOnenoteHistory(){
  const list=document.getElementById('on-history-list');
  if(!list)return;
  try{
    const jobs=await _trpc('onenote.listImportJobs',undefined,'query');
    if(!jobs||jobs.length===0){
      list.innerHTML='<div style="font-size:11px;color:var(--t3)">No imports yet</div>';
      return;
    }
    list.innerHTML=jobs.map(j=>{
      const statusColor=j.status==='completed'?'var(--ok)':j.status==='failed'?'var(--red)':j.status==='running'?'var(--ac)':'var(--t3)';
      const statusIcon=j.status==='completed'?'✅':j.status==='failed'?'❌':j.status==='running'?'⏳':'⏸';
      return `<div class="lr" style="padding:8px;border-radius:8px;background:var(--s2);margin-bottom:4px">
        <div style="flex:1">
          <div style="font-size:11px;font-weight:500">${esc(j.notebookName||'Unknown notebook')}${j.sectionName?' / '+esc(j.sectionName):''}</div>
          <div style="font-size:11px;color:var(--t3)">${new Date(j.createdAt).toLocaleString()}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:${statusColor}">${statusIcon} ${j.status}</div>
          <div style="font-size:11px;color:var(--t3)">${j.importedPages}/${j.totalPages} pages</div>
        </div>
      </div>`;
    }).join('');
  } catch(e){
    list.innerHTML='<div style="font-size:11px;color:var(--t3)">Could not load history</div>';
  }
}

function renderOnenoteHistory(latestJob){
  loadOnenoteHistory();
}

// ====== OAUTH SYNC ======
// Calls the tRPC backend via fetch to manage Microsoft/Google OAuth tokens

async function _trpc(procedure,input,method='query'){
  const url='/api/trpc/'+procedure;
  if(method==='query'){
    const resp=await fetch(url+'?input='+encodeURIComponent(JSON.stringify({json:input})),{credentials:'include'});
    const data=await resp.json();
    if(data.error){
      const msg=data.error.json?.message||data.error.message||data.error.data?.message||'tRPC error';
      throw new Error(msg);
    }
    return data.result?.data?.json??data.result?.data;
  }
  const resp=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({json:input})});
  const data=await resp.json();
  if(data.error){
    const msg=data.error.json?.message||data.error.message||data.error.data?.message||'tRPC error';
    throw new Error(msg);
  }
  return data.result?.data?.json??data.result?.data;
}

// ===== RTE PLACEHOLDER CSS =====
(function(){
  const style=document.createElement('style');
  style.textContent=`
    [contenteditable][data-placeholder]:empty:before{content:attr(data-placeholder);color:var(--t3);pointer-events:none;display:block;}
    [contenteditable]:focus{outline:none;}
  `;
  document.head.appendChild(style);
})();

// ===== RTE AI HELPERS =====
async function _rteAICall(prompt,resultElId,loadingText){
  const el=document.getElementById(resultElId);
  if(!el)return;
  el.style.display='block';
  el.textContent=loadingText||'⏳ Thinking...';
  try{
    const {provider:_p,apiKey:_k}=_getAIConfig();
    const res=await _trpc('oauthSync.suggestFollowUps',{subject:'AI Assist',body:prompt,provider:_p,apiKey:_k},'mutation');
    // Re-use suggestFollowUps but display as plain text
    const text=(res?.suggestions||[]).join('\n\n');
    el.textContent=text||'No response generated.';
  }catch(e){
    el.textContent='⚠ AI error: '+(e?.message||'unknown');
  }
}
// ===== RTE AI HISTORY =====
const _rteHistoryKey='rte_ai_history';
function _rteHistorySave(surfaceId,prompt,result){
  try{
    const all=JSON.parse(localStorage.getItem(_rteHistoryKey)||'{}');
    if(!all[surfaceId])all[surfaceId]=[];
    all[surfaceId].unshift({ts:Date.now(),prompt:prompt.substring(0,120),result});
    all[surfaceId]=all[surfaceId].slice(0,3); // keep last 3
    localStorage.setItem(_rteHistoryKey,JSON.stringify(all));
  }catch(e){/* ignore */}
}
function _rteHistoryGet(surfaceId){
  try{
    const all=JSON.parse(localStorage.getItem(_rteHistoryKey)||'{}');
    return all[surfaceId]||[];
  }catch(e){return [];}
}
function _rteHistoryRender(surfaceId){
  const items=_rteHistoryGet(surfaceId);
  if(!items.length)return '';
  const rows=items.map((h,i)=>{
    const ago=_rteTimeAgo(h.ts);
    return `<div style="padding:6px 0;border-bottom:1px solid var(--bd2);last-child:border:none">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
        <span style="font-size:11px;color:var(--t3)">${ago}</span>
        <button type="button" class="btn btn-s" style="height:18px;font-size:10px;padding:0 6px" onclick="_rteHistoryInsert('${surfaceId}',${i})">⬇ Use</button>
      </div>
      <div style="font-size:11px;color:var(--t2);white-space:pre-wrap;max-height:60px;overflow:hidden;line-height:1.5">${esc(h.result.substring(0,200))}${h.result.length>200?'…':''}</div>
    </div>`;
  }).join('');
  return `<details style="margin-top:8px">
    <summary style="font-size:11px;font-weight:600;color:var(--t2);cursor:pointer;user-select:none">🕐 Recent AI Responses (${items.length})</summary>
    <div style="margin-top:6px;padding:6px;background:var(--s1);border-radius:6px;border:1px solid var(--bd2)">${rows}</div>
  </details>`;
}
function _rteHistoryInsert(surfaceId,idx){
  const items=_rteHistoryGet(surfaceId);
  const item=items[idx];
  if(!item)return;
  // Find the result element for this surface and show the historical result
  const resultElId=surfaceId.replace('-rte','-ai-result').replace('fa-jrnl','fa-jrnl').replace('dr-diary','dr-jrnl').replace('dr-note','dr-note').replace('ni-body','ni').replace('fa-note','fa-note').replace('idea-body-rte-','idea-ai-result-');
  const el=document.getElementById(resultElId);
  if(el){el.style.display='block';el.innerHTML=`<div style="white-space:pre-wrap;line-height:1.6">${esc(item.result)}</div><button type="button" class="btn btn-p" style="margin-top:6px;height:22px;font-size:11px;padding:0 8px" onclick="_rteInsert('${surfaceId}',this.previousElementSibling.textContent)">⬇ Insert into body</button>`;}
  toast('📋 Historical response loaded');
}
function _rteTimeAgo(ts){
  const diff=Date.now()-ts;
  if(diff<60000)return 'just now';
  if(diff<3600000)return Math.floor(diff/60000)+'m ago';
  if(diff<86400000)return Math.floor(diff/3600000)+'h ago';
  return Math.floor(diff/86400000)+'d ago';
}

// Workspace-wide shared AI configuration. Stored on the server in
// systemSettings (admin-only writes, all-user reads). Cached in-memory after
// first load so AI calls are synchronous-ish.
let _sharedAI={keys:{openai:'',claude:'',gemini:''},provider:'openai',loaded:false};
async function loadSharedAISettings(){
  // Belt-and-suspenders: read a localStorage cache first so the Settings
  // panel shows the correct keys instantly on page load, even before the
  // server roundtrip completes (or if it fails entirely).
  try{
    const cached=JSON.parse(localStorage.getItem('lu_sharedAI')||'null');
    if(cached&&cached.keys){
      _sharedAI={keys:cached.keys,provider:cached.provider||'openai',loaded:false};
    }
  }catch(_){}
  try{
    const res=await _trpc('aiSettings.get',undefined,'query');
    if(res){
      _sharedAI={keys:res.keys||{},provider:res.provider||'openai',loaded:true};
      // Refresh the cache so the next page load is instant.
      try{localStorage.setItem('lu_sharedAI',JSON.stringify({keys:_sharedAI.keys,provider:_sharedAI.provider}));}catch(_){}
    }
  }catch(e){console.warn('[aiSettings] load failed',e?.message||e);_sharedAI.loaded=true;}
  // If the user is on the Settings → AI Features pane right now, re-render
  // it so the inputs reflect what came back from the server.
  try{
    if(typeof curScreen!=='undefined'&&curScreen==='settings'){
      const aiPane=document.getElementById('sp-6');
      if(aiPane&&aiPane.style.display!=='none'&&typeof renderScreen==='function')renderScreen('settings');
    }
  }catch(_){}
  // One-time migration: keys may live in either D.creds.{openai_key,...}
  // (the original localStorage-only home) or D.prefs.aiKeys (Round 1's
  // server-synced home). On first admin login after Round 3, sweep both
  // and push anything found into the shared workspace store.
  try{
    if(String(D.creds.role||'').toLowerCase()==='admin'){
      const updates={};
      const fromCreds={
        openai:D.creds&&D.creds.openai_key,
        claude:D.creds&&D.creds.claude_key,
        gemini:D.creds&&D.creds.gemini_key,
      };
      const fromPrefs=(D.prefs&&D.prefs.aiKeys)||{};
      for(const p of ['openai','claude','gemini']){
        if(_sharedAI.keys[p])continue; // already on server, don't overwrite
        const v=fromCreds[p]||fromPrefs[p];
        if(v)updates[p]=v;
      }
      if(Object.keys(updates).length){
        await _trpc('aiSettings.set',updates,'mutation');
        Object.assign(_sharedAI.keys,updates);
        // Clean up legacy locations now that the keys are safely on the server
        if(D.creds){delete D.creds.openai_key;delete D.creds.claude_key;delete D.creds.gemini_key;
          try{localStorage.setItem('lu_creds',JSON.stringify(D.creds));}catch(_){}}
        if(D.prefs&&D.prefs.aiKeys){delete D.prefs.aiKeys;save('prefs');}
        toast('✅ AI keys migrated to shared workspace storage');
      }
    }
  }catch(_){}
}

function _getAIConfig(){
  // Prefer workspace-shared keys (loaded from server). Fall back to legacy
  // per-user storage so AI calls keep working before loadSharedAISettings()
  // returns on a fresh page load.
  const explicit=_sharedAI.provider||(D.prefs&&D.prefs.aiProvider)||'openai';
  const sharedKeys=_sharedAI.keys||{};
  if(sharedKeys[explicit])return {provider:explicit,apiKey:sharedKeys[explicit]};
  const legacyKeys=(D.prefs&&D.prefs.aiKeys)||{};
  if(legacyKeys[explicit])return {provider:explicit,apiKey:legacyKeys[explicit]};
  for(const p of ['openai','claude','gemini']){
    if(sharedKeys[p])return {provider:p,apiKey:sharedKeys[p]};
    if(legacyKeys[p])return {provider:p,apiKey:legacyKeys[p]};
  }
  return {provider:'manus',apiKey:undefined};
}

// Admin-only: write a shared AI key (or clear with empty string).
// Hardened: refuses to silently wipe a previously-saved key. If the input
// is empty, the user must explicitly confirm they want to clear it.
async function setAIKey(provider,key){
  const previous=_sharedAI.keys&&_sharedAI.keys[provider]||'';
  if(!key&&previous){
    if(!confirm('Clear the saved '+provider+' API key? This affects every team member. Cancel to keep the existing key.'))return;
  }
  if(!key&&!previous){
    toast('Enter a key first');return;
  }
  try{
    await _trpc('aiSettings.set',{[provider]:key||''},'mutation');
    _sharedAI.keys[provider]=key||'';
    try{localStorage.setItem('lu_sharedAI',JSON.stringify({keys:_sharedAI.keys,provider:_sharedAI.provider}));}catch(_){}
    renderScreen('settings');
    toast(key?'✅ '+provider+' key saved for the whole team':provider+' key cleared');
  }catch(e){
    toast('Failed to save: '+(e.message||e));
  }
}
async function setAIProvider(p){
  try{
    await _trpc('aiSettings.set',{provider:p},'mutation');
    _sharedAI.provider=p;
    try{localStorage.setItem('lu_sharedAI',JSON.stringify({keys:_sharedAI.keys,provider:_sharedAI.provider}));}catch(_){}
    renderScreen('settings');
    toast('Active AI provider: '+p);
  }catch(e){toast('Failed: '+(e.message||e));}
}
async function _rteAIGeneral(systemPrompt,userContent,resultElId,targetRteId){
  const el=document.getElementById(resultElId);
  if(!el)return;
  el.style.display='block';
  el.innerHTML='<span style="color:var(--t3)">⏳ Thinking...</span>';
  const {provider,apiKey}=_getAIConfig();
  // Inject the current length-guidance hint into the systemPrompt so the
  // model knows how long to make the response. Cheap; happens at call time
  // so a chip change between renders takes effect on the next click.
  const sysWithLen=(typeof _aiLengthHint==='function')?(systemPrompt+_aiLengthHint()):systemPrompt;
  try{
    const res=await _trpc('ai.assist',{systemPrompt:sysWithLen,userContent,provider:provider||'manus',apiKey:apiKey||undefined},'mutation');
    const text=res?.result||res?.text||'No response generated.';
    // Save the raw markdown to history (rendered HTML is regenerated on demand).
    if(targetRteId)_rteHistorySave(targetRteId,systemPrompt.substring(0,120),text);
    // Render the AI output as HTML via renderMd so headings / bold / lists /
    // links show up formatted in the preview pane. Stash the markdown source
    // on a data-md attribute so Insert + Copy can grab the original.
    const html=(typeof renderMd==='function')?renderMd(text):`<div style="white-space:pre-wrap">${esc(text)}</div>`;
    const previewId='ai-out-'+Math.random().toString(36).slice(2,9);
    const insertBtn=targetRteId
      ?`<button type="button" class="btn btn-p" style="margin-top:6px;height:22px;font-size:11px;padding:0 8px" onmousedown="event.preventDefault()" onclick="_rteInsertHTML('${targetRteId}','${previewId}',this)">⬇ Insert into body</button>`
      :`<button type="button" class="btn btn-p" style="margin-top:6px;height:22px;font-size:11px;padding:0 8px" onclick="_rteCopyToClipboard('${previewId}')">📋 Copy</button>`;
    const historyHtml=targetRteId?_rteHistoryRender(targetRteId):'';
    // data-md holds the original markdown for clipboard copy. The visible div
    // shows the rendered HTML. Both live in the same node so the Insert /
    // Copy buttons can reach either via getElementById(previewId).
    el.innerHTML=`<div id="${previewId}" data-md="${esc(text)}" style="line-height:1.55;font-size:12px;color:var(--t1)">${html}</div>${insertBtn}${historyHtml}`;
  }catch(e){
    el.textContent='⚠ AI error: '+(e?.message||'unknown');
  }
}

// Insert the rendered HTML from an AI preview into a contenteditable RTE.
// Used by _rteAIGeneral's Insert button. The source element's innerHTML is
// already rendered HTML (from renderMd) — we transplant its children into
// the RTE so formatting (headings, lists, bold, links, images) survives.
function _rteInsertHTML(rteId,sourceElId,btnEl){
  try{
    const rte=document.getElementById(rteId);
    // Prefer the preview node adjacent to the clicked button — immune to
    // stale/duplicate ids if the pane re-rendered after the button was drawn.
    let src=(btnEl&&btnEl.previousElementSibling&&btnEl.previousElementSibling.hasAttribute&&btnEl.previousElementSibling.hasAttribute('data-md'))
      ?btnEl.previousElementSibling
      :document.getElementById(sourceElId);
    if(!rte){toast({type:'error',title:'Insert failed',msg:'Editor "'+rteId+'" not found on this screen — please report this.'});return;}
    if(!src){toast({type:'error',title:'Insert failed',msg:'AI preview content not found — regenerate and try again.'});return;}
    rte.focus();
    // Spacer line so the inserted block isn't visually glued to existing content.
    if(rte.lastChild&&rte.innerHTML.trim()!=='')rte.appendChild(document.createElement('br'));
    // Clone children rather than moving them so the preview pane stays intact
    // (lets the user click Insert multiple times, regenerate, etc.).
    Array.from(src.childNodes).forEach(node=>rte.appendChild(node.cloneNode(true)));
    // Move cursor to end + fire input so word-count / autosave hooks re-run.
    const range=document.createRange();
    range.selectNodeContents(rte);
    range.collapse(false);
    const sel=window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    rte.dispatchEvent(new Event('input',{bubbles:true}));
    // Make the insertion unmissable: scroll the editor (and the inserted end)
    // into view and flash the surface briefly.
    rte.scrollTop=rte.scrollHeight;
    if(rte.scrollIntoView)rte.scrollIntoView({block:'nearest'});
    const prevOutline=rte.style.outline;
    rte.style.outline='2px solid var(--ok)';
    setTimeout(()=>{rte.style.outline=prevOutline||'';},900);
    toast('✓ Inserted into body');
  }catch(e){
    toast({type:'error',title:'Insert failed',msg:String(e&&e.message||e)});
  }
}

// Legacy plain-text insert — preserved for any caller still passing raw text.
// New callers should use _rteInsertHTML.
function _rteInsert(rteId,text){
  const rte=document.getElementById(rteId);
  if(!rte){toast({type:'error',title:'Insert failed',msg:'Editor "'+rteId+'" not found on this screen — please report this.'});return;}
  rte.focus();
  const br=document.createElement('br');
  const textNode=document.createTextNode(text);
  rte.appendChild(br);
  rte.appendChild(textNode);
  const range=document.createRange();
  range.selectNodeContents(rte);
  range.collapse(false);
  const sel=window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  rte.dispatchEvent(new Event('input',{bubbles:true}));
  toast('✓ Inserted into body');
}

function _rteCopyToClipboard(srcId){
  // New signature: takes the preview element id and copies its data-md
  // (the original markdown source) rather than the rendered text content.
  // Back-compat: if a DOM node is passed (old call sites), fall back to
  // its textContent.
  let text='';
  if(typeof srcId==='string'){
    const el=document.getElementById(srcId);
    text=el?.dataset?.md||el?.textContent||'';
  }else if(srcId&&srcId.previousElementSibling){
    text=srcId.previousElementSibling.dataset?.md||srcId.previousElementSibling.textContent||'';
  }
  navigator.clipboard.writeText(text).then(()=>toast('📋 Copied!')).catch(()=>toast('Copy failed'));
}

async function testAIProvider(provider,inputId,btnId){
  const keyInput=document.getElementById(inputId);
  const btn=document.getElementById(btnId);
  const statusEl=document.getElementById('ai-'+provider+'-status');
  const key=(keyInput?.value||'').trim();
  if(!key){toast('Enter an API key first, then click Test.');return;}
  if(btn){btn.disabled=true;btn.textContent='⏳ Testing...';}
  if(statusEl){statusEl.style.display='none';statusEl.textContent='';}
  try{
    const res=await _trpc('ai.assist',{
      systemPrompt:'You are a helpful assistant.',
      userContent:'Reply with exactly: OK',
      provider,
      apiKey:key
    },'mutation');
    const ok=!!(res?.result||res?.text);
    if(statusEl){
      statusEl.style.display='block';
      statusEl.style.color=ok?'var(--ok)':'var(--err)';
      statusEl.textContent=ok?'✅ Connection successful — key is valid':'❌ Unexpected empty response';
    }
    if(btn){btn.disabled=false;btn.textContent='⚡ Test';}
    toast(ok?'✅ '+provider.charAt(0).toUpperCase()+provider.slice(1)+' key is working!':'❌ Empty response from '+provider);
  }catch(e){
    if(statusEl){
      statusEl.style.display='block';
      statusEl.style.color='var(--err)';
      statusEl.textContent='❌ Error: '+(e?.message||'Connection failed');
    }
    if(btn){btn.disabled=false;btn.textContent='⚡ Test';}
    toast('❌ '+provider+' key test failed: '+(e?.message||'unknown error'));
  }
}

async function rteJournalAI(mode){
  const rte=document.getElementById('fa-jrnl-rte');
  const resultEl='fa-jrnl-ai-result';
  const text=(rte?.innerText||'').trim();
  const prompts={
    expand:`You are a reflective journaling coach. The user has written the following diary entry. Expand it with deeper reflection, emotional nuance, and specific details. Keep the first-person voice.\n\nEntry:\n${text}`,
    reflect:`You are a mindful journaling coach. Read this diary entry and offer 3-5 thoughtful reflection questions to help the user go deeper. Be empathetic and insightful.\n\nEntry:\n${text}`,
    summarise:`Summarise this journal entry in 2-3 sentences, capturing the key emotions, events, and insights.\n\nEntry:\n${text}`,
    mood:`Analyse the emotional tone of this journal entry. Identify the primary mood, secondary emotions, and any patterns worth noting. Be concise and supportive.\n\nEntry:\n${text}`,
    questions:`Generate 5 powerful journaling prompts to help the user continue writing about the themes in this entry. Each prompt should be a single question.\n\nEntry:\n${text}`,
  };
  if(!text&&mode!=='questions'){toast('Write something first, then use AI assistance.');return;}
  const systemPrompt=prompts[mode]||prompts.expand;
  await _rteAIGeneral(systemPrompt,text,resultEl,'fa-jrnl-rte');
}

async function drJrnlAI(mode){
  const rte=document.getElementById('dr-diary-rte');
  const resultEl='dr-jrnl-ai-result';
  const text=(rte?.innerText||'').trim();
  const prompts={
    expand:`You are a reflective journaling coach. The user has written the following diary entry. Expand it with deeper reflection, emotional nuance, and specific details. Keep the first-person voice.\n\nEntry:\n${text}`,
    reflect:`You are a mindful journaling coach. Read this diary entry and offer 3-5 thoughtful reflection questions to help the user go deeper. Be empathetic and insightful.\n\nEntry:\n${text}`,
    summarise:`Summarise this journal entry in 2-3 sentences, capturing the key emotions, events, and insights.\n\nEntry:\n${text}`,
    mood:`Analyse the emotional tone of this journal entry. Identify the primary mood, secondary emotions, and any patterns worth noting. Be concise and supportive.\n\nEntry:\n${text}`,
    react:`You are a warm, supportive coach reading the user's journal entry. Respond as a trusted friend would: acknowledge what they're feeling, name 1-2 things you notice, ask one open-ended question, and (if helpful) offer one small, kind suggestion. Keep it under 120 words. Use second person ('you').\n\nEntry:\n${text}`,
  };
  if(!text){toast('Write something in the diary entry first.');return;}
  const systemPrompt=prompts[mode]||prompts.expand;
  await _rteAIGeneral(systemPrompt,text,resultEl,'dr-diary-rte');
}

async function drNoteAI(mode){
  const rte=document.getElementById('dr-note-rte');
  const title=document.getElementById('dr-title')?.value.trim()||'';
  const mdBody=document.getElementById('dr-body')?.value.trim()||'';
  const resultEl='dr-note-ai-result';
  const body=(rte?.innerText||'').trim()||mdBody;
  const context=`Note: ${title}\n\n${body}`;
  const prompts={
    expand:`You are a knowledge management expert. Expand this note with additional context, examples, and related concepts. Keep it concise and useful.\n\n${context}`,
    summarise:`Summarise this note in 3 bullet points, capturing the key ideas and insights.\n\n${context}`,
    link:`You are a second brain assistant. Identify 3-5 key concepts in this note and suggest related topics, frameworks, or ideas the user should explore or link to.\n\n${context}`,
    autotag:`Suggest 5-8 relevant tags for this note. Return them as a comma-separated list. Be specific and useful for future retrieval.\n\n${context}`,
  };
  if(!title&&!body){toast('Add a title or content first.');return;}
  const systemPrompt=prompts[mode]||prompts.expand;
  await _rteAIGeneral(systemPrompt,body,resultEl,'dr-note-rte');
}

async function rteIdeaAI(mode){
  const rte=document.getElementById('ni-body-rte');
  const title=document.getElementById('ni-title')?.value.trim()||'';
  const desc=document.getElementById('ni-desc')?.value.trim()||'';
  const resultEl='ni-ai-result';
  const body=(rte?.innerText||'').trim();
  const context=`Idea: ${title}\nOne-liner: ${desc}\nDescription: ${body}`;
  const prompts={
    validate:`You are a startup advisor. Evaluate this idea for viability. Consider market size, problem-solution fit, and feasibility. Give a balanced 3-point assessment.\n\n${context}`,
    premortem:`You are a critical thinker. Imagine this idea has failed 2 years from now. List the top 5 reasons it failed. Be specific and constructive.\n\n${context}`,
    ice:`You are a product manager. Score this idea using the ICE framework (Impact 1-10, Confidence 1-10, Ease 1-10). Explain each score briefly.\n\n${context}`,
    expand:`You are a creative strategist. Expand this idea with concrete next steps, potential features, target audience, and revenue model suggestions.\n\n${context}`,
    competitors:`You are a market researcher. Identify 3-5 potential competitors or analogous products for this idea. For each, note their strengths and how this idea could differentiate.\n\n${context}`,
  };
  if(!title&&!body){toast('Add a title or description first.');return;}
  const systemPrompt=prompts[mode]||prompts.expand;
  await _rteAIGeneral(systemPrompt,context,resultEl,'ni-body-rte');
}

async function rteNoteAI(mode){
  const rte=document.getElementById('fa-note-rte');
  const title=document.getElementById('fa-title')?.value.trim()||'';
  const mdBody=document.getElementById('fa-desc')?.value.trim()||'';
  const resultEl='fa-note-ai-result';
  const body=(rte?.innerText||'').trim()||mdBody;
  const context=`Note: ${title}\n\n${body}`;
  const prompts={
    expand:`You are a knowledge management expert. Expand this note with additional context, examples, and related concepts. Keep it concise and useful.\n\n${context}`,
    summarise:`Summarise this note in 3 bullet points, capturing the key ideas and insights.\n\n${context}`,
    link:`You are a second brain assistant. Identify 3-5 key concepts in this note and suggest related topics, frameworks, or ideas the user should explore or link to.\n\n${context}`,
    autotag:`Suggest 5-8 relevant tags for this note. Return them as a comma-separated list. Be specific and useful for future retrieval.\n\n${context}`,
    questions:`Generate 5 clarifying or deepening questions about this note that would help the user think more critically about the content.\n\n${context}`,
  };
  if(!title&&!body){toast('Add a title or content first.');return;}
  const systemPrompt=prompts[mode]||prompts.expand;
  await _rteAIGeneral(systemPrompt,body,resultEl,'fa-note-rte');
}

function _updateOAuthCard(provider,status){
  const p=provider==='microsoft'?'ms':'google';
  const badge=document.getElementById('oauth-'+p+'-badge');
  const info=document.getElementById('oauth-'+p+'-info');
  const btnConnect=document.getElementById('btn-'+p+'-connect');
  const btnDisconnect=document.getElementById('btn-'+p+'-disconnect');
  const btnCal=document.getElementById('btn-'+p+'-sync-cal');
  const btnMail=document.getElementById('btn-'+p+'-sync-mail');
  const btnContacts=document.getElementById('btn-'+p+'-sync-contacts');
  if(!badge)return;
  const expiryEl=document.getElementById('oauth-'+p+'-expiry');
  const stepsEl=document.getElementById('oauth-'+p+'-steps');
  const guideEl=document.getElementById('oauth-'+p+'-guide');

  // Helper: update step indicator visual state
  function setStep(stepNum,active,done){
    const el=document.getElementById('oauth-'+p+'-step'+stepNum);
    if(!el)return;
    const dot=el.querySelector('span');
    if(!dot)return;
    if(done){dot.style.background='var(--ok)';dot.style.color='#fff';dot.textContent='✓';el.style.color='var(--ok)';}
    else if(active){dot.style.background='var(--ac)';dot.style.color='#fff';dot.textContent=stepNum;el.style.color='var(--t1,#fff)';el.style.fontWeight='600';}
    else{dot.style.background='var(--s3)';dot.style.color='var(--t2)';dot.textContent=stepNum;el.style.color='var(--t3)';el.style.fontWeight='';}
  }

  if(status.connected){
    badge.style.background='var(--ok)';badge.style.color='#fff';badge.textContent='\u2713 Connected';
    if(info){info.style.display='';info.textContent=(status.displayName||'')+' \u00b7 '+(status.email||'');}
    // Token expiry indicator + progress bar
    const barWrap=document.getElementById('oauth-'+p+'-expiry-bar-wrap');
    const barEl=document.getElementById('oauth-'+p+'-expiry-bar');
    const barLabel=document.getElementById('oauth-'+p+'-expiry-label');
    const barDays=document.getElementById('oauth-'+p+'-expiry-days');
    if(expiryEl&&status.expiresAt){
      const expiresAt=new Date(status.expiresAt);
      const diffMs=expiresAt.getTime()-Date.now();
      const diffDays=Math.floor(diffMs/(1000*60*60*24));
      const expiryDateStr=expiresAt.toLocaleString();
      expiryEl.style.display='';
      // Progress bar (90-day token lifetime assumed)
      const TOKEN_LIFETIME_DAYS=90;
      const pct=Math.max(0,Math.min(100,Math.round((diffDays/TOKEN_LIFETIME_DAYS)*100)));
      if(barWrap){barWrap.style.display='';}
      if(barEl){
        barEl.style.width=pct+'%';
        barEl.style.background=diffMs<=0?'#ef4444':diffDays<=7?'#f59e0b':diffDays<=14?'#eab308':'#22c55e';
      }
      if(barLabel){barLabel.textContent='Token validity';}
      if(diffMs<=0){
        expiryEl.style.color='var(--err,#ef4444)';
        expiryEl.innerHTML='<strong>\u26a0 Re-authentication required</strong> \u2014 Token expired on '+expiryDateStr;
        if(barDays){barDays.style.color='#ef4444';barDays.textContent='Expired';}
      } else if(diffDays<1){
        const diffHours=Math.floor(diffMs/(1000*60*60));
        expiryEl.style.color='var(--err,#ef4444)';
        expiryEl.innerHTML='<strong>\u26a0 Re-authentication required</strong> \u2014 Token expires in '+diffHours+'h ('+expiryDateStr+')';
        if(barDays){barDays.style.color='#ef4444';barDays.textContent='<1 day left';}
      } else if(diffDays<=7){
        expiryEl.style.color='var(--warn,#f59e0b)';
        expiryEl.innerHTML='<strong>\u26a0 Re-authentication required soon</strong> \u2014 Expires in '+diffDays+' day'+(diffDays===1?'':'s')+' ('+expiryDateStr+')';
        if(barDays){barDays.style.color='#f59e0b';barDays.textContent=diffDays+' day'+(diffDays===1?'':'s')+' left';}
      } else {
        // Tokens with >7 days left don't need to nag \u2014 hide the row entirely.
        // Only critical (<=7d) and urgent (<24h) statuses still surface.
        if(expiryEl)expiryEl.style.display='none';
        if(barWrap)barWrap.style.display='none';
      }
    } else {
      if(expiryEl)expiryEl.style.display='none';
      if(barWrap)barWrap.style.display='none';
    }
    if(btnConnect)btnConnect.style.display='none';
    if(btnDisconnect)btnDisconnect.style.display='';
    const btnRefresh=document.getElementById('btn-'+p+'-refresh');
    if(btnRefresh)btnRefresh.style.display='';
    const btnTest=document.getElementById('btn-'+p+'-test');
    if(btnTest)btnTest.style.display='';
    if(btnCal)btnCal.style.display='';
    if(btnMail)btnMail.style.display='';
    if(btnContacts)btnContacts.style.display='';
    // Step indicators: all done
    if(stepsEl)stepsEl.style.display='none';
    if(guideEl)guideEl.style.display='none';
    if(btnConnect)btnConnect.style.boxShadow='';
  } else if(status.credentialsConfigured===false){
    // Credentials not set up — show warning badge, disable connect button
    badge.style.background='var(--warn)';badge.style.color='#fff';badge.textContent='⚠ Setup required';
    if(info){info.style.display='';info.textContent='Add Client ID & Secret in Management UI → Settings → Secrets to enable this integration.';}
    if(btnConnect){btnConnect.style.display='';btnConnect.disabled=true;btnConnect.style.opacity='0.4';btnConnect.title='Configure credentials first';}
    if(btnDisconnect)btnDisconnect.style.display='none';
    const btnRefreshSetup=document.getElementById('btn-'+p+'-refresh');
    if(btnRefreshSetup)btnRefreshSetup.style.display='none';
    const btnTestSetup=document.getElementById('btn-'+p+'-test');
    if(btnTestSetup)btnTestSetup.style.display='none';
    if(btnCal)btnCal.style.display='none';
    if(btnMail)btnMail.style.display='none';
    if(btnContacts)btnContacts.style.display='none';
    // Step indicators: step 1 active (save credentials)
    if(stepsEl)stepsEl.style.display='';
    if(guideEl)guideEl.style.display='none';
    setStep(1,true,false);setStep(2,false,false);setStep(3,false,false);
  } else {
    badge.style.background='var(--s3)';badge.style.color='var(--t3)';badge.textContent='Not connected';
    if(info)info.style.display='none';
    if(btnConnect){btnConnect.style.display='';btnConnect.disabled=false;btnConnect.style.opacity='';btnConnect.title='';}
    if(btnDisconnect)btnDisconnect.style.display='none';
    const btnRefreshDisc=document.getElementById('btn-'+p+'-refresh');
    if(btnRefreshDisc)btnRefreshDisc.style.display='none';
    const btnTestDisc=document.getElementById('btn-'+p+'-test');
    if(btnTestDisc)btnTestDisc.style.display=status.hasUserCredentials?'':'none';
    if(btnCal)btnCal.style.display='none';
    if(btnMail)btnMail.style.display='none';
    if(btnContacts)btnContacts.style.display='none';
    // Step indicators: credentials saved → step 2 active (connect); no credentials → step 1 active
    if(stepsEl)stepsEl.style.display='';
    if(status.hasUserCredentials){
      setStep(1,false,true);setStep(2,true,false);setStep(3,false,false);
      // Pulse the Connect button to draw attention
      if(btnConnect)btnConnect.style.boxShadow='0 0 0 3px var(--ac)';
      if(guideEl)guideEl.style.display='';
    } else {
      setStep(1,true,false);setStep(2,false,false);setStep(3,false,false);
      if(btnConnect)btnConnect.style.boxShadow='';
      if(guideEl)guideEl.style.display='none';
    }
  }
  // Show/hide the setup instructions box based on whether any provider still needs credentials
  const setupBox=document.querySelector('#sp-4 [style*="Setup Required"]');
  if(setupBox){
    const msConfigured=document.getElementById('oauth-ms-badge')?.textContent!=='⚠ Setup required';
    const gConfigured=document.getElementById('oauth-google-badge')?.textContent!=='⚠ Setup required';
    (setupBox).style.display=(msConfigured&&gConfigured)?'none':'';
  }
}

async function loadOAuthStatus(){
  try{
    const status=await _trpc('oauthSync.status',undefined,'query');
    if(status){
      _updateOAuthCard('microsoft',status.microsoft);
      _updateOAuthCard('google',status.google);
    }
  }catch(e){
    // Not logged in or server not available — silently ignore
  }
  // Also load per-user credentials and notification sender
  await loadUserCredentials();
  await loadNotificationSenderOptions();
}

/** Load existing per-user credential clientIds (secrets are never returned) */
async function loadUserCredentials(){
  for(const provider of ['microsoft','google']){
    const p=provider==='microsoft'?'ms':'google';
    const statusEl=document.getElementById(p+'-cred-status');
    const idEl=document.getElementById(p+'-cred-id');
    // Remove any previously injected share/verified rows to avoid duplicates
    ['cred-share-row','cred-verified-row'].forEach(id=>{
      const old=document.getElementById(p+'-'+id);
      if(old)old.remove();
    });
    try{
      const cred=await _trpc('oauthSync.getCredentials',{provider},'query');
      if(cred&&statusEl){
        statusEl.style.color='var(--ok)';
        const savedAt=cred.updatedAt?new Date(cred.updatedAt).toLocaleString():'';
        let statusText='✓ Saved — Client ID: '+cred.clientId.slice(0,8)+'…'+(savedAt?' · Last updated: '+savedAt:'');
        if(cred.isSharedFromAdmin)statusText='👥 Shared by admin — Client ID: '+cred.clientId.slice(0,8)+'…';
        statusEl.textContent=statusText;
        if(idEl&&!cred.isSharedFromAdmin)idEl.placeholder='(saved — enter new to replace)';
        // Pre-fill Tenant ID field for Microsoft
        if(provider==='microsoft'&&cred.tenantId){
          const tenantEl=document.getElementById('ms-cred-tenant');
          if(tenantEl&&!tenantEl.value)tenantEl.value=cred.tenantId;
        }
        // Pre-fill scope checkboxes for Microsoft
        if(provider==='microsoft'&&cred.msScopes){
          const savedScopes=cred.msScopes.split(',').map(s=>s.trim());
          const mailCb=document.getElementById('ms-scope-mail');
          const calCb=document.getElementById('ms-scope-calendar');
          const contactsCb=document.getElementById('ms-scope-contacts');
          if(mailCb)mailCb.checked=savedScopes.includes('Mail.ReadWrite')||savedScopes.includes('Mail.Send');
          if(calCb)calCb.checked=savedScopes.includes('Calendars.ReadWrite');
          if(contactsCb)contactsCb.checked=savedScopes.includes('Contacts.ReadWrite');
        }
        // Last verified row
        if(statusEl.parentElement){
          const verRow=document.createElement('div');
          verRow.id=p+'-cred-verified-row';
          verRow.style.cssText='font-size:10px;color:var(--t3);margin-top:2px';
          if(cred.lastVerifiedAt){
            const ago=_timeAgo(new Date(cred.lastVerifiedAt));
            verRow.textContent='✅ Last verified: '+ago;
            verRow.style.color='var(--ok)';
          } else {
            verRow.textContent='Not yet verified — click 🔍 Verify to check your credentials';
          }
          statusEl.parentElement.insertBefore(verRow,statusEl.nextSibling);
        }
        // Admin-only: Share with team toggle
        if(D.creds.role==='Admin'||D.creds.role==='Owner'){
          const credSection=document.getElementById(p+'-cred-section')||statusEl.closest('.cred-section')||statusEl.parentElement?.parentElement;
          if(credSection&&!cred.isSharedFromAdmin){
            const shareRow=document.createElement('div');
            shareRow.id=p+'-cred-share-row';
            shareRow.style.cssText='display:flex;align-items:center;gap:8px;margin-top:6px;padding:6px 8px;background:var(--bg2,rgba(255,255,255,0.04));border-radius:6px;border:1px solid var(--brd)';
            const isShared=!!cred.sharedWithTeam;
            shareRow.innerHTML=`
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;color:var(--t2);flex:1">
                <input type="checkbox" id="${p}-share-toggle" ${isShared?'checked':''} onchange="toggleCredentialSharing('${provider}',this.checked)" style="cursor:pointer">
                <span>👥 Share these credentials with team members who have no own credentials</span>
              </label>
              <span style="font-size:11px;color:var(--t3)">${isShared?'<span style="color:var(--ok)">Shared</span>':'Private'}</span>
            `;
            credSection.appendChild(shareRow);
          }
        }
      } else if(statusEl){
        statusEl.textContent='';
      }
    }catch(e){
      // ignore
    }
    // Always show audit log section and load entries (shows history even when no creds currently saved)
    const auditSection=document.getElementById(p+'-audit-log');
    if(auditSection)auditSection.style.display='';
    await loadCredentialAuditLog(provider);
  }
}

/** Human-readable relative time (e.g. "3 minutes ago") */
function _timeAgo(date){
  const diffMs=Date.now()-date.getTime();
  const secs=Math.floor(diffMs/1000);
  if(secs<60)return secs+' second'+(secs===1?'':'s')+' ago';
  const mins=Math.floor(secs/60);
  if(mins<60)return mins+' minute'+(mins===1?'':'s')+' ago';
  const hrs=Math.floor(mins/60);
  if(hrs<24)return hrs+' hour'+(hrs===1?'':'s')+' ago';
  const days=Math.floor(hrs/24);
  return days+' day'+(days===1?'':'s')+' ago';
}

/** Admin: toggle credential sharing for a provider */
async function toggleCredentialSharing(provider,shared){
  const p=provider==='microsoft'?'ms':'google';
  const statusSpan=document.querySelector('#'+p+'-cred-share-row span:last-child');
  try{
    await _trpc('oauthSync.setCredentialSharing',{provider,shared},'mutation');
    if(statusSpan)statusSpan.innerHTML=shared?'<span style="color:var(--ok)">Shared</span>':'Private';
    toast(shared?'👥 Credentials shared with team':'Credentials set to private');
  }catch(e){
    toast('⚠️ Could not update sharing: '+(e?.message||e));
    // Revert checkbox
    const cb=document.getElementById(p+'-share-toggle');
    if(cb)cb.checked=!shared;
  }
}

/** Load credential audit log for a provider */
async function loadCredentialAuditLog(provider){
  const p=provider==='microsoft'?'ms':'google';
  const entriesEl=document.getElementById(p+'-audit-log-entries');
  if(!entriesEl)return;
  try{
    const entries=await _trpc('oauthSync.getCredentialAuditLog',{provider},'query');
    if(!entries||entries.length===0){
      entriesEl.innerHTML='<div style="padding:4px 0;color:var(--t3);font-style:italic">No activity yet</div>';
      return;
    }
    entriesEl.innerHTML=entries.map((e)=>{
      const when=new Date(e.createdAt).toLocaleString();
      const actionLabel=e.action==='saved'?'✓ Credentials saved':'✕ Credentials cleared';
      const actionColor=e.action==='saved'?'var(--ok)':'var(--err,#ef4444)';
      const by=e.performedByName?(' by '+e.performedByName):'';
      return '<div style="padding:3px 0;border-bottom:1px solid var(--brd);display:flex;justify-content:space-between;gap:8px">'
        +'<span style="color:'+actionColor+'">'+actionLabel+'</span>'
        +'<span style="color:var(--t3)">'+when+by+'</span>'
        +'</div>';
    }).join('');
  }catch(e){
    entriesEl.innerHTML='<div style="color:var(--t3);font-style:italic">Could not load activity</div>';
  }
}
/** Toggle audit log entries visibility */
function toggleAuditLog(provider){
  const p=provider==='microsoft'?'ms':'google';
  const entriesEl=document.getElementById(p+'-audit-log-entries');
  const toggleEl=entriesEl?.previousElementSibling;
  if(!entriesEl)return;
  const isOpen=entriesEl.style.display!=='none';
  entriesEl.style.display=isOpen?'none':'';
  if(toggleEl)toggleEl.textContent=(isOpen?'▶':'▼')+' Recent Activity';
}
/** Silently refresh an OAuth token server-side using the stored refresh token.
 *  When called with silent=true (e.g. from the 60s auto-refresh poll) we
 *  suppress both success and error toasts so the user isn't spammed every
 *  minute with "Failed to refresh token" when the refresh-token itself is
 *  expired. Manual button clicks still show their own status. */
async function refreshOAuthToken(provider, silent){
  const btn=document.getElementById('btn-'+(provider==='microsoft'?'ms':'google')+'-refresh');
  if(btn){btn.disabled=true;btn.textContent='⏳ Refreshing…';}
  try{
    const result=await _trpc('oauthSync.refreshToken',{provider},'mutation');
    if(result?.success){
      if(!silent)toast('✅ Token refreshed successfully');
      // Reload OAuth status to update expiry bar and card
      await loadOAuthStatus();
    } else {
      if(!silent)toast('⚠ '+(result?.message||'Token refresh failed'));
    }
    return !!result?.success;
  }catch(e){
    if(!silent)toast('⚠ '+(e?.message||'Failed to refresh token'));
    return false;
  }finally{
    if(btn){btn.disabled=false;btn.textContent='🔄 Refresh Token';}
  }
}
/** Send a test email using the configured SMTP sender */
async function testEmailSender(){
  const btn=document.getElementById('btn-test-email');
  const statusEl=document.getElementById('notif-sender-status');
  if(btn){btn.disabled=true;btn.textContent='⏳ Sending…';}
  try{
    const result=await _trpc('oauthSync.testEmail',{},'mutation');
    if(result?.success){
      toast('✅ '+result.message);
      if(statusEl){statusEl.style.color='var(--ok)';statusEl.textContent='✓ '+result.message;}
    } else {
      toast('⚠ '+(result?.message||'Test email failed'));
      if(statusEl){statusEl.style.color='var(--err,#ef4444)';statusEl.textContent='✗ '+(result?.message||'Test email failed');}
    }
  }catch(e){
    toast('⚠ '+(e?.message||'Test email failed'));
    if(statusEl){statusEl.style.color='var(--err,#ef4444)';statusEl.textContent='✗ '+(e?.message||'Test email failed');}
  } finally {
    if(btn){btn.disabled=false;btn.textContent='📧 Test Email';}
    // Refresh delivery log after each test
    loadEmailDeliveryLog();
  }
}
/** Load and render the last 5 email delivery log entries */
async function loadEmailDeliveryLog(){
  const el=document.getElementById('email-delivery-log');
  if(!el)return;
  try{
    const entries=await _trpc('oauthSync.getEmailDeliveryLog',undefined,'query');
    if(!entries||!entries.length){
      el.innerHTML='<span style="color:var(--t3);font-style:italic">No emails sent yet.</span>';
      return;
    }
    const statusColor=(s)=>s==='sent'?'var(--ok,#22c55e)':s==='failed'?'var(--err,#ef4444)':'var(--warn,#f59e0b)';
    const statusIcon=(s)=>s==='sent'?'✓':s==='failed'?'✗':'—';
    el.innerHTML=entries.map((e)=>{
      const date=new Date(e.createdAt).toLocaleString();
      const errNote=e.errorMessage?` <span style="color:var(--err,#ef4444)">(${e.errorMessage})</span>`:'';
      return `<div style="display:flex;gap:6px;align-items:flex-start;padding:4px 0;border-bottom:1px solid var(--brd)">
        <span style="color:${statusColor(e.status)};font-weight:700;min-width:12px">${statusIcon(e.status)}</span>
        <div style="flex:1;min-width:0">
          <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--t2)">${e.to}</div>
          <div style="color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.subject}${errNote}</div>
          <div style="color:var(--t3);font-size:11px">${date}</div>
        </div>
      </div>`;
    }).join('');
  }catch{
    el.innerHTML='<span style="color:var(--t3);font-style:italic">Could not load delivery log.</span>';
  }
}
/** Load the Sync settings panel (sp-9) with live provider status and recent sync log */
async function loadSyncPanel(){
  const msStatusEl=document.getElementById('sync-panel-ms-status');
  const googleStatusEl=document.getElementById('sync-panel-google-status');
  const logEl=document.getElementById('sync-panel-log');
  try{
    const status=await _trpc('oauthSync.status',undefined,'query');
    if(msStatusEl){
      if(status?.microsoft?.connected){
        const exp=status.microsoft.expiresAt?new Date(status.microsoft.expiresAt):null;
        const expStr=exp?(' · Token expires '+exp.toLocaleTimeString()):''
        msStatusEl.style.color='var(--ok,#22c55e)';
        msStatusEl.textContent='✓ Connected'+(status.microsoft.email?' as '+status.microsoft.email:'')+expStr;
      } else {
        msStatusEl.style.color='var(--t3)';
        msStatusEl.textContent='Not connected — go to Accounts to connect';
      }
    }
    if(googleStatusEl){
      if(status?.google?.connected){
        googleStatusEl.style.color='var(--ok,#22c55e)';
        googleStatusEl.textContent='✓ Connected'+(status.google.email?' as '+status.google.email:'');
      } else {
        googleStatusEl.style.color='var(--t3)';
        googleStatusEl.textContent='Not connected — go to Accounts to connect';
      }
    }
  }catch{
    if(msStatusEl)msStatusEl.textContent='Could not load status';
  }
  // Load recent sync log from syncStatus
  if(logEl){
    try{
      const syncData=await _trpc('oauthSync.getSyncStatusAll',undefined,'query');
      if(!syncData||!syncData.length){
        logEl.innerHTML='<span style="color:var(--t3);font-style:italic">No sync activity yet. Click Sync All Now to start.</span>';
      } else {
        logEl.innerHTML=syncData.map(s=>{
          const lastSync=s.lastSyncAt?new Date(s.lastSyncAt).toLocaleString():'Never';
          const icon=s.lastStatus==='success'?'✓':s.lastStatus==='error'?'✗':'—';
          const color=s.lastStatus==='success'?'var(--ok,#22c55e)':s.lastStatus==='error'?'var(--err,#ef4444)':'var(--t3)';
          return `<div style="display:flex;gap:6px;align-items:center;padding:3px 0;border-bottom:1px solid var(--brd)">
            <span style="color:${color};font-weight:700;min-width:12px">${icon}</span>
            <div style="flex:1;min-width:0">
              <span style="color:var(--t2)">${s.provider} / ${s.syncType}</span>
              <span style="color:var(--t3);margin-left:6px">${lastSync}</span>
              ${s.itemCount?`<span style="color:var(--t3);margin-left:6px">${s.itemCount} items</span>`:''}
            </div>
          </div>`;
        }).join('');
      }
    }catch{
      logEl.innerHTML='<span style="color:var(--t3);font-style:italic">Could not load sync log.</span>';
    }
  }
}
/** Trigger sync for all connected providers */
async function syncAllProviders(){
  toast('🔄 Syncing all providers…');
  const promises=[];
  try{
    const status=await _trpc('oauthSync.status',undefined,'query');
    if(status?.microsoft?.connected){
      promises.push(syncOAuthCalendar('microsoft').catch(()=>{}));
      promises.push(syncOAuthMail('microsoft').catch(()=>{}));
      promises.push(syncOAuthContacts('microsoft').catch(()=>{}));
    }
    if(status?.google?.connected){
      promises.push(syncOAuthCalendar('google').catch(()=>{}));
      // Google mail sync removed — only Office 365 is supported for mail
    }
    await Promise.all(promises);
    toast('✓ Sync complete');
    loadSyncPanel();
  }catch(e){
    toast('⚠ Sync failed: '+(e?.message||'Unknown error'));
  }
}
/** Check OAuth token expiry, update topbar button state, show Connected-as label, and auto-refresh if <5 min.
 * Button is hidden when healthy, orange within 5 min, red when expired. */
async function checkTokenExpiryBanner(){
  const btn=document.getElementById('topbar-token-refresh');
  const connLabel=document.getElementById('topbar-connected-as');
  if(!btn)return;
  try{
    const status=await _trpc('oauthSync.status',undefined,'query');
    // Connected-as label intentionally hidden — login email is shown in the
    // bottom-left sidebar instead. The Microsoft 365 email is still visible
    // in Settings → Accounts for users who need to see it.
    if(connLabel){connLabel.style.display='none';}
    // Keep the bottom-left sidebar email in sync with the actual login email
    if(typeof updateProfileUI==='function')updateProfileUI();
    const providers=[];
    if(status?.microsoft?.connected&&status.microsoft.expiresAt){
      providers.push({key:'microsoft',label:'Microsoft 365',expiresAt:new Date(status.microsoft.expiresAt)});
    }
    // Find the soonest-expiring provider
    const fiveMinMs=5*60*1000;
    const expiring=providers.filter(p=>p.expiresAt&&(p.expiresAt.getTime()-Date.now())<fiveMinMs)
      .sort((a,b)=>(a.expiresAt.getTime())-(b.expiresAt.getTime()));
    if(!expiring.length){
      btn.style.display='none';
      btn._expiringProvider=null;
      return;
    }
    const soonest=expiring[0];
    const diffMs=soonest.expiresAt.getTime()-Date.now();
    const expired=diffMs<=0;
    // Auto-refresh silently if token is expiring within 5 min (and not already
    // expired). Backoff: if a refresh just failed in the last hour, skip the
    // next try so we don't spam the server (and the user) every minute.
    const lastFailKey='oauth-refresh-fail-'+soonest.key;
    const lastFailTs=Number(sessionStorage.getItem(lastFailKey)||0);
    const oneHourMs=60*60*1000;
    const recentlyFailed=lastFailTs&&(Date.now()-lastFailTs)<oneHourMs;
    if(!expired&&diffMs<fiveMinMs&&!btn._autoRefreshing&&!recentlyFailed){
      btn._autoRefreshing=true;
      try{
        const ok=await refreshOAuthToken(soonest.key,true); // silent=true
        if(ok){sessionStorage.removeItem(lastFailKey);}
        else{sessionStorage.setItem(lastFailKey,String(Date.now()));}
        // Re-check after auto-refresh
        await checkTokenExpiryBanner();
      } catch{
        sessionStorage.setItem(lastFailKey,String(Date.now()));
      } finally{
        btn._autoRefreshing=false;
      }
      return;
    }
    // Button is intentionally hidden and we no longer surface toasts —
    // auto-refresh handles renewal silently, and if a token is genuinely
    // expired, the next AI/sync action will fail loudly enough on its own.
    // We just record the provider so a future refresh attempt can target it.
    btn._expiringProvider=soonest.key;
  }catch{
    // Silently ignore — button is non-critical
  }
}
/** Handle Refresh Token click from the expiry banner (legacy — kept for compat) */
async function handleBannerRefresh(){
  const banner=document.getElementById('token-expiry-banner');
  const provider=(banner)?._expiringProvider;
  if(provider)await refreshOAuthToken(provider);
}
/** Handle Refresh Token click from the topbar button */
async function handleTopbarTokenRefresh(){
  const btn=document.getElementById('topbar-token-refresh');
  const provider=btn?._expiringProvider||'microsoft';
  const origText=btn?btn.innerHTML:'';
  if(btn){btn.disabled=true;btn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Refreshing…';}
  await refreshOAuthToken(provider);
  // Re-check expiry state after refresh
  await checkTokenExpiryBanner();
  if(btn){btn.disabled=false;if(btn.style.display!=='none')btn.innerHTML=origText;}
}
/** Dismiss the expiry banner until tomorrow (legacy) */
function dismissExpiryBanner(){
  const banner=document.getElementById('token-expiry-banner');
  if(!banner){return;}
  const provider=(banner)?._expiringProvider;
  if(provider){
    const tomorrow=Date.now()+24*60*60*1000;
    localStorage.setItem('expiry-banner-dismiss-'+provider,String(tomorrow));
  }
  banner.style.display='none';
}
/** Admin: Check all tokens and send owner notification for expiring ones */
async function adminCheckTokenExpiry(){
  const statusEl=document.getElementById('admin-expiry-status');
  if(statusEl)statusEl.textContent='\u23f3 Checking...';
  try{
    const result=await _trpc('oauthSync.checkAndNotifyExpiry',{},'mutation');
    if(result?.notified){
      if(statusEl){statusEl.style.color='var(--ok)';statusEl.textContent='\u2713 Notified owner about '+result.count+' expiring token'+(result.count===1?'':'s');}
      toast('\u2705 Owner notified about '+result.count+' expiring token'+(result.count===1?'':'s'));
    } else {
      if(statusEl){statusEl.style.color='var(--t3)';statusEl.textContent=result?.reason||'Nothing to notify';}
      toast('\u2139 '+(result?.reason||'No expiring tokens found'));
    }
  }catch(e){
    if(statusEl){statusEl.style.color='var(--err,#ef4444)';statusEl.textContent='\u2717 '+(e?.message||'Error');}
    toast('\u26a0 '+(e?.message||'Check failed'));
  }
}
/** Admin: Load paginated email delivery log with filters */
let _adminLogPage=1;
async function loadAdminDeliveryLog(page=1){
  _adminLogPage=page;
  const el=document.getElementById('admin-delivery-log');
  const pgEl=document.getElementById('admin-log-pagination');
  if(!el)return;
  el.innerHTML='<span style="color:var(--t3);font-style:italic">Loading...</span>';
  const status=(document.getElementById('admin-log-status'))?.value||undefined;
  const fromVal=(document.getElementById('admin-log-from'))?.value;
  const toVal=(document.getElementById('admin-log-to'))?.value;
  const input ={page,pageSize:20};
  if(status)input.status=status;
  if(fromVal)input.from=new Date(fromVal);
  if(toVal){const d=new Date(toVal);d.setHours(23,59,59,999);input.to=d;}
  try{
    const result=await _trpc('oauthSync.getAdminEmailDeliveryLog',input,'query');
    const entries=result?.entries||[];
    const total=result?.total||0;
    if(!entries.length){el.innerHTML='<span style="color:var(--t3);font-style:italic">No entries found.</span>';if(pgEl)pgEl.innerHTML='';return;}
    const statusColor=(s)=>s==='sent'?'var(--ok,#22c55e)':s==='failed'?'var(--err,#ef4444)':'var(--warn,#f59e0b)';
    const statusIcon=(s)=>s==='sent'?'\u2713':s==='failed'?'\u2717':'\u2014';
    el.innerHTML=`<table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="border-bottom:1px solid var(--brd);color:var(--t3)">
        <th style="text-align:left;padding:4px 6px;font-weight:600">Status</th>
        <th style="text-align:left;padding:4px 6px;font-weight:600">To</th>
        <th style="text-align:left;padding:4px 6px;font-weight:600">Subject</th>
        <th style="text-align:left;padding:4px 6px;font-weight:600">User</th>
        <th style="text-align:left;padding:4px 6px;font-weight:600">Time</th>
        <th style="text-align:left;padding:4px 6px;font-weight:600">Error</th>
      </tr></thead>
      <tbody>${entries.map((e)=>{
        const sc=statusColor(e.status);const si=statusIcon(e.status);
        const dt=new Date(e.createdAt).toLocaleString();
        const user=e.userName||(e.userEmail?e.userEmail.split('@')[0]:'System');
        const _err=e.errorMessage?String(e.errorMessage):'';
        const _escFn=(typeof esc==='function')?esc:(s=>String(s||''));
        const errTip=_err?' title="'+_err.replace(/"/g,'&quot;')+'"':'';
        return `<tr style="border-bottom:1px solid var(--brd)" ${errTip}>
          <td style="padding:4px 6px;color:${sc};font-weight:700">${si} ${e.status}</td>
          <td style="padding:4px 6px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.to}</td>
          <td style="padding:4px 6px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.subject}</td>
          <td style="padding:4px 6px;color:var(--t3)">${user}</td>
          <td style="padding:4px 6px;color:var(--t3);white-space:nowrap">${dt}</td>
          <td style="padding:4px 6px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${e.status==='sent'?'var(--t3)':'var(--err,#ef4444)'}"${errTip}>${_escFn(_err)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
    // Pagination
    if(pgEl){
      const totalPages=Math.ceil(total/20);
      const start=(page-1)*20+1;const end=Math.min(page*20,total);
      pgEl.innerHTML=`<span style="color:var(--t3)">${start}-${end} of ${total}</span>
        <button class="btn btn-s" style="height:24px;font-size:11px;padding:0 8px" ${page<=1?'disabled':''} onclick="loadAdminDeliveryLog(${page-1})">\u2190</button>
        <span style="color:var(--t3)">Page ${page}/${totalPages}</span>
        <button class="btn btn-s" style="height:24px;font-size:11px;padding:0 8px" ${page>=totalPages?'disabled':''} onclick="loadAdminDeliveryLog(${page+1})">\u2192</button>`;
    }
  }catch(e){
    el.innerHTML='<span style="color:var(--err,#ef4444)">\u2717 '+(e?.message||'Failed to load log')+'</span>';
  }
}
async function testOAuthConnection(provider){
  const btnId = provider === 'microsoft' ? 'btn-ms-test' : 'btn-google-test';
  const btn = document.getElementById(btnId);
  const origText = btn ? btn.textContent : '';
  if(btn){ btn.disabled=true; btn.textContent='Testing...'; }
  try{
    const res = await _trpc('oauthSync.testOAuthConnection',{provider},'mutation');
    // _trpc already unwraps the result — res is { success, provider, displayName, email }
    const label = provider==='microsoft'?'Microsoft 365':'Google Workspace';
    toast('✓ Connected as '+(res?.displayName||res?.email||'unknown')+' via '+label,'success');
  }catch(e){
    const msg = e.message||'';
    if(msg.includes('No ')&&msg.includes('token found')){
      toast('Not connected yet — click "Connect" to authorise this provider first','error');
    } else if(msg.includes('expired')){
      toast('Token expired — click "Refresh Token" to re-authorise','error');
    } else {
      toast('Test failed: '+msg,'error');
    }
  }
  finally{ if(btn){ btn.disabled=false; btn.textContent=origText; } }
}

async function testIntegrationCred(prefix, title){
  // Read the saved API key from the credential card
  const keyInput = document.querySelector('[data-prefix="'+prefix+'"] .cred-key-input, #cred-'+prefix+'-key');
  const apiKey = keyInput ? keyInput.value.trim() : '';
  if(!apiKey){ toast('Enter an API key first','error'); return; }
  const btn = event.currentTarget;
  const origText = btn.textContent;
  btn.disabled=true; btn.textContent='Testing...';
  try{
    const res = await _trpc('oauthSync.testIntegration',{integration: prefix, apiKey},'mutation');
    // _trpc already unwraps the result — res is { success, integration, username?, name?, email? }
    const who = res?.username || res?.name || res?.email || 'OK';
    toast(title+' connected — '+who,'success');
  }catch(e){ toast(title+' test failed: '+e.message,'error'); }
  finally{ btn.disabled=false; btn.textContent=origText; }
}

async function saveLogRetentionDays(){
  const input = document.getElementById('admin-retention-days');
  const status = document.getElementById('admin-retention-status');
  const days = parseInt(input?.value||'90',10);
  if(isNaN(days)||days<7||days>3650){ toast('Enter a value between 7 and 3650','error'); return; }
  const btn = event.currentTarget;
  const origText = btn.textContent;
  btn.disabled=true; btn.textContent='Saving...';
  if(status) status.textContent='';
  try{
    await _trpc('oauthSync.setLogRetentionDays',{days},'mutation');
    toast('Retention period saved: '+days+' days','success');
    if(status) status.textContent='Saved: '+days+' days';
  }catch(e){ toast('Failed: '+e.message,'error'); }
  finally{ btn.disabled=false; btn.textContent=origText; }
}

async function loadLogRetentionDays(){
  const input = document.getElementById('admin-retention-days');
  const status = document.getElementById('admin-retention-status');
  if(!input) return;
  try{
    const res = await _trpc('oauthSync.getLogRetentionDays',{},'query');
    // _trpc already unwraps the result — res is { days: number }
    if(res?.days !== undefined){
      input.value = String(res.days);
      if(status) status.textContent = 'Current: '+res.days+' days';
    }
  }catch(e){ /* silent */ }
}

async function adminSendExpiryEmails(){
  const statusEl=document.getElementById('admin-expiry-email-status');
  const btn=event.currentTarget;
  const ok=await showConfirmModal(
    'Send Expiry Warning Emails',
    'This will send a direct email to every user whose OAuth token expires within 7 days. Idempotent \u2014 will not send duplicates if already sent today. Continue?',
    'Send Emails','Cancel'
  );
  if(!ok)return;
  btn.disabled=true;
  if(statusEl){statusEl.style.color='var(--t3)';statusEl.textContent='Sending\u2026';}
  try{
    const result=await _trpc('oauthSync.notifyExpiringTokensPerUser',{},'mutation');
    if(result&&result.alreadySent){
      if(statusEl){statusEl.style.color='var(--t3)';statusEl.textContent='\u2139 Already sent today';}
      toast('\u2139 Expiry emails already sent today');
    } else if(result&&result.count===0){
      if(statusEl){statusEl.style.color='var(--t3)';statusEl.textContent='\u2713 No tokens expiring within 7 days';}
      toast('\u2713 No tokens expiring \u2014 no emails sent');
    } else {
      const c=result&&result.count!=null?result.count:0;
      if(statusEl){statusEl.style.color='var(--ok)';statusEl.textContent='\u2713 Sent to '+c+' user'+(c===1?'':'s');}
      toast('\u2705 Expiry emails sent to '+c+' user'+(c===1?'':'s'));
    }
  }catch(e){
    if(statusEl){statusEl.style.color='var(--err)';statusEl.textContent='\u2717 '+(e.message||'Error');}
    toast('\u274c Failed: '+(e.message||'Unknown error'));
  }finally{
    btn.disabled=false;
  }
}
async function loadScheduledTaskLog(){
  const el=document.getElementById('admin-task-log');
  if(!el)return;
  el.textContent='Loading\u2026';
  try{
    const rows=await _trpc('oauthSync.getScheduledTaskLog',{limit:20},'query');
    if(!rows||rows.length===0){el.innerHTML='<em style="color:var(--t3)">No runs recorded yet.</em>';return;}
    const fmt=function(ts){return ts?new Date(ts).toLocaleString():'\u2014';};
    const dur=function(ms){return ms!=null?(ms<1000?ms+'ms':(ms/1000).toFixed(1)+'s'):'\u2014';};
    const statusBadge=function(err){return err?'<span style="color:var(--err);font-weight:600">\u2717 Error</span>':'<span style="color:var(--ok);font-weight:600">\u2713 OK</span>';};
    let html='<table style="width:100%;border-collapse:collapse;font-size:11px">';
    html+='<tr style="color:var(--t2);border-bottom:1px solid var(--brd)"><th style="text-align:left;padding:3px 6px">Time</th><th style="text-align:left;padding:3px 6px">Task</th><th style="padding:3px 6px">Status</th><th style="padding:3px 6px">Emails</th><th style="padding:3px 6px">Owner</th><th style="padding:3px 6px">Duration</th></tr>';
    for(var i=0;i<rows.length;i++){
      var r=rows[i];
      html+='<tr style="border-bottom:1px solid var(--brd)">';
      html+='<td style="padding:3px 6px;color:var(--t2)">'+fmt(r.ranAt)+'</td>';
      html+='<td style="padding:3px 6px">'+r.taskName+'</td>';
      html+='<td style="padding:3px 6px;text-align:center">'+statusBadge(r.error)+'</td>';
      html+='<td style="padding:3px 6px;text-align:center">'+(r.emailsSent||0)+'</td>';
      html+='<td style="padding:3px 6px;text-align:center">'+(r.ownerNotified?'\u2713':'\u2014')+'</td>';
      html+='<td style="padding:3px 6px;text-align:center">'+dur(r.durationMs)+'</td>';
      html+='</tr>';
      if(r.error){
        html+='<tr><td colspan="6" style="padding:2px 6px 6px;color:var(--err);font-size:11px">'+r.error+'</td></tr>';
      }
    }
    html+='</table>';
    el.innerHTML=html;
  }catch(e){
    el.innerHTML='<span style="color:var(--err)">\u2717 '+(e.message||'Failed to load')+'</span>';
  }
}
function clearAdminLogFilters(){
  const s=document.getElementById('admin-log-status');
  const f=document.getElementById('admin-log-from');
  const t=document.getElementById('admin-log-to');
  if(s)s.value='';
  if(f)f.value='';
  if(t)t.value='';
  loadAdminDeliveryLog(1);
}
/** Populate the redirect URI display spans in the credentials card */
function populateRedirectUris(){
  const msEl=document.getElementById('ms-redirect-uri');
  const gEl=document.getElementById('google-redirect-uri');
  if(msEl)msEl.textContent=window.location.origin+'/api/oauth/microsoft/callback';
  if(gEl)gEl.textContent=window.location.origin+'/api/oauth/google/callback';
}

/** Save per-user OAuth app credentials */
async function saveOAuthCredentials(provider){
  const p=provider==='microsoft'?'ms':'google';
  const idEl=document.getElementById(p+'-cred-id');
  const secretEl=document.getElementById(p+'-cred-secret');
  const tenantEl=provider==='microsoft'?document.getElementById('ms-cred-tenant'):null;
  const statusEl=document.getElementById(p+'-cred-status');
  const clientId=(idEl?.value||'').trim();
  const clientSecret=(secretEl?.value||'').trim();
  const tenantId=(tenantEl?.value||'').trim()||undefined;
  // Collect selected Microsoft Graph scopes
  let msScopes=undefined;
  if(provider==='microsoft'){
    const scopeParts=[];
    const mailCb=document.getElementById('ms-scope-mail');
    const calCb=document.getElementById('ms-scope-calendar');
    const contactsCb=document.getElementById('ms-scope-contacts');
    if(mailCb?.checked)scopeParts.push('Mail.ReadWrite','Mail.Send');
    if(calCb?.checked)scopeParts.push('Calendars.ReadWrite');
    if(contactsCb?.checked)scopeParts.push('Contacts.ReadWrite');
    msScopes=scopeParts.length?scopeParts.join(','):undefined;
  }
  if(!clientId||!clientSecret){toast('\u26a0\ufe0f Enter both Client ID and Client Secret');return;}
  try{
    await _trpc('oauthSync.saveCredentials',{provider,clientId,clientSecret,tenantId,msScopes},'mutation');
    if(statusEl){statusEl.style.color='var(--ok)';statusEl.textContent='✓ Saved successfully';}
    if(secretEl)secretEl.value='';
    toast('✓ '+provider+' credentials saved'+(tenantId?' (Tenant: '+tenantId.slice(0,8)+'…)':''));
    // Refresh status so Connect button activates
    await loadOAuthStatus();
    // Reload audit log
    await loadCredentialAuditLog(provider);
    const auditSection=document.getElementById(p+'-audit-log');
    if(auditSection)auditSection.style.display='';
  }catch(e){
    toast('⚠️ '+e.message);
  }
}

/** Delete per-user OAuth app credentials */
async function deleteOAuthCredentials(provider){
  if(!confirm('Remove your saved '+provider+' credentials?'))return;
  const p=provider==='microsoft'?'ms':'google';
  const statusEl=document.getElementById(p+'-cred-status');
  try{
    await _trpc('oauthSync.deleteCredentials',{provider},'mutation');
    if(statusEl){statusEl.style.color='var(--t3)';statusEl.textContent='Credentials removed';}
    toast('✓ '+provider+' credentials removed');
    await loadOAuthStatus();
    // Reload audit log
    await loadCredentialAuditLog(provider);
    const auditSection=document.getElementById(p+'-audit-log');
    if(auditSection)auditSection.style.display='';
  }catch(e){
    toast('⚠️ '+e.message);
  }
}

/** Load and apply the user's email notification preferences to the toggle UI */
async function loadEmailNotifPrefs(){
  const statusEl=document.getElementById('email-notif-prefs-status');
  try{
    const prefs=await _trpc('oauthSync.getEmailNotifPrefs',undefined,'query');
    if(!prefs)return;
    const expiryTog=document.getElementById('tog-email-expiry');
    const digestTog=document.getElementById('tog-email-digest');
    // Toggle is 'on' when NOT opted out (i.e. subscribed)
    if(expiryTog){
      expiryTog.classList.toggle('on',!prefs.optOutExpiryEmails);
    }
    if(digestTog){
      digestTog.classList.toggle('on',!prefs.optOutDigestEmails);
    }
    if(statusEl)statusEl.textContent='';
  }catch(e){
    if(statusEl){statusEl.style.color='var(--err)';statusEl.textContent='Could not load preferences: '+e.message;}
  }
}

/** Toggle an email notification preference and save it to the server */
async function toggleEmailNotifPref(field,togEl){
  const statusEl=document.getElementById('email-notif-prefs-status');
  const isCurrentlyOn=togEl.classList.contains('on');
  // Toggle the visual state immediately (optimistic)
  togEl.classList.toggle('on');
  const newSubscribed=togEl.classList.contains('on');
  const optOut=!newSubscribed;
  try{
    await _trpc('oauthSync.setEmailNotifPrefs',{[field]:optOut},'mutation');
    const label=field==='optOutExpiryEmails'?'Expiry emails':'Digest emails';
    toast((newSubscribed?'✓ '+label+' enabled':'🔕 '+label+' disabled'),'info');
    if(statusEl)statusEl.textContent='';
  }catch(e){
    // Revert on error
    togEl.classList.toggle('on',isCurrentlyOn);
    if(statusEl){statusEl.style.color='var(--err)';statusEl.textContent='Failed to save: '+e.message;}
    toast('⚠️ Failed to save preference: '+e.message,'error');
  }
}

/** Verify OAuth app credentials (client ID + secret) without completing the full OAuth flow */
async function verifyOAuthCredentials(provider){
  const p=provider==='microsoft'?'ms':'google';
  const idEl=document.getElementById(p+'-cred-id');
  const secretEl=document.getElementById(p+'-cred-secret');
  const statusEl=document.getElementById(p+'-verify-status');
  const btn=document.getElementById('btn-'+p+'-verify-creds');
  const clientId=(idEl?.value||'').trim();
  const clientSecret=(secretEl?.value||'').trim();
  if(!clientId||!clientSecret){
    if(statusEl){statusEl.style.color='var(--warn)';statusEl.textContent='⚠ Enter Client ID and Client Secret to verify';}
    return;
  }
  if(btn){btn.disabled=true;btn.textContent='Verifying…';}
  if(statusEl){statusEl.style.color='var(--t3)';statusEl.textContent='Checking with '+provider+'…';}
  try{
    // Pass tenantId for Microsoft so validation uses the correct tenant endpoint
    const params={provider,clientId,clientSecret};
    if(provider==='microsoft'){
      const tenantEl=document.getElementById('ms-cred-tenant');
      if(tenantEl&&tenantEl.value.trim())params.tenantId=tenantEl.value.trim();
    }
    const res=await _trpc('oauthSync.validateCredentials',params,'mutation');
    if(res.valid){
      if(statusEl){statusEl.style.color='var(--ok)';statusEl.textContent='✓ Credentials accepted by '+(provider==='microsoft'?'Microsoft':'Google');}
      toast('✓ '+provider+' credentials are valid','success');
      // Update the Last verified row to show 'just now'
      const verRow=document.getElementById(p+'-cred-verified-row');
      if(verRow){verRow.textContent='✅ Last verified: just now';verRow.style.color='var(--ok)';}
    } else {
      const errMsg=res.error||'Invalid credentials';
      if(statusEl){statusEl.style.color='var(--red)';statusEl.textContent='✗ '+errMsg;}
      toast('✗ Credentials rejected: '+errMsg,'error');
    }
  }catch(e){
    if(statusEl){statusEl.style.color='var(--red)';statusEl.textContent='✗ Verification failed: '+(e.message||'Unknown error');}
    toast('✗ Verification failed: '+(e.message||'Unknown error'),'error');
  }
  if(btn){btn.disabled=false;btn.textContent='🔍 Verify';}
}

/** Data Migration Health (admin) — Step 3 readiness check, strictly read-only.
    Queries the {tasks,notes,ideas}RelationalStatus endpoints and shows which
    store served the last appData.load (captured in window._luLoadSources). */
async function loadMigrationHealth(){
  const body=document.getElementById('migration-health-body');
  if(!body)return;
  body.innerHTML='Checking…';
  const rows=[];
  for(const ent of ['tasks','notes','ideas']){
    try{
      const r=await _trpc('appData.'+ent+'RelationalStatus',undefined,'query');
      const ok=!!(r&&r.ok&&r.consistent);
      rows.push({ent,ok,detail:(r&&r.ok)?('table '+r.tableCount+' / blob '+r.blobCount):'endpoint unavailable'});
    }catch(e){rows.push({ent,ok:false,detail:'error: '+String(e&&e.message||e).slice(0,60)});}
  }
  const src=window._luLoadSources||null;
  const srcCell=ent=>{
    const v=src?String(src[ent]||'?'):'?';
    const good=v==='relational';
    return `<span style="color:${good?'var(--ok)':'var(--warn)'};font-weight:600">${esc(v)}</span>`;
  };
  const allOk=rows.every(r=>r.ok)&&!!src&&['tasks','notes','ideas'].every(k=>src[k]==='relational');
  body.innerHTML=`
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <tr style="color:var(--t3);text-align:left"><th style="padding:3px 6px">Entity</th><th style="padding:3px 6px">Counts</th><th style="padding:3px 6px">Consistent</th><th style="padding:3px 6px">Served from (last load)</th></tr>
      ${rows.map(r=>`<tr style="border-top:1px solid var(--bd1)"><td style="padding:3px 6px;font-weight:600">${r.ent}</td><td style="padding:3px 6px">${esc(r.detail)}</td><td style="padding:3px 6px">${r.ok?'<span style="color:var(--ok)">✓ consistent</span>':'<span style="color:var(--red)">✗</span>'}</td><td style="padding:3px 6px">${srcCell(r.ent)}</td></tr>`).join('')}
    </table>
    <div style="margin-top:8px;padding:7px 9px;border-radius:6px;background:${allOk?'var(--oks)':'var(--warns)'};color:${allOk?'var(--ok)':'var(--warn)'};font-size:11px;font-weight:600">
      ${allOk?'✓ All checks green — Step 3 (retiring the blob columns) is safe to schedule. Take a DB backup of user_app_data first; the column drop is irreversible.':'⚠ Not ready — at least one check is not green. Do NOT retire the blob columns yet.'}
    </div>
    ${src&&src.at?`<div style="margin-top:4px;font-size:10px;color:var(--t3)">Load sources captured ${esc(src.at)}</div>`:'<div style="margin-top:4px;font-size:10px;color:var(--t3)">Load sources not captured yet — reload the app once on this build, then re-check.</div>'}
  `;
}

/** Load notification sender options (admin only) */
async function loadNotificationSenderOptions(){
  const section=document.getElementById('notif-sender-section');
  const sel=document.getElementById('notif-sender-select');
  if(!section||!sel)return;
  try{
    const data=await _trpc('oauthSync.getNotificationSenderOptions',undefined,'query');
    if(!data)return;
    // Show section for admins (+ the Migration Health panel, same gating)
    section.style.display='';
    const mh=document.getElementById('migration-health-section');
    if(mh)mh.style.display='';
    // Rebuild options
    sel.innerHTML='<option value="">— Use built-in notification service —</option>';
    const labels={microsoft:'Microsoft 365',google:'Google',smtp:'Secondary email (SMTP)'};
    (data.accounts||[]).forEach((acc)=>{
      const key=acc.provider+':'+acc.userId;
      const opt=document.createElement('option');
      opt.value=key;
      opt.textContent=(labels[acc.provider]||acc.provider)+' — '+(acc.email||acc.displayName||acc.userId);
      if(data.current===key)opt.selected=true;
      sel.appendChild(opt);
    });
  }catch(e){
    // Not admin — keep section hidden
  }
}

/** Save notification sender selection (admin only) */
async function saveNotificationSender(){
  const sel=document.getElementById('notif-sender-select');
  const statusEl=document.getElementById('notif-sender-status');
  const senderKey=sel?.value||'';
  try{
    await _trpc('oauthSync.setNotificationSender',{senderKey},'mutation');
    if(statusEl){statusEl.style.color='var(--ok)';statusEl.textContent='✓ Saved';}
    toast('✓ Notification sender updated');
  }catch(e){
    toast('⚠️ '+e.message);
  }
}

async function connectOAuth(provider){
  try{
    const origin=window.location.origin;
    // Pass current tenantId from UI so backend uses it even if user forgot to re-save
    const params={provider,origin};
    if(provider==='microsoft'){
      const tenantEl=document.getElementById('ms-cred-tenant');
      if(tenantEl&&tenantEl.value.trim())params.tenantId=tenantEl.value.trim();
    }
    const data=await _trpc('oauthSync.getAuthUrl',params,'query');
    if(data?.url)window.location.href=data.url;
    else toast('⚠️ Could not generate auth URL. Check your OAuth credentials in Settings → Integrations.');
  }catch(e){
    toast('⚠️ '+e.message);
  }
}

async function disconnectOAuth(provider){
  // Show confirmation modal instead of native confirm()
  const providerLabel=provider==='microsoft'?'Microsoft 365':'Google Workspace';
  const confirmed=await showConfirmModal(
    'Disconnect '+providerLabel+'?',
    'Your synced calendar, mail, and contacts data will stop updating. You can reconnect at any time from Settings → Accounts.',
    'Disconnect',
    'Cancel'
  );
  if(!confirmed)return;
  try{
    await _trpc('oauthSync.disconnect',{provider},'mutation');
    _updateOAuthCard(provider,{connected:false});
    toast('✓ '+providerLabel+' disconnected');
  }catch(e){
    toast('⚠️ '+e.message);
  }
}
/** Generic confirmation modal. Returns a Promise<boolean>. */
function showConfirmModal(title,message,confirmLabel='Confirm',cancelLabel='Cancel'){
  return new Promise(resolve=>{
    // Remove any existing modal
    document.getElementById('confirm-modal-overlay')?.remove();
    const overlay=document.createElement('div');
    overlay.id='confirm-modal-overlay';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
    overlay.innerHTML=`
      <div style="background:var(--s2);border:1px solid var(--brd);border-radius:12px;padding:24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.4)">
        <div style="font-size:15px;font-weight:700;margin-bottom:8px;color:var(--t1)">${title}</div>
        <p style="font-size:12px;color:var(--t3);margin-bottom:20px;line-height:1.6">${message}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="cm-cancel" class="btn" style="font-size:12px;padding:6px 16px">${cancelLabel}</button>
          <button id="cm-confirm" class="btn btn-d" style="font-size:12px;padding:6px 16px">${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const cleanup=(result)=>{overlay.remove();resolve(result);};
    document.getElementById('cm-confirm').onclick=()=>cleanup(true);
    document.getElementById('cm-cancel').onclick=()=>cleanup(false);
    overlay.addEventListener('click',e=>{if(e.target===overlay)cleanup(false);});
  });
}

async function syncCalendarO365(btn){
  if(btn){btn.disabled=true;btn.textContent='⏳ Syncing...';}
  try{
    await syncOAuthCalendar('microsoft');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='☁ Sync O365';}
  }
}

async function syncOAuthCalendar(provider){
  toast('⏳ Syncing '+provider+' calendar...');
  try{
    const result=await _trpc('oauthSync.syncCalendar',{provider,daysAhead:30},'mutation');
    const events=result?.events||[];
    if(!events.length){toast('No upcoming events found.');return;}
    // After sync, load DB events to get their numeric IDs
    let dbEvents=[];
    try{dbEvents=await _trpc('oauthSync.getCalendarEventsFromDB',null,'query');}catch(e){}
    // Merge into _calEvents
    let added=0;
    events.forEach(ev=>{
      const d=new Date(ev.start);
      const dateStr=d.toISOString().slice(0,10);
      const hour=d.getHours();
      const endD=new Date(ev.end);
      const endHour=endD.getHours()||hour+1;
      const exists=_calEvents.find(e=>e.title===ev.title&&e.dateStr===dateStr);
      if(!exists){
        // Try to find DB ID for this event
        const dbEv=dbEvents.find(d=>d.title===ev.title&&new Date(d.start).toISOString().slice(0,10)===dateStr);
        _calEvents.push({id:Date.now()+Math.random(),dbId:dbEv?.id||null,title:ev.title,dateStr,hour,endHour,color:'var(--ac)',desc:ev.notes,location:ev.location,source:provider,isAllDay:ev.isAllDay||0,recurrence:dbEv?.recurrence||'none'});
        added++;
      }
    });
    localStorage.setItem('lu_cal_events',JSON.stringify(_calEvents));
    renderCal();
    toast('✓ Synced '+added+' new events from '+provider);
  }catch(e){
    toast('⚠️ '+e.message);
  }
}

async function syncOAuthMail(provider){
  toast('⏳ Syncing '+provider+' mail...');
  try{
    const result=await _trpc('oauthSync.syncMail',{provider,limit:20},'mutation');
    const messages=result?.messages||[];
    if(!messages.length){toast('No messages found.');return;}
    // Merge into D.mail.inbox
    if(!D.mail)D.mail={inbox:[],sent:[],drafts:[]};
    if(!D.mail.inbox)D.mail.inbox=[];
    let added=0;
    messages.forEach(m=>{
      if(!m)return;
      const exists=D.mail.inbox.find(x=>x.subject===m.subject&&x.from===m.from);
      if(!exists){
        D.mail.inbox.push({id:Date.now()+Math.random(),from:m.from,fromEmail:m.fromEmail,subject:m.subject,preview:m.preview,date:m.date,read:m.read,body:m.preview,source:provider});
        added++;
      }
    });
    save('mail');
    if(typeof renderMail==='function')renderMail();
    toast('✓ Synced '+added+' new messages from '+provider);
  }catch(e){
    toast('⚠️ '+e.message);
  }
}

// Original "import everything" path — kept for backward compatibility with
// callers that batch-sync silently (e.g. the post-OAuth bulk sync). For the
// human-driven Settings/Contacts buttons, openContactsImportPicker provides
// a selective UI.
async function syncOAuthContacts(provider){
  toast('⏳ Syncing '+provider+' contacts...');
  try{
    const result=await _trpc('oauthSync.syncContacts',{provider,limit:200},'mutation');
    const contacts=result?.contacts||[];
    if(!contacts.length){toast('No contacts found.');return;}
    if(!D.contacts)D.contacts=[];
    let added=0;
    contacts.forEach(c=>{
      if(!c.name&&!c.email)return;
      const exists=D.contacts.find(x=>x.email&&x.email===c.email);
      if(!exists){
        D.contacts.push({id:Date.now()+Math.random(),name:c.name,email:c.email,phone:c.phone,title:c.title,company:c.company,tags:[provider],notes:'',enriched:false});
        added++;
      }
    });
    save('contacts');
    if(typeof renderContacts==='function')renderContacts();
    toast('✓ Synced '+added+' new contacts from '+provider);
  }catch(e){
    toast('⚠️ '+e.message);
  }
}

// Selective import: pulls up to 200 contacts from the provider, shows a
// checkbox modal with search + select-all, and imports only what the user
// picks. Skips contacts whose email already exists locally (marked dim).
async function openContactsImportPicker(provider){
  toast('⏳ Loading '+provider+' contacts (this can take a few seconds for large address books)…');
  try{
    // Server paginates through all pages up to this cap.
    const result=await _trpc('oauthSync.syncContacts',{provider,limit:5000},'mutation');
    const contacts=(result?.contacts||[]).filter(c=>c.name||c.email);
    if(!contacts.length){toast('No contacts found.');return;}
    if(result?.truncated){
      toast({type:'info',title:`Loaded first ${contacts.length} contacts`,msg:'Your address book has more than the import cap. Import these first, then re-run to fetch the next batch.',duration:6000});
    }
    const existingEmails=new Set((D.contacts||[]).filter(c=>c.email).map(c=>c.email.toLowerCase()));
    window._ciList=contacts;window._ciProvider=provider;window._ciExisting=existingEmails;
    const m=document.getElementById('modal-content');
    m.innerHTML=`
      <h2 style="font-size:15px;font-weight:600;margin-bottom:6px">📥 Import Contacts from ${provider==='microsoft'?'Microsoft 365':'Google'}</h2>
      <div style="font-size:11px;color:var(--t2);margin-bottom:8px">Select which contacts to add. Already-imported entries (matched by email) are dimmed and unchecked.</div>
      <div style="display:flex;gap:6px;margin-bottom:8px;align-items:center">
        <input id="ci-search" class="inp" placeholder="🔍 Filter by name or email..." style="flex:1;font-size:11px;height:28px" oninput="_renderContactsImportList()">
        <button class="btn btn-s" style="height:28px;font-size:11px" onclick="_ciToggleAll(true)">Select all</button>
        <button class="btn btn-s" style="height:28px;font-size:11px" onclick="_ciToggleAll(false)">None</button>
      </div>
      <div id="ci-list" style="max-height:380px;overflow-y:auto;border:1px solid var(--bd1);border-radius:6px"></div>
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
        <button class="btn btn-s" onclick="closeModal()">Cancel</button>
        <button class="btn btn-p" onclick="_doSelectiveContactsImport()">📥 Import Selected</button>
      </div>`;
    document.getElementById('modal-capture').classList.add('show');
    _renderContactsImportList();
  }catch(e){
    toast('⚠️ '+e.message);
  }
}
function _renderContactsImportList(){
  const q=(document.getElementById('ci-search')?.value||'').toLowerCase();
  const list=window._ciList||[];
  const existing=window._ciExisting||new Set();
  const filtered=list.map((c,i)=>({...c,_idx:i})).filter(c=>{
    if(!q)return true;
    return (c.name||'').toLowerCase().includes(q)||(c.email||'').toLowerCase().includes(q)||(c.company||'').toLowerCase().includes(q);
  });
  const el=document.getElementById('ci-list');if(!el)return;
  if(!filtered.length){el.innerHTML='<div style="padding:14px;text-align:center;color:var(--t3);font-size:11px">No matches</div>';return;}
  el.innerHTML=filtered.map(c=>{
    const dup=c.email&&existing.has(c.email.toLowerCase());
    const initials=(c.name||c.email||'?').split(/\s+/).map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
    return `<label style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-bottom:1px solid var(--bd1);cursor:pointer;${dup?'opacity:.5':''}">
      <input type="checkbox" data-idx="${c._idx}" ${dup?'':'checked'} ${dup?'disabled':''} style="accent-color:var(--ac)">
      <div style="width:28px;height:28px;border-radius:50%;background:var(--s3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex-shrink:0">${esc(initials)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--t1)">${esc(c.name||'(no name)')}${dup?' <span style=\"font-size:11px;color:var(--t3);font-weight:400\">— already imported</span>':''}</div>
        <div style="font-size:11px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.email||'')}${c.title||c.company?' · '+esc([c.title,c.company].filter(Boolean).join(', ')):''}</div>
      </div>
    </label>`;
  }).join('');
}
function _ciToggleAll(check){
  document.querySelectorAll('#ci-list input[type=checkbox]:not([disabled])').forEach(cb=>{cb.checked=!!check;});
}
function _doSelectiveContactsImport(){
  const list=window._ciList||[];
  const provider=window._ciProvider||'microsoft';
  const picks=[...document.querySelectorAll('#ci-list input[type=checkbox]:checked:not([disabled])')]
    .map(cb=>list[Number(cb.dataset.idx)]).filter(Boolean);
  if(!picks.length){toast('Nothing selected');return;}
  if(!D.contacts)D.contacts=[];
  let added=0;
  picks.forEach(c=>{
    const exists=D.contacts.find(x=>x.email&&c.email&&x.email.toLowerCase()===c.email.toLowerCase());
    if(exists)return;
    D.contacts.push({id:Date.now()+Math.random(),name:c.name||'',email:c.email||'',phone:c.phone||'',title:c.title||'',company:c.company||'',tags:[provider],notes:'',enriched:false});
    added++;
  });
  save('contacts');
  closeModal();
  if(typeof renderContacts==='function')renderContacts();
  toast('✓ Imported '+added+' contact'+(added===1?'':'s')+' from '+provider);
}

// Check for OAuth success/error query params on page load
// Store them before the IIFE cleans the URL so doLoginSuccess can use them
window._pendingOAuthSuccess=null;
window._pendingOAuthError=null;
window._pendingOAuthErrorDetail=null;
(function(){
  const p=new URLSearchParams(window.location.search);
  const success=p.get('oauth_success');
  const error=p.get('oauth_error');
  const msErr=p.get('ms_err');
  const detail=p.get('detail'); // Nifty callbacks use ?detail=...
  if(success){window._pendingOAuthSuccess=success;history.replaceState(null,'',window.location.pathname);}
  if(error){window._pendingOAuthError=error;if(msErr)window._pendingOAuthErrorDetail=msErr;else if(detail)window._pendingOAuthErrorDetail=detail;history.replaceState(null,'',window.location.pathname);}
})();

// ====== TOUR ENGINE ======
function launchTour(tourId){
  const tour=HC_TOURS.find(t=>t.id===tourId);
  if(!tour)return;
  _activeTour={tourId,stepIdx:0,paused:false};
  _tourOverlayActive=true;
  closeHelpDrawer();
  if(_helpArticleId!==null){_helpArticleId=null;}
  showTourStep();
}

function showTourStep(){
  if(!_activeTour)return;
  const tour=HC_TOURS.find(t=>t.id===_activeTour.tourId);
  if(!tour)return;
  const step=tour.steps[_activeTour.stepIdx];
  if(!step){completeTour();return;}

  const overlay=$('tour-overlay');
  if(!overlay)return;
  overlay.style.display='block';

  // Update tooltip content
  const stepLabel=$('tour-step-label');
  const titleEl=$('tour-title');
  const bodyEl=$('tour-body');
  const nextBtn=$('tour-next-btn');
  const backBtn=$('tour-back-btn');
  const fill=$('tour-progress-fill');

  if(stepLabel)stepLabel.textContent=`STEP ${_activeTour.stepIdx+1} OF ${tour.steps.length}`;
  if(titleEl)titleEl.textContent=step.title;
  if(bodyEl)bodyEl.textContent=step.body;
  if(nextBtn)nextBtn.textContent=_activeTour.stepIdx===tour.steps.length-1?'Finish ✓':'Next →';
  if(backBtn)backBtn.style.display=_activeTour.stepIdx===0?'none':'';
  if(fill)fill.style.width=`${((_activeTour.stepIdx+1)/tour.steps.length)*100}%`;

  // Spotlight the target element
  const targetEl=document.querySelector(`[data-tour-id="${step.target}"]`)||document.getElementById(step.target);
  const tooltip=$('tour-tooltip');
  const spotlight=$('tour-spotlight');
  const pulse=$('tour-pulse-ring');

  if(targetEl&&spotlight&&tooltip){
    if(tooltip)tooltip.style.transform='';
    const rect=targetEl.getBoundingClientRect();
    const pad=8;
    spotlight.style.left=(rect.left-pad)+'px';
    spotlight.style.top=(rect.top-pad)+'px';
    spotlight.style.width=(rect.width+pad*2)+'px';
    spotlight.style.height=(rect.height+pad*2)+'px';
    spotlight.style.display='block';

    // Pulse ring
    if(pulse){
      pulse.style.left=(rect.left+rect.width/2-20)+'px';
      pulse.style.top=(rect.top+rect.height/2-20)+'px';
      pulse.style.width='40px';
      pulse.style.height='40px';
      pulse.style.display='block';
    }

    // Position tooltip
    const tw=320,th=160;
    let tx=rect.left;
    let ty=rect.bottom+16;
    if(ty+th>window.innerHeight-20)ty=rect.top-th-16;
    if(tx+tw>window.innerWidth-20)tx=window.innerWidth-tw-20;
    if(tx<10)tx=10;
    tooltip.style.left=tx+'px';
    tooltip.style.top=ty+'px';
    tooltip.style.display='block';

    // Scroll target into view
    targetEl.scrollIntoView({behavior:'smooth',block:'nearest'});
  } else {
    // No target — center tooltip
    if(spotlight)spotlight.style.display='none';
    if(pulse)pulse.style.display='none';
    if(tooltip){
      tooltip.style.left='50%';
      tooltip.style.top='50%';
      tooltip.style.transform='translate(-50%,-50%)';
      tooltip.style.display='block';
    }
  }
}

function tourNext(){
  if(!_activeTour)return;
  const tour=HC_TOURS.find(t=>t.id===_activeTour.tourId);
  if(!tour)return;
  if(_activeTour.stepIdx>=tour.steps.length-1){completeTour();return;}
  _activeTour.stepIdx++;
  showTourStep();
}

function tourBack(){
  if(!_activeTour||_activeTour.stepIdx===0)return;
  _activeTour.stepIdx--;
  showTourStep();
}

function toggleTourPause(){
  if(!_activeTour)return;
  _activeTour.paused=!_activeTour.paused;
  const btn=$('tour-pause-btn');
  if(btn)btn.textContent=_activeTour.paused?'▶ Resume':'⏸ Pause';
}

function restartTour(){
  if(!_activeTour)return;
  _activeTour.stepIdx=0;
  _activeTour.paused=false;
  showTourStep();
}

function exitTour(){
  const wasTour1=_activeTour&&_activeTour.tourId===1;
  _activeTour=null;
  _tourOverlayActive=false;
  const overlay=$('tour-overlay');
  if(overlay)overlay.style.display='none';
  const spotlight=$('tour-spotlight');
  if(spotlight)spotlight.style.display='none';
  const pulse=$('tour-pulse-ring');
  if(pulse)pulse.style.display='none';
  const tooltip=$('tour-tooltip');
  if(tooltip){tooltip.style.display='none';tooltip.style.transform='';}
  // Mark the welcome tour as "seen" so we don't re-prompt next login.
  if(wasTour1){try{localStorage.setItem('lu_tour_v1_done','1');}catch(_){}}
}

function completeTour(){
  if(!_activeTour)return;
  const tourId=_activeTour.tourId;
  _helpCompletedTours.add(tourId);
  if(tourId===1){try{localStorage.setItem('lu_tour_v1_done','1');}catch(_){}}
  exitTour();
  launchConfetti();
  toast('🎉 Tour complete! Great job.');
  // If on help screen, re-render tours tab
  if(_curScreen==='help'){_helpTab='tours';renderHelp();}
}

// First-login onboarding offer. Shows a friendly toast asking the user to
// launch the welcome tour. Stores `lu_tour_v1_offered` so we don't pester
// every login — but the offer itself doesn't mark the tour as "done".
function _maybeOfferTour(){
  try{
    if(localStorage.getItem('lu_tour_v1_done'))return;
    if(localStorage.getItem('lu_tour_v1_offered'))return;
    localStorage.setItem('lu_tour_v1_offered','1');
    if(typeof toast!=='function')return;
    toast({
      type:'info',
      title:'👋 New here?',
      msg:'Take the 60-second tour to learn the basics.',
      duration:12000,
      actions:[
        {label:'Start tour',primary:true,onClick:()=>{try{launchTour(1);}catch(_){}}},
        {label:'Later',onClick:()=>{/* user can launch from Help → Tours */}},
      ],
    });
  }catch(_){}
}

function launchConfetti(){
  const canvas=$('tour-confetti');
  if(!canvas)return;
  canvas.style.display='block';
  canvas.width=window.innerWidth;
  canvas.height=window.innerHeight;
  const ctx=canvas.getContext('2d');
  const particles=Array.from({length:120},()=>({
    x:Math.random()*canvas.width,
    y:-10,
    r:Math.random()*6+3,
    d:Math.random()*120+60,
    color:`hsl(${Math.random()*360},80%,60%)`,
    tilt:Math.random()*10-5,
    tiltAngle:0,
    tiltAngleInc:Math.random()*.07+.05,
  }));
  let frame=0;
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p=>{
      p.tiltAngle+=p.tiltAngleInc;
      p.y+=Math.cos(frame/10+p.d)+2;
      p.x+=Math.sin(frame/5)*.5;
      p.tilt=Math.sin(p.tiltAngle)*12;
      ctx.beginPath();
      ctx.lineWidth=p.r;
      ctx.strokeStyle=p.color;
      ctx.moveTo(p.x+p.tilt+p.r/3,p.y);
      ctx.lineTo(p.x+p.tilt,p.y+p.tilt+p.r/3);
      ctx.stroke();
    });
    frame++;
    if(frame<180)requestAnimationFrame(draw);
    else{canvas.style.display='none';}
  }
  draw();
}

// ====== HELP DRAWER ======
function openHelpDrawer(query){
  const ov=$('help-drawer-ov');
  if(!ov)return;
  ov.style.display='flex';
  _helpDrawerOpen=true;
  renderHelpDrawer(query||'');
}

function closeHelpDrawer(){
  const ov=$('help-drawer-ov');
  if(ov)ov.style.display='none';
  _helpDrawerOpen=false;
}

function renderHelpDrawer(q){
  const body=$('help-drawer-body');
  if(!body)return;
  // Wrap the whole render in try/catch so a single broken template literal
  // can't leave the drawer body silently empty.
  try{
  q=(q||'').toLowerCase();
  const screen=(typeof _curScreen!=='undefined'&&_curScreen)||(typeof curScreen!=='undefined'&&curScreen)||'home';

  // Context-aware suggestions per screen. Numbers match HC_ARTICLES ids.
  // Always include 11 (Cmd+K) and 12 (AI chat) since those are universal.
  const screenArticleMap={
    home:[1,2,11,12,14],
    myday:[1,11,12],
    myweek:[1,11,12],
    tasks:[3,11,12,17],
    process:[3,11],
    notes:[5,16,17,11,12],
    journal:[5,16,11,12],
    ideas:[5,16,11],
    calendar:[4,11,12],
    mail:[18,11,12],
    habits:[8,11,12],
    goals:[9,11,12,14],
    projects:[3,9,11],
    clusters:[3,11],
    contacts:[6,11],
    bookmarks:[5,11],
    settings:[7,13,14,18],
    reports:[15,11,12],
    focus:[10,11],
    help:[10,11,12]
  };
  const suggestedIds=screenArticleMap[screen]||[1,10,11,12];
  const suggested=HC_ARTICLES.filter(a=>suggestedIds.includes(a.id));

  // Search results
  let results=[];
  if(q){
    results=HC_ARTICLES.filter(a=>a.title.toLowerCase().includes(q)||a.summary.toLowerCase().includes(q)||(a.tags||[]).some(t=>t.includes(q)));
  }

  // Active tour status
  const activeTour=(typeof _activeTour!=='undefined'&&_activeTour)?HC_TOURS.find(t=>t.id===_activeTour.tourId):null;

  body.innerHTML=`
  ${activeTour?`<div style="background:var(--acs);border:1px solid var(--ac);border-radius:8px;padding:10px 12px;margin-bottom:14px;display:flex;align-items:center;gap:8px">
    <span style="font-size:16px">🎯</span>
    <div style="flex:1"><div style="font-size:11px;font-weight:600;color:var(--ac)">Tour in progress: ${esc(activeTour.name)}</div><div style="font-size:11px;color:var(--t3)">Step ${_activeTour.stepIdx+1} of ${activeTour.steps.length}</div></div>
    <button class="btn-p" onclick="showTourStep();closeHelpDrawer()" style="font-size:11px">Resume</button>
  </div>`:''}

  <div style="position:relative;margin-bottom:14px">
    <input class="inp" placeholder="Search help…" value="${esc(q)}" oninput="renderHelpDrawer(this.value)" style="width:100%;padding-left:32px;font-size:12px">
    <svg style="position:absolute;left:9px;top:50%;transform:translateY(-50%);width:14px;height:14px;color:var(--t3)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
  </div>

  ${q&&results.length?`<div style="font-size:11px;color:var(--t3);margin-bottom:8px">${results.length} result${results.length!==1?'s':''}</div><div style="display:flex;flex-direction:column;gap:6px">${results.map(a=>helpDrawerCard(a)).join('')}</div>`:
  q&&!results.length?`<div style="text-align:center;padding:20px;color:var(--t3)"><div style="font-size:24px;margin-bottom:6px">🔍</div><div style="font-size:12px">No results. <button onclick="_helpTab='ask';nav('help');closeHelpDrawer()" style="background:none;border:none;cursor:pointer;color:var(--ac);font-size:12px">Ask AI instead</button></div></div>`:
  `<div>
    <div style="font-size:11px;font-weight:700;color:var(--t3);margin-bottom:8px;text-transform:uppercase">Suggested for this screen</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">${suggested.map(a=>helpDrawerCard(a)).join('')}</div>
    <div style="font-size:11px;font-weight:700;color:var(--t3);margin-bottom:8px;text-transform:uppercase">🎯 Guided Tours</div>
    <div style="display:flex;flex-direction:column;gap:6px">${HC_TOURS.slice(0,3).map(t=>`<div style="background:var(--s2);border:1px solid var(--br);border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:8px">
      <span style="font-size:18px">${t.type==='onboarding'?'🚀':'🎯'}</span>
      <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600">${esc(t.name)}</div><div style="font-size:11px;color:var(--t3)">${t.steps.length} steps · ~${t.est} min</div></div>
      <button class="btn-p" onclick="launchTour(${t.id})" style="font-size:11px">Start</button>
    </div>`).join('')}</div>
    <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--br);display:flex;gap:6px">
      <button onclick="_helpTab='ask';nav('help');closeHelpDrawer()" class="btn-s" style="font-size:11px;flex:1">🤖 Ask AI</button>
      <button onclick="nav('help');closeHelpDrawer()" class="btn-s" style="font-size:11px;flex:1">📚 All Articles</button>
    </div>
  </div>`}
  `;
  }catch(err){
    // Failsafe — never leave the drawer body empty if a template-literal throws.
    console.error('[help drawer]',err);
    body.innerHTML=`<div style="padding:16px">
      <div style="font-size:13px;font-weight:600;margin-bottom:6px">Help Center</div>
      <p style="font-size:11px;color:var(--t3);margin-bottom:14px">Quick links — the full help drawer hit a rendering issue. The articles below still work.</p>
      ${HC_ARTICLES.map(a=>`<div style="padding:8px 0;border-bottom:1px solid var(--bd1);cursor:pointer" onclick="_helpArticleId=${a.id};nav('help');closeHelpDrawer()">
        <div style="font-size:12px;font-weight:600">${esc(a.title)}</div>
        <div style="font-size:11px;color:var(--t3)">${esc(a.summary)}</div>
      </div>`).join('')}
      <div style="margin-top:12px"><button class="btn btn-p" onclick="nav('help');closeHelpDrawer()" style="font-size:11px">📚 Open Full Help Center</button></div>
    </div>`;
  }
}

function helpDrawerCard(a){
  const cat=HC_CATS.find(c=>c.id===a.catId);
  return `<div onclick="_helpArticleId=${a.id};nav('help');closeHelpDrawer()" style="background:var(--s2);border:1px solid var(--br);border-radius:8px;padding:10px 12px;cursor:pointer;display:flex;align-items:flex-start;gap:8px" onmouseover="this.style.borderColor='var(--ac)'" onmouseout="this.style.borderColor='var(--br)'">
  <span style="font-size:16px;flex-shrink:0">${cat?cat.icon:'📄'}</span>
  <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600">${esc(a.title)}</div><div style="font-size:11px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.summary)}</div></div>
  <svg style="flex-shrink:0;color:var(--t3);width:12px;height:12px;margin-top:3px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
</div>`;
}

// ====== PROACTIVE HINTS ======
const PROACTIVE_HINTS={
  tasks:{delay:8000,msg:'Tip: Press ✨ Decompose to break a big goal into sub-tasks automatically.',action:'Learn more',articleId:3},
  notes:{delay:10000,msg:'Tip: Type [[ to link to another note and build your knowledge graph.',action:'Learn more',articleId:5},
  calendar:{delay:8000,msg:'Tip: Drag any event in Day view to reschedule it instantly.',action:'Learn more',articleId:4},
  contacts:{delay:8000,msg:'Tip: Click 🔍 Enrich to fill in emails, phones, and LinkedIn from Clodura.',action:'Learn more',articleId:6},
  habits:{delay:10000,msg:'Tip: AI Coaching adapts your habit targets when you miss a streak.',action:'Learn more',articleId:8},
};

function triggerProactiveHint(screen){
  if(_proactiveHintShown.has(screen))return;
  const hint=PROACTIVE_HINTS[screen];
  if(!hint)return;
  clearTimeout(_idleTimer);
  _idleTimer=setTimeout(()=>{
    if(_curScreen!==screen)return; // user navigated away
    _proactiveHintShown.add(screen);
    showProactiveHint(hint);
  },hint.delay);
}

function showProactiveHint(hint){
  const existing=document.getElementById('proactive-hint');
  if(existing)existing.remove();
  const el=document.createElement('div');
  el.id='proactive-hint';
  el.style.cssText='position:fixed;bottom:80px;right:24px;background:var(--bg);border:1px solid var(--ac);border-radius:10px;padding:12px 14px;max-width:280px;box-shadow:0 4px 16px rgba(0,0,0,.2);z-index:249;animation:slideInRight .3s ease';
  el.innerHTML=`<div style="display:flex;align-items:flex-start;gap:8px">
    <span style="font-size:16px;flex-shrink:0">💡</span>
    <div style="flex:1;min-width:0">
      <div style="font-size:11px;color:var(--t1);line-height:1.5;margin-bottom:6px">${esc(hint.msg)}</div>
      <div style="display:flex;gap:6px">
        <button onclick="_helpArticleId=${hint.articleId};nav('help');document.getElementById('proactive-hint')?.remove()" style="font-size:11px;background:none;border:none;cursor:pointer;color:var(--ac);font-weight:600">${esc(hint.action)}</button>
        <button onclick="document.getElementById('proactive-hint')?.remove()" style="font-size:11px;background:none;border:none;cursor:pointer;color:var(--t3)">Dismiss</button>
      </div>
    </div>
    <button onclick="document.getElementById('proactive-hint')?.remove()" style="background:none;border:none;cursor:pointer;color:var(--t3);font-size:14px;flex-shrink:0">×</button>
  </div>`;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),12000);
}

// ====== SMTP/IMAP SECONDARY EMAIL ======
// ─── Admin: Team Notification Senders ───────────────────────────────────────
// Lists every team user and lets the admin configure each one's outbound SMTP.
// The configured account becomes the "from" for any notifications sent to that
// user. Loaded on demand by renderSettings → Mail tab.
async function loadTeamNotificationSenders(){
  const el=document.getElementById('team-senders-list');
  if(!el)return;
  try{
    const users=await _trpc('oauthSync.adminListUsers',undefined,'query');
    if(!Array.isArray(users)||!users.length){el.innerHTML='<div style="color:var(--t3)">No users found.</div>';return;}
    el.innerHTML=users.map(u=>`
      <div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid var(--bd1)">
        <div style="width:24px;height:24px;border-radius:50%;background:var(--s3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:var(--t1)">${esc(((u.name||u.email||'?').charAt(0)||'?').toUpperCase())}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:600;color:var(--t1)">${esc(u.name||'(unnamed)')} ${u.role==='admin'?'<span style=\"font-size:11px;color:var(--ac);margin-left:4px\">ADMIN</span>':''}</div>
          <div style="font-size:11px;color:var(--t3)">${esc(u.email||'')}</div>
        </div>
        <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${u.hasSmtp?'rgba(34,197,94,.15);color:var(--ok)':'var(--s3);color:var(--t3)'}">${u.hasSmtp?'✓ Configured':'Not set'}</span>
        <button class="btn btn-s" style="height:24px;font-size:11px" onclick="openTeamSenderForm(${u.id},'${esc(u.name||u.email||'user')}')">${u.hasSmtp?'Edit':'Configure'}</button>
        ${u.hasSmtp?`<button class="btn btn-d" style="height:24px;font-size:11px" onclick="deleteTeamSender(${u.id})">✕</button>`:''}
      </div>
    `).join('');
  }catch(e){
    el.innerHTML='<div style="color:var(--err);font-size:11px">Failed to load: '+esc(e.message||String(e))+'</div>';
  }
}
async function openTeamSenderForm(userId,userLabel){
  // Load existing account (if any) to pre-fill
  let existing=null;
  try{existing=await _trpc('oauthSync.adminGetSmtpImapAccount',{userId},'query');}catch(_){}
  const e=existing||{};
  const html=`
    <h3 style="font-size:14px;font-weight:600;margin-bottom:4px">Configure SMTP — ${esc(userLabel)}</h3>
    <p style="font-size:11px;color:var(--t3);margin-bottom:10px">This account sends notifications to ${esc(userLabel)}.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
      <input id="ts-email" class="inp" type="email" placeholder="Email address" value="${esc(e.email||'')}" style="font-size:11px"/>
      <input id="ts-display-name" class="inp" type="text" placeholder="Display name (optional)" value="${esc(e.displayName||'')}" style="font-size:11px"/>
    </div>
    <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:4px">IMAP</div>
    <div style="display:grid;grid-template-columns:1fr 90px 90px;gap:6px;margin-bottom:6px">
      <input id="ts-imap-host" class="inp" placeholder="IMAP Host" value="${esc(e.imapHost||'')}" style="font-size:11px"/>
      <input id="ts-imap-port" class="inp" type="number" placeholder="Port" value="${e.imapPort||993}" style="font-size:11px"/>
      <select id="ts-imap-encryption" class="inp" style="font-size:11px"><option value="ssl"${e.imapEncryption==='ssl'?' selected':''}>SSL</option><option value="tls"${e.imapEncryption==='tls'?' selected':''}>TLS</option><option value="none"${e.imapEncryption==='none'?' selected':''}>None</option></select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
      <input id="ts-imap-username" class="inp" placeholder="IMAP Username" value="${esc(e.imapUsername||'')}" style="font-size:11px"/>
      <input id="ts-imap-password" class="inp" type="password" placeholder="IMAP Password" value="${esc(e.imapPassword||'')}" style="font-size:11px"/>
    </div>
    <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:4px">SMTP</div>
    <div style="display:grid;grid-template-columns:1fr 90px 90px;gap:6px;margin-bottom:6px">
      <input id="ts-smtp-host" class="inp" placeholder="SMTP Host" value="${esc(e.smtpHost||'')}" style="font-size:11px"/>
      <input id="ts-smtp-port" class="inp" type="number" placeholder="Port" value="${e.smtpPort||587}" style="font-size:11px"/>
      <select id="ts-smtp-encryption" class="inp" style="font-size:11px"><option value="ssl"${e.smtpEncryption==='ssl'?' selected':''}>SSL</option><option value="tls"${(!e.smtpEncryption||e.smtpEncryption==='tls')?' selected':''}>TLS</option><option value="none"${e.smtpEncryption==='none'?' selected':''}>None</option></select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
      <input id="ts-smtp-username" class="inp" placeholder="SMTP Username" value="${esc(e.smtpUsername||'')}" style="font-size:11px"/>
      <input id="ts-smtp-password" class="inp" type="password" placeholder="SMTP Password" value="${esc(e.smtpPassword||'')}" style="font-size:11px"/>
    </div>
    <div style="display:flex;gap:6px;justify-content:flex-end">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-p" onclick="saveTeamSender(${userId})">💾 Save</button>
    </div>
  `;
  document.getElementById('modal-content').innerHTML=html;
  document.getElementById('modal-capture').classList.add('show');
}
async function saveTeamSender(userId){
  const data={
    userId,
    email:document.getElementById('ts-email').value.trim(),
    displayName:document.getElementById('ts-display-name').value.trim()||undefined,
    imapHost:document.getElementById('ts-imap-host').value.trim(),
    imapPort:parseInt(document.getElementById('ts-imap-port').value,10)||993,
    imapEncryption:document.getElementById('ts-imap-encryption').value,
    imapUsername:document.getElementById('ts-imap-username').value.trim(),
    imapPassword:document.getElementById('ts-imap-password').value,
    smtpHost:document.getElementById('ts-smtp-host').value.trim(),
    smtpPort:parseInt(document.getElementById('ts-smtp-port').value,10)||587,
    smtpEncryption:document.getElementById('ts-smtp-encryption').value,
    smtpUsername:document.getElementById('ts-smtp-username').value.trim(),
    smtpPassword:document.getElementById('ts-smtp-password').value,
  };
  if(!data.email||!data.imapHost||!data.imapUsername||!data.imapPassword||!data.smtpHost||!data.smtpUsername||!data.smtpPassword){
    toast('Please fill in all required fields.');return;
  }
  try{
    await _trpc('oauthSync.adminSaveSmtpImapAccount',data,'mutation');
    toast('✅ Notification sender saved');
    closeModal();
    loadTeamNotificationSenders();
  }catch(e){
    toast('Failed to save: '+(e.message||e));
  }
}
async function deleteTeamSender(userId){
  if(!confirm("Remove this user's notification sender? They will fall back to the system default."))return;
  try{
    await _trpc('oauthSync.adminDeleteSmtpImapAccount',{userId},'mutation');
    toast('Sender removed');
    loadTeamNotificationSenders();
  }catch(e){toast('Failed: '+(e.message||e));}
}

function showSmtpImapForm(){
  const form=document.getElementById('smtp-imap-form');
  const buttons=document.getElementById('smtp-imap-buttons');
  if(form.style.display==='none'){
    form.style.display='block';
    buttons.style.display='none';
  }else{
    form.style.display='none';
    buttons.style.display='flex';
  }
}

async function saveSmtpImapAccount(){
  const data={
    email:document.getElementById('smtp-email').value,
    displayName:document.getElementById('smtp-display-name').value||null,
    imapHost:document.getElementById('smtp-imap-host').value,
    imapPort:parseInt(document.getElementById('smtp-imap-port').value),
    imapEncryption:document.getElementById('smtp-imap-encryption').value,
    imapUsername:document.getElementById('smtp-imap-username').value,
    imapPassword:document.getElementById('smtp-imap-password').value,
    smtpHost:document.getElementById('smtp-smtp-host').value,
    smtpPort:parseInt(document.getElementById('smtp-smtp-port').value),
    smtpEncryption:document.getElementById('smtp-smtp-encryption').value,
    smtpUsername:document.getElementById('smtp-smtp-username').value,
    smtpPassword:document.getElementById('smtp-smtp-password').value,
  };
  if(!data.email||!data.imapHost||!data.imapUsername||!data.imapPassword||!data.smtpHost||!data.smtpUsername||!data.smtpPassword){
    toast('Please fill in all required fields','error',5000);
    return;
  }
  try{
    const res=await _trpc('oauthSync.saveSmtpImapAccount',data,'mutation');
    if(res.success){
      toast('Email account saved successfully','success');
      showSmtpImapForm();
      loadSmtpImapAccount();
    }else{
      toast('Failed to save account','error');
    }
  }catch(e){
    toast('Error: '+e.message,'error',8000);
  }
}

async function testSmtpImapConnection(){
  const data={
    imapHost:document.getElementById('smtp-imap-host').value,
    imapPort:parseInt(document.getElementById('smtp-imap-port').value),
    imapEncryption:document.getElementById('smtp-imap-encryption').value,
    imapUsername:document.getElementById('smtp-imap-username').value,
    imapPassword:document.getElementById('smtp-imap-password').value,
    smtpHost:document.getElementById('smtp-smtp-host').value,
    smtpPort:parseInt(document.getElementById('smtp-smtp-port').value),
    smtpEncryption:document.getElementById('smtp-smtp-encryption').value,
    smtpUsername:document.getElementById('smtp-smtp-username').value,
    smtpPassword:document.getElementById('smtp-smtp-password').value,
  };
  // Validate required fields
  if(!data.smtpHost||!data.smtpUsername||!data.smtpPassword||!data.imapHost||!data.imapUsername||!data.imapPassword){
    toast('Please fill in all SMTP and IMAP fields before testing','error',5000);
    return;
  }
  // Show result panel in loading state
  const panel=document.getElementById('smtp-test-results');
  const btn=document.getElementById('btn-smtp-test');
  if(panel){panel.style.display='block';}
  if(btn){btn.disabled=true;btn.textContent='⏳ Testing...';}
  const setRow=(type,ok,msg,latencyMs)=>{
    const icon=document.getElementById('smtp-test-'+type+'-icon');
    const msgEl=document.getElementById('smtp-test-'+type+'-msg');
    const latEl=document.getElementById('smtp-test-'+type+'-latency');
    if(icon)icon.textContent=ok===null?'⏳':ok?'✅':'❌';
    if(msgEl){msgEl.textContent=msg;msgEl.style.color=ok===null?'var(--t2)':ok?'var(--grn)':'var(--red)';}
    if(latEl)latEl.textContent=latencyMs!=null?latencyMs+'ms':'';
  };
  setRow('smtp',null,'Testing...',null);
  setRow('imap',null,'Testing...',null);
  try{
    const res=await _trpc('oauthSync.testSmtpImapConnection',data,'mutation');
    setRow('smtp',res.smtp?.ok,res.smtp?.message||'Unknown',res.smtp?.latencyMs);
    setRow('imap',res.imap?.ok,res.imap?.message||'Unknown',res.imap?.latencyMs);
    if(res.success){
      toast('✅ Both SMTP and IMAP connected successfully','success');
    }else{
      const failed=[];
      if(!res.smtp?.ok)failed.push('SMTP');
      if(!res.imap?.ok)failed.push('IMAP');
      toast('❌ '+failed.join(' & ')+' connection failed — see details above','error',8000);
    }
  }catch(e){
    setRow('smtp',false,'Error: '+e.message,null);
    setRow('imap',false,'Error: '+e.message,null);
    toast('Connection test error: '+e.message,'error',8000);
  }finally{
    if(btn){btn.disabled=false;btn.textContent='🔌 Test';}
  }
}

async function loadSmtpImapAccount(){
  try{
    const account=await _trpc('oauthSync.getSmtpImapAccount',{},'query');
    if(account){
      document.getElementById('smtp-imap-badge').textContent='Configured';
      document.getElementById('smtp-imap-badge').style.background='var(--ac)';
      document.getElementById('smtp-imap-badge').style.color='#fff';
      document.getElementById('btn-smtp-add').style.display='none';
      document.getElementById('btn-smtp-edit').style.display='inline-block';
      document.getElementById('btn-smtp-delete').style.display='inline-block';
      document.getElementById('smtp-email').value=account.email;
      document.getElementById('smtp-display-name').value=account.displayName||'';
      document.getElementById('smtp-imap-host').value=account.imapHost;
      document.getElementById('smtp-imap-port').value=account.imapPort;
      document.getElementById('smtp-imap-encryption').value=account.imapEncryption;
      document.getElementById('smtp-imap-username').value=account.imapUsername||'';
      document.getElementById('smtp-smtp-host').value=account.smtpHost;
      document.getElementById('smtp-smtp-port').value=account.smtpPort;
      document.getElementById('smtp-smtp-encryption').value=account.smtpEncryption;
      document.getElementById('smtp-smtp-username').value=account.smtpUsername||'';
    }else{
      document.getElementById('smtp-imap-badge').textContent='Not configured';
      document.getElementById('smtp-imap-badge').style.background='var(--s3)';
      document.getElementById('smtp-imap-badge').style.color='var(--t3)';
      document.getElementById('btn-smtp-add').style.display='inline-block';
      document.getElementById('btn-smtp-edit').style.display='none';
      document.getElementById('btn-smtp-delete').style.display='none';
    }
  }catch(e){
    console.error('Failed to load SMTP/IMAP account:',e);
  }
}

async function deleteSmtpImapAccount(){
  if(!confirm('Are you sure you want to remove this email account?'))return;
  try{
    const res=await _trpc('oauthSync.deleteSmtpImapAccount',{},'mutation');
    if(res.success){
      toast('Email account removed','success');
      document.getElementById('smtp-imap-form').style.display='none';
      document.getElementById('smtp-imap-buttons').style.display='flex';
      loadSmtpImapAccount();
    }else{
      toast('Failed to remove account','error');
    }
  }catch(e){
    toast('Error: '+e.message,'error',8000);
  }
}


// ===== INVITE ACCEPT FLOW =====
async function initInviteScreen(token){
  const overlay=document.getElementById('invite-overlay');
  const loading=document.getElementById('invite-loading');
  const formInner=document.getElementById('invite-form-inner');
  const invalid=document.getElementById('invite-invalid');
  const invalidMsg=document.getElementById('invite-invalid-msg');
  const details=document.getElementById('invite-details');
  // Show overlay, hide login
  overlay.style.display='flex';
  document.getElementById('login-overlay').style.display='none';
  // Validate token
  try{
    const inv=await _trpc('teamInvites.validate',{token},'query');
    loading.style.display='none';
    formInner.style.display='';
    // Pre-fill name if provided
    if(inv.name){const n=document.getElementById('invite-name');if(n)n.value=inv.name;}
    // Show invite details
    const expiry=new Date(inv.expiresAt).toLocaleDateString(undefined,{dateStyle:'medium'});
    details.innerHTML=`<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Email</span><strong>${esc(inv.email)}</strong></div><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Role</span><strong style="text-transform:capitalize">${esc(inv.role)}</strong></div><div style="display:flex;justify-content:space-between"><span>Expires</span><span style="color:var(--t3)">${expiry}</span></div>`;
    window._inviteToken=token;
    setTimeout(()=>{const n=document.getElementById('invite-name');if(n&&!n.value)n.focus();else{const p=document.getElementById('invite-password');if(p)p.focus();}},100);
  }catch(e){
    loading.style.display='none';
    invalid.style.display='';
    if(invalidMsg)invalidMsg.textContent=e.message||'This invite link is invalid, has already been used, or has expired.';
  }
}
async function acceptInviteSubmit(){
  const errEl=document.getElementById('invite-err');
  const btn=document.getElementById('invite-submit-btn');
  const name=(document.getElementById('invite-name')||{}).value||'';
  const password=(document.getElementById('invite-password')||{}).value||'';
  const confirm=(document.getElementById('invite-confirm')||{}).value||'';
  const token=window._inviteToken;
  errEl.style.display='none';
  if(!name.trim()){errEl.textContent='Please enter your name.';errEl.style.display='';return;}
  if(password.length<8){errEl.textContent='Password must be at least 8 characters.';errEl.style.display='';return;}
  if(password!==confirm){errEl.textContent='Passwords do not match.';errEl.style.display='';return;}
  btn.disabled=true;
  btn.innerHTML='<svg style="display:inline;animation:spin 1s linear infinite;vertical-align:middle;margin-right:6px" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Creating account…';
  try{
    await _trpc('teamInvites.accept',{token,name:name.trim(),password},'mutation');
    document.getElementById('invite-form-inner').style.display='none';
    document.getElementById('invite-success').style.display='';
  }catch(e){
    errEl.textContent=e.message||'Failed to create account. Please try again.';
    errEl.style.display='';
    btn.disabled=false;
    btn.textContent='Create Account';
  }
}

// ====== INIT ======
applyPrefs();
// Check if this is an invite acceptance URL (/invite/:token)
(function(){
  // Tolerate a trailing slash some mail clients append (…/invite/<token>/).
  const m=window.location.pathname.match(/^\/invite\/([a-f0-9]{64})\/?$/i);
  if(m){
    initInviteScreen(m[1].toLowerCase());
    return;
  }
  initLoginScreen();
})();
// App boots inside doLoginSuccess after auth
// Patch save() to invalidate search index on data change AND sync to server (debounced)
const _origSave=window.save||save;
// Debounce timers for server sync (one per data key)
const _syncTimers={};
// Keys that are synced to the server
const _syncKeys=new Set(['tasks','notes','projects','goals','journal','habits','contacts','ideas','teams','prefs','calEvents','clusters','programs','opportunities','atlasAnnotations','mindmaps','sheets','decks']);
// SAFETY GUARD: never push to the server until loadServerData() has
// successfully pulled (or confirmed there is no) server data. Without this,
// a cleared-localStorage boot shows built-in seed data and the 2s auto-sync
// could overwrite the user's real server copy before the load round-trip
// finishes. Edits made during the gate are queued and flushed afterwards.
let _serverSyncReady=false;
const _pendingSyncKeys=new Set();
// Keys changed locally but not yet confirmed-pushed to the server. Flushed
// immediately when the app is backgrounded/closed so leaving the app (esp.
// on mobile, within the 2s debounce) doesn't lose the edit.
const _dirtyKeys=new Set();
function _flushPendingSync(){
  if(!_serverSyncReady)return;
  const ks=[..._pendingSyncKeys];_pendingSyncKeys.clear();
  ks.forEach(k=>setTimeout(()=>_pushKeyToServer(k),60));
}
function _flushDirtyNow(){
  // Cancel pending debounces and push everything dirty right now. Fired on
  // visibilitychange→hidden / pagehide (iOS Safari fires these while the
  // page is still alive enough for the request to go out).
  _dirtyKeys.forEach(k=>{
    try{clearTimeout(_syncTimers[k]);}catch(_){}
    _pushKeyToServer(k);
  });
}
if(typeof document!=='undefined'&&!window._luSyncFlushWired){
  window._luSyncFlushWired=true;
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')_flushDirtyNow();});
  window.addEventListener('pagehide',_flushDirtyNow);
  window.addEventListener('beforeunload',_flushDirtyNow);
}
async function _pushKeyToServer(k){
  if(!_syncKeys.has(k))return;
  if(!_serverSyncReady){
    // Hold the write until we've loaded server data, so seed/empty local
    // state can't clobber a good server copy during the boot race. Kick the
    // self-heal watchdog so a stuck/never-run load gets retried.
    _pendingSyncKeys.add(k);
    if(typeof _ensureSyncReady==='function')_ensureSyncReady();
    return;
  }
  try{
    const val=JSON.stringify(D[k]);
    await _trpc('appData.save',{[k]:val},'mutation');
    _dirtyKeys.delete(k); // confirmed persisted on the server
    window._luLastSyncOk=Date.now();
  }catch(e){
    // Was silent — now surfaced so we can actually diagnose device sync
    // failures (auth vs network) instead of guessing. Throttled to 1/12s.
    console.warn('[appData] sync failed for key',k,e&&e.message);
    const now=Date.now();
    if(!window._luSyncErrAt||now-window._luSyncErrAt>12000){
      window._luSyncErrAt=now;
      const msg=(e&&(e.message||e.toString()))||'unknown';
      if(typeof toast==='function')toast({type:'error',title:'⚠ Sync to server failed',msg:('Saved on this device only. Reason: '+msg).slice(0,160),duration:7000});
    }
  }
}
// User-runnable sync self-check: compares this device's local data with
// what the server actually has, and reports it in a visible alert so the
// problem can be diagnosed without dev tools. Call _syncDiagnose().
async function _syncDiagnose(){
  let report='SYNC DIAGNOSTIC\n\n';
  try{
    const me=(D&&D.creds)?(D.creds.email||D.creds.userName||'?'):'(not logged in)';
    report+='Account: '+me+'\n';
    report+='Build: '+((typeof window!=='undefined'&&window.__APP_BUILD)||'?')+'\n\n';
    const keys=['tasks','notes','projects','goals','clusters','habits','journal','ideas'];
    report+='LOCAL counts:\n';
    keys.forEach(k=>{report+='  '+k+': '+((D[k]||[]).length)+'\n';});
    // prefs sub-keys (these aren't a top-level data set but they cause the
    // most confusion when one device has them and another doesn't):
    const lp=D.prefs||{};
    report+='  prefs.noteFolders: '+((Array.isArray(lp.noteFolders)?lp.noteFolders.length:0))+'\n';
    report+='  prefs.themeProfiles: '+((Array.isArray(lp.themeProfiles)?lp.themeProfiles.length:0))+'\n';
    report+='  prefs.aiChat.messages: '+((lp.aiChat&&Array.isArray(lp.aiChat.messages))?lp.aiChat.messages.length:0)+'\n';
    report+='\nServer-sync ready: '+(typeof _serverSyncReady!=='undefined'?_serverSyncReady:'?')+'\n';
    report+='Dirty (unsynced) keys: '+([..._dirtyKeys].join(',')||'none')+'\n';
    report+='Oversized-for-cache keys: '+([...(window._luOversizedKeys||[])].join(',')||'none')+'\n';
    report+='Last successful save: '+(window._luLastSyncOk?new Date(window._luLastSyncOk).toLocaleTimeString():'NEVER this session')+'\n\n';
    let sd=null,err=null;
    try{sd=await _trpc('appData.load',undefined,'query');}catch(e){err=e&&(e.message||e.toString());}
    if(err){report+='Server LOAD failed: '+err+'\n(If this says 401/unauthorized, this device is not logged in / cookie not sent.)';}
    else if(!sd){report+='Server has NO data for this account yet.';}
    else{
      report+='SERVER counts:\n';
      keys.forEach(k=>{
        let v=sd[k];if(typeof v==='string'){try{v=JSON.parse(v);}catch(_){v=null;}}
        report+='  '+k+': '+((v&&v.length)||0)+'\n';
      });
      let sp=sd.prefs;
      if(typeof sp==='string'){try{sp=JSON.parse(sp);}catch(_){sp=null;}}
      sp=sp||{};
      report+='  prefs.noteFolders: '+((Array.isArray(sp.noteFolders)?sp.noteFolders.length:0))+'\n';
      report+='  prefs.themeProfiles: '+((Array.isArray(sp.themeProfiles)?sp.themeProfiles.length:0))+'\n';
      report+='  prefs.aiChat.messages: '+((sp.aiChat&&Array.isArray(sp.aiChat.messages))?sp.aiChat.messages.length:0)+'\n';
      report+='\nServer updatedAt: '+(sd.updatedAt||'?');
    }
    // BUG FIX: this used to write D.prefs (the LOCAL prefs) back to the
    // server — which silently CLOBBERED the server's prefs with whatever
    // junk this device had cached locally. Running the diagnostic on a
    // device with empty/stale prefs literally wiped folders / themes /
    // chat history from the server for everyone. Now we write back what
    // the server just returned — fully idempotent, still proves the
    // mutation endpoint works.
    try{
      const payload=(sd&&sd.prefs)?{prefs:(typeof sd.prefs==='string'?sd.prefs:JSON.stringify(sd.prefs))}:{prefs:'{}'};
      await _trpc('appData.save',payload,'mutation');
      report+='\n\nServer WRITE test: OK ✓ (idempotent — wrote server\'s own prefs back)';
    }
    catch(e){report+='\n\nServer WRITE test: FAILED — '+((e&&(e.message||e.toString()))||'?');}
  }catch(e){report+='\n(diagnostic error: '+(e&&e.message)+')';}
  alert(report);
  return report;
}
window._syncDiagnose=_syncDiagnose;
// Force-replace local state with whatever the server currently has, then
// re-render. Use when local data is stale on one device (e.g. PC has 6
// clusters, phone shows 3) — gives the user an explicit, immediate "pull
// latest from server" without having to clear browser data.
async function forceResyncFromServer(){
  if(!confirm('Pull the latest data from the server and replace this device\'s local copy? Any unsynced changes on THIS device will be discarded.'))return;
  try{
    const sd=await _trpc('appData.load',undefined,'query');
    if(!sd){alert('Server has no data for this account.');return;}
    const keys=['tasks','notes','projects','goals','clusters','habits','journal','ideas','calEvents','contacts','teams','prefs','bookmarks','focusSessions'];
    let touched=0, quotaFails=[];
    keys.forEach(k=>{
      let v=sd[k];if(typeof v==='string'){try{v=JSON.parse(v);}catch(_){v=null;}}
      if(v!==undefined&&v!==null){
        // ALWAYS update the in-memory copy first so the rest of the app
        // (including the current render) sees the fresh server data this
        // session, even if the device's localStorage cache is full.
        // _safeOrigSave will auto-shed the biggest caches (notes etc.) and
        // retry once if it hits a QuotaExceededError, so usually only the
        // truly oversized keys still fail.
        D[k]=v;touched++;
        if(typeof _safeOrigSave==='function'){
          const ok=_safeOrigSave(k);
          if(!ok) quotaFails.push(k);
        } else if(typeof _origSave==='function'){
          try{ _origSave(k); }catch(e){ quotaFails.push(k); }
        }
      }
    });
    if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
    if(quotaFails.length){
      alert('✓ Re-synced '+touched+' data sets from the server (this session).\n\n⚠ This device is out of localStorage space, so '+quotaFails.length+' could not be cached locally and will reload from the server again next time you open the app:\n  '+quotaFails.join(', ')+'\n\nLikely cause: older imported notes with embedded images. New imports already offload images to Google Drive; the existing ones can be migrated to shrink the cache.');
    } else if(typeof toast==='function'){
      toast({type:'success',title:'✓ Re-synced from server',msg:'Updated '+touched+' data sets from the server.',duration:3000});
    } else {
      alert('Re-synced '+touched+' data sets from the server.');
    }
  }catch(e){
    alert('Re-sync failed: '+((e&&(e.message||e.toString()))||'?'));
  }
}
window.forceResyncFromServer=forceResyncFromServer;
// Opposite of forceResyncFromServer: push THIS device's in-memory copy of
// every major data set up to the server, immediately. Use when the
// server's copy has gone stale (e.g. it was clobbered, or this device has
// edits that didn't sync). Bypasses the 2s debounce.
async function forcePushAllToServer(){
  if(!confirm('Push THIS device\'s current data up to the server? Any data ONLY on the server (not in this browser\'s memory) will be replaced. Use this if another device shows fewer items than this one.'))return;
  const keys=['tasks','notes','projects','goals','clusters','habits','journal','ideas','calEvents','contacts','teams','prefs'];
  let ok=0,fails=[];
  for(const k of keys){
    if(D[k]===undefined||D[k]===null)continue;
    try{
      const val=JSON.stringify(D[k]);
      await _trpc('appData.save',{[k]:val},'mutation');
      window._luLastSyncOk=Date.now();
      _dirtyKeys.delete(k);
      ok++;
    }catch(e){
      fails.push(k+' ('+(e&&(e.message||e.toString())||'?').slice(0,80)+')');
    }
  }
  if(fails.length) alert('Pushed '+ok+' data sets.\n\nFailed: '+fails.join('\n'));
  else if(typeof toast==='function') toast({type:'success',title:'✓ Pushed '+ok+' data sets to server',duration:3500});
  else alert('Pushed '+ok+' data sets to server.');
}
window.forcePushAllToServer=forcePushAllToServer;
// Nuclear option: wipe ALL of this device's localStorage cache (keeps the
// login session) and reload. Server is the source of truth; everything
// repopulates from the next loadServerData(). Use when the local cache is
// truly broken / wedged. Exposed globally so the user can paste it into
// the browser console.
function clearLocalCacheAndReload(){
  if(!confirm('Wipe ALL local cache on this device and reload?\n\nYour login stays signed in. Everything else (notes, tasks, prefs, etc.) reloads fresh from the server. Unsynced edits on THIS device will be lost.'))return;
  try{
    const keep={};
    ['lu_session','lu_creds','lu_examples_seeded_v1','lu_tour_v1_done','lu_tour_v1_offered']
      .forEach(k=>{const v=localStorage.getItem(k);if(v!==null)keep[k]=v;});
    localStorage.clear();
    Object.entries(keep).forEach(([k,v])=>{try{localStorage.setItem(k,v);}catch(_){}});
  }catch(_){}
  location.reload();
}
window.clearLocalCacheAndReload=clearLocalCacheAndReload;
// Helper: localStorage write that swallows QuotaExceededError so the
// caller can still keep the in-memory D updated AND still queue the
// server push. On iPhone Safari the per-origin localStorage budget is
// ~5MB; large notes with embedded data-URI images blow past that and the
// thrown exception was previously killing the rest of the save() chain
// (so the server push never queued, and edits made on the phone silently
// stayed local).
//
// When quota IS hit, we now also attempt to FREE SPACE by dropping the
// biggest cache (notes, plus a couple of large legacy keys) and retry
// the original write. The server still has the full notes, so on next
// load they reload normally; meanwhile every OTHER key (clusters, prefs,
// folders, tasks) gets to cache so they survive a reload.
const _LU_CACHE_SHED_KEYS = ['lu_notes','lu_notes_payload','lu_bookmarks','lu_calEvents','lu_journal'];
// Keys this device has proven CAN'T fit in localStorage this session.
// We skip caching them silently after the first failure so we don't keep
// retrying-and-failing (and don't keep toasting the user).
window._luOversizedKeys = window._luOversizedKeys || new Set();
function _safeOrigSave(k){
  // Short-circuit: this key has already failed to fit this session.
  // The in-memory D[k] is still authoritative; the server still gets pushed
  // by the patched save(). We just don't waste cycles trying to cache.
  if(window._luOversizedKeys.has(k)) return false;
  try{ _origSave(k); return true; }
  catch(e){
    const isQuota = e && (e.name==='QuotaExceededError' || /quota/i.test(e.message||''));
    if(isQuota){
      // Try to free space and retry once.
      let freedAny=false;
      for(const cacheKey of _LU_CACHE_SHED_KEYS){
        // Don't drop the key we're trying to write — that'd be silly.
        if(cacheKey==='lu_'+k) continue;
        if(localStorage.getItem(cacheKey)){
          try{ localStorage.removeItem(cacheKey); freedAny=true; }catch(_){}
        }
      }
      if(freedAny){
        try{ _origSave(k); _luQuotaWarn('shed','Cleared cached '+_LU_CACHE_SHED_KEYS.filter(c=>!localStorage.getItem(c)).map(c=>c.replace(/^lu_/,'')).join(' / ')+' to make room. They will reload from the server.'); return true; }
        catch(_){ /* still doesn't fit — fall through */ }
      }
      // Mark this key oversized so we don't keep hammering localStorage
      // for it every save. Only the FIRST time per key do we toast — for
      // 'notes' on iPhone this is once per session, not on every edit.
      const firstTimeForKey = !window._luOversizedKeys.has(k);
      window._luOversizedKeys.add(k);
      if(firstTimeForKey){
        _luQuotaWarn('full',k+' is too big to cache on this device — your edits still sync to the server, so nothing is lost. Cause: older imported notes with embedded images bloating the cache.');
      }
    } else {
      console.warn('[appData] localStorage write failed for key',k,e&&e.message);
    }
    return false;
  }
}
function _luQuotaWarn(kind,msg){
  const now=Date.now();
  if(window._luQuotaWarnAt && now-window._luQuotaWarnAt<15000) return; // throttle
  window._luQuotaWarnAt=now;
  if(typeof toast!=='function')return;
  if(kind==='shed') toast({type:'success',title:'✓ Freed local cache',msg:msg,duration:7000});
  else toast({type:'warn',title:'⚠ This device is out of storage',msg:msg,duration:9000});
}
window.save=function(k){
  // Mirror aiTopics through prefs.aiTopics for server sync (the server's
  // user_app_data table has no aiTopics column, so we ride along with prefs).
  if(k==='aiTopics'){
    D.prefs=D.prefs||{};
    D.prefs.aiTopics=Array.isArray(D.aiTopics)?D.aiTopics.slice():[];
    _safeOrigSave('prefs');
    if(_syncKeys.has('prefs')){
      clearTimeout(_syncTimers['prefs']);
      _syncTimers['prefs']=setTimeout(()=>_pushKeyToServer('prefs'),2000);
    }
  }
  _safeOrigSave(k);
  invalidateSearchIndex();
  // Debounce server push by 2s to batch rapid edits. Mark the key dirty so
  // an app-hide before the debounce fires still flushes it. We do this
  // REGARDLESS of whether the local cache write succeeded — losing the
  // local cache must not also lose the server push.
  if(_syncKeys.has(k)){
    _dirtyKeys.add(k);
    clearTimeout(_syncTimers[k]);
    _syncTimers[k]=setTimeout(()=>_pushKeyToServer(k),2000);
  }
};
// Load data from server and merge into D (server wins for non-empty arrays/objects)
// Lightweight cache of the user's bookmarks so FA forms can offer a "Linked Bookmarks" picker.
async function loadBookmarksCache(){
  try{
    const res=await _trpc('bookmarks.list',{page:1,pageSize:100},'query');
    const items=res?.bookmarks||res||[];
    D.bookmarks=Array.isArray(items)?items.map(b=>({id:b.id,title:b.title||b.url,url:b.url})):[];
  }catch(e){console.warn('[bookmarks] cache load failed',e.message);D.bookmarks=D.bookmarks||[];}
}
let _loadInFlight=false;
async function loadServerData(){
  if(_loadInFlight)return;
  _loadInFlight=true;
  // Load bookmarks cache in parallel — fire and forget, used by linker dropdowns.
  loadBookmarksCache();
  let sd=null;
  try{
    sd=await _trpc('appData.load',undefined,'query');
  }catch(e){
    // The load network call itself failed — server state unknown, so stay
    // gated (don't risk clobbering server with seed/empty). Retry soon so a
    // transient failure can't permanently disable sync for the session.
    console.warn('[appData] load failed — retrying; sync paused until reachable',e&&e.message);
    _loadInFlight=false;
    setTimeout(()=>{ if(!_serverSyncReady) loadServerData(); },8000);
    return;
  }
  // We now have a definitive answer from the server. Open the sync gate
  // IMMEDIATELY — before the merge/render below — so that an exception in
  // that code (or anything else) can never permanently disable syncing.
  // (That exact bug left _serverSyncReady=false and silently lost edits.)
  _serverSyncReady=true;
  try{
    if(!sd){
      // No server data yet — genuine first-time user (e.g. a freshly invited
      // member). Start them with a CLEAN workspace instead of inheriting the
      // bundled demo data (or another user's cached localStorage on a shared
      // browser): every member should only ever see items they create or that
      // are assigned to them. We persist '[]' to localStorage (NOT removal) so
      // the demo defaults in the D initializer — `localStorage||[demo]` — can't
      // reload on the next boot, and we block the one-time example seeder.
      const _newUserKeys=['tasks','notes','projects','goals','journal','habits','contacts','ideas','clusters','programs','opportunities','calEvents'];
      let _clearedDemo=false;
      _newUserKeys.forEach(k=>{
        if(Array.isArray(D[k])&&D[k].length)_clearedDemo=true;
        D[k]=[];
        try{ localStorage.setItem('lu_'+k,'[]'); }catch(_){}
      });
      try{ localStorage.setItem('lu_examples_seeded_v1','1'); }catch(_){}
      if(_clearedDemo){
        console.info('[appData] first-time user — cleared bundled demo data for a clean workspace');
        // Push the empty slate up so the clean workspace becomes the source of
        // truth (the sync gate is already open at this point).
        _newUserKeys.forEach(k=>{ try{ if(typeof _pushKeyToServer==='function')setTimeout(()=>_pushKeyToServer(k),800); }catch(_){} });
        if(typeof curScreen!=='undefined'&&typeof renderScreen==='function')setTimeout(()=>renderScreen(curScreen),60);
      }
    }else{
    const keys=['tasks','notes','projects','goals','journal','habits','contacts','ideas','teams','calEvents','clusters','programs','opportunities','mindmaps','sheets','decks'];
    let changed=false;
    // Timestamp the server blob was last written. A local-only item is only
    // "rescued" if it's NEWER than this — i.e. a genuinely new local add the
    // server hasn't seen yet. An older local-only item means it was DELETED
    // on another device (server written since it existed, and it's gone), so
    // we must NOT resurrect it — that was making deletes bounce back and
    // re-append at the bottom. 90s grace absorbs device/server clock skew
    // and the create-then-close race window.
    // Surface the blob-vs-relational read sources for the admin Migration
    // Health panel (Step 3 readiness check — 'relational' on all three is a
    // precondition for retiring the blob columns).
    try{ window._luLoadSources={tasks:sd._tasksSource||'?',notes:sd._notesSource||'?',ideas:sd._ideasSource||'?',at:new Date().toISOString()}; }catch(_){}
    let _srvUpd=0;
    try{ if(sd&&sd.updatedAt!=null)_srvUpd=new Date(sd.updatedAt).getTime()||0; }catch(_){ _srvUpd=0; }
    const _GRACE=90*1000;
    const _itemTime=x=>{
      const t=Date.parse(x&&(x.createdAt||x.updatedAt||x.created)||0);
      if(t)return t;
      return (x&&typeof x.id==='number'&&x.id>1e12)?x.id:0; // Date.now() id
    };
    keys.forEach(k=>{
      const srv=sd[k];
      if(srv&&Array.isArray(srv)&&srv.length>0){
        let local=[];
        try{local=JSON.parse(localStorage.getItem('lu_'+k)||'null');}catch(_){}
        if(!Array.isArray(local))local=[];
        // The localStorage cache goes stale whenever a write hit the quota
        // limit — e.g. a freshly imported note too big to fit. The running
        // app's in-memory D[k] is authoritative for this session, so fold in
        // any in-memory items the cache is missing; otherwise the merge below
        // silently drops them and the import is lost on the next load.
        const _mem=Array.isArray(D[k])?D[k]:[];
        const _cachedIds=new Set(local.map(x=>x&&x.id));
        for(const _x of _mem){ if(_x&&_x.id!=null&&!_cachedIds.has(_x.id))local.push(_x); }
        const srvIds=new Set(srv.map(x=>x&&x.id));
        // Keep a local-only item only if it looks like a brand-new local
        // addition (created at/after the server's last write, minus grace).
        // Otherwise it's a remote deletion → drop it so the delete sticks.
        const localOnly=local.filter(x=>x&&x.id!=null&&!srvIds.has(x.id)&&(!_srvUpd|| _itemTime(x) >= (_srvUpd-_GRACE)));
        const merged=localOnly.length?srv.concat(localOnly):srv;
        D[k]=merged;
        // Use the quota-safe writer — merged can exceed the cache limit, and
        // a raw setItem throw here would abort the rest of the merge.
        if(typeof _safeOrigSave==='function')_safeOrigSave(k);
        else localStorage.setItem('lu_'+k,JSON.stringify(merged));
        changed=true;
        // Rescued unsynced local items → heal the server so they persist.
        if(localOnly.length){
          try{clearTimeout(_syncTimers[k]);}catch(_){}
          setTimeout(()=>_pushKeyToServer(k),1500);
          console.warn('[appData] rescued',localOnly.length,'unsynced local '+k+' item(s) and re-syncing');
        }
        // If habits just arrived from the server, re-run the owner-
        // migration so server-side seed data also lands under the
        // current user.
        if(k==='habits'){
          try{localStorage.removeItem('lu_habits_owner_migrated_v1');}catch(_){}
          if(typeof reassignHabitsToOwner==='function')reassignHabitsToOwner();
        }
        // When notes arrive from the server, run the one-time favorite→starred
        // backfill (no-op if it already ran; the flag stays set so a later
        // un-star is never re-applied from a lingering favorite:true).
        if(k==='notes'){
          if(typeof _backfillNoteStarredFromFavorite==='function')_backfillNoteStarredFromFavorite();
        }
      }
    });
    // Atlas snapshot (one-way mirror from CFResourcePlanner). Object-shaped,
    // not array — just replace wholesale. The server is the only writer
    // (via atlas.pull); the client never mutates D.atlas.
    if(sd.atlas&&typeof sd.atlas==='object'){
      D.atlas=sd.atlas;
      changed=true;
    }
    // Atlas per-user annotations (notes/tags on individual Atlas items).
    // Object keyed by `{type}:{id}`. Editable on the client; persisted via
    // appData.save's atlasAnnotations field.
    if(sd.atlasAnnotations&&typeof sd.atlasAnnotations==='object'){
      D.atlasAnnotations=sd.atlasAnnotations;changed=true;
    } else if(!D.atlasAnnotations){
      D.atlasAnnotations={};
    }
    if(sd.prefs&&typeof sd.prefs==='object'&&Object.keys(sd.prefs).length>0){
      D.prefs=Object.assign({},D.prefs,sd.prefs);
      localStorage.setItem('lu_prefs',JSON.stringify(D.prefs));
      // The server's user_app_data table doesn't have a dedicated aiTopics
      // column, so we mirror aiTopics through prefs.aiTopics for cross-device
      // persistence. Restore it back to D.aiTopics here.
      if(Array.isArray(D.prefs.aiTopics)&&D.prefs.aiTopics.length){
        D.aiTopics=D.prefs.aiTopics.slice();
        localStorage.setItem('lu_aiTopics',JSON.stringify(D.aiTopics));
      }
      changed=true;
    }
    if(changed){
      applyPrefs();
      // Re-render current screen with restored data
      if(typeof renderScreen==='function'&&typeof curScreen!=='undefined'){
        renderScreen(curScreen);
      }
      updateSidebarBadges&&updateSidebarBadges();
    }
    } // end else (sd present)
  }catch(mergeErr){
    // Non-fatal: the server load succeeded and the gate is already open,
    // so syncing still works even if merging/re-rendering hiccupped.
    console.warn('[appData] post-load merge/render error (non-fatal)',mergeErr&&mergeErr.message);
  }
  _loadInFlight=false;
  _flushPendingSync();
}
// Self-heal watchdog: if something edits before sync is ready (e.g. the
// returning-session path never ran loadServerData, or it errored), kick a
// load so the gate opens and the user's edits actually reach the server.
let _syncWatchT=null;
function _ensureSyncReady(){
  if(_serverSyncReady||_loadInFlight)return;
  clearTimeout(_syncWatchT);
  _syncWatchT=setTimeout(()=>{ if(!_serverSyncReady&&!_loadInFlight) loadServerData(); },1200);
}
// ═══════════════════════════════════════════════════════════════════════════════
// MINDMAP FEATURE — LevelUp Second Brain
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Data ────────────────────────────────────────────────────────────────────
if(!D.mindmaps) D.mindmaps = JSON.parse(localStorage.getItem('lu_mindmaps') || 'null') || [];

function saveMindmaps(){ localStorage.setItem('lu_mindmaps', JSON.stringify(D.mindmaps)); _syncMindmapsDebounced(); }
let _mmSyncTimer=null;
function _syncMindmapsDebounced(){ clearTimeout(_mmSyncTimer); _mmSyncTimer=setTimeout(()=>{ if(typeof _trpc==='function') _trpc('appData.save',{mindmaps:JSON.stringify(D.mindmaps)},'mutation').catch(()=>{}); },2000); }

let _mmCurrent = null; // currently open mindmap
let _mmDrag = null;    // drag state
let _mmPan = {x:0, y:0}; // canvas pan offset
let _mmZoom = 1;
let _mmConnecting = null; // node id being connected from
let _mmSelected = null; // single selection (back-compat)
let _mmSelectedSet = new Set(); // M6: multi-select set
let _mmInlineEditId = null; // M4: which node is being inline-edited
let _mmHistory = []; // M8: undo stack of mindmap snapshots
let _mmHistoryIdx = -1;
let _mmSearchQuery = ''; // M12
let _mmMarquee = null; // M6: drag-rectangle selection state
let _mmSelectedEdge = null; // M14: index of the currently-selected edge (connection)

const MM_SHAPES = ['rect','pill','circle','diamond','hexagon','cloud'];
const MM_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#64748b','#f97316'];
const MM_ICONS  = ['','🎯','💡','📋','📁','📝','✅','⚠️','🔥','⭐','🚀','🧩','🔗','💬','🧠','🪴','📊','🛠','📚','🎨','🏆','💎','⚡','🌱','🔭','🪞','🧭','🎓','📦'];
const MM_LAYOUTS = [{k:'free',l:'Free'},{k:'radial',l:'Radial'},{k:'tree',l:'Tree (L→R)'},{k:'org',l:'Org (top-down)'}];

function _mmNextId(arr){ return arr.length ? Math.max(...arr.map(x=>x.id))+1 : 1; }
// Backwards-compatible accessor: ensure new fields exist on legacy nodes/edges/maps.
function _mmDefaults(mm){
  if(!mm)return;
  mm.layout=mm.layout||'free';
  (mm.nodes||[]).forEach(n=>{
    if(typeof n.shape==='undefined')n.shape='rect';
    if(typeof n.icon==='undefined')n.icon='';
    if(!Array.isArray(n.subItems))n.subItems=[];
    if(typeof n.description==='undefined')n.description='';
    if(typeof n.collapsed==='undefined')n.collapsed=false;
  });
  (mm.edges||[]).forEach(e=>{
    if(typeof e.style==='undefined')e.style='solid';
    if(typeof e.arrow==='undefined')e.arrow='none';
    if(typeof e.thickness==='undefined')e.thickness=2;
    if(typeof e.label==='undefined')e.label='';
  });
}
// M8: snapshot helpers — capture before each mutation; replay on undo/redo.
function _mmSnap(){
  if(!_mmCurrent)return;
  const snap=JSON.parse(JSON.stringify({nodes:_mmCurrent.nodes,edges:_mmCurrent.edges,layout:_mmCurrent.layout}));
  _mmHistory=_mmHistory.slice(0,_mmHistoryIdx+1);
  _mmHistory.push(snap);
  if(_mmHistory.length>30)_mmHistory.shift();
  _mmHistoryIdx=_mmHistory.length-1;
}
function mmUndo(){if(_mmHistoryIdx<=0)return toast('Nothing to undo');_mmHistoryIdx--;_mmRestoreSnap();}
function mmRedo(){if(_mmHistoryIdx>=_mmHistory.length-1)return toast('Nothing to redo');_mmHistoryIdx++;_mmRestoreSnap();}
function _mmRestoreSnap(){
  const s=_mmHistory[_mmHistoryIdx];if(!s||!_mmCurrent)return;
  _mmCurrent.nodes=JSON.parse(JSON.stringify(s.nodes));
  _mmCurrent.edges=JSON.parse(JSON.stringify(s.edges));
  _mmCurrent.layout=s.layout;
  _mmCurrent.updatedAt=new Date().toISOString();
  saveMindmaps();renderMindmapCanvas();
}
// M13: collapse helpers — when a node is collapsed, hide all descendants.
function _mmDescendants(rootId){
  if(!_mmCurrent)return new Set();
  const out=new Set();const stack=[rootId];const seen=new Set([rootId]);
  while(stack.length){
    const id=stack.pop();
    _mmCurrent.edges.forEach(e=>{
      if(e.from===id&&!seen.has(e.to)){seen.add(e.to);out.add(e.to);stack.push(e.to);}
    });
  }
  return out;
}
function _mmHiddenNodeIds(){
  if(!_mmCurrent)return new Set();
  const hidden=new Set();
  _mmCurrent.nodes.filter(n=>n.collapsed).forEach(n=>{
    _mmDescendants(n.id).forEach(id=>hidden.add(id));
  });
  return hidden;
}
function _mmHasChildren(id){return _mmCurrent&&_mmCurrent.edges.some(e=>e.from===id);}

// ─── Render ──────────────────────────────────────────────────────────────────
function renderMindmaps(){
  const main = document.getElementById('mindmap-main');
  if(!main) return;
  if(_mmCurrent){
    renderMindmapCanvas();
    return;
  }
  // List view
  const maps = D.mindmaps || [];
  main.innerHTML = `
  <div class="ph-r" style="margin-bottom:16px">
    <div><h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('brain',22,'var(--page-accent)')}Mind Maps</h1>
    <p style="font-size:12px;color:var(--t2)">${(()=>{const ms=D.mindmaps||[];const total=ms.length;const nodes=ms.reduce((s,m)=>s+((m.nodes||[]).length),0);return total?`${total} mind map${total!==1?'s':''}${nodes?` · ${nodes} node${nodes!==1?'s':''}`:''}`:'No mind maps yet — create one to start brainstorming.';})()}</p></div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-s" onclick="nav('graph')" title="Open the auto-generated Knowledge Graph of your notes &amp; links">Knowledge Graph</button>
      <button class="btn btn-p" onclick="mmCreate()">+ New Mind Map</button>
    </div>
  </div>
  ${typeof _renderSharedMindMapsSection==='function'?_renderSharedMindMapsSection():''}
  ${maps.length === 0 ? `
    <div style="text-align:center;padding:60px 20px;color:var(--t3)">
      <div style="font-size:48px;margin-bottom:12px">🧠</div>
      <div style="font-size:14px;font-weight:500;margin-bottom:6px">No mind maps yet</div>
      <div style="font-size:12px;margin-bottom:16px">Create your first mind map to start brainstorming and planning visually.</div>
      <button class="btn btn-p" onclick="mmCreate()">+ Create Mind Map</button>
    </div>
  ` : `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
      ${maps.map(m => `
        <div style="background:var(--s2);border:1px solid var(--bd2);border-radius:10px;padding:16px;cursor:pointer;transition:border-color .15s" onmouseover="this.style.borderColor='var(--ac)'" onmouseout="this.style.borderColor='var(--bd2)'" onclick="mmOpen(${m.id})">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-size:20px">${m.icon||'🧠'}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.title)}</div>
              <div style="font-size:11px;color:var(--t3)">${m.nodes.length} nodes · ${m.edges.length} connections</div>
            </div>
          </div>
          <div style="font-size:11px;color:var(--t3)">Updated ${timeAgo(m.updatedAt)}</div>
          ${(m.assignedTo||((m.assignees||[]).length))?`<div style="font-size:11px;color:var(--purp);margin-top:4px">👥 ${esc(m.assignedTo||'')}${(m.assignees||[]).length>1?(' +'+((m.assignees||[]).length-1)):''}</div>`:''}
          <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
            <button class="btn btn-s" style="font-size:11px;height:22px" onclick="event.stopPropagation();mmRename(${m.id})">✏ Rename</button>
            <button class="btn btn-s" style="font-size:11px;height:22px" onclick="event.stopPropagation();_openMindMapAssign(${m.id})">👥 Assign</button>
            <button class="btn btn-s" style="font-size:11px;height:22px" onclick="event.stopPropagation();mmDuplicate(${m.id})">📋 Clone</button>
            <button class="btn btn-s" style="font-size:11px;height:22px;color:var(--red)" onclick="event.stopPropagation();mmDelete(${m.id})">🗑</button>
          </div>
        </div>
      `).join('')}
    </div>
  `}`;
}

// ── Mind-map assignment + sharing (multi-assignee + Primary Responsible) ──
function _openMindMapAssign(id){
  const mm=(D.mindmaps||[]).find(m=>m.id===id); if(!mm){toast('Mind map not found');return;}
  const modal=document.getElementById('modal-content'); const bg=document.getElementById('modal-capture');
  if(!modal||!bg){toast('Editor not available');return;}
  modal.innerHTML=`<div style="padding:16px;max-width:480px">
    <h2 style="font-size:14px;font-weight:600;margin-bottom:4px">👥 Assign Mind Map</h2>
    <div style="font-size:11px;color:var(--t3);margin-bottom:10px">${esc(mm.title||mm.name||'Untitled')}</div>
    <div class="field"><label>Assignees <span style="font-size:11px;color:var(--t3);font-weight:400">★ = Primary Responsible</span></label>${buildMultiAssignee('mm-assign-ma',mm)}</div>
    <div class="dr-actions" style="margin-top:14px">
      <button class="btn btn-p" onclick="_saveMindMapAssign(${id})">Save</button>
      <button class="btn btn-s" onclick="document.getElementById('modal-capture').classList.remove('show')">Cancel</button>
    </div>
  </div>`;
  bg.classList.add('show');
}
function _saveMindMapAssign(id){
  const mm=(D.mindmaps||[]).find(m=>m.id===id); if(!mm)return;
  if(typeof _maGet==='function'){ const ma=_maGet('mm-assign-ma'); mm.assignees=ma.assignees; mm.assigneeNames=ma.assigneeNames; mm.primaryAssigneeId=ma.primaryAssigneeId; const pi=ma.assignees.indexOf(ma.primaryAssigneeId); mm.assignedTo=pi>=0?ma.assigneeNames[pi]:''; }
  mm.updatedAt=new Date().toISOString();
  if(typeof saveMindmaps==='function')saveMindmaps();
  document.getElementById('modal-capture').classList.remove('show');
  toast({type:'success',title:'Assigned',msg:mm.assignedTo?('Primary: '+mm.assignedTo):'Assignees updated.',duration:1800});
  if(typeof renderMindmaps==='function')renderMindmaps();
}
async function _loadSharedMindMaps(){
  try{ if(typeof _trpc!=='function')return; const res=await _trpc('appData.sharedMindMapsForMe',undefined,'query');
    if(res&&res.ok&&Array.isArray(res.mindmaps)){ D._sharedMindMaps=res.mindmaps.map((p,i)=>({...p,_idx:i})); if(typeof curScreen!=='undefined'&&curScreen==='mindmaps'&&typeof renderMindmaps==='function')renderMindmaps(); }
  }catch(e){ /* non-fatal */ }
}
function _renderSharedMindMapsSection(){
  const shared=Array.isArray(D._sharedMindMaps)?D._sharedMindMaps:[];
  if(!shared.length)return '';
  const open=!(D.prefs&&D.prefs.sharedMMSectionCollapsed);
  return `<div class="cd" style="border-left:3px solid var(--purp);margin-bottom:12px">
    <div onclick="_toggleSharedMMSection()" style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:2px 0;${open?'margin-bottom:8px':''}">
      <span style="display:inline-block;font-size:11px;${open?'':'transform:rotate(-90deg)'}">▾</span>
      <span style="font-size:12px;font-weight:600;color:var(--purp)">Shared &amp; delegated</span>
      <span style="font-size:11px;font-weight:600;color:var(--purp);background:color-mix(in srgb,var(--purp) 14%,transparent);padding:1px 7px;border-radius:8px">${shared.length}</span>
      <span style="flex:1"></span><span style="font-size:11px;color:var(--t3)">click to edit · assigned to/by you</span>
    </div>
    ${open?shared.map(_sharedMindMapCard).join(''):''}
  </div>`;
}
function _toggleSharedMMSection(){ D.prefs=D.prefs||{}; D.prefs.sharedMMSectionCollapsed=!D.prefs.sharedMMSectionCollapsed; try{save('prefs');}catch(_){} if(typeof renderMindmaps==='function')renderMindmaps(); }
function _sharedMindMapCard(p){
  const delegated=!!p._delegated;
  const who=delegated?(p._assigneeName||'someone'):(typeof _userNameById==='function'?_userNameById(p._sharedFromUserId):'a teammate');
  const badge=delegated?'DELEGATED':'SHARED';
  const sub=delegated?('assigned to '+esc(who)):('from '+esc(who));
  return `<div onclick="_openSharedMindMapView(${Number(p._idx)||0})" style="background:var(--s2);border:1px solid var(--bd1);border-left:3px solid var(--purp);border-radius:8px;padding:8px 10px;margin-bottom:6px;cursor:pointer" title="Shared mind map — click to edit">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:9px;font-weight:700;color:var(--purp);background:color-mix(in srgb,var(--purp) 14%,transparent);padding:2px 6px;border-radius:6px;flex-shrink:0">${badge}</span>
      <span style="font-size:13px;font-weight:600;color:var(--t1);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((p.icon?p.icon+' ':'🧠 ')+(p.title||p.name||'Untitled'))}</span>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-top:2px">${(p.nodes||[]).length} nodes · ${sub}</div>
  </div>`;
}
async function _openSharedMindMapView(idx){
  let p=(D._sharedMindMaps||[])[idx];
  if(!p&&typeof _loadSharedMindMaps==='function'){ await _loadSharedMindMaps(); p=(D._sharedMindMaps||[])[idx]; }
  if(!p){toast('Shared mind map not found — try refreshing.');return;}
  const from=p._delegated?'you':(typeof _userNameById==='function'?_userNameById(p._sharedFromUserId):'a teammate');
  const modal=document.getElementById('modal-content'); const bg=document.getElementById('modal-capture');
  if(!modal||!bg){toast('Editor not available');return;}
  const adminSh=['admin','owner'].includes(String((D.creds&&D.creds.role)||'').toLowerCase());
  modal.innerHTML=`<div style="padding:16px;max-width:480px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span style="font-size:9px;font-weight:700;letter-spacing:.04em;color:var(--purp);background:color-mix(in srgb,var(--purp) 14%,transparent);padding:2px 6px;border-radius:6px">${p._delegated?'DELEGATED':'SHARED'} · EDITABLE</span>
      <span style="font-size:11px;color:var(--t3)">${p._delegated?('assigned to '+esc(p._assigneeName||'someone')):('owned by '+esc(from))}</span>
    </div>
    <div class="field"><label>Name</label><input class="inp" id="smm-name" value="${esc(p.title||p.name||'')}"></div>
    <div class="field"><label>Assignees <span style="font-size:11px;color:var(--t3);font-weight:400">★ = Primary Responsible</span></label>${buildMultiAssignee('smm-ma',p)}</div>
    <div class="dr-actions" style="margin-top:14px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="_saveSharedMindMap(${Number(idx)||0})">Save</button>
      ${adminSh&&!p._delegated?`<button class="btn btn-s" style="border-color:var(--ac);color:var(--ac)" onclick="_takeOwnership(${Number(idx)||0},'mindmaps')" title="Move this mind map into your workspace; the current owner stays an assignee">⬇ Take ownership</button>`:''}
      ${adminSh?`<button class="btn btn-d" onclick="_deleteSharedItem(${Number(idx)||0},'mindmaps')">Delete</button>`:''}
      <button class="btn btn-s" onclick="document.getElementById('modal-capture').classList.remove('show')">Cancel</button>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-top:8px">${adminSh?'Admin: edit, reassign, take ownership &amp; delete — the graph stays with the owner.':'Saved to the mind-map owner.'}</div>
  </div>`;
  bg.classList.add('show');
}
async function _saveSharedMindMap(idx){
  const p=(D._sharedMindMaps||[])[idx]; if(!p){toast('Could not save — refresh and try again.');return;}
  const ownerUserId=Number(p._sharedFromUserId)||0; const mindmapId=String(p.id);
  const g=id=>document.getElementById(id);
  const patch={ name:(g('smm-name')?.value||'').trim() };
  if(typeof _maGet==='function'){ const ma=_maGet('smm-ma'); patch.assignees=ma.assignees; patch.assigneeNames=ma.assigneeNames; patch.primaryAssigneeId=ma.primaryAssigneeId; }
  try{
    const res=await _trpc('appData.updateSharedMindMap',{ownerUserId,mindmapId,patch},'mutation');
    if(res&&res.ok){
      Object.assign(p,patch); if(patch.name)p.title=patch.name;
      const mine=(D.mindmaps||[]).find(x=>String(x.id)===mindmapId);
      if(mine){ if(patch.name)mine.title=patch.name; mine.assignees=patch.assignees; mine.assigneeNames=patch.assigneeNames; mine.primaryAssigneeId=patch.primaryAssigneeId; try{if(typeof saveMindmaps==='function')saveMindmaps();}catch(_){} }
      toast({type:'success',title:'Saved',msg:'Changes saved to the mind-map owner.',duration:2200});
      document.getElementById('modal-capture').classList.remove('show');
      if(typeof _loadSharedMindMaps==='function')_loadSharedMindMaps();
      else if(typeof renderMindmaps==='function')renderMindmaps();
    }else{ toast({type:'error',title:'Could not save',msg:(res&&res.error)||'Try again.'}); }
  }catch(e){ toast({type:'error',title:'Could not save',msg:String(e&&e.message||e)}); }
}
function mmCreate(){
  // M11: route through the template picker instead of a bare prompt.
  if(typeof mmShowTemplates==='function')return mmShowTemplates();
  const title = prompt('Mind map name:', 'New Mind Map');
  if(!title) return;
  const mm = {id:_mmNextId(D.mindmaps),title:title.trim(),icon:'🧠',nodes:[{id:1,text:title.trim(),x:400,y:300,color:'#3b82f6',shape:'rect',icon:'',subItems:[],description:'',collapsed:false,isRoot:true}],edges:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),layout:'free'};
  D.mindmaps.push(mm);saveMindmaps();mmOpen(mm.id);
}

function mmOpen(id){
  _mmCurrent = D.mindmaps.find(m=>m.id===id);
  _mmDefaults(_mmCurrent);
  _mmPan = {x:0, y:0};
  _mmZoom = 1;
  _mmSelected = null;
  _mmSelectedSet = new Set();
  _mmConnecting = null;
  _mmInlineEditId = null;
  _mmHistory = []; _mmHistoryIdx = -1;
  _mmSnap();
  renderMindmapCanvas();
}

function mmClose(){
  _mmCurrent = null;
  _mmSelected = null;
  _mmConnecting = null;
  renderMindmaps();
}

function mmRename(id){
  const mm = D.mindmaps.find(m=>m.id===id);
  if(!mm) return;
  const t = prompt('Rename mind map:', mm.title);
  if(t && t.trim()){ mm.title = t.trim(); mm.updatedAt = new Date().toISOString(); saveMindmaps(); renderMindmaps(); }
}

function mmDuplicate(id){
  const mm = D.mindmaps.find(m=>m.id===id);
  if(!mm) return;
  const clone = JSON.parse(JSON.stringify(mm));
  clone.id = _mmNextId(D.mindmaps);
  clone.title = mm.title + ' (copy)';
  clone.createdAt = new Date().toISOString();
  clone.updatedAt = new Date().toISOString();
  D.mindmaps.push(clone);
  saveMindmaps();
  renderMindmaps();
  toast('📋 Mind map cloned');
}

function mmDelete(id){
  if(!confirm('Delete this mind map?')) return;
  D.mindmaps = D.mindmaps.filter(m=>m.id!==id);
  saveMindmaps();
  renderMindmaps();
  toast('🗑 Mind map deleted');
}

// ─── Canvas Rendering ────────────────────────────────────────────────────────
function renderMindmapCanvas(){
  const main = document.getElementById('mindmap-main');
  if(!main || !_mmCurrent) return;
  _mmDefaults(_mmCurrent);
  const mm = _mmCurrent;
  const layoutOpts=MM_LAYOUTS.map(l=>`<option value="${l.k}" ${(mm.layout||'free')===l.k?'selected':''}>${l.l}</option>`).join('');
  main.innerHTML = `
  <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap">
    <button class="btn btn-s" style="height:28px;font-size:11px" onclick="mmClose()">← Back</button>
    <h2 style="font-size:16px;font-weight:700;margin:0">${mm.icon} ${esc(mm.title)}</h2>
    <span style="flex:1"></span>
    <input id="mm-search" placeholder="🔍 Search…" value="${esc(_mmSearchQuery)}" style="height:26px;font-size:11px;width:140px;padding:0 8px;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;color:var(--t1)" oninput="mmSearch(this.value)">
    <button class="btn btn-s" style="height:28px;font-size:11px" onclick="mmUndo()" title="Undo (Cmd/Ctrl+Z)">↶</button>
    <button class="btn btn-s" style="height:28px;font-size:11px" onclick="mmRedo()" title="Redo (Cmd/Ctrl+Shift+Z)">↷</button>
    <button class="btn btn-s" style="height:28px;font-size:11px" onclick="mmAddNode()" title="Add a new node">+ Node</button>
    <button class="btn btn-s" style="height:28px;font-size:11px;${_mmConnecting?'background:var(--ac);color:#fff':''}" onclick="mmToggleConnect()" title="Click to start connecting nodes">${_mmConnecting?'🔗 Connecting…':'🔗 Connect'}</button>
    <select class="inp" style="height:28px;font-size:11px;padding:0 6px" onchange="mmSetLayout(this.value)" title="Layout type">${layoutOpts}</select>
    <button class="btn btn-s" style="height:28px;font-size:11px" onclick="mmAutoLayout()" title="Apply layout">⚡ Apply</button>
    <div style="position:relative;display:inline-block">
      <button class="btn btn-s" style="height:28px;font-size:11px;color:var(--ac)" onclick="event.stopPropagation();togglePopMenu('mm-ai-menu')" title="AI tools">✨ AI ▾</button>
      <div id="mm-ai-menu" data-pop-menu="1" style="display:none;position:absolute;right:0;top:32px;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:4px;z-index:50;min-width:200px;box-shadow:0 4px 16px rgba(0,0,0,.35)">
        <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:26px;font-size:11px;color:var(--ac);background:transparent;border:none;text-align:left" onclick="closePopMenu('mm-ai-menu');mmAIExpandSelected()">💡 Expand selected node</button>
        <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:26px;font-size:11px;color:var(--purp);background:transparent;border:none;text-align:left" onclick="closePopMenu('mm-ai-menu');mmAISummarize()">📜 Summarize map</button>
        <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:26px;font-size:11px;color:var(--grn);background:transparent;border:none;text-align:left" onclick="closePopMenu('mm-ai-menu');mmAISuggestConnections()">🔗 Suggest connections</button>
      </div>
    </div>
    <div style="position:relative;display:inline-block">
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="event.stopPropagation();togglePopMenu('mm-export-menu')" title="Export">⬇ Export ▾</button>
      <div id="mm-export-menu" data-pop-menu="1" style="display:none;position:absolute;right:0;top:32px;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:4px;z-index:50;min-width:160px;box-shadow:0 4px 16px rgba(0,0,0,.35)">
        <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:26px;font-size:11px;background:transparent;border:none;text-align:left" onclick="closePopMenu('mm-export-menu');mmExportSVG()">🖼 SVG</button>
        <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:26px;font-size:11px;background:transparent;border:none;text-align:left" onclick="closePopMenu('mm-export-menu');mmExportPNG()">🖼 PNG</button>
        <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:26px;font-size:11px;background:transparent;border:none;text-align:left" onclick="closePopMenu('mm-export-menu');mmExportMarkdown()">⬇ Markdown outline</button>
      </div>
    </div>
    <button class="btn btn-s" style="height:28px;font-size:11px" onclick="mmZoomIn()" title="Zoom in">🔍+</button>
    <button class="btn btn-s" style="height:28px;font-size:11px" onclick="mmZoomOut()" title="Zoom out">🔍−</button>
    <button class="btn btn-s" style="height:28px;font-size:11px" onclick="mmResetView()" title="Reset view">⊞</button>
  </div>
  <div class="mm-stage" style="position:relative;flex:1;display:flex;min-height:500px">
    <div id="mm-canvas-wrap" style="position:relative;flex:1;background:var(--s2);border:1px solid var(--bd2);border-radius:10px;overflow:hidden;cursor:grab"
      onmousedown="mmCanvasMouseDown(event)"
      onmousemove="mmCanvasMouseMove(event)"
      onmouseup="mmCanvasMouseUp(event)"
      onwheel="mmCanvasWheel(event)"
      ondblclick="mmCanvasDblClick(event)"
      oncontextmenu="event.preventDefault()">
      <svg id="mm-svg" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1"></svg>
      <div id="mm-nodes" style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:2"></div>
      <div id="mm-marquee-layer" style="position:absolute;inset:0;pointer-events:none;z-index:3"></div>
    </div>
    <aside class="mm-side" id="mm-side"></aside>
  </div>
  <div id="mm-context-menu" style="display:none;position:fixed;background:var(--s1);border:1px solid var(--bd2);border-radius:8px;padding:4px;z-index:9999;min-width:170px;box-shadow:0 4px 12px rgba(0,0,0,.4)"></div>
  <div style="margin-top:8px;font-size:11px;color:var(--t3)">
    💡 Double-click canvas to add · drag node to move · right-click for actions · click node to select · shift+click to multi-select · click a connection line to edit/delete it · Tab=child · Enter=sibling · Delete=remove · /=search · scroll=zoom
  </div>`;
  mmDrawNodes();
  mmDrawEdges();
  mmRenderSidePanel();
}
function mmSetLayout(v){if(!_mmCurrent)return;_mmCurrent.layout=v||'free';_mmCurrent.updatedAt=new Date().toISOString();saveMindmaps();}
function mmSearch(q){
  _mmSearchQuery=q||'';
  document.querySelectorAll('.mm-node').forEach(el=>el.classList.remove('mm-search-match'));
  if(!q)return;
  const lc=q.toLowerCase();
  (_mmCurrent.nodes||[]).filter(n=>(n.text||'').toLowerCase().includes(lc)||(n.description||'').toLowerCase().includes(lc)).forEach(n=>{
    const el=document.querySelector(`.mm-node[data-id="${n.id}"]`);if(el)el.classList.add('mm-search-match');
  });
}

function mmDrawNodes(){
  const container = document.getElementById('mm-nodes');
  if(!container || !_mmCurrent) return;
  const mm = _mmCurrent;
  const hidden=_mmHiddenNodeIds();
  container.innerHTML = mm.nodes.filter(n=>!hidden.has(n.id)).map(n => {
    const isMulti=_mmSelectedSet.size>1;
    const sel = (isMulti?_mmSelectedSet.has(n.id):_mmSelected === n.id);
    const connecting = _mmConnecting === n.id;
    const editing = _mmInlineEditId === n.id;
    const fill = n.color||'#3b82f6';
    const shape = n.shape||'rect';
    // Subitems (M3) — only render when there are any
    const subHtml=(n.subItems&&n.subItems.length)?`<div class="mm-node-subitems">${n.subItems.map((s,i)=>`<div class="mm-node-subitem ${s.done?'done':''}" onclick="event.stopPropagation();mmToggleSubItem(${n.id},${i})"><span class="chk"></span><span>${esc(s.text||'')}</span></div>`).join('')}<div class="mm-node-subitem-add" onclick="event.stopPropagation();mmAddSubItem(${n.id})">+ add sub-item</div></div>`:'';
    // Collapse triangle (M13) — only when this node has children
    const hasKids=_mmHasChildren(n.id);
    const collapseBtn=hasKids?`<span class="mm-node-collapse" title="${n.collapsed?'Expand subtree':'Collapse subtree'}" onclick="event.stopPropagation();mmToggleCollapse(${n.id})">${n.collapsed?'▸':'▾'}</span>`:'';
    const iconHtml=n.icon?`<span class="mm-node-icon">${n.icon}</span>`:'';
    const textHtml=editing
      ? `<input class="mm-node-edit" value="${esc(n.text||'')}" onclick="event.stopPropagation()" onkeydown="mmInlineEditKey(event,${n.id})" onblur="mmInlineEditCommit(${n.id},this.value)" autofocus>`
      : `<span class="mm-node-text" ondblclick="event.stopPropagation();mmStartInlineEdit(${n.id})">${esc(n.text||'(empty)')}</span>`;
    return `<div class="mm-node ${sel?'mm-selected':''} ${connecting?'mm-connecting-from':''}" data-id="${n.id}" data-shape="${shape}"
      style="left:${n.x * _mmZoom + _mmPan.x}px;top:${n.y * _mmZoom + _mmPan.y}px;
        transform:translate(-50%,-50%) scale(${_mmZoom});
        --mm-fill:${fill};
        background:${shape==='diamond'||shape==='hexagon'?fill:fill+'22'};
        border-color:${fill};
        cursor:${_mmConnecting?'crosshair':editing?'text':'grab'};
        font-weight:${n.isRoot?'700':'500'};
        flex-direction:${(n.subItems&&n.subItems.length)?'column':'row'};
        align-items:${(n.subItems&&n.subItems.length)?'stretch':'center'}"
      onmousedown="mmNodeMouseDown(event,${n.id})"
      onclick="mmNodeClick(event,${n.id})"
      oncontextmenu="mmNodeContext(event,${n.id})">
      <div style="display:flex;align-items:center;gap:6px;width:100%">${iconHtml}${textHtml}${collapseBtn}</div>
      ${subHtml}
    </div>`;
  }).join('');
  // Focus the inline edit input if active
  if(_mmInlineEditId){const el=container.querySelector(`.mm-node[data-id="${_mmInlineEditId}"] .mm-node-edit`);if(el)el.focus();}
  // (Re-)attach touch handlers to the freshly-rendered nodes for iOS support.
  if(typeof _mmAttachTouchHandlers==='function')_mmAttachTouchHandlers();
}

function mmDrawEdges(){
  const svg = document.getElementById('mm-svg');
  if(!svg || !_mmCurrent) return;
  const mm = _mmCurrent;
  const hidden=_mmHiddenNodeIds();
  // Build defs for arrow markers per color (so the arrow inherits the line color).
  const colors=new Set();
  mm.edges.forEach(e=>{const f=mm.nodes.find(n=>n.id===e.from);if(f)colors.add(f.color||'#3b82f6');});
  const defs=`<defs>${[...colors].map((c,i)=>`<marker id="mm-arr-${i}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`).join('')}</defs>`;
  const colorIdx=Object.fromEntries([...colors].map((c,i)=>[c,i]));
  let paths = '';
  mm.edges.forEach((e, ei) => {
    const from = mm.nodes.find(n=>n.id===e.from);
    const to = mm.nodes.find(n=>n.id===e.to);
    if(!from || !to) return;
    if(hidden.has(from.id)||hidden.has(to.id))return;
    const x1 = from.x * _mmZoom + _mmPan.x;
    const y1 = from.y * _mmZoom + _mmPan.y;
    const x2 = to.x * _mmZoom + _mmPan.x;
    const y2 = to.y * _mmZoom + _mmPan.y;
    const mx = (x1+x2)/2;
    const my = (y1+y2)/2 - 20;
    const c=from.color||'#3b82f6';
    const sel=_mmSelectedEdge===ei;
    const dash=(e.style==='dashed')?'6 4':'';
    const w=Math.max(1,Math.min(6,e.thickness||2));
    const arrow=e.arrow==='to'||e.arrow==='both'?` marker-end="url(#mm-arr-${colorIdx[c]})"`:'';
    const arrowStart=e.arrow==='both'?` marker-start="url(#mm-arr-${colorIdx[c]})"`:'';
    const d=`M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
    // Selected edge gets a soft glow halo underneath the line.
    if(sel){paths += `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w+8}" stroke-opacity="0.22" stroke-linecap="round" style="pointer-events:none"/>`;}
    // Invisible fat hit-area so the thin line is easy to click / right-click.
    paths += `<path d="${d}" fill="none" stroke="transparent" stroke-width="14" style="pointer-events:stroke;cursor:pointer" onclick="mmSelectEdge(event,${ei})" oncontextmenu="mmEdgeContext(event,${ei})"/>`;
    paths += `<path d="${d}" fill="none" stroke="${c}" stroke-width="${sel?w+1:w}" stroke-opacity="${sel?'1':'0.7'}"${dash?` stroke-dasharray="${dash}"`:''}${arrow}${arrowStart} style="pointer-events:none"/>`;
    if(e.label){paths+=`<text x="${mx}" y="${my-4}" text-anchor="middle" font-size="10" fill="${c}" stroke="var(--bg)" stroke-width="3" paint-order="stroke" style="pointer-events:none">${esc(e.label)}</text>`;}
  });
  svg.innerHTML = defs+paths;
}

// ─── Canvas Interactions ─────────────────────────────────────────────────────
let _mmIsPanning = false;
let _mmPanStart = null;

// Touch-to-mouse adapter: wraps a mouse handler so it can be called from
// touchstart/move/end events (iOS Safari). Single-finger only — pinch
// gestures are handled separately below for zoom.
function _mmTouch(handler){
  return function(e){
    const t=e.touches&&e.touches[0]||(e.changedTouches&&e.changedTouches[0]);
    if(!t)return;
    e.preventDefault();
    handler({target:e.target,currentTarget:e.currentTarget,
      clientX:t.clientX,clientY:t.clientY,button:0,shiftKey:false,
      preventDefault:()=>e.preventDefault(),stopPropagation:()=>e.stopPropagation()});
  };
}
// Attach touch listeners to the canvas + every node after each render.
// Idempotent — uses a marker attribute so we don't double-bind.
function _mmAttachTouchHandlers(){
  const wrap=document.getElementById('mm-canvas-wrap');
  if(wrap&&!wrap.dataset.touchBound){
    wrap.addEventListener('touchstart',_mmTouch(mmCanvasMouseDown),{passive:false});
    wrap.addEventListener('touchmove',_mmTouch(mmCanvasMouseMove),{passive:false});
    wrap.addEventListener('touchend',_mmTouch(mmCanvasMouseUp));
    // Pinch-to-zoom — two-finger gesture
    let _pinchDist=0;
    wrap.addEventListener('touchstart',e=>{if(e.touches.length===2){_pinchDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}},{passive:true});
    wrap.addEventListener('touchmove',e=>{if(e.touches.length===2&&_pinchDist){e.preventDefault();const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);const factor=d/_pinchDist;_mmZoom=Math.max(0.3,Math.min(3,_mmZoom*factor));_pinchDist=d;mmDrawNodes();mmDrawEdges();}},{passive:false});
    wrap.dataset.touchBound='1';
  }
  // Per-node touch handlers (re-bind on every render since DOM is rebuilt).
  document.querySelectorAll('.mm-node[data-id]').forEach(el=>{
    if(el.dataset.touchBound)return;
    const id=Number(el.dataset.id);
    el.addEventListener('touchstart',_mmTouch(e=>mmNodeMouseDown(e,id)),{passive:false});
    // Long-press = context menu (no right-click on touch)
    let _lpTimer=null;
    el.addEventListener('touchstart',e=>{
      _lpTimer=setTimeout(()=>{const t=e.touches[0];if(t)mmNodeContext({preventDefault:()=>{},stopPropagation:()=>{},clientX:t.clientX,clientY:t.clientY},id);},550);
    },{passive:true});
    el.addEventListener('touchmove',()=>{if(_lpTimer){clearTimeout(_lpTimer);_lpTimer=null;}},{passive:true});
    el.addEventListener('touchend',()=>{if(_lpTimer){clearTimeout(_lpTimer);_lpTimer=null;}},{passive:true});
    el.dataset.touchBound='1';
  });
}

function mmCanvasMouseDown(e){
  if(e.target.closest('.mm-node')) return;
  // M14: a mousedown on an edge hit-path shouldn't start a pan — let its click select it.
  if(e.target.closest&&e.target.closest('#mm-svg')) return;
  if(e.button === 0){
    // M6: shift-drag = marquee select; plain drag = pan
    if(e.shiftKey){
      const rect=document.getElementById('mm-canvas-wrap').getBoundingClientRect();
      _mmMarquee={x0:e.clientX-rect.left,y0:e.clientY-rect.top,x1:e.clientX-rect.left,y1:e.clientY-rect.top};
      _mmIsPanning=false;
    }else{
      _mmIsPanning = true;
      _mmPanStart = {x: e.clientX - _mmPan.x, y: e.clientY - _mmPan.y};
      e.currentTarget.style.cursor = 'grabbing';
      // Plain click on background clears selection.
      if(_mmSelectedEdge!==null){_mmSelectedEdge=null;mmDrawEdges();}
      if(_mmSelectedSet.size||_mmSelected){_mmSelectedSet=new Set();_mmSelected=null;mmDrawNodes();mmRenderSidePanel();}
    }
  }
  const ctx = document.getElementById('mm-context-menu');
  if(ctx) ctx.style.display = 'none';
}

function mmCanvasMouseMove(e){
  if(_mmMarquee){
    const rect=document.getElementById('mm-canvas-wrap').getBoundingClientRect();
    _mmMarquee.x1=e.clientX-rect.left;_mmMarquee.y1=e.clientY-rect.top;
    _mmDrawMarquee();
    return;
  }
  if(_mmIsPanning && _mmPanStart){
    _mmPan.x = e.clientX - _mmPanStart.x;
    _mmPan.y = e.clientY - _mmPanStart.y;
    mmDrawNodes();
    mmDrawEdges();
    return;
  }
  if(_mmDrag){
    const rect = document.getElementById('mm-canvas-wrap').getBoundingClientRect();
    const newX=(e.clientX - rect.left - _mmPan.x) / _mmZoom;
    const newY=(e.clientY - rect.top - _mmPan.y) / _mmZoom;
    const node=_mmCurrent.nodes.find(n=>n.id===_mmDrag.id);
    if(!node)return;
    const dx=newX-(_mmDrag.lastX||node.x);
    const dy=newY-(_mmDrag.lastY||node.y);
    // M6: if multiple selected and the dragged node is one of them, move the whole set
    if(_mmSelectedSet.size>1 && _mmSelectedSet.has(node.id)){
      _mmSelectedSet.forEach(id=>{const n=_mmCurrent.nodes.find(x=>x.id===id);if(n){n.x+=dx;n.y+=dy;}});
    }else{
      node.x=newX;node.y=newY;
    }
    _mmDrag.lastX=newX;_mmDrag.lastY=newY;
    mmDrawNodes();
    mmDrawEdges();
  }
}

function mmCanvasMouseUp(e){
  if(_mmMarquee){
    // Compute selection from marquee bounds.
    const x0=Math.min(_mmMarquee.x0,_mmMarquee.x1),x1=Math.max(_mmMarquee.x0,_mmMarquee.x1);
    const y0=Math.min(_mmMarquee.y0,_mmMarquee.y1),y1=Math.max(_mmMarquee.y0,_mmMarquee.y1);
    _mmSelectedSet=new Set();
    (_mmCurrent.nodes||[]).forEach(n=>{const px=n.x*_mmZoom+_mmPan.x;const py=n.y*_mmZoom+_mmPan.y;if(px>=x0&&px<=x1&&py>=y0&&py<=y1)_mmSelectedSet.add(n.id);});
    _mmSelected=_mmSelectedSet.size===1?[..._mmSelectedSet][0]:null;
    _mmMarquee=null;
    _mmDrawMarquee();
    mmDrawNodes();
    mmRenderSidePanel();
    if(_mmSelectedSet.size>0)toast(`✓ ${_mmSelectedSet.size} node${_mmSelectedSet.size===1?'':'s'} selected`);
    return;
  }
  if(_mmIsPanning){
    _mmIsPanning = false;
    _mmPanStart = null;
    const wrap = document.getElementById('mm-canvas-wrap');
    if(wrap) wrap.style.cursor = 'grab';
  }
  if(_mmDrag){
    _mmSnap(); // snapshot final position
    _mmDrag = null;
    _mmCurrent.updatedAt = new Date().toISOString();
    saveMindmaps();
  }
}
function _mmDrawMarquee(){
  const layer=document.getElementById('mm-marquee-layer');if(!layer)return;
  if(!_mmMarquee){layer.innerHTML='';return;}
  const x=Math.min(_mmMarquee.x0,_mmMarquee.x1),y=Math.min(_mmMarquee.y0,_mmMarquee.y1);
  const w=Math.abs(_mmMarquee.x1-_mmMarquee.x0),h=Math.abs(_mmMarquee.y1-_mmMarquee.y0);
  layer.innerHTML=`<div class="mm-marquee" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`;
}

function mmCanvasWheel(e){
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  _mmZoom = Math.max(0.3, Math.min(3, _mmZoom + delta));
  mmDrawNodes();
  mmDrawEdges();
}

function mmCanvasDblClick(e){
  if(e.target.closest('.mm-node')) return;
  const rect = document.getElementById('mm-canvas-wrap').getBoundingClientRect();
  const x = (e.clientX - rect.left - _mmPan.x) / _mmZoom;
  const y = (e.clientY - rect.top - _mmPan.y) / _mmZoom;
  mmAddNodeAt(x, y);
}

// ─── Node Interactions ───────────────────────────────────────────────────────
function mmNodeMouseDown(e, id){
  e.stopPropagation();
  if(_mmConnecting) return;
  _mmDrag = {id, startX: e.clientX, startY: e.clientY};
}

function mmNodeClick(e, id){
  e.stopPropagation();
  if(_mmConnecting && _mmConnecting !== id){
    _mmSnap();
    const exists = _mmCurrent.edges.find(edge =>
      (edge.from===_mmConnecting && edge.to===id) || (edge.from===id && edge.to===_mmConnecting));
    if(!exists){
      _mmCurrent.edges.push({from:_mmConnecting, to:id, style:'solid', arrow:'none', thickness:2, label:''});
      _mmCurrent.updatedAt = new Date().toISOString();
      saveMindmaps();
    }
    _mmConnecting = null;
    renderMindmapCanvas();
    toast('🔗 Connected');
    return;
  }
  if(_mmSelectedEdge!==null){_mmSelectedEdge=null;mmDrawEdges();}
  // M6: shift/cmd for multi-select toggle, plain click = single-select
  if(e.shiftKey||e.metaKey||e.ctrlKey){
    if(_mmSelectedSet.has(id))_mmSelectedSet.delete(id);
    else _mmSelectedSet.add(id);
    _mmSelected = _mmSelectedSet.size===1?[..._mmSelectedSet][0]:null;
  }else{
    _mmSelectedSet=new Set([id]);
    _mmSelected = (_mmSelected === id) ? id : id;
  }
  mmDrawNodes();
  mmRenderSidePanel();
}
// M4: inline edit handlers
function mmStartInlineEdit(id){_mmInlineEditId=id;mmDrawNodes();}
function mmInlineEditCommit(id,val){
  const node=_mmCurrent.nodes.find(n=>n.id===id);
  if(node && (node.text||'')!==(val||'').trim()){
    _mmSnap();
    node.text=(val||'').trim()||node.text;
    _mmCurrent.updatedAt=new Date().toISOString();
    saveMindmaps();
  }
  _mmInlineEditId=null;
  mmDrawNodes();mmRenderSidePanel();
}
function mmInlineEditKey(e,id){
  if(e.key==='Enter'){e.preventDefault();mmInlineEditCommit(id,e.target.value);}
  else if(e.key==='Escape'){_mmInlineEditId=null;mmDrawNodes();}
}
// M3: sub-item helpers
function mmAddSubItem(id){
  const node=_mmCurrent.nodes.find(n=>n.id===id);if(!node)return;
  const text=prompt('Sub-item text:','');if(!text)return;
  _mmSnap();
  node.subItems=Array.isArray(node.subItems)?node.subItems:[];
  node.subItems.push({text:text.trim(),done:false});
  _mmCurrent.updatedAt=new Date().toISOString();
  saveMindmaps();mmDrawNodes();mmRenderSidePanel();
}
function mmToggleSubItem(id,idx){
  const node=_mmCurrent.nodes.find(n=>n.id===id);if(!node||!node.subItems||!node.subItems[idx])return;
  _mmSnap();
  node.subItems[idx].done=!node.subItems[idx].done;
  _mmCurrent.updatedAt=new Date().toISOString();
  saveMindmaps();mmDrawNodes();mmRenderSidePanel();
}
function mmRemoveSubItem(id,idx){
  const node=_mmCurrent.nodes.find(n=>n.id===id);if(!node||!node.subItems||!node.subItems[idx])return;
  _mmSnap();
  node.subItems.splice(idx,1);
  _mmCurrent.updatedAt=new Date().toISOString();
  saveMindmaps();mmDrawNodes();mmRenderSidePanel();
}
// M13: collapse subtree
function mmToggleCollapse(id){
  const node=_mmCurrent.nodes.find(n=>n.id===id);if(!node)return;
  _mmSnap();
  node.collapsed=!node.collapsed;
  saveMindmaps();renderMindmapCanvas();
}
// M5: side panel for selected node (icon, shape, color, description, sub-items, edges)
function mmRenderSidePanel(){
  const side=document.getElementById('mm-side');if(!side)return;
  // M14: an edge is selected → show the connection editor instead of a node panel.
  if(_mmSelectedEdge!==null){ mmRenderEdgePanel(); return; }
  const id=_mmSelectedSet.size===1?[..._mmSelectedSet][0]:_mmSelected;
  const node=id?(_mmCurrent.nodes.find(n=>n.id===id)):null;
  if(!node){side.classList.remove('open');side.innerHTML='';return;}
  side.classList.add('open');
  const outEdges=_mmCurrent.edges.filter(e=>e.from===node.id||e.to===node.id);
  side.innerHTML=`
    <div class="mm-side-h">
      <span style="font-size:18px">${node.icon||'•'}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(node.text||'')}</span>
      <span class="mm-side-close" onclick="mmCloseSidePanel()">✕</span>
    </div>
    <div class="mm-side-section">
      <div class="mm-side-section-h">Title</div>
      <input type="text" value="${esc(node.text||'')}" onchange="mmSidePanelText(${node.id},this.value)">
    </div>
    <div class="mm-side-section">
      <div class="mm-side-section-h">Icon</div>
      <div class="mm-icon-grid">${MM_ICONS.map(ic=>`<div class="mm-icon-btn ${(node.icon||'')===ic?'on':''}" onclick="mmSidePanelIcon(${node.id},'${ic}')">${ic||'∅'}</div>`).join('')}</div>
    </div>
    <div class="mm-side-section">
      <div class="mm-side-section-h">Shape</div>
      <div class="mm-shape-grid">${MM_SHAPES.map(s=>`<div class="mm-shape-btn ${(node.shape||'rect')===s?'on':''}" onclick="mmSidePanelShape(${node.id},'${s}')">${s}</div>`).join('')}</div>
    </div>
    <div class="mm-side-section">
      <div class="mm-side-section-h">Color</div>
      <div class="mm-color-grid">${MM_COLORS.map(c=>`<div class="mm-color-swatch ${(node.color||'')===c?'on':''}" style="background:${c}" onclick="mmSidePanelColor(${node.id},'${c}')"></div>`).join('')}</div>
    </div>
    <div class="mm-side-section">
      <div class="mm-side-section-h">Description</div>
      <textarea placeholder="Long-form notes for this node…" onblur="mmSidePanelDesc(${node.id},this.value)">${esc(node.description||'')}</textarea>
    </div>
    <div class="mm-side-section">
      <div class="mm-side-section-h">Sub-items (${(node.subItems||[]).length})</div>
      ${(node.subItems||[]).map((s,i)=>`<div style="display:flex;align-items:center;gap:6px;font-size:11px;padding:3px 0"><span class="chk" style="width:13px;height:13px;border:1px solid var(--bd2);border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:10px;cursor:pointer;${s.done?'background:var(--ac);color:#fff':''}" onclick="mmToggleSubItem(${node.id},${i})">${s.done?'✓':''}</span><span style="flex:1;${s.done?'text-decoration:line-through;color:var(--t3)':''}">${esc(s.text)}</span><span style="cursor:pointer;color:var(--red);font-size:11px;padding:0 4px" onclick="mmRemoveSubItem(${node.id},${i})">✕</span></div>`).join('')}
      <button class="btn btn-s" style="font-size:11px;height:22px;width:100%;margin-top:4px" onclick="mmAddSubItem(${node.id})">+ Add sub-item</button>
    </div>
    ${outEdges.length?`<div class="mm-side-section"><div class="mm-side-section-h">Connections (${outEdges.length})</div>${outEdges.map(e=>{const other=_mmCurrent.nodes.find(n=>n.id===(e.from===node.id?e.to:e.from));if(!other)return '';const ei=_mmCurrent.edges.indexOf(e);return `<div style="font-size:11px;padding:3px 0;border-bottom:1px solid var(--bd1);display:flex;align-items:center;gap:4px"><span style="flex:1;cursor:pointer;color:var(--ac);text-decoration:underline" onclick="_mmSelectedSet=new Set([${other.id}]);_mmSelected=${other.id};mmDrawNodes();mmRenderSidePanel()">${e.from===node.id?'→':'←'} ${esc(other.text||'')}</span><span title="Edit connection" style="cursor:pointer;color:var(--t3);padding:0 3px" onclick="mmSelectEdge(null,${ei})">✏</span><span title="Delete connection" style="cursor:pointer;color:var(--red);padding:0 3px" onclick="mmDeleteEdge(${ei})">✕</span></div>`;}).join('')}</div>`:''}
    <div class="mm-side-section">
      <div class="mm-side-section-h">Actions</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        <button class="btn btn-s" style="font-size:11px;height:24px;flex:1" onclick="mmAddChild(${node.id})">+ Child</button>
        <button class="btn btn-s" style="font-size:11px;height:24px;flex:1" onclick="mmConvertToTask(${node.id})">📋 Task</button>
        <button class="btn btn-s" style="font-size:11px;height:24px;flex:1" onclick="mmConvertToProject(${node.id})">${_icon('folder',13,'currentColor')} Project</button>
        <button class="btn btn-s" style="font-size:11px;height:24px;flex:1" onclick="mmConvertToNote(${node.id})">📝 Note</button>
        <button class="btn btn-d" style="font-size:11px;height:24px;flex:1" onclick="mmDeleteNode(${node.id})">🗑 Delete</button>
      </div>
    </div>`;
}
function mmCloseSidePanel(){_mmSelected=null;_mmSelectedSet=new Set();const s=document.getElementById('mm-side');if(s){s.classList.remove('open');s.innerHTML='';}mmDrawNodes();}
function mmSidePanelText(id,val){const n=_mmCurrent.nodes.find(x=>x.id===id);if(!n)return;_mmSnap();n.text=(val||'').trim()||n.text;_mmCurrent.updatedAt=new Date().toISOString();saveMindmaps();mmDrawNodes();mmRenderSidePanel();}
function mmSidePanelIcon(id,ic){const n=_mmCurrent.nodes.find(x=>x.id===id);if(!n)return;_mmSnap();n.icon=ic||'';_mmCurrent.updatedAt=new Date().toISOString();saveMindmaps();mmDrawNodes();mmRenderSidePanel();}
function mmSidePanelShape(id,s){const n=_mmCurrent.nodes.find(x=>x.id===id);if(!n)return;_mmSnap();n.shape=s;_mmCurrent.updatedAt=new Date().toISOString();saveMindmaps();mmDrawNodes();mmRenderSidePanel();}
function mmSidePanelColor(id,c){const n=_mmCurrent.nodes.find(x=>x.id===id);if(!n)return;_mmSnap();n.color=c;_mmCurrent.updatedAt=new Date().toISOString();saveMindmaps();mmDrawNodes();mmRenderSidePanel();}
function mmSidePanelDesc(id,val){const n=_mmCurrent.nodes.find(x=>x.id===id);if(!n)return;if(n.description===val)return;_mmSnap();n.description=val||'';_mmCurrent.updatedAt=new Date().toISOString();saveMindmaps();}

// ─── M14: Connection (edge) selection + editing ──────────────────────────────
// Select an edge by its index. `e` may be a real event (stop propagation so the
// canvas doesn't also start a pan) or null (when called from the side panel).
function mmSelectEdge(e, idx){
  if(e&&e.stopPropagation)e.stopPropagation();
  if(!_mmCurrent||!_mmCurrent.edges[idx])return;
  _mmSelectedEdge=idx;
  _mmSelected=null;_mmSelectedSet=new Set();
  const ctx=document.getElementById('mm-context-menu');if(ctx)ctx.style.display='none';
  mmDrawNodes();mmDrawEdges();mmRenderSidePanel();
}
function mmRenderEdgePanel(){
  const side=document.getElementById('mm-side');if(!side)return;
  const e=_mmCurrent.edges[_mmSelectedEdge];
  if(!e){_mmSelectedEdge=null;side.classList.remove('open');side.innerHTML='';return;}
  const from=_mmCurrent.nodes.find(n=>n.id===e.from);
  const to=_mmCurrent.nodes.find(n=>n.id===e.to);
  side.classList.add('open');
  const arrowOpts=[['none','— none'],['to','→ to target'],['both','↔ both ends']];
  const thick=Math.max(1,Math.min(6,e.thickness||2));
  side.innerHTML=`
    <div class="mm-side-h">
      <span style="font-size:16px">🔗</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Connection</span>
      <span class="mm-side-close" onclick="mmDeselectEdge()">✕</span>
    </div>
    <div class="mm-side-section">
      <div class="mm-side-section-h">Between</div>
      <div style="font-size:11px;color:var(--t2);line-height:1.6">${esc(from?from.text:'?')}<br><span style="color:var(--t3)">↓</span><br>${esc(to?to.text:'?')}</div>
    </div>
    <div class="mm-side-section">
      <div class="mm-side-section-h">Line style</div>
      <div style="display:flex;gap:4px">
        <button class="btn btn-s" style="flex:1;font-size:11px;height:24px;${(e.style||'solid')==='solid'?'background:var(--ac);color:#fff':''}" onclick="mmEdgeSetStyle('solid')">── Solid</button>
        <button class="btn btn-s" style="flex:1;font-size:11px;height:24px;${e.style==='dashed'?'background:var(--ac);color:#fff':''}" onclick="mmEdgeSetStyle('dashed')">- - Dashed</button>
      </div>
    </div>
    <div class="mm-side-section">
      <div class="mm-side-section-h">Arrow</div>
      <div style="display:flex;gap:4px">${arrowOpts.map(([k,l])=>`<button class="btn btn-s" style="flex:1;font-size:11px;height:24px;${(e.arrow||'none')===k?'background:var(--ac);color:#fff':''}" onclick="mmEdgeSetArrow('${k}')">${l}</button>`).join('')}</div>
    </div>
    <div class="mm-side-section">
      <div class="mm-side-section-h">Thickness (${thick})</div>
      <input type="range" min="1" max="6" step="1" value="${thick}" style="width:100%" oninput="mmEdgeSetThickness(this.value)">
    </div>
    <div class="mm-side-section">
      <div class="mm-side-section-h">Label</div>
      <input type="text" placeholder="e.g. depends on, leads to…" value="${esc(e.label||'')}" onchange="mmEdgeSetLabel(this.value)">
    </div>
    <div class="mm-side-section">
      <div class="mm-side-section-h">Actions</div>
      <button class="btn btn-d" style="font-size:11px;height:26px;width:100%" onclick="mmDeleteEdge(${_mmSelectedEdge})">🗑 Delete connection</button>
    </div>`;
}
function mmDeselectEdge(){_mmSelectedEdge=null;const s=document.getElementById('mm-side');if(s){s.classList.remove('open');s.innerHTML='';}mmDrawEdges();}
function mmDeleteEdge(idx){
  if(!_mmCurrent||!_mmCurrent.edges[idx])return;
  _mmSnap();
  _mmCurrent.edges.splice(idx,1);
  _mmCurrent.updatedAt=new Date().toISOString();
  _mmSelectedEdge=null;
  saveMindmaps();
  const ctx=document.getElementById('mm-context-menu');if(ctx)ctx.style.display='none';
  mmDrawEdges();mmRenderSidePanel();
  toast('🔗 Connection deleted');
}
function mmEdgeSetStyle(v){const e=_mmCurrent.edges[_mmSelectedEdge];if(!e)return;_mmSnap();e.style=v;_mmCurrent.updatedAt=new Date().toISOString();saveMindmaps();mmDrawEdges();mmRenderEdgePanel();}
function mmEdgeSetArrow(v){const e=_mmCurrent.edges[_mmSelectedEdge];if(!e)return;_mmSnap();e.arrow=v;_mmCurrent.updatedAt=new Date().toISOString();saveMindmaps();mmDrawEdges();mmRenderEdgePanel();}
function mmEdgeSetThickness(v){const e=_mmCurrent.edges[_mmSelectedEdge];if(!e)return;_mmSnap();e.thickness=Math.max(1,Math.min(6,parseInt(v,10)||2));_mmCurrent.updatedAt=new Date().toISOString();saveMindmaps();mmDrawEdges();mmRenderEdgePanel();}
function mmEdgeSetLabel(v){const e=_mmCurrent.edges[_mmSelectedEdge];if(!e)return;if((e.label||'')===(v||''))return;_mmSnap();e.label=(v||'').trim();_mmCurrent.updatedAt=new Date().toISOString();saveMindmaps();mmDrawEdges();}
function mmEdgeContext(e, idx){
  e.preventDefault();e.stopPropagation();
  if(!_mmCurrent||!_mmCurrent.edges[idx])return;
  _mmSelectedEdge=idx;_mmSelected=null;_mmSelectedSet=new Set();
  mmDrawNodes();mmDrawEdges();mmRenderSidePanel();
  const edge=_mmCurrent.edges[idx];
  const ctx=document.getElementById('mm-context-menu');if(!ctx)return;
  ctx.innerHTML=`
    <div style="padding:6px 10px;font-size:11px;font-weight:600;color:var(--t3);border-bottom:1px solid var(--bd1)">Connection</div>
    <div class="mm-ctx-item" onclick="mmEdgeSetStyle('${(edge.style||'solid')==='dashed'?'solid':'dashed'}');document.getElementById('mm-context-menu').style.display='none'">${(edge.style||'solid')==='dashed'?'── Make solid':'- - Make dashed'}</div>
    <div class="mm-ctx-item" onclick="mmEdgeSetArrow('${edge.arrow==='to'?'none':'to'}');document.getElementById('mm-context-menu').style.display='none'">${edge.arrow==='to'?'— Remove arrow':'→ Add arrow'}</div>
    <div style="border-top:1px solid var(--bd1);margin:2px 0"></div>
    <div class="mm-ctx-item" style="color:var(--red)" onclick="mmDeleteEdge(${idx})">🗑 Delete connection</div>`;
  ctx.style.display='block';
  ctx.style.left=e.clientX+'px';
  ctx.style.top=e.clientY+'px';
  setTimeout(()=>{document.addEventListener('click',function _c(){ctx.style.display='none';document.removeEventListener('click',_c);},{once:true});},50);
}

function mmNodeContext(e, id){
  e.preventDefault();
  e.stopPropagation();
  _mmSelectedEdge = null;
  _mmSelected = id;
  const node = _mmCurrent.nodes.find(n=>n.id===id);
  if(!node) return;
  const ctx = document.getElementById('mm-context-menu');
  if(!ctx) return;
  const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'];
  ctx.innerHTML = `
    <div style="padding:6px 10px;font-size:11px;font-weight:600;color:var(--t3);border-bottom:1px solid var(--bd1)">Node: ${esc(node.text)}</div>
    <div class="mm-ctx-item" onclick="mmConvertToTask(${id})">📋 Create Task</div>
    <div class="mm-ctx-item" onclick="mmConvertToProject(${id})">${_icon('folder',13,'currentColor')} Create Project</div>
    <div class="mm-ctx-item" onclick="mmConvertToNote(${id})">📝 Create Note</div>
    <div style="border-top:1px solid var(--bd1);margin:2px 0"></div>
    <div class="mm-ctx-item" onclick="mmEditNode(${id})">✏ Edit Text</div>
    <div class="mm-ctx-item" onclick="mmAddChild(${id})">➕ Add Child Node</div>
    <div class="mm-ctx-item" onclick="mmToggleConnect();document.getElementById('mm-context-menu').style.display='none'">🔗 Connect From Here</div>
    <div style="border-top:1px solid var(--bd1);margin:2px 0"></div>
    <div style="padding:4px 10px;display:flex;gap:3px">
      ${colors.map(c=>`<div style="width:16px;height:16px;border-radius:50%;background:${c};cursor:pointer;border:${node.color===c?'2px solid #fff':'2px solid transparent'}" onclick="mmSetColor(${id},'${c}')"></div>`).join('')}
    </div>
    <div style="border-top:1px solid var(--bd1);margin:2px 0"></div>
    <div class="mm-ctx-item" style="color:var(--red)" onclick="mmDeleteNode(${id})">🗑 Delete Node</div>
  `;
  ctx.style.display = 'block';
  ctx.style.left = e.clientX + 'px';
  ctx.style.top = e.clientY + 'px';
  // Close on click outside
  setTimeout(()=>{
    document.addEventListener('click', function _closeCtx(){ ctx.style.display='none'; document.removeEventListener('click',_closeCtx); }, {once:true});
  }, 50);
}

// ─── Node Operations ─────────────────────────────────────────────────────────
function mmAddNode(){
  const wrap = document.getElementById('mm-canvas-wrap');
  if(!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const x = (rect.width/2 - _mmPan.x) / _mmZoom + (Math.random()-0.5)*100;
  const y = (rect.height/2 - _mmPan.y) / _mmZoom + (Math.random()-0.5)*100;
  mmAddNodeAt(x, y);
}

function mmAddNodeAt(x, y, text){
  _mmSnap();
  const t = (text!==undefined?text:(prompt('Node text:', 'New idea')||'')).trim();
  if(!t) return null;
  const node = {id: _mmNextId(_mmCurrent.nodes), text: t, x, y, color:'#3b82f6', shape:'rect', icon:'', subItems:[], description:'', collapsed:false, isRoot:false};
  _mmCurrent.nodes.push(node);
  _mmCurrent.updatedAt = new Date().toISOString();
  saveMindmaps();
  _mmSelectedSet=new Set([node.id]);_mmSelected=node.id;
  renderMindmapCanvas();
  // Auto-edit the new node so the user can type the title immediately.
  setTimeout(()=>mmStartInlineEdit(node.id),60);
  return node;
}

function mmAddChild(parentId, text){
  const parent = _mmCurrent.nodes.find(n=>n.id===parentId);
  if(!parent) return;
  _mmSnap();
  const t = (text!==undefined?text:(prompt('Child node text:', '')||'')).trim();
  if(!t) return;
  const angle = Math.random() * Math.PI * 2;
  const dist = 120 + Math.random()*40;
  const child = {id: _mmNextId(_mmCurrent.nodes), text: t, x: parent.x + Math.cos(angle)*dist, y: parent.y + Math.sin(angle)*dist, color: parent.color, shape:parent.shape||'rect', icon:'', subItems:[], description:'', collapsed:false, isRoot:false};
  _mmCurrent.nodes.push(child);
  _mmCurrent.edges.push({from: parentId, to: child.id, style:'solid', arrow:'none', thickness:2, label:''});
  _mmCurrent.updatedAt = new Date().toISOString();
  saveMindmaps();
  _mmSelectedSet=new Set([child.id]);_mmSelected=child.id;
  renderMindmapCanvas();
  const ctx=document.getElementById('mm-context-menu');if(ctx)ctx.style.display='none';
  return child;
}
// Add a sibling: child of the parent of the given node (or new root if no parent)
function mmAddSibling(id, text){
  const parentEdge=_mmCurrent.edges.find(e=>e.to===id);
  if(parentEdge)return mmAddChild(parentEdge.from, text);
  // Top-level — drop a new node nearby.
  const node=_mmCurrent.nodes.find(n=>n.id===id);if(!node)return null;
  return mmAddNodeAt(node.x+160, node.y, text);
}

function mmEditNode(id){
  // Backwards-compat wrapper — now triggers inline edit.
  mmStartInlineEdit(id);
  const ctx=document.getElementById('mm-context-menu');if(ctx)ctx.style.display='none';
}

function mmDeleteNode(id){
  _mmSnap();
  _mmSelectedEdge = null; // edge indices shift when edges are pruned below
  // Delete every node in the multi-select if more than one is selected, else just this id.
  const ids = _mmSelectedSet.size>1?[..._mmSelectedSet]:[id];
  _mmCurrent.nodes = _mmCurrent.nodes.filter(n=>!ids.includes(n.id));
  _mmCurrent.edges = _mmCurrent.edges.filter(e=>!ids.includes(e.from) && !ids.includes(e.to));
  _mmCurrent.updatedAt = new Date().toISOString();
  _mmSelected = null; _mmSelectedSet = new Set();
  saveMindmaps();
  renderMindmapCanvas();
  const ctx=document.getElementById('mm-context-menu');if(ctx)ctx.style.display='none';
  toast(`🗑 ${ids.length} node${ids.length===1?'':'s'} deleted`);
}

function mmSetColor(id, color){
  _mmSnap();
  const ids = _mmSelectedSet.size>1?[..._mmSelectedSet]:[id];
  ids.forEach(nid=>{const n=_mmCurrent.nodes.find(x=>x.id===nid);if(n)n.color=color;});
  _mmCurrent.updatedAt = new Date().toISOString();
  saveMindmaps();renderMindmapCanvas();
  const ctx=document.getElementById('mm-context-menu');if(ctx)ctx.style.display='none';
}

function mmToggleConnect(){
  if(_mmConnecting){ _mmConnecting = null; }
  else { _mmConnecting = _mmSelected; }
  renderMindmapCanvas();
}

function mmZoomIn(){ _mmZoom = Math.min(3, _mmZoom + 0.2); mmDrawNodes(); mmDrawEdges(); }
function mmZoomOut(){ _mmZoom = Math.max(0.3, _mmZoom - 0.2); mmDrawNodes(); mmDrawEdges(); }
function mmResetView(){ _mmPan = {x:0,y:0}; _mmZoom = 1; mmDrawNodes(); mmDrawEdges(); }

// (mmAutoLayout is defined later with multi-layout support — this slot kept empty.)

// ─── Convert to Task / Project / Note ────────────────────────────────────────
function mmConvertToTask(nodeId){
  const node = _mmCurrent.nodes.find(n=>n.id===nodeId);
  if(!node) return;
  // Gather child nodes as subtasks
  const childIds = _mmCurrent.edges.filter(e=>e.from===nodeId).map(e=>e.to);
  const subtasks = childIds.map((cid,i)=>{
    const child = _mmCurrent.nodes.find(n=>n.id===cid);
    return child ? {id:i+1, title:child.text, done:false} : null;
  }).filter(Boolean);
  const task = {
    id: Date.now() + Math.floor(Math.random()*1000),
    title: node.text,
    priority: 'Medium',
    due: '',
    status: 'Not Started',
    context: 'Inbox',
    project: '',
    tags: ['mindmap'],
    notes: `Created from mind map: ${_mmCurrent.title}`,
    myDay: false,
    energy: 'medium',
    subtasks: subtasks,
    comments: [],
    createdBy: D.creds.userName || 'User',
    createdAt: new Date().toISOString()
  };
  D.tasks.push(task);
  save('tasks');
  document.getElementById('mm-context-menu').style.display = 'none';
  toast(`📋 Task created: "${node.text}"`);
}

function mmConvertToProject(nodeId){
  const node = _mmCurrent.nodes.find(n=>n.id===nodeId);
  if(!node) return;
  // Gather child nodes as project tasks/milestones description
  const childIds = _mmCurrent.edges.filter(e=>e.from===nodeId).map(e=>e.to);
  const childTexts = childIds.map(cid=>{
    const child = _mmCurrent.nodes.find(n=>n.id===cid);
    return child ? child.text : null;
  }).filter(Boolean);
  const project = {
    id: Date.now() + Math.floor(Math.random()*1000),
    name: node.text,
    description: childTexts.length ? 'Key areas: ' + childTexts.join(', ') : '',
    status: 'Active',
    progress: 0,
    priority: 'Medium',
    startDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    tags: ['mindmap'],
    notes: `Created from mind map: ${_mmCurrent.title}`,
    tasks: [],
    createdBy: D.creds.userName || 'User',
    createdAt: new Date().toISOString()
  };
  D.projects.push(project);
  save('projects');
  document.getElementById('mm-context-menu').style.display = 'none';
  toast(`📁 Project created: "${node.text}"`);
}

// ─── M7: keyboard shortcuts (active only on mind map screen w/ map open) ──
document.addEventListener('keydown',function(e){
  if(!_mmCurrent)return;
  if(typeof curScreen!=='undefined'&&curScreen!=='mindmaps')return;
  const t=e.target;
  if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;
  // Cmd/Ctrl+Z / +Shift+Z
  if((e.metaKey||e.ctrlKey)&&!e.altKey){
    if(e.key==='z'||e.key==='Z'){e.preventDefault();if(e.shiftKey)mmRedo();else mmUndo();return;}
    if(e.key==='y'||e.key==='Y'){e.preventDefault();mmRedo();return;}
    if(e.key==='a'||e.key==='A'){e.preventDefault();_mmSelectedSet=new Set((_mmCurrent.nodes||[]).map(n=>n.id));mmDrawNodes();return;}
  }
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const id=_mmSelected||(_mmSelectedSet.size===1?[..._mmSelectedSet][0]:null);
  if(e.key==='Tab'&&id){e.preventDefault();mmAddChild(id);return;}
  if(e.key==='Enter'&&id&&!_mmInlineEditId){e.preventDefault();mmAddSibling(id);return;}
  if((e.key==='Delete'||e.key==='Backspace')&&_mmSelectedEdge!==null){e.preventDefault();mmDeleteEdge(_mmSelectedEdge);return;}
  if(e.key==='Delete'&&(_mmSelectedSet.size||id)){e.preventDefault();mmDeleteNode(id);return;}
  if(e.key==='F2'&&id){e.preventDefault();mmStartInlineEdit(id);return;}
  if(e.key==='/'&&!_mmInlineEditId){e.preventDefault();const inp=document.getElementById('mm-search');if(inp){inp.focus();inp.select();}return;}
  if(e.key==='Escape'){if(_mmInlineEditId){_mmInlineEditId=null;mmDrawNodes();}else if(_mmConnecting){_mmConnecting=null;renderMindmapCanvas();}else if(_mmSelectedEdge!==null){mmDeselectEdge();}else if(_mmSelectedSet.size||_mmSelected){mmCloseSidePanel();}return;}
  // Arrow keys: move selection to nearest connected/closer node in that direction.
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)&&id){
    e.preventDefault();
    const cur=_mmCurrent.nodes.find(n=>n.id===id);if(!cur)return;
    const dirX=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0;
    const dirY=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0;
    const candidates=_mmCurrent.nodes.filter(n=>n.id!==id);
    candidates.sort((a,b)=>{
      const da=Math.hypot(a.x-cur.x,a.y-cur.y);const db=Math.hypot(b.x-cur.x,b.y-cur.y);
      const aIn=((a.x-cur.x)*dirX+(a.y-cur.y)*dirY)>0?0:1;
      const bIn=((b.x-cur.x)*dirX+(b.y-cur.y)*dirY)>0?0:1;
      if(aIn!==bIn)return aIn-bIn;
      return da-db;
    });
    if(candidates[0]){_mmSelectedSet=new Set([candidates[0].id]);_mmSelected=candidates[0].id;mmDrawNodes();mmRenderSidePanel();}
  }
});
// ─── M9: layouts beyond radial ────────────────────────────────────────
function _mmRadialLayout(nodes,edges){
  const root=nodes.find(n=>n.isRoot)||nodes[0];if(!root)return;
  const visited=new Set([root.id]);const queue=[{node:root,level:0,angle:0,spread:Math.PI*2}];
  root.x=400;root.y=300;
  while(queue.length){
    const {node,level,angle,spread}=queue.shift();
    const children=edges.filter(e=>e.from===node.id||e.to===node.id).map(e=>e.from===node.id?e.to:e.from).filter(id=>!visited.has(id));
    if(!children.length)continue;
    const step=spread/Math.max(children.length,1);let startAngle=angle-spread/2+step/2;
    children.forEach((cid,i)=>{const child=nodes.find(n=>n.id===cid);if(!child)return;visited.add(cid);const a=startAngle+i*step;const dist=140+level*40;child.x=node.x+Math.cos(a)*dist;child.y=node.y+Math.sin(a)*dist;queue.push({node:child,level:level+1,angle:a,spread:step*0.8});});
  }
  let off=200;nodes.filter(n=>!visited.has(n.id)).forEach(n=>{n.x=off;n.y=550;off+=140;});
}
function _mmTreeLayout(nodes,edges,horizontal){
  const root=nodes.find(n=>n.isRoot)||nodes[0];if(!root)return;
  const childrenOf={};edges.forEach(e=>{(childrenOf[e.from]=childrenOf[e.from]||[]).push(e.to);});
  // Compute depth + leaf count
  const depth={};const leaves=[];
  function walk(id,d,seen){if(seen.has(id))return;seen.add(id);depth[id]=d;const kids=(childrenOf[id]||[]).filter(c=>!seen.has(c));if(!kids.length)leaves.push(id);kids.forEach(c=>walk(c,d+1,seen));}
  walk(root.id,0,new Set());
  // Assign Y (or X for horizontal) by leaf order
  const leafIdx={};leaves.forEach((id,i)=>leafIdx[id]=i);
  function pos(id,seen){if(seen.has(id))return [leafIdx[id]||0,leafIdx[id]||0];seen.add(id);const kids=(childrenOf[id]||[]).filter(c=>!seen.has(c));if(!kids.length)return [leafIdx[id]||0,leafIdx[id]||0];let mn=Infinity,mx=-Infinity;kids.forEach(c=>{const [a,b]=pos(c,seen);mn=Math.min(mn,a);mx=Math.max(mx,b);});return [mn,mx];}
  nodes.forEach(n=>{
    const [a,b]=pos(n.id,new Set());
    const ax=(a+b)/2;
    const d=depth[n.id]||0;
    if(horizontal){n.x=120+d*180;n.y=120+ax*70;}
    else{n.x=120+ax*150;n.y=120+d*120;}
  });
  // Unconnected nodes — bottom row
  let off=120;const bottom=Object.keys(depth).length?Math.max(...nodes.filter(n=>n.id in depth).map(n=>horizontal?n.y:n.x))+150:200;
  nodes.filter(n=>!(n.id in depth)).forEach(n=>{if(horizontal){n.y=bottom;n.x=off;}else{n.x=bottom;n.y=off;}off+=120;});
}
function mmAutoLayout(){
  if(!_mmCurrent||!_mmCurrent.nodes.length)return;
  _mmSnap();
  const layout=_mmCurrent.layout||'radial';
  if(layout==='free'){toast('Free layout — drag nodes to position. Switch layout to apply auto-arrange.');return;}
  if(layout==='radial')_mmRadialLayout(_mmCurrent.nodes,_mmCurrent.edges);
  else if(layout==='tree')_mmTreeLayout(_mmCurrent.nodes,_mmCurrent.edges,true);
  else if(layout==='org')_mmTreeLayout(_mmCurrent.nodes,_mmCurrent.edges,false);
  _mmCurrent.updatedAt=new Date().toISOString();saveMindmaps();renderMindmapCanvas();
  toast('⚡ '+layout.charAt(0).toUpperCase()+layout.slice(1)+' layout applied');
}

// ─── M10: edge styling — exposed via right-click on the connections list in side panel
function mmCycleEdgeStyle(fromId,toId){
  const e=_mmCurrent.edges.find(x=>x.from===fromId&&x.to===toId);if(!e)return;
  _mmSnap();
  const cycle=['solid','dashed'];e.style=cycle[(cycle.indexOf(e.style||'solid')+1)%cycle.length];
  saveMindmaps();renderMindmapCanvas();mmRenderSidePanel();
}

// ─── M11: starter templates ──────────────────────────────────────────
const MM_TEMPLATES=[
  {id:'swot',name:'SWOT Analysis',icon:'🧭',build:title=>{
    const id=Date.now();return {nodes:[
      {id:1,text:title||'SWOT',x:400,y:300,color:'#3b82f6',shape:'circle',isRoot:true,icon:'🧭'},
      {id:2,text:'Strengths',x:240,y:160,color:'#10b981',shape:'rect',icon:'💪',subItems:[]},
      {id:3,text:'Weaknesses',x:560,y:160,color:'#ef4444',shape:'rect',icon:'⚠️',subItems:[]},
      {id:4,text:'Opportunities',x:240,y:440,color:'#06b6d4',shape:'rect',icon:'🎯',subItems:[]},
      {id:5,text:'Threats',x:560,y:440,color:'#f59e0b',shape:'rect',icon:'🛡',subItems:[]},
    ],edges:[{from:1,to:2,style:'solid',arrow:'none',thickness:2,label:''},{from:1,to:3,style:'solid',arrow:'none',thickness:2,label:''},{from:1,to:4,style:'solid',arrow:'none',thickness:2,label:''},{from:1,to:5,style:'solid',arrow:'none',thickness:2,label:''}]};}},
  {id:'project',name:'Project Plan',icon:'📁',build:title=>{return {nodes:[
      {id:1,text:title||'Project',x:400,y:300,color:'#3b82f6',shape:'circle',isRoot:true,icon:'📁'},
      {id:2,text:'Goals',x:200,y:160,color:'#10b981',shape:'rect',icon:'🎯'},
      {id:3,text:'Milestones',x:600,y:160,color:'#8b5cf6',shape:'rect',icon:'🏁'},
      {id:4,text:'Tasks',x:200,y:440,color:'#06b6d4',shape:'rect',icon:'📋'},
      {id:5,text:'Risks',x:600,y:440,color:'#ef4444',shape:'rect',icon:'⚠️'},
      {id:6,text:'Stakeholders',x:400,y:540,color:'#f59e0b',shape:'rect',icon:'👥'},
    ],edges:[1,2,3,4,5,6].slice(1).map((to,i)=>({from:1,to:i+2,style:'solid',arrow:'none',thickness:2,label:''}))};}},
  {id:'goal',name:'Goal Breakdown',icon:'🎯',build:title=>{return {nodes:[
      {id:1,text:title||'My Goal',x:400,y:300,color:'#10b981',shape:'circle',isRoot:true,icon:'🎯'},
      {id:2,text:'Why',x:240,y:160,color:'#8b5cf6',shape:'cloud',icon:'💡'},
      {id:3,text:'How',x:560,y:160,color:'#06b6d4',shape:'rect',icon:'🛠'},
      {id:4,text:'When',x:240,y:440,color:'#f59e0b',shape:'pill',icon:'📅'},
      {id:5,text:'Metric',x:560,y:440,color:'#ec4899',shape:'diamond',icon:'📊'},
    ],edges:[2,3,4,5].map(to=>({from:1,to,style:'solid',arrow:'none',thickness:2,label:''}))};}},
  {id:'decision',name:'Decision Tree',icon:'🪞',build:title=>{return {nodes:[
      {id:1,text:title||'Decision',x:400,y:120,color:'#3b82f6',shape:'diamond',isRoot:true,icon:'🪞'},
      {id:2,text:'Option A',x:240,y:280,color:'#10b981',shape:'rect',icon:''},
      {id:3,text:'Option B',x:560,y:280,color:'#ef4444',shape:'rect',icon:''},
      {id:4,text:'Pros',x:160,y:440,color:'#10b981',shape:'pill'},
      {id:5,text:'Cons',x:320,y:440,color:'#ef4444',shape:'pill'},
      {id:6,text:'Pros',x:480,y:440,color:'#10b981',shape:'pill'},
      {id:7,text:'Cons',x:640,y:440,color:'#ef4444',shape:'pill'},
    ],edges:[
      {from:1,to:2,style:'solid',arrow:'to',thickness:2,label:''},
      {from:1,to:3,style:'solid',arrow:'to',thickness:2,label:''},
      {from:2,to:4,style:'solid',arrow:'none',thickness:2,label:''},
      {from:2,to:5,style:'solid',arrow:'none',thickness:2,label:''},
      {from:3,to:6,style:'solid',arrow:'none',thickness:2,label:''},
      {from:3,to:7,style:'solid',arrow:'none',thickness:2,label:''},
    ]};}},
  {id:'journey',name:'Customer Journey',icon:'🚶',build:title=>{return {nodes:[
      {id:1,text:title||'Journey',x:120,y:300,color:'#3b82f6',shape:'circle',isRoot:true,icon:'🚶'},
      {id:2,text:'Awareness',x:280,y:300,color:'#06b6d4',shape:'pill',icon:'👀'},
      {id:3,text:'Consideration',x:440,y:300,color:'#8b5cf6',shape:'pill',icon:'🤔'},
      {id:4,text:'Decision',x:600,y:300,color:'#f59e0b',shape:'pill',icon:'🛒'},
      {id:5,text:'Onboarding',x:760,y:300,color:'#10b981',shape:'pill',icon:'🎓'},
      {id:6,text:'Retention',x:920,y:300,color:'#ec4899',shape:'pill',icon:'💎'},
    ],edges:[[1,2],[2,3],[3,4],[4,5],[5,6]].map(([f,t])=>({from:f,to:t,style:'solid',arrow:'to',thickness:2,label:''}))};}},
];
function mmShowTemplates(){
  const m=document.getElementById('modal-content');if(!m)return;
  m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">🧠 New Mind Map</h2><div style="font-size:11px;color:var(--t3);margin-bottom:10px">Pick a starter template or build from a blank canvas.</div>
    <input id="mm-tpl-title" class="inp" placeholder="Map title…" style="width:100%;height:30px;font-size:12px;margin-bottom:10px" value="New Mind Map">
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px">
      <div class="cd" style="cursor:pointer;text-align:center;padding:14px 8px" onclick="mmCreateFromTemplate(null)"><div style="font-size:24px;margin-bottom:4px">📄</div><div style="font-size:11px;font-weight:600">Blank</div></div>
      ${MM_TEMPLATES.map(t=>`<div class="cd" style="cursor:pointer;text-align:center;padding:14px 8px" onclick="mmCreateFromTemplate('${t.id}')"><div style="font-size:24px;margin-bottom:4px">${t.icon}</div><div style="font-size:11px;font-weight:600">${esc(t.name)}</div></div>`).join('')}
    </div>
    <div style="display:flex;gap:6px;margin-top:10px"><button class="btn btn-s" onclick="closeModal()">Cancel</button></div>`;
  document.getElementById('modal-capture').classList.add('show');
}
function mmCreateFromTemplate(tplId){
  const titleInp=document.getElementById('mm-tpl-title');
  const title=(titleInp?titleInp.value:'').trim()||'New Mind Map';
  closeModal();
  let mm;
  if(tplId){
    const tpl=MM_TEMPLATES.find(t=>t.id===tplId);if(!tpl)return;
    const built=tpl.build(title);
    mm={id:_mmNextId(D.mindmaps),title,icon:tpl.icon,nodes:built.nodes,edges:built.edges,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),layout:'free'};
  }else{
    mm={id:_mmNextId(D.mindmaps),title,icon:'🧠',nodes:[{id:1,text:title,x:400,y:300,color:'#3b82f6',shape:'rect',icon:'',subItems:[],description:'',collapsed:false,isRoot:true}],edges:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),layout:'free'};
  }
  D.mindmaps.push(mm);saveMindmaps();mmOpen(mm.id);
}

// ─── M14: AI tools ───────────────────────────────────────────────────
async function mmAIExpandSelected(){
  if(!_mmCurrent)return;
  const id=_mmSelected||(_mmSelectedSet.size===1?[..._mmSelectedSet][0]:null);
  if(!id)return toast('Select a node first');
  const node=_mmCurrent.nodes.find(n=>n.id===id);if(!node)return;
  toast({type:'info',title:'Expanding node…',duration:2000});
  try{
    const {provider,apiKey}=_getAIConfig();
    const ctxText=(_mmCurrent.nodes||[]).map(n=>n.text).join(', ');
    const sys=`You are a mind-map brainstorming assistant. Given a focus topic, propose 5 specific child concepts (3-7 words each, distinct, non-overlapping). Reply with strict JSON only: {"children":["…","…","…","…","…"]}`;
    const res=await _trpc('ai.assist',{systemPrompt:sys,userContent:`Focus topic: "${node.text}"\nMap context: ${ctxText}`,provider:provider||'manus',apiKey:apiKey||undefined},'mutation');
    const text=String(res?.result||res?.text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'');
    const parsed=JSON.parse(text);
    if(!Array.isArray(parsed.children))throw new Error('bad response');
    _mmSnap();
    parsed.children.slice(0,5).forEach((t,i)=>{
      const angle=(i/5)*Math.PI*2;const dist=160;
      const child={id:_mmNextId(_mmCurrent.nodes),text:String(t).trim(),x:node.x+Math.cos(angle)*dist,y:node.y+Math.sin(angle)*dist,color:node.color||'#3b82f6',shape:'rect',icon:'',subItems:[],description:'',collapsed:false};
      _mmCurrent.nodes.push(child);
      _mmCurrent.edges.push({from:node.id,to:child.id,style:'solid',arrow:'none',thickness:2,label:''});
    });
    _mmCurrent.updatedAt=new Date().toISOString();saveMindmaps();renderMindmapCanvas();
    toast({type:'success',title:`✨ Added ${parsed.children.length} child nodes`,duration:2200});
  }catch(e){toast({type:'error',title:'AI expand failed',msg:String(e.message||e).slice(0,200),duration:5000});}
}
async function mmAISummarize(){
  if(!_mmCurrent||!_mmCurrent.nodes.length)return toast('Map is empty');
  toast({type:'info',title:'Summarizing map…',duration:2000});
  try{
    const {provider,apiKey}=_getAIConfig();
    const lines=_mmCurrent.nodes.map(n=>`- ${n.text}${n.description?` — ${n.description.slice(0,120)}`:''}`).join('\n');
    const edgeLines=_mmCurrent.edges.map(e=>{const f=_mmCurrent.nodes.find(n=>n.id===e.from);const t=_mmCurrent.nodes.find(n=>n.id===e.to);return f&&t?`  ${f.text} → ${t.text}`:'';}).filter(Boolean).join('\n');
    const sys=`You are a knowledge synthesizer. Given a mind map's nodes + connections, write a 3-paragraph summary: 1) the central theme, 2) the main branches and their relationships, 3) what's missing or worth exploring. Plain prose, no headers.`;
    const res=await _trpc('ai.assist',{systemPrompt:sys,userContent:`Title: ${_mmCurrent.title}\nNodes:\n${lines}\nConnections:\n${edgeLines}`,provider:provider||'manus',apiKey:apiKey||undefined},'mutation');
    const text=String(res?.result||res?.text||'').trim();
    const m=document.getElementById('modal-content');
    if(m){m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">📜 Map Summary</h2><div style="background:var(--s2);border:1px solid var(--bd1);border-radius:6px;padding:12px;font-size:12px;line-height:1.65;white-space:pre-wrap">${esc(text)}</div><div style="display:flex;gap:6px;margin-top:10px"><button class="btn btn-s" onclick="closeModal()">Close</button></div>`;document.getElementById('modal-capture').classList.add('show');}
  }catch(e){toast({type:'error',title:'AI summary failed',msg:String(e.message||e).slice(0,200),duration:5000});}
}
async function mmAISuggestConnections(){
  if(!_mmCurrent||_mmCurrent.nodes.length<3)return toast('Need at least 3 nodes');
  toast({type:'info',title:'Looking for connections…',duration:2000});
  try{
    const {provider,apiKey}=_getAIConfig();
    const idMap={};_mmCurrent.nodes.forEach((n,i)=>idMap[i+1]=n.id);
    const lines=_mmCurrent.nodes.map((n,i)=>`${i+1}. ${n.text}`).join('\n');
    const existing=_mmCurrent.edges.map(e=>{const fi=_mmCurrent.nodes.findIndex(n=>n.id===e.from)+1;const ti=_mmCurrent.nodes.findIndex(n=>n.id===e.to)+1;return `${fi}-${ti}`;}).join(', ');
    const sys=`You are a synthesis assistant. Given a numbered list of mind-map nodes, propose up to 5 NEW non-obvious connections between distinct pairs (do not duplicate existing edges). Reply with strict JSON only: {"edges":[{"from":1,"to":4,"label":"…"}, …]}`;
    const res=await _trpc('ai.assist',{systemPrompt:sys,userContent:`Nodes:\n${lines}\nExisting edges (numeric pairs): ${existing||'(none)'}\nPropose new connections.`,provider:provider||'manus',apiKey:apiKey||undefined},'mutation');
    const text=String(res?.result||res?.text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'');
    const parsed=JSON.parse(text);
    if(!Array.isArray(parsed.edges))throw new Error('bad response');
    _mmSnap();
    let added=0;
    parsed.edges.slice(0,5).forEach(p=>{
      const fromId=idMap[p.from],toId=idMap[p.to];if(!fromId||!toId||fromId===toId)return;
      const dup=_mmCurrent.edges.find(e=>(e.from===fromId&&e.to===toId)||(e.from===toId&&e.to===fromId));if(dup)return;
      _mmCurrent.edges.push({from:fromId,to:toId,style:'dashed',arrow:'to',thickness:1,label:p.label||''});
      added++;
    });
    _mmCurrent.updatedAt=new Date().toISOString();saveMindmaps();renderMindmapCanvas();
    toast({type:added?'success':'info',title:added?`✨ Added ${added} connection${added===1?'':'s'}`:'No new connections found',duration:2200});
  }catch(e){toast({type:'error',title:'AI suggest failed',msg:String(e.message||e).slice(0,200),duration:5000});}
}

// ─── M15: export ────────────────────────────────────────────────────
function _mmBuildSVG(){
  if(!_mmCurrent)return '';
  const nodes=_mmCurrent.nodes;const edges=_mmCurrent.edges;
  if(!nodes.length)return '';
  const minX=Math.min(...nodes.map(n=>n.x))-100,maxX=Math.max(...nodes.map(n=>n.x))+100;
  const minY=Math.min(...nodes.map(n=>n.y))-60,maxY=Math.max(...nodes.map(n=>n.y))+60;
  const w=maxX-minX,h=maxY-minY;
  const colors=new Set();edges.forEach(e=>{const f=nodes.find(n=>n.id===e.from);if(f)colors.add(f.color||'#3b82f6');});
  const defs=`<defs>${[...colors].map((c,i)=>`<marker id="arr-${i}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`).join('')}</defs>`;
  const colorIdx=Object.fromEntries([...colors].map((c,i)=>[c,i]));
  const eHtml=edges.map(e=>{const f=nodes.find(n=>n.id===e.from);const t=nodes.find(n=>n.id===e.to);if(!f||!t)return '';const x1=f.x-minX,y1=f.y-minY,x2=t.x-minX,y2=t.y-minY;const mx=(x1+x2)/2,my=(y1+y2)/2-20;const c=f.color||'#3b82f6';const dash=e.style==='dashed'?' stroke-dasharray="6 4"':'';const arrow=e.arrow==='to'||e.arrow==='both'?` marker-end="url(#arr-${colorIdx[c]})"`:'';return `<path d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" fill="none" stroke="${c}" stroke-width="${e.thickness||2}" opacity="0.7"${dash}${arrow}/>${e.label?`<text x="${mx}" y="${my-4}" text-anchor="middle" font-size="11" fill="${c}">${esc(e.label)}</text>`:''}`;}).join('');
  const nHtml=nodes.map(n=>{const x=n.x-minX,y=n.y-minY;const fill=n.color||'#3b82f6';const text=`${n.icon||''} ${n.text||''}`.trim();const tw=Math.max(80,text.length*7+24);return `<g><rect x="${x-tw/2}" y="${y-16}" width="${tw}" height="32" rx="6" fill="${fill}" fill-opacity="0.18" stroke="${fill}" stroke-width="2"/><text x="${x}" y="${y+5}" text-anchor="middle" font-size="13" font-weight="500" fill="#fff">${esc(text)}</text></g>`;}).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="background:#0a0e1c">${defs}${eHtml}${nHtml}</svg>`;
}
function mmExportSVG(){
  const svg=_mmBuildSVG();if(!svg)return toast('Empty map');
  const blob=new Blob([svg],{type:'image/svg+xml'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(_mmCurrent.title||'mindmap')+'.svg';a.click();URL.revokeObjectURL(a.href);toast('🖼 SVG exported');
}
function mmExportPNG(){
  const svg=_mmBuildSVG();if(!svg)return toast('Empty map');
  const blob=new Blob([svg],{type:'image/svg+xml'});const url=URL.createObjectURL(blob);
  const img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=img.width*2;c.height=img.height*2;const ctx=c.getContext('2d');ctx.scale(2,2);ctx.drawImage(img,0,0);c.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=(_mmCurrent.title||'mindmap')+'.png';a.click();URL.revokeObjectURL(a.href);URL.revokeObjectURL(url);toast('🖼 PNG exported');},'image/png');};img.src=url;
}
function mmExportMarkdown(){
  if(!_mmCurrent||!_mmCurrent.nodes.length)return toast('Empty map');
  const root=_mmCurrent.nodes.find(n=>n.isRoot)||_mmCurrent.nodes[0];
  const childrenOf={};_mmCurrent.edges.forEach(e=>{(childrenOf[e.from]=childrenOf[e.from]||[]).push(e.to);});
  const out=[`# ${_mmCurrent.title||'Mind Map'}`,''];
  function walk(id,depth,seen){if(seen.has(id))return;seen.add(id);const n=_mmCurrent.nodes.find(x=>x.id===id);if(!n)return;out.push('  '.repeat(depth)+'- '+(n.icon?n.icon+' ':'')+n.text);(n.subItems||[]).forEach(s=>out.push('  '.repeat(depth+1)+'- ['+(s.done?'x':' ')+'] '+s.text));if(n.description)out.push('  '.repeat(depth+1)+'_'+n.description.split('\n').join('  ')+'_');(childrenOf[id]||[]).forEach(c=>walk(c,depth+1,seen));}
  const seen=new Set();walk(root.id,0,seen);
  // Orphans
  _mmCurrent.nodes.filter(n=>!seen.has(n.id)).forEach(n=>walk(n.id,0,seen));
  const blob=new Blob([out.join('\n')],{type:'text/markdown'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(_mmCurrent.title||'mindmap')+'.md';a.click();URL.revokeObjectURL(a.href);toast('⬇ Markdown exported');
}

function mmConvertToNote(nodeId){
  const node = _mmCurrent.nodes.find(n=>n.id===nodeId);
  if(!node) return;
  // Gather connected nodes as note body content
  const connectedIds = _mmCurrent.edges
    .filter(e=>e.from===nodeId || e.to===nodeId)
    .map(e=>e.from===nodeId ? e.to : e.from);
  const connectedTexts = connectedIds.map(cid=>{
    const child = _mmCurrent.nodes.find(n=>n.id===cid);
    return child ? '• ' + child.text : null;
  }).filter(Boolean);
  const body = connectedTexts.length 
    ? `## ${node.text}\n\nRelated ideas:\n${connectedTexts.join('\n')}\n\n---\n_Created from mind map: ${_mmCurrent.title}_`
    : `## ${node.text}\n\n---\n_Created from mind map: ${_mmCurrent.title}_`;
  const note = {
    id: Date.now() + Math.floor(Math.random()*1000),
    title: node.text,
    body: body,
    tags: ['mindmap'],
    source: 'Mind Map',
    starred: false,
    createdBy: D.creds.userName || 'User',
    createdAt: new Date().toISOString(),
    updated: new Date().toLocaleString()
  };
  D.notes.unshift(note);
  save('notes');
  document.getElementById('mm-context-menu').style.display = 'none';
  toast(`📝 Note created: "${node.text}"`);
}

/* ═════════════════════════════════════════════════════════════════════
   SHEETS — Smartsheet-like spreadsheets, shown as a section inside Notes.
   Data: D.sheets (blob array, migration 0047). Per-cell formulas (=…),
   visual column types (status/progress/rating/person), table themes,
   templates, and team co-editing via appData.sharedSheetsForMe /
   updateSharedSheet. See CLAUDE.md "Sheets feature build".
   ═════════════════════════════════════════════════════════════════════ */
let _sheetCurrent=null;          // open sheet — own: ref into D.sheets; shared: detached copy
let _sheetUndo=[]; let _sheetRedo=[];
let _sharedSheetsLoaded=false;
let _sheetSharedSyncTimer=null;
let _sheetShowDesign=true;

const SHEET_PALETTE=['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#64748b'];
const SHEET_ICONS=['📊','📋','🗂','🎯','🚀','💡','🧭','📈','💰','🗓','🧩','🛠','⚙','🔬','🏗','📌','🌱','🏆'];
const SHEET_COL_TYPES=[
  {k:'text',label:'Text',icon:'T'},{k:'number',label:'Number',icon:'#'},
  {k:'currency',label:'Currency',icon:'$'},{k:'date',label:'Date',icon:'📅'},
  {k:'checkbox',label:'Checkbox',icon:'☑'},{k:'select',label:'Status / Select',icon:'▾'},
  {k:'progress',label:'Progress bar',icon:'▰'},{k:'rating',label:'Rating',icon:'★'},
  {k:'person',label:'Person',icon:'@'}];

function ensureSheets(){ if(!Array.isArray(D.sheets))D.sheets=[]; }
function _sheetNextId(){ ensureSheets(); const all=D.sheets.concat(Array.isArray(D._sharedSheets)?D._sharedSheets:[]); let mx=Date.now(); all.forEach(s=>{const n=Number(s.id); if(!isNaN(n)&&n>=mx)mx=n+1;}); return mx; }
function saveSheets(){
  if(_sheetCurrent)_sheetCurrent.updatedAt=new Date().toISOString();
  if(_sheetCurrent&&_sheetCurrent._shared){ _shPushShared(_sheetCurrent); }
  else { try{(window.save||save)('sheets');}catch(_){ try{localStorage.setItem('lu_sheets',JSON.stringify(D.sheets));}catch(__){} } }
}
function _shPushShared(sheet){
  clearTimeout(_sheetSharedSyncTimer);
  _sheetSharedSyncTimer=setTimeout(async()=>{
    try{ await _trpc('appData.updateSharedSheet',{ownerUserId:Number(sheet._sharedFromUserId)||0,sheetId:String(sheet.id),patch:{
      title:sheet.title,icon:sheet.icon,color:sheet.color,theme:sheet.theme,columns:sheet.columns,rows:sheet.rows,
      assignees:sheet.assignees,assigneeNames:sheet.assigneeNames,primaryAssigneeId:sheet.primaryAssigneeId,assignedTo:sheet.assignedTo}},'mutation'); }
    catch(e){ if(typeof toast==='function')toast({type:'error',title:'Shared sheet not synced',msg:String(e&&e.message||e).slice(0,120)}); }
  },1500);
}

// ─── Notes ⇄ Sheets section toggle ───────────────────────────────────────────
function _notesModeIsSheets(){ return !!(D.prefs&&D.prefs.notesMode==='sheets'); }
function _notesModeIsSlides(){ return !!(D.prefs&&D.prefs.notesMode==='slides'); }
function setNotesMode(mode){ D.prefs=D.prefs||{}; D.prefs.notesMode=(mode==='sheets'||mode==='slides')?mode:'notes'; try{(window.save||save)('prefs');}catch(_){} _applyNotesMode(); }
function _applyNotesMode(){
  if(typeof document==='undefined')return;
  const m=(D.prefs&&D.prefs.notesMode)||'notes';
  document.body.classList.toggle('notes-mode-sheets',m==='sheets');
  document.body.classList.toggle('notes-mode-slides',m==='slides');
  const bn=document.getElementById('notes-mode-notes'),bs=document.getElementById('notes-mode-sheets-btn'),bd=document.getElementById('notes-mode-slides-btn');
  if(bn)bn.classList.toggle('on',m==='notes'); if(bs)bs.classList.toggle('on',m==='sheets'); if(bd)bd.classList.toggle('on',m==='slides');
  if(m==='sheets')renderSheetsSection();
  if(m==='slides'&&typeof renderDecksSection==='function')renderDecksSection();
}

// ─── Templates ───────────────────────────────────────────────────────────────
function _shMakeSheet(title,icon,color,colDefs,rowVals){
  const columns=colDefs.map((d,i)=>({id:i+1,name:d.name,type:d.type||'text',width:d.width||150,color:d.color||'',options:d.options||null,summary:d.summary||'none',align:d.align||''}));
  const rows=(rowVals||[]).map((vals,ri)=>{ const cells={}; columns.forEach((c,ci)=>{ if(vals[ci]!==undefined&&vals[ci]!=='')cells[c.id]=vals[ci]; }); return {id:ri+1,cells:cells,color:''}; });
  return {title,icon,color,columns,rows};
}
function _shOpts(arr){ return arr.map((l,i)=>({label:l,color:SHEET_PALETTE[i%SHEET_PALETTE.length]})); }
const SHEET_TEMPLATES=[
  {key:'blank',name:'Blank sheet',icon:'📊',desc:'Start from scratch',build:()=>_shMakeSheet('Untitled sheet','📊','#3b82f6',
    [{name:'Item',width:220},{name:'Detail'},{name:'Notes',width:200}],
    [['','',''],['','',''],['','','']])},
  {key:'project',name:'Project plan',icon:'🚀',desc:'Tasks, owners, status & progress',build:()=>_shMakeSheet('Project plan','🚀','#3b82f6',
    [{name:'Task',width:240},{name:'Owner',type:'person'},{name:'Status',type:'select',options:_shOpts(['Not started','In progress','Blocked','Done'])},{name:'Priority',type:'select',options:_shOpts(['Low','Medium','High'])},{name:'Start',type:'date'},{name:'Due',type:'date'},{name:'Progress',type:'progress',summary:'avg'},{name:'Notes',width:200}],
    [['Define scope','','In progress','High','','','40',''],['Design',' ','Not started','Medium','','','0',''],['Build','','Not started','High','','','0',''],['Launch','','Not started','Medium','','','0','']])},
  {key:'okr',name:'OKRs / Strategy',icon:'🎯',desc:'Objectives, key results, confidence',build:()=>_shMakeSheet('OKRs','🎯','#8b5cf6',
    [{name:'Objective',width:240},{name:'Key result',width:240},{name:'Owner',type:'person'},{name:'Progress',type:'progress',summary:'avg'},{name:'Confidence',type:'rating'},{name:'Status',type:'select',options:_shOpts(['On track','At risk','Off track','Done'])}],
    [['Grow activation','Lift D1 retention to 45%','','30','4','On track'],['Grow activation','Ship onboarding v2','','10','3','At risk'],['Expand revenue','Reach $50k MRR','','55','4','On track']])},
  {key:'roadmap',name:'Roadmap',icon:'🧭',desc:'Initiatives by quarter & theme',build:()=>_shMakeSheet('Roadmap','🧭','#06b6d4',
    [{name:'Initiative',width:260},{name:'Quarter',type:'select',options:_shOpts(['Q1','Q2','Q3','Q4'])},{name:'Theme',type:'select',options:_shOpts(['Growth','Retention','Platform','Quality'])},{name:'Owner',type:'person'},{name:'Status',type:'select',options:_shOpts(['Idea','Planned','Building','Shipped'])},{name:'Impact',type:'rating'}],
    [['Self-serve onboarding','Q1','Growth','','Planned','5'],['Mobile app','Q2','Platform','','Idea','4'],['Reliability hardening','Q1','Quality','','Building','3']])},
  {key:'swot',name:'SWOT analysis',icon:'🧩',desc:'Strengths, weaknesses, opportunities, threats',build:()=>_shMakeSheet('SWOT analysis','🧩','#f59e0b',
    [{name:'Type',type:'select',options:[{label:'Strength',color:'#10b981'},{label:'Weakness',color:'#ef4444'},{label:'Opportunity',color:'#3b82f6'},{label:'Threat',color:'#f59e0b'}]},{name:'Item',width:320},{name:'Priority',type:'rating'},{name:'Notes',width:220}],
    [['Strength','Strong brand loyalty','4',''],['Weakness','Limited mobile presence','3',''],['Opportunity','Emerging market demand','5',''],['Threat','New competitor entrants','4','']])},
  {key:'risk',name:'Risk register',icon:'⚠',desc:'Likelihood × impact scoring',build:()=>_shMakeSheet('Risk register','⚠','#ef4444',
    [{name:'Risk',width:260},{name:'Likelihood',type:'rating'},{name:'Impact',type:'rating'},{name:'Score',type:'number',summary:'max'},{name:'Owner',type:'person'},{name:'Mitigation',width:240},{name:'Status',type:'select',options:_shOpts(['Open','Mitigating','Closed'])}],
    [['Key vendor outage','3','5','=B2*C2','','Add fallback provider','Open'],['Scope creep','4','3','=B3*C3','','Weekly scope review','Mitigating'],['Data loss','2','5','=B4*C4','','Automated backups','Open']])},
  {key:'decision',name:'Decision matrix',icon:'⚖',desc:'Weighted option scoring',build:()=>_shMakeSheet('Decision matrix','⚖','#84cc16',
    [{name:'Option',width:220},{name:'Impact',type:'rating'},{name:'Confidence',type:'rating'},{name:'Ease',type:'rating'},{name:'Score',type:'number',summary:'max'}],
    [['Option A','4','3','5','=B2+C2+D2'],['Option B','5','4','2','=B3+C3+D3'],['Option C','3','5','4','=B4+C4+D4']])},
  {key:'budget',name:'Budget tracker',icon:'💰',desc:'Estimate vs actual with variance',build:()=>_shMakeSheet('Budget','💰','#10b981',
    [{name:'Item',width:220},{name:'Category',type:'select',options:_shOpts(['People','Tools','Marketing','Ops'])},{name:'Estimate',type:'currency',summary:'sum'},{name:'Actual',type:'currency',summary:'sum'},{name:'Variance',type:'currency',summary:'sum'}],
    [['Engineering','People','12000','11500','=C2-D2'],['SaaS tools','Tools','800','920','=C3-D3'],['Ads','Marketing','3000','2750','=C4-D4']])},
  {key:'content',name:'Content calendar',icon:'🗓',desc:'Plan & track publishing',build:()=>_shMakeSheet('Content calendar','🗓','#ec4899',
    [{name:'Title',width:240},{name:'Channel',type:'select',options:_shOpts(['Blog','Email','LinkedIn','X','YouTube'])},{name:'Owner',type:'person'},{name:'Publish',type:'date'},{name:'Status',type:'select',options:_shOpts(['Idea','Draft','Review','Scheduled','Published'])},{name:'Notes',width:200}],
    [['Launch announcement','Blog','','','Draft',''],['Weekly tips','Email','','','Idea',''],['Behind the scenes','LinkedIn','','','Idea','']])}
];

// ─── Section render (gallery vs editor) ──────────────────────────────────────
function renderSheetsSection(){
  const host=document.getElementById('notes-sheets-section'); if(!host)return;
  ensureSheets();
  if(!_sharedSheetsLoaded)_loadSharedSheets();
  if(_sheetCurrent){ host.innerHTML=_shEditorHtml(); _shHydrateEditor(); return; }
  // Gallery
  const own=D.sheets.slice().sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  const shared=Array.isArray(D._sharedSheets)?D._sharedSheets:[];
  const totalCells=D.sheets.reduce((s,sh)=>s+((sh.rows||[]).length*(sh.columns||[]).length),0);
  host.innerHTML=`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <div>
        <div style="font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px">📊 Sheets</div>
        <div style="font-size:11px;color:var(--t2)">${D.sheets.length} sheet${D.sheets.length===1?'':'s'}${totalCells?` · ${totalCells} cells`:''} · build visual, spreadsheet-style strategy boards</div>
      </div>
      <span style="flex:1"></span>
      <button class="btn btn-p" onclick="shNewSheetMenu(event)">+ New sheet</button>
    </div>
    ${own.length?`<div class="sh-gallery">${own.map(_shCard).join('')}</div>`:`<div style="border:1px dashed var(--bd2);border-radius:12px;padding:34px;text-align:center;color:var(--t2)">
      <div style="font-size:34px;margin-bottom:8px">📊</div>
      <div style="font-weight:600;margin-bottom:4px">No sheets yet</div>
      <div style="font-size:12px;margin-bottom:14px">Spin up a spreadsheet to plan projects, score decisions, map a strategy, or track a budget.</div>
      <button class="btn btn-p" onclick="shNewSheetMenu(event)">+ New sheet from template</button></div>`}
    ${shared.length?`<div style="margin-top:22px"><div style="font-size:12px;font-weight:700;color:var(--purp);display:flex;align-items:center;gap:6px;margin-bottom:8px">👥 Shared & delegated sheets <span style="font-size:11px;color:var(--t3)">(${shared.length})</span></div><div class="sh-gallery">${shared.map((s,i)=>_shSharedCard(s,i)).join('')}</div></div>`:''}
  `;
}
function _shCard(s){
  const rows=(s.rows||[]).length,cols=(s.columns||[]).length;
  const c=s.color||'#3b82f6';
  const assignBadge=(Array.isArray(s.assignees)&&s.assignees.length)?`<span class="sh-card-badge" style="background:${c}22;color:${c}">👥 ${s.assignees.length}</span>`:'';
  return `<div class="sh-card" style="--c:${c}" onclick="shOpen(${Number(s.id)})">
    <span class="sh-card-del" title="Delete sheet" onclick="event.stopPropagation();shDeleteSheet(${Number(s.id)})">🗑</span>
    <div class="sh-card-top"><span class="sh-card-ic">${esc(s.icon||'📊')}</span><span class="sh-card-title">${esc(s.title||'Untitled')}</span></div>
    <div class="sh-card-meta">${rows} row${rows===1?'':'s'} · ${cols} col${cols===1?'':'s'} ${assignBadge}</div>
    <div class="sh-card-bar"></div>
  </div>`;
}
function _shSharedCard(s,i){
  const c=s.color||'#8b5cf6';
  const tag=s._delegated?`assigned to ${esc(s.assignedTo||'someone')}`:'shared with you';
  return `<div class="sh-card sh-card-shared" style="--c:${c}" onclick="shOpenShared(${i})">
    <div class="sh-card-top"><span class="sh-card-ic">${esc(s.icon||'📊')}</span><span class="sh-card-title">${esc(s.title||'Untitled')}</span></div>
    <div class="sh-card-meta">${(s.rows||[]).length} rows · ${s._delegated?'➡ ':'👥 '}${tag}</div>
    <div class="sh-card-bar"></div>
  </div>`;
}

function shNewSheetMenu(ev){
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  _shPopMenu(ev||{clientX:200,clientY:160},SHEET_TEMPLATES.map(t=>({html:`<span style="font-size:15px;margin-right:8px">${t.icon}</span><span><div style="font-weight:600">${esc(t.name)}</div><div style="font-size:11px;color:var(--t3)">${esc(t.desc)}</div></span>`,onClick:()=>shCreateFromTemplate(t.key)})),260);
}
function shCreateFromTemplate(key){
  ensureSheets();
  const tpl=SHEET_TEMPLATES.find(t=>t.key===key)||SHEET_TEMPLATES[0];
  const base=tpl.build();
  const sheet=Object.assign(base,{
    id:_sheetNextId(),templateKey:key,
    theme:{density:'comfortable',striped:true,gridlines:true,headerStyle:'accent'},
    assignees:[],assigneeNames:[],primaryAssigneeId:null,assignedTo:'',
    createdBy:(D.creds&&(D.creds.userName||D.creds.name))||'User',
    createdById:(D.creds&&D.creds.userId)||null,
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
  });
  D.sheets.push(sheet);
  saveSheets();
  _sheetUndo=[];_sheetRedo=[];
  _sheetCurrent=sheet;
  renderSheetsSection();
  toast(`📊 Created “${sheet.title}”`);
}
function shOpen(id){ ensureSheets(); const s=D.sheets.find(x=>Number(x.id)===Number(id)); if(!s)return toast('Sheet not found'); _sheetCurrent=s; _sheetUndo=[];_sheetRedo=[]; renderSheetsSection(); }
async function shOpenShared(i){
  let s=(D._sharedSheets||[])[i];
  if(!s){ await _loadSharedSheets(); s=(D._sharedSheets||[])[i]; }
  if(!s)return toast('Shared sheet unavailable');
  _sheetCurrent=s; _sheetUndo=[];_sheetRedo=[]; renderSheetsSection();
}
function shClose(){ _sheetCurrent=null; renderSheetsSection(); }
function shDeleteSheet(id){
  if(!confirm('Delete this sheet? This cannot be undone.'))return;
  ensureSheets(); D.sheets=D.sheets.filter(x=>Number(x.id)!==Number(id));
  if(_sheetCurrent&&Number(_sheetCurrent.id)===Number(id))_sheetCurrent=null;
  (window.save||save)('sheets'); renderSheetsSection(); toast('🗑 Sheet deleted');
}

// ─── Formula engine (Excel-style A1 refs + functions) ────────────────────────
function _shColName(i){ let s=''; i=Number(i); if(isNaN(i)||i<0)return 'A'; do{ s=String.fromCharCode(65+(i%26))+s; i=Math.floor(i/26)-1; }while(i>=0); return s; }
function _shRefRC(ref){ const m=/^([A-Za-z]{1,2})(\d+)$/.exec(String(ref).trim()); if(!m)return null; const L=m[1].toUpperCase(); let c=0; for(let k=0;k<L.length;k++)c=c*26+(L.charCodeAt(k)-64); return {c:c-1,r:parseInt(m[2],10)-1}; }
function _shNum(v){ if(typeof v==='number')return v; if(v===true)return 1; if(v===false||v==null)return NaN; let s=String(v).trim().replace(/[$,%£€\s]/g,''); if(s==='')return NaN; const n=parseFloat(s); return isNaN(n)?NaN:n; }
function _shResolveRC(sheet,r,c,depth){
  const col=sheet.columns[c],row=sheet.rows[r];
  if(!col||!row)return 0;
  let raw=(row.cells||{})[col.id];
  if(raw==null||raw==='')return 0;
  if(typeof raw==='string'&&raw.charAt(0)==='='){ if((depth||0)>25)return '#CYCLE'; return _shEval(sheet,raw,(depth||0)+1); }
  const n=_shNum(raw); return isNaN(n)?raw:n;
}
function _shHelpers(sheet,depth){
  const flat=a=>a.reduce((o,v)=>o.concat(Array.isArray(v)?flat(v):[v]),[]);
  const nums=a=>flat(a).map(x=>typeof x==='number'?x:_shNum(x)).filter(x=>!isNaN(x));
  return {
    c:(ref)=>{ const rc=_shRefRC(ref); return rc?_shResolveRC(sheet,rc.r,rc.c,depth):0; },
    r:(rg)=>{ const p=String(rg).split(':'); const A=_shRefRC(p[0]),B=_shRefRC(p[1]); if(!A||!B)return []; const out=[]; for(let r=Math.min(A.r,B.r);r<=Math.max(A.r,B.r);r++)for(let c=Math.min(A.c,B.c);c<=Math.max(A.c,B.c);c++)out.push(_shResolveRC(sheet,r,c,depth)); return out; },
    fn:{
      SUM:(...a)=>nums(a).reduce((s,x)=>s+x,0),
      AVERAGE:(...a)=>{const n=nums(a);return n.length?n.reduce((s,x)=>s+x,0)/n.length:0;},
      AVG:(...a)=>{const n=nums(a);return n.length?n.reduce((s,x)=>s+x,0)/n.length:0;},
      MIN:(...a)=>{const n=nums(a);return n.length?Math.min.apply(null,n):0;},
      MAX:(...a)=>{const n=nums(a);return n.length?Math.max.apply(null,n):0;},
      COUNT:(...a)=>nums(a).length,
      COUNTA:(...a)=>flat(a).filter(x=>x!==''&&x!=null).length,
      ROUND:(x,d)=>{const f=Math.pow(10,d||0);return Math.round(_shNum(x)*f)/f;},
      ABS:x=>Math.abs(_shNum(x)),
      PRODUCT:(...a)=>nums(a).reduce((s,x)=>s*x,1),
      IF:(c,t,f)=>c?t:(f===undefined?false:f),
      CONCAT:(...a)=>flat(a).join(''),
      MEDIAN:(...a)=>{const n=nums(a).sort((x,y)=>x-y);if(!n.length)return 0;const m=Math.floor(n.length/2);return n.length%2?n[m]:(n[m-1]+n[m])/2;}
    }
  };
}
function _shEval(sheet,formula,depth){
  try{
    let f=String(formula).replace(/^=/,'').trim();
    if(!f)return '';
    const re=/\s*(?:(\d+(?:\.\d+)?)|("(?:[^"]*)")|([A-Za-z]{1,2}\d+:[A-Za-z]{1,2}\d+)|([A-Za-z]{1,2}\d+)|([A-Za-z_]+)(?=\s*\()|(<=|>=|<>|\*\*|[-+*/%^(),<>=]))/g;
    let js='',last=0,m;
    while((m=re.exec(f))){
      if(m.index!==last)return '#ERR';
      if(m[1]!=null)js+=m[1];
      else if(m[2]!=null)js+=JSON.stringify(m[2].slice(1,-1));
      else if(m[3]!=null)js+='H.r("'+m[3].toUpperCase()+'")';
      else if(m[4]!=null)js+='H.c("'+m[4].toUpperCase()+'")';
      else if(m[5]!=null)js+='H.fn.'+m[5].toUpperCase();
      else if(m[6]!=null){ let op=m[6]; if(op==='^')op='**'; else if(op==='<>')op='!=='; else if(op==='=')op='==='; js+=op; }
      last=re.lastIndex;
    }
    if(last!==f.length)return '#ERR';
    const H=_shHelpers(sheet,depth||0);
    const val=Function('H','return ('+js+')')(H);
    if(typeof val==='number'){ if(!isFinite(val))return '#DIV/0'; return Math.round(val*1e10)/1e10; }
    return val;
  }catch(e){ return '#ERR'; }
}

// ─── Display / formatting ────────────────────────────────────────────────────
function _shFmtVal(col,v){
  if(v==null||v==='')return '';
  if(typeof v==='string'&&v.charAt(0)==='#'&&/^#(ERR|DIV|CYCLE)/.test(v))return `<span style="color:var(--red);font-size:11px">${esc(v)}</span>`;
  switch(col.type){
    case 'currency':{const n=_shNum(v);if(isNaN(n))return esc(String(v));return '$'+n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
    case 'number':{const n=_shNum(v);if(isNaN(n))return esc(String(v));return esc(String(Math.round(n*1e6)/1e6));}
    default:return esc(String(v));
  }
}
function _shCellDisplay(sheet,row,col){
  let raw=(row.cells||{})[col.id];
  if(typeof raw==='string'&&raw.charAt(0)==='='){ return _shFmtVal(col,_shEval(sheet,raw,0)); }
  return _shFmtVal(col,raw);
}
function _shColSummary(sheet,col){
  if(!col.summary||col.summary==='none')return '';
  const vals=sheet.rows.map(r=>{ let raw=(r.cells||{})[col.id]; if(typeof raw==='string'&&raw.charAt(0)==='=')return _shEval(sheet,raw,0); return raw; });
  const nums=vals.map(_shNum).filter(x=>!isNaN(x));
  let out='';
  if(col.summary==='sum')out=nums.reduce((s,x)=>s+x,0);
  else if(col.summary==='avg')out=nums.length?(nums.reduce((s,x)=>s+x,0)/nums.length):0;
  else if(col.summary==='min')out=nums.length?Math.min.apply(null,nums):0;
  else if(col.summary==='max')out=nums.length?Math.max.apply(null,nums):0;
  else if(col.summary==='count')return String(vals.filter(v=>v!=null&&v!=='').length);
  out=Math.round(out*100)/100;
  return col.type==='currency'?('$'+out.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})):String(out);
}

// ─── Editor render ───────────────────────────────────────────────────────────
function _shEditorHtml(){
  const s=_sheetCurrent; const c=s.color||'#3b82f6';
  const shared=s._shared?`<span class="sh-shared-tag">${s._delegated?'➡ delegated':'👥 shared'}</span>`:'';
  return `<div class="sh-editor" style="--c:${c}">
    <div class="sh-toolbar">
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="shClose()">← Sheets</button>
      <span class="sh-ed-ic">${esc(s.icon||'📊')}</span>
      <input class="sh-ed-title" value="${esc(s.title||'')}" onchange="shSetTitle(this.value)" placeholder="Untitled sheet">
      ${shared}
      <span style="flex:1"></span>
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="shUndo()" title="Undo">↶</button>
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="shRedo()" title="Redo">↷</button>
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="shAddRow()">+ Row</button>
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="shAddCol()">+ Column</button>
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="shExportCSV()" title="Export CSV">⬇ CSV</button>
      <button class="btn btn-s" style="height:28px;font-size:11px;${_sheetShowDesign?'background:var(--ac);color:#fff':''}" onclick="shToggleDesign()" title="Design & sharing">🎨 Design</button>
    </div>
    <div class="sh-body">
      <div class="sh-grid-wrap" id="sheet-grid-wrap">${_shGridHtml()}</div>
      <aside class="sh-side" id="sheet-side" style="display:${_sheetShowDesign?'block':'none'}">${_shDesignHtml()}</aside>
    </div>
  </div>`;
}
function _shHydrateEditor(){ if(typeof buildMultiAssignee==='function'){ /* picker rendered inside design html; nothing extra */ } }
function shToggleDesign(){ _sheetShowDesign=!_sheetShowDesign; renderSheetsSection(); }
function shSetTitle(v){ if(!_sheetCurrent)return; _sheetCurrent.title=(v||'').trim()||'Untitled sheet'; saveSheets(); }

function _shGridHtml(){
  const s=_sheetCurrent; const th=s.theme||{};
  const dens=th.density==='compact'?'sh-compact':'';
  const strp=th.striped?'sh-striped':''; const gl=th.gridlines===false?'sh-nogrid':'';
  const hdr=th.headerStyle==='accent'?'sh-hdr-accent':(th.headerStyle==='bold'?'sh-hdr-bold':'');
  const cols=s.columns;
  let head='<tr><th class="sh-rownum-h">#</th>';
  cols.forEach((col,ci)=>{
    const tIcon=(SHEET_COL_TYPES.find(t=>t.k===col.type)||{}).icon||'T';
    head+=`<th class="sh-colhead" data-cid="${col.id}" style="width:${col.width||150}px;${col.color?`border-top:3px solid ${col.color}`:''}" onclick="shColMenu(event,${col.id})" title="${esc(col.name)} — click to edit · drag right edge to resize">
      <span class="sh-colhead-i">${esc(tIcon)}</span><span class="sh-colhead-n">${esc(col.name||_shColName(ci))}</span><span class="sh-colhead-letter">${_shColName(ci)}</span><span class="sh-col-resize" title="Drag to resize column" onmousedown="shColResizeStart(event,${col.id})" onclick="event.stopPropagation()"></span></th>`;
  });
  head+='<th class="sh-addcol" onclick="shAddCol()" title="Add column">+</th></tr>';
  let body='';
  s.rows.forEach((row,ri)=>{
    const rh=row.height?`height:${row.height}px;`:'';
    const shadow=row.color?`box-shadow:inset 4px 0 0 ${row.color};`:'';
    const trStyle=(rh||shadow)?` style="${rh}${shadow}"`:'';
    body+=`<tr data-rid="${row.id}"${trStyle}><td class="sh-rownum" onclick="shRowMenu(event,${row.id})" title="Row actions · drag bottom edge to resize">${ri+1}<span class="sh-row-resize" title="Drag to resize row" onmousedown="shRowResizeStart(event,${row.id})" onclick="event.stopPropagation()"></span></td>`;
    cols.forEach((col,ci)=>{ body+=`<td class="sh-td sh-td-${col.type}" style="${col.align?`text-align:${col.align}`:''}">${_shCellHtml(s,row,col)}</td>`; });
    body+='<td class="sh-rowpad"></td></tr>';
  });
  // Summary footer (only if any column has a summary)
  let foot='';
  if(cols.some(c=>c.summary&&c.summary!=='none')){
    foot='<tr class="sh-footrow"><td class="sh-rownum" title="Column summaries">Σ</td>';
    cols.forEach(col=>{ const sm=_shColSummary(s,col); foot+=`<td class="sh-foot">${sm?`<span class="sh-foot-l">${esc(col.summary)}</span> ${esc(sm)}`:''}</td>`; });
    foot+='<td></td></tr>';
  }
  return `<table class="sh-table ${dens} ${strp} ${gl} ${hdr}"><thead>${head}</thead><tbody>${body}</tbody>${foot?`<tfoot>${foot}</tfoot>`:''}</table>
    <div class="sh-addrow" onclick="shAddRow()">+ Add row</div>`;
}
// Re-render only the grid (not the design side) so an in-progress assignee
// selection isn't reset when a cell is edited.
function renderSheetGrid(){ const w=document.getElementById('sheet-grid-wrap'); if(w)w.innerHTML=_shGridHtml(); }

// ─── Column / row drag-resize ────────────────────────────────────────────────
let _shResize=null, _shResizeJustEnded=false;
function shColResizeStart(e,cid){
  e.preventDefault(); e.stopPropagation();
  const s=_sheetCurrent; const col=s&&s.columns.find(c=>c.id===cid); if(!col)return;
  _shResize={type:'col',id:cid,start:e.clientX,size:col.width||150,live:col.width||150};
  document.body.style.cursor='col-resize'; document.body.classList.add('sh-resizing');
  document.addEventListener('mousemove',_shResizeMove); document.addEventListener('mouseup',_shResizeEnd);
}
function shRowResizeStart(e,rid){
  e.preventDefault(); e.stopPropagation();
  const s=_sheetCurrent; const row=s&&s.rows.find(r=>r.id===rid); if(!row)return;
  _shResize={type:'row',id:rid,start:e.clientY,size:row.height||32,live:row.height||32};
  document.body.style.cursor='row-resize'; document.body.classList.add('sh-resizing');
  document.addEventListener('mousemove',_shResizeMove); document.addEventListener('mouseup',_shResizeEnd);
}
function _shResizeMove(e){
  if(!_shResize)return;
  if(_shResize.type==='col'){
    const w=Math.max(60,Math.min(700,_shResize.size+(e.clientX-_shResize.start)));
    _shResize.live=w; const th=document.querySelector('.sh-colhead[data-cid="'+_shResize.id+'"]'); if(th)th.style.width=w+'px';
  }else{
    const h=Math.max(26,Math.min(400,_shResize.size+(e.clientY-_shResize.start)));
    _shResize.live=h; const tr=document.querySelector('tr[data-rid="'+_shResize.id+'"]'); if(tr)tr.style.height=h+'px';
  }
}
function _shResizeEnd(){
  document.removeEventListener('mousemove',_shResizeMove); document.removeEventListener('mouseup',_shResizeEnd);
  document.body.style.cursor=''; document.body.classList.remove('sh-resizing');
  const r=_shResize; _shResize=null; const s=_sheetCurrent; if(!r||!s)return;
  if(r.type==='col'){
    const col=s.columns.find(c=>c.id===r.id);
    if(col&&(col.width||150)!==Math.round(r.live)){ _shSnap(); col.width=Math.round(r.live); saveSheets(); }
    _shResizeJustEnded=true; setTimeout(()=>{_shResizeJustEnded=false;},250); // swallow the click that would open the column menu
  }else{
    const row=s.rows.find(x=>x.id===r.id);
    if(row&&(row.height||32)!==Math.round(r.live)){ _shSnap(); row.height=Math.round(r.live); saveSheets(); }
  }
  renderSheetGrid();
}

function _shCellHtml(s,row,col){
  const raw=(row.cells||{})[col.id];
  switch(col.type){
    case 'checkbox':{ const on=!!raw&&raw!=='false'; return `<div class="sh-chk ${on?'on':''}" onclick="shToggleCheck(${row.id},${col.id})">${on?'✓':''}</div>`; }
    case 'rating':{ const v=Math.max(0,Math.min(5,Math.round(_shNum(raw)||0))); let st=''; for(let i=1;i<=5;i++)st+=`<span class="sh-star ${i<=v?'on':''}" onclick="shSetRating(${row.id},${col.id},${i})">★</span>`; return `<div class="sh-rating">${st}</div>`; }
    case 'progress':{ const p=Math.max(0,Math.min(100,Math.round(_shNum(typeof raw==='string'&&raw.charAt(0)==='='?_shEval(s,raw,0):raw)||0))); const cc=p>=100?'var(--color-status-ok)':p>=50?'var(--ac)':'var(--color-status-warn)'; return `<div class="sh-prog" onclick="shEditProgress(${row.id},${col.id})" title="Click to set %"><div class="sh-prog-bar" style="width:${p}%;background:${cc}"></div><span class="sh-prog-n">${p}%</span></div>`; }
    case 'select':{ const opt=(col.options||[]).find(o=>o.label===raw); const bg=opt?opt.color:'var(--t3)'; return raw?`<div class="sh-pill" style="background:${bg};color:#fff" onclick="shOpenSelect(event,${row.id},${col.id})">${esc(String(raw))}<span class="sh-pill-ch">▾</span></div>`:`<div class="sh-pill sh-pill-empty" onclick="shOpenSelect(event,${row.id},${col.id})">— select —<span class="sh-pill-ch">▾</span></div>`; }
    case 'person':{ return raw?`<div class="sh-pill sh-person" onclick="shOpenPerson(event,${row.id},${col.id})"><span class="sh-avatar">${esc((String(raw)[0]||'?').toUpperCase())}</span>${esc(String(raw))}</div>`:`<div class="sh-pill sh-pill-empty" onclick="shOpenPerson(event,${row.id},${col.id})">— assign —</div>`; }
    default:{ const disp=_shCellDisplay(s,row,col); const isF=typeof raw==='string'&&raw.charAt(0)==='='; return `<div class="sh-cell-edit ${isF?'sh-formula':''}" contenteditable="true" data-row="${row.id}" data-col="${col.id}" data-raw="${esc(raw==null?'':String(raw))}" onfocus="shCellFocus(this)" onblur="shCellBlur(this)" onkeydown="shCellKey(event,this)" spellcheck="false" title="${isF?esc(String(raw)):''}">${disp}</div>`; }
  }
}

// ─── Cell editing ────────────────────────────────────────────────────────────
function shCellFocus(el){ const raw=el.getAttribute('data-raw')||''; el.textContent=raw; el.classList.add('sh-editing'); setTimeout(()=>{ try{const r=document.createRange();r.selectNodeContents(el);const sel=getSelection();sel.removeAllRanges();sel.addRange(r);}catch(_){} },0); }
function shCellBlur(el){ el.classList.remove('sh-editing'); const rid=Number(el.dataset.row),cid=Number(el.dataset.col); shSetCell(rid,cid,el.textContent); }
function shCellKey(e,el){ if(e.key==='Enter'){e.preventDefault();el.blur();} else if(e.key==='Escape'){e.preventDefault();el.textContent=el.getAttribute('data-raw')||'';el.blur();} else if(e.key==='Tab'){e.preventDefault();el.blur();} }
function shSetCell(rid,cid,val){
  const s=_sheetCurrent; if(!s)return;
  const row=s.rows.find(r=>r.id===rid),col=s.columns.find(c=>c.id===cid); if(!row||!col)return;
  row.cells=row.cells||{};
  let v=(typeof val==='string')?val.replace(/ /g,' ').trim():val;
  if(String(row.cells[cid]==null?'':row.cells[cid])===String(v==null?'':v))return;
  _shSnap();
  if(v==='')delete row.cells[cid]; else row.cells[cid]=v;
  saveSheets(); renderSheetGrid();
}
function shToggleCheck(rid,cid){ const s=_sheetCurrent; const row=s.rows.find(r=>r.id===rid); if(!row)return; row.cells=row.cells||{}; _shSnap(); row.cells[cid]=!(row.cells[cid]&&row.cells[cid]!=='false'); saveSheets(); renderSheetGrid(); }
function shSetRating(rid,cid,v){ const s=_sheetCurrent; const row=s.rows.find(r=>r.id===rid); if(!row)return; row.cells=row.cells||{}; const cur=Math.round(_shNum(row.cells[cid])||0); _shSnap(); row.cells[cid]=(cur===v?v-1:v)||0; if(!row.cells[cid])delete row.cells[cid]; saveSheets(); renderSheetGrid(); }
function shEditProgress(rid,cid){ const s=_sheetCurrent; const row=s.rows.find(r=>r.id===rid); if(!row)return; const cur=Math.round(_shNum((row.cells||{})[cid])||0); const v=prompt('Progress % (0–100):',String(cur)); if(v==null)return; let n=Math.max(0,Math.min(100,Math.round(parseFloat(v)||0))); row.cells=row.cells||{}; _shSnap(); row.cells[cid]=n; saveSheets(); renderSheetGrid(); }
function shOpenSelect(ev,rid,cid){ ev.stopPropagation(); const s=_sheetCurrent; const col=s.columns.find(c=>c.id===cid); col.options=col.options||[]; const items=col.options.map(o=>({html:`<span class="sh-dot" style="background:${o.color}"></span>${esc(o.label)}`,onClick:()=>shSetCell(rid,cid,o.label)})); items.push({html:'<span style="color:var(--ac)">＋ New option…</span>',onClick:()=>{ const lbl=prompt('New option label:'); if(!lbl)return; col.options.push({label:lbl.trim(),color:SHEET_PALETTE[col.options.length%SHEET_PALETTE.length]}); shSetCell(rid,cid,lbl.trim()); }}); items.push({html:'<span style="color:var(--t3)">Clear</span>',onClick:()=>shSetCell(rid,cid,'')}); _shPopMenu(ev,items); }
function shOpenPerson(ev,rid,cid){ ev.stopPropagation(); const mem=(typeof _assigneeMembers==='function'?_assigneeMembers():[]).filter(m=>m&&m.name); const items=mem.length?mem.map(m=>({html:`<span class="sh-avatar">${esc((m.name[0]||'?').toUpperCase())}</span>${esc(m.name)}`,onClick:()=>shSetCell(rid,cid,m.name)})):[{html:'<span style="color:var(--t3)">No team members</span>',onClick:()=>{}}]; items.push({html:'<span style="color:var(--t3)">Clear</span>',onClick:()=>shSetCell(rid,cid,'')}); _shPopMenu(ev,items); }

// ─── Column & row operations ─────────────────────────────────────────────────
function _shColIdx(cid){ return _sheetCurrent.columns.findIndex(c=>c.id===cid); }
function shColMenu(ev,cid){
  ev.stopPropagation();
  if(_shResizeJustEnded){ _shResizeJustEnded=false; return; }
  const s=_sheetCurrent; const col=s.columns.find(c=>c.id===cid); if(!col)return;
  const items=[
    {html:'✏ Rename',onClick:()=>{ const n=prompt('Column name:',col.name); if(n==null)return; _shSnap(); col.name=n.trim()||col.name; saveSheets(); renderSheetGrid(); }},
    {html:'🔧 Change type…',onClick:()=>setTimeout(()=>_shPopMenu(ev,SHEET_COL_TYPES.map(t=>({html:`<span style="display:inline-block;width:16px">${t.icon}</span> ${t.label}${col.type===t.k?' ✓':''}`,onClick:()=>shSetColType(cid,t.k)}))),0)},
    {html:'🎨 Header colour…',onClick:()=>setTimeout(()=>_shColorMenu(ev,c=>{ _shSnap(); col.color=c; saveSheets(); renderSheetGrid(); }),0)},
    {html:'Σ Summary…',onClick:()=>setTimeout(()=>_shPopMenu(ev,['none','sum','avg','min','max','count'].map(k=>({html:k+(col.summary===k?' ✓':''),onClick:()=>{_shSnap();col.summary=k;saveSheets();renderSheetGrid();}}))),0)}
  ];
  if(col.type==='select')items.push({html:'🏷 Edit options…',onClick:()=>shEditSelectOptions(cid)});
  items.push({html:'↕ Width',onClick:()=>{ const w=prompt('Column width (px):',String(col.width||150)); if(w==null)return; _shSnap(); col.width=Math.max(60,Math.min(600,parseInt(w,10)||150)); saveSheets(); renderSheetGrid(); }});
  items.push({html:'⬆ Sort A→Z',onClick:()=>shSortByCol(cid,1)});
  items.push({html:'⬇ Sort Z→A',onClick:()=>shSortByCol(cid,-1)});
  items.push({html:'⬅ Insert left',onClick:()=>shInsertCol(cid,0)});
  items.push({html:'➡ Insert right',onClick:()=>shInsertCol(cid,1)});
  items.push({html:'<span style="color:var(--red)">🗑 Delete column</span>',onClick:()=>shDeleteCol(cid)});
  _shPopMenu(ev,items);
}
function shSetColType(cid,type){ const s=_sheetCurrent; const col=s.columns.find(c=>c.id===cid); if(!col)return; _shSnap(); col.type=type; if(type==='select'&&!col.options)col.options=[]; if(type==='progress'&&col.summary==='none')col.summary='avg'; saveSheets(); renderSheetGrid(); }
function shEditSelectOptions(cid){ const s=_sheetCurrent; const col=s.columns.find(c=>c.id===cid); if(!col)return; const cur=(col.options||[]).map(o=>o.label).join(', '); const v=prompt('Options (comma-separated):',cur); if(v==null)return; _shSnap(); col.options=v.split(',').map(x=>x.trim()).filter(Boolean).map((l,i)=>{ const ex=(col.options||[]).find(o=>o.label===l); return ex||{label:l,color:SHEET_PALETTE[i%SHEET_PALETTE.length]}; }); saveSheets(); renderSheetGrid(); }
function shAddCol(){ const s=_sheetCurrent; if(!s)return; _shSnap(); const id=(s.columns.reduce((m,c)=>Math.max(m,c.id),0)||0)+1; s.columns.push({id,name:'Column '+(s.columns.length+1),type:'text',width:150,color:'',options:null,summary:'none',align:''}); saveSheets(); renderSheetGrid(); }
function shInsertCol(cid,after){ const s=_sheetCurrent; const idx=_shColIdx(cid); if(idx<0)return; _shSnap(); const id=(s.columns.reduce((m,c)=>Math.max(m,c.id),0)||0)+1; s.columns.splice(idx+(after?1:0),0,{id,name:'Column',type:'text',width:150,color:'',options:null,summary:'none',align:''}); saveSheets(); renderSheetGrid(); }
function shDeleteCol(cid){ const s=_sheetCurrent; if(s.columns.length<=1)return toast('A sheet needs at least one column'); _shSnap(); s.columns=s.columns.filter(c=>c.id!==cid); s.rows.forEach(r=>{ if(r.cells)delete r.cells[cid]; }); saveSheets(); renderSheetGrid(); }
function shSortByCol(cid,dir){ const s=_sheetCurrent; const col=s.columns.find(c=>c.id===cid); if(!col)return; _shSnap(); const val=row=>{ let v=(row.cells||{})[cid]; if(typeof v==='string'&&v.charAt(0)==='=')v=_shEval(s,v,0); const n=_shNum(v); return isNaN(n)?String(v==null?'':v).toLowerCase():n; }; s.rows.sort((a,b)=>{ const va=val(a),vb=val(b); if(typeof va==='number'&&typeof vb==='number')return (va-vb)*dir; return String(va).localeCompare(String(vb))*dir; }); saveSheets(); renderSheetGrid(); }

function shAddRow(){ const s=_sheetCurrent; if(!s)return; _shSnap(); const id=(s.rows.reduce((m,r)=>Math.max(m,r.id),0)||0)+1; s.rows.push({id,cells:{},color:''}); saveSheets(); renderSheetGrid(); }
function shRowMenu(ev,rid){
  ev.stopPropagation(); const s=_sheetCurrent; const idx=s.rows.findIndex(r=>r.id===rid); if(idx<0)return;
  const items=[
    {html:'⬆ Insert above',onClick:()=>{ _shSnap(); const id=(s.rows.reduce((m,r)=>Math.max(m,r.id),0)||0)+1; s.rows.splice(idx,0,{id,cells:{},color:''}); saveSheets(); renderSheetGrid(); }},
    {html:'⬇ Insert below',onClick:()=>{ _shSnap(); const id=(s.rows.reduce((m,r)=>Math.max(m,r.id),0)||0)+1; s.rows.splice(idx+1,0,{id,cells:{},color:''}); saveSheets(); renderSheetGrid(); }},
    {html:'⧉ Duplicate',onClick:()=>{ _shSnap(); const id=(s.rows.reduce((m,r)=>Math.max(m,r.id),0)||0)+1; s.rows.splice(idx+1,0,{id,cells:Object.assign({},s.rows[idx].cells),color:s.rows[idx].color}); saveSheets(); renderSheetGrid(); }},
    {html:'🎨 Row colour…',onClick:()=>setTimeout(()=>_shColorMenu(ev,c=>{ _shSnap(); s.rows[idx].color=c; saveSheets(); renderSheetGrid(); },true),0)},
    {html:'⬆ Move up',onClick:()=>{ if(idx<=0)return; _shSnap(); const r=s.rows.splice(idx,1)[0]; s.rows.splice(idx-1,0,r); saveSheets(); renderSheetGrid(); }},
    {html:'⬇ Move down',onClick:()=>{ if(idx>=s.rows.length-1)return; _shSnap(); const r=s.rows.splice(idx,1)[0]; s.rows.splice(idx+1,0,r); saveSheets(); renderSheetGrid(); }},
    {html:'<span style="color:var(--red)">🗑 Delete row</span>',onClick:()=>{ _shSnap(); s.rows=s.rows.filter(r=>r.id!==rid); saveSheets(); renderSheetGrid(); }}
  ];
  _shPopMenu(ev,items);
}

// ─── Design / theme / sharing panel ──────────────────────────────────────────
function _shDesignHtml(){
  const s=_sheetCurrent; const th=s.theme||(s.theme={density:'comfortable',striped:true,gridlines:true,headerStyle:'accent'});
  const seg=(active,val,label,fn)=>`<button class="sh-seg-b ${active?'on':''}" onclick="${fn}('${val}')">${label}</button>`;
  return `
    <div class="sh-side-sec"><div class="sh-side-h">Sheet</div>
      <div class="sh-icon-grid">${SHEET_ICONS.map(ic=>`<div class="sh-icon-b ${s.icon===ic?'on':''}" onclick="shSetIcon('${ic}')">${ic}</div>`).join('')}</div>
    </div>
    <div class="sh-side-sec"><div class="sh-side-h">Accent colour</div>
      <div class="sh-color-grid">${SHEET_PALETTE.map(c=>`<div class="sh-color-sw ${s.color===c?'on':''}" style="background:${c}" onclick="shSetColor('${c}')"></div>`).join('')}</div>
    </div>
    <div class="sh-side-sec"><div class="sh-side-h">Density</div>
      <div class="sh-seg">${seg(th.density!=='compact','comfortable','Comfortable','shSetDensity')}${seg(th.density==='compact','compact','Compact','shSetDensity')}</div>
    </div>
    <div class="sh-side-sec"><div class="sh-side-h">Header</div>
      <div class="sh-seg">${seg(th.headerStyle==='accent','accent','Accent','shSetHeaderStyle')}${seg(th.headerStyle==='bold','bold','Bold','shSetHeaderStyle')}${seg(th.headerStyle==='plain','plain','Plain','shSetHeaderStyle')}</div>
    </div>
    <div class="sh-side-sec"><div class="sh-side-h">Style</div>
      <label class="sh-check"><input type="checkbox" ${th.striped?'checked':''} onchange="shToggleTheme('striped')"> Striped rows</label>
      <label class="sh-check"><input type="checkbox" ${th.gridlines!==false?'checked':''} onchange="shToggleTheme('gridlines')"> Gridlines</label>
    </div>
    <div class="sh-side-sec"><div class="sh-side-h">👥 Share with team</div>
      <div style="font-size:11px;color:var(--t3);margin-bottom:6px">Assigned members can open & co-edit this sheet from their Sheets section.</div>
      ${(typeof buildMultiAssignee==='function')?buildMultiAssignee('sheet-ma',s):'<div style="font-size:11px;color:var(--t3)">Assignment unavailable</div>'}
      <button class="btn btn-s" style="height:26px;font-size:11px;width:100%;margin-top:6px" onclick="shSaveAssign()">Save sharing</button>
    </div>
    <div class="sh-side-sec">
      <button class="btn btn-d" style="height:26px;font-size:11px;width:100%" onclick="shDeleteSheet(${Number(s.id)})" ${s._shared?'disabled title="Only the owner can delete"':''}>🗑 Delete sheet</button>
    </div>`;
}
function shSetIcon(ic){ if(!_sheetCurrent)return; _sheetCurrent.icon=ic; saveSheets(); renderSheetsSection(); }
function shSetColor(c){ if(!_sheetCurrent)return; _sheetCurrent.color=c; saveSheets(); renderSheetsSection(); }
function shSetDensity(v){ _sheetCurrent.theme=_sheetCurrent.theme||{}; _sheetCurrent.theme.density=v; saveSheets(); renderSheetsSection(); }
function shSetHeaderStyle(v){ _sheetCurrent.theme=_sheetCurrent.theme||{}; _sheetCurrent.theme.headerStyle=v; saveSheets(); renderSheetsSection(); }
function shToggleTheme(k){ const th=_sheetCurrent.theme=_sheetCurrent.theme||{}; if(k==='gridlines'){ th.gridlines=!(th.gridlines!==false); } else { th[k]=!th[k]; } saveSheets(); renderSheetsSection(); }
function shSaveAssign(){ if(!_sheetCurrent)return; let g=null; try{ if(typeof _maGet==='function')g=_maGet('sheet-ma'); }catch(_){}
  if(g){ _sheetCurrent.assignees=g.assignees||[]; _sheetCurrent.assigneeNames=g.assigneeNames||[]; _sheetCurrent.primaryAssigneeId=g.primaryAssigneeId||null;
    if(g.primaryAssigneeId!=null&&Array.isArray(g.assignees)){ const i=g.assignees.indexOf(g.primaryAssigneeId); _sheetCurrent.assignedTo=(i>=0&&g.assigneeNames)?g.assigneeNames[i]:(_sheetCurrent.assignedTo||''); } }
  saveSheets(); toast('👥 Sharing saved'); renderSheetsSection();
}

// ─── Undo / export / shared load ─────────────────────────────────────────────
function _shSnap(){ if(!_sheetCurrent)return; try{ _sheetUndo.push(JSON.stringify({columns:_sheetCurrent.columns,rows:_sheetCurrent.rows})); if(_sheetUndo.length>40)_sheetUndo.shift(); _sheetRedo=[]; }catch(_){} }
function shUndo(){ if(!_sheetCurrent||!_sheetUndo.length)return toast('Nothing to undo'); try{ _sheetRedo.push(JSON.stringify({columns:_sheetCurrent.columns,rows:_sheetCurrent.rows})); const s=JSON.parse(_sheetUndo.pop()); _sheetCurrent.columns=s.columns; _sheetCurrent.rows=s.rows; saveSheets(); renderSheetGrid(); }catch(_){} }
function shRedo(){ if(!_sheetCurrent||!_sheetRedo.length)return toast('Nothing to redo'); try{ _sheetUndo.push(JSON.stringify({columns:_sheetCurrent.columns,rows:_sheetCurrent.rows})); const s=JSON.parse(_sheetRedo.pop()); _sheetCurrent.columns=s.columns; _sheetCurrent.rows=s.rows; saveSheets(); renderSheetGrid(); }catch(_){} }
function shExportCSV(){ const s=_sheetCurrent; if(!s)return; const esc2=v=>{ v=(v==null?'':String(v)); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; };
  const head=s.columns.map(c=>esc2(c.name)).join(',');
  const lines=s.rows.map(r=>s.columns.map(c=>{ let v=(r.cells||{})[c.id]; if(typeof v==='string'&&v.charAt(0)==='=')v=_shEval(s,v,0); return esc2(v); }).join(','));
  const blob=new Blob([[head].concat(lines).join('\n')],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=(s.title||'sheet')+'.csv'; a.click(); URL.revokeObjectURL(a.href); toast('⬇ CSV exported');
}
async function _loadSharedSheets(){
  try{ if(typeof _trpc!=='function')return; _sharedSheetsLoaded=true;
    const res=await _trpc('appData.sharedSheetsForMe',undefined,'query');
    if(res&&res.ok&&Array.isArray(res.sheets)){ D._sharedSheets=res.sheets.map((p,i)=>Object.assign({},p,{_idx:i,_shared:true})); if(_notesModeIsSheets()&&!_sheetCurrent)renderSheetsSection(); }
  }catch(e){}
}

// ─── Reusable floating menu + colour picker ──────────────────────────────────
function _shPopMenu(ev,items,width){
  const old=document.getElementById('sh-popmenu'); if(old)old.remove();
  const m=document.createElement('div'); m.id='sh-popmenu'; m.className='sh-popmenu'; if(width)m.style.minWidth=width+'px';
  m.innerHTML=items.map((it,i)=>it.header?`<div style="padding:6px 8px 2px;cursor:default">${it.html||''}</div>`:`<div class="sh-popmenu-item" data-i="${i}">${it.html||esc(it.label||'')}</div>`).join('');
  document.body.appendChild(m);
  const cx=(ev&&ev.clientX)||200, cy=(ev&&ev.clientY)||160;
  const w=m.offsetWidth||200,h=m.offsetHeight||100;
  m.style.left=Math.max(8,Math.min(cx,window.innerWidth-w-8))+'px';
  m.style.top=Math.max(8,Math.min(cy,window.innerHeight-h-8))+'px';
  m.querySelectorAll('.sh-popmenu-item').forEach(el=>el.onclick=(e)=>{ e.stopPropagation(); const it=items[Number(el.dataset.i)]; m.remove(); if(it&&it.onClick)it.onClick(); });
  setTimeout(()=>document.addEventListener('click',function _c(){ const x=document.getElementById('sh-popmenu'); if(x)x.remove(); document.removeEventListener('click',_c); },{once:true}),30);
}
function _shColorMenu(ev,cb,allowNone){
  const items=SHEET_PALETTE.map(c=>({html:`<span class="sh-dot" style="background:${c}"></span><span style="font-size:11px;color:var(--t3)">${c}</span>`,onClick:()=>cb(c)}));
  items.unshift({html:'<span class="sh-dot" style="background:transparent;border:1px solid var(--bd2)"></span>None',onClick:()=>cb('')});
  _shPopMenu(ev,items);
}

// Wrap renderNotes so switching to/returning to the Notes screen re-applies the
// Notes⇄Sheets mode (and renders the sheets section) without editing app-part1.
if(typeof window!=='undefined'&&!window._notesSheetsWrapped&&typeof window.renderNotes==='function'){
  window._notesSheetsWrapped=true;
  const _origRenderNotes=window.renderNotes;
  window.renderNotes=function(){ const r=_origRenderNotes.apply(this,arguments); try{_applyNotesMode();}catch(_){} return r; };
}

/* ═════════════════════════════════════════════════════════════════════
   SLIDES / DECKS — PowerPoint-like presentations, a section inside Notes.
   Data: D.decks (blob array, migration 0048). Slides hold absolutely-
   positioned elements (text/shape/image/chart/table/kanban/bullets/metric/
   progress) in % coords; fonts use cqw so everything scales across the
   editor canvas, thumbnails and present mode. Team co-edit via
   appData.sharedDecksForMe / updateSharedDeck. Reuses _shPopMenu,
   SHEET_PALETTE, SHEET_ICONS, buildMultiAssignee from the Sheets module.
   ═════════════════════════════════════════════════════════════════════ */
let _deckCurrent=null, _deckSlide=0, _deckSelEl=null, _deckEditingText=null;
let _deckUndo=[], _deckRedo=[], _deckDrag=null;
let _sharedDecksLoaded=false, _deckSharedSyncTimer=null;
let _deckPresent=false, _deckPresentIdx=0;

function ensureDecks(){ if(!Array.isArray(D.decks))D.decks=[]; }
function _deckNextId(){ ensureDecks(); const all=D.decks.concat(Array.isArray(D._sharedDecks)?D._sharedDecks:[]); let mx=Date.now(); all.forEach(d=>{const n=Number(d.id); if(!isNaN(n)&&n>=mx)mx=n+1;}); return mx; }
function _dkNewElId(){ let mx=0; (_deckCurrent.slides||[]).forEach(s=>(s.elements||[]).forEach(e=>{ if(e.id>mx)mx=e.id; })); return mx+1; }
function _dkNewSlideId(){ let mx=0; (_deckCurrent.slides||[]).forEach(s=>{ if(s.id>mx)mx=s.id; }); return mx+1; }
function saveDecks(){ if(_deckCurrent)_deckCurrent.updatedAt=new Date().toISOString(); if(_deckCurrent&&_deckCurrent._shared){ _dkPushShared(_deckCurrent); } else { try{(window.save||save)('decks');}catch(_){ try{localStorage.setItem('lu_decks',JSON.stringify(D.decks));}catch(__){} } } }
function _dkPushShared(deck){ clearTimeout(_deckSharedSyncTimer); _deckSharedSyncTimer=setTimeout(async()=>{ try{ await _trpc('appData.updateSharedDeck',{ownerUserId:Number(deck._sharedFromUserId)||0,deckId:String(deck.id),patch:{title:deck.title,icon:deck.icon,color:deck.color,theme:deck.theme,slides:deck.slides,assignees:deck.assignees,assigneeNames:deck.assigneeNames,primaryAssigneeId:deck.primaryAssigneeId,assignedTo:deck.assignedTo}},'mutation'); }catch(e){ if(typeof toast==='function')toast({type:'error',title:'Shared deck not synced',msg:String(e&&e.message||e).slice(0,120)}); } },1500); }
function _dkSnap(){ if(!_deckCurrent)return; try{ _deckUndo.push(JSON.stringify(_deckCurrent.slides)); if(_deckUndo.length>50)_deckUndo.shift(); _deckRedo=[]; }catch(_){} }
function dkUndo(){ if(!_deckCurrent||!_deckUndo.length)return toast('Nothing to undo'); _deckRedo.push(JSON.stringify(_deckCurrent.slides)); _deckCurrent.slides=JSON.parse(_deckUndo.pop()); if(_deckSlide>=_deckCurrent.slides.length)_deckSlide=Math.max(0,_deckCurrent.slides.length-1); _deckSelEl=null; saveDecks(); renderDecksSection(); }
function dkRedo(){ if(!_deckCurrent||!_deckRedo.length)return toast('Nothing to redo'); _deckUndo.push(JSON.stringify(_deckCurrent.slides)); _deckCurrent.slides=JSON.parse(_deckRedo.pop()); _deckSelEl=null; saveDecks(); renderDecksSection(); }

// ─── Templates ───────────────────────────────────────────────────────────────
function _dkText(x,y,w,h,text,fontSize,extra){ return Object.assign({type:'text',x,y,w,h,text,fontSize:fontSize||20,bold:false,italic:false,align:'left',color:'#0f172a'},extra||{}); }
const DECK_TEMPLATES=[
  {key:'blank',name:'Blank deck',icon:'🖼',desc:'One empty slide',build:()=>({title:'Untitled deck',icon:'🖼',color:'#3b82f6',slides:[{bg:'',elements:[_dkText(8,8,84,14,'Click to add a title',34,{bold:true})]}]})},
  {key:'title',name:'Title slide',icon:'🎬',desc:'Title + subtitle',build:()=>({title:'Presentation',icon:'🎬',color:'#8b5cf6',slides:[{bg:'',elements:[
    Object.assign(_dkText(10,32,80,18,'Your Big Idea',46,{bold:true,align:'center'})),
    _dkText(10,52,80,10,'A short, punchy subtitle goes here',20,{align:'center',color:'#64748b'})]}]})},
  {key:'pitch',name:'Pitch deck',icon:'🚀',desc:'Raise capital: problem → model → financials → ask',build:()=>({title:'Pitch deck',icon:'🚀',color:'#3b82f6',slides:[
    {bg:'',elements:[_dkText(10,34,80,16,'Company Name',46,{bold:true,align:'center'}),_dkText(10,52,80,8,'One line on what you do',19,{align:'center',color:'#64748b'})]},
    {bg:'',elements:[_dkText(7,7,86,10,'The Problem',30,{bold:true}),{type:'bullets',x:8,y:24,w:84,h:62,title:'',items:['Customers struggle with X today','Existing tools are slow and costly','The pain is growing'],color:'#ef4444'}]},
    {bg:'',elements:[_dkText(7,7,86,10,'Our Solution',30,{bold:true}),{type:'bullets',x:8,y:24,w:50,h:62,title:'',items:['One-click workflow','10x faster','Built for teams'],color:'#10b981'},{type:'metric',x:62,y:28,w:30,h:24,value:'10x',label:'faster than status quo',color:'#10b981'}]},
    {bg:'',elements:[_dkText(7,7,86,10,'Market',30,{bold:true}),{type:'chart',x:8,y:22,w:84,h:64,chart:'bar',title:'TAM / SAM / SOM ($B)',labels:['TAM','SAM','SOM'],series:[{name:'Market',color:'#3b82f6',data:[50,12,3]}]}]},
    {bg:'',elements:[_dkText(7,7,86,10,'Business Model',30,{bold:true}),{type:'bullets',x:8,y:24,w:46,h:60,title:'',items:['SaaS subscription, billed annually','Three tiers: Starter / Pro / Enterprise','Expansion revenue from seats & add-ons'],color:'#3b82f6'},{type:'table',x:56,y:24,w:38,h:46,header:true,rows:[['Plan','Price/mo'],['Starter','$29'],['Pro','$99'],['Enterprise','Custom']]}]},
    {bg:'',elements:[_dkText(7,7,86,10,'Traction',30,{bold:true}),{type:'chart',x:8,y:22,w:84,h:64,chart:'line',title:'MRR growth',labels:['Q1','Q2','Q3','Q4'],series:[{name:'MRR',color:'#10b981',data:[8,14,26,41]}]}]},
    {bg:'',elements:[_dkText(7,7,86,10,'Financial Projections',30,{bold:true}),{type:'chart',x:8,y:20,w:60,h:66,chart:'bar',title:'Revenue ($M)',labels:['Y1','Y2','Y3'],series:[{name:'Revenue',color:'#3b82f6',data:[0.5,2,5]}]},{type:'metric',x:70,y:26,w:24,h:22,value:'$5M',label:'ARR by Year 3',color:'#10b981'},{type:'metric',x:70,y:54,w:24,h:22,value:'80%',label:'gross margin',color:'#3b82f6'}]},
    {bg:'',elements:[_dkText(10,34,80,16,'The Ask',42,{bold:true,align:'center'}),_dkText(10,52,80,8,'Raising $1.5M to reach $5M ARR',20,{align:'center',color:'#64748b'})]}
  ]})},
  {key:'project',name:'Project review',icon:'📋',desc:'Status board + timeline + KPIs',build:()=>({title:'Project review',icon:'📋',color:'#06b6d4',slides:[
    {bg:'',elements:[_dkText(10,36,80,14,'Project Review',40,{bold:true,align:'center'}),_dkText(10,52,80,8,'Weekly status update',18,{align:'center',color:'#64748b'})]},
    {bg:'',elements:[_dkText(7,6,86,10,'Status board',28,{bold:true}),{type:'kanban',x:6,y:20,w:88,h:70,columns:[{title:'To do',color:'#64748b',cards:['Spec API','Wireframes']},{title:'In progress',color:'#3b82f6',cards:['Auth flow']},{title:'Done',color:'#10b981',cards:['Kickoff','Research']}]}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Timeline',28,{bold:true}),{type:'table',x:6,y:20,w:88,h:60,header:true,rows:[['Milestone','Owner','Date','Status'],['Beta','Alex','Jul 15','On track'],['Launch','Sam','Aug 30','At risk']]}]},
    {bg:'',elements:[_dkText(7,6,86,10,'KPIs',28,{bold:true}),{type:'metric',x:8,y:24,w:24,h:26,value:'73%',label:'On-time delivery',color:'#10b981'},{type:'metric',x:38,y:24,w:24,h:26,value:'4',label:'Open risks',color:'#f59e0b'},{type:'progress',x:8,y:60,w:84,h:14,value:62,label:'Overall completion',color:'#3b82f6'}]}
  ]})},
  {key:'strategy',name:'Strategy / OKRs',icon:'🎯',desc:'Goals, roadmap & metrics',build:()=>({title:'Strategy',icon:'🎯',color:'#8b5cf6',slides:[
    {bg:'',elements:[_dkText(10,36,80,14,'2026 Strategy',40,{bold:true,align:'center'})]},
    {bg:'',elements:[_dkText(7,6,86,10,'Objectives',28,{bold:true}),{type:'bullets',x:8,y:22,w:84,h:64,title:'',items:['Grow activation to 45%','Reach $50k MRR','Ship mobile app'],color:'#8b5cf6'}]},
    {bg:'',elements:[_dkText(7,6,86,10,'KPIs',28,{bold:true}),{type:'chart',x:8,y:22,w:84,h:64,chart:'donut',title:'Effort by theme',labels:['Growth','Retention','Platform'],series:[{name:'Effort',color:'#8b5cf6',data:[40,35,25]}]}]}
  ]})},
  {key:'sales',name:'Sales deck',icon:'🏷',desc:'Win the deal: benefits, pricing, proof',build:()=>({title:'Sales deck',icon:'🏷',color:'#f59e0b',slides:[
    {bg:'',elements:[_dkText(10,34,80,16,'Product Name',44,{bold:true,align:'center'}),_dkText(10,52,80,8,'The fastest way to <achieve outcome>',19,{align:'center',color:'#64748b'})]},
    {bg:'',elements:[_dkText(7,6,86,10,'The challenge',28,{bold:true}),{type:'bullets',x:8,y:22,w:84,h:64,title:'',items:['Teams waste hours on manual work','Tools do not talk to each other','Mistakes cost time and money'],color:'#ef4444'}]},
    {bg:'',elements:[_dkText(7,6,86,10,'How we help',28,{bold:true}),{type:'bullets',x:8,y:22,w:50,h:64,title:'',items:['Automate the busywork','One source of truth','Set up in minutes'],color:'#10b981'},{type:'metric',x:62,y:24,w:30,h:22,value:'30%',label:'time saved',color:'#10b981'},{type:'metric',x:62,y:52,w:30,h:22,value:'2x',label:'faster delivery',color:'#f59e0b'}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Pricing',28,{bold:true}),{type:'table',x:10,y:22,w:80,h:50,header:true,rows:[['Plan','Price','Best for'],['Starter','$29/mo','Individuals'],['Pro','$99/mo','Growing teams'],['Enterprise','Custom','Large orgs']]}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Proof',28,{bold:true}),_dkText(8,22,84,16,'“This cut our reporting time in half and paid for itself in a month.”',20,{italic:true,color:'#334155'}),_dkText(8,42,84,6,'— Happy Customer, VP Operations',14,{color:'#64748b'}),{type:'metric',x:20,y:56,w:26,h:24,value:'4.9/5',label:'customer rating',color:'#f59e0b'},{type:'metric',x:54,y:56,w:26,h:24,value:'120+',label:'teams onboard',color:'#3b82f6'}]},
    {bg:'',elements:[_dkText(10,36,80,14,'Let’s get started',40,{bold:true,align:'center'}),_dkText(10,54,80,8,'Book a demo · hello@company.com',18,{align:'center',color:'#64748b'})]}
  ]})},
  {key:'company',name:'Company profile',icon:'🏢',desc:'Brand overview: mission, story, services',build:()=>({title:'Company profile',icon:'🏢',color:'#3b82f6',slides:[
    {bg:'',elements:[_dkText(10,34,80,16,'Company Name',46,{bold:true,align:'center'}),_dkText(10,52,80,8,'Tagline that captures the brand',19,{align:'center',color:'#64748b'})]},
    {bg:'',elements:[_dkText(7,6,86,10,'Who we are',28,{bold:true}),_dkText(8,24,84,40,'We are a team on a mission to <change>. Founded in <year>, we help <audience> achieve <outcome> through <approach>.',20,{color:'#334155'})]},
    {bg:'',elements:[_dkText(7,6,86,10,'Our journey',28,{bold:true}),{type:'table',x:8,y:22,w:84,h:48,header:true,rows:[['Year','Milestone'],['2021','Company founded'],['2023','Reached 1,000 customers'],['2025','Expanded internationally']]}]},
    {bg:'',elements:[_dkText(7,6,86,10,'What we do',28,{bold:true}),{type:'bullets',x:8,y:22,w:84,h:64,title:'',items:['Core service one','Core service two','Core service three'],color:'#3b82f6'}]},
    {bg:'',elements:[_dkText(7,6,86,10,'By the numbers',28,{bold:true}),{type:'metric',x:6,y:30,w:26,h:26,value:'1,200+',label:'customers',color:'#3b82f6'},{type:'metric',x:37,y:30,w:26,h:26,value:'40',label:'team members',color:'#10b981'},{type:'metric',x:68,y:30,w:26,h:26,value:'12',label:'countries',color:'#f59e0b'}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Our values',28,{bold:true}),{type:'bullets',x:8,y:22,w:84,h:64,title:'',items:['Customer obsession','Move with purpose','Better together'],color:'#8b5cf6'}]}
  ]})},
  {key:'marketing',name:'Marketing plan',icon:'📣',desc:'Goals, audience, channels & budget',build:()=>({title:'Marketing plan',icon:'📣',color:'#ec4899',slides:[
    {bg:'',elements:[_dkText(10,36,80,14,'Marketing Plan',42,{bold:true,align:'center'}),_dkText(10,54,80,8,'<Quarter / campaign> overview',18,{align:'center',color:'#64748b'})]},
    {bg:'',elements:[_dkText(7,6,86,10,'Goals & KPIs',28,{bold:true}),{type:'bullets',x:8,y:22,w:50,h:62,title:'',items:['Grow qualified leads by 40%','Lift brand awareness','Improve conversion rate'],color:'#ec4899'},{type:'metric',x:62,y:24,w:30,h:22,value:'40%',label:'lead growth target',color:'#ec4899'},{type:'metric',x:62,y:52,w:30,h:22,value:'3.5%',label:'target conversion',color:'#3b82f6'}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Target audience',28,{bold:true}),{type:'table',x:8,y:22,w:84,h:50,header:true,rows:[['Persona','Need','Channel'],['Founder','Save time','LinkedIn'],['Manager','Team visibility','Email'],['Analyst','Better data','Webinar']]}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Budget by channel',28,{bold:true}),{type:'chart',x:8,y:20,w:84,h:66,chart:'donut',title:'Spend mix',labels:['Paid search','Social','Content','Events'],series:[{name:'Spend',color:'#ec4899',data:[35,25,25,15]}]}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Campaign timeline',28,{bold:true}),{type:'table',x:8,y:22,w:84,h:50,header:true,rows:[['Phase','Timing','Owner'],['Launch','Month 1','Marketing'],['Nurture','Month 2','Lifecycle'],['Convert','Month 3','Sales']]}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Expected results',28,{bold:true}),{type:'chart',x:8,y:22,w:84,h:64,chart:'line',title:'Leads per month',labels:['M1','M2','M3','M4'],series:[{name:'Leads',color:'#ec4899',data:[120,180,260,340]}]}]}
  ]})},
  {key:'roadmap',name:'Product roadmap',icon:'🧭',desc:'Vision, now/next/later & milestones',build:()=>({title:'Product roadmap',icon:'🧭',color:'#06b6d4',slides:[
    {bg:'',elements:[_dkText(10,36,80,14,'Product Roadmap',42,{bold:true,align:'center'}),_dkText(10,54,80,8,'Where we are headed and why',18,{align:'center',color:'#64748b'})]},
    {bg:'',elements:[_dkText(7,6,86,10,'Vision',28,{bold:true}),_dkText(8,26,84,30,'In 12 months, <product> will be the default way teams <do the job>. We get there by focusing on <themes>.',22,{color:'#334155'})]},
    {bg:'',elements:[_dkText(7,6,86,10,'Now / Next / Later',28,{bold:true}),{type:'kanban',x:6,y:20,w:88,h:70,columns:[{title:'Now',color:'#06b6d4',cards:['Onboarding v2','Mobile beta']},{title:'Next',color:'#3b82f6',cards:['Integrations','Dashboards']},{title:'Later',color:'#8b5cf6',cards:['AI assist','Marketplace']}]}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Quarterly plan',28,{bold:true}),{type:'table',x:8,y:22,w:84,h:52,header:true,rows:[['Initiative','Quarter','Owner','Status'],['Onboarding v2','Q1','Product','On track'],['Integrations','Q2','Eng','Planned'],['AI assist','Q3','Eng','Idea']]}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Milestones',28,{bold:true}),{type:'progress',x:8,y:24,w:84,h:12,value:80,label:'Onboarding v2',color:'#06b6d4'},{type:'progress',x:8,y:44,w:84,h:12,value:45,label:'Integrations',color:'#3b82f6'},{type:'progress',x:8,y:64,w:84,h:12,value:15,label:'AI assist',color:'#8b5cf6'}]}
  ]})},
  {key:'portfolio',name:'Agency portfolio',icon:'🎨',desc:'Showcase work, case studies & team',build:()=>({title:'Agency portfolio',icon:'🎨',color:'#8b5cf6',slides:[
    {bg:'',elements:[_dkText(10,34,80,16,'Agency Name',46,{bold:true,align:'center'}),_dkText(10,52,80,8,'Creative that drives results',19,{align:'center',color:'#64748b'})]},
    {bg:'',elements:[_dkText(7,6,86,10,'About us',28,{bold:true}),_dkText(8,24,84,40,'We are a <type> agency helping brands <outcome>. Part strategy, part craft, all results.',22,{color:'#334155'})]},
    {bg:'',elements:[_dkText(7,6,86,10,'What we do',28,{bold:true}),{type:'bullets',x:8,y:22,w:84,h:64,title:'',items:['Brand strategy & identity','Campaign & content','Web & product design'],color:'#8b5cf6'}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Selected work',28,{bold:true}),{type:'table',x:8,y:22,w:84,h:52,header:true,rows:[['Client','Project','Result'],['Brand A','Rebrand','+38% recall'],['Brand B','Launch','2M reach'],['Brand C','Web redesign','+25% signups']]}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Case study',28,{bold:true}),_dkText(8,22,84,14,'We helped Brand A relaunch and grew brand recall by 38% in one quarter.',20,{color:'#334155'}),{type:'metric',x:20,y:48,w:26,h:24,value:'+38%',label:'brand recall',color:'#8b5cf6'},{type:'metric',x:54,y:48,w:26,h:24,value:'6 wks',label:'to launch',color:'#3b82f6'}]},
    {bg:'',elements:[_dkText(10,36,80,14,'Let’s create together',38,{bold:true,align:'center'}),_dkText(10,54,80,8,'hello@agency.com',18,{align:'center',color:'#64748b'})]}
  ]})},
  {key:'kickoff',name:'Project kickoff',icon:'🚀',desc:'Align on goals, scope, roles & timeline',build:()=>({title:'Project kickoff',icon:'🚀',color:'#10b981',slides:[
    {bg:'',elements:[_dkText(10,36,80,14,'Project Kickoff',42,{bold:true,align:'center'}),_dkText(10,54,80,8,'<Project name>',18,{align:'center',color:'#64748b'})]},
    {bg:'',elements:[_dkText(7,6,86,10,'Goals',28,{bold:true}),{type:'bullets',x:8,y:22,w:84,h:64,title:'',items:['What success looks like','Why this matters now','How we will measure it'],color:'#10b981'}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Scope & deliverables',28,{bold:true}),{type:'table',x:8,y:22,w:84,h:52,header:true,rows:[['Deliverable','Owner','Due'],['Discovery','Team A','Wk 2'],['Build','Team B','Wk 6'],['Launch','Team C','Wk 8']]}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Team & responsibilities',28,{bold:true}),{type:'table',x:8,y:22,w:84,h:52,header:true,rows:[['Name','Role','Responsible for'],['Alex','Lead','Delivery'],['Sam','Design','Experience'],['Jo','Eng','Build']]}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Timeline',28,{bold:true}),{type:'kanban',x:6,y:20,w:88,h:70,columns:[{title:'Weeks 1-2',color:'#64748b',cards:['Kickoff','Discovery']},{title:'Weeks 3-6',color:'#3b82f6',cards:['Design','Build']},{title:'Weeks 7-8',color:'#10b981',cards:['QA','Launch']}]}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Risks & next steps',28,{bold:true}),{type:'bullets',x:8,y:22,w:84,h:64,title:'',items:['Risk: scope creep — weekly review','Risk: dependency delays — flag early','Next: confirm owners and dates'],color:'#f59e0b'}]}
  ]})},
  {key:'exec',name:'Executive briefing',icon:'📈',desc:'Insights, performance & recommendations',build:()=>({title:'Executive briefing',icon:'📈',color:'#3b82f6',slides:[
    {bg:'',elements:[_dkText(10,36,80,14,'Executive Briefing',40,{bold:true,align:'center'}),_dkText(10,54,80,8,'<Period> · prepared for leadership',18,{align:'center',color:'#64748b'})]},
    {bg:'',elements:[_dkText(7,6,86,10,'Executive summary',28,{bold:true}),{type:'bullets',x:8,y:22,w:84,h:64,title:'',items:['Headline takeaway one','Headline takeaway two','Decision needed'],color:'#3b82f6'}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Performance',28,{bold:true}),{type:'metric',x:6,y:22,w:26,h:22,value:'$4.2M',label:'revenue',color:'#10b981'},{type:'metric',x:37,y:22,w:26,h:22,value:'+18%',label:'vs last period',color:'#3b82f6'},{type:'chart',x:6,y:48,w:88,h:44,chart:'bar',title:'Revenue by quarter ($M)',labels:['Q1','Q2','Q3','Q4'],series:[{name:'Revenue',color:'#3b82f6',data:[3.1,3.5,3.9,4.2]}]}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Market & competition',28,{bold:true}),{type:'table',x:8,y:22,w:84,h:50,header:true,rows:[['Player','Position','Trend'],['Us','Challenger','Up'],['Competitor A','Leader','Flat'],['Competitor B','Niche','Up']]}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Recommendations',28,{bold:true}),{type:'bullets',x:8,y:22,w:84,h:64,title:'',items:['Invest in <area>','Pause <initiative>','Decision: approve <budget>'],color:'#10b981'}]}
  ]})},
  {key:'onboarding',name:'Onboarding / training',icon:'🎓',desc:'Welcome new hires: agenda, tools, people',build:()=>({title:'Onboarding',icon:'🎓',color:'#10b981',slides:[
    {bg:'',elements:[_dkText(10,34,80,16,'Welcome to the team',42,{bold:true,align:'center'}),_dkText(10,52,80,8,'New hire onboarding',19,{align:'center',color:'#64748b'})]},
    {bg:'',elements:[_dkText(7,6,86,10,'Agenda',28,{bold:true}),{type:'bullets',x:8,y:22,w:84,h:64,title:'',items:['About the company','Your first week','Tools & systems','Who to ask for help'],color:'#10b981'}]},
    {bg:'',elements:[_dkText(7,6,86,10,'About the company',28,{bold:true}),_dkText(8,24,84,36,'Our mission is <mission>. We value <values> and work as <how we work>.',22,{color:'#334155'})]},
    {bg:'',elements:[_dkText(7,6,86,10,'Your first week',28,{bold:true}),{type:'table',x:8,y:22,w:84,h:52,header:true,rows:[['Day','Focus','Goal'],['Day 1','Setup & intros','Get access'],['Day 2-3','Shadowing','Learn the flow'],['Day 4-5','First task','Ship something small']]}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Tools & systems',28,{bold:true}),{type:'bullets',x:8,y:22,w:84,h:64,title:'',items:['Email & calendar','Project tracker','Docs & wiki','Chat & meetings'],color:'#3b82f6'}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Getting help',28,{bold:true}),{type:'bullets',x:8,y:22,w:84,h:64,title:'',items:['Your manager for priorities','Your buddy for day-to-day','IT for access issues'],color:'#8b5cf6'}]}
  ]})},
  {key:'instructional',name:'Instructional / how-to',icon:'📚',desc:'Teach a topic step by step',build:()=>({title:'How-to guide',icon:'📚',color:'#f59e0b',slides:[
    {bg:'',elements:[_dkText(10,36,80,14,'How to <do the thing>',40,{bold:true,align:'center'}),_dkText(10,54,80,8,'A step-by-step guide',18,{align:'center',color:'#64748b'})]},
    {bg:'',elements:[_dkText(7,6,86,10,'Learning objectives',28,{bold:true}),{type:'bullets',x:8,y:22,w:84,h:64,title:'',items:['Understand <concept>','Be able to <task>','Avoid common mistakes'],color:'#f59e0b'}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Overview',28,{bold:true}),_dkText(8,24,84,36,'Before we start: here is the big picture and why it matters.',22,{color:'#334155'})]},
    {bg:'',elements:[_dkText(7,6,86,10,'Step by step',28,{bold:true}),{type:'table',x:8,y:22,w:84,h:52,header:true,rows:[['Step','Action','Result'],['1','Do this first','You get X'],['2','Then do this','You get Y'],['3','Finally do this','Done']]}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Example',28,{bold:true}),{type:'image',x:8,y:22,w:84,h:60,src:'',fit:'contain'}]},
    {bg:'',elements:[_dkText(7,6,86,10,'Key takeaways',28,{bold:true}),{type:'bullets',x:8,y:22,w:84,h:64,title:'',items:['Remember <point one>','Remember <point two>','Practice <skill>'],color:'#10b981'}]}
  ]})},
  {key:'webinar',name:'Webinar',icon:'🎥',desc:'Engage a remote audience & build authority',build:()=>({title:'Webinar',icon:'🎥',color:'#ec4899',slides:[
    {bg:'',elements:[_dkText(10,32,80,18,'Webinar Title',44,{bold:true,align:'center'}),_dkText(10,52,80,8,'Presented by <Name>, <Title>',18,{align:'center',color:'#64748b'})]},
    {bg:'',elements:[_dkText(7,6,86,10,'Today’s agenda',28,{bold:true}),{type:'bullets',x:8,y:22,w:84,h:64,title:'',items:['The problem worth solving','3 key strategies','Live demo','Q&A'],color:'#ec4899'}]},
    {bg:'',elements:[_dkText(7,6,86,10,'About your host',28,{bold:true}),{type:'image',x:8,y:22,w:30,h:54,src:'',fit:'cover'},_dkText(42,24,52,40,'<Name> has spent <years> helping <audience> achieve <result>.',20,{color:'#334155'})]},
    {bg:'',elements:[_dkText(10,40,80,16,'Strategy 1',40,{bold:true,align:'center',color:'#ec4899'})]},
    {bg:'',elements:[_dkText(7,6,86,10,'Why it works',28,{bold:true}),{type:'chart',x:8,y:22,w:84,h:64,chart:'bar',title:'Results before vs after',labels:['Before','After'],series:[{name:'Outcome',color:'#ec4899',data:[30,75]}]}]},
    {bg:'',elements:[_dkText(10,38,80,14,'Questions?',42,{bold:true,align:'center'}),_dkText(10,56,80,8,'Drop them in the chat · grab the free guide',18,{align:'center',color:'#64748b'})]}
  ]})}
];
function _dkStampIds(deck){ let sid=1,eid=1; (deck.slides||[]).forEach(s=>{ s.id=sid++; (s.elements||[]).forEach(e=>{ e.id=eid++; }); }); return deck; }

// ─── Section render ──────────────────────────────────────────────────────────
function renderDecksSection(){
  const host=document.getElementById('notes-slides-section'); if(!host)return;
  ensureDecks();
  if(!_sharedDecksLoaded)_loadSharedDecks();
  if(_deckCurrent){ host.innerHTML=_dkEditorHtml(); return; }
  const own=D.decks.slice().sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  const shared=Array.isArray(D._sharedDecks)?D._sharedDecks:[];
  const totalSlides=D.decks.reduce((s,d)=>s+((d.slides||[]).length),0);
  host.innerHTML=`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <div>
        <div style="font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px">🖼 Slides</div>
        <div style="font-size:11px;color:var(--t2)">${D.decks.length} deck${D.decks.length===1?'':'s'}${totalSlides?` · ${totalSlides} slide${totalSlides===1?'':'s'}`:''} · build presentations with charts, tables, kanban & visuals</div>
      </div>
      <span style="flex:1"></span>
      <button class="btn btn-p" onclick="dkNewDeckMenu(event)">+ New deck</button>
    </div>
    ${own.length?`<div class="sh-gallery">${own.map(_dkCard).join('')}</div>`:`<div style="border:1px dashed var(--bd2);border-radius:12px;padding:34px;text-align:center;color:var(--t2)">
      <div style="font-size:34px;margin-bottom:8px">🖼</div>
      <div style="font-weight:600;margin-bottom:4px">No presentations yet</div>
      <div style="font-size:12px;margin-bottom:14px">Build slide decks with editable charts, tables, kanban boards and visuals — then present full-screen.</div>
      <button class="btn btn-p" onclick="dkNewDeckMenu(event)">+ New deck from template</button></div>`}
    ${shared.length?`<div style="margin-top:22px"><div style="font-size:12px;font-weight:700;color:var(--purp);display:flex;align-items:center;gap:6px;margin-bottom:8px">👥 Shared & delegated decks <span style="font-size:11px;color:var(--t3)">(${shared.length})</span></div><div class="sh-gallery">${shared.map((d,i)=>_dkSharedCard(d,i)).join('')}</div></div>`:''}
  `;
}
function _dkCard(d){
  const c=d.color||'#3b82f6'; const n=(d.slides||[]).length;
  const assignBadge=(Array.isArray(d.assignees)&&d.assignees.length)?`<span class="sh-card-badge" style="background:${c}22;color:${c}">👥 ${d.assignees.length}</span>`:'';
  return `<div class="sh-card" style="--c:${c}" onclick="dkOpen(${Number(d.id)})">
    <span class="sh-card-del" title="Delete deck" onclick="event.stopPropagation();dkDeleteDeck(${Number(d.id)})">🗑</span>
    <div class="sh-card-top"><span class="sh-card-ic">${esc(d.icon||'🖼')}</span><span class="sh-card-title">${esc(d.title||'Untitled')}</span></div>
    <div class="sh-card-meta">${n} slide${n===1?'':'s'} ${assignBadge}</div><div class="sh-card-bar"></div></div>`;
}
function _dkSharedCard(d,i){
  const c=d.color||'#8b5cf6'; const tag=d._delegated?`assigned to ${esc(d.assignedTo||'someone')}`:'shared with you';
  return `<div class="sh-card sh-card-shared" style="--c:${c}" onclick="dkOpenShared(${i})">
    <div class="sh-card-top"><span class="sh-card-ic">${esc(d.icon||'🖼')}</span><span class="sh-card-title">${esc(d.title||'Untitled')}</span></div>
    <div class="sh-card-meta">${(d.slides||[]).length} slides · ${d._delegated?'➡ ':'👥 '}${tag}</div><div class="sh-card-bar"></div></div>`;
}
const DECK_CATS={blank:'Start',title:'Start',pitch:'Business & Sales',sales:'Business & Sales',company:'Business & Sales',marketing:'Marketing & Strategy',roadmap:'Marketing & Strategy',portfolio:'Marketing & Strategy',strategy:'Marketing & Strategy',project:'Internal & Operational',kickoff:'Internal & Operational',exec:'Internal & Operational',onboarding:'Internal & Operational',instructional:'Educational & Informational',webinar:'Educational & Informational'};
function dkNewDeckMenu(ev){
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  const order=['Start','Business & Sales','Marketing & Strategy','Internal & Operational','Educational & Informational'];
  const items=[];
  order.forEach(cat=>{
    const inCat=DECK_TEMPLATES.filter(t=>(DECK_CATS[t.key]||'Start')===cat);
    if(!inCat.length)return;
    items.push({header:true,html:`<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--t3);letter-spacing:.5px">${esc(cat)}</div>`});
    inCat.forEach(t=>items.push({html:`<span style="font-size:15px;margin-right:8px">${t.icon}</span><span><div style="font-weight:600">${esc(t.name)}</div><div style="font-size:11px;color:var(--t3)">${esc(t.desc)}</div></span>`,onClick:()=>dkCreateFromTemplate(t.key)}));
  });
  _shPopMenu(ev||{clientX:200,clientY:160},items,280);
}
function dkCreateFromTemplate(key){
  ensureDecks();
  const tpl=DECK_TEMPLATES.find(t=>t.key===key)||DECK_TEMPLATES[0];
  const base=_dkStampIds(tpl.build());
  const deck=Object.assign(base,{ id:_deckNextId(),templateKey:key,
    theme:{bg:'#ffffff',accent:base.color||'#3b82f6'},
    assignees:[],assigneeNames:[],primaryAssigneeId:null,assignedTo:'',
    createdBy:(D.creds&&(D.creds.userName||D.creds.name))||'User',createdById:(D.creds&&D.creds.userId)||null,
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString() });
  D.decks.push(deck); saveDecks(); _deckUndo=[];_deckRedo=[]; _deckCurrent=deck; _deckSlide=0; _deckSelEl=null;
  renderDecksSection(); toast(`🖼 Created “${deck.title}”`);
}
function dkOpen(id){ ensureDecks(); const d=D.decks.find(x=>Number(x.id)===Number(id)); if(!d)return toast('Deck not found'); _deckCurrent=d; _deckSlide=0; _deckSelEl=null; _deckUndo=[];_deckRedo=[]; renderDecksSection(); }
async function dkOpenShared(i){ let d=(D._sharedDecks||[])[i]; if(!d){ await _loadSharedDecks(); d=(D._sharedDecks||[])[i]; } if(!d)return toast('Shared deck unavailable'); _deckCurrent=d; _deckSlide=0; _deckSelEl=null; _deckUndo=[];_deckRedo=[]; renderDecksSection(); }
function dkClose(){ _deckCurrent=null; _deckSelEl=null; renderDecksSection(); }
function dkDeleteDeck(id){ if(!confirm('Delete this deck? This cannot be undone.'))return; ensureDecks(); D.decks=D.decks.filter(x=>Number(x.id)!==Number(id)); if(_deckCurrent&&Number(_deckCurrent.id)===Number(id))_deckCurrent=null; (window.save||save)('decks'); renderDecksSection(); toast('🗑 Deck deleted'); }
async function _loadSharedDecks(){ try{ if(typeof _trpc!=='function')return; _sharedDecksLoaded=true; const res=await _trpc('appData.sharedDecksForMe',undefined,'query'); if(res&&res.ok&&Array.isArray(res.decks)){ D._sharedDecks=res.decks.map((p,i)=>Object.assign({},p,{_idx:i,_shared:true})); if(_notesModeIsSlides()&&!_deckCurrent)renderDecksSection(); } }catch(e){} }

// ─── Editor shell ────────────────────────────────────────────────────────────
function _dkSlide(){ return _deckCurrent&&_deckCurrent.slides[_deckSlide]; }
function _dkEl(id){ const s=_dkSlide(); return s&&(s.elements||[]).find(e=>e.id===id); }
function _dkBg(slide){ return (slide&&slide.bg)|| (_deckCurrent.theme&&_deckCurrent.theme.bg)||'#ffffff'; }
function _dkEditorHtml(){
  const d=_deckCurrent; const shared=d._shared?`<span class="sh-shared-tag">${d._delegated?'➡ delegated':'👥 shared'}</span>`:'';
  return `<div class="dk-editor">
    <div class="dk-toolbar">
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="dkClose()">← Decks</button>
      <span style="font-size:18px">${esc(d.icon||'🖼')}</span>
      <input class="dk-ed-title" value="${esc(d.title||'')}" onchange="dkSetTitle(this.value)" placeholder="Untitled deck">
      ${shared}
      <span style="flex:1"></span>
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="dkUndo()" title="Undo">↶</button>
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="dkRedo()" title="Redo">↷</button>
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="dkAddSlide()">+ Slide</button>
      <button class="btn btn-p" style="height:28px;font-size:11px" onclick="dkPresent()" title="Present full-screen">▶ Present</button>
    </div>
    <div class="dk-body">
      <div class="dk-slidelist" id="dk-slidelist">${_dkThumbsHtml()}</div>
      <div class="dk-stage-wrap"><div class="dk-canvas" id="dk-canvas" style="background:${_dkBg(_dkSlide())}" onmousedown="dkCanvasDown(event)">${_dkCanvasInner()}</div></div>
      <aside class="dk-props" id="dk-props">${_dkPropsHtml()}</aside>
    </div>
  </div>`;
}
function dkSetTitle(v){ if(!_deckCurrent)return; _deckCurrent.title=(v||'').trim()||'Untitled deck'; saveDecks(); }
function renderDeckCanvas(){ const c=document.getElementById('dk-canvas'); if(c){ c.style.background=_dkBg(_dkSlide()); c.innerHTML=_dkCanvasInner(); } }
function renderDeckProps(){ const p=document.getElementById('dk-props'); if(p)p.innerHTML=_dkPropsHtml(); }
function renderDeckThumbs(){ const l=document.getElementById('dk-slidelist'); if(l)l.innerHTML=_dkThumbsHtml(); }

// ─── Thumbnails ──────────────────────────────────────────────────────────────
function _dkThumbsHtml(){
  return (_deckCurrent.slides||[]).map((s,i)=>`<div class="dk-thumb ${i===_deckSlide?'on':''}" style="background:${_dkBg(s)}" onclick="dkGotoSlide(${i})" oncontextmenu="dkSlideMenu(event,${i})" title="Slide ${i+1} — right-click for options"><span class="dk-thumb-n">${i+1}</span>${(s.elements||[]).map(e=>_dkElHtml(e,false,false)).join('')}</div>`).join('')
    +`<div class="dk-thumb-add" onclick="dkAddSlide()" title="Add slide">＋</div>`;
}
function dkGotoSlide(i){ _deckSlide=Math.max(0,Math.min(_deckCurrent.slides.length-1,i)); _deckSelEl=null; _deckEditingText=null; renderDecksSection(); }
function dkAddSlide(){ if(!_deckCurrent)return; _dkSnap(); _deckCurrent.slides.splice(_deckSlide+1,0,{id:_dkNewSlideId(),bg:'',elements:[]}); _deckSlide++; _deckSelEl=null; saveDecks(); renderDecksSection(); }
function dkSlideMenu(e,i){ e.preventDefault(); e.stopPropagation(); _shPopMenu(e,[
  {html:'⧉ Duplicate slide',onClick:()=>{ _dkSnap(); const cp=JSON.parse(JSON.stringify(_deckCurrent.slides[i])); cp.id=_dkNewSlideId(); let eid=_dkNewElId(); (cp.elements||[]).forEach(el=>el.id=eid++); _deckCurrent.slides.splice(i+1,0,cp); _deckSlide=i+1; saveDecks(); renderDecksSection(); }},
  {html:'⬆ Move up',onClick:()=>{ if(i<=0)return; _dkSnap(); const s=_deckCurrent.slides.splice(i,1)[0]; _deckCurrent.slides.splice(i-1,0,s); _deckSlide=i-1; saveDecks(); renderDecksSection(); }},
  {html:'⬇ Move down',onClick:()=>{ if(i>=_deckCurrent.slides.length-1)return; _dkSnap(); const s=_deckCurrent.slides.splice(i,1)[0]; _deckCurrent.slides.splice(i+1,0,s); _deckSlide=i+1; saveDecks(); renderDecksSection(); }},
  {html:'<span style="color:var(--red)">🗑 Delete slide</span>',onClick:()=>dkDeleteSlide(i)}
]); }
function dkDeleteSlide(i){ if(_deckCurrent.slides.length<=1)return toast('A deck needs at least one slide'); _dkSnap(); _deckCurrent.slides.splice(i,1); _deckSlide=Math.max(0,Math.min(_deckSlide,_deckCurrent.slides.length-1)); _deckSelEl=null; saveDecks(); renderDecksSection(); }

// ─── Canvas + element rendering ──────────────────────────────────────────────
function _dkCanvasInner(){ const s=_dkSlide(); if(!s)return ''; return (s.elements||[]).map(e=>_dkElHtml(e,true,_deckEditingText===e.id)).join(''); }
function _dkElInner(el,editing){
  const ce=editing?'contenteditable="true"':'';
  switch(el.type){
    case 'text': return `<div class="dk-el-text" style="font-size:${(el.fontSize||20)/9.6}cqw;font-weight:${el.bold?700:400};font-style:${el.italic?'italic':'normal'};text-align:${el.align||'left'};color:${el.color||'#0f172a'};white-space:pre-wrap;pointer-events:${editing?'auto':'none'}" ${ce} ${editing?`onblur="dkTextCommit(${el.id},this)" onmousedown="event.stopPropagation()"`:''}>${esc(el.text||'')}</div>`;
    case 'shape':{ const sh=el.shape||'rect'; if(sh==='line')return `<div style="width:100%;height:100%;display:flex;align-items:center"><div style="width:100%;height:${el.stroke||3}px;background:${el.fill||'#3b82f6'}"></div></div>`; return `<div style="width:100%;height:100%;background:${el.fill||'#3b82f6'};border-radius:${sh==='ellipse'?'50%':(el.radius||6)+'px'};${el.stroke2?`border:2px solid ${el.stroke2}`:''}"></div>`; }
    case 'image': return el.src?`<img src="${esc(el.src)}" style="width:100%;height:100%;object-fit:${el.fit||'contain'};pointer-events:none" alt="">`:`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f1f5f9;color:#94a3b8;font-size:1.6cqw">no image</div>`;
    case 'chart': return _dkChartSVG(el);
    case 'metric': return `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center"><div style="font-size:${(el.size||52)/9.6}cqw;font-weight:800;color:${el.color||'#3b82f6'};line-height:1">${esc(el.value||'')}</div><div style="font-size:1.7cqw;color:#64748b;margin-top:0.4cqw">${esc(el.label||'')}</div></div>`;
    case 'progress':{ const p=Math.max(0,Math.min(100,Number(el.value)||0)); return `<div style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;gap:0.6cqw"><div style="display:flex;justify-content:space-between;font-size:1.6cqw;color:#475569"><span>${esc(el.label||'')}</span><span style="font-weight:700;color:${el.color||'#3b82f6'}">${p}%</span></div><div style="height:1.6cqw;background:#e2e8f0;border-radius:20px;overflow:hidden"><div style="width:${p}%;height:100%;background:${el.color||'#3b82f6'};border-radius:20px"></div></div></div>`; }
    case 'bullets':{ const items=(el.items||[]).map(it=>`<li style="margin-bottom:0.8cqw">${esc(it)}</li>`).join(''); return `<div style="width:100%;height:100%;padding:0.5cqw">${el.title?`<div style="font-size:2.4cqw;font-weight:700;color:#0f172a;margin-bottom:1cqw">${esc(el.title)}</div>`:''}<ul style="font-size:2cqw;color:#1e293b;padding-left:3cqw;margin:0;list-style:disc;--mk:${el.color||'#3b82f6'}">${items}</ul></div>`; }
    case 'table': return _dkTableHtml(el,editing);
    case 'kanban': return _dkKanbanHtml(el,editing);
    default: return '';
  }
}
function _dkElHtml(el,interactive,editing){
  const sel=interactive&&_deckSelEl===el.id;
  const handles=sel?`<div class="dk-el-resize" onmousedown="dkElMouseDown(event,${el.id},'resize')"></div><div class="dk-el-del" onmousedown="event.stopPropagation()" onclick="dkDeleteEl(event,${el.id})" title="Delete">×</div>`:'';
  const ev=interactive?`onmousedown="dkElMouseDown(event,${el.id},'move')" onclick="dkSelectEl(event,${el.id})" ondblclick="dkEditEl(event,${el.id})"`:'';
  return `<div class="dk-el ${sel?'sel':''}" data-id="${el.id}" style="left:${el.x}%;top:${el.y}%;width:${el.w}%;height:${el.h}%;cursor:${interactive?(editing?'default':'move'):'default'}" ${ev}>${_dkElInner(el,editing)}${handles}</div>`;
}
function _dkTableHtml(el,editing){
  const rows=el.rows||[[ '' ]]; const hdr=el.header!==false;
  let html='<table class="dk-tbl">';
  rows.forEach((row,ri)=>{ html+='<tr>'; row.forEach((cell,ci)=>{ const tag=(hdr&&ri===0)?'th':'td'; const ce=editing?`contenteditable="true" onmousedown="event.stopPropagation()" onblur="dkTblCommit(${el.id},${ri},${ci},this)"`:''; html+=`<${tag} style="font-size:1.7cqw" ${ce}>${esc(cell==null?'':String(cell))}</${tag}>`; }); html+='</tr>'; });
  html+='</table>'; return html;
}
function _dkKanbanHtml(el,editing){
  const cols=el.columns||[];
  return `<div class="dk-kanban">${cols.map((col,ci)=>`<div class="dk-kan-col"><div class="dk-kan-h" style="color:${col.color||'#475569'}"><span style="width:1.4cqw;height:1.4cqw;border-radius:50%;background:${col.color||'#94a3b8'};display:inline-block"></span>${esc(col.title||'')}</div>${(col.cards||[]).map((c,di)=>`<div class="dk-kan-card" ${editing?`contenteditable="true" onmousedown="event.stopPropagation()" onblur="dkKanCommit(${el.id},${ci},${di},this)"`:''}>${esc(c)}</div>`).join('')}${editing?`<div class="dk-kan-add" onmousedown="event.stopPropagation()" onclick="dkKanAddCard(${el.id},${ci})">＋ card</div>`:''}</div>`).join('')}</div>`;
}

// ─── Element interactions ────────────────────────────────────────────────────
function dkCanvasDown(e){ if(e.target.id==='dk-canvas'){ _deckSelEl=null; _deckEditingText=null; renderDeckCanvas(); renderDeckProps(); } }
function dkSelectEl(e,id){ if(e&&e.stopPropagation)e.stopPropagation(); if(_deckEditingText&&_deckEditingText!==id)_deckEditingText=null; if(_deckSelEl!==id){ _deckSelEl=id; renderDeckCanvas(); renderDeckProps(); } }
function dkEditEl(e,id){ if(e)e.stopPropagation(); const el=_dkEl(id); if(!el)return; if(['shape','image','chart','metric','progress'].includes(el.type)){ dkSelectEl(e,id); return; } _deckSelEl=id; _deckEditingText=id; renderDeckCanvas(); setTimeout(()=>{ const node=document.querySelector('.dk-el[data-id="'+id+'"] [contenteditable]'); if(node){ node.focus(); try{const r=document.createRange();r.selectNodeContents(node);const s=getSelection();s.removeAllRanges();s.addRange(r);}catch(_){} } },20); }
function dkDeleteEl(e,id){ if(e)e.stopPropagation(); const s=_dkSlide(); if(!s)return; _dkSnap(); s.elements=(s.elements||[]).filter(x=>x.id!==id); if(_deckSelEl===id)_deckSelEl=null; _deckEditingText=null; saveDecks(); renderDeckCanvas(); renderDeckProps(); renderDeckThumbs(); }
function dkTextCommit(id,node){ const el=_dkEl(id); if(!el)return; const v=node.innerText.replace(/ /g,' '); if((el.text||'')!==v){ _dkSnap(); el.text=v; saveDecks(); renderDeckThumbs(); } _deckEditingText=null; }
function dkTblCommit(id,ri,ci,node){ const el=_dkEl(id); if(!el||!el.rows[ri])return; const v=node.innerText.trim(); if(String(el.rows[ri][ci]==null?'':el.rows[ri][ci])!==v){ _dkSnap(); el.rows[ri][ci]=v; saveDecks(); renderDeckThumbs(); } }
function dkKanCommit(id,ci,di,node){ const el=_dkEl(id); if(!el||!el.columns[ci])return; const v=node.innerText.trim(); if(!v){ el.columns[ci].cards.splice(di,1); _dkSnap(); saveDecks(); renderDeckCanvas(); renderDeckThumbs(); return; } if(el.columns[ci].cards[di]!==v){ _dkSnap(); el.columns[ci].cards[di]=v; saveDecks(); renderDeckThumbs(); } }
function dkKanAddCard(id,ci){ const el=_dkEl(id); if(!el||!el.columns[ci])return; _dkSnap(); el.columns[ci].cards=el.columns[ci].cards||[]; el.columns[ci].cards.push('New card'); saveDecks(); renderDeckCanvas(); renderDeckThumbs(); }
function dkElMouseDown(e,id,mode){ if(_deckEditingText===id)return; e.stopPropagation(); const el=_dkEl(id); if(!el)return; if(_deckEditingText&&_deckEditingText!==id)_deckEditingText=null; if(_deckSelEl!==id){ _deckSelEl=id; renderDeckCanvas(); renderDeckProps(); } const canvas=document.getElementById('dk-canvas'); if(!canvas)return; const rect=canvas.getBoundingClientRect(); _deckDrag={id,mode,rect,sx:e.clientX,sy:e.clientY,ox:el.x,oy:el.y,ow:el.w,oh:el.h,moved:false,snap:JSON.stringify(_deckCurrent.slides)}; document.addEventListener('mousemove',_dkDragMove); document.addEventListener('mouseup',_dkDragEnd); }
function _dkDragMove(e){ if(!_deckDrag)return; const d=_deckDrag; const el=_dkEl(d.id); if(!el)return; const dxp=(e.clientX-d.sx)/d.rect.width*100, dyp=(e.clientY-d.sy)/d.rect.height*100; if(Math.abs(e.clientX-d.sx)+Math.abs(e.clientY-d.sy)>2)d.moved=true; if(d.mode==='move'){ el.x=Math.max(0,Math.min(100-el.w,d.ox+dxp)); el.y=Math.max(0,Math.min(100-el.h,d.oy+dyp)); } else { el.w=Math.max(4,Math.min(100-el.x,d.ow+dxp)); el.h=Math.max(4,Math.min(100-el.y,d.oh+dyp)); } const node=document.querySelector('.dk-el[data-id="'+d.id+'"]'); if(node){ node.style.left=el.x+'%';node.style.top=el.y+'%';node.style.width=el.w+'%';node.style.height=el.h+'%'; } }
function _dkDragEnd(){ document.removeEventListener('mousemove',_dkDragMove); document.removeEventListener('mouseup',_dkDragEnd); if(_deckDrag&&_deckDrag.moved){ _deckUndo.push(_deckDrag.snap); if(_deckUndo.length>50)_deckUndo.shift(); _deckRedo=[]; saveDecks(); renderDeckThumbs(); renderDeckProps(); } _deckDrag=null; }

// ─── Add elements ────────────────────────────────────────────────────────────
function dkAddElement(type){
  const s=_dkSlide(); if(!s)return; _dkSnap(); s.elements=s.elements||[];
  const id=_dkNewElId(); let el;
  switch(type){
    case 'title': el=_dkText(8,8,84,14,'Title',34,{bold:true}); break;
    case 'text': el=_dkText(10,40,50,12,'Add your text',18); break;
    case 'bullets': el={type:'bullets',x:10,y:24,w:60,h:50,title:'',items:['First point','Second point','Third point'],color:s&&_deckCurrent.theme?_deckCurrent.theme.accent:'#3b82f6'}; break;
    case 'chart': el={type:'chart',x:14,y:20,w:60,h:55,chart:'bar',title:'Chart',labels:['A','B','C','D'],series:[{name:'Series 1',color:_deckCurrent.theme.accent||'#3b82f6',data:[4,7,3,6]}]}; break;
    case 'table': el={type:'table',x:12,y:24,w:70,h:40,header:true,rows:[['Column 1','Column 2','Column 3'],['','',''],['','','']]}; break;
    case 'kanban': el={type:'kanban',x:6,y:24,w:88,h:60,columns:[{title:'To do',color:'#64748b',cards:['Card']},{title:'Doing',color:'#3b82f6',cards:[]},{title:'Done',color:'#10b981',cards:[]}]}; break;
    case 'metric': el={type:'metric',x:20,y:30,w:24,h:24,value:'42%',label:'Metric label',color:_deckCurrent.theme.accent||'#3b82f6'}; break;
    case 'progress': el={type:'progress',x:14,y:44,w:60,h:12,value:60,label:'Progress',color:_deckCurrent.theme.accent||'#3b82f6'}; break;
    case 'shape': el={type:'shape',x:30,y:30,w:24,h:24,shape:'rect',fill:_deckCurrent.theme.accent||'#3b82f6',radius:8}; break;
    case 'image':{ const url=prompt('Image URL (https://…):'); if(!url)return; el={type:'image',x:20,y:20,w:40,h:40,src:url.trim(),fit:'contain'}; break; }
    default: return;
  }
  el.id=id; s.elements.push(el); _deckSelEl=id; saveDecks(); renderDeckCanvas(); renderDeckProps(); renderDeckThumbs();
}

// ─── Properties panel ────────────────────────────────────────────────────────
function _dkPropsHtml(){
  const insert=`<div class="dk-props-h">Insert</div><div class="dk-addgrid">
    ${[['title','🅣','Title'],['text','📝','Text'],['bullets','•','Bullets'],['chart','📊','Chart'],['table','▦','Table'],['kanban','🗂','Kanban'],['metric','①','Metric'],['progress','▬','Progress'],['shape','⬛','Shape'],['image','🖼','Image']].map(a=>`<div class="dk-add-b" onclick="dkAddElement('${a[0]}')"><span>${a[1]}</span>${a[2]}</div>`).join('')}
  </div>`;
  const el=_deckSelEl?_dkEl(_deckSelEl):null;
  let body;
  if(el){ body=`<div style="margin-top:14px;border-top:1px solid var(--bd1);padding-top:12px">${_dkElPropsHtml(el)}</div>`; }
  else { const d=_deckCurrent; const th=d.theme||{};
    body=`<div style="margin-top:14px;border-top:1px solid var(--bd1);padding-top:12px">
      <div class="dk-props-h">Slide background</div>
      <div class="dk-color-grid"><div class="dk-color-sw ${!_dkSlide().bg?'on':''}" style="background:#ffffff;border:1px solid var(--bd2)" onclick="dkSetSlideBg('')"></div>${['#0f172a','#1e293b','#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#f1f5f9'].map(c=>`<div class="dk-color-sw ${_dkSlide().bg===c?'on':''}" style="background:${c}" onclick="dkSetSlideBg('${c}')"></div>`).join('')}</div>
      <div class="dk-props-h" style="margin-top:14px">Deck accent</div>
      <div class="dk-color-grid">${SHEET_PALETTE.map(c=>`<div class="dk-color-sw ${d.color===c?'on':''}" style="background:${c}" onclick="dkSetDeckColor('${c}')"></div>`).join('')}</div>
      <div class="dk-props-h" style="margin-top:14px">Deck icon</div>
      <div style="display:flex;flex-wrap:wrap;gap:3px">${SHEET_ICONS.map(ic=>`<div class="dk-add-b" style="padding:4px;min-width:26px" onclick="dkSetIcon('${ic}')">${ic}</div>`).join('')}</div>
      <div class="dk-props-h" style="margin-top:14px">👥 Share with team</div>
      <div style="font-size:11px;color:var(--t3);margin-bottom:6px">Assigned members can open & co-edit this deck.</div>
      ${(typeof buildMultiAssignee==='function')?buildMultiAssignee('deck-ma',d):''}
      <button class="btn btn-s" style="height:26px;font-size:11px;width:100%;margin-top:6px" onclick="dkSaveAssign()">Save sharing</button>
      <button class="btn btn-d" style="height:26px;font-size:11px;width:100%;margin-top:10px" onclick="dkDeleteDeck(${Number(d.id)})" ${d._shared?'disabled':''}>🗑 Delete deck</button>
    </div>`;
  }
  return insert+body;
}
function _dkElPropsHtml(el){
  const row=(label,inner)=>`<div class="dk-prop-row"><label>${label}</label>${inner}</div>`;
  const colorSwatches=(key,cur,extra)=>`<div class="dk-color-grid">${(extra||[]).concat(SHEET_PALETTE).map(c=>`<div class="dk-color-sw ${cur===c?'on':''}" style="background:${c}${c==='#ffffff'?';border:1px solid var(--bd2)':''}" onclick="dkSetProp(${el.id},'${key}','${c}')"></div>`).join('')}</div>`;
  let specific='';
  if(el.type==='text'){
    specific=row('Font size',`<input type="number" value="${el.fontSize||20}" min="8" max="120" onchange="dkSetProp(${el.id},'fontSize',Number(this.value))">`)
      +`<div class="dk-prop-row" style="display:flex;gap:5px"><button class="btn btn-s" style="flex:1;height:26px;${el.bold?'background:var(--ac);color:#fff':''}" onclick="dkToggleProp(${el.id},'bold')"><b>B</b></button><button class="btn btn-s" style="flex:1;height:26px;${el.italic?'background:var(--ac);color:#fff':''}" onclick="dkToggleProp(${el.id},'italic')"><i>I</i></button>${['left','center','right'].map(a=>`<button class="btn btn-s" style="flex:1;height:26px;${(el.align||'left')===a?'background:var(--ac);color:#fff':''}" onclick="dkSetProp(${el.id},'align','${a}')">${a==='left'?'⯇':a==='center'?'≡':'⯈'}</button>`).join('')}</div>`
      +row('Colour',colorSwatches('color',el.color,['#0f172a','#ffffff']));
  } else if(el.type==='shape'){
    specific=row('Shape',`<select onchange="dkSetProp(${el.id},'shape',this.value)">${['rect','ellipse','line'].map(s=>`<option ${el.shape===s?'selected':''}>${s}</option>`).join('')}</select>`)+row('Fill',colorSwatches('fill',el.fill));
  } else if(el.type==='image'){
    specific=row('Image URL',`<input type="text" value="${esc(el.src||'')}" onchange="dkSetProp(${el.id},'src',this.value)">`)+row('Fit',`<select onchange="dkSetProp(${el.id},'fit',this.value)"><option ${el.fit==='contain'?'selected':''}>contain</option><option ${el.fit==='cover'?'selected':''}>cover</option></select>`);
  } else if(el.type==='metric'){
    specific=row('Value',`<input type="text" value="${esc(el.value||'')}" onchange="dkSetProp(${el.id},'value',this.value)">`)+row('Label',`<input type="text" value="${esc(el.label||'')}" onchange="dkSetProp(${el.id},'label',this.value)">`)+row('Colour',colorSwatches('color',el.color));
  } else if(el.type==='progress'){
    specific=row('Percent',`<input type="number" min="0" max="100" value="${Number(el.value)||0}" onchange="dkSetProp(${el.id},'value',Math.max(0,Math.min(100,Number(this.value))))">`)+row('Label',`<input type="text" value="${esc(el.label||'')}" onchange="dkSetProp(${el.id},'label',this.value)">`)+row('Colour',colorSwatches('color',el.color));
  } else if(el.type==='bullets'){
    specific=row('Title (optional)',`<input type="text" value="${esc(el.title||'')}" onchange="dkSetProp(${el.id},'title',this.value)">`)+row('Items (one per line)',`<textarea rows="5" onchange="dkSetBullets(${el.id},this.value)">${esc((el.items||[]).join('\n'))}</textarea>`);
  } else if(el.type==='chart'){
    specific=row('Type',`<select onchange="dkSetProp(${el.id},'chart',this.value)">${['bar','line','area','pie','donut'].map(c=>`<option ${el.chart===c?'selected':''}>${c}</option>`).join('')}</select>`)
      +row('Title',`<input type="text" value="${esc(el.title||'')}" onchange="dkSetProp(${el.id},'title',this.value)">`)
      +`<div class="dk-props-h" style="margin-top:6px">Data</div>${_dkChartDataHtml(el)}`;
  } else if(el.type==='table'){
    specific=`<div style="display:flex;gap:5px;flex-wrap:wrap"><button class="btn btn-s" style="height:26px;font-size:11px;flex:1" onclick="dkTblAdd(${el.id},'row')">+ Row</button><button class="btn btn-s" style="height:26px;font-size:11px;flex:1" onclick="dkTblAdd(${el.id},'col')">+ Col</button></div><div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px"><button class="btn btn-s" style="height:26px;font-size:11px;flex:1" onclick="dkTblDel(${el.id},'row')">− Row</button><button class="btn btn-s" style="height:26px;font-size:11px;flex:1" onclick="dkTblDel(${el.id},'col')">− Col</button></div><div style="font-size:11px;color:var(--t3);margin-top:6px">Double-click the table to edit cells.</div>`;
  } else if(el.type==='kanban'){
    specific=`<button class="btn btn-s" style="height:26px;font-size:11px;width:100%" onclick="dkKanAddCol(${el.id})">+ Column</button><button class="btn btn-s" style="height:26px;font-size:11px;width:100%;margin-top:5px" onclick="dkKanDelCol(${el.id})">− Last column</button><div style="font-size:11px;color:var(--t3);margin-top:6px">Double-click the board to add/edit cards.</div>`;
  }
  return `<div class="dk-props-h">${el.type} element</div>${specific}
    <div class="dk-prop-row" style="display:flex;gap:5px;margin-top:8px">
      <button class="btn btn-s" style="flex:1;height:26px;font-size:11px" onclick="dkZOrder(${el.id},1)" title="Bring forward">⬆ Front</button>
      <button class="btn btn-s" style="flex:1;height:26px;font-size:11px" onclick="dkZOrder(${el.id},-1)" title="Send back">⬇ Back</button>
      <button class="btn btn-s" style="flex:1;height:26px;font-size:11px" onclick="dkDupEl(${el.id})">⧉</button>
    </div>
    <button class="btn btn-d" style="height:26px;font-size:11px;width:100%" onclick="dkDeleteEl(null,${el.id})">🗑 Delete element</button>`;
}
function _dkChartDataHtml(el){
  const labels=el.labels||[]; const series=el.series||[];
  let html='<table style="width:100%;font-size:11px;border-collapse:collapse"><tr><th style="text-align:left">Label</th>'+series.map((s,si)=>`<th style="color:${s.color}">S${si+1}</th>`).join('')+'</tr>';
  labels.forEach((l,i)=>{ html+=`<tr><td><input type="text" value="${esc(l)}" style="width:100%;font-size:11px;padding:2px 4px;background:var(--s1);border:1px solid var(--bd2);border-radius:4px;color:var(--t1)" onchange="dkChartLabel(${el.id},${i},this.value)"></td>`+series.map((s,si)=>`<td><input type="number" value="${Number((s.data||[])[i])||0}" style="width:46px;font-size:11px;padding:2px 4px;background:var(--s1);border:1px solid var(--bd2);border-radius:4px;color:var(--t1)" onchange="dkChartVal(${el.id},${si},${i},this.value)"></td>`).join('')+'</tr>'; });
  html+='</table><div style="display:flex;gap:4px;margin-top:5px"><button class="btn btn-s" style="height:24px;font-size:11px;flex:1" onclick="dkChartAddRow(${el.id})">+ Row</button><button class="btn btn-s" style="height:24px;font-size:11px;flex:1" onclick="dkChartAddSeries(${el.id})">+ Series</button></div>';
  return html;
}

// ─── Property setters ────────────────────────────────────────────────────────
function dkSetProp(id,key,val){ const el=_dkEl(id); if(!el)return; _dkSnap(); el[key]=val; saveDecks(); renderDeckCanvas(); renderDeckThumbs(); if(key==='chart'||key==='shape'||key==='fit')renderDeckProps(); }
function dkToggleProp(id,key){ const el=_dkEl(id); if(!el)return; _dkSnap(); el[key]=!el[key]; saveDecks(); renderDeckCanvas(); renderDeckProps(); renderDeckThumbs(); }
function dkSetBullets(id,val){ const el=_dkEl(id); if(!el)return; _dkSnap(); el.items=val.split('\n').map(s=>s.trim()).filter(Boolean); saveDecks(); renderDeckCanvas(); renderDeckThumbs(); }
function dkSetSlideBg(c){ const s=_dkSlide(); if(!s)return; _dkSnap(); s.bg=c; saveDecks(); renderDeckCanvas(); renderDeckThumbs(); renderDeckProps(); }
function dkSetDeckColor(c){ if(!_deckCurrent)return; _deckCurrent.color=c; _deckCurrent.theme=_deckCurrent.theme||{}; _deckCurrent.theme.accent=c; saveDecks(); renderDeckProps(); }
function dkSetIcon(ic){ if(!_deckCurrent)return; _deckCurrent.icon=ic; saveDecks(); renderDecksSection(); }
function dkZOrder(id,dir){ const s=_dkSlide(); const i=s.elements.findIndex(e=>e.id===id); if(i<0)return; _dkSnap(); if(dir>0){ if(i<s.elements.length-1){ const e=s.elements.splice(i,1)[0]; s.elements.push(e); } } else { if(i>0){ const e=s.elements.splice(i,1)[0]; s.elements.unshift(e); } } saveDecks(); renderDeckCanvas(); renderDeckThumbs(); }
function dkDupEl(id){ const s=_dkSlide(); const el=_dkEl(id); if(!el)return; _dkSnap(); const cp=JSON.parse(JSON.stringify(el)); cp.id=_dkNewElId(); cp.x=Math.min(80,cp.x+4); cp.y=Math.min(80,cp.y+4); s.elements.push(cp); _deckSelEl=cp.id; saveDecks(); renderDeckCanvas(); renderDeckProps(); renderDeckThumbs(); }
function dkTblAdd(id,what){ const el=_dkEl(id); if(!el)return; _dkSnap(); if(what==='row'){ const cols=el.rows[0]?el.rows[0].length:1; el.rows.push(new Array(cols).fill('')); } else { el.rows.forEach(r=>r.push('')); } saveDecks(); renderDeckCanvas(); renderDeckThumbs(); }
function dkTblDel(id,what){ const el=_dkEl(id); if(!el)return; _dkSnap(); if(what==='row'){ if(el.rows.length>1)el.rows.pop(); } else { if(el.rows[0]&&el.rows[0].length>1)el.rows.forEach(r=>r.pop()); } saveDecks(); renderDeckCanvas(); renderDeckThumbs(); }
function dkKanAddCol(id){ const el=_dkEl(id); if(!el)return; _dkSnap(); el.columns=el.columns||[]; el.columns.push({title:'New',color:SHEET_PALETTE[el.columns.length%SHEET_PALETTE.length],cards:[]}); saveDecks(); renderDeckCanvas(); renderDeckThumbs(); }
function dkKanDelCol(id){ const el=_dkEl(id); if(!el||!el.columns||el.columns.length<=1)return; _dkSnap(); el.columns.pop(); saveDecks(); renderDeckCanvas(); renderDeckThumbs(); }
function dkChartLabel(id,i,v){ const el=_dkEl(id); if(!el)return; _dkSnap(); el.labels[i]=v; saveDecks(); renderDeckCanvas(); renderDeckThumbs(); }
function dkChartVal(id,si,i,v){ const el=_dkEl(id); if(!el||!el.series[si])return; _dkSnap(); el.series[si].data=el.series[si].data||[]; el.series[si].data[i]=Number(v)||0; saveDecks(); renderDeckCanvas(); renderDeckThumbs(); }
function dkChartAddRow(id){ const el=_dkEl(id); if(!el)return; _dkSnap(); el.labels=el.labels||[]; el.labels.push('New'); el.series.forEach(s=>{ s.data=s.data||[]; s.data.push(0); }); saveDecks(); renderDeckCanvas(); renderDeckProps(); renderDeckThumbs(); }
function dkChartAddSeries(id){ const el=_dkEl(id); if(!el)return; _dkSnap(); el.series=el.series||[]; el.series.push({name:'Series '+(el.series.length+1),color:SHEET_PALETTE[el.series.length%SHEET_PALETTE.length],data:new Array((el.labels||[]).length).fill(0)}); saveDecks(); renderDeckCanvas(); renderDeckProps(); renderDeckThumbs(); }
function dkSaveAssign(){ if(!_deckCurrent)return; let g=null; try{ if(typeof _maGet==='function')g=_maGet('deck-ma'); }catch(_){}
  if(g){ _deckCurrent.assignees=g.assignees||[]; _deckCurrent.assigneeNames=g.assigneeNames||[]; _deckCurrent.primaryAssigneeId=g.primaryAssigneeId||null; if(g.primaryAssigneeId!=null&&Array.isArray(g.assignees)){ const i=g.assignees.indexOf(g.primaryAssigneeId); _deckCurrent.assignedTo=(i>=0&&g.assigneeNames)?g.assigneeNames[i]:(_deckCurrent.assignedTo||''); } }
  saveDecks(); toast('👥 Sharing saved'); }

// ─── Chart SVG renderer ──────────────────────────────────────────────────────
function _dkChartSVG(el){
  const W=320,H=200,pad=26;
  const labels=(el.labels&&el.labels.length)?el.labels:['A','B','C'];
  const series=(el.series&&el.series.length)?el.series:[{name:'S1',color:SHEET_PALETTE[0],data:[3,5,4]}];
  const type=el.chart||'bar';
  const title=el.title?`<text x="${W/2}" y="14" text-anchor="middle" font-size="12" font-weight="700" fill="#334155">${esc(el.title)}</text>`:'';
  const top=el.title?28:12; const plotH=H-top-pad, plotW=W-pad-10, x0=pad, y0=top;
  let maxV=0; series.forEach(s=>(s.data||[]).forEach(v=>{ maxV=Math.max(maxV,Number(v)||0); })); if(maxV<=0)maxV=1;
  const yOf=v=>y0+plotH-(Number(v)||0)/maxV*plotH;
  let body='';
  if(type==='pie'||type==='donut'){
    const data=series[0].data||[]; const sum=data.reduce((s,v)=>s+(Number(v)||0),0)||1;
    const cx=W*0.4,cy=top+plotH/2,rO=Math.min(plotH,plotW*0.7)/2,rI=type==='donut'?rO*0.55:0; let ang=-Math.PI/2;
    data.forEach((v,i)=>{ const frac=(Number(v)||0)/sum; const a2=ang+frac*Math.PI*2; const col=SHEET_PALETTE[i%SHEET_PALETTE.length]; const large=frac>0.5?1:0;
      const x1=cx+rO*Math.cos(ang),y1=cy+rO*Math.sin(ang),x2=cx+rO*Math.cos(a2),y2=cy+rO*Math.sin(a2);
      if(rI>0){ const xi1=cx+rI*Math.cos(a2),yi1=cy+rI*Math.sin(a2),xi2=cx+rI*Math.cos(ang),yi2=cy+rI*Math.sin(ang); body+=`<path d="M${x1} ${y1} A${rO} ${rO} 0 ${large} 1 ${x2} ${y2} L${xi1} ${yi1} A${rI} ${rI} 0 ${large} 0 ${xi2} ${yi2} Z" fill="${col}"/>`; }
      else body+=`<path d="M${cx} ${cy} L${x1} ${y1} A${rO} ${rO} 0 ${large} 1 ${x2} ${y2} Z" fill="${col}"/>`;
      ang=a2; });
    body+=labels.map((l,i)=>`<g transform="translate(${W*0.72},${top+i*15})"><rect width="9" height="9" rx="2" fill="${SHEET_PALETTE[i%SHEET_PALETTE.length]}"/><text x="13" y="8.5" font-size="9" fill="#475569">${esc(l)}</text></g>`).join('');
  } else if(type==='line'||type==='area'){
    body+=`<line x1="${x0}" y1="${y0+plotH}" x2="${x0+plotW}" y2="${y0+plotH}" stroke="#cbd5e1"/>`;
    const n=labels.length; const xOf=i=>x0+(n<=1?plotW/2:i/(n-1)*plotW);
    series.forEach((s,si)=>{ const col=s.color||SHEET_PALETTE[si%SHEET_PALETTE.length]; const pts=(s.data||[]).map((v,i)=>`${xOf(i)},${yOf(v)}`).join(' ');
      if(type==='area')body+=`<polygon points="${x0},${y0+plotH} ${pts} ${x0+plotW},${y0+plotH}" fill="${col}" fill-opacity="0.18"/>`;
      body+=`<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.5"/>`;
      (s.data||[]).forEach((v,i)=>{ body+=`<circle cx="${xOf(i)}" cy="${yOf(v)}" r="3" fill="${col}"/>`; }); });
    body+=labels.map((l,i)=>`<text x="${xOf(i)}" y="${y0+plotH+13}" text-anchor="middle" font-size="9" fill="#64748b">${esc(l)}</text>`).join('');
  } else {
    body+=`<line x1="${x0}" y1="${y0+plotH}" x2="${x0+plotW}" y2="${y0+plotH}" stroke="#cbd5e1"/>`;
    const n=labels.length, groups=series.length, gw=plotW/Math.max(n,1), bw=Math.max(2,Math.min(gw*0.7/groups,28));
    labels.forEach((l,i)=>{ series.forEach((s,si)=>{ const v=(s.data||[])[i]; const col=s.color||SHEET_PALETTE[si%SHEET_PALETTE.length]; const bx=x0+i*gw+(gw-bw*groups)/2+si*bw; const by=yOf(v); body+=`<rect x="${bx}" y="${by}" width="${Math.max(1,bw-2)}" height="${y0+plotH-by}" fill="${col}" rx="2"/>`; });
      body+=`<text x="${x0+i*gw+gw/2}" y="${y0+plotH+13}" text-anchor="middle" font-size="9" fill="#64748b">${esc(l)}</text>`; });
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;pointer-events:none">${title}${body}</svg>`;
}

// ─── Present mode ────────────────────────────────────────────────────────────
function dkPresent(){ if(!_deckCurrent||!_deckCurrent.slides.length)return; _deckPresent=true; _deckPresentIdx=_deckSlide||0; _dkRenderPresent(); document.addEventListener('keydown',_dkPresentKey); }
function _dkRenderPresent(){
  const old=document.getElementById('dk-present'); if(old)old.remove();
  const slide=_deckCurrent.slides[_deckPresentIdx]; if(!slide)return;
  const ov=document.createElement('div'); ov.id='dk-present'; ov.className='dk-present';
  ov.innerHTML=`<button class="dk-present-x" onclick="dkPresentExit()" title="Exit (Esc)">✕</button>
    <div class="dk-present-canvas" style="background:${_dkBg(slide)}">${(slide.elements||[]).map(e=>_dkElHtml(e,false,false)).join('')}</div>
    <div class="dk-present-nav"><button onclick="dkPresentNav(-1)">‹</button><span>${_deckPresentIdx+1} / ${_deckCurrent.slides.length}</span><button onclick="dkPresentNav(1)">›</button></div>`;
  document.body.appendChild(ov);
}
function dkPresentNav(d){ if(!_deckPresent)return; _deckPresentIdx=Math.max(0,Math.min(_deckCurrent.slides.length-1,_deckPresentIdx+d)); _dkRenderPresent(); }
function dkPresentExit(){ _deckPresent=false; const o=document.getElementById('dk-present'); if(o)o.remove(); document.removeEventListener('keydown',_dkPresentKey); }
function _dkPresentKey(e){ if(!_deckPresent)return; if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){ e.preventDefault(); dkPresentNav(1); } else if(e.key==='ArrowLeft'||e.key==='PageUp'){ e.preventDefault(); dkPresentNav(-1); } else if(e.key==='Escape'){ dkPresentExit(); } }

/* ═════════════════════════════════════════════════════════════════════
   ATLAS (CFResourcePlanner) — one-way sync, read-only mirror.
   Server-side: tRPC atlas.status / atlas.pull / atlas.clear.
   Data lands in D.atlas via the usual appData.load pipeline.
   ═════════════════════════════════════════════════════════════════════ */
const ATLAS_PUBLIC_URL='https://cfresourceplanner-production.up.railway.app';
let _atlasView='proj';

async function _hydrateAtlasPanel(){
  const body=document.getElementById('atlas-panel-body');
  if(!body)return;
  try{
    const s=await _trpc('atlas.status',{},'query');
    const url=s.baseUrl||'(not configured)';
    const tokenLine=s.tokenConfigured
      ? '<span style="color:var(--ok)">✓ Token configured</span>'
      : '<span style="color:var(--warn)">⚠ Token missing</span>';
    const urlLine=s.urlConfigured
      ? `<span style="color:var(--ok)">✓ URL: <code style="background:var(--s3);padding:1px 4px;border-radius:3px;font-size:11px">${esc(url)}</code></span>`
      : '<span style="color:var(--warn)">⚠ ATLAS_SYNC_URL env var missing</span>';
    const synced=s.lastPulledAt
      ? `Last synced: <strong>${new Date(s.lastPulledAt).toLocaleString()}</strong>${s.lastUpdatedAt?` · source updated ${new Date(s.lastUpdatedAt).toLocaleString()}`:''}`
      : 'Never pulled yet.';
    const counts=s.entityCounts||{};
    const countLine=Object.keys(counts).length
      ? `<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">${Object.entries(counts).map(([k,v])=>`<span style="background:var(--s3);padding:2px 6px;border-radius:3px;font-size:11px"><strong>${v}</strong> ${esc(k)}</span>`).join('')}</div>`
      : '';
    body.innerHTML=`${urlLine} · ${tokenLine}<br><span style="color:var(--t3);font-size:11px">${synced}</span>${countLine}`;
  }catch(e){
    body.innerHTML=`<span style="color:var(--warn)">Status check failed: ${esc(String(e&&e.message||e))}</span>`;
  }
}

async function _atlasPullNow(){
  toast({type:'info',title:'Pulling Atlas snapshot…',duration:2000});
  try{
    const r=await _trpc('atlas.pull',{},'mutation');
    const c=r.counts||{};
    toast({type:'success',title:'✅ Atlas synced',msg:`${c.projects||0} projects · ${c.members||0} members · ${c.activities||0} activities · ${c.taskTemplates||0} templates`});
    // Reload server data into D so D.atlas is fresh
    try{ if(typeof loadServerData==='function')await loadServerData(); }catch(_){}
    await _hydrateAtlasPanel();
    if(curScreen==='atlas')renderAtlas();
  }catch(e){
    toast({type:'error',title:'Atlas pull failed',msg:String(e&&e.message||e),duration:8000});
  }
}

async function _atlasClear(){
  if(!confirm('Wipe the locally cached Atlas snapshot?\n\nThis only clears LevelUp\'s mirror — Atlas itself is untouched. You can re-pull at any time.'))return;
  try{
    await _trpc('atlas.clear',{},'mutation');
    D.atlas=null;
    toast({type:'success',title:'Atlas cache cleared'});
    await _hydrateAtlasPanel();
    if(curScreen==='atlas')renderAtlas();
  }catch(e){
    toast({type:'error',title:'Clear failed',msg:String(e&&e.message||e)});
  }
}

async function _removeCfSmartsheetWatches(){
  if(!confirm('Delete the two legacy CF Smartsheet watches (120-Day Plan + Pipeline 2026/2027)?\n\nAtlas is now the source of truth for this data. Existing external_tasks rows from those sheets will stop being refreshed but will remain in the Tasks list until you remove them individually.\n\nProceed?'))return;
  try{
    const sheets=await _trpc('externalSources.listSmartsheetWatches',{},'query');
    const cfLabels=['CF — 120-Day Plan','CF — Pipeline 2026/2027'];
    const targets=(sheets||[]).filter(s=>cfLabels.includes(s.label));
    if(!targets.length){toast({type:'info',title:'No legacy CF watches found',msg:'Nothing to remove.'});return;}
    let ok=0,errs=[];
    for(const w of targets){
      try{ await _trpc('externalSources.removeSmartsheetWatch',{id:w.id},'mutation'); ok++; }
      catch(e){ errs.push(w.label+': '+String(e&&e.message||e)); }
    }
    if(errs.length)toast({type:'warn',title:`Removed ${ok}/${targets.length} · ${errs.length} failed`,msg:errs.join(' · ')});
    else toast({type:'success',title:`✅ Removed ${ok} legacy CF watch(es)`});
    if(typeof _hydrateExternalSourcesPanel==='function')await _hydrateExternalSourcesPanel();
  }catch(e){
    toast({type:'error',title:'Remove failed',msg:String(e&&e.message||e)});
  }
}

/* ── Atlas screen render ── */
function renderAtlas(){
  const m=document.getElementById('atlas-main');
  if(!m)return;
  const snap=D.atlas;
  if(!snap||!snap.projects){
    m.innerHTML=`<div class="ph-r" style="margin-bottom:14px">
      <h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('map',22,'var(--page-accent)')}Atlas</h1>
      <p style="font-size:12px;color:var(--t2)">Read-only mirror of the CFResourcePlanner workspace.</p>
    </div>
    <div class="cd" style="padding:24px;text-align:center;color:var(--t2)">
      <div style="font-size:14px;margin-bottom:8px">No Atlas snapshot yet.</div>
      <div style="font-size:11px;color:var(--t3);margin-bottom:14px">Pull the first snapshot from Atlas to populate this page.</div>
      <button class="btn btn-p" onclick="_atlasPullNow()">↻ Pull from Atlas now</button>
      <div style="margin-top:10px"><button class="btn btn-s" onclick="nav('settings');setTimeout(()=>{document.querySelectorAll('.sp').forEach(x=>x.style.display='none');const p=document.getElementById('sp-5');if(p)p.style.display='';document.querySelectorAll('.si').forEach((x,i)=>x.classList.toggle('on',i===5));},50)">→ Configure integration</button></div>
    </div>`;
    const r=document.getElementById('atlas-rail');if(r)r.innerHTML='';
    return;
  }
  const tabs=[
    {k:'proj',l:'Projects',cnt:snap.projects.filter(p=>p.category==='project').length},
    {k:'init',l:'Initiatives',cnt:snap.projects.filter(p=>p.category==='initiative').length},
    {k:'opp',l:'Opportunities',cnt:snap.projects.filter(p=>p.category==='opportunity').length},
    {k:'prop',l:'Proposals',cnt:(snap.proposals||[]).length},
    {k:'over',l:'Overhead',cnt:snap.projects.filter(p=>p.category==='overhead').length},
    {k:'org',l:'Org Chart',cnt:(snap.departments||[]).length},
    {k:'res',l:'Resources',cnt:(snap.departments||[]).reduce((s,d)=>s+(d.members||[]).length,0)},
    {k:'cls',l:'Classification',cnt:(snap.departments||[]).reduce((s,d)=>s+(d.members||[]).filter(m=>m.sme||m.hub||m.associate||m.proposal||m.recruiter).length,0)},
    {k:'coe',l:'COE Plan',cnt:(snap.activities||[]).filter(a=>(a.kind||'coe')==='coe').length},
    {k:'ptask',l:'Project Tasks',cnt:(snap.activities||[]).filter(a=>a.kind==='project').length},
    {k:'recruit',l:'Recruiting',cnt:(snap.recruitings||[]).length},
    {k:'pplan',l:'Resource Planning',cnt:((snap.atlasComputed&&snap.atlasComputed.resourcePlanning&&snap.atlasComputed.resourcePlanning.heatmap)||[]).length},
    {k:'cap',l:'Capacity',cnt:((snap.atlasComputed&&snap.atlasComputed.capacity&&snap.atlasComputed.capacity.projects)||[]).length},
    {k:'proforma',l:'Proforma',cnt:(snap.proforma?(((snap.proforma.scenarios)||[]).length||'·'):0)},
    {k:'reports',l:'Reports',cnt:((snap.atlasComputed&&snap.atlasComputed.reports)||[]).length},
    {k:'pto',l:'PTO',cnt:(snap.departments||[]).reduce((s,d)=>s+(d.members||[]).reduce((s2,m)=>s2+((m.pto||[]).length?1:0),0),0)},
  ];
  const synced=snap.pulledAt?new Date(snap.pulledAt).toLocaleString():'unknown';
  const tabBtn=t=>`<button class="btn btn-s" onclick="_atlasView='${t.k}';renderAtlas()" style="${_atlasView===t.k?'background:var(--ac);color:#fff;border-color:var(--ac);':''}">${t.l} <span style="opacity:.65">·${t.cnt}</span></button>`;
  const header=`<div class="ph-r" style="margin-bottom:14px;display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap">
    <div>
      <h1 style="font-size:22px;font-weight:700">🗺 Atlas <span style="font-size:11px;color:var(--t3);font-weight:400;margin-left:8px">read-only mirror</span></h1>
      <p style="font-size:12px;color:var(--t2)">Last pulled <strong>${synced}</strong> · <a href="${ATLAS_PUBLIC_URL}" target="_blank" style="color:var(--ac);text-decoration:none">Open Atlas ↗</a></p>
    </div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-s" onclick="_atlasPullNow()">↻ Refresh</button>
    </div>
  </div>`;
  const tabBar=`<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">${tabs.map(tabBtn).join('')}</div>`;
  let body='';
  if(_atlasView==='proj')body=_atlasProjectsHTML(snap,'project');
  else if(_atlasView==='init')body=_atlasProjectsHTML(snap,'initiative');
  else if(_atlasView==='opp')body=_atlasOppsHTML(snap);
  else if(_atlasView==='prop')body=_atlasProposalsHTML(snap);
  else if(_atlasView==='over')body=_atlasProjectsHTML(snap,'overhead');
  else if(_atlasView==='org')body=_atlasOrgChartHTML(snap);
  else if(_atlasView==='res')body=_atlasResourcesHTML(snap);
  else if(_atlasView==='cls')body=_atlasClassificationHTML(snap);
  else if(_atlasView==='coe')body=_atlasActivitiesHTML(snap,'coe');
  else if(_atlasView==='ptask')body=_atlasActivitiesHTML(snap,'project');
  else if(_atlasView==='recruit')body=_atlasRecruitingHTML(snap);
  else if(_atlasView==='pplan')body=_atlasResourcePlanningHTML(snap);
  else if(_atlasView==='cap')body=_atlasCapacityHTML(snap);
  else if(_atlasView==='proforma')body=_atlasProformaHTML(snap);
  else if(_atlasView==='reports')body=_atlasReportsHTML(snap);
  else if(_atlasView==='pto')body=_atlasPTOHTML(snap);
  m.innerHTML=header+tabBar+body;
  // Right rail: simple summary
  const r=document.getElementById('atlas-rail');
  if(r)r.innerHTML=_atlasRailHTML(snap);
}

function _atlasMoney(n){if(!n)return '$0';return '$'+Math.round(Number(n)).toLocaleString();}
function _atlasMember(snap,id){
  for(const d of (snap.departments||[])){
    const m=(d.members||[]).find(x=>x.id===id);
    if(m)return {member:m,dept:d};
  }
  return null;
}
function _atlasProgram(snap,id){return (snap.programs||[]).find(p=>p.id===id);}
function _atlasProject(snap,id){return (snap.projects||[]).find(p=>p.id===id);}
function _atlasOpenLink(){return `<a href="${ATLAS_PUBLIC_URL}" target="_blank" style="font-size:11px;color:var(--ac);text-decoration:none">Open in Atlas ↗</a>`;}

function _atlasProjectsHTML(snap,category){
  const items=(snap.projects||[]).filter(p=>p.category===category);
  if(!items.length)return `<div class="cd" style="padding:16px;color:var(--t3);text-align:center">No ${esc(category)} items.</div>`;
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">${items.map(p=>{
    const cost=(snap.departments||[]).reduce((sum,d)=>sum+(d.members||[]).reduce((s2,m)=>{
      const e=(m.projects||[]).find(x=>(typeof x==='object'?x.id:x)===p.id);
      if(!e)return s2;
      const pct=typeof e==='object'?(e.pct||100):100;
      return s2+Math.round((m.cost||0)*pct/100);
    },0),0);
    const rev=p.revenue||p.targetRevenue||0;
    const margin=rev-cost;
    return `<div class="cd" style="padding:12px;border-left:3px solid #0ea5e9;cursor:pointer" onclick="atlasOpenDrawer('project','${p.id}')">
      <div style="font-size:13px;font-weight:700;margin-bottom:2px">${esc(p.name)}</div>
      ${p.customer?`<div style="font-size:11px;color:var(--t3);margin-bottom:6px">${esc(p.customer)}</div>`:''}
      <div style="display:flex;gap:8px;font-size:11px;color:var(--t2);margin-bottom:4px">
        <span><strong>${_atlasMoney(rev)}</strong>${category==='project'?'/mo':' tgt'}</span>
        <span style="color:#dc2626"><strong>${_atlasMoney(cost)}</strong> cost</span>
        <span style="color:${margin>=0?'#16a34a':'#dc2626'}"><strong>${margin>=0?'':'-'}${_atlasMoney(Math.abs(margin))}</strong></span>
      </div>
      ${p.pm?`<div style="font-size:11px;color:var(--t3)">PM: ${esc(p.pm)}</div>`:''}
      ${p.revenueNote?`<div style="font-size:11px;color:var(--t3);margin-top:4px;font-style:italic">${esc(p.revenueNote)}</div>`:''}
      ${p.clins&&p.clins.length?`<div style="font-size:11px;color:var(--t3);margin-top:4px">${p.clins.length} CLIN${p.clins.length===1?'':'s'}</div>`:''}
      ${_atlasAnnotIndicator('project',p.id)}
    </div>`;
  }).join('')}</div>`;
}

// Atlas's canonical stage + status definitions (mirrors index.html OPP_STAGES / OPP_STATUS_C).
const _ATLAS_OPP_STAGES=[
  {k:'Lead Gen',c:'#546478'},
  {k:'Presales',c:'#2563EB'},
  {k:'Sales',c:'#D97706'},
  {k:'Delivery',c:'#2D6A4F'},
  {k:'Won',c:'#059669'},
  {k:'Lost',c:'#DC2626'},
];
const _ATLAS_OPP_STATUS_C={'New':'#546478','Qualified':'#2563EB','Proposal':'#D97706','Negotiation':'#7C3AED','Closed Won':'#2D6A4F','Closed Lost':'#DC2626','On-Hold':'#94A3B8'};
let _atlasOppHideClosed=true;

function _atlasOppsHTML(snap){
  const opps=(snap.projects||[]).filter(p=>p.category==='opportunity');
  if(!opps.length)return `<div class="cd" style="padding:16px;color:var(--t3);text-align:center">No opportunities.</div>`;
  // KPI strip
  const open=opps.filter(o=>!/won|lost/i.test(o.stage||'')&&!/closed/i.test(o.status||''));
  const won=opps.filter(o=>/won/i.test(o.stage||'')||/closed won/i.test(o.status||''));
  const lost=opps.filter(o=>/lost/i.test(o.stage||'')||/closed lost/i.test(o.status||''));
  const totalPipeline=open.reduce((s,o)=>s+(Number(o.potential)||0),0);
  const wonValue=won.reduce((s,o)=>s+(Number(o.potential)||0),0);
  const winRate=(won.length+lost.length)?Math.round(won.length/(won.length+lost.length)*100):0;
  const kpis=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">
    <div class="cd" style="padding:12px;text-align:center;border-left:3px solid #3b82f6"><div style="font-size:20px;font-weight:750;color:#3b82f6;line-height:1">${_atlasMoney(totalPipeline)}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">Pipeline Value</div></div>
    <div class="cd" style="padding:12px;text-align:center;border-left:3px solid #f59e0b"><div style="font-size:20px;font-weight:750;color:#f59e0b;line-height:1">${open.length}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">Open Opps</div></div>
    <div class="cd" style="padding:12px;text-align:center;border-left:3px solid #10b981"><div style="font-size:20px;font-weight:750;color:#10b981;line-height:1">${won.length}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">Won (${_atlasMoney(wonValue)})</div></div>
    <div class="cd" style="padding:12px;text-align:center;border-left:3px solid #16a34a"><div style="font-size:20px;font-weight:750;color:#16a34a;line-height:1">${winRate}%</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">Win Rate</div></div>
  </div>`;
  // Group by stage; canonical order, then any unknown stages at end
  const byStage={};_ATLAS_OPP_STAGES.forEach(s=>byStage[s.k]=[]);
  const unknown={};
  opps.forEach(o=>{
    const s=(o.stage||'').trim();
    if(byStage[s])byStage[s].push(o);
    else{(unknown[s||'Unstaged']=unknown[s||'Unstaged']||[]).push(o);}
  });
  // Hide-closed toggle row
  const toggleRow=`<div style="display:flex;gap:6px;margin-bottom:6px;font-size:11px"><label style="display:flex;align-items:center;gap:6px;color:var(--t2);cursor:pointer"><input type="checkbox" ${_atlasOppHideClosed?'checked':''} onchange="_atlasOppHideClosed=this.checked;renderAtlas()"> Hide Won / Lost</label></div>`;
  const visibleStages=_ATLAS_OPP_STAGES.filter(s=>!_atlasOppHideClosed||(s.k!=='Won'&&s.k!=='Lost'));
  const unknownKeys=Object.keys(unknown);
  const columnCount=visibleStages.length+unknownKeys.length;
  const cardHTML=o=>{
    const statusColor=o.status?(_ATLAS_OPP_STATUS_C[o.status]||'#64748b'):null;
    const statusChip=o.status?`<span style="display:inline-block;background:${statusColor}22;color:${statusColor};font-size:11px;font-weight:700;padding:1px 6px;border-radius:3px;letter-spacing:.04em;margin-right:4px">${esc(o.status)}</span>`:'';
    const daysToClose=o.closeDate?(()=>{const d=new Date(o.closeDate);if(isNaN(d))return null;const dd=Math.round((d-Date.now())/86400000);return dd;})():null;
    const closeLbl=o.closeDate?(daysToClose!==null?(daysToClose<0?`<span style="color:#dc2626">${Math.abs(daysToClose)}d overdue</span>`:`${daysToClose}d`):esc(o.closeDate)):'';
    return `<div class="cd" style="padding:9px 11px;margin-bottom:6px;cursor:pointer" onclick="atlasOpenDrawer('project','${o.id}')" title="${esc((o.team||'')+' '+(o.changeRequested||''))}">
      <div style="font-size:12px;font-weight:600;margin-bottom:2px">${esc(o.name)}</div>
      ${o.customer?`<div style="font-size:11px;color:var(--t3);margin-bottom:4px">${esc(o.customer)}</div>`:''}
      ${o.potential?`<div style="font-size:11px;font-weight:700;color:#16a34a;margin-bottom:3px">${_atlasMoney(o.potential)}/yr</div>`:''}
      ${statusChip?`<div style="margin-bottom:3px">${statusChip}</div>`:''}
      <div style="font-size:11px;color:var(--t2);line-height:1.5">
        ${o.pm?`<div>PM: <strong>${esc(o.pm)}</strong></div>`:''}
        ${o.opr?`<div>OPR: ${esc(o.opr)}</div>`:''}
        ${closeLbl?`<div>Close: ${closeLbl}</div>`:''}
      </div>
    </div>`;
  };
  const stageCol=(stageName,color,list)=>{
    const total=list.reduce((s,o)=>s+(Number(o.potential)||0),0);
    return `<div style="flex:0 0 240px;background:var(--s2);padding:8px;border-radius:8px;border-top:3px solid ${color}">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${color};margin-bottom:6px;display:flex;justify-content:space-between">
        <span>${esc(stageName)}</span><span style="color:var(--t3);font-weight:600">${list.length}${total?' · '+_atlasMoney(total):''}</span>
      </div>
      ${list.length?list.map(cardHTML).join(''):'<div style="font-size:11px;color:var(--t3);padding:8px 4px;text-align:center">—</div>'}
    </div>`;
  };
  const board=`<div style="display:flex;gap:10px;overflow-x:auto;align-items:flex-start;padding-bottom:6px">
    ${visibleStages.map(s=>stageCol(s.k,s.c,byStage[s.k]||[])).join('')}
    ${unknownKeys.map(k=>stageCol(k,'#94a3b8',unknown[k])).join('')}
  </div>`;
  return kpis+toggleRow+board;
}

function _atlasOrgChartHTML(snap){
  const depts=(snap.departments||[]);
  if(!depts.length)return `<div class="cd" style="padding:16px;color:var(--t3);text-align:center">No departments.</div>`;
  const byParent={};depts.forEach(d=>{(byParent[d.parentId||'']=byParent[d.parentId||'']||[]).push(d);});
  function tree(parentId,depth){
    return (byParent[parentId]||[]).map(d=>{
      const members=d.members||[];
      const cost=members.reduce((s,m)=>s+(m.cost||0),0);
      return `<div class="cd" style="padding:10px 12px;margin-bottom:8px;margin-left:${depth*16}px;border-left:3px solid ${esc(d.accent||'#64748b')}">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
          <div style="cursor:pointer" onclick="atlasOpenDrawer('department','${d.id}')"><strong style="font-size:13px">${esc(d.name)}</strong>${d.subtitle?` <span style="font-size:11px;color:var(--t3)">· ${esc(d.subtitle)}</span>`:''} ${_atlasAnnotIndicator('department',d.id)}</div>
          <div style="font-size:11px;color:var(--t3)">${members.length} · ${_atlasMoney(cost)}/mo</div>
        </div>
        ${members.length?`<div style="display:flex;flex-wrap:wrap;gap:5px;font-size:11px">${members.map(m=>`<span style="background:var(--s3);padding:2px 7px;border-radius:3px;cursor:pointer" onclick="atlasOpenDrawer('member','${m.id}')" title="${esc(m.role||'')}${m.cost?` · ${_atlasMoney(m.cost)}/mo`:''}">${esc(m.name)}${m.sme?' 🎓':''}${m.hub?' 🌐':''}</span>`).join('')}</div>`:'<div style="font-size:11px;color:var(--t3)">No members</div>'}
        ${tree(d.id,depth+1)}
      </div>`;
    }).join('');
  }
  return tree('',0);
}

function _atlasResourcesHTML(snap){
  const all=[];(snap.departments||[]).forEach(d=>(d.members||[]).forEach(m=>all.push({...m,_dept:d.name})));
  if(!all.length)return `<div class="cd" style="padding:16px;color:var(--t3);text-align:center">No resources.</div>`;
  const byLoc={};all.forEach(m=>{const k=m.location||'_none';(byLoc[k]=byLoc[k]||[]).push(m);});
  const locName=id=>{const l=(snap.locations||[]).find(x=>x.id===id);return l?l.name:(id==='_none'?'No location set':id);};
  return Object.keys(byLoc).map(lid=>{
    const list=byLoc[lid];
    const cost=list.reduce((s,m)=>s+(m.cost||0),0);
    return `<div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">📍 ${esc(locName(lid))} <span style="color:var(--t3);font-weight:400">· ${list.length} ${list.length===1?'person':'people'} · ${_atlasMoney(cost)}/mo</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
        ${list.map(m=>`<div class="cd" style="padding:10px 12px;cursor:pointer" onclick="atlasOpenDrawer('member','${m.id}')">
          <div style="font-size:12px;font-weight:700">${esc(m.name)}</div>
          <div style="font-size:11px;color:var(--t3)">${esc(m.role||'')}</div>
          <div style="font-size:11px;color:var(--t2);margin-top:4px">${_atlasMoney(m.cost)}/mo · ${esc(m._dept)}</div>
          ${m.sme||m.hub||m.associate||m.proposal||m.recruiter?`<div style="display:flex;gap:3px;margin-top:5px;flex-wrap:wrap">${m.sme?'<span style="background:rgba(124,92,191,.15);color:#7c5cbf;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:700">SME</span>':''}${m.hub?'<span style="background:rgba(13,148,136,.15);color:#0d9488;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:700">HUB</span>':''}${m.associate?'<span style="background:rgba(217,119,6,.15);color:#d97706;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:700">ASSOC</span>':''}${m.proposal?'<span style="background:rgba(5,150,105,.15);color:#059669;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:700">PROP</span>':''}${m.recruiter?'<span style="background:rgba(124,58,237,.15);color:#7c3aed;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:700">RECR</span>':''}</div>`:''}
          ${_atlasAnnotIndicator('member',m.id)}
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function _atlasActivitiesHTML(snap,kind){
  const acts=(snap.activities||[]).filter(a=>(a.kind||'coe')===kind);
  if(!acts.length)return `<div class="cd" style="padding:16px;color:var(--t3);text-align:center">No ${kind==='coe'?'COE Plan':'Project Task'} entries.</div>`;
  const statusCfg={todo:{l:'Not Started',c:'#64748b'},doing:{l:'In Progress',c:'#d97706'},done:{l:'Completed',c:'#16a34a'},blocked:{l:'Blocked',c:'#dc2626'}};
  if(kind==='coe'){
    const byProg={};acts.forEach(a=>{(byProg[a.programId||'_none']=byProg[a.programId||'_none']||[]).push(a);});
    return Object.keys(byProg).map(pid=>{
      const list=byProg[pid].slice().sort((a,b)=>(a.order||0)-(b.order||0));
      const prog=_atlasProgram(snap,pid);
      const done=list.filter(a=>a.status==='done').length;
      return `<div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--t2);margin-bottom:6px">${esc(prog?prog.name:(byProg[pid][0].program||'Uncategorized'))} <span style="color:var(--t3);font-weight:400">· ${done}/${list.length}</span></div>
        ${list.map(a=>_atlasTaskRow(snap,a,statusCfg)).join('')}
      </div>`;
    }).join('');
  } else {
    const byProj={};acts.forEach(a=>{(byProj[a.projectId||'_none']=byProj[a.projectId||'_none']||[]).push(a);});
    return Object.keys(byProj).map(pid=>{
      const list=byProj[pid].slice().sort((a,b)=>(a.order||0)-(b.order||0));
      const proj=_atlasProject(snap,pid);
      const done=list.filter(a=>a.status==='done').length;
      const label=proj?`${proj.name} (${proj.category})`:'Unassigned';
      return `<div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--t2);margin-bottom:6px">${esc(label)} <span style="color:var(--t3);font-weight:400">· ${done}/${list.length}</span></div>
        ${list.map(a=>_atlasTaskRow(snap,a,statusCfg)).join('')}
      </div>`;
    }).join('');
  }
}

function _atlasTaskRow(snap,a,statusCfg){
  const s=statusCfg[a.status]||statusCfg.todo;
  const owners=(a.owners||[]).map(id=>{const x=_atlasMember(snap,id);return x?x.member.name:'';}).filter(Boolean);
  const ownerLbl=owners.length?owners.join(', '):(a.ownerText||'—');
  const proj=a.projectId?_atlasProject(snap,a.projectId):null;
  return `<div class="cd" style="padding:9px 12px;margin-bottom:5px;display:flex;gap:10px;align-items:flex-start;cursor:pointer" onclick="atlasOpenDrawer('activity','${a.id}')">
    <span style="display:inline-block;background:${s.c};color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:3px;text-transform:uppercase;letter-spacing:.04em;flex-shrink:0">${s.l}</span>
    <div style="flex:1;min-width:0">
      <div style="font-size:12px;font-weight:600">${a.isMilestone?'◆ ':''}${esc(a.subtask||'(untitled)')} ${_atlasAnnotIndicator('activity',a.id)}</div>
      ${a.objective?`<div style="font-size:11px;color:var(--t2);margin-top:2px"><strong>Next:</strong> ${esc(a.objective)}</div>`:''}
      <div style="font-size:11px;color:var(--t3);margin-top:3px">
        ${a.phase?'<span>'+esc(a.phase)+'</span> · ':''}
        ${a.dueDate?'due '+esc(a.dueDate)+' · ':''}
        ${ownerLbl!=='—'?esc(ownerLbl):''}
        ${proj?` · <span style="color:#0ea5e9">${esc(proj.name)}</span>`:''}
        ${a.pm?` · PM ${esc(a.pm)}`:''}
      </div>
    </div>
  </div>`;
}

function _atlasRailHTML(snap){
  const allM=(snap.departments||[]).reduce((s,d)=>s+(d.members||[]).length,0);
  const totalCost=(snap.departments||[]).reduce((s,d)=>s+(d.members||[]).reduce((s2,m)=>s2+(m.cost||0),0),0);
  const revenue=(snap.projects||[]).filter(p=>p.category==='project').reduce((s,p)=>s+(p.revenue||0),0);
  const targetRev=(snap.projects||[]).filter(p=>p.category==='opportunity'||p.category==='initiative').reduce((s,p)=>s+(p.targetRevenue||0),0);
  return `<div class="cd" style="padding:14px;margin-bottom:10px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--t2);margin-bottom:8px">Snapshot</div>
    <div style="font-size:12px;line-height:1.8">
      <div><strong>${(snap.projects||[]).filter(p=>p.category==='project').length}</strong> active projects</div>
      <div><strong>${(snap.projects||[]).filter(p=>p.category==='opportunity').length}</strong> opportunities</div>
      <div><strong>${(snap.projects||[]).filter(p=>p.category==='initiative').length}</strong> initiatives</div>
      <div><strong>${allM}</strong> people · <strong style="color:#dc2626">${_atlasMoney(totalCost)}</strong>/mo cost</div>
      <div><strong style="color:#16a34a">${_atlasMoney(revenue)}</strong>/mo realized · <strong style="color:#f59e0b">${_atlasMoney(targetRev)}</strong> pipeline</div>
    </div>
    <div style="margin-top:10px;font-size:11px;color:var(--t3)">Last pulled ${snap.pulledAt?new Date(snap.pulledAt).toLocaleString():'—'}</div>
    <a href="${ATLAS_PUBLIC_URL}" target="_blank" style="display:block;text-align:center;margin-top:10px;font-size:11px;color:var(--ac);text-decoration:none">Open Atlas ↗</a>
  </div>`;
}

/* ════════════════════════════════════════════════════════════════════════
   ATLAS — full-parity pages (Recruiting / Resource Planning / Capacity /
   Proforma / Reports / PTO). Computed pages read snap.atlasComputed, which
   Atlas bakes via buildAtlasComputed(). Reports render Atlas's own HTML.
   ════════════════════════════════════════════════════════════════════════ */
function _atlasAllocColor(p){if(p>100)return '#dc2626';if(p>=85)return '#d97706';if(p>0)return '#2d6a4f';return '#94a3b8';}
function _atlasComputedEmpty(err){
  return `<div class="cd" style="padding:24px;text-align:center;color:var(--t2)">
    <div style="font-size:13px;margin-bottom:6px">No pre-computed data yet.</div>
    <div style="font-size:11px;color:var(--t3);max-width:460px;margin:0 auto 12px">This page mirrors Atlas's computed forecast/reports. Open the Atlas app once (it bakes the data on load), then click Refresh here to pull it.${err?'<br><br><span style="color:var(--warn)">Atlas reported: '+esc(err)+'</span>':''}</div>
    <button class="btn btn-p" onclick="_atlasPullNow()">↻ Refresh from Atlas</button>
  </div>`;
}
function _atlasInjectRptCSS(){
  if(document.getElementById('atlas-rpt-css'))return;
  const s=document.createElement('style');s.id='atlas-rpt-css';
  s.textContent=`
  .atlas-rpt .pf-tbl{width:100%;border-collapse:collapse;font-size:12px}
  .atlas-rpt .pf-tbl th,.atlas-rpt .pf-tbl td{border:1px solid var(--brd);padding:5px 9px;text-align:left;vertical-align:top}
  .atlas-rpt .pf-tbl thead th{background:var(--s2);font-size:11px;text-transform:uppercase;letter-spacing:.3px;color:var(--t3)}
  .atlas-rpt .pf-tbl tbody tr:nth-child(even){background:var(--s2)}
  .atlas-rpt .pf-note{font-size:11px;color:var(--t3);margin-top:6px}
  .atlas-rpt .pf-pill{display:inline-block;font-size:11px;font-weight:800;padding:1px 7px;border-radius:9px;background:var(--s3);color:var(--t2);text-transform:uppercase;letter-spacing:.3px}
  .atlas-rpt .pf-pill.pf-crit{background:#FEE2E2;color:#B91C1C}
  .atlas-rpt .pf-pill.pf-high{background:#FEF3C7;color:#B45309}
  .atlas-rpt .pf-pill.pf-med{background:#E0E7FF;color:#3730A3}
  .atlas-rpt .pf-pill.pf-ok{background:#DCFCE7;color:#166534}
  .atlas-rpt .rpt-legend{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:8px;font-size:12px;color:var(--t2)}
  .atlas-rpt .rpt-leg{display:inline-flex;align-items:center;gap:5px}
  .atlas-rpt .rpt-leg i{width:10px;height:10px;border-radius:2px;display:inline-block;flex:0 0 auto}
  .atlas-rpt .rpt-empty{font-size:11px;color:var(--t3);padding:18px;text-align:center}
  .atlas-rpt .rpt-lock{display:flex;align-items:center;justify-content:center;min-height:120px;color:var(--t3);font-size:12px}
  .atlas-rpt svg{max-width:100%;height:auto}`;
  document.head.appendChild(s);
}

/* ── Recruiting ── */
function _atlasRecruitingHTML(snap){
  const reqs=snap.recruitings||[],cands=snap.candidates||[],bank=snap.resumeBank||[];
  if(!reqs.length&&!cands.length&&!bank.length)return `<div class="cd" style="padding:24px;color:var(--t3);text-align:center">No recruiting data in the snapshot.</div>`;
  const STAGES=['new','screening','interviewing','offer','hired'];
  const stageLbl={new:'New',screening:'Screening',interviewing:'Interviewing',offer:'Offer',hired:'Hired'};
  const stageCol={new:'#64748b',screening:'#0ea5e9',interviewing:'#d97706',offer:'#7c3aed',hired:'#16a34a'};
  // Funnel KPIs
  const byStage={};STAGES.forEach(s=>byStage[s]=0);
  cands.forEach(c=>{const s=(c.status||'new').toLowerCase();if(byStage[s]!=null)byStage[s]++;});
  const funnel=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:14px">
    ${STAGES.map(s=>`<div class="cd" style="padding:10px;text-align:center;border-left:3px solid ${stageCol[s]}"><div style="font-size:18px;font-weight:750;color:${stageCol[s]};line-height:1">${byStage[s]}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">${stageLbl[s]}</div></div>`).join('')}</div>`;
  // Requisitions + their candidates
  const reqHTML=reqs.length?`<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--t2);margin-bottom:6px">Open Requisitions</div>`+reqs.map(r=>{
    const rc=cands.filter(c=>c.recruitingId===r.id);
    const title=r.title||r.jdTitle||'(untitled requisition)';
    return `<div class="cd" style="padding:12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:baseline"><div style="font-size:13px;font-weight:700">${esc(title)}</div><span class="pf-pill ${r.status==='open'?'pf-ok':''}" style="font-size:11px">${esc(r.status||'open')}</span></div>
      ${rc.length?`<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">${rc.map(c=>`<div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 8px;background:var(--s2);border-radius:4px"><span>${esc(c.name||'—')}${c.clearance?` · <span style="color:var(--t3)">${esc(c.clearance)}</span>`:''}</span><span style="color:${stageCol[(c.status||'new').toLowerCase()]||'#64748b'};font-weight:700">${esc(stageLbl[(c.status||'new').toLowerCase()]||c.status||'new')}${c.salaryK?` · $${c.salaryK}K`:''}</span></div>`).join('')}</div>`:`<div style="font-size:11px;color:var(--t3);margin-top:6px">No candidates linked.</div>`}
    </div>`;
  }).join(''):'';
  // Resume bank
  const bankHTML=bank.length?`<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--t2);margin:14px 0 6px">Resume Bank <span style="color:var(--t3);font-weight:400">· ${bank.length}</span></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">${bank.map(b=>`<div class="cd" style="padding:10px 12px">
      <div style="font-size:12px;font-weight:700">${esc(b.name||'—')}</div>
      ${b.role?`<div style="font-size:11px;color:var(--t3)">${esc(b.role)}</div>`:''}
      <div style="font-size:11px;color:var(--t2);margin-top:4px">${[b.clearance,b.location,b.partner].filter(Boolean).map(esc).join(' · ')}</div>
      ${(b.skills&&b.skills.length)?`<div style="font-size:11px;color:var(--t3);margin-top:3px">${b.skills.slice(0,5).map(esc).join(', ')}</div>`:''}
    </div>`).join('')}</div>`:'';
  return funnel+reqHTML+bankHTML;
}

/* ── Resource Planning (allocation heatmap + availability) ── */
function _atlasResourcePlanningHTML(snap){
  const rp=snap.atlasComputed&&snap.atlasComputed.resourcePlanning;
  if(!rp||!rp.heatmap)return _atlasComputedEmpty(snap.atlasComputed&&snap.atlasComputed.rpError);
  const months=rp.months||[];
  const rows=(rp.heatmap||[]).filter(r=>(r.cells||[]).some(c=>c.pct>0)).sort((a,b)=>{
    const am=Math.max(...(a.cells||[{pct:0}]).map(c=>c.pct)),bm=Math.max(...(b.cells||[{pct:0}]).map(c=>c.pct));return bm-am;});
  const heat=`<div class="cd" style="padding:12px;margin-bottom:14px;overflow:auto">
    <div style="font-size:12px;font-weight:700;margin-bottom:8px">Allocation Heatmap <span style="font-size:11px;color:var(--t3);font-weight:400">· % allocated by month (red &gt;100, amber 85–100)</span></div>
    <table style="border-collapse:collapse;font-size:11px;white-space:nowrap">
      <thead><tr><th style="text-align:left;padding:3px 6px;position:sticky;left:0;background:var(--bg)">Resource</th>${months.map(mo=>`<th style="padding:3px 5px;color:var(--t3)">${esc(mo.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r=>`<tr><td style="padding:3px 6px;position:sticky;left:0;background:var(--bg)"><strong>${esc(r.name)}</strong><span style="color:var(--t3)"> · ${esc(r.dept||'')}</span></td>${(r.cells||[]).map(c=>{const col=_atlasAllocColor(c.pct);return `<td style="padding:0" title="${c.pct}%"><div style="background:${c.pct?col:'transparent'}22;color:${c.pct?col:'var(--t3)'};text-align:center;padding:3px 5px;font-weight:${c.pct>100?'800':'600'}">${c.pct||'·'}</div></td>`;}).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  const avail=(rp.availability||[]);
  const availHTML=avail.length?`<div class="cd" style="padding:12px"><div style="font-size:12px;font-weight:700;margin-bottom:8px">Availability Snapshot <span style="font-size:11px;color:var(--t3);font-weight:400">· first month with spare capacity</span></div>
    <table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="text-align:left;color:var(--t3)"><th style="padding:4px">Resource</th><th>Dept</th><th>Spare from</th><th>Status</th></tr></thead><tbody>
    ${avail.map(a=>`<tr style="border-top:1px solid var(--brd)"><td style="padding:4px">${esc(a.name)}</td><td style="color:var(--t3)">${esc(a.dept||'')}</td><td>${a.firstUnder?`${esc(a.firstUnder.label)} <span style="color:var(--t3)">(${a.firstUnder.pct}%)</span>`:'—'}</td><td>${a.furlough?`<span style="color:#dc2626;font-weight:700">${esc(a.furlough)}</span>`:(a.note?esc(a.note):'<span style="color:var(--t3)">—</span>')}</td></tr>`).join('')}
    </tbody></table></div>`:'';
  return heat+availHTML;
}

/* ── Capacity (forecast + profitability) ── */
function _atlasCapacityHTML(snap){
  const c=snap.atlasComputed&&snap.atlasComputed.capacity;
  if(!c)return _atlasComputedEmpty(snap.atlasComputed&&snap.atlasComputed.capacityError);
  const t=c.totals||{};
  const kpis=[{l:'Projected Revenue',v:_atlasMoney(t.revenue),col:'#16a34a'},{l:'Payroll',v:_atlasMoney(t.payroll),col:'#dc2626'},{l:'Profit',v:_atlasMoney(t.profit),col:(t.profit>=0?'#16a34a':'#dc2626')},{l:'Margin',v:(t.margin||0)+'%',col:'#3b82f6'},{l:'Utilization',v:(t.util||0)+'%',col:'#7c3aed'},{l:'Bench FTE',v:(t.benchFTE||0),col:'#f59e0b'},{l:'Headcount',v:(t.headcount||0),col:'#0ea5e9'},{l:'Over-allocated',v:(t.over||0),col:'#dc2626'}];
  const kpiHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(115px,1fr));gap:8px;margin-bottom:14px">${kpis.map(k=>`<div class="cd" style="padding:10px;text-align:center;border-left:3px solid ${k.col}"><div style="font-size:17px;font-weight:750;color:${k.col};line-height:1">${k.v}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">${k.l}</div></div>`).join('')}</div>`;
  // Forecast table
  const fc=c.forecast||[];
  const maxRev=Math.max(1,...fc.map(r=>r.revenue||0));
  const fcHTML=fc.length?`<div class="cd" style="padding:12px;margin-bottom:14px;overflow:auto"><div style="font-size:12px;font-weight:700;margin-bottom:8px">Revenue & Profit Forecast</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="text-align:right;color:var(--t3)"><th style="text-align:left;padding:4px">Month</th><th>Revenue</th><th>Project Payroll</th><th>Other Payroll</th><th>Overhead</th><th>Profit</th><th>Cumulative</th></tr></thead><tbody>
    ${fc.map(r=>`<tr style="border-top:1px solid var(--brd);text-align:right"><td style="text-align:left;padding:4px">${esc(r.label)}</td><td>${_atlasMoney(r.revenue)}</td><td style="color:#dc2626">${_atlasMoney(r.projectPayroll)}</td><td style="color:#dc2626">${_atlasMoney(r.otherPayroll)}</td><td style="color:#dc2626">${_atlasMoney(r.overhead)}</td><td style="color:${r.profit>=0?'#16a34a':'#dc2626'};font-weight:700">${_atlasMoney(r.profit)}</td><td style="color:${r.cum>=0?'#16a34a':'#dc2626'}">${_atlasMoney(r.cum)}</td></tr>`).join('')}
    </tbody></table></div>`:'';
  // Item profitability
  const projs=c.projects||[];
  const projHTML=projs.length?`<div class="cd" style="padding:12px;overflow:auto"><div style="font-size:12px;font-weight:700;margin-bottom:8px">Item Profitability <span style="font-size:11px;color:var(--t3);font-weight:400">· current month</span></div>
    <table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="color:var(--t3)"><th style="text-align:left;padding:4px">Item</th><th style="text-align:left">Category</th><th style="text-align:right">Revenue</th><th style="text-align:right">Cost</th><th style="text-align:right">Profit</th><th style="text-align:right">Margin</th><th style="text-align:right">FTE</th></tr></thead><tbody>
    ${projs.map(p=>`<tr style="border-top:1px solid var(--brd)"><td style="padding:4px">${esc(p.name)}</td><td style="color:var(--t3)">${esc(p.category)}</td><td style="text-align:right">${_atlasMoney(p.revenue)}</td><td style="text-align:right;color:#dc2626">${_atlasMoney(p.cost)}</td><td style="text-align:right;color:${p.profit>=0?'#16a34a':'#dc2626'};font-weight:700">${_atlasMoney(p.profit)}</td><td style="text-align:right">${p.margin}%</td><td style="text-align:right">${p.fte}</td></tr>`).join('')}
    </tbody></table></div>`:'';
  return kpiHTML+fcHTML+projHTML;
}

/* ── Proforma (financial model, read-only) ── */
function _atlasProformaHTML(snap){
  const P=snap.proforma;
  if(!P)return `<div class="cd" style="padding:24px;color:var(--t3);text-align:center">No proforma data in the snapshot.</div>`;
  const cp=snap.atlasComputed&&snap.atlasComputed.proforma;
  const co=P.company||{};
  let html='';
  // Computed + company KPIs
  const kpis=[];
  if(cp){if(cp.openingCash!=null)kpis.push({l:'Opening Cash',v:_atlasMoney(cp.openingCash),col:'#16a34a'});if(cp.debtService!=null)kpis.push({l:'Debt Service/mo',v:_atlasMoney(cp.debtService),col:'#dc2626'});if(cp.overheadMonthly!=null)kpis.push({l:'Overhead/mo',v:_atlasMoney(cp.overheadMonthly),col:'#d97706'});}
  if(co.monthlyRevenue!=null)kpis.push({l:'Monthly Revenue',v:_atlasMoney(co.monthlyRevenue),col:'#3b82f6'});
  if(co.monthlyProfit!=null)kpis.push({l:'Monthly Profit',v:_atlasMoney(co.monthlyProfit),col:'#16a34a'});
  if(co.fy27RevenueTarget!=null)kpis.push({l:'FY27 Target',v:_atlasMoney(co.fy27RevenueTarget),col:'#7c3aed'});
  if(kpis.length)html+=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:14px">${kpis.map(k=>`<div class="cd" style="padding:10px;text-align:center;border-left:3px solid ${k.col}"><div style="font-size:16px;font-weight:750;color:${k.col};line-height:1">${k.v}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">${k.l}</div></div>`).join('')}</div>`;
  const card=(title,inner)=>`<div class="cd" style="padding:12px;margin-bottom:12px"><div style="font-size:12px;font-weight:700;margin-bottom:8px">${esc(title)}</div>${inner}</div>`;
  const tbl=(cols,rows)=>`<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="color:var(--t3);text-align:left">${cols.map(c=>`<th style="padding:4px ${c.r?'4px;text-align:right':'4px'}">${esc(c.l)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr style="border-top:1px solid var(--brd)">${cols.map(c=>`<td style="padding:4px${c.r?';text-align:right':''}">${r[c.k]==null?'':esc(String(r[c.k]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const F=P.financials||{};
  if((F.cashTrajectory||[]).length)html+=card('Cash Trajectory',tbl([{l:'Period',k:'period'},{l:'Cash',k:'_cash',r:1},{l:'Status',k:'status'}],(F.cashTrajectory||[]).map(r=>({period:r.period||r.month||'',_cash:_atlasMoney(r.cash),status:r.status||''}))));
  if((P.scenarios||[]).length)html+=card('Scenarios',`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">${P.scenarios.map(s=>`<div style="padding:10px;background:var(--s2);border-radius:6px"><div style="font-size:12px;font-weight:700">${esc(s.name||'Scenario')}</div>${s.cashAtHorizon!=null?`<div style="font-size:11px;color:var(--t2);margin-top:3px">Cash @ horizon: <strong>${_atlasMoney(s.cashAtHorizon)}</strong></div>`:''}${s.gateTiming?`<div style="font-size:11px;color:var(--t3)">Gate: ${esc(s.gateTiming)}</div>`:''}${s.assumptions?`<div style="font-size:11px;color:var(--t3);margin-top:3px">${esc(s.assumptions)}</div>`:''}</div>`).join('')}</div>`);
  if((P.contractEconomics||[]).length)html+=card('Contract Economics',tbl([{l:'Contract',k:'contract'},{l:'Revenue',k:'_rev',r:1},{l:'Cost',k:'_cost',r:1},{l:'Profit',k:'_profit',r:1},{l:'Margin',k:'_margin',r:1},{l:'Role',k:'role'}],(P.contractEconomics||[]).map(r=>({contract:r.contract||'',_rev:_atlasMoney(r.rev),_cost:_atlasMoney(r.cost),_profit:_atlasMoney(r.profit),_margin:(r.margin!=null?r.margin+'%':''),role:r.role||''}))));
  if((P.dates||[]).length)html+=card('Critical Dates',tbl([{l:'Date',k:'date'},{l:'Event',k:'event'},{l:'Impact',k:'impact'},{l:'Status',k:'status'}],P.dates));
  if((P.risks||[]).length)html+=card('Risks',tbl([{l:'Risk',k:'risk'},{l:'Level',k:'level'},{l:'Status',k:'status'},{l:'Owner',k:'owner'},{l:'Mitigation',k:'mitigation'}],P.risks));
  if(P.debt&&(P.debt.total!=null||(P.debt.corporate||[]).length))html+=card('Debt',`${P.debt.total!=null?`<div style="font-size:11px;color:var(--t2);margin-bottom:6px">Total: <strong>${_atlasMoney(P.debt.total)}</strong>${P.debt.monthlyRange?` · monthly ${esc(String(P.debt.monthlyRange))}`:''}</div>`:''}${(P.debt.corporate||[]).length?tbl([{l:'Lender',k:'lender'},{l:'Balance',k:'_bal',r:1},{l:'Monthly',k:'_mo',r:1},{l:'Rate/Term',k:'rateTerm'},{l:'Status',k:'status'}],P.debt.corporate.map(d=>({lender:d.lender||'',_bal:_atlasMoney(d.balance),_mo:_atlasMoney(d.monthlyPayment),rateTerm:d.rateTerm||'',status:d.status||''}))):''}`);
  return html||`<div class="cd" style="padding:24px;color:var(--t3);text-align:center">Proforma model present but has no displayable sections.</div>`;
}

/* ── Reports (Atlas-rendered HTML) ── */
let _atlasRptOpen=null;
function _atlasReportsHTML(snap){
  const c=snap.atlasComputed;
  if(!c||!c.reports||!c.reports.length)return _atlasComputedEmpty(c&&c.reportsError);
  _atlasInjectRptCSS();
  const reports=c.reports;
  if(_atlasRptOpen){
    const r=reports.find(x=>x.key===_atlasRptOpen);
    if(r)return `<div style="margin-bottom:10px"><button class="btn btn-s" onclick="_atlasRptOpen=null;renderAtlas()">← All reports</button></div>
      <div class="cd atlas-rpt" style="padding:16px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h2 style="font-size:16px;font-weight:700">${esc(r.title)}${r.financial?' <span title="Financial report" style="font-size:11px;color:#d97706">$</span>':''}</h2><span style="font-size:11px;color:var(--t3)">${esc(r.area)}</span></div>${r.html||'<div class="rpt-empty">No content.</div>'}</div>`;
  }
  const byArea={};reports.forEach(r=>{(byArea[r.area]=byArea[r.area]||[]).push(r);});
  return Object.keys(byArea).map(area=>`<div style="margin-bottom:14px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--t2);margin-bottom:6px">${esc(area)}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px">
    ${byArea[area].map(r=>`<div class="cd" style="padding:12px;cursor:pointer" onclick="_atlasRptOpen='${r.key}';renderAtlas()">
      <div style="font-size:13px;font-weight:700">${esc(r.title)}${r.financial?' <span title="Financial" style="font-size:11px;color:#d97706">$</span>':''}</div>
      <div style="font-size:11px;color:var(--ac);margin-top:4px">Open report →</div></div>`).join('')}
    </div></div>`).join('');
}

/* ── PTO ── */
function _atlasPTOHTML(snap){
  const rows=[];
  (snap.departments||[]).forEach(d=>(d.members||[]).forEach(m=>{
    if((m.pto&&m.pto.length)||m.furloughDate)rows.push({name:m.name,dept:d.name,pto:m.pto||[],furlough:m.furloughDate||''});
  }));
  if(!rows.length)return `<div class="cd" style="padding:24px;color:var(--t3);text-align:center">No PTO or furlough entries recorded.</div>`;
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px">${rows.map(r=>`<div class="cd" style="padding:12px">
    <div style="font-size:13px;font-weight:700">${esc(r.name)}</div>
    <div style="font-size:11px;color:var(--t3);margin-bottom:6px">${esc(r.dept)}</div>
    ${r.furlough?`<div style="font-size:11px;color:#dc2626;font-weight:700;margin-bottom:4px">Furlough: ${esc(r.furlough)}</div>`:''}
    ${r.pto.length?r.pto.map(p=>`<div style="font-size:11px;color:var(--t2);padding:3px 0;border-top:1px solid var(--brd)">${esc(p.start||'?')} → ${esc(p.end||'?')}${p.note?` <span style="color:var(--t3)">· ${esc(p.note)}</span>`:''}</div>`).join(''):'<div style="font-size:11px;color:var(--t3)">No PTO logged</div>'}
  </div>`).join('')}</div>`;
}

/* ════════════════════════════════════════════════════════════════════════
   ATLAS — PROPOSALS VIEW
   ════════════════════════════════════════════════════════════════════════ */
const _PROP_STATUS_COLOR={'draft':'#64748B','in-review':'#0EA5E9','red-team':'#D97706','submitted':'#7C3AED','won':'#16A34A','lost':'#DC2626','no-bid':'#94A3B8'};
function _atlasProposalsHTML(snap){
  const props=(snap.proposals||[]).slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  if(!props.length)return `<div class="cd" style="padding:24px;color:var(--t3);text-align:center"><div style="font-size:13px;margin-bottom:6px">No proposals yet</div><div style="font-size:11px">Proposals authored in Atlas (with RFP intake, drafted sections, staffing matrix, etc.) will surface here.</div></div>`;
  const open=props.filter(p=>['draft','in-review','red-team'].includes(p.status)).length;
  const won=props.filter(p=>p.status==='won').length;
  const lost=props.filter(p=>p.status==='lost').length;
  const submitted=props.filter(p=>p.status==='submitted').length;
  const winRate=(won+lost)?Math.round(won/(won+lost)*100):0;
  const kpis=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px">
    <div class="cd" style="padding:11px;text-align:center;border-left:3px solid #0EA5E9"><div style="font-size:18px;font-weight:750;color:#0EA5E9;line-height:1">${open}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">In Progress</div></div>
    <div class="cd" style="padding:11px;text-align:center;border-left:3px solid #7C3AED"><div style="font-size:18px;font-weight:750;color:#7C3AED;line-height:1">${submitted}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">Submitted</div></div>
    <div class="cd" style="padding:11px;text-align:center;border-left:3px solid #16A34A"><div style="font-size:18px;font-weight:750;color:#16A34A;line-height:1">${won}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">Won</div></div>
    <div class="cd" style="padding:11px;text-align:center;border-left:3px solid #DC2626"><div style="font-size:18px;font-weight:750;color:#DC2626;line-height:1">${winRate}%</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">Win Rate</div></div>
  </div>`;
  const rows=props.map(p=>{
    const opp=p.opportunityId?(snap.projects||[]).find(x=>x.id===p.opportunityId):null;
    const c=_PROP_STATUS_COLOR[p.status]||'#64748b';
    const due=p.rfp&&p.rfp.dueDate;
    const dueChip=due?(()=>{const dd=new Date(due);if(isNaN(dd))return '';const days=Math.round((dd-Date.now())/86400000);if(days<0)return `<span style="font-size:11px;color:#dc2626;font-weight:700">${Math.abs(days)}d overdue</span>`;if(days<14)return `<span style="font-size:11px;color:#d97706;font-weight:700">due in ${days}d</span>`;return `<span style="font-size:11px;color:var(--t3)">due in ${days}d</span>`;})():'';
    const secCount=(p.sections||[]).filter(s=>(s.html||'').trim()).length;
    const totSec=(p.sections||[]).length;
    const ppMatches=(p.pastPerformance&&p.pastPerformance.matches)?p.pastPerformance.matches.length:0;
    const roles=(p.rfp&&p.rfp.requiredRoles)?p.rfp.requiredRoles.length:0;
    return `<div class="cd" style="padding:12px 14px;margin-bottom:8px;border-left:4px solid ${c};cursor:pointer" onclick="atlasOpenDrawer('proposal','${p.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:5px">
        <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:800">${esc(p.title)} ${_atlasAnnotIndicator('proposal',p.id)}</div>
        ${opp?`<div style="font-size:11px;color:var(--t3);margin-top:2px">${esc(opp.name)}${opp.customer?' · '+esc(opp.customer):''}</div>`:(p.rfp&&p.rfp.customer?`<div style="font-size:11px;color:var(--t3);margin-top:2px">${esc(p.rfp.customer)}</div>`:'')}</div>
        <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap"><span style="background:${c}22;color:${c};padding:2px 7px;font-size:11px;font-weight:700;border-radius:3px;letter-spacing:.4px;text-transform:uppercase">${esc(p.status)}</span>${dueChip}</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--t2)">
        <span>📝 ${secCount}/${totSec} sections</span>
        ${roles?`<span>👥 ${roles} roles</span>`:''}
        ${ppMatches?`<span>🎯 ${ppMatches} PP matches</span>`:''}
        ${p.rfp&&p.rfp.potentialValue?`<span>💰 ${_atlasMoney(p.rfp.potentialValue)}</span>`:''}
        ${p.llmProvider?`<span style="color:var(--t3)">LLM: ${esc(p.llmProvider)}${p.llmModel?'/'+esc(p.llmModel):''}</span>`:''}
      </div>
    </div>`;
  }).join('');
  return kpis+rows;
}

/* ════════════════════════════════════════════════════════════════════════
   ATLAS — CLASSIFICATION VIEW (Hub / SME / Associate / Proposal / Recruiter)
   ════════════════════════════════════════════════════════════════════════ */
const _ATLAS_CLASSIFICATIONS=[
  {k:'sme',l:'SME',c:'#7C5CBF',icon:'🎓'},
  {k:'hub',l:'Hub',c:'#0D9488',icon:'🌐'},
  {k:'associate',l:'Associate',c:'#D97706',icon:'🧰'},
  {k:'proposal',l:'Proposal',c:'#059669',icon:'📋'},
  {k:'recruiter',l:'Recruiter',c:'#7C3AED',icon:'🔎'}
];
function _atlasClassificationHTML(snap){
  const all=[];(snap.departments||[]).forEach(d=>(d.members||[]).forEach(m=>all.push({...m,_dept:d.name})));
  if(!all.length)return `<div class="cd" style="padding:16px;color:var(--t3);text-align:center">No resources to classify.</div>`;
  let html='';
  _ATLAS_CLASSIFICATIONS.forEach(c=>{
    const people=all.filter(m=>!!m[c.k]);
    if(!people.length)return;
    const cost=people.reduce((s,m)=>s+(m.cost||0),0);
    html+=`<div class="cd" style="padding:14px 16px;margin-bottom:14px;border-left:4px solid ${c.c}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
        <div style="font-size:14px;font-weight:800;letter-spacing:.3px;text-transform:uppercase;color:${c.c}">${c.icon} ${c.l}</div>
        <div style="font-size:11px;color:var(--t3)">${people.length} ${people.length===1?'person':'people'} · ${_atlasMoney(cost)}/mo</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
        ${people.map(m=>`<div class="cd" style="padding:10px 12px;cursor:pointer" onclick="atlasOpenDrawer('member','${m.id}')">
          <div style="font-size:12px;font-weight:700">${esc(m.name)} ${_atlasAnnotIndicator('member',m.id)}</div>
          <div style="font-size:11px;color:var(--t3)">${esc(m.role||'')}</div>
          <div style="font-size:11px;color:var(--t2);margin-top:3px">${_atlasMoney(m.cost)}/mo · ${esc(m._dept)}</div>
        </div>`).join('')}
      </div>
    </div>`;
  });
  // Unclassified
  const uncl=all.filter(m=>!_ATLAS_CLASSIFICATIONS.some(c=>m[c.k]));
  if(uncl.length){
    const cost=uncl.reduce((s,m)=>s+(m.cost||0),0);
    html+=`<div class="cd" style="padding:14px 16px;margin-bottom:14px;border-left:4px solid #94A3B8">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
        <div style="font-size:14px;font-weight:800;letter-spacing:.3px;text-transform:uppercase;color:#64748B">Unclassified</div>
        <div style="font-size:11px;color:var(--t3)">${uncl.length} · ${_atlasMoney(cost)}/mo</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
        ${uncl.map(m=>`<div class="cd" style="padding:10px 12px;cursor:pointer" onclick="atlasOpenDrawer('member','${m.id}')">
          <div style="font-size:12px;font-weight:700">${esc(m.name)}</div>
          <div style="font-size:11px;color:var(--t3)">${esc(m.role||'')}</div>
        </div>`).join('')}
      </div>
    </div>`;
  }
  return html||`<div class="cd" style="padding:16px;color:var(--t3);text-align:center">Nobody has classification flags set yet.</div>`;
}

/* ════════════════════════════════════════════════════════════════════════
   ATLAS — DETAIL DRAWER + ANNOTATIONS + SPAWN HELPERS
   ════════════════════════════════════════════════════════════════════════ */
function _atlasAnnotKey(type,id){return type+':'+id;}
function _atlasAnnotGet(type,id){return (D.atlasAnnotations||{})[_atlasAnnotKey(type,id)]||null;}
function _atlasAnnotIndicator(type,id){
  const a=_atlasAnnotGet(type,id);
  if(!a||!(a.notes||'').replace(/<[^>]+>/g,'').trim())return '';
  return '<span style="display:inline-block;background:#facc15;color:#78350f;font-size:9px;font-weight:800;padding:1px 5px;border-radius:3px;letter-spacing:.3px;margin-left:4px;vertical-align:middle" title="Has your notes">📝</span>';
}
function _atlasFindEntity(type,id){
  const snap=D.atlas||{};
  if(type==='project')return (snap.projects||[]).find(x=>x.id===id);
  if(type==='member'){for(const d of (snap.departments||[])){const m=(d.members||[]).find(x=>x.id===id);if(m)return Object.assign({},m,{_dept:d.name,_deptId:d.id});}return null;}
  if(type==='department')return (snap.departments||[]).find(x=>x.id===id);
  if(type==='activity')return (snap.activities||[]).find(x=>x.id===id);
  if(type==='proposal')return (snap.proposals||[]).find(x=>x.id===id);
  return null;
}
function atlasOpenDrawer(type,id){
  const e=_atlasFindEntity(type,id);
  if(!e){toast({type:'warn',title:'Item not found in current snapshot',msg:'Try pulling Atlas again.'});return;}
  _atlasDrawerState={type,id,tab:'details'};
  _atlasRenderDrawer();
}
let _atlasDrawerState=null;
function _atlasCloseDrawer(){_atlasDrawerState=null;_atlasRenderDrawer();}
function _atlasDrawerSetTab(t){if(!_atlasDrawerState)return;_atlasDrawerState.tab=t;_atlasRenderDrawer();}
function _atlasRenderDrawer(){
  let el=document.getElementById('atlas-drawer');
  if(!_atlasDrawerState){if(el)el.remove();return;}
  if(!el){el=document.createElement('div');el.id='atlas-drawer';el.style.cssText='position:fixed;inset:0;background:rgba(15,20,35,.5);backdrop-filter:blur(3px);z-index:2000;display:flex;justify-content:flex-end';el.onclick=function(ev){if(ev.target===el)_atlasCloseDrawer();};document.body.appendChild(el);}
  const {type,id,tab}=_atlasDrawerState;
  const e=_atlasFindEntity(type,id);
  if(!e){el.remove();return;}
  const a=_atlasAnnotGet(type,id)||{notes:'',tags:[],updatedAt:0};
  const titleMap={project:'Item',member:'Person',department:'Department',activity:'Task',proposal:'Proposal'};
  const typeLabel=e.category?(e.category.charAt(0).toUpperCase()+e.category.slice(1)):(titleMap[type]||type);
  const name=_atlasEntityName(type,e);
  const tabs=[{k:'details',l:'Details'},{k:'notes',l:'My Notes'+((a.notes||'').replace(/<[^>]+>/g,'').trim()?' ●':'')},{k:'spawn',l:'+ Create…'}];
  const tabBar=`<div style="display:flex;gap:2px;border-bottom:2px solid var(--brd);margin:0 16px">${tabs.map(t=>`<button onclick="_atlasDrawerSetTab('${t.k}')" style="background:transparent;border:none;padding:9px 14px;font-size:12px;font-weight:700;color:${tab===t.k?'var(--ac)':'var(--t2)'};cursor:pointer;border-bottom:2px solid ${tab===t.k?'var(--ac)':'transparent'};margin-bottom:-2px;font-family:inherit">${t.l}</button>`).join('')}</div>`;
  let body='';
  if(tab==='details')body=_atlasDrawerDetailsHTML(type,e);
  else if(tab==='notes')body=_atlasDrawerNotesHTML(type,id,a);
  else if(tab==='spawn')body=_atlasDrawerSpawnHTML(type,id,e);
  el.innerHTML=`<div style="background:var(--bg);width:680px;max-width:100%;height:100%;overflow-y:auto;box-shadow:-4px 0 24px rgba(0,0,0,.3);display:flex;flex-direction:column">
    <div style="padding:16px;border-bottom:1px solid var(--brd);display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--t3)">Atlas · ${esc(typeLabel)}</div>
        <div style="font-size:18px;font-weight:800;margin-top:3px">${esc(name)}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <a href="${ATLAS_PUBLIC_URL}" target="_blank" class="btn btn-s" style="height:28px;font-size:11px;text-decoration:none">↗ Atlas</a>
        <button class="btn btn-s" style="height:28px;font-size:11px" onclick="_atlasCloseDrawer()">✕</button>
      </div>
    </div>
    ${tabBar}
    <div style="flex:1;overflow-y:auto;padding:16px">${body}</div>
  </div>`;
}
function _atlasEntityName(type,e){
  if(type==='proposal')return e.title||'(untitled)';
  if(type==='activity')return e.subtask||'(untitled task)';
  return e.name||'(unnamed)';
}
function _atlasDrawerDetailsHTML(type,e){
  if(type==='project')return _atlasDetailsProject(e);
  if(type==='member')return _atlasDetailsMember(e);
  if(type==='department')return _atlasDetailsDept(e);
  if(type==='activity')return _atlasDetailsActivity(e);
  if(type==='proposal')return _atlasDetailsProposal(e);
  return '<div>Unknown type</div>';
}
function _atlasDetailsProject(p){
  const snap=D.atlas||{};
  const cost=(snap.departments||[]).reduce((sum,d)=>sum+(d.members||[]).reduce((s2,m)=>{const e=(m.projects||[]).find(x=>(typeof x==='object'?x.id:x)===p.id);if(!e)return s2;const pct=typeof e==='object'?(e.pct||100):100;return s2+Math.round((m.cost||0)*pct/100);},0),0);
  const team=[];(snap.departments||[]).forEach(d=>(d.members||[]).forEach(m=>{const e=(m.projects||[]).find(x=>(typeof x==='object'?x.id:x)===p.id);if(e)team.push({m,pct:typeof e==='object'?(e.pct||100):100,clinId:e&&e.clinId});}));
  const rev=p.revenue||p.targetRevenue||0;
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${_atlasFld('Category',p.category)}${_atlasFld('Customer',p.customer)}
      ${_atlasFld('Revenue',rev?_atlasMoney(rev)+(p.category==='project'?'/mo':' target'):'—')}
      ${_atlasFld('Assigned Cost',_atlasMoney(cost)+'/mo')}
      ${_atlasFld('Stage',p.stage)}${_atlasFld('Status',p.status)}
      ${_atlasFld('PM',p.pm)}${_atlasFld('OPR / Owner',p.opr)}
      ${_atlasFld('Potential',p.potential?_atlasMoney(p.potential):'')}
      ${_atlasFld('Close Date',p.closeDate)}
      ${_atlasFld('Contract Vehicle',p.leadGen||p.presales||p.sales||p.delivery)}
    </div>
    ${p.description?`<div style="margin-top:14px"><div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Description</div><div style="font-size:13px;color:var(--t1);line-height:1.55">${p.description}</div></div>`:''}
    ${p.revenueNote?`<div style="margin-top:10px;padding:8px 10px;background:var(--s2);border-radius:6px;font-size:12px;font-style:italic;color:var(--t2)">${esc(p.revenueNote)}</div>`:''}
    ${p.team?`<div style="margin-top:10px;font-size:12px"><b>Team:</b> ${esc(p.team)}</div>`:''}
    ${p.changeRequested?`<div style="margin-top:10px;padding:8px 10px;background:rgba(217,119,6,.08);border:1px solid rgba(217,119,6,.25);border-radius:6px;font-size:12px"><b>Change Requested:</b> ${esc(p.changeRequested)}</div>`:''}
    ${p.clins&&p.clins.length?`<div style="margin-top:14px"><div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">CLINs (${p.clins.length})</div>
      <table style="width:100%;font-size:11px;border-collapse:collapse"><thead><tr style="background:var(--s2)"><th style="text-align:left;padding:6px">#</th><th style="text-align:left;padding:6px">Title</th><th style="text-align:right;padding:6px">Revenue</th></tr></thead><tbody>
        ${p.clins.map(c=>`<tr><td style="padding:5px 6px;border-bottom:1px solid var(--bd1)">${esc(c.number||'')}</td><td style="padding:5px 6px;border-bottom:1px solid var(--bd1)">${esc(c.title||'')}</td><td style="padding:5px 6px;border-bottom:1px solid var(--bd1);text-align:right">${_atlasMoney(c.revenue)}/mo</td></tr>`).join('')}
      </tbody></table></div>`:''}
    ${team.length?`<div style="margin-top:14px"><div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Team (${team.length})</div>
      ${team.map(t=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--bd1);font-size:12px;cursor:pointer" onclick="atlasOpenDrawer('member','${t.m.id}')"><div><b>${esc(t.m.name)}</b><span style="color:var(--t3);margin-left:6px">${esc(t.m.role||'')}</span></div><div style="font-size:11px;color:var(--t3)">${t.pct}% · ${_atlasMoney(Math.round((t.m.cost||0)*t.pct/100))}/mo</div></div>`).join('')}
    </div>`:''}
    ${p.attachments&&p.attachments.length?`<div style="margin-top:14px"><div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Attachments (${p.attachments.length})</div>
      ${p.attachments.map(a=>`<div style="font-size:12px;padding:5px 0;border-bottom:1px solid var(--bd1)">${a.type==='file'?'📄':'🔗'} <a href="${esc(a.url)}" target="_blank" style="color:var(--ac);text-decoration:none">${esc(a.name||a.url)}</a></div>`).join('')}
    </div>`:''}`;
}
function _atlasDetailsMember(m){
  const snap=D.atlas||{};
  const skills=(m.skillsets||[]).map(id=>{const s=(snap.skillsets||[]).find(x=>x.id===id);return s?s.name:'';}).filter(Boolean);
  const certs=(m.certifications||[]).map(id=>{const c=(snap.certifications||[]).find(x=>x.id===id);return c?c.name:'';}).filter(Boolean);
  const locName=(snap.locations||[]).find(x=>x.id===m.location);
  const clrName=(snap.clearances||[]).find(x=>x.id===m.clearance);
  const projAssign=(m.projects||[]).map(e=>{const id=typeof e==='object'?e.id:e;const pct=typeof e==='object'?(e.pct||100):100;const p=(snap.projects||[]).find(x=>x.id===id);return {p,pct,id};}).filter(x=>x.p);
  const cls=[];if(m.sme)cls.push(['SME','#7C5CBF']);if(m.hub)cls.push(['Hub','#0D9488']);if(m.associate)cls.push(['Associate','#D97706']);if(m.proposal)cls.push(['Proposal','#059669']);if(m.recruiter)cls.push(['Recruiter','#7C3AED']);
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${_atlasFld('Role',m.role)}${_atlasFld('Department',m._dept)}
      ${_atlasFld('Monthly Cost',_atlasMoney(m.cost))}${_atlasFld('Reports To',m.reportsTo)}
      ${_atlasFld('Location',locName?locName.name:m.location)}${_atlasFld('Clearance',clrName?clrName.name:m.clearance)}
      ${_atlasFld('Badge',m.badge)}${_atlasFld('Flag',m.reassess?'⚠ Reassess':'')}
    </div>
    ${cls.length?`<div style="margin-top:10px;display:flex;gap:5px;flex-wrap:wrap">${cls.map(([l,c])=>`<span style="background:${c}22;color:${c};font-size:11px;font-weight:700;padding:3px 9px;border-radius:4px;letter-spacing:.4px;text-transform:uppercase">${l}</span>`).join('')}</div>`:''}
    ${skills.length?`<div style="margin-top:14px"><div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Skills</div><div style="display:flex;flex-wrap:wrap;gap:5px">${skills.map(s=>`<span style="background:rgba(14,165,233,.12);color:#0EA5E9;padding:3px 9px;border-radius:3px;font-size:11px;font-weight:600">${esc(s)}</span>`).join('')}</div></div>`:''}
    ${certs.length?`<div style="margin-top:10px"><div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Certifications</div><div style="display:flex;flex-wrap:wrap;gap:5px">${certs.map(c=>`<span style="background:rgba(13,148,136,.12);color:#0d9488;padding:3px 9px;border-radius:3px;font-size:11px;font-weight:600">${esc(c)}</span>`).join('')}</div></div>`:''}
    ${m.note?`<div style="margin-top:14px;padding:10px 12px;background:var(--s2);border-radius:6px;font-size:12px;color:var(--t2)">${esc(m.note)}</div>`:''}
    ${projAssign.length?`<div style="margin-top:14px"><div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Project Assignments (${projAssign.length})</div>
      ${projAssign.map(x=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--bd1);font-size:12px;cursor:pointer" onclick="atlasOpenDrawer('project','${x.id}')"><div><b>${esc(x.p.name)}</b><span style="color:var(--t3);margin-left:6px">${esc(x.p.category||'')}</span></div><div style="font-size:11px;color:var(--t3)">${x.pct}% · ${_atlasMoney(Math.round((m.cost||0)*x.pct/100))}/mo</div></div>`).join('')}
    </div>`:''}
    ${m.resumeLink?`<div style="margin-top:10px;font-size:12px">📎 <a href="${esc(m.resumeLink)}" target="_blank" style="color:var(--ac);text-decoration:none">Resume</a></div>`:''}
    ${m.attachments&&m.attachments.length?`<div style="margin-top:10px">${m.attachments.map(a=>`<div style="font-size:12px;padding:4px 0">${a.type==='file'?'📄':'🔗'} <a href="${esc(a.url)}" target="_blank" style="color:var(--ac);text-decoration:none">${esc(a.name||a.url)}</a></div>`).join('')}</div>`:''}`;
}
function _atlasDetailsDept(d){
  const members=d.members||[];
  const cost=members.reduce((s,m)=>s+(m.cost||0),0);
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${_atlasFld('Subtitle',d.subtitle)}${_atlasFld('Members',members.length)}
      ${_atlasFld('Total Cost',_atlasMoney(cost)+'/mo')}${_atlasFld('Accent',d.accent)}
    </div>
    ${members.length?`<div style="margin-top:14px"><div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Members</div>
      ${members.map(m=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--bd1);font-size:12px;cursor:pointer" onclick="atlasOpenDrawer('member','${m.id}')"><div><b>${esc(m.name)}</b><span style="color:var(--t3);margin-left:6px">${esc(m.role||'')}</span>${m.sme?' 🎓':''}${m.hub?' 🌐':''}</div><div style="font-size:11px;color:var(--t3)">${_atlasMoney(m.cost)}/mo</div></div>`).join('')}
    </div>`:''}`;
}
function _atlasDetailsActivity(a){
  const snap=D.atlas||{};
  const proj=a.projectId?(snap.projects||[]).find(x=>x.id===a.projectId):null;
  const prog=a.programId?(snap.programs||[]).find(x=>x.id===a.programId):null;
  const owners=(a.owners||[]).map(id=>{for(const d of (snap.departments||[])){const m=(d.members||[]).find(x=>x.id===id);if(m)return m;}return null;}).filter(Boolean);
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${_atlasFld('Status',a.status)}${_atlasFld('Phase',a.phase)}
      ${_atlasFld('Start',a.start)}${_atlasFld('Due',a.dueDate)}
      ${_atlasFld('PM',a.pm)}${_atlasFld('Kind',a.kind||'coe')}
      ${prog?_atlasFld('Program',prog.name):''}
      ${proj?_atlasFld('Project',proj.name):''}
      ${_atlasFld('Milestone',a.isMilestone?'◆ Yes':'')}${_atlasFld('Task Group',a.task)}
    </div>
    ${a.outline?`<div style="margin-top:14px"><div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Description</div><div style="font-size:13px;color:var(--t1);line-height:1.55">${a.outline}</div></div>`:''}
    ${a.objective?`<div style="margin-top:10px;padding:8px 10px;background:rgba(197,165,90,.08);border:1px solid rgba(197,165,90,.25);border-radius:6px;font-size:12px"><b>Next Steps:</b> ${esc(a.objective)}</div>`:''}
    ${owners.length?`<div style="margin-top:10px;font-size:12px"><b>Owners:</b> ${owners.map(m=>`<span style="cursor:pointer;color:var(--ac);text-decoration:underline;text-underline-offset:2px" onclick="atlasOpenDrawer('member','${m.id}')">${esc(m.name)}</span>`).join(', ')}</div>`:(a.ownerText?`<div style="margin-top:10px;font-size:12px"><b>Owners:</b> ${esc(a.ownerText)}</div>`:'')}
    ${a.updates&&a.updates.length?`<div style="margin-top:14px"><div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Status Updates (${a.updates.length})</div>
      ${a.updates.slice().reverse().map(u=>`<div style="padding:8px 10px;background:var(--s2);border-radius:6px;margin-bottom:5px;font-size:11px"><div style="color:var(--t3);font-size:11px">${esc(u.author||'—')} · ${new Date(u.ts).toLocaleString()}</div><div style="margin-top:3px">${esc(u.text)}</div></div>`).join('')}
    </div>`:''}
    ${a.attachments&&a.attachments.length?`<div style="margin-top:10px">${a.attachments.map(at=>`<div style="font-size:12px;padding:4px 0">${at.type==='file'?'📄':'🔗'} <a href="${esc(at.url)}" target="_blank" style="color:var(--ac);text-decoration:none">${esc(at.name||at.url)}</a></div>`).join('')}</div>`:''}`;
}
function _atlasDetailsProposal(p){
  const snap=D.atlas||{};
  const opp=p.opportunityId?(snap.projects||[]).find(x=>x.id===p.opportunityId):null;
  const tpl=p.templateId?(snap.taskTemplates||[]).find(x=>x.id===p.templateId):null;
  const rfp=p.rfp||{};
  const drafted=(p.sections||[]).filter(s=>(s.html||'').trim()).length;
  const total=(p.sections||[]).length;
  const c=_PROP_STATUS_COLOR[p.status]||'#64748b';
  const sectionsList=(p.sections||[]).map(s=>{
    const has=(s.html||'').replace(/<[^>]+>/g,' ').trim();
    return `<div style="border-bottom:1px solid var(--bd1);padding:9px 0">
      <div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:12px;font-weight:700">${esc(s.title)}${s.source==='ai'?' <span style="font-size:11px;color:#7C3AED;font-weight:700;letter-spacing:.3px;text-transform:uppercase">AI</span>':s.source==='computed'?' <span style="font-size:11px;color:#059669;font-weight:700;letter-spacing:.3px;text-transform:uppercase">computed</span>':''}</div><div style="font-size:11px;color:var(--t3)">${has?(s.html.replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean).length+' words'):'empty'}</div></div>
      ${has?`<div style="font-size:11px;color:var(--t2);margin-top:4px;line-height:1.5;max-height:80px;overflow:hidden;position:relative">${s.html}</div>`:''}
    </div>`;
  }).join('');
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px"><span style="background:${c}22;color:${c};font-size:11px;font-weight:800;padding:3px 9px;border-radius:4px;letter-spacing:.4px;text-transform:uppercase">${esc(p.status)}</span>${opp?`<span style="font-size:11px;color:var(--t2);cursor:pointer;text-decoration:underline" onclick="atlasOpenDrawer('project','${opp.id}')">↗ ${esc(opp.name)}</span>`:''}${tpl?`<span style="font-size:11px;color:var(--t3)">📄 ${esc(tpl.name)}</span>`:''}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${_atlasFld('Customer',rfp.customer)}${_atlasFld('Due Date',rfp.dueDate)}
      ${_atlasFld('Period of Performance',rfp.pop)}${_atlasFld('Potential Value',rfp.potentialValue?_atlasMoney(rfp.potentialValue):'')}
      ${_atlasFld('Contract Vehicle',rfp.contractVehicle)}${_atlasFld('Set-Aside',rfp.setAsideType)}
      ${_atlasFld('Sections',drafted+'/'+total+' drafted')}${_atlasFld('LLM',p.llmProvider?p.llmProvider+(p.llmModel?'/'+p.llmModel:''):'(account default)')}
    </div>
    ${rfp.summary?`<div style="margin-top:14px"><div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Summary</div><div style="font-size:13px;color:var(--t1);line-height:1.55">${esc(rfp.summary)}</div></div>`:''}
    ${rfp.scope?`<div style="margin-top:10px"><div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Scope</div><div style="font-size:12px;color:var(--t2);line-height:1.55">${esc(rfp.scope.slice(0,800))}${rfp.scope.length>800?'…':''}</div></div>`:''}
    ${(rfp.requirements||[]).length?`<div style="margin-top:10px"><div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Requirements (${rfp.requirements.length})</div><ul style="font-size:12px;color:var(--t2);padding-left:18px;line-height:1.55">${rfp.requirements.slice(0,10).map(r=>`<li>${esc(r)}</li>`).join('')}${rfp.requirements.length>10?`<li style="color:var(--t3)">…+${rfp.requirements.length-10} more</li>`:''}</ul></div>`:''}
    ${(rfp.requiredRoles||[]).length?`<div style="margin-top:10px"><div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Required Roles (${rfp.requiredRoles.length})</div>${rfp.requiredRoles.map(r=>`<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--bd1)"><b>${esc(r.title||'?')}</b> × ${r.count||1}${r.clearance?` · ${esc(r.clearance)}`:''}${r.location?` · ${esc(r.location)}`:''}</div>`).join('')}</div>`:''}
    ${total?`<div style="margin-top:14px"><div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Sections</div>${sectionsList}</div>`:''}
    ${p.pricing&&p.pricing.items&&p.pricing.items.length?`<div style="margin-top:14px"><div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Pricing — ${_atlasMoney(p.pricing.items.reduce((s,i)=>s+(i.fee||0),0))} total</div><div style="font-size:11px;color:var(--t3)">${p.pricing.items.length} line items · ${p.pricing.mode==='project-clins'?'pulled from CLINs':'manual'}</div></div>`:''}
    ${p.winLoss?`<div style="margin-top:14px;padding:10px 12px;background:${c}11;border:1px solid ${c}44;border-radius:6px"><div style="font-size:11px;font-weight:700;color:${c};text-transform:uppercase;letter-spacing:.4px">Win/Loss Debrief</div><div style="font-size:12px;color:var(--t2);margin-top:4px;line-height:1.55">${esc(p.winLoss.notes||'(no notes)')}</div></div>`:''}`;
}
function _atlasFld(label,val){if(val===null||val===undefined||val==='')return '';return `<div style="background:var(--s2);padding:7px 10px;border-radius:5px"><div style="font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--t3)">${esc(label)}</div><div style="font-size:12px;color:var(--t1);margin-top:2px">${esc(String(val))}</div></div>`;}

/* ── Annotations ── */
function _atlasDrawerNotesHTML(type,id,a){
  const key=_atlasAnnotKey(type,id);
  return `<div style="font-size:11px;color:var(--t3);margin-bottom:8px">Your private notes about this Atlas item. Stored in your LevelUp account — never synced back to Atlas. Updated ${a.updatedAt?new Date(a.updatedAt).toLocaleString():'never'}.</div>
    <textarea id="atlas-annot-textarea" style="width:100%;min-height:280px;padding:10px 12px;border:1.5px solid var(--brd);border-radius:7px;font-size:13px;font-family:inherit;background:var(--s1);color:var(--t1);line-height:1.55" placeholder="Add notes, observations, follow-ups...">${esc(a.notes||'')}</textarea>
    <div style="display:flex;gap:6px;margin-top:10px"><button class="btn btn-p" onclick="_atlasSaveAnnot('${type}','${id}')">💾 Save Notes</button>${a.notes?`<button class="btn btn-d" style="font-size:11px" onclick="_atlasClearAnnot('${type}','${id}')">Clear</button>`:''}</div>`;
}
function _atlasSaveAnnot(type,id){
  const ta=document.getElementById('atlas-annot-textarea');if(!ta)return;
  if(!D.atlasAnnotations)D.atlasAnnotations={};
  const key=_atlasAnnotKey(type,id);
  const txt=ta.value.trim();
  if(!txt){delete D.atlasAnnotations[key];}
  else{D.atlasAnnotations[key]={notes:txt,tags:(D.atlasAnnotations[key]&&D.atlasAnnotations[key].tags)||[],updatedAt:Date.now()};}
  save('atlasAnnotations');
  if(typeof _pushKeyToServer==='function')_pushKeyToServer('atlasAnnotations');
  toast({type:'success',title:'Notes saved'});
  _atlasRenderDrawer();
  if(curScreen==='atlas')renderAtlas();
}
function _atlasClearAnnot(type,id){
  if(!confirm('Clear your notes on this item?'))return;
  if(D.atlasAnnotations)delete D.atlasAnnotations[_atlasAnnotKey(type,id)];
  save('atlasAnnotations');
  if(typeof _pushKeyToServer==='function')_pushKeyToServer('atlasAnnotations');
  toast({type:'success',title:'Notes cleared'});
  _atlasRenderDrawer();
  if(curScreen==='atlas')renderAtlas();
}

/* ── Spawn into LevelUp (Note / Journal / Task) ── */
function _atlasDrawerSpawnHTML(type,id,e){
  return `<div style="font-size:12px;color:var(--t2);margin-bottom:14px">Create a LevelUp item linked back to this Atlas object. The link goes in the body so you can find it later via search or by jumping back to the Atlas item.</div>
    <div style="display:grid;grid-template-columns:1fr;gap:8px">
      <button class="btn btn-p" style="text-align:left;padding:12px 14px;height:auto" onclick="_atlasSpawnNote('${type}','${id}')">
        <div style="font-size:13px;font-weight:700">📝 Create LevelUp Note</div>
        <div style="font-size:11px;color:rgba(255,255,255,.8);margin-top:2px;font-weight:400">Long-form notes, ideas, research about this Atlas item</div>
      </button>
      <button class="btn btn-s" style="text-align:left;padding:12px 14px;height:auto" onclick="_atlasSpawnJournal('${type}','${id}')">
        <div style="font-size:13px;font-weight:700">📓 Add Journal Entry</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px;font-weight:400">A dated personal log entry referencing this item</div>
      </button>
      <button class="btn btn-s" style="text-align:left;padding:12px 14px;height:auto" onclick="_atlasSpawnTask('${type}','${id}')">
        <div style="font-size:13px;font-weight:700">✅ Create LevelUp Task</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px;font-weight:400">An actionable task with this Atlas item as context</div>
      </button>
    </div>`;
}
function _atlasSpawnRef(type,id,e){
  const name=_atlasEntityName(type,e);
  const typeLabel={project:'Item',member:'Person',department:'Department',activity:'Task',proposal:'Proposal'}[type]||type;
  return {name,typeLabel,refLine:`<p><i>From Atlas ${typeLabel}: <strong>${esc(name)}</strong> (id <code>${esc(id)}</code>)</i> — <a href="${ATLAS_PUBLIC_URL}" target="_blank">Open Atlas ↗</a></p>`};
}
function _atlasSpawnNote(type,id){
  const e=_atlasFindEntity(type,id);if(!e)return;
  const {name,typeLabel,refLine}=_atlasSpawnRef(type,id,e);
  const title=prompt('Note title:','Re: '+name);if(title===null)return;
  const note={
    id:'n_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
    title:title.trim()||('Re: '+name),
    bodyHtml:refLine+'<p></p>',
    folderId:'',pinned:false,starred:false,archived:false,color:'',
    tags:['atlas-'+type],
    atlasRef:{type,id,name},
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
  };
  if(!D.notes)D.notes=[];
  D.notes.unshift(note);
  save('notes');if(typeof _pushKeyToServer==='function')_pushKeyToServer('notes');
  toast({type:'success',title:'📝 Note created',msg:title.slice(0,80),actions:[{label:'Open',primary:true,onClick:()=>{_atlasCloseDrawer();nav('notes');setTimeout(()=>{if(typeof openNote==='function')openNote(note.id);else if(typeof _openNoteDrawer==='function')_openNoteDrawer(note.id);},150);}}]});
}
function _atlasSpawnJournal(type,id){
  const e=_atlasFindEntity(type,id);if(!e)return;
  const {name,typeLabel,refLine}=_atlasSpawnRef(type,id,e);
  const entry={
    id:'j_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
    date:new Date().toISOString().slice(0,10),
    title:'Re: '+name,
    bodyHtml:refLine+'<p></p>',
    mood:'',tags:['atlas-'+type],
    atlasRef:{type,id,name},
    createdAt:new Date().toISOString()
  };
  if(!D.journal)D.journal=[];
  D.journal.unshift(entry);
  save('journal');if(typeof _pushKeyToServer==='function')_pushKeyToServer('journal');
  toast({type:'success',title:'📓 Journal entry added',msg:name.slice(0,80),actions:[{label:'Open',primary:true,onClick:()=>{_atlasCloseDrawer();nav('journal');}}]});
}
function _atlasSpawnTask(type,id){
  const e=_atlasFindEntity(type,id);if(!e)return;
  const {name,typeLabel,refLine}=_atlasSpawnRef(type,id,e);
  const title=prompt('Task title:','Follow up on '+name);if(title===null)return;
  const task={
    id:'t_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
    title:title.trim()||('Follow up on '+name),
    notes:refLine,
    status:'todo',priority:'medium',due:'',startDate:'',myDay:false,
    tags:['atlas-'+type],
    atlasRef:{type,id,name},
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
  };
  if(!D.tasks)D.tasks=[];
  D.tasks.unshift(task);
  save('tasks');if(typeof _pushKeyToServer==='function')_pushKeyToServer('tasks');
  toast({type:'success',title:'✅ Task created',msg:title.slice(0,80),actions:[{label:'Open',primary:true,onClick:()=>{_atlasCloseDrawer();nav('tasks');}}]});
}
