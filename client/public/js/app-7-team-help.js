// LevelUp client, file 7 of 7: Team, activity feed, invites, Help Center and tours, Clusters dashboard, Settings page.
// Plain classic script: its top-level functions and variables are globals shared with the other files, and it must load in the order of scripts/lib/bundles.mjs (index.html loader). Split out of app-part1.js in build -234.
function renderTeam(){
  // Keep the owner member's name + email in sync with the logged-in user's
  // actual profile (D.creds) so old seed data like 'idris@levelup.app'
  // doesn't linger after sign-up.
  try{
    const realEmail=(D.creds&&D.creds.email)||'';
    const realName=(D.creds&&D.creds.userName)||'';
    if(realEmail||realName){
      let changed=false;
      D.teams.forEach(t=>{
        (t.members||[]).forEach(m=>{
          if(m.role==='Owner'||m.id===1){
            if(realName&&m.name!==realName){m.name=realName;changed=true;}
            if(realEmail&&m.email!==realEmail){m.email=realEmail;changed=true;}
          }
        });
      });
      if(changed)save('teams');
    }
  }catch(_){}
  // If the real workspace roster hasn't loaded yet, fetch it (it re-renders the
  // Team page on arrival) so invited accounts like new hires show up.
  if((!_workspaceMembers||!_workspaceMembers.length)&&typeof _loadWorkspaceMembers==='function')_loadWorkspaceMembers();
  // Other members' task stats come from the admin/owner shared pool — load it if
  // it hasn't loaded yet (it re-renders the Team page on arrival).
  if(!_sharedTasksLoaded&&typeof _loadSharedTasks==='function')_loadSharedTasks();
  // Merge the REAL accounts (from team.listMembers) with any local blob members,
  // deduped by name — so invited members (e.g. Lucas) appear, not just the
  // demo/blob roster. Real accounts win for id/email/role; blob supplies
  // color/avatar when present.
  const allMembers=(function(){
    const blob=D.teams.flatMap(t=>t.members||[]);
    const byName=new Map();
    for(const m of blob){ if(m&&m.name)byName.set(String(m.name).trim().toLowerCase(),m); }
    const out=[]; const seen=new Set();
    for(const u of (_workspaceMembers||[])){
      if(!u||!u.name)continue;
      const k=u.name.trim().toLowerCase(); if(seen.has(k))continue; seen.add(k);
      const b=byName.get(k)||{};
      out.push({...b,id:u.id,userId:u.id,name:u.name,email:u.email||b.email,role:b.role||u.role||'member',color:b.color||'#6366f1',avatar:b.avatar,lastSignedIn:u.lastSignedIn||null});
    }
    for(const m of blob){
      if(!m||!m.name)continue;
      const k=m.name.trim().toLowerCase(); if(seen.has(k))continue; seen.add(k);
      out.push(m);
    }
    return out;
  })();
  const today=_todayStr; // local — was UTC toISOString()
  function memberCard(m){
    // Per-member ownership. In the per-user blob model every task in a user's
    // blob belongs to that user, so the current user's tasks are ALL of D.tasks
    // (matching by createdBy name dropped tasks whose name string differed), and
    // other members' tasks come from the admin/owner shared pool D._sharedTasks
    // (tagged with _sharedFromUserId). Filtering only D.tasks by name is why
    // every other member showed 0 and the owner's card never matched the totals.
    const _meId=Number(D.creds&&D.creds.userId);
    const _isMe=(m.userId&&Number(m.userId)===_meId)||(m.name===(D.creds&&D.creds.userName));
    const tasks=_isMe?(Array.isArray(D.tasks)?D.tasks:[])
      :(m.userId&&Array.isArray(D._sharedTasks))?D._sharedTasks.filter(t=>!t._delegated&&Number(t._sharedFromUserId)===Number(m.userId))
      :_taskPool().filter(t=>t.createdBy===m.name);
    const done=tasks.filter(t=>t.status==='Done').length;
    const overdue=tasks.filter(t=>t.status!=='Done'&&t.due&&t.due<today).length;
    const habits=_isMe?(Array.isArray(D.habits)?D.habits:[]):D.habits.filter(h=>h.createdBy===m.name);
    const dailyHabits=habits.filter(h=>h.cadence==='Daily');
    const habitsDone=dailyHabits.filter(h=>h.doneToday).length;
    const topStreak=habits.reduce((max,h)=>Math.max(max,h.streak||0),0);
    const goals=_isMe?(Array.isArray(D.goals)?D.goals:[]):D.goals.filter(g=>g.createdBy===m.name);
    const avgGoalPct=goals.length?Math.round(goals.reduce((s,g)=>s+(g.pct||0),0)/goals.length):null;
    const initials=m.name.split(' ').map(w=>w[0]).join('');
    // Last seen + 7-day activity badge from activity feed data
    const memberFeedData=_activityFeedData.filter(a=>a.userName===m.name||a.userId===m.id);
    const sevenDaysAgo=new Date(Date.now()-7*24*60*60*1000);
    const weekActivity=memberFeedData.filter(a=>_pd(a.createdAt)>=sevenDaysAgo).length;
    // "Last seen" = the account's real last sign-in (updated on every login),
    // falling back to the most recent activity-feed entry, then "Never". The
    // feed alone missed pure logins, so an active user showed "Never".
    const lastActivityDate=memberFeedData.length?_pd(memberFeedData[0].createdAt):null;
    let lastSeenAt=null;
    if(m.lastSignedIn){const d=_pd(m.lastSignedIn);if(!isNaN(d))lastSeenAt=d;}
    if(lastActivityDate&&!isNaN(lastActivityDate)&&(!lastSeenAt||lastActivityDate>lastSeenAt))lastSeenAt=lastActivityDate;
    const lastSeenStr=lastSeenAt?timeAgo(lastSeenAt.toISOString()):'Never';
    const activityBadge=weekActivity>0?`<span style="font-size:11px;padding:2px 6px;border-radius:10px;background:var(--acs);color:var(--ac);font-weight:600;margin-left:4px">${weekActivity} this week</span>`:'';
    const avatarHtml=m.avatar
      ?`<img src="${m.avatar}" alt="${esc(m.name)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid var(--bd2)">`
      :`<div style="width:40px;height:40px;border-radius:50%;background:${m.color};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>`;
    const removeAvatarBtn=m.avatar?`<div onclick="event.stopPropagation();removeAvatarMember(${m.id})" title="Remove photo" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;background:var(--red);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;cursor:pointer;border:1px solid var(--bg);color:#fff;font-weight:700;line-height:1">×</div>`:'';
    return`<div class="cd" style="padding:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="position:relative;flex-shrink:0;cursor:pointer" title="Click to upload photo" onclick="uploadMemberAvatar(${m.id})">
          ${avatarHtml}
          <div style="position:absolute;bottom:0;right:0;width:14px;height:14px;background:var(--ac);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;cursor:pointer;border:1px solid var(--bg)">📷</div>
          ${removeAvatarBtn}
        </div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:600">${esc(m.name)}${activityBadge}</div>
          <div style="font-size:11px;color:var(--t3)">${m.role} · ${esc(m.email)}</div>
          <div style="font-size:11px;color:var(--t3);margin-top:2px">🕐 Last seen: ${lastSeenStr}</div>
        </div>
        ${(()=>{const r=(m.role||'').toLowerCase();const cfg=r==='owner'?{bg:'var(--purps)',c:'var(--purp)',label:'Owner'}:r==='admin'?{bg:'var(--acs)',c:'var(--ac)',label:'Admin'}:r==='viewer'?{bg:'rgba(100,116,139,.15)',c:'var(--t3)',label:'Viewer'}:{bg:'rgba(100,116,139,.12)',c:'var(--t2)',label:'Member'};return`<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${cfg.bg};color:${cfg.c};font-weight:600;letter-spacing:.3px">${cfg.label}</span>`;})()}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px">
        <div style="text-align:center;padding:6px;background:var(--s2);border-radius:6px"><div style="font-size:16px;font-weight:700;color:var(--ac)">${tasks.length}</div><div style="font-size:9px;color:var(--t3)">Tasks</div></div>
        <div style="text-align:center;padding:6px;background:var(--s2);border-radius:6px"><div style="font-size:16px;font-weight:700;color:var(--ok)">${done}</div><div style="font-size:9px;color:var(--t3)">Done</div></div>
        <div style="text-align:center;padding:6px;background:var(--s2);border-radius:6px"><div style="font-size:16px;font-weight:700;color:${overdue?'var(--red)':'var(--t3)'}">${overdue}</div><div style="font-size:9px;color:var(--t3)">Overdue</div></div>
        <div style="text-align:center;padding:6px;background:var(--s2);border-radius:6px"><div style="font-size:16px;font-weight:700;color:var(--warn)">🔥${topStreak}</div><div style="font-size:9px;color:var(--t3)">Streak</div></div>
      </div>
      ${dailyHabits.length?`<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:600;margin-bottom:4px">✅ Habits Today: ${habitsDone}/${dailyHabits.length}</div><div style="background:var(--s3);border-radius:3px;height:5px"><div style="background:var(--ok);height:100%;width:${dailyHabits.length?Math.round(habitsDone/dailyHabits.length*100):0}%;border-radius:3px"></div></div></div>`:''}
      ${avgGoalPct!==null?`<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:600;margin-bottom:4px">🎯 Goals Avg: ${avgGoalPct}%</div><div class="pb"><div class="f" style="width:${avgGoalPct}%;background:var(--ac)"></div></div></div>`:''}
      <div style="font-size:11px;font-weight:600;margin-bottom:4px">📋 Active Tasks</div>
      ${tasks.filter(t=>t.status!=='Done').slice(0,3).map(t=>`<div class="lr" style="padding:2px 0;font-size:11px" onclick="${t._shared?`_openSharedTaskView(${Number(t._idx)||0})`:`openDrawer('task',D.tasks.find(x=>String(x.id)===String(${_tidLit(t.id)})))`}"><div class="chk ${t.status==='Done'?'on':''}"></div><span class="rt">${esc(t.title)}</span><span class="pill ${pillClass(t.priority)}" style="font-size:9px">${t.priority}</span></div>`).join('') || '<div style="font-size:11px;color:var(--t3);padding:4px 0">No active tasks</div>'}
      ${memberFeedData.length?`<div style="margin-top:10px"><div style="font-size:11px;font-weight:600;margin-bottom:4px">🕐 Recent Activity</div>${memberFeedData.slice(0,3).map(a=>`<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:11px;color:var(--t2)"><span>${getActionIcon(a.action)}</span><span style="flex:1">${getActionLabel(a.action)}${a.entityTitle?' — '+esc(a.entityTitle):''}</span><span style="font-size:11px;color:var(--t3);white-space:nowrap">${timeAgo(a.createdAt)}</span></div>`).join('')}</div>`:''}
      ${isAdminOrOwner&&m.userId?`<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--bd1);display:flex;justify-content:flex-end"><button class="btn btn-s" style="height:24px;font-size:11px;color:var(--red);border-color:var(--red)" onclick="deleteTeamMember(${m.userId},'${_jsAttr(m.name||'this member')}')">🗑 Remove</button></div>`:''}
    </div>`;
  }
  const teamName=D.teams[0]?D.teams[0].name:'Team';
  // Check role from DB creds AND from local team member data (local data uses Owner/Admin, DB uses admin/user)
  const _localMemberRole=(D.teams.flatMap(t=>t.members).find(m=>m.name===D.creds.userName)||{}).role||'';
  const isAdminOrOwner=((D.creds.role||'').toLowerCase()==='admin'||(D.creds.role||'').toLowerCase()==='owner'||(_localMemberRole.toLowerCase()==='admin')||(_localMemberRole.toLowerCase()==='owner'));
  $('team-main').innerHTML=`<div class="ph-r" style="margin-bottom:16px"><div><h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('users',22,'var(--page-accent)')}Team Dashboard</h1><p style="font-size:12px;color:var(--t2)">${teamName} · ${allMembers.length} members</p></div>${isAdminOrOwner?'<button class="btn btn-p" onclick="showInvitePanel()">✉️ Invite Member</button>':''}</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px">${allMembers.map(m=>memberCard(m)).join('')}</div>
  <div id="invite-panel" class="admin-only" style="display:none;margin-top:24px">
    <div class="cd" style="padding:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h2 style="font-size:15px;font-weight:600;margin:0">✉️ Invite Team Members</h2>
        <button class="btn btn-s" style="height:26px;font-size:11px" onclick="document.getElementById('invite-panel').style.display='none'">× Close</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:8px;align-items:end;margin-bottom:16px">
        <div class="field" style="margin:0"><label style="font-size:11px">Email</label><input class="inp" id="inv-email" placeholder="colleague@company.com" style="height:32px"></div>
        <div class="field" style="margin:0"><label style="font-size:11px">Name (optional)</label><input class="inp" id="inv-name" placeholder="Jane Smith" style="height:32px"></div>
        <div class="field" style="margin:0"><label style="font-size:11px">Role</label><select class="inp" id="inv-role" style="height:32px"><option value="user">Member</option><option value="admin">Admin</option></select></div>
        <button class="btn btn-p" style="height:32px;font-size:12px;white-space:nowrap" onclick="sendInvite()">✉️ Send Invite</button>
      </div>
      <div id="invite-list-wrap"><div style="font-size:11px;color:var(--t3)">Loading invites...</div></div>
    </div>
  </div>
  <div id="activity-feed-section" class="admin-only" style="margin-top:24px">
    <div class="cd" style="padding:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h2 style="font-size:15px;font-weight:600;margin:0">📊 Team Activity Feed</h2>
        <div style="display:flex;gap:8px;align-items:center">
          <select class="inp" id="activity-filter-member" style="height:28px;font-size:11px;width:140px" onchange="filterActivityFeed()">
            <option value="">All Members</option>
          </select>
          <button class="btn btn-s" style="height:28px;font-size:11px" onclick="loadActivityFeed()">↻ Refresh</button>
        </div>
      </div>
      <div id="activity-feed-content">
        <div style="font-size:11px;color:var(--t3);padding:12px 0;text-align:center">Loading activity feed...</div>
      </div>
    </div>
    </div>`;
  // Team-wide totals = own tasks + every other member's tasks from the shared
  // pool (exclude _delegated: those are the current user's own tasks assigned
  // out, already present in D.tasks). Keeps the rail consistent with the cards.
  const _teamPool=(Array.isArray(D.tasks)?D.tasks:[]).concat((Array.isArray(D._sharedTasks)?D._sharedTasks:[]).filter(t=>!t._delegated));
  const totalTasks=_teamPool.length;
  const doneTasks=_teamPool.filter(t=>t.status==='Done').length;
  const overdueTasks=_teamPool.filter(t=>t.status!=='Done'&&t.due&&t.due<today).length;
  const habitsDoneToday=D.habits.filter(h=>h.doneToday&&h.cadence==='Daily').length;
  $('team-rail').innerHTML=`<div style="font-size:12px;font-weight:600;margin-bottom:8px">📊 Team Stats</div>
  <div class="stat"><div class="stat-n">${allMembers.length}</div><div class="stat-l">Members</div></div>
  <div class="stat"><div class="stat-n" style="color:var(--ok)">${doneTasks}</div><div class="stat-l">Tasks Done</div></div>
  <div class="stat"><div class="stat-n" style="color:${overdueTasks?'var(--red)':'var(--t3)'}">${overdueTasks}</div><div class="stat-l">Overdue</div></div>
  <div class="stat"><div class="stat-n" style="color:var(--ok)">${habitsDoneToday}</div><div class="stat-l">Habits Today</div></div>
  <div style="margin-top:12px;font-size:12px;font-weight:600;margin-bottom:6px">📊 Task Completion</div>
  <div class="pb"><div class="f" style="width:${totalTasks?Math.round(doneTasks/totalTasks*100):0}%;background:var(--ok)"></div></div>
  <div style="font-size:11px;color:var(--t2);margin-top:3px">${doneTasks} of ${totalTasks} tasks done</div>
  <div style="margin-top:12px;font-size:12px;font-weight:600;margin-bottom:6px">👥 Members</div>
  ${allMembers.map(m=>{const initials=m.name.split(' ').map(w=>w[0]).join('');const av=m.avatar?`<img src="${m.avatar}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0">`:`<div style="width:24px;height:24px;border-radius:50%;background:${m.color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>`;return`<div class="lr" style="padding:4px 0">${av}<div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:500">${esc(m.name)}</div><div style="font-size:11px;color:var(--t3)">${m.role}</div></div></div>`}).join('')}`;
  // Auto-load activity feed for admins
  if(D.creds.role==="Admin"||D.creds.role==="Owner"||D.creds.role==="admin")setTimeout(loadActivityFeed,100);
}

// ====== TEAM ACTIVITY FEED ======
let _activityFeedData = [];
let _activityFeedMembers = [];

const ACTION_ICONS = {
  login: '🔑',
  logout: '🚪',
  task_created: '✅',
  task_completed: '🏆',
  note_created: '📝',
  bookmark_created: '🔖',
  account_created: '👤',
  calendar_synced: '📅',
  default: '📌'
};

const ACTION_LABELS = {
  login: 'Logged in',
  logout: 'Logged out',
  task_created: 'Created a task',
  task_completed: 'Completed a task',
  note_created: 'Created a note',
  bookmark_created: 'Saved a bookmark',
  account_created: 'Joined the team',
  calendar_synced: 'Synced calendar',
  default: 'Activity'
};

function getActionIcon(action) {
  return ACTION_ICONS[action] || ACTION_ICONS.default;
}

function getActionLabel(action) {
  return ACTION_LABELS[action] || action.replace(/_/g, ' ');
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = _pd(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getInitials(name) {
  return (name || '?').split(' ').map(function(w) { return w[0]; }).join('').toUpperCase().slice(0, 2);
}

function renderActivityFeed(items) {
  const el = document.getElementById('activity-feed-content');
  if (!el) return;
  if (!items || items.length === 0) {
    el.innerHTML = '<div style="font-size:11px;color:var(--t3);padding:20px 0;text-align:center">No activity recorded yet. Activity will appear here as team members use the app.</div>';
    return;
  }
  const groups = {};
  items.forEach(function(item) {
    const d = item.createdAt ? _pd(item.createdAt) : new Date();
    const today = new Date();
    const yesterday = _pd(today); yesterday.setDate(today.getDate() - 1);
    let label;
    if (d.toDateString() === today.toDateString()) label = 'Today';
    else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday';
    else label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  });
  const html = Object.entries(groups).map(function([label, groupItems]) {
    const rows = groupItems.map(function(item) {
      const icon = getActionIcon(item.action);
      const actionLabel = getActionLabel(item.action);
      const initials = getInitials(item.userName);
      const entityHtml = item.entityTitle ? '<span style="color:var(--t2);font-style:italic"> — ' + esc(item.entityTitle) + '</span>' : '';
      const timeStr = timeAgo(item.createdAt);
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--bd1)">' +
        '<div style="width:28px;height:28px;border-radius:50%;background:var(--acs);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--ac);flex-shrink:0">' + initials + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:12px;font-weight:500">' + esc(item.userName || 'Unknown') + '</div>' +
          '<div style="font-size:11px;color:var(--t2)">' + icon + ' ' + actionLabel + entityHtml + '</div>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--t3);white-space:nowrap;flex-shrink:0">' + timeStr + '</div>' +
      '</div>';
    }).join('');
    return '<div style="margin-bottom:8px">' +
      '<div style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:0.05em;padding:6px 0;border-bottom:2px solid var(--bd2);margin-bottom:4px">' + label + '</div>' +
      rows +
    '</div>';
  }).join('');
  el.innerHTML = html;
}

async function loadActivityFeed() {
  const el = document.getElementById('activity-feed-content');
  if (!el) return;
  el.innerHTML = '<div style="font-size:11px;color:var(--t3);padding:12px 0;text-align:center">Loading...</div>';
  try {
    const result = await _trpc('activityFeed.getTeamFeed', { limit: 100 }, 'query');
    _activityFeedData = result.feed || [];
    _activityFeedMembers = result.members || [];
    const sel = document.getElementById('activity-filter-member');
    if (sel) {
      const currentVal = sel.value;
      sel.innerHTML = '<option value="">All Members</option>' +
        _activityFeedMembers.map(function(m) { return '<option value="' + m.id + '">' + esc(m.name) + '</option>'; }).join('');
      sel.value = currentVal;
    }
    renderActivityFeed(_activityFeedData);
  } catch (err) {
    el.innerHTML = '<div style="font-size:11px;color:var(--red);padding:12px 0;text-align:center">Could not load activity feed. Admin access required.</div>';
  }
}

function filterActivityFeed() {
  const sel = document.getElementById('activity-filter-member');
  const memberId = sel ? parseInt(sel.value) : 0;
  if (!memberId) {
    renderActivityFeed(_activityFeedData);
  } else {
    renderActivityFeed(_activityFeedData.filter(function(item) { return item.userId === memberId; }));
  }
}

// ====== TEAM INVITES ======
function showInvitePanel(){
  const panel=document.getElementById('invite-panel');
  if(!panel)return;
  panel.style.setProperty('display','block','important');
  loadInviteList();
}

async function loadInviteList(){
  const wrap=document.getElementById('invite-list-wrap');
  if(!wrap)return;
  try{
    const invites=await _trpc('teamInvites.list',null,'query');
    if(!invites||!invites.length){
      wrap.innerHTML='<div style="font-size:11px;color:var(--t3);padding:8px 0">No invites sent yet.</div>';
      return;
    }
    const now=Date.now();
    const rows=invites.map(inv=>{
      const expired=_pd(inv.expiresAt).getTime()<now;
      const status=inv.accepted?'<span class="pill" style="background:var(--oks);color:var(--ok);font-size:11px">✓ Accepted</span>'
        :expired?'<span class="pill" style="background:var(--s3);color:var(--t3);font-size:11px">Expired</span>'
        :'<span class="pill" style="background:var(--acs);color:var(--ac);font-size:11px">Pending</span>';
      const inviteUrl=inv.inviteUrl||(window.location.origin+'/invite/'+inv.token);
      const actions=inv.accepted?''
        :`<button class="btn btn-s" style="height:22px;font-size:11px" onclick="copyInviteLink('${_jsAttr(inv.token)}')" title="Copy invite link">📋 Copy Link</button>
          <button class="btn btn-s" style="height:22px;font-size:11px" onclick="resendInvite(${inv.id})" title="Regenerate token and extend expiry">🔄 Resend</button>
          <button class="btn btn-s" style="height:22px;font-size:11px;color:var(--red)" onclick="revokeInvite(${inv.id})" title="Revoke invite">🗑️ Revoke</button>`;
      return`<div class="lr" style="padding:8px 0;border-bottom:1px solid var(--bd1);gap:8px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:500">${esc(inv.email)}</div>
          <div style="font-size:11px;color:var(--t3)">${inv.name?esc(inv.name)+' · ':''}<span style="text-transform:capitalize">${inv.role}</span> · Expires ${_pd(inv.expiresAt).toLocaleDateString()}</div>
        </div>
        ${status}
        <div style="display:flex;gap:4px;flex-shrink:0">${actions}</div>
      </div>`;
    }).join('');
    wrap.innerHTML=`<div style="font-size:11px;font-weight:600;margin-bottom:6px;color:var(--t2)">${invites.length} invite${invites.length===1?'':'s'}</div>${rows}`;
  }catch(e){
    wrap.innerHTML=`<div style="font-size:11px;color:var(--red)">Error loading invites: ${esc(e.message)}</div>`;
  }
}

async function sendInvite(){
  const email=document.getElementById('inv-email')?.value.trim();
  const name=document.getElementById('inv-name')?.value.trim()||null;
  const role=document.getElementById('inv-role')?.value||'user';
  if(!email){toast('⚠ Email is required');return;}
  try{
    const inv=await _trpc('teamInvites.create',{email,name,role,expiryDays:7,origin:window.location.origin},'mutate');
    const inviteUrl=inv.inviteUrl||(window.location.origin+'/invite/'+inv.token);
    toast('✓ Invite created! Copying link...');
    await navigator.clipboard.writeText(inviteUrl).catch(()=>{});
    document.getElementById('inv-email').value='';
    document.getElementById('inv-name').value='';
    loadInviteList();
    // Show the link in a modal so admin can copy/share it
    const m=document.getElementById('modal-content');
    m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:12px">✉️ Invite Link Created</h2>
      <p style="font-size:12px;color:var(--t2);margin-bottom:10px">Share this link with <strong>${esc(email)}</strong>. It expires in 7 days.</p>
      <div style="display:flex;gap:6px;align-items:center">
        <input class="inp" value="${esc(inviteUrl)}" id="inv-link-box" readonly style="flex:1;font-size:11px">
        <button class="btn btn-p" style="height:32px;font-size:11px;white-space:nowrap" onclick="navigator.clipboard.writeText(document.getElementById('inv-link-box').value);toast('✓ Copied!')">📋 Copy</button>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
        <button class="btn btn-s" onclick="closeModal()">Close</button>
      </div>`;
    document.getElementById('modal-capture').classList.add('show');
  }catch(e){
    toast('⚠ '+e.message);
  }
}

