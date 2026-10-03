/* Ulanzi SDK adapter. A press animation confirms input, not server success. */
(() => {
  const state = new Map(), timers = new Map();
  function remember(message) {
    if (message.param?.IdleIcon) state.set(message.context, message.param);
    return state.get(message.context);
  }
  function idle(context) {
    const value = state.get(context);
    if (value) $UD.setGifPathIcon(context, value.IdleIcon, '');
  }
  function press(message) {
    const value = remember(message);
    if (!value) return;
    clearTimeout(timers.get(message.context));
    $UD.setGifPathIcon(message.context, value.PressIcon, '');
    timers.set(message.context, setTimeout(() => idle(message.context), 680));
  }
  $UD.onAdd(message => { remember(message); idle(message.context); });
  $UD.onParamFromApp(message => { remember(message); idle(message.context); });
  $UD.onKeyDown(press);
  $UD.onRun(message => {
    const value = remember(message);
    if (!value) { $UD.showAlert(message.context); return; }
    press(message);
    if (value.Kind === 'hotkey') $UD.hotkey(value.Command);
    else if (value.Kind === 'website') $UD.openUrl(value.Command, false);
    else if (value.Kind === 'open') $UD.openUrl(value.Command, true);
    else $UD.showAlert(message.context);
  });
  $UD.onClear(message => {
    for (const item of message.param || []) {
      clearTimeout(timers.get(item.context)); timers.delete(item.context); state.delete(item.context);
    }
  });
  $UD.onConnected(() => $UD.logMessage('Carruleddhi Motion ready', 'info'));
  $UD.connect('com.ulanzi.ulanzistudio.carruleddhi');
})();
