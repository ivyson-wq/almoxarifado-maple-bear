import { useState, useEffect } from "react"
import {
  Home, Users, BookOpen, Package, DollarSign, ClipboardList,
  BarChart2, Bell, Plus, Edit2, Trash2, Check, X, LogOut,
  AlertTriangle, ShoppingCart, ChevronRight, CheckCircle, Loader2
} from "lucide-react"
import { supabase } from "./supabase.js"

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const ts  = () => new Date().toISOString()
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString("pt-BR") : "—"
const fmtCur  = v  => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const monthKey    = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`
const monthLabel  = k => { const [y,m] = k.split("-"); return new Date(y, m-1, 1).toLocaleDateString("pt-BR",{month:"long",year:"numeric"}) }
const MONTH = monthKey()
const COLORS = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#06B6D4","#84CC16"]

// ─── Mapeamento snake_case (Postgres) ↔ camelCase (App) ──────────────────────
const FIELD_MAP = {
  turma_id:    "turmaId",    user_id:     "userId",    req_id:      "reqId",
  stock_qty:   "stockQty",   manager_note:"managerNote", unit_price:  "unitPrice",
  created_at:  "createdAt",  approved_at: "approvedAt", rejected_at: "rejectedAt",
}
const FIELD_MAP_REV = Object.fromEntries(Object.entries(FIELD_MAP).map(([k,v])=>[v,k]))

const toApp = obj => {
  if (!obj) return obj
  return Object.fromEntries(Object.entries(obj).map(([k,v]) => [FIELD_MAP[k]||k, v]))
}
const toDB  = obj => {
  if (!obj) return obj
  const out = {}
  for (const [k,v] of Object.entries(obj)) {
    const dbKey = FIELD_MAP_REV[k] || k
    out[dbKey] = v
  }
  return out
}

// ─── Supabase CRUD ────────────────────────────────────────────────────────────
const fetchAll = async (table, order = null) => {
  let q = supabase.from(table).select("*")
  if (order) q = q.order(order, { ascending: false })
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(toApp)
}

// Smart diff: compara arrays antigo e novo e aplica apenas as mudanças
const syncTable = async (table, oldArr, newArr) => {
  const deleted = oldArr.filter(o => !newArr.find(n => n.id === o.id))
  const added   = newArr.filter(n => !oldArr.find(o => o.id === n.id))
  const updated = newArr.filter(n => {
    const o = oldArr.find(o => o.id === n.id)
    return o && JSON.stringify(o) !== JSON.stringify(n)
  })
  for (const item of deleted) {
    const { error } = await supabase.from(table).delete().eq("id", item.id)
    if (error) throw error
  }
  if (added.length) {
    const { error } = await supabase.from(table).insert(added.map(toDB))
    if (error) throw error
  }
  for (const item of updated) {
    const { error } = await supabase.from(table).update(toDB(item)).eq("id", item.id)
    if (error) throw error
  }
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background:"rgba(0,0,0,0.55)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide?"max-w-2xl":"max-w-md"} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-lg">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
            <X size={18}/>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function Btn({ children, onClick, variant="primary", size="md", disabled=false, className="", type="button" }) {
  const v = {
    primary:  "bg-blue-600 hover:bg-blue-700 text-white",
    secondary:"bg-slate-100 hover:bg-slate-200 text-slate-700",
    danger:   "bg-red-600 hover:bg-red-700 text-white",
    success:  "bg-emerald-600 hover:bg-emerald-700 text-white",
    ghost:    "hover:bg-slate-100 text-slate-600"
  }
  const s = { sm:"px-3 py-1.5 text-xs", md:"px-4 py-2 text-sm", lg:"px-5 py-2.5 text-base" }
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${v[variant]} ${s[size]} ${className}`}>
      {children}
    </button>
  )
}

function Field({ label, children, required }) {
  return <div className="space-y-1.5"><label className="text-sm font-medium text-slate-700">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>{children}</div>
}
function Inp(props) {
  return <input {...props} className={`w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${props.className||""}`}/>
}
function Sel({ children, ...props }) {
  return <select {...props} className={`w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${props.className||""}`}>{children}</select>
}
function Badge({ children, color="slate" }) {
  const c = { slate:"bg-slate-100 text-slate-700", blue:"bg-blue-100 text-blue-700", green:"bg-emerald-100 text-emerald-700", red:"bg-red-100 text-red-700", yellow:"bg-amber-100 text-amber-700", purple:"bg-purple-100 text-purple-700" }
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c[color]}`}>{children}</span>
}
function Card({ children, className="" }) { return <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm ${className}`}>{children}</div> }
function PageWrap({ children }) { return <div className="p-6 md:p-8 min-h-full">{children}</div> }
function PageHeader({ title, sub, action }) {
  return <div className="flex items-start justify-between mb-6"><div><h1 className="text-2xl font-bold text-slate-800">{title}</h1>{sub && <p className="text-sm text-slate-500 mt-1">{sub}</p>}</div>{action}</div>
}
function EmptyState({ icon: Icon, title, sub }) {
  return <div className="flex flex-col items-center justify-center py-16 text-center"><div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4"><Icon size={24} className="text-slate-400"/></div><p className="text-slate-700 font-semibold">{title}</p>{sub && <p className="text-slate-400 text-sm mt-1">{sub}</p>}</div>
}
function Spinner() { return <div className="flex items-center justify-center gap-2 py-8 text-slate-400"><Loader2 size={20} className="animate-spin"/><span className="text-sm">Carregando...</span></div> }

