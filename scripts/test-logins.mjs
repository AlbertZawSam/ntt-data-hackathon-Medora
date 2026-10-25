#!/usr/bin/env node
/**
 * Ready-to-use test accounts for one hospital in YOUR sandbox, and a local login page to use them.
 *
 *   npm run test-logins -- <hospitalId> [--profile <aws-profile>]
 *
 * For each demo account (admin, one per unit, doctor; docs/roles.md) it creates the user in the
 * staff pool, finishes the first sign-in the way the app does (permanent password, then an
 * authenticator secret), and writes scripts/.local/test-logins.html: copy buttons for each email
 * and password and a live 6-digit code, so nobody needs a phone or terminal copy and paste.
 *
 * The page and scripts/.local/test-logins.json hold passwords and authenticator secrets for
 * synthetic test accounts. They stay on your laptop (scripts/.local/ is ignored by Git); never
 * commit or share them. Each teammate runs this against their own sandbox. Re-running keeps the
 * accounts it already set up. Calls only Cognito user actions on the staff pool (AdminCreateUser,
 * AdminAddUserToGroup, AdminSetUserPassword) and the normal sign-in; costs nothing.
 */
import { createHash, createHmac, randomInt } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { fromIni } from '@aws-sdk/credential-providers';
import { Amplify } from 'aws-amplify';
import { confirmSignIn, signIn, signOut } from 'aws-amplify/auth';

const args = process.argv.slice(2);
const hospitalId = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--profile');
const profile = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : process.env.AWS_PROFILE;
/** `--departments`: only the department staff of the demo hospitals with all three departments (6 accounts). */
const departmentsOnly = args.includes('--departments');
if (!departmentsOnly && (!hospitalId || !/^H-[0-9a-f]{16}$/.test(hospitalId))) {
  console.error('Usage: npm run test-logins -- <hospitalId> [--profile <aws-profile>]');
  console.error('   or: npm run test-logins -- --departments   (department staff of the two demo hospitals)');
  console.error('Hospital ids are printed by `npm run seed` (for example Siam Central: H-a154080ed58d7b39).');
  process.exit(1);
}

const root = resolve(dirname(process.argv[1]), '..');
const outputs = JSON.parse(readFileSync(resolve(root, 'frontend', 'amplify_outputs.json'), 'utf8'));
const staff = outputs.custom?.staffAuth;
if (!staff) {
  console.error('No staff pool in frontend/amplify_outputs.json. Run `npm run sandbox` first.');
  process.exit(1);
}
if (staff.region !== 'us-east-1') {
  console.error(`Refusing to run in ${staff.region}: this project deploys to us-east-1 only.`);
  process.exit(1);
}

const seedId = (key) => `H-${createHash('sha256').update(`medora-demo:${key}`).digest('hex').slice(0, 16)}`;
const DEMO = JSON.parse(readFileSync(resolve(root, 'shared', 'data', 'hospitals.json'), 'utf8')).hospitals;
const slug = (hospitalId ?? '').slice(2, 8);
let ACCOUNTS = [
  { email: `doctor.${slug}@medora.demo`, group: 'doctors', role: 'Doctor: AI referral, confirm, transfers' },
  { email: `er.${slug}@medora.demo`, group: 'hospital_staff', unit: 'er', role: 'Emergency nurse: ER open or diverting, inbox' },
  { email: `ward.${slug}@medora.demo`, group: 'hospital_staff', unit: 'ward', role: 'Ward nurse: general beds' },
  { email: `icu.${slug}@medora.demo`, group: 'hospital_staff', unit: 'icu', role: 'ICU nurse: ICU beds' },
  { email: `nicu.${slug}@medora.demo`, group: 'hospital_staff', unit: 'nicu', role: 'NICU nurse: NICU cots' },
  { email: `radiology.${slug}@medora.demo`, group: 'hospital_staff', unit: 'radiology', role: 'Radiology: CT and MRI' },
  { email: `cathlab.${slug}@medora.demo`, group: 'hospital_staff', unit: 'cathlab', role: 'Cath lab team' },
  { email: `admin.${slug}@medora.demo`, group: 'admins', role: 'Hospital admin: settings, staff, auto-accept rules' },
];

