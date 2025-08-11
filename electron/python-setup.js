const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Setup Python environment and install dependencies
const setupPythonEnvironment = (pythonBackendPath) => {
  return new Promise((resolve, reject) => {
    console.log('Setting up Python environment...');
    
    const venvPath = path.join(pythonBackendPath, 'venv');
    const requirementsPath = path.join(pythonBackendPath, 'requirements.txt');
    
    // Check if requirements.txt exists
    if (!fs.existsSync(requirementsPath)) {
      console.log('No requirements.txt found, skipping dependency installation');
      resolve();
      return;
    }
    
    let pythonCmd = 'python3';
    
    // Try to find Python executable
    const pythonPaths = [
      'python3',
      'python',
      '/usr/bin/python3',
      '/usr/bin/python',
      '/usr/local/bin/python3',
      '/usr/local/bin/python'
    ];
    
    for (const pyPath of pythonPaths) {
      if (pyPath.startsWith('/') && fs.existsSync(pyPath)) {
        pythonCmd = pyPath;
        break;
      } else if (!pyPath.startsWith('/')) {
        pythonCmd = pyPath;
        break;
      }
    }
    
    console.log('Using Python:', pythonCmd);
    
    // Check if virtual environment exists
    if (!fs.existsSync(venvPath)) {
      console.log('Creating virtual environment...');
      
      const venvProcess = spawn(pythonCmd, ['-m', 'venv', venvPath], {
        cwd: pythonBackendPath,
        stdio: ['inherit', 'pipe', 'pipe']
      });
      
      venvProcess.on('close', (code) => {
        if (code === 0) {
          console.log('Virtual environment created successfully');
          installDependencies();
        } else {
          console.error('Failed to create virtual environment');
          resolve(); // Continue anyway
        }
      });
      
      venvProcess.on('error', (error) => {
        console.error('Error creating virtual environment:', error);
        resolve(); // Continue anyway
      });
    } else {
      console.log('Virtual environment already exists');
      installDependencies();
    }
    
    function installDependencies() {
      const pipExecutable = path.join(venvPath, 'bin', 'python');
      
      if (!fs.existsSync(pipExecutable)) {
        console.log('Virtual environment Python not found, using system Python');
        resolve();
        return;
      }
      
      console.log('Installing Python dependencies...');
      
      const pipProcess = spawn(pipExecutable, ['-m', 'pip', 'install', '-r', requirementsPath], {
        cwd: pythonBackendPath,
        stdio: ['inherit', 'pipe', 'pipe']
      });
      
      pipProcess.stdout.on('data', (data) => {
        console.log(`Pip: ${data}`);
      });
      
      pipProcess.stderr.on('data', (data) => {
        console.error(`Pip Error: ${data}`);
      });
      
      pipProcess.on('close', (code) => {
        if (code === 0) {
          console.log('Python dependencies installed successfully');
        } else {
          console.error('Failed to install some Python dependencies');
        }
        resolve();
      });
      
      pipProcess.on('error', (error) => {
        console.error('Error installing dependencies:', error);
        resolve();
      });
    }
  });
};

module.exports = { setupPythonEnvironment };
