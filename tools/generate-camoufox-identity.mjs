// Provisioning tool: draw ONE internally-consistent Camoufox identity with
// the official `camoufox` launcher library and print it as a storable
// per-profile identity (CAMOU_CONFIG chunks + measurement expectations).
// The app runtime never generates identities; it only replays a stored blob
// (src/engine/camoufoxIdentity.js). Run with Node >= 22 and the pinned
// packages installed, e.g. in CI next to the verified Camoufox executable:
//
//   node tools/generate-camoufox-identity.mjs \
//     --executable-path C:\path\to\camoufox.exe \
//     --os windows --locale en-US --timezone America/New_York \
//     --out identity.json
//
// Only documented launcher options are used. No value is hand-assembled:
// fpgen draws the identity; `config` carries only the timezone override,
// which is the documented raw-config route for timezones. The uBlock addon
// download is excluded so generation stays offline and launch-neutral.
import fs from 'node:fs';
import {launchOptions} from 'camoufox';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {parseCamouConfigEnv,summarizeIdentity}=
 require('../src/engine/camoufoxIdentity.js');
const pkg=require('camoufox/package.json');

function arg(name){
 const i=process.argv.indexOf('--'+name);
 return i>=0?process.argv[i+1]:null;
}
const executablePath=arg('executable-path');
const os=arg('os')||'windows';
const locale=arg('locale');
const timezone=arg('timezone');
const out=arg('out');
if(!executablePath||!fs.existsSync(executablePath))
 throw Error('A real Camoufox executable path is required (--executable-path)');

const options={
 os,executable_path:executablePath,
 exclude_addons:['UBO'],
 i_know_what_im_doing:true
};
if(locale)options.locale=locale;
if(timezone)options.config={timezone};

const launch=await launchOptions(options);
const env={};
for(const key of Object.keys(launch.env||{}).sort())
 if(/^CAMOU_CONFIG_\d+$/.test(key))env[key]=launch.env[key];
if(!Object.keys(env).length)
 throw Error('Official launcher returned no CAMOU_CONFIG chunks');
const config=parseCamouConfigEnv(env);
const expectations=summarizeIdentity(config);
if(!expectations.userAgent||!expectations.platform)
 throw Error('Generated identity is missing user agent or platform');
const identity={
 format:'camoufox-camou-config',version:1,
 generator:'camoufox@'+pkg.version,
 generatedAt:new Date().toISOString(),
 constraints:{os,locale:locale||null,timezone:timezone||null},
 env,expectations
};
const text=JSON.stringify(identity,null,2);
if(out)fs.writeFileSync(out,text+'\n');else console.log(text);
console.error('identity generated: UA=%s platform=%s lang=%s tz=%s screen=%sx%s',
 expectations.userAgent,expectations.platform,expectations.language,
 expectations.timezone,expectations.screenWidth,expectations.screenHeight);
