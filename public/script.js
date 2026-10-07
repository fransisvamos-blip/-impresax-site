const toggle = document.querySelector(".menu-toggle");
const menu = document.querySelector(".mobile-menu");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function closeMenu(){
  if(!toggle || !menu) return;
  menu.setAttribute("hidden","");
  toggle.setAttribute("aria-expanded","false");
  document.body.classList.remove("menu-open");
}

toggle?.addEventListener("click",()=>{
  const opening = menu.hasAttribute("hidden");
  if(opening){
    menu.removeAttribute("hidden");
    toggle.setAttribute("aria-expanded","true");
    document.body.classList.add("menu-open");
  }else closeMenu();
});

menu?.querySelectorAll("a").forEach(a=>a.addEventListener("click",closeMenu));

if(reduceMotion){
  document.querySelectorAll(".reveal").forEach(el=>el.classList.add("is-visible"));
}else{
  const observer = new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },{threshold:.1,rootMargin:"0px 0px -6% 0px"});
  document.querySelectorAll(".reveal").forEach(el=>observer.observe(el));
}

document.querySelectorAll('a[href^="#"]').forEach(link=>{
  link.addEventListener("click",event=>{
    const selector = link.getAttribute("href");
    if(!selector || selector==="#") return;
    const target = document.querySelector(selector);
    if(!target) return;
    event.preventDefault();
    closeMenu();
    target.scrollIntoView({behavior:reduceMotion?"auto":"smooth",block:"start"});
  });
});

function track(eventName, payload={}){
  if(Array.isArray(window.dataLayer)){
    window.dataLayer.push({event:eventName,...payload});
  }
  window.dispatchEvent(new CustomEvent("impresax:"+eventName,{detail:payload}));
}

document.querySelectorAll(".hero .cta-primary").forEach(el=>{
  el.addEventListener("click",()=>track("hero_cta_click"));
});

