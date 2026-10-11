/* Interactive Novel 2.0 — The Secret Host / immersive entry
 * All stage copy is diegetic UX; the real story and its partner identity
 * are generated and controlled by the canonical novelist runtime.
 */
(function(){
  'use strict';
  const nativeMainMenu=renderMainMenu;
  const nativeCharacterDetail=renderCharacterDetail;
  const read=(key,fallback='')=>{try{return sessionStorage.getItem(key)||fallback}catch{return fallback}};
  const write=(key,value)=>{try{sessionStorage.setItem(key,value)}catch{}};

  // Engraved theatre glyphs. Icon + concise caption is intentional:
  // icon-only approval and age consent are too ambiguous for mobile.
  const glyphPaths={
    curtain:'<path d="M3 4h18M5 4v16m14-16v16M5 5c4 3 5 8 7 11 2-3 3-8 7-11M5 20q4-5 7-4 3-1 7 4M9 5q0 7 3 11 3-4 3-11"/>',
    seal:'<circle cx="12" cy="12" r="8.1"/><circle cx="12" cy="12" r="10.2" stroke-dasharray="1.2 2.9" stroke-width=".85"/><path d="m8.5 12 2.3 2.5 4.8-5"/>',
    cameo:'<path d="M5 21v-2c0-3.1 2.4-5.4 7-5.4s7 2.3 7 5.4v2M12 13c2.7 0 4.5-2.4 4.5-5.4S14.7 3 12 3 7.5 5 7.5 7.6 9.3 13 12 13Z"/><path d="M4 21h16"/>',
    book:'<path d="M12 19c-3.7-2.1-6.4-2.2-9-1.3V5.5c3-.9 6-.4 9 1.5 3-1.9 6-2.4 9-1.5v12.2c-2.6-.9-5.3-.8-9 1.3Z"/><path d="M12 7v12M4 20.5c3-.5 5.3-.1 8 1 2.7-1.1 5-1.5 8-1"/>',
    keyhole:'<path d="M12 2.5a8 8 0 0 0-8 8c0 4.4 3.6 8 8 11 4.4-3 8-6.6 8-11a8 8 0 0 0-8-8Z"/><circle cx="12" cy="9.5" r="2.4"/><path d="m11 11.7-1.5 5h5l-1.5-5"/>',
    heart:'<path d="M12 20.5 4.8 13C-2 6.4 7 1.3 12 7c5-5.7 14-0.6 7.2 6L12 20.5Z"/><path d="m9 11 3 2 3-3" opacity=".55"/>',
    compass:'<circle cx="12" cy="12" r="9"/><path d="m14.8 9.2-1.7 4-4 1.7 1.7-4 4-1.7ZM12 1v3M12 20v3M1 12h3M20 12h3"/>',
    mirror:'<ellipse cx="12" cy="9" rx="6.2" ry="7"/><path d="M12 16v5m-4 1h8M6.5 3.5 4 2m13.5 1.5L20 2"/>',
    repeat:'<path d="m18.5 7-2.7-2.7L18.5 1.6M15.8 4.3h-7A5.5 5.5 0 0 0 3.5 10M5.5 17l2.7 2.7L5.5 22.4m2.7-2.7h7a5.5 5.5 0 0 0 5.3-5.7"/>',
    photos:'<rect x="7" y="6" width="13" height="15" rx="1"/><path d="M4 17V3h13M9 17l3.5-4 2.5 2 2-2 2 2M12 9.5h.01"/>',
    check:'<circle cx="12" cy="12" r="9"/><path d="m7 12 3.2 3.3L17.5 8"/>',
    door:'<path d="M5 21V3h13v18M2 21h20M9 10h.01"/><path d="M18 6h3v12h-3"/>'
  };
  const vintageIcon=name=>'<span class="vintageGlyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">'+(glyphPaths[name]||glyphPaths.keyhole)+'</svg></span>';
  const vintageButton=(label,name,extra='')=>'<span class="vintageActionInner">'+vintageIcon(name)+'<span class="vintageCaption">'+esc(label)+'</span></span>'+extra;
  function decorateButton(element,name){
    if(!element||element.classList.contains('vintageAction'))return;
    const label=element.textContent.trim();
    element.classList.add('vintageAction');
    element.textContent='';
    const glyph=document.createElement('span');
    glyph.innerHTML=vintageIcon(name);
    const caption=document.createElement('span');caption.className='vintageCaption';caption.textContent=label;
    element.append(glyph.firstElementChild,caption);
  }

  let mood=read('novel2_host_mood','тайна');
  const moods=['тайна','притяжение','приключение'];
  function skipHost(){
    write('novel2_host_skip','1');
    try{localStorage.setItem('novel2_host_introduced','1')}catch{}
    nativeMainMenu();
    void loadLibrary();
  }
  const ownRole=()=>String(state?.role||'A');
  function actorAvailable(){
    const role=ownRole();
    return Boolean(state?.characters?.[role]?.ready||
      (characterLooks[role]||[]).some(x=>x?.key==='canonical'&&x?.image&&x?.model!=='existing'));
  }
  function shouldHost(){
    if(!state||state.mode==='reader'||storyDraft||actorSheetTask?.active)return false;
    if(read('novel2_host_skip')==='1')return false;
    // The invitation is an onboarding, never an interruption of a saved book.
    if(libraryBooks.length>0)return false;
    try{if(localStorage.getItem('novel2_host_introduced')==='1')return false}catch{}
    return true;
  }
  const actorConfirmed=()=>Boolean(state?.characters?.[ownRole()]?.ready);
  const narratorCache=new Map();
  let worldCache=null,worldTimer=null,hostPlaceError='';
  const hostPlace=()=>read('novel2_host_place','');
  const hostStep=()=>Math.max(0,Math.min(4,Number(read('novel2_host_step','0'))||0));
  function stopWorldPoll(){if(worldTimer){clearTimeout(worldTimer);worldTimer=null}}
  function goToStep(next){
    stopWorldPoll();hostPlaceError='';
    write('novel2_host_step',String(next));lobby();
  }
  const fallbackLines={
    invitation:[
      'Здравствуйте, уважаемый Гость. Я счастлив приветствовать Вас.',
      'Приоткройте завесу. Сегодня этот театр станет отражением Вашего выбора.',
      'Позвольте мне провести Вас внутрь.'
    ],
    consent:[
      'Вы на пороге закрытого театра образов.',
      'Здесь каждое приглашение добровольно. Вы можете отказаться, смягчить испытание или остановиться.',
      'Подтвердите Ваше участие, и я задам первый вопрос.'
    ],
    place_question:[
      'Закройте глаза и представьте место, где бы Вы хотели оказаться.',
      'Представили? Отлично. Теперь назовите мне это место.'
    ],
    place_reaction:[
      '«'+hostPlace()+'»… прекрасный выбор.',
      'Я подготовлю для Вас театральную лавку, в которой это место проявится через свет, материалы и образы.',
      'А теперь выйдите на свет. Покажитесь — подберём для Вас первый наряд.'
    ],
    handoff:[
      'Замечательно. Теперь всё готово.',
      'Театр принял Ваш образ. Кто станет Вашим партнёром, откроется лишь в истории.',
      'Завеса поднимается. Приглашаю Вас к первой главе.'
    ]
  };
  async function updateNarrator(stage,place,role){
    const identity=stage+':'+place+':'+String(role)+':'+String(actorConfirmed());
    const node=document.getElementById('hostThread');
    if(!node)return;
    if(narratorCache.has(identity)){
      const line=narratorCache.get(identity);
      node.innerHTML='<p>'+esc(line)+'</p>';
      return;
    }
    try{
      const j=await api('host/turn',{stage,place,mood},36000);
      if(j.turn?.line&&app.querySelector('.hostLobby')&&
          Number(app.querySelector('.hostLobby').dataset.step)===hostStep()&&
          stage===(['invitation','consent','place_question','place_reaction','handoff'][hostStep()])){
        narratorCache.set(identity,j.turn.line);
        node.innerHTML='<p>'+esc(j.turn.line)+'</p>';
      }
    }catch{/* Scripted theatre line remains usable during AI provider failure. */}
  }
  function displayWorld(){
    const root=app.querySelector('.hostLobby');
    if(!root)return;
    const art=document.getElementById('hostArt'),status=document.getElementById('hostWorldStatus');
    if(worldCache?.status==='ready'&&worldCache.image&&art){
      art.style.setProperty('--host-scene','url("'+worldCache.image+'")');
      art.classList.add('withWorld');
      if(status)status.textContent='Ваша театральная лавка создана';
    }else if(worldCache?.status==='working'){
      if(status)status.textContent='Театр принимает очертания Вашего места…';
    }else if(worldCache?.status==='failed'){
      if(status)status.textContent='Декорации пока не появились. Подготовка актёра доступна.';
    }
  }
  async function pollWorld(){
    stopWorldPoll();
    try{
      const j=await api('lobby/world/status',{},18000);
      worldCache=j.world||null;
      displayWorld();
      if(worldCache?.status==='working'&&app.querySelector('.hostLobby'))
        worldTimer=setTimeout(pollWorld,3700);
    }catch{/* The actor flow is not blocked by a failed background image. */}
  }
  async function acceptPlace(){
    const field=document.getElementById('hostPlace');
    const place=String(field?.value||'').trim().replace(/\s+/g,' ');
    if(place.length<2||place.length>120){
      const error=document.getElementById('hostInputError');if(error)error.textContent='Назовите место — от 2 до 120 символов.';
      return;
    }
    const button=document.getElementById('hostNext');if(button)button.disabled=true;
    try{
      const j=await api('lobby/world/start',{place,mood},26000);
      write('novel2_host_place',place);
      worldCache=j.world||null;
      goToStep(3);
    }catch(error){
      hostPlaceError='Не удалось начать создание декораций. Попробуйте ещё раз.';
      const node=document.getElementById('hostInputError');if(node)node.textContent=hostPlaceError;
      if(button)button.disabled=false;
    }
  }
  function lobby(){
    const role=ownRole();
    if(state?.characters?.[role]?.identity_only&&!characterLooksLoaded[role])void loadCharacterLooks(role);
    let step=hostStep();
    if(actorConfirmed()&&step===3){step=4;write('novel2_host_step','4')}
    const stage=['invitation','consent','place_question','place_reaction','handoff'][step];
    const title=[
      'Завеса неизвестного','Добро пожаловать','Представьте место',
      'Театр Ваших образов','Всё готово'
    ][step];
    const kicker=[
      '01 / ПРИГЛАШЕНИЕ','02 / СОГЛАСИЕ','03 / ВАШ МИР',
      '04 / ПОДБОР ОБРАЗА','05 / ПЕРВАЯ ГЛАВА'
    ][step];
    const lines=(fallbackLines[stage]||fallbackLines.invitation);
    const copy=lines.map((v,i)=>'<p style="--host-delay:'+(i*390)+'ms">'+esc(v)+'</p>').join('');
    const moodButtons=step===1?'<div class="hostMoods" role="group" aria-label="Выберите настроение истории">'+moods.map((v,i)=>'<button class="vintageMood" type="button" data-host-mood="'+v+'" aria-pressed="'+String(v===mood)+'">'+vintageButton(v.charAt(0).toUpperCase()+v.slice(1),['keyhole','heart','compass'][i])+'</button>').join('')+'</div>':'';
    const placeField=step===2?'<div class="hostPlaceField"><label for="hostPlace">ВАШЕ МЕСТО</label><input id="hostPlace" type="text" autocomplete="off" autocapitalize="sentences" maxlength="120" placeholder="Например, Северный полюс" value="'+esc(hostPlace())+'"><small id="hostInputError" role="alert">'+esc(hostPlaceError)+'</small></div>':'';
    const secret=step===4?'<div class="hostSecret"><strong>Второй герой пока неизвестен</strong>Его вымышленная роль проявится в действиях и истории.<small>Реальные данные других гостей не раскрываются без их согласия.</small></div>':'';
    const button=[
      'Войти под завесу','Подтверждаю 18+ и согласие',
      'Создать моё пространство',
      actorAvailable()?'Посмотреть и подтвердить актёра':'Подобрать наряд актёра',
      'Начать роман'
    ][step];
    const actionIcon=['curtain','seal','keyhole','cameo','book'][step];
    const note=step===1?'Совершеннолетие подтверждается Вами. Все задания добровольны, выход доступен всегда.'
      :step===3?'Для кастинговой карточки нужно от одной до трёх фотографий. Внешность должна оставаться узнаваемой.'
      :step===4?'Партнёром может быть реальный приглашённый или вымышленный AI-герой.'
      :'Пролог можно покинуть в любой момент.';
    const hint=(step===0||step===3)?'<div class="hostSwipeHint" aria-hidden="true"><span class="hostSwipeGlyph">⌄</span> ЛИСТАЙ · ЗАВЕСА ОТКРЫВАЕТСЯ</div>':'';
    app.innerHTML='<section class="hostLobby revealing" data-step="'+step+'"><div class="hostMasthead"><span><i></i>THE SECRET HOST · PRIVATE STORIES</span><button id="hostSkip" type="button">В фойе</button></div><div class="hostArt" id="hostArt" aria-hidden="true"><div class="hostNearCurtain"></div><div class="hostMidScene"></div><div class="hostFarScene"></div></div><div class="hostEpisode">'+kicker+'</div><h1>'+esc(title)+'</h1><div class="hostThread" id="hostThread">'+copy+'</div>'+moodButtons+placeField+secret+'<div class="hostChoice"><button type="button" id="hostNext" class="vintageStageAction" aria-label="'+esc(button)+'">'+vintageButton(button,actionIcon)+'</button></div>'+hint+'<p id="hostWorldStatus" class="hostWorldStatus" aria-live="polite"></p><p class="hostNote">'+note+'</p></section>';
    document.getElementById('hostSkip').onclick=()=>{stopWorldPoll();skipHost()};
    decorateButton(document.getElementById('hostSkip'),'door');
    document.querySelectorAll('[data-host-mood]').forEach(x=>x.onclick=()=>{
      mood=x.dataset.hostMood;write('novel2_host_mood',mood);
      document.querySelectorAll('[data-host-mood]').forEach(y=>y.setAttribute('aria-pressed',String(y===x)));
    });
    const field=document.getElementById('hostPlace');
    if(field)field.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void acceptPlace()}};
    const go=document.getElementById('hostNext');
    go.onclick=()=>{
      if(step===0)return goToStep(1);
      if(step===1)return goToStep(2);
      if(step===2)return void acceptPlace();
      if(step===3){
        if(actorConfirmed())return goToStep(4);
        nativeCharacterDetail(role);return;
      }
      stopWorldPoll();write('novel2_host_skip','1');
      try{localStorage.setItem('novel2_host_introduced','1')}catch{}
      startNewBook();
    };
    // Touch is a theatrical hint; consent and generation remain click-only.
    let initialY=null;
    if(step===0){
      const art=document.getElementById('hostArt');
      art.addEventListener('touchstart',e=>{initialY=e.touches[0]?.clientY??null},{passive:true});
      art.addEventListener('touchend',e=>{
        const endY=e.changedTouches[0]?.clientY??0;
        if(initialY!==null&&initialY-endY>65)goToStep(1);
        initialY=null;
      },{passive:true});
    }
    if(step>=3)void pollWorld();
    else displayWorld();
    void updateNarrator(stage,step===3?hostPlace():'',role);
  }
  window.novel2HostCreativeBrief=()=>(
    'Кинематографичный роман для совершеннолетних в эстетике закрытого театра образов. '+
    'Желаемое место гостя: '+JSON.stringify(hostPlace().slice(0,120))+'. '+
    'Сюжет использует настроение и визуальные ассоциации этого места, но не обязан буквально происходить там. '+
    'Гость управляет важными решениями, настроение: '+mood+'. Вымышленный партнёр открывается постепенно; реальные личности скрыты. '+
    'Добровольные чувственные задания можно принять, смягчить или пропустить без наказания. '+
    'Драматургия конечна. Генерация звука отложена.'
  );
  renderMainMenu=function(...args){
    if(shouldHost()){lobby();return}
    const result=nativeMainMenu.apply(this,args);
    // Existing players must be able to enter the same narrative invitation
    // deliberately, even if they already have books or dismissed onboarding.
    const begin=document.getElementById('heroNewBook');
    if(begin&&!begin.disabled){
      begin.textContent='Войти под завесу';
      decorateButton(begin,'curtain');
      begin.onclick=()=>{
        write('novel2_host_step','0');
        lobby();
      };
    }
    return result;
  };
  renderCharacterDetail=function(...args){
    const result=nativeCharacterDetail.apply(this,args);
    if(Number(read('novel2_host_step','0'))>=2&&read('novel2_host_skip')!=='1'){
      const screen=app.querySelector('section.characterDetail');
      if(screen&&!screen.querySelector('.hostGuide')){
        const message=document.createElement('aside');
        message.className='hostGuide';
        message.innerHTML='<div>СООБЩЕНИЕ ОТ НЕЗНАКОМЦА · AI-ВЕДУЩИЙ</div><p>Создайте свою актёрскую карточку. Три фотографии — достаточно. Если результат не похож, его можно перегенерировать по сохранённым снимкам.</p>';
        screen.prepend(message);
      }
    }
    const screen=app.querySelector('section.characterDetail');
    if(screen&&actorConfirmed()&&hostStep()===3&&read('novel2_host_skip')!=='1'&&!screen.querySelector('#hostAfterApproval')){
      const next=document.createElement('button');next.id='hostAfterApproval';next.type='button';
      next.className='hostAfterApproval';next.textContent='Продолжить к роману';
      next.onclick=()=>goToStep(4);
      const section=screen.querySelector('.photoIdentityPanel')||screen;
      section.appendChild(next);
      decorateButton(next,'book');
    }
    if(screen){
      for(const [selector,icon] of [
        ['#characterPhotoBuild','cameo'],
        ['#characterResumeCalibration','repeat'],
        ['#approveSavedActor','check'],
        ['#showOtherPhotos','photos'],
        ['#characterBack','door']
      ])decorateButton(screen.querySelector(selector),icon);
    }
    return result;
  };
  if(state?.mode==='home'&&menuMode)renderMainMenu();
})();