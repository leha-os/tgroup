const SYNC_URL = 'https://script.google.com/macros/s/AKfycbxvGpMP9GXuQM6Nl2e316FnleRjvKf2b4X_T1FtEdzxJucHVlvWRPx3HGKxGD2INvNM/exec';
const SYNC_KEY = '0983351744';
const SYNC_QUEUE_KEY = 'nm2_sync_queue';
const SYNC_META_KEY = 'nm2_sync_meta';
const SYNC_POLL_MS = 30000;
let syncInFlight = false;
function syncMeta(){try{return JSON.parse(localStorage.getItem(SYNC_META_KEY)||'{}')}catch(e){return{}}}
function setSyncMeta(m){localStorage.setItem(SYNC_META_KEY,JSON.stringify(m))}
async function syncCall(action,data){const url=SYNC_URL+'?key='+encodeURIComponent(SYNC_KEY)+'&action='+encodeURIComponent(action)+'&data='+encodeURIComponent(JSON.stringify(data||{}));const res=await fetch(url,{method:'GET'});const out=await res.json();if(!out.ok)throw new Error(out.error||'sync failed');return out}
const KEEP_LOCAL_USER=['quyen','anhDataUrl'];
const KEEP_LOCAL_RECORD=['viDo','kinhDo','doChinhXac','viDoRa','kinhDoRa','doChinhXacRa'];
function syncMerge(local,remote,keyFn,keepFields){const byKey={};local.forEach(x=>{byKey[keyFn(x)]=x});remote.forEach(x=>{const k=keyFn(x);const cur=byKey[k];if(!cur){byKey[k]=x;return}if(String(x.updatedAt||'')>String(cur.updatedAt||'')){const merged=Object.assign({},x);keepFields.forEach(f=>{if(cur[f]!==undefined)merged[f]=cur[f]});if(!x.matKhau&&cur.matKhau)merged.matKhau=cur.matKhau;byKey[k]=merged}});return Object.values(byKey)}
async function syncNow(quiet){if(!SYNC_URL){if(!quiet)toast('Chưa cấu hình SYNC_URL');return}if(syncInFlight)return;syncInFlight=true;if(!quiet)toast('Đang đồng bộ...');try{
const meta=syncMeta();const lastPush=meta.lastPush||'';
const users=getUsers(),records=getRecords();
// 1. Đẩy trước: chỉ bản ghi mới/thay đổi từ lần đẩy trước — dòng đã xóa trên Sheet không bị đẩy lại
let _pu=0,_pi=0;
const usersDelta=lastPush?users.filter(u=>String(u.updatedAt||'')>lastPush):users;
for(let i=0;i<usersDelta.length;i+=15){const r=await syncCall('push',{users:usersDelta.slice(i,i+15),records:[]});_pu+=((r.result.users||{}).updated||0)+((r.result.users||{}).inserted||0)}
const recDelta=records.filter(r=>String(r.updatedAt||'')>lastPush);
for(let i=0;i<recDelta.length;i+=15){const r=await syncCall('push',{users:[],records:recDelta.slice(i,i+15)});_pi+=r.result.records.updated+r.result.records.inserted}
const queue=JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY)||'[]');if(queue.length){await syncCall('push',{users:[],records:queue});localStorage.setItem(SYNC_QUEUE_KEY,'[]')}
// 2. Kéo về: Sheet là nguồn chân lý cho chấm công — thay local bằng server (giữ lại trường chỉ có ở máy)
const pulled=await syncCall('pull');
const usersM=syncMerge(users,pulled.data.users||[],u=>u.sdt,KEEP_LOCAL_USER);
const byLocal={};records.forEach(r=>{byLocal[r.maBanGhi]=r});
const recordsM=(pulled.data.records||[]).map(x=>{const cur=byLocal[x.maBanGhi];if(!cur)return x;const m=Object.assign({},x);KEEP_LOCAL_RECORD.forEach(f=>{if(cur[f]!==undefined)m[f]=cur[f]});return m});
// 3. Báo mã đã bị xóa trên Sheet cho backend chặn vĩnh viễn (kẻo máy chạy app cũ đẩy lại)
const serverKeys={};(pulled.data.records||[]).forEach(x=>{if(x.maBanGhi)serverKeys[x.maBanGhi]=1});
const deletedKeys=records.filter(r=>r.maBanGhi&&!serverKeys[r.maBanGhi]).map(r=>r.maBanGhi);
if(deletedKeys.length&&meta.lastSync){try{await syncCall('tombstone',{keys:deletedKeys})}catch(e){}}
const changed=usersM.length!==users.length||recordsM.length!==records.length||JSON.stringify(usersM)!==JSON.stringify(users)||JSON.stringify(recordsM)!==JSON.stringify(records);
LocalDB.save(KEYS.users,usersM);LocalDB.save(KEYS.records,recordsM);if(changed)render();
setSyncMeta({lastSync:new Date().toISOString(),lastPush:new Date().toISOString()});
if(!quiet)toast('Đồng bộ xong ('+_pi+' ca, '+_pu+' nhân sự)');if(!changed&&!quiet)render();
}catch(err){const lp=syncMeta().lastPush||'';const queue=JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY)||'[]');const byKey={};queue.concat(getRecords().filter(r=>String(r.updatedAt||'')>lp)).forEach(r=>{byKey[r.maBanGhi]=r});localStorage.setItem(SYNC_QUEUE_KEY,JSON.stringify(Object.values(byKey)));if(!quiet)toast('Mất mạng — đã lưu hàng đợi, sẽ đồng bộ lại sau')}finally{syncInFlight=false}}
async function syncPushOne(record){if(!SYNC_URL)return;try{await syncCall('push',{users:[],records:[record]})}catch(e){}}
function syncStartRealtime(){if(!SYNC_URL)return;if(navigator.onLine)syncNow(true);setInterval(()=>{if(navigator.onLine)syncNow(true)},SYNC_POLL_MS);window.addEventListener('online',()=>syncNow(true))}
syncStartRealtime();
