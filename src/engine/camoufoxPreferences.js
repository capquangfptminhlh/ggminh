'use strict';
// Supported selection inputs for the OFFICIAL Camoufox identity generator.
// This is not a manual fingerprint writer and does not create a browser identity.
const LOCALES=Object.freeze(['vi-VN','en-US','en-GB','ja-JP','ko-KR','de-DE','fr-FR','th-TH','zh-CN']);
const TIMEZONES=Object.freeze(['Asia/Ho_Chi_Minh','Asia/Bangkok','Asia/Singapore',
 'Asia/Tokyo','Asia/Seoul','Europe/London','Europe/Berlin',
 'America/New_York','America/Los_Angeles','UTC']);
function validateCamoufoxPreferences(fp){
 if(!fp||typeof fp!=='object'||Array.isArray(fp))
  throw Error('Invalid Camoufox preference object');
 const language=fp.language===undefined?null:fp.language;
 const languages=fp.languages;
 const timezone=fp.timezone===undefined?null:fp.timezone;
 if(language!==null&&(!LOCALES.includes(language)))
  throw Error('Unsupported Camoufox language selection');
 if(languages!==undefined){
  // Preserve legacy profiles whose declared language preference is a
  // canonical ordered list (for example vi-VN, vi, en-US, en). The official
  // generator still uses ONLY the first language as its locale constraint.
  if(!Array.isArray(languages)||languages.length<1||languages.length>8||
   !LOCALES.includes(languages[0])||
   languages.some(v=>typeof v!=='string'||v.length>35)||
   (language!==null&&languages[0]!==language))
   throw Error('Camoufox language selections disagree or are unsupported');
  try {
   for(const lang of languages)Intl.getCanonicalLocales(lang);
  }catch(_){throw Error('Camoufox language selections disagree or are unsupported')}
 }
 if(timezone!==null&&!TIMEZONES.includes(timezone))
  throw Error('Unsupported Camoufox timezone selection');
 return {language:language||languages?.[0]||null,timezone};
}
module.exports={LOCALES,TIMEZONES,validateCamoufoxPreferences};
