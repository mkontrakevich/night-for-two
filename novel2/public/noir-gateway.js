/* Noir private entrance — optional staged fiction, never a fake live person. */
(function(){
  'use strict';
  const key='novel2-private-entrance-v1';
  const originalMenu=renderMainMenu;
  let stage=0,opened=false,ignored=false;
  const saved=()=>{try{return localStorage.getItem(key)==='1'}catch{return ignored}};
  const remember=()=>{ignored=true;try{localStorage.setItem(key,'1')}catch{}};
  const existingSheet=()=>Boolean((characterLooks[state?.role||'A']||[]).some(x=>x?.key==='canonical'&&x?.image&&x?.model!=='existing'));
  const ownCard=()=>Boolean(state?.characters?.[state?.role||'A']?.ready);
  const currentStory=()=>Boolean(state?.mode==='reader'&&state?.book);
  const escText=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pages=()=>[
    {label:'01 / ПРИГЛАШЕНИЕ',title:'Некоторые двери открываются только ночью.',
     text:'Вы здесь не зритель. Решения, которые вы примете, изменят происходящее. И только потом откроют тайну другого героя.',
     note:'Незнакомец — художественный AI-ведущий истории.',yes:'Войти',no:'Обычное меню'},
    {label:'02 / ВАША РОЛЬ',
     title:ownCard()?'У истории уже есть ваше лицо.':existingSheet()?'Карточка ждёт вашего подтверждения.':'Каким вас увидит эта история?',
     text:ownCard()?'Ваш актёр уже создан. Дальнейший образ зависит от сцены, а не от анкеты.':existingSheet()?'Откройте уже сохранённую карточку и подтвердите сходство. Пересоздавать изображение не нужно.':'Загрузите до трёх фотографий для нейтральной карточки актёра. Его характер, костюм и роль появятся внутри выбранного сюжета.',
     note:'Фотографии используются как референс внешности. Никаких выдуманных биографий на этапе карточки.',
     yes:ownCard()?'Продолжить':existingSheet()?'Подтвердить карточку':'Создать актёра',no:'Назад'},
    {label:'03 / ТАЙНА',title:'Другой гость пока остаётся в тени.',
     text:'Вы узнаете его через намёки, интонации и последствия ваших поступков. Художественное знакомство происходит только в нужной сцене.',
     note:'Реальный участник или AI-персонаж обозначается честно. Чужие личные данные не раскрываются автоматически.',yes:'Продолжить',no:'Назад'},
    {label:'04 / ВАШ ВЫБОР',title:'Даже соблазн не должен быть приказом.',
     text:'В романе встречаются чувственные сюжетные задания. Каждое можно принять, смягчить или пропустить без наказания. Любой выбор остаётся частью истории.',
     note:'Нажимая «Мне 18+ · начать», вы подтверждаете совершеннолетие и добровольное участие в вымышленной истории. Из неё можно выйти.',yes:'Мне 18+ · начать',no:'В главное меню'}
  ];
  function exit(){opened=false;remember();originalMenu();addReplay()}
  function view(){
    opened=true;stopLoading();
    const entry=pages()[stage];
    app.innerHTML='<section class="noirEntrance" role="region" aria-label="Приглашение от Незнакомца">'+
      '<div class="noirEntranceHead"><span>INTERACTIVE NOVEL · PRIVATE ROOM</span><button id="noirEntranceClose" type="button">Закрыть ×</button></div>'+
      '<div class="noirEntranceTrack" aria-label="Шаг '+(stage+1)+' из 4"><span style="width:'+((stage+1)*25)+'%"></span></div>'+
      '<div class="noirEntranceMessage"><div class="noirEntranceName">'+escText(entry.label)+' · НЕЗНАКОМЕЦ</div>'+
      '<h1>'+escText(entry.title)+'</h1><p>'+escText(entry.text)+'</p><small>'+escText(entry.note)+'</small></div>'+
      '<div class="noirEntranceActions"><button id="noirEntranceNext" type="button">'+escText(entry.yes)+'</button>'+
      '<button id="noirEntranceBack" type="button">'+escText(entry.no)+'</button>'+
      '<p>Художественный AI-ведущий · не переписка с реальным человеком.</p></div></section>';
    document.getElementById('noirEntranceClose').onclick=exit;
    document.getElementById('noirEntranceBack').onclick=()=>stage===0||stage===3?exit():(stage--,view());
    document.getElementById('noirEntranceNext').onclick=()=>{
      if(stage===1&&!ownCard()){
        opened=false;
        renderCharacterDetail(String(state?.role||'A'));
        return;
      }
      if(stage===3){remember();opened=false;startNewBook();return}
      stage++;view();
    };
  }
  function addReplay(){
    const menu=app.querySelector('.mainMenu');
    if(!menu||menu.querySelector('#noirEntranceReplay'))return;
    const footer=document.createElement('div');
    footer.className='noirEntranceReplay';
    footer.innerHTML='<button id="noirEntranceReplay" type="button">Приглашение Незнакомца →</button>';
    menu.appendChild(footer);
    footer.querySelector('button').onclick=()=>{stage=0;view()};
  }
  renderMainMenu=function(...args){
    if(!currentStory()&&!storyDraft&&(opened||(!saved()&&!libraryBooks.length))){view();return}
    originalMenu.apply(this,args);addReplay();
  };
})();