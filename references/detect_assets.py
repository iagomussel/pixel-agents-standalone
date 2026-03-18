from PIL import Image
import os

def detect_assets(image_path):
    if not os.path.exists(image_path):
        print(f"Error: {image_path} not found.")
        return

    img = Image.open(image_path).convert('RGBA')
    width, height = img.size
    pixels = img.load()

    # Find non-transparent areas
    visited = set()
    rects = []

    for y in range(height):
        for x in range(width):
            if pixels[x, y][3] > 0 and (x, y) not in visited:
                # New block found, expand to find the bounding box
                min_x, min_y, max_x, max_y = x, y, x, y
                stack = [(x, y)]
                visited.add((x, y))
                while stack:
                    curr_x, curr_y = stack.pop()
                    min_x = min(min_x, curr_x)
                    max_x = max(max_x, curr_x)
                    min_y = min(min_y, curr_y)
                    max_y = max(max_y, curr_y)
                    
                    # Check 4 cardinal neighbors
                    for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        nx, ny = curr_x + dx, curr_y + dy
                        if 0 <= nx < width and 0 <= ny < height and \
                           pixels[nx, ny][3] > 0 and (nx, ny) not in visited:
                            visited.add((nx, ny))
                            stack.append((nx, ny))
                rects.append((min_x, min_y, max_x - min_x + 1, max_y - min_y + 1))

    print(f"File: {image_path} ({width}x{height})")
    print(f"Found {len(rects)} individual assets:")
    for i, (rx, ry, rw, rh) in enumerate(rects):
        print(f"Asset {i}: x={rx}, y={ry}, w={rw}, h={rh}")

if __name__ == "__main__":
    # Path to the trees asset
    target = 'webview-ui/public/assets/exterior/Trees.png'
    detect_assets(target)
