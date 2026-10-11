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
    const moodButtons=step===1?'<div class="hostMoods" aria-label="Выберите настроение истории">'+moods.map(v=>'<button type="button" data-host-mood="'+v+'" aria-pressed="'+String(v===mood)+'">'+v.charAt(0).toUpperCase()+v.slice(1)+'</button>').join('')+'</div>':'';
    const mystery=step===3?'<div class="hostSecret"><strong>Личность второго героя закрыта</strong>Вы узнаете его сюжетную роль постепенно — из слов, поступков и разгаданных тайн.<small>Это художественная интрига. Личные данные других гостей остаются конфиденциальными.</small></div>':'';
    const button=step===0?'Принять приглашение →':step===1?'Подтверждаю 18+ и согласие →'
      :step===2?(actorAvailable()?'Открыть и подтвердить карточку →':'Создать карточку актёра →')
      :'Открыть первую главу →';
    const small=step===1?'Это подтверждение пользователя, не автоматическая проверка возраста. Все действия добровольны; остановка возможна в любой момент.'
      :step===3?'Второй герой может управляться реальным гостем либо ИИ. Его реальная личность никогда не раскрывается без отдельного согласия.'
      :'Открыть обычное меню можно в любой момент.';
    app.innerHTML='<section class="hostLobby revealing"><div class="hostMasthead"><span><i></i>THE SECRET HOST · PRIVATE STORIES</span><button id="hostSkip" type="button">Открыть меню</button></div><div class="hostArt" aria-hidden="true"></div><div class="hostEpisode">'+kicker+'</div><h1>'+title+'</h1><div class="hostThread">'+copy+'</div>'+moodButtons+mystery+'<div class="hostChoice"><button type="button" id="hostNext">'+button+'</button></div><p class="hostNote">'+small+'</p></section>';
    document.getElementById('hostSkip').onclick=skipHost;
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
      begin.textContent='Принять приглашение →';
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
    return result;
  };
  if(state?.mode==='home'&&menuMode)renderMainMenu();
})();