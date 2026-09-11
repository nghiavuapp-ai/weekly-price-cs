import { useState, type FormEvent } from 'react'

import type { ConfigTable } from '../data/admin-repository'
import type { DashboardSnapshot } from '../data/data-source'
import { validateCorrection, type CorrectionPayload } from '../domain/corrections'

interface Props {
  open: boolean
  authenticated: boolean
  snapshot: DashboardSnapshot
  onClose: () => void
  onSignIn: (password: string) => Promise<void>
  onSignOut: () => Promise<void> | void
  onCorrection: (payload: CorrectionPayload) => Promise<void>
  onConfigMutation: (table: ConfigTable, values: Record<string, unknown>, id?: string) => Promise<void>
}

export function AdminPanel(props: Props) {
  const [password, setPassword] = useState('')
  const [tab, setTab] = useState<'review' | 'catalog' | 'audit'>('review')
  const [selectedId, setSelectedId] = useState(props.snapshot.pendingRows[0]?.id ?? '')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('unchanged')
  const [decision, setDecision] = useState('confirmed')
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const submitLogin = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('')
    try { await props.onSignIn(password); setPassword('') } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể mở khóa.') } finally { setBusy(false) }
  }
  const submitCorrection = async (event: FormEvent) => {
    event.preventDefault()
    const result = validateCorrection({ observationId: selectedId, correctedPrice: price, correctedInStock: stock === 'unchanged' ? null : stock === 'in_stock', reviewDecision: decision as 'pending' | 'confirmed' | 'rejected', note })
    if (!result.ok) { setMessage(result.error); return }
    setBusy(true); setMessage('')
    try { await props.onCorrection(result.value); setMessage('Đã lưu điều chỉnh và phát realtime.'); setPrice(''); setNote('') } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể lưu điều chỉnh.') } finally { setBusy(false) }
  }
  if (!props.open) return null
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
    <section className="admin-panel" role="dialog" aria-modal="true" aria-labelledby="admin-title">
      <button className="modal-close" type="button" onClick={props.onClose} aria-label="Đóng">×</button>
      {!props.authenticated ? <form className="unlock" onSubmit={submitLogin}>
        <p className="eyebrow">PRIVATE CONTROL</p><h2 id="admin-title">Mở công cụ sửa giá</h2>
        <p>Phiên đăng nhập sẽ được ghi nhớ trên thiết bị này.</p>
        <label>Mật khẩu<input autoFocus aria-label="Mật khẩu" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {message && <p className="form-message" role="alert">{message}</p>}
        <button className="primary" type="submit" disabled={!password || busy}>{busy ? 'Đang kiểm tra…' : 'Mở khóa'}</button>
      </form> : <>
        <div className="admin-title"><div><p className="eyebrow">ADMIN</p><h2 id="admin-title">Quản trị Price Check</h2></div><button type="button" onClick={() => void props.onSignOut()}>Đăng xuất</button></div>
        <div className="admin-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'review'} onClick={() => setTab('review')}>Duyệt giá</button>
          <button role="tab" aria-selected={tab === 'catalog'} onClick={() => setTab('catalog')}>Danh mục crawl</button>
          <button role="tab" aria-selected={tab === 'audit'} onClick={() => setTab('audit')}>Lịch sử</button>
        </div>
        {tab === 'review' && <form className="admin-form" onSubmit={submitCorrection}>
          <label>Observation<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Chọn dòng cần xử lý</option>{props.snapshot.pendingRows.map((row) => <option key={row.id} value={row.id}>{row.model} · {row.partnerName} · {row.periodKey}</option>)}</select></label>
          <div className="form-grid"><label>Giá đúng<input inputMode="numeric" placeholder="Để trống nếu không đổi" value={price} onChange={(event) => setPrice(event.target.value)} /></label><label>Tồn kho<select value={stock} onChange={(event) => setStock(event.target.value)}><option value="unchanged">Không đổi</option><option value="in_stock">Còn hàng</option><option value="oos">OOS</option></select></label></div>
          <label>Quyết định<select value={decision} onChange={(event) => setDecision(event.target.value)}><option value="confirmed">Xác nhận</option><option value="pending">Giữ Pending</option><option value="rejected">Loại kết quả</option></select></label>
          <label>Ghi chú audit<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Lý do xác nhận hoặc sửa" /></label>
          {message && <p className="form-message" role="status">{message}</p>}<button className="primary" disabled={busy} type="submit">Lưu thay đổi</button>
        </form>}
        {tab === 'catalog' && <CatalogManager snapshot={props.snapshot} onSave={props.onConfigMutation} />}
        {tab === 'audit' && <div className="audit-list"><p>Các điều chỉnh mới nhất xuất hiện tức thời trong dashboard. Dữ liệu crawler gốc luôn được giữ nguyên.</p>{props.snapshot.corrections.length ? props.snapshot.corrections.map((correction) => {
          const observation = [...props.snapshot.weeklyRows, ...props.snapshot.dailyRows, ...props.snapshot.pendingRows].find((row) => row.id === correction.observation_id)
          return <div key={correction.id}><strong>{observation?.model ?? correction.observation_id}</strong><span>{observation ? `${observation.partnerName} · ${observation.periodKey} · ` : ''}{correction.review_decision} · {new Date(correction.created_at).toLocaleString('vi-VN')}</span><small>{correction.note}</small></div>
        }) : <p className="empty-state">Chưa có điều chỉnh thủ công.</p>}</div>}
      </>}
    </section>
  </div>
}

