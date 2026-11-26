/// <reference types="vite/client" />

declare global {
  interface Window {
    xiaoyejiang?: {
      openPdf: (multi?: boolean) => Promise<string[]>;
      saveFile: (defaultPath: string, extension: string) => Promise<string | null>;
      saveDirectory: () => Promise<string | null>;
      writeImage: (dirPath: string, fileName: string, data: ArrayBuffer) => Promise<string>;
      minimize: () => void;
      toggleMaximize: () => void;
      close: () => void;
    };
  }
}

export {};
