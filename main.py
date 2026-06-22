import os
from flask import Flask, render_template, request
import yt_dlp

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    video_url = request.form.get('url')
    if not video_url:
        return "URL is missing"

    ydl_opts = {
        'format': 'best',
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'no_color': True,
        'rm_cachedir': True,  # Automatically clears cache after every use
        'youtube_include_dash_manifest': False,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # We don't download, just extract info
            info = ydl.extract_info(video_url, download=False)
            all_formats = info.get('formats', [])
            
            # Resolution mapping
            res_map = {
                144: "144p",
                240: "240p",
                360: "360p",
                480: "480p",
                720: "720p",
                1080: "1080p",
                1440: "2K",
                2160: "4K",
                4320: "8K"
            }
            
            # We'll store the best format per mapped resolution
            categorized = {}
            audio_formats = []
            
            for f in all_formats:
                url = f.get('url')
                if not url:
                    continue
                
                h = f.get('height')
                # Video formats
                if h in res_map:
                    label = res_map[h]
                    # Keep the one with better bitrate/quality indicator if exists
                    if label not in categorized or f.get('tbr', 0) > categorized[label].get('tbr', 0):
                        categorized[label] = {
                            'res': label,
                            'ext': f.get('ext', 'mp4'),
                            'url': url,
                            'tbr': f.get('tbr', 0)
                        }
                # Audio formats
                elif f.get('vcodec') == 'none' and f.get('acodec') != 'none':
                    audio_formats.append({
                        'res': 'Audio',
                        'ext': f.get('ext', 'mp3'),
                        'url': url,
                        'abr': f.get('abr', 0)
                    })
            
            # Sort video formats by resolution height
            sorted_res = sorted(categorized.keys(), key=lambda x: [k for k, v in res_map.items() if v == x][0], reverse=True)
            processed_formats = [categorized[res] for res in sorted_res]
            
            # Get best audio format
            if audio_formats:
                best_audio = max(audio_formats, key=lambda x: x.get('abr', 0))
                processed_formats.append(best_audio)
            
            return render_template('index.html', info=info, formats=processed_formats)
    except Exception as e:
        return f"Error: {str(e)}"

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 10000))
    # Setting debug=True for local troubleshooting.
    app.run(host='0.0.0.0', port=port, debug=True)
