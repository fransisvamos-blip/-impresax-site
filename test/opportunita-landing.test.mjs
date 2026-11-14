import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";

const html=readFileSync(new URL("../public/opportunita/index.html",import.meta.url),"utf8");
const privacy=readFileSync(new URL("../public/opportunita/privacy.html",import.meta.url),"utf8");
const css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1]??"";
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]??"";

test("faithful V3 rendering: correct desktop chapter sequence and headline",()=>{
 assert.match(css,/REFERENCE V3/);
 assert.match(html,/id="hero-title"[^>]*><span>LOUNGE BAR<\/span><span>A CATANZARO<\/span><span>LIDO\.<\/span>/);
 assert.match(html,/IN CESSIONE O GESTIONE\./);
 assert.match(html,/TRATTATIVA<br>RISERVATA\./);
 assert.equal((html.match(/<h1\b/g)||[]).length,1);
 const sections=["id=\"top\"","id=\"formule\"","id=\"vantaggi\"","id=\"storia\"","id=\"come-funziona\"","id=\"contatto\""];
 const locations=sections.map(x=>html.indexOf(x));
 assert.ok(locations.every(x=>x>0));
 assert.deepEqual(locations,[...locations].sort((a,b)=>a-b));
 assert.doesNotMatch(html,/id="visual-gallery-title"|class="deal-sheet"|class="choice-shell"|class="faq"/);
});
test("clean modern system: white navy orange peach, no italics or inherited CSS",()=>{
 assert.match(css,/--navy:#102c41/);
 assert.match(css,/--orange:#f26520/);
 assert.match(css,/--warm:#fbfaf8/);
 assert.match(css,/--peach:#fce6d7/);
 assert.equal((html.match(/<style>/g)||[]).length,1);
 assert.doesNotMatch(css,/GALLERY 08|VISUAL ENRICHMENT V3|MEDITERRANEAN EDITORIAL|ATELIER 01/);
 assert.doesNotMatch(css,/font-style:italic|var\(--serif\)/);
 assert.doesNotMatch(html,/<\/?em>/);
 assert.match(css,/\.hero-media:after\{[^}]*linear-gradient\(90deg/);
 assert.match(css,/\.offer-card--buy\{[^}]*background:radial-gradient/);
 assert.match(css,/\.offer-card--manage\{[^}]*background:linear-gradient/);
});
test("visual hierarchy matches desktop render: options, editorial benefits, story and three steps",()=>{
 assert.match(css,/\.offer-layout\{display:grid;grid-template-columns:\.93fr 1fr 1fr/);
 assert.match(css,/\.why-layout\{display:grid;grid-template-columns:1\.2fr repeat\(3,\.85fr\)/);
 assert.match(css,/\.story-section\{display:grid;grid-template-columns:1fr 1fr/);
 assert.match(css,/\.steps-layout\{display:grid;grid-template-columns:1\.15fr repeat\(3,\.86fr\)/);
 assert.match(css,/\.contact-panel\{[^}]*grid-template-columns:\.92fr 1\.08fr/);
 assert.equal((html.match(/class="why-item"/g)||[]).length,3);
 assert.equal((html.match(/class="step"/g)||[]).length,3);
 assert.equal((html.match(/class="offer-card /g)||[]).length,2);
 assert.match(html,/7<\/b><span>ANNI DI ATTIVITÀ/);
});
test("mobile is purpose-designed, with nav, curved image, stacked cards and form",()=>{
 assert.match(css,/@media\(max-width:1100px\)/);
 assert.match(css,/@media\(max-width:810px\)/);
 assert.match(css,/@media\(max-width:670px\)/);
 assert.match(css,/@media\(max-width:385px\)/);
 assert.match(css,/\.hero-media\{order:1;position:relative/);
 assert.match(css,/clip-path:ellipse\(79% 100% at 50% 0%\)/);
 assert.match(css,/\.offer-layout\{grid-template-columns:1fr;gap:11px\}/);
 assert.match(css,/\.why-layout\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/\.steps-layout\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/\.story-media\{display:none\}/);
 assert.match(css,/\.contact-panel\{border-radius:28px 28px 0 0/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(html,/id="menu-toggle"[^>]*aria-label="Apri menu"[^>]*aria-controls="main-nav"[^>]*aria-expanded="false"/);
});
test("two real commercial-use licensed atmosphere images never misrepresent the venue",()=>{
 assert.equal((html.match(/<img\b/g)||[]).length,2);
 assert.match(html,/photo-1767878032664-cd1d61f0e076/);
 assert.match(html,/photo-1774806245018-a2bdd2eb620b/);
 assert.match(html,/alt="Terrazza[^"]*non raffigura il lounge bar/);
 assert.match(html,/alt="Cocktail[^"]*fotografia illustrativa/);
 assert.match(html,/non è il locale/);
 assert.match(html,/Unsplash/);
 assert.match(html,/loading="lazy"/);
 assert.match(html,/fetchpriority="high"/);
});
test("claims are factual and consent text is accurate",()=>{
 assert.match(html,/secondo quanto comunicato dai titolari/);
 assert.match(html,/L'immobile non è in vendita/);
 assert.match(html,/verifica documentale/);
 assert.doesNotMatch(html,/(?:300[., ]?000|300000|€\s*300)/);
 assert.doesNotMatch(html,/fatturato garantito|redditività garantita|documenti verificati/i);
 assert.match(html,/Privacy|privacy/);
});
test("conversion funnel: selectable cessione, gestione, entrambe; no fake default",()=>{
 assert.equal((html.match(/class="interest-chip"/g)||[]).length,3);
 assert.match(html,/id="transaction_interest" name="transaction_interest"/);
 for(const choice of ["cessione","gestione","entrambe"]){
   assert.match(html,new RegExp('data-choice="'+choice+'"'));
 }
 assert.match(js,/function pick\(choice,scroll\)/);
 assert.match(js,/transaction\.value=choice/);
 assert.match(js,/contact\.scrollIntoView/);
 assert.match(js,/if\(!transaction\.value\)/);
 assert.match(js,/choices\.indexOf\(urlParams\.get\('interesse'\)\)/);
});
test("lead submission still matches backend fields, UTM source and validation",()=>{
 assert.equal((html.match(/<form\b/g)||[]).length,1);
 for(const field of ["full_name","phone","email","transaction_interest","company_site","privacy_accepted"])
   assert.match(html,new RegExp('name="'+field+'"'));
 assert.match(html,/id="full_name"[^>]*required/);
 assert.match(html,/id="phone"[^>]*required/);
 assert.match(html,/id="privacy_accepted"[^>]*required/);
 assert.match(js,/privacy_accepted:fields\.get\('privacy_accepted'\)==='on'/);
 assert.match(js,/fetch\('\/api\/interesse'/);
 assert.match(js,/budget_band:'da-definire'/);
 assert.match(js,/timeline:'da-definire'/);
 assert.match(js,/experience:'preferisco-non-dire'/);
 assert.match(js,/utm_campaign:urlParams\.get\('utm_campaign'\)/);
 assert.match(js,/response\.ok\|\|!data\.ok/);
 assert.match(js,/setTimeout\(function\(\)\{controller\.abort\(\)\},16000\)/);
 new Script(js,{filename:"landing-v3.js"});
});
test("privacy and official contact routes remain reachable",()=>{
 assert.match(html,/tel:\+393294582962/);
 assert.match(html,/mailto:info@impresax\.org/);
 assert.match(html,/href="\/privacy"/);
 assert.match(html,/id="form-feedback" class="form-feedback" role="status" aria-live="polite"/);
 assert.match(privacy,/Informativa sulla privacy/);
 assert.match(privacy,/info@impresax\.org/);
 assert.match(privacy,/titolare del trattamento/);
});

test("V3.1 adds original vector detail and clear trust cues without changing structure",()=>{
 assert.match(css,/V3\.1 — art-direction polish/);
 assert.equal((html.match(/class="offer-card-art"/g)||[]).length,2);
 assert.match(html,/7 ANNI DI ATTIVITÀ DICHIARATI/);
 assert.match(html,/ACCESSO AL PRIMO CONFRONTO RISERVATO/);
 assert.match(css,/\.hero-assurance\{display:flex/);
 assert.match(css,/\.form-input:focus-within\{border-color:/);
 assert.match(css,/\.offer-card-art\{position:absolute/);
 assert.match(css,/\.offer-card:focus-visible/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.equal((html.match(/<section\b/g)||[]).length,6);
});
test("responsive image sizes and efficient original imagery",()=>{
 assert.equal((html.match(/srcset="/g)||[]).length,2);
 assert.match(html,/sizes="\(max-width:670px\) 100vw, \(max-width:1100px\) 68vw, 64vw"/);
 assert.match(html,/sizes="\(max-width:670px\) 1px, \(max-width:1100px\) 50vw, 50vw"/);
 assert.match(html,/fetchpriority="high"/);
 assert.match(html,/loading="lazy"/);
 assert.equal((html.match(/<img\b/g)||[]).length,2);
});
test("mobile sticky action is progressive, hides over contact and has accessible quick call",()=>{
 assert.match(html,/class="mobile-action" role="navigation" aria-label="Contatto rapido"/);
 assert.match(html,/class="mobile-action-primary"/);
 assert.match(html,/class="mobile-action-call" aria-label="Chiama per informazioni"/);
 assert.match(css,/\.mobile-action\{display:none\}/);
 assert.match(css,/body\.mobile-action-visible \.mobile-action/);
 assert.match(js,/if\('IntersectionObserver' in window\)/);
 assert.match(js,/heroObserver\.observe\(document\.getElementById\('top'\)\)/);
 assert.match(js,/contactObserver\.observe\(contact\)/);
 assert.match(js,/!heroVisible&&!contactVisible/);
});
test("telephone front-end validation matches the real lead endpoint before POST",()=>{
 assert.match(js,/phoneDigits=payload\.phone\.replace\(\/\\D\/g,''\)/);
 assert.match(js,/phoneDigits\.length<8/);
 assert.match(js,/\.test\(payload\.phone\)/);
 assert.match(js,/setFeedback\('Inserisci un numero di telefono valido\.'/);
 assert.match(js,/fetch\('\/api\/interesse'/);
 new Script(js,{filename:"opportunita-v3-1.js"});
});
