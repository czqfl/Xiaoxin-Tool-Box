const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/settings-MrxtH9iL.js","assets/index-B1Q3Vcgi.js","assets/glow-particles-DDkq2fVs.js","assets/webviewWindow-Dvs4jPir.js"])))=>i.map(i=>d[i]);
import{_ as it,g as $,l as oe,i as te,c as ee,P as Le,a as on,L as Kn,e as Jn}from"./index-B1Q3Vcgi.js";import{g as X,o as dn,n as un,s as ut,a as pn,c as Se,b as Zn,d as Qn,l as to,e as mn,f as fn,h as eo,i as no,j as Pt,m as oo,k as ao,p as an,q as Tt,r as ro,t as so,u as io,v as co}from"./settings-MrxtH9iL.js";import{P as gn}from"./pin-path.const-Dy8TJndL.js";let Jt=null;function lo(){return Jt||(Jt=(async()=>{try{const{getWallpaper:o,readBgImage:s}=await it(async()=>{const{getWallpaper:k,readBgImage:g}=await import("./settings-MrxtH9iL.js").then(f=>f.w);return{getWallpaper:k,readBgImage:g}},__vite__mapDeps([0,1])),u=await o();if(!u)return"";const c=await s(u);if(!c||!c.startsWith("data:"))return"";const n=new Image;await new Promise((k,g)=>{n.onload=()=>k(),n.onerror=()=>g(new Error("壁纸解码失败")),n.src=c});const m=Math.min(1,1920/Math.max(n.naturalWidth,n.naturalHeight)),b=Math.max(1,Math.round(n.naturalWidth*m)),l=Math.max(1,Math.round(n.naturalHeight*m)),y=document.createElement("canvas");y.width=b,y.height=l;const _=y.getContext("2d");return _?(_.drawImage(n,0,0,b,l),y.toDataURL("image/jpeg",.82)):""}catch(o){return console.warn("读取桌面壁纸失败:",o),""}})(),Jt)}async function uo(o){if(o.startsWith("data:"))return o;try{const{readBgImage:s}=await it(async()=>{const{readBgImage:u}=await import("./settings-MrxtH9iL.js").then(c=>c.w);return{readBgImage:u}},__vite__mapDeps([0,1]));return await s(o)}catch(s){return console.warn("读取背景图失败:",s),""}}async function hn(o,s,u={}){const c=s.theme==="transparent";let n=u.bgUrl??"";n||(c?n=await lo():s.bg_image&&(n=await uo(s.bg_image))),n?(o.style.setProperty("--note-bg-img",`url("${n}")`),o.style.setProperty("--note-bg-opacity","1"),o.classList.add("has-bg")):(o.style.removeProperty("--note-bg-img"),o.style.removeProperty("--note-bg-opacity"),o.classList.remove("has-bg")),o.classList.toggle("bg-transparent",c),await mo(o,n)}function po(o){return new Promise(s=>{const u=new Image;u.onload=()=>{try{const c=document.createElement("canvas"),n=32;c.width=n,c.height=n;const v=c.getContext("2d",{willReadFrequently:!0});if(!v){s(.5);return}v.drawImage(u,0,0,n,n);const m=v.getImageData(0,0,n,n).data;let b=0;for(let l=0;l<m.length;l+=4)b+=.299*m[l]+.587*m[l+1]+.114*m[l+2];s(b/(n*n)/255)}catch{s(.5)}},u.onerror=()=>s(.5),u.src=o})}async function mo(o,s){let u=!1;if(s)try{u=await po(s)<.45}catch{u=!1}o.classList.toggle("on-dark-bg",u)}const fo=typeof window<"u"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches,go=o=>o<.5?4*o*o*o:1-Math.pow(-2*o+2,3)/2,At=new WeakMap;function rn(o,s,u){const c=u?.duration??280,n=u?.onDone,v=o.style.getPropertyValue("--glass-blur"),m=v&&parseFloat(v)||0,b=Math.max(0,s),l=At.get(o);if(l&&(cancelAnimationFrame(l.raf),l.alive=!1),fo||m===b||c<=0){o.style.setProperty("--glass-blur",b+"px"),n?.(),At.delete(o);return}o.classList.add("animating");let y=0;const _=g=>{const f=At.get(o);if(!f||!f.alive)return;y||(y=g);const N=Math.min(1,(g-y)/c),L=m+(b-m)*go(N);o.style.setProperty("--glass-blur",L.toFixed(2)+"px"),N<1?f.raf=requestAnimationFrame(_):(o.style.setProperty("--glass-blur",b+"px"),o.classList.remove("animating"),f.alive=!1,n?.(),At.delete(o))},k={raf:0,alive:!0};At.set(o,k),k.raf=requestAnimationFrame(_)}const Te=40;function Ae(o){if(!o)return null;const s=o.trim(),u=/^#([0-9a-f]{6})$/i.exec(s);if(u)return parseInt(u[1],16);const c=/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);return c?parseInt(c[1],10)<<16|parseInt(c[2],10)<<8|parseInt(c[3],10):null}function ae(o){const s=o.target;if(!s)return;const u=Math.max(0,Math.min(100,Math.round(o.strength)));if(s.style.removeProperty("--glass-blur"),!o.enabled||u<=0){s.classList.contains("glass")?rn(s,0,{onDone:()=>{s.classList.remove("glass"),s.style.removeProperty("--glass-blur")}}):(s.classList.remove("glass"),s.style.removeProperty("--glass-blur"));return}const c=Math.round(u/100*Te);if(!s.classList.contains("glass")){s.classList.add("glass"),s.style.setProperty("--glass-blur",c+"px");return}rn(s,c)}const ho=Object.freeze(Object.defineProperty({__proto__:null,MAX_BLUR_PX:Te,applyGlassBlur:ae,parseColorToRgbInt:Ae},Symbol.toStringTag,{value:"Module"}));function bo(){const o=document.getElementById("app");o.innerHTML=`
    <div class="history-window">
      <div class="titlebar">
        <div class="titlebar-left">
          <span class="dot">●</span>
          <span class="title-text">历史便签</span>
        </div>
        <!-- 新建便签按钮：标题栏直接子元素，absolute 居中相对整个标题栏（非右侧容器） -->
        <button class="new-note-btn" id="btn-new" title="新建便签">
          <!-- SVG 加号：颜色跟随 currentColor（可被 CSS 控制）——之前的 ➕
               是 emoji，自带颜色，CSS color 无效（用户反馈"没变绿"的根因） -->
          <span class="btn-plus">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
              <path d="M8 3v10M3 8h10"/>
            </svg>
          </span>
          <span class="btn-label">新建便签</span>
        </button>
        <div class="titlebar-right">
          <button class="icon-btn close" id="btn-close" title="关闭">✕</button>
        </div>
      </div>
      <div class="history-list" id="history-list"></div>
    </div>
  `;const s=document.getElementById("history-list"),u=document.querySelector(".titlebar"),c=document.getElementById("btn-close"),n=document.getElementById("btn-new");async function v(){try{const g=await Zn();await Qn(g)}catch(g){console.error("新建便签失败:",g)}}n.addEventListener("click",()=>void v()),X().then(g=>{const f=document.documentElement;f.classList.remove("theme-dark"),(g.theme==="dark"||g.theme==="transparent")&&f.classList.add("theme-dark"),y(g),$().show().then(()=>$().setFocus()).catch(()=>{})}).catch(g=>{console.error("读取主题失败:",g),$().show().catch(()=>{})}),dn(()=>{X().then(g=>void y(g)).catch(()=>{})});let m=!1,b=!1;const l=()=>{m||(m=!0,window.setTimeout(()=>{if(m=!1,b){window.setTimeout(l,60);return}k()},0))};s.addEventListener("pointerdown",()=>{b=!0},!0),window.addEventListener("pointerup",()=>{b=!1,l()},!0),window.addEventListener("pointercancel",()=>{b=!1,l()},!0),oe("sticky://state-changed",l).catch(g=>console.error("监听便签状态失败:",g)),$().onFocusChanged(({payload:g})=>{g&&l()}).catch(g=>console.error("监听窗口焦点失败:",g)),l();async function y(g){const f=document.querySelector(".history-window");if(!f)return;if(document.documentElement.classList.remove("theme-dark"),(g.theme==="dark"||g.theme==="transparent")&&document.documentElement.classList.add("theme-dark"),g.theme==="transparent"){f.classList.remove("has-bg","on-dark-bg","glass","transparent-clear"),f.classList.add("bg-transparent"),f.style.removeProperty("--note-bg-img"),f.style.removeProperty("--note-bg-opacity"),f.style.removeProperty("--glass-blur"),document.documentElement.style.removeProperty("--trans-opacity"),f.style.removeProperty("--trans-opacity");const L=un(g.transparent_opacity);if(L<2)f.classList.add("transparent-clear"),f.style.setProperty("--trans-opacity","0"),document.documentElement.style.setProperty("--trans-opacity","0"),ut(!1,0,0).catch(()=>{});else{f.classList.remove("transparent-clear");const z=Math.round(L*.6);f.style.setProperty("--trans-opacity",String(z)),document.documentElement.style.setProperty("--trans-opacity",String(z));const B=Ae(getComputedStyle(f).getPropertyValue("--bg"))??0;ut(!0,1,B).catch(W=>console.error("应用实时模糊失败:",W))}ae({target:f,strength:0,enabled:!1})}else{f.classList.remove("bg-transparent"),document.documentElement.style.removeProperty("--trans-opacity"),f.style.removeProperty("--trans-opacity"),ut(!1,0,0).catch(()=>{}),await hn(f,g);const L=f.classList.contains("has-bg"),z=g.glass_blur??55,B=g.glass_enabled!==!1;ae({target:f,strength:L?z:0,enabled:L&&B})}}u.addEventListener("mousedown",g=>{g.target.closest(".icon-btn, .new-note-btn")||pn()}),c.addEventListener("click",()=>{Se().catch(g=>console.error("关闭失败:",g))});let _="";async function k(){let g,f=new Set;try{const[L,z]=await Promise.all([to(),mn().catch(()=>[])]);g=L,f=new Set(z)}catch(L){console.error("加载列表失败:",L),s.innerHTML='<div class="empty-state"><div class="empty-text">加载失败，请重试</div></div>';return}const N=g.map(L=>`${L.id}|${L.updated}|${L.title}|${L.snippet}|${f.has(L.id)?1:0}|${L.top_priority?1:0}`).join("~");if(N!==_){if(_=N,s.innerHTML="",g.length===0){s.innerHTML=`
        <div class="empty-state">
          <button class="new-note-cta" id="new-note-cta" title="新建便签">
            <span class="cta-icon">➕</span>
            <span class="cta-text">新建便签</span>
          </button>
        </div>
      `,document.getElementById("new-note-cta")?.addEventListener("click",()=>void v());return}try{g.forEach(L=>{const z=f.has(L.id),B=document.createElement("div");B.className="history-card"+(z?" open-note":""),B.dataset.id=L.id;const W=(L.title||"").trim(),D=W||L.snippet,H=W?`<div class="card-snippet">${Me(L.snippet)}</div>`:"",V=z?'<span class="card-status">打开中</span>':"",tt='<button class="card-delete" title="删除">✕</button>',ot=`<button class="card-pin${L.top_priority?" active":""}" title="${L.top_priority?"已置顶（快捷键优先操作此便签）":"设为置顶（快捷键优先操作此便签）"}"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="${gn}"/></svg></button>`;B.innerHTML=`
          <div class="card-info">
            <div class="card-title">${Me(D)}</div>
            ${H}
            <div class="card-meta">
              <span class="card-time">${Me(L.updatedStr)}</span>
              ${V}
            </div>
          </div>
          <div class="card-actions">
            ${ot}
            ${tt}
          </div>
        `,s.appendChild(B)}),s.dataset.delegated||(s.dataset.delegated="1",s.addEventListener("click",L=>{const z=L.target,B=z.closest(".history-card");if(!B||!B.dataset.id)return;const W=B.dataset.id;if(z.closest(".card-pin")){fn(W).catch(H=>console.error("设置置顶失败:",H));return}const D=z.closest(".card-delete");if(D){D.classList.contains("confirming")?eo(W).then(()=>l()).catch(H=>{console.error("删除失败:",H),D.classList.remove("confirming"),D.textContent="✕"}):(D.classList.add("confirming"),D.textContent="确认?",window.setTimeout(()=>{D.isConnected&&(D.classList.remove("confirming"),D.textContent="✕")},3e3));return}no(W).catch(H=>console.error("打开便签失败:",H))}))}catch(L){console.error("渲染历史列表失败:",L)}}}k()}function Me(o){const s=document.createElement("div");return s.textContent=o,s.innerHTML}let rt=[],Rt=0;function zt(o){return document.querySelector(o)}function bn(){if(!rt.length)return;const o=zt(".iv-img");o.src=rt[Rt],zt(".iv-count").textContent=`${Rt+1} / ${rt.length}`}function Zt(o){rt.length&&(Rt=(Rt+o+rt.length)%rt.length,bn())}function sn(){$().close()}async function cn(){try{const o=await te("get_viewer_data");if(!o||!o.urls||o.urls.length===0){sn();return}rt=o.urls,Rt=Math.min(Math.max(0,o.index),rt.length-1),bn()}catch(o){console.error("加载图片预览失败:",o),sn()}}async function yo(){if(document.body.innerHTML=`
    <div class="iv-root">
      <div class="iv-stage"><img class="iv-img" alt="图片预览"></div>
      <button class="iv-nav iv-prev" type="button" title="上一张">‹</button>
      <button class="iv-nav iv-next" type="button" title="下一张">›</button>
      <div class="iv-count"></div>
    </div>`,zt(".iv-prev").onclick=()=>Zt(-1),zt(".iv-next").onclick=()=>Zt(1),document.addEventListener("keydown",s=>{s.key==="ArrowLeft"?Zt(-1):s.key==="ArrowRight"&&Zt(1)}),zt(".iv-img").addEventListener("dragstart",s=>s.preventDefault()),await cn(),oe("viewer-reload",()=>cn()),!!rt.length)try{await $().show(),await $().setFocus()}catch(s){console.error("显示图片预览窗口失败:",s)}}let I=null,d=null,Ce=0,ne=0,yt=!0,_e=1,Pe=!1,It=0,G=[],K=new Float32Array(65536*7);const wo=o=>{if(o*7<=K.length)return;const s=new Float32Array(Math.max(K.length*2,o*7));s.set(K),K=s},vo=(o,s,u)=>{if(!o.fieldData||o.fieldData.length<4)return[235,240,255];const c=s/o.noteDpr,n=u/o.noteDpr;let v=Math.round(c/o.rectW*o.fieldW);v<0?v=0:v>=o.fieldW&&(v=o.fieldW-1);let m=Math.round(n/o.rectH*o.fieldH);m<0?m=0:m>=o.fieldH&&(m=o.fieldH-1);const b=(m*o.fieldW+v)*4;if(b+2>=o.fieldData.length)return[235,240,255];const l=o.fieldData[b],y=o.fieldData[b+1],_=o.fieldData[b+2],k=Math.max(l,y,_);if(!isFinite(k))return[235,240,255];if(k>=158)return[l,y,_];const g=158/Math.max(1,k);return[Math.min(255,l*g),Math.min(255,y*g),Math.min(255,_*g)]},xo=(o,s,u,c)=>{if(o.pcount>=o.maxP)return;let n=Math.round((3e3+Math.random()*2200)*o.k);const v=o.duration-c-40;if(v<120)return;n>v&&(n=v);const m=o.pcount++;o.px[m]=s,o.py[m]=u,o.pang[m]=(Math.random()-.5)*(110*Math.PI/180),o.pv0[m]=(20+Math.random()*15)*o.noteDpr,o.pv1[m]=150*o.noteDpr,o.plife[m]=n,o.page[m]=0,o.psize[m]=1.9+Math.random()*.7,o.pseed[m]=Math.random()*Math.PI*2,o.psway[m]=(Math.random()-.5)*100*o.noteDpr+o.windPx;const[b,l,y]=vo(o,s-o.originX,u-o.originY);o.pr[m]=b/255,o.pg[m]=l/255,o.pb[m]=y/255};function Eo(o){const s=Math.max(1,o.dprNote||1),u=Math.max(1,o.width),c=Math.max(1,o.height),n=o.fieldW||8,v=o.fieldH||8,m=o.fieldData||[],b=o.tW||8,l=o.tH||8,y=o.tField||[],_=3,k=Math.max(2,Math.ceil(u/_)),g=Math.max(2,Math.ceil(c/_)),f=k*g,N=new Float32Array(f),L=new Float32Array(f),z=new Float32Array(f),B=new Uint8Array(f),W=(P,S)=>{let Y=Math.round(P/u*b);Y<0?Y=0:Y>=b&&(Y=b-1);let F=Math.round(S/c*l);return F<0?F=0:F>=l&&(F=l-1),y[F*b+Y]};let D=0,H=0;for(let P=0;P<g;P++)for(let S=0;S<k;S++){const Y=(S+.5)*_,F=(P+.5)*_;N[D]=o.originX+Y*s,L[D]=o.originY+F*s;let q=W(Y,F);(!isFinite(q)||q<0)&&(q=0),z[D]=q,q>H&&(H=q),D++}const V=20,tt=Math.ceil(H/V)+2,ot=[];for(let P=0;P<tt;P++)ot.push([]);for(let P=0;P<f;P++){let S=Math.floor(z[P]/V);S<0?S=0:S>=tt&&(S=tt-1),ot[S].push(P)}const st=Math.max(0,Math.min(100,o.density??50))/100,pt=Math.max(.015,st),h=Math.round(f*(.03+.97*st))+1500,x=Math.max(.25,Math.min(4,100/Math.max(10,o.speed??100)));return{seq:o.seq??0,originX:o.originX,originY:o.originY,rectW:u,rectH:c,fieldW:n,fieldH:v,fieldData:m,tW:b,tH:l,tField:y,noteDpr:s,emitX:N,emitY:L,emitT:z,emitDone:B,binPts:ot,ecount:f,layerStartAt:o.startAt??Date.now(),duration:Math.round(2400*x),k:x,keepProb:pt,windPx:(o.wind??0)*s,done:!1,maxP:h,px:new Float32Array(h),py:new Float32Array(h),pang:new Float32Array(h),pv0:new Float32Array(h),pv1:new Float32Array(h),plife:new Float32Array(h),page:new Float32Array(h),psize:new Float32Array(h),pseed:new Float32Array(h),psway:new Float32Array(h),pr:new Float32Array(h),pg:new Float32Array(h),pb:new Float32Array(h),pcount:0}}function yn(){yt=!0,cancelAnimationFrame(Ce),ne&&(window.clearInterval(ne),ne=0),G=[],d&&(d.clearColor(0,0,0,0),d.clear(d.COLOR_BUFFER_BIT)),$().hide().catch(()=>{})}const wn=o=>{if(yt)return;Pe||(Pe=!0,It=o);const s=Math.min(.05,Math.max(.001,(o-It)/1e3));if(It=o,!d)return;d.clearColor(0,0,0,0),d.clear(d.COLOR_BUFFER_BIT);let u=0;for(let c=G.length-1;c>=0;c--){const n=G[c],v=Date.now()-n.layerStartAt;if(v>=n.duration){n.done=!0,G.splice(c,1);continue}const m=v>n.duration-200?Math.max(0,(n.duration-v)/200):1,b=Math.min(n.binPts.length-1,Math.floor(v/20));for(let l=0;l<=b;l++){const y=n.binPts[l];for(let _=0;_<y.length;_++){const k=y[_];n.emitDone[k]===0&&(n.emitDone[k]=1,Math.random()<n.keepProb&&xo(n,n.emitX[k],n.emitY[k],v))}}wo(u+n.pcount);for(let l=0;l<n.pcount;l++){const y=n.page[l]+s*1e3;n.page[l]=y;const _=n.plife[l],k=y/_;if(k>=1){const S=--n.pcount;l!==S&&(n.px[l]=n.px[S],n.py[l]=n.py[S],n.pang[l]=n.pang[S],n.pv0[l]=n.pv0[S],n.pv1[l]=n.pv1[S],n.plife[l]=n.plife[S],n.page[l]=n.page[S],n.psize[l]=n.psize[S],n.pseed[l]=n.pseed[S],n.psway[l]=n.psway[S],n.pr[l]=n.pr[S],n.pg[l]=n.pg[S],n.pb[l]=n.pb[S]),l--;continue}const g=y/1e3,f=_/1e3,N=1-Math.exp(-g/.3),L=1-.3*Math.min(1,g/Math.max(.6,f)),z=(n.pv0[l]+n.pv1[l]*N*L)*(1+.3*Math.sin(y*.0021+n.pseed[l]*3)),B=Math.sin(n.pang[l]),W=-Math.cos(n.pang[l]),D=Math.sin(y*.0025+n.pseed[l])*85*n.noteDpr,H=Math.sin(y*.009+n.pseed[l]*2.3)*55*n.noteDpr,V=Math.sin(y*.024+n.pseed[l]*4.1)*20*n.noteDpr,tt=n.psway[l]+D+H+V,ot=Math.sin(y*.0062+n.pseed[l]*1.7)*55*n.noteDpr*(.35+.65*N);n.px[l]+=(B*z+tt)*s,n.py[l]+=(W*z+ot)*s;const st=1-k,pt=.8+.2*Math.sin(y*.02+n.pseed[l]*5),J=st*Math.pow(st,.2)*m*pt;if(J<.02)continue;const h=1+.22*Math.sin(y*.007+n.pseed[l]*2),x=n.psize[l]*h*1.3,P=u*7;K[P]=n.px[l],K[P+1]=n.py[l],K[P+2]=x*2*n.noteDpr,K[P+3]=J,K[P+4]=n.pr[l],K[P+5]=n.pg[l],K[P+6]=n.pb[l],u++}}u>0&&(d.bindBuffer(d.ARRAY_BUFFER,re),d.bufferData(d.ARRAY_BUFFER,K.subarray(0,u*7),d.DYNAMIC_DRAW),d.enableVertexAttribArray(se),d.vertexAttribPointer(se,2,d.FLOAT,!1,28,0),d.enableVertexAttribArray(ie),d.vertexAttribPointer(ie,2,d.FLOAT,!1,28,8),d.enableVertexAttribArray(ce),d.vertexAttribPointer(ce,3,d.FLOAT,!1,28,16),d.drawArrays(d.POINTS,0,u)),G.length===0&&yn()},vn=o=>{wn(o),yt||(Ce=requestAnimationFrame(vn))};async function Lo(o){const s=Date.now();G=G.filter(n=>s-n.layerStartAt<n.duration),G=G.filter(n=>!(Math.abs(n.originX-o.originX)<4&&Math.abs(n.originY-o.originY)<4));const u=Eo(o);G.push(u),yt&&(yt=!1,Pe=!1,Ce=requestAnimationFrame(vn),ne=window.setInterval(()=>{if(yt)return;const n=performance.now();n-It>60&&(It=n,wn(n))},40));const c=$();try{await c.show()}catch{}try{await c.setAlwaysOnTop(!0)}catch{}c.setFocus().catch(()=>{}),window.setTimeout(()=>{c.setAlwaysOnTop(!0).catch(()=>{})},120)}async function Mo(){const o=await Promise.race([ee(),new Promise(v=>setTimeout(()=>v(null),1500))]).catch(()=>null),s=Math.round((window.screen.width||window.innerWidth||1920)*(window.devicePixelRatio||1)),u=Math.round((window.screen.height||window.innerHeight||1080)*(window.devicePixelRatio||1)),c=Math.max(1,o?.size?.width??s),n=Math.max(1,o?.size?.height??u);I&&(I.width!==c||I.height!==n)&&(I.width=c,I.height=n,d=null,re=null,se=0,ie=0,ce=0,xn()||console.error("粒子层 WebGL 重建失败"))}let re=null,se=0,ie=0,ce=0;function xn(){if(!I)return!1;const o={alpha:!0,premultipliedAlpha:!1,antialias:!1,depth:!1},s=I.getContext("webgl",o)||I.getContext("experimental-webgl",o);if(!s)return!1;d=s;const u=`
    attribute vec2 a_pos;
    attribute vec2 a_param;
    attribute vec3 a_color;
    uniform vec2 u_res;
    varying float v_alpha;
    varying vec3 v_color;
    void main() {
      vec2 clip = (a_pos / u_res) * 2.0 - 1.0;
      clip.y = -clip.y;
      gl_Position = vec4(clip, 0.0, 1.0);
      gl_PointSize = a_param.x;
      v_alpha = a_param.y;
      v_color = a_color;
    }`,c=`
    precision mediump float;
    varying float v_alpha;
    varying vec3 v_color;
    uniform sampler2D u_sprite;
    void main() {
      // 圆形发光纹理：alpha 决定形状（点精灵在部分驱动上 discard 圆形不可靠 → 用纹理兜底）
      vec4 c = texture2D(u_sprite, gl_PointCoord);
      if (c.a < 0.01) discard;
      gl_FragColor = vec4(v_color * 1.5, v_alpha * c.a);
    }`,n=(f,N)=>{const L=d.createShader(f);return L?(d.shaderSource(L,N),d.compileShader(L),d.getShaderParameter(L,d.COMPILE_STATUS)?L:null):null},v=n(d.VERTEX_SHADER,u),m=n(d.FRAGMENT_SHADER,c);if(!v||!m)return!1;const b=d.createProgram();if(!b||(d.attachShader(b,v),d.attachShader(b,m),d.linkProgram(b),!d.getProgramParameter(b,d.LINK_STATUS)))return!1;d.useProgram(b),se=d.getAttribLocation(b,"a_pos"),ie=d.getAttribLocation(b,"a_param"),ce=d.getAttribLocation(b,"a_color"),d.uniform2f(d.getUniformLocation(b,"u_res"),I.width,I.height);const l=d.getUniformLocation(b,"u_sprite");l&&d.uniform1i(l,0);const y=32,_=document.createElement("canvas");_.width=y,_.height=y;const k=_.getContext("2d");if(k){const f=k.createRadialGradient(y/2,y/2,0,y/2,y/2,y/2);f.addColorStop(0,"rgba(255,255,255,1)"),f.addColorStop(.35,"rgba(255,255,255,0.75)"),f.addColorStop(.75,"rgba(255,255,255,0.2)"),f.addColorStop(1,"rgba(255,255,255,0)"),k.fillStyle=f,k.fillRect(0,0,y,y)}const g=d.createTexture();return g&&(d.activeTexture(d.TEXTURE0),d.bindTexture(d.TEXTURE_2D,g),d.texImage2D(d.TEXTURE_2D,0,d.RGBA,d.RGBA,d.UNSIGNED_BYTE,_),d.texParameteri(d.TEXTURE_2D,d.TEXTURE_MIN_FILTER,d.LINEAR),d.texParameteri(d.TEXTURE_2D,d.TEXTURE_MAG_FILTER,d.LINEAR),d.texParameteri(d.TEXTURE_2D,d.TEXTURE_WRAP_S,d.CLAMP_TO_EDGE),d.texParameteri(d.TEXTURE_2D,d.TEXTURE_WRAP_T,d.CLAMP_TO_EDGE)),re=d.createBuffer(),d.bindBuffer(d.ARRAY_BUFFER,re),d.viewport(0,0,I.width,I.height),d.enable(d.BLEND),d.blendFunc(d.SRC_ALPHA,d.ONE),!0}async function _o(){const o=$();_e=Math.min(window.devicePixelRatio||1,2),await Mo();const s=window.screen.width||window.innerWidth,u=window.screen.height||window.innerHeight,c=Math.max(1,Math.round(s*_e)),n=Math.max(1,Math.round(u*_e));if(o.setIgnoreCursorEvents(!0).catch(()=>{}),document.body.style.margin="0",document.body.style.overflow="hidden",document.body.style.background="transparent",I=document.createElement("canvas"),I.width=c,I.height=n,I.style.position="fixed",I.style.left="0",I.style.top="0",I.style.width="100%",I.style.height="100%",I.style.zIndex="2147483647",I.style.pointerEvents="none",document.body.appendChild(I),!xn()){console.error("粒子层 WebGL 初始化失败");return}oe("particles-start",v=>{Lo(v.payload).catch(m=>console.error("粒子层启动失败:",m))}),oe("particles-cancel",v=>{const m=v?.payload?.seq??0,b=v?.payload?.originX,l=v?.payload?.originY;m!==0?G=G.filter(y=>!(y.seq===m&&(b===void 0||Math.abs(y.originX-b)<1)&&(l===void 0||Math.abs(y.originY-l)<1))):G=[],G.length===0&&yn()})}function Ct(o){return o.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Qt(o){let s=o.replace(/\n/g,"<br/>");return s=s.replace(/`([^`]+)`/g,(u,c)=>`<code>${c}</code>`),s=s.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),s=s.replace(/__([^_]+)__/g,"<strong>$1</strong>"),s=s.replace(/\*([^*]+)\*/g,"<em>$1</em>"),s=s.replace(/(^|[^_])_([^_]+)_(?!_)/g,"$1<em>$2</em>"),s=s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,(u,c,n)=>`<a href="${/^(https?:|mailto:|\/|#)/i.test(n)?n:"#"}" target="_blank" rel="noopener noreferrer">${c}</a>`),s}function En(o){const u=(o||"").replace(/\r\n?/g,`
`).split(`
`);let c="",n=0,v="";const m=()=>{v&&(c+=`</${v}>`,v="")};for(;n<u.length;){const b=u[n],l=b.trim();if(l.startsWith("```")){m(),n++;const f=[];for(;n<u.length&&!u[n].trim().startsWith("```");)f.push(u[n]),n++;n++,c+=`<pre><code>${Ct(f.join(`
`))}</code></pre>`;continue}const y=b.match(/^(#{1,6})\s+(.*)$/);if(y){m();const f=y[1].length;c+=`<h${f}>${Qt(Ct(y[2]))}</h${f}>`,n++;continue}if(/^\s*([-*_])\1{2,}\s*$/.test(l)){m(),c+="<hr/>",n++;continue}if(/^>\s?/.test(b)){m();const f=[];for(;n<u.length&&/^>\s?/.test(u[n]);)f.push(u[n].replace(/^>\s?/,"")),n++;c+=`<blockquote>${En(f.join(`
`))}</blockquote>`;continue}const _=b.match(/^\s*[-*+]\s+(.*)$/);if(_){v!=="ul"&&(m(),c+="<ul>",v="ul"),c+=`<li>${Qt(Ct(_[1]))}</li>`,n++;continue}const k=b.match(/^\s*\d+\.\s+(.*)$/);if(k){v!=="ol"&&(m(),c+="<ol>",v="ol"),c+=`<li>${Qt(Ct(k[1]))}</li>`,n++;continue}if(l===""){m(),n++;continue}m();const g=[];for(;n<u.length&&u[n].trim()!==""&&!u[n].trim().startsWith("```")&&!/^#{1,6}\s+/.test(u[n])&&!/^\s*[-*+]\s+/.test(u[n])&&!/^\s*\d+\.\s+/.test(u[n])&&!/^>\s?/.test(u[n])&&!/^\s*([-*_])\1{2,}\s*$/.test(u[n].trim());)g.push(u[n]),n++;c+=`<p>${Qt(Ct(g.join(`
`)))}</p>`}return m(),c}const ko=`
:root {
  --bg: #fffefb;
  --bg-bar: #f7f4ee;
  --border: #ebe5da;
  --text: #3a3a3a;
  --text-sub: #a39c90;
  --accent: #6b9fd9;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 16px;
  font-family: "Microsoft YaHei UI", "PingFang SC", system-ui, -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.75;
  color: var(--text);
  background: var(--bg);
  word-wrap: break-word;
  min-height: 100vh;
}
h1, h2, h3, h4, h5, h6 { margin: 12px 0 8px; line-height: 1.35; font-weight: 700; color: var(--text); }
h1 { font-size: 22px; }
h2 { font-size: 19px; }
h3 { font-size: 17px; }
h4 { font-size: 15px; }
h5, h6 { font-size: 14px; color: var(--text-sub); }
h1:first-child, h2:first-child, h3:first-child { margin-top: 0; }
p { margin: 8px 0; }
ul, ol { margin: 8px 0; padding-left: 22px; }
li { margin: 3px 0; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 12.5px; background: var(--bg-bar); border: 1px solid var(--border); border-radius: 4px; padding: 1px 4px; color: #b5553a; }
pre { margin: 10px 0; background: var(--bg-bar); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; overflow-x: auto; }
pre code { background: transparent; border: none; padding: 0; color: var(--text); font-size: 12.5px; line-height: 1.5; }
blockquote { margin: 10px 0; padding: 6px 12px; border-left: 3px solid var(--accent); background: var(--bg-bar); border-radius: 0 6px 6px 0; color: var(--text-sub); }
hr { border: none; border-top: 1px solid var(--border); margin: 14px 0; }
strong { font-weight: 700; }
body::-webkit-scrollbar { width: 6px; }
body::-webkit-scrollbar-track { background: transparent; }
body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
body::-webkit-scrollbar-thumb:hover { background: var(--text-sub); }
`,So=`
:root {
  --bg: #23232a;
  --bg-bar: #2d2d35;
  --border: #3c3c45;
  --text: #e6e4df;
  --text-sub: #9a948b;
  --accent: #7fb0e6;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 16px;
  font-family: "Microsoft YaHei UI", "PingFang SC", system-ui, -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.75;
  color: var(--text);
  background: var(--bg);
  color-scheme: dark;
  word-wrap: break-word;
  min-height: 100vh;
}
h1, h2, h3, h4, h5, h6 { margin: 12px 0 8px; line-height: 1.35; font-weight: 700; color: var(--text); }
h1 { font-size: 22px; }
h2 { font-size: 19px; }
h3 { font-size: 17px; }
h4 { font-size: 15px; }
h5, h6 { font-size: 14px; color: var(--text-sub); }
h1:first-child, h2:first-child, h3:first-child { margin-top: 0; }
p { margin: 8px 0; }
ul, ol { margin: 8px 0; padding-left: 22px; }
li { margin: 3px 0; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 12.5px; background: var(--bg-bar); border: 1px solid var(--border); border-radius: 4px; padding: 1px 4px; color: #e89b7d; }
pre { margin: 10px 0; background: var(--bg-bar); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; overflow-x: auto; }
pre code { background: transparent; border: none; padding: 0; color: var(--text); font-size: 12.5px; line-height: 1.5; }
blockquote { margin: 10px 0; padding: 6px 12px; border-left: 3px solid var(--accent); background: var(--bg-bar); border-radius: 0 6px 6px 0; color: var(--text-sub); }
hr { border: none; border-top: 1px solid var(--border); margin: 14px 0; }
strong { font-weight: 700; }
body::-webkit-scrollbar { width: 6px; }
body::-webkit-scrollbar-track { background: transparent; }
body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
body::-webkit-scrollbar-thumb:hover { background: var(--text-sub); }
`,Po={github:`
:root {
  --text: #1f2328;
  --bg: #ffffff;
  --bg-bar: #f6f8fa;
  --border: #d0d7de;
  --accent: #0969da;
  --text-sub: #656d76;
}
h1, h2 { border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
code { background: rgba(175, 184, 193, 0.2); }
`,"rose-pine":`
:root {
  --text: #e0def4;
  --bg: #191724;
  --bg-bar: #1f1d2e;
  --border: #403d52;
  --accent: #eb6f92;
  --text-sub: #908caa;
  color-scheme: dark;
}
code { background: rgba(255, 255, 255, 0.06); }
blockquote { color: var(--text-sub); }
`,solarized:`
:root {
  --text: #657b83;
  --bg: #fdf6e3;
  --bg-bar: #eee8d5;
  --border: #e3dcc3;
  --accent: #268bd2;
  --text-sub: #93a1a1;
}
code { background: var(--bg-bar); }
`,monokai:`
:root {
  --text: #f8f8f2;
  --bg: #272822;
  --bg-bar: #1e1f1c;
  --border: #3e3d39;
  --accent: #66d9ef;
  --text-sub: #75715e;
  color-scheme: dark;
}
code { background: rgba(255, 255, 255, 0.06); }
blockquote { color: var(--text-sub); }
`,"ayu-dark":`
:root {
  --text: #e6e1cf;
  --bg: #0a0e14;
  --bg-bar: #0f141b;
  --border: #1c2530;
  --accent: #ffb454;
  --text-sub: #7e8a96;
  color-scheme: dark;
}
code { background: rgba(255, 255, 255, 0.05); }
blockquote { color: var(--text-sub); }
`,"solarized-dark":`
:root {
  --text: #93a1a1;
  --bg: #002b36;
  --bg-bar: #013640;
  --border: #0a4853;
  --accent: #2aa198;
  --text-sub: #586e75;
  color-scheme: dark;
}
code { background: rgba(255, 255, 255, 0.06); }
`,"github-dark":`
:root {
  --text: #e6edf3;
  --bg: #0d1117;
  --bg-bar: #161b22;
  --border: #30363d;
  --accent: #58a6ff;
  --text-sub: #8b949e;
  color-scheme: dark;
}
h1, h2 { border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
code { background: rgba(110, 118, 129, 0.4); }
`},To=`
body.has-bg-img { background: transparent; }
body.has-bg-img::before {
  content: "";
  position: fixed;
  /* 向外扩展以容纳模糊半径的采样范围（最大 40px），
     否则预览区边缘的模糊会因采样落到图外而减弱 */
  inset: -48px;
  z-index: -1;
  background-image: var(--md-bg-img);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  filter: blur(var(--md-blur, 16px));
  transform: translateZ(0);
}
body.has-bg-img::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  background: var(--bg);
  /* 不透明度越高（更不透明），蒙版越淡、背景图越清晰；调低则蒙版更厚、便于阅读 */
  opacity: calc(0.82 - var(--md-bg-opacity, 1) * 0.42);
}
/* 透明主题：预览区与便签一致——透明 + 高斯模糊，仅保留一层极淡的蒙版保证文字可读 */
body.has-bg-img.md-transparent::after {
  opacity: 0.12;
}
`;function Ao(o,s=""){return o==="custom"?s||"":o==="default"?"":Po[o]||""}let Ln,Mn,_n,kn,ke=null;function Co(){return ke||(ke=Promise.all([it(()=>import("./flame-BOX-0ac9.js"),[]).then(o=>Ln=o),it(()=>import("./glow-particles-DDkq2fVs.js"),__vite__mapDeps([2,1,3])).then(o=>Mn=o),it(()=>import("./glow-particles-inhale-zFmqHhx9.js"),[]).then(o=>_n=o),it(()=>import("./glass-shatter-BITFi3iM.js"),[]).then(o=>kn=o)]).then(()=>{})),ke}const A={load:Co,get flame(){return Ln},get glow(){return Mn},get inhale(){return _n},get glass(){return kn}},zo=250,ln='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',Io='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>';function Ro(o,s=""){const u=document.getElementById("app");u.innerHTML=`
    <div class="note-window">
      <div class="titlebar">
        <div class="titlebar-left">
          <input class="title-input" id="note-title" placeholder="便签" maxlength="40" spellcheck="false" title="点击编辑标题" />
        </div>
        <div class="titlebar-grip" id="drag-grip" title="拖动便签"><span class="grip-dots"></span></div>
        <div class="titlebar-right">
          <button class="icon-btn" id="btn-toolbar-toggle" title="显示/隐藏格式工具栏" aria-pressed="false">
            <span class="tb-toggle-ico" aria-hidden="true">Aa</span>
          </button>
          <button class="icon-btn" id="btn-pin" title="置顶" aria-pressed="true">
            <span class="nail" aria-hidden="true">
              <svg class="pin-icon" viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <path d="${gn}"></path>
              </svg>
            </span>
          </button>
          <button class="icon-btn" id="btn-max" title="最大化">${ln}</button>
          <button class="icon-btn" id="btn-tray" title="最小化到托盘">&#9661;</button>
          <button class="icon-btn close" id="btn-close" title="关闭">&#10005;</button>
        </div>
      </div>
      <!-- 新建便签默认隐藏格式工具栏（display:none 兜底，避免首帧闪现；加载后按设置恢复）。
           【必须用 HTML 注释】此处是 innerHTML 模板字符串而非 JSX——JSX 风格的
           {&#47;* ... *&#47;} 在 HTML 里是一行真实文本节点，会把标题栏与工具栏之间
           撑出一条无垫底空隙，壁纸从那里透出（"中间多一条深色横带"的根因） -->
      <div class="toolbar" style="display:none">
        <div class="tool-color wps" id="tool-fg-wrap" title="字体颜色">
          <button type="button" class="cc-main" id="tool-fg-apply" title="应用当前字体颜色">
            <span class="cc-letter">A</span>
            <span class="cc-bar" id="tool-fg-bar"></span>
          </button>
          <button type="button" class="cc-drop" id="tool-fg-drop" title="选择字体颜色">▾</button>
          <input type="color" class="color-swatch-input" id="tool-fg" value="#3a3a3a" title="选择颜色">
        </div>
        <div class="tool-color wps" id="tool-bg-wrap" title="背景颜色">
          <button type="button" class="cc-main cc-main-bg" id="tool-bg-apply" title="应用当前背景颜色">
            <span class="cc-letter">B</span>
            <span class="cc-bar" id="tool-bg-bar"></span>
          </button>
          <button type="button" class="cc-drop" id="tool-bg-drop" title="选择背景颜色">▾</button>
          <input type="color" class="color-swatch-input" id="tool-bg" value="#fffefb" title="选择背景色">
        </div>
        <div class="tool-color wps" id="tool-size-wrap" title="文字大小">
          <button type="button" class="cc-main" id="tool-size-main" title="选择文字大小">
            <span class="cc-letter ts-letter" aria-hidden="true">A</span>
            <span class="ts-num" id="tool-size-num">14</span>
          </button>
          <button type="button" class="cc-drop" id="tool-size-drop" title="选择字号">▾</button>
        </div>
        <div class="tool-md" id="tool-md" title="Markdown 预览模式">
          <button type="button" class="md-btn" id="btn-md-preview" title="Markdown 预览：把内容渲染为 Markdown">预览</button>
          <button type="button" class="md-btn" id="btn-md-split" title="拆分预览：左侧编辑、右侧实时预览">拆分</button>
        </div>
        <div class="tool-format" id="tool-format" title="用大模型整理格式（选择 Markdown / 纯文本）">
          <button type="button" class="md-btn" id="btn-fmt" title="调用大模型整理便签格式">整理</button>
        </div>
      </div>
      <div class="editor-area" id="editor-area">
        <div class="editor" id="editor" contenteditable="true" data-placeholder="写点什么..."></div>
        <iframe class="md-preview" id="md-preview"></iframe>
      </div>
      <div class="cc-panel" id="tool-fg-panel" hidden></div>
      <div class="cc-panel" id="tool-bg-panel" hidden></div>
      <!-- 自动保存提示（左下角浮动，短暂显示） -->
      <span class="save-status" id="save-status"></span>
    </div>
  `;const c=document.getElementById("editor"),n=$(),v=document.querySelector(".titlebar"),m=document.getElementById("btn-pin"),b=document.getElementById("btn-toolbar-toggle"),l=document.getElementById("btn-close"),y=document.getElementById("btn-tray"),_=document.getElementById("note-title"),k=document.getElementById("save-status");let g=!1;const f=document.getElementById("tool-fg"),N=document.getElementById("tool-bg"),L=document.getElementById("tool-fg-apply"),z=document.getElementById("tool-bg-apply"),B=document.getElementById("tool-size-wrap"),W=document.getElementById("tool-size-main"),D=document.getElementById("tool-size-drop"),H=document.getElementById("tool-size-num"),V=document.getElementById("btn-max"),tt=document.getElementById("editor-area"),ot=document.getElementById("md-preview"),st=document.getElementById("btn-md-preview"),pt=document.getElementById("btn-md-split"),J=document.getElementById("btn-fmt"),h=document.querySelector(".note-window");let x={content:"",title:"",md:"none",pinned:!0,created:Date.now(),updated:Date.now(),width:420,height:440},P,S,Y,F=!1,q=null,wt=null;const ct=document.querySelector(".toolbar"),le=t=>{ct.style.display=t?"":"none",b.classList.toggle("active",t),b.setAttribute("aria-pressed",String(t))};b.addEventListener("click",()=>{const t=ct.style.display==="none";le(t),x.toolbar_visible=t,Pt(o,x).catch(e=>console.error("保存工具栏配置失败:",e))});let mt=null,ft=!1,vt=!1,Bt="";v.addEventListener("mousedown",t=>{t.target.closest(".icon-btn, input, select, textarea")||pn()});const ze=[b,m,V,y],Sn=76,Pn=16,Tn=8,An=31,Cn=31;function de(){const t=v.clientWidth,r=Math.max(0,t-Sn-Pn)*1.15/2.15-Tn-An,i=Math.max(0,Math.min(ze.length,Math.floor(r/Cn)));ze.forEach((p,w)=>{p.style.display=w<i?"":"none"}),l.style.display=""}function ue(){ct.classList.remove("crowded");const t=ct.scrollWidth>ct.clientWidth+1;ct.classList.toggle("crowded",t)}requestAnimationFrame(()=>{ue(),de()});try{n.onResized(()=>{ue(),de()})}catch{}try{new ResizeObserver(()=>{ue(),de()}).observe(document.documentElement)}catch{}c.addEventListener("blur",()=>{const t=window.getSelection();t&&t.rangeCount>0&&(q=t.getRangeAt(0).cloneRange())}),ct.addEventListener("mousedown",()=>{wt=pe()},!0);function pe(){const t=window.getSelection();if(t&&t.rangeCount>0&&!t.isCollapsed){const e=t.getRangeAt(0);return{start:Dt(e.startContainer,e.startOffset),end:Dt(e.endContainer,e.endOffset)}}return q&&!q.collapsed?{start:Dt(q.startContainer,q.startOffset),end:Dt(q.endContainer,q.endOffset)}:null}function xt(t){if(t)try{c.focus();const e=window.getSelection();if(!e)return;const a=Ie(t.start),r=Ie(t.end),i=document.createRange();i.setStart(a.node,a.offset),i.setEnd(r.node,r.offset),e.removeAllRanges(),e.addRange(i)}catch(e){console.error("还原选区失败:",e)}}function Dt(t,e){let a=0;const r=document.createTreeWalker(c,NodeFilter.SHOW_ALL,null);let i;for(;i=r.nextNode();){if(i===t){if(i.nodeType===Node.TEXT_NODE)return a+e;let p=0;for(let w=0;w<e&&w<i.childNodes.length;w++)p+=i.childNodes[w].textContent?.length||0;return a+p}i.nodeType===Node.TEXT_NODE&&(a+=i.textContent?.length||0)}return a}function Ie(t){let e=0;const a=document.createTreeWalker(c,NodeFilter.SHOW_TEXT,null);let r,i={node:c,offset:0};for(;r=a.nextNode();){const p=r.textContent?.length||0;if(e+p>=t)return{node:r,offset:t-e};e+=p,i={node:r,offset:p}}return i}function zn(){const t=x.width&&x.width>0?x.width:420,e=x.height&&x.height>0?x.height:440;try{$().setSize(new Kn(t,e)).catch(()=>{})}catch(a){console.error("设置窗口尺寸失败:",a)}}function In(){const t=e=>{const r=e.target.closest("img");if(!r||r.closest(".md-preview"))return;const i=Array.from(document.querySelectorAll(".editor img")),p=i.indexOf(r);if(p<0)return;const w=i.map(M=>M.src);te("open_image_viewer",{urls:w,index:p}).catch(M=>console.error("打开图片预览失败:",M))};c.addEventListener("dblclick",t)}async function Rn(){try{const t=await so(o);t?(x={width:420,height:440,title:"",md:"none",...t},c.innerHTML=t.content||"",_.value=t.title||"",Ft(t.pinned,!1),le(t.toolbar_visible??!1)):(Ft(!0,!1),le(!1)),s&&!t&&(c.innerText=s,x.content=c.innerHTML,et())}catch(t){console.error("加载便签失败:",t),Ft(!0,!1)}try{Ut(),await ve(),await Je(),xe(),await Be(),zn(),await me(),await fe()}catch(t){console.error("便签外观应用失败（已忽略，继续显示）:",t)}if(o!=="main")try{const t=await mn();te("diag_log",{msg:`[note] init show: noteId=${o} open=${JSON.stringify(t)}`}).catch(()=>{}),t.includes(o)?(await $().show(),await $().setFocus()):await $().hide()}catch(t){console.error("读取打开状态失败:",t)}await Fe(),$e(),setInterval($e,400),c.focus(),In(),A.load()}function Ft(t,e=!0){x.pinned=t,m.classList.toggle("pinned",t),m.setAttribute("aria-pressed",t?"true":"false"),m.title=t?"取消置顶":"置顶",ro(t).catch(a=>console.error("置顶失败:",a)),e&&t&&fn(o).catch(a=>console.error("登记置顶失败:",a))}async function Re(t){let e=x.bg_image||t.bg_image||"";if(e&&!e.startsWith("data:"))try{const{readBgImage:a}=await it(async()=>{const{readBgImage:r}=await import("./settings-MrxtH9iL.js").then(i=>i.w);return{readBgImage:r}},__vite__mapDeps([0,1]));e=await a(e)}catch{e=""}return e}async function me(){const t=await X(),e=t.theme==="transparent",a=qt()?.body??null;if(e){if(h.classList.remove("bg-immersive"),h.style.removeProperty("--note-panel-alpha"),h.style.removeProperty("--note-bar-alpha"),h.classList.add("bg-transparent"),h.classList.remove("has-bg","on-dark-bg"),h.style.removeProperty("--note-bg-img"),h.style.removeProperty("--note-bg-opacity"),ae({target:h,strength:0,enabled:!1}),await Et(),a){a.classList.add("md-transparent"),a.classList.remove("has-bg-img"),a.style.removeProperty("--md-bg-img"),a.style.removeProperty("--md-bg-opacity"),a.style.removeProperty("--md-blur");const i=getComputedStyle(document.documentElement).getPropertyValue("--trans-opacity").trim();a.style.background=i==="0"?"transparent":`color-mix(in srgb, var(--bg) ${i}%, transparent)`}return}await Et(),h.classList.remove("bg-transparent"),a&&a.style.removeProperty("background");const r=await Re(t);await hn(h,t,{bgUrl:r||void 0}),h.classList.toggle("bg-immersive",!!r),h.style.removeProperty("--note-panel-alpha"),h.style.removeProperty("--note-bar-alpha")}async function Et(){const t=await X();if(t.theme!=="transparent"){h.style.removeProperty("--trans-opacity"),h.classList.remove("transparent-clear"),ut(!1,0,0).catch(()=>{});return}const e=un(t.transparent_opacity);if(e<2){h.classList.add("transparent-clear"),h.style.setProperty("--trans-opacity","0"),document.documentElement.style.setProperty("--trans-opacity","0"),ut(!1,0,0).catch(()=>{});return}h.classList.remove("transparent-clear");const a=Math.round(e*.6);h.style.setProperty("--trans-opacity",String(a)),document.documentElement.style.setProperty("--trans-opacity",String(a));const r=Ae(getComputedStyle(h).getPropertyValue("--bg"))??0;ut(!0,1,r).catch(i=>console.error("应用实时模糊失败:",i))}async function fe(){const t=await X(),e=t.theme==="transparent",a=an(t.glass_blur),r=t.glass_enabled!==!1,{applyGlassBlur:i}=await it(async()=>{const{applyGlassBlur:p}=await Promise.resolve().then(()=>ho);return{applyGlassBlur:p}},void 0);if(e){await Et();return}i({target:h,strength:a,enabled:r})}function et(){F||(P&&window.clearTimeout(P),P=window.setTimeout(()=>{x.content=c.innerHTML,x.title=_.value,x.updated=Date.now(),gt("保存中…"),Pt(o,x).then(()=>gt("已保存")).catch(t=>{console.error("保存失败:",t),gt("保存失败",!0)})},zo))}let ge;function gt(t,e=!1){g||k&&(k.textContent=t,k.classList.toggle("error",e),k.classList.toggle("ok",!e&&t==="已保存"),k.classList.add("show"),ge&&window.clearTimeout(ge),ge=window.setTimeout(()=>k.classList.remove("show"),e?2600:1400))}async function Be(){await X(),L.title=`按当前颜色上色（${Tt("fg_color")}）`,z.title=`按当前背景色上色（${Tt("bg_color")}）`,B.title=`文字大小（增大 ${Tt("size_up")} / 减小 ${Tt("size_down")}）`}dn(()=>{te("diag_log",{msg:"[note] settings-changed fired, re-applying"}).catch(()=>{}),Be(),ve(),Je(),me(),fe(),Fe()});let $t=!0,j=null,Lt=null,Z=null,Q=!1,nt=!1,he=!1;const Nt=28,Ot=12,Bn=t=>1+1.9*Math.pow(t-1,3)+.9*Math.pow(t-1,2),Dn=t=>t*t*t;function De(t,e,a,r){return new Promise(i=>{n.outerPosition().then(p=>{const w=p.x,M=p.y,E=performance.now(),T=C=>{const R=Math.min(1,(C-E)/a),bt=r(R),O=Math.round(w+(t-w)*bt),Ee=Math.round(M+(e-M)*bt);n.setPosition(new Le(O,Ee)).catch(()=>{}),R<1?requestAnimationFrame(T):i()};requestAnimationFrame(T)}).catch(()=>i())})}async function Fe(){try{$t=(await X()).edge_snap!==!1,!$t&&Q&&be()}catch(t){console.error("读取贴边设置失败:",t)}}async function $e(){if(!(nt||Q))try{const t=await n.outerPosition(),e=await n.outerSize(),a=await ee();if(!a)return;const r=a.workArea,i=t.x,p=t.y,w=t.x+e.width,M=t.y+e.height,E=r.position.x,T=r.position.y,C=r.position.x+r.size.width,R=r.position.y+r.size.height;i<=E+Ot?j="left":w>=C-Ot?j="right":p<=T+Ot?j="top":M>=R-Ot?j="bottom":j=null}catch{}}async function Ne(){if(!(!j||nt))try{nt=!0;const t=await n.outerPosition(),e=await n.outerSize(),a=await ee();if(!a){nt=!1;return}const r=a.workArea;Lt={x:t.x,y:t.y},Z={x:r.position.x,y:r.position.y,w:r.size.width,h:r.size.height};let i=t.x,p=t.y;j==="left"?i=r.position.x-(e.width-Nt):j==="right"?i=r.position.x+r.size.width-Nt:j==="top"?p=r.position.y-(e.height-Nt):j==="bottom"&&(p=r.position.y+r.size.height-Nt),await De(i,p,300,Dn),Q=!0}catch(t){console.error("贴边收起失败:",t)}finally{setTimeout(()=>{nt=!1},380)}}async function be(t=!1){if(!(!Q||!Lt||nt))try{nt=!0;const e=await n.outerSize();let a=Lt.x,r=Lt.y;if(Z){const i=Z.x+Z.w-e.width,p=Z.y+Z.h-e.height;a=Math.min(Math.max(a,Z.x),Math.max(Z.x,i)),r=Math.min(Math.max(r,Z.y),Math.max(Z.y,p))}h.classList.add("edge-pop-in"),await De(a,r,360,Bn),h.classList.remove("edge-pop-in"),Q=!1,Lt=null,Z=null}catch(e){console.error("贴边弹出失败:",e)}finally{setTimeout(()=>{nt=!1,t&&$t&&j&&!he&&!Q&&Ne()},400)}}document.addEventListener("mouseout",t=>{t.relatedTarget===null&&(he=!1),!Q&&t.relatedTarget===null&&$t&&j&&Ne()}),document.addEventListener("mouseover",()=>{he=!0,Q&&be(!0)});let Mt=!1,_t=0;const ye=()=>{A.glow?.bumpGlowGen();try{h.style.clipPath="",h.style.setProperty("-webkit-mask-image",""),h.style.setProperty("mask-image",""),h.style.opacity="",h.style.boxShadow=""}catch{}};n.listen("summoned",()=>{if(g=!1,Q&&be(!1),U&&(U=!1,ht=!1,A.flame?.cancelFlame(),A.glow?.cancelGlowParticles(),A.glass?.cancelGlassShards(),A.inhale?.cancelInhaleParticles(),Mt=!0),h.style.clipPath="",h.style.setProperty("-webkit-mask-image",""),h.style.setProperty("mask-image",""),h.style.opacity="",h.style.boxShadow="",ve().catch(()=>{}),me().catch(()=>{}),fe().catch(()=>{}),Mt&&!U)if(Mt=!1,h.classList.contains("bg-transparent"))Kt&&(Kt=!1,Et().catch(()=>{}));else{const t=_t;Promise.all([X(),A.load()]).then(([e])=>{if(t!==_t||U||F)return;const a=e.particle_count??50,r=e.animation_speed??100;e.particle_mode==="none"?ye():e.particle_mode==="erode"?A.flame.playFlameMaterialize(h,a,r):e.particle_mode==="inhale"?A.inhale.playInhaleMaterialize(h,a,r):e.particle_mode==="glass"?A.glass?.restoreGlassSummoned():ye()}).catch(()=>{t!==_t||U||F||ye()})}n.setFocus().catch(()=>{}),requestAnimationFrame(()=>{const t=h;t.style.transform="scale(0.9999)",t.offsetHeight,t.style.transform="",c.style.visibility="hidden",c.offsetHeight,c.style.visibility="",window.dispatchEvent(new Event("resize"))})});function Oe(){document.execCommand("foreColor",!1,f.value),et()}function He(){document.execCommand("hiliteColor",!1,N.value)||document.execCommand("backColor",!1,N.value),et()}const Fn=["#000000","#e03131","#f08c00","#f7d000","#2f9e44","#1971c2","#6741d9","#e8590c","#ffffff","#868e96"],We="xiaoxin-sticky-note-recent-colors";function qe(){try{const t=JSON.parse(localStorage.getItem(We)||"[]");return Array.isArray(t)?t.filter(e=>typeof e=="string"):[]}catch{return[]}}function we(t){const e=t.toUpperCase(),a=qe().filter(r=>r!==e);for(a.unshift(e);a.length>8;)a.pop();try{localStorage.setItem(We,JSON.stringify(a))}catch{}}function Ht(t){const e=t.querySelector("#cc-recent");if(!e)return;const a=qe();e.innerHTML=a.length?'<div class="cc-recent-title">最近使用</div>'+a.map(r=>`<button type="button" class="cc-swatch" data-color="${r}" style="background:${r}"></button>`).join(""):""}function kt(t,e){t.style.background=e}function Ge(t,e,a,r,i,p){t.addEventListener("click",()=>{xt(wt),p(),kt(r,a.value),we(a.value),Ht(i)}),e.addEventListener("click",M=>{M.stopPropagation();const E=i.hasAttribute("hidden");if(document.querySelectorAll(".cc-panel:not([hidden])").forEach(T=>T.setAttribute("hidden","")),E){const T=e.closest(".tool-color");if(T){const C=T.getBoundingClientRect();i.style.top=C.bottom+"px",i.style.left=C.left+"px"}Ht(i),i.removeAttribute("hidden")}else i.setAttribute("hidden","")}),i.innerHTML='<div class="cc-recent" id="cc-recent"></div>'+Fn.map(M=>`<button type="button" class="cc-swatch" data-color="${M}" style="background:${M}"></button>`).join("")+`<label class="cc-custom">自定义<input type="color" class="cc-custom-input" value="${a.value}"></label>`,i.addEventListener("click",M=>{const E=M.target.closest(".cc-swatch");!E||!i.contains(E)||(M.stopPropagation(),a.value=E.getAttribute("data-color")||a.value,kt(r,a.value),xt(wt),p(),we(a.value),Ht(i),i.setAttribute("hidden",""))});const w=i.querySelector(".cc-custom-input");w.addEventListener("input",()=>{a.value=w.value,kt(r,a.value)}),w.addEventListener("change",()=>{xt(wt),p(),we(a.value),Ht(i),i.setAttribute("hidden","")}),a.addEventListener("input",()=>kt(r,a.value)),kt(r,a.value)}document.addEventListener("click",t=>{t.target.closest(".tool-color")||document.querySelectorAll(".cc-panel:not([hidden])").forEach(a=>a.setAttribute("hidden",""))});function Ue(t){const e=window.getSelection();if(!e||e.rangeCount===0)return;const a=e.getRangeAt(0);if(a.collapsed)return;const r=a.commonAncestorContainer,p=(r.nodeType===Node.ELEMENT_NODE?r:r.parentElement)?.closest("span[style*='font-size']");if(p&&a.toString()===(p.textContent||"")){p.style.fontSize=t+"px",p.querySelectorAll("span[style*='font-size']").forEach(T=>{const C=T;C.textContent===""&&C.remove()});const E=document.createRange();E.selectNodeContents(p),e.removeAllRanges(),e.addRange(E),et();return}const w=document.createElement("span");w.style.fontSize=t+"px",w.appendChild(a.extractContents()),a.insertNode(w);const M=document.createRange();M.selectNodeContents(w),e.removeAllRanges(),e.addRange(M),et()}function Xe(t){const e=window.getSelection();if(!e||e.rangeCount===0)return;const a=e.getRangeAt(0);if(a.collapsed)return;let r=14;const i=a.startContainer,p=i.nodeType===Node.TEXT_NODE?i.parentElement:i,w=parseFloat(getComputedStyle(p).fontSize);isNaN(w)||(r=w);const M=Math.min(48,Math.max(10,Math.round(r+t)));Ue(String(M))}Ge(L,document.getElementById("tool-fg-drop"),f,document.getElementById("tool-fg-bar"),document.getElementById("tool-fg-panel"),Oe),Ge(z,document.getElementById("tool-bg-drop"),N,document.getElementById("tool-bg-bar"),document.getElementById("tool-bg-panel"),He);const $n=[12,14,16,18,20,24,28];let Ve=14,lt=null;function Wt(){lt&&(lt.remove(),lt=null),document.removeEventListener("mousedown",Ye,!0),document.removeEventListener("keydown",je,!0)}function Ye(t){lt&&!lt.contains(t.target)&&!B.contains(t.target)&&Wt()}function je(t){t.key==="Escape"&&Wt()}function Ke(){if(lt){Wt();return}const t=B.getBoundingClientRect(),e=document.createElement("div");e.className="fmt-menu size-menu",e.innerHTML=$n.map(E=>`<button type="button" class="fmt-menu-item${E===Ve?" active":""}" data-size="${E}">${E} px</button>`).join(""),document.body.appendChild(e),lt=e;const a=e.offsetWidth,r=e.offsetHeight,i=window.innerWidth,p=window.innerHeight;let w=t.left;w+a>i-4&&(w=Math.max(4,i-a-4));let M=t.bottom+6;if(M+r>p-4){const E=t.top-r-6;M=E>=4?E:Math.max(4,p-r-4)}e.style.top=M+"px",e.style.left=w+"px",e.querySelectorAll(".fmt-menu-item").forEach(E=>{E.addEventListener("mousedown",T=>{T.preventDefault();const C=Number(E.dataset.size);Wt(),C&&(Ve=C,H.textContent=String(C),xt(wt),Ue(String(C)))})}),setTimeout(()=>{document.addEventListener("mousedown",Ye,!0),document.addEventListener("keydown",je,!0)},0)}W.addEventListener("click",Ke),D.addEventListener("click",Ke);function qt(){try{const t=ot.contentDocument;if(!t)return null;if(!t.getElementById("md-base")){t.open(),t.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style id="md-base"></style><style id="md-theme"></style><style id="md-bg"></style></head><body></body></html>'),t.close();const e=t.getElementById("md-bg");e&&(e.textContent=To)}return t}catch(t){return console.error("预览文档初始化失败:",t),null}}function Gt(t){let e=t;e==null&&(e=(c.offsetParent!==null?c.innerText:"")||Bt||""),Bt=e;const a=qt();a&&(a.body.innerHTML=En(e))}function Ut(){const t=x.md||"none",e=c.innerText||"";tt.classList.toggle("preview",t==="preview"),tt.classList.toggle("split",t==="split"),st.classList.toggle("active",t==="preview"),pt.classList.toggle("active",t==="split"),(t==="preview"||t==="split")&&requestAnimationFrame(()=>Gt(e))}async function ve(){const e=(await X()).theme||"light",a=document.documentElement;a.classList.remove("theme-dark"),(e==="dark"||e==="transparent")&&a.classList.add("theme-dark")}async function Je(){const t=await X(),e=t.md_theme||"default",a=(t.theme||"light")==="dark",r=qt();if(!r)return;const i=r.getElementById("md-base"),p=r.getElementById("md-theme"),w=e==="default"&&a?So:ko;i&&(i.textContent=w);let M="";if(e==="custom")try{M=await co()}catch(E){console.error("读取自定义样式文件失败:",E)}p&&(p.textContent=Ao(e,M)),(x.md==="preview"||x.md==="split")&&Gt(Bt),Nn()}async function Nn(){const t=await X(),e=qt();if(!e)return;const a=t.theme==="transparent",r=Math.round(an(t.glass_blur)/100*Te)+"px";if(a){e.body.classList.add("md-transparent"),e.body.classList.remove("has-bg-img"),e.body.style.removeProperty("--md-bg-img"),e.body.style.removeProperty("--md-bg-opacity"),e.body.style.removeProperty("--md-blur");const p=getComputedStyle(document.documentElement).getPropertyValue("--trans-opacity").trim();e.body.style.background=p==="0"?"transparent":`color-mix(in srgb, var(--bg) ${p}%, transparent)`;return}const i=await Re(t);e.body.style.removeProperty("background"),i?(e.body.classList.add("has-bg-img"),e.body.classList.remove("md-transparent"),e.body.style.setProperty("--md-bg-img",`url("${i}")`),e.body.style.setProperty("--md-bg-opacity","1"),e.body.style.setProperty("--md-blur",r)):(e.body.classList.remove("has-bg-img","md-transparent"),e.body.style.removeProperty("--md-bg-img"),e.body.style.removeProperty("--md-bg-opacity"),e.body.style.removeProperty("--md-blur"))}st.addEventListener("click",()=>{x.md=x.md==="preview"?"none":"preview",Ut(),et()}),pt.addEventListener("click",()=>{x.md=x.md==="split"?"none":"split",Ut(),et()});let dt=null;function Xt(){dt&&(dt.remove(),dt=null),J.classList.remove("active"),document.removeEventListener("mousedown",Ze,!0),document.removeEventListener("keydown",Qe,!0)}function Ze(t){dt&&!dt.contains(t.target)&&t.target!==J&&Xt()}function Qe(t){t.key==="Escape"&&Xt()}let St=null;function On(){if(St)return;const t=document.createElement("div");t.className="fmt-loading-overlay",t.innerHTML='<div class="fmt-loading-box"><div class="spinner"></div><div class="fmt-loading-text">整理中…</div></div>',document.body.appendChild(t),St=t}function Hn(){St&&(St.remove(),St=null)}function Wn(){if(dt){Xt();return}const t=J.getBoundingClientRect(),e=document.createElement("div");e.className="fmt-menu",e.innerHTML=`
      <button type="button" class="fmt-menu-item" data-mode="md">Markdown 格式</button>
      <button type="button" class="fmt-menu-item" data-mode="text">纯文本格式</button>
      <button type="button" class="fmt-menu-item cancel" data-mode="cancel">取消</button>
    `,document.body.appendChild(e),dt=e;const a=e.offsetWidth,r=e.offsetHeight,i=window.innerWidth,p=window.innerHeight;let w=t.left;w+a>i-4&&(w=Math.max(4,i-a-4));let M=t.bottom+6;if(M+r>p-4){const E=t.top-r-6;M=E>=4?E:Math.max(4,p-r-4)}e.style.top=M+"px",e.style.left=w+"px",J.classList.add("active"),e.querySelectorAll(".fmt-menu-item").forEach(E=>{E.addEventListener("mousedown",T=>{T.preventDefault();const C=E.dataset.mode;Xt(),C==="md"?tn("md"):C==="text"&&tn("text")})}),setTimeout(()=>{document.addEventListener("mousedown",Ze,!0),document.addEventListener("keydown",Qe,!0)},0)}async function tn(t){const e=(c.innerText||"").trim();if(!e){Vt("便签内容为空，无需整理");return}J.disabled=!0,On();try{const a=await io(e,t==="md"?"md":"text");qn(e,a,t)}catch(a){Vt("整理失败："+String(a))}finally{J.disabled=!1,Hn()}}J.addEventListener("click",Wn);function qn(t,e,a){if(t===e){Vt("内容已是最整洁，无需改动");return}const r=Gn(t,e);let i=e;r.length>0&&(i=e+`

以下为原内容中未被整理覆盖、已自动补回的部分（如不需要可手动删除）：
`+r.join(`
`));const p=t.replace(/\s+/g,"").length,w=e.replace(/\s+/g,"").length,M=p>120&&w<p*.6,E=Un(t,i),T=E.map(O=>{const Ee=O.type==="del"?"diff-del":O.type==="add"?"diff-add":"diff-ctx",Yn=O.type==="del"?"-":O.type==="add"?"+":" ",jn=en(O.text)||"&nbsp;";return`<div class="diff-line ${Ee}"><span class="diff-sign">${Yn}</span><span class="diff-text">${jn}</span></div>`}).join(""),C=r.length>0?`⚠️ 有 ${r.length} 行原内容未被整理覆盖，已自动补回并标出，请核对（接受后可手动删除）。`:M?"⚠️ 整理后内容明显变少，可能遗漏了信息，请逐行核对后再接受。":"核对改动，接受后用整理后的内容替换便签。",R=document.createElement("div");R.className="fmt-diff-overlay",R.id="fmt-diff-overlay",R.innerHTML=`
      <div class="fmt-diff-modal">
        <div class="fmt-diff-header">
          <span class="fmt-diff-title">格式化预览（${a==="md"?"Markdown":"纯文本"}）</span>
          <span class="fmt-diff-stat">-${E.filter(O=>O.type==="del").length} +${E.filter(O=>O.type==="add").length}</span>
        </div>
        <div class="fmt-diff-body">${T}</div>
        <div class="fmt-diff-footer">
          <span class="fmt-diff-tip${r.length>0||M?" warn":""}">${C}</span>
          <button class="btn-primary" id="fmt-accept">接受</button>
          <button class="shortcut-rec" id="fmt-cancel">取消</button>
        </div>
      </div>
    `,document.body.appendChild(R);const bt=()=>R.remove();R.addEventListener("mousedown",O=>{O.target===R&&bt()}),R.querySelector("#fmt-cancel").addEventListener("click",bt),R.querySelector("#fmt-accept").addEventListener("click",()=>{const O=Xn(i);c.innerHTML=O,x.content=O,a==="md"&&(x.md||"none")==="none"&&(x.md="preview",Ut()),et(),Vt(r.length>0?"已应用（含自动补回的原文内容）":"已应用整理后的内容"),bt()})}function Gn(t,e){const a=t.split(`
`).map(p=>p.trim()).filter(p=>p.length>0),r=e.toLowerCase(),i=[];for(const p of a){const w=p.match(/[A-Za-z0-9@._\-]{3,}/g)||[];if(w.length===0){e.includes(p)||i.push(p);continue}w.some(E=>r.includes(E.toLowerCase()))||i.push(p)}return i}function Un(t,e){const a=t.split(`
`),r=e.split(`
`),i=a.length,p=r.length,w=Array.from({length:i+1},()=>new Array(p+1).fill(0));for(let C=i-1;C>=0;C--)for(let R=p-1;R>=0;R--)w[C][R]=a[C]===r[R]?w[C+1][R+1]+1:Math.max(w[C+1][R],w[C][R+1]);const M=[];let E=0,T=0;for(;E<i&&T<p;)a[E]===r[T]?(M.push({type:"ctx",text:a[E]}),E++,T++):w[E+1][T]>=w[E][T+1]?(M.push({type:"del",text:a[E]}),E++):(M.push({type:"add",text:r[T]}),T++);for(;E<i;)M.push({type:"del",text:a[E]}),E++;for(;T<p;)M.push({type:"add",text:r[T]}),T++;return M}function Xn(t){return t.split(/\n{2,}/).map(a=>{const r=a.trim();return r?"<p>"+en(r).replace(/\n/g,"<br>")+"</p>":""}).join("")}function en(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function Vt(t){let e=document.getElementById("sticky-toast");e||(e=document.createElement("div"),e.id="sticky-toast",e.className="sticky-toast",document.body.appendChild(e)),e.textContent=t,e.classList.add("show"),window.clearTimeout(e._t),e._t=window.setTimeout(()=>e.classList.remove("show"),2600)}async function xe(){try{const t=ft||await n.isMaximized().catch(()=>!1);V.innerHTML=t?Io:ln,V.title=t?"还原窗口":"最大化",V.title=t?"还原窗口":"最大化"}catch(t){console.error("读取最大化状态失败:",t)}}async function Vn(){try{if(ft&&mt)vt=!0,await n.setPosition(new Le(mt.x,mt.y)),await n.setSize(new on(mt.w,mt.h)),ft=!1;else{const t=await n.outerPosition(),e=await n.outerSize();mt={x:t.x,y:t.y,w:e.width,h:e.height};const a=await ee();if(vt=!0,a){const r=a.workArea;await n.setPosition(new Le(r.position.x,r.position.y)),await n.setSize(new on(r.size.width,r.size.height))}else await n.maximize();ft=!0}xe()}catch(t){console.error("最大化失败:",t)}finally{setTimeout(()=>{vt=!1},700)}}V.addEventListener("click",()=>{Vn().catch(t=>console.error("最大化失败:",t))});function Yt(t,e){const a=Tt(t);if(!a)return!1;const r=a.split("+"),i=M=>r.includes(M);if(e.ctrlKey!==i("Ctrl")||e.altKey!==i("Alt")||e.shiftKey!==i("Shift")||e.metaKey!==i("Meta"))return!1;const p=r[r.length-1];let w;return e.code==="Equal"?w="Plus":e.code==="Minus"?w="Minus":e.code==="Space"?w="Space":e.key.length===1?w=e.key.toUpperCase():w=e.key,w===p}document.addEventListener("keydown",t=>{const e=t.target?.tagName;if(e==="INPUT"||e==="TEXTAREA"||e==="SELECT")return;const a=r=>{t.preventDefault();const i=pe();r(),!pe()&&i&&xt(i)};Yt("fg_color",t)?a(Oe):Yt("bg_color",t)?a(He):Yt("size_up",t)?a(()=>Xe(2)):Yt("size_down",t)&&a(()=>Xe(-2))}),m.addEventListener("click",()=>Ft(!x.pinned)),y.addEventListener("click",()=>{_t++,U&&(U=!1,ht=!1),A.flame?.cancelFlame(),A.glow?.cancelGlowParticles(),A.glass?.cancelGlassShards(),A.inhale?.cancelInhaleParticles(),Mt=!0,oo().catch(t=>console.error("最小化到托盘失败:",t))}),l.addEventListener("click",()=>{nn()});let U=!1,ht=!1,jt,Kt=!1;const at=()=>{U=!1,jt&&(window.clearTimeout(jt),jt=void 0),!ht&&(ht=!0,ut(!1,0,0).catch(()=>{}),Kt=!0,Mt=!0,Se().catch(t=>console.error("关闭失败:",t)),h.style.clipPath="",h.style.setProperty("-webkit-mask-image",""),h.style.setProperty("mask-image",""),h.style.opacity="",h.style.boxShadow="",window.setTimeout(()=>{Et().catch(()=>{}).finally(()=>{Kt=!1})},50))};async function nn(){if(U)return;U=!0,ht=!1,jt=window.setTimeout(()=>{ht||(console.warn("[sticky] close fail-safe triggered"),at())},1500),ao(o).catch(()=>{}),g=!0,A.glow?.cancelGlowParticles(),A.inhale?.cancelInhaleParticles(),A.flame?.cancelFlame(),A.glass?.cancelGlassShards(),_t++;let t=null;try{t=await X()}catch{}if(t!==null?t.theme==="transparent":h.classList.contains("bg-transparent")){at();return}Promise.all([t!==null?Promise.resolve(t):X(),A.load()]).then(([a])=>{if(!U)return;const r=a.particle_count??50,i=a.animation_speed??100;if(a.particle_mode==="none"){at();return}a.particle_mode==="erode"?A.flame.requestFlameDissolveClose(at,r,i):a.particle_mode==="inhale"?A.inhale.requestInhaleDissolveClose(at,r,i):a.particle_mode==="glass"?A.glass.requestGlassShardsClose(at,r,i):A.glow.requestGlowDissolveClose(at,r,i,!0)}).catch(()=>{U&&A.glow?.requestGlowDissolveClose(at)})}c.addEventListener("input",()=>{F=!1,(x.md==="preview"||x.md==="split")&&Gt(),et()}),_.addEventListener("input",()=>{F=!1,x.title=_.value,et()}),window.addEventListener("blur",()=>{F||(P&&window.clearTimeout(P),x.content=c.innerHTML,x.title=_.value,x.updated=Date.now(),gt("保存中…"),Pt(o,x).then(()=>gt("已保存")).catch(()=>gt("保存失败",!0)))}),$().listen("note-deleted",()=>{F=!0,P&&window.clearTimeout(P),S&&window.clearTimeout(S),o==="main"?(c.innerHTML="",_.value="",x.content="",x.title=""):n.destroy().catch(()=>{Se().catch(()=>{})})}).catch(t=>console.error("监听删除事件失败:",t)),$().listen("play-close-anim",()=>{if(U){A.glow?.cancelGlowParticles(),A.inhale?.cancelInhaleParticles(),A.flame?.cancelFlame(),A.glass?.cancelGlassShards(),at();return}nn()}).catch(t=>console.error("监听关闭动画事件失败:",t)),(async()=>{try{await n.onResized(()=>{xe(),!(vt||F)&&(S&&window.clearTimeout(S),S=window.setTimeout(()=>{F||(async()=>{try{const t=await n.outerSize(),e=await n.scaleFactor();x.width=Math.round(t.width/e),x.height=Math.round(t.height/e),Pt(o,x).catch(()=>{})}catch{}})()},500))})}catch(t){console.error("监听窗口尺寸失败:",t)}})(),(async()=>{try{await n.onMoved(()=>{F||nt||Q||vt||ft||(Y&&window.clearTimeout(Y),Y=window.setTimeout(async()=>{if(!(F||nt||Q||ft))try{const t=await n.outerPosition();x.pos_x=t.x,x.pos_y=t.y,Pt(o,x).catch(()=>{})}catch{}},500))})}catch(t){console.error("监听窗口位置失败:",t)}})(),n.onFocusChanged(({payload:t})=>{t&&(x.md==="preview"||x.md==="split")&&Gt(Bt)}).catch(t=>console.error("监听聚焦失败:",t)),Rn()}async function $o(){const o=$().label,s=new URLSearchParams(window.location.search),u=s.get("noteId")||"main",c=s.get("preset")||"";o==="sticky-history"?bo():o==="sticky-settings"?$().close().catch(()=>{}):o==="sticky-imageviewer"?yo().catch(n=>console.error("图片预览加载失败:",n)):o==="particles"?_o().then(()=>Jn("sticky://particles-layer-ready",{}).catch(()=>{})).catch(n=>console.error("粒子层初始化失败:",n)):Ro(u,c)}export{$o as mountStickyByLabel};