const statusCfg = {
  pending:  { label:"Pendente",  color:"yellow" },
  approved: { label:"Aprovado",  color:"green"  },
  rejected: { label:"Rejeitado", color:"red"    },
}

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginScreen({ users, onLogin }) {
  const [email, setEmail] = useState("")
  const [pw,    setPw]    = useState("")
  const [err,   setErr]   = useState("")
  const handle = e => {
    e.preventDefault()
    const u = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === pw)
    if (u) onLogin(u); else setErr("E-mail ou senha incorretos.")
  }
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background:"linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)" }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4"><Package size={28} className="text-white"/></div>
          <h1 className="text-2xl font-bold text-slate-800">Almoxarifado</h1>
          <p className="text-slate-500 text-sm mt-1">Maple Bear Bento Gonçalves</p>
        </div>
        <form onSubmit={handle} className="space-y-4">
          <Field label="E-mail" required><Inp type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com" required/></Field>
          <Field label="Senha"  required><Inp type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" required/></Field>
          {err && <p className="text-sm text-red-600 text-center">{err}</p>}
          <Btn type="submit" className="w-full justify-center">Entrar</Btn>
        </form>
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ db, user, setPage, notifCount }) {
  const isManager = user.role === "manager"
  const myTurma   = db.turmas.find(t => t.id === user.turmaId)
  const budget    = myTurma ? db.budgets.find(b => b.turmaId === myTurma.id && b.month === MONTH) : null
  const mySpent   = myTurma ? db.requisitions.filter(r => r.turmaId===myTurma.id && r.month===MONTH && r.status!=="rejected").reduce((s,r)=>s+r.total,0) : 0
  const pending   = db.requisitions.filter(r => r.status === "pending").length
  const lowStock  = db.insumos.filter(i => i.stockQty <= 5).length
  const recent    = [...db.requisitions].sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).slice(0,6)
  const getU = id => db.users.find(u => u.id === id)
  const getT = id => db.turmas.find(t => t.id === id)

  return (
    <PageWrap>
      <PageHeader title={`Olá, ${user.name.split(" ")[0]}! 👋`} sub={`${monthLabel(MONTH)} · ${isManager?"Visão Gerencial":myTurma?.name||""}`}/>
      {isManager ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label:"Usuários cadastrados",    value:db.users.length,  icon:Users,         bg:"bg-blue-500",    page:"usuarios"  },
            { label:"Turmas ativas",           value:db.turmas.length, icon:BookOpen,       bg:"bg-purple-500",  page:"turmas"    },
            { label:"Aprovações pendentes",    value:pending,          icon:ClipboardList,  bg:pending>0?"bg-amber-500":"bg-emerald-500", page:"aprovacoes" },
            { label:"Itens com estoque baixo", value:lowStock,         icon:AlertTriangle,  bg:lowStock>0?"bg-red-500":"bg-emerald-500",  page:"insumos"    },
          ].map(s => (
            <Card key={s.label} className="p-5 cursor-pointer hover:shadow-md transition" onClick={()=>setPage(s.page)}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${s.bg}`}><s.icon size={18} className="text-white"/></div>
              <p className="text-2xl font-bold text-slate-800">{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </Card>
          ))}
        </div>
      ) : (
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
        {recent.length === 0 ? <EmptyState icon={ClipboardList} title="Nenhuma requisição ainda"/> :
          <div className="divide-y divide-slate-50">
            {recent.map(r => {
              const u = getU(r.userId); const t = getT(r.turmaId); const sc = statusCfg[r.status]
              return (
                <div key={r.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{u?.name} <span className="text-slate-400 font-normal">· {t?.name}</span></p>
                    <p className="text-xs text-slate-400">{fmtDate(r.createdAt)} · {r.items?.length||0} item(s)</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-slate-800">{fmtCur(r.total)}</p>
                    <Badge color={sc?.color}>{sc?.label}</Badge>
                  </div>
                </div>
              )
            })}
          </div>
        }
      </Card>
      {!isManager && <div className="mt-4"><Btn onClick={()=>setPage("requisicao")}><Plus size={16}/> Nova Requisição</Btn></div>}
      {isManager && notifCount > 0 && (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
          <Bell size={18} className="text-amber-600 flex-shrink-0"/>
          <p className="text-sm text-amber-800">Você tem <strong>{notifCount}</strong> notificação(ões) não lida(s).</p>
          <Btn variant="secondary" size="sm" onClick={()=>setPage("notificacoes")} className="ml-auto flex-shrink-0">Ver</Btn>
        </div>
      )}
    </PageWrap>
  )
}

// ─── Usuários ─────────────────────────────────────────────────────────────────
function UsuariosPage({ db, saveKey }) {
  const [modal, setModal] = useState(null)
  const [form,  setForm]  = useState({ name:"", email:"", password:"", role:"user", turmaId:"" })
  const [del,   setDel]   = useState(null)
  const [busy,  setBusy]  = useState(false)
  const F = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const openAdd  = () => { setForm({ name:"", email:"", password:"", role:"user", turmaId:"" }); setModal({ mode:"add" }) }
  const openEdit = u => { setForm({ name:u.name, email:u.email, password:u.password, role:u.role, turmaId:u.turmaId||"" }); setModal({ mode:"edit", data:u }) }

  const save = async () => {
    setBusy(true)
    const users = [...db.users]
    if (modal.mode === "add") users.push({ ...form, id:uid(), turmaId:form.turmaId||null })
    else { const i = users.findIndex(u => u.id === modal.data.id); users[i] = { ...users[i], ...form, turmaId:form.turmaId||null } }
    await saveKey("users", users); setModal(null); setBusy(false)
  }
  const remove = async id => { setBusy(true); await saveKey("users", db.users.filter(u => u.id !== id)); setDel(null); setBusy(false) }
  const getTurmaName = id => db.turmas.find(t => t.id === id)?.name || "—"

  return (
    <PageWrap>
      <PageHeader title="Usuários" sub={`${db.users.length} cadastrado(s)`} action={<Btn onClick={openAdd}><Plus size={16}/>Novo usuário</Btn>}/>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-slate-100">{["Nome","E-mail","Perfil","Turma",""].map(h=><th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-50">
              {db.users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold">{u.name[0]}</div><span className="text-sm font-medium text-slate-800">{u.name}</span></div></td>
                  <td className="px-5 py-3 text-sm text-slate-600">{u.email}</td>
                  <td className="px-5 py-3"><Badge color={u.role==="manager"?"purple":"blue"}>{u.role==="manager"?"Gerente":"Usuário"}</Badge></td>
                  <td className="px-5 py-3 text-sm text-slate-600">{getTurmaName(u.turmaId)}</td>
                  <td className="px-5 py-3"><div className="flex items-center justify-end gap-1">
                    <Btn variant="ghost" size="sm" onClick={()=>openEdit(u)}><Edit2 size={14}/></Btn>
                    <Btn variant="ghost" size="sm" onClick={()=>setDel(u)} className="text-red-500 hover:bg-red-50"><Trash2 size={14}/></Btn>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {db.users.length === 0 && <EmptyState icon={Users} title="Nenhum usuário cadastrado"/>}
        </div>
      </Card>
      {modal && (
        <Modal title={modal.mode==="add"?"Novo Usuário":"Editar Usuário"} onClose={()=>setModal(null)}>
          <div className="space-y-4">
            <Field label="Nome completo" required><Inp value={form.name} onChange={F("name")} placeholder="Ex: Profª Maria Silva"/></Field>
            <Field label="E-mail" required><Inp type="email" value={form.email} onChange={F("email")} placeholder="email@escola.com"/></Field>
            <Field label="Senha" required><Inp value={form.password} onChange={F("password")} placeholder="Senha de acesso"/></Field>
            <Field label="Perfil" required><Sel value={form.role} onChange={F("role")}><option value="user">Usuário (Professor/Funcionário)</option><option value="manager">Gerente</option></Sel></Field>
            {form.role==="user" && <Field label="Turma vinculada"><Sel value={form.turmaId} onChange={F("turmaId")}><option value="">Sem turma</option>{db.turmas.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</Sel></Field>}
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="secondary" onClick={()=>setModal(null)}>Cancelar</Btn>
              <Btn onClick={save} disabled={!form.name||!form.email||!form.password||busy}>{busy?<Loader2 size={14} className="animate-spin"/>:null}{modal.mode==="add"?"Criar usuário":"Salvar"}</Btn>
            </div>
          </div>
        </Modal>
      )}
      {del && <Modal title="Excluir usuário" onClose={()=>setDel(null)}><p className="text-slate-600 mb-5">Excluir <strong>{del.name}</strong>?</p><div className="flex justify-end gap-2"><Btn variant="secondary" onClick={()=>setDel(null)}>Cancelar</Btn><Btn variant="danger" disabled={busy} onClick={()=>remove(del.id)}>Excluir</Btn></div></Modal>}
    </PageWrap>
  )
}

// ─── Turmas ───────────────────────────────────────────────────────────────────
function TurmasPage({ db, saveKey }) {
  const [modal, setModal] = useState(null)
  const [form,  setForm]  = useState({ name:"", color:"#3B82F6" })
  const [del,   setDel]   = useState(null)
  const [busy,  setBusy]  = useState(false)

  const openAdd  = () => { setForm({ name:"", color:"#3B82F6" }); setModal({ mode:"add" }) }
  const openEdit = t => { setForm({ name:t.name, color:t.color }); setModal({ mode:"edit", data:t }) }
  const save = async () => {
    setBusy(true)
    const turmas = [...db.turmas]
    if (modal.mode==="add") turmas.push({ ...form, id:uid() })
    else { const i = turmas.findIndex(t=>t.id===modal.data.id); turmas[i]={...turmas[i],...form} }
    await saveKey("turmas", turmas); setModal(null); setBusy(false)
  }
  const getBudget    = id => db.budgets.find(b=>b.turmaId===id&&b.month===MONTH)
  const getUserCount = id => db.users.filter(u=>u.turmaId===id).length

  return (
    <PageWrap>
      <PageHeader title="Turmas" sub={`${db.turmas.length} turma(s)`} action={<Btn onClick={openAdd}><Plus size={16}/>Nova turma</Btn>}/>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {db.turmas.map(t => {
          const budget = getBudget(t.id)
          return (
            <Card key={t.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold" style={{background:t.color}}>{t.name[0]}</div>
                  <div><p className="font-semibold text-slate-800">{t.name}</p><p className="text-xs text-slate-500">{getUserCount(t.id)} usuário(s)</p></div>
                </div>
                <div className="flex gap-1">
                  <Btn variant="ghost" size="sm" onClick={()=>openEdit(t)}><Edit2 size={14}/></Btn>
                  <Btn variant="ghost" size="sm" onClick={()=>setDel(t)} className="text-red-500 hover:bg-red-50"><Trash2 size={14}/></Btn>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-400">Orçamento {monthLabel(MONTH)}</p>
                <p className="text-lg font-bold text-slate-800 mt-0.5">{budget?fmtCur(budget.amount):"—"}</p>
              </div>
            </Card>
          )
        })}
        {db.turmas.length===0 && <div className="col-span-3"><EmptyState icon={BookOpen} title="Nenhuma turma cadastrada" sub="Clique em 'Nova turma' para começar"/></div>}
      </div>
      {modal && (
        <Modal title={modal.mode==="add"?"Nova Turma":"Editar Turma"} onClose={()=>setModal(null)}>
          <div className="space-y-4">
            <Field label="Nome da turma" required><Inp value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Ex: Bear Care, Year 1..."/></Field>
            <Field label="Cor de identificação">
              <div className="flex gap-2 flex-wrap">{COLORS.map(c=><button key={c} onClick={()=>setForm(f=>({...f,color:c}))} className={`w-8 h-8 rounded-lg transition-all ${form.color===c?"ring-2 ring-offset-2 ring-slate-700 scale-110":""}`} style={{background:c}}/>)}</div>
            </Field>
            <div className="flex justify-end gap-2 pt-2"><Btn variant="secondary" onClick={()=>setModal(null)}>Cancelar</Btn><Btn onClick={save} disabled={!form.name||busy}>{modal.mode==="add"?"Criar":"Salvar"}</Btn></div>
          </div>
        </Modal>
      )}
      {del && <Modal title="Excluir turma" onClose={()=>setDel(null)}><p className="text-slate-600 mb-5">Excluir <strong>{del.name}</strong>?</p><div className="flex justify-end gap-2"><Btn variant="secondary" onClick={()=>setDel(null)}>Cancelar</Btn><Btn variant="danger" disabled={busy} onClick={async()=>{setBusy(true);await saveKey("turmas",db.turmas.filter(t=>t.id!==del.id));setDel(null);setBusy(false)}}>Excluir</Btn></div></Modal>}
    </PageWrap>
  )
}

// ─── Insumos ──────────────────────────────────────────────────────────────────
function InsumosPage({ db, saveKey }) {
  const [modal,  setModal]  = useState(null)
  const [form,   setForm]   = useState({ name:"", description:"", unit:"unidade", stockQty:"", price:"" })
  const [del,    setDel]    = useState(null)
  const [search, setSearch] = useState("")
  const [busy,   setBusy]   = useState(false)
  const filtered = db.insumos.filter(i=>i.name.toLowerCase().includes(search.toLowerCase()))
  const F = k => e => setForm(f=>({...f,[k]:e.target.value}))

  const openAdd  = () => { setForm({ name:"", description:"", unit:"unidade", stockQty:"", price:"" }); setModal({ mode:"add" }) }
  const openEdit = i => { setForm({ name:i.name, description:i.description||"", unit:i.unit, stockQty:String(i.stockQty), price:String(i.price) }); setModal({ mode:"edit", data:i }) }
  const save = async () => {
    setBusy(true)
    const insumos = [...db.insumos]
    const item = { ...form, stockQty:Number(form.stockQty), price:Number(form.price) }
    if (modal.mode==="add") insumos.push({ ...item, id:uid() })
    else { const idx = insumos.findIndex(x=>x.id===modal.data.id); insumos[idx]={...insumos[idx],...item} }
    await saveKey("insumos", insumos); setModal(null); setBusy(false)
  }
  const stockColor = qty => qty<=0?"red":qty<=5?"yellow":"green"

  return (
    <PageWrap>
      <PageHeader title="Insumos / Estoque" sub={`${db.insumos.length} item(s) no catálogo`} action={<Btn onClick={openAdd}><Plus size={16}/>Novo insumo</Btn>}/>
      <Card>
        <div className="px-5 py-3 border-b border-slate-100"><Inp value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar insumo..." className="max-w-xs"/></div>
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
                  <td className="px-5 py-3"><div className="flex items-center justify-end gap-1">
                    <Btn variant="ghost" size="sm" onClick={()=>openEdit(i)}><Edit2 size={14}/></Btn>
                    <Btn variant="ghost" size="sm" onClick={()=>setDel(i)} className="text-red-500 hover:bg-red-50"><Trash2 size={14}/></Btn>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length===0 && <EmptyState icon={Package} title="Nenhum insumo encontrado"/>}
        </div>
      </Card>
      {modal && (
        <Modal title={modal.mode==="add"?"Novo Insumo":"Editar Insumo"} onClose={()=>setModal(null)}>
          <div className="space-y-4">
            <Field label="Nome" required><Inp value={form.name} onChange={F("name")} placeholder="Ex: Papel A4"/></Field>
            <Field label="Descrição"><Inp value={form.description} onChange={F("description")} placeholder="Ex: Resma 500 folhas"/></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unidade" required><Sel value={form.unit} onChange={F("unit")}>{["unidade","caixa","resma","pacote","litro","kg","par","rolo"].map(u=><option key={u}>{u}</option>)}</Sel></Field>
              <Field label="Qtde em estoque" required><Inp type="number" min="0" value={form.stockQty} onChange={F("stockQty")} placeholder="0"/></Field>
            </div>
            <Field label="Preço unitário (R$)" required><Inp type="number" min="0" step="0.01" value={form.price} onChange={F("price")} placeholder="0,00"/></Field>
            <div className="flex justify-end gap-2 pt-2"><Btn variant="secondary" onClick={()=>setModal(null)}>Cancelar</Btn><Btn onClick={save} disabled={!form.name||!form.stockQty||!form.price||busy}>{modal.mode==="add"?"Adicionar":"Salvar"}</Btn></div>
          </div>
        </Modal>
      )}
      {del && <Modal title="Excluir insumo" onClose={()=>setDel(null)}><p className="text-slate-600 mb-5">Excluir <strong>{del.name}</strong>?</p><div className="flex justify-end gap-2"><Btn variant="secondary" onClick={()=>setDel(null)}>Cancelar</Btn><Btn variant="danger" disabled={busy} onClick={async()=>{setBusy(true);await saveKey("insumos",db.insumos.filter(i=>i.id!==del.id));setDel(null);setBusy(false)}}>Excluir</Btn></div></Modal>}
    </PageWrap>
  )
}

// ─── Orçamentos ───────────────────────────────────────────────────────────────
function OrcamentosPage({ db, saveKey }) {
  const [selMonth, setSelMonth] = useState(MONTH)
  const [editing,  setEditing]  = useState({})
  const [busy,     setBusy]     = useState(false)
  const months = Array.from({length:6},(_,i)=>{ const d=new Date(); d.setMonth(d.getMonth()+i-2); return monthKey(d) })
  const getBudget = id  => db.budgets.find(b=>b.turmaId===id&&b.month===selMonth)
  const getSpent  = id  => db.requisitions.filter(r=>r.turmaId===id&&r.month===selMonth&&r.status!=="rejected").reduce((s,r)=>s+r.total,0)

  const saveBudget = async (turmaId, amount) => {
    setBusy(true)
    const budgets = [...db.budgets]
    const idx = budgets.findIndex(b=>b.turmaId===turmaId&&b.month===selMonth)
    if (idx>=0) budgets[idx]={ ...budgets[idx], amount:Number(amount) }
    else budgets.push({ id:uid(), turmaId, month:selMonth, amount:Number(amount) })
    await saveKey("budgets", budgets); setEditing({}); setBusy(false)
  }

  return (
    <PageWrap>
      <PageHeader title="Orçamentos por Turma" sub="Defina o orçamento mensal de cada sala"/>
      <div className="mb-6 flex items-center gap-3">
        <label className="text-sm font-medium text-slate-700">Mês de referência:</label>
        <Sel value={selMonth} onChange={e=>setSelMonth(e.target.value)} className="w-auto">{months.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</Sel>
      </div>
      <div className="space-y-3">
        {db.turmas.length===0 && <EmptyState icon={DollarSign} title="Nenhuma turma cadastrada" sub="Cadastre turmas primeiro"/>}
        {db.turmas.map(t => {
          const budget=getBudget(t.id); const spent=getSpent(t.id)
          const amount=budget?.amount||0; const pct=amount>0?Math.min(100,(spent/amount)*100):0
          const isEd = editing[t.id] !== undefined
          return (
            <Card key={t.id} className="p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0" style={{background:t.color}}>{t.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-slate-800">{t.name}</p>
                    <div className="flex items-center gap-2">
                      {isEd ? (
                        <><Inp type="number" value={editing[t.id]} onChange={e=>setEditing({...editing,[t.id]:e.target.value})} className="w-32 text-right" placeholder="R$ 0,00"/>
                        <Btn size="sm" disabled={busy} onClick={()=>saveBudget(t.id,editing[t.id])}><Check size={14}/></Btn>
                        <Btn size="sm" variant="secondary" onClick={()=>setEditing({})}><X size={14}/></Btn></>
                      ) : (
                        <><span className="text-sm font-bold text-slate-800">{fmtCur(amount)}</span>
                        <Btn size="sm" variant="secondary" onClick={()=>setEditing({...editing,[t.id]:String(amount||"")})}><Edit2 size={14}/> Editar</Btn></>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{width:`${pct}%`,background:pct>=90?"#EF4444":pct>=70?"#F59E0B":"#10B981"}}/>
                    </div>
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
function RequisicaoPage({ db, saveKey, user }) {
  const [items,     setItems]     = useState([])
  const [notes,     setNotes]     = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [err,       setErr]       = useState("")
  const [busy,      setBusy]      = useState(false)

  const myTurma = db.turmas.find(t => t.id === user.turmaId)
  const budget  = myTurma ? db.budgets.find(b=>b.turmaId===myTurma.id&&b.month===MONTH) : null
  const spent   = myTurma ? db.requisitions.filter(r=>r.turmaId===myTurma.id&&r.month===MONTH&&r.status!=="rejected").reduce((s,r)=>s+r.total,0) : 0
  const available = (budget?.amount||0) - spent
  const total     = items.reduce((s,i) => s + i.qty*i.price, 0)

  const addItem = ins => { if (items.find(i=>i.insumoId===ins.id)) return; setItems([...items,{insumoId:ins.id,name:ins.name,unit:ins.unit,stockQty:ins.stockQty,price:ins.price,qty:1}]) }
  const updQty  = (id, qty) => setItems(items.map(i=>i.insumoId===id?{...i,qty:Math.max(1,Math.min(i.stockQty,qty))}:i))
  const remItem = id => setItems(items.filter(i=>i.insumoId!==id))

  const submit = async () => {
    setErr("")
    if (!myTurma)       return setErr("Você não está vinculado a nenhuma turma.")
    if (items.length===0) return setErr("Adicione pelo menos um item.")
    if (budget && total > available) return setErr(`Total excede o saldo disponível (${fmtCur(available)}).`)
    setBusy(true)
    const req = { id:uid(), userId:user.id, turmaId:myTurma.id, month:MONTH,
      items: items.map(i=>({ insumoId:i.insumoId, name:i.name, qty:i.qty, unit:i.unit, unitPrice:i.price })),
      total, notes, status:"pending", createdAt:ts() }
    const notif = { id:uid(), reqId:req.id, message:`${user.name} (${myTurma.name}) solicitou ${items.length} item(s) — Total: ${fmtCur(total)}`, read:false, createdAt:ts() }
    await saveKey("requisitions", [...db.requisitions, req])
    await saveKey("notifications", [...db.notifications, notif])
    setSubmitted(true); setBusy(false)
  }

  if (!myTurma) return <PageWrap><EmptyState icon={AlertTriangle} title="Turma não atribuída" sub="Solicite ao gerente que vincule você a uma turma."/></PageWrap>
  if (submitted) return (
    <PageWrap>
      <div className="max-w-md mx-auto text-center py-16">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle size={40} className="text-emerald-600"/></div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Requisição enviada!</h2>
        <p className="text-slate-500 mb-6">O gerente foi notificado e analisará em breve.</p>
        <Btn onClick={()=>{setItems([]);setNotes("");setSubmitted(false)}}><Plus size={16}/> Nova requisição</Btn>
      </div>
    </PageWrap>
  )

  return (
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
          <Card>
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
              {db.insumos.length===0 && <EmptyState icon={Package} title="Nenhum insumo cadastrado"/>}
              {db.insumos.map(ins=>{
                const inCart=!!items.find(i=>i.insumoId===ins.id); const oos=ins.stockQty<=0
                return (
                  <div key={ins.id} className={`px-4 py-3 flex items-center justify-between ${oos?"opacity-50":""}`}>
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-800">{ins.name}</p><p className="text-xs text-slate-400">{fmtCur(ins.price)}/{ins.unit} · Estoque: {ins.stockQty}</p></div>
                    <Btn size="sm" variant={inCart?"secondary":"primary"} disabled={oos} onClick={()=>inCart?remItem(ins.id):addItem(ins)}>{inCart?<><Check size={12}/> Adicionado</>:<><Plus size={12}/> Adicionar</>}</Btn>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Itens selecionados</p>
          <Card className="mb-4">
            {items.length===0 ? <EmptyState icon={ShoppingCart} title="Nenhum item" sub="Adicione do catálogo ao lado"/> :
              <div className="divide-y divide-slate-50">
                {items.map(i=>(
                  <div key={i.insumoId} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div><p className="text-sm font-medium text-slate-800">{i.name}</p><p className="text-xs text-slate-400">{fmtCur(i.price)}/{i.unit}</p></div>
                      <button onClick={()=>remItem(i.insumoId)} className="text-slate-300 hover:text-red-500 transition p-1"><X size={14}/></button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <button onClick={()=>updQty(i.insumoId,i.qty-1)} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-700">−</button>
                        <span className="w-8 text-center text-sm font-semibold">{i.qty}</span>
                        <button onClick={()=>updQty(i.insumoId,i.qty+1)} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-700">+</button>
                        <span className="text-xs text-slate-400">máx {i.stockQty}</span>
                      </div>
                      <span className="text-sm font-semibold text-slate-800">{fmtCur(i.qty*i.price)}</span>
                    </div>
                  </div>
                ))}
              </div>
            }
          </Card>
          <Field label="Observações"><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Justificativa ou observação (opcional)..."/></Field>
          {err && <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex gap-2"><AlertTriangle size={16} className="flex-shrink-0 mt-0.5"/>{err}</div>}
          <div className="mt-4 p-4 bg-slate-50 rounded-xl">
            <div className="flex justify-between text-sm mb-1"><span className="text-slate-600">Total da requisição</span><span className={`font-bold ${budget&&total>available?"text-red-600":"text-slate-800"}`}>{fmtCur(total)}</span></div>
            {budget && <div className="flex justify-between text-xs text-slate-400"><span>Saldo após aprovação</span><span className={available-total<0?"text-red-500":""}>{fmtCur(available-total)}</span></div>}
          </div>
          <Btn className="w-full justify-center mt-4" onClick={submit} disabled={items.length===0||busy}>{busy?<Loader2 size={16} className="animate-spin"/>:<ClipboardList size={16}/>} Enviar Requisição</Btn>
        </div>
      </div>
    </PageWrap>
  )
}

// ─── Minhas Requisições ────────────────────────────────────────────────────────
function MinhasReqsPage({ db, user }) {
  const myReqs = db.requisitions.filter(r=>r.userId===user.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
  const [detail, setDetail] = useState(null)
  return (
    <PageWrap>
      <PageHeader title="Minhas Requisições" sub={`${myReqs.length} solicitação(ões)`}/>
      <Card>
        {myReqs.length===0 ? <EmptyState icon={ClipboardList} title="Nenhuma requisição ainda"/> :
          <div className="divide-y divide-slate-50">
            {myReqs.map(r=>{
              const sc = statusCfg[r.status]
              return (
                <div key={r.id} className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50" onClick={()=>setDetail(r)}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{fmtDate(r.createdAt)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{r.items?.length||0} item(s): {r.items?.map(i=>i.name).join(", ")}</p>
                    {r.managerNote && <p className="text-xs text-amber-700 mt-0.5 italic">Nota: {r.managerNote}</p>}
                  </div>
                  <div className="text-right flex-shrink-0"><p className="text-sm font-bold text-slate-800">{fmtCur(r.total)}</p><Badge color={sc?.color}>{sc?.label}</Badge></div>
                </div>
              )
            })}
          </div>
        }
      </Card>
      {detail && (
        <Modal title="Detalhes da Requisição" onClose={()=>setDetail(null)}>
          <div className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-slate-500">Data</span><span className="font-medium">{fmtDate(detail.createdAt)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">Status</span><Badge color={statusCfg[detail.status]?.color}>{statusCfg[detail.status]?.label}</Badge></div>
            <hr className="border-slate-100"/>
            <p className="text-sm font-semibold text-slate-700">Itens:</p>
            {detail.items?.map((i,idx)=><div key={idx} className="flex justify-between text-sm bg-slate-50 px-3 py-2 rounded-lg"><span>{i.qty}x {i.name} ({i.unit})</span><span className="font-semibold">{fmtCur(i.qty*(i.unitPrice||i.unit_price||0))}</span></div>)}
            <div className="flex justify-between font-bold text-sm border-t border-slate-100 pt-2"><span>Total</span><span>{fmtCur(detail.total)}</span></div>
            {detail.notes && <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl"><strong>Obs:</strong> {detail.notes}</p>}
            {detail.managerNote && <p className="text-sm text-amber-800 bg-amber-50 p-3 rounded-xl"><strong>Nota do gerente:</strong> {detail.managerNote}</p>}
          </div>
        </Modal>
      )}
    </PageWrap>
  )
}

// ─── Aprovações ───────────────────────────────────────────────────────────────
function AprovacoesPage({ db, saveKey }) {
  const [filter,   setFilter]   = useState("pending")
  const [detail,   setDetail]   = useState(null)
  const [noteText, setNoteText] = useState("")
  const [busy,     setBusy]     = useState(false)
  const filtered = db.requisitions.filter(r=>filter==="all"?true:r.status===filter).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
  const getU = id => db.users.find(u=>u.id===id)
  const getT = id => db.turmas.find(t=>t.id===id)

  const approve = async req => {
    setBusy(true)
    const insumos = db.insumos.map(i => { const item=req.items?.find(x=>x.insumoId===i.id); return item?{...i,stockQty:Math.max(0,i.stockQty-item.qty)}:i })
    await saveKey("insumos", insumos)
    await saveKey("requisitions", db.requisitions.map(r=>r.id===req.id?{...r,status:"approved",managerNote:noteText,approvedAt:ts()}:r))
    setDetail(null); setNoteText(""); setBusy(false)
  }
  const reject = async req => {
    setBusy(true)
    await saveKey("requisitions", db.requisitions.map(r=>r.id===req.id?{...r,status:"rejected",managerNote:noteText,rejectedAt:ts()}:r))
    setDetail(null); setNoteText(""); setBusy(false)
  }

  return (
    <PageWrap>
      <PageHeader title="Aprovações" sub="Analise as requisições de material"/>
      <div className="flex gap-2 mb-6 flex-wrap">
        {[{k:"pending",l:"Pendentes"},{k:"approved",l:"Aprovados"},{k:"rejected",l:"Rejeitados"},{k:"all",l:"Todos"}].map(f=>(
          <button key={f.k} onClick={()=>setFilter(f.k)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${filter===f.k?"bg-blue-600 text-white":"bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {f.l} {f.k!=="all"&&<span className="ml-1 text-xs opacity-70">{db.requisitions.filter(r=>r.status===f.k).length}</span>}
          </button>
        ))}
      </div>
      <Card>
        {filtered.length===0 ? <EmptyState icon={ClipboardList} title="Nenhuma requisição" sub={filter==="pending"?"Nenhuma aguardando":"Nenhuma neste filtro"}/> :
          <div className="divide-y divide-slate-50">
            {filtered.map(r=>{
              const u=getU(r.userId); const t=getT(r.turmaId); const sc=statusCfg[r.status]
              return (
                <div key={r.id} className="px-5 py-4 hover:bg-slate-50 cursor-pointer" onClick={()=>{setDetail(r);setNoteText(r.managerNote||"")}}>
                  <div className="flex items-start gap-4">
                    <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm flex-shrink-0">{u?.name[0]||"?"}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{u?.name}</p>
                      <p className="text-xs text-slate-500">{t?.name} · {fmtDate(r.createdAt)}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{r.items?.map(i=>`${i.qty}× ${i.name}`).join(", ")}</p>
                    </div>
                    <div className="text-right flex-shrink-0"><p className="text-sm font-bold text-slate-800">{fmtCur(r.total)}</p><Badge color={sc?.color}>{sc?.label}</Badge></div>
                  </div>
                </div>
              )
            })}
          </div>
        }
      </Card>
      {detail && (
        <Modal title="Analisar Requisição" onClose={()=>setDetail(null)} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-400">Solicitante: </span><strong>{getU(detail.userId)?.name}</strong></div>
              <div><span className="text-slate-400">Turma: </span><strong>{getT(detail.turmaId)?.name}</strong></div>
              <div><span className="text-slate-400">Data: </span><strong>{fmtDate(detail.createdAt)}</strong></div>
              <div><span className="text-slate-400">Status: </span><Badge color={statusCfg[detail.status]?.color}>{statusCfg[detail.status]?.label}</Badge></div>
            </div>
            <hr className="border-slate-100"/>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400"><th className="py-1">Item</th><th>Qtde</th><th>Unit.</th><th className="text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-slate-50">{detail.items?.map((i,idx)=><tr key={idx}><td className="py-2">{i.name}</td><td>{i.qty} {i.unit}</td><td>{fmtCur(i.unitPrice||i.unit_price||0)}</td><td className="text-right font-semibold">{fmtCur(i.qty*(i.unitPrice||i.unit_price||0))}</td></tr>)}</tbody>
            </table>
            <div className="flex justify-between font-bold text-sm border-t border-slate-100 pt-2"><span>Total</span><span>{fmtCur(detail.total)}</span></div>
            {detail.notes && <p className="text-sm bg-slate-50 p-3 rounded-xl text-slate-600"><strong>Observação:</strong> {detail.notes}</p>}
            <Field label="Nota do gerente (opcional)"><Inp value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Justificativa de aprovação ou rejeição..."/></Field>
            {detail.status==="pending" ? (
              <div className="flex justify-end gap-2 pt-2">
                <Btn variant="secondary" onClick={()=>setDetail(null)}>Cancelar</Btn>
                <Btn variant="danger"  disabled={busy} onClick={()=>reject(detail)}>{busy?<Loader2 size={14} className="animate-spin"/>:<X size={14}/>} Rejeitar</Btn>
                <Btn variant="success" disabled={busy} onClick={()=>approve(detail)}>{busy?<Loader2 size={14} className="animate-spin"/>:<Check size={14}/>} Aprovar</Btn>
              </div>
            ) : <div className="flex justify-end"><Btn variant="secondary" onClick={()=>setDetail(null)}>Fechar</Btn></div>}
          </div>
        </Modal>
      )}
    </PageWrap>
  )
}

// ─── Notificações ─────────────────────────────────────────────────────────────
function NotificacoesPage({ db, saveKey, setPage }) {
  const notifs = [...db.notifications].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
  const markAll = async () => { await saveKey("notifications", db.notifications.map(n=>({...n,read:true}))) }
  return (
    <PageWrap>
      <PageHeader title="Notificações" sub={`${db.notifications.filter(n=>!n.read).length} não lida(s)`} action={<Btn variant="secondary" onClick={markAll}>Marcar todas como lidas</Btn>}/>
      <Card>
        {notifs.length===0 ? <EmptyState icon={Bell} title="Nenhuma notificação"/> :
          <div className="divide-y divide-slate-50">
            {notifs.map(n=>(
              <div key={n.id} className={`px-5 py-4 flex items-start gap-4 ${!n.read?"bg-blue-50/50":""}`}>
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${!n.read?"bg-blue-500":"bg-slate-200"}`}/>
                <div className="flex-1"><p className="text-sm text-slate-800">{n.message}</p><p className="text-xs text-slate-400 mt-1">{fmtDate(n.createdAt)}</p></div>
                <Btn size="sm" variant="ghost" onClick={()=>setPage("aprovacoes")}><ChevronRight size={14}/> Ver</Btn>
              </div>
            ))}
          </div>
        }
      </Card>
    </PageWrap>
  )
}

