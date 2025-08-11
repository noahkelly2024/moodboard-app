export interface ImageType {
  id: string | number;
  original: string;
  processed: string | null;
  name: string;
  useProcessed: boolean;
  searchMetadata?: {
    price: string;
    site: string;
    url: string;
  };
}

export interface Layer {
  id: string | number;
  imageId?: string | number;
  type: 'image' | 'text';
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  opacity: number;
  zIndex: number;
  // Text-specific properties
  text?: string;
  fontSize?: number;
  fontColor?: string;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
}

export interface Slide {
  id: number;
  layers: Layer[];
  backgroundColor: string;
}

export interface SearchResult {
  id: string;
  title: string;
  price: string;
  originalPrice?: string | null;
  site: string;
  image: string;
  url: string;
  category: string;
  style: string;
  inStock: boolean;
}

export interface SearchFilters {
  category: string;
  priceRange: string;
  style: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  data: ProjectData;
}

export interface ProjectData {
  images: ImageType[];
  slides: Slide[];
  currentSlide: number;
  viewMode: 'grid' | 'slideshow' | 'preview';
  compositionMode: boolean;
  slideInterval: number;
  favorites: string[];
  rembgModel: string;
}
