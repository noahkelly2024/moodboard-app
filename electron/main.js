const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { createServer } = require('http');
const next = require('next');
const net = require('net');

const isDev = process.env.NODE_ENV === 'development';
let port = process.env.PORT || 3000;

let mainWindow;
let nextApp;
let server;
let pythonProcess;

// Find an available port
const findAvailablePort = (startPort) => {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, (err) => {
      if (err) {
        // Port is in use, try the next one
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
        // Port is in use, try the next one
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
      quiet: false // Enable logging
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

// Start Python backend
const startPythonBackend = () => {
  return new Promise((resolve, reject) => {
    const pythonBackendPath = path.join(__dirname, '..', 'python-backend');
    
    // Check if we're in a packaged app
    const isPackaged = app.isPackaged;
    console.log('App packaged:', isPackaged);
    console.log('Python backend path:', pythonBackendPath);
    
    // Try different Python executable paths
    let pythonExecutable = 'python3';
    if (isPackaged) {
      pythonExecutable = path.join(process.resourcesPath, 'python-backend', 'venv', 'bin', 'python');
    } else {
      // Try to find python executable
      const venvPython = path.join(pythonBackendPath, 'venv', 'bin', 'python');
      const fs = require('fs');
      if (fs.existsSync(venvPython)) {
        pythonExecutable = venvPython;
      }
    }
    
    const appScript = path.join(pythonBackendPath, 'app.py');
    
    console.log('Python executable:', pythonExecutable);
    console.log('App script:', appScript);
    console.log('Starting Python backend...');
    
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
      if ((data.toString().includes('Running on') || data.toString().includes('Server listening')) && !backendStarted) {
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
      // Don't reject immediately, try to continue without Python backend
      if (!backendStarted) {
        console.log('Continuing without Python backend...');
        backendStarted = true;
        resolve();
      }
    });
    
    // Fallback timeout - resolve anyway after 10 seconds
    setTimeout(() => {
      if (!backendStarted) {
        console.log('Python backend timeout - continuing anyway...');
        backendStarted = true;
        resolve();
      }
    }, 10000);
  });
};

const createWindow = () => {
  // Create the browser window
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

  // Load the Next.js app
  mainWindow.loadURL(`http://localhost:${port}`);

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// App event listeners
app.whenReady().then(async () => {
  try {
    console.log('Starting Mood Board App...');
    console.log('App is packaged:', app.isPackaged);
    console.log('Resources path:', process.resourcesPath);
    console.log('Current directory:', __dirname);
    
    // Find an available port
    port = await findAvailablePort(port);
    console.log('Using port:', port);
    
    // Start Python backend first (but don't fail if it doesn't start)
    try {
      await startPythonBackend();
      console.log('Python backend started successfully');
    } catch (error) {
      console.error('Python backend failed to start, continuing anyway:', error);
    }
    
    // Start Next.js server
    try {
      await prepareNext();
      console.log('Next.js server started successfully');
    } catch (error) {
      console.error('Next.js server failed to start:', error);
      // If Next.js fails, we can't continue
      throw error;
    }
    
    // Create window
    createWindow();
    console.log('Application started successfully');
    
  } catch (error) {
    console.error('Failed to start application:', error);
    // Show error dialog instead of just quitting
    const { dialog } = require('electron');
    dialog.showErrorBox('Startup Error', `Failed to start the application:\n\n${error.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Kill Python process
  if (pythonProcess) {
    pythonProcess.kill();
  }
  
  // Close server
  if (server) {
    server.close();
  }
  
  // Quit app
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (navigationEvent, navigationURL) => {
    navigationEvent.preventDefault();
    shell.openExternal(navigationURL);
  });
});

// Handle app termination
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
