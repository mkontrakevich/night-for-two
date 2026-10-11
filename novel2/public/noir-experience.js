/* Noir Experience v1.0
 * Uses server-produced novel scenes; does not invent messages or fabricate
 * speaker identities. SD scene illustrations appear only after established
 * prose, and a player can always skip transitions or leave to the main menu.
 */
(function(){
  'use strict';
  const legacyRender=render;
  let sceneKey='',revealTimer=null,revealReady=false,visualKey='',visualData='',visualRequestKey='';
  const reduceMotion=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function getKey(){return [state?.book?.id||'',state?.book?.turn_no||0,state?.scene?.chapter_no||1].join(':')}
  function sceneParagraphs(value){
    return String(value||'').replace(/\r/g,'').trim().split(/\n\s*\n+|\n+/)
      .map(v=>v.trim()).filter(Boolean);
  }
  function wasRead(key){
    try{return sessionStorage.getItem('novel2_noir_seen:'+key)==='1'}catch{return sceneKey===key&&revealReady}
  }
  function markRead(key){
    try{sessionStorage.setItem('novel2_noir_seen:'+key,'1')}catch{}
  }
  function showVisual(){
    if(!revealReady||visualKey!==getKey()||!visualData)return;
    const img=document.getElementById('sceneImage');
    const frame=document.getElementById('noirStill');
    if(!img||!frame)return;
    img.onload=()=>{if(visualKey===getKey())frame.classList.add('on')};
    if(img.src!==visualData)img.src=visualData;
    if(img.complete&&img.naturalWidth)frame.classList.add('on');
  }
  function finishReveal(){
    clearTimeout(revealTimer);revealTimer=null;revealReady=true;
    const root=document.querySelector('.noirReader');
    if(root){root.classList.remove('entering');root.classList.add('revealed')}
    const btn=document.getElementById('noirSkip');if(btn)btn.hidden=true;
    markRead(sceneKey);showVisual();
  }
  async function loadSceneVisual(){
    const requested=getKey();
    if(visualKey===requested&&visualData){showVisual();return}
    if(visualRequestKey===requested)return;
    visualRequestKey=requested;
    try{
      const j=await api('visual',{},180000);
      if(!j.image||getKey()!==requested)return;
      visualKey=requested;visualData=j.image;
      showVisual();
    }catch(error){
      if(getKey()!==requested)return;
      const label=document.querySelector('#noirStill .noirStillPending');
      if(label)label.textContent='Кадр пока недоступен. История продолжается.';
    }finally{if(visualRequestKey===requested)visualRequestKey=''}
  }
  function renderNoir(){
    stopLoading();
    const s=state.scene||{},key=getKey(),seen=wasRead(key)||reduceMotion();
    const paragraphs=sceneParagraphs(s.prose);
    clearTimeout(revealTimer);
    sceneKey=key;revealReady=seen;
    // SD skill: illustration after the establishing beat. Older scenes
    // without an anchor default to after all prose, never before it.
    const anchor=Math.max(1,Math.min(paragraphs.length||1,Number(s.visual_after_paragraph)||paragraphs.length||1));
    const delay=i=>seen?0:Math.min(5300,i*360);
    const picture='<figure class="noirStill" id="noirStill" style="--beat-delay:'+delay(anchor)+'ms"><div class="noirStillHead"><span>КАДР ИСТОРИИ</span><span>VISUAL DNA · SD</span></div><div class="noirStillFrame"><div class="noirStillPending">Сцена проявляется из темноты…</div><img id="sceneImage" alt="Кинематографичная иллюстрация события в текущей сцене"></div></figure>';
    let placed=false;
    const beats=paragraphs.map((value,i)=>{
      const p='<p class="noirBeat'+(/^[—«"“]/.test(value)?' spoken':'')+'" style="--beat-delay:'+delay(i)+'ms">'+esc(value)+'</p>';
      if(i+1===anchor){placed=true;return p+picture}
      return p;
    }).join('')+(placed?'':picture);
    const options=(s.optional_actions||[]).map(x=>'<button class="chip" type="button" data-action="'+esc(x.key)+'" aria-pressed="false">'+esc(x.label)+'</button>').join('');
    const aiTurn=state.active_control_mode==='ai';
    const waitingText=aiTurn?(aiAdvanceError?'Не удалось получить ход AI-персонажа.':'AI-персонаж пишет продолжение…'):'Ход второго героя · история продолжится после его ответа';
    const status=state.can_reply?'Ваш ход · отвечайте от лица своего героя':aiTurn
      ?'<div class="aiTurnStatus"><span class="aiTurnDot"></span><span id="aiStatus">'+esc(waitingText)+'</span>'+(aiAdvanceError?'<button class="aiRetry" id="retryAiTurn" type="button">Повторить</button>':'')+'</div>':esc(waitingText);
    const title=s.chapter_title||('Глава '+(s.chapter_no||state.book?.chapter_no||1));
    const whisper=String(s.noir_whisper||'').trim();
    // The whisper is written by the novelist skill alongside the scene,
    // so it cannot be unrelated UI decoration or an invented spoiler.
    const whisperHtml=whisper?'<aside class="noirWhisper" style="--beat-delay:'+delay(0)+'ms"><small>СООБЩЕНИЕ ОТ НЕЗНАКОМЦА · AI</small><p>'+esc(whisper)+'</p></aside>':'';
    const trial=s.noir_trial&&typeof s.noir_trial==='object'?s.noir_trial:null;
    const trialHtml=trial?.opt_in&&trial?.title&&trial?.invitation
      ?'<aside class="noirTrial" style="--beat-delay:'+delay(paragraphs.length)+'ms"><div class="noirSignal">СЮЖЕТНОЕ ИСПЫТАНИЕ · ПО ЖЕЛАНИЮ</div><h2>'+esc(trial.title)+'</h2><p>'+esc(trial.invitation)+'</p><small>Выбор добровольный и не препятствует продолжению романа.</small><div class="noirTrialActions"><button type="button" data-trial-choice="accept">Принять приглашение</button><button type="button" data-trial-choice="softer">'+esc(trial.softer_option||'Выбрать мягче')+'</button><button type="button" data-trial-choice="decline">'+esc(trial.decline_option||'Отказаться и продолжить')+'</button></div></aside>'
      :'';
    const finalDelay=seen?0:Math.min(6100,paragraphs.length*360+360);
    app.innerHTML='<section class="reader noirReader '+(seen?'revealed':'entering')+'"><div class="chrome"><div><div class="bookTitle">'+esc(state.book?.title||'Роман')+'</div><div class="chapter">Глава '+esc(s.chapter_no||state.book?.chapter_no||1)+'</div></div><button class="exitStory" id="mainMenu" type="button">Главное меню</button></div><header class="noirConnection"><div class="noirSignal">НЕЗНАКОМЕЦ · AI-ВЕДУЩИЙ</div><h1>'+esc(title)+'</h1><p>История открывается в словах, взглядах и решениях.</p></header><div class="noirTranscript"><div class="noirTranscriptHead"><span>ГОЛОС ИЗ ТЕМНОТЫ</span><button type="button" class="noirSkip" id="noirSkip" '+(seen?'hidden':'')+'>Показать всю сцену</button></div>'+whisperHtml+beats+trialHtml+'<div class="noirInteraction" style="--beat-delay:'+finalDelay+'ms"><div class="noirSignal">ВАШЕ РЕШЕНИЕ</div><div class="turnPrompt">'+esc(s.primary_interaction?.prompt||'Что вы отвечаете?')+'</div>'+(options?'<div class="choiceRow">'+options+'</div>':'')+'<div class="status">'+status+'</div></div></div></section><div class="replyDock noirDock"><div class="noirDockLabel">ВАША РЕПЛИКА</div><textarea id="reply" aria-label="Реплика вашего героя" placeholder="'+(state.can_reply?'Ответить от лица героя…':aiTurn?'AI-персонаж формирует ответ…':'Ожидаем второго героя…')+'" '+(state.can_reply?'':'disabled')+'></textarea><div class="replyRow"><div id="selected" aria-live="polite"></div><button class="send" id="send" '+(state.can_reply?'':'disabled')+'>Ответить →</button></div></div>';
    document.querySelectorAll('[data-action]').forEach(x=>x.onclick=()=>{
      selectedAction=x.dataset.action;
      document.querySelectorAll('[data-action]').forEach(y=>y.setAttribute('aria-pressed',String(y===x)));
      document.getElementById('selected').textContent='Действие: '+x.textContent;
    });
    document.querySelectorAll('[data-trial-choice]').forEach(btn=>btn.onclick=()=>{
      if(!state.can_reply)return;
      const kind=btn.dataset.trialChoice;
      const code={accept:'noir_trial_accept',softer:'noir_trial_softer',decline:'noir_trial_decline'}[kind];
      const words={accept:'Я принимаю приглашение.',softer:'Я выбираю более мягкий вариант.',decline:'Я отказываюсь от испытания и продолжаю историю.'};
      selectedAction=code||'';
      const reply=document.getElementById('reply');
      if(reply){reply.value=words[kind]||'';reply.focus();reply.scrollIntoView({behavior:'smooth',block:'nearest'})}
      const info=document.getElementById('selected');if(info)info.textContent='Выбор в истории: '+btn.textContent;
      document.querySelectorAll('[data-trial-choice]').forEach(x=>x.setAttribute('aria-pressed',String(x===btn)));
    });
    document.getElementById('send').onclick=sendReply;
    document.getElementById('mainMenu').onclick=()=>{clearTimeout(revealTimer);openMainMenu()};
    const skip=document.getElementById('noirSkip');if(skip)skip.onclick=finishReveal;
    const retry=document.getElementById('retryAiTurn');if(retry)retry.onclick=()=>{aiAdvanceError='';aiAdvanceKey='';render()};
    if(seen)showVisual();
    else revealTimer=setTimeout(()=>{if(sceneKey===key)finishReveal()},Math.min(6950,Math.max(1450,finalDelay+750)));
    void loadSceneVisual();
    if(aiTurn&&!aiAdvanceInFlight&&!aiAdvanceError)setTimeout(()=>advanceAiTurn(),0);
  }
  render=function(...args){
    if(storyDraft||menuMode||calibrationImage&&characterDraft||!state||state.mode!=='reader'){
      clearTimeout(revealTimer);revealTimer=null;
      return legacyRender.apply(this,args);
    }
    return renderNoir();
  };
  // In case the first state request returned while this asset was loading.
  if(state?.mode==='reader'&&!menuMode&&!storyDraft)render();
})();
