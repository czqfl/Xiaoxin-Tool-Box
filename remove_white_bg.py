from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import os

def create_rounded_rect_mask(size, radius, border_padding=0):
    """创建一个圆角矩形掩码"""
    w, h = size
    mask = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(mask)
    
    # 计算圆角矩形的位置
    left = border_padding
    top = border_padding
    right = w - border_padding
    bottom = h - border_padding
    
    # 绘制圆角矩形
    draw.rounded_rectangle([left, top, right, bottom], radius=radius, fill=255)
    
    return mask

def remove_background_precise(input_path, output_path):
    """
    精确去除白色背景：
    1. 找到蓝色图标的边界
    2. 创建圆角矩形掩码
    3. 应用掩码实现透明背景
    """
    img = Image.open(input_path).convert('RGBA')
    w, h = img.size
    data = np.array(img)
    
    print(f"图片尺寸: {w}x{h}")
    
    # 找到非白色区域的边界（蓝色图标）
    # 白色判断：R>240, G>240, B>240
    is_white = (data[:,:,0] > 240) & (data[:,:,1] > 240) & (data[:,:,2] > 240)
    is_icon = ~is_white
    
    # 找到图标的边界
    rows = np.any(is_icon, axis=1)
    cols = np.any(is_icon, axis=0)
    
    top, bottom = np.where(rows)[0][[0, -1]]
    left, right = np.where(cols)[0][[0, -1]]
    
    print(f"图标边界: top={top}, bottom={bottom}, left={left}, right={right}")
    print(f"图标大小: {right-left+1} x {bottom-top+1}")
    
    # 计算圆角半径（根据图标大小估计）
    icon_width = right - left + 1
    icon_height = bottom - top + 1
    
    # 圆角半径大约是宽度的 1/6
    radius = int(min(icon_width, icon_height) * 0.18)
    print(f"估计圆角半径: {radius}")
    
    # 创建掩码 - 稍微扩大一点范围，确保包含整个图标
    padding = 2
    mask = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(mask)
    
    # 绘制圆角矩形
    rect_left = left - padding
    rect_top = top - padding
    rect_right = right + padding
    rect_bottom = bottom + padding
    
    draw.rounded_rectangle(
        [rect_left, rect_top, rect_right, rect_bottom],
        radius=radius + padding,
        fill=255
    )
    
    # 对掩码进行轻微模糊，实现抗锯齿边缘
    mask = mask.filter(ImageFilter.GaussianBlur(radius=1))
    
    # 应用掩码
    result = img.copy()
    result.putalpha(mask)
    
    # 保存
    result.save(output_path, 'PNG')
    print(f"已保存: {output_path}")
    
    # 验证
    result_data = np.array(result)
    alpha = result_data[:,:,3]
    print(f"透明像素: {np.sum(alpha == 0)} ({np.sum(alpha==0)/(w*h)*100:.1f}%)")
    print(f"半透明像素: {np.sum((alpha > 0) & (alpha < 255))}")
    
    return result

def resize_icon(input_img, size, output_path):
    """调整图标尺寸"""
    resized = input_img.resize((size, size), Image.LANCZOS)
    resized.save(output_path, 'PNG')
    print(f"已生成 {size}x{size}: {output_path}")

def create_ico(input_path, output_path, sizes=[16, 32, 48, 64, 128, 256]):
    """创建 ICO 文件"""
    img = Image.open(input_path).convert('RGBA')
    icon_sizes = []
    for size in sizes:
        resized = img.resize((size, size), Image.LANCZOS)
        icon_sizes.append(resized)
    icon_sizes[0].save(output_path, format='ICO', sizes=[(s, s) for s in sizes])
    print(f"已生成 ICO: {output_path}")

# 主程序
if __name__ == "__main__":
    base_dir = r"D:\MyCustomTools\XiaoxinToolBox\src-tauri\icons"
    original_icon = os.path.join(base_dir, "icon_new.png")
    transparent_icon = os.path.join(base_dir, "icon_transparent_final.png")
    
    # 1. 精确处理主图标
    print("正在精确处理主图标...")
    main_icon = remove_background_precise(original_icon, transparent_icon)
    
    # 2. 生成各种尺寸的图标
    print("\n正在生成各种尺寸图标...")
    
    # 基础尺寸
    sizes = [32, 64, 128]
    for size in sizes:
        output = os.path.join(base_dir, f"{size}x{size}.png")
        resize_icon(main_icon, size, output)
    
    # 128@2x (256x256)
    resize_icon(main_icon, 256, os.path.join(base_dir, "128x128@2x.png"))
    
    # Windows 方形图标
    windows_sizes = [30, 44, 71, 89, 107, 142, 150, 284, 310]
    for size in windows_sizes:
        output = os.path.join(base_dir, f"Square{size}x{size}Logo.png")
        resize_icon(main_icon, size, output)
    
    # StoreLogo (50x50)
    resize_icon(main_icon, 50, os.path.join(base_dir, "StoreLogo.png"))
    
    # 3. 生成 ICO 文件
    print("\n正在生成 ICO 文件...")
    create_ico(transparent_icon, os.path.join(base_dir, "icon.ico"))
    
    # 4. Android 图标
    print("\n正在生成 Android 图标...")
    android_sizes = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192
    }
    
    for folder, size in android_sizes.items():
        folder_path = os.path.join(base_dir, "android", folder)
        os.makedirs(folder_path, exist_ok=True)
        
        resize_icon(main_icon, size, os.path.join(folder_path, "ic_launcher.png"))
        resize_icon(main_icon, size, os.path.join(folder_path, "ic_launcher_round.png"))
        
        fg_size = int(size * 1.5)
        resize_icon(main_icon, fg_size, os.path.join(folder_path, "ic_launcher_foreground.png"))
    
    # 5. iOS 图标
    print("\n正在生成 iOS 图标...")
    ios_sizes = [
        ("AppIcon-20x20@1x.png", 20),
        ("AppIcon-20x20@2x.png", 40),
        ("AppIcon-20x20@2x-1.png", 40),
        ("AppIcon-20x20@3x.png", 60),
        ("AppIcon-29x29@1x.png", 29),
        ("AppIcon-29x29@2x.png", 58),
        ("AppIcon-29x29@2x-1.png", 58),
        ("AppIcon-29x29@3x.png", 87),
        ("AppIcon-40x40@1x.png", 40),
        ("AppIcon-40x40@2x.png", 80),
        ("AppIcon-40x40@2x-1.png", 80),
        ("AppIcon-40x40@3x.png", 120),
        ("AppIcon-60x60@2x.png", 120),
        ("AppIcon-60x60@3x.png", 180),
        ("AppIcon-76x76@1x.png", 76),
        ("AppIcon-76x76@2x.png", 152),
        ("AppIcon-83.5x83.5@2x.png", 167),
        ("AppIcon-512@2x.png", 1024),
    ]
    
    ios_folder = os.path.join(base_dir, "ios")
    os.makedirs(ios_folder, exist_ok=True)
    
    for filename, size in ios_sizes:
        output = os.path.join(ios_folder, filename)
        resize_icon(main_icon, size, output)
    
    print("\n✅ 所有图标处理完成！")
