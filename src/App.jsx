import { useState, useEffect, useRef } from "react"
import emailjs from "@emailjs/browser"
import * as XLSX from "xlsx"
import {
  Home, Users, BookOpen, Package, DollarSign, ClipboardList, BarChart2,
  Bell, Plus, Edit2, Trash2, Check, X, LogOut, AlertTriangle, ShoppingCart,
  ChevronRight, CheckCircle, Loader2, Settings, Upload, Download, Mail,
  ArrowUpAZ, ArrowDownAZ, Search, Truck, Calendar, Image as ImageIcon,
  SlidersHorizontal
} from "lucide-react"
import { supabase } from "./supabase.js"

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6)
const ts  = () => new Date().toISOString()
const today = () => new Date().toISOString().split("T")[0]
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString("pt-BR") : "—"
const fmtCur  = v => Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})
const monthKey    = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`
const monthLabel  = k => { const [y,m]=k.split("-"); return new Date(y,m-1,1).toLocaleDateString("pt-BR",{month:"long",year:"numeric"}) }
const MONTH = monthKey()
const COLORS = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#06B6D4","#84CC16"]
const UNITS  = ["unidade","caixa","resma","pacote","litro","kg","par","rolo"]

const YEAR_MIN = 2020
const YEAR_MAX = 2050
const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"]
const ALL_YEARS = Array.from({length: YEAR_MAX - YEAR_MIN + 1}, (_,i) => YEAR_MIN + i)

// Gera todas as chaves YYYY-MM de um ano
const monthsOfYear = year => Array.from({length:12}, (_,i) => `${year}-${String(i+1).padStart(2,"0")}`)

// Seletor de Mês/Ano dividido em dois <select> (ano + mês)
function MonthYearPicker({value, onChange, label, className=""}) {
  const [y, m] = value ? value.split("-") : [String(new Date().getFullYear()), String(new Date().getMonth()+1).padStart(2,"0")]
  const setYear  = newY => onChange(`${newY}-${m}`)
  const setMonth = newM => onChange(`${y}-${newM}`)
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {label && <label className="text-sm font-medium text-slate-700 flex-shrink-0">{label}</label>}
      <select value={y} onChange={e=>setYear(e.target.value)}
        className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
        {ALL_YEARS.map(yr=><option key={yr} value={yr}>{yr}</option>)}
      </select>
      <select value={m} onChange={e=>setMonth(e.target.value)}
        className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
        {MONTH_NAMES.map((name,i)=>{
          const mv = String(i+1).padStart(2,"0")
          return <option key={mv} value={mv}>{name}</option>
        })}
      </select>
    </div>
  )
}

// ─── Field map ────────────────────────────────────────────────────────────────
const FM = {
  turma_id:"turmaId", user_id:"userId", req_id:"reqId",
  stock_qty:"stockQty", manager_note:"managerNote",
  created_at:"createdAt", approved_at:"approvedAt", rejected_at:"rejectedAt",
  approved_by:"approvedBy", rejected_by:"rejectedBy",
  requisition_id:"requisitionId", delivered_at:"deliveredAt", created_by:"createdBy",
}
const FMR = Object.fromEntries(Object.entries(FM).map(([k,v])=>[v,k]))
const toApp = o => o ? Object.fromEntries(Object.entries(o).map(([k,v])=>[FM[k]||k,v])) : o
const toDB  = o => { if(!o) return o; const r={}; for(const [k,v] of Object.entries(o)) r[FMR[k]||k]=v; return r }

// ─── Supabase ─────────────────────────────────────────────────────────────────
const fetchAll = async (table, order=null) => {
  let q = supabase.from(table).select("*")
  if (order) q = q.order(order, {ascending:false})
  const {data,error} = await q; if(error) throw error
  return (data||[]).map(toApp)
}
const fetchSettings = async () => {
  const {data} = await supabase.from("settings").select("*")
  return Object.fromEntries((data||[]).map(r=>[r.key,r.value]))
}
const saveSetting = async (key,value) => {
  const {error} = await supabase.from("settings").upsert({key,value:String(value??"")}); if(error) throw error
}
const syncTable = async (table,oldArr,newArr) => {
  const del = oldArr.filter(o=>!newArr.find(n=>n.id===o.id))
  const add = newArr.filter(n=>!oldArr.find(o=>o.id===n.id))
  const upd = newArr.filter(n=>{ const o=oldArr.find(o=>o.id===n.id); return o&&JSON.stringify(o)!==JSON.stringify(n) })
  for(const x of del){ const {error}=await supabase.from(table).delete().eq("id",x.id); if(error) throw error }
  if(add.length){ const {error}=await supabase.from(table).insert(add.map(toDB)); if(error) throw error }
  for(const x of upd){ const {error}=await supabase.from(table).update(toDB(x)).eq("id",x.id); if(error) throw error }
}
const addDelivery = async d => {
  const {error}=await supabase.from("deliveries").insert(toDB(d)); if(error) throw error
}
const getDeliveries = async reqId => {
  const {data,error}=await supabase.from("deliveries").select("*").eq("requisition_id",reqId).order("delivered_at",{ascending:false})
  if(error) throw error; return (data||[]).map(toApp)
}

// ─── Email ────────────────────────────────────────────────────────────────────
const sendEmail = async (cfg, toEmail, toName, subject, message) => {
  if(!cfg?.emailjs_public_key||!cfg?.emailjs_service_id||!cfg?.emailjs_template_id) return false
  try {
    await emailjs.send(cfg.emailjs_service_id, cfg.emailjs_template_id,
      {to_email:toEmail, to_name:toName, subject, message}, cfg.emailjs_public_key)
    return true
  } catch(e){ console.error("EmailJS:",e); return false }
}
const emailManagers = async (managers,cfg,req,userName,turmaName) => {
  if(!cfg?.emailjs_public_key) return
  const lines = req.items.map(i=>`• ${i.qty}x ${i.name}`).join("\n")
  for(const m of managers.filter(u=>u.email)){
    await sendEmail(cfg, m.email, m.name,
      `[Almoxarifado] Nova requisição – ${turmaName}`,
      `Olá, ${m.name}!\n\n${userName} (${turmaName}) enviou uma nova requisição.\n\nItens:\n${lines}\n\nTotal: ${fmtCur(req.total)}${req.notes?`\n\nObservação: ${req.notes}`:""}\n\nAcesse o sistema para aprovar ou rejeitar.`)
  }
}
const emailUser = async (user,cfg,req,approved,note,managerName) => {
  if(!cfg?.emailjs_public_key||!user.email) return
  await sendEmail(cfg, user.email, user.name,
    `[Almoxarifado] Requisição ${approved?"aprovada":"rejeitada"}`,
    `Olá, ${user.name}!\n\nSua requisição foi ${approved?"APROVADA ✅":"REJEITADA ❌"} por ${managerName}.\n\nItens: ${req.items.map(i=>`${i.qty}x ${i.name}`).join(", ")}\nTotal: ${fmtCur(req.total)}${note?`\n\nNota do gerente: ${note}`:""}`
  )
}

// ─── Excel ────────────────────────────────────────────────────────────────────
const downloadTemplate = () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Nome *","Descricao","Unidade","Quantidade em Estoque *","Preco Unitario R$ *"],
    ["Papel A4","Resma 500 folhas","resma",20,25.90],
    ["Caneta Azul","Caixa c/50 esfero","caixa",8,18.50],
    ["Cola Bastao","Cola bastao 40g","unidade",30,4.90],
  ])
  ws["!cols"] = [{wch:25},{wch:30},{wch:12},{wch:25},{wch:22}]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb,ws,"Insumos")
  XLSX.writeFile(wb,"modelo_insumos.xlsx")
}
const parseExcel = async file => {
  const buf = await file.arrayBuffer()
  const wb  = XLSX.read(buf,{type:"buffer"})
  const ws  = wb.Sheets[wb.SheetNames[0]]
  const rows= XLSX.utils.sheet_to_json(ws,{header:1})
  return rows.slice(1).filter(r=>r[0]).map(r=>({
    id: uid(),
    name: String(r[0]||"").trim(),
    description: String(r[1]||"").trim(),
    unit: UNITS.includes(String(r[2]||"").trim()) ? String(r[2]).trim() : "unidade",
    stockQty: Number(r[3]||0),
    price: Number(r[4]||0),
  }))
}

// ─── Image resize ─────────────────────────────────────────────────────────────
const resizeLogo = file => new Promise(res => {
  const r = new FileReader()
  r.onload = e => {
    const img = new Image()
    img.onload = () => {
      const MAX=160, s=Math.min(1,MAX/Math.max(img.width,img.height))
      const c=document.createElement("canvas"); c.width=img.width*s; c.height=img.height*s
      c.getContext("2d").drawImage(img,0,0,c.width,c.height)
      res(c.toDataURL("image/png",0.9))
    }
    img.src = e.target.result
  }
  r.readAsDataURL(file)
})

// ─── Sort helper ──────────────────────────────────────────────────────────────
const sortAlpha = (arr, field, dir) =>
  [...arr].sort((a,b) => dir==="asc" ? String(a[field]||"").localeCompare(String(b[field]||""),"pt-BR") : String(b[field]||"").localeCompare(String(a[field]||""),"pt-BR"))

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Modal({title,onClose,children,wide=false}){
  return(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.55)"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide?"max-w-3xl":"max-w-md"} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-lg">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"><X size={18}/></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
function Btn({children,onClick,variant="primary",size="md",disabled=false,className="",type="button"}){
  const v={primary:"bg-blue-600 hover:bg-blue-700 text-white",secondary:"bg-slate-100 hover:bg-slate-200 text-slate-700",danger:"bg-red-600 hover:bg-red-700 text-white",success:"bg-emerald-600 hover:bg-emerald-700 text-white",ghost:"hover:bg-slate-100 text-slate-600",warning:"bg-amber-500 hover:bg-amber-600 text-white"}
  const s={sm:"px-3 py-1.5 text-xs",md:"px-4 py-2 text-sm",lg:"px-5 py-2.5 text-base"}
  return <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${v[variant]} ${s[size]} ${className}`}>{children}</button>
}
function Field({label,children,required,hint}){
  return <div className="space-y-1.5"><label className="text-sm font-medium text-slate-700">{label}{required&&<span className="text-red-500 ml-1">*</span>}</label>{hint&&<p className="text-xs text-slate-400">{hint}</p>}{children}</div>
}
function Inp(props){return <input {...props} className={`w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${props.className||""}`}/>}
function Sel({children,...props}){return <select {...props} className={`w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${props.className||""}`}>{children}</select>}
function Badge({children,color="slate"}){
  const c={slate:"bg-slate-100 text-slate-700",blue:"bg-blue-100 text-blue-700",green:"bg-emerald-100 text-emerald-700",red:"bg-red-100 text-red-700",yellow:"bg-amber-100 text-amber-700",purple:"bg-purple-100 text-purple-700"}
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c[color]}`}>{children}</span>
}
function Card({children,className=""}){return <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm ${className}`}>{children}</div>}
function PageWrap({children}){return <div className="p-6 md:p-8 min-h-full">{children}</div>}
function PageHeader({title,sub,action}){return <div className="flex items-start justify-between mb-6"><div><h1 className="text-2xl font-bold text-slate-800">{title}</h1>{sub&&<p className="text-sm text-slate-500 mt-1">{sub}</p>}</div>{action}</div>}
function EmptyState({icon:Icon,title,sub}){return <div className="flex flex-col items-center justify-center py-16 text-center"><div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4"><Icon size={24} className="text-slate-400"/></div><p className="text-slate-700 font-semibold">{title}</p>{sub&&<p className="text-slate-400 text-sm mt-1">{sub}</p>}</div>}
function SortBtn({dir,onToggle}){return <button onClick={onToggle} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition" title="Alternar ordenação">{dir==="asc"?<ArrowUpAZ size={16}/>:<ArrowDownAZ size={16}/>}</button>}
function SearchBar({value,onChange,placeholder="Buscar..."}){return <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><Inp value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="pl-8 max-w-xs"/></div>}

const statusCfg={pending:{label:"Pendente",color:"yellow"},approved:{label:"Aprovado",color:"green"},rejected:{label:"Rejeitado",color:"red"}}

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginScreen({users,settings}){
  const [email,setEmail]=useState(""); const [pw,setPw]=useState(""); const [err,setErr]=useState(""); const [loggingIn,setLoggingIn]=useState(false)
  const schoolName = settings?.school_name || "Maple Bear"
  const logo = settings?.school_logo
  const handle = async e => {
    e.preventDefault(); setLoggingIn(true)
    const u = users.find(u=>u.email.toLowerCase()===email.toLowerCase()&&u.password===pw)
    if(u) window.__loginUser(u); else { setErr("E-mail ou senha incorretos."); setLoggingIn(false) }
  }
  return(
    <div className="min-h-screen flex items-center justify-center p-4" style={{background:"linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)"}}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8">
        <div className="text-center mb-8">
          {logo ? <img src={logo} alt="logo" className="w-16 h-16 rounded-2xl object-contain mx-auto mb-4"/> :
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4"><Package size={28} className="text-white"/></div>}
          <h1 className="text-2xl font-bold text-slate-800">{schoolName}</h1>
          <p className="text-slate-500 text-sm mt-1">Sistema de Almoxarifado</p>
        </div>
        <form onSubmit={handle} className="space-y-4">
          <Field label="E-mail" required><Inp type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com" required/></Field>
          <Field label="Senha" required><Inp type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" required/></Field>
          {err&&<p className="text-sm text-red-600 text-center">{err}</p>}
          <Btn type="submit" className="w-full justify-center" disabled={loggingIn}>{loggingIn&&<Loader2 size={14} className="animate-spin"/>} Entrar</Btn>
        </form>
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({db,user,setPage,notifCount,settings}){
  const isManager=user.role==="manager"
  const myTurma=db.turmas.find(t=>t.id===user.turmaId)
  const budget=myTurma?db.budgets.find(b=>b.turmaId===myTurma.id&&b.month===MONTH):null
  const mySpent=myTurma?db.requisitions.filter(r=>r.turmaId===myTurma.id&&r.month===MONTH&&r.status!=="rejected").reduce((s,r)=>s+r.total,0):0
  const pending=db.requisitions.filter(r=>r.status==="pending").length
  const lowStock=db.insumos.filter(i=>i.stockQty<=5).length
  const recent=[...db.requisitions].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,6)
  const getU=id=>db.users.find(u=>u.id===id); const getT=id=>db.turmas.find(t=>t.id===id)
  return(
    <PageWrap>
      <PageHeader title={`Olá, ${user.name.split(" ")[0]}! 👋`} sub={`${monthLabel(MONTH)} · ${isManager?"Visão Gerencial":myTurma?.name||""}`}/>
      {isManager?(
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[{label:"Usuários",value:db.users.length,icon:Users,bg:"bg-blue-500",page:"usuarios"},
            {label:"Turmas ativas",value:db.turmas.length,icon:BookOpen,bg:"bg-purple-500",page:"turmas"},
            {label:"Aprovações pendentes",value:pending,icon:ClipboardList,bg:pending>0?"bg-amber-500":"bg-emerald-500",page:"aprovacoes"},
            {label:"Estoque baixo",value:lowStock,icon:AlertTriangle,bg:lowStock>0?"bg-red-500":"bg-emerald-500",page:"insumos"},
          ].map(s=>(
            <Card key={s.label} className="p-5 cursor-pointer hover:shadow-md transition" onClick={()=>setPage(s.page)}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${s.bg}`}><s.icon size={18} className="text-white"/></div>
              <p className="text-2xl font-bold text-slate-800">{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </Card>
          ))}
        </div>
      ):(
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Card className="p-5"><p className="text-xs text-slate-500 mb-1">Orçamento do mês</p><p className="text-2xl font-bold text-slate-800">{fmtCur(budget?.amount||0)}</p><p className="text-xs text-slate-400 mt-1">{myTurma?.name}</p></Card>
          <Card className="p-5"><p className="text-xs text-slate-500 mb-1">Saldo disponível</p><p className={`text-2xl font-bold ${(budget?.amount||0)-mySpent<0?"text-red-600":"text-emerald-600"}`}>{fmtCur((budget?.amount||0)-mySpent)}</p><p className="text-xs text-slate-400 mt-1">Utilizado: {fmtCur(mySpent)}</p></Card>
        </div>
      )}
      <Card>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Requisições Recentes</h2>
          <Btn variant="ghost" size="sm" onClick={()=>setPage(isManager?"aprovacoes":"minhasreqs")}>Ver todas <ChevronRight size={14}/></Btn>
        </div>
        {recent.length===0?<EmptyState icon={ClipboardList} title="Nenhuma requisição ainda"/>:
          <div className="divide-y divide-slate-50">
            {recent.map(r=>{const u=getU(r.userId);const t=getT(r.turmaId);const sc=statusCfg[r.status]; return(
              <div key={r.id} className="px-5 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-800 truncate">{u?.name} <span className="text-slate-400 font-normal">· {t?.name}</span></p><p className="text-xs text-slate-400">{fmtDate(r.createdAt)} · {r.items?.length||0} item(s)</p></div>
                <div className="text-right flex-shrink-0"><p className="text-sm font-semibold text-slate-800">{fmtCur(r.total)}</p><Badge color={sc?.color}>{sc?.label}</Badge></div>
              </div>
            )})}
          </div>
        }
      </Card>
      {!isManager&&<div className="mt-4"><Btn onClick={()=>setPage("requisicao")}><Plus size={16}/> Nova Requisição</Btn></div>}
      {isManager&&notifCount>0&&(
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
          <Bell size={18} className="text-amber-600 flex-shrink-0"/>
          <p className="text-sm text-amber-800">Você tem <strong>{notifCount}</strong> notificação(ões) não lida(s).</p>
          <Btn variant="secondary" size="sm" onClick={()=>setPage("notificacoes")} className="ml-auto flex-shrink-0">Ver</Btn>
        </div>
      )}
    </PageWrap>
  )
}

// ─── Configurações ────────────────────────────────────────────────────────────
function ConfiguracoesPage({db,saveKey,settings,reloadSettings}){
  const [tab,setTab]=useState("identidade")
  const [saving,setSaving]=useState(false)
  const [msg,setMsg]=useState("")
  const logoRef=useRef()

  // Identidade
  const [schoolName,setSchoolName]=useState(settings.school_name||"Maple Bear")
  const [logo,setLogo]=useState(settings.school_logo||"")

  // Email
  const [svcId,setSvcId]=useState(settings.emailjs_service_id||"")
  const [tplId,setTplId]=useState(settings.emailjs_template_id||"")
  const [pubKey,setPubKey]=useState(settings.emailjs_public_key||"")
  const [testEmail,setTestEmail]=useState("")
  const [testing,setTesting]=useState(false)

  // Orçamento padrão
  const [defBudget,setDefBudget]=useState(settings.default_budget_amount||"")
  const [applyMonth,setApplyMonth]=useState(MONTH)

  const saveIdentidade = async()=>{
    setSaving(true); setMsg("")
    await saveSetting("school_name",schoolName)
    if(logo) await saveSetting("school_logo",logo)
    await reloadSettings(); setMsg("Salvo com sucesso!"); setSaving(false)
  }
  const saveEmail = async()=>{
    setSaving(true); setMsg("")
    await saveSetting("emailjs_service_id",svcId)
    await saveSetting("emailjs_template_id",tplId)
    await saveSetting("emailjs_public_key",pubKey)
    await reloadSettings(); setMsg("Configuração de e-mail salva!"); setSaving(false)
  }
  const testEmailSend = async()=>{
    setTesting(true); setMsg("")
    const ok = await sendEmail({emailjs_service_id:svcId,emailjs_template_id:tplId,emailjs_public_key:pubKey},testEmail,"Gerente","[Teste] Almoxarifado","Este é um e-mail de teste do sistema de almoxarifado. Se você recebeu, a configuração está correta!")
    setMsg(ok?"E-mail de teste enviado com sucesso!":"Erro ao enviar. Verifique as credenciais EmailJS."); setTesting(false)
  }
  const applyDefaultBudget = async()=>{
    if(!defBudget||isNaN(Number(defBudget))) return setMsg("Informe um valor válido.")
    setSaving(true)
    await saveSetting("default_budget_amount",defBudget)
    const budgets=[...db.budgets]
    for(const t of db.turmas){
      const idx=budgets.findIndex(b=>b.turmaId===t.id&&b.month===applyMonth)
      if(idx>=0) budgets[idx]={...budgets[idx],amount:Number(defBudget)}
      else budgets.push({id:uid(),turmaId:t.id,month:applyMonth,amount:Number(defBudget)})
    }
    await saveKey("budgets",budgets)
    await reloadSettings(); setMsg(`Orçamento de ${fmtCur(defBudget)} aplicado a ${db.turmas.length} turma(s) para ${monthLabel(applyMonth)}!`); setSaving(false)
  }
  const handleLogoUpload = async e=>{
    const f=e.target.files[0]; if(!f) return
    const b64=await resizeLogo(f); setLogo(b64)
  }
  const removeLogo = async()=>{ await saveSetting("school_logo",""); setLogo(""); await reloadSettings() }

  const tabs=[{id:"identidade",label:"Identidade",icon:ImageIcon},{id:"email",label:"E-mail",icon:Mail},{id:"orcamento",label:"Orçamento Padrão",icon:DollarSign}]

  return(
    <PageWrap>
      <PageHeader title="Configurações" sub="Personalize o sistema da escola"/>
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>{setTab(t.id);setMsg("")}} className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${tab===t.id?"bg-blue-600 text-white":"bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <t.icon size={14}/>{t.label}
          </button>
        ))}
      </div>

      {tab==="identidade"&&(
        <Card className="p-6 max-w-lg space-y-5">
          <Field label="Nome da escola">
            <Inp value={schoolName} onChange={e=>setSchoolName(e.target.value)} placeholder="Ex: Maple Bear"/>
          </Field>
          <Field label="Logo da escola" hint="Recomendado: PNG ou JPG quadrado, fundo transparente. Será redimensionada para 160×160px.">
            <div className="flex items-center gap-4">
              {logo ? <img src={logo} alt="logo" className="w-16 h-16 rounded-xl object-contain border border-slate-200"/> :
                <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center"><ImageIcon size={24} className="text-slate-400"/></div>}
              <div className="flex gap-2 flex-col">
                <Btn size="sm" variant="secondary" onClick={()=>logoRef.current.click()}><Upload size={14}/> Enviar imagem</Btn>
                {logo&&<Btn size="sm" variant="ghost" className="text-red-500" onClick={removeLogo}>Remover logo</Btn>}
              </div>
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload}/>
            </div>
          </Field>
          {msg&&<p className="text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">{msg}</p>}
          <Btn onClick={saveIdentidade} disabled={saving}>{saving&&<Loader2 size={14} className="animate-spin"/>} Salvar identidade</Btn>
        </Card>
      )}

      {tab==="email"&&(
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
          <Card className="p-6 space-y-4">
            <h3 className="font-semibold text-slate-800">Credenciais EmailJS</h3>
            <Field label="Service ID" hint="Ex: service_abc123"><Inp value={svcId} onChange={e=>setSvcId(e.target.value)} placeholder="service_..."/></Field>
            <Field label="Template ID" hint="Ex: template_xyz789"><Inp value={tplId} onChange={e=>setTplId(e.target.value)} placeholder="template_..."/></Field>
            <Field label="Public Key" hint="Encontrado em Account > API Keys"><Inp value={pubKey} onChange={e=>setPubKey(e.target.value)} placeholder="Sua public key"/></Field>
            <div className="flex items-center gap-3 pt-2">
              <Field label="E-mail para teste"><Inp type="email" value={testEmail} onChange={e=>setTestEmail(e.target.value)} placeholder="gerente@gmail.com" className="w-48"/></Field>
              <Btn size="sm" variant="secondary" disabled={testing||!testEmail||!pubKey} onClick={testEmailSend} className="mt-6 flex-shrink-0">{testing&&<Loader2 size={12} className="animate-spin"/>} Testar</Btn>
            </div>
            {msg&&<p className={`text-sm px-3 py-2 rounded-lg ${msg.includes("sucesso")||msg.includes("Salvo")?"text-emerald-700 bg-emerald-50":"text-red-700 bg-red-50"}`}>{msg}</p>}
            <Btn onClick={saveEmail} disabled={saving}>{saving&&<Loader2 size={14} className="animate-spin"/>} Salvar configuração</Btn>
          </Card>
          <Card className="p-6 space-y-4 bg-slate-50 border-slate-200">
            <h3 className="font-semibold text-slate-800">Como configurar o EmailJS</h3>
            {[
              ["1","Acesse emailjs.com e crie uma conta gratuita"],
              ["2","Vá em Email Services → Add New Service → Gmail → conecte com o e-mail da escola"],
              ["3","Vá em Email Templates → Create New Template e use este conteúdo:"],
              ["4","Copie o Service ID, Template ID e Public Key (Account → API Keys) para os campos ao lado"],
            ].map(([n,t])=><div key={n} className="flex gap-3 text-sm"><span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs flex-shrink-0 font-bold">{n}</span><span className="text-slate-600">{t}</span></div>)}
            <div className="bg-white rounded-xl border border-slate-200 p-4 mt-2">
              <p className="text-xs font-semibold text-slate-500 mb-2">Modelo do template (campos obrigatórios):</p>
              <code className="text-xs text-slate-700 whitespace-pre-wrap block">{`To: {{to_email}}\nTo name: {{to_name}}\nSubject: {{subject}}\nBody: {{message}}`}</code>
            </div>
          </Card>
        </div>
      )}

      {tab==="orcamento"&&(
        <Card className="p-6 max-w-lg space-y-5">
          <h3 className="font-semibold text-slate-800">Orçamento padrão</h3>
          <p className="text-sm text-slate-500">Define um valor padrão e o aplica a todas as turmas de uma vez para o mês selecionado.</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Valor padrão (R$)" required><Inp type="number" min="0" step="0.01" value={defBudget} onChange={e=>setDefBudget(e.target.value)} placeholder="500,00"/></Field>
            <Field label="Mês de aplicação"><MonthYearPicker value={applyMonth} onChange={setApplyMonth}/></Field>
          </div>
          {db.turmas.length>0&&(
            <div className="p-3 bg-blue-50 rounded-xl text-sm text-blue-800">
              Isso aplicará <strong>{fmtCur(defBudget||0)}</strong> para <strong>{db.turmas.length} turma(s)</strong>: {db.turmas.map(t=>t.name).join(", ")}
            </div>
          )}
          {msg&&<p className={`text-sm px-3 py-2 rounded-lg ${msg.includes("!")?"text-emerald-700 bg-emerald-50":"text-red-700 bg-red-50"}`}>{msg}</p>}
          <Btn onClick={applyDefaultBudget} disabled={saving||!defBudget}>{saving&&<Loader2 size={14} className="animate-spin"/>}<DollarSign size={14}/> Aplicar a todas as turmas</Btn>
        </Card>
      )}
    </PageWrap>
  )
}

// ─── Usuários ─────────────────────────────────────────────────────────────────
function UsuariosPage({db,saveKey}){
  const [modal,setModal]=useState(null); const [form,setForm]=useState({name:"",email:"",password:"",role:"user",turmaId:""}); const [del,setDel]=useState(null); const [busy,setBusy]=useState(false)
  const [search,setSearch]=useState(""); const [sort,setSort]=useState("asc")
  const F=k=>e=>setForm(f=>({...f,[k]:e.target.value}))
  const filtered = sortAlpha(db.users.filter(u=>u.name.toLowerCase().includes(search.toLowerCase())||u.email.toLowerCase().includes(search.toLowerCase())),"name",sort)
  const save=async()=>{ setBusy(true); const users=[...db.users]; if(modal.mode==="add") users.push({...form,id:uid(),turmaId:form.turmaId||null}); else{const i=users.findIndex(u=>u.id===modal.data.id);users[i]={...users[i],...form,turmaId:form.turmaId||null}}; await saveKey("users",users); setModal(null); setBusy(false) }
  const remove=async id=>{ setBusy(true); await saveKey("users",db.users.filter(u=>u.id!==id)); setDel(null); setBusy(false) }
  return(
    <PageWrap>
      <PageHeader title="Usuários" sub={`${db.users.length} cadastrado(s)`} action={<Btn onClick={()=>{setForm({name:"",email:"",password:"",role:"user",turmaId:""});setModal({mode:"add"})}}><Plus size={16}/>Novo usuário</Btn>}/>
      <Card>
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nome ou e-mail..."/>
          <SortBtn dir={sort} onToggle={()=>setSort(s=>s==="asc"?"desc":"asc")}/>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-slate-100">{["Nome","E-mail","Perfil","Turma",""].map(h=><th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(u=>(
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold">{u.name[0]}</div><span className="text-sm font-medium text-slate-800">{u.name}</span></div></td>
                  <td className="px-5 py-3 text-sm text-slate-600">{u.email}</td>
                  <td className="px-5 py-3"><Badge color={u.role==="manager"?"purple":"blue"}>{u.role==="manager"?"Gerente":"Usuário"}</Badge></td>
                  <td className="px-5 py-3 text-sm text-slate-600">{db.turmas.find(t=>t.id===u.turmaId)?.name||"—"}</td>
                  <td className="px-5 py-3"><div className="flex items-center justify-end gap-1"><Btn variant="ghost" size="sm" onClick={()=>{setForm({name:u.name,email:u.email,password:u.password,role:u.role,turmaId:u.turmaId||""});setModal({mode:"edit",data:u})}}><Edit2 size={14}/></Btn><Btn variant="ghost" size="sm" onClick={()=>setDel(u)} className="text-red-500 hover:bg-red-50"><Trash2 size={14}/></Btn></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length===0&&<EmptyState icon={Users} title="Nenhum usuário encontrado"/>}
        </div>
      </Card>
      {modal&&(
        <Modal title={modal.mode==="add"?"Novo Usuário":"Editar Usuário"} onClose={()=>setModal(null)}>
          <div className="space-y-4">
            <Field label="Nome completo" required><Inp value={form.name} onChange={F("name")} placeholder="Ex: Profª Maria Silva"/></Field>
            <Field label="E-mail" required><Inp type="email" value={form.email} onChange={F("email")} placeholder="email@gmail.com"/></Field>
            <Field label="Senha" required><Inp value={form.password} onChange={F("password")} placeholder="Senha de acesso"/></Field>
            <Field label="Perfil" required><Sel value={form.role} onChange={F("role")}><option value="user">Usuário (Professor/Funcionário)</option><option value="manager">Gerente</option></Sel></Field>
            {form.role==="user"&&<Field label="Turma vinculada"><Sel value={form.turmaId} onChange={F("turmaId")}><option value="">Sem turma</option>{db.turmas.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</Sel></Field>}
            <div className="flex justify-end gap-2 pt-2"><Btn variant="secondary" onClick={()=>setModal(null)}>Cancelar</Btn><Btn onClick={save} disabled={!form.name||!form.email||!form.password||busy}>{modal.mode==="add"?"Criar":"Salvar"}</Btn></div>
          </div>
        </Modal>
      )}
      {del&&<Modal title="Excluir usuário" onClose={()=>setDel(null)}><p className="text-slate-600 mb-5">Excluir <strong>{del.name}</strong>?</p><div className="flex justify-end gap-2"><Btn variant="secondary" onClick={()=>setDel(null)}>Cancelar</Btn><Btn variant="danger" disabled={busy} onClick={()=>remove(del.id)}>Excluir</Btn></div></Modal>}
    </PageWrap>
  )
}

// ─── Turmas ───────────────────────────────────────────────────────────────────
function TurmasPage({db,saveKey}){
  const [modal,setModal]=useState(null); const [form,setForm]=useState({name:"",color:"#3B82F6"}); const [del,setDel]=useState(null); const [busy,setBusy]=useState(false)
  const [search,setSearch]=useState(""); const [sort,setSort]=useState("asc")
  const filtered = sortAlpha(db.turmas.filter(t=>t.name.toLowerCase().includes(search.toLowerCase())),"name",sort)
  const save=async()=>{ setBusy(true); const turmas=[...db.turmas]; if(modal.mode==="add") turmas.push({...form,id:uid()}); else{const i=turmas.findIndex(t=>t.id===modal.data.id);turmas[i]={...turmas[i],...form}}; await saveKey("turmas",turmas); setModal(null); setBusy(false) }
  return(
    <PageWrap>
      <PageHeader title="Turmas" sub={`${db.turmas.length} turma(s)`} action={<Btn onClick={()=>{setForm({name:"",color:"#3B82F6"});setModal({mode:"add"})}}><Plus size={16}/>Nova turma</Btn>}/>
      <div className="flex items-center gap-3 mb-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar turma..."/>
        <SortBtn dir={sort} onToggle={()=>setSort(s=>s==="asc"?"desc":"asc")}/>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(t=>{
          const budget=db.budgets.find(b=>b.turmaId===t.id&&b.month===MONTH)
          return(
            <Card key={t.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold" style={{background:t.color}}>{t.name[0]}</div><div><p className="font-semibold text-slate-800">{t.name}</p><p className="text-xs text-slate-500">{db.users.filter(u=>u.turmaId===t.id).length} usuário(s)</p></div></div>
                <div className="flex gap-1"><Btn variant="ghost" size="sm" onClick={()=>{setForm({name:t.name,color:t.color});setModal({mode:"edit",data:t})}}><Edit2 size={14}/></Btn><Btn variant="ghost" size="sm" onClick={()=>setDel(t)} className="text-red-500 hover:bg-red-50"><Trash2 size={14}/></Btn></div>
              </div>
              <div className="border-t border-slate-100 pt-3"><p className="text-xs text-slate-400">Orçamento {monthLabel(MONTH)}</p><p className="text-lg font-bold text-slate-800 mt-0.5">{budget?fmtCur(budget.amount):"—"}</p></div>
            </Card>
          )
        })}
        {filtered.length===0&&<div className="col-span-3"><EmptyState icon={BookOpen} title="Nenhuma turma encontrada"/></div>}
      </div>
      {modal&&(
        <Modal title={modal.mode==="add"?"Nova Turma":"Editar Turma"} onClose={()=>setModal(null)}>
          <div className="space-y-4">
            <Field label="Nome da turma" required><Inp value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Ex: Bear Care, Year 1..."/></Field>
            <Field label="Cor"><div className="flex gap-2 flex-wrap">{COLORS.map(c=><button key={c} onClick={()=>setForm(f=>({...f,color:c}))} className={`w-8 h-8 rounded-lg transition-all ${form.color===c?"ring-2 ring-offset-2 ring-slate-700 scale-110":""}`} style={{background:c}}/>)}</div></Field>
            <div className="flex justify-end gap-2 pt-2"><Btn variant="secondary" onClick={()=>setModal(null)}>Cancelar</Btn><Btn onClick={save} disabled={!form.name||busy}>{modal.mode==="add"?"Criar":"Salvar"}</Btn></div>
          </div>
        </Modal>
      )}
      {del&&<Modal title="Excluir turma" onClose={()=>setDel(null)}><p className="text-slate-600 mb-5">Excluir <strong>{del.name}</strong>?</p><div className="flex justify-end gap-2"><Btn variant="secondary" onClick={()=>setDel(null)}>Cancelar</Btn><Btn variant="danger" disabled={busy} onClick={async()=>{setBusy(true);await saveKey("turmas",db.turmas.filter(t=>t.id!==del.id));setDel(null);setBusy(false)}}>Excluir</Btn></div></Modal>}
    </PageWrap>
  )
}

// ─── Insumos ──────────────────────────────────────────────────────────────────
function InsumosPage({db,saveKey}){
  const [modal,setModal]=useState(null); const [form,setForm]=useState({name:"",description:"",unit:"unidade",stockQty:"",price:""}); const [del,setDel]=useState(null); const [busy,setBusy]=useState(false)
  const [search,setSearch]=useState(""); const [sort,setSort]=useState("asc")
  const [importModal,setImportModal]=useState(false); const [importRows,setImportRows]=useState([]); const [importing,setImporting]=useState(false)
  const fileRef=useRef()
  const filtered=sortAlpha(db.insumos.filter(i=>i.name.toLowerCase().includes(search.toLowerCase())||i.description?.toLowerCase().includes(search.toLowerCase())),"name",sort)
  const F=k=>e=>setForm(f=>({...f,[k]:e.target.value}))
  const save=async()=>{ setBusy(true); const ins=[...db.insumos]; const item={...form,stockQty:Number(form.stockQty),price:Number(form.price)}; if(modal.mode==="add") ins.push({...item,id:uid()}); else{const idx=ins.findIndex(x=>x.id===modal.data.id);ins[idx]={...ins[idx],...item}}; await saveKey("insumos",ins); setModal(null); setBusy(false) }
  const handleFile=async e=>{ const f=e.target.files[0]; if(!f) return; const rows=await parseExcel(f); setImportRows(rows); setImportModal(true); e.target.value="" }
  const confirmImport=async()=>{ setImporting(true); const ins=[...db.insumos]; for(const row of importRows){ const existing=ins.findIndex(i=>i.name.toLowerCase()===row.name.toLowerCase()); if(existing>=0) ins[existing]={...ins[existing],description:row.description,unit:row.unit,stockQty:row.stockQty,price:row.price}; else ins.push(row) }; await saveKey("insumos",ins); setImportModal(false); setImportRows([]); setImporting(false) }
  const stockColor=qty=>qty<=0?"red":qty<=5?"yellow":"green"
  return(
    <PageWrap>
      <PageHeader title="Insumos / Estoque" sub={`${db.insumos.length} item(s)`} action={
        <div className="flex gap-2">
          <Btn variant="secondary" size="sm" onClick={downloadTemplate}><Download size={14}/> Modelo Excel</Btn>
          <Btn variant="secondary" size="sm" onClick={()=>fileRef.current.click()}><Upload size={14}/> Importar Excel</Btn>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile}/>
          <Btn onClick={()=>{setForm({name:"",description:"",unit:"unidade",stockQty:"",price:""});setModal({mode:"add"})}}><Plus size={16}/>Novo insumo</Btn>
        </div>
      }/>
      <Card>
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar insumo..."/>
          <SortBtn dir={sort} onToggle={()=>setSort(s=>s==="asc"?"desc":"asc")}/>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-slate-100">{["Nome","Unidade","Estoque","Preço Unit.",""].map(h=><th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(i=>(
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3"><p className="text-sm font-medium text-slate-800">{i.name}</p>{i.description&&<p className="text-xs text-slate-400">{i.description}</p>}</td>
                  <td className="px-5 py-3 text-sm text-slate-600">{i.unit}</td>
                  <td className="px-5 py-3"><Badge color={stockColor(i.stockQty)}>{i.stockQty} {i.unit}</Badge></td>
                  <td className="px-5 py-3 text-sm font-semibold text-slate-800">{fmtCur(i.price)}</td>
                  <td className="px-5 py-3"><div className="flex items-center justify-end gap-1"><Btn variant="ghost" size="sm" onClick={()=>{setForm({name:i.name,description:i.description||"",unit:i.unit,stockQty:String(i.stockQty),price:String(i.price)});setModal({mode:"edit",data:i})}}><Edit2 size={14}/></Btn><Btn variant="ghost" size="sm" onClick={()=>setDel(i)} className="text-red-500 hover:bg-red-50"><Trash2 size={14}/></Btn></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length===0&&<EmptyState icon={Package} title="Nenhum insumo encontrado"/>}
        </div>
      </Card>

      {modal&&(
        <Modal title={modal.mode==="add"?"Novo Insumo":"Editar Insumo"} onClose={()=>setModal(null)}>
          <div className="space-y-4">
            <Field label="Nome" required><Inp value={form.name} onChange={F("name")} placeholder="Ex: Papel A4"/></Field>
            <Field label="Descrição"><Inp value={form.description} onChange={F("description")} placeholder="Ex: Resma 500 folhas"/></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unidade" required><Sel value={form.unit} onChange={F("unit")}>{UNITS.map(u=><option key={u}>{u}</option>)}</Sel></Field>
              <Field label="Qtde em estoque" required><Inp type="number" min="0" value={form.stockQty} onChange={F("stockQty")} placeholder="0"/></Field>
            </div>
            <Field label="Preço unitário (R$)" required><Inp type="number" min="0" step="0.01" value={form.price} onChange={F("price")} placeholder="0,00"/></Field>
            <div className="flex justify-end gap-2 pt-2"><Btn variant="secondary" onClick={()=>setModal(null)}>Cancelar</Btn><Btn onClick={save} disabled={!form.name||!form.stockQty||!form.price||busy}>{modal.mode==="add"?"Adicionar":"Salvar"}</Btn></div>
          </div>
        </Modal>
      )}

      {importModal&&(
        <Modal title={`Importar ${importRows.length} insumo(s) do Excel`} onClose={()=>setImportModal(false)} wide>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Itens existentes com o mesmo nome serão <strong>atualizados</strong>. Novos itens serão <strong>adicionados</strong>.</p>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50"><tr>{["Nome","Descrição","Unidade","Estoque","Preço"].map(h=><th key={h} className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {importRows.map((r,i)=>(
                    <tr key={i} className={db.insumos.find(x=>x.name.toLowerCase()===r.name.toLowerCase())?"bg-amber-50":"bg-emerald-50"}>
                      <td className="px-3 py-2 font-medium">{r.name} {db.insumos.find(x=>x.name.toLowerCase()===r.name.toLowerCase())&&<Badge color="yellow">atualizar</Badge>}</td>
                      <td className="px-3 py-2 text-slate-500">{r.description||"—"}</td>
                      <td className="px-3 py-2">{r.unit}</td>
                      <td className="px-3 py-2">{r.stockQty}</td>
                      <td className="px-3 py-2">{fmtCur(r.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 pt-2"><Btn variant="secondary" onClick={()=>setImportModal(false)}>Cancelar</Btn><Btn onClick={confirmImport} disabled={importing}>{importing&&<Loader2 size={14} className="animate-spin"/>} Confirmar importação</Btn></div>
          </div>
        </Modal>
      )}

      {del&&<Modal title="Excluir insumo" onClose={()=>setDel(null)}><p className="text-slate-600 mb-5">Excluir <strong>{del.name}</strong>?</p><div className="flex justify-end gap-2"><Btn variant="secondary" onClick={()=>setDel(null)}>Cancelar</Btn><Btn variant="danger" disabled={busy} onClick={async()=>{setBusy(true);await saveKey("insumos",db.insumos.filter(i=>i.id!==del.id));setDel(null);setBusy(false)}}>Excluir</Btn></div></Modal>}
    </PageWrap>
  )
}

// ─── Orçamentos ───────────────────────────────────────────────────────────────
function OrcamentosPage({db,saveKey}){
  const [selMonth,setSelMonth]=useState(MONTH); const [editing,setEditing]=useState({}); const [busy,setBusy]=useState(false)
  const getBudget=id=>db.budgets.find(b=>b.turmaId===id&&b.month===selMonth)
  const getSpent =id=>db.requisitions.filter(r=>r.turmaId===id&&r.month===selMonth&&r.status!=="rejected").reduce((s,r)=>s+r.total,0)
  const saveBudget=async(turmaId,amount)=>{ setBusy(true); const budgets=[...db.budgets]; const idx=budgets.findIndex(b=>b.turmaId===turmaId&&b.month===selMonth); if(idx>=0) budgets[idx]={...budgets[idx],amount:Number(amount)}; else budgets.push({id:uid(),turmaId,month:selMonth,amount:Number(amount)}); await saveKey("budgets",budgets); setEditing({}); setBusy(false) }
  const sorted=sortAlpha(db.turmas,"name","asc")
  return(
    <PageWrap>
      <PageHeader title="Orçamentos" sub="Orçamento mensal por turma"/>
      <div className="mb-6">
        <MonthYearPicker value={selMonth} onChange={setSelMonth} label="Mês de referência:"/>
      </div>
      <div className="space-y-3">
        {sorted.length===0&&<EmptyState icon={DollarSign} title="Nenhuma turma cadastrada"/>}
        {sorted.map(t=>{
          const budget=getBudget(t.id); const spent=getSpent(t.id); const amount=budget?.amount||0; const pct=amount>0?Math.min(100,(spent/amount)*100):0; const isEd=editing[t.id]!==undefined
          return(
            <Card key={t.id} className="p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0" style={{background:t.color}}>{t.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-slate-800">{t.name}</p>
                    <div className="flex items-center gap-2">
                      {isEd?(<><Inp type="number" value={editing[t.id]} onChange={e=>setEditing({...editing,[t.id]:e.target.value})} className="w-32 text-right" placeholder="R$ 0,00"/><Btn size="sm" disabled={busy} onClick={()=>saveBudget(t.id,editing[t.id])}><Check size={14}/></Btn><Btn size="sm" variant="secondary" onClick={()=>setEditing({})}><X size={14}/></Btn></>)
                        :(<><span className="text-sm font-bold text-slate-800">{fmtCur(amount)}</span><Btn size="sm" variant="secondary" onClick={()=>setEditing({...editing,[t.id]:String(amount||"")})}><Edit2 size={14}/> Editar</Btn></>)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{width:`${pct}%`,background:pct>=90?"#EF4444":pct>=70?"#F59E0B":"#10B981"}}/></div>
                    <span className="text-xs text-slate-500 flex-shrink-0">{fmtCur(spent)} / {fmtCur(amount)} ({Math.round(pct)}%)</span>
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </PageWrap>
  )
}

// ─── Nova Requisição ──────────────────────────────────────────────────────────
function RequisicaoPage({db,saveKey,user,settings}){
  const [items,setItems]=useState([]); const [notes,setNotes]=useState(""); const [submitted,setSubmitted]=useState(false); const [err,setErr]=useState(""); const [busy,setBusy]=useState(false)
  const myTurma=db.turmas.find(t=>t.id===user.turmaId)
  const budget=myTurma?db.budgets.find(b=>b.turmaId===myTurma.id&&b.month===MONTH):null
  const spent=myTurma?db.requisitions.filter(r=>r.turmaId===myTurma.id&&r.month===MONTH&&r.status!=="rejected").reduce((s,r)=>s+r.total,0):0
  const available=(budget?.amount||0)-spent; const total=items.reduce((s,i)=>s+i.qty*i.price,0)
  const addItem=ins=>{if(items.find(i=>i.insumoId===ins.id))return;setItems([...items,{insumoId:ins.id,name:ins.name,unit:ins.unit,stockQty:ins.stockQty,price:ins.price,qty:1}])}
  const updQty=(id,qty)=>setItems(items.map(i=>i.insumoId===id?{...i,qty:Math.max(1,Math.min(i.stockQty,qty))}:i))
  const remItem=id=>setItems(items.filter(i=>i.insumoId!==id))
  const submit=async()=>{
    setErr(""); if(!myTurma) return setErr("Você não está vinculado a nenhuma turma."); if(items.length===0) return setErr("Adicione pelo menos um item."); if(budget&&total>available) return setErr(`Total excede o saldo disponível (${fmtCur(available)}).`); setBusy(true)
    const req={id:uid(),userId:user.id,turmaId:myTurma.id,month:MONTH,items:items.map(i=>({insumoId:i.insumoId,name:i.name,qty:i.qty,unit:i.unit,unitPrice:i.price})),total,notes,status:"pending",createdAt:ts()}
    const notif={id:uid(),reqId:req.id,message:`${user.name} (${myTurma.name}) solicitou ${items.length} item(s) — Total: ${fmtCur(total)}`,read:false,createdAt:ts()}
    await saveKey("requisitions",[...db.requisitions,req])
    await saveKey("notifications",[...db.notifications,notif])
    await emailManagers(db.users.filter(u=>u.role==="manager"),settings,req,user.name,myTurma.name)
    setSubmitted(true); setBusy(false)
  }
  if(!myTurma) return <PageWrap><EmptyState icon={AlertTriangle} title="Turma não atribuída" sub="Solicite ao gerente que vincule você a uma turma."/></PageWrap>
  if(submitted) return <PageWrap><div className="max-w-md mx-auto text-center py-16"><div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle size={40} className="text-emerald-600"/></div><h2 className="text-xl font-bold text-slate-800 mb-2">Requisição enviada!</h2><p className="text-slate-500 mb-6">O gerente foi notificado e analisará em breve.</p><Btn onClick={()=>{setItems([]);setNotes("");setSubmitted(false)}}><Plus size={16}/> Nova requisição</Btn></div></PageWrap>
  const sortedInsumos=sortAlpha(db.insumos,"name","asc")
  return(
    <PageWrap>
      <PageHeader title="Nova Requisição" sub={`${myTurma.name} · ${monthLabel(MONTH)}`}/>
      <Card className="p-4 mb-6">
        <div className="flex items-center justify-between mb-2"><span className="text-sm font-medium text-slate-700">Saldo disponível</span><span className={`text-sm font-bold ${available<0?"text-red-600":"text-emerald-600"}`}>{fmtCur(available)}</span></div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{width:`${Math.max(0,Math.min(100,(available/(budget?.amount||1))*100))}%`}}/></div>
        <div className="flex justify-between text-xs text-slate-400 mt-1"><span>Utilizado: {fmtCur(spent)}</span><span>Orçamento: {fmtCur(budget?.amount||0)}</span></div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Catálogo de insumos</p>
          <Card><div className="max-h-96 overflow-y-auto divide-y divide-slate-50">{sortedInsumos.length===0&&<EmptyState icon={Package} title="Nenhum insumo cadastrado"/>}{sortedInsumos.map(ins=>{const inCart=!!items.find(i=>i.insumoId===ins.id);const oos=ins.stockQty<=0;return(<div key={ins.id} className={`px-4 py-3 flex items-center justify-between ${oos?"opacity-50":""}`}><div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-800">{ins.name}</p><p className="text-xs text-slate-400">{fmtCur(ins.price)}/{ins.unit} · Estoque: {ins.stockQty}</p></div><Btn size="sm" variant={inCart?"secondary":"primary"} disabled={oos} onClick={()=>inCart?remItem(ins.id):addItem(ins)}>{inCart?<><Check size={12}/> Adicionado</>:<><Plus size={12}/> Adicionar</>}</Btn></div>)})}</div></Card>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Itens selecionados</p>
          <Card className="mb-4">{items.length===0?<EmptyState icon={ShoppingCart} title="Nenhum item" sub="Adicione do catálogo ao lado"/>:<div className="divide-y divide-slate-50">{items.map(i=>(<div key={i.insumoId} className="px-4 py-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-medium text-slate-800">{i.name}</p><p className="text-xs text-slate-400">{fmtCur(i.price)}/{i.unit}</p></div><button onClick={()=>remItem(i.insumoId)} className="text-slate-300 hover:text-red-500 transition p-1"><X size={14}/></button></div><div className="flex items-center justify-between mt-2"><div className="flex items-center gap-2"><button onClick={()=>updQty(i.insumoId,i.qty-1)} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-700">−</button><span className="w-8 text-center text-sm font-semibold">{i.qty}</span><button onClick={()=>updQty(i.insumoId,i.qty+1)} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-700">+</button><span className="text-xs text-slate-400">máx {i.stockQty}</span></div><span className="text-sm font-semibold text-slate-800">{fmtCur(i.qty*i.price)}</span></div></div>))}</div>}</Card>
          <Field label="Observações"><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Justificativa ou observação (opcional)..."/></Field>
          {err&&<div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex gap-2"><AlertTriangle size={16} className="flex-shrink-0 mt-0.5"/>{err}</div>}
          <div className="mt-4 p-4 bg-slate-50 rounded-xl"><div className="flex justify-between text-sm mb-1"><span className="text-slate-600">Total</span><span className={`font-bold ${budget&&total>available?"text-red-600":"text-slate-800"}`}>{fmtCur(total)}</span></div>{budget&&<div className="flex justify-between text-xs text-slate-400"><span>Saldo após aprovação</span><span className={available-total<0?"text-red-500":""}>{fmtCur(available-total)}</span></div>}</div>
          <Btn className="w-full justify-center mt-4" onClick={submit} disabled={items.length===0||busy}>{busy?<Loader2 size={16} className="animate-spin"/>:<ClipboardList size={16}/>} Enviar Requisição</Btn>
        </div>
      </div>
    </PageWrap>
  )
}

// ─── Minhas Requisições ────────────────────────────────────────────────────────
function MinhasReqsPage({db,user}){
  const myReqs=[...db.requisitions].filter(r=>r.userId===user.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
  const [detail,setDetail]=useState(null); const [deliveries,setDeliveries]=useState([]); const [loadingDel,setLoadingDel]=useState(false)
  const openDetail=async r=>{ setDetail(r); if(r.status==="approved"){ setLoadingDel(true); const d=await getDeliveries(r.id); setDeliveries(d); setLoadingDel(false) } else setDeliveries([]) }
  const getManagerName=id=>db.users.find(u=>u.id===id)?.name||"Gerente"
  return(
    <PageWrap>
      <PageHeader title="Minhas Requisições" sub={`${myReqs.length} solicitação(ões)`}/>
      <Card>{myReqs.length===0?<EmptyState icon={ClipboardList} title="Nenhuma requisição ainda"/>:
        <div className="divide-y divide-slate-50">{myReqs.map(r=>{const sc=statusCfg[r.status]; return(
          <div key={r.id} className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50" onClick={()=>openDetail(r)}>
            <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-800">{fmtDate(r.createdAt)}</p><p className="text-xs text-slate-400 mt-0.5">{r.items?.length||0} item(s): {r.items?.map(i=>i.name).join(", ")}</p>{r.managerNote&&<p className="text-xs text-amber-700 mt-0.5 italic">Nota: {r.managerNote}</p>}</div>
            <div className="text-right flex-shrink-0"><p className="text-sm font-bold text-slate-800">{fmtCur(r.total)}</p><Badge color={sc?.color}>{sc?.label}</Badge></div>
          </div>
        )})}
      </div>}
      </Card>
      {detail&&(
        <Modal title="Detalhes da Requisição" onClose={()=>setDetail(null)} wide>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-400">Data: </span><strong>{fmtDate(detail.createdAt)}</strong></div>
              <div className="flex items-center gap-2"><span className="text-slate-400">Status: </span><Badge color={statusCfg[detail.status]?.color}>{statusCfg[detail.status]?.label}</Badge></div>
              {detail.approvedBy&&<div><span className="text-slate-400">Aprovado por: </span><strong>{getManagerName(detail.approvedBy)}</strong></div>}
              {detail.rejectedBy&&<div><span className="text-slate-400">Rejeitado por: </span><strong>{getManagerName(detail.rejectedBy)}</strong></div>}
            </div>
            <hr className="border-slate-100"/>
            {detail.items?.map((i,idx)=><div key={idx} className="flex justify-between text-sm bg-slate-50 px-3 py-2 rounded-lg"><span>{i.qty}x {i.name} ({i.unit})</span><span className="font-semibold">{fmtCur(i.qty*(i.unitPrice||0))}</span></div>)}
            <div className="flex justify-between font-bold text-sm border-t border-slate-100 pt-2"><span>Total</span><span>{fmtCur(detail.total)}</span></div>
            {detail.notes&&<p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl"><strong>Obs:</strong> {detail.notes}</p>}
            {detail.managerNote&&<p className="text-sm text-amber-800 bg-amber-50 p-3 rounded-xl"><strong>Nota do gerente:</strong> {detail.managerNote}</p>}
            {detail.status==="approved"&&(
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 mt-4">Registros de Entrega</p>
                {loadingDel?<div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-slate-400"/></div>:
                  deliveries.length===0?<p className="text-sm text-slate-400 italic">Nenhuma entrega registrada ainda.</p>:
                  <div className="space-y-2">{deliveries.map(d=>(
                    <div key={d.id} className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2 mb-1"><Truck size={14} className="text-emerald-600"/><span className="text-sm font-semibold text-emerald-800">Entregue em {fmtDate(d.deliveredAt)}</span></div>
                      <p className="text-xs text-emerald-700">{d.items?.map(i=>`${i.qty}x ${i.name}`).join(", ")}</p>
                      {d.notes&&<p className="text-xs text-emerald-600 mt-1 italic">{d.notes}</p>}
                    </div>
                  ))}</div>
                }
              </div>
            )}
          </div>
        </Modal>
      )}
    </PageWrap>
  )
}

// ─── Aprovações ───────────────────────────────────────────────────────────────
function AprovacoesPage({db,saveKey,user,settings}){
  const [filter,setFilter]=useState("pending"); const [detail,setDetail]=useState(null); const [noteText,setNoteText]=useState(""); const [busy,setBusy]=useState(false)
  const [deliveries,setDeliveries]=useState([]); const [loadingDel,setLoadingDel]=useState(false); const [delivModal,setDelivModal]=useState(false)
  const [delivForm,setDelivForm]=useState({deliveredAt:today(),notes:"",items:[]})
  const filtered=db.requisitions.filter(r=>filter==="all"?true:r.status===filter).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
  const getU=id=>db.users.find(u=>u.id===id); const getT=id=>db.turmas.find(t=>t.id===id)

  const openDetail=async r=>{ setDetail(r); setNoteText(r.managerNote||""); if(r.status==="approved"){ setLoadingDel(true); const d=await getDeliveries(r.id); setDeliveries(d); setLoadingDel(false) } else setDeliveries([]) }
  const approve=async req=>{ setBusy(true); const insumos=db.insumos.map(i=>{const item=req.items?.find(x=>x.insumoId===i.id);return item?{...i,stockQty:Math.max(0,i.stockQty-item.qty)}:i}); await saveKey("insumos",insumos); await saveKey("requisitions",db.requisitions.map(r=>r.id===req.id?{...r,status:"approved",managerNote:noteText,approvedBy:user.id,approvedAt:ts()}:r))
    const notif={id:uid(),reqId:req.id,message:`Requisição de ${getU(req.userId)?.name} foi APROVADA por ${user.name}`,read:false,createdAt:ts()}
    await saveKey("notifications",[...db.notifications,notif])
    const reqUser=getU(req.userId); await emailUser(reqUser,settings,req,true,noteText,user.name)
    setDetail(null); setNoteText(""); setBusy(false) }
  const reject=async req=>{ setBusy(true); await saveKey("requisitions",db.requisitions.map(r=>r.id===req.id?{...r,status:"rejected",managerNote:noteText,rejectedBy:user.id,rejectedAt:ts()}:r))
    const notif={id:uid(),reqId:req.id,message:`Requisição de ${getU(req.userId)?.name} foi REJEITADA por ${user.name}`,read:false,createdAt:ts()}
    await saveKey("notifications",[...db.notifications,notif])
    const reqUser=getU(req.userId); await emailUser(reqUser,settings,req,false,noteText,user.name)
    setDetail(null); setNoteText(""); setBusy(false) }

  const openDelivModal=()=>{ setDelivForm({deliveredAt:today(),notes:"",items:detail.items?.map(i=>({...i,delivQty:i.qty}))||[]}); setDelivModal(true) }
  const saveDelivery=async()=>{ setBusy(true); const d={id:uid(),requisitionId:detail.id,items:delivForm.items.map(i=>({insumoId:i.insumoId,name:i.name,unit:i.unit,qty:i.delivQty})),deliveredAt:delivForm.deliveredAt,notes:delivForm.notes,createdBy:user.id,createdAt:ts()}; await addDelivery(d); const updated=await getDeliveries(detail.id); setDeliveries(updated); setDelivModal(false); setBusy(false) }
  const getManagerName=id=>db.users.find(u=>u.id===id)?.name||"Gerente"

  return(
    <PageWrap>
      <PageHeader title="Aprovações" sub="Analise as requisições de material"/>
      <div className="flex gap-2 mb-6 flex-wrap">
        {[{k:"pending",l:"Pendentes"},{k:"approved",l:"Aprovados"},{k:"rejected",l:"Rejeitados"},{k:"all",l:"Todos"}].map(f=>(
          <button key={f.k} onClick={()=>setFilter(f.k)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${filter===f.k?"bg-blue-600 text-white":"bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{f.l} {f.k!=="all"&&<span className="ml-1 text-xs opacity-70">{db.requisitions.filter(r=>r.status===f.k).length}</span>}</button>
        ))}
      </div>
      <Card>{filtered.length===0?<EmptyState icon={ClipboardList} title="Nenhuma requisição" sub="Nenhuma neste filtro"/>:
        <div className="divide-y divide-slate-50">{filtered.map(r=>{const u=getU(r.userId);const t=getT(r.turmaId);const sc=statusCfg[r.status]; return(
          <div key={r.id} className="px-5 py-4 hover:bg-slate-50 cursor-pointer" onClick={()=>openDetail(r)}>
            <div className="flex items-start gap-4">
              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm flex-shrink-0">{u?.name[0]||"?"}</div>
              <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-800">{u?.name}</p><p className="text-xs text-slate-500">{t?.name} · {fmtDate(r.createdAt)}</p><p className="text-xs text-slate-400 mt-0.5">{r.items?.map(i=>`${i.qty}× ${i.name}`).join(", ")}</p>
                {(r.approvedBy||r.rejectedBy)&&<p className="text-xs text-slate-400 mt-0.5">{r.approvedBy?"Aprovado":"Rejeitado"} por: {getManagerName(r.approvedBy||r.rejectedBy)}</p>}
              </div>
              <div className="text-right flex-shrink-0"><p className="text-sm font-bold text-slate-800">{fmtCur(r.total)}</p><Badge color={sc?.color}>{sc?.label}</Badge></div>
            </div>
          </div>
        )})}
      </div>}
      </Card>

      {detail&&(
        <Modal title="Analisar Requisição" onClose={()=>setDetail(null)} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-400">Solicitante: </span><strong>{getU(detail.userId)?.name}</strong></div>
              <div><span className="text-slate-400">Turma: </span><strong>{getT(detail.turmaId)?.name}</strong></div>
              <div><span className="text-slate-400">Data: </span><strong>{fmtDate(detail.createdAt)}</strong></div>
              <div className="flex items-center gap-2"><span className="text-slate-400">Status: </span><Badge color={statusCfg[detail.status]?.color}>{statusCfg[detail.status]?.label}</Badge></div>
              {detail.approvedBy&&<div className="col-span-2 p-2 bg-emerald-50 rounded-lg text-emerald-800 text-xs"><strong>Aprovado por:</strong> {getManagerName(detail.approvedBy)} em {fmtDate(detail.approvedAt)}</div>}
              {detail.rejectedBy&&<div className="col-span-2 p-2 bg-red-50 rounded-lg text-red-800 text-xs"><strong>Rejeitado por:</strong> {getManagerName(detail.rejectedBy)} em {fmtDate(detail.rejectedAt)}</div>}
            </div>
            <hr className="border-slate-100"/>
            <table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-400"><th className="py-1">Item</th><th>Qtde</th><th>Unit.</th><th className="text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-slate-50">{detail.items?.map((i,idx)=><tr key={idx}><td className="py-2">{i.name}</td><td>{i.qty} {i.unit}</td><td>{fmtCur(i.unitPrice||0)}</td><td className="text-right font-semibold">{fmtCur(i.qty*(i.unitPrice||0))}</td></tr>)}</tbody>
            </table>
            <div className="flex justify-between font-bold text-sm border-t border-slate-100 pt-2"><span>Total</span><span>{fmtCur(detail.total)}</span></div>
            {detail.notes&&<p className="text-sm bg-slate-50 p-3 rounded-xl text-slate-600"><strong>Observação:</strong> {detail.notes}</p>}

            {detail.status==="approved"&&(
              <div>
                <div className="flex items-center justify-between mt-2 mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Entregas Registradas</p>
                  <Btn size="sm" variant="success" onClick={openDelivModal}><Truck size={12}/> Registrar entrega</Btn>
                </div>
                {loadingDel?<div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-slate-400"/></div>:
                  deliveries.length===0?<p className="text-sm text-slate-400 italic">Nenhuma entrega ainda.</p>:
                  <div className="space-y-2">{deliveries.map(d=>(
                    <div key={d.id} className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm">
                      <div className="flex items-center gap-2 mb-1"><Truck size={14} className="text-emerald-600"/><strong className="text-emerald-800">{fmtDate(d.deliveredAt)}</strong></div>
                      <p className="text-xs text-emerald-700">{d.items?.map(i=>`${i.qty}x ${i.name}`).join(", ")}</p>
                      {d.notes&&<p className="text-xs text-emerald-600 mt-1 italic">{d.notes}</p>}
                      <p className="text-xs text-emerald-500 mt-1">Registrado por: {getManagerName(d.createdBy)}</p>
                    </div>
                  ))}</div>
                }
              </div>
            )}

            {detail.status==="pending"&&(
              <>
                <Field label="Nota do gerente (opcional)"><Inp value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Justificativa de aprovação ou rejeição..."/></Field>
                <div className="flex justify-end gap-2 pt-2">
                  <Btn variant="secondary" onClick={()=>setDetail(null)}>Cancelar</Btn>
                  <Btn variant="danger" disabled={busy} onClick={()=>reject(detail)}>{busy?<Loader2 size={14} className="animate-spin"/>:<X size={14}/>} Rejeitar</Btn>
                  <Btn variant="success" disabled={busy} onClick={()=>approve(detail)}>{busy?<Loader2 size={14} className="animate-spin"/>:<Check size={14}/>} Aprovar</Btn>
                </div>
              </>
            )}
            {detail.status!=="pending"&&<div className="flex justify-end"><Btn variant="secondary" onClick={()=>setDetail(null)}>Fechar</Btn></div>}
          </div>
        </Modal>
      )}

      {delivModal&&detail&&(
        <Modal title="Registrar Entrega" onClose={()=>setDelivModal(false)}>
          <div className="space-y-4">
            <Field label="Data da entrega" required><Inp type="date" value={delivForm.deliveredAt} onChange={e=>setDelivForm(f=>({...f,deliveredAt:e.target.value}))}/></Field>
            <Field label="Itens entregues">
              <div className="space-y-2">
                {delivForm.items.map((item,idx)=>(
                  <div key={idx} className="flex items-center gap-3 bg-slate-50 px-3 py-2 rounded-lg">
                    <span className="flex-1 text-sm">{item.name}</span>
                    <span className="text-xs text-slate-400">{item.unit}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={()=>setDelivForm(f=>({...f,items:f.items.map((x,i)=>i===idx?{...x,delivQty:Math.max(0,x.delivQty-1)}:x)}))} className="w-6 h-6 rounded bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-xs font-bold">−</button>
                      <span className="w-8 text-center text-sm font-semibold">{item.delivQty}</span>
                      <button onClick={()=>setDelivForm(f=>({...f,items:f.items.map((x,i)=>i===idx?{...x,delivQty:Math.min(x.qty,x.delivQty+1)}:x)}))} className="w-6 h-6 rounded bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-xs font-bold">+</button>
                      <span className="text-xs text-slate-400">/ {item.qty}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Field>
            <Field label="Observações"><textarea value={delivForm.notes} onChange={e=>setDelivForm(f=>({...f,notes:e.target.value}))} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Ex: Item X chegou fora do prazo, aguardando complemento..."/></Field>
            <div className="flex justify-end gap-2"><Btn variant="secondary" onClick={()=>setDelivModal(false)}>Cancelar</Btn><Btn variant="success" disabled={busy} onClick={saveDelivery}>{busy&&<Loader2 size={14} className="animate-spin"/>}<Truck size={14}/> Registrar</Btn></div>
          </div>
        </Modal>
      )}
    </PageWrap>
  )
}

// ─── Notificações ─────────────────────────────────────────────────────────────
function NotificacoesPage({db,saveKey,setPage}){
  const notifs=[...db.notifications].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
  return(
    <PageWrap>
      <PageHeader title="Notificações" sub={`${db.notifications.filter(n=>!n.read).length} não lida(s)`} action={<Btn variant="secondary" onClick={()=>saveKey("notifications",db.notifications.map(n=>({...n,read:true})))}>Marcar todas como lidas</Btn>}/>
      <Card>{notifs.length===0?<EmptyState icon={Bell} title="Nenhuma notificação"/>:
        <div className="divide-y divide-slate-50">{notifs.map(n=>(
          <div key={n.id} className={`px-5 py-4 flex items-start gap-4 ${!n.read?"bg-blue-50/50":""}`}>
            <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${!n.read?"bg-blue-500":"bg-slate-200"}`}/>
            <div className="flex-1"><p className="text-sm text-slate-800">{n.message}</p><p className="text-xs text-slate-400 mt-1">{fmtDate(n.createdAt)}</p></div>
            <Btn size="sm" variant="ghost" onClick={()=>setPage("aprovacoes")}><ChevronRight size={14}/> Ver</Btn>
          </div>
        ))}</div>}
      </Card>
    </PageWrap>
  )
}

// ─── Relatórios ───────────────────────────────────────────────────────────────
function RelatoriosPage({db}){
  const [selMonth,setSelMonth]=useState(MONTH)
  const data=sortAlpha(db.turmas,"name","asc").map(t=>{
    const reqs=db.requisitions.filter(r=>r.turmaId===t.id&&r.month===selMonth)
    const approved=reqs.filter(r=>r.status==="approved"); const totalApproved=approved.reduce((s,r)=>s+r.total,0)
    const budget=db.budgets.find(b=>b.turmaId===t.id&&b.month===selMonth)
    const itemMap={}; for(const r of approved) for(const i of (r.items||[])){if(!itemMap[i.insumoId])itemMap[i.insumoId]={name:i.name,unit:i.unit,qty:0,total:0};itemMap[i.insumoId].qty+=i.qty;itemMap[i.insumoId].total+=i.qty*(i.unitPrice||0)}
    const getManagerName=id=>db.users.find(u=>u.id===id)?.name||"—"
    return{turma:t,reqs,approved,pending:reqs.filter(r=>r.status==="pending"),rejected:reqs.filter(r=>r.status==="rejected"),totalApproved,budget:budget?.amount||0,items:Object.values(itemMap),
      allReqs:reqs.map(r=>({...r,userName:db.users.find(u=>u.id===r.userId)?.name||"?",managerLabel:r.approvedBy?`Aprovado por ${getManagerName(r.approvedBy)}`:r.rejectedBy?`Rejeitado por ${getManagerName(r.rejectedBy)}`:""}))}
  }).filter(d=>d.reqs.length>0||d.budget>0)
  return(
    <PageWrap>
      <PageHeader title="Relatórios de Consumo" sub="Por turma com detalhe do solicitante"/>
      <div className="mb-6">
        <MonthYearPicker value={selMonth} onChange={setSelMonth} label="Mês:"/>
      </div>
      {data.length===0&&<EmptyState icon={BarChart2} title="Sem dados neste período"/>}
      <div className="space-y-6">{data.map(d=>{const pct=d.budget>0?Math.min(100,(d.totalApproved/d.budget)*100):0; return(
        <Card key={d.turma.id}>
          <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{background:d.turma.color}}>{d.turma.name[0]}</div>
            <div className="flex-1 min-w-0"><h3 className="font-bold text-slate-800">{d.turma.name}</h3><div className="flex items-center gap-3 mt-1"><div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${pct}%`,background:pct>=90?"#EF4444":pct>=70?"#F59E0B":"#10B981"}}/></div><span className="text-xs text-slate-500 flex-shrink-0">{fmtCur(d.totalApproved)} / {fmtCur(d.budget)}</span></div></div>
            <div className="flex gap-4 text-center"><div><p className="text-lg font-bold text-emerald-600">{d.approved.length}</p><p className="text-xs text-slate-400">Aprovado</p></div><div><p className="text-lg font-bold text-amber-500">{d.pending.length}</p><p className="text-xs text-slate-400">Pendente</p></div><div><p className="text-lg font-bold text-red-500">{d.rejected.length}</p><p className="text-xs text-slate-400">Rejeitado</p></div></div>
          </div>
          {d.items.length>0&&<div className="px-6 py-4 border-b border-slate-100"><p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Materiais consumidos (aprovados)</p><div className="grid grid-cols-2 md:grid-cols-3 gap-2">{d.items.map((i,idx)=><div key={idx} className="bg-slate-50 rounded-xl px-3 py-2 text-sm"><p className="font-medium text-slate-800">{i.name}</p><p className="text-xs text-slate-500">{i.qty} {i.unit} · {fmtCur(i.total)}</p></div>)}</div></div>}
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-50 text-left text-xs text-slate-400"><th className="px-6 py-2">Solicitante</th><th className="px-6 py-2">Data</th><th className="px-6 py-2">Itens</th><th className="px-6 py-2 text-right">Valor</th><th className="px-6 py-2 text-right">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-50">{d.allReqs.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(r=>(
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-6 py-2.5 font-medium text-slate-800">{r.userName}</td>
                <td className="px-6 py-2.5 text-slate-500">{fmtDate(r.createdAt)}</td>
                <td className="px-6 py-2.5 text-slate-500 text-xs">{r.items?.map(i=>`${i.qty}× ${i.name}`).join(", ")}</td>
                <td className="px-6 py-2.5 text-right font-semibold">{fmtCur(r.total)}</td>
                <td className="px-6 py-2.5 text-right"><div className="flex flex-col items-end gap-1"><Badge color={statusCfg[r.status]?.color}>{statusCfg[r.status]?.label}</Badge>{r.managerLabel&&<span className="text-xs text-slate-400">{r.managerLabel}</span>}</div></td>
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
      )})}</div>
    </PageWrap>
  )
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function App(){
  const [user,setUser]=useState(null); const [page,setPage]=useState("dashboard")
  const [db,setDb]=useState(null); const [loading,setLoading]=useState(true); const [dbError,setDbError]=useState(null)
  const [settings,setSettings]=useState({}); const [notifCount,setNotifCount]=useState(0)

  // Expose login for LoginScreen
  window.__loginUser = u => { setUser(u); setPage("dashboard") }

  const reload=async()=>{
    const [users,turmas,insumos,budgets,requisitions,notifications,cfg]=await Promise.all([
      fetchAll("users"),fetchAll("turmas"),fetchAll("insumos"),fetchAll("budgets"),
      fetchAll("requisitions","created_at"),fetchAll("notifications","created_at"),fetchSettings()
    ])
    setDb({users,turmas,insumos,budgets,requisitions,notifications})
    setSettings(cfg); setNotifCount(notifications.filter(n=>!n.read).length)
  }
  const reloadSettings=async()=>{ const cfg=await fetchSettings(); setSettings(cfg) }

  useEffect(()=>{
    reload().catch(e=>setDbError(e.message)).finally(()=>setLoading(false))
  },[])

  const saveKey=async(table,newArr)=>{ await syncTable(table,db[table]||[],newArr); await reload() }
  const saveSett=async(k,v)=>{ await saveSetting(k,v); await reloadSettings() }

  if(loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="text-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"/><p className="text-slate-500 text-sm">Conectando...</p></div></div>
  if(dbError) return <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6"><div className="max-w-md text-center"><AlertTriangle size={32} className="text-red-500 mx-auto mb-4"/><h2 className="text-xl font-bold text-slate-800 mb-2">Erro de conexão</h2><p className="text-slate-500 text-sm mb-4">Verifique as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY</p><pre className="text-xs bg-red-50 text-red-700 p-3 rounded-xl text-left overflow-auto">{dbError}</pre></div></div>
  if(!user||!db) return <LoginScreen users={db?.users||[]} settings={settings}/>

  const isManager=user.role==="manager"; const myTurma=db.turmas.find(t=>t.id===user.turmaId)
  const schoolName=settings.school_name||"Maple Bear"; const logo=settings.school_logo
  const props={db,saveKey,user,setPage,settings}

  const navItems=[
    {id:"dashboard",label:"Dashboard",icon:Home},
    ...(isManager?[
      {id:"usuarios",label:"Usuários",icon:Users},
      {id:"turmas",label:"Turmas",icon:BookOpen},
      {id:"insumos",label:"Insumos / Estoque",icon:Package},
      {id:"orcamentos",label:"Orçamentos",icon:DollarSign},
      {id:"aprovacoes",label:"Aprovações",icon:ClipboardList},
      {id:"relatorios",label:"Relatórios",icon:BarChart2},
      {id:"notificacoes",label:"Notificações",icon:Bell,badge:notifCount},
      {id:"configuracoes",label:"Configurações",icon:Settings},
    ]:[
      {id:"requisicao",label:"Nova Requisição",icon:Plus},
      {id:"minhasreqs",label:"Minhas Requisições",icon:ClipboardList},
    ]),
  ]

  const pageMap={
    dashboard:    <Dashboard {...props} notifCount={notifCount}/>,
    usuarios:     <UsuariosPage {...props}/>,
    turmas:       <TurmasPage {...props}/>,
    insumos:      <InsumosPage {...props}/>,
    orcamentos:   <OrcamentosPage {...props}/>,
    aprovacoes:   <AprovacoesPage {...props}/>,
    relatorios:   <RelatoriosPage {...props}/>,
    notificacoes: <NotificacoesPage {...props} setPage={setPage}/>,
    configuracoes:<ConfiguracoesPage {...props} saveKey={saveKey} reloadSettings={reloadSettings} saveSetting={saveSett}/>,
    requisicao:   <RequisicaoPage {...props}/>,
    minhasreqs:   <MinhasReqsPage {...props}/>,
  }

  return(
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <aside className="w-60 flex flex-col flex-shrink-0" style={{background:"#0F2744"}}>
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            {logo?<img src={logo} alt="logo" className="w-9 h-9 rounded-xl object-contain bg-white/10 p-0.5 flex-shrink-0"/>:<div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0"><Package size={18} className="text-white"/></div>}
            <div><p className="text-white text-xs font-bold leading-tight">{schoolName}</p><p className="text-blue-300 text-[10px] font-medium">Almoxarifado</p></div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map(item=>{const Icon=item.icon;const active=page===item.id; return(
            <button key={item.id} onClick={()=>setPage(item.id)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${active?"bg-blue-600 text-white":"text-blue-200 hover:text-white hover:bg-white/10"}`}>
              <Icon size={16}/><span className="flex-1 text-left font-medium">{item.label}</span>
              {item.badge>0&&<span className="bg-red-500 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold">{item.badge}</span>}
            </button>
          )})}
        </nav>
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2 mb-2 px-2">
            <div className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{user.name[0]}</div>
            <div className="flex-1 min-w-0"><p className="text-white text-xs font-semibold truncate">{user.name}</p><p className="text-blue-300 text-[10px]">{isManager?"Gerente":myTurma?.name||"Usuário"}</p></div>
          </div>
          <button onClick={()=>setUser(null)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-blue-300 hover:text-white hover:bg-white/10 transition"><LogOut size={14}/> Sair</button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-slate-50">{pageMap[page]||pageMap.dashboard}</main>
    </div>
  )
}