// Department staff (shared/logic/departments.ts): one account per department this demo hospital has.
// A patient request to that department reaches only this account's inbox.
const DEPARTMENTS = [
  { unit: 'cardiology', dept: 'cardio', role: 'Cardiology staff: patient requests to Cardiology' },
  { unit: 'surgery', dept: 'ortho', role: 'Surgery staff: patient requests to Surgery' },
  { unit: 'obstetrics', dept: 'obstetrics', role: 'Obstetrics staff: patient requests to Obstetrics' },
];
const demo = DEMO.find((h) => seedId(h.key) === hospitalId);
for (const d of [...DEPARTMENTS].reverse()) {
  if (demo?.departments.includes(d.dept)) ACCOUNTS.splice(2, 0, { email: `${d.unit}.${slug}@medora.demo`, group: 'hospital_staff', unit: d.unit, role: d.role });
}
ACCOUNTS = ACCOUNTS.map((a) => ({ ...a, hospitalId, section: '' }));

const DEPARTMENT_NAMES = { cardiology: 'Cardiology', surgery: 'Surgery', obstetrics: 'Obstetrics' };
if (departmentsOnly) {
  // One account per department, readable emails: cardiology.rama9@medora.demo and so on.
  ACCOUNTS = DEMO.filter((h) => DEPARTMENTS.every((d) => h.departments.includes(d.dept))).flatMap((h) => [
    // The hospital's referring doctor: runs the AI referral (for example a heart attack from Chao Phraya to Rama Nine).
    { email: `doctor.${h.key}@medora.demo`, group: 'doctors', role: 'Doctor: refer patients, accept incoming referrals', hospitalId: seedId(h.key), section: h.name.en },
    // General / emergency requests (no department) go to the emergency unit.
    { email: `general.${h.key}@medora.demo`, group: 'hospital_staff', unit: 'er', role: 'General (emergency): requests without a department', hospitalId: seedId(h.key), section: h.name.en },
    // The ward nurse adds or removes free beds (for example to show a hospital filling up).
    { email: `ward.${h.key}@medora.demo`, group: 'hospital_staff', unit: 'ward', role: 'Ward: free beds (+ and −)', hospitalId: seedId(h.key), section: h.name.en },
    ...DEPARTMENTS.map((d) => ({
      role: `${DEPARTMENT_NAMES[d.unit]}: requests and equipment`,
      email: `${d.unit}.${h.key}@medora.demo`,
      group: 'hospital_staff',
      unit: d.unit,
      hospitalId: seedId(h.key),
      section: h.name.en,
    })),
  ]);
}

const localDir = resolve(root, 'scripts', '.local');
const storePath = resolve(localDir, 'test-logins.json');
mkdirSync(localDir, { recursive: true });
/** Accounts set up on earlier runs, keyed by staff pool so a new sandbox starts fresh. */
const store = existsSync(storePath) ? JSON.parse(readFileSync(storePath, 'utf8')) : {};
const saved = (store[staff.userPoolId] ??= {});