/* UTM persistence */
const UTM_KEYS=["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];
const currentParams=new URLSearchParams(window.location.search);
const storedUtm={};
UTM_KEYS.forEach(key=>{
  const incoming=currentParams.get(key);
  if(incoming) sessionStorage.setItem("impresax_"+key,incoming);
  storedUtm[key]=sessionStorage.getItem("impresax_"+key)||"";
});

/* Business check */
const diagnosisMap={
  clienti:{
    label:"Trovare più clienti",
    title:"Partiremmo dalla domanda che oggi non stai intercettando.",
    text:"Prima di aumentare la spesa, controlleremmo visibilità, qualità della domanda, messaggio e percorso verso il contatto.",
    flow:"VISIBILITÀ → DOMANDA → MESSAGGIO → CONVERSIONE → TRACKING"
  },
  conversione:{
    label:"Convertire più contatti",
    title:"Partiremmo dal punto in cui l’interesse smette di avanzare.",
    text:"Offerta, pagina, frizione, qualificazione e follow-up vanno letti come un unico percorso, non come pezzi separati.",
    flow:"OFFERTA → PAGINA → FRIZIONE → QUALIFICA → FOLLOW-UP"
  },
  relazione:{
    label:"Gestire clienti e lead",
    title:"Partiremmo da ciò che oggi si perde tra un contatto e l’altro.",
    text:"Canali, responsabilità, CRM e follow-up devono rendere ogni opportunità visibile e gestibile.",
    flow:"INGRESSO → CRM → ASSEGNAZIONE → FOLLOW-UP → REPORTING"
  },
  processi:{
    label:"Organizzare i processi",
    title:"Partiremmo dal lavoro che assorbe tempo senza creare abbastanza valore.",
    text:"Mappiamo passaggi, responsabilità e strumenti per capire cosa semplificare prima ancora di automatizzare.",
    flow:"MAPPA → ATTRITO → RESPONSABILITÀ → STANDARD → CONTROLLO"
  },
  automazione:{
    label:"Automatizzare il lavoro",
    title:"Partiremmo dalle attività ripetitive che hanno regole abbastanza chiare.",
    text:"L’automazione viene dopo la semplificazione: prima togliamo passaggi inutili, poi colleghiamo ciò che resta.",
    flow:"SEMPLIFICA → STANDARDIZZA → INTEGRA → AUTOMATIZZA → MISURA"
  },
  dati:{
    label:"Capire meglio i dati",
    title:"Partiremmo dalle decisioni che oggi stai prendendo con poca visibilità.",
    text:"Non servono più dashboard: servono pochi segnali collegati a clienti, margine, efficienza e priorità.",
    flow:"DOMANDA → KPI → TRACKING → LETTURA → DECISIONE"
  },
  incerto:{
    label:"Non lo so ancora",
    title:"Va bene: partiremo proprio dalla diagnosi.",
    text:"Quando il problema non è chiaro, il primo valore è capire dove guardare e cosa non merita attenzione.",
    flow:"CONTESTO → EVIDENZE → COLLO DI BOTTIGLIA → PRIORITÀ → PIANO"
  }
};

const diagnosisButtons=[...document.querySelectorAll("[data-diagnosis]")];
const diagnosisTitle=document.getElementById("diagnosisTitle");
const diagnosisText=document.getElementById("diagnosisText");
const diagnosisFlow=document.getElementById("diagnosisFlow");
const analysisContext=document.getElementById("analysisContext");
let selectedDiagnosis=sessionStorage.getItem("impresax_diagnostic")||"";

function applyDiagnosis(key, emit=false){
  const data=diagnosisMap[key];
  if(!data) return;
  selectedDiagnosis=key;
  sessionStorage.setItem("impresax_diagnostic",key);
  diagnosisButtons.forEach(btn=>btn.classList.toggle("active",btn.dataset.diagnosis===key));
  diagnosisTitle.textContent=data.title;
  diagnosisText.textContent=data.text;
  diagnosisFlow.textContent=data.flow;
  if(analysisContext){
    analysisContext.textContent="Business Check: "+data.label+". Porteremo questa priorità nella richiesta.";
    analysisContext.classList.add("active");
  }
  const radio=[...document.querySelectorAll('input[name="improvement_area"]')]
    .find(input=>input.value===data.label);
  if(radio) radio.checked=true;
  if(emit) track("diagnostic_complete",{diagnostic_area:data.label});
}

diagnosisButtons.forEach(btn=>{
  btn.addEventListener("click",()=>{
    if(!selectedDiagnosis) track("diagnostic_start");
    applyDiagnosis(btn.dataset.diagnosis,true);
  });
});

if(selectedDiagnosis) applyDiagnosis(selectedDiagnosis,false);

/* Thinking cases */
const thinkingCases={
  traffico:{
    title:"Non partiremmo dall’ADV.",
    text:"Prima controlleremmo dove si rompe il percorso tra interesse e contatto.",
    steps:["Offerta","Messaggio","Pagina","Frizione","Tracking","Follow-up"]
  },
  lead:{
    title:"Non partiremmo da più lead.",
    text:"Prima capiremo perché quelli che già arrivano non diventano abbastanza appuntamenti.",
    steps:["Fonte","Qualifica","Tempo di risposta","Follow-up","Booking","CRM"]
  },
  processi:{
    title:"Non partiremmo dall’automazione.",
    text:"Prima toglieremmo complessità e renderemmo il processo abbastanza chiaro da poter essere automatizzato bene.",
    steps:["Mappa","Passaggi","Responsabilità","Standard","Integrazioni","Automazione"]
  }
};

const thinkingTabs=[...document.querySelectorAll("[data-case]")];
const thinkingTitle=document.getElementById("thinkingTitle");
const thinkingText=document.getElementById("thinkingText");
const thinkingSteps=document.getElementById("thinkingSteps");

function setThinkingCase(key){
  const data=thinkingCases[key];
  if(!data) return;
  thinkingTabs.forEach(tab=>{
    const active=tab.dataset.case===key;
    tab.classList.toggle("active",active);
    tab.setAttribute("aria-selected",active?"true":"false");
  });
  thinkingTitle.textContent=data.title;
  thinkingText.textContent=data.text;
  thinkingSteps.innerHTML=data.steps.map((step,index)=>
    '<li><span>'+String(index+1).padStart(2,"0")+'</span>'+step+'</li>'
  ).join("");
}
thinkingTabs.forEach(tab=>tab.addEventListener("click",()=>setThinkingCase(tab.dataset.case)));

/* Sticky CTA */
const sticky=document.getElementById("stickyAnalysis");
const analysisSection=document.getElementById("analisi");
let analysisVisible=false;

if(analysisSection){
  const analysisObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      analysisVisible=entry.isIntersecting;
      updateSticky();
    });
  },{threshold:.08});
  analysisObserver.observe(analysisSection);
}
function updateSticky(){
  if(!sticky) return;
  const shouldShow=window.innerWidth<1024 && window.scrollY>window.innerHeight*1.05 && !analysisVisible;
  sticky.classList.toggle("visible",shouldShow);
}
window.addEventListener("scroll",updateSticky,{passive:true});
window.addEventListener("resize",updateSticky);
sticky?.querySelector("a")?.addEventListener("click",()=>track("sticky_cta_click"));

/* Progressive form */
const form=document.getElementById("leadForm");
const status=document.getElementById("formStatus");
const success=document.getElementById("formSuccess");
const steps=[...document.querySelectorAll(".form-step")];
const progress=[...document.querySelectorAll("[data-progress]")];
let currentStep=1;
let formStarted=false;

