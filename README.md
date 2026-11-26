# PDF处理工具

本机离线处理 PDF 的 Electron + Vue 3 桌面应用。当前发布版提供 PDF 截取、删除页面、合并、PDF 转图片、图片转 PDF 五项功能。

## 开发

```powershell
npm install
npm run dev
```

`services/local-pdf` 保留为后续功能开发代码；当前桌面应用不启动或打包 Python 服务。OCR 页面源码也保留，但发布版不显示入口。

## Windows 便携版

```powershell
npm run dist:win
```

成品为 `release/PDF处理工具.exe`。它会在运行时解包 Electron 文件，无需安装或单独部署 Python。发布包只收录编译后的应用文件，关闭 source map，并启用 ASAR 完整性校验和 Electron 安全开关。ASAR 与代码压缩不能阻止专业逆向；当前版本未做许可证校验或 Windows 数字签名。
