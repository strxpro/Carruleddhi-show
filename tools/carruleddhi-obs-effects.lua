obs = obslua
local effects = {
  {name='FX CONFETTI', key='F8', duration=9000},
  {name='FX RIBBONS', key='F9', duration=10000},
  {name='FX SPARKLES', key='F10', duration=8000}
}
local handles = {}
local callbacks = {}
local function visible(name, value)
  local source = obs.obs_get_source_by_name('MASTER_EFFECTS')
  if source then
    local item = obs.obs_scene_find_source(obs.obs_scene_from_source(source), name)
    if item then obs.obs_sceneitem_set_visible(item, value) end
    obs.obs_source_release(source)
  end
end
local function cancel(effect)
  if effect.start then obs.timer_remove(effect.start) end
  if effect.finish then obs.timer_remove(effect.finish) end
  visible(effect.name, false)
end
local function stop_all(pressed)
  if not pressed then return end
  for _,effect in ipairs(effects) do cancel(effect) end
  obs.script_log(obs.LOG_INFO, 'Carruleddhi: effects OFF')
end
local function register(name, key, fn, settings)
  callbacks[name] = fn
  local id = obs.obs_hotkey_register_frontend(name, name, fn)
  handles[name] = id
  local saved = obs.obs_data_get_array(settings, name)
  if obs.obs_data_array_count(saved) == 0 then
    obs.obs_data_array_release(saved)
    local data=obs.obs_data_create_from_json('{"keys":[{"control":true,"shift":true,"key":"OBS_KEY_'..key..'"}]}')
    saved=obs.obs_data_get_array(data,'keys')
    obs.obs_data_release(data)
  end
  obs.obs_hotkey_load(id,saved)
  obs.obs_data_array_release(saved)
end
function script_load(settings)
  for _,effect in ipairs(effects) do
    effect.finish=function() obs.timer_remove(effect.finish); visible(effect.name,false) end
    effect.start=function()
      obs.timer_remove(effect.start)
      visible(effect.name,true)
      obs.timer_add(effect.finish,effect.duration)
      obs.script_log(obs.LOG_INFO,'Carruleddhi: '..effect.name..' triggered')
    end
    register('Carruleddhi '..effect.name,effect.key,function(pressed)
      if pressed then cancel(effect);obs.timer_add(effect.start,150) end
    end,settings)
  end
  register('Carruleddhi effects OFF','F11',stop_all,settings)
  obs.script_log(obs.LOG_INFO,'Carruleddhi effects controller ready')
end
function script_save(settings)
  for name,id in pairs(handles) do
    local keys=obs.obs_hotkey_save(id)
    obs.obs_data_set_array(settings,name,keys)
    obs.obs_data_array_release(keys)
  end
end
function script_unload()
  stop_all(true)
  for _,fn in pairs(callbacks) do obs.obs_hotkey_unregister(fn) end
end
function script_description()
  return 'Carruleddhi: one-shot confetti, ribbons and sparkles. Ctrl+Shift+F8/F9/F10; F11 hides effects. Repeated clicks restart the effect.'
end
