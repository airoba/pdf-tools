import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: "PDF处理工具",
    frame: false,
    transparent: true,
    hasShadow: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  if (isDev) {
    await win.loadURL("http://127.0.0.1:5173");
  } else {
    await win.loadFile(path.join(app.getAppPath(), "dist/desktop/index.html"));
  }
}

ipcMain.handle("dialog:openPdf", async (_, multi: boolean) => {
  const result = await dialog.showOpenDialog({
    properties: multi ? ["openFile", "multiSelections"] : ["openFile"],
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle("dialog:save", async (_, defaultPath: string, extension: string) => {
  const result = await dialog.showSaveDialog({
    defaultPath,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  });
  return result.canceled ? null : result.filePath;
});

// 选择整个保存目录，供"批量导出多张图片"使用
ipcMain.handle("dialog:pickDirectory", async () => {
  const result = await dialog.showOpenDialog({
    title: "选择图片保存目录",
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});

// 将渲染进程传入的图片字节写入所选目录，返回写入后的完整路径
ipcMain.handle("fs:writeImage", async (_, dirPath: string, fileName: string, data: ArrayBuffer) => {
  const target = path.join(path.resolve(dirPath), fileName);
  await writeFile(target, Buffer.from(data));
  return target;
});

ipcMain.handle("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle("window:toggleMaximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.handle("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.on("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on("window:toggleMaximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.on("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

app.whenReady().then(() => {
  void createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});