function CatalogManager({ snapshot, onSave }: { snapshot: DashboardSnapshot, onSave: Props['onConfigMutation'] }) {
  const [kind, setKind] = useState<ConfigTable>('product_links')
  const [value, setValue] = useState('')
  const [productId, setProductId] = useState(snapshot.products[0]?.id ?? '')
  const [retailerId, setRetailerId] = useState(snapshot.retailers[0]?.id ?? '')
  const [linkId, setLinkId] = useState(snapshot.productLinks[0]?.id ?? '')
  const [overridePrice, setOverridePrice] = useState('')
  const [overrideNote, setOverrideNote] = useState('')
  const [message, setMessage] = useState('')
  const items = kind === 'products' ? snapshot.products : kind === 'retailers' ? snapshot.retailers : kind === 'product_links' ? snapshot.productLinks : snapshot.priceOverrides
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setMessage('')
    try {
      if (kind === 'products') await onSave(kind, { name: value, category: 'Other', active: true })
      else if (kind === 'retailers') await onSave(kind, { code: value.trim().toUpperCase(), name: value.trim(), active: true })
      else if (kind === 'product_links') {
        if (!productId || !retailerId || !/^https?:\/\//.test(value)) throw new Error('Chọn model, partner và nhập URL hợp lệ.')
        await onSave(kind, { product_id: productId, retailer_id: retailerId, url: value.trim(), active: true })
      } else {
        const parsed = Number(overridePrice.replace(/\D/g, ''))
        if (!linkId || !Number.isFinite(parsed) || parsed <= 0 || !overrideNote.trim()) throw new Error('Chọn URL, nhập giá và lý do override.')
        await onSave(kind, { product_link_id: linkId, override_price: parsed, note: overrideNote.trim(), active: true })
      }
      setValue(''); setMessage('Đã lưu danh mục.')
      setOverridePrice(''); setOverrideNote('')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể lưu.') }
  }
  return <div className="catalog-manager"><label>Loại dữ liệu<select value={kind} onChange={(event) => setKind(event.target.value as ConfigTable)}><option value="products">Model</option><option value="retailers">Partner</option><option value="product_links">URL sản phẩm</option><option value="price_overrides">Override crawler</option></select></label>
    <form className="catalog-form" onSubmit={submit}>
      {(kind === 'products' || kind === 'retailers') && <label>Tên mới<input aria-label="Giá trị mới" value={value} onChange={(event) => setValue(event.target.value)} placeholder={kind === 'products' ? 'Tên model' : 'Tên partner'} /></label>}
      {kind === 'product_links' && <><div className="form-grid"><label>Model<select value={productId} onChange={(event) => setProductId(event.target.value)}>{snapshot.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label>Partner<select value={retailerId} onChange={(event) => setRetailerId(event.target.value)}>{snapshot.retailers.map((retailer) => <option key={retailer.id} value={retailer.id}>{retailer.name}</option>)}</select></label></div><label>URL sản phẩm<input aria-label="URL sản phẩm" type="url" value={value} onChange={(event) => setValue(event.target.value)} placeholder="https://…" /></label></>}
      {kind === 'price_overrides' && <><label>URL áp dụng<select value={linkId} onChange={(event) => setLinkId(event.target.value)}>{snapshot.productLinks.map((link) => {
        const product = snapshot.products.find((item) => item.id === link.product_id)
        const retailer = snapshot.retailers.find((item) => item.id === link.retailer_id)
        return <option key={link.id} value={link.id}>{product?.name ?? link.product_id} · {retailer?.code ?? link.retailer_id}</option>
      })}</select></label><div className="form-grid"><label>Giá override<input inputMode="numeric" value={overridePrice} onChange={(event) => setOverridePrice(event.target.value)} /></label><label>Lý do<input value={overrideNote} onChange={(event) => setOverrideNote(event.target.value)} /></label></div></>}
      <button type="submit">{kind === 'product_links' ? 'Thêm URL' : kind === 'price_overrides' ? 'Thêm override' : 'Thêm'}</button>
    </form>{message && <p className="form-message">{message}</p>}
    <div className="config-list">{items.map((item) => {
      const label = 'name' in item ? String(item.name) : 'url' in item ? String(item.url) : 'override_price' in item ? `${Number(item.override_price).toLocaleString('vi-VN')} ₫` : ''
      return <div key={item.id}><span>{label}</span><button type="button" onClick={() => void onSave(kind, { active: !item.active }, item.id)}>{item.active ? 'Tắt' : 'Bật'}</button></div>
    })}</div>
  </div>
}
