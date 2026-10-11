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
  const lines={
    invite:[
      'Эта дверь открывается не каждому персонажу.',
      'За ней — кулуарная история, в которой чужое имя останется тайной, а каждый ваш выбор изменит ход событий.',
      'Я — Незнакомец. Художественный ведущий этого мира. Могу я показать вам первую дверь?'
    ],
    threshold:[
      'Кулуарные истории требуют не спешки, а вашего согласия.',
      'Все участники совершеннолетние. Пикантные задания в сюжете добровольны: их можно принять, смягчить или пропустить, а игру — остановить.',
      'Какой оттенок тайны вам ближе сегодня?'
    ],
    actor:[
      'Прежде чем войти в историю, я предложу вам создать актёра.',
      'Одна, две или три фотографии. Нейтральная визитка на весь экран — без вымышленной биографии, характера и сюжета.',
      'Можно перегенерировать карточку по тем же снимкам или заменить фото. Вы решаете, когда образ готов.'
    ],
    partner:[
      'Актёр готов. Теперь ему нужен поступок, который изменит историю.',
      'Партнёр остаётся за кулисами. Его художественный образ откроют слова, решения и события — не анкета и не фотография в начале игры.',
      'Внутри вас ждут интрига, диалог и сюжетные испытания. Каждый выбор повлияет на последствия. Финал обязательно наступит.'
    ]
  };
  function lobby(){
    const role=ownRole();
    if(state?.characters?.[role]?.identity_only&&!characterLooksLoaded[role])void loadCharacterLooks(role);
    let step=Number(read('novel2_host_step','0'))||0;
    if(actorConfirmed()&&step>=2)step=3;
    const stage=['invite','threshold','actor','partner'][Math.min(3,Math.max(0,step))];
    const title={invite:'Вас ожидала только история',threshold:'Правила этой двери',actor:'Ваша новая роль',partner:'Кто окажется за дверью?'}[stage];
    const kicker={invite:'01 / ПРИГЛАШЕНИЕ',threshold:'02 / ПОРОГ',actor:'03 / ВЫБОР АКТЁРА',partner:'04 / ТАЙНА'}[stage];
    const copy=lines[stage].map((v,i)=>'<p style="--host-delay:'+(i*360)+'ms">'+esc(v)+'</p>').join('');
    const moodButtons=step===1?'<div class="hostMoods" role="group" aria-label="Выберите настроение истории">'+moods.map((v,i)=>'<button class="vintageMood" type="button" data-host-mood="'+v+'" aria-pressed="'+String(v===mood)+'">'+vintageButton(v.charAt(0).toUpperCase()+v.slice(1),['keyhole','heart','compass'][i])+'</button>').join('')+'</div>':'';
    const mystery=step===3?'<div class="hostSecret"><strong>Личность второго героя закрыта</strong>Вы узнаете его сюжетную роль постепенно — из слов, поступков и разгаданных тайн.<small>Это художественная интрига. Личные данные других гостей остаются конфиденциальными.</small></div>':'';
    const button=step===0?'Войти под завесу':step===1?'Подтверждаю 18+ и согласие'
      :step===2?(actorAvailable()?'Посмотреть карточку актёра':'Создать карточку актёра')
      :'Начать роман';
    const actionIcon=['curtain','seal','cameo','book'][Math.min(3,Math.max(0,step))];
    const small=step===1?'Это подтверждение пользователя, не автоматическая проверка возраста. Все действия добровольны; остановка возможна в любой момент.'
      :step===3?'Второй герой может управляться реальным гостем либо ИИ. Его реальная личность никогда не раскрывается без отдельного согласия.'
      :'Открыть обычное меню можно в любой момент.';
    app.innerHTML='<section class="hostLobby revealing"><div class="hostMasthead"><span><i></i>THE SECRET HOST · PRIVATE STORIES</span><button id="hostSkip" type="button">Открыть меню</button></div><div class="hostArt" aria-hidden="true"></div><div class="hostEpisode">'+kicker+'</div><h1>'+title+'</h1><div class="hostThread">'+copy+'</div>'+moodButtons+mystery+'<div class="hostChoice"><button type="button" id="hostNext" class="vintageStageAction" aria-label="'+esc(button)+'">'+vintageButton(button,actionIcon)+'</button></div><p class="hostNote">'+small+'</p></section>';
    document.getElementById('hostSkip').onclick=skipHost;
    decorateButton(document.getElementById('hostSkip'),'door');
    document.querySelectorAll('[data-host-mood]').forEach(x=>x.onclick=()=>{
      mood=x.dataset.hostMood;write('novel2_host_mood',mood);
      document.querySelectorAll('[data-host-mood]').forEach(y=>y.setAttribute('aria-pressed',String(y===x)));
    });
    document.getElementById('hostNext').onclick=()=>{
      if(step===0){write('novel2_host_step','1');lobby();return}
      if(step===1){write('novel2_host_step','2');lobby();return}
      if(step===2){if(actorConfirmed()){write('novel2_host_step','3');lobby();return}nativeCharacterDetail(role);return}
      write('novel2_host_skip','1');
      try{localStorage.setItem('novel2_host_introduced','1')}catch{}
      startNewBook();
    };
  }
  window.novel2HostCreativeBrief=()=>(
    'Оригинальная кинематографичная история для совершеннолетних в атмосфере закрытого нуарного шоу: тайна, притяжение, кулуарная интрига. '+
    'Гость играет значимую роль, свободно отвечает своими словами, а последствия каждого выбора меняют события и отношения. Настроение: '+mood+'. '+
    'Сюжет первичен. Художественного партнёра раскрывать постепенно через события; реальную личность другого участника никогда не выдавать автоматически. '+
    'Предлагать только добровольные чувственные сюжетные испытания с возможностью более мягкого варианта или отказа без наказания. '+
    'Вести роман по конечным драматургическим эпизодам к финалу. Генерация музыки и звуков пока отключена.'
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