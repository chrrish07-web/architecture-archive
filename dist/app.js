'use strict';
const $ = s => document.querySelector(s);
const cats = ['전체','건축 형태','공간 구성','재료','조명','미분류'];
const unspecified = '프로젝트 미지정';
let db, records=[], category='전체', mode='image', file=null, previewUrl, cardUrls=[], detailUrl, timer;
const dialog=$('dialog');
function el(tag, str, cls) {
  const node=document.createElement(tag);
  if(str!=null) node.textContent=str;
  if(cls) node.className=cls;
  return node;
}
function button(label,fn,cls) {
  const n=el('button',label,cls); n.type='button'; n.onclick=fn; return n;
}
function option(label,value=label){return new Option(label,value)}
function projects(){return [...new Set(records.map(r=>r.project))].sort((a,b)=>a.localeCompare(b,'ko'))}
function http(value){try{return /^https?:\/\//i.test(value)&&['http:','https:'].includes(new URL(value).protocol)}catch{return false}}
function notify(str){clearTimeout(timer);$('#toast').textContent=str;timer=setTimeout(()=>$('#toast').textContent='',2800)}
function openDB(){return new Promise((resolve,reject)=>{
  const req=indexedDB.open('ARCHIVE-studio',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('references',{keyPath:'id'});
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
})}
function access(operation,value){return new Promise((resolve,reject)=>{
  const tx=db.transaction('references',operation==='getAll'?'readonly':'readwrite');
  const store=tx.objectStore('references'),req=operation==='getAll'?store.getAll():store[operation](value);
  tx.oncomplete=()=>resolve(req.result);tx.onabort=()=>reject(tx.error||req.error);
})}
async function refresh(){
  db ||= await openDB();records=(await access('getAll')).sort((a,b)=>b.createdAt-a.createdAt);
}
async function start(){
  try{await refresh();$('#failure').replaceChildren();home()}
  catch{$('#failure').replaceChildren('레퍼런스를 불러오지 못했습니다. ',button('다시 시도',start))}
}
function clearFilters(){category='전체';$('#search').value='';$('#projectFilter').value='';home()}
function home(){
  URL.revokeObjectURL(detailUrl);$('#detail').hidden=true;$('#home').hidden=false;
  $('#count').textContent='전체 '+records.length+'개';$('#empty').hidden=!!records.length;$('#browse').hidden=!records.length;
  const select=$('#projectFilter'),previous=select.value;select.replaceChildren(option('전체 프로젝트',''),...projects().map(p=>option(p)));
  if(projects().includes(previous))select.value=previous;
  $('#chips').replaceChildren(...cats.map(c=>{
    const b=button(c,()=>{category=c;home()},c===category?'selected':'');b.setAttribute('aria-pressed',c===category);return b;
  }));drawCards()
}
const sourceSites = {
  Pinterest: ['pinterest.com', 'pinterest.co.kr', 'pin.it', 'pinimg.com'],
  Instagram: ['instagram.com'], ArchDaily: ['archdaily.com'],
  Dezeen: ['dezeen.com'], Behance: ['behance.net']
};
function inferredSource(value) {
  if (!http(value)) return '';
  const host = new URL(value).hostname.replace(/^www\./, '');
  return Object.keys(sourceSites).find(name => sourceSites[name].some(domain =>
    host === domain || host.endsWith('.' + domain))) || host.slice(0, 200);
}
function previewAddress(value) {
  if (!http(value)) return '';
  const url = new URL(value);
  if (url.username || url.password) return '';
  if (/\.(png|webp|jpe?g|gif|avif)$/i.test(url.pathname)) return url.href;
  if (!url.hostname.includes('.') || /(?:\.local|\.localhost|\.internal|\d\.\d+)$/.test(url.hostname)) return '';
  url.hash = '';
  return 'https://api.microlink.io/?' + new URLSearchParams({ url: url.href, embed: 'image.url' });
}
let manualSource = false, previewTimer, previewVersion = 0;
function syncSource() {
  const input = $('#source');
  if (!manualSource) input.value = mode === 'url' ? inferredSource($('#url').value.trim()) : '';
  for (const choice of $('#sourceChoices').children) {
    const active = choice.textContent === input.value.trim();
    choice.classList.toggle('selected', active);
    choice.setAttribute('aria-pressed', String(active));
  }
}
for (const name of [...Object.keys(sourceSites), '직접 촬영']) {
  $('#sourceChoices').append(button(name, () => {
    manualSource = true;
    $('#source').value = name;
    syncSource();
  }));
}
$('#source').oninput = () => { manualSource = true; syncSource(); };
function updatePreview() {
  clearTimeout(previewTimer);
  const version = ++previewVersion;
  const box = $('#linkPreview'), status = box.querySelector('span');
  const old = box.querySelector('img');
  old.hidden = true;
  const value = $('#url').value.trim();
  box.hidden = mode !== 'url' || !http(value);
  $('#linkNote').hidden = mode !== 'url';
  if (box.hidden) return;
  const address = previewAddress(value);
  const unavailable = '대표 이미지를 불러올 수 없어요. 링크는 저장할 수 있어요.';
  status.textContent = address ? '미리보기 이미지를 불러오는 중…' : unavailable;
  if (!address) return;
  previewTimer = setTimeout(() => {
    const img = new Image();
    img.alt = '링크 미리보기'; img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      if (version !== previewVersion) return;
      old.replaceWith(img);
      status.textContent = '';
    };
    img.onerror = () => { if (version === previewVersion) status.textContent = unavailable; };
    img.src = address;
  }, 350);
}
$('#url').oninput = () => { syncSource(); updatePreview(); };
dialog.addEventListener('close', () => { clearTimeout(previewTimer); ++previewVersion; });
function media(parent,r,detail=false){
  parent.append(el('span','미리보기 없음'));
  if(!r.imageBlob && !r.previewAddress && !(http(r.url)&&/\.(png|webp|jpe?g)([?#]|$)/i.test(r.url)))return;
  const img=el('img');img.alt=r.title;img.loading=detail?'eager':'lazy';img.referrerPolicy='no-referrer';
  img.onerror=()=>img.remove();
  if(r.imageBlob){const url=URL.createObjectURL(r.imageBlob);if(detail)detailUrl=url;else cardUrls.push(url);img.src=url}else img.src=r.previewAddress || r.url;
  parent.append(img)
}
function drawCards(){
  cardUrls.forEach(u=>URL.revokeObjectURL(u));cardUrls=[];
  const key=$('#search').value.trim().toLocaleLowerCase(),project=$('#projectFilter').value;
  const filtered=records.filter(r=>(category==='전체'||category===r.category)&&(!project||r.project===project)&&[r.title,r.source].some(v=>v.toLocaleLowerCase().includes(key)));
  $('#results').textContent='검색 결과 '+filtered.length+'개';
  const grid=$('#grid');grid.replaceChildren();
  if(!filtered.length && records.length)grid.append(el('p',key?'검색 결과가 없습니다. 다른 키워드나 분류를 선택해 보세요.':'해당 분류에 저장된 레퍼런스가 없습니다.'));
  for(const r of filtered){
    const card=button('',()=>showDetail(r),'card'),thumb=el('div',null,'thumb');media(thumb,r);thumb.append(el('span',r.category,'badge'));
    const body=el('div',null,'cardbody');body.append(el('strong',r.title),el('span','↗ '+r.source),el('span',r.project+' · '+new Date(r.createdAt).toLocaleDateString('ko-KR'),'meta'));card.append(thumb,body);grid.append(card)
  }
}
function showDetail(r){
  $('#home').hidden=true;const page=$('#detail');page.hidden=false;page.replaceChildren();window.scrollTo(0,0);
  const bar=el('div',null,'bar detailTop'),save=button('변경사항 저장',submit,'primary');
  bar.append(button('목록으로',home),el('strong',r.title),save);
  const layout=el('div',null,'detailGrid'),left=el('div'),viewer=el('div',null,'viewer');media(viewer,r,true);left.append(viewer,el('p',[r.imageBlob?r.imageBlob.type.split('/')[1].toUpperCase()+' · '+(r.imageBlob.size/1024).toFixed(1)+' KB':'URL',new Date(r.createdAt).toLocaleDateString('ko-KR')+' 등록'].join('　·　'),'meta'));
  const panel=el('div',null,'panel'),cat=el('select'),proj=el('input'),err=el('p',null,'err');
  cat.append(...cats.slice(1).map(c=>option(c)));cat.value=r.category;
  proj.value=r.project===unspecified?'':r.project;proj.placeholder='프로젝트명을 입력하세요';
  const first=el('label','카테고리 선택'),second=el('label','설계 프로젝트');first.append(cat);second.append(proj);
  const tags=el('div',null,'tags');projects().filter(p=>p!==unspecified).forEach(p=>tags.append(button(p,()=>proj.value=p)));
  panel.append(el('h2',r.title),el('p','출처 · '+r.source),first,second,tags,err);
  if(http(r.url)){const link=el('a','원본 링크 열기 ↗');link.href=r.url;link.target='_blank';link.rel='noopener noreferrer';panel.append(link)}
  const remove = button('레퍼런스 삭제', async () => {
    if (!window.confirm('「' + r.title + '」 레퍼런스를 삭제할까요? 삭제하면 복구할 수 없습니다.')) return;
    remove.disabled = save.disabled = true;
    try {
      await access('delete', r.id);
      records = records.filter(item => item.id !== r.id);
      home();
      notify('레퍼런스를 삭제했습니다.');
    } catch {
      err.textContent = '삭제하지 못했습니다. 다시 시도해 주세요.';
    } finally {
      remove.disabled = save.disabled = false;
    }
  }, 'err');
  panel.append(remove);
  layout.append(left,panel);page.append(bar,layout);
  async function submit(){
    if(proj.value.trim().length>40){err.textContent='프로젝트명은 최대 40자까지 입력할 수 있습니다.';proj.focus();return}
    save.disabled=true;
    try{const updated={...r,category:cat.value,project:proj.value.trim()||unspecified};await access('put',updated);records=records.map(item=>item.id===r.id?updated:item);home();notify('변경사항이 저장되었습니다.')}
    catch{err.textContent='변경사항을 저장하지 못했습니다. 다시 시도해 주세요.'}finally{save.disabled=false}
  }
}
function setMode(next){
  mode=next;syncSource();updatePreview();$('#drop').hidden=next!=='image';$('#urlField').hidden=next!=='url';$('#error').textContent='';
  for(const [selector,type] of [['#imageTab','image'],['#urlTab','url']]){$(selector).classList.toggle('selected',next===type);$(selector).setAttribute('aria-pressed',next===type)}
}
function choose(f){
  URL.revokeObjectURL(previewUrl);file=null;$('#preview').hidden=true;$('#fileLabel').textContent='이미지를 끌어오거나 파일을 선택하세요';$('#error').textContent='';
  if(!f)return;
  if(!['image/jpeg','image/png','image/webp'].includes(f.type)){$('#error').textContent='JPG, PNG, WEBP 파일만 업로드할 수 있습니다.';return}
  if(f.size>10*1024*1024){$('#error').textContent='파일 크기는 10MB 이하로 제한됩니다.';return}
  file=f;previewUrl=URL.createObjectURL(f);$('#preview').src=previewUrl;$('#preview').hidden=false;$('#fileLabel').textContent=f.name
}
document.querySelectorAll('.add').forEach(b=>b.onclick=()=>{$('form').reset();manualSource=false;choose(null);setMode('image');$('#counter').textContent='0/80';dialog.showModal()});
document.querySelectorAll('.close').forEach(b=>b.onclick=()=>dialog.close());
$('#imageTab').onclick=()=>setMode('image');$('#urlTab').onclick=()=>setMode('url');
$('#titleInput').oninput=e=>$('#counter').textContent=e.target.value.length+'/80';
$('#file').onchange=e=>choose(e.target.files[0]);
$('#drop').ondragover=e=>{e.preventDefault();$('#drop').classList.add('drag')};$('#drop').ondragleave=()=>$('#drop').classList.remove('drag');
$('#drop').ondrop=e=>{e.preventDefault();$('#drop').classList.remove('drag');choose(e.dataTransfer.files[0])};
$('form').onsubmit=async e=>{
  e.preventDefault();const title=$('#titleInput').value.trim(),source=$('#source').value.trim() || (mode==='url' ? inferredSource($('#url').value.trim()) : ''),url=$('#url').value.trim(),errors=[];
  if(mode==='image'&&!file)errors.push('이미지 파일을 선택해 주세요.');
  if(mode==='url'&&!http(url))errors.push('올바른 URL을 입력해 주세요.');
  if(!title)errors.push('레퍼런스 제목을 입력해 주세요.');
  if(!source)errors.push('자료의 출처를 입력해 주세요.');
  if(title.length>80||source.length>200||(mode==='url'&&url.length>2048))errors.push('입력 가능한 글자 수를 초과했습니다.');
  $('#error').textContent=errors.join(' ');if(errors.length)return;
  $('#save').disabled=true;
  try{db ||= await openDB();const record={id:crypto.randomUUID(),sourceType:mode,title,source,category:'미분류',project:unspecified,createdAt:Date.now(),...(mode==='image'?{imageBlob:file}:{url,previewAddress:previewAddress(url)})};
    await access('put',record);records.unshift(record);dialog.close();clearFilters();notify('레퍼런스가 저장되었습니다.')
  }catch(err){$('#error').textContent=err.name==='QuotaExceededError'?'저장 공간이 부족합니다. 불필요한 자료를 정리해 주세요.':'저장에 실패했습니다. 다시 시도해 주세요.'}
  finally{$('#save').disabled=false}
};
$('#reset').onclick=clearFilters;$('#search').oninput=drawCards;$('#projectFilter').onchange=drawCards;
$('#archiveNav').onclick=clearFilters;$('#projectNav').onclick=()=>{home();if(records.length){$('#projectFilter').focus();try{$('#projectFilter').showPicker()}catch{}}else notify('레퍼런스를 추가하면 프로젝트를 지정할 수 있습니다.')};
start();
