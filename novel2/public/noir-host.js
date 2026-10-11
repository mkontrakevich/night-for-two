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
  const lines={
    invite:[
      'Сюда не приходят за готовыми ответами.',
      'За этой дверью слова становятся поступками. А поступки — частью истории, которая запомнит ваш выбор.',
      'Я — Незнакомец. Всего лишь голос этого вымышленного мира. Позвольте провести вас внутрь.'
    ],
    threshold:[
      'Есть истории, для которых нужен не билет, а осознанное решение.',
      'Вы сможете выбирать темп, останавливаться и отказываться от любого задания. Никто не должен заслуживать право сказать «нет».',
      'Что вас привело сюда сегодня?'
    ],
    actor:[
      'Прежде чем надеть новую роль, мне нужно увидеть только вашу внешность.',
      'До трёх фотографий — и нейтральная актёрская карточка готова. Характер и судьбу мы создадим позже, когда появится сюжет.',
      'У вас всегда останется право пересобрать карточку по тем же снимкам или заменить их.'
    ],
    partner:[
      'Теперь у истории появился первый актёр.',
      'Но тайны не раскрываются в фойе. Второй герой войдёт в повествование тогда, когда для этого появится причина.',
      'За следующей дверью начинается роман. Вы сможете влиять на его события, принимать пикантные сюжетные приглашения или спокойно пропускать их.'
    ]
  };
  function lobby(){
    const role=ownRole();
    if(state?.characters?.[role]?.identity_only&&!characterLooksLoaded[role])void loadCharacterLooks(role);
    let step=Number(read('novel2_host_step','0'))||0;
    if(actorAvailable()&&step>=2)step=3;
    const stage=['invite','threshold','actor','partner'][Math.min(3,Math.max(0,step))];
    const title={invite:'Вас ожидала только история',threshold:'Правила этой двери',actor:'Ваша новая роль',partner:'Кто окажется за дверью?'}[stage];
    const kicker={invite:'01 / ПРИГЛАШЕНИЕ',threshold:'02 / ПОРОГ',actor:'03 / ВЫБОР АКТЁРА',partner:'04 / ТАЙНА'}[stage];
    const copy=lines[stage].map((v,i)=>'<p style="--host-delay:'+(i*360)+'ms">'+esc(v)+'</p>').join('');
    const moodButtons=step===1?'<div class="hostMoods" aria-label="Выберите настроение истории">'+moods.map(v=>'<button type="button" data-host-mood="'+v+'" aria-pressed="'+String(v===mood)+'">'+v.charAt(0).toUpperCase()+v.slice(1)+'</button>').join('')+'</div>':'';
    const mystery=step===3?'<div class="hostSecret"><strong>Личность второго героя закрыта</strong>Вы узнаете его сюжетную роль постепенно — из слов, поступков и разгаданных тайн.<small>Это художественная интрига. Личные данные других гостей остаются конфиденциальными.</small></div>':'';
    const button=step===0?'Продолжить →':step===1?'Мне есть 18 лет · войти →':step===2?'Создать карточку актёра →':'Войти в роман →';
    const small=step===1?'Нажимая «войти», вы подтверждаете совершеннолетие и добровольное участие в художественной игре.':step===3?'Если второй реальный участник не подключён, история может использовать вымышленного AI-персонажа.':'Вернуться в обычное меню можно в любой момент.';
    app.innerHTML='<section class="hostLobby revealing"><div class="hostMasthead"><span><i></i>THE SECRET HOST · PRIVATE STORIES</span><button id="hostSkip" type="button">Открыть меню</button></div><div class="hostArt" aria-hidden="true"></div><div class="hostEpisode">'+kicker+'</div><h1>'+title+'</h1><div class="hostThread">'+copy+'</div>'+moodButtons+mystery+'<div class="hostChoice"><button type="button" id="hostNext">'+button+'</button></div><p class="hostNote">'+small+'</p></section>';
    document.getElementById('hostSkip').onclick=skipHost;
    document.querySelectorAll('[data-host-mood]').forEach(x=>x.onclick=()=>{
      mood=x.dataset.hostMood;write('novel2_host_mood',mood);
      document.querySelectorAll('[data-host-mood]').forEach(y=>y.setAttribute('aria-pressed',String(y===x)));
    });
    document.getElementById('hostNext').onclick=()=>{
      if(step===0){write('novel2_host_step','1');lobby();return}
      if(step===1){write('novel2_host_step','2');lobby();return}
      if(step===2){nativeCharacterDetail(role);return}
      write('novel2_host_skip','1');
      try{localStorage.setItem('novel2_host_introduced','1')}catch{}
      startNewBook();
    };
  }
  window.novel2HostCreativeBrief=()=>(
    'Оригинальная взрослая кинематографичная история: атмосферный загадочный ведущий, приватный нуар, художественное притяжение и тайна. '+
    'Ведущий сначала знает только выбор гостя. Настроение: '+mood+'. Сюжет первичен; реального второго участника не раскрывать по данным аккаунта. '+
    'Вторая сюжетная роль раскрывается по мотивам и событиям. Предлагать необязательные деликатные задания для совершеннолетних, привязанные к сценам; отказ без наказания.'
  );
  renderMainMenu=function(...args){
    if(shouldHost()){lobby();return}
    return nativeMainMenu.apply(this,args);
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