/** 16 characters with upper, lower, digit and symbol, which satisfies the pool's 12-character policy. */
function password() {
  const pick = (chars) => chars[randomInt(chars.length)];
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!#$%*+-=?'];
  const all = sets.join('');
  const chars = sets.map(pick);
  while (chars.length < 16) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hash = createHmac('sha1', key).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

const cognito = new CognitoIdentityProviderClient({ region: staff.region, ...(profile ? { credentials: fromIni({ profile }) } : {}) });
Amplify.configure({
  Auth: { Cognito: { userPoolId: staff.userPoolId, userPoolClientId: staff.userPoolClientId, loginWith: { email: true } } },
});

/** First sign-in as the app does it: temporary password, own password, then the authenticator. */
async function finishSetup(email, temporary) {
  const permanent = password();
  let step = (await signIn({ username: email, password: temporary })).nextStep;
  if (step.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') step = (await confirmSignIn({ challengeResponse: permanent })).nextStep;
  if (step.signInStep !== 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP') throw new Error(`unexpected step ${step.signInStep}`);
  const secret = step.totpSetupDetails.sharedSecret;
  step = (await confirmSignIn({ challengeResponse: totp(secret) })).nextStep;
  if (step.signInStep !== 'DONE') throw new Error(`unexpected step ${step.signInStep}`);
  await signOut();
  return { password: permanent, secret };
}

console.log(`Test accounts for ${departmentsOnly ? 'the demo departments' : hospitalId} in staff pool ${staff.userPoolId} (us-east-1)\n`);
await signOut().catch(() => undefined);
for (const account of ACCOUNTS) {
  if (saved[account.email]) {
    console.log(`${account.email.padEnd(36)} ready (set up earlier)`);
    continue;
  }
  const temporary = password();
  try {
    try {
      await cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: staff.userPoolId,
          Username: account.email,
          TemporaryPassword: temporary,
          MessageAction: 'SUPPRESS',
          UserAttributes: [
            { Name: 'email', Value: account.email },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'custom:hospitalId', Value: account.hospitalId },
            ...(account.unit ? [{ Name: 'custom:unit', Value: account.unit }] : []),
          ],
        }),
      );
      await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: staff.userPoolId, Username: account.email, GroupName: account.group }));
    } catch (error) {
      if (error.name !== 'UsernameExistsException') throw error;
      // Made earlier by create-test-users.mjs and never signed in to: give it a new temporary password.
      await cognito.send(new AdminSetUserPasswordCommand({ UserPoolId: staff.userPoolId, Username: account.email, Password: temporary, Permanent: false }));
    }
    const { password: permanent, secret } = await finishSetup(account.email, temporary);
    saved[account.email] = { group: account.group, unit: account.unit ?? '', role: account.role, password: permanent, secret, hospitalId: account.hospitalId };
    writeFileSync(storePath, JSON.stringify(store, null, 2), { mode: 0o600 });
    console.log(`${account.email.padEnd(36)} ready`);
  } catch (error) {
    await signOut().catch(() => undefined);
    // An account that already has an authenticator can't be set up again without its secret.
    console.log(`${account.email.padEnd(36)} skipped (${error.name === 'Error' ? error.message : error.name}); it already finished sign-in setup elsewhere`);
  }
}

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rows = ACCOUNTS.filter((account) => saved[account.email]).map((account, i, list) => {
  const s = saved[account.email];
  const heading = account.section && account.section !== list[i - 1]?.section ? `<h2>${escape(account.section)}</h2>` : '';
  return `${heading}<div class="card"><div class="role">${escape(account.role)}</div>
<div class="row"><span class="lab">Email</span><code id="e${i}">${escape(account.email)}</code><button onclick="cp('e${i}',this)">Copy</button></div>
<div class="row"><span class="lab">Password</span><code id="p${i}">${escape(s.password)}</code><button onclick="cp('p${i}',this)">Copy</button></div>
<div class="row"><span class="lab">Code</span><code class="code" id="c${i}" data-secret="${escape(s.secret)}">------</code><button onclick="cp('c${i}',this)">Copy</button></div></div>`;
});

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${departmentsOnly ? 'Medora department logins' : 'Medora test logins'}</title>
<style>
:root{--bg:#F6F8F7;--card:#fff;--ink:#0E2A23;--muted:#4F635D;--line:#D5DEDA;--green:#0B6E57}
@media (prefers-color-scheme:dark){:root{--bg:#08191A;--card:#10282A;--ink:#E8F1EE;--muted:#A3B8B1;--line:#24423F;--green:#3FBF9B}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif}
main{max-width:620px;margin:0 auto;padding:24px 16px}h1{font-size:24px;margin:0 0 4px}p{margin:4px 0;color:var(--muted)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:12px 0}
.role{font-weight:600;margin-bottom:4px}.row{display:flex;align-items:center;gap:8px;margin:6px 0}.lab{width:76px;color:var(--muted);font-size:14px;flex:none}
code{flex:1;min-width:0;font-size:15px;word-break:break-all}.code{font:700 26px ui-monospace,monospace;letter-spacing:4px}
button,a.btn{background:var(--green);color:#fff;border:0;border-radius:8px;padding:8px 14px;font:600 14px system-ui;cursor:pointer;text-decoration:none;display:inline-block;flex:none}
a.big{display:block;text-align:center;padding:14px;font-size:17px;margin-top:8px}#bar{height:6px;background:var(--line);border-radius:3px;overflow:hidden;margin-top:8px}#fill{height:100%;background:var(--green)}
ol{padding-left:20px;margin:6px 0}h2{font-size:19px;margin:28px 0 4px}
</style></head><body><main>
<h1>${departmentsOnly ? 'Medora department logins' : 'Medora test logins'}</h1>
<p>${departmentsOnly ? 'Doctor and department staff of the two demo hospitals: a request sent to a department reaches that department.' : `Synthetic test accounts for hospital ${escape(hospitalId)}.`} In your own sandbox; keep this page on your laptop, don't share it.</p>
<div class="card"><ol>
<li>Open the app (run <b>npm run web</b> first), then click <b>"Doctor or hospital staff? Sign in here"</b>.</li>
<li>Copy the email and password of the account below, click <b>Sign In</b>.</li>
<li>Copy its 6-digit code (it changes every 30 seconds) and click <b>Verify code</b>.</li>
<li>To switch account: open the <b>account menu</b> (profile icon, top right) → <b>Sign out</b>, then repeat with another card.</li></ol>
<a class="btn big" href="http://localhost:8081" target="_blank">Open Medora →</a>
<div id="bar"><div id="fill"></div></div></div>
${rows.join('\n')}
</main>
<script>
function cp(id,b){const t=document.getElementById(id).textContent;const done=()=>{b.textContent="Copied";setTimeout(()=>b.textContent="Copy",1200)};
 const fb=()=>{const a=document.createElement("textarea");a.value=t;document.body.appendChild(a);a.select();document.execCommand("copy");a.remove();done()};
 if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(t).then(done,fb);else fb()}
function b32(s){const A="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let bits="";for(const c of s.replace(/=+$/,"").toUpperCase())bits+=A.indexOf(c).toString(2).padStart(5,"0");const o=[];for(let i=0;i+8<=bits.length;i+=8)o.push(parseInt(bits.slice(i,i+8),2));return o}
function sha1(m){const r=(n,c)=>(n<<c)|(n>>>(32-c));let h0=0x67452301,h1=0xEFCDAB89,h2=0x98BADCFE,h3=0x10325476,h4=0xC3D2E1F0;const l=m.length*8;m=m.concat([0x80]);while(m.length%64!==56)m.push(0);for(let i=7;i>=0;i--)m.push(i>3?0:(l>>>(i*8))&255);
 for(let j=0;j<m.length;j+=64){const w=[];for(let i=0;i<16;i++)w[i]=(m[j+4*i]<<24)|(m[j+4*i+1]<<16)|(m[j+4*i+2]<<8)|m[j+4*i+3];for(let i=16;i<80;i++)w[i]=r(w[i-3]^w[i-8]^w[i-14]^w[i-16],1);
 let a=h0,b=h1,c=h2,d=h3,e=h4;for(let i=0;i<80;i++){const f=i<20?(b&c)|(~b&d):i<40?b^c^d:i<60?(b&c)|(b&d)|(c&d):b^c^d;const k=i<20?0x5A827999:i<40?0x6ED9EBA1:i<60?0x8F1BBCDC:0xCA62C1D6;const t=(r(a,5)+f+e+k+w[i])|0;e=d;d=c;c=r(b,30);b=a;a=t}
 h0=(h0+a)|0;h1=(h1+b)|0;h2=(h2+c)|0;h3=(h3+d)|0;h4=(h4+e)|0}const out=[];for(const h of [h0,h1,h2,h3,h4])for(let i=3;i>=0;i--)out.push((h>>>(i*8))&255);return out}
function hmac(k,m){if(k.length>64)k=sha1(k);while(k.length<64)k.push(0);const ip=k.map(x=>x^0x36),op=k.map(x=>x^0x5c);return sha1(op.concat(sha1(ip.concat(m))))}
function totp(secret){const c=Math.floor(Date.now()/30000);const m=[];for(let i=7;i>=0;i--)m.push(i>=4?0:(c>>>(i*8))&255);const h=hmac(b32(secret),m);const o=h[19]&15;
 const n=((h[o]&127)<<24)|(h[o+1]<<16)|(h[o+2]<<8)|h[o+3];return String(n%1e6).padStart(6,"0")}
function tick(){for(const el of document.querySelectorAll("[data-secret]"))el.textContent=totp(el.dataset.secret);document.getElementById("fill").style.width=((30-Math.floor(Date.now()/1000)%30)/30*100)+"%"}
tick();setInterval(tick,1000);
</script></body></html>`;

const pagePath = resolve(localDir, departmentsOnly ? 'department-logins.html' : 'test-logins.html');
writeFileSync(pagePath, page, { mode: 0o600 });
console.log(`\nLogin page: ${pagePath}`);
if (process.platform === 'darwin') execFile('open', [pagePath]);
else if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', pagePath]);
else execFile('xdg-open', [pagePath], () => undefined);
