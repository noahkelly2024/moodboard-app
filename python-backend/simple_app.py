from flask import Flask, request, jsonify
from flask_cors import CORS
import rembg
from rembg import remove, new_session
from PIL import Image
import io
import base64
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Global session variable
session = None

def base64_to_image(base64_string):
    """Convert base64 string to PIL Image."""
    try:
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        image_data = base64.b64decode(base64_string)
        image = Image.open(io.BytesIO(image_data))
        
        if image.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', image.size, (255, 255, 255))
            if image.mode == 'P':
                image = image.convert('RGBA')
            background.paste(image, mask=image.split()[-1] if image.mode in ('RGBA', 'LA') else None)
            image = background
        elif image.mode != 'RGB':
            image = image.convert('RGB')
            
        return image
    except Exception as e:
        logger.error(f"Error converting base64 to image: {e}")
        raise

def image_to_base64(image, format='PNG'):
    """Convert PIL Image to base64 string."""
    buffer = io.BytesIO()
    image.save(buffer, format=format)
    buffer.seek(0)
    image_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
    return f"data:image/{format.lower()};base64,{image_base64}"

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'rembg_version': rembg.__version__ if hasattr(rembg, '__version__') else 'unknown',
        'session_loaded': session is not None
    })

@app.route('/models', methods=['GET'])
def list_models():
    """List available rembg models."""
    # Common rembg models that are well-supported
    available_models = [
        'u2net',
        'u2net_human_seg',
        'u2net_cloth_seg', 
        'isnet-general-use',
        'silueta'
    ]
    
    return jsonify({
        'models': available_models,
        'default': 'u2net'
    })

@app.route('/remove-background', methods=['POST'])
def remove_background():
    """Remove background from uploaded image."""
    global session
    
    try:
        data = request.get_json()
        
        if not data or 'image' not in data:
            return jsonify({'error': 'No image data provided'}), 400
        
        # Get the model parameter, default to 'u2net'
        model_name = data.get('model', 'u2net')
        
        # Initialize session with the specified model
        if session is None or getattr(session, '_model_name', None) != model_name:
            logger.info(f"Creating rembg session with model: {model_name}")
            try:
                session = new_session(model_name)
                session._model_name = model_name  # Track the current model
            except Exception as model_error:
                logger.warning(f"Failed to create session with model {model_name}: {model_error}")
                # Fallback to u2net
                logger.info("Falling back to u2net model")
                session = new_session('u2net')
                session._model_name = 'u2net'
        
        # Convert base64 to image
        input_image = base64_to_image(data['image'])
        logger.info(f"Processing image of size: {input_image.size} with model: {getattr(session, '_model_name', 'unknown')}")
        
        # Remove background using rembg
        logger.info("Removing background with rembg...")
        output_image = remove(input_image, session=session)
        
        # Convert back to base64
        result_base64 = image_to_base64(output_image, 'PNG')
        
        logger.info("Background removal completed successfully")
        return jsonify({
            'success': True,
            'image': result_base64,
            'model_used': getattr(session, '_model_name', 'unknown'),
            'original_size': input_image.size,
            'output_size': output_image.size
        })
        
    except Exception as e:
        logger.error(f"Error in remove_background: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    logger.info("Starting simple rembg background removal server...")
    
    try:
        logger.info("Preloading rembg model...")
        session = new_session('u2net')
        logger.info("Model preloaded successfully")
    except Exception as e:
        logger.error(f"Failed to preload model: {e}")
        session = None
    
    app.run(
        host='127.0.0.1',
        port=5000,
        debug=False,
        threaded=True
    )
