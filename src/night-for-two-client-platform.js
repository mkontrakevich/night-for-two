export function nightPlatformClientSource(){
  return String.raw`
const NightPlatform=(()=>{
  function telegram(){return window.Telegram&&window.Telegram.WebApp?window.Telegram.WebApp:null}
  function cleanPart(value,prefix){value=String(value||'');return value.startsWith(prefix)?value.slice(1):value}
  function launchParam(name){
    for(const raw of [cleanPart(location.hash,'#'),cleanPart(location.search,'?')]){
      if(!raw)continue;
      const value=new URLSearchParams(raw).get(name);
      if(value)return value;
    }
    return '';
  }
  function telegramInitData(){return String(telegram()?.initData||launchParam('tgWebAppData')||'')}
  function kind(){return telegramInitData()?'telegram':'web'}
  function hasAuth(){return Boolean(telegramInitData())}
  function authHeaders(){
    const data=telegramInitData();
    return data?{'x-telegram-init-data':data}:{};
  }
  function haptic(kind='select'){
    try{
      const feedback=telegram()?.HapticFeedback;
      if(kind==='select')feedback?.selectionChanged?.();
      else feedback?.impactOccurred?.(kind==='strong'?'medium':'light');
    }catch{}
  }
  function ready(){
    try{
      const app=telegram();
      app?.ready?.();
      app?.expand?.();
      app?.setHeaderColor?.('#090609');
      app?.setBackgroundColor?.('#080507');
    }catch{}
  }
  function share(url,text=''){
    const target=String(url||'');
    if(!target)return;
    const app=telegram();
    if(app?.openTelegramLink){
      const link='https://t.me/share/url?url='+encodeURIComponent(target)+'&text='+encodeURIComponent(String(text||''));
      app.openTelegramLink(link);
      return;
    }
    if(navigator.share){
      navigator.share({url:target,text:String(text||'')}).catch(()=>{});
      return;
    }
    location.href=target;
  }
  function close(){
    const app=telegram();
    if(app?.close){app.close();return;}
    if(history.length>1)history.back();
  }
  return {telegram,kind,hasAuth,authHeaders,haptic,ready,share,close,launchParam};
})();
function tg(){return NightPlatform.telegram()}
function haptic(kind='select'){return NightPlatform.haptic(kind)}
function initData(){return String(NightPlatform.telegram()?.initData||NightPlatform.launchParam('tgWebAppData')||'')}
function authHeaders(){return NightPlatform.authHeaders()}
`;
}
