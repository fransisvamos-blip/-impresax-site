const toggle=document.querySelector(".menu-toggle");
const menu=document.querySelector(".mobile-menu");

function closeMenu(){
  if(!toggle||!menu) return;
  menu.setAttribute("hidden","");
  toggle.setAttribute("aria-expanded","false");
  document.body.classList.remove("menu-open");
}

toggle?.addEventListener("click",()=>{
  const willOpen=menu.hasAttribute("hidden");
  if(willOpen){
    menu.removeAttribute("hidden");
    toggle.setAttribute("aria-expanded","true");
    document.body.classList.add("menu-open");
  }else closeMenu();
});

menu?.querySelectorAll("a").forEach(a=>a.addEventListener("click",closeMenu));

const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if(reduceMotion){
  document.querySelectorAll(".reveal").forEach(el=>el.classList.add("is-visible"));
}else{
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },{threshold:.12,rootMargin:"0px 0px -5% 0px"});
  document.querySelectorAll(".reveal").forEach(el=>observer.observe(el));
}

document.querySelectorAll('a[href^="#"]').forEach(link=>{
  link.addEventListener("click",event=>{
    const selector=link.getAttribute("href");
    if(!selector||selector==="#") return;
    const target=document.querySelector(selector);
    if(!target) return;
    event.preventDefault();
    closeMenu();
    target.scrollIntoView({behavior:reduceMotion?"auto":"smooth",block:"start"});
  });
});

const form=document.getElementById("leadForm");
const feedback=document.getElementById("formFeedback");

function validate(field){
  const empty=field.required&&!String(field.value).trim();
  const invalidEmail=field.type==="email"&&field.value&&!field.checkValidity();
  const invalid=empty||invalidEmail;
  field.classList.toggle("invalid",invalid);
  field.setAttribute("aria-invalid",invalid?"true":"false");
  return !invalid;
}

form?.querySelectorAll("input,select").forEach(field=>{
  field.addEventListener("blur",()=>validate(field));
  field.addEventListener("input",()=>{if(field.classList.contains("invalid")) validate(field)});
  field.addEventListener("change",()=>{if(field.classList.contains("invalid")) validate(field)});
});

form?.addEventListener("submit",event=>{
  event.preventDefault();
  const fields=[...form.querySelectorAll("input,select")];
  const ok=fields.map(validate).every(Boolean);
  if(!ok){
    feedback.className="form-feedback error";
    feedback.textContent="Controlla i campi evidenziati.";
    form.querySelector(".invalid")?.focus();
    return;
  }
  feedback.className="form-feedback success";
  feedback.textContent="I dati sono validi. Il recapito automatico della richiesta sarà attivato appena viene collegato il canale lead di ImpresaX.";
});