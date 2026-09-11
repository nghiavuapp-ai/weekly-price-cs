const dailyRows=PAYLOAD.dailyRows||[],partners=Object.keys(PAYLOAD.summary.partners),categories=['All',...Object.keys(PAYLOAD.summary.categories)],weeks=[...new Set(weeklyRows.map(r=>r.week_id))],dailyDates=PAYLOAD.dailyDates||[],dailyWeeks=new Set(PAYLOAD.dailyWeeks||[]),colors={FPT:'#4568a9',Viettel:'#cb7a3d',CPS:'#8864aa',MW:'#075e48',Shopdunk:'#248d85'},$=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const compact=value=>value==null?'—':(value/1e6).toLocaleString('vi-VN',{maximumFractionDigits:2})+' tr';
const full=value=>value==null?'—':new Intl.NumberFormat('vi-VN').format(value)+' ₫';
let state={granularity:'week',week:weeks.at(-1),date:dailyDates.at(-1)||'',category:'iPhone',model:'All',partner:'All'};
const isDaily=()=>state.granularity==='day';
const isDetail=()=>state.model!=='All';
const sourceRows=()=>isDaily()?dailyRows:weeklyRows;

function localDate(value){const [year,month,day]=value.split('-').map(Number);return new Date(year,month-1,day)}
function formatDate(value,withWeekday=false){const date=localDate(value),label=date.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:withWeekday?undefined:'numeric'});return withWeekday?['CN','T2','T3','T4','T5','T6','T7'][date.getDay()]+' '+label:label}
function current(withPartner=true){return sourceRows().filter(row=>(isDaily()?row.date===state.date:row.week_id===state.week)&&(state.category==='All'||row.category===state.category)&&(state.model==='All'||row.canonical_model===state.model)&&(!withPartner||state.partner==='All'||row.partner===state.partner))}
function previousDate(){const index=dailyDates.indexOf(state.date);return index>0?dailyDates[index-1]:null}
function prior(withPartner=true){const key=isDaily()?previousDate():weeks[weeks.indexOf(state.week)-1];return key?sourceRows().filter(row=>(isDaily()?row.date===key:row.week_id===key)&&(state.category==='All'||row.category===state.category)&&(state.model==='All'||row.canonical_model===state.model)&&(!withPartner||state.partner==='All'||row.partner===state.partner)):[]}
function availableModels(){const rows=isDaily()?dailyRows:weeklyRows;return[...new Set(rows.filter(row=>state.category==='All'||row.category===state.category).map(row=>row.canonical_model))].sort((a,b)=>a.localeCompare(b,'vi'))}

function options(){
  const models=availableModels();
  if(state.model!=='All'&&!models.includes(state.model))state.model='All';
  $('week').innerHTML=weeks.slice().reverse().map(week=>`<option value="${esc(week)}">${esc(week)}</option>`).join('');$('week').value=state.week;
  $('date').innerHTML=dailyDates.slice().reverse().map(date=>`<option value="${date}">${formatDate(date)}</option>`).join('');$('date').value=state.date;
  $('category').innerHTML=categories.map(category=>`<option value="${esc(category)}">${category==='All'?'Tất cả Category':esc(category)}</option>`).join('');$('category').value=state.category;
  $('model').innerHTML='<option value="All">Tất cả model</option>'+models.map(model=>`<option value="${esc(model)}">${esc(model)}</option>`).join('');$('model').value=state.model;
  $('partner').innerHTML='<option value="All">Tất cả Partner</option>'+partners.map(partner=>`<option value="${esc(partner)}">${esc(partner)}</option>`).join('');$('partner').value=state.partner;
}

