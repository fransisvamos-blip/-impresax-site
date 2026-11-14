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
 assert.match(html,/id="hero-title"[^>]*><span>LOUNGE BAR A<\/span><span class="hero-city-line">CATANZARO LIDO\.<\/span>/);
 assert.match(html,/IN CESSIONE O GESTIONE\./);
 assert.match(html,/RICHIEDI<br>I DETTAGLI\./);
 assert.equal((html.match(/<h1\b/g)||[]).length,1);
 const sections=["id=\"top\"","id=\"formule\"","id=\"contatto\"","id=\"vantaggi\"","id=\"storia\"","id=\"come-funziona\""];
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
 assert.match(css,/\.offer-layout\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
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
 assert.match(css,/\.offer-layout\{grid-template-columns:1fr;gap:12px\}/);
 assert.match(css,/\.why-layout\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/\.steps-layout\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/\.story-media\{display:none\}/);
 assert.match(css,/\.contact-panel\{border-radius:24px;min-height:0/);
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
 assert.match(html,/non la vendita dell'immobile/);
 assert.match(html,/richiedono verifica/);
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
 assert.match(privacy,/titolare (?:effettivo |o responsabile )?del trattamento/);
});

test("V3.1 adds original vector detail and clear trust cues without changing structure",()=>{
 assert.match(css,/V3\.1 — art-direction polish/);
 assert.equal((html.match(/class="offer-card-art"/g)||[]).length,2);
 assert.match(html,/NOME E CELLULARE/);
 assert.match(html,/RICHIESTA RISERVATA · SOLO I DATI NECESSARI/);
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

test("V3.2 keeps the approved six chapters and adds only a narrow facts ribbon",()=>{
 assert.match(css,/V3\.2 — restrained photographic art direction/);
 assert.equal((html.match(/<section\b/g)||[]).length,6);
 assert.match(html,/class="shell proposal-facts"/);
 assert.equal((html.match(/class="proposal-fact"/g)||[]).length,4);
 assert.match(html,/Informazioni comunicate dai titolari, da verificare/);
 for(const fact of ["Lounge bar avviato","Catanzaro Lido","Cessione o gestione","Non in vendita"]){
   assert.ok(html.includes(fact),fact);
 }
 assert.doesNotMatch(html,/immobile in vendita|guadagni garantiti|ROI garantito/i);
});
test("small screens get full-size readable vertical benefits and steps",()=>{
 assert.match(css,/@media\(max-width:670px\)/);
 assert.match(css,/\.why-layout\{grid-template-columns:1fr;gap:10px\}/);
 assert.match(css,/\.why-item\{min-height:0;padding:15px 17px;display:grid/);
 assert.match(css,/\.why-item p\{grid-column:2;grid-row:2;font:500 13px/);
 assert.match(css,/\.steps-layout\{grid-template-columns:1fr;gap:10px\}/);
 assert.match(css,/\.step h3\{grid-column:2;grid-row:1;font:800 15px/);
 assert.match(css,/\.step p\{grid-column:2;grid-row:2;font:500 13px/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test("offer selection is accessible and stays synchronized with final form",()=>{
 assert.match(html,/class="offer-card offer-card--buy" data-choice="cessione" aria-pressed="false"/);
 assert.match(html,/class="offer-card offer-card--manage" data-choice="gestione" aria-pressed="false"/);
 assert.match(html,/id="interest-help" class="interest-help"/);
 assert.match(html,/aria-describedby="interest-help"/);
 assert.match(css,/\.offer-card\[aria-pressed="true"\]/);
 assert.match(js,/querySelectorAll\('\.interest-chip,\.offer-card\[data-choice\],\.offer-both\[data-choice\]'\)/);
 assert.match(js,/help\.textContent=choice==='cessione'/);
});
test("funnel events contain only stage and formula and have no network collection",()=>{
 assert.match(js,/new CustomEvent\('opportunita:funnel',\{detail:\{stage:stage,formula:choice\|\|null\}\}\)/);
 assert.match(js,/emitFunnel\('formula_selezionata',choice\)/);
 assert.match(js,/emitFunnel\('richiesta_completata',transaction\.value\)/);
 assert.doesNotMatch(js,/sendBeacon|gtag|fbq|analytics\.track/);
 assert.match(html,/chiedo di essere ricontattato per questa opportunità/);
 assert.match(html,/id="privacy_accepted" name="privacy_accepted" required/);
});
test("privacy is aligned with actual external resources, values and consent semantics",()=>{
 assert.match(privacy,/Ultimo aggiornamento: 14 novembre 2026/);
 assert.match(privacy,/fotografie illustrative.*Unsplash/);
 assert.match(privacy,/Google Fonts/);
 assert.doesNotMatch(privacy,/Wikimedia Commons|eventuale esperienza nel settore/);
 assert.match(privacy,/--navy:#102c41/);
 assert.match(privacy,/--orange:#f26520/);
 assert.match(privacy,/titolare effettivo del trattamento/);
 assert.match(privacy,/Non sono integrati pixel pubblicitari/);
});

test("V3.3 makes the promised next step and deal terms understandable immediately",()=>{
 assert.match(css,/V3\.3 — conversion-focused polish/);
 assert.match(html,/OPPORTUNITÀ RISERVATA · CATANZARO LIDO/);
 assert.match(html,/Un lounge bar avviato da sette anni a Catanzaro Lido, secondo i titolari/);
 assert.match(html,/Le condizioni economiche e contrattuali vengono approfondite privatamente/);
 assert.match(html,/Cessione dell'attività, non dell'immobile/);
 assert.match(html,/termini e condizioni da concordare/);
 assert.match(html,/RICHIEDI I DETTAGLI/);
 assert.match(html,/INVIA LA RICHIESTA RISERVATA/);
 assert.match(html,/Nome e cellulare sono gli unici recapiti obbligatori/);
});
test("compact form starts with required phone and name, optional email is disclosed only on demand",()=>{
 assert.equal((html.match(/<form\b/g)||[]).length,1);
 assert.match(html,/<details class="optional-email" id="optional-email">/);
 assert.match(html,/<summary>Vuoi aggiungere anche un'email\? <span>Facoltativo<\/span><\/summary>/);
 assert.match(html,/id="email" name="email" type="email"/);
 assert.doesNotMatch(html,/id="email"[^>]*required/);
 assert.match(html,/id="full_name"[^>]*required/);
 assert.match(html,/id="phone"[^>]*required/);
 assert.match(html,/id="privacy_accepted"[^>]*required/);
 assert.match(js,/if\(!document\.getElementById\('email'\)\.checkValidity\(\)\)optionalEmail\.open=true/);
 assert.match(js,/document\.getElementById\('optional-email'\)\.open=false/);
 new Script(js,{filename:"conversion-v3-3.js"});
});
test("mobile conversion polish does not bring back duplicate forms or extra sections",()=>{
 assert.match(css,/\.hero-media\{height:clamp\(218px,54vw,278px\)\}/);
 assert.match(css,/\.optional-email\{background:#f5f8fa/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.equal((html.match(/<section\b/g)||[]).length,6);
 assert.equal((html.match(/class="offer-card offer-card--/g)||[]).length,2);
 assert.equal((html.match(/class="interest-chip"/g)||[]).length,3);
 assert.equal((html.match(/class="mobile-action"/g)||[]).length,1);
 assert.match(css,/prefers-reduced-motion/);
});

test("V3.4 keeps a single conversion message across header hero and mobile",()=>{
 const buttonLabels=[...html.matchAll(/RICHIEDI I DETTAGLI/g)];
 assert.ok(buttonLabels.length>=3,"header, hero and mobile all use the same action");
 assert.match(html,/class="hero-actions"/);
 assert.match(html,/class="hero-phone" href="tel:\+393294582962"/);
 assert.match(html,/class="mobile-action-primary">RICHIEDI I DETTAGLI/);
 assert.match(html,/aria-label="Chiama il 329 458 2962"/);
 assert.match(html,/href="tel:\+393294582962"/);
 assert.match(html,/PARLIAMONE<br>IN RISERVATEZZA/);
 assert.match(html,/INVIA LA RICHIESTA RISERVATA/);
});
test("V3.4 improves desktop rhythm without rebuilding or adding sections",()=>{
 assert.match(css,/\.offer-section\{[^}]*padding:64px 0 43px/);
 assert.match(css,/\.why-section\{[^}]*padding:56px 0 58px/);
 assert.match(css,/\.steps-section\{[^}]*padding:57px 0 61px/);
 assert.match(css,/\.story-media\{[^}]*min-height:402px/);
 assert.match(css,/\.contact-panel\{[^}]*padding:47px/);
 assert.match(css,/\.hero h1\{[^}]*letter-spacing:-\.064em/);
 assert.match(css,/\.offer-intro p\{[^}]*font:500 15px/);
 assert.match(css,/\.why-item p\{[^}]*font:500 13px/);
 assert.match(css,/\.step p\{[^}]*font:500 13px/);
 assert.equal((html.match(/<section\b/g)||[]).length,6);
 assert.equal((html.match(/<form\b/g)||[]).length,1);
});
test("V3.4 gives fields and buttons usable minimum touch dimensions",()=>{
 assert.match(css,/\.primary-cta\{[^}]*min-height:56px/);
 assert.match(css,/\.mobile-action-primary\{[^}]*min-height:52px/);
 assert.match(css,/\.mobile-action-call\{[^}]*flex:0 0 54px/);
 assert.match(css,/\.form-input\{[^}]*min-height:51px/);
 assert.match(css,/\.submit-button\{[^}]*min-height:55px/);
 assert.match(css,/\.agreement input\{[^}]*width:19px;height:19px/);
 assert.match(css,/\.interest-chip\{[^}]*padding:10px 14px/);
 assert.match(css,/\.hero-phone\{[^}]*min-height:44px/);
 assert.match(css,/\.contact-phone\{[^}]*min-height:43px/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test("V3.4 mobile prose stays readable, with no 3-column microtype at phone width",()=>{
 assert.doesNotMatch(css,/@media\(max-width:540px\)/);
 assert.match(css,/@media\(max-width:670px\)/);
 assert.match(css,/\.why-layout\{grid-template-columns:1fr;gap:10px\}/);
 assert.match(css,/\.steps-layout\{grid-template-columns:1fr;gap:10px\}/);
 assert.match(css,/\.why-item p\{grid-column:2;grid-row:2;font:500 13px/);
 assert.match(css,/\.step p\{grid-column:2;grid-row:2;font:500 13px/);
 assert.match(css,/\.offer-section\{padding:34px 0 22px\}/);
 assert.match(css,/\.steps-section\{padding:34px 0 45px\}/);
});

test("V3.5 shows the lead form immediately after formula selection, not after long content",()=>{
 const ids=["top","formule","contatto","vantaggi","storia","come-funziona"];
 const positions=ids.map(id=>html.indexOf('id="'+id+'"'));
 assert.ok(positions.every(x=>x>=0));
 assert.deepEqual(positions,[...positions].sort((a,b)=>a-b));
 assert.ok(html.indexOf('id="lead-form"')<html.indexOf('id="vantaggi"'));
 assert.equal((html.match(/<form\b/g)||[]).length,1);
 assert.equal((html.match(/id="contatto"/g)||[]).length,1);
 assert.match(html,/il modulo è subito qui sotto/);
 assert.match(html,/class="contact-section" id="contatto"/);
});
test("V3.5 closes with a persuasive yet truthful CTA and real legal footer",()=>{
 const lastChapter=html.indexOf('id="come-funziona"');
 const close=html.indexOf('class="shell closing-cta"');
 const footer=html.indexOf('<footer class="site-footer">');
 assert.ok(lastChapter<close&&close<footer);
 assert.match(html,/IL PROSSIMO PASSO È TUO\./);
 assert.match(html,/class="closing-cta-button">RICHIEDI I DETTAGLI/);
 assert.match(html,/class="closing-cta-phone">Oppure chiama il 329 458 2962/);
 assert.equal((html.match(/class="shell privacy-strip"/g)||[]).length,1);
 assert.match(html,/Proposta riguardante la cessione o gestione di un'attività commerciale/);
 assert.match(html,/href="\/privacy"/);
 assert.match(css,/STRUCTURE V3\.5/);
 assert.match(css,/\.site-footer\{background:#fff/);
 assert.match(css,/\.contact-section\{scroll-margin-top:18px/);
});
test("V3.5 preserves form endpoint, privacy, and choice interactions while changing layout",()=>{
 assert.match(js,/fetch\('\/api\/interesse'/);
 assert.match(js,/contact\.scrollIntoView/);
 assert.match(js,/contactObserver\.observe\(contact\)/);
 assert.match(html,/id="privacy_accepted" name="privacy_accepted" required/);
 assert.match(html,/id="email" name="email" type="email"/);
 assert.match(html,/id="full_name" name="full_name" type="text"/);
 assert.match(html,/id="phone" name="phone" type="tel"/);
 assert.equal((html.match(/<section\b/g)||[]).length,6);
 assert.match(css,/@media\(max-width:670px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 new Script(js,{filename:"structural-v3-5.js"});
});


test("V3.6 puts two full-size commercial paths at the center of block 02",()=>{
 assert.match(css,/BLOCK 02 \/ PREMIUM DECISION SYSTEM V3\.6/);
 assert.match(html,/id="offer-heading">CESSIONE O GESTIONE\?<\/h2>/);
 assert.match(html,/class="offer-heading-row"/);
 assert.match(html,/class="offer-guidance"/);
 assert.match(css,/\.offer-layout\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.equal((html.match(/class="offer-card offer-card--/g)||[]).length,2);
 assert.match(html,/VOGLIO<br>ACQUISTARE\./);
 assert.match(html,/VOGLIO<br>GESTIRE\./);
 assert.match(css,/\.offer-card\{[^}]*min-height:354px/);
 assert.match(css,/\.offer-card-title\{display:block;font:800/);
 assert.match(css,/\.offer-card-bottom\{position:relative/);
 assert.match(html,/class="offer-card-kicker"/);
 assert.match(html,/class="offer-card-action"/);
});
test("V3.6 communicates transaction scope without inventing finance or commitment",()=>{
 assert.match(html,/Cessione dell'attività, non dell'immobile/);
 assert.match(html,/Formula e condizioni da definire con i titolari/);
 assert.match(html,/senza impegno/);
 assert.match(html,/Non costituisce un impegno/);
 assert.match(html,/Un primo confronto riservato/);
 assert.match(html,/Le condizioni economiche e contrattuali vengono approfondite privatamente/);
 assert.doesNotMatch(html,/guadagno garantito|canone garantito|fatturato garantito/i);
 assert.match(html,/il modulo è subito qui sotto/);
});
test("V3.6 preserves preselection of all three routes and leads to one working form",()=>{
 assert.match(html,/class="offer-card offer-card--buy" data-choice="cessione" aria-pressed="false" aria-controls="lead-form"/);
 assert.match(html,/class="offer-card offer-card--manage" data-choice="gestione" aria-pressed="false" aria-controls="lead-form"/);
 assert.match(html,/class="offer-both" type="button" data-choice="entrambe" aria-pressed="false" aria-controls="lead-form"/);
 assert.match(js,/querySelectorAll\('\.interest-chip,\.offer-card\[data-choice\],\.offer-both\[data-choice\]'\)/);
 assert.match(js,/contact\.scrollIntoView/);
 assert.match(css,/\.offer-card\[aria-pressed="true"\]/);
 assert.match(css,/\.offer-both:hover,\.offer-both\[aria-pressed="true"\]/);
 assert.equal((html.match(/id="lead-form"/g)||[]).length,1);
 assert.match(js,/fetch\('\/api\/interesse'/);
});
test("V3.6 avoids cramped mobile cards and motion-dependent functionality",()=>{
 assert.match(css,/@media\(max-width:1100px\)/);
 assert.match(css,/@media\(max-width:810px\)/);
 assert.match(css,/@media\(max-width:670px\)/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.match(css,/\.offer-card\{min-height:255px;border-radius:17px/);
 assert.match(css,/\.offer-both\{width:100%;min-height:47px/);
 assert.match(css,/\.offer-subchoice\{flex-direction:column;align-items:stretch/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/\.offer-card,.offer-both,.offer-card-art,.offer-card \.round-arrow\{transition:none\}/);
 assert.doesNotMatch(css,/\.offer-layout\{grid-template-columns:\.83fr 1fr 1fr/);
});


test("V3.7 keeps Catanzaro Lido together in the hero at all widths",()=>{
 assert.match(html,/<span class="hero-city-line">CATANZARO LIDO\.<\/span>/);
 assert.match(html,/<span>LOUNGE BAR A<\/span>/);
 assert.doesNotMatch(html,/<span>A CATANZARO<\/span><span>LIDO\.<\/span>/);
 assert.match(css,/\.hero h1 \.hero-city-line\{font-size:\.82em;letter-spacing:-\.055em;white-space:nowrap\}/);
});
test("V3.7 keeps CESSIONE O GESTIONE? on one line on desktop and mobile",()=>{
 assert.match(html,/<h2 id="offer-heading">CESSIONE O GESTIONE\?<\/h2>/);
 assert.doesNotMatch(html,/CESSIONE<br>O GESTIONE/);
 assert.match(css,/\.offer-intro h2\{[^}]*white-space:nowrap/);
 assert.match(css,/\.offer-intro h2\{font-size:clamp\(22px,5\.8vw,38px\)/);
 assert.equal((html.match(/<form\b/g)||[]).length,1);
 assert.match(js,/fetch\('\/api\/interesse'/);
});

test("V3.9 preserves all six chapters with owner-approved previous third block",()=>{
 assert.match(css,/V3\.8 — comprehensive but restrained six-chapter design and CRO upgrade/);
 assert.match(css,/V3\.9 — targeted polish/);
 assert.equal((html.match(/<section\b/g)||[]).length,6);
 assert.equal((html.match(/<form\b/g)||[]).length,1);
 assert.match(html,/class="hero-city-line">CATANZARO LIDO\./);
 assert.match(html,/id="offer-heading">CESSIONE O GESTIONE\?/);
 assert.match(html,/id="contact-heading">RICHIEDI<br>I DETTAGLI\./);
 assert.match(html,/id="story-heading">UN PERCORSO<br>GIÀ AVVIATO/);
 assert.match(html,/id="steps-heading">COME<br>FUNZIONA/);
 assert.match(html,/IL PROSSIMO PASSO È TUO/);
});
test("V3.8 makes hero trust readable and keeps nonbinding facts properly qualified",()=>{
 assert.match(html,/SETTE ANNI DICHIARATI/);
 assert.match(html,/NOME E CELLULARE/);
 assert.match(html,/SENZA IMPEGNO/);
 assert.match(css,/\.hero-assurance>span\{display:inline-flex/);
 assert.match(css,/\.hero-assurance \.assurance-dot\{display:block/);
 assert.match(css,/@media\(max-width:670px\)[\s\S]*\.hero-assurance>span\{padding:6px 8px;min-height:30px;font-size:9px/);
 assert.match(html,/Copertina editoriale illustrativa/);
 assert.match(html,/non raffigura l'attività proposta/);
});
test("V3.9 restores third section's compact V3.7 conversion flow without changing API",()=>{
 assert.match(html,/<section class="contact-section" id="contatto"/);
 assert.match(html,/id="contact-heading">RICHIEDI<br>I DETTAGLI\./);
 assert.doesNotMatch(html,/class="form-section-label"|class="form-next-step"/);
 assert.match(css,/03 \/ FORM — restored V3\.7 composition/);
 assert.match(css,/\.contact-form\{display:grid;grid-template-columns:1fr;gap:12px\}/);
 assert.match(css,/\.contact-panel\{position:relative;isolation:isolate;overflow:hidden/);
 assert.match(html,/id="privacy_accepted" name="privacy_accepted" required/);
 assert.match(js,/fetch\('\/api\/interesse'/);
 new Script(js,{filename:"opportunita-v3-9.js"});
});
test("V3.8 benefit facts are honest, legible and not financial promises",()=>{
 assert.match(html,/id="why-heading">PERCHÉ<br>VALUTARLA/);
 assert.match(html,/CATANZARO<br>LIDO/);
 assert.match(html,/ATTIVITÀ<br>GIÀ AVVIATA/);
 assert.match(html,/DUE MODALITÀ<br>DI INGRESSO/);
 assert.match(html,/informazioni comunicate dai titolari|Informazioni comunicate dai titolari/);
 assert.match(html,/richiedono verifica/);
 assert.match(css,/\.why-item \.why-icon\{display:grid/);
 assert.match(css,/\.proposal-facts\{background:#fff;box-shadow:/);
 assert.doesNotMatch(html,/fatturato garantito|utile garantito|ROI certo/i);
});
test("V3.8 story and closing give an unambiguous nonbinding path",()=>{
 assert.match(html,/La proposta riguarda l'attività commerciale, non la proprietà dell'immobile/);
 assert.match(html,/secondo quanto comunicato dai titolari/);
 assert.match(html,/IL PROSSIMO PASSO È TUO/);
 assert.match(html,/decidi liberamente se proseguire/);
 assert.match(html,/Non devi decidere ora/);
 assert.match(css,/\.story-copy p\+p\{margin-top:19px;padding:12px/);
 assert.match(css,/\.closing-cta\{background:linear-gradient/);
 assert.match(html,/class="closing-cta-button">RICHIEDI I DETTAGLI/);
});
test("V3.9 keeps readable small-screen cards and the restored form",()=>{
 assert.match(css,/\.site-header\{position:sticky;top:0/);
 assert.match(css,/\.contact-form\{background:#fff;color:var\(--navy\);padding:18px/);
 assert.match(css,/\.why-item\{display:grid;min-height:0;grid-template-columns:49px minmax\(0,1fr\)/);
 assert.match(css,/@media\(max-width:670px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/\.hero h1 \.hero-city-line\{font-size:\.76em\}/);
 assert.match(html,/id="menu-toggle"[^>]*aria-label="Apri menu"/);
 assert.match(html,/class="mobile-action" role="navigation" aria-label="Contatto rapido"/);
});

test("V4 premium edition fully restyles all six chapters without introducing unqualified claims",()=>{
 assert.match(css,/PREMIUM EDITION V4/);
 for (const cssAnchor of [".hero",".offer-section",".contact-section",".why-section",".story-section",".steps-section",".site-footer"]) {
   assert.ok(css.includes(cssAnchor),cssAnchor);
 }
 assert.match(html,/class="hero-photo-stamp"/);
 assert.match(html,/class="facts-bridge"/);
 assert.match(html,/class="story-label"/);
 assert.match(css,/\.story-media\{min-height:610px\}/);
 assert.equal((html.match(/<section\b/g)||[]).length,6);
 assert.equal((html.match(/<form\b/g)||[]).length,1);
 assert.doesNotMatch(html,/fatturato garantito|utile garantito|ROI garantito|prezzo di vendita: €/i);
});
test("V4 social card is a first-party versioned JPEG with full WhatsApp Open Graph tags",()=>{
 assert.match(html,/<meta property="og:image" content="https:\/\/opportunita\.impresax\.org\/og-social-v4\.jpg">/);
 assert.match(html,/<meta property="og:image:secure_url"/);
 assert.match(html,/<meta property="og:image:type" content="image\/jpeg">/);
 assert.match(html,/<meta property="og:image:width" content="1200">/);
 assert.match(html,/<meta property="og:image:height" content="630">/);
 assert.match(html,/<meta property="og:locale" content="it_IT">/);
 assert.match(html,/<meta name="twitter:image" content="https:\/\/opportunita\.impresax\.org\/og-social-v4\.jpg">/);
 assert.match(html,/non raffigura l’attività proposta/);
});
test("V4 keeps earlier preferred fast-contact funnel and responsive bottom CTA",()=>{
 assert.match(html,/id="contact-heading">RICHIEDI<br>I DETTAGLI\./);
 assert.doesNotMatch(html,/class="form-next-step"/);
 assert.match(html,/id="phone" name="phone" type="tel"/);
 assert.match(html,/id="privacy_accepted" name="privacy_accepted" required/);
 assert.match(css,/@media\(max-width:670px\)/);
 assert.match(js,/fetch\('\/api\/interesse'/);
 new Script(js,{filename:"opportunita-premium-v4.js"});
});
