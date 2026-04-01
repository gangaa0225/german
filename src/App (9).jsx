import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase";

// ─── DESIGN SYSTEM (Uxcel-inspired dark navy) ────────────────────────────────
const C = {
  bg:       "#0d0e1a",   // deep navy background
  surface:  "#13152b",   // card surface
  card:     "#1a1d35",   // elevated card
  cardHigh: "#1f2240",   // hover card
  border:   "#2a2d50",   // subtle border
  accent:   "#6c5ce7",   // purple (Uxcel primary)
  accentL:  "#a29bfe",   // light purple
  gold:     "#fdcb6e",   // XP / trophy gold
  green:    "#00b894",   // success / correct
  teal:     "#00cec9",   // streak / info
  red:      "#e17055",   // wrong / again
  orange:   "#e67e22",   // hard button
  blue:     "#0984e3",   // easy button
  text:     "#dfe6fd",   // primary text
  muted:    "#7c85c0",   // secondary text
  dim:      "#4a5080",   // dimmed text
  mongolian:"#fdcb6e",   // gold for Mongolian answers
  xpBar:    "#6c5ce7",
  // button colors
  againC:   "#e17055",
  hardC:    "#e67e22",
  goodC:    "#00b894",
  easyC:    "#0984e3",
};

// ─── MILESTONES ───────────────────────────────────────────────────────────────
const MILESTONES = [
  { id: "w10",   count: 10,   title: "Эхний алхам",      emoji: "🌱", desc: "10 үг сурлаа!",       xp: 50   },
  { id: "w50",   count: 50,   title: "Дадлагажигч",      emoji: "📖", desc: "50 үг сурлаа!",       xp: 150  },
  { id: "w100",  count: 100,  title: "А1 баатар",         emoji: "🥉", desc: "100 үг — A1 хангалттай!", xp: 300 },
  { id: "w250",  count: 250,  title: "А2 давагч",         emoji: "🥈", desc: "250 үг сурлаа!",      xp: 500  },
  { id: "w500",  count: 500,  title: "500 үгт клуб",      emoji: "🏆", desc: "500 үг — А2 бэлэн!",  xp: 1000 },
  { id: "w750",  count: 750,  title: "750 мастер",        emoji: "💎", desc: "750 үг сурлаа!",      xp: 1500 },
  { id: "w1000", count: 1000, title: "Б1 аваргын бэлт",   emoji: "👑", desc: "1000 үг — Б1 хүрлэа!", xp: 2000 },
  { id: "w2000", count: 2000, title: "Б2 легенд",         emoji: "🌟", desc: "2000 үг — Б2 түвшин!", xp: 5000 },
];

const BLOG_AWARDS = [
  { id: "br1", title: "Анхны уншигч",   emoji: "📖", xp: 20,  condition: s => s.totalRead >= 1 },
  { id: "br5", title: "Идэвхтэй",       emoji: "📚", xp: 50,  condition: s => s.totalRead >= 5 },
  { id: "br10",title: "Блог мастер",    emoji: "🎓", xp: 100, condition: s => s.totalRead >= 10 },
  { id: "fast",title: "Хурдан уншигч",  emoji: "⚡", xp: 30,  condition: s => s.fastRead },
  { id: "all", title: "Бүгдийг уншсан", emoji: "🏆", xp: 200, condition: (s, total) => s.fullyComplete >= total },
];

const FREE_ARTICLE_LIMIT = 4;
const TRIAL_DAYS = 14;
const TAG_OPTIONS = ["Үг тайлбар","Дүрэм","Хэллэг","Зөвлөгөө","Соёл","А1-А2","Б1-Б2","Дасгал"];
const EMOJI_OPTIONS = ["💡","🧠","💬","📐","🏛️","📚","✍️","🎓","🔥","⭐","🌍","📖","🔮","🎯","⚡","🗣️"];

// ─── SM-2 ALGORITHM ──────────────────────────────────────────────────────────
function sm2(card, q) { // q: 0=again,1=hard,2=good,3=easy
  let { interval=1, repetitions=0, easeFactor=2.5 } = card;
  const quality = [0,2,3,4][q];
  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5-quality)*(0.08+(5-quality)*0.02));
  if (quality < 2) { repetitions=0; interval=1; }
  else {
    if (repetitions===0) interval=1;
    else if (repetitions===1) interval=6;
    else interval = Math.round(interval * easeFactor);
    if (q===1) interval = Math.max(1, Math.round(interval/2));
    if (q===3) interval = Math.round(interval*1.3);
    repetitions++;
  }
  const due = Date.now() + (quality<2 ? 600000 : interval*86400000);
  return { interval, repetitions, easeFactor, due };
}
function nextLabel(card, q) {
  const { interval } = sm2({interval:card.interval||1,repetitions:card.repetitions||0,easeFactor:card.easeFactor||2.5},q);
  if (q===0) return "10 мин";
  if (interval<1) return "<1 өдөр";
  if (interval<30) return interval+"өд";
  return Math.round(interval/30)+"сар";
}

// ─── CONTENT OBFUSCATION ─────────────────────────────────────────────────────
// XOR-encode content so it's not readable in plain source/localStorage
const XK = 0x47;
const enc = str => { try { return btoa(str.split("").map(c=>(c.charCodeAt(0)^XK).toString(16).padStart(2,"0")).join("")); } catch { return str; } };
const dec = str => { try { const b=atob(str); const out=[]; for(let i=0;i<b.length;i+=2){out.push(String.fromCharCode(parseInt(b.slice(i,i+2),16)^XK));} return out.join(""); } catch { return str; } };

// ─── STORAGE HELPERS ─────────────────────────────────────────────────────────
const ls  = (k,fb) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):fb; } catch { return fb; } };
const ss  = (k,v)  => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };
const getUsers   = () => ls("u_db_v4",{});
const saveUsers  = u => ss("u_db_v4",u);
const getBankInfo= () => ls("bank_v4",{});
const validateEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email||"").trim().toLowerCase());

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const SEED_CARDS = [
  { id:1, german:"das Gefühl", mongolian:"Мэдрэмж", ipa:"/ɡəˈfyːl/", example:"Ich habe ein gutes Gefühl.", hint:"das • Gefühl ← fühlen (мэдрэх)", synonyms:["die Empfindung"], note:"'Ich habe das Gefühl, dass...' — өдөр тутмын маш түгээмэл. B1-д заавал!", interval:1,repetitions:0,easeFactor:2.5,due:Date.now() },
  { id:2, german:"übrigens",   mongolian:"Дашрамд хэлэхэд", ipa:"/ˈyːbrɪɡəns/", example:"Übrigens, hast du schon gegessen?", hint:"Өгүүлбэрийн эхэнд ашиглана", synonyms:["nebenbei","apropos"], note:"Яриаг байгалийн жамтай болгодог. Германчууд маш их хэрэглэдэг!", interval:1,repetitions:0,easeFactor:2.5,due:Date.now() },
  { id:3, german:"schaffen",   mongolian:"Чадах / Амжих", ipa:"/ˈʃafn̩/", example:"Ich schaffe das!", hint:"2 утга: чадах & бүтээх", synonyms:["erreichen","bewältigen"], note:"'Das schaffst du!' — найзаа дэмжих хамгийн өдөр тутмын хэлбэр.", interval:1,repetitions:0,easeFactor:2.5,due:Date.now() },
  { id:4, german:"allerdings", mongolian:"Гэхдээ / Гэвч", ipa:"/ˈalɐˌdɪŋs/", example:"Das Essen war gut, allerdings teuer.", hint:"Өгүүлбэрийн дунд эсвэл эхэнд", synonyms:["jedoch","aber","freilich"], note:"B1-B2 шалгалтанд байнга гардаг! 'Тийм ч гэсэн, харин...'", interval:1,repetitions:0,easeFactor:2.5,due:Date.now() },
  { id:5, german:"der Aufwand", mongolian:"Зардал / Хүч гаргалт", ipa:"/ˈaʊ̯fvant/", example:"Der Aufwand lohnt sich.", hint:"der • aufwenden ← ашиглах", synonyms:["die Mühe","die Anstrengung"], note:"'Das ist viel Aufwand' — ажлын яриандалгүй байхын аргагүй!", interval:1,repetitions:0,easeFactor:2.5,due:Date.now() },
];

const SEED_POSTS = [
  { id:1, title:'"schaffen" гэдэг үгийн нууц', titleDe:'The Meaning of "schaffen"', date:"2024-01-10", tag:"Үг тайлбар", emoji:"💡", readTime:5, premium:false, blocks:[
    { type:"text", content:"Сайн байна уу!\n\nӨнөөдөр маш энгийн харагддаг ч маш баян утгатай нэг үгийг судлана:\n\n**schaffen**" },
    { type:"text", content:"---\n\n⚡ Өдөр тутмын утга: Чадах / Амжих\n\nЭнэ бол өдөр тутам сонсох утга:\n\n• **Ich schaffe das!** → Би чадна!\n• **Schaffst du das?** → Чи чадах уу?\n• **Wir haben es geschafft!** → Бид чадлаа!\n\n'Ich kann das' болон 'Ich schaffe das' хоёр өөр. 'Schaffen' нь дотроосоо хүч гаргаж бүтээж байгаа мэдрэмжтэй.\n\n---\n\n🎯 Өдөр тутмын хэлц\n\n• **Das schaffst du!** → Чи чадна! (найзаа дэмжихэд)\n• **Den Zug noch schaffen** → Галт тэргийг амжих\n• **Ich hab's nicht geschafft** → Чадаагүй / Амжаагүй" },
  ]},
  { id:2, title:'"doch" — 1 үгийг мэдвэл 100 өгүүлбэр ойлгоно', titleDe:'The Magic Word "doch"', date:"2024-01-17", tag:"Үг тайлбар", emoji:"🔮", readTime:7, premium:false, blocks:[
    { type:"text", content:"Герман хэлний хамгийн хачин, хамгийн олон утгатай үг:\n\n**doch**\n\nЭнэ үгийг орчуулах гэвэл тархи буцна. Учир нь нэг ч орчуулга байхгүй!" },
    { type:"text", content:"---\n\n🙅 1-р хэрэглээ: Үгүй биш, тийм!\n\nХэн нэгэн 'үгүй' гэж хэлбэл та 'тийм ш дэ!' гэж маргахад:\n\n• **'Du bist nicht müde.'**\n• **'Doch, ich bin total müde!'** → Яахав тийм, би маш ядарсан!\n\n---\n\n💬 2-р хэрэглээ: Дуу хоолойн өнгө\n\n• **Komm doch mal vorbei!** → Ирчихэж байгаач!\n• **Das ist doch nicht normal!** → Энэ тийм ч хэвийн биш шүү!\n• **Du weißt doch, dass...** → Чи мэдэж байгаа биз..." },
  ]},
];