function syncChrome(){
  const daily=isDaily(),weekHasDaily=dailyWeeks.has(state.week);
  $('weekMode').classList.toggle('active',!daily);$('dayMode').classList.toggle('active',daily);
  $('weekMode').setAttribute('aria-pressed',String(!daily));$('dayMode').setAttribute('aria-pressed',String(daily));
  $('dayMode').disabled=!dailyDates.length||(isDetail()&&!weekHasDaily&&!daily);$('dayMode').title=$('dayMode').disabled?'Tuần này chưa có dữ liệu Daily':'';
  $('weekField').hidden=daily;$('dateField').hidden=!daily;$('backWeekly').hidden=!(daily&&isDetail());
  $('brandTitle').textContent=daily?'Daily Price':'Weekly Price';$('trendSection').hidden=!isDetail();$('compareSection').hidden=!isDetail();$('changesLabel').textContent=daily?'Thay đổi ngày':'Thay đổi tuần';
}

function changed(){const old=prior();return current().map(row=>{const previous=old.find(item=>item.canonical_model===row.canonical_model&&item.partner===row.partner);return previous&&row.price_vnd!=null&&previous.price_vnd!=null&&row.price_vnd!==previous.price_vnd?{...row,delta:row.price_vnd-previous.price_vnd}:null}).filter(Boolean)}
function kpis(){
  const now=current(),priced=now.filter(row=>row.price_vnd!=null),models=[...new Set(now.map(row=>row.canonical_model))],activePartners=[...new Set(priced.map(row=>row.partner))],events=changed();let gap=0,gapModel='';
  models.forEach(model=>{const values=now.filter(row=>row.canonical_model===model&&row.price_vnd!=null).map(row=>row.price_vnd);if(values.length>1&&Math.max(...values)-Math.min(...values)>gap){gap=Math.max(...values)-Math.min(...values);gapModel=model}});
  const oos=new Set(now.filter(row=>row.stock_status==='OOS').map(row=>row.canonical_model)),stale=now.filter(row=>row.stale).length;
  $('modelsKpi').textContent=models.length;$('modelsNote').textContent=oos.size+' model có OOS';$('partnersKpi').textContent=activePartners.length+'/'+partners.length;$('partnersNote').textContent=priced.length.toLocaleString('vi-VN')+' check có giá'+(isDaily()&&stale?' · '+stale+' chưa kiểm tra lại':'');
  $('changesKpi').textContent=events.length;$('changesNote').textContent=events.length?events.filter(item=>item.delta<0).length+' giảm · '+events.filter(item=>item.delta>0).length+' tăng':'Không có thay đổi';$('gapKpi').textContent=gap?compact(gap):'—';$('gapNote').textContent=gap?gapModel:'Cần ít nhất 2 Partner có giá';
}

function matrix(){
  const now=current(false),shown=state.partner==='All'?partners:partners.filter(partner=>partner===state.partner),models=[...new Set(now.map(row=>row.canonical_model))].sort((a,b)=>a.localeCompare(b,'vi'));
  $('matrixHead').innerHTML=`<tr><th>Base model</th>${shown.map(partner=>`<th>${esc(partner)}</th>`).join('')}</tr>`;
  $('matrixBody').innerHTML=models.length?models.map(model=>{const cells=shown.map(partner=>now.find(row=>row.canonical_model===model&&row.partner===partner)),values=cells.filter(row=>row?.price_vnd!=null).map(row=>row.price_vnd),low=Math.min(...values,Infinity);return`<tr><td>${esc(model)}</td>${cells.map(row=>matrixCell(row,low)).join('')}</tr>`}).join(''):`<tr><td colspan="${shown.length+1}" class="empty">Không có dữ liệu cho bộ lọc hiện tại.</td></tr>`;
  const period=isDaily()?formatDate(state.date):state.week;$('matrixSub').textContent='So sánh giá cùng model giữa các Partner tại '+(isDaily()?'ngày':'tuần')+' đang chọn.';$('matrixMeta').textContent=models.length+' model · '+shown.length+' Partner · '+period;
}
function matrixCell(row,low){
  if(!row)return'<td class="missing">—</td>';
  const stale=row.stale?`<span class="stale-label">Chưa kiểm tra lại · ${formatDate(row.observed_at.slice(0,10))}</span>`:'';
  if(row.stock_status==='OOS')return`<td class="oos">OOS${stale}</td>`;
  if(row.price_vnd==null)return'<td class="missing">Chưa có giá</td>';
  return`<td class="${row.price_vnd===low?'lowest ':''}${row.stale?'stale':''}">${compact(row.price_vnd)}${stale}</td>`;
}

