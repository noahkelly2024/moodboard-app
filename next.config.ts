import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config: any, { isServer, webpack }: { isServer: boolean, webpack: any }) => {
    // Add support for WASM files
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    
    // Add rule for WASM files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });

    // Fix for pptxgenjs - provide fallbacks for Node.js modules in browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        https: false,
        http: false,
        stream: false,
        crypto: false,
        url: false,
        buffer: false,
        util: false,
        querystring: false,
        path: false,
        os: false,
        net: false,
        tls: false,
        child_process: false,
      };
    }
    
    // Only apply Node.js polyfills on client-side
    if (!isServer) {
      // Fix for pptxgenjs Node.js modules in browser
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        stream: false,
        constants: false,
        assert: false,
        util: false,
        buffer: false,
        events: false,
        https: false,
        http: false,
        url: false,
        querystring: false,
        crypto: false,
        zlib: false,
        os: false,
        tty: false,
        child_process: false,
      };

      // Add externals to ignore Node.js modules
      config.externals = [
        ...config.externals,
        function({ request }: { request: string }, callback: any) {
          // Ignore pptxgenjs on client side but allow it to be loaded via dynamic import
          if (request === 'pptxgenjs') {
            return callback(null, 'undefined');
          }
          callback();
        },
      ];
      
      // Add a plugin to ignore specific modules during build
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^pptxgenjs$/,
        })
      );
    }
    
    return config;
  },
  
  // Configure headers for WASM and model files
  async headers() {
    return [
      {
        source: '/models/:path*',
        headers: [
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
        ],
      },
      {
        source: '/(.*)\\.wasm',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/wasm',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
