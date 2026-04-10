const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadData:            ()                          => ipcRenderer.invoke('load-data'),
  saveData:            (data)                      => ipcRenderer.invoke('save-data', data),
  openCsvDialog:       ()                          => ipcRenderer.invoke('open-csv-dialog'),
  saveCsvDialog:       (content)                   => ipcRenderer.invoke('save-csv-dialog', content),
  getLocalIP:          ()                          => ipcRenderer.invoke('get-local-ip'),
  n3dRequest:          (path, method, body, key)   => ipcRenderer.invoke('n3d-request', { path, method, body, apiKey: key }),
  onInventoryUpdated:  (cb)                        => {
    ipcRenderer.on('inventory-updated', cb);
    return () => ipcRenderer.removeListener('inventory-updated', cb);
  },
  loadSettings:        ()                          => ipcRenderer.invoke('load-settings'),
  saveSettings:        (s)                         => ipcRenderer.invoke('save-settings', s),
  isUsingCloud:        ()                          => ipcRenderer.invoke('is-using-cloud'),
  pushLocalToCloud:    ()                          => ipcRenderer.invoke('push-local-to-cloud'),
  pick3mfFolder:       ()                          => ipcRenderer.invoke('pick-3mf-folder'),
  upload3mf:           (productName, destFolder)   => ipcRenderer.invoke('upload-3mf', { productName, destFolder }),
  openFolder:          (folderPath)                => ipcRenderer.invoke('open-folder', folderPath),
  openInSlicer:        (filePath, slicer)          => ipcRenderer.invoke('open-in-slicer', { filePath, slicer }),
  getProductFolder:    (productName, rootFolder)   => ipcRenderer.invoke('get-product-folder', { productName, rootFolder }),
  createProductFolder: (productName, rootFolder)   => ipcRenderer.invoke('create-product-folder', { productName, rootFolder }),
  downloadImage:       (url, destFolder, fileName) => ipcRenderer.invoke('download-image', { url, destFolder, fileName }),
  downloadN3dFiles:    (slug, profiles, destFolder, authToken0, authToken1) => ipcRenderer.invoke('download-3mf-n3d', { slug, profiles, destFolder, authToken0, authToken1 }),
  uploadImage:         (destFolder, fileName)      => ipcRenderer.invoke('upload-image', { destFolder, fileName }),
  openExternal:        (url)                         => ipcRenderer.invoke('open-external', url),
  getBambuVersion:     (exePath)                     => ipcRenderer.invoke('get-bambu-version', exePath),
  // Printer monitoring
  printerBambuWebLogin:     ()                          => ipcRenderer.invoke('printer-bambu-web-login'),
  printerBambuLogin:        (account, password)        => ipcRenderer.invoke('printer-bambu-login', { account, password }),
  printerBambuVerify:       (account, tfaKey, code)    => ipcRenderer.invoke('printer-bambu-verify', { account, tfaKey, code }),
  printerBambuVerifyCode:   (account, code)            => ipcRenderer.invoke('printer-bambu-verify-code', { account, code }),
  printerBambuGetDevices:   (accessToken)              => ipcRenderer.invoke('printer-bambu-get-devices', { accessToken }),
  printerBambuGetUid:       (accessToken)              => ipcRenderer.invoke('printer-bambu-get-uid', { accessToken }),
  printerBambuConnect:      (auth)                     => ipcRenderer.invoke('printer-bambu-connect', { auth }),
  printerBambuDisconnect:   ()                         => ipcRenderer.invoke('printer-bambu-disconnect'),
  printerBambuRefreshStatus:(serial)                   => ipcRenderer.invoke('printer-bambu-refresh-status', { serial }),
  printerBambuGetTasks:     (accessToken, page, limit, region) => ipcRenderer.invoke('printer-bambu-get-tasks', { accessToken, page, limit, region }),
  printerBambuCameraStart:  (serial, ip, accessCode)   => ipcRenderer.invoke('printer-bambu-camera-start', { serial, ip, accessCode }),
  printerBambuCameraStop:   (serial)                   => ipcRenderer.invoke('printer-bambu-camera-stop', { serial }),
  onBambuCameraFrame: (cb) => {
    ipcRenderer.on('printer-camera-frame', cb);
    return () => ipcRenderer.removeListener('printer-camera-frame', cb);
  },
  // Camera relay — streams LAN camera frames to the cloud server
  cameraRelayStart:  (cloudApiUrl, token) => ipcRenderer.invoke('camera-relay-start', { cloudApiUrl, token }),
  cameraRelayStop:   ()                   => ipcRenderer.invoke('camera-relay-stop'),
  cameraRelayStatus: ()                   => ipcRenderer.invoke('camera-relay-status'),
  onCameraRelayStatus: (cb) => {
    ipcRenderer.on('camera-relay-status', cb);
    return () => ipcRenderer.removeListener('camera-relay-status', cb);
  },
  printerSnapConnectReq:    (ip)                       => ipcRenderer.invoke('printer-snap-connect-request', { ip }),
  printerSnapStart:         (printer)                  => ipcRenderer.invoke('printer-snap-start', { printer }),
  printerSnapStop:          (id)                       => ipcRenderer.invoke('printer-snap-stop', { id }),
  printerBambuPrintCmd:     (serial, cmd)              => ipcRenderer.invoke('printer-bambu-print-cmd', { serial, cmd }),
  printerSnapPrintCmd:      (id, cmd)                  => ipcRenderer.invoke('printer-snap-print-cmd', { id, cmd }),
  onPrinterUpdate: (cb) => {
    ipcRenderer.on('printer-update', cb);
    return () => ipcRenderer.removeListener('printer-update', cb);
  },
  onBambuConn: (cb) => {
    ipcRenderer.on('bambu-conn', cb);
    return () => ipcRenderer.removeListener('bambu-conn', cb);
  },
  onBambuTokenRefreshed: (cb) => {
    ipcRenderer.on('bambu-token-refreshed', cb);
    return () => ipcRenderer.removeListener('bambu-token-refreshed', cb);
  },
  // Pop-out windows
  openPrintersPopout: () => ipcRenderer.invoke('open-printers-popout'),
  openMainWindow:     () => ipcRenderer.invoke('open-main-window'),
});
