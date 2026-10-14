const SYNC_URL = 'https://script.google.com/macros/s/AKfycbxvGpMP9GXuQM6Nl2e316FnleRjvKf2b4X_T1FtEdzxJucHVlvWRPx3HGKxGD2INvNM/exec';
const SYNC_KEY = '0983351744';
const SYNC_QUEUE_KEY = 'nm2_sync_queue';
const SYNC_META_KEY = 'nm2_sync_meta';
const SYNC_POLL_MS = 30000;
let syncInFlight = false;
function syncMeta(){try{return JSON.parse(localStorage.getItem(SYNC_META_KEY)||'{}')}catch(e){return{}}}
function setSyncMeta(m){localStorage.setItem(SYNC_META_KEY,JSON.stringify(m))}
async function syncCall(action,data){const res=await fetch(SYNC_URL,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({key:SYNC_KEY,action,data})});const out=await res.json();if(!out.ok)throw new Error(out.error||'sync failed');return out}
const KEEP_LOCAL_USER=['matKhau','quyen','anhDataUrl'];
const KEEP_LOCAL_RECORD=['viDo','kinhDo','doChinhXac','viDoRa','kinhDoRa','doChinhXacRa'];
function syncMerge(local,remote,keyFn,keepFields){const byKey={};local.forEach(x=>{byKey[keyFn(x)]=x});remote.forEach(x=>{const k=keyFn(x);const cur=byKey[k];if(!cur){byKey[k]=x;return}if(String(x.updatedAt||'')>String(cur.updatedAt||'')){const merged=Object.assign({},x);keepFields.forEach(f=>{if(cur[f]!==undefined)merged[f]=cur[f]});byKey[k]=merged}});return Object.values(byKey)}
async function syncNow(quiet){if(!SYNC_URL){if(!quiet)toast('Chưa cấu hình SYNC_URL');return}if(syncInFlight)return;syncInFlight=true;if(!quiet)toast('Đang đồng bộ...');try{const pulled=await syncCall('pull');const users=syncMerge(getUsers(),pulled.data.users||[],u=>u.sdt,KEEP_LOCAL_USER);const records=syncMerge(getRecords(),pulled.data.records||[],r=>r.maBanGhi,KEEP_LOCAL_RECORD);const changed=users.length!==getUsers().length||records.length!==getRecords().length||JSON.stringify(users)!==JSON.stringify(getUsers())||JSON.stringify(records)!==JSON.stringify(getRecords());LocalDB.save(KEYS.users,users);LocalDB.save(KEYS.records,records);const pushed=await syncCall('push',{users,records});const queue=JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY)||'[]');if(queue.length){await syncCall('push',{users:[],records:queue});localStorage.setItem(SYNC_QUEUE_KEY,'[]')}setSyncMeta({lastSync:new Date().toISOString()});if(!quiet)toast('Đồng bộ xong ('+(pushed.result.records.updated+pushed.result.records.inserted)+' ca, '+(pushed.result.users.updated+pushed.result.users.inserted)+' nhân sự)');if(changed)render();else if(!quiet)render()}catch(err){const queue=JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY)||'[]');const byKey={};queue.concat(getRecords()).forEach(r=>{byKey[r.maBanGhi]=r});localStorage.setItem(SYNC_QUEUE_KEY,JSON.stringify(Object.values(byKey)));if(!quiet)toast('Mất mạng — đã lưu hàng đợi, sẽ đồng bộ lại sau')}finally{syncInFlight=false}}
async function syncPushOne(record){if(!SYNC_URL)return;try{await syncCall('push',{users:[],records:[record]})}catch(e){}}
function syncStartRealtime(){if(!SYNC_URL)return;if(navigator.onLine)syncNow(true);setInterval(()=>{if(navigator.onLine)syncNow(true)},SYNC_POLL_MS);window.addEventListener('online',()=>syncNow(true))}
syncStartRealtime();
