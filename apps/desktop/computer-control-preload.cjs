const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('computerControl', {
  pause: () => ipcRenderer.send('computer-control:pause'),
  cancel: () => ipcRenderer.send('computer-control:cancel'),
});
