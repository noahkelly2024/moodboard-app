'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Play, Pause, SkipBack, SkipForward, Trash2, RotateCcw, Grid, Search, ExternalLink, Plus, Filter, X, Heart, ChevronUp, ChevronDown, Layers, RotateCw, Type, AlignLeft, AlignCenter, AlignRight, FileText, Save, FolderOpen, FolderPlus } from 'lucide-react';
import { ImageType, SearchResult, SearchFilters, Slide, Layer, Project, ProjectData } from '@/types';

const MoodBoardApp = () => {
  const [images, setImages] = useState<ImageType[]>([]);
  const [slides, setSlides] = useState<Slide[]>([{ id: 1, layers: [], backgroundColor: '#1f2937' }]);
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const [selectedLayer, setSelectedLayer] = useState<string | number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [slideInterval, setSlideInterval] = useState<number>(3000);
  const [viewMode, setViewMode] = useState<'grid' | 'slideshow' | 'preview'>('grid');
  const [compositionMode, setCompositionMode] = useState<boolean>(false);
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
  const [sitesSearched, setSitesSearched] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [draggedImage, setDraggedImage] = useState<ImageType | null>(null);
  const [isDraggingLayer, setIsDraggingLayer] = useState<string | number | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [processingImages, setProcessingImages] = useState<Set<string | number>>(new Set());
  // Enforce AI-only (rembg)
  const [rembgModel, setRembgModel] = useState<string>('u2net');
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [aiModelLoading, setAiModelLoading] = useState<boolean>(false);
  const [aiAvailable, setAiAvailable] = useState<boolean>(false);
  // NEW: Constructor.io admin state
  const [showAdmin, setShowAdmin] = useState<boolean>(false);
  const [keyStatus, setKeyStatus] = useState<{ loading: boolean; data: Record<string, unknown> | null; error: string | null }>({ loading: false, data: null, error: null });
  const [isRefreshingKeys, setIsRefreshingKeys] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Project management state
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showProjectModal, setShowProjectModal] = useState<boolean>(false);
  const [projectModalMode, setProjectModalMode] = useState<'create' | 'save' | 'load'>('create');
  const [projectName, setProjectName] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(true);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // removed unused canvasRef
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const compositionCanvasRef = useRef<HTMLDivElement>(null);
  const dragRafRef = useRef<number | null>(null);

  // Helper: backend URL fallbacks (allow localhost or 127.0.0.1)
  const getBackendBases = React.useCallback(() => ['http://127.0.0.1:5000', 'http://localhost:5000'], []);

  // NEW: Health check for Python backend (rembg) with fallback URLs
  React.useEffect(() => {
    let ignore = false;
    const check = async () => {
      for (const base of getBackendBases()) {
        try {
          const res = await fetch(`${base}/health`, { cache: 'no-store' });
          if (res.ok) {
            if (!ignore) setAiAvailable(true);
            return;
          }
        } catch (e) {
          // try next base
        }
      }
      if (!ignore) setAiAvailable(false);
    };
    check();
    const id = setInterval(check, 3000);
    return () => { ignore = true; clearInterval(id); };
  }, [getBackendBases]);

  // NEW: Admin helpers for Constructor.io keys
  const fetchConstructorKeyStatus = useCallback(async () => {
    setKeyStatus(s => ({ ...s, loading: true, error: null }));
    for (const base of getBackendBases()) {
      try {
        const res = await fetch(`${base}/constructor-keys/status`, { cache: 'no-store' });
        if (!res.ok) continue;
        const json = await res.json();
        if (json.success) {
          setKeyStatus({ loading: false, data: json.status, error: null });
          return;
        } else {
          setKeyStatus({ loading: false, data: null, error: json.error || 'Failed to load status' });
          return;
        }
      } catch (e) {
        // try next base
      }
    }
    setKeyStatus({ loading: false, data: null, error: 'Backend unavailable' });
  }, [getBackendBases]);

  const refreshConstructorKeys = useCallback(async () => {
    setIsRefreshingKeys(true);
    for (const base of getBackendBases()) {
      try {
        const res = await fetch(`${base}/constructor-keys/refresh`, { method: 'POST' });
        if (!res.ok) continue;
        const json = await res.json();
        if (json.success) {
          setIsRefreshingKeys(false);
          // Prefer status if present; also keep missing_sites from refresh payload
          const data = json.status ? { ...json.status, missing_sites: json.missing_sites } : (json.keys || null);
          setKeyStatus({ loading: false, data, error: null });
          return;
        } else {
          setIsRefreshingKeys(false);
          setKeyStatus(s => ({ ...s, error: json.error || 'Refresh failed' }));
          return;
        }
      } catch (e) {
        // try next base
      }
    }
    setIsRefreshingKeys(false);
    setKeyStatus(s => ({ ...s, error: 'Backend unavailable' }));
  }, [getBackendBases]);

  React.useEffect(() => {
    if (activeTab === 'search' && showAdmin) {
      fetchConstructorKeyStatus();
    }
  }, [activeTab, showAdmin, fetchConstructorKeyStatus]);

  // Real furniture search API - aggregates results from multiple sites
  const searchFurniture = useCallback(async (query: string, filters: SearchFilters) => {
    setIsSearching(true);
    try {
      const payload = { query, filters };
      const bases = getBackendBases();
      
      for (const base of bases) {
        try {
          const response = await fetch(`${base}/search-furniture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          if (!response.ok) continue;
          
          const result = await response.json();
          if (result.success && result.results) {
            console.log(`Search successful: ${result.results.length} results from ${result.sites_searched?.join(', ')}`);
            setSearchResults(result.results);
            setSitesSearched(result.sites_searched || []);
            setIsSearching(false);
            return;
          }
        } catch (error) {
          console.log(`Search failed for ${base}:`, error);
          continue;
        }
      }
      
      // Fallback to mock data if backend is unavailable
      console.log('Backend unavailable, using fallback results');
      const mockResults = [
        { id: 'fallback-wayfair-1', title: `${query} Modern Accent Chair`, price: '$299.99', originalPrice: '$399.99', site: 'Wayfair', image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=300&h=300&fit=crop&crop=center', url: 'https://www.wayfair.com', category: 'seating', style: 'modern', inStock: true },
        { id: 'fallback-potterybarn-1', title: `${query} Scandinavian Table`, price: '$199.00', originalPrice: null, site: 'Pottery Barn', image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=300&h=300&fit=crop&crop=center', url: 'https://www.potterybarn.com', category: 'tables', style: 'scandinavian', inStock: true },
        { id: 'fallback-wayfair-2', title: `${query} Mid-Century Lamp`, price: '$179.00', originalPrice: '$229.00', site: 'Wayfair', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=300&fit=crop&crop=center', url: 'https://www.wayfair.com', category: 'lighting', style: 'mid-century', inStock: true },
        { id: 'fallback-raymourflanigan-1', title: `${query} Cozy Fabric Sofa`, price: '$899.00', originalPrice: null, site: 'Raymour & Flanigan', image: 'https://images.unsplash.com/photo-1549187774-b4e9b0445b41?w=300&h=300&fit=crop&crop=center', url: 'https://www.raymourflanigan.com', category: 'seating', style: 'contemporary', inStock: true }
      ];
      let filteredResults = mockResults.filter(item => item.title.toLowerCase().includes(query.toLowerCase()) || item.category.includes(query.toLowerCase()) || item.style.includes(query.toLowerCase()));
      if (filters.category !== 'all') filteredResults = filteredResults.filter(item => item.category === filters.category);
      if (filters.style !== 'all') filteredResults = filteredResults.filter(item => item.style === filters.style);
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
      setSitesSearched(['Wayfair', 'Pottery Barn', 'Raymour & Flanigan']);
      setSearchResults(filteredResults);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
      setSitesSearched([]);
    } finally {
      setIsSearching(false);
    }
  }, [getBackendBases]);

  // Helper to call backend for background removal using either data URL or remote image URL
  const removeBackgroundWithRembgAPI = useCallback(async (src: string, model: string = 'u2net'): Promise<string | null> => {
    try {
      const isDataUrl = src.startsWith('data:');
      const payload = isDataUrl ? { image: src, model } : { imageUrl: src, model } as any;
      const bases = getBackendBases();
      for (const base of bases) {
        try {
          const response = await fetch(`${base}/remove-background`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          if (!response.ok) continue;
          const result = await response.json();
          if (result.success && result.image) return result.image;
        } catch {}
      }
      return null;
    } catch { return null; }
  }, [getBackendBases]);

  const addSearchResultToMoodBoard = useCallback(async (searchResult: SearchResult) => {
    try {
      const newImage = { id: Date.now() + Math.random(), original: searchResult.image, processed: null, name: searchResult.title, useProcessed: false, searchMetadata: { price: searchResult.price, site: searchResult.site, url: searchResult.url } };
      setImages(prev => [...prev, newImage]); setActiveTab('moodboard');
    } catch { alert('Failed to add item to mood board. Please try again.'); }
  }, []);

  const addImageToSlide = useCallback((image: ImageType, slideIndex: number = currentSlide) => {
    const layer: Layer = { id: Date.now() + Math.random(), type: 'image', imageId: image.id, position: { x: 50 + Math.random() * 30 - 15, y: 50 + Math.random() * 30 - 15 }, size: { width: 200, height: 200 }, rotation: 0, opacity: 1, zIndex: slides[slideIndex]?.layers.length || 0 };
    setSlides(prev => prev.map((slide, index) => index === slideIndex ? { ...slide, layers: [...slide.layers, layer] } : slide));
  }, [currentSlide, slides]);

  const addTextLayer = useCallback((slideIndex: number = currentSlide) => {
    const layer: Layer = { id: Date.now() + Math.random(), type: 'text', position: { x: 50, y: 50 }, size: { width: 300, height: 120 }, rotation: 0, opacity: 1, zIndex: slides[slideIndex]?.layers.length || 0, text: 'New Text', fontSize: 32, fontColor: '#ffffff', fontFamily: 'Inter, sans-serif', textAlign: 'center' };
    setSlides(prev => prev.map((slide, idx) => idx === slideIndex ? { ...slide, layers: [...slide.layers, layer] } : slide)); setSelectedLayer(layer.id);
  }, [currentSlide, slides]);

  const moveLayerUp = useCallback((slideIndex: number, layerId: string | number) => {
    setSlides(prev => prev.map((slide, idx) => { if (idx !== slideIndex) return slide; const layers = [...slide.layers]; layers.sort((a,b)=>a.zIndex - b.zIndex); const pos = layers.findIndex(l=>l.id===layerId); if (pos === -1 || pos === layers.length -1) return slide; [layers[pos], layers[pos+1]] = [layers[pos+1], layers[pos]]; layers.forEach((l,i)=>{ l.zIndex = i; }); return { ...slide, layers }; }));
  }, []);

  const moveLayerDown = useCallback((slideIndex: number, layerId: string | number) => {
    setSlides(prev => prev.map((slide, idx) => { if (idx !== slideIndex) return slide; const layers = [...slide.layers]; layers.sort((a,b)=>a.zIndex - b.zIndex); const pos = layers.findIndex(l=>l.id===layerId); if (pos <= 0) return slide; [layers[pos], layers[pos-1]] = [layers[pos-1], layers[pos]]; layers.forEach((l,i)=>{ l.zIndex = i; }); return { ...slide, layers }; }));
  }, []);

  const removeLayerFromSlide = useCallback((slideIndex: number, layerId: string | number) => {
    setSlides(prev => prev.map((slide, index) => { if (index !== slideIndex) return slide; const filtered = slide.layers.filter(l => l.id !== layerId); filtered.sort((a,b)=>a.zIndex - b.zIndex).forEach((l,i)=> { l.zIndex = i; }); return { ...slide, layers: filtered }; }));
  }, []);

  const updateLayerProperty = useCallback((slideIndex: number, layerId: string | number, property: keyof Layer, value: any) => {
    setSlides(prev => prev.map((slide, index) => index === slideIndex ? { ...slide, layers: slide.layers.map(layer => layer.id === layerId ? { ...layer, [property]: value } : layer) } : slide));
  }, []);

  const addSlide = useCallback(() => { const newSlide: Slide = { id: Date.now() + Math.random(), layers: [], backgroundColor: slides[slides.length - 1]?.backgroundColor || '#1f2937' }; setSlides(prev => [...prev, newSlide]); }, [slides]);
  const deleteSlide = useCallback((slideIndex: number) => { if (slides.length <= 1) return; setSlides(prev => prev.filter((_, index) => index !== slideIndex)); if (currentSlide >= slideIndex && currentSlide > 0) setCurrentSlide(currentSlide - 1); }, [slides.length, currentSlide]);

  const currentSlideData = slides[currentSlide]; const currentImage = images[currentSlide];

  const [isResizing, setIsResizing] = useState<{ layerId: string | number; direction: string } | null>(null);
  const [resizeStart, setResizeStart] = useState<{ width: number; height: number; mouseX: number; mouseY: number }>({ width: 0, height: 0, mouseX: 0, mouseY: 0 });

  const handleResizeStart = useCallback((e: React.MouseEvent, layerId: string | number, direction: string) => { e.preventDefault(); e.stopPropagation(); const layer = currentSlideData?.layers.find(l => l.id === layerId); if (!layer) return; setIsResizing({ layerId, direction }); setResizeStart({ width: layer.size.width, height: layer.size.height, mouseX: e.clientX, mouseY: e.clientY }); }, [currentSlideData]);
  const handleResizeMove = useCallback((e: MouseEvent) => { if (!isResizing || !currentSlideData) return; const deltaX = e.clientX - resizeStart.mouseX; const deltaY = e.clientY - resizeStart.mouseY; let newWidth = resizeStart.width; let newHeight = resizeStart.height; switch (isResizing.direction) { case 'se': newWidth = Math.max(50, resizeStart.width + deltaX); newHeight = Math.max(50, resizeStart.height + deltaY); break; case 'ne': newWidth = Math.max(50, resizeStart.width + deltaX); newHeight = Math.max(50, resizeStart.height - deltaY); break; case 'sw': newWidth = Math.max(50, resizeStart.width - deltaX); newHeight = Math.max(50, resizeStart.height + deltaY); break; case 'nw': newWidth = Math.max(50, resizeStart.width - deltaX); newHeight = Math.max(50, resizeStart.height - deltaY); break; } if (e.shiftKey) { const aspectRatio = resizeStart.width / resizeStart.height; if (Math.abs(deltaX) > Math.abs(deltaY)) newHeight = newWidth / aspectRatio; else newWidth = newHeight * aspectRatio; } updateLayerProperty(currentSlide, isResizing.layerId, 'size', { width: Math.min(2400, Math.max(10, newWidth)), height: Math.min(2400, Math.max(10, newHeight)) }); }, [isResizing, resizeStart, currentSlide, updateLayerProperty, currentSlideData]);
  const handleResizeEnd = useCallback(() => { setIsResizing(null); setResizeStart({ width: 0, height: 0, mouseX: 0, mouseY: 0 }); }, []);
  React.useEffect(() => { if (isResizing) { document.addEventListener('mousemove', handleResizeMove); document.addEventListener('mouseup', handleResizeEnd); return () => { document.removeEventListener('mousemove', handleResizeMove); document.removeEventListener('mouseup', handleResizeEnd); }; } }, [isResizing, handleResizeMove, handleResizeEnd]);

  const handleDragStart = useCallback((e: React.DragEvent, image: ImageType) => { setDraggedImage(image); }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); if (draggedImage) { addImageToSlide(draggedImage, currentSlide); setDraggedImage(null); } }, [draggedImage, currentSlide, addImageToSlide]);

  const handleLayerMouseDown = useCallback((e: React.MouseEvent, layerId: string | number) => { e.preventDefault(); setSelectedLayer(layerId); setIsDraggingLayer(layerId); if (compositionCanvasRef.current) { const targetEl = e.currentTarget as HTMLElement; const layerRect = targetEl.getBoundingClientRect(); setDragOffset({ x: e.clientX - layerRect.left, y: e.clientY - layerRect.top }); } }, []);

  const toggleImageSelection = useCallback((imageId: string | number) => { setSelectedImages(prev => { const newSet = new Set(prev); if (newSet.has(imageId)) newSet.delete(imageId); else newSet.add(imageId); return newSet; }); }, []);
  const toggleBackgroundRemoval = useCallback((imageId: string | number) => { setImages(prev => prev.map(img => img.id === imageId ? { ...img, useProcessed: !img.useProcessed } : img)); }, []);

  const manualBackgroundRemoval = useCallback(async (imageId: string | number, _algorithm: 'ai') => {
    const image = images.find(img => img.id === imageId); if (!image) return;
    setProcessingImages(prev => new Set(prev).add(imageId));
    setAiModelLoading(true);
    try {
      const processedUrl = await removeBackgroundWithRembgAPI(image.original, rembgModel);
      if (processedUrl) {
        setImages(prev => prev.map(img => img.id === imageId ? { ...img, processed: processedUrl, useProcessed: true } : img));
      } else {
        alert('AI background removal failed.');
      }
    } catch {
      alert('Background removal failed.');
    } finally {
      setProcessingImages(prev => { const newSet = new Set(prev); newSet.delete(imageId); return newSet; });
      setAiModelLoading(false);
    }
  }, [images, removeBackgroundWithRembgAPI, rembgModel]);

  const deleteImage = useCallback((imageId: string | number) => { setImages(prev => prev.filter(img => img.id !== imageId)); setSelectedImages(prev => { const newSet = new Set(prev); newSet.delete(imageId); return newSet; }); }, []);

  const batchBackgroundRemoval = useCallback(async () => { const selectedImageArray = images.filter(img => selectedImages.has(img.id)); if (selectedImageArray.length === 0) return; setBatchProgress({ current: 0, total: selectedImageArray.length }); selectedImageArray.forEach(img => { setProcessingImages(prev => new Set(prev).add(img.id)); }); try { for (let index = 0; index < selectedImageArray.length; index++) { const image = selectedImageArray[index]; setBatchProgress({ current: index + 1, total: selectedImageArray.length }); try { const processedUrl = await removeBackgroundWithRembgAPI(image.original, rembgModel); if (processedUrl) { setImages(prev => prev.map(img => img.id === image.id ? { ...img, processed: processedUrl, useProcessed: true } : img)); } } catch {} finally { setProcessingImages(prev => { const newSet = new Set(prev); newSet.delete(image.id); return newSet; }); } } } catch {} finally { setBatchProgress(null); } }, [images, selectedImages, removeBackgroundWithRembgAPI, rembgModel]);

  // Helper function to convert image URL to base64
  const imageUrlToBase64 = useCallback(async (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        try {
          const dataURL = canvas.toDataURL('image/png');
          resolve(dataURL);
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  }, []);

  const exportMoodBoard = useCallback(async () => {
    // Check if there's content to export
    if (compositionMode && slides.length === 0) {
      alert('No slides to export. Create some slides first.');
      return;
    }
    if (!compositionMode && images.length === 0) {
      alert('No images to export. Upload some images first.');
      return;
    }
    
    setIsExporting(true);
    
    try {
      // For now, we'll export as JSON until we can resolve the pptxgenjs build issue
      const exportData = {
        metadata: {
          name: 'Mood Board Collection',
          createdAt: new Date().toISOString(),
          version: '1.0.0'
        },
        images: images.map(img => ({
          id: img.id,
          name: img.name,
          hasProcessed: !!img.processed,
          useProcessed: img.useProcessed,
          searchMetadata: img.searchMetadata
        })),
        slides: slides,
        settings: {
          currentSlide,
          viewMode,
          compositionMode,
          slideInterval,
          rembgModel
        }
      };
      
      // Create and download JSON file
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `mood-board-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      alert('Mood board exported as JSON file. PowerPoint export will be available in a future update.');
      
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [slides, images, compositionMode, currentSlide, viewMode, slideInterval, rembgModel]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files; if (!files) return;
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          if (!e.target?.result || typeof e.target.result !== 'string') return;
          const dataUrl = e.target.result as string;
          const newImage: ImageType = { id: Date.now() + Math.random(), original: dataUrl, processed: null, name: file.name, useProcessed: false };
          setImages(prev => [...prev, newImage]);
          try {
            setProcessingImages(prev => new Set(prev).add(newImage.id));
            const processedDataUrl = await removeBackgroundWithRembgAPI(dataUrl, rembgModel);
            if (processedDataUrl) {
              setImages(prev => prev.map(image => image.id === newImage.id ? { ...image, processed: processedDataUrl, useProcessed: true } : image));
            }
          } catch {}
          finally {
            setProcessingImages(prev => { const s = new Set(prev); s.delete(newImage.id); return s; });
          }
        };
        reader.readAsDataURL(file);
      }
    }
    if (event.target) event.target.value = '';
  }, [removeBackgroundWithRembgAPI, rembgModel]);

  const handleSearch = useCallback(() => { if (searchQuery.trim()) { searchFurniture(searchQuery, searchFilters); } }, [searchQuery, searchFilters, searchFurniture]);
  const clearSearch = useCallback(() => { setSearchQuery(''); setSearchResults([]); setSearchFilters({ category: 'all', priceRange: 'all', style: 'all' }); setSitesSearched([]); }, []);
  const toggleFavorite = useCallback((itemId: string) => { setFavorites(prev => { const newSet = new Set(prev); if (newSet.has(itemId)) newSet.delete(itemId); else newSet.add(itemId); return newSet; }); }, []);
  const deleteSelectedImages = useCallback(() => { const selectedIds = Array.from(selectedImages); setImages(prev => prev.filter(img => !selectedIds.includes(img.id))); setSelectedImages(new Set()); }, [selectedImages]);
  const prevSlide = useCallback(() => { if (currentSlide > 0) setCurrentSlide(currentSlide - 1); }, [currentSlide]);
  const nextSlide = useCallback(() => { if (currentSlide < slides.length - 1) setCurrentSlide(currentSlide + 1); }, [currentSlide, slides.length]);
  const startSlideshow = useCallback(() => { setIsPlaying(true); }, []); const stopSlideshow = useCallback(() => { setIsPlaying(false); }, []);

  React.useEffect(() => { if (isPlaying && viewMode === 'preview') { intervalRef.current = setInterval(() => { setCurrentSlide((prev) => { const nextSlide = prev + 1; return nextSlide >= slides.length ? 0 : nextSlide; }); }, slideInterval); return () => { if (intervalRef.current) clearInterval(intervalRef.current); }; } else { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } } }, [isPlaying, slideInterval, slides.length, viewMode]);
  React.useEffect(() => { const handleKeyDown = (e: KeyboardEvent) => { if (viewMode === 'preview') { switch (e.key) { case 'Escape': setViewMode('slideshow'); setIsPlaying(false); break; case 'ArrowLeft': e.preventDefault(); prevSlide(); break; case 'ArrowRight': e.preventDefault(); nextSlide(); break; case ' ': e.preventDefault(); isPlaying ? stopSlideshow() : startSlideshow(); break; } } }; document.addEventListener('keydown', handleKeyDown); return () => document.removeEventListener('keydown', handleKeyDown); }, [viewMode, isPlaying, prevSlide, nextSlide, startSlideshow, stopSlideshow]);

  const handleLayerMouseMove = useCallback((e: MouseEvent) => { if (!isDraggingLayer || !compositionCanvasRef.current) return; if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current); dragRafRef.current = requestAnimationFrame(() => { const rect = compositionCanvasRef.current!.getBoundingClientRect(); const layer = slides[currentSlide]?.layers.find(l => l.id === isDraggingLayer); if (!layer) return; const newLeftPx = e.clientX - rect.left - dragOffset.x; const newTopPx = e.clientY - rect.top - dragOffset.y; const xPctRaw = (newLeftPx / rect.width) * 100; const yPctRaw = (newTopPx / rect.height) * 100; // Allow positions outside [0,100] so elements can extend past slide edges
 const x = xPctRaw; const y = yPctRaw; updateLayerProperty(currentSlide, isDraggingLayer, 'position', { x, y }); }); }, [isDraggingLayer, dragOffset, currentSlide, slides, updateLayerProperty]);
  const handleLayerMouseUp = useCallback(() => { setIsDraggingLayer(null); setDragOffset({ x: 0, y: 0 }); }, []);
  React.useEffect(() => { if (isDraggingLayer) { document.addEventListener('mousemove', handleLayerMouseMove); document.addEventListener('mouseup', handleLayerMouseUp); return () => { document.removeEventListener('mousemove', handleLayerMouseMove); document.removeEventListener('mouseup', handleLayerMouseUp); }; } }, [isDraggingLayer, handleLayerMouseMove, handleLayerMouseUp]);

  const updateSlideBackgroundColor = useCallback((color: string) => { setSlides(prev => prev.map((slide, idx) => idx === currentSlide ? { ...slide, backgroundColor: color } : slide)); }, [currentSlide]);

  // Project Management Functions
  const createProjectData = useCallback((): ProjectData => ({
    images,
    slides,
    currentSlide,
    viewMode,
    compositionMode,
    slideInterval,
    favorites: Array.from(favorites),
    rembgModel
  }), [images, slides, currentSlide, viewMode, compositionMode, slideInterval, favorites, rembgModel]);

  const loadProjectData = useCallback((projectData: ProjectData) => {
    // Restore images, but note that processed versions may be null due to compression
    setImages(projectData.images.map((img: ImageType) => ({
      ...img,
      processed: img.processed, // May be null - will need to be regenerated
      useProcessed: img.processed ? img.useProcessed : false // Only use processed if it exists
    })));
    setSlides(projectData.slides);
    setCurrentSlide(projectData.currentSlide);
    setViewMode(projectData.viewMode);
    setCompositionMode(projectData.compositionMode);
    setSlideInterval(projectData.slideInterval);
    setFavorites(new Set(projectData.favorites));
    setRembgModel(projectData.rembgModel);
    setSelectedImages(new Set());
    setSelectedLayer(null);
  }, []);

  const saveProjectToStorage = useCallback((project: Project) => {
    try {
      // First, try to compress the project data
      const compressedProject = {
        ...project,
        data: {
          ...project.data,
          // Don't save processed images to reduce size - they can be regenerated
          images: project.data.images.map(img => ({
            ...img,
            processed: null // Remove processed images to save space
          }))
        }
      };

      const savedProjects = JSON.parse(localStorage.getItem('moodboard-projects') || '[]');
      const existingIndex = savedProjects.findIndex((p: Project) => p.id === project.id);
      
      if (existingIndex >= 0) {
        savedProjects[existingIndex] = compressedProject;
      } else {
        savedProjects.push(compressedProject);
      }
      
      const projectsJson = JSON.stringify(savedProjects);
      
      // Check if the data is too large (approaching localStorage limit)
      const sizeInBytes = new Blob([projectsJson]).size;
      const maxSize = 4 * 1024 * 1024; // 4MB limit (conservative)
      
      if (sizeInBytes > maxSize) {
        // If too large, remove oldest projects until it fits
        const sortedProjects = [...savedProjects].sort((a, b) => 
          new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
        );
        
        let reducedProjects = [...savedProjects];
        
        // Keep removing oldest projects (except the current one) until size is acceptable
        while (reducedProjects.length > 1 && new Blob([JSON.stringify(reducedProjects)]).size > maxSize) {
          const oldestProject = sortedProjects.find(p => 
            reducedProjects.includes(p) && p.id !== project.id
          );
          
          if (oldestProject) {
            reducedProjects = reducedProjects.filter(p => p.id !== oldestProject.id);
          } else {
            break; // Safety break
          }
        }
        
        // If still too large, compress images further
        if (new Blob([JSON.stringify(reducedProjects)]).size > maxSize) {
          reducedProjects = reducedProjects.map(p => ({
            ...p,
            data: {
              ...p.data,
              images: p.data.images.map((img: ImageType) => ({
                id: img.id,
                name: img.name,
                useProcessed: false,
                original: img.original.length > 100000 ? '' : img.original, // Remove large images
                processed: null,
                searchMetadata: img.searchMetadata
              }))
            }
          }));
        }
        
        localStorage.setItem('moodboard-projects', JSON.stringify(reducedProjects));
        setProjects(reducedProjects);
        
        // Show warning about data compression
        console.warn('Project storage approaching limit. Some older projects or large images may have been removed.');
        alert('Storage space optimized: Some older projects or large images were compressed to save your current work.');
        
      } else {
        localStorage.setItem('moodboard-projects', projectsJson);
        setProjects(savedProjects);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to save project:', error);
      
      // Last resort: try to save just this project by clearing others
      try {
        const minimalProject = {
          ...project,
          data: {
            ...project.data,
            images: project.data.images.map((img: ImageType) => ({
              id: img.id,
              name: img.name,
              useProcessed: false,
              original: '',
              processed: null,
              searchMetadata: img.searchMetadata
            }))
          }
        };
        
        localStorage.setItem('moodboard-projects', JSON.stringify([minimalProject]));
        setProjects([minimalProject]);
        
        alert('Storage quota exceeded. Some image data was removed to save the project. You may need to re-upload images.');
        return true;
      } catch (finalError) {
        alert('Unable to save project - storage quota exceeded. Try removing some images or creating a new project.');
        return false;
      }
    }
  }, []);

  const loadProjectsFromStorage = useCallback(() => {
    try {
      const savedProjects = JSON.parse(localStorage.getItem('moodboard-projects') || '[]');
      setProjects(savedProjects);
    } catch (error) {
      console.error('Failed to load projects:', error);
      setProjects([]);
    }
  }, []);

  const autoSaveProject = useCallback(async () => {
    if (!autoSaveEnabled || !currentProject) return;

    try {
      const updatedProject: Project = {
        ...currentProject,
        updatedAt: new Date().toISOString(),
        data: createProjectData()
      };

      if (saveProjectToStorage(updatedProject)) {
        setCurrentProject(updatedProject);
        setLastSaved(new Date());
      }
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  }, [autoSaveEnabled, currentProject, createProjectData, saveProjectToStorage]);

  const createNewProject = useCallback((name: string) => {
    const newProject: Project = {
      id: `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name.trim() || 'Untitled Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      data: createProjectData()
    };

    if (saveProjectToStorage(newProject)) {
      setCurrentProject(newProject);
      setLastSaved(new Date());
      return newProject;
    }
    return null;
  }, [createProjectData, saveProjectToStorage]);

  const saveCurrentProject = useCallback((name?: string) => {
    setIsSaving(true);
    
    try {
      let project: Project;
      
      if (currentProject && !name) {
        // Update existing project
        project = {
          ...currentProject,
          updatedAt: new Date().toISOString(),
          data: createProjectData()
        };
      } else {
        // Create new project or save as new
        project = {
          id: `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: name?.trim() || currentProject?.name || 'Untitled Project',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          data: createProjectData()
        };
      }

      if (saveProjectToStorage(project)) {
        setCurrentProject(project);
        setLastSaved(new Date());
        setShowProjectModal(false);
        setProjectName('');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to save project:', error);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [currentProject, createProjectData, saveProjectToStorage]);

  const loadProject = useCallback((project: Project) => {
    loadProjectData(project.data);
    setCurrentProject(project);
    setLastSaved(new Date(project.updatedAt));
    setShowProjectModal(false);
  }, [loadProjectData]);

  const deleteProject = useCallback((projectId: string) => {
    try {
      const savedProjects = JSON.parse(localStorage.getItem('moodboard-projects') || '[]');
      const filteredProjects = savedProjects.filter((p: Project) => p.id !== projectId);
      localStorage.setItem('moodboard-projects', JSON.stringify(filteredProjects));
      setProjects(filteredProjects);
      
      if (currentProject?.id === projectId) {
        setCurrentProject(null);
        setLastSaved(null);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to delete project:', error);
      return false;
    }
  }, [currentProject]);

  const startNewProject = useCallback(() => {
    // Reset to default state
    setImages([]);
    setSlides([{ id: 1, layers: [], backgroundColor: '#1f2937' }]);
    setCurrentSlide(0);
    setViewMode('grid');
    setCompositionMode(false);
    setSlideInterval(3000);
    setFavorites(new Set());
    setRembgModel('u2net');
    setSelectedImages(new Set());
    setSelectedLayer(null);
    setCurrentProject(null);
    setLastSaved(null);
  }, []);

  // Load projects on component mount
  useEffect(() => {
    loadProjectsFromStorage();
    
    // Load auto-save settings
    const autoSaveSetting = localStorage.getItem('moodboard-autosave');
    if (autoSaveSetting !== null) {
      setAutoSaveEnabled(JSON.parse(autoSaveSetting));
    }
  }, [loadProjectsFromStorage]);

  // Auto-save effect - triggers when important data changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (currentProject && (images.length > 0 || slides.some(s => s.layers.length > 0))) {
        autoSaveProject();
      }
    }, 2000); // Auto-save after 2 seconds of inactivity

    return () => clearTimeout(timeoutId);
  }, [images, slides, currentSlide, viewMode, compositionMode, slideInterval, favorites, rembgModel, autoSaveProject, currentProject]);

  // Save auto-save preference
  useEffect(() => {
    localStorage.setItem('moodboard-autosave', JSON.stringify(autoSaveEnabled));
  }, [autoSaveEnabled]);

  // Prevent accidental page close if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!currentProject && (images.length > 0 || slides.some(s => s.layers.length > 0))) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentProject, images, slides]);

  // Storage management utilities
  const getStorageUsage = useCallback(() => {
    try {
      const projects = localStorage.getItem('moodboard-projects') || '[]';
      const sizeInBytes = new Blob([projects]).size;
      const maxSize = 100 * 1024 * 1024; // 100MB localStorage limit
      return {
        used: sizeInBytes,
        max: maxSize,
        percentage: (sizeInBytes / maxSize) * 100
      };
    } catch {
      return { used: 0, max: 100 * 1024 * 1024, percentage: 0 };
    }
  }, []);

  const cleanupOldProjects = useCallback((): number => {
    try {
      const savedProjects = JSON.parse(localStorage.getItem('moodboard-projects') || '[]');
      if (savedProjects.length <= 3) return 0; // Keep at least 3 projects
      
      // Sort by updatedAt and keep only the 3 most recent (excluding current project)
      const sorted = savedProjects.sort((a: Project, b: Project) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      
      const currentProjectId = currentProject?.id;
      const toKeep = sorted.slice(0, 3);
      
      // Always include current project if it's not in the top 3
      if (currentProjectId && !toKeep.find((p: Project) => p.id === currentProjectId)) {
        const currentProjectData = sorted.find((p: Project) => p.id === currentProjectId);
        if (currentProjectData) {
          toKeep[2] = currentProjectData; // Replace the 3rd oldest with current project
        }
      }
      
      localStorage.setItem('moodboard-projects', JSON.stringify(toKeep));
      setProjects(toKeep);
      
      return savedProjects.length - toKeep.length;
    } catch (error) {
      console.error('Failed to cleanup projects:', error);
      return 0;
    }
  }, [currentProject]);

  // Helper to render status cards for admin panel
  const SITE_LABELS: Record<string, string> = { pottery_barn: 'Pottery Barn', west_elm: 'West Elm', raymour_flanigan: 'Raymour & Flanigan' };
  const renderKeyStatus = (data: any) => {
    const keys = ['pottery_barn', 'west_elm', 'raymour_flanigan'];
    return (
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
        {keys.map(k => {
          const entry: any = data?.[k] || {};
          const value: any = entry?.value || entry; // support different shapes
          const hasKey = value?.has_key === true || !!value?.key;
          const hasClientlib = value?.has_clientlib === true || !!value?.clientlib;
          const clientlib = typeof value?.clientlib === 'string' ? value.clientlib : '';
          const updatedAt = value?.updated_at as string | undefined;
          return (
            <div key={k} className="p-2 bg-gray-700/60 rounded border border-gray-600/40">
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-200 font-medium">{SITE_LABELS[k]}</span>
                <div className="flex items-center gap-1">
                  <span className={`px-2 py-0.5 rounded ${hasKey ? 'bg-green-600/30 text-green-200' : 'bg-yellow-600/30 text-yellow-200'}`}>Key {hasKey ? 'OK' : 'Missing'}</span>
                  <span className={`px-2 py-0.5 rounded ${hasClientlib ? 'bg-green-600/30 text-green-200' : 'bg-yellow-600/30 text-yellow-200'}`}>Clientlib {hasClientlib ? 'OK' : 'Missing'}</span>
                </div>
              </div>
              <div className="text-gray-300 truncate">clientlib: {clientlib || '-'}</div>
              <div className="text-gray-400 mt-0.5">{updatedAt ? `updated: ${new Date(updatedAt).toLocaleString()}` : 'updated: -'}</div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <header className="glass-effect border-b border-gray-700/50">
        <div className="max-w-[2000px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gradient whitespace-nowrap">Mood Board Creator</h1>
              <p className="text-sm text-gray-400 hidden sm:block">Interior Design Tool</p>
              {currentProject && (
                <div className="hidden lg:flex items-center space-x-2 text-sm text-gray-300">
                  <span>Project:</span>
                  <span className="text-white font-medium">{currentProject.name}</span>
                  {lastSaved && (
                    <span className="text-gray-400">
                      (saved {new Date(lastSaved).toLocaleTimeString()})
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center space-x-3">
              {/* Project Management Controls */}
              <div className="flex items-center space-x-2">
                <button 
                  onClick={() => { setProjectModalMode('create'); setShowProjectModal(true); }} 
                  className="p-2 text-gray-300 hover:text-white hover:bg-gray-600/30 rounded-lg transition-all" 
                  title="New Project"
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => { setProjectModalMode('save'); setShowProjectModal(true); }} 
                  className="p-2 text-gray-300 hover:text-white hover:bg-gray-600/30 rounded-lg transition-all" 
                  title="Save Project"
                >
                  <Save className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => { setProjectModalMode('load'); setShowProjectModal(true); }} 
                  className="p-2 text-gray-300 hover:text-white hover:bg-gray-600/30 rounded-lg transition-all" 
                  title="Open Project"
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
              </div>
              <div className="flex bg-gray-700/50 backdrop-blur-sm rounded-lg p-1 border border-gray-600/30">
                <button onClick={() => setActiveTab('moodboard')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'moodboard' ? 'gradient-primary text-white shadow-sm' : 'text-gray-300 hover:text-white hover:bg-gray-600/30'}`}>Mood Board</button>
                <button onClick={() => setActiveTab('search')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'search' ? 'gradient-primary text-white shadow-sm' : 'text-gray-300 hover:text-white hover:bg-gray-600/30'}`}>Search Furniture</button>
              </div>
            </div>
          </div>
          {activeTab === 'moodboard' && (
            <div className="flex items-center justify-center pb-4 border-t border-gray-700/30 pt-4 space-x-4">
              <div className="flex bg-gray-700/50 backdrop-blur-sm rounded-lg p-1 border border-gray-600/30">
                <button onClick={() => { setViewMode('grid'); }} className={`flex items-center space-x-2 px-6 py-3 rounded-md text-sm font-medium transition-all ${viewMode === 'grid' ? 'gradient-primary text-white shadow-sm' : 'text-gray-300 hover:text-white hover:bg-gray-600/30'}`}> <Grid className="w-4 h-4" /> <span>Grid</span></button>
                <button onClick={() => { setViewMode('slideshow'); }} className={`flex items-center space-x-2 px-6 py-3 rounded-md text-sm font-medium transition-all ${viewMode === 'slideshow' ? 'gradient-primary text-white shadow-sm' : 'text-gray-300 hover:text-white hover:bg-gray-600/30'}`}> <Layers className="w-4 h-4" /> <span>Slideshow</span></button>
                <button onClick={() => { setViewMode('preview'); }} disabled={slides.length === 0 || slides.every(s => s.layers.length === 0)} className={`flex items-center space-x-2 px-6 py-3 rounded-md text-sm font-medium transition-all ${viewMode === 'preview' ? 'gradient-primary text-white shadow-sm' : 'text-gray-300 hover:text-white hover:bg-gray-600/30'}`}> <Play className="w-4 h-4" /> <span>Preview</span></button>
              </div>
              <div className="flex items-center space-x-4">
                {/* BG Removal selector replaced with fixed AI badge + status */}
                <div className="hidden sm:flex items-center space-x-2 mr-2">
                  <span className="text-sm text-gray-300">BG Removal:</span>
                  <span className={`px-2 py-1 rounded text-sm flex items-center space-x-2 ${aiAvailable ? 'bg-green-600/20 text-green-200' : 'bg-yellow-600/20 text-yellow-200'}`}>
                    <span className={`inline-block w-2 h-2 rounded-full ${aiAvailable ? 'bg-green-400' : 'bg-yellow-400'}`}></span>
                    <span>{aiAvailable ? 'AI (rembg) connected' : 'AI (rembg) starting...'}</span>
                  </span>
                </div>
                {(aiModelLoading || batchProgress) && (
                  <div className="flex items-center text-sm text-purple-400">
                    <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mr-2"></div>
                    <span>{aiModelLoading ? 'Loading...' : `Processing ${batchProgress!.current}/${batchProgress!.total}`}</span>
                  </div>
                )}
                <div className="flex items-center space-x-2">
                  {selectedImages.size > 0 && (
                    <button onClick={batchBackgroundRemoval} disabled={Array.from(selectedImages).some(id => processingImages.has(id))} className="btn-gradient text-sm px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"> <Filter className="w-4 h-4" /> <span className="ml-1">Remove BG ({selectedImages.size})</span></button>
                  )}
                  <button 
                    onClick={exportMoodBoard} 
                    disabled={isExporting || (compositionMode ? slides.length === 0 : images.length === 0)} 
                    className="btn-gradient text-sm px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  > 
                    <FileText className={`w-4 h-4 ${isExporting ? 'animate-pulse' : ''}`} /> 
                    <span className="ml-1">
                      {isExporting ? 'Creating PPT...' : 'Export PPT'}
                    </span>
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className="btn-gradient text-sm px-3 py-1"> <Upload className="w-4 h-4" /> <span className="ml-1">Upload</span></button>
                </div>
              </div>
            </div>
          )}
          <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" />
        </div>
      </header>

      <main className="max-w-[2000px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'search' ? (
          <div className="space-y-6">
            <div className="card-dark rounded-lg shadow-lg p-6">
              <div className="flex items-center space-x-4 mb-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSearch()} placeholder="Search for furniture, lighting, decor..." className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                </div>
                <button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()} className="btn-gradient disabled:opacity-50 disabled:cursor-not-allowed"> {isSearching ? 'Searching...' : 'Search'} </button>
                {(searchQuery || searchResults.length > 0) && (<button onClick={clearSearch} className="p-2 text-gray-400 hover:text-gray-300 transition-colors"><X className="w-5 h-5" /></button>)}
                {/* NEW: Admin toggle */}
                <button onClick={() => setShowAdmin(v => !v)} className={`px-3 py-2 text-sm rounded ${showAdmin ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}>Keys</button>
              </div>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center space-x-2"><Filter className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-300">Filters:</span></div>
                <select value={searchFilters.category} onChange={(e) => setSearchFilters(prev => ({ ...prev, category: e.target.value }))} className="px-3 py-1 text-sm border border-gray-600 rounded-md bg-gray-700 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500">
                  <option value="all">All Categories</option><option value="seating">Seating</option><option value="tables">Tables</option><option value="storage">Storage</option><option value="lighting">Lighting</option><option value="decor">Decor</option>
                </select>
                <select value={searchFilters.style} onChange={(e) => setSearchFilters(prev => ({ ...prev, style: e.target.value }))} className="px-3 py-1 text-sm border border-gray-600 rounded-md bg-gray-700 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500">
                  <option value="all">All Styles</option><option value="modern">Modern</option><option value="contemporary">Contemporary</option><option value="mid-century">Mid-Century</option><option value="scandinavian">Scandinavian</option><option value="industrial">Industrial</option><option value="rustic">Rustic</option>
                </select>
                <select value={searchFilters.priceRange} onChange={(e) => setSearchFilters(prev => ({ ...prev, priceRange: e.target.value }))} className="px-3 py-1 text-sm border border-gray-600 rounded-md bg-gray-700 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500">
                  <option value="all">All Prices</option><option value="under200">Under $200</option><option value="200to500">$200 - $500</option><option value="500to1000">$500 - $1,000</option><option value="over1000">Over $1,000</option>
                </select>
              </div>
              {showAdmin && (
                <div className="mt-4 p-3 rounded-lg border border-gray-700 bg-gray-800/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-gray-200">Retailer API Keys</div>
                    <div className="flex items-center gap-2">
                      <button onClick={fetchConstructorKeyStatus} disabled={keyStatus.loading || isRefreshingKeys} className="px-2 py-1 text-xs rounded bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50">{keyStatus.loading ? 'Loading...' : 'Check Status'}</button>
                      <button onClick={refreshConstructorKeys} disabled={isRefreshingKeys} className="px-2 py-1 text-xs rounded btn-gradient disabled:opacity-50 flex items-center gap-1">{isRefreshingKeys ? (<><div className="w-3 h-3 border-2 border-white/70 border-t-transparent rounded-full animate-spin" /> Refreshing...</>) : (<><RotateCw className="w-3 h-3" /> Refresh Keys</> )}</button>
                    </div>
                  </div>
                  {keyStatus.error && (<div className="text-xs text-red-400">{keyStatus.error}</div>)}
                  {keyStatus.data && renderKeyStatus(keyStatus.data)}
                  {/* If refresh response includes missing_sites list, surface it */}
                  {Array.isArray((keyStatus as any)?.data?.missing_sites) && (keyStatus as any).data.missing_sites.length > 0 && (
                    <div className="mt-2 text-xs text-yellow-300">Missing after refresh: {(keyStatus as any).data.missing_sites.join(', ')}</div>
                  )}
                </div>
              )}
            </div>
            {isSearching && (
              <div className="text-center py-12">
                <div className="relative mx-auto mb-6" style={{ width: '80px', height: '80px' }}>
                  <div className="absolute inset-0 border-4 border-gray-600 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-purple-500 rounded-full animate-spin border-t-transparent"></div>
                  <div className="absolute inset-2 border-2 border-blue-400 rounded-full animate-spin animation-delay-300 border-t-transparent"></div>
                </div>
                <h3 className="text-lg font-medium text-white mb-2">Searching Furniture Sites</h3>
                <p className="text-gray-300 mb-4">Aggregating results from multiple retailers...</p>
                <div className="flex flex-wrap justify-center gap-2 text-sm">
                  <span className="px-3 py-1 bg-purple-600/20 text-purple-200 rounded-full border border-purple-500/30">🛋️ Wayfair</span>
                  <span className="px-3 py-1 bg-blue-600/20 text-blue-200 rounded-full border border-blue-500/30">🏠 Pottery Barn</span>
                  <span className="px-3 py-1 bg-teal-600/20 text-teal-200 rounded-full border border-teal-500/30">🪑 West Elm</span>
                  <span className="px-3 py-1 bg-indigo-600/20 text-indigo-200 rounded-full border border-indigo-500/30">🛏️ Raymour & Flanigan</span>
                </div>
              </div>
            )}
            {!isSearching && searchResults.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">Search Results ({searchResults.length})</h2>
                  <div className="text-sm text-gray-400">
                    <span>Results from: </span>
                    {sitesSearched && sitesSearched.length > 0 ? (
                      <span className="text-gray-300">{sitesSearched.join(' • ')}</span>
                    ) : (
                      <span className="text-gray-500">Multiple Retailers</span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {searchResults.map(item => (
                    <div key={item.id} className="card-dark rounded-lg shadow-lg border border-gray-600 hover:border-gray-500 transition-all">
                      <div className="relative">
                        <img src={item.image} alt={item.title} className="w-full h-48 object-cover rounded-t-lg" />
                        <div className="absolute top-2 left-2"><span className="px-2 py-1 bg-gray-800/80 backdrop-blur-sm text-xs font-medium text-white rounded">{item.site}</span></div>
                        <div className="absolute top-2 right-2 space-x-1">
                          <button onClick={() => toggleFavorite(item.id)} className={`p-1.5 rounded-full backdrop-blur-sm ${favorites.has(item.id) ? 'bg-red-600/80 text-white' : 'bg-gray-800/80 text-gray-300 hover:text-red-400'} transition-colors`}> <Heart className="w-4 h-4" fill={favorites.has(item.id) ? 'currentColor' : 'none'} /></button>
                          <button onClick={() => addSearchResultToMoodBoard(item)} className="p-1.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full hover:from-purple-700 hover:to-blue-700 transition-colors" title="Add to mood board"> <Plus className="w-4 h-4" /></button>
                        </div>
                        {!item.inStock && (<div className="absolute inset-0 bg-gray-900 bg-opacity-70 flex items-center justify-center rounded-t-lg"><span className="text-white font-medium">Out of Stock</span></div>)}
                      </div>
                      <div className="p-4">
                        <h3 className="font-medium text-white mb-2 line-clamp-2">{item.title}</h3>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2"><span className="text-lg font-bold text-green-400">{item.price}</span>{item.originalPrice && (<span className="text-sm text-gray-400 line-through">{item.originalPrice}</span>)}</div>
                        </div>
                        <div className="flex items-center justify-between">
                          <button onClick={() => window.open(item.url, '_blank')} className="flex items-center text-sm text-purple-400 hover:text-purple-300 transition-colors"><ExternalLink className="w-4 h-4 mr-1" />View Details</button>
                          <button onClick={() => addSearchResultToMoodBoard(item)} className="btn-gradient text-sm">Add to Board</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!isSearching && searchQuery && searchResults.length === 0 && (<div className="text-center py-12 card-dark rounded-lg"><Search className="w-16 h-16 text-gray-400 mx-auto mb-4" /><h3 className="text-lg font-medium text-white mb-2">No results found</h3><p className="text-gray-300">Try adjusting your search terms or filters</p></div>)}
            {!searchQuery && searchResults.length === 0 && !isSearching && (
              <div className="text-center py-12 card-dark rounded-lg">
                <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Search for Furniture & Decor</h3>
                <p className="text-gray-300 mb-4">Find items from major furniture retailers and add them to your mood board</p>
                <div className="flex flex-wrap justify-center gap-2 text-sm text-gray-300">
                  <span className="px-3 py-1 bg-purple-600/20 text-purple-200 rounded border border-purple-500/30">Wayfair</span>
                  <span className="px-3 py-1 bg-blue-600/20 text-blue-200 rounded border border-blue-500/30">Pottery Barn</span>
                  <span className="px-3 py-1 bg-teal-600/20 text-teal-200 rounded border border-teal-500/30">West Elm</span>
                  <span className="px-3 py-1 bg-indigo-600/20 text-indigo-200 rounded border border-indigo-500/30">Raymour & Flanigan</span>
                </div>
                <p className="text-gray-400 text-sm mt-4">Try searching: "chair", "table", "lamp", "sofa", "storage"</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {images.length === 0 ? (
              <div className="text-center py-12">
                <Upload className="w-24 h-24 text-gray-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-600 mb-2">No images uploaded yet</h2>
                <p className="text-gray-500 mb-6">Upload images or search for furniture to start creating your mood board</p>
                <div className="flex justify-center space-x-4">
                  <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"> <Upload className="w-5 h-5 mr-2" /> Choose Images</button>
                  <button onClick={() => setActiveTab('search')} className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"> <Search className="w-5 h-5 mr-2" /> Search Furniture</button>
                </div>
              </div>
            ) : (
              <>
                {viewMode === 'preview' ? (
                  <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
                    <div className="relative w-full h-full flex items-center justify-center">
                      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
                        <div className="flex items-center space-x-4 bg-black/50 backdrop-blur-sm rounded-lg p-3">
                          <button onClick={prevSlide} disabled={currentSlide === 0} className="p-2 bg-gray-600 text-white rounded hover:bg-gray-500 disabled:opacity-50"> <SkipBack className="w-5 h-5" /></button>
                          <button onClick={isPlaying ? stopSlideshow : startSlideshow} className="p-2 btn-gradient rounded"> {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />} </button>
                          <button onClick={nextSlide} disabled={currentSlide === slides.length - 1} className="p-2 bg-gray-600 text-white rounded hover:bg-gray-500 disabled:opacity-50"> <SkipForward className="w-5 h-5" /></button>
                          <select value={slideInterval} onChange={(e) => setSlideInterval(Number(e.target.value))} className="px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded"><option value={1000}>1s</option><option value={2000}>2s</option><option value={3000}>3s</option><option value={5000}>5s</option></select>
                          <span className="text-white text-sm">{currentSlide + 1} / {slides.length}</span>
                        </div>
                      </div>
                      <button onClick={() => { setViewMode('slideshow'); setIsPlaying(false); }} className="absolute top-4 right-4 z-10 p-2 bg-red-600 text-white rounded-full hover:bg-red-700" title="Exit Preview"> <X className="w-5 h-5" /></button>
                      <div className="w-full h-full flex items-center justify-center pt-20 pb-8 px-4">
                        <div className="relative bg-gray-900 rounded-lg border-2 border-dashed border-gray-600 overflow-hidden" style={{ aspectRatio: '16/9', width: '98vw', maxWidth: '2000px', height: 'auto' }}>
                          {currentSlideData?.layers.map((layer) => {
                            if (layer.type === 'text') {
                              return (
                                <div key={layer.id} className="absolute flex items-center justify-center p-2" style={{ left: `${layer.position.x}%`, top: `${layer.position.y}%`, width: `${(layer.size.width / 1200) * 100}%`, height: `${(layer.size.height / 675) * 100}%`, transform: `rotate(${layer.rotation}deg)`, opacity: layer.opacity, zIndex: layer.zIndex, color: layer.fontColor, fontSize: `${layer.fontSize}px`, fontFamily: layer.fontFamily, textAlign: layer.textAlign }}>
                                  <div className="w-full h-full overflow-hidden whitespace-pre-wrap break-words user-select-none pointer-events-none">{layer.text}</div>
                                </div>
                              );
                            }
                            const image = images.find(img => img.id === layer.imageId); if (!image) return null; return (
                              <div key={layer.id} className="absolute" style={{ left: `${layer.position.x}%`, top: `${layer.position.y}%`, width: `${(layer.size.width / 1200) * 100}%`, height: `${(layer.size.height / 675) * 100}%`, transform: `rotate(${layer.rotation}deg)`, opacity: layer.opacity, zIndex: layer.zIndex }}>
                                <img src={image.useProcessed && image.processed ? image.processed : image.original} alt={image.name} className="w-full h-full object-fill rounded" />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : viewMode === 'slideshow' ? (
                  <div className="flex space-x-6">
                    {/* Left Panel - Slide Management & Image Library */}
                    <div className="w-72 space-y-4">
                      <div className="card-dark rounded-lg shadow-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-lg font-semibold text-white">Slides</h3>
                          <div className="flex space-x-1">
                            <button onClick={addSlide} className="p-2 btn-gradient rounded text-xs" title="Add new slide"> <Plus className="w-4 h-4" /></button>
                            <button onClick={() => addTextLayer(currentSlide)} className="p-2 bg-blue-600 text-white rounded text-xs hover:bg-blue-700" title="Add text box"> <Type className="w-4 h-4" /></button>
                            {slides.length > 1 && (<button onClick={() => deleteSlide(currentSlide)} className="p-2 bg-red-600 text-white rounded text-xs hover:bg-red-700" title="Delete current slide"> <Trash2 className="w-4 h-4" /></button>)}
                          </div>
                        </div>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {slides.map((slide, slideIndex) => (
                            <div key={slide.id} className={`relative p-3 rounded cursor-pointer transition-all ${slideIndex === currentSlide ? 'bg-purple-600/20 border border-purple-500' : 'bg-gray-600 hover:bg-gray-500'}`} onClick={() => setCurrentSlide(slideIndex)}>
                              <div className="flex items-center justify-between"><span className="text-white text-sm">Slide {slideIndex + 1}</span><span className="text-xs text-gray-400">{slide.layers.length} layers</span></div>
                              <div className="mt-2 h-20 rounded relative overflow-hidden" style={{ backgroundColor: slide.backgroundColor || '#374151' }}>
                                {slide.layers.map((layer) => {
                                  if (layer.type === 'text') {
                                    return (<div key={layer.id} className="absolute text-[6px] leading-tight px-1 py-0.5 rounded bg-black/30 text-white" style={{ left: `${layer.position.x * 0.8}%`, top: `${layer.position.y * 0.8}%`, width: `${layer.size.width * 0.2}px`, height: `${layer.size.height * 0.2}px`, transform: `rotate(${layer.rotation}deg)`, opacity: layer.opacity, zIndex: layer.zIndex, textAlign: layer.textAlign }}>{layer.text?.slice(0,15)}</div>);
                                  }
                                  const image = images.find(img => img.id === layer.imageId); if (!image) return null; return (
                                    <div key={layer.id} className="absolute" style={{ left: `${layer.position.x * 0.8}%`, top: `${layer.position.y * 0.8}%`, width: `${layer.size.width * 0.3}px`, height: `${layer.size.height * 0.3}px`, transform: `rotate(${layer.rotation}deg)`, opacity: layer.opacity, zIndex: layer.zIndex }}>
                                      <img src={image.useProcessed && image.processed ? image.processed : image.original} alt={image.name} className="w-full h-full object-cover rounded" />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="card-dark rounded-lg shadow-lg p-4">
                        <div className="flex items-center justify-between mb-3"><h3 className="text-lg font-semibold text-white">Layers</h3><span className="text-xs text-gray-400">Slide {currentSlide + 1}</span></div>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {currentSlideData?.layers.sort((a, b) => b.zIndex - a.zIndex).map((layer) => {
                            const image = images.find(img => img.id === layer.imageId);
                            if (!image && layer.type === 'image') return null;
                            return (
                              <div key={layer.id} className={`p-2 rounded cursor-pointer transition-all ${selectedLayer === layer.id ? 'bg-purple-600/20 border border-purple-500' : 'bg-gray-600 hover:bg-gray-500'}`} onClick={() => setSelectedLayer(layer.id)}>
                                <div className="flex items-center space-x-2">
                                  {layer.type === 'image' && (<img src={image!.useProcessed && image!.processed ? image!.processed : image!.original} alt="layer" className="w-8 h-8 object-cover rounded" />)}
                                  {layer.type === 'text' && (<div className="w-8 h-8 flex items-center justify-center bg-gray-700 rounded text-[10px] text-white truncate px-1">TXT</div>)}
                                  <div className="flex-1 min-w-0"><p className="text-white text-sm truncate">{layer.type === 'text' ? (layer.text || 'Text') : (image?.name || 'Image')}</p><p className="text-xs text-gray-400">z {layer.zIndex}</p></div>
                                  <div className="flex flex-col space-y-1">
                                    <button onClick={(e) => { e.stopPropagation(); moveLayerUp(currentSlide, layer.id); }} disabled={layer.zIndex === (Math.max(...currentSlideData.layers.map(l=>l.zIndex)))} className="p-1 bg-gray-700 text-white rounded text-xs hover:bg-gray-600 disabled:opacity-50"><ChevronUp className="w-3 h-3" /></button>
                                    <button onClick={(e) => { e.stopPropagation(); moveLayerDown(currentSlide, layer.id); }} disabled={layer.zIndex === 0} className="p-1 bg-gray-700 text-white rounded text-xs hover:bg-gray-600 disabled:opacity-50"><ChevronDown className="w-3 h-3" /></button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {(!currentSlideData?.layers || currentSlideData.layers.length === 0) && (
                            <div className="text-center text-gray-400 text-sm py-4"><Layers className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>No layers on this slide</p><p className="text-xs mt-1">Drag images here to add them</p></div>
                          )}
                        </div>
                      </div>
                      <div className="card-dark rounded-lg shadow-lg p-4">
                        <h3 className="text-lg font-semibold text-white mb-3">Image Library</h3>
                        {images.length === 0 ? (
                          <div className="text-center py-8 border-2 border-dashed border-gray-600 rounded-lg"><Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" /><p className="text-gray-400 text-sm">No images uploaded yet</p><button onClick={() => fileInputRef.current?.click()} className="mt-2 px-3 py-1 text-xs btn-gradient rounded">Upload Images</button></div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                            {images.map(image => (
                              <div key={image.id} className="relative group cursor-pointer" draggable onDragStart={(e) => handleDragStart(e, image)}>
                                <img src={image.useProcessed && image.processed ? image.processed : image.original} alt={image.name} className="w-full h-20 object-cover rounded hover:opacity-80 transition-opacity bg-gray-700" />
                                <button onClick={() => addImageToSlide(image, currentSlide)} className="absolute top-1 right-1 p-1 bg-purple-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" title="Add to current slide"> <Plus className="w-3 h-3" /></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="card-dark rounded-lg shadow-lg p-4">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-white">Slide {currentSlide + 1}</h3>
                          <div className="flex items-center space-x-2">
                            <button onClick={prevSlide} disabled={currentSlide === 0} className="p-2 bg-gray-600 text-white rounded hover:bg-gray-500 disabled:opacity-50"><SkipBack className="w-4 h-4" /></button>
                            <button onClick={isPlaying ? stopSlideshow : startSlideshow} className="p-2 btn-gradient rounded"> {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />} </button>
                            <button onClick={nextSlide} disabled={currentSlide === slides.length - 1} className="p-2 bg-gray-600 text-white rounded hover:bg-gray-500 disabled:opacity-50"><SkipForward className="w-4 h-4" /></button>
                            <select value={slideInterval} onChange={(e) => setSlideInterval(Number(e.target.value))} className="ml-2 px-2 py-1 text-sm bg-gray-700 text-white border border-gray-600 rounded"><option value={1000}>1s</option><option value={2000}>2s</option><option value={3000}>3s</option><option value={5000}>5s</option></select>
                          </div>
                        </div>
                        <div
                          ref={compositionCanvasRef}
                          className="relative w-full border-2 border-dashed border-gray-600 rounded-lg overflow-hidden"
                          style={{ aspectRatio: '16/9', backgroundColor: currentSlideData?.backgroundColor || '#1f2937' }}
                          onDrop={handleDrop}
                          onDragOver={handleDragOver}
                        >
                          {currentSlideData?.layers.map((layer) => {
                            if (layer.type === 'text') {
                              return (
                                <div key={layer.id} onMouseDown={(e)=>handleLayerMouseDown(e, layer.id)} className={`absolute flex items-center justify-center p-2 select-none cursor-move group ${selectedLayer===layer.id ? 'ring-2 ring-purple-400' : ''}`} style={{ left: `${layer.position.x}%`, top: `${layer.position.y}%`, width: `${(layer.size.width / 1200) * 100}%`, height: `${(layer.size.height / 675) * 100}%`, transform: `rotate(${layer.rotation}deg)`, opacity: layer.opacity, zIndex: layer.zIndex, color: layer.fontColor, fontSize: `${layer.fontSize}px`, fontFamily: layer.fontFamily, textAlign: layer.textAlign }}>
                                  <div className="w-full h-full overflow-hidden whitespace-pre-wrap break-words pointer-events-none">{layer.text}</div>
                                  {selectedLayer === layer.id && !isDraggingLayer && (<><div onMouseDown={(e)=>handleResizeStart(e, layer.id, 'nw')} className="absolute -top-1 -left-1 w-3 h-3 bg-white rounded-sm shadow cursor-nw-resize" /><div onMouseDown={(e)=>handleResizeStart(e, layer.id, 'ne')} className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-sm shadow cursor-ne-resize" /><div onMouseDown={(e)=>handleResizeStart(e, layer.id, 'sw')} className="absolute -bottom-1 -left-1 w-3 h-3 bg-white rounded-sm shadow cursor-sw-resize" /><div onMouseDown={(e)=>handleResizeStart(e, layer.id, 'se')} className="absolute -bottom-1 -right-1 w-3 h-3 bg-white rounded-sm shadow cursor-se-resize" /></>)}
                                </div>
                              );
                            }
                            const image = images.find(img => img.id === layer.imageId); if (!image) return null; return (
                              <div key={layer.id} onMouseDown={(e)=>handleLayerMouseDown(e, layer.id)} className={`absolute select-none cursor-move group ${selectedLayer===layer.id ? 'ring-2 ring-purple-400' : ''}`} style={{ left: `${layer.position.x}%`, top: `${layer.position.y}%`, width: `${(layer.size.width / 1200) * 100}%`, height: `${(layer.size.height / 675) * 100}%`, transform: `rotate(${layer.rotation}deg)`, opacity: layer.opacity, zIndex: layer.zIndex }}>
                                <img src={image.useProcessed && image.processed ? image.processed : image.original} alt={image.name} className="w-full h-full object-fill rounded pointer-events-none" />
                                {selectedLayer === layer.id && !isDraggingLayer && (<><div onMouseDown={(e)=>handleResizeStart(e, layer.id, 'nw')} className="absolute -top-1 -left-1 w-3 h-3 bg-white rounded-sm shadow cursor-nw-resize" /><div onMouseDown={(e)=>handleResizeStart(e, layer.id, 'ne')} className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-sm shadow cursor-ne-resize" /><div onMouseDown={(e)=>handleResizeStart(e, layer.id, 'sw')} className="absolute -bottom-1 -left-1 w-3 h-3 bg-white rounded-sm shadow cursor-sw-resize" /><div onMouseDown={(e)=>handleResizeStart(e, layer.id, 'se')} className="absolute -bottom-1 -right-1 w-3 h-3 bg-white rounded-sm shadow cursor-se-resize" /></>)}
                              </div>
                            );
                          })}
                          <div className="absolute bottom-2 left-2 flex items-center space-x-2 bg-black/30 rounded px-2 py-1 text-xs text-gray-200">
                            <span>BG:</span>
                            <input type="color" value={currentSlideData?.backgroundColor || '#1f2937'} onChange={(e) => updateSlideBackgroundColor(e.target.value)} className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="w-56">
                      <div className="card-dark rounded-lg shadow-lg p-4">
                        <h3 className="text-lg font-semibold text-white mb-3">Properties</h3>
                        {selectedLayer ? (() => {
                          const layer = currentSlideData?.layers.find(l => l.id === selectedLayer); if (!layer) return null; const image = layer.type === 'image' ? images.find(img => img.id === layer.imageId) : null; return (
                            <div className="space-y-4">
                              {layer.type === 'image' && image && (<div><img src={image.useProcessed && image.processed ? image.processed : image.original} alt={image.name} className="w-full h-20 object-cover rounded mb-2" /><p className="text-white text-sm font-medium truncate">{image.name}</p></div>)}
                              {layer.type === 'text' && (<div><p className="text-white text-sm font-medium mb-2">Text Layer</p><textarea value={layer.text} onChange={(e) => updateLayerProperty(currentSlide, layer.id, 'text', e.target.value)} className="w-full h-24 text-sm bg-gray-700 border border-gray-600 rounded p-2 text-white resize-none" /><div className="mt-2 grid grid-cols-3 gap-2"><button onClick={() => updateLayerProperty(currentSlide, layer.id, 'textAlign', 'left')} className={`p-1 rounded ${layer.textAlign==='left'?'bg-purple-600':'bg-gray-700 hover:bg-gray-600'}`}> <AlignLeft className="w-4 h-4"/> </button><button onClick={() => updateLayerProperty(currentSlide, layer.id, 'textAlign', 'center')} className={`p-1 rounded ${layer.textAlign==='center'?'bg-purple-600':'bg-gray-700 hover:bg-gray-600'}`}> <AlignCenter className="w-4 h-4"/> </button><button onClick={() => updateLayerProperty(currentSlide, layer.id, 'textAlign', 'right')} className={`p-1 rounded ${layer.textAlign==='right'?'bg-purple-600':'bg-gray-700 hover:bg-gray-600'}`}> <AlignRight className="w-4 h-4"/> </button></div></div>)}
                              <div className="space-y-2">
                                <label className="text-xs text-gray-400">Position</label>
                                <div className="grid grid-cols-2 gap-2">
                                  <div><label className="text-xs text-gray-500">X</label><input type="range" min="-200" max="200" value={layer.position.x} onChange={(e) => updateLayerProperty(currentSlide, layer.id, 'position', { ...layer.position, x: parseFloat(e.target.value) })} className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer" /><span className="text-xs text-gray-400">{layer.position.x.toFixed(1)}%</span></div>
                                  <div><label className="text-xs text-gray-500">Y</label><input type="range" min="-200" max="200" value={layer.position.y} onChange={(e) => updateLayerProperty(currentSlide, layer.id, 'position', { ...layer.position, y: parseFloat(e.target.value) })} className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer" /><span className="text-xs text-gray-400">{layer.position.y.toFixed(1)}%</span></div>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <label className="text-xs text-gray-400">Size</label>
                                <div className="grid grid-cols-2 gap-2">
                                  <div><label className="text-xs text-gray-500">Width</label><input type="range" min="20" max="2400" value={layer.size.width} onChange={(e) => updateLayerProperty(currentSlide, layer.id, 'size', { ...layer.size, width: parseInt(e.target.value) })} className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer" /><span className="text-xs text-gray-400">{layer.size.width}px</span></div>
                                  <div><label className="text-xs text-gray-500">Height</label><input type="range" min="20" max="2400" value={layer.size.height} onChange={(e) => updateLayerProperty(currentSlide, layer.id, 'size', { ...layer.size, height: parseInt(e.target.value) })} className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer" /><span className="text-xs text-gray-400">{layer.size.height}px</span></div>
                                </div>
                              </div>
                              {layer.type === 'text' && (<div className="space-y-2"><label className="text-xs text-gray-400">Text Style</label><div><label className="text-xs text-gray-500">Font Size</label><input type="range" min="12" max="96" value={layer.fontSize || 32} onChange={(e)=> updateLayerProperty(currentSlide, layer.id, 'fontSize', parseInt(e.target.value))} className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer" /><span className="text-xs text-gray-400">{layer.fontSize}px</span></div><div className="flex items-center space-x-2"><label className="text-xs text-gray-500">Color</label><input type="color" value={layer.fontColor || '#ffffff'} onChange={(e)=> updateLayerProperty(currentSlide, layer.id, 'fontColor', e.target.value)} className="w-8 h-8 p-0 bg-transparent border-0" /></div><div><label className="text-xs text-gray-500">Font</label><select value={layer.fontFamily} onChange={(e)=> updateLayerProperty(currentSlide, layer.id, 'fontFamily', e.target.value)} className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white"><option value="Inter, sans-serif">Inter</option><option value="Arial, sans-serif">Arial</option><option value="Georgia, serif">Georgia</option><option value="Times New Roman, serif">Times New Roman</option><option value="Courier New, monospace">Courier New</option></select></div></div>)}
                              <div><label className="text-xs text-gray-400">Rotation</label><input type="range" min="-180" max="180" value={layer.rotation} onChange={(e) => updateLayerProperty(currentSlide, selectedLayer, 'rotation', parseFloat(e.target.value))} className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer" /><span className="text-xs text-gray-400">{layer.rotation}°</span></div>
                              <div><label className="text-xs text-gray-400">Opacity</label><input type="range" min="0" max="1" step="0.1" value={layer.opacity} onChange={(e) => updateLayerProperty(currentSlide, selectedLayer, 'opacity', parseFloat(e.target.value))} className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer" /><span className="text-xs text-gray-400">{Math.round(layer.opacity * 100)}%</span></div>
                              <div className="flex space-x-2 pt-2">
                                <button onClick={() => moveLayerUp(currentSlide, layer.id)} disabled={layer.zIndex === (Math.max(...(currentSlideData?.layers||[]).map(l=>l.zIndex)))} className="flex-1 p-2 bg-gray-600 text-white rounded text-xs hover:bg-gray-500 disabled:opacity-50"><ChevronUp className="w-4 h-4 mx-auto" /></button>
                                <button onClick={() => moveLayerDown(currentSlide, layer.id)} disabled={layer.zIndex === 0} className="flex-1 p-2 bg-gray-600 text-white rounded text-xs hover:bg-gray-500 disabled:opacity-50"><ChevronDown className="w-4 h-4 mx-auto" /></button>
                                <button onClick={() => { removeLayerFromSlide(currentSlide, layer.id); setSelectedLayer(null); }} className="flex-1 p-2 bg-red-600 text-white rounded text-xs hover:bg-red-700"><Trash2 className="w-4 h-4 mx-auto" /></button>
                              </div>
                            </div>
                          ); })() : (
                          <div className="text-center text-gray-400 text-sm py-8"><Layers className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Select a layer to edit properties</p><p className="text-xs mt-1">Click on a layer in the canvas or layer list</p></div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {images.map(image => (
                      <div key={image.id} className={`relative card-dark rounded-lg shadow-lg border-2 transition-all ${selectedImages.has(image.id) ? 'gradient-border ring-2 ring-purple-400/20' : 'hover:border-gray-500'}`}> <div className="aspect-square p-2"><img src={image.useProcessed && image.processed ? image.processed : image.original} alt={image.name} className="w-full h-full object-contain rounded cursor-pointer" onClick={() => toggleImageSelection(image.id)} /></div> <div className="absolute top-2 right-2 flex space-x-1"> {processingImages.has(image.id) && (<div className="p-1 bg-yellow-500 text-white rounded text-xs animate-pulse"><div className="w-3 h-3 border-2 border-white/70 border-t-transparent rounded-full animate-spin" /></div>)} {image.processed && (<button onClick={() => toggleBackgroundRemoval(image.id)} className={`p-1 rounded text-xs ${image.useProcessed ? 'bg-green-600 text-white' : 'bg-gray-600 text-white'}`} title={image.useProcessed ? 'Using AI-processed version' : 'Using original'}><RotateCcw className="w-3 h-3" /></button>)} <button onClick={() => manualBackgroundRemoval(image.id, 'ai')} disabled={processingImages.has(image.id)} className="p-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded text-xs hover:from-purple-700 hover:to-blue-700 disabled:opacity-50" title="Remove background (AI)"><Filter className="w-3 h-3" /></button> <button onClick={() => deleteImage(image.id)} className="p-1 bg-red-600 text-white rounded text-xs hover:bg-red-700" title="Delete image"><Trash2 className="w-3 h-3" /></button> </div> <div className="p-2 border-t border-gray-600"><p className="text-xs text-gray-300 truncate" title={image.name}>{image.name}</p>{image.searchMetadata && (<div className="flex items-center justify-between mt-1"><span className="text-lg font-bold text-green-400">{image.searchMetadata.price}</span><span className="text-sm text-gray-300">{image.searchMetadata.site}</span></div>)} </div> </div>
                    ))}
                                   </div>
                ) : (
                  <div className="card-dark rounded-lg shadow-lg p-8">
                    <div className="flex justify-center">{currentImage && (<div className="max-w-4xl max-h-96 flex items-center justify-center"><img src={currentImage.useProcessed && currentImage.processed ? currentImage.processed : currentImage.original} alt={currentImage.name} className="max-w-full max-h-full object-contain rounded-lg" /></div>)}</div>
                    <div className="mt-4 text-center"><h3 className="text-lg font-medium text-white">{currentImage?.name}</h3>{currentImage?.searchMetadata && (<div className="flex justify-center items-center space-x-4 mt-2"><span className="text-lg font-bold text-green-400">{currentImage.searchMetadata.price}</span><span className="text-sm text-gray-300">from {currentImage.searchMetadata.site}</span></div>)}<div className="flex justify-center mt-2">{currentImage?.processed && (<button onClick={() => toggleBackgroundRemoval(currentImage.id)} className={`btn-gradient-outline ${currentImage.useProcessed ? 'text-green-400' : ''}`}>{currentImage.useProcessed ? 'Background Removed' : 'Original'}</button>)}</div></div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* Project Management Modal */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card-dark rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-700/50">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">
                  {projectModalMode === 'create' && 'Create New Project'}
                  {projectModalMode === 'save' && 'Save Project'}
                  {projectModalMode === 'load' && 'Open Project'}
                </h3>
                <button 
                  onClick={() => {
                    setShowProjectModal(false);
                    setProjectName('');
                  }}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-600/30 rounded-lg transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[70vh]">
              {(projectModalMode === 'create' || projectModalMode === 'save') && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Project Name
                    </label>
                    <input
                      type="text"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder="Enter project name..."
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      autoFocus
                    />
                  </div>

                  {projectModalMode === 'save' && currentProject && (
                    <div className="p-3 bg-gray-700/30 rounded-lg border border-gray-600/30">
                      <p className="text-sm text-gray-300">
                        Current project: <span className="text-white font-medium">{currentProject.name}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Last saved: {new Date(currentProject.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center space-x-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      id="autoSave"
                      checked={autoSaveEnabled}
                      onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-purple-600 focus:ring-purple-500"
                    />
                    <label htmlFor="autoSave">Enable auto-save (saves every 2 seconds)</label>
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      onClick={() => {
                        if (projectModalMode === 'create') {
                          startNewProject();
                          if (projectName.trim()) {
                            createNewProject(projectName);
                          }
                        } else {
                          saveCurrentProject(projectName || undefined);
                        }
                      }}
                      disabled={isSaving}
                      className="flex-1 btn-gradient disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSaving ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin mr-2" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          {projectModalMode === 'create' ? 'Create Project' : 'Save Project'}
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setShowProjectModal(false);
                        setProjectName('');
                      }}
                      className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {projectModalMode === 'load' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">
                      {projects.length} saved project{projects.length !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={() => {
                        startNewProject();
                        setShowProjectModal(false);
                      }}
                      className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors"
                    >
                      Start Fresh
                    </button>
                  </div>

                  {/* Storage Usage Indicator */}
                  {(() => {
                    const usage = getStorageUsage();
                    const usedMB = (usage.used / (1024 * 1024)).toFixed(1);
                    const maxMB = (usage.max / (1024 * 1024)).toFixed(0);
                    const isHigh = usage.percentage > 80;
                    
                    return (
                      <div className={`p-3 rounded-lg border ${isHigh ? 'border-yellow-500/30 bg-yellow-500/10' : 'border-gray-600/30 bg-gray-700/30'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-sm font-medium ${isHigh ? 'text-yellow-200' : 'text-gray-300'}`}>
                            Storage Usage
                          </span>
                          {projects.length > 3 && (
                            <button
                              onClick={() => {
                                const cleaned = cleanupOldProjects();
                                if (cleaned && cleaned > 0) {
                                  alert(`Cleaned up ${cleaned} old project${cleaned !== 1 ? 's' : ''} to free space.`);
                                }
                              }}
                              className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors"
                            >
                              Cleanup Old
                            </button>
                          )}
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="flex-1 bg-gray-600 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full transition-all ${isHigh ? 'bg-yellow-400' : 'bg-purple-500'}`}
                              style={{ width: `${Math.min(100, usage.percentage)}%` }}
                            />
                          </div>
                          <span className={`text-xs ${isHigh ? 'text-yellow-200' : 'text-gray-400'}`}>
                            {usedMB} / {maxMB} MB
                          </span>
                        </div>
                        {isHigh && (
                          <p className="text-xs text-yellow-300 mt-1">
                            Storage nearly full. Consider cleaning up old projects or removing large images.
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {projects.length === 0 ? (
                    <div className="text-center py-8">
                      <FolderOpen className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-300">No saved projects</p>
                      <p className="text-sm text-gray-400 mt-1">Create a new project to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {projects.map((project) => (
                        <div
                          key={project.id}
                          className={`p-4 rounded-lg border transition-all cursor-pointer ${
                            currentProject?.id === project.id
                              ? 'border-purple-500 bg-purple-500/10'
                              : 'border-gray-600 bg-gray-700/30 hover:bg-gray-700/50 hover:border-gray-500'
                          }`}
                          onClick={() => loadProject(project)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-white font-medium">{project.name}</h4>
                              <p className="text-sm text-gray-400 mt-1">
                                Created: {new Date(project.createdAt).toLocaleDateString()}
                              </p>
                              <p className="text-sm text-gray-400">
                                Updated: {new Date(project.updatedAt).toLocaleString()}
                              </p>
                              <div className="flex items-center space-x-4 text-xs text-gray-500 mt-2">
                                <span>{project.data.images.length} images</span>
                                <span>{project.data.slides.length} slides</span>
                                <span>{project.data.slides.reduce((total, slide) => total + slide.layers.length, 0)} layers</span>
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              {currentProject?.id === project.id && (
                                <span className="px-2 py-1 bg-green-600/20 text-green-200 rounded text-xs">
                                  Current
                                </span>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Delete project "${project.name}"? This cannot be undone.`)) {
                                    deleteProject(project.id);
                                  }
                                }}
                                className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                title="Delete Project"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Auto-save Status Indicator */}
      {(currentProject || (images.length > 0 || slides.some(s => s.layers.length > 0))) && (
        <div className="fixed bottom-4 right-4 z-40">
          <div className="flex items-center space-x-2 px-3 py-2 bg-gray-800/90 backdrop-blur-sm rounded-lg border border-gray-600/30 text-sm">
            {currentProject ? (
              <>
                <div className={`w-2 h-2 rounded-full ${
                  lastSaved && new Date().getTime() - lastSaved.getTime() < 5000 
                    ? 'bg-green-400' 
                    : autoSaveEnabled 
                      ? 'bg-blue-400' 
                      : 'bg-yellow-400'
                }`}></div>
                <span className="text-gray-300">
                  {lastSaved && new Date().getTime() - lastSaved.getTime() < 5000 
                    ? 'Saved' 
                    : autoSaveEnabled 
                      ? 'Auto-saving...' 
                      : 'Auto-save off'
                  }
                </span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                <span className="text-gray-300">Unsaved changes</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MoodBoardApp;