// ─── HELPER COMPONENTS ───────────────────────────────────────────────────────
function XPBar({ xp, level, nextLevelXp }) {
  const pct = Math.min(100, Math.round((xp % nextLevelXp) / nextLevelXp * 100));
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
      <div style={{ width:36, height:36, borderRadius:"50%", background:`linear-gradient(135deg,${C.accent},${C.accentL})`, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:14, color:"#fff", flexShrink:0 }}>{level}</div>
      <div style={{ flex:1 }}>
        <div style={{ height:6, background:C.border, borderRadius:3, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${C.accent},${C.accentL})`, borderRadius:3, transition:"width 0.6s" }} />
        </div>
        <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>{xp % nextLevelXp} / {nextLevelXp} XP</div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color, sub }) {
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 14px", textAlign:"center" }}>
      <div style={{ fontSize:22, marginBottom:6 }}>{icon}</div>
      <div style={{ fontSize:26, fontWeight:800, color:color||C.text, lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:C.dim, marginTop:2 }}>{sub}</div>}
    </div>
  );
}

function ProgressRing({ pct, size=52, stroke=4, color=C.accent }) {
  const r=(size-stroke*2)/2, circ=2*Math.PI*r;
  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)", display:"block" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ-(pct/100)*circ} strokeLinecap="round"
        style={{ transition:"stroke-dashoffset 0.4s" }}/>
    </svg>
  );
}

// Blog block renderer — supports text, image, audio
function BlockRenderer({ block }) {
  if (block.type === "image") return (
    <div style={{ margin:"20px 0" }}>
      <img src={block.url} alt={block.caption||""} style={{ width:"100%", borderRadius:12, display:"block" }} onError={e=>{e.target.style.display="none";}} />
      {block.caption && <div style={{ textAlign:"center", fontSize:12, color:C.muted, marginTop:6, fontStyle:"italic" }}>{block.caption}</div>}
    </div>
  );
  if (block.type === "audio") return (
    <div style={{ margin:"16px 0", background:C.surface, borderRadius:12, padding:"14px 16px", border:`1px solid ${C.border}` }}>
      <div style={{ fontSize:12, color:C.teal, marginBottom:8 }}>🎧 {block.caption||"Аудио сонсох"}</div>
      <audio controls style={{ width:"100%", accentColor:C.accent }} src={block.url} />
    </div>
  );
  // text block
  const lines = (block.content||"").split("\n");
  return (
    <div style={{ lineHeight:1.9, fontSize:15, color:C.text, marginBottom:4 }}>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height:10 }} />;
        if (line.trim()==="---") return <hr key={i} style={{ border:"none", borderTop:`1px solid ${C.border}`, margin:"18px 0" }} />;
        if (line.startsWith("**") && line.endsWith("**") && !line.slice(2,-2).includes("**"))
          return <div key={i} style={{ fontWeight:700, fontSize:17, color:C.accentL, margin:"16px 0 6px" }}>{line.slice(2,-2)}</div>;
        if (line.startsWith("•") || line.startsWith("- ")) {
          const txt = line.replace(/^[•\-]\s*/,"");
          const parts = txt.split(/(\*\*[^*]+\*\*)/g);
          return (
            <div key={i} style={{ display:"flex", gap:10, marginBottom:8, paddingLeft:8 }}>
              <span style={{ color:C.accent, flexShrink:0, marginTop:2 }}>▸</span>
              <span>{parts.map((p,j) => p.startsWith("**") ? <strong key={j} style={{ color:C.text }}>{p.slice(2,-2)}</strong> : p)}</span>
            </div>
          );
        }
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        const hasInline = parts.some(p=>p.startsWith("**"));
        return <p key={i} style={{ margin:"0 0 10px" }}>{hasInline ? parts.map((p,j)=>p.startsWith("**")?<strong key={j} style={{color:C.text}}>{p.slice(2,-2)}</strong>:p) : line}</p>;
      })}
    </div>
  );
}

// ─── XP / LEVEL SYSTEM ───────────────────────────────────────────────────────
function calcLevel(xp) {
  const thresholds = [0,100,250,500,900,1400,2100,3000,4200,5700,7500];
  let level = 1;
  for (let i=0;i<thresholds.length;i++) { if (xp>=thresholds[i]) level=i+1; }
  const nextXp = thresholds[Math.min(level, thresholds.length-1)] || thresholds[thresholds.length-1]+2000;
  return { level, nextLevelXp: nextXp - thresholds[Math.min(level-1, thresholds.length-1)] };
}

// ─── PREMIUM HELPER ──────────────────────────────────────────────────────────
function checkPremium(meta) {
  return meta?.premium === true &&
    (!meta?.premiumUntil || Date.now() < meta.premiumUntil);
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  // ── auth
  const [user, setUser] = useState(null);
  const [authView, setAuthView] = useState("login");
  const [authForm, setAuthForm] = useState({name:"",email:"",password:""});
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotForm, setForgotForm] = useState({email:"",password:"",confirm:""});
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [resetForm, setResetForm] = useState({ password: "", confirm: "" });

  // ── admin
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminAuth, setAdminAuth] = useState(false);
  const [adminPwd, setAdminPwd] = useState("");
  const [adminTab, setAdminTab] = useState("cards");
  const [adminMsg, setAdminMsg] = useState("");
  const [cardForm, setCardForm] = useState({german:"",mongolian:"",ipa:"",example:"",hint:"",synonyms:"",note:""});
  const [editingCard, setEditingCard] = useState(null);
  const [cardSearch, setCardSearch] = useState("");
  const [postForm, setPostForm] = useState({title:"",titleDe:"",tag:"Үг тайлбар",emoji:"💡",readTime:"5",premium:false,blocks:[{type:"text",content:""}]});
  const [editingPost, setEditingPost] = useState(null);
  const [newCode, setNewCode] = useState("");
  const [bankForm, setBankForm] = useState(()=>getBankInfo());
  const [supabaseUsers, setSupabaseUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // ── app
  const [view, setView] = useState("home");
  const [cards, setCards] = useState(()=>ls("cards_v4",SEED_CARDS));
  const [posts, setPosts] = useState(()=>{
    const stored = ls("posts_v4", null);
    if (stored) {
      // decrypt content
      return stored.map(p=>({...p, blocks: p.blocks?.map(b=>b.type==="text"?{...b,content:dec(b.content)}:b)||[]}));
    }
    return SEED_POSTS;
  });
  const [flipped, setFlipped] = useState(false);
  const [currentCard, setCurrentCard] = useState(null);
  const [sessionStats, setSessionStats] = useState({again:0,hard:0,good:0,easy:0});
  const [showAddCard, setShowAddCard] = useState(false);
  const [addForm, setAddForm] = useState({german:"",mongolian:"",ipa:"",example:"",hint:"",synonyms:"",note:""});
  const [selectedPost, setSelectedPost] = useState(null);
  const [readProgress, setReadProgress] = useState(()=>ls("rp_v4",{}));
  const [blogStats, setBlogStats] = useState(()=>ls("bs_v4",{}));
  const [articlesRead, setArticlesRead] = useState(()=>ls("arc_v4",0));
  const [showPaywall, setShowPaywall] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [toast, setToast] = useState(null);
  const [milestonePopup, setMilestonePopup] = useState(null);
  const [xp, setXp] = useState(()=>ls("xp_v4",0));
  const [earnedMilestones, setEarnedMilestones] = useState(()=>ls("ms_v4",[]));
  const readStartRef = useRef(null);
  const contentRef = useRef(null);

  // ── computed
  const isPremium = checkPremium(user?.user_metadata);
  const daysUsed = Math.floor((Date.now()-(user?.trialStart||Date.now()))/86400000);
  const trialDaysLeft = Math.max(0,TRIAL_DAYS-daysUsed);
  const trialExpired = daysUsed>=TRIAL_DAYS;
  const dueCards = cards.filter(c=>c.due<=Date.now());
  const totalLearned = cards.filter(c=>(c.repetitions||0)>0).length;
  const earnedBlogAwardIds = blogStats.earnedAwards||[];
  const {level, nextLevelXp} = calcLevel(xp);
  const totalBlogRead = posts.filter(p=>(readProgress[p.id]||0)>=50).length;

  // sort posts: unread first (by date asc), finished posts pushed to bottom
  const sortedPosts = [...posts].sort((a,b) => {
    const ad=readProgress[a.id]||0, bd=readProgress[b.id]||0;
    const aFinished=ad>=100, bFinished=bd>=100;
    if (aFinished && !bFinished) return 1;
    if (!aFinished && bFinished) return -1;
    return new Date(a.date)-new Date(b.date);
  });

  // ── persist
  useEffect(()=>{ ss("cards_v4",cards); },[cards]);
  useEffect(()=>{
    // encrypt text blocks before saving
    const safe = posts.map(p=>({...p,blocks:p.blocks?.map(b=>b.type==="text"?{...b,content:enc(b.content)}:b)||[]}));
    ss("posts_v4",safe);
  },[posts]);
  useEffect(()=>{ ss("rp_v4",readProgress); },[readProgress]);
  useEffect(()=>{ ss("bs_v4",blogStats); },[blogStats]);
  useEffect(()=>{ ss("arc_v4",articlesRead); },[articlesRead]);
  useEffect(()=>{ ss("xp_v4",xp); },[xp]);
  useEffect(()=>{ ss("ms_v4",earnedMilestones); },[earnedMilestones]);
  useEffect(()=>{ if(toast){const t=setTimeout(()=>setToast(null),3000);return()=>clearTimeout(t);} },[toast]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const confirmed = url.searchParams.get("confirmed");
    if (confirmed === "1") {
      setAuthMessage("Имэйл баталгаажлаа. Одоо нэвтэрч болно.");
      setShowAuthModal(true);
      setShowForgotModal(false);
      setAuthView("login");
      url.searchParams.delete("confirmed");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);
  useEffect(() => {
    const hash = window.location.hash;

    if (hash && hash.includes("type=recovery") && hash.includes("access_token")) {
      setShowResetPasswordModal(true);
      setShowAuthModal(false);
      setShowForgotModal(false);
      setAuthError("");
      setAuthMessage("");
    }
  }, []);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const sessionUser = data.session?.user || null;
      if (sessionUser) {
        setUser({
          ...sessionUser,
          name: sessionUser.user_metadata?.name || sessionUser.email?.split("@")[0] || "Хэрэглэгч",
          premium: sessionUser.user_metadata?.premium || false,
          premiumUntil: sessionUser.user_metadata?.premiumUntil || null,
          trialStart: sessionUser.user_metadata?.trialStart || Date.now(),
        });
      } else {
        setUser(null);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user || null;
      if (sessionUser) {
        setUser({
          ...sessionUser,
          name: sessionUser.user_metadata?.name || sessionUser.email?.split("@")[0] || "Хэрэглэгч",
          premium: sessionUser.user_metadata?.premium || false,
          premiumUntil: sessionUser.user_metadata?.premiumUntil || null,
          trialStart: sessionUser.user_metadata?.trialStart || Date.now(),
        });
      } else {
        setUser(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(()=>{ if(user&&trialExpired&&!isPremium)setShowPaywall(true); },[user]);
  useEffect(()=>{
    if(!selectedPost) return;
    readStartRef.current=Date.now();
    const el=contentRef.current;
    if(!el) return;
    const fn=()=>{ const pct=Math.min(100,Math.round(((el.scrollTop+el.clientHeight)/el.scrollHeight)*100)); setReadProgress(p=>({...p,[selectedPost.id]:Math.max(p[selectedPost.id]||0,pct)})); };
    el.addEventListener("scroll",fn); fn();
    return()=>el.removeEventListener("scroll",fn);
  },[selectedPost]);

  // check milestones whenever totalLearned changes
  useEffect(()=>{
    MILESTONES.forEach(m=>{
      if(totalLearned>=m.count && !earnedMilestones.includes(m.id)){
        setEarnedMilestones(p=>[...p,m.id]);
        addXP(m.xp);
        setMilestonePopup(m);
        setTimeout(()=>setMilestonePopup(null),5000);
      }
    });
  },[totalLearned]);

  const addXP = useCallback(amount=>{
    setXp(prev=>prev+amount);
  },[]);

  // ── auth
  const handleRegister = async () => {
    setAuthError("");
    setAuthMessage("");
    const name = authForm.name.trim();
    const email = authForm.email.trim().toLowerCase();
    const password = authForm.password;

    if(!name||!email||!password) return setAuthError("Бүх талбарыг бөглөнө үү.");
    if(!validateEmail(email)) return setAuthError("Зөв имэйл хаяг оруулна уу.");
    if(password.length<6) return setAuthError("Нууц үг 6+ тэмдэгт байх ёстой.");

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, premium: false, trialStart: Date.now() },
        emailRedirectTo: "https://germanmongol.de/?confirmed=1"
      }
    });

    if (error) {
      setAuthError(error.message);
      return;
    }

    setAuthMessage("Бүртгэл амжилттай. Имэйлээ шалгаад хаягаа баталгаажуулна уу.");
    setAuthView("login");
    setAuthForm({name:"",email, password:""});
  };
  const handleLogin = async () => {
    setAuthError("");
    setAuthMessage("");

    const email = authForm.email.trim().toLowerCase();
    const password = authForm.password;

    if(!validateEmail(email)) return setAuthError("Зөв имэйл хаяг оруулна уу.");
    if(!password) return setAuthError("Нууц үгээ оруулна уу.");

    const { data: loginData, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      setAuthError("Имэйл эсвэл нууц үг буруу");
    } else {
      // write trialStart to metadata if this is the first login
      const meta = loginData.user?.user_metadata || {};
      if (!meta.trialStart) {
        await supabase.auth.updateUser({
          data: { premium: false, trialStart: Date.now() }
        });
      }
      setToast("Амжилттай нэвтэрлээ!");
      setShowAuthModal(false);
      setAuthForm(p=>({...p,password:""}));
    }
  };
  const handleForgotPassword = async () => {
    setAuthError("");
    setAuthMessage("");
    const email = forgotForm.email.trim().toLowerCase();
    if(!validateEmail(email)) return setAuthError("Зөв имэйл хаяг оруулна уу.");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://germanmongol.de/#reset"
    });

    if (error) {
      setAuthError(error.message);
      return;
    }

    setShowForgotModal(false);
    setForgotForm({email:"",password:"",confirm:""});
    setAuthError("");
    setAuthMessage("Нууц үг сэргээх имэйл илгээгдлээ.");
  };

  const handleSetNewPassword = async () => {
    setAuthError("");
    setAuthMessage("");

    const password = resetForm.password;
    const confirm = resetForm.confirm;

    if (!password || !confirm) {
      return setAuthError("Шинэ нууц үгээ хоёр удаа оруулна уу.");
    }

    if (password.length < 6) {
      return setAuthError("Нууц үг 6+ тэмдэгт байх ёстой.");
    }

    if (password !== confirm) {
      return setAuthError("Нууц үгүүд таарахгүй байна.");
    }

    const { error } = await supabase.auth.updateUser({
      password
    });

    if (error) {
      setAuthError(error.message);
      return;
    }

    setShowResetPasswordModal(false);
    setResetForm({ password: "", confirm: "" });

    window.history.replaceState({}, "", window.location.pathname);

    setToast("Нууц үг амжилттай солигдлоо!");
  };

  // ── admin

  const adminLogin=()=>{ if(adminPwd===ls("admin_key_v4","germanadmin2024")){setAdminAuth(true);setAdminPwd("");fetchSupabaseUsers();}else setAdminMsg("Нууц үг буруу."); };

  const fetchSupabaseUsers = async () => {
    setUsersLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "list" }
      });
      if (error) throw error;
      setSupabaseUsers(data.users || []);
    } catch {
      // fallback: show current user only
      const { data } = await supabase.auth.getUser();
      if (data?.user) setSupabaseUsers([data.user]);
    }
    setUsersLoading(false);
  };

  const grantPremium = async (userId, months) => {
    const premiumUntil = Date.now() + months * 30 * 24 * 60 * 60 * 1000;
    try {
      const { error } = await supabase.functions.invoke("admin-users", {
        body: { action: "grant", userId, premiumUntil }
      });
      if (error) throw error;
      setSupabaseUsers(prev => prev.map(u => u.id === userId
        ? { ...u, user_metadata: { ...u.user_metadata, premium: true, premiumUntil } }
        : u
      ));
      if (user?.id === userId) setUser(x => ({ ...x, user_metadata: { ...x.user_metadata, premium: true, premiumUntil } }));
      flash(`✅ ${months} сарын premium олгогдлоо!`);
    } catch {
      // fallback: can only update own account without service role
      await supabase.auth.updateUser({ data: { premium: true, premiumUntil } });
      setUser(x => ({ ...x, user_metadata: { ...x.user_metadata, premium: true, premiumUntil } }));
      flash(`✅ Premium олгогдлоо! (Зөвхөн өөрийн данс)`);
    }
  };

  const revokePremium = async (userId) => {
    try {
      const { error } = await supabase.functions.invoke("admin-users", {
        body: { action: "revoke", userId }
      });
      if (error) throw error;
      setSupabaseUsers(prev => prev.map(u => u.id === userId
        ? { ...u, user_metadata: { ...u.user_metadata, premium: false, premiumUntil: null } }
        : u
      ));
      if (user?.id === userId) setUser(x => ({ ...x, user_metadata: { ...x.user_metadata, premium: false, premiumUntil: null } }));
      flash("✅ Premium цуцлагдлаа.");
    } catch {
      await supabase.auth.updateUser({ data: { premium: false, premiumUntil: null } });
      setUser(x => ({ ...x, user_metadata: { ...x.user_metadata, premium: false, premiumUntil: null } }));
      flash("✅ Premium цуцлагдлаа. (Зөвхөн өөрийн данс)");
    }
  };
  const flash=msg=>{ setAdminMsg(msg); setTimeout(()=>setAdminMsg(""),2500); };
  const saveCard=()=>{
    if(!cardForm.german||!cardForm.mongolian) return flash("⚠️ Герман үг, орчуулга заавал.");
    const syns=cardForm.synonyms?cardForm.synonyms.split(",").map(s=>s.trim()).filter(Boolean):[];
    if(editingCard){ setCards(p=>p.map(c=>c.id===editingCard?{...c,...cardForm,synonyms:syns}:c)); flash("✅ Карт засагдлаа!"); }
    else { setCards(p=>[...p,{id:Date.now(),...cardForm,synonyms:syns,interval:1,repetitions:0,easeFactor:2.5,due:Date.now()}]); flash("✅ Карт нэмэгдлээ!"); }
    setCardForm({german:"",mongolian:"",ipa:"",example:"",hint:"",synonyms:"",note:""}); setEditingCard(null);
  };

  const addBlockToPost = type => setPostForm(p=>({...p,blocks:[...p.blocks,{type,content:"",url:"",caption:""}]}));
  const updateBlock = (i,field,val) => setPostForm(p=>({...p,blocks:p.blocks.map((b,j)=>j===i?{...b,[field]:val}:b)}));
  const removeBlock = i => setPostForm(p=>({...p,blocks:p.blocks.filter((_,j)=>j!==i)}));
  const savePost=()=>{
    if(!postForm.title||!postForm.blocks.some(b=>b.content||b.url)) return flash("⚠️ Гарчиг болон агуулга заавал.");
    if(editingPost){ setPosts(p=>p.map(x=>x.id===editingPost?{...x,...postForm,readTime:parseInt(postForm.readTime)||5}:x)); flash("✅ Нийтлэл засагдлаа!"); }
    else { setPosts(p=>[...p,{id:Date.now(),...postForm,readTime:parseInt(postForm.readTime)||5,date:new Date().toISOString().slice(0,10)}]); flash("✅ Нийтлэл нэмэгдлээ!"); }
    setPostForm({title:"",titleDe:"",tag:"Үг тайлбар",emoji:"💡",readTime:"5",premium:false,blocks:[{type:"text",content:""}]}); setEditingPost(null);
  };

  // ── study
  const getNextCard=useCallback(()=>{ const due=cards.filter(c=>c.due<=Date.now()); return due.length?due[Math.floor(Math.random()*due.length)]:null; },[cards]);
  const startStudy=()=>{
    if(trialExpired&&!isPremium){setShowPaywall(true);return;}
    const card=getNextCard();
    if(!card){setToast("🎉 Бүх карт давтагдсан!");return;}
    setCurrentCard(card); setFlipped(false); setSessionStats({again:0,hard:0,good:0,easy:0}); setView("study");
  };
  const rateCard=q=>{
    const updated=sm2(currentCard,q);
    const wasNew=(currentCard.repetitions||0)===0 && q!==0;
    setCards(prev=>prev.map(c=>c.id===currentCard.id?{...c,...updated}:c));
    const keys=["again","hard","good","easy"]; const ns={...sessionStats,[keys[q]]:sessionStats[keys[q]]+1};
    setSessionStats(ns);
    if(q>=2) addXP(q===3?10:5); // good=5xp, easy=10xp
    const remaining=cards.filter(c=>c.due<=Date.now()&&c.id!==currentCard.id);
    if(!remaining.length){setToast(`✅ Хичээл дууслаа! +${(ns.good+ns.easy)*5}XP`);setView("home");return;}
    setCurrentCard(remaining[Math.floor(Math.random()*remaining.length)]); setFlipped(false);
  };

  // ── blog
  const canRead=post=>{
    if(isPremium) return true;
    if((readProgress[post.id]||0)>0) return true;
    if(!post.premium&&articlesRead<FREE_ARTICLE_LIMIT) return true;
    if(post.premium&&!trialExpired) return true;
    return false;
  };
  const openPost=post=>{
    if(!canRead(post)){setShowPaywall(true);return;}
    if(!(readProgress[post.id]>0)) setArticlesRead(n=>n+1);
    setSelectedPost(post);
  };
  const finishReading=postId=>{
    const elapsed=(Date.now()-(readStartRef.current||Date.now()))/1000;
    setReadProgress(p=>({...p,[postId]:100}));
    addXP(20);
    setBlogStats(prev=>{
      const newProgress={...readProgress,[postId]:100};
      const totalRead=Object.keys(newProgress).filter(k=>(newProgress[k]||0)>=50).length;
      const fullyComplete=Object.values(newProgress).filter(v=>v>=100).length;
      const next={...prev,totalRead,fastRead:prev.fastRead||elapsed<90,fullyComplete,earnedAwards:prev.earnedAwards||[]};
      const earned=BLOG_AWARDS.filter(a=>a.condition(next,posts.length)&&!next.earnedAwards.includes(a.id));
      if(earned.length){ next.earnedAwards=[...next.earnedAwards,...earned.map(a=>a.id)]; earned.forEach(a=>{addXP(a.xp);setMilestonePopup({...a,desc:`+${a.xp} XP`});setTimeout(()=>setMilestonePopup(null),4000);}); }
      return next;
    });
  };

  // ── STYLE SYSTEM (Uxcel-inspired)
  const S = {
    wrap: { minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'Inter','Segoe UI',system-ui,sans-serif" },
    page: { maxWidth:860, margin:"0 auto", padding:"20px 14px" },
    card: { background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:"20px" },
    surface: { background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"16px" },
    inp: (x={})=>({ width:"100%", background:"#0a0b18", border:`1px solid ${C.border}`, borderRadius:10, padding:"11px 14px", color:C.text, fontSize:14, boxSizing:"border-box", outline:"none", fontFamily:"inherit", ...x }),
    btn: (bg=C.accent,x={})=>({ padding:"11px 20px", background:bg, border:"none", borderRadius:10, color:"#fff", cursor:"pointer", fontSize:14, fontWeight:600, transition:"all 0.15s", fontFamily:"inherit", ...x }),
    ghost: (x={})=>({ padding:"10px 18px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:10, color:C.muted, cursor:"pointer", fontSize:14, fontWeight:500, transition:"all 0.15s", fontFamily:"inherit", ...x }),
    tag: (color)=>({ display:"inline-block", padding:"3px 10px", borderRadius:20, background:color+"28", color, fontSize:11, fontWeight:600, letterSpacing:"0.3px" }),
    lbl: (children,required)=><label style={{ fontSize:12, color:C.muted, display:"block", marginBottom:5, fontWeight:500 }}>{children}{required&&<span style={{color:C.red}}> *</span>}</label>,
  };

  // ── GLOBAL POPUPS
  const Toast=()=>toast?<div style={{ position:"fixed",top:20,right:20,background:`linear-gradient(135deg,${C.accent},${C.accentL})`,color:"#fff",padding:"12px 20px",borderRadius:12,fontWeight:700,zIndex:500,fontSize:14,boxShadow:"0 8px 30px rgba(108,92,231,0.4)" }}>{toast}</div>:null;
  const MilestonePop=()=>milestonePopup?(
    <div style={{ position:"fixed",top:80,left:"50%",transform:"translateX(-50%)",background:C.card,border:`2px solid ${C.gold}`,borderRadius:20,padding:"24px 36px",textAlign:"center",zIndex:500,minWidth:280,boxShadow:`0 20px 60px rgba(0,0,0,0.6)` }}>
      <div style={{ fontSize:48,marginBottom:8 }}>{milestonePopup.emoji}</div>
      <div style={{ color:C.gold,fontWeight:800,fontSize:12,letterSpacing:"2px",marginBottom:4 }}>ШАГНАЛ АВЛАА!</div>
      <div style={{ fontWeight:700,fontSize:20,marginBottom:4 }}>{milestonePopup.title}</div>
      <div style={{ color:C.muted,fontSize:13,marginBottom:8 }}>{milestonePopup.desc}</div>
      {milestonePopup.xp && <div style={{ ...S.tag(C.gold),fontSize:13,padding:"5px 14px" }}>+{milestonePopup.xp} XP</div>}
    </div>
  ):null;
  const TrialBanner=()=>{
    if(isPremium||!user) return null;
    if(trialExpired) return <div style={{ background:C.red+"20",borderBottom:`1px solid ${C.red}40`,padding:"9px 16px",textAlign:"center",fontSize:13 }}>⏰ Туршилтын хугацаа дууслаа. <button onClick={()=>setShowPaywall(true)} style={{ background:"none",border:"none",color:C.red,fontWeight:700,cursor:"pointer",textDecoration:"underline" }}>Premium авах →</button></div>;
    if(trialDaysLeft<=3) return <div style={{ background:C.orange+"15",borderBottom:`1px solid ${C.orange}40`,padding:"8px 16px",textAlign:"center",fontSize:12 }}>⚠️ {trialDaysLeft} өдөр үлдлээ. <button onClick={()=>setShowPaywall(true)} style={{ background:"none",border:"none",color:C.orange,fontWeight:700,cursor:"pointer",textDecoration:"underline" }}>Шинэчлэх</button></div>;
    return null;
  };
  const NavBar=()=>(
    <nav style={{ display:"flex",background:C.surface,borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:20,overflowX:"auto" }}>
      <div style={{ display:"flex",alignItems:"center",padding:"0 16px",borderRight:`1px solid ${C.border}` }}>
        <span style={{ fontWeight:800,fontSize:15,background:`linear-gradient(135deg,${C.accent},${C.accentL})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" }}>🇩🇪 ГА</span>
      </div>
      {[["home","🏠","Нүүр"],["study","📚","Судлах"],["deck","🃏","Карт"],["blog","📖","Блог"]].map(([v,ic,lb])=>(
        <button key={v} onClick={()=>v==="study"?startStudy():setView(v)} style={{ padding:"14px 14px",background:"none",border:"none",borderBottom:view===v?`2px solid ${C.accent}`:"2px solid transparent",color:view===v?C.accentL:C.muted,cursor:"pointer",fontSize:13,fontWeight:view===v?600:400,whiteSpace:"nowrap" }}>{ic} {lb}</button>
      ))}
      <div style={{ marginLeft:"auto",display:"flex",alignItems:"center",gap:8,padding:"0 12px" }}>
        <div style={{ display:"flex",alignItems:"center",gap:6,background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:"5px 12px" }}>
          <span style={{ fontSize:12,color:C.gold,fontWeight:700 }}>⚡{xp}XP</span>
          <span style={{ fontSize:11,color:C.accentL,fontWeight:700 }}>Lv.{level}</span>
        </div>
        {isPremium&&<span style={S.tag(C.gold)}>★ PRO</span>}
        {!isPremium&&user&&<span style={{ fontSize:11,color:trialExpired?C.red:C.muted }}>{trialExpired?"Дууссан":`${trialDaysLeft}өд`}</span>}
        <button onClick={()=>{setShowAdmin(true);setAdminAuth(false);}} style={{ background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:14 }} title="Админ">⚙️</button>
        <button onClick={async ()=>{await supabase.auth.signOut();setUser(null);setView("home");}} style={{ background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:12 }}>Гарах</button>
      </div>
    </nav>
  );
  const AuthModal=()=>!showAuthModal?null:(
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",zIndex:120,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }} onClick={e=>e.target===e.currentTarget&&setShowAuthModal(false)}>
      <div style={{ ...S.card,width:"100%",maxWidth:430,padding:"28px 24px",position:"relative" }}>
        <button onClick={()=>{setShowAuthModal(false);setShowForgotModal(false);setAuthError("");setAuthMessage("");setAuthMessage("");}} style={{ position:"absolute",top:14,right:14,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,width:34,height:34,cursor:"pointer",color:C.muted }}>✕</button>
        {!showForgotModal?(<>
          <div style={{ textAlign:"center",marginBottom:24 }}>
            <div style={{ fontSize:42,marginBottom:10 }}>🇩🇪</div>
            <h2 style={{ fontSize:28,fontWeight:800,margin:"0 0 6px",background:`linear-gradient(135deg,${C.accent},${C.accentL})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" }}>ГерманАнки</h2>
            <p style={{ color:C.muted,fontSize:14,margin:0 }}>Үргэлжлүүлэхийн тулд нэвтэрнэ үү</p>
          </div>
          <div style={{ display:"flex",background:C.surface,borderRadius:10,padding:4,marginBottom:22,gap:4 }}>
            {[["login","Нэвтрэх"],["register","Бүртгүүлэх"]].map(([v,l])=>(
              <button key={v} onClick={()=>{setAuthView(v);setAuthError("");setAuthMessage("");}} style={{ flex:1,padding:"9px",background:authView===v?C.card:"none",border:"none",borderRadius:8,color:authView===v?C.text:C.muted,cursor:"pointer",fontSize:14,fontWeight:authView===v?600:400 }}>{l}</button>
            ))}
          </div>
          {authView==="register"&&<div style={{ marginBottom:14 }}>{S.lbl("Нэр",false)}<input value={authForm.name} onChange={e=>setAuthForm(p=>({...p,name:e.target.value}))} placeholder="Таны нэр" style={S.inp()} /></div>}
          <div style={{ marginBottom:14 }}>{S.lbl("Имэйл",false)}<input value={authForm.email} onChange={e=>setAuthForm(p=>({...p,email:e.target.value}))} placeholder="email@example.com" type="email" style={S.inp()} /></div>
          <div style={{ marginBottom:12 }}>{S.lbl("Нууц үг",false)}<input value={authForm.password} onChange={e=>setAuthForm(p=>({...p,password:e.target.value}))} placeholder="••••••" type="password" style={S.inp()} onKeyDown={e=>e.key==="Enter"&&(authView==="login"?handleLogin():handleRegister())} /></div>
          {authView==="login"&&<div style={{ textAlign:"right",marginBottom:14 }}><button onClick={()=>{setShowForgotModal(true);setAuthError("");setAuthMessage("");setForgotForm({email:authForm.email,password:"",confirm:""});}} style={{ background:"none",border:"none",padding:0,color:C.accentL,cursor:"pointer",fontSize:13 }}>Нууц үгээ мартсан уу?</button></div>}
          {authError&&<div style={{ marginBottom:14,padding:"10px 14px",background:C.red+"18",borderRadius:8,color:C.red,fontSize:13 }}>{authError}</div>}
          {authMessage&&<div style={{ marginBottom:14,padding:"10px 14px",background:C.green+"18",borderRadius:8,color:C.text,fontSize:13 }}>{authMessage}</div>}
          <button style={{ ...S.btn(C.accent),width:"100%",padding:14,fontSize:15 }} onClick={authView==="login"?handleLogin:handleRegister}>{authView==="login"?"Нэвтрэх →":"Бүртгүүлж эхлэх →"}</button>
        </>):(<>
          <div style={{ textAlign:"center",marginBottom:20 }}>
            <div style={{ fontSize:38,marginBottom:8 }}>🔑</div>
            <h2 style={{ margin:"0 0 6px",fontSize:24 }}>Нууц үг сэргээх</h2>
            <p style={{ color:C.muted,fontSize:14,margin:0 }}>Имэйл хаяг руу нууц үг сэргээх холбоос илгээгдэнэ.</p>
          </div>
          <div style={{ marginBottom:12 }}>{S.lbl("Имэйл",false)}<input value={forgotForm.email} onChange={e=>setForgotForm(p=>({...p,email:e.target.value}))} placeholder="email@example.com" type="email" style={S.inp()} onKeyDown={e=>e.key==="Enter"&&handleForgotPassword()} /></div>
          {authError&&<div style={{ marginBottom:14,padding:"10px 14px",background:C.red+"18",borderRadius:8,color:C.red,fontSize:13 }}>{authError}</div>}
          {authMessage&&<div style={{ marginBottom:14,padding:"10px 14px",background:C.green+"18",borderRadius:8,color:C.text,fontSize:13 }}>{authMessage}</div>}
          <div style={{ display:"flex",gap:10 }}>
            <button style={{ ...S.ghost(),flex:1 }} onClick={()=>{setShowForgotModal(false);setAuthError("");setAuthMessage("");}}>← Буцах</button>
            <button style={{ ...S.btn(C.green),flex:1 }} onClick={handleForgotPassword}>Хадгалах</button>
          </div>
        </>)}
      </div>
    </div>
  );

  const ResetPasswordModal = () => !showResetPasswordModal ? null : (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.78)",
        zIndex: 130,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={e => e.target === e.currentTarget && setShowResetPasswordModal(false)}
    >
      <div style={{ ...S.card, width: "100%", maxWidth: 430, padding: "28px 24px", position: "relative" }}>
        <button
          onClick={() => setShowResetPasswordModal(false)}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            width: 34,
            height: 34,
            cursor: "pointer",
            color: C.muted
          }}
        >
          ✕
        </button>

        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 38, marginBottom: 8 }}>🔐</div>
          <h2 style={{ margin: "0 0 6px", fontSize: 24 }}>Шинэ нууц үг</h2>
          <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>
            Шинэ нууц үгээ оруулаад хадгална уу.
          </p>
        </div>

        <div style={{ marginBottom: 12 }}>
          {S.lbl("Шинэ нууц үг", false)}
          <input
            value={resetForm.password}
            onChange={e => setResetForm(p => ({ ...p, password: e.target.value }))}
            type="password"
            placeholder="••••••••"
            style={S.inp()}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          {S.lbl("Шинэ нууц үгээ давтах", false)}
          <input
            value={resetForm.confirm}
            onChange={e => setResetForm(p => ({ ...p, confirm: e.target.value }))}
            type="password"
            placeholder="••••••••"
            style={S.inp()}
            onKeyDown={e => e.key === "Enter" && handleSetNewPassword()}
          />
        </div>

        {authError && (
          <div style={{ marginBottom: 14, padding: "10px 14px", background: C.red + "18", borderRadius: 8, color: C.red, fontSize: 13 }}>
            {authError}
          </div>
        )}

        <button style={{ ...S.btn(C.green), width: "100%", padding: 14 }} onClick={handleSetNewPassword}>
          Хадгалах
        </button>
      </div>
    </div>
  );

  const PaywallModal=()=>!showPaywall?null:(
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
      <div style={{ ...S.card,width:"100%",maxWidth:480,border:`1px solid ${C.gold}50` }}>
        <div style={{ textAlign:"center",marginBottom:20 }}>
          <div style={{ fontSize:48,marginBottom:8 }}>🔐</div>
          <h2 style={{ margin:"0 0 6px",fontSize:22 }}>Premium шаардлагатай</h2>
          <p style={{ color:C.muted,margin:0,fontSize:14 }}>{trialExpired?`${TRIAL_DAYS} өдрийн туршилт дууслаа`:`Үнэгүй ${FREE_ARTICLE_LIMIT} нийтлэл уншлаа`}</p>
        </div>
        {getBankInfo().bankName&&(
          <div style={{ background:C.surface,borderRadius:12,padding:"14px 16px",marginBottom:18,border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:11,color:C.muted,marginBottom:8,textTransform:"uppercase",letterSpacing:"1px" }}>💳 Банкны данс</div>
            {getBankInfo().bankName&&<div style={{ fontSize:14,marginBottom:3 }}><span style={{ color:C.muted }}>Банк: </span><strong>{getBankInfo().bankName}</strong></div>}
            {getBankInfo().accountNumber&&<div style={{ fontSize:14,marginBottom:3 }}><span style={{ color:C.muted }}>Данс: </span><strong style={{ color:C.gold,letterSpacing:"1px" }}>{getBankInfo().accountNumber}</strong></div>}
            {getBankInfo().accountName&&<div style={{ fontSize:14,marginBottom:3 }}><span style={{ color:C.muted }}>Нэр: </span><strong>{getBankInfo().accountName}</strong></div>}
            {getBankInfo().amount&&<div style={{ fontSize:15,marginTop:6,color:C.green,fontWeight:700 }}>💰 {getBankInfo().amount}</div>}
            {getBankInfo().note&&<div style={{ fontSize:12,color:C.muted,marginTop:6 }}>{getBankInfo().note}</div>}
          </div>
        )}
        <div style={{ marginBottom:14 }}>
          {S.lbl("Кодоо оруулна уу",false)}
          <input value={accessCode} onChange={e=>setAccessCode(e.target.value)} placeholder="GERMAN-XXXXXX" style={{ ...S.inp(),textAlign:"center",letterSpacing:"3px",fontSize:17,fontWeight:700 }} />
          {codeError&&<div style={{ fontSize:12,color:C.red,marginTop:5 }}>{codeError}</div>}
        </div>
        <button style={{ ...S.btn(C.green),width:"100%",padding:14,marginBottom:10 }} onClick={activateCode}>✅ Код идэвхжүүлэх</button>
        {!trialExpired&&<button style={{ ...S.ghost(),width:"100%" }} onClick={()=>setShowPaywall(false)}>Дараа нь</button>}
      </div>
    </div>
  );

  // ── ADMIN MODAL
  const AdminModal=()=>!showAdmin?null:(
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",zIndex:200,display:"flex",alignItems:"stretch",justifyContent:"flex-end" }}
      onClick={e=>e.target===e.currentTarget&&setShowAdmin(false)}>
      <div style={{ width:"100%",maxWidth:720,background:C.bg,borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",height:"100vh",overflowY:"auto" }}>
        <div style={{ padding:"16px 20px",borderBottom:`1px solid ${C.border}`,background:C.surface,position:"sticky",top:0,zIndex:5,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div><div style={{ fontWeight:700,fontSize:17 }}>⚙️ Админ самбар</div>{adminAuth&&<div style={{ fontSize:11,color:C.green }}>✓ Нэвтэрсэн</div>}</div>
          <button onClick={()=>setShowAdmin(false)} style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:8,width:32,height:32,cursor:"pointer",color:C.muted,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center" }}>✕</button>
        </div>
        {!adminAuth?(
          <div style={{ padding:28,maxWidth:380,margin:"60px auto 0",width:"100%" }}>
            <div style={{ textAlign:"center",marginBottom:20 }}><div style={{ fontSize:36,marginBottom:8 }}>🔒</div><h3 style={{ margin:0 }}>Админ нэвтрэх</h3></div>
            {S.lbl("Нууц үг",false)}
            <input value={adminPwd} onChange={e=>setAdminPwd(e.target.value)} type="password" placeholder="••••••••" style={S.inp()} onKeyDown={e=>e.key==="Enter"&&adminLogin()} autoFocus />
            {adminMsg&&<div style={{ color:C.red,fontSize:13,marginTop:8 }}>{adminMsg}</div>}
            <button style={{ ...S.btn(C.accent),width:"100%",marginTop:14,padding:13 }} onClick={adminLogin}>Нэвтрэх →</button>
            <p style={{ fontSize:11,color:C.muted,textAlign:"center",marginTop:10 }}>Анхдагч: <code style={{ color:C.accentL }}>germanadmin2024</code></p>
          </div>
        ):(
          <>
            <div style={{ display:"flex",borderBottom:`1px solid ${C.border}`,background:C.surface,overflowX:"auto",flexShrink:0 }}>
              {[["cards","🃏 Карт"],["blog","📝 Блог"],["users","👥 Хэрэглэгч"],["payment","💳 Төлбөр"],["settings","🔧"]].map(([t,l])=>(
                <button key={t} onClick={()=>{setAdminTab(t);if(t==="users")fetchSupabaseUsers();}} style={{ padding:"12px 15px",background:"none",border:"none",borderBottom:adminTab===t?`2px solid ${C.accent}`:"2px solid transparent",color:adminTab===t?C.accentL:C.muted,cursor:"pointer",fontSize:13,fontWeight:adminTab===t?600:400,whiteSpace:"nowrap" }}>{l}</button>
              ))}
            </div>
            {adminMsg&&<div style={{ margin:"12px 20px 0",padding:"10px 14px",background:adminMsg.startsWith("✅")?C.green+"15":C.red+"15",border:`1px solid ${adminMsg.startsWith("✅")?C.green:C.red}30`,borderRadius:8,color:adminMsg.startsWith("✅")?C.green:C.red,fontSize:13 }}>{adminMsg}</div>}
            <div style={{ padding:20 }}>
              {/* CARDS */}
              {adminTab==="cards"&&(
                <div>
                  <div style={{ ...S.surface,marginBottom:20 }}>
                    <h3 style={{ margin:"0 0 16px",fontSize:15,fontWeight:700 }}>{editingCard?"✏️ Карт засах":"➕ Шинэ карт"}</h3>
                    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
                      <div>{S.lbl("🇩🇪 Герман үг",true)}<input value={cardForm.german} onChange={e=>setCardForm(p=>({...p,german:e.target.value}))} placeholder="z.B. das Gefühl" style={S.inp()} /><div style={{ fontSize:10,color:C.accentL,marginTop:3 }}>Артикльтай: der/die/das</div></div>
                      <div>{S.lbl("🇲🇳 Монгол орчуулга",true)}<input value={cardForm.mongolian} onChange={e=>setCardForm(p=>({...p,mongolian:e.target.value}))} placeholder="ж.нь: Мэдрэмж" style={S.inp()} /></div>
                    </div>
                    <div style={{ marginBottom:12 }}>{S.lbl("🔊 Дуудлага (IPA)",false)}<input value={cardForm.ipa} onChange={e=>setCardForm(p=>({...p,ipa:e.target.value}))} placeholder="ж.нь: /ɡəˈfyːl/" style={S.inp()} /></div>
                    <div style={{ marginBottom:12 }}>{S.lbl("📝 Жишээ өгүүлбэр",false)}<input value={cardForm.example} onChange={e=>setCardForm(p=>({...p,example:e.target.value}))} placeholder="Ich habe ein gutes Gefühl." style={S.inp()} /></div>
                    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
                      <div>{S.lbl("💡 Hint",false)}<input value={cardForm.hint} onChange={e=>setCardForm(p=>({...p,hint:e.target.value}))} placeholder="Хүйс, онцлог..." style={S.inp()} /></div>
                      <div>{S.lbl("🔀 Синонимууд",false)}<input value={cardForm.synonyms} onChange={e=>setCardForm(p=>({...p,synonyms:e.target.value}))} placeholder="die Empfindung, ..." style={S.inp()} /></div>
                    </div>
                    <div style={{ marginBottom:16 }}>{S.lbl("📌 Багшийн тэмдэглэл",false)}<textarea value={cardForm.note} onChange={e=>setCardForm(p=>({...p,note:e.target.value}))} rows={2} style={{ ...S.inp(),resize:"vertical",lineHeight:1.6 }} /></div>
                    {(cardForm.german||cardForm.mongolian)&&<div style={{ padding:"10px 14px",background:C.card,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:14 }}><div style={{ fontSize:10,color:C.muted,marginBottom:5,textTransform:"uppercase" }}>Урьдчилан харах</div><span style={{ fontWeight:700,fontSize:17 }}>{cardForm.german||"—"}</span><span style={{ color:C.muted,margin:"0 8px" }}>→</span><span style={{ color:C.mongolian,fontWeight:600 }}>{cardForm.mongolian||"—"}</span>{cardForm.ipa&&<span style={{ color:C.teal,marginLeft:10,fontSize:13,fontFamily:"monospace" }}>{cardForm.ipa}</span>}</div>}
                    <div style={{ display:"flex",gap:8 }}>
                      <button style={S.btn(C.green)} onClick={saveCard}>{editingCard?"💾 Хадгалах":"➕ Нэмэх"}</button>
                      {editingCard&&<button style={S.ghost()} onClick={()=>{setEditingCard(null);setCardForm({german:"",mongolian:"",ipa:"",example:"",hint:"",synonyms:"",note:""});}}>Болих</button>}
                    </div>
                  </div>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
                    <h3 style={{ margin:0,fontSize:15 }}>Бүх карт ({cards.length})</h3>
                    <input value={cardSearch} onChange={e=>setCardSearch(e.target.value)} placeholder="🔍 Хайх..." style={{ ...S.inp(),width:180,padding:"8px 12px",fontSize:13 }} />
                  </div>
                  <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                    {cards.filter(c=>!cardSearch||c.german.toLowerCase().includes(cardSearch.toLowerCase())||c.mongolian.includes(cardSearch)).map(c=>(
                      <div key={c.id} style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",display:"flex",alignItems:"flex-start",gap:10 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:2 }}><span style={{ fontWeight:700 }}>{c.german}</span><span style={{ color:C.muted }}>→</span><span style={{ color:C.mongolian,fontWeight:600 }}>{c.mongolian}</span>{c.ipa&&<span style={{ color:C.teal,fontSize:12,fontFamily:"monospace" }}>{c.ipa}</span>}</div>
                          {c.hint&&<div style={{ fontSize:11,color:C.accentL }}>💡 {c.hint}</div>}
                        </div>
                        <div style={{ display:"flex",gap:6 }}>
                          <button onClick={()=>{setCardForm({german:c.german,mongolian:c.mongolian,ipa:c.ipa||"",example:c.example||"",hint:c.hint||"",synonyms:Array.isArray(c.synonyms)?c.synonyms.join(", "):"",note:c.note||""});setEditingCard(c.id);}} style={{ ...S.btn(C.accent),padding:"6px 12px",fontSize:12 }}>✏️</button>
                          <button onClick={()=>{if(window.confirm("Устгах уу?"))setCards(p=>p.filter(x=>x.id!==c.id));flash("🗑️ Устгагдлаа.");}} style={{ ...S.btn(C.red),padding:"6px 12px",fontSize:12 }}>🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* BLOG */}
              {adminTab==="blog"&&(
                <div>
                  <div style={{ ...S.surface,marginBottom:20 }}>
                    <h3 style={{ margin:"0 0 16px",fontSize:15,fontWeight:700 }}>{editingPost?"✏️ Нийтлэл засах":"➕ Шинэ нийтлэл"}</h3>
                    <div style={{ marginBottom:12 }}>{S.lbl("📌 Гарчиг (Монгол)",true)}<input value={postForm.title} onChange={e=>setPostForm(p=>({...p,title:e.target.value}))} placeholder="ж.нь: 'doch' гэдэг үгийн нууц" style={S.inp()} /></div>
                    <div style={{ marginBottom:12 }}>{S.lbl("🇩🇪 Гарчиг (Герман/Англи) — заавал биш",false)}<input value={postForm.titleDe} onChange={e=>setPostForm(p=>({...p,titleDe:e.target.value}))} placeholder="The Magic Word 'doch'" style={S.inp()} /></div>
                    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:16 }}>
                      <div>{S.lbl("🏷️ Ангилал",false)}<select value={postForm.tag} onChange={e=>setPostForm(p=>({...p,tag:e.target.value}))} style={{ ...S.inp(),cursor:"pointer" }}>{TAG_OPTIONS.map(t=><option key={t}>{t}</option>)}</select></div>
                      <div>{S.lbl("😀 Emoji",false)}<select value={postForm.emoji} onChange={e=>setPostForm(p=>({...p,emoji:e.target.value}))} style={{ ...S.inp(),cursor:"pointer" }}>{EMOJI_OPTIONS.map(e=><option key={e}>{e}</option>)}</select></div>
                      <div>{S.lbl("⏱️ Унших (мин)",false)}<input value={postForm.readTime} onChange={e=>setPostForm(p=>({...p,readTime:e.target.value}))} type="number" min="1" max="60" style={S.inp()} /></div>
                      <div style={{ display:"flex",flexDirection:"column",justifyContent:"flex-end" }}><label style={{ display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:postForm.premium?C.gold:C.muted,paddingBottom:11 }}><input type="checkbox" checked={postForm.premium} onChange={e=>setPostForm(p=>({...p,premium:e.target.checked}))} style={{ width:16,height:16 }} />{postForm.premium?"★ Premium":"Үнэгүй"}</label></div>
                    </div>

                    {/* Content blocks */}
                    <div style={{ marginBottom:12 }}>
                      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
                        <div style={{ fontWeight:600,fontSize:14 }}>📄 Агуулгын блокууд</div>
                        <div style={{ display:"flex",gap:6 }}>
                          <button style={{ ...S.btn(C.accent),padding:"6px 12px",fontSize:12 }} onClick={()=>addBlockToPost("text")}>+ Текст</button>
                          <button style={{ ...S.btn(C.teal),padding:"6px 12px",fontSize:12 }} onClick={()=>addBlockToPost("image")}>+ Зураг</button>
                          <button style={{ ...S.btn(C.purple),padding:"6px 12px",fontSize:12 }} onClick={()=>addBlockToPost("audio")}>+ Аудио</button>
                        </div>
                      </div>
                      <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                        {postForm.blocks.map((block,i)=>(
                          <div key={i} style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px" }}>
                            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
                              <span style={{ fontSize:12,color:C.muted,fontWeight:600 }}>{block.type==="text"?"📝 Текст блок":block.type==="image"?"🖼️ Зураг блок":"🎧 Аудио блок"}</span>
                              <button onClick={()=>removeBlock(i)} style={{ background:C.red+"20",border:"none",borderRadius:6,color:C.red,cursor:"pointer",padding:"3px 8px",fontSize:11 }}>✕ Устгах</button>
                            </div>
                            {block.type==="text"&&<textarea value={block.content} onChange={e=>updateBlock(i,"content",e.target.value)} placeholder={"Агуулгаа бич...\n**Bold гарчиг**\n• Bullet point\n--- хэвтэгч шугам"} rows={5} style={{ ...S.inp(),resize:"vertical",lineHeight:1.7 }} />}
                            {(block.type==="image"||block.type==="audio")&&(
                              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                                <input value={block.url} onChange={e=>updateBlock(i,"url",e.target.value)} placeholder={block.type==="image"?"https://... зурагны URL":"https://... аудио URL (.mp3)"} style={S.inp()} />
                                <input value={block.caption||""} onChange={e=>updateBlock(i,"caption",e.target.value)} placeholder="Тайлбар (заавал биш)" style={{ ...S.inp(),fontSize:13 }} />
                                {block.type==="image"&&block.url&&<img src={block.url} alt="" style={{ width:"100%",maxHeight:160,objectFit:"cover",borderRadius:8 }} onError={e=>e.target.style.display="none"} />}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ display:"flex",gap:8 }}>
                      <button style={S.btn(C.green)} onClick={savePost}>{editingPost?"💾 Хадгалах":"🚀 Нийтлэх"}</button>
                      {editingPost&&<button style={S.ghost()} onClick={()=>{setEditingPost(null);setPostForm({title:"",titleDe:"",tag:"Үг тайлбар",emoji:"💡",readTime:"5",premium:false,blocks:[{type:"text",content:""}]});}}>Болих</button>}
                    </div>
                  </div>
                  <h3 style={{ margin:"0 0 12px",fontSize:15 }}>Бүх нийтлэл ({posts.length})</h3>
                  <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                    {[...posts].sort((a,b)=>new Date(a.date)-new Date(b.date)).map(p=>(
                      <div key={p.id} style={{ background:C.card,border:`1px solid ${p.premium?C.gold+"40":C.border}`,borderRadius:10,padding:"12px 14px",display:"flex",alignItems:"center",gap:10 }}>
                        <span style={{ fontSize:20 }}>{p.emoji}</span>
                        <div style={{ flex:1,minWidth:0 }}>
                          <div style={{ fontWeight:600,fontSize:14,marginBottom:2 }}>{p.title}</div>
                          <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
                            <span style={S.tag(C.accentL)}>{p.tag}</span>
                            {p.premium&&<span style={S.tag(C.gold)}>★</span>}
                            <span style={{ fontSize:11,color:C.muted }}>{p.date} · {p.readTime}мин · {p.blocks?.length||1} блок</span>
                          </div>
                        </div>
                        <div style={{ display:"flex",gap:6 }}>
                          <button onClick={()=>{setEditingPost(p.id);setPostForm({title:p.title,titleDe:p.titleDe||"",tag:p.tag,emoji:p.emoji||"💡",readTime:String(p.readTime),premium:p.premium||false,blocks:p.blocks||[{type:"text",content:p.content||""}]});}} style={{ ...S.btn(C.accent),padding:"6px 12px",fontSize:12 }}>✏️</button>
                          <button onClick={()=>{if(window.confirm("Устгах уу?"))setPosts(x=>x.filter(y=>y.id!==p.id));flash("🗑️ Устгагдлаа.");}} style={{ ...S.btn(C.red),padding:"6px 12px",fontSize:12 }}>🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* USERS */}
              {adminTab==="users"&&(
                <div>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
                    <h3 style={{ margin:0,fontSize:15 }}>👥 Supabase хэрэглэгчид</h3>
                    <button style={{ ...S.btn(C.accent),padding:"8px 14px",fontSize:12 }} onClick={fetchSupabaseUsers}>
                      {usersLoading ? "⏳ Ачааллаж..." : "🔄 Шинэчлэх"}
                    </button>
                  </div>

                  {usersLoading ? (
                    <div style={{ textAlign:"center",padding:40,color:C.muted }}>⏳ Хэрэглэгчид ачааллаж байна...</div>
                  ) : supabaseUsers.length === 0 ? (
                    <div style={{ ...S.surface,textAlign:"center",color:C.muted }}>
                      <div style={{ fontSize:32,marginBottom:8 }}>👥</div>
                      <div>Хэрэглэгч олдсонгүй.</div>
                      <div style={{ fontSize:12,marginTop:6 }}>Service role key шаардлагатай эсвэл хэрэглэгч бүртгэлгүй.</div>
                    </div>
                  ) : (
                    <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                      {supabaseUsers.map(u => {
                        const meta = u.user_metadata || {};
                        const isPrem = checkPremium(meta);
                        const premExpired = meta.premium === true && meta.premiumUntil && Date.now() >= meta.premiumUntil;
                        const trialStart = meta.trialStart || u.created_at ? new Date(meta.trialStart || u.created_at).getTime() : Date.now();
                        const daysUsed = Math.floor((Date.now() - trialStart) / 86400000);
                        const trialLeft = Math.max(0, TRIAL_DAYS - daysUsed);
                        const premUntilDate = meta.premiumUntil ? new Date(meta.premiumUntil).toLocaleDateString("mn-MN") : null;
                        const name = meta.name || u.email?.split("@")[0] || "—";

                        return (
                          <div key={u.id} style={{ background:C.card,border:`1px solid ${isPrem?C.gold+"60":premExpired?C.red+"40":C.border}`,borderRadius:12,padding:"14px 16px" }}>
                            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8 }}>
                              <div>
                                <div style={{ fontWeight:700,fontSize:15 }}>{name}</div>
                                <div style={{ fontSize:12,color:C.muted,marginTop:2 }}>{u.email}</div>
                                <div style={{ display:"flex",gap:6,marginTop:6,flexWrap:"wrap" }}>
                                  {isPrem && <span style={S.tag(C.gold)}>★ Premium · {premUntilDate} хүртэл</span>}
                                  {premExpired && <span style={S.tag(C.red)}>★ Дууссан · {premUntilDate}</span>}
                                  {!meta.premium && <span style={S.tag(daysUsed>=TRIAL_DAYS?C.red:C.muted)}>{daysUsed>=TRIAL_DAYS?"Туршилт дууссан":`Туршилт: ${trialLeft}өд үлдсэн`}</span>}
                                  <span style={{ fontSize:11,color:C.dim }}>ID: {u.id.slice(0,8)}...</span>
                                </div>
                              </div>
                              <div style={{ display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end" }}>
                                {isPrem || premExpired ? (
                                  <button onClick={()=>revokePremium(u.id)} style={{ ...S.btn(C.red),padding:"6px 12px",fontSize:12 }}>
                                    ✕ Цуцлах
                                  </button>
                                ) : null}
                                <div style={{ display:"flex",gap:6 }}>
                                  {[[3,"3 сар"],[6,"6 сар"],[12,"1 жил"]].map(([mo,label])=>(
                                    <button key={mo} onClick={()=>grantPremium(u.id, mo)}
                                      style={{ ...S.btn(C.green),padding:"6px 11px",fontSize:12,opacity:isPrem?0.6:1 }}>
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* PAYMENT */}
              {adminTab==="payment"&&(
                <div style={S.surface}>
                  <h3 style={{ margin:"0 0 14px",fontSize:15 }}>💳 Банкны данс</h3>
                  {[["bankName","🏦 Банк","Хаан банк"],["accountNumber","💳 Дансны дугаар","5000123456"],["accountName","👤 Нэр","Болд Б."],["amount","💰 Үнэ","29,900₮/сар"],["note","📝 Тэмдэглэл","Гүйлгээний утгад имэйлээ бич"]].map(([k,l,ph])=>(
                    <div key={k} style={{ marginBottom:14 }}>{S.lbl(l,false)}<input value={bankForm[k]||""} onChange={e=>setBankForm(p=>({...p,[k]:e.target.value}))} placeholder={ph} style={S.inp()} /></div>
                  ))}
                  <button style={S.btn(C.green)} onClick={()=>{ss("bank_v4",bankForm);flash("✅ Хадгалагдлаа!");}}>💾 Хадгалах</button>
                </div>
              )}

              {/* SETTINGS */}
              {adminTab==="settings"&&(
                <div>
                  <div style={{ ...S.surface,marginBottom:16 }}>
                    <h3 style={{ margin:"0 0 14px",fontSize:15 }}>🔧 Тохиргоо</h3>
                    <div style={{ marginBottom:16 }}>{S.lbl("Админ нууц үг солих",false)}<div style={{ display:"flex",gap:8 }}><input id="apwd2" type="password" placeholder="Шинэ нууц үг..." style={{ ...S.inp(),flex:1 }} /><button style={S.btn(C.accent)} onClick={()=>{const v=document.getElementById("apwd2").value;if(!v||v.length<6)return flash("⚠️ 6+ тэмдэгт");ss("admin_key_v4",v);flash("✅ Солигдлоо!");document.getElementById("apwd2").value="";}}>Солих</button></div></div>
                    <div style={{ padding:"14px",background:C.card,borderRadius:10,border:`1px solid ${C.border}`,lineHeight:2,fontSize:13,color:C.muted }}>
                      📊 Карт: <strong style={{ color:C.text }}>{cards.length}</strong> · Нийтлэл: <strong style={{ color:C.text }}>{posts.length}</strong> · Хэрэглэгч: <strong style={{ color:C.text }}>{Object.values(getUsers()).length}</strong> · Premium: <strong style={{ color:C.gold }}>{Object.values(getUsers()).filter(u=>u.premium).length}</strong>
                    </div>
                  </div>
                  <div style={{ padding:"12px 14px",background:C.red+"10",border:`1px solid ${C.red}30`,borderRadius:10 }}>
                    <div style={{ color:C.red,fontWeight:600,marginBottom:8 }}>⚠️ Аюултай</div>
                    <button style={{ ...S.btn(C.red),fontSize:12,padding:"8px 14px" }} onClick={()=>{if(window.confirm("Бүгдийг устгах уу?")){["cards_v4","posts_v4","u_db_v4","premium_codes_v4","rp_v4","bs_v4","arc_v4","xp_v4","ms_v4"].forEach(k=>localStorage.removeItem(k));window.location.reload();}}}>Бүх өгөгдлийг устгах</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // PUBLIC LANDING / AUTH
  // ══════════════════════════════════════════════════════════
  if(!user) return(
    <div style={{ ...S.wrap,minHeight:"100vh",background:`radial-gradient(ellipse at top, #1a1040 0%, ${C.bg} 60%)` }}>
      {Toast()}
     {AuthModal()}
      {ResetPasswordModal()}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:28,flexWrap:"wrap" }}>
          <div>
            <div style={{ fontWeight:800,fontSize:20,background:`linear-gradient(135deg,${C.accent},${C.accentL})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" }}>🇩🇪 ГерманАнки</div>
            <div style={{ color:C.muted,fontSize:13,marginTop:4 }}>Монголчуудад зориулсан Герман хэлний систем</div>
          </div>
          <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
            <button style={S.ghost()} onClick={()=>{setAuthView("login");setShowForgotModal(false);setShowAuthModal(true);}}>Нэвтрэх</button>
            <button style={S.btn(`linear-gradient(135deg,${C.accent},${C.accentL})`)} onClick={()=>{setAuthView("register");setShowForgotModal(false);setShowAuthModal(true);}}>Үнэгүй эхлэх</button>
          </div>
        </div>

        <div style={{ ...S.card,padding:"34px 28px",marginBottom:18,background:`linear-gradient(135deg,#17193a,#101327)` }}>
          <div style={{ maxWidth:640 }}>
            <div style={{ ...S.tag(C.green),marginBottom:14,fontSize:13,padding:"5px 14px" }}>✓ {TRIAL_DAYS} өдөр үнэгүй · {FREE_ARTICLE_LIMIT} нийтлэл үнэгүй</div>
            <h1 style={{ fontSize:42,lineHeight:1.08,margin:"0 0 12px",fontWeight:900 }}>Герман үгсээ карт, блог, XP системтэйгээр сур.</h1>
            <p style={{ color:C.muted,fontSize:16,lineHeight:1.7,margin:"0 0 18px" }}>Эхлээд хүмүүс танай апп дотор юу байгааг харна. Таалагдвал л бүртгүүлнэ. Энэ landing page яг тэр логикоор ажиллана.</p>
            <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
              <button style={S.btn(`linear-gradient(135deg,${C.accent},${C.accentL})`)} onClick={()=>{setAuthView("register");setShowForgotModal(false);setShowAuthModal(true);}}>Бүртгүүлж эхлэх</button>
              <button style={S.ghost()} onClick={()=>window.scrollTo({top:780,behavior:"smooth"})}>Юу байгааг харах ↓</button>
            </div>
          </div>
        </div>

        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:18 }}>
          <StatCard icon="🃏" label="Нийт карт" value={cards.length} color={C.accentL} />
          <StatCard icon="📖" label="Нийтлэл" value={posts.length} color={C.teal} />
          <StatCard icon="⚡" label="Gamified XP" value="Level up" color={C.gold} />
          <StatCard icon="🔐" label="Туршилт" value={`${TRIAL_DAYS} өдөр`} color={C.green} />
        </div>

        <div style={{ display:"grid",gridTemplateColumns:"1.1fr 0.9fr",gap:16,alignItems:"start" }}>
          <div style={S.card}>
            <div style={{ fontWeight:700,fontSize:18,marginBottom:14 }}>🃏 Картны жишээ</div>
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
              {cards.slice(0,3).map(c=>(
                <div key={c.id} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 18px" }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap" }}>
                    <strong style={{ fontSize:18 }}>{c.german}</strong>
                    <span style={{ color:C.dim }}>→</span>
                    <span style={{ color:C.mongolian,fontWeight:700 }}>{c.mongolian}</span>
                  </div>
                  {c.example&&<div style={{ color:C.muted,fontSize:13,lineHeight:1.6 }}>{c.example}</div>}
                </div>
              ))}
            </div>
          </div>

          <div style={S.card}>
            <div style={{ fontWeight:700,fontSize:18,marginBottom:14 }}>📚 Блогийн жишээ</div>
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
              {posts.slice(0,3).map(p=>(
                <div key={p.id} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px" }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap" }}>
                    <span style={S.tag(C.accentL)}>{p.tag}</span>
                    <span style={{ color:C.dim,fontSize:12 }}>{p.readTime} мин</span>
                  </div>
                  <div style={{ fontWeight:700,marginBottom:6,lineHeight:1.4 }}>{p.title}</div>
                  <div style={{ color:C.muted,fontSize:13 }}>{p.titleDe||"Герман хэлний practical тайлбар"}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // HOME
  // ══════════════════════════════════════════════════════════
  if(view==="home") {
    const nextMilestone = MILESTONES.find(m=>!earnedMilestones.includes(m.id));
    const milestoneProgress = nextMilestone ? Math.min(100,Math.round((totalLearned/nextMilestone.count)*100)) : 100;
    return(
      <div style={S.wrap}><NavBar/><TrialBanner/><Toast/><MilestonePop/><PaywallModal/><AdminModal/><ResetPasswordModal/>
        <div style={S.page}>
          {/* Hero greeting */}
          <div style={{ background:`linear-gradient(135deg,#1a1040,#0d1a35)`,border:`1px solid ${C.border}`,borderRadius:20,padding:"24px 24px 20px",marginBottom:20,position:"relative",overflow:"hidden" }}>
            <div style={{ position:"absolute",top:-30,right:-30,width:160,height:160,background:`radial-gradient(${C.accent}30,transparent 70%)`,borderRadius:"50%" }} />
            <div style={{ fontSize:13,color:C.muted,marginBottom:6 }}>Сайн байна уу,</div>
            <div style={{ fontSize:24,fontWeight:800,marginBottom:14 }}>{user?.name || user?.user_metadata?.name || user?.email?.split("@")[0] || "Хэрэглэгч"} 👋</div>
            <XPBar xp={xp} level={level} nextLevelXp={nextLevelXp} />
            <div style={{ display:"flex",gap:8,marginTop:12,flexWrap:"wrap" }}>
              {isPremium?<span style={{ ...S.tag(C.gold),padding:"5px 12px" }}>★ Premium хэрэглэгч</span>:<span style={{ fontSize:12,color:trialExpired?C.red:C.muted }}>{trialExpired?"⏰ Туршилт дууссан":`🕐 ${trialDaysLeft} өдрийн туршилт`}</span>}
            </div>
          </div>

          {/* Word count big display */}
          <div style={{ background:`linear-gradient(135deg,${C.accent}20,${C.accentL}10)`,border:`1px solid ${C.accent}40`,borderRadius:16,padding:"20px 24px",marginBottom:16,display:"flex",alignItems:"center",gap:20 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13,color:C.muted,marginBottom:4 }}>Нийт суралцсан үгс</div>
              <div style={{ fontSize:48,fontWeight:900,color:C.text,lineHeight:1 }}>{totalLearned}</div>
              <div style={{ fontSize:12,color:C.accentL,marginTop:4 }}>үг · {cards.filter(c=>c.interval>=7).length} урт хугацааны санахуйд</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <ProgressRing pct={milestoneProgress} size={70} stroke={6} color={C.gold} />
              <div style={{ position:"relative",marginTop:-64,height:64,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20 }}>{nextMilestone?.emoji||"🌟"}</div>
              <div style={{ fontSize:10,color:C.muted,marginTop:4 }}>{nextMilestone?`${nextMilestone.count-totalLearned} үлдлээ`:"Бүгд дууслаа!"}</div>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16 }}>
            <StatCard icon="📥" label="Давтах" value={dueCards.length} color={C.accentL} />
            <StatCard icon="🃏" label="Нийт карт" value={cards.length} color={C.text} />
            <StatCard icon="⚡" label="XP" value={xp} color={C.gold} />
            <StatCard icon="📖" label="Нийтлэл" value={totalBlogRead} color={C.teal} sub={`/${posts.length}`} />
          </div>

          {/* Study CTA */}
          <button style={{ ...S.btn(`linear-gradient(135deg,${C.accent},${C.accentL})`),width:"100%",padding:16,fontSize:16,borderRadius:14,marginBottom:12,boxShadow:`0 8px 24px ${C.accent}40` }}
            onClick={startStudy}>{dueCards.length>0?`📚 Судлах эхлэх — ${dueCards.length} карт тань хүлээж байна`:"✅ Өнөөдрийн бүх карт давтагдсан!"}</button>

          {/* Milestone progress */}
          {nextMilestone&&(
            <div style={{ ...S.card,marginBottom:16 }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
                <div style={{ fontWeight:600,fontSize:14 }}>🏆 Дараагийн шагнал</div>
                <span style={{ ...S.tag(C.gold) }}>+{nextMilestone.xp} XP</span>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:8 }}>
                <span style={{ fontSize:28 }}>{nextMilestone.emoji}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600,marginBottom:4 }}>{nextMilestone.title}</div>
                  <div style={{ height:6,background:C.border,borderRadius:3,overflow:"hidden" }}>
                    <div style={{ height:"100%",width:`${milestoneProgress}%`,background:`linear-gradient(90deg,${C.gold},${C.orange})`,borderRadius:3,transition:"width 0.5s" }} />
                  </div>
                  <div style={{ fontSize:12,color:C.muted,marginTop:4 }}>{totalLearned} / {nextMilestone.count} үг</div>
                </div>
              </div>
            </div>
          )}

          {/* Earned milestones trophies */}
          {earnedMilestones.length>0&&(
            <div style={S.card}>
              <div style={{ fontWeight:600,fontSize:14,marginBottom:12 }}>🏆 Олгосон трофейнүүд ({earnedMilestones.length}/{MILESTONES.length})</div>
              <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                {MILESTONES.map(m=>{
                  const earned=earnedMilestones.includes(m.id);
                  return(
                    <div key={m.id} title={`${m.title} — ${m.desc}`} style={{ textAlign:"center",background:earned?`linear-gradient(135deg,${C.gold}20,${C.orange}10)`:C.surface,border:`1px solid ${earned?C.gold+"60":C.border}`,borderRadius:14,padding:"12px 14px",minWidth:72,opacity:earned?1:0.35,transition:"all 0.3s" }}>
                      <div style={{ fontSize:24 }}>{m.emoji}</div>
                      <div style={{ fontSize:10,color:earned?C.gold:C.muted,marginTop:4,fontWeight:earned?700:400,lineHeight:1.3 }}>{m.title}</div>
                      {earned&&<div style={{ fontSize:9,color:C.orange,marginTop:2 }}>+{m.xp}XP</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // STUDY
  // ══════════════════════════════════════════════════════════
  if(view==="study"&&currentCard) {
    const btns=[
      {label:"Дахин",sub:nextLabel(currentCard,0),color:C.againC,q:0},
      {label:"Хэцүү", sub:nextLabel(currentCard,1),color:C.hardC, q:1},
      {label:"Зөв",   sub:nextLabel(currentCard,2),color:C.goodC, q:2},
      {label:"Амархан",sub:nextLabel(currentCard,3),color:C.easyC,q:3},
    ];
    return(
      <div style={S.wrap}><NavBar/><TrialBanner/><Toast/><MilestonePop/><PaywallModal/><AdminModal/><ResetPasswordModal/>
        <div style={{ ...S.page,maxWidth:640 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
            <div style={{ display:"flex",gap:6 }}>
              <span style={S.tag(C.red)}>↺{sessionStats.again}</span>
              <span style={S.tag(C.orange)}>H{sessionStats.hard}</span>
              <span style={S.tag(C.green)}>✓{sessionStats.good}</span>
              <span style={S.tag(C.blue)}>⚡{sessionStats.easy}</span>
            </div>
            <span style={{ color:C.muted,fontSize:13 }}>{dueCards.length} карт</span>
          </div>

          {/* CARD FRONT */}
          {!flipped?(
            <div onClick={()=>setFlipped(true)} style={{ background:`linear-gradient(160deg,${C.card},#1a1540)`,border:`1px solid ${C.border}`,borderRadius:24,padding:"40px 32px",minHeight:320,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",textAlign:"center",position:"relative",boxShadow:`0 20px 60px rgba(0,0,0,0.4)` }}>
              <div style={{ position:"absolute",top:16,right:18,display:"flex",gap:2 }}>{[...Array(Math.min(currentCard.repetitions||0,6))].map((_,i)=><span key={i} style={{ color:C.gold,fontSize:10 }}>★</span>)}</div>
              {currentCard.easeFactor&&currentCard.easeFactor!==2.5&&<div style={{ position:"absolute",top:16,left:16,fontSize:10,color:C.dim,background:C.surface,padding:"2px 7px",borderRadius:20,border:`1px solid ${C.border}` }}>EF {currentCard.easeFactor.toFixed(1)}</div>}
              <div style={{ fontSize:11,color:C.dim,textTransform:"uppercase",letterSpacing:"3px",marginBottom:20 }}>Герман үг</div>
              <div style={{ fontSize:52,fontWeight:900,color:C.text,letterSpacing:"-2px",marginBottom:10,fontFamily:"Georgia,serif" }}>{currentCard.german}</div>
              {currentCard.ipa&&<div style={{ fontSize:16,color:C.teal,fontFamily:"monospace",marginBottom:16,padding:"6px 14px",background:C.teal+"15",borderRadius:20,border:`1px solid ${C.teal}30` }}>{currentCard.ipa}</div>}
              {currentCard.hint&&<div style={{ padding:"10px 20px",background:C.accentL+"15",border:`1px solid ${C.accentL}30`,borderRadius:12,color:C.accentL,fontSize:13,maxWidth:380,lineHeight:1.5 }}>💡 {currentCard.hint}</div>}
              <div style={{ marginTop:24,color:C.dim,fontSize:12,letterSpacing:"0.5px" }}>↓ дарж хариулт харна уу</div>
            </div>
          ):(
            /* CARD BACK */
            <div style={{ background:`linear-gradient(160deg,#1a2620,#1a1d35)`,border:`1px solid ${C.green}40`,borderRadius:24,padding:"32px 28px",minHeight:320,boxShadow:`0 20px 60px rgba(0,0,0,0.4)` }}>
              <div style={{ textAlign:"center",marginBottom:20 }}>
                <div style={{ fontSize:16,color:C.dim,fontFamily:"Georgia,serif",fontStyle:"italic",marginBottom:6 }}>{currentCard.german}</div>
                {currentCard.ipa&&<div style={{ fontSize:14,color:C.teal,fontFamily:"monospace",marginBottom:10 }}>{currentCard.ipa}</div>}
                <div style={{ fontSize:40,fontWeight:800,color:C.mongolian,lineHeight:1.2 }}>{currentCard.mongolian}</div>
              </div>
              {currentCard.example&&(
                <div style={{ background:C.gold+"12",border:"none",borderLeft:`3px solid ${C.gold}`,borderRadius:"0 10px 10px 0",padding:"12px 16px",marginBottom:14 }}>
                  <div style={{ fontSize:10,color:C.gold,textTransform:"uppercase",letterSpacing:"1px",marginBottom:4 }}>Жишээ</div>
                  <div style={{ fontSize:14,fontStyle:"italic",lineHeight:1.6 }}>{currentCard.example}</div>
                </div>
              )}
              {currentCard.synonyms?.length>0&&(
                <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginBottom:12 }}>
                  <span style={{ fontSize:12,color:C.muted }}>≈</span>
                  {currentCard.synonyms.map(s=><span key={s} style={{ padding:"3px 10px",background:C.teal+"18",color:C.teal,borderRadius:20,fontSize:12,border:`1px solid ${C.teal}30` }}>{s}</span>)}
                </div>
              )}
              {currentCard.note&&<div style={{ padding:"10px 14px",background:C.surface,borderRadius:10,color:C.muted,fontSize:13,lineHeight:1.7,borderLeft:`3px solid ${C.mongolian}50` }}><span style={{ color:C.mongolian }}>📌 </span>{currentCard.note}</div>}
            </div>
          )}

          {/* Rating buttons */}
          {flipped&&(
            <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:14 }}>
              {btns.map(({label,sub,color,q})=>(
                <button key={q} onClick={()=>rateCard(q)} style={{ background:color+"20",border:`1.5px solid ${color}50`,borderRadius:14,padding:"12px 6px",cursor:"pointer",textAlign:"center",transition:"all 0.15s" }}
                  onMouseEnter={e=>{e.currentTarget.style.background=color+"38";}}
                  onMouseLeave={e=>{e.currentTarget.style.background=color+"20";}}>
                  <div style={{ fontSize:14,fontWeight:700,color }}>{label}</div>
                  <div style={{ fontSize:10,color:C.muted,marginTop:3 }}>{sub}</div>
                </button>
              ))}
            </div>
          )}
          <button style={{ ...S.ghost(),width:"100%",marginTop:10 }} onClick={()=>setView("home")}>← Буцах</button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // DECK
  // ══════════════════════════════════════════════════════════
  if(view==="deck") return(
    <div style={S.wrap}><NavBar/><TrialBanner/><Toast/><PaywallModal/><AdminModal/><ResetPasswordModal/>
      {showAddCard&&(
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }} onClick={e=>e.target===e.currentTarget&&setShowAddCard(false)}>
          <div style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:"26px 22px",width:"100%",maxWidth:520,maxHeight:"90vh",overflowY:"auto" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18 }}><h3 style={{ margin:0 }}>✨ Шинэ карт нэмэх</h3><button onClick={()=>setShowAddCard(false)} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,width:32,height:32,cursor:"pointer",color:C.muted,display:"flex",alignItems:"center",justifyContent:"center" }}>✕</button></div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
              <div>{S.lbl("🇩🇪 Герман",true)}<input value={addForm.german} onChange={e=>setAddForm(p=>({...p,german:e.target.value}))} placeholder="z.B. der Apfel" style={S.inp()} autoFocus /></div>
              <div>{S.lbl("🇲🇳 Монгол",true)}<input value={addForm.mongolian} onChange={e=>setAddForm(p=>({...p,mongolian:e.target.value}))} placeholder="Алим" style={S.inp()} /></div>
            </div>
            <div style={{ marginBottom:12 }}>{S.lbl("🔊 Дуудлага IPA",false)}<input value={addForm.ipa} onChange={e=>setAddForm(p=>({...p,ipa:e.target.value}))} placeholder="/ˈaʊ̯fl̩/" style={S.inp()} /></div>
            <div style={{ marginBottom:12 }}>{S.lbl("📝 Жишээ",false)}<input value={addForm.example} onChange={e=>setAddForm(p=>({...p,example:e.target.value}))} placeholder="Das ist ein Apfel." style={S.inp()} /></div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
              <div>{S.lbl("💡 Hint",false)}<input value={addForm.hint} onChange={e=>setAddForm(p=>({...p,hint:e.target.value}))} placeholder="Хүйс..." style={S.inp()} /></div>
              <div>{S.lbl("🔀 Синонимууд",false)}<input value={addForm.synonyms} onChange={e=>setAddForm(p=>({...p,synonyms:e.target.value}))} placeholder="Frucht, Obst" style={S.inp()} /></div>
            </div>
            <div style={{ marginBottom:18 }}>{S.lbl("📌 Тэмдэглэл",false)}<textarea value={addForm.note} onChange={e=>setAddForm(p=>({...p,note:e.target.value}))} rows={2} style={{ ...S.inp(),resize:"vertical" }} /></div>
            <div style={{ display:"flex",gap:8 }}>
              <button style={{ ...S.ghost(),flex:1 }} onClick={()=>setShowAddCard(false)}>Болих</button>
              <button style={{ ...S.btn(C.green),flex:2 }} onClick={()=>{if(!addForm.german||!addForm.mongolian)return;setCards(p=>[...p,{id:Date.now(),...addForm,synonyms:addForm.synonyms?addForm.synonyms.split(",").map(s=>s.trim()).filter(Boolean):[],interval:1,repetitions:0,easeFactor:2.5,due:Date.now()}]);setAddForm({german:"",mongolian:"",ipa:"",example:"",hint:"",synonyms:"",note:""});setShowAddCard(false);setToast("✅ Карт нэмэгдлээ!");}}>✅ Хадгалах</button>
            </div>
          </div>
        </div>
      )}
      <div style={S.page}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18 }}>
          <div><h2 style={{ margin:"0 0 2px",fontSize:20 }}>🃏 Карт сан</h2><div style={{ fontSize:13,color:C.muted }}>{cards.length} карт · {totalLearned} сурсан</div></div>
          <button style={S.btn(C.accent)} onClick={()=>{setShowAddCard(true);setAddForm({german:"",mongolian:"",ipa:"",example:"",hint:"",synonyms:"",note:""});}}>+ Нэмэх</button>
        </div>
        <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
          {cards.map(c=>(
            <div key={c.id} style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px",display:"flex",alignItems:"flex-start",gap:12 }}>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap" }}>
                  <span style={{ fontWeight:700,fontSize:16,fontFamily:"Georgia,serif" }}>{c.german}</span>
                  <span style={{ color:C.dim }}>→</span>
                  <span style={{ color:C.mongolian,fontWeight:600,fontSize:14 }}>{c.mongolian}</span>
                  {c.ipa&&<span style={{ color:C.teal,fontSize:12,fontFamily:"monospace",background:C.teal+"12",padding:"2px 8px",borderRadius:20 }}>{c.ipa}</span>}
                </div>
                {c.hint&&<div style={{ fontSize:11,color:C.accentL }}>💡 {c.hint}</div>}
                {c.synonyms?.length>0&&<div style={{ fontSize:11,color:C.muted }}>≈ {c.synonyms.join(", ")}</div>}
              </div>
              <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0 }}>
                {(c.repetitions||0)>0&&<div>{[...Array(Math.min(c.repetitions||0,6))].map((_,i)=><span key={i} style={{ color:C.gold,fontSize:10 }}>★</span>)}</div>}
                <span style={S.tag(c.due<=Date.now()?C.accentL:C.green)}>{c.due<=Date.now()?"Давтах":"Сурсан"}</span>
                {(c.interval||0)>1&&<span style={{ fontSize:10,color:C.dim }}>{c.interval}өд</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // BLOG LIST
  // ══════════════════════════════════════════════════════════
  if(view==="blog"&&!selectedPost) return(
    <div style={S.wrap}><NavBar/><TrialBanner/><Toast/><MilestonePop/><PaywallModal/><AdminModal/><ResetPasswordModal/>
      <div style={S.page}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:14 }}>
          <div><h2 style={{ margin:"0 0 4px",fontSize:24,fontWeight:800 }}>Хичээлүүд</h2><p style={{ color:C.muted,margin:0,fontSize:13 }}>Монголчуудад зориулсан гүнзгий Герман хэлний тайлбарууд</p></div>
          {!isPremium&&<div style={{ textAlign:"right" }}><div style={{ fontSize:10,color:C.muted }}>Үнэгүй үлдсэн</div><div style={{ fontWeight:800,fontSize:20,color:articlesRead>=FREE_ARTICLE_LIMIT?C.red:C.accentL }}>{Math.max(0,FREE_ARTICLE_LIMIT-articlesRead)}/{FREE_ARTICLE_LIMIT}</div></div>}
        </div>
        {/* Overall progress */}
        <div style={{ ...S.card,marginBottom:16,padding:"16px 18px" }}>
          <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,color:C.muted,marginBottom:8 }}><span>Нийт уншилтын ахиц</span><span style={{ color:C.text,fontWeight:600 }}>{posts.length?Math.round((totalBlogRead/posts.length)*100):0}%</span></div>
          <div style={{ height:6,background:C.border,borderRadius:3,overflow:"hidden",marginBottom:12 }}><div style={{ height:"100%",width:`${posts.length?(totalBlogRead/posts.length)*100:0}%`,background:`linear-gradient(90deg,${C.accent},${C.accentL})`,borderRadius:3,transition:"width 0.5s" }} /></div>
          <div style={{ display:"flex",gap:8,alignItems:"center" }}>
            {BLOG_AWARDS.map(a=>{const e=earnedBlogAwardIds.includes(a.id);return<span key={a.id} title={`${a.title} (+${a.xp}XP)`} style={{ fontSize:18,opacity:e?1:0.25,cursor:"help" }}>{a.emoji}</span>;})}
            <span style={{ color:C.muted,fontSize:12,marginLeft:"auto" }}>{earnedBlogAwardIds.length}/{BLOG_AWARDS.length} шагнал</span>
          </div>
        </div>

        <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
          {sortedPosts.map((post,idx)=>{
            const pct=readProgress[post.id]||0;
            const finished=pct>=100;
            const locked=!canRead(post);
            return(
              <div key={post.id} style={{ ...S.card,cursor:locked?"default":"pointer",transition:"all 0.2s",borderColor:finished?C.green+"40":C.border,opacity:finished?0.75:1 }}
                onClick={()=>openPost(post)}
                onMouseEnter={e=>{if(!locked){e.currentTarget.style.borderColor=C.accentL;e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 8px 30px rgba(108,92,231,0.15)`;} }}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=finished?C.green+"40":C.border;e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
                <div style={{ display:"flex",gap:14,alignItems:"flex-start" }}>
                  <div style={{ position:"relative",flexShrink:0,width:56,height:56 }}>
                    <ProgressRing pct={pct} size={56} stroke={4} color={finished?C.green:pct>0?C.accent:C.border} />
                    <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22 }}>{locked?"🔒":post.emoji}</div>
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ display:"flex",gap:6,alignItems:"center",marginBottom:6,flexWrap:"wrap" }}>
                      <span style={S.tag(C.accentL)}>{post.tag}</span>
                      {post.premium&&<span style={S.tag(C.gold)}>★ Premium</span>}
                      {finished&&<span style={S.tag(C.green)}>✓ Дууссан</span>}
                      {pct>0&&!finished&&<span style={S.tag(C.accent)}>{pct}%</span>}
                      {post.blocks?.some(b=>b.type==="audio")&&<span style={S.tag(C.teal)}>🎧</span>}
                      {post.blocks?.some(b=>b.type==="image")&&<span style={S.tag(C.muted)}>🖼️</span>}
                      <span style={{ fontSize:11,color:C.dim }}>{post.readTime}мин</span>
                    </div>
                    <h3 style={{ margin:"0 0 4px",fontSize:15,fontWeight:700,lineHeight:1.3,color:finished?C.dim:C.text }}>{post.title}</h3>
                    {post.titleDe&&<p style={{ margin:"0 0 8px",color:C.dim,fontSize:12,fontStyle:"italic" }}>{post.titleDe}</p>}
                    <div style={{ height:3,background:C.border,borderRadius:2 }}><div style={{ height:"100%",width:`${pct}%`,background:finished?C.green:C.accent,borderRadius:2,transition:"width 0.4s" }} /></div>
                  </div>
                  <span style={{ color:C.accentL,fontSize:18,alignSelf:"center",flexShrink:0 }}>›</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // BLOG POST
  // ══════════════════════════════════════════════════════════
  if(view==="blog"&&selectedPost){
    const pct=readProgress[selectedPost.id]||0;
    return(
      <div style={{ ...S.wrap,display:"flex",flexDirection:"column" }}><NavBar/><TrialBanner/><MilestonePop/><PaywallModal/><AdminModal/><ResetPasswordModal/>
        <div style={{ height:3,background:C.border,flexShrink:0 }}><div style={{ height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${C.accent},${C.accentL})`,transition:"width 0.3s" }} /></div>
        <div ref={contentRef} style={{ flex:1,overflowY:"auto",maxWidth:740,width:"100%",margin:"0 auto",padding:"20px 16px" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24 }}>
            <button style={S.ghost()} onClick={()=>setSelectedPost(null)}>← Хичээлд буцах</button>
            <div style={{ display:"flex",alignItems:"center",gap:8 }}>
              <div style={{ position:"relative",width:36,height:36 }}><ProgressRing pct={pct} size={36} stroke={3} color={pct===100?C.green:C.accent} /><div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:pct===100?C.green:C.accentL }}>{pct}%</div></div>
              <span style={{ fontSize:12,color:C.muted }}>{pct===100?"✓ Дууссан":"Уншиж байна"}</span>
            </div>
          </div>
          <div style={{ marginBottom:28 }}>
            <div style={{ display:"flex",gap:6,alignItems:"center",marginBottom:12,flexWrap:"wrap" }}>
              <span style={S.tag(C.accentL)}>{selectedPost.tag}</span>
              {selectedPost.premium&&<span style={S.tag(C.gold)}>★ Premium</span>}
              <span style={{ color:C.dim,fontSize:12 }}>{selectedPost.date} · {selectedPost.readTime} мин</span>
            </div>
            <h1 style={{ fontSize:26,fontWeight:800,margin:"0 0 8px",lineHeight:1.3 }}>{selectedPost.title}</h1>
            {selectedPost.titleDe&&<p style={{ color:C.muted,fontStyle:"italic",margin:"0 0 14px",fontSize:15 }}>{selectedPost.titleDe}</p>}
            <div style={{ display:"flex",alignItems:"center",gap:10 }}>
              <div style={{ flex:1,height:4,background:C.border,borderRadius:2 }}><div style={{ height:"100%",width:`${pct}%`,background:pct===100?C.green:C.accent,borderRadius:2,transition:"width 0.3s" }} /></div>
              <span style={{ fontSize:11,color:pct===100?C.green:C.accentL,fontWeight:700 }}>{pct}%</span>
            </div>
          </div>

          {/* Render blocks */}
          {(selectedPost.blocks||[]).map((block,i)=><BlockRenderer key={i} block={block} />)}

          <div style={{ marginTop:32,paddingTop:20,borderTop:`1px solid ${C.border}` }}>
            {pct<100
              ? <button style={{ ...S.btn(`linear-gradient(135deg,${C.accent},${C.accentL})`),width:"100%",padding:14,fontSize:15,borderRadius:12,boxShadow:`0 8px 24px ${C.accent}40` }} onClick={()=>finishReading(selectedPost.id)}>✅ Нийтлэлийг уншиж дуусгав · +20 XP</button>
              : <div style={{ padding:"20px",background:`linear-gradient(135deg,${C.green}15,${C.teal}10)`,borderRadius:14,border:`1px solid ${C.green}30`,textAlign:"center" }}><div style={{ fontSize:36,marginBottom:8 }}>🎉</div><div style={{ color:C.green,fontWeight:700,fontSize:16 }}>Нийтлэлийг амжилттай уншлаа!</div><div style={{ color:C.muted,fontSize:13,marginTop:4 }}>+20 XP нэмэгдлээ</div></div>}
          </div>
        </div>
      </div>
    );
  }

  return <div style={S.wrap}><NavBar/><div style={S.page}><button style={S.btn()} onClick={()=>setView("home")}>Нүүр</button></div></div>;
}
