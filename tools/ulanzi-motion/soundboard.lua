obs=obslua
local source_name='SFX CARRULEDDHI'
local sound_dir=''
local callbacks={}
local ids={}
local sounds={{'SWOOSH','whoosh.wav','LEFT'},{'IMPACT','impact.wav','RIGHT'},{'ZWYCIESTWO','victory.wav','UP'},{'ODLICZANIE','countdown.wav','DOWN'},{'DZWONEK','chime.wav','HOME'}}
local function stop()
 local source=obs.obs_get_source_by_name(source_name)
 if source then
  obs.obs_source_media_stop(source)
  local settings=obs.obs_data_create()
  obs.obs_data_set_string(settings,'local_file','')
  obs.obs_source_update(source,settings)
  obs.obs_data_release(settings)
  obs.obs_source_release(source)
 end
end
local function play(filename)
 local source=obs.obs_get_source_by_name(source_name)
 if not source then obs.script_log(obs.LOG_WARNING,'Missing '..source_name);return end
 local settings=obs.obs_data_create()
 obs.obs_data_set_string(settings,'local_file',sound_dir..'/'..filename)
 obs.obs_source_update(source,settings)
 obs.obs_data_release(settings)
 obs.obs_source_media_restart(source)
 obs.obs_source_release(source)
 obs.script_log(obs.LOG_INFO,'Carruleddhi sound: '..filename)
end
local function bind(name,key,callback,settings)
 local fn=function(pressed)if pressed then callback()end end
 callbacks[name]=fn
 local id=obs.obs_hotkey_register_frontend(name,name,fn);ids[name]=id
 local saved=obs.obs_data_get_array(settings,name)
 if obs.obs_data_array_count(saved)==0 then
  obs.obs_data_array_release(saved)
  local data=obs.obs_data_create_from_json('{"keys":[{"control":true,"alt":true,"shift":true,"key":"OBS_KEY_'..key..'"}]}')
  saved=obs.obs_data_get_array(data,'keys');obs.obs_data_release(data)
 end
 obs.obs_hotkey_load(id,saved);obs.obs_data_array_release(saved)
end
function script_load(settings)
 sound_dir=obs.obs_data_get_string(settings,'sound_dir')
 stop()
 for _,sound in ipairs(sounds)do
  local filename=sound[2]
  bind('Carruleddhi SFX '..sound[1],sound[3],function()play(filename)end,settings)
 end
 bind('Carruleddhi SFX STOP','END',stop,settings)
 obs.script_log(obs.LOG_INFO,'Carruleddhi soundboard ready')
end
function script_save(settings)
 for name,id in pairs(ids)do local keys=obs.obs_hotkey_save(id);obs.obs_data_set_array(settings,name,keys);obs.obs_data_array_release(keys)end
end
function script_unload()
 stop()
 for _,fn in pairs(callbacks)do obs.obs_hotkey_unregister(fn)end
end
function script_description()return 'Carruleddhi sound effects. Monitor-only through Fast Track and captured Desktop Audio, avoiding double output. Ctrl+Alt+Shift+arrows/Home; End stops.'end