function chartScale(values){
  const rawMin=Math.min(...values),rawMax=Math.max(...values),span=Math.max(rawMax-rawMin,300000),min=Math.max(0,rawMin-span*.18),max=rawMax+span*.18,w=960,h=310,p={l:58,r:18,t:18,b:42};
  const y=value=>h-p.b-(value-min)/(max-min)*(h-p.t-p.b);
  const grid=[0,.25,.5,.75,1].map(step=>{const value=min+step*(max-min),yy=y(value);return`<line x1="${p.l}" x2="${w-p.r}" y1="${yy}" y2="${yy}" stroke="#e3ebe4"/><text x="${p.l-9}" y="${yy+4}" text-anchor="end" fill="#667b70" font-size="10">${(value/1e6).toFixed(1)}tr</text>`}).join('');
  return{w,h,p,y,grid};
}
function showTip(box,tip,event,html){const rect=box.getBoundingClientRect(),clientX=event.clientX||rect.left+rect.width/2,clientY=event.clientY||rect.top+70;tip.innerHTML=html;tip.style.display='block';tip.style.left=Math.min(clientX-rect.left+12,rect.width-205)+'px';tip.style.top=Math.max(10,clientY-rect.top-40)+'px'}

function weeklyTrend(){
  const box=$('chart'),anchor=weeklyRows.find(row=>row.week_id===state.week),quarterWeeks=weeks.filter(week=>{const row=weeklyRows.find(item=>item.week_id===week);return row&&anchor&&row.quarter===anchor.quarter&&row.fiscal_year===anchor.fiscal_year}).slice(-13),shown=state.partner==='All'?partners:partners.filter(partner=>partner===state.partner),series=weeklyRows.filter(row=>row.canonical_model===state.model&&shown.includes(row.partner)&&quarterWeeks.includes(row.week_id)),values=series.filter(row=>row.price_vnd!=null).map(row=>row.price_vnd);
  $('trendTitle').textContent='Diễn biến giá theo Partner';$('trendSub').textContent=state.model+(anchor?' · Q'+anchor.quarter+' FY'+anchor.fiscal_year+' · '+quarterWeeks.length+'/13 tuần':' · '+state.week);
  if(!values.length){box.innerHTML='<div class="chart-empty">Không có giá hợp lệ cho model này.</div>';$('legend').innerHTML='';return}
  const scale=chartScale(values),x=week=>scale.p.l+quarterWeeks.indexOf(week)/Math.max(quarterWeeks.length-1,1)*(scale.w-scale.p.l-scale.p.r);
  const paths=shown.map(partner=>{const points=quarterWeeks.map(week=>{const row=series.find(item=>item.week_id===week&&item.partner===partner&&item.price_vnd!=null);return row?x(week).toFixed(1)+','+scale.y(row.price_vnd).toFixed(1):null}).filter(Boolean);return points.length?`<polyline fill="none" stroke="${colors[partner]||'#60776c'}" stroke-width="2.7" points="${points.join(' ')}"/>`:''}).join('');
  const points=shown.flatMap(partner=>quarterWeeks.map(week=>weeklyPoint(series,partner,week,x,scale))).join('');
  const ticks=quarterWeeks.map(week=>`<text x="${x(week)}" y="${scale.h-12}" text-anchor="middle" fill="#667b70" font-size="10">${week.replace(/Q\dFY\d+/,'')}</text>`).join('');
  box.innerHTML=`<svg viewBox="0 0 ${scale.w} ${scale.h}" width="100%" height="100%">${scale.grid}${paths}${points}${ticks}</svg><div class="tooltip" id="chartTip"></div>`;
  $('legend').innerHTML=shown.map(partner=>`<span><i class="dot" style="background:${colors[partner]||'#60776c'}"></i>${esc(partner)}</span>`).join('');
  bindWeeklyPoints(box,series,shown);
}
function weeklyPoint(series,partner,week,x,scale){
  const row=series.find(item=>item.week_id===week&&item.partner===partner&&item.price_vnd!=null);if(!row)return'';
  const cx=x(week),cy=scale.y(row.price_vnd),color=colors[partner]||'#60776c';
  if(!dailyWeeks.has(week))return`<circle class="chart-point" data-week="${week}" cx="${cx}" cy="${cy}" r="4.6" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
  return`<g class="drill-point" data-week="${week}" role="button" tabindex="0" aria-label="Xem Daily ${esc(state.model)} · ${week}"><circle cx="${cx}" cy="${cy}" r="11" fill="transparent"/><circle class="visible-point" cx="${cx}" cy="${cy}" r="4.6" fill="${color}" stroke="#fff" stroke-width="1.5"/></g>`;
}
function bindWeeklyPoints(box,series,shown){
  const tip=$('chartTip'),tipHtml=week=>`<b>${week}</b>${shown.map(partner=>{const row=series.find(item=>item.week_id===week&&item.partner===partner);return`<br><span style="color:${colors[partner]||'#fff'}">●</span> ${esc(partner)}: <b>${row?.price_vnd!=null?full(row.price_vnd):(row?.stock_status==='OOS'?'OOS':'—')}</b>`}).join('')}<br><small>${dailyWeeks.has(week)?'Bấm để xem giá theo ngày':'Chưa có dữ liệu Daily'}</small>`;
  box.querySelectorAll('[data-week]').forEach(point=>{point.addEventListener('mouseenter',event=>showTip(box,tip,event,tipHtml(event.currentTarget.dataset.week)));point.addEventListener('mouseleave',()=>tip.style.display='none');point.addEventListener('focus',event=>showTip(box,tip,event,tipHtml(event.currentTarget.dataset.week)));point.addEventListener('blur',()=>tip.style.display='none')});
  box.querySelectorAll('.drill-point').forEach(point=>{const open=()=>enterDaily(point.dataset.week);point.addEventListener('click',open);point.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open()}})});
}

function dailyWeekDays(){
  const available=dailyDates.filter(date=>dailyRows.some(row=>row.date===date&&row.week_id===state.week)),anchor=available.includes(state.date)?state.date:available.at(-1);if(!anchor)return[];
  const start=localDate(anchor);start.setDate(start.getDate()-start.getDay());
  return Array.from({length:7},(_,index)=>{const day=new Date(start);day.setDate(start.getDate()+index);return day.getFullYear()+'-'+String(day.getMonth()+1).padStart(2,'0')+'-'+String(day.getDate()).padStart(2,'0')});
}
function dailyTrend(){
  const box=$('chart'),days=dailyWeekDays(),shown=state.partner==='All'?partners:partners.filter(partner=>partner===state.partner),series=dailyRows.filter(row=>row.week_id===state.week&&row.canonical_model===state.model&&shown.includes(row.partner)),values=series.filter(row=>row.price_vnd!=null&&days.includes(row.date)).map(row=>row.price_vnd);
  $('trendTitle').textContent='Diễn biến giá theo ngày';
  if(!days.length||!values.length){box.innerHTML='<div class="chart-empty">Không có giá Daily hợp lệ cho model trong tuần này.</div>';$('legend').innerHTML='';return}
  const scale=chartScale(values),x=date=>scale.p.l+days.indexOf(date)/6*(scale.w-scale.p.l-scale.p.r),selectedX=x(state.date);
  const highlight=`<rect x="${selectedX-18}" y="${scale.p.t}" width="36" height="${scale.h-scale.p.t-scale.p.b}" rx="8" fill="#eff8d6"/>`;
  const segments=shown.flatMap(partner=>days.slice(0,-1).map((day,index)=>{const first=series.find(row=>row.partner===partner&&row.date===day&&row.price_vnd!=null),second=series.find(row=>row.partner===partner&&row.date===days[index+1]&&row.price_vnd!=null);return first&&second?`<line x1="${x(day)}" y1="${scale.y(first.price_vnd)}" x2="${x(days[index+1])}" y2="${scale.y(second.price_vnd)}" stroke="${colors[partner]||'#60776c'}" stroke-width="2.7"/>`:''})).join('');
  const points=shown.flatMap(partner=>days.map(day=>{const row=series.find(item=>item.date===day&&item.partner===partner&&item.price_vnd!=null);return row?`<circle class="daily-point" data-date="${day}" data-partner="${esc(partner)}" cx="${x(day)}" cy="${scale.y(row.price_vnd)}" r="${day===state.date?6:4.6}" fill="${row.stale?'#fff':(colors[partner]||'#60776c')}" stroke="${colors[partner]||'#60776c'}" stroke-width="${row.stale?2.5:1.5}"/>`:''})).join('');
  const ticks=days.map(day=>`<text x="${x(day)}" y="${scale.h-12}" text-anchor="middle" fill="#667b70" font-size="10">${formatDate(day,true)}</text>`).join('');
  box.innerHTML=`<svg viewBox="0 0 ${scale.w} ${scale.h}" width="100%" height="100%">${highlight}${scale.grid}${segments}${points}${ticks}</svg><div class="tooltip" id="chartTip"></div>`;
  $('trendSub').textContent=state.model+' · '+state.week+' · tối đa 7 ngày đã load';$('legend').innerHTML=shown.map(partner=>`<span><i class="dot" style="background:${colors[partner]||'#60776c'}"></i>${esc(partner)}</span>`).join('')+'<span>○ Chưa kiểm tra lại</span>';
  bindDailyPoints(box,series);
}
function bindDailyPoints(box,series){const tip=$('chartTip');box.querySelectorAll('.daily-point').forEach(point=>{const content=()=>{const row=series.find(item=>item.date===point.dataset.date&&item.partner===point.dataset.partner);return`<b>${formatDate(point.dataset.date)}</b><br><span style="color:${colors[row.partner]||'#fff'}">●</span> ${esc(row.partner)}: <b>${full(row.price_vnd)}</b>${row.stale?`<br><small>Chưa kiểm tra lại · giá từ ${formatDate(row.observed_at.slice(0,10))}</small>`:''}`};point.addEventListener('mouseenter',event=>showTip(box,tip,event,content()));point.addEventListener('mouseleave',()=>tip.style.display='none');point.addEventListener('click',()=>{state.date=point.dataset.date;render()})})}
function trend(){isDaily()?dailyTrend():weeklyTrend()}

function spark(history){
  const valid=history.filter(item=>item.price!=null);if(valid.length<2)return'—';
  const min=Math.min(...valid.map(item=>item.price)),max=Math.max(...valid.map(item=>item.price)),w=132,h=34,pad=8,x=index=>pad+index/Math.max(history.length-1,1)*(w-pad*2),y=value=>h-6-(value-min)/Math.max(max-min,1)*(h-12);
  const points=history.map((item,index)=>item.price==null?null:x(index)+','+y(item.price)).filter(Boolean).join(' '),dots=history.map((item,index)=>item.price==null?'':`<circle class="spark-point" data-label="${esc(item.label)}" data-price="${item.price}" cx="${x(index)}" cy="${y(item.price)}" r="3.3" fill="#075e48"/>`).join('');
  return`<svg class="spark" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="#075e48" stroke-width="2" points="${points}"/>${dots}</svg>`;
}
function compare(){
  const now=current(false),old=prior(false),shown=state.partner==='All'?partners:partners.filter(partner=>partner===state.partner),historyKeys=isDaily()?dailyDates.filter(date=>date<=state.date).slice(-4):weeks.slice(Math.max(0,weeks.indexOf(state.week)-3),weeks.indexOf(state.week)+1);
  const items=shown.map(partner=>({partner,current:now.find(row=>row.partner===partner),prior:old.find(row=>row.partner===partner),history:historyKeys.map(key=>{const row=sourceRows().find(item=>(isDaily()?item.date===key:item.week_id===key)&&item.canonical_model===state.model&&item.partner===partner);return{label:isDaily()?formatDate(key):key,price:row?.price_vnd??null}})}));
  const priced=items.filter(item=>item.current?.price_vnd!=null).sort((a,b)=>a.current.price_vnd-b.current.price_vnd),low=priced[0]?.current.price_vnd;
  $('compareTitle').textContent='So sánh Partner — '+state.model;$('compareSub').textContent=(isDaily()?formatDate(state.date):state.week)+' · xếp hạng theo giá bán lẻ';$('compareMeta').textContent=priced.length+'/'+items.length+' Partner có giá';
  $('compareHead').innerHTML=`<tr><th>Hạng</th><th>Partner</th><th>Giá hiện tại</th><th>Chênh lệch so với thấp nhất</th><th>${isDaily()?'So với ngày kiểm tra trước':'So với tuần trước'}</th><th>${isDaily()?'4 ngày kiểm tra gần nhất':'4 tuần gần nhất'}</th></tr>`;
  $('compareBody').innerHTML=items.sort((a,b)=>(a.current?.price_vnd??Infinity)-(b.current?.price_vnd??Infinity)).map((item,index)=>compareRow(item,index,low)).join('');
  const tip=$('sparkTip');$('compareBody').querySelectorAll('.spark-point').forEach(point=>{point.addEventListener('mouseenter',event=>{tip.innerHTML=`<b>${point.dataset.label}</b><br>${full(Number(point.dataset.price))}`;tip.style.display='block';tip.style.left=event.clientX+10+'px';tip.style.top=event.clientY-46+'px'});point.addEventListener('mouseleave',()=>tip.style.display='none')});
}
function compareRow(item,index,low){
  const price=item.current?.price_vnd,delta=price!=null&&item.prior?.price_vnd!=null?price-item.prior.price_vnd:null,gap=price!=null?price-low:null,stale=item.current?.stale?`<span class="stale-label">Chưa kiểm tra lại · ${formatDate(item.current.observed_at.slice(0,10))}</span>`:'';
  return`<tr><td>${price!=null?`<span class="rank">${index+1}</span>`:'—'}</td><td>${esc(item.partner)}</td><td class="${item.current?.stale?'stale':''}">${price!=null?compact(price)+stale:(item.current?.stock_status==='OOS'?'OOS':'—')}</td><td class="${gap>0?'gap':''}">${gap==null?'—':gap===0?'Thấp nhất':'+'+compact(gap)}</td><td class="${delta>0?'up':delta<0?'down':''}">${delta==null?'—':delta===0?'Không đổi':(delta>0?'↑':'↓')+' '+compact(Math.abs(delta))}</td><td>${spark(item.history)}</td></tr>`;
}

function enterDaily(week){const dates=dailyDates.filter(date=>dailyRows.some(row=>row.date===date&&row.week_id===week));if(!dates.length)return;state.granularity='day';state.week=week;state.date=dates.at(-1);state.partner='All';render()}
function showWeekly(){state.granularity='week';if(!weeks.includes(state.week))state.week=weeks.at(-1);render()}
function showDaily(){if(!dailyDates.length)return;if(isDetail()){const dates=dailyDates.filter(date=>dailyRows.some(row=>row.date===date&&row.week_id===state.week));if(!dates.length)return;state.date=dates.at(-1)}else{state.date=state.date||dailyDates.at(-1);const row=dailyRows.find(item=>item.date===state.date);if(row)state.week=row.week_id}state.granularity='day';render()}
function render(){options();syncChrome();matrix();kpis();if(isDetail()){trend();compare()}}

$('week').addEventListener('change',event=>{state.week=event.target.value;render()});
$('date').addEventListener('change',event=>{state.date=event.target.value;const row=dailyRows.find(item=>item.date===state.date);if(row)state.week=row.week_id;render()});
$('category').addEventListener('change',event=>{state.category=event.target.value;state.model='All';render()});
$('model').addEventListener('change',event=>{state.model=event.target.value;render()});
$('partner').addEventListener('change',event=>{state.partner=event.target.value;render()});
$('weekMode').addEventListener('click',showWeekly);$('dayMode').addEventListener('click',showDaily);$('backWeekly').addEventListener('click',showWeekly);
render();
