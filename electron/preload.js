// Preload script for main window
// Exposes a minimal, secure IPC bridge to the renderer for Wayfair integration

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wayfair', {
  open: (query) => ipcRenderer.invoke('wayfair:open', query),
  extract: () => ipcRenderer.invoke('wayfair:extract'),
  reload: () => ipcRenderer.send('wayfair:reload'),
  toggle: () => ipcRenderer.invoke('wayfair:toggle'),
  back: () => ipcRenderer.invoke('wayfair:back'),
  forward: () => ipcRenderer.invoke('wayfair:forward'),
  onProducts: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('wayfair:products', listener);
    return () => ipcRenderer.removeListener('wayfair:products', listener);
  },
  onStatus: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('wayfair:status', listener);
    return () => ipcRenderer.removeListener('wayfair:status', listener);
  }
});

// Optionally expose an event once DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  console.log('Preload ready: Wayfair bridge exposed');
});
