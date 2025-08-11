const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { createServer } = require('http');
const next = require('next');

const isDev = process.env.NODE_ENV === 'development';
const port = process.env.PORT || 3000;

let mainWindow;
let nextApp;
let server;
let pythonProcess;

// Prepare Next.js app
const prepareNext = () => {
  return new Promise((resolve, reject) => {
    nextApp = next({ 
      dev: false, 
      dir: path.join(__dirname, '..'),
      quiet: true
    });
    
    nextApp.prepare()
      .then(() => {
        const handle = nextApp.getRequestHandler();
        server = createServer((req, res) => handle(req, res));
        
        server.listen(port, (err) => {
          if (err) {
            reject(err);
          } else {
            console.log(`Next.js server ready on http://localhost:${port}`);
            resolve();
          }
        });
      })
      .catch(reject);
  });
};

// Start Python backend
const startPythonBackend = () => {
  return new Promise((resolve, reject) => {
    const pythonBackendPath = path.join(__dirname, '..', 'python-backend');
    const startScript = path.join(pythonBackendPath, 'start_backend.sh');
    
    // Check if we're in a packaged app
    const isPackaged = app.isPackaged;
    const pythonExecutable = isPackaged ? 
      path.join(process.resourcesPath, 'python-backend', 'venv', 'bin', 'python') :
      path.join(pythonBackendPath, 'venv', 'bin', 'python');
    
    const appScript = path.join(pythonBackendPath, 'app.py');
    
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
    
    pythonProcess.stdout.on('data', (data) => {
      console.log(`Python Backend: ${data}`);
      if (data.toString().includes('Running on')) {
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
      reject(error);
    });
    
    // Fallback timeout
    setTimeout(() => {
      resolve();
    }, 5000);
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
    
    // Start Python backend first
    await startPythonBackend();
    console.log('Python backend started');
    
    // Start Next.js server
    await prepareNext();
    console.log('Next.js server started');
    
    // Create window
    createWindow();
    
  } catch (error) {
    console.error('Failed to start application:', error);
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
