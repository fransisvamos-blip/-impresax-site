const toggle=document.querySelector(".menu-toggle");
const menu=document.querySelector(".mobile-menu");

toggle?.addEventListener("click",()=>{
  const open=menu.hasAttribute("hidden");
  open?menu.removeAttribute("hidden"):menu.setAttribute("hidden","");
  toggle.setAttribute("aria-expanded",String(open));
});

menu?.querySelectorAll("a").forEach(link=>{
  link.addEventListener("click",()=>{
    menu.setAttribute("hidden","");
    toggle?.setAttribute("aria-expanded","false");
  });
});

document.querySelectorAll("[data-contact-placeholder]").forEach(link=>{
  link.addEventListener("click",event=>event.preventDefault());
});