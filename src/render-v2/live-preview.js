function safeLabel(value="") {
  return String(value||"")
    .replace(/[^a-zA-Z0-9 _-]+/g," ")
    .replace(/\s+/g," ")
    .trim()
    .slice(0,80);
}

export function buildR121LivePreviewHtml(captureHtml,concept={}) {
  let html=String(captureHtml||"");
  if(!html.trim()) return html;

  const signature=safeLabel(concept?.motion_signature?.name||"R121 signature motion");
  const css=`
<style id="r121-live-motion">
:root{--r121-live-ease:cubic-bezier(.2,.72,.2,1)}
body.r121-live-preview{scroll-behavior:smooth}
body.r121-live-preview [data-r121-motion]{will-change:transform,clip-path;transform-origin:center}
body.r121-live-preview a,body.r121-live-preview button{
  transition:transform .35s var(--r121-live-ease),background-color .35s var(--r121-live-ease),color .35s var(--r121-live-ease),border-color .35s var(--r121-live-ease)
}
body.r121-live-preview a:hover{transform:translateY(-2px)}
body.r121-live-preview [data-r121-motion="detail-focus"] img{
  transition:transform .8s var(--r121-live-ease),filter .8s var(--r121-live-ease)
}
body.r121-live-preview [data-r121-motion="detail-focus"]:hover img{transform:scale(1.025)}
@supports (animation-timeline:view()) {
  @keyframes r121-material-reveal{
    from{clip-path:inset(0 10% 0 0);transform:scale(1.025)}
    to{clip-path:inset(0 0 0 0);transform:scale(1)}
  }
  @keyframes r121-structural-slide{
    from{transform:translate3d(-26px,0,0)}
    to{transform:translate3d(0,0,0)}
  }
  @keyframes r121-detail-focus{
    from{transform:scale(1.035)}
    to{transform:scale(1)}
  }
  @keyframes r121-proof-lock{
    from{transform:translate3d(0,22px,0)}
    to{transform:translate3d(0,0,0)}
  }
  body.r121-live-preview [data-r121-motion="material-reveal"]{
    animation:r121-material-reveal both linear;
    animation-timeline:view();
    animation-range:entry 5% cover 38%;
  }
  body.r121-live-preview [data-r121-motion="structural-slide"]{
    animation:r121-structural-slide both linear;
    animation-timeline:view();
    animation-range:entry 8% cover 34%;
  }
  body.r121-live-preview [data-r121-motion="detail-focus"]{
    animation:r121-detail-focus both linear;
    animation-timeline:view();
    animation-range:entry 4% cover 42%;
  }
  body.r121-live-preview [data-r121-motion="proof-lock"]{
    animation:r121-proof-lock both linear;
    animation-timeline:view();
    animation-range:entry 8% cover 34%;
  }
}
@media(prefers-reduced-motion:reduce){
  body.r121-live-preview{scroll-behavior:auto}
  body.r121-live-preview [data-r121-motion],
  body.r121-live-preview [data-r121-motion] img{
    animation:none!important;
    transform:none!important;
    clip-path:none!important;
    transition:none!important
  }
}
</style>`;

  if(html.includes("</head>")) html=html.replace("</head>",css+"</head>");
  html=html.replace(/<body(\s[^>]*)?>/i,match=>{
    if(/class\s*=/.test(match)) return match.replace(/class=["']([^"']*)["']/i,(all,classes)=>'class="'+classes+' r121-live-preview"');
    return match.replace(/>$/,' class="r121-live-preview">');
  });
  html=html.replace(/<title>([\s\S]*?)<\/title>/i,(all,title)=>'<title>'+title+' · LIVE</title>');
  html=html.replace(/<main([^>]*)>/i,'<main$1 data-r121-live-preview="true" data-r121-motion-signature="'+signature.replace(/"/g,"&quot;")+'">');
  return html;
}