function copyInviteLink(token){
  const url=window.location.origin+'/invite/'+token;
  navigator.clipboard.writeText(url).then(()=>toast('✓ Invite link copied!')).catch(()=>{
    prompt('Copy this invite link:',url);
  });
}

async function resendInvite(id){
  try{
    const updated=await _trpc('teamInvites.resend',{id,expiryDays:7,origin:window.location.origin},'mutate');
    const url=updated.inviteUrl||(window.location.origin+'/invite/'+updated.token);
    toast('✓ Invite regenerated! Copying new link...');
    await navigator.clipboard.writeText(url).catch(()=>{});
    loadInviteList();
    // Show new link
    const m=document.getElementById('modal-content');
    m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:12px">🔄 Invite Resent</h2>
      <p style="font-size:12px;color:var(--t2);margin-bottom:10px">New link for <strong>${esc(updated.email)}</strong>. Expires in 7 days.</p>
      <div style="display:flex;gap:6px;align-items:center">
        <input class="inp" value="${esc(url)}" id="inv-link-box2" readonly style="flex:1;font-size:11px">
        <button class="btn btn-p" style="height:32px;font-size:11px;white-space:nowrap" onclick="navigator.clipboard.writeText(document.getElementById('inv-link-box2').value);toast('✓ Copied!')">📋 Copy</button>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
        <button class="btn btn-s" onclick="closeModal()">Close</button>
      </div>`;
    document.getElementById('modal-capture').classList.add('show');
  }catch(e){
    toast('⚠ '+e.message);
  }
}

async function revokeInvite(id){
  if(!confirm('Revoke this invite? The link will stop working.'))return;
  try{
    await _trpc('teamInvites.delete',{id},'mutate');
    toast('✓ Invite revoked');
    loadInviteList();
  }catch(e){
    toast('⚠ '+e.message);
  }
}

async function deleteTeamMember(userId, memberName){
  if(!confirm(`Remove ${memberName} from the team? This action cannot be undone and will permanently delete their account.`))return;
  try{
    await _trpc('team.deleteMember',{userId},'mutate');
    toast('✓ '+memberName+' has been removed from the team');
    // Remove from local D.teams data
    D.teams.forEach(t=>{
      t.members=t.members.filter(m=>m.userId!==userId&&m.id!==userId);
    });
    save();
    renderTeam();
  }catch(e){
    toast('⚠ '+e.message);
  }
}
// ============================================================
// HELP CENTER
// ============================================================
// ─── LevelUp product knowledge for the AI surfaces ──────────────────────────
// The assistants answer questions about the APP, not just about the user's
// data. Rather than hard-coding a manual into every systemPrompt (there is a
// 4000-char server cap), they retrieve the relevant Help Center article on
// demand — so the Help Center stays the single source of truth and updating
// an article updates what the AI knows.

// Compact capability map. Kept deliberately terse: it is prepended to a prompt
// that also has to carry a workspace snapshot and the conversation so far.
var LU_AI_PRIMER=[
  'ABOUT LEVELUP — a personal second brain. Pages: Planner (decide today), Tasks (List/Board/Matrix/Gantt/Cards), Notes (rich text, [[wiki-links]], plus Sheets and Slides modes), Projects, Programs, Clusters, Command Center (what is on fire), Standup, Process/GTD (weekly sort-out), Goals, Habits, Journal, Money (accounts, budgets, bills, bank sync), Pipeline (deals), Ideas, Mind Maps, Knowledge Graph, Focus (pomodoro), Calendar, Mail, Team, Contacts, Reports, Bookmarks, Settings.',
  'RECOMMENDED RHYTHM — Daily AM: open Planner, check capacity, pick THREE My Day tasks. Daily PM: tick off honestly, capture loose ends (Ctrl/Cmd N), one Journal line with a mood. WEEKLY (the keystone): process the GTD inbox to zero, re-decide every overdue item, confirm each project has a next action, check goals moved, plan next week. Monthly: read Reports trends, reconcile Money, re-baseline goals, archive, hide unused pages. Overwhelmed? Settings > Workspace > detail level 1-2; nothing is deleted.',
  'COACHING STANCE — capture is cheap and sorting is deliberate; links between items are the point; reviews are what keep the workspace trustworthy. If someone has stopped using it, prescribe LESS surface and MORE review cadence, never more features.'
].join('\n');

// Score Help Center articles against a question and return a clamped excerpt.
// Title/summary/tag hits weigh more than body hits; the Routines category gets
// a nudge because that is what most 'what should I do' questions actually want.
// Crude suffix stripper — enough to make day/daily and overwhelmed/overwhelming
// meet, without pulling in a real stemmer.
function _luStem(w){
  // 'daily' is not prefixed by 'day' (the y becomes an i), so the -ily form has
  // to be undone explicitly or the single most common question in this app
  // — "what should I do every day" — never reaches the daily-routine article.
  if(w.length>4&&/ily$/.test(w))return w.slice(0,-3)+'y';
  if(w.length>4&&/ly$/.test(w))return w.slice(0,-2);      // weekly→week, monthly→month
  if(w.length>6&&/ing$/.test(w))return w.slice(0,-3);
  if(w.length>5&&/(ed|es)$/.test(w))return w.slice(0,-2);
  if(w.length>4&&/s$/.test(w)&&!/ss$/.test(w))return w.slice(0,-1);
  return w;
}
function _luTokens(s){
  return (String(s||'').toLowerCase().match(/[a-z]{3,}/g)||[]).map(_luStem);
}
// Match on WORDS, never on substrings. Substring matching scored 'display' as a
// hit for 'day', which is how "what should I do every day" once retrieved the
// Themes article. A short word may still prefix a longer one (day→daily).
function _luTokHit(list,w){
  for(var i=0;i<list.length;i++){
    var t=list[i];
    if(t===w)return true;
    var lo=t.length<w.length?t:w, hi=t.length<w.length?w:t;
    if(lo.length>=3&&hi.length-lo.length<=3&&hi.indexOf(lo)===0)return true;
  }
  return false;
}
function _luKnowledgeHits(q,budget){
  try{
    if(typeof HC_ARTICLES==='undefined'||!Array.isArray(HC_ARTICLES))return '';
    budget=budget||1100;
    var STOP={the:1,and:1,for:1,you:1,your:1,this:1,that:1,with:1,from:1,are:1,was:1,
      what:1,how:1,should:1,could:1,would:1,just:1,about:1,into:1,any:1,all:1,but:1,
      get:1,got:1,can:1,its:1,has:1,have:1,does:1,did:1,then:1,than:1,too:1,
      not:1,out:1,off:1,now:1,new:1,use:1,using:1,want:1,need:1,like:1,know:1};
    // Interrogatives carry position, not topic. Kept (they are real words in some
    // titles) but scored down, or "where do I start" outranks the onboarding
    // article on "Where does this go?" purely because of the word 'where'.
    var WEAK={where:1,when:1,why:1,which:1,who:1};
    var seen={},uniq=[];
    _luTokens(q).forEach(function(w){if(!STOP[w]&&!seen[w]){seen[w]=1;uniq.push(w);}});
    if(!uniq.length)return '';
    var scored=HC_ARTICLES.map(function(a){
      var title=_luTokens(a.title),
          summ=_luTokens(a.summary),
          tags=_luTokens((a.tags||[]).join(' ')),
          body=_luTokens(a.body);
      var sc=0,bodyHits=0;
      uniq.forEach(function(w){
        var weak=WEAK[w]?1:0;
        if(_luTokHit(title,w))sc+=weak?2:6;   // a title match is the strongest signal
        if(_luTokHit(tags,w))sc+=weak?1:4;
        if(_luTokHit(summ,w))sc+=weak?1:3;
        if(_luTokHit(body,w))bodyHits++;
      });
      // Cap the body's contribution: without this a long article wins on sheer
      // volume of incidental word hits rather than on being about the topic.
      sc+=Math.min(bodyHits,3);
      if(a.catId===14)sc+=3;                   // 'what should I do' usually means routines
      return {a:a,sc:sc};
    }).filter(function(x){return x.sc>=6;}).sort(function(x,y){return y.sc-x.sc;}).slice(0,2);
    if(!scored.length)return '';
    var out=[],used=0;
    for(var i=0;i<scored.length;i++){
      var a=scored[i].a;
      var txt=String(a.body||'').replace(/\s+/g,' ').trim();
      var room=Math.max(0,budget-used-80);
      if(room<200)break;
      out.push('HELP — '+a.title+': '+txt.slice(0,room));
      used+=out[out.length-1].length+2;
    }
    return out.join('\n\n');
  }catch(e){return '';}
}
// Does this read like a question about the APP rather than about the user's data?
function _luIsProductQuestion(q){
  return /\b(how|what should|when should|why|routines?|reviews?|habits?|workflows?|process|set ?up|setup|configure|best way|get(ting)? started|overwhelm\w*|declutter|simplif\w+|shortcuts?|tips?|guides?|explain|use)\b/i.test(String(q||''));
}
var HC_CATS=[
  {id:1,icon:'🚀',name:'Getting Started',desc:'First steps, onboarding, and orientation'},
  {id:2,icon:'✅',name:'Tasks & Projects',desc:'Manage tasks, projects, and deadlines'},
  {id:3,icon:'📅',name:'Calendar & Events',desc:'Scheduling, views, and time-blocking'},
  {id:4,icon:'📝',name:'Notes & Journal',desc:'Capture, organise, and review your thoughts'},
  {id:5,icon:'👤',name:'Contacts & CRM',desc:'Manage relationships and enrichment'},
  {id:6,icon:'⚙️',name:'Settings & Integrations',desc:'Connect accounts, configure preferences'},
  {id:7,icon:'✨',name:'AI & Automation',desc:'AI keys, chat assistant, AI-powered features'},
  {id:8,icon:'🎨',name:'Appearance & Themes',desc:'Theme presets, custom colours, scheduled profiles'},
  {id:9,icon:'📊',name:'Reports & Widgets',desc:'Build custom dashboards and schedule emails'},
  {id:10,icon:'🎯',name:'Command Center',desc:'Cross-tool PM dashboard, Standup, Programs, briefings'},
  {id:11,icon:'💼',name:'Sales Pipeline',desc:'Opportunities, stages, forecast, pipeline reports'},
  {id:12,icon:'💡',name:'Ideas & Thinking',desc:'Ideas lifecycle, Mind Maps, Focus, GTD, Knowledge Graph'},
  {id:13,icon:'🎛',name:'Your Workspace',desc:'Show only what you use — pages, sidebars, sections, and team layouts'},
  {id:14,icon:'⏱',name:'Routines & Mastery',desc:'Daily, weekly and monthly rhythms that make the app actually pay off'},
  {id:15,icon:'💰',name:'Money',desc:'Budgets, bills, bank sync, rules and the review inbox'},
];
var HC_ARTICLES=[
  {id:1,slug:'welcome',catId:1,title:'Welcome to LevelUp',summary:'A quick overview of every module and how they connect.',tags:['intro','overview'],tourId:1,body:`## Welcome to LevelUp\n\nLevelUp is your all-in-one **Second Brain Hub** — a single workspace for tasks, notes, calendar, mail, habits, goals, journal, and contacts.\n\n### Core Modules\n\n| Module | Purpose |\n|---|---|\n| **My Day** | Daily focus view with top tasks and schedule |\n| **Tasks** | Full task manager with AI decomposition |\n| **Notes** | Rich-text knowledge base with AI Q&A |\n| **Calendar** | Week/Day/Month views with drag-to-reschedule |\n| **Mail** | Unified inbox with AI smart replies |\n| **Habits** | Streak tracking with heatmap and coaching |\n| **Goals** | OKR-style goal tracking with AI alignment |\n| **Contacts** | CRM with Clodura enrichment |\n\n### Quick Start\n1. Open **My Day** to see today's focus\n2. Press **C** to quick-capture any thought\n3. Use **Cmd+K** to search across everything\n4. Press **?** to open this Help Center anytime`},
  {id:2,slug:'quick-capture',catId:1,title:'Quick Capture (Cmd+C)',summary:'How to capture any thought instantly without losing context.',tags:['capture','shortcut'],body:`## Quick Capture\n\nPress **C** anywhere in the app (when no input is focused) to open the Quick Capture modal.\n\n### Capture Types\n- **Task** — adds to your inbox with optional due date\n- **Note** — creates a new note in your Notes library\n- **Journal** — appends a timestamped entry to today's journal\n- **Idea** — sends to the Ideas board\n\n### Tips\n- Use **#tag** inline to auto-tag the item\n- Use **!** prefix for high-priority tasks (e.g. '! Call Sarah')\n- The capture modal remembers your last-used type`},
  {id:3,slug:'tasks-overview',catId:2,title:'Managing Tasks',summary:'Create, organise, and complete tasks with AI assistance.',tags:['tasks','ai','priority','views'],tourId:2,body:`## Managing Tasks\n\n### Creating a Task\nClick **+ Full Add Task** or use the **Quick add…** input at the top of the list. Quick-add supports inline syntax: \`Buy milk !high tomorrow #shopping @groceries\` sets priority, due date, tag, and context in one line.\n\n### The 7 views\nThe view switcher in the page header (small icons next to *Tools*):\n- **⚡ Focus** — execution surface: overdue / due today / in progress / My Day, with one-click ▶ Start and ⏱ Focus timer\n- **🎴 Cards** — responsive Pinterest-style grid; each card expands its subtasks inline as a checklist\n- **⬡ Clusters** *(default)* — group by cluster/area-of-work\n- **☰ List** — classic vertical rows with drag-to-reorder + full sort + group-by\n- **🗂 Board** — Kanban by status\n- **⊞ Matrix** — 2×2 priority×urgency (in *⋯ More*)\n- **📅 Gantt / 🗓 Calendar** — date-axis views (in *⋯ More*)\n\nYour view choice persists per device.\n\n### Sources & subtasks\nThe **SOURCES** chip row at the top filters Personal vs CF (Smartsheet) vs LSI (Nifty). Click a chip to toggle. **⤡ Fold all CF** collapses the CF project section headers.\n\nSubtasks from Smartsheet/Nifty appear indented under their parent with a ↳ glyph and a breadcrumb pill. CF rows from the 120-Day Plan show a 📁 *Project* pill that opens the LevelUp project drawer.\n\n### Sort & filter\nIn **List** view's *Sort:* dropdown: Manual (drag) / Title / Priority / Status / Start / Due / Created / **Source**. Priority defaults to descending. The Cards view honours the same sort.\n\n### AI features\n- **🧩 Decompose Goal** — paste a vague goal; AI returns subtasks\n- **⚠️ Risk Check** — flags tasks likely to miss their deadline\n- **✨ Auto-Priority** — re-scores all tasks by urgency × importance\n- **✨ AI Compose** (per-task) — drafts a description with rendered-markdown preview before insertion. Length is set by the chip in the AI bar.\n- **🧩 AI Suggest Subtasks** (per-task) — proposes 3-6 subtasks; pick which to add.\n\n### External task actions\nClick any external (CF/LSI) card to open the annotate modal: **✓ Mark Done in source** · **🚫 Hide in LevelUp** · **⏰ Snooze** · **☀ My Day** toggle · **✎ Annotate** local notes.`},
  {id:4,slug:'calendar-overview',catId:3,title:'Using the Calendar',summary:'Navigate Week, Day, and Month views and create events.',tags:['calendar','events'],body:`## Using the Calendar\n\n### Views\n- **Week** — 7-day grid with hourly slots\n- **Day** — single-day hourly grid with drag-to-reschedule\n- **Month** — full month with event chips\n\n### Creating Events\nClick any empty slot or press **+ New Event**. Fill in title, date, start/end time, location, and attendees.\n\n### Drag to Reschedule\nDrag any event or scheduled task to another day or hour in **Week** view (or another day in **Month**). On a phone or iPad, hold it for a moment, then drag. In **Day** view you can also drag the bottom edge to change how long it runs.\n\n### Repeating events\nIn **Repeat**, choose Daily, Every weekday, Weekly (pick the days), Monthly or Yearly, every N, and when it ends (never, on a date, or after N times). When you change or delete one, choose **This event**, **This and following events** or **All events**. Dragging one moves only that date. Recurring tasks with a time show their upcoming repeats faded.\n\n### Outlook (two-way)\nOnce Microsoft 365 is connected, Outlook is pulled every 15–20 minutes while LevelUp is open (switch it with **☁ Outlook auto/manual**). Moving, editing or deleting your own Outlook events here updates Outlook. Meetings with other attendees stay read-only here — change them in Outlook (**↗ Outlook**) so the attendees get the update. Tick **Also add to my Outlook calendar** on a new event to create it there too (no invitations are sent).\n\n### Time-blocking any day\nUnder the Week view, **Unscheduled tasks** lists your open tasks with no time. Drag one onto the calendar to schedule it, or click it (or a task’s 📅 button) to pick a free slot on any of the next two weeks.\n\n### Board\nOn the Tasks **Board**, drag a card to another column to change its status.\n\n\n### AI Features\n- **📋 Prep Brief** — generates a one-page brief before any meeting\n- **🗓 Optimise** — suggests moving meetings to protect focus blocks\n- **✏️ NL Create** — type a sentence like "Lunch with Sarah Tuesday noon" to create an event`},
  {id:5,slug:'notes-overview',catId:4,title:'Notes & Knowledge Base',summary:'Capture and connect your knowledge with rich text and AI.',tags:['notes','ai','rte','deep-insight'],body:`## Notes & Knowledge Base\n\n### Creating Notes\nClick **+ New Note**. The rich-text editor supports headings, bold/italic, lists, links, code blocks, and inline images (🖼 toolbar — file or URL, max 5 MB).\n\n### Writing — it saves itself\nThe open note is always editable: click into the title or the text and type. There is no Edit or Save button — the note saves a moment after you stop typing (the corner reads **Editing…**, then **Saved ✓**), and also when you switch notes, leave the page or close the tab. **Ctrl/Cmd+S** saves straight away. Notes reopens on the note you had open on this device, where you left it. Ctrl/Cmd+click a link in the text to open it. **⚙ Details** opens tags, source, icon, folder and links.\n\n### Deleting and the Trash\n**🗑** deletes the note with an **Undo** button. Deleted notes stay in the **Trash** for 30 days (Notes → Smart Folders → 🗑 Trash, or ⋯ More → Trash), where **↩ Restore** brings a note back with its tags, folder and links.\n\n### Pin, star, color, thumbnails\nEach note can be pinned (📌), starred (⭐), color-tagged (sticky dot), and auto-displays the first inline image as a thumbnail. Use **☑ Select** to enter bulk mode for batch tagging, exporting, or deletion.\n\n### Links between notes\nType **[[** and pick a note (or **＋ Create note** to make a new one) — the link appears as a chip; click it to open that note. A dashed chip points to a note that doesn't exist yet: click it to create it. Links follow a note when it's renamed. Backlinks appear in the **Linked references** panel of the linked note, and plain mentions of its title under **Unlinked mentions** (one click links them). Older notes' [[Title]] text turns into chips when you open them.\n\n### Searching notes\nThe search box above the notes list searches every word of every note — titles, tags and the full text — in all folders, ignoring case and accents. Type several words to find notes containing all of them; best matches come first (unless you've picked another sort), each card shows the passage that matched, and the matches are highlighted in the open note. Also: **\"exact phrase\"**, **-word** to leave notes out, **#tag** or **tag:name**, **title:word**.\n\n### The / menu\nType **/** at the start of a line (or after a space) for headings, bulleted and numbered lists, a **checklist** (click a box to tick it), quote, code block, divider, **table** (Tab moves between cells), image, today's date, a link to a note, or **Make this line a task** (creates a task linked to the note). Keep typing to filter, ↑↓ and Enter to pick, Esc to close. **#** suggests tags and adds the tag to the note.\n\n### AI Assistance bar\nEvery editor has an **✨ AI Assistance** bar with: **📝 Expand · 📌 Summarise · 🔗 Link Concepts · 🏷 Auto-tag · ❓ Key Questions**. The output renders formatted (headings/bullets/bold) in a preview pane — click **⬇ Insert into body** to drop the rendered HTML into your note. Use the **Length:** chip on the right to cycle Short ~80w → Medium ~200w → Long ~500w.\n\n### Note Deep Insight (per-note AI panel)\nOpen a note → **✨ Deep Insight**. AI reads the whole note (up to 6,000 chars) and returns: **Summary · Key points · Action items · Open questions · Related notes**. Each action item has a **+ Task** button that creates a native task pre-linked back to the note. Results are cached on the note so re-opening is instant.\n\n### One body\nA note has one body: the rich-text editor. What you see is what search, backlinks, the graph, AI tools and exports read. (Before October 2026 some screens also had a separate Markdown box; any text that only lived there and never showed now appears at the end of the note under a divider.)\n\n### History\nEvery note keeps its earlier versions on the server, the same on every device: the note as it was before each editing session (and every 10 minutes during a long one), before a teammate's edit, before a restore or a OneNote sync, and your own copy when another device's change won. Open a note → **🕐** to see them, compare (**Changes since** / **As it was**) and **↩ Restore**. Restoring keeps the current text in the history as well.\n\n### Import & Export\n**📥 Import Docs** accepts multiple PDF/Word/RTF/TXT files at once. **📤 Export** ships selected (or all) notes as a single Markdown bundle.`},
  {id:6,slug:'contacts-overview',catId:5,title:'Contacts',summary:'Manage your contact database with M365 sync and AI tools.',tags:['contacts','m365','crm'],body:`## Contacts\n\n### Primary sync: Microsoft 365\nConnect your M365 account (**Settings → Connected Accounts → Microsoft 365**) and use **🔄 Sync from O365** to pull your Outlook contacts. The **📥 Selective Import** picker lets you choose which folders to import (you don't have to take everything).\n\nLinkedIn CSV exports are still supported via **Import CSV**.\n\n### AI features\n- **💚 Health Score** — scores all contacts by recency of last contact, completion of follow-up tasks, and interaction frequency\n- **💬 Starters** — generates 3-5 conversation openers before a meeting, sourced from the contact's company news / role / shared notes\n- **🔍 Duplicates** — detects contacts that may be the same person (name fuzzy-match + email-domain match)\n\n### Activity log\nThe contact's detail drawer auto-aggregates every task tagged \`contact:<name>\`, every journal entry mentioning them, and every linked note. Use the **+ Task for this contact** button to add follow-ups that auto-link.\n\n### Clodura (legacy)\nIf you have a Clodura API key, you can still enrich contacts with verified email / phone / firmographic data. Add the key under **Settings → Integrations → Contact Enrichment**. Most teams now skip Clodura and rely on M365 sync alone.`},
  {id:7,slug:'settings-integrations',catId:6,title:'Settings & Integrations',summary:'Connect Microsoft 365, Google Workspace, and third-party tools.',tags:['settings','oauth','integrations'],body:`## Settings & Integrations\n\n### Connected Accounts\nGo to **Settings → Connected Accounts** to connect:\n- **Microsoft 365** — sync Calendar, Mail, and Contacts via Microsoft Graph\n- **Google Workspace** — sync Calendar and Google Contacts (Gmail not supported; use SMTP/IMAP for non-Microsoft mail)\n\nClick **Connect** and authorise via OAuth. Once connected, use the **Sync** buttons to pull data.\n\n### Clodura API Key\nGo to **Settings → Integrations → Contact Enrichment** to add your Clodura API key.\n\n### Webhook Integration\nGo to **Settings → Integrations → External Task Sync** to configure incoming webhooks from Zapier, Make, or any HTTP source.`},
  {id:8,slug:'habits-streaks',catId:1,title:'Habits & Streak Tracking',summary:'Build consistent habits with streak tracking, heatmaps, and AI coaching.',tags:['habits','streaks','ai'],body:`## Habits & Streak Tracking\n\n### Creating a Habit\nClick **+ Add Habit** and set a name, icon, cadence (Daily / 3x/week / Weekly), and target.\n\n### Streak Tracking\nCheck off a habit each day to build your streak. The heatmap shows the last 30 days — green for done, purple for skipped, grey for missed.\n\n### Cadence-Aware Streaks\n- **Daily** habits count consecutive days\n- **Weekly / 3x/week** habits count consecutive ISO weeks with enough completions\n\n### AI Features\n- **💜 Mood Correlation** — cross-references journal mood with habit completion\n- **🎯 Coaching** — suggests a more achievable cadence when a streak breaks\n- **📊 Wellbeing Report** — auto-generates a Sunday evening summary`},
  {id:9,slug:'goals-okr',catId:2,title:'Goals & OKR Tracking',summary:'Set and track goals with AI-powered progress narratives and alignment checks.',tags:['goals','okr','ai'],body:`## Goals & OKR Tracking\n\n### Creating a Goal\nClick **+ Add Goal** and set a title, description, target date, and linked tasks.\n\n### Progress Tracking\nGoal progress is calculated from linked task completion rates. The progress bar updates automatically.\n\n### AI Features\n- **✨ Progress** — generates a plain-English progress narrative for each goal\n- **📅 Review** — auto-populates a weekly review template with data from tasks, habits, and calendar\n- **🔗 Align** — analyses whether your daily tasks are actually moving your top-level goals forward`},
  {id:10,slug:'keyboard-shortcuts',catId:1,title:'Keyboard Shortcuts',summary:'Master LevelUp with keyboard shortcuts for every action.',tags:['shortcuts','keyboard','productivity'],body:`## Keyboard Shortcuts\n\nPress **?** anywhere to bring up the full shortcuts overlay in the app.\n\n### Universal\n| Shortcut | Action |\n|---|---|\n| **Cmd/Ctrl + K** | Command Palette (search + actions) |\n| **Cmd/Ctrl + J** | AI Chat Assistant |\n| **Cmd/Ctrl + N** | New task (Quick Add) |\n| **?** | Show the shortcuts overlay |\n| **Esc** | Close any modal / drawer / overlay |\n\n### Editing\n| Shortcut | Action |\n|---|---|\n| **Cmd/Ctrl + S** | Save (in editors) |\n| **Cmd/Ctrl + B** | Bold |\n| **Cmd/Ctrl + I** | Italic |\n| **Cmd/Ctrl + U** | Underline |\n| **Tab / Shift+Tab** | Indent / Outdent |\n\n### Image Lightbox\nClick any inline image in a note/journal/idea/goal to zoom.\n| Shortcut | Action |\n|---|---|\n| **← / →** | Previous / Next image |\n| **Esc** | Close lightbox |`},
  {id:11,slug:'command-palette',catId:1,title:'Command Palette (Cmd+K)',summary:'Jump to anything in the workspace and run actions.',tags:['palette','search','shortcut'],body:`## Command Palette\n\nPress **Cmd+K** (Mac) or **Ctrl+K** (Windows/Linux) anywhere in the app to open the command palette — a centered overlay that lets you:\n\n- **Navigate** to any page (Home, Tasks, Notes, Reports, Settings, etc.)\n- **Create** new items (Task / Note / Project / Goal / Journal / Idea / Bookmark / Habit)\n- **Run tools** — start a focus timer, toggle dark mode, reset theme, save current theme as profile\n- **Apply theme profiles** — every saved theme appears as an action\n- **Search your workspace** — fuzzy-matches across tasks, notes, ideas, contacts, bookmarks, goals, habits, projects\n\nThe empty state shows your **8 most recent actions** plus top picks for Navigate and Create.\n\nKeyboard: **↑ ↓** to move, **↵** to run, **Esc** to close.`},
  {id:12,slug:'ai-chat',catId:7,title:'AI Chat Assistant (Cmd+J)',summary:'Conversational AI with persistent memory and workspace context.',tags:['ai','chat','assistant'],body:`## AI Chat Assistant\n\nPress **Cmd+J** (or click the ⚡ icon in the topbar) to open the AI chat panel. It slides in from the right and stays open while you work; full-width on phones.\n\n### What makes it special\n- **Persistent memory** — the conversation thread is saved in your prefs and syncs across devices (last 50 messages kept).\n- **Workspace-aware** — every message ships a snapshot of your actual data: task counts, overdue items, top open tasks, goal progress, habit streaks, recent notes and journal entries. The model can answer "What are my top priorities today?" with specifics.\n- **Context-aware quick prompts** — chips at the bottom change based on the current screen. On Tasks: "Triage my inbox" / "What's blocking me?" On Notes: "Find related notes" / "Suggest tags".\n- **Markdown rendered live** — model output (headings, bullets, bold, links, code) renders formatted in the panel, not as raw text. This applies to every AI button across the app, not just chat.\n- **🗑 Clear** wipes the thread; auto-resizing textarea grows up to 6 lines.\n\n### Sister feature: Ask LevelUp (Cmd + /)\nThe ✨ button in the topbar (or **Cmd + /**) opens a one-shot Q&A overlay that searches *content* across your workspace (not just titles). Answers come back with **[1] [2] [3]** clickable citations that open the source object. Best for "Where did I write about…" or "Summarise everything I know about X" — single-question lookups rather than ongoing chats.\n\n### Requirements\nAn AI key configured in **Settings → AI Features**. The admin's keys are shared across the team automatically.`},
  {id:13,slug:'ai-keys',catId:7,title:'AI Provider Keys & Defaults',summary:'Configure OpenAI / Claude / Gemini, plus the workspace AI output length default.',tags:['ai','keys','providers','length'],body:`## AI Provider Keys & Defaults\n\nGo to **Settings → AI Features**.\n\n### 📏 Default AI output length\nThe top card sets how much text every AI button generates by default:\n- **📏 Short** — ~80 words / 3-5 sentences. Punchy, no fluff.\n- **📐 Medium** — ~200 words. Default. Light formatting when helpful.\n- **📋 Long** — ~500 words. Comprehensive, uses headings + bullets + bold.\n\nThe choice is persisted to your prefs and syncs across devices. You can override per-context using the **Length:** chip in each AI Assistance bar (Ideas / Notes / Journal / Journal drawer). Click the chip to cycle Short → Medium → Long — the change becomes the new default for everyone on that device.\n\n### 🔑 Provider keys\n- **OpenAI** (GPT-4o family) — platform.openai.com/api-keys\n- **Anthropic Claude** (claude-3-5-sonnet) — console.anthropic.com\n- **Google Gemini** — aistudio.google.com\n\nThe **Active Provider** segmented buttons at the top decide which one runs. The key for the chosen provider must be configured. Use **⚡ Test** to verify a key before saving.\n\n### Workspace-shared\nThe admin's keys are stored on the server and shared across the team — every member uses them transparently. Non-admin users see a 🔒 lock icon and cannot edit keys.`},
  {id:14,slug:'themes',catId:8,title:'Themes & Color Profiles',summary:'Customize every color, save profiles, schedule by time of day.',tags:['theme','colors','appearance'],body:`## Themes & Color Profiles\n\nOpen **Settings → 🎨 Appearance**. The theme system is fully per-user and syncs across devices.\n\n### Quick Presets\n8 curated starting points: 🌌 Default · 🎯 Deep Focus · 🌅 Sunset · 🌲 Forest · 📜 Paper · 🌙 Midnight Ink · 🌹 Rose · 🍵 Zen. Click any to apply.\n\n### Granular custom colors\n14 individual pickers grouped by Backgrounds / Text / Accent / Semantic. Every change applies live.\n\n### Per-page accents\n24 routes each have their own hue (Tasks=green, Notes=orange, Habits=emerald, etc.). Override any of them.\n\n### Typography\nFont family dropdown (System / Inter / Roboto / SF Pro / Segoe / Georgia / Times / Courier / JetBrains Mono / Lora) plus a 85%–130% size scale slider.\n\n### Saved profiles + scheduling\n**💾 Save Current as Profile** captures the active theme + page accents + font under a named profile. Then use **⏰ Schedule Profiles** to auto-switch by time of day: "Morning Focus 9–12am, Sunset 6–10pm". Supports overnight ranges and per-weekday rules. Scheduler checks every 60 seconds.`},
  {id:15,slug:'reports-builder',catId:9,title:'Custom Report Builder',summary:'Build dashboards from widgets — drag, resize, AI-generate.',tags:['reports','widgets','dashboard','pipeline'],body:`## Custom Report Builder\n\nGo to **Reports → + Add Widget** to build your own analytical dashboards.\n\n### The 5-slot widget model\nEvery widget is: **Source** × **Filter** × **Group By** × **Metric** × **Visualisation**. Sources available:\n- **Tasks** (native) / **Habits** / **Goals** / **Journal** / **Projects** / **Ideas** / **Bookmarks** / **Focus**\n- **External tasks** — CF (Smartsheet) + LSI (Nifty) rows\n- **Time entries (90d)** — every running-timer log, with day / week / month / project / source group-by\n- **Opportunities** — pipeline rows; group by stage / account / month-close / status\n\n### 8 viz types\n**KPI tile** · **Bar / Line** (time series) · **Donut** · **Heatmap** (date-grouped) · **Sparkline + total** · **Progress bars** · **Table**\n\n### Faster ways to build\n- **📚 Templates** — 20+ ready-made widgets (Tasks completed / Goals progress / Habit streaks / Focus minutes / **⏱ Time tracked by day** / **⏱ Time by project** / **💼 Pipeline by stage** / **💼 Quarterly bookings** / **💼 By customer**)\n- **✨ AI Build** — describe what you want; AI returns the widget config JSON\n- **Drag** widgets by their ⋮⋮ handle; **⤢ Size** resizes 3/4/6/8/12 cols\n\n### Saved reports + scheduled email\n**💾 Save Report** captures the current widget layout under a name. **⏰** on any saved-report pill schedules daily/weekly/monthly email delivery via the workspace SMTP account.\n\n### Pin to Home\n**📌** on any widget pins it to your Home dashboard so the chart greets you every morning.`},
  {id:16,slug:'image-insert',catId:4,title:'Inserting Images & URLs',summary:'Embed images and links in notes, journal, ideas, and goals.',tags:['images','notes','rte'],body:`## Inserting Images & URLs\n\nEvery rich-text editor (notes, journal entries, idea bodies, goal descriptions) has these toolbar buttons:\n\n- **🔗 Link** — prompts for a URL\n- **🖼 Insert Image (file or URL)** — paste an image URL, or leave blank to pick a file from your computer\n\n### Image limits\nUpload size capped at **5 MB**. Supported formats: JPEG, PNG, WebP, GIF, AVIF. Files are embedded inline as base64, so they travel with the note and work offline.\n\n### Lightbox\nClick any inline image in a note / journal / idea / goal / report to open a full-screen viewer. Use **← / →** to navigate between images in the same body, **Esc** to close.`},
  {id:17,slug:'bulk-import',catId:4,title:'Bulk Document Import & Bulk Actions',summary:'Import many PDFs/Word docs as notes at once + bulk-tag, star, delete.',tags:['import','bulk','notes'],body:`## Bulk Document Import\n\nOn the Notes page, click **📥 Import Docs** to select **multiple** PDF/Word/RTF/TXT files. They import sequentially with a single summary toast at the end.\n\n## Bulk Select Mode\n\nClick **☑ Select** in the Notes page header. Every note card grows a checkbox. Selected notes get an accent-tinted background.\n\n### Available bulk actions\n- **🏷 AI Auto-tag** — runs keyword + related-tag extraction on every selected note (no modal, no confirmation per note)\n- **+ Add Tag** — apply one tag to all selected\n- **⭐ Star** / **📌 Pin** — smart toggles\n- **⬇ Export** — concatenate selected notes into one Markdown download\n- **🗑 Delete** — single confirm\n- **✕ Done** — exit bulk mode`},
  {id:18,slug:'notification-sender',catId:6,title:'Secondary Email & Notification Sender',summary:'Configure SMTP/IMAP and pick which account sends notifications.',tags:['email','smtp','notifications'],body:`## Secondary Email Account & Notification Sender\n\n### Admin-managed\nIn LevelUp, the **admin** configures a secondary email account that handles outbound notifications for the entire team. Team members can't change this setting — they just receive notifications from whatever the admin sets.\n\n### Setup (admin only)\n1. Go to **Settings → Accounts → Secondary Email Account**\n2. Fill in SMTP host/port/credentials and IMAP host/port/credentials\n3. Test the connection\n4. Save\n5. Done — once saved, the secondary email automatically sends **all** system mail (Team invites, reports, notifications). The **System Notification Sender** picker below is optional, only needed to override which account sends\n\n### Per-user Microsoft 365\nEvery team member (admin and non-admin) can connect **their own** Microsoft 365 account for Calendar/Mail sync from Settings → Accounts → Microsoft 365 → Connect.`},
  {id:19,slug:'command-center',catId:10,title:'Command Center — your cross-tool PM cockpit',summary:'One screen for what is at risk, what shipped, and what to do next across CF + LSI + Personal.',tags:['command-center','pm','dashboard'],body:`## Command Center\n\nThe **Command Center** screen (left sidebar, amber bolt icon) is your cross-tool PM cockpit. It rolls native LevelUp tasks together with Smartsheet (CommunityForce) and NiftyPM (LSI Media) into one view.\n\n### The hat switcher\n\nThe four chips at the top right control scope:\n- **All hats** — everything in one view\n- **CF · 108** — Smartsheet-pulled tasks only\n- **LSI · 50** — Nifty-pulled tasks only\n- **Personal** — native LevelUp tasks only\n\nThe selection persists in \`D.prefs.ccContext\` across reloads. Every section below re-renders against the current hat.\n\n### What each section means\n\n- **KPI strip** — overdue / due today / stalled (no update in 7d+) / shipped (7d) / open total / time tracked (7d) / pending push. Click **Pending Push** to preview the queue.\n- **At Risk** — overdue → due-today → stalled, ordered worst first. Click an external row → opens the annotate modal; click a native row → opens the task drawer.\n- **By Stakeholder** — open work grouped by assignee. **Click a row** to jump to Tasks filtered by that assignee.\n- **By Project** — one tile per project label, color-coded by source. **Click a tile** to jump to Tasks filtered to that project + source.\n- **Recently Shipped (7d)** — every task with a \`completedAt\` stamp in the last week.\n- **Weekly Portfolio Briefing** (when generated) — see the separate "AI Portfolio Briefing" article.\n\n### Quick Actions (right rail)\n\n- **📝 Generate weekly briefing** — see "AI Portfolio Briefing"\n- **↻ Force sync now** — pull from Smartsheet + Nifty immediately\n- **⬆ Preview push queue** — only when there are queued status changes\n- **📋 Open Standup view** — see the "Daily Standup" article\n- **📊 Portfolio view** — opens the Programs page with the timeline\n- **📈 Build a widget** — Reports page (External and Time sources are PM-specific)\n- **⭐ Saved views** — see the "Saved Command Center Views" article\n\n### Sync status panel\n\nShows last pull time, CF / LSI row counts, and push queue status. Topbar carries the same info as a "synced Xm ago · 2 src" label next to the ↻ button.`},
  {id:20,slug:'standup-view',catId:10,title:'Daily Standup view',summary:'Yesterday / Today / Blockers — auto-generated, with a copy-to-clipboard markdown summary.',tags:['standup','daily','pm'],body:`## Daily Standup\n\nThe **Standup** screen (left sidebar, teal bar-chart icon) gives you a three-column standup view ready to paste into Slack / Teams / email.\n\n### What populates each column\n- **Yesterday** — tasks with \`completedAt\` whose date matches yesterday\n- **Today** — open tasks with due === today OR \`myDay\` flag set\n- **Blockers** — open tasks with a tag containing "block", status containing "block", or that are overdue\n\n### Hat-aware\n\nThe standup respects the **Command Center hat** — pick CF / LSI / Personal at the top and the columns scope instantly. The subtitle shows "Filtered to CF" when the hat isn't All.\n\n### Copy summary\n\nThe **📋 Copy** button copies a clean markdown block:\n\n\`\`\`\n*Standup — 2026-05-25*\n\n**Yesterday:**\n- [CF] Draft JDs for Salesforce/Tableau practice\n\n**Today:**\n- [LSI] Block IPs: LSI-Media\n- Setup Claude Code Skill: NotebookLM Skill\n\n**Blockers:**\n- [CF] Setup ClickUp For COE Implementation\n\`\`\`\n\nPaste into any chat channel. Falls back to \`document.execCommand('copy')\` if the Clipboard API is blocked.\n\n### Tips\n- Tag tasks with **#blocked** to surface them in the Blockers column even if their status doesn't contain "block"\n- Add a task to **My Day** to make it show up under Today even without a due date\n- The button **→ Command Center** in the header takes you back to the cockpit`},
  {id:21,slug:'portfolio-timeline',catId:10,title:'Portfolio Timeline (Programs page)',summary:'Swimlane gantt across every project that has dated tasks. Color-coded by source.',tags:['portfolio','gantt','timeline','programs'],body:`## Portfolio Timeline\n\nOn the **Programs** page, scroll past the program cards to see the **📅 Portfolio Timeline** — a swimlane gantt across every project that has at least one dated task.\n\n### Reading the chart\n- **Lanes** — one row per project. The leftmost column has the project name + open task count.\n- **Bars** — each dated task (native or external-linked) is a bar with start → due. Smartsheet bars are blue, Nifty bars purple, native bars use the project's color.\n- **Red border** — task is overdue\n- **Faded bars** — task is Done\n- **Vertical red line** — today\n- **Sticky month axis** — scrolls horizontally with the chart\n\n### Date window\n\nDefaults to **today − 14 days … today + 60 days**, but expands automatically if data goes further. The footer shows "N projects on chart · X hidden (no dates)".\n\n### What's hidden\n\nTasks without **both** a start date AND a due date can't be plotted. The footer counter shows how many were dropped. To fix: open the task drawer and add a due date.\n\n### Click a project label\n\nThe project name on the left of each lane is clickable — opens the project detail drawer, which includes the Project Health strip (velocity / burn / risk / ETA).`},
  {id:22,slug:'ai-briefing',catId:10,title:'AI Portfolio Briefing — weekly chief-of-staff summary',summary:'One-click AI summary of wins, risks, blockers, and the next 3 actions. Persisted + emailable.',tags:['ai','briefing','executive','weekly'],body:`## AI Portfolio Briefing\n\nClick **📝 Generate weekly briefing** in the Command Center right rail. The AI reads a snapshot of your current portfolio (counts + shipped 7d + overdue + stalled + hottest open) and returns a structured executive briefing:\n\n- **Headline** — one-sentence summary of the week\n- **🚀 Wins this week** — 3–5 shipped items with the "why" behind each\n- **⚠ Risks** — 3–5 items with a concrete suggested action for each\n- **🚧 Blockers** — what's stuck\n- **🎯 Next 3 actions** — what to do this week, in order\n\n### Hat-scoped\n\nThe briefing uses the current Command Center hat. Run it three times (CF, LSI, Personal) to get three focused briefings, or run "All hats" for an executive overview.\n\n### History\n\nEvery briefing is saved to \`D.prefs.briefings[]\` (last 24). Open **📚 History** in the card header to scroll past briefings; click any to load it back as the latest.\n\n### Email it\n\nThe **✉ Email** button ships an HTML version to your inbox via the existing self-delivery path. Use this to forward to a chief of staff, post into a Slack DM with yourself, or archive in email for week-over-week review.\n\n### What it costs\n\nOne AI call per generate (uses the admin's workspace AI key). The briefing card renders without consuming AI quota — only ↻ Refresh re-runs the model.`},
  {id:23,slug:'saved-cc-views',catId:10,title:'Saved Command Center views',summary:'Pin a hat as a one-click named view, with rename / delete management.',tags:['command-center','saved','views'],body:`## Saved Command Center Views\n\nClick **⭐ Save view** next to the hat chips to capture the current hat under a custom name. Saved views show up as a chip strip below the page title — up to 8 visible, the rest via **Manage**.\n\n### Workflow\n1. Pick a hat (e.g. CF)\n2. Click **⭐ Save view** and name it ("CF risks")\n3. The chip appears below the title\n4. One-click to apply later\n\n### Manage drawer\n\nFrom the chip row or the rail **⭐ Saved views** button, open the manager:\n- ✏ Rename\n- ✕ Delete\n- **+ Save current**\n\n### What it captures today\n\nThe hat only. Future iterations will add filter state (project / assignee) so a saved view restores a fully-configured drill-through.\n\n### Storage\n\n\`D.prefs.savedCCViews[]\` — synced across devices via the prefs blob. Capped at 12 entries.`},
  {id:24,slug:'time-tracking',catId:10,title:'Time tracking — Command Center tile + Reports',summary:'Sum of timer minutes (7d) on Command Center; full Time source in the Reports widget builder.',tags:['time','tracking','reports'],body:`## Time tracking\n\nEvery task drawer has a **▶/⏹** timer button. Each completed timer logs a row to the server \`time_entries\` table (per-user, audit-grade). LevelUp surfaces them in three places:\n\n### Command Center KPI\n\nThe **Time Tracked (7d)** tile in the KPI strip sums every entry started in the last 7 days, scoped to the current hat (CF / LSI / Personal / All). Hover the tile for the breakdown.\n\n### Reports source\n\nOpen **Reports → + Add Widget**. The Source dropdown now includes **Time entries (90d)**. Templates:\n- **⏱ Time tracked by day** (bar)\n- **⏱ Time by project** (bar)\n- **⏱ Time this week (KPI)** — single number, sum of minutes in last 7d\n- **⏱ Time by hat** (donut) — Personal / CF / LSI split\n\nGroupBy options: \`day(date)\` / \`week(date)\` / \`month(date)\` / \`project\` / \`sourceLabel\` / \`source\`. Metrics: \`sum(mins)\` / \`avg(mins)\` / count.\n\n### Drawer Actual line\n\nThe per-task drawer reads \`timeEntries.totalsByTask\` so the **Est 90m / Actual 67m (–26%)** line is always accurate, even after a device wipe.\n\n### How a timer works\n\n- One running timer per user, enforced server-side\n- Auto-stops the previous one if you start another\n- Survives a page reload via \`_restoreRunningTimer()\` on boot\n- The local counter (\`t.timeSpent\`) is the offline fallback — server is authoritative once you're online\n\n### Caps\n\nThe client cache (\`D.timeEntries\`) holds the last 90 days, capped at 2000 entries. Reports widgets within the 90d window are accurate; older data lives only in the server.`},
  {id:25,slug:'tasks-cards-view',catId:2,title:'Cards view — Tasks as a responsive grid',summary:'Pinterest-style task grid with subtasks expanded inline as checklists.',tags:['tasks','cards','views','subtasks'],body:`## Cards view\n\nThe **🎴 Cards** view (2nd icon in the Tasks view switcher, between ⚡ Focus and ⬡ Clusters) renders top-level tasks as compact cards in a responsive grid — ~3 columns on a widescreen, 2 on a tablet, 1 on a phone. Built to kill the long vertical scroll of List view.\n\n### Each card shows\n- **Priority-coloured left border** (red / amber / green)\n- Title + done checkbox\n- Pill row: priority pill (click to change) · status pill (click to change) · 📅 due chip\n- **Subtasks expanded as an inline checklist** with a progress bar. First 6 visible; "+N more…" when there are more. Toggle subtasks without opening the drawer.\n- Footer: project chip · assignee · \`›\` open\n\nClick the card body to open the full task drawer. The card itself is the new "list row."\n\n### Sources\nNative tasks + external (CF / LSI). External cards have a dashed border, source badge, and source-completion checkbox; clicking opens the annotate modal. Externals respect source-chip filtering just like List view.\n\n### Sorting\nCards honour the global sort from List view's Sort dropdown — set sort there (incl. **Source**), switch back to Cards, your sort persists. Default fallback: priority desc → due asc.\n\n### Why CSS columns, not Grid?\nThe layout uses \`column-width: 340px\`, not \`grid-template-columns\` — so cards pack flush without the dead row-height gaps that plagued the initial version. Reading order is top→bottom in column 1, then top→bottom in column 2, etc.`},
  {id:26,slug:'external-task-actions',catId:2,title:'External task actions (CF / LSI)',summary:'Mark Done in source, Hide, Snooze, My Day toggle, Annotate.',tags:['external','smartsheet','nifty','overrides'],body:`## External task actions\n\nTasks pulled from Smartsheet (CF) and NiftyPM (LSI) live alongside native tasks in every view. Click any external card to open the **Annotate** modal.\n\n### Buttons in the modal\n- **✓ Mark Done in <source>** — writes back to Smartsheet or Nifty via the source's API. Verified by re-read; the source-completion checkbox flips immediately. For Nifty: uses \`POST /tasks/{id}/complete\` with body \`{completed:true}\` — the only API call Nifty actually honours (PUT with \`completed:true\` silently fails).\n- **↺ Reopen in <source>** — appears when the task is currently Done\n- **🚫 Hide in LevelUp** — local-only tombstone (\`override.tombstoned=true\`); the row stays untouched in the source. Reappears only if you clear the tombstone.\n- **⏰ Snooze** — moves the task off active views until the snooze date\n- **☀ My Day** toggle — surfaces this external task on the Focus view + Standup Today column\n- **✎ Annotate** — adds local tags + notes that don't write back to the source\n\n### Subtask hierarchy\nSubtask rows render indented with a ↳ glyph + breadcrumb pill showing the parent's title. Nifty subtasks use \`parent_task_id\`; Smartsheet subtasks use the row's \`kind: "subtask"\` flag.\n\nThe CF 120-Day Plan sheet has Project headers + SubTask leaves with no intermediate Task rows — those subtasks show a 📁 *Project name* pill instead, which opens the matching LevelUp project's drawer.\n\n### "Sync subtasks" per Nifty watch\nIn **Settings → Integrations → Nifty**, each watched project has a "Sync subtasks" checkbox. Uncheck to pull only top-level tasks.`},
  {id:27,slug:'smartsheet-integration',catId:6,title:'Smartsheet integration (CF / CommunityForce)',summary:'Watched sheets, hierarchy, pipeline detection, push-back.',tags:['smartsheet','integration','external'],body:`## Smartsheet integration\n\nLevelUp pulls Smartsheet rows in as external tasks (or opportunities, when the sheet is pipeline-shaped). Setup lives at **Settings → Integrations → Smartsheet**.\n\n### Setup\n1. Get a Smartsheet API token from your Smartsheet account\n2. Paste it under Integrations\n3. Use **+ Add watched sheet** to register one or more sheets by Sheet ID\n4. **＋ Re-add CF watches** is a one-click button that re-registers the two CF defaults (120-Day Plan + Pipeline 2026/2027)\n\n### Sync cadence\nA cron runs every 5 minutes server-side; **↻ Force sync now** in Command Center triggers an immediate pull.\n\n### Two sheet shapes\nThe adapter auto-detects which shape each watched sheet has:\n- **Project / Task / SubTask hierarchy** — flows into Tasks. Outline level determines parent/child.\n- **Pipeline** — sheets with a Stage/Status column + a Value/Amount column flip to pipeline mode and become Opportunities. See "Pipeline Smartsheet sync."\n\n### Hierarchy quirks (CF 120-Day Plan)\nProject header rows + SubTask leaves with no intermediate Task rows. The adapter reads \`kind: "subtask"\` from each row's raw payload and shows them under a 📁 project pill in Tasks. Use **⤡ Fold all CF** in the Tasks header to collapse all CF project sections.\n\n### Diagnostics\n- **smartsheetInspectSheet** — server endpoint that returns the full column schema + which column each detector matched + a sample of 8 rows. Useful for "I added a column but it's not picking up."\n- **🧹 Reset historical** — stamps removedAt on every Smartsheet external_tasks row, then re-pulls only currently-open rows. Use after a major sheet restructure.\n\n### Push-back\nMarking an external task Done in LevelUp calls Smartsheet's setRowStatus API. Stage changes on Pipeline opportunities don't yet write back — pipeline push-back is a planned follow-up.`},
  {id:28,slug:'nifty-integration',catId:6,title:'NiftyPM integration (LSI / LSI Media)',summary:'Watched projects, subtask hierarchy, the real completion API.',tags:['nifty','integration','external'],body:`## NiftyPM integration\n\nLevelUp pulls Nifty tasks in as external tasks. Setup lives at **Settings → Integrations → Nifty**.\n\n### Setup\n1. Get a Nifty API token (Nifty workspace → API settings)\n2. Paste it under Integrations\n3. Use **+ Add Nifty watch** to register a project by Project ID\n4. Each watch has a **Sync subtasks** checkbox (default on)\n\n### Subtask hierarchy\nNifty subtasks carry a \`task\` field (string, points at parent's id). The adapter reads both \`task\` and the legacy \`parent_task_id\`. Subtasks render indented with ↳ + parent breadcrumb pill in every task view.\n\nWhen "Sync subtasks" is unchecked, the puller drops any row whose parent points at another tracked task — only top-level tasks come through.\n\n### Completion API (the real one)\nMarking a Nifty task Done uses \`POST /api/v1.0/tasks/{id}/complete\` with body \`{completed: true}\`. This is the **only** call Nifty actually honours. PUT with \`completed:true\` returns 200 "Successfully edited task" but silently ignores the write — discovered after 4 failed iterations and a 9-strategy diagnostic probe (\`niftyProbeCompletionWrites\`). Works for top-level tasks AND subtasks. To reopen, same endpoint with \`{completed:false}\`.\n\n### Diagnostics\n- **🔎 Inspect Nifty rows** — dumps each row's stored raw JSON\n- **🧹 Reset historical** — same pattern as Smartsheet: tombstone all + re-pull only currently-open\n- **niftyFetchTaskRaw / niftyFetchTaskGroups** — left in place for future API debugging`},
  {id:30,slug:'programs-portfolio',catId:10,title:'Programs & Portfolio',summary:'Top-level container that groups projects into programs with a portfolio timeline.',tags:['programs','portfolio','timeline'],body:`## Programs & Portfolio\n\nA **Program** is a named container for multiple projects (e.g., "Q4 Customer Onboarding" containing 5 projects). The Programs page (left sidebar, blue grid icon) lists every program with rolled-up KPIs.\n\n### Program cards show\n- Program name + owner\n- Child project count + total open tasks\n- Aggregate progress bar (sum of project progress weighted by task count)\n- Risk indicator — red if any child project is at risk, amber for caution, green for healthy\n- Click → opens the program drawer with the full child-project list\n\n### Portfolio timeline\nScroll past the program cards to find the **📅 Portfolio Timeline** — a swimlane gantt across every project that has at least one dated task. See the "Portfolio Timeline" article for full details.\n\n### Project Health (per-project)\nEach project drawer has a **Health** strip with: velocity (tasks closed / week) · burn rate · risk score · ETA based on velocity. AI Coach card suggests the top 3 actions for this project.\n\n### Creating a program\n**+ New Program** → fill in name, owner, target date. Then drag projects from the unassigned list into the program. A project can belong to at most one program.`},
  {id:31,slug:'pipeline-overview',catId:11,title:'Sales Pipeline — overview',summary:'Track opportunities, weighted forecast, and the next action to win each deal.',tags:['pipeline','sales','opportunities'],body:`## Sales Pipeline\n\nThe **💼 Pipeline** screen (left sidebar, green pyramid icon) is your first-class sales cockpit. Tracks Opportunities — distinct from Tasks — through stages from Lead to Closed/Won (or Closed/Lost).\n\n### Stages\nThe built-in stage progression (with probability %):\n- **Lead** (10%) · **Qualified** (25%) · **Proposal** (50%) · **Negotiation** (75%) · **On-Hold** (0%, non-terminal) · **Closed/Won** (100%, won) · **Closed/Lost** (0%, lost)\n\n### Three views\n- **Kanban** — one column per non-terminal stage, cards sorted by value desc. "Hide Closed Won/Lost" toggle (default on).\n- **Table** — full sortable table\n- **Forecast** — weighted-value-by-close-month horizontal bars + by-stage donut + Q-forecast banner\n- **📊 Reports** — see the dedicated "Pipeline Reports" article\n\n### Header KPIs\nPipeline Value · Weighted Forecast · Open Opps · Win Rate (calculated from terminal-stage history).\n\n### Adding opportunities\nThree ways:\n1. **+ New Opportunity** — manual entry\n2. **Smartsheet sync** — sheets with Stage/Status + Value/Amount columns auto-flow in. See "Pipeline Smartsheet sync."\n3. **Promote from Idea** — the 📁 AI Promote → Project button on an idea creates a project + tasks, and optionally an opportunity if the idea has a value estimate.\n\n### Right rail\nQuick Actions · Past-close-date warnings · Recent wins.\n\n### CommunityForce deals from Atlas\nEvery Atlas opportunity appears here automatically (🗺). Its name, customer, stage, value (potential), close date and owner (PM) follow Atlas — change them in Atlas. Your notes, probability, contact and linked tasks stay yours. Old Smartsheet copies of the same deals are taken over, not duplicated; a deal that disappears from Atlas is kept and marked ⊘.\n\n### Moving deals\nDrag a card to another stage on the Kanban (on a phone or iPad, hold it for a moment, then drag); a message offers **Undo**. Atlas deals don't drag. In a deal, **Link an existing task** attaches a task you already have; ✕ on a task unlinks it.`},
  {id:32,slug:'opportunities-lifecycle',catId:11,title:'Opportunities — lifecycle & drawer',summary:'Edit, link tasks, run AI Next Steps, mark Won/Lost.',tags:['opportunities','lifecycle','ai'],body:`## Opportunities\n\nClick any opportunity card to open its drawer.\n\n### Drawer sections\n- **Stage progression buttons** — one per stage; click to advance. Plus **Mark Won** / **Mark Lost** quick actions.\n- **Inline fields** (editable): name, account, value, probability override, close date, owner, contact, notes. **💾 Save changes** commits.\n- **Tasks to win this opportunity** — every \`D.tasks\` row with \`linkedOpportunityId === opp.id\`. Grouped by Open / Done. Click a task to open its drawer.\n- **+ New task for this opportunity** — stashes \`_faPrefill\` so the standard Quick Add modal carries the opp link through.\n- **✨ AI: Next steps** — calls the model with the opp snapshot + existing task titles. Returns headline + 3 actions, each with a **+ Add task** button.\n\n### Data model\nEach opp: \`{id, name, accountName, stage, value, probability, closeDate, owner, contact, notes, status: 'open'|'won'|'lost', linkedTaskIds, source: 'manual'|'smartsheet', externalId, externalUrl, createdAt, updatedAt}\`.\n\n### Probability override\nBy default each stage carries a built-in probability (10/25/50/75/100). Set the **Probability override** field on an opp to lock its forecast weight to a different number — useful when a 75%-stage deal has a known wrinkle that drops actual close-likelihood.\n\n### Smartsheet-sourced opps\nOpps pulled from Smartsheet keep \`source:'smartsheet'\` and \`externalId\`. Source-owned fields (name, stage, value, close, account, owner, contact) are overwritten on each sync; user-owned fields (notes, linkedTaskIds, manual probability override) are preserved.`},
  {id:33,slug:'pipeline-reports',catId:11,title:'Pipeline Reports — 4 cards',summary:'By Customer · Stage Aging · Quarterly Bookings · Coverage.',tags:['pipeline','reports','forecast'],body:`## Pipeline Reports\n\nThe **📊 Reports** view button on the Pipeline page (alongside Kanban / Table / Forecast) renders a 2-col responsive grid of four analytical cards.\n\n### 🏢 By Customer / Agency\nGroups opps by accountName. Per-row: open count · total $ · weighted $ · historical win rate (when ≥1 closed deal exists for that account) · W·L track record. Sorted total-open descending.\n\n### ⏱ Stage Aging\nAverage days at current stage per non-terminal stage (\`now - updatedAt\`). Aging badges go amber at 60d, red at 90d. The "Stalled (60d+)" list shows the oldest 8 stalled deals; click to open the drawer.\n\n*Caveat*: aging is approximated by \`updatedAt\` rather than a real per-stage history log. For federal sales cycles (slow) this is fine; for fast cycles, a future enhancement will add a \`stageHistory: [{stage, enteredAt}]\` array.\n\n### 📅 Quarterly Booking (next 90d)\nOpen opps with closeDate in today → today+90d. One bar per close month showing count + total $ + weighted $. The banner sums weighted $ for the next-quarter forecast.\n\n### 🎯 Pipeline Coverage\nTotal open $ ÷ user-configured quota. Colour-coded vs target (3x = healthy, 60% gap = caution, more = red). Click **⚙ Configure quota** to set amount / period label / coverage target (default 3x). \`D.prefs.pipelineQuota.{amount, periodLabel, coverageTarget}\`.\n\n### When to use which\n- Strategic review → By Customer\n- "What's stuck?" → Stage Aging\n- Sales-ops forecast meeting → Quarterly + Coverage\n\n### Won this period, Funnel, Won and lost\n**🏆 Won** totals deals won in the quota period (by the day each was won) against your quota, with the win rate. **🔻 Funnel** shows how many deals reached each stage, from their stage history. **⚖ Won and lost** shows the last 12 months by the month deals closed, and how long won deals took.`},
  {id:34,slug:'pipeline-smartsheet-sync',catId:11,title:'Pipeline Smartsheet sync — single-stage + multi-stage layouts',summary:'How LevelUp detects a Smartsheet sheet is pipeline-shaped (not project-shaped).',tags:['pipeline','smartsheet','sync','adapter'],body:`## Pipeline Smartsheet sync\n\nWhen you add a Smartsheet to your watched list, the adapter auto-detects whether it's pipeline-shaped. Minimum signal: **Stage column + Value column**. Pipeline mode wins over hierarchical (Project/Task) mode when both signals coexist.\n\n### Two supported layouts\n- **Single-stage** (winning shape): explicit Stage/Status column + Value/Amount column. Per-row stage = cell value, normalised via \`canonicalise()\` (handles slashes/hyphens/underscores so "Closed/Won" matches "Closed Won").\n- **Multi-stage progression**: 2+ PICKLIST columns whose titles match the stage dictionary (Lead Gen, Presales, Discovery, Sales, Proposal, Negotiation, Delivery…). Per-row stage = rightmost-occupied column's standard name. Value column optional.\n\nA single sheet can have both layouts active — the adapter prefers single-stage row-by-row and falls back to multi-stage only when the Status cell is empty.\n\n### Column matchers (regex-broad)\n- **Stage**: Stage / Status / Phase / Pursuit Stage / Capture Stage / Funnel Stage / Sales Stage\n- **Value**: any word-prefix + (Value / Amount / $) — Potential $, Estimated Value, Contract Value, ACV/TCV/ARR/MRR…\n- **Close**: expected / target / exp / projected + Close / Close Date\n- **Account**: Account / Customer / Company / Client / Agency / Prime (federal contracting)\n- **Opportunity name**: Program / Project / Opportunity / Title / Deal / Name / Product\n- **Owner**: Owner / Sales Owner / AE / Account Executive / Rep / PM / Capture Manager\n\n### Diagnostic: smartsheetInspectSheet\nReturns the full column schema + per-column "matchedAs" verdict + detected layout. Use when "I added a column but it's not picking up." Confirmed live for CF: \`{layout:'single', matches:{stage:'Status', value:'Potential $', close:'Exp Close Date', account:'Customer', oppName:'Program', owner:'PM'}}\`.\n\n### Orphan cleanup\nWhen a sheet flips from task-mode to pipeline-mode (e.g., user added Status + Potential $ columns mid-flight), previously-pulled \`external_tasks\` rows are deleted before opps upsert.`},
  {id:35,slug:'ideas-overview',catId:12,title:'Ideas — capture, develop, decide',summary:'The 4-stage lifecycle for evaluating an idea before committing time.',tags:['ideas','lifecycle','capture'],body:`## Ideas\n\nThe **Ideas** screen (left sidebar, yellow lightbulb) is where raw thoughts go to mature. Each idea moves through 4 stages before becoming a project (or getting parked/killed).\n\n### The 4 stages\n- **🌱 Spark** — fresh idea, minimal context. Just title + maybe one paragraph.\n- **🔧 Develop** — flesh it out. Add description, type, ICE estimates, link related notes/bookmarks.\n- **🧪 Stress Test** — challenge it. Use Devil's Advocate / Pre-mortem / Competitors AI buttons. Identify what would kill it.\n- **⚖️ Verdict** — decide: **Promote → Project** (becomes a real project + tasks) · **Park** (saved for later, dormant) · **Kill** (archived, with reasoning)\n\nA "stale" badge appears on cards stuck in one stage for too long (default 14d for Spark, 30d for Develop, 14d for Stress Test).\n\n### Idea types\n- 💡 Product feature · 🔧 Process improvement · 📚 Content piece · 🎯 Goal / OKR · 🏢 Business venture · 🛠 Tool / system · 🧪 Experiment · 📖 Learning project\n\nType drives the AI prompts (a product-feature pre-mortem asks different questions than a content-piece pre-mortem).\n\n### Card body & rich content\nThe **Description** field is an RTE with full formatting + image insert + AI Assistance bar (✅ Validate / ⚠ Pre-mortem / 🎯 ICE Score / 💡 Expand / 🔍 Competitors). Each AI output now renders formatted (headings, bullets, bold) — see "Markdown rendering in AI assists."\n\n### Toolbar AI tools\n- **✨ Generate sparks** — feed it a domain, get back 5-10 idea cards\n- **🧩 Cluster by theme** — groups your ideas into themes via embedding similarity\n- **🗺 Roadmap** — see "Devil / Champion / AI Roadmap"\n- **🏷 Auto-tag** — applies tags to every active idea in one batch\n- **📅 Weekly digest** — Sunday-evening summary of active ideas + recommended next actions`},
  {id:36,slug:'ideas-ice-decision-brief',catId:12,title:'Ideas — ICE scoring & Decision Brief',summary:'Score each idea 0-10 on Impact / Confidence / Ease, then generate a one-page brief.',tags:['ideas','ice','decision','ai'],body:`## ICE scoring & Decision Brief\n\n### ICE score (Impact / Confidence / Ease)\nEach idea has 3 slider fields (0-10):\n- **Impact** — if this succeeds, how much does it matter?\n- **Confidence** — how sure are you it'll succeed?\n- **Ease** — how cheap/fast to validate?\n\nThe composite ICE = average of the three. Sort the Ideas board by ICE descending to see what to work on first.\n\n### AI ICE Score\nClick **🎯 ICE Score** in the idea's AI Assistance bar. AI reads the idea's title + description + answers and returns its own ICE estimates. You see both side-by-side: user-entered vs AI-suggested. Resolve the gap by editing your sliders.\n\n### Decision Brief\nClick **📋 Decision Brief** in the idea detail view. AI generates a structured one-page brief with these exact sections:\n- **## Recommendation** — one line: PROMOTE / PARK / KILL with confidence %\n- **## Why this idea wins** — 3 bullets\n- **## Why it might fail** — 3 bullets\n- **## What we don't know yet** — 2 bullets\n- **## Decision criteria met / not met**\n- **## Suggested next step** — 1-2 sentences\n\nThe brief renders formatted in the modal (markdown → HTML). Two save buttons:\n- **⬇ Append to Description** — drops the rendered HTML into \`idea.descriptionHtml\` with a timestamped divider\n- **📋 Copy markdown** — copies the original markdown source\n\nThe brief is persisted on the idea (\`decisionBrief\` markdown + \`decisionBriefHtml\` pre-rendered) so re-opens are instant.\n\n### What it costs\nOne AI call per brief generation. Uses the workspace AI key.`},
  {id:37,slug:'ideas-devil-champion-roadmap',catId:12,title:'Ideas — Devil\'s Advocate, Champion, AI Roadmap, Weekly Digest',summary:'Four toolbar AI tools that stress-test or organise your ideas at scale.',tags:['ideas','ai','devil','champion','roadmap'],body:`## Devil's Advocate / Champion / Roadmap / Digest\n\n### 😈 Devil's Advocate vs 🏆 Champion\nIn the idea detail view, two toggle buttons swap the AI's stance:\n- **😈 Devil's Advocate** — model argues against the idea. Surfaces hidden assumptions, failure modes, market reasons it won't work.\n- **🏆 Champion** — model argues for the idea. Surfaces the upside case, unblockers, paths to win.\n\nRun both. The Decision Brief combines both stances into its analysis.\n\n### 🗺 AI Roadmap\nFrom the Ideas toolbar **🗺 Roadmap** opens a modal listing active ideas (Spark / Develop / Stress Test stages) with checkboxes. Pick the ones to bundle. AI returns a phased roadmap:\n- **Now** — 0-30 days\n- **Next** — 30-90 days\n- **Later** — 90+ days\n\nEach item has a "why" sentence + a 1-2 sentence overall strategy theme. Save the roadmap to a note for sharing.\n\n### 📅 Weekly Digest\nThe toolbar's **📅 Weekly digest** generates a Sunday-evening summary of every active idea — what changed this week, what's stale, recommended next actions, and which 2-3 ideas you should review this week. Emails to your inbox via the workspace SMTP account.\n\n### 🏷 Auto-tag all ideas\nOne-click batch tagger. Reads every active idea's title + description, applies the most-relevant tags from your existing tag vocabulary plus a few new ones the model proposes. Review the toast summary before saving.`},
  {id:38,slug:'mind-maps',catId:12,title:'Mind Maps',summary:'Free-form visual brainstorming with auto-layout and AI expand.',tags:['mind-maps','brainstorm','visual'],body:`## Mind Maps\n\nThe **Mind Maps** screen (left sidebar, pink network icon) is a free-form visual canvas for brainstorming. Each map is a tree of nodes radiating from a central topic.\n\n### Creating a map\n**+ New Mind Map** → name it → click the canvas to place the root node. Press **Tab** to add a child node, **Enter** for a sibling, **Esc** to exit edit mode. Drag any node to reposition; the auto-layout snaps connected branches.\n\n### Node attributes\n- Title (required) + optional notes (longer body)\n- Colour (per branch usually, propagates to children)\n- Linked task / note / idea — click the 🔗 chip to attach\n- Folded state — click ▸/▾ to collapse a branch\n\n### AI Expand a node\nSelect any node → **✨ AI Expand**. Model reads the node's title + parent context + sibling context and returns 3-6 child suggestions. Pick which to add.\n\n### Auto-layout\nDefault is radial; toggle to **Linear** for a hierarchical left-to-right tree. **Auto-arrange** re-flows the whole map to clean up after lots of editing.\n\n### Export\n**⬇ Export PNG** captures the canvas at print quality. **⬇ Export Markdown** flattens the tree into a nested bullet list — useful for pasting into a project description.`},
  {id:39,slug:'focus-mode',catId:12,title:'Focus mode',summary:'Single-task surface with built-in Pomodoro timer and distraction blocker.',tags:['focus','pomodoro','timer'],body:`## Focus mode\n\nThe **Focus** screen (left sidebar, red circle icon) is a stripped-down single-task surface. Unlike the Tasks page's **⚡ Focus** *view* (which lists today's queue), the Focus *screen* is for actually doing one task.\n\n### What's on screen\n- The currently selected task title + a one-line description\n- A big Pomodoro timer (default 25/5; configurable)\n- Notes scratchpad — text you type here auto-appends to the task's notes when the timer ends\n- Done / Pause / Switch buttons\n\nEverything else is hidden — no sidebar, no rails, no distractions. Press **Esc** to exit.\n\n### Starting a Focus session\nFrom anywhere: click the **⏱ Focus** icon on any task card. From the Tasks page Focus view: click the ⏱ button next to a row. The task's timer starts immediately and the Focus screen takes over.\n\n### Session log\nEvery completed Pomodoro logs a row to \`time_entries\` (the same store as the drawer's ▶/⏹ timer). The Reports source **Time entries (90d)** lets you build a "Focus minutes per day" widget.\n\n### Reports widget\nThe Source **Focus** in the widget builder counts completed Pomodoro sessions specifically (not raw timer minutes). Use it to track "deep work" days vs shallow days.`},
  {id:40,slug:'process-gtd',catId:12,title:'Process (GTD)',summary:'Getting Things Done workflow with Inbox / Next / Waiting / Someday lists.',tags:['gtd','process','inbox'],body:`## Process (GTD)\n\nThe **Process (GTD)** screen (left sidebar, violet zigzag icon) implements David Allen's *Getting Things Done* workflow on top of your existing task list. No new data model — it's a different view over \`D.tasks\`.\n\n### The 5 lists\n- **📥 Inbox** — tasks with no projectId, no due date, status Not Started. Newly captured items land here.\n- **▶ Next Actions** — Inbox tasks you've decided to do; once they have a context (\`@home\` / \`@office\` / \`@phone\`) they show up here.\n- **⏳ Waiting** — tasks blocked waiting for someone else. Tag with \`#waiting:<name>\` or set status to \`Waiting\`.\n- **💤 Someday/Maybe** — tasks with status \`Someday\`. Not actionable right now but worth keeping.\n- **📁 Reference** — links to relevant notes (not tasks; pulled from notes tagged \`#reference\`).\n\n### The processing flow\n1. **Empty inbox daily** — for each Inbox task ask: actionable? *No* → trash / Someday / Reference. *Yes* → quick (< 2 min)? Do it now. Else → context tag + due date → moves to Next Actions.\n2. **Weekly review** — once per week, scan all 5 lists. The header has a **📋 Start Weekly Review** button that walks you through it.\n\n### Context dropdown\nThe Settings → General → **Task Contexts** field lets you customise your context list (default: @home / @office / @phone / @errands / @waiting / @anywhere). Whatever you put there becomes the dropdown on each task.`},
  {id:41,slug:'knowledge-graph',catId:12,title:'Knowledge Graph',summary:'Force-directed graph of every link between notes, tasks, ideas, and projects.',tags:['graph','knowledge','visualisation'],body:`## Knowledge Graph\n\nThe **Knowledge Graph** screen (left sidebar, purple node-cluster icon) renders every "linked" relationship in your workspace as a force-directed graph. Built to spot orphan nodes, hub topics, and unexpected connections.\n\n### What's in the graph\n- **Notes** — bubbles sized by backlink count\n- **Tasks** — bubbles sized by subtask count\n- **Ideas** — bubbles colour-coded by stage\n- **Projects** — larger bubbles with their colour\n- **Bookmarks** — small grey bubbles\n\n### What counts as an edge\n- Wiki-link \`[[note name]]\` from one note to another\n- Linked task on an idea / opportunity / goal\n- Linked note on a task\n- Project membership\n- Tag co-occurrence (≥3 shared tags between two notes implies an edge)\n\n### Interactions\n- **Drag** any node to reposition; physics re-settles\n- **Click** a node to highlight its 1-hop neighbours and open the side panel with summary + open button\n- **Search** filters the graph to nodes matching the query (and their immediate neighbours)\n- **Cluster** colours by community-detection (Louvain) — groups of densely-connected nodes get the same colour\n\n### Orphan finder\nThe **🔎 Find orphans** button filters to nodes with zero edges. These are your at-risk knowledge — write a link or two to connect them.\n\n### Performance\nThe graph caps at ~500 nodes for smooth animation. Older notes can be excluded via the **From** date filter.`},
  {id:42,slug:'ai-length-control',catId:7,title:'AI output length control',summary:'Settings default + per-RTE chip that controls how much text every AI button generates.',tags:['ai','length','settings'],body:`## AI output length control\n\nEvery AI button across the app (Ideas / Notes / Journal / Compose Task Notes / Compose Project Description / Decision Brief — almost everything except the chat panel) respects a centralised length preference.\n\n### Settings default\n**Settings → AI Features → 📏 Default AI output length**. Three presets:\n- **📏 Short** — ~80 words / 3-5 sentences. Punchy.\n- **📐 Medium** — ~200 words. Default. Light formatting.\n- **📋 Long** — ~500 words. Comprehensive, uses ## headings + bullets + bold.\n\nPersisted to \`D.prefs.aiOutputLength\` and syncs across devices.\n\n### Per-RTE chip\nEvery AI Assistance bar (Ideas, Notes, Journal, Journal drawer) has a **Length:** chip on the right side. Click to cycle: Short → Medium → Long → Short. The change updates the Settings default — so flipping it in one place affects all bars on that device.\n\nIn the Compose preview modal (task notes / project description), the same chip lives in the action row.\n\n### Behind the scenes\n\`_aiLengthHint(level)\` returns the systemPrompt suffix that gets appended to every AI call. Short adds "Aim for ~80 words. Be punchy and direct." Long adds "Aim for ~500 words. Use headings, bullet lists, and bold where helpful."\n\n### Where it doesn't apply\n- **AI Chat panel (Cmd+J)** — chat responses follow the conversation tempo, not a fixed length\n- **Decision Brief** — has a rigid 6-section structure that length-control would break; the prompt itself defines section sizes\n- **AI Suggest Subtasks / AI Suggest Project Tasks** — return JSON arrays of 3-8 items; count isn't a word-count problem`},
  {id:43,slug:'ask-levelup-deep-insight',catId:7,title:'Ask LevelUp + Note Deep Insight',summary:'Content-aware AI Q&A across your whole workspace and per-note deep analysis.',tags:['ai','ask','deep-insight','content-aware'],body:`## Ask LevelUp + Note Deep Insight\n\nTwo content-aware AI features. Unlike the chat panel (which knows your data via *counts + titles* in a workspace snapshot), these read actual *content* — note bodies, task notes, journal text, idea descriptions.\n\n### ✨ Ask LevelUp (Cmd + /)\nClick the ✨ button in the topbar (or press **Cmd + /**) to open the universal Q&A overlay.\n\nUnder the hood: \`_gatherRelevantContent(query)\` scores every note / task / external task / journal entry / idea / opportunity against the question using keyword overlap + recency boost. Top 10 hits become the context (snippets up to 240 chars each, total budget 2,800 chars). The model gets the question + the source block and is told to cite with [1] [2] [3].\n\nAnswer renders with **clickable citations** that open the source object directly. Below the answer, a Sources footer shows the full snippets so you can verify.\n\n### Best for\n- "Where did I write about X?"\n- "Summarise everything I've captured about <topic>"\n- "What were my open questions about this client?"\n- "Did I ever decide whether to use Y or Z?"\n\nOne-shot lookup — for ongoing chat, use Cmd+J.\n\n### Note Deep Insight\nOpen any note → **✨ Deep Insight** in the AI Assistance bar. AI reads the full note body (up to 6,000 chars) and returns strict-JSON output rendered as a per-note panel:\n- **Summary** — 2-3 sentences\n- **Key points** — bulleted, the load-bearing insights\n- **Action items** — each with a **+ Task** button that creates a native task pre-linked to this note\n- **Open questions** — what's unresolved\n- **Related notes** — picked from the gatherer's matching hits\n\nResults are cached on \`note.aiDeepInsight\` (with a \`cachedAt\` stamp) so re-opens are instant. Click **↻ Refresh** to re-run with the current note content.`},
  {id:44,slug:'workspace-overview',catId:13,title:'Show only what you use',summary:'LevelUp has ~30 pages. Here is how to see just the ones you want.',tags:['workspace','layout','simplify','customize'],tourId:4,body:`## Show only what you use\n\nLevelUp is deliberately broad — tasks, notes, projects, goals, habits, calendar, mail, pipeline, mind maps and more. That breadth is the point of a second brain, but nobody uses all of it every day.\n\nSo you decide what appears. **Nothing is ever deleted.** Hiding a page removes it from your sidebar; the page, and all its data, is still there.\n\n### Three levels of control\n\n| Level | What it does | Where |\n|---|---|---|\n| **Pages** | Which entries appear in the sidebar | Settings → Workspace |\n| **Sidebars** | Whether a page shows its right-hand panel | Settings → Workspace, or ⚙ on the page |\n| **Sections** | Which cards show inside a page | ⚙ Customize this page |\n\n### Your choices follow you\n\nLayout is stored with your account, not in the browser, so it is the same on your laptop, your iPad and any other device you sign in on.\n\n### Nothing is one-way\n\nIf you hide a page and later open it from search, a link, or the command palette, it simply switches back on and tells you it did. You cannot lose a feature by tidying up.\n\n### Starting over\n\n**Settings → Workspace → Reset to defaults** puts every page, sidebar and section back exactly as LevelUp ships. It never touches your data.`},
  {id:51,slug:'detail-level',catId:13,title:'Turn the volume down',summary:'One dial, five stops, from bare essentials to everything.',tags:['declutter','simplify','overwhelmed','level','workspace'],body:`## Turn the volume down\n\nIf LevelUp feels like a lot, it is — around thirty pages and a dashboard that can show eleven widgets at once. You do not have to live with all of it.\n\n**Settings → Workspace → How much do you want to see?** is a single dial with five stops.\n\n| Level | What you get |\n|---|---|\n| **1 · Essentials** | Tasks and notes. No side panels. Two dashboard widgets. |\n| **2 · Simple** | Adds your planner and calendar. Still no side panels. |\n| **3 · Balanced** | Projects, goals, habits and journal. Side panels back on. |\n| **4 · Full** | Nearly everything — the work and comms pages return. |\n| **5 · Everything** | Every page, panel and widget. How LevelUp ships. |\n\nLevel 5 is the default, so if you have never touched this, that is where you are.\n\n### It is a starting point, not a cage\n\nA level sets everything at once so you do not have to click through thirty switches. **After that, every individual control still works.** Want level 1 plus the calendar? Pick 1, then switch Calendar back on in the list underneath. The dial will simply show **Custom**, which is exactly right — it is your layout now, not a preset.\n\n### Nothing is deleted, ever\n\nHiding a page removes it from the sidebar. The page and everything in it stays exactly where it was, and opening it from search or a link switches it straight back on. The same goes for widgets. This is a visibility setting and nothing more.\n\n### Going back\n\nPick **5**, or use **Reset to defaults** — both put the app back to how it ships. Neither touches a single task, note or project.\n\n### Volume vs. role\n\nUnderneath the dial there are also role-shaped layouts (Executive, Project Manager, Creator, Personal). Those slice by the *kind* of work you do rather than by how much you see. Use whichever framing fits — they write to the same place.`},
  {id:45,slug:'hide-show-pages',catId:13,title:'Hiding and showing pages',summary:'Trim the sidebar to the pages you actually open.',tags:['workspace','sidebar','pages','navigation'],body:`## Hiding and showing pages\n\nGo to **Settings → Workspace**. Under **Pages & features** every sidebar entry is listed under the same headings as the sidebar itself — Today, Work, Mind, Life, Comms, Other.\n\nUse the toggle on the right of each row to show or hide it.\n\n### What happens when you hide a page\n\n- It disappears from the sidebar on every screen.\n- If a whole group empties out, its heading disappears too, so you are not left with a stranded label.\n- The page still exists. Its data is untouched.\n- Opening it from search, the command palette, or a link inside another page turns it straight back on.\n\n### Pages you cannot hide\n\n**Home**, **Help & Learning** and **Settings** always stay visible — otherwise it would be possible to hide the very screen you need to undo it.\n\n### Pages that are not in the sidebar\n\nA few screens (Clusters, Standup, Knowledge Graph, My Week, My Year, Process) are reached from links rather than the sidebar, so there is nothing to hide. You can still turn their right-hand sidebars off.`},
  {id:46,slug:'customize-a-page',catId:13,title:'Customizing a single page',summary:'Turn off the cards and panels you do not read.',tags:['workspace','sections','widgets','rail'],body:`## Customizing a single page\n\nEvery page with a right-hand panel has a **⚙ Customize this page** button at the bottom of that panel. You can also press **Ctrl/⌘ K** and choose *Customize this page*.\n\nThe dialog lists:\n\n- **Right sidebar** — hide the whole panel and let the main content use the space.\n- **Every section the page is currently showing** — listed by the exact heading you see on screen.\n\nUntick anything you do not read. Changes save immediately and sync to your other devices.\n\n### Home and Tasks have richer dialogs\n\nThose two pages have had their own customization for a while, and it does more than show/hide — you can reorder cards and, on Home, change how each card picks what to show (for example whether *Top Tasks* means highest priority or soonest due). The ⚙ button opens those dialogs instead.\n\n### If a section reappears\n\nSections are matched by their heading. If a heading gets reworded in an update, the old match is lost and the card comes back. That is the intended direction — you see too much rather than silently losing something. Just untick it again.\n\n### Reset one page\n\n**Reset page** in the same dialog restores that page only, leaving the rest of your layout alone.`},
  {id:47,slug:'layout-presets',catId:13,title:'Starting layouts',summary:'Seven ready-made layouts, from Everything to Focused.',tags:['workspace','presets','layout'],body:`## Starting layouts\n\nRather than toggling 25 pages by hand, start from a layout in **Settings → Workspace**.\n\n| Layout | Shows |\n|---|---|\n| **Everything** | Every page and sidebar — how LevelUp ships. The default. |\n| **Focused** | Today, tasks, notes, calendar. Sidebars off for a calm screen. |\n| **Balanced** | The above plus projects, goals, habits and journal. |\n| **Executive** | Portfolio, pipeline, reports, team — the roll-up view. |\n| **Project Manager** | Tasks, projects, programs, command center. |\n| **Creator** | Notes, mind maps, ideas, focus sessions. |\n| **Personal** | Habits, goals, journal, calendar. |\n\nA layout is only a starting point — change anything afterwards and your edits stick.\n\n### Everything means truly default\n\nChoosing **Everything** does not write a pile of settings; it clears your layout entirely, so "default" always means the same thing.\n\n### Moving a layout between accounts\n\n**Export layout** writes a small JSON file, and **Import layout** reads it back. Useful for setting up a second account the same way, or keeping a copy before experimenting.`},
  {id:48,slug:'team-starter-layout',catId:13,title:'Publishing a team starting layout',summary:'Owners: choose what new teammates see on day one.',tags:['workspace','team','onboarding','owner'],body:`## Publishing a team starting layout\n\nDropping someone new into a thirty-page workspace is not a warm welcome. If you own the workspace you can publish the layout new teammates begin with.\n\n### How\n\n1. Set your own layout up the way a new person should start.\n2. **Settings → Workspace → Publish as team default**.\n\nThe setup guide new members see will preselect it and label it *your team's default*.\n\n### What it does not do\n\n- It does **not** change any existing member's layout.\n- It does **not** lock anything. A new member can pick a different layout in the guide, or change it later.\n- It does **not** hide data or restrict permissions. This is about what is on screen, nothing more.\n\n### Who can publish\n\nOnly the **workspace owner**. Invited teammates are administrators, which is why the button checks ownership on the server — an admin cannot redefine what everyone else starts with.`},
  {id:49,slug:'setup-guide',catId:13,title:'Re-running the setup guide',summary:'The first-run walkthrough, available whenever you want it.',tags:['onboarding','setup','wizard','getting-started'],body:`## Re-running the setup guide\n\nThe setup guide runs once, the first time an account signs in. You can open it again any time:\n\n- **Settings → Workspace → Run the setup guide**\n- **Ctrl/⌘ K** → *Run the setup guide*\n\n### What it covers\n\n1. **Your work** — the kind of work you do, which suggests a layout.\n2. **Your layout** — pick a starting layout (your team's default is preselected if the owner published one).\n3. **Your pages** — tick exactly what belongs in your sidebar.\n4. **Connect** — optionally link Microsoft 365 or Google, Smartsheet or NiftyPM, and OneNote.\n5. **Get going** — the handful of habits that make LevelUp worth using, then the five-minute tour.\n\nRunning it again re-applies whatever you choose, so it doubles as a quick way to reshape your whole workspace.\n\n### It will not nag you\n\nFinishing *or* skipping marks it done, and that is stored with your account — so signing in on a new device does not start it over.`},
  {id:50,slug:'first-week',catId:1,title:'Your first week',summary:'Five habits that make a second brain actually work.',tags:['getting-started','habits','workflow','intro'],body:`## Your first week\n\nLevelUp only becomes a second brain if things go into it. These five habits are what separate a useful workspace from an empty one.\n\n### 1. Capture immediately, sort later\n\nPress **Ctrl/⌘ N** for a task from anywhere, or **+ New** in the top bar. Do not stop to pick a project or a due date — getting it out of your head is the whole point. Tidy up later on the Process page.\n\n### 2. Start the day on Planner\n\nPlanner gathers what is due, what you scheduled, and your habits into one screen. Decide once what today looks like instead of re-deciding every time you switch tabs.\n\n### 3. Link things as you go\n\nA note can reference a task, a project, a meeting or another note. Those links are what makes the workspace worth more than the sum of its items — and what lets the AI answer questions with real context.\n\n### 4. Let it read your own work\n\n**Ctrl/⌘ K** searches everything you have. The ✨ menu answers questions from your own notes and tasks and cites which ones it used. Per-note **AI Deep Insight** pulls out action items you can turn into tasks in one click.\n\n### 5. Trim it to fit\n\nIf a page or panel is noise for you, hide it — **⚙ Customize this page**, or Settings → Workspace. A workspace you actually want to open beats a complete one you avoid. See **[Show only what you use](#)** in the Your Workspace section.\n\n### After the first week\n\nTurn one thing back on. Habits, Goals, or the Journal are the usual next step once capture is a reflex.`},
  {id:52,slug:'daily-routine',catId:14,title:'The daily routine',summary:'Five minutes each morning, five at shutdown. This is the whole habit.',tags:['routine','daily','planner','habit'],tourId:5,body:`## The daily routine\n\nTwo short passes a day. Together they take about ten minutes and they are what keeps everything else honest.\n\n### Morning — 5 minutes\n\n**1. Open Planner. Not email.**\nEmail is other people's agenda. Decide yours first, even if you change it later.\n\n**2. Read the capacity indicator.**\nIt compares the hours you have planned against the hours actually free once meetings are counted. If it says you are over capacity, you are over capacity — cut now, not at 4pm when it is someone else's problem too.\n\n**3. Pick three tasks. Three.**\nMark them **My Day**. Three is not modesty, it is the number that survives a real day with real interruptions. If everything is a priority, nothing is, and tomorrow you will trust the list less.\n\n**4. Scan today's calendar for prep.**\nAnything needing preparation becomes a task now. Prep that only exists as an intention does not happen.\n\n**5. Optional — AI Smart Plan.**\nIt time-blocks your chosen work around your actual meetings, respecting your working hours and your peak focus hours. Review it, then apply it to the calendar.\n\n### Shutdown — 5 minutes\n\n**1. Tick off what is done — honestly.**\nA task marked complete that is not complete poisons every number downstream: velocity, reports, the AI briefing. Under-reporting is recoverable; lying to yourself is not.\n\n**2. Deal with anything untouched three days running.**\nSchedule it, shrink it, or drop it. Items that roll silently forward are how a trusted list becomes wallpaper.\n\n**3. Empty your head.**\nPress **Ctrl/⌘ N** and dump whatever is nagging. Do not file it. Do not judge it. The weekly review sorts it.\n\n**4. One line in the Journal, with a mood.**\nTen seconds. It builds the mood trend in Reports and gives the AI real context about how your weeks actually go — which is what turns generic advice into advice about you.\n\n### If you only do one half\n\nDo the shutdown. Ending the day with a clear head and an empty capture inbox beats an elaborate morning plan you abandon by 10am.`},
  {id:53,slug:'weekly-review',catId:14,title:'The weekly review — the keystone',summary:'Thirty minutes, same slot every week. Everything else degrades without it.',tags:['routine','weekly','review','gtd','process'],tourId:5,body:`## The weekly review\n\nIf you adopt one habit from LevelUp, make it this one. Every other routine degrades without it. Book a repeating 30-minute slot and treat it like a meeting with someone you respect.\n\n### 1. Process the inbox to zero\n\nGo to **Process (GTD)**. Every captured item gets exactly one outcome:\n\n- **Under two minutes** — do it now, while you are looking at it.\n- **A real next action** — make it a task with a date and, if it belongs to something bigger, a project.\n- **Bigger than one action** — make it a project and define its first next action.\n- **Knowledge, not action** — turn it into a note and link it to whatever it relates to.\n- **Might be worth doing, not now** — send it to **Ideas** with a review date.\n- **No** — delete it. This is a legitimate and underused answer.\n\n"Inbox zero" here means every item has been *decided about*, not that everything is done.\n\n### 2. Review overdue\n\nOverdue is not a status. It is a decision you have not made yet. For each one: re-date it, delegate it, shrink it to something you would actually do, or delete it. An overdue list you scroll past is you training yourself to ignore the app.\n\n### 3. Walk your projects\n\nFor each active project ask two questions: **is it still active?** and **does it have a defined next action?** A project without a next action is stalled by definition, whatever its progress bar says. Use the health strip — velocity, burn, risk and ETA — to spot the ones drifting.\n\n### 4. Check goals\n\nDid this week move any goal forward? If the honest answer is no, that is the most useful finding of the review. Either the week was wrong or the goals are. Both are fixable, but only once you have noticed.\n\n### 5. Review habits\n\nLook at streaks, not at yesterday. A habit missed three weeks running is not a habit — retire it rather than carrying the guilt of a red row. You can always restart it later with intent.\n\n### 6. Plan the week ahead\n\nIn **My Week**, block the two or three big rocks first, before the week fills with other people's requests. Everything else fits around them or does not fit at all.\n\n### 7. Read the AI Portfolio Briefing\n\nGenerate it from **Command Center**. It reads your actual state and surfaces wins, risks, blockers and a suggested next three. It is particularly good at naming stalls you have gone blind to because you see them every day.\n\n### Why the same slot every week\n\nA review you schedule ad hoc is a review you skip when busy — which is precisely when you need it most. Friday afternoon and Monday morning both work; consistency matters more than which.`},
  {id:54,slug:'monthly-review',catId:14,title:'The monthly review',summary:'Forty-five minutes to look at trends, money and whether your goals still mean anything.',tags:['routine','monthly','reports','money','archive'],body:`## The monthly review\n\nThe weekly review keeps the machine running. The monthly one checks you are pointed somewhere worth going.\n\n### 1. Read the trends, not the numbers\n\nOpen **Reports**. Look at completion rate, task velocity, focus hours and mood trend. A single week is noise. Four weeks is a direction. Ask what the direction says about how you are actually working — not whether the number is "good".\n\n### 2. Money\n\nOn the **Money** page:\n- Reconcile account balances against reality.\n- Check every budget line. Consistently over on one category is not a willpower problem, it is a wrong budget.\n- Confirm bills matched real transactions. Anything unmatched is either a missed payment or a stale bill.\n- Update savings goal progress.\n- Run **AI categorise** on anything uncategorised, then spot-check what it decided.\n\n### 3. Re-baseline goals\n\nUpdate percentages honestly. Move dates that need moving — a date you have silently blown past is worse than an openly revised one. Close what is finished. Kill what you no longer mean. A goal you are quietly ignoring costs you attention every time you scroll past it.\n\n### 4. Archive\n\nCompleted projects, dead ideas, notes you will never open again. A smaller workspace is a more trusted workspace. Nothing is lost — Archive is a filter, not a shredder.\n\n### 5. Prune the workspace itself\n\nAny page you did not open once this month: **Settings → Workspace** and switch it off. It takes one click to bring back, and opening it from search re-enables it automatically. Carrying pages you do not use is a tax you pay on every screen.\n\n### 6. Triage ideas\n\nEvery idea gets promoted to a project, parked with a concrete review date, or killed. "Still thinking about it" for three months is a decision — make it explicit.`},
  {id:55,slug:'quarterly-reset',catId:14,title:'The quarterly reset',summary:'Set direction, re-check your setup, take a backup.',tags:['routine','quarterly','goals','backup'],body:`## The quarterly reset\n\nAn hour, four times a year.\n\n### Set 3–5 goals. No more.\n\nMore than five goals is a list of wishes. Each one needs a target date and at least one linked project or task, otherwise it is decoration. If you cannot name the first action, it is not a goal yet.\n\n### Re-check your detail level\n\nYour work changes; your workspace should follow. **Settings → Workspace** — has the level you chose in January still got the right pages on? Turn off what the last quarter proved you do not use.\n\n### Re-publish the team layout\n\nIf you run a team and its shape has changed, publish a new starter layout so the next person joining lands somewhere sensible.\n\n### Take a backup\n\n**Settings → Backup → Export**. Keep it somewhere that is not the app. This takes thirty seconds and is the cheapest insurance you will ever buy.\n\n### Read last quarter's journal\n\nSkim the entries and the mood trend together. Patterns that are invisible day to day are obvious across three months — which weeks drained you, which work you kept avoiding, what actually made a good day.`},
  {id:56,slug:'first-two-weeks',catId:14,title:'Your first two weeks',summary:'A ramp that builds the habit before it adds the features.',tags:['getting-started','onboarding','routine','new-user'],body:`## Your first two weeks\n\nThe most common way to fail with a tool like this is to turn everything on at once, feel overwhelmed, and quietly stop. So do not do that. Add one thing at a time and let each become automatic first.\n\n### Week one — build the reflex\n\n**Day 1 — capture only.** Press **Ctrl/⌘ N** every time something crosses your mind. Do not organise. Do not file. The only goal is getting things out of your head. Expect it to feel messy; that is correct.\n\n**Day 2 — add the morning.** Open **Planner** first thing. Pick three tasks. That is the whole exercise.\n\n**Day 3 — make one link.** Create a note about something you are working on and link it to a task. This is the moment the app stops being a to-do list.\n\n**Day 4 — one project.** Take the biggest thing on your list, make it a project, and give it a defined next action.\n\n**Day 5 — your first weekly review.** Yes, with almost no data. The point is the habit, not the volume. Fifteen minutes is fine this time.\n\n**Weekend — leave it alone.** Seriously. A system you cannot step away from is not a system, it is a second job.\n\n### Week two — add depth\n\n- Add the **5-minute shutdown**. This is the highest-value habit in the whole app.\n- Set **two or three goals** and link existing tasks to them.\n- Start **one habit** — one, not six.\n- Try **Ask LevelUp** (the ✨ menu) on your own notes and see what it finds.\n- Do a **proper weekly review** — this time with two weeks of real data behind it.\n\n### What to ignore for now\n\nMoney, Pipeline, Mind Maps, Reports, integrations. All excellent, none urgent. If they are cluttering your sidebar, set your detail level to 2 in **Settings → Workspace** and add pages back as you need them.\n\n### The measure of success\n\nAfter two weeks you should reach for LevelUp without deciding to. If you are still forcing yourself, do less — not more.`},
  {id:57,slug:'where-does-this-go',catId:14,title:'Where does this go?',summary:'Task, note, idea or project — a decision rule that takes two seconds.',tags:['capture','workflow','gtd','tasks','notes','ideas'],body:`## Where does this go?\n\nHesitating about where something belongs is the friction that stops people capturing. Use this rule and move on.\n\n### The rule\n\n| It is… | Put it in |\n|---|---|\n| Something with a next action | **Task** |\n| Something you want to remember or refer back to | **Note** |\n| Something that might be worth doing, but not now | **Idea** |\n| Something needing more than a few steps | **Project** |\n| Something happening at a specific time | **Calendar** |\n| Money going in or out | **Money** |\n| A person | **Contact** |\n| A deal | **Pipeline** |\n\n### When you cannot decide\n\n**Capture it as a task and move on.** The weekly review exists precisely to re-file things. Two seconds of hesitation at capture time, repeated fifty times a day, is what kills the habit — and a slightly misfiled item costs nothing.\n\n### Notes and tasks are not rivals\n\nThe useful pattern is both, linked. The note holds the thinking; the task holds the next action. Meeting notes with three action items should be one note plus three linked tasks — then the actions surface in Planner while the context stays where you will look for it.\n\n### On tags and folders\n\nTags help when you will search across projects later. Folders help when you always look in the same place. Use whichever you actually reach for — an elaborate taxonomy you never use is worse than no taxonomy, because it makes you feel behind.`},
  {id:58,slug:'when-it-stops-working',catId:14,title:'When it stops working',summary:'The recovery playbook for a workspace you have lost trust in.',tags:['troubleshooting','recovery','declutter','overwhelmed'],body:`## When it stops working\n\nEveryone falls off. What matters is having a way back that is not "start again from scratch".\n\n### "It is overwhelming"\n\nGo to **Settings → Workspace** and drop the detail level to **1 or 2**. That leaves five pages, two dashboard widgets and no side panels. Nothing is deleted — hiding is purely visual, and opening a hidden page from search switches it straight back on. Add one page back per week, only when you miss it.\n\n### "I stopped using it for a month"\n\nDo **not** try to catch up. That is the instinct and it fails every time.\n\n1. Bulk-archive anything untouched for 30 days. The **Stale Content** widget in Reports finds them.\n2. Do one honest weekly review on what is left.\n3. Restart with the daily shutdown only — nothing else — for one week.\n\nA month of stale items is not a backlog to clear, it is evidence about what did not matter.\n\n### "My task list is 200 items long"\n\nThat is not a filing problem, it is an unmade-decisions problem. Two hundred items means two hundred deferred decisions. Archive aggressively, then hold a real weekly review. Aim to end with a list you could plausibly finish in a fortnight.\n\n### "I do not trust what it tells me"\n\nSomething is stale. Usually a project is finished but never closed, or a batch of tasks was done outside the app and never ticked. Check your overdue count first — it is the fastest tell. Fix the data once and the trust returns quickly.\n\n### "I capture things and never look at them"\n\nYou have the capture habit and not the review habit, which is the more common half to be missing. Book a recurring 30-minute weekly review right now, in your real calendar. Capture without review is just a nicer way of forgetting.\n\n### Starting genuinely fresh\n\nIf you truly want to reset the layout: **Settings → Workspace → Reset to defaults**. That restores every page and panel and touches no data at all. Your tasks, notes and everything else are untouched.`},
  {id:59,slug:'getting-most-from-ai',catId:14,title:'Getting the most from the AI',summary:'What each AI surface is for, and how to ask so the answers are useful.',tags:['ai','assistant','ask','coach','deep-insight'],body:`## Getting the most from the AI\n\nLevelUp's AI reads *your* workspace, not the open internet. That is its whole advantage — and it means the quality of what you get out depends on what you have put in.\n\n### The surfaces, and when to use each\n\n**Ask LevelUp** (✨ menu, or **Ctrl/⌘ /**) — one-shot questions answered from your own notes, tasks and journal, with clickable citations back to the source. Best for "what did we decide about…", "what is outstanding for…".\n\n**AI Chat** (**Ctrl/⌘ J**) — a conversation that remembers the thread and can see a snapshot of your workspace. Best for thinking something through, planning, or asking follow-ups.\n\n**AI Deep Insight** (on any note) — summary, key points, action items and open questions for that note. Action items convert to linked tasks in one click.\n\n**AI Portfolio Briefing** (Command Center) — a chief-of-staff read on your whole workload: wins, risks, blockers, next three.\n\n**Coach** — a longer-running coaching thread over your patterns.\n\n**AI Smart Plan** (Planner) — time-blocks your day around real meetings and your peak focus hours.\n\n**AI categorise** (Money) — sorts uncategorised transactions and learns rules from your corrections.\n\n### Asking well\n\n- **Be specific about scope.** "What is at risk this week?" beats "how am I doing?".\n- **Name things.** Mentioning a project or goal by name pulls the right context in.\n- **Ask for a decision, not a summary.** "Which of these should I drop?" is more useful than "summarise my tasks", because you can act on it.\n- **Follow up.** In AI Chat the thread is remembered — push back, narrow, ask why.\n\n### Why answers get better over time\n\nThe AI can only reason about what exists. Linked notes, honest completion, real due dates and a few journal lines a week turn generic advice into advice about you specifically. This is the practical payoff for the daily routine.\n\n### What it will not do\n\nIt will not silently change your data. When you ask it to act, it proposes a plan for you to run — deliberately, so nothing moves without you.

**It can act, too.** Since build 196 the chat assistant can create, edit and link items, work with Money, run reports and walk you through setups — see *Assistant actions — let it do the work* under AI & Automation.`},
  {id:60,slug:'power-moves',catId:14,title:'Power moves',summary:'The shortcuts, syntax and features that separate fast users from slow ones.',tags:['shortcuts','power-user','syntax','tips'],body:`## Power moves\n\n### Shortcuts worth memorising\n\n| Keys | Does |\n|---|---|\n| **Ctrl/⌘ K** | Command palette — go anywhere, create anything, search everything |\n| **Ctrl/⌘ N** | Quick capture from any screen |\n| **Ctrl/⌘ J** | AI chat |\n| **Ctrl/⌘ /** | Ask LevelUp |\n| **?** | Every shortcut, listed |\n\nIf you learn only one, learn **Ctrl/⌘ K**. It removes navigation from your day.\n\n### Quick-add syntax\n\nIn the task quick-add box, type it all in one line:\n\n**Buy milk !high tomorrow #shopping @groceries**\n\n- **!high / !medium / !low** — priority\n- **tomorrow**, **friday**, **next week** — due date\n- **#tag** — a tag\n- **@context** — a context (customise these in Settings)\n\n### Wiki-links between notes\n\nType **[[** and the note name to link notes together. Backlinks appear automatically on the far end, and the **Knowledge Graph** page draws the whole web — which is where you find connections you did not know you had made.\n\n### Time-blocking that respects reality\n\nThe 📅 button on a task offers only slots that are genuinely free, working around your meetings and your working hours. Intent becomes an appointment, which is the difference between planning and hoping.\n\n### Saved views\n\nTasks and Command Center both save filtered views. If you find yourself applying the same three filters daily, save it once.\n\n### Reports on your Home screen\n\nBuild a widget in **Reports**, then pin it to Home. Eight data sources, eight chart types. The number you most need to see should be on the first screen you open.\n\n### Make the workspace yours\n\nEvery page with a right panel has **⚙ Customize this page** at the bottom of it. **Settings → Workspace** controls the lot, including the 5-stop detail dial. Your layout follows you to every device you sign in on.\n\n### Bring your real life in\n\nConnect Microsoft 365 or Google for calendar, mail and contacts; Smartsheet or NiftyPM for work tasks; SimpleFIN for banking; OneNote for meeting notes. The dashboard is only as honest as the data behind it.`},
  {id:61,slug:'assistant-actions',catId:7,title:'Assistant actions — let it do the work',summary:'The assistant can create, edit, link and report on anything in LevelUp, ask you questions, and walk you through setups. Here is how to drive it.',tags:['assistant','ai','actions','agent','automation','what-next','undo'],body:`# Assistant actions — let it do the work

Open the assistant from **any page** with **Ctrl/⌘ J**, the ⚡ button at the bottom-right, or the ✨ menu in the top bar. Since build 196 it does not just answer — it **acts**.

## What it can do

Say it in plain words. The assistant can:

- **Create** tasks (with subtasks), projects (with their first tasks), programs, notes, mind maps, ideas, goals (with milestones), habits, journal entries, contacts, pipeline opportunities, calendar events and time blocks.
- **Work with Money**: log a transaction, add a bill, mark a bill paid, set a category budget, add an account or a savings goal, and answer "am I over budget?" from your real numbers.
- **Edit and move things along**: complete a task, add subtasks, check in on a goal, tick a habit, move a deal to the next stage, move an idea from Spark to Develop.
- **Link things**: task ↔ note, task ↔ goal, task ↔ project, note ↔ project, project ↔ program.
- **Reports**: add a widget to the Reports page, save the current layout under a name, open a saved or Money report, and summarise what the numbers say.
- **Navigate and tidy**: jump to any page or item, set the workspace detail level, show or hide pages.
- **Advise**: "What should I do next?", "help me decide", "I feel behind" — it reads your overdue list, today's capacity, goals, habits and bills and recommends **one** concrete next step, then offers to do it.

## How a request flows

1. You type (or tap a suggestion chip).
2. The assistant replies in a sentence or two. If a detail is missing it **asks** — with tappable options — instead of guessing.
3. Anything that **changes** your workspace appears as an **Approve these actions?** card. Untick what you don't want, then **Run selected** or **Skip**.
4. Each action shows ✓ or ✗, an **Open** button to jump to what it made, and **↶ Undo**.
5. For multi-step work ("set up a project for the launch"), it acts, tells you what it did, and offers the natural next step.

## Names instead of ids

You never need an id. "Mark the auth refactor task done" works. If two things match ("Alpha Launch" and "Alpha Website"), it comes back with the candidates and asks which one.

## Safety rails

- Reads and navigation run instantly; they change nothing.
- Creates and edits **ask first** by default. Tick *don't ask again* on a card (or ⚙ in the panel header) to let it run creates and edits straight away.
- **Deletes always ask**, even with that switch on.
- **Everything is undoable** for the session — per action, or **↶ Undo last** in the panel header.
- It cannot touch other people's data, and it respects a view-only shared budget.

## Good things to say

- "Set up a project for the Q4 launch with the first five tasks, due end of month."
- "Log $42 at Costco under groceries."
- "Turn my meeting note with Priya into tasks."
- "Mind-map my options for the pricing decision."
- "Check in on my marathon goal — I ran 8k, call it 15%."
- "Block 90 minutes at 2pm for the spec."
- "Which bills are due this week, and am I over budget anywhere?"
- "Add a widget: overdue tasks by project, as a donut."
- "I just signed up — walk me through setting this up."
- "What should I do next?"

## When it seems stuck

- **"I couldn't reach the AI provider"** — check **Settings → AI Features** has a working key.
- **"That conversation got too large"** — 🗑 Clear the chat; nothing in your workspace is affected.
- If it proposes the wrong thing, **Skip** and rephrase with the item's name, or open the item and tell it "this one".
`},
  {id:62,slug:'task-clusters',catId:2,title:'Clusters — group tasks your way',summary:'Create clusters (groups) on the Tasks page and put tasks in them by button, drawer, bulk action, drag, or by asking the assistant. Plus: add tasks straight into a Matrix quadrant.',tags:['clusters','groups','tasks','matrix','eisenhower','organise'],body:`## Clusters — group tasks your way

A **cluster** is a named group on the Tasks page — "House Remodel", "Q4 Launch", "Physical Transformation" — that cuts across projects. The **Clusters** view (the Tasks page's default) shows one card per cluster with progress, overdue count and the tasks inside, and a **No cluster** card at the top for everything not yet filed.

## Creating a cluster

- **Tasks page → Clusters view → ＋ New Cluster** (top ribbon, and again at the bottom of the list). Give it a name, an icon and a colour.
- In the same dialog you can tick **projects** — every task in a ticked project joins automatically — and tick **individual tasks** to attach one-offs.
- Or ask the assistant: *"Create a cluster called House Remodel with the deck and driveway tasks."*

## Putting tasks into a cluster

Five ways, pick whichever is closest to hand:

1. **The ⬡ button** on any task row (List view and Clusters view) opens a picker: choose a cluster, choose *No cluster* to remove it, or *New cluster…* to create one with that task already in it.
2. **The task drawer** has a **Cluster** field next to Project.
3. **The Full Add form** (＋ Full Add Task) has a Cluster field too, so a task can be born in a cluster.
4. **Bulk**: turn on bulk select, tick the tasks, and use **⬡ Cluster** in the bulk bar to move them all at once.
5. **Drag** a task onto a cluster card in the Clusters view (drag it onto *No cluster* to remove it).

Tasks that belong to a project already in a cluster show up there automatically — you do not need to file them one by one.

## The assistant knows clusters

- *"Move the deck and windshield tasks into House Remodel."*
- *"Which cluster has the most overdue work?"* (it lists clusters with open and overdue counts)
- *"Create a task in the LevelUp Build cluster: write the release notes."*

## Adding tasks straight into a Matrix quadrant

The **Matrix** view (Eisenhower: Impact × Effort) now has an **＋ Add a task…** box at the bottom of every quadrant. Type a title and press Enter — the task is created with that quadrant's typical **priority** and **estimated minutes** (Do First: High · 30m · Plan: High · 120m · Quick Wins: Low · 30m · Eliminate: Low · 120m), so it lands where you put it. The cursor stays in the same quadrant so you can add several in a row. Open the card afterwards to fine-tune dates, project or cluster.
`},
  {id:63,slug:'push-to-nifty',catId:6,title:'Push a task to Nifty',summary:'Create a Nifty task from a LevelUp task — choose the Nifty project, assignee, dates and status — one at a time or in bulk. The task then syncs back like every other Nifty task.',tags:['nifty','integrations','push','sync','tasks','external'],body:`## Push a task to Nifty

Until now the Nifty integration only **pulled** tasks in and pushed **status** changes back. You can now create a Nifty task **from** a LevelUp task, with the project, assignee, dates and status of your choosing.

## One task

1. Open the task (click it → the drawer).
2. Click **↗ Push to Nifty** in the action row.
3. Pick the **Nifty project** — projects you already sync are marked ★ and listed first, and the default is the project mapped to this task's LevelUp project when there is one.
4. Choose the **assignee** (you are pre-selected when Nifty knows you), an optional **status / list**, and adjust the **due** and **start** dates (prefilled from the task).
5. Choose what happens afterwards:
   - **Move** (default) — the local copy is removed and the task syncs back from Nifty as an external task, exactly like the ones you already see. The toast has **Undo** if you want the local copy back.
   - **Keep a linked copy** — the local task stays, gets a **↗ Nifty** badge, and the drawer button becomes *Open in Nifty*.
6. **↗ Push to Nifty**. LevelUp creates the task, **reads it back from Nifty to verify**, then runs a sync so the Nifty copy appears within seconds.

## Several tasks at once

Turn on bulk select on the Tasks page, tick the tasks, and use **↗ Nifty** in the bulk bar. One project, assignee and status apply to all of them; leave the due date blank to keep each task's own.

## What gets sent

Name, description (plain text), due date, start date, assignee and status. Priority, tags and subtasks stay in LevelUp — Nifty has no matching fields.

## If it fails

The toast shows Nifty's own message and the HTTP status. The two common causes:

- **Nifty isn't connected** for your account — the dialog says so and links to **Settings → Integrations**.
- **The assignee list is short or empty** — Nifty's member endpoint varies by workspace, so LevelUp also offers every member it has seen on tasks already synced from that project (plus you). Pick one of those, or leave the task unassigned and assign it in Nifty.
`},
  {id:64,slug:'ai-coach',catId:7,title:'Your AI coach — interview, check-ins and autonomy',summary:'The assistant as your personal and professional coach: it learns about you, runs coaching sessions (plan my day, priorities, goals, habits, ideas, organizing, money), checks in through the day by in-app message, email and phone push, and can act on its own.',tags:['coach','ai','assistant','check-ins','checkin','reminders','push','notifications','iphone','ipad','phone','mobile','android','interview','autonomy','plan','planning','priorities','habits','goals','money','lost','overwhelmed','weekly','week','email','reply','alerts','budget','bills'],body:`## Your AI coach

LevelUp has a lot in it. The coach is there so you never have to figure it out alone: it learns who you are, decides with you what matters, does the busywork in the app, and checks in with you through the day.

## Start here: let it get to know you (5–10 minutes)

Open the **Coach** page and press **Start: get to know me** (or press **Ctrl/⌘ J** and tap **👋 Get to know me**). It asks one question at a time across eight areas — your roles, work, goals, life and people, health and habits, money, your day and energy, and how you like to be coached. Tap an answer or type your own; **Skip this** is always there. It remembers as you go, and you can stop and pick up later — it resumes where you left off.

When it has the picture, it sets up a starter structure for you: a **program** for each hat you wear, **projects** under them, a few **goals** with a first milestone, two or three tiny **habits**, and **clusters** for how you work.

## Coaching sessions

Open **🧭 Coach me on…** (in the assistant panel, on the Coach page, or in the command palette — type "Coach") and pick one:

- **Plan my day** — your one most important task and two supporting ones, put in My Day with time blocked
- **Prioritize my tasks** — an honest sort into do now / schedule / delegate / drop
- **Set my goals** — one question at a time to a goal you believe in, with milestones and a first step
- **Build the right habits** — two or three tiny habits tied to your goals
- **Flesh out an idea** — problem, audience, risks, an ICE score and next steps
- **Organize my life** — programs, projects and clusters so everything has a home
- **Money check-up** — where money stands and the one to three moves that matter
- **Weekly review** and **Check in with me** — close the week, or a 60-second course correction

A slim bar above the chat shows the session you are in; **End session** stops it.

## Check-ins through the day

Go to **Settings → AI Coach** and switch **Check-ins through the day** on. By default the coach writes to you on weekdays at:

- **7:30 Morning plan** — today's top task and two supporting ones
- **10:00 Focus nudge** — are you on the one thing?
- **12:30 Midday check-in** — re-plan the afternoon
- **15:00 Afternoon re-prioritize** — what must still happen, what moves to tomorrow
- **17:30 End-of-day review** — wins, loose ends, tomorrow's top three

Change any time, switch single check-ins off, pick the days, or **Pause until** a date. Choose how they reach you: **In-app message**, **Email**, **Phone push**. **Send me one now** writes one immediately so you can see what they look like. Each check-in lands in the assistant panel, so you can just reply.

Check-ins use your local time zone — open LevelUp once on your device so the coach knows it.

## Once a week

- **Sunday 18:00 Weekly plan** — a look back at the last seven days, the three outcomes that matter most this week, and a Monday-to-Friday sketch around your calendar. It spreads due dates across the week for you.
- **Saturday 10:00 Money check-in** — where spending stands against your plan for this point in the month, bills coming up, and the one money move that matters this week. Only if you use the Money page.
- **Money alerts** — a short heads-up when a category goes over budget, total spending passes the plan, or a bill that is not on autopay is due today or tomorrow. Each problem is flagged once, between 8am and 8pm.

Pick the day and time for each (or switch them off) under **Once a week** in Settings → AI Coach. The coach only sees money totals — category and bill names and rounded amounts — never account numbers or individual transactions.

## Reply by email

Every coach email can be answered: hit **Reply** and write what you want — "move the report to Friday", "done with the invoices", "I'm off on Friday afternoon". Within a few minutes the coach acts on it (it can move, schedule, add and complete tasks and remember things about you, but never delete) and writes back in the same email thread. Your reply and its answer also appear in the assistant panel.

Only replies from your own email address are read, and automatic replies (out-of-office) are ignored. Settings → AI Coach shows whether reply-by-email is on.

## Phone push

- **iPhone / iPad:** open levelupnow.tools in Safari, tap **Share → Add to Home Screen**, open LevelUp from that icon and sign in, then go to **Settings → AI Coach**, tick **Phone push** and allow notifications. (Apple only delivers web push to apps added to the Home Screen.)
- **Android, Mac, Windows:** tick **Phone push** and allow notifications.

Each device turns push on for itself. **Send a test** confirms it works.

## How much it does on its own

In **Settings → AI Coach** (or on the Coach page) choose:

- **Ask first** — every change waits for your approval
- **Small things on its own** — creates and edits happen right away; deletes still ask
- **Fully autonomous** — everything happens right away, deletes included

Every change can be undone (**↶** in the assistant panel), and anything the assistant deletes goes to **Deleted by the assistant** in Settings → AI Coach, where you can restore it. Scheduled check-ins are more careful still: they only ever plan — My Day, priorities, due dates, time blocks, new reminder tasks — and never delete or complete anything while you are away.

## What it knows about you

Settings → AI Coach → **What the coach knows about you** lists everything it has remembered. Add facts yourself, remove anything wrong or private, or **Forget everything**. It never stores passwords or account numbers.
`},
  {id:66,slug:'money-review-bills-rules',catId:15,title:'Money — review inbox, bills and rules',summary:'Clear what needs a decision after a bank sync, bills that repeat on any schedule, and category rules.',tags:['money','budget','bills','transactions','rules','review','bank'],body:`## Money — review inbox, bills and rules

### 📥 Review
After a bank sync, the **📥 Review** tab (the number is how many items wait) collects everything that needs a decision:
- **Needs a category** — uncategorized charges grouped by merchant, so one choice files every charge from it. Leave **Always** ticked to add a rule, and future syncs file that merchant automatically. **🔁 Transfer** marks money moving between your own accounts; **Keep as is** stops asking.
- **Transfer?** — an outflow with the same amount as a payment into a card or loan a few days apart is left out of spending automatically. Confirm it, or say it was a real purchase.
- **Overdue bills** — no matching charge has synced. **🔗 Link a charge** when the bank names it differently (future charges then match), or **✓ Mark paid**.
- **Possible duplicates** — same day, amount, account and merchant. Delete the extra copy (the bank-synced one is kept) or say it isn't a duplicate.

### Transactions
Change a category right in the list; when other uncategorized charges come from the same merchant, the message offers **Apply to all + rule**. Tick the boxes on the left (or the header box for everything shown) for the bulk bar: set a category, mark as transfer / not a transfer, cleared, or delete.

### Bills on any schedule
A bill can repeat **every week, every 2 weeks, twice a month, every month, every 3 months, every 6 months or every year** (**Repeats** in the bill form). Weekly to yearly bills ask for the **next due date**; twice-a-month bills take two days. The Bills tab, calendar chips, reminders, emails and the coach all use each bill's own schedule, and **/month** totals convert to a monthly amount. A bank charge from a few days before the due date pays it automatically. **🔍 Recurring** in Transactions also finds weekly, fortnightly, quarterly and yearly charges.

### Rules
**⚙ Rules** lists every rule with how many of your transactions it decides. Edit the text or category in place, move rules **↑↓** (the first match wins), and type any payee in the test box to see which rule — if any — would file it. Wrap text in /slashes/ for a pattern, e.g. /^check\\s*\\d+/.
`},
];
var HC_TOURS=[
  {id:1,name:'Member Onboarding',desc:'A 5-minute walkthrough of every core module.',type:'onboarding',est:5,roles:['member','admin'],steps:[
    {target:null,title:'Welcome to LevelUp! 👋',body:'Your second brain — tasks, notes, calendar, goals, and habits in one place. Take 60 seconds for the grand tour.'},
    {target:'nav-myday',title:'My Day',body:'Start every morning here. LevelUp surfaces your top-priority tasks, today\'s calendar events, and habit check-ins.'},
    {target:'nav-tasks',title:'Tasks',body:'All your tasks live here. Use the AI toolbar to decompose goals, check deadline risk, and auto-prioritise.'},
    {target:'nav-notes',title:'Notes',body:'Your knowledge base. Write in rich text, link notes with [[wiki-links]], and ask AI questions about your own notes.'},
    {target:'nav-calendar',title:'Calendar',body:'Week, Day, and Month views. Drag events to reschedule, resize to change duration, and use AI to generate meeting prep briefs.'},
    {target:'nav-habits',title:'Habits',body:'Track daily habits with streaks and a heatmap. AI coaching adapts your targets when you miss a streak.'},
    {target:'nav-help',title:'Help & Learning',body:'You\'re here! Come back anytime with the ? button, the ? key, or Cmd+/. The AI helper can answer questions about any feature.'},
  ]},
  {id:2,name:'Import First Contact',desc:'Add a contact and enrich it with Clodura in under 2 minutes.',type:'feature',est:2,roles:['member','admin'],steps:[
    {target:'nav-contacts',title:'Open Contacts',body:'Click Contacts in the sidebar to open your contact database.'},
    {target:'contacts-add-btn',title:'Add a Contact',body:'Click + Add Contact to create a new record. Fill in name, email, and company.'},
    {target:'contacts-enrich-btn',title:'Enrich with Clodura',body:'Click the 🔍 Enrich button on the contact row. LevelUp will pull in verified email, phone, LinkedIn, and 40+ firmographic fields automatically.'},
  ]},
  {id:3,name:'Build Your First Goal',desc:'Create a goal, link tasks, and track progress with AI.',type:'feature',est:3,roles:['member','admin'],steps:[
    {target:'nav-goals',title:'Open Goals',body:'Navigate to Goals in the sidebar.'},
    {target:'goals-add-btn',title:'Create a Goal',body:'Click + Add Goal. Give it a clear title and a target date.'},
    {target:'goals-ai-btn',title:'Use AI Alignment',body:'After adding some tasks, click 🔗 Align to check whether your daily work is actually moving this goal forward.'},
  ]},
  {id:4,name:'Make LevelUp yours',desc:'Trim the app down to the pages and panels you actually use.',type:'feature',est:2,roles:['member','admin'],steps:[
    {target:null,title:'Make it yours 🎛',body:'LevelUp ships with around thirty pages. You are not meant to use them all. This quick tour shows the three places you decide what stays on screen — and remember, hiding something never deletes it.'},
    {target:'nav-settings',title:'Settings → Workspace',body:'The full control panel. Pick a starting layout, then toggle individual pages and their right-hand sidebars. Home, Help and Settings always stay so you can never lock yourself out.'},
    {target:'topbar-ask-btn',title:'Or just press Ctrl/⌘ K',body:'The command palette has "Customize this page" and "Workspace layout" in it, so you can reshape things without leaving what you are doing.'},
    {target:null,title:'And on each page ⚙',body:'Every page with a right-hand panel has a ⚙ Customize this page button at the bottom of it. Untick the cards you never read. Changes save instantly and follow you to your other devices.'},
  ]},
  {id:5,name:'Build your routine',desc:'The daily and weekly rhythm that makes everything else work.',type:'onboarding',est:3,roles:['member','admin'],steps:[
    {target:null,title:'Rhythm beats features ⏱',body:'LevelUp only pays off if you come back to it. Two short passes a day and one review a week is the whole habit — this tour shows you where each one happens.'},
    {target:'nav-myday',title:'Every morning: Planner',body:'Open this before email. Check the capacity indicator, then pick THREE tasks for My Day. Three is the number that survives a real day.'},
    {target:'nav-tasks',title:'During the day: capture',body:'Press Ctrl/⌘ N whenever something crosses your mind. Do not file it — just get it out of your head. The weekly review sorts it.'},
    {target:'nav-journal',title:'At shutdown: one line',body:'Tick off what is really done, then write one line with a mood. Ten seconds. It builds your mood trend and gives the AI real context about your weeks.'},
    {target:'nav-process',title:'Once a week: process to zero',body:'The keystone habit. Every captured item becomes a task, a project, a note, an idea, or deleted. Book a repeating 30-minute slot for it.'},
    {target:'nav-reports',title:'Once a month: read the trends',body:'Completion rate, velocity, focus hours, mood. Four weeks is a direction; one week is noise.'},
    {target:'nav-help',title:'It is all written down',body:'The Routines & Mastery section in Help has the full daily, weekly, monthly and quarterly checklists, plus what to do when you fall off.'},
  ]},
];

var _helpTab='browse'; // 'browse' | 'ask' | 'tours'
let _helpSearch='';
let _helpCatFilter=null;
var _helpArticleId=null;
let _helpAIMessages=[];
let _helpAILoading=false;
var _activeTour=null; // {tourId, stepIdx, paused}
var _tourOverlayActive=false;
var _idleTimer=null;
let _idleScreen=null;
var _proactiveHintShown=new Set();
var _helpDrawerOpen=false;

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTERS DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
// Sort / filter / view state for the Clusters dashboard. Persist via D.prefs
// so the user's choice survives across sessions and devices.
let _clusterSort = null;
let _clusterFilter = null;
let _clusterView = null;
function _clusterInitPrefs(){
  if(_clusterSort==null) _clusterSort = (D.prefs&&D.prefs.clustersSort) || 'name';
  if(_clusterFilter==null) _clusterFilter = (D.prefs&&D.prefs.clustersFilter) || 'all';
  if(_clusterView==null) _clusterView = (D.prefs&&D.prefs.clustersView) || 'grid';
}
function setClusterSort(v){_clusterSort=v||'name';try{D.prefs=D.prefs||{};D.prefs.clustersSort=_clusterSort;save('prefs');}catch(_){}renderClustersDashboard();}
function setClusterFilter(v){_clusterFilter=v||'all';try{D.prefs=D.prefs||{};D.prefs.clustersFilter=_clusterFilter;save('prefs');}catch(_){}renderClustersDashboard();}
function setClusterView(v){_clusterView=v||'grid';try{D.prefs=D.prefs||{};D.prefs.clustersView=_clusterView;save('prefs');}catch(_){}renderClustersDashboard();}
function renderClustersDashboard(){
  const el=document.getElementById('clusters-main');
  if(!el)return;
  // Populate the right rail at the end too — wire it once via setTimeout
  // so it runs after the main content is in the DOM.
  setTimeout(()=>{if(typeof _populateClustersRail==='function')_populateClustersRail();},0);
  _clusterInitPrefs();
  const clusters=D.clusters||[];
  const today=_todayStr;
  // Aggregate stats
  const activeClusters=clusters.length;
  const totalTasks=D.tasks.filter(t=>t.status!=='Done'&&t.status!=='Someday').length;
  const overdueTasks=D.tasks.filter(t=>t.status!=='Done'&&t.due&&t.due<today).length;
  // "On Track" = clusters with no overdue task (matches the On Track filter). Shown as a
  // count, not a not-overdue %, so it no longer reads like a sibling of the per-cluster
  // completion bars (which measure done/total and run much lower).
  const onTrackClusters=clusters.filter(cl=>{
    const projIds=new Set(cl.projectIds||[]);
    const clTasks=D.tasks.filter(t=>t.clusterId===cl.id||(t.projectId&&projIds.has(t.projectId)));
    return !clTasks.some(t=>t.status!=='Done'&&t.due&&t.due<today);
  }).length;
  // Stat tiles
  const statTiles=[
    {label:'Active Clusters',value:activeClusters,icon:'⬡',color:'var(--ac)'},
    {label:'Total Tasks',value:totalTasks,icon:'✓',color:'var(--ok)'},
    {label:'Overdue',value:overdueTasks,icon:'⚠',color:'var(--red)'},
    {label:'On Track',value:onTrackClusters+'/'+activeClusters,icon:'📈',color:'var(--purp)'},
  ];
  const statHtml=statTiles.map(s=>`<div style="flex:1;min-width:120px;background:var(--s2);border:1px solid var(--bd2);border-radius:10px;padding:14px 16px">
    <div style="font-size:22px;margin-bottom:4px">${s.icon}</div>
    <div style="font-size:24px;font-weight:800;color:${s.color}">${s.value}</div>
    <div style="font-size:11px;color:var(--t3);margin-top:2px">${s.label}</div>
  </div>`).join('');
  // Cluster cards
  function clusterCard(cl){
    const projIds=new Set(cl.projectIds||[]);
    const clProjects=(D.projects||[]).filter(p=>projIds.has(p.id));
    const clTasks=D.tasks.filter(t=>t.clusterId===cl.id||(t.projectId&&projIds.has(t.projectId)));
    const doneTasks=clTasks.filter(t=>t.status==='Done').length;
    const pct=clTasks.length?Math.round((doneTasks/clTasks.length)*100):0;
    const overdueCount=clTasks.filter(t=>t.status!=='Done'&&t.due&&t.due<today).length;
    const ownerInitials=(cl.owner||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const collabAvatars=(cl.collaborators||[]).slice(0,3).map(c=>`<div style="width:22px;height:22px;border-radius:50%;background:var(--s3);border:2px solid var(--s2);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;margin-left:-6px;color:var(--t1)">${(c.name||c).split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</div>`).join('');
    // Child project rows
    const projRows=clProjects.map(p=>{
      const pTasks=D.tasks.filter(t=>t.projectId===p.id);
      const pDone=pTasks.filter(t=>t.status==='Done').length;
      const pPct=pTasks.length?Math.round((pDone/pTasks.length)*100):0;
      return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-top:1px solid var(--bd1)">
        <div style="width:8px;height:8px;border-radius:2px;background:${p.color||'#3B82F6'};flex-shrink:0"></div>
        <span style="flex:1;font-size:11px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</span>
        <div style="width:60px;height:3px;background:var(--s3);border-radius:2px"><div style="height:3px;border-radius:2px;background:${p.color||'#3B82F6'};width:${pPct}%"></div></div>
        <span style="font-size:11px;color:var(--t3);width:26px;text-align:right">${pPct}%</span>
      </div>`;
    }).join('');
    // Loose tasks row (tasks in cluster but not in any project)
    const looseTasks=clTasks.filter(t=>!t.projectId||!projIds.has(t.projectId));
    const looseRow=looseTasks.length?`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-top:1px solid var(--bd1)">
      <div style="width:8px;height:8px;border-radius:2px;background:var(--t3);flex-shrink:0"></div>
      <span style="flex:1;font-size:11px;color:var(--t3)">Loose tasks</span>
      <span style="font-size:11px;color:var(--t3)">${looseTasks.length}</span>
    </div>`:'';
    return `<div style="background:var(--s2);border:1px solid var(--bd2);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;align-items:flex-start;gap:10px">
        <div style="width:36px;height:36px;border-radius:8px;background:${cl.color||'#3B82F6'}22;border:1.5px solid ${cl.color||'#3B82F6'};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${cl.icon||'📁'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:var(--t1)">${esc(cl.name)}</div>
          <div style="font-size:11px;color:var(--t3);margin-top:2px">${clProjects.length} project${clProjects.length!==1?'s':''} · ${clTasks.length} task${clTasks.length!==1?'s':''}</div>
        </div>
        <button class="btn btn-s" style="height:24px;font-size:11px;padding:0 8px;flex-shrink:0" onclick="openClusterModal(${cl.id})">Edit</button>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div style="display:flex;align-items:center">
          <div style="width:26px;height:26px;border-radius:50%;background:${cl.color||'#3B82F6'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff">${ownerInitials}</div>
          ${collabAvatars}
        </div>
        <div style="flex:1;height:5px;background:var(--s3);border-radius:3px"><div style="height:5px;border-radius:3px;background:${cl.color||'#3B82F6'};width:${pct}%;transition:width .3s"></div></div>
        <span style="font-size:11px;font-weight:600;color:var(--t1);min-width:30px;text-align:right">${pct}%</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span style="font-size:11px;background:var(--s3);border-radius:8px;padding:2px 8px;color:var(--t2)">${clTasks.length} tasks</span>
        <span style="font-size:11px;background:var(--s3);border-radius:8px;padding:2px 8px;color:var(--t2)">${clProjects.length} projects</span>
        ${overdueCount>0?`<span style="font-size:11px;background:rgba(239,68,68,.12);border-radius:8px;padding:2px 8px;color:var(--red)">${overdueCount} overdue</span>`:''}
      </div>
      ${(projRows||looseRow)?`<div style="border-top:1px solid var(--bd2);padding-top:8px">${projRows}${looseRow}</div>`:''}
    </div>`;
  }
  // Per-cluster aggregate used by sort + filter (computed once per cluster).
  function _clusterStats(cl){
    const projIds=new Set(cl.projectIds||[]);
    const clTasks=D.tasks.filter(t=>t.clusterId===cl.id||(t.projectId&&projIds.has(t.projectId)));
    const doneTasks=clTasks.filter(t=>t.status==='Done').length;
    const pct=clTasks.length?Math.round((doneTasks/clTasks.length)*100):0;
    const overdueCount=clTasks.filter(t=>t.status!=='Done'&&t.due&&t.due<today).length;
    return {nTasks:clTasks.length,nProjects:(cl.projectIds||[]).length,pct,overdue:overdueCount,doneTasks};
  }
  // Apply filter + sort to clusters.
  let displayClusters=clusters.slice();
  if(_clusterFilter==='overdue') displayClusters=displayClusters.filter(cl=>_clusterStats(cl).overdue>0);
  else if(_clusterFilter==='ontrack') displayClusters=displayClusters.filter(cl=>_clusterStats(cl).overdue===0);
  else if(_clusterFilter==='empty') displayClusters=displayClusters.filter(cl=>_clusterStats(cl).nTasks===0);
  displayClusters.sort((a,b)=>{
    switch(_clusterSort){
      case 'progress': return _clusterStats(b).pct - _clusterStats(a).pct;
      case 'overdue': return _clusterStats(b).overdue - _clusterStats(a).overdue;
      case 'tasks': return _clusterStats(b).nTasks - _clusterStats(a).nTasks;
      case 'projects': return _clusterStats(b).nProjects - _clusterStats(a).nProjects;
      case 'recent': return (b.createdAt||'').localeCompare(a.createdAt||'');
      case 'name':
      default: return (a.name||'').localeCompare(b.name||'');
    }
  });
  // List-view row renderer (compact alternative to the cards).
  function clusterRow(cl){
    const s=_clusterStats(cl);
    return `<div onclick="openClusterModal(${cl.id})" style="display:flex;align-items:center;gap:12px;padding:11px 14px;background:var(--s2);border:1px solid var(--bd2);border-radius:10px;cursor:pointer;transition:background .12s,border-color .12s" onmouseover="this.style.background='var(--s3)'" onmouseout="this.style.background='var(--s2)'">
      <div style="width:32px;height:32px;border-radius:7px;background:${cl.color||'#3B82F6'}22;border:1.5px solid ${cl.color||'#3B82F6'};display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${cl.icon||'📁'}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(cl.name)}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">${s.nProjects} project${s.nProjects!==1?'s':''} · ${s.nTasks} task${s.nTasks!==1?'s':''}${s.overdue>0?` · <span style="color:var(--red)">${s.overdue} overdue</span>`:''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <div style="width:90px;height:5px;background:var(--s3);border-radius:3px"><div style="height:5px;border-radius:3px;background:${cl.color||'#3B82F6'};width:${s.pct}%;transition:width .3s"></div></div>
        <span style="font-size:11px;font-weight:600;color:var(--t1);width:36px;text-align:right">${s.pct}%</span>
      </div>
    </div>`;
  }
  const emptyHtml=`<div style="text-align:center;padding:40px;color:var(--t3)">
        <div style="font-size:36px;margin-bottom:8px">⬡</div>
        <div style="font-size:14px;font-weight:600">${clusters.length?'No clusters match this filter':'No clusters yet'}</div>
        <div style="font-size:12px;margin-top:4px;margin-bottom:12px">${clusters.length?'Try a different filter.':'Clusters group your projects and tasks into meaningful areas of work.'}</div>
        ${clusters.length?`<button class="btn btn-s" onclick="setClusterFilter('all')">Show all clusters</button>`:`<button class="btn btn-p" onclick="openClusterModal(null)">+ Create First Cluster</button>`}
      </div>`;
  let bodyHtml;
  if(!displayClusters.length){bodyHtml=emptyHtml;}
  else if(_clusterView==='list'){
    bodyHtml=`<div style="display:flex;flex-direction:column;gap:8px">${displayClusters.map(clusterRow).join('')}</div>`;
  } else {
    bodyHtml=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px">${displayClusters.map(clusterCard).join('')}</div>`;
  }
  // View / filter / sort toolbar — mirrors the pattern used on Projects.
  const viewToggle=`<div style="display:flex;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;overflow:hidden">
    <button class="btn" title="Grid view" style="border-radius:0;height:28px;padding:0 10px;font-size:11px;border:none;background:${_clusterView==='grid'?'var(--ac)':'transparent'};color:${_clusterView==='grid'?'#fff':'var(--t2)'}" onclick="setClusterView('grid')">🔲 Grid</button>
    <button class="btn" title="List view" style="border-radius:0;height:28px;padding:0 10px;font-size:11px;border:none;background:${_clusterView==='list'?'var(--ac)':'transparent'};color:${_clusterView==='list'?'#fff':'var(--t2)'}" onclick="setClusterView('list')">📋 List</button>
  </div>`;
  const filterSel=`<select class="inp" title="Filter clusters" style="height:28px;font-size:11px;padding:0 8px;width:auto" onchange="setClusterFilter(this.value)">
    <option value="all" ${_clusterFilter==='all'?'selected':''}>All clusters (${clusters.length})</option>
    <option value="overdue" ${_clusterFilter==='overdue'?'selected':''}>Has overdue</option>
    <option value="ontrack" ${_clusterFilter==='ontrack'?'selected':''}>On track</option>
    <option value="empty" ${_clusterFilter==='empty'?'selected':''}>Empty (no tasks)</option>
  </select>`;
  const sortSel=`<select class="inp" title="Sort clusters" style="height:28px;font-size:11px;padding:0 8px;width:auto" onchange="setClusterSort(this.value)">
    <option value="name" ${_clusterSort==='name'?'selected':''}>Sort: Name (A→Z)</option>
    <option value="progress" ${_clusterSort==='progress'?'selected':''}>Sort: Progress %</option>
    <option value="overdue" ${_clusterSort==='overdue'?'selected':''}>Sort: Overdue</option>
    <option value="tasks" ${_clusterSort==='tasks'?'selected':''}>Sort: # Tasks</option>
    <option value="projects" ${_clusterSort==='projects'?'selected':''}>Sort: # Projects</option>
    <option value="recent" ${_clusterSort==='recent'?'selected':''}>Sort: Recently created</option>
  </select>`;
  const showingHtml=clusters.length&&displayClusters.length!==clusters.length
    ?`<div style="font-size:11px;color:var(--t3);margin-bottom:12px">Showing <b style="color:var(--t1)">${displayClusters.length}</b> of <b style="color:var(--t1)">${clusters.length}</b> clusters · <a style="color:var(--ac);cursor:pointer" onclick="setClusterFilter('all')">show all</a></div>`
    :'';
  el.innerHTML=`
    <div class="ph-r" style="margin-bottom:16px">
      <div><h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('layers',22,'var(--page-accent)')}Clusters</h1><p style="font-size:12px;color:var(--t2)">Your areas of work — each cluster groups related projects and tasks.</p></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        ${viewToggle}
        ${filterSel}
        ${sortSel}
        <button class="btn btn-s" title="Pull latest from server (use if THIS device is showing stale data)" onclick="forceResyncFromServer()" style="height:28px;font-size:11px;padding:0 10px">🔄 Re-sync ↓</button>
        <button class="btn btn-s" title="Push THIS device's data up to the server (use if ANOTHER device is showing stale data)" onclick="forcePushAllToServer()" style="height:28px;font-size:11px;padding:0 10px">📤 Push ↑</button>
        <button class="btn btn-p" onclick="openClusterModal(null)">+ New Cluster</button>
      </div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">${statHtml}</div>
    ${showingHtml}
    ${bodyHtml}
  `;
}

function renderHelp(){
  const el=$('help-main');
  if(!el)return;
  if(_helpArticleId!==null){renderHelpArticle();return;}
  const q=_helpSearch.toLowerCase();
  let articles=HC_ARTICLES;
  if(q){articles=articles.filter(a=>a.title.toLowerCase().includes(q)||a.summary.toLowerCase().includes(q)||(a.tags||[]).some(t=>t.includes(q)));}
  if(_helpCatFilter!==null){articles=articles.filter(a=>a.catId===_helpCatFilter);}

  el.innerHTML=`
<div style="padding:0 24px 24px">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding-top:20px">
    <div>
      <h1 style="font-size:22px;font-weight:700;margin:0">❓ Help &amp; Learning</h1>
      <p style="font-size:12px;color:var(--t3);margin:4px 0 0">Search articles, ask AI, or launch a guided tour</p>
    </div>
    <button class="btn-s" onclick="openHelpDrawer()" style="font-size:11px">📥 Open Drawer</button>
  </div>

  <!-- Hero Search -->
  <div style="position:relative;margin-bottom:20px">
    <input id="help-search-input" class="inp" placeholder="Search help articles… (try 'shortcuts', 'calendar', 'enrich')" value="${esc(_helpSearch)}"
      oninput="_helpSearch=this.value;_helpCatFilter=null;_keepFocus(renderHelp)" style="width:100%;padding-left:36px;font-size:13px">
    <svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:var(--t3)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
    ${_helpSearch?`<button onclick="_helpSearch='';_helpCatFilter=null;renderHelp()" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--t3);font-size:16px">×</button>`:''}
  </div>

  <!-- Tabs -->
  <div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid var(--br);padding-bottom:0">
    ${['browse','ask','tours','builder','insights'].map(t=>`<button onclick="_helpTab='${_jsAttr(t)}';renderHelp()" style="padding:8px 16px;border:none;background:none;cursor:pointer;font-size:12px;font-weight:600;color:${_helpTab===t?'var(--ac)':'var(--t3)'};border-bottom:2px solid ${_helpTab===t?'var(--ac)':'transparent'};margin-bottom:-1px">${t==='browse'?'📚 Browse':t==='ask'?'🤖 Ask AI':t==='tours'?'🎯 Guided Tours':t==='builder'?'🔧 Tour Builder':'📊 Insights'}</button>`).join('')}
  </div>

  ${_helpTab==='browse'?renderHelpBrowseTab(articles,q):
    _helpTab==='ask'?renderHelpAskTab():
    _helpTab==='tours'?renderHelpToursTab():
    _helpTab==='builder'?renderTourBuilder():
    renderHelpInsights()}
</div>`;

  // Focus search if ? shortcut was used
  if(_helpSearch==='' && _helpTab==='browse'){const inp=$('help-search-input');if(inp)inp.focus();}
}

function renderHelpBrowseTab(articles,q){
  if(q||_helpCatFilter!==null){
    // Search results
    return `
<div>
  ${_helpCatFilter!==null?`<button onclick="_helpCatFilter=null;renderHelp()" class="btn-s" style="margin-bottom:12px;font-size:11px">← All Categories</button>`:
    `<p style="font-size:12px;color:var(--t3);margin:0 0 12px">${articles.length} result${articles.length!==1?'s':''} for "${esc(q)}"</p>`}
  <div style="display:flex;flex-direction:column;gap:8px">
    ${articles.length?articles.map(a=>helpArticleCard(a)).join(''):
      `<div style="text-align:center;padding:40px;color:var(--t3)"><div style="font-size:32px;margin-bottom:8px">🔍</div><div style="font-size:13px">No articles found. Try asking AI instead.</div><button class="btn-p" onclick="_helpTab='ask';renderHelp()" style="margin-top:12px;font-size:11px">Ask AI</button></div>`}
  </div>
</div>`;
  }
  // Category grid
  return `
<div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:24px">
    ${HC_CATS.map(c=>{
      const count=HC_ARTICLES.filter(a=>a.catId===c.id).length;
      return `<div onclick="_helpCatFilter=${c.id};renderHelp()" style="background:var(--s2);border:1px solid var(--br);border-radius:10px;padding:16px;cursor:pointer;transition:border-color .15s" onmouseover="this.style.borderColor='var(--ac)'" onmouseout="this.style.borderColor='var(--br)'">
        <div style="font-size:28px;margin-bottom:8px">${c.icon}</div>
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">${esc(c.name)}</div>
        <div style="font-size:11px;color:var(--t3);margin-bottom:8px">${esc(c.desc)}</div>
        <div style="font-size:11px;color:var(--ac);font-weight:600">${count} article${count!==1?'s':''}</div>
      </div>`;
    }).join('')}
  </div>
  <div style="margin-bottom:12px;font-size:12px;font-weight:600;color:var(--t2)">📌 Popular Articles</div>
  <div style="display:flex;flex-direction:column;gap:8px">
    ${HC_ARTICLES.slice(0,5).map(a=>helpArticleCard(a)).join('')}
  </div>
</div>`;
}

function helpArticleCard(a){
  const cat=HC_CATS.find(c=>c.id===a.catId);
  return `<div onclick="_helpArticleId=${a.id};renderHelp()" style="background:var(--s2);border:1px solid var(--br);border-radius:8px;padding:12px 14px;cursor:pointer;display:flex;align-items:flex-start;gap:12px;transition:border-color .15s" onmouseover="this.style.borderColor='var(--ac)'" onmouseout="this.style.borderColor='var(--br)'">
  <div style="font-size:20px;flex-shrink:0;margin-top:2px">${cat?cat.icon:'📄'}</div>
  <div style="flex:1;min-width:0">
    <div style="font-size:13px;font-weight:600;margin-bottom:3px">${esc(a.title)}</div>
    <div style="font-size:11px;color:var(--t3)">${esc(a.summary)}</div>
    <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">${(a.tags||[]).map(t=>`<span style="font-size:11px;background:var(--acs);color:var(--ac);padding:2px 6px;border-radius:10px">${esc(t)}</span>`).join('')}${a.tourId?`<span style="font-size:11px;background:rgba(16,185,129,.15);color:#10b981;padding:2px 6px;border-radius:10px">🎯 Has Tour</span>`:''}</div>
  </div>
  <svg style="flex-shrink:0;color:var(--t3);width:14px;height:14px;margin-top:4px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
</div>`;
}

function renderHelpArticle(){
  const a=HC_ARTICLES.find(x=>x.id===_helpArticleId);
  if(!a){_helpArticleId=null;renderHelp();return;}
  const cat=HC_CATS.find(c=>c.id===a.catId);
  const related=HC_ARTICLES.filter(x=>x.id!==a.id&&(x.catId===a.catId||(a.tags||[]).some(t=>(x.tags||[]).includes(t)))).slice(0,3);
  const tour=a.tourId?HC_TOURS.find(t=>t.id===a.tourId):null;
  const el=$('help-main');
  if(!el)return;
  el.innerHTML=`
<div style="padding:0 24px 40px;max-width:720px">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;padding-top:20px">
    <button onclick="_helpArticleId=null;renderHelp()" class="btn-s" style="font-size:11px">← Back</button>
    <span style="font-size:11px;color:var(--t3)">${cat?cat.icon+' '+cat.name:''}</span>
  </div>
  <h1 style="font-size:20px;font-weight:700;margin:0 0 8px">${esc(a.title)}</h1>
  <p style="font-size:12px;color:var(--t3);margin:0 0 16px">${esc(a.summary)}</p>
  ${tour?`<div style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.3);border-radius:8px;padding:12px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
    <span style="font-size:20px">🎯</span>
    <div style="flex:1"><div style="font-size:12px;font-weight:600;color:#10b981">Interactive Tour Available</div><div style="font-size:11px;color:var(--t3)">${esc(tour.name)} · ~${tour.est} min</div></div>
    <button class="btn-p" onclick="launchTour(${tour.id})" style="font-size:11px">Launch Tour</button>
  </div>`:''}
  <div style="font-size:13px;line-height:1.7;color:var(--t1)" id="help-article-body"></div>
  <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--br)">
    <div style="font-size:11px;color:var(--t3);margin-bottom:8px">Was this article helpful?</div>
    <div style="display:flex;gap:8px">
      <button class="btn-s" onclick="helpFeedback(${a.id},'yes')" style="font-size:11px">👍 Yes</button>
      <button class="btn-s" onclick="helpFeedback(${a.id},'no')" style="font-size:11px">👎 No</button>
    </div>
  </div>
  ${related.length?`<div style="margin-top:24px">
    <div style="font-size:12px;font-weight:600;margin-bottom:10px;color:var(--t2)">Related Articles</div>
    <div style="display:flex;flex-direction:column;gap:8px">${related.map(r=>helpArticleCard(r)).join('')}</div>
  </div>`:''}
</div>`;
  // Render markdown body
  const bodyEl=$('help-article-body');
  if(bodyEl&&a.body)bodyEl.innerHTML=simpleMarkdown(a.body);
}

function simpleMarkdown(md){return luSanitizeHtml(_simpleMarkdownRaw(md));}
function _simpleMarkdownRaw(md){
  return md
    .replace(/^## (.+)$/gm,'<h2 style="font-size:16px;font-weight:700;margin:20px 0 8px">$1</h2>')
    .replace(/^### (.+)$/gm,'<h3 style="font-size:13px;font-weight:700;margin:16px 0 6px">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/`(.+?)`/g,'<code style="background:var(--s3);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>')
    .replace(/^\| (.+) \|$/gm,(_,row)=>{
      const cells=row.split(' | ');
      return '<tr>'+cells.map(c=>`<td style="padding:6px 10px;border:1px solid var(--br);font-size:12px">${c}</td>`).join('')+'</tr>';
    })
    .replace(/(<tr>.*<\/tr>\n?)+/gs,t=>`<table style="border-collapse:collapse;width:100%;margin:12px 0">${t}</table>`)
    .replace(/^- (.+)$/gm,'<li style="margin:3px 0;font-size:12px">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/gs,t=>`<ul style="padding-left:20px;margin:8px 0">${t}</ul>`)
    .replace(/^(\d+)\. (.+)$/gm,'<li style="margin:3px 0;font-size:12px">$2</li>')
    .replace(/\n\n/g,'<br><br>')
    .replace(/\n/g,'<br>');
}

function renderHelpAskTab(){
  const msgs=_helpAIMessages;
  return `
<div style="display:flex;flex-direction:column;height:calc(100dvh - 280px);min-height:300px">
  <div id="help-ai-msgs" style="flex:1;overflow-y:auto;padding:4px 0;display:flex;flex-direction:column;gap:10px">
    ${msgs.length===0?`<div style="text-align:center;padding:40px 20px;color:var(--t3)">
      <div style="font-size:32px;margin-bottom:12px">🤖</div>
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Ask me anything about LevelUp</div>
      <div style="font-size:11px;margin-bottom:16px">I can answer questions about features, shortcuts, and best practices.</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center">
        ${['How do I import contacts?','What keyboard shortcuts are available?','How does habit streak tracking work?','How do I connect my Microsoft 365 account?'].map(q=>`<button onclick="helpAskQuestion(this.dataset.q)" data-q="${esc(q)}" style="font-size:11px;background:var(--s2);border:1px solid var(--br);border-radius:16px;padding:6px 12px;cursor:pointer;color:var(--t1)">${esc(q)}</button>`).join('')}
      </div>
    </div>`:
    (msgs.map(m=>{
      const citedArts=m.role==='assistant'&&m.cited&&m.cited.length?HC_ARTICLES.filter(a=>m.cited.includes(a.id)):[];
      return `<div style="display:flex;gap:8px;align-items:flex-start;${m.role==='user'?'flex-direction:row-reverse':''}">
        <div style="width:28px;height:28px;border-radius:50%;background:${m.role==='user'?'var(--ac)':'var(--s3)'};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${m.role==='user'?'👤':'🤖'}</div>
        <div style="max-width:85%;display:flex;flex-direction:column;gap:6px">
          <div style="background:${m.role==='user'?'var(--ac)':'var(--s2)'};color:${m.role==='user'?'#fff':'var(--t1)'};padding:10px 12px;border-radius:10px;font-size:12px;line-height:1.6">${m.role==='assistant'?simpleMarkdown(m.body):esc(m.body)}</div>
          ${citedArts.length?`<div style="display:flex;flex-wrap:wrap;gap:4px;padding:0 2px">${citedArts.map(a=>`<button onclick="_helpArticleId=${a.id};renderHelp()" style="font-size:11px;background:var(--s3);border:1px solid var(--br);border-radius:10px;padding:3px 8px;cursor:pointer;color:var(--t2);display:flex;align-items:center;gap:4px">📄 ${esc(a.title)}</button>`).join('')}</div>`:''}
        </div>
      </div>`;
    }).join('')+(_helpAILoading?`<div style="display:flex;gap:8px;align-items:center"><div style="width:28px;height:28px;border-radius:50%;background:var(--s3);display:flex;align-items:center;justify-content:center;font-size:14px">🤖</div><div style="background:var(--s2);padding:10px 14px;border-radius:10px;font-size:12px;color:var(--t3)">Thinking…</div></div>`:''))}
  </div>
  <div style="display:flex;gap:8px;margin-top:12px">
    <input id="help-ai-input" class="inp" placeholder="Ask a question about LevelUp…" style="flex:1" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();helpAskQuestion(this.value)}">
    <button class="btn-p" onclick="helpAskQuestion(document.getElementById('help-ai-input').value)" style="font-size:11px">Send</button>
    ${msgs.length?`<button class="btn-s" onclick="_helpAIMessages=[];renderHelp()" style="font-size:11px">Clear</button>`:''}
  </div>
</div>`;
}

function helpAskQuestion(q){
  q=(q||'').trim();
  if(!q)return;
  if(_helpAILoading)return;
  _helpAIMessages.push({role:'user',body:q});
  _helpAILoading=true;
  renderHelp();
  // Scroll to bottom
  const msgs=$('help-ai-msgs');
  if(msgs)msgs.scrollTop=msgs.scrollHeight;
  // Clear input
  const inp=$('help-ai-input');
  if(inp)inp.value='';
  // Build conversation history for context (last 6 messages)
  const history=_helpAIMessages.slice(-7,-1).map(m=>({role:m.role==='user'?'user':'assistant',content:m.body}));
  // Call the real tRPC endpoint with the user's chosen provider + key.
  const {provider:_aiP}=_getAIConfig();
  const payload=JSON.stringify({json:{question:q,conversationHistory:history,provider:_aiP}});
  fetch('/api/trpc/help.askAI',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    credentials:'include',
    body:payload
  })
  .then(r=>r.json())
  .then(data=>{
    let answer='';
    let cited=[];
    if(data&&data.result&&data.result.data&&data.result.data.json){
      const res=data.result.data.json;
      answer=res.answer||'';
      cited=(res.citedArticles||[]).map(a=>a.id);
    } else if(data&&data.error){
      answer='Sorry, I encountered an error: '+(data.error.message||'Unknown error. Please try again.');
    } else {
      answer='Sorry, I could not get an answer. Please try again.';
    }
    _helpAIMessages.push({role:'assistant',body:answer,cited:cited});
    _helpAILoading=false;
    renderHelp();
    const msgs=$('help-ai-msgs');
    if(msgs)msgs.scrollTop=msgs.scrollHeight;
  })
  .catch(err=>{
    _helpAIMessages.push({role:'assistant',body:'Sorry, there was a network error. Please check your connection and try again.',cited:[]});
    _helpAILoading=false;
    renderHelp();
    const msgs=$('help-ai-msgs');
    if(msgs)msgs.scrollTop=msgs.scrollHeight;
  });
}

function renderHelpToursTab(){
  const tours=HC_TOURS;
  return `
<div>
  <p style="font-size:12px;color:var(--t3);margin:0 0 16px">Interactive step-by-step walkthroughs for every feature. Launch any tour to get a guided experience with spotlight highlights and tooltips.</p>
  <div style="display:flex;flex-direction:column;gap:10px">
    ${tours.map(t=>{
      const progress=_activeTour&&_activeTour.tourId===t.id?_activeTour.stepIdx:0;
      const isActive=_activeTour&&_activeTour.tourId===t.id;
      const isCompleted=(_helpCompletedTours||new Set()).has(t.id);
      return `<div style="background:var(--s2);border:1px solid ${isActive?'var(--ac)':'var(--br)'};border-radius:10px;padding:14px 16px">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <div style="font-size:28px">${t.type==='onboarding'?'🚀':t.type==='feature'?'🎯':'✨'}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
              <span style="font-size:13px;font-weight:600">${esc(t.name)}</span>
              ${isCompleted?'<span style="font-size:11px;background:rgba(16,185,129,.15);color:#10b981;padding:2px 6px;border-radius:10px">✓ Completed</span>':''}
              ${isActive?'<span style="font-size:11px;background:var(--acs);color:var(--ac);padding:2px 6px;border-radius:10px">In Progress</span>':''}
            </div>
            <div style="font-size:11px;color:var(--t3);margin-bottom:6px">${esc(t.desc)}</div>
            <div style="display:flex;gap:8px;align-items:center">
              <span style="font-size:11px;color:var(--t3)">⏱ ~${t.est} min · ${t.steps.length} steps</span>
              <span style="font-size:11px;color:var(--t3)">${t.roles.map(r=>`<span style="background:var(--s3);padding:1px 5px;border-radius:8px">${r}</span>`).join(' ')}</span>
            </div>
            ${isActive?`<div style="margin-top:8px"><div style="height:4px;background:var(--s3);border-radius:2px;overflow:hidden"><div style="height:100%;background:var(--ac);width:${Math.round((progress/t.steps.length)*100)}%;transition:width .3s"></div></div><div style="font-size:11px;color:var(--t3);margin-top:3px">Step ${progress} of ${t.steps.length}</div></div>`:''}
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <button class="btn-p" onclick="launchTour(${_tidLit(t.id)})" style="font-size:11px">${isActive?'Resume':'Launch'}</button>
            ${isActive?`<button class="btn-s" onclick="exitTour()" style="font-size:11px">Exit</button>`:''}
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>
</div>`;
}

function helpFeedback(articleId,vote){
  toast(vote==='yes'?'Thanks for the feedback! 👍':'Thanks — we\'ll improve this article.');
}

var _helpCompletedTours=new Set();

// ====== TOUR BUILDER ======
let _builderTour={name:'',desc:'',steps:[],recording:false};
let _builderRecordedSteps=[];
let _builderRecording=false;

function renderTourBuilder(){
  const t=_builderTour;
  return `
<div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
    <div>
      <div style="font-size:14px;font-weight:700">🔧 Tour Builder</div>
      <div style="font-size:11px;color:var(--t3)">Create custom guided tours for your team. Record by clicking elements or add steps manually.</div>
    </div>
    <button class="btn-p" onclick="saveTourFromBuilder()" style="font-size:11px">💾 Save Tour</button>
  </div>

  <!-- Tour Meta -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
    <div>
      <label style="font-size:11px;color:var(--t3);display:block;margin-bottom:4px">Tour Name</label>
      <input class="inp" value="${esc(t.name)}" oninput="_builderTour.name=this.value" placeholder="e.g. New Employee Onboarding" style="font-size:12px">
    </div>
    <div>
      <label style="font-size:11px;color:var(--t3);display:block;margin-bottom:4px">Description</label>
      <input class="inp" value="${esc(t.desc)}" oninput="_builderTour.desc=this.value" placeholder="What will users learn?" style="font-size:12px">
    </div>
  </div>

  <!-- Record Mode -->
  <div style="background:${_builderRecording?'rgba(239,68,68,.08)':'var(--s2)'};border:1px solid ${_builderRecording?'#ef4444':'var(--br)'};border-radius:8px;padding:12px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
    <div style="width:10px;height:10px;border-radius:50%;background:${_builderRecording?'#ef4444':'var(--t3)'};${_builderRecording?'animation:tourPulse 1s infinite':''};"></div>
    <div style="flex:1">
      <div style="font-size:12px;font-weight:600">${_builderRecording?'🔴 Recording… Click any element to add it as a tour step':'Record Mode'}</div>
      <div style="font-size:11px;color:var(--t3)">${_builderRecording?'Click elements on screen. Press Esc or Stop to finish.':'Click Record to start capturing element clicks as tour steps.'}</div>
    </div>
    <button class="${_builderRecording?'btn-s':'btn-p'}" onclick="toggleBuilderRecord()" style="font-size:11px">${_builderRecording?'⏹ Stop':'● Record'}</button>
  </div>

  <!-- Steps List -->
  <div style="margin-bottom:12px;font-size:12px;font-weight:600">Steps (${t.steps.length})</div>
  <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
    ${t.steps.length?t.steps.map((s,i)=>`<div style="background:var(--s2);border:1px solid var(--br);border-radius:8px;padding:10px 12px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <div style="width:20px;height:20px;border-radius:50%;background:var(--ac);color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0">${i+1}</div>
        <input class="inp" value="${esc(s.title)}" oninput="_builderTour.steps[${i}].title=this.value" placeholder="Step title" style="flex:1;font-size:12px">
        <button onclick="_builderTour.steps.splice(${i},1);renderHelp()" style="background:none;border:none;cursor:pointer;color:var(--t3);font-size:14px">×</button>
      </div>
      <textarea class="inp" oninput="_builderTour.steps[${i}].body=this.value" placeholder="Step description…" style="width:100%;font-size:11px;min-height:48px;resize:vertical">${esc(s.body)}</textarea>
      <div style="margin-top:4px;font-size:11px;color:var(--t3)">Target: <code style="background:var(--s3);padding:1px 4px;border-radius:3px">${esc(s.target||'(none)')}</code></div>
    </div>`).join(''):
    `<div style="text-align:center;padding:24px;color:var(--t3);border:2px dashed var(--br);border-radius:8px">
      <div style="font-size:24px;margin-bottom:6px">📍</div>
      <div style="font-size:12px">No steps yet. Use Record mode or click Add Step.</div>
    </div>`}
  </div>
  <button class="btn-s" onclick="addBuilderStep()" style="font-size:11px;width:100%">+ Add Step Manually</button>

  <!-- Existing Tours -->
  <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--br)">
    <div style="font-size:12px;font-weight:600;margin-bottom:10px">Existing Tours</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${HC_TOURS.map(t=>`<div style="background:var(--s2);border:1px solid var(--br);border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:8px">
        <div style="flex:1"><div style="font-size:12px;font-weight:600">${esc(t.name)}</div><div style="font-size:11px;color:var(--t3)">${t.steps.length} steps · ${t.type}</div></div>
        <button class="btn-s" onclick="loadTourIntoBuilder(${_tidLit(t.id)})" style="font-size:11px">Edit</button>
        <button class="btn-p" onclick="launchTour(${_tidLit(t.id)})" style="font-size:11px">Preview</button>
      </div>`).join('')}
    </div>
  </div>
</div>`;
}

function toggleBuilderRecord(){
  _builderRecording=!_builderRecording;
  if(_builderRecording){
    toast('🔴 Recording started. Click any element to add a step.');
    document.addEventListener('click',builderRecordClick,{capture:true,once:false});
  } else {
    document.removeEventListener('click',builderRecordClick,{capture:true});
    toast('⏹ Recording stopped. '+_builderTour.steps.length+' steps recorded.');
  }
  renderHelp();
}

function builderRecordClick(e){
  if(!_builderRecording)return;
  // Don't capture clicks inside the help screen itself
  const helpMain=$('help-main');
  if(helpMain&&helpMain.contains(e.target))return;
  e.stopPropagation();
  e.preventDefault();
  const el=e.target;
  const id=el.id||el.dataset.tourId||el.dataset.n||'';
  const label=el.textContent.trim().slice(0,40)||el.getAttribute('title')||el.getAttribute('aria-label')||'Element';
  _builderTour.steps.push({target:id,title:'Step: '+label,body:'Describe what the user should do here.'});
  toast('📍 Step added: '+label);
  renderHelp();
}

function addBuilderStep(){
  _builderTour.steps.push({target:'',title:'New Step',body:'Describe this step.'});
  renderHelp();
}

function loadTourIntoBuilder(tourId){
  const tour=HC_TOURS.find(t=>t.id===tourId);
  if(!tour)return;
  _builderTour={name:tour.name,desc:tour.desc,steps:tour.steps.map(s=>({...s}))};
  renderHelp();
  toast('Tour loaded into builder.');
}

function saveTourFromBuilder(){
  if(!_builderTour.name.trim()){toast('Please enter a tour name.');return;}
  if(!_builderTour.steps.length){toast('Please add at least one step.');return;}
  const newId=Math.max(...HC_TOURS.map(t=>t.id),0)+1;
  HC_TOURS.push({id:newId,name:_builderTour.name,desc:_builderTour.desc,type:'custom',est:Math.ceil(_builderTour.steps.length*0.5),roles:['member','admin'],steps:_builderTour.steps.map(s=>({...s}))});
  _builderTour={name:'',desc:'',steps:[]};
  _helpTab='tours';
  renderHelp();
  toast('🎉 Tour saved! Find it in the Guided Tours tab.');
}

// ====== HELP INSIGHTS ======
let _helpInsightsData=null;

function renderHelpInsights(){
  // Generate insights from app data
  const totalTasks=D.tasks?D.tasks.length:0;
  const doneTasks=D.tasks?D.tasks.filter(t=>t.done).length:0;
  const totalNotes=D.notes?D.notes.length:0;
  const totalContacts=D.contacts?D.contacts.length:0;
  const totalHabits=D.habits?D.habits.length:0;
  const activeHabits=D.habits?D.habits.filter(h=>h.doneToday).length:0;
  const totalGoals=D.goals?D.goals.length:0;
  const completedTours=_helpCompletedTours.size;
  const totalTours=HC_TOURS.length;
  const totalArticles=HC_ARTICLES.length;
  const articlesRead=0; // tracked via feedback clicks
  const aiQuestionsAsked=_helpAIMessages.filter(m=>m.role==='user').length;

  const taskPct=totalTasks?Math.round((doneTasks/totalTasks)*100):0;
  const habitPct=totalHabits?Math.round((activeHabits/totalHabits)*100):0;
  const tourPct=totalTours?Math.round((completedTours/totalTours)*100):0;

  return `
<div>
  <div style="font-size:14px;font-weight:700;margin-bottom:4px">📊 Help &amp; Learning Insights</div>
  <div style="font-size:11px;color:var(--t3);margin-bottom:20px">Your learning progress and app usage at a glance.</div>

  <!-- Learning Progress -->
  <div style="background:var(--s2);border:1px solid var(--br);border-radius:10px;padding:16px;margin-bottom:16px">
    <div style="font-size:12px;font-weight:700;margin-bottom:12px">🎓 Learning Progress</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
      ${[
        {label:'Tours Completed',val:completedTours,total:totalTours,pct:tourPct,icon:'🎯'},
        {label:'AI Questions Asked',val:aiQuestionsAsked,total:null,pct:null,icon:'🤖'},
        {label:'Articles Available',val:totalArticles,total:null,pct:null,icon:'📚'},
      ].map(m=>`<div style="text-align:center">
        <div style="font-size:24px;margin-bottom:4px">${m.icon}</div>
        <div style="font-size:20px;font-weight:700">${m.val}${m.total!==null?'/'+m.total:''}</div>
        <div style="font-size:11px;color:var(--t3)">${m.label}</div>
        ${m.pct!==null?`<div style="margin-top:6px;height:4px;background:var(--s3);border-radius:2px"><div style="height:100%;background:var(--ac);width:${m.pct}%"></div></div>`:''}
      </div>`).join('')}
    </div>
  </div>

  <!-- App Usage -->
  <div style="background:var(--s2);border:1px solid var(--br);border-radius:10px;padding:16px;margin-bottom:16px">
    <div style="font-size:12px;font-weight:700;margin-bottom:12px">📱 App Usage Summary</div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">
      ${[
        {label:'Tasks',done:doneTasks,total:totalTasks,pct:taskPct,icon:'✅'},
        {label:'Habits Active Today',done:activeHabits,total:totalHabits,pct:habitPct,icon:'🔥'},
        {label:'Notes',done:totalNotes,total:null,pct:null,icon:'📝'},
        {label:'Contacts',done:totalContacts,total:null,pct:null,icon:'👤'},
        {label:'Goals',done:totalGoals,total:null,pct:null,icon:'🎯'},
      ].map(m=>`<div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--s3);border-radius:6px">
        <span style="font-size:18px">${m.icon}</span>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600">${m.done}${m.total!==null?'/'+m.total:''}</div>
          <div style="font-size:11px;color:var(--t3)">${m.label}</div>
          ${m.pct!==null?`<div style="margin-top:4px;height:3px;background:var(--s2);border-radius:2px"><div style="height:100%;background:var(--ac);width:${m.pct}%"></div></div>`:''}
        </div>
      </div>`).join('')}
    </div>
  </div>

  <!-- Recommended Next Steps -->
  <div style="background:var(--s2);border:1px solid var(--br);border-radius:10px;padding:16px">
    <div style="font-size:12px;font-weight:700;margin-bottom:10px">💡 Recommended Next Steps</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${completedTours===0?`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--acs);border-radius:6px">
        <span style="font-size:16px">🚀</span>
        <div style="flex:1;font-size:11px">Start the <strong>Member Onboarding</strong> tour to get a full walkthrough</div>
        <button class="btn-p" onclick="launchTour(1)" style="font-size:11px">Start</button>
      </div>`:''}
      ${totalNotes===0?`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--s3);border-radius:6px">
        <span style="font-size:16px">📝</span>
        <div style="flex:1;font-size:11px">Create your first note to start building your knowledge base</div>
        <button class="btn-s" onclick="nav('notes')" style="font-size:11px">Go to Notes</button>
      </div>`:''}
      ${totalContacts===0?`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--s3);border-radius:6px">
        <span style="font-size:16px">👤</span>
        <div style="flex:1;font-size:11px">Add your first contact and try Clodura enrichment</div>
        <button class="btn-s" onclick="nav('contacts')" style="font-size:11px">Go to Contacts</button>
      </div>`:''}
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--s3);border-radius:6px">
        <span style="font-size:16px">🤖</span>
        <div style="flex:1;font-size:11px">Ask the AI helper a question about any LevelUp feature</div>
        <button class="btn-s" onclick="_helpTab='ask';renderHelp()" style="font-size:11px">Ask AI</button>
      </div>
    </div>
  </div>
</div>`;
}

function renderSettings(){$('settings-main').innerHTML=renderSettingsHTML()}
