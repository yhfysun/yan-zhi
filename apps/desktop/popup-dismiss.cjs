// 页面弹窗「关闭键」识别脚本（2026-10-29）。
//
// ★ 为什么单独成文件：这段 JS 是 inject 到网页里跑的**纯逻辑**，改一次就要能单独验。
//   规则来源（实机）：
//   · 支付宝小游戏「联盟攻城战」弹窗：关闭键是左下角一个**无文字、无 close class 的蓝色 ×**
//     → 只按文案/class 找必然为 0（首版就栽在这）。
//   · 通用兜底：先找"最上层的大浮层"，再找贴近它四角的小尺寸可点击元素。
//
// ★ 安全边界：只点「关闭类文案」或「浮层角落的小按钮」；
//   显式排除 领取 / 购买 / 充值 / 去看看 / 开始游戏 等会花钱或改变游戏状态的词。
// ★ 返回 null 表示没有可点的关闭键（调用方照常继续，不阻塞）。
const SCAN_JS = `(function(){
  function vis(el){
    try{
      var r=el.getBoundingClientRect(),s=getComputedStyle(el);
      return r.width>6&&r.height>6&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0.05;
    }catch(e){return false;}
  }
  function flat(el){return String(el.innerText||el.textContent||'').replace(/\\s+/g,'').slice(0,10);}
  function attrOf(el){
    return ((el.getAttribute&&el.getAttribute('aria-label')||'')+' '+(el.getAttribute&&el.getAttribute('title')||'')+' '+
      String(el.className||'')+' '+String(el.id||'')).toLowerCase();
  }
  var WORDS=['关闭','知道了','我知道了','跳过','稍后','下次再说','取消','close'];
  var BAD=/领取|购买|充值|去看看|立即|开始游戏|进入游戏|确认支付|抽奖|继续游戏|分享/;

  /** 最上层的大浮层（fixed/absolute 且覆盖 ≥20% 视口） */
  function topOverlay(){
    var best=null,bz=-1;
    var all=document.body.querySelectorAll('*');
    for(var i=0;i<all.length;i++){
      var el=all[i];
      if(el===document.body||el===document.documentElement)continue;
      var s=getComputedStyle(el);
      if(s.position!=='fixed'&&s.position!=='absolute')continue;
      var r=el.getBoundingClientRect();
      if(r.width*r.height<innerWidth*innerHeight*0.2)continue;
      if(!vis(el))continue;
      var z=parseInt(s.zIndex,10); if(isNaN(z))z=0;
      if(z>=bz){bz=z;best={el:el,r:r,z:z};}
    }
    return best;
  }

  function cornerDist(r,or){
    var cx=r.left+r.width/2,cy=r.top+r.height/2;
    var pts=[[or.left,or.top],[or.right,or.top],[or.left,or.bottom],[or.right,or.bottom]];
    var d=1e9;
    for(var i=0;i<pts.length;i++){
      var dx=cx-pts[i][0],dy=cy-pts[i][1];
      var dd=Math.sqrt(dx*dx+dy*dy);
      if(dd<d)d=dd;
    }
    return d;
  }

  function pick(root, overlayRect){
    var list=[];
    if(root&&root.querySelectorAll){
      var q=root.querySelectorAll('button,[role="button"],a,div,span,i,img,svg');
      for(var i=0;i<q.length;i++)list.push(q[i]);
    }
    var seen=new Set();
    for(var k=0;k<list.length;k++){
      var el=list[k];
      if(!el||seen.has(el))continue;seen.add(el);
      if(overlayRect&&el===overlayRect.el)continue;
      if(!vis(el))continue;
      var r=el.getBoundingClientRect();
      if(r.width>280||r.height>200||r.width*r.height<80)continue;
      var t=flat(el).toLowerCase();
      if(BAD.test(t))continue;
      var a=attrOf(el);
      var hit=false;
      for(var w=0;w<WORDS.length;w++){
        var wl=WORDS[w].toLowerCase();
        if(t===wl||(t&&t.length<=6&&t.indexOf(wl)>=0)){hit=true;break;}
      }
      if(!hit&&/关闭|close/.test(a))hit=true;
      // ★ 浮层角落的小按钮：无文字也能认（实机 × 就是这种）
      var corner=false;
      if(!hit&&overlayRect&&r.width<=72&&r.height<=72){
        try{ if(getComputedStyle(el).cursor==='pointer'&&cornerDist(r,overlayRect.r)<=80)corner=true; }catch(e){}
      }
      if(!hit&&!corner)continue;
      return {
        text: t || (corner?'×':'') || '',
        x: Math.round(r.left+r.width/2),
        y: Math.round(r.top+r.height/2),
        w: Math.round(r.width), h: Math.round(r.height),
        via: hit ? 'label' : 'corner',
      };
    }
    return null;
  }

  var ov=topOverlay();
  if(ov){
    var got=pick(ov.el,ov);
    if(got)return got;
  }
  // 没有明显浮层：退回全局按文案找
  return pick(document.body,null);
})()`;

module.exports = { SCAN_JS };
