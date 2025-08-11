const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { createServer } = require('http');
const next = require('next');
const net = require('net');

const isDev = process.env.NODE_ENV === 'development';
const skipPython = process.argv.includes('--no-python');
let port = process.env.PORT || 3000;

let mainWindow;
let nextApp;
let server;
let pythonProcess;

const isMac = process.platform === 'darwin';

// Find an available port
const findAvailablePort = (startPort) => {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, (err) => {
      if (err) {
        server.close();
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        const availablePort = server.address().port;
        server.close();
        resolve(availablePort);
      }
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
};

// Prepare Next.js app
const prepareNext = () => {
  return new Promise((resolve, reject) => {
    const nextDir = path.join(__dirname, '..');
    console.log('Next.js directory:', nextDir);
    console.log('Port:', port);
    
    nextApp = next({ 
      dev: false, 
      dir: nextDir,
      quiet: false
    });
    
    console.log('Preparing Next.js app...');
    
    nextApp.prepare()
      .then(() => {
        console.log('Next.js app prepared, creating server...');
        const handle = nextApp.getRequestHandler();
        server = createServer((req, res) => handle(req, res));
        
        server.listen(port, (err) => {
          if (err) {
            console.error('Server listen error:', err);
            reject(err);
          } else {
            console.log(`Next.js server ready on http://localhost:${port}`);
            resolve();
          }
        });
        
        server.on('error', (err) => {
          console.error('Server error:', err);
          reject(err);
        });
      })
      .catch((err) => {
        console.error('Next.js prepare error:', err);
        reject(err);
      });
  });
};

// Start Python backend - use PyInstaller executable if available
const startPythonBackend = () => {
  return new Promise((resolve) => {
    if (skipPython) {
      console.log('Skipping Python backend startup (--no-python flag)');
      resolve();
      return;
    }

    const fs = require('fs');
    let pythonBackendPath;
    const isPackaged = app.isPackaged;
    console.log('App packaged:', isPackaged);

    if (isPackaged) {
      pythonBackendPath = path.join(process.resourcesPath, 'python-backend');
    } else {
      pythonBackendPath = path.join(__dirname, '..', 'python-backend');
    }
    console.log('Python backend path:', pythonBackendPath);

    // Prefer PyInstaller executable if present
    let executablePath = path.join(pythonBackendPath, 'dist', 'app');
    if (isMac && fs.existsSync(executablePath)) {
      console.log('Found PyInstaller executable:', executablePath);
      try {
        pythonProcess = spawn(executablePath, [], {
          cwd: pythonBackendPath,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PYTHONPATH: pythonBackendPath,
            PYTHONUNBUFFERED: '1'
          }
        });
        let backendStarted = false;
        pythonProcess.stdout.on('data', (data) => {
          console.log(`Python Backend: ${data}`);
          if (data.toString().includes('Running on') && !backendStarted) {
            backendStarted = true;
            resolve();
          }
        });
        pythonProcess.stderr.on('data', (data) => {
          console.error(`Python Backend Error: ${data}`);
        });
        pythonProcess.on('close', (code) => {
          console.log(`Python backend exited with code ${code}`);
        });
        pythonProcess.on('error', (error) => {
          console.error('Failed to start Python backend:', error);
          if (!backendStarted) {
            backendStarted = true;
            resolve();
          }
        });
        setTimeout(() => {
          if (!backendStarted) {
            console.log('Python backend timeout - continuing anyway...');
            backendStarted = true;
            resolve();
          }
        }, 10000);
        return;
      } catch (error) {
        console.error('Failed to start PyInstaller backend:', error);
        resolve();
        return;
      }
    }

    // Fallback: run app.py with Python
    const appScript = path.join(pythonBackendPath, 'app.py');
    if (!fs.existsSync(appScript)) {
      console.log('app.py not found, continuing without Python backend...');
      resolve();
      return;
    }

    // Mac: always use system Python, check for existence
    let pythonExecutable = 'python3';
    if (isMac) {
      const macPythonPaths = ['/usr/bin/python3', '/usr/local/bin/python3', 'python3'];
      pythonExecutable = macPythonPaths.find(p => p.startsWith('/') ? fs.existsSync(p) : true) || 'python3';
    } else {
      // Other platforms: try venv first, then system Python
      const pythonPaths = [
        path.join(pythonBackendPath, 'venv', 'bin', 'python'),
        path.join(pythonBackendPath, 'venv', 'bin', 'python3'),
        'python3',
        'python',
        '/usr/bin/python3',
        '/usr/bin/python',
        '/usr/local/bin/python3',
        '/usr/local/bin/python'
      ];
      pythonExecutable = pythonPaths.find(p => p.startsWith('/') ? fs.existsSync(p) : true) || 'python3';
    }
    console.log('Using Python executable:', pythonExecutable);

    // Check if Python is available (sync test)
    try {
      const spawnSync = require('child_process').spawnSync;
      const pyTest = spawnSync(pythonExecutable, ['--version']);
      if (pyTest.error) {
        throw pyTest.error;
      }
    } catch (err) {
      console.error('Python not found on this system. Please install Python 3.');
      resolve();
      return;
    }

    // Check if dependencies are installed (try importing flask)
    try {
      const spawnSync = require('child_process').spawnSync;
      const depTest = spawnSync(pythonExecutable, ['-c', 'import flask'], {cwd: pythonBackendPath});
      if (depTest.status !== 0) {
        console.error('Required Python dependencies not found. Please run:');
        console.error(`  ${pythonExecutable} -m pip install -r requirements.txt`);
        resolve();
        return;
      }
    } catch (err) {
      console.error('Error checking Python dependencies:', err);
      resolve();
      return;
    }

    // Start backend
    try {
      pythonProcess = spawn(pythonExecutable, [appScript], {
        cwd: pythonBackendPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONPATH: pythonBackendPath,
          PYTHONUNBUFFERED: '1'
        }
      });
      let backendStarted = false;
      pythonProcess.stdout.on('data', (data) => {
        console.log(`Python Backend: ${data}`);
        if (data.toString().includes('Running on') && !backendStarted) {
          backendStarted = true;
          resolve();
        }
      });
      pythonProcess.stderr.on('data', (data) => {
        console.error(`Python Backend Error: ${data}`);
      });
      pythonProcess.on('close', (code) => {
        console.log(`Python backend exited with code ${code}`);
      });
      pythonProcess.on('error', (error) => {
        console.error('Failed to start Python backend:', error);
        if (!backendStarted) {
          backendStarted = true;
          resolve();
        }
      });
      setTimeout(() => {
        if (!backendStarted) {
          console.log('Python backend timeout - continuing anyway...');
          backendStarted = true;
          resolve();
        }
      }, 10000);
    } catch (error) {
      console.error('Failed to start Python backend:', error);
      resolve();
    }
  });
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'default',
    show: false
  });

  mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// App startup
