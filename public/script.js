const toggle=document.querySelector(".menu-toggle");
const menu=document.querySelector(".mobile-menu");

function closeMenu(){
  if(!menu||!toggle) return;
  menu.setAttribute("hidden","");
  toggle.setAttribute("aria-expanded","false");
  document.body.classList.remove("menu-open");
}

toggle?.addEventListener("click",()=>{
  const open=menu.hasAttribute("hidden");
  if(open){
    menu.removeAttribute("hidden");
    toggle.setAttribute("aria-expanded","true");
    document.body.classList.add("menu-open");
  }else{
    closeMenu();
  }
});

menu?.querySelectorAll("a").forEach(link=>link.addEventListener("click",closeMenu));

const revealObserver=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
    if(entry.isIntersecting){
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    }
  });
},{threshold:.12,rootMargin:"0px 0px -5% 0px"});

document.querySelectorAll(".reveal").forEach(el=>revealObserver.observe(el));

const desire=document.querySelector(".desire");
if(desire){
  const desireObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        desire.classList.add("in-view");
        desireObserver.disconnect();
      }
    });
  },{threshold:.2});
  desireObserver.observe(desire);
}

const form=document.getElementById("leadForm");
const feedback=document.getElementById("formFeedback");

function setInvalid(field,invalid){
  field.classList.toggle("invalid",invalid);
  field.setAttribute("aria-invalid",invalid?"true":"false");
}

function validateField(field){
  const empty=field.hasAttribute("required")&&!String(field.value).trim();
  const badEmail=field.type==="email"&&field.value&&!field.checkValidity();
  const invalid=empty||badEmail;
  setInvalid(field,invalid);
  return !invalid;
}

form?.querySelectorAll("input,select,textarea").forEach(field=>{
  field.addEventListener("blur",()=>validateField(field));
  field.addEventListener("input",()=>{
    if(field.classList.contains("invalid")) validateField(field);
  });
});

form?.addEventListener("submit",event=>{
  event.preventDefault();
  const fields=[...form.querySelectorAll("input,select,textarea")];
  const valid=fields.map(validateField).every(Boolean);

  if(!valid){
    feedback.className="form-feedback error";
    feedback.textContent="Controlla i campi evidenziati e riprova.";
    form.querySelector(".invalid")?.focus();
    return;
  }

  feedback.className="form-feedback success";
  feedback.innerHTML="<strong>Richiesta pronta.</strong><br>Il percorso di conversione è completo. In questa candidate di Cabina il recapito del lead non è ancora collegato al backend.";
});

document.querySelectorAll('a[href^="#"]').forEach(link=>{
  link.addEventListener("click",event=>{
    const id=link.getAttribute("href");
    if(!id||id==="#") return;
    const target=document.querySelector(id);
    if(!target) return;
    event.preventDefault();
    closeMenu();
    target.scrollIntoView({behavior:"smooth",block:"start"});
  });
});