// ─── Relatórios ───────────────────────────────────────────────────────────────
function RelatoriosPage({ db }) {
  const allMonths = [...new Set(db.requisitions.map(r=>r.month).concat([MONTH]))].sort().reverse()
  const [selMonth, setSelMonth] = useState(MONTH)

  const data = db.turmas.map(t=>{
    const reqs     = db.requisitions.filter(r=>r.turmaId===t.id&&r.month===selMonth)
    const approved = reqs.filter(r=>r.status==="approved")
    const totalApproved = approved.reduce((s,r)=>s+r.total,0)
    const budget   = db.budgets.find(b=>b.turmaId===t.id&&b.month===selMonth)
    const itemMap  = {}
    for (const r of approved) for (const i of (r.items||[])) {
      if (!itemMap[i.insumoId]) itemMap[i.insumoId]={ name:i.name, unit:i.unit, qty:0, total:0 }
      itemMap[i.insumoId].qty   += i.qty
      itemMap[i.insumoId].total += i.qty*(i.unitPrice||i.unit_price||0)
    }
    return { turma:t, reqs, approved, pending:reqs.filter(r=>r.status==="pending"), rejected:reqs.filter(r=>r.status==="rejected"), totalApproved, budget:budget?.amount||0, items:Object.values(itemMap),
      allReqs: reqs.map(r=>({...r, userName:db.users.find(u=>u.id===r.userId)?.name||"?"})) }
  }).filter(d=>d.reqs.length>0||d.budget>0)

  return (
    <PageWrap>
      <PageHeader title="Relatórios de Consumo" sub="Consumo mensal por turma com detalhe do solicitante"/>
      <div className="mb-6 flex items-center gap-3">
        <label className="text-sm font-medium text-slate-700">Mês:</label>
        <Sel value={selMonth} onChange={e=>setSelMonth(e.target.value)} className="w-auto">{allMonths.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</Sel>
      </div>
      {data.length===0 && <EmptyState icon={BarChart2} title="Sem dados neste período" sub="Nenhuma requisição ou orçamento para este mês."/>}
      <div className="space-y-6">
        {data.map(d=>{
          const pct = d.budget>0?Math.min(100,(d.totalApproved/d.budget)*100):0
          return (
            <Card key={d.turma.id}>
              <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{background:d.turma.color}}>{d.turma.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-800">{d.turma.name}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${pct}%`,background:pct>=90?"#EF4444":pct>=70?"#F59E0B":"#10B981"}}/></div>
                    <span className="text-xs text-slate-500 flex-shrink-0">{fmtCur(d.totalApproved)} / {fmtCur(d.budget)}</span>
                  </div>
                </div>
                <div className="flex gap-4 text-center">
                  <div><p className="text-lg font-bold text-emerald-600">{d.approved.length}</p><p className="text-xs text-slate-400">Aprovado</p></div>
                  <div><p className="text-lg font-bold text-amber-500">{d.pending.length}</p><p className="text-xs text-slate-400">Pendente</p></div>
                  <div><p className="text-lg font-bold text-red-500">{d.rejected.length}</p><p className="text-xs text-slate-400">Rejeitado</p></div>
                </div>
              </div>
              {d.items.length>0 && (
                <div className="px-6 py-4 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Materiais consumidos (aprovados)</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {d.items.map((i,idx)=><div key={idx} className="bg-slate-50 rounded-xl px-3 py-2 text-sm"><p className="font-medium text-slate-800">{i.name}</p><p className="text-xs text-slate-500">{i.qty} {i.unit} · {fmtCur(i.total)}</p></div>)}
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-50 text-left text-xs text-slate-400"><th className="px-6 py-2">Solicitante</th><th className="px-6 py-2">Data</th><th className="px-6 py-2">Itens</th><th className="px-6 py-2 text-right">Valor</th><th className="px-6 py-2 text-right">Status</th></tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {d.allReqs.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(r=>(
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-6 py-2.5 font-medium text-slate-800">{r.userName}</td>
                        <td className="px-6 py-2.5 text-slate-500">{fmtDate(r.createdAt)}</td>
                        <td className="px-6 py-2.5 text-slate-500 text-xs">{r.items?.map(i=>`${i.qty}× ${i.name}`).join(", ")}</td>
                        <td className="px-6 py-2.5 text-right font-semibold">{fmtCur(r.total)}</td>
                        <td className="px-6 py-2.5 text-right"><Badge color={statusCfg[r.status]?.color}>{statusCfg[r.status]?.label}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )
        })}
      </div>
    </PageWrap>
  )
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user,       setUser]       = useState(null)
  const [page,       setPage]       = useState("dashboard")
  const [db,         setDb]         = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [dbError,    setDbError]    = useState(null)
  const [notifCount, setNotifCount] = useState(0)

  const reload = async () => {
    const [users, turmas, insumos, budgets, requisitions, notifications] = await Promise.all([
      fetchAll("users"),
      fetchAll("turmas"),
      fetchAll("insumos"),
      fetchAll("budgets"),
      fetchAll("requisitions", "created_at"),
      fetchAll("notifications", "created_at"),
    ])
    const d = { users, turmas, insumos, budgets, requisitions, notifications }
    setDb(d)
    setNotifCount(d.notifications.filter(n => !n.read).length)
  }

  useEffect(() => {
    reload()
      .catch(e => setDbError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const saveKey = async (table, newArr) => {
    const oldArr = db[table] || []
    await syncTable(table, oldArr, newArr)
    await reload()
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"/><p className="text-slate-500 text-sm">Conectando ao banco de dados...</p></div>
    </div>
  )

  if (dbError) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md text-center">
        <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><AlertTriangle size={24} className="text-red-600"/></div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Erro de conexão</h2>
        <p className="text-slate-500 text-sm mb-4">Verifique as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env</p>
        <pre className="text-xs bg-red-50 text-red-700 p-3 rounded-xl text-left overflow-auto">{dbError}</pre>
      </div>
    </div>
  )

  if (!user || !db) return <LoginScreen users={db?.users||[]} onLogin={u=>{setUser(u);setPage("dashboard")}}/>

  const isManager = user.role === "manager"
  const myTurma   = db.turmas.find(t => t.id === user.turmaId)
  const props = { db, saveKey, user, setPage }

  const navItems = [
    { id:"dashboard", label:"Dashboard",         icon:Home },
    ...(isManager ? [
      { id:"usuarios",     label:"Usuários",           icon:Users        },
      { id:"turmas",       label:"Turmas",              icon:BookOpen     },
      { id:"insumos",      label:"Insumos / Estoque",   icon:Package      },
      { id:"orcamentos",   label:"Orçamentos",          icon:DollarSign   },
      { id:"aprovacoes",   label:"Aprovações",          icon:ClipboardList},
      { id:"relatorios",   label:"Relatórios",          icon:BarChart2    },
      { id:"notificacoes", label:"Notificações",        icon:Bell, badge:notifCount },
    ] : [
      { id:"requisicao",   label:"Nova Requisição",     icon:Plus         },
      { id:"minhasreqs",   label:"Minhas Requisições",  icon:ClipboardList},
    ]),
  ]

  const pageMap = {
    dashboard:    <Dashboard {...props} notifCount={notifCount}/>,
    usuarios:     <UsuariosPage {...props}/>,
    turmas:       <TurmasPage {...props}/>,
    insumos:      <InsumosPage {...props}/>,
    orcamentos:   <OrcamentosPage {...props}/>,
    aprovacoes:   <AprovacoesPage {...props}/>,
    relatorios:   <RelatoriosPage {...props}/>,
    notificacoes: <NotificacoesPage {...props} setPage={setPage}/>,
    requisicao:   <RequisicaoPage {...props}/>,
    minhasreqs:   <MinhasReqsPage {...props}/>,
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex flex-col flex-shrink-0" style={{background:"#0F2744"}}>
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0"><Package size={18} className="text-white"/></div>
            <div><p className="text-white text-xs font-bold leading-tight">Maple Bear BG</p><p className="text-blue-300 text-[10px] font-medium">Almoxarifado</p></div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon; const active = page === item.id
            return (
              <button key={item.id} onClick={()=>setPage(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${active?"bg-blue-600 text-white":"text-blue-200 hover:text-white hover:bg-white/10"}`}>
                <Icon size={16}/><span className="flex-1 text-left font-medium">{item.label}</span>
                {item.badge>0 && <span className="bg-red-500 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold">{item.badge}</span>}
              </button>
            )
          })}
        </nav>
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2 mb-2 px-2">
            <div className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{user.name[0]}</div>
            <div className="flex-1 min-w-0"><p className="text-white text-xs font-semibold truncate">{user.name}</p><p className="text-blue-300 text-[10px]">{isManager?"Gerente":myTurma?.name||"Usuário"}</p></div>
          </div>
          <button onClick={()=>setUser(null)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-blue-300 hover:text-white hover:bg-white/10 transition">
            <LogOut size={14}/> Sair
          </button>
        </div>
      </aside>
      {/* Main */}
      <main className="flex-1 overflow-auto bg-slate-50">{pageMap[page]||pageMap.dashboard}</main>
    </div>
  )
}
