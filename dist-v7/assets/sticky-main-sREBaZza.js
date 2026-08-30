const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/settings-DNDHisr4.js","assets/index-D6Rw34Dq.js","assets/glow-particles-MxG7yI9d.js","assets/webviewWindow-B4gNLrmO.js"])))=>i.map(i=>d[i]);
import{_ as st,g as F,l as re,i as ne,c as oe,P as ke,a as cn,L as to,e as eo}from"./index-D6Rw34Dq.js";import{g as X,o as fn,n as gn,s as ft,a as hn,c as Ae,b as no,d as oo,l as ao,e as bn,f as yn,h as ro,i as so,j as Ct,m as io,k as co,p as ln,q as zt,r as lo,t as uo,u as po,v as mo}from"./settings-DNDHisr4.js";import{P as wn}from"./pin-path.const-Dy8TJndL.js";let Qt=null;function fo(){return Qt||(Qt=(async()=>{try{const{getWallpaper:o,readBgImage:s}=await st(async()=>{const{getWallpaper:k,readBgImage:g}=await import("./settings-DNDHisr4.js").then(f=>f.w);return{getWallpaper:k,readBgImage:g}},__vite__mapDeps([0,1])),u=await o();if(!u)return"";const c=await s(u);if(!c||!c.startsWith("data:"))return"";const n=new Image;await new Promise((k,g)=>{n.onload=()=>k(),n.onerror=()=>g(new Error("壁纸解码失败")),n.src=c});const m=Math.min(1,1920/Math.max(n.naturalWidth,n.naturalHeight)),b=Math.max(1,Math.round(n.naturalWidth*m)),l=Math.max(1,Math.round(n.naturalHeight*m)),y=document.createElement("canvas");y.width=b,y.height=l;const _=y.getContext("2d");return _?(_.drawImage(n,0,0,b,l),y.toDataURL("image/jpeg",.82)):""}catch(o){return console.warn("读取桌面壁纸失败:",o),""}})(),Qt)}async function go(o){if(o.startsWith("data:"))return o;try{const{readBgImage:s}=await st(async()=>{const{readBgImage:u}=await import("./settings-DNDHisr4.js").then(c=>c.w);return{readBgImage:u}},__vite__mapDeps([0,1]));return await s(o)}catch(s){return console.warn("读取背景图失败:",s),""}}async function vn(o,s,u={}){const c=s.theme==="transparent";let n=u.bgUrl??"";n||(c?n=await fo():s.bg_image&&(n=await go(s.bg_image))),n?(o.style.setProperty("--note-bg-img",`url("${n}")`),o.style.setProperty("--note-bg-opacity","1"),o.classList.add("has-bg")):(o.style.removeProperty("--note-bg-img"),o.style.removeProperty("--note-bg-opacity"),o.classList.remove("has-bg")),o.classList.toggle("bg-transparent",c),await bo(o,n)}function ho(o){return new Promise(s=>{const u=new Image;u.onload=()=>{try{const c=document.createElement("canvas"),n=32;c.width=n,c.height=n;const v=c.getContext("2d",{willReadFrequently:!0});if(!v){s(.5);return}v.drawImage(u,0,0,n,n);const m=v.getImageData(0,0,n,n).data;let b=0;for(let l=0;l<m.length;l+=4)b+=.299*m[l]+.587*m[l+1]+.114*m[l+2];s(b/(n*n)/255)}catch{s(.5)}},u.onerror=()=>s(.5),u.src=o})}async function bo(o,s){let u=!1;if(s)try{u=await ho(s)<.45}catch{u=!1}o.classList.toggle("on-dark-bg",u)}const yo=typeof window<"u"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches,wo=o=>o<.5?4*o*o*o:1-Math.pow(-2*o+2,3)/2,It=new WeakMap;function dn(o,s,u){const c=u?.duration??280,n=u?.onDone,v=o.style.getPropertyValue("--glass-blur"),m=v&&parseFloat(v)||0,b=Math.max(0,s),l=It.get(o);if(l&&(cancelAnimationFrame(l.raf),l.alive=!1),yo||m===b||c<=0){o.style.setProperty("--glass-blur",b+"px"),n?.(),It.delete(o);return}o.classList.add("animating");let y=0;const _=g=>{const f=It.get(o);if(!f||!f.alive)return;y||(y=g);const $=Math.min(1,(g-y)/c),E=m+(b-m)*wo($);o.style.setProperty("--glass-blur",E.toFixed(2)+"px"),$<1?f.raf=requestAnimationFrame(_):(o.style.setProperty("--glass-blur",b+"px"),o.classList.remove("animating"),f.alive=!1,n?.(),It.delete(o))},k={raf:0,alive:!0};It.set(o,k),k.raf=requestAnimationFrame(_)}const ze=40;function Ie(o){if(!o)return null;const s=o.trim(),u=/^#([0-9a-f]{6})$/i.exec(s);if(u)return parseInt(u[1],16);const c=/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);return c?parseInt(c[1],10)<<16|parseInt(c[2],10)<<8|parseInt(c[3],10):null}function se(o){const s=o.target;if(!s)return;const u=Math.max(0,Math.min(100,Math.round(o.strength)));if(s.style.removeProperty("--glass-blur"),!o.enabled||u<=0){s.classList.contains("glass")?dn(s,0,{onDone:()=>{s.classList.remove("glass"),s.style.removeProperty("--glass-blur")}}):(s.classList.remove("glass"),s.style.removeProperty("--glass-blur"));return}const c=Math.round(u/100*ze);if(!s.classList.contains("glass")){s.classList.add("glass"),s.style.setProperty("--glass-blur",c+"px");return}dn(s,c)}const vo=Object.freeze(Object.defineProperty({__proto__:null,MAX_BLUR_PX:ze,applyGlassBlur:se,parseColorToRgbInt:Ie},Symbol.toStringTag,{value:"Module"}));function xo(){const o=document.getElementById("app");o.innerHTML=`
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
  `;const s=document.getElementById("history-list"),u=document.querySelector(".titlebar"),c=document.getElementById("btn-close"),n=document.getElementById("btn-new");async function v(){try{const g=await no();await oo(g)}catch(g){console.error("新建便签失败:",g)}}n.addEventListener("click",()=>void v()),X().then(g=>{const f=document.documentElement;f.classList.remove("theme-dark"),(g.theme==="dark"||g.theme==="transparent")&&f.classList.add("theme-dark"),y(g),F().show().then(()=>F().setFocus()).catch(()=>{})}).catch(g=>{console.error("读取主题失败:",g),F().show().catch(()=>{})}),fn(()=>{X().then(g=>void y(g)).catch(()=>{})});let m=!1,b=!1;const l=()=>{m||(m=!0,window.setTimeout(()=>{if(m=!1,b){window.setTimeout(l,60);return}k()},0))};s.addEventListener("pointerdown",()=>{b=!0},!0),window.addEventListener("pointerup",()=>{b=!1,l()},!0),window.addEventListener("pointercancel",()=>{b=!1,l()},!0),re("sticky://state-changed",l).catch(g=>console.error("监听便签状态失败:",g)),F().onFocusChanged(({payload:g})=>{g&&l()}).catch(g=>console.error("监听窗口焦点失败:",g)),l();async function y(g){const f=document.querySelector(".history-window");if(!f)return;if(document.documentElement.classList.remove("theme-dark"),(g.theme==="dark"||g.theme==="transparent")&&document.documentElement.classList.add("theme-dark"),g.theme==="transparent"){f.classList.remove("has-bg","on-dark-bg","glass","transparent-clear"),f.classList.add("bg-transparent"),f.style.removeProperty("--note-bg-img"),f.style.removeProperty("--note-bg-opacity"),f.style.removeProperty("--glass-blur"),document.documentElement.style.removeProperty("--trans-opacity"),f.style.removeProperty("--trans-opacity");const E=gn(g.transparent_opacity);if(E<2)f.classList.add("transparent-clear"),f.style.setProperty("--trans-opacity","0"),document.documentElement.style.setProperty("--trans-opacity","0"),ft(!1,0,0).catch(()=>{});else{f.classList.remove("transparent-clear");const C=Math.round(E*.6);f.style.setProperty("--trans-opacity",String(C)),document.documentElement.style.setProperty("--trans-opacity",String(C));const R=Ie(getComputedStyle(f).getPropertyValue("--bg"))??0;ft(!0,1,R).catch(W=>console.error("应用实时模糊失败:",W))}se({target:f,strength:0,enabled:!1})}else{f.classList.remove("bg-transparent"),document.documentElement.style.removeProperty("--trans-opacity"),f.style.removeProperty("--trans-opacity"),ft(!1,0,0).catch(()=>{}),await vn(f,g);const E=f.classList.contains("has-bg"),C=g.glass_blur??55,R=g.glass_enabled!==!1;se({target:f,strength:E?C:0,enabled:E&&R})}}u.addEventListener("mousedown",g=>{g.target.closest(".icon-btn, .new-note-btn")||hn()}),c.addEventListener("click",()=>{Ae().catch(g=>console.error("关闭失败:",g))});let _="";async function k(){let g,f=new Set;try{const[E,C]=await Promise.all([ao(),bn().catch(()=>[])]);g=E,f=new Set(C)}catch(E){console.error("加载列表失败:",E),s.innerHTML='<div class="empty-state"><div class="empty-text">加载失败，请重试</div></div>';return}const $=g.map(E=>`${E.id}|${E.updated}|${E.title}|${E.snippet}|${f.has(E.id)?1:0}|${E.top_priority?1:0}`).join("~");if($!==_){if(_=$,s.innerHTML="",g.length===0){s.innerHTML=`
        <div class="empty-state">
          <button class="new-note-cta" id="new-note-cta" title="新建便签">
            <span class="cta-icon">➕</span>
            <span class="cta-text">新建便签</span>
          </button>
        </div>
      `,document.getElementById("new-note-cta")?.addEventListener("click",()=>void v());return}try{g.forEach(E=>{const C=f.has(E.id),R=document.createElement("div");R.className="history-card"+(C?" open-note":""),R.dataset.id=E.id,C&&(R.style.borderLeft="3px solid #22c55e");const W=(E.title||"").trim(),B=W||E.snippet,O=W?`<div class="card-snippet">${Se(E.snippet)}</div>`:"",V='<button class="card-delete" title="删除">✕</button>',tt=`<button class="card-pin${E.top_priority?" active":""}" title="${E.top_priority?"已置顶（快捷键优先操作此便签）":"设为置顶（快捷键优先操作此便签）"}"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="${wn}"/></svg></button>`;R.innerHTML=`
          <div class="card-info">
            <div class="card-title">${Se(B)}</div>
            ${O}
            <div class="card-meta">
              <span class="card-time">${Se(E.updatedStr)}</span>
            </div>
          </div>
          <div class="card-actions">
            ${tt}
            ${V}
          </div>
        `,s.appendChild(R)}),s.dataset.delegated||(s.dataset.delegated="1",s.addEventListener("click",E=>{const C=E.target,R=C.closest(".history-card");if(!R||!R.dataset.id)return;const W=R.dataset.id;if(C.closest(".card-pin")){yn(W).catch(O=>console.error("设置置顶失败:",O));return}const B=C.closest(".card-delete");if(B){B.classList.contains("confirming")?ro(W).then(()=>l()).catch(O=>{console.error("删除失败:",O),B.classList.remove("confirming"),B.textContent="✕"}):(B.classList.add("confirming"),B.textContent="确认?",window.setTimeout(()=>{B.isConnected&&(B.classList.remove("confirming"),B.textContent="✕")},3e3));return}so(W).catch(O=>console.error("打开便签失败:",O))}))}catch(E){console.error("渲染历史列表失败:",E)}}}k()}function Se(o){const s=document.createElement("div");return s.textContent=o,s.innerHTML}let at=[],Ft=0;function Bt(o){return document.querySelector(o)}function xn(){if(!at.length)return;const o=Bt(".iv-img");o.src=at[Ft],Bt(".iv-count").textContent=`${Ft+1} / ${at.length}`}function te(o){at.length&&(Ft=(Ft+o+at.length)%at.length,xn())}function un(){F().close()}async function pn(){try{const o=await ne("get_viewer_data");if(!o||!o.urls||o.urls.length===0){un();return}at=o.urls,Ft=Math.min(Math.max(0,o.index),at.length-1),xn()}catch(o){console.error("加载图片预览失败:",o),un()}}async function Mo(){if(document.body.innerHTML=`
    <div class="iv-root">
      <div class="iv-stage"><img class="iv-img" alt="图片预览"></div>
      <button class="iv-nav iv-prev" type="button" title="上一张">‹</button>
      <button class="iv-nav iv-next" type="button" title="下一张">›</button>
      <div class="iv-count"></div>
    </div>`,Bt(".iv-prev").onclick=()=>te(-1),Bt(".iv-next").onclick=()=>te(1),document.addEventListener("keydown",s=>{s.key==="ArrowLeft"?te(-1):s.key==="ArrowRight"&&te(1)}),Bt(".iv-img").addEventListener("dragstart",s=>s.preventDefault()),await pn(),re("viewer-reload",()=>pn()),!!at.length)try{await F().show(),await F().setFocus()}catch(s){console.error("显示图片预览窗口失败:",s)}}let z=null,d=null,Re=0,ae=0,vt=!0,Pe=1,Ce=!1,Dt=0,G=[],K=new Float32Array(65536*7);const Eo=o=>{if(o*7<=K.length)return;const s=new Float32Array(Math.max(K.length*2,o*7));s.set(K),K=s},Lo=(o,s,u)=>{if(!o.fieldData||o.fieldData.length<4)return[235,240,255];const c=s/o.noteDpr,n=u/o.noteDpr;let v=Math.round(c/o.rectW*o.fieldW);v<0?v=0:v>=o.fieldW&&(v=o.fieldW-1);let m=Math.round(n/o.rectH*o.fieldH);m<0?m=0:m>=o.fieldH&&(m=o.fieldH-1);const b=(m*o.fieldW+v)*4;if(b+2>=o.fieldData.length)return[235,240,255];const l=o.fieldData[b],y=o.fieldData[b+1],_=o.fieldData[b+2],k=Math.max(l,y,_);if(!isFinite(k))return[235,240,255];if(k>=158)return[l,y,_];const g=158/Math.max(1,k);return[Math.min(255,l*g),Math.min(255,y*g),Math.min(255,_*g)]},_o=(o,s,u,c)=>{if(o.pcount>=o.maxP)return;let n=Math.round((3e3+Math.random()*2200)*o.k);const v=o.duration-c-40;if(v<120)return;n>v&&(n=v);const m=o.pcount++;o.px[m]=s,o.py[m]=u,o.pang[m]=(Math.random()-.5)*(110*Math.PI/180),o.pv0[m]=(20+Math.random()*15)*o.noteDpr,o.pv1[m]=150*o.noteDpr,o.plife[m]=n,o.page[m]=0,o.psize[m]=1.9+Math.random()*.7,o.pseed[m]=Math.random()*Math.PI*2,o.psway[m]=(Math.random()-.5)*100*o.noteDpr+o.windPx;const[b,l,y]=Lo(o,s-o.originX,u-o.originY);o.pr[m]=b/255,o.pg[m]=l/255,o.pb[m]=y/255};function ko(o){const s=Math.max(1,o.dprNote||1),u=Math.max(1,o.width),c=Math.max(1,o.height),n=o.fieldW||8,v=o.fieldH||8,m=o.fieldData||[],b=o.tW||8,l=o.tH||8,y=o.tField||[],_=3,k=Math.max(2,Math.ceil(u/_)),g=Math.max(2,Math.ceil(c/_)),f=k*g,$=new Float32Array(f),E=new Float32Array(f),C=new Float32Array(f),R=new Uint8Array(f),W=(P,S)=>{let Y=Math.round(P/u*b);Y<0?Y=0:Y>=b&&(Y=b-1);let D=Math.round(S/c*l);return D<0?D=0:D>=l&&(D=l-1),y[D*b+Y]};let B=0,O=0;for(let P=0;P<g;P++)for(let S=0;S<k;S++){const Y=(S+.5)*_,D=(P+.5)*_;$[B]=o.originX+Y*s,E[B]=o.originY+D*s;let q=W(Y,D);(!isFinite(q)||q<0)&&(q=0),C[B]=q,q>O&&(O=q),B++}const V=20,tt=Math.ceil(O/V)+2,it=[];for(let P=0;P<tt;P++)it.push([]);for(let P=0;P<f;P++){let S=Math.floor(C[P]/V);S<0?S=0:S>=tt&&(S=tt-1),it[S].push(P)}const rt=Math.max(0,Math.min(100,o.density??50))/100,gt=Math.max(.015,rt),h=Math.round(f*(.03+.97*rt))+1500,x=Math.max(.25,Math.min(4,100/Math.max(10,o.speed??100)));return{seq:o.seq??0,originX:o.originX,originY:o.originY,rectW:u,rectH:c,fieldW:n,fieldH:v,fieldData:m,tW:b,tH:l,tField:y,noteDpr:s,emitX:$,emitY:E,emitT:C,emitDone:R,binPts:it,ecount:f,layerStartAt:o.startAt??Date.now(),duration:Math.round(2400*x),k:x,keepProb:gt,windPx:(o.wind??0)*s,done:!1,maxP:h,px:new Float32Array(h),py:new Float32Array(h),pang:new Float32Array(h),pv0:new Float32Array(h),pv1:new Float32Array(h),plife:new Float32Array(h),page:new Float32Array(h),psize:new Float32Array(h),pseed:new Float32Array(h),psway:new Float32Array(h),pr:new Float32Array(h),pg:new Float32Array(h),pb:new Float32Array(h),pcount:0}}function Mn(){vt=!0,cancelAnimationFrame(Re),ae&&(window.clearInterval(ae),ae=0),G=[],d&&(d.clearColor(0,0,0,0),d.clear(d.COLOR_BUFFER_BIT)),F().hide().catch(()=>{})}const En=o=>{if(vt)return;Ce||(Ce=!0,Dt=o);const s=Math.min(.05,Math.max(.001,(o-Dt)/1e3));if(Dt=o,!d)return;d.clearColor(0,0,0,0),d.clear(d.COLOR_BUFFER_BIT);let u=0;for(let c=G.length-1;c>=0;c--){const n=G[c],v=Date.now()-n.layerStartAt;if(v>=n.duration){n.done=!0,G.splice(c,1);continue}const m=v>n.duration-200?Math.max(0,(n.duration-v)/200):1,b=Math.min(n.binPts.length-1,Math.floor(v/20));for(let l=0;l<=b;l++){const y=n.binPts[l];for(let _=0;_<y.length;_++){const k=y[_];n.emitDone[k]===0&&(n.emitDone[k]=1,Math.random()<n.keepProb&&_o(n,n.emitX[k],n.emitY[k],v))}}Eo(u+n.pcount);for(let l=0;l<n.pcount;l++){const y=n.page[l]+s*1e3;n.page[l]=y;const _=n.plife[l],k=y/_;if(k>=1){const S=--n.pcount;l!==S&&(n.px[l]=n.px[S],n.py[l]=n.py[S],n.pang[l]=n.pang[S],n.pv0[l]=n.pv0[S],n.pv1[l]=n.pv1[S],n.plife[l]=n.plife[S],n.page[l]=n.page[S],n.psize[l]=n.psize[S],n.pseed[l]=n.pseed[S],n.psway[l]=n.psway[S],n.pr[l]=n.pr[S],n.pg[l]=n.pg[S],n.pb[l]=n.pb[S]),l--;continue}const g=y/1e3,f=_/1e3,$=1-Math.exp(-g/.3),E=1-.3*Math.min(1,g/Math.max(.6,f)),C=(n.pv0[l]+n.pv1[l]*$*E)*(1+.3*Math.sin(y*.0021+n.pseed[l]*3)),R=Math.sin(n.pang[l]),W=-Math.cos(n.pang[l]),B=Math.sin(y*.0025+n.pseed[l])*85*n.noteDpr,O=Math.sin(y*.009+n.pseed[l]*2.3)*55*n.noteDpr,V=Math.sin(y*.024+n.pseed[l]*4.1)*20*n.noteDpr,tt=n.psway[l]+B+O+V,it=Math.sin(y*.0062+n.pseed[l]*1.7)*55*n.noteDpr*(.35+.65*$);n.px[l]+=(R*C+tt)*s,n.py[l]+=(W*C+it)*s;const rt=1-k,gt=.8+.2*Math.sin(y*.02+n.pseed[l]*5),J=rt*Math.pow(rt,.2)*m*gt;if(J<.02)continue;const h=1+.22*Math.sin(y*.007+n.pseed[l]*2),x=n.psize[l]*h*1.3,P=u*7;K[P]=n.px[l],K[P+1]=n.py[l],K[P+2]=x*2*n.noteDpr,K[P+3]=J,K[P+4]=n.pr[l],K[P+5]=n.pg[l],K[P+6]=n.pb[l],u++}}u>0&&(d.bindBuffer(d.ARRAY_BUFFER,ie),d.bufferData(d.ARRAY_BUFFER,K.subarray(0,u*7),d.DYNAMIC_DRAW),d.enableVertexAttribArray(ce),d.vertexAttribPointer(ce,2,d.FLOAT,!1,28,0),d.enableVertexAttribArray(le),d.vertexAttribPointer(le,2,d.FLOAT,!1,28,8),d.enableVertexAttribArray(de),d.vertexAttribPointer(de,3,d.FLOAT,!1,28,16),d.drawArrays(d.POINTS,0,u)),G.length===0&&Mn()},Ln=o=>{En(o),vt||(Re=requestAnimationFrame(Ln))};async function So(o){const s=Date.now();G=G.filter(n=>s-n.layerStartAt<n.duration),G=G.filter(n=>!(Math.abs(n.originX-o.originX)<4&&Math.abs(n.originY-o.originY)<4));const u=ko(o);G.push(u),vt&&(vt=!1,Ce=!1,Re=requestAnimationFrame(Ln),ae=window.setInterval(()=>{if(vt)return;const n=performance.now();n-Dt>60&&(Dt=n,En(n))},40));const c=F();try{await c.show()}catch{}try{await c.setAlwaysOnTop(!0)}catch{}c.setFocus().catch(()=>{}),window.setTimeout(()=>{c.setAlwaysOnTop(!0).catch(()=>{})},120)}async function Po(){const o=await Promise.race([oe(),new Promise(v=>setTimeout(()=>v(null),1500))]).catch(()=>null),s=Math.round((window.screen.width||window.innerWidth||1920)*(window.devicePixelRatio||1)),u=Math.round((window.screen.height||window.innerHeight||1080)*(window.devicePixelRatio||1)),c=Math.max(1,o?.size?.width??s),n=Math.max(1,o?.size?.height??u);z&&(z.width!==c||z.height!==n)&&(z.width=c,z.height=n,d=null,ie=null,ce=0,le=0,de=0,_n()||console.error("粒子层 WebGL 重建失败"))}let ie=null,ce=0,le=0,de=0;function _n(){if(!z)return!1;const o={alpha:!0,premultipliedAlpha:!1,antialias:!1,depth:!1},s=z.getContext("webgl",o)||z.getContext("experimental-webgl",o);if(!s)return!1;d=s;const u=`
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
    }`,n=(f,$)=>{const E=d.createShader(f);return E?(d.shaderSource(E,$),d.compileShader(E),d.getShaderParameter(E,d.COMPILE_STATUS)?E:null):null},v=n(d.VERTEX_SHADER,u),m=n(d.FRAGMENT_SHADER,c);if(!v||!m)return!1;const b=d.createProgram();if(!b||(d.attachShader(b,v),d.attachShader(b,m),d.linkProgram(b),!d.getProgramParameter(b,d.LINK_STATUS)))return!1;d.useProgram(b),ce=d.getAttribLocation(b,"a_pos"),le=d.getAttribLocation(b,"a_param"),de=d.getAttribLocation(b,"a_color"),d.uniform2f(d.getUniformLocation(b,"u_res"),z.width,z.height);const l=d.getUniformLocation(b,"u_sprite");l&&d.uniform1i(l,0);const y=32,_=document.createElement("canvas");_.width=y,_.height=y;const k=_.getContext("2d");if(k){const f=k.createRadialGradient(y/2,y/2,0,y/2,y/2,y/2);f.addColorStop(0,"rgba(255,255,255,1)"),f.addColorStop(.35,"rgba(255,255,255,0.75)"),f.addColorStop(.75,"rgba(255,255,255,0.2)"),f.addColorStop(1,"rgba(255,255,255,0)"),k.fillStyle=f,k.fillRect(0,0,y,y)}const g=d.createTexture();return g&&(d.activeTexture(d.TEXTURE0),d.bindTexture(d.TEXTURE_2D,g),d.texImage2D(d.TEXTURE_2D,0,d.RGBA,d.RGBA,d.UNSIGNED_BYTE,_),d.texParameteri(d.TEXTURE_2D,d.TEXTURE_MIN_FILTER,d.LINEAR),d.texParameteri(d.TEXTURE_2D,d.TEXTURE_MAG_FILTER,d.LINEAR),d.texParameteri(d.TEXTURE_2D,d.TEXTURE_WRAP_S,d.CLAMP_TO_EDGE),d.texParameteri(d.TEXTURE_2D,d.TEXTURE_WRAP_T,d.CLAMP_TO_EDGE)),ie=d.createBuffer(),d.bindBuffer(d.ARRAY_BUFFER,ie),d.viewport(0,0,z.width,z.height),d.enable(d.BLEND),d.blendFunc(d.SRC_ALPHA,d.ONE),!0}async function To(){const o=F();Pe=Math.min(window.devicePixelRatio||1,2),await Po();const s=window.screen.width||window.innerWidth,u=window.screen.height||window.innerHeight,c=Math.max(1,Math.round(s*Pe)),n=Math.max(1,Math.round(u*Pe));if(o.setIgnoreCursorEvents(!0).catch(()=>{}),document.body.style.margin="0",document.body.style.overflow="hidden",document.body.style.background="transparent",z=document.createElement("canvas"),z.width=c,z.height=n,z.style.position="fixed",z.style.left="0",z.style.top="0",z.style.width="100%",z.style.height="100%",z.style.zIndex="2147483647",z.style.pointerEvents="none",document.body.appendChild(z),!_n()){console.error("粒子层 WebGL 初始化失败");return}re("particles-start",v=>{So(v.payload).catch(m=>console.error("粒子层启动失败:",m))}),re("particles-cancel",v=>{const m=v?.payload?.seq??0,b=v?.payload?.originX,l=v?.payload?.originY;m!==0?G=G.filter(y=>!(y.seq===m&&(b===void 0||Math.abs(y.originX-b)<1)&&(l===void 0||Math.abs(y.originY-l)<1))):G=[],G.length===0&&Mn()})}function Rt(o){return o.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function ee(o){let s=o.replace(/\n/g,"<br/>");return s=s.replace(/`([^`]+)`/g,(u,c)=>`<code>${c}</code>`),s=s.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),s=s.replace(/__([^_]+)__/g,"<strong>$1</strong>"),s=s.replace(/\*([^*]+)\*/g,"<em>$1</em>"),s=s.replace(/(^|[^_])_([^_]+)_(?!_)/g,"$1<em>$2</em>"),s=s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,(u,c,n)=>`<a href="${/^(https?:|mailto:|\/|#)/i.test(n)?n:"#"}" target="_blank" rel="noopener noreferrer">${c}</a>`),s}function kn(o){const u=(o||"").replace(/\r\n?/g,`
`).split(`
`);let c="",n=0,v="";const m=()=>{v&&(c+=`</${v}>`,v="")};for(;n<u.length;){const b=u[n],l=b.trim();if(l.startsWith("```")){m(),n++;const f=[];for(;n<u.length&&!u[n].trim().startsWith("```");)f.push(u[n]),n++;n++,c+=`<pre><code>${Rt(f.join(`
`))}</code></pre>`;continue}const y=b.match(/^(#{1,6})\s+(.*)$/);if(y){m();const f=y[1].length;c+=`<h${f}>${ee(Rt(y[2]))}</h${f}>`,n++;continue}if(/^\s*([-*_])\1{2,}\s*$/.test(l)){m(),c+="<hr/>",n++;continue}if(/^>\s?/.test(b)){m();const f=[];for(;n<u.length&&/^>\s?/.test(u[n]);)f.push(u[n].replace(/^>\s?/,"")),n++;c+=`<blockquote>${kn(f.join(`
`))}</blockquote>`;continue}const _=b.match(/^\s*[-*+]\s+(.*)$/);if(_){v!=="ul"&&(m(),c+="<ul>",v="ul"),c+=`<li>${ee(Rt(_[1]))}</li>`,n++;continue}const k=b.match(/^\s*\d+\.\s+(.*)$/);if(k){v!=="ol"&&(m(),c+="<ol>",v="ol"),c+=`<li>${ee(Rt(k[1]))}</li>`,n++;continue}if(l===""){m(),n++;continue}m();const g=[];for(;n<u.length&&u[n].trim()!==""&&!u[n].trim().startsWith("```")&&!/^#{1,6}\s+/.test(u[n])&&!/^\s*[-*+]\s+/.test(u[n])&&!/^\s*\d+\.\s+/.test(u[n])&&!/^>\s?/.test(u[n])&&!/^\s*([-*_])\1{2,}\s*$/.test(u[n].trim());)g.push(u[n]),n++;c+=`<p>${ee(Rt(g.join(`
`)))}</p>`}return m(),c}const Ao=`
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
`,Co=`
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
`,zo={github:`
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
`},Io=`
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
`;function Ro(o,s=""){return o==="custom"?s||"":o==="default"?"":zo[o]||""}let Sn,Pn,Tn,An,Te=null;function Bo(){return Te||(Te=Promise.all([st(()=>import("./flame-BOX-0ac9.js"),[]).then(o=>Sn=o),st(()=>import("./glow-particles-MxG7yI9d.js"),__vite__mapDeps([2,1,3])).then(o=>Pn=o),st(()=>import("./glow-particles-inhale-zFmqHhx9.js"),[]).then(o=>Tn=o),st(()=>import("./glass-shatter-BITFi3iM.js"),[]).then(o=>An=o)]).then(()=>{})),Te}const N={load:Bo,get flame(){return Sn},get glow(){return Pn},get inhale(){return Tn},get glass(){return An}},Do=250,mn='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',Fo='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>';function $o(o,s=""){const u=document.getElementById("app");u.innerHTML=`
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
                <path d="${wn}"></path>
              </svg>
            </span>
          </button>
          <button class="icon-btn" id="btn-max" title="最大化">${mn}</button>
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
  `;const c=document.getElementById("editor"),n=F(),v=document.querySelector(".titlebar"),m=document.getElementById("btn-pin"),b=document.getElementById("btn-toolbar-toggle"),l=document.getElementById("btn-close"),y=document.getElementById("btn-tray"),_=document.getElementById("note-title"),k=document.getElementById("save-status");let g=!1;const f=document.getElementById("tool-fg"),$=document.getElementById("tool-bg"),E=document.getElementById("tool-fg-apply"),C=document.getElementById("tool-bg-apply"),R=document.getElementById("tool-size-wrap"),W=document.getElementById("tool-size-main"),B=document.getElementById("tool-size-drop"),O=document.getElementById("tool-size-num"),V=document.getElementById("btn-max"),tt=document.getElementById("editor-area"),it=document.getElementById("md-preview"),rt=document.getElementById("btn-md-preview"),gt=document.getElementById("btn-md-split"),J=document.getElementById("btn-fmt"),h=document.querySelector(".note-window");let x={content:"",title:"",md:"none",pinned:!0,created:Date.now(),updated:Date.now(),width:420,height:440},P,S,Y,D=!1,q=null,xt=null;const ct=document.querySelector(".toolbar"),ue=t=>{ct.style.display=t?"":"none",b.classList.toggle("active",t),b.setAttribute("aria-pressed",String(t))};b.addEventListener("click",()=>{const t=ct.style.display==="none";ue(t),x.toolbar_visible=t,Ct(o,x).catch(e=>console.error("保存工具栏配置失败:",e))});let ht=null,bt=!1,Mt=!1,$t="";v.addEventListener("mousedown",t=>{t.target.closest(".icon-btn, input, select, textarea")||hn()});const Be=[b,m,V,y],Cn=76,zn=16,In=8,Rn=31,Bn=31;function pe(){const t=v.clientWidth,r=Math.max(0,t-Cn-zn)*1.15/2.15-In-Rn,i=Math.max(0,Math.min(Be.length,Math.floor(r/Bn)));Be.forEach((p,w)=>{p.style.display=w<i?"":"none"}),l.style.display=""}function me(){ct.classList.remove("crowded");const t=ct.scrollWidth>ct.clientWidth+1;ct.classList.toggle("crowded",t)}requestAnimationFrame(()=>{me(),pe()});try{n.onResized(()=>{me(),pe()})}catch{}try{new ResizeObserver(()=>{me(),pe()}).observe(document.documentElement)}catch{}c.addEventListener("blur",()=>{const t=window.getSelection();t&&t.rangeCount>0&&(q=t.getRangeAt(0).cloneRange())}),ct.addEventListener("mousedown",()=>{xt=fe()},!0);function fe(){const t=window.getSelection();if(t&&t.rangeCount>0&&!t.isCollapsed){const e=t.getRangeAt(0);return{start:Nt(e.startContainer,e.startOffset),end:Nt(e.endContainer,e.endOffset)}}return q&&!q.collapsed?{start:Nt(q.startContainer,q.startOffset),end:Nt(q.endContainer,q.endOffset)}:null}function Et(t){if(t)try{c.focus();const e=window.getSelection();if(!e)return;const a=De(t.start),r=De(t.end),i=document.createRange();i.setStart(a.node,a.offset),i.setEnd(r.node,r.offset),e.removeAllRanges(),e.addRange(i)}catch(e){console.error("还原选区失败:",e)}}function Nt(t,e){let a=0;const r=document.createTreeWalker(c,NodeFilter.SHOW_ALL,null);let i;for(;i=r.nextNode();){if(i===t){if(i.nodeType===Node.TEXT_NODE)return a+e;let p=0;for(let w=0;w<e&&w<i.childNodes.length;w++)p+=i.childNodes[w].textContent?.length||0;return a+p}i.nodeType===Node.TEXT_NODE&&(a+=i.textContent?.length||0)}return a}function De(t){let e=0;const a=document.createTreeWalker(c,NodeFilter.SHOW_TEXT,null);let r,i={node:c,offset:0};for(;r=a.nextNode();){const p=r.textContent?.length||0;if(e+p>=t)return{node:r,offset:t-e};e+=p,i={node:r,offset:p}}return i}function Dn(){const t=x.width&&x.width>0?x.width:420,e=x.height&&x.height>0?x.height:440;try{F().setSize(new to(t,e)).catch(()=>{})}catch(a){console.error("设置窗口尺寸失败:",a)}}function Fn(){const t=e=>{const r=e.target.closest("img");if(!r||r.closest(".md-preview"))return;const i=Array.from(document.querySelectorAll(".editor img")),p=i.indexOf(r);if(p<0)return;const w=i.map(L=>L.src);ne("open_image_viewer",{urls:w,index:p}).catch(L=>console.error("打开图片预览失败:",L))};c.addEventListener("dblclick",t)}async function $n(){try{const t=await uo(o);t?(x={width:420,height:440,title:"",md:"none",...t},c.innerHTML=t.content||"",_.value=t.title||"",Ht(t.pinned,!1),ue(t.toolbar_visible??!1)):(Ht(!0,!1),ue(!1)),s&&!t&&(c.innerText=s,x.content=c.innerHTML,et())}catch(t){console.error("加载便签失败:",t),Ht(!0,!1)}try{Yt(),await Me(),await tn(),Ee(),await $e(),Dn(),await ge(),await he()}catch(t){console.error("便签外观应用失败（已忽略，继续显示）:",t)}if(o!=="main")try{const t=await bn();ne("diag_log",{msg:`[note] init show: noteId=${o} open=${JSON.stringify(t)}`}).catch(()=>{}),t.includes(o)?(await F().show(),await F().setFocus()):await F().hide()}catch(t){console.error("读取打开状态失败:",t)}await He(),Oe(),setInterval(Oe,400),c.focus(),Fn(),N.load()}function Ht(t,e=!0){x.pinned=t,m.classList.toggle("pinned",t),m.setAttribute("aria-pressed",t?"true":"false"),m.title=t?"取消置顶":"置顶",lo(t).catch(a=>console.error("置顶失败:",a)),e&&t&&yn(o).catch(a=>console.error("登记置顶失败:",a))}async function Fe(t){let e=x.bg_image||t.bg_image||"";if(e&&!e.startsWith("data:"))try{const{readBgImage:a}=await st(async()=>{const{readBgImage:r}=await import("./settings-DNDHisr4.js").then(i=>i.w);return{readBgImage:r}},__vite__mapDeps([0,1]));e=await a(e)}catch{e=""}return e}async function ge(){const t=await X(),e=t.theme==="transparent",a=Xt()?.body??null;if(e){if(h.classList.remove("bg-immersive"),h.style.removeProperty("--note-panel-alpha"),h.style.removeProperty("--note-bar-alpha"),h.classList.add("bg-transparent"),h.classList.remove("has-bg","on-dark-bg"),h.style.removeProperty("--note-bg-img"),h.style.removeProperty("--note-bg-opacity"),se({target:h,strength:0,enabled:!1}),await Lt(),a){a.classList.add("md-transparent"),a.classList.remove("has-bg-img"),a.style.removeProperty("--md-bg-img"),a.style.removeProperty("--md-bg-opacity"),a.style.removeProperty("--md-blur");const i=getComputedStyle(document.documentElement).getPropertyValue("--trans-opacity").trim();a.style.background=i==="0"?"transparent":`color-mix(in srgb, var(--bg) ${i}%, transparent)`}return}await Lt(),h.classList.remove("bg-transparent"),a&&a.style.removeProperty("background");const r=await Fe(t);await vn(h,t,{bgUrl:r||void 0}),h.classList.toggle("bg-immersive",!!r),h.style.removeProperty("--note-panel-alpha"),h.style.removeProperty("--note-bar-alpha")}async function Lt(){const t=await X();if(t.theme!=="transparent"){h.style.removeProperty("--trans-opacity"),h.classList.remove("transparent-clear"),ft(!1,0,0).catch(()=>{});return}const e=gn(t.transparent_opacity);if(e<2){h.classList.add("transparent-clear"),h.style.setProperty("--trans-opacity","0"),document.documentElement.style.setProperty("--trans-opacity","0"),ft(!1,0,0).catch(()=>{});return}h.classList.remove("transparent-clear");const a=Math.round(e*.6);h.style.setProperty("--trans-opacity",String(a)),document.documentElement.style.setProperty("--trans-opacity",String(a));const r=Ie(getComputedStyle(h).getPropertyValue("--bg"))??0;ft(!0,1,r).catch(i=>console.error("应用实时模糊失败:",i))}async function he(){const t=await X(),e=t.theme==="transparent",a=ln(t.glass_blur),r=t.glass_enabled!==!1,{applyGlassBlur:i}=await st(async()=>{const{applyGlassBlur:p}=await Promise.resolve().then(()=>vo);return{applyGlassBlur:p}},void 0);if(e){await Lt();return}i({target:h,strength:a,enabled:r})}function et(){D||(P&&window.clearTimeout(P),P=window.setTimeout(()=>{x.content=c.innerHTML,x.title=_.value,x.updated=Date.now(),yt("保存中…"),Ct(o,x).then(()=>yt("已保存")).catch(t=>{console.error("保存失败:",t),yt("保存失败",!0)})},Do))}let be;function yt(t,e=!1){g||k&&(k.textContent=t,k.classList.toggle("error",e),k.classList.toggle("ok",!e&&t==="已保存"),k.classList.add("show"),be&&window.clearTimeout(be),be=window.setTimeout(()=>k.classList.remove("show"),e?2600:1400))}async function $e(){await X(),E.title=`按当前颜色上色（${zt("fg_color")}）`,C.title=`按当前背景色上色（${zt("bg_color")}）`,R.title=`文字大小（增大 ${zt("size_up")} / 减小 ${zt("size_down")}）`}fn(()=>{ne("diag_log",{msg:"[note] settings-changed fired, re-applying"}).catch(()=>{}),$e(),Me(),tn(),ge(),he(),He()});let Ot=!0,j=null,_t=null,Z=null,Q=!1,nt=!1,ye=!1;const Wt=28,qt=12,Nn=t=>1+1.9*Math.pow(t-1,3)+.9*Math.pow(t-1,2),Hn=t=>t*t*t;function Ne(t,e,a,r){return new Promise(i=>{n.outerPosition().then(p=>{const w=p.x,L=p.y,M=performance.now(),T=A=>{const I=Math.min(1,(A-M)/a),wt=r(I),H=Math.round(w+(t-w)*wt),_e=Math.round(L+(e-L)*wt);n.setPosition(new ke(H,_e)).catch(()=>{}),I<1?requestAnimationFrame(T):i()};requestAnimationFrame(T)}).catch(()=>i())})}async function He(){try{Ot=(await X()).edge_snap!==!1,!Ot&&Q&&we()}catch(t){console.error("读取贴边设置失败:",t)}}async function Oe(){if(!(nt||Q))try{const t=await n.outerPosition(),e=await n.outerSize(),a=await oe();if(!a)return;const r=a.workArea,i=t.x,p=t.y,w=t.x+e.width,L=t.y+e.height,M=r.position.x,T=r.position.y,A=r.position.x+r.size.width,I=r.position.y+r.size.height;i<=M+qt?j="left":w>=A-qt?j="right":p<=T+qt?j="top":L>=I-qt?j="bottom":j=null}catch{}}async function We(){if(!(!j||nt))try{nt=!0;const t=await n.outerPosition(),e=await n.outerSize(),a=await oe();if(!a){nt=!1;return}const r=a.workArea;_t={x:t.x,y:t.y},Z={x:r.position.x,y:r.position.y,w:r.size.width,h:r.size.height};let i=t.x,p=t.y;j==="left"?i=r.position.x-(e.width-Wt):j==="right"?i=r.position.x+r.size.width-Wt:j==="top"?p=r.position.y-(e.height-Wt):j==="bottom"&&(p=r.position.y+r.size.height-Wt),await Ne(i,p,300,Hn),Q=!0}catch(t){console.error("贴边收起失败:",t)}finally{setTimeout(()=>{nt=!1},380)}}async function we(t=!1){if(!(!Q||!_t||nt))try{nt=!0;const e=await n.outerSize();let a=_t.x,r=_t.y;if(Z){const i=Z.x+Z.w-e.width,p=Z.y+Z.h-e.height;a=Math.min(Math.max(a,Z.x),Math.max(Z.x,i)),r=Math.min(Math.max(r,Z.y),Math.max(Z.y,p))}h.classList.add("edge-pop-in"),await Ne(a,r,360,Nn),h.classList.remove("edge-pop-in"),Q=!1,_t=null,Z=null}catch(e){console.error("贴边弹出失败:",e)}finally{setTimeout(()=>{nt=!1,t&&Ot&&j&&!ye&&!Q&&We()},400)}}document.addEventListener("mouseout",t=>{t.relatedTarget===null&&(ye=!1),!Q&&t.relatedTarget===null&&Ot&&j&&We()}),document.addEventListener("mouseover",()=>{ye=!0,Q&&we(!0)});let kt=!1,lt=0;const ve=()=>{N.glow?.bumpGlowGen();try{h.style.clipPath="",h.style.setProperty("-webkit-mask-image",""),h.style.setProperty("mask-image",""),h.style.opacity="",h.style.boxShadow=""}catch{}};n.listen("summoned",()=>{g=!1,Q&&we(!1);const t=U;U=!1,pt=!1,At(),lt++,mt(),Le(),N.glow?.bumpGlowGen(),Me().catch(()=>{}),ge().catch(()=>{}),he().catch(()=>{});const e=t||kt;if(kt=!1,e)if(h.classList.contains("bg-transparent"))Zt&&(Zt=!1,Lt().catch(()=>{}));else{const a=lt;Promise.all([X(),N.load()]).then(([r])=>{if(a!==lt||U||D)return;const i=r.particle_count??50,p=r.animation_speed??100;r.particle_mode==="none"?ve():r.particle_mode==="erode"?N.flame.playFlameMaterialize(h,i,p):r.particle_mode==="inhale"?N.inhale.playInhaleMaterialize(h,i,p):r.particle_mode==="glass"?N.glass?.restoreGlassSummoned():ve()}).catch(()=>{a!==lt||U||D||ve()})}n.setFocus().catch(()=>{}),requestAnimationFrame(()=>{const a=h;a.style.transform="scale(0.9999)",a.offsetHeight,a.style.transform="",c.style.visibility="hidden",c.offsetHeight,c.style.visibility="",window.dispatchEvent(new Event("resize"))})});function qe(){document.execCommand("foreColor",!1,f.value),et()}function Ge(){document.execCommand("hiliteColor",!1,$.value)||document.execCommand("backColor",!1,$.value),et()}const On=["#000000","#e03131","#f08c00","#f7d000","#2f9e44","#1971c2","#6741d9","#e8590c","#ffffff","#868e96"],Ue="xiaoxin-sticky-note-recent-colors";function Xe(){try{const t=JSON.parse(localStorage.getItem(Ue)||"[]");return Array.isArray(t)?t.filter(e=>typeof e=="string"):[]}catch{return[]}}function xe(t){const e=t.toUpperCase(),a=Xe().filter(r=>r!==e);for(a.unshift(e);a.length>8;)a.pop();try{localStorage.setItem(Ue,JSON.stringify(a))}catch{}}function Gt(t){const e=t.querySelector("#cc-recent");if(!e)return;const a=Xe();e.innerHTML=a.length?'<div class="cc-recent-title">最近使用</div>'+a.map(r=>`<button type="button" class="cc-swatch" data-color="${r}" style="background:${r}"></button>`).join(""):""}function St(t,e){t.style.background=e}function Ve(t,e,a,r,i,p){t.addEventListener("click",()=>{Et(xt),p(),St(r,a.value),xe(a.value),Gt(i)}),e.addEventListener("click",L=>{L.stopPropagation();const M=i.hasAttribute("hidden");if(document.querySelectorAll(".cc-panel:not([hidden])").forEach(T=>T.setAttribute("hidden","")),M){const T=e.closest(".tool-color");if(T){const A=T.getBoundingClientRect();i.style.top=A.bottom+"px",i.style.left=A.left+"px"}Gt(i),i.removeAttribute("hidden")}else i.setAttribute("hidden","")}),i.innerHTML='<div class="cc-recent" id="cc-recent"></div>'+On.map(L=>`<button type="button" class="cc-swatch" data-color="${L}" style="background:${L}"></button>`).join("")+`<label class="cc-custom">自定义<input type="color" class="cc-custom-input" value="${a.value}"></label>`,i.addEventListener("click",L=>{const M=L.target.closest(".cc-swatch");!M||!i.contains(M)||(L.stopPropagation(),a.value=M.getAttribute("data-color")||a.value,St(r,a.value),Et(xt),p(),xe(a.value),Gt(i),i.setAttribute("hidden",""))});const w=i.querySelector(".cc-custom-input");w.addEventListener("input",()=>{a.value=w.value,St(r,a.value)}),w.addEventListener("change",()=>{Et(xt),p(),xe(a.value),Gt(i),i.setAttribute("hidden","")}),a.addEventListener("input",()=>St(r,a.value)),St(r,a.value)}document.addEventListener("click",t=>{t.target.closest(".tool-color")||document.querySelectorAll(".cc-panel:not([hidden])").forEach(a=>a.setAttribute("hidden",""))});function Ye(t){const e=window.getSelection();if(!e||e.rangeCount===0)return;const a=e.getRangeAt(0);if(a.collapsed)return;const r=a.commonAncestorContainer,p=(r.nodeType===Node.ELEMENT_NODE?r:r.parentElement)?.closest("span[style*='font-size']");if(p&&a.toString()===(p.textContent||"")){p.style.fontSize=t+"px",p.querySelectorAll("span[style*='font-size']").forEach(T=>{const A=T;A.textContent===""&&A.remove()});const M=document.createRange();M.selectNodeContents(p),e.removeAllRanges(),e.addRange(M),et();return}const w=document.createElement("span");w.style.fontSize=t+"px",w.appendChild(a.extractContents()),a.insertNode(w);const L=document.createRange();L.selectNodeContents(w),e.removeAllRanges(),e.addRange(L),et()}function je(t){const e=window.getSelection();if(!e||e.rangeCount===0)return;const a=e.getRangeAt(0);if(a.collapsed)return;let r=14;const i=a.startContainer,p=i.nodeType===Node.TEXT_NODE?i.parentElement:i,w=parseFloat(getComputedStyle(p).fontSize);isNaN(w)||(r=w);const L=Math.min(48,Math.max(10,Math.round(r+t)));Ye(String(L))}Ve(E,document.getElementById("tool-fg-drop"),f,document.getElementById("tool-fg-bar"),document.getElementById("tool-fg-panel"),qe),Ve(C,document.getElementById("tool-bg-drop"),$,document.getElementById("tool-bg-bar"),document.getElementById("tool-bg-panel"),Ge);const Wn=[12,14,16,18,20,24,28];let Ke=14,dt=null;function Ut(){dt&&(dt.remove(),dt=null),document.removeEventListener("mousedown",Je,!0),document.removeEventListener("keydown",Ze,!0)}function Je(t){dt&&!dt.contains(t.target)&&!R.contains(t.target)&&Ut()}function Ze(t){t.key==="Escape"&&Ut()}function Qe(){if(dt){Ut();return}const t=R.getBoundingClientRect(),e=document.createElement("div");e.className="fmt-menu size-menu",e.innerHTML=Wn.map(M=>`<button type="button" class="fmt-menu-item${M===Ke?" active":""}" data-size="${M}">${M} px</button>`).join(""),document.body.appendChild(e),dt=e;const a=e.offsetWidth,r=e.offsetHeight,i=window.innerWidth,p=window.innerHeight;let w=t.left;w+a>i-4&&(w=Math.max(4,i-a-4));let L=t.bottom+6;if(L+r>p-4){const M=t.top-r-6;L=M>=4?M:Math.max(4,p-r-4)}e.style.top=L+"px",e.style.left=w+"px",e.querySelectorAll(".fmt-menu-item").forEach(M=>{M.addEventListener("mousedown",T=>{T.preventDefault();const A=Number(M.dataset.size);Ut(),A&&(Ke=A,O.textContent=String(A),Et(xt),Ye(String(A)))})}),setTimeout(()=>{document.addEventListener("mousedown",Je,!0),document.addEventListener("keydown",Ze,!0)},0)}W.addEventListener("click",Qe),B.addEventListener("click",Qe);function Xt(){try{const t=it.contentDocument;if(!t)return null;if(!t.getElementById("md-base")){t.open(),t.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style id="md-base"></style><style id="md-theme"></style><style id="md-bg"></style></head><body></body></html>'),t.close();const e=t.getElementById("md-bg");e&&(e.textContent=Io)}return t}catch(t){return console.error("预览文档初始化失败:",t),null}}function Vt(t){let e=t;e==null&&(e=(c.offsetParent!==null?c.innerText:"")||$t||""),$t=e;const a=Xt();a&&(a.body.innerHTML=kn(e))}function Yt(){const t=x.md||"none",e=c.innerText||"";tt.classList.toggle("preview",t==="preview"),tt.classList.toggle("split",t==="split"),rt.classList.toggle("active",t==="preview"),gt.classList.toggle("active",t==="split"),(t==="preview"||t==="split")&&requestAnimationFrame(()=>Vt(e))}async function Me(){const e=(await X()).theme||"light",a=document.documentElement;a.classList.remove("theme-dark"),(e==="dark"||e==="transparent")&&a.classList.add("theme-dark")}async function tn(){const t=await X(),e=t.md_theme||"default",a=(t.theme||"light")==="dark",r=Xt();if(!r)return;const i=r.getElementById("md-base"),p=r.getElementById("md-theme"),w=e==="default"&&a?Co:Ao;i&&(i.textContent=w);let L="";if(e==="custom")try{L=await mo()}catch(M){console.error("读取自定义样式文件失败:",M)}p&&(p.textContent=Ro(e,L)),(x.md==="preview"||x.md==="split")&&Vt($t),qn()}async function qn(){const t=await X(),e=Xt();if(!e)return;const a=t.theme==="transparent",r=Math.round(ln(t.glass_blur)/100*ze)+"px";if(a){e.body.classList.add("md-transparent"),e.body.classList.remove("has-bg-img"),e.body.style.removeProperty("--md-bg-img"),e.body.style.removeProperty("--md-bg-opacity"),e.body.style.removeProperty("--md-blur");const p=getComputedStyle(document.documentElement).getPropertyValue("--trans-opacity").trim();e.body.style.background=p==="0"?"transparent":`color-mix(in srgb, var(--bg) ${p}%, transparent)`;return}const i=await Fe(t);e.body.style.removeProperty("background"),i?(e.body.classList.add("has-bg-img"),e.body.classList.remove("md-transparent"),e.body.style.setProperty("--md-bg-img",`url("${i}")`),e.body.style.setProperty("--md-bg-opacity","1"),e.body.style.setProperty("--md-blur",r)):(e.body.classList.remove("has-bg-img","md-transparent"),e.body.style.removeProperty("--md-bg-img"),e.body.style.removeProperty("--md-bg-opacity"),e.body.style.removeProperty("--md-blur"))}rt.addEventListener("click",()=>{x.md=x.md==="preview"?"none":"preview",Yt(),et()}),gt.addEventListener("click",()=>{x.md=x.md==="split"?"none":"split",Yt(),et()});let ut=null;function jt(){ut&&(ut.remove(),ut=null),J.classList.remove("active"),document.removeEventListener("mousedown",en,!0),document.removeEventListener("keydown",nn,!0)}function en(t){ut&&!ut.contains(t.target)&&t.target!==J&&jt()}function nn(t){t.key==="Escape"&&jt()}let Pt=null;function Gn(){if(Pt)return;const t=document.createElement("div");t.className="fmt-loading-overlay",t.innerHTML='<div class="fmt-loading-box"><div class="spinner"></div><div class="fmt-loading-text">整理中…</div></div>',document.body.appendChild(t),Pt=t}function Un(){Pt&&(Pt.remove(),Pt=null)}function Xn(){if(ut){jt();return}const t=J.getBoundingClientRect(),e=document.createElement("div");e.className="fmt-menu",e.innerHTML=`
      <button type="button" class="fmt-menu-item" data-mode="md">Markdown 格式</button>
      <button type="button" class="fmt-menu-item" data-mode="text">纯文本格式</button>
      <button type="button" class="fmt-menu-item cancel" data-mode="cancel">取消</button>
    `,document.body.appendChild(e),ut=e;const a=e.offsetWidth,r=e.offsetHeight,i=window.innerWidth,p=window.innerHeight;let w=t.left;w+a>i-4&&(w=Math.max(4,i-a-4));let L=t.bottom+6;if(L+r>p-4){const M=t.top-r-6;L=M>=4?M:Math.max(4,p-r-4)}e.style.top=L+"px",e.style.left=w+"px",J.classList.add("active"),e.querySelectorAll(".fmt-menu-item").forEach(M=>{M.addEventListener("mousedown",T=>{T.preventDefault();const A=M.dataset.mode;jt(),A==="md"?on("md"):A==="text"&&on("text")})}),setTimeout(()=>{document.addEventListener("mousedown",en,!0),document.addEventListener("keydown",nn,!0)},0)}async function on(t){const e=(c.innerText||"").trim();if(!e){Kt("便签内容为空，无需整理");return}J.disabled=!0,Gn();try{const a=await po(e,t==="md"?"md":"text");Vn(e,a,t)}catch(a){Kt("整理失败："+String(a))}finally{J.disabled=!1,Un()}}J.addEventListener("click",Xn);function Vn(t,e,a){if(t===e){Kt("内容已是最整洁，无需改动");return}const r=Yn(t,e);let i=e;r.length>0&&(i=e+`

以下为原内容中未被整理覆盖、已自动补回的部分（如不需要可手动删除）：
`+r.join(`
`));const p=t.replace(/\s+/g,"").length,w=e.replace(/\s+/g,"").length,L=p>120&&w<p*.6,M=jn(t,i),T=M.map(H=>{const _e=H.type==="del"?"diff-del":H.type==="add"?"diff-add":"diff-ctx",Zn=H.type==="del"?"-":H.type==="add"?"+":" ",Qn=an(H.text)||"&nbsp;";return`<div class="diff-line ${_e}"><span class="diff-sign">${Zn}</span><span class="diff-text">${Qn}</span></div>`}).join(""),A=r.length>0?`⚠️ 有 ${r.length} 行原内容未被整理覆盖，已自动补回并标出，请核对（接受后可手动删除）。`:L?"⚠️ 整理后内容明显变少，可能遗漏了信息，请逐行核对后再接受。":"核对改动，接受后用整理后的内容替换便签。",I=document.createElement("div");I.className="fmt-diff-overlay",I.id="fmt-diff-overlay",I.innerHTML=`
      <div class="fmt-diff-modal">
        <div class="fmt-diff-header">
          <span class="fmt-diff-title">格式化预览（${a==="md"?"Markdown":"纯文本"}）</span>
          <span class="fmt-diff-stat">-${M.filter(H=>H.type==="del").length} +${M.filter(H=>H.type==="add").length}</span>
        </div>
        <div class="fmt-diff-body">${T}</div>
        <div class="fmt-diff-footer">
          <span class="fmt-diff-tip${r.length>0||L?" warn":""}">${A}</span>
          <button class="btn-primary" id="fmt-accept">接受</button>
          <button class="shortcut-rec" id="fmt-cancel">取消</button>
        </div>
      </div>
    `,document.body.appendChild(I);const wt=()=>I.remove();I.addEventListener("mousedown",H=>{H.target===I&&wt()}),I.querySelector("#fmt-cancel").addEventListener("click",wt),I.querySelector("#fmt-accept").addEventListener("click",()=>{const H=Kn(i);c.innerHTML=H,x.content=H,a==="md"&&(x.md||"none")==="none"&&(x.md="preview",Yt()),et(),Kt(r.length>0?"已应用（含自动补回的原文内容）":"已应用整理后的内容"),wt()})}function Yn(t,e){const a=t.split(`
`).map(p=>p.trim()).filter(p=>p.length>0),r=e.toLowerCase(),i=[];for(const p of a){const w=p.match(/[A-Za-z0-9@._\-]{3,}/g)||[];if(w.length===0){e.includes(p)||i.push(p);continue}w.some(M=>r.includes(M.toLowerCase()))||i.push(p)}return i}function jn(t,e){const a=t.split(`
`),r=e.split(`
`),i=a.length,p=r.length,w=Array.from({length:i+1},()=>new Array(p+1).fill(0));for(let A=i-1;A>=0;A--)for(let I=p-1;I>=0;I--)w[A][I]=a[A]===r[I]?w[A+1][I+1]+1:Math.max(w[A+1][I],w[A][I+1]);const L=[];let M=0,T=0;for(;M<i&&T<p;)a[M]===r[T]?(L.push({type:"ctx",text:a[M]}),M++,T++):w[M+1][T]>=w[M][T+1]?(L.push({type:"del",text:a[M]}),M++):(L.push({type:"add",text:r[T]}),T++);for(;M<i;)L.push({type:"del",text:a[M]}),M++;for(;T<p;)L.push({type:"add",text:r[T]}),T++;return L}function Kn(t){return t.split(/\n{2,}/).map(a=>{const r=a.trim();return r?"<p>"+an(r).replace(/\n/g,"<br>")+"</p>":""}).join("")}function an(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function Kt(t){let e=document.getElementById("sticky-toast");e||(e=document.createElement("div"),e.id="sticky-toast",e.className="sticky-toast",document.body.appendChild(e)),e.textContent=t,e.classList.add("show"),window.clearTimeout(e._t),e._t=window.setTimeout(()=>e.classList.remove("show"),2600)}async function Ee(){try{const t=bt||await n.isMaximized().catch(()=>!1);V.innerHTML=t?Fo:mn,V.title=t?"还原窗口":"最大化",V.title=t?"还原窗口":"最大化"}catch(t){console.error("读取最大化状态失败:",t)}}async function Jn(){try{if(bt&&ht)Mt=!0,await n.setPosition(new ke(ht.x,ht.y)),await n.setSize(new cn(ht.w,ht.h)),bt=!1;else{const t=await n.outerPosition(),e=await n.outerSize();ht={x:t.x,y:t.y,w:e.width,h:e.height};const a=await oe();if(Mt=!0,a){const r=a.workArea;await n.setPosition(new ke(r.position.x,r.position.y)),await n.setSize(new cn(r.size.width,r.size.height))}else await n.maximize();bt=!0}Ee()}catch(t){console.error("最大化失败:",t)}finally{setTimeout(()=>{Mt=!1},700)}}V.addEventListener("click",()=>{Jn().catch(t=>console.error("最大化失败:",t))});function Jt(t,e){const a=zt(t);if(!a)return!1;const r=a.split("+"),i=L=>r.includes(L);if(e.ctrlKey!==i("Ctrl")||e.altKey!==i("Alt")||e.shiftKey!==i("Shift")||e.metaKey!==i("Meta"))return!1;const p=r[r.length-1];let w;return e.code==="Equal"?w="Plus":e.code==="Minus"?w="Minus":e.code==="Space"?w="Space":e.key.length===1?w=e.key.toUpperCase():w=e.key,w===p}document.addEventListener("keydown",t=>{const e=t.target?.tagName;if(e==="INPUT"||e==="TEXTAREA"||e==="SELECT")return;const a=r=>{t.preventDefault();const i=fe();r(),!fe()&&i&&Et(i)};Jt("fg_color",t)?a(qe):Jt("bg_color",t)?a(Ge):Jt("size_up",t)?a(()=>je(2)):Jt("size_down",t)&&a(()=>je(-2))}),m.addEventListener("click",()=>Ht(!x.pinned)),y.addEventListener("click",()=>{lt++,U=!1,pt=!1,At(),mt(),Le(),kt=!0,io().catch(t=>console.error("最小化到托盘失败:",t))}),l.addEventListener("click",()=>{sn()});let U=!1,pt=!1,Tt,Zt=!1;const mt=()=>{N.glow?.cancelGlowParticles(),N.inhale?.cancelInhaleParticles(),N.flame?.cancelFlame(),N.glass?.cancelGlassShards()},Le=()=>{try{h.style.clipPath="",h.style.setProperty("-webkit-mask-image",""),h.style.setProperty("mask-image",""),h.style.opacity="",h.style.boxShadow=""}catch{}},At=()=>{Tt&&(window.clearTimeout(Tt),Tt=void 0)},rn=t=>{At();const e=Math.max(.25,Math.min(4,100/Math.max(10,t||100))),a=Math.round(2400*e);Tt=window.setTimeout(()=>{!pt&&U&&(console.warn("[sticky] close fail-safe triggered"),ot())},a+1500)},ot=()=>{U=!1,At(),!pt&&(pt=!0,ft(!1,0,0).catch(()=>{}),Zt=!0,kt=!0,Ae().catch(t=>console.error("关闭失败:",t)),h.style.clipPath="",h.style.setProperty("-webkit-mask-image",""),h.style.setProperty("mask-image",""),h.style.opacity="",h.style.boxShadow="",window.setTimeout(()=>{Lt().catch(()=>{}).finally(()=>{Zt=!1})},50))};async function sn(){if(U)return;U=!0,pt=!1,co(o).catch(()=>{}),g=!0,mt(),lt++;let t=null;try{t=await X()}catch{}if(t!==null?t.theme==="transparent":h.classList.contains("bg-transparent")){ot();return}Promise.all([t!==null?Promise.resolve(t):X(),N.load()]).then(([a])=>{if(!U)return;mt();const r=a.particle_count??50,i=a.animation_speed??100;if(a.particle_mode==="none"){ot();return}rn(i),a.particle_mode==="erode"?N.flame.requestFlameDissolveClose(ot,r,i):a.particle_mode==="inhale"?N.inhale.requestInhaleDissolveClose(ot,r,i):a.particle_mode==="glass"?N.glass.requestGlassShardsClose(ot,r,i):N.glow.requestGlowDissolveClose(ot,r,i,!0)}).catch(()=>{U&&(mt(),rn(100),N.glow?.requestGlowDissolveClose(ot))})}c.addEventListener("input",()=>{D=!1,(x.md==="preview"||x.md==="split")&&Vt(),et()}),_.addEventListener("input",()=>{D=!1,x.title=_.value,et()}),window.addEventListener("blur",()=>{D||(P&&window.clearTimeout(P),x.content=c.innerHTML,x.title=_.value,x.updated=Date.now(),yt("保存中…"),Ct(o,x).then(()=>yt("已保存")).catch(()=>yt("保存失败",!0)))}),F().listen("note-deleted",()=>{D=!0,P&&window.clearTimeout(P),S&&window.clearTimeout(S),o==="main"?(c.innerHTML="",_.value="",x.content="",x.title=""):n.destroy().catch(()=>{Ae().catch(()=>{})})}).catch(t=>console.error("监听删除事件失败:",t)),F().listen("play-close-anim",()=>{if(U){Tt&&(mt(),ot());return}sn()}).catch(t=>console.error("监听关闭动画事件失败:",t)),F().listen("sticky://force-hidden",()=>{lt++,U=!1,pt=!1,At(),mt(),Le(),kt=!0}).catch(t=>console.error("监听强制隐藏事件失败:",t)),(async()=>{try{await n.onResized(()=>{Ee(),!(Mt||D)&&(S&&window.clearTimeout(S),S=window.setTimeout(()=>{D||(async()=>{try{const t=await n.outerSize(),e=await n.scaleFactor();x.width=Math.round(t.width/e),x.height=Math.round(t.height/e),Ct(o,x).catch(()=>{})}catch{}})()},500))})}catch(t){console.error("监听窗口尺寸失败:",t)}})(),(async()=>{try{await n.onMoved(()=>{D||nt||Q||Mt||bt||(Y&&window.clearTimeout(Y),Y=window.setTimeout(async()=>{if(!(D||nt||Q||bt))try{const t=await n.outerPosition();x.pos_x=t.x,x.pos_y=t.y,Ct(o,x).catch(()=>{})}catch{}},500))})}catch(t){console.error("监听窗口位置失败:",t)}})(),n.onFocusChanged(({payload:t})=>{t&&(x.md==="preview"||x.md==="split")&&Vt($t)}).catch(t=>console.error("监听聚焦失败:",t)),$n()}async function Wo(){const o=F().label,s=new URLSearchParams(window.location.search),u=s.get("noteId")||"main",c=s.get("preset")||"";o==="sticky-history"?xo():o==="sticky-settings"?F().close().catch(()=>{}):o==="sticky-imageviewer"?Mo().catch(n=>console.error("图片预览加载失败:",n)):o==="particles"?To().then(()=>eo("sticky://particles-layer-ready",{}).catch(()=>{})).catch(n=>console.error("粒子层初始化失败:",n)):$o(u,c)}export{Wo as mountStickyByLabel};