function showStep(step){
  currentStep=step;
  steps.forEach(el=>el.classList.toggle("active",Number(el.dataset.step)===step));
  progress.forEach(el=>{
    const n=Number(el.dataset.progress);
    el.classList.toggle("active",n===step);
    el.classList.toggle("done",n<step);
  });
  if(step===2) track("form_step_2");
  form?.scrollIntoView({behavior:reduceMotion?"auto":"smooth",block:"center"});
}

function markStarted(){
  if(formStarted) return;
  formStarted=true;
  track("form_start");
}
form?.addEventListener("focusin",markStarted);
form?.addEventListener("change",markStarted);

function setError(step,message){
  const box=document.querySelector('[data-error="'+step+'"]');
  if(box) box.textContent=message||"";
}

function fieldValid(field){
  const value=String(field.value||"").trim();
  let invalid=field.required&&!value;
  if(field.type==="email" && value && !field.checkValidity()) invalid=true;
  if(field.type==="url" && value && !field.checkValidity()) invalid=true;
  if(field.name==="phone" && value && value.replace(/\D/g,"").length<7) invalid=true;
  field.classList.toggle("invalid",invalid);
  field.setAttribute("aria-invalid",invalid?"true":"false");
  return !invalid;
}

function validateStep(step){
  setError(step,"");
  if(step===1){
    const checked=form?.querySelector('input[name="improvement_area"]:checked');
    if(!checked){
      setError(1,"Scegli la priorità che oggi senti più importante.");
      return false;
    }
    return true;
  }
  const container=document.querySelector('.form-step[data-step="'+step+'"]');
  const fields=[...(container?.querySelectorAll("input[required],textarea[required]")||[])];
  const valid=fields.map(fieldValid).every(Boolean);
  if(!valid){
    setError(step,"Controlla i campi evidenziati.");
    container?.querySelector(".invalid")?.focus();
  }
  return valid;
}

document.querySelectorAll("[data-next]").forEach(btn=>{
  btn.addEventListener("click",()=>{
    const next=Number(btn.dataset.next);
    if(validateStep(currentStep)) showStep(next);
  });
});
document.querySelectorAll("[data-back]").forEach(btn=>{
  btn.addEventListener("click",()=>showStep(Number(btn.dataset.back)));
});

form?.querySelectorAll("input,textarea").forEach(field=>{
  field.addEventListener("input",()=>{if(field.classList.contains("invalid")) fieldValid(field)});
  field.addEventListener("change",()=>{if(field.classList.contains("invalid")) fieldValid(field)});
});

document.querySelectorAll('input[name="improvement_area"]').forEach(radio=>{
  radio.addEventListener("change",()=>{
    const match=Object.entries(diagnosisMap).find(([,data])=>data.label===radio.value);
    if(match && selectedDiagnosis!==match[0]) applyDiagnosis(match[0],false);
  });
});

const LEAD_ENDPOINT="https://bvkeurkithmvodyjmnqi.supabase.co/functions/v1/impresax-lead";

form?.addEventListener("submit",async event=>{
  event.preventDefault();
  if(!validateStep(3)) return;

  const improvement=form.querySelector('input[name="improvement_area"]:checked');
  if(!improvement){
    showStep(1);
    setError(1,"Scegli la priorità che vuoi migliorare.");
    return;
  }

  const submit=form.querySelector(".form-submit");
  submit.disabled=true;
  status.className="form-status loading";
  status.textContent="Stiamo inviando la richiesta…";
  track("form_submit",{improvement_area:improvement.value});

  const data=new FormData(form);
  const payload={
    name:String(data.get("name")||""),
    company:String(data.get("company")||""),
    sector:String(data.get("sector")||""),
    website:String(data.get("website")||""),
    phone:String(data.get("phone")||""),
    email:String(data.get("email")||""),
    improvement_area:improvement.value,
    message:String(data.get("message")||""),
    diagnostic_area:selectedDiagnosis ? diagnosisMap[selectedDiagnosis].label : "",
    website_extra:String(data.get("website_extra")||""),
    source_page:window.location.href,
    ...storedUtm
  };

  try{
    const response=await fetch(LEAD_ENDPOINT,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload)
    });
    const result=await response.json().catch(()=>({ok:false,error:"invalid_response"}));

    if(!response.ok || !result.ok){
      if(response.status===429){
        throw new Error("Hai già inviato diverse richieste. Riprova più tardi oppure contattaci direttamente.");
      }
      if(response.status===422){
        throw new Error("Controlla i dati inseriti e riprova.");
      }
      throw new Error("Non siamo riusciti a salvare la richiesta. I tuoi dati sono ancora qui: riprova tra poco.");
    }

    steps.forEach(el=>el.hidden=true);
    document.querySelector(".form-progress")?.setAttribute("hidden","");
    status.textContent="";
    status.className="form-status";
    success.hidden=false;
    track("lead_success",{improvement_area:improvement.value});
  }catch(error){
    status.className="form-status error";
    status.textContent=error?.message||"Errore temporaneo. Riprova.";
  }finally{
    submit.disabled=false;
  }
});
