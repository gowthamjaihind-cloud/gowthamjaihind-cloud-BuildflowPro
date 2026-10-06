// Tenant-isolation probe against the LOCAL emulator suite (never production).
//
//   npm run emulators            # terminal 1
//   node scripts/emulator-tenant-probe.mjs
//
// Creates an org through the real createOrganization callable, then checks what
// a freshly signed-up user with NO membership can reach. Every line should read
// "denied" except the owner's own read.
//
// BEFORE TRUSTING A RUN: confirm the rules engine did not crash --
//   grep -c 'rules runtime error' <emulator log>   # must be 0
// JAVA_TOOL_OPTIONS breaks it and rules then stop being enforced while the
// emulator still looks healthy. scripts/emulators.sh unsets it for this reason.
//
// Known failure as of this commit: QUERY organizations is ALLOWED and leaks
// every org's companyName, plan, subscriptionStatus and members map, because
// firestore.rules uses `allow read` (which covers list) and resource.data is
// unset during a query, so thisOrgUnclaimed() defaults to true. The fix is to
// split the verb into `allow get` / `allow list: if false` -- the client only
// ever reads organizations by document id, never as a collection.
const PROJ='demo-sitetru', DB='ai-studio-97ffdc85-b348-4a76-9ede-baa3db65adee', REGION='asia-southeast1';
const AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const BASE=`http://127.0.0.1:8080/v1/projects/${PROJ}/databases/${DB}/documents`;
const su=async(e,p)=>{await fetch(`${AUTH}/accounts:signUp?key=fake`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e,password:p,returnSecureToken:true})}).catch(()=>{});
 return (await (await fetch(`${AUTH}/accounts:signInWithPassword?key=fake`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e,password:p,returnSecureToken:true})})).json());};
const call=(tok,n,data={})=>fetch(`http://127.0.0.1:5001/${PROJ}/${REGION}/${n}`,{method:'POST',
  headers:{'Content-Type':'application/json',Authorization:`Bearer ${tok}`},body:JSON.stringify({data})}).then(r=>r.json());

const owner=await su(`owner${Date.now()}@example.com`,'TestPass!2345');
const made=await call(owner.idToken,'createOrganization',{companyName:'Acme Builders Pvt Ltd',plan:'starter',startTrial:true});
const orgId=made.result?.orgId;
console.log('org created:',orgId, '| plan:',made.result?.plan, made.result?.subscriptionStatus);
const owner2=await su(`x`,'y').catch(()=>null); // noop
const ownerTok=(await su(JSON.parse(JSON.stringify(owner)).email||'', 'TestPass!2345')).idToken || owner.idToken;

const atk=await su(`attacker${Date.now()}@example.com`,'AttackPass!2345');
console.log('attacker is a brand-new signed-in user with no membership\n');

const probe=async(label,fn)=>{ const v=await fn(); console.log(`  ${label.padEnd(46)} ${v}`); };
const get=async(tok,path)=>{const r=await fetch(`${BASE}/${path}`,{headers:{Authorization:`Bearer ${tok}`}});return r.status===200?'*** ALLOWED ***':`denied (${r.status})`;};
const query=async(tok,coll)=>{const r=await fetch(`${BASE}:runQuery`,{method:'POST',headers:{Authorization:`Bearer ${tok}`,'Content-Type':'application/json'},
  body:JSON.stringify({structuredQuery:{from:[{collectionId:coll}],limit:20}})});
  const j=await r.json(); const rows=(Array.isArray(j)?j:[j]).filter(x=>x.document);
  if(r.status!==200||j.error||j[0]?.error) return `denied (${r.status})`;
  return rows.length?`*** ALLOWED — ${rows.length} doc(s) leaked ***`:'allowed but empty';};

console.log('ATTACKER vs the victim org:');
await probe('GET  organizations/{id}',()=>get(atk.idToken,`organizations/${orgId}`));
await probe('QUERY organizations (collection scan)',()=>query(atk.idToken,'organizations'));
await probe('GET  app_config/razorpay (LIVE KEYS)',()=>get(atk.idToken,'app_config/razorpay'));
await probe('QUERY app_config',()=>query(atk.idToken,'app_config'));
await probe('QUERY projects',()=>query(atk.idToken,'projects'));
await probe('GET  org usage',()=>get(atk.idToken,`organizations/${orgId}/usage/2026-10`));
console.log('\nOWNER vs own org (should all be allowed):');
await probe('GET  own org',()=>get(ownerTok,`organizations/${orgId}`));
