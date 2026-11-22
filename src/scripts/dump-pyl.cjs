const fs = require('fs');

const content = fs.readFileSync("data/cache-dump/43e59b8dab8e26b9_0.html", "utf8");
const idx = content.indexOf("var enviar;");
const scriptEnd = content.indexOf("</script>", idx);
const code = content.slice(idx, scriptEnd);

// Let's hook eval inside the code!
// In code, Zyt(8908) is called where Zyt is THg(WBJ, pyL) = Function('', pyL)
// Let's print pyL!
var WBJ='',TEv=232-221;
function iCM(b){
  var m=5187936;var n=b.length;var l=[];for(var r=0;r<n;r++){l[r]=b.charAt(r)};
  for(var r=0;r<n;r++){var e=m*(r+150)+(m%29097);var w=m*(r+156)+(m%35285);var i=e%n;var p=w%n;var c=l[i];l[i]=l[p];l[p]=c;m=(e+w)%6091473;};
  return l.join('');
};
var YxM=iCM('cjisbzrrptanxrutohyldkocmouqcsvefwgnt').substr(0,TEv);
var Udk='ap+rghhCsCnrCn(uh ;rzj0l="n;odcha"]][fr;;p6 rtu8;,nzl;39rs (n8xjbrrlb6r,,kathmk.=+[1-f7,o5kv)htl(nifk+} 6g8v=8t,ov0 ;"fe]icdt)k=),z;m)(=8r i};rna)]n<shj7vieohoCs[)nrabwntA+rnvv[[,t=fof;1Cs=oae+=(e.frrs=ai(vvvrko.).uhioattle;2p=pwrl= +=h2u=vni+te;a"u,tlro7rm("o=iu )((0,b l(b]0p,1 tr.a i=.2=r-ggxuo2nvc=9w;ua; v;s7k;re;r"i)ndcs;v Cg}=)ssar (=x5,n7s;,+.y9ie)gtfr2t6bm<06rn1;sh+0{t),;r2>sj9.i ,(vi(9.d*=1fdu)7vtu;"n.;)+;-(os naexs;ci.g{ oo(l0k-a()g[)+aaif,njClse )rf=v=u]h,-=1(r]la;n*,6g.,(cl,s;479)"<,+fec+gsl.a+0=v4t.Aager-h!21, {(8=w kk=e{ewfhs{((;8er.ev}r.llrn.[].];a+>f)ka"a=h=),,uba;(upz(]k+)b8t<}vatp;l<l1vAan)8o1;}ene=!=l-e.ld(v(n.s0li=s+u;r.ghC.9(rq)b5 n;zba]+iejor vibzma=h;e).hiz[in";]6gt(,=t0so+d[ih+9bag)c=t;,6()0(lx)pei)=gon1tojue+vr=;(grb;i[]}p]=g;h08;a{.=vp=r[{nmfe.)va[ar;)p3oa.l  [tg)roncaummvaoi6()t .c4a;+jr)(17;,A+oS4rrif+;5c+=,6r7ii1st4a(t(;retuku2a=snln0r2[xrv=)SrcA;arh';
var roF=iCM[YxM];
var lnv=roF('',iCM(Udk));
var arg = code.match(/iCM\('([^']+)'\)\);var Zyt/)[1];
var pyL = lnv(iCM(arg));

fs.writeFileSync('data/pyl_decoded.js', pyL);
console.log('Saved pyl_decoded.js, length:', pyL.length);
console.log('First 500 chars:\n', pyL.slice(0, 500));