app.whenReady().then(async () => {
  try {
    console.log('Starting Mood Board App...');
    console.log('App is packaged:', app.isPackaged);
    console.log('Resources path:', process.resourcesPath);
    console.log('Current directory:', __dirname);
    
    port = await findAvailablePort(port);
    console.log('Using port:', port);
    
    if (!skipPython) {
      try {
        await startPythonBackend();
        console.log('Python backend started successfully');
      } catch (error) {
        console.error('Python backend failed to start, continuing anyway:', error);
      }
    } else {
      console.log('Skipping Python backend startup (--no-python flag)');
    }
    
    try {
      await prepareNext();
      console.log('Next.js server started successfully');
    } catch (error) {
      console.error('Next.js server failed to start:', error);
      throw error;
    }
    
    createWindow();
    console.log('Application started successfully');
    
  } catch (error) {
    console.error('Failed to start application:', error);
    const { dialog } = require('electron');
    let errorMessage = `Failed to start the application:\n\n${error.message}`;
    
    if (error.code === 'ENOTDIR') {
      errorMessage += '\n\nThis usually means a required file or directory is missing or corrupted.';
    } else if (error.code === 'ENOENT') {
      errorMessage += '\n\nThis usually means a required executable (like Python) was not found.';
    }
    
    dialog.showErrorBox('Startup Error', errorMessage);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
  
  if (server) {
    server.close();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (navigationEvent, navigationURL) => {
    navigationEvent.preventDefault();
    shell.openExternal(navigationURL);
  });
});

process.on('SIGINT', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
  app.quit();
});

process.on('SIGTERM', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
  app.quit();
});
