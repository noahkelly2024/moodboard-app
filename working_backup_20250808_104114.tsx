'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Upload, Download, Play, Pause, SkipBack, SkipForward, Trash2, RotateCcw, Grid, Search, ExternalLink, Plus, Filter, X, Heart, ChevronUp, ChevronDown, Layers, Move, RotateCw } from 'lucide-react';
import { ImageType, SearchResult, SearchFilters, Slide, Layer } from '@/types';

const MoodBoardApp = () => {
  const [images, setImages] = useState<ImageType[]>([]);
  const [slides, setSlides] = useState<Slide[]>([{ id: 1, layers: [], backgroundColor: '#1f2937' }]);
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const [selectedLayer, setSelectedLayer] = useState<string | number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [slideInterval, setSlideInterval] = useState<number>(3000);
  const [viewMode, setViewMode] = useState<'grid' | 'slideshow' | 'preview'>('grid');
  const [compositionMode, setCompositionMode] = useState<boolean>(false);
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);
  const [selectedImages, setSelectedImages] = useState<Set<string | number>>(new Set());
  const [activeTab, setActiveTab] = useState<'moodboard' | 'search'>('moodboard');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    category: 'all',
    priceRange: 'all',
    style: 'all'
  });
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [draggedImage, setDraggedImage] = useState<ImageType | null>(null);
  const [isDraggingLayer, setIsDraggingLayer] = useState<string | number | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [processingImages, setProcessingImages] = useState<Set<string | number>>(new Set());
  const [backgroundRemovalAlgorithm, setBackgroundRemovalAlgorithm] = useState<'ai' | 'grabcut' | 'simple'>('ai');
  const [rembgModel, setRembgModel] = useState<string>('u2net');
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [aiModelLoading, setAiModelLoading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const compositionCanvasRef = useRef<HTMLDivElement>(null);

  // Mock furniture search API - In production, integrate with real furniture APIs
  const searchFurniture = useCallback(async (query: string, filters: SearchFilters) => {
    setIsSearching(true);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock search results with realistic furniture data
    const mockResults = [
      {
        id: 'wayfair-1',
        title: 'Modern Velvet Accent Chair',
        price: '$299.99',
        originalPrice: '$399.99',
        site: 'Wayfair',
        image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=300&h=300&fit=crop&crop=center',
        url: '#',
        rating: 4.5,
        reviews: 234,
        category: 'seating',
        style: 'modern',
        inStock: true
      },
      {
        id: 'ikea-1',
        title: 'Scandinavian Dining Table',
        price: '$199.00',
        originalPrice: null,
        site: 'IKEA',
        image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=300&h=300&fit=crop&crop=center',
        url: '#',
        rating: 4.2,
        reviews: 156,
        category: 'tables',
        style: 'scandinavian',
        inStock: true
      },
      {
        id: 'cb2-1',
        title: 'Industrial Metal Bookshelf',
        price: '$449.95',
        originalPrice: null,
        site: 'CB2',
        image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&h=300&fit=crop&crop=center',
        url: '#',
        rating: 4.7,
        reviews: 89,
        category: 'storage',
        style: 'industrial',
        inStock: false
      },
      {
        id: 'westelm-1',
        title: 'Mid-Century Floor Lamp',
        price: '$179.00',
        originalPrice: '$229.00',
        site: 'West Elm',
        image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=300&fit=crop&crop=center',
        url: '#',
        rating: 4.4,
        reviews: 312,
        category: 'lighting',
        style: 'mid-century',
        inStock: true
      },
      {
        id: 'pottery-1',
        title: 'Rustic Wooden Coffee Table',
        price: '$599.00',
        originalPrice: null,
        site: 'Pottery Barn',
        image: 'https://images.unsplash.com/photo-1549497538-303791108f95?w=300&h=300&fit=crop&crop=center',
        url: '#',
        rating: 4.6,
        reviews: 187,
        category: 'tables',
        style: 'rustic',
        inStock: true
      },
      {
        id: 'crate-1',
        title: 'Contemporary Sectional Sofa',
        price: '$1299.00',
        originalPrice: '$1599.00',
        site: 'Crate & Barrel',
        image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=300&h=300&fit=crop&crop=center',
        url: '#',
        rating: 4.3,
        reviews: 98,
        category: 'seating',
        style: 'contemporary',
        inStock: true
      }
    ];
    
    // Filter results based on search query and filters
    let filteredResults = mockResults.filter(item => 
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.category.includes(query.toLowerCase()) ||
      item.style.includes(query.toLowerCase())
    );
    
    if (filters.category !== 'all') {
      filteredResults = filteredResults.filter(item => item.category === filters.category);
    }
    
    if (filters.style !== 'all') {
      filteredResults = filteredResults.filter(item => item.style === filters.style);
    }
    
    if (filters.priceRange !== 'all') {
      filteredResults = filteredResults.filter(item => {
        const price = parseFloat(item.price.replace('$', '').replace(',', ''));
        switch (filters.priceRange) {
          case 'under200': return price < 200;
          case '200to500': return price >= 200 && price <= 500;
          case '500to1000': return price >= 500 && price <= 1000;
          case 'over1000': return price > 1000;
          default: return true;
        }
      });
    }
    
    setSearchResults(filteredResults);
    setIsSearching(false);
  }, []);

  // Enhanced background removal with AI and fallback options
  const removeBackground = useCallback(async (imageElement: HTMLImageElement, options: { algorithm?: 'ai' | 'grabcut' | 'simple'; sensitivity?: number } = {}): Promise<string | null> => {
    const { algorithm = 'ai', sensitivity = 0.3 } = options;
    
    return new Promise(async (resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        resolve(null);
        return;
      }
      
      canvas.width = imageElement.naturalWidth;
      canvas.height = imageElement.naturalHeight;
      ctx.drawImage(imageElement, 0, 0);
      
      try {
        let processedDataUrl: string | null = null;
        
        if (algorithm === 'ai') {
          // Try rembg API background removal first
          console.log(`Attempting rembg API background removal with model: ${rembgModel}...`);
          processedDataUrl = await removeBackgroundWithRembgAPI(canvas, rembgModel);
          
          if (!processedDataUrl) {
            console.log('AI removal failed, falling back to client-side algorithm...');
            processedDataUrl = await removeBackgroundClientSide(canvas, sensitivity);
          }
        } else {
          // Use client-side algorithm directly
          processedDataUrl = await removeBackgroundClientSide(canvas, sensitivity);
        }
        
        resolve(processedDataUrl);
      } catch (error) {
        console.error('Background removal failed:', error);
        // Final fallback to simple client-side processing
        try {
          const fallbackResult = await removeBackgroundClientSide(canvas, sensitivity);
          resolve(fallbackResult);
        } catch (fallbackError) {
          console.error('Fallback background removal also failed:', fallbackError);
          resolve(null);
        }
      }
    });
  }, [rembgModel]);

  // Advanced background removal using Python rembg API
  const removeBackgroundWithRembgAPI = useCallback(async (canvas: HTMLCanvasElement, model: string = 'u2net'): Promise<string | null> => {
    try {
      console.log(`Starting rembg API background removal with model: ${model}...`);
      
      // Convert canvas to base64
      const dataUrl = canvas.toDataURL('image/png');
      
      // Call the Python rembg API
      const response = await fetch('http://127.0.0.1:5000/remove-background', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: dataUrl,
          model: model
        })
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.success && result.image) {
        console.log('rembg API background removal completed successfully');
        return result.image;
      } else {
        throw new Error(result.error || 'Unknown API error');
      }
      
    } catch (error) {
      console.error('rembg API background removal failed:', error);
      return null;
    }
  }, []);

  // Improved client-side background removal using advanced edge detection
  const removeBackgroundClientSide = useCallback(async (canvas: HTMLCanvasElement, sensitivity: number): Promise<string | null> => {
    return new Promise((resolve) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Create edge detection using Sobel operator
      const edges = detectEdges(data, canvas.width, canvas.height);
      
      // Improved background detection using multiple sampling points
      const backgroundColors = sampleBackgroundColors(data, canvas.width, canvas.height);
      const avgBgColor = averageColors(backgroundColors);
      
      // Apply improved background removal with edge preservation
      for (let i = 0; i < data.length; i += 4) {
        const x = (i / 4) % canvas.width;
        const y = Math.floor((i / 4) / canvas.width);
        
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Calculate color distance to background
        const colorDistance = Math.sqrt(
          Math.pow(r - avgBgColor[0], 2) +
          Math.pow(g - avgBgColor[1], 2) +
          Math.pow(b - avgBgColor[2], 2)
        ) / 255;
        
        // Get edge strength at this pixel
        const edgeStrength = edges[y * canvas.width + x];
        
        // Adjust sensitivity based on edge strength (preserve edges)
        const adjustedSensitivity = sensitivity * (1 - edgeStrength * 0.5);
        
        // Apply background removal with edge consideration
        if (colorDistance < adjustedSensitivity) {
          // Gradual transparency for smoother edges
          const alpha = Math.max(0, Math.min(255, (colorDistance / adjustedSensitivity) * 255));
          data[i + 3] = alpha;
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    });
  }, []);

  // Edge detection using simplified Sobel operator
  const detectEdges = useCallback((data: Uint8ClampedArray, width: number, height: number): Float32Array => {
    const edges = new Float32Array(width * height);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        // Sobel X kernel
        const gx = (
          -1 * getGray(data, x - 1, y - 1, width) +
          1 * getGray(data, x + 1, y - 1, width) +
          -2 * getGray(data, x - 1, y, width) +
          2 * getGray(data, x + 1, y, width) +
          -1 * getGray(data, x - 1, y + 1, width) +
          1 * getGray(data, x + 1, y + 1, width)
        );
        
        // Sobel Y kernel
        const gy = (
          -1 * getGray(data, x - 1, y - 1, width) +
          -2 * getGray(data, x, y - 1, width) +
          -1 * getGray(data, x + 1, y - 1, width) +
          1 * getGray(data, x - 1, y + 1, width) +
          2 * getGray(data, x, y + 1, width) +
          1 * getGray(data, x + 1, y + 1, width)
        );
        
        // Calculate edge magnitude
        const magnitude = Math.sqrt(gx * gx + gy * gy) / 255;
        edges[y * width + x] = Math.min(1, magnitude);
      }
    }
    
    return edges;
  }, []);

  // Helper function to get grayscale value
  const getGray = useCallback((data: Uint8ClampedArray, x: number, y: number, width: number): number => {
    const index = (y * width + x) * 4;
    return (data[index] + data[index + 1] + data[index + 2]) / 3;
  }, []);

  // Sample background colors from multiple edge regions
  const sampleBackgroundColors = useCallback((data: Uint8ClampedArray, width: number, height: number): number[][] => {
    const samples: number[][] = [];
    const samplePoints = [
      // Corners
      [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
      // Edge centers
      [Math.floor(width / 2), 0], [Math.floor(width / 2), height - 1],
      [0, Math.floor(height / 2)], [width - 1, Math.floor(height / 2)],
      // Quarter points
      [Math.floor(width / 4), 0], [Math.floor(3 * width / 4), 0],
      [0, Math.floor(height / 4)], [0, Math.floor(3 * height / 4)]
    ];
    
    samplePoints.forEach(([x, y]) => {
      const index = (y * width + x) * 4;
      samples.push([data[index], data[index + 1], data[index + 2]]);
    });
    
    return samples;
  }, []);

  // Calculate average of sampled colors
  const averageColors = useCallback((colors: number[][]): number[] => {
    if (colors.length === 0) return [255, 255, 255];
    
    const sum = colors.reduce(
      (acc, color) => [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2]],
      [0, 0, 0]
    );
    
    return [sum[0] / colors.length, sum[1] / colors.length, sum[2] / colors.length];
  }, []);

  const addSearchResultToMoodBoard = useCallback(async (searchResult: SearchResult) => {
    try {
      // For demo purposes, we'll use the image URL directly
      // In production, you might want to fetch and process the image
      const newImage = {
        id: Date.now() + Math.random(),
        original: searchResult.image,
        processed: null,
        name: searchResult.title,
        useProcessed: false,
        searchMetadata: {
          price: searchResult.price,
          site: searchResult.site,
          url: searchResult.url,
          rating: searchResult.rating
        }
      };
      
      setImages(prev => [...prev, newImage]);
      
      // Switch to mood board tab after adding
      setActiveTab('moodboard');
    } catch (error) {
      console.error('Failed to add search result to mood board:', error);
      alert('Failed to add item to mood board. Please try again.');
    }
  }, []);

  // Layer management functions
  const addImageToSlide = useCallback((image: ImageType, slideIndex: number = currentSlide) => {
    const layer: Layer = {
      id: Date.now() + Math.random(),
      type: 'image',
      imageId: image.id,
      position: { x: 50 + Math.random() * 30 - 15, y: 50 + Math.random() * 30 - 15 }, // Randomized position
      size: { width: 200, height: 200 },
      rotation: 0,
      opacity: 1,
      zIndex: slides[slideIndex]?.layers.length || 0
    };

    setSlides(prev => prev.map((slide, index) => 
      index === slideIndex 
        ? { ...slide, layers: [...slide.layers, layer] }
        : slide
    ));
  }, [currentSlide, slides]);

  const moveLayerUp = useCallback((slideIndex: number, layerId: string | number) => {
    setSlides(prev => prev.map((slide, index) => {
      if (index !== slideIndex) return slide;
      
      const layers = [...slide.layers];
      const layerIndex = layers.findIndex(l => l.id === layerId);
      if (layerIndex < layers.length - 1) {
        // Swap with the layer above (higher index = higher layer)
        [layers[layerIndex], layers[layerIndex + 1]] = [layers[layerIndex + 1], layers[layerIndex]];
        // Update zIndex to match array position
        layers.forEach((layer, idx) => {
          layer.zIndex = idx;
        });
      }
      
      return { ...slide, layers };
    }));
  }, []);

  const moveLayerDown = useCallback((slideIndex: number, layerId: string | number) => {
    setSlides(prev => prev.map((slide, index) => {
      if (index !== slideIndex) return slide;
      
      const layers = [...slide.layers];
      const layerIndex = layers.findIndex(l => l.id === layerId);
      if (layerIndex > 0) {
        // Swap with the layer below (lower index = lower layer)
        [layers[layerIndex], layers[layerIndex - 1]] = [layers[layerIndex - 1], layers[layerIndex]];
        // Update zIndex to match array position
        layers.forEach((layer, idx) => {
          layer.zIndex = idx;
        });
      }
      
      return { ...slide, layers };
    }));
  }, []);

  const removeLayerFromSlide = useCallback((slideIndex: number, layerId: string | number) => {
    setSlides(prev => prev.map((slide, index) => 
      index === slideIndex 
        ? { ...slide, layers: slide.layers.filter(l => l.id !== layerId) }
        : slide
    ));
  }, []);

  const updateLayerProperty = useCallback((slideIndex: number, layerId: string | number, property: keyof Layer, value: any) => {
    setSlides(prev => prev.map((slide, index) => 
      index === slideIndex 
        ? {
            ...slide, 
            layers: slide.layers.map(layer => 
              layer.id === layerId 
                ? { ...layer, [property]: value }
                : layer
            )
          }
        : slide
    ));
  }, []);

  // Slide management functions
  const addSlide = useCallback(() => {
    const newSlide: Slide = {
      id: Date.now() + Math.random(),
      layers: [],
      backgroundColor: '#1f2937'
    };
    setSlides(prev => [...prev, newSlide]);
  }, []);

  // Text and background management functions
  const addTextToSlide = useCallback((slideIndex: number = currentSlide) => {
    const textLayer: Layer = {
      id: Date.now() + Math.random(),
      type: 'text',
      text: 'New Text',
      position: { x: 50, y: 50 },
      size: { width: 200, height: 50 },
      rotation: 0,
      opacity: 1,
      zIndex: slides[slideIndex]?.layers.length || 0,
      fontSize: 24,
      fontColor: '#ffffff',
      fontFamily: 'Inter',
      textAlign: 'left'
    };

    setSlides(prev => prev.map((slide, index) => 
      index === slideIndex 
        ? { ...slide, layers: [...slide.layers, textLayer] }
        : slide
    ));
  }, [currentSlide, slides]);

  const updateSlideBackground = useCallback((slideIndex: number, backgroundColor: string) => {
    setSlides(prev => prev.map((slide, index) => 
      index === slideIndex 
        ? { ...slide, backgroundColor }
        : slide
    ));
  }, []);

  const deleteSlide = useCallback((slideIndex: number) => {
    if (slides.length <= 1) return; // Don't delete the last slide
    
    setSlides(prev => prev.filter((_, index) => index !== slideIndex));
    
    // Adjust current slide if necessary
    if (currentSlide >= slideIndex && currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  }, [slides.length, currentSlide]);

  // Computed values - moved here to be available for functions
  const currentSlideData = slides[currentSlide];
  const currentImage = images[currentSlide];

  // Resize handling for layers
  const [isResizing, setIsResizing] = useState<{ layerId: string | number; direction: string } | null>(null);
  const [resizeStart, setResizeStart] = useState<{ width: number; height: number; mouseX: number; mouseY: number }>({ width: 0, height: 0, mouseX: 0, mouseY: 0 });

  const handleResizeStart = useCallback((e: React.MouseEvent, layerId: string | number, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const layer = currentSlideData?.layers.find(l => l.id === layerId);
    if (!layer) return;
    
    setIsResizing({ layerId, direction });
    setResizeStart({
      width: layer.size.width,
      height: layer.size.height,
      mouseX: e.clientX,
      mouseY: e.clientY
    });
  }, [currentSlideData]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !currentSlideData) return;
    
    const deltaX = e.clientX - resizeStart.mouseX;
    const deltaY = e.clientY - resizeStart.mouseY;
    
    let newWidth = resizeStart.width;
    let newHeight = resizeStart.height;
    
    // Calculate new size based on resize direction
    switch (isResizing.direction) {
      case 'se': // bottom-right
        newWidth = Math.max(50, resizeStart.width + deltaX);
        newHeight = Math.max(50, resizeStart.height + deltaY);
        break;
      case 'ne': // top-right
        newWidth = Math.max(50, resizeStart.width + deltaX);
        newHeight = Math.max(50, resizeStart.height - deltaY);
        break;
      case 'sw': // bottom-left
        newWidth = Math.max(50, resizeStart.width - deltaX);
        newHeight = Math.max(50, resizeStart.height + deltaY);
        break;
      case 'nw': // top-left
        newWidth = Math.max(50, resizeStart.width - deltaX);
        newHeight = Math.max(50, resizeStart.height - deltaY);
        break;
    }
    
    // Maintain aspect ratio when holding Shift
    if (e.shiftKey) {
      const aspectRatio = resizeStart.width / resizeStart.height;
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        newHeight = newWidth / aspectRatio;
      } else {
        newWidth = newHeight * aspectRatio;
      }
    }
    
    updateLayerProperty(currentSlide, isResizing.layerId, 'size', {
      width: Math.min(500, Math.max(50, newWidth)),
      height: Math.min(500, Math.max(50, newHeight))
    });
  }, [isResizing, resizeStart, currentSlide, updateLayerProperty]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(null);
    setResizeStart({ width: 0, height: 0, mouseX: 0, mouseY: 0 });
  }, []);

  // Add resize event listeners
  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // Add missing function stubs and drag/drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, image: ImageType) => {
    setDraggedImage(image);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (draggedImage) {
      addImageToSlide(draggedImage, currentSlide);
      setDraggedImage(null);
    }
  }, [draggedImage, currentSlide, addImageToSlide]);

  const handleLayerMouseDown = useCallback((e: React.MouseEvent, layerId: string | number) => {
    e.preventDefault();
    setSelectedLayer(layerId);
    setIsDraggingLayer(layerId);
    
    if (compositionCanvasRef.current) {
      const canvasRect = compositionCanvasRef.current.getBoundingClientRect();
      const layer = currentSlideData?.layers.find(l => l.id === layerId);
      if (layer) {
        // Calculate the offset relative to the layer's current position
        const layerX = (layer.position.x / 100) * canvasRect.width;
        const layerY = (layer.position.y / 100) * canvasRect.height;
        setDragOffset({
          x: e.clientX - canvasRect.left - layerX,
          y: e.clientY - canvasRect.top - layerY
        });
      }
    }
  }, [currentSlideData]);

  const toggleImageSelection = useCallback((imageId: string | number) => {
    setSelectedImages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(imageId)) {
        newSet.delete(imageId);
      } else {
        newSet.add(imageId);
      }
      return newSet;
    });
  }, []);

  const toggleBackgroundRemoval = useCallback((imageId: string | number) => {
    setImages(prev => prev.map(img => 
      img.id === imageId 
        ? { ...img, useProcessed: !img.useProcessed }
        : img
    ));
  }, []);

  const manualBackgroundRemoval = useCallback(async (imageId: string | number, algorithm: 'ai' | 'grabcut' | 'simple') => {
    const image = images.find(img => img.id === imageId);
    if (!image) return;

    // Add to processing set
    setProcessingImages(prev => new Set(prev).add(imageId));

    try {
      const imgElement = new Image();
      imgElement.crossOrigin = 'anonymous';
      
      await new Promise((resolve, reject) => {
        imgElement.onload = resolve;
        imgElement.onerror = reject;
        imgElement.src = image.original;
      });

      const processedUrl = await removeBackground(imgElement, { algorithm });
      
      if (processedUrl) {
        setImages(prev => prev.map(img => 
          img.id === imageId 
            ? { ...img, processed: processedUrl, useProcessed: true }
            : img
        ));
      } else {
        alert(`Background removal ${algorithm === 'ai' ? '(AI)' : '(Client-side)'} failed. Please try again or use a different algorithm.`);
      }
    } catch (error) {
      console.error('Background removal processing failed:', error);
      alert('Background removal failed. Please check the image and try again.');
    } finally {
      // Remove from processing set
      setProcessingImages(prev => {
        const newSet = new Set(prev);
        newSet.delete(imageId);
        return newSet;
      });
    }
  }, [images, removeBackground]);

  const deleteImage = useCallback((imageId: string | number) => {
    setImages(prev => prev.filter(img => img.id !== imageId));
    setSelectedImages(prev => {
      const newSet = new Set(prev);
      newSet.delete(imageId);
      return newSet;
    });
  }, []);

  const batchBackgroundRemoval = useCallback(async () => {
    const selectedImageArray = images.filter(img => selectedImages.has(img.id));
    if (selectedImageArray.length === 0) return;

    // Initialize batch progress
    setBatchProgress({ current: 0, total: selectedImageArray.length });

    // Add all images to processing set
    selectedImageArray.forEach(img => {
      setProcessingImages(prev => new Set(prev).add(img.id));
    });

    try {
      // Process images one by one to avoid overwhelming the system
      for (let index = 0; index < selectedImageArray.length; index++) {
        const image = selectedImageArray[index];
        
        // Update progress
        setBatchProgress({ current: index + 1, total: selectedImageArray.length });
        
        try {
          const imgElement = new Image();
          imgElement.crossOrigin = 'anonymous';
          
          await new Promise((resolve, reject) => {
            imgElement.onload = resolve;
            imgElement.onerror = reject;
            imgElement.src = image.original;
          });

          const processedUrl = await removeBackground(imgElement, { algorithm: backgroundRemovalAlgorithm });
          
          if (processedUrl) {
            setImages(prev => prev.map(img => 
              img.id === image.id 
                ? { ...img, processed: processedUrl, useProcessed: true }
                : img
            ));
          }
        } catch (error) {
          console.error(`Background removal failed for image ${image.id}:`, error);
        } finally {
          // Remove from processing set
          setProcessingImages(prev => {
            const newSet = new Set(prev);
            newSet.delete(image.id);
            return newSet;
          });
        }
      }
    } catch (error) {
      console.error('Batch background removal failed:', error);
    } finally {
      // Clear progress when done
      setBatchProgress(null);
    }
  }, [images, selectedImages, backgroundRemovalAlgorithm, removeBackground]);

  const exportMoodBoard = useCallback(() => {
    console.log('Export not yet implemented');
  }, []);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    
    const fileArray = Array.from(files);
    console.log(`Uploading ${fileArray.length} files`);
    
    for (const file of fileArray) {
      if (file.type.startsWith('image/')) {
        console.log(`Processing image: ${file.name} (${file.size} bytes)`);
        const reader = new FileReader();
        reader.onload = async (e) => {
          if (!e.target?.result || typeof e.target.result !== 'string') return;
          
          const dataUrl = e.target.result as string;
          console.log(`Image loaded as data URL: ${file.name} (${dataUrl.length} chars)`);
          
          const newImage: ImageType = {
            id: Date.now() + Math.random(),
            original: dataUrl,
            processed: null,
            name: file.name,
            useProcessed: false
          };
          
          setImages(prev => {
            console.log(`Adding image to state: ${file.name}. Total images will be: ${prev.length + 1}`);
            return [...prev, newImage];
          });
          
          // Optionally auto-process with AI if the API is available
          if (backgroundRemovalAlgorithm === 'ai') {
            try {
              const img = new Image();
              img.onload = async () => {
                try {
                  setProcessingImages(prev => new Set(prev).add(newImage.id));
                  const processedDataUrl = await removeBackground(img, { algorithm: 'ai' });
                  
                  if (processedDataUrl) {
                    setImages(prev => prev.map(image => 
                      image.id === newImage.id 
                        ? { ...image, processed: processedDataUrl, useProcessed: true }
                        : image
                    ));
                  }
                } catch (error) {
                  console.error('Auto background removal failed:', error);
                } finally {
                  setProcessingImages(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(newImage.id);
                    return newSet;
                  });
                }
              };
              img.crossOrigin = 'anonymous';
              img.src = dataUrl;
            } catch (error) {
              console.error('Failed to auto-process image:', error);
            }
          }
        };
        reader.onerror = (error) => {
          console.error('FileReader error:', error);
        };
        reader.readAsDataURL(file);
      }
    }
    
    // Clear the input
    if (event.target) {
      event.target.value = '';
    }
  }, [backgroundRemovalAlgorithm, removeBackground]);

  const handleSearch = useCallback(() => {
    if (searchQuery.trim()) {
      searchFurniture(searchQuery, searchFilters);
    }
  }, [searchQuery, searchFilters, searchFurniture]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchFilters({
      category: 'all',
      priceRange: 'all',
      style: 'all'
    });
  }, []);

  const toggleFavorite = useCallback((itemId: string) => {
    setFavorites(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  const deleteSelectedImages = useCallback(() => {
    const selectedIds = Array.from(selectedImages);
    setImages(prev => prev.filter(img => !selectedIds.includes(img.id)));
    setSelectedImages(new Set());
  }, [selectedImages]);

  const prevSlide = useCallback(() => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  }, [currentSlide]);

  const nextSlide = useCallback(() => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  }, [currentSlide, slides.length]);

  const startSlideshow = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const stopSlideshow = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Slideshow autoplay effect
  React.useEffect(() => {
    if (isPlaying && viewMode === 'preview') {
      intervalRef.current = setInterval(() => {
        setCurrentSlide((prev) => {
          const nextSlide = prev + 1;
          if (nextSlide >= slides.length) {
            // Loop back to first slide
            return 0;
          }
          return nextSlide;
        });
      }, slideInterval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isPlaying, slideInterval, slides.length, viewMode]);

  // Keyboard shortcuts for preview mode
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewMode === 'preview') {
        switch (e.key) {
          case 'Escape':
            setViewMode('slideshow');
            setIsPreviewMode(false);
            setIsPlaying(false);
            break;
          case 'ArrowLeft':
            e.preventDefault();
            prevSlide();
            break;
          case 'ArrowRight':
            e.preventDefault();
            nextSlide();
            break;
          case ' ':
            e.preventDefault();
            if (isPlaying) {
              stopSlideshow();
            } else {
              startSlideshow();
            }
            break;
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, isPlaying, prevSlide, nextSlide, startSlideshow, stopSlideshow]);

  // Add missing mouse move and mouse up handlers for layer dragging
  const handleLayerMouseMove = useCallback((e: MouseEvent) => {
    if (isDraggingLayer && compositionCanvasRef.current) {
      const rect = compositionCanvasRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100;
      const y = ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100;
      
      updateLayerProperty(currentSlide, isDraggingLayer, 'position', {
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y))
      });
    }
  }, [isDraggingLayer, dragOffset, currentSlide, updateLayerProperty]);

  const handleLayerMouseUp = useCallback(() => {
    setIsDraggingLayer(null);
    setDragOffset({ x: 0, y: 0 });
  }, []);

  // Add mouse move/up event listeners for layer dragging
  React.useEffect(() => {
    if (isDraggingLayer) {
      document.addEventListener('mousemove', handleLayerMouseMove);
      document.addEventListener('mouseup', handleLayerMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleLayerMouseMove);
        document.removeEventListener('mouseup', handleLayerMouseUp);
      };
    }
  }, [isDraggingLayer, handleLayerMouseMove, handleLayerMouseUp]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="glass-effect border-b border-gray-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top row - Title and Tab Navigation - Always visible */}
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gradient whitespace-nowrap">Mood Board Creator</h1>
              <p className="text-sm text-gray-400 hidden sm:block">Interior Design Tool</p>
            </div>
            
            {/* Tab Navigation - Always visible in same position */}
            <div className="flex bg-gray-700/50 backdrop-blur-sm rounded-lg p-1 border border-gray-600/30">
              <button
                onClick={() => setActiveTab('moodboard')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === 'moodboard' 
                    ? 'gradient-primary text-white shadow-sm' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-600/30'
                }`}
              >
                Mood Board
              </button>
              <button
                onClick={() => setActiveTab('search')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === 'search' 
                    ? 'gradient-primary text-white shadow-sm' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-600/30'
                }`}
              >
                Search Furniture
              </button>
            </div>
          </div>

          {/* Simple three-button navigation for Mood Board */}
          {activeTab === 'moodboard' && (
            <div className="flex items-center justify-center pb-4 border-t border-gray-700/30 pt-4">
              {/* Three main mode buttons - centered and simple */}
              <div className="flex bg-gray-700/50 backdrop-blur-sm rounded-lg p-1 border border-gray-600/30">
                <button
                  onClick={() => {
                    setViewMode('grid');
                    setIsPreviewMode(false);
                  }}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-md text-sm font-medium transition-all ${
                    viewMode === 'grid' 
                      ? 'gradient-primary text-white shadow-sm' 
                      : 'text-gray-300 hover:text-white hover:bg-gray-600/30'
                  }`}
                >
                  <Grid className="w-4 h-4" />
                  <span>Grid</span>
                </button>
                
                <button
                  onClick={() => {
                    setViewMode('slideshow');
                    setIsPreviewMode(false);
                  }}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-md text-sm font-medium transition-all ${
                    viewMode === 'slideshow' 
                      ? 'gradient-primary text-white shadow-sm' 
                      : 'text-gray-300 hover:text-white hover:bg-gray-600/30'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Slideshow</span>
                </button>
                
                <button
                  onClick={() => {
                    setViewMode('preview');
                    setIsPreviewMode(true);
                  }}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-md text-sm font-medium transition-all ${
                    viewMode === 'preview' 
                      ? 'gradient-primary text-white shadow-sm' 
                      : 'text-gray-300 hover:text-white hover:bg-gray-600/30'
                  }`}
                  disabled={slides.length === 0 || slides.every(s => s.layers.length === 0)}
                >
                  <Play className="w-4 h-4" />
                  <span>Preview</span>
                </button>
              </div>
              
              {/* Progress indicator and action buttons container */}
              <div className="flex items-center space-x-4">
                {(aiModelLoading || batchProgress) && (
                  <div className="flex items-center text-sm text-purple-400">
                    <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mr-2"></div>
                    <span className="whitespace-nowrap">
                      {aiModelLoading ? 'Loading...' : `Processing ${batchProgress!.current}/${batchProgress!.total}`}
                    </span>
                  </div>
                )}

                {/* Right side - Action buttons */}
                <div className="flex items-center space-x-2">
                {selectedImages.size > 0 && (
                  <button
                    onClick={batchBackgroundRemoval}
                    disabled={Array.from(selectedImages).some(id => processingImages.has(id))}
                    className="btn-gradient text-sm px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Filter className="w-4 h-4" />
                    <span className="ml-1 whitespace-nowrap">Remove BG ({selectedImages.size})</span>
                  </button>
                )}
                
                <button
                  onClick={exportMoodBoard}
                  disabled={compositionMode ? slides.length === 0 : images.length === 0}
                  className="btn-gradient text-sm px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  <span className="ml-1 whitespace-nowrap">Export</span>
                </button>
                
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-gradient text-sm px-3 py-1"
                >
                  <Upload className="w-4 h-4" />
                  <span className="ml-1 whitespace-nowrap">Upload</span>
                </button>
                </div>
              </div>
            </div>
          )}
              
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'search' ? (
          <div className="space-y-6">
            {/* Search Interface */}
            <div className="card-dark rounded-lg shadow-lg p-6">
              <div className="flex items-center space-x-4 mb-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Search for furniture, lighting, decor..."
                    className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                
                <button
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  className="btn-gradient disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
                
                {(searchQuery || searchResults.length > 0) && (
                  <button
                    onClick={clearSearch}
                    className="p-2 text-gray-400 hover:text-gray-300 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
              
              {/* Search Filters */}
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center space-x-2">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-300">Filters:</span>
                </div>
                
                <select
                  value={searchFilters.category}
                  onChange={(e) => setSearchFilters(prev => ({ ...prev, category: e.target.value }))}
                  className="px-3 py-1 text-sm border border-gray-600 rounded-md bg-gray-700 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                >
                  <option value="all">All Categories</option>
                  <option value="seating">Seating</option>
                  <option value="tables">Tables</option>
                  <option value="storage">Storage</option>
                  <option value="lighting">Lighting</option>
                  <option value="decor">Decor</option>
                </select>
                
                <select
                  value={searchFilters.style}
                  onChange={(e) => setSearchFilters(prev => ({ ...prev, style: e.target.value }))}
                  className="px-3 py-1 text-sm border border-gray-600 rounded-md bg-gray-700 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                >
                  <option value="all">All Styles</option>
                  <option value="modern">Modern</option>
                  <option value="contemporary">Contemporary</option>
                  <option value="mid-century">Mid-Century</option>
                  <option value="scandinavian">Scandinavian</option>
                  <option value="industrial">Industrial</option>
                  <option value="rustic">Rustic</option>
                </select>
                
                <select
                  value={searchFilters.priceRange}
                  onChange={(e) => setSearchFilters(prev => ({ ...prev, priceRange: e.target.value }))}
                  className="px-3 py-1 text-sm border border-gray-600 rounded-md bg-gray-700 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                >
                  <option value="all">All Prices</option>
                  <option value="under200">Under $200</option>
                  <option value="200to500">$200 - $500</option>
                  <option value="500to1000">$500 - $1,000</option>
                  <option value="over1000">Over $1,000</option>
                </select>
              </div>
            </div>
            
            {/* Search Results */}
            {isSearching && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Searching furniture sites...</p>
              </div>
            )}
            
            {!isSearching && searchResults.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Search Results ({searchResults.length})
                  </h2>
                  <div className="text-sm text-gray-600">
                    Showing results from Wayfair, IKEA, CB2, West Elm, Pottery Barn, Crate & Barrel
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {searchResults.map((item) => (
                    <div key={item.id} className="card-dark rounded-lg shadow-lg border border-gray-600 hover:border-gray-500 transition-all">
                      <div className="relative">
                        <img
                          src={item.image}
                          alt={item.title}
                          className="w-full h-48 object-cover rounded-t-lg"
                        />
                        <div className="absolute top-2 left-2">
                          <span className="px-2 py-1 bg-gray-800/80 backdrop-blur-sm text-xs font-medium text-white rounded">
                            {item.site}
                          </span>
                        </div>
                        <div className="absolute top-2 right-2 space-x-1">
                          <button
                            onClick={() => toggleFavorite(item.id)}
                            className={`p-1.5 rounded-full backdrop-blur-sm ${
                              favorites.has(item.id)
                                ? 'bg-red-600/80 text-white'
                                : 'bg-gray-800/80 text-gray-300 hover:text-red-400'
                            } transition-colors`}
                          >
                            <Heart className="w-4 h-4" fill={favorites.has(item.id) ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            onClick={() => addSearchResultToMoodBoard(item)}
                            className="p-1.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full hover:from-purple-700 hover:to-blue-700 transition-colors"
                            title="Add to mood board"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        {!item.inStock && (
                          <div className="absolute inset-0 bg-gray-900 bg-opacity-70 flex items-center justify-center rounded-t-lg">
                            <span className="text-white font-medium">Out of Stock</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="p-4">
                        <h3 className="font-medium text-white mb-2 line-clamp-2">{item.title}</h3>
                        
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-lg font-bold text-green-400">{item.price}</span>
                            {item.originalPrice && (
                              <span className="text-sm text-gray-400 line-through">{item.originalPrice}</span>
                            )}
                          </div>
                          
                          <div className="flex items-center text-sm text-gray-300">
                            <span className="text-yellow-400 mr-1">★</span>
                            {item.rating} ({item.reviews})
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => window.open(item.url, '_blank')}
                            className="flex items-center text-sm text-purple-400 hover:text-purple-300 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4 mr-1" />
                            View Details
                          </button>
                          
                          <button
                            onClick={() => addSearchResultToMoodBoard(item)}
                            className="btn-gradient text-sm"
                          >
                            Add to Board
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {!isSearching && searchQuery && searchResults.length === 0 && (
              <div className="text-center py-12 card-dark rounded-lg">
                <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">No results found</h3>
                <p className="text-gray-300">Try adjusting your search terms or filters</p>
              </div>
            )}
            
            {!searchQuery && searchResults.length === 0 && !isSearching && (
              <div className="text-center py-12 card-dark rounded-lg">
                <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Search for Furniture & Decor</h3>
                <p className="text-gray-300 mb-4">Find items from major furniture retailers and add them to your mood board</p>
                <div className="flex flex-wrap justify-center gap-2 text-sm text-gray-300">
                  <span className="px-2 py-1 bg-gray-600 rounded">Wayfair</span>
                  <span className="px-2 py-1 bg-gray-600 rounded">IKEA</span>
                  <span className="px-2 py-1 bg-gray-600 rounded">CB2</span>
                  <span className="px-2 py-1 bg-gray-600 rounded">West Elm</span>
                  <span className="px-2 py-1 bg-gray-600 rounded">Pottery Barn</span>
                  <span className="px-2 py-1 bg-gray-600 rounded">Crate & Barrel</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Mood Board Content */
          <>
            {images.length === 0 ? (
              <div className="text-center py-12">
                <Upload className="w-24 h-24 text-gray-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-600 mb-2">No images uploaded yet</h2>
                <p className="text-gray-500 mb-6">Upload images or search for furniture to start creating your mood board</p>
                <div className="flex justify-center space-x-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Upload className="w-5 h-5 mr-2" />
                    Choose Images
                  </button>
                  <button
                    onClick={() => setActiveTab('search')}
                    className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Search className="w-5 h-5 mr-2" />
                    Search Furniture
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Content Area */}
                {viewMode === 'preview' ? (
                  // Fullscreen Preview Mode
                  <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
                    <div className="relative w-full h-full flex items-center justify-center">
                      {/* Preview Controls */}
                      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
                        <div className="flex items-center space-x-4 bg-black/50 backdrop-blur-sm rounded-lg p-3">
                          <button
                            onClick={prevSlide}
                            disabled={currentSlide === 0}
                            className="p-2 bg-gray-600 text-white rounded hover:bg-gray-500 disabled:opacity-50"
                          >
                            <SkipBack className="w-5 h-5" />
                          </button>
                          
                          <button
                            onClick={isPlaying ? stopSlideshow : startSlideshow}
                            className="p-2 btn-gradient rounded"
                          >
                            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                          </button>
                          
                          <button
                            onClick={nextSlide}
                            disabled={currentSlide === slides.length - 1}
                            className="p-2 bg-gray-600 text-white rounded hover:bg-gray-500 disabled:opacity-50"
                          >
                            <SkipForward className="w-5 h-5" />
                          </button>
                          
                          <select
                            value={slideInterval}
                            onChange={(e) => setSlideInterval(Number(e.target.value))}
                            className="px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded"
                          >
                            <option value={1000}>1s</option>
                            <option value={2000}>2s</option>
                            <option value={3000}>3s</option>
                            <option value={5000}>5s</option>
                          </select>
                          
                          <span className="text-white text-sm">
                            {currentSlide + 1} / {slides.length}
                          </span>
                        </div>
                      </div>
                      
                      {/* Exit Preview Button */}
                      <button
                        onClick={() => {
                          setViewMode('slideshow');
                          setIsPreviewMode(false);
                          setIsPlaying(false);
                        }}
                        className="absolute top-4 right-4 z-10 p-2 bg-red-600 text-white rounded-full hover:bg-red-700"
                        title="Exit Preview"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      
                      {/* Slide Content */}
                      <div className="w-full h-full flex items-center justify-center p-8">
                        <div 
                          className="relative bg-gray-900 rounded-lg shadow-2xl"
                          style={{ aspectRatio: '16/9', width: '90vw', maxWidth: '1200px', height: 'auto' }}
                        >
                          {currentSlideData?.layers.map((layer) => {
                            const image = images.find(img => img.id === layer.imageId);
                            if (!image) return null;
                            
                            return (
                              <div
                                key={layer.id}
                                className="absolute"
                                style={{
                                  left: `${layer.position.x}%`,
                                  top: `${layer.position.y}%`,
                                  width: `${(layer.size.width / 1200) * 100}%`,
                                  height: `${(layer.size.height / 675) * 100}%`,
                                  transform: `rotate(${layer.rotation}deg)`,
                                  opacity: layer.opacity,
                                  zIndex: layer.zIndex,
                                }}
                              >
                                <img
                                  src={image.useProcessed && image.processed ? image.processed : image.original}
                                  alt={image.name}
                                  className="w-full h-full object-cover rounded"
                                />
                              </div>
                            );
                          })}
                          
                          {(!currentSlideData?.layers || currentSlideData.layers.length === 0) && (
                            <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                              <div className="text-center">
                                <Layers className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                <p className="text-xl">Empty Slide</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : viewMode === 'slideshow' ? (
                  <div className="flex space-x-6">
                    {/* Left Panel - Slide Management & Image Library */}
                    <div className="w-80 space-y-4">
                      {/* Slide Management */}
                      <div className="card-dark rounded-lg shadow-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-lg font-semibold text-white">Slides</h3>
                          <div className="flex space-x-1">
                            <button
                              onClick={addSlide}
                              className="p-2 btn-gradient rounded text-xs"
                              title="Add new slide"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            {slides.length > 1 && (
                              <button
                                onClick={() => deleteSlide(currentSlide)}
                                className="p-2 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                                title="Delete current slide"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {slides.map((slide, slideIndex) => (
                            <div
                              key={slide.id}
                              className={`relative p-3 rounded cursor-pointer transition-all ${
                                slideIndex === currentSlide 
                                  ? 'bg-purple-600/20 border border-purple-500' 
                                  : 'bg-gray-600 hover:bg-gray-500'
                              }`}
                              onClick={() => setCurrentSlide(slideIndex)}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-white text-sm">Slide {slideIndex + 1}</span>
                                <span className="text-xs text-gray-400">{slide.layers.length} layers</span>
                              </div>
                              
                              {/* Slide Preview */}
                              <div className="mt-2 h-20 bg-gray-700 rounded relative overflow-hidden">
                                {slide.layers.map((layer, index) => {
                                  const image = images.find(img => img.id === layer.imageId);
                                  if (!image) return null;
                                  
                                  return (
                                    <div
                                      key={layer.id}
                                      className="absolute"
                                      style={{
                                        left: `${layer.position.x * 0.8}%`,
                                        top: `${layer.position.y * 0.8}%`,
                                        width: `${layer.size.width * 0.3}px`,
                                        height: `${layer.size.height * 0.3}px`,
                                        transform: `rotate(${layer.rotation}deg)`,
                                        opacity: layer.opacity,
                                        zIndex: layer.zIndex,
                                      }}
                                    >
                                      <img
                                        src={image.useProcessed && image.processed ? image.processed : image.original}
                                        alt={image.name}
                                        className="w-full h-full object-cover rounded"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Layer Management for Current Slide */}
                      <div className="card-dark rounded-lg shadow-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-lg font-semibold text-white">Layers</h3>
                          <span className="text-xs text-gray-400">Slide {currentSlide + 1}</span>
                        </div>
                        
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {currentSlideData?.layers
                            .sort((a, b) => b.zIndex - a.zIndex)
                            .map((layer, index) => {
                              const image = images.find(img => img.id === layer.imageId);
                              if (!image) return null;
                              
                              return (
                                <div
                                  key={layer.id}
                                  className={`p-2 rounded cursor-pointer transition-all ${
                                    selectedLayer === layer.id 
                                      ? 'bg-purple-600/20 border border-purple-500' 
                                      : 'bg-gray-600 hover:bg-gray-500'
                                  }`}
                                  onClick={() => setSelectedLayer(layer.id)}
                                >
                                  <div className="flex items-center space-x-2">
                                    <img
                                      src={image.useProcessed && image.processed ? image.processed : image.original}
                                      alt={image.name}
                                      className="w-8 h-8 object-cover rounded"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-white text-sm truncate">{image.name}</p>
                                      <p className="text-xs text-gray-400">Layer {currentSlideData.layers.length - layer.zIndex}</p>
                                    </div>
                                    <div className="flex flex-col space-y-1">                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          moveLayerUp(currentSlide, layer.id);
                                        }}
                                        disabled={currentSlideData.layers.findIndex(l => l.id === layer.id) === currentSlideData.layers.length - 1}
                                        className="p-1 bg-gray-700 text-white rounded text-xs hover:bg-gray-600 disabled:opacity-50"
                                        title="Move layer up"
                                      >
                                        <ChevronUp className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          moveLayerDown(currentSlide, layer.id);
                                        }}
                                        disabled={currentSlideData.layers.findIndex(l => l.id === layer.id) === 0}
                                        className="p-1 bg-gray-700 text-white rounded text-xs hover:bg-gray-600 disabled:opacity-50"
                                        title="Move layer down"
                                      >
                                        <ChevronDown className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          {(!currentSlideData?.layers || currentSlideData.layers.length === 0) && (
                            <div className="text-center text-gray-400 text-sm py-4">
                              <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
                              <p>No layers on this slide</p>
                              <p className="text-xs mt-1">Drag images here to add them</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Image Library */}
                      <div className="card-dark rounded-lg shadow-lg p-4">
                        <h3 className="text-lg font-semibold text-white mb-3">Image Library</h3>
                        {images.length === 0 ? (
                          <div className="text-center py-8 border-2 border-dashed border-gray-600 rounded-lg">
                            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                            <p className="text-gray-400 text-sm">No images uploaded yet</p>
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              className="mt-2 px-3 py-1 text-xs btn-gradient rounded"
                            >
                              Upload Images
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                            {images.map((image) => (
                              <div
                                key={image.id}
                                className="relative group cursor-pointer"
                                draggable
                                onDragStart={(e) => handleDragStart(e, image)}
                              >
                                <img
                                  src={image.useProcessed && image.processed ? image.processed : image.original}
                                  alt={image.name}
                                  className="w-full h-20 object-cover rounded hover:opacity-80 transition-opacity bg-gray-700"
                                  onError={(e) => {
                                    console.error('Failed to load image:', image.name, image.original?.substring(0, 50));
                                    e.currentTarget.style.backgroundColor = '#374151';
                                  }}
                                  onLoad={() => {
                                    console.log('Successfully loaded image:', image.name);
                                  }}
                                />
                                <button
                                  onClick={() => addImageToSlide(image, currentSlide)}
                                  className="absolute top-1 right-1 p-1 bg-purple-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Add to current slide"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Center - Composition Canvas */}
                    <div className="flex-1">
                      <div className="card-dark rounded-lg shadow-lg p-4">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-white">Slide {currentSlide + 1}</h3>
                          <div className="flex items-center space-x-2">
                            {/* Slideshow Controls */}
                            <button
                              onClick={prevSlide}
                              disabled={currentSlide === 0}
                              className="p-2 bg-gray-600 text-white rounded hover:bg-gray-500 disabled:opacity-50"
                              title="Previous slide"
                            >
                              <SkipBack className="w-4 h-4" />
                            </button>
                            <button
                              onClick={isPlaying ? stopSlideshow : startSlideshow}
                              className="p-2 btn-gradient rounded"
                              title={isPlaying ? "Stop slideshow" : "Play slideshow"}
                            >
                              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={nextSlide}
                              disabled={currentSlide === slides.length - 1}
                              className="p-2 bg-gray-600 text-white rounded hover:bg-gray-500 disabled:opacity-50"
                              title="Next slide"
                            >
                              <SkipForward className="w-4 h-4" />
                            </button>
                            <select
                              value={slideInterval}
                              onChange={(e) => setSlideInterval(Number(e.target.value))}
                              className="ml-2 px-2 py-1 text-sm bg-gray-700 text-white border border-gray-600 rounded"
                              title="Slideshow speed"
                            >
                              <option value={1000}>1s</option>
                              <option value={2000}>2s</option>
                              <option value={3000}>3s</option>
                              <option value={5000}>5s</option>
                            </select>
                          </div>
                        </div>

                        {/* Canvas Area */}
                        <div 
                          ref={compositionCanvasRef}
                          className="relative w-full h-96 border-2 border-dashed border-gray-600 rounded-lg overflow-hidden"
                          style={{ 
                            aspectRatio: '16/9',
                            backgroundColor: currentSlideData?.backgroundColor || '#1f2937'
                          }}
                          onDrop={handleDrop}
                          onDragOver={handleDragOver}
                        >
                          {currentSlideData?.layers.map((layer) => {
                            if (layer.type === 'image') {
                              const image = images.find(img => img.id === layer.imageId);
                              if (!image) return null;
                              
                              return (
                                <div
                                  key={layer.id}
                                  className={`absolute cursor-move select-none ${
                                    selectedLayer === layer.id ? 'ring-2 ring-purple-500' : ''
                                  }`}
                                  style={{
                                    left: `${layer.position.x}%`,
                                    top: `${layer.position.y}%`,
                                    width: `${layer.size.width}px`,
                                    height: `${layer.size.height}px`,
                                    transform: `rotate(${layer.rotation}deg)`,
                                    opacity: layer.opacity,
                                    zIndex: layer.zIndex,
                                  }}
                                  onMouseDown={(e) => handleLayerMouseDown(e, layer.id)}
                                  onClick={() => setSelectedLayer(layer.id)}
                                >
                                  <img
                                    src={image.useProcessed && image.processed ? image.processed : image.original}
                                    alt={image.name}
                                    className="w-full h-full object-cover rounded"
                                    draggable={false}
                                  />
                                  
                                  {/* Resize handles */}
                                  {selectedLayer === layer.id && (
                                    <>
                                      <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-purple-500 rounded-full cursor-se-resize"
                                           onMouseDown={(e) => handleResizeStart(e, layer.id, 'se')}></div>
                                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full cursor-ne-resize"
                                           onMouseDown={(e) => handleResizeStart(e, layer.id, 'ne')}></div>
                                      <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-purple-500 rounded-full cursor-sw-resize"
                                           onMouseDown={(e) => handleResizeStart(e, layer.id, 'sw')}></div>
                                      <div className="absolute -top-1 -left-1 w-3 h-3 bg-purple-500 rounded-full cursor-nw-resize"
                                           onMouseDown={(e) => handleResizeStart(e, layer.id, 'nw')}></div>
                                    </>
                                  )}
                                </div>
                              );
                            } else if (layer.type === 'text') {
                              return (
                                <div
                                  key={layer.id}
                                  className={`absolute cursor-move select-none ${
                                    selectedLayer === layer.id ? 'ring-2 ring-purple-500' : ''
                                  }`}
                                  style={{
                                    left: `${layer.position.x}%`,
                                    top: `${layer.position.y}%`,
                                    width: `${layer.size.width}px`,
                                    height: `${layer.size.height}px`,
                                    transform: `rotate(${layer.rotation}deg)`,
                                    opacity: layer.opacity,
                                    zIndex: layer.zIndex,
                                  }}
                                  onMouseDown={(e) => handleLayerMouseDown(e, layer.id)}
                                  onClick={() => setSelectedLayer(layer.id)}
                                >
                                  <div
                                    className="w-full h-full flex items-center justify-start p-2"
                                    style={{
                                      fontSize: `${layer.fontSize}px`,
                                      color: layer.fontColor,
                                      fontFamily: layer.fontFamily,
                                      textAlign: layer.textAlign,
                                    }}
                                    contentEditable={selectedLayer === layer.id}
                                    suppressContentEditableWarning={true}
                                    onBlur={(e) => {
                                      const newText = e.currentTarget.textContent || '';
                                      updateLayerProperty(currentSlide, layer.id, 'text', newText);
                                    }}
                                  >
                                    {layer.text}
                                  </div>
                                  
                                  {/* Resize handles */}
                                  {selectedLayer === layer.id && (
                                    <>
                                      <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-purple-500 rounded-full cursor-se-resize"
                                           onMouseDown={(e) => handleResizeStart(e, layer.id, 'se')}></div>
                                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full cursor-ne-resize"
                                           onMouseDown={(e) => handleResizeStart(e, layer.id, 'ne')}></div>
                                      <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-purple-500 rounded-full cursor-sw-resize"
                                           onMouseDown={(e) => handleResizeStart(e, layer.id, 'sw')}></div>
                                      <div className="absolute -top-1 -left-1 w-3 h-3 bg-purple-500 rounded-full cursor-nw-resize"
                                           onMouseDown={(e) => handleResizeStart(e, layer.id, 'nw')}></div>
                                    </>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          })}
                                
                                {/* Delete button */}
                                {selectedLayer === layer.id && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeLayerFromSlide(currentSlide, layer.id);
                                      setSelectedLayer(null);
                                    }}
                                    className="absolute -top-2 -right-2 p-1 bg-red-600 text-white rounded-full text-xs hover:bg-red-700"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            );
                            }
                            return null;
                          })}
                          
                          {(!currentSlideData?.layers || currentSlideData.layers.length === 0) && (
                            <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                              <div className="text-center">
                                <Layers className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                <p className="text-lg">Drop images here</p>
                                <p className="text-sm">or drag from the Image Library</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Panel - Layer Properties */}
                    <div className="w-64">
                      <div className="card-dark rounded-lg shadow-lg p-4">
                        <h3 className="text-lg font-semibold text-white mb-3">Properties</h3>
                        
                        {selectedLayer ? (() => {
                          const layer = currentSlideData?.layers.find(l => l.id === selectedLayer);
                          const image = layer ? images.find(img => img.id === layer.imageId) : null;
                          
                          if (!layer || !image) return null;
                          
                          return (
                            <div className="space-y-4">
                              <div>
                                <img
                                  src={image.useProcessed && image.processed ? image.processed : image.original}
                                  alt={image.name}
                                  className="w-full h-20 object-cover rounded mb-2"
                                />
                                <p className="text-white text-sm font-medium truncate">{image.name}</p>
                              </div>
                              
                              {/* Position Controls */}
                              <div className="space-y-2">
                                <label className="text-xs text-gray-400">Position</label>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-xs text-gray-500">X</label>
                                    <input
                                      type="range"
                                      min="0"
                                      max="100"
                                      value={layer.position.x}
                                      onChange={(e) => updateLayerProperty(currentSlide, layer.id, 'position', {
                                        ...layer.position,
                                        x: parseFloat(e.target.value)
                                      })}
                                      className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                    />
                                    <span className="text-xs text-gray-400">{layer.position.x.toFixed(1)}%</span>
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-500">Y</label>
                                    <input
                                      type="range"
                                      min="0"
                                      max="100"
                                      value={layer.position.y}
                                      onChange={(e) => updateLayerProperty(currentSlide, layer.id, 'position', {
                                        ...layer.position,
                                        y: parseFloat(e.target.value)
                                      })}
                                      className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                    />
                                    <span className="text-xs text-gray-400">{layer.position.y.toFixed(1)}%</span>
                                  </div>
                                </div>
                              </div>
                              
                              {/* Size Controls */}
                              <div className="space-y-2">
                                <label className="text-xs text-gray-400">Size</label>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-xs text-gray-500">Width</label>
                                    <input
                                      type="range"
                                      min="50"
                                      max="500"
                                      value={layer.size.width}
                                      onChange={(e) => updateLayerProperty(currentSlide, layer.id, 'size', {
                                        ...layer.size,
                                        width: parseInt(e.target.value)
                                      })}
                                      className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                    />
                                    <span className="text-xs text-gray-400">{layer.size.width}px</span>
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-500">Height</label>
                                    <input
                                      type="range"
                                      min="50"
                                      max="500"
                                      value={layer.size.height}
                                      onChange={(e) => updateLayerProperty(currentSlide, layer.id, 'size', {
                                        ...layer.size,
                                        height: parseInt(e.target.value)
                                      })}
                                      className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                    />
                                    <span className="text-xs text-gray-400">{layer.size.height}px</span>
                                  </div>
                                </div>
                              </div>
                              
                              {/* Rotation Control */}
                              <div>
                                <label className="text-xs text-gray-400">Rotation</label>
                                <input
                                  type="range"
                                  min="-180"
                                  max="180"
                                  value={layer.rotation}
                                  onChange={(e) => updateLayerProperty(currentSlide, selectedLayer, 'rotation', parseFloat(e.target.value))}
                                  className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                />
                                <span className="text-xs text-gray-400">{layer.rotation}°</span>
                              </div>
                              
                              {/* Opacity Control */}
                              <div>
                                <label className="text-xs text-gray-400">Opacity</label>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.1"
                                  value={layer.opacity}
                                  onChange={(e) => updateLayerProperty(currentSlide, selectedLayer, 'opacity', parseFloat(e.target.value))}
                                  className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                />
                                <span className="text-xs text-gray-400">{Math.round(layer.opacity * 100)}%</span>
                              </div>
                              
                              {/* Layer Actions */}
                              <div className="flex space-x-2 pt-2">
                                <button
                                  onClick={() => moveLayerUp(currentSlide, layer.id)}
                                  disabled={currentSlideData?.layers.findIndex(l => l.id === layer.id) === 0}
                                  className="flex-1 p-2 bg-gray-600 text-white rounded text-xs hover:bg-gray-500 disabled:opacity-50"
                                >
                                  <ChevronUp className="w-4 h-4 mx-auto" />
                                </button>
                                <button
                                  onClick={() => moveLayerDown(currentSlide, layer.id)}
                                  disabled={currentSlideData?.layers.findIndex(l => l.id === layer.id) === (currentSlideData?.layers.length || 0) - 1}
                                  className="flex-1 p-2 bg-gray-600 text-white rounded text-xs hover:bg-gray-500 disabled:opacity-50"
                                >
                                  <ChevronDown className="w-4 h-4 mx-auto" />
                                </button>
                                <button
                                  onClick={() => {
                                    removeLayerFromSlide(currentSlide, layer.id);
                                    setSelectedLayer(null);
                                  }}
                                  className="flex-1 p-2 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                                >
                                  <Trash2 className="w-4 h-4 mx-auto" />
                                </button>
                              </div>
                            </div>
                          );
                        })() : (
                          <div className="text-center text-gray-400 text-sm py-8">
                            <Layers className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p>Select a layer to edit properties</p>
                            <p className="text-xs mt-1">Click on a layer in the canvas or layer list</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {images.map((image, index) => (
                      <div
                        key={image.id}
                        className={`relative card-dark rounded-lg shadow-lg border-2 transition-all ${
                          selectedImages.has(image.id) 
                            ? 'gradient-border ring-2 ring-purple-400/20' 
                            : 'hover:border-gray-500'
                        }`}
                      >
                        <div className="aspect-square p-2">
                          <img
                            src={image.useProcessed && image.processed ? image.processed : image.original}
                            alt={image.name}
                            className="w-full h-full object-contain rounded cursor-pointer"
                            onClick={() => toggleImageSelection(image.id)}
                          />
                        </div>
                        
                        <div className="absolute top-2 right-2 flex space-x-1">
                          {processingImages.has(image.id) && (
                            <div className="p-1 bg-yellow-500 text-white rounded text-xs animate-pulse">
                              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                          
                          {image.processed && (
                            <button
                              onClick={() => toggleBackgroundRemoval(image.id)}
                              className={`p-1 rounded text-xs ${
                                image.useProcessed 
                                  ? 'bg-green-600 text-white' 
                                  : 'bg-gray-600 text-white'
                              }`}
                              title={image.useProcessed ? 'Using processed version' : 'Using original'}
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                          
                          <button
                            onClick={() => manualBackgroundRemoval(image.id, backgroundRemovalAlgorithm)}
                            disabled={processingImages.has(image.id)}
                            className="p-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded text-xs hover:from-purple-700 hover:to-blue-700 disabled:opacity-50"
                            title={`Remove background (${backgroundRemovalAlgorithm === 'ai' ? 'AI' : 'Client-side'})`}
                          >
                            <Filter className="w-3 h-3" />
                          </button>
                          
                          <button
                            onClick={() => deleteImage(image.id)}
                            className="p-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                            title="Delete image"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        
                        <div className="p-2 border-t border-gray-600">
                          <p className="text-xs text-gray-300 truncate" title={image.name}>
                            {image.name}
                          </p>
                          {image.searchMetadata && (
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-xs font-medium text-green-400">{image.searchMetadata.price}</span>
                              <span className="text-xs text-gray-400">{image.searchMetadata.site}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="card-dark rounded-lg shadow-lg p-8">
                    <div className="flex justify-center">
                      {currentImage && (
                        <div className="max-w-4xl max-h-96 flex items-center justify-center">
                          <img
                            src={currentImage.useProcessed && currentImage.processed ? currentImage.processed : currentImage.original}
                            alt={currentImage.name}
                            className="max-w-full max-h-full object-contain rounded-lg"
                          />
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-4 text-center">
                      <h3 className="text-lg font-medium text-white">{currentImage?.name}</h3>
                      {currentImage?.searchMetadata && (
                        <div className="flex justify-center items-center space-x-4 mt-2">
                          <span className="text-lg font-bold text-green-400">{currentImage.searchMetadata.price}</span>
                          <span className="text-sm text-gray-300">from {currentImage.searchMetadata.site}</span>
                          <div className="flex items-center text-sm text-gray-300">
                            <span className="text-yellow-400 mr-1">★</span>
                            {currentImage.searchMetadata.rating}
                          </div>
                        </div>
                      )}
                      <div className="flex justify-center mt-2">
                        {currentImage?.processed && (
                          <button
                            onClick={() => toggleBackgroundRemoval(currentImage.id)}
                            className={`btn-gradient-outline ${
                              currentImage.useProcessed 
                                ? 'text-green-400' 
                                : ''
                            }`}
                          >
                            {currentImage.useProcessed ? 'Background Removed' : 'Original'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* Hidden canvas for export */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default MoodBoardApp;