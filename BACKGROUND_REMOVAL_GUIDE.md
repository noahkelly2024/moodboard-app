# Mood Board App - Background Removal Guide

## 🎯 Current Features

### Background Removal Options
The app now includes three background removal algorithms you can choose from:

1. **Client-side (Default)** - Fast, runs in your browser, good for simple backgrounds
2. **AI (requires backend)** - Professional quality using rembg Python library
3. **GrabCut** - Advanced client-side algorithm with edge detection

### How to Use

#### Quick Start (Client-side Background Removal)
1. Open the app at http://localhost:3000
2. Upload images using the "Choose Images" button
3. The **BG Removal** dropdown in the top bar is set to "Client-side" by default
4. Click the background removal button (filter icon) on any image
5. Toggle between original/processed versions using the rotate icon

#### Advanced Setup (AI Background Removal)
For professional-quality AI background removal:

1. **Start the Python Backend:**
   ```bash
   cd python-backend
   ./start_backend.sh
   ```
   This will install dependencies and start the server at http://127.0.0.1:5000

2. **In the Web App:**
   - Change the **BG Removal** dropdown from "Client-side" to "AI (requires backend)"
   - Now background removal will use the professional rembg AI models

### UI Controls

- **BG Removal Dropdown**: Located in the top header, select your preferred algorithm
- **Individual Image Processing**: Click the filter icon on each image card
- **Batch Processing**: Select multiple images and use "Remove BG" button for bulk processing
- **Toggle Views**: Use the rotate icon to switch between original and processed versions

## 🚀 Setup Instructions

### Prerequisites
- Node.js for the frontend
- Python 3.8+ (only needed for AI background removal)

### Running the Application

#### 1. Start the Next.js Frontend:
```bash
npm run dev
```
*The app will run on http://localhost:3000*

#### 2. Optional - Start AI Backend (for better quality):
```bash
cd python-backend
./start_backend.sh
```
*The API server will run on http://127.0.0.1:5000*

## 🔧 Technical Details

### Client-side Algorithm
- Color-based background detection
- Edge preservation using Sobel operators
- Multiple background sampling points
- Gradual transparency for smooth edges

### AI Algorithm (when backend is running)
- Uses professional rembg Python library
- Multiple AI models available (u2net, u2net_human_seg, etc.)
- Significantly better quality than client-side processing
- Automatic fallback to client-side if API fails

### Features
- **Real-time processing feedback** with loading indicators
- **Intelligent algorithm selection** based on availability
- **Batch processing** for multiple images
- **Toggle functionality** to compare before/after results
- **Error handling** with graceful fallbacks

#### 2. Start the Next.js frontend:
```bash
npm run dev
```
*The frontend will run on http://localhost:3000*

## 🎨 How to Use

### Basic Professional Background Removal:
1. **Start both servers** (Python backend + Next.js frontend)
2. **Upload images** using the "Upload Images" button
3. **Select "AI - rembg (Professional Quality)"** from the algorithm dropdown
4. **Click the filter icon** on any image to remove its background
5. **Enjoy professional-quality results** instantly

### Batch Processing:
1. **Select multiple images** by clicking on them (blue border indicates selection)
2. **Choose "AI - rembg (Professional Quality)"**
3. **Click "Remove BG (X)"** to process all selected images with professional quality
4. **Monitor progress** as each image is processed

### Composition Mode:
1. **Click "Composition Mode"** for advanced layout work
2. **Layer controls are always visible** on the right side
3. **Drag images** from library to canvas
4. **Use layer controls** for precise positioning, sizing, rotation, and opacity
5. **Professional layer management** with drag-and-drop reordering

## 🔧 Technical Architecture

### Backend (Python + rembg):
- **Flask API server** on port 5000
- **rembg 2.0.67** - Latest professional background removal library
- **Multiple AI models** - u2net (default), human segmentation, clothing segmentation
- **ONNX Runtime** - Optimized inference engine
- **Memory efficient** - Smart session management

### Frontend (Next.js + React):
- **React hooks** for state management
- **TypeScript** for type safety  
- **Tailwind CSS** for modern styling
- **API integration** with error handling and fallbacks

### Model Information:
- **Primary Model**: u2net (Universal 2D Network)
- **Specialized Models**: Human segmentation, clothing segmentation
- **Model Size**: ~170MB total for u2net (downloaded once)
- **Processing**: Server-side with professional GPU optimization available

## 📊 Quality Comparison

### rembg Professional AI:
- ✅ **Exceptional edge detection** - Industry-leading precision
- ✅ **Complex scene handling** - Multiple subjects, patterns, textures
- ✅ **Fine detail preservation** - Hair, fur, transparent materials, jewelry
- ✅ **Lighting adaptability** - Works in challenging conditions
- ✅ **Commercial-grade quality** - Ready for e-commerce, marketing, design

### Previous Client-side Solutions:
- ⚠️ Limited accuracy with complex backgrounds
- ⚠️ Struggles with fine details
- ⚠️ Poor performance in challenging lighting
- ⚠️ Not suitable for professional use

## 🎯 Model Options

- **u2net**: General-purpose, excellent balance of speed and quality
- **u2net_human_seg**: Optimized for human subjects and portraits  
- **u2net_cloth_seg**: Perfect for fashion and clothing photography
- **isnet-general-use**: High-quality alternative to u2net
- **silueta**: Specialized for silhouette extraction
- **sam**: Segment Anything Model - Highest accuracy but slower

## 💡 Professional Tips

1. **Use u2net for most images** - Excellent general-purpose performance
2. **Switch to u2net_human_seg for portraits** - Optimized for people
3. **Use u2net_cloth_seg for fashion** - Perfect for clothing and accessories
4. **High-resolution input = better results** - Don't resize before processing
5. **Batch process similar content** - More efficient workflow
6. **Layer composition mode** - For complex design work

## 🔒 Privacy & Performance

- **Local processing** - Images processed on your own server
- **No cloud uploads** - Complete control over your data
- **Fast processing** - Dedicated Python backend for optimal speed
- **Professional reliability** - Stable API with comprehensive error handling

The rembg integration provides **dramatically superior background removal quality** compared to any browser-based solution. This is the same technology used by professional designers and e-commerce companies worldwide!
