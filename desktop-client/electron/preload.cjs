const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('meowlingo', {
  snapshot: () => ipcRenderer.invoke('snapshot'), settings: () => ipcRenderer.invoke('settings'),
  save: values => ipcRenderer.invoke('save-settings', values), openConfig: () => ipcRenderer.invoke('open-config'),
});
