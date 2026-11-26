import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("xiaoyejiang", {
  openPdf: (multi = false) => ipcRenderer.invoke("dialog:openPdf", multi),
  saveFile: (defaultPath: string, extension: string) => ipcRenderer.invoke("dialog:save", defaultPath, extension),
  saveDirectory: () => ipcRenderer.invoke("dialog:pickDirectory"),
  writeImage: (dirPath: string, fileName: string, data: ArrayBuffer) => ipcRenderer.invoke("fs:writeImage", dirPath, fileName, data),
  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:toggleMaximize"),
  close: () => ipcRenderer.send("window:close"),